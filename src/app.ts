import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import { ZodError } from 'zod';
import { healthRouter } from './routes/health';
import { inventoryRouter } from './routes/inventory';
import { productsRouter } from './routes/products';
import { purchaseOrdersRouter } from './routes/purchaseOrders';
import { suppliersRouter } from './routes/suppliers';

dotenv.config();

export const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({ message: 'market-backend is running' });
});

app.use('/health', healthRouter);
app.use('/api/products', productsRouter);
app.use('/api/suppliers', suppliersRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/purchase-orders', purchaseOrdersRouter);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    return res.status(400).json({
      message: 'Validation error',
      errors: error.issues,
    });
  }

  if (error instanceof Error) {
    return res.status(400).json({ message: error.message });
  }

  return res.status(500).json({ message: 'Internal server error' });
});
