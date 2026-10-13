import { Prisma } from '@prisma/client';

/**
 * Offline clients create entries with their own UUID so a retry after a lost response does not
 * create a second record. The create services call `findExisting` first and treat a unique-id
 * violation (two retries racing) as "already created".
 */
export const isUniqueViolation = (e: unknown): boolean => e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';

export const CLIENT_ID_DOC = {
  description:
    'Optional client-generated UUID (v4). Lets the mobile app create the entry offline and retry safely: a second ' +
    'request with the same id returns the existing entry instead of creating another.',
  example: '3c8f6b1e-6f2a-4a0e-9a4c-1f6a6c5d9b2e',
};
