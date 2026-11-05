import { Injectable, NotFoundException } from '@nestjs/common';
import {
  DEPARTMENT_FIGURES,
  DEPARTMENT_PIPELINES,
  MAX_PAGE_SIZE,
  canPurchase,
  canViewLetters,
  canViewPayroll,
  canViewPurchaseOrders,
  daysPast,
  departmentFigures,
  isDepartmentModuleKey,
  monthWords,
  pipelineOf,
  salaryDueOn,
  salaryMonthsNotRun,
  settlementDueOn,
  type DepartmentHomeDto,
  type DepartmentPipelineDto,
  type Figure,
  type ModuleKey,
  type PipelineKey,
  type PipelineRowDto,
} from '@erp/shared';
import { RequestUser } from '../common/current-user';
import { ProjectAccessService } from '../common/project-access.service';
import { todayIn } from '../notifications/time';
import { MaterialRequestsService } from '../material-requests/material-requests.service';
import { RequestsToOrderService } from '../purchasing/requests-to-order.service';
import { PurchaseOrdersService } from '../purchasing/purchase-orders.service';
import { CorrespondenceService } from '../correspondence/correspondence.service';
import { ModuleHomeService } from './module-home.service';
import { PayrollRunService } from '../payroll/payroll-run.service';
import { SettlementService } from '../payroll/settlement.service';
import { moduleOn } from '../common/module-switch.guard';

const listed = (names: string[], left: number) => (names.length ? `${names.join(', ')}${left > names.length ? ` and ${left - names.length} more` : ''}` : `${left} items`);

/**
 * Department screens (`@erp/shared/department-home.ts`): a department's figures, taken from the area modules'
 * own (`ModuleHomeService`), and its pipelines, read from the modules' own list services so their access rules hold:
 * material requests, requests to order and procurement status for indents and deliveries, the letter register for
 * letters. For the header's project, or every project the caller sees.
 */
@Injectable()
export class DepartmentHomeService {
  constructor(
    private access: ProjectAccessService,
    private modules: ModuleHomeService,
    private requests: MaterialRequestsService,
    private toOrder: RequestsToOrderService,
    private orders: PurchaseOrdersService,
    private letters: CorrespondenceService,
    private payrollRuns: PayrollRunService,
    private settlements: SettlementService,
  ) {}

  async home(user: RequestUser, department: string, projectId?: string): Promise<DepartmentHomeDto> {
    if (!isDepartmentModuleKey(department)) throw new NotFoundException('There is no such department');
    if (projectId) await this.access.assertCanAccessProject(user, projectId);
    const today = todayIn();
    const sources = [...new Set((DEPARTMENT_FIGURES[department] ?? []).map((s) => s.module))];
    const [figureSets, pipelines] = await Promise.all([
      Promise.all(sources.map(async (m) => [m, await this.modules.figures(user, m, today, projectId).catch(() => [] as Figure[])] as const)),
      Promise.all((DEPARTMENT_PIPELINES[department] ?? []).map((k) => this.pipeline(user, k, today, projectId))),
    ]);
    const byModule = Object.fromEntries(figureSets) as Partial<Record<ModuleKey, Figure[]>>;
    return { department, date: today, figures: departmentFigures(department, byModule), pipelines: pipelines.filter((p): p is DepartmentPipelineDto => !!p) };
  }

  /** A pipeline the caller may read, else null. */
  private async pipeline(user: RequestUser, key: PipelineKey, today: string, projectId?: string): Promise<DepartmentPipelineDto | null> {
    switch (key) {
      case 'indents':
        return canPurchase(user.roleKey) ? pipelineOf(key, await this.indents(user, today, projectId)) : null;
      case 'deliveries':
        return canViewPurchaseOrders(user.roleKey) ? pipelineOf(key, await this.deliveries(user, today, projectId)) : null;
      case 'letters':
        return canViewLetters(user.roleKey) ? pipelineOf(key, await this.letterRows(user, today, projectId)) : null;
      case 'salaries':
        return canViewPayroll(user.roleKey) && moduleOn(user, 'payroll') ? pipelineOf(key, await this.salaryRows(user, today)) : null;
    }
  }

  /** Requests waiting for approval, approved ones still to order (by their order stage), and orders still to arrive. */
  private async indents(user: RequestUser, today: string, projectId?: string): Promise<PipelineRowDto[]> {
    const [waiting, toOrder, orders] = await Promise.all([
      this.requests.list(user, { status: 'SUBMITTED', projectId, pageSize: MAX_PAGE_SIZE }),
      this.toOrder.rows(user, { projectId }),
      canViewPurchaseOrders(user.roleKey) ? this.deliveries(user, today, projectId) : [],
    ]);
    return [
      ...waiting.items.map((r) => ({
        id: r.id,
        number: r.requestNo,
        href: `/material-requests/${r.id}`,
        projectName: r.projectName,
        title: listed(r.items.slice(0, 3).map((i) => i.itemName), r.items.length),
        stage: 'APPROVAL',
        dueOn: r.requiredDate,
        daysLate: daysPast(r.requiredDate, today),
        since: r.submittedAt ? todayIn(undefined, new Date(r.submittedAt)) : null,
      })),
      ...toOrder.map((r) => ({
        id: r.id,
        number: r.requestNo,
        href: `/material-requests/${r.id}`,
        projectName: r.projectName,
        title: listed(r.itemNames, r.itemsLeft),
        stage: r.stage,
        dueOn: r.requiredDate,
        daysLate: daysPast(r.requiredDate, today),
        since: r.approvedAt ? todayIn(undefined, new Date(r.approvedAt)) : null,
      })),
      ...orders,
    ];
  }

  private async deliveries(user: RequestUser, today: string, projectId?: string): Promise<PipelineRowDto[]> {
    const status = await this.orders.status(user, { show: 'PENDING', projectId });
    return status.rows.map((o) => ({
      id: o.purchaseOrderId,
      number: o.poNo,
      href: `/purchase-orders/${o.purchaseOrderId}`,
      projectName: o.projectName,
      title: `${o.vendorName}: ${listed(o.lines.slice(0, 2).map((l) => l.itemName), o.lines.length)}`,
      stage: o.state,
      dueOn: o.deliveryBy,
      daysLate: o.daysLate,
      since: o.poDate,
    }));
  }

  /** Outward letters waiting to be signed or sealed, and letters our reply is due on. */
  private async letterRows(user: RequestUser, today: string, projectId?: string): Promise<PipelineRowDto[]> {
    const [awaiting, replies] = await Promise.all([
      this.letters.list(user, { status: 'AWAITING_APPROVAL', projectId, pageSize: MAX_PAGE_SIZE }),
      this.letters.list(user, { awaitingReply: true, projectId, pageSize: MAX_PAGE_SIZE }),
    ]);
    const replyDue = replies.items.filter((l) => l.direction === 'IN');
    return [
      ...awaiting.items.map((l) => ({
        id: l.id,
        number: l.letterNo ?? 'Not numbered',
        href: `/correspondence/${l.id}`,
        projectName: l.projectName,
        title: l.subject,
        stage: l.signedAt ? 'SEAL' : 'SIGN',
        dueOn: null,
        daysLate: 0,
        since: (l.signedAt ?? l.sentForApprovalAt) ? todayIn(undefined, new Date((l.signedAt ?? l.sentForApprovalAt)!)) : null,
      })),
      ...replyDue.map((l) => ({
        id: l.id,
        number: l.letterNo ?? l.theirRef ?? 'Received',
        href: `/correspondence/${l.id}`,
        projectName: l.projectName,
        title: l.subject,
        stage: 'REPLY',
        dueOn: l.replyBy,
        daysLate: daysPast(l.replyBy, today),
        since: l.letterDate,
      })),
    ];
  }

  /**
   * Salary runs not yet paid and months ended with none (`salaryMonthsNotRun`), due by the 7th of the next month; leavers'
   * full and finals not yet paid and leavers with none, due two days after the last working day. Payroll is the company's,
   * so the header's project does not narrow it.
   */
  private async salaryRows(user: RequestUser, today: string): Promise<PipelineRowDto[]> {
    const [runs, settlements, leavers] = await Promise.all([this.payrollRuns.list(user, {}), this.settlements.list(user), this.settlements.due(user)]);
    const runStage = { DRAFT: 'DRAFT', SUBMITTED: 'APPROVAL', APPROVED: 'TO_PAY' } as const;
    const settlementStage = { DRAFT: 'DRAFT', APPROVED: 'TO_PAY' } as const;
    const day = (iso: string | null) => (iso ? todayIn(undefined, new Date(iso)) : null);
    return [
      ...salaryMonthsNotRun(today, runs.map((r) => r.month)).map((m) => ({
        id: `month-${m}`,
        number: monthWords(m),
        href: '/payroll?tab=runs',
        projectName: null,
        title: `Salary run for ${monthWords(m)} not prepared`,
        stage: 'TO_PREPARE',
        dueOn: salaryDueOn(m),
        daysLate: daysPast(salaryDueOn(m), today),
        since: `${m}-01`,
      })),
      ...runs
        .filter((r) => r.status !== 'PAID')
        .map((r) => ({
          id: r.id,
          number: r.runNo,
          href: `/payroll?tab=runs&run=${r.id}`,
          projectName: r.projectName,
          title: `${monthWords(r.month)} salaries, ${r.employees} ${r.employees === 1 ? 'person' : 'people'}`,
          stage: runStage[r.status as keyof typeof runStage],
          dueOn: salaryDueOn(r.month),
          daysLate: daysPast(salaryDueOn(r.month), today),
          since: r.status === 'APPROVED' ? day(r.approvedAt) : r.status === 'SUBMITTED' ? day(r.submittedAt) : day(r.createdAt),
        })),
      ...leavers.map((e) => ({
        id: `leaver-${e.employeeId}`,
        number: e.employeeCode,
        href: '/payroll?tab=settlements',
        projectName: null,
        title: `Full and final for ${e.fullName} not prepared`,
        stage: 'TO_PREPARE',
        dueOn: e.leftOn ? settlementDueOn(e.leftOn) : null,
        daysLate: e.leftOn ? daysPast(settlementDueOn(e.leftOn), today) : 0,
        since: e.leftOn,
      })),
      ...settlements
        .filter((x) => x.status !== 'PAID')
        .map((x) => ({
          id: x.id,
          number: x.settlementNo,
          href: '/payroll?tab=settlements',
          projectName: null,
          title: `Full and final for ${x.employeeName}`,
          stage: settlementStage[x.status as keyof typeof settlementStage],
          dueOn: settlementDueOn(x.lastWorkingDay),
          daysLate: daysPast(settlementDueOn(x.lastWorkingDay), today),
          since: x.lastWorkingDay,
        })),
    ];
  }
}
