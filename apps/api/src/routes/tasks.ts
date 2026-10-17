
import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import { z } from 'zod';
import { createTaskSchema } from '@qveto/shared';
import { requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { taskService } from '../services/task.service.js';

const taskRouter: ReturnType<typeof Router> = Router({
  mergeParams: true,
});

taskRouter.use(requireAuth);

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

function getProjectId(req: Request): string {
  const value = req.params.projectId;

  return Array.isArray(value) ? value[0] : value;
}

// POST /api/projects/:projectId/tasks
taskRouter.post(
  '/',
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const projectId = getProjectId(req);

      const input = createTaskSchema.parse(req.body);

      const task = await taskService.createTask(
        projectId,
        authReq.user.id,
        input,
      );

      res.status(201).json({ task });
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/projects/:projectId/tasks
taskRouter.get(
  '/',
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const projectId = getProjectId(req);

      const query = listQuerySchema.parse(req.query);

      const result = await taskService.listTasks(
        projectId,
        authReq.user.id,
        query.page,
        query.pageSize,
      );

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
);

export { taskRouter };
