import { Response } from 'express';
import { AuthedRequest } from '../../middlewares/auth.middleware';
import { CreateMonitorInput, StatsQuery, UpdateMonitorInput } from './monitor.schemas';
import * as monitorService from './monitor.service';

// The body was validated by createMonitorSchema (see monitor.routes.ts).
export const create = async (req: AuthedRequest, res: Response) => {
  const monitor = await monitorService.createMonitor(req.body as CreateMonitorInput, req.user!.userId);
  res.status(201).json(monitor);
};

export const list = async (_req: AuthedRequest, res: Response) => {
  res.json(await monitorService.listMonitors());
};

export const getOne = async (req: AuthedRequest, res: Response) => {
  const monitor = await monitorService.getMonitorWithHistory(req.params.id);
  if (!monitor) return res.status(404).json({ error: 'Monitor not found' });
  res.json(monitor);
};

export const remove = async (req: AuthedRequest, res: Response) => {
  await monitorService.deleteMonitor(req.params.id);
  res.status(204).send();
};

// The query was validated and defaulted by statsQuerySchema (see monitor.routes.ts).
export const getStats = async (req: AuthedRequest, res: Response) => {
  const { period } = req.query as unknown as StatsQuery;
  res.json(await monitorService.getMonitorStats(req.params.id, period));
};

export const update = async (req: AuthedRequest, res: Response) => {
  const monitor = await monitorService.updateMonitor(req.params.id, req.body as UpdateMonitorInput);
  res.json(monitor);
};
