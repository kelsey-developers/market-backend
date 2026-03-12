-- AlterTable: Add warehouseId and make unitId optional for damage incidents (warehouse vs unit write-offs)
ALTER TABLE `DamageIncident` ADD COLUMN `warehouseId` VARCHAR(191) NULL;

-- Make unitId nullable (warehouse write-offs have no unit)
ALTER TABLE `DamageIncident` MODIFY `unitId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `DamageIncident_warehouseId_idx` ON `DamageIncident`(`warehouseId`);

-- AddForeignKey
ALTER TABLE `DamageIncident` ADD CONSTRAINT `DamageIncident_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `Warehouse`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Add in_review and resolved to DamagePenaltyStatus enum (for frontend compatibility)
ALTER TABLE `DamageIncident` MODIFY COLUMN `status` ENUM('open', 'charged_to_guest', 'absorbed', 'settled', 'in_review', 'resolved') NOT NULL DEFAULT 'open';
