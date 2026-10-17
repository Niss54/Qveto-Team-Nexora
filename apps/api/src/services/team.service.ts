import type { Prisma } from '@prisma/client';
import type { CreateTeamInput, UpdateTeamInput } from '@qveto/shared';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

const teamInclude = {
  members: {
    orderBy: { joinedAt: 'asc' as const },
    include: { user: { select: { id: true, name: true, email: true } } },
  },
};

function serializeTeam(team: Prisma.TeamGetPayload<{ include: typeof teamInclude }>) {
  return {
    ...team,
    createdAt: team.createdAt.toISOString(),
    updatedAt: team.updatedAt.toISOString(),
    members: team.members.map((membership) => ({
      ...membership,
      joinedAt: membership.joinedAt.toISOString(),
    })),
  };
}

export class TeamService {
  async list(workspaceId: string, userId: string, canManage: boolean) {
    const rows = await prisma.team.findMany({
      where: {
        workspaceId,
        ...(canManage ? {} : { members: { some: { userId } } }),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: teamInclude,
    });
    return rows.map(serializeTeam);
  }

  async get(teamId: string) {
    const team = await prisma.team.findUnique({ where: { id: teamId }, include: teamInclude });
    if (!team) throw new AppError(404, 'NOT_FOUND', 'Team not found');
    return serializeTeam(team);
  }

  async create(workspaceId: string, input: CreateTeamInput) {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { archivedAt: true } });
    if (!workspace) throw new AppError(404, 'NOT_FOUND', 'Workspace not found');
    if (workspace.archivedAt) throw new AppError(409, 'CONFLICT', 'Archived workspaces cannot receive new teams');
    const team = await prisma.team.create({
      data: { ...input, name: input.name.trim(), description: input.description?.trim() || null, workspaceId },
      include: teamInclude,
    });
    return serializeTeam(team);
  }

  async update(teamId: string, input: UpdateTeamInput) {
    const team = await prisma.team.update({
      where: { id: teamId },
      data: {
        ...(input.name !== undefined && { name: input.name.trim() }),
        ...(input.description !== undefined && { description: input.description?.trim() || null }),
      },
      include: teamInclude,
    });
    return serializeTeam(team);
  }

  async addMember(teamId: string, userId: string) {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: { workspace: { select: { orgId: true, archivedAt: true } } },
    });
    if (!team) throw new AppError(404, 'NOT_FOUND', 'Team not found');
    const membership = await prisma.organizationMember.findUnique({
      where: { userId_orgId: { userId, orgId: team.workspace.orgId } },
      select: { id: true },
    });
    if (!membership) throw new AppError(400, 'BAD_REQUEST', 'Team members must belong to the workspace organization');

    try {
      await prisma.teamMember.create({ data: { teamId, userId }, select: { id: true } });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        throw new AppError(409, 'CONFLICT', 'User is already a member of this team');
      }
      throw error;
    }
    return this.get(teamId);
  }

  async removeMember(teamId: string, userId: string) {
    const result = await prisma.teamMember.deleteMany({ where: { teamId, userId } });
    if (result.count === 0) throw new AppError(404, 'NOT_FOUND', 'Team membership not found');
    return this.get(teamId);
  }
}

export const teamService = new TeamService();
