import { Router } from 'express';

const healthRouter: ReturnType<typeof Router> = Router();

/**
 * GET /api/health
 * Health check endpoint - returns server status and timestamp.
 */
healthRouter.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
});

export { healthRouter };
