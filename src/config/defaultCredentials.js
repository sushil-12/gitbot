import crypto from 'crypto';

// Default GitHub OAuth credentials for distribution
// These are encrypted and will be used by all users of the tool

export const DEFAULT_CREDENTIALS = {
  // Encrypted GitHub OAuth credentials
  // Format: { iv: "hex", data: "encrypted_hex" }
  encrypted: {
    iv: "your_encryption_iv_here",
    data: "your_encrypted_credentials_here"
  },
  
  // Encryption key (should be obfuscated in production)
  encryptionKey: "gitmate-distribution-key-2024",
  
  // Rate limiting configuration
  rateLimit: {
    maxRequests: 100,
    windowMs: 60 * 60 * 1000 // 1 hour
  }
};

// Function to get credentials for the current user
export function getCredentialsForUser() {
  try {
    // Decrypt the credentials
    const key = crypto.scryptSync(DEFAULT_CREDENTIALS.encryptionKey, 'gitmate-salt', 32);
    const decipher = crypto.createDecipher('aes-256-cbc', key);
    let decrypted = decipher.update(DEFAULT_CREDENTIALS.encrypted.data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  } catch (error) {
    // Fallback to environment variables for development
    return {
      clientId: process.env.GITHUB_CLIENT_ID || "your_github_client_id",
      clientSecret: process.env.GITHUB_CLIENT_SECRET || "your_github_client_secret", 
      callbackUrl: process.env.GITHUB_CALLBACK_URL || "https://gitbot-chi.vercel.app/auth/github/callback"
    };
  }
} 