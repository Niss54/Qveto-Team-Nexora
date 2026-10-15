import { v4 as uuidv4 } from 'uuid';
import type { Request, Response, NextFunction } from 'express';

// Extend Express Request type to include id
export interface RequestWithId extends Request {
  id: string;
}

/**
 * Adds a unique request ID to each incoming request.
 * Available as req.id for logging and error tracking.
 */
export function requestIdMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();
  (req as RequestWithId).id = requestId;
  next();
}
