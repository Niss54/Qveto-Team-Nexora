import { beforeEach, describe, expect, it, vi } from 'vitest';
import supertest from 'supertest';

const mocks = vi.hoisted(() => ({
  validateSession: vi.fn(),
  orgMemberFindUnique: vi.fn(),
  projectFindUnique: vi.fn(),
  projectMemberFindUnique: vi.fn(),
  projectMemberFindMany: vi.fn(),
  taskCount: vi.fn(),
  taskGroupBy: vi.fn(),
  taskFindMany: vi.fn(),
  projectFindMany: vi.fn(),
  userFindMany: vi.fn(),
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
    project: {
      findUnique: mocks.projectFindUnique,
      findMany: mocks.projectFindMany,
    },
    projectMember: {
      findUnique: mocks.projectMemberFindUnique,
      findMany: mocks.projectMemberFindMany,
    },
    task: {
      count: mocks.taskCount,
      groupBy: mocks.taskGroupBy,
      findMany: mocks.taskFindMany,
    },
    user: {
      findMany: mocks.userFindMany,
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
        return { userId, orgId, role: 'MANAGER' };
      }
      if (userId === USER_B && orgId === ORG_B) {
        return { userId, orgId, role: 'MANAGER' };
      }
      return null;
    },
  );

  mocks.projectFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
    if (where.id === PROJECT_A1) {
      return { id: PROJECT_A1, name: 'Alpha Project 1', workspace: { orgId: ORG_A } };
    }
    if (where.id === PROJECT_A2) {
      return { id: PROJECT_A2, name: 'Alpha Project 2', workspace: { orgId: ORG_A } };
    }
    if (where.id === PROJECT_B1) {
      return { id: PROJECT_B1, name: 'Beta Project 1', workspace: { orgId: ORG_B } };
    }
    return null;
  });

  mocks.projectMemberFindUnique.mockImplementation(
    async ({ where }: { where: { userId_projectId: { userId: string; projectId: string } } }) => {
      const { userId, projectId } = where.userId_projectId;
      if (userId === USER_A && (projectId === PROJECT_A1 || projectId === PROJECT_A2)) {
        return { userId, projectId, role: 'MEMBER' };
      }
      if (userId === USER_B && projectId === PROJECT_B1) {
        return { userId, projectId, role: 'MEMBER' };
      }
      return null;
    },
  );

  mocks.projectMemberFindMany.mockImplementation(
    async ({ where }: { where: { userId: string; project?: { workspace?: { orgId?: string } } } }) => {
      if (where.userId === USER_A && where.project?.workspace?.orgId === ORG_A) {
        return [{ projectId: PROJECT_A1 }, { projectId: PROJECT_A2 }];
      }
      if (where.userId === USER_B && where.project?.workspace?.orgId === ORG_B) {
        return [{ projectId: PROJECT_B1 }];
      }
      return [];
    },
  );

  mocks.projectFindMany.mockResolvedValue([
    { id: PROJECT_A1, name: 'Alpha Project 1' },
    { id: PROJECT_A2, name: 'Alpha Project 2' },
  ]);

  mocks.userFindMany.mockResolvedValue([
    { id: USER_A, name: 'Alice', email: 'alice@example.com', avatarUrl: null },
    { id: USER_B, name: 'Bob', email: 'bob@example.com', avatarUrl: null },
  ]);
});

describe('PRD 05: Backend Analytics API (/api/analytics/productivity)', () => {
  describe('Authentication & Validation', () => {
    it('rejects unauthenticated requests with 401 UNAUTHORIZED', async () => {
      const response = await supertest(app).get(`/api/analytics/productivity?orgId=${ORG_A}`);

      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(mocks.orgMemberFindUnique).not.toHaveBeenCalled();
    });

    it('rejects requests missing required orgId parameter with 400 VALIDATION_ERROR', async () => {
      const response = await supertest(app)
        .get('/api/analytics/productivity')
        .set('Authorization', 'Bearer session-a');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects extra unrecognized query parameters with strict validation', async () => {
      const response = await supertest(app)
        .get(`/api/analytics/productivity?orgId=${ORG_A}&unexpectedParam=123`)
        .set('Authorization', 'Bearer session-a');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Tenant Security & Access Control', () => {
    it('denies access with 403 FORBIDDEN when user is not a member of the requested organization', async () => {
      const response = await supertest(app)
        .get(`/api/analytics/productivity?orgId=${ORG_B}`)
        .set('Authorization', 'Bearer session-a');

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
      expect(response.body.error.message).toContain('not a member of this organization');
      expect(mocks.taskCount).not.toHaveBeenCalled();
    });

    it('denies access with 403 FORBIDDEN when requested projectId belongs to another organization', async () => {
      const response = await supertest(app)
        .get(`/api/analytics/productivity?orgId=${ORG_A}&projectId=${PROJECT_B1}`)
        .set('Authorization', 'Bearer session-a');

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
      expect(response.body.error.message).toContain('do not have access to this project');
      expect(mocks.taskCount).not.toHaveBeenCalled();
    });

    it('denies access with 403 FORBIDDEN when user is not a member of the requested project', async () => {
      mocks.projectMemberFindUnique.mockResolvedValueOnce(null);

      const response = await supertest(app)
        .get(`/api/analytics/productivity?orgId=${ORG_A}&projectId=${PROJECT_A1}`)
        .set('Authorization', 'Bearer session-a');

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
      expect(response.body.error.message).toContain('do not have access to this project');
      expect(mocks.taskCount).not.toHaveBeenCalled();
    });
  });

  describe('Productivity Metrics Calculations', () => {
    it('calculates completion rates, status distributions, and workloads with realistic data', async () => {
      // 1. Total tasks = 20
      // 2. Assigned tasks = 18 (2 unassigned)
      // 3. Overdue tasks = 3
      mocks.taskCount
        .mockResolvedValueOnce(20) // totalTasks
        .mockResolvedValueOnce(18) // assignedTasks
        .mockResolvedValueOnce(3);  // overdueTasks

      // Status groups: TODO: 6, IN_PROGRESS: 4, IN_REVIEW: 2, DONE: 8
      // completionRate = (8 / 20) * 100 = 40.0%
      // assignmentCoverage = (18 / 20) * 100 = 90.0%
      mocks.taskGroupBy
        .mockResolvedValueOnce([
          { status: 'TODO', _count: { id: 6 } },
          { status: 'IN_PROGRESS', _count: { id: 4 } },
          { status: 'IN_REVIEW', _count: { id: 2 } },
          { status: 'DONE', _count: { id: 8 } },
        ])
        // Priority groups: LOW: 4, MEDIUM: 8, HIGH: 6, URGENT: 2
        .mockResolvedValueOnce([
          { priority: 'LOW', _count: { id: 4 } },
          { priority: 'MEDIUM', _count: { id: 8 } },
          { priority: 'HIGH', _count: { id: 6 } },
          { priority: 'URGENT', _count: { id: 2 } },
        ])
        // Project task counts: A1: 12, A2: 8
        .mockResolvedValueOnce([
          { projectId: PROJECT_A1, _count: { id: 12 } },
          { projectId: PROJECT_A2, _count: { id: 8 } },
        ])
        // Project completed counts: A1: 5, A2: 3
        .mockResolvedValueOnce([
          { projectId: PROJECT_A1, _count: { id: 5 } },
          { projectId: PROJECT_A2, _count: { id: 3 } },
        ])
        // Project overdue counts: A1: 2, A2: 1
        .mockResolvedValueOnce([
          { projectId: PROJECT_A1, _count: { id: 2 } },
          { projectId: PROJECT_A2, _count: { id: 1 } },
        ])
        // Assignee total counts: User A: 10, User B: 8, null (unassigned): 2
        .mockResolvedValueOnce([
          { assigneeId: USER_A, _count: { id: 10 } },
          { assigneeId: USER_B, _count: { id: 8 } },
          { assigneeId: null, _count: { id: 2 } },
        ])
        // Assignee open counts: User A: 6, User B: 4, null: 2
        .mockResolvedValueOnce([
          { assigneeId: USER_A, _count: { id: 6 } },
          { assigneeId: USER_B, _count: { id: 4 } },
          { assigneeId: null, _count: { id: 2 } },
        ])
        // Assignee completed counts: User A: 4, User B: 4, null: 0
        .mockResolvedValueOnce([
          { assigneeId: USER_A, _count: { id: 4 } },
          { assigneeId: USER_B, _count: { id: 4 } },
        ])
        // Assignee overdue counts: User A: 2, User B: 1, null: 0
        .mockResolvedValueOnce([
          { assigneeId: USER_A, _count: { id: 2 } },
          { assigneeId: USER_B, _count: { id: 1 } },
        ])
        // Assignee due today counts: User A: 1, User B: 2, null: 0
        .mockResolvedValueOnce([
          { assigneeId: USER_A, _count: { id: 1 } },
          { assigneeId: USER_B, _count: { id: 2 } },
        ]);

      // Completed with due date: 4 tasks (3 on time, 1 late)
      // onTimeCompletionRate = (3 / 4) * 100 = 75.0%
      const baseDate = new Date('2026-10-15T10:00:00.000Z');
      mocks.taskFindMany.mockResolvedValueOnce([
        { completedAt: new Date('2026-10-14T00:00:00.000Z'), dueDate: baseDate }, // on time
        { completedAt: new Date('2026-10-15T09:00:00.000Z'), dueDate: baseDate }, // on time
        { completedAt: new Date('2026-10-15T10:00:00.000Z'), dueDate: baseDate }, // on time
        { completedAt: new Date('2026-10-16T12:00:00.000Z'), dueDate: baseDate }, // late
      ]);

      const response = await supertest(app)
        .get(`/api/analytics/productivity?orgId=${ORG_A}`)
        .set('Authorization', 'Bearer session-a');

      expect(response.status).toBe(200);
      const data = response.body.analytics;

      // Verify overview metrics
      expect(data.overview.totalTasks).toBe(20);
      expect(data.overview.completedTasks).toBe(8);
      expect(data.overview.openTasks).toBe(12);
      expect(data.overview.overdueTasks).toBe(3);
      expect(data.overview.completionRate).toBe(40);
      expect(data.overview.onTimeCompletionRate).toBe(75);
      expect(data.overview.assignmentCoverage).toBe(90);
      expect(data.overview.assignedTasks).toBe(18);
      expect(data.overview.unassignedTasks).toBe(2);

      // Verify status distribution
      expect(data.statusDistribution).toEqual({
        TODO: 6,
        IN_PROGRESS: 4,
        IN_REVIEW: 2,
        DONE: 8,
      });

      // Verify priority distribution
      expect(data.priorityDistribution).toEqual({
        LOW: 4,
        MEDIUM: 8,
        HIGH: 6,
        URGENT: 2,
      });

      // Verify project progress
      expect(data.projectProgress).toHaveLength(2);
      expect(data.projectProgress[0]).toEqual({
        id: PROJECT_A1,
        name: 'Alpha Project 1',
        totalTasks: 12,
        completedTasks: 5,
        overdueTasks: 2,
        progressPercentage: 41.67,
      });
      expect(data.projectProgress[1]).toEqual({
        id: PROJECT_A2,
        name: 'Alpha Project 2',
        totalTasks: 8,
        completedTasks: 3,
        overdueTasks: 1,
        progressPercentage: 37.5,
      });

      // Verify workload by assignee
      expect(data.workloadByAssignee).toHaveLength(3);
      const alice = data.workloadByAssignee.find((u: { userId: string | null }) => u.userId === USER_A);
      expect(alice).toEqual({
        userId: USER_A,
        name: 'Alice',
        email: 'alice@example.com',
        avatarUrl: null,
        totalTasks: 10,
        openTasks: 6,
        completedTasks: 4,
        overdueTasks: 2,
        dueTodayTasks: 1,
      });

      const unassigned = data.workloadByAssignee.find((u: { userId: string | null }) => u.userId === null);
      expect(unassigned).toEqual({
        userId: null,
        name: 'Unassigned',
        email: null,
        avatarUrl: null,
        totalTasks: 2,
        openTasks: 2,
        completedTasks: 0,
        overdueTasks: 0,
        dueTodayTasks: 0,
      });
    });

    it('handles project filter correctly and scopes metrics to that project', async () => {
      mocks.taskCount.mockResolvedValue(0);
      mocks.taskGroupBy.mockResolvedValue([]);
      mocks.taskFindMany.mockResolvedValue([]);
      mocks.projectFindMany.mockResolvedValue([{ id: PROJECT_A1, name: 'Alpha Project 1' }]);

      const response = await supertest(app)
        .get(`/api/analytics/productivity?orgId=${ORG_A}&projectId=${PROJECT_A1}`)
        .set('Authorization', 'Bearer session-a');

      expect(response.status).toBe(200);
      expect(response.body.analytics.projectId).toBe(PROJECT_A1);
    });
  });

  describe('Zero Denominators, Empty States & Archived Task Handling', () => {
    it('avoids division-by-zero errors when totalTasks is zero', async () => {
      mocks.taskCount.mockResolvedValue(0);
      mocks.taskGroupBy.mockResolvedValue([]);
      mocks.taskFindMany.mockResolvedValue([]);
      mocks.projectFindMany.mockResolvedValue([]);

      const response = await supertest(app)
        .get(`/api/analytics/productivity?orgId=${ORG_A}`)
        .set('Authorization', 'Bearer session-a');

      expect(response.status).toBe(200);
      const data = response.body.analytics;
      expect(data.overview.totalTasks).toBe(0);
      expect(data.overview.completionRate).toBe(0);
      expect(data.overview.onTimeCompletionRate).toBe(0);
      expect(data.overview.assignmentCoverage).toBe(0);
    });

    it('returns zero onTimeCompletionRate when no completed tasks have a dueDate', async () => {
      mocks.taskCount.mockResolvedValue(5);
      mocks.taskGroupBy.mockResolvedValue([{ status: 'DONE', _count: { id: 5 } }]);
      mocks.taskFindMany.mockResolvedValue([]); // No tasks with dueDate
      mocks.projectFindMany.mockResolvedValue([]);

      const response = await supertest(app)
        .get(`/api/analytics/productivity?orgId=${ORG_A}`)
        .set('Authorization', 'Bearer session-a');

      expect(response.status).toBe(200);
      expect(response.body.analytics.overview.onTimeCompletionRate).toBe(0);
    });

    it('returns zeroed payload when caller has no project memberships in the organization', async () => {
      mocks.projectMemberFindMany.mockResolvedValueOnce([]);

      const response = await supertest(app)
        .get(`/api/analytics/productivity?orgId=${ORG_A}`)
        .set('Authorization', 'Bearer session-a');

      expect(response.status).toBe(200);
      const data = response.body.analytics;
      expect(data.overview.totalTasks).toBe(0);
      expect(data.projectProgress).toEqual([]);
      expect(data.workloadByAssignee).toEqual([]);
      expect(mocks.taskCount).not.toHaveBeenCalled();
    });

    it('strictly excludes archived tasks in baseWhere filter', async () => {
      mocks.taskCount.mockResolvedValue(0);
      mocks.taskGroupBy.mockResolvedValue([]);
      mocks.taskFindMany.mockResolvedValue([]);
      mocks.projectFindMany.mockResolvedValue([]);

      await supertest(app)
        .get(`/api/analytics/productivity?orgId=${ORG_A}`)
        .set('Authorization', 'Bearer session-a');

      expect(mocks.taskCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            archivedAt: null,
          }),
        }),
      );
    });
  });
});
