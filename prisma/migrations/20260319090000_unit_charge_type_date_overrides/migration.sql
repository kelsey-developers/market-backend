-- CreateTable
CREATE TABLE `UnitChargeTypeDateOverride` (
    `id` VARCHAR(191) NOT NULL,
    `unitId` VARCHAR(191) NOT NULL,
    `chargeTypeId` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `UnitChargeTypeDateOverride_unitId_chargeTypeId_date_key`(`unitId`, `chargeTypeId`, `date`),
    INDEX `UnitChargeTypeDateOverride_unitId_date_idx`(`unitId`, `date`),
    INDEX `UnitChargeTypeDateOverride_chargeTypeId_date_idx`(`chargeTypeId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UnitChargeTypeDateOverride` ADD CONSTRAINT `UnitChargeTypeDateOverride_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `Unit`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UnitChargeTypeDateOverride` ADD CONSTRAINT `UnitChargeTypeDateOverride_chargeTypeId_fkey` FOREIGN KEY (`chargeTypeId`) REFERENCES `ChargeType`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

