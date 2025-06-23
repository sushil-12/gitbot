import winston from 'winston';
import chalk from 'chalk';

const NODE_ENV = "production";
const LOG_LEVEL = process.env.LOG_LEVEL || (NODE_ENV === 'production' ? 'error' : 'debug');

// Custom format for development
const developmentFormat = winston.format.combine(
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
    const serviceTag = service ? chalk.cyan(`[${service}]`) : '';
    const levelColor = {
      error: chalk.red,
      warn: chalk.yellow,
      info: chalk.blue,
      debug: chalk.gray,
      verbose: chalk.magenta
    }[level] || chalk.white;
    
    const metaStr = Object.keys(meta).length > 0 
      ? chalk.gray(` ${JSON.stringify(meta)}`) 
      : '';
    
    return `${chalk.gray(timestamp)} ${levelColor(level.toUpperCase())} ${serviceTag} ${message}${metaStr}`;
  })
);

// Clean format for production
const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Console transport with environment-specific formatting
const consoleTransport = new winston.transports.Console({
  format: NODE_ENV === 'production' ? productionFormat : developmentFormat,
  level: LOG_LEVEL
});

// File transport for production
const fileTransports = [];
if (NODE_ENV === 'production') {
  fileTransports.push(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: productionFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: productionFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  );
}

// Create logger instance
const logger = winston.createLogger({
  level: LOG_LEVEL,
  transports: [consoleTransport, ...fileTransports],
  exitOnError: false
});

// User-friendly logging methods
const userLogger = {
  // Success messages for users
  success: (message, options = {}) => {
    if (NODE_ENV === 'development') {
      logger.info(`✅ ${message}`, { ...options, type: 'success' });
    }
  },

  // Info messages for users
  info: (message, options = {}) => {
    if (NODE_ENV === 'development') {
      logger.info(`ℹ️  ${message}`, { ...options, type: 'info' });
    }
  },

  // Warning messages for users
  warn: (message, options = {}) => {
    if (NODE_ENV === 'development') {
      logger.warn(`⚠️  ${message}`, { ...options, type: 'warning' });
    }
  },

  // Error messages for users
  error: (message, options = {}) => {
    if (NODE_ENV === 'development') {
      logger.error(`❌ ${message}`, { ...options, type: 'error' });
    }
  },

  // Progress indicators
  progress: (message, options = {}) => {
    if (NODE_ENV === 'development') {
      logger.info(`🔄 ${message}`, { ...options, type: 'progress' });
    }
  },

  // Debug messages (development only)
  debug: (message, options = {}) => {
    if (NODE_ENV === 'development') {
      logger.debug(`🐛 ${message}`, { ...options, type: 'debug' });
    }
  },

  // Verbose messages (development only)
  verbose: (message, options = {}) => {
    if (NODE_ENV === 'development') {
      logger.verbose(`🔍 ${message}`, { ...options, type: 'verbose' });
    }
  },

  // Technical logger for internal use
  technical: logger
};

// Export both the technical logger and user-friendly logger
export { logger as technicalLogger, userLogger as logger };
export default userLogger;