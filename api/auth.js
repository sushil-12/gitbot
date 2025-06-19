import express from 'express';
import session from 'express-session';
import passport from 'passport';
import GitHubStrategy from 'passport-github2';
import dotenv from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch'; // If using Node <18, otherwise use global fetch


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
    const user = req.user;
    // Send success response with token data and copy instructions
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>GitMate Authentication</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
          .container { text-align: center; background: rgba(255,255,255,0.1); padding: 2rem; border-radius: 10px; backdrop-filter: blur(10px); }
          .token-box { background: #222; color: #4ade80; font-size: 1.1rem; padding: 0.7rem 1.2rem; border-radius: 6px; margin: 1rem auto; word-break: break-all; display: inline-block; }
          .warning { color: #fbbf24; margin-top: 1rem; }
          .success { color: #4ade80; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🎉 Authentication Successful!</h1>
          <p class="success">Copy the token below and paste it into your terminal when prompted.</p>
          <div class="token-box">${user.accessToken}</div>
          <p class="warning"><b>Warning:</b> This token gives access to your GitHub account. <br>Do <b>not</b> share it with anyone.</p>
          <p>Return to your terminal and paste the token when asked.</p>
        </div>
      </body>
      </html>
    `);
  }
);

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