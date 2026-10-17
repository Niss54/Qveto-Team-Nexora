import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from 'express';

import {
  createTaskSchema,
  updateTaskSchema,
} from '@qveto/shared';
import { requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { taskService } from '../services/task.service.js';

const taskByIdRouter: ReturnType<typeof Router> = Router({
  mergeParams: true,
});

taskByIdRouter.use(requireAuth);

function getTaskId(req: Request): string {
  const value = req.params.taskId;
  return Array.isArray(value) ? value[0] : value;
}

// POST /api/tasks/:taskId/subtasks
taskByIdRouter.post(
  '/subtasks',
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const input = createTaskSchema.parse(req.body);
      const task = await taskService.createSubtask(
        getTaskId(req),
        authReq.user.id,
        input,
      );
      res.status(201).json({ task });
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/tasks/:taskId/subtasks
taskByIdRouter.get(
  '/subtasks',
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const result = await taskService.listSubtasks(
        getTaskId(req),
        authReq.user.id,
      );
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/tasks/:taskId
taskByIdRouter.get(
  '/',
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const task = await taskService.getTaskById(
        getTaskId(req),
        authReq.user.id,
      );
      res.status(200).json({ task });
    } catch (error) {
      next(error);
    }
  },
);

// PATCH /api/tasks/:taskId
taskByIdRouter.patch(
  '/',
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const input = updateTaskSchema.parse(req.body);
      const task = await taskService.updateTask(
        getTaskId(req),
        authReq.user.id,
        input,
      );
      res.status(200).json({ task });
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/tasks/:taskId/archive
taskByIdRouter.post(
  '/archive',
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const task = await taskService.archiveTask(
        getTaskId(req),
        authReq.user.id,
      );
      res.status(200).json({ task });
    } catch (error) {
      next(error);
    }
  },
);

export { taskByIdRouter };
