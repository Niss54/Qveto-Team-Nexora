import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import multer from 'multer';
import { MAX_ATTACHMENT_SIZE_BYTES } from '@qveto/shared';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';
import { attachmentService } from '../services/attachment.service.js';

export const attachmentsRouter: ReturnType<typeof Router> = Router({
  mergeParams: true,
});

attachmentsRouter.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_ATTACHMENT_SIZE_BYTES,
  },
});

function getTaskId(req: Request): string {
  const value = req.params.taskId;
  return Array.isArray(value) ? value[0] : value;
}

function getAttachmentId(req: Request): string {
  const value = req.params.id;
  return Array.isArray(value) ? value[0] : value;
}

// GET /api/tasks/:taskId/attachments
attachmentsRouter.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const attachments = await attachmentService.listAttachments(
        getTaskId(req),
        authReq.user.id,
      );
      res.status(200).json({ attachments });
    } catch (error) {
      next(error);
    }
  },
);

// POST /api/tasks/:taskId/attachments
attachmentsRouter.post(
  '/',
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      if (!req.file) {
        throw new AppError(400, 'BAD_REQUEST', 'No file was uploaded');
      }

      const attachment = await attachmentService.uploadAttachment(
        getTaskId(req),
        authReq.user.id,
        {
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          buffer: req.file.buffer,
        },
      );
      res.status(201).json({ attachment });
    } catch (error) {
      next(error);
    }
  },
);

// GET /api/tasks/:taskId/attachments/:id/download
attachmentsRouter.get(
  '/:id/download',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const file = await attachmentService.getAttachmentFileForDownload(
        getTaskId(req),
        getAttachmentId(req),
        authReq.user.id,
      );

      if (file.downloadUrl) {
        res.redirect(file.downloadUrl);
        return;
      }

      if (file.filePath) {
        res.download(file.filePath, file.fileName);
        return;
      }

      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Attachment file not found' } });
    } catch (error) {
      next(error);
    }
  },
);

// DELETE /api/tasks/:taskId/attachments/:id
attachmentsRouter.delete(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const result = await attachmentService.deleteAttachment(
        getTaskId(req),
        getAttachmentId(req),
        authReq.user.id,
      );
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
);
