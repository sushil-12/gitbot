#!/usr/bin/env node

import { credentialManager } from '../src/utils/credentialManager.js';
import { ProfessionalUI } from '../src/utils/ui.js';
import inquirer from 'inquirer';

const UI = new ProfessionalUI();

async function setupCredentials() {
  try {
    UI.header('GitMate - Credential Setup', 'Configure GitHub OAuth for distribution');
    
    console.log('\nThis script will help you set up GitHub OAuth credentials for distribution.\n');
    console.log('⚠️  IMPORTANT: These credentials will be encrypted and distributed with your tool.\n');
    console.log('Make sure your GitHub OAuth app is configured with:');
    console.log('• Authorization callback URL: https://gitbot-jtp2.onrender.com/auth/github/callback');
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
        message: 'Callback URL (default: https://gitbot-jtp2.onrender.com/auth/github/callback):',
        default: 'https://gitbot-jtp2.onrender.com/auth/github/callback'
      },
      {
        type: 'password',
        name: 'encryptionKey',
        message: 'Encryption Key (for securing credentials):',
        validate: input => input.length >= 16 || 'Encryption key must be at least 16 characters'
      },
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Are you sure you want to store these credentials?',
        default: false
      }
    ]);

    if (!answers.confirm) {
      console.log('\nSetup cancelled.');
      return;
    }

    // Set encryption key as environment variable
    process.env.GITBOT_ENCRYPTION_KEY = answers.encryptionKey;

    // Store credentials
    const credentials = {
      clientId: answers.clientId,
      clientSecret: answers.clientSecret,
      callbackUrl: answers.callbackUrl
    };

    await credentialManager.storeCredentials(credentials);

    UI.success('Credentials Stored', 'GitHub OAuth credentials have been encrypted and stored successfully!');
    
    console.log('\n📋 Next Steps:');
    console.log('1. Test the authentication: gitbot auth github');
    console.log('2. Build and distribute your tool');
    console.log('3. Users will be able to authenticate without setup');
    
    console.log('\n🔒 Security Notes:');
    console.log('• Credentials are encrypted with AES-256-CBC');
    console.log('• Rate limiting is enabled (100 requests/hour per user)');
    console.log('• Store your encryption key securely');
    console.log('• Consider rotating credentials periodically');

  } catch (error) {
    UI.error('Setup Failed', error.message);
    process.exit(1);
  }
}

// Run setup
setupCredentials(); 