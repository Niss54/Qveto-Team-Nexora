
import type { CreateTaskInput } from '@qveto/shared';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

const taskSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  startDate: true,
  dueDate: true,
  completedAt: true,
  archivedAt: true,
  position: true,
  projectId: true,
  assigneeId: true,
  creatorId: true,
  parentTaskId: true,
  createdAt: true,
  updatedAt: true,
} as const;

function serializeTask(task: Record<string, unknown>) {
  const result = { ...task };

  for (const field of [
    'startDate', 'dueDate', 'completedAt',
    'archivedAt', 'createdAt', 'updatedAt',
  ]) {
    const value = result[field];
    if (value instanceof Date) {
      result[field] = value.toISOString();
    }
  }

  return result;
}

export class TaskService {
  private async verifyProjectAccess(
    projectId: string,
    userId: string,
  ) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        workspace: { select: { orgId: true } },
      },
    });

    if (!project) {
      throw new AppError(404, 'NOT_FOUND', 'Project not found');
    }

    const orgId = project.workspace.orgId;

    const [orgMembership, projectMembership] =
      await Promise.all([
        prisma.organizationMember.findUnique({
          where: {
            userId_orgId: { userId, orgId },
          },
        }),
        prisma.projectMember.findUnique({
          where: {
            userId_projectId: { userId, projectId },
          },
        }),
      ]);

    if (!orgMembership || !projectMembership) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'You do not have access to this project',
      );
    }

    return { project, orgId };
  }

  async createTask(
    projectId: string,
    userId: string,
    input: CreateTaskInput,
  ) {
    const { orgId } =
      await this.verifyProjectAccess(projectId, userId);

    if (input.assigneeId) {
      const member = await prisma.projectMember.findUnique({
        where: {
          userId_projectId: {
            userId: input.assigneeId,
            projectId,
          },
        },
      });

      const orgMember =
        await prisma.organizationMember.findUnique({
          where: {
            userId_orgId: {
              userId: input.assigneeId,
              orgId,
            },
          },
        });

      if (!member || !orgMember) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          'Assignee must be a project and organization member',
        );
      }
    }

    if (input.parentTaskId) {
      const parent = await prisma.task.findFirst({
        where: {
          id: input.parentTaskId,
          projectId,
          archivedAt: null,
        },
      });

      if (!parent) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          'Parent task must belong to this project',
        );
      }
    }

    const task = await prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          title: input.title.trim(),
          description: input.description ?? null,
          status: input.status,
          priority: input.priority,
          startDate: input.startDate ?? null,
          dueDate: input.dueDate ?? null,
          assigneeId: input.assigneeId ?? null,
          parentTaskId: input.parentTaskId ?? null,
          projectId,
          creatorId: userId,
          completedAt:
            input.status === 'DONE' ? new Date() : null,
        },
        select: taskSelect,
      });

      await tx.activityEvent.create({
        data: {
          type: 'TASK_CREATED',
          entityType: 'TASK',
          entityId: created.id,
          actorId: userId,
          orgId,
          metadata: {
            projectId,
            status: created.status,
            priority: created.priority,
          },
        },
      });

      return created;
    });

    return serializeTask(task);
  }

  async listTasks(
    projectId: string,
    userId: string,
    page = 1,
    pageSize = 20,
  ) {
    await this.verifyProjectAccess(projectId, userId);

    const where = {
      projectId,
      archivedAt: null,
    };

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        orderBy: [
          { position: 'asc' },
          { createdAt: 'desc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: taskSelect,
      }),
      prisma.task.count({ where }),
    ]);

    return {
      data: tasks.map((task) => serializeTask(task)),
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }
}

export const taskService = new TaskService();
