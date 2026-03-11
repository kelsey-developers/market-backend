CREATE TABLE `GoodsReceiptAttachment` (
    `id` VARCHAR(191) NOT NULL,
    `goodsReceiptId` VARCHAR(191) NOT NULL,
    `fileUrl` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NULL,
    `mimeType` VARCHAR(191) NULL,
    `sizeBytes` INTEGER NULL,
    `uploadedByUserId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `GoodsReceiptAttachment_goodsReceiptId_idx`(`goodsReceiptId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `GoodsReceiptAttachment` ADD CONSTRAINT `GoodsReceiptAttachment_goodsReceiptId_fkey` FOREIGN KEY (`goodsReceiptId`) REFERENCES `GoodsReceipt`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `GoodsReceiptAttachment` ADD CONSTRAINT `GoodsReceiptAttachment_uploadedByUserId_fkey` FOREIGN KEY (`uploadedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
