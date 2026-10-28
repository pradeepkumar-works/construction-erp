-- Correspondence (item 136): company-wide registers, marking, numbering series, address book, templates, sign-off and dispatch.

-- A letter marked to someone, or waiting for its signatory
ALTER TYPE "NotificationType" ADD VALUE 'LETTER';

-- CreateEnum
CREATE TYPE "LetterStatus" AS ENUM ('DRAFT', 'AWAITING_APPROVAL', 'ISSUED', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "LetterMode" AS ENUM ('HAND', 'POST', 'SPEED_POST', 'REGISTERED_POST', 'COURIER', 'EMAIL', 'PORTAL');

-- CreateEnum
CREATE TYPE "LetterAction" AS ENUM ('REPLY', 'COMPLY', 'NOTE', 'FILE');

-- CreateEnum
CREATE TYPE "LetterPriority" AS ENUM ('NORMAL', 'URGENT');

-- CreateEnum
CREATE TYPE "LetterApprovalRule" AS ENUM ('ALL', 'CONTRACTUAL', 'NONE');

-- AlterTable
ALTER TABLE "Letter" ADD COLUMN     "action" "LetterAction",
ADD COLUMN     "actionDue" DATE,
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "body" TEXT,
ADD COLUMN     "category" TEXT,
ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "closedById" TEXT,
ADD COLUMN     "closedNote" TEXT,
ADD COLUMN     "confidential" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "contactId" TEXT,
ADD COLUMN     "deliveredOn" DATE,
ADD COLUMN     "deliveryProof" TEXT,
ADD COLUMN     "dispatchedOn" DATE,
ADD COLUMN     "docketNo" TEXT,
ADD COLUMN     "markedToId" TEXT,
ADD COLUMN     "mode" "LetterMode",
ADD COLUMN     "priority" "LetterPriority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "receivedOn" DATE,
ADD COLUMN     "returnNote" TEXT,
ADD COLUMN     "sentForApprovalAt" TIMESTAMP(3),
ADD COLUMN     "seriesId" TEXT,
ADD COLUMN     "signatoryId" TEXT,
ADD COLUMN     "status" "LetterStatus" NOT NULL DEFAULT 'OPEN',
ALTER COLUMN "projectId" DROP NOT NULL,
ALTER COLUMN "letterNo" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "letterApproval" "LetterApprovalRule" NOT NULL DEFAULT 'CONTRACTUAL';

-- CreateTable
CREATE TABLE "LetterMark" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "letterId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "action" "LetterAction" NOT NULL,
    "dueOn" DATE,
    "note" TEXT,
    "doneAt" TIMESTAMP(3),
    "doneNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LetterMark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LetterContact" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "office" TEXT,
    "organisation" TEXT,
    "address" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "clientId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LetterContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LetterSeries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT,
    "direction" "LetterDirection" NOT NULL,
    "prefix" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LetterSeries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LetterSeriesCounter" (
    "id" TEXT NOT NULL,
    "seriesId" TEXT NOT NULL,
    "fy" TEXT NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LetterSeriesCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LetterTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LetterTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LetterMark_letterId_createdAt_idx" ON "LetterMark"("letterId", "createdAt");

-- CreateIndex
CREATE INDEX "LetterMark_toId_doneAt_idx" ON "LetterMark"("toId", "doneAt");

-- CreateIndex
CREATE INDEX "LetterContact_organizationId_name_idx" ON "LetterContact"("organizationId", "name");

-- CreateIndex
CREATE INDEX "LetterSeries_organizationId_projectId_direction_idx" ON "LetterSeries"("organizationId", "projectId", "direction");

-- CreateIndex
CREATE UNIQUE INDEX "LetterSeriesCounter_seriesId_fy_key" ON "LetterSeriesCounter"("seriesId", "fy");

-- CreateIndex
CREATE UNIQUE INDEX "LetterTemplate_organizationId_name_key" ON "LetterTemplate"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Letter_organizationId_direction_status_idx" ON "Letter"("organizationId", "direction", "status");

-- CreateIndex
CREATE INDEX "Letter_markedToId_idx" ON "Letter"("markedToId");

-- AddForeignKey
ALTER TABLE "Letter" ADD CONSTRAINT "Letter_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "LetterSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Letter" ADD CONSTRAINT "Letter_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "LetterContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Letter" ADD CONSTRAINT "Letter_markedToId_fkey" FOREIGN KEY ("markedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Letter" ADD CONSTRAINT "Letter_signatoryId_fkey" FOREIGN KEY ("signatoryId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Letter" ADD CONSTRAINT "Letter_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LetterMark" ADD CONSTRAINT "LetterMark_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LetterMark" ADD CONSTRAINT "LetterMark_letterId_fkey" FOREIGN KEY ("letterId") REFERENCES "Letter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LetterMark" ADD CONSTRAINT "LetterMark_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LetterMark" ADD CONSTRAINT "LetterMark_toId_fkey" FOREIGN KEY ("toId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LetterContact" ADD CONSTRAINT "LetterContact_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LetterContact" ADD CONSTRAINT "LetterContact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LetterSeries" ADD CONSTRAINT "LetterSeries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LetterSeries" ADD CONSTRAINT "LetterSeries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LetterSeriesCounter" ADD CONSTRAINT "LetterSeriesCounter_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "LetterSeries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LetterTemplate" ADD CONSTRAINT "LetterTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Letters already recorded: sent ones were issued; received ones are settled once a reply went out.
UPDATE "Letter" SET "status" = 'ISSUED' WHERE "direction" = 'OUT';
UPDATE "Letter" SET "receivedOn" = "letterDate" WHERE "direction" = 'IN';
UPDATE "Letter" l SET "status" = 'CLOSED', "closedAt" = r."createdAt", "closedNote" = 'Replied with ' || r."letterNo"
FROM "Letter" r WHERE l."direction" = 'IN' AND r."inReplyToId" = l."id" AND r."direction" = 'OUT';

-- The document controller role for every existing organisation (new ones get it at sign-up).
INSERT INTO "Role" ("id", "organizationId", "key", "name")
SELECT gen_random_uuid()::text, "id", 'DOCUMENT_CONTROLLER', 'Document Controller' FROM "Organization"
ON CONFLICT ("organizationId", "key") DO NOTHING;

-- Row-level security (as in 20261013211500_tenant_rls); a series' counters are reached only through their series.
ALTER TABLE "LetterMark" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LetterMark" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "LetterMark"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "LetterContact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LetterContact" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "LetterContact"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "LetterSeries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LetterSeries" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "LetterSeries"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "LetterTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LetterTemplate" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "LetterTemplate"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
