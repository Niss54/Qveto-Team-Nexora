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
          {
            id: actorId,
            email: `${actorId}@example.test`,
            name: 'Audit Actor',
            passwordHash: 'unused-test-hash',
          },
          {
            id: selectedOwnerId,
            email: `${selectedOwnerId}@example.test`,
            name: 'Selected Owner',
            passwordHash: 'unused-test-hash',
          },
        ],
      });
      await tx.organization.create({
        data: { id: organizationId, name: 'PRD02 Persistence Test', slug: orgSlug },
      });
      await tx.organizationMember.createMany({
        data: [
          { orgId: organizationId, userId: actorId, role: 'OWNER' },
          { orgId: organizationId, userId: selectedOwnerId, role: 'EMPLOYEE' },
        ],
      });
      await tx.workspace.create({
        data: {
          id: workspaceId,
          name: 'Persistence Workspace',
          slug: `workspace-${suffix}`,
          orgId: organizationId,
        },
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
    const afterRejectedUpdate = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
    });
    expect(afterRejectedUpdate.startDate?.toISOString()).toBe('2026-10-21T00:00:00.000Z');

    const realTransaction = prisma.$transaction.bind(prisma);
    const transactionSpy = vi.spyOn(prisma, '$transaction');
    const attemptedMembershipWrites = { demotion: 0, ownerPromotion: 0 };
    let injectedProjectUpdateFailure = false;
    transactionSpy.mockImplementation((async (operation: unknown, options?: unknown) => {
      if (typeof operation !== 'function') {
        return realTransaction(operation as never, options as never);
      }

      return realTransaction(async (tx) => {
        const txWithFailureInjection = new Proxy(tx, {
          get(target, property) {
            if (property === 'projectMember') {
              return new Proxy(target.projectMember, {
                get(delegate, method) {
                  const value = Reflect.get(delegate, method, delegate);
                  if (method === 'updateMany' || method === 'upsert') {
                    return async (...args: never[]) => {
                      const result = await value.apply(delegate, args);
                      if (method === 'updateMany') attemptedMembershipWrites.demotion += 1;
                      if (method === 'upsert') attemptedMembershipWrites.ownerPromotion += 1;
                      return result;
                    };
                  }
                  return typeof value === 'function' ? value.bind(delegate) : value;
                },
              });
            }
            if (property === 'project') {
              return new Proxy(target.project, {
                get(delegate, method) {
                  if (method === 'update') {
                    return async (args: { where: { id: string } }) => {
                      if (args.where.id === projectId) {
                        injectedProjectUpdateFailure = true;
                        throw new Error('injected project update failure after membership writes');
                      }
                      return delegate.update(args as never);
                    };
                  }
                  const value = Reflect.get(delegate, method, delegate);
                  return typeof value === 'function' ? value.bind(delegate) : value;
                },
              });
            }
            const value = Reflect.get(target, property, target);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        });
        return operation(txWithFailureInjection);
      }, options as never);
    }) as typeof prisma.$transaction);

    let failedTransfer;
    try {
      failedTransfer = await supertest(app)
        .patch(`/api/projects/${projectId}`)
        .set('Authorization', 'Bearer persistence-session')
        .send({
          ownerId: selectedOwnerId,
          startDate: '2026-10-22T00:00:00.000Z',
          dueDate: '2026-11-22T00:00:00.000Z',
        });
    } finally {
      transactionSpy.mockRestore();
    }

    expect(failedTransfer.status).toBe(500);
    expect(attemptedMembershipWrites).toEqual({ demotion: 1, ownerPromotion: 1 });
    expect(injectedProjectUpdateFailure).toBe(true);
    const afterFailedTransfer = await prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      include: { members: { orderBy: { userId: 'asc' } } },
    });
    expect(afterFailedTransfer.ownerId).toBe(actorId);
    expect(afterFailedTransfer.startDate?.toISOString()).toBe('2026-10-21T00:00:00.000Z');
    expect(afterFailedTransfer.dueDate?.toISOString()).toBe('2026-11-21T00:00:00.000Z');
    expect(afterFailedTransfer.members).toEqual([
      expect.objectContaining({ userId: actorId, role: 'OWNER' }),
      expect.objectContaining({ userId: selectedOwnerId, role: 'MEMBER' }),
    ]);
    expect(afterFailedTransfer.members.filter((member) => member.role === 'OWNER')).toHaveLength(1);
  });
});
