import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Store diff data temporarily (in production, use a proper database)
const diffStore = new Map();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve the diff viewer page
app.get('/diff/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'diff-viewer.html'));
});

// API endpoint to store diff data
app.post('/api/diff', (req, res) => {
  const { diff, summary, sourceBranch, targetBranch } = req.body;
  const id = Date.now().toString();
  diffStore.set(id, { diff, summary, sourceBranch, targetBranch, timestamp: new Date() });
  res.json({ id, url: `http://localhost:${port}/diff/${id}` });
});

// API endpoint to get diff data
app.get('/api/diff/:id', (req, res) => {
  const diffData = diffStore.get(req.params.id);
  if (!diffData) {
    return res.status(404).json({ error: 'Diff not found' });
  }
  res.json(diffData);
});

// Clean up old diffs (older than 1 hour)
setInterval(() => {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [id, data] of diffStore.entries()) {
    if (data.timestamp.getTime() < oneHourAgo) {
      diffStore.delete(id);
    }
  }
}, 15 * 60 * 1000); // Run every 15 minutes

export function startServer() {
  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      logger.info(`Web server running at http://localhost:${port}`, { service: 'WebServer' });
      resolve(server);
    });
  });
}

export function stopServer(server) {
  return new Promise((resolve) => {
    server.close(() => {
      logger.info('Web server stopped', { service: 'WebServer' });
      resolve();
    });
  });
} 