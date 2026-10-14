-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'PORTAL';

-- AlterTable
ALTER TABLE "Inspection" ADD COLUMN     "witnessNote" TEXT,
ADD COLUMN     "witnessedAt" TIMESTAMP(3),
ADD COLUMN     "witnessedById" TEXT;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_witnessedById_fkey" FOREIGN KEY ("witnessedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- The guest roles for every organisation that exists already (new ones get them at sign-up).
INSERT INTO "Role" ("id", "organizationId", "key", "name")
SELECT gen_random_uuid()::text, o."id", r."key", r."name"
FROM "Organization" o
CROSS JOIN (VALUES ('CLIENT_ENGINEER', 'Client''s Engineer (guest)'), ('CONSULTANT', 'Consultant / PMC (guest)')) AS r("key", "name")
ON CONFLICT ("organizationId", "key") DO NOTHING;
