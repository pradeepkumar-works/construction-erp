-- PDFs that failed to read because pdf.js could not load on the server (DOMMatrix missing): read them again.
UPDATE "Attachment" SET "textIndexedAt" = NULL, "textPages" = NULL, "textError" = NULL WHERE "textError" IS NOT NULL;
