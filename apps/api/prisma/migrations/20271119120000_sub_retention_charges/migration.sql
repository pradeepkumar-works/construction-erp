-- Subcontractor retention paid back, and back-charges by kind (ARCHITECTURE "Subcontracts", Retention release and back-charges).
ALTER TABLE "SubcontractBill" ADD COLUMN "retentionReleased" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN "isRelease" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "SubcontractBillCharge" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "kindCode" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SubcontractBillCharge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SubcontractBillCharge_billId_idx" ON "SubcontractBillCharge"("billId");

ALTER TABLE "SubcontractBillCharge" ADD CONSTRAINT "SubcontractBillCharge_billId_fkey" FOREIGN KEY ("billId") REFERENCES "SubcontractBill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- An older bill's single other recovery becomes one "Other" charge with its note.
INSERT INTO "SubcontractBillCharge" ("id", "billId", "kindCode", "amount", "note", "sortOrder")
SELECT gen_random_uuid()::text, "id", 'other', "otherDeduction", COALESCE(NULLIF(trim("otherDeductionNote"), ''), 'Other deduction'), 0
FROM "SubcontractBill" WHERE "otherDeduction" > 0;
