-- AlterTable
ALTER TABLE `Unit` ADD COLUMN `defaultWarehouseId` VARCHAR(191) NULL;

-- AddForeignKey
ALTER TABLE `Unit` ADD CONSTRAINT `Unit_defaultWarehouseId_fkey` FOREIGN KEY (`defaultWarehouseId`) REFERENCES `Warehouse`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
