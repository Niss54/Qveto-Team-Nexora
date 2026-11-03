import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { activityService } from '../services/activity.service.js';

export const activityRouter: ReturnType<typeof Router> = Router({
  mergeParams: true,
});

activityRouter.use(requireAuth);

function getTaskId(req: Request): string {
  const value = req.params.taskId;
  return Array.isArray(value) ? value[0] : value;
}

// GET /api/tasks/:taskId/activity
activityRouter.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const activity = await activityService.listTaskActivity(
        getTaskId(req),
        authReq.user.id,
      );
      res.status(200).json({ activity });
    } catch (error) {
      next(error);
    }
  },
);
