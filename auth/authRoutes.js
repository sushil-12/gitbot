import express from 'express';
import { redirectToGitHubAuth, handleGitHubCallback, logout } from './authController.js';
import logger from '../src/utils/logger.js';

const router = express.Router();

// Route to initiate GitHub OAuth flow
// e.g., GET /auth/github
router.get('/github', (req, res) => {
  logger.info('Received request for GitHub authentication initiation.', { service: 'AuthRoutes' });
  redirectToGitHubAuth(req, res);
});

// Route to handle GitHub OAuth callback
// e.g., GET /auth/github/callback
router.get('/github/callback', (req, res) => {
  logger.info('Received callback from GitHub.', { query: req.query, service: 'AuthRoutes' });
  handleGitHubCallback(req, res);
});

// Route for user logout (placeholder)
// e.g., GET /auth/logout
router.get('/logout', (req, res) => {
    logger.info('Received request for logout.', { service: 'AuthRoutes' });
    logout(req, res); // Assuming logout function handles response
});

// You might add other auth-related routes here, e.g., for checking auth status
router.get('/status', (req, res) => {
    // TODO: Implement logic to check if user is authenticated
    // For example, check if a valid token exists in secure storage
    // const token = await getToken('github_access_token');
    // if (token) {
    //    res.json({ authenticated: true, message: "User is authenticated." });
    // } else {
    //    res.json({ authenticated: false, message: "User is not authenticated." });
    // }
    logger.info('Auth status check requested (not yet fully implemented).', { service: 'AuthRoutes' });
    res.status(501).json({ authenticated: false, message: "Auth status check not implemented yet." });
});


export default router;