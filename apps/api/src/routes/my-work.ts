
import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from 'express';

import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { myWorkService } from '../services/my-work.service.js';

const myWorkRouter: ReturnType<typeof Router> = Router();

myWorkRouter.use(requireAuth);

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  projectId: z.string().min(1).optional(),
  orgId: z.string().min(1).optional(),
  overdue: z.enum(['true', 'false']).optional(),
}).strict();

// GET /api/tasks/my-work
myWorkRouter.get(
  '/my-work',
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const query = querySchema.parse(req.query);

      const result = await myWorkService.getMyWork(
        authReq.user.id,
        {
          page: query.page,
          pageSize: query.pageSize,
          status: query.status,
          priority: query.priority,
          projectId: query.projectId,
          orgId: query.orgId,
          overdue: query.overdue ? query.overdue === 'true' : undefined,
        },
      );

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
);

export { myWorkRouter };
