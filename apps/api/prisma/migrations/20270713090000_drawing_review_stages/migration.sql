-- Drawings: review stages on a submittal (proof checker, TPIA, PIU, head office...), each stage's code on a round,
-- and the component a drawing belongs to (Drawings by component).
ALTER TABLE "DesignSubmission" ADD COLUMN "stages" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "DesignSubmissionRound" ADD COLUMN "marks" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "Document" ADD COLUMN "workElementId" TEXT;
CREATE INDEX "Document_workElementId_idx" ON "Document"("workElementId");
ALTER TABLE "Document" ADD CONSTRAINT "Document_workElementId_fkey" FOREIGN KEY ("workElementId") REFERENCES "WorkElement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
