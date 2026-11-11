import { ConflictException } from '@nestjs/common';
import { Prisma, type GstSourceKind } from '@prisma/client';
import { GST_SOURCE_DOC, liveGstDocWords } from '@erp/shared';

/**
 * Takes a record's GST lock for the rest of the transaction: the one `EinvoiceService.generate` takes while it writes the
 * record's PENDING document. A change to the record that holds it cannot pass between that document being written and
 * the IRP being asked; it waits, then sees the document and is refused.
 */
export async function lockGstSource(tx: Prisma.TransactionClient, organizationId: string, sourceKind: GstSourceKind, sourceId: string) {
  const key = `GST:${organizationId}:${GST_SOURCE_DOC[sourceKind]}:${sourceKind}:${sourceId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

/**
 * Refuses a change to a record that has an IRN or e-way bill being made or made, naming it: the record as the IRP or
 * the e-way bill system holds it cannot change under them (ARCHITECTURE "E-invoices and e-way bills"). Called inside
 * the change's own transaction, which it holds the record's GST lock for.
 */
export async function assertNoLiveGstDocument(tx: Prisma.TransactionClient, organizationId: string, sourceKind: GstSourceKind, sourceId: string) {
  await lockGstSource(tx, organizationId, sourceKind, sourceId);
  const live = await tx.gstDocument.findFirst({ where: { organizationId, sourceKind, sourceId, status: { in: ['PENDING', 'ACTIVE'] } }, select: { kind: true, number: true } });
  if (live) throw new ConflictException(liveGstDocWords(live.kind, live.number));
}
