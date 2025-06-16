import axios from 'axios';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';
import { getToken } from '../utils/tokenManager.js';

dotenv.config();

const GITHUB_API_BASE_URL = process.env.GITHUB_API_BASE_URL || 'https://api.github.com';

async function getHeaders() {
  const token = await getToken('github_access_token');
  if (!token) {
    logger.error('GitHub access token not found. Please authenticate first.', { service: 'GitHubService' });
    throw new Error('GitHub access token not found. Run authentication flow.');
  }
  return {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
  };
}

/**
 * Fetches the authenticated user's profile.
 * @returns {Promise<object>} User profile data.
 */
export async function getUserProfile() {
  try {
    const headers = await getHeaders();
    const response = await axios.get(`${GITHUB_API_BASE_URL}/user`, { headers });
    logger.info('Successfully fetched user profile.', { user: response.data.login, service: 'GitHubService' });
    return response.data;
  } catch (error) {
    logger.error('Error fetching user profile:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      service: 'GitHubService',
    });
    throw error; // Re-throw to be handled by the caller
  }
}

/**
 * Lists repositories for the authenticated user.
 * @param {object} options - Options for listing repositories (e.g., type, sort, direction, per_page, page).
 * @returns {Promise<Array>} List of repositories.
 */
export async function listUserRepositories(options = {}) {
  try {
    const headers = await getHeaders();
    const params = new URLSearchParams(options).toString();
    const url = `${GITHUB_API_BASE_URL}/user/repos${params ? `?${params}` : ''}`;
    
    logger.info(`Fetching user repositories with options: ${JSON.stringify(options)}`, { service: 'GitHubService' });
    const response = await axios.get(url, { headers });
    logger.info(`Successfully fetched ${response.data.length} repositories.`, { service: 'GitHubService' });
    return response.data;
  } catch (error) {
    logger.error('Error listing user repositories:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      service: 'GitHubService',
    });
    throw error;
  }
}

/**
 * Creates a new repository for the authenticated user.
 * @param {string} name - The name of the repository.
 * @param {object} options - Repository options (e.g., description, private, auto_init).
 *                           Example: { description: 'My new repo', private: false, auto_init: true }
 * @returns {Promise<object>} The created repository data.
 */
export async function createRepository(name, options = {}) {
  if (!name || typeof name !== 'string' || name.trim() === '') {
    const err = new Error('Repository name is required and must be a non-empty string.');
    logger.error(err.message, { name, options, service: 'GitHubService' });
    throw err;
  }
  try {
    const headers = await getHeaders();
    const payload = {
      name,
      description: options.description || '',
      private: options.private === undefined ? false : Boolean(options.private), // Default to public
      auto_init: options.auto_init === undefined ? false : Boolean(options.auto_init), // Default to no auto_init
      ...options, // Allow other valid GitHub API options
    };
    logger.info(`Creating repository "${name}" with options: ${JSON.stringify(payload)}`, { service: 'GitHubService' });
    const response = await axios.post(`${GITHUB_API_BASE_URL}/user/repos`, payload, { headers });
    logger.info(`Successfully created repository: ${response.data.full_name}`, { service: 'GitHubService' });
    return response.data;
  } catch (error) {
    logger.error(`Error creating repository "${name}":`, {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      payloadSent: { name, ...options },
      service: 'GitHubService',
    });
    throw error;
  }
}

/**
 * Gets details for a specific repository.
 * @param {string} owner - The owner of the repository.
 * @param {string} repo - The name of the repository.
 * @returns {Promise<object>} Repository details.
 */
export async function getRepositoryDetails(owner, repo) {
    if (!owner || !repo) {
        const err = new Error('Owner and repository name are required.');
        logger.error(err.message, { owner, repo, service: 'GitHubService' });
        throw err;
    }
    try {
        const headers = await getHeaders();
        logger.info(`Fetching details for repository: ${owner}/${repo}`, { service: 'GitHubService' });
        const response = await axios.get(`${GITHUB_API_BASE_URL}/repos/${owner}/${repo}`, { headers });
        logger.info(`Successfully fetched details for ${owner}/${repo}.`, { service: 'GitHubService' });
        return response.data;
    } catch (error) {
        logger.error(`Error fetching repository details for ${owner}/${repo}:`, {
            message: error.message,
            status: error.response?.status,
            data: error.response?.data,
            service: 'GitHubService',
        });
        throw error;
    }
}


/**
 * Creates a new branch in a repository.
 * @param {string} owner - The owner of the repository.
 * @param {string} repo - The name of the repository.
 * @param {string} branchName - The name of the new branch.
 * @param {string} sha - The SHA of the commit to base the new branch on.
 * @returns {Promise<object>} The created branch reference data.
 */
export async function createBranch(owner, repo, branchName, sha) {
  if (!owner || !repo || !branchName || !sha) {
    const err = new Error('Owner, repo, branch name, and SHA are required to create a branch.');
    logger.error(err.message, { owner, repo, branchName, sha, service: 'GitHubService' });
    throw err;
  }
  try {
    const headers = await getHeaders();
    const payload = {
      ref: `refs/heads/${branchName}`,
      sha: sha,
    };
    logger.info(`Creating branch "${branchName}" in ${owner}/${repo} from SHA ${sha}`, { service: 'GitHubService' });
    const response = await axios.post(`${GITHUB_API_BASE_URL}/repos/${owner}/${repo}/git/refs`, payload, { headers });
    logger.info(`Successfully created branch: ${response.data.ref}`, { service: 'GitHubService' });
    return response.data;
  } catch (error) {
    logger.error(`Error creating branch "${branchName}" in ${owner}/${repo}:`, {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      service: 'GitHubService',
    });
    throw error;
  }
}

/**
 * Creates a new pull request.
 * @param {string} owner - The owner of the repository.
 * @param {string} repo - The name of the repository.
 * @param {string} title - The title of the pull request.
 * @param {string} head - The name of the branch where your changes are implemented.
 * @param {string} base - The name of the branch you want the changes pulled into.
 * @param {string} body - (Optional) The contents of the pull request.
 * @returns {Promise<object>} The created pull request data.
 */
export async function createPullRequest(owner, repo, title, head, base, body = '') {
  if (!owner || !repo || !title || !head || !base) {
    const err = new Error('Owner, repo, title, head branch, and base branch are required for a pull request.');
    logger.error(err.message, { owner, repo, title, head, base, service: 'GitHubService' });
    throw err;
  }
  try {
    const headers = await getHeaders();
    const payload = { title, head, base, body };
    logger.info(`Creating pull request in ${owner}/${repo}: "${title}" from ${head} to ${base}`, { service: 'GitHubService' });
    const response = await axios.post(`${GITHUB_API_BASE_URL}/repos/${owner}/${repo}/pulls`, payload, { headers });
    logger.info(`Successfully created pull request: #${response.data.number}`, { service: 'GitHubService' });
    return response.data;
  } catch (error) {
    logger.error(`Error creating pull request in ${owner}/${repo}:`, {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      service: 'GitHubService',
    });
    // GitHub often returns 422 with specific errors in response.data.errors
    if (error.response && error.response.data && error.response.data.errors) {
        logger.error('Detailed errors from GitHub:', { errors: error.response.data.errors, service: 'GitHubService' });
    }
    throw error;
  }
}

// TODO: Implement other GitHub API functions as needed:
// - Pushing code (more complex, involves local git operations first, then updating refs or creating blobs/trees/commits)
// - Handling repo permissions
// - Getting file content, updating files, etc.