import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { findUserIdByEmail, resolveRequestUserId } from '../lib/requestUser';
import { optionalAuth } from '../middleware/auth';

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

const updatePurchaseOrderSchema = z.object({
  supplierId: z.string().min(1).optional(),
  status: z.enum(['DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED']).optional(),
  expectedDelivery: z.string().optional(),
  notes: z.string().optional(),
});

const mapPurchaseOrderCreatorFields = <T extends {
  createdByUserId?: string | null;
  createdByUser?: { name?: string | null; email?: string | null } | null;
}>(purchaseOrder: T) => ({
  ...purchaseOrder,
  createdByName: purchaseOrder.createdByUser?.name ?? null,
  createdByEmail: purchaseOrder.createdByUser?.email ?? null,
  createdBy:
    purchaseOrder.createdByUser?.name ??
    purchaseOrder.createdByUser?.email ??
    purchaseOrder.createdByUserId ??
    'System',
});

const resolveGoodsReceiptReceiverUserId = async (
  req: Parameters<typeof resolveRequestUserId>[0],
  providedReceiver?: string
): Promise<string | undefined> => {
  const resolvedFromAuth = await resolveRequestUserId(req);
  if (resolvedFromAuth) return resolvedFromAuth;

  const requestEmail = req.auth?.email?.trim();
  if (requestEmail) {
    const existingByEmail = await findUserIdByEmail(requestEmail);
    return existingByEmail ?? undefined;
  }

  const candidate = providedReceiver?.trim();
  if (!candidate) return undefined;

  // Accept direct email input and map it to an internal FK user.
  if (candidate.includes('@')) {
    const existingByEmail = await findUserIdByEmail(candidate);
    return existingByEmail ?? undefined;
  }

  const existing = await prisma.user.findUnique({
    where: { id: candidate },
    select: { id: true },
  });

  return existing?.id;
};

purchaseOrdersRouter.get('/', async (_req, res, next) => {
  try {
    const rows = await prisma.purchaseOrder.findMany({
      include: {
        supplier: true,
        createdByUser: true,
        items: {
          include: {
            product: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const purchaseOrders = rows.map((purchaseOrder) => mapPurchaseOrderCreatorFields(purchaseOrder));

    res.json({ purchaseOrders });
  } catch (error) {
    next(error);
  }
});

purchaseOrdersRouter.get('/:id', async (req, res, next) => {
  try {
    const purchaseOrder = await prisma.purchaseOrder.findUnique({
      where: { id: req.params.id },
      include: {
        supplier: true,
        createdByUser: true,
        items: {
          include: {
            product: true,
          },
        },
        receipts: {
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
          orderBy: { receivedAt: 'desc' },
        },
      },
    });

    if (!purchaseOrder) {
      res.status(404).json({ message: 'Purchase order not found' });
      return;
    }

    res.json(mapPurchaseOrderCreatorFields(purchaseOrder));
  } catch (error) {
    next(error);
  }
});

purchaseOrdersRouter.post('/', optionalAuth, async (req, res, next) => {
  try {
    const payload = createPurchaseOrderSchema.parse(req.body);
    const poNumber = `PO-${Date.now()}`;
    const createdByUserId = await resolveGoodsReceiptReceiverUserId(req);

    const purchaseOrder = await prisma.purchaseOrder.create({
      data: {
        poNumber,
        supplierId: payload.supplierId,
        createdByUserId: createdByUserId ?? undefined,
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
        supplier: true,
        createdByUser: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    res.status(201).json(mapPurchaseOrderCreatorFields(purchaseOrder));
  } catch (error) {
    next(error);
  }
});

purchaseOrdersRouter.post('/:id/receive', optionalAuth, async (req, res, next) => {
  try {
    const payload = receivePurchaseOrderSchema.parse(req.body);
    const purchaseOrderId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const receivedByUserId = await resolveGoodsReceiptReceiverUserId(req, payload.receivedByUserId);

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
          receivedByUserId,
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
          createdByUser: true,
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

      if (!createdReceipt) {
        throw new Error('Goods receipt not found after create');
      }

      return {
        purchaseOrder: mapPurchaseOrderCreatorFields(updatedPurchaseOrder),
        goodsReceipt: {
          ...createdReceipt,
          receivedBy:
            createdReceipt.receivedByUser?.name ??
            createdReceipt.receivedByUser?.email ??
            createdReceipt.receivedByUserId ??
            undefined,
        },
      };
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

purchaseOrdersRouter.patch('/:id', async (req, res, next) => {
  try {
    const payload = updatePurchaseOrderSchema.parse(req.body);

    const current = await prisma.purchaseOrder.findUnique({
      where: { id: req.params.id },
      select: {
        notes: true,
      },
    });

    if (!current) {
      throw new Error('Purchase order not found');
    }

    const notesFragments: string[] = [];
    if (payload.notes) notesFragments.push(payload.notes);
    if (payload.expectedDelivery) {
      notesFragments.push(`Expected: ${payload.expectedDelivery}`);
    }

    const updated = await prisma.purchaseOrder.update({
      where: { id: req.params.id },
      data: {
        ...(payload.supplierId ? { supplierId: payload.supplierId } : {}),
        ...(payload.status ? { status: payload.status } : {}),
        ...(notesFragments.length > 0
          ? { notes: [current.notes ?? '', ...notesFragments].filter(Boolean).join(' | ') }
          : {}),
      },
      include: {
        supplier: true,
        createdByUser: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    res.json(mapPurchaseOrderCreatorFields(updated));
  } catch (error) {
    next(error);
  }
});
