import configManager from './configManager.js';
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.GITMATE_ENCRYPTION_KEY || 'gitmate-default-key-32byteslong!'; // Must be 32 bytes
const IV_LENGTH = 16;

function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'utf8'), iv);
  let encrypted = cipher.update(text, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
  if (!text || typeof text !== 'string' || !text.includes(':')) return text;
  const [ivHex, encryptedHex] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const encryptedText = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'utf8'), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString('utf8');
}

export async function getToken(key) {
  const encrypted = await configManager.getToken(key);
  if (!encrypted) return null;
  return decrypt(encrypted);
}

export async function storeToken(key, value) {
  if (value == null) {
    await configManager.setToken(key, value);
    return;
  }
  const encrypted = encrypt(value);
  await configManager.setToken(key, encrypted);
}

export async function clearToken(key) {
  await configManager.clearToken(key);
}

export async function clearAllTokens() {
  await configManager.clearAllTokens();
}

export async function getAllTokens() {
  // Returns decrypted tokens
  const tokens = await configManager.loadTokens();
  const result = {};
  for (const [key, val] of Object.entries(tokens)) {
    result[key] = decrypt(val);
  }
  return result;
}