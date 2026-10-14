import { createApp } from './app.js';
import { env } from './config/env.js';

const app = createApp(env.CORS_ORIGIN);

app.listen(env.API_PORT, () => {
  console.log(`🚀 Qveto API server running on http://localhost:${env.API_PORT}`);
  console.log(`   Environment: ${env.NODE_ENV}`);
  console.log(`   Health check: http://localhost:${env.API_PORT}/api/health`);
});
