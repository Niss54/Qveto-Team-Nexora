import { beforeEach, describe, expect, it, vi } from 'vitest';
import supertest from 'supertest';

const mocks = vi.hoisted(() => ({
  validateSession: vi.fn(), projectFindUnique: vi.fn(), orgMemberFindUnique: vi.fn(),
  projectMemberFindUnique: vi.fn(), taskFindMany: vi.fn(), taskFindUniqueOrThrow: vi.fn(),
  taskUpdateMany: vi.fn(), activityCreate: vi.fn(), transaction: vi.fn(),
}));
vi.mock('../src/services/auth.service.js', () => ({
  authService: { validateSession: mocks.validateSession },
}));
vi.mock('../src/lib/prisma.js', () => ({ prisma: {
  project: { findUnique: mocks.projectFindUnique },
  organizationMember: { findUnique: mocks.orgMemberFindUnique },
  projectMember: { findUnique: mocks.projectMemberFindUnique },
  task: { findMany: mocks.taskFindMany },
  $transaction: mocks.transaction,
} }));

const { createApp } = await import('../src/app.js');
const app = createApp('http://localhost:3000');
const root = '/api/projects/project-a/kanban';
const date = new Date('2026-10-17T01:00:00.000Z');
function task(id: string, status: 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE', position: number) {
  return {
    id, status, position, title: id, description: null, priority: 'MEDIUM',
    startDate: null, dueDate: null, completedAt: status === 'DONE' ? date : null,
    archivedAt: null, projectId: 'project-a', assigneeId: null, creatorId: 'user-a',
    parentTaskId: null, createdAt: date, updatedAt: date,
  };
}
const initial = [task('t1', 'TODO', 0), task('t2', 'TODO', 1), task('p1', 'IN_PROGRESS', 0)];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.validateSession.mockImplementation(async (token: string) =>
    token === 'session-a' ? { id: 'user-a', email: 'a@example.com', name: 'A' } : null,
  );
  mocks.projectFindUnique.mockResolvedValue({ workspace: { orgId: 'org-a' } });
  mocks.orgMemberFindUnique.mockResolvedValue({ userId: 'user-a', orgId: 'org-a' });
  mocks.projectMemberFindUnique.mockResolvedValue({ userId: 'user-a', projectId: 'project-a' });
  mocks.taskFindMany.mockResolvedValue(initial);
  mocks.taskUpdateMany.mockResolvedValue({ count: 1 });
  mocks.taskFindUniqueOrThrow.mockResolvedValue(task('t1', 'IN_PROGRESS', 1));
  mocks.activityCreate.mockResolvedValue({ id: 'activity-1' });
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
    task: {
      findMany: mocks.taskFindMany, updateMany: mocks.taskUpdateMany,
      findUniqueOrThrow: mocks.taskFindUniqueOrThrow,
    },
    activityEvent: { create: mocks.activityCreate },
  }));
});

describe('PRD 03 Kanban API', () => {
  it('returns four columns, even when some are empty', async () => {
    const res = await supertest(app).get(root).set('Authorization', 'Bearer session-a');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.columns)).toEqual(['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE']);
    expect(res.body.columns.TODO.map((t: { id: string }) => t.id)).toEqual(['t1', 't2']);
    expect(res.body.columns.IN_REVIEW).toEqual([]);
    expect(res.body.total).toBe(3);
  });

  it('moves a task between columns and renumbers both columns', async () => {
    const res = await supertest(app).patch(`${root}/move`).set('Authorization', 'Bearer session-a')
      .send({ taskId: 't1', status: 'IN_PROGRESS', targetIndex: 1 });
    expect(res.status).toBe(200);
    expect(mocks.taskUpdateMany).toHaveBeenCalledTimes(2);
    expect(mocks.taskUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 't1', projectId: 'project-a' }),
      data: expect.objectContaining({ status: 'IN_PROGRESS', position: 1 }),
    }));
    expect(mocks.activityCreate.mock.calls.map(([arg]) => arg.data.type))
      .toEqual(['TASK_UPDATED', 'TASK_STATUS_CHANGED']);
    expect(mocks.transaction.mock.calls[0][1]).toEqual({ isolationLevel: 'Serializable' });
  });

  it('reorders tasks within one column', async () => {
    mocks.taskFindUniqueOrThrow.mockResolvedValue(task('t2', 'TODO', 0));
    const res = await supertest(app).patch(`${root}/move`).set('Authorization', 'Bearer session-a')
      .send({ taskId: 't2', status: 'TODO', targetIndex: 0 });
    expect(res.status).toBe(200);
    expect(mocks.taskUpdateMany).toHaveBeenCalledTimes(2);
    expect(mocks.activityCreate).toHaveBeenCalledTimes(1);
    expect(mocks.activityCreate.mock.calls[0][0].data.type).toBe('TASK_UPDATED');
  });

  it('records completion events when moving to DONE', async () => {
    mocks.taskFindUniqueOrThrow.mockResolvedValue(task('t1', 'DONE', 0));
    const res = await supertest(app).patch(`${root}/move`).set('Authorization', 'Bearer session-a')
      .send({ taskId: 't1', status: 'DONE', targetIndex: 0 });
    expect(res.status).toBe(200);
    expect(mocks.activityCreate.mock.calls.map(([arg]) => arg.data.type))
      .toEqual(['TASK_UPDATED', 'TASK_STATUS_CHANGED', 'TASK_COMPLETED']);
    expect(mocks.taskUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'DONE', completedAt: expect.any(Date) }),
    }));
  });

  it('clears completedAt when reopening a task', async () => {
    mocks.taskFindMany.mockResolvedValue([task('done', 'DONE', 0)]);
    mocks.taskFindUniqueOrThrow.mockResolvedValue(task('done', 'TODO', 0));
    const res = await supertest(app).patch(`${root}/move`).set('Authorization', 'Bearer session-a')
      .send({ taskId: 'done', status: 'TODO', targetIndex: 0 });
    expect(res.status).toBe(200);
    expect(mocks.taskUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'TODO', completedAt: null }),
    }));
  });

  it('rejects a task not contained in the project', async () => {
    const res = await supertest(app).patch(`${root}/move`).set('Authorization', 'Bearer session-a')
      .send({ taskId: 'outside', status: 'TODO', targetIndex: 0 });
    expect(res.status).toBe(404);
    expect(mocks.taskUpdateMany).not.toHaveBeenCalled();
  });

  it('rejects invalid indexes, statuses, and extra fields', async () => {
    for (const payload of [
      { taskId: 't1', status: 'TODO', targetIndex: -1 },
      { taskId: 't1', status: 'BLOCKED', targetIndex: 0 },
      { taskId: 't1', status: 'TODO', targetIndex: 0, projectId: 'evil' },
      { taskId: 't1', status: 'TODO', targetIndex: 1.5 },
    ]) {
      const res = await supertest(app).patch(`${root}/move`).set('Authorization', 'Bearer session-a').send(payload);
      expect(res.status).toBe(400);
    }
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('rejects destination indexes beyond the column length', async () => {
    const res = await supertest(app).patch(`${root}/move`).set('Authorization', 'Bearer session-a')
      .send({ taskId: 't1', status: 'IN_REVIEW', targetIndex: 5 });
    expect(res.status).toBe(400);
  });

  it('requires authentication', async () => {
    mocks.validateSession.mockResolvedValue(null);
    expect((await supertest(app).get(root)).status).toBe(401);
    expect((await supertest(app).patch(`${root}/move`).send({ taskId: 't1', status: 'DONE', targetIndex: 0 })).status).toBe(401);
  });

  it('denies access without both organization and project membership', async () => {
    mocks.orgMemberFindUnique.mockResolvedValue(null);
    expect((await supertest(app).get(root).set('Authorization', 'Bearer session-a')).status).toBe(403);
    mocks.orgMemberFindUnique.mockResolvedValue({ userId: 'user-a' });
    mocks.projectMemberFindUnique.mockResolvedValue(null);
    expect((await supertest(app).patch(`${root}/move`).set('Authorization', 'Bearer session-a')
      .send({ taskId: 't1', status: 'DONE', targetIndex: 0 })).status).toBe(403);
  });

  it('returns 404 when project does not exist', async () => {
    mocks.projectFindUnique.mockResolvedValue(null);
    expect((await supertest(app).get(root).set('Authorization', 'Bearer session-a')).status).toBe(404);
  });

  it('returns 409 on a concurrent task change', async () => {
    mocks.taskUpdateMany.mockResolvedValueOnce({ count: 0 });
    const res = await supertest(app).patch(`${root}/move`).set('Authorization', 'Bearer session-a')
      .send({ taskId: 't1', status: 'IN_PROGRESS', targetIndex: 0 });
    expect(res.status).toBe(409);
  });

  it('returns 409 on a serializable transaction conflict', async () => {
    mocks.transaction.mockRejectedValue({ code: 'P2034' });
    const res = await supertest(app).patch(`${root}/move`).set('Authorization', 'Bearer session-a')
      .send({ taskId: 't1', status: 'DONE', targetIndex: 0 });
    expect(res.status).toBe(409);
  });
});
