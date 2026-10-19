import { expect, test, type Page } from '@playwright/test';

const orgId = 'e2e-org';
const ownerId = 'e2e-owner';
const nextOwnerId = 'e2e-next-owner';
const workspaceId = 'e2e-workspace';
const projectId = 'e2e-project';

type Project = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  startDate: string | null;
  dueDate: string | null;
  ownerId: string | null;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
};

const timestamp = '2026-10-18T00:00:00.000Z';
const orgMembers = [
  { id: 'org-member-owner', userId: ownerId, orgId, role: 'OWNER', joinedAt: timestamp, user: { id: ownerId, email: 'owner@example.com', name: 'E2E Owner', createdAt: timestamp } },
  { id: 'org-member-next', userId: nextOwnerId, orgId, role: 'MEMBER', joinedAt: timestamp, user: { id: nextOwnerId, email: 'next@example.com', name: 'E2E Next Owner', createdAt: timestamp } },
];

function createProject(overrides: Partial<Project> = {}): Project {
  return {
    id: projectId,
    name: 'E2E Project',
    description: 'Project used by the browser test',
    status: 'ACTIVE',
    startDate: null,
    dueDate: null,
    ownerId,
    workspaceId,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

async function mockProjectApi(page: Page, initialProject: Project | null = null) {
  let project = initialProject;
  const creates: Record<string, unknown>[] = [];
  const updates: Record<string, unknown>[] = [];

  await page.route('http://localhost:4000/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const body = method === 'POST' || method === 'PATCH'
      ? request.postDataJSON() as Record<string, unknown>
      : {};
    const json = (data: unknown, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(data),
      headers: {
        'access-control-allow-origin': 'http://localhost:3000',
        'access-control-allow-credentials': 'true',
      },
    });

    if (method === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': 'http://localhost:3000',
          'access-control-allow-credentials': 'true',
          'access-control-allow-headers': 'content-type',
          'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
        },
      });
    }
    if (path === '/api/auth/me') {
      return json({ user: { id: ownerId, name: 'E2E Owner', email: 'owner@example.com', createdAt: timestamp } });
    }
    if (path === '/api/organizations') {
      return json({ organizations: [{ id: orgId, name: 'E2E Organization', slug: 'e2e', role: 'OWNER', memberCount: 2, createdAt: timestamp, updatedAt: timestamp }] });
    }
    if (path === `/api/organizations/${orgId}/members`) return json({ data: orgMembers });
    if (path === `/api/organizations/${orgId}/workspaces`) {
      const workspaces = [
        { id: workspaceId, name: 'Active Workspace', slug: 'active', description: null, orgId, archivedAt: null, createdAt: timestamp, updatedAt: timestamp },
        { id: 'e2e-archived-workspace', name: 'Archived Workspace', slug: 'archived', description: null, orgId, archivedAt: timestamp, createdAt: timestamp, updatedAt: timestamp },
      ];
      return json({ data: workspaces, meta: { total: 2, page: Number(url.searchParams.get('page') ?? 1), pageSize: 100, totalPages: 1 } });
    }
    if (path === `/api/workspaces/${workspaceId}`) {
      return json({ workspace: { id: workspaceId, name: 'Active Workspace', slug: 'active', description: null, orgId, archivedAt: null, createdAt: timestamp, updatedAt: timestamp } });
    }
    if (path === `/api/workspaces/${workspaceId}/projects` && method === 'GET') {
      return json({ data: project ? [project] : [], meta: { total: project ? 1 : 0, page: 1, pageSize: 100, totalPages: 1 } });
    }
    if (path.startsWith('/api/workspaces/') && path.endsWith('/projects') && method === 'GET') {
      return json({ data: [], meta: { total: 0, page: 1, pageSize: 100, totalPages: 1 } });
    }
    if (path === `/api/workspaces/${workspaceId}/projects` && method === 'POST') {
      creates.push(body);
      project = createProject({
        ...body,
        startDate: body.startDate as string | null,
        dueDate: body.dueDate as string | null,
        description: body.description as string | null,
        ownerId: body.ownerId as string,
        status: body.status as string,
        name: body.name as string,
      });
      return json({ project }, 201);
    }
    if (path === `/api/projects/${projectId}` && method === 'GET') {
      return project ? json({ project }) : json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404);
    }
    if (path === `/api/projects/${projectId}` && method === 'PATCH') {
      updates.push(body);
      if (!project) return json({ error: { code: 'NOT_FOUND', message: 'Project not found' } }, 404);
      project = { ...project, ...body, updatedAt: timestamp } as Project;
      return json({ project });
    }
    if (path === `/api/projects/${projectId}/members`) {
      return json({ members: project?.ownerId ? [{
        id: 'project-owner-membership',
        userId: project.ownerId,
        projectId,
        role: 'OWNER',
        joinedAt: timestamp,
        user: { id: project.ownerId, name: project.ownerId === ownerId ? 'E2E Owner' : 'E2E Next Owner', email: 'owner@example.com' },
      }] : [] });
    }
    return json({ error: { code: 'NOT_FOUND', message: `Unmocked endpoint: ${method} ${path}` } }, 404);
  });

  return { creates, updates };
}

test.describe('PRD 02 Projects UI', () => {
  test('only offers active workspaces and validates date order before create', async ({ page }) => {
    const { creates } = await mockProjectApi(page);
    await page.goto('/projects');

    const workspaceSelect = page.getByLabel('Workspace');
    await expect(workspaceSelect.locator('option')).toHaveCount(2);
    await expect(workspaceSelect.getByRole('option', { name: 'Archived Workspace' })).toHaveCount(0);
    await expect(page.getByLabel('Project owner')).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Create project' })).toBeDisabled();

    await page.getByLabel('Project owner').selectOption(nextOwnerId);
    await page.getByLabel('Name').fill('Dates in reverse');
    await page.getByLabel('Start date').fill('2026-10-20');
    await page.getByLabel('Due date').fill('2026-10-19');
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page.getByText('startDate must be before or equal to dueDate', { exact: true })).toBeVisible();
    expect(creates).toHaveLength(0);
  });

  test('creates a project with its selected owner and date range', async ({ page }) => {
    const { creates } = await mockProjectApi(page);
    await page.goto('/projects');
    await page.getByLabel('Project owner').selectOption(nextOwnerId);
    await page.getByLabel('Name').fill('Launch Planning');
    await page.getByLabel('Description').fill('Plan the launch');
    await page.getByLabel('Status').selectOption('PLANNING');
    await page.getByLabel('Start date').fill('2026-10-19');
    await page.getByLabel('Due date').fill('2026-10-20');
    await page.getByRole('button', { name: 'Create project' }).click();

    await expect(page.getByRole('status')).toContainText('Project created.');
    await expect.poll(() => creates.length).toBe(1);
    expect(creates[0]).toMatchObject({
      name: 'Launch Planning',
      description: 'Plan the launch',
      ownerId: nextOwnerId,
      status: 'PLANNING',
      startDate: '2026-10-19T00:00:00.000Z',
      dueDate: '2026-10-20T00:00:00.000Z',
    });
  });

  test('saves project settings with owner transfer and dates', async ({ page }) => {
    const { updates } = await mockProjectApi(page, createProject());
    await page.goto(`/projects/${projectId}`);

    await expect(page.getByRole('heading', { name: 'E2E Project' })).toBeVisible();
    await page.getByLabel('Owner').selectOption(nextOwnerId);
    await page.getByLabel('Start date').fill('2026-10-19');
    await page.getByLabel('Due date').fill('2026-10-21');
    await page.getByRole('button', { name: 'Save settings' }).click();

    await expect(page.getByRole('status')).toContainText('Project settings saved.');
    await expect.poll(() => updates.length).toBe(1);
    expect(updates[0]).toMatchObject({
      ownerId: nextOwnerId,
      startDate: '2026-10-19T00:00:00.000Z',
      dueDate: '2026-10-21T00:00:00.000Z',
    });
  });
});
