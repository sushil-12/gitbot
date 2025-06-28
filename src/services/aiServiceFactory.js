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
    const mistralProxyUrl ='https://gitbot-1-24a9.onrender.com/api/mistral';
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
        
        // Better response handling
        if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
          return data.choices[0].message.content;
        } else if (data.choices && data.choices[0] && data.choices[0].text) {
          return data.choices[0].text;
        } else if (typeof data === 'string') {
          return data;
        } else {
          throw new Error('Invalid response format from Mistral proxy');
        }
      }
    };
  }
  return mistralClient;
}

// Helper function to detect conversation type
function detectConversationType(query) {
  const lowerQuery = query.toLowerCase().trim();
  
  // Greetings
  const greetings = ['hello', 'hi', 'hey', 'greetings', 'good morning', 'good afternoon', 'good evening'];
  if (greetings.some(g => lowerQuery.includes(g))) {
    return { type: CONVERSATION_TYPES.GREETING, response: null, immediate: true };
  }
  
  // Thanks
  const thanks = ['thank', 'thanks', 'appreciate', 'thx'];
  if (thanks.some(t => lowerQuery.includes(t))) {
    return { type: CONVERSATION_TYPES.THANKS, response: null, immediate: true };
  }
  
  // Help requests
  const helpKeywords = ['help', 'what can you do', 'how to', 'examples', 'commands'];
  if (helpKeywords.some(h => lowerQuery.includes(h))) {
    return { type: CONVERSATION_TYPES.HELP, response: null, immediate: true };
  }
  
  // Show/display operations - check these before help keywords
  if (lowerQuery.includes('show') || lowerQuery.includes('display')) {
    if (lowerQuery.includes('status') || lowerQuery.includes('state')) {
      return { type: CONVERSATION_TYPES.GIT_OPERATION, response: null, immediate: false };
    }
    if (lowerQuery.includes('diff') || lowerQuery.includes('difference')) {
      return { type: CONVERSATION_TYPES.GIT_OPERATION, response: null, immediate: false };
    }
    if (lowerQuery.includes('remote') || lowerQuery.includes('remotes')) {
      return { type: CONVERSATION_TYPES.GIT_OPERATION, response: null, immediate: false };
    }
    if (lowerQuery.includes('branch') || lowerQuery.includes('branches')) {
      return { type: CONVERSATION_TYPES.GIT_OPERATION, response: null, immediate: false };
    }
    if (lowerQuery.includes('log') || lowerQuery.includes('history') || lowerQuery.includes('commits')) {
      return { type: CONVERSATION_TYPES.GIT_OPERATION, response: null, immediate: false };
    }
    if (lowerQuery.includes('change') || lowerQuery.includes('changes')) {
      return { type: CONVERSATION_TYPES.GIT_OPERATION, response: null, immediate: false };
    }
  }
  
  // List operations - be more specific
  if (lowerQuery.includes('list')) {
    // List repositories
    if (lowerQuery.includes('repo') || lowerQuery.includes('repository') || 
        (lowerQuery.includes('all') && lowerQuery.includes('my') && lowerQuery.includes('repo'))) {
      return { type: CONVERSATION_TYPES.GITHUB_OPERATION, response: null, immediate: false };
    }
    
    // List branches
    if (lowerQuery.includes('branch') || lowerQuery.includes('branches')) {
      return { type: CONVERSATION_TYPES.GIT_OPERATION, response: null, immediate: false };
    }
    
    // List remotes
    if (lowerQuery.includes('remote') || lowerQuery.includes('remotes')) {
      return { type: CONVERSATION_TYPES.GIT_OPERATION, response: null, immediate: false };
    }
    
    // List changes (Git status)
    if (lowerQuery.includes('change') || lowerQuery.includes('changes') || 
        lowerQuery.includes('modified') || lowerQuery.includes('staged')) {
      return { type: CONVERSATION_TYPES.GIT_OPERATION, response: null, immediate: false };
    }
    
    // List commits/log
    if (lowerQuery.includes('commit') || lowerQuery.includes('log') || 
        lowerQuery.includes('history') || lowerQuery.includes('commits')) {
      return { type: CONVERSATION_TYPES.GIT_OPERATION, response: null, immediate: false };
    }
  }
  
  // Git operations
  const gitKeywords = ['git', 'push', 'pull', 'commit', 'branch', 'merge', 'rebase', 'checkout', 'switch', 'add', 'stash', 'reset', 'revert'];
  if (gitKeywords.some(k => lowerQuery.includes(k))) {
    return { type: CONVERSATION_TYPES.GIT_OPERATION, response: null, immediate: false };
  }
  
  // GitHub operations
  const githubKeywords = ['github', 'pull request', 'pr', 'issue', 'repository', 'repo', 'fork', 'clone'];
  if (githubKeywords.some(k => lowerQuery.includes(k))) {
    return { type: CONVERSATION_TYPES.GITHUB_OPERATION, response: null, immediate: false };
  }

  // Pull request specific detection
  if (lowerQuery.includes('pr') || lowerQuery.includes('pull request') || 
      lowerQuery.includes('merge request') || lowerQuery.includes('create pr') ||
      lowerQuery.includes('create pull request') || lowerQuery.includes('create merge request')) {
    return { type: CONVERSATION_TYPES.GITHUB_OPERATION, response: null, immediate: false };
  }
  
  // Check if it's unrelated to Git/GitHub
  const unrelatedKeywords = ['weather', 'time', 'date', 'calculator', 'math', 'translate', 'search'];
  if (unrelatedKeywords.some(k => lowerQuery.includes(k))) {
    return { type: CONVERSATION_TYPES.UNRELATED, response: null, immediate: true };
  }
  
  // Default to Git operation for ambiguous cases
  return { type: CONVERSATION_TYPES.GIT_OPERATION, response: null, immediate: false };
}

export const aiService = {
  async checkStatus() {
    try {
      // Prefer Mistral if its API key is present
      let apiKey = "mistral";
      
      if (apiKey) {
        const client = await getMistralClient();
        await client.chat([{ role: 'user', content: 'Hello' }], { max_tokens: 10 });
        return true;
      }

      // Check if we have local config
      // const isConfigured = await configManager.isConfigured();
      // if (!isConfigured) {
      //   logger.warn('GitMate is not configured. Users can set AI_PROVIDER and API key environment variables or run "gitmate init" to set up.', { service: serviceName });
      //   return false;
      // }

      // const configProvider = await configManager.getAIProvider();
      // const configApiKey = await configManager.getAPIKey();
      
      // if (!configApiKey) {
      //   logger.warn('API key not configured. Users can set AI_PROVIDER and API key environment variables or run "gitmate init" to set up.', { service: serviceName });
      //   return false;
      // }

      // Test the connection
      const client = await getMistralClient();
      await client.chat([{ role: 'user', content: 'Hello' }], { max_tokens: 10 });

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
      const cacheKey = `intent_${query.toLowerCase().trim()}`;
      const cached = aiResponseCache.get(cacheKey);
      if (cached) {
        return cached;
      }

      // Enhanced prompt for better intent understanding
      const prompt = `Analyze this Git/GitHub command and extract the intent and entities. Be very specific about the context.

      Query: "${query}"
      
      Important context clues:
      - "list my changes" = git status (show modified/staged files)
      - "list my branches" = list local branches
      - "list my repos" = list GitHub repositories
      - "show status" = git status
      - "show diff" = git diff
      - "show log" = git log
      - "push changes" = git push
      - "pull changes" = git pull
      - "commit changes" = git commit
      - "create pr" = create_pull_request
      - "create pull request" = create_pull_request
      - "create merge request" = create_pull_request
      - "make a pr" = create_pull_request
      - "open a pr" = create_pull_request
      - "can you create a pr" = create_pull_request
      
      Return a JSON object with:
      - intent: The main action (list_repos, list_branches, git_status, git_diff, git_log, push_changes, create_pr, etc.)
      - entities: Object with relevant parameters (branch, commit_message, files, head_branch, base_branch, title, body, etc.)
      - confidence: Your confidence score (0-1)
      
      Return only valid JSON:`;

      const response = await this.generateResponse(prompt, { max_tokens: 500, temperature: 0.1 });
      
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
        // Try to extract JSON from the response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            parsed = JSON.parse(jsonMatch[0]);
          } catch (secondError) {
            parsed = { intent: 'unknown', entities: { error: 'Failed to parse response' } };
          }
        } else {
          parsed = { intent: 'unknown', entities: { error: 'Failed to parse response' } };
        }
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

      // Create specific confirmation messages based on intent
      const intentMessages = {
        'list_repos': `Hi ${username}, I'll fetch and display your GitHub repositories. Ready to proceed?`,
        'list_branches': `Hi ${username}, I'll show you all the branches in this repository. Ready to proceed?`,
        'git_status': `Hi ${username}, I'll show you the current status of your Git repository (staged, modified, and untracked files). Ready to proceed?`,
        'git_diff': `Hi ${username}, I'll show you the differences in your working directory. Ready to proceed?`,
        'git_log': `Hi ${username}, I'll show you the commit history. Ready to proceed?`,
        'get_remotes': `Hi ${username}, I'll show you the configured remote repositories. Ready to proceed?`,
        'create_repo': `Hi ${username}, I'll create a new repository for you. Ready to proceed?`,
        'push_changes': `Hi ${username}, I'll push your changes to the remote repository. Ready to proceed?`,
        'git_commit': `Hi ${username}, I'll commit your staged changes. Ready to proceed?`,
        'git_add': `Hi ${username}, I'll stage the specified files. Ready to proceed?`,
        'create_branch': `Hi ${username}, I'll create a new branch for you. Ready to proceed?`,
        'checkout_branch': `Hi ${username}, I'll switch to the specified branch. Ready to proceed?`,
        'pull_changes': `Hi ${username}, I'll pull the latest changes from the remote. Ready to proceed?`,
        'merge_branch': `Hi ${username}, I'll merge the specified branch. Ready to proceed?`,
        'clone_repo': `Hi ${username}, I'll clone the repository for you. Ready to proceed?`,
        'revert_commit': `Hi ${username}, I'll revert the specified commit. Ready to proceed?`,
        'create_pr': `Hi ${username}, I'll create a pull request for you. Ready to proceed?`,
        'set_default_branch': `Hi ${username}, I'll set the default branch. Ready to proceed?`,
        'configure_git_user': `Hi ${username}, I'll configure your Git user settings. Ready to proceed?`,
        'get_current_branch': `Hi ${username}, I'll show you the current branch. Ready to proceed?`,
        'add_remote': `Hi ${username}, I'll add a new remote repository. Ready to proceed?`,
        'get_diff_between_branches': `Hi ${username}, I'll show you the differences between branches. Ready to proceed?`,
        'create_and_checkout_branch': `Hi ${username}, I'll create and switch to a new branch. Ready to proceed?`,
        'git_init': `Hi ${username}, I'll initialize a new Git repository. Ready to proceed?`,
        'git_revert_last_commit': `Hi ${username}, I'll revert the last commit. Ready to proceed?`
      };

      // Return specific message if available, otherwise generic
      return intentMessages[parsed.intent] || `Hi ${username}, I'll perform the ${parsed.intent} operation. Ready to proceed?`;
    } catch (error) {
      logger.error('Confirmation generation failed:', { message: error.message, service: serviceName });
      return `Hi ${username}, I'll perform the ${parsed.intent} operation. Ready to proceed?`;
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
      const { type, response, immediate } = detectConversationType(query);

      // If we have an immediate response, return it directly
      if (immediate && response) {
        return { response, requiresConfirmation: false };
      }
      if (immediate && type === CONVERSATION_TYPES.HELP) {
        const helpResponse = await this.generateCommandHelp();
        return { response: helpResponse, requiresConfirmation: false };
      }
      if (immediate && type === CONVERSATION_TYPES.UNRELATED) {
        return { 
          response: response || "I'm specialized in Git operations. I can help you with version control, repositories, and GitHub-related tasks.",
          requiresConfirmation: false 
        };
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

      // For greetings and thanks, handle immediately
      if (type === CONVERSATION_TYPES.GREETING || type === CONVERSATION_TYPES.THANKS) {
        const conversationResponse = await this.handleConversation(type, username);
        return { response: conversationResponse, requiresConfirmation: false };
      }

      // Fallback: treat as Git operation
      const parsedIntent = await this.parseIntent(query);
      const confirmation = await this.generateConfirmation(parsedIntent, username);
      return { 
        response: confirmation,
        intent: parsedIntent,
        requiresConfirmation: true 
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