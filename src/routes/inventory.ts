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
  referenceType: z
    .enum(['purchase_order', 'goods_receipt', 'booking', 'damage_incident', 'manual_adjustment'])
    .optional(),
  referenceId: z.string().optional(),
  purchaseOrderId: z.string().optional(),
  goodsReceiptId: z.string().optional(),
  bookingId: z.string().optional(),
  damageIncidentId: z.string().optional(),
  notes: z.string().optional(),
}).superRefine((payload, ctx) => {
  if (payload.referenceType === 'purchase_order' && !payload.purchaseOrderId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'purchaseOrderId is required when referenceType is purchase_order',
      path: ['purchaseOrderId'],
    });
  }

  if (payload.referenceType === 'goods_receipt' && !payload.goodsReceiptId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'goodsReceiptId is required when referenceType is goods_receipt',
      path: ['goodsReceiptId'],
    });
  }

  if (payload.referenceType === 'booking' && !payload.bookingId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'bookingId is required when referenceType is booking',
      path: ['bookingId'],
    });
  }

  if (payload.referenceType === 'damage_incident' && !payload.damageIncidentId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'damageIncidentId is required when referenceType is damage_incident',
      path: ['damageIncidentId'],
    });
  }

  const hasTypedReferenceId =
    !!payload.purchaseOrderId ||
    !!payload.goodsReceiptId ||
    !!payload.bookingId ||
    !!payload.damageIncidentId;

  if (!payload.referenceType && hasTypedReferenceId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'referenceType is required when relation reference IDs are supplied',
      path: ['referenceType'],
    });
  }
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
          purchaseOrderId: payload.purchaseOrderId,
          goodsReceiptId: payload.goodsReceiptId,
          bookingId: payload.bookingId,
          damageIncidentId: payload.damageIncidentId,
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
