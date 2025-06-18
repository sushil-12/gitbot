import * as ollamaService from '../../ai/ollamaService.js';
import * as mistralService from './mistralService.js';
import logger from '../utils/logger.js';

const serviceName = 'AIServiceFactory';

// Supported AI providers
const AI_PROVIDERS = {
  OLLAMA: 'ollama',
  MISTRAL: 'mistral',
  // Add more providers as needed
};

// Default provider from environment variable
const DEFAULT_PROVIDER = process.env.AI_PROVIDER || AI_PROVIDERS.OLLAMA;

// Provider implementations
const providers = {
  [AI_PROVIDERS.OLLAMA]: {
    checkStatus: ollamaService.checkOllamaStatus,
    generateResponse: ollamaService.generateResponse,
    parseIntent: ollamaService.parseIntent,
    generateGitignore: ollamaService.generateGitignore,
    generateCommitMessage: ollamaService.generateCommitMessage
  },
  [AI_PROVIDERS.MISTRAL]: {
    checkStatus: mistralService.checkMistralStatus,
    generateResponse: mistralService.generateResponse,
    parseIntent: mistralService.parseIntent,
    generateGitignore: mistralService.generateGitignore,
    generateCommitMessage: mistralService.generateCommitMessage
  }
};

let currentProvider = DEFAULT_PROVIDER;

/**
 * Get the current AI provider
 * @returns {string} The current provider name
 */
export function getCurrentProvider() {
  return currentProvider;
}

/**
 * Set the AI provider to use
 * @param {string} provider - The provider name (must be one of AI_PROVIDERS)
 * @returns {boolean} True if provider was set successfully, false otherwise
 */
export function setProvider(provider) {
  if (!providers[provider]) {
    logger.error(`Invalid AI provider: ${provider}`, { service: serviceName });
    return false;
  }
  currentProvider = provider;
  logger.info(`AI provider set to: ${provider}`, { service: serviceName });
  return true;
}

/**
 * Get the current provider's implementation
 * @returns {object} The current provider's implementation
 */
export function getProvider() {
  return providers[currentProvider];
}

/**
 * Check if the current provider is available
 * @returns {Promise<boolean>} True if provider is available, false otherwise
 */
export async function checkProviderStatus() {
  try {
    return await providers[currentProvider].checkStatus();
  } catch (error) {
    logger.error(`Error checking ${currentProvider} status:`, { 
      message: error.message,
      service: serviceName 
    });
    return false;
  }
}

// Enhanced prompt templates
const PROMPT_TEMPLATES = {
  GIT_OPERATION_PARSER: {
    role: "system",
    content: `You are an advanced Git command parser with deep understanding of version control concepts. 
Your task is to analyze user requests and extract:
1. The exact Git operation requested
2. All relevant parameters and options
3. The context and intent behind the request

Respond with a JSON object containing:
- intent: The primary operation (e.g., "push_changes", "create_branch")
- entities: Detailed parameters (branch names, flags, etc.)
- context: Additional context about the user's intent
- safety_check: Any potential risks or warnings about the operation

Format your response as valid JSON without any additional text or explanations.`
  },

  CONFIRMATION_GENERATOR: {
    role: "system",
    content: `You are a highly intelligent Git assistant. Generate clear, user-friendly confirmation messages that:
1. Precisely summarize the requested operation
2. Highlight any important implications or risks
3. Offer suggestions if the request seems unsafe or suboptimal
4. Always end with a confirmation question

Maintain a professional yet approachable tone. Adapt your response based on the user's technical level.`
  },

  HELP_GENERATOR: {
    role: "system",
    content: `You are a Git expert creating comprehensive help documentation. Provide:
1. Clear explanations of all available commands
2. Practical examples for each command
3. Common variations and aliases
4. Best practices and tips
5. Safety considerations

Structure your response with clear headings and bullet points. Tailor the complexity to the user's apparent skill level.`
  },

  ERROR_HANDLER: {
    role: "system",
    content: `You are an error handling expert. When Git operations fail:
1. Explain the error in simple terms
2. Diagnose the likely cause
3. Provide step-by-step solutions
4. Offer alternative approaches
5. Include relevant documentation links

Be empathetic and solution-focused. Avoid technical jargon unless appropriate.`
  }
};

// Enhanced examples for better understanding
const OPERATION_EXAMPLES = [
  // Push operations
  {
    role: "user",
    content: "push my changes to main"
  },
  {
    role: "assistant",
    content: JSON.stringify({
      intent: "push_changes",
      entities: { branch: "main" },
      context: "Standard push to default branch",
      safety_check: "Ensure local changes are committed first"
    })
  },
  {
    role: "user",
    content: "force push final-codebase to main and make it default"
  },
  {
    role: "assistant",
    content: JSON.stringify({
      intent: "push_changes",
      entities: { branch: "final-codebase", force: true, set_as_default: true },
      context: "Force pushing feature branch to main",
      safety_check: "Force push will overwrite remote history. Consider creating backup first."
    })
  },
  
  // Branch operations
  {
    role: "user",
    content: "create a new branch called feature-auth from main"
  },
  {
    role: "assistant",
    content: JSON.stringify({
      intent: "create_branch",
      entities: { branch: "feature-auth", source: "main" },
      context: "Creating feature branch for authentication work",
      safety_check: "Ensure you're on the correct source branch before creating"
    })
  },
  
  // Commit operations
  {
    role: "user",
    content: "commit all changes with message 'implement user login'"
  },
  {
    role: "assistant",
    content: JSON.stringify({
      intent: "create_commit",
      entities: { message: "implement user login", all: true },
      context: "Creating comprehensive commit for login feature",
      safety_check: "Review changes with 'git status' before committing"
    })
  },
  
  // Complex scenarios
  {
    role: "user",
    content: "I messed up my branch, how do I reset it to match origin?"
  },
  {
    role: "assistant",
    content: JSON.stringify({
      intent: "branch_reset",
      entities: { hard: true, target: "origin" },
      context: "Recovering from local branch corruption",
      safety_check: "This will discard all local changes. Stash or commit important work first."
    })
  }
];

const CONFIRMATION_EXAMPLES = [
  {
    role: "user",
    content: JSON.stringify({
      intent: "push_changes",
      entities: { branch: "main", force: true, create_backup: true }
    })
  },
  {
    role: "assistant",
    content: "I'll perform a force push to the main branch after creating a backup of your current state. ⚠️ Force pushing will overwrite the remote history, which could affect other collaborators. I'll proceed with: \n1. Creating backup branch 'backup-main-{timestamp}'\n2. Force pushing your changes to main\n\nThis is irreversible. Are you sure you want to continue?"
  },
  {
    role: "user",
    content: JSON.stringify({
      intent: "create_branch",
      entities: { branch: "feature-auth", source: "develop" }
    })
  },
  {
    role: "assistant",
    content: "I'll create a new branch 'feature-auth' based on the 'develop' branch. This is a safe operation that won't affect existing work. Would you like me to switch to the new branch immediately after creating it?"
  }
];

// Default help message
const DEFAULT_HELP_MESSAGE = `Here are the main things I can help you with:

1. Push changes:
   - "push my changes to main"
   - "push with commit message 'update feature'"
   - "force push to main"
   - "push with backup branch creation"

2. Create and manage branches:
   - "create a new branch called feature-x"
   - "switch to main branch"
   - "list all branches"

3. Commit changes:
   - "commit with message 'fix bug'"
   - "commit all changes"
   - "commit specific files"

4. Pull and merge:
   - "pull latest changes"
   - "merge feature branch"
   - "get updates from main"`;

// Enhanced AI service with more capabilities
export const aiService = {
  /**
   * Check the status of the current AI provider
   * @returns {Promise<boolean>} True if provider is available
   */
  checkStatus: async () => {
    try {
      return await providers[currentProvider].checkStatus();
    } catch (error) {
      logger.error('Error checking AI provider status:', {
        error: error.message,
        provider: currentProvider,
        service: serviceName
      });
      return false;
    }
  },

  /**
   * Generate a response from the AI service
   * @param {Array|string} messages - Conversation history or prompt string
   * @param {Object} options - Generation options
   * @returns {Promise<string>} Generated response
   */
  generateResponse: async (messages, options = {}) => {
    const defaultOptions = {
      max_tokens: 300,
      temperature: 0.7,
      top_p: 0.9,
      ...options
    };

    try {
      // Convert messages array to string prompt for compatibility
      let prompt, systemMessage;
      
      if (Array.isArray(messages)) {
        // Extract system message and user message from array
        const systemMsg = messages.find(msg => msg.role === 'system');
        const userMsg = messages.find(msg => msg.role === 'user');
        
        systemMessage = systemMsg ? systemMsg.content : null;
        prompt = userMsg ? userMsg.content : messages[messages.length - 1]?.content || '';
      } else {
        // If it's already a string, use it directly
        prompt = messages;
        systemMessage = null;
      }
      
      return await providers[currentProvider].generateResponse(prompt, systemMessage, defaultOptions);
    } catch (error) {
      logger.error('Error generating AI response:', {
        error: error.message,
        messages,
        service: serviceName
      });
      throw error;
    }
  },

  /**
   * Parse user intent from natural language
   * @param {string} query - User's natural language input
   * @returns {Promise<Object>} Parsed intent and entities
   */
  parseIntent: async (query) => {
    try {
      // Use the provider's parseIntent method directly
      const parsed = await providers[currentProvider].parseIntent(query);
      
      if (!parsed) {
        throw new Error('Empty response from AI service');
      }

      // Normalize entities
      parsed.entities = parsed.entities || {};

      // Special handling for backup branch creation
      if (query.toLowerCase().includes('backup branch creation') || 
          query.toLowerCase().includes('with backup')) {
        parsed.entities.create_backup = true;
      }

      // Remove backup from branch name if it was incorrectly parsed
      if (parsed.entities.branch === 'backup' && 
          (query.toLowerCase().includes('backup branch creation') || 
           query.toLowerCase().includes('with backup'))) {
        delete parsed.entities.branch;
      }

      // Ensure push_changes has a branch (default to current if not specified)
      if (parsed.intent === 'push_changes' && !parsed.entities.branch) {
        parsed.entities.branch = 'current';
      }

      return parsed;
    } catch (error) {
      logger.error('Error parsing intent:', { 
        error: error.message, 
        query,
        service: serviceName 
      });

      // Fallback parsing for common patterns
      const lowerQuery = query.toLowerCase();
      if (lowerQuery.includes('push')) {
        return {
          intent: 'push_changes',
          entities: {
            branch: 'current',
            error: 'fallback_parsing',
            original_query: query
          }
        };
      }

      // Return a more helpful error response
      return {
        intent: 'error',
        entities: {
          error: 'understanding_request',
          message: 'I couldn\'t quite understand that. Could you try rephrasing?',
          details: error.message,
          suggested_phrases: [
            "push my changes to [branch]",
            "create a new branch called [name]",
            "commit with message '[message]'"
          ]
        }
      };
    }
  },

  /**
   * Generate a confirmation message for an operation
   * @param {Object} operation - The parsed operation
   * @returns {Promise<string>} Confirmation message
   */
  generateConfirmation: async (operation) => {
    try {
      const systemPrompt = `You are a helpful Git assistant. Generate clear, user-friendly confirmation messages.
Keep responses concise and conversational. Always end with a question asking for confirmation.

Example:
Input: {"intent": "push_changes", "entities": {"branch": "main", "force": true, "create_backup": true}}
Output: "I understand you want me to force push your changes to the main branch. For safety, I'll create a backup branch first. Since this is a force push, it will overwrite the remote history. Is this what you want to do?"`;

      const prompt = `Generate a confirmation message for this operation: ${JSON.stringify(operation)}`;

      const response = await providers[currentProvider].generateResponse(prompt, systemPrompt, {
        max_tokens: 150,
        temperature: 0.7
      });
      
      return response || generateFallbackConfirmation(operation);
    } catch (error) {
      logger.error('Error generating confirmation:', { 
        error: error.message, 
        operation,
        service: serviceName 
      });
      return generateFallbackConfirmation(operation);
    }
  },

  /**
   * Generate a help message for available commands
   * @param {string} context - Optional context about what the user is trying to do
   * @returns {Promise<string>} Help message
   */
  generateCommandHelp: async (context = '') => {
    try {
      const systemPrompt = `Generate a user-friendly help message for GitBot commands. Include examples and common variations.`;
      const prompt = `Show me all available commands with examples.${context ? ` Context: ${context}` : ''}`;

      const response = await providers[currentProvider].generateResponse(prompt, systemPrompt, {
        max_tokens: 500,
        temperature: 0.7
      });

      if (!response) {
        return DEFAULT_HELP_MESSAGE;
      }

      return response;
    } catch (error) {
      logger.error('Error generating help:', { 
        error: error.message,
        service: serviceName 
      });
      return DEFAULT_HELP_MESSAGE;
    }
  },

  /**
   * Generate a commit message based on changes
   * @param {Array<string>} changes - List of changed files
   * @param {string} [context] - Additional context about the changes
   * @returns {Promise<string>} Generated commit message
   */
  generateCommitMessage: async (changes, context) => {
    try {
      const messages = [
        {
          role: "system",
          content: `You are an expert at writing clear, conventional commit messages. 
Given the changed files and optional context, generate:
1. A concise subject line (50-72 chars)
2. A detailed body explaining the changes (wrap at 72 chars)
3. Reference any related issues if mentioned

Format:
<type>(<scope>): <subject>
<BLANK LINE>
<body>`
        },
        {
          role: "user",
          content: `Changed files:\n${changes.join('\n')}\n\nContext: ${context || 'No additional context'}`
        }
      ];

      return await providers[currentProvider].generateResponse(messages, {
        max_tokens: 200,
        temperature: 0.3 // Keep commit messages consistent
      });
    } catch (error) {
      logger.error('Error generating commit message:', {
        error: error.message,
        changes,
        service: serviceName
      });
      return "Update files"; // Fallback simple message
    }
  },

  /**
   * Explain a Git error and suggest solutions
   * @param {string} errorMessage - The error message from Git
   * @param {string} [context] - The operation that caused the error
   * @returns {Promise<string>} Explanation and solutions
   */
  explainError: async (errorMessage, context) => {
    try {
      const messages = [
        PROMPT_TEMPLATES.ERROR_HANDLER,
        {
          role: "user",
          content: `Git error: ${errorMessage}\n\nContext: ${context || 'No additional context'}`
        }
      ];

      return await providers[currentProvider].generateResponse(messages, {
        max_tokens: 400,
        temperature: 0.4 // Balanced between accuracy and creativity
      });
    } catch (error) {
      logger.error('Error generating error explanation:', {
        error: error.message,
        gitError: errorMessage,
        service: serviceName
      });
      return `I encountered an error but couldn't analyze it properly. The original error was: ${errorMessage}`;
    }
  }
};

// Enhanced fallback confirmation generator
function generateFallbackConfirmation(operation) {
  const intent = operation.intent || 'unknown';
  const entities = operation.entities || {};
  const context = operation.context || '';
  const safety = operation.safety_check || '';

  let message = "I understand you want me to ";
  let warning = '';
  let suggestion = '';

  switch (intent) {
    case 'push_changes':
      message += `push changes${entities.branch ? ` to ${entities.branch}` : ''}`;
      if (entities.force) {
        message += ' (force push)';
        warning = '⚠️ This will overwrite remote history. ';
      }
      if (entities.create_backup) {
        message += ' after creating a backup';
      }
      suggestion = entities.force ? 'Consider a regular push unless absolutely necessary.' : '';
      break;

    case 'create_branch':
      message += `create branch ${entities.branch || 'new-branch'}`;
      if (entities.source) {
        message += ` from ${entities.source}`;
      }
      break;

    case 'merge_branch':
      message += `merge ${entities.source || 'source-branch'} into ${entities.target || 'current-branch'}`;
      warning = 'This may result in merge conflicts. ';
      suggestion = 'Ensure both branches are up to date first.';
      break;

    default:
      message += `perform a ${intent.replace(/_/g, ' ')} operation`;
  }

  if (context) {
    message += ` (${context})`;
  }

  if (warning || safety) {
    message += `\n\n${warning}${safety}`;
  }

  if (suggestion) {
    message += `\n\nSuggestion: ${suggestion}`;
  }

  message += "\n\nShould I proceed with this?";

  return message;
}

// Export constants
export { AI_PROVIDERS };