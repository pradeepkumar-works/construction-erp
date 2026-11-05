-- Item codes and standards (item 176)
ALTER TABLE "Item" ADD COLUMN "code" TEXT;
ALTER TABLE "Item" ADD COLUMN "standard" TEXT;
CREATE UNIQUE INDEX "Item_organizationId_code_key" ON "Item"("organizationId", "code");
