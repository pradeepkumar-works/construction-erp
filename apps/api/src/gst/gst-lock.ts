import { ConflictException } from '@nestjs/common';
import { Prisma, type GstSourceKind } from '@prisma/client';
import { liveGstDocWords } from '@erp/shared';

/**
 * Refuses a change to a record that has an IRN or e-way bill being made or made, naming it: the record as the IRP or
 * the e-way bill system holds it cannot change under them (ARCHITECTURE "E-invoices and e-way bills").
 */
export async function assertNoLiveGstDocument(db: Prisma.TransactionClient, organizationId: string, sourceKind: GstSourceKind, sourceId: string) {
  const live = await db.gstDocument.findFirst({ where: { organizationId, sourceKind, sourceId, status: { in: ['PENDING', 'ACTIVE'] } }, select: { kind: true, number: true } });
  if (live) throw new ConflictException(liveGstDocWords(live.kind, live.number));
}
