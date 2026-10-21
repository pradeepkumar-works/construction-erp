-- PPE register: PPE handed to named workers, and the kit each project requires.
-- CreateEnum
CREATE TYPE "PpeKind" AS ENUM ('HELMET', 'SAFETY_SHOES', 'REFLECTIVE_JACKET', 'GLOVES', 'SAFETY_HARNESS', 'GOGGLES', 'EAR_PROTECTION', 'DUST_MASK', 'GUMBOOTS');

-- CreateEnum
CREATE TYPE "PpeIssueStatus" AS ENUM ('ISSUED', 'RETURNED', 'REPLACED', 'LOST');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "ppeRequired" "PpeKind"[] DEFAULT ARRAY['HELMET', 'SAFETY_SHOES', 'REFLECTIVE_JACKET']::"PpeKind"[];

-- CreateTable
CREATE TABLE "PpeIssue" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "kind" "PpeKind" NOT NULL,
    "size" TEXT,
    "issuedOn" DATE NOT NULL,
    "replaceBy" DATE,
    "status" "PpeIssueStatus" NOT NULL DEFAULT 'ISSUED',
    "batchId" TEXT,
    "closedOn" DATE,
    "closeNote" TEXT,
    "recoverable" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "issuedById" TEXT NOT NULL,
    "closedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PpeIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PpeIssue_batchId_workerId_kind_key" ON "PpeIssue"("batchId", "workerId", "kind");

-- CreateIndex
CREATE INDEX "PpeIssue_projectId_status_idx" ON "PpeIssue"("projectId", "status");

-- CreateIndex
CREATE INDEX "PpeIssue_workerId_status_idx" ON "PpeIssue"("workerId", "status");

-- CreateIndex
CREATE INDEX "PpeIssue_organizationId_idx" ON "PpeIssue"("organizationId");

-- AddForeignKey
ALTER TABLE "PpeIssue" ADD CONSTRAINT "PpeIssue_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PpeIssue" ADD CONSTRAINT "PpeIssue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PpeIssue" ADD CONSTRAINT "PpeIssue_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PpeIssue" ADD CONSTRAINT "PpeIssue_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PpeIssue" ADD CONSTRAINT "PpeIssue_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Row-level security, as on every tenant table (20261013211500_tenant_rls).
ALTER TABLE "PpeIssue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PpeIssue" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PpeIssue"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
