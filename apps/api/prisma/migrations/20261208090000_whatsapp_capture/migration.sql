
-- CreateEnum
CREATE TYPE "InboundMessageState" AS ENUM ('RECEIVED', 'ANSWERED', 'DRAFTED', 'SAVED', 'DISCARDED', 'FAILED');

-- CreateEnum
CREATE TYPE "InboundMessageType" AS ENUM ('TEXT', 'VOICE', 'PHOTO');

-- CreateEnum
CREATE TYPE "CaptureOutcome" AS ENUM ('SAVED', 'CHANGED', 'DISCARDED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "captureFrom" TEXT;

-- CreateTable
CREATE TABLE "InboundMessage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromPhone" TEXT NOT NULL,
    "providerRef" TEXT,
    "type" "InboundMessageType" NOT NULL,
    "text" TEXT,
    "transcript" TEXT,
    "attachmentId" TEXT,
    "state" "InboundMessageState" NOT NULL DEFAULT 'RECEIVED',
    "threadId" TEXT,
    "draft" JSONB,
    "reply" TEXT,
    "recordKind" TEXT,
    "recordId" TEXT,
    "recordClientId" TEXT NOT NULL,
    "outcome" "CaptureOutcome",
    "decidedAt" TIMESTAMP(3),
    "error" TEXT,
    "costPaise" INTEGER NOT NULL DEFAULT 0,
    "transcribeModel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InboundMessage_organizationId_createdAt_idx" ON "InboundMessage"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "InboundMessage_userId_createdAt_idx" ON "InboundMessage"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InboundMessage_organizationId_providerRef_key" ON "InboundMessage"("organizationId", "providerRef");

-- CreateIndex
CREATE UNIQUE INDEX "User_captureFrom_key" ON "User"("captureFrom");

-- AddForeignKey
ALTER TABLE "InboundMessage" ADD CONSTRAINT "InboundMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundMessage" ADD CONSTRAINT "InboundMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundMessage" ADD CONSTRAINT "InboundMessage_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Row-level security (as in 20261013211500_tenant_rls)
ALTER TABLE "InboundMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InboundMessage" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "InboundMessage"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
