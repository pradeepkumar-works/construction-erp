-- Review comments: the review stage that made a comment and the day of that review.
ALTER TABLE "DesignComment" ADD COLUMN "stage" TEXT;
ALTER TABLE "DesignComment" ADD COLUMN "madeOn" DATE;
