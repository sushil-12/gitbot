import axios from 'axios';
import dotenv from 'dotenv';
import logger from '../src/utils/logger.js';

dotenv.config();

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3'; // Default model
const OLLAMA_REQUEST_TIMEOUT = parseInt(process.env.OLLAMA_REQUEST_TIMEOUT, 10) || 120000; // 2 minutes default

const serviceName = 'OllamaService';

/**
 * Checks if the Ollama server is running and the specified model is available.
 * @returns {Promise<boolean>} True if server is up and model is available, false otherwise.
 */
export async function checkOllamaStatus() {
  try {
    // Check if server is running
    await axios.get(OLLAMA_BASE_URL, { timeout: 5000 }); // Short timeout for server check
    logger.info(`Ollama server is responsive at ${OLLAMA_BASE_URL}.`, { service: serviceName });

    // Check if model is available
    const response = await axios.get(`${OLLAMA_BASE_URL}/api/tags`, { timeout: 10000 });
    const models = response.data.models;
    const modelExists = models.some(m => m.name.startsWith(OLLAMA_MODEL));

    if (modelExists) {
      logger.info(`Ollama model '${OLLAMA_MODEL}' is available.`, { service: serviceName });
      return true;
    } else {
      logger.warn(`Ollama model '${OLLAMA_MODEL}' not found. Available models: ${models.map(m => m.name).join(', ')}`, { service: serviceName });
      return false;
    }
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
        logger.error(`Ollama server not reachable at ${OLLAMA_BASE_URL}. Ensure Ollama is running.`, { service: serviceName });
    } else {
        logger.error('Error checking Ollama status or model availability:', {
            message: error.message,
            url: error.config?.url,
            service: serviceName,
        });
    }
    return false;
  }
}

/**
 * Sends a prompt to the Ollama LLM and gets a response.
 * @param {string} prompt - The prompt to send to the LLM.
 * @param {string} systemMessage - (Optional) A system message to guide the LLM's behavior.
 * @param {object} options - (Optional) Additional options for the Ollama API (e.g., temperature, top_p).
 * @returns {Promise<string|null>} The LLM's response content, or null if an error occurs.
 */
export async function generateResponse(prompt, systemMessage = null, options = {}) {
  if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
    logger.error('Prompt cannot be empty.', { service: serviceName });
    return null;
  }

  const requestBody = {
    model: OLLAMA_MODEL,
    prompt: prompt,
    stream: false, // We want the full response, not a stream for this function
    ...(systemMessage && { system: systemMessage }),
    options: {
      num_ctx: options.num_ctx || 4096, // Context window size
      temperature: options.temperature || 0.7,
      top_p: options.top_p || 0.9,
      ...options, // Allow overriding default options
    },
  };

  logger.info(`Sending prompt to Ollama model '${OLLAMA_MODEL}'. Prompt: "${prompt.substring(0, 100)}..."`, { service: serviceName });
  logger.debug('Ollama request body:', { requestBody, service: serviceName });


  try {
    const response = await axios.post(`${OLLAMA_BASE_URL}/api/generate`, requestBody, {
      timeout: OLLAMA_REQUEST_TIMEOUT,
    });

    if (response.data && response.data.response) {
      logger.info('Received response from Ollama.', { service: serviceName });
      logger.debug('Ollama raw response data:', { responseData: response.data, service: serviceName });
      return response.data.response.trim();
    } else {
      logger.error('Invalid or empty response from Ollama.', { responseData: response.data, service: serviceName });
      return null;
    }
  } catch (error) {
    logger.error('Error communicating with Ollama API:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      requestBody,
      service: serviceName,
    });
    if (error.code === 'ECONNREFUSED') {
        throw new Error(`Ollama server not reachable at ${OLLAMA_BASE_URL}. Ensure Ollama is running and the model '${OLLAMA_MODEL}' is available.`);
    }
    if (error.response?.data?.error?.includes("model") && error.response?.data?.error?.includes("not found")) {
        throw new Error(`Ollama model '${OLLAMA_MODEL}' not found. Please ensure it's downloaded (e.g., 'ollama pull ${OLLAMA_MODEL}').`);
    }
    return null;
  }
}

/**
 * Parses a natural language query to identify intent and entities for Git/GitHub actions.
 * This is a conceptual function. The actual prompt engineering will be crucial.
 * @param {string} naturalLanguageQuery - The user's query in plain English.
 * @returns {Promise<object|null>} An object representing the parsed intent and entities, or null.
 * Example: { intent: 'create_repo', entities: { repo_name: 'my-new-project', private: true } }
 */
export async function parseIntent(naturalLanguageQuery) {
  const systemPrompt = `
You are an expert at interpreting natural language commands for Git and GitHub operations.
Your task is to identify the user's intent and extract relevant entities.
Respond ONLY with a JSON object containing "intent" and "entities".
If an entity is not present, do not include it in the entities object.
For boolean entities like 'private', use true/false.
If the intent is unclear or cannot be mapped to a defined action, respond with intent: "unknown".

Possible intents and their typical entities:
- create_repo: Create a new repository.
  - entities: repo_name (string), description (string), private (boolean, default false)
- list_repos: List user's repositories.
  - entities: visibility (string: "all", "owner", "public", "private", "member"), sort_by (string: "created", "updated", "pushed", "full_name"), direction (string: "asc", "desc")
- push_changes: Push local changes to a remote repository. This often implies prior add and commit.
  - entities: commit_message (string), branch (string), remote (string, default "origin")
  - If a commit message is provided, it implies changes should be added and committed first.
  - If no branch is specified, assume current branch.
- pull_changes: Pull changes from a remote repository.
  - entities: branch (string), remote (string, default "origin"), rebase (boolean, default false)
- create_branch: Create a new local branch.
  - entities: branch_name (string), base_branch (string, optional, for starting point)
- create_pr: Create a pull request on GitHub.
  - entities: title (string), head_branch (string), base_branch (string), body (string, optional)
- git_init: Initialize a new Git repository locally.
  - entities: (none)
- git_add: Stage changes for commit.
  - entities: files (string or array of strings, default "." for all changes)
- git_commit: Commit staged changes locally.
  - entities: commit_message (string)
- git_status: Show the working tree status.
- entities: (none)
- git_revert_last_commit: Revert the changes introduced by the last commit.
  - entities: no_edit (boolean, default false, to skip editor), commit_hash (string, optional, to revert a specific commit instead of HEAD)
- git_merge_branch: Merge a specified branch into the current or another target branch.
  - entities: branch_to_merge (string, required), target_branch (string, optional, defaults to current), squash (boolean, default false), no_ff (boolean, default false), commit_message (string, optional)
- unknown: If the intent cannot be determined.

Examples:

User query: "Create a new private repository called 'my-awesome-app' with description 'This is a test'."
JSON response:
{
"intent": "create_repo",
"entities": {
  "repo_name": "my-awesome-app",
  "description": "This is a test",
  "private": true
}
}

User query: "Push my latest work to the main branch with message 'feat: add login'."
JSON response:
{
"intent": "push_changes",
"entities": {
  "commit_message": "feat: add login",
  "branch": "main"
}
}

User query: "upload these changes"
JSON response:
{
"intent": "push_changes",
"entities": {}
}

User query: "i need to push this code to server"
JSON response:
{
"intent": "push_changes",
"entities": {}
}

User query: "save my work with commit 'refactor: improve performance'"
JSON response:
{
"intent": "git_commit",
"entities": {
  "commit_message": "refactor: improve performance"
}
}

User query: "add all files"
JSON response:
{
"intent": "git_add",
"entities": {
  "files": "."
}
}

User query: "show me what changed"
JSON response:
{
"intent": "git_status",
"entities": {}
}

User query: "revert the last commit i made"
JSON response:
{
"intent": "git_revert_last_commit",
"entities": {}
}

User query: "undo my last changes"
JSON response:
{
"intent": "git_revert_last_commit",
"entities": {}
}

User query: "revert commit abc123xyz without editing the message"
JSON response:
{
"intent": "git_revert_last_commit",
"entities": {
  "commit_hash": "abc123xyz",
  "no_edit": true
}
}

User query: "merge the feature-branch into develop"
JSON response:
{
"intent": "git_merge_branch",
"entities": {
  "branch_to_merge": "feature-branch",
  "target_branch": "develop"
}
}

User query: "integrate new-feature"
JSON response:
{
"intent": "git_merge_branch",
"entities": {
  "branch_to_merge": "new-feature"
}
}

User query: "merge hotfix-123 into main and don't fast forward"
JSON response:
{
"intent": "git_merge_branch",
"entities": {
  "branch_to_merge": "hotfix-123",
  "target_branch": "main",
  "no_ff": true
}
}

User query: "Create a pull request from 'dev' to 'main' titled 'Release v1.0'"
JSON response:
{
"intent": "create_pr",
"entities": {
  "head_branch": "dev",
  "base_branch": "main",
  "title": "Release v1.0"
}
}
`;

  const prompt = `User query: "${naturalLanguageQuery}"\n\nJSON response:`;

  try {
    logger.info(`Parsing intent for query: "${naturalLanguageQuery}"`, { service: serviceName });
    const responseText = await generateResponse(prompt, systemPrompt, { temperature: 0.2 }); // Lower temp for more deterministic JSON

    if (!responseText) {
      logger.error('No response from LLM for intent parsing.', { service: serviceName });
      return { intent: 'unknown', entities: { error: 'LLM did not respond' } };
    }

    // Attempt to parse the JSON response from the LLM
    // The LLM might sometimes return text around the JSON, so try to extract it.
    let jsonResponse;
    try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/); // Try to find JSON block
        if (jsonMatch && jsonMatch[0]) {
            jsonResponse = JSON.parse(jsonMatch[0]);
        } else {
            // Fallback if no clear JSON block is found, try parsing the whole thing
            jsonResponse = JSON.parse(responseText);
        }
    } catch (parseError) {
      logger.error('Failed to parse JSON response from LLM for intent parsing.', {
        responseText,
        error: parseError.message,
        service: serviceName,
      });
      return { intent: 'unknown', entities: { error: 'Failed to parse LLM response', raw_response: responseText } };
    }

    logger.info('Successfully parsed intent.', { intent: jsonResponse.intent, entities: jsonResponse.entities, service: serviceName });
    return jsonResponse;

  } catch (error) {
    logger.error('Error during intent parsing with Ollama:', { message: error.message, service: serviceName });
    return { intent: 'unknown', entities: { error: error.message } };
  }
}

/**
 * Generates a .gitignore file content based on project type or keywords.
 * @param {string} projectDescription - e.g., "Node.js, React, Python Django"
 * @returns {Promise<string|null>} The generated .gitignore content or null.
 */
export async function generateGitignore(projectDescription) {
    const systemPrompt = `
You are an expert at generating .gitignore files.
Based on the provided project description or keywords, generate a comprehensive .gitignore file.
Include common patterns for operating systems, IDEs, dependency directories, log files, and build outputs relevant to the technologies mentioned.
Respond ONLY with the content of the .gitignore file. Do not include any other text, explanations, or markdown formatting.
`;
    const prompt = `Project description: "${projectDescription}"\n\n.gitignore content:`;

    try {
        logger.info(`Generating .gitignore for: "${projectDescription}"`, { service: serviceName });
        const gitignoreContent = await generateResponse(prompt, systemPrompt, { temperature: 0.3 });
        if (gitignoreContent) {
            logger.info('.gitignore content generated successfully.', { service: serviceName });
            return gitignoreContent;
        }
        logger.warn('LLM did not return content for .gitignore generation.', { service: serviceName });
        return null;
    } catch (error) {
        logger.error('Error generating .gitignore with Ollama:', { message: error.message, service: serviceName });
        return null;
    }
}

/**
 * Generates a commit message based on code diff.
 * @param {string} diffOutput - The output of 'git diff'.
 * @returns {Promise<string|null>} A suggested commit message or null.
 */
export async function generateCommitMessage(diffOutput) {
    if (!diffOutput || diffOutput.trim() === '') {
        logger.info('Diff output is empty, cannot generate commit message.', { service: serviceName });
        return "chore: no changes detected";
    }
    const systemPrompt = `
You are an expert at writing concise and informative Git commit messages based on code diffs.
Follow conventional commit guidelines (e.g., "feat: ...", "fix: ...", "docs: ...", "style: ...", "refactor: ...", "perf: ...", "test: ...", "chore: ...").
The commit message should be a single line, ideally 50 characters or less, but no more than 72 characters.
Do not include any explanations or surrounding text, only the commit message itself.

Example diff:
\`\`\`diff
--- a/src/utils/logger.js
+++ b/src/utils/logger.js
@@ -1,5 +1,6 @@
 import winston from 'winston';
 import dotenv from 'dotenv';
+import path from 'path'; // Added path import

 dotenv.config();
\`\`\`
Example commit message: "chore: add path import to logger utility"
`;
    const prompt = `Code diff:\n\`\`\`diff\n${diffOutput}\n\`\`\`\n\nSuggested commit message:`;

    try {
        logger.info('Generating commit message from diff...', { service: serviceName });
        const commitMessage = await generateResponse(prompt, systemPrompt, { temperature: 0.5 });
        if (commitMessage) {
            logger.info(`Commit message generated: "${commitMessage}"`, { service: serviceName });
            // Basic cleanup: remove potential quotes LLM might add
            return commitMessage.replace(/^["']|["']$/g, '');
        }
        logger.warn('LLM did not return content for commit message generation.', { service: serviceName });
        return null;
    } catch (error) {
        logger.error('Error generating commit message with Ollama:', { message: error.message, service: serviceName });
        return null;
    }
}

// TODO: Add more AI-powered features:
// - AI-assisted merge conflict resolution (suggest changes)
// - Daily commit reminders (this might be more of a scheduling + notification task)
// - Visual commit tree preview (this is a UI task, LLM might describe structure)