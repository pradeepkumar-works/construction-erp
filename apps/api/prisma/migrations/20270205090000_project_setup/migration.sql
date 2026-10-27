-- Project setup (finding 6 of the October review): a client's usual terms, and hiding a project's setup checklist.
ALTER TABLE "Client" ADD COLUMN "retentionPct" DECIMAL(5,2),
ADD COLUMN "securityDepositPct" DECIMAL(5,2),
ADD COLUMN "tdsPct" DECIMAL(5,2),
ADD COLUMN "gstTdsPct" DECIMAL(5,2),
ADD COLUMN "labourCessPct" DECIMAL(5,2),
ADD COLUMN "gstRate" DECIMAL(5,2),
ADD COLUMN "defectLiabilityMonths" INTEGER,
ADD COLUMN "clientPaymentDays" INTEGER;

ALTER TABLE "Project" ADD COLUMN "setupHiddenAt" TIMESTAMP(3);
