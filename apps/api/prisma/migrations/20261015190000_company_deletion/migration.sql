-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "deletionRequestedAt" TIMESTAMP(3),
ADD COLUMN     "deletionRequestedByName" TEXT,
ADD COLUMN     "deletionScheduledFor" DATE;

