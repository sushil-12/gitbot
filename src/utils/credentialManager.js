import crypto from 'crypto';
import fs from 'fs/promises';
import { join } from 'path';
import { logger } from './logger.js';
import { DEFAULT_CREDENTIALS, getCredentialsForUser } from '../config/defaultCredentials.js';

const serviceName = 'CredentialManager';

class CredentialManager {
  constructor() {
    this.configDir = join(process.env.HOME || process.env.USERPROFILE, '.gitmate');
    this.credentialsPath = join(this.configDir, 'credentials.enc');
    this.rateLimitPath = join(this.configDir, 'rate_limit.json');
    this.encryptionKey = this.getEncryptionKey();
  }

  /**
   * Get encryption key from environment or generate a secure one
   */
  getEncryptionKey() {
    // In production, this should come from environment variables
    // For development, we'll use a fallback
    const envKey = process.env.GITMATE_ENCRYPTION_KEY;
    if (envKey) {
      return crypto.scryptSync(envKey, 'gitmate-salt', 32);
    }
    
    // Fallback for development - in production this should be set
    return crypto.scryptSync('gitmate-development-key', 'gitmate-salt', 32);
  }

  /**
   * Encrypt sensitive data
   */
  encrypt(data) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-cbc', this.encryptionKey);
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return {
      iv: iv.toString('hex'),
      data: encrypted
    };
  }

  /**
   * Decrypt sensitive data
   */
  decrypt(encryptedData) {
    try {
      const decipher = crypto.createDecipher('aes-256-cbc', this.encryptionKey);
      let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return JSON.parse(decrypted);
    } catch (error) {
      logger.error('Failed to decrypt credentials:', { error: error.message, service: serviceName });
      return null;
    }
  }

  /**
   * Store encrypted credentials
   */
  async storeCredentials(credentials) {
    try {
      await this.ensureConfigDir();
      const encrypted = this.encrypt(credentials);
      await fs.writeFile(this.credentialsPath, JSON.stringify(encrypted));
      logger.info('Credentials stored securely', { service: serviceName });
    } catch (error) {
      logger.error('Failed to store credentials:', { error: error.message, service: serviceName });
      throw error;
    }
  }

  /**
   * Retrieve encrypted credentials
   */
  async getCredentials() {
    try {
      // First try to get local credentials
      const encryptedData = await fs.readFile(this.credentialsPath, 'utf8');
      const encrypted = JSON.parse(encryptedData);
      return this.decrypt(encrypted);
    } catch (error) {
      // If no local credentials, use default credentials from package
      logger.info('No local credentials found, using default credentials', { service: serviceName });
      return getCredentialsForUser();
    }
  }

  /**
   * Check if credentials exist
   */
  async hasCredentials() {
    try {
      // First check for local credentials
      await fs.access(this.credentialsPath);
      const credentials = await this.getCredentials();
      return credentials && credentials.clientId && credentials.clientSecret;
    } catch (error) {
      // If no local credentials, check if default credentials are available
      const defaultCredentials = getCredentialsForUser();
      return defaultCredentials && defaultCredentials.clientId && defaultCredentials.clientSecret;
    }
  }

  /**
   * Ensure config directory exists
   */
  async ensureConfigDir() {
    try {
      await fs.access(this.configDir);
    } catch (error) {
      await fs.mkdir(this.configDir, { recursive: true });
    }
  }

  /**
   * Rate limiting implementation
   */
  async checkRateLimit(userId = 'default') {
    try {
      await this.ensureConfigDir();
      
      let rateLimitData = {};
      try {
        const rateLimitContent = await fs.readFile(this.rateLimitPath, 'utf8');
        rateLimitData = JSON.parse(rateLimitContent);
      } catch (error) {
        // File doesn't exist, start fresh
      }

      const now = Date.now();
      const windowMs = 60 * 60 * 1000; // 1 hour
      const maxRequests = 100; // Max requests per hour per user

      // Clean old entries
      Object.keys(rateLimitData).forEach(key => {
        if (now - rateLimitData[key].timestamp > windowMs) {
          delete rateLimitData[key];
        }
      });

      // Check current user's rate limit
      if (!rateLimitData[userId]) {
        rateLimitData[userId] = {
          count: 0,
          timestamp: now
        };
      }

      if (now - rateLimitData[userId].timestamp > windowMs) {
        // Reset window
        rateLimitData[userId] = {
          count: 0,
          timestamp: now
        };
      }

      if (rateLimitData[userId].count >= maxRequests) {
        const timeLeft = Math.ceil((windowMs - (now - rateLimitData[userId].timestamp)) / 1000 / 60);
        throw new Error(`Rate limit exceeded. Please try again in ${timeLeft} minutes.`);
      }

      // Increment count
      rateLimitData[userId].count++;

      // Save updated rate limit data
      await fs.writeFile(this.rateLimitPath, JSON.stringify(rateLimitData, null, 2));

      return true;
    } catch (error) {
      logger.error('Rate limit check failed:', { error: error.message, service: serviceName });
      throw error;
    }
  }

  /**
   * Get rate limit info for a user
   */
  async getRateLimitInfo(userId = 'default') {
    try {
      const rateLimitContent = await fs.readFile(this.rateLimitPath, 'utf8');
      const rateLimitData = JSON.parse(rateLimitContent);
      
      if (rateLimitData[userId]) {
        const now = Date.now();
        const windowMs = 60 * 60 * 1000;
        const timeLeft = Math.max(0, windowMs - (now - rateLimitData[userId].timestamp));
        
        return {
          count: rateLimitData[userId].count,
          maxRequests: 100,
          timeLeft: Math.ceil(timeLeft / 1000 / 60)
        };
      }
      
      return {
        count: 0,
        maxRequests: 100,
        timeLeft: 60
      };
    } catch (error) {
      return {
        count: 0,
        maxRequests: 100,
        timeLeft: 60
      };
    }
  }

  /**
   * Initialize with default credentials (for development)
   */
  async initializeDefaultCredentials() {
    // This should only be used during development
    // In production, credentials should be set up by the developer
    const defaultCredentials = {
      clientId: process.env.GITHUB_CLIENT_ID || 'your_github_client_id',
      clientSecret: process.env.GITHUB_CLIENT_SECRET || 'your_github_client_secret',
      callbackUrl: process.env.GITHUB_CALLBACK_URL || 'http://localhost:3000/auth/github/callback'
    };

    if (defaultCredentials.clientId !== 'your_github_client_id') {
      await this.storeCredentials(defaultCredentials);
      logger.info('Default credentials initialized', { service: serviceName });
      return true;
    }

    return false;
  }
}

// Create singleton instance
const credentialManager = new CredentialManager();

export { credentialManager };
export default credentialManager; 