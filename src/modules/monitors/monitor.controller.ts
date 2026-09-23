import { Response } from 'express';
import { AuthedRequest } from '../../middlewares/auth.middleware';
import * as monitorService from './monitor.service';

export const create = async (req: AuthedRequest, res: Response) => {
  const { name, type, target, intervalSeconds } = req.body;
  if (!name || !type || !target) {
    return res.status(400).json({ error: 'name, type and target are required' });
  }
  if (!['HTTP', 'PING', 'PORT'].includes(type)) {
    return res.status(400).json({ error: 'type must be HTTP, PING or PORT' });
  }

  const monitor = await monitorService.createMonitor({
    name,
    type,
    target,
    intervalSeconds,
    createdById: req.user!.userId,
  });
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
