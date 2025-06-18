import axios from 'axios';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';

dotenv.config();

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const MISTRAL_API_URL = 'https://api.mistral.ai/v1';
const MISTRAL_MODEL = process.env.MISTRAL_MODEL || 'mistral-small';
const MISTRAL_REQUEST_TIMEOUT = parseInt(process.env.MISTRAL_REQUEST_TIMEOUT, 10) || 120000;
const MISTRAL_MAX_RETRIES = parseInt(process.env.MISTRAL_MAX_RETRIES, 10) || 2;
const MISTRAL_RETRY_DELAY = parseInt(process.env.MISTRAL_RETRY_DELAY, 10) || 1000;

const serviceName = 'MistralService';

// Default templates
const DEFAULT_GITIGNORE = `# Default gitignore
*.log
*.tmp
*.swp
.DS_Store
.idea/
.vscode/
node_modules/
dist/
build/
.env
*.env.local
`;

/**
 * Checks if the Mistral API is accessible and the API key is valid.
 * @returns {Promise<boolean>} True if API is accessible and key is valid, false otherwise.
 */
export async function checkMistralStatus() {
  try {
    if (!MISTRAL_API_KEY) {
      logger.technical.error('Mistral API key is not configured.', { service: serviceName });
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
      logger.technical.info(`Mistral model '${MISTRAL_MODEL}' is available.`, { service: serviceName });
      return true;
    } else {
      logger.technical.warn(`Mistral model '${MISTRAL_MODEL}' not found. Available models: ${models.map(m => m.id).join(', ')}`, { service: serviceName });
      return false;
    }
  } catch (error) {
    if (error.response?.status === 401) {
      logger.technical.error('Invalid Mistral API key.', { service: serviceName });
    } else {
      logger.technical.error('Error checking Mistral API status:', {
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
 * @param {string|Array} prompt - The prompt to send to the LLM (string or message array).
 * @param {string} systemMessage - (Optional) A system message to guide the LLM's behavior.
 * @param {object} options - (Optional) Additional options for the Mistral API.
 * @returns {Promise<string|null>} The LLM's response content, or null if an error occurs.
 */
export async function generateResponse(prompt, systemMessage = null, options = {}) {
  let messages = [];
  
  // Handle different input types
  if (Array.isArray(prompt)) {
    // If prompt is already an array of messages, use it directly
    messages = prompt;
  } else if (typeof prompt === 'string') {
    // If prompt is a string, create messages array
    if (systemMessage) {
      messages.push({ role: 'system', content: systemMessage });
    }
    messages.push({ role: 'user', content: prompt });
  } else {
    logger.technical.error('Invalid prompt type. Expected string or array.', { 
      promptType: typeof prompt, 
      service: serviceName 
    });
    return null;
  }

  if (messages.length === 0) {
    logger.technical.error('No messages to send.', { service: serviceName });
    return null;
  }

  const requestBody = {
    model: MISTRAL_MODEL,
    messages: messages,
    temperature: options.temperature || 0.7,
    top_p: options.top_p || 0.9,
    max_tokens: options.max_tokens || 4096,
    stream: false
  };

  logger.technical.debug(`Sending to Mistral`, { 
    messageCount: messages.length,
    firstMessage: messages[0]?.content?.substring(0, 50) + '...',
    service: serviceName 
  });

  try {
    const response = await axios.post(`${MISTRAL_API_URL}/chat/completions`, requestBody, {
      headers: {
        'Authorization': `Bearer ${MISTRAL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: MISTRAL_REQUEST_TIMEOUT
    });

    if (response.data && response.data.choices && response.data.choices[0]?.message?.content) {
      const content = response.data.choices[0].message.content.trim();
      logger.technical.debug(`Received Mistral response`, { 
        length: content.length,
        truncated: content.substring(0, 100) + '...',
        service: serviceName 
      });
      return content;
    } else {
      logger.technical.error('Invalid or empty response from Mistral.', { responseData: response.data, service: serviceName });
      return null;
    }
  } catch (error) {
    logger.technical.error('Error communicating with Mistral API:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      requestBody,
      service: serviceName
    });
    return null;
  }
}

export async function parseIntent(naturalLanguageQuery) {
  const systemPrompt = `You are an expert at interpreting natural language commands for Git and GitHub operations.
Your task is to identify the user's intent and extract relevant entities.
Respond ONLY with a valid JSON object containing "intent" and "entities" fields.
Do not include any explanations, markdown, or additional text.

Important rules:
- If the user mentions "push", "push changes", "push code", etc., the intent is ALWAYS "push_changes"
- If no branch is specified for push_changes, use "current" (we'll determine the actual branch later)
- If no remote is specified, use "origin"
- If the user mentions "backup branch creation" or "with backup", set create_backup: true
- Do not interpret "backup" as a branch name unless explicitly stated as "branch called backup"
- Be intelligent and make reasonable assumptions for incomplete requests

Available intents:
- push_changes: Push local changes to a remote repository
- create_repo: Create a new repository
- list_repos: List user's repositories
- git_init: Initialize a new Git repository
- git_add: Stage changes for commit
- git_commit: Commit staged changes
- git_status: Show working tree status
- git_revert_last_commit: Revert the last commit

Entity examples for push_changes:
- commit_message (string): The commit message to use
- branch (string): The branch to push to (use "current" if not specified)
- remote (string): The remote to push to (default: origin)
- force (boolean): Whether to force push
- create_backup (boolean): Whether to create a backup branch
- set_as_default (boolean): Whether to set as default branch

Example responses:
"push my changes" → {"intent": "push_changes", "entities": {"branch": "current"}}
"push code please" → {"intent": "push_changes", "entities": {"branch": "current"}}
"push to main" → {"intent": "push_changes", "entities": {"branch": "main"}}
"push code with commit message called final changes with backup branch creation" → {"intent": "push_changes", "entities": {"commit_message": "final changes", "create_backup": true, "branch": "current"}}
"force push to main" → {"intent": "push_changes", "entities": {"branch": "main", "force": true}}`;

  const prompt = `Parse this user query: "${naturalLanguageQuery}"

JSON response:`;

  try {
    logger.technical.debug(`Parsing intent for query: "${naturalLanguageQuery}"`, { service: serviceName });
    const responseText = await generateResponse(prompt, systemPrompt, { temperature: 0.1 });

    if (!responseText) {
      logger.technical.error('No response from LLM for intent parsing.', { service: serviceName });
      return { intent: 'unknown', entities: { error: 'LLM did not respond' } };
    }

    try {
      // Clean the response - remove any markdown formatting
      let cleanResponse = responseText.trim();
      if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.replace(/```json\n?/, '').replace(/```\n?/, '');
      }
      if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.replace(/```\n?/, '').replace(/```\n?/, '');
      }

      const jsonResponse = JSON.parse(cleanResponse);
      
      // Validate the response
      if (!jsonResponse.intent || typeof jsonResponse.intent !== 'string') {
        throw new Error('Invalid intent in response');
      }

      // Normalize entities
      jsonResponse.entities = jsonResponse.entities || {};

      // Special handling for backup branch creation
      if (naturalLanguageQuery.toLowerCase().includes('backup branch creation') || 
          naturalLanguageQuery.toLowerCase().includes('with backup')) {
        jsonResponse.entities.create_backup = true;
      }

      // Remove backup from branch name if it was incorrectly parsed
      if (jsonResponse.entities.branch === 'backup' && 
          (naturalLanguageQuery.toLowerCase().includes('backup branch creation') || 
           naturalLanguageQuery.toLowerCase().includes('with backup'))) {
        delete jsonResponse.entities.branch;
      }

      // Ensure push_changes has a branch (default to current if not specified)
      if (jsonResponse.intent === 'push_changes' && !jsonResponse.entities.branch) {
        jsonResponse.entities.branch = 'current';
      }

      logger.technical.info('Successfully parsed intent.', { 
        intent: jsonResponse.intent, 
        entities: jsonResponse.entities, 
        service: serviceName 
      });
      
      return jsonResponse;
    } catch (parseError) {
      logger.technical.error('Failed to parse JSON response from LLM:', {
        responseText,
        error: parseError.message,
        service: serviceName
      });
      
      // Fallback parsing for common patterns
      const lowerQuery = naturalLanguageQuery.toLowerCase();
      if (lowerQuery.includes('push')) {
        return {
          intent: 'push_changes',
          entities: {
            branch: 'current',
            error: 'fallback_parsing',
            original_query: naturalLanguageQuery
          }
        };
      }
      
      return { intent: 'unknown', entities: { error: 'Failed to parse LLM response', raw_response: responseText } };
    }
  } catch (error) {
    logger.technical.error('Error during intent parsing with Mistral:', { message: error.message, service: serviceName });
    
    // Fallback parsing for common patterns
    const lowerQuery = naturalLanguageQuery.toLowerCase();
    if (lowerQuery.includes('push')) {
      return {
        intent: 'push_changes',
        entities: {
          branch: 'current',
          error: 'fallback_parsing',
          original_query: naturalLanguageQuery
        }
      };
    }
    
    return { intent: 'unknown', entities: { error: error.message } };
  }
}

export async function generateGitignore(projectDescription) {
  const systemPrompt = `Generate a comprehensive .gitignore for the described technologies.
Include:
- Language-specific patterns
- IDE/editor files
- Dependency directories
- Build outputs
- Environment files

Return ONLY the .gitignore content with no additional text.`;

  const prompt = `Technologies: ${projectDescription}`;

  const response = await generateResponse(prompt, systemPrompt, {
    temperature: 0.3,
    max_tokens: 1024
  });

  return response || DEFAULT_GITIGNORE;
}

export async function generateCommitMessage(diffOutput) {
  if (!diffOutput?.trim()) {
    return 'chore: no changes detected';
  }

  const systemPrompt = `Generate a conventional commit message from this diff.
Rules:
1. Use standard prefix (feat, fix, docs, style, refactor, perf, test, chore)
2. Keep subject line under 50 chars
3. Only return the message (no explanations)
4. Focus on significant changes`;

  const prompt = `Diff:\n\`\`\`diff\n${diffOutput.substring(0, 2000)}\n\`\`\``;

  const response = await generateResponse(prompt, systemPrompt, {
    temperature: 0.5,
    max_tokens: 100
  });

  return cleanCommitMessage(response) || 'fix: code changes';
}

// Helper functions
function createErrorResponse(message) {
  return {
    intent: 'error',
    entities: {
      error: message,
      suggested_actions: [
        "push to [branch]",
        "commit with message '[message]'",
        "create branch [name]"
      ]
    }
  };
}

function cleanCommitMessage(message) {
  if (!message) return null;
  return message
    .replace(/^["']|["']$/g, '')
    .replace(/\n/g, ' ')
    .trim()
    .substring(0, 72);
}

export default {
  checkMistralStatus,
  generateResponse,
  parseIntent,
  generateGitignore,
  generateCommitMessage
};