-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('WHATSAPP', 'SMS');

-- CreateEnum
CREATE TYPE "MessageTemplate" AS ENUM ('APPROVAL_REQUEST', 'SENT_BACK', 'DPR_REMINDER', 'INVITE', 'TEST');

-- CreateEnum
CREATE TYPE "OutboundMessageStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "smsAlerts" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "whatsappAlerts" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "OutboundMessage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "notificationId" TEXT,
    "channel" "MessageChannel" NOT NULL,
    "template" "MessageTemplate" NOT NULL,
    "to" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "OutboundMessageStatus" NOT NULL,
    "providerRef" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutboundMessage_organizationId_createdAt_idx" ON "OutboundMessage"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "OutboundMessage_userId_idx" ON "OutboundMessage"("userId");

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


ALTER TABLE "OutboundMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutboundMessage" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OutboundMessage" USING (app_current_org() IS NULL OR "organizationId" = app_current_org()) WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
