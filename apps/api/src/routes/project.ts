import { Router, type NextFunction, type Request, type Response } from 'express';
import type { OrganizationMember, Workspace } from '@prisma/client';
import { addProjectMemberSchema, projectListQuerySchema } from '@qveto/shared';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { projectService } from '../services/project.service.js';

interface WorkspaceRequest extends AuthenticatedRequest {
  workspace: Workspace;
  orgMembership: OrganizationMember;
}

interface ProjectAccessRequest extends AuthenticatedRequest {
  projectOrgId: string;
  orgMembership: OrganizationMember;
  isProjectMember: boolean;
  projectMemberRole: string | null;
  projectStatus: string;
}

function routeParam(req: Request, name: string): string {
  const value = req.params[name];
  const resolved = Array.isArray(value) ? value[0] : value;
  if (!resolved) throw new AppError(400, 'BAD_REQUEST', `Missing ${name}`);
  return resolved;
}

async function requireWorkspaceAccess(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: routeParam(req, 'workspaceId') },
    });
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

async function requireProjectAccess(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const project = await prisma.project.findUnique({
      where: { id: routeParam(req, 'projectId') },
      select: {
        status: true,
        workspace: { select: { orgId: true, archivedAt: true } },
        members: { where: { userId: (req as AuthenticatedRequest).user.id }, select: { id: true, role: true } },
      },
    });
    if (!project) throw new AppError(404, 'NOT_FOUND', 'Project not found');

    const authReq = req as ProjectAccessRequest;
    const membership = await prisma.organizationMember.findUnique({
      where: { userId_orgId: { userId: authReq.user.id, orgId: project.workspace.orgId } },
    });
    if (!membership) throw new AppError(403, 'FORBIDDEN', 'Access denied. You are not a member of this organization.');
    if (project.workspace.archivedAt && membership.role === 'EMPLOYEE') {
      throw new AppError(403, 'FORBIDDEN', 'Archived workspaces are only visible to Owners and Managers');
    }

    const isProjectMember = project.members.length > 0;
    const canManageOrganization = membership.role === 'OWNER' || membership.role === 'MANAGER';
    if (!canManageOrganization && !isProjectMember) {
      throw new AppError(403, 'FORBIDDEN', 'Project membership is required to access this project');
    }

    authReq.projectOrgId = project.workspace.orgId;
    authReq.orgMembership = membership;
    authReq.isProjectMember = isProjectMember;
    authReq.projectMemberRole = project.members[0]?.role ?? null;
    authReq.projectStatus = project.status;
    next();
  } catch (error) {
    next(error);
  }
}

function requireProjectManager(req: Request, _res: Response, next: NextFunction): void {
  const scopedReq = req as ProjectAccessRequest;
  const canManageOrganization = scopedReq.orgMembership.role === 'OWNER' || scopedReq.orgMembership.role === 'MANAGER';
  if (!canManageOrganization && scopedReq.projectMemberRole !== 'OWNER') {
    next(new AppError(403, 'FORBIDDEN', 'Only organization Owners, Managers, or the project Owner may manage membership'));
    return;
  }
  next();
}

function requireActiveProject(req: Request, _res: Response, next: NextFunction): void {
  if ((req as ProjectAccessRequest).projectStatus === 'ARCHIVED') {
    next(new AppError(409, 'CONFLICT', 'Archived projects cannot be modified'));
    return;
  }
  next();
}

const projectRouter: ReturnType<typeof Router> = Router();

projectRouter.get('/workspaces/:workspaceId/projects', requireAuth, requireWorkspaceAccess, async (req, res, next) => {
  try {
    const scopedReq = req as WorkspaceRequest;
    const query = projectListQuerySchema.parse(req.query);
    const canManage = scopedReq.orgMembership.role === 'OWNER' || scopedReq.orgMembership.role === 'MANAGER';
    res.status(200).json(await projectService.list(
      scopedReq.workspace.id,
      scopedReq.user.id,
      canManage,
      query.page,
      query.pageSize,
      query.includeArchived,
    ));
  } catch (error) { next(error); }
});

projectRouter.get('/projects/:projectId', requireAuth, requireProjectAccess, async (req, res, next) => {
  try {
    res.status(200).json({ project: await projectService.get(routeParam(req, 'projectId')) });
  } catch (error) { next(error); }
});

projectRouter.get('/projects/:projectId/members', requireAuth, requireProjectAccess, async (req, res, next) => {
  try {
    res.status(200).json({ members: await projectService.listMembers(routeParam(req, 'projectId')) });
  } catch (error) { next(error); }
});

projectRouter.post('/projects/:projectId/members', requireAuth, requireProjectAccess, requireProjectManager, requireActiveProject, async (req, res, next) => {
  try {
    const { userId } = addProjectMemberSchema.parse(req.body);
    const project = await projectService.addMember(routeParam(req, 'projectId'), userId);
    res.status(201).json({ project });
  } catch (error) { next(error); }
});

projectRouter.delete('/projects/:projectId/members/:userId', requireAuth, requireProjectAccess, requireProjectManager, requireActiveProject, async (req, res, next) => {
  try {
    const project = await projectService.removeMember(routeParam(req, 'projectId'), routeParam(req, 'userId'));
    res.status(200).json({ project });
  } catch (error) { next(error); }
});

projectRouter.post('/projects/:projectId/archive', requireAuth, requireProjectAccess, requireProjectManager, async (req, res, next) => {
  try {
    const project = await projectService.archive(routeParam(req, 'projectId'));
    res.status(200).json({ project });
  } catch (error) { next(error); }
});

projectRouter.post('/projects/:projectId/restore', requireAuth, requireProjectAccess, requireProjectManager, async (req, res, next) => {
  try {
    const project = await projectService.restore(routeParam(req, 'projectId'));
    res.status(200).json({ project });
  } catch (error) { next(error); }
});

export { projectRouter };
