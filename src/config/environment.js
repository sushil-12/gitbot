import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';
const isDevelopment = NODE_ENV === 'development';

export const config = {
  // Environment
  NODE_ENV,
  isProduction,
  isDevelopment,
  
  // Server
  PORT: parseInt(process.env.PORT, 10) || 3000,
  HOST: process.env.HOST || 'localhost',
  
  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || (isProduction ? 'error' : 'debug'),
  LOG_FILE_PATH: process.env.LOG_FILE_PATH || 'logs/app.log',
  LOG_ERROR_FILE_PATH: process.env.LOG_ERROR_FILE_PATH || 'logs/error.log',
  
  // AI Services
  AI_PROVIDER: process.env.AI_PROVIDER || 'ollama',
  
  // Mistral AI
  MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
  MISTRAL_MODEL: process.env.MISTRAL_MODEL || 'mistral-small',
  MISTRAL_REQUEST_TIMEOUT: parseInt(process.env.MISTRAL_REQUEST_TIMEOUT, 10) || 120000,
  MISTRAL_MAX_RETRIES: parseInt(process.env.MISTRAL_MAX_RETRIES, 10) || 2,
  MISTRAL_RETRY_DELAY: parseInt(process.env.MISTRAL_RETRY_DELAY, 10) || 1000,
  
  // Ollama
  OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  OLLAMA_MODEL: process.env.OLLAMA_MODEL || 'llama2',
  OLLAMA_REQUEST_TIMEOUT: parseInt(process.env.OLLAMA_REQUEST_TIMEOUT, 10) || 60000,
  
  // GitHub
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
  GITHUB_CALLBACK_URL: process.env.GITHUB_CALLBACK_URL || 'http://localhost:3000/auth/github/callback',
  
  // Security
  SESSION_SECRET: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  JWT_SECRET: process.env.JWT_SECRET || 'your-jwt-secret-change-in-production',
  
  // Database (if needed in future)
  DATABASE_URL: process.env.DATABASE_URL,
  
  // Features
  ENABLE_ANALYTICS: process.env.ENABLE_ANALYTICS === 'true',
  ENABLE_TELEMETRY: process.env.ENABLE_TELEMETRY === 'true',
  
  // UI/UX
  ENABLE_COLORS: process.env.ENABLE_COLORS !== 'false',
  ENABLE_ANIMATIONS: process.env.ENABLE_ANIMATIONS !== 'false',
  MAX_RETRY_ATTEMPTS: parseInt(process.env.MAX_RETRY_ATTEMPTS, 10) || 4,
  
  // Git Operations
  DEFAULT_BRANCH: process.env.DEFAULT_BRANCH || 'main',
  DEFAULT_REMOTE: process.env.DEFAULT_REMOTE || 'origin',
  AUTO_BACKUP: process.env.AUTO_BACKUP === 'true',
  SAFE_MODE: process.env.SAFE_MODE === 'true',
  
  // Performance
  CACHE_TTL: parseInt(process.env.CACHE_TTL, 10) || 300, // 5 minutes
  MAX_CONCURRENT_REQUESTS: parseInt(process.env.MAX_CONCURRENT_REQUESTS, 10) || 5,
  
  // Development specific
  ...(isDevelopment && {
    ENABLE_DEBUG_MODE: true,
    ENABLE_VERBOSE_LOGGING: true,
    ENABLE_HOT_RELOAD: true,
    ENABLE_DEV_TOOLS: true
  }),
  
  // Production specific
  ...(isProduction && {
    ENABLE_DEBUG_MODE: false,
    ENABLE_VERBOSE_LOGGING: false,
    ENABLE_HOT_RELOAD: false,
    ENABLE_DEV_TOOLS: false,
    ENABLE_ERROR_TRACKING: true,
    ENABLE_PERFORMANCE_MONITORING: true
  })
};

// Validation
export function validateConfig() {
  const required = [
    'GITHUB_CLIENT_ID',
    'GITHUB_CLIENT_SECRET'
  ];
  
  const missing = required.filter(key => !config[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  
  return true;
}

// Get config for specific environment
export function getConfig(env = NODE_ENV) {
  return {
    ...config,
    NODE_ENV: env,
    isProduction: env === 'production',
    isDevelopment: env === 'development'
  };
}

export default config; 