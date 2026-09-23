import { NextFunction, Request, Response } from 'express';

interface AppError extends Error {
  status?: number;
}

// Keep this last in the middleware chain. Controllers throw { status, message }
// (or use asyncHandler to forward a thrown error here) instead of formatting
// responses themselves — one place decides the JSON shape of every error.
export const errorHandler = (err: AppError, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || 500;
  if (status === 500) console.error(err);

  res.status(status).json({ error: err.message || 'Internal server error' });
};
