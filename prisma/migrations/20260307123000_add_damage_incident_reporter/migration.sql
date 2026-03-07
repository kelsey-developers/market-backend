-- Add reporter reference to damage incidents
ALTER TABLE `DamageIncident`
  ADD COLUMN `reportedByUserId` VARCHAR(191) NULL;

CREATE INDEX `DamageIncident_reportedByUserId_idx`
  ON `DamageIncident`(`reportedByUserId`);

ALTER TABLE `DamageIncident`
  ADD CONSTRAINT `DamageIncident_reportedByUserId_fkey`
  FOREIGN KEY (`reportedByUserId`) REFERENCES `User`(`id`)
  ON DELETE SET NULL
  ON UPDATE CASCADE;
