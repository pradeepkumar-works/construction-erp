-- The tender factor an item-rate RA bill's BOQ items were billed at (1 + the tender premium above or below the
-- schedule of rates), kept on the bill so its print and record say so.
ALTER TABLE "RaBill" ADD COLUMN "tenderFactor" DECIMAL(9,6);
