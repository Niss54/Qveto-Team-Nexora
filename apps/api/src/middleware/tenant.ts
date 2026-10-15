import type { Request, Response, NextFunction } from 'express';
import type { OrgRole } from '@qveto/shared';
import { prisma } from '../lib/prisma.js';
import { AppError } from './errorHandler.js';
import type { AuthenticatedRequest } from './auth.js';

export interface OrgMembership {
  id: string;
  orgId: string;
  userId: string;
  role: OrgRole;
}

export interface OrgScopedRequest extends AuthenticatedRequest {
  orgId: string;
  orgMembership: OrgMembership;
  orgRole: OrgRole;
}

/**
 * Middleware factory that enforces the authenticated user is a verified member
 * of the target organization specified in route params (e.g. :id or :orgId).
 *
 * Attaches verified orgId, orgMembership, and orgRole to the request.
 * Any spoofed orgId in the request body is rejected or ignored.
 */
export function requireOrgMember(paramName: string = 'id') {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const authReq = req as AuthenticatedRequest;
      if (!authReq.user) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
      }

      const paramVal = req.params[paramName];
      const orgId = Array.isArray(paramVal) ? paramVal[0] : paramVal;
      if (!orgId) {
        throw new AppError(400, 'BAD_REQUEST', `Missing route parameter: ${paramName}`);
      }

      // Query database for membership - NEVER trust client assertions
      const membership = await prisma.organizationMember.findUnique({
        where: {
          userId_orgId: {
            userId: authReq.user.id,
            orgId,
          },
        },
      });

      if (!membership) {
        // Return 403 Forbidden to deny cross-organization access
        throw new AppError(
          403,
          'FORBIDDEN',
          'Access denied. You are not a member of this organization.',
        );
      }

      const orgReq = req as OrgScopedRequest;
      orgReq.orgId = orgId;
      orgReq.orgMembership = {
        id: membership.id,
        orgId: membership.orgId,
        userId: membership.userId,
        role: membership.role as OrgRole,
      };
      orgReq.orgRole = membership.role as OrgRole;

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware factory that restricts access to users having one of the permitted roles
 * (e.g. OWNER, MANAGER, EMPLOYEE) within the organization.
 *
 * Must be preceded by requireOrgMember.
 */
export function requireOrgRole(allowedRoles: OrgRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const orgReq = req as OrgScopedRequest;
      if (!orgReq.orgRole) {
        throw new AppError(
          500,
          'INTERNAL_ERROR',
          'requireOrgRole must be used after requireOrgMember',
        );
      }

      if (!allowedRoles.includes(orgReq.orgRole)) {
        throw new AppError(
          403,
          'FORBIDDEN',
          `Insufficient organization permissions. Required role: ${allowedRoles.join(' or ')} (your role: ${orgReq.orgRole})`,
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Helper to verify that a resource belongs to the user's organization.
 * Throws a 403 Forbidden error if cross-tenant access is attempted.
 */
export function verifyResourceOrg(resourceOrgId: string, verifiedOrgId: string): void {
  if (resourceOrgId !== verifiedOrgId) {
    throw new AppError(
      403,
      'FORBIDDEN',
      'Cross-organization access denied. Resource does not belong to your organization.',
    );
  }
}
