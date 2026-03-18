-- AlterTable
ALTER TABLE `DamageIncident` ADD COLUMN `reportedByExternalId` VARCHAR(191) NULL,
    ADD COLUMN `resolvedByExternalId` VARCHAR(191) NULL;
