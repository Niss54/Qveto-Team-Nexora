import { describe, it, expect } from 'vitest';
import { PrismaClient } from '@prisma/client';

describe('Database Schema & Prisma Client', () => {
  it('PrismaClient should be instantiated with all domain models available', () => {
    const client = new PrismaClient();

    // Verify all 16 domain models exist on the client instance
    expect(client.user).toBeDefined();
    expect(client.session).toBeDefined();
    expect(client.organization).toBeDefined();
    expect(client.organizationMember).toBeDefined();
    expect(client.workspace).toBeDefined();
    expect(client.team).toBeDefined();
    expect(client.teamMember).toBeDefined();
    expect(client.project).toBeDefined();
    expect(client.projectMember).toBeDefined();
    expect(client.task).toBeDefined();
    expect(client.label).toBeDefined();
    expect(client.taskLabel).toBeDefined();
    expect(client.comment).toBeDefined();
    expect(client.attachment).toBeDefined();
    expect(client.activityEvent).toBeDefined();
    expect(client.notification).toBeDefined();
  });

  it('PrismaClient models should expose standard CRUD methods', () => {
    const client = new PrismaClient();

    expect(typeof client.user.findUnique).toBe('function');
    expect(typeof client.user.create).toBe('function');
    expect(typeof client.organization.findMany).toBe('function');
    expect(typeof client.task.findFirst).toBe('function');
    expect(typeof client.session.deleteMany).toBe('function');
  });
});
