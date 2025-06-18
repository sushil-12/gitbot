#!/usr/bin/env node

import crypto from 'crypto';
import inquirer from 'inquirer';
import { ProfessionalUI } from '../src/utils/ui.js';

const UI = new ProfessionalUI();

async function generateDistributionCredentials() {
  try {
    UI.header('GitMate - Distribution Credentials Generator', 'Generate encrypted credentials for distribution');
    
    console.log('\nThis script will help you generate encrypted GitHub OAuth credentials\n');
    console.log('⚠️  IMPORTANT: These credentials will be included in the distributed package.\n');
    console.log('Make sure your GitHub OAuth app is configured with:');
    console.log('• Authorization callback URL: http://localhost:3000/auth/github/callback');
    console.log('• Required scopes: user, repo\n');

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'clientId',
        message: 'GitHub OAuth Client ID:',
        validate: input => input.trim() !== '' || 'Client ID is required'
      },
      {
        type: 'password',
        name: 'clientSecret',
        message: 'GitHub OAuth Client Secret:',
        validate: input => input.trim() !== '' || 'Client Secret is required'
      },
      {
        type: 'input',
        name: 'callbackUrl',
        message: 'Callback URL (default: http://localhost:3000/auth/github/callback):',
        default: 'http://localhost:3000/auth/github/callback'
      },
      {
        type: 'password',
        name: 'encryptionKey',
        message: 'Encryption Key (for securing credentials):',
        validate: input => input.length >= 16 || 'Encryption key must be at least 16 characters'
      }
    ]);

    // Encrypt the credentials
    const credentials = {
      clientId: answers.clientId,
      clientSecret: answers.clientSecret,
      callbackUrl: answers.callbackUrl
    };

    const key = crypto.scryptSync(answers.encryptionKey, 'gitbot-salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher('aes-256-cbc', key);
    let encrypted = cipher.update(JSON.stringify(credentials), 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const encryptedData = {
      iv: iv.toString('hex'),
      data: encrypted
    };

    // Generate the updated defaultCredentials.js content
    const credentialsContent = `// Default GitHub OAuth credentials for distribution
// These are encrypted and will be used by all users of the tool

export const DEFAULT_CREDENTIALS = {
  // Encrypted GitHub OAuth credentials
  // Format: { iv: "hex", data: "encrypted_hex" }
  encrypted: ${JSON.stringify(encryptedData, null, 2)},
  
  // Encryption key (should be obfuscated in production)
  encryptionKey: "${answers.encryptionKey}",
  
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
    const key = crypto.scryptSync(DEFAULT_CREDENTIALS.encryptionKey, 'gitbot-salt', 32);
    const decipher = crypto.createDecipher('aes-256-cbc', key);
    let decrypted = decipher.update(DEFAULT_CREDENTIALS.encrypted.data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  } catch (error) {
    // Fallback to environment variables for development
    return {
      clientId: process.env.GITHUB_CLIENT_ID || "your_github_client_id",
      clientSecret: process.env.GITHUB_CLIENT_SECRET || "your_github_client_secret", 
      callbackUrl: process.env.GITHUB_CALLBACK_URL || "http://localhost:3000/auth/github/callback"
    };
  }
}`;

    console.log('\n✅ Credentials encrypted successfully!');
    console.log('\n📋 Next Steps:');
    console.log('1. Replace the content of src/config/defaultCredentials.js with:');
    console.log('\n' + '='.repeat(60));
    console.log(credentialsContent);
    console.log('='.repeat(60));
    
    console.log('\n2. Add the crypto import at the top of the file:');
    console.log('import crypto from "crypto";');
    
    console.log('\n3. Test the authentication:');
    console.log('gitbot auth github');
    
    console.log('\n4. Build and publish your package:');
    console.log('npm publish');
    
    console.log('\n🔒 Security Notes:');
    console.log('• Credentials are encrypted with AES-256-CBC');
    console.log('• Store your encryption key securely');
    console.log('• Consider rotating credentials periodically');
    console.log('• Monitor GitHub OAuth app usage');

  } catch (error) {
    UI.error('Generation Failed', error.message);
    process.exit(1);
  }
}

// Run generator
generateDistributionCredentials(); 