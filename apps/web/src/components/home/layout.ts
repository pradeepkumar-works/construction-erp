import type { MyWorkDto, RoleKey } from '@erp/shared';

export type MyWorkKey = keyof MyWorkDto;
export type KpiKey = 'contract' | 'projects' | 'workDone' | 'billed' | 'cost' | 'cashIn' | 'receivables' | 'payables' | 'pending' | 'delayed' | 'dprsToday';
export type ChartKey = 'sCurve' | 'cashFlow' | 'billingVsContract' | 'costByHead';

export interface HomeLayout {
  myWork: MyWorkKey[];
  kpis: KpiKey[];
  charts: ChartKey[];
}

/**
 * What the home page leads with for each kind of user (UI roadmap item 59). Order only: a card, tile or chart the
 * caller's role cannot see is left out by the API, so a layout never shows more than the role's permissions allow.
 */
const LAYOUTS: Record<'director' | 'manager' | 'accounts' | 'stores' | 'qs' | 'site', HomeLayout> = {
  director: {
    myWork: ['approvals', 'watchList', 'receivables', 'payablesDue', 'expiring', 'lateDeliveries', 'dprsMissing', 'lowStock', 'sentBack'],
    kpis: ['contract', 'workDone', 'billed', 'cashIn', 'receivables', 'payables'],
    charts: ['sCurve', 'cashFlow', 'billingVsContract', 'costByHead'],
  },
  manager: {
    myWork: ['approvals', 'watchList', 'dprsMissing', 'lateDeliveries', 'expiring', 'lowStock', 'payablesDue', 'receivables', 'sentBack'],
    kpis: ['workDone', 'pending', 'delayed', 'dprsToday', 'cost', 'billed'],
    charts: ['sCurve', 'costByHead', 'billingVsContract', 'cashFlow'],
  },
  accounts: {
    myWork: ['payablesDue', 'watchList', 'receivables', 'approvals', 'expiring', 'lateDeliveries', 'sentBack'],
    kpis: ['cashIn', 'receivables', 'payables', 'billed', 'cost'],
    charts: ['cashFlow', 'billingVsContract', 'costByHead'],
  },
  stores: {
    myWork: ['lateDeliveries', 'lowStock', 'watchList', 'approvals', 'sentBack', 'dprsMissing'],
    kpis: ['projects', 'workDone', 'dprsToday', 'delayed'],
    charts: ['sCurve'],
  },
  qs: {
    myWork: ['sentBack', 'approvals', 'receivables', 'dprsMissing'],
    kpis: ['workDone', 'billed', 'receivables', 'contract'],
    charts: ['billingVsContract', 'sCurve'],
  },
  site: {
    myWork: ['sentBack', 'dprsMissing', 'approvals', 'lateDeliveries', 'lowStock'],
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
    case 'STORE_MANAGER':
    case 'PROCUREMENT_MANAGER':
      return LAYOUTS.stores;
    case 'QUANTITY_SURVEYOR':
      return LAYOUTS.qs;
    default:
      return LAYOUTS.site;
  }
}
