import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  createOrgSchema,
  updateOrgSchema,
  addMemberSchema,
  updateMemberRoleSchema,
} from '@qveto/shared';
import { organizationService } from '../services/organization.service.js';
import {
  requireAuth,
  requireOrgMember,
  requireOrgRole,
  type AuthenticatedRequest,
  type OrgScopedRequest,
} from '../middleware/index.js';

const organizationRouter: ReturnType<typeof Router> = Router();

// All organization routes require authenticated user
organizationRouter.use(requireAuth);

/**
 * POST /api/organizations
 * Create a new organization. Current user becomes OWNER.
 */
organizationRouter.post(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const validated = createOrgSchema.parse(req.body);
      const org = await organizationService.createOrganization(authReq.user.id, validated);
      res.status(201).json({ organization: org });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/organizations
 * List all organizations the authenticated user belongs to.
 */
organizationRouter.get(
  '/',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      const organizations = await organizationService.getUserOrganizations(authReq.user.id);
      res.status(200).json({ organizations });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/organizations/:id
 * Get details of an organization. User must be a verified member.
 */
organizationRouter.get(
  '/:id',
  requireOrgMember('id'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgReq = req as OrgScopedRequest;
      const org = await organizationService.getOrganizationById(orgReq.orgId, orgReq.user.id);
      res.status(200).json({ organization: org });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * PATCH /api/organizations/:id
 * Update organization details. Only OWNER can perform this.
 */
organizationRouter.patch(
  '/:id',
  requireOrgMember('id'),
  requireOrgRole(['OWNER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgReq = req as OrgScopedRequest;
      const validated = updateOrgSchema.parse(req.body);
      const updated = await organizationService.updateOrganization(orgReq.orgId, validated);
      res.status(200).json({ organization: updated });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * PUT /api/organizations/:id
 * Alias for update organization
 */
organizationRouter.put(
  '/:id',
  requireOrgMember('id'),
  requireOrgRole(['OWNER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgReq = req as OrgScopedRequest;
      const validated = updateOrgSchema.parse(req.body);
      const updated = await organizationService.updateOrganization(orgReq.orgId, validated);
      res.status(200).json({ organization: updated });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/organizations/:id/members
 * List all members of an organization. Must be an org member.
 */
organizationRouter.get(
  '/:id/members',
  requireOrgMember('id'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgReq = req as OrgScopedRequest;
      const members = await organizationService.getMembers(orgReq.orgId);
      res.status(200).json({ members });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/organizations/:id/members
 * Add a member to the organization by email. Only OWNER can perform this.
 */
organizationRouter.post(
  '/:id/members',
  requireOrgMember('id'),
  requireOrgRole(['OWNER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgReq = req as OrgScopedRequest;
      const validated = addMemberSchema.parse(req.body);
      const member = await organizationService.addMember(orgReq.orgId, validated);
      res.status(201).json({ member });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * PATCH /api/organizations/:id/members/:userId
 * Change a member's role. Only OWNER can perform this.
 */
organizationRouter.patch(
  '/:id/members/:userId',
  requireOrgMember('id'),
  requireOrgRole(['OWNER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgReq = req as OrgScopedRequest;
      const targetUserId = Array.isArray(req.params.userId)
        ? req.params.userId[0]
        : req.params.userId;
      const validated = updateMemberRoleSchema.parse(req.body);
      const updated = await organizationService.updateMemberRole(
        orgReq.orgId,
        targetUserId!,
        validated.role,
      );
      res.status(200).json({ member: updated });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * DELETE /api/organizations/:id/members/:userId
 * Remove a member from the organization. Only OWNER can perform this.
 */
organizationRouter.delete(
  '/:id/members/:userId',
  requireOrgMember('id'),
  requireOrgRole(['OWNER']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const orgReq = req as OrgScopedRequest;
      const targetUserId = Array.isArray(req.params.userId)
        ? req.params.userId[0]
        : req.params.userId;
      const result = await organizationService.removeMember(orgReq.orgId, targetUserId!);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
);

export { organizationRouter };
