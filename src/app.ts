import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { env } from './config/env';
import { healthRouter } from './routes/health';
import { inventoryRouter } from './routes/inventory';
import { productsRouter } from './routes/products';
import { purchaseOrdersRouter } from './routes/purchaseOrders';
import { suppliersRouter } from './routes/suppliers';

dotenv.config();

export const app = express();

app.use(
  cors({
    origin: env.CORS_ORIGIN ?? true,
  })
);
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({ message: 'market-backend is running' });
});

app.use('/health', healthRouter);
app.use('/api/products', productsRouter);
app.use('/api/suppliers', suppliersRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/purchase-orders', purchaseOrdersRouter);

app.use('/api/*', (_req, res) => {
  res.status(404).json({ message: 'API route not found' });
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    return res.status(400).json({
      message: 'Validation error',
      errors: error.issues,
    });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      return res.status(409).json({ message: 'Unique constraint violation', meta: error.meta });
    }

    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Requested record was not found' });
    }
  }

  if (error instanceof Error) {
    return res.status(400).json({ message: error.message });
  }

  return res.status(500).json({ message: 'Internal server error' });
});
