import { Router, type Request, type Response, type NextFunction } from 'express';
import { registerSchema, loginSchema } from '@qveto/shared';
import { authService } from '../services/auth.service.js';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { env } from '../config/env.js';

const authRouter: ReturnType<typeof Router> = Router();

const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: env.SESSION_MAX_AGE_MS,
  path: '/',
};

/**
 * POST /api/auth/register
 * Registers a new user, hashes password, creates session, and sets HttpOnly cookie.
 */
authRouter.post(
  '/register',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = registerSchema.parse(req.body);
      const result = await authService.register(validated);

      res.cookie('sessionId', result.sessionId, cookieOptions);
      res.status(201).json({
        user: result.user,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/auth/login
 * Validates credentials, creates a session, and sets HttpOnly cookie.
 */
authRouter.post(
  '/login',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const validated = loginSchema.parse(req.body);
      const result = await authService.login(validated);

      res.cookie('sessionId', result.sessionId, cookieOptions);
      res.status(200).json({
        user: result.user,
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * POST /api/auth/logout
 * Destroys current session and clears the cookie.
 */
authRouter.post(
  '/logout',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sessionId =
        req.cookies?.sessionId ||
        (req.headers.authorization?.startsWith('Bearer ')
          ? req.headers.authorization.substring(7).trim()
          : undefined);

      if (sessionId) {
        await authService.logout(sessionId);
      }

      res.clearCookie('sessionId', {
        ...cookieOptions,
        maxAge: 0,
      });

      res.status(200).json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * GET /api/auth/me
 * Returns current authenticated user profile.
 */
authRouter.get('/me', requireAuth, (req: Request, res: Response): void => {
  const authReq = req as AuthenticatedRequest;
  res.status(200).json({
    user: authReq.user,
  });
});

export { authRouter };
