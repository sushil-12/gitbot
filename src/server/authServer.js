import express from 'express';
import session from 'express-session';
import passport from 'passport';
import GitHubStrategy from 'passport-github2';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { ProfessionalUI } from '../utils/ui.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const UI = new ProfessionalUI();

/**
 * GitHub OAuth Authentication Server
 */
export class AuthServer {
  constructor() {
    this.app = express();
    this.server = null;
    this.port = process.env.PORT || 3000;
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Initialize passport (must be called after constructor)
   */
  async initialize() {
    await this.setupPassport();
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(express.static(join(__dirname, 'public')));

    // Session configuration
    this.app.use(session({
      secret: process.env.SESSION_SECRET || 'gitbot-secret-key',
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      }
    }));

    this.app.use(passport.initialize());
    this.app.use(passport.session());
  }

  /**
   * Setup Passport authentication
   */
  async setupPassport() {
    // Get credentials from environment variables
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    const callbackUrl = process.env.GITHUB_CALLBACK_URL || 'https://gitbot-jtp2.onrender.com/auth/github/callback';

    if (!clientId || !clientSecret) {
      throw new Error('GitHub OAuth credentials not available. Please set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in your environment variables.');
    }

    // GitHub OAuth Strategy
    passport.use(new GitHubStrategy({
      clientID: clientId,
      clientSecret: clientSecret,
      callbackURL: callbackUrl
    }, (accessToken, refreshToken, profile, done) => {
      // Store user profile and tokens

      const user = {
        id: profile.id,
        username: profile.username,
        displayName: profile.displayName,
        email: profile.emails?.[0]?.value,
        accessToken,
        refreshToken
      };

      return done(null, user);
    }));

    // Serialize user for session
    passport.serializeUser((user, done) => {
      done(null, user);
    });

    // Deserialize user from session
    passport.deserializeUser((user, done) => {
      done(null, user);
    });
  }

  /**
   * Setup authentication routes
   */
  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // GitHub OAuth routes
    this.app.get('/auth/github', passport.authenticate('github', { scope: ['user', 'repo'] }));

    this.app.get('/auth/github/callback',
      passport.authenticate('github', { failureRedirect: '/auth/failure' }),
      (req, res) => {
        // Successful authentication
        const user = req.user;

        // Store tokens in config
        config.set('github.accessToken', user.accessToken);
        config.set('github.refreshToken', user.refreshToken);
        config.set('github.user', {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          email: user.email
        });

        logger.info('GitHub authentication successful', {
          username: user.username,
          userId: user.id
        });

        // Send success response
        res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>GitBot Authentication</title>
            <style>
              body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
              }
              .container {
                text-align: center;
                background: rgba(255,255,255,0.1);
                padding: 2rem;
                border-radius: 10px;
                backdrop-filter: blur(10px);
              }
              .success { color: #4ade80; }
              .close-btn {
                background: rgba(255,255,255,0.2);
                border: none;
                color: white;
                padding: 10px 20px;
                border-radius: 5px;
                cursor: pointer;
                margin-top: 1rem;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>🎉 Authentication Successful!</h1>
              <p>Welcome, <strong>${user.displayName || user.username}</strong>!</p>
              <p>You can now close this window and return to your terminal.</p>
              <button class="close-btn" onclick="window.close()">Close Window</button>
            </div>
          </body>
          </html>
        `);

        // Close server after successful auth
        setTimeout(() => {
          this.stop();
        }, 2000);
      }
    );

    // Authentication failure
    this.app.get('/auth/failure', (req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Authentication Failed</title>
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
              color: white;
            }
            .container {
              text-align: center;
              background: rgba(255,255,255,0.1);
              padding: 2rem;
              border-radius: 10px;
              backdrop-filter: blur(10px);
            }
            .error { color: #fca5a5; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>❌ Authentication Failed</h1>
            <p>Please try again or check your configuration.</p>
          </div>
        </body>
        </html>
      `);
    });

    // Error handling
    this.app.use((err, req, res, next) => {
      logger.error('Auth server error:', err, req, next);
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  /**
   * Start the authentication server
   */
  async start() {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.port, () => {
          logger.info(`Auth server started on port ${this.port}`);
          UI.success('Authentication server started', `Server running on http://localhost:${this.port}`);
          resolve();
        });

        this.server.on('error', (error) => {
          logger.error('Auth server error:', error);
          reject(error);
        });
      } catch (error) {
        logger.error('Failed to start auth server:', error);
        reject(error);
      }
    });
  }

  /**
   * Stop the authentication server
   */
  stop() {
    if (this.server) {
      this.server.close(() => {
        logger.info('Auth server stopped');
        UI.info('Authentication server stopped');
      });
      this.server = null;
    }
  }
}

/**
 * Start the authentication server
 */
export async function startAuthServer() {
  try {
    // Use hosted authentication URL
    const authUrl = process.env.GITMATE_AUTH_URL || 'https://gitbot-jtp2.onrender.com/auth/github';
    console.log(authUrl);

    UI.info('GitHub Authentication',
      'Opening browser for GitHub authentication...\n\n' +
      'This will redirect you to GitHub to authorize GitMate.'
    );

    // Open browser for authentication
    try {
      const open = (await import('open')).default;
      await open(authUrl);
    } catch (error) {
      UI.warning('Could not open browser automatically', `Please visit: ${authUrl}`);
    }

    return { authUrl };
  } catch (error) {
    logger.error('Failed to start auth server:', error);
    UI.error('Authentication Error', error.message);
    throw error;
  }
} 