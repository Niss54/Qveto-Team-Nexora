import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

const projectInclude = {
  members: {
    where: { role: 'OWNER' },
    select: { userId: true },
  },
} satisfies Prisma.ProjectInclude;

const projectMemberInclude = {
  user: { select: { id: true, name: true, email: true } },
} satisfies Prisma.ProjectMemberInclude;

type ProjectWithOwnerMembership = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>;
type ProjectMemberWithUser = Prisma.ProjectMemberGetPayload<{ include: typeof projectMemberInclude }>;

function serializeProject(project: ProjectWithOwnerMembership) {
  // The current schema has no Project.ownerId or project date columns. Derive
  // an owner only when exactly one explicit OWNER membership exists; never
  // choose arbitrarily if legacy membership data is inconsistent.
  const ownerId = project.members.length === 1 ? project.members[0]?.userId ?? null : null;

  return {
    id: project.id,
    name: project.name,
    description: project.description,
    status: project.status,
    startDate: null,
    dueDate: null,
    ownerId,
    workspaceId: project.workspaceId,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

function serializeMember(member: ProjectMemberWithUser) {
  return {
    id: member.id,
    userId: member.userId,
    projectId: member.projectId,
    role: member.role,
    joinedAt: member.joinedAt.toISOString(),
    user: member.user,
  };
}

export class ProjectService {
  async list(workspaceId: string, userId: string, canManage: boolean, page: number, pageSize: number, includeArchived: boolean) {
    const where: Prisma.ProjectWhereInput = {
      workspaceId,
      ...(includeArchived ? {} : { status: { not: 'ARCHIVED' } }),
      ...(!canManage ? { members: { some: { userId } } } : {}),
    };
    const [total, rows] = await prisma.$transaction([
      prisma.project.count({ where }),
      prisma.project.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: projectInclude,
      }),
    ]);

    return {
      data: rows.map(serializeProject),
      meta: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async get(projectId: string) {
    const project = await prisma.project.findUnique({ where: { id: projectId }, include: projectInclude });
    if (!project) throw new AppError(404, 'NOT_FOUND', 'Project not found');
    return serializeProject(project);
  }

  async listMembers(projectId: string) {
    const members = await prisma.projectMember.findMany({
      where: { projectId },
      orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
      include: projectMemberInclude,
    });
    return members.map(serializeMember);
  }

  async addMember(projectId: string, userId: string) {
    try {
      await prisma.$transaction(async (tx) => {
        const project = await tx.project.findUnique({
          where: { id: projectId },
          select: { status: true, workspace: { select: { orgId: true } } },
        });
        if (!project) throw new AppError(404, 'NOT_FOUND', 'Project not found');
        if (project.status === 'ARCHIVED') throw new AppError(409, 'CONFLICT', 'Archived projects cannot be modified');

        const organizationMember = await tx.organizationMember.findUnique({
          where: { userId_orgId: { userId, orgId: project.workspace.orgId } },
          select: { id: true },
        });
        if (!organizationMember) {
          throw new AppError(400, 'BAD_REQUEST', 'Project members must belong to the project organization');
        }

        await tx.projectMember.create({ data: { projectId, userId, role: 'MEMBER' } });
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        throw new AppError(409, 'CONFLICT', 'User is already a member of this project');
      }
      throw error;
    }
    return this.get(projectId);
  }

  async removeMember(projectId: string, userId: string) {
    await prisma.$transaction(async (tx) => {
      const project = await tx.project.findUnique({
        where: { id: projectId },
        select: { status: true },
      });
      if (!project) throw new AppError(404, 'NOT_FOUND', 'Project not found');
      if (project.status === 'ARCHIVED') throw new AppError(409, 'CONFLICT', 'Archived projects cannot be modified');

      const membership = await tx.projectMember.findUnique({
        where: { userId_projectId: { userId, projectId } },
        select: { role: true },
      });
      if (!membership) throw new AppError(404, 'NOT_FOUND', 'Project membership not found');
      if (membership.role === 'OWNER') {
        throw new AppError(409, 'CONFLICT', 'Transfer project ownership before removing the owner');
      }

      await tx.projectMember.deleteMany({ where: { userId, projectId, role: { not: 'OWNER' } } });
    });
    return this.get(projectId);
  }

  async archive(projectId: string) {
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) throw new AppError(404, 'NOT_FOUND', 'Project not found');
    await prisma.project.update({ where: { id: projectId }, data: { status: 'ARCHIVED' } });
    return this.get(projectId);
  }

  async restore(projectId: string) {
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { status: true } });
    if (!project) throw new AppError(404, 'NOT_FOUND', 'Project not found');
    if (project.status !== 'ARCHIVED') throw new AppError(409, 'CONFLICT', 'Only archived projects can be restored');

    // The current Project schema does not preserve the prior status. Use the
    // explicitly documented ACTIVE default instead of guessing at a legacy value.
    await prisma.project.update({ where: { id: projectId }, data: { status: 'ACTIVE' } });
    return this.get(projectId);
  }
}

export const projectService = new ProjectService();
