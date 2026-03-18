import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      requestStartTimeMs?: number;
    }
  }
}

/**
 * Attach a stable request ID to every request for easier tracing in logs and errors.
 */
export function attachRequestContext(req: Request, res: Response, next: NextFunction): void {
  const incomingRequestId = req.header('x-request-id')?.trim();
  const requestId = incomingRequestId || randomUUID();

  req.requestId = requestId;
  req.requestStartTimeMs = Date.now();
  res.setHeader('x-request-id', requestId);

  next();
}
