import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENT_SIZE_BYTES,
} from '@qveto/shared';

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');

// Ensure upload directory exists
async function ensureUploadDir(): Promise<void> {
  if (!existsSync(UPLOADS_DIR)) {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
  }
}

export class AttachmentService {
  /**
   * Helper to verify task existence and user's project/org access.
   */
  private async verifyTaskAccess(taskId: string, userId: string) {
    const task = await prisma.task.findUnique({
      where: { id: taskId, archivedAt: null },
      include: {
        project: {
          include: {
            workspace: {
              select: { orgId: true },
            },
          },
        },
      },
    });

    if (!task) {
      throw new AppError(404, 'NOT_FOUND', 'Task not found');
    }

    const orgId = task.project.workspace.orgId;
    const projectId = task.projectId;

    const [orgMembership, projectMembership] = await Promise.all([
      prisma.organizationMember.findUnique({
        where: {
          userId_orgId: {
            userId,
            orgId,
          },
        },
      }),
      prisma.projectMember.findUnique({
        where: {
          userId_projectId: {
            userId,
            projectId,
          },
        },
      }),
    ]);

    if (!orgMembership || !projectMembership) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'You do not have access to this task or project',
      );
    }

    return { task, orgId, orgRole: orgMembership.role };
  }

  /**
   * GET /api/tasks/:taskId/attachments
   * List attachment metadata for a task.
   */
  async listAttachments(taskId: string, userId: string) {
    await this.verifyTaskAccess(taskId, userId);

    const attachments = await prisma.attachment.findMany({
      where: { taskId },
      include: {
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      fileSize: a.fileSize,
      mimeType: a.mimeType,
      taskId: a.taskId,
      uploadedById: a.uploadedById,
      createdAt: a.createdAt.toISOString(),
      uploadedBy: a.uploadedBy
        ? {
            ...a.uploadedBy,
            createdAt: a.uploadedBy.createdAt.toISOString(),
          }
        : undefined,
    }));
  }

  /**
   * POST /api/tasks/:taskId/attachments
   * Save uploaded file to private storage, validate type/size, and create DB record.
   */
  async uploadAttachment(
    taskId: string,
    userId: string,
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer?: Buffer;
      path?: string;
    },
  ) {
    const { task, orgId } = await this.verifyTaskAccess(taskId, userId);

    if (task.project.status === 'ARCHIVED') {
      throw new AppError(
        409,
        'CONFLICT',
        'Cannot upload attachments to an archived project',
      );
    }

    // Validate file size
    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `File size exceeds maximum allowed limit of 10MB (${file.size} bytes received)`,
      );
    }

    // Validate MIME type
    const isAllowedMime = (ALLOWED_ATTACHMENT_MIME_TYPES as readonly string[]).includes(
      file.mimetype,
    );
    if (!isAllowedMime) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `File type "${file.mimetype}" is not permitted. Allowed types: PDF, Images, Word, Excel, CSV, TXT, ZIP`,
      );
    }

    await ensureUploadDir();

    // Prevent path traversal by sanitizing filename and using UUID storage key
    const sanitizedOriginalName = path.basename(file.originalname);
    const extension = path.extname(sanitizedOriginalName);
    const safeKey = `${uuidv4()}${extension}`;
    const targetPath = path.join(UPLOADS_DIR, safeKey);

    if (file.buffer) {
      await fs.writeFile(targetPath, file.buffer);
    } else if (file.path) {
      await fs.rename(file.path, targetPath);
    } else {
      throw new AppError(400, 'BAD_REQUEST', 'Missing file payload');
    }

    return prisma.$transaction(async (tx) => {
      const attachment = await tx.attachment.create({
        data: {
          fileName: sanitizedOriginalName,
          fileSize: file.size,
          mimeType: file.mimetype,
          storagePath: safeKey,
          taskId,
          uploadedById: userId,
        },
        include: {
          uploadedBy: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
              createdAt: true,
            },
          },
        },
      });

      // Emit Activity Event
      await tx.activityEvent.create({
        data: {
          type: 'ATTACHMENT_UPLOADED',
          entityType: 'TASK',
          entityId: taskId,
          actorId: userId,
          orgId,
          metadata: {
            attachmentId: attachment.id,
            fileName: sanitizedOriginalName,
            fileSize: file.size,
          },
        },
      });

      return {
        id: attachment.id,
        fileName: attachment.fileName,
        fileSize: attachment.fileSize,
        mimeType: attachment.mimeType,
        taskId: attachment.taskId,
        uploadedById: attachment.uploadedById,
        createdAt: attachment.createdAt.toISOString(),
        uploadedBy: attachment.uploadedBy
          ? {
              ...attachment.uploadedBy,
              createdAt: attachment.uploadedBy.createdAt.toISOString(),
            }
          : undefined,
      };
    });
  }

  /**
   * GET /api/tasks/:taskId/attachments/:id/download
   * Verified private file download.
   */
  async getAttachmentFileForDownload(
    taskId: string,
    attachmentId: string,
    userId: string,
  ) {
    await this.verifyTaskAccess(taskId, userId);

    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
    });

    if (!attachment || attachment.taskId !== taskId) {
      throw new AppError(404, 'NOT_FOUND', 'Attachment not found');
    }

    // Path traversal defense: resolve against UPLOADS_DIR
    const resolvedPath = path.resolve(UPLOADS_DIR, attachment.storagePath);
    if (!resolvedPath.startsWith(UPLOADS_DIR)) {
      throw new AppError(403, 'FORBIDDEN', 'Invalid file path traversal detected');
    }

    if (!existsSync(resolvedPath)) {
      throw new AppError(404, 'NOT_FOUND', 'File data does not exist on storage');
    }

    return {
      filePath: resolvedPath,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
    };
  }

  /**
   * DELETE /api/tasks/:taskId/attachments/:id
   * Delete attachment record and unlink from storage.
   */
  async deleteAttachment(
    taskId: string,
    attachmentId: string,
    userId: string,
  ) {
    const { orgId, orgRole } = await this.verifyTaskAccess(taskId, userId);

    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
    });

    if (!attachment || attachment.taskId !== taskId) {
      throw new AppError(404, 'NOT_FOUND', 'Attachment not found');
    }

    const isUploader = attachment.uploadedById === userId;
    const isPrivileged = orgRole === 'OWNER' || orgRole === 'MANAGER';

    if (!isUploader && !isPrivileged) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'You do not have permission to delete this attachment',
      );
    }

    // Delete record in DB
    await prisma.$transaction(async (tx) => {
      await tx.attachment.delete({
        where: { id: attachmentId },
      });

      await tx.activityEvent.create({
        data: {
          type: 'ATTACHMENT_DELETED',
          entityType: 'TASK',
          entityId: taskId,
          actorId: userId,
          orgId,
          metadata: {
            attachmentId,
            fileName: attachment.fileName,
          },
        },
      });
    });

    // Remove file from disk asynchronously if it exists
    const resolvedPath = path.resolve(UPLOADS_DIR, attachment.storagePath);
    if (resolvedPath.startsWith(UPLOADS_DIR) && existsSync(resolvedPath)) {
      await fs.unlink(resolvedPath).catch(() => {});
    }

    return { success: true };
  }
}

export const attachmentService = new AttachmentService();
