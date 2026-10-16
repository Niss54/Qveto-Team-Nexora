import { describe, it, expect } from 'vitest';
import {
  TaskActivityType,
  createTaskSchema,
  updateTaskSchema,
  taskResponseSchema,
  TaskStatus,
  TaskPriority,
} from '@qveto/shared';

describe('Shared Task Contract & Activity Event Schemas (PRD 03)', () => {
  describe('TaskActivityType Enum', () => {
    it('should define all 6 canonical task event types', () => {
      const canonicalTypes = [
        'TASK_CREATED',
        'TASK_UPDATED',
        'TASK_STATUS_CHANGED',
        'TASK_ASSIGNED',
        'TASK_DUE_DATE_CHANGED',
        'TASK_ARCHIVED',
      ] as const;

      for (const eventType of canonicalTypes) {
        expect(TaskActivityType.safeParse(eventType).success).toBe(true);
      }

      // Should reject invalid or duplicate event types
      expect(TaskActivityType.safeParse('TASK_COMPLETED').success).toBe(false);
      expect(TaskActivityType.safeParse('UNKNOWN_EVENT').success).toBe(false);
    });
  });

  describe('createTaskSchema', () => {
    it('should validate valid task creation input', () => {
      const valid = {
        title: 'Implement Task API Endpoints',
        description: 'PRD 03 route implementation',
        status: 'TODO',
        priority: 'HIGH',
        startDate: '2026-10-16T09:00:00.000Z',
        dueDate: '2026-10-20T18:00:00.000Z',
      };

      const result = createTaskSchema.safeParse(valid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe(valid.title);
        expect(result.data.status).toBe(TaskStatus.enum.TODO);
        expect(result.data.priority).toBe(TaskPriority.enum.HIGH);
        expect(result.data.startDate).toBeInstanceOf(Date);
        expect(result.data.dueDate).toBeInstanceOf(Date);
      }
    });

    it('should accept task when startDate is equal to dueDate', () => {
      const sameDay = {
        title: 'Single-day spike task',
        startDate: '2026-10-16T09:00:00.000Z',
        dueDate: '2026-10-16T09:00:00.000Z',
      };

      const result = createTaskSchema.safeParse(sameDay);
      expect(result.success).toBe(true);
    });

    it('should reject task when startDate is after dueDate', () => {
      const invalidDates = {
        title: 'Invalid chronologically reversed task',
        startDate: '2026-10-25T09:00:00.000Z',
        dueDate: '2026-10-16T18:00:00.000Z',
      };

      const result = createTaskSchema.safeParse(invalidDates);
      expect(result.success).toBe(false);
      if (!result.success) {
        const error = result.error.errors.find((e) => e.path.includes('dueDate'));
        expect(error).toBeDefined();
        expect(error?.message).toContain('startDate must be before or equal to dueDate');
      }
    });

    it('should accept task when only startDate or only dueDate is provided', () => {
      expect(
        createTaskSchema.safeParse({ title: 'Task with only start', startDate: '2026-10-16' })
          .success,
      ).toBe(true);
      expect(
        createTaskSchema.safeParse({ title: 'Task with only due', dueDate: '2026-10-20' }).success,
      ).toBe(true);
      expect(createTaskSchema.safeParse({ title: 'Task with no dates' }).success).toBe(true);
    });
  });

  describe('updateTaskSchema', () => {
    it('should validate partial update payload', () => {
      const partial = {
        status: 'DONE',
        position: 4,
      };

      const result = updateTaskSchema.safeParse(partial);
      expect(result.success).toBe(true);
    });

    it('should reject update if revised startDate exceeds dueDate', () => {
      const invalid = {
        startDate: '2026-11-01T00:00:00.000Z',
        dueDate: '2026-10-01T00:00:00.000Z',
      };

      const result = updateTaskSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('taskResponseSchema', () => {
    it('should parse complete task response with server-managed lifecycle fields', () => {
      const taskData = {
        id: 'tsk_123',
        title: 'Core Engine Task',
        description: 'Detailed explanation',
        status: 'DONE',
        priority: 'URGENT',
        startDate: '2026-10-10T09:00:00.000Z',
        dueDate: '2026-10-15T18:00:00.000Z',
        completedAt: '2026-10-15T12:00:00.000Z',
        archivedAt: null,
        position: 1,
        projectId: 'prj_456',
        assigneeId: 'usr_789',
        creatorId: 'usr_001',
        parentTaskId: null,
        createdAt: '2026-10-10T09:00:00.000Z',
        updatedAt: '2026-10-15T12:00:00.000Z',
      };

      const result = taskResponseSchema.safeParse(taskData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.completedAt).toBe('2026-10-15T12:00:00.000Z');
        expect(result.data.archivedAt).toBeNull();
      }
    });
  });
});
