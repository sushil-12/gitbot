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
    // const response = await axios.post(`${MISTRAL_API_URL}/chat/completions`, requestBody, {
    //   headers: {
    //     'Authorization': `Bearer ${MISTRAL_API_KEY}`,
    //     'Content-Type': 'application/json'
    //   },
    //   timeout: MISTRAL_REQUEST_TIMEOUT
    // });
    // Instead, call the custom backend proxy
    const response = await axios.post('/api/mistral', {
      messages: messages,
      options: {
        model: MISTRAL_MODEL,
        temperature: options.temperature || 0.7,
        top_p: options.top_p || 0.9,
        max_tokens: options.max_tokens || 4096
      }
    }, {
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
  console.log("naturalLanguageQuery in mistral service", naturalLanguageQuery);
  const systemPrompt = `You are an expert at interpreting natural language commands and conversations.
Your primary task is to:
1. Identify if the user is asking about Git/GitHub operations
2. Handle general conversations (greetings, small talk)
3. Recognize when the user asks unrelated questions

For Git operations, respond with a JSON object containing "intent" and "entities" fields.
For non-Git conversations, respond with a JSON object containing "intent": "conversation" and "response" fields.

Important rules:
- ALWAYS respond with valid JSON
- For greetings (hello, hi, hey, good morning/afternoon/evening), respond with "greeting" intent
- For "how are you" or similar, respond with "conversation" intent and a friendly response
- For clearly unrelated questions (e.g., "what's the weather?"), respond with "unrelated" intent
- For Git operations, follow the specific formatting rules below

Git-specific rules:
- Push commands: intent is "push_changes"
- If no branch is specified for push_changes, use "current"
- If no remote is specified, use "origin"
- For "backup branch creation" or "with backup", set create_backup: true
- Don't interpret "backup" as a branch name unless explicitly stated

Available Git intents:
- push_changes: Push local changes to a remote repository
- create_repo: Create a new repository
- list_repos: List user's repositories
- git_init: Initialize a new Git repository
- git_add: Stage changes for commit
- git_commit: Commit staged changes
- git_status: Show working tree status
- git_revert_last_commit: Revert the last commit

Conversation intents:
- greeting: Simple greetings (hello, hi, etc.)
- conversation: General chat or questions
- unrelated: Clearly non-Git related questions

Example responses:
"push my changes" → {"intent": "push_changes", "entities": {"branch": "current"}}
"hello" → {"intent": "greeting", "response": "Hello! How can I help you with Git today?"}
"hi there" → {"intent": "greeting", "response": "Hi there! Ready to work with Git?"}
"how are you?" → {"intent": "conversation", "response": "I'm just a program, but I'm functioning well! How can I assist you with version control?"}
"what's the weather?" → {"intent": "unrelated", "response": "I'm focused on Git operations. Can I help you with version control or repository management?"}
"thanks" → {"intent": "conversation", "response": "You're welcome! Let me know if you need any more help with Git."}
"push code with commit message called final changes with backup branch creation" → {"intent": "push_changes", "entities": {"commit_message": "final changes", "create_backup": true, "branch": "current"}}
"force push to main" → {"intent": "push_changes", "entities": {"branch": "main", "force": true}}`;

  const prompt = `Interpret this user input: "${naturalLanguageQuery}"

Respond with JSON only:`;

  try {
    logger.technical.debug(`Parsing intent for query: "${naturalLanguageQuery}"`, { service: serviceName });
    
    // First, check for empty or nonsensical input
    if (!naturalLanguageQuery || naturalLanguageQuery.trim().length < 2) {
      return {
        intent: 'error',
        response: "I didn't quite catch that. Could you please rephrase or ask about Git operations?"
      };
    }

    const responseText = await generateResponse(prompt, systemPrompt, { 
      temperature: 0.1,
      max_tokens: 300
    });

    if (!responseText) {
      logger.technical.error('No response from LLM for intent parsing.', { service: serviceName });
      return { 
        intent: 'error', 
        response: "I'm having trouble understanding. Could you rephrase your request?"
      };
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

      // Validate the response structure
      if (!jsonResponse.intent || typeof jsonResponse.intent !== 'string') {
        throw new Error('Invalid intent in response');
      }

      // Handle conversation intents
      if (['greeting', 'conversation', 'unrelated'].includes(jsonResponse.intent)) {
        if (!jsonResponse.response) {
          // Generate default responses for conversation types
          switch (jsonResponse.intent) {
            case 'greeting':
              jsonResponse.response = "Hello! How can I help you with Git today?";
              break;
            case 'conversation':
              jsonResponse.response = "I'm happy to chat, but I'm best at helping with Git operations. What would you like to do with your repositories?";
              break;
            case 'unrelated':
              jsonResponse.response = "I'm specialized in Git operations. Can I help you with version control or repository management?";
              break;
          }
        }
        return jsonResponse;
      }

      // Handle Git operations
      if (jsonResponse.intent === 'push_changes' && !jsonResponse.entities?.branch) {
        jsonResponse.entities = jsonResponse.entities || {};
        jsonResponse.entities.branch = 'current';
      }

      // Special handling for backup branch creation
      if (naturalLanguageQuery.toLowerCase().includes('backup branch creation') ||
        naturalLanguageQuery.toLowerCase().includes('with backup')) {
        jsonResponse.entities = jsonResponse.entities || {};
        jsonResponse.entities.create_backup = true;
      }

      logger.technical.info('Successfully parsed intent.', {
        intent: jsonResponse.intent,
        entities: jsonResponse.entities || {},
        response: jsonResponse.response || null,
        service: serviceName
      });

      return jsonResponse;
    } catch (parseError) {
      logger.technical.error('Failed to parse JSON response from LLM:', {
        responseText,
        error: parseError.message,
        service: serviceName
      });

      // Fallback to analyzing the query directly
      const lowerQuery = naturalLanguageQuery.toLowerCase();
      
      // Check for greetings
      const greetings = ['hello', 'hi', 'hey', 'greetings', 'good morning', 'good afternoon', 'good evening'];
      if (greetings.some(g => lowerQuery.includes(g))) {
        return {
          intent: 'greeting',
          response: "Hello! How can I assist you with Git today?"
        };
      }
      
      // Check for "how are you" type questions
      if (lowerQuery.includes('how are you') || lowerQuery.includes("what's up")) {
        return {
          intent: 'conversation',
          response: "I'm just a program, but I'm functioning well! How can I help you with version control?"
        };
      }
      
      // Check for thanks
      if (lowerQuery.includes('thank') || lowerQuery.includes('thanks')) {
        return {
          intent: 'conversation',
          response: "You're welcome! Let me know if you need any more help with Git."
        };
      }
      
      // Check for Git-like commands
      if (lowerQuery.includes('push') || lowerQuery.includes('commit') || 
          lowerQuery.includes('branch') || lowerQuery.includes('merge') ||
          lowerQuery.includes('pull') || lowerQuery.includes('repo')) {
        return {
          intent: 'push_changes',
          entities: {
            branch: 'current',
            error: 'fallback_parsing',
            original_query: naturalLanguageQuery
          }
        };
      }
      
      // Default to unrelated
      return {
        intent: 'unrelated',
        response: "I'm specialized in Git operations. Can I help you with version control or repository management?"
      };
    }
  } catch (error) {
    logger.technical.error('Error during intent parsing with Mistral:', { 
      message: error.message, 
      service: serviceName 
    });

    return {
      intent: 'error',
      response: "I encountered an error processing your request. Could you please try again or rephrase?"
    };
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