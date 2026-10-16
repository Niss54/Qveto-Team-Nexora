import { describe, it, expect, beforeEach, vi } from 'vitest';
import supertest from 'supertest';
import bcrypt from 'bcryptjs';

// In-memory mock database state for hermetic unit & integration testing
interface MockUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface MockSession {
  id: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
}

const mockUsers: MockUser[] = [];
const mockSessions: MockSession[] = [];

// Mock the prisma singleton client
vi.mock('../src/lib/prisma.js', () => {
  return {
    prisma: {
      user: {
        findUnique: vi.fn(async ({ where }: { where: { email?: string; id?: string } }) => {
          if (where.email) {
            return (
              mockUsers.find((u) => u.email.toLowerCase() === where.email?.toLowerCase()) || null
            );
          }
          if (where.id) {
            return mockUsers.find((u) => u.id === where.id) || null;
          }
          return null;
        }),
        create: vi.fn(
          async ({ data }: { data: { email: string; name: string; passwordHash: string } }) => {
            const user: MockUser = {
              id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              email: data.email.toLowerCase(),
              name: data.name,
              passwordHash: data.passwordHash,
              avatarUrl: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            mockUsers.push(user);
            return user;
          },
        ),
      },
      session: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
          const session = mockSessions.find((s) => s.id === where.id);
          if (!session) return null;
          const user = mockUsers.find((u) => u.id === session.userId);
          if (!user) return null;
          return {
            ...session,
            user,
          };
        }),
        create: vi.fn(async ({ data }: { data: { userId: string; expiresAt: Date } }) => {
          const session: MockSession = {
            id: `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            userId: data.userId,
            expiresAt: data.expiresAt,
            createdAt: new Date(),
          };
          mockSessions.push(session);
          return session;
        }),
        delete: vi.fn(async ({ where }: { where: { id: string } }) => {
          const idx = mockSessions.findIndex((s) => s.id === where.id);
          if (idx !== -1) {
            const [deleted] = mockSessions.splice(idx, 1);
            return deleted;
          }
          throw new Error('Record to delete does not exist.');
        }),
      },
    },
  };
});

// Import app after mocking prisma
const { createApp } = await import('../src/app.js');
const app = createApp('http://localhost:3000');
const request = supertest(app);

describe('Authentication System (Register / Login / Logout / Me)', () => {
  beforeEach(() => {
    mockUsers.length = 0;
    mockSessions.length = 0;
  });

  // ============================================================
  // Registration Tests
  // ============================================================
  describe('POST /api/auth/register', () => {
    it('should register a new user, return 201, set HttpOnly cookie, and sanitize output', async () => {
      const res = await request.post('/api/auth/register').send({
        email: 'alice@example.com',
        password: 'Password123!',
        name: 'Alice Johnson',
      });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('user');
      expect(res.body.user).toHaveProperty('id');
      expect(res.body.user.email).toBe('alice@example.com');
      expect(res.body.user.name).toBe('Alice Johnson');
      expect(res.body.user.createdAt).toBeDefined();

      // Crucial: never return password or passwordHash!
      expect(res.body.user.password).toBeUndefined();
      expect(res.body.user.passwordHash).toBeUndefined();

      // Check HttpOnly session cookie
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies.some((c: string) => c.includes('sessionId='))).toBe(true);
      expect(cookies.some((c: string) => c.includes('HttpOnly'))).toBe(true);

      // Verify password was properly hashed with bcrypt
      const stored = mockUsers.find((u) => u.email === 'alice@example.com');
      expect(stored).toBeDefined();
      expect(stored!.passwordHash).not.toBe('Password123!');
      const matches = await bcrypt.compare('Password123!', stored!.passwordHash);
      expect(matches).toBe(true);
    });

    it('should reject duplicate email with 409 Conflict', async () => {
      // First registration
      await request.post('/api/auth/register').send({
        email: 'duplicate@example.com',
        password: 'Password123!',
        name: 'First User',
      });

      // Second registration with same email
      const res = await request.post('/api/auth/register').send({
        email: 'duplicate@example.com',
        password: 'Password456!',
        name: 'Second User',
      });

      expect(res.status).toBe(409);
      expect(res.body.error).toHaveProperty('code', 'CONFLICT');
      expect(res.body.error.message).toContain('already exists');
    });

    it('should reject registration with invalid email format', async () => {
      const res = await request.post('/api/auth/register').send({
        email: 'not-an-email',
        password: 'Password123!',
        name: 'Bad Email User',
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toBeDefined();
    });

    it('should reject registration with password shorter than 8 characters', async () => {
      const res = await request.post('/api/auth/register').send({
        email: 'short@example.com',
        password: 'short',
        name: 'Short Pass User',
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(JSON.stringify(res.body.error.details)).toContain('8 characters');
    });

    it('should reject registration with missing name', async () => {
      const res = await request.post('/api/auth/register').send({
        email: 'noname@example.com',
        password: 'Password123!',
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ============================================================
  // Login Tests
  // ============================================================
  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash('CorrectPassword123!', salt);
      mockUsers.push({
        id: 'usr_seeded_bob',
        email: 'bob@example.com',
        name: 'Bob Smith',
        passwordHash,
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    it('should login with valid credentials and return session cookie', async () => {
      const res = await request.post('/api/auth/login').send({
        email: 'bob@example.com',
        password: 'CorrectPassword123!',
      });

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('bob@example.com');
      expect(res.body.user.name).toBe('Bob Smith');
      expect(res.body.user.passwordHash).toBeUndefined();

      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies.some((c: string) => c.includes('sessionId='))).toBe(true);
      expect(cookies.some((c: string) => c.includes('HttpOnly'))).toBe(true);
    });

    it('should reject login with wrong password using generic error message', async () => {
      const res = await request.post('/api/auth/login').send({
        email: 'bob@example.com',
        password: 'WrongPassword999!',
      });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(res.body.error.message).toBe('Invalid email or password');
    });

    it('should reject login with non-existent email using same generic error message', async () => {
      const res = await request.post('/api/auth/login').send({
        email: 'ghost@example.com',
        password: 'SomePassword123!',
      });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
      // Must not leak whether email exists
      expect(res.body.error.message).toBe('Invalid email or password');
    });
  });

  // ============================================================
  // Protected Route: GET /api/auth/me
  // ============================================================
  describe('GET /api/auth/me', () => {
    it('should return user profile when authenticated with cookie', async () => {
      // Register to get a real session
      const regRes = await request.post('/api/auth/register').send({
        email: 'claire@example.com',
        password: 'Password123!',
        name: 'Claire Vance',
      });

      const cookies = regRes.headers['set-cookie'];

      const meRes = await request.get('/api/auth/me').set('Cookie', cookies);

      expect(meRes.status).toBe(200);
      expect(meRes.body.user.email).toBe('claire@example.com');
      expect(meRes.body.user.name).toBe('Claire Vance');
    });

    it('should return user profile when authenticated with Authorization Bearer header', async () => {
      const regRes = await request.post('/api/auth/register').send({
        email: 'bearer@example.com',
        password: 'Password123!',
        name: 'Bearer User',
      });

      const cookies = regRes.headers['set-cookie'] as string[];
      const cookieStr = cookies.find((c) => c.startsWith('sessionId='));
      const sessionId = cookieStr?.split(';')[0]?.replace('sessionId=', '');

      const meRes = await request.get('/api/auth/me').set('Authorization', `Bearer ${sessionId}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body.user.email).toBe('bearer@example.com');
    });

    it('should reject unauthenticated request with 401 Unauthorized', async () => {
      const res = await request.get('/api/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject expired session with 401 Unauthorized', async () => {
      // Seed user and expired session
      const user: MockUser = {
        id: 'usr_expired_test',
        email: 'expired@example.com',
        name: 'Expired User',
        passwordHash: 'somehash',
        avatarUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockUsers.push(user);

      const expiredSession: MockSession = {
        id: 'sess_expired_123',
        userId: user.id,
        expiresAt: new Date(Date.now() - 1000 * 60 * 60), // Expired 1 hour ago
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
      };
      mockSessions.push(expiredSession);

      const res = await request
        .get('/api/auth/me')
        .set('Cookie', ['sessionId=sess_expired_123; Path=/; HttpOnly']);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  // ============================================================
  // Logout Tests
  // ============================================================
  describe('POST /api/auth/logout', () => {
    it('should invalidate session, clear cookie, and deny subsequent /me calls', async () => {
      // 1. Register
      const regRes = await request.post('/api/auth/register').send({
        email: 'logout_user@example.com',
        password: 'Password123!',
        name: 'Logout User',
      });

      const cookies = regRes.headers['set-cookie'];

      // 2. Call logout
      const logoutRes = await request.post('/api/auth/logout').set('Cookie', cookies);

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body).toHaveProperty('success', true);

      // Verify cookie cleared
      const logoutCookies = logoutRes.headers['set-cookie'];
      expect(logoutCookies).toBeDefined();

      // 3. Subsequent /me call with old cookie should fail with 401
      const meRes = await request.get('/api/auth/me').set('Cookie', cookies);

      expect(meRes.status).toBe(401);
      expect(meRes.body.error.code).toBe('UNAUTHORIZED');
    });
  });
});
