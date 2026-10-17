
import type {
  CreateTaskInput,
  UpdateTaskInput,
} from '@qveto/shared';

import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

// Fields returned by Task API endpoints
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

// Convert Date fields into ISO strings for API responses
function serializeTask(task: Record<string, unknown>) {
  const result = { ...task };

  for (const field of [
    'startDate',
    'dueDate',
    'completedAt',
    'archivedAt',
    'createdAt',
    'updatedAt',
  ]) {
    const value = result[field];

    if (value instanceof Date) {
      result[field] = value.toISOString();
    }
  }

  return result;
}

export class TaskService {
  /**
   * Verify that the user belongs to both the organization
   * and project containing the requested resource.
   */
  private async verifyProjectAccess(
    projectId: string,
    userId: string,
  ) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        workspace: {
          select: { orgId: true },
        },
      },
    });

    if (!project) {
      throw new AppError(
        404,
        'NOT_FOUND',
        'Project not found',
      );
    }

    const orgId = project.workspace.orgId;

    const [orgMembership, projectMembership] =
      await Promise.all([
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
        'You do not have access to this project',
      );
    }

    return { project, orgId };
  }

  /**
   * Validate that an assignee is a member of the project
   * and its organization.
   */
  private async verifyAssignee(
    assigneeId: string,
    projectId: string,
    orgId: string,
  ) {
    const [projectMember, orgMember] =
      await Promise.all([
        prisma.projectMember.findUnique({
          where: {
            userId_projectId: {
              userId: assigneeId,
              projectId,
            },
          },
        }),

        prisma.organizationMember.findUnique({
          where: {
            userId_orgId: {
              userId: assigneeId,
              orgId,
            },
          },
        }),
      ]);

    if (!projectMember || !orgMember) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Assignee must belong to this project and organization',
      );
    }
  }

  /**
   * POST /api/projects/:projectId/tasks
   *
   * Create a new task and record TASK_CREATED.
   */
  async createTask(
    projectId: string,
    userId: string,
    input: CreateTaskInput,
  ) {
    const { orgId } = await this.verifyProjectAccess(
      projectId,
      userId,
    );

    if (input.assigneeId) {
      await this.verifyAssignee(
        input.assigneeId,
        projectId,
        orgId,
      );
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

    const task = await prisma.$transaction(
      async (tx) => {
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
              input.status === 'DONE'
                ? new Date()
                : null,
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
      },
    );

    return serializeTask(task);
  }

  /**
   * GET /api/projects/:projectId/tasks
   *
   * List active tasks with pagination.
   */
  async listTasks(
    projectId: string,
    userId: string,
    page = 1,
    pageSize = 20,
  ) {
    await this.verifyProjectAccess(
      projectId,
      userId,
    );

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

      prisma.task.count({
        where,
      }),
    ]);

    return {
      data: tasks.map((task) =>
        serializeTask(task),
      ),
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * GET /api/tasks/:taskId
   *
   * Retrieve an active task.
   */
  async getTaskById(
    taskId: string,
    userId: string,
  ) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: taskSelect,
    });

    if (!task || task.archivedAt) {
      throw new AppError(
        404,
        'NOT_FOUND',
        'Task not found',
      );
    }

    await this.verifyProjectAccess(
      task.projectId,
      userId,
    );

    return serializeTask(task);
  }

  /**
   * PATCH /api/tasks/:taskId
   *
   * Update task fields, lifecycle and activity events.
   */
  async updateTask(
    taskId: string,
    userId: string,
    input: UpdateTaskInput,
  ) {
    const existing = await prisma.task.findUnique({
      where: { id: taskId },
    });

    if (!existing || existing.archivedAt) {
      throw new AppError(
        404,
        'NOT_FOUND',
        'Task not found',
      );
    }

    const { orgId } = await this.verifyProjectAccess(
      existing.projectId,
      userId,
    );

    if (Object.keys(input).length === 0) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Provide at least one field to update',
      );
    }

    // Validate combined existing and updated dates
    const startDate =
      input.startDate !== undefined
        ? input.startDate
        : existing.startDate;

    const dueDate =
      input.dueDate !== undefined
        ? input.dueDate
        : existing.dueDate;

    if (
      startDate &&
      dueDate &&
      startDate > dueDate
    ) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'startDate must be before or equal to dueDate',
      );
    }

    // Validate new assignee
    if (input.assigneeId) {
      await this.verifyAssignee(
        input.assigneeId,
        existing.projectId,
        orgId,
      );
    }

    // Subtask reparenting is handled in a later milestone
    // to prevent parent-child cycles.
    if (input.parentTaskId !== undefined) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Subtask reparenting is not available yet',
      );
    }

    const statusChanged =
      input.status !== undefined &&
      input.status !== existing.status;

    const assigneeChanged =
      input.assigneeId !== undefined &&
      input.assigneeId !== existing.assigneeId;

    const dueDateChanged =
      input.dueDate !== undefined &&
      (input.dueDate?.getTime() ?? null) !==
        (existing.dueDate?.getTime() ?? null);

    const nowCompleted =
      input.status === 'DONE' &&
      existing.status !== 'DONE';

    const reopened =
      input.status !== undefined &&
      input.status !== 'DONE' &&
      existing.status === 'DONE';

    return prisma.$transaction(async (tx) => {
      // Optimistic concurrency protection.
      const result = await tx.task.updateMany({
        where: {
          id: taskId,
          projectId: existing.projectId,
          archivedAt: null,
          status: existing.status,
          updatedAt: existing.updatedAt,
        },
        data: {
          ...(input.title !== undefined && {
            title: input.title.trim(),
          }),

          ...(input.description !== undefined && {
            description: input.description,
          }),

          ...(input.priority !== undefined && {
            priority: input.priority,
          }),

          ...(input.status !== undefined && {
            status: input.status,
          }),

          ...(input.startDate !== undefined && {
            startDate: input.startDate,
          }),

          ...(input.dueDate !== undefined && {
            dueDate: input.dueDate,
          }),

          ...(input.assigneeId !== undefined && {
            assigneeId: input.assigneeId,
          }),

          ...(input.position !== undefined && {
            position: input.position,
          }),

          ...(nowCompleted && {
            completedAt: new Date(),
          }),

          ...(reopened && {
            completedAt: null,
          }),
        },
      });

      if (result.count !== 1) {
        throw new AppError(
          409,
          'CONFLICT',
          'Task changed during update. Please retry.',
        );
      }

      const updated =
        await tx.task.findUniqueOrThrow({
          where: { id: taskId },
          select: taskSelect,
        });

      // Approved PRD 03 activity event types
      const eventTypes = ['TASK_UPDATED'];

      if (statusChanged) {
        eventTypes.push('TASK_STATUS_CHANGED');
      }

      if (assigneeChanged) {
        eventTypes.push('TASK_ASSIGNED');
      }

      if (dueDateChanged) {
        eventTypes.push('TASK_DUE_DATE_CHANGED');
      }

      if (nowCompleted) {
        eventTypes.push('TASK_COMPLETED');
      }

      for (const type of eventTypes) {
        await tx.activityEvent.create({
          data: {
            type,
            entityType: 'TASK',
            entityId: taskId,
            actorId: userId,
            orgId,
            metadata: {
              projectId: existing.projectId,
              previousStatus: existing.status,
              currentStatus: updated.status,
            },
          },
        });
      }

      return serializeTask(updated);
    });
  }

  /**
   * POST /api/tasks/:taskId/archive
   *
   * Soft archive an active task.
   */
  async archiveTask(
    taskId: string,
    userId: string,
  ) {
    const existingTask = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        projectId: true,
        archivedAt: true,
      },
    });

    if (!existingTask || existingTask.archivedAt) {
      throw new AppError(
        404,
        'NOT_FOUND',
        'Task not found',
      );
    }

    const { orgId } = await this.verifyProjectAccess(
      existingTask.projectId,
      userId,
    );

    return prisma.$transaction(async (tx) => {
      const result = await tx.task.updateMany({
        where: {
          id: taskId,
          archivedAt: null,
        },
        data: {
          archivedAt: new Date(),
        },
      });

      if (result.count === 0) {
        throw new AppError(
          404,
          'NOT_FOUND',
          'Task not found or already archived',
        );
      }

      const archivedTask =
        await tx.task.findUniqueOrThrow({
          where: { id: taskId },
          select: taskSelect,
        });

      await tx.activityEvent.create({
        data: {
          type: 'TASK_ARCHIVED',
          entityType: 'TASK',
          entityId: taskId,
          actorId: userId,
          orgId,
          metadata: {
            projectId: existingTask.projectId,
            archivedAt:
              archivedTask.archivedAt?.toISOString(),
          },
        },
      });

      return serializeTask(archivedTask);
    });
  }

  /**
   * POST /api/tasks/:taskId/subtasks
   * Create a direct child of an active parent task.
   */
  async createSubtask(
    parentTaskId: string,
    userId: string,
    input: CreateTaskInput,
  ) {
    const parent = await prisma.task.findUnique({
      where: { id: parentTaskId },
      select: {
        id: true,
        projectId: true,
        archivedAt: true,
      },
    });

    if (!parent || parent.archivedAt) {
      throw new AppError(404, 'NOT_FOUND', 'Parent task not found');
    }

    await this.verifyProjectAccess(parent.projectId, userId);

    if (
      input.parentTaskId !== undefined &&
      input.parentTaskId !== null &&
      input.parentTaskId !== parentTaskId
    ) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Parent task ID does not match the URL',
      );
    }

    // createTask also validates assignees, project access, and
    // that the parent belongs to this project and is not archived.
    return this.createTask(parent.projectId, userId, {
      ...input,
      parentTaskId,
    });
  }

  /**
   * GET /api/tasks/:taskId/subtasks
   * List direct, non-archived child tasks.
   */
  async listSubtasks(parentTaskId: string, userId: string) {
    const parent = await prisma.task.findUnique({
      where: { id: parentTaskId },
      select: {
        id: true,
        projectId: true,
        archivedAt: true,
      },
    });

    if (!parent || parent.archivedAt) {
      throw new AppError(404, 'NOT_FOUND', 'Parent task not found');
    }

    await this.verifyProjectAccess(parent.projectId, userId);

    const subtasks = await prisma.task.findMany({
      where: {
        parentTaskId,
        projectId: parent.projectId,
        archivedAt: null,
      },
      orderBy: [
        { position: 'asc' },
        { createdAt: 'desc' },
      ],
      select: taskSelect,
    });

    return {
      data: subtasks.map((task) => serializeTask(task)),
    };
  }

}

export const taskService = new TaskService();
