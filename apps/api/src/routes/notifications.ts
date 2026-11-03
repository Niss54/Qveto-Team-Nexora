import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { notificationService } from '../services/notification.service.js';

export const notificationsRouter: ReturnType<typeof Router> = Router();

notificationsRouter.use(requireAuth);

function getNotificationId(req: Request): string {
  const value = req.params.id;
  return Array.isArray(value) ? value[0] : value;
}

// GET /api/notifications
notificationsRouter.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const orgId = typeof req.query.orgId === 'string' ? req.query.orgId : undefined;
      const unreadOnly = req.query.unreadOnly === 'true';
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 20;

      const result = await notificationService.listUserNotifications(
        authReq.user.id,
        orgId,
        { unreadOnly, page, pageSize },
      );
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/notifications/unread-count
notificationsRouter.get(
  '/unread-count',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const orgId = typeof req.query.orgId === 'string' ? req.query.orgId : undefined;
      const result = await notificationService.getUnreadCount(
        authReq.user.id,
        orgId,
      );
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
);

// PATCH /api/notifications/:id/read
notificationsRouter.patch(
  '/:id/read',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const result = await notificationService.markAsRead(
        getNotificationId(req),
        authReq.user.id,
      );
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
);

// PATCH /api/notifications/read-all
notificationsRouter.patch(
  '/read-all',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const orgId = typeof req.query.orgId === 'string' ? req.query.orgId : undefined;
      const result = await notificationService.markAllAsRead(
        authReq.user.id,
        orgId,
      );
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/notifications/check-overdue
notificationsRouter.post(
  '/check-overdue',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgId = typeof req.query.orgId === 'string' ? req.query.orgId : undefined;
      const result = await notificationService.checkAndAlertOverdueTasks(orgId);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
);
