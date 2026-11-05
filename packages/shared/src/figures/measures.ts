import { APPROVAL_OLD_DAYS } from '../management';
import { BILLING_GAP_PCT } from '../project-progress';
import { BEHIND_TOLERANCE_PCT } from '../schedule';

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
  boqValue: { label: 'BOQ value', kind: 'money', better: 'either', define: 'The BOQ’s quantities at its rates, revised quantities where there are any.' },
  billed: { label: 'Billed', kind: 'money', better: 'up', list: '/bills', define: 'Approved RA bills: work value plus price variation, before GST.' },
  moneyReceived: { label: 'Money received', kind: 'money', better: 'up', list: '/receivables', define: 'Received in the bank from clients.' },
  cost: { label: 'Cost', kind: 'money', better: 'down', list: '/cost', define: 'Site expenses, material issued, machinery, labour and subcontractor bills, approved.' },
  workNotBilled: { label: 'Work done, not billed', kind: 'money', better: 'down', list: '/bills', define: 'Work done at BOQ rates less what is billed, never below zero.' },
  measuredNotBilled: { label: 'Measured, in no bill', kind: 'money', better: 'down', items: ['project', 'projects'], list: '/billing-readiness', define: 'Approved measurement sheets not yet in an RA bill: the next bill’s ready money.' },
  billsNotSent: { label: 'Approved bills not sent', kind: 'money', better: 'down', flag: { level: 'watch', clear: 'Every approved bill sent' }, list: '/bills', define: 'Approved RA bills not yet sent to the client.' },
  billsAwaitingCertificate: { label: 'Awaiting certificate', kind: 'money', better: 'down', list: '/bills', define: 'Bills sent to the client and not yet certified.' },
  certifiedNotPaid: { label: 'Certified, not paid', kind: 'money', better: 'down', list: '/receivables', define: 'Bills the client certified and has not yet settled.' },
  grossMargin: { label: 'Gross margin', negativeLabel: 'Gross loss', kind: 'money', better: 'up', limit: { below: 0, level: 'act' }, list: '/cost', define: 'Billed less cost, in the period.' },
  marginOnBilling: { label: 'Margin on billing', kind: 'pct', better: 'up', limit: { below: 0, level: 'act' }, define: 'Gross margin as a share of what is billed.' },
  budget: { label: 'Budget', kind: 'money', better: 'either', list: '/cost', define: 'The cost budget at completion.' },
  variationsWithClient: { label: 'Variations with the client', kind: 'count', better: 'down', items: ['variation', 'variations'], list: '/variations', define: 'Variations sent to the client, not yet decided.' },
  guaranteesExpiring: { label: 'Guarantees and licences expiring', kind: 'count', better: 'down', flag: { level: 'watch', clear: 'Nothing expiring in 30 days' }, items: ['entry', 'entries'], list: '/compliance', define: 'Bank guarantees, insurance and licences that expire within the next 30 days.' },
  guaranteesExpired: { label: 'Guarantees and licences expired', kind: 'count', better: 'down', flag: { level: 'act', clear: 'Nothing expired' }, items: ['entry', 'entries'], list: '/compliance', define: 'Bank guarantees, insurance and licences past their expiry date.' },
  // Receivables
  clientsOwe: { label: 'Clients owe', kind: 'money', better: 'down', items: ['open bill', 'open bills'], list: '/receivables', define: 'Bills sent to clients, with GST, less what they have settled.' },
  clientsOweOver90: { label: 'Clients owe over 90 days', asPart: 'over 90 days', kind: 'money', better: 'down', flag: { level: 'act', clear: 'Nothing over 90 days' }, list: '/receivables', define: 'Of what clients owe, bills sent more than 90 days ago.' },
  retentionWithClients: { label: 'Retention with clients', kind: 'money', better: 'down', list: '/receivables', define: 'Deducted by clients on their payments, not yet released.' },
  // Payables
  weOwe: { label: 'We owe', kind: 'money', better: 'down', items: ['open bill', 'open bills'], list: '/payables', define: 'Approved vendor and subcontractor bills, with GST, less what is paid and deducted.' },
  weOweOverdue: { label: 'Overdue to vendors', asPart: 'overdue', kind: 'money', better: 'down', flag: { level: 'act', clear: 'Nothing overdue' }, list: '/payables', define: 'Of what we owe, bills past their due date.' },
  weOweDueSoon: { label: 'Due to vendors in 7 days', asPart: 'due in 7 days', kind: 'money', better: 'down', list: '/payables', define: 'Of what we owe, bills that fall due in the next 7 days.' },
  paymentRequestsToPay: { label: 'Payment requests to pay', kind: 'count', better: 'down', items: ['request', 'requests'], list: '/payables?tab=requests', define: 'Approved payment requests not yet paid in full.' },
  msmeAtRisk: { label: 'MSME bills at risk', kind: 'money', better: 'down', flag: { level: 'act', clear: 'No MSME bill at risk' }, list: '/payables', define: 'Owed to micro and small enterprises, due within 7 days or overdue (45 days at most by law).' },
  // Schedule and site
  physicalProgress: { label: 'Physical progress', kind: 'pct', better: 'up', items: ['project', 'projects'], list: '/progress', define: 'Work done against the whole by value; across projects, weighted by contract value.' },
  financialProgress: { label: 'Financial progress', kind: 'pct', better: 'up', list: '/bills', define: 'Approved RA bills against the revised contract value.' },
  projectsBehindPlan: { label: 'Projects behind plan', kind: 'count', better: 'down', flag: { level: 'watch', clear: 'No project behind plan' }, items: ['project', 'projects'], list: '/projects', define: `Projects more than ${BEHIND_TOLERANCE_PCT} points behind the share planned by today.` },
  projectsBillingBehind: { label: 'Projects with billing behind', kind: 'count', better: 'down', flag: { level: 'watch', clear: 'Billing keeps up on every project' }, items: ['project', 'projects'], list: '/bills', define: `Projects whose billing is ${BILLING_GAP_PCT} or more points behind the work done.` },
  planPastCompletion: { label: 'Plan past completion', kind: 'days', better: 'down', flag: { level: 'act', clear: 'The plan finishes by the completion date' }, define: 'Days the schedule’s planned finish runs past the completion date, after the extensions of time granted.' },
  daysWithoutDpr: { label: 'Days without a daily report', kind: 'count', better: 'down', flag: { level: 'watch', clear: 'A daily report for each of the last 7 days' }, items: ['day', 'days'], list: '/dpr', define: 'Of the 7 days before today, the days no daily report was sent for the project.' },
  delayedActivities: { label: 'Delayed activities', kind: 'count', better: 'down', flag: { level: 'act', clear: 'No activity delayed' }, items: ['activity', 'activities'], define: 'Activities past their planned finish and not complete.' },
  activitiesDue: { label: 'Activities due by today', kind: 'count', better: 'either', items: ['activity due to finish by today', 'activities due to finish by today'], define: 'Activities planned to finish by today.' },
  dailyReports: { label: 'Daily reports', kind: 'count', better: 'up', items: ['daily report', 'daily reports'], list: '/dpr', define: 'Daily reports filed for the day.' },
  labour: { label: 'Labour', kind: 'count', better: 'either', list: '/attendance', define: 'Workers on the day’s head counts, plus those present on the roll call.' },
  openRisks: { label: 'Open delays and risks', kind: 'count', better: 'down', items: ['delay or risk', 'delays and risks'], list: '/risks', define: 'Delays and risks in the register, not closed.' },
  openDelays: { label: 'Open delays', kind: 'count', better: 'down', flag: { level: 'watch', clear: 'No open delays' }, items: ['delay holding up work', 'delays holding up work'], list: '/risks', define: 'Delays in the register, not closed.' },
  // Quality and safety
  openNcrs: { label: 'Open NCRs', kind: 'count', better: 'down', flag: { level: 'watch', clear: 'No NCR open' }, items: ['NCR', 'NCRs'], list: '/inspections?tab=ncrs', define: 'Non-conformance reports waiting for action or closing.' },
  ncrsOverdue: { label: 'NCRs past the due date', kind: 'count', better: 'down', asPart: 'past the due date', items: ['NCR past the due date', 'NCRs past the due date'], list: '/inspections?tab=ncrs', define: 'Open NCRs whose date to put right has passed.' },
  testsFailed: { label: 'Failed tests', kind: 'count', better: 'down', flag: { level: 'act', clear: 'No test failed' }, items: ['failed test', 'failed tests'], list: '/inspections?tab=tests', define: 'Material and concrete tests whose result failed the specification.' },
  testResultsOverdue: { label: 'Test results overdue', kind: 'count', better: 'down', flag: { level: 'watch', clear: 'No test result overdue' }, items: ['test', 'tests'], list: '/inspections?tab=tests', define: 'Tests with a reading due (a 7 or 28 day cube, a lab report) and not yet entered.' },
  safetyIncidents: { label: 'Safety incidents', kind: 'count', better: 'down', flag: { level: 'act', clear: 'No safety incident this month' }, items: ['incident', 'incidents'], list: '/safety', define: 'Injuries, damage and fatalities reported in the month. Near misses are counted on their own.' },
  nearMisses: { label: 'Near misses', kind: 'count', better: 'either', asPart: 'near misses', items: ['near miss', 'near misses'], list: '/safety', define: 'Near misses reported in the month: no one hurt, nothing damaged. A site that reports them is watching.' },
  // Drawings
  drawingsLate: { label: 'Drawings late', kind: 'count', better: 'down', flag: { level: 'act', clear: 'No drawing late' }, items: ['drawing', 'drawings'], list: '/drawing-schedule?state=LATE', define: 'Drawings on the schedule past the date they are needed by.' },
  drawingsAwaited: { label: 'Drawings awaited', kind: 'count', better: 'down', items: ['drawing awaited', 'drawings awaited'], list: '/drawing-schedule', define: 'Drawings on the schedule not yet received.' },
  reviewsLate: { label: 'Reviews late', asPart: 'past the reply date', kind: 'count', better: 'down', flag: { level: 'watch', clear: 'No reviewer past the reply date' }, items: ['submittal', 'submittals'], list: '/design-submissions?status=LATE', define: 'Submittals with the reviewer past the date the reply was due.' },
  underReview: { label: 'With the reviewer', kind: 'count', better: 'either', items: ['submittal with the reviewer', 'submittals with the reviewer'], list: '/design-submissions?status=UNDER_REVIEW', define: 'Submittals waiting for the reviewer’s code.' },
  submittalsBack: { label: 'Back with us', kind: 'count', better: 'down', items: ['submittal', 'submittals'], list: '/design-submissions?status=WITH_US', define: 'Submittals coded C or D, to revise and resubmit.' },
  commentsToAnswer: { label: 'Comments to answer', kind: 'count', better: 'down', flag: { level: 'watch', clear: 'No review comment to answer' }, items: ['submittal to revise', 'submittals to revise'], list: '/design-submissions?toAnswer=true', define: 'Reviewer comments not yet answered, before the next submission.' },
  daysToCode: { label: 'Days to a code', kind: 'days', better: 'down', define: 'Average days from sending a submittal to the reviewer’s code, over the last 90 days.' },
  copiesToRecall: { label: 'Copies to withdraw', kind: 'count', better: 'down', flag: { level: 'watch', clear: 'Every copy on site is current' }, items: ['copy', 'copies'], list: '/controlled-copies?state=TO_RECALL', define: 'Controlled copies of a superseded revision still on site.' },
  recallsLate: { label: 'Recalls over a week old', asPart: 'out longer than a week', kind: 'count', better: 'down', flag: { level: 'act', clear: 'None out longer than a week' }, list: '/controlled-copies?state=LATE', define: 'Superseded copies still on site a week after they were called back.' },
  copiesInForce: { label: 'Copies in force', kind: 'count', better: 'either', items: ['copy', 'copies'], list: '/controlled-copies?state=IN_FORCE', define: 'Controlled copies of the current revision on site.' },
  copyHolders: { label: 'Copy holders', kind: 'count', better: 'either', items: ['holder', 'holders'], define: 'Offices, gangs and people holding a copy in force.' },
  asBuiltDue: { label: 'As-built due', kind: 'count', better: 'down', items: ['drawing', 'drawings'], list: '/as-built', define: 'Drawings site built from that have no as-built revision yet.' },
  commentsAnswered: { label: 'Answered, to close', kind: 'count', better: 'either', items: ['comment', 'comments'], list: '/design-comments?state=ANSWERED', define: 'Review comments we have answered that the reviewer has not yet closed.' },
  componentsAfc: { label: 'Components AFC', kind: 'count', better: 'up', items: ['component', 'components'], list: '/drawings-by-component', define: 'Components whose every drawing is approved for construction.' },
  drawingsAfc: { label: 'Drawings AFC', kind: 'count', better: 'up', items: ['drawing', 'drawings'], list: '/drawings-by-component', define: 'Drawings whose current revision site may build from.' },
  componentsInReview: { label: 'Components in review', kind: 'count', better: 'either', items: ['component', 'components'], list: '/drawings-by-component', define: 'Components whose latest submittal waits for a reviewer’s code.' },
  componentsBack: { label: 'Components back with us', kind: 'count', better: 'down', items: ['component', 'components'], list: '/drawings-by-component', define: 'Components whose latest submittal came back coded C or D.' },
  rfisOpen: { label: 'Open RFIs', kind: 'count', better: 'down', items: ['RFI', 'RFIs'], list: '/documents?tab=rfis', define: 'Questions to the designer not yet answered.' },
  // Correspondence
  lettersMarkedToYou: { label: 'Letters marked to you', kind: 'count', better: 'down', flag: { level: 'watch', clear: 'No letter marked to you' }, items: ['letter', 'letters'], list: '/correspondence?mine=1', define: 'Received letters marked to you with an action, not yet done.' },
  lettersPastActionDate: { label: 'Your letters past the action date', asPart: 'past the action date', kind: 'count', better: 'down', flag: { level: 'act', clear: 'None past the action date' }, list: '/correspondence?mine=1', define: 'Letters marked to you whose action date has passed.' },
  lettersToSign: { label: 'Letters to sign', kind: 'count', better: 'down', flag: { level: 'watch', clear: 'No letter to sign' }, items: ['letter', 'letters'], list: '/correspondence/outward?toSign=1', define: 'Outward letters waiting for your signature; each is numbered once you approve.' },
  repliesDue: { label: 'Letters waiting for our reply', kind: 'count', better: 'down', flag: { level: 'watch', clear: 'No reply due' }, items: ['letter', 'letters'], list: '/correspondence?awaiting=1', define: 'Received letters that ask for our reply by a date.' },
  repliesOverdue: { label: 'Replies past the date asked', asPart: 'past the date asked', kind: 'count', better: 'down', flag: { level: 'act', clear: 'None past the date asked' }, list: '/correspondence?awaiting=1', define: 'Letters waiting for our reply past the date they asked for it.' },
  lettersNotMarked: { label: 'Received, not marked to anyone', kind: 'count', better: 'down', flag: { level: 'watch', clear: 'Every letter received is marked' }, items: ['letter', 'letters'], list: '/correspondence?unmarked=1', define: 'Received letters not yet marked to someone with an action.' },
  noticesWithoutProof: { label: 'Notices without proof of delivery', kind: 'count', better: 'down', flag: { level: 'act', clear: 'Every notice has its proof' }, items: ['notice', 'notices'], list: '/correspondence/outward?proof=1', define: 'Outward notices with no receipt or acknowledged copy kept.' },
  // Procurement
  ordered: { label: 'Ordered', kind: 'money', better: 'either', items: ['order', 'orders'], list: '/purchase-orders', define: 'Approved purchase orders dated in the period, before GST, freight included.' },
  vendorsOrderedFrom: { label: 'Vendors ordered from', kind: 'count', better: 'either', items: ['vendor', 'vendors'], list: '/vendors', define: 'Vendors with an approved order in the period.' },
  daysToOrder: { label: 'Days from indent to order', kind: 'days', better: 'down', define: 'Average, from the indent’s approval to its order.' },
  daysToReceive: { label: 'Days from order to receipt', kind: 'days', better: 'down', define: 'Average, from the order to its first goods received note.' },
  ordersToReceive: { label: 'Orders to receive', kind: 'money', better: 'either', items: ['order', 'orders'], list: '/purchase-orders', define: 'Approved orders with material still to come, at their value.' },
  lateDeliveries: { label: 'Late deliveries', kind: 'count', better: 'down', flag: { level: 'watch', clear: 'No delivery late' }, items: ['order', 'orders'], list: '/purchase-orders', define: 'Orders past their delivery date with material still to come.' },
  waitingForQuotations: { label: 'Waiting for quotations', kind: 'count', better: 'down', items: ['indent', 'indents'], list: '/requests-to-order', define: 'Approved indents still to buy with no quotation yet or an enquiry still open.' },
  choicesToApprove: { label: 'Supplier choices to approve', kind: 'count', better: 'down', flag: { level: 'watch', clear: 'No supplier choice waiting' }, items: ['indent', 'indents'], list: '/requests-to-order?stage=AWAITING_APPROVAL', define: 'Supplier choices purchase finalised that wait for approval before the order.' },
  materialToCheck: { label: 'Material to check', kind: 'count', better: 'down', flag: { level: 'watch', clear: 'Every receipt checked' }, items: ['receipt', 'receipts'], list: '/inspections?tab=grns', define: 'Goods received notes QA/QC has not accepted or rejected yet.' },
  receivedNotBilled: { label: 'Received, not billed', kind: 'count', better: 'down', items: ['receipt', 'receipts'], list: '/vendor-bills?tab=to-bill', define: 'Goods received against an order that no vendor bill covers yet.' },
  materialRequestsToApprove: { label: 'Material requests to approve', kind: 'count', better: 'down', items: ['request', 'requests'], list: '/material-requests', define: 'Raised by the sites, not yet decided.' },
  deliveredOnTime: { label: 'Delivered on time', kind: 'pct', better: 'up', define: 'Orders whose first goods received note came by the delivery date.' },
  // Labour
  manDays: { label: 'Man-days', kind: 'count', better: 'either', list: '/attendance', define: 'The daily labour musters in the period.' },
  averageOnSite: { label: 'Average on site a day', kind: 'qty', better: 'either', define: 'Man-days over the days with a muster, all projects.' },
  labourCost: { label: 'Labour cost', kind: 'money', better: 'down', list: '/cost', define: 'Man-days at the trade’s daily rate, as Project cost counts it.' },
  attendanceFlags: { label: 'Man-day bills above attendance', kind: 'count', better: 'down', flag: { level: 'act', clear: 'No man-day bill above attendance' }, list: '/attendance-check', define: 'Subcontractor bill lines with more man-days than the head count, roll call and punches.' },
  attendanceFlagValue: { label: 'Value above attendance', asPart: 'above the records', kind: 'money', better: 'down', list: '/attendance-check', define: 'The man-days above the records, at the bill’s rates.' },
  tradesWithoutRate: { label: 'Trades without a rate', kind: 'count', better: 'down', flag: { level: 'watch', clear: 'Every trade has a daily rate' }, items: ['trade', 'trades'], list: '/cost', define: 'Trades on a muster with no daily rate; set them on Project cost.' },
  // Stock
  stockValue: { label: 'Stock value', kind: 'money', better: 'either', list: '/stock', define: 'Stock on hand at item master rates.' },
  stockAtStores: { label: 'Stock at central stores', asPart: 'at central stores', kind: 'money', better: 'either', list: '/stores', define: 'Of the stock value, what the company stores and yards hold.' },
  stockOnTheRoad: { label: 'Stock on the road', kind: 'money', better: 'down', items: ['transfer', 'transfers'], list: '/stores', define: 'Transfers sent and not yet received, at item master rates.' },
  stockOver90: { label: 'Stock over 90 days old', asPart: 'over 90 days old', kind: 'money', better: 'down', flag: { level: 'watch', clear: 'No stock over 90 days old' }, list: '/stock', define: 'Stock held over 90 days, the oldest taken as used first.' },
  itemsBelowMinimum: { label: 'Items below minimum', kind: 'count', better: 'down', flag: { level: 'watch', clear: 'No item below its minimum' }, items: ['item', 'items'], list: '/stock?low=1', define: 'Items whose stock is under the minimum set for them.' },
  itemsWithoutRate: { label: 'Items without a rate', kind: 'count', better: 'down', flag: { level: 'watch', clear: 'Every item in stock has a rate' }, items: ['item', 'items'], list: '/stock', define: 'Items in stock with no rate in the item master, so not valued.' },
  // Plant and machinery
  openJobCards: { label: 'Open job cards', kind: 'count', better: 'down', items: ['job card', 'job cards'], list: '/machinery?tab=maintenance', define: 'Services and breakdowns not closed.' },
  fuelIssues: { label: 'Fuel issues', kind: 'count', better: 'either', list: '/machinery?tab=fuel', define: 'Diesel issued to machines.' },
  // RMC plant
  cubicMetresSent: { label: 'Cubic metres sent', kind: 'qty', better: 'either', items: ['truck', 'trucks'], list: '/rmc?tab=day', define: 'Concrete sent from the plant, not rejected.' },
  trucksInTransit: { label: 'Trucks in transit', asPart: 'in transit', kind: 'count', better: 'either', list: '/rmc?tab=day', define: 'Trucks sent and not yet delivered.' },
  concreteOrdersOpen: { label: 'Open concrete orders', kind: 'count', better: 'either', items: ['order', 'orders'], list: '/rmc?tab=orders', define: 'Confirmed orders not yet poured in full.' },
  poursToday: { label: 'Pours due today', asPart: 'to pour today', kind: 'count', better: 'either', list: '/rmc?tab=orders', define: 'Confirmed orders whose pour date is today.' },
  mixDesignsToApprove: { label: 'Mix designs to approve', kind: 'count', better: 'down', flag: { level: 'watch', clear: 'No mix design waiting' }, items: ['mix design', 'mix designs'], list: '/rmc?tab=designs', define: 'Mix designs in draft, waiting for quality to approve.' },
  challansNotBilled: { label: 'Challans not billed', kind: 'count', better: 'down', flag: { level: 'watch', clear: 'Every delivery is billed' }, items: ['challan', 'challans'], list: '/rmc?tab=bills', define: 'Delivered loads for a customer not yet on a bill.' },
  cubicMetresNotBilled: { label: 'Cubic metres not billed', asPart: 'm³ delivered', kind: 'qty', better: 'down', list: '/rmc?tab=bills', define: 'Concrete delivered to customers and not yet on a bill.' },
  rmcMaterialsShort: { label: 'Materials short', kind: 'count', better: 'down', flag: { level: 'act', clear: 'The store holds what is left to pour' }, items: ['material', 'materials'], list: '/rmc?tab=day', define: 'Materials the plant store holds less of than the day\'s orders still need.' },
  rmcCustomersOwe: { label: 'RMC customers owe', kind: 'money', better: 'down', list: '/rmc?tab=bills', define: 'On bills issued, less money received.' },
  // Books
  profitThisYear: { label: 'Profit this year', negativeLabel: 'Loss this year', kind: 'money', better: 'up', limit: { below: 0, level: 'act' }, list: '/statements?tab=pl', define: 'From 1 April, before tax.' },
  vouchersToApprove: { label: 'Vouchers to approve', kind: 'count', better: 'down', flag: { level: 'watch', clear: 'No voucher to approve' }, items: ['voucher', 'vouchers'], list: '/books?tab=vouchers', define: 'Vouchers made by accounts, waiting for someone else to approve.' },
  recordsNotPosted: { label: 'Records not posted', kind: 'count', better: 'down', flag: { level: 'watch', clear: 'Every record is in the books' }, items: ['record', 'records'], list: '/books?tab=day', define: 'Records that do not balance, so are held out of the books; the day book says why.' },
  bankLinesToMatch: { label: 'Bank lines to match', kind: 'count', better: 'down', flag: { level: 'watch', clear: 'Every imported bank line is matched' }, items: ['bank line to match', 'bank lines to match'], list: '/statements?tab=bank', define: 'Lines of an imported bank statement not yet matched in the books.' },
  // Leakage checks
  leakageAtRisk: { label: 'Leakage at risk', kind: 'money', better: 'down', flag: { level: 'act', clear: 'No leakage flagged' }, items: ['flag', 'flags'], list: '/leakage', define: 'Rupees at risk on what the leakage checks flagged in the month.' },
  leakageFlags: { label: 'Leakage flags', kind: 'count', better: 'down', flag: { level: 'act', clear: 'No leakage flagged' }, list: '/leakage', define: 'What the leakage checks flagged in the month.' },
  // Staff
  staffPresent: { label: 'Staff present', kind: 'count', better: 'either', list: '/staff?tab=register', define: 'Staff marked present or on half day.' },
  // Subcontracts
  workOrdersPlaced: { label: 'Work orders placed', kind: 'money', better: 'either', items: ['work order', 'work orders'], list: '/work-orders', define: 'Approved work orders with subcontractors, by value before GST.' },
  retentionFromSubcontractors: { label: 'Retention kept from subcontractors', kind: 'money', better: 'either', list: '/subcontract-bills', define: 'Retention kept back on approved subcontractor bills, to be released at the end of the defects period.' },
  // Tenders
  tendersToSubmit: { label: 'Tenders to submit', kind: 'count', better: 'either', items: ['tender', 'tenders'], list: '/tenders', define: 'Tenders being priced, not yet submitted.' },
  bidsDueThisWeek: { label: 'Bids due in 7 days', kind: 'count', better: 'down', asPart: 'due in 7 days', flag: { level: 'watch', clear: 'No bid due in 7 days' }, items: ['bid', 'bids'], list: '/tenders', define: 'Tenders being priced whose last date to submit is within 7 days.' },
  bidsAwaitingResult: { label: 'Bids awaiting result', kind: 'count', better: 'either', items: ['bid', 'bids'], list: '/tenders', define: 'Tenders submitted and not yet won, lost or cancelled.' },
  // Admin
  peopleWithLogin: { label: 'People with a login', kind: 'count', better: 'either', items: ['person', 'people'], list: '/users', define: 'Users of this company whose login is active.' },
  accessRequestsOpen: { label: 'Access requests to answer', kind: 'count', better: 'down', flag: { level: 'watch', clear: 'No access request waiting' }, items: ['request', 'requests'], list: '/home-tiles', define: 'Requests from people to open a page their role does not show, waiting for an admin.' },
  connectionsFailing: { label: 'Connections failing', kind: 'count', better: 'down', flag: { level: 'act', clear: 'No connection failing' }, items: ['connection', 'connections'], list: '/connections', define: 'Connected devices and services whose last message failed.' },
  staffOnRoll: { label: 'Staff on the roll', kind: 'count', better: 'either', items: ['person on the roll', 'people on the roll'], list: '/staff?tab=staff', define: 'Staff in employment on the day.' },
  staffOnLeave: { label: 'Staff on leave', kind: 'count', better: 'either', list: '/staff?tab=leave', define: 'Staff on approved leave.' },
  staffAbsent: { label: 'Staff absent', asPart: 'absent besides', kind: 'count', better: 'down', list: '/staff?tab=register', define: 'Staff marked absent.' },
  staffJoined: { label: 'Staff joined', kind: 'count', better: 'either', list: '/staff?tab=staff', define: 'Staff who joined in the period.' },
  staffLeft: { label: 'Staff left', kind: 'count', better: 'either', list: '/staff?tab=staff', define: 'Staff whose last day fell in the period.' },
  attrition: { label: 'Attrition', kind: 'pct', better: 'down', define: 'Staff who left as a share of the average on the roll at the start and end of the period.' },
  staffAttendance: { label: 'Staff attendance', kind: 'pct', better: 'up', list: '/staff?tab=register', define: 'Days present (a half day counts half) and on duty, against the working days the staff were on the roll.' },
  staffDaysNotMarked: { label: 'Days not marked', kind: 'count', better: 'down', flag: { level: 'watch', clear: 'Every working day marked' }, list: '/staff?tab=register', define: 'Working days to date with neither attendance nor approved leave; payroll does not deduct them.' },
  leaveTaken: { label: 'Leave taken', kind: 'days', better: 'either', list: '/staff?tab=leave', define: 'Approved leave in the period, in working days.' },
  leaveWaiting: { label: 'Leave waiting', kind: 'days', better: 'down', list: '/staff?tab=leave', define: 'Leave applied for in the period and not yet decided, in working days.' },
  pfToDeposit: { label: 'PF to deposit', kind: 'money', better: 'either', list: '/payroll?tab=runs', define: 'The employees’ and the company’s provident fund and pension on the month’s approved and paid salary runs.' },
  esiToDeposit: { label: 'ESI to deposit', kind: 'money', better: 'either', list: '/payroll?tab=runs', define: 'The employees’ and the company’s ESI on the month’s approved and paid salary runs.' },
  settlementsPaid: { label: 'Settlements paid', kind: 'money', better: 'either', list: '/payroll?tab=settlements', define: 'Net paid on full and final settlements of people who left in the period.' },
  settlementsToPay: { label: 'Settlements to pay', kind: 'money', better: 'down', flag: { level: 'watch', clear: 'No settlement waiting to be paid' }, list: '/payroll?tab=settlements', define: 'Net on settlements worked out or approved and not yet paid.' },
  grossPay: { label: 'Gross pay', kind: 'money', better: 'either', list: '/payroll?tab=runs', define: 'Earnings on the approved and paid salary runs, before deductions.' },
  staffCost: { label: 'Staff cost', kind: 'money', better: 'down', list: '/payroll?tab=runs', define: 'Gross pay plus the company’s PF, pension and ESI on the approved and paid salary runs.' },
  leaveToDecide: { label: 'Leave to decide', kind: 'count', better: 'down', flag: { level: 'watch', clear: 'No leave to decide' }, items: ['request', 'requests'], list: '/staff?tab=leave', define: 'Leave requests waiting for your decision.' },
  overtimeToDecide: { label: 'Overtime to decide', kind: 'count', better: 'down', flag: { level: 'watch', clear: 'No overtime to decide' }, items: ['claim', 'claims'], list: '/staff?tab=overtime', define: 'Overtime claims waiting for your decision.' },
  netPayLastRun: { label: 'Net pay, last run', kind: 'money', better: 'either', list: '/payroll?tab=runs', define: 'Net pay of the latest salary run paid.' },
  salaryRunsWaiting: { label: 'Salary runs waiting', kind: 'count', better: 'down', flag: { level: 'watch', clear: 'No salary run waiting on you' }, items: ['run', 'runs'], list: '/payroll?tab=runs', define: 'Salary runs at your step: in draft for HR, sent for approval for management, approved and not paid for accounts.' },
  salaryMonthsNotRun: { label: 'Salary months not run', kind: 'count', better: 'down', flag: { level: 'act', clear: 'Every month run' }, items: ['month', 'months'], list: '/payroll?tab=runs', define: 'Of the last three months ended, those with no salary run prepared, counted from the company’s first run.' },
  leaversNotSettled: { label: 'Leavers not settled', kind: 'count', better: 'down', flag: { level: 'watch', clear: 'Every leaver settled' }, items: ['person', 'people'], list: '/payroll?tab=settlements', define: 'People who have left and whose full and final is not paid: not prepared, waiting for approval, or approved and not paid.' },
  // Approvals
  approvalsWaiting: { label: 'Waiting for approval', kind: 'count', better: 'down', items: ['entry', 'entries'], list: '/approvals', define: 'Entries sent for approval and not yet decided, whoever decides them.' },
  approvalsOld: { label: `Waiting over ${OLD} days`, asPart: `over ${OLD} days`, kind: 'count', better: 'down', flag: { level: 'watch', clear: `Nothing waiting over ${OLD} days` }, list: '/approvals', define: `Entries waiting for approval for more than ${OLD} days.` },
  approvalsOver15: { label: 'Waiting over 15 days', kind: 'count', better: 'down', flag: { level: 'act', clear: 'Nothing waiting over 15 days' }, list: '/approvals', define: 'Entries waiting for approval for more than 15 days.' },
  oldestWait: { label: 'Oldest wait', kind: 'days', better: 'down', list: '/approvals', define: 'Days since the oldest entry still waiting was sent for approval.' },
  // One record (ARCHITECTURE "Records lead with the decision"): the figures a decision on a bill, order or report rests on
  netPayable: { label: 'Net payable', kind: 'money', better: 'either', define: 'The bill’s amount after deductions and recoveries, with GST: what is paid or received on it.' },
  stillToReceive: { label: 'Still to receive', kind: 'money', better: 'down', define: 'Of a client bill’s net payable, what the client has not yet paid.' },
  stillToPay: { label: 'Still to pay', kind: 'money', better: 'down', define: 'Of a vendor or subcontractor bill’s net payable, what is not yet paid.' },
  orderValue: { label: 'Order value', kind: 'money', better: 'either', define: 'The order’s total with GST and freight.' },
  workOrderValue: { label: 'Order value before GST', kind: 'money', better: 'either', define: 'A work order’s scope at its agreed rates, before GST.' },
  workOrderBilled: { label: 'Billed so far', kind: 'pct', better: 'either', define: 'Of a work order’s value, what the subcontractor’s bills not rejected have billed.' },
  receivedShare: { label: 'Received', kind: 'pct', better: 'up', define: 'Of the order’s quantity, what has come in on goods received notes.' },
  billedAboveReceived: { label: 'Billed above received', kind: 'count', better: 'down', flag: { level: 'act', clear: 'Billed within what was received' }, items: ['line', 'lines'], define: 'Order lines billed by the vendor for more than has been received.' },
  checksRaised: { label: 'Checks to look at', kind: 'count', better: 'down', flag: { level: 'watch', clear: 'Every check passes' }, items: ['check', 'checks'], define: 'What the record’s checks found worth a second look before deciding.' },
  amountClaimed: { label: 'Amount claimed', kind: 'money', better: 'either', define: 'What the entry asks to be paid or booked.' },
  measuredValue: { label: 'Measured value', kind: 'money', better: 'up', define: 'The sheet’s quantities at BOQ rates.' },
  workLines: { label: 'Work lines', kind: 'count', better: 'either', items: ['work line', 'work lines'], define: 'Activities the report records progress on.' },
} as const satisfies Record<string, MeasureDef>;

/** A registered figure. A closed union: a figure no one registered does not compile. */
export type FigureId = keyof typeof MEASURES;
export type KindOf<Id extends FigureId> = (typeof MEASURES)[Id]['kind'];

/** The names alone, for a column head that must agree with the strip; copy-check holds them to docs/WRITING.md. */
export const FIGURE_LABELS = Object.fromEntries(Object.entries(MEASURES).map(([id, m]) => [id, m.label])) as { readonly [Id in FigureId]: string };

/** A measure's definition, widened so its optional parts read the same for every id. */
export const measureOf = (id: FigureId): MeasureDef => MEASURES[id];
