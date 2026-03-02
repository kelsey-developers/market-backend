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

  const products = await Promise.all([
    prisma.product.upsert({
      where: { sku: 'SKU-RICE-5KG' },
      update: {
        name: 'Rice 5kg',
        unit: 'bag',
        reorderLevel: 20,
        supplierId: supplier.id,
      },
      create: {
        sku: 'SKU-RICE-5KG',
        name: 'Rice 5kg',
        unit: 'bag',
        reorderLevel: 20,
        supplierId: supplier.id,
      },
    }),
    prisma.product.upsert({
      where: { sku: 'SKU-NOODLES-BOX' },
      update: {
        name: 'Instant Noodles Box',
        unit: 'box',
        reorderLevel: 15,
        supplierId: supplier.id,
      },
      create: {
        sku: 'SKU-NOODLES-BOX',
        name: 'Instant Noodles Box',
        unit: 'box',
        reorderLevel: 15,
        supplierId: supplier.id,
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
          warehouseId: warehouse.id,
          quantity: index === 0 ? 100 : 80,
        },
      })
    )
  );

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

  await prisma.payment.upsert({
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

  await prisma.damageIncident.upsert({
    where: { id: 'seed-damage-1' },
    update: {
      bookingId: booking.id,
      unitId: units[0].id,
      description: 'Broken lamp shade',
      cost: 1000,
      chargedToGuest: 700,
      absorbedAmount: 300,
      status: 'settled',
    },
    create: {
      id: 'seed-damage-1',
      bookingId: booking.id,
      unitId: units[0].id,
      description: 'Broken lamp shade',
      cost: 1000,
      chargedToGuest: 700,
      absorbedAmount: 300,
      status: 'settled',
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
