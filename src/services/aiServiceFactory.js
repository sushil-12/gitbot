import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import configManager from '../utils/configManager.js';
import logger from '../utils/logger.js';

const serviceName = 'AIServiceFactory';

export const AI_PROVIDERS = {
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
  MISTRAL: 'mistral'
};

// Conversation types we'll handle
const CONVERSATION_TYPES = {
  GREETING: 'greeting',
  GIT_OPERATION: 'git_operation',
  GITHUB_OPERATION: 'github_operation',
  UNRELATED: 'unrelated',
  THANKS: 'thanks',
  HELP: 'help',
  ERROR: 'error'
};

let currentProvider = AI_PROVIDERS.MISTRAL;
let openaiClient = null;
let anthropicClient = null;
let mistralClient = null;

// In-memory cache for prompt/response pairs (session cache)
const aiResponseCache = new Map();

export function setProvider(provider) {
  if (Object.values(AI_PROVIDERS).includes(provider)) {
    currentProvider = provider;
    logger.info(`AI provider switched to: ${provider}`, { service: serviceName });
    return true;
  }
  logger.error(`Invalid AI provider: ${provider}`, { service: serviceName });
  return false;
}

export function getCurrentProvider() {
  return currentProvider;
}

async function getOpenAIClient() {
  if (!openaiClient) {
    const apiKey = await configManager.getAPIKey();
    if (!apiKey) {
      throw new Error('OpenAI API key not configured. Run "gitmate init" to set up your configuration.');
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

async function getAnthropicClient() {
  if (!anthropicClient) {
    const apiKey = await configManager.getAPIKey();
    if (!apiKey) {
      throw new Error('Anthropic API key not configured. Run "gitmate init" to set up your configuration.');
    }
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

async function getMistralClient() {
  if (!mistralClient) {
    const mistralProxyUrl = process.env.MISTRAL_PROXY_URL || 'https://gitbot-jtp2.onrender.com/api/mistral';
    mistralClient = {
      async chat(messages, options = {}) {
        const response = await fetch(mistralProxyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages, options })
        });
        if (!response.ok) {
          throw new Error(`Mistral Proxy error: ${response.status} ${await response.text()}`);
        }
        const data = await response.json();
        return data.choices?.[0]?.message?.content || data.choices?.[0]?.text || data;
      }
    };
  }
  return mistralClient;
}

// Helper function to detect conversation type
function detectConversationType(query) {
  if (!query || query.trim().length < 2) {
    return { type: CONVERSATION_TYPES.ERROR, response: "I didn't quite catch that. Could you please rephrase?" };
  }

  const lowerQuery = query.toLowerCase().trim();

  // Greetings detection
  const greetings = ['hello', 'hi', 'hey', 'greetings', 'good morning', 'good afternoon', 'good evening'];
  if (greetings.some(g => lowerQuery.includes(g))) {
    return { type: CONVERSATION_TYPES.GREETING };
  }

  // Thanks detection
  if (lowerQuery.includes('thank') || lowerQuery.includes('thanks') || lowerQuery.includes('appreciate')) {
    return { type: CONVERSATION_TYPES.THANKS };
  }

  // Help detection
  if (lowerQuery.includes('help') || lowerQuery.includes('what can you do')) {
    return { type: CONVERSATION_TYPES.HELP };
  }

  // How are you detection
  if (lowerQuery.includes('how are you') || lowerQuery.includes("what's up")) {
    return { 
      type: CONVERSATION_TYPES.GREETING,
      response: "I'm just a program, but I'm functioning well! How can I help you with version control?"
    };
  }

  // Git/GitHub operation detection
  const gitKeywords = ['git', 'push', 'pull', 'commit', 'branch', 'merge', 'rebase', 'clone', 'fork', 'repo'];
  const githubKeywords = ['github', 'pull request', 'pr', 'issue', 'repository'];
  if (gitKeywords.some(k => lowerQuery.includes(k)) || githubKeywords.some(k => lowerQuery.includes(k))) {
    return { type: lowerQuery.includes('github') ? CONVERSATION_TYPES.GITHUB_OPERATION : CONVERSATION_TYPES.GIT_OPERATION };
  }

  // If none of the above, assume unrelated
  return { type: CONVERSATION_TYPES.UNRELATED };
}

export const aiService = {
  async checkStatus() {
    try {
      // Prefer Mistral if its API key is present
      let provider = process.env.AI_PROVIDER;
      let apiKey = null;
      if (process.env.MISTRAL_API_KEY) {
        provider = 'mistral';
        apiKey = process.env.MISTRAL_API_KEY;
      } else if (process.env.OPENAI_API_KEY) {
        provider = 'openai';
        apiKey = process.env.OPENAI_API_KEY;
      } else if (process.env.ANTHROPIC_API_KEY) {
        provider = 'anthropic';
        apiKey = process.env.ANTHROPIC_API_KEY;
      } else if (process.env.AI_PROVIDER) {
        provider = process.env.AI_PROVIDER;
      }
      
      if (apiKey) {
        // Test the connection
        if (provider === AI_PROVIDERS.OPENAI) {
          const client = new OpenAI({ apiKey });
          await client.models.list();
        } else if (provider === AI_PROVIDERS.ANTHROPIC) {
          const client = new Anthropic({ apiKey });
          await client.messages.create({
            model: 'claude-3-sonnet-20240229',
            max_tokens: 10,
            messages: [{ role: 'user', content: 'Hello' }]
          });
        } else if (provider === AI_PROVIDERS.MISTRAL) {
          const client = await getMistralClient();
          await client.chat([{ role: 'user', content: 'Hello' }], { max_tokens: 10 });
        }
        return true;
      }

      // Check if we have local config
      const isConfigured = await configManager.isConfigured();
      if (!isConfigured) {
        logger.warn('GitMate is not configured. Users can set AI_PROVIDER and API key environment variables or run "gitmate init" to set up.', { service: serviceName });
        return false;
      }

      const configProvider = await configManager.getAIProvider();
      const configApiKey = await configManager.getAPIKey();
      
      if (!configApiKey) {
        logger.warn('API key not configured. Users can set AI_PROVIDER and API key environment variables or run "gitmate init" to set up.', { service: serviceName });
        return false;
      }

      // Test the connection
      if (configProvider === AI_PROVIDERS.OPENAI) {
        const client = await getOpenAIClient();
        await client.models.list();
      } else if (configProvider === AI_PROVIDERS.ANTHROPIC) {
        const client = await getAnthropicClient();
        await client.messages.create({
          model: 'claude-3-sonnet-20240229',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hello' }]
        });
      } else if (configProvider === AI_PROVIDERS.MISTRAL) {
        const client = await getMistralClient();
        await client.chat([{ role: 'user', content: 'Hello' }], { max_tokens: 10 });
      }

      return true;
    } catch (error) {
      logger.error('AI service status check failed:', { message: error.message, service: serviceName });
      return false;
    }
  },

  async generateResponse(prompt, options = {}) {
    try {
      // Check cache first
      const cacheKey = JSON.stringify({ prompt, options });
      if (aiResponseCache.has(cacheKey)) {
        return aiResponseCache.get(cacheKey);
      }

      const provider = await configManager.getAIProvider();
      let response;

      if (provider === AI_PROVIDERS.OPENAI) {
        const client = await getOpenAIClient();
        response = await client.chat.completions.create({
          model: options.model || 'gpt-4',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: options.max_tokens || 1000,
          temperature: options.temperature || 0.7
        });
        response = response.choices[0].message.content;
      } else if (provider === AI_PROVIDERS.ANTHROPIC) {
        const client = await getAnthropicClient();
        const anthropicResponse = await client.messages.create({
          model: options.model || 'claude-3-sonnet-20240229',
          max_tokens: options.max_tokens || 1000,
          messages: [{ role: 'user', content: prompt }]
        });
        response = anthropicResponse.content[0].text;
      } else if (provider === AI_PROVIDERS.MISTRAL) {
        const client = await getMistralClient();
        response = await client.chat(
          [{ role: 'user', content: prompt }],
          {
            model: options.model || 'mistral-large-latest',
            max_tokens: options.max_tokens || 1000,
            temperature: options.temperature || 0.7
          }
        );
      } else {
        throw new Error(`Unsupported AI provider: ${provider}`);
      }

      aiResponseCache.set(cacheKey, response);
      return response;
    } catch (error) {
      if (error.message && error.message.includes('429')) {
        logger.error('AI service rate limit reached (429):', { message: error.message, service: serviceName });
        return '⚠️ The AI service is currently overloaded or your usage limit has been reached. Please wait a few minutes and try again, or consider upgrading your service tier.';
      }
      logger.error('AI service response generation failed:', { message: error.message, service: serviceName });
      throw error;
    }
  },

  async handleConversation(query, username = 'there') {
    try {
      // Check cache first
      const cacheKey = `conversation:${query}`;
      if (aiResponseCache.has(cacheKey)) {
        return aiResponseCache.get(cacheKey);
      }

      const { type } = detectConversationType(query);

      // Handle simple cases without calling the AI
      switch (type) {
        case CONVERSATION_TYPES.GREETING:
          return `Hello ${username}! 👋 I'm GitMate, your Git assistant. How can I help you with version control today?`;
        case CONVERSATION_TYPES.THANKS:
          return `You're welcome, ${username}! 😊 Let me know if you need any more help with Git or GitHub.`;
        case CONVERSATION_TYPES.UNRELATED:
          return `Hey ${username}, I'm specialized in Git operations. I can help you with version control, repositories, and GitHub-related tasks. What would you like to do with your code?`;
        case CONVERSATION_TYPES.HELP:
          return this.generateCommandHelp();
      }

      // For Git/GitHub operations or complex cases, use the AI
      const prompt = `You are GitMate, a friendly Git/GitHub assistant. The user "${username}" asked: "${query}"

      Your response should be:
      1. For Git/GitHub operations: Explain what will happen or ask for clarification
      2. For greetings: Friendly response that invites Git-related questions
      3. For unrelated questions: Politely explain you focus on Git/GitHub
      4. For thanks: Warm acknowledgment
      5. Always be concise and helpful

      Response:`;

      const response = await this.generateResponse(prompt, { max_tokens: 300 });
      aiResponseCache.set(cacheKey, response);
      return response;
    } catch (error) {
      logger.error('Conversation handling failed:', { message: error.message, service: serviceName });
      return `Sorry ${username}, I'm having trouble understanding. Could you rephrase your request in terms of Git or GitHub operations?`;
    }
  },

  async parseIntent(query) {
    try {
      // First check if this is a conversation rather than a Git command
      const { type } = detectConversationType(query);
      if (type !== CONVERSATION_TYPES.GIT_OPERATION && type !== CONVERSATION_TYPES.GITHUB_OPERATION) {
        return { intent: type, entities: {} };
      }

      // Check cache for Git operations
      const cacheKey = `intent:${query}`;
      if (aiResponseCache.has(cacheKey)) {
        return aiResponseCache.get(cacheKey);
      }

      const prompt = `Analyze this Git/GitHub command and extract the intent and entities. Return a JSON object with:
      - intent: The main action (push_changes, create_branch, git_commit, create_pr, etc.)
      - entities: Object with relevant parameters (branch, commit_message, files, etc.)
      - confidence: Your confidence score (0-1)
      
      Query: "${query}"
      
      Return only valid JSON:`;

      const response = await this.generateResponse(prompt, { max_tokens: 500, temperature: 0.2 });
      
      let parsed;
      try {
        // Handle markdown-wrapped JSON responses
        let jsonContent = response.trim();
        if (jsonContent.startsWith('```json')) {
          jsonContent = jsonContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (jsonContent.startsWith('```')) {
          jsonContent = jsonContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }
        parsed = JSON.parse(jsonContent);
      } catch (parseError) {
        logger.error('Failed to parse AI response as JSON:', { response, error: parseError.message, service: serviceName });
        parsed = { intent: 'unknown', entities: { error: 'Failed to parse response' } };
      }

      // Add default values for common entities
      parsed.entities = parsed.entities || {};
      if (parsed.intent === 'push_changes' && !parsed.entities.branch) {
        parsed.entities.branch = 'current';
      }
      if (!parsed.entities.remote && (parsed.intent === 'push_changes' || parsed.intent === 'pull_changes')) {
        parsed.entities.remote = 'origin';
      }

      aiResponseCache.set(cacheKey, parsed);
      return parsed;
    } catch (error) {
      if (error.message && error.message.includes('429')) {
        logger.error('AI service rate limit reached (429):', { message: error.message, service: serviceName });
        return { intent: 'error', entities: { error: '⚠️ The AI service is currently overloaded. Please wait a few minutes and try again.' } };
      }
      logger.error('Intent parsing failed:', { message: error.message, service: serviceName });
      return { intent: 'unknown', entities: { error: error.message } };
    }
  },

  async generateConfirmation(parsed, username = 'there') {
    try {
      // Handle non-Git operations
      if (['greeting', 'thanks', 'unrelated', 'help'].includes(parsed.intent)) {
        return this.handleConversation(parsed.intent, username);
      }

      const prompt = `Generate a clear, friendly confirmation message for this Git operation for user "${username}":

      Intent: ${parsed.intent}
      Entities: ${JSON.stringify(parsed.entities, null, 2)}
      
      Write a brief, natural confirmation message that:
      1. Explains what will happen
      2. Uses the user's name if available
      3. Asks for confirmation if needed
      4. Is warm and professional
      
      Message:`;

      return await this.generateResponse(prompt, { max_tokens: 200 });
    } catch (error) {
      logger.error('Confirmation generation failed:', { message: error.message, service: serviceName });
      return `I'll perform the ${parsed.intent} operation. Let me know if you'd like to proceed.`;
    }
  },

  async generateCommitMessage(diff) {
    try {
      if (!diff?.trim()) {
        return 'chore: no changes detected';
      }

      const prompt = `Analyze this Git diff and generate a concise, conventional commit message:

      ${diff.substring(0, 2000)}
      
      Generate a commit message in the format: <type>(<scope>): <description>
      
      Common types:
      - feat: New feature
      - fix: Bug fix
      - docs: Documentation changes
      - style: Code style/formatting
      - refactor: Code refactoring
      - perf: Performance improvement
      - test: Test changes
      - chore: Maintenance/boring tasks
      
      Commit message:`;

      const response = await this.generateResponse(prompt, { max_tokens: 100, temperature: 0.3 });
      return response.trim().replace(/^["']|["']$/g, '');
    } catch (error) {
      logger.error('Commit message generation failed:', { message: error.message, service: serviceName });
      return 'fix: code changes';
    }
  },

  async generateGitignore(projectDescription) {
    try {
      const prompt = `Generate a comprehensive .gitignore file for this project:

      Project: ${projectDescription}
      
      Include patterns for:
      - Operating system files
      - IDE/editor files
      - Build artifacts
      - Dependencies
      - Logs
      - Environment files
      - Project-specific exclusions
      
      .gitignore:`;

      return await this.generateResponse(prompt, { max_tokens: 800, temperature: 0.1 });
    } catch (error) {
      logger.error('Gitignore generation failed:', { message: error.message, service: serviceName });
      return '# Default gitignore\n*.log\n*.tmp\nnode_modules/\n.env\n';
    }
  },

  async generateCommandHelp() {
    try {
      const prompt = `Generate a helpful message showing common GitMate commands and examples. 
      Make it friendly, concise, and format it nicely with emojis where appropriate.
      Include basic Git operations and GitHub-related commands.`;

      return await this.generateResponse(prompt, { max_tokens: 400 });
    } catch (error) {
      logger.error('Help generation failed:', { message: error.message, service: serviceName });
      return `Here are some common Git commands I can help with:
      - git push/pull
      - git commit
      - git branch
      - git merge
      - GitHub PRs/issues
      Ask me about any of these!`;
    }
  },

  async handleUserQuery(query, username = null) {
    try {
      // First detect the conversation type
      const { type, response, immediate } = detectConversationType(query, username);

      // If we have an immediate response, return it directly
      if (immediate && response) {
        return { response, requiresConfirmation: false };
      }
      if (immediate && type === CONVERSATION_TYPES.HELP) {
        const helpResponse = await this.generateCommandHelp();
        return { response: helpResponse, requiresConfirmation: false };
      }

      // For Git operations, parse the intent and prepare confirmation
      if (type === CONVERSATION_TYPES.GIT_OPERATION || type === CONVERSATION_TYPES.GITHUB_OPERATION) {
        const parsedIntent = await this.parseIntent(query);
        const confirmation = await this.generateConfirmation(parsedIntent, username);
        return { 
          response: confirmation,
          intent: parsedIntent,
          requiresConfirmation: true 
        };
      }

      // Fallback for any other cases
      return { 
        response: response || "I'm not sure how to help with that. I specialize in Git and GitHub operations.",
        requiresConfirmation: false
      };
    } catch (error) {
      logger.error('Error handling user query:', { message: error.message, service: serviceName });
      return {
        response: "Sorry, I encountered an error processing your request. Could you try again?",
        requiresConfirmation: false
      };
    }
  }
};