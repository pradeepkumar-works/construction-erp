-- Files that failed again under the earlier reader while this fix was building: read them again with it.
UPDATE "Attachment" SET "textIndexedAt" = NULL, "textPages" = NULL, "textError" = NULL WHERE "textError" IS NOT NULL;
