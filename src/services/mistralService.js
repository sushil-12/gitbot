import axios from 'axios';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';

dotenv.config();

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const MISTRAL_API_URL = 'https://api.mistral.ai/v1';
const MISTRAL_MODEL = process.env.MISTRAL_MODEL || 'mistral-small'; // Default model
const MISTRAL_REQUEST_TIMEOUT = parseInt(process.env.MISTRAL_REQUEST_TIMEOUT, 10) || 120000; // 2 minutes default

const serviceName = 'MistralService';

/**
 * Checks if the Mistral API is accessible and the API key is valid.
 * @returns {Promise<boolean>} True if API is accessible and key is valid, false otherwise.
 */
export async function checkMistralStatus() {
  try {
    if (!MISTRAL_API_KEY) {
      logger.error('Mistral API key is not configured.', { service: serviceName });
      return false;
    }

    // Check if API is accessible by making a simple request
    const response = await axios.get(`${MISTRAL_API_URL}/models`, {
      headers: {
        'Authorization': `Bearer ${MISTRAL_API_KEY}`
      },
      timeout: 5000
    });

    const models = response.data.data;
    const modelExists = models.some(m => m.id === MISTRAL_MODEL);

    if (modelExists) {
      logger.info(`Mistral model '${MISTRAL_MODEL}' is available.`, { service: serviceName });
      return true;
    } else {
      logger.warn(`Mistral model '${MISTRAL_MODEL}' not found. Available models: ${models.map(m => m.id).join(', ')}`, { service: serviceName });
      return false;
    }
  } catch (error) {
    if (error.response?.status === 401) {
      logger.error('Invalid Mistral API key.', { service: serviceName });
    } else {
      logger.error('Error checking Mistral API status:', {
        message: error.message,
        status: error.response?.status,
        service: serviceName
      });
    }
    return false;
  }
}

/**
 * Sends a prompt to the Mistral LLM and gets a response.
 * @param {string} prompt - The prompt to send to the LLM.
 * @param {string} systemMessage - (Optional) A system message to guide the LLM's behavior.
 * @param {object} options - (Optional) Additional options for the Mistral API.
 * @returns {Promise<string|null>} The LLM's response content, or null if an error occurs.
 */
export async function generateResponse(prompt, systemMessage = null, options = {}) {
  if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
    logger.error('Prompt cannot be empty.', { service: serviceName });
    return null;
  }

  const messages = [];
  if (systemMessage) {
    messages.push({ role: 'system', content: systemMessage });
  }
  messages.push({ role: 'user', content: prompt });

  const requestBody = {
    model: MISTRAL_MODEL,
    messages: messages,
    temperature: options.temperature || 0.7,
    top_p: options.top_p || 0.9,
    max_tokens: options.max_tokens || 4096,
    stream: false
  };

  logger.info(`Sending prompt to Mistral model '${MISTRAL_MODEL}'. Prompt: "${prompt.substring(0, 100)}..."`, { service: serviceName });
  logger.debug('Mistral request body:', { requestBody, service: serviceName });

  try {
    const response = await axios.post(`${MISTRAL_API_URL}/chat/completions`, requestBody, {
      headers: {
        'Authorization': `Bearer ${MISTRAL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: MISTRAL_REQUEST_TIMEOUT
    });

    if (response.data && response.data.choices && response.data.choices[0]?.message?.content) {
      logger.info('Received response from Mistral.', { service: serviceName });
      logger.debug('Mistral raw response data:', { responseData: response.data, service: serviceName });
      return response.data.choices[0].message.content.trim();
    } else {
      logger.error('Invalid or empty response from Mistral.', { responseData: response.data, service: serviceName });
      return null;
    }
  } catch (error) {
    logger.error('Error communicating with Mistral API:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      requestBody,
      service: serviceName
    });
    return null;
  }
}

/**
 * Parses a natural language query to identify intent and entities for Git/GitHub actions.
 * @param {string} naturalLanguageQuery - The user's query in plain English.
 * @returns {Promise<object|null>} An object representing the parsed intent and entities, or null.
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
- push_changes: Push local changes to a remote repository.
  - entities: commit_message (string), branch (string), remote (string, default "origin")
- git_init: Initialize a new Git repository locally.
  - entities: (none)
- git_add: Stage changes for commit.
  - entities: files (string or array of strings, default "." for all changes)
- git_commit: Commit staged changes locally.
  - entities: commit_message (string)
- git_status: Show the working tree status.
  - entities: (none)
- git_revert_last_commit: Revert the last commit.
  - entities: no_edit (boolean, default false)
`;

  const prompt = `User query: "${naturalLanguageQuery}"\n\nJSON response:`;

  try {
    logger.info(`Parsing intent for query: "${naturalLanguageQuery}"`, { service: serviceName });
    const responseText = await generateResponse(prompt, systemPrompt, { temperature: 0.2 });

    if (!responseText) {
      logger.error('No response from LLM for intent parsing.', { service: serviceName });
      return { intent: 'unknown', entities: { error: 'LLM did not respond' } };
    }

    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      const jsonResponse = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(responseText);
      logger.info('Successfully parsed intent.', { intent: jsonResponse.intent, entities: jsonResponse.entities, service: serviceName });
      return jsonResponse;
    } catch (parseError) {
      logger.error('Failed to parse JSON response from LLM:', {
        responseText,
        error: parseError.message,
        service: serviceName
      });
      return { intent: 'unknown', entities: { error: 'Failed to parse LLM response', raw_response: responseText } };
    }
  } catch (error) {
    logger.error('Error during intent parsing with Mistral:', { message: error.message, service: serviceName });
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
    logger.error('Error generating .gitignore with Mistral:', { message: error.message, service: serviceName });
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
`;

  const prompt = `Code diff:\n\`\`\`diff\n${diffOutput}\n\`\`\`\n\nSuggested commit message:`;

  try {
    logger.info('Generating commit message from diff...', { service: serviceName });
    const commitMessage = await generateResponse(prompt, systemPrompt, { temperature: 0.5 });
    if (commitMessage) {
      logger.info(`Commit message generated: "${commitMessage}"`, { service: serviceName });
      return commitMessage.replace(/^["']|["']$/g, '');
    }
    logger.warn('LLM did not return content for commit message generation.', { service: serviceName });
    return null;
  } catch (error) {
    logger.error('Error generating commit message with Mistral:', { message: error.message, service: serviceName });
    return null;
  }
} 