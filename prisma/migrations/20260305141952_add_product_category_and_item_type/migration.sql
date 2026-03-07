-- AlterTable
ALTER TABLE `Product`
    ADD COLUMN `categoryId` VARCHAR(191) NULL,
    ADD COLUMN `itemType` ENUM('consumable', 'non_consumable') NOT NULL DEFAULT 'consumable';

-- CreateTable
CREATE TABLE `InventoryCategory` (
        `id` VARCHAR(191) NOT NULL,
        `code` VARCHAR(191) NOT NULL,
        `name` VARCHAR(191) NOT NULL,
        `description` VARCHAR(191) NULL,
        `isActive` BOOLEAN NOT NULL DEFAULT true,
        `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        `updatedAt` DATETIME(3) NOT NULL,

        UNIQUE INDEX `InventoryCategory_code_key`(`code`),
        UNIQUE INDEX `InventoryCategory_name_key`(`name`),
        PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Product` ADD CONSTRAINT `Product_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `InventoryCategory`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
