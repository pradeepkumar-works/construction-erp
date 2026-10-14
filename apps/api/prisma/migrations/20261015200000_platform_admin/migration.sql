-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "supportAccessGrantedByName" TEXT,
ADD COLUMN     "supportAccessUntil" TIMESTAMP(3),
ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspendedReason" TEXT;

