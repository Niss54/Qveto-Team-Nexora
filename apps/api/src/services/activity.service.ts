import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

export class ActivityService {
  /**
   * Verify access to the task and containing project/organization.
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

    return { task, orgId };
  }

  /**
   * GET /api/tasks/:taskId/activity
   * Retrieve chronological activity audit trail for a task.
   */
  async listTaskActivity(taskId: string, userId: string) {
    await this.verifyTaskAccess(taskId, userId);

    const events = await prisma.activityEvent.findMany({
      where: {
        entityType: 'TASK',
        entityId: taskId,
      },
      include: {
        actor: {
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

    return events.map((e) => ({
      id: e.id,
      type: e.type,
      entityType: e.entityType,
      entityId: e.entityId,
      actorId: e.actorId,
      orgId: e.orgId,
      metadata: e.metadata,
      createdAt: e.createdAt.toISOString(),
      actor: e.actor
        ? {
            ...e.actor,
            createdAt: e.actor.createdAt.toISOString(),
          }
        : undefined,
    }));
  }
}

export const activityService = new ActivityService();
