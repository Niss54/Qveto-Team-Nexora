import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import { createCommentSchema, updateCommentSchema } from '@qveto/shared';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { commentService } from '../services/comment.service.js';

export const commentsRouter: ReturnType<typeof Router> = Router({
  mergeParams: true,
});

commentsRouter.use(requireAuth);

function getTaskId(req: Request): string {
  const value = req.params.taskId;
  return Array.isArray(value) ? value[0] : value;
}

function getCommentId(req: Request): string {
  const value = req.params.commentId;
  return Array.isArray(value) ? value[0] : value;
}

// GET /api/tasks/:taskId/comments
commentsRouter.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const comments = await commentService.listComments(
        getTaskId(req),
        authReq.user.id,
      );
      res.status(200).json({ comments });
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/tasks/:taskId/comments
commentsRouter.post(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const input = createCommentSchema.parse(req.body);
      const comment = await commentService.createComment(
        getTaskId(req),
        authReq.user.id,
        input,
      );
      res.status(201).json({ comment });
    } catch (error) {
      next(error);
    }
  },
);

// PATCH /api/tasks/:taskId/comments/:commentId
commentsRouter.patch(
  '/:commentId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const input = updateCommentSchema.parse(req.body);
      const comment = await commentService.updateComment(
        getTaskId(req),
        getCommentId(req),
        authReq.user.id,
        input,
      );
      res.status(200).json({ comment });
    } catch (error) {
      next(error);
    }
  },
);

// DELETE /api/tasks/:taskId/comments/:commentId
commentsRouter.delete(
  '/:commentId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const result = await commentService.deleteComment(
        getTaskId(req),
        getCommentId(req),
        authReq.user.id,
      );
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
);
