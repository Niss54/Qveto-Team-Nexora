import type { Request, Response, NextFunction } from 'express';
import { authService, type UserDTO } from '../services/auth.service.js';
import { AppError } from './errorHandler.js';

export interface AuthenticatedRequest extends Request {
  user: UserDTO;
  sessionId: string;
}

/**
 * Middleware that requires a valid, unexpired session.
 * Checks sessionId in HttpOnly cookie or Authorization Bearer header.
 * Attaches req.user and req.sessionId to the request object.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    let sessionId: string | undefined = req.cookies?.sessionId;

    // Fallback: check Authorization header (e.g. Bearer <sessionId>)
    const authHeader = req.headers.authorization;
    if (!sessionId && authHeader?.startsWith('Bearer ')) {
      sessionId = authHeader.substring(7).trim();
    }

    if (!sessionId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required. No active session found.');
    }

    const user = await authService.validateSession(sessionId);
    if (!user) {
      throw new AppError(
        401,
        'UNAUTHORIZED',
        'Session is invalid or has expired. Please sign in again.',
      );
    }

    (req as AuthenticatedRequest).user = user;
    (req as AuthenticatedRequest).sessionId = sessionId;

    next();
  } catch (error) {
    next(error);
  }
}
