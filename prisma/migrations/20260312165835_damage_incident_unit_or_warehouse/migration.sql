-- DropForeignKey
ALTER TABLE `DamageIncident` DROP FOREIGN KEY `DamageIncident_unitId_fkey`;

-- AlterTable
ALTER TABLE `DamageIncident` ADD COLUMN `warehouseId` VARCHAR(191) NULL,
    MODIFY `unitId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `DamageIncident_warehouseId_idx` ON `DamageIncident`(`warehouseId`);

-- AddForeignKey
ALTER TABLE `DamageIncident` ADD CONSTRAINT `DamageIncident_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `Unit`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DamageIncident` ADD CONSTRAINT `DamageIncident_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `Warehouse`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER TABLE `DamageIncident` RENAME INDEX `DamageIncident_unitId_fkey` TO `DamageIncident_unitId_idx`;
