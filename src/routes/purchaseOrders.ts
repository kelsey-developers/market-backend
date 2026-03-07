import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

export const purchaseOrdersRouter = Router();

const createPurchaseOrderSchema = z.object({
  supplierId: z.string().min(1),
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantityOrdered: z.number().int().positive(),
        unitCost: z.number().positive().optional(),
      })
    )
    .min(1),
});

const receivePurchaseOrderSchema = z.object({
  warehouseId: z.string().min(1),
  receivedByUserId: z.string().optional(),
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantityReceived: z.number().int().positive(),
      })
    )
    .min(1),
});

purchaseOrdersRouter.get('/', async (_req, res, next) => {
  try {
    const purchaseOrders = await prisma.purchaseOrder.findMany({
      include: {
        supplier: true,
        items: {
          include: {
            product: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ purchaseOrders });
  } catch (error) {
    next(error);
  }
});

purchaseOrdersRouter.post('/', async (req, res, next) => {
  try {
    const payload = createPurchaseOrderSchema.parse(req.body);
    const poNumber = `PO-${Date.now()}`;

    const purchaseOrder = await prisma.purchaseOrder.create({
      data: {
        poNumber,
        supplierId: payload.supplierId,
        status: 'ORDERED',
        orderedAt: new Date(),
        notes: payload.notes,
        items: {
          create: payload.items.map((item) => ({
            productId: item.productId,
            quantityOrdered: item.quantityOrdered,
            unitCost: item.unitCost,
          })),
        },
      },
      include: {
        items: true,
      },
    });

    res.status(201).json(purchaseOrder);
  } catch (error) {
    next(error);
  }
});

purchaseOrdersRouter.post('/:id/receive', async (req, res, next) => {
  try {
    const payload = receivePurchaseOrderSchema.parse(req.body);
    const purchaseOrderId = req.params.id;

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const purchaseOrder = await tx.purchaseOrder.findUnique({
        where: { id: purchaseOrderId },
        include: { items: true },
      });

      if (!purchaseOrder) {
        throw new Error('Purchase order not found');
      }

      const goodsReceipt = await tx.goodsReceipt.create({
        data: {
          receiptNo: `GR-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          purchaseOrderId,
          warehouseId: payload.warehouseId,
          receivedByUserId: payload.receivedByUserId,
          notes: payload.notes,
        },
      });

      for (const item of payload.items) {
        const poItem = purchaseOrder.items.find((entry) => entry.productId === item.productId);
        if (!poItem) {
          throw new Error(`Product ${item.productId} not found in purchase order`);
        }

        await tx.purchaseOrderItem.update({
          where: {
            purchaseOrderId_productId: {
              purchaseOrderId,
              productId: item.productId,
            },
          },
          data: {
            quantityReceived: {
              increment: item.quantityReceived,
            },
          },
        });

        await tx.goodsReceiptItem.create({
          data: {
            goodsReceiptId: goodsReceipt.id,
            purchaseOrderItemId: poItem.id,
            productId: item.productId,
            quantityReceived: item.quantityReceived,
            unitCost: poItem.unitCost,
          },
        });

        const currentBalance = await tx.inventoryBalance.findUnique({
          where: {
            productId_warehouseId: {
              productId: item.productId,
              warehouseId: payload.warehouseId,
            },
          },
        });

        await tx.inventoryBalance.upsert({
          where: {
            productId_warehouseId: {
              productId: item.productId,
              warehouseId: payload.warehouseId,
            },
          },
          update: {
            quantity: (currentBalance?.quantity ?? 0) + item.quantityReceived,
          },
          create: {
            productId: item.productId,
            warehouseId: payload.warehouseId,
            quantity: item.quantityReceived,
          },
        });

        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            warehouseId: payload.warehouseId,
            type: 'IN',
            quantity: item.quantityReceived,
            referenceType: 'goods_receipt',
            referenceId: goodsReceipt.id,
            purchaseOrderId,
            goodsReceiptId: goodsReceipt.id,
            reason: 'Purchase order receiving',
          },
        });
      }

      const refreshedPo = await tx.purchaseOrder.findUnique({
        where: { id: purchaseOrderId },
        include: { items: true },
      });

      const fullyReceived =
        refreshedPo?.items.every((item) => item.quantityReceived >= item.quantityOrdered) ?? false;

      const status = fullyReceived
        ? 'RECEIVED'
        : 'PARTIALLY_RECEIVED';

      const updatedPurchaseOrder = await tx.purchaseOrder.update({
        where: { id: purchaseOrderId },
        data: {
          status,
          receivedAt: new Date(),
        },
        include: {
          items: true,
          supplier: true,
        },
      });

      const createdReceipt = await tx.goodsReceipt.findUnique({
        where: { id: goodsReceipt.id },
        include: {
          warehouse: true,
          receivedByUser: true,
          items: {
            include: {
              product: true,
              purchaseOrderItem: true,
            },
          },
        },
      });

      return {
        purchaseOrder: updatedPurchaseOrder,
        goodsReceipt: createdReceipt,
      };
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});
