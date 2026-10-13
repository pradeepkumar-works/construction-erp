-- CreateTable
CREATE TABLE "ActivityTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectType" "ProjectType" NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "startDay" INTEGER NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivityTemplate_organizationId_projectType_idx" ON "ActivityTemplate"("organizationId", "projectType");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityTemplate_organizationId_projectType_name_key" ON "ActivityTemplate"("organizationId", "projectType", "name");

-- AddForeignKey
ALTER TABLE "ActivityTemplate" ADD CONSTRAINT "ActivityTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
