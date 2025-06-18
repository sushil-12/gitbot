import express from 'express';
import session from 'express-session';
import passport from 'passport';
import GitHubStrategy from 'passport-github2';

const app = express();

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
  const callbackURL = process.env.GITHUB_CALLBACK_URL || 'https://your-domain.vercel.app/auth/github/callback';
  
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
    
    // Send success response with token data
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>GitMate Authentication</title>
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
        <script>
          // Send token data to parent window if opened from CLI
          if (window.opener) {
            window.opener.postMessage({
              type: 'GITHUB_AUTH_SUCCESS',
              data: {
                accessToken: '${user.accessToken}',
                refreshToken: '${user.refreshToken}',
                user: {
                  id: '${user.id}',
                  username: '${user.username}',
                  displayName: '${user.displayName}',
                  email: '${user.email}'
                }
              }
            }, '*');
          }
        </script>
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

// Initialize passport
setupPassport();

// Export for Vercel
export default app; 