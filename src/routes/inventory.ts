import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

export const inventoryRouter = Router();

const movementSchema = z.object({
  productId: z.string().min(1),
  warehouseId: z.string().min(1),
  type: z.enum(['IN', 'OUT', 'ADJUSTMENT']),
  quantity: z.number().int().positive(),
  reason: z.string().optional(),
  referenceType: z.string().optional(),
  referenceId: z.string().optional(),
  notes: z.string().optional(),
});

inventoryRouter.get('/', async (_req, res, next) => {
  try {
    const balances = await prisma.inventoryBalance.findMany({
      include: {
        product: {
          select: {
            id: true,
            sku: true,
            name: true,
            unit: true,
            reorderLevel: true,
          },
        },
        warehouse: {
          select: {
            id: true,
            code: true,
            name: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const inventory = balances.map((entry) => ({
      ...entry,
      isLowStock: entry.quantity <= entry.product.reorderLevel,
    }));

    res.json({ inventory });
  } catch (error) {
    next(error);
  }
});

inventoryRouter.post('/movements', async (req, res, next) => {
  try {
    const payload = movementSchema.parse(req.body);

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const current = await tx.inventoryBalance.findUnique({
        where: {
          productId_warehouseId: {
            productId: payload.productId,
            warehouseId: payload.warehouseId,
          },
        },
      });

      const existingQty = current?.quantity ?? 0;

      const delta = payload.type === 'OUT' ? -payload.quantity : payload.quantity;

      const nextQty =
        payload.type === 'ADJUSTMENT'
          ? payload.quantity
          : existingQty + delta;

      if (nextQty < 0) {
        throw new Error('Insufficient stock for OUT movement');
      }

      const balance = await tx.inventoryBalance.upsert({
        where: {
          productId_warehouseId: {
            productId: payload.productId,
            warehouseId: payload.warehouseId,
          },
        },
        update: {
          quantity: nextQty,
        },
        create: {
          productId: payload.productId,
          warehouseId: payload.warehouseId,
          quantity: nextQty,
        },
      });

      const movement = await tx.stockMovement.create({
        data: {
          productId: payload.productId,
          warehouseId: payload.warehouseId,
          type: payload.type,
          quantity: payload.quantity,
          reason: payload.reason,
          referenceType: payload.referenceType,
          referenceId: payload.referenceId,
          notes: payload.notes,
        },
      });

      return { movement, balance };
    });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});
