import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import supertest from 'supertest';
import { prisma } from '../src/lib/prisma.js';

const authMocks = vi.hoisted(() => ({ validateSession: vi.fn() }));

vi.mock('../src/services/auth.service.js', () => ({
  authService: { validateSession: authMocks.validateSession },
}));

const { createApp } = await import('../src/app.js');
const app = createApp('http://localhost:3000');
const persistenceEnabled = process.env.PRD02_PERSISTENCE_TESTS === '1';
const describePersistence = persistenceEnabled ? describe : describe.skip;
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const actorId = `prd02-actor-${suffix}`;
const selectedOwnerId = `prd02-owner-${suffix}`;
const organizationId = `prd02-org-${suffix}`;
const workspaceId = `prd02-workspace-${suffix}`;
const orgSlug = `prd02-${suffix}`;

describePersistence('Project API persistence (isolated database only)', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes('127.0.0.1:55433/qveto_test')) {
      throw new Error('Persistence tests require the verified isolated PostgreSQL audit target.');
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.createMany({
        data: [
          { id: actorId, email: `${actorId}@example.test`, name: 'Audit Actor', passwordHash: 'unused-test-hash' },
          { id: selectedOwnerId, email: `${selectedOwnerId}@example.test`, name: 'Selected Owner', passwordHash: 'unused-test-hash' },
        ],
      });
      await tx.organization.create({ data: { id: organizationId, name: 'PRD02 Persistence Test', slug: orgSlug } });
      await tx.organizationMember.createMany({
        data: [
          { orgId: organizationId, userId: actorId, role: 'OWNER' },
          { orgId: organizationId, userId: selectedOwnerId, role: 'EMPLOYEE' },
        ],
      });
      await tx.workspace.create({
        data: { id: workspaceId, name: 'Persistence Workspace', slug: `workspace-${suffix}`, orgId: organizationId },
      });
    });

    authMocks.validateSession.mockResolvedValue({
      id: actorId,
      email: `${actorId}@example.test`,
      name: 'Audit Actor',
    });
  });

  afterAll(async () => {
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.user.deleteMany({ where: { id: { in: [actorId, selectedOwnerId] } } });
    await prisma.$disconnect();
  });

  it('persists project dates and owner, then transfers OWNER membership transactionally', async () => {
    const create = await supertest(app)
      .post(`/api/workspaces/${workspaceId}/projects`)
      .set('Authorization', 'Bearer persistence-session')
      .send({
        name: 'Persisted project',
        ownerId: selectedOwnerId,
        startDate: '2026-10-20T00:00:00.000Z',
        dueDate: '2026-11-20T00:00:00.000Z',
      });

    expect(create.status).toBe(201);
    const projectId = create.body.project.id as string;
    const createdRecord = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      include: { members: true },
    });
    expect(createdRecord.ownerId).toBe(selectedOwnerId);
    expect(createdRecord.startDate?.toISOString()).toBe('2026-10-20T00:00:00.000Z');
    expect(createdRecord.dueDate?.toISOString()).toBe('2026-11-20T00:00:00.000Z');
    expect(createdRecord.members).toEqual([
      expect.objectContaining({ userId: selectedOwnerId, role: 'OWNER' }),
    ]);

    const transfer = await supertest(app)
      .patch(`/api/projects/${projectId}`)
      .set('Authorization', 'Bearer persistence-session')
      .send({
        ownerId: actorId,
        startDate: '2026-10-21T00:00:00.000Z',
        dueDate: '2026-11-21T00:00:00.000Z',
      });

    expect(transfer.status).toBe(200);
    const transferredRecord = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      include: { members: { orderBy: { userId: 'asc' } } },
    });
    expect(transferredRecord.ownerId).toBe(actorId);
    expect(transferredRecord.startDate?.toISOString()).toBe('2026-10-21T00:00:00.000Z');
    expect(transferredRecord.dueDate?.toISOString()).toBe('2026-11-21T00:00:00.000Z');
    expect(transferredRecord.members).toEqual([
      expect.objectContaining({ userId: actorId, role: 'OWNER' }),
      expect.objectContaining({ userId: selectedOwnerId, role: 'MEMBER' }),
    ]);

    const invalidDateUpdate = await supertest(app)
      .patch(`/api/projects/${projectId}`)
      .set('Authorization', 'Bearer persistence-session')
      .send({ startDate: '2026-11-22T00:00:00.000Z' });
    expect(invalidDateUpdate.status).toBe(400);
    const afterRejectedUpdate = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
    expect(afterRejectedUpdate.startDate?.toISOString()).toBe('2026-10-21T00:00:00.000Z');
  });
});
