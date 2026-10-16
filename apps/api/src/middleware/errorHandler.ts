import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import type { RequestWithId } from './requestId.js';

/**
 * Standard API error response shape.
 */
export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

/**
 * Custom application error class.
 */
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * Global error handler middleware.
 * Catches all errors and returns consistent JSON error responses.
 * Never leaks stack traces or secrets to clients.
 */
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  const requestId = (req as RequestWithId).id;

  // Zod validation errors
  if (err instanceof ZodError) {
    const response: ApiError = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: err.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
        requestId,
      },
    };
    res.status(400).json(response);
    return;
  }

  // Custom application errors
  if (err instanceof AppError) {
    const response: ApiError = {
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        requestId,
      },
    };
    res.status(err.statusCode).json(response);
    return;
  }

  // Unknown errors - don't leak internals
  console.error(`[ERROR] ${requestId}:`, err);
  const response: ApiError = {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      requestId,
    },
  };
  res.status(500).json(response);
}

/**
 * 404 handler for unmatched routes.
 */
export function notFoundHandler(req: Request, res: Response): void {
  const requestId = (req as RequestWithId).id;
  const response: ApiError = {
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found`,
      requestId,
    },
  };
  res.status(404).json(response);
}
