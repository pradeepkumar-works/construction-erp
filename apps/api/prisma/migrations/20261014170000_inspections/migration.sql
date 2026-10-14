-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "checklistTemplateId" TEXT,
ADD COLUMN     "holdPoint" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "inspectionId" TEXT;

-- CreateTable
CREATE TABLE "ChecklistTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "items" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inspection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "inspectionNo" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "location" TEXT NOT NULL,
    "remarks" TEXT,
    "checklistName" TEXT,
    "checklist" JSONB NOT NULL DEFAULT '[]',
    "status" "SubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistTemplate_organizationId_name_key" ON "ChecklistTemplate"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Inspection_projectId_status_idx" ON "Inspection"("projectId", "status");

-- CreateIndex
CREATE INDEX "Inspection_activityId_status_idx" ON "Inspection"("activityId", "status");

-- CreateIndex
CREATE INDEX "Inspection_organizationId_status_idx" ON "Inspection"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Inspection_organizationId_inspectionNo_key" ON "Inspection"("organizationId", "inspectionNo");

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_checklistTemplateId_fkey" FOREIGN KEY ("checklistTemplateId") REFERENCES "ChecklistTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistTemplate" ADD CONSTRAINT "ChecklistTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


ALTER TABLE "ChecklistTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChecklistTemplate" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ChecklistTemplate" USING (app_current_org() IS NULL OR "organizationId" = app_current_org()) WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "Inspection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Inspection" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Inspection" USING (app_current_org() IS NULL OR "organizationId" = app_current_org()) WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
