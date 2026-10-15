import type { CreateOrgInput, UpdateOrgInput, AddMemberInput, OrgRole } from '@qveto/shared';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

export class OrganizationService {
  /**
   * Generates a URL-friendly slug from an organization name
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Create a new organization. The creator is automatically assigned the OWNER role.
   */
  async createOrganization(userId: string, input: CreateOrgInput) {
    let baseSlug = input.slug || this.slugify(input.name);
    if (!baseSlug) {
      baseSlug = `org-${Date.now()}`;
    }

    // Ensure unique slug
    let slug = baseSlug;
    let counter = 1;
    while (await prisma.organization.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter++}`;
    }

    // Create organization, assign creator as OWNER, and create default workspace in a transaction
    const org = await prisma.$transaction(async (tx) => {
      const createdOrg = await tx.organization.create({
        data: {
          name: input.name.trim(),
          slug,
          description: input.description?.trim() || null,
        },
      });

      await tx.organizationMember.create({
        data: {
          orgId: createdOrg.id,
          userId,
          role: 'OWNER',
        },
      });

      // Create a default primary workspace for the new organization
      await tx.workspace.create({
        data: {
          name: 'General',
          description: 'Default primary workspace',
          orgId: createdOrg.id,
        },
      });

      return createdOrg;
    });

    return {
      ...org,
      role: 'OWNER' as OrgRole,
    };
  }

  /**
   * List all organizations that the authenticated user belongs to.
   */
  async getUserOrganizations(userId: string) {
    const memberships = await prisma.organizationMember.findMany({
      where: { userId },
      include: {
        organization: {
          include: {
            _count: {
              select: { members: true },
            },
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    return memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      description: m.organization.description,
      createdAt: m.organization.createdAt.toISOString(),
      updatedAt: m.organization.updatedAt.toISOString(),
      role: m.role as OrgRole,
      memberCount: m.organization._count.members,
    }));
  }

  /**
   * Get detailed information for an organization.
   */
  async getOrganizationById(orgId: string, userId: string) {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        workspaces: true,
        _count: {
          select: { members: true },
        },
      },
    });

    if (!org) {
      throw new AppError(404, 'NOT_FOUND', 'Organization not found');
    }

    const membership = await prisma.organizationMember.findUnique({
      where: {
        userId_orgId: {
          userId,
          orgId,
        },
      },
    });

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      description: org.description,
      createdAt: org.createdAt.toISOString(),
      updatedAt: org.updatedAt.toISOString(),
      role: (membership?.role || 'EMPLOYEE') as OrgRole,
      memberCount: org._count.members,
      workspaces: org.workspaces,
    };
  }

  /**
   * Update organization details. Only OWNER can perform this.
   */
  async updateOrganization(orgId: string, input: UpdateOrgInput) {
    const org = await prisma.organization.update({
      where: { id: orgId },
      data: {
        ...(input.name !== undefined && { name: input.name.trim() }),
        ...(input.description !== undefined && { description: input.description?.trim() || null }),
      },
    });

    return org;
  }

  /**
   * List all members of an organization.
   */
  async getMembers(orgId: string) {
    const members = await prisma.organizationMember.findMany({
      where: { orgId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
            createdAt: true,
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });

    return members.map((m) => ({
      id: m.id,
      userId: m.userId,
      orgId: m.orgId,
      role: m.role as OrgRole,
      joinedAt: m.joinedAt.toISOString(),
      user: {
        ...m.user,
        createdAt: m.user.createdAt.toISOString(),
      },
    }));
  }

  /**
   * Add a new member to an organization by email.
   */
  async addMember(orgId: string, input: AddMemberInput) {
    const userToAdd = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });

    if (!userToAdd) {
      throw new AppError(
        404,
        'NOT_FOUND',
        `No registered user found with email: ${input.email}. The user must create an account first.`,
      );
    }

    const existingMember = await prisma.organizationMember.findUnique({
      where: {
        userId_orgId: {
          userId: userToAdd.id,
          orgId,
        },
      },
    });

    if (existingMember) {
      throw new AppError(409, 'CONFLICT', 'User is already a member of this organization');
    }

    const member = await prisma.organizationMember.create({
      data: {
        orgId,
        userId: userToAdd.id,
        role: input.role,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
            createdAt: true,
          },
        },
      },
    });

    return {
      id: member.id,
      userId: member.userId,
      orgId: member.orgId,
      role: member.role as OrgRole,
      joinedAt: member.joinedAt.toISOString(),
      user: {
        ...member.user,
        createdAt: member.user.createdAt.toISOString(),
      },
    };
  }

  /**
   * Change an organization member's role.
   */
  async updateMemberRole(orgId: string, targetUserId: string, newRole: OrgRole) {
    const member = await prisma.organizationMember.findUnique({
      where: {
        userId_orgId: {
          userId: targetUserId,
          orgId,
        },
      },
    });

    if (!member) {
      throw new AppError(404, 'NOT_FOUND', 'Member not found in this organization');
    }

    // Prevent demoting the sole owner
    if (member.role === 'OWNER' && newRole !== 'OWNER') {
      const ownerCount = await prisma.organizationMember.count({
        where: { orgId, role: 'OWNER' },
      });

      if (ownerCount <= 1) {
        throw new AppError(
          400,
          'BAD_REQUEST',
          'Cannot demote the sole organization owner. Assign another owner first.',
        );
      }
    }

    const updated = await prisma.organizationMember.update({
      where: {
        userId_orgId: {
          userId: targetUserId,
          orgId,
        },
      },
      data: { role: newRole },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
            createdAt: true,
          },
        },
      },
    });

    return {
      id: updated.id,
      userId: updated.userId,
      orgId: updated.orgId,
      role: updated.role as OrgRole,
      joinedAt: updated.joinedAt.toISOString(),
      user: {
        ...updated.user,
        createdAt: updated.user.createdAt.toISOString(),
      },
    };
  }

  /**
   * Remove a member from an organization.
   */
  async removeMember(orgId: string, targetUserId: string) {
    const member = await prisma.organizationMember.findUnique({
      where: {
        userId_orgId: {
          userId: targetUserId,
          orgId,
        },
      },
    });

    if (!member) {
      throw new AppError(404, 'NOT_FOUND', 'Member not found in this organization');
    }

    // Prevent removing the sole owner
    if (member.role === 'OWNER') {
      const ownerCount = await prisma.organizationMember.count({
        where: { orgId, role: 'OWNER' },
      });

      if (ownerCount <= 1) {
        throw new AppError(
          400,
          'BAD_REQUEST',
          'Cannot remove the sole organization owner.',
        );
      }
    }

    await prisma.organizationMember.delete({
      where: {
        userId_orgId: {
          userId: targetUserId,
          orgId,
        },
      },
    });

    return {
      success: true,
      message: 'Member removed successfully',
    };
  }
}

export const organizationService = new OrganizationService();
