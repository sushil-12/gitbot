#!/usr/bin/env node
import dotenv from 'dotenv';
import { Command, Option } from 'commander';
import logger from './utils/logger.js';
import * as commandHandler from '../commands/commandHandler.js';
import { checkOllamaStatus } from '../ai/ollamaService.js'; // For a startup check

dotenv.config();
const program = new Command();

async function main() {
  logger.info('GitBot CLI starting...', { service: 'CLI' });

  program
    .name('gitbot')
    .description('An intelligent GitBot powered by AI and GitHub integrations.')
    .version('1.0.0'); // Consider fetching from package.json

  // GitHub Repository Commands
  const repoCommand = program.command('repo')
    .description('Manage GitHub repositories.');

  repoCommand
    .command('create <repo-name>')
    .description('Create a new GitHub repository.')
    .option('-d, --description <text>', 'Repository description')
    .option('-p, --private', 'Make the repository private (default is public)')
    .option('--no-init', 'Do not create an initial commit with a README')
    .action(async (repoName, options) => {
      const handlerOptions = [
        repoName,
        ...(options.private ? ['--private'] : []),
        ...(options.description ? ['--description', options.description] : []),
        ...(options.init === false ? ['--no-init'] : []), // commander sets init to true by default if --no-init is not present
      ];
      await commandHandler.handleRepoCommand(['create', ...handlerOptions]);
    });

  repoCommand
    .command('list')
    .description('List your GitHub repositories.')
    .addOption(new Option('-t, --type <type>', 'Type of repositories to list').choices(['all', 'owner', 'public', 'private', 'member']).default('all'))
    .addOption(new Option('-s, --sort <sort>', 'Sort criteria').choices(['created', 'updated', 'pushed', 'full_name']).default('full_name'))
    .addOption(new Option('--direction <direction>', 'Sort direction').choices(['asc', 'desc']).default('asc'))
    .option('--per-page <number>', 'Number of items to return per page', '30')
    .option('--page <number>', 'Page number of the results to fetch', '1')
    .action(async (options) => {
      const handlerOptions = [];
      if(options.type) handlerOptions.push(`type=${options.type}`);
      if(options.sort) handlerOptions.push(`sort=${options.sort}`);
      if(options.direction) handlerOptions.push(`direction=${options.direction}`);
      if(options.perPage) handlerOptions.push(`per_page=${options.perPage}`);
      if(options.page) handlerOptions.push(`page=${options.page}`);
      await commandHandler.handleRepoCommand(['list', ...handlerOptions]);
    });

  // Local Git Operations Commands
  const gitCommand = program.command('git')
    .description('Perform local Git operations.');

  gitCommand
    .command('init [directory]')
    .description('Initialize a new Git repository in the specified or current directory.')
    .action(async (directory) => {
      await commandHandler.handleGitCommand(['init'], directory || '.');
    });

  gitCommand
    .command('status [directory]')
    .description('Show the working tree status.')
    .action(async (directory) => {
      await commandHandler.handleGitCommand(['status'], directory || '.');
    });

  gitCommand
    .command('add [files...]')
    .description('Add file contents to the index (stage files). Defaults to all files.')
    .action(async (files) => {
      await commandHandler.handleGitCommand(['add', ...(files.length > 0 ? files : ['.'])], '.');
    });

  gitCommand
    .command('commit <message>')
    .description('Record changes to the repository.')
    .action(async (message) => {
      await commandHandler.handleGitCommand(['commit', message], '.');
    });

  // AI / NLP Commands
  program
    .command('nlp <query>')
    .description('Use natural language to perform Git/GitHub actions (via Ollama).')
    .action(async (query) => {
      await commandHandler.handleNlpCommand(query);
    });

  program
    .command('generate-gitignore <description>')
    .alias('gg')
    .description('Generate .gitignore content based on project description (e.g., "node react python").')
    .action(async (description) => {
        await commandHandler.handleGenerateGitignore(description);
    });

  program
    .command('generate-commit [directory]')
    .alias('gc')
    .description('Generate a commit message based on the current diff in the specified or current directory.')
    .action(async (directory) => {
        await commandHandler.handleGenerateCommitMessage(directory || '.');
    });


  // Auth Commands
  const authCommand = program.command('auth')
    .description('Manage authentication.');

  authCommand
    .command('logout')
    .description('Clear stored GitHub authentication token.')
    .action(async () => {
        await commandHandler.handleAuthLogout();
    });

  // Utility/Status Commands
  program
    .command('check-ai')
    .description('Check the status of the Ollama server and configured model.')
    .action(async () => {
        logger.info("Checking Ollama status...", { service: 'CLI' });
        const isReady = await checkOllamaStatus();
        if (isReady) {
            console.log(`Ollama server is up and model '${process.env.OLLAMA_MODEL || 'default'}' is available.`);
        } else {
            console.error(`Ollama server or model '${process.env.OLLAMA_MODEL || 'default'}' is not available. Please check your Ollama setup and .env configuration.`);
        }
    });

  // Global options
  program.option('-v, --verbose', 'Enable verbose logging for this command');

  program.on('option:verbose', () => {
    // This is a simple way; a more robust solution might involve a custom logger level
    // or passing a verbosity flag to handlers.
    // For now, we can adjust the logger's console transport level if needed,
    // but winston's levels are fixed once set. This is more for future thought.
    logger.transports.find(t => t.name === 'console').level = 'debug';
    logger.debug('Verbose logging enabled via CLI flag.', { service: 'CLI' });
  });


  // Listener for unknown commands, treating them as NLP queries
  program.on('command:*', async (operands) => {
    // 'operands' is an array of the parts of the command that were not recognized.
    // e.g., if user types "gitbot i need to push", operands would be ['i', 'need', 'to', 'push']
    const nlpQuery = operands.join(' ');
    if (nlpQuery.trim()) { // If there's an actual query
      logger.info(`Unknown command sequence treated as NLP query: "${nlpQuery}"`, { service: 'CLI' });
      await commandHandler.handleNlpCommand(nlpQuery);
    } else {
      // This case means 'command:*' was triggered but operands were empty or whitespace.
      logger.warn('Empty or unhandled NLP query from unknown command sequence. Displaying help.', { service: 'CLI' });
      program.outputHelp();
    }
  });

  try {
    await program.parseAsync(process.argv);

    // After parsing, if no command was explicitly run (e.g., only 'gitbot' was typed),
    // and 'command:*' didn't handle it as an NLP query (e.g., because it was empty or only global options were passed),
    // then display help.
    // Commander's `parseAsync` doesn't throw for unknown commands if `command:*` is listened to.
    // We check if any actual command arguments were passed beyond the script name.
    if (process.argv.slice(2).length === 0) {
      // This handles the case of 'gitbot' with no arguments.
      program.outputHelp();
    }
    // If arguments were passed, they should either match a known command
    // or be caught by 'command:*'. If 'command:*' was triggered and the query was empty,
    // it would have called program.outputHelp() itself.

  } catch (error) {
    // This catch block handles errors from command actions or critical parsing errors.
    logger.error('CLI execution error:', { message: error.message, stack: error.stack, service: 'CLI' });
    if (error.message !== 'Authentication required. Please visit the auth URL and try again.') {
      // Exit for general errors, but not for auth prompts from handlers.
      process.exit(1);
    } else {
      process.exitCode = 1; // Indicate failure for auth prompts but allow message to be primary output.
    }
  }
}

main().catch(error => {
  // This catch is for unhandled promise rejections from main itself,
  // though most errors should be caught within main's try/catch or by Commander.
  logger.fatal('Unhandled error in CLI main function:', { message: error.message, stack: error.stack, service: 'CLI' });
  process.exit(1);
});