import { test, expect, type Page } from '@playwright/test';

type Status = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
type Task = {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: Status;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  position: number;
  parentTaskId: string | null;
  dueDate: string | null;
  completedAt: string | null;
};

const projectId = 'e2e-project';
const orgId = 'e2e-org';
const statuses: Status[] = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];

function createTask(id: string, title: string, status: Status = 'TODO', position = 0): Task {
  return { id, projectId, title, description: null, status, priority: 'MEDIUM', position, parentTaskId: null, dueDate: null, completedAt: null };
}

async function mockTaskApi(page: Page) {
  const tasks: Task[] = [createTask('task-1', 'E2E initial task')];
  const labels: { id: string; name: string; color: string }[] = [];
  const taskLabels: Record<string, string[]> = {};
  const children: Record<string, Task[]> = {};

  await page.route('http://localhost:4000/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    const body = method === 'POST' || method === 'PATCH' ? req.postDataJSON() as Record<string, unknown> : {};
    const json = (data: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data), headers: { 'access-control-allow-origin': 'http://localhost:3000', 'access-control-allow-credentials': 'true' } });

    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': 'http://localhost:3000', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' } });
      return;
    }
    if (path === '/api/auth/me') return json({ user: { id: 'e2e-user', name: 'E2E Tester', email: 'e2e@example.com', createdAt: new Date().toISOString() } });
    if (path === '/api/organizations') return json({ organizations: [{ id: orgId, name: 'E2E Organization', slug: 'e2e', role: 'OWNER', memberCount: 1, createdAt: new Date().toISOString() }] });
    if (path === `/api/projects/${projectId}/kanban` && method === 'GET') {
      const columns: Record<Status, Task[]> = { TODO: [], IN_PROGRESS: [], IN_REVIEW: [], DONE: [] };
      for (const task of tasks) columns[task.status].push(task);
      for (const status of statuses) columns[status].sort((a, b) => a.position - b.position);
      return json({ columns, total: tasks.length });
    }
    if (path === `/api/projects/${projectId}/kanban/move` && method === 'PATCH') {
      const task = tasks.find((item) => item.id === body.taskId);
      if (!task) return json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
      const status = body.status as Status;
      const targetIndex = body.targetIndex as number;
      const source = tasks.filter((item) => item.status === task.status && item.id !== task.id).sort((a, b) => a.position - b.position);
      const destination = task.status === status ? source : tasks.filter((item) => item.status === status).sort((a, b) => a.position - b.position);
      if (task.status !== status) source.forEach((item, index) => { item.position = index; });
      task.status = status;
      task.completedAt = status === 'DONE' ? new Date().toISOString() : null;
      destination.splice(targetIndex, 0, task);
      destination.forEach((item, index) => { item.position = index; });
      return json({ task });
    }
    if (path === `/api/projects/${projectId}/tasks` && method === 'POST') {
      const task = createTask(`task-${tasks.length + 1}`, String(body.title), (body.status as Status) || 'TODO', tasks.filter((t) => t.status === body.status).length);
      task.description = (body.description as string | null) ?? null;
      task.priority = (body.priority as Task['priority']) || 'MEDIUM';
      tasks.push(task);
      return json({ task }, 201);
    }
    const taskMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
    if (taskMatch && method === 'PATCH') {
      const task = tasks.find((item) => item.id === taskMatch[1]);
      if (!task) return json({ error: { code: 'NOT_FOUND', message: 'Task not found' } }, 404);
      Object.assign(task, body);
      return json({ task });
    }
    const labelMatch = path.match(/^\/api\/tasks\/([^/]+)\/labels(?:\/([^/]+))?$/);
    if (labelMatch) {
      const taskId = labelMatch[1];
      if (method === 'GET') return json({ data: labels.filter((l) => (taskLabels[taskId] || []).includes(l.id)) });
      if (method === 'POST') {
        taskLabels[taskId] = [...(taskLabels[taskId] || []), String(body.labelId)];
        return json({ label: labels.find((l) => l.id === body.labelId) }, 201);
      }
      if (method === 'DELETE') {
        taskLabels[taskId] = (taskLabels[taskId] || []).filter((id) => id !== labelMatch[2]);
        return json({ removed: true });
      }
    }
    if (path === `/api/projects/${projectId}/labels`) {
      if (method === 'GET') return json({ data: labels });
      if (method === 'POST') {
        const label = { id: `label-${labels.length + 1}`, name: String(body.name), color: '#6366f1' };
        labels.push(label);
        return json({ label }, 201);
      }
    }
    const subtaskMatch = path.match(/^\/api\/tasks\/([^/]+)\/subtasks$/);
    if (subtaskMatch) {
      const parentId = subtaskMatch[1];
      if (method === 'GET') return json({ data: children[parentId] || [] });
      if (method === 'POST') {
        const child = createTask(`child-${Date.now()}`, String(body.title));
        child.parentTaskId = parentId;
        (children[parentId] ||= []).push(child);
        tasks.push(child);
        return json({ task: child }, 201);
      }
    }
    if (path.match(/^\/api\/tasks\/[^/]+\/archive$/) && method === 'POST') {
      const taskId = path.split('/')[3];
      const index = tasks.findIndex((t) => t.id === taskId);
      if (index >= 0) tasks.splice(index, 1);
      return json({ archived: true });
    }
    return json({ error: { code: 'NOT_FOUND', message: `Unmocked endpoint: ${method} ${path}` } }, 404);
  });
}

async function openBoard(page: Page) {
  await page.goto('/tasks');
  await expect(page.getByRole('heading', { name: 'Tasks & Kanban' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Project ID' }).fill(projectId);
  await page.getByRole('button', { name: 'Open project' }).click();
  await expect(page.getByRole('button', { name: 'E2E initial task' })).toBeVisible();
}

test.describe('PRD 03 Tasks and Kanban UI', () => {
  test.beforeEach(async ({ page }) => { await mockTaskApi(page); });

  test('loads a project board with four Kanban columns', async ({ page }) => {
    await openBoard(page);
    for (const heading of ['To Do', 'In Progress', 'In Review', 'Done']) {
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    }
  });

  test('creates a task, moves it to Done, and survives board refresh', async ({ page }) => {
    await openBoard(page);
    await page.getByRole('textbox', { name: 'Task title' }).fill('E2E new task');
    await page.getByRole('button', { name: 'Create task' }).click();
    await expect(page.getByRole('button', { name: 'E2E new task' })).toBeVisible();
    const card = page.locator('article').filter({ has: page.getByRole('button', { name: 'E2E new task' }) });
    await card.getByRole('button', { name: 'Done' }).click();
    await expect(page.locator('article').filter({ has: page.getByRole('button', { name: 'E2E new task' }) })).toBeVisible();
    await page.getByRole('button', { name: 'Refresh board' }).click();
    await expect(page.getByRole('button', { name: 'E2E new task' })).toBeVisible();
  });

  test('edits task details without closing the panel', async ({ page }) => {
    await openBoard(page);
    await page.getByRole('button', { name: 'E2E initial task' }).click();
    const details = page.getByRole('complementary', { name: 'Task details' });
    await expect(details).toBeVisible();
    await details.getByRole('button', { name: 'Edit task' }).click();
    await details.getByRole('textbox', { name: 'Title', exact: true }).fill('E2E edited task');
    await details.getByRole('button', { name: 'Save changes' }).click();
    await expect(details).toBeVisible();
    await expect(details.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('E2E edited task');
    await expect(page.getByRole('button', { name: 'E2E edited task' })).toBeVisible();
  });

  test('creates a label and a subtask in Task details', async ({ page }) => {
    await openBoard(page);
    await page.getByRole('button', { name: 'E2E initial task' }).click();
    const details = page.getByRole('complementary', { name: 'Task details' });
    await details.getByRole('textbox', { name: 'New label name' }).fill('Frontend-QA');
    await details.getByRole('button', { name: 'Create label' }).click();
    await expect(details.getByRole('option', { name: 'Frontend-QA' })).toBeAttached();
    await details.getByRole('textbox', { name: 'Subtask title' }).fill('E2E child task');
    await details.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(details.getByText('E2E child task')).toBeVisible();
  });
});

