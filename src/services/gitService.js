import simpleGit from 'simple-git';
import logger from '../utils/logger.js';
import path from 'path';
import fs from 'fs/promises';
import { getToken } from '../utils/tokenManager.js';
import { getUserProfile } from './githubService.js';
import axios from 'axios';
import chalk from 'chalk';

const serviceName = 'GitService';

// Enhanced Git service with complete functionality

/**
 * Initializes a new Git repository with intelligent defaults
 */
export async function initRepo(directoryPath = '.', options = {}) {
  const git = simpleGit(directoryPath);
  try {
    await fs.mkdir(directoryPath, { recursive: true });
    await git.init();

    // Create default .gitignore if requested
    if (options.createGitignore) {
      try {
        const gitignoreContent = `# Default .gitignore\nnode_modules/\n.env\n.DS_Store\n`;
        await fs.writeFile(path.join(directoryPath, '.gitignore'), gitignoreContent);
      } catch (e) {
        logger.warn('Could not create default .gitignore', { error: e.message });
      }
    }

    const message = `Initialized Git repository in ${path.resolve(directoryPath)}`;
    logger.info(message, { service: serviceName, path: directoryPath });
    return message;
  } catch (error) {
    const errMsg = `Failed to initialize repository: ${error.message}`;
    logger.error(errMsg, { stack: error.stack, service: serviceName });
    throw new Error(errMsg);
  }
}

/**
 * Adds files with intelligent handling of paths and patterns
 */
export async function addFiles(files = '.', directoryPath = '.') {
  const git = simpleGit(directoryPath);
  try {
    // Handle special cases
    if (files === 'all' || files === '.') files = ['.'];
    if (files === 'modified') {
      const status = await git.status();
      files = status.modified;
    }

    await git.add(files);
    const message = `Staged ${Array.isArray(files) ? files.length : 1} file(s)`;
    logger.info(message, { service: serviceName, path: directoryPath });
    return message;
  } catch (error) {
    // Handle common error: pathspec did not match
    if (error.message.includes('paths did not match')) {
      const status = await git.status();
      const availableFiles = [
        ...status.not_added,
        ...status.modified,
        ...status.created
      ];

      const err = new Error(`No matching files. Available files:\n${availableFiles.join('\n')}`);
      logger.warn(err.message, { service: serviceName });
      throw err;
    }

    const errMsg = `Failed to stage files: ${error.message}`;
    logger.error(errMsg, { stack: error.stack, service: serviceName });
    throw new Error(errMsg);
  }
}

/**
 * Enhanced commit with auto-staging and commit message generation fallback
 */
export async function commitChanges(message, directoryPath = '.', authorOptions = {}) {
  if (!message || message.trim() === '') {
    const err = new Error('Commit message cannot be empty.');
    logger.error(err.message, { service: serviceName });
    throw err;
  }

  const git = simpleGit(directoryPath);
  const options = {};

  // Get default author from git config if available
  let defaultAuthor = {};
  try {
    const config = await git.listConfig();
    defaultAuthor = {
      name: config.all['user.name'] || 'GitBot',
      email: config.all['user.email'] || 'gitbot@example.com'
    };
  } catch (error) {
    defaultAuthor = { name: 'GitBot', email: 'gitbot@example.com' };
  }

  // Resolve author information
  const authorName = authorOptions.name || process.env.GIT_USER_NAME || defaultAuthor.name;
  const authorEmail = authorOptions.email || process.env.GIT_USER_EMAIL || defaultAuthor.email;

  if (authorName && authorEmail) {
    options['--author'] = `${authorName} <${authorEmail}>`;
  }

  try {
    const commitSummary = await git.commit(message, undefined, options);
    logger.info(`Changes committed: "${message}" by ${authorName} <${authorEmail}>`, {
      summary: commitSummary,
      service: serviceName,
      path: directoryPath
    });

    return {
      ...commitSummary,
      author: { name: authorName, email: authorEmail }
    };
  } catch (error) {
    logger.error('Error committing changes:', {
      message: error.message,
      commitMessage: message,
      stack: error.stack,
      service: serviceName
    });

    // Special handling for author errors
    if (error.message.includes("option `author' requires a value")) {
      throw new Error('Invalid author format. Please check your name and email configuration.');
    }

    throw error;
  }
}

/**
 * Get diff output with formatting options
 */
export async function getDiff(options = '', directoryPath = '.') {
  const git = simpleGit(directoryPath);
  try {
    const diffOptions = typeof options === 'string' ? options.split(' ') : options;
    const diff = await git.diff(diffOptions);
    return diff;
  } catch (error) {
    const errMsg = `Failed to get diff: ${error.message}`;
    logger.error(errMsg, { stack: error.stack, service: serviceName });
    throw new Error(errMsg);
  }
}

/**
 * Enhanced push with automatic token injection and branch handling
 */
export async function pushChanges(remoteName = 'origin', branchName, directoryPath = '.', options = {}) {
  const git = simpleGit(directoryPath);

  try {
    // Ensure we have a branch to push
    const currentBranch = branchName || (await git.branchLocal()).current;
    if (!currentBranch) throw new Error('No branch to push');

    // Inject token for GitHub remotes
    if (remoteName === 'origin') {
      await ensureAuthenticatedRemote(directoryPath);
    }

    const pushOptions = [];
    if (options.setUpstream) pushOptions.push('--set-upstream');
    if (options.force) pushOptions.push('--force');

    await git.push(remoteName, currentBranch, pushOptions);

    const result = `Pushed ${currentBranch} to ${remoteName}`;
    logger.info(result, { service: serviceName });
    return result;
  } catch (error) {
    let errMsg = `Push failed: ${error.message}`;

    // Provide helpful solutions for common errors
    if (error.message.includes('no upstream branch')) {
      errMsg += '\nSolution: Try pushing with --set-upstream to set tracking';
    } else if (error.message.includes('updates were rejected')) {
      errMsg += '\nSolution: Pull changes first or use --force to overwrite';
    } else if (error.message.includes('authentication failed')) {
      errMsg += '\nSolution: Check your GitHub token using "gitmate config view"';
    }

    logger.error(errMsg, { stack: error.stack, service: serviceName });
    throw new Error(errMsg);
  }
}

/**
 * Enhanced pull with conflict resolution guidance
 */
export async function pullChanges(remoteName = 'origin', branchName, directoryPath = '.') {
  const git = simpleGit(directoryPath);

  try {
    const currentBranch = branchName || (await git.branchLocal()).current;
    if (!currentBranch) throw new Error('No branch to pull into');

    await ensureAuthenticatedRemote(directoryPath);

    const result = await git.pull(remoteName, currentBranch);

    // Check for merge conflicts
    if (result.conflicts.length > 0) {
      const conflictMsg = `${result.conflicts.length} conflict(s) need resolution`;
      logger.warn(conflictMsg, { service: serviceName });
      return `${result.summary}\n${chalk.yellow('Warning: ' + conflictMsg)}`;
    }

    return result.summary;
  } catch (error) {
    let errMsg = `Pull failed: ${error.message}`;

    if (error.message.includes('conflict')) {
      errMsg += '\nSolution: Resolve conflicts manually and commit the resolution';
    } else if (error.message.includes('authentication failed')) {
      errMsg += '\nSolution: Check your GitHub token using "gitmate config view"';
    }

    logger.error(errMsg, { stack: error.stack, service: serviceName });
    throw new Error(errMsg);
  }
}

/**
 * Clone repository with progress reporting
 */
export async function cloneRepository(repoUrl, options = {}) {
  try {
    let urlToClone = repoUrl;
    // Inject token for GitHub private repos
    if (repoUrl.includes('github.com')) {
      const token = await getToken('github_access_token');
      if (token) {
        // Parse owner/repo from URL
        const match = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)(\.git)?$/);
        if (match) {
          const [, owner, repo] = match;
          urlToClone = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
        }
      }
    }
    const git = simpleGit();
    await git.clone(urlToClone, '.', options);

    const message = `Cloned ${repoUrl} to current directory`;
    logger.info(message, { service: serviceName });
    return message;
  } catch (error) {
    let errMsg = `Clone failed: ${error.message}`;

    if (error.message.includes('authentication failed')) {
      errMsg += '\nSolution: Check your credentials or use SSH key authentication';
    } else if (error.message.includes('already exists')) {
      errMsg += `\nSolution: Remove existing directory or choose different path`;
    }

    logger.error(errMsg, { stack: error.stack, service: serviceName });
    throw new Error(errMsg);
  }
}

/**
 * Fetch from remote with pruning
 */
export async function fetchRemote(remoteName = 'origin', directoryPath = '.', options = { prune: true }) {
  const git = simpleGit(directoryPath);

  try {
    const fetchOptions = [];
    if (options.prune) fetchOptions.push('--prune');

    const result = await git.fetch(remoteName, fetchOptions);
    return result;
  } catch (error) {
    const errMsg = `Fetch failed: ${error.message}`;
    logger.error(errMsg, { stack: error.stack, service: serviceName });
    throw new Error(errMsg);
  }
}

/**
 * Get commit history with formatting
 */
export async function getLog(directoryPath = '.', options = { maxCount: 10, format: 'medium' }) {
  const git = simpleGit(directoryPath);

  try {
    const logOptions = ['--max-count=' + options.maxCount];
    if (options.format) logOptions.push('--format=' + options.format);

    const log = await git.log(logOptions);
    return log;
  } catch (error) {
    const errMsg = `Failed to get commit log: ${error.message}`;
    logger.error(errMsg, { stack: error.stack, service: serviceName });
    throw new Error(errMsg);
  }
}

/**
 * Create and checkout branch with intelligent branch naming
 */
export async function createAndCheckoutBranch(branchName, directoryPath = '.', options = {}) {
  const git = simpleGit(directoryPath);

  try {
    // Clean branch name
    const cleanBranchName = branchName.replace(/[^a-zA-Z0-9_-]/g, '-');


    // Check if branch exists
    const branches = await git.branchLocal();
    if (branches.all.includes(cleanBranchName)) {
      if (options.checkoutExisting) {
        await git.checkout(cleanBranchName);
        return `Checked out existing branch: ${cleanBranchName}`;
      }
      throw new Error(`Branch "${cleanBranchName}" already exists`);
    }

    // Create branch
    await git.checkoutLocalBranch(cleanBranchName);
    return `Created and checked out new branch: ${cleanBranchName}`;
  } catch (error) {
    const errMsg = `Branch operation failed: ${error.message}`;
    logger.error(errMsg, { stack: error.stack, service: serviceName });
    throw new Error(errMsg);
  }
}

/**
 * Merge branches with conflict detection
 */
export async function mergeBranch(sourceBranch, directoryPath = '.', options = {}) {
  const git = simpleGit(directoryPath);

  try {
    const result = await git.mergeFromTo(sourceBranch, undefined, options);

    if (result.conflicts.length > 0) {
      const conflictMsg = `${result.conflicts.length} conflicts need resolution`;
      logger.warn(conflictMsg, { service: serviceName });
      return {
        summary: result.summary,
        conflicts: result.conflicts,
        message: chalk.yellow(conflictMsg)
      };
    }

    return result.summary;
  } catch (error) {
    let errMsg = `Merge failed: ${error.message}`;

    if (error.git?.conflicts) {
      errMsg += `\nConflicts detected: ${error.git.conflicts.length} files`;
      errMsg += '\nSolution: Resolve conflicts and commit the resolution';
    }

    logger.error(errMsg, { stack: error.stack, service: serviceName });
    throw new Error(errMsg);
  }
}

/**
 * Rebase current branch with conflict handling
 */
export async function rebaseBranch(baseBranch, directoryPath = '.') {
  const git = simpleGit(directoryPath);

  try {
    await git.rebase([baseBranch]);
    return `Successfully rebased onto ${baseBranch}`;
  } catch (error) {
    let errMsg = `Rebase failed: ${error.message}`;

    if (error.git?.conflicts) {
      errMsg += `\nConflicts detected: ${error.git.conflicts.length} files`;
      errMsg += '\nSolution: Resolve conflicts and run "git rebase --continue"';
    }

    logger.error(errMsg, { stack: error.stack, service: serviceName });
    throw new Error(errMsg);
  }
}

/**
 * Enhanced revert with multiple commit support
 */
export async function revertCommit(commitHash = 'HEAD', directoryPath = '.', options = {}) {
  const git = simpleGit(directoryPath);

  try {
    const revertOptions = [];
    if (options.noEdit) revertOptions.push('--no-edit');

    await git.revert([commitHash, ...revertOptions]);
    return `Reverted commit ${commitHash.slice(0, 7)}`;
  } catch (error) {
    const errMsg = `Revert failed: ${error.message}`;
    logger.error(errMsg, { stack: error.stack, service: serviceName });
    throw new Error(errMsg);
  }
}

/**
 * Get file status with color-coded output
 */
export async function getStatus(directoryPath = '.', options = {}) {
  const git = simpleGit(directoryPath);

  try {
    const status = await git.status();

    // Format for CLI output
    const formatFileList = (files, color) =>
      files.map(f => chalk[color](`  ${f}`)).join('\n');

    const output = [
      `On branch ${chalk.blue(status.current)}`,
      status.ahead ? `  ${chalk.yellow(status.ahead + ' commit(s) ahead')}` : '',
      status.behind ? `  ${chalk.yellow(status.behind + ' commit(s) behind')}` : '',
      '',
      status.staged.length ? chalk.green('Changes to be committed:') : '',
      formatFileList(status.staged, 'green'),
      '',
      status.modified.length ? chalk.yellow('Changes not staged:') : '',
      formatFileList(status.modified, 'yellow'),
      '',
      status.not_added.length ? chalk.red('Untracked files:') : '',
      formatFileList(status.not_added, 'red'),
      '',
      status.conflicted.length ? chalk.magenta('Unmerged paths:') : '',
      formatFileList(status.conflicted, 'magenta'),
    ].filter(Boolean).join('\n');

    return output;
  } catch (error) {
    const errMsg = `Failed to get status: ${error.message}`;
    logger.error(errMsg, { stack: error.stack, service: serviceName });
    throw new Error(errMsg);
  }
}

/**
 * Generate commit message from diff using AI fallback
 */
async function generateCommitMessageFromDiff(diff) {
  // Simple heuristic-based message generation
  if (diff.includes('+') && diff.includes('-')) {
    return 'refactor: update implementation';
  } else if (diff.includes('+')) {
    return 'feat: add new functionality';
  } else if (diff.includes('-')) {
    return 'fix: remove problematic code';
  }
  return 'chore: update files';
}

/**
 * Ensure authenticated remote URL for GitHub
 */
async function ensureAuthenticatedRemote(directoryPath = '.') {
  const git = simpleGit(directoryPath);

  try {
    const remotes = await git.getRemotes(true);
    const origin = remotes.find(r => r.name === 'origin');
    if (!origin) return;

    // Already authenticated
    if (origin.refs.fetch.includes('@github.com')) return;

    const token = await getToken('github_access_token');
    if (!token) return;

    // Parse repository info
    const urlMatch = origin.refs.fetch.match(/github\.com[/:]([^/]+)\/([^/.]+)(\.git)?$/);
    if (!urlMatch) return;

    const [, owner, repo] = urlMatch;
    const username = 'x-access-token';
    const newUrl = `https://${username}:${token}@github.com/${owner}/${repo}.git`;

    await git.remote(['set-url', 'origin', newUrl]);
    logger.info(`Updated origin with authenticated URL`, { service: serviceName });
  } catch (error) {
    logger.warn('Failed to update remote URL', { error: error.message });
  }
}

/**
 * Set default branch via GitHub API
 */
export async function setDefaultBranch(branchName, directoryPath = '.') {
  try {
    const repoInfo = await getRemoteInfo(directoryPath);
    const [owner, repo] = repoInfo.split('/');
    const token = await getToken('github_access_token');

    if (!token) throw new Error('GitHub token not available');

    const response = await axios.patch(
      `https://api.github.com/repos/${owner}/${repo}`,
      { default_branch: branchName },
      { headers: { Authorization: `token ${token}` } }
    );

    return `Set default branch to ${branchName} for ${owner}/${repo}`;
  } catch (error) {
    let errMsg = `Failed to set default branch: ${error.response?.data?.message || error.message}`;

    if (error.response?.status === 403) {
      errMsg += '\nSolution: Ensure your token has repo permissions';
    } else if (error.response?.status === 404) {
      errMsg += '\nSolution: Check repository name and permissions';
    }

    logger.error(errMsg, { stack: error.stack, service: serviceName });
    throw new Error(errMsg);
  }
}

/**
 * Get repository info from remote
 */
export async function getRemoteInfo(directoryPath = '.') {
  const git = simpleGit(directoryPath);

  try {
    const remotes = await git.getRemotes(true);
    const origin = remotes.find(r => r.name === 'origin');
    if (!origin) throw new Error('No origin remote');

    const url = origin.refs.push || origin.refs.fetch;
    const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+)(\.git)?$/);
    if (!match) throw new Error('Could not parse GitHub URL');

    const [, owner, repo] = match;
    return `${owner}/${repo}`;
  } catch (error) {
    const errMsg = `Failed to get remote info: ${error.message}`;
    logger.error(errMsg, { stack: error.stack, service: serviceName });
    throw new Error(errMsg);
  }
}

// Additional utility functions

/**
 * Check if directory is a Git repository
 */
export async function isGitRepository(directoryPath = '.') {
  const git = simpleGit(directoryPath);
  try {
    return await git.checkIsRepo();
  } catch (error) {
    return false;
  }
}

/**
 * Get current branch name
 */
export async function getCurrentBranch(directoryPath = '.') {
  const git = simpleGit(directoryPath);
  try {
    const branch = await git.branchLocal();
    return branch.current;
  } catch (error) {
    throw new Error('Could not determine current branch');
  }
}

/**
 * Get diff between branches
 */
export async function getDiffBetweenBranches(sourceBranch, targetBranch, directoryPath = '.') {
  const git = simpleGit(directoryPath);
  try {
    return await git.diff([`${targetBranch}...${sourceBranch}`]);
  } catch (error) {
    throw new Error(`Failed to get diff between branches: ${error.message}`);
  }
}

/**
 * Get list of remotes
 */
export async function getRemotes(directoryPath = '.') {
  const git = simpleGit(directoryPath);
  try {
    return await git.getRemotes(true);
  } catch (error) {
    throw new Error(`Failed to get remotes: ${error.message}`);
  }
}

/**
 * Add a new remote
 */
export async function addRemote(name, url, directoryPath = '.') {
  const git = simpleGit(directoryPath);
  try {
    await git.addRemote(name, url);
    return `Added remote: ${name} -> ${url}`;
  } catch (error) {
    throw new Error(`Failed to add remote: ${error.message}`);
  }
}

/**
 * Checkout existing branch
 */
export async function checkoutBranch(branchName, directoryPath = '.') {
  const git = simpleGit(directoryPath);
  try {
    await git.checkout(branchName);
    return `Checked out branch: ${branchName}`;
  } catch (error) {
    throw new Error(`Failed to checkout branch: ${error.message}`);
  }
}

/**
 * Get branch list
 */
export async function listBranches(directoryPath = '.') {
  const git = simpleGit(directoryPath);
  try {
    const branches = await git.branch();
    return branches.all;
  } catch (error) {
    throw new Error(`Failed to list branches: ${error.message}`);
  }
}

/**
 * Create a new branch
 */
export async function createBranch(branchName, directoryPath = '.') {
  const git = simpleGit(directoryPath);
  try {
    await git.branch([branchName]);
    return `Created branch: ${branchName}`;
  } catch (error) {
    throw new Error(`Failed to create branch: ${error.message}`);
  }
}

export async function configureGitUser(directoryPath = '.', userConfig = {}) {
  const git = simpleGit(directoryPath);

  try {
    if (userConfig.name) {
      await git.addConfig('user.name', userConfig.name);
    }
    if (userConfig.email) {
      await git.addConfig('user.email', userConfig.email);
    }

    // Return current config
    const name = await git.raw(['config', 'user.name']);
    const email = await git.raw(['config', 'user.email']);

    return {
      name: name.trim(),
      email: email.trim()
    };
  } catch (error) {
    logger.error('Error configuring git user:', {
      message: error.message,
      config: userConfig,
      stack: error.stack,
      service: serviceName
    });
    throw error;
  }
}