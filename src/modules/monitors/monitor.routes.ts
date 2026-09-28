import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { validateBody } from '../../lib/validate';
import { requireAuth } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/rbac.middleware';
import * as monitorController from './monitor.controller';
import { createMonitorSchema } from './monitor.schemas';

export const monitorRouter = Router();

monitorRouter.use(requireAuth);

monitorRouter.get('/', asyncHandler(monitorController.list));
monitorRouter.get('/:id', asyncHandler(monitorController.getOne));
monitorRouter.post(
  '/',
  requireRole('ADMIN'),
  validateBody(createMonitorSchema),
  asyncHandler(monitorController.create),
);
monitorRouter.delete('/:id', requireRole('ADMIN'), asyncHandler(monitorController.remove));
