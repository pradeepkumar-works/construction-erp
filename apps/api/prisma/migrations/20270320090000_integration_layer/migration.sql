-- Integration layer (item 139, ARCHITECTURE "Integration layer"): connections to outside systems, paired Nirmaan
-- Connectors, the log of what came in or went out, and the devices they report on.

-- CreateEnum
CREATE TYPE "IntegrationKind" AS ENUM ('GENERIC_WEBHOOK', 'CONNECTOR_CHECK');

-- CreateEnum
CREATE TYPE "IntegrationDirection" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "IntegrationEventStatus" AS ENUM ('OK', 'FAILED', 'IGNORED');

-- CreateTable
CREATE TABLE "IntegrationConnection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "IntegrationKind" NOT NULL,
    "name" TEXT NOT NULL,
    "projectId" TEXT,
    "agentId" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "secretEnc" TEXT,
    "secretLast4" TEXT,
    "hookSecretHash" TEXT,
    "hookSecretLast4" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastEventAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectorAgent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "projectId" TEXT,
    "pairCodeHash" TEXT,
    "pairCodeExpiresAt" TIMESTAMP(3),
    "tokenHash" TEXT,
    "pairedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "version" TEXT,
    "hostname" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConnectorAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT,
    "agentId" TEXT,
    "direction" "IntegrationDirection" NOT NULL DEFAULT 'IN',
    "status" "IntegrationEventStatus" NOT NULL,
    "externalId" TEXT,
    "summary" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceLink" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "label" TEXT,
    "equipmentId" TEXT,
    "projectId" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readings" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DeviceLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConnection_hookSecretHash_key" ON "IntegrationConnection"("hookSecretHash");

-- CreateIndex
CREATE INDEX "IntegrationConnection_organizationId_idx" ON "IntegrationConnection"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorAgent_pairCodeHash_key" ON "ConnectorAgent"("pairCodeHash");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorAgent_tokenHash_key" ON "ConnectorAgent"("tokenHash");

-- CreateIndex
CREATE INDEX "ConnectorAgent_organizationId_idx" ON "ConnectorAgent"("organizationId");

-- CreateIndex
CREATE INDEX "IntegrationEvent_organizationId_createdAt_idx" ON "IntegrationEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationEvent_connectionId_externalId_key" ON "IntegrationEvent"("connectionId", "externalId");

-- CreateIndex
CREATE INDEX "DeviceLink_organizationId_idx" ON "DeviceLink"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceLink_connectionId_externalId_key" ON "DeviceLink"("connectionId", "externalId");

-- AddForeignKey
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "ConnectorAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorAgent" ADD CONSTRAINT "ConnectorAgent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorAgent" ADD CONSTRAINT "ConnectorAgent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectorAgent" ADD CONSTRAINT "ConnectorAgent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationEvent" ADD CONSTRAINT "IntegrationEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationEvent" ADD CONSTRAINT "IntegrationEvent_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationEvent" ADD CONSTRAINT "IntegrationEvent_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "ConnectorAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceLink" ADD CONSTRAINT "DeviceLink_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceLink" ADD CONSTRAINT "DeviceLink_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceLink" ADD CONSTRAINT "DeviceLink_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceLink" ADD CONSTRAINT "DeviceLink_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-level security, as for every tenant table (20261013211500_tenant_rls)

ALTER TABLE "IntegrationConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IntegrationConnection" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "IntegrationConnection"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "ConnectorAgent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ConnectorAgent" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ConnectorAgent"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "IntegrationEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IntegrationEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "IntegrationEvent"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "DeviceLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeviceLink" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DeviceLink"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
