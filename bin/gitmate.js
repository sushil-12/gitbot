#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { handleNlpCommand, handleRepoCommand, handleGitCommand, handleGenerateGitignore, handleGenerateCommitMessage, handleAuthLogout, handleSwitchAIProvider } from '../commands/commandHandler.js';
import logger from '../src/utils/logger.js';
import UI from '../src/utils/ui.js';
import { storeToken } from '../src/utils/tokenManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Set the working directory to the project root for global installations
process.chdir(process.cwd());

const serviceName = 'CLI';

async function main() {
  try {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
      showHelp();
      return;
    }

    const command = args[0];

    switch (command) {
      case '--version':
      case '-v':
        await showVersion();
        break;
        
      case '--help':
      case '-h':
        showHelp();
        break;
        
      case 'init':
        await handleInit();
        break;
        
      case 'config':
        await handleConfig(args.slice(1));
        break;
        
      case 'auth':
        await handleAuth(args.slice(1));
        break;
        
      case 'repo':
        await handleRepoCommand(args.slice(1));
        break;
        
      case 'git':
        await handleGitCommand(args.slice(1));
        break;
        
      case 'generate-commit-message':
        await handleGenerateCommitMessage();
        break;
        
      case 'generate-gitignore':
        {
          const description = args.slice(1).join(' ');
          await handleGenerateGitignore(description);
        }
        break;
        
      case 'switch-ai-provider':
        {
          const provider = args[1];
          if (!provider) {
            UI.error('Provider Required', 'Please specify an AI provider: openai or anthropic');
            process.exitCode = 1;
            return;
          }
          await handleSwitchAIProvider(provider);
        }
        break;
        
      case 'logout':
        await handleAuthLogout();
        break;
        
      case 'list':
        // Handle list command - route to repo list functionality
        await handleRepoCommand(['list', ...args.slice(1)]);
        break;
        
      case 'status':
        await handleGitCommand(['status'], '.');
        break;
        
      default:
        // For all other commands, use AI to parse intent and route
        await handleAiIntent(command + ' ' + args.slice(1).join(' '));
        break;
    }
  } catch (error) {
    logger.error('CLI error:', { message: error.message, stack: error.stack, service: serviceName });
    UI.error('Unexpected Error', error.message);
    process.exitCode = 1;
  }
}

async function showVersion() {
  const packageJson = JSON.parse(
    await import('fs/promises').then(fs => fs.readFile(join(__dirname, '..', 'package.json'), 'utf8'))
  );
  console.log(`GitBot Assistant v${packageJson.version}`);
}

function showHelp() {
  console.log(`
GitBot Assistant - Professional Git workflow automation powered by AI

USAGE:
  gitmate <command> [options]
  gitmate "natural language command"

COMMANDS:
  init                    Initialize GitBot Assistant configuration
  config [options]        Manage configuration settings
  auth <provider>         Authenticate with external services
  list                    List your GitHub repositories
  repo <subcommand>       Manage GitHub repositories
  git <subcommand>        Execute Git operations
  generate-commit-message Generate commit message from changes
  generate-gitignore      Generate .gitignore file
  switch-ai-provider      Switch between AI providers
  logout                  Clear stored authentication tokens

NATURAL LANGUAGE COMMANDS:
  gitmate "push my changes to main"
  gitmate "create a new branch called feature-x"
  gitmate "commit with message 'fix bug'"
  gitmate "create merge request from feature to main"
  gitmate "list all of my repos"

OPTIONS:
  -h, --help     Show this help message
  -v, --version  Show version information

EXAMPLES:
  gitmate init
  gitmate config --show
  gitmate list
  gitmate "list all of my repos"
  gitmate "push code please"
  gitmate repo create my-project --private

For more information, visit: https://github.com/yourusername/gitbot-assistant
`);
}

async function handleInit() {
  try {
    UI.section('GitBot Assistant Initialization', 'Setting up your configuration...');
    
    // Check if config already exists
    const configPath = join(process.env.HOME || process.env.USERPROFILE, '.gitmate', 'config.json');
    const fs = await import('fs/promises');
    
    try {
      await fs.access(configPath);
      const overwrite = await UI.confirm('Configuration already exists. Overwrite?', false);
      if (!overwrite) {
        console.log('Initialization cancelled.');
        return;
      }
    } catch (error) {
      // Config doesn't exist, continue
    }
    
    // Create config directory
    const configDir = join(process.env.HOME || process.env.USERPROFILE, '.gitmate');
    await fs.mkdir(configDir, { recursive: true });
    
    // Initialize configuration
    const inquirer = (await import('inquirer')).default;
    
    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'aiProvider',
        message: 'Select your preferred AI provider:',
        choices: [
          { name: 'Mistral (Recommended)', value: 'mistral' },
          { name: 'OpenAI (GPT-4)', value: 'openai' },
          { name: 'Anthropic (Claude)', value: 'anthropic' }
        ],
        default: 'mistral'
      },
      {
        type: 'password',
        name: 'apiKey',
        message: 'Enter your API key:',
        validate: input => input.trim() !== '' || 'API key is required'
      },
      {
        type: 'confirm',
        name: 'setupGitHub',
        message: 'Would you like to set up GitHub authentication now?',
        default: true
      }
    ]);
    
    // Save configuration
    const config = {
      aiProvider: answers.aiProvider,
      apiKey: answers.apiKey,
      version: '1.0.0',
      createdAt: new Date().toISOString()
    };
    
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    
    UI.success('Configuration Saved', 'GitBot Assistant has been initialized successfully!');
    
    if (answers.setupGitHub) {
      console.log('\nTo complete GitHub setup, run: gitmate auth github');
    }
    
  } catch (error) {
    logger.error('Initialization error:', { message: error.message, stack: error.stack, service: serviceName });
    UI.error('Initialization Failed', error.message);
    process.exitCode = 1;
  }
}

async function handleConfig(args) {
  try {
    const configPath = join(process.env.HOME || process.env.USERPROFILE, '.gitmate', 'config.json');
    const fs = await import('fs/promises');
    
    if (args.length === 0 || args.includes('--show')) {
      try {
        const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
        console.log('\nCurrent Configuration:');
        console.log(JSON.stringify(config, null, 2));
      } catch (error) {
        UI.error('Configuration Not Found', 'Run "gitmate init" to create configuration.');
        process.exitCode = 1;
      }
      return;
    }
    
    if (args.includes('--reset')) {
      const confirm = await UI.confirm('Are you sure you want to reset your configuration?', false);
      if (confirm) {
        await fs.unlink(configPath);
        UI.success('Configuration Reset', 'Configuration has been reset. Run "gitmate init" to reconfigure.');
      }
      return;
    }
    
    // Handle other config options
    UI.warning('Unknown Config Option', `Unknown config option: ${args.join(' ')}`);
    console.log('Available options: --show, --reset');
    
  } catch (error) {
    logger.error('Config error:', { message: error.message, stack: error.stack, service: serviceName });
    UI.error('Configuration Error', error.message);
    process.exitCode = 1;
  }
}

async function handleAuth(args) {
  if (args.length === 0) {
    UI.error('Provider Required', 'Please specify an authentication provider (e.g., github)');
    process.exitCode = 1;
    return;
  }
  
  const provider = args[0];
  
  switch (provider.toLowerCase()) {
    case 'github': {
      // Start the auth server
      const { startAuthServer } = await import('../src/server/authServer.js');
      await startAuthServer();
      // Prompt for token after browser is opened
      const inquirer = (await import('inquirer')).default;
      const { token } = await inquirer.prompt([
        {
          type: 'password',
          name: 'token',
          message: 'Paste the token you received from the browser:',
          mask: '*',
          validate: input => input.trim() !== '' || 'Token is required',
        },
      ]);
      console.log("i am clalle");
      await storeToken('github_access_token', token.trim());
      console.log('Authentication Complete: Your GitHub token has been saved. You are now authenticated!');
      break;
    }
      
    default:
      UI.error('Unknown Provider', `Unknown authentication provider: ${provider}`);
      process.exitCode = 1;
      break;
  }
}

// Handle process termination gracefully
process.on('SIGINT', () => {
  console.log('\n\nGoodbye! 👋');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\nGoodbye! 👋');
  process.exit(0);
});

/**
 * Parse only very clear, unambiguous commands for direct routing
 */
function parseDirectCommand(command) {
  // Only handle very specific, clear patterns
  if (command === 'list' || command === 'list repos' || command === 'list repositories') {
    return { type: 'repo', action: 'list' };
  }
  
  if (command === 'status' || command === 'git status') {
    return { type: 'git', action: 'status' };
  }
  
  if (command === 'help' || command === '--help' || command === '-h') {
    return { type: 'help' };
  }
  
  if (command === 'version' || command === '--version' || command === '-v') {
    return { type: 'version' };
  }
  
  // For anything else, let AI handle it
  return null;
}

/**
 * Route only very clear, direct commands
 */
async function routeDirectCommand(intent, args) {
  try {
    switch (intent.type) {
      case 'repo':
        if (intent.action === 'list') {
          await handleRepoCommand(['list']);
        }
        break;
        
      case 'git':
        if (intent.action === 'status') {
          await handleGitCommand(['status'], '.');
        }
        break;
        
      case 'help':
        showHelp();
        break;
        
      case 'version':
        await showVersion();
        break;
        
      default:
        // Fallback to NLP
        await handleNlpCommand(args.join(' '));
    }
  } catch (error) {
    logger.error('Direct command routing error:', { message: error.message, intent, service: serviceName });
    // Fallback to NLP
    await handleNlpCommand(args.join(' '));
  }
}

// Run the CLI
main().catch(error => {
  logger.error('Unhandled CLI error:', { message: error.message, stack: error.stack, service: serviceName });
  UI.error('Fatal Error', error.message);
  process.exit(1);
});

async function handleAiIntent(userInput) {
  try {
    const { aiService } = await import('../src/services/aiServiceFactory.js');
    
    // Check AI service status first
    const aiReady = await aiService.checkStatus();
    
    if (!aiReady) {
      console.log('\nAI service is not available. Please check your configuration.');
      return;
    }
    
    const { intent, entities, confidence } = await aiService.parseIntent(userInput);
    
    // If confidence is low or intent is unknown, show help or ask for clarification
    if (!intent || intent === 'unknown' || (confidence !== undefined && confidence < 0.5)) {
      console.log('\nSorry, I could not confidently understand your request. Here are some things you can try:');
      showHelp();
      return;
    }
    // Route to the correct handler based on intent
    switch (intent) {
      case 'git_status':
        await handleGitCommand(['status'], '.');
        break;
      case 'list_branches':
        await handleGitCommand(['branch'], '.');
        break;
      case 'list_repos':
        await handleRepoCommand(['list']);
        break;
      case 'get_remotes':
      case 'list_remotes':
      case 'git_remote':
        await handleGitCommand(['remote'], '.');
        break;
      case 'git_log':
        await handleGitCommand(['log'], '.');
        break;
      case 'git_diff':
        await handleGitCommand(['diff'], '.');
        break;
      case 'push_changes':
        await handleGitCommand(['push'], '.');
        break;
      case 'pull_changes':
        await handleGitCommand(['pull'], '.');
        break;
      case 'create_branch':
        await handleGitCommand(['branch', entities?.branch || 'new-branch'], '.');
        break;
      case 'checkout_branch':
        await handleGitCommand(['checkout', entities?.branch || 'main'], '.');
        break;
      case 'git_commit':
        await handleGitCommand(['commit', entities?.commit_message || 'Update'], '.');
        break;
      case 'add_remote':
        await handleGitCommand(['remote', 'add', entities?.name, entities?.url], '.');
        break;
      case 'clone_repo':
        await handleGitCommand(['clone', entities?.repo_url], '.');
        break;
      // Add more intent handlers as needed
      default:
        // If intent is not mapped, fallback to NLP handler for conversational response
        await handleNlpCommand(userInput);
    }
  } catch (error) {
    logger.error('AI intent routing error:', { message: error.message, stack: error.stack, userInput, service: serviceName });
    UI.error('AI Routing Error', error.message + (error.stack ? '\n' + error.stack : ''));
    console.error('Full AI Routing Error:', error);
  }
} 