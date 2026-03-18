import type { Request, Response } from 'express';

export function apiNotFound(req: Request, res: Response): void {
  res.status(404).json({
    message: 'API route not found',
    requestId: req.requestId,
  });
}
