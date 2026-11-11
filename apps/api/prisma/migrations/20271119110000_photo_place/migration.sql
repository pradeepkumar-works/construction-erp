-- Site photos: when and where each was taken, read from the name the phone gives it (ARCHITECTURE "Site photos").
ALTER TABLE "Attachment" ADD COLUMN "takenAt" TIMESTAMP(3),
ADD COLUMN "lat" DECIMAL(9,6),
ADD COLUMN "lng" DECIMAL(9,6),
ADD COLUMN "accuracyM" INTEGER;

CREATE INDEX "Attachment_organizationId_takenAt_idx" ON "Attachment"("organizationId", "takenAt");

-- Photos already sent from the phone carry the time in their name ("site-20261018-143205-1.jpg", the phone's clock in
-- India); a name that is not a real time is left without one.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT "id", substring("fileName" from 'site-(\d{8}-\d{6})') AS stamp FROM "Attachment" WHERE "fileName" ~ 'site-\d{8}-\d{6}' LOOP
    BEGIN
      UPDATE "Attachment"
      SET "takenAt" = (to_timestamp(r.stamp, 'YYYYMMDD-HH24MISS')::timestamp AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'UTC'
      WHERE "id" = r."id";
    EXCEPTION WHEN others THEN NULL;
    END;
  END LOOP;
END $$;
