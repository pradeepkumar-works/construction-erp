-- Ask Nirmaan item 77: roles an admin has opened the assistant to (empty = all staff)
ALTER TABLE "Organization" ADD COLUMN "aiRoles" TEXT[] DEFAULT ARRAY[]::TEXT[];
