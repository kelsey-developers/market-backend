-- AlterTable
ALTER TABLE `DamageIncident` ADD COLUMN `resolutionNotes` VARCHAR(191) NULL,
    ADD COLUMN `resolvedAt` DATETIME(3) NULL,
    ADD COLUMN `resolvedByUserId` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Payment` MODIFY `method` ENUM('cash', 'gcash', 'bank_transfer', 'card', 'other') NULL;

-- AlterTable
ALTER TABLE `StockMovement` ADD COLUMN `bookingId` VARCHAR(191) NULL,
    ADD COLUMN `damageIncidentId` VARCHAR(191) NULL,
    ADD COLUMN `goodsReceiptId` VARCHAR(191) NULL,
    ADD COLUMN `purchaseOrderId` VARCHAR(191) NULL,
    MODIFY `referenceType` ENUM('purchase_order', 'goods_receipt', 'booking', 'damage_incident', 'manual_adjustment') NULL;

-- AlterTable
ALTER TABLE `User` MODIFY `role` ENUM('admin', 'frontdesk', 'finance', 'inventory', 'operations', 'agent') NOT NULL;

-- CreateTable
CREATE TABLE `PaymentTransaction` (
    `id` VARCHAR(191) NOT NULL,
    `paymentId` VARCHAR(191) NOT NULL,
    `type` ENUM('payment', 'refund', 'adjustment') NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `method` ENUM('cash', 'gcash', 'bank_transfer', 'card', 'other') NULL,
    `referenceNo` VARCHAR(191) NULL,
    `paidAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `notes` VARCHAR(191) NULL,
    `recordedByUserId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PaymentTransaction_paymentId_paidAt_idx`(`paymentId`, `paidAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Guest` (
    `id` VARCHAR(191) NOT NULL,
    `firstName` VARCHAR(191) NOT NULL,
    `lastName` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Guest_email_idx`(`email`),
    INDEX `Guest_phone_idx`(`phone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BookingGuest` (
    `id` VARCHAR(191) NOT NULL,
    `bookingId` VARCHAR(191) NOT NULL,
    `guestId` VARCHAR(191) NOT NULL,
    `isPrimary` BOOLEAN NOT NULL DEFAULT false,
    `isBooker` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BookingGuest_guestId_idx`(`guestId`),
    UNIQUE INDEX `BookingGuest_bookingId_guestId_key`(`bookingId`, `guestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UnitDateBlock` (
    `id` VARCHAR(191) NOT NULL,
    `unitId` VARCHAR(191) NOT NULL,
    `bookingId` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `UnitDateBlock_bookingId_idx`(`bookingId`),
    UNIQUE INDEX `UnitDateBlock_unitId_date_key`(`unitId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DamageAttachment` (
    `id` VARCHAR(191) NOT NULL,
    `damageIncidentId` VARCHAR(191) NOT NULL,
    `fileUrl` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NULL,
    `mimeType` VARCHAR(191) NULL,
    `uploadedByUserId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DamageAttachment_damageIncidentId_idx`(`damageIncidentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GoodsReceipt` (
    `id` VARCHAR(191) NOT NULL,
    `receiptNo` VARCHAR(191) NOT NULL,
    `purchaseOrderId` VARCHAR(191) NOT NULL,
    `warehouseId` VARCHAR(191) NOT NULL,
    `receivedByUserId` VARCHAR(191) NULL,
    `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `GoodsReceipt_receiptNo_key`(`receiptNo`),
    INDEX `GoodsReceipt_purchaseOrderId_receivedAt_idx`(`purchaseOrderId`, `receivedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GoodsReceiptItem` (
    `id` VARCHAR(191) NOT NULL,
    `goodsReceiptId` VARCHAR(191) NOT NULL,
    `purchaseOrderItemId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `quantityReceived` INTEGER NOT NULL,
    `unitCost` DECIMAL(12, 2) NULL,

    INDEX `GoodsReceiptItem_productId_idx`(`productId`),
    UNIQUE INDEX `GoodsReceiptItem_goodsReceiptId_purchaseOrderItemId_key`(`goodsReceiptId`, `purchaseOrderItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserPropertyAccess` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `propertyId` VARCHAR(191) NOT NULL,
    `role` ENUM('viewer', 'editor', 'manager') NOT NULL DEFAULT 'viewer',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `UserPropertyAccess_userId_propertyId_key`(`userId`, `propertyId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UnitRatePlan` (
    `id` VARCHAR(191) NOT NULL,
    `unitId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `planType` ENUM('base', 'seasonal', 'weekend', 'promo') NOT NULL,
    `validFrom` DATE NOT NULL,
    `validTo` DATE NOT NULL,
    `priority` INTEGER NOT NULL DEFAULT 100,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `UnitRatePlan_unitId_validFrom_validTo_idx`(`unitId`, `validFrom`, `validTo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UnitRateCalendar` (
    `id` VARCHAR(191) NOT NULL,
    `unitId` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `rate` DECIMAL(12, 2) NOT NULL,
    `source` ENUM('nightly_rate', 'rate_plan', 'manual_override', 'promo') NOT NULL,
    `planId` VARCHAR(191) NULL,
    `minStayNights` INTEGER NULL,
    `closedToArrival` BOOLEAN NOT NULL DEFAULT false,
    `closedToDeparture` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `UnitRateCalendar_planId_idx`(`planId`),
    UNIQUE INDEX `UnitRateCalendar_unitId_date_key`(`unitId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `StockMovement_referenceType_createdAt_idx` ON `StockMovement`(`referenceType`, `createdAt`);

-- AddForeignKey
ALTER TABLE `StockMovement` ADD CONSTRAINT `StockMovement_purchaseOrderId_fkey` FOREIGN KEY (`purchaseOrderId`) REFERENCES `PurchaseOrder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockMovement` ADD CONSTRAINT `StockMovement_goodsReceiptId_fkey` FOREIGN KEY (`goodsReceiptId`) REFERENCES `GoodsReceipt`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockMovement` ADD CONSTRAINT `StockMovement_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `Booking`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StockMovement` ADD CONSTRAINT `StockMovement_damageIncidentId_fkey` FOREIGN KEY (`damageIncidentId`) REFERENCES `DamageIncident`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentTransaction` ADD CONSTRAINT `PaymentTransaction_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `Payment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentTransaction` ADD CONSTRAINT `PaymentTransaction_recordedByUserId_fkey` FOREIGN KEY (`recordedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BookingGuest` ADD CONSTRAINT `BookingGuest_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `Booking`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BookingGuest` ADD CONSTRAINT `BookingGuest_guestId_fkey` FOREIGN KEY (`guestId`) REFERENCES `Guest`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UnitDateBlock` ADD CONSTRAINT `UnitDateBlock_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `Unit`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UnitDateBlock` ADD CONSTRAINT `UnitDateBlock_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `Booking`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DamageIncident` ADD CONSTRAINT `DamageIncident_resolvedByUserId_fkey` FOREIGN KEY (`resolvedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DamageAttachment` ADD CONSTRAINT `DamageAttachment_damageIncidentId_fkey` FOREIGN KEY (`damageIncidentId`) REFERENCES `DamageIncident`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DamageAttachment` ADD CONSTRAINT `DamageAttachment_uploadedByUserId_fkey` FOREIGN KEY (`uploadedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GoodsReceipt` ADD CONSTRAINT `GoodsReceipt_purchaseOrderId_fkey` FOREIGN KEY (`purchaseOrderId`) REFERENCES `PurchaseOrder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GoodsReceipt` ADD CONSTRAINT `GoodsReceipt_warehouseId_fkey` FOREIGN KEY (`warehouseId`) REFERENCES `Warehouse`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GoodsReceipt` ADD CONSTRAINT `GoodsReceipt_receivedByUserId_fkey` FOREIGN KEY (`receivedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GoodsReceiptItem` ADD CONSTRAINT `GoodsReceiptItem_goodsReceiptId_fkey` FOREIGN KEY (`goodsReceiptId`) REFERENCES `GoodsReceipt`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GoodsReceiptItem` ADD CONSTRAINT `GoodsReceiptItem_purchaseOrderItemId_fkey` FOREIGN KEY (`purchaseOrderItemId`) REFERENCES `PurchaseOrderItem`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GoodsReceiptItem` ADD CONSTRAINT `GoodsReceiptItem_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserPropertyAccess` ADD CONSTRAINT `UserPropertyAccess_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserPropertyAccess` ADD CONSTRAINT `UserPropertyAccess_propertyId_fkey` FOREIGN KEY (`propertyId`) REFERENCES `Property`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UnitRatePlan` ADD CONSTRAINT `UnitRatePlan_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `Unit`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UnitRateCalendar` ADD CONSTRAINT `UnitRateCalendar_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `Unit`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UnitRateCalendar` ADD CONSTRAINT `UnitRateCalendar_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `UnitRatePlan`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
