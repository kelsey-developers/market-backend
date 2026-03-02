"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
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
    const supplier = await prisma.supplier.create({
        data: {
            name: 'Default Supplier Inc.',
            contactName: 'Admin',
            contactEmail: 'supplier@example.com',
            contactPhone: '09171234567',
            address: 'Metro Manila',
        },
    });
    const products = await Promise.all([
        prisma.product.create({
            data: {
                sku: 'SKU-RICE-5KG',
                name: 'Rice 5kg',
                unit: 'bag',
                reorderLevel: 20,
                supplierId: supplier.id,
            },
        }),
        prisma.product.create({
            data: {
                sku: 'SKU-NOODLES-BOX',
                name: 'Instant Noodles Box',
                unit: 'box',
                reorderLevel: 15,
                supplierId: supplier.id,
            },
        }),
    ]);
    await Promise.all(products.map((product, index) => prisma.inventoryBalance.upsert({
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
    })));
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
