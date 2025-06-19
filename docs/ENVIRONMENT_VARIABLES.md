# Environment Variables Guide

This document explains how environment variables work in GitMate and how they're handled when distributing the tool to other users.

## Overview

GitMate uses environment variables for configuration, but they're handled differently depending on whether you're developing the tool or using it as an end user.

## Environment Variable Types

### 1. Development Environment Variables
These are used during development and testing of the tool itself:

```bash
# AI Service Configuration
AI_PROVIDER=ollama  # or 'mistral'
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama2
OLLAMA_REQUEST_TIMEOUT=120000

# Mistral Configuration
MISTRAL_API_KEY=your_mistral_api_key_here
MISTRAL_MODEL=mistral-small
MISTRAL_REQUEST_TIMEOUT=120000

# GitHub OAuth Configuration (for development)
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_CALLBACK_URL=https://gitbot-chi.vercel.app/auth/github/callback

# Server Configuration
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
```

### 2. User Configuration Variables
These are what end users need to configure when using the tool:

```bash
# AI Provider API Key (required)
MISTRAL_API_KEY=your_mistral_api_key_here
# OR
OPENAI_API_KEY=your_openai_api_key_here
# OR
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# AI Provider Selection (optional, defaults to mistral)
AI_PROVIDER=mistral  # or 'openai', 'anthropic', 'ollama'
```

## How Environment Variables Work for Distribution

### For Tool Developers (You)

1. **Local Development**: Use `.env` file for development
2. **GitHub OAuth**: Set up GitHub OAuth app for authentication
3. **Testing**: Use local environment variables for testing

### For End Users

1. **No GitHub OAuth Setup Required**: Users don't need to set up GitHub OAuth
2. **Simple Configuration**: Users only need to set their AI provider API key
3. **Automatic Storage**: Configuration is stored locally in `~/.gitbot/`

## User Installation and Setup

### Step 1: Install the Tool
```bash
npm install -g gitbot-assistant
```

### Step 2: Configure AI Provider
Users have several options:

#### Option A: Environment Variable
```bash
export MISTRAL_API_KEY="your_api_key_here"
gitbot init
```

#### Option B: Interactive Setup
```bash
gitbot init
# The tool will prompt for API key
```

#### Option C: Manual Configuration
```bash
# Create ~/.gitbot/config.json
{
  "aiProvider": "mistral",
  "apiKey": "your_api_key_here"
}
```

### Step 3: GitHub Authentication
```bash
gitbot auth github
# Opens browser for OAuth authentication
# No manual setup required - uses your GitHub OAuth app
```

## Security Considerations

### What's Stored Locally
- AI provider API keys (encrypted in `~/.gitbot/tokens.json`)
- GitHub access tokens (encrypted in `~/.gitbot/tokens.json`)
- User preferences (in `~/.gitbot/config.json`)

### What's NOT Stored
- GitHub OAuth client secrets (only used during development)
- Raw environment variables (converted to local config)

### Encryption
- Tokens are stored with basic encryption
- Config files are stored in user's home directory
- No sensitive data is sent to external servers

## Distribution Strategy

### 1. Package Configuration
The `package.json` includes:
```json
{
  "preferGlobal": true,
  "files": [
    "bin/",
    "src/",
    "commands/",
    "README.md",
    "LICENSE"
  ]
}
```

### 2. User Experience
1. **Simple Installation**: `npm install -g gitbot-assistant`
2. **Easy Setup**: `gitbot init` guides users through configuration
3. **Secure Storage**: All sensitive data stored locally
4. **No Server Dependencies**: Works offline after initial setup

### 3. OAuth Flow
1. **Your GitHub App**: You maintain the GitHub OAuth application
2. **User Authentication**: Users authenticate through your app
3. **Token Storage**: Access tokens stored locally on user's machine
4. **No Shared Secrets**: Users don't need your OAuth secrets

## Troubleshooting

### Common Issues

#### 1. "GitHub OAuth credentials not configured"
**Solution**: This error only occurs during development. End users don't need to configure GitHub OAuth credentials.

#### 2. "AI provider not configured"
**Solution**: Run `gitbot init` to configure your AI provider.

#### 3. "Authentication failed"
**Solution**: 
- Check your internet connection
- Ensure the GitHub OAuth app is properly configured
- Try running `gitbot auth github` again

### Environment Variable Priority
1. Local config file (`~/.gitbot/config.json`)
2. Environment variables
3. Default values

## Development vs Production

### Development Mode
- Uses `.env` file
- Requires GitHub OAuth setup
- Detailed logging
- Local server for authentication

### Production Mode (End Users)
- Uses local config files
- No GitHub OAuth setup required
- Minimal logging
- Secure token storage

## Best Practices for Distribution

1. **Clear Documentation**: Provide setup instructions in README
2. **Interactive Setup**: Use `gitbot init` for guided configuration
3. **Error Handling**: Provide helpful error messages
4. **Security**: Never expose OAuth secrets to end users
5. **Updates**: Provide clear upgrade paths

## Example User Workflow

```bash
# 1. Install
npm install -g gitbot-assistant

# 2. Initialize (configures AI provider)
gitbot init

# 3. Authenticate with GitHub
gitbot auth github

# 4. Start using the tool
gitbot commit "Add new feature"
gitbot push
```

This approach ensures that:
- Users have a simple setup experience
- Your OAuth credentials remain secure
- The tool works reliably across different environments
- Configuration is stored securely on the user's machine 