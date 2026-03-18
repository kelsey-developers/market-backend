import type { NextFunction, Request, Response } from 'express';

/**
 * Lightweight access logger with latency and request ID.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const requestId = req.requestId ?? '-';
    const message = `[${requestId}] ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs.toFixed(1)}ms`;

    if (res.statusCode >= 500) {
      console.error(message);
      return;
    }

    if (res.statusCode >= 400) {
      console.warn(message);
      return;
    }

    if (process.env.NODE_ENV !== 'test') {
      console.log(message);
    }
  });

  next();
}
