import { beforeEach, describe, expect, it, vi } from 'vitest';
import supertest from 'supertest';

const mocks = vi.hoisted(() => ({
  validateSession: vi.fn(),
  workspaceFindUnique: vi.fn(),
  projectFindUnique: vi.fn(),
  projectFindMany: vi.fn(),
  projectCount: vi.fn(),
  projectUpdate: vi.fn(),
  orgMemberFindUnique: vi.fn(),
  projectMemberFindMany: vi.fn(),
  projectMemberFindUnique: vi.fn(),
  projectMemberCreate: vi.fn(),
  projectMemberDeleteMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../src/services/auth.service.js', () => ({
  authService: { validateSession: mocks.validateSession },
}));

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    workspace: { findUnique: mocks.workspaceFindUnique },
    project: {
      findUnique: mocks.projectFindUnique,
      findMany: mocks.projectFindMany,
      count: mocks.projectCount,
      update: mocks.projectUpdate,
    },
    organizationMember: { findUnique: mocks.orgMemberFindUnique },
    projectMember: {
      findMany: mocks.projectMemberFindMany,
      findUnique: mocks.projectMemberFindUnique,
      create: mocks.projectMemberCreate,
      deleteMany: mocks.projectMemberDeleteMany,
    },
    $transaction: mocks.transaction,
  },
}));

const { createApp } = await import('../src/app.js');
const app = createApp('http://localhost:3000');

const userId = 'user-a';
const workspaceId = 'workspace-a';
const projectId = 'project-a';
const orgId = 'org-a';
const date = new Date('2026-10-17T00:00:00.000Z');

function makeProject(overrides: Record<string, unknown> = {}) {
  return {
    id: projectId,
    name: 'Project A',
    description: null,
    status: 'ACTIVE',
    workspaceId,
    createdAt: date,
    updatedAt: date,
    members: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.validateSession.mockImplementation(async (sessionId: string) =>
    sessionId === 'session-a' ? { id: userId, email: 'a@example.com', name: 'A' } : null,
  );
  mocks.workspaceFindUnique.mockResolvedValue({ id: workspaceId, orgId, archivedAt: null });
  mocks.projectFindUnique.mockImplementation(async (args: { include?: unknown; select?: unknown }) => {
    if (args.include) return makeProject({ members: [] });
    if (args.select) return { status: 'ACTIVE', workspace: { orgId, archivedAt: null }, members: [{ id: 'pm-a', role: 'MEMBER' }] };
    return null;
  });
  mocks.projectFindMany.mockResolvedValue([makeProject()]);
  mocks.projectCount.mockResolvedValue(1);
  mocks.projectUpdate.mockResolvedValue(makeProject());
  mocks.orgMemberFindUnique.mockImplementation(async ({ where }: { where: { userId_orgId: { userId: string; orgId: string } } }) => {
    const target = where.userId_orgId;
    if (target.orgId !== orgId || !['user-a', 'user-b'].includes(target.userId)) return null;
    return { id: `om-${target.userId}`, orgId, userId: target.userId, role: 'EMPLOYEE' };
  });
  mocks.projectMemberFindUnique.mockResolvedValue({ role: 'MEMBER' });
  mocks.projectMemberCreate.mockResolvedValue({ id: 'pm-new' });
  mocks.projectMemberDeleteMany.mockResolvedValue({ count: 1 });
  mocks.projectMemberFindMany.mockResolvedValue([{
    id: 'pm-a', userId, projectId, role: 'MEMBER', joinedAt: date,
    user: { id: userId, name: 'A', email: 'a@example.com' },
  }]);
  mocks.transaction.mockImplementation((input: Promise<unknown>[] | ((tx: unknown) => Promise<unknown>)) => {
    if (typeof input !== 'function') return Promise.all(input);
    return input({
      project: { findUnique: mocks.projectFindUnique },
      organizationMember: { findUnique: mocks.orgMemberFindUnique },
      projectMember: {
        findUnique: mocks.projectMemberFindUnique,
        create: mocks.projectMemberCreate,
        deleteMany: mocks.projectMemberDeleteMany,
      },
    });
  });
});

describe('Project read API', () => {
  it('lists only the caller’s projects and excludes archived projects by default', async () => {
    const response = await supertest(app)
      .get(`/api/workspaces/${workspaceId}/projects?page=2&pageSize=10`)
      .set('Authorization', 'Bearer session-a');

    expect(response.status).toBe(200);
    expect(response.body.meta).toEqual({ total: 1, page: 2, pageSize: 10, totalPages: 1 });
    expect(response.body.data[0]).toMatchObject({ id: projectId, ownerId: null, startDate: null, dueDate: null });
    expect(mocks.projectFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        workspaceId,
        status: { not: 'ARCHIVED' },
        members: { some: { userId } },
      }),
      skip: 10,
      take: 10,
    }));
  });

  it('allows organization managers to list all projects and include archived projects on request', async () => {
    mocks.orgMemberFindUnique.mockResolvedValue({ id: 'om-a', orgId, userId, role: 'MANAGER' });
    const response = await supertest(app)
      .get(`/api/workspaces/${workspaceId}/projects?includeArchived=true`)
      .set('Authorization', 'Bearer session-a');

    expect(response.status).toBe(200);
    expect(mocks.projectFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { workspaceId },
    }));
  });

  it('rejects invalid listing query parameters', async () => {
    const response = await supertest(app)
      .get(`/api/workspaces/${workspaceId}/projects?page=0`)
      .set('Authorization', 'Bearer session-a');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(mocks.projectFindMany).not.toHaveBeenCalled();
  });

  it('denies a cross-organization workspace request', async () => {
    mocks.orgMemberFindUnique.mockResolvedValue(null);
    const response = await supertest(app)
      .get(`/api/workspaces/${workspaceId}/projects`)
      .set('Authorization', 'Bearer session-a');

    expect(response.status).toBe(403);
    expect(mocks.projectFindMany).not.toHaveBeenCalled();
  });

  it('allows a project member to read archived project details and roster', async () => {
    mocks.projectFindUnique.mockImplementation(async (args: { include?: unknown; select?: unknown }) =>
      args.include
        ? makeProject({ status: 'ARCHIVED', members: [{ userId }] })
        : { workspace: { orgId, archivedAt: null }, members: [{ id: 'pm-a' }] },
    );

    const detail = await supertest(app).get(`/api/projects/${projectId}`).set('Authorization', 'Bearer session-a');
    const members = await supertest(app).get(`/api/projects/${projectId}/members`).set('Authorization', 'Bearer session-a');

    expect(detail.status).toBe(200);
    expect(detail.body.project.status).toBe('ARCHIVED');
    expect(members.status).toBe(200);
    expect(members.body.members).toEqual([expect.objectContaining({
      id: 'pm-a',
      user: { id: userId, name: 'A', email: 'a@example.com' },
    })]);
    expect(JSON.stringify(members.body)).not.toContain('passwordHash');
  });

  it('denies non-members and organization outsiders from project reads', async () => {
    mocks.projectFindUnique.mockResolvedValue({ workspace: { orgId, archivedAt: null }, members: [] });
    const nonMember = await supertest(app).get(`/api/projects/${projectId}`).set('Authorization', 'Bearer session-a');
    expect(nonMember.status).toBe(403);

    mocks.orgMemberFindUnique.mockResolvedValue(null);
    const outsider = await supertest(app).get(`/api/projects/${projectId}/members`).set('Authorization', 'Bearer session-a');
    expect(outsider.status).toBe(403);
    expect(mocks.projectMemberFindMany).not.toHaveBeenCalled();
  });

  it('does not reveal projects in archived workspaces to employees', async () => {
    mocks.workspaceFindUnique.mockResolvedValue({ id: workspaceId, orgId, archivedAt: date });
    const response = await supertest(app)
      .get(`/api/workspaces/${workspaceId}/projects`)
      .set('Authorization', 'Bearer session-a');

    expect(response.status).toBe(403);
    expect(mocks.projectFindMany).not.toHaveBeenCalled();
  });

  it('allows organization managers to add an organization member transactionally', async () => {
    mocks.orgMemberFindUnique.mockImplementation(async ({ where }: { where: { userId_orgId: { userId: string; orgId: string } } }) =>
      where.userId_orgId.orgId === orgId ? { id: 'om', role: 'MANAGER', ...where.userId_orgId } : null,
    );
    const response = await supertest(app)
      .post(`/api/projects/${projectId}/members`)
      .set('Authorization', 'Bearer session-a')
      .send({ userId: 'user-b' });

    expect(response.status).toBe(201);
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function));
    expect(mocks.projectMemberCreate).toHaveBeenCalledWith({ data: { projectId, userId: 'user-b', role: 'MEMBER' } });
  });

  it('rejects adding a user outside the project organization', async () => {
    mocks.orgMemberFindUnique.mockImplementation(async ({ where }: { where: { userId_orgId: { userId: string; orgId: string } } }) =>
      where.userId_orgId.userId === userId ? { id: 'om-a', ...where.userId_orgId, role: 'MANAGER' } : null,
    );
    const response = await supertest(app)
      .post(`/api/projects/${projectId}/members`)
      .set('Authorization', 'Bearer session-a')
      .send({ userId: 'outsider' });

    expect(response.status).toBe(400);
    expect(mocks.projectMemberCreate).not.toHaveBeenCalled();
  });

  it('maps duplicate project membership to a conflict response', async () => {
    mocks.orgMemberFindUnique.mockImplementation(async ({ where }: { where: { userId_orgId: { userId: string; orgId: string } } }) =>
      where.userId_orgId.orgId === orgId ? { id: `om-${where.userId_orgId.userId}`, ...where.userId_orgId, role: 'MANAGER' } : null,
    );
    mocks.projectMemberCreate.mockRejectedValue({ code: 'P2002' });
    const response = await supertest(app)
      .post(`/api/projects/${projectId}/members`)
      .set('Authorization', 'Bearer session-a')
      .send({ userId: 'user-b' });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('removes a non-owner membership transactionally', async () => {
    mocks.orgMemberFindUnique.mockResolvedValue({ id: 'om-a', orgId, userId, role: 'MANAGER' });
    mocks.projectMemberFindUnique.mockResolvedValue({ role: 'MEMBER' });
    const response = await supertest(app)
      .delete(`/api/projects/${projectId}/members/user-b`)
      .set('Authorization', 'Bearer session-a');

    expect(response.status).toBe(200);
    expect(mocks.projectMemberDeleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-b', projectId, role: { not: 'OWNER' } },
    });
  });

  it('allows a project OWNER to manage membership but denies a regular project member', async () => {
    mocks.orgMemberFindUnique.mockResolvedValue({ id: 'om-a', orgId, userId, role: 'EMPLOYEE' });
    mocks.projectFindUnique.mockImplementation(async (args: { include?: unknown; select?: unknown }) =>
      args.select
        ? { status: 'ACTIVE', workspace: { orgId, archivedAt: null }, members: [{ id: 'pm-a', role: 'OWNER' }] }
        : makeProject({ members: [{ userId }] }),
    );
    const ownerResponse = await supertest(app)
      .post(`/api/projects/${projectId}/members`)
      .set('Authorization', 'Bearer session-a')
      .send({ userId: 'user-b' });
    expect(ownerResponse.status).toBe(201);

    mocks.projectFindUnique.mockImplementation(async (args: { include?: unknown; select?: unknown }) =>
      args.select
        ? { status: 'ACTIVE', workspace: { orgId, archivedAt: null }, members: [{ id: 'pm-a', role: 'MEMBER' }] }
        : makeProject(),
    );
    const memberResponse = await supertest(app)
      .post(`/api/projects/${projectId}/members`)
      .set('Authorization', 'Bearer session-a')
      .send({ userId: 'user-b' });
    expect(memberResponse.status).toBe(403);
  });

  it('prevents removing an OWNER and blocks membership writes on archived projects', async () => {
    mocks.orgMemberFindUnique.mockResolvedValue({ id: 'om-a', orgId, userId, role: 'MANAGER' });
    mocks.projectFindUnique.mockImplementation(async (args: { include?: unknown; select?: unknown }) =>
      args.select ? { status: 'ACTIVE', workspace: { orgId, archivedAt: null }, members: [] } : makeProject(),
    );
    mocks.projectMemberFindUnique.mockResolvedValue({ role: 'OWNER' });
    const ownerDelete = await supertest(app)
      .delete(`/api/projects/${projectId}/members/user-b`)
      .set('Authorization', 'Bearer session-a');
    expect(ownerDelete.status).toBe(409);
    expect(mocks.projectMemberDeleteMany).not.toHaveBeenCalled();

    mocks.projectFindUnique.mockResolvedValue({ status: 'ARCHIVED', workspace: { orgId, archivedAt: null }, members: [] });
    const archivedAdd = await supertest(app)
      .post(`/api/projects/${projectId}/members`)
      .set('Authorization', 'Bearer session-a')
      .send({ userId: 'user-b' });
    expect(archivedAdd.status).toBe(409);
    expect(mocks.projectMemberCreate).not.toHaveBeenCalled();
  });

  it('allows authorized archive and explicit restore with the documented ACTIVE fallback', async () => {
    mocks.orgMemberFindUnique.mockResolvedValue({ id: 'om-a', orgId, userId, role: 'MANAGER' });
    mocks.projectFindUnique.mockImplementation(async (args: { include?: unknown; select?: unknown }) => {
      if (args.include) return makeProject();
      return { status: 'ARCHIVED', workspace: { orgId, archivedAt: null }, members: [] };
    });

    const archive = await supertest(app)
      .post(`/api/projects/${projectId}/archive`)
      .set('Authorization', 'Bearer session-a');
    expect(archive.status).toBe(200);
    expect(mocks.projectUpdate).toHaveBeenCalledWith({ where: { id: projectId }, data: { status: 'ARCHIVED' } });

    const restore = await supertest(app)
      .post(`/api/projects/${projectId}/restore`)
      .set('Authorization', 'Bearer session-a');
    expect(restore.status).toBe(200);
    expect(mocks.projectUpdate).toHaveBeenLastCalledWith({ where: { id: projectId }, data: { status: 'ACTIVE' } });
  });

  it('denies project archive to a regular project member', async () => {
    mocks.orgMemberFindUnique.mockResolvedValue({ id: 'om-a', orgId, userId, role: 'EMPLOYEE' });
    mocks.projectFindUnique.mockResolvedValue({ status: 'ACTIVE', workspace: { orgId, archivedAt: null }, members: [{ id: 'pm-a', role: 'MEMBER' }] });
    const response = await supertest(app)
      .post(`/api/projects/${projectId}/archive`)
      .set('Authorization', 'Bearer session-a');

    expect(response.status).toBe(403);
    expect(mocks.projectUpdate).not.toHaveBeenCalled();
  });
});
