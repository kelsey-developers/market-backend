-- AlterTable
ALTER TABLE `PurchaseOrder`
  ADD COLUMN `createdByUserId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `PurchaseOrder_createdByUserId_idx` ON `PurchaseOrder`(`createdByUserId`);

-- AddForeignKey
ALTER TABLE `PurchaseOrder`
  ADD CONSTRAINT `PurchaseOrder_createdByUserId_fkey`
  FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`)
  ON DELETE SET NULL
  ON UPDATE CASCADE;
