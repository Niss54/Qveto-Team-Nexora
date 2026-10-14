import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from apps/api and root directory
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const isTest = process.env.NODE_ENV === 'test';

const envSchema = z.object({
  DATABASE_URL: isTest
    ? z.string().default('postgresql://postgres:postgres@localhost:5432/qveto_test')
    : z.string().min(1, 'DATABASE_URL is required'),
  API_PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SESSION_SECRET: z
    .string()
    .min(32, 'SESSION_SECRET must be at least 32 characters')
    .default('dev-session-secret-key-that-is-at-least-32-characters-long!'),
  SESSION_MAX_AGE_MS: z.coerce.number().default(604800000), // 7 days (7 * 24 * 60 * 60 * 1000)
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }

  return result.data;
}

export const env = loadEnv();
