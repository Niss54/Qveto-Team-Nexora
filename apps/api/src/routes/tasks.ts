
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

// Dates use calendar days, interpreted at 00:00:00 UTC.
const utcDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').refine(
  (value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  },
  'Invalid calendar date',
);

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  assigneeId: z.string().min(1).optional(),
  labelId: z.string().min(1).optional(),
  dueBefore: utcDay.optional(),
  dueAfter: utcDay.optional(),
  overdue: z.enum(['true', 'false']).optional(),
}).strict().refine(
  (query) => !query.dueBefore || !query.dueAfter || query.dueAfter <= query.dueBefore,
  { message: 'dueAfter must be on or before dueBefore', path: ['dueAfter'] },
);

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
        {
          status: query.status,
          priority: query.priority,
          assigneeId: query.assigneeId,
          labelId: query.labelId,
          dueBefore: query.dueBefore,
          dueAfter: query.dueAfter,
          overdue: query.overdue === 'true',
        },
      );

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
);

export { taskRouter };
