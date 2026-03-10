import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const warehouse = await prisma.warehouse.upsert({
    where: { code: 'MAIN' },
    update: {},
    create: {
      code: 'MAIN',
      name: 'Main Warehouse',
      location: 'HQ',
    },
  });

  const secondaryWarehouse = await prisma.warehouse.upsert({
    where: { code: 'UTIL' },
    update: {},
    create: {
      code: 'UTIL',
      name: 'Utility Warehouse',
      location: 'Service Floor',
    },
  });

  const supplier =
    (await prisma.supplier.findFirst({ where: { name: 'Default Supplier Inc.' } })) ??
    (await prisma.supplier.create({
      data: {
        name: 'Default Supplier Inc.',
        contactName: 'Admin',
        contactEmail: 'supplier@example.com',
        contactPhone: '09171234567',
        address: 'Metro Manila',
      },
    }));

  const [pantryCategory, cleaningCategory, furnitureCategory] = await Promise.all([
    prisma.inventoryCategory.upsert({
      where: { code: 'PANTRY_SUPPLIES' },
      update: {
        name: 'Pantry Supplies',
        description: 'Consumables such as food packs and pantry staples.',
      },
      create: {
        code: 'PANTRY_SUPPLIES',
        name: 'Pantry Supplies',
        description: 'Consumables such as food packs and pantry staples.',
      },
    }),
    prisma.inventoryCategory.upsert({
      where: { code: 'CLEANING_SUPPLIES' },
      update: {
        name: 'Cleaning Supplies',
        description: 'Consumables for housekeeping and sanitation.',
      },
      create: {
        code: 'CLEANING_SUPPLIES',
        name: 'Cleaning Supplies',
        description: 'Consumables for housekeeping and sanitation.',
      },
    }),
    prisma.inventoryCategory.upsert({
      where: { code: 'FURNITURE' },
      update: {
        name: 'Furniture',
        description: 'Non-consumable furniture and durable fixtures.',
      },
      create: {
        code: 'FURNITURE',
        name: 'Furniture',
        description: 'Non-consumable furniture and durable fixtures.',
      },
    }),
  ]);

  const products = await Promise.all([
    prisma.product.upsert({
      where: { sku: 'SKU-RICE-5KG' },
      update: {
        name: 'Rice 5kg',
        unit: 'bag',
        itemType: 'consumable',
        reorderLevel: 20,
        supplierId: supplier.id,
        categoryId: pantryCategory.id,
      },
      create: {
        sku: 'SKU-RICE-5KG',
        name: 'Rice 5kg',
        unit: 'bag',
        itemType: 'consumable',
        reorderLevel: 20,
        supplierId: supplier.id,
        categoryId: pantryCategory.id,
      },
    }),
    prisma.product.upsert({
      where: { sku: 'SKU-NOODLES-BOX' },
      update: {
        name: 'Instant Noodles Box',
        unit: 'box',
        itemType: 'consumable',
        reorderLevel: 15,
        supplierId: supplier.id,
        categoryId: pantryCategory.id,
      },
      create: {
        sku: 'SKU-NOODLES-BOX',
        name: 'Instant Noodles Box',
        unit: 'box',
        itemType: 'consumable',
        reorderLevel: 15,
        supplierId: supplier.id,
        categoryId: pantryCategory.id,
      },
    }),
    prisma.product.upsert({
      where: { sku: 'SKU-PAPER-TOWEL' },
      update: {
        name: 'Paper Towels',
        unit: 'roll',
        itemType: 'consumable',
        reorderLevel: 30,
        supplierId: supplier.id,
        categoryId: cleaningCategory.id,
      },
      create: {
        sku: 'SKU-PAPER-TOWEL',
        name: 'Paper Towels',
        unit: 'roll',
        itemType: 'consumable',
        reorderLevel: 30,
        supplierId: supplier.id,
        categoryId: cleaningCategory.id,
      },
    }),
    prisma.product.upsert({
      where: { sku: 'SKU-LAUNDRY-DET' },
      update: {
        name: 'Laundry Detergent',
        unit: 'bottle',
        itemType: 'consumable',
        reorderLevel: 18,
        supplierId: supplier.id,
        categoryId: cleaningCategory.id,
      },
      create: {
        sku: 'SKU-LAUNDRY-DET',
        name: 'Laundry Detergent',
        unit: 'bottle',
        itemType: 'consumable',
        reorderLevel: 18,
        supplierId: supplier.id,
        categoryId: cleaningCategory.id,
      },
    }),
    prisma.product.upsert({
      where: { sku: 'SKU-FOLDING-CHAIR' },
      update: {
        name: 'Folding Chair',
        unit: 'piece',
        itemType: 'non_consumable',
        reorderLevel: 4,
        supplierId: supplier.id,
        categoryId: furnitureCategory.id,
      },
      create: {
        sku: 'SKU-FOLDING-CHAIR',
        name: 'Folding Chair',
        unit: 'piece',
        itemType: 'non_consumable',
        reorderLevel: 4,
        supplierId: supplier.id,
        categoryId: furnitureCategory.id,
      },
    }),
  ]);

  await Promise.all(
    products.map((product, index) =>
      prisma.inventoryBalance.upsert({
        where: {
          productId_warehouseId: {
            productId: product.id,
            warehouseId: warehouse.id,
          },
        },
        update: {},
        create: {
          productId: product.id,
          warehouseId: index % 2 === 0 ? warehouse.id : secondaryWarehouse.id,
          quantity: [100, 80, 60, 24, 8][index] ?? 10,
        },
      })
    )
  );

  const seedPurchaseOrder = await prisma.purchaseOrder.upsert({
    where: { poNumber: 'PO-SEED-001' },
    update: {
      supplierId: supplier.id,
      status: 'PARTIALLY_RECEIVED',
      orderedAt: new Date('2025-03-01T09:00:00.000Z'),
      notes: 'Expected: 2025-03-08 | Seeded purchase order for inventory module',
    },
    create: {
      poNumber: 'PO-SEED-001',
      supplierId: supplier.id,
      status: 'PARTIALLY_RECEIVED',
      orderedAt: new Date('2025-03-01T09:00:00.000Z'),
      notes: 'Expected: 2025-03-08 | Seeded purchase order for inventory module',
    },
  });

  const seedPoItems = await Promise.all([
    prisma.purchaseOrderItem.upsert({
      where: {
        purchaseOrderId_productId: {
          purchaseOrderId: seedPurchaseOrder.id,
          productId: products[0].id,
        },
      },
      update: {
        quantityOrdered: 40,
        quantityReceived: 20,
        unitCost: 250,
      },
      create: {
        purchaseOrderId: seedPurchaseOrder.id,
        productId: products[0].id,
        quantityOrdered: 40,
        quantityReceived: 20,
        unitCost: 250,
      },
    }),
    prisma.purchaseOrderItem.upsert({
      where: {
        purchaseOrderId_productId: {
          purchaseOrderId: seedPurchaseOrder.id,
          productId: products[2].id,
        },
      },
      update: {
        quantityOrdered: 60,
        quantityReceived: 60,
        unitCost: 85,
      },
      create: {
        purchaseOrderId: seedPurchaseOrder.id,
        productId: products[2].id,
        quantityOrdered: 60,
        quantityReceived: 60,
        unitCost: 85,
      },
    }),
  ]);

  const seedReceipt = await prisma.goodsReceipt.upsert({
    where: { receiptNo: 'GR-SEED-001' },
    update: {
      purchaseOrderId: seedPurchaseOrder.id,
      warehouseId: warehouse.id,
      notes: 'Partial receiving for seeded PO',
      receivedAt: new Date('2025-03-04T10:00:00.000Z'),
    },
    create: {
      receiptNo: 'GR-SEED-001',
      purchaseOrderId: seedPurchaseOrder.id,
      warehouseId: warehouse.id,
      notes: 'Partial receiving for seeded PO',
      receivedAt: new Date('2025-03-04T10:00:00.000Z'),
    },
  });

  await Promise.all([
    prisma.goodsReceiptItem.upsert({
      where: {
        goodsReceiptId_purchaseOrderItemId: {
          goodsReceiptId: seedReceipt.id,
          purchaseOrderItemId: seedPoItems[0].id,
        },
      },
      update: {
        productId: products[0].id,
        quantityReceived: 20,
        unitCost: 250,
      },
      create: {
        goodsReceiptId: seedReceipt.id,
        purchaseOrderItemId: seedPoItems[0].id,
        productId: products[0].id,
        quantityReceived: 20,
        unitCost: 250,
      },
    }),
    prisma.goodsReceiptItem.upsert({
      where: {
        goodsReceiptId_purchaseOrderItemId: {
          goodsReceiptId: seedReceipt.id,
          purchaseOrderItemId: seedPoItems[1].id,
        },
      },
      update: {
        productId: products[2].id,
        quantityReceived: 60,
        unitCost: 85,
      },
      create: {
        goodsReceiptId: seedReceipt.id,
        purchaseOrderItemId: seedPoItems[1].id,
        productId: products[2].id,
        quantityReceived: 60,
        unitCost: 85,
      },
    }),
  ]);

  await Promise.all([
    prisma.stockMovement.upsert({
      where: { id: 'seed-stock-movement-in-1' },
      update: {
        productId: products[0].id,
        warehouseId: warehouse.id,
        type: 'IN',
        quantity: 20,
        reason: 'Purchase order receiving',
        referenceType: 'goods_receipt',
        referenceId: seedReceipt.id,
        purchaseOrderId: seedPurchaseOrder.id,
        goodsReceiptId: seedReceipt.id,
        notes: 'Seeded inbound movement',
      },
      create: {
        id: 'seed-stock-movement-in-1',
        productId: products[0].id,
        warehouseId: warehouse.id,
        type: 'IN',
        quantity: 20,
        reason: 'Purchase order receiving',
        referenceType: 'goods_receipt',
        referenceId: seedReceipt.id,
        purchaseOrderId: seedPurchaseOrder.id,
        goodsReceiptId: seedReceipt.id,
        notes: 'Seeded inbound movement',
      },
    }),
    prisma.stockMovement.upsert({
      where: { id: 'seed-stock-movement-out-1' },
      update: {
        productId: products[2].id,
        warehouseId: secondaryWarehouse.id,
        type: 'OUT',
        quantity: 8,
        reason: 'Seeded unit distribution',
        referenceType: 'manual_adjustment',
        referenceId: 'UNIT-SEED-001',
        notes: 'Seeded outbound movement',
      },
      create: {
        id: 'seed-stock-movement-out-1',
        productId: products[2].id,
        warehouseId: secondaryWarehouse.id,
        type: 'OUT',
        quantity: 8,
        reason: 'Seeded unit distribution',
        referenceType: 'manual_adjustment',
        referenceId: 'UNIT-SEED-001',
        notes: 'Seeded outbound movement',
      },
    }),
  ]);

  const property = await prisma.property.upsert({
    where: { id: 'seed-property-1' },
    update: {
      name: 'Matina Residences',
      type: 'apartment',
      location: 'Matina, Davao City',
      address: 'Matina, Davao City',
    },
    create: {
      id: 'seed-property-1',
      name: 'Matina Residences',
      type: 'apartment',
      location: 'Matina, Davao City',
      address: 'Matina, Davao City',
    },
  });

  const units = await Promise.all([
    prisma.unit.upsert({
      where: {
        propertyId_code: {
          propertyId: property.id,
          code: 'U711',
        },
      },
      update: {
        name: 'Unit 711',
        capacity: 4,
        nightlyRate: 2500,
      },
      create: {
        propertyId: property.id,
        code: 'U711',
        name: 'Unit 711',
        capacity: 4,
        nightlyRate: 2500,
      },
    }),
    prisma.unit.upsert({
      where: {
        propertyId_code: {
          propertyId: property.id,
          code: 'U712',
        },
      },
      update: {
        name: 'Unit 712',
        capacity: 6,
        nightlyRate: 3000,
      },
      create: {
        propertyId: property.id,
        code: 'U712',
        name: 'Unit 712',
        capacity: 6,
        nightlyRate: 3000,
      },
    }),
  ]);

  const agent = await prisma.agent.upsert({
    where: { email: 'maria.santos@example.com' },
    update: {
      name: 'Maria Santos',
      phone: '09170000001',
    },
    create: {
      name: 'Maria Santos',
      email: 'maria.santos@example.com',
      phone: '09170000001',
    },
  });

  const reporterUser = await prisma.user.upsert({
    where: { email: 'frontdesk@example.com' },
    update: {
      name: 'Front Desk Staff',
      role: 'frontdesk',
    },
    create: {
      email: 'frontdesk@example.com',
      name: 'Front Desk Staff',
      role: 'frontdesk',
    },
  });

  await prisma.userPropertyAccess.upsert({
    where: {
      userId_propertyId: {
        userId: reporterUser.id,
        propertyId: property.id,
      },
    },
    update: {
      role: 'editor',
    },
    create: {
      userId: reporterUser.id,
      propertyId: property.id,
      role: 'editor',
    },
  });

  const booking = await prisma.booking.upsert({
    where: { bookingCode: 'BK-1024' },
    update: {
      unitId: units[0].id,
      agentId: agent.id,
      channel: 'Airbnb',
      status: 'checked_out',
      guestName: 'John Doe',
      guestCount: 3,
      checkIn: new Date('2025-02-01T14:00:00.000Z'),
      checkOut: new Date('2025-02-05T12:00:00.000Z'),
      basePrice: 12000,
      discount: 500,
      totalAmount: 13800,
    },
    create: {
      bookingCode: 'BK-1024',
      unitId: units[0].id,
      agentId: agent.id,
      channel: 'Airbnb',
      status: 'checked_out',
      guestName: 'John Doe',
      guestCount: 3,
      checkIn: new Date('2025-02-01T14:00:00.000Z'),
      checkOut: new Date('2025-02-05T12:00:00.000Z'),
      basePrice: 12000,
      discount: 500,
      totalAmount: 13800,
    },
  });

  const primaryGuest = await prisma.guest.upsert({
    where: { id: 'seed-guest-1' },
    update: {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      phone: '09175551234',
    },
    create: {
      id: 'seed-guest-1',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      phone: '09175551234',
    },
  });

  await prisma.bookingGuest.deleteMany({ where: { bookingId: booking.id } });
  await prisma.bookingGuest.create({
    data: {
      bookingId: booking.id,
      guestId: primaryGuest.id,
      isPrimary: true,
      isBooker: true,
    },
  });

  await prisma.unitDateBlock.deleteMany({ where: { bookingId: booking.id } });
  const bookingDates: Array<{ unitId: string; bookingId: string; date: Date }> = [];
  const checkInDate = new Date('2025-02-01T00:00:00.000Z');
  const checkOutDate = new Date('2025-02-05T00:00:00.000Z');
  for (const cursor = new Date(checkInDate); cursor < checkOutDate; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    bookingDates.push({
      unitId: units[0].id,
      bookingId: booking.id,
      date: new Date(cursor),
    });
  }
  if (bookingDates.length > 0) {
    await prisma.unitDateBlock.createMany({ data: bookingDates });
  }

  await prisma.bookingCharge.deleteMany({ where: { bookingId: booking.id } });
  await prisma.bookingCharge.createMany({
    data: [
      {
        bookingId: booking.id,
        category: 'addon',
        name: 'Pool Fee',
        amount: 500,
        quantity: 1,
      },
      {
        bookingId: booking.id,
        category: 'addon',
        name: 'Extra Heads',
        amount: 800,
        quantity: 1,
      },
    ],
  });

  const payment = await prisma.payment.upsert({
    where: { bookingId: booking.id },
    update: {
      subTotal: 13800,
      discountTotal: 500,
      totalPaid: 13800,
      status: 'paid',
      method: 'gcash',
      referenceNo: 'PAY-1024',
      paidAt: new Date('2025-02-05T12:30:00.000Z'),
    },
    create: {
      bookingId: booking.id,
      subTotal: 13800,
      discountTotal: 500,
      totalPaid: 13800,
      status: 'paid',
      method: 'gcash',
      referenceNo: 'PAY-1024',
      paidAt: new Date('2025-02-05T12:30:00.000Z'),
    },
  });

  await prisma.paymentTransaction.upsert({
    where: { id: 'seed-payment-tx-1' },
    update: {
      paymentId: payment.id,
      type: 'payment',
      amount: 13800,
      method: 'gcash',
      referenceNo: 'PAY-1024',
      paidAt: new Date('2025-02-05T12:30:00.000Z'),
      recordedByUserId: reporterUser.id,
      notes: 'Full settlement on checkout.',
    },
    create: {
      id: 'seed-payment-tx-1',
      paymentId: payment.id,
      type: 'payment',
      amount: 13800,
      method: 'gcash',
      referenceNo: 'PAY-1024',
      paidAt: new Date('2025-02-05T12:30:00.000Z'),
      recordedByUserId: reporterUser.id,
      notes: 'Full settlement on checkout.',
    },
  });

  const damageIncident = await prisma.damageIncident.upsert({
    where: { id: 'seed-damage-1' },
    update: {
      bookingId: booking.id,
      unitId: units[0].id,
      reportedByUserId: reporterUser.id,
      resolvedByUserId: reporterUser.id,
      resolvedAt: new Date('2025-02-05T12:35:00.000Z'),
      description: 'Broken lamp shade',
      resolutionNotes: 'Guest admitted damage; charge applied and case closed.',
      cost: 1000,
      chargedToGuest: 700,
      absorbedAmount: 300,
      status: 'settled',
    },
    create: {
      id: 'seed-damage-1',
      bookingId: booking.id,
      unitId: units[0].id,
      reportedByUserId: reporterUser.id,
      resolvedByUserId: reporterUser.id,
      resolvedAt: new Date('2025-02-05T12:35:00.000Z'),
      description: 'Broken lamp shade',
      resolutionNotes: 'Guest admitted damage; charge applied and case closed.',
      cost: 1000,
      chargedToGuest: 700,
      absorbedAmount: 300,
      status: 'settled',
    },
  });

  await prisma.damageAttachment.upsert({
    where: { id: 'seed-damage-attachment-1' },
    update: {
      damageIncidentId: damageIncident.id,
      fileUrl: 'https://example.com/damage/seed-damage-1-photo.jpg',
      fileName: 'broken-lamp-shade.jpg',
      mimeType: 'image/jpeg',
      uploadedByUserId: reporterUser.id,
    },
    create: {
      id: 'seed-damage-attachment-1',
      damageIncidentId: damageIncident.id,
      fileUrl: 'https://example.com/damage/seed-damage-1-photo.jpg',
      fileName: 'broken-lamp-shade.jpg',
      mimeType: 'image/jpeg',
      uploadedByUserId: reporterUser.id,
    },
  });

  await prisma.inventoryAllocation.upsert({
    where: {
      productId_unitId: {
        productId: products[0].id,
        unitId: units[0].id,
      },
    },
    update: {
      quantity: 12,
      minStock: 8,
    },
    create: {
      productId: products[0].id,
      unitId: units[0].id,
      quantity: 12,
      minStock: 8,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
