-- Hand-offs to the next role in the chain (e2e review, fix 2), and each user's own switch for email alerts.
ALTER TYPE "NotificationType" ADD VALUE 'HANDOFF';
ALTER TABLE "User" ADD COLUMN "emailAlerts" BOOLEAN NOT NULL DEFAULT true;
