
import { beforeEach, describe, expect, it, vi } from 'vitest';
import supertest from 'supertest';

const mocks = vi.hoisted(() => ({
  validateSession: vi.fn(),
  projectFindUnique: vi.fn(),
  orgMemberFindUnique: vi.fn(),
  projectMemberFindUnique: vi.fn(),
  taskFindUnique: vi.fn(),
  taskFindFirst: vi.fn(),
  taskFindMany: vi.fn(),
  taskCreate: vi.fn(),
  activityCreate: vi.fn(),
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
      findUnique: mocks.taskFindUnique,
      findFirst: mocks.taskFindFirst,
      findMany: mocks.taskFindMany,
    },
    $transaction: mocks.transaction,
  },
}));

const { createApp } = await import('../src/app.js');
const app = createApp('http://localhost:3000');

const projectId = 'project-a';
const parentId = 'parent-1';
const userId = 'user-a';
const date = new Date('2026-10-17T00:00:00.000Z');

const path = `/api/tasks/${parentId}/subtasks`;

function makeTask(overrides: Record<string, unknown> = {}) {
  return {
    id: parentId,
    title: 'Parent Task',
    description: null,
    status: 'TODO',
    priority: 'MEDIUM',
    startDate: null,
    dueDate: null,
    completedAt: null,
    archivedAt: null,
    position: 0,
    projectId,
    assigneeId: null,
    creatorId: userId,
    parentTaskId: null,
    createdAt: date,
    updatedAt: date,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();

  mocks.validateSession.mockResolvedValue({
    id: userId,
    email: 'alice@example.com',
    name: 'Alice',
  });

  mocks.taskFindUnique.mockResolvedValue(makeTask());

  mocks.taskFindFirst.mockResolvedValue(makeTask());

  mocks.taskFindMany.mockResolvedValue([
    makeTask({
      id: 'child-1',
      title: 'Child Task',
      parentTaskId: parentId,
    }),
  ]);

  mocks.projectFindUnique.mockResolvedValue({
    id: projectId,
    workspace: { orgId: 'org-a' },
  });

  mocks.orgMemberFindUnique.mockResolvedValue({
    userId,
    orgId: 'org-a',
  });

  mocks.projectMemberFindUnique.mockResolvedValue({
    userId,
    projectId,
  });

  mocks.taskCreate.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) =>
      makeTask({
        ...data,
        id: 'child-created',
      }),
  );

  mocks.activityCreate.mockResolvedValue({
    id: 'event-1',
  });

  mocks.transaction.mockImplementation(
    async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        task: { create: mocks.taskCreate },
        activityEvent: { create: mocks.activityCreate },
      }),
  );
});

describe('PRD 03 Subtask APIs', () => {
  it('creates a child task with the correct parent', async () => {
    const response = await supertest(app)
      .post(path)
      .set('Authorization', 'Bearer session-a')
      .send({ title: 'Child Task' });

    expect(response.status).toBe(201);
    expect(response.body.task.parentTaskId).toBe(parentId);
    expect(response.body.task.projectId).toBe(projectId);

    expect(mocks.activityCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'TASK_CREATED',
        entityType: 'TASK',
      }),
    });
  });

  it('lists active subtasks for a parent', async () => {
    const response = await supertest(app)
      .get(path)
      .set('Authorization', 'Bearer session-a');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);

    expect(mocks.taskFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          parentTaskId: parentId,
          projectId,
          archivedAt: null,
        },
      }),
    );
  });

  it('rejects unauthenticated subtask creation', async () => {
    mocks.validateSession.mockResolvedValue(null);

    const response = await supertest(app)
      .post(path)
      .send({ title: 'Child Task' });

    expect(response.status).toBe(401);
    expect(mocks.taskCreate).not.toHaveBeenCalled();
  });

  it('rejects creating subtasks for an archived parent', async () => {
    mocks.taskFindUnique.mockResolvedValue(
      makeTask({ archivedAt: date }),
    );

    const response = await supertest(app)
      .post(path)
      .set('Authorization', 'Bearer session-a')
      .send({ title: 'Child Task' });

    expect(response.status).toBe(404);
    expect(mocks.taskCreate).not.toHaveBeenCalled();
  });

  it('rejects conflicting parentTaskId values', async () => {
    const response = await supertest(app)
      .post(path)
      .set('Authorization', 'Bearer session-a')
      .send({
        title: 'Child Task',
        parentTaskId: 'another-parent',
      });

    expect(response.status).toBe(400);
    expect(mocks.taskCreate).not.toHaveBeenCalled();
  });

  it('denies cross-tenant access to subtasks', async () => {
    mocks.orgMemberFindUnique.mockResolvedValue(null);

    const response = await supertest(app)
      .get(path)
      .set('Authorization', 'Bearer session-a');

    expect(response.status).toBe(403);
    expect(mocks.taskFindMany).not.toHaveBeenCalled();
  });

  it('returns 404 for a missing parent', async () => {
    mocks.taskFindUnique.mockResolvedValue(null);

    const response = await supertest(app)
      .get(path)
      .set('Authorization', 'Bearer session-a');

    expect(response.status).toBe(404);
  });
});
