import type { Prisma, Workspace } from '@prisma/client';
import type { CreateWorkspaceInput, UpdateWorkspaceInput } from '@qveto/shared';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

const pageMax = 100;

function slugBase(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s_-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'workspace';
}

function serializeWorkspace(workspace: Workspace) {
  return {
    ...workspace,
    archivedAt: workspace.archivedAt?.toISOString() ?? null,
    createdAt: workspace.createdAt.toISOString(),
    updatedAt: workspace.updatedAt.toISOString(),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

async function lockOrganization(tx: Prisma.TransactionClient, orgId: string): Promise<void> {
  // Serialize workspace writes within one organization. The unique indexes remain
  // the final guard against writes outside this service or concurrent processes.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${orgId}))`;
}

export class WorkspaceService {
  async list(orgId: string, page: number, pageSize: number, includeArchived: boolean) {
    const where: Prisma.WorkspaceWhereInput = {
      orgId,
      ...(includeArchived ? {} : { archivedAt: null }),
    };
    const [total, rows] = await prisma.$transaction([
      prisma.workspace.count({ where }),
      prisma.workspace.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: Math.min(pageSize, pageMax),
      }),
    ]);

    return {
      data: rows.map(serializeWorkspace),
      meta: {
        total,
        page,
        pageSize: Math.min(pageSize, pageMax),
        totalPages: Math.ceil(total / Math.min(pageSize, pageMax)),
      },
    };
  }

  async create(orgId: string, input: CreateWorkspaceInput) {
    const name = input.name.trim();
    try {
      const workspace = await prisma.$transaction(async (tx) => {
        await lockOrganization(tx, orgId);

        const nameConflict = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "workspaces"
          WHERE "orgId" = ${orgId}
            AND lower(regexp_replace("name", '^[[:space:]]+|[[:space:]]+$', '', 'g'))
              = lower(regexp_replace(${name}, '^[[:space:]]+|[[:space:]]+$', '', 'g'))
          LIMIT 1
        `;
        if (nameConflict.length > 0) {
          throw new AppError(409, 'CONFLICT', 'A workspace with this name already exists in the organization');
        }

        const base = slugBase(name);
        let slug = base;
        let suffix = 2;
        while (await tx.workspace.findUnique({ where: { orgId_slug: { orgId, slug } } })) {
          slug = `${base}-${suffix++}`;
        }

        return tx.workspace.create({
          data: {
            name,
            slug,
            description: input.description?.trim() || null,
            orgId,
            archivedAt: null,
          },
        });
      });
      return serializeWorkspace(workspace);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(409, 'CONFLICT', 'Workspace name or slug conflicts with an existing workspace');
      }
      throw error;
    }
  }

  async get(workspace: Workspace): Promise<ReturnType<typeof serializeWorkspace>> {
    return serializeWorkspace(workspace);
  }

  async update(workspaceId: string, input: UpdateWorkspaceInput) {
    try {
      const updated = await prisma.workspace.update({
        where: { id: workspaceId },
        data: {
          ...(input.name !== undefined && { name: input.name.trim() }),
          ...(input.description !== undefined && { description: input.description?.trim() || null }),
        },
      });
      return serializeWorkspace(updated);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(409, 'CONFLICT', 'A workspace with this name already exists in the organization');
      }
      throw error;
    }
  }

  async archive(workspaceId: string) {
    const workspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: { archivedAt: new Date() },
    });
    return serializeWorkspace(workspace);
  }

  async restore(workspace: Workspace) {
    const conflict = await prisma.workspace.findFirst({
      where: {
        orgId: workspace.orgId,
        slug: workspace.slug,
        id: { not: workspace.id },
      },
      select: { id: true },
    });
    if (conflict) {
      throw new AppError(409, 'CONFLICT', 'Workspace slug is already in use and cannot be restored');
    }

    try {
      const restored = await prisma.workspace.update({
        where: { id: workspace.id },
        data: { archivedAt: null },
      });
      return serializeWorkspace(restored);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(409, 'CONFLICT', 'Workspace cannot be restored because a uniqueness constraint conflicts');
      }
      throw error;
    }
  }
}

export const workspaceService = new WorkspaceService();
