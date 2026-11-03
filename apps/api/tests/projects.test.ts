import { beforeEach, describe, expect, it, vi } from 'vitest';
import supertest from 'supertest';

const mocks = vi.hoisted(() => ({
  validateSession: vi.fn(),
  workspaceFindUnique: vi.fn(),
  projectFindUnique: vi.fn(),
  projectFindMany: vi.fn(),
  projectCount: vi.fn(),
  projectCreate: vi.fn(),
  projectUpdate: vi.fn(),
  orgMemberFindUnique: vi.fn(),
  projectMemberFindMany: vi.fn(),
  projectMemberFindUnique: vi.fn(),
  projectMemberCreate: vi.fn(),
  projectMemberUpdateMany: vi.fn(),
  projectMemberUpsert: vi.fn(),
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
      create: mocks.projectCreate,
      update: mocks.projectUpdate,
    },
    organizationMember: { findUnique: mocks.orgMemberFindUnique },
    projectMember: {
      findMany: mocks.projectMemberFindMany,
      findUnique: mocks.projectMemberFindUnique,
      create: mocks.projectMemberCreate,
      updateMany: mocks.projectMemberUpdateMany,
      upsert: mocks.projectMemberUpsert,
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
    startDate: null,
    dueDate: null,
    ownerId: null,
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
    if (args.select) return { status: 'ACTIVE', startDate: null, dueDate: null, workspace: { orgId, archivedAt: null }, members: [{ id: 'pm-a', role: 'MEMBER' }] };
    return null;
  });
  mocks.projectFindMany.mockResolvedValue([makeProject()]);
  mocks.projectCount.mockResolvedValue(1);
  mocks.projectCreate.mockResolvedValue({ id: projectId });
  mocks.projectUpdate.mockResolvedValue(makeProject());
  mocks.orgMemberFindUnique.mockImplementation(async ({ where }: { where: { userId_orgId: { userId: string; orgId: string } } }) => {
    const target = where.userId_orgId;
    if (target.orgId !== orgId || !['user-a', 'user-b'].includes(target.userId)) return null;
    return { id: `om-${target.userId}`, orgId, userId: target.userId, role: 'EMPLOYEE' };
  });
  mocks.projectMemberFindUnique.mockResolvedValue({ role: 'MEMBER' });
  mocks.projectMemberCreate.mockResolvedValue({ id: 'pm-new' });
  mocks.projectMemberUpdateMany.mockResolvedValue({ count: 1 });
  mocks.projectMemberUpsert.mockResolvedValue({ id: 'pm-owner' });
  mocks.projectMemberDeleteMany.mockResolvedValue({ count: 1 });
  mocks.projectMemberFindMany.mockResolvedValue([{
    id: 'pm-a', userId, projectId, role: 'MEMBER', joinedAt: date,
    user: { id: userId, name: 'A', email: 'a@example.com' },
  }]);
  mocks.transaction.mockImplementation((input: Promise<unknown>[] | ((tx: unknown) => Promise<unknown>)) => {
    if (typeof input !== 'function') return Promise.all(input);
    return input({
      workspace: { findUnique: mocks.workspaceFindUnique },
      project: {
        findUnique: mocks.projectFindUnique,
        create: mocks.projectCreate,
        update: mocks.projectUpdate,
      },
      organizationMember: { findUnique: mocks.orgMemberFindUnique },
      projectMember: {
        findUnique: mocks.projectMemberFindUnique,
        create: mocks.projectMemberCreate,
        updateMany: mocks.projectMemberUpdateMany,
        upsert: mocks.projectMemberUpsert,
        deleteMany: mocks.projectMemberDeleteMany,
      },
    });
  });
});

describe('Project write API', () => {
  const validProject = {
    name: 'Launch plan',
    description: 'First phase',
    ownerId: 'user-b',
    status: 'PLANNING',
    startDate: '2026-10-20T00:00:00.000Z',
    dueDate: '2026-11-20T00:00:00.000Z',
  };

  it('creates a project with its explicit owner membership and dates transactionally', async () => {
    mocks.orgMemberFindUnique.mockResolvedValue({ id: 'om-a', orgId, userId, role: 'MANAGER' });
    mocks.projectFindUnique.mockImplementation(async (args: { include?: unknown; select?: unknown }) =>
      args.include
        ? makeProject({
          ownerId: 'user-b',
          startDate: new Date(validProject.startDate),
          dueDate: new Date(validProject.dueDate),
        })
        : { status: 'ACTIVE', startDate: null, dueDate: null, workspace: { orgId }, members: [] },
    );

    const response = await supertest(app)
      .post(`/api/workspaces/${workspaceId}/projects`)
      .set('Authorization', 'Bearer session-a')
      .send(validProject);

    expect(response.status).toBe(201);
    expect(response.body.project).toMatchObject({
      id: projectId,
      ownerId: 'user-b',
      startDate: validProject.startDate,
      dueDate: validProject.dueDate,
    });
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' });
    expect(mocks.projectCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        name: 'Launch plan',
        workspace: { connect: { id: workspaceId } },
        owner: { connect: { id: 'user-b' } },
        startDate: new Date(validProject.startDate),
        dueDate: new Date(validProject.dueDate),
      }),
      select: { id: true },
    }));
    expect(mocks.projectMemberCreate).toHaveBeenCalledWith({
      data: { projectId, userId: 'user-b', role: 'OWNER' },
    });
  });

  it('rejects creation by employees, for archived workspaces, and with a non-organization owner', async () => {
    mocks.orgMemberFindUnique.mockResolvedValue({ id: 'om-a', orgId, userId, role: 'EMPLOYEE' });
    const employee = await supertest(app)
      .post(`/api/workspaces/${workspaceId}/projects`)
      .set('Authorization', 'Bearer session-a')
      .send(validProject);
    expect(employee.status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();

    mocks.orgMemberFindUnique.mockResolvedValue({ id: 'om-a', orgId, userId, role: 'MANAGER' });
    mocks.workspaceFindUnique.mockResolvedValue({ id: workspaceId, orgId, archivedAt: date });
    const archivedWorkspace = await supertest(app)
      .post(`/api/workspaces/${workspaceId}/projects`)
      .set('Authorization', 'Bearer session-a')
      .send(validProject);
    expect(archivedWorkspace.status).toBe(409);
    expect(mocks.projectCreate).not.toHaveBeenCalled();

    mocks.workspaceFindUnique.mockResolvedValue({ id: workspaceId, orgId, archivedAt: null });
    mocks.orgMemberFindUnique.mockImplementation(async ({ where }: { where: { userId_orgId: { userId: string; orgId: string } } }) =>
      where.userId_orgId.userId === userId ? { id: 'om-a', orgId, userId, role: 'MANAGER' } : null,
    );
    const invalidOwner = await supertest(app)
      .post(`/api/workspaces/${workspaceId}/projects`)
      .set('Authorization', 'Bearer session-a')
      .send(validProject);
    expect(invalidOwner.status).toBe(400);
    expect(mocks.projectCreate).not.toHaveBeenCalled();
  });

  it('rejects invalid date ranges and cross-tenant project updates', async () => {
    mocks.orgMemberFindUnique.mockResolvedValue({ id: 'om-a', orgId, userId, role: 'MANAGER' });
    const invalidDates = await supertest(app)
      .post(`/api/workspaces/${workspaceId}/projects`)
      .set('Authorization', 'Bearer session-a')
      .send({ ...validProject, startDate: '2026-12-01T00:00:00.000Z', dueDate: '2026-11-01T00:00:00.000Z' });
    expect(invalidDates.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();

    mocks.projectFindUnique.mockResolvedValue({
      status: 'ACTIVE', startDate: null, dueDate: null,
      workspace: { orgId: 'other-org', archivedAt: null }, members: [],
    });
    mocks.orgMemberFindUnique.mockImplementation(async ({ where }: { where: { userId_orgId: { userId: string; orgId: string } } }) =>
      where.userId_orgId.orgId === orgId ? { id: 'om-a', orgId, userId, role: 'MANAGER' } : null,
    );
    const crossTenant = await supertest(app)
      .patch(`/api/projects/${projectId}`)
      .set('Authorization', 'Bearer session-a')
      .send({ name: 'Changed' });
    expect(crossTenant.status).toBe(403);
    expect(mocks.projectUpdate).not.toHaveBeenCalled();
  });

  it('updates settings, dates, and owner membership transactionally', async () => {
    mocks.orgMemberFindUnique.mockResolvedValue({ id: 'om-a', orgId, userId, role: 'MANAGER' });
    mocks.projectFindUnique.mockImplementation(async (args: { include?: unknown; select?: unknown }) =>
      args.include
        ? makeProject({
          ownerId: 'user-b',
          startDate: new Date('2026-10-21T00:00:00.000Z'),
          dueDate: new Date('2026-11-30T00:00:00.000Z'),
        })
        : { status: 'ACTIVE', startDate: null, dueDate: null, workspace: { orgId }, members: [] },
    );

    const response = await supertest(app)
      .patch(`/api/projects/${projectId}`)
      .set('Authorization', 'Bearer session-a')
      .send({
        name: 'Updated name',
        ownerId: 'user-b',
        startDate: '2026-10-21T00:00:00.000Z',
        dueDate: '2026-11-30T00:00:00.000Z',
      });

    expect(response.status).toBe(200);
    expect(response.body.project).toMatchObject({ ownerId: 'user-b' });
    expect(mocks.projectMemberUpdateMany).toHaveBeenCalledWith({
      where: { projectId, role: 'OWNER', userId: { not: 'user-b' } },
      data: { role: 'MEMBER' },
    });
    expect(mocks.projectMemberUpsert).toHaveBeenCalledWith({
      where: { userId_projectId: { userId: 'user-b', projectId } },
      create: { projectId, userId: 'user-b', role: 'OWNER' },
      update: { role: 'OWNER' },
    });
    expect(mocks.projectUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: projectId },
      data: expect.objectContaining({ owner: { connect: { id: 'user-b' } } }),
    }));
  });

  it('allows the project OWNER to update settings but rejects a regular project member', async () => {
    mocks.orgMemberFindUnique.mockResolvedValue({ id: 'om-a', orgId, userId, role: 'EMPLOYEE' });
    mocks.projectFindUnique.mockImplementation(async (args: { include?: unknown; select?: unknown }) =>
      args.include
        ? makeProject()
        : {
          status: 'ACTIVE', startDate: null, dueDate: null,
          workspace: { orgId, archivedAt: null },
          members: [{ id: 'pm-a', role: 'OWNER' }],
        },
    );
    const ownerUpdate = await supertest(app)
      .patch(`/api/projects/${projectId}`)
      .set('Authorization', 'Bearer session-a')
      .send({ name: 'Owner update' });
    expect(ownerUpdate.status).toBe(200);

    mocks.projectFindUnique.mockImplementation(async (args: { include?: unknown; select?: unknown }) =>
      args.include
        ? makeProject()
        : {
          status: 'ACTIVE', startDate: null, dueDate: null,
          workspace: { orgId, archivedAt: null },
          members: [{ id: 'pm-a', role: 'MEMBER' }],
        },
    );
    const memberUpdate = await supertest(app)
      .patch(`/api/projects/${projectId}`)
      .set('Authorization', 'Bearer session-a')
      .send({ name: 'Member update' });
    expect(memberUpdate.status).toBe(403);
  });

  it('preserves date ordering against unchanged persisted dates and blocks archived-project writes', async () => {
    mocks.orgMemberFindUnique.mockResolvedValue({ id: 'om-a', orgId, userId, role: 'MANAGER' });
    mocks.projectFindUnique.mockImplementation(async (args: { include?: unknown; select?: unknown }) => {
      if (args.include) return makeProject({ dueDate: new Date('2026-10-25T00:00:00.000Z') });
      if (args.select) return {
        status: 'ACTIVE',
        startDate: null,
        dueDate: new Date('2026-10-25T00:00:00.000Z'),
        workspace: { orgId },
        members: [],
      };
      return null;
    });
    const invalidUpdate = await supertest(app)
      .patch(`/api/projects/${projectId}`)
      .set('Authorization', 'Bearer session-a')
      .send({ startDate: '2026-11-01T00:00:00.000Z' });
    expect(invalidUpdate.status).toBe(400);
    expect(mocks.projectUpdate).not.toHaveBeenCalled();

    mocks.projectFindUnique.mockResolvedValue({
      status: 'ARCHIVED',
      workspace: { orgId, archivedAt: null },
      members: [],
    });
    const archivedUpdate = await supertest(app)
      .patch(`/api/projects/${projectId}`)
      .set('Authorization', 'Bearer session-a')
      .send({ name: 'Blocked' });
    expect(archivedUpdate.status).toBe(409);
    expect(mocks.projectUpdate).not.toHaveBeenCalled();
  });

  it('returns an error when OWNER membership creation fails inside the transaction callback', async () => {
    mocks.orgMemberFindUnique.mockResolvedValue({ id: 'om-a', orgId, userId, role: 'MANAGER' });
    mocks.projectMemberCreate.mockRejectedValue(new Error('membership insert failed'));

    const response = await supertest(app)
      .post(`/api/workspaces/${workspaceId}/projects`)
      .set('Authorization', 'Bearer session-a')
      .send(validProject);

    expect(response.status).toBe(500);
    expect(mocks.projectCreate).toHaveBeenCalledOnce();
    expect(mocks.projectMemberCreate).toHaveBeenCalledOnce();
    expect(mocks.projectFindUnique).not.toHaveBeenCalledWith(expect.objectContaining({ include: expect.anything() }));
  });

  it('returns conflict when serializable transaction retries are exhausted', async () => {
    mocks.orgMemberFindUnique.mockResolvedValue({ id: 'om-a', orgId, userId, role: 'MANAGER' });
    mocks.transaction.mockRejectedValue({ code: 'P2034' });

    const response = await supertest(app)
      .post(`/api/workspaces/${workspaceId}/projects`)
      .set('Authorization', 'Bearer session-a')
      .send(validProject);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CONFLICT');
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
