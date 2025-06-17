import express from 'express';
import { setupDiffRoutes } from './server/webServer.js';

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Setup diff viewer routes
setupDiffRoutes(app);

// Your existing routes
// ... auth routes, etc ...

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
}); 