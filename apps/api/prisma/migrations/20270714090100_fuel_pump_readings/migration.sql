-- Fuel slips with the bowser's readings (item 178)
ALTER TABLE "StockEntry" ADD COLUMN "pumpStart" DECIMAL(18,2);
ALTER TABLE "StockEntry" ADD COLUMN "pumpEnd" DECIMAL(18,2);
