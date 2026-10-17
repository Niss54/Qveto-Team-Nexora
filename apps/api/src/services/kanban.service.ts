import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

export const KANBAN_STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'] as const;
export type KanbanStatus = (typeof KANBAN_STATUSES)[number];

const taskSelect = {
  id: true, title: true, description: true, status: true, priority: true,
  startDate: true, dueDate: true, completedAt: true, archivedAt: true,
  position: true, projectId: true, assigneeId: true, creatorId: true,
  parentTaskId: true, createdAt: true, updatedAt: true,
} as const;

type BoardTask = Awaited<ReturnType<typeof findBoardTasks>>[number];

function findBoardTasks(projectId: string) {
  return prisma.task.findMany({
    where: { projectId, archivedAt: null },
    select: taskSelect,
    orderBy: [{ position: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
  });
}

function serialize(task: BoardTask) {
  return {
    ...task,
    startDate: task.startDate?.toISOString() ?? null,
    dueDate: task.dueDate?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    archivedAt: task.archivedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

async function authorize(projectId: string, userId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { workspace: { select: { orgId: true } } },
  });
  if (!project) throw new AppError(404, 'NOT_FOUND', 'Project not found');
  const orgId = project.workspace.orgId;
  const [orgMember, projectMember] = await Promise.all([
    prisma.organizationMember.findUnique({ where: { userId_orgId: { userId, orgId } } }),
    prisma.projectMember.findUnique({ where: { userId_projectId: { userId, projectId } } }),
  ]);
  if (!orgMember || !projectMember) {
    throw new AppError(403, 'FORBIDDEN', 'You do not have access to this project');
  }
  return orgId;
}

function makeColumns(tasks: BoardTask[]) {
  return {
    TODO: tasks.filter((task) => task.status === 'TODO').map(serialize),
    IN_PROGRESS: tasks.filter((task) => task.status === 'IN_PROGRESS').map(serialize),
    IN_REVIEW: tasks.filter((task) => task.status === 'IN_REVIEW').map(serialize),
    DONE: tasks.filter((task) => task.status === 'DONE').map(serialize),
  };
}

export class KanbanService {
  async getBoard(projectId: string, userId: string) {
    await authorize(projectId, userId);
    const tasks = await findBoardTasks(projectId);
    return { columns: makeColumns(tasks), total: tasks.length };
  }

  async moveTask(
    projectId: string,
    userId: string,
    input: { taskId: string; status: KanbanStatus; targetIndex: number },
  ) {
    const orgId = await authorize(projectId, userId);
    try {
      // Serializable isolation prevents two simultaneous reorder requests from
      // silently overwriting one another. A serialization failure returns 409.
      return await prisma.$transaction(async (tx) => {
        const tasks = await tx.task.findMany({
          where: { projectId, archivedAt: null },
          select: taskSelect,
          orderBy: [{ position: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
        });
        const moving = tasks.find((task) => task.id === input.taskId);
        if (!moving) {
          throw new AppError(404, 'NOT_FOUND', 'Task not found in this project');
        }
        const destination = tasks.filter((task) => task.status === input.status && task.id !== input.taskId);
        if (input.targetIndex > destination.length) {
          throw new AppError(400, 'VALIDATION_ERROR', 'targetIndex exceeds destination column length');
        }
        const oldStatus = moving.status;
        destination.splice(input.targetIndex, 0, moving);
        const source = oldStatus === input.status
          ? []
          : tasks.filter((task) => task.status === oldStatus && task.id !== moving.id);

        const changes = [
          ...source.map((task, position) => ({ task, status: oldStatus, position })),
          ...destination.map((task, position) => ({ task, status: input.status, position })),
        ].filter(({ task, status, position }) => task.status !== status || task.position !== position);

        for (const { task, status, position } of changes) {
          const completedAt = task.id === moving.id && task.status !== status
            ? status === 'DONE' ? new Date() : null
            : task.completedAt;
          const result = await tx.task.updateMany({
            where: {
              id: task.id, projectId, archivedAt: null,
              status: task.status, updatedAt: task.updatedAt,
            },
            data: { status, position, ...(task.id === moving.id && task.status !== status ? { completedAt } : {}) },
          });
          if (result.count !== 1) {
            throw new AppError(409, 'CONFLICT', 'Board changed. Refresh and retry.');
          }
        }

        const statusChanged = oldStatus !== input.status;
        if (changes.length > 0) {
          const eventTypes = ['TASK_UPDATED'];
          if (statusChanged) eventTypes.push('TASK_STATUS_CHANGED');
          if (statusChanged && input.status === 'DONE') eventTypes.push('TASK_COMPLETED');
          for (const type of eventTypes) {
            await tx.activityEvent.create({
              data: {
                type, entityType: 'TASK', entityId: moving.id, actorId: userId, orgId,
                metadata: {
                  projectId, previousStatus: oldStatus, currentStatus: input.status,
                  previousPosition: moving.position, currentPosition: input.targetIndex,
                },
              },
            });
          }
        }

        const updated = await tx.task.findUniqueOrThrow({
          where: { id: input.taskId }, select: taskSelect,
        });
        return { task: serialize(updated) };
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2034') {
        throw new AppError(409, 'CONFLICT', 'Concurrent board update. Refresh and retry.');
      }
      throw error;
    }
  }
}

export const kanbanService = new KanbanService();
