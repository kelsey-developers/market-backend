import cors from 'cors';
import express from 'express';
import fs from 'fs';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { openApiDocument } from './docs/openapi';
import { getOpenApiServedPath, getUploadsPath } from './lib/paths';

// Deep clone so Swagger UI gets a plain object (avoids any serialization/ref issues)
const openApiSpec = JSON.parse(JSON.stringify(openApiDocument)) as typeof openApiDocument;

// In development, write spec to disk so you can verify it (openapi-served.json in project root)
if (process.env.NODE_ENV !== 'production') {
  try {
    const outPath = getOpenApiServedPath();
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
import { addonRequestsRouter } from './routes/addonRequests';
import { inventorySettingsRouter } from './routes/inventorySettings';
import { approvalRequestsRouter } from './routes/approvalRequests';
import { optionalAuth } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import { apiNotFound } from './middleware/notFound';
import { attachRequestContext } from './middleware/requestContext';
import { requestLogger } from './middleware/requestLogger';
import { roleGuard } from './middleware/roleGuard';
import { securityHeaders } from './middleware/securityHeaders';

export const app = express();

app.disable('x-powered-by');
app.use(attachRequestContext);
app.use(requestLogger);
app.use(securityHeaders);

app.use(
  cors({
    origin: env.CORS_ORIGIN ?? true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(getUploadsPath()));

// Populate req.auth for all API requests while still allowing public endpoints.
app.use('/api', optionalAuth);

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
app.use('/api/inventory-settings', inventorySettingsRouter);
app.use('/api/approval-requests', approvalRequestsRouter);

app.use('/api', apiNotFound);
app.use(errorHandler);
