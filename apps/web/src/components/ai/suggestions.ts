import type { AuthUser } from '@erp/shared';
import { canPurchase, canViewCost, canViewPayables, canViewPurchaseOrders, isCompanyWide, mayApprove, submitsDpr } from '@erp/shared';

/** Pages that show one record, so "this one" has a meaning there. */
const RECORD_PAGE = /^\/(dpr|progress|bills|purchase-orders|material-requests|vendor-bills|work-orders|subcontract-bills|measurements|expenses|inspections|machinery)\/[\w-]+/;

/**
 * The first questions the panel offers, picked for the person and the page they are on (at most four). They are
 * starting points people can click, so each must be something the assistant's tools answer for that role.
 */
export function suggestionsFor(user: AuthUser, path: string, projectName?: string): string[] {
  const role = user.roleKey;
  const out: string[] = [];
  if (RECORD_PAGE.test(path)) out.push('Summarise this record and tell me what is pending on it');
  if (path.startsWith('/documents')) out.push(projectName ? `What is the LD cap in the ${projectName} contract?` : 'What is the LD cap in our contracts, and where does it say so?');
  if (/^\/projects\/[\w-]+/.test(path) || projectName) {
    const name = /^\/projects\/[\w-]+/.test(path) ? 'this project' : projectName;
    out.push(`How is ${name} doing against plan?`);
    if (canViewCost(role)) out.push(`Where is ${name} over budget?`);
    if (name === 'this project') out.push('Which clause of this project\'s contract allows price variation?');
  }
  if (mayApprove(user)) out.push('What is waiting for my approval, oldest first?');
  if (canViewCost(role) && isCompanyWide(role)) out.push('Which projects have the lowest margin right now?');
  if (canViewPurchaseOrders(role) && (canPurchase(role) || role === 'STORE_MANAGER')) out.push('Which purchase orders are late for delivery?');
  if (canViewPayables(role)) out.push('Which vendor bills are due in the next two weeks?');
  if (submitsDpr(role)) out.push('What did we report on site this week?');
  out.push('Which materials are running low in the store?', 'Any open safety incidents or high risks?', 'What should I look at today?');
  return [...new Set(out)].slice(0, 4);
}
