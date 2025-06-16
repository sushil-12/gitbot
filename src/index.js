import express from 'express';
import dotenv from 'dotenv';
import logger from './utils/logger.js';
import authRoutes from '../auth/authRoutes.js';
// import apiRoutes from '../routes/apiRoutes.js'; // To be created

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Morgan-like logging using Winston
app.use((req, res, next) => {
  logger.http(`Request: ${req.method} ${req.originalUrl}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });
  res.on('finish', () => {
    logger.http(`Response: ${res.statusCode} ${res.statusMessage}; ${res.get('Content-Length') || 0}b sent`, {
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
    });
  });
  next();
});

// Routes
app.use('/auth', authRoutes); // Mount authentication routes
// app.use('/api', apiRoutes);   // Mount API routes

app.get('/', (req, res) => {
  res.send('GitBot server is running. Welcome!');
});

// Basic Error Handling Middleware
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
  });
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal Server Error',
      status: err.status || 500,
    },
  });
});

// Start the server
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    logger.info(`Server is running on http://localhost:${PORT}`, { service: 'Server' });
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`, { service: 'Server' });
  });
}

export default app; // Export for testing or programmatic use