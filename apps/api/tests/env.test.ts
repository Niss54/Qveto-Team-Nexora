import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Verify the environment schema validation behavior at startup
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  API_PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  SESSION_MAX_AGE_MS: z.coerce.number().default(604800000),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
});

describe('Environment Configuration Validation (PRD Requirement)', () => {
  it('should fail clearly when DATABASE_URL is missing', () => {
    const invalidConfig = {
      DATABASE_URL: '',
      SESSION_SECRET: 'a-valid-secret-key-that-is-at-least-32-chars-long!',
    };

    const result = envSchema.safeParse(invalidConfig);
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.DATABASE_URL).toBeDefined();
      expect(errors.DATABASE_URL![0]).toContain('DATABASE_URL is required');
    }
  });

  it('should fail clearly when SESSION_SECRET is shorter than 32 characters', () => {
    const invalidConfig = {
      DATABASE_URL: 'postgresql://localhost:5432/test',
      SESSION_SECRET: 'short-secret',
    };

    const result = envSchema.safeParse(invalidConfig);
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      expect(errors.SESSION_SECRET).toBeDefined();
      expect(errors.SESSION_SECRET![0]).toContain('at least 32 characters');
    }
  });

  it('should pass cleanly when all required environment variables are valid', () => {
    const validConfig = {
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/qveto',
      SESSION_SECRET: 'this-is-a-properly-configured-32-character-secret-key',
      API_PORT: 4000,
      NODE_ENV: 'production',
    };

    const result = envSchema.safeParse(validConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.API_PORT).toBe(4000);
      expect(result.data.SESSION_MAX_AGE_MS).toBe(604800000);
      expect(result.data.CORS_ORIGIN).toBe('http://localhost:3000');
    }
  });
});
