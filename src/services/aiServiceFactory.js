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
    // const mistralProxyUrl = 'http://localhost:3000/api/mistral';
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
        console.log('🔍 Mistral response:', data.choices[0].message);
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

      // Enhanced prompt with better intent classification and reduced bias
      const prompt = `You are an intelligent intent parser for Git and GitHub commands. Analyze this query: "${query}"

IMPORTANT: Respond with ONLY a valid JSON object. No text, no explanation, no markdown, no code blocks.

Required JSON format:
{
  "intent": "intent_name",
  "entities": {},
  "confidence": 0.9
}

CRITICAL RULES:
1. DO NOT default to create_repo unless explicitly creating a repository
2. "List", "show", "display" commands should be list_repos, list_branches, git_status, etc.
3. "Push" commands should be push_changes
4. "Pull" commands should be pull_changes
5. "Commit" commands should be git_commit
6. "Add" commands should be git_add
7. "Status" or "what's changed" should be git_status
8. "Diff" or "differences" should be git_diff
9. "Branch" listing should be list_branches
10. "PR" or "pull request" should be create_pr
11. "Help" or "what can you do" should be help
12. "Login", "authenticate" should be greeting
13. "Clone" should be clone_repo
14. "Delete" should be unknown (not implemented)

Available intents: list_repos, list_branches, git_status, git_diff, git_log, push_changes, pull_changes, git_commit, git_add, create_branch, checkout_branch, merge_branch, clone_repo, create_repo, create_pr, revert_commit, greeting, thanks, unrelated, help, error, unknown

EXACT MAPPINGS:
- "list my repositories" → list_repos
- "show my repos" → list_repos  
- "what repositories do I have" → list_repos
- "display my repos" → list_repos
- "show repositories" → list_repos
- "list all repos" → list_repos
- "create a new repository" → create_repo
- "create repository" → create_repo
- "new repository" → create_repo
- "make a repo" → create_repo
- "create a repo" → create_repo
- "show branches" → list_branches
- "list branches" → list_branches
- "show status" → git_status
- "what's changed" → git_status
- "current status" → git_status
- "show diff" → git_diff
- "show differences" → git_diff
- "show log" → git_log
- "show history" → git_log
- "push changes" → push_changes
- "push my changes" → push_changes
- "pull changes" → pull_changes
- "pull latest" → pull_changes
- "commit" → git_commit
- "add files" → git_add
- "stage changes" → git_add
- "create branch" → create_branch
- "checkout branch" → checkout_branch
- "switch branch" → checkout_branch
- "merge branch" → merge_branch
- "clone repo" → clone_repo
- "create pull request" → create_pr
- "open a PR" → create_pr
- "create pr" → create_pr
- "submit a pull request" → create_pr
- "make a merge request" → create_pr
- "revert commit" → revert_commit
- "login" → greeting
- "authenticate" → greeting
- "help" → help
- "what can you do" → help

IMPORTANT: Only use create_repo when explicitly creating a new repository. For listing, showing, or managing existing repositories, use list_repos.

JSON response:`;

      const response = await this.generateResponse(prompt, { max_tokens: 200, temperature: 0.1 });
      
      console.log('🔍 Intent parsing response:', response);
      
      let parsed;
      try {
        // Handle markdown-wrapped JSON responses
        let jsonContent = response.trim();
        if (jsonContent.startsWith('```json')) {
          jsonContent = jsonContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (jsonContent.startsWith('```')) {
          jsonContent = jsonContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }
        console.log('🔍 Cleaned JSON content:', jsonContent);
        parsed = JSON.parse(jsonContent);
      } catch (parseError) {
        console.log('🔍 JSON parse error:', parseError.message);
        // Try to extract JSON from the response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            parsed = JSON.parse(jsonMatch[0]);
            console.log('🔍 Extracted JSON from response');
          } catch (secondError) {
            console.log('🔍 Failed to parse extracted JSON, using fallback');
            parsed = this.fallbackIntentDetection(query);
          }
        } else {
          console.log('🔍 No JSON found in response, using fallback');
          // Fallback to keyword-based intent detection
          parsed = this.fallbackIntentDetection(query);
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

      // Validate and correct obvious misclassifications
      parsed = this.validateAndCorrectIntent(query, parsed);
      
      // Additional validation: if we got list_repos but the query doesn't match repository listing patterns
      if (parsed.intent === 'list_repos') {
        const lowerQuery = query.toLowerCase();
        const isRepoListing = lowerQuery.includes('repo') || lowerQuery.includes('repository');
        const isListingAction = lowerQuery.includes('list') || lowerQuery.includes('show') || 
                               lowerQuery.includes('display') || lowerQuery.includes('what');
        
        // If it's not clearly a repository listing command, try to determine the correct intent
        if (!isRepoListing || !isListingAction) {
          const correctedIntent = this.determineCorrectIntent(query);
          if (correctedIntent && correctedIntent !== 'list_repos') {
            console.log(`🔍 Corrected list_repo → ${correctedIntent}`);
            parsed.intent = correctedIntent;
            parsed.entities = {};
          }
        }
      }
      
      // Fix git_add misclassifications for git_init
      if (parsed.intent === 'git_add' && query.toLowerCase().includes('init')) {
        parsed.intent = 'git_init';
        parsed.entities = {};
        console.log('🔍 Corrected git_add → git_init');
      }
      
      // Fix unknown intent for authentication and help
      if (parsed.intent === 'unknown') {
        const lowerQuery = query.toLowerCase();
        if (lowerQuery.includes('login') || lowerQuery.includes('logout') || lowerQuery.includes('authenticate')) {
          parsed.intent = 'greeting';
          console.log('🔍 Corrected unknown → greeting');
        } else if (lowerQuery.includes('help') || lowerQuery.includes('what can') || lowerQuery.includes('how do i')) {
          parsed.intent = 'help';
          console.log('🔍 Corrected unknown → help');
        }
      }
      
      // Fix greeting intent for help queries
      if (parsed.intent === 'greeting' && query.toLowerCase().includes('how do i')) {
        parsed.intent = 'help';
        console.log('🔍 Corrected greeting → help');
      }
      
      // Fix pull_changes for pull request queries
      if (parsed.intent === 'pull_changes' && 
          (query.toLowerCase().includes('pull request') || query.toLowerCase().includes('pr'))) {
        parsed.intent = 'create_pr';
        console.log('🔍 Corrected pull_changes → create_pr');
      }

      aiResponseCache.set(cacheKey, parsed);
      console.log('🔍 Final parsed intent:', parsed);
      return parsed;
    } catch (error) {
      if (error.message && error.message.includes('429')) {
        logger.error('AI service rate limit reached (429):', { message: error.message, service: serviceName });
        return { intent: 'error', entities: { error: '⚠️ The AI service is currently overloaded. Please wait a few minutes and try again.' } };
      }

      logger.error('Intent parsing failed:', { message: error.message, service: serviceName });
      console.log('🔍 Intent parsing error:', { message: error.message, service: serviceName });
      return { intent: 'unknown', entities: { error: error.message } };
    }
  },

  // New method to validate and correct obvious misclassifications
  validateAndCorrectIntent(query, parsed) {
    const lowerQuery = query.toLowerCase();
    
    // Fix common misclassifications
    if (parsed.intent === 'create_repo') {
      // Check if this should actually be list_repos
      if (lowerQuery.includes('list') || lowerQuery.includes('show') || 
          lowerQuery.includes('display') || lowerQuery.includes('what') ||
          lowerQuery.includes('my repositories') || lowerQuery.includes('my repos')) {
        parsed.intent = 'list_repos';
        parsed.entities = {}; // Clear incorrect entities
        console.log('🔍 Corrected create_repo → list_repos');
      }
    }
    
    // Fix git status misclassifications
    if (parsed.intent === 'create_repo' && 
        (lowerQuery.includes('status') || lowerQuery.includes('changed') || 
         lowerQuery.includes('what\'s changed') || lowerQuery.includes('current status'))) {
      parsed.intent = 'git_status';
      parsed.entities = {};
      console.log('🔍 Corrected create_repo → git_status');
    }
    
    // Fix git diff misclassifications
    if (parsed.intent === 'create_repo' && 
        (lowerQuery.includes('diff') || lowerQuery.includes('differences'))) {
      parsed.intent = 'git_diff';
      parsed.entities = {};
      console.log('🔍 Corrected create_repo → git_diff');
    }
    
    // Fix list_branches misclassifications
    if (parsed.intent === 'create_repo' && 
        (lowerQuery.includes('branches') && (lowerQuery.includes('list') || lowerQuery.includes('show')))) {
      parsed.intent = 'list_branches';
      parsed.entities = {};
      console.log('🔍 Corrected create_repo → list_branches');
    }
    
    // Fix push_changes misclassifications
    if (parsed.intent === 'create_repo' && lowerQuery.includes('push')) {
      parsed.intent = 'push_changes';
      parsed.entities = { branch: 'current', remote: 'origin' };
      console.log('🔍 Corrected create_repo → push_changes');
    }
    
    // Fix pull_changes misclassifications
    if (parsed.intent === 'create_repo' && lowerQuery.includes('pull')) {
      parsed.intent = 'pull_changes';
      parsed.entities = { remote: 'origin' };
      console.log('🔍 Corrected create_repo → pull_changes');
    }
    
    // Fix create_pr misclassifications
    if (parsed.intent === 'create_repo' && 
        (lowerQuery.includes('pull request') || lowerQuery.includes('pr') || 
         lowerQuery.includes('merge request'))) {
      parsed.intent = 'create_pr';
      parsed.entities = {};
      console.log('🔍 Corrected create_repo → create_pr');
    }
    
    // Fix help misclassifications
    if (parsed.intent === 'create_repo' && 
        (lowerQuery.includes('help') || lowerQuery.includes('what can') || 
         lowerQuery.includes('capabilities'))) {
      parsed.intent = 'help';
      parsed.entities = {};
      console.log('🔍 Corrected create_repo → help');
    }
    
    // Fix git_add misclassifications
    if (parsed.intent === 'push_changes' && 
        (lowerQuery.includes('stage') || lowerQuery.includes('add') && !lowerQuery.includes('push'))) {
      parsed.intent = 'git_add';
      parsed.entities = {};
      console.log('🔍 Corrected push_changes → git_add');
    }
    
    return parsed;
  },

  // New method to determine correct intent when list_repos is incorrectly returned
  determineCorrectIntent(query) {
    const lowerQuery = query.toLowerCase();
    
    // Git status and changes
    if (lowerQuery.includes('status') || lowerQuery.includes('what\'s changed') || 
        lowerQuery.includes('current status') || lowerQuery.includes('changed') ||
        lowerQuery.includes('what changed')) {
      return 'git_status';
    }
    
    // Git diff
    if (lowerQuery.includes('diff') || lowerQuery.includes('difference') || lowerQuery.includes('differences')) {
      return 'git_diff';
    }
    
    // Branch operations
    if (lowerQuery.includes('branch')) {
      if (lowerQuery.includes('list') || lowerQuery.includes('show') || lowerQuery.includes('display')) {
        return 'list_branches';
      }
      if (lowerQuery.includes('create') || lowerQuery.includes('new')) {
        return 'create_branch';
      }
      if (lowerQuery.includes('checkout') || lowerQuery.includes('switch')) {
        return 'checkout_branch';
      }
    }
    
    // Git operations
    if (lowerQuery.includes('push')) {
      return 'push_changes';
    }
    if (lowerQuery.includes('pull') || lowerQuery.includes('sync')) {
      return 'pull_changes';
    }
    if (lowerQuery.includes('commit')) {
      return 'git_commit';
    }
    if (lowerQuery.includes('add') || lowerQuery.includes('stage')) {
      return 'git_add';
    }
    
    // Pull request operations - PRIORITIZE over pull operations
    if (lowerQuery.includes('pr') || lowerQuery.includes('pull request') || lowerQuery.includes('merge request') ||
        lowerQuery.includes('create a pull') || lowerQuery.includes('submit a pull')) {
      return 'create_pr';
    }
    
    // Git operations - PRIORITIZE these over generic repo operations
    if (lowerQuery.includes('push')) {
      return 'push_changes';
    }
    if (lowerQuery.includes('pull') || lowerQuery.includes('sync')) {
      return 'pull_changes';
    }
    
    // Clone operations
    if (lowerQuery.includes('clone')) {
      return 'clone_repo';
    }
    
    // Git init - PRIORITIZE over git_add
    if (lowerQuery.includes('init') || lowerQuery.includes('initialize') || 
        (lowerQuery.includes('git') && lowerQuery.includes('here'))) {
      return 'git_init';
    }
    
    // Authentication and help
    if (lowerQuery.includes('login') || lowerQuery.includes('authenticate') || lowerQuery.includes('logged in') || 
        lowerQuery.includes('logout') || lowerQuery.includes('am i logged')) {
      return 'greeting';
    }
    if (lowerQuery.includes('help') || lowerQuery.includes('what can') || lowerQuery.includes('capabilities') || 
        lowerQuery.includes('how do i')) {
      return 'help';
    }
    
    return null; // Could not determine
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

  fallbackIntentDetection(query) {
    const lowerQuery = query.toLowerCase().trim();
    
    // Repository-related intents - PRIORITIZE list over create
    if (lowerQuery.includes('repo') || lowerQuery.includes('repository')) {
      if (lowerQuery.includes('list') || lowerQuery.includes('show') || lowerQuery.includes('display') || 
          lowerQuery.includes('what') || lowerQuery.includes('my repositories') || lowerQuery.includes('my repos')) {
        return { intent: 'list_repos', entities: {}, confidence: 0.9 };
      }
      if (lowerQuery.includes('create') || lowerQuery.includes('new') || lowerQuery.includes('make')) {
        return { intent: 'create_repo', entities: {}, confidence: 0.9 };
      }
      if (lowerQuery.includes('clone') || lowerQuery.includes('download')) {
        return { intent: 'clone_repo', entities: {}, confidence: 0.8 };
      }
    }
    
    // Branch-related intents
    if (lowerQuery.includes('branch')) {
      if (lowerQuery.includes('list') || lowerQuery.includes('show') || lowerQuery.includes('display')) {
        return { intent: 'list_branches', entities: {}, confidence: 0.9 };
      }
      if (lowerQuery.includes('create') || lowerQuery.includes('new')) {
        return { intent: 'create_branch', entities: {}, confidence: 0.8 };
      }
      if (lowerQuery.includes('checkout') || lowerQuery.includes('switch')) {
        return { intent: 'checkout_branch', entities: {}, confidence: 0.8 };
      }
      if (lowerQuery.includes('merge')) {
        return { intent: 'merge_branch', entities: {}, confidence: 0.8 };
      }
    }
    
    // Status and diff intents - PRIORITIZE these over generic repo operations
    if (lowerQuery.includes('status') || lowerQuery.includes('what\'s changed') || 
        lowerQuery.includes('current status') || (lowerQuery.includes('show') && lowerQuery.includes('change'))) {
      return { intent: 'git_status', entities: {}, confidence: 0.9 };
    }
    if (lowerQuery.includes('diff') || lowerQuery.includes('difference') || lowerQuery.includes('differences')) {
      return { intent: 'git_diff', entities: {}, confidence: 0.9 };
    }
    if (lowerQuery.includes('log') || lowerQuery.includes('history') || lowerQuery.includes('commits')) {
      return { intent: 'git_log', entities: {}, confidence: 0.8 };
    }
    
    // Git operations - PRIORITIZE these over generic repo operations
    if (lowerQuery.includes('push')) {
      return { intent: 'push_changes', entities: { branch: 'current', remote: 'origin' }, confidence: 0.9 };
    }
    if (lowerQuery.includes('pull') || lowerQuery.includes('sync')) {
      return { intent: 'pull_changes', entities: { remote: 'origin' }, confidence: 0.9 };
    }
    if (lowerQuery.includes('commit')) {
      return { intent: 'git_commit', entities: {}, confidence: 0.8 };
    }
    if (lowerQuery.includes('add') || lowerQuery.includes('stage')) {
      return { intent: 'git_add', entities: {}, confidence: 0.8 };
    }
    if (lowerQuery.includes('revert')) {
      return { intent: 'revert_commit', entities: {}, confidence: 0.8 };
    }
    
    // Pull request intents
    if (lowerQuery.includes('pr') || lowerQuery.includes('pull request') || lowerQuery.includes('merge request')) {
      return { intent: 'create_pr', entities: {}, confidence: 0.9 };
    }
    
    // Help and authentication intents
    if (lowerQuery.includes('help') || lowerQuery.includes('what can') || lowerQuery.includes('capabilities')) {
      return { intent: 'help', entities: {}, confidence: 0.9 };
    }
    if (lowerQuery.includes('login') || lowerQuery.includes('authenticate') || lowerQuery.includes('logged in')) {
      return { intent: 'greeting', entities: {}, confidence: 0.8 };
    }
    
    // Greeting intents
    if (lowerQuery.includes('hello') || lowerQuery.includes('hi') || lowerQuery.includes('hey')) {
      return { intent: 'greeting', entities: {}, confidence: 0.9 };
    }
    
    return { intent: 'unknown', entities: { error: 'Could not determine intent' }, confidence: 0.0 };
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