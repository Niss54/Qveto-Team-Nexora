import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { taskRouter } from './routes/tasks.js';
import { taskByIdRouter } from './routes/task-by-id.js';
import { projectLabelsRouter, taskLabelsRouter } from './routes/labels.js';
import {
  requestIdMiddleware,
  loggerMiddleware,
  errorHandler,
  notFoundHandler,
} from './middleware/index.js';
import { healthRouter, authRouter, organizationRouter } from './routes/index.js';

/** Creates and configures the Express application. */
export function createApp(corsOrigin: string = 'http://localhost:3000'): express.Express {
  const app = express();
  app.use(helmet());
  app.use(cors({
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(requestIdMiddleware);
  app.use(loggerMiddleware);

  app.use('/api', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/organizations', organizationRouter);
  app.use('/api/projects/:projectId/tasks', taskRouter);
  app.use('/api/tasks/:taskId', taskByIdRouter);
  app.use('/api/projects/:projectId/labels', projectLabelsRouter);
  app.use('/api/tasks/:taskId/labels', taskLabelsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
