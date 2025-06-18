import configManager from './configManager.js';

export async function getToken(key) {
  return await configManager.getToken(key);
}

export async function storeToken(key, value) {
  await configManager.setToken(key, value);
}

export async function clearToken(key) {
  await configManager.clearToken(key);
}

export async function clearAllTokens() {
  await configManager.clearAllTokens();
}

export async function getAllTokens() {
  return await configManager.loadTokens();
}