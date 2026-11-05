-- Drawings: review stages on a submittal (proof checker, TPIA, PIU, head office...), each stage's code on a round,
-- and the component a drawing belongs to (Drawings by component).
-- Written to run again safely: a preview of #313 applied the same SQL as 20270711090000_drawing_review_stages before
-- the rename, so the shared database already has these columns (vercel-build.sh marks that failed attempt rolled back).
ALTER TABLE "DesignSubmission" ADD COLUMN IF NOT EXISTS "stages" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "DesignSubmissionRound" ADD COLUMN IF NOT EXISTS "marks" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "workElementId" TEXT;
CREATE INDEX IF NOT EXISTS "Document_workElementId_idx" ON "Document"("workElementId");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Document_workElementId_fkey') THEN
    ALTER TABLE "Document" ADD CONSTRAINT "Document_workElementId_fkey" FOREIGN KEY ("workElementId") REFERENCES "WorkElement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
