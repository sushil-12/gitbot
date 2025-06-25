import logger from '../src/utils/logger.js';
import UI from '../src/utils/ui.js';
import * as prompter from '../src/utils/prompter.js';
import * as githubService from '../src/services/githubService.js';
import * as gitService from '../src/services/gitService.js';
import { aiService, AI_PROVIDERS, setProvider } from '../src/services/aiServiceFactory.js';
import { getToken, clearAllTokens, storeToken } from '../src/utils/tokenManager.js';
import inquirer from 'inquirer';
import chalk from 'chalk';
import dotenv from 'dotenv';
import crypto from 'crypto';


// Load environment variables
dotenv.config();
const ENCRYPTION_KEY = "app_development_by_sushil"; // Must be the same as backend
const IV_LENGTH = 16;

function decrypt(text) {
  console.log(text);
  if (!text || typeof text !== 'string' || !text.includes(':')) return text;
  const [ivHex, encryptedHex] = text.split(':');
  if (!ivHex || !encryptedHex) return text; // Not encrypted
  const iv = Buffer.from(ivHex, 'hex');
  const encryptedText = Buffer.from(encryptedHex, 'hex');
  console.log(ENCRYPTION_KEY);
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'utf8'), iv);
  console.log(ENCRYPTION_KEY);
  let decrypted = decipher.update(encryptedText);
  console.log(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  console.log(decrypted.toString('utf8'));
  return decrypted.toString('utf8');
}



const serviceName = 'CommandHandler';

let diffViewerInitialized = false;

async function ensureAuthenticated() {
  let token = await getToken('github_access_token');
  if (!token) {
    logger.warn('User is not authenticated. Please authenticate first.', { service: serviceName });

    // Determine the correct auth URL
    const renderAuthUrl = process.env.RENDER_AUTH_URL || 'https://gitbot-jtp2.onrender.com/auth/github';
    const authInitiateUrl = renderAuthUrl;

    UI.error('Authentication Required', 
      'You need to authenticate with GitHub to use this feature.');
    UI.info('Follow these steps:', 
      `1. Please open your browser and navigate to: ${authInitiateUrl}\n2. Authorize the application\n3. Paste the token below:`);

    const { token: enteredToken } = await inquirer.prompt([
      {
        type: 'password',
        name: 'token',
        message: 'Paste the token you received from the browser:',
        mask: '*',
        validate: input => input.trim() !== '' || 'Token is required',
      },
    ]);
    const decryptedToken = decrypt(enteredToken.trim());
    console.log(decryptedToken);
    await storeToken('github_access_token', decryptedToken);
    token = decryptedToken;
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
      exit();
      UI.info('GitHub Authentication',
        `Please open the following URL in your browser to authenticate:\n\n${renderAuthUrl}\n\nAfter authenticating, you will receive a token.\nPaste the token here when prompted.`
      );
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
      tokensaved = await storeToken('github_access_token', token.trim());
      console.log(tokensaved)
      UI.success('Authentication Complete', 'Your GitHub token has been saved. You are now authenticated!');
      break;
    }
    default:
      UI.error('Unknown Provider', `Unknown authentication provider: ${provider}`);
      process.exitCode = 1;
      break;
  }
}

export async function handleNlpCommand(query) {
  logger.info(`Handling NLP query: "${query}"`, { service: serviceName });
  if (!query || query.trim() === '') {
    console.error("NLP query cannot be empty.");
    return;
  }

  // First check if this is a simple conversation that doesn't need AI
  const lowerQuery = query.toLowerCase().trim();
  const greetings = ['hello', 'hi', 'hey', 'greetings', 'good morning', 'good afternoon', 'good evening'];
  const thanks = ['thank', 'thanks', 'appreciate'];
  
  // Handle simple greetings immediately
  if (greetings.some(g => lowerQuery.includes(g))) {
    try {
      const token = await ensureAuthenticated();
      let userName = null;
      if (token) {
        const profile = await githubService.getUserProfile();
        if (profile && (profile.name || profile.login)) {
          userName = profile.name || profile.login;
        }
      }
      console.log(chalk.cyan(`\n${userName ? `Hello, ${userName}! 👋` : 'Hello! 👋'}`));
      console.log(chalk.gray("\nHow can I help you with Git today?"));
      if (!userName) {
        console.log(chalk.yellow("\nTip: Authenticate with GitHub for personalized experience using 'gitmate auth'"));
      }
      return;
    } catch (error) {
      // Fallback if GitHub profile fetch fails
      console.log(chalk.cyan("\nHello! 👋\nHow can I help you with Git today?"));
      return;
    }
  }

  // Handle thanks immediately
  if (thanks.some(t => lowerQuery.includes(t))) {
    try {
      const token = await ensureAuthenticated();
      let userName = null;
      if (token) {
        const profile = await githubService.getUserProfile();
        if (profile && (profile.name || profile.login)) {
          userName = profile.name || profile.login;
        }
      }
      console.log(chalk.green(`\n${userName ? `You're welcome, ${userName}! 😊` : 'You\'re welcome! 😊'}`));
      console.log(chalk.gray("\nLet me know if you need any more help with Git."));
      return;
    } catch (error) {
      // Fallback if GitHub profile fetch fails
      console.log(chalk.green("\nYou're welcome! 😊\nLet me know if you need any more help with Git."));
      return;
    }
  }

  // Check for unrelated questions
  const gitKeywords = ['git', 'push', 'pull', 'commit', 'branch', 'merge', 'repo'];
  const githubKeywords = ['github', 'pull request', 'pr', 'issue'];
  const isGitRelated = gitKeywords.some(k => lowerQuery.includes(k)) || 
                      githubKeywords.some(k => lowerQuery.includes(k));

  if (!isGitRelated) {
    try {
      const token = await ensureAuthenticated();
      let userName = null;
      if (token) {
        const profile = await githubService.getUserProfile();
        if (profile && (profile.name || profile.login)) {
          userName = profile.login || profile.name;
        }
      }
      console.log(chalk.yellow(`\n${userName ? `Hi ${userName},` : 'Hi there,'} I'm specialized in Git operations.`));
      console.log(chalk.gray("I can help you with version control, repositories, and GitHub-related tasks."));
      console.log(chalk.gray("What would you like to do with your code?"));
      if (!userName) {
        console.log(chalk.yellow("\nTip: Authenticate with GitHub for personalized experience using 'gitmate auth'"));
      }
      return;
    } catch (error) {
      // Fallback if GitHub profile fetch fails
      console.log(chalk.yellow("\nHi there, I'm specialized in Git operations."));
      console.log(chalk.gray("I can help you with version control, repositories, and GitHub-related tasks."));
      console.log(chalk.gray("What would you like to do with your code?"));
      return;
    }
  }

  // Proceed with AI service for Git-related queries
  const aiReady = await aiService.checkStatus();
  if (!aiReady) {
    console.error("AI service is not available. Please check your AI provider setup.");
    
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
    // Get user profile for personalized responses
    let userName = null;
    try {
      const token = await ensureAuthenticated();
      if (token) {
        const profile = await githubService.getUserProfile();
        if (profile && (profile.name || profile.login)) {
          userName = profile.name || profile.login;
        }
      }
    } catch (error) {
      logger.warn('Failed to fetch GitHub profile', { error: error.message });
    }

    // Handle with AI service
    const { response, requiresConfirmation, intent } = await aiService.handleUserQuery(query, userName);
    
    // Output the response immediately
    console.log(chalk.cyan("\n" + response));

    // Only proceed with confirmation if needed
    if (requiresConfirmation && intent) {
      const { confirmed } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmed',
          message: 'Would you like to proceed?',
          default: true
        }
      ]);

      if (confirmed) {
        console.log("INTENT", intent)
        console.log(chalk.green(`\nProceeding with: ${intent}`));
        // Execute the actual Git operation based on intent
        await executeGitOperation(intent, userName);
      } else {
        console.log(chalk.yellow("\nOperation cancelled."));
      }
    }
  } catch (error) {
    console.error(`Error processing NLP query: ${error.message}`);
    logger.error('Failed to process NLP query:', { 
      message: error.message, 
      stack: error.stack, 
      query, 
      service: serviceName 
    });
  }
}

async function executeGitOperation(intentObj, userName) {
  const { intent, entities = {} } = intentObj;
  console.log(chalk.blue(`\nExecuting ${intent} operation...`));

  // Helper function for interactive commit message handling
  const getCommitMessage = async (prefilledMessage = '') => {
    const { commitMessage } = await inquirer.prompt([
      {
        type: 'input',
        name: 'commitMessage',
        message: prefilledMessage 
          ? `Commit message (press enter to use "${prefilledMessage}" or edit):`
          : 'Enter commit message:',
        default: prefilledMessage,
        validate: input => input.trim() !== '' || 'Commit message cannot be empty'
      }
    ]);
    return commitMessage.trim();
  };

  try {
    switch (intent) {
      case 'git_commit': {
        let commitMessage = entities.commit_message;
        
        if (!commitMessage) {
          // Try to generate a commit message from diff if none provided
          try {
            const diff = await gitService.getDiff('.');
            if (diff) {
              const generatedMessage = await aiService.generateCommitMessage(diff);
              if (generatedMessage) {
                console.log(chalk.cyan('\nSuggested commit message:'), generatedMessage);
              }
            }
          } catch (error) {
            logger.warn('Failed to generate commit message from diff', { error: error.message });
          }
        }

        // Get final commit message from user
        commitMessage = await getCommitMessage(commitMessage);
        await handleGitCommand(['commit', '-m', commitMessage], '.');
        
        console.log(chalk.green(`\n${userName ? `${userName}, ` : ''}Changes committed with message: "${commitMessage}"`));
        break;
      }

      case 'git_add': {
        const filesEntity = entities.files;
        
        if (filesEntity && filesEntity !== 'all' && filesEntity !== 'some' && filesEntity !== 'changes') {
          await handleGitCommand(['add', filesEntity], '.');
        } else {
          // Interactive add flow
          const status = await gitService.getStatus('.');
          const unStagedFiles = [
            ...status.not_added.map(f => ({ name: `${f} (Untracked)`, value: f })),
            ...status.modified.map(f => ({ name: `${f} (Modified)`, value: f })),
            ...status.deleted.map(f => ({ name: `${f} (Deleted)`, value: f }))
          ];

          if (unStagedFiles.length === 0) {
            console.log(chalk.yellow('\nNo changes to add. Working directory clean.'));
            break;
          }

          const { filesToAdd } = await inquirer.prompt([
            {
              type: 'checkbox',
              name: 'filesToAdd',
              message: 'Select files to stage:',
              choices: [
                new inquirer.Separator('=== Unstaged Changes ==='),
                ...unStagedFiles,
                new inquirer.Separator(),
                { name: 'All Changes', value: 'all' }
              ],
              pageSize: Math.min(15, unStagedFiles.length + 4),
              validate: answer => answer.length > 0 || 'You must choose at least one file.'
            }
          ]);

          const files = filesToAdd.includes('all') ? ['.'] : filesToAdd;
          await gitService.addFiles(files, '.');
          
          console.log(chalk.green(`\nSuccessfully staged ${files.length} file(s)`));
          
          // Offer to commit immediately
          const shouldCommit = await prompter.askYesNo('Would you like to commit these changes now?', true);
          if (shouldCommit) {
            const commitMessage = await getCommitMessage();
            await handleGitCommand(['commit', '-m', commitMessage], '.');
            console.log(chalk.green(`\nChanges committed with message: "${commitMessage}"`));
          }
        }
        break;
      }

      case 'push_changes': {
        const token = await ensureAuthenticated();
        if (!token) {
          console.error(chalk.red('\nAuthentication required for push operations.'));
          return;
        }

        // Check repository status
        let currentStatus;
        try {
          currentStatus = await gitService.getStatus('.');
        } catch (error) {
          if (error.message.includes('not a git repository')) {
            const shouldInit = await prompter.askYesNo(
              'This directory is not a Git repository. Initialize one now?', 
              true
            );
            if (shouldInit) {
              await handleGitCommand(['init'], '.');
              currentStatus = await gitService.getStatus('.');
              console.log(chalk.green('\nInitialized new Git repository.'));
            } else {
              return;
            }
          } else {
            throw error;
          }
        }

        // Handle unstaged changes
        if (currentStatus.not_added.length > 0 || currentStatus.modified.length > 0) {
          console.log(chalk.yellow('\nYou have unstaged changes:'));
          
          const unstagedSummary = [
            ...currentStatus.not_added.map(f => chalk.gray(`  ${f} (untracked)`)),
            ...currentStatus.modified.map(f => chalk.yellow(`  ${f} (modified)`)),
            ...currentStatus.deleted.map(f => chalk.red(`  ${f} (deleted)`))
          ].join('\n');
          
          console.log(unstagedSummary);
          
          const shouldStage = await prompter.askYesNo(
            'Would you like to stage and commit these changes before pushing?',
            true
          );
          
          if (shouldStage) {
            await handleGitCommand(['add', '.'], '.');
            
            // Generate suggested commit message from diff
            let suggestedMessage = '';
            try {
              const diff = await gitService.getDiff('--cached');
              suggestedMessage = await aiService.generateCommitMessage(diff);
            } catch (error) {
              logger.warn('Failed to generate commit message', { error });
            }
            
            const commitMessage = await getCommitMessage(suggestedMessage);
            await handleGitCommand(['commit', '-m', commitMessage], '.');
            console.log(chalk.green(`\nChanges committed with message: "${commitMessage}"`));
            
            // Refresh status
            currentStatus = await gitService.getStatus('.');
          }
        }

        // Determine target branch
        let targetBranch = entities.branch || 'current';
        const currentBranch = currentStatus.current || 'main';
        
        if (targetBranch === 'current') {
          targetBranch = currentBranch;
        }

        // Handle branch switching if needed
        if (targetBranch !== currentBranch) {
          const branches = await gitService.listBranches('.');
          
          if (!branches.all.includes(targetBranch)) {
            const shouldCreate = await prompter.askYesNo(
              `Branch "${targetBranch}" doesn't exist. Create it?`,
              true
            );
            
            if (shouldCreate) {
              await gitService.createAndCheckoutBranch(targetBranch, '.');
              console.log(chalk.green(`\nCreated and switched to branch "${targetBranch}"`));
            } else {
              return;
            }
          } else {
            await gitService.checkoutBranch(targetBranch, '.');
            console.log(chalk.green(`\nSwitched to branch "${targetBranch}"`));
          }
        }

        // Push logic
        const remote = entities.remote || 'origin';
        
        try {
          console.log(chalk.blue(`\nPushing to ${remote}/${targetBranch}...`));
          await gitService.pushChanges(remote, targetBranch, '.', true, entities.force);
          console.log(chalk.green('\nPush successful!'));
          
          // Offer to set as default branch
          if (entities.set_as_default) {
            const shouldSetDefault = await prompter.askYesNo(
              `Would you like to set "${targetBranch}" as the default branch?`,
              true
            );
            
            if (shouldSetDefault) {
              await gitService.setDefaultBranch(targetBranch, '.');
              console.log(chalk.green(`\n"${targetBranch}" is now the default branch`));
            }
          }
        } catch (pushError) {
          console.error(chalk.red(`\nPush failed: ${pushError.message}`));
          
          // Provide helpful suggestions
          if (pushError.message.includes('no upstream branch')) {
            console.log(chalk.yellow('\nTry: git push --set-upstream origin', targetBranch));
          } else if (pushError.message.includes('updates were rejected')) {
            console.log(chalk.yellow('\nTry: git pull first to merge remote changes'));
          }
        }
        break;
      }

      // Other cases (git_init, git_revert_last_commit, etc.) would follow similar patterns
      // ...

      default:
        console.log(chalk.yellow(`\nOperation "${intent}" is not yet implemented.`));
        console.log(chalk.blue('\nSupported operations: commit, add, push, init, etc.'));
    }
  } catch (error) {
    console.error(chalk.red(`\n${userName ? `${userName}, ` : ''}Operation failed: ${error.message}`));
    logger.error('Operation failed', { 
      intent, 
      error: error.message,
      stack: error.stack 
    });
    
    // Provide recovery suggestions
    if (error.message.includes('merge conflict')) {
      console.log(chalk.yellow('\nResolve conflicts and try committing again.'));
    }
  }
}