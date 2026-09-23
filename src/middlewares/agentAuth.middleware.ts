import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';

// For a future "push" endpoint where an external agent (not this server's own
// scheduler) reports a check result. The agent signs its JSON body with the
// shared AGENT_SECRET and sends the result in the X-Signature header.
// Using timingSafeEqual avoids leaking timing information about the secret.
export const verifyAgentSignature = (req: Request, res: Response, next: NextFunction) => {
  const signature = req.headers['x-signature'];
  if (!signature || typeof signature !== 'string') {
    return res.status(401).json({ error: 'Missing X-Signature header' });
  }

  const expected = crypto
    .createHmac('sha256', env.agentSecret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'hex');
  const receivedBuf = Buffer.from(signature, 'hex');

  const isValid =
    expectedBuf.length === receivedBuf.length && crypto.timingSafeEqual(expectedBuf, receivedBuf);

  if (!isValid) return res.status(401).json({ error: 'Invalid signature' });
  next();
};
