import { NextFunction, Request, Response } from 'express';

type AsyncFn = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

// Express doesn't forward rejected promises to error middleware by default.
// Wrap every async controller with this instead of repeating try/catch everywhere.
export const asyncHandler = (fn: AsyncFn) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res, next)).catch(next);
