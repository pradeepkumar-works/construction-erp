/**
 * Making an IRN or e-way bill when things go wrong (ARCHITECTURE "E-invoices and e-way bills", Making one), against the
 * database with a stub provider and stub records, so nothing outside is called:
 *
 * - two requests at once ask the provider once, and the second is told it is being made;
 * - no answer leaves the document PENDING and its record locked (504); a retry inside the provider's answer time is
 *   refused, and one after it sends the payload first sent, even though the record's figures moved since;
 * - a record that changes between being read and its PENDING row being written is marked FAILED and nothing is sent;
 * - a stale e-way bill is looked up by its challan first and taken from there;
 * - a refusal marks the row FAILED and unlocks the record.
 *
 * Runs on the demo company with documents of its own (made-up record ids), removed afterwards.
 *
 *   DATABASE_URL=… node dist/scripts/einvoice-race-test.js
 */
import { einvoicePayload, einvoiceProblems, ewayProblems, type EinvoiceSource, type EwaySource, type GstParty, type RoleKey } from '@erp/shared';
import type { Built } from '../gst/einvoice.service';
import type { EwbMade, GstProvider, ProviderResult } from '../gst/providers/gst-provider';
import { payloadHash } from '../gst/einvoice-rules';
import { FakeGstProvider } from '../gst/providers/fake-gst.provider';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A provider that answers like the fake, slowly or not at all as a test asks, counting what it was sent. */
class StubProvider implements GstProvider {
  readonly name = 'FAKE';
  answerWithinMs = 5_000;
  delayMs = 0;
  answer: 'made' | 'none' | 'refused' = 'made';
  found: EwbMade | null = null;
  sent: { kind: 'IRN' | 'EWB'; hash: string }[] = [];
  looked = 0;
  private fake = new FakeGstProvider();

  async ready() {
    return null;
  }
  private async outcome<T>(make: () => Promise<ProviderResult<T>>): Promise<ProviderResult<T>> {
    await sleep(this.delayMs);
    if (this.answer === 'none') return { ok: false, error: 'The GSP gave no answer: The operation was aborted due to timeout', unanswered: true, raw: null };
    if (this.answer === 'refused') return { ok: false, error: 'The IRP holds IRN abc for other figures: cancel it there within 24 hours or raise a credit note', raw: null };
    return make();
  }
  generateIrn(ctx: { organizationId: string; gstin: string }, payload: Parameters<GstProvider['generateIrn']>[1]) {
    this.sent.push({ kind: 'IRN', hash: payloadHash(payload) });
    return this.outcome(() => this.fake.generateIrn(ctx, payload));
  }
  generateEwb(ctx: { organizationId: string; gstin: string }, payload: Parameters<GstProvider['generateEwb']>[1]) {
    this.sent.push({ kind: 'EWB', hash: payloadHash(payload) });
    return this.outcome(() => this.fake.generateEwb(ctx, payload));
  }
  async findEwb() {
    this.looked++;
    return { ok: true as const, value: this.found, raw: null };
  }
  cancelIrn = this.fake.cancelIrn.bind(this.fake);
  extendEwb = this.fake.extendEwb.bind(this.fake);
  cancelEwb = this.fake.cancelEwb.bind(this.fake);
}

const company: GstParty = { gstin: '21AABCS1234F1Z5', legalName: 'Race Test Constructions Pvt Ltd', address: 'Plot 12, Saheed Nagar, Bhubaneswar 751007', who: 'the company', fixAt: 'on Company settings' };
const client: GstParty = { gstin: '21AAAGR0123K1ZQ', legalName: 'Roads Division, Khordha', address: 'Roads Division, Khordha 752055', who: 'the client', fixAt: 'in Clients' };
const invoice = (docNo: string, taxable: string): EinvoiceSource => ({
  docNo,
  docDate: '2026-11-10',
  seller: company,
  buyer: client,
  placeOfSupply: '21',
  lines: [{ description: 'Works contract (race test)', hsn: '995421', isService: true, quantity: null, unit: null, taxable, gstRate: '18' }],
  igst: '0.00',
  cgst: (Number(taxable) * 0.09).toFixed(2),
  sgst: (Number(taxable) * 0.09).toFixed(2),
  hsnFixAt: 'on Company settings',
});
const irnBuilt = (inv: EinvoiceSource): Built => ({ docNo: inv.docNo, offered: true, needed: true, reason: '', problems: einvoiceProblems(inv), invoice: inv, consignment: null, vehicleNo: null, value: null });
const consignment = (docNo: string): EwaySource => ({
  purpose: 'OWN_USE',
  docNo,
  docDate: '2026-11-10',
  from: company,
  to: company,
  dispatchFrom: { ...company, address: 'Central store, Rasulgarh, Bhubaneswar 751010' },
  shipTo: { ...company, address: 'NH55 camp, Khordha 752055' },
  lines: [{ name: 'TMT bar (race test)', hsn: '72142090', quantity: '2.000', unit: 'MT', taxable: '122000.00', gstRate: '0' }],
  igst: '0.00',
  cgst: '0.00',
  sgst: '0.00',
  hsnFixAt: 'in Items',
});

async function main(): Promise<number> {
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../app.module');
  const { PrismaService } = await import('../prisma/prisma.service');
  const { EinvoiceService } = await import('../gst/einvoice.service');
  const { assertNoLiveGstDocument } = await import('../gst/gst-lock');
  const { setTenant, tenantMiddleware } = await import('../prisma/tenant-context');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const gst = app.get(EinvoiceService);
  const org = await prisma.organization.findFirstOrThrow({ where: { code: process.env.AI_CHECK_ORG ?? 'DEMO' } });
  const problems: string[] = [];
  let checks = 0;
  const check = (name: string, ok: boolean, detail = '') => {
    checks++;
    console.log(`${ok ? '✓' : '✗'} ${name}${ok || !detail ? '' : `\n  ${detail}`}`);
    if (!ok) problems.push(name);
  };
  const failure = async (p: Promise<unknown>) => p.then(() => null, (e: Error) => e);
  const stamp = String(Date.now()).slice(-6);
  const ids: string[] = [];
  const id = (k: string) => {
    const v = `race-${k}-${stamp}`;
    ids.push(v);
    return v;
  };
  const stub = new StubProvider();
  gst.useProvider(stub);
  const rows = (sourceId: string) => prisma.gstDocument.findMany({ where: { organizationId: org.id, sourceId }, orderBy: { createdAt: 'asc' } });
  const locked = (sourceKind: 'RA_BILL' | 'STOCK_TRANSFER', sourceId: string) => failure(prisma.$transaction((tx) => assertNoLiveGstDocument(tx, org.id, sourceKind, sourceId)));

  await new Promise<void>((resolve, reject) =>
    tenantMiddleware(null, null, () => {
      setTenant(org.id);
      (async () => {
        const u = await prisma.user.findFirstOrThrow({ where: { organizationId: org.id, email: 'admin@demo.com' }, include: { role: true } });
        const admin = { id: u.id, organizationId: org.id, roleKey: u.role.key as RoleKey, email: u.email, fullName: u.fullName };
        try {
          // 1. Two at once: one call to the provider, one IRN, the other told it is being made.
          const a = id('a');
          const invA = invoice(`RTA/${stamp}`, '100000.00');
          gst.useLoader('RA_BILL', async () => irnBuilt(invA));
          Object.assign(stub, { delayMs: 400, answer: 'made', answerWithinMs: 5_000, sent: [] });
          const both = await Promise.allSettled([gst.generate(admin, 'RA_BILL', a, {}), gst.generate(admin, 'RA_BILL', a, {})]);
          const docsA = await rows(a);
          check('two generates at once ask the provider once', stub.sent.length === 1, `${stub.sent.length} calls`);
          check('and leave one ACTIVE IRN, nothing failed', docsA.length === 1 && docsA[0].status === 'ACTIVE', docsA.map((d) => d.status).join(', '));
          const refused = both.filter((b) => b.status === 'rejected').map((b) => ((b as PromiseRejectedResult).reason as Error).message);
          check('the other is told it is being made', refused.length === 1 && refused.every((m) => /is being made: open it again in a minute/.test(m)), refused.join(' | '));

          // 2. No answer: PENDING and locked; a retry inside the answer time is refused; after it, the first payload goes.
          const b = id('b');
          const invB = invoice(`RTB/${stamp}`, '200000.00');
          let figures = invB;
          gst.useLoader('RA_BILL', async () => irnBuilt(figures));
          Object.assign(stub, { delayMs: 0, answer: 'none', answerWithinMs: 1_500, sent: [] });
          const timedOut = await failure(gst.generate(admin, 'RA_BILL', b, {}));
          check('no answer is a 504 that says to try again', timedOut?.constructor.name === 'GatewayTimeoutException' && timedOut.message === 'The IRP did not answer. Try again in a minute.', `${timedOut?.constructor.name}: ${timedOut?.message}`);
          const [pending] = await rows(b);
          check('the document stays PENDING, never FAILED', pending?.status === 'PENDING' && /no answer/.test(pending.error ?? ''), `${pending?.status} ${pending?.error}`);
          const lockedB = await locked('RA_BILL', b);
          check('and keeps its record locked', !!lockedB && /being made/.test(lockedB.message), lockedB?.message);
          stub.answer = 'made';
          const tooSoon = await failure(gst.generate(admin, 'RA_BILL', b, {}));
          check('asking again inside the answer time is refused, the provider not called', /being made/.test(tooSoon?.message ?? '') && stub.sent.length === 1, `${tooSoon?.message}; ${stub.sent.length} calls`);
          figures = invoice(invB.docNo, '250000.00');
          await sleep(1_600);
          await gst.generate(admin, 'RA_BILL', b, {});
          const docsB = await rows(b);
          check('after it, the stale one is asked for again, the same row made ACTIVE', docsB.length === 1 && docsB[0].id === pending.id && docsB[0].status === 'ACTIVE', docsB.map((d) => d.status).join(', '));
          check('with the payload first sent, not the figures read today', stub.sent.length === 2 && stub.sent[1].hash === pending.payloadHash && stub.sent[1].hash !== payloadHash(einvoicePayload(figures)));

          // 3. The record changes between being read and its row being written: FAILED, nothing sent.
          const c = id('c');
          let reads = 0;
          gst.useLoader('RA_BILL', async () => irnBuilt(invoice(`RTC/${stamp}`, ++reads === 1 ? '300000.00' : '310000.00')));
          Object.assign(stub, { answer: 'made', answerWithinMs: 5_000, sent: [] });
          const changed = await failure(gst.generate(admin, 'RA_BILL', c, {}));
          const docsC = await rows(c);
          check('a record that changed mid-way is refused in words', changed?.constructor.name === 'ConflictException' && /changed while its e-invoice was being made, so nothing was sent/.test(changed.message), changed?.message);
          check('its row is FAILED and the provider was not called', docsC.length === 1 && docsC[0].status === 'FAILED' && stub.sent.length === 0, `${docsC.map((d) => d.status)}; ${stub.sent.length} calls`);
          check('and the record is not left locked', (await locked('RA_BILL', c)) === null);

          // 4. A stale e-way bill is looked up by its challan first, and taken from there.
          const d = id('d');
          const cons = consignment(`RTD/${stamp}`);
          gst.useLoader('STOCK_TRANSFER', async () => ({ docNo: cons.docNo, offered: true, needed: true, reason: '', problems: ewayProblems(cons), invoice: null, consignment: cons, vehicleNo: null, value: '122000.00' }));
          Object.assign(stub, { answer: 'none', answerWithinMs: 300, sent: [], looked: 0, found: null });
          const transport = { mode: '1' as const, vehicleNo: 'OD02AB1234', vehicleType: 'R' as const, distanceKm: 42 };
          const noEwb = await failure(gst.generate(admin, 'STOCK_TRANSFER', d, transport));
          check('an e-way bill with no answer is a 504 too', noEwb?.message === 'The e-way bill system did not answer. Try again in a minute.', noEwb?.message);
          stub.answer = 'made';
          stub.found = { ewbNo: '331000999999', madeAt: new Date(), validUntil: new Date(Date.now() + 86_400_000) };
          await sleep(400);
          await gst.generate(admin, 'STOCK_TRANSFER', d, transport);
          const docsD = await rows(d);
          check('the stale one is found by its challan and taken, not made again', stub.looked === 1 && stub.sent.length === 1 && docsD[0]?.status === 'ACTIVE' && docsD[0].number === '331000999999', `${stub.looked} looked, ${stub.sent.length} sent, ${docsD[0]?.status} ${docsD[0]?.number}`);

          // 5. Refused (other figures under the same number): FAILED, the record unlocked.
          const e = id('e');
          gst.useLoader('RA_BILL', async () => irnBuilt(invoice(`RTE/${stamp}`, '400000.00')));
          Object.assign(stub, { answer: 'refused', answerWithinMs: 5_000, sent: [] });
          const otherFigures = await failure(gst.generate(admin, 'RA_BILL', e, {}));
          const docsE = await rows(e);
          check('a refusal is a 502 in the IRP\'s words', otherFigures?.constructor.name === 'BadGatewayException' && /holds IRN abc for other figures/.test(otherFigures.message), otherFigures?.message);
          check('its row is FAILED and the record unlocked', docsE[0]?.status === 'FAILED' && (await locked('RA_BILL', e)) === null, docsE[0]?.status);
        } finally {
          gst.useLoader('RA_BILL', null);
          gst.useLoader('STOCK_TRANSFER', null);
          await prisma.gstDocument.deleteMany({ where: { organizationId: org.id, sourceId: { in: ids } } });
          await prisma.auditLog.deleteMany({ where: { organizationId: org.id, entityId: { in: ids } } });
        }
      })().then(resolve, reject);
    }),
  );
  await app.close();
  console.log(`\nMaking IRNs and e-way bills when things go wrong: ${checks - problems.length} of ${checks} checks pass`);
  return problems.length ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
