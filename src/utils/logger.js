import winston from 'winston';
import dotenv from 'dotenv';

dotenv.config();

const { combine, timestamp, printf, colorize, align, json } = winston.format;

const logLevels = {
  fatal: 0,
  error: 1,
  warn: 2,
  info: 3,
  http: 4,
  debug: 5,
  trace: 6,
};

const customFormat = printf(({ level, message, timestamp, service, ...metadata }) => {
  let msg = `${timestamp} [${service || 'Application'}] ${level}: ${message}`;
  if (metadata && Object.keys(metadata).length > 0) {
    // Only stringify if metadata is not already a string and has keys
    if (typeof metadata === 'object' && Object.keys(metadata).length > 0) {
        // Check for Error instances and extract stack
        if (metadata.stack && metadata.message) {
             msg += `\nStack: ${metadata.stack}`;
        } else {
            try {
                msg += ` ${JSON.stringify(metadata, null, 2)}`;
            } catch (e) {
                // Fallback for circular structures or other stringify errors
                msg += ` [UnserializableMetadata]`;
            }
        }
    } else if (typeof metadata === 'string' && metadata.trim() !== '') {
        msg += ` ${metadata}`;
    }
  }
  return msg;
});

const transportsList = [
  new winston.transports.Console({
    level: process.env.LOG_LEVEL || 'info',
    format: combine(
      colorize(),
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      align(),
      customFormat
    ),
  }),
];

if (process.env.NODE_ENV === 'production' || process.env.LOG_FILE_PATH) {
  transportsList.push(
    new winston.transports.File({
      filename: process.env.LOG_FILE_PATH || 'logs/app.log',
      level: process.env.LOG_LEVEL || 'info',
      format: combine(timestamp(), json()),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
  if (process.env.LOG_ERROR_FILE_PATH) {
    transportsList.push(
      new winston.transports.File({
        filename: process.env.LOG_ERROR_FILE_PATH || 'logs/error.log',
        level: 'error',
        format: combine(timestamp(), json()),
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      })
    );
  }
}

const logger = winston.createLogger({
  levels: logLevels,
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    customFormat
  ),
  transports: transportsList,
  exitOnError: false, // do not exit on handled exceptions
});

// Stream for morgan (HTTP request logging)
logger.stream = {
  write: (message) => {
    logger.http(message.trim());
  },
};

export default logger;