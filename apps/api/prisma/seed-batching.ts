/**
 * Demo batching plant controller (item 149): the Patia plant's controller writes a day's batch report to D:\Batch Reports
 * on its control room computer, read by a Connector there, with its columns already matched. Today's two trucks already
 * sent came from its batches; two more batches wait for their challans (one made five hours ago, so it shows late), and a
 * trial batch was set aside. Runs once per company (when it has no batching plant connection), after the RMC demo.
 */
import { createHash, randomBytes } from 'crypto';
import { PrismaClient } from '@prisma/client';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');

const HEADERS = ['Batch No', 'Date', 'Time', 'Recipe', 'Qty m3', 'Truck', 'CEM1 act (kg)', 'Sand act (kg)', 'CA 20mm act (kg)', 'CA 10mm act (kg)', 'Admix (kg)', 'Water (L)'];

export async function seedBatching(prisma: PrismaClient, organizationId: string) {
  if (await prisma.integrationConnection.count({ where: { organizationId, kind: 'BATCHING_PLANT' } })) return;
  const [admin, plant] = await Promise.all([
    prisma.user.findFirst({ where: { organizationId, email: 'admin@demo.com' }, select: { id: true } }),
    prisma.project.findFirst({ where: { organizationId, type: 'PLANT', code: 'RMC-01' }, select: { id: true } }),
  ]);
  if (!admin || !plant) return;
  const item = (name: string) => prisma.item.findFirst({ where: { organizationId, name }, select: { id: true } });
  const [cement, sand, a20, a10, admix] = await Promise.all(['OPC 53 Grade Cement', 'River Sand (Zone II)', 'Aggregate 20mm', 'Aggregate 10mm', 'Admixture PCE (Master Glenium)'].map(item));
  if (!cement || !sand || !a20 || !a10 || !admix) return;
  const now = Date.now();
  const ago = (min: number) => new Date(now - min * 60_000);

  const pc = await prisma.connectorAgent.create({
    data: {
      organizationId,
      name: 'Plant control room PC',
      projectId: plant.id,
      tokenHash: hash(`nct_${randomBytes(32).toString('base64url')}`),
      pairedAt: ago(5 * 1440),
      lastSeenAt: ago(1),
      version: '0.3.0',
      hostname: 'RMC-CTRL-PC',
      createdById: admin.id,
    },
  });
  const columns = {
    fields: { BATCH_NO: 'Batch No', DATE: 'Date', TIME: 'Time', QUANTITY: 'Qty m3', MIX: 'Recipe', TRUCK: 'Truck' },
    materials: [
      { column: 'CEM1 act (kg)', itemId: cement.id, perUnit: 50 },
      { column: 'Sand act (kg)', itemId: sand.id, perUnit: 1600 },
      { column: 'CA 20mm act (kg)', itemId: a20.id, perUnit: 1550 },
      { column: 'CA 10mm act (kg)', itemId: a10.id, perUnit: 1500 },
      { column: 'Admix (kg)', itemId: admix.id, perUnit: 1 },
    ],
  };
  const conn = await prisma.integrationConnection.create({
    data: {
      organizationId,
      kind: 'BATCHING_PLANT',
      name: 'Patia plant batcher',
      projectId: plant.id,
      agentId: pc.id,
      config: { folder: 'D:\\Batch Reports', extensions: ['csv'], sinceDays: 2, columns },
      createdById: admin.id,
    },
  });

  // Times in India: the report prints the day and the time.
  const ist = (d: Date) => new Date(d.getTime() + 5.5 * 3_600_000).toISOString();
  const file = `BATCH_${ist(new Date(now)).slice(0, 10).replace(/-/g, '')}.CSV`;
  let line = 1;
  const row = async (no: number, when: Date, recipe: string, m3: number, truck: string, kg: number[], tie: { rmcBatchId?: string; dismissReason?: string } = {}) => {
    line += 1;
    const s = ist(when);
    const cells = [String(no), `${s.slice(8, 10)}-${s.slice(5, 7)}-${s.slice(0, 4)}`, s.slice(11, 16), recipe, m3.toFixed(1), truck, ...kg.map((k) => k.toLocaleString('en-IN', { maximumFractionDigits: 1 }).replace(/,/g, '')), String(Math.round(m3 * 160))];
    const fields = Object.fromEntries(HEADERS.map((h, i) => [h, cells[i] ?? '']));
    const rowKey = `pb-${createHash('sha1').update(`${file}\n${cells.join(',')}`).digest('hex')}`;
    await prisma.plantBatchRow.create({
      data: {
        organizationId,
        connectionId: conn.id,
        plantId: plant.id,
        rowKey,
        file,
        line,
        fields,
        batchNo: String(no),
        rmcBatchId: tie.rmcBatchId ?? null,
        dismissedAt: tie.dismissReason ? new Date(when.getTime() + 20 * 60_000) : null,
        dismissReason: tie.dismissReason ?? null,
        takenAt: new Date(when.getTime() + 60_000),
      },
    });
    await prisma.integrationEvent.create({
      data: {
        organizationId,
        connectionId: conn.id,
        agentId: pc.id,
        status: 'OK',
        externalId: rowKey,
        summary: `Batch ${no}: ${m3.toFixed(3)} m³ ${recipe}${truck ? `, ${truck}` : ''}. Make its challan in RMC plant, From the batcher`,
        detail: { key: rowKey, file, line, fields },
        createdAt: new Date(when.getTime() + 60_000),
      },
    });
  };

  // A trial batch before the day's pour, set aside; the two trucks sent today; then two batches waiting for challans.
  const sent = await prisma.rmcBatch.findMany({ where: { organizationId, plantId: plant.id, date: { gte: new Date(ist(new Date(now)).slice(0, 10) + 'T00:00:00Z') } }, orderBy: { dispatchedAt: 'asc' }, select: { id: true, dispatchedAt: true, truck: true, quantity: true } });
  const m25 = (m3: number, extra = 1) => [2280 * extra, 4320, 4836, 2970, 19.2].map((k) => (k * m3) / 6);
  await row(1200, ago(7 * 60), 'M25-OPC-01', 0.5, '', m25(0.5), { dismissReason: 'Trial batch for the slump check before the day’s pour' });
  let no = 1201;
  for (const b of sent) {
    await row(no, new Date(b.dispatchedAt.getTime() - 5 * 60_000), 'M25-OPC-01', Number(b.quantity), b.truck ?? '', m25(Number(b.quantity), no === 1201 ? 1.012 : 1), { rmcBatchId: b.id });
    no += 1;
  }
  await row(no, ago(5 * 60), 'M25-OPC-01', 6, 'OD-02-AX-1103', [2334, 4410, 4836, 2970, 19.2]);
  await row(no + 1, ago(40), 'M20-OPC-01', 6, 'OD-02-AX-1104', [1980, 4608, 5022, 3060, 15.6]);
  await prisma.integrationConnection.update({ where: { id: conn.id }, data: { lastEventAt: ago(39), lastSuccessAt: ago(39) } });
}
