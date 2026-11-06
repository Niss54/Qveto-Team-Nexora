import { test, expect, type Page } from '@playwright/test';

interface MockAnalyticsData {
  orgId: string;
  projectId: string | null;
  overview: {
    totalTasks: number;
    completedTasks: number;
    openTasks: number;
    overdueTasks: number;
    completionRate: number;
    onTimeCompletionRate: number;
    assignmentCoverage: number;
    assignedTasks: number;
    unassignedTasks: number;
  };
  statusDistribution: Record<'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE', number>;
  priorityDistribution: Record<'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT', number>;
  projectProgress: Array<{
    id: string;
    name: string;
    totalTasks: number;
    completedTasks: number;
    overdueTasks: number;
    progressPercentage: number;
  }>;
  workloadByAssignee: Array<{
    userId: string | null;
    name: string;
    email: string | null;
    avatarUrl: string | null;
    totalTasks: number;
    openTasks: number;
    completedTasks: number;
    overdueTasks: number;
    dueTodayTasks: number;
  }>;
}

const defaultOrgId = 'org-tenant-a';
const defaultUserId = 'e2e-analytics-user';

function createMockAnalytics(orgId: string, projectId: string | null = null): MockAnalyticsData {
  if (orgId === 'org-tenant-b') {
    return {
      orgId,
      projectId,
      overview: {
        totalTasks: 2,
        completedTasks: 1,
        openTasks: 1,
        overdueTasks: 0,
        completionRate: 50,
        onTimeCompletionRate: 100,
        assignmentCoverage: 100,
        assignedTasks: 2,
        unassignedTasks: 0,
      },
      statusDistribution: {
        TODO: 0,
        IN_PROGRESS: 1,
        IN_REVIEW: 0,
        DONE: 1,
      },
      priorityDistribution: {
        LOW: 1,
        MEDIUM: 1,
        HIGH: 0,
        URGENT: 0,
      },
      projectProgress: [
        {
          id: 'proj-beta-1',
          name: 'Beta Internal App',
          totalTasks: 2,
          completedTasks: 1,
          overdueTasks: 0,
          progressPercentage: 50,
        },
      ],
      workloadByAssignee: [
        {
          userId: 'user-beta',
          name: 'Beta Engineer',
          email: 'engineer@beta.com',
          avatarUrl: null,
          totalTasks: 2,
          openTasks: 1,
          completedTasks: 1,
          overdueTasks: 0,
          dueTodayTasks: 0,
        },
      ],
    };
  }

  // Tenant Alpha mock data
  if (projectId === 'proj-core') {
    return {
      orgId,
      projectId,
      overview: {
        totalTasks: 4,
        completedTasks: 3,
        openTasks: 1,
        overdueTasks: 1,
        completionRate: 75,
        onTimeCompletionRate: 67,
        assignmentCoverage: 100,
        assignedTasks: 4,
        unassignedTasks: 0,
      },
      statusDistribution: {
        TODO: 0,
        IN_PROGRESS: 1,
        IN_REVIEW: 0,
        DONE: 3,
      },
      priorityDistribution: {
        LOW: 1,
        MEDIUM: 1,
        HIGH: 1,
        URGENT: 1,
      },
      projectProgress: [
        {
          id: 'proj-core',
          name: 'Core Platform',
          totalTasks: 4,
          completedTasks: 3,
          overdueTasks: 1,
          progressPercentage: 75,
        },
      ],
      workloadByAssignee: [
        {
          userId: 'user-alice',
          name: 'Alice Smith',
          email: 'alice@example.com',
          avatarUrl: null,
          totalTasks: 3,
          openTasks: 1,
          completedTasks: 2,
          overdueTasks: 1,
          dueTodayTasks: 0,
        },
        {
          userId: 'user-bob',
          name: 'Bob Jones',
          email: 'bob@example.com',
          avatarUrl: null,
          totalTasks: 1,
          openTasks: 0,
          completedTasks: 1,
          overdueTasks: 0,
          dueTodayTasks: 0,
        },
      ],
    };
  }

  return {
    orgId,
    projectId: null,
    overview: {
      totalTasks: 6,
      completedTasks: 4,
      openTasks: 2,
      overdueTasks: 1,
      completionRate: 67,
      onTimeCompletionRate: 75,
      assignmentCoverage: 83,
      assignedTasks: 5,
      unassignedTasks: 1,
    },
    statusDistribution: {
      TODO: 1,
      IN_PROGRESS: 1,
      IN_REVIEW: 0,
      DONE: 4,
    },
    priorityDistribution: {
      LOW: 1,
      MEDIUM: 2,
      HIGH: 2,
      URGENT: 1,
    },
    projectProgress: [
      {
        id: 'proj-core',
        name: 'Core Platform',
        totalTasks: 4,
        completedTasks: 3,
        overdueTasks: 1,
        progressPercentage: 75,
      },
      {
        id: 'proj-mobile',
        name: 'Mobile Client',
        totalTasks: 2,
        completedTasks: 1,
        overdueTasks: 0,
        progressPercentage: 50,
      },
    ],
    workloadByAssignee: [
      {
        userId: 'user-alice',
        name: 'Alice Smith',
        email: 'alice@example.com',
        avatarUrl: null,
        totalTasks: 3,
        openTasks: 1,
        completedTasks: 2,
        overdueTasks: 1,
        dueTodayTasks: 0,
      },
      {
        userId: 'user-bob',
        name: 'Bob Jones',
        email: 'bob@example.com',
        avatarUrl: null,
        totalTasks: 2,
        openTasks: 0,
        completedTasks: 2,
        overdueTasks: 0,
        dueTodayTasks: 0,
      },
      {
        userId: null,
        name: 'Unassigned Tasks',
        email: null,
        avatarUrl: null,
        totalTasks: 1,
        openTasks: 1,
        completedTasks: 0,
        overdueTasks: 0,
        dueTodayTasks: 0,
      },
    ],
  };
}

async function setupAnalyticsMocks(
  page: Page,
  options: {
    simulatedError?: boolean;
    emptyAnalytics?: boolean;
    customOrgs?: Array<{ id: string; name: string; slug: string; role: 'OWNER' | 'ADMIN' | 'MEMBER' }>;
  } = {},
) {
  const orgs = options.customOrgs || [
    {
      id: 'org-tenant-a',
      name: 'Tenant Alpha',
      slug: 'alpha',
      role: 'OWNER' as const,
    },
    {
      id: 'org-tenant-b',
      name: 'Tenant Beta',
      slug: 'beta',
      role: 'MEMBER' as const,
    },
  ];

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

    if (path === '/api/auth/me') {
      return json({
        user: {
          id: defaultUserId,
          name: 'Analytics Tester',
          email: 'analytics@example.com',
          createdAt: new Date().toISOString(),
        },
      });
    }

    if (path === '/api/organizations') {
      return json({
        organizations: orgs.map((org) => ({
          ...org,
          memberCount: 2,
          createdAt: new Date().toISOString(),
        })),
      });
    }

    if (path === '/api/tasks/my-work') {
      return json({
        data: [],
        meta: { total: 0, page: 1, pageSize: 15, totalPages: 1 },
        summary: { totalOpen: 0, overdue: 0, dueToday: 0, completed: 0 },
      });
    }

    if (path === '/api/analytics/productivity' && method === 'GET') {
      if (options.simulatedError) {
        return json(
          {
            error: {
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to calculate productivity analytics',
            },
          },
          500,
        );
      }

      if (options.emptyAnalytics) {
        return json({ analytics: null });
      }

      const orgIdParam = url.searchParams.get('orgId') || defaultOrgId;
      const projectIdParam = url.searchParams.get('projectId');
      const data = createMockAnalytics(orgIdParam, projectIdParam);

      return json({ analytics: data });
    }

    const membersMatch = path.match(/^\/api\/organizations\/([^/]+)\/members$/);
    if (membersMatch) {
      return json({
        members: [
          {
            id: 'mem-1',
            orgId: membersMatch[1],
            userId: defaultUserId,
            role: 'OWNER',
            user: { id: defaultUserId, name: 'Analytics Tester', email: 'analytics@example.com' },
          },
        ],
      });
    }

    return json(
      { error: { code: 'NOT_FOUND', message: `Unmocked endpoint: ${method} ${path}` } },
      404,
    );
  });
}

test.describe('PRD 05: Productivity Analytics Dashboard E2E Tests', () => {
  test('navigates to analytics tab and displays productivity scope header', async ({
    page,
  }) => {
    await setupAnalyticsMocks(page);
    await page.goto('/dashboard');

    // Click Productivity Analytics tab
    const analyticsTab = page.getByRole('tab', { name: /Productivity Analytics/i });
    await expect(analyticsTab).toBeVisible();
    await analyticsTab.click();

    await expect(analyticsTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('heading', { name: 'Productivity Scope' })).toBeVisible();
    await expect(
      page.getByText('Live productivity metrics across authorized projects in Tenant Alpha.'),
    ).toBeVisible();
  });

  test('renders 4 overview KPI cards and distribution charts', async ({ page }) => {
    await setupAnalyticsMocks(page);
    await page.goto('/dashboard');

    await page.getByRole('tab', { name: /Productivity Analytics/i }).click();

    // 1. Completion Rate KPI Card
    const completionCard = page.locator('.card').filter({ hasText: 'Completion Rate' });
    await expect(completionCard).toBeVisible();
    await expect(completionCard.locator('p.text-3xl')).toHaveText('67%');
    await expect(completionCard.getByText('4 of 6 tasks completed')).toBeVisible();

    // 2. On-Time Rate KPI Card
    const onTimeCard = page.locator('.card').filter({ hasText: 'On-Time Rate' });
    await expect(onTimeCard).toBeVisible();
    await expect(onTimeCard.locator('p.text-3xl')).toHaveText('75%');
    await expect(onTimeCard.getByText('Finished on or before scheduled due date')).toBeVisible();

    // 3. Assignment Coverage KPI Card
    const coverageCard = page.locator('.card').filter({ hasText: 'Assignment Coverage' });
    await expect(coverageCard).toBeVisible();
    await expect(coverageCard.locator('p.text-3xl')).toHaveText('83%');
    await expect(coverageCard.getByText('5 assigned · 1 unassigned')).toBeVisible();

    // 4. Overdue Tasks KPI Card
    const overdueCard = page.locator('.card').filter({ hasText: 'Overdue Tasks' });
    await expect(overdueCard).toBeVisible();
    await expect(overdueCard.locator('p.text-3xl')).toHaveText('1');
    await expect(overdueCard.getByText('2 total open tasks currently active')).toBeVisible();

    // 5. Status Distribution Section
    await expect(page.getByRole('heading', { name: 'Task Status Distribution' })).toBeVisible();
    await expect(page.getByText('Done').first()).toBeVisible();
    await expect(page.getByText('4 (67%)')).toBeVisible();

    // 6. Priority Distribution Section
    const priorityCard = page.locator('.card').filter({ hasText: 'Task Priority Distribution' });
    await expect(priorityCard).toBeVisible();
    await expect(priorityCard.getByText('Urgent')).toBeVisible();
    await expect(priorityCard.getByText('1 (17%)').first()).toBeVisible();
  });

  test('renders project progress overview and team assignee workload table', async ({
    page,
  }) => {
    await setupAnalyticsMocks(page);
    await page.goto('/dashboard');

    await page.getByRole('tab', { name: /Productivity Analytics/i }).click();

    // Project Progress Overview
    await expect(page.getByRole('heading', { name: 'Project Progress Overview' })).toBeVisible();
    await expect(page.getByText('2 active project(s)')).toBeVisible();

    // Both projects render
    await expect(page.getByText('Core Platform')).toBeVisible();
    await expect(page.getByText('75% Completed')).toBeVisible();
    await expect(page.getByText('Total: 4')).toBeVisible();
    await expect(page.getByText('Completed: 3')).toBeVisible();
    await expect(page.getByText('⚠️ Overdue: 1')).toBeVisible();

    await expect(page.getByText('Mobile Client')).toBeVisible();
    await expect(page.getByText('50% Completed')).toBeVisible();

    // Workload by Assignee Table
    await expect(page.getByRole('heading', { name: 'Workload by Assignee' })).toBeVisible();
    await expect(page.getByText('3 team assignee(s)')).toBeVisible();

    // Alice Smith row
    const aliceRow = page.locator('tr').filter({ hasText: 'Alice Smith' });
    await expect(aliceRow).toBeVisible();
    await expect(aliceRow.getByText('alice@example.com')).toBeVisible();

    // Bob Jones row
    const bobRow = page.locator('tr').filter({ hasText: 'Bob Jones' });
    await expect(bobRow).toBeVisible();
    await expect(bobRow.getByText('bob@example.com')).toBeVisible();

    // Unassigned tasks row
    const unassignedRow = page.locator('tr').filter({ hasText: 'Unassigned Tasks' });
    await expect(unassignedRow).toBeVisible();
  });

  test('filters analytics by project id', async ({ page }) => {
    await setupAnalyticsMocks(page);
    await page.goto('/dashboard');

    await page.getByRole('tab', { name: /Productivity Analytics/i }).click();

    // Initially both projects exist
    await expect(page.getByText('Core Platform')).toBeVisible();
    await expect(page.getByText('Mobile Client')).toBeVisible();

    // Enter project filter
    const projectFilterInput = page.getByPlaceholder('Filter by Project ID');
    await projectFilterInput.fill('proj-core');

    // Click Refresh to query project-specific analytics
    await page.getByRole('button', { name: 'Refresh' }).click();

    // Now only Core Platform is shown, Mobile Client is filtered out
    await expect(page.getByText('Core Platform')).toBeVisible();
    await expect(page.getByText('Mobile Client')).not.toBeVisible();

    // Completion rate changed to 75% for Core Platform
    const completionCard = page.locator('.card').filter({ hasText: 'Completion Rate' });
    await expect(completionCard.locator('p.text-3xl')).toHaveText('75%');

    // Click Clear filter
    await page.getByRole('button', { name: 'Clear' }).click();
    await page.getByRole('button', { name: 'Refresh' }).click();

    // Both projects return
    await expect(page.getByText('Core Platform')).toBeVisible();
    await expect(page.getByText('Mobile Client')).toBeVisible();
  });

  test('renders empty and error states correctly', async ({ page }) => {
    // 1. Error state
    await setupAnalyticsMocks(page, { simulatedError: true });
    await page.goto('/dashboard');
    await page.getByRole('tab', { name: /Productivity Analytics/i }).click();

    await expect(page.getByText(/Failed to calculate productivity analytics/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try Again' })).toBeVisible();
  });

  test('organization switching does not expose another tenant data', async ({
    page,
  }) => {
    await setupAnalyticsMocks(page);
    await page.goto('/dashboard');

    // 1. Initial active organization: Tenant Alpha
    await expect(page.getByRole('main').getByText('Tenant Alpha')).toBeVisible();

    // Switch to Productivity Analytics
    await page.getByRole('tab', { name: /Productivity Analytics/i }).click();

    // Tenant Alpha shows 'Core Platform' and 'Mobile Client'
    await expect(page.getByText('Core Platform')).toBeVisible();
    await expect(page.getByText('Mobile Client')).toBeVisible();
    // Tenant Beta project should NOT be present
    await expect(page.getByText('Beta Internal App')).not.toBeVisible();

    // 2. Open Navbar Organization Switcher Dropdown
    // The org button in Navbar shows 'Tenant Alpha'
    const orgDropdownBtn = page.getByRole('banner').locator('button', { hasText: 'Tenant Alpha' });
    await orgDropdownBtn.click();

    // Click 'Tenant Beta' in dropdown
    const tenantBetaOption = page.getByRole('banner').getByRole('button', { name: 'Tenant Beta' });
    await tenantBetaOption.click();

    // Active Org in header updates to Tenant Beta
    await expect(page.getByText('Active Org:').locator('..').getByText('Tenant Beta')).toBeVisible();

    // 3. Analytics data re-fetches for Tenant Beta (org-tenant-b)
    // Now 'Beta Internal App' should be visible
    await expect(page.getByText('Beta Internal App')).toBeVisible();
    await expect(page.getByText('Beta Engineer')).toBeVisible();

    // Tenant Alpha's data must NOT be visible anymore
    await expect(page.getByText('Core Platform')).not.toBeVisible();
    await expect(page.getByText('Mobile Client')).not.toBeVisible();
    await expect(page.getByText('Alice Smith')).not.toBeVisible();
  });
});
