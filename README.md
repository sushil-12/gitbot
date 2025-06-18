# GitMate 🤖

[![npm version](https://badge.fury.io/js/gitmate.svg)](https://badge.fury.io/js/gitmate)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Professional Git workflow automation powered by AI. Streamline your development process with natural language commands and intelligent automation.

## ✨ Features

- **Natural Language Commands**: Use plain English to execute Git operations
- **AI-Powered Commit Messages**: Generate meaningful commit messages automatically
- **Smart Branch Management**: Create and manage branches with intelligent suggestions
- **Repository Operations**: Create, clone, and manage GitHub repositories
- **Intelligent Workflows**: Automate complex Git workflows with AI assistance
- **Multiple AI Providers**: Support for OpenAI, Anthropic, and Mistral
- **GitHub Integration**: Seamless GitHub authentication and repository management

## 🚀 Quick Start

### Installation

```bash
npm install -g sushil-gitmate
```

### Option 1: Quick Start (Recommended)

Set your AI provider API key and start using GitMate immediately:

```bash
# Set your AI provider (Mistral, OpenAI, or Anthropic)
export AI_PROVIDER=mistral
export MISTRAL_API_KEY=your_api_key_here

# Start using natural language commands
gitmate "commit my changes"
gitmate "push to main"
```

### Option 2: Interactive Setup

```bash
gitmate init
```

This will guide you through:
- AI provider selection (Mistral, OpenAI, or Anthropic)
- API key configuration

## 📦 Installation

```bash
npm install -g sushil-gitmate
```

## 🎯 Quick Start

1. **Initialize Configuration**
   ```bash
   gitmate init
   ```

2. **Authenticate with GitHub**
   ```bash
   gitmate auth github
   ```

3. **Start Using Natural Language Commands**
   ```bash
   gitmate "push my changes to main"
   gitmate "create a new branch called feature-x"
   gitmate "commit with message 'fix bug'"
   ```

## 📖 Usage

### Natural Language Commands

GitMate Assistant understands natural language commands:

```bash
# Push changes
gitmate "push my changes to main"
gitmate "push with commit message 'update feature'"
gitmate "force push to main"

# Branch management
gitmate "create a new branch called feature-x"
gitmate "switch to main branch"
gitmate "list all branches"

# Commit operations
gitmate "commit with message 'fix bug'"
gitmate "commit all changes"
gitmate "revert last commit"

# Repository management
gitmate "create a new private repository called my-project"
gitmate "list my repositories"
```

### Traditional Commands

You can also use traditional command syntax:

```bash
# Repository management
gitmate repo create my-project --private
gitmate repo list --type=owner

# Git operations
gitmate git status
gitmate git add .
gitmate git commit -m "update"

# AI-powered features
gitmate generate-commit-message
gitmate generate-gitignore "Node.js project with TypeScript"
gitmate switch-ai-provider anthropic
```

## ⚙️ Configuration

### Initial Setup

Run the initialization command to set up your configuration:

```bash
gitmate init
```

This will guide you through:
- AI provider selection (Mistral, OpenAI, or Anthropic)
- API key configuration
- GitHub authentication setup

### Configuration Management

```bash
# View current configuration
gitmate config --show

# Reset configuration
gitmate config --reset

# Update AI provider
gitmate config --ai-provider openai
gitmate config --ai-provider anthropic

# Update API key
gitmate config --api-key YOUR_API_KEY
```

## 🔧 Commands Reference

### Core Commands

| Command | Description |
|---------|-------------|
| `gitmate init` | Initialize GitMate configuration |
| `gitmate config [options]` | Manage configuration settings |
| `gitmate auth <provider>` | Authenticate with external services |
| `gitmate logout` | Clear stored authentication tokens |

### Repository Commands

| Command | Description |
|---------|-------------|
| `gitmate repo create <name>` | Create a new GitHub repository |
| `gitmate repo list` | List your GitHub repositories |
| `gitmate repo create <name> --private` | Create a private repository |
| `gitmate repo create <name> --description "desc"` | Create repository with description |

### Git Operations

| Command | Description |
|---------|-------------|
| `gitmate git status` | Show Git status |
| `gitmate git add <files>` | Stage files |
| `gitmate git commit -m "message"` | Commit changes |
| `gitmate git push` | Push changes |

### AI-Powered Features

| Command | Description |
|---------|-------------|
| `gitmate generate-commit-message` | Generate commit message from changes |
| `gitmate generate-gitignore <description>` | Generate .gitignore file |
| `gitmate switch-ai-provider <provider>` | Switch between AI providers |

## 💡 Examples

### Complete Development Workflow

```bash
# 1. Create a new feature branch
gitmate "create a new branch called feature-user-auth"

# 2. Make changes and commit
gitmate "commit with message 'add user authentication'"

# 3. Push changes
gitmate "push my changes to feature-user-auth"

# 4. Create pull request
gitmate "create merge request from feature-user-auth to main"
```

### Repository Creation

```bash
# Create a new private repository
gitmate "create a new private repository called my-secret-project"

# Create with description
gitmate repo create my-project --description "My awesome project"
```

### Advanced Operations

```bash
# Force push with backup
gitmate "force push to main with backup branch creation"

# Generate commit message from diff
gitmate generate-commit-message

# Generate .gitignore for specific project
gitmate generate-gitignore "React TypeScript project with Vite"
```

## 🔐 Authentication

### GitHub Authentication

1. Run the authentication command:
   ```bash
   gitmate auth github
   ```

2. Follow the browser prompts to authorize GitMate Assistant

3. Your GitHub token will be securely stored for future use

### AI Provider Setup

You'll need an API key from either OpenAI or Anthropic:

- **OpenAI**: Get your API key from [OpenAI Platform](https://platform.openai.com/api-keys)
- **Anthropic**: Get your API key from [Anthropic Console](https://console.anthropic.com/)

## 🛠️ Development

### Prerequisites

- Node.js 18+
- Git
- GitHub Account
- AI Provider API Key

### Local Development

```bash
# Clone the repository
git clone https://github.com/yourusername/gitmate.git
cd gitmate

# Install dependencies
npm install

# Link for local development
npm link

# Run in development mode
npm run dev
```

### Testing

```bash
# Run tests
npm test

# Run linting
npm run lint

# Format code
npm run format
```

## 📁 Project Structure

```
gitmate/
├── bin/
│   └── gitmate.js          # CLI entry point
├── src/
│   ├── services/          # Core services
│   ├── utils/             # Utility functions
│   └── server/            # Authentication server
├── commands/              # Command handlers
├── docs/                  # Documentation
└── package.json
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: [Full Documentation](https://github.com/yourusername/gitmate/wiki)
- **Issues**: [GitHub Issues](https://github.com/yourusername/gitmate/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/gitmate/discussions)

## 🙏 Acknowledgments

- Built with ❤️ for the developer community
- Powered by OpenAI GPT and Anthropic Claude
- Inspired by the need for better Git workflow automation

---

**Made with ❤️ by [Your Name]**