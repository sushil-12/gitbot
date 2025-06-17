import * as ollamaService from '../../ai/ollamaService.js';
import * as mistralService from './mistralService.js';
import logger from '../utils/logger.js';

const serviceName = 'AIServiceFactory';

// Supported AI providers
const AI_PROVIDERS = {
  OLLAMA: 'ollama',
  MISTRAL: 'mistral'
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

// Export the provider implementations directly
export const aiService = {
  checkStatus: async () => await providers[currentProvider].checkStatus(),
  generateResponse: async (...args) => await providers[currentProvider].generateResponse(...args),
  parseIntent: async (...args) => await providers[currentProvider].parseIntent(...args),
  generateGitignore: async (...args) => await providers[currentProvider].generateGitignore(...args),
  generateCommitMessage: async (...args) => await providers[currentProvider].generateCommitMessage(...args)
};

// Export constants
export { AI_PROVIDERS }; 