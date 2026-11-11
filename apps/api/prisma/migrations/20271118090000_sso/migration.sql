-- Single sign-on (item 195): a company's provider, the identities linked to logins, and the one-use steps of a sign-in.
-- CreateEnum
CREATE TYPE "SsoProvider" AS ENUM ('ENTRA', 'GOOGLE');

-- CreateEnum
CREATE TYPE "SsoTicketKind" AS ENUM ('STATE', 'CODE');

-- CreateTable
CREATE TABLE "OrganizationSso" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" "SsoProvider" NOT NULL,
    "tenantId" TEXT,
    "clientId" TEXT NOT NULL,
    "clientSecretEnc" TEXT NOT NULL,
    "secretLast4" TEXT NOT NULL,
    "allowedDomains" TEXT[],
    "enforce" BOOLEAN NOT NULL DEFAULT false,
    "addNewPeople" BOOLEAN NOT NULL DEFAULT false,
    "newPersonRole" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationSso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SsoIdentity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "loginId" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "email" TEXT,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SsoIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SsoTicket" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "SsoTicketKind" NOT NULL,
    "hash" TEXT NOT NULL,
    "userId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SsoTicket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationSso_organizationId_key" ON "OrganizationSso"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "SsoIdentity_organizationId_issuer_subject_key" ON "SsoIdentity"("organizationId", "issuer", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "SsoIdentity_organizationId_loginId_issuer_key" ON "SsoIdentity"("organizationId", "loginId", "issuer");

-- CreateIndex
CREATE UNIQUE INDEX "SsoTicket_hash_key" ON "SsoTicket"("hash");

-- CreateIndex
CREATE INDEX "SsoTicket_createdAt_idx" ON "SsoTicket"("createdAt");

-- AddForeignKey
ALTER TABLE "OrganizationSso" ADD CONSTRAINT "OrganizationSso_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SsoIdentity" ADD CONSTRAINT "SsoIdentity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SsoIdentity" ADD CONSTRAINT "SsoIdentity_loginId_fkey" FOREIGN KEY ("loginId") REFERENCES "Login"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SsoTicket" ADD CONSTRAINT "SsoTicket_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Row-level security (20261013211500_tenant_rls): the sign-in itself reads these outside the tenant.
ALTER TABLE "OrganizationSso" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrganizationSso" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "OrganizationSso"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "SsoIdentity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SsoIdentity" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SsoIdentity"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "SsoTicket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SsoTicket" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "SsoTicket"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

