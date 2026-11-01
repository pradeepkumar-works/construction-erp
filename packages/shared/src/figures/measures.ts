import { APPROVAL_OLD_DAYS } from '../management';

/** What a figure counts in. It fixes the value's type, how it reads and how a change is said ("up ₹1.20 Cr", "4 points"). */
export type FigureKind = 'money' | 'count' | 'pct' | 'qty' | 'days';

/** A domain verdict: watch (worth a look, the pending tone) or act (needs someone now, the danger tone). */
export type Attention = 'watch' | 'act';

interface MeasureBase {
  /** The figure's one name, on every screen, in print and in Excel. Sentence case (copy-check reads FIGURE_LABELS). */
  readonly label: string;
  /** The name below zero, said with the amount above it: "Loss to date ₹26,773", never "Margin to date −₹26,773". */
  readonly negativeLabel?: string;
  readonly kind: FigureKind;
  /** Which way is good news. It decides whether a change is bad news, never the figure's own colour. */
  readonly better: 'up' | 'down' | 'either';
  /** What it counts, for the help on its label; a definition is never the note. */
  readonly define: string;
  /** The list it opens; the strip adds its scope's filters. */
  readonly list?: string;
  /** How it reads after its amount inside another figure's note: "₹2.10 Cr over 90 days". Else the label in a sentence. */
  readonly asPart?: string;
  /** What one thing behind it is called: "4 open bills", "of 14 projects". */
  readonly items?: readonly [one: string, many: string];
}

/** A figure that exists to flag something: above zero it has `level`; at zero it folds into the strip's `clear` line. */
interface Flag {
  readonly level: Attention;
  readonly clear: string;
}

/** A figure that is fine inside a range and not outside it: a loss below 0. */
interface Limit {
  readonly below?: number;
  readonly above?: number;
  readonly level: Attention;
}

/** A plain level, a flag, or a limit; never two of them. */
export type MeasureDef = MeasureBase & ({ readonly flag?: undefined; readonly limit?: undefined } | { readonly flag: Flag; readonly limit?: undefined } | { readonly flag?: undefined; readonly limit: Limit });

const OLD = APPROVAL_OLD_DAYS;

/**
 * Every headline figure, keyed by a stable id (ARCHITECTURE "Headline figures"). A new figure is one line here, and that
 * line is the naming decision: the same company figure has this one name on every screen. Grouped by the module that
 * owns the number.
 */
export const MEASURES = {
  // Portfolio
  contractValue: { label: 'Contract value', kind: 'money', better: 'up', items: ['project', 'projects'], list: '/projects', define: 'Contract value plus approved variations, of every contract project.' },
  orderBook: { label: 'Order book', kind: 'money', better: 'up', list: '/projects', define: 'Contract value still to bill.' },
  projects: { label: 'Projects', kind: 'count', better: 'either', items: ['project', 'projects'], list: '/projects', define: 'The projects you see.' },
  activeProjects: { label: 'Active projects', kind: 'count', better: 'either', items: ['active project', 'active projects'], list: '/projects', define: 'Projects under way.' },
  marginToDate: { label: 'Margin to date', negativeLabel: 'Loss to date', kind: 'money', better: 'up', limit: { below: 0, level: 'act' }, list: '/cost', define: 'Work done less cost to date.' },
  bankAndCash: { label: 'Bank and cash', kind: 'money', better: 'up', list: '/cash-forecast', define: 'In the books today, before reconciliation.' },
  cashLowest: { label: 'Lowest cash in 13 weeks', asPart: 'lowest in 13 weeks', kind: 'money', better: 'up', limit: { below: 0, level: 'act' }, list: '/cash-forecast', define: 'The lowest closing balance the 13-week cash forecast expects.' },
  // Work, billing and collection (a flow's period is its `when`: "Work done in Oct")
  workDone: { label: 'Work done', kind: 'money', better: 'up', list: '/progress', define: 'Approved progress at BOQ rates; a lump-sum or EPC contract counts by its stages.' },
  billed: { label: 'Billed', kind: 'money', better: 'up', list: '/bills', define: 'Approved RA bills: work value plus price variation, before GST.' },
  moneyReceived: { label: 'Money received', kind: 'money', better: 'up', list: '/receivables', define: 'Received in the bank from clients.' },
  cost: { label: 'Cost', kind: 'money', better: 'down', list: '/cost', define: 'Site expenses, material issued, machinery, labour and subcontractor bills, approved.' },
  workNotBilled: { label: 'Work done, not billed', kind: 'money', better: 'down', list: '/bills', define: 'Work done at BOQ rates less what is billed, never below zero.' },
  measuredNotBilled: { label: 'Measured, in no bill', kind: 'money', better: 'down', list: '/measurements', define: 'Approved measurement sheets not yet in an RA bill: the next bill’s ready money.' },
  billsNotSent: { label: 'Approved bills not sent', kind: 'money', better: 'down', flag: { level: 'watch', clear: 'Every approved bill sent' }, list: '/bills', define: 'Approved RA bills not yet sent to the client.' },
  billsAwaitingCertificate: { label: 'Awaiting certificate', kind: 'money', better: 'down', list: '/bills', define: 'Bills sent to the client and not yet certified.' },
  certifiedNotPaid: { label: 'Certified, not paid', kind: 'money', better: 'down', list: '/receivables', define: 'Bills the client certified and has not yet settled.' },
  grossMargin: { label: 'Gross margin', negativeLabel: 'Gross loss', kind: 'money', better: 'up', limit: { below: 0, level: 'act' }, list: '/cost', define: 'Billed less cost, in the period.' },
  marginOnBilling: { label: 'Margin on billing', kind: 'pct', better: 'up', limit: { below: 0, level: 'act' }, define: 'Gross margin as a share of what is billed.' },
  // Receivables
  clientsOwe: { label: 'Clients owe', kind: 'money', better: 'down', items: ['open bill', 'open bills'], list: '/receivables', define: 'Bills sent to clients, with GST, less what they have settled.' },
  clientsOweOver90: { label: 'Clients owe over 90 days', asPart: 'over 90 days', kind: 'money', better: 'down', flag: { level: 'act', clear: 'Nothing over 90 days' }, list: '/receivables', define: 'Of what clients owe, bills sent more than 90 days ago.' },
  retentionWithClients: { label: 'Retention with clients', kind: 'money', better: 'down', list: '/receivables', define: 'Deducted by clients on their payments, not yet released.' },
  // Payables
  weOwe: { label: 'We owe', kind: 'money', better: 'down', items: ['open bill', 'open bills'], list: '/payables', define: 'Approved vendor and subcontractor bills, with GST, less what is paid and deducted.' },
  weOweOverdue: { label: 'Overdue to vendors', asPart: 'overdue', kind: 'money', better: 'down', flag: { level: 'act', clear: 'Nothing overdue' }, list: '/payables', define: 'Of what we owe, bills past their due date.' },
  weOweDueSoon: { label: 'Due to vendors in 7 days', asPart: 'due in 7 days', kind: 'money', better: 'down', list: '/payables', define: 'Of what we owe, bills that fall due in the next 7 days.' },
  msmeAtRisk: { label: 'MSME bills at risk', kind: 'money', better: 'down', flag: { level: 'act', clear: 'No MSME bill at risk' }, list: '/payables', define: 'Owed to micro and small enterprises, due within 7 days or overdue (45 days at most by law).' },
  // Schedule and site
  physicalProgress: { label: 'Physical progress', kind: 'pct', better: 'up', list: '/progress', define: 'Work done against the whole by value, in the latest month with approved work.' },
  delayedActivities: { label: 'Delayed activities', kind: 'count', better: 'down', flag: { level: 'act', clear: 'No activity delayed' }, items: ['activity', 'activities'], define: 'Activities past their planned finish and not complete.' },
  activitiesDue: { label: 'Activities due by today', kind: 'count', better: 'either', items: ['activity due to finish by today', 'activities due to finish by today'], define: 'Activities planned to finish by today.' },
  dailyReports: { label: 'Daily reports', kind: 'count', better: 'up', items: ['daily report', 'daily reports'], list: '/dpr', define: 'Daily reports filed for the day.' },
  // Procurement
  ordered: { label: 'Ordered', kind: 'money', better: 'either', items: ['order', 'orders'], list: '/purchase-orders', define: 'Approved purchase orders dated in the period, before GST, freight included.' },
  vendorsOrderedFrom: { label: 'Vendors ordered from', kind: 'count', better: 'either', items: ['vendor', 'vendors'], list: '/vendors', define: 'Vendors with an approved order in the period.' },
  daysToOrder: { label: 'Days from indent to order', kind: 'days', better: 'down', define: 'Average, from the indent’s approval to its order.' },
  daysToReceive: { label: 'Days from order to receipt', kind: 'days', better: 'down', define: 'Average, from the order to its first goods received note.' },
  deliveredOnTime: { label: 'Delivered on time', kind: 'pct', better: 'up', define: 'Orders whose first goods received note came by the delivery date.' },
  // Labour
  manDays: { label: 'Man-days', kind: 'count', better: 'either', list: '/attendance', define: 'The daily labour musters in the period.' },
  averageOnSite: { label: 'Average on site a day', kind: 'qty', better: 'either', define: 'Man-days over the days with a muster, all projects.' },
  labourCost: { label: 'Labour cost', kind: 'money', better: 'down', list: '/cost', define: 'Man-days at the trade’s daily rate, as Project cost counts it.' },
  tradesWithoutRate: { label: 'Trades without a rate', kind: 'count', better: 'down', flag: { level: 'watch', clear: 'Every trade has a daily rate' }, items: ['trade', 'trades'], list: '/cost', define: 'Trades on a muster with no daily rate; set them on Project cost.' },
  // Stock
  stockValue: { label: 'Stock value', kind: 'money', better: 'either', list: '/stock', define: 'Stock on hand at item master rates.' },
  stockOver90: { label: 'Stock over 90 days old', asPart: 'over 90 days old', kind: 'money', better: 'down', flag: { level: 'watch', clear: 'No stock over 90 days old' }, list: '/stock', define: 'Stock held over 90 days, the oldest taken as used first.' },
  itemsBelowMinimum: { label: 'Items below minimum', kind: 'count', better: 'down', flag: { level: 'watch', clear: 'No item below its minimum' }, items: ['item', 'items'], list: '/stock', define: 'Items whose stock is under the minimum set for them.' },
  itemsWithoutRate: { label: 'Items without a rate', kind: 'count', better: 'down', flag: { level: 'watch', clear: 'Every item in stock has a rate' }, items: ['item', 'items'], list: '/stock', define: 'Items in stock with no rate in the item master, so not valued.' },
  // Approvals
  approvalsWaiting: { label: 'Waiting for approval', kind: 'count', better: 'down', items: ['entry', 'entries'], list: '/approvals', define: 'Entries sent for approval and not yet decided, whoever decides them.' },
  approvalsOld: { label: `Waiting over ${OLD} days`, asPart: `over ${OLD} days`, kind: 'count', better: 'down', flag: { level: 'watch', clear: `Nothing waiting over ${OLD} days` }, list: '/approvals', define: `Entries waiting for approval for more than ${OLD} days.` },
  approvalsOver15: { label: 'Waiting over 15 days', kind: 'count', better: 'down', flag: { level: 'act', clear: 'Nothing waiting over 15 days' }, list: '/approvals', define: 'Entries waiting for approval for more than 15 days.' },
  oldestWait: { label: 'Oldest wait', kind: 'days', better: 'down', list: '/approvals', define: 'Days since the oldest entry still waiting was sent for approval.' },
} as const satisfies Record<string, MeasureDef>;

/** A registered figure. A closed union: a figure no one registered does not compile. */
export type FigureId = keyof typeof MEASURES;
export type KindOf<Id extends FigureId> = (typeof MEASURES)[Id]['kind'];

/** The names alone, for a column head that must agree with the strip; copy-check holds them to docs/WRITING.md. */
export const FIGURE_LABELS = Object.fromEntries(Object.entries(MEASURES).map(([id, m]) => [id, m.label])) as { readonly [Id in FigureId]: string };

/** A measure's definition, widened so its optional parts read the same for every id. */
export const measureOf = (id: FigureId): MeasureDef => MEASURES[id];
