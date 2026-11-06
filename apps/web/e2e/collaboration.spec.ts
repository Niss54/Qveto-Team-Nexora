import { test, expect, type Page } from '@playwright/test';

test.use({ channel: 'chrome' });

const projectId = 'e2e-project';
const orgId = 'e2e-org';
const taskId = 'task-1';

interface MockComment {
  id: string;
  content: string;
  taskId: string;
  authorId: string;
  createdAt: string;
  updatedAt: string;
  author: {
    id: string;
    name: string;
    email: string;
  };
}

interface MockAttachment {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  taskId: string;
  uploadedById: string;
  createdAt: string;
  uploadedBy: {
    id: string;
    name: string;
    email: string;
  };
}

interface MockActivity {
  id: string;
  type: string;
  entityType: string;
  entityId: string;
  actorId: string;
  orgId: string;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  actor: {
    id: string;
    name: string;
    email: string;
  };
}

interface MockNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

async function setupMockApi(page: Page, state: {
  comments: MockComment[];
  attachments: MockAttachment[];
  activities: MockActivity[];
  notifications: MockNotification[];
}) {
  await page.route('http://localhost:4000/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    const json = (data: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(data),
        headers: {
          'access-control-allow-origin': 'http://localhost:3000',
          'access-control-allow-credentials': 'true',
        },
      });

    if (method === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': 'http://localhost:3000',
          'access-control-allow-credentials': 'true',
          'access-control-allow-headers': 'content-type',
          'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
        },
      });
      return;
    }

    // Auth & Org
    if (path === '/api/auth/me') {
      return json({
        user: { id: 'e2e-user', name: 'Komal E2E Tester', email: 'komal@nexora.com', createdAt: new Date().toISOString() },
      });
    }

    if (path === '/api/organizations') {
      return json({
        organizations: [
          { id: orgId, name: 'Nexora Corp', slug: 'nexora', role: 'OWNER', memberCount: 1, createdAt: new Date().toISOString() },
        ],
      });
    }

    // Projects & Tasks
    if (path === `/api/projects/${projectId}/kanban` && method === 'GET') {
      return json({
        columns: {
          TODO: [
            {
              id: taskId,
              projectId,
              title: 'PRD 04 Collaboration Task',
              description: 'Testing task collaboration features',
              status: 'TODO',
              priority: 'HIGH',
              position: 0,
              parentTaskId: null,
              dueDate: null,
              completedAt: null,
            },
          ],
          IN_PROGRESS: [],
          IN_REVIEW: [],
          DONE: [],
        },
        total: 1,
      });
    }

    if (path === `/api/tasks/${taskId}/subtasks` && method === 'GET') {
      return json({ data: [] });
    }

    if (path === `/api/tasks/${taskId}/labels` && method === 'GET') {
      return json({ data: [] });
    }

    if (path === `/api/projects/${projectId}/labels` && method === 'GET') {
      return json({ data: [] });
    }

    // PRD 04: Comments API
    if (path === `/api/tasks/${taskId}/comments`) {
      if (method === 'GET') {
        return json({ comments: state.comments });
      }
      if (method === 'POST') {
        const body = req.postDataJSON() as { content: string };
        const newCmt: MockComment = {
          id: `cmt-${state.comments.length + 1}`,
          content: body.content,
          taskId,
          authorId: 'e2e-user',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          author: { id: 'e2e-user', name: 'Komal E2E Tester', email: 'komal@nexora.com' },
        };
        state.comments.push(newCmt);
        return json({ comment: newCmt }, 201);
      }
    }

    const commentDeleteMatch = path.match(new RegExp(`^/api/tasks/${taskId}/comments/([^/]+)$`));
    if (commentDeleteMatch && method === 'DELETE') {
      const cmtId = commentDeleteMatch[1];
      const idx = state.comments.findIndex((c) => c.id === cmtId);
      if (idx >= 0) state.comments.splice(idx, 1);
      return json({ success: true });
    }

    // PRD 04: Attachments API
    if (path === `/api/tasks/${taskId}/attachments`) {
      if (method === 'GET') {
        return json({ attachments: state.attachments });
      }
      if (method === 'POST') {
        const newAtt: MockAttachment = {
          id: `att-${state.attachments.length + 1}`,
          fileName: 'project-spec.pdf',
          fileSize: 1024 * 150, // 150 KB
          mimeType: 'application/pdf',
          taskId,
          uploadedById: 'e2e-user',
          createdAt: new Date().toISOString(),
          uploadedBy: { id: 'e2e-user', name: 'Komal E2E Tester', email: 'komal@nexora.com' },
        };
        state.attachments.unshift(newAtt);
        return json({ attachment: newAtt }, 201);
      }
    }

    const attachmentDownloadMatch = path.match(new RegExp(`^/api/tasks/${taskId}/attachments/([^/]+)/download$`));
    if (attachmentDownloadMatch && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        body: 'dummy pdf content for testing',
        headers: {
          'content-disposition': 'attachment; filename="project-spec.pdf"',
          'access-control-allow-origin': 'http://localhost:3000',
        },
      });
    }

    const attachmentDeleteMatch = path.match(new RegExp(`^/api/tasks/${taskId}/attachments/([^/]+)$`));
    if (attachmentDeleteMatch && method === 'DELETE') {
      const attId = attachmentDeleteMatch[1];
      const idx = state.attachments.findIndex((a) => a.id === attId);
      if (idx >= 0) state.attachments.splice(idx, 1);
      return json({ success: true });
    }

    // PRD 04: Activity History API
    if (path === `/api/tasks/${taskId}/activity` && method === 'GET') {
      return json({ activity: state.activities });
    }

    // PRD 04: In-App Notifications API
    if (path === '/api/notifications/unread-count' && method === 'GET') {
      const unreadCount = state.notifications.filter((n) => !n.isRead).length;
      return json({ unreadCount });
    }

    if (path === '/api/notifications' && method === 'GET') {
      return json({ notifications: state.notifications });
    }

    const notifReadMatch = path.match(/^\/api\/notifications\/([^/]+)\/read$/);
    if (notifReadMatch && method === 'PATCH') {
      const nId = notifReadMatch[1];
      const notif = state.notifications.find((n) => n.id === nId);
      if (notif) notif.isRead = true;
      return json({ notification: notif });
    }

    if (path === '/api/notifications/read-all' && method === 'PATCH') {
      state.notifications.forEach((n) => { n.isRead = true; });
      return json({ updated: state.notifications.length });
    }

    return json({ error: { code: 'NOT_FOUND', message: `Unhandled route: ${method} ${path}` } }, 404);
  });
}

test.describe('PRD 04 — Browser-Level Collaboration & Multi-Tab Notifications', () => {
  test('verifies comments lifecycle: empty state, post comment, inline delete confirmation', async ({ page }) => {
    const state = {
      comments: [] as MockComment[],
      attachments: [] as MockAttachment[],
      activities: [
        {
          id: 'act-1',
          type: 'TASK_CREATED',
          entityType: 'TASK',
          entityId: taskId,
          actorId: 'e2e-user',
          orgId,
          createdAt: new Date().toISOString(),
          actor: { id: 'e2e-user', name: 'Komal E2E Tester', email: 'komal@nexora.com' },
        },
      ],
      notifications: [] as MockNotification[],
    };

    await setupMockApi(page, state);

    // Open task details
    await page.goto('/tasks');
    await page.getByRole('textbox', { name: 'Project ID' }).fill(projectId);
    await page.getByRole('button', { name: 'Open project' }).click();

    // Click on the task card to open task drawer
    await page.getByRole('button', { name: 'PRD 04 Collaboration Task' }).click();
    const details = page.getByRole('complementary', { name: 'Task details' });
    await expect(details).toBeVisible();

    // Verify Comments Tab & initial empty state
    await expect(details.getByTestId('tab-comments')).toBeVisible();
    await expect(details.getByTestId('comments-empty')).toBeVisible();
    await expect(details.getByText('No comments yet')).toBeVisible();

    // Post a comment
    const commentInput = details.getByTestId('comment-textarea');
    await commentInput.fill('E2E browser comment: looks ready for staging!');
    await details.getByTestId('post-comment-btn').click();

    // Verify comment is displayed
    await expect(details.getByText('E2E browser comment: looks ready for staging!')).toBeVisible();
    await expect(details.getByText('Komal E2E Tester')).toBeVisible();

    // Click delete comment button (trash icon)
    const deleteBtn = details.getByTestId('delete-comment-btn-cmt-1');
    await deleteBtn.click();

    // Verify inline confirmation ("Delete? Yes No")
    await expect(details.getByText('Delete?')).toBeVisible();
    const confirmYes = details.getByTestId('confirm-delete-comment-cmt-1');
    await confirmYes.click();

    // Verify comment is gone and empty state returns
    await expect(details.getByText('E2E browser comment: looks ready for staging!')).not.toBeVisible();
    await expect(details.getByTestId('comments-empty')).toBeVisible();
  });

  test('verifies attachments lifecycle: empty state, upload file, download trigger, inline delete', async ({ page }) => {
    const state = {
      comments: [] as MockComment[],
      attachments: [] as MockAttachment[],
      activities: [] as MockActivity[],
      notifications: [] as MockNotification[],
    };

    await setupMockApi(page, state);

    await page.goto('/tasks');
    await page.getByRole('textbox', { name: 'Project ID' }).fill(projectId);
    await page.getByRole('button', { name: 'Open project' }).click();
    await page.getByRole('button', { name: 'PRD 04 Collaboration Task' }).click();
    const details = page.getByRole('complementary', { name: 'Task details' });

    // Switch to Attachments Tab
    await details.getByTestId('tab-attachments').click();

    // Verify empty state
    await expect(details.getByTestId('attachments-empty')).toBeVisible();
    await expect(details.getByText('No attachments uploaded yet')).toBeVisible();

    // Upload attachment via hidden file input
    const fileChooserInput = details.getByTestId('file-upload-input');
    await fileChooserInput.setInputFiles({
      name: 'project-spec.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('Mock PDF content for PRD 04 verification'),
    });

    // Verify attachment appears in the list
    await expect(details.getByText('project-spec.pdf')).toBeVisible();
    await expect(details.getByText('150 KB')).toBeVisible();
    await expect(details.getByTestId('download-attachment-att-1')).toBeVisible();

    // Delete attachment with inline confirmation
    const deleteAttBtn = details.getByTestId('delete-attachment-btn-att-1');
    await deleteAttBtn.click();
    await expect(details.getByText('Delete?')).toBeVisible();
    await details.getByTestId('confirm-delete-attachment-att-1').click();

    // Verify attachment deleted
    await expect(details.getByText('project-spec.pdf')).not.toBeVisible();
    await expect(details.getByTestId('attachments-empty')).toBeVisible();
  });

  test('verifies activity history tab renders chronological events', async ({ page }) => {
    const state = {
      comments: [] as MockComment[],
      attachments: [] as MockAttachment[],
      activities: [
        {
          id: 'act-1',
          type: 'TASK_CREATED',
          entityType: 'TASK',
          entityId: taskId,
          actorId: 'e2e-user',
          orgId,
          createdAt: new Date().toISOString(),
          actor: { id: 'e2e-user', name: 'Komal E2E Tester', email: 'komal@nexora.com' },
        },
      ],
      notifications: [] as MockNotification[],
    };

    await setupMockApi(page, state);

    await page.goto('/tasks');
    await page.getByRole('textbox', { name: 'Project ID' }).fill(projectId);
    await page.getByRole('button', { name: 'Open project' }).click();
    await page.getByRole('button', { name: 'PRD 04 Collaboration Task' }).click();
    const details = page.getByRole('complementary', { name: 'Task details' });

    // Switch to Activity Tab
    await details.getByTestId('tab-activity').click();
    await expect(details.getByTestId('activity-tab-content')).toBeVisible();
    await expect(details.getByText('created this task')).toBeVisible();
  });

  test('verifies real-time notification badge sync across multiple open browser tabs', async ({ context }) => {
    const sharedState = {
      comments: [] as MockComment[],
      attachments: [] as MockAttachment[],
      activities: [] as MockActivity[],
      notifications: [
        { id: 'notif-1', type: 'TASK_ASSIGNED', title: 'Task Assigned', message: 'You were assigned PRD 04', isRead: false, createdAt: new Date().toISOString() },
        { id: 'notif-2', type: 'COMMENT_ADDED', title: 'New Comment', message: 'Nishant commented on your task', isRead: false, createdAt: new Date().toISOString() },
      ],
    };

    // Open Tab 1
    const tab1 = await context.newPage();
    await setupMockApi(tab1, sharedState);
    await tab1.goto('/tasks');

    // Open Tab 2 in the same browser context (sharing BroadcastChannel and localStorage)
    const tab2 = await context.newPage();
    await setupMockApi(tab2, sharedState);
    await tab2.goto('/tasks');

    // Both tabs should show notification badge "2"
    await expect(tab1.getByTestId('notification-badge')).toHaveText('2');
    await expect(tab2.getByTestId('notification-badge')).toHaveText('2');

    // Tab 1: Open notification dropdown and click "Mark all read"
    await tab1.getByTestId('notification-bell-btn').click();
    await expect(tab1.getByTestId('notification-dropdown')).toBeVisible();
    await tab1.getByTestId('mark-all-read-btn').click();

    // Verify Tab 1 badge is now cleared
    await expect(tab1.getByTestId('notification-badge')).not.toBeVisible();

    // Immediately verify Tab 2 badge updates across tabs WITHOUT page reload!
    await expect(tab2.getByTestId('notification-badge')).not.toBeVisible({ timeout: 5000 });

    await tab1.close();
    await tab2.close();
  });
});
