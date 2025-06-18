# Distribution Setup Guide

This guide explains how to set up GitMate for distribution with pre-configured GitHub OAuth credentials.

## Overview

GitMate is designed to provide a seamless experience for end users by including pre-configured GitHub OAuth credentials. This eliminates the need for users to set up their own OAuth applications.

## Security Features

- **Encrypted Credentials**: All OAuth credentials are encrypted using AES-256-CBC
- **Rate Limiting**: Built-in rate limiting (100 requests/hour per user)
- **Secure Storage**: Credentials stored in user's local directory
- **No Shared Secrets**: Users never see the actual OAuth secrets

## Setup Process

### Step 1: Create GitHub OAuth Application

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Fill in the details:
   - **Application name**: GitBot Assistant
   - **Homepage URL**: `https://github.com/yourusername/gitbot-assistant`
   - **Authorization callback URL**: `http://localhost:3000/auth/github/callback`
4. Click "Register application"
5. Note down the **Client ID** and **Client Secret**

### Step 2: Configure Credentials

Run the setup script to securely store your OAuth credentials:

```bash
npm run setup-credentials
```

This will prompt you for:
- GitHub OAuth Client ID
- GitHub OAuth Client Secret
- Callback URL (defaults to `http://localhost:3000/auth/github/callback`)
- Encryption key (minimum 16 characters)

### Step 3: Test Authentication

Test that the credentials work correctly:

```bash
gitbot auth github
```

This should:
1. Start the authentication server
2. Open your browser
3. Redirect to GitHub for authorization
4. Complete the OAuth flow

### Step 4: Build and Distribute

Once tested, you can build and distribute your tool:

```bash
npm publish
```

## User Experience

### For End Users

Users will have a seamless experience:

1. **Install**: `npm install -g gitbot-assistant`
2. **Initialize**: `gitbot init` (configures AI provider only)
3. **Authenticate**: `gitbot auth github` (uses your pre-configured credentials)
4. **Use**: Start using natural language Git commands

### No Setup Required

Users don't need to:
- Create GitHub OAuth applications
- Configure OAuth credentials
- Set up authentication servers
- Handle OAuth flows manually

## Security Considerations

### Credential Protection

- Credentials are encrypted with AES-256-CBC
- Encryption key should be kept secure
- Consider rotating credentials periodically
- Monitor GitHub OAuth app usage

### Rate Limiting

- 100 requests per hour per user
- Prevents abuse of your OAuth credentials
- Configurable in `credentialManager.js`

### Distribution Security

- Never commit encryption keys to version control
- Use environment variables for encryption keys in production
- Consider using a secrets management service

## Configuration Files

### Credential Storage

Credentials are stored in:
- **Path**: `~/.gitbot/credentials.enc`
- **Format**: Encrypted JSON
- **Access**: Local user only

### Rate Limit Storage

Rate limiting data is stored in:
- **Path**: `~/.gitbot/rate_limit.json`
- **Format**: Plain JSON (non-sensitive)
- **Purpose**: Track usage per user

## Environment Variables

### For Development

```bash
# GitHub OAuth (for development only)
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
GITHUB_CALLBACK_URL=http://localhost:3000/auth/github/callback

# Encryption (for production)
GITBOT_ENCRYPTION_KEY=your_secure_encryption_key
```

### For Production

```bash
# Only encryption key is needed
GITBOT_ENCRYPTION_KEY=your_secure_encryption_key
```

## Troubleshooting

### Common Issues

#### 1. "GitHub OAuth credentials not available"
**Solution**: Run `npm run setup-credentials` to configure credentials.

#### 2. "Rate limit exceeded"
**Solution**: Wait for the rate limit window to reset (1 hour).

#### 3. "Authentication failed"
**Solution**: 
- Check GitHub OAuth app configuration
- Verify callback URL matches
- Ensure required scopes are set

#### 4. "Encryption key not found"
**Solution**: Set the `GITBOT_ENCRYPTION_KEY` environment variable.

### Monitoring

Monitor your GitHub OAuth app:
- Check usage in GitHub Developer Settings
- Review rate limiting logs
- Monitor for unusual activity

## Best Practices

### For Developers

1. **Secure Encryption**: Use a strong, unique encryption key
2. **Regular Rotation**: Rotate OAuth credentials periodically
3. **Monitoring**: Monitor OAuth app usage and rate limits
4. **Documentation**: Provide clear setup instructions for users

### For Distribution

1. **Testing**: Thoroughly test authentication before distribution
2. **Documentation**: Provide clear user documentation
3. **Support**: Be prepared to help users with authentication issues
4. **Updates**: Plan for credential rotation and updates

## Example Workflow

### Developer Setup

```bash
# 1. Create GitHub OAuth app
# 2. Configure credentials
npm run setup-credentials

# 3. Test authentication
gitbot auth github

# 4. Build and publish
npm publish
```

### User Experience

```bash
# 1. Install tool
npm install -g gitbot-assistant

# 2. Initialize (AI provider only)
gitbot init

# 3. Authenticate (uses pre-configured credentials)
gitbot auth github

# 4. Use the tool
gitbot "commit my changes"
gitbot "push to main"
```

This approach ensures:
- **Seamless User Experience**: No OAuth setup required
- **Security**: Encrypted credentials with rate limiting
- **Maintainability**: Centralized credential management
- **Scalability**: Works for any number of users 