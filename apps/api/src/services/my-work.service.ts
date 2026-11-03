import type { Prisma, TaskStatus, TaskPriority } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

export type MyWorkFilters = {
  page?: number;
  pageSize?: number;
  status?: TaskStatus;
  priority?: TaskPriority;
  projectId?: string;
  orgId?: string;
  overdue?: boolean;
};

const myWorkTaskSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  startDate: true,
  dueDate: true,
  completedAt: true,
  projectId: true,
  assigneeId: true,
  creatorId: true,
  createdAt: true,
  updatedAt: true,
  project: {
    select: {
      id: true,
      name: true,
      workspace: {
        select: {
          id: true,
          name: true,
          orgId: true,
        },
      },
    },
  },
} satisfies Prisma.TaskSelect;

function serializeTaskDates<T extends Record<string, unknown>>(task: T): T {
  const result = { ...task };
  for (const field of ['startDate', 'dueDate', 'completedAt', 'createdAt', 'updatedAt'] as const) {
    const val = result[field];
    if (val instanceof Date) {
      (result as Record<string, unknown>)[field] = val.toISOString();
    }
  }
  return result;
}

export class MyWorkService {
  async getMyWork(userId: string, filters: MyWorkFilters = {}) {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
    const now = new Date();

    // 1. Organization tenant scoping check
    if (filters.orgId) {
      const orgMembership = await prisma.organizationMember.findUnique({
        where: {
          userId_orgId: {
            userId,
            orgId: filters.orgId,
          },
        },
      });

      if (!orgMembership) {
        throw new AppError(
          403,
          'FORBIDDEN',
          'Access denied. You are not a member of this organization.',
        );
      }
    }

    // 2. Discover eligible projects the user is a member of
    const membership = await prisma.projectMember.findMany({
      where: {
        userId,
        project: {
          workspace: {
            ...(filters.orgId ? { orgId: filters.orgId } : {}),
            organization: {
              members: {
                some: { userId },
              },
            },
          },
        },
      },
      select: {
        projectId: true,
      },
    });

    const projectIds = membership.map((item) => item.projectId);

    // 3. Early validation: if a specific project was requested, verify user belongs to it
    if (filters.projectId && !projectIds.includes(filters.projectId)) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'You do not have access to this project',
      );
    }

    if (projectIds.length === 0) {
      return {
        data: [],
        meta: {
          total: 0,
          page,
          pageSize,
          totalPages: 0,
        },
        summary: {
          totalOpen: 0,
          overdue: 0,
          dueToday: 0,
          completed: 0,
        },
      };
    }

    const where: Prisma.TaskWhereInput = {
      assigneeId: userId,
      projectId: filters.projectId ? filters.projectId : { in: projectIds },
      archivedAt: null,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.priority ? { priority: filters.priority } : {}),
      ...(filters.overdue
        ? {
            status: { not: 'DONE' },
            dueDate: { lt: now },
          }
        : {}),
    };

    const summaryWhere: Prisma.TaskWhereInput = {
      assigneeId: userId,
      projectId: filters.projectId ? filters.projectId : { in: projectIds },
      archivedAt: null,
    };

    const startOfToday = new Date(now);
    startOfToday.setUTCHours(0, 0, 0, 0);

    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setUTCDate(startOfTomorrow.getUTCDate() + 1);

    const [tasks, total, totalOpen, overdue, dueToday, completed] =
      await Promise.all([
        prisma.task.findMany({
          where,
          select: myWorkTaskSelect,
          orderBy: [
            { dueDate: 'asc' },
            { createdAt: 'desc' },
          ],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.task.count({ where }),
        prisma.task.count({
          where: {
            ...summaryWhere,
            status: { not: 'DONE' },
          },
        }),
        prisma.task.count({
          where: {
            ...summaryWhere,
            status: { not: 'DONE' },
            dueDate: { lt: now },
          },
        }),
        prisma.task.count({
          where: {
            ...summaryWhere,
            status: { not: 'DONE' },
            dueDate: {
              gte: startOfToday,
              lt: startOfTomorrow,
            },
          },
        }),
        prisma.task.count({
          where: {
            ...summaryWhere,
            status: 'DONE',
          },
        }),
      ]);

    return {
      data: tasks.map((t) => serializeTaskDates(t as Record<string, unknown>)),
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
      summary: {
        totalOpen,
        overdue,
        dueToday,
        completed,
      },
    };
  }
}

export const myWorkService = new MyWorkService();
