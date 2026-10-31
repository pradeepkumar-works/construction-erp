/**
 * Where a node of the navigation tree opens on the phone. Kept free of React Native so the web's
 * `scripts/nav-check.ts` can check every path against the phone's screens.
 */
import { navDestination, navNode, navTarget, type NavNode, type NavVisitDto } from '@erp/shared';

/** The phone's own screen for a node, by node id. A node not listed opens its page on the web. */
export const PHONE_ROUTES: Record<string, string> = {
  'my-work': '/my-work',
  approvals: '/approvals',
  'projects.all': '/projects',
  'site.dpr': '/submissions?type=DPR',
  'site.attendance': '/attendance',
  'site.progress': '/submissions?type=PROGRESS',
  'site.mb': '/submissions?type=MEASUREMENT',
  'site.risks': '/risks',
  'site.expenses': '/submissions?type=EXPENSE',
  'site.imprest': '/imprest',
  'quality.inspections': '/submissions?type=INSPECTION',
  'quality.tests': '/quality?show=tests',
  'quality.ncrs': '/quality?show=ncrs',
  'quality.incidents': '/safety?show=incidents',
  'quality.permits': '/safety?show=permits',
  'quality.talks': '/safety?show=talks',
  'documents.register': '/documents',
  'documents.rfis': '/rfis',
  'materials.requests': '/submissions?type=MATERIAL_REQUEST',
  'materials.stock': '/stock',
  'plant.logs': '/submissions?type=MACHINERY',
  'people.me': '/staff',
  'people.payslips': '/payslips',
  'people.register': '/staff-register',
};

/**
 * What a tap on a node does: a phone screen, the module's screen, a project tab (choose the project, then the web), or
 * the node's page on the web.
 */
export type PhoneTarget =
  | { kind: 'phone'; path: string }
  | { kind: 'module'; key: string }
  | { kind: 'project'; tab: string; query?: string }
  | { kind: 'web'; href: string };

export function phoneTarget(node: NavNode): PhoneTarget | null {
  const target = navTarget(node);
  const own = PHONE_ROUTES[target.id];
  if (own) return { kind: 'phone', path: own };
  if (target.parent === null && !target.route) return { kind: 'module', key: target.id };
  const to = navDestination(target);
  if (!to) return null;
  return to.kind === 'project' ? to : { kind: 'web', href: to.href };
}

/** A Recent entry: a node as above, a project's own screen, or else the record's page (mapped by the caller). */
export function visitNode(visit: NavVisitDto): NavNode | undefined {
  return visit.kind === 'NODE' ? navNode(visit.target) : undefined;
}
