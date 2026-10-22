/**
 * The Concord Construction ERP brochure's modules, features and reports (12 pages, read for the launcher work in
 * October 2026): the minimum the navigation tree must cover. Each item is a node of the tree (which lists the item in its
 * `concord`), a feature built into every screen rather than a tile (`notTile`), or a known gap (`gap`, flagged in the
 * launcher plan). `scripts/nav-check.ts` fails when an item has no place.
 */
export interface ConcordItem {
  id: string;
  page: string;
  section: string;
  item: string;
  node?: string;
  notTile?: string;
  gap?: string;
}

export const CONCORD_ITEMS: ConcordItem[] = [
  { id: 'p3-tender', page: 'p3', section: 'Modules', item: 'Tender', node: 'tenders' },
  { id: 'p3-pm', page: 'p3', section: 'Modules', item: 'Project management', node: 'projects' },
  { id: 'p3-asset', page: 'p3', section: 'Modules', item: 'Asset management', node: 'plant' },
  { id: 'p3-mat', page: 'p3', section: 'Modules', item: 'Material management', node: 'materials' },
  { id: 'p3-hr', page: 'p3', section: 'Modules', item: 'Human resource', node: 'people' },
  { id: 'p3-fa', page: 'p3', section: 'Modules', item: 'Finance & accounts', node: 'accounts' },
  { id: 'p4-pm', page: 'p4', section: 'Phase I', item: 'Project management', node: 'projects' },
  { id: 'p4-pce', page: 'p4', section: 'Phase I', item: 'Planning (PCE)', node: 'projects.schedule' },
  { id: 'p4-bm', page: 'p4', section: 'Phase I', item: 'Billing & monitoring', node: 'billing.bills' },
  { id: 'p4-proc', page: 'p4', section: 'Phase I', item: 'Procurement', node: 'purchases' },
  { id: 'p4-stores', page: 'p4', section: 'Phase I', item: 'Stores management', node: 'materials.stock' },
  { id: 'p4-pnm', page: 'p4', section: 'Phase I', item: 'Plant & machinery', node: 'plant' },
  { id: 'p4-fa', page: 'p4', section: 'Phase I', item: 'Finance & accounts', node: 'accounts' },
  { id: 'p4-payroll', page: 'p4', section: 'Phase I', item: 'HR - Payroll', node: 'payroll' },
  { id: 'p4-bglc', page: 'p4', section: 'Phase I', item: 'BG, LC', node: 'billing.guarantees' },
  { id: 'p4-tendering', page: 'p4', section: 'Phase II', item: 'Tendering', node: 'tenders.register' },
  { id: 'p4-subrating', page: 'p4', section: 'Phase II', item: 'Sub-contractor rating in B&M module', gap: 'Not built. Flag 6.' },
  { id: 'p4-dash', page: 'p4', section: 'Phase II', item: 'Dashboards', node: 'my-work' },
  { id: 'p4-plantperf', page: 'p4', section: 'Phase II', item: 'Operating performance of major plants like batching plant', node: 'rmc.batches' },
  { id: 'p4-others', page: 'p4', section: 'Phase II', item: 'Others', gap: 'No content. Flag 2.' },
  { id: 'p4-web', page: 'p4', section: 'Phase II', item: 'Web functionality', notTile: 'The whole web app' },
  { id: 'p4-crm', page: 'p4', section: 'Phase II', item: 'CRM/Client management', node: 'billing.clients' },
  { id: 'p5-bd', page: 'p5', section: 'Process flow', item: 'Business development', node: 'tenders.register' },
  { id: 'p5-projects', page: 'p5', section: 'Process flow', item: 'Projects', node: 'projects.all' },
  { id: 'p5-plan', page: 'p5', section: 'Process flow', item: 'Planning & budgeting', node: 'projects.budget' },
  { id: 'p5-mat', page: 'p5', section: 'Process flow', item: 'Material management', node: 'materials' },
  { id: 'p5-pnm', page: 'p5', section: 'Process flow', item: 'Plant & machinery', node: 'plant' },
  { id: 'p5-hrms', page: 'p5', section: 'Process flow', item: 'HRMS', node: 'people' },
  { id: 'p5-overheads', page: 'p5', section: 'Process flow', item: 'Overheads', gap: 'Not built. Flag 5.' },
  { id: 'p5-sub', page: 'p5', section: 'Process flow', item: 'Subcontracts', node: 'subcontracts' },
  { id: 'p5-labour', page: 'p5', section: 'Process flow', item: 'Labour', node: 'site.attendance' },
  { id: 'p5-progress', page: 'p5', section: 'Process flow', item: 'Progress & change requests', node: 'billing.variations' },
  { id: 'p5-safety', page: 'p5', section: 'Process flow', item: 'Safety & quality', node: 'quality' },
  { id: 'p5-billing', page: 'p5', section: 'Process flow', item: 'Client billing', node: 'billing' },
  { id: 'p5-exec', page: 'p5', section: 'Process flow', item: 'Execution & monitoring', node: 'site' },
  { id: 'p5-closure', page: 'p5', section: 'Process flow', item: 'Project closure', node: 'projects.handover' },
  { id: 'p5-fa', page: 'p5', section: 'Process flow', item: 'Finance & accounts', node: 'accounts' },
  { id: 'p7-web', page: 'p7', section: 'Features', item: 'Windows and web', notTile: 'Web app and the Android phone app. No Windows desktop app' },
  { id: 'p7-portals', page: 'p7', section: 'Features', item: 'Supplier and subcontractor portals', node: 'purchases.portal' },
  { id: 'p7-reports', page: 'p7', section: 'Features', item: 'Easily customizable reports', notTile: 'Saved views, chosen columns and Excel on every list' },
  { id: 'p7-legacy', page: 'p7', section: 'Features', item: 'Integration with legacy systems', node: 'accounts.tally' },
  { id: 'p7-currency', page: 'p7', section: 'Features', item: 'Multi-currency', gap: 'Not built. Flag 7.' },
  { id: 'p7-lang', page: 'p7', section: 'Features', item: 'Multilingual', notTile: 'Hindi on the phone app. Web is English only' },
  { id: 'p7-attach', page: 'p7', section: 'Features', item: 'Self-manageable and attachment-friendly', notTile: 'Attachments on every record; Documents module' },
  { id: 'p7-workflow', page: 'p7', section: 'Features', item: 'Role-based workflow and escalations', node: 'admin.rules' },
  { id: 'p7-terms', page: 'p7', section: 'Features', item: 'Attribute-based terms and conditions', gap: 'Not built. Flag 7.' },
  { id: 'p7-drill', page: 'p7', section: 'Features', item: 'Drill-down', notTile: 'Every figure opens its list' },
  { id: 'p7-alerts', page: 'p7', section: 'Features', item: 'Instant messaging and alerts via mobile and email', notTile: 'Notifications bell, email and WhatsApp' },
  { id: 'p7-offline', page: 'p7', section: 'Features', item: 'Offline updates', notTile: 'Phone app outbox' },
  { id: 'p7-dashxl', page: 'p7', section: 'Features', item: 'Dashboards and reports to Excel/PDF', notTile: 'Excel on every list, PDF reports' },
  { id: 'p7-bio', page: 'p7', section: 'Features', item: 'Biometric attendance devices', node: 'people.biometric' },
  { id: 'p7-finrep', page: 'p7', section: 'Features', item: 'In-depth financial reports', node: 'accounts.pl' },
  { id: 'p9-estimate', page: 'p9', section: 'Reports', item: 'Project cost estimation', node: 'reports.estimate' },
  { id: 'p9-budget', page: 'p9', section: 'Reports', item: 'Budget comparison', node: 'reports.cost' },
  { id: 'p9-jobcost', page: 'p9', section: 'Reports', item: 'Job cost report', node: 'reports.cost' },
  { id: 'p9-status', page: 'p9', section: 'Reports', item: 'Project status report', node: 'reports.progress' },
  { id: 'p9-cumbudget', page: 'p9', section: 'Reports', item: 'Cumulative budget comparison', node: 'reports.cost' },
  { id: 'p9-notused', page: 'p9', section: 'Reports', item: 'Purchased not used materials', node: 'materials.value' },
  { id: 'p9-clientsub', page: 'p9', section: 'Reports', item: 'Client vs subcontractor bill', node: 'reports.cost' },
  { id: 'p9-pl', page: 'p9', section: 'Reports', item: 'Profit & loss account', node: 'reports.pl' },
  { id: 'p9-tb', page: 'p9', section: 'Reports', item: 'Sitewise trial balance matrix', node: 'reports.tb' },
  { id: 'p9-stockage', page: 'p9', section: 'Reports', item: 'Age wise analysis of stock', node: 'reports.stockAge' },
  { id: 'p9-avail', page: 'p9', section: 'Reports', item: 'Availability vs utilisation', node: 'reports.utilisation' },
  { id: 'p9-fuel', page: 'p9', section: 'Reports', item: 'Fuel efficiency chart', node: 'reports.fuel' },
  { id: 'p9-dash', page: 'p9', section: 'Reports', item: 'Dash board', notTile: 'Home and every Module screen' },
  { id: 'p10-hrdash', page: 'p10', section: 'Dashboard reports', item: 'HR dashboard', notTile: 'People Module screen figures. Full HR figures with item 99' },
  { id: 'p11-projdash', page: 'p11', section: 'Screens', item: 'Project dashboard with site photos', node: 'projects.all' },
];
