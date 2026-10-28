-- Group companies, phase 1: a group above companies, one sign-in (Login) per person across the companies they work in,
-- and each company's kind and legal details. Additive except that the password and session cut-off move from User to
-- Login: every existing user gets a login of its own (emails were already unique across companies), with the same
-- password, so nobody's sign-in changes. CompanyGroup, GroupAdmin and Login have no organizationId and no policy:
-- they sit above the companies, like AuthAttempt.

CREATE TYPE "CompanyKind" AS ENUM ('CONSTRUCTION', 'CONSULTANCY', 'QUALITY_LAB', 'PLANT', 'HOLDING');

CREATE TABLE "CompanyGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompanyGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Login" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "tokensValidAfter" TIMESTAMP(3),
    "lastOrganizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Login_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Login_email_key" ON "Login"("email");

CREATE TABLE "GroupAdmin" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "loginId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GroupAdmin_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GroupAdmin_groupId_loginId_key" ON "GroupAdmin"("groupId", "loginId");
ALTER TABLE "GroupAdmin" ADD CONSTRAINT "GroupAdmin_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CompanyGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupAdmin" ADD CONSTRAINT "GroupAdmin_loginId_fkey" FOREIGN KEY ("loginId") REFERENCES "Login"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Organization" ADD COLUMN "groupId" TEXT,
ADD COLUMN "kind" "CompanyKind" NOT NULL DEFAULT 'CONSTRUCTION',
ADD COLUMN "legalName" TEXT,
ADD COLUMN "pan" TEXT,
ADD COLUMN "cin" TEXT,
ADD COLUMN "gstin" TEXT;
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CompanyGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- One login per email, from its most recently changed user (sign-in already picked one user per email).
INSERT INTO "Login" ("id", "email", "passwordHash", "tokensValidAfter", "lastOrganizationId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, u."email", u."passwordHash", u."tokensValidAfter", u."organizationId", u."createdAt", CURRENT_TIMESTAMP
FROM (SELECT DISTINCT ON ("email") * FROM "User" ORDER BY "email", "updatedAt" DESC) u;

ALTER TABLE "User" ADD COLUMN "loginId" TEXT;
UPDATE "User" u SET "loginId" = l."id" FROM "Login" l WHERE l."email" = u."email";
ALTER TABLE "User" ALTER COLUMN "loginId" SET NOT NULL;
ALTER TABLE "User" ADD CONSTRAINT "User_loginId_fkey" FOREIGN KEY ("loginId") REFERENCES "Login"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "User_loginId_idx" ON "User"("loginId");
ALTER TABLE "User" DROP COLUMN "passwordHash", DROP COLUMN "tokensValidAfter";
