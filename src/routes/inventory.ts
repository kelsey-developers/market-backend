import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';

export const inventoryRouter = Router();

const FRONTEND_ITEM_CATEGORIES = [
  'Cleaning',
  'Hygiene',
  'Food & Drinks',
  'Cooking',
  'Appliances',
  'furniture',
  'Cloth & Sheets',
  'Kitchenware',
  'Other',
] as const;

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

const allocationSchema = z.object({
  productId: z.string().trim().min(1),
  unitId: z.string().trim().min(1),
  quantityDelta: z.number().int(),
  minStock: z.number().int().min(0).optional(),
});

const createWarehouseSchema = z.object({
  name:     z.string().min(1),
  location: z.string().optional(),
  code:     z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

const updateWarehouseSchema = z.object({
  name:     z.string().min(1).optional(),
  location: z.string().optional(),
  code:     z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

const toNumber = (value: Prisma.Decimal | number | string | null | undefined) => {
  if (value == null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatDate = (value: Date | null | undefined) => {
  if (!value) return '';
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDateTime = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  const hour = String(value.getHours()).padStart(2, '0');
  const minute = String(value.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
};

const formatDateLabel = (value: Date | null | undefined) => {
  if (!value) return '—';
  return value.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });
};

const toPurchaseOrderStatus = (
  status: 'DRAFT' | 'ORDERED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED'
) => {
  if (status === 'PARTIALLY_RECEIVED') return 'partially-received';
  if (status === 'RECEIVED') return 'received';
  if (status === 'CANCELLED') return 'cancelled';
  return 'pending';
};

const toFrontendItemType = (type: 'consumable' | 'non_consumable') =>
  type === 'consumable' ? 'consumable' : 'reusable';

const toFrontendCategory = (categoryName?: string | null) => {
  if (!categoryName) return 'Other';
  if (FRONTEND_ITEM_CATEGORIES.includes(categoryName as (typeof FRONTEND_ITEM_CATEGORIES)[number])) {
    return categoryName;
  }
  const normalized = categoryName.toLowerCase();
  if (normalized.includes('clean')) return 'Cleaning';
  if (normalized.includes('hygiene') || normalized.includes('toilet')) return 'Hygiene';
  if (normalized.includes('food') || normalized.includes('drink') || normalized.includes('pantry')) return 'Food & Drinks';
  if (normalized.includes('cook') || normalized.includes('kitchen')) return 'Kitchenware';
  if (normalized.includes('furniture')) return 'furniture';
  if (normalized.includes('sheet') || normalized.includes('cloth') || normalized.includes('linen')) return 'Cloth & Sheets';
  if (normalized.includes('appliance')) return 'Appliances';
  return 'Other';
};

const toFrontendReferenceType = (
  referenceType: 'purchase_order' | 'goods_receipt' | 'booking' | 'damage_incident' | 'manual_adjustment' | null
) => {
  if (referenceType === 'booking') return 'BOOKING';
  if (referenceType === 'damage_incident') return 'DAMAGE';
  if (referenceType === 'manual_adjustment') return 'MANUAL';
  return 'PO';
};

const UNIT_META_PREFIX = '__meta__:';

type UnitStatus = 'available' | 'unavailable' | 'maintenance';

type UnitMeta = {
  status?: UnitStatus;
  isFeatured?: boolean;
};

const parseUnitMetaFromLabel = (value?: string | null): UnitMeta => {
  if (!value || !value.startsWith(UNIT_META_PREFIX)) return {};

  try {
    const parsed = JSON.parse(value.slice(UNIT_META_PREFIX.length)) as UnitMeta;
    return {
      status: parsed.status,
      isFeatured: parsed.isFeatured,
    };
  } catch {
    return {};
  }
};

const resolveUnitStatus = (isActive: boolean, metaStatus?: UnitStatus): UnitStatus => {
  if (metaStatus === 'maintenance') return 'maintenance';
  return isActive ? 'available' : 'unavailable';
};

const parseCity = (location?: string | null): string | undefined => {
  if (!location) return undefined;
  const parts = location
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return undefined;

  const cityToken = parts.find((part) => /city/i.test(part));
  return cityToken ?? parts[parts.length - 1];
};

const EXTERNAL_SYNC_PROPERTY_NAME = 'External Sync Units';

const ensureLocalUnitForAllocation = async (
  tx: Prisma.TransactionClient,
  unitId: string
) => {
  const existing = await tx.unit.findUnique({
    where: { id: unitId },
    select: { id: true },
  });
  if (existing) return;

  let property = await tx.property.findFirst({
    where: {
      name: EXTERNAL_SYNC_PROPERTY_NAME,
    },
    select: { id: true },
  });

  if (!property) {
    property = await tx.property.create({
      data: {
        name: EXTERNAL_SYNC_PROPERTY_NAME,
        type: 'apartment',
        location: 'Synced from external Auth Service',
        isActive: true,
      },
      select: { id: true },
    });
  }

  const codeSuffix = unitId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'unit';
  await tx.unit.create({
    data: {
      id: unitId,
      propertyId: property.id,
      code: `ext-${codeSuffix}`,
      name: `External Unit ${unitId.slice(0, 8)}`,
      capacity: 1,
      nightlyRate: new Prisma.Decimal(0),
      isActive: true,
    },
  });
};

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

/**
 * GET /api/inventory/warehouses
 * List all warehouses with their active status.
 * Query: ?activeOnly=true   — return only active warehouses
 */
inventoryRouter.get('/warehouses', async (req, res, next) => {
  try {
    const activeOnly = req.query.activeOnly === 'true';
    const warehouses = await prisma.warehouse.findMany({
      where: activeOnly ? ({ isActive: true } as Prisma.WarehouseWhereInput) : undefined,
      orderBy: { name: 'asc' },
    });

    res.json({
      warehouses: warehouses.map((w) => ({
        id:        w.id,
        code:      w.code,
        name:      w.name,
        location:  w.location ?? '',
        isActive:  (w as unknown as { isActive: boolean }).isActive,
        createdAt: formatDate(w.createdAt),
        updatedAt: formatDate(w.updatedAt),
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/inventory/warehouses/:id/status
 * Toggle or set the active status of a warehouse.
 * Body: { isActive: boolean }
 */
inventoryRouter.patch('/warehouses/:id/status', async (req, res, next) => {
  try {
    const warehouseId = String(req.params.id || '').trim();
    if (!warehouseId) {
      return res.status(400).json({ message: 'Warehouse ID is required.' });
    }

    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);

    const existing = await prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { id: true, isActive: true } as unknown as Prisma.WarehouseSelect,
    });
    if (!existing) {
      return res.status(404).json({ message: 'Warehouse not found.' });
    }

    const updated = await prisma.warehouse.update({
      where: { id: warehouseId },
      data: { isActive } as unknown as Prisma.WarehouseUpdateInput,
    });

    res.json({
      warehouse: {
        id:       updated.id,
        code:     updated.code,
        name:     updated.name,
        location: updated.location ?? '',
        isActive: (updated as unknown as { isActive: boolean }).isActive,
      },
    });
  } catch (error) {
    next(error);
  }
});

inventoryRouter.post('/warehouses', async (req, res, next) => {
  try {
    const payload = createWarehouseSchema.parse(req.body);
    const baseCode =
      payload.code?.trim() ||
      payload.name
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 20) ||
      `WH-${Date.now()}`;

    // Ensure code uniqueness with a simple suffix strategy when necessary.
    let code = baseCode;
    let suffix = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const existing = await prisma.warehouse.findUnique({ where: { code } });
      if (!existing) break;
      suffix += 1;
      code = `${baseCode}-${suffix}`;
    }

    const created = await prisma.warehouse.create({
      data: {
        code,
        name: payload.name.trim(),
        location: payload.location?.trim() || null,
        isActive: payload.isActive ?? true,
      } as unknown as Prisma.WarehouseCreateInput,
    });

    res.status(201).json({
      warehouse: {
        id: created.id,
        code: created.code,
        name: created.name,
        location: created.location ?? '',
        isActive: (created as unknown as { isActive: boolean }).isActive,
        createdAt: formatDate(created.createdAt),
      },
    });
  } catch (error) {
    next(error);
  }
});

inventoryRouter.patch('/warehouses/:id', async (req, res, next) => {
  try {
    const payload = updateWarehouseSchema.parse(req.body);
    if (Object.keys(payload).length === 0) {
      res.status(400).json({ message: 'At least one field is required.' });
      return;
    }

    const warehouseId = String(req.params.id || '').trim();
    if (!warehouseId) {
      res.status(400).json({ message: 'Warehouse ID is required.' });
      return;
    }

    const nextCode = payload.code?.trim()
      ? payload.code.trim().toUpperCase().replace(/[^A-Z0-9_-]+/g, '')
      : undefined;

    const updated = await prisma.warehouse.update({
      where: { id: warehouseId },
      data: {
        ...(payload.name !== undefined ? { name: payload.name.trim() } : {}),
        ...(payload.location !== undefined ? { location: payload.location.trim() || null } : {}),
        ...(nextCode ? { code: nextCode } : {}),
        ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
      } as unknown as Prisma.WarehouseUpdateInput,
    });

    res.json({
      warehouse: {
        id: updated.id,
        code: updated.code,
        name: updated.name,
        location: updated.location ?? '',
        isActive: (updated as unknown as { isActive: boolean }).isActive,
        createdAt: formatDate(updated.createdAt),
      },
    });
  } catch (error) {
    next(error);
  }
});

inventoryRouter.get('/dataset', async (req, res, next) => {
  try {
    const [warehouses, suppliers, products, balances, units, allocations, movements] = await Promise.all([
      prisma.warehouse.findMany({ orderBy: { name: 'asc' } }),
      prisma.supplier.findMany({ orderBy: { createdAt: 'desc' } }),
      prisma.product.findMany({
        include: { supplier: true, category: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.inventoryBalance.findMany({
        include: { product: true, warehouse: true },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.unit.findMany({
        include: { property: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.inventoryAllocation.findMany({
        include: { product: { include: { category: true } }, unit: true },
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.stockMovement.findMany({
        include: {
          booking: {
            select: {
              id: true,
              unit: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    let purchaseOrders: any[];
    try {
      purchaseOrders = await prisma.purchaseOrder.findMany({
        include: {
          supplier: true,
          items: {
            include: { product: true },
            orderBy: { id: 'asc' },
          },
          receipts: {
            include: {
              warehouse: true,
              receivedByUser: true,
              attachments: {
                orderBy: { createdAt: 'asc' },
              },
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
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      const attachmentTableMissing =
        message.includes('goodsreceiptattachment') &&
        (message.includes('does not exist') || message.includes('doesn\'t exist'));

      if (!attachmentTableMissing) {
        throw error;
      }

      purchaseOrders = await prisma.purchaseOrder.findMany({
        include: {
          supplier: true,
          items: {
            include: { product: true },
            orderBy: { id: 'asc' },
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
        orderBy: { createdAt: 'desc' },
      });
    }

    const unitById = new Map(units.map((unit) => [unit.id, unit]));
    const productById = new Map(products.map((product) => [product.id, product]));
    const warehouseById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse]));

    const movementSnapshots = new Map<string, { before: number; after: number }>();
    const chronologicalMovements = [...movements].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );
    const quantityTracker = new Map<string, number>();

    chronologicalMovements.forEach((movement) => {
      const key = `${movement.productId}:${movement.warehouseId}`;
      const before = quantityTracker.get(key) ?? 0;
      let after = before;

      if (movement.type === 'IN') {
        after = before + movement.quantity;
      } else if (movement.type === 'OUT') {
        after = before - movement.quantity;
      } else {
        after = movement.quantity;
      }

      quantityTracker.set(key, after);
      movementSnapshots.set(movement.id, { before, after });
    });

    const stockMovements = movements.map((movement) => {
      const product = productById.get(movement.productId);
      const unitFromReference = movement.referenceId ? unitById.get(movement.referenceId) : undefined;
      const unitFromBooking = movement.booking?.unit;
      const resolvedUnit = unitFromReference ?? unitFromBooking;
      const snapshot = movementSnapshots.get(movement.id) ?? { before: 0, after: 0 };
      const movementType =
        movement.type === 'OUT'
          ? 'out'
          : movement.type === 'IN'
            ? 'in'
            : snapshot.after >= snapshot.before
              ? 'in'
              : 'out';

      return {
        id: movement.id,
        productId: movement.productId,
        warehouseId: movement.warehouseId,
        unitId: resolvedUnit?.id,
        unitName: resolvedUnit?.name,
        type: movementType,
        quantity: movement.quantity,
        reason: movement.reason ?? undefined,
        referenceType: toFrontendReferenceType(movement.referenceType),
        referenceId: movement.referenceId ?? undefined,
        beforeQuantity: snapshot.before,
        afterQuantity: snapshot.after,
        movementDateTime: formatDateTime(movement.createdAt),
        notes: movement.notes ?? undefined,
        createdAt: formatDateTime(movement.createdAt),
        createdBy: 'System',
        productName: product?.name ?? 'Unknown Product',
      };
    });

    const warehouseDirectoryData = warehouses.map((warehouse) => {
      const inventoryBalances = balances
        .filter((entry) => entry.warehouseId === warehouse.id)
        .map((entry) => ({
          productId: entry.productId,
          productName: entry.product.name,
          quantity: entry.quantity,
          reorderLevel: entry.product.reorderLevel,
        }));

      const warehouseMovements = stockMovements
        .filter((movement) => movement.warehouseId === warehouse.id)
        .slice(0, 250)
        .map((movement) => {
          const noteText = `${movement.reason ?? ''} ${movement.notes ?? ''}`.toLowerCase();
          const rowType = noteText.includes('transfer')
            ? 'transfer'
            : movement.type;
          const [date = '', time = '00:00'] = movement.movementDateTime.split(' ');

          return {
            id: movement.id,
            type: rowType,
            productName: movement.productName,
            quantity: movement.quantity,
            date,
            time,
            recordedAt: movement.movementDateTime,
            note: movement.reason || movement.notes || 'N/A',
          };
        });

      return {
        id: warehouse.id,
        code: warehouse.code,
        name: warehouse.name,
        location: warehouse.location ?? '',
        description: `Code: ${warehouse.code}`,
        isActive: (warehouse as unknown as { isActive: boolean }).isActive,
        inventoryBalances,
        stockMovements: warehouseMovements,
      };
    });

    const purchaseOrdersPayload = purchaseOrders.map((purchaseOrder: any) => {
      const orderedAt = purchaseOrder.orderedAt ?? purchaseOrder.createdAt;
      const expectedFromNotesMatch = purchaseOrder.notes?.match(/Expected:\s*(\d{4}-\d{2}-\d{2})/i);
      const expectedFromNotes = expectedFromNotesMatch ? new Date(`${expectedFromNotesMatch[1]}T00:00:00`) : null;
      const expectedDelivery = expectedFromNotes ?? purchaseOrder.receivedAt ?? new Date(orderedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
      const totalAmount = purchaseOrder.items.reduce(
        (sum: number, item: any) => sum + toNumber(item.unitCost) * item.quantityOrdered,
        0
      );

      return {
        id: purchaseOrder.id,
        supplierId: purchaseOrder.supplierId,
        orderDate: formatDate(orderedAt),
        expectedDelivery: formatDate(expectedDelivery),
        status: toPurchaseOrderStatus(purchaseOrder.status),
        totalAmount,
        createdAt: formatDate(purchaseOrder.createdAt),
      };
    });

    const purchaseOrderLines = purchaseOrders.flatMap((purchaseOrder: any) =>
      purchaseOrder.items.map((item: any) => ({
        id: item.id,
        poId: purchaseOrder.id,
        productId: item.productId,
        quantity: item.quantityOrdered,
        unitPrice: toNumber(item.unitCost),
        receivedQuantity: item.quantityReceived,
      }))
    );

    const goodsReceipts = purchaseOrders.flatMap((purchaseOrder: any) =>
      purchaseOrder.receipts.map((receipt: any) => ({
        id: receipt.id,
        poId: purchaseOrder.id,
        receiptNo: receipt.receiptNo,
        warehouseId: receipt.warehouseId,
        warehouse: receipt.warehouse.name,
        receivedBy: receipt.receivedByUser?.name ?? 'System',
        receivedAt: formatDateLabel(receipt.receivedAt),
        notes: receipt.notes ?? '',
        items: receipt.items.map((item: any) => ({
          poItemId: item.purchaseOrderItemId,
          description: item.product.name,
          qtyReceived: item.quantityReceived,
          unit: item.product.unit,
          unitCost: toNumber(item.unitCost),
        })),
        evidenceImages: ((receipt as unknown as { attachments?: Array<{ fileUrl: string }> }).attachments ?? [])
          .map((attachment) => attachment.fileUrl),
      }))
    );

    // Business rule: products are considered inventory-visible only after at least one goods receipt.
    const receivedProductIds = new Set<string>();
    purchaseOrders.forEach((purchaseOrder: any) => {
      purchaseOrder.receipts.forEach((receipt: any) => {
        receipt.items.forEach((item: any) => {
          if (item?.productId) receivedProductIds.add(item.productId);
        });
      });
    });

    const latestPurchaseOrderByProductId = new Map<
      string,
      { purchaseOrder: (typeof purchaseOrdersPayload)[number]; unitCost: number }
    >();

    purchaseOrders.forEach((purchaseOrder: any, index) => {
      const payloadOrder = purchaseOrdersPayload[index];
      purchaseOrder.items.forEach((item: any) => {
        if (!latestPurchaseOrderByProductId.has(item.productId)) {
          latestPurchaseOrderByProductId.set(item.productId, {
            purchaseOrder: payloadOrder,
            unitCost: toNumber(item.unitCost),
          });
        }
      });
    });

    const inventoryVisibleProducts = products.filter((product) => receivedProductIds.has(product.id));

    const replenishmentItems = inventoryVisibleProducts.map((product) => {
      const productBalances = balances.filter((entry) => entry.productId === product.id);
      const totalStock = productBalances.reduce((sum, entry) => sum + entry.quantity, 0);
      const primaryBalance = [...productBalances].sort((a, b) => b.quantity - a.quantity)[0];
      const primaryWarehouse = primaryBalance
        ? warehouseById.get(primaryBalance.warehouseId)
        : warehouses[0];
      const latestPO = latestPurchaseOrderByProductId.get(product.id);
      const unitCost = latestPO?.unitCost ?? 0;
      const productMovements = stockMovements
        .filter((movement) => movement.productId === product.id)
        .map(({ productName: _ignoredProductName, ...movement }) => movement);

      return {
        id: product.id,
        sku: product.sku,
        name: product.name,
        type: toFrontendItemType(product.itemType),
        category: toFrontendCategory(product.category?.name),
        unit: product.unit,
        currentStock: totalStock,
        minStock: product.reorderLevel,
        shortfall: Math.max(0, product.reorderLevel - totalStock),
        isLowStock: totalStock < product.reorderLevel,
        unitCost,
        totalValue: totalStock * unitCost,
        warehouseId: primaryWarehouse?.id ?? '',
        warehouseName: primaryWarehouse?.name ?? 'Unassigned',
        isActive: product.isActive,
        createdAt: formatDate(product.createdAt),
        updatedAt: formatDate(product.updatedAt),
        lastModifiedBy: 'System',
        currentsupplierId: product.supplierId ?? '',
        supplierName: product.supplier?.name ?? '',
        stockMovements: productMovements,
        damageAdjustments: [],
        lastPurchaseOrder: latestPO?.purchaseOrder,
        auditNotes: '',
      };
    });

    const includeMeta =
      String(req.query.includeMeta ?? '').toLowerCase() === 'true' ||
      String(req.query.v ?? '') === '2';

    const inventoryVisibleAllocations = allocations.filter((allocation) =>
      receivedProductIds.has(allocation.productId)
    );

    const unitsPayload = units.map((unit) => {
      const itemCount = inventoryVisibleAllocations.filter((allocation) => allocation.unitId === unit.id).length;
      const location = unit.property?.location ?? unit.property?.address ?? '';

      const basePayload = {
        id: unit.id,
        name: unit.name,
        type: unit.property?.type ?? 'unit',
        location,
        itemCount,
        imageUrl: '/heroimage.png',
      };

      if (!includeMeta) return basePayload;

      const meta = parseUnitMetaFromLabel(unit.floorLabel);
      const status = resolveUnitStatus(unit.isActive, meta.status);
      const city = parseCity(location);

      return {
        ...basePayload,
        code: unit.code,
        city,
        status,
        isFeatured: meta.isFeatured === true,
      };
    });

    const unitItems = inventoryVisibleAllocations.map((allocation) => ({
      id: allocation.id,
      productId: allocation.productId,
      name: allocation.product.name,
      type: toFrontendItemType(allocation.product.itemType),
      category: toFrontendCategory(allocation.product.category?.name),
      unit: allocation.product.unit,
      currentStock: allocation.quantity,
      minStock: allocation.minStock,
      assignedToUnit: allocation.unitId,
    }));

    const unitStockMovements = stockMovements
      .filter((movement) => movement.type === 'out' && movement.unitId)
      .map((movement) => {
        const [recordedDate = '', recordedTime = '00:00'] = movement.movementDateTime.split(' ');
        const warehouse = warehouseById.get(movement.warehouseId || '');
        return {
          id: movement.id,
          productId: movement.productId,
          productName: movement.productName,
          unitId: movement.unitId,
          unitName: movement.unitName ?? 'Unknown Unit',
          sourceWarehouseId: movement.warehouseId || '',
          sourceWarehouseName: warehouse?.name ?? 'Unknown Warehouse',
          quantity: movement.quantity,
          reason: movement.reason || movement.notes || 'N/A',
          referenceType: movement.referenceType,
          referenceId: movement.referenceId,
          beforeQuantity: movement.beforeQuantity ?? 0,
          afterQuantity: movement.afterQuantity ?? 0,
          recordedAt: movement.movementDateTime,
          recordedDate,
          recordedTime,
          createdBy: movement.createdBy || 'System',
        };
      });

    const supplierDirectoryData = suppliers.map((supplier) => {
      const supplierPurchaseOrders = purchaseOrdersPayload.filter(
        (purchaseOrder) => purchaseOrder.supplierId === supplier.id && purchaseOrder.status !== 'cancelled'
      );
      const latestOrder = supplierPurchaseOrders[0];

      return {
        id: supplier.id,
        name: supplier.name,
        contactName: supplier.contactName ?? '',
        email: supplier.contactEmail ?? '',
        phone: supplier.contactPhone ?? '',
        address: supplier.address ?? '',
        isActive: true,
        activePOs: supplierPurchaseOrders.length,
        lastOrderDate: latestOrder ? formatDateLabel(new Date(latestOrder.orderDate)) : '—',
        notes: '',
        createdAt: formatDateLabel(supplier.createdAt),
      };
    });

    const dashboardSummary = {
      totalItems: replenishmentItems.length,
      totalStocks: replenishmentItems.reduce((sum, item) => sum + item.currentStock, 0),
      lowStockCount: replenishmentItems.filter((item) => item.currentStock < item.minStock).length,
      replenishmentNeeded: replenishmentItems.reduce(
        (sum, item) => sum + Math.max(0, item.minStock - item.currentStock),
        0
      ),
    };

    const warehousesPayload = warehouses.map((warehouse) => ({
      id: warehouse.id,
      name: warehouse.name,
      location: warehouse.location ?? '',
      capacity: undefined,
      createdAt: formatDate(warehouse.createdAt),
    }));

    const suppliersPayload = suppliers.map((supplier) => ({
      id: supplier.id,
      name: supplier.name,
      email: supplier.contactEmail ?? '',
      phone: supplier.contactPhone ?? '',
      address: supplier.address ?? '',
      createdAt: formatDate(supplier.createdAt),
      updatedAt: formatDate(supplier.updatedAt),
    }));

    res.json({
      dashboardSummary,
      warehouses: warehousesPayload,
      suppliers: suppliersPayload,
      supplierDirectoryData,
      warehouseDirectoryData,
      stockMovements: stockMovements.map(({ productName: _ignoredProductName, ...movement }) => movement),
      damageAdjustments: [],
      purchaseOrders: purchaseOrdersPayload,
      purchaseOrderLines,
      goodsReceipts,
      replenishmentItems,
      units: unitsPayload,
      unitItems,
      unitStockMovements,
    });
  } catch (error) {
    next(error);
  }
});

inventoryRouter.post('/allocations', async (req, res, next) => {
  try {
    const payload = allocationSchema.parse(req.body);

    const runAllocationWrite = async () =>
      prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await ensureLocalUnitForAllocation(tx, payload.unitId);

        const existing = await tx.inventoryAllocation.findUnique({
          where: {
            productId_unitId: {
              productId: payload.productId,
              unitId: payload.unitId,
            },
          },
        });

        const currentQuantity = existing?.quantity ?? 0;
        const nextQuantity = currentQuantity + payload.quantityDelta;
        if (nextQuantity < 0) {
          throw new Error('Insufficient allocation quantity for this unit');
        }

        return tx.inventoryAllocation.upsert({
          where: {
            productId_unitId: {
              productId: payload.productId,
              unitId: payload.unitId,
            },
          },
          update: {
            quantity: nextQuantity,
            ...(payload.minStock !== undefined ? { minStock: payload.minStock } : {}),
          },
          create: {
            productId: payload.productId,
            unitId: payload.unitId,
            quantity: Math.max(0, payload.quantityDelta),
            minStock: payload.minStock ?? 0,
          },
        });
      });

    let allocation;
    try {
      allocation = await runAllocationWrite();
    } catch (error) {
      // Retry once after explicitly materializing the unit outside transaction.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
          await ensureLocalUnitForAllocation(tx, payload.unitId);
        });
        allocation = await runAllocationWrite();
      } else {
        throw error;
      }
    }

    res.status(201).json(allocation);
  } catch (error) {
    next(error);
  }
});

inventoryRouter.post('/movements', async (req, res, next) => {
  try {
    const payload = movementSchema.parse(req.body);

    // Enforce inventory process:
    // - Stock-in must come from PO receiving (Goods Receipt) OR an internal transfer-in record.
    // - No manual stock-in adjustments through this endpoint.
    if (payload.type === 'IN') {
      const isGoodsReceipt =
        payload.referenceType === 'goods_receipt' && Boolean(payload.goodsReceiptId);

      const isTransferIn =
        payload.referenceType === 'manual_adjustment' &&
        typeof payload.notes === 'string' &&
        payload.notes.toLowerCase().includes('transfer from');

      if (!isGoodsReceipt && !isTransferIn) {
        throw new Error(
          'Stock-in is only allowed via Goods Receipt (PO receiving) or warehouse transfer.'
        );
      }
    }

    // Inventory balance adjustments should be explicitly marked.
    if (payload.type === 'ADJUSTMENT' && payload.referenceType !== 'manual_adjustment') {
      throw new Error('Adjustments must be logged as manual_adjustment.');
    }

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
      const nextQty = payload.type === 'ADJUSTMENT' ? payload.quantity : existingQty + delta;

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
