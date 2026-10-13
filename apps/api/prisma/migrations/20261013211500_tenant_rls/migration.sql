-- Row-level security as a second tenant guard (roadmap D16).
-- The API sets app.org_id (transaction-local) for every query of a signed-in request; rows of other
-- organisations are then invisible and cannot be written. When app.org_id is not set (migrations, the seed,
-- scheduled jobs, sign-in and other public endpoints) the policies let everything through, as before.
-- FORCE makes the policies apply to the table owner too (the API's database role usually owns the tables).
-- Child tables without organizationId (ProjectMember, MaterialRequestItem, AttendanceLine, MeasurementLine,
-- PushToken) are reached only through a parent row and are not listed.
-- To undo: run prisma/rls-rollback.sql (or set TENANT_RLS=off on the API to stop setting app.org_id).

CREATE OR REPLACE FUNCTION app_current_org() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.org_id', true), '') $$;

ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Organization" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Organization"
  USING (app_current_org() IS NULL OR "id" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "id" = app_current_org());

ALTER TABLE "Role" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Role" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Role"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "ApprovalRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApprovalRule" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ApprovalRule"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "User"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "Project" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Project" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Project"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "BoqItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BoqItem" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "BoqItem"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "Activity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Activity" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Activity"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "ActivityTemplate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ActivityTemplate" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ActivityTemplate"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "ProgressEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProgressEntry" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "ProgressEntry"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "DailyReport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DailyReport" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "DailyReport"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "MaterialRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MaterialRequest" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MaterialRequest"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "AttendanceSheet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AttendanceSheet" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AttendanceSheet"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "Item" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Item" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Item"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "StockEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockEntry" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StockEntry"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "StockTxn" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockTxn" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StockTxn"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "StockMinLevel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockMinLevel" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StockMinLevel"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "Equipment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Equipment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Equipment"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "MachineryLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MachineryLog" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MachineryLog"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "Expense" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Expense" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Expense"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "Risk" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Risk" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Risk"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "MeasurementSheet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MeasurementSheet" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "MeasurementSheet"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "Attachment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Attachment" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Attachment"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "AuditLog"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Notification"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "PasswordToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PasswordToken" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "PasswordToken"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());

ALTER TABLE "LabourRate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LabourRate" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "LabourRate"
  USING (app_current_org() IS NULL OR "organizationId" = app_current_org())
  WITH CHECK (app_current_org() IS NULL OR "organizationId" = app_current_org());
