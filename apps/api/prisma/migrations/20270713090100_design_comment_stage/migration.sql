-- Review comments: the review stage that made a comment and the day of that review.
-- Runs again safely, as 20270711090100_design_comment_stage applied the same before the rename.
ALTER TABLE "DesignComment" ADD COLUMN IF NOT EXISTS "stage" TEXT;
ALTER TABLE "DesignComment" ADD COLUMN IF NOT EXISTS "madeOn" DATE;
