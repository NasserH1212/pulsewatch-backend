import { NextFunction, Request, Response } from 'express';
import { isPrismaError } from '../lib/prisma';

interface AppError {
  status?: number;
  message?: string;
  type?: string; // set by express.json() for body parsing errors
}

// Keep this last in the middleware chain. Controllers throw { status, message }
// (or use asyncHandler to forward a thrown error here) instead of formatting
// responses themselves — one place decides the JSON shape of every error.
export const errorHandler = (err: AppError, _req: Request, res: Response, _next: NextFunction) => {
  let status = typeof err?.status === 'number' ? err.status : 500;
  let message = err?.message;

  // Fallbacks for Prisma errors a service didn't handle itself.
  if (isPrismaError(err, 'P2025')) {
    status = 404;
    message = 'Not found';
  } else if (isPrismaError(err, 'P2002')) {
    status = 409;
    message = 'Already exists';
  } else if (err?.type === 'entity.parse.failed') {
    message = 'Malformed JSON body';
  }

  if (status >= 500) {
    // Full details go to the server log only. The client gets a generic
    // message, so database errors, file paths or stack traces never leak.
    console.error(err);
    message = 'Internal server error';
  }

  res.status(status).json({ error: message || 'Request failed' });
};

// Answers unknown routes with JSON, like every other error, instead of
// Express's default HTML "Cannot GET /x" page.
export const notFoundHandler = (_req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
};
