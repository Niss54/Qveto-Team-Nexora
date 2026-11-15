import { test, expect, type Page } from '@playwright/test';

const orgId = 'e2e-org-amrutha';

async function mockMembersAndSettingsApi(page: Page) {
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
          id: 'usr_owner_1',
          name: 'Amrutha (Owner)',
          email: 'amrutha@example.com',
          createdAt: new Date().toISOString(),
        },
      });
    }

    if (path === '/api/organizations') {
      return json({
        organizations: [
          {
            id: orgId,
            name: 'Nexora Corp',
            slug: 'nexora-corp',
            role: 'OWNER',
            memberCount: 3,
            createdAt: new Date().toISOString(),
          },
        ],
      });
    }

    if (path === `/api/organizations/${orgId}` && method === 'GET') {
      return json({
        organization: {
          id: orgId,
          name: 'Nexora Corp',
          slug: 'nexora-corp',
          description: 'Primary Engineering Tenant',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
    }

    if (path === `/api/organizations/${orgId}/members` && method === 'GET') {
      return json({
        members: [
          {
            id: 'mem_1',
            orgId,
            userId: 'usr_owner_1',
            role: 'OWNER',
            joinedAt: '2026-10-15T00:00:00.000Z',
            user: {
              id: 'usr_owner_1',
              name: 'Amrutha (Owner)',
              email: 'amrutha@example.com',
              avatarUrl: null,
            },
          },
          {
            id: 'mem_2',
            orgId,
            userId: 'usr_mgr_2',
            role: 'MANAGER',
            joinedAt: '2026-10-16T00:00:00.000Z',
            user: {
              id: 'usr_mgr_2',
              name: 'Alex Rivera',
              email: 'alex@example.com',
              avatarUrl: null,
            },
          },
        ],
      });
    }

    if (path === `/api/notifications/unread-count`) {
      return json({ unreadCount: 0 });
    }

    if (path === `/api/notifications`) {
      return json({ notifications: [], meta: { total: 0, page: 1, pageSize: 20, totalPages: 0 } });
    }

    await route.continue();
  });
}

test.describe('Members & Settings Navigation and UI (Amrutha Workstream)', () => {
  test('Members page displays directory and invite button for Owner', async ({ page }) => {
    await mockMembersAndSettingsApi(page);
    await page.goto('/members');

    await expect(page.locator('h1')).toContainText('Members & Roles');
    await expect(page.getByText('Amrutha (Owner)')).toBeVisible();
    await expect(page.getByText('Alex Rivera')).toBeVisible();
    await expect(page.getByRole('button', { name: /Invite Member/i })).toBeVisible();
  });

  test('Organization Settings page displays tenant diagnostics and profile', async ({ page }) => {
    await mockMembersAndSettingsApi(page);
    await page.goto('/settings');

    await expect(page.locator('h1')).toContainText('Organization Settings');
    await expect(page.locator('input[value="Nexora Corp"]')).toBeVisible();
    await expect(page.getByText('Tenant Security & Isolation Diagnostic')).toBeVisible();
  });
});
