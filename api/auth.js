import express from 'express';
import session from 'express-session';
import passport from 'passport';
import GitHubStrategy from 'passport-github2';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch'; // If using Node <18, otherwise use global fetch
import crypto from 'crypto';
import { logger } from '../src/utils/logger.js';


const ENCRYPTION_KEY = process.env.GITBOT_SECRET_KEY; // 32 bytes for AES-256
const IV_LENGTH = 16; // For AES, this is always 16

function encrypt(text) {
  let iv = crypto.randomBytes(IV_LENGTH);
  let cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);

  encrypted = Buffer.concat([encrypted, cipher.final()]);

  // Return iv + encrypted data as base64
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

const app = express();
dotenv.config();
// Add JSON body parser middleware before routes
app.use(express.json());

// Session configuration for serverless
app.use(session({
  secret: process.env.SESSION_SECRET || 'gitmate-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// Setup Passport with GitHub OAuth
function setupPassport() {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const callbackURL = process.env.GITHUB_CALLBACK_URL || 'https://gitbot-jtp2.onrender.com/auth/github/callback';
  
  if (!clientId || !clientSecret) {
    throw new Error('GitHub OAuth credentials not available. Please set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables.');
  }

  passport.use(new GitHubStrategy({
    clientID: clientId,
    clientSecret: clientSecret,
    callbackURL: callbackURL
  }, (accessToken, refreshToken, profile, done) => {
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

  passport.serializeUser((user, done) => {
    done(null, user);
  });

  passport.deserializeUser((user, done) => {
    done(null, user);
  });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Home route for health check and Render deployment
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'gitmate-auth'
  });
});

// GitHub OAuth routes
app.get('/auth/github', passport.authenticate('github', { scope: ['user', 'repo'] }));

app.get('/auth/github/callback', 
  passport.authenticate('github', { failureRedirect: '/auth/failure' }),
  (req, res) => {
    try {
      // Validate user object exists
      if (!req.user || !req.user.accessToken) {
        logger.error('Authentication failed - user data missing');
        return res.redirect('/auth/failure');
      }

      const user = req.user;
      
      // Encrypt tokens before storage
      const encryptedToken = encrypt(user.accessToken);
      if (!encryptedToken) {
        throw new Error('Token encryption failed');
      }

      // Securely store tokens and user data
      config.set('github.accessToken', user.accessToken);
      config.set('github.refreshToken', user.refreshToken || '');
      config.set('github.user', {
        id: user.id,
        username: user.username,
        displayName: user.displayName || user.username,
        email: user.email || ''
      });

      logger.info('GitHub authentication successful', {
        username: user.username,
        userId: user.id,
        ip: req.ip
      });

      // Generate safe HTML output
      const safeDisplayName = escapeHtml(user.displayName || user.username);
      const safeUsername = escapeHtml(user.username);

      // Send success response with improved UI
      res.status(200).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="X-UA-Compatible" content="ie=edge">
          <title>Authentication Success | GitBot</title>
          <style>
            :root {
              --primary: #6e48aa;
              --secondary: #9d50bb;
              --success: #4ade80;
              --text-light: #f8f9fa;
            }
            
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }
            
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 
                Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, var(--primary), var(--secondary));
              color: var(--text-light);
              line-height: 1.6;
            }
            
            .container {
              text-align: center;
              background: rgba(255, 255, 255, 0.1);
              padding: 2.5rem;
              border-radius: 16px;
              backdrop-filter: blur(8px);
              box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
              max-width: 90%;
              width: 450px;
              animation: fadeIn 0.5s ease-out;
            }
            
            h1 {
              margin-bottom: 1rem;
              font-size: 2rem;
            }
            
            .avatar {
              width: 80px;
              height: 80px;
              border-radius: 50%;
              margin: 0 auto 1rem;
              border: 3px solid white;
              object-fit: cover;
            }
            
            .user-info {
              margin: 1.5rem 0;
            }
            
            .close-btn {
              background: rgba(255, 255, 255, 0.2);
              border: none;
              color: white;
              padding: 12px 24px;
              border-radius: 50px;
              cursor: pointer;
              margin-top: 1.5rem;
              font-weight: 600;
              transition: all 0.3s ease;
              display: inline-flex;
              align-items: center;
              gap: 8px;
            }
            
            .close-btn:hover {
              background: rgba(255, 255, 255, 0.3);
              transform: translateY(-2px);
            }
            
            .checkmark {
              font-size: 4rem;
              margin-bottom: 1rem;
              color: var(--success);
              animation: bounce 0.5s;
            }
            
            @keyframes fadeIn {
              from { opacity: 0; transform: translateY(20px); }
              to { opacity: 1; transform: translateY(0); }
            }
            
            @keyframes bounce {
              0%, 20%, 50%, 80%, 100% {transform: translateY(0);}
              40% {transform: translateY(-20px);}
              60% {transform: translateY(-10px);}
            }
            
            @media (max-width: 480px) {
              .container {
                padding: 1.5rem;
              }
              
              h1 {
                font-size: 1.5rem;
              }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="checkmark">✓</div>
            <h1>Authentication Successful!</h1>
            
            ${user.photos?.[0]?.value ? `
              <img src="${escapeHtml(user.photos[0].value)}" alt="Profile" class="avatar">
            ` : ''}
            
            <div class="user-info">
              <p>Welcome, <strong>${safeDisplayName}</strong>!</p>
              <p>You are logged in as <code>${safeUsername}</code></p>
            </div>
            
            <p>You can now close this window and return to your terminal.</p>
            
            <button class="close-btn" onclick="window.close()">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
              </svg>
              Close Window
            </button>
          </div>
          
          <script>
            // Attempt to close window automatically if possible
            setTimeout(() => {
              try {
                if (window.opener || window.history.length <= 1) {
                  window.close();
                }
              } catch (e) {
                console.log('Window could not close automatically');
              }
            }, 3000);
          </script>
        </body>
        </html>
      `);

      // Close server after successful auth
      setTimeout(() => {
        this.stop().catch(err => {
          logger.error('Failed to stop server after authentication', { error: err.message });
        });
      }, 2000);

    } catch (error) {
      logger.error('Authentication callback error', {
        error: error.message,
        stack: error.stack
      });
      res.redirect('/auth/failure');
    }
  }
);

// Helper function to escape HTML
function escapeHtml(unsafe) {
  if (!unsafe) return '';
  return unsafe.toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

app.get('/auth/failure', (req, res) => {
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

// Mistral AI proxy endpoint
app.post('/api/mistral', async (req, res) => {
  const { messages, options } = req.body;
  const apiKey = process.env.MISTRAL_API_KEY;

  if (!apiKey) {
      return res.status(500).json({ error: 'Mistral API key not configured on server.' });
  }

  try {
      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
              model: options?.model || 'mistral-large-latest',
              messages,
              max_tokens: options?.max_tokens || 1000,
              temperature: options?.temperature || 0.7
          })
      });

      if (!response.ok) {
          return res.status(response.status).json({ error: await response.text() });
      }

      const data = await response.json();
      res.status(200).json(data);
  } catch (err) {
      res.status(500).json({ error: err.message });
  }

});


// Initialize passport
setupPassport();

// Export for Vercel
export default app;

// Start server when running locally or on Render (ESM compatible)
if (process.env.RENDER || process.argv[1].endsWith('auth.js')) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
} 