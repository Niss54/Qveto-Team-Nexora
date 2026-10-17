import { describe, it, expect, beforeEach, vi } from 'vitest';
import supertest from 'supertest';
import bcrypt from 'bcryptjs';

// In-memory mock database entities
interface MockUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface MockSession {
  id: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
}

interface MockOrg {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface MockOrgMember {
  id: string;
  orgId: string;
  userId: string;
  role: string;
  joinedAt: Date;
}

interface MockWorkspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  orgId: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const mockUsers: MockUser[] = [];
const mockSessions: MockSession[] = [];
const mockOrgs: MockOrg[] = [];
const mockMembers: MockOrgMember[] = [];
const mockWorkspaces: MockWorkspace[] = [];

// Mock prisma client with transactional support and relations
vi.mock('../src/lib/prisma.js', () => {
  const userMethods = {
    findUnique: vi.fn(async ({ where }: { where: { email?: string; id?: string } }) => {
      if (where.email) {
        return mockUsers.find((u) => u.email.toLowerCase() === where.email?.toLowerCase()) || null;
      }
      if (where.id) {
        return mockUsers.find((u) => u.id === where.id) || null;
      }
      return null;
    }),
    create: vi.fn(async ({ data }: { data: { email: string; name: string; passwordHash: string } }) => {
      const user: MockUser = {
        id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        email: data.email.toLowerCase(),
        name: data.name,
        passwordHash: data.passwordHash,
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockUsers.push(user);
      return user;
    }),
  };

  const sessionMethods = {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      const session = mockSessions.find((s) => s.id === where.id);
      if (!session) return null;
      const user = mockUsers.find((u) => u.id === session.userId);
      if (!user) return null;
      return { ...session, user };
    }),
    create: vi.fn(async ({ data }: { data: { userId: string; expiresAt: Date } }) => {
      const session: MockSession = {
        id: `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        userId: data.userId,
        expiresAt: data.expiresAt,
        createdAt: new Date(),
      };
      mockSessions.push(session);
      return session;
    }),
    delete: vi.fn(async ({ where }: { where: { id: string } }) => {
      const idx = mockSessions.findIndex((s) => s.id === where.id);
      if (idx !== -1) return mockSessions.splice(idx, 1)[0];
      throw new Error('Session not found');
    }),
  };

  const orgMethods = {
    findUnique: vi.fn(async ({ where }: { where: { id?: string; slug?: string } }) => {
      let org: MockOrg | undefined;
      if (where.id) org = mockOrgs.find((o) => o.id === where.id);
      if (where.slug) org = mockOrgs.find((o) => o.slug === where.slug);
      if (!org) return null;
      const members = mockMembers.filter((m) => m.orgId === org!.id);
      const workspaces = mockWorkspaces.filter((w) => w.orgId === org!.id);
      return {
        ...org,
        workspaces,
        _count: { members: members.length },
      };
    }),
    create: vi.fn(async ({ data }: { data: { name: string; slug: string; description?: string | null } }) => {
      const org: MockOrg = {
        id: `org_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: data.name,
        slug: data.slug,
        description: data.description || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockOrgs.push(org);
      return org;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<MockOrg> }) => {
      const org = mockOrgs.find((o) => o.id === where.id);
      if (!org) throw new Error('Org not found');
      if (data.name !== undefined) org.name = data.name;
      if (data.description !== undefined) org.description = data.description;
      org.updatedAt = new Date();
      return org;
    }),
  };

  const memberMethods = {
    findUnique: vi.fn(async ({ where }: { where: { userId_orgId?: { userId: string; orgId: string }; id?: string } }) => {
      if (where.userId_orgId) {
        return (
          mockMembers.find(
            (m) => m.userId === where.userId_orgId!.userId && m.orgId === where.userId_orgId!.orgId,
          ) || null
        );
      }
      return null;
    }),
    findMany: vi.fn(async ({ where }: { where: { userId?: string; orgId?: string } }) => {
      let list = mockMembers;
      if (where.userId) list = list.filter((m) => m.userId === where.userId);
      if (where.orgId) list = list.filter((m) => m.orgId === where.orgId);

      return list.map((m) => {
        const org = mockOrgs.find((o) => o.id === m.orgId);
        const user = mockUsers.find((u) => u.id === m.userId);
        const membersInOrg = mockMembers.filter((mem) => mem.orgId === m.orgId);
        return {
          ...m,
          organization: org ? { ...org, _count: { members: membersInOrg.length } } : null,
          user: user
            ? {
                id: user.id,
                email: user.email,
                name: user.name,
                avatarUrl: user.avatarUrl,
                createdAt: user.createdAt,
              }
            : null,
        };
      });
    }),
    create: vi.fn(async ({ data }: { data: { orgId: string; userId: string; role: string } }) => {
      const member: MockOrgMember = {
        id: `mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        orgId: data.orgId,
        userId: data.userId,
        role: data.role,
        joinedAt: new Date(),
      };
      mockMembers.push(member);
      const user = mockUsers.find((u) => u.id === data.userId);
      return {
        ...member,
        user: user
          ? {
              id: user.id,
              email: user.email,
              name: user.name,
              avatarUrl: user.avatarUrl,
              createdAt: user.createdAt,
            }
          : null,
      };
    }),
    update: vi.fn(async ({ where, data }: { where: { userId_orgId: { userId: string; orgId: string } }; data: { role: string } }) => {
      const member = mockMembers.find(
        (m) => m.userId === where.userId_orgId.userId && m.orgId === where.userId_orgId.orgId,
      );
      if (!member) throw new Error('Member not found');
      member.role = data.role;
      const user = mockUsers.find((u) => u.id === member.userId);
      return {
        ...member,
        user: user
          ? {
              id: user.id,
              email: user.email,
              name: user.name,
              avatarUrl: user.avatarUrl,
              createdAt: user.createdAt,
            }
          : null,
      };
    }),
    delete: vi.fn(async ({ where }: { where: { userId_orgId: { userId: string; orgId: string } } }) => {
      const idx = mockMembers.findIndex(
        (m) => m.userId === where.userId_orgId.userId && m.orgId === where.userId_orgId.orgId,
      );
      if (idx !== -1) return mockMembers.splice(idx, 1)[0];
      throw new Error('Member not found');
    }),
    count: vi.fn(async ({ where }: { where: { orgId: string; role: string } }) => {
      return mockMembers.filter((m) => m.orgId === where.orgId && m.role === where.role).length;
    }),
  };

  const workspaceMethods = {
    findUnique: vi.fn(async ({ where }: { where: { id?: string; orgId_slug?: { orgId: string; slug: string } } }) => {
      if (where.id) return mockWorkspaces.find((workspace) => workspace.id === where.id) || null;
      if (where.orgId_slug) {
        return mockWorkspaces.find((workspace) => workspace.orgId === where.orgId_slug!.orgId && workspace.slug === where.orgId_slug!.slug) || null;
      }
      return null;
    }),
    findFirst: vi.fn(async ({ where }: { where: { orgId?: string; slug?: string; id?: { not: string } } }) => {
      return mockWorkspaces.find((workspace) =>
        (!where.orgId || workspace.orgId === where.orgId) &&
        (!where.slug || workspace.slug === where.slug) &&
        (!where.id || workspace.id !== where.id.not),
      ) || null;
    }),
    findMany: vi.fn(async ({ where, skip = 0, take = 100 }: { where: { orgId: string; archivedAt?: null }; skip?: number; take?: number }) =>
      mockWorkspaces
        .filter((workspace) => workspace.orgId === where.orgId && (where.archivedAt !== null || workspace.archivedAt === null))
        .slice(skip, skip + take),
    ),
    count: vi.fn(async ({ where }: { where: { orgId: string; archivedAt?: null } }) =>
      mockWorkspaces.filter((workspace) => workspace.orgId === where.orgId && (where.archivedAt !== null || workspace.archivedAt === null)).length,
    ),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<MockWorkspace> }) => {
      const workspace = mockWorkspaces.find((item) => item.id === where.id);
      if (!workspace) throw new Error('Workspace not found');
      Object.assign(workspace, data, { updatedAt: new Date() });
      return workspace;
    }),
    create: vi.fn(async ({ data }: { data: { name: string; slug: string; description?: string | null; orgId: string; archivedAt: Date | null } }) => {
      const ws: MockWorkspace = {
        id: `ws_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: data.name,
        slug: data.slug,
        description: data.description || null,
        orgId: data.orgId,
        archivedAt: data.archivedAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockWorkspaces.push(ws);
      return ws;
    }),
  };

  const prismaMock = {
    user: userMethods,
    session: sessionMethods,
    organization: orgMethods,
    organizationMember: memberMethods,
    workspace: workspaceMethods,
    $queryRaw: vi.fn(async (parts: TemplateStringsArray, ...values: unknown[]) => {
      const query = parts.join('?');
      if (query.includes('lower(regexp_replace')) {
        const orgId = values[0];
        const name = String(values[1] ?? '').trim().toLowerCase();
        return mockWorkspaces
          .filter((workspace) => workspace.orgId === orgId && workspace.name.trim().toLowerCase() === name)
          .map((workspace) => ({ id: workspace.id }));
      }
      return [];
    }),
    $transaction: vi.fn(async (arg: any) => {
      return Array.isArray(arg) ? Promise.all(arg) : arg(prismaMock);
    }),
  };

  return { prisma: prismaMock };
});

const { createApp } = await import('../src/app.js');
const app = createApp('http://localhost:3000');
const request = supertest(app);

describe('Authorization & Multi-Tenant Isolation System', () => {
  // Synthetic test data
  let aliceCookie: string[]; // Org Alpha - OWNER
  let markCookie: string[];  // Org Alpha - MANAGER
  let ericCookie: string[];  // Org Alpha - EMPLOYEE
  let bobCookie: string[];   // Org Beta - OWNER
  let emmaCookie: string[];  // Org Beta - EMPLOYEE

  let orgAlphaId: string;
  let orgBetaId: string;

  let aliceId: string;
  let markId: string;
  let ericId: string;
  let bobId: string;
  let emmaId: string;

  beforeEach(async () => {
    mockUsers.length = 0;
    mockSessions.length = 0;
    mockOrgs.length = 0;
    mockMembers.length = 0;
    mockWorkspaces.length = 0;

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('Password123!', salt);

    // 1. Create Users
    const createTestUser = (email: string, name: string) => {
      const id = `usr_${email.split('@')[0]}`;
      const user: MockUser = {
        id,
        email,
        name,
        passwordHash,
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockUsers.push(user);
      const session: MockSession = {
        id: `sess_${id}`,
        userId: id,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      };
      mockSessions.push(session);
      return { id, cookie: [`sessionId=sess_${id}; Path=/; HttpOnly`] };
    };

    const alice = createTestUser('alice@alpha.com', 'Alice Owner');
    const mark = createTestUser('mark@alpha.com', 'Mark Manager');
    const eric = createTestUser('eric@alpha.com', 'Eric Employee');
    const bob = createTestUser('bob@beta.com', 'Bob Beta Owner');
    const emma = createTestUser('emma@beta.com', 'Emma Beta Employee');

    aliceId = alice.id;
    markId = mark.id;
    ericId = eric.id;
    bobId = bob.id;
    emmaId = emma.id;

    aliceCookie = alice.cookie;
    markCookie = mark.cookie;
    ericCookie = eric.cookie;
    bobCookie = bob.cookie;
    emmaCookie = emma.cookie;

    // 2. Create Organizations
    orgAlphaId = 'org_alpha_123';
    mockOrgs.push({
      id: orgAlphaId,
      name: 'Alpha Corp',
      slug: 'alpha-corp',
      description: 'Alpha Organization',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    orgBetaId = 'org_beta_456';
    mockOrgs.push({
      id: orgBetaId,
      name: 'Beta Ltd',
      slug: 'beta-ltd',
      description: 'Beta Organization',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 3. Assign Memberships
    // Org Alpha members
    mockMembers.push({ id: 'mem_1', orgId: orgAlphaId, userId: aliceId, role: 'OWNER', joinedAt: new Date() });
    mockMembers.push({ id: 'mem_2', orgId: orgAlphaId, userId: markId, role: 'MANAGER', joinedAt: new Date() });
    mockMembers.push({ id: 'mem_3', orgId: orgAlphaId, userId: ericId, role: 'EMPLOYEE', joinedAt: new Date() });

    // Org Beta members
    mockMembers.push({ id: 'mem_4', orgId: orgBetaId, userId: bobId, role: 'OWNER', joinedAt: new Date() });
    mockMembers.push({ id: 'mem_5', orgId: orgBetaId, userId: emmaId, role: 'EMPLOYEE', joinedAt: new Date() });
  });

  // ============================================================
  // Organization Creation & Listing
  // ============================================================
  describe('Organization CRUD', () => {
    it('POST /api/organizations should create org and set creator as OWNER', async () => {
      const res = await request
        .post('/api/organizations')
        .set('Cookie', aliceCookie)
        .send({
          name: 'New Horizon',
          description: 'A new startup',
        });

      expect(res.status).toBe(201);
      expect(res.body.organization.name).toBe('New Horizon');
      expect(res.body.organization.role).toBe('OWNER');
      expect(res.body.organization.slug).toBe('new-horizon');
      const general = mockWorkspaces.find((workspace) => workspace.orgId === res.body.organization.id);
      expect(general?.name).toBe('General');
      expect(general?.slug).toBe('general');
      expect(general?.archivedAt).toBeNull();
    });

    it('GET /api/organizations should list only organizations the user belongs to', async () => {
      const res = await request
        .get('/api/organizations')
        .set('Cookie', aliceCookie);

      expect(res.status).toBe(200);
      expect(res.body.organizations).toHaveLength(1);
      expect(res.body.organizations[0].id).toBe(orgAlphaId);
      expect(res.body.organizations[0].name).toBe('Alpha Corp');
      expect(res.body.organizations[0].role).toBe('OWNER');
    });
  });

  describe('Workspace API', () => {
    const createWorkspace = async (name: string, cookie: string[] = aliceCookie) =>
      request
        .post(`/api/organizations/${orgAlphaId}/workspaces`)
        .set('Cookie', cookie)
        .send({ name });

    it('allows an OWNER or MANAGER to create a workspace with a normalized server-generated slug', async () => {
      const ownerRes = await createWorkspace('  Engineering & Platform  ');
      expect(ownerRes.status).toBe(201);
      expect(ownerRes.body.workspace.name).toBe('Engineering & Platform');
      expect(ownerRes.body.workspace.slug).toBe('engineering-platform');
      expect(ownerRes.body.workspace.archivedAt).toBeNull();

      const managerRes = await createWorkspace('Operations', markCookie);
      expect(managerRes.status).toBe(201);
      expect(managerRes.body.workspace.slug).toBe('operations');
    });

    it('rejects duplicate names after trim and case normalization, including archived workspaces', async () => {
      const created = await createWorkspace('Engineering');
      expect(created.status).toBe(201);

      const duplicate = await createWorkspace('  ENGINEERING  ');
      expect(duplicate.status).toBe(409);
      expect(duplicate.body.error.code).toBe('CONFLICT');

      await request
        .post(`/api/workspaces/${created.body.workspace.id}/archive`)
        .set('Cookie', aliceCookie);
      const archivedDuplicate = await createWorkspace('engineering');
      expect(archivedDuplicate.status).toBe(409);
    });

    it('suffixes slug collisions deterministically and keeps a slug stable on rename', async () => {
      const first = await createWorkspace('Research & Dev');
      const second = await createWorkspace('Research Dev');
      expect(first.body.workspace.slug).toBe('research-dev');
      expect(second.body.workspace.slug).toBe('research-dev-2');

      const renamed = await request
        .patch(`/api/workspaces/${first.body.workspace.id}`)
        .set('Cookie', aliceCookie)
        .send({ name: 'Research Operations' });
      expect(renamed.status).toBe(200);
      expect(renamed.body.workspace.name).toBe('Research Operations');
      expect(renamed.body.workspace.slug).toBe('research-dev');
    });

    it('rejects client attempts to set a slug and empty names with the validation envelope', async () => {
      const slugAttempt = await request
        .post(`/api/organizations/${orgAlphaId}/workspaces`)
        .set('Cookie', aliceCookie)
        .send({ name: 'Client Slug', slug: 'client-slug' });
      expect(slugAttempt.status).toBe(400);
      expect(slugAttempt.body.error.code).toBe('VALIDATION_ERROR');
      expect(slugAttempt.body.error.requestId).toBeDefined();

      const emptyName = await createWorkspace('   ');
      expect(emptyName.status).toBe(400);
      expect(emptyName.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('lists active workspaces with pagination and limits archived visibility to Owners and Managers', async () => {
      const created = await createWorkspace('Active Workspace');
      await request
        .post(`/api/workspaces/${created.body.workspace.id}/archive`)
        .set('Cookie', aliceCookie);

      const activeList = await request
        .get(`/api/organizations/${orgAlphaId}/workspaces`)
        .set('Cookie', ericCookie);
      expect(activeList.status).toBe(200);
      expect(activeList.body.data).toHaveLength(0);
      expect(activeList.body.meta.page).toBe(1);

      const denied = await request
        .get(`/api/organizations/${orgAlphaId}/workspaces?includeArchived=true`)
        .set('Cookie', ericCookie);
      expect(denied.status).toBe(403);

      const ownerList = await request
        .get(`/api/organizations/${orgAlphaId}/workspaces?includeArchived=true`)
        .set('Cookie', aliceCookie);
      expect(ownerList.status).toBe(200);
      expect(ownerList.body.data).toHaveLength(1);
      expect(ownerList.body.data[0].archivedAt).toBeDefined();
    });

    it('denies Employees mutations and cross-organization access', async () => {
      const employeeCreate = await createWorkspace('Employee Attempt', ericCookie);
      expect(employeeCreate.status).toBe(403);

      const foreignCreate = await request
        .post(`/api/organizations/${orgAlphaId}/workspaces`)
        .set('Cookie', bobCookie)
        .send({ name: 'Cross Tenant Attempt' });
      expect(foreignCreate.status).toBe(403);

      const created = await createWorkspace('Private Workspace');
      const foreignRead = await request
        .get(`/api/workspaces/${created.body.workspace.id}`)
        .set('Cookie', bobCookie);
      expect(foreignRead.status).toBe(403);
    });

    it('restores with the original slug and reports a conflict rather than renaming', async () => {
      const created = await createWorkspace('Restore Me');
      const workspaceId = created.body.workspace.id as string;
      await request.post(`/api/workspaces/${workspaceId}/archive`).set('Cookie', aliceCookie);

      // Simulate an out-of-band conflicting row to exercise the service guard.
      mockWorkspaces.push({
        id: 'ws_conflicting_slug',
        name: 'Other Workspace',
        slug: created.body.workspace.slug,
        description: null,
        orgId: orgAlphaId,
        archivedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const conflict = await request.post(`/api/workspaces/${workspaceId}/restore`).set('Cookie', aliceCookie);
      expect(conflict.status).toBe(409);
      expect(mockWorkspaces.find((workspace) => workspace.id === workspaceId)?.slug).toBe('restore-me');
    });

    it('requires authentication', async () => {
      const response = await request.get(`/api/organizations/${orgAlphaId}/workspaces`);
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  // ============================================================
  // Cross-Tenant Read Denial Tests
  // ============================================================
  describe('Cross-Tenant Read Isolation', () => {
    it('Members of Alpha Corp can view their organization details', async () => {
      const resAlice = await request
        .get(`/api/organizations/${orgAlphaId}`)
        .set('Cookie', aliceCookie);
      expect(resAlice.status).toBe(200);
      expect(resAlice.body.organization.id).toBe(orgAlphaId);

      const resEric = await request
        .get(`/api/organizations/${orgAlphaId}`)
        .set('Cookie', ericCookie);
      expect(resEric.status).toBe(200);
      expect(resEric.body.organization.role).toBe('EMPLOYEE');
    });

    it('DENIES User B (from Beta Ltd) access to view Alpha Corp details', async () => {
      const resBob = await request
        .get(`/api/organizations/${orgAlphaId}`)
        .set('Cookie', bobCookie);

      expect(resBob.status).toBe(403);
      expect(resBob.body.error.code).toBe('FORBIDDEN');
      expect(resBob.body.error.message).toContain('not a member of this organization');
    });

    it('DENIES Employee from Beta Ltd access to list Alpha Corp members', async () => {
      const resEmma = await request
        .get(`/api/organizations/${orgAlphaId}/members`)
        .set('Cookie', emmaCookie);

      expect(resEmma.status).toBe(403);
      expect(resEmma.body.error.code).toBe('FORBIDDEN');
    });
  });

  // ============================================================
  // Role-Based Access Control (RBAC) Tests
  // ============================================================
  describe('Role-Based Permissions (OWNER vs MANAGER vs EMPLOYEE)', () => {
    it('OWNER can update organization details', async () => {
      const res = await request
        .patch(`/api/organizations/${orgAlphaId}`)
        .set('Cookie', aliceCookie)
        .send({ name: 'Alpha Corp Updated' });

      expect(res.status).toBe(200);
      expect(res.body.organization.name).toBe('Alpha Corp Updated');
    });

    it('DENIES MANAGER from updating organization settings', async () => {
      const res = await request
        .patch(`/api/organizations/${orgAlphaId}`)
        .set('Cookie', markCookie)
        .send({ name: 'Manager Hacked Name' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toContain('Insufficient organization permissions');
    });

    it('DENIES EMPLOYEE from updating organization settings', async () => {
      const res = await request
        .patch(`/api/organizations/${orgAlphaId}`)
        .set('Cookie', ericCookie)
        .send({ name: 'Employee Hacked Name' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  // ============================================================
  // Cross-Tenant Mutation & Member Management Denial
  // ============================================================
  describe('Cross-Tenant Mutation Denial & Member Management', () => {
    it('DENIES User B (Beta Owner) from updating Alpha Corp', async () => {
      const res = await request
        .patch(`/api/organizations/${orgAlphaId}`)
        .set('Cookie', bobCookie)
        .send({ name: 'Cross Org Attack' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('DENIES User B (Beta Owner) from adding a member to Alpha Corp', async () => {
      const res = await request
        .post(`/api/organizations/${orgAlphaId}/members`)
        .set('Cookie', bobCookie)
        .send({ email: 'newguy@test.com', role: 'EMPLOYEE' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('OWNER can add a registered user to the organization', async () => {
      // Register a user first
      await request
        .post('/api/auth/register')
        .send({
          email: 'newuser@alpha.com',
          password: 'Password123!',
          name: 'New Alpha Member',
        });

      const res = await request
        .post(`/api/organizations/${orgAlphaId}/members`)
        .set('Cookie', aliceCookie)
        .send({
          email: 'newuser@alpha.com',
          role: 'EMPLOYEE',
        });

      expect(res.status).toBe(201);
      expect(res.body.member.role).toBe('EMPLOYEE');
      expect(res.body.member.user.email).toBe('newuser@alpha.com');
    });

    it('DENIES adding an unregistered email with 404 Not Found', async () => {
      const res = await request
        .post(`/api/organizations/${orgAlphaId}/members`)
        .set('Cookie', aliceCookie)
        .send({
          email: 'unregistered@nowhere.com',
          role: 'EMPLOYEE',
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('DENIES adding an existing member with 409 Conflict', async () => {
      const res = await request
        .post(`/api/organizations/${orgAlphaId}/members`)
        .set('Cookie', aliceCookie)
        .send({
          email: 'mark@alpha.com',
          role: 'EMPLOYEE',
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONFLICT');
    });

    it('OWNER can change member role', async () => {
      const res = await request
        .patch(`/api/organizations/${orgAlphaId}/members/${ericId}`)
        .set('Cookie', aliceCookie)
        .send({ role: 'MANAGER' });

      expect(res.status).toBe(200);
      expect(res.body.member.role).toBe('MANAGER');
    });

    it('DENIES demoting the sole OWNER with 400 Bad Request safeguard', async () => {
      const res = await request
        .patch(`/api/organizations/${orgAlphaId}/members/${aliceId}`)
        .set('Cookie', aliceCookie)
        .send({ role: 'EMPLOYEE' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
      expect(res.body.error.message).toContain('sole organization owner');
    });

    it('OWNER can remove a member', async () => {
      const res = await request
        .delete(`/api/organizations/${orgAlphaId}/members/${ericId}`)
        .set('Cookie', aliceCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify member is gone
      const verifyRes = await request
        .get(`/api/organizations/${orgAlphaId}`)
        .set('Cookie', ericCookie);
      expect(verifyRes.status).toBe(403);
    });

    it('DENIES removing the sole OWNER', async () => {
      const res = await request
        .delete(`/api/organizations/${orgAlphaId}/members/${aliceId}`)
        .set('Cookie', aliceCookie);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
    });
  });

  // ============================================================
  // Spoofed OrgId & Route Tampering Tests
  // ============================================================
  describe('Spoofed OrgId & Route Tampering', () => {
    it('Ignores spoofed orgId in request body and enforces route authorization', async () => {
      // Bob tries to mutate Alpha while putting orgId: orgAlphaId in body or header
      const res = await request
        .patch(`/api/organizations/${orgAlphaId}`)
        .set('Cookie', bobCookie)
        .send({
          name: 'Spoofed Org Attempt',
          orgId: orgBetaId, // Spoofed body param
        });

      // Still denied because verified membership is strictly enforced on route orgId
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  // ============================================================
  // Cross-Tenant Attachment & Resource Access Denial (PRD line 149)
  // ============================================================
  describe('Cross-Tenant Attachment Metadata Access Denial', () => {
    it('DENIES cross-tenant attachment metadata access using verifyResourceOrg', async () => {
      const { verifyResourceOrg } = await import('../src/middleware/tenant.js');

      // Alpha attachment belonging to Alpha Corp
      const alphaAttachmentOrgId = orgAlphaId;
      const bobVerifiedOrgId = orgBetaId;

      // Bob in Beta attempting to access Alpha attachment metadata
      expect(() => {
        verifyResourceOrg(alphaAttachmentOrgId, bobVerifiedOrgId);
      }).toThrowError(/Cross-organization access denied/i);

      // Alice in Alpha accessing Alpha attachment metadata -> allowed
      expect(() => {
        verifyResourceOrg(alphaAttachmentOrgId, orgAlphaId);
      }).not.toThrow();
    });
  });
});
