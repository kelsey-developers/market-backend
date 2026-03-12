/*
  Warnings:

  - You are about to drop the column `warehouseId` on the `DamageIncident` table. All the data in the column will be lost.
  - Made the column `unitId` on table `DamageIncident` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE `DamageIncident` DROP FOREIGN KEY `DamageIncident_unitId_fkey`;

-- DropForeignKey
ALTER TABLE `DamageIncident` DROP FOREIGN KEY `DamageIncident_warehouseId_fkey`;

-- DropIndex
DROP INDEX `DamageIncident_unitId_idx` ON `DamageIncident`;

-- DropIndex
DROP INDEX `DamageIncident_warehouseId_idx` ON `DamageIncident`;

-- AlterTable
ALTER TABLE `DamageIncident` DROP COLUMN `warehouseId`,
    MODIFY `unitId` VARCHAR(191) NOT NULL;

-- CreateTable
CREATE TABLE `InventorySetting` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `InventorySetting_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ApprovalRequest` (
    `id` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `risk` VARCHAR(191) NOT NULL DEFAULT 'medium',
    `referenceType` VARCHAR(191) NULL,
    `referenceId` VARCHAR(191) NULL,
    `itemName` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `reason` VARCHAR(191) NULL,
    `requestedBy` VARCHAR(191) NULL,
    `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reviewedBy` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ApprovalRequest_status_idx`(`status`),
    INDEX `ApprovalRequest_referenceType_referenceId_idx`(`referenceType`, `referenceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `DamageIncident` ADD CONSTRAINT `DamageIncident_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `Unit`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
