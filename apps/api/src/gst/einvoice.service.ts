import { BadGatewayException, BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type GstDocument, type GstDocumentKind, type GstSourceKind } from '@prisma/client';
import {
  GST_SOURCE_DOC,
  RMC_HSN,
  cancelBy,
  cancelWindowProblem,
  canFileEinvoice,
  canMakeEwayBill,
  einvoiceNeeded,
  einvoicePayload,
  einvoiceProblems,
  ewayExtendProblem,
  ewayNeeded,
  ewayPayload,
  ewayProblems,
  ewayTransportProblems,
  gstStateCode,
  normaliseVehicleNo,
  raInvoiceNo,
  readGstAddress,
  splitGst,
  gstPaise,
  type EinvoiceSource,
  type EwaySource,
  type EwayTransport,
  type GstDocumentDto,
  type GstParty,
  type GstSourceStateDto,
} from '@erp/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit.service';
import { RequestUser } from '../common/current-user';
import { dateOnly, iso, money } from '../common/serialize';
import { logDetail } from '../integrations/integration-rules';
import { RaBillsService } from '../ra-bills/ra-bills.service';
import { RmcService } from '../rmc/rmc.service';
import { invoiceAmounts } from '../rmc/rmc-rules';
import { StockService } from '../stock/stock.service';
import { isInterState } from '../tally/vouchers';
import { payloadHash } from './einvoice-rules';
import { FakeGstProvider } from './providers/fake-gst.provider';
import { NicGspProvider } from './providers/nic-gsp.provider';
import type { GstProvider } from './providers/gst-provider';
import type { CancelGstDocumentDto, ExtendEwayBillDto, GenerateGstDocumentDto } from './einvoice.dto';

const COMPANY_FIX = 'on Company settings';
const AUDIT_ENTITY: Record<GstSourceKind, string> = { RA_BILL: 'BILL', RMC_INVOICE: 'RMC_INVOICE', RMC_BATCH: 'RMC_BATCH', STOCK_TRANSFER: 'STOCK' };
const paise = (v: string) => gstPaise(v) ?? 0;
const rupeesOf = (p: number) => (p / 100).toFixed(2);

/** A record read for its IRN or e-way bill: whether it gets one, why, what it lacks, and what would be sent. */
interface Built {
  docNo: string;
  offered: boolean;
  needed: boolean;
  reason: string;
  problems: string[];
  /** IRN: the payload; EWB: the consignment, which takes the form's transport to become one */
  invoice: EinvoiceSource | null;
  consignment: EwaySource | null;
  vehicleNo: string | null;
  value: string | null;
}

/** The provider GST_PROVIDER names: the fake, NIC through the company's GSP, or none (the records say it is not set up). */
export function gstProviderFor(name: string | undefined, prisma: PrismaService): GstProvider | null {
  if (name === 'fake') return new FakeGstProvider();
  if (name === 'gsp') return new NicGspProvider(prisma);
  return null;
}

/**
 * E-invoices (IRN and QR) for certified RA bills and RMC invoices, and e-way bills for RMC challans and stock transfers
 * (ARCHITECTURE "E-invoices and e-way bills"). Each record is read through its own service (its access rules), the JSON
 * is built by the pure rules in `@erp/shared/einvoice.ts`, and every request is a `GstDocument`: made once per payload,
 * the provider called outside the transaction, a retry finding the PENDING row.
 */
@Injectable()
export class EinvoiceService {
  private provider: GstProvider | null;

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private bills: RaBillsService,
    private rmc: RmcService,
    private stock: StockService,
  ) {
    this.provider = gstProviderFor(process.env.GST_PROVIDER, prisma);
  }

  /** For the test: put a provider in place of the one GST_PROVIDER named. */
  useProvider(p: GstProvider | null) {
    this.provider = p;
  }

  private mayAct(user: RequestUser, kind: GstDocumentKind) {
    return kind === 'IRN' ? canFileEinvoice(user.roleKey) : canMakeEwayBill(user.roleKey);
  }

  private assertMayAct(user: RequestUser, kind: GstDocumentKind) {
    if (!this.mayAct(user, kind)) throw new ForbiddenException(kind === 'IRN' ? 'Only admin, management and accounts make e-invoices' : 'Only accounts and those who keep the stock make e-way bills');
  }

  // ---------------------------------------------------------------------------------------------------------------
  // The company

  private async company(organizationId: string) {
    const [o, tally] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true, legalName: true, billingName: true, billingAddress: true, gstin: true, billingGstin: true, gstSac: true, einvoiceFrom: true } }),
      this.prisma.tallyConfig.findUnique({ where: { organizationId }, select: { stateCode: true } }),
    ]);
    const gstin = o.gstin ?? o.billingGstin;
    const party: GstParty = { gstin, legalName: o.legalName ?? o.billingName ?? o.name, address: o.billingAddress, who: 'the company', fixAt: COMPANY_FIX };
    return { party, gstSac: o.gstSac, einvoiceFrom: dateOnly(o.einvoiceFrom), billsFromState: tally?.stateCode ?? gstStateCode(gstin) };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Each source, read through its own service

  private loaders: Record<GstSourceKind, (user: RequestUser, id: string) => Promise<Built>> = {
    RA_BILL: async (user, id) => {
      const [b, co] = await Promise.all([this.bills.einvoiceFacts(user, id), this.company(user.organizationId)]);
      const docNo = raInvoiceNo(b.projectCode, b.billNo);
      const certified = b.status === 'APPROVED' && (b.stage === 'CERTIFIED' || b.stage === 'PAID');
      const need = einvoiceNeeded({ buyerGstin: b.client?.gstin ?? null, docDate: b.billDate, einvoiceFrom: co.einvoiceFrom });
      const taxable = paise(b.grossAmount) + paise(b.pvAmount);
      // Works are supplied where the company bills from, as the GST register and the Tally export have it.
      const tax = splitGst(paise(b.gstAmount), false);
      const invoice: EinvoiceSource = {
        docNo,
        docDate: b.billDate,
        seller: co.party,
        buyer: { gstin: b.client?.gstin ?? null, legalName: b.client?.name ?? b.clientName ?? '', address: b.client?.billingAddress ?? null, who: b.client?.name ?? 'the client', fixAt: 'in Clients', stateCode: b.client?.stateCode },
        placeOfSupply: co.billsFromState,
        lines: [{ description: `Works contract: ${b.billLabel}, ${b.projectName}`, hsn: b.sacCode ?? co.gstSac, isService: true, quantity: null, unit: null, unitPrice: null, taxable: rupeesOf(taxable), gstRate: b.gstRate }],
        igst: rupeesOf(tax.igst),
        cgst: rupeesOf(tax.cgst),
        sgst: rupeesOf(tax.sgst),
        hsnFixAt: 'on Company settings, or on the bill before it is approved',
      };
      return {
        docNo,
        offered: need.needed && certified,
        needed: need.needed,
        reason: certified || !need.needed ? need.reason : 'The e-invoice is made once the client has certified the bill',
        problems: einvoiceProblems(invoice),
        invoice,
        consignment: null,
        vehicleNo: null,
        value: null,
      };
    },

    RMC_INVOICE: async (user, id) => {
      const [i, co] = await Promise.all([this.rmc.invoice(user, id), this.company(user.organizationId)]);
      const row = await this.prisma.rmcInvoice.findUniqueOrThrow({ where: { id }, select: { order: { select: { rate: true } } } });
      const need = einvoiceNeeded({ buyerGstin: i.gstin, docDate: i.date, einvoiceFrom: co.einvoiceFrom });
      const inter = paise(i.igst) !== 0;
      const pumping = paise(i.pumping) !== 0;
      const invoice: EinvoiceSource = {
        docNo: i.invoiceNo,
        docDate: i.date,
        seller: co.party,
        buyer: { gstin: i.gstin, legalName: i.customer, address: i.customerAddress, who: i.customer, fixAt: 'in Clients', stateCode: i.customerStateCode },
        placeOfSupply: inter ? i.customerStateCode : co.billsFromState,
        lines: [
          { description: `Ready-mix concrete${i.challans.length ? `, ${[...new Set(i.challans.map((c) => c.grade))].join(', ')}` : ''}`, hsn: RMC_HSN, isService: false, quantity: i.quantity, unit: 'cum', unitPrice: row.order ? money(row.order.rate) : null, taxable: i.concrete, gstRate: '18' },
          ...(pumping ? [{ description: 'Pumping the concrete', hsn: co.gstSac, isService: true, quantity: null, unit: null, unitPrice: null, taxable: i.pumping, gstRate: '18' }] : []),
        ],
        igst: i.igst,
        cgst: i.cgst,
        sgst: i.sgst,
        hsnFixAt: COMPANY_FIX,
      };
      return { docNo: i.invoiceNo, offered: need.needed && i.status === 'ISSUED', needed: need.needed, reason: i.status === 'ISSUED' ? need.reason : 'The bill is cancelled', problems: einvoiceProblems(invoice), invoice, consignment: null, vehicleNo: null, value: null };
    },

    RMC_BATCH: async (user, id) => {
      const [b, co] = await Promise.all([this.rmc.batch(user, id), this.company(user.organizationId)]);
      const row = await this.prisma.rmcBatch.findUniqueOrThrow({
        where: { id },
        select: {
          plant: { select: { name: true, siteAddress: true, location: true } },
          order: { select: { rate: true, site: true, client: { select: { name: true, gstin: true, stateCode: true, billingAddress: true } }, project: { select: { name: true, siteAddress: true, location: true } } } },
        },
      });
      const client = row.order.client;
      const own = !client;
      const inter = !own && isInterState(co.billsFromState, gstStateCode(client.gstin) ?? client.stateCode);
      const a = invoiceAmounts([{ quantity: b.quantity, pumped: false }], row.order.rate, null, inter);
      const value = own ? a.taxable : a.total;
      const plant: GstParty = { gstin: co.party.gstin, legalName: co.party.legalName, address: row.plant.siteAddress ?? row.plant.location, who: `the plant ${row.plant.name}`, fixAt: "in the plant's project details" };
      const shipTo: GstParty = own
        ? { gstin: co.party.gstin, legalName: co.party.legalName, address: row.order.project?.siteAddress ?? row.order.project?.location ?? null, who: `the site ${row.order.project?.name ?? ''}`.trim(), fixAt: "in the site's project details" }
        : { gstin: client.gstin, legalName: client.name, address: row.order.site, who: `the pour site of order ${b.orderNo}`, fixAt: 'on the order (Pour at, with its PIN code)', stateCode: client.stateCode };
      const consignment: EwaySource = {
        purpose: own ? 'OWN_USE' : 'SUPPLY',
        docNo: b.batchNo,
        docDate: b.date,
        from: co.party,
        to: own ? co.party : { gstin: client.gstin, legalName: client.name, address: client.billingAddress, who: client.name, fixAt: 'in Clients', stateCode: client.stateCode },
        dispatchFrom: plant,
        shipTo,
        lines: [{ name: `Ready-mix concrete ${b.grade}`, hsn: RMC_HSN, quantity: b.quantity, unit: 'cum', taxable: money(a.taxable), gstRate: '18' }],
        igst: own ? '0.00' : money(a.igst),
        cgst: own ? '0.00' : money(a.cgst),
        sgst: own ? '0.00' : money(a.sgst),
        hsnFixAt: 'on the order',
      };
      const need = ewayNeeded(money(value));
      return { docNo: b.batchNo, offered: b.status !== 'REJECTED', needed: need.needed, reason: b.status === 'REJECTED' ? 'The truck was turned back' : need.reason, problems: ewayProblems(consignment), invoice: null, consignment, vehicleNo: b.truck, value: money(value) };
    },

    STOCK_TRANSFER: async (user, id) => {
      const [e, co] = await Promise.all([this.stock.get(user, id), this.company(user.organizationId)]);
      if (e.type !== 'TRANSFER_OUT') throw new BadRequestException('Only a stock transfer sent to another project gets an e-way bill');
      const row = await this.prisma.stockEntry.findUniqueOrThrow({
        where: { id },
        select: {
          project: { select: { name: true, siteAddress: true, location: true } },
          toProject: { select: { name: true, siteAddress: true, location: true } },
          lines: { select: { quantity: true, item: { select: { name: true, unit: true, rate: true, hsnCode: true } } }, orderBy: { sortOrder: 'asc' } },
        },
      });
      // StockTxn keeps no value: each line travels at the item master rate, as stock valuation values it.
      const lines = row.lines.map((l) => ({ name: l.item.name, hsn: l.item.hsnCode, quantity: l.quantity.abs().toFixed(3), unit: l.item.unit, taxable: l.item.rate ? money(l.quantity.abs().mul(l.item.rate).toDecimalPlaces(2)) : '0', gstRate: '0' }));
      const value = rupeesOf(lines.reduce((s, l) => s + paise(l.taxable), 0));
      const place = (p: { name: string; siteAddress: string | null; location: string | null } | null, who: string): GstParty => ({
        gstin: co.party.gstin,
        legalName: co.party.legalName,
        address: p?.siteAddress ?? p?.location ?? null,
        who: `${who} ${p?.name ?? ''}`.trim(),
        fixAt: "in the project's details (site address)",
      });
      const consignment: EwaySource = {
        purpose: 'OWN_USE',
        docNo: e.entryNo,
        docDate: e.date,
        from: co.party,
        to: co.party,
        dispatchFrom: place(row.project, 'the project'),
        shipTo: place(row.toProject, 'the project'),
        lines,
        igst: '0.00',
        cgst: '0.00',
        sgst: '0.00',
        hsnFixAt: 'in Items',
      };
      const need = ewayNeeded(value);
      return { docNo: e.entryNo, offered: true, needed: need.needed, reason: need.reason, problems: ewayProblems(consignment), invoice: null, consignment, vehicleNo: e.vehicleNo, value };
    },
  };

  // ---------------------------------------------------------------------------------------------------------------
  // Reading

  private toDto(d: GstDocument & { createdBy: { fullName: string } }): GstDocumentDto {
    return {
      id: d.id,
      kind: d.kind,
      sourceKind: d.sourceKind,
      sourceId: d.sourceId,
      docNo: d.docNo,
      status: d.status,
      provider: d.provider,
      number: d.number,
      ackNo: d.ackNo,
      ackAt: iso(d.ackAt),
      validUntil: iso(d.validUntil),
      signedQr: d.signedQr,
      vehicleNo: d.vehicleNo,
      distanceKm: d.distanceKm,
      extensions: d.extensions,
      error: d.error,
      cancelledAt: iso(d.cancelledAt),
      cancelReason: d.cancelReason,
      cancelRemark: d.cancelRemark,
      createdByName: d.createdBy.fullName,
      createdAt: d.createdAt.toISOString(),
    };
  }

  private docsOf(organizationId: string, sourceKind: GstSourceKind, sourceId: string) {
    return this.prisma.gstDocument.findMany({ where: { organizationId, sourceKind, sourceId }, include: { createdBy: { select: { fullName: true } } }, orderBy: { createdAt: 'desc' } });
  }

  private async providerProblem(organizationId: string): Promise<string | null> {
    return this.provider ? this.provider.ready(organizationId) : 'E-invoicing is not set up on this server: GST_PROVIDER is not set (see DEPLOY.md)';
  }

  /** The number a cancelled IRN was for: the IRP never takes the same invoice number again. */
  private reusedNumber(kind: GstDocumentKind, docNo: string, docs: GstDocument[]): string | null {
    if (kind !== 'IRN') return null;
    const gone = docs.find((d) => d.status === 'CANCELLED' && d.docNo === docNo);
    return gone ? `IRN ${gone.number} for ${docNo} was cancelled, and the IRP does not take the same invoice number again: raise the corrected bill under a new number` : null;
  }

  async state(user: RequestUser, sourceKind: GstSourceKind, sourceId: string, now = new Date()): Promise<GstSourceStateDto> {
    const kind = GST_SOURCE_DOC[sourceKind];
    // The record's own read checks access; the documents and the provider are read beside it and shown only if it passes.
    const [built, docs, providerProblem] = await Promise.all([
      this.loaders[sourceKind](user, sourceId),
      this.docsOf(user.organizationId, sourceKind, sourceId),
      this.providerProblem(user.organizationId),
    ]);
    const live = docs.find((d) => d.status === 'PENDING' || d.status === 'ACTIVE') ?? null;
    const reused = live ? null : this.reusedNumber(kind, built.docNo, docs);
    const problems = reused ? [...built.problems, reused] : built.problems;
    const may = this.mayAct(user, kind);
    const active = live?.status === 'ACTIVE' ? live : null;
    const cancelProblem = active ? cancelWindowProblem(kind, active.ackAt ?? active.createdAt, now) : null;
    const extendProblem = active && kind === 'EWB' && active.validUntil ? ewayExtendProblem(active.validUntil, now) : null;
    return {
      kind,
      sourceKind,
      sourceId,
      docNo: built.docNo,
      offered: built.offered || !!live || docs.length > 0,
      needed: built.needed,
      reason: built.reason,
      problems: live ? [] : problems,
      live: live ? this.toDto(live) : null,
      history: docs.filter((d) => d !== live).map((d) => this.toDto(d)),
      canGenerate: may && built.offered && !providerProblem && (!live || live.status === 'PENDING') && !problems.length,
      canCancel: may && !!active && !cancelProblem && !providerProblem,
      canExtend: may && !!active && kind === 'EWB' && !extendProblem && !providerProblem,
      cancelProblem,
      extendProblem,
      cancelBy: active ? cancelBy(active.ackAt ?? active.createdAt).toISOString() : null,
      vehicleNo: built.vehicleNo,
      value: built.value,
      providerReady: !providerProblem,
      providerProblem,
    };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Making one

  /**
   * Makes the record's IRN or e-way bill. Everything is checked before anything is written; the same payload returns the
   * document already made; a PENDING one (an earlier try that got no answer kept) is asked for again.
   */
  async generate(user: RequestUser, sourceKind: GstSourceKind, sourceId: string, dto: GenerateGstDocumentDto): Promise<GstSourceStateDto> {
    const kind = GST_SOURCE_DOC[sourceKind];
    this.assertMayAct(user, kind);
    if (!this.provider) throw new BadRequestException('E-invoicing is not set up on this server: GST_PROVIDER is not set (see DEPLOY.md)');
    const notReady = await this.provider.ready(user.organizationId);
    if (notReady) throw new BadRequestException(notReady);
    const built = await this.loaders[sourceKind](user, sourceId);
    if (!built.offered) throw new BadRequestException(built.reason);
    let payload: object;
    let transport: EwayTransport | null = null;
    if (kind === 'IRN') {
      if (built.problems.length) throw new BadRequestException(built.problems.join('. '));
      payload = einvoicePayload(built.invoice!);
    } else {
      transport = { mode: dto.mode ?? '1', vehicleNo: dto.vehicleNo ?? null, vehicleType: dto.vehicleType ?? 'R', distanceKm: dto.distanceKm ?? null };
      const all = [...built.problems, ...ewayTransportProblems(transport)];
      if (all.length) throw new BadRequestException(all.join('. '));
      payload = ewayPayload(built.consignment!, transport);
    }
    const hash = payloadHash(payload);
    const org = user.organizationId;

    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`GST:${org}:${kind}:${sourceKind}:${sourceId}`}))`;
      const docs = await tx.gstDocument.findMany({ where: { organizationId: org, kind, sourceKind, sourceId } });
      const live = docs.find((d) => d.status === 'PENDING' || d.status === 'ACTIVE');
      if (live?.status === 'ACTIVE') {
        if (live.payloadHash === hash) return { doc: live, call: false };
        throw new ConflictException(`${built.docNo} already has ${kind === 'IRN' ? 'IRN' : 'e-way bill'} ${live.number}`);
      }
      if (live) {
        if (live.payloadHash !== hash) throw new ConflictException(`An ${kind === 'IRN' ? 'e-invoice' : 'e-way bill'} for ${built.docNo} is being made with other figures; open it again in a minute`);
        return { doc: live, call: true };
      }
      const reused = this.reusedNumber(kind, built.docNo, docs);
      if (reused) throw new BadRequestException(reused);
      const doc = await tx.gstDocument.create({
        data: {
          organizationId: org,
          kind,
          sourceKind,
          sourceId,
          docNo: built.docNo,
          payload: payload as Prisma.InputJsonValue,
          payloadHash: hash,
          provider: this.provider!.name,
          vehicleNo: transport?.mode === '1' ? normaliseVehicleNo(transport.vehicleNo) : null,
          distanceKm: transport?.distanceKm ?? null,
          createdById: user.id,
        },
      });
      return { doc, call: true };
    });
    if (!row.call) return this.state(user, sourceKind, sourceId);

    const ctx = { organizationId: org, gstin: built.invoice?.seller.gstin ?? built.consignment!.from.gstin! };
    if (kind === 'IRN') {
      const r = await this.provider.generateIrn(ctx, payload as ReturnType<typeof einvoicePayload>);
      if (!r.ok) return this.fail(user, row.doc, r.error, r.raw);
      await this.prisma.gstDocument.update({
        where: { id: row.doc.id },
        data: { status: 'ACTIVE', number: r.value.irn, ackNo: r.value.ackNo, ackAt: r.value.ackAt, signedQr: r.value.signedQr, response: logDetail(r.raw) as Prisma.InputJsonValue, error: null },
      });
      await this.audit.log(user, AUDIT_ENTITY[sourceKind], sourceId, 'EINVOICE_MADE', `IRN ${r.value.irn}, ack ${r.value.ackNo}${r.value.duplicate ? ' (the IRP had it already)' : ''}`);
    } else {
      const r = await this.provider.generateEwb(ctx, payload as ReturnType<typeof ewayPayload>);
      if (!r.ok) return this.fail(user, row.doc, r.error, r.raw);
      await this.prisma.gstDocument.update({
        where: { id: row.doc.id },
        data: { status: 'ACTIVE', number: r.value.ewbNo, ackAt: r.value.madeAt, validUntil: r.value.validUntil, response: logDetail(r.raw) as Prisma.InputJsonValue, error: null },
      });
      await this.audit.log(user, AUDIT_ENTITY[sourceKind], sourceId, 'EWAY_BILL_MADE', `E-way bill ${r.value.ewbNo}, ${transport!.distanceKm} km, vehicle ${normaliseVehicleNo(transport!.vehicleNo) || 'none'}`);
    }
    return this.state(user, sourceKind, sourceId);
  }

  /** The provider refused: the row stays as the log, marked FAILED, and the person is told what it said. */
  private async fail(user: RequestUser, doc: GstDocument, error: string, raw: unknown): Promise<never> {
    await this.prisma.gstDocument.update({ where: { id: doc.id }, data: { status: 'FAILED', error: error.slice(0, 1000), response: logDetail(raw) as Prisma.InputJsonValue } });
    await this.audit.log(user, AUDIT_ENTITY[doc.sourceKind], doc.sourceId, doc.kind === 'IRN' ? 'EINVOICE_REFUSED' : 'EWAY_BILL_REFUSED', error.slice(0, 300));
    throw new BadGatewayException(`${doc.kind === 'IRN' ? 'The IRP' : 'The e-way bill system'} refused it: ${error}`);
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Cancelling and extending

  private async activeDoc(user: RequestUser, id: string) {
    const d = await this.prisma.gstDocument.findFirst({ where: { id, organizationId: user.organizationId } });
    if (!d) throw new NotFoundException('E-invoice or e-way bill not found');
    // The record's own read checks the person may see it.
    await this.loaders[d.sourceKind](user, d.sourceId);
    this.assertMayAct(user, d.kind);
    if (d.status !== 'ACTIVE') throw new BadRequestException(d.status === 'CANCELLED' ? 'It is already cancelled' : 'It was never made');
    if (!this.provider) throw new BadRequestException('E-invoicing is not set up on this server: GST_PROVIDER is not set (see DEPLOY.md)');
    return d;
  }

  async cancel(user: RequestUser, id: string, dto: CancelGstDocumentDto, now = new Date()): Promise<GstSourceStateDto> {
    const d = await this.activeDoc(user, id);
    const late = cancelWindowProblem(d.kind, d.ackAt ?? d.createdAt, now);
    if (late) throw new BadRequestException(late);
    const ctx = { organizationId: user.organizationId, gstin: '' };
    const r = d.kind === 'IRN' ? await this.provider!.cancelIrn(ctx, d.number!, dto.reason as '1', dto.remark) : await this.provider!.cancelEwb(ctx, d.number!, dto.reason as '1', dto.remark);
    if (!r.ok) throw new BadGatewayException(`${d.kind === 'IRN' ? 'The IRP' : 'The e-way bill system'} did not cancel it: ${r.error}`);
    const n = await this.prisma.gstDocument.updateMany({
      where: { id, status: 'ACTIVE' },
      data: { status: 'CANCELLED', cancelledAt: r.value.cancelledAt, cancelReason: dto.reason, cancelRemark: dto.remark, response: logDetail(r.raw) as Prisma.InputJsonValue },
    });
    if (n.count) await this.audit.log(user, AUDIT_ENTITY[d.sourceKind], d.sourceId, d.kind === 'IRN' ? 'EINVOICE_CANCELLED' : 'EWAY_BILL_CANCELLED', `${d.kind === 'IRN' ? 'IRN' : 'E-way bill'} ${d.number}: ${dto.remark}`);
    return this.state(user, d.sourceKind, d.sourceId, now);
  }

  async extend(user: RequestUser, id: string, dto: ExtendEwayBillDto, now = new Date()): Promise<GstSourceStateDto> {
    const d = await this.activeDoc(user, id);
    if (d.kind !== 'EWB' || !d.validUntil) throw new BadRequestException('Only an e-way bill is extended');
    const late = ewayExtendProblem(d.validUntil, now);
    if (late) throw new BadRequestException(late);
    const vehicleNo = normaliseVehicleNo(dto.vehicleNo ?? d.vehicleNo);
    const problems = ewayTransportProblems({ mode: dto.mode ?? '1', vehicleNo, vehicleType: 'R', distanceKm: dto.remainingKm });
    const at = readGstAddress(dto.fromPlace);
    if (!at) problems.push('Type where the goods are now, with its PIN code');
    if (problems.length) throw new BadRequestException(problems.join('. '));
    const fromState = Number((d.payload as { fromStateCode?: number }).fromStateCode ?? 0);
    const r = await this.provider!.extendEwb({ organizationId: user.organizationId, gstin: '' }, d.number!, {
      vehicleNo,
      fromPlace: at!.place,
      fromPincode: at!.pin,
      fromStateCode: fromState,
      remainingKm: dto.remainingKm,
      mode: dto.mode ?? '1',
      reason: dto.reason as '1',
      remark: dto.remark,
    });
    if (!r.ok) throw new BadGatewayException(`The e-way bill system did not extend it: ${r.error}`);
    await this.prisma.gstDocument.update({ where: { id }, data: { validUntil: r.value.validUntil, vehicleNo, extensions: { increment: 1 }, response: logDetail(r.raw) as Prisma.InputJsonValue } });
    await this.audit.log(user, AUDIT_ENTITY[d.sourceKind], d.sourceId, 'EWAY_BILL_EXTENDED', `E-way bill ${d.number} to ${iso(r.value.validUntil)}: ${dto.remark}`);
    return this.state(user, d.sourceKind, d.sourceId, now);
  }
}
