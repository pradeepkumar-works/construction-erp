-- Why a filed PDF could not be read (Ask the contract), shown on its page view.
ALTER TABLE "Attachment" ADD COLUMN "textError" TEXT;

-- Files that came out with no text were read before reading could report why; read them again.
UPDATE "Attachment" SET "textIndexedAt" = NULL, "textPages" = NULL WHERE "textIndexedAt" IS NOT NULL AND "textPages" = 0;
