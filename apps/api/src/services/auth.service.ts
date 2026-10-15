import bcrypt from 'bcryptjs';
import type { RegisterInput, LoginInput } from '@qveto/shared';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { env } from '../config/env.js';

export interface UserDTO {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  createdAt: string;
}

export class AuthService {
  /**
   * Register a new user and create an active session
   */
  async register(input: RegisterInput): Promise<{ user: UserDTO; sessionId: string }> {
    const existing = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });

    if (existing) {
      throw new AppError(409, 'CONFLICT', 'An account with this email already exists');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(input.password, salt);

    const user = await prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        name: input.name.trim(),
        passwordHash,
      },
    });

    const session = await prisma.session.create({
      data: {
        userId: user.id,
        expiresAt: new Date(Date.now() + env.SESSION_MAX_AGE_MS),
      },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt.toISOString(),
      },
      sessionId: session.id,
    };
  }

  /**
   * Authenticate user credentials and create a session
   */
  async login(input: LoginInput): Promise<{ user: UserDTO; sessionId: string }> {
    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });

    // Use generic error message to prevent account enumeration
    if (!user) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    const isValidPassword = await bcrypt.compare(input.password, user.passwordHash);
    if (!isValidPassword) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    const session = await prisma.session.create({
      data: {
        userId: user.id,
        expiresAt: new Date(Date.now() + env.SESSION_MAX_AGE_MS),
      },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt.toISOString(),
      },
      sessionId: session.id,
    };
  }

  /**
   * Invalidate a session
   */
  async logout(sessionId: string): Promise<void> {
    try {
      await prisma.session.delete({
        where: { id: sessionId },
      });
    } catch {
      // Ignore if session was already deleted or doesn't exist
    }
  }

  /**
   * Validate a session by ID and return associated user
   */
  async validateSession(sessionId: string): Promise<UserDTO | null> {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });

    if (!session) {
      return null;
    }

    // Check expiration
    if (session.expiresAt <= new Date()) {
      // Cleanup expired session asynchronously
      prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
      return null;
    }

    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      avatarUrl: session.user.avatarUrl,
      createdAt: session.user.createdAt.toISOString(),
    };
  }
}

export const authService = new AuthService();
