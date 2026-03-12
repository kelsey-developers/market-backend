import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { env } from './config/env';
import { openApiDocument } from './docs/openapi';

// Deep clone so Swagger UI gets a plain object (avoids any serialization/ref issues)
const openApiSpec = JSON.parse(JSON.stringify(openApiDocument)) as typeof openApiDocument;

// In development, write spec to disk so you can verify it (openapi-served.json in project root)
if (process.env.NODE_ENV !== 'production') {
  try {
    const outPath = path.join(process.cwd(), 'openapi-served.json');
    fs.writeFileSync(outPath, JSON.stringify(openApiSpec, null, 2));
  } catch {
    // ignore
  }
}

import { healthRouter } from './routes/health';
import { inventoryRouter } from './routes/inventory';
import { goodsReceiptsRouter } from './routes/goodsReceipts';
import { productCategoriesRouter } from './routes/productCategories';
import { productsRouter } from './routes/products';
import { purchaseOrdersRouter } from './routes/purchaseOrders';
import { suppliersRouter } from './routes/suppliers';
import { unitsRouter } from './routes/units';
import { bookingsRouter } from './routes/bookings';
import { damageIncidentsRouter } from './routes/damageIncidents';
import { chargeTypesRouter } from './routes/chargeTypes';
import { userRolesRouter } from './routes/userRoles';
import { addonRequestsRouter } from './routes/addonRequests';
import { inventorySettingsRouter } from './routes/inventorySettings';
import { approvalRequestsRouter } from './routes/approvalRequests';
import { roleGuard } from './middleware/roleGuard';

dotenv.config();

export const app = express();

app.use(
  cors({
    origin: env.CORS_ORIGIN ?? true,
  })
);
app.use(express.json());
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Apply role guard for /api/* — inventory, finance, housekeeping are restricted to their paths
app.use('/api', roleGuard);

app.get('/', (_req, res) => {
  res.json({ message: 'market-backend is running' });
});
app.get('/openapi.json', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.json(openApiSpec);
});
// Debug: verify full spec (use /spec-meta — paths under /api or /docs are handled by other routes)
app.get('/spec-meta', (_req, res) => {
  const paths = Object.keys(openApiSpec.paths || {});
  res.json({
    pathCount: paths.length,
    descriptionStarts: (openApiSpec.info?.description || '').slice(0, 60),
    tags: openApiSpec.tags?.map((t) => t.name) || [],
  });
});
// Swagger UI: load spec from URL so browser always fetches current /openapi.json
app.use(
  '/docs',
  swaggerUi.serve,
  swaggerUi.setup(null, {
    swaggerOptions: {
      url: '/openapi.json',
      docExpansion: 'list',
    },
  })
);

app.use('/health', healthRouter);
app.use('/api/product-categories', productCategoriesRouter);
app.use('/api/products', productsRouter);
app.use('/api/suppliers', suppliersRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/purchase-orders', purchaseOrdersRouter);
app.use('/api/goods-receipts', goodsReceiptsRouter);
app.use('/api/damage-incidents', damageIncidentsRouter);
app.use('/api/charge-types', chargeTypesRouter);
app.use('/api/addon-requests', addonRequestsRouter);
app.use('/api/units', unitsRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/user-roles', userRolesRouter);
app.use('/api/inventory-settings', inventorySettingsRouter);
app.use('/api/approval-requests', approvalRequestsRouter);

app.use('/api', (_req, res) => {
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
