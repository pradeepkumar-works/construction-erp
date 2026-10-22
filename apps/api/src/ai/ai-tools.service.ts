import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type Anthropic from '@anthropic-ai/sdk';
import type { Paginated, SwitchableModule } from '@erp/shared';
import { EXPENSE_CATEGORIES, MATERIAL_PRIORITIES, PAYMENT_MODES, PROJECT_STATUSES, SUBMISSION_STATUSES, WEATHER_OPTIONS, canSubmitExpense, canViewContract, canViewCost, canViewLetters, canViewPurchaseOrders, canViewReconciliation, submissionHref } from '@erp/shared';
import type { AiDraftDto } from '@erp/shared';
import type { RequestUser } from '../common/current-user';
import { SubmissionLifecycleService } from '../common/submission-lifecycle.service';
import { SearchService } from '../search/search.service';
import { DprService } from '../dpr/dpr.service';
import { ProgressService } from '../progress/progress.service';
import { MaterialRequestsService } from '../material-requests/material-requests.service';
import { PurchaseOrdersService } from '../purchasing/purchase-orders.service';
import { VendorBillsService } from '../purchasing/vendor-bills.service';
import { WorkOrdersService } from '../subcontracts/work-orders.service';
import { SubcontractBillsService } from '../subcontracts/subcontract-bills.service';
import { RaBillsService } from '../ra-bills/ra-bills.service';
import { MeasurementsService } from '../measurements/measurements.service';
import { ExpensesService } from '../expenses/expenses.service';
import { InspectionsService } from '../inspections/inspections.service';
import { MachineryService } from '../machinery/machinery.service';
import { RisksService } from '../risks/risks.service';
import { VariationsService } from '../variations/variations.service';
import { SafetyService } from '../safety/safety.service';
import { DocumentsService } from '../documents/documents.service';
import { AttendanceService } from '../attendance/attendance.service';
import { ReceivablesService } from '../receivables/receivables.service';
import { PayablesService } from '../payables/payables.service';
import { PaymentRequestsService } from '../payables/payment-requests.service';
import { StockService } from '../stock/stock.service';
import { ProjectsService } from '../projects/projects.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { HomeService } from '../dashboard/home.service';
import { CostService } from '../cost/cost.service';
import { BudgetService } from '../cost/budget.service';
import { EarnedValueService } from '../cost/earned-value.service';
import { ReconciliationService } from '../reconciliation/reconciliation.service';
import { CashFlowService } from '../cost/cash-flow.service';
import { ContractsService } from '../contracts/contracts.service';
import { QualityService } from '../quality/quality.service';
import { MaintenanceService } from '../maintenance/maintenance.service';
import { ScheduleService } from '../planning/schedule.service';
import { AiDigestService } from './ai-digest.service';
import { moduleOffMessage, moduleOn } from '../common/module-switch.guard';
import { AiDraftsService } from './ai-drafts.service';
import { DocumentTextService } from '../documents/document-text.service';

/** Tool input after its schema: what the model sent, before checking. */
type Input = Record<string, unknown>;

interface Tool {
  def: Anthropic.Beta.BetaTool;
  /** Roles that may use the tool at all; the service still applies its own rules. */
  allowed?: (user: RequestUser) => boolean;
  /** The module it reads, left out while the company has it off (v6 item 117) */
  module?: SwitchableModule;
  run: (user: RequestUser, input: Input) => Promise<unknown>;
}

/** A kind of record the assistant can list and open: its own list and detail methods, and its page on the web. */
interface RecordKind {
  label: string;
  /** The module it belongs to, refused while the company has it off (v6 item 117) */
  module?: SwitchableModule;
  list: (user: RequestUser, q: Input) => Promise<Paginated<{ id: string }>>;
  get: (user: RequestUser, id: string) => Promise<{ id: string }>;
  href: (id: string) => string;
  /** Statuses the list filters on, for the tool description */
  statuses?: readonly string[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const STATUS = /^[A-Z_]{2,30}$/;
/** Rows per list call: enough to answer from, few enough to keep the model's reading short. */
const PAGE = 20;
/** Characters of tool result the model reads at most; longer results are cut with a note to narrow the question. */
const MAX_RESULT = 24_000;
/** Fields that carry files, signatures or other things the model cannot use. */
const DROP_KEYS = new Set(['attachments', 'photos', 'data', 'storagePath', 'url', 'thumbnailUrl', 'signatureUrl', 'passwordHash']);

const uuid = (v: unknown, name: string) => {
  if (typeof v !== 'string' || !UUID.test(v)) throw new BadRequestException(`${name} must be a record id from an earlier result`);
  return v;
};
const optUuid = (v: unknown, name: string) => (v === undefined || v === null || v === '' ? undefined : uuid(v, name));
const optDate = (v: unknown, name: string) => {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v !== 'string' || !DATE.test(v)) throw new BadRequestException(`${name} must be YYYY-MM-DD`);
  return v;
};
const optStatus = (v: unknown) => {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v !== 'string' || !STATUS.test(v)) throw new BadRequestException('status must be one of the listed values');
  return v;
};
const optText = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 100) : undefined);
const optPage = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 50 ? v : 1);

const projectIdProp = { type: 'string', description: 'A project id from list_projects; omit for every project the user can see' } as const;
/** The draft tools name the project by id or as the user wrote it. */
const draftProjectProps = {
  projectId: { type: 'string', description: 'The project id, from list_projects or the page; or leave out and pass project' },
  project: { type: 'string', description: 'The project as the user named it (part of its name or its code), when you have no id' },
} as const;
const DRAFT_NOTE = 'Nothing is saved: the user opens the draft in its form from your answer, checks it and saves it.';

const fromProp = { type: 'string', description: 'From this day, YYYY-MM-DD (inclusive)' } as const;
const toProp = { type: 'string', description: 'Up to this day, YYYY-MM-DD (inclusive)' } as const;

/**
 * The assistant's tools (AI item 67). Every tool is read-only and calls the same service method as the page that
 * shows the data, with the signed-in user, so project access, role rules and the company boundary apply unchanged.
 */
@Injectable()
export class AiToolsService {
  private readonly kinds: Record<string, RecordKind>;
  private readonly tools: Tool[];

  constructor(
    private lifecycle: SubmissionLifecycleService,
    search: SearchService,
    dpr: DprService,
    progress: ProgressService,
    mrs: MaterialRequestsService,
    pos: PurchaseOrdersService,
    vendorBills: VendorBillsService,
    workOrders: WorkOrdersService,
    subBills: SubcontractBillsService,
    raBills: RaBillsService,
    measurements: MeasurementsService,
    expenses: ExpensesService,
    inspections: InspectionsService,
    machinery: MachineryService,
    risks: RisksService,
    variations: VariationsService,
    safety: SafetyService,
    documents: DocumentsService,
    attendance: AttendanceService,
    receivables: ReceivablesService,
    payables: PayablesService,
    paymentRequests: PaymentRequestsService,
    stock: StockService,
    projects: ProjectsService,
    dashboard: DashboardService,
    home: HomeService,
    cost: CostService,
    budget: BudgetService,
    earnedValue: EarnedValueService,
    reconciliation: ReconciliationService,
    cashFlow: CashFlowService,
    contracts: ContractsService,
    quality: QualityService,
    maintenance: MaintenanceService,
    schedule: ScheduleService,
    digest: AiDigestService,
    drafts: AiDraftsService,
    documentText: DocumentTextService,
  ) {
    const any = <T>(f: T) => f as never;
    this.kinds = {
      dpr: { label: 'Daily progress reports', list: any(dpr.list.bind(dpr)), get: any(dpr.get.bind(dpr)), href: (id) => `/dpr/${id}`, statuses: SUBMISSION_STATUSES },
      progress: { label: 'Progress entries (quantities done against activities)', list: any(progress.list.bind(progress)), get: any(progress.get.bind(progress)), href: (id) => `/progress/${id}`, statuses: SUBMISSION_STATUSES },
      material_request: { label: 'Material requests (indents)', list: any(mrs.list.bind(mrs)), get: any(mrs.get.bind(mrs)), href: (id) => `/material-requests/${id}`, statuses: SUBMISSION_STATUSES },
      purchase_order: { label: 'Purchase orders', list: any(pos.list.bind(pos)), get: any(pos.get.bind(pos)), href: (id) => `/purchase-orders/${id}`, statuses: SUBMISSION_STATUSES },
      vendor_bill: { label: 'Vendor (supplier) bills', list: any(vendorBills.list.bind(vendorBills)), get: any(vendorBills.get.bind(vendorBills)), href: (id) => `/vendor-bills/${id}`, statuses: SUBMISSION_STATUSES },
      work_order: { label: 'Subcontract work orders', list: any(workOrders.list.bind(workOrders)), get: any(workOrders.get.bind(workOrders)), href: (id) => `/work-orders/${id}`, statuses: SUBMISSION_STATUSES },
      subcontract_bill: { label: 'Subcontractor bills', list: any(subBills.list.bind(subBills)), get: any(subBills.get.bind(subBills)), href: (id) => `/subcontract-bills/${id}`, statuses: SUBMISSION_STATUSES },
      ra_bill: { label: 'RA bills to the client', list: any(raBills.list.bind(raBills)), get: any(raBills.get.bind(raBills)), href: (id) => `/bills/${id}`, statuses: SUBMISSION_STATUSES },
      measurement: { label: 'Measurement book entries', list: any(measurements.list.bind(measurements)), get: any(measurements.get.bind(measurements)), href: (id) => `/measurements/${id}`, statuses: SUBMISSION_STATUSES },
      expense: { label: 'Site expenses', list: any(expenses.list.bind(expenses)), get: any(expenses.get.bind(expenses)), href: (id) => `/expenses/${id}`, statuses: SUBMISSION_STATUSES },
      inspection: { label: 'Quality inspections', list: any(inspections.list.bind(inspections)), get: any(inspections.get.bind(inspections)), href: (id) => `/inspections/${id}`, statuses: SUBMISSION_STATUSES },
      machinery_log: { label: 'Machinery day logs (hours, idle, breakdown, diesel)', list: any(machinery.list.bind(machinery)), get: any(machinery.get.bind(machinery)), href: (id) => `/machinery/${id}`, statuses: SUBMISSION_STATUSES },
      risk: { label: 'Delays and risks register', list: any(risks.list.bind(risks)), get: any(risks.get.bind(risks)), href: (id) => `/risks?id=${id}` },
      variation: { label: 'Variations (extra items, changes to the contract)', list: any(variations.list.bind(variations)), get: any(variations.get.bind(variations)), href: (id) => `/variations?id=${id}` },
      safety_incident: { label: 'Safety incidents and near misses', module: 'safety', list: any(safety.listIncidents.bind(safety)), get: any(safety.getIncident.bind(safety)), href: (id) => `/safety?tab=incidents&id=${id}` },
      document: { label: 'Document register (drawings, specifications)', list: any(documents.listDocuments.bind(documents)), get: any(documents.getDocument.bind(documents)), href: (id) => `/documents?id=${id}` },
      attendance: { label: 'Daily labour attendance sheets', list: any(attendance.list.bind(attendance)), get: any(attendance.get.bind(attendance)), href: () => '/attendance', statuses: SUBMISSION_STATUSES },
      receipt: { label: 'Receipts from clients', list: any(receivables.list.bind(receivables)), get: any(receivables.get.bind(receivables)), href: () => '/receivables' },
      vendor_payment: { label: 'Payments to vendors and subcontractors (bills and advances)', list: any(payables.list.bind(payables)), get: any(payables.get.bind(payables)), href: () => '/payables' },
      payment_request: {
        label: 'Payment requests (asking for a bill to be paid, or an advance on a PO or work order, before accounts pays)',
        list: any(paymentRequests.list.bind(paymentRequests)),
        get: any(paymentRequests.get.bind(paymentRequests)),
        href: (id) => `/payment-requests/${id}`,
        statuses: SUBMISSION_STATUSES,
      },
      stock_entry: { label: 'Stock entries (GRN receipts, issues, transfers, returns)', list: any(stock.list.bind(stock)), get: any(stock.get.bind(stock)), href: () => '/stock' },
    };
    const kindNames = Object.keys(this.kinds);
    const kindHelp = kindNames.map((k) => `${k}: ${this.kinds[k].label}`).join('; ');

    this.tools = [
      {
        def: {
          name: 'search_records',
          description: 'Find records by number or name across the company: material requests, POs, bills, MB, expenses, inspections, risks, documents, vendors, clients, items and people. Use for a record number (PO-2026-0014), a vendor or an item name.',
          input_schema: { type: 'object', properties: { q: { type: 'string', description: 'Words or a number to look for' } }, required: ['q'] },
        },
        run: async (user, i) => (await search.search(user, optText(i.q) ?? '')).hits,
      },
      {
        def: {
          name: 'search_documents',
          description:
            "Search inside the filed documents: the current revision's PDF of contracts, specifications, method statements, reports and drawings, page by page, and letters in and out. Returns the best pages with their text, page number and a link that opens the PDF at that page. Use for what a contract or specification says and whether a letter was sent. Send search words, not a question.",
          input_schema: {
            type: 'object',
            properties: { query: { type: 'string', description: 'Words to look for, e.g. "liquidated damages maximum" or "price adjustment clause"' }, projectId: { type: 'string', description: 'Search one project (an id from list_projects)' } },
            required: ['query'],
          },
        },
        run: async (user, i) => {
          const query = optText(i.query);
          if (!query) throw new BadRequestException('query is needed: the words to look for');
          const { hits, unread } = await documentText.search(user, { query, projectId: optUuid(i.projectId, 'projectId'), read: false });
          return {
            results: hits,
            ...(hits.length ? {} : { note: 'Nothing in the filed documents matches these words. Try the words a contract would use, or say the documents do not cover it.' }),
            ...(unread ? { notSearchedYet: `${unread} filed PDF${unread === 1 ? ' is' : 's are'} not searchable yet; files are read when filed and overnight.` } : {}),
          };
        },
      },
      {
        def: {
          name: 'list_projects',
          description: 'Projects the user can see, with client, value, dates, status and progress. Call this first to get project ids.',
          input_schema: { type: 'object', properties: { q: { type: 'string', description: 'Part of a project name, code, client or place' }, status: { type: 'string', enum: [...PROJECT_STATUSES] } } },
        },
        run: async (user, i) => this.withHrefs(await projects.list(user, { q: optText(i.q), status: optStatus(i.status) as never, page: 1, pageSize: 50 }), (id) => `/projects/${id}`),
      },
      {
        def: {
          name: 'project_overview',
          description: 'One project at a glance: physical progress, BOQ value and value done, activities completed and delayed, approvals pending, open material requests, last DPR, recent progress and DPRs, progress by activity.',
          input_schema: { type: 'object', properties: { projectId: { type: 'string' } }, required: ['projectId'] },
        },
        run: async (user, i) => {
          const d = await dashboard.project(user, uuid(i.projectId, 'projectId'));
          return {
            ...d,
            href: `/projects/${d.project.id}`,
            recentProgress: d.recentProgress.map((r) => ({ ...r, href: `/progress/${r.id}` })),
            recentDprs: d.recentDprs.map((r) => ({ ...r, href: `/dpr/${r.id}` })),
          };
        },
      },
      {
        def: { name: 'company_overview', description: 'Company-wide figures: projects by status, contract value, work done, billing, receivables, payables, this month.', input_schema: { type: 'object', properties: {} } },
        run: (user) => dashboard.company(user),
      },
      {
        def: {
          name: 'my_work',
          description: "What needs the user now: approvals waiting by type, today's missing DPRs, their entries sent back, bills due, receivables, expiring guarantees, late deliveries, low stock. Each item has a link.",
          input_schema: { type: 'object', properties: {} },
        },
        run: (user) => home.myWork(user),
      },
      {
        def: { name: 'approvals_waiting', description: 'Every entry waiting for this user to approve, oldest first, with type, project, who submitted it, when, and amount.', input_schema: { type: 'object', properties: {} } },
        run: async (user) => (await lifecycle.pending(user)).map((p) => ({ ...p, href: submissionHref(p.type, p.id) })),
      },
      {
        def: { name: 'monthly_trends', description: 'The last six months, month by month: work done, DPRs, billed, cash in and out (the money ones only for roles that see them).', input_schema: { type: 'object', properties: {} } },
        run: (user) => home.trends(user),
      },
      {
        def: {
          name: 'list_records',
          description: `List records of one kind, newest first, ${PAGE} a page, with the totals the list shows. Kinds: ${kindHelp}. Submission statuses: DRAFT, SUBMITTED (waiting for approval), APPROVED, REJECTED, CHANGES_REQUESTED.`,
          input_schema: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: kindNames },
              projectId: projectIdProp,
              status: { type: 'string', description: 'Status to filter on' },
              from: fromProp,
              to: toProp,
              q: { type: 'string', description: 'Words to search in the list (number, vendor, item, description)' },
              page: { type: 'integer', description: 'Page number, from 1' },
            },
            required: ['kind'],
          },
        },
        run: (user, i) => this.listRecords(user, i),
      },
      {
        def: {
          name: 'get_record',
          description: 'Open one record with all its lines and details, by kind and id from an earlier result.',
          input_schema: { type: 'object', properties: { kind: { type: 'string', enum: kindNames }, id: { type: 'string' } }, required: ['kind', 'id'] },
        },
        run: async (user, i) => {
          const kind = this.kind(user, i.kind);
          const row = await kind.get(user, uuid(i.id, 'id'));
          return { ...row, href: kind.href(row.id) };
        },
      },
      {
        def: { name: 'schedule', description: "A project's activities with planned and baseline dates, progress, forecast finish and milestones (the Gantt), with the links between activities, the critical path and each one's float.", input_schema: { type: 'object', properties: { projectId: { type: 'string' } }, required: ['projectId'] } },
        run: (user, i) => schedule.gantt(user, uuid(i.projectId, 'projectId')),
      },
      {
        def: {
          name: 'project_cost',
          description: 'Cost so far by head (material, labour, subcontract, machinery, expenses) against work done and billing. With projectId: one project in detail; without: every project in one line each.',
          input_schema: { type: 'object', properties: { projectId: projectIdProp, from: fromProp, to: toProp } },
        },
        allowed: (u) => canViewCost(u.roleKey),
        run: (user, i) => {
          const q = { from: optDate(i.from, 'from'), to: optDate(i.to, 'to') };
          const projectId = optUuid(i.projectId, 'projectId');
          return projectId ? cost.project(user, projectId, q) : cost.summary(user, q);
        },
      },
      {
        def: { name: 'project_budget', description: 'A project\'s budget by BOQ item and cost head against actual and forecast to complete.', input_schema: { type: 'object', properties: { projectId: { type: 'string' } }, required: ['projectId'] } },
        allowed: (u) => canViewCost(u.roleKey),
        run: (user, i) => budget.get(user, uuid(i.projectId, 'projectId')),
      },
      {
        def: {
          name: 'earned_value',
          description:
            "A project's earned value: planned value from the baseline, earned value from approved progress (or measured work with basis MEASURED) and actual cost, with SPI, CPI, the estimate at completion, the earned schedule and forecast finish, the monthly S-curve, and each activity's planned and done share, furthest behind first.",
          input_schema: { type: 'object', properties: { projectId: { type: 'string' }, basis: { type: 'string', enum: ['PROGRESS', 'MEASURED'] } }, required: ['projectId'] },
        },
        allowed: (u) => canViewCost(u.roleKey),
        run: (user, i) => earnedValue.get(user, uuid(i.projectId, 'projectId'), i.basis === 'MEASURED' ? 'MEASURED' : 'PROGRESS'),
      },
      {
        def: {
          name: 'material_reconciliation',
          description:
            "A project's material reconciliation: per material, theoretical use (approved progress × the QS's norms), allowed (with wastage), issued less returned, the variance and whether it is over the allowance; with view SUBCONTRACTORS, each subcontractor's issues against their measured work, and with view WASTAGE, stock adjustments by reason (wastage, damage, theft, count differences). Values only for roles that see cost.",
          input_schema: {
            type: 'object',
            properties: { projectId: { type: 'string' }, view: { type: 'string', enum: ['MATERIALS', 'SUBCONTRACTORS', 'WASTAGE'] }, from: fromProp, to: toProp },
            required: ['projectId'],
          },
        },
        allowed: (u) => canViewReconciliation(u.roleKey),
        run: (user, i) => {
          const projectId = uuid(i.projectId, 'projectId');
          const q = { from: optDate(i.from, 'from'), to: optDate(i.to, 'to') };
          if (i.view === 'SUBCONTRACTORS') return reconciliation.subcontractors(user, projectId);
          if (i.view === 'WASTAGE') return reconciliation.wastage(user, projectId, q);
          return reconciliation.get(user, projectId, q);
        },
      },
      {
        def: {
          name: 'cash_flow',
          description: 'Cash-flow forecast: money expected in (RA bills, retention) and out (vendor and subcontractor bills, payroll) by month or week, and the gap.',
          input_schema: { type: 'object', properties: { projectId: projectIdProp, granularity: { type: 'string', enum: ['MONTH', 'WEEK'] } } },
        },
        allowed: (u) => canViewCost(u.roleKey),
        run: (user, i) => cashFlow.forecast(user, { projectId: optUuid(i.projectId, 'projectId'), granularity: i.granularity === 'WEEK' ? 'WEEK' : 'MONTH' }),
      },
      {
        def: {
          name: 'stock_on_hand',
          description: 'Stock balance by item and store, with minimum levels and which are low.',
          input_schema: { type: 'object', properties: { projectId: projectIdProp, q: { type: 'string', description: 'Item name or category' }, lowOnly: { type: 'boolean', description: 'Only items below their minimum level' } } },
        },
        run: (user, i) => stock.balances(user, { projectId: optUuid(i.projectId, 'projectId'), q: optText(i.q), lowOnly: i.lowOnly === true, page: 1, pageSize: 50 }),
      },
      {
        def: {
          name: 'delivery_status',
          description: 'Approved purchase orders with what is still to come, by line, and which deliveries are late.',
          input_schema: { type: 'object', properties: { projectId: projectIdProp, show: { type: 'string', enum: ['PENDING', 'LATE', 'ALL'] } } },
        },
        allowed: (u) => canViewPurchaseOrders(u.roleKey),
        run: (user, i) => pos.status(user, { projectId: optUuid(i.projectId, 'projectId'), show: i.show === 'LATE' || i.show === 'ALL' ? i.show : 'PENDING' }),
      },
      {
        def: { name: 'risks_summary', description: 'Delays and risks: open counts by kind and category, days lost, overdue actions, the heat map.', input_schema: { type: 'object', properties: { projectId: projectIdProp } } },
        run: (user, i) => risks.summary(user, { projectId: optUuid(i.projectId, 'projectId') }),
      },
      {
        def: { name: 'ld_exposure', description: 'Liquidated damages exposure per project from the contract LD rate and the delay register.', input_schema: { type: 'object', properties: {} } },
        allowed: (u) => canViewContract(u.roleKey),
        run: (user) => contracts.ldExposureList(user),
      },
      {
        def: { name: 'expenses_summary', description: 'Site expense totals by status and category for a period.', input_schema: { type: 'object', properties: { projectId: projectIdProp, from: fromProp, to: toProp } } },
        run: (user, i) => expenses.summary(user, { projectId: optUuid(i.projectId, 'projectId'), from: optDate(i.from, 'from'), to: optDate(i.to, 'to') } as never),
      },
      {
        def: { name: 'receivables_summary', description: 'What clients owe on RA bills: billed, received, outstanding, retention held, ageing, per project.', input_schema: { type: 'object', properties: { projectId: projectIdProp } } },
        run: (user, i) => receivables.summary(user, { projectId: optUuid(i.projectId, 'projectId') }),
      },
      {
        def: { name: 'payables_summary', description: 'What we owe vendors and subcontractors: bills due, overdue, MSME 45-day limits, by vendor and project.', input_schema: { type: 'object', properties: { projectId: projectIdProp } } },
        run: (user, i) => payables.summary(user, { projectId: optUuid(i.projectId, 'projectId') }),
      },
      {
        def: { name: 'quality_summary', description: 'Inspections waiting, tests pending, overdue and failed, NCRs open and overdue.', input_schema: { type: 'object', properties: { projectId: projectIdProp } } },
        run: (user, i) => quality.summary(user, optUuid(i.projectId, 'projectId')),
      },
      {
        def: { name: 'safety_summary', description: 'Incidents and near misses this month, open incidents, toolbox talks, permits waiting and active.', input_schema: { type: 'object', properties: { projectId: projectIdProp } } },
        module: 'safety',
        run: (user, i) => safety.summary(user, optUuid(i.projectId, 'projectId')),
      },
      {
        def: {
          name: 'project_week',
          description:
            'Summarise a project over a period (default the last 7 days, at most 31): work done by activity, activities behind plan or due, DPRs filed and their issues, labour man-days by trade, machine hours, idle, breakdowns and diesel, materials received, vendor and subcontractor bills, new delays and risks, and what waits for this user to decide. Use for "summarise this week" or "what happened on site".',
          input_schema: { type: 'object', properties: { projectId: { type: 'string' }, from: fromProp, to: toProp }, required: ['projectId'] },
        },
        run: (user, i) => digest.week(user, uuid(i.projectId, 'projectId'), optDate(i.from, 'from'), optDate(i.to, 'to')),
      },
      {
        def: {
          name: 'explain_activities',
          description:
            'Why activities are behind: for one activity (activityId from schedule) or every behind or late activity of a project, the plan against progress, when progress was last booked, delay entries linked to it, machine breakdowns on it, plus DPR issues, open delays and material requests waiting on the project.',
          input_schema: { type: 'object', properties: { projectId: { type: 'string' }, activityId: { type: 'string', description: 'One activity; omit for every behind or late one' } }, required: ['projectId'] },
        },
        run: (user, i) => digest.activities(user, uuid(i.projectId, 'projectId'), optUuid(i.activityId, 'activityId')),
      },
      {
        def: {
          name: 'ra_bill_changes',
          description: "What changed on an RA bill since the project's previous bill: quantity and amount per BOQ item this bill against last bill, new and dropped items, gross, price variation, deductions and net. The latest bill when billId is left out.",
          input_schema: { type: 'object', properties: { projectId: { type: 'string' }, billId: { type: 'string', description: 'An RA bill id; omit for the latest bill' } }, required: ['projectId'] },
        },
        allowed: (u) => canViewContract(u.roleKey),
        run: (user, i) => digest.raBillChanges(user, uuid(i.projectId, 'projectId'), optUuid(i.billId, 'billId')),
      },
      {
        def: { name: 'machinery_summary', description: 'Machines due for service, open breakdown job cards, vehicle papers and licences expiring.', input_schema: { type: 'object', properties: { projectId: projectIdProp } } },
        run: (user, i) => maintenance.summary(user, optUuid(i.projectId, 'projectId')),
      },
      // Drafts from a sentence (item 71): fill a form for the user to check and save; never a write.
      {
        def: {
          name: 'draft_material_request',
          description: `Fill in a new material request (indent) from what the user asked for: items with quantity and unit, the date needed, priority. Item names in English as a store would write them (OPC 53 cement, TMT 12mm), even when the user writes in Hindi; they are matched to the item master. ${DRAFT_NOTE}`,
          input_schema: {
            type: 'object',
            properties: {
              ...draftProjectProps,
              items: {
                type: 'array',
                items: { type: 'object', properties: { name: { type: 'string' }, specification: { type: 'string', description: 'Grade, brand or size, if said' }, quantity: { type: 'number' }, unit: { type: 'string', description: 'Bags, MT, Kg, Cum, Nos, Ltr, Rmt…' } }, required: ['name', 'quantity'] },
              },
              requiredDate: { type: 'string', description: 'Needed by, YYYY-MM-DD; work out "by Friday" from today' },
              priority: { type: 'string', enum: [...MATERIAL_PRIORITIES] },
              remarks: { type: 'string' },
            },
            required: ['items'],
          },
        },
        run: (user, i) => drafts.materialRequest(user, i),
      },
      {
        def: {
          name: 'draft_expense',
          description: `Fill in a site expense (petty cash spent on site) from what the user said. ${DRAFT_NOTE}`,
          input_schema: {
            type: 'object',
            properties: {
              ...draftProjectProps,
              date: { type: 'string', description: 'YYYY-MM-DD; today if not said' },
              category: { type: 'string', enum: [...EXPENSE_CATEGORIES] },
              description: { type: 'string', description: 'What it was for, in a few words' },
              amount: { type: 'number', description: 'Rupees, including GST' },
              gstRate: { type: 'number', description: 'GST per cent, only if said' },
              vendor: { type: 'string', description: 'Shop or person paid' },
              billNo: { type: 'string' },
              paymentMode: { type: 'string', enum: [...PAYMENT_MODES] },
              remarks: { type: 'string' },
            },
            required: ['description', 'amount'],
          },
        },
        allowed: (u) => canSubmitExpense(u.roleKey),
        run: (user, i) => drafts.expense(user, i),
      },
      {
        def: {
          name: 'draft_progress',
          description: `Fill in a progress entry: a quantity of one schedule activity done on a day. The activity is matched to the project's schedule. ${DRAFT_NOTE}`,
          input_schema: {
            type: 'object',
            properties: {
              ...draftProjectProps,
              activity: { type: 'string', description: 'The work done, as the user named it (or the BOQ item number)' },
              quantity: { type: 'number' },
              unit: { type: 'string', description: 'As the user said it, if they did' },
              date: { type: 'string', description: 'YYYY-MM-DD; today if not said' },
              location: { type: 'string', description: 'Chainage, floor, grid or village, if said' },
              manpowerCount: { type: 'number' },
              remarks: { type: 'string' },
            },
            required: ['activity', 'quantity'],
          },
        },
        run: (user, i) => drafts.progress(user, i),
      },
      {
        def: {
          name: 'draft_dpr',
          description: `Fill in a daily progress report (DPR) from the user's rough notes: sort what they wrote into the report's sections without adding anything they did not say. ${DRAFT_NOTE}`,
          input_schema: {
            type: 'object',
            properties: {
              ...draftProjectProps,
              date: { type: 'string', description: 'YYYY-MM-DD; today if not said' },
              weather: { type: 'string', enum: [...WEATHER_OPTIONS] },
              siteCondition: { type: 'string' },
              manpower: { type: 'array', items: { type: 'object', properties: { category: { type: 'string', description: 'Mason, helper, carpenter, bar bender…' }, count: { type: 'number' } }, required: ['category', 'count'] } },
              machinery: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, hours: { type: 'number' } }, required: ['name', 'hours'] } },
              workExecuted: { type: 'string', description: 'Work done, one line per item of work' },
              materialReceived: { type: 'string' },
              testsConducted: { type: 'string' },
              safetyObservations: { type: 'string' },
              issues: { type: 'string', description: 'Hold-ups and problems' },
              nextDayPlan: { type: 'string' },
            },
            required: ['workExecuted'],
          },
        },
        run: (user, i) => drafts.dailyReport(user, i),
      },
      {
        def: {
          name: 'draft_letter',
          description: `Fill in an outgoing letter for the project's correspondence register: to the client or anyone else. For an RA bill's covering letter pass raBillId (from list_records kind ra_bill) and the letter's figures are filled from the bill; write only what the user asked to add in body. ${DRAFT_NOTE}`,
          input_schema: {
            type: 'object',
            properties: {
              ...draftProjectProps,
              party: { type: 'string', description: "Who it is to; the project's client when not said" },
              subject: { type: 'string' },
              body: { type: 'string', description: 'The letter text, in plain paragraphs, using only facts from the user or your tools' },
              raBillId: { type: 'string', description: 'For a covering letter of an RA bill' },
              inReplyToId: { type: 'string', description: 'A received letter this answers' },
            },
          },
        },
        allowed: (u) => canViewLetters(u.roleKey),
        run: (user, i) => drafts.letter(user, i),
      },
    ];
  }

  /** Tool definitions this user may call, in a fixed order so the prompt cache holds. */
  definitions(user: RequestUser): Anthropic.Beta.BetaTool[] {
    return this.tools.filter((t) => (!t.module || moduleOn(user, t.module)) && (!t.allowed || t.allowed(user))).map((t) => t.def);
  }

  /** Every definition, for the cached prefix when the user's role does not matter. */
  allDefinitions(): Anthropic.Beta.BetaTool[] {
    return this.tools.map((t) => t.def);
  }

  /**
   * Runs one tool for this user. A refusal or a bad input comes back as an error result the model can read and work
   * around ("not allowed for your role"), never as a crash of the whole answer.
   */
  async run(user: RequestUser, name: string, input: unknown): Promise<{ result: unknown; text: string; isError: boolean; draft?: AiDraftDto }> {
    const tool = this.tools.find((t) => t.def.name === name);
    try {
      if (!tool) throw new BadRequestException(`No tool called ${name}`);
      if (tool.module && !moduleOn(user, tool.module)) throw new ForbiddenException(moduleOffMessage(tool.module));
      if (tool.allowed && !tool.allowed(user)) throw new ForbiddenException('Not available for your role');
      const raw = await tool.run(user, (input && typeof input === 'object' ? input : {}) as Input);
      const result = compact(raw) ?? (Array.isArray(raw) ? [] : {});
      // A draft goes to the panel whole; the model reads it compacted like any result.
      const draft = name.startsWith('draft_') ? (raw as { draft?: AiDraftDto }).draft : undefined;
      return { result, text: cap(JSON.stringify(result)), isError: false, ...(draft ? { draft } : {}) };
    } catch (e) {
      const message =
        e instanceof ForbiddenException ? `Not allowed: ${e.message}. Tell the user this is outside what their role can see.`
        : e instanceof NotFoundException ? `Not found: ${e.message}`
        : e instanceof BadRequestException ? `Bad input: ${e.message}`
        : 'The lookup failed. Try a narrower question or another tool.';
      return { result: null, text: message, isError: true };
    }
  }

  private kind(user: RequestUser, k: unknown): RecordKind {
    const kind = typeof k === 'string' ? this.kinds[k] : undefined;
    if (!kind) throw new BadRequestException(`kind must be one of ${Object.keys(this.kinds).join(', ')}`);
    if (kind.module && !moduleOn(user, kind.module)) throw new ForbiddenException(moduleOffMessage(kind.module));
    return kind;
  }

  private async listRecords(user: RequestUser, i: Input) {
    const kind = this.kind(user, i.kind);
    const status = optStatus(i.status);
    if (status && kind.statuses && !kind.statuses.includes(status)) throw new BadRequestException(`status must be one of ${kind.statuses.join(', ')}`);
    const q = {
      projectId: optUuid(i.projectId, 'projectId'),
      status,
      from: optDate(i.from, 'from'),
      to: optDate(i.to, 'to'),
      q: optText(i.q),
      page: optPage(i.page),
      pageSize: PAGE,
    };
    const page = await kind.list(user, q);
    return this.withHrefs(page, kind.href);
  }

  private withHrefs<T extends { id: string }>(page: Paginated<T>, href: (id: string) => string) {
    return { ...page, items: page.items.map((r) => ({ ...r, href: href(r.id) })) };
  }
}

/** Leaves out empty values and files, and shortens long text and long lists, so the model reads what matters. */
export function compact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined || value === '') return undefined;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value.length > 400 ? `${value.slice(0, 400)}…` : value;
  if (typeof value !== 'object') return value;
  if (depth > 6) return undefined;
  if (Array.isArray(value)) {
    const items = value.slice(0, 40).map((v) => compact(v, depth + 1)).filter((v) => v !== undefined);
    if (!items.length) return undefined;
    return value.length > 40 ? [...items, `…and ${value.length - 40} more`] : items;
  }
  if (typeof (value as { toFixed?: unknown }).toFixed === 'function' && typeof (value as { toString: () => string }).toString === 'function' && 'd' in (value as object)) {
    // A Prisma Decimal that slipped through a DTO
    return (value as { toString: () => string }).toString();
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (DROP_KEYS.has(k)) continue;
    const c = compact(v, depth + 1);
    if (c !== undefined) out[k] = c;
  }
  // A per-project row in a summary (cost, receivables…) links to its project, so the answer can cite it.
  if (typeof out.projectId === 'string' && UUID.test(out.projectId) && out.href === undefined) out.href = `/projects/${out.projectId}`;
  return Object.keys(out).length ? out : undefined;
}

const cap = (json: string) => (json.length > MAX_RESULT ? `${json.slice(0, MAX_RESULT)}… [cut here: ask for one project, a shorter period or a filter to see the rest]` : json);
