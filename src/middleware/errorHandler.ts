import { Prisma } from '@prisma/client';
import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

const inferStatusCodeFromMessage = (message: string): number => {
  const normalized = message.toLowerCase();
  if (normalized.includes('not found')) return 404;
  if (normalized.includes('unauthorized')) return 401;
  if (normalized.includes('forbidden')) return 403;
  if (normalized.includes('conflict') || normalized.includes('duplicate')) return 409;
  if (
    normalized.includes('validation') ||
    normalized.includes('invalid') ||
    normalized.includes('required') ||
    normalized.includes('must') ||
    normalized.includes('insufficient')
  ) {
    return 400;
  }
  return 500;
};

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({
      message: 'Validation error',
      errors: error.issues,
      requestId: req.requestId,
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      res.status(409).json({
        message: 'Unique constraint violation',
        meta: error.meta,
        requestId: req.requestId,
      });
      return;
    }

    if (error.code === 'P2025') {
      res.status(404).json({
        message: 'Requested record was not found',
        requestId: req.requestId,
      });
      return;
    }

    if (error.code === 'P2003') {
      res.status(409).json({
        message: 'Foreign key constraint violation',
        meta: error.meta,
        requestId: req.requestId,
      });
      return;
    }
  }

  if (error instanceof Error) {
    const statusCode = inferStatusCodeFromMessage(error.message);
    if (statusCode >= 500) {
      console.error(`[${req.requestId ?? '-'}] Unhandled error`, error);
    }

    res.status(statusCode).json({
      message: error.message || 'Internal server error',
      requestId: req.requestId,
    });
    return;
  }

  console.error(`[${req.requestId ?? '-'}] Non-Error exception`, error);
  res.status(500).json({
    message: 'Internal server error',
    requestId: req.requestId,
  });
};
