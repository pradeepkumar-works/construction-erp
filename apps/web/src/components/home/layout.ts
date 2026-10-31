import type { MyWorkDto, RoleKey } from '@erp/shared';

export type MyWorkKey = Exclude<keyof MyWorkDto, 'approvalsWaitingDays'>;
export type KpiKey = 'contract' | 'projects' | 'progress' | 'workDone' | 'billed' | 'cost' | 'cashIn' | 'receivables' | 'payables' | 'delayed' | 'dprsToday';
export type ChartKey = 'sCurve' | 'cashFlow' | 'billingVsContract' | 'costByHead';

export interface HomeLayout {
  myWork: MyWorkKey[];
  kpis: KpiKey[];
  charts: ChartKey[];
}

/**
 * What the home page leads with for each kind of user. Order only: a card, tile or chart the
 * caller's role cannot see is left out by the API, so a layout never shows more than the role's permissions allow.
 * My work puts its most urgent card first; `myWork` orders the cards that are equally urgent.
 */
const LAYOUTS: Record<'director' | 'manager' | 'accounts' | 'purchase' | 'stores' | 'hr' | 'qs' | 'site' | 'documents', HomeLayout> = {
  director: {
    myWork: ['approvals', 'watchList', 'receivables', 'payablesDue', 'certifiedToReceive', 'expiring', 'lateDeliveries', 'toOrder', 'staffToDecide', 'dprsMissing', 'lowStock', 'toMatch', 'toDebit', 'grnsToCheck', 'findingsToClose', 'dueThisWeek', 'transfersToReceive', 'meetingActions', 'letters', 'sentBack', 'waitingWithOthers'],
    kpis: ['contract', 'workDone', 'billed', 'cashIn', 'receivables', 'payables'],
    charts: ['sCurve', 'cashFlow', 'billingVsContract', 'costByHead'],
  },
  manager: {
    myWork: ['approvals', 'watchList', 'meetingActions', 'letters', 'dprsMissing', 'staffToDecide', 'lateDeliveries', 'toOrder', 'grnsToCheck', 'findingsToClose', 'dueThisWeek', 'transfersToReceive', 'expiring', 'lowStock', 'payablesDue', 'receivables', 'sentBack', 'waitingWithOthers'],
    // The approvals count is My work's and the sidebar's; this row leads with progress against plan instead.
    kpis: ['progress', 'workDone', 'delayed', 'dprsToday', 'cost', 'billed'],
    charts: ['sCurve', 'costByHead', 'billingVsContract', 'cashFlow'],
  },
  accounts: {
    myWork: ['payablesDue', 'certifiedToReceive', 'toMatch', 'toDebit', 'watchList', 'receivables', 'approvals', 'expiring', 'lateDeliveries', 'meetingActions', 'letters', 'sentBack', 'waitingWithOthers'],
    kpis: ['cashIn', 'receivables', 'payables', 'billed', 'cost'],
    charts: ['cashFlow', 'billingVsContract', 'costByHead'],
  },
  purchase: {
    myWork: ['toOrder', 'lateDeliveries', 'dueThisWeek', 'toMatch', 'toDebit', 'approvals', 'watchList', 'lowStock', 'meetingActions', 'letters', 'sentBack', 'waitingWithOthers'],
    kpis: ['projects', 'workDone', 'dprsToday', 'delayed'],
    charts: ['sCurve'],
  },
  stores: {
    myWork: ['dueThisWeek', 'transfersToReceive', 'lateDeliveries', 'lowStock', 'watchList', 'approvals', 'meetingActions', 'letters', 'sentBack', 'waitingWithOthers', 'dprsMissing'],
    kpis: ['projects', 'workDone', 'dprsToday', 'delayed'],
    charts: ['sCurve'],
  },
  hr: {
    myWork: ['staffToDecide', 'approvals', 'watchList', 'meetingActions', 'letters', 'sentBack', 'waitingWithOthers'],
    kpis: ['projects', 'dprsToday', 'workDone', 'delayed'],
    charts: ['sCurve'],
  },
  qs: {
    myWork: ['sentBack', 'waitingWithOthers', 'approvals', 'meetingActions', 'letters', 'receivables', 'dprsMissing'],
    kpis: ['workDone', 'billed', 'receivables', 'contract'],
    charts: ['billingVsContract', 'sCurve'],
  },
  documents: {
    myWork: ['letters', 'approvals', 'watchList', 'meetingActions', 'sentBack', 'waitingWithOthers'],
    kpis: ['projects', 'dprsToday', 'workDone', 'delayed'],
    charts: ['sCurve'],
  },
  site: {
    myWork: ['grnsToCheck', 'findingsToClose', 'sentBack', 'meetingActions', 'letters', 'waitingWithOthers', 'dprsMissing', 'approvals', 'dueThisWeek', 'transfersToReceive', 'lateDeliveries', 'lowStock', 'staffToDecide'],
    kpis: ['dprsToday', 'delayed', 'workDone', 'projects'],
    charts: ['sCurve'],
  },
};

export function homeLayout(role: RoleKey): HomeLayout {
  switch (role) {
    case 'ADMIN':
    case 'MANAGEMENT':
      return LAYOUTS.director;
    case 'PROJECT_MANAGER':
    case 'TEAM_LEADER':
      return LAYOUTS.manager;
    case 'ACCOUNTS_MANAGER':
      return LAYOUTS.accounts;
    case 'PROCUREMENT_MANAGER':
      return LAYOUTS.purchase;
    case 'STORE_MANAGER':
      return LAYOUTS.stores;
    case 'HR_MANAGER':
      return LAYOUTS.hr;
    case 'QUANTITY_SURVEYOR':
      return LAYOUTS.qs;
    case 'DOCUMENT_CONTROLLER':
      return LAYOUTS.documents;
    default:
      return LAYOUTS.site;
  }
}
