import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import {
  requestIdMiddleware,
  loggerMiddleware,
  errorHandler,
  notFoundHandler,
} from './middleware/index.js';
import { healthRouter, authRouter } from './routes/index.js';

/**
 * Creates and configures the Express application.
 * Separated from server start for testability.
 */
export function createApp(corsOrigin: string = 'http://localhost:3000'): express.Express {
  const app = express();

  // Security headers
  app.use(helmet());

  // CORS with credentials support
  app.use(
    cors({
      origin: corsOrigin,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    }),
  );

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Cookie parsing
  app.use(cookieParser());

  // Request ID and logging
  app.use(requestIdMiddleware);
  app.use(loggerMiddleware);

  // Routes
  app.use('/api', healthRouter);
  app.use('/api/auth', authRouter);

  // 404 handler
  app.use(notFoundHandler);

  // Global error handler (must be last)
  app.use(errorHandler);

  return app;
}
