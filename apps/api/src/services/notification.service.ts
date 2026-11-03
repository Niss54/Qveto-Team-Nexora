import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

export class NotificationService {
  /**
   * GET /api/notifications
   * List in-app notifications for the authenticated user.
   */
  async listUserNotifications(
    userId: string,
    orgId?: string,
    query: {
      unreadOnly?: boolean;
      page?: number;
      pageSize?: number;
    } = {},
  ) {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize || 20));
    const skip = (page - 1) * pageSize;

    const whereClause: {
      userId: string;
      orgId?: string;
      isRead?: boolean;
    } = {
      userId,
      ...(orgId && { orgId }),
      ...(query.unreadOnly ? { isRead: false } : {}),
    };

    const [total, notifications] = await Promise.all([
      prisma.notification.count({ where: whereClause }),
      prisma.notification.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
    ]);

    return {
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.message,
        isRead: n.isRead,
        userId: n.userId,
        orgId: n.orgId,
        relatedEntityType: n.relatedEntityType,
        relatedEntityId: n.relatedEntityId,
        createdAt: n.createdAt.toISOString(),
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize) || 1,
      },
    };
  }

  /**
   * GET /api/notifications/unread-count
   * Return unread count for badge indicator.
   */
  async getUnreadCount(userId: string, orgId?: string) {
    const count = await prisma.notification.count({
      where: {
        userId,
        isRead: false,
        ...(orgId && { orgId }),
      },
    });

    return { unreadCount: count };
  }

  /**
   * PATCH /api/notifications/:id/read
   * Mark a single notification as read.
   */
  async markAsRead(notificationId: string, userId: string) {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new AppError(404, 'NOT_FOUND', 'Notification not found');
    }

    if (notification.userId !== userId) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'You cannot mark another user\'s notification as read',
      );
    }

    const updated = await prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });

    return {
      id: updated.id,
      isRead: updated.isRead,
    };
  }

  /**
   * PATCH /api/notifications/read-all
   * Mark all unread notifications for user as read.
   */
  async markAllAsRead(userId: string, orgId?: string) {
    const result = await prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
        ...(orgId && { orgId }),
      },
      data: { isRead: true },
    });

    return { updatedCount: result.count };
  }

  /**
   * Scheduled or on-demand check for overdue tasks.
   * Finds open tasks with dueDate < now() and dispatches deduplicated alerts.
   */
  async checkAndAlertOverdueTasks(orgId?: string) {
    const now = new Date();

    const overdueTasks = await prisma.task.findMany({
      where: {
        archivedAt: null,
        status: { not: 'DONE' },
        dueDate: { lt: now },
        assigneeId: { not: null },
        ...(orgId
          ? {
              project: {
                workspace: { orgId },
              },
            }
          : {}),
      },
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

    let createdAlerts = 0;

    for (const task of overdueTasks) {
      if (!task.assigneeId) continue;
      const taskOrgId = task.project.workspace.orgId;

      // Deduplicate: check if an overdue alert already exists for this task & assignee
      const existing = await prisma.notification.findFirst({
        where: {
          type: 'TASK_OVERDUE',
          userId: task.assigneeId,
          relatedEntityType: 'TASK',
          relatedEntityId: task.id,
        },
      });

      if (!existing) {
        await prisma.notification.create({
          data: {
            type: 'TASK_OVERDUE',
            title: 'Task Overdue',
            message: `Task "${task.title}" is overdue (was due ${task.dueDate?.toISOString().split('T')[0]})`,
            userId: task.assigneeId,
            orgId: taskOrgId,
            relatedEntityType: 'TASK',
            relatedEntityId: task.id,
          },
        });
        createdAlerts++;
      }
    }

    return { checkedTasks: overdueTasks.length, newAlertsCreated: createdAlerts };
  }
}

export const notificationService = new NotificationService();
