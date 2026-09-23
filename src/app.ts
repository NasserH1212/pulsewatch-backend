import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Express } from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { errorHandler } from './middlewares/errorHandler';
import { router } from './routes';

export const createApp = (): Express => {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.clientUrl, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api', router);

  app.use(errorHandler); // must be registered last
  return app;
};
