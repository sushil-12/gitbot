import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import logger from '../utils/logger.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const defaultPort = process.env.PORT || 3000;

// Set up middleware with increased limits BEFORE any routes
app.use(express.json({ 
  limit: '100mb',  // Increased from 50mb to 100mb
  verify: (req, res, buf) => {
    if (buf.length > 100 * 1024 * 1024) { // 100MB in bytes
      throw new Error('Payload too large');
    }
  }
}));

let diffData = new Map();

// Clean up old diffs (older than 1 hour)
setInterval(() => {
  const oneHourAgo = Date.now() - 3600000;
  for (const [id, data] of diffData.entries()) {
    if (parseInt(id) < oneHourAgo) {
      diffData.delete(id);
    }
  }
}, 3600000); // Run every hour

export function setupDiffRoutes(app) {
  // Serve static files for diff viewer
  app.use('/diff-viewer', express.static(path.join(__dirname, 'public')));

  // Serve the diff viewer page
  app.get('/diff-viewer/:id', async (req, res) => {
    try {
      const htmlPath = path.join(__dirname, 'diffViewer.html');
      let html = await fs.readFile(htmlPath, 'utf8');
      html = html.replace('{{DIFF_ID}}', req.params.id);
      res.send(html);
    } catch (error) {
      logger.error('Error serving diff viewer:', { error: error.message });
      res.status(500).send('Error loading diff viewer');
    }
  });

  // API endpoint to store diff data
  app.post('/api/diff', (req, res) => {
    try {
      const { diff, summary, sourceBranch, targetBranch } = req.body;
      if (!diff || !summary || !sourceBranch || !targetBranch) {
        return res.status(400).json({ error: 'Missing required fields' });
      }
      const id = Date.now().toString();
      diffData.set(id, { diff, summary, sourceBranch, targetBranch });
      res.json({ url: `/diff-viewer/${id}` });
    } catch (error) {
      logger.error('Error storing diff data:', { error: error.message });
      res.status(500).json({ error: 'Failed to store diff data' });
    }
  });

  // API endpoint to get diff data
  app.get('/api/diff/:id', (req, res) => {
    try {
      const data = diffData.get(req.params.id);
      if (!data) {
        return res.status(404).json({ error: 'Diff data not found' });
      }
      res.json(data);
    } catch (error) {
      logger.error('Error retrieving diff data:', { error: error.message });
      res.status(500).json({ error: 'Failed to retrieve diff data' });
    }
  });

  logger.info('Diff viewer routes setup complete', { service: 'WebServer' });
}

// Error handling middleware
app.use((err, req, res, next) => {
  if (err.message === 'Payload too large') {
    logger.error('Payload too large:', { 
      size: req.headers['content-length'],
      limit: '100mb',
      service: 'WebServer'
    });
    return res.status(413).json({ 
      error: 'Payload too large',
      message: 'The diff content is too large. Please try with a smaller diff or split it into multiple requests.'
    });
  }
  next(err);
});

async function killProcessOnPort(port) {
  try {
    // For Linux/Mac
    const { stdout } = await execAsync(`lsof -i :${port} -t`);
    if (stdout.trim()) {
      const pid = stdout.trim();
      await execAsync(`kill -9 ${pid}`);
      logger.info(`Killed process ${pid} on port ${port}`, { service: 'WebServer' });
    }
  } catch (error) {
    // If no process is found, that's fine
    if (!error.message.includes('no process')) {
      logger.warn(`Error killing process on port ${port}:`, { error: error.message, service: 'WebServer' });
    }
  }
}

export async function startServer() {
  return new Promise(async (resolve) => {
    try {
      // Kill any existing process on port 3000
      await killProcessOnPort(defaultPort);
      
      // Wait a moment for the port to be released
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const server = app.listen(defaultPort, () => {
        logger.info(`Web server running at http://localhost:${defaultPort}`, { service: 'WebServer' });
        app.set('port', defaultPort);
        resolve(server);
      });

      // Handle server errors
      server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          logger.error(`Port ${defaultPort} is still in use after cleanup attempt`, { service: 'WebServer' });
          throw error;
        }
      });
    } catch (error) {
      logger.error('Failed to start web server:', { error: error.message, service: 'WebServer' });
      throw error;
    }
  });
}

export function stopServer(server) {
  return new Promise((resolve) => {
    if (!server) {
      resolve();
      return;
    }
    
    server.close(() => {
      logger.info('Web server stopped', { service: 'WebServer' });
      resolve();
    });
  });
} 