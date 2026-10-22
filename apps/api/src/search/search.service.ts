import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import type { Paginated, SearchHitDto, SearchKind, SearchResultDto } from '@erp/shared';
import { SEARCH_MIN_LENGTH, VENDOR_KIND_LABELS, canViewPaymentRequests, canRequestFunds, canEditContract, canEditVendors, canSeeVendorBank, canViewContract, canViewTenders, canRunSubcontractEnquiries } from '@erp/shared';
import type { RequestUser } from '../common/current-user';
import { MaterialRequestsService } from '../material-requests/material-requests.service';
import { PurchaseOrdersService } from '../purchasing/purchase-orders.service';
import { VendorBillsService } from '../purchasing/vendor-bills.service';
import { WorkOrdersService } from '../subcontracts/work-orders.service';
import { SubcontractBillsService } from '../subcontracts/subcontract-bills.service';
import { RaBillsService } from '../ra-bills/ra-bills.service';
import { MeasurementsService } from '../measurements/measurements.service';
import { ExpensesService } from '../expenses/expenses.service';
import { InspectionsService } from '../inspections/inspections.service';
import { RisksService } from '../risks/risks.service';
import { DocumentsService } from '../documents/documents.service';
import { RfisService } from '../rfis/rfis.service';
import { VendorsService } from '../vendors/vendors.service';
import { ClientsService } from '../clients/clients.service';
import { StockService } from '../stock/stock.service';
import { StaffService } from '../staff/staff.service';
import { PaymentRequestsService } from '../payables/payment-requests.service';
import { TendersService } from '../tenders/tenders.service';
import { ScEnquiriesService } from '../subcontracts/sc-enquiries.service';

/** Hits per kind: enough to spot the one meant, few enough to keep the palette short. */
const PER_KIND = 4;

const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ') || null;

/** A paged list call made for the search: the same method its list page calls, so the same access rules apply. */
type Source<T> = { kind: SearchKind; allowed?: (user: RequestUser) => boolean; list: (user: RequestUser, q: string) => Promise<Paginated<T>>; hit: (row: T) => Omit<SearchHitDto, 'kind'> };

/**
 * Search everything (UI roadmap item 62). Each kind is found through its own list service with `q`, so a record shows
 * only to someone its list would show it to (project access, role, the company). A kind the user may not see is skipped.
 */
@Injectable()
export class SearchService {
  private readonly log = new Logger(SearchService.name);
  private readonly sources: Source<any>[];

  constructor(
    materialRequests: MaterialRequestsService,
    purchaseOrders: PurchaseOrdersService,
    vendorBills: VendorBillsService,
    workOrders: WorkOrdersService,
    subcontractBills: SubcontractBillsService,
    raBills: RaBillsService,
    measurements: MeasurementsService,
    expenses: ExpensesService,
    inspections: InspectionsService,
    risks: RisksService,
    documents: DocumentsService,
    rfis: RfisService,
    vendors: VendorsService,
    clients: ClientsService,
    stock: StockService,
    staff: StaffService,
    paymentRequests: PaymentRequestsService,
    tenders: TendersService,
    scEnquiries: ScEnquiriesService,
  ) {
    const page = (q: string) => ({ q, page: 1, pageSize: PER_KIND });
    const sources: Source<any>[] = [
      { kind: 'material_request', list: (u, q) => materialRequests.list(u, page(q) as never), hit: (r) => ({ id: r.id, title: r.requestNo, subtitle: join(r.title, r.projectName), href: `/material-requests/${r.id}`, status: r.status }) },
      { kind: 'purchase_order', list: (u, q) => purchaseOrders.list(u, page(q) as never), hit: (r) => ({ id: r.id, title: r.poNo, subtitle: join(r.vendorName, r.projectName), href: `/purchase-orders/${r.id}`, status: r.status }) },
      { kind: 'vendor_bill', list: (u, q) => vendorBills.list(u, page(q) as never), hit: (r) => ({ id: r.id, title: r.billNo, subtitle: join(r.vendorName, r.invoiceNo ? `invoice ${r.invoiceNo}` : null, r.projectName), href: `/vendor-bills/${r.id}`, status: r.status }) },
      { kind: 'work_order', list: (u, q) => workOrders.list(u, page(q) as never), hit: (r) => ({ id: r.id, title: r.woNo, subtitle: join(r.vendorName, r.title), href: `/work-orders/${r.id}`, status: r.status }) },
      {
        kind: 'subcontract_enquiry',
        allowed: (u) => canRunSubcontractEnquiries(u.roleKey),
        list: async (u, q) => {
          const found = (await scEnquiries.list(u, { q, status: 'all' })).items;
          return { items: found.slice(0, PER_KIND), total: found.length, page: 1, pageSize: PER_KIND };
        },
        hit: (r) => ({ id: r.id, title: r.enquiryNo, subtitle: join(r.title, r.projectName), href: `/subcontract-enquiries/${r.id}`, status: null }),
      },
      { kind: 'subcontract_bill', list: (u, q) => subcontractBills.list(u, page(q) as never), hit: (r) => ({ id: r.id, title: r.label, subtitle: join(r.vendorName, r.projectName), href: `/subcontract-bills/${r.id}`, status: r.status }) },
      {
        kind: 'payment_request',
        allowed: (u) => canViewPaymentRequests(u.roleKey) || canRequestFunds(u.roleKey),
        list: (u, q) => paymentRequests.list(u, page(q) as never),
        hit: (r) => ({ id: r.id, title: r.requestNo, subtitle: join(r.vendorName, r.targetLabel, r.projectName), href: `/payment-requests/${r.id}`, status: r.status }),
      },
      { kind: 'ra_bill', list: (u, q) => raBills.list(u, page(q) as never), hit: (r) => ({ id: r.id, title: r.billLabel, subtitle: r.projectName, href: `/bills/${r.id}`, status: r.status }) },
      { kind: 'measurement', list: (u, q) => measurements.list(u, page(q) as never), hit: (r) => ({ id: r.id, title: r.mbNo, subtitle: join(r.contractorName, r.projectName), href: `/measurements/${r.id}`, status: r.status }) },
      { kind: 'expense', list: (u, q) => expenses.list(u, page(q) as never), hit: (r) => ({ id: r.id, title: r.expenseNo, subtitle: join(r.description, r.projectName), href: `/expenses/${r.id}`, status: r.status }) },
      { kind: 'inspection', list: (u, q) => inspections.list(u, page(q) as never), hit: (r) => ({ id: r.id, title: r.inspectionNo, subtitle: join(r.activityName, r.projectName), href: `/inspections/${r.id}`, status: r.status }) },
      { kind: 'risk', list: (u, q) => risks.list(u, page(q) as never), hit: (r) => ({ id: r.id, title: r.riskNo, subtitle: join(r.title, r.projectName), href: `/risks?id=${r.id}`, status: null }) },
      { kind: 'document', list: (u, q) => documents.listDocuments(u, page(q) as never), hit: (r) => ({ id: r.id, title: r.docNo, subtitle: join(r.title, r.projectName), href: `/documents?id=${r.id}`, status: null }) },
      { kind: 'rfi', list: (u, q) => rfis.list(u, page(q) as never), hit: (r) => ({ id: r.id, title: r.rfiNo, subtitle: join(r.subject, r.projectName), href: `/documents?tab=rfis&rfi=${r.id}`, status: null }) },
      {
        kind: 'vendor',
        // The vendor master is readable by anyone for pickers, but its page is for these roles.
        allowed: (u) => canEditVendors(u.roleKey) || canSeeVendorBank(u.roleKey),
        list: (u, q) => vendors.list(u, page(q) as never),
        hit: (r) => ({ id: r.id, title: r.name, subtitle: join(...(r.kinds as (keyof typeof VENDOR_KIND_LABELS)[]).map((k) => VENDOR_KIND_LABELS[k]), r.gstin), href: `/vendors?q=${encodeURIComponent(r.name)}`, status: null }),
      },
      {
        kind: 'client',
        allowed: (u) => canViewContract(u.roleKey) || canEditContract(u.roleKey),
        list: (u, q) => clients.list(u, page(q) as never),
        hit: (r) => ({ id: r.id, title: r.name, subtitle: join(r.department, r.gstin), href: `/clients?q=${encodeURIComponent(r.name)}`, status: null }),
      },
      {
        kind: 'tender',
        allowed: (u) => canViewTenders(u.roleKey),
        list: async (u, q) => {
          const found = (await tenders.list(u, { q, status: 'all' })).items;
          return { items: found.slice(0, PER_KIND), total: found.length, page: 1, pageSize: PER_KIND };
        },
        hit: (r) => ({ id: r.id, title: r.tenderNo, subtitle: join(r.title, r.clientName), href: `/tenders/${r.id}`, status: null }),
      },
      { kind: 'item', list: (u, q) => stock.listItems(u, page(q) as never), hit: (r) => ({ id: r.id, title: r.name, subtitle: join(r.category, r.unit), href: `/stock?q=${encodeURIComponent(r.name)}`, status: null }) },
      { kind: 'person', list: (u, q) => staff.listEmployees(u, page(q) as never), hit: (r) => ({ id: r.id, title: r.fullName, subtitle: join(r.employeeCode, r.designation, r.projectName ?? 'Head office'), href: `/staff?employee=${r.id}`, status: null }) },
    ];
    this.sources = sources;
  }

  async search(user: RequestUser, raw: string): Promise<SearchResultDto> {
    const q = raw.trim().slice(0, 80);
    if (q.length < SEARCH_MIN_LENGTH) return { q, hits: [] };
    const found = await Promise.all(
      this.sources
        .filter((s) => !s.allowed || s.allowed(user))
        .map(async (s) => {
          try {
            const page = await s.list(user, q);
            return page.items.map((row) => ({ kind: s.kind, ...s.hit(row) }));
          } catch (e) {
            // A list this role may not open is simply not searched.
            if (!(e instanceof ForbiddenException)) this.log.warn(`search ${s.kind}: ${(e as Error).message}`);
            return [];
          }
        }),
    );
    return { q, hits: found.flat() };
  }
}
