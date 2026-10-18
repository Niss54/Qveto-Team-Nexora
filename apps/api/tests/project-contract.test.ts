import { describe, expect, it } from 'vitest';
import {
  ProjectStatus,
  createProjectSchema,
  projectListQuerySchema,
  projectResponseSchema,
  updateProjectSchema,
} from '@qveto/shared';

describe('PRD 02 Project schemas', () => {
  it('accepts the supported Project lifecycle statuses', () => {
    for (const status of ['PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED']) {
      expect(ProjectStatus.safeParse(status).success).toBe(true);
    }
    expect(ProjectStatus.safeParse('UNKNOWN').success).toBe(false);
  });

  it('trims project fields, defaults status, and accepts optional dates', () => {
    const result = createProjectSchema.parse({
      name: '  Roadmap  ',
      description: '  Q4 delivery  ',
      ownerId: 'user-1',
      startDate: '2026-10-01T00:00:00.000Z',
      dueDate: '2026-10-31T00:00:00.000Z',
    });
    expect(result).toMatchObject({ name: 'Roadmap', description: 'Q4 delivery', ownerId: 'user-1', status: 'ACTIVE' });
    expect(result.startDate).toEqual(new Date('2026-10-01T00:00:00.000Z'));
  });

  it('rejects invalid date ranges and unknown request fields', () => {
    expect(createProjectSchema.safeParse({
      name: 'Roadmap', ownerId: 'user-1',
      startDate: '2026-11-01T00:00:00.000Z', dueDate: '2026-10-31T00:00:00.000Z',
    }).success).toBe(false);
    expect(createProjectSchema.safeParse({ name: 'Roadmap', ownerId: 'user-1', orgId: 'spoofed' }).success).toBe(false);
  });

  it('requires a non-empty update and validates date ranges when both dates are supplied', () => {
    expect(updateProjectSchema.safeParse({}).success).toBe(false);
    expect(updateProjectSchema.safeParse({ startDate: '2026-11-01', dueDate: '2026-10-31' }).success).toBe(false);
    expect(updateProjectSchema.safeParse({ dueDate: null }).success).toBe(true);
  });

  it('defaults to excluding archived projects in paginated list queries', () => {
    expect(projectListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20, includeArchived: false });
    expect(projectListQuerySchema.parse({ includeArchived: 'true' }).includeArchived).toBe(true);
  });

  it('keeps the response status open-ended for legacy records pending inventory', () => {
    const result = projectResponseSchema.safeParse({
      id: 'project-1', name: 'Roadmap', description: null, status: 'LEGACY_UNKNOWN',
      startDate: null, dueDate: null, ownerId: null, workspaceId: 'workspace-1',
      createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });
});
