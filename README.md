# GitBot: AI-Powered Git & GitHub Assistant

GitBot is an intelligent command-line and server-based assistant designed to streamline your Git and GitHub workflows. It leverages AI (Ollama LLM) for natural language understanding and task automation, making repository management, code operations, and GitHub interactions more intuitive.

## Features

*   **GitHub OAuth Authentication:** Securely connect to your GitHub account.
*   **GitHub API Integration:**
    *   Create and list repositories.
    *   Push code to new or existing repositories.
    *   Manage branches and pull requests.
    *   Handle repository permissions (future).
*   **Natural Language Processing (NLP):** Use plain English commands via Ollama (LLaMA 3 or Mistral) to interact with Git and GitHub.
*   **Local Git Operations:** Powered by `simple-git` for:
    *   Initializing repositories.
    *   Adding, committing, and pushing changes.
    *   Pulling, merging, and rebasing.
    *   Basic AI-assisted merge conflict suggestions (future).
*   **Modular Architecture:** Organized into `src/` (services, controllers, utils, models), `commands/` (CLI), `ai/` (LLM logic), `routes/` (API), and `auth/` (OAuth).
*   **Secure Token Management:** Access tokens are stored securely (e.g., using `.env` or an encrypted local store).
*   **Logging and Error Handling:** Robust logging and error management for easier debugging.
*   **AI-Assisted .gitignore Generation:** (Future)
*   **Extensible Design:** Built with future support for GitLab, Gitea, and other platforms in mind.

**Bonus Features (Planned):**

*   Automatic commit message generation from diffs.
*   Daily commit reminders.
*   Visual commit tree preview.

## Project Structure

```
gitbot/
├── ai/                     # LLM logic, intent recognition
│   └── .gitkeep
├── auth/                   # GitHub OAuth flow (Express.js)
│   └── .gitkeep
├── commands/               # CLI command handlers
│   └── .gitkeep
├── routes/                 # API routes (if an HTTP server is exposed)
│   └── .gitkeep
├── src/                    # Core application logic
│   ├── controllers/        # Request handlers, business logic
│   │   └── .gitkeep
│   ├── models/             # Data models/schemas
│   │   └── .gitkeep
│   ├── services/           # External service integrations (GitHub API, Git CLI)
│   │   └── .gitkeep
│   ├── utils/              # Utility functions (logging, error handling)
│   │   └── .gitkeep
│   ├── cli.js              # CLI entry point
│   └── index.js            # Main application entry point (server)
├── .env.example            # Example environment variables
├── .gitignore              # Files and directories to ignore
├── package.json            # Project metadata and dependencies
└── README.md               # This file
```

## Prerequisites

*   [Node.js](https://nodejs.org/) (v18.x or later recommended)
*   [npm](https://www.npmjs.com/) (usually comes with Node.js)
*   [Git](https://git-scm.com/)
*   [Ollama](https://ollama.com/) installed and running with a model like LLaMA 3 or Mistral.

## Setup

1.  **Clone the repository (or create the project manually based on this README):**
    ```bash
    git clone <repository-url> # Or your manual setup
    cd gitbot
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up GitHub OAuth Application:**
    *   Go to your GitHub [Developer settings](https://github.com/settings/developers).
    *   Click "New OAuth App".
    *   **Application name:** `GitBot` (or your preferred name)
    *   **Homepage URL:** `http://localhost:3000` (or your server's URL)
    *   **Authorization callback URL:** `http://localhost:3000/auth/github/callback`
    *   Click "Register application".
    *   Note the **Client ID** and **Client Secret**.

4.  **Configure Environment Variables:**
    Create a `.env` file in the project root by copying `.env.example` (which you'll create soon):
    ```bash
    cp .env.example .env
    ```
    Open `.env` and fill in the values:
    ```env
    NODE_ENV=development
    PORT=3000

    # GitHub OAuth App Credentials
    GITHUB_CLIENT_ID=your_github_client_id
    GITHUB_CLIENT_SECRET=your_github_client_secret
    GITHUB_CALLBACK_URL=http://localhost:3000/auth/github/callback

    # Ollama Configuration
    OLLAMA_BASE_URL=http://localhost:11434 # Default Ollama API URL
    OLLAMA_MODEL=llama3 # Or your preferred model (e.g., mistral)

    # Secure storage for tokens (e.g., encryption key if using local JSON)
    TOKEN_STORE_PATH=./data/tokens.json
    TOKEN_ENCRYPTION_KEY=a_very_strong_and_random_secret_key_32_chars

    # Logging
    LOG_LEVEL=info
    ```

5.  **Initialize Local Data Storage (if applicable):**
    If using a local JSON file for token storage, create the `data` directory:
    ```bash
    mkdir data
    ```

## Usage

### Running the Server (for OAuth and potential API)

The server handles the GitHub OAuth flow and may expose other API endpoints in the future.

```bash
npm start
```

Or for development with auto-reloading:

```bash
npm run dev
```

The server will typically run on `http://localhost:3000`.

### Using the CLI

The CLI allows you to interact with GitBot using commands or natural language.

1.  **Authenticate (if not already done via server):**
    The first time you use a command requiring GitHub access, you might be prompted to authenticate. This usually involves visiting a URL in your browser.

2.  **Example CLI Commands (Conceptual):**
    ```bash
    # Using direct commands
    node src/cli.js repo create my-new-repo --private
    node src/cli.js repo list
    node src/cli.js push "Initial commit"

    # Using natural language (powered by Ollama)
    node src/cli.js "create a new private repository named 'my-project'"
    node src/cli.js "list all my repositories"
    node src/cli.js "push my current changes with message 'feat: add login page'"
    node src/cli.js "create a new branch called 'feature/user-auth'"
    ```

### Authentication Flow

1.  When a GitHub action is required, the bot will check for a valid access token.
2.  If no token exists or it's invalid, the user will be directed to the GitHub authorization URL (either via CLI link or browser redirect if using the server).
3.  User authorizes the GitBot application on GitHub.
4.  GitHub redirects the user to the `GITHUB_CALLBACK_URL` (`/auth/github/callback`).
5.  The server at this callback URL receives an authorization code.
6.  The server exchanges this code for an access token with GitHub.
7.  The access token is securely stored (e.g., in an encrypted local JSON file or `.env` for simplicity, though `.env` is less secure for user-specific tokens).

## Development

*   **Linting & Formatting:** (To be configured - e.g., ESLint, Prettier)
*   **Testing:** (To be configured - e.g., Jest, Mocha)

## Key Technologies

*   **Node.js:** Runtime environment.
*   **Express.js:** Web framework for OAuth and API routes.
*   **simple-git:** For local Git operations.
*   **axios:** For making HTTP requests to GitHub API and Ollama.
*   **dotenv:** For managing environment variables.
*   **winston:** For logging.
*   **Ollama (LLaMA 3 / Mistral):** For natural language processing and AI features.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

This project is licensed under the ISC License. See the `LICENSE` file for details (you'll need to create this file if you want a specific license).