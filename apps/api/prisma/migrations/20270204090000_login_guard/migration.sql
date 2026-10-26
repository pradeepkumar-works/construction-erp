-- AlterTable
ALTER TABLE "User" ADD COLUMN     "tokensValidAfter" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AuthAttempt" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuthAttempt_email_kind_createdAt_idx" ON "AuthAttempt"("email", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "AuthAttempt_ip_kind_createdAt_idx" ON "AuthAttempt"("ip", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "AuthAttempt_createdAt_idx" ON "AuthAttempt"("createdAt");
