import { beforeEach, describe, expect, it, vi } from 'vitest';
import supertest from 'supertest';

const mocks = vi.hoisted(() => ({
  validateSession: vi.fn(),
  orgMemberFindUnique: vi.fn(),
  projectMemberFindMany: vi.fn(),
  taskFindMany: vi.fn(),
  taskCount: vi.fn(),
}));

vi.mock('../src/services/auth.service.js', () => ({
  authService: {
    validateSession: mocks.validateSession,
  },
}));

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    organizationMember: {
      findUnique: mocks.orgMemberFindUnique,
    },
    projectMember: {
      findMany: mocks.projectMemberFindMany,
    },
    task: {
      findMany: mocks.taskFindMany,
      count: mocks.taskCount,
    },
  },
}));

const { createApp } = await import('../src/app.js');
const app = createApp('http://localhost:3000');

const USER_A = 'user-a';
const USER_B = 'user-b';
const ORG_A = 'org-a';
const ORG_B = 'org-b';
const PROJECT_A1 = 'project-a1';
const PROJECT_A2 = 'project-a2';
const PROJECT_B1 = 'project-b1';

const date = new Date('2026-10-17T00:00:00.000Z');
const dueDate = new Date('2026-10-25T00:00:00.000Z');

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    title: 'Test Task',
    description: 'Task description',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    startDate: date,
    dueDate,
    completedAt: null,
    projectId: PROJECT_A1,
    assigneeId: USER_A,
    creatorId: USER_A,
    createdAt: date,
    updatedAt: date,
    project: {
      id: PROJECT_A1,
      name: 'Project Alpha 1',
      workspace: {
        id: 'ws-a',
        name: 'Workspace Alpha',
        orgId: ORG_A,
      },
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();

  mocks.validateSession.mockImplementation(async (sessionId: string) => {
    if (sessionId === 'session-a') {
      return { id: USER_A, email: 'alice@example.com', name: 'Alice' };
    }
    if (sessionId === 'session-b') {
      return { id: USER_B, email: 'bob@example.com', name: 'Bob' };
    }
    return null;
  });

  mocks.orgMemberFindUnique.mockImplementation(
    async ({ where }: { where: { userId_orgId: { userId: string; orgId: string } } }) => {
      const { userId, orgId } = where.userId_orgId;
      if (userId === USER_A && orgId === ORG_A) {
        return { userId, orgId, role: 'EMPLOYEE' };
      }
      if (userId === USER_B && orgId === ORG_B) {
        return { userId, orgId, role: 'EMPLOYEE' };
      }
      return null;
    },
  );

  mocks.projectMemberFindMany.mockImplementation(
    async ({ where }: { where: { userId: string; project?: { workspace?: { orgId?: string } } } }) => {
      if (where.userId === USER_A) {
        const orgIdFilter = where.project?.workspace?.orgId;
        if (!orgIdFilter || orgIdFilter === ORG_A) {
          return [{ projectId: PROJECT_A1 }, { projectId: PROJECT_A2 }];
        }
        return [];
      }
      if (where.userId === USER_B) {
        const orgIdFilter = where.project?.workspace?.orgId;
        if (!orgIdFilter || orgIdFilter === ORG_B) {
          return [{ projectId: PROJECT_B1 }];
        }
        return [];
      }
      return [];
    },
  );

  mocks.taskFindMany.mockResolvedValue([makeTask()]);
  mocks.taskCount.mockResolvedValue(1);
});

describe('PRD 05: My Work API (/api/tasks/my-work)', () => {
  describe('Authentication', () => {
    it('rejects unauthenticated requests with 401 UNAUTHORIZED', async () => {
      const response = await supertest(app).get('/api/tasks/my-work');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(mocks.taskFindMany).not.toHaveBeenCalled();
    });

    it('rejects requests with invalid session token', async () => {
      const response = await supertest(app)
        .get('/api/tasks/my-work')
        .set('Authorization', 'Bearer invalid-session');

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(mocks.taskFindMany).not.toHaveBeenCalled();
    });
  });

  describe('Success, Structure, and Date Serialization', () => {
    it('returns tasks, pagination metadata, and summary statistics', async () => {
      mocks.taskCount
        .mockResolvedValueOnce(5)  // total matching filtered tasks
        .mockResolvedValueOnce(3)  // totalOpen
        .mockResolvedValueOnce(1)  // overdue
        .mockResolvedValueOnce(2)  // dueToday
        .mockResolvedValueOnce(2); // completed

      const response = await supertest(app)
        .get('/api/tasks/my-work')
        .set('Authorization', 'Bearer session-a');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
      expect(response.body).toHaveProperty('summary');

      // Verify meta
      expect(response.body.meta).toEqual({
        total: 5,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });

      // Verify summary
      expect(response.body.summary).toEqual({
        totalOpen: 3,
        overdue: 1,
        dueToday: 2,
        completed: 2,
      });

      // Verify task shape and ISO date serialization
      expect(response.body.data).toHaveLength(1);
      const task = response.body.data[0];
      expect(task.id).toBe('task-1');
      expect(task.title).toBe('Test Task');
      expect(typeof task.createdAt).toBe('string');
      expect(task.createdAt).toBe(date.toISOString());
      expect(task.startDate).toBe(date.toISOString());
      expect(task.dueDate).toBe(dueDate.toISOString());
    });

    it('returns empty array and zeroed summary if user belongs to no projects', async () => {
      mocks.projectMemberFindMany.mockResolvedValueOnce([]);

      const response = await supertest(app)
        .get('/api/tasks/my-work')
        .set('Authorization', 'Bearer session-a');

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([]);
      expect(response.body.meta).toEqual({
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
      });
      expect(response.body.summary).toEqual({
        totalOpen: 0,
        overdue: 0,
        dueToday: 0,
        completed: 0,
      });
      expect(mocks.taskFindMany).not.toHaveBeenCalled();
    });
  });

  describe('Tenant Scoping & Access Control', () => {
    it('verifies organization membership when orgId is provided', async () => {
      const response = await supertest(app)
        .get(`/api/tasks/my-work?orgId=${ORG_A}`)
        .set('Authorization', 'Bearer session-a');

      expect(response.status).toBe(200);
      expect(mocks.orgMemberFindUnique).toHaveBeenCalledWith({
        where: {
          userId_orgId: {
            userId: USER_A,
            orgId: ORG_A,
          },
        },
      });
    });

    it('denies access with 403 FORBIDDEN when user does not belong to the requested orgId', async () => {
      const response = await supertest(app)
        .get(`/api/tasks/my-work?orgId=${ORG_B}`)
        .set('Authorization', 'Bearer session-a');

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
      expect(response.body.error.message).toContain('not a member of this organization');
      expect(mocks.taskFindMany).not.toHaveBeenCalled();
    });

    it('validates projectId membership and denies access with 403 FORBIDDEN if not a member', async () => {
      const response = await supertest(app)
        .get(`/api/tasks/my-work?projectId=${PROJECT_B1}`)
        .set('Authorization', 'Bearer session-a');

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
      expect(response.body.error.message).toContain('do not have access to this project');

      // Early validation guarantee: task queries are never executed
      expect(mocks.taskFindMany).not.toHaveBeenCalled();
      expect(mocks.taskCount).not.toHaveBeenCalled();
    });

    it('scopes tasks to requested projectId when authorized', async () => {
      const response = await supertest(app)
        .get(`/api/tasks/my-work?projectId=${PROJECT_A1}`)
        .set('Authorization', 'Bearer session-a');

      expect(response.status).toBe(200);
      expect(mocks.taskFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            projectId: PROJECT_A1,
            assigneeId: USER_A,
          }),
        }),
      );
    });
  });

  describe('Filtering & Pagination', () => {
    it('applies status and priority filters to the query', async () => {
      const response = await supertest(app)
        .get('/api/tasks/my-work?status=IN_PROGRESS&priority=HIGH')
        .set('Authorization', 'Bearer session-a');

      expect(response.status).toBe(200);
      expect(mocks.taskFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'IN_PROGRESS',
            priority: 'HIGH',
          }),
        }),
      );
    });

    it('applies overdue filter when overdue=true', async () => {
      const response = await supertest(app)
        .get('/api/tasks/my-work?overdue=true')
        .set('Authorization', 'Bearer session-a');

      expect(response.status).toBe(200);
      expect(mocks.taskFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { not: 'DONE' },
            dueDate: expect.objectContaining({ lt: expect.any(Date) }),
          }),
        }),
      );
    });

    it('supports custom page and pageSize pagination', async () => {
      mocks.taskCount.mockResolvedValue(55);

      const response = await supertest(app)
        .get('/api/tasks/my-work?page=3&pageSize=10')
        .set('Authorization', 'Bearer session-a');

      expect(response.status).toBe(200);
      expect(mocks.taskFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
        }),
      );
      expect(response.body.meta).toEqual({
        total: 55,
        page: 3,
        pageSize: 10,
        totalPages: 6,
      });
    });
  });

  describe('Validation & Edge Cases', () => {
    it('rejects invalid status value with 400 VALIDATION_ERROR', async () => {
      const response = await supertest(app)
        .get('/api/tasks/my-work?status=INVALID_STATUS')
        .set('Authorization', 'Bearer session-a');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects invalid priority value with 400 VALIDATION_ERROR', async () => {
      const response = await supertest(app)
        .get('/api/tasks/my-work?priority=SUPER_HIGH')
        .set('Authorization', 'Bearer session-a');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects page < 1 with 400 VALIDATION_ERROR', async () => {
      const response = await supertest(app)
        .get('/api/tasks/my-work?page=0')
        .set('Authorization', 'Bearer session-a');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects pageSize > 100 with 400 VALIDATION_ERROR', async () => {
      const response = await supertest(app)
        .get('/api/tasks/my-work?pageSize=500')
        .set('Authorization', 'Bearer session-a');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects unrecognized query parameters with strict validation', async () => {
      const response = await supertest(app)
        .get('/api/tasks/my-work?unknownParam=attack')
        .set('Authorization', 'Bearer session-a');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
