import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null &&
    'code' in error && error.code === 'P2002';
}

export class LabelService {
  private async authorizeProject(projectId: string, userId: string) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { workspace: { select: { orgId: true } } },
    });
    if (!project) throw new AppError(404, 'NOT_FOUND', 'Project not found');

    const orgId = project.workspace.orgId;
    const [organizationMember, projectMember] = await Promise.all([
      prisma.organizationMember.findUnique({
        where: { userId_orgId: { userId, orgId } },
      }),
      prisma.projectMember.findUnique({
        where: { userId_projectId: { userId, projectId } },
      }),
    ]);
    if (!organizationMember || !projectMember) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have access to this project');
    }
    return orgId;
  }

  private async authorizeTask(taskId: string, userId: string) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, projectId: true, archivedAt: true },
    });
    if (!task || task.archivedAt) {
      throw new AppError(404, 'NOT_FOUND', 'Task not found');
    }
    const orgId = await this.authorizeProject(task.projectId, userId);
    return { task, orgId };
  }

  async listProjectLabels(projectId: string, userId: string) {
    const orgId = await this.authorizeProject(projectId, userId);
    const labels = await prisma.label.findMany({
      where: { orgId },
      orderBy: { name: 'asc' },
    });
    return { data: labels };
  }

  async createProjectLabel(projectId: string, userId: string, name: string, color: string) {
    const orgId = await this.authorizeProject(projectId, userId);
    try {
      return await prisma.label.create({ data: { orgId, name, color } });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(409, 'CONFLICT', 'A label with this name already exists');
      }
      throw error;
    }
  }

  async listTaskLabels(taskId: string, userId: string) {
    const { orgId } = await this.authorizeTask(taskId, userId);
    const links = await prisma.taskLabel.findMany({
      where: { taskId, label: { orgId } },
      include: { label: true },
      orderBy: { label: { name: 'asc' } },
    });
    return { data: links.map((link) => link.label) };
  }

  async addTaskLabel(taskId: string, userId: string, labelId: string) {
    const { orgId } = await this.authorizeTask(taskId, userId);
    const label = await prisma.label.findFirst({ where: { id: labelId, orgId } });
    if (!label) throw new AppError(400, 'VALIDATION_ERROR', 'Label must belong to the task organization');

    try {
      await prisma.$transaction(async (tx) => {
        // Recheck the task inside the transaction to reject a recently archived task.
        const activeTask = await tx.task.findFirst({
          where: { id: taskId, archivedAt: null },
          select: { id: true },
        });
        if (!activeTask) throw new AppError(404, 'NOT_FOUND', 'Task not found');
        await tx.taskLabel.create({ data: { taskId, labelId } });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(409, 'CONFLICT', 'Label is already attached to this task');
      }
      throw error;
    }
    return label;
  }

  async removeTaskLabel(taskId: string, userId: string, labelId: string) {
    const { orgId } = await this.authorizeTask(taskId, userId);
    const label = await prisma.label.findFirst({ where: { id: labelId, orgId } });
    if (!label) throw new AppError(404, 'NOT_FOUND', 'Label not found');
    const result = await prisma.taskLabel.deleteMany({ where: { taskId, labelId } });
    if (result.count === 0) {
      throw new AppError(404, 'NOT_FOUND', 'Label is not attached to this task');
    }
    return { removed: true, labelId };
  }
}

export const labelService = new LabelService();
