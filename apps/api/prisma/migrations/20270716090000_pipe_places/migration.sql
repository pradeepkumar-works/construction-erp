-- A pipe network keeps where it is on the earth, so it can go back to Google Earth and be drawn on a map
ALTER TABLE "PipeNode" ADD COLUMN "lat" DOUBLE PRECISION, ADD COLUMN "lon" DOUBLE PRECISION;
ALTER TABLE "PipeSegment" ADD COLUMN "path" JSONB;
