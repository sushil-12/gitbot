import logger from '../src/utils/logger.js';
import * as prompter from '../src/utils/prompter.js';
import fs from 'fs/promises';
import path from 'path';
import * as githubService from '../src/services/githubService.js';
import * as gitService from '../src/services/gitService.js';
import * as ollamaService from '../ai/ollamaService.js';
import { getToken, clearAllTokens } from '../src/utils/tokenManager.js'; // Added clearAllTokens
import inquirer from 'inquirer'; // Ensure inquirer is imported

const serviceName = 'CommandHandler';

async function ensureAuthenticated() {
  const token = await getToken('github_access_token');
  if (!token) {
    logger.warn('User is not authenticated. Please authenticate first.', { service: serviceName });
    const port = process.env.PORT || 3000;
    const authInitiateUrl = `http://localhost:${port}/auth/github`;
    console.log('\nAuthentication required.');
    console.log(`Please open your browser and navigate to: ${authInitiateUrl}`);
    console.log(`After authorizing, the application will receive the token.`);
    console.log('Then, please re-run your command.');
    return null; // Indicate authentication is required
  }
  return token; // Return the token if found
}

export async function handleRepoCommand(args) {
  const token = await ensureAuthenticated();
  if (!token) {
    // ensureAuthenticated already printed the message
    process.exitCode = 1; // Indicate a non-zero exit code for scripting if needed
    return;
  }
  const [subCommand, ...options] = args;
  logger.info(`Handling 'repo' command: ${subCommand}`, { options, service: serviceName });

  switch (subCommand) {
    case 'create': {
      const repoName = options[0];
      if (!repoName) {
        logger.error("Repository name is required for 'repo create'.", { service: serviceName });
        console.error("Error: Repository name is required. Usage: repo create <repo-name> [--private] [--description \"Your description\"]");
        return;
      }
      const repoOptions = {
        description: '',
        private: false,
        auto_init: true, // Good default for new repos
      };
      for (let i = 1; i < options.length; i++) {
        if (options[i] === '--private') {
          repoOptions.private = true;
        } else if (options[i] === '--description' && options[i + 1]) {
          repoOptions.description = options[i + 1];
          i++; // Skip next value as it's consumed
        } else if (options[i] === '--no-init') {
            repoOptions.auto_init = false;
        }
      }
      try {
        const repo = await githubService.createRepository(repoName, repoOptions);
        console.log(`Successfully created repository: ${repo.html_url}`);
        logger.info(`Repository created: ${repo.full_name}`, { url: repo.html_url, service: serviceName });
      } catch (error) {
        console.error(`Error creating repository '${repoName}': ${error.message}`);
        logger.error(`Failed to create repository '${repoName}':`, { message: error.message, stack: error.stack, service: serviceName });
      }
      break;
    }
    case 'list': {
      // Example: repo list --type=owner --sort=updated --direction=desc
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
        const repos = await githubService.listUserRepositories(listOptions);
        if (repos.length === 0) {
          console.log("No repositories found matching your criteria.");
        } else {
          console.log("\nYour GitHub Repositories:");
          repos.forEach(repo => {
            console.log(`- ${repo.full_name} (${repo.private ? 'Private' : 'Public'}) - ${repo.html_url}`);
            if (repo.description) console.log(`  Description: ${repo.description}`);
            console.log(`  Last updated: ${new Date(repo.updated_at).toLocaleDateString()}`);
          });
        }
      } catch (error) {
        console.error(`Error listing repositories: ${error.message}`);
        logger.error('Failed to list repositories:', { message: error.message, stack: error.stack, service: serviceName });
      }
      break;
    }
    default:
      logger.warn(`Unknown 'repo' subcommand: ${subCommand}`, { service: serviceName });
      console.log(`Unknown 'repo' subcommand: ${subCommand}. Supported: create, list.`);
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


export async function handleNlpCommand(query) {
  logger.info(`Handling NLP query: "${query}"`, { service: serviceName });
  if (!query || query.trim() === '') {
    console.error("NLP query cannot be empty.");
    return;
  }

  const ollamaReady = await ollamaService.checkOllamaStatus();
  if (!ollamaReady) {
      console.error("Ollama server or model is not available. Please check your Ollama setup.");
      logger.error("Ollama not ready, aborting NLP command.", { service: serviceName });
      return;
  }

  try {
    const parsed = await ollamaService.parseIntent(query);
    if (!parsed || parsed.intent === 'unknown') {
      console.log("Sorry, I couldn't understand that command. Could you try rephrasing?");
      logger.warn('NLP intent parsing failed or returned unknown.', { query, parsedResult: parsed, service: serviceName });
      if (parsed && parsed.entities && parsed.entities.error) {
          console.error(`Details: ${parsed.entities.error}`);
          if(parsed.entities.raw_response) console.log(`LLM Raw: ${parsed.entities.raw_response}`);
      }
      return;
    }

    logger.info('NLP intent parsed successfully:', { intent: parsed.intent, entities: parsed.entities, service: serviceName });
    console.log(`Understood intent: ${parsed.intent}`);
    if (parsed.entities && Object.keys(parsed.entities).length > 0) {
        console.log('With entities:', JSON.stringify(parsed.entities, null, 2));
    }


    // Now, map the intent and entities to actual service calls
    switch (parsed.intent) {
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
        const files = parsed.entities?.files === 'all' || !parsed.entities?.files ? '.' : parsed.entities.files;
        await handleGitCommand(['add', files], '.');
        break;
      case 'git_commit':
        const msg = parsed.entities?.commit_message;
        if (!msg) {
            console.error("Commit message is missing from the command.");
            return;
        }
        await handleGitCommand(['commit', msg], '.');
        break;
      case 'push_changes':
        const tokenForPush = await ensureAuthenticated();
        if (!tokenForPush) { process.exitCode = 1; return; }

        let isGitRepo = true;
        try {
            await gitService.getStatus('.'); // Quick check if it's a repo
        } catch (error) {
            if (error.message.includes("not a git repository")) {
                isGitRepo = false;
            } else {
                logger.error("Error checking Git status for push:", { message: error.message, service: serviceName });
                console.error(`Error checking Git status: ${error.message}`);
                process.exitCode = 1; return;
            }
        }

        if (!isGitRepo) {
            logger.warn("Attempted push in a non-Git repository.", { path: '.', service: serviceName });
            const initRepo = await prompter.askYesNo("This directory doesn't seem to be a Git repository. Shall I initialize one now?", false);
            if (initRepo) {
                try {
                    await gitService.initRepo('.');
                    console.log("Successfully initialized a new Git repository here.");
                    isGitRepo = true; // Now it is a repo
                } catch (initError) {
                    logger.error("Failed to initialize Git repository:", { message: initError.message, service: serviceName });
                    console.error(`Failed to initialize repository: ${initError.message}`);
                    process.exitCode = 1; return;
                }
            } else {
                console.log("Okay, a Git repository is needed to push changes. Please initialize one first.");
                process.exitCode = 1; return;
            }
        }

        // Re-fetch branch info if repo was just initialized or to ensure it's current
        let branchForPush;
        try {
            branchForPush = parsed.entities?.branch || await gitService.getCurrentBranch('.');
        } catch (branchError) {
             // This might happen if init created a repo but HEAD is unborn (no commits yet)
            logger.warn("Could not determine current branch (maybe no commits yet?). Defaulting to 'main'.", { message: branchError.message, service: serviceName });
            branchForPush = parsed.entities?.branch || 'main'; // Default to main if detection fails post-init
        }


        const remoteForPush = parsed.entities?.remote || 'origin';
        let targetRemoteExists = false;
        try {
            const remotes = await gitService.getRemotes('.');
            targetRemoteExists = remotes.some(r => r.name === remoteForPush);
        } catch (error) {
            // Should not happen if isGitRepo check passed, but as a safeguard
            logger.error("Error checking remotes (unexpected):", { message: error.message, service: serviceName });
            console.error(`Unexpected error checking repository remotes: ${error.message}`);
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
                    let repoSuccessfullySetup = false;
                    while (!repoSuccessfullySetup) {
                        console.log("[DEBUG] About to ask for new repo details (name and privacy)...");
                        let repoDetails;
                        try {
                            repoDetails = await inquirer.prompt([
                                {
                                    type: 'input',
                                    name: 'newRepoName',
                                    message: 'Enter a name for the new GitHub repository:',
                                    default: path.basename(process.cwd()),
                                    validate: value => value.trim() !== '' || 'Repository name cannot be empty.',
                                },
                                {
                                    type: 'confirm',
                                    name: 'isPrivate',
                                    message: (answers) => `Make "${answers.newRepoName}" private?`,
                                    default: false,
                                }
                            ]);
                            console.log(`[DEBUG] Received repoDetails:`, repoDetails);
                        } catch (promptError) {
                            console.error("[DEBUG] Error during combined inquirer.prompt for repo details:", promptError);
                            logger.error("Error during repo detail prompts:", { message: promptError.message, stack: promptError.stack, service: serviceName });
                            process.exitCode = 1; return; // Exit if prompting itself fails
                        }

                        const { newRepoName, isPrivate } = repoDetails;

                        if (!newRepoName) {
                            console.log("Repository name was not provided. Aborting remote setup.");
                            process.exitCode = 1; return;
                        }

                        try {
                            console.log(`[DEBUG] Proceeding to create GitHub repository "${newRepoName}", private: ${isPrivate}...`);
                            console.log(`Creating GitHub repository "${newRepoName}"...`);
                            const newRepo = await githubService.createRepository(newRepoName, { private: isPrivate, description: `Repository for ${newRepoName}` });
                            console.log(`Successfully created GitHub repository: ${newRepo.html_url}`);
                            await gitService.addRemote(remoteForPush, newRepo.clone_url, '.');
                            console.log(`Successfully added remote "${remoteForPush}" pointing to ${newRepo.html_url}`);
                            targetRemoteExists = true;
                            repoSuccessfullySetup = true; // Break the loop
                        } catch (createError) {
                            logger.error("Failed to create GitHub repository or add remote:", { message: createError.message, data: createError.response?.data, service: serviceName });
                            if (createError.response && createError.response.status === 422 && createError.response.data && createError.response.data.errors) {
                                const nameError = createError.response.data.errors.find(e => e.field === 'name' && e.message.includes('already exists'));
                                if (nameError) {
                                    console.log(`A repository named "${newRepoName}" already exists on your GitHub account.`);
                                    const userChoice = await prompter.askForChoice(
                                        'What would you like to do?',
                                        [
                                            { name: 'Try a different name for the new repository', value: 'rename' },
                                            { name: `Attempt to link to existing repository "sushil-gitbot/${newRepoName}" (assuming it's yours)`, value: 'link_existing' }, // Placeholder for owner
                                            { name: 'Cancel setup', value: 'cancel' }
                                        ]
                                    );
                                    if (userChoice === 'rename') {
                                        continue; // Loop back to ask for a new name
                                    } else if (userChoice === 'link_existing') {
                                        // Attempt to link - this part would need the owner, or assume current user
                                        // For simplicity now, we'll just add the remote. A robust version would fetch repo details.
                                        // This assumes the user confirms it's their repo and provides the correct URL if needed.
                                        // We need the user's GitHub login to form the URL correctly if just given repoName.
                                        // Let's fetch user profile once if we go this route.
                                        // For now, let's prompt for the full URL of the existing one.
                                        console.log(`To link to the existing "${newRepoName}", I'll need its full URL.`);
                                        const existingRepoUrl = await prompter.askForInput(`Enter the HTTPS or SSH URL for "sushil-gitbot/${newRepoName}":`);
                                        if (!existingRepoUrl || existingRepoUrl.trim() === '') {
                                            console.log("URL not provided. Cancelling setup.");
                                            process.exitCode = 1; return;
                                        }
                                        try {
                                            await gitService.addRemote(remoteForPush, existingRepoUrl, '.');
                                            console.log(`Successfully added remote "${remoteForPush}" pointing to ${existingRepoUrl}`);
                                            targetRemoteExists = true;
                                            repoSuccessfullySetup = true; // Break the loop
                                        } catch (linkError) {
                                            logger.error("Failed to add remote to existing repo:", { message: linkError.message, service: serviceName });
                                            console.error(`Error adding remote: ${linkError.message}. Please try again or cancel.`);
                                            // Optionally loop back or offer cancel
                                        }
                                    } else { // Cancel
                                        console.log("Repository setup cancelled.");
                                        process.exitCode = 1; return;
                                    }
                                } else {
                                    // Other 422 error or different validation error
                                    console.error(`Error creating GitHub repository: ${createError.message} (Details: ${JSON.stringify(createError.response.data.errors)})`);
                                    process.exitCode = 1; return;
                                }
                            } else {
                                // Non-422 error or error without specific GitHub error structure
                                console.error(`Error creating GitHub repository or adding remote: ${createError.message}`);
                                process.exitCode = 1; return;
                            }
                        } // end catch createError
                    } // end while !repoSuccessfullySetup
                } else if (remoteAction === 'link') {
                    console.log("Fetching your GitHub repositories...");
                    let existingRepoUrl = '';
                    try {
                        const userRepos = await githubService.listUserRepositories({ type: 'owner', per_page: 100, sort: 'updated' });
                        if (userRepos && userRepos.length > 0) {
                            const choices = userRepos.map(repo => ({ name: `${repo.full_name} (${repo.private ? 'Private' : 'Public'}) - Updated: ${new Date(repo.updated_at).toLocaleDateString()}`, value: repo.clone_url }));
                            choices.push({ name: 'Enter URL manually', value: 'manual_url' });
                            
                            const chosenUrl = await prompter.askForChoice('Select an existing repository to link, or choose to enter URL manually:', choices);

                            if (chosenUrl === 'manual_url') {
                                existingRepoUrl = await prompter.askForInput('Enter the HTTPS or SSH URL of your existing GitHub repository:');
                            } else if (chosenUrl) {
                                existingRepoUrl = chosenUrl;
                            } else {
                                console.log("No repository selected. Aborting remote setup.");
                                process.exitCode = 1; return;
                            }
                        } else {
                            console.log("Could not fetch your repositories, or you have no repositories. Please enter the URL manually.");
                            existingRepoUrl = await prompter.askForInput('Enter the HTTPS or SSH URL of your existing GitHub repository:');
                        }
                    } catch (fetchError) {
                        logger.error("Failed to fetch user repositories for linking:", { message: fetchError.message, service: serviceName });
                        console.log("Could not fetch your repositories due to an error. Please enter the URL manually.");
                        existingRepoUrl = await prompter.askForInput('Enter the HTTPS or SSH URL of your existing GitHub repository:');
                    }
                    
                    if (!existingRepoUrl || existingRepoUrl.trim() === '') {
                        console.log("Repository URL cannot be empty. Aborting remote setup.");
                        process.exitCode = 1; return;
                    }
                    try {
                        await gitService.addRemote(remoteForPush, existingRepoUrl, '.');
                        console.log(`Successfully added remote "${remoteForPush}" pointing to ${existingRepoUrl}`);
                        targetRemoteExists = true;
                    } catch (linkError) {
                        logger.error("Failed to add remote:", { message: linkError.message, service: serviceName });
                        console.error(`Error adding remote: ${linkError.message}`);
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

        let commitMade = false;
        const commitMsgForPush = parsed.entities?.commit_message;
        if (commitMsgForPush && commitMsgForPush.trim() !== "") {
            const confirmCommit = await prompter.askYesNo(`I understood your commit message as "${commitMsgForPush}". Shall I add all current changes and commit with this message?`, true);
            if (confirmCommit) {
                try {
                    console.log("Staging all changes...");
                    await gitService.addFiles('.', '.');
                    console.log(`Committing with message: "${commitMsgForPush}"`);
                    await gitService.commitChanges(commitMsgForPush, '.');
                    commitMade = true;
                } catch (commitError) {
                    logger.warn("Error during explicit pre-push commit:", { message: commitError.message, service: serviceName });
                    console.warn(`Note: Could not commit with message "${commitMsgForPush}". Error: ${commitError.message}`);
                    const continuePush = await prompter.askYesNo("Do you want to try pushing existing commits anyway?", false);
                    if (!continuePush) { process.exitCode = 1; return; }
                }
            } else {
                console.log("Okay, I will not commit the changes with the provided message.");
            }
        } else {
            const status = await gitService.getStatus('.');
            if (status.files.length > 0) {
                const confirmAutoCommit = await prompter.askYesNo("You have uncommitted changes. Would you like to add and commit them now?", true);
                if (confirmAutoCommit) {
                    let newCommitMessageDetails;
                    try {
                        console.log("[DEBUG] About to ask for commit message (direct inquirer)...");
                        newCommitMessageDetails = await inquirer.prompt([
                            {
                                type: 'input',
                                name: 'commitMsg',
                                message: 'Please enter a commit message:',
                                default: "feat: auto-commit by GitBot",
                                validate: value => value.trim() !== '' || 'Commit message cannot be empty.',
                            }
                        ]);
                        console.log("[DEBUG] Received commitMsgDetails:", newCommitMessageDetails);
                    } catch (promptError) {
                        console.error("[DEBUG] Error during direct inquirer prompt for commit message:", promptError);
                        logger.error("Error during commit message prompt:", { message: promptError.message, stack: promptError.stack, service: serviceName });
                        process.exitCode = 1; return;
                    }
                    let newCommitMessage = newCommitMessageDetails.commitMsg;
                    
                    // if (!newCommitMessage || newCommitMessage.trim() === "") newCommitMessage = "feat: auto-commit by GitBot"; // Default handled by inquirer prompt

                    try {
                        console.log("Staging all changes...");
                        await gitService.addFiles('.', '.');
                        console.log(`Committing with message: "${newCommitMessage}"`);
                        await gitService.commitChanges(newCommitMessage, '.');
                        commitMade = true;
                    } catch (commitError) {
                        logger.error("Error during auto-commit:", { message: commitError.message, service: serviceName });
                        console.error(`Failed to commit changes: ${commitError.message}`);
                        const continuePush = await prompter.askYesNo("Could not commit changes. Do you want to try pushing existing commits anyway?", false);
                        if (!continuePush) { process.exitCode = 1; return; }
                    }
                } else {
                    const pushExisting = await prompter.askYesNo("Okay, I will not commit the current changes. Push existing commits anyway?", true);
                    if (!pushExisting) {
                        console.log("Push cancelled.");
                        process.exitCode = 1; return;
                    }
                }
            } else if (!isGitRepo && !commitMade) { // If repo was just initialized and no commits made
                 console.log("This is a new repository with no commits yet. Please make an initial commit before pushing.");
                 // Optionally, offer to make an initial commit here.
                 const makeInitialCommit = await prompter.askYesNo("Would you like to make an initial commit (e.g., with a README)?", true);
                 if(makeInitialCommit) {
                    // Create a dummy README for initial commit
                    try {
                        await fs.writeFile('README.md', '# New Project\n\nInitialized by GitBot.\n', 'utf8');
                        await gitService.addFiles('README.md', '.');
                        await gitService.commitChanges('feat: initial commit with README', '.');
                        console.log("Initial commit with README created.");
                    } catch (fsError) {
                        logger.error("Failed to create README for initial commit", {message: fsError.message, service: serviceName});
                        console.error("Failed to create README for initial commit. Please commit manually.");
                        process.exitCode = 1; return;
                    }
                 } else {
                    console.log("Please make an initial commit and then try pushing again.");
                    process.exitCode = 1; return;
                 }
            }
        }

        // Final check for branch, especially if it was 'main' by default and repo was just init'd
        // simple-git might create 'master' on init depending on global git config.
        // For a truly robust solution, after init, check actual initial branch name.
        // For now, we proceed with branchForPush.

        try {
            console.log(`Pushing branch '${branchForPush}' to remote '${remoteForPush}'...`);
            await gitService.pushChanges(remoteForPush, branchForPush, '.', true); // true for --set-upstream
            console.log("Push successful.");
        } catch (pushError) {
            logger.error("Error during push operation:", { message: pushError.message, service: serviceName });
            console.error(`Error pushing to ${remoteForPush}/${branchForPush}: ${pushError.message}`);

            if (pushError.message && (pushError.message.includes('403') || pushError.message.toLowerCase().includes('permission denied'))) {
                console.log("\nA 403 Forbidden error occurred. This usually means the GitHub account used for this push does not have write permission to the target repository.");
                try {
                    const userProfile = await githubService.getUserProfile();
                    if (userProfile && userProfile.login) {
                        console.log(`GitBot is currently authenticated as GitHub user: "${userProfile.login}".`);
                        console.log(`Please ensure user "${userProfile.login}" has 'Write' or 'Admin' permissions on the repository.`);
                    } else {
                        console.log("Could not verify the currently authenticated GitHub user. The stored token might be invalid or lack permissions.");
                    }
                } catch (profileError) {
                    logger.warn("Failed to fetch user profile during 403 error handling.", { message: profileError.message, service: serviceName });
                    console.log("Could not verify the currently authenticated GitHub user due to an additional error.");
                }
                
                console.log("\nOther things to check for permission issues:");
                console.log("  - Go to the repository settings on GitHub (usually 'Settings' > 'Collaborators and teams') to verify permissions.");
                console.log("  - If you intended to push as a different GitHub user, your system's Git might be using different credentials.");
                console.log("    Consider checking your OS's keychain or Git credential manager.");
                console.log("  - You can try re-authenticating GitBot by running: `gitbot auth logout` and then re-running the command that requires auth.");
                console.log("  - Using SSH for the remote URL can sometimes bypass HTTPS credential issues if your SSH key is set up correctly with GitHub.");
            } else {
                // Generic push error advice
                console.log("\nCommon reasons for push failure:");
                console.log("  - Remote repository has changes you don't have locally. Try pulling first:");
                console.log(`    \`gitbot nlp "pull changes from ${remoteForPush} ${branchForPush}"\``);
                console.log("  - The branch name might be incorrect or doesn't exist on the remote (especially for new repos).");
                console.log("  - If this is the first push to a new repository, ensure the remote branch is set up or use --set-upstream (which is default here).");
            }
            // No explicit exit here, let the command complete.
        }
        break;
      // TODO: Implement handlers for other intents (pull_changes, create_branch, create_pr, git_status etc.)
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

    const ollamaReady = await ollamaService.checkOllamaStatus();
    if (!ollamaReady) {
        console.error("Ollama server or model is not available. Please check your Ollama setup.");
        return;
    }

    try {
        const gitignoreContent = await ollamaService.generateGitignore(projectDescription);
        if (gitignoreContent) {
            console.log("\n--- Suggested .gitignore content ---\n");
            console.log(gitignoreContent);
            console.log("\n--- End of .gitignore content ---");
            // TODO: Add option to write this to .gitignore file
        } else {
            console.log("Could not generate .gitignore content. The LLM might have returned an empty response.");
        }
    } catch (error) {
        console.error(`Error generating .gitignore: ${error.message}`);
    }
}

export async function handleGenerateCommitMessage(directoryPath = '.') {
    logger.info(`Handling commit message generation for path: "${directoryPath}"`, { service: serviceName });

    const ollamaReady = await ollamaService.checkOllamaStatus();
    if (!ollamaReady) {
        console.error("Ollama server or model is not available. Please check your Ollama setup.");
        return;
    }

    try {
        const status = await gitService.getStatus(directoryPath);
        if (status.files.length === 0) {
            console.log("No changes to commit. Working tree clean.");
            return;
        }

        // For simplicity, we'll use `git diff HEAD` which shows staged and unstaged changes.
        // A more precise approach might be `git diff --staged` for staged changes only.
        const git = simpleGit(directoryPath);
        const diffOutput = await git.diff(['HEAD']);


        if (!diffOutput || diffOutput.trim() === '') {
            console.log("No diff output available. Ensure changes are staged or present in the working directory.");
            return;
        }

        const commitMessage = await ollamaService.generateCommitMessage(diffOutput);
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