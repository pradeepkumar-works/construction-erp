import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { COMMENT_KIND_LABELS, SUBMISSION_TYPES, type CommentKind, type SubmissionType } from '@erp/shared';
import type { RequestUser } from '../common/current-user';
import { NotificationsService } from '../notifications/notifications.service';
import { DprService } from '../dpr/dpr.service';
import { ProgressService } from '../progress/progress.service';
import { MaterialRequestsService } from '../material-requests/material-requests.service';
import { MachineryService } from '../machinery/machinery.service';
import { ExpensesService } from '../expenses/expenses.service';
import { MeasurementsService } from '../measurements/measurements.service';
import { RaBillsService } from '../ra-bills/ra-bills.service';
import { PurchaseOrdersService } from '../purchasing/purchase-orders.service';
import { VendorBillsService } from '../purchasing/vendor-bills.service';
import { WorkOrdersService } from '../subcontracts/work-orders.service';
import { SubcontractBillsService } from '../subcontracts/subcontract-bills.service';
import { InspectionsService } from '../inspections/inspections.service';
import { PaymentRequestsService } from '../payables/payment-requests.service';
import { RequestsToOrderService } from '../purchasing/requests-to-order.service';
import { MeetingsService } from '../meetings/meetings.service';
import { MaterialApprovalsService } from '../material-approvals/material-approvals.service';
import { moduleOffMessage, moduleOn } from '../common/module-switch.guard';

export interface CommentTarget {
  projectId: string | null;
  /** How a notice names it: "Purchase Order PO-0007: ₹1,20,000 to Shree Cement" */
  title: string;
}

type Getter = (user: RequestUser, id: string) => Promise<unknown>;

/**
 * The records comments can be on. Each kind loads its record through its own service with the user, so the
 * service's access rules decide who reads and writes its comments, and whom a comment may mention.
 */
@Injectable()
export class CommentTargetsService {
  private readonly getters: Record<SubmissionType, Getter>;

  constructor(
    private notifications: NotificationsService,
    private meetings: MeetingsService,
    private materialApprovals: MaterialApprovalsService,
    dpr: DprService,
    progress: ProgressService,
    mrs: MaterialRequestsService,
    machinery: MachineryService,
    expenses: ExpensesService,
    measurements: MeasurementsService,
    raBills: RaBillsService,
    pos: PurchaseOrdersService,
    vendorBills: VendorBillsService,
    workOrders: WorkOrdersService,
    subBills: SubcontractBillsService,
    inspections: InspectionsService,
    paymentRequests: PaymentRequestsService,
    toOrder: RequestsToOrderService,
  ) {
    this.getters = {
      PROGRESS: (u, id) => progress.get(u, id),
      DPR: (u, id) => dpr.get(u, id),
      MATERIAL_REQUEST: (u, id) => mrs.get(u, id),
      MACHINERY: (u, id) => machinery.get(u, id),
      EXPENSE: (u, id) => expenses.get(u, id),
      MEASUREMENT: (u, id) => measurements.get(u, id),
      BILL: (u, id) => raBills.get(u, id),
      PURCHASE_ORDER: (u, id) => pos.get(u, id),
      VENDOR_BILL: (u, id) => vendorBills.get(u, id),
      WORK_ORDER: (u, id) => workOrders.get(u, id),
      SUBCONTRACT_BILL: (u, id) => subBills.get(u, id),
      INSPECTION: (u, id) => inspections.get(u, id),
      PAYMENT_REQUEST: (u, id) => paymentRequests.get(u, id),
      SUPPLIER_CHOICE: (u, id) => toOrder.choice(u, id),
    };
  }

  /** The record, as the user may see it; throws (403 or 404) when they may not. */
  async load(user: RequestUser, kind: CommentKind, id: string): Promise<CommentTarget> {
    // A meeting or material approval while the company has that module off is out of reach.
    const switchable = kind === 'MEETING' ? 'meetings' : kind === 'MATERIAL_APPROVAL' ? 'material_approvals' : null;
    if (switchable && !moduleOn(user, switchable)) throw new ForbiddenException(moduleOffMessage(switchable));
    if (kind === 'MEETING') {
      const m = await this.meetings.get(user, id);
      return { projectId: m.projectId, title: `${m.meetingNo} ${m.title}` };
    }
    if (kind === 'MATERIAL_APPROVAL') {
      const a = await this.materialApprovals.get(user, id);
      return { projectId: a.projectId, title: `${a.marNo} ${a.material} (${a.make})` };
    }
    if (!(SUBMISSION_TYPES as readonly string[]).includes(kind)) throw new NotFoundException('Comments are not kept on that kind of record');
    await this.getters[kind as SubmissionType](user, id);
    const d = await this.notifications.describeSubmission(kind as SubmissionType, id);
    if (!d) throw new NotFoundException(`${COMMENT_KIND_LABELS[kind]} not found`);
    return { projectId: d.projectId, title: `${COMMENT_KIND_LABELS[kind]} ${d.title}` };
  }

  /** Whether someone else may see the record (for a mention). */
  async canSee(person: RequestUser, kind: CommentKind, id: string): Promise<boolean> {
    try {
      await this.load(person, kind, id);
      return true;
    } catch (e) {
      if (e instanceof ForbiddenException || e instanceof NotFoundException) return false;
      throw e;
    }
  }
}
