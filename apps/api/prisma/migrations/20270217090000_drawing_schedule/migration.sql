-- CreateTable
CREATE TABLE "DrawingNeed" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "docNo" TEXT,
    "title" TEXT NOT NULL,
    "discipline" "DocumentDiscipline" NOT NULL DEFAULT 'GENERAL',
    "source" TEXT NOT NULL DEFAULT 'CLIENT',
    "fromParty" TEXT,
    "neededBy" DATE NOT NULL,
    "activityId" TEXT,
    "remarks" TEXT,
    "dropped" BOOLEAN NOT NULL DEFAULT false,
    "documentId" TEXT,
    "riskId" TEXT,
    "lastLetterId" TEXT,
    "lastReminderOn" DATE,
    "reminders" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DrawingNeed_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DrawingNeed_riskId_key" ON "DrawingNeed"("riskId");

-- CreateIndex
CREATE INDEX "DrawingNeed_projectId_neededBy_idx" ON "DrawingNeed"("projectId", "neededBy");

-- CreateIndex
CREATE INDEX "DrawingNeed_documentId_idx" ON "DrawingNeed"("documentId");

-- CreateIndex
CREATE INDEX "DrawingNeed_organizationId_idx" ON "DrawingNeed"("organizationId");

-- AddForeignKey
ALTER TABLE "DrawingNeed" ADD CONSTRAINT "DrawingNeed_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingNeed" ADD CONSTRAINT "DrawingNeed_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingNeed" ADD CONSTRAINT "DrawingNeed_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingNeed" ADD CONSTRAINT "DrawingNeed_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingNeed" ADD CONSTRAINT "DrawingNeed_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "Risk"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingNeed" ADD CONSTRAINT "DrawingNeed_lastLetterId_fkey" FOREIGN KEY ("lastLetterId") REFERENCES "Letter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawingNeed" ADD CONSTRAINT "DrawingNeed_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Row-level security (as in 20261013211500_tenant_rls).
ALTER TABLE "DrawingNeed" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DrawingNeed" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DrawingNeed"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
