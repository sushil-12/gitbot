import simpleGit from 'simple-git';
import logger from '../utils/logger.js';
import path from 'path';
import fs from 'fs/promises';
import { getToken } from '../utils/tokenManager.js'; // Added
import { getUserProfile } from './githubService.js'; // Added

const serviceName = 'GitService';

/**
 * Initializes a new Git repository in the specified directory.
 * @param {string} directoryPath - The path to the directory where the repository should be initialized.
 * @returns {Promise<string>} A message indicating success or failure.
 */
export async function initRepo(directoryPath = '.') {
  const git = simpleGit(directoryPath);
  try {
    await fs.mkdir(directoryPath, { recursive: true }); // Ensure directory exists
    await git.init();
    const message = `Initialized empty Git repository in ${path.resolve(directoryPath)}/.git/`;
    logger.info(message, { service: serviceName, path: directoryPath });
    return message;
  } catch (error) {
    logger.error(`Error initializing repository in ${directoryPath}:`, { message: error.message, stack: error.stack, service: serviceName });
    throw error;
  }
}

/**
 * Adds specified files to the staging area.
 * @param {string[] | string} files - A single file or an array of files to add. Defaults to all files '.'.
 * @param {string} directoryPath - The path to the Git repository.
 * @returns {Promise<void>}
 */
export async function addFiles(files = '.', directoryPath = '.') {
  const git = simpleGit(directoryPath);
  try {
    await git.add(files);
    logger.info(`Files staged: ${Array.isArray(files) ? files.join(', ') : files}`, { service: serviceName, path: directoryPath });
  } catch (error) {
    logger.error('Error adding files to staging:', { message: error.message, files, stack: error.stack, service: serviceName });
    throw error;
  }
}

/**
 * Commits staged changes.
 * @param {string} message - The commit message.
 * @param {string} directoryPath - The path to the Git repository.
 * @param {string} authorName - (Optional) Author name for the commit.
 * @param {string} authorEmail - (Optional) Author email for the commit.
 * @returns {Promise<import('simple-git').CommitResult>} Commit result.
 */
export async function commitChanges(message, directoryPath = '.', authorName, authorEmail) {
  if (!message || message.trim() === '') {
    const err = new Error('Commit message cannot be empty.');
    logger.error(err.message, { service: serviceName });
    throw err;
  }
  const git = simpleGit(directoryPath);
  const options = {};
  if (authorName && authorEmail) {
    options['--author'] = `"${authorName} <${authorEmail}>"`;
  } else if (process.env.GIT_USER_NAME && process.env.GIT_USER_EMAIL) {
    options['--author'] = `"${process.env.GIT_USER_NAME} <${process.env.GIT_USER_EMAIL}>"`;
  }

  try {
    const commitSummary = await git.commit(message, undefined, options);
    logger.info(`Changes committed: "${message}"`, { summary: commitSummary, service: serviceName, path: directoryPath });
    return commitSummary;
  } catch (error) {
    logger.error('Error committing changes:', { message: error.message, commitMessage: message, stack: error.stack, service: serviceName });
    throw error;
  }
}

/**
 * Pushes committed changes to a remote repository.
 * @param {string} remoteName - The name of the remote (e.g., 'origin').
 * @param {string} branchName - The name of the branch to push.
 * @param {string} directoryPath - The path to the Git repository.
 * @param {boolean} setUpstream - Whether to set the upstream branch (`-u` or `--set-upstream`).
 * @returns {Promise<void>}
 */
export async function pushChanges(remoteName = 'origin', branchName, directoryPath = '.', setUpstream = false) {
  const git = simpleGit(directoryPath);
  const currentBranch = branchName || (await git.branchLocal()).current;
  if (!currentBranch) {
    const err = new Error('Could not determine current branch to push.');
    logger.error(err.message, { service: serviceName });
    throw err;
  }
  try {
    const options = setUpstream ? ['--set-upstream'] : [];
    await git.push(remoteName, currentBranch, options);
    logger.info(`Pushed ${currentBranch} to ${remoteName}`, { service: serviceName, path: directoryPath });
  } catch (error) {
    logger.error(`Error pushing ${currentBranch} to ${remoteName}:`, { message: error.message, stack: error.stack, service: serviceName });
    throw error;
  }
}

/**
 * Pulls changes from a remote repository.
 * @param {string} remoteName - The name of the remote (e.g., 'origin').
 * @param {string} branchName - The name of the branch to pull.
 * @param {string} directoryPath - The path to the Git repository.
 * @param {object} options - Additional options for pull (e.g., { '--rebase': 'true' }).
 * @returns {Promise<import('simple-git').PullResult>} Pull result.
 */
export async function pullChanges(remoteName = 'origin', branchName, directoryPath = '.', options = {}) {
  const git = simpleGit(directoryPath);
  const currentBranch = branchName || (await git.branchLocal()).current;
   if (!currentBranch) {
    const err = new Error('Could not determine current branch to pull into.');
    logger.error(err.message, { service: serviceName });
    throw err;
  }
  try {
    const pullResult = await git.pull(remoteName, currentBranch, options);
    logger.info(`Pulled ${currentBranch} from ${remoteName}`, { summary: pullResult.summary, service: serviceName, path: directoryPath });
    return pullResult;
  } catch (error) {
    logger.error(`Error pulling ${currentBranch} from ${remoteName}:`, { message: error.message, stack: error.stack, service: serviceName });
    throw error;
  }
}

/**
 * Gets the current local branch.
 * @param {string} directoryPath - The path to the Git repository.
 * @returns {Promise<string>} The name of the current branch.
 */
export async function getCurrentBranch(directoryPath = '.') {
  const git = simpleGit(directoryPath);
  try {
    const branchSummary = await git.branchLocal();
    logger.debug(`Current branch: ${branchSummary.current}`, { service: serviceName, path: directoryPath });
    return branchSummary.current;
  } catch (error) {
    logger.error('Error getting current branch:', { message: error.message, stack: error.stack, service: serviceName });
    throw error;
  }
}

/**
 * Gets the status of the working directory.
 * @param {string} directoryPath - The path to the Git repository.
 * @returns {Promise<import('simple-git').StatusResult>} Git status.
 */
export async function getStatus(directoryPath = '.') {
  const git = simpleGit(directoryPath);
  try {
    const status = await git.status();
    logger.debug('Fetched Git status.', { status, service: serviceName, path: directoryPath });
    return status;
  } catch (error) {
    logger.error('Error getting Git status:', { message: error.message, stack: error.stack, service: serviceName });
    throw error;
  }
}

/**
 * Lists remotes.
 * @param {string} directoryPath - The path to the Git repository.
 * @returns {Promise<import('simple-git').RemoteWithoutRefs[]>} Array of remotes.
 */
export async function getRemotes(directoryPath = '.') {
    const git = simpleGit(directoryPath);
    try {
        const remotes = await git.getRemotes(true); // true for verbose output with URLs
        logger.debug('Fetched remotes.', { remotes, service: serviceName, path: directoryPath });
        return remotes;
    } catch (error) {
        logger.error('Error getting remotes:', { message: error.message, stack: error.stack, service: serviceName });
        throw error;
    }
}

/**
 * Adds a new remote.
 * @param {string} remoteName - The name for the new remote.
 * @param {string} remoteUrl - The URL for the new remote.
 * @param {string} directoryPath - The path to the Git repository.
 * @returns {Promise<string>} The name of the added remote.
 */
export async function addRemote(remoteName, remoteUrl, directoryPath = '.') {
    const git = simpleGit(directoryPath);
    let finalRemoteUrl = remoteUrl;

    // Check if it's a GitHub URL and we're setting 'origin'
    if (remoteName === 'origin' && remoteUrl.includes('github.com')) {
        logger.info(`Attempting to use token-authenticated URL for GitHub remote '${remoteName}'.`, { service: serviceName, path: directoryPath });
        try {
            logger.info('Fetching GitHub access token via TokenManager...', { service: serviceName, path: directoryPath });
            const accessToken = await getToken('github_access_token');

            logger.info('Fetching GitHub user profile via GitHubService...', { service: serviceName, path: directoryPath });
            const userProfile = await getUserProfile(); // This might throw if token is invalid or not found by getHeaders

            if (accessToken && userProfile && userProfile.login) {
                const username = userProfile.login;
                logger.info(`Successfully retrieved token and user profile ('${username}').`, { service: serviceName, path: directoryPath });
                // Attempt to parse the original URL to get owner/repo
                // Example: https://github.com/owner/repo.git or git@github.com:owner/repo.git
                const urlParts = remoteUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)(\.git)?$/);
                if (urlParts && urlParts.length >= 3) {
                    const owner = urlParts[1];
                    const repo = urlParts[2];
                    finalRemoteUrl = `https://${username}:${accessToken}@github.com/${owner}/${repo}.git`;
                    logger.info(`Constructed token-authenticated URL for remote ${remoteName}: ${finalRemoteUrl.replace(accessToken, '****')}`, { service: serviceName, path: directoryPath });
                } else {
                    logger.warn(`Could not parse owner/repo from GitHub URL: ${remoteUrl}. Using original URL.`, { service: serviceName, path: directoryPath });
                }
            } else {
                let reason = [];
                if (!accessToken) reason.push("GitHub access token not found");
                if (!userProfile || !userProfile.login) reason.push("GitHub user profile or login not found");
                logger.warn(`Failed to obtain necessary details for token-authenticated URL: ${reason.join(', ')}. Using original remote URL.`, { service: serviceName, path: directoryPath });
            }
        } catch (authError) {
            logger.warn(`Error during token/profile retrieval for authenticated URL: ${authError.message}. Using original remote URL.`, { service: serviceName, path: directoryPath, error: authError.message });
        }
    }

    try {
        await git.addRemote(remoteName, finalRemoteUrl);
        logger.info(`Added remote: ${remoteName} -> ${finalRemoteUrl.includes('@') ? finalRemoteUrl.substring(0, finalRemoteUrl.indexOf('@') + 1) + 'github.com/...' : finalRemoteUrl}`, { service: serviceName, path: directoryPath });
        return remoteName;
    } catch (error) {
        logger.error(`Error adding remote ${remoteName}:`, { message: error.message, stack: error.stack, service: serviceName });
        throw error;
    }
}

/**
 * Creates a new branch and checks it out.
 * @param {string} branchName - The name of the new branch.
 * @param {string} directoryPath - The path to the Git repository.
 * @param {string} startPoint - (Optional) The commit or branch to start the new branch from.
 * @returns {Promise<void>}
 */
export async function createAndCheckoutBranch(branchName, directoryPath = '.', startPoint) {
    const git = simpleGit(directoryPath);
    try {
        const options = startPoint ? [startPoint] : [];
        await git.checkoutLocalBranch(branchName, ...options);
        logger.info(`Created and checked out new branch: ${branchName}`, { startPoint, service: serviceName, path: directoryPath });
    } catch (error) {
        logger.error(`Error creating/checking out branch ${branchName}:`, { message: error.message, stack: error.stack, service: serviceName });
        throw error;
    }
}

/**
 * Checks out an existing branch.
 * @param {string} branchName - The name of the branch to checkout.
 * @param {string} directoryPath - The path to the Git repository.
 * @returns {Promise<void>}
 */
export async function checkoutBranch(branchName, directoryPath = '.') {
    const git = simpleGit(directoryPath);
    try {
        await git.checkout(branchName);
        logger.info(`Checked out branch: ${branchName}`, { service: serviceName, path: directoryPath });
    } catch (error) {
        logger.error(`Error checking out branch ${branchName}:`, { message: error.message, stack: error.stack, service: serviceName });
        throw error;
    }
}

/**
 * Merges a specified branch into the current branch.
 * @param {string} branchName - The name of the branch to merge.
 * @param {string} directoryPath - The path to the Git repository.
 * @param {string[]} options - Array of merge options (e.g., ['--no-ff']).
 * @returns {Promise<string>} Merge summary or error message.
 */
export async function mergeBranch(branchName, directoryPath = '.', options = []) {
    const git = simpleGit(directoryPath);
    try {
        const mergeSummary = await git.mergeFromTo(branchName, undefined, options); // merge into current branch
        logger.info(`Merged branch ${branchName} into current branch.`, { summary: mergeSummary, service: serviceName, path: directoryPath });
        return mergeSummary; // This might be a string or an object depending on simple-git version and outcome
    } catch (error) {
        // simple-git throws an error on merge conflicts, error.git contains conflict details
        logger.error(`Error merging branch ${branchName}:`, {
            message: error.message,
            gitError: error.git, // Contains conflict details if any
            stack: error.stack,
            service: serviceName
        });
        throw error; // Re-throw to be handled by caller, potentially with conflict info
    }
}

/**
 * Rebases the current branch onto a specified branch.
 * @param {string} baseBranch - The branch to rebase onto.
 * @param {string} directoryPath - The path to the Git repository.
 * @param {string[]} options - Array of rebase options (e.g., ['--interactive']).
 * @returns {Promise<string>} Rebase result message.
 */
export async function rebaseBranch(baseBranch, directoryPath = '.', options = []) {
    const git = simpleGit(directoryPath);
    try {
        const result = await git.rebase([baseBranch, ...options]);
        logger.info(`Successfully rebased current branch onto ${baseBranch}.`, { result, service: serviceName, path: directoryPath });
        return result; // This is typically a string output from git rebase
    } catch (error) {
        logger.error(`Error rebasing onto ${baseBranch}:`, {
            message: error.message,
            gitError: error.git, // Contains conflict details if any
            stack: error.stack,
            service: serviceName
        });
        throw error;
    }
}

// TODO: Add more functions as needed:
// - Fetch
// - Clone
// - Diff
// - Log (commit history)
// - Handling merge conflicts (basic AI suggestion if possible) - this will be complex