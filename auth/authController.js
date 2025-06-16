import dotenv from 'dotenv';
import axios from 'axios';
import logger from '../src/utils/logger.js';
import { storeToken, getToken, clearAllTokens } from '../src/utils/tokenManager.js';

dotenv.config();

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const GITHUB_CALLBACK_URL = process.env.GITHUB_CALLBACK_URL;
const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_API_BASE_URL = process.env.GITHUB_API_BASE_URL || 'https://api.github.com';


// Placeholder for state management to prevent CSRF
const oauthStates = new Map();

/**
 * Redirects the user to GitHub's authorization page.
 */
export const redirectToGitHubAuth = (req, res) => {
  if (!GITHUB_CLIENT_ID) {
    logger.error('GitHub Client ID is not configured.', { service: 'AuthController' });
    return res.status(500).send('GitHub OAuth is not configured correctly on the server.');
  }
  // Generate a random state string for CSRF protection
  const state = Math.random().toString(36).substring(2, 15);
  oauthStates.set(state, Date.now() + 600000); // Store state with a 10-minute expiry

  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: GITHUB_CALLBACK_URL,
    scope: 'repo,user:email,gist,notifications', // Adjust scopes as needed
    state: state,
  });

  const authUrl = `${GITHUB_AUTHORIZE_URL}?${params.toString()}`;
  logger.info(`Redirecting to GitHub for authorization. State: ${state}`, { service: 'AuthController' });
  res.redirect(authUrl);
};

/**
 * Handles the callback from GitHub after user authorization.
 */
export const handleGitHubCallback = async (req, res) => {
  const { code, state } = req.query;
  const storedStateExpiry = oauthStates.get(state);

  if (!state || !storedStateExpiry || Date.now() > storedStateExpiry) {
    logger.error('Invalid or expired OAuth state.', { receivedState: state, service: 'AuthController' });
    oauthStates.delete(state); // Clean up used or expired state
    return res.status(400).send('Invalid or expired authorization state. Please try again.');
  }
  oauthStates.delete(state); // Valid state, remove it

  if (!code) {
    logger.error('No authorization code received from GitHub.', { service: 'AuthController' });
    return res.status(400).send('Authorization code is missing.');
  }

  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET || !GITHUB_CALLBACK_URL) {
    logger.error('GitHub OAuth credentials or callback URL are not configured.', { service: 'AuthController' });
    return res.status(500).send('OAuth configuration error on the server.');
  }

  try {
    logger.info('Exchanging authorization code for access token...', { service: 'AuthController' });
    const tokenResponse = await axios.post(
      GITHUB_TOKEN_URL,
      {
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code: code,
        redirect_uri: GITHUB_CALLBACK_URL,
      },
      {
        headers: {
          Accept: 'application/json', // Request JSON response
        },
      }
    );

    console.log(tokenResponse.data, "TOKEN DATA"); // Debugging line to inspect the response
    logger.info('Received access token response from GitHub.', { responseData: tokenResponse.data, service: 'AuthController' });

    const { access_token, scope, token_type, error, error_description } = tokenResponse.data;

    if (error) {
        logger.error('Error obtaining access token from GitHub:', { error, error_description, service: 'AuthController' });
        return res.status(400).send(`Error from GitHub: ${error_description || error}`);
    }

    if (!access_token) {
      logger.error('Access token not found in GitHub response.', { responseData: tokenResponse.data, service: 'AuthController' });
      return res.status(500).send('Failed to obtain access token from GitHub.');
    }

    logger.info('Successfully obtained access token.', { scope, token_type, service: 'AuthController' });

    // Securely store the access_token
    await storeToken('github_access_token', access_token);

    // Optionally, fetch user profile to confirm token validity
    const userProfileResponse = await axios.get(`${GITHUB_API_BASE_URL}/user`, {
        headers: { Authorization: `token ${access_token}` }
    });
    const userName = userProfileResponse.data.login;
    logger.info('Access token securely stored.', { user: userName, service: 'AuthController' }); // Moved here
    logger.info(`Token validated for user: ${userName}`, { service: 'AuthController' });

    // TODO: Redirect to a success page or send a success message
    res.send(`
      <h1>Authentication Successful!</h1>
      <p>Welcome, ${userName}!</p>
      <p>Access Token: <code>${access_token}</code> (This is sensitive, do not share!)</p>
      <p>Scope: ${scope}</p>
      <p>Token Type: ${token_type}</p>
      <p>You can now close this window. The CLI should be authenticated.</p>
      <script>
        // You might want to send this token to the CLI or main app
        // For example, via a local server endpoint or by writing to a temp file
        // For security, avoid exposing it directly in the browser for too long.
        // Consider a mechanism for the CLI to poll for this token.
      </script>
    `);

  } catch (error) {
    logger.error('Error during GitHub OAuth callback:', {
      message: error.message,
      stack: error.stack,
      response: error.response ? { status: error.response.status, data: error.response.data } : 'No response data',
      service: 'AuthController'
    });
    res.status(500).send('An error occurred during GitHub authentication.');
  }
};

/**
 * Placeholder for logout functionality
 */
export const logout = async (req, res) => {
  try {
    await storeToken('github_access_token', null); // Clear the specific token
    // Or, to clear all tokens: await clearAllTokens();
    logger.info('User logout successful. GitHub access token cleared...', { service: 'AuthController' });
    res.send('Logout successful. Your session has been cleared.');
  } catch (error) {
    logger.error('Error during logout while clearing token:', { message: error.message, service: 'AuthController' });
    res.status(500).send('An error occurred during logout.');
  }
};