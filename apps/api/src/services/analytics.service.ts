import type { Prisma, TaskPriority, TaskStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

export type ProductivityAnalyticsFilters = {
  orgId: string;
  projectId?: string;
};

export type TaskStatusDistribution = Record<TaskStatus, number>;
export type TaskPriorityDistribution = Record<TaskPriority, number>;

export type ProjectProgressItem = {
  id: string;
  name: string;
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
  progressPercentage: number;
};

export type AssigneeWorkloadItem = {
  userId: string | null;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  totalTasks: number;
  openTasks: number;
  completedTasks: number;
  overdueTasks: number;
  dueTodayTasks: number;
};

export type ProductivityAnalyticsResponse = {
  orgId: string;
  projectId: string | null;
  overview: {
    totalTasks: number;
    completedTasks: number;
    openTasks: number;
    overdueTasks: number;
    completionRate: number;
    onTimeCompletionRate: number;
    assignmentCoverage: number;
    assignedTasks: number;
    unassignedTasks: number;
  };
  statusDistribution: TaskStatusDistribution;
  priorityDistribution: TaskPriorityDistribution;
  projectProgress: ProjectProgressItem[];
  workloadByAssignee: AssigneeWorkloadItem[];
};

export class AnalyticsService {
  /**
   * Calculate productivity analytics for an authorized organization.
   *
   * Security Invariants:
   * 1. Requires orgId and validates caller is an active member in organizationMember.
   * 2. If projectId is provided, verifies it belongs to the organization and caller belongs to it.
   * 3. Discovers all authorized projects for the caller and restricts all queries to them.
   * 4. Excludes soft-archived tasks (archivedAt != null).
   */
  async getProductivityAnalytics(
    userId: string,
    filters: ProductivityAnalyticsFilters,
  ): Promise<ProductivityAnalyticsResponse> {
    const { orgId, projectId } = filters;

    // 1. Server-side Organization Member authorization check
    const orgMembership = await prisma.organizationMember.findUnique({
      where: {
        userId_orgId: {
          userId,
          orgId,
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

    // 2. Discover authorized project IDs
    let targetProjectIds: string[] = [];

    if (projectId) {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: { workspace: { select: { orgId: true } } },
      });

      if (!project || project.workspace.orgId !== orgId) {
        throw new AppError(
          403,
          'FORBIDDEN',
          'You do not have access to this project',
        );
      }

      const projectMember = await prisma.projectMember.findUnique({
        where: {
          userId_projectId: {
            userId,
            projectId,
          },
        },
      });

      if (!projectMember) {
        throw new AppError(
          403,
          'FORBIDDEN',
          'You do not have access to this project',
        );
      }

      targetProjectIds = [projectId];
    } else {
      const memberships = await prisma.projectMember.findMany({
        where: {
          userId,
          project: {
            workspace: {
              orgId,
            },
          },
        },
        select: {
          projectId: true,
        },
      });

      targetProjectIds = memberships.map((m) => m.projectId);
    }

    // 3. Handle zero-project scenario cleanly
    if (targetProjectIds.length === 0) {
      return {
        orgId,
        projectId: projectId ?? null,
        overview: {
          totalTasks: 0,
          completedTasks: 0,
          openTasks: 0,
          overdueTasks: 0,
          completionRate: 0,
          onTimeCompletionRate: 0,
          assignmentCoverage: 0,
          assignedTasks: 0,
          unassignedTasks: 0,
        },
        statusDistribution: {
          TODO: 0,
          IN_PROGRESS: 0,
          IN_REVIEW: 0,
          DONE: 0,
        },
        priorityDistribution: {
          LOW: 0,
          MEDIUM: 0,
          HIGH: 0,
          URGENT: 0,
        },
        projectProgress: [],
        workloadByAssignee: [],
      };
    }

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setUTCHours(0, 0, 0, 0);

    const startOfTomorrow = new Date(startOfToday);
    startOfTomorrow.setUTCDate(startOfTomorrow.getUTCDate() + 1);

    const baseWhere: Prisma.TaskWhereInput = {
      projectId: { in: targetProjectIds },
      archivedAt: null,
    };

    // 4. Execute optimized parallel aggregations via Prisma
    const [
      totalTasks,
      assignedTasks,
      overdueTasks,
      statusGroups,
      priorityGroups,
      completedWithDue,
      projectRecords,
      projectTaskCounts,
      projectCompletedCounts,
      projectOverdueCounts,
      assigneeTotalCounts,
      assigneeOpenCounts,
      assigneeCompletedCounts,
      assigneeOverdueCounts,
      assigneeDueTodayCounts,
    ] = await Promise.all([
      // Total active tasks
      prisma.task.count({ where: baseWhere }),

      // Tasks assigned to a member
      prisma.task.count({
        where: {
          ...baseWhere,
          assigneeId: { not: null },
        },
      }),

      // Overdue tasks: status != 'DONE' and dueDate < now
      prisma.task.count({
        where: {
          ...baseWhere,
          status: { not: 'DONE' },
          dueDate: { lt: now },
        },
      }),

      // Status distribution
      prisma.task.groupBy({
        by: ['status'],
        where: baseWhere,
        _count: { id: true },
      }),

      // Priority distribution
      prisma.task.groupBy({
        by: ['priority'],
        where: baseWhere,
        _count: { id: true },
      }),

      // Completed tasks with a dueDate for on-time calculation
      prisma.task.findMany({
        where: {
          ...baseWhere,
          status: 'DONE',
          dueDate: { not: null },
          completedAt: { not: null },
        },
        select: {
          completedAt: true,
          dueDate: true,
        },
      }),

      // Projects metadata
      prisma.project.findMany({
        where: { id: { in: targetProjectIds } },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),

      // Project task counts
      prisma.task.groupBy({
        by: ['projectId'],
        where: baseWhere,
        _count: { id: true },
      }),

      // Project completed task counts
      prisma.task.groupBy({
        by: ['projectId'],
        where: { ...baseWhere, status: 'DONE' },
        _count: { id: true },
      }),

      // Project overdue task counts
      prisma.task.groupBy({
        by: ['projectId'],
        where: { ...baseWhere, status: { not: 'DONE' }, dueDate: { lt: now } },
        _count: { id: true },
      }),

      // Assignee total workload
      prisma.task.groupBy({
        by: ['assigneeId'],
        where: baseWhere,
        _count: { id: true },
      }),

      // Assignee open tasks
      prisma.task.groupBy({
        by: ['assigneeId'],
        where: { ...baseWhere, status: { not: 'DONE' } },
        _count: { id: true },
      }),

      // Assignee completed tasks
      prisma.task.groupBy({
        by: ['assigneeId'],
        where: { ...baseWhere, status: 'DONE' },
        _count: { id: true },
      }),

      // Assignee overdue tasks
      prisma.task.groupBy({
        by: ['assigneeId'],
        where: { ...baseWhere, status: { not: 'DONE' }, dueDate: { lt: now } },
        _count: { id: true },
      }),

      // Assignee due today tasks
      prisma.task.groupBy({
        by: ['assigneeId'],
        where: {
          ...baseWhere,
          status: { not: 'DONE' },
          dueDate: { gte: startOfToday, lt: startOfTomorrow },
        },
        _count: { id: true },
      }),
    ]);

    // 5. Build Status and Priority Distribution
    const statusDistribution: TaskStatusDistribution = {
      TODO: 0,
      IN_PROGRESS: 0,
      IN_REVIEW: 0,
      DONE: 0,
    };
    for (const item of statusGroups) {
      if (item.status in statusDistribution) {
        statusDistribution[item.status as TaskStatus] = item._count.id;
      }
    }

    const priorityDistribution: TaskPriorityDistribution = {
      LOW: 0,
      MEDIUM: 0,
      HIGH: 0,
      URGENT: 0,
    };
    for (const item of priorityGroups) {
      if (item.priority in priorityDistribution) {
        priorityDistribution[item.priority as TaskPriority] = item._count.id;
      }
    }

    // 6. Calculate Overview Rates
    const completedTasks = statusDistribution.DONE;
    const openTasks = totalTasks - completedTasks;
    const unassignedTasks = totalTasks - assignedTasks;

    // Task completion rate: (completedTasks / totalTasks) * 100
    const completionRate =
      totalTasks > 0
        ? Math.round((completedTasks / totalTasks) * 10000) / 100
        : 0;

    // Assignment coverage: (assignedTasks / totalTasks) * 100
    const assignmentCoverage =
      totalTasks > 0
        ? Math.round((assignedTasks / totalTasks) * 10000) / 100
        : 0;

    // On-time completion rate: completed tasks where completedAt <= dueDate
    const onTimeCount = completedWithDue.filter(
      (t) => t.completedAt && t.dueDate && t.completedAt <= t.dueDate,
    ).length;
    const onTimeCompletionRate =
      completedWithDue.length > 0
        ? Math.round((onTimeCount / completedWithDue.length) * 10000) / 100
        : 0;

    // 7. Build Project Progress Breakdown
    const projectTaskMap = new Map<string, number>();
    for (const item of projectTaskCounts) {
      projectTaskMap.set(item.projectId, item._count.id);
    }

    const projectCompletedMap = new Map<string, number>();
    for (const item of projectCompletedCounts) {
      projectCompletedMap.set(item.projectId, item._count.id);
    }

    const projectOverdueMap = new Map<string, number>();
    for (const item of projectOverdueCounts) {
      projectOverdueMap.set(item.projectId, item._count.id);
    }

    const projectProgress: ProjectProgressItem[] = projectRecords.map((p) => {
      const pTotal = projectTaskMap.get(p.id) ?? 0;
      const pCompleted = projectCompletedMap.get(p.id) ?? 0;
      const pOverdue = projectOverdueMap.get(p.id) ?? 0;
      const progressPercentage =
        pTotal > 0 ? Math.round((pCompleted / pTotal) * 10000) / 100 : 0;

      return {
        id: p.id,
        name: p.name,
        totalTasks: pTotal,
        completedTasks: pCompleted,
        overdueTasks: pOverdue,
        progressPercentage,
      };
    });

    // 8. Build Workload by Assignee
    const distinctAssigneeIds = assigneeTotalCounts
      .map((item) => item.assigneeId)
      .filter((id): id is string => Boolean(id));

    const users =
      distinctAssigneeIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: distinctAssigneeIds } },
            select: { id: true, name: true, email: true, avatarUrl: true },
          })
        : [];

    const userMap = new Map(users.map((u) => [u.id, u]));

    const assigneeOpenMap = new Map(
      assigneeOpenCounts.map((i) => [i.assigneeId, i._count.id]),
    );
    const assigneeCompletedMap = new Map(
      assigneeCompletedCounts.map((i) => [i.assigneeId, i._count.id]),
    );
    const assigneeOverdueMap = new Map(
      assigneeOverdueCounts.map((i) => [i.assigneeId, i._count.id]),
    );
    const assigneeDueTodayMap = new Map(
      assigneeDueTodayCounts.map((i) => [i.assigneeId, i._count.id]),
    );

    const workloadByAssignee: AssigneeWorkloadItem[] = assigneeTotalCounts.map(
      (item) => {
        const aId = item.assigneeId;
        const total = item._count.id;
        const open = assigneeOpenMap.get(aId) ?? 0;
        const completed = assigneeCompletedMap.get(aId) ?? 0;
        const overdue = assigneeOverdueMap.get(aId) ?? 0;
        const dueToday = assigneeDueTodayMap.get(aId) ?? 0;

        if (!aId) {
          return {
            userId: null,
            name: 'Unassigned',
            email: null,
            avatarUrl: null,
            totalTasks: total,
            openTasks: open,
            completedTasks: completed,
            overdueTasks: overdue,
            dueTodayTasks: dueToday,
          };
        }

        const user = userMap.get(aId);
        return {
          userId: aId,
          name: user?.name ?? 'Unknown User',
          email: user?.email ?? null,
          avatarUrl: user?.avatarUrl ?? null,
          totalTasks: total,
          openTasks: open,
          completedTasks: completed,
          overdueTasks: overdue,
          dueTodayTasks: dueToday,
        };
      },
    );

    // Sort assignees: named users with open tasks first, then unassigned last
    workloadByAssignee.sort((a, b) => {
      if (a.userId === null) return 1;
      if (b.userId === null) return -1;
      return b.openTasks - a.openTasks || b.totalTasks - a.totalTasks;
    });

    return {
      orgId,
      projectId: projectId ?? null,
      overview: {
        totalTasks,
        completedTasks,
        openTasks,
        overdueTasks,
        completionRate,
        onTimeCompletionRate,
        assignmentCoverage,
        assignedTasks,
        unassignedTasks,
      },
      statusDistribution,
      priorityDistribution,
      projectProgress,
      workloadByAssignee,
    };
  }
}

export const analyticsService = new AnalyticsService();
