import { randomUUID } from 'node:crypto';
import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type Browser,
  type Page,
} from '@playwright/test';
import { prisma } from '../../api/src/lib/prisma.js';

const enabled = process.env.PRD02_REAL_API_E2E === '1';
const apiUrl = 'http://localhost:4000';
const suffix = randomUUID();
const password = 'PRD02-E2E-Only-Password-451!';
const ownerEmail = `prd02-owner-${suffix}@example.test`;
const candidateEmail = `prd02-candidate-${suffix}@example.test`;
const outsiderEmail = `prd02-outsider-${suffix}@example.test`;

let ownerApi: APIRequestContext;
let candidateApi: APIRequestContext;
let outsiderApi: APIRequestContext;
let organizationId: string;
let workspaceId: string;
let ownerId: string;
let candidateId: string;
let outsiderId: string;

async function registerUser(context: APIRequestContext, name: string, email: string) {
  const response = await context.post('/api/auth/register', { data: { name, email, password } });
  expect(response.status()).toBe(201);
  return (await response.json()).user as { id: string };
}

async function login(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/dashboard/);
}

async function loginContext(browser: Browser, email: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, email);
  return { context, page };
}

test.describe('Project flows against the real API and isolated PostgreSQL database', () => {
  test.skip(!enabled, 'Set PRD02_REAL_API_E2E=1 to run against the isolated audit database.');

  test.beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes('127.0.0.1:55433/qveto_test')) {
      throw new Error(
        'Real API browser tests require the verified isolated PostgreSQL audit target.',
      );
    }

    ownerApi = await playwrightRequest.newContext({ baseURL: apiUrl });
    candidateApi = await playwrightRequest.newContext({ baseURL: apiUrl });
    outsiderApi = await playwrightRequest.newContext({ baseURL: apiUrl });
    const owner = await registerUser(ownerApi, 'PRD02 E2E Owner', ownerEmail);
    ownerId = owner.id;
    const candidate = await registerUser(candidateApi, 'PRD02 E2E Candidate', candidateEmail);
    candidateId = candidate.id;
    const outsider = await registerUser(outsiderApi, 'PRD02 E2E Outsider', outsiderEmail);
    outsiderId = outsider.id;

    const organizationResponse = await ownerApi.post('/api/organizations', {
      data: { name: `PRD02 E2E ${suffix.slice(0, 8)}`, slug: `prd02-e2e-${suffix.slice(0, 8)}` },
    });
    expect(organizationResponse.status()).toBe(201);
    organizationId = (await organizationResponse.json()).organization.id as string;

    for (const email of [candidateEmail, outsiderEmail]) {
      const memberResponse = await ownerApi.post(`/api/organizations/${organizationId}/members`, {
        data: { email, role: 'EMPLOYEE' },
      });
      expect(memberResponse.status()).toBe(201);
    }

    const workspaceResponse = await ownerApi.get(
      `/api/organizations/${organizationId}/workspaces?page=1&pageSize=100`,
    );
    expect(workspaceResponse.status()).toBe(200);
    const workspaces = (await workspaceResponse.json()).data as Array<{
      id: string;
      name: string;
      archivedAt: string | null;
    }>;
    const workspace = workspaces.find((item) => item.name === 'General' && !item.archivedAt);
    if (!workspace)
      throw new Error('The organization did not provide its active General workspace.');
    workspaceId = workspace.id;
  });

  test.afterAll(async () => {
    if (organizationId) await prisma.organization.deleteMany({ where: { id: organizationId } });
    const userIds = [ownerId, candidateId, outsiderId].filter(Boolean);
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await Promise.all([ownerApi?.dispose(), candidateApi?.dispose(), outsiderApi?.dispose()]);
    await prisma.$disconnect();
  });

  test('creates, edits, transfers ownership, enforces membership access, and archives/restores a project', async ({
    browser,
    page,
  }) => {
    await login(page, ownerEmail);
    await page.goto('/projects');
    await page.getByLabel('Workspace').selectOption(workspaceId);
    await page.getByLabel('Project owner').selectOption(candidateId);
    await page.getByLabel('Name').fill(`Live project ${suffix.slice(0, 8)}`);
    await page.getByLabel('Status').selectOption('PLANNING');
    await page.getByLabel('Start date').fill('2026-10-20');
    await page.getByLabel('Due date').fill('2026-11-20');
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page.getByRole('status')).toContainText('Project created.');

    const listResponse = await ownerApi.get(
      `/api/workspaces/${workspaceId}/projects?page=1&pageSize=100`,
    );
    expect(listResponse.status()).toBe(200);
    const listed = (await listResponse.json()).data as Array<{ id: string; name: string }>;
    const project = listed.find((item) => item.name === `Live project ${suffix.slice(0, 8)}`);
    expect(project).toBeDefined();
    const projectId = project!.id;

    let projectResponse = await ownerApi.get(`/api/projects/${projectId}`);
    expect(projectResponse.status()).toBe(200);
    let projectData = (await projectResponse.json()).project;
    expect(projectData).toMatchObject({
      ownerId: candidateId,
      status: 'PLANNING',
      startDate: '2026-10-20T00:00:00.000Z',
      dueDate: '2026-11-20T00:00:00.000Z',
    });
    const createdMembersResponse = await ownerApi.get(`/api/projects/${projectId}/members`);
    const createdMembers = (await createdMembersResponse.json()).members as Array<{
      userId: string;
      role: string;
    }>;
    expect(createdMembers).toEqual([
      expect.objectContaining({ userId: candidateId, role: 'OWNER' }),
    ]);

    await page.getByRole('link', { name: 'Details' }).click();
    await expect(
      page.getByRole('heading', { name: `Live project ${suffix.slice(0, 8)}` }),
    ).toBeVisible();
    await page.getByLabel('Owner').selectOption(ownerId);
    await page.getByLabel('Start date').fill('2026-10-21');
    await page.getByLabel('Due date').fill('2026-11-21');
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByRole('status')).toContainText('Project settings saved.');

    projectResponse = await ownerApi.get(`/api/projects/${projectId}`);
    projectData = (await projectResponse.json()).project;
    expect(projectData).toMatchObject({
      ownerId,
      startDate: '2026-10-21T00:00:00.000Z',
      dueDate: '2026-11-21T00:00:00.000Z',
    });
    const membersResponse = await ownerApi.get(`/api/projects/${projectId}/members`);
    const members = (await membersResponse.json()).members as Array<{
      userId: string;
      role: string;
    }>;
    expect(members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: ownerId, role: 'OWNER' }),
        expect.objectContaining({ userId: candidateId, role: 'MEMBER' }),
      ]),
    );
    expect(members.filter((member) => member.role === 'OWNER')).toHaveLength(1);

    const outsider = await loginContext(browser, outsiderEmail);
    try {
      await outsider.page.goto(`/projects/${projectId}`);
      await expect(outsider.page.locator('p[role="alert"]')).toContainText(
        'Project membership is required',
      );
      const deniedUpdate = await outsider.page.request.patch(
        `${apiUrl}/api/projects/${projectId}`,
        {
          data: { name: 'Unauthorized change' },
        },
      );
      expect(deniedUpdate.status()).toBe(403);
    } finally {
      await outsider.context.close();
    }

    await page.getByRole('button', { name: 'Archive project' }).click();
    await expect(page.getByText(/This project is archived/)).toBeVisible();
    const archivedWrite = await page.request.patch(`${apiUrl}/api/projects/${projectId}`, {
      data: { name: 'Blocked after archive' },
    });
    expect(archivedWrite.status()).toBe(409);
    await page.getByRole('button', { name: 'Restore project' }).click();
    await expect(page.getByRole('status')).toContainText('Project restored.');
  });
});
