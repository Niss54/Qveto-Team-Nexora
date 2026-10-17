import { beforeEach, describe, expect, it, vi } from 'vitest';
import supertest from 'supertest';

const mocks = vi.hoisted(() => ({
  validateSession: vi.fn(),
  projectFindUnique: vi.fn(),
  orgMemberFindUnique: vi.fn(),
  projectMemberFindUnique: vi.fn(),
  taskFindUnique: vi.fn(),
  taskFindFirst: vi.fn(),
  labelFindMany: vi.fn(),
  labelFindFirst: vi.fn(),
  labelCreate: vi.fn(),
  taskLabelFindMany: vi.fn(),
  taskLabelCreate: vi.fn(),
  taskLabelDeleteMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../src/services/auth.service.js', () => ({
  authService: { validateSession: mocks.validateSession },
}));

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    project: { findUnique: mocks.projectFindUnique },
    organizationMember: { findUnique: mocks.orgMemberFindUnique },
    projectMember: { findUnique: mocks.projectMemberFindUnique },
    task: { findUnique: mocks.taskFindUnique },
    label: {
      findMany: mocks.labelFindMany,
      findFirst: mocks.labelFindFirst,
      create: mocks.labelCreate,
    },
    taskLabel: {
      findMany: mocks.taskLabelFindMany,
      deleteMany: mocks.taskLabelDeleteMany,
    },
    $transaction: mocks.transaction,
  },
}));

const { createApp } = await import('../src/app.js');
const app = createApp('http://localhost:3000');

const PROJECT = 'project-a';
const ORG = 'org-a';
const USER = 'user-a';
const TASK = 'task-a';
const LABEL = 'label-a';
const projectPath = `/api/projects/${PROJECT}/labels`;
const taskPath = `/api/tasks/${TASK}/labels`;
const now = new Date('2026-10-17T00:00:00.000Z');

const label = {
  id: LABEL,
  name: 'Urgent',
  color: '#ff0000',
  orgId: ORG,
  createdAt: now,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.validateSession.mockImplementation(async (token: string) =>
    token === 'session-a'
      ? { id: USER, email: 'alice@example.com', name: 'Alice' }
      : null,
  );
  mocks.projectFindUnique.mockResolvedValue({ workspace: { orgId: ORG } });
  mocks.orgMemberFindUnique.mockResolvedValue({ userId: USER, orgId: ORG });
  mocks.projectMemberFindUnique.mockResolvedValue({ userId: USER, projectId: PROJECT });
  mocks.taskFindUnique.mockResolvedValue({ id: TASK, projectId: PROJECT, archivedAt: null });
  mocks.taskFindFirst.mockResolvedValue({ id: TASK });
  mocks.labelFindMany.mockResolvedValue([label]);
  mocks.labelFindFirst.mockResolvedValue(label);
  mocks.labelCreate.mockResolvedValue(label);
  mocks.taskLabelFindMany.mockResolvedValue([{ label }]);
  mocks.taskLabelCreate.mockResolvedValue({ id: 'link-a', taskId: TASK, labelId: LABEL });
  mocks.taskLabelDeleteMany.mockResolvedValue({ count: 1 });
  mocks.transaction.mockImplementation(
    async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        task: { findFirst: mocks.taskFindFirst },
        taskLabel: { create: mocks.taskLabelCreate },
      }),
  );
});

describe('PRD 03 Label APIs', () => {
  describe('Project labels', () => {
    it('lists labels belonging to the project organization', async () => {
      const response = await supertest(app)
        .get(projectPath)
        .set('Authorization', 'Bearer session-a');
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].id).toBe(LABEL);
      expect(mocks.labelFindMany).toHaveBeenCalledWith({
        where: { orgId: ORG },
        orderBy: { name: 'asc' },
      });
    });

    it('creates a trimmed label with its organization ID', async () => {
      const response = await supertest(app)
        .post(projectPath)
        .set('Authorization', 'Bearer session-a')
        .send({ name: '  Urgent  ', color: '#ff0000' });
      expect(response.status).toBe(201);
      expect(response.body.label.id).toBe(LABEL);
      expect(mocks.labelCreate).toHaveBeenCalledWith({
        data: { orgId: ORG, name: 'Urgent', color: '#ff0000' },
      });
    });

    it('defaults the label color when omitted', async () => {
      const response = await supertest(app)
        .post(projectPath)
        .set('Authorization', 'Bearer session-a')
        .send({ name: 'Important' });
      expect(response.status).toBe(201);
      expect(mocks.labelCreate).toHaveBeenCalledWith({
        data: { orgId: ORG, name: 'Important', color: '#6366f1' },
      });
    });

    it('rejects invalid names, colors, and extra fields', async () => {
      for (const input of [
        { name: '   ' },
        { name: 'X'.repeat(81) },
        { name: 'Urgent', color: 'red' },
        { name: 'Urgent', color: '#12345' },
        { name: 'Urgent', orgId: 'org-b' },
      ]) {
        const response = await supertest(app)
          .post(projectPath)
          .set('Authorization', 'Bearer session-a')
          .send(input);
        expect(response.status).toBe(400);
      }
      expect(mocks.labelCreate).not.toHaveBeenCalled();
    });

    it('returns 409 for a duplicate organization label', async () => {
      mocks.labelCreate.mockRejectedValue({ code: 'P2002' });
      const response = await supertest(app)
        .post(projectPath)
        .set('Authorization', 'Bearer session-a')
        .send({ name: 'Urgent' });
      expect(response.status).toBe(409);
    });

    it('requires authentication for reading and creating labels', async () => {
      const read = await supertest(app).get(projectPath);
      const create = await supertest(app).post(projectPath).send({ name: 'Urgent' });
      expect(read.status).toBe(401);
      expect(create.status).toBe(401);
      expect(mocks.labelFindMany).not.toHaveBeenCalled();
      expect(mocks.labelCreate).not.toHaveBeenCalled();
    });

    it('denies cross-tenant project label access', async () => {
      mocks.orgMemberFindUnique.mockResolvedValue(null);
      const response = await supertest(app)
        .get(projectPath)
        .set('Authorization', 'Bearer session-a');
      expect(response.status).toBe(403);
      expect(mocks.labelFindMany).not.toHaveBeenCalled();
    });

    it('denies an organization member without project membership', async () => {
      mocks.projectMemberFindUnique.mockResolvedValue(null);
      const response = await supertest(app)
        .post(projectPath)
        .set('Authorization', 'Bearer session-a')
        .send({ name: 'Urgent' });
      expect(response.status).toBe(403);
      expect(mocks.labelCreate).not.toHaveBeenCalled();
    });

    it('returns 404 when the project does not exist', async () => {
      mocks.projectFindUnique.mockResolvedValue(null);
      const response = await supertest(app)
        .get(projectPath)
        .set('Authorization', 'Bearer session-a');
      expect(response.status).toBe(404);
    });
  });

  describe('Task labels', () => {
    it('lists only labels assigned to the requested task and organization', async () => {
      const response = await supertest(app)
        .get(taskPath)
        .set('Authorization', 'Bearer session-a');
      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe('Urgent');
      expect(mocks.taskLabelFindMany).toHaveBeenCalledWith({
        where: { taskId: TASK, label: { orgId: ORG } },
        include: { label: true },
        orderBy: { label: { name: 'asc' } },
      });
    });

    it('assigns a same-organization label transactionally', async () => {
      const response = await supertest(app)
        .post(taskPath)
        .set('Authorization', 'Bearer session-a')
        .send({ labelId: LABEL });
      expect(response.status).toBe(201);
      expect(response.body.label.id).toBe(LABEL);
      expect(mocks.labelFindFirst).toHaveBeenCalledWith({ where: { id: LABEL, orgId: ORG } });
      expect(mocks.taskFindFirst).toHaveBeenCalledWith({
        where: { id: TASK, archivedAt: null },
        select: { id: true },
      });
      expect(mocks.taskLabelCreate).toHaveBeenCalledWith({ data: { taskId: TASK, labelId: LABEL } });
    });

    it('rejects duplicate task-label assignments', async () => {
      mocks.taskLabelCreate.mockRejectedValue({ code: 'P2002' });
      const response = await supertest(app)
        .post(taskPath)
        .set('Authorization', 'Bearer session-a')
        .send({ labelId: LABEL });
      expect(response.status).toBe(409);
    });

    it('rejects labels outside the task organization', async () => {
      mocks.labelFindFirst.mockResolvedValue(null);
      const response = await supertest(app)
        .post(taskPath)
        .set('Authorization', 'Bearer session-a')
        .send({ labelId: 'foreign-label' });
      expect(response.status).toBe(400);
      expect(mocks.transaction).not.toHaveBeenCalled();
    });

    it('rejects assignment if the task is archived during the transaction', async () => {
      mocks.taskFindFirst.mockResolvedValue(null);
      const response = await supertest(app)
        .post(taskPath)
        .set('Authorization', 'Bearer session-a')
        .send({ labelId: LABEL });
      expect(response.status).toBe(404);
      expect(mocks.taskLabelCreate).not.toHaveBeenCalled();
    });

    it('rejects missing labelId and unexpected fields', async () => {
      for (const input of [{}, { labelId: '' }, { labelId: LABEL, orgId: 'org-b' }]) {
        const response = await supertest(app)
          .post(taskPath)
          .set('Authorization', 'Bearer session-a')
          .send(input);
        expect(response.status).toBe(400);
      }
      expect(mocks.taskLabelCreate).not.toHaveBeenCalled();
    });

    it('removes a task label', async () => {
      const response = await supertest(app)
        .delete(`${taskPath}/${LABEL}`)
        .set('Authorization', 'Bearer session-a');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ removed: true, labelId: LABEL });
      expect(mocks.taskLabelDeleteMany).toHaveBeenCalledWith({ where: { taskId: TASK, labelId: LABEL } });
    });

    it('returns 404 when removing a label that is not assigned', async () => {
      mocks.taskLabelDeleteMany.mockResolvedValue({ count: 0 });
      const response = await supertest(app)
        .delete(`${taskPath}/${LABEL}`)
        .set('Authorization', 'Bearer session-a');
      expect(response.status).toBe(404);
    });

    it('returns 404 when removing an unknown or foreign organization label', async () => {
      mocks.labelFindFirst.mockResolvedValue(null);
      const response = await supertest(app)
        .delete(`${taskPath}/foreign-label`)
        .set('Authorization', 'Bearer session-a');
      expect(response.status).toBe(404);
      expect(mocks.taskLabelDeleteMany).not.toHaveBeenCalled();
    });

    it('rejects archived tasks for listing, assignment, and removal', async () => {
      mocks.taskFindUnique.mockResolvedValue({ id: TASK, projectId: PROJECT, archivedAt: now });
      const read = await supertest(app).get(taskPath).set('Authorization', 'Bearer session-a');
      const assign = await supertest(app).post(taskPath).set('Authorization', 'Bearer session-a').send({ labelId: LABEL });
      const remove = await supertest(app).delete(`${taskPath}/${LABEL}`).set('Authorization', 'Bearer session-a');
      expect([read.status, assign.status, remove.status]).toEqual([404, 404, 404]);
      expect(mocks.taskLabelFindMany).not.toHaveBeenCalled();
      expect(mocks.taskLabelCreate).not.toHaveBeenCalled();
      expect(mocks.taskLabelDeleteMany).not.toHaveBeenCalled();
    });

    it('returns 404 for a missing task', async () => {
      mocks.taskFindUnique.mockResolvedValue(null);
      const response = await supertest(app)
        .get(taskPath)
        .set('Authorization', 'Bearer session-a');
      expect(response.status).toBe(404);
    });

    it('denies cross-tenant task-label access', async () => {
      mocks.orgMemberFindUnique.mockResolvedValue(null);
      const response = await supertest(app)
        .post(taskPath)
        .set('Authorization', 'Bearer session-a')
        .send({ labelId: LABEL });
      expect(response.status).toBe(403);
      expect(mocks.transaction).not.toHaveBeenCalled();
    });

    it('requires authentication for task-label operations', async () => {
      const read = await supertest(app).get(taskPath);
      const assign = await supertest(app).post(taskPath).send({ labelId: LABEL });
      const remove = await supertest(app).delete(`${taskPath}/${LABEL}`);
      expect([read.status, assign.status, remove.status]).toEqual([401, 401, 401]);
      expect(mocks.taskFindUnique).not.toHaveBeenCalled();
    });
  });
});
