import { Router } from 'express';
import { asyncHandler } from '../../lib/asyncHandler';
import { validateBody, validateQuery } from '../../lib/validate';
import { requireAuth } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/rbac.middleware';
import * as monitorController from './monitor.controller';
import { createMonitorSchema, statsQuerySchema, updateMonitorSchema } from './monitor.schemas';

export const monitorRouter = Router();

monitorRouter.use(requireAuth);

monitorRouter.get('/', asyncHandler(monitorController.list));
monitorRouter.get('/:id', asyncHandler(monitorController.getOne));
monitorRouter.get('/:id/stats', validateQuery(statsQuerySchema), asyncHandler(monitorController.getStats));
monitorRouter.post(
  '/',
  requireRole('ADMIN'),
  validateBody(createMonitorSchema),
  asyncHandler(monitorController.create),
);
monitorRouter.patch(
  '/:id',
  requireRole('ADMIN'),
  validateBody(updateMonitorSchema),
  asyncHandler(monitorController.update),
);
monitorRouter.delete('/:id', requireRole('ADMIN'), asyncHandler(monitorController.remove));
