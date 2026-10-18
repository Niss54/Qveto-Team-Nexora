import { Router, type Request, type Response, type NextFunction } from 'express';
import type { Workspace } from '@prisma/client';
import {
  createWorkspaceSchema,
  updateWorkspaceSchema,
  workspaceListQuerySchema,
} from '@qveto/shared';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  requireAuth,
  requireOrgMember,
  requireOrgRole,
  type OrgScopedRequest,
} from '../middleware/index.js';
import { workspaceService } from '../services/workspace.service.js';

interface WorkspaceScopedRequest extends OrgScopedRequest {
  workspace: Workspace;
}

async function requireWorkspaceMember(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const param = req.params.workspaceId;
    const workspaceId = Array.isArray(param) ? param[0] : param;
    if (!workspaceId) throw new AppError(400, 'BAD_REQUEST', 'Missing workspaceId');

    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) throw new AppError(404, 'NOT_FOUND', 'Workspace not found');

    const scopedReq = req as WorkspaceScopedRequest;
    const membership = await prisma.organizationMember.findUnique({
      where: { userId_orgId: { userId: scopedReq.user.id, orgId: workspace.orgId } },
    });
    if (!membership) {
      throw new AppError(403, 'FORBIDDEN', 'Access denied. You are not a member of this organization.');
    }

    scopedReq.orgId = workspace.orgId;
    scopedReq.orgMembership = {
      id: membership.id,
      orgId: membership.orgId,
      userId: membership.userId,
      role: membership.role,
    };
    scopedReq.orgRole = membership.role;
    scopedReq.workspace = workspace;

    if (workspace.archivedAt && membership.role === 'EMPLOYEE') {
      throw new AppError(403, 'FORBIDDEN', 'Archived workspaces are only visible to Owners and Managers');
    }
    next();
  } catch (error) {
    next(error);
  }
}

const workspaceRouter: ReturnType<typeof Router> = Router();

workspaceRouter.get(
  '/organizations/:orgId/workspaces',
  requireAuth,
  requireOrgMember('orgId'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scopedReq = req as OrgScopedRequest;
      const query = workspaceListQuerySchema.parse(req.query);
      if (query.includeArchived && !['OWNER', 'MANAGER'].includes(scopedReq.orgRole)) {
        throw new AppError(403, 'FORBIDDEN', 'Only Owners and Managers may list archived workspaces');
      }
      const result = await workspaceService.list(scopedReq.orgId, query.page, query.pageSize, query.includeArchived);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
);

workspaceRouter.post(
  '/organizations/:orgId/workspaces',
  requireAuth,
  requireOrgMember('orgId'),
  requireOrgRole(['OWNER', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scopedReq = req as OrgScopedRequest;
      const validated = createWorkspaceSchema.parse(req.body);
      const workspace = await workspaceService.create(scopedReq.orgId, validated);
      res.status(201).json({ workspace });
    } catch (error) {
      next(error);
    }
  },
);

workspaceRouter.get(
  '/workspaces/:workspaceId',
  requireAuth,
  requireWorkspaceMember,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scopedReq = req as WorkspaceScopedRequest;
      res.status(200).json({ workspace: await workspaceService.get(scopedReq.workspace) });
    } catch (error) {
      next(error);
    }
  },
);

workspaceRouter.patch(
  '/workspaces/:workspaceId',
  requireAuth,
  requireWorkspaceMember,
  requireOrgRole(['OWNER', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = updateWorkspaceSchema.parse(req.body);
      const workspace = await workspaceService.update(req.params.workspaceId as string, validated);
      res.status(200).json({ workspace });
    } catch (error) {
      next(error);
    }
  },
);

workspaceRouter.post(
  '/workspaces/:workspaceId/archive',
  requireAuth,
  requireWorkspaceMember,
  requireOrgRole(['OWNER', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const workspace = await workspaceService.archive(req.params.workspaceId as string);
      res.status(200).json({ workspace });
    } catch (error) {
      next(error);
    }
  },
);

workspaceRouter.post(
  '/workspaces/:workspaceId/restore',
  requireAuth,
  requireWorkspaceMember,
  requireOrgRole(['OWNER', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scopedReq = req as WorkspaceScopedRequest;
      const workspace = await workspaceService.restore(scopedReq.workspace);
      res.status(200).json({ workspace });
    } catch (error) {
      next(error);
    }
  },
);

export { workspaceRouter };
