-- An ADMS device is held to the address it first called from (review H1). Additive: three nullable columns.
ALTER TABLE "BiometricDevice" ADD COLUMN "pinnedAddress" TEXT;
ALTER TABLE "BiometricDevice" ADD COLUMN "pendingAddress" TEXT;
ALTER TABLE "BiometricDevice" ADD COLUMN "pendingAddressAt" TIMESTAMP(3);
