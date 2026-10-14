-- WhatsApp through WATI: the morning approvals digest, test-due and payments-due reminders also go to phones.
ALTER TYPE "NotificationType" ADD VALUE 'BILLS_DUE';
ALTER TYPE "MessageTemplate" ADD VALUE 'APPROVAL_DIGEST' BEFORE 'INVITE';
ALTER TYPE "MessageTemplate" ADD VALUE 'TEST_DUE' BEFORE 'INVITE';
ALTER TYPE "MessageTemplate" ADD VALUE 'BILLS_DUE' BEFORE 'INVITE';
