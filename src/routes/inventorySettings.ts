import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

export const inventorySettingsRouter = Router();

const STOCK_OUT_REASONS_KEY = 'stock_out_reasons';

const defaultReasons: Record<string, boolean> = {
  'Room preparation': true,
  'Guest turnover': true,
  'Damage replacement': true,
  'Manual adjustment': true,
  'Disposal and expired': true,
  'Inter-warehouse transfer': true,
};

/**
 * GET /api/inventory-settings/stock-out-reasons
 * Returns allowed stock-out reasons as { [label]: enabled }
 */
inventorySettingsRouter.get('/stock-out-reasons', async (_req, res, next) => {
  try {
    const row = await prisma.inventorySetting.findUnique({
      where: { key: STOCK_OUT_REASONS_KEY },
    });
    if (!row) {
      return res.json(defaultReasons);
    }
    const parsed = JSON.parse(row.value) as Record<string, boolean>;
    return res.json(parsed);
  } catch (error) {
    next(error);
  }
});

const patchStockOutReasonsSchema = z.object({
  reasons: z.record(z.string(), z.boolean()),
});

/**
 * PATCH /api/inventory-settings/stock-out-reasons
 * Body: { reasons: { [label]: enabled } }
 */
inventorySettingsRouter.patch('/stock-out-reasons', async (req, res, next) => {
  try {
    const { reasons } = patchStockOutReasonsSchema.parse(req.body);
    const value = JSON.stringify(reasons);
    await prisma.inventorySetting.upsert({
      where: { key: STOCK_OUT_REASONS_KEY },
      update: { value },
      create: { key: STOCK_OUT_REASONS_KEY, value },
    });
    return res.json(reasons);
  } catch (error) {
    next(error);
  }
});
