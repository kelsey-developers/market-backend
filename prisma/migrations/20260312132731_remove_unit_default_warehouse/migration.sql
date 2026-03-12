/*
  Warnings:

  - You are about to drop the column `defaultWarehouseId` on the `Unit` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `Unit` DROP FOREIGN KEY `Unit_defaultWarehouseId_fkey`;

-- DropIndex
DROP INDEX `Unit_defaultWarehouseId_fkey` ON `Unit`;

-- AlterTable
ALTER TABLE `Unit` DROP COLUMN `defaultWarehouseId`;
