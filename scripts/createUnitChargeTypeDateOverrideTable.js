const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  // Create the override table without touching other schema objects.
  // This is used as a safe workaround when Prisma Migrate cannot run (e.g. no shadow DB perms).
  await prisma.$executeRawUnsafe(
    "CREATE TABLE IF NOT EXISTS `UnitChargeTypeDateOverride` (" +
      "`id` VARCHAR(191) NOT NULL, " +
      "`unitId` VARCHAR(191) NOT NULL, " +
      "`chargeTypeId` VARCHAR(191) NOT NULL, " +
      "`date` DATE NOT NULL, " +
      "`amount` DECIMAL(12, 2) NOT NULL, " +
      "`createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), " +
      "`updatedAt` DATETIME(3) NOT NULL, " +
      "PRIMARY KEY (`id`)" +
    ") DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
  );

  const statements = [
    "CREATE UNIQUE INDEX `UnitChargeTypeDateOverride_unitId_chargeTypeId_date_key` ON `UnitChargeTypeDateOverride`(`unitId`,`chargeTypeId`,`date`);",
    "CREATE INDEX `UnitChargeTypeDateOverride_unitId_date_idx` ON `UnitChargeTypeDateOverride`(`unitId`,`date`);",
    "CREATE INDEX `UnitChargeTypeDateOverride_chargeTypeId_date_idx` ON `UnitChargeTypeDateOverride`(`chargeTypeId`,`date`);",
    "ALTER TABLE `UnitChargeTypeDateOverride` ADD CONSTRAINT `UnitChargeTypeDateOverride_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `Unit`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;",
    "ALTER TABLE `UnitChargeTypeDateOverride` ADD CONSTRAINT `UnitChargeTypeDateOverride_chargeTypeId_fkey` FOREIGN KEY (`chargeTypeId`) REFERENCES `ChargeType`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;",
  ];

  for (const sql of statements) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch {
      // ignore (already exists / unsupported)
    }
  }
}

main()
  .then(() => {
    process.stdout.write('OK\n');
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

