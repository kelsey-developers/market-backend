-- Drop FKs so reportedByUserId and resolvedByUserId can store any identifier (auth id or User.id)
ALTER TABLE `DamageIncident` DROP FOREIGN KEY `DamageIncident_reportedByUserId_fkey`;
ALTER TABLE `DamageIncident` DROP FOREIGN KEY `DamageIncident_resolvedByUserId_fkey`;

-- Remove external columns; reporter/resolver stored only in reportedByUserId/resolvedByUserId
ALTER TABLE `DamageIncident` DROP COLUMN `reportedByExternalId`, DROP COLUMN `resolvedByExternalId`;
