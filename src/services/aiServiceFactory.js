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

let currentProvider = AI_PROVIDERS.MISTRAL;
let openaiClient = null;
let anthropicClient = null;
let mistralClient = null;

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
    // Use the Vercel proxy endpoint
    const mistralProxyUrl = process.env.MISTRAL_PROXY_URL || 'https://gitbot-jtp2.onrender.com/api/mistral';
    console.log('mistralProxyUrl', mistralProxyUrl);
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
        // Adapt to the expected return value
        return data.choices?.[0]?.message?.content || data.choices?.[0]?.text || data;
      }
    };
  }
  return mistralClient;
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
      console.log('configProvider', configProvider);
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
      const provider = await configManager.getAIProvider();
      
      if (provider === AI_PROVIDERS.OPENAI) {
        const client = await getOpenAIClient();
        const response = await client.chat.completions.create({
          model: options.model || 'gpt-4',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: options.max_tokens || 1000,
          temperature: options.temperature || 0.7
        });
        return response.choices[0].message.content;
      } else if (provider === AI_PROVIDERS.ANTHROPIC) {
        const client = await getAnthropicClient();
        const response = await client.messages.create({
          model: options.model || 'claude-3-sonnet-20240229',
          max_tokens: options.max_tokens || 1000,
          messages: [{ role: 'user', content: prompt }]
        });
        return response.content[0].text;
      } else if (provider === AI_PROVIDERS.MISTRAL) {
        const client = await getMistralClient();
        const response = await client.chat(
          [{ role: 'user', content: prompt }],
          {
            model: options.model || 'mistral-large-latest',
            max_tokens: options.max_tokens || 1000,
            temperature: options.temperature || 0.7
          }
        );
        return response;
      } else {
        throw new Error(`Unsupported AI provider: ${provider}`);
      }
    } catch (error) {
      logger.error('AI service response generation failed:', { message: error.message, service: serviceName });
      throw error;
    }
  },

  async parseIntent(query) {
    try {
      const provider = await configManager.getAIProvider();
      const prompt = `Analyze this Git command and extract the intent and entities. Return a JSON object with:
- intent: The main action (push_changes, create_branch, git_commit, etc.)
- entities: Object with relevant parameters (branch, commit_message, files, etc.)

Query: "${query}"

Return only valid JSON:`;

      const response = await this.generateResponse(prompt, { max_tokens: 500 });
      
      try {
        // Handle markdown-wrapped JSON responses
        let jsonContent = response.trim();
        
        // Remove markdown code blocks if present
        if (jsonContent.startsWith('```json')) {
          jsonContent = jsonContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (jsonContent.startsWith('```')) {
          jsonContent = jsonContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }
        
        const parsed = JSON.parse(jsonContent);
        return parsed;
      } catch (parseError) {
        logger.error('Failed to parse AI response as JSON:', { response, error: parseError.message, service: serviceName });
        return { intent: 'unknown', entities: { error: 'Failed to parse response' } };
      }
    } catch (error) {
      logger.error('Intent parsing failed:', { message: error.message, service: serviceName });
      return { intent: 'unknown', entities: { error: error.message } };
    }
  },

  async generateConfirmation(parsed) {
    try {
      const prompt = `Generate a clear, user-friendly confirmation message for this Git operation:

Intent: ${parsed.intent}
Entities: ${JSON.stringify(parsed.entities, null, 2)}

Write a brief, natural confirmation message that explains what will happen:`;

      return await this.generateResponse(prompt, { max_tokens: 200 });
    } catch (error) {
      logger.error('Confirmation generation failed:', { message: error.message, service: serviceName });
      return null;
    }
  },

  async generateCommitMessage(diff) {
    try {
      const prompt = `Analyze this Git diff and generate a concise, conventional commit message:

${diff}

Generate a commit message in the format: <type>(<scope>): <description>

Examples:
- feat(auth): add user authentication system
- fix(ui): resolve button alignment issue
- docs(readme): update installation instructions

Commit message:`;

      return await this.generateResponse(prompt, { max_tokens: 100 });
    } catch (error) {
      logger.error('Commit message generation failed:', { message: error.message, service: serviceName });
      return null;
    }
  },

  async generateGitignore(projectDescription) {
    try {
      const prompt = `Generate a comprehensive .gitignore file for this project:

Project: ${projectDescription}

Generate a .gitignore file with appropriate entries for this type of project. Include common patterns for:
- Operating system files
- IDE/editor files
- Build artifacts
- Dependencies
- Logs
- Environment files

.gitignore:`;

      return await this.generateResponse(prompt, { max_tokens: 800 });
    } catch (error) {
      logger.error('Gitignore generation failed:', { message: error.message, service: serviceName });
      return null;
    }
  },

  async generateCommandHelp() {
    try {
      const prompt = `Generate a helpful message showing common GitMate commands and examples. Make it friendly and easy to understand.`;

      return await this.generateResponse(prompt, { max_tokens: 400 });
    } catch (error) {
      logger.error('Help generation failed:', { message: error.message, service: serviceName });
      return null;
    }
  }
};