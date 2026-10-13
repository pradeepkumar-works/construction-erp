import { Prisma } from '@prisma/client';

/**
 * Next document number such as EXP-2026-0007, inside a transaction. Takes a per-organisation advisory
 * lock (released at commit) so two requests never get the same number; `latest` returns the highest
 * existing number with the prefix.
 */
export async function nextDocNo(
  tx: Prisma.TransactionClient,
  organizationId: string,
  kind: string,
  latest: (prefix: string) => Promise<string | null>,
): Promise<string> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${kind}:${organizationId}`}))`;
  const prefix = `${kind}-${new Date().getUTCFullYear()}-`;
  const last = await latest(prefix);
  const next = (last ? parseInt(last.slice(prefix.length), 10) : 0) + 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}
