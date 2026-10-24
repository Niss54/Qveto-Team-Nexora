import { beforeEach, describe, expect, it, vi } from 'vitest';
import supertest from 'supertest';
import path from 'node:path';
import fs from 'node:fs/promises';

const mocks = vi.hoisted(() => ({
  validateSession: vi.fn(),
  orgMemberFindUnique: vi.fn(),
  projectMemberFindUnique: vi.fn(),
  taskFindUnique: vi.fn(),
  taskFindMany: vi.fn(),
  commentFindMany: vi.fn(),
  commentFindUnique: vi.fn(),
  commentCreate: vi.fn(),
  commentUpdate: vi.fn(),
  commentDelete: vi.fn(),
  attachmentFindMany: vi.fn(),
  attachmentFindUnique: vi.fn(),
  attachmentCreate: vi.fn(),
  attachmentDelete: vi.fn(),
  activityEventFindMany: vi.fn(),
  activityEventCreate: vi.fn(),
  notificationCount: vi.fn(),
  notificationFindMany: vi.fn(),
  notificationFindFirst: vi.fn(),
  notificationFindUnique: vi.fn(),
  notificationCreate: vi.fn(),
  notificationUpdate: vi.fn(),
  notificationUpdateMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../src/services/auth.service.js', () => ({
  authService: { validateSession: mocks.validateSession },
}));

vi.mock('../src/lib/prisma.js', () => ({
  prisma: {
    organizationMember: { findUnique: mocks.orgMemberFindUnique },
    projectMember: { findUnique: mocks.projectMemberFindUnique },
    task: {
      findUnique: mocks.taskFindUnique,
      findMany: mocks.taskFindMany,
    },
    comment: {
      findMany: mocks.commentFindMany,
      findUnique: mocks.commentFindUnique,
      create: mocks.commentCreate,
      update: mocks.commentUpdate,
      delete: mocks.commentDelete,
    },
    attachment: {
      findMany: mocks.attachmentFindMany,
      findUnique: mocks.attachmentFindUnique,
      create: mocks.attachmentCreate,
      delete: mocks.attachmentDelete,
    },
    activityEvent: {
      findMany: mocks.activityEventFindMany,
      create: mocks.activityEventCreate,
    },
    notification: {
      count: mocks.notificationCount,
      findMany: mocks.notificationFindMany,
      findFirst: mocks.notificationFindFirst,
      findUnique: mocks.notificationFindUnique,
      create: mocks.notificationCreate,
      update: mocks.notificationUpdate,
      updateMany: mocks.notificationUpdateMany,
    },
    $transaction: mocks.transaction,
  },
}));

const { createApp } = await import('../src/app.js');
const app = createApp('http://localhost:3000');

const USER_ID = 'usr_alice';
const OTHER_USER_ID = 'usr_bob';
const ORG_ID = 'org_nexora';
const PROJECT_ID = 'prj_alpha';
const TASK_ID = 'tsk_100';
const now = new Date('2026-10-23T12:00:00.000Z');

const mockTask = {
  id: TASK_ID,
  title: 'Setup Collaboration Modules',
  projectId: PROJECT_ID,
  assigneeId: OTHER_USER_ID,
  creatorId: USER_ID,
  status: 'IN_PROGRESS',
  archivedAt: null,
  project: {
    status: 'ACTIVE',
    workspace: {
      orgId: ORG_ID,
    },
  },
};

beforeEach(() => {
  vi.resetAllMocks();

  mocks.validateSession.mockImplementation(async (token: string) =>
    token === 'valid_session'
      ? { id: USER_ID, email: 'alice@example.com', name: 'Alice' }
      : null,
  );

  mocks.taskFindUnique.mockResolvedValue(mockTask);
  mocks.orgMemberFindUnique.mockResolvedValue({
    id: 'mem_1',
    userId: USER_ID,
    orgId: ORG_ID,
    role: 'EMPLOYEE',
  });
  mocks.projectMemberFindUnique.mockResolvedValue({
    id: 'pmem_1',
    userId: USER_ID,
    projectId: PROJECT_ID,
  });

  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      comment: {
        create: mocks.commentCreate,
        delete: mocks.commentDelete,
      },
      attachment: {
        create: mocks.attachmentCreate,
        delete: mocks.attachmentDelete,
      },
      activityEvent: {
        create: mocks.activityEventCreate,
      },
      notification: {
        create: mocks.notificationCreate,
      },
    }),
  );
});

describe('PRD 04 — Collaboration, Attachments, Activity & Notifications', () => {
  describe('Comments API', () => {
    it('rejects unauthenticated requests to list or create comments', async () => {
      const res = await supertest(app)
        .get(`/api/tasks/${TASK_ID}/comments`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('rejects empty comment creation', async () => {
      const res = await supertest(app)
        .post(`/api/tasks/${TASK_ID}/comments`)
        .set('Authorization', 'Bearer valid_session')
        .send({ content: '   ' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('creates a comment, emits activity, and dispatches notification', async () => {
      mocks.commentCreate.mockResolvedValue({
        id: 'cmt_1',
        content: 'I have started on the attachments feature',
        taskId: TASK_ID,
        authorId: USER_ID,
        createdAt: now,
        updatedAt: now,
        author: {
          id: USER_ID,
          name: 'Alice',
          email: 'alice@example.com',
          avatarUrl: null,
          createdAt: now,
        },
      });

      const res = await supertest(app)
        .post(`/api/tasks/${TASK_ID}/comments`)
        .set('Authorization', 'Bearer valid_session')
        .send({ content: 'I have started on the attachments feature' });

      expect(res.status).toBe(201);
      expect(res.body.comment.content).toBe('I have started on the attachments feature');
      expect(mocks.activityEventCreate).toHaveBeenCalledTimes(1);
      expect(mocks.notificationCreate).toHaveBeenCalledTimes(1);
    });

    it('lists comments for a task in chronological order', async () => {
      mocks.commentFindMany.mockResolvedValue([
        {
          id: 'cmt_1',
          content: 'First comment',
          taskId: TASK_ID,
          authorId: USER_ID,
          createdAt: now,
          updatedAt: now,
          author: { id: USER_ID, name: 'Alice', email: 'alice@example.com', avatarUrl: null, createdAt: now },
        },
      ]);

      const res = await supertest(app)
        .get(`/api/tasks/${TASK_ID}/comments`)
        .set('Authorization', 'Bearer valid_session');

      expect(res.status).toBe(200);
      expect(res.body.comments).toHaveLength(1);
      expect(res.body.comments[0].content).toBe('First comment');
    });

    it('allows author to edit their own comment', async () => {
      mocks.commentFindUnique.mockResolvedValue({
        id: 'cmt_1',
        taskId: TASK_ID,
        authorId: USER_ID,
        content: 'Original comment',
      });
      mocks.commentUpdate.mockResolvedValue({
        id: 'cmt_1',
        taskId: TASK_ID,
        authorId: USER_ID,
        content: 'Updated comment',
        createdAt: now,
        updatedAt: now,
        author: { id: USER_ID, name: 'Alice', email: 'alice@example.com', avatarUrl: null, createdAt: now },
      });

      const res = await supertest(app)
        .patch(`/api/tasks/${TASK_ID}/comments/cmt_1`)
        .set('Authorization', 'Bearer valid_session')
        .send({ content: 'Updated comment' });

      expect(res.status).toBe(200);
      expect(res.body.comment.content).toBe('Updated comment');
    });

    it('denies non-author from editing another user comment', async () => {
      mocks.commentFindUnique.mockResolvedValue({
        id: 'cmt_2',
        taskId: TASK_ID,
        authorId: OTHER_USER_ID,
        content: 'Bob comment',
      });

      const res = await supertest(app)
        .patch(`/api/tasks/${TASK_ID}/comments/cmt_2`)
        .set('Authorization', 'Bearer valid_session')
        .send({ content: 'Alice trying to edit Bob comment' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('Secure File Attachments API', () => {
    it('rejects upload of unsupported MIME types', async () => {
      const res = await supertest(app)
        .post(`/api/tasks/${TASK_ID}/attachments`)
        .set('Authorization', 'Bearer valid_session')
        .attach('file', Buffer.from('malicious executable'), {
          filename: 'payload.exe',
          contentType: 'application/x-msdownload',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('uploads valid PDF attachment and emits activity log', async () => {
      mocks.attachmentCreate.mockResolvedValue({
        id: 'att_1',
        fileName: 'spec.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        storagePath: 'safe_key_1.pdf',
        taskId: TASK_ID,
        uploadedById: USER_ID,
        createdAt: now,
        uploadedBy: { id: USER_ID, name: 'Alice', email: 'alice@example.com', avatarUrl: null, createdAt: now },
      });

      const res = await supertest(app)
        .post(`/api/tasks/${TASK_ID}/attachments`)
        .set('Authorization', 'Bearer valid_session')
        .attach('file', Buffer.from('%PDF-1.4 sample content'), {
          filename: 'spec.pdf',
          contentType: 'application/pdf',
        });

      expect(res.status).toBe(201);
      expect(res.body.attachment.fileName).toBe('spec.pdf');
      expect(mocks.activityEventCreate).toHaveBeenCalledTimes(1);
    });

    it('lists attachments on a task', async () => {
      mocks.attachmentFindMany.mockResolvedValue([
        {
          id: 'att_1',
          fileName: 'spec.pdf',
          fileSize: 1024,
          mimeType: 'application/pdf',
          storagePath: 'safe_key_1.pdf',
          taskId: TASK_ID,
          uploadedById: USER_ID,
          createdAt: now,
          uploadedBy: { id: USER_ID, name: 'Alice', email: 'alice@example.com', avatarUrl: null, createdAt: now },
        },
      ]);

      const res = await supertest(app)
        .get(`/api/tasks/${TASK_ID}/attachments`)
        .set('Authorization', 'Bearer valid_session');

      expect(res.status).toBe(200);
      expect(res.body.attachments).toHaveLength(1);
      expect(res.body.attachments[0].fileName).toBe('spec.pdf');
    });

    it('denies attachment download for unauthorized non-member', async () => {
      mocks.projectMemberFindUnique.mockResolvedValue(null);

      const res = await supertest(app)
        .get(`/api/tasks/${TASK_ID}/attachments/att_1/download`)
        .set('Authorization', 'Bearer valid_session');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('Activity History API', () => {
    it('returns chronological activity events for task', async () => {
      mocks.activityEventFindMany.mockResolvedValue([
        {
          id: 'act_1',
          type: 'COMMENT_ADDED',
          entityType: 'TASK',
          entityId: TASK_ID,
          actorId: USER_ID,
          orgId: ORG_ID,
          metadata: { commentId: 'cmt_1' },
          createdAt: now,
          actor: { id: USER_ID, name: 'Alice', email: 'alice@example.com', avatarUrl: null, createdAt: now },
        },
      ]);

      const res = await supertest(app)
        .get(`/api/tasks/${TASK_ID}/activity`)
        .set('Authorization', 'Bearer valid_session');

      expect(res.status).toBe(200);
      expect(res.body.activity).toHaveLength(1);
      expect(res.body.activity[0].type).toBe('COMMENT_ADDED');
    });
  });

  describe('In-App Notifications API', () => {
    it('lists current user notifications', async () => {
      mocks.notificationCount.mockResolvedValue(1);
      mocks.notificationFindMany.mockResolvedValue([
        {
          id: 'notif_1',
          type: 'TASK_ASSIGNED',
          title: 'New Task',
          message: 'You have been assigned to Setup Collaboration Modules',
          isRead: false,
          userId: USER_ID,
          orgId: ORG_ID,
          relatedEntityType: 'TASK',
          relatedEntityId: TASK_ID,
          createdAt: now,
        },
      ]);

      const res = await supertest(app)
        .get('/api/notifications')
        .set('Authorization', 'Bearer valid_session');

      expect(res.status).toBe(200);
      expect(res.body.notifications).toHaveLength(1);
      expect(res.body.pagination.total).toBe(1);
    });

    it('returns unread count', async () => {
      mocks.notificationCount.mockResolvedValue(3);

      const res = await supertest(app)
        .get('/api/notifications/unread-count')
        .set('Authorization', 'Bearer valid_session');

      expect(res.status).toBe(200);
      expect(res.body.unreadCount).toBe(3);
    });

    it('marks a notification as read', async () => {
      mocks.notificationFindUnique.mockResolvedValue({
        id: 'notif_1',
        userId: USER_ID,
        isRead: false,
      });
      mocks.notificationUpdate.mockResolvedValue({
        id: 'notif_1',
        isRead: true,
      });

      const res = await supertest(app)
        .patch('/api/notifications/notif_1/read')
        .set('Authorization', 'Bearer valid_session');

      expect(res.status).toBe(200);
      expect(res.body.isRead).toBe(true);
    });

    it('denies marking another user notification as read', async () => {
      mocks.notificationFindUnique.mockResolvedValue({
        id: 'notif_2',
        userId: OTHER_USER_ID,
        isRead: false,
      });

      const res = await supertest(app)
        .patch('/api/notifications/notif_2/read')
        .set('Authorization', 'Bearer valid_session');

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('marks all notifications as read', async () => {
      mocks.notificationUpdateMany.mockResolvedValue({ count: 5 });

      const res = await supertest(app)
        .patch('/api/notifications/read-all')
        .set('Authorization', 'Bearer valid_session');

      expect(res.status).toBe(200);
      expect(res.body.updatedCount).toBe(5);
    });

    it('checks and creates deduplicated overdue task alerts', async () => {
      mocks.taskFindMany.mockResolvedValue([
        {
          id: 'tsk_overdue_1',
          title: 'Overdue Project Report',
          dueDate: new Date('2026-10-01T00:00:00.000Z'),
          assigneeId: USER_ID,
          project: { workspace: { orgId: ORG_ID } },
        },
      ]);
      mocks.notificationFindFirst.mockResolvedValue(null); // Not notified yet
      mocks.notificationCreate.mockResolvedValue({ id: 'notif_overdue_1' });

      const res = await supertest(app)
        .post('/api/notifications/check-overdue')
        .set('Authorization', 'Bearer valid_session');

      expect(res.status).toBe(200);
      expect(res.body.newAlertsCreated).toBe(1);
    });
  });
});
