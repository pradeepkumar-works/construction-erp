import { Injectable } from '@nestjs/common';
import {
  LEAVE_TYPE_LABELS,
  canApprovePayroll,
  canApproveVouchers,
  canKeepBooks,
  daysBetween,
  rankWaiting,
  type OtherDecisionDto,
  type OtherDecisionGroupDto,
  type OtherDecisionKind,
} from '@erp/shared';
import { RequestUser } from '../common/current-user';
import { formatDay } from '../common/serialize';
import { todayIn } from '../notifications/time';
import { StaffService } from '../staff/staff.service';
import { PayrollRunService } from '../payroll/payroll-run.service';
import { BooksService } from '../books/books.service';
import { CorrespondenceService } from '../correspondence/correspondence.service';

/** Most entries a group lists; its count still says how many there are. */
const SHOWN = 10;
const sum = (xs: (string | null)[]) => xs.reduce((s, x) => s + Number(x ?? 0), 0).toFixed(2);
const span = (from: string, to: string) => (from === to ? formatDay(from) : `${formatDay(from)} to ${formatDay(to)}`);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * What waits on the caller outside the submission queue, read through each module's own list with the caller, so its
 * access rules apply: leave and overtime to decide, salary runs to approve, vouchers to approve and letters to sign.
 * Each group links to where it is decided; a group the caller has no part in is left out.
 */
@Injectable()
export class OtherDecisionsService {
  constructor(private staff: StaffService, private payroll: PayrollRunService, private books: BooksService, private letters: CorrespondenceService) {}

  async forUser(user: RequestUser): Promise<OtherDecisionGroupDto[]> {
    const role = user.roleKey;
    const [leave, overtime, runs, vouchers, letters] = await Promise.all([
      this.staff.listLeave(user, { toDecide: true, sortBy: 'fromDate', sortOrder: 'asc', page: 1, pageSize: SHOWN }).catch(() => null),
      this.staff.overtimeToDecide(user).catch(() => null),
      canApprovePayroll(role) ? this.payroll.list(user, {}).catch(() => null) : null,
      canApproveVouchers(role) && canKeepBooks(role) ? this.books.vouchers(user, { toDecide: true, page: 1, pageSize: SHOWN }) : null,
      this.letters.list(user, { toSign: true, sortBy: 'letterDate', sortOrder: 'asc', page: 1, pageSize: SHOWN }).catch(() => null),
    ]);
    const groups: OtherDecisionGroupDto[] = [];
    const add = (kind: OtherDecisionKind, count: number, items: OtherDecisionDto[], href: string, money = false) => {
      if (!count) return;
      const sorted = [...items].sort((a, b) => a.since.localeCompare(b.since));
      groups.push({ kind, count, amount: money ? sum(sorted.map((i) => i.amount)) : null, href, items: sorted.slice(0, SHOWN) });
    };

    if (leave)
      add(
        'LEAVE',
        leave.total,
        leave.items.map((l) => ({
          id: l.id,
          title: `${l.employeeName} · ${LEAVE_TYPE_LABELS[l.type]}`,
          note: `${span(l.fromDate, l.toDate)}, ${plural(Number(l.days), 'day')}`,
          projectName: l.projectName,
          amount: null,
          since: l.createdAt.slice(0, 10),
          href: `/staff?tab=leave&leave=${l.id}`,
        })),
        '/staff?tab=leave',
      );
    if (overtime)
      add(
        'OVERTIME',
        overtime.length,
        overtime.map((o) => ({
          id: o.id,
          title: o.employeeName,
          note: `${Number(o.overtimeHours ?? 0)} hours on ${formatDay(o.date)}`,
          projectName: o.projectName,
          amount: null,
          since: o.date,
          href: '/staff?tab=overtime',
        })),
        '/staff?tab=overtime',
      );
    if (runs) {
      const waiting = runs.filter((r) => r.status === 'SUBMITTED' && r.can.approve);
      add(
        'PAYROLL_RUN',
        waiting.length,
        waiting.map((r) => ({
          id: r.id,
          title: `${r.runNo} · ${formatDay(`${r.month}-01`).replace(/^\d+ /, '')}`,
          note: `${plural(r.employees, 'person')}, prepared by ${r.preparedByName}`.replace('persons', 'people'),
          projectName: r.projectName,
          amount: r.net,
          since: (r.submittedAt ?? r.createdAt).slice(0, 10),
          href: `/payroll?tab=runs&run=${r.id}`,
        })),
        '/payroll?tab=runs',
        true,
      );
    }
    if (vouchers)
      add(
        'VOUCHER',
        vouchers.total,
        vouchers.items.map((v) => ({
          id: v.id,
          title: `${v.voucherNo}${v.party ? ` · ${v.party}` : ''}`,
          note: [v.narration, v.preparedByName ? `by ${v.preparedByName}` : null].filter(Boolean).join(' · '),
          projectName: v.projectName,
          amount: v.amount,
          since: v.date,
          href: `/books?tab=vouchers&voucher=${v.id}`,
        })),
        '/books?tab=vouchers',
        true,
      );
    if (letters)
      add(
        'LETTER',
        letters.total,
        letters.items.map((l) => ({
          id: l.id,
          title: `${l.letterNo ?? 'Draft'} · ${l.party}`,
          note: l.subject,
          projectName: l.projectName,
          amount: null,
          since: (l.sentForApprovalAt ?? l.letterDate).slice(0, 10),
          href: `/correspondence/${l.id}`,
        })),
        '/correspondence?toSign=1',
      );
    // In waiting order, as the queue's groups are: the rupees at stake, then how long the oldest has waited.
    const today = todayIn();
    return rankWaiting(groups, (g) => ({ amount: g.amount, daysLate: daysBetween(g.items[0].since, today) }));
  }
}
