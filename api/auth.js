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

dotenv.config();
const ENCRYPTION_KEY = "12345678901234567890123456789012"; // 32 bytes for AES-256
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
      const encryptedToken = encrypt(user.accessToken);
      if (!encryptedToken) {
        throw new Error('Token encryption failed');
      }

      logger.info('GitHub authentication successful', {
        username: user.username,
        userId: user.id,
        ip: req.ip
      });

      // Generate safe HTML output
      const safeDisplayName = escapeHtml(user.displayName || user.username);
      const safeUsername = escapeHtml(user.username);
      const truncatedToken = encryptedToken.length > 32 
        ? `${encryptedToken.substring(0, 32)}...` 
        : encryptedToken;

      res.status(200).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="X-UA-Compatible" content="ie=edge">
          <title>Authentication Success | GitBot</title>
          <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
          <style>
            :root {
              --primary: #6e48aa;
              --secondary: #9d50bb;
              --success: #4ade80;
              --text-light: #f8f9fa;
              --text-muted: #e9ecef;
              --card-bg: rgba(255, 255, 255, 0.08);
              --border-radius: 12px;
            }
            
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }
            
            body {
              font-family: 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, var(--primary), var(--secondary));
              color: var(--text-light);
              line-height: 1.6;
              padding: 20px;
            }
            
            .container {
              text-align: center;
              background: var(--card-bg);
              padding: 2.5rem;
              border-radius: var(--border-radius);
              backdrop-filter: blur(12px);
              box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
              max-width: 90%;
              width: 500px;
              animation: fadeIn 0.5s ease-out;
            }
            
            h1 {
              margin-bottom: 1.5rem;
              font-size: 2rem;
              font-weight: 600;
            }
            
            .avatar {
              width: 96px;
              height: 96px;
              border-radius: 50%;
              margin: 0 auto 1.5rem;
              border: 3px solid rgba(255, 255, 255, 0.2);
              object-fit: cover;
              box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
            }
            
            .user-info {
              margin: 1.5rem 0;
            }
            
            .token-container {
              background: rgba(0, 0, 0, 0.2);
              padding: 1rem;
              border-radius: var(--border-radius);
              margin: 1.5rem 0;
              position: relative;
              word-break: break-all;
              font-family: 'Courier New', monospace;
              font-size: 0.9rem;
            }
            
            .token-label {
              display: block;
              margin-bottom: 0.5rem;
              font-size: 0.85rem;
              color: var(--text-muted);
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            
            .copy-btn {
              position: absolute;
              top: 0.5rem;
              right: 0.5rem;
              background: rgba(255, 255, 255, 0.1);
              border: none;
              color: var(--text-light);
              padding: 0.25rem 0.5rem;
              border-radius: 4px;
              cursor: pointer;
              font-size: 0.75rem;
              transition: all 0.2s ease;
            }
            
            .copy-btn:hover {
              background: rgba(255, 255, 255, 0.2);
            }
            
            .close-btn {
              background: rgba(255, 255, 255, 0.2);
              border: none;
              color: white;
              padding: 12px 28px;
              border-radius: 50px;
              cursor: pointer;
              margin-top: 1.5rem;
              font-weight: 500;
              transition: all 0.3s ease;
              display: inline-flex;
              align-items: center;
              gap: 8px;
              font-size: 0.95rem;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            
            .close-btn:hover {
              background: rgba(255, 255, 255, 0.3);
              transform: translateY(-2px);
              box-shadow: 0 6px 8px rgba(0, 0, 0, 0.15);
            }
            
            .checkmark {
              font-size: 4rem;
              margin-bottom: 1rem;
              color: var(--success);
              animation: bounce 0.5s;
            }
            
            .instructions {
              font-size: 0.9rem;
              color: var(--text-muted);
              margin: 1rem 0;
              line-height: 1.5;
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
                padding: 1.75rem;
              }
              
              h1 {
                font-size: 1.65rem;
              }
              
              .avatar {
                width: 80px;
                height: 80px;
              }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="checkmark"><i class="fas fa-check-circle"></i></div>
            <h1>Authentication Successful</h1>
            
            ${user.photos?.[0]?.value ? `
              <img src="${escapeHtml(user.photos[0].value)}" alt="Profile" class="avatar">
            ` : ''}
            
            <div class="user-info">
              <p>Welcome, <strong>${safeDisplayName}</strong>!</p>
              <p class="instructions">Your access token has been securely generated and encrypted.</p>
            </div>
            
            <div class="token-container">
              <span class="token-label">Encrypted Access Token</span>
              <button class="copy-btn" onclick="copyToClipboard('${escapeHtml(encryptedToken)}')">
                <i class="far fa-copy"></i> Copy
              </button>
              <div id="token">${truncatedToken}</div>
            </div>
            
            <p class="instructions">You can now close this window and return to your terminal.</p>
            
            <button class="close-btn" onclick="window.close()">
              <i class="fas fa-times"></i> Close Window
            </button>
          </div>
          
          <script>
            function copyToClipboard(text) {
              navigator.clipboard.writeText(text).then(() => {
                const copyBtn = document.querySelector('.copy-btn');
                copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
                setTimeout(() => {
                  copyBtn.innerHTML = '<i class="far fa-copy"></i> Copy';
                }, 2000);
              }).catch(err => {
                console.error('Failed to copy: ', err);
              });
            }
          </script>
        </body>
        </html>
      `);
    } catch (error) {
      logger.error('Authentication callback error', {
        error: error.message,
        stack: error.stack
      });
      console.log(error?.message)
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

// Enhanced Cache Service
import EnhancedQueryCacheService from './enhancedCacheService.js';
const cacheService = new EnhancedQueryCacheService();

// Initialize cache service
cacheService.connect().catch(console.error);

// Multiple Mistral API keys for load balancing
const MISTRAL_API_KEYS = [
  process.env.MISTRAL_API_KEY,
  process.env.MISTRAL_API_KEY_2,
  process.env.MISTRAL_API_KEY_3
].filter(key => key); // Remove undefined keys

let currentProviderIndex = 0;
let providerFailures = new Map(); // Track failures per provider

// Fallback intent detection function
function getFallbackIntent(query) {
  const lowerQuery = query.toLowerCase().trim();
  
  // Repository-related intents - PRIORITIZE list over create
  if (lowerQuery.includes('repo') || lowerQuery.includes('repository')) {
    if (lowerQuery.includes('list') || lowerQuery.includes('show') || lowerQuery.includes('display') || 
        lowerQuery.includes('what') || lowerQuery.includes('my repositories') || lowerQuery.includes('my repos')) {
      return { intent: 'list_repos', entities: {}, confidence: 0.9 };
    }
    if (lowerQuery.includes('create') || lowerQuery.includes('new') || lowerQuery.includes('make')) {
      return { intent: 'create_repo', entities: {}, confidence: 0.9 };
    }
    if (lowerQuery.includes('clone') || lowerQuery.includes('download')) {
      return { intent: 'clone_repo', entities: {}, confidence: 0.8 };
    }
  }
  
  // Branch-related intents
  if (lowerQuery.includes('branch')) {
    if (lowerQuery.includes('list') || lowerQuery.includes('show') || lowerQuery.includes('display')) {
      return { intent: 'list_branches', entities: {}, confidence: 0.9 };
    }
    if (lowerQuery.includes('create') || lowerQuery.includes('new')) {
      return { intent: 'create_branch', entities: {}, confidence: 0.8 };
    }
    if (lowerQuery.includes('checkout') || lowerQuery.includes('switch')) {
      return { intent: 'checkout_branch', entities: {}, confidence: 0.8 };
    }
    if (lowerQuery.includes('merge')) {
      return { intent: 'merge_branch', entities: {}, confidence: 0.8 };
    }
  }
  
  // Status and diff intents - PRIORITIZE these over generic repo operations
  if (lowerQuery.includes('status') || lowerQuery.includes('what\'s changed') || 
      lowerQuery.includes('current status') || (lowerQuery.includes('show') && lowerQuery.includes('change'))) {
    return { intent: 'git_status', entities: {}, confidence: 0.9 };
  }
  if (lowerQuery.includes('diff') || lowerQuery.includes('difference') || lowerQuery.includes('differences')) {
    return { intent: 'git_diff', entities: {}, confidence: 0.9 };
  }
  if (lowerQuery.includes('log') || lowerQuery.includes('history') || lowerQuery.includes('commits')) {
    return { intent: 'git_log', entities: {}, confidence: 0.8 };
  }
  
  // Git operations - PRIORITIZE these over generic repo operations
  if (lowerQuery.includes('push')) {
    return { intent: 'push_changes', entities: { branch: 'current', remote: 'origin' }, confidence: 0.9 };
  }
  if (lowerQuery.includes('pull') || lowerQuery.includes('sync')) {
    return { intent: 'pull_changes', entities: { remote: 'origin' }, confidence: 0.9 };
  }
  if (lowerQuery.includes('commit')) {
    return { intent: 'git_commit', entities: {}, confidence: 0.8 };
  }
  if (lowerQuery.includes('add') || lowerQuery.includes('stage')) {
    return { intent: 'git_add', entities: {}, confidence: 0.8 };
  }
  if (lowerQuery.includes('revert')) {
    return { intent: 'revert_commit', entities: {}, confidence: 0.8 };
  }
  
  // Pull request intents
  if (lowerQuery.includes('pr') || lowerQuery.includes('pull request') || lowerQuery.includes('merge request')) {
    return { intent: 'create_pr', entities: {}, confidence: 0.9 };
  }
  
  // Help and authentication intents
  if (lowerQuery.includes('help') || lowerQuery.includes('what can') || lowerQuery.includes('capabilities')) {
    return { intent: 'help', entities: {}, confidence: 0.9 };
  }
  if (lowerQuery.includes('login') || lowerQuery.includes('authenticate') || lowerQuery.includes('logged in')) {
    return { intent: 'greeting', entities: {}, confidence: 0.8 };
  }
  
  // Greeting intents
  if (lowerQuery.includes('hello') || lowerQuery.includes('hi') || lowerQuery.includes('hey')) {
    return { intent: 'greeting', entities: {}, confidence: 0.9 };
  }
  
  return { intent: 'unknown', entities: { error: 'Could not determine intent' }, confidence: 0.0 };
}

// Mistral AI proxy endpoint with enhanced caching and provider fallback
app.post('/api/mistral', async (req, res) => {
  const { messages, options } = req.body;

  if (MISTRAL_API_KEYS.length === 0) {
      return res.status(500).json({ error: 'No Mistral API keys configured on server.' });
  }

  try {
      // Extract user query for caching
      const userQuery = messages?.[0]?.content;
      let cachedResponse = null;

      // Check cache for all queries (including intent parsing)
      if (userQuery) {
          cachedResponse = await cacheService.findSimilarQuery(userQuery);
      }

      if (cachedResponse) {
          return res.status(200).json({
              id: 'cached-response-' + Date.now(),
              object: 'chat.completion',
              created: Math.floor(Date.now() / 1000),
              model: 'mistral-large-latest',
              choices: [{
                  index: 0,
                  message: {
                      content: JSON.stringify({
                          intent: cachedResponse.intent,
                          entities: cachedResponse.entities,
                          confidence: cachedResponse.confidence
                      })
                  },
                  finish_reason: 'stop'
              }],
              usage: {
                  prompt_tokens: 0,
                  completion_tokens: 0,
                  total_tokens: 0
              }
          });
      }

      // No cache hit, call Mistral API with provider fallback
      console.log(`🤖 Calling Mistral API for: "${userQuery}"`);
      
      let response;
      let lastError;
      
      // Try each provider until one works
      for (let attempt = 0; attempt < MISTRAL_API_KEYS.length; attempt++) {
        const apiKey = MISTRAL_API_KEYS[currentProviderIndex];
        console.log(`🔄 Using provider ${currentProviderIndex + 1}/${MISTRAL_API_KEYS.length}`);
        
        try {
          response = await fetch('https://api.mistral.ai/v1/chat/completions', {
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

          if (response.ok) {
            console.log(`✅ Provider ${currentProviderIndex + 1} succeeded`);
            break; // Success, exit the loop
          }
          
          if (response.status === 429) {
            console.log(`⚠️ Provider ${currentProviderIndex + 1} hit rate limit, switching...`);
            providerFailures.set(currentProviderIndex, Date.now());
            currentProviderIndex = (currentProviderIndex + 1) % MISTRAL_API_KEYS.length;
            continue; // Try next provider
          }
          
          // Other error, try next provider
          lastError = await response.text();
          console.log(`❌ Provider ${currentProviderIndex + 1} failed: ${response.status}`);
          currentProviderIndex = (currentProviderIndex + 1) % MISTRAL_API_KEYS.length;
          
        } catch (error) {
          console.log(`❌ Provider ${currentProviderIndex + 1} error: ${error.message}`);
          lastError = error.message;
          currentProviderIndex = (currentProviderIndex + 1) % MISTRAL_API_KEYS.length;
        }
      }
      
      // If all providers failed, try to provide a fallback response for intent parsing
      if (!response || !response.ok) {
        console.error('❌ All providers failed');
        
        // For intent parsing requests, provide a fallback response
        if (userQuery && messages && messages.length > 0) {
          const fallbackIntent = getFallbackIntent(userQuery);
          console.log(`🔄 Using fallback intent: ${fallbackIntent.intent}`);
          
          return res.status(200).json({
            id: 'fallback-response-' + Date.now(),
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: 'mistral-large-latest',
            choices: [{
              index: 0,
              message: {
                content: JSON.stringify(fallbackIntent)
              },
              finish_reason: 'stop'
            }],
            usage: {
              prompt_tokens: 0,
              completion_tokens: 0,
              total_tokens: 0
            }
          });
        }
        
        return res.status(500).json({ 
          error: 'All Mistral providers are currently unavailable. Please try again later.',
          details: lastError
        });
      }

      const data = await response.json();
      
      // Cache the response if it's an intent parsing request
      if (userQuery && data.choices?.[0]?.message?.content) {
          try {
              const content = data.choices[0].message.content;
              
              // Handle markdown-wrapped JSON responses
              let jsonContent = content.trim();
              if (jsonContent.startsWith('```json')) {
                  jsonContent = jsonContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
              } else if (jsonContent.startsWith('```')) {
                  jsonContent = jsonContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
              }
              
              console.log('Cleaned JSON content:', jsonContent);
              const parsed = JSON.parse(jsonContent);
              
              if (parsed.intent && typeof parsed.intent === 'string') {
                  console.log('✅ Caching intent response:', parsed.intent);
                  await cacheService.cacheResponse(
                      userQuery,
                      parsed.intent,
                      parsed.entities || {},
                      parsed.confidence || 0.8
                  );
              }
          } catch (e) {
              // Not a JSON response, don't cache
              console.log('❌ Not caching non-JSON response:', e.message);
          }
      }

      res.status(200).json(data);
  } catch (err) {
      console.error('❌ Mistral API error:', err.message);
      console.error('❌ Full error:', err);
      res.status(500).json({ error: err.message });
  }
});

// Cache management endpoints
app.get('/api/cache/stats', async (req, res) => {
  try {
      const stats = await cacheService.getCacheStats();
      res.json(stats);
  } catch (err) {
      res.status(500).json({ error: err.message });
  }
});

app.delete('/api/cache/clear', async (req, res) => {
  try {
      const success = await cacheService.clearCache();
      res.json({ success, message: 'Cache cleared successfully' });
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
  const server = app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
  
  // Add error handling
  server.on('error', (error) => {
    console.error('❌ Server error:', error);
  });
  
  process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  });
} 