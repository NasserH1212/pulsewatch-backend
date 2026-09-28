import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

// Validates req.body against a zod schema before the controller runs.
// On success req.body is replaced with the parsed data: trimmed, normalized,
// and stripped of any fields the schema doesn't list (so a client can't sneak
// in things like createdById or role). On failure it answers 400 with one
// entry per problem, which a frontend can show next to each form field.
export const validateBody =
  (schema: z.ZodType) => (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: result.error.issues.map((issue) => ({
          field: issue.path.join('.') || '(body)',
          message: issue.message,
        })),
      });
    }

    req.body = result.data;
    next();
  };

// Same idea as validateBody, but for req.query (e.g. ?period=7d).
export const validateQuery =
  (schema: z.ZodType) => (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: result.error.issues.map((issue) => ({
          field: issue.path.join('.') || '(query)',
          message: issue.message,
        })),
      });
    }

    req.query = result.data as typeof req.query;
    next();
  };
