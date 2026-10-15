-- Sector progress views (roadmap v4 item 41): structured chainage, floor and village on progress and measurements,
-- and the project's chainage range, floors and villages. Additive only.

-- AlterTable
ALTER TABLE "MeasurementSheet" ADD COLUMN     "chainageFrom" INTEGER,
ADD COLUMN     "chainageTo" INTEGER,
ADD COLUMN     "floor" TEXT,
ADD COLUMN     "village" TEXT;

-- AlterTable
ALTER TABLE "ProgressEntry" ADD COLUMN     "chainageFrom" INTEGER,
ADD COLUMN     "chainageTo" INTEGER,
ADD COLUMN     "floor" TEXT,
ADD COLUMN     "village" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "chainageEnd" INTEGER,
ADD COLUMN     "chainageStart" INTEGER,
ADD COLUMN     "floors" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "villages" TEXT[] DEFAULT ARRAY[]::TEXT[];

