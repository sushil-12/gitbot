import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import logger from './logger.js';

dotenv.config();

const TOKEN_STORE_PATH = process.env.TOKEN_STORE_PATH || './data/tokens.enc';
const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY; // Must be 32 bytes for aes-256-cbc

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // For AES, this is always 16

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length < 32) {
  logger.error(
    'TOKEN_ENCRYPTION_KEY is missing or too short in .env. It must be at least 32 characters long for aes-256-cbc.',
    { service: 'TokenManager' }
  );
  // For a real application, you might throw an error here or have a more robust key management strategy.
  // For this example, we'll log and proceed, but encryption/decryption will likely fail or be insecure.
}
// Ensure the key is exactly 32 bytes for aes-256-cbc
const key = crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest('base64').substring(0, 32);


async function ensureDataDirectoryExists() {
  try {
    const dirname = path.dirname(TOKEN_STORE_PATH);
    await fs.mkdir(dirname, { recursive: true });
  } catch (error) {
    logger.error(`Error creating data directory ${path.dirname(TOKEN_STORE_PATH)}:`, { message: error.message, service: 'TokenManager' });
    // Depending on the error, you might want to re-throw or handle it
  }
}

function encrypt(text) {
  if (!text) return null;
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(key), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  } catch (error) {
    logger.error('Encryption failed:', { message: error.message, service: 'TokenManager' });
    return null; // Or throw error
  }
}

function decrypt(text) {
  if (!text) return null;
  try {
    const textParts = text.split(':');
    if (textParts.length !== 2) {
        logger.error('Invalid encrypted text format for decryption.', { service: 'TokenManager' });
        return null;
    }
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(key), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (error) {
    logger.error('Decryption failed:', { message: error.message, service: 'TokenManager' });
    return null; // Or throw error
  }
}

export async function storeToken(tokenName, tokenValue) {
  await ensureDataDirectoryExists();
  let tokens = {};
  try {
    const data = await fs.readFile(TOKEN_STORE_PATH, 'utf8');
    const decryptedData = decrypt(data);
    if (decryptedData) {
      tokens = JSON.parse(decryptedData);
    } else if (data) { // If data exists but decryption failed (e.g. unencrypted old file)
        logger.warn('Token file exists but could not be decrypted. Overwriting with new encrypted data.', { service: 'TokenManager' });
        // Potentially back up the old file here before overwriting
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger.error('Error reading token store:', { message: error.message, service: 'TokenManager' });
    }
    // If file doesn't exist or is unreadable/corrupt, we start with an empty tokens object
  }

  if (tokenValue === null || tokenValue === undefined) {
    delete tokens[tokenName];
    logger.info(`Token '${tokenName}' removed.`, { service: 'TokenManager' });
  } else {
    tokens[tokenName] = tokenValue; // Store the raw token, will be encrypted when writing the whole file
    logger.info(`Token '${tokenName}' prepared for storage.`, { service: 'TokenManager' });
  }

  try {
    const encryptedTokens = encrypt(JSON.stringify(tokens));
    if (encryptedTokens) {
      await fs.writeFile(TOKEN_STORE_PATH, encryptedTokens, 'utf8');
      logger.info('Token store updated successfully.', { service: 'TokenManager' });
    } else {
      logger.error('Failed to encrypt tokens for storage. Token store not updated.', { service: 'TokenManager' });
    }
  } catch (error) {
    logger.error('Error writing token store:', { message: error.message, service: 'TokenManager' });
  }
}

export async function getToken(tokenName) {
  try {
    const data = await fs.readFile(TOKEN_STORE_PATH, 'utf8');
    const decryptedData = decrypt(data);
    if (decryptedData) {
      const tokens = JSON.parse(decryptedData);
      return tokens[tokenName] || null;
    }
    return null;
  } catch (error) {
    if (error.code === 'ENOENT') {
      logger.debug('Token store file not found. No token to retrieve.', { service: 'TokenManager' });
    } else {
      logger.error('Error reading token store for retrieval:', { message: error.message, service: 'TokenManager' });
    }
    return null;
  }
}

export async function clearAllTokens() {
    await ensureDataDirectoryExists();
    try {
        const encryptedEmptyTokens = encrypt(JSON.stringify({}));
        if (encryptedEmptyTokens) {
            await fs.writeFile(TOKEN_STORE_PATH, encryptedEmptyTokens, 'utf8');
            logger.info('All tokens cleared from token store.', { service: 'TokenManager' });
        } else {
            logger.error('Failed to encrypt empty token data. Tokens not cleared.', { service: 'TokenManager' });
        }
    } catch (error) {
        logger.error('Error clearing token store:', { message: error.message, service: 'TokenManager' });
    }
}