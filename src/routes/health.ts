import { Router } from 'express';
import { checkAuthServiceHealth } from '../lib/authServiceProxy';
import { prisma } from '../lib/prisma';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'market-backend' });
});

healthRouter.get('/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ready', database: 'ok' });
  } catch (_error) {
    res.status(503).json({ status: 'not-ready', database: 'unreachable' });
  }
});

healthRouter.get('/external-sync', async (_req, res) => {
  const check = await checkAuthServiceHealth();
  if (check.ok) {
    return res.json({
      status: 'ok',
      external: 'reachable',
      baseUrl: check.baseUrl,
      statusEndpoint: check.statusEndpoint,
      statusCode: check.statusCode,
      statusText: check.statusText,
    });
  }

  return res.status(503).json({
    status: 'not-ready',
    external: 'unreachable',
    baseUrl: check.baseUrl,
    statusEndpoint: check.statusEndpoint,
    statusCode: check.statusCode ?? null,
    statusText: check.statusText ?? null,
  });
});
