-- A head office manager given every project (design review, November 2026)
ALTER TABLE "User" ADD COLUMN "seesAllProjects" BOOLEAN NOT NULL DEFAULT false;
