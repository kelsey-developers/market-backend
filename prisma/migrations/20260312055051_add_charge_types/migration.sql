-- AlterTable
ALTER TABLE `BookingCharge` ADD COLUMN `chargeTypeId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `ChargeType` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `defaultAmount` DECIMAL(12, 2) NULL,
    `pricingModel` ENUM('PER_BOOKING', 'PER_NIGHT', 'PER_PERSON', 'PER_PERSON_PER_NIGHT', 'MANUAL') NOT NULL DEFAULT 'PER_BOOKING',
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ChargeType_code_key`(`code`),
    INDEX `ChargeType_isActive_code_idx`(`isActive`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `BookingCharge_chargeTypeId_idx` ON `BookingCharge`(`chargeTypeId`);

-- AddForeignKey
ALTER TABLE `BookingCharge` ADD CONSTRAINT `BookingCharge_chargeTypeId_fkey` FOREIGN KEY (`chargeTypeId`) REFERENCES `ChargeType`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER TABLE `BookingCharge` RENAME INDEX `BookingCharge_bookingId_fkey` TO `BookingCharge_bookingId_idx`;
