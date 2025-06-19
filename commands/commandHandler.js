import logger from '../src/utils/logger.js';
import UI from '../src/utils/ui.js';
import * as prompter from '../src/utils/prompter.js';
import fs from 'fs/promises';
import path from 'path';
import * as githubService from '../src/services/githubService.js';
import * as gitService from '../src/services/gitService.js';
import { aiService, AI_PROVIDERS, setProvider } from '../src/services/aiServiceFactory.js';
import { getToken, clearAllTokens, storeToken } from '../src/utils/tokenManager.js';
import inquirer from 'inquirer';
import chalk from 'chalk';

const serviceName = 'CommandHandler';

let diffViewerInitialized = false;

async function ensureAuthenticated() {
  const token = await getToken('github_access_token');
  if (!token) {
    logger.warn('User is not authenticated. Please authenticate first.', { service: serviceName });
    const port = process.env.PORT || 3000;
    const authInitiateUrl = `http://localhost:${port}/auth/github`;
    
    UI.error('Authentication Required', 
      'You need to authenticate with GitHub to use this feature.');
    UI.info('Please follow these steps:', 
      `1. Open your browser and navigate to: ${authInitiateUrl}\n2. Authorize the application\n3. Re-run your command`);
    
    return null;
  }
  return token;
}

export async function handleRepoCommand(args) {
  const token = await ensureAuthenticated();
  if (!token) {
    process.exitCode = 1;
    return;
  }
  
  const [subCommand, ...options] = args;
  logger.debug(`Handling 'repo' command: ${subCommand}`, { options, service: serviceName });

  switch (subCommand) {
    case 'create': {
      const repoName = options[0];
      if (!repoName) {
        UI.error('Repository Name Required', 
          'Please provide a repository name. Usage: repo create <repo-name> [--private] [--description "Your description"]');
        return;
      }
      
      const repoOptions = {
        description: '',
        private: false,
        auto_init: true,
      };
      
      for (let i = 1; i < options.length; i++) {
        if (options[i] === '--private') {
          repoOptions.private = true;
        } else if (options[i] === '--description' && options[i + 1]) {
          repoOptions.description = options[i + 1];
          i++;
        } else if (options[i] === '--no-init') {
          repoOptions.auto_init = false;
        }
      }
      
      try {
        UI.progress('Creating repository...');
        const repo = await githubService.createRepository(repoName, repoOptions);
        UI.success('Repository Created Successfully', 
          `Repository: ${repo.full_name}\nURL: ${repo.html_url}`);
        logger.info(`Repository created: ${repo.full_name}`, { url: repo.html_url, service: serviceName });
      } catch (error) {
        UI.error('Failed to Create Repository', error.message);
        logger.error(`Failed to create repository '${repoName}':`, { message: error.message, stack: error.stack, service: serviceName });
      }
      break;
    }
    
    case 'list': {
      const listOptions = {};
      for (let i = 0; i < options.length; i++) {
        const [key, value] = options[i].split('=');
        if (key && value) {
          if (key.startsWith('--')) {
            listOptions[key.substring(2)] = value;
          } else {
            listOptions[key] = value;
          }
        }
      }
      
      try {
        UI.progress('Fetching repositories...');
        const repos = await githubService.listUserRepositories(listOptions);
        
        if (repos.length === 0) {
          UI.info('No repositories found', 'No repositories match your current criteria.');
        } else {
          UI.section('Your GitHub Repositories', `Found ${repos.length} repository(ies)`);
          
          const repoData = repos.map(repo => ({
            Name: repo.full_name,
            Type: repo.private ? 'Private' : 'Public',
            Updated: new Date(repo.updated_at).toLocaleDateString(),
            URL: repo.html_url
          }));
          
          UI.table(repoData);
        }
      } catch (error) {
        UI.error('Failed to List Repositories', error.message);
        logger.error('Failed to list repositories:', { message: error.message, stack: error.stack, service: serviceName });
      }
      break;
    }
    
    default:
      UI.warning('Unknown Command', `Unknown 'repo' subcommand: ${subCommand}`);
      UI.help([
        { name: 'create', description: 'Create a new repository', examples: ['repo create my-repo', 'repo create my-repo --private'] },
        { name: 'list', description: 'List your repositories', examples: ['repo list', 'repo list --type=owner'] }
      ]);
  }
}

export async function handleGitCommand(args, currentWorkingDirectory = '.') {
    const [subCommand, ...options] = args;
    logger.info(`Handling 'git' command: ${subCommand} in ${currentWorkingDirectory}`, { options, service: serviceName });

    switch(subCommand) {
        case 'init':
            try {
                const message = await gitService.initRepo(currentWorkingDirectory);
                console.log(message);
            } catch (error) {
                console.error(`Error initializing Git repository: ${error.message}`);
            }
            break;
        case 'status':
            try {
                const status = await gitService.getStatus(currentWorkingDirectory);
                console.log("Git Status:");
                console.log(`  On branch: ${status.current}`);
                console.log(`  Changes to be committed: ${status.staged.length}`);
                status.staged.forEach(file => console.log(`    modified: ${file}`));
                console.log(`  Changes not staged for commit: ${status.modified.length + status.not_added.length}`);
                status.modified.forEach(file => console.log(`    modified: ${file}`));
                status.not_added.forEach(file => console.log(`    untracked: ${file}`));
                // Add more status details as needed
            } catch (error) {
                console.error(`Error getting Git status: ${error.message}`);
            }
            break;
        case 'add':
            const filesToAdd = options.length > 0 ? options : '.';
            try {
                await gitService.addFiles(filesToAdd, currentWorkingDirectory);
                console.log(`Files staged: ${Array.isArray(filesToAdd) ? filesToAdd.join(', ') : filesToAdd}`);
            } catch (error) {
                console.error(`Error staging files: ${error.message}`);
            }
            break;
        case 'commit':
            const commitMessage = options.join(' ');
            if (!commitMessage) {
                console.error("Error: Commit message is required. Usage: git commit <message>");
                return;
            }
            try {
                const result = await gitService.commitChanges(commitMessage, currentWorkingDirectory);
                console.log(`Committed: [${result.branch}] ${result.commit} - ${result.summary.changes} changes.`);
            } catch (error) {
                console.error(`Error committing changes: ${error.message}`);
            }
            break;
        // Add more git subcommands: push, pull, branch, checkout, merge, rebase etc.
        default:
            logger.warn(`Unknown 'git' subcommand: ${subCommand}`, { service: serviceName });
            console.log(`Unknown 'git' subcommand: ${subCommand}. Supported: init, status, add, commit (more to come).`);
    }
}

async function handleConfirmationFlow(parsed, maxRetries = 4) {
  let retryCount = 0;
  let currentParsed = parsed;
  
  while (retryCount < maxRetries) {
    try {
      // Generate confirmation message
      const confirmationMessage = await aiService.generateConfirmation(currentParsed);
      if (!confirmationMessage) {
        throw new Error('Failed to generate confirmation message');
      }
      
      console.log(chalk.cyan("\n" + confirmationMessage));
      
      // Ask for confirmation
      const { confirmed } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmed',
          message: 'Am I right?',
          default: true
        }
      ]);
      
      if (confirmed) {
        return currentParsed; // Return the current parsed result
      }
      
      retryCount++;
      if (retryCount < maxRetries) {
        console.log(chalk.yellow(`\nLet me try again. Please rephrase your request (attempt ${retryCount + 1}/${maxRetries}):`));
        const { newQuery } = await inquirer.prompt([
          {
            type: 'input',
            name: 'newQuery',
            message: 'Your request:',
            validate: input => input.trim() !== '' || 'Please enter your request'
          }
        ]);
        
        // Parse the new query
        const newParsed = await aiService.parseIntent(newQuery);
        if (newParsed && newParsed.intent !== 'unknown') {
          currentParsed = newParsed;
        } else {
          console.log(chalk.red("I still couldn't understand that. Let me try again."));
        }
      }
    } catch (error) {
      logger.error('Error in confirmation flow:', { 
        message: error.message, 
        stack: error.stack,
        retryCount,
        service: serviceName 
      });
      
      if (retryCount < maxRetries) {
        console.log(chalk.yellow(`\nI encountered an error. Let me try again (attempt ${retryCount + 1}/${maxRetries}):`));
        const { newQuery } = await inquirer.prompt([
          {
            type: 'input',
            name: 'newQuery',
            message: 'Please rephrase your request:',
            validate: input => input.trim() !== '' || 'Please enter your request'
          }
        ]);
        
        try {
          const newParsed = await aiService.parseIntent(newQuery);
          if (newParsed && newParsed.intent !== 'unknown') {
            currentParsed = newParsed;
          }
        } catch (parseError) {
          console.log(chalk.red("I'm still having trouble understanding. Let me try again."));
        }
      }
    }
  }
  
  // If we've exhausted all retries, show help
  console.log(chalk.yellow("\nI'm having trouble understanding your request. Let me show you what I can do:"));
  try {
    const helpMessage = await aiService.generateCommandHelp();
    console.log(chalk.cyan("\n" + helpMessage));
  } catch (helpError) {
    console.log(chalk.yellow("\nHere are some common commands you can try:"));
    console.log(chalk.cyan(`
1. Push changes:
   - "push my changes to main"
   - "push with commit message 'update feature'"
   - "force push to main"

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
   - "get updates from main"
    `));
  }
  
  console.log(chalk.blue("\nFor more detailed documentation, visit:"));
  console.log(chalk.blue("https://github.com/yourusername/gitbot-assistant/wiki"));
  
  return null; // Return null to indicate failure
}

export async function handleNlpCommand(query) {
  logger.info(`Handling NLP query: "${query}"`, { service: serviceName });
  if (!query || query.trim() === '') {
    console.error("NLP query cannot be empty.");
    return;
  }

  const aiReady = await aiService.checkStatus();
  if (!aiReady) {
    console.error("AI service is not available. Please check your AI provider setup.");
    
    // Check if we have any environment variables set
    const hasEnvConfig = process.env.MISTRAL_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
    
    if (!hasEnvConfig) {
      console.log("\nTo set up GitMate, you have two options:");
      console.log("\nOption 1 - Environment Variables (Recommended):");
      console.log("  export AI_PROVIDER=mistral");
      console.log("  export MISTRAL_API_KEY=your_api_key_here");
      console.log("  # Then run: gitmate \"your command\"");
      
      console.log("\nOption 2 - Interactive Setup:");
      console.log("  gitmate init");
      console.log("  # This will guide you through configuration");
    } else {
      console.log("\nConfiguration issue detected. Please check your API keys.");
    }
    
    logger.error("AI service not ready, aborting NLP command.", { service: serviceName });
    return;
  }

  try {
    let parsed = await aiService.parseIntent(query);
    if (!parsed || parsed.intent === 'unknown') {
      console.log("Sorry, I couldn't understand that command. Could you try rephrasing?");
      logger.warn('NLP intent parsing failed or returned unknown.', { query, parsedResult: parsed, service: serviceName });
      if (parsed && parsed.entities && parsed.entities.error) {
        console.error(`Details: ${parsed.entities.error}`);
        if(parsed.entities.raw_response) console.log(`LLM Raw: ${parsed.entities.raw_response}`);
      }
      return;
    }

    // Add confirmation flow
    const confirmedParsed = await handleConfirmationFlow(parsed);
    if (!confirmedParsed) {
      return; // User cancelled or failed to understand
    }

    // Use the confirmed parsed result
    parsed = confirmedParsed;

    logger.info('NLP intent parsed successfully:', { intent: parsed.intent, entities: parsed.entities, service: serviceName });
    console.log(chalk.green(`\nProceeding with: ${parsed.intent}`));
    if (parsed.entities && Object.keys(parsed.entities).length > 0) {
        console.log(chalk.gray('With parameters:'), JSON.stringify(parsed.entities, null, 2));
    }

    // Now, map the intent and entities to actual service calls
    switch (parsed.intent) {
      case 'error':
        // Handle error intent with helpful suggestions
        if (parsed.entities && parsed.entities.suggested_phrases) {
          console.log(chalk.yellow("\nI couldn't understand your request clearly. Here are some suggestions:"));
          parsed.entities.suggested_phrases.forEach((phrase, index) => {
            console.log(chalk.cyan(`  ${index + 1}. ${phrase}`));
          });
          console.log(chalk.gray("\nTry rephrasing your request using one of these patterns."));
        } else {
          console.log(chalk.yellow("\nI couldn't understand your request. Please try rephrasing it."));
        }
        break;
        
      case 'create_repo':
        const tokenForCreateRepo = await ensureAuthenticated();
        if (!tokenForCreateRepo) { process.exitCode = 1; return; }
        const { repo_name, description, private: isPrivate } = parsed.entities;
        if (!repo_name) {
          console.error("Repository name is missing from the command.");
          return;
        }
        await handleRepoCommand(['create', repo_name, ...(isPrivate ? ['--private'] : []), ...(description ? ['--description', description] : [])]);
        break;
      case 'list_repos':
        const tokenForListRepos = await ensureAuthenticated();
        if (!tokenForListRepos) { process.exitCode = 1; return; }
        // Convert parsed entities to options for listUserRepositories if any
        const listOpts = [];
        if (parsed.entities) {
            if (parsed.entities.visibility) listOpts.push(`type=${parsed.entities.visibility}`);
            if (parsed.entities.sort_by) listOpts.push(`sort=${parsed.entities.sort_by}`);
            // Add more entity to option mappings
        }
        await handleRepoCommand(['list', ...listOpts]);
        break;
      case 'git_init':
        await handleGitCommand(['init'], '.'); // Assuming current directory
        break;
      case 'git_add':
        const filesEntity = parsed.entities?.files;
        if (filesEntity && filesEntity !== 'all' && filesEntity !== 'some' && filesEntity !== 'changes') {
          // Specific files mentioned, add them directly
          await handleGitCommand(['add', filesEntity], '.');
        } else if (filesEntity === 'all') {
          // Add all files
          await handleGitCommand(['add', '.'], '.');
        } else {
          // No specific files, or "some"/"changes" -> interactive mode
          try {
            const status = await gitService.getStatus('.');
            const unStagedFiles = [
              ...status.not_added.map(f => ({ name: `${f} (Untracked)`, value: f, short: f })),
              ...status.modified.map(f => ({ name: `${f} (Modified)`, value: f, short: f })),
              ...status.deleted.map(f => ({ name: `${f} (Deleted)`, value: f, short: f })),
              // Potentially add renamed, conflicted etc. if detailed status is parsed
            ];

            if (unStagedFiles.length === 0) {
              console.log("No changes to add. Working directory clean.");
              break;
            }

            const { filesToAdd } = await inquirer.prompt([
              {
                type: 'checkbox',
                name: 'filesToAdd',
                message: 'Select files to stage:',
                choices: unStagedFiles,
                pageSize: 10,
                validate: (answer) => {
                  if (answer.length < 1) {
                    return 'You must choose at least one file.';
                  }
                  return true;
                }
              }
            ]);

            if (filesToAdd && filesToAdd.length > 0) {
              await gitService.addFiles(filesToAdd, '.');
              console.log(`Successfully staged: ${filesToAdd.join(', ')}`);
            } else {
              console.log("No files selected to stage.");
            }
          } catch (error) {
            console.error(`Error during interactive add: ${error.message}`);
            logger.error('Failed to interactively add files:', { message: error.message, stack: error.stack, service: serviceName });
          }
        }
        break;
      case 'git_commit':
        const msg = parsed.entities?.commit_message;
        if (!msg) {
            console.error("Commit message is missing from the command.");
            return;
        }
        await handleGitCommand(['commit', msg], '.');
        break;
      case 'push_changes': {
        const tokenForPush = await ensureAuthenticated();
        if (!tokenForPush) { process.exitCode = 1; return; }

        let currentGitStatus;
        try {
            currentGitStatus = await gitService.getStatus('.');
        } catch (error) {
            if (error.message.includes("not a git repository")) {
                logger.warn("Attempted push in a non-Git repository.", { path: '.', service: serviceName });
                const initRepo = await prompter.askYesNo("This directory doesn't seem to be a Git repository. Shall I initialize one now?", false);
                if (initRepo) {
                    try {
                        await gitService.initRepo('.');
                        console.log("Successfully initialized a new Git repository here.");
                        currentGitStatus = await gitService.getStatus('.'); // Re-fetch status
                    } catch (initError) {
                        logger.error("Failed to initialize Git repository:", { message: initError.message, service: serviceName });
                        console.error(`Failed to initialize repository: ${initError.message}`);
                        process.exitCode = 1; return;
                    }
                } else {
                    console.log("Okay, a Git repository is needed to push changes. Please initialize one first.");
                    process.exitCode = 1; return;
                }
            } else {
                logger.error("Error checking Git status for push:", { message: error.message, service: serviceName });
                console.error(`Error checking Git status: ${error.message}`);
                process.exitCode = 1; return;
            }
        }

        // Check for unstaged changes and handle them before pushing
        const hasUnstagedChanges = currentGitStatus.not_added.length > 0 || 
                                  currentGitStatus.modified.length > 0 || 
                                  currentGitStatus.deleted.length > 0 ||
                                  currentGitStatus.created.length > 0;

        if (hasUnstagedChanges) {
          console.log(chalk.yellow("\nYou have unstaged changes that need to be committed before pushing:"));
          
          // Show unstaged files
          if (currentGitStatus.not_added.length > 0) {
            console.log(chalk.cyan("  Untracked files:"));
            currentGitStatus.not_added.forEach(file => console.log(`    ${file}`));
          }
          if (currentGitStatus.modified.length > 0) {
            console.log(chalk.cyan("  Modified files:"));
            currentGitStatus.modified.forEach(file => console.log(`    ${file}`));
          }
          if (currentGitStatus.deleted.length > 0) {
            console.log(chalk.cyan("  Deleted files:"));
            currentGitStatus.deleted.forEach(file => console.log(`    ${file}`));
          }
          if (currentGitStatus.created.length > 0) {
            console.log(chalk.cyan("  Created files:"));
            currentGitStatus.created.forEach(file => console.log(`    ${file}`));
          }

          // Ask which files to add
          const allUnstagedFiles = [
            ...currentGitStatus.not_added.map(f => ({ name: `${f} (Untracked)`, value: f, short: f })),
            ...currentGitStatus.modified.map(f => ({ name: `${f} (Modified)`, value: f, short: f })),
            ...currentGitStatus.deleted.map(f => ({ name: `${f} (Deleted)`, value: f, short: f })),
            ...currentGitStatus.created.map(f => ({ name: `${f} (Created)`, value: f, short: f }))
          ];

          const { filesToAdd } = await inquirer.prompt([
            {
              type: 'checkbox',
              name: 'filesToAdd',
              message: 'Select files to stage for commit:',
              choices: allUnstagedFiles,
              pageSize: 10,
              validate: (answer) => {
                if (answer.length < 1) {
                  return 'You must choose at least one file to commit.';
                }
                return true;
              }
            }
          ]);

          if (filesToAdd && filesToAdd.length > 0) {
            try {
              await gitService.addFiles(filesToAdd, '.');
              console.log(chalk.green(`Successfully staged: ${filesToAdd.join(', ')}`));
              
              // Get commit message
              const { commitMessage } = await inquirer.prompt([
                {
                  type: 'input',
                  name: 'commitMessage',
                  message: 'Enter commit message:',
                  validate: input => input.trim() !== '' || 'Commit message cannot be empty'
                }
              ]);

              // Commit the changes
              await gitService.commitChanges(commitMessage, '.');
              console.log(chalk.green(`Successfully committed with message: "${commitMessage}"`));
              
              // Refresh status after commit
              currentGitStatus = await gitService.getStatus('.');
            } catch (error) {
              logger.error('Failed to stage and commit files:', { message: error.message, stack: error.stack, service: serviceName });
              console.error(`Error staging and committing files: ${error.message}`);
              process.exitCode = 1; return;
            }
          } else {
            console.log(chalk.yellow("No files selected. Push cancelled."));
            process.exitCode = 1; return;
          }
        }

        let targetBranchName = parsed.entities?.branch;
        let currentBranchName = currentGitStatus.current;
        const forcePush = parsed.entities?.force === true;
        const setAsDefault = parsed.entities?.set_as_default === true;
        const createBackup = parsed.entities?.create_backup === true;

        // Handle "current" branch - use the actual current branch
        if (targetBranchName === 'current' || !targetBranchName) {
            if (!currentBranchName) { // Unborn HEAD
                 logger.warn("Could not determine current branch (unborn HEAD). Defaulting to 'main'.", { service: serviceName });
                 targetBranchName = 'main'; // Default for unborn HEAD
            } else {
                targetBranchName = currentBranchName;
            }
            console.log(`No specific branch provided for push, will use current branch: ${targetBranchName}`);
        }
        
        // Ensure target branch exists or create it
        const localBranches = await gitService.listBranches('.');
        const targetBranchExistsLocally = localBranches.all.includes(targetBranchName);

        if (targetBranchName !== currentBranchName) {
            if (targetBranchExistsLocally) {
                const switchToTarget = await prompter.askYesNo(`You are on branch '${currentBranchName}', but targeting '${targetBranchName}' for push. Switch to '${targetBranchName}'?`, true);
                if (switchToTarget) {
                    try {
                        await gitService.checkoutBranch(targetBranchName, '.');
                        currentBranchName = targetBranchName; // Update current branch
                        console.log(`Switched to branch '${targetBranchName}'.`);
                    } catch (checkoutError) {
                        logger.error(`Failed to checkout branch '${targetBranchName}':`, { message: checkoutError.message, service: serviceName });
                        console.error(`Error switching to branch '${targetBranchName}': ${checkoutError.message}. Aborting push.`);
                        process.exitCode = 1; return;
                    }
                } else {
                    console.log(`Staying on branch '${currentBranchName}'. Push will target '${targetBranchName}' if you proceed with commit on current branch, or you can commit to '${targetBranchName}' after switching manually.`);
                }
            } else {
                const createBranch = await prompter.askYesNo(`Branch '${targetBranchName}' does not exist locally. Create and switch to it?`, true);
                if (createBranch) {
                    try {
                        await gitService.createAndCheckoutBranch(targetBranchName, '.');
                        currentBranchName = targetBranchName; // Update current branch
                        console.log(`Created and switched to new branch '${targetBranchName}'.`);
                    } catch (createBranchError) {
                        logger.error(`Failed to create branch '${targetBranchName}':`, { message: createBranchError.message, service: serviceName });
                        console.error(`Error creating branch '${targetBranchName}': ${createBranchError.message}. Aborting push.`);
                        process.exitCode = 1; return;
                    }
                } else {
                    console.log(`Branch '${targetBranchName}' not created. Aborting push.`);
                    process.exitCode = 1; return;
                }
            }
        }
         // At this point, currentBranchName should be the branch we intend to commit to and push.

        // Create backup branch before dangerous operations
        if (createBackup || forcePush) {
          console.log(chalk.yellow("\nCreating backup branch before push..."));
          const backupBranch = await createBackupBranch(currentBranchName);
          if (!backupBranch) {
            const proceedAnyway = await prompter.askYesNo(
              "Failed to create backup branch. Would you like to proceed with push anyway?",
              false
            );
            if (!proceedAnyway) {
              console.log("Push cancelled by user.");
              process.exitCode = 1;
              return;
            }
          }
        }

        const remoteForPush = parsed.entities?.remote || 'origin';
        let targetRemoteExists = false;
        try {
            const remotes = await gitService.getRemotes('.');
            targetRemoteExists = remotes.some(r => r.name === remoteForPush);
        } catch (error) {
            logger.error("Error checking remotes:", { message: error.message, service: serviceName });
            console.error(`Error checking repository remotes: ${error.message}`);
            process.exitCode = 1; return;
        }

        if (!targetRemoteExists) {
            logger.warn(`Target remote '${remoteForPush}' not found.`, { path: '.', service: serviceName });
            const setupRemote = await prompter.askYesNo(`Remote "${remoteForPush}" is not configured. Would you like to set it up now?`, true);
            if (setupRemote) {
                const remoteAction = await prompter.askForChoice(
                    'How would you like to set up the remote?',
                    [
                        { name: `Create a new GitHub repository and link it as "${remoteForPush}"`, value: 'create' },
                        { name: `Link to an existing GitHub repository as "${remoteForPush}"`, value: 'link' }
                    ]
                );
                if (remoteAction === 'create') {
              const { newRepoName, isPrivate } = await inquirer.prompt([
                { type: 'input', name: 'newRepoName', message: 'Enter name for new repository:', default: path.basename(process.cwd()) },
                { type: 'confirm', name: 'isPrivate', message: 'Make this repository private?', default: false }
              ]);
              try {
                const newRepo = await githubService.createRepository(newRepoName, { private: isPrivate });
                await gitService.addRemote(remoteForPush, newRepo.clone_url, '.');
                targetRemoteExists = true;
                console.log(`Created and linked new repository: ${newRepo.html_url}`);
              } catch (error) {
                logger.error("Failed to create repository:", { message: error.message, service: serviceName });
                console.error(`Failed to create repository: ${error.message}`);
                process.exitCode = 1; return;
              }
            } else if (remoteAction === 'link') {
              const { existingRepoUrl } = await inquirer.prompt([
                { type: 'input', name: 'existingRepoUrl', message: 'Enter URL of existing repository:', validate: input => input.trim() !== '' || 'Repository URL cannot be empty' }
                            ]);
                            try {
                await gitService.addRemote(remoteForPush, existingRepoUrl, '.');
                targetRemoteExists = true;
                console.log(`Linked to existing repository: ${existingRepoUrl}`);
              } catch (error) {
                logger.error("Failed to link repository:", { message: error.message, service: serviceName });
                console.error(`Failed to link repository: ${error.message}`);
                process.exitCode = 1; return;
                            }
                        } else {
              console.log("No remote action selected. Aborting.");
                        process.exitCode = 1; return;
                    }
                } else {
            console.log(`Okay, remote "${remoteForPush}" is needed to push. Please configure it and try again.`);
                    process.exitCode = 1; return;
                }
        }

        // Check if branch exists on remote
        try {
            const remoteBranches = await gitService.listBranches('.', ['-r']);
            const remoteBranchRef = `${remoteForPush}/${currentBranchName}`;
            if (!remoteBranches.all.includes(remoteBranchRef)) {
                const createRemoteBranch = await prompter.askYesNo(
                    `Branch '${currentBranchName}' does not exist on remote '${remoteForPush}'. Create it on the remote and push?`,
                    true
                );
                if (!createRemoteBranch) {
                    console.log("Push cancelled by user.");
                    process.exitCode = 1; return;
                }
            }
        } catch (branchCheckError) {
            logger.warn(`Could not check remote branches for '${currentBranchName}'. Proceeding with push attempt.`, { message: branchCheckError.message, service: serviceName });
            const proceedAnyway = await prompter.askYesNo(
                `Could not verify if branch '${currentBranchName}' exists on remote '${remoteForPush}' due to an error: ${branchCheckError.message}. Attempt to push anyway?`,
                true
            );
            if (!proceedAnyway) {
                console.log("Push cancelled by user.");
                process.exitCode = 1; return;
            }
        }

        try {
          if (forcePush) {
            const confirmForcePush = await prompter.askYesNo(
              `WARNING: You are about to force push branch '${currentBranchName}' to '${remoteForPush}'. This will overwrite the remote branch history. Are you sure?`,
              false
            );
            if (!confirmForcePush) {
              console.log("Force push cancelled by user.");
              process.exitCode = 1; return;
            }
          }

          console.log(`Pushing branch '${currentBranchName}' to remote '${remoteForPush}'${forcePush ? ' (force)' : ''}...`);
          await gitService.pushChanges(remoteForPush, currentBranchName, '.', true, forcePush);
            console.log("Push successful.");

          if (setAsDefault) {
            const confirmSetDefault = await prompter.askYesNo(
              `Would you like to set '${currentBranchName}' as the default branch for this repository?`,
              true
            );
            if (confirmSetDefault) {
              try {
                await gitService.setDefaultBranch(currentBranchName, '.');
                console.log(`Successfully set '${currentBranchName}' as the default branch.`);
              } catch (setDefaultError) {
                logger.error("Failed to set default branch:", { message: setDefaultError.message, service: serviceName });
                console.error(`Failed to set default branch: ${setDefaultError.message}`);
              }
            }
          }
        } catch (pushError) {
            logger.error("Error during push operation:", { message: pushError.message, service: serviceName });
            console.error(`Error pushing to ${remoteForPush}/${currentBranchName}: ${pushError.message}`);
            if (pushError.message && (pushError.message.includes('403') || pushError.message.toLowerCase().includes('permission denied'))) {
            console.log("\nA 403 Forbidden error occurred. This usually means:");
            console.log("1. You don't have write access to the repository");
            console.log("2. Your GitHub token has expired or is invalid");
            console.log("3. The repository requires branch protection rules to be followed");
            console.log("\nPlease check your permissions and try again.");
            } else {
            console.log("\nCommon reasons for push failure:");
            console.log("1. Remote branch has changes that you don't have locally");
            console.log("2. You don't have permission to push to this branch");
            console.log("3. The remote repository is not accessible");
            console.log("\nTry pulling first or check your permissions.");
            }
        }
        break;
      }
      // TODO: Implement handlers for other intents (pull_changes, create_branch, create_pr, git_status etc.)
      case 'git_revert_last_commit':
        const noEditRevert = parsed.entities?.no_edit === true;
        try {
          const message = await gitService.revertLastCommit('.', noEditRevert);
          console.log(message);
        } catch (error) {
          console.error(`Error reverting last commit: ${error.message}`);
          logger.error('Failed to revert last commit via NLP:', { message: error.message, stack: error.stack, service: serviceName });
        }
        break;
      case 'create_merge_request': {
        const sourceBranch = parsed.entities?.source_branch === 'current branch' 
          ? await gitService.getCurrentBranch('.')
          : parsed.entities?.source_branch;
        const targetBranch = parsed.entities?.target_branch || 'main';
        
        await handleMergeRequest(sourceBranch, targetBranch);
        break;
      }
      default:
        console.log(`Intent '${parsed.intent}' is recognized but not yet implemented.`);
        logger.info(`NLP intent '${parsed.intent}' not yet implemented.`, { service: serviceName });
    }
  } catch (error) {
    console.error(`Error processing NLP query: ${error.message}`);
    logger.error('Failed to process NLP query:', { message: error.message, stack: error.stack, query, service: serviceName });
  }
}

export async function handleGenerateGitignore(projectDescription) {
    logger.info(`Handling .gitignore generation for: "${projectDescription}"`, { service: serviceName });
    if (!projectDescription || projectDescription.trim() === '') {
        console.error(".gitignore project description cannot be empty.");
        return;
    }

    const aiReady = await aiService.checkStatus();
    if (!aiReady) {
        console.error("AI service is not available. Please check your AI provider setup.");
        
        // Check if we have any environment variables set
        const hasEnvConfig = process.env.MISTRAL_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
        
        if (!hasEnvConfig) {
            console.log("\nTo set up GitMate, you have two options:");
            console.log("\nOption 1 - Environment Variables (Recommended):");
            console.log("  export AI_PROVIDER=mistral");
            console.log("  export MISTRAL_API_KEY=your_api_key_here");
            console.log("  # Then run: gitmate \"your command\"");
            
            console.log("\nOption 2 - Interactive Setup:");
            console.log("  gitmate init");
            console.log("  # This will guide you through configuration");
        } else {
            console.log("\nConfiguration issue detected. Please check your API keys.");
        }
        
        return;
    }

    try {
        const gitignoreContent = await aiService.generateGitignore(projectDescription);
        if (gitignoreContent) {
            console.log("\n--- Suggested .gitignore content ---\n");
            console.log(gitignoreContent);
            console.log("\n--- End of .gitignore content ---");
            // TODO: Add option to write this to .gitignore file
        } else {
            console.log("Could not generate .gitignore content. The AI service might have returned an empty response.");
        }
    } catch (error) {
        console.error(`Error generating .gitignore: ${error.message}`);
    }
}

export async function handleGenerateCommitMessage(directoryPath = '.') {
    logger.info(`Handling commit message generation for path: "${directoryPath}"`, { service: serviceName });

    const aiReady = await aiService.checkStatus();
    if (!aiReady) {
        console.error("AI service is not available. Please check your AI provider setup.");
        
        // Check if we have any environment variables set
        const hasEnvConfig = process.env.MISTRAL_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
        
        if (!hasEnvConfig) {
            console.log("\nTo set up GitMate, you have two options:");
            console.log("\nOption 1 - Environment Variables (Recommended):");
            console.log("  export AI_PROVIDER=mistral");
            console.log("  export MISTRAL_API_KEY=your_api_key_here");
            console.log("  # Then run: gitmate \"your command\"");
            
            console.log("\nOption 2 - Interactive Setup:");
            console.log("  gitmate init");
            console.log("  # This will guide you through configuration");
        } else {
            console.log("\nConfiguration issue detected. Please check your API keys.");
        }
        
        return;
    }

    try {
        const status = await gitService.getStatus(directoryPath);
        if (status.files.length === 0) {
            console.log("No changes to commit. Working tree clean.");
            return;
        }

        const git = simpleGit(directoryPath);
        const diffOutput = await git.diff(['HEAD']);

        if (!diffOutput || diffOutput.trim() === '') {
            console.log("No diff output available. Ensure changes are staged or present in the working directory.");
            return;
        }

        const commitMessage = await aiService.generateCommitMessage(diffOutput);
        if (commitMessage) {
            console.log(`\nSuggested commit message:`);
            console.log(`"${commitMessage}"`);
            // TODO: Add option to use this message for an actual commit
        } else {
            console.log("Could not generate a commit message.");
        }
    } catch (error) {
        console.error(`Error generating commit message: ${error.message}`);
    }
    
}

export async function handleAuthLogout() {
    logger.info("Handling auth logout command...", { service: serviceName });
    try {
    // Assuming clearAllTokens is more appropriate for a full logout.
    // If you only want to clear the GitHub token, use:
    // await storeToken('github_access_token', null);
    const { clearAllTokens } = await import("../src/utils/tokenManager.js"); // Dynamic import if not already at top
    await clearAllTokens();
    console.log("Successfully cleared stored authentication token(s).");
    logger.info("Authentication token(s) cleared.", {
        service: serviceName,
    });
    } catch (error) {
    logger.error("Error during auth logout:", {
        message: error.message,
        stack: error.stack,
        service: serviceName,
    });
    console.error(
        "An error occurred while trying to clear authentication tokens."
    );
    }
}

// Add a new command to switch AI providers
export async function handleSwitchAIProvider(provider) {
  if (!provider || !Object.values(AI_PROVIDERS).includes(provider)) {
    console.error(`Invalid AI provider. Supported providers: ${Object.values(AI_PROVIDERS).join(', ')}`);
    return;
  }

  const success = setProvider(provider);
  if (success) {
    console.log(`Switched to AI provider: ${provider}`);
    const isReady = await aiService.checkStatus();
    if (isReady) {
      console.log(`${provider} service is ready to use.`);
    } else {
      console.error(`${provider} service is not available. Please check your setup.`);
    }
  } else {
    console.error(`Failed to switch to AI provider: ${provider}`);
  }
}

async function handleMergeRequest(sourceBranch, targetBranch = 'main') {
  logger.info(`Handling merge request from ${sourceBranch} to ${targetBranch}`, { service: serviceName });
  
  try {
    // 1. Check if we're in a git repository
    const isGitRepo = await gitService.isGitRepository('.');
    if (!isGitRepo) {
      console.error("Error: Not a git repository. Please run this command from a git repository.");
      return;
    }

    // 2. Get current branch and verify it's not the target branch
    const currentBranch = await gitService.getCurrentBranch('.');
    if (currentBranch === targetBranch) {
      console.error(`Error: You are already on the target branch '${targetBranch}'. Please switch to your feature branch first.`);
      return;
    }

    // 3. Check if source branch exists
    const branches = await gitService.listBranches('.');
    if (!branches.all.includes(sourceBranch)) {
      console.error(`Error: Source branch '${sourceBranch}' does not exist.`);
      return;
    }

    // 4. Check if target branch exists
    if (!branches.all.includes(targetBranch)) {
      console.error(`Error: Target branch '${targetBranch}' does not exist.`);
      return;
    }

    // 5. Check for uncommitted changes
    const status = await gitService.getStatus('.');
    if (status.files.length > 0) {
      console.log("\nYou have uncommitted changes:");
      status.files.forEach(file => {
        console.log(`  ${file.path} (${file.working_dir})`);
      });
      
      const shouldCommit = await prompter.askYesNo("\nWould you like to commit these changes before creating the merge request?", true);
      if (shouldCommit) {
        const { commitMessage } = await inquirer.prompt([
          {
            type: 'input',
            name: 'commitMessage',
            message: 'Enter commit message:',
            default: `feat: changes before merge request to ${targetBranch}`,
            validate: input => input.trim() !== '' || 'Commit message cannot be empty'
          }
        ]);
        
        await gitService.addFiles('.', '.');
        await gitService.commitChanges(commitMessage, '.');
        console.log("Changes committed successfully.");
      } else {
        console.log("Please commit or stash your changes before creating a merge request.");
        return;
      }
    }

    // 6. Get repository info
    const repoInfo = await gitService.getRemoteInfo('.');
    if (!repoInfo) {
      throw new Error('Could not determine repository information. Please ensure you have a remote repository configured.');
    }

    // Parse owner and repo from the remote URL
    let owner, repo;
    try {
      // Handle different GitHub URL formats
      if (repoInfo.includes('github.com')) {
        // Handle HTTPS URLs (https://github.com/owner/repo.git)
        const httpsMatch = repoInfo.match(/github\.com[:/]([^/]+)\/([^/]+)(?:\.git)?$/);
        if (httpsMatch) {
          [, owner, repo] = httpsMatch;
        } else {
          // Handle SSH URLs (git@github.com:owner/repo.git)
          const sshMatch = repoInfo.match(/github\.com:([^/]+)\/([^/]+)(?:\.git)?$/);
          if (sshMatch) {
            [, owner, repo] = sshMatch;
          } else {
            throw new Error('Could not parse GitHub repository information from remote URL.');
          }
        }
      } else {
        // Handle direct owner/repo format
        const parts = repoInfo.split('/');
        if (parts.length === 2) {
          [owner, repo] = parts;
        } else {
          throw new Error('Could not parse GitHub repository information from remote URL.');
        }
      }

      // Remove .git suffix if present
      repo = repo.replace(/\.git$/, '');
      
      if (!owner || !repo) {
        throw new Error('Invalid repository information: missing owner or repository name.');
      }
    } catch (error) {
      logger.error('Failed to parse repository URL:', { 
        url: repoInfo, 
        error: error.message,
        service: serviceName 
      });
      throw new Error(`Could not parse GitHub repository information: ${error.message}`);
    }

    // 7. Check if source branch has been pushed to remote
    const remoteBranches = await gitService.listBranches('.', ['-r']);
    const sourceBranchRemote = `origin/${sourceBranch}`;
    const targetBranchRemote = `origin/${targetBranch}`;

    // Check if target branch exists on remote
    if (!remoteBranches.all.includes(targetBranchRemote)) {
      console.log(`\nTarget branch '${targetBranch}' does not exist on remote.`);
      const createTargetBranch = await prompter.askYesNo(`Would you like to push the ${targetBranch} branch to remote?`, true);
      if (createTargetBranch) {
        try {
          // Check if we need to switch to the target branch first
          const currentBranch = await gitService.getCurrentBranch('.');
          if (currentBranch !== targetBranch) {
            await gitService.checkoutBranch(targetBranch, '.');
          }
          // Push the target branch to remote
          await gitService.pushChanges('origin', targetBranch, '.', true);
          console.log(`Successfully pushed branch '${targetBranch}' to remote.`);
        } catch (error) {
          throw new Error(`Failed to push target branch: ${error.message}`);
        }
      } else {
        console.log(`Please push the ${targetBranch} branch to remote before creating a pull request.`);
        return;
      }
    }

    // Check if source branch exists on remote
    if (!remoteBranches.all.includes(sourceBranchRemote)) {
      console.log(`\nBranch '${sourceBranch}' has not been pushed to remote yet.`);
      const shouldPush = await prompter.askYesNo("Would you like to push this branch to remote now?", true);
      if (shouldPush) {
        try {
          await gitService.pushChanges('origin', sourceBranch, '.', true);
          console.log(`Successfully pushed branch '${sourceBranch}' to remote.`);
        } catch (pushError) {
          throw new Error(`Failed to push branch: ${pushError.message}`);
        }
      } else {
        console.log("Please push your branch to remote before creating a pull request.");
        return;
      }
    }

    // 8. Check if there are any differences between branches
    const diff = await gitService.getDiffBetweenBranches(sourceBranch, targetBranch, '.');
    if (!diff || diff.trim() === '') {
      console.log(`\nNo differences found between '${sourceBranch}' and '${targetBranch}'.`);
      console.log("This could mean:");
      console.log("1. The branches are identical");
      console.log("2. All changes from source branch are already in target branch");
      console.log("3. The source branch has no commits");
      
      const showLog = await prompter.askYesNo("\nWould you like to see the commit history of both branches?", true);
      if (showLog) {
        console.log(`\n=== Commits in ${sourceBranch} ===`);
        const sourceLog = await gitService.getLog('.', { branch: sourceBranch });
        if (sourceLog.total === 0) {
          console.log("No commits found in source branch.");
        } else {
          sourceLog.all.forEach(commit => {
            console.log(`- ${commit.hash.substring(0, 7)} ${commit.message}`);
          });
        }

        console.log(`\n=== Commits in ${targetBranch} ===`);
        const targetLog = await gitService.getLog('.', { branch: targetBranch });
        if (targetLog.total === 0) {
          console.log("No commits found in target branch.");
        } else {
          targetLog.all.forEach(commit => {
            console.log(`- ${commit.hash.substring(0, 7)} ${commit.message}`);
          });
        }
      }
      return;
    }

    // 9. Generate a summary of changes using AI
    console.log("\nGenerating summary of changes...");
    const changeSummary = await aiService.generateResponse(
      `Please analyze this git diff and provide a concise summary of the changes. Focus on the key modifications and their impact:\n\n${diff}`,
      { max_tokens: 500 }
    );

    // 10. Show summary and open GitHub's PR creation page
    console.log("\n=== Changes Summary ===");
    console.log(chalk.cyan(changeSummary));
    
    // Construct GitHub PR URL
    const prUrl = `https://github.com/${owner}/${repo}/compare/${targetBranch}...${sourceBranch}?expand=1`;
    
    console.log("\nOpening GitHub's pull request creation page...");
    console.log(chalk.blue("\nYou can also manually open this URL:"));
    console.log(chalk.blue(prUrl));
    
    // Copy the summary to clipboard for easy pasting
    try {
      const clipboard = await import('clipboardy');
      // Ensure we're copying a string
      const summaryText = typeof changeSummary === 'string' ? changeSummary : JSON.stringify(changeSummary, null, 2);
      await clipboard.default.write(summaryText);
      console.log(chalk.green("\nThe changes summary has been copied to your clipboard."));
      console.log(chalk.green("You can paste it directly into the PR description on GitHub."));
    } catch (clipboardError) {
      logger.warn('Failed to copy to clipboard:', { error: clipboardError.message });
      console.log(chalk.yellow("\nNote: Could not copy summary to clipboard. You can copy it manually from above."));
    }
    // Open the URL in the default browser
    try {
      const open = await import('open');
      await open.default(prUrl);
    } catch (openError) {
      logger.warn('Failed to open browser:', { error: openError.message });
      console.log(chalk.yellow("\nNote: Could not open browser automatically. Please open the URL manually:"));
      console.log(chalk.blue(prUrl));
    }

  } catch (error) {
    logger.error('Failed to create merge request:', { 
      message: error.message, 
      stack: error.stack,
      sourceBranch,
      targetBranch,
      service: serviceName 
    });
    console.error(`Error creating merge request: ${error.message}`);
  }
}

function formatDiff(diff) {
  if (!diff) return '';
  
  return diff.split('\n').map(line => {
    if (line.startsWith('+')) {
      return chalk.green(line);
    } else if (line.startsWith('-')) {
      return chalk.red(line);
    } else if (line.startsWith('@@')) {
      return chalk.cyan(line);
    } else if (line.startsWith('diff --git')) {
      return chalk.yellow(line);
    } else if (line.startsWith('index')) {
      return chalk.gray(line);
    } else if (line.startsWith('---') || line.startsWith('+++')) {
      return chalk.blue(line);
    }
    return line;
  }).join('\n');
}

function displayChangesSummary(diff) {
  const files = new Set();
  const additions = [];
  const deletions = [];
  let currentFile = '';

  diff.split('\n').forEach(line => {
    if (line.startsWith('diff --git')) {
      currentFile = line.split(' ')[2].replace('a/', '');
      files.add(currentFile);
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      additions.push({ file: currentFile, line: line.substring(1) });
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions.push({ file: currentFile, line: line.substring(1) });
    }
  });

  console.log('\n=== Changes Summary ===');
  console.log(chalk.bold(`Total files changed: ${files.size}`));
  console.log(chalk.green(`Total additions: ${additions.length}`));
  console.log(chalk.red(`Total deletions: ${deletions.length}`));
  
  console.log('\n=== Changed Files ===');
  files.forEach(file => {
    const fileAdditions = additions.filter(a => a.file === file).length;
    const fileDeletions = deletions.filter(d => d.file === file).length;
    console.log(chalk.yellow(`\n${file}`));
    console.log(`  ${chalk.green(`+${fileAdditions}`)} ${chalk.red(`-${fileDeletions}`)}`);
  });
}

async function createBackupBranch(currentBranch) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupBranchName = `gitmate-backup-with-${timestamp}`;
  
  try {
    await gitService.createAndCheckoutBranch(backupBranchName, '.');
    await gitService.pushChanges('origin', backupBranchName, '.', true);
    console.log(chalk.green(`Created backup branch: ${backupBranchName}`));
    await gitService.checkoutBranch(currentBranch, '.'); // Switch back to original branch
    return backupBranchName;
  } catch (error) {
    logger.error('Failed to create backup branch:', { message: error.message, service: serviceName });
    console.error(chalk.red(`Failed to create backup branch: ${error.message}`));
    return null;
  }
}

export async function handleAuth(args) {
  if (args.length === 0) {
    UI.error('Provider Required', 'Please specify an authentication provider (e.g., github)');
    process.exitCode = 1;
    return;
  }
  const provider = args[0];
  switch (provider.toLowerCase()) {
    case 'github': {
      // Print Render auth URL and prompt for token
      const renderAuthUrl = 'https://gitbot-jtp2.onrender.com/auth/github';
      UI.info('GitHub Authentication',
        `Please open the following URL in your browser to authenticate:\n\n${renderAuthUrl}\n\nAfter authenticating, you will receive a token.\nPaste the token here when prompted.`
      );
      const inquirer = (await import('inquirer')).default;
      const { token } = await inquirer.prompt([
        {
          type: 'input',
          name: 'token',
          message: 'Paste the token you received from the browser:',
          validate: input => input.trim() !== '' || 'Token is required',
        },
      ]);
      await storeToken('github_access_token', token.trim());
      UI.success('Authentication Complete', 'Your GitHub token has been saved. You are now authenticated!');
      break;
    }
    default:
      UI.error('Unknown Provider', `Unknown authentication provider: ${provider}`);
      process.exitCode = 1;
      break;
  }
}