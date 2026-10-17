import { Router, type Request, type Response, type NextFunction } from 'express';
import type { OrganizationMember, Workspace } from '@prisma/client';
import { addTeamMemberSchema, createTeamSchema, updateTeamSchema } from '@qveto/shared';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { teamService } from '../services/team.service.js';

interface WorkspaceRequest extends AuthenticatedRequest {
  workspace: Workspace;
  orgMembership: OrganizationMember;
}

interface TeamRequest extends AuthenticatedRequest {
  teamWorkspace: Workspace;
  orgMembership: OrganizationMember;
  isTeamMember: boolean;
}

function routeParam(req: Request, name: string): string {
  const value = req.params[name];
  const resolved = Array.isArray(value) ? value[0] : value;
  if (!resolved) throw new AppError(400, 'BAD_REQUEST', `Missing ${name}`);
  return resolved;
}

async function requireWorkspaceAccess(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const workspaceId = routeParam(req, 'workspaceId');
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) throw new AppError(404, 'NOT_FOUND', 'Workspace not found');
    const authReq = req as WorkspaceRequest;
    const membership = await prisma.organizationMember.findUnique({
      where: { userId_orgId: { userId: authReq.user.id, orgId: workspace.orgId } },
    });
    if (!membership) throw new AppError(403, 'FORBIDDEN', 'Access denied. You are not a member of this organization.');
    if (workspace.archivedAt && membership.role === 'EMPLOYEE') {
      throw new AppError(403, 'FORBIDDEN', 'Archived workspaces are only visible to Owners and Managers');
    }
    authReq.workspace = workspace;
    authReq.orgMembership = membership;
    next();
  } catch (error) {
    next(error);
  }
}

async function requireTeamAccess(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const team = await prisma.team.findUnique({
      where: { id: routeParam(req, 'teamId') },
      include: { workspace: true, members: { where: { userId: (req as AuthenticatedRequest).user.id }, select: { id: true } } },
    });
    if (!team) throw new AppError(404, 'NOT_FOUND', 'Team not found');
    const authReq = req as TeamRequest;
    const membership = await prisma.organizationMember.findUnique({
      where: { userId_orgId: { userId: authReq.user.id, orgId: team.workspace.orgId } },
    });
    if (!membership) throw new AppError(403, 'FORBIDDEN', 'Access denied. You are not a member of this organization.');
    if (team.workspace.archivedAt && membership.role === 'EMPLOYEE') {
      throw new AppError(403, 'FORBIDDEN', 'Archived workspaces are only visible to Owners and Managers');
    }
    const isManager = membership.role === 'OWNER' || membership.role === 'MANAGER';
    const isTeamMember = team.members.length > 0;
    if (!isManager && !isTeamMember) throw new AppError(403, 'FORBIDDEN', 'Team membership is required to access this team');
    authReq.teamWorkspace = team.workspace;
    authReq.orgMembership = membership;
    authReq.isTeamMember = isTeamMember;
    next();
  } catch (error) {
    next(error);
  }
}

function requireTeamManager(req: Request, _res: Response, next: NextFunction): void {
  const role = (req as WorkspaceRequest | TeamRequest).orgMembership?.role;
  if (role !== 'OWNER' && role !== 'MANAGER') {
    next(new AppError(403, 'FORBIDDEN', 'Only Owners and Managers may manage teams'));
    return;
  }
  next();
}

const teamRouter: ReturnType<typeof Router> = Router();

teamRouter.get('/workspaces/:workspaceId/teams', requireAuth, requireWorkspaceAccess, async (req, res, next) => {
  try {
    const scopedReq = req as WorkspaceRequest;
    const canManage = scopedReq.orgMembership.role === 'OWNER' || scopedReq.orgMembership.role === 'MANAGER';
    res.status(200).json({ teams: await teamService.list(scopedReq.workspace.id, scopedReq.user.id, canManage) });
  } catch (error) { next(error); }
});

teamRouter.post('/workspaces/:workspaceId/teams', requireAuth, requireWorkspaceAccess, requireTeamManager, async (req, res, next) => {
  try {
    const scopedReq = req as WorkspaceRequest;
    const input = createTeamSchema.parse(req.body);
    res.status(201).json({ team: await teamService.create(scopedReq.workspace.id, input) });
  } catch (error) { next(error); }
});

teamRouter.get('/teams/:teamId', requireAuth, requireTeamAccess, async (req, res, next) => {
  try { res.status(200).json({ team: await teamService.get(routeParam(req, 'teamId')) }); }
  catch (error) { next(error); }
});

teamRouter.patch('/teams/:teamId', requireAuth, requireTeamAccess, requireTeamManager, async (req, res, next) => {
  try {
    const input = updateTeamSchema.parse(req.body);
    res.status(200).json({ team: await teamService.update(routeParam(req, 'teamId'), input) });
  } catch (error) { next(error); }
});

teamRouter.post('/teams/:teamId/members', requireAuth, requireTeamAccess, requireTeamManager, async (req, res, next) => {
  try {
    const { userId } = addTeamMemberSchema.parse(req.body);
    res.status(201).json({ team: await teamService.addMember(routeParam(req, 'teamId'), userId) });
  } catch (error) { next(error); }
});

teamRouter.delete('/teams/:teamId/members/:userId', requireAuth, requireTeamAccess, requireTeamManager, async (req, res, next) => {
  try { res.status(200).json({ team: await teamService.removeMember(routeParam(req, 'teamId'), routeParam(req, 'userId')) }); }
  catch (error) { next(error); }
});

export { teamRouter };
