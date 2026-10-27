-- Finalise L1 (Purchases › Requests to order): purchase's choice of supplier on a material request.
ALTER TABLE "MaterialRequest" ADD COLUMN "finalQuotationId" TEXT;
ALTER TABLE "MaterialRequest" ADD COLUMN "finalSplit" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MaterialRequest" ADD COLUMN "finalRank" INTEGER;
ALTER TABLE "MaterialRequest" ADD COLUMN "finalReason" TEXT;
ALTER TABLE "MaterialRequest" ADD COLUMN "finalisedAt" TIMESTAMP(3);
ALTER TABLE "MaterialRequest" ADD COLUMN "finalisedById" TEXT;

ALTER TABLE "MaterialRequest" ADD CONSTRAINT "MaterialRequest_finalQuotationId_fkey" FOREIGN KEY ("finalQuotationId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MaterialRequest" ADD CONSTRAINT "MaterialRequest_finalisedById_fkey" FOREIGN KEY ("finalisedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
