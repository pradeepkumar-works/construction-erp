/**
 * Demo weighbridge (item 148): the road site's weighbridge is read by the site office's Connector, and an order for 20 mm
 * aggregate comes in by truck. Three loads were weighed and received at their net weight, two of them short of their
 * challans (so the watch list names the supplier), one is weighed with its GRN still to make, one truck waits for its
 * second weight, and two weights on the bridge are on no ticket yet. Runs once per company (when it has no weighbridge).
 */
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';

const RATE = 1450;
const GST = 5;

export async function seedWeighbridge(prisma: PrismaClient, organizationId: string) {
  if (await prisma.integrationConnection.count({ where: { organizationId, kind: 'WEIGHBRIDGE' } })) return;
  const [admin, store, road, vendor, pc] = await Promise.all([
    prisma.user.findFirst({ where: { organizationId, email: 'admin@demo.com' }, select: { id: true } }),
    prisma.user.findFirst({ where: { organizationId, email: 'store@demo.com' }, select: { id: true } }),
    prisma.project.findFirst({ where: { organizationId, code: 'RD-2026-01' }, select: { id: true } }),
    prisma.vendor.findFirst({ where: { organizationId, name: 'Kalinga Bitumen & Aggregates' }, select: { id: true, name: true } }),
    prisma.connectorAgent.findFirst({ where: { organizationId, name: 'Road site office PC' }, select: { id: true } }),
  ]);
  if (!admin || !road || !vendor || !pc) return;
  const by = store ?? admin;
  const now = Date.now();
  const year = new Date().getUTCFullYear();
  // Times on a day this many days ago, in India's time.
  const at = (daysAgo: number, hhmm: string) => {
    const d = new Date(now + 5.5 * 3_600_000 - daysAgo * 86_400_000).toISOString().slice(0, 10);
    return new Date(`${d}T${hhmm}:00+05:30`);
  };
  const dayOf = (d: Date) => new Date(new Date(d.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10) + 'T00:00:00Z');

  const item =
    (await prisma.item.findFirst({ where: { organizationId, name: 'Aggregate 20 mm', unit: 'MT' }, select: { id: true } })) ??
    (await prisma.item.create({ data: { organizationId, name: 'Aggregate 20 mm', unit: 'MT' }, select: { id: true } }));
  const lastPo = await prisma.purchaseOrder.findFirst({ where: { organizationId, poNo: { startsWith: `PO-${year}-` } }, orderBy: { poNo: 'desc' }, select: { poNo: true } });
  const poNo = `PO-${year}-${String((lastPo ? parseInt(lastPo.poNo.slice(8), 10) : 0) + 1).padStart(4, '0')}`;
  const qty = 300;
  const amount = qty * RATE;
  const gst = (amount * GST) / 100;
  const po = await prisma.purchaseOrder.create({
    data: {
      organizationId,
      projectId: road.id,
      vendorId: vendor.id,
      poNo,
      poDate: dayOf(at(12, '11:00')),
      deliveryBy: dayOf(at(-10, '11:00')),
      paymentTerms: '30 days from the GRN',
      paymentDays: 30,
      subtotal: amount,
      gstAmount: gst,
      total: amount + gst,
      remarks: 'Delivered by tipper; weighed at the site weighbridge',
      status: 'APPROVED',
      submittedById: admin.id,
      submittedAt: at(12, '11:00'),
      reviewedById: admin.id,
      reviewedAt: at(12, '15:00'),
      lines: { create: [{ itemName: 'Aggregate 20 mm', specification: 'Crushed stone, IS 383, graded', unit: 'MT', quantity: qty, rate: RATE, gstRate: GST, amount, gstAmount: gst }] },
    },
    include: { lines: { select: { id: true } } },
  });
  const lineId = po.lines[0].id;

  const bridge = await prisma.integrationConnection.create({
    data: {
      organizationId,
      kind: 'WEIGHBRIDGE',
      name: 'Road site weighbridge',
      projectId: road.id,
      agentId: pc.id,
      config: { source: 'TCP', host: '192.168.1.50', tcpPort: 4001, minKg: 200, stableSeconds: 3 },
      createdById: admin.id,
    },
  });
  const weigh = async (when: Date, kg: number) => {
    const w = await prisma.weighing.create({ data: { organizationId, connectionId: bridge.id, projectId: road.id, at: when, weightKg: kg, stableSeconds: 4 } });
    await prisma.integrationEvent.create({
      data: {
        organizationId,
        connectionId: bridge.id,
        agentId: pc.id,
        status: 'OK',
        externalId: randomUUID(),
        summary: `${kg.toLocaleString('en-IN')} kg, held 4 s. Put it on a ticket in Stock, Weighbridge`,
        detail: { at: when.toISOString(), weightKg: kg, stableSeconds: 4 },
        createdAt: new Date(when.getTime() + 40_000),
      },
    });
    return w.id;
  };

  // [days ago, vehicle, challan, challan MT, first (loaded) at, kg, second (empty) at, kg, received]
  const loads: [number, string, string, number, string, number, string | null, number | null, boolean][] = [
    [9, 'OD 02 AB 4471', 'CH-2231', 18, '08:10', 26_420, '08:41', 8_280, true],
    [6, 'OD 02 AB 4471', 'CH-2264', 18, '09:05', 25_930, '09:38', 8_270, true],
    [3, 'OD 05 C 9182', 'CH-2290', 20, '10:20', 28_610, '10:55', 9_140, true],
    [1, 'OD 02 AB 4471', 'CH-2311', 18, '08:30', 26_300, '09:02', 8_290, false],
  ];
  let no = 0;
  const lastGrn = await prisma.stockEntry.findFirst({ where: { organizationId, entryNo: { startsWith: `GRN-${year}-` } }, orderBy: { entryNo: 'desc' }, select: { entryNo: true } });
  let grnNo = lastGrn ? parseInt(lastGrn.entryNo.slice(9), 10) : 0;
  let lastAt = new Date(0);
  for (const [ago, vehicleNo, challanNo, challanQty, t1, kg1, t2, kg2, received] of loads) {
    const firstAt = at(ago, t1);
    const secondAt = t2 ? at(ago, t2) : null;
    const ticket = await prisma.weighTicket.create({
      data: {
        organizationId,
        projectId: road.id,
        ticketNo: `WB-${year}-${String(++no).padStart(4, '0')}`,
        vehicleNo,
        purchaseOrderId: po.id,
        purchaseOrderLineId: lineId,
        challanNo,
        challanQty,
        firstKg: kg1,
        firstAt,
        firstWeighingId: await weigh(firstAt, kg1),
        secondKg: kg2,
        secondAt,
        secondWeighingId: secondAt && kg2 ? await weigh(secondAt, kg2) : null,
        createdById: by.id,
        createdAt: firstAt,
      },
    });
    lastAt = secondAt ?? firstAt;
    if (!received || !kg2 || !secondAt) continue;
    const net = Math.round(kg1 - kg2) / 1000;
    const short = Math.round((challanQty - net) * 1000) / 1000;
    const entry = await prisma.stockEntry.create({
      data: {
        organizationId,
        projectId: road.id,
        type: 'RECEIPT',
        entryNo: `GRN-${year}-${String(++grnNo).padStart(4, '0')}`,
        date: dayOf(secondAt),
        purchaseOrderId: po.id,
        supplier: vendor.name,
        vendorId: vendor.id,
        challanNo,
        vehicleNo,
        remarks: `Weighed on ${ticket.ticketNo}: net ${net} MT${short > 0.09 ? `, ${short} MT short of the challan's ${challanQty} MT` : ''}`,
        createdById: by.id,
        createdAt: new Date(secondAt.getTime() + 6 * 60_000),
        lines: { create: [{ organizationId, projectId: road.id, itemId: item.id, type: 'RECEIPT', date: dayOf(secondAt), quantity: net, purchaseOrderLineId: lineId }] },
      },
    });
    await prisma.weighTicket.update({ where: { id: ticket.id }, data: { stockEntryId: entry.id } });
    await prisma.auditLog.create({ data: { organizationId, entityType: 'STOCK', entityId: entry.id, action: 'CREATED', actorId: by.id, note: `${entry.entryNo} against ${poNo}, weighed on ${ticket.ticketNo}`, createdAt: entry.createdAt } });
  }

  // This morning: a tipper waits for its second weight, and two weights on the bridge are on no ticket yet.
  const morning = [new Date(now - 50 * 60_000), new Date(now - 22 * 60_000), new Date(now - 7 * 60_000)];
  const firstAt = morning[0];
  await prisma.weighTicket.create({
    data: {
      organizationId,
      projectId: road.id,
      ticketNo: `WB-${year}-${String(++no).padStart(4, '0')}`,
      vehicleNo: 'OD 05 C 9182',
      purchaseOrderId: po.id,
      purchaseOrderLineId: lineId,
      challanNo: 'CH-2330',
      challanQty: 20,
      firstKg: 28_410,
      firstAt,
      firstWeighingId: await weigh(firstAt, 28_410),
      createdById: by.id,
      createdAt: firstAt,
    },
  });
  await weigh(morning[1], 8_140);
  await weigh(morning[2], 27_350);
  lastAt = morning[2];
  await prisma.integrationConnection.update({ where: { id: bridge.id }, data: { lastEventAt: lastAt, lastSuccessAt: lastAt } });
}
