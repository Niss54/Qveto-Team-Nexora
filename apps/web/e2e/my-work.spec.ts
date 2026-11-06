import { test, expect, type Page } from '@playwright/test';

type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

interface MockMyWorkTask {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  projectId: string;
  assigneeId: string | null;
  creatorId: string;
  createdAt: string;
  updatedAt: string;
  project: {
    id: string;
    name: string;
    workspace: {
      id: string;
      name: string;
      orgId: string;
    };
  };
}

const orgId = 'e2e-org';
const userId = 'e2e-user';

function createInitialTasks(): MockMyWorkTask[] {
  const now = new Date();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12, 0, 0)).toISOString();
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  return [
    {
      id: 'task-open-1',
      title: 'Design Landing Page Mockups',
      description: 'Create high-fidelity wireframes in Figma',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      startDate: yesterday,
      dueDate: tomorrow,
      completedAt: null,
      projectId: 'proj-design',
      assigneeId: userId,
      creatorId: userId,
      createdAt: yesterday,
      updatedAt: yesterday,
      project: {
        id: 'proj-design',
        name: 'Design System',
        workspace: { id: 'ws-1', name: 'Product WS', orgId },
      },
    },
    {
      id: 'task-overdue-1',
      title: 'Fix Auth Cookie Invalidation',
      description: 'Resolve session expiry bug in production',
      status: 'TODO',
      priority: 'URGENT',
      startDate: yesterday,
      dueDate: yesterday,
      completedAt: null,
      projectId: 'proj-core',
      assigneeId: userId,
      creatorId: userId,
      createdAt: yesterday,
      updatedAt: yesterday,
      project: {
        id: 'proj-core',
        name: 'Backend Core',
        workspace: { id: 'ws-1', name: 'Product WS', orgId },
      },
    },
    {
      id: 'task-today-1',
      title: 'Prepare Sprint Review Slides',
      description: 'Gather team velocity metrics for demo',
      status: 'IN_REVIEW',
      priority: 'MEDIUM',
      startDate: yesterday,
      dueDate: today,
      completedAt: null,
      projectId: 'proj-design',
      assigneeId: userId,
      creatorId: userId,
      createdAt: yesterday,
      updatedAt: yesterday,
      project: {
        id: 'proj-design',
        name: 'Design System',
        workspace: { id: 'ws-1', name: 'Product WS', orgId },
      },
    },
    {
      id: 'task-done-1',
      title: 'Deploy Staging Environment',
      description: 'Setup test cluster for QA verification',
      status: 'DONE',
      priority: 'LOW',
      startDate: yesterday,
      dueDate: yesterday,
      completedAt: yesterday,
      projectId: 'proj-core',
      assigneeId: userId,
      creatorId: userId,
      createdAt: yesterday,
      updatedAt: yesterday,
      project: {
        id: 'proj-core',
        name: 'Backend Core',
        workspace: { id: 'ws-1', name: 'Product WS', orgId },
      },
    },
  ];
}

async function setupMyWorkMocks(
  page: Page,
  options: {
    tasks?: MockMyWorkTask[];
    simulatedError?: boolean;
    usePagination?: boolean;
  } = {},
) {
  let tasks = options.tasks ? [...options.tasks] : createInitialTasks();

  await page.route('http://localhost:4000/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    const body =
      method === 'POST' || method === 'PATCH'
        ? ((req.postDataJSON() as Record<string, unknown>) ?? {})
        : {};

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

    if (path === '/api/auth/me') {
      return json({
        user: {
          id: userId,
          name: 'E2E Tester',
          email: 'e2e@example.com',
          createdAt: new Date().toISOString(),
        },
      });
    }

    if (path === '/api/organizations') {
      return json({
        organizations: [
          {
            id: orgId,
            name: 'E2E Organization',
            slug: 'e2e',
            role: 'OWNER',
            memberCount: 2,
            createdAt: new Date().toISOString(),
          },
        ],
      });
    }

    if (path === `/api/organizations/${orgId}/members`) {
      return json({
        members: [
          {
            id: 'mem-1',
            orgId,
            userId,
            role: 'OWNER',
            user: { id: userId, name: 'E2E Tester', email: 'e2e@example.com' },
          },
        ],
      });
    }

    if (path === '/api/tasks/my-work' && method === 'GET') {
      if (options.simulatedError) {
        return json(
          {
            error: {
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to retrieve assigned tasks',
            },
          },
          500,
        );
      }

      const statusFilter = url.searchParams.get('status');
      const priorityFilter = url.searchParams.get('priority');
      const projectFilter = url.searchParams.get('projectId');
      const overdueFilter = url.searchParams.get('overdue') === 'true';
      const pageNum = parseInt(url.searchParams.get('page') || '1', 10);
      const pageSize = parseInt(url.searchParams.get('pageSize') || '15', 10);

      const now = new Date();
      let filtered = [...tasks];

      if (statusFilter) {
        filtered = filtered.filter((t) => t.status === statusFilter);
      }
      if (priorityFilter) {
        filtered = filtered.filter((t) => t.priority === priorityFilter);
      }
      if (projectFilter) {
        filtered = filtered.filter((t) => t.projectId === projectFilter);
      }
      if (overdueFilter) {
        filtered = filtered.filter(
          (t) => t.dueDate && t.status !== 'DONE' && new Date(t.dueDate) < now,
        );
      }

      // Summary statistics calculated across current active tasks
      const totalOpen = tasks.filter((t) => t.status !== 'DONE').length;
      const overdue = tasks.filter(
        (t) => t.dueDate && t.status !== 'DONE' && new Date(t.dueDate) < now,
      ).length;
      const dueToday = tasks.filter((t) => {
        if (!t.dueDate || t.status === 'DONE') return false;
        const d = new Date(t.dueDate);
        return (
          d.getUTCFullYear() === now.getUTCFullYear() &&
          d.getUTCMonth() === now.getUTCMonth() &&
          d.getUTCDate() === now.getUTCDate()
        );
      }).length;
      const completed = tasks.filter((t) => t.status === 'DONE').length;

      if (options.usePagination) {
        // Return simulated page 1 or page 2
        const total = 20;
        const totalPages = 2;
        const pageItems =
          pageNum === 1
            ? filtered.slice(0, 15)
            : filtered.slice(15, 20);

        return json({
          data: pageItems,
          meta: {
            total,
            page: pageNum,
            pageSize,
            totalPages,
          },
          summary: { totalOpen, overdue, dueToday, completed },
        });
      }

      return json({
        data: filtered,
        meta: {
          total: filtered.length,
          page: pageNum,
          pageSize,
          totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)),
        },
        summary: { totalOpen, overdue, dueToday, completed },
      });
    }

    const taskMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
    if (taskMatch && method === 'PATCH') {
      const taskId = taskMatch[1];
      const taskIndex = tasks.findIndex((t) => t.id === taskId);
      if (taskIndex === -1) {
        return json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
      }

      const updatedTask = {
        ...tasks[taskIndex],
        ...body,
        completedAt: body.status === 'DONE' ? new Date().toISOString() : null,
        updatedAt: new Date().toISOString(),
      };
      tasks[taskIndex] = updatedTask as MockMyWorkTask;

      return json({ task: updatedTask });
    }

    return json(
      { error: { code: 'NOT_FOUND', message: `Unmocked endpoint: ${method} ${path}` } },
      404,
    );
  });
}

test.describe('PRD 05: My Work Dashboard E2E Tests', () => {
  test('authenticated dashboard loads with greeting and active organization', async ({
    page,
  }) => {
    await setupMyWorkMocks(page);
    await page.goto('/dashboard');

    // Header and Greeting
    await expect(page.getByRole('heading', { name: /Welcome back, E2E Tester!/i })).toBeVisible();
    await expect(page.getByText('🏢 Active Org:')).toBeVisible();
    await expect(page.getByRole('main').getByText('E2E Organization')).toBeVisible();

    // My Work Tab is selected by default
    const myWorkTab = page.getByRole('tab', { name: /My Work/i });
    await expect(myWorkTab).toBeVisible();
    await expect(myWorkTab).toHaveAttribute('aria-selected', 'true');
  });

  test('renders 4 KPI summary cards with live counts', async ({ page }) => {
    await setupMyWorkMocks(page);
    await page.goto('/dashboard');

    // KPI Cards: Total Open, Overdue, Due Today, Completed
    const openCard = page.locator('.card').filter({ hasText: 'Total Open' });
    await expect(openCard).toBeVisible();
    await expect(openCard.locator('p.text-3xl')).toHaveText('3');

    const overdueCard = page.locator('.card').filter({ hasText: 'Past scheduled due date' });
    await expect(overdueCard).toBeVisible();
    await expect(overdueCard.locator('p.text-3xl')).toHaveText('1');
    await expect(overdueCard.getByText('Requires action')).toBeVisible();

    const dueTodayCard = page.locator('.card').filter({ hasText: 'Due Today' });
    await expect(dueTodayCard).toBeVisible();
    await expect(dueTodayCard.locator('p.text-3xl')).toHaveText('1');

    const completedCard = page.locator('.card').filter({ hasText: 'Completed' });
    await expect(completedCard).toBeVisible();
    await expect(completedCard.locator('p.text-3xl')).toHaveText('1');

    // Task table renders assigned items
    await expect(page.getByRole('heading', { name: /Assigned Tasks \(4\)/i })).toBeVisible();
    await expect(page.getByText('Design Landing Page Mockups')).toBeVisible();
    await expect(page.getByText('Fix Auth Cookie Invalidation')).toBeVisible();
    await expect(page.getByText('Prepare Sprint Review Slides')).toBeVisible();
    await expect(page.getByText('Deploy Staging Environment')).toBeVisible();

    // Check overdue and due today indicators
    await expect(page.getByRole('table').getByText('⚠️')).toBeVisible();
    await expect(page.getByText('⏰ Today')).toBeVisible();
  });

  test('filters tasks by status, priority, project, and overdue', async ({ page }) => {
    await setupMyWorkMocks(page);
    await page.goto('/dashboard');

    // 1. Status Filter: select 'In Progress'
    const statusSelect = page.locator('label', { hasText: 'Status' }).locator('..').getByRole('combobox');
    await statusSelect.selectOption('IN_PROGRESS');

    // Only 'Design Landing Page Mockups' should appear
    await expect(page.getByText('Design Landing Page Mockups')).toBeVisible();
    await expect(page.getByText('Fix Auth Cookie Invalidation')).not.toBeVisible();
    await expect(page.getByText('Deploy Staging Environment')).not.toBeVisible();

    // 2. Clear filters
    await page.getByRole('button', { name: 'Clear all filters' }).click();
    await expect(page.getByText('Fix Auth Cookie Invalidation')).toBeVisible();

    // 3. Priority Filter: select 'Urgent'
    const prioritySelect = page.locator('label', { hasText: 'Priority' }).locator('..').getByRole('combobox');
    await prioritySelect.selectOption('URGENT');
    await expect(page.getByText('Fix Auth Cookie Invalidation')).toBeVisible();
    await expect(page.getByText('Design Landing Page Mockups')).not.toBeVisible();

    // Reset priority
    await page.getByRole('button', { name: 'Clear all filters' }).click();

    // 4. Overdue Only Filter checkbox
    const overdueCheckbox = page.getByRole('checkbox', { name: /Show Overdue Only/i });
    await overdueCheckbox.check();
    await expect(page.getByText('Fix Auth Cookie Invalidation')).toBeVisible();
    await expect(page.getByText('Design Landing Page Mockups')).not.toBeVisible();
    await expect(page.getByText('Deploy Staging Environment')).not.toBeVisible();

    // Uncheck overdue
    await overdueCheckbox.uncheck();
    await expect(page.getByText('Design Landing Page Mockups')).toBeVisible();

    // 5. Project ID Filter
    const projectInput = page.getByPlaceholder('Filter by project ID');
    await projectInput.fill('proj-design');
    await expect(page.getByText('Design Landing Page Mockups')).toBeVisible();
    await expect(page.getByText('Prepare Sprint Review Slides')).toBeVisible();
    await expect(page.getByText('Fix Auth Cookie Invalidation')).not.toBeVisible();
  });

  test('quick task status updates call PATCH API and persist changes', async ({ page }) => {
    await setupMyWorkMocks(page);
    await page.goto('/dashboard');

    // Find the row for 'Design Landing Page Mockups'
    const taskRow = page.locator('tr').filter({ hasText: 'Design Landing Page Mockups' });
    await expect(taskRow).toBeVisible();

    // Currently status is 'In Progress'
    await expect(taskRow.locator('span.rounded-full')).toHaveText('In Progress');

    // Quick Action dropdown: update to Done
    const quickSelect = taskRow.getByRole('combobox');
    await quickSelect.selectOption('DONE');

    // Feedback Notice appears
    await expect(page.getByText('Task updated to Done')).toBeVisible();

    // Row status badge updates to Done
    await expect(taskRow.locator('span.rounded-full')).toHaveText('Done');

    // Reload the page: the status should persist from the mock backend store
    await page.reload();
    const updatedRow = page.locator('tr').filter({ hasText: 'Design Landing Page Mockups' });
    await expect(updatedRow.locator('span.rounded-full')).toHaveText('Done');
  });

  test('pagination works correctly when tasks exceed page size', async ({ page }) => {
    // Generate 20 tasks
    const manyTasks: MockMyWorkTask[] = Array.from({ length: 20 }, (_, i) => ({
      id: `task-paged-${i + 1}`,
      title: `Paginated Task #${i + 1}`,
      description: null,
      status: 'TODO',
      priority: 'MEDIUM',
      startDate: null,
      dueDate: null,
      completedAt: null,
      projectId: 'proj-paged',
      assigneeId: userId,
      creatorId: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      project: {
        id: 'proj-paged',
        name: 'Paged Project',
        workspace: { id: 'ws-1', name: 'Product WS', orgId },
      },
    }));

    await setupMyWorkMocks(page, { tasks: manyTasks, usePagination: true });
    await page.goto('/dashboard');

    // Initial page shows Page 1 of 2
    await expect(page.getByText('Page 1 of 2 (20 tasks)')).toBeVisible();
    await expect(page.getByText('Paginated Task #1', { exact: true })).toBeVisible();

    // Previous button should be disabled
    const prevBtn = page.getByRole('button', { name: 'Previous' });
    await expect(prevBtn).toBeDisabled();

    // Click Next
    const nextBtn = page.getByRole('button', { name: 'Next' });
    await expect(nextBtn).toBeEnabled();
    await nextBtn.click();

    // Page 2 shows
    await expect(page.getByText('Page 2 of 2 (20 tasks)')).toBeVisible();
    await expect(page.getByText('Paginated Task #16', { exact: true })).toBeVisible();

    // Next is now disabled, Previous is enabled
    await expect(nextBtn).toBeDisabled();
    await expect(prevBtn).toBeEnabled();
    await prevBtn.click();

    // Returns to Page 1
    await expect(page.getByText('Page 1 of 2 (20 tasks)')).toBeVisible();
    await expect(page.getByText('Paginated Task #1', { exact: true })).toBeVisible();
  });

  test('handles empty state when no tasks are assigned', async ({ page }) => {
    await setupMyWorkMocks(page, { tasks: [] });
    await page.goto('/dashboard');

    // Empty state message
    await expect(page.getByRole('heading', { name: 'No tasks currently assigned to you' })).toBeVisible();
    await expect(
      page.getByText('You are all caught up! Tasks assigned to you in this organization will appear here.'),
    ).toBeVisible();
  });

  test('handles API error state with retry button', async ({ page }) => {
    await setupMyWorkMocks(page, { simulatedError: true });
    await page.goto('/dashboard');

    // Error banner renders
    await expect(page.getByText(/Failed to retrieve assigned tasks/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try Again' })).toBeVisible();
  });
});
