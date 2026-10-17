
import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from 'express';

import { updateTaskSchema } from '@qveto/shared';
import { requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { taskService } from '../services/task.service.js';

const taskByIdRouter: ReturnType<typeof Router> = Router({
  mergeParams: true,
});

taskByIdRouter.use(requireAuth);

// Extract route parameter safely
function getTaskId(req: Request): string {
  const value = req.params.taskId;

  return Array.isArray(value)
    ? value[0]
    : value;
}

/**
 * GET /api/tasks/:taskId
 *
 * Retrieve task details.
 */
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

/**
 * PATCH /api/tasks/:taskId
 *
 * Update task fields and lifecycle.
 */
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

/**
 * POST /api/tasks/:taskId/archive
 *
 * Soft archive an active task.
 */
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
