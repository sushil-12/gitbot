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
const ENCRYPTION_KEY = "12345678901234567890123456789012"; // Must be the same as backend
const IV_LENGTH = 16;

function decrypt(text) {
  try {
    if (!text || typeof text !== 'string' || !text.includes(':')) return text;
    const [ivHex, encryptedHex] = text.split(':');
    if (!ivHex || !encryptedHex) return text; // Not encrypted
    const iv = Buffer.from(ivHex, 'hex');
    const encryptedText = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'utf8'), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
  } catch (error) {
    console.error('Decryption error:', error);
    return null;
  }
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
      `1. Please open your browser and navigate to: ${authInitiateUrl}\n2. Authorize the application\n3. Paste the encrypted token below:`);

    const { token: enteredToken } = await inquirer.prompt([
      {
        type: 'password',
        name: 'token',
        message: 'Paste the encrypted token you received from the browser:',
        mask: '*',
        validate: input => input.trim() !== '' || 'Token is required',
      },
    ]);
    
    // Store the encrypted token as-is
    await storeToken('github_access_token', enteredToken.trim());
    
    // Now decrypt it for use
    const decryptedToken = decrypt(enteredToken.trim());
    if (!decryptedToken) {
      UI.error('Invalid Token', 'The token you provided could not be decrypted. Please try again.');
      process.exitCode = 1;
      return null;
    }
    
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

  switch (subCommand) {
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
        const formattedStatus = await gitService.getFormattedStatus(currentWorkingDirectory);
        console.log(formattedStatus);
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
    case 'branch':
      try {
        const branches = await gitService.listBranches(currentWorkingDirectory);
        console.log(chalk.blue('Branches:'), branches.join(', '));
      } catch (error) {
        console.error(`Error listing branches: ${error.message}`);
      }
      break;
    case 'remote':
      try {
        const remotes = await gitService.getRemotes(currentWorkingDirectory);
        if (remotes.length === 0) {
          console.log(chalk.yellow('No remotes configured.'));
        } else {
          console.log(chalk.blue('Remotes:'));
          remotes.forEach(remote => {
            console.log(`  ${remote.name}: ${remote.refs.fetch}`);
          });
        }
      } catch (error) {
        console.error(`Error listing remotes: ${error.message}`);
      }
      break;
    case 'log':
      try {
        const log = await gitService.getLog(currentWorkingDirectory);
        log.all.forEach(entry => {
          console.log(chalk.yellow(entry.hash), entry.date, '-', entry.message);
        });
      } catch (error) {
        console.error(`Error getting log: ${error.message}`);
      }
      break;
    case 'diff':
      try {
        const diff = await gitService.getDiff(options.join(' '), currentWorkingDirectory);
        console.log(diff);
      } catch (error) {
        console.error(`Error getting diff: ${error.message}`);
      }
      break;
    case 'push':
      try {
        const remoteName = options[0] || 'origin';
        const branchName = options[1];
        const pushOptions = {};
        
        // Parse push options
        if (options.includes('--set-upstream') || options.includes('-u')) {
          pushOptions.setUpstream = true;
        }
        if (options.includes('--force') || options.includes('-f')) {
          pushOptions.force = true;
        }
        
        const result = await gitService.pushChanges(remoteName, branchName, currentWorkingDirectory, pushOptions);
        console.log(result);
      } catch (error) {
        console.error(`Error pushing changes: ${error.message}`);
      }
      break;
    case 'pull':
      try {
        const remoteName = options[0] || 'origin';
        const branchName = options[1];
        const result = await gitService.pullChanges(remoteName, branchName, currentWorkingDirectory);
        console.log(result);
      } catch (error) {
        console.error(`Error pulling changes: ${error.message}`);
      }
      break;
    // Add more git subcommands: push, pull, branch, checkout, merge, rebase etc.
    default:
      logger.warn(`Unknown 'git' subcommand: ${subCommand}`, { service: serviceName });
      console.log(`Unknown 'git' subcommand: ${subCommand}. Supported: init, status, add, commit, branch, remote, log, diff, push, pull (more to come).`);
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
  try {
    await clearAllTokens();
    UI.success('Logged Out Successfully', 'All authentication tokens have been cleared.');
    logger.info('User logged out successfully', { service: serviceName });
  } catch (error) {
    UI.error('Logout Failed', error.message);
    logger.error('Logout failed:', { message: error.message, stack: error.stack, service: serviceName });
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
  console.log(query);
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
      const confirmed = await handleConfirmationFlow(intent, userName);
      if (confirmed) {
        // Execute the actual Git operation based on intent
        await executeGitOperation(intent, userName);
      }
    } else {
      console.log(response);
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

export async function executeGitOperation(intentObj, userName) {
  const { intent, entities = {} } = intentObj;
  console.log(intentObj);
  // Normalize intent for common variants
  let normalizedIntent = intent;
  if ([
    'list_repo', 'list_repos', 'list_repositories', 'list_repository'
  ].includes(intent)) {
    normalizedIntent = 'list_repos';
  } else if ([
    'create_repo', 'create_repository', 'new_repo', 'new_repository'
  ].includes(intent)) {
    normalizedIntent = 'create_repo';
  } else if ([
    'get_log', 'show_log', 'log', 'git_log'
  ].includes(intent)) {
    normalizedIntent = 'get_log';
  } else if ([
    'get_diff', 'show_diff', 'diff', 'git_diff'
  ].includes(intent)) {
    normalizedIntent = 'get_diff';
  } else if ([
    'get_status', 'show_status', 'status', 'git_status'
  ].includes(intent)) {
    normalizedIntent = 'git_status';
  } else if ([
    'add_remote', 'remote_add', 'git_add_remote'
  ].includes(intent)) {
    normalizedIntent = 'add_remote';
  } else if ([
    'get_remotes', 'list_remotes', 'remotes', 'git_remotes'
  ].includes(intent)) {
    normalizedIntent = 'get_remotes';
  } else if ([
    'get_current_branch', 'current_branch', 'show_current_branch', 'branch_current'
  ].includes(intent)) {
    normalizedIntent = 'get_current_branch';
  } else if ([
    'list_branches', 'branches', 'show_branches', 'get_branches'
  ].includes(intent)) {
    normalizedIntent = 'list_branches';
  } else if ([
    'revert_commit', 'undo_commit', 'git_revert_commit'
  ].includes(intent)) {
    normalizedIntent = 'revert_commit';
  } else if ([
    'create_and_checkout_branch', 'create_checkout_branch', 'new_and_checkout_branch'
  ].includes(intent)) {
    normalizedIntent = 'create_and_checkout_branch';
  } else if ([
    'clone_repo', 'clone_repository', 'clone', 'git_clone', 'repo_clone'
  ].includes(intent)) {
    normalizedIntent = 'clone_repo';
  }
  // Add more normalization rules as needed for other commands

  // Helper function for interactive commit message handling
  const getCommitMessage = async (prefilledMessage = '') => {
    const { commitMessage } = await inquirer.prompt([
      {
        type: 'input',
        name: 'commitMessage',
        message: prefilledMessage
          ? `Commit message (press enter to use suggested or edit):`
          : 'Enter commit message:',
        default: prefilledMessage,
        validate: input => input.trim() !== '' || 'Commit message cannot be empty'
      }
    ]);
    return commitMessage.trim();
  };

  try {
    switch (normalizedIntent) {
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
          
          // Fix file counting - if "all" was selected, count the actual files
          const actualFileCount = filesToAdd.includes('all') ? unStagedFiles.length : filesToAdd.length;
          console.log(chalk.green(`\nStaged ${actualFileCount} file(s) for commit`));

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
            // Interactive file selection instead of automatic staging
            const unStagedFiles = [
              ...currentStatus.not_added.map(f => ({ name: `${f} (Untracked)`, value: f })),
              ...currentStatus.modified.map(f => ({ name: `${f} (Modified)`, value: f })),
              ...currentStatus.deleted.map(f => ({ name: `${f} (Deleted)`, value: f }))
            ];

            const { filesToAdd } = await inquirer.prompt([
              {
                type: 'checkbox',
                name: 'filesToAdd',
                message: 'Select files to stage for commit:',
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
            
            // Fix file counting - if "all" was selected, count the actual files
            const actualFileCount = filesToAdd.includes('all') ? unStagedFiles.length : filesToAdd.length;
            console.log(chalk.green(`\nStaged ${actualFileCount} file(s) for commit`));

            // Generate suggested commit message from diff
            let suggestedMessage = '';
            try {
              const diff = await gitService.getDiff('--cached');
              suggestedMessage = await aiService.generateCommitMessage(diff);
            } catch (error) {
              logger.warn('Failed to generate commit message', { error });
            }

            // Improved commit message handling
            const { commitMessage } = await inquirer.prompt([
              {
                type: 'input',
                name: 'commitMessage',
                message: suggestedMessage
                  ? `Commit message (press enter to use suggested or edit):`
                  : 'Enter commit message:',
                default: suggestedMessage || '',
                validate: input => input.trim() !== '' || 'Commit message cannot be empty'
              }
            ]);

            await handleGitCommand(['commit', '-m', commitMessage.trim()], '.');
            console.log(chalk.green(`\nChanges committed with message: "${commitMessage.trim()}"`));

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
          // Ensure remote is authenticated before pushing
          await gitService.ensureAuthenticatedRemote('.');
          
          console.log(chalk.blue(`\nPushing to ${remote}/${targetBranch}...`));
          await gitService.pushChanges(remote, targetBranch, '.', { setUpstream: true, force: entities.force });
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

      case 'git_init': {
        try {
          const message = await gitService.initRepo('.');
          console.log(chalk.green(message));
        } catch (error) {
          console.error(chalk.red('Error initializing repository:'), error.message);
        }
        break;
      }
      case 'git_status': {
        try {
          const status = await gitService.getStatus('.');
          console.log(status);
        } catch (error) {
          console.error(chalk.red('Error getting status:'), error.message);
        }
        break;
      }
      case 'git_revert_last_commit': {
        try {
          const result = await gitService.revertCommit('HEAD', '.');
          console.log(chalk.green(result));
        } catch (error) {
          console.error(chalk.red('Error reverting last commit:'), error.message);
        }
        break;
      }
      case 'pull_changes': {
        try {
          const remote = entities.remote || 'origin';
          const branch = entities.branch;
          const result = await gitService.pullChanges(remote, branch, '.');
          console.log(chalk.green(result));
        } catch (error) {
          console.error(chalk.red('Error pulling changes:'), error.message);
        }
        break;
      }
      case 'create_branch': {
        try {
          const branchName = entities.branch || (await inquirer.prompt([{ type: 'input', name: 'branch', message: 'Branch name:' }])).branch;
          const result = await gitService.createBranch(branchName, '.');
          console.log(chalk.green(result));
        } catch (error) {
          console.error(chalk.red('Error creating branch:'), error.message);
        }
        break;
      }
      case 'checkout_branch': {
        try {
          const branchName = entities.branch || (await inquirer.prompt([{ type: 'input', name: 'branch', message: 'Branch to checkout:' }])).branch;
          const result = await gitService.checkoutBranch(branchName, '.');
          console.log(chalk.green(result));
        } catch (error) {
          console.error(chalk.red('Error checking out branch:'), error.message);
        }
        break;
      }
      case 'merge_branch': {
        try {
          const sourceBranch = entities.source_branch || (await inquirer.prompt([{ type: 'input', name: 'source_branch', message: 'Source branch to merge from:' }])).source_branch;
          const result = await gitService.mergeBranch(sourceBranch, '.');
          if (result.conflicts) {
            console.log(chalk.yellow(result.message));
            console.log('Conflicts:', result.conflicts);
          } else {
            console.log(chalk.green(result));
          }
        } catch (error) {
          console.error(chalk.red('Error merging branch:'), error.message);
        }
        break;
      }
      case 'rebase_branch': {
        try {
          const baseBranch = entities.base_branch || (await inquirer.prompt([{ type: 'input', name: 'base_branch', message: 'Base branch to rebase onto:' }])).base_branch;
          const result = await gitService.rebaseBranch(baseBranch, '.');
          console.log(chalk.green(result));
        } catch (error) {
          console.error(chalk.red('Error rebasing branch:'), error.message);
        }
        break;
      }
      case 'clone_repo': {
        try {
          const repoUrl = entities.repo_url || (await inquirer.prompt([{ type: 'input', name: 'repo_url', message: 'Repository URL to clone:' }])).repo_url;
          // const targetPath = entities.target_path || (await inquirer.prompt([{ type: 'input', name: 'target_path', message: 'Target directory:' }])).target_path;
          const result = await gitService.cloneRepository(repoUrl, targetPath);
          console.log(chalk.green(result));
        } catch (error) {
          console.error(chalk.red('Error cloning repository:'), error.message);
        }
        break;
      }
      case 'list_branches': {
        try {
          const branches = await gitService.listBranches('.');
          console.log(chalk.blue('Branches:'), branches.join(', '));
        } catch (error) {
          console.error(chalk.red('Error listing branches:'), error.message);
        }
        break;
      }
      case 'list_repos': {
        try {
          const repos = await githubService.listUserRepositories();
          if (repos.length === 0) {
            console.log(chalk.yellow('No repositories found.'));
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
          console.error(chalk.red('Error listing repositories:'), error.message);
        }
        break;
      }
      case 'create_repo': {
        try {
          const name = entities.name || (await inquirer.prompt([{ type: 'input', name: 'name', message: 'Repository name:' }])).name;
          const options = {};
          if (!entities.private) {
            const { isPrivate } = await inquirer.prompt([{ type: 'confirm', name: 'isPrivate', message: 'Private repository?', default: false }]);
            options.private = isPrivate;
          } else {
            options.private = entities.private;
          }
          const { description } = await inquirer.prompt([{ type: 'input', name: 'description', message: 'Description (optional):', default: '' }]);
          options.description = description;
          const repo = await githubService.createRepository(name, options);
          console.log(chalk.green('Repository created:'), repo.full_name, repo.html_url);
        } catch (error) {
          console.error(chalk.red('Error creating repository:'), error.message);
        }
        break;
      }
      case 'set_default_branch': {
        try {
          const branchName = entities.branch || (await inquirer.prompt([{ type: 'input', name: 'branch', message: 'Branch to set as default:' }])).branch;
          const result = await gitService.setDefaultBranch(branchName, '.');
          console.log(chalk.green(result));
        } catch (error) {
          console.error(chalk.red('Error setting default branch:'), error.message);
        }
        break;
      }
      case 'get_log': {
        try {
          const log = await gitService.getLog('.');
          log.all.forEach(entry => {
            console.log(chalk.yellow(entry.hash), entry.date, '-', entry.message);
          });
        } catch (error) {
          console.error(chalk.red('Error getting log:'), error.message);
        }
        break;
      }
      case 'get_diff': {
        try {
          const diff = await gitService.getDiff('', '.');
          console.log(diff);
        } catch (error) {
          console.error(chalk.red('Error getting diff:'), error.message);
        }
        break;
      }
      case 'configure_git_user': {
        try {
          const { name } = await inquirer.prompt([{ type: 'input', name: 'name', message: 'Git user name:' }]);
          const { email } = await inquirer.prompt([{ type: 'input', name: 'email', message: 'Git user email:' }]);
          const result = await gitService.configureGitUser('.', { name, email });
          console.log(chalk.green('Git user configured:'), result);
        } catch (error) {
          console.error(chalk.red('Error configuring git user:'), error.message);
        }
        break;
      }
      case 'get_current_branch': {
        try {
          const branch = await gitService.getCurrentBranch('.');
          console.log(chalk.blue('Current branch:'), branch);
        } catch (error) {
          console.error(chalk.red('Error getting current branch:'), error.message);
        }
        break;
      }
      case 'get_remotes': {
        try {
          const remotes = await gitService.getRemotes('.');
          remotes.forEach(remote => {
            console.log(chalk.blue(remote.name), '-', remote.refs.fetch);
          });
        } catch (error) {
          console.error(chalk.red('Error getting remotes:'), error.message);
        }
        break;
      }
      case 'add_remote': {
        try {
          const { name } = await inquirer.prompt([{ type: 'input', name: 'name', message: 'Remote name:' }]);
          const { url } = await inquirer.prompt([{ type: 'input', name: 'url', message: 'Remote URL:' }]);
          const result = await gitService.addRemote(name, url, '.');
          console.log(chalk.green(result));
        } catch (error) {
          console.error(chalk.red('Error adding remote:'), error.message);
        }
        break;
      }
      case 'get_diff_between_branches': {
        try {
          const sourceBranch = entities.source_branch || (await inquirer.prompt([{ type: 'input', name: 'source_branch', message: 'Source branch:' }])).source_branch;
          const targetBranch = entities.target_branch || (await inquirer.prompt([{ type: 'input', name: 'target_branch', message: 'Target branch:' }])).target_branch;
          const diff = await gitService.getDiffBetweenBranches(sourceBranch, targetBranch, '.');
          console.log(diff);
        } catch (error) {
          console.error(chalk.red('Error getting diff between branches:'), error.message);
        }
        break;
      }
      case 'revert_commit': {
        try {
          const commitHash = entities.commit_hash || (await inquirer.prompt([{ type: 'input', name: 'commit_hash', message: 'Commit hash to revert:' }])).commit_hash;
          const result = await gitService.revertCommit(commitHash, '.');
          console.log(chalk.green(result));
        } catch (error) {
          console.error(chalk.red('Error reverting commit:'), error.message);
        }
        break;
      }
      case 'create_and_checkout_branch': {
        try {
          const branchName = entities.branch || (await inquirer.prompt([{ type: 'input', name: 'branch', message: 'Branch name:' }])).branch;
          const result = await gitService.createAndCheckoutBranch(branchName, '.');
          console.log(chalk.green(result));
        } catch (error) {
          console.error(chalk.red('Error creating and checking out branch:'), error.message);
        }
        break;
      }

      default:
        console.log(chalk.yellow(`\nOperation "${intent}" is not yet implemented.`));
        console.log(chalk.blue('\nSupported operations:'));
        console.log(`
  • git_commit           - Commit changes
  • git_add              - Stage/add files
  • push_changes         - Push to remote
  • git_init             - Initialize a new repo
  • git_status           - Show status
  • git_revert_last_commit - Revert last commit
  • pull_changes         - Pull from remote
  • create_branch        - Create a branch
  • checkout_branch      - Switch branch
  • merge_branch         - Merge branches
  • rebase_branch        - Rebase branches
  • clone_repo           - Clone a repository
  • list_branches        - List all branches
  • list_repos           - List all repositories for the user/account
  • create_repo          - Create a new repository
  • set_default_branch   - Set the default branch
  • get_log              - Show commit log/history
  • get_diff             - Show diff
  • configure_git_user   - Set git user config
  • get_current_branch   - Show current branch
  • get_remotes          - List remotes
  • add_remote           - Add a remote
  • get_diff_between_branches - Show diff between branches
  • revert_commit        - Revert a specific commit
  • create_and_checkout_branch - Create and switch to a branch
`);
        break;
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

export async function handleUserInfo() {
  try {
    // Get GitHub user info
    const token = await getToken('github_access_token');
    let githubUser = null;
    
    if (token) {
      try {
        githubUser = await githubService.getUserProfile();
      } catch (error) {
        logger.warn('Could not fetch GitHub user info:', { error: error.message, service: serviceName });
      }
    }

    // Get Git config info
    let gitConfig = null;
    try {
      gitConfig = await gitService.getGitConfig('.');
    } catch (error) {
      logger.warn('Could not fetch Git config:', { error: error.message, service: serviceName });
    }

    // Display user information
    UI.section('User Information', 'Current authentication and configuration status');

    const userData = [];
    
    if (githubUser) {
      userData.push({
        Service: 'GitHub',
        Username: githubUser.login,
        Name: githubUser.name || 'Not set',
        Email: githubUser.email || 'Not set',
        Status: '✅ Authenticated'
      });
    } else {
      userData.push({
        Service: 'GitHub',
        Username: 'Not authenticated',
        Name: 'Not available',
        Email: 'Not available',
        Status: '❌ Not authenticated'
      });
    }

    if (gitConfig) {
      userData.push({
        Service: 'Git Config',
        Username: gitConfig.user?.name || 'Not set',
        Name: gitConfig.user?.name || 'Not set',
        Email: gitConfig.user?.email || 'Not set',
        Status: gitConfig.user?.name ? '✅ Configured' : '⚠️ Partially configured'
      });
    } else {
      userData.push({
        Service: 'Git Config',
        Username: 'Not configured',
        Name: 'Not configured',
        Email: 'Not configured',
        Status: '❌ Not configured'
      });
    }

    UI.table(userData);

    // Show helpful information
    if (!githubUser) {
      UI.info('GitHub Authentication', 'Run "gitmate auth github" to authenticate with GitHub');
    }
    
    if (!gitConfig?.user?.name || !gitConfig?.user?.email) {
      UI.info('Git Configuration', 'Run "gitmate config git" to configure your Git user settings');
    }

  } catch (error) {
    UI.error('Failed to Get User Info', error.message);
    logger.error('Failed to get user info:', { message: error.message, stack: error.stack, service: serviceName });
  }
}

export async function handleGitConfig(args) {
  try {
    const [subCommand, ...options] = args;
    
    switch (subCommand) {
      case 'show':
      case 'view':
        // Show current Git config
        try {
          const config = await gitService.getGitConfig('.');
          console.log('\nCurrent Git Configuration:');
          console.log(JSON.stringify(config, null, 2));
        } catch (error) {
          console.error(`Error getting Git config: ${error.message}`);
        }
        break;

      case 'set':
        // Set Git config values
        const { name, email } = await inquirer.prompt([
          {
            type: 'input',
            name: 'name',
            message: 'Enter your name:',
            default: '',
            validate: input => input.trim() !== '' || 'Name is required'
          },
          {
            type: 'input',
            name: 'email',
            message: 'Enter your email:',
            default: '',
            validate: input => {
              const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
              return emailRegex.test(input.trim()) || 'Please enter a valid email address';
            }
          }
        ]);

        try {
          await gitService.configureGitUser('.', { name: name.trim(), email: email.trim() });
          UI.success('Git Configuration Updated', `Name: ${name}\nEmail: ${email}`);
        } catch (error) {
          UI.error('Failed to Update Git Config', error.message);
        }
        break;

      case 'reset':
        // Reset Git config to defaults
        const { confirm } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message: 'Are you sure you want to reset your Git configuration?',
            default: false
          }
        ]);

        if (confirm) {
          try {
            await gitService.configureGitUser('.', { name: 'GitBot', email: 'gitbot@example.com' });
            UI.success('Git Configuration Reset', 'Reset to default values');
          } catch (error) {
            UI.error('Failed to Reset Git Config', error.message);
          }
        } else {
          console.log('Operation cancelled.');
        }
        break;

      default:
        UI.warning('Unknown Config Command', `Unknown 'config git' subcommand: ${subCommand}`);
        UI.help([
          { name: 'show', description: 'Show current Git configuration', examples: ['config git show'] },
          { name: 'set', description: 'Set Git user name and email', examples: ['config git set'] },
          { name: 'reset', description: 'Reset Git configuration to defaults', examples: ['config git reset'] }
        ]);
    }
  } catch (error) {
    UI.error('Git Config Error', error.message);
    logger.error('Git config error:', { message: error.message, stack: error.stack, service: serviceName });
  }
}