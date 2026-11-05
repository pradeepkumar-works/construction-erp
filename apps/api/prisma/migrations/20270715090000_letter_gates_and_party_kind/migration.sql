-- Approval per letter category, and the kind of office in the address book (items 179 and 182)
ALTER TABLE "Organization" ADD COLUMN "letterGates" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "LetterContact" ADD COLUMN "kind" TEXT;
