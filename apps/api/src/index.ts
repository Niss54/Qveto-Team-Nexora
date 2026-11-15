import { createApp } from './app.js';
import { env } from './config/env.js';
import { cronService } from './services/cron.service.js';

const app = createApp(env.CORS_ORIGIN);

const server = app.listen(env.API_PORT, () => {
  console.log(`🚀 Qveto API server running on http://localhost:${env.API_PORT}`);
  console.log(`   Environment: ${env.NODE_ENV}`);
  console.log(`   Health check: http://localhost:${env.API_PORT}/api/health`);

  // Start background overdue cron daemon
  cronService.start(3600000); // 1 hour interval
});

const shutdown = () => {
  console.log('\nShutting down server gracefully...');
  cronService.stop();
  server.close(() => {
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
