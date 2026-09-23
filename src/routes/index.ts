import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes';
import { monitorRouter } from '../modules/monitors/monitor.routes';

export const router = Router();

router.use('/auth', authRouter);
router.use('/monitors', monitorRouter);
