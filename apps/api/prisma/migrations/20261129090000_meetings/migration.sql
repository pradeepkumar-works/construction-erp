-- CreateEnum
CREATE TYPE "MeetingKind" AS ENUM ('PROGRESS', 'CLIENT', 'SUBCONTRACTOR', 'DESIGN', 'SAFETY', 'QUALITY', 'OTHER');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('DRAFT', 'ISSUED');

-- CreateEnum
CREATE TYPE "MeetingPointKind" AS ENUM ('NOTE', 'DECISION');

-- CreateEnum
CREATE TYPE "MeetingActionStatus" AS ENUM ('OPEN', 'DONE', 'DROPPED');

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "meetingNo" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "MeetingKind" NOT NULL DEFAULT 'PROGRESS',
    "heldOn" DATE NOT NULL,
    "startTime" TEXT,
    "venue" TEXT,
    "chairedBy" TEXT,
    "agenda" TEXT,
    "nextOn" DATE,
    "status" "MeetingStatus" NOT NULL DEFAULT 'DRAFT',
    "issuedAt" TIMESTAMP(3),
    "issuedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingAttendee" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "organisation" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "present" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MeetingAttendee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingPoint" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "kind" "MeetingPointKind" NOT NULL DEFAULT 'NOTE',
    "text" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MeetingPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingAction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "ownerName" TEXT NOT NULL,
    "dueOn" DATE,
    "status" "MeetingActionStatus" NOT NULL DEFAULT 'OPEN',
    "doneOn" DATE,
    "closeNote" TEXT,
    "closedById" TEXT,
    "rfiId" TEXT,
    "ncrId" TEXT,
    "variationId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Meeting_organizationId_projectId_heldOn_idx" ON "Meeting"("organizationId", "projectId", "heldOn");

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_organizationId_meetingNo_key" ON "Meeting"("organizationId", "meetingNo");

-- CreateIndex
CREATE INDEX "MeetingAttendee_meetingId_idx" ON "MeetingAttendee"("meetingId");

-- CreateIndex
CREATE INDEX "MeetingAttendee_organizationId_idx" ON "MeetingAttendee"("organizationId");

-- CreateIndex
CREATE INDEX "MeetingPoint_meetingId_idx" ON "MeetingPoint"("meetingId");

-- CreateIndex
CREATE INDEX "MeetingPoint_organizationId_idx" ON "MeetingPoint"("organizationId");

-- CreateIndex
CREATE INDEX "MeetingAction_organizationId_projectId_status_idx" ON "MeetingAction"("organizationId", "projectId", "status");

-- CreateIndex
CREATE INDEX "MeetingAction_ownerUserId_status_idx" ON "MeetingAction"("ownerUserId", "status");

-- CreateIndex
CREATE INDEX "MeetingAction_meetingId_idx" ON "MeetingAction"("meetingId");

-- CreateIndex
CREATE UNIQUE INDEX "SubcontractEnquiry_awardedQuoteId_key" ON "SubcontractEnquiry"("awardedQuoteId");

-- AddForeignKey
ALTER TABLE "SubcontractEnquiry" ADD CONSTRAINT "SubcontractEnquiry_awardedQuoteId_fkey" FOREIGN KEY ("awardedQuoteId") REFERENCES "SubcontractQuote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAttendee" ADD CONSTRAINT "MeetingAttendee_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAttendee" ADD CONSTRAINT "MeetingAttendee_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAttendee" ADD CONSTRAINT "MeetingAttendee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingPoint" ADD CONSTRAINT "MeetingPoint_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingPoint" ADD CONSTRAINT "MeetingPoint_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAction" ADD CONSTRAINT "MeetingAction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAction" ADD CONSTRAINT "MeetingAction_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAction" ADD CONSTRAINT "MeetingAction_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAction" ADD CONSTRAINT "MeetingAction_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAction" ADD CONSTRAINT "MeetingAction_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAction" ADD CONSTRAINT "MeetingAction_rfiId_fkey" FOREIGN KEY ("rfiId") REFERENCES "Rfi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAction" ADD CONSTRAINT "MeetingAction_ncrId_fkey" FOREIGN KEY ("ncrId") REFERENCES "Ncr"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingAction" ADD CONSTRAINT "MeetingAction_variationId_fkey" FOREIGN KEY ("variationId") REFERENCES "Variation"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- An action is closed with its day; the time is HH:mm.
ALTER TABLE "MeetingAction" ADD CONSTRAINT "MeetingAction_closed" CHECK (("status" = 'OPEN') = ("doneOn" IS NULL));
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_startTime" CHECK ("startTime" IS NULL OR "startTime" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

-- Row-level security: each organisation sees only its own rows (see 20261013211500_tenant_rls).
ALTER TABLE "Meeting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Meeting" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Meeting"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "MeetingAttendee" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MeetingAttendee" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MeetingAttendee"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "MeetingPoint" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MeetingPoint" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MeetingPoint"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
ALTER TABLE "MeetingAction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MeetingAction" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MeetingAction"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
