import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { analyticsService } from '../services/analytics.service.js';

const analyticsRouter: ReturnType<typeof Router> = Router();

analyticsRouter.use(requireAuth);

const querySchema = z
  .object({
    orgId: z.string().min(1, 'orgId is required'),
    projectId: z.string().min(1).optional(),
  })
  .strict();

/**
 * GET /api/analytics/productivity
 *
 * Returns productivity analytics for the specified organization:
 * - Overview KPI rates (completion, on-time, coverage, overdue count)
 * - Task status and priority distributions
 * - Project progress breakdown
 * - Workload breakdown by assignee
 */
analyticsRouter.get(
  '/productivity',
  async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const query = querySchema.parse(req.query);

      const analytics = await analyticsService.getProductivityAnalytics(
        authReq.user.id,
        {
          orgId: query.orgId,
          projectId: query.projectId,
        },
      );

      res.status(200).json({ analytics });
    } catch (error) {
      next(error);
    }
  },
);

export { analyticsRouter };
