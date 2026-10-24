import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import type { CreateCommentInput, UpdateCommentInput } from '@qveto/shared';

export class CommentService {
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
   * GET /api/tasks/:taskId/comments
   * List comments in chronological order.
   */
  async listComments(taskId: string, userId: string) {
    await this.verifyTaskAccess(taskId, userId);

    const comments = await prisma.comment.findMany({
      where: { taskId },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return comments.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      author: c.author
        ? {
            ...c.author,
            createdAt: c.author.createdAt.toISOString(),
          }
        : undefined,
    }));
  }

  /**
   * POST /api/tasks/:taskId/comments
   * Add a new comment to a task and emit activity and notification.
   */
  async createComment(taskId: string, userId: string, input: CreateCommentInput) {
    const { task, orgId } = await this.verifyTaskAccess(taskId, userId);

    if (task.project.status === 'ARCHIVED') {
      throw new AppError(409, 'CONFLICT', 'Cannot add comments to an archived project');
    }

    return prisma.$transaction(async (tx) => {
      const comment = await tx.comment.create({
        data: {
          content: input.content,
          taskId,
          authorId: userId,
        },
        include: {
          author: {
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
          type: 'COMMENT_ADDED',
          entityType: 'TASK',
          entityId: taskId,
          actorId: userId,
          orgId,
          metadata: {
            commentId: comment.id,
            preview: input.content.slice(0, 120),
          },
        },
      });

      // Notify task assignee if someone else commented
      if (task.assigneeId && task.assigneeId !== userId) {
        await tx.notification.create({
          data: {
            type: 'COMMENT_ADDED',
            title: 'New comment on task',
            message: `${comment.author.name} commented on "${task.title}"`,
            userId: task.assigneeId,
            orgId,
            relatedEntityType: 'TASK',
            relatedEntityId: taskId,
          },
        });
      }

      // Also notify creator if different from commenter and assignee
      if (task.creatorId && task.creatorId !== userId && task.creatorId !== task.assigneeId) {
        await tx.notification.create({
          data: {
            type: 'COMMENT_ADDED',
            title: 'New comment on task',
            message: `${comment.author.name} commented on "${task.title}"`,
            userId: task.creatorId,
            orgId,
            relatedEntityType: 'TASK',
            relatedEntityId: taskId,
          },
        });
      }

      return {
        ...comment,
        createdAt: comment.createdAt.toISOString(),
        updatedAt: comment.updatedAt.toISOString(),
        author: {
          ...comment.author,
          createdAt: comment.author.createdAt.toISOString(),
        },
      };
    });
  }

  /**
   * PATCH /api/tasks/:taskId/comments/:commentId
   * Edit comment content (Author only).
   */
  async updateComment(
    taskId: string,
    commentId: string,
    userId: string,
    input: UpdateCommentInput,
  ) {
    await this.verifyTaskAccess(taskId, userId);

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment || comment.taskId !== taskId) {
      throw new AppError(404, 'NOT_FOUND', 'Comment not found');
    }

    if (comment.authorId !== userId) {
      throw new AppError(403, 'FORBIDDEN', 'You can only edit your own comments');
    }

    const updated = await prisma.comment.update({
      where: { id: commentId },
      data: {
        content: input.content,
      },
      include: {
        author: {
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

    return {
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      author: {
        ...updated.author,
        createdAt: updated.author.createdAt.toISOString(),
      },
    };
  }

  /**
   * DELETE /api/tasks/:taskId/comments/:commentId
   * Delete a comment (Author, Manager, or Owner).
   */
  async deleteComment(taskId: string, commentId: string, userId: string) {
    const { orgId, orgRole } = await this.verifyTaskAccess(taskId, userId);

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
    });

    if (!comment || comment.taskId !== taskId) {
      throw new AppError(404, 'NOT_FOUND', 'Comment not found');
    }

    const isAuthor = comment.authorId === userId;
    const isPrivileged = orgRole === 'OWNER' || orgRole === 'MANAGER';

    if (!isAuthor && !isPrivileged) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'You do not have permission to delete this comment',
      );
    }

    return prisma.$transaction(async (tx) => {
      await tx.comment.delete({
        where: { id: commentId },
      });

      await tx.activityEvent.create({
        data: {
          type: 'COMMENT_DELETED',
          entityType: 'TASK',
          entityId: taskId,
          actorId: userId,
          orgId,
          metadata: {
            commentId,
          },
        },
      });

      return { success: true };
    });
  }
}

export const commentService = new CommentService();
