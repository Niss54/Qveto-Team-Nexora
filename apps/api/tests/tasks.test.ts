
import { beforeEach, describe, expect, it, vi } from 'vitest';
import supertest from 'supertest';

const mocks = vi.hoisted(() => ({
  validateSession: vi.fn(),
  projectFindUnique: vi.fn(),
  orgMemberFindUnique: vi.fn(),
  projectMemberFindUnique: vi.fn(),
  taskFindFirst: vi.fn(),
  taskFindMany: vi.fn(),
  taskCount: vi.fn(),
  taskCreate: vi.fn(),
  eventCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../src/services/auth.service.js', () => ({
  authService: {
    validateSession: mocks.validateSession,
  },
}));

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    project: { findUnique: mocks.projectFindUnique },
    organizationMember: {
      findUnique: mocks.orgMemberFindUnique,
    },
    projectMember: {
      findUnique: mocks.projectMemberFindUnique,
    },
    task: {
      findFirst: mocks.taskFindFirst,
      findMany: mocks.taskFindMany,
      count: mocks.taskCount,
    },
    $transaction: mocks.transaction,
  },
}));

const { createApp } = await import('../src/app.js');
const app = createApp('http://localhost:3000');

const PROJECT_A = 'project-a';
const PROJECT_B = 'project-b';
const ORG_A = 'org-a';
const ORG_B = 'org-b';
const USER_A = 'user-a';
const USER_B = 'user-b';

const basePath = `/api/projects/${PROJECT_A}/tasks`;

const date = new Date('2026-10-17T00:00:00.000Z');

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    title: 'Test Task',
    description: null,
    status: 'TODO',
    priority: 'MEDIUM',
    startDate: null,
    dueDate: null,
    completedAt: null,
    archivedAt: null,
    position: 0,
    projectId: PROJECT_A,
    assigneeId: null,
    creatorId: USER_A,
    parentTaskId: null,
    createdAt: date,
    updatedAt: date,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();

  mocks.validateSession.mockImplementation(
    async (sessionId: string) => {
      if (sessionId === 'session-a') {
        return {
          id: USER_A,
          email: 'alice@example.com',
          name: 'Alice',
        };
      }

      if (sessionId === 'session-b') {
        return {
          id: USER_B,
          email: 'bob@example.com',
          name: 'Bob',
        };
      }

      return null;
    },
  );

  mocks.projectFindUnique.mockImplementation(
    async ({ where }: { where: { id: string } }) => {
      if (where.id === PROJECT_A) {
        return {
          id: PROJECT_A,
          workspace: { orgId: ORG_A },
        };
      }

      if (where.id === PROJECT_B) {
        return {
          id: PROJECT_B,
          workspace: { orgId: ORG_B },
        };
      }

      return null;
    },
  );

  mocks.orgMemberFindUnique.mockImplementation(
    async ({
      where,
    }: {
      where: {
        userId_orgId: { userId: string; orgId: string };
      };
    }) => {
      const { userId, orgId } = where.userId_orgId;

      if (
        (userId === USER_A && orgId === ORG_A) ||
        (userId === USER_B && orgId === ORG_B)
      ) {
        return { userId, orgId, role: 'EMPLOYEE' };
      }

      return null;
    },
  );

  mocks.projectMemberFindUnique.mockImplementation(
    async ({
      where,
    }: {
      where: {
        userId_projectId: {
          userId: string;
          projectId: string;
        };
      };
    }) => {
      const { userId, projectId } = where.userId_projectId;

      if (
        (userId === USER_A && projectId === PROJECT_A) ||
        (userId === USER_B && projectId === PROJECT_B)
      ) {
        return { userId, projectId, role: 'MEMBER' };
      }

      return null;
    },
  );

  mocks.taskFindMany.mockResolvedValue([makeTask()]);
  mocks.taskCount.mockResolvedValue(1);
  mocks.taskFindFirst.mockResolvedValue(makeTask());

  mocks.taskCreate.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) =>
      makeTask({ ...data, id: 'created-task' }),
  );

  mocks.eventCreate.mockResolvedValue({
    id: 'event-1',
    type: 'TASK_CREATED',
  });

  mocks.transaction.mockImplementation(
    async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        task: { create: mocks.taskCreate },
        activityEvent: { create: mocks.eventCreate },
      }),
  );
});

describe('PRD 03 Task APIs', () => {
  describe('Authentication', () => {
    it('rejects unauthenticated task listing', async () => {
      const response = await supertest(app).get(basePath);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects unauthenticated task creation', async () => {
      const response = await supertest(app)
        .post(basePath)
        .send({ title: 'New Task' });

      expect(response.status).toBe(401);
      expect(mocks.taskCreate).not.toHaveBeenCalled();
    });
  });

  describe('Task listing', () => {
    it('lists tasks for an authorized project member', async () => {
      const response = await supertest(app)
        .get(basePath)
        .set('Authorization', 'Bearer session-a');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].title).toBe('Test Task');

      expect(response.body.meta).toEqual({
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      });
    });

    it('supports pagination', async () => {
      mocks.taskCount.mockResolvedValue(45);

      const response = await supertest(app)
        .get(`${basePath}?page=2&pageSize=10`)
        .set('Authorization', 'Bearer session-a');

      expect(response.status).toBe(200);
      expect(response.body.meta).toEqual({
        total: 45,
        page: 2,
        pageSize: 10,
        totalPages: 5,
      });

      expect(mocks.taskFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
        }),
      );
    });

    it('rejects invalid pagination', async () => {
      const response = await supertest(app)
        .get(`${basePath}?page=-1&pageSize=200`)
        .set('Authorization', 'Bearer session-a');

      expect(response.status).toBe(400);
      expect(mocks.taskFindMany).not.toHaveBeenCalled();
    });

    it('excludes archived tasks from the query', async () => {
      const response = await supertest(app)
        .get(basePath)
        .set('Authorization', 'Bearer session-a');

      expect(response.status).toBe(200);

      expect(mocks.taskFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            projectId: PROJECT_A,
            archivedAt: null,
          },
        }),
      );
    });
  });

  describe('Task creation', () => {
    it('creates a task and records its activity event', async () => {
      const response = await supertest(app)
        .post(basePath)
        .set('Authorization', 'Bearer session-a')
        .send({
          title: '  New Task  ',
          description: 'Test description',
          priority: 'HIGH',
        });

      expect(response.status).toBe(201);
      expect(response.body.task.title).toBe('New Task');
      expect(response.body.task.creatorId).toBe(USER_A);
      expect(response.body.task.projectId).toBe(PROJECT_A);

      expect(mocks.taskCreate).toHaveBeenCalledOnce();

      expect(mocks.eventCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'TASK_CREATED',
          entityType: 'TASK',
          entityId: 'created-task',
          actorId: USER_A,
          orgId: ORG_A,
        }),
      });

      expect(mocks.transaction).toHaveBeenCalledOnce();
    });

    it('rejects an empty title', async () => {
      const response = await supertest(app)
        .post(basePath)
        .set('Authorization', 'Bearer session-a')
        .send({ title: '' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(mocks.taskCreate).not.toHaveBeenCalled();
    });

    it('rejects a due date before the start date', async () => {
      const response = await supertest(app)
        .post(basePath)
        .set('Authorization', 'Bearer session-a')
        .send({
          title: 'Invalid dates',
          startDate: '2026-10-20',
          dueDate: '2026-10-18',
        });

      expect(response.status).toBe(400);
      expect(mocks.taskCreate).not.toHaveBeenCalled();
    });

    it('rejects an assignee outside the project', async () => {
      const response = await supertest(app)
        .post(basePath)
        .set('Authorization', 'Bearer session-a')
        .send({
          title: 'Assigned Task',
          assigneeId: USER_B,
        });

      expect(response.status).toBe(400);
      expect(mocks.taskCreate).not.toHaveBeenCalled();
    });

    it('sets completedAt for a task created as DONE', async () => {
      const response = await supertest(app)
        .post(basePath)
        .set('Authorization', 'Bearer session-a')
        .send({
          title: 'Completed Task',
          status: 'DONE',
        });

      expect(response.status).toBe(201);

      expect(mocks.taskCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'DONE',
            completedAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe('Project authorization and tenant isolation', () => {
    it('denies access to another organization project', async () => {
      const response = await supertest(app)
        .get(`/api/projects/${PROJECT_B}/tasks`)
        .set('Authorization', 'Bearer session-a');

      expect(response.status).toBe(403);
      expect(mocks.taskFindMany).not.toHaveBeenCalled();
    });

    it('denies creating tasks in another organization', async () => {
      const response = await supertest(app)
        .post(`/api/projects/${PROJECT_B}/tasks`)
        .set('Authorization', 'Bearer session-a')
        .send({ title: 'Unauthorized Task' });

      expect(response.status).toBe(403);
      expect(mocks.taskCreate).not.toHaveBeenCalled();
    });

    it('returns 404 for an unknown project', async () => {
      const response = await supertest(app)
        .get('/api/projects/unknown-project/tasks')
        .set('Authorization', 'Bearer session-a');

      expect(response.status).toBe(404);
    });

    it('denies a project member who lost organization access', async () => {
      mocks.orgMemberFindUnique.mockResolvedValue(null);

      const response = await supertest(app)
        .get(basePath)
        .set('Authorization', 'Bearer session-a');

      expect(response.status).toBe(403);
    });

    it('denies an organization member without project access', async () => {
      mocks.projectMemberFindUnique.mockResolvedValue(null);

      const response = await supertest(app)
        .get(basePath)
        .set('Authorization', 'Bearer session-a');

      expect(response.status).toBe(403);
    });
  });
});
