import { Prisma } from '@prisma/client';
import { docNoPrefix, docPatternOf, nextRunningNo } from '@erp/shared';
import { todayIn } from '../notifications/time';

/**
 * Next document number inside a transaction, from the company's pattern for the kind (`Organization.docSeries`,
 * Settings › Numbering), else the standard EXP-2026-0007. Takes a per-organisation advisory lock (released at commit) so
 * two requests never get the same number. The running number lives in `DocCounter` under the prefix it was given for;
 * the first number under a prefix starts after `latest(prefix)`, the highest number already issued with it.
 */
export async function nextDocNo(
  tx: Prisma.TransactionClient,
  organizationId: string,
  kind: string,
  latest: (prefix: string) => Promise<string | null>,
  date: string = todayIn(),
): Promise<string> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${kind}:${organizationId}`}))`;
  const org = await tx.organization.findUnique({ where: { id: organizationId }, select: { docSeries: true } });
  const prefix = docNoPrefix(docPatternOf(org?.docSeries, kind), date);
  const key = { organizationId_kind_prefix: { organizationId, kind, prefix } };
  const counter = await tx.docCounter.findUnique({ where: key, select: { last: true } });
  const next = counter ? counter.last + 1 : nextRunningNo(prefix, await latest(prefix));
  await tx.docCounter.upsert({ where: key, create: { organizationId, kind, prefix, last: next }, update: { last: next } });
  return `${prefix}${String(next).padStart(4, '0')}`;
}
