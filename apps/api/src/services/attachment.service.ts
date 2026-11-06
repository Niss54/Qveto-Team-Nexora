import path from 'node:path';
import fs from 'node:fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENT_SIZE_BYTES,
} from '@qveto/shared';
import { storageService } from './storage.service.js';

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
   * Save uploaded file to secure storage (local or S3/R2), validate type/size, and create DB record.
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

    // Prepare buffer
    let fileBuffer = file.buffer;
    if (!fileBuffer && file.path) {
      fileBuffer = await fs.readFile(file.path);
    }

    if (!fileBuffer) {
      throw new AppError(400, 'BAD_REQUEST', 'Missing file payload');
    }

    // Prevent path traversal by sanitizing filename and using UUID storage key
    const sanitizedOriginalName = path.basename(file.originalname);
    const extension = path.extname(sanitizedOriginalName);
    const safeKey = `${uuidv4()}${extension}`;

    // Upload to configured storage provider (Local, S3, or R2)
    const { storagePath } = await storageService.uploadFile(safeKey, fileBuffer, file.mimetype);

    // Clean up temporary multipart upload file if present
    if (file.path) {
      await fs.unlink(file.path).catch(() => {});
    }

    return prisma.$transaction(async (tx) => {
      const attachment = await tx.attachment.create({
        data: {
          fileName: sanitizedOriginalName,
          fileSize: file.size,
          mimeType: file.mimetype,
          storagePath,
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
   * Verified private file download or pre-signed URL.
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

    try {
      const target = await storageService.getDownloadTarget(
        attachment.storagePath,
        attachment.fileName,
      );

      return {
        filePath: target.filePath,
        downloadUrl: target.downloadUrl,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
      };
    } catch {
      throw new AppError(404, 'NOT_FOUND', 'File data does not exist on storage');
    }
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

    // Remove file from storage (Local or S3/R2)
    await storageService.deleteFile(attachment.storagePath).catch(() => {});

    return { success: true };
  }

  /**
   * Clean up all attachment files and records associated with a task.
   * Useful when tasks are permanently removed or archived with cleanup.
   */
  async cleanupTaskAttachments(taskId: string) {
    const attachments = await prisma.attachment.findMany({
      where: { taskId },
      select: { id: true, storagePath: true },
    });

    if (attachments.length > 0) {
      const paths = attachments.map((a) => a.storagePath);
      await storageService.deleteFiles(paths).catch(() => {});
      await prisma.attachment.deleteMany({
        where: { taskId },
      }).catch(() => {});
    }

    return { cleanedCount: attachments.length };
  }
}

export const attachmentService = new AttachmentService();
