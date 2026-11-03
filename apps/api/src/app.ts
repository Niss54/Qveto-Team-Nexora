import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { taskRouter } from './routes/tasks.js';
import { taskByIdRouter } from './routes/task-by-id.js';
import { kanbanRouter } from './routes/kanban.js';
import { projectLabelsRouter, taskLabelsRouter } from './routes/labels.js';
import {
  requestIdMiddleware,
  loggerMiddleware,
  errorHandler,
  notFoundHandler,
} from './middleware/index.js';
import { healthRouter, authRouter, organizationRouter, workspaceRouter, teamRouter, myWorkRouter, analyticsRouter } from './routes/index.js';

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
  app.use('/api/organizations', organizationRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api', workspaceRouter);
  app.use('/api', teamRouter);
  app.use('/api/projects/:projectId/tasks', taskRouter);
  app.use('/api/projects/:projectId/labels', projectLabelsRouter);
  app.use('/api/tasks/:taskId/labels', taskLabelsRouter);
  app.use('/api/projects/:projectId/kanban', kanbanRouter);
  app.use('/api/tasks', myWorkRouter);
  app.use('/api/tasks/:taskId', taskByIdRouter);

  // 404 handler
  app.use(notFoundHandler);

  // Global error handler (must be last)
  app.use(errorHandler);

  return app;
}
