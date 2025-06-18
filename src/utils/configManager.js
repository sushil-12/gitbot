import { join } from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config();

class ConfigManager {
  constructor() {
    this.configDir = join(process.env.HOME || process.env.USERPROFILE, '.gitmate');
    this.configPath = join(this.configDir, 'config.json');
    this.tokensPath = join(this.configDir, 'tokens.json');
  }

  async ensureConfigDir() {
    try {
      await fs.access(this.configDir);
    } catch (error) {
      await fs.mkdir(this.configDir, { recursive: true });
    }
  }

  async loadConfig() {
    try {
      await this.ensureConfigDir();
      const configData = await fs.readFile(this.configPath, 'utf8');
      return JSON.parse(configData);
    } catch (error) {
      // If no local config exists, return default config from environment
      return this.getDefaultConfig();
    }
  }

  getDefaultConfig() {
    return {
      aiProvider: 'mistral',
      apiKey: process.env.MISTRAL_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY,
      version: '1.0.0',
      createdAt: new Date().toISOString()
    };
  }

  async saveConfig(config) {
    await this.ensureConfigDir();
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
  }

  async getConfig(key) {
    const config = await this.loadConfig();
    return config ? config[key] : null;
  }

  async setConfig(key, value) {
    const config = await this.loadConfig() || {};
    config[key] = value;
    await this.saveConfig(config);
  }

  async loadTokens() {
    try {
      await this.ensureConfigDir();
      const tokensData = await fs.readFile(this.tokensPath, 'utf8');
      return JSON.parse(tokensData);
    } catch (error) {
      return {};
    }
  }

  async saveTokens(tokens) {
    await this.ensureConfigDir();
    await fs.writeFile(this.tokensPath, JSON.stringify(tokens, null, 2));
  }

  async getToken(key) {
    const tokens = await this.loadTokens();
    return tokens[key] || null;
  }

  async setToken(key, value) {
    const tokens = await this.loadTokens();
    tokens[key] = value;
    await this.saveTokens(tokens);
  }

  async clearToken(key) {
    const tokens = await this.loadTokens();
    delete tokens[key];
    await this.saveTokens(tokens);
  }

  async clearAllTokens() {
    await this.saveTokens({});
  }

  async getConfigPath() {
    return this.configPath;
  }

  async getTokensPath() {
    return this.tokensPath;
  }

  async isConfigured() {
    const config = await this.loadConfig();
    return config && config.apiKey && config.aiProvider;
  }

  async getAIProvider() {
    return await this.getConfig('aiProvider') || 'mistral';
  }

  async getAPIKey() {
    return await this.getConfig('apiKey');
  }

  async updateAIProvider(provider) {
    await this.setConfig('aiProvider', provider);
  }

  async updateAPIKey(apiKey) {
    await this.setConfig('apiKey', apiKey);
  }

  // Convenience methods for auth server
  async set(key, value) {
    if (key.startsWith('github.')) {
      // Store GitHub tokens separately
      const tokenKey = key.replace('github.', '');
      await this.setToken(`github_${tokenKey}`, value);
    } else {
      await this.setConfig(key, value);
    }
  }

  async get(key) {
    if (key.startsWith('github.')) {
      // Retrieve GitHub tokens separately
      const tokenKey = key.replace('github.', '');
      return await this.getToken(`github_${tokenKey}`);
    } else {
      return await this.getConfig(key);
    }
  }
}

// Export the class for use in other modules
export { ConfigManager };

// Export default instance
export default new ConfigManager(); 