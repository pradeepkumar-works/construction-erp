/** Release notes for Help > What's new, newest first. Add an entry when a change people will notice ships. */
export interface WhatsNew {
  /** Stable id; the newest one unseen puts a dot on the Help button. */
  id: string;
  date: string;
  title: string;
  points: string[];
}

export const WHATS_NEW: WhatsNew[] = [
  {
    id: '2027-09-official-reports',
    date: '2027-09-13',
    title: 'Daily, weekly and monthly reports for the client',
    points: [
      'Reports, Progress reports makes a project’s daily, weekly and monthly progress report (MPR) in your company’s design: the contract box, progress by component, the work done with its location, observations, crew and machines, hindrances, next period’s plan and photographs. The MPR adds the programme, milestones, bills, drawings, meetings, quality and safety.',
      'Download it as PDF, Word or Excel. Issue to client keeps the copy with its number and revision, so the one you sent can be downloaded again.',
    ],
  },
  {
    id: '2027-09-biometric-commands',
    date: '2027-09-06',
    title: 'People put on the biometric devices from Nirmaan',
    points: [
      'On Biometric devices, People on devices, a person’s menu puts their user number and name on every device that sends by itself (ZKTeco, eSSL), ready to enrol a finger or face, and takes someone who has left off them.',
      'A device’s clock is set from Devices, and by itself once a day when the device calls. Devices lists each command and whether the device did it.',
    ],
  },
  {
    id: '2027-08-batching-plant',
    date: '2027-08-30',
    title: 'Batches from the batching plant',
    points: [
      'RMC plant has a From the batcher tab. The Nirmaan Connector on the plant’s control room computer reads the controller’s batch reports (Admin, Connections), and each batch waits there with the order it looks to be for.',
      'Dispatch makes the challan from the batch with its cubic metres, truck and the weights the controller printed, so the materials leave the store as batched. Match the report’s columns once; a trial batch is set aside with why.',
    ],
  },
  {
    id: '2027-08-weighbridge',
    date: '2027-08-23',
    title: 'Weighbridge',
    points: [
      'Stock has a Weighbridge tab. Each truck gets a ticket from its first weight on the way in and its second on the way out, with the order and challan it brings, and the GRN is drafted at the net weight.',
      'A load lighter than its challan is marked short, and a supplier with two short loads in a month comes up on the watch list. The Nirmaan Connector can read the weighbridge’s indicator (Admin, Connections), or the weights can be typed.',
    ],
  },
  {
    id: '2027-08-fuel-sensors',
    date: '2027-08-16',
    title: 'Fuel sensors and dispensers',
    points: [
      'Where a machine’s tracker reads its fuel tank, the Fuel tab shows each machine’s tank for the day: what was filled against the day’s slips, what was drained with the engine off, and the litres an hour it burnt against its norm.',
      'A site’s fuel dispenser can post each fill to Nirmaan (Admin, Connections). A fill into a machine whose tag is matched becomes its fuel slip by itself; the watch list flags fills with no slip, slips that never reached the tank, and drains.',
    ],
  },
  {
    id: '2027-08-engine-hours',
    date: '2027-08-09',
    title: 'Engine hours from trackers and makers’ feeds',
    points: [
      'Machinery has an Engine hours tab: each machine’s day from its GPS tracker or its maker’s feed (AEMP, read every hour), with the hour meter, idle, fuel used and how far it went from its site, beside the day’s log.',
      'A new machinery log fills its hours and meter from the tracker for the operator to check. A log or a hire bill with more hours than the engine ran is flagged, and service falls due on the machine’s own hour meter.',
    ],
  },
  {
    id: '2027-08-connections',
    date: '2027-08-02',
    title: 'Connections to outside systems and devices',
    points: [
      'Administration has a new Connections page. A service in the cloud, such as a GPS tracker’s, posts to a web address of its own; a device on a site’s network is read by the Nirmaan Connector on a computer there, paired with a code and calling out only.',
      'Every message is kept in the log with what came of it, and each device heard from is listed to match to its machine. Machine hours, fuel, weighbridges and batching plants build on it next.',
    ],
  },
  {
    id: '2027-07-mis-commentary',
    date: '2027-07-26',
    title: 'The Monthly MIS opens with what it says',
    points: [
      'The Monthly MIS now starts with a paragraph written from its own figures: the month against the one before, cost against billing, what clients owe and what is not billed, the year’s margin and the projects that need action. It prints and goes to Excel with the report.',
    ],
  },
  {
    id: '2027-07-todays-talk',
    date: '2027-07-19',
    title: "Today's toolbox talk, in Hindi",
    points: [
      'Toolbox talks now offer Today’s talk: five minutes in Hindi and English written from today’s permits, the project’s recent incidents and the work going on, ready to read out and record. On the phone it sits at the top of the talk form.',
    ],
  },
  {
    id: '2027-07-past-openings',
    date: '2027-07-12',
    title: 'Where L1 landed on past openings',
    points: [
      'A tender being priced now shows Past openings under its pricing: where the lowest bid landed against the SOR on the last three years’ openings of the same client and kind of work, and on how many of them your quote would have been the lowest.',
    ],
  },
  {
    id: '2027-07-next-bill',
    date: '2027-07-05',
    title: 'What the next bill will be worth',
    points: [
      'Billing readiness now opens each project with its next bill: what could be billed today (measured, approved on site and not yet measured, stages done) and what it will be worth by the month end at the pace of the last 30 days.',
    ],
  },
  {
    id: '2027-06-purchase-controls',
    date: '2027-06-28',
    title: 'Purchase controls on the watch list',
    points: [
      'Management and accounts now see three checks on purchasing: orders split to stay under an approver’s limit, goods received by the person who ordered them, and a payment soon after a vendor’s bank details changed.',
      'They show only on your own watch list.',
    ],
  },
  {
    id: '2027-06-vendor-record',
    date: '2027-06-21',
    title: 'Each vendor’s record on the comparative statement',
    points: [
      'Under the quotations, the comparative statement now shows how each vendor delivered over the last year (on time, rejected at the gate) and how its rates compare with the median of the quotations, so L1 is weighed against more than price.',
    ],
  },
  {
    id: '2027-06-dpr-checks',
    date: '2027-06-14',
    title: 'Checks on a DPR before you approve it',
    points: [
      'A DPR waiting for you now opens with what is worth a second look: work with no crew, work whose material was not issued that week, the same figures or the same crew as the reports before, and a photo sent with an earlier report.',
      'The checks are advice. Approve, send back or reject as before.',
    ],
  },
  {
    id: '2027-06-cubes-at-7-days',
    date: '2027-06-07',
    title: 'Weak cubes, three weeks early',
    points: [
      'The watch list now warns when a set of cubes is weak at 7 days: what the 28-day result is likely to be, what it must reach, and to hold the next lift until it is in.',
    ],
  },
  {
    id: '2027-05-margin-falling',
    date: '2027-05-31',
    title: 'Margin falling, on the watch list',
    points: [
      'The watch list now warns when a project’s forecast margin at completion has dropped 2 points or more in the last three months, with what it costs and the cost heads running over their budget for the work done.',
    ],
  },
  {
    id: '2027-05-other-checks',
    date: '2027-05-24',
    title: 'Every check on the watch list',
    points: [
      'The watch list now opens with the headline of each check that has a page of its own: leakage this month, weeks the cash forecast runs short, work measured and not billed, and man-days billed above the records. Each links to its page.',
      'Admins see there too when Ask Nirmaan is off, and why.',
    ],
  },
  {
    id: '2027-05-controlled-copies',
    date: '2027-05-17',
    title: 'Controlled copies and the design dashboard',
    points: [
      'Issue numbered controlled copies of a drawing good for construction to the site office, gangs and subcontractors. A holder keeps its number from one revision to the next.',
      'When a new revision comes in, the old copies show as to recall until they are returned or destroyed. The watch list shows those out longer than a week.',
      'A drawing now says what its new revision changes: copies to recall, approvals to ask again, quantities to check, open marks and RFIs.',
      'The design dashboard shows each project’s late drawings, approvals, comments, copies to recall and as-builts due, and what each recent revision changes.',
    ],
  },
  {
    id: '2027-05-design-submissions',
    date: '2027-05-10',
    title: 'Design submissions',
    points: [
      'Send drawings, calculations, shop drawings or a method statement for approval, or to an institution for vetting, with a covering letter drafted in Correspondence.',
      'Record the code each round comes back with. An approval moves the drawings’ revisions in the register.',
      'Answer the reviewer’s comments on the comment resolution sheet and print it. A resubmission waits until every comment has a reply.',
      'Reviews past their reply date come first and show on the watch list, and the wait can be recorded as a delay toward an extension of time.',
    ],
  },
  {
    id: '2027-05-drawing-schedule',
    date: '2027-05-03',
    title: 'The drawing schedule',
    points: [
      'List the drawings each project needs, from whom and by when, and the work each one holds up. Add a whole list at once.',
      'Each line follows the document register by its number: awaited, received, then good for construction. Late ones come first.',
      'Write reminder letter drafts one letter to the consultant or client for everything they owe on the project that is late or due within a week.',
      'Record a late drawing from the client’s side as a delay, so the days count toward an extension of time. The watch list shows drawings awaited.',
      'Next number on a new document gives the next drawing number in your scheme, and As-built check lists the drawings still without an as-built revision.',
    ],
  },
  {
    id: '2027-04-qa-audits',
    date: '2027-04-16',
    title: 'Audits, visits and the quality report',
    points: [
      'Record internal audits and visits by the client, its consultant, a third-party inspector or the department, with each finding and the day it is to be put right.',
      'Close a finding with what was done, or raise an NCR from it in one step. A finding still open after 15 days shows as late, and My work lists the ones to close.',
      'The quality report gives each month’s tests and pass rate, tests short of the plan, NCRs by age, category and root cause, rework cost and audits, by project, ready to print.',
      'The watch list now warns of projects short of tests, instruments out of calibration and lab reports that are late.',
    ],
  },
  {
    id: '2027-04-qa-registers',
    date: '2027-04-02',
    title: 'Labs, calibration and test certificates',
    points: [
      'Record which lab each sample went to, the day it was sent and its report. Samples sent out shows what is still waiting and which reports are late.',
      'Keep your NABL labs with their certificate and validity: a lab whose accreditation runs out in the next month is marked.',
      'The calibration register keeps each instrument with its certificates and when it falls due. A test run on a machine out of calibration is flagged.',
      'Enter the maker’s test certificate on the QA/QC check of a receipt. Test certificates lists the steel, cement and pipes still without one.',
      'NCRs now carry a category, a root cause, whether the client raised them and what the rework cost.',
    ],
  },
  {
    id: '2027-03-quality-plan',
    date: '2027-03-06',
    title: 'Quality plans, tests due and the pour register',
    points: [
      'Each project has a quality plan: which tests are taken, how often, and who witnesses them. Start from the standard plan for its kind of work and change it to match the contract.',
      'Tests due counts what the plan owes from the work approved in DPRs and the material received, including the cube samples IS 456 asks for by the concrete poured each day, and shows what is short.',
      'Record each pour in the pour register, ask for its pour card before concreting, and see whether each grade’s cube results pass the IS 456 acceptance check.',
      'Test types, with their IS method and limits, are under Quality (QA/QC) › Masters. Add your own or change the standard ones.',
    ],
  },
  {
    id: '2027-03-correspondence',
    date: '2027-03-05',
    title: 'Correspondence: inward and outward registers',
    points: [
      'Correspondence has an inward and an outward register for every project and for head office. Letters get short numbers from each project’s series, such as P07/OUT/26-27/042, starting again each financial year.',
      'Record a letter received and mark it to someone with what to do and by when. They see it under Letters for you on My work and on the phone, and close it once it is dealt with.',
      'Write a letter from a template. Notices, claims and extension of time letters go to their signatory first and get their number when approved. Print it on your letterhead, then record how it went and the proof it arrived.',
      'The address book, numbering and templates are under Correspondence › Masters. The new Document Controller role keeps the registers.',
    ],
  },
  {
    id: '2027-03-masters-and-modules',
    date: '2027-03-04',
    title: 'Masters, and QA/QC, design and letters as modules of their own',
    points: [
      'Admin › Masters lists every list your company keeps, by department: items and units, vendors, clients, equipment, the chart of accounts, holidays, checklists and the rest.',
      'Trades, designations, departments, item categories and equipment categories are now lists you keep: add your own, give each a Hindi name, and switch off the ones you do not use. The forms suggest them.',
      'With the department menu, Quality (QA/QC), Design and drawings, and Correspondence are modules of their own, each with its own home. Safety stays in Project management.',
      'In the standard menu, Safety and Correspondence have their own modules on Home too.',
    ],
  },
  {
    id: '2027-03-progress-by-project',
    date: '2027-03-03',
    title: 'Progress by project',
    points: [
      'Opening Projects (or Project management, if your menu uses departments) now shows every project with its physical progress and its financial progress side by side, on one scale.',
      'Physical progress has a tick where the plan says the work should be today. Financial progress is the approved RA bills against the contract value, for those who see bills.',
      'Figures above sum up all projects, and a project is flagged when its work is behind plan or its billing trails the work by 10 points or more.',
      'Switch to Table to sort the projects by any figure.',
    ],
  },
  {
    id: '2027-03-update-projects-from-type',
    date: '2027-03-02',
    title: 'Bring running projects up to their type',
    points: [
      'Update projects on a project type lists each running project with the components, steps and activities it would gain from the type as it is now, and its progress before and after.',
      'It only adds. Nothing a project has is changed or removed, and new work comes in with no weight, so progress does not move until the planner weighs it. Leave out any project or item before you update.',
      'A component kind has its own Update projects, which gives the components laid out from it the steps it has gained.',
      'Export a project type, with its DPR form and the kinds it uses, as a file, and import it in another company. The import shows what is new, what replaces yours and what cannot come in, before anything is saved.',
    ],
  },
  {
    id: '2027-02-dpr-form-per-type',
    date: '2027-02-26',
    title: 'A DPR form for each project type',
    points: [
      'Each project type now has a DPR form tab: choose which sections a site report shows, which are required and what they are called, and how many photos it needs.',
      'Add up to 20 fields of your own, for the day or for each work line: text, numbers with a unit and range, yes or no, a choice, a date or a time, each with a Hindi name for the phone.',
      'Work lines pick the component, sub-component and activity in turn, are placed by chainage, floor or village as the type says, and can carry their own photo.',
      'Every change is saved as a version. Reports made already keep the form they were made on, and a report typed offline on the phone still goes in after the form changes.',
    ],
  },
  {
    id: '2027-02-project-types',
    date: '2027-02-24',
    title: 'Project types of your own',
    points: [
      'Projects › Project types lists your types: the standard road, building, town water scheme, transmission main, sewerage and general works, and any you make, such as a bridge.',
      'Each type says where its work is placed (chainage, floor or village), whether it has a pipe network, its usual contract, the components a new project starts with and how many, and its activities outside them.',
      'Component kinds are on their own tab: what the planner fills in for each, and the steps that become its activities, with RCC split into its parts and tanks or piers cast in lifts.',
      'New project asks for the type and how many of each component; the Structure tab offers the type’s kinds first. Activity templates now live on each type.',
    ],
  },
  {
    id: '2027-02-menu-and-names',
    date: '2027-02-20',
    title: 'Your menu, your names',
    points: [
      'Admins can move the menu into a bar across the top in Admin › Menu and names. Home then opens on your modules, and a module opens with its sub-modules in a bar under the top one.',
      'Three looks for the top bar: a navy bar, a light frame round the page, or one white bar. Admins can let each person choose their own from the account menu.',
      'Modules can follow your departments (project management, purchase, stores, contractors, machinery, accounts and so on), and each can carry the name your people use.',
    ],
  },
  {
    id: '2027-02-group-companies',
    date: '2027-02-22',
    title: 'A parent company and its child companies',
    points: [
      'Admins can make a group in Admin › Group companies and add its companies: a construction company, a consultancy, a quality lab, a plant. Each keeps its own projects, people, books and menu.',
      "A company's kind sets the modules it starts with; a quality lab, for one, starts without tenders, RMC or site cash. Its legal name, PAN, CIN and GSTIN sit with it.",
      'People sign in once. Someone who works in more than one company picks it from the header (from the account menu on a phone, and Profile in the app), and the next sign-in opens where they were last.',
      "The group's admins give a person a place in another company on the sign-in they already have, with the role they hold there.",
    ],
  },
  {
    id: '2027-02-requests-to-order',
    date: '2027-02-18',
    title: 'Purchase has its own list of requests to order',
    points: [
      'Purchases › Requests to order lists every approved material request with something left to buy, at its stage: no quotations yet, waiting for quotations, L1 to finalise, or L1 finalised with the PO to raise.',
      'Each request opens on one screen in four steps: send the enquiry, see and record the quotations, finalise L1 with the totals, the gap to L2, the split per item and the last order rates beside it, then raise the order.',
      'Choosing a supplier other than L1 asks why, and the order carries the reason.',
      'QA/QC gets Material to check under Quality, accounts get Received, not billed under Vendor bills and Debit notes to raise under Payables, and the store sees Deliveries expected under Stock, each with the button that clears it and a card on My work.',
    ],
  },
  {
    id: '2027-02-emails-that-act',
    date: '2027-02-17',
    title: 'The email carries the work, not just a link',
    points: [
      'Mark sent on an RA bill now emails the client’s engineer the bill itself: the items, the quantities, the rates, the deductions and the net, with a button to certify it on the portal. It prints to a PDF from their mail app.',
      'A supplier’s bill that does not match its order now goes to purchase and the project manager with the mismatch spelt out, not to the approver alone.',
      'A leave request emails whoever decides it, so days off are not waiting on someone opening the app.',
      'On Monday morning, management and each project manager get last week’s money in from clients, project by project.',
    ],
  },
  {
    id: '2027-02-less-typing',
    date: '2027-02-16',
    title: 'Less to type, and a list that fits',
    points: [
      'New project offers the next code in your series, and changing the kind of work changes the code with it until you type your own.',
      'A GSTIN now fills the PAN on a vendor or client, as it already filled the state.',
      'New user asks which projects the person works on, so you no longer go round each project’s team afterwards.',
      'Vendor bills fits the screen at 1440: the match with the order is no longer hidden under the status column.',
    ],
  },
  {
    id: '2027-02-standard-norms',
    date: '2027-02-15',
    title: 'Standard norms to start from',
    points: [
      'Add standard norms on a project’s Reconciliation reads the BOQ and offers the usual figures for concrete by grade, reinforcement, brickwork, plaster, sub-base, wet mix and bituminous work.',
      'It shows what it would set before anything is written, adds the store items it needs, and never touches the norms you have already set.',
    ],
  },
  {
    id: '2027-02-order-decision',
    date: '2027-02-14',
    title: 'Decide a purchase order without the paperwork',
    points: [
      'A purchase order now shows the quotations on its request, with the lowest marked and the one it accepts, so an approver can see who else was asked.',
      'It also shows the project’s material budget, what has been spent and where this order takes it.',
      'Delete has moved from the row of buttons into the ⋯ menu on every record, so it is no longer a tap away from Approve.',
    ],
  },
  {
    id: '2027-02-measure-from-progress',
    date: '2027-02-13',
    title: 'Measure from the approved progress',
    points: [
      'The measurement book now shows what each BOQ item has approved on site that no sheet holds yet, with what it is worth at the BOQ rate.',
      'Start sheet opens a measurement with one line per approved day, where it was and how much, so the quantities are checked rather than typed again.',
    ],
  },
  {
    id: '2027-02-scan-kept',
    date: '2027-02-12',
    title: 'The scan stays with the entry',
    points: [
      'The challan, invoice or drawing you read is kept on the entry, so there is no need to upload the same file again.',
      'The date printed on a challan or invoice now fills the entry. One that is still to come, or over a year old, is left for you to type and marked in amber.',
    ],
  },
  {
    id: '2027-02-award-lowest',
    date: '2027-02-11',
    title: 'Award the lowest rate per item',
    points: [
      'On the comparative statement, Award lowest per item splits the request between the vendors who quoted lowest for each item and raises a draft order for each, with what the split saves against buying the lot from one vendor.',
      'An enquiry link can now go straight to the supplier on WhatsApp, to their number from the vendor master.',
      'A project has a delivery address. A purchase order with none of its own is delivered there, so the store is not left guessing.',
    ],
  },
  {
    id: '2027-02-boq-links',
    date: '2027-02-10',
    title: 'Activities and the BOQ, joined up',
    points: [
      'After a BOQ import, Nirmaan offers each activity the BOQ section or item that matches its name. Keep the ones that are right and it fills in the unit and quantity.',
      'The Activities tab has Link to BOQ for whatever is still unlinked.',
      'A project planned before its dates were known now gets them: when the start and end arrive, the activities without dates are spread over the work.',
    ],
  },
  {
    id: '2027-02-read-work-order',
    date: '2027-02-09',
    title: 'Read the work order and the BOQ',
    points: [
      'New project › Fill from work order reads a work order or LoA: name of work, client, numbers, contract value and dates. Values to check are marked in amber.',
      'Import BOQ › Read a BOQ PDF or scan reads up to 30 pages into the import, with each row to check explained. Untick a row to leave it out.',
    ],
  },
  {
    id: '2027-02-my-work-queues',
    date: '2027-02-08',
    title: 'A queue for each desk',
    points: [
      'Home opens with what is waiting for you: the three most pressing of your My work lists, each one click away.',
      'My work has new lists: requests to order for purchase, deliveries due this week for the store, leave and overtime to decide for HR, and certified bills and goods received with no bill yet for accounts.',
    ],
  },
  {
    id: '2027-02-attendance-first',
    date: '2027-02-07',
    title: 'Attendance after the DPR',
    points: [
      'A day’s attendance and roll call can be recorded or corrected after its DPR is approved; they lock once payroll for the month is approved.',
    ],
  },
  {
    id: '2027-02-project-setup',
    date: '2027-02-06',
    title: 'Setting up a new project',
    points: [
      'A new project’s Overview has a setup checklist: team, dates, BOQ, activities and their BOQ links, schedule, baseline, contract, budget, villages or chainage, and norms. Each line opens its tab and ticks itself.',
      'New project › Copy from project brings over another project’s team and contract terms.',
      'Deductions no longer start at 0%: a new project takes its client’s usual terms (Clients › Edit) or 5% retention, 2% TDS, 2% GST TDS and 1% cess.',
      'Add several people to a team at once, or copy the team of another project.',
      'A BOQ that adds up to far from the contract value is flagged on the BOQ tab and the watch list.',
    ],
  },
  {
    id: '2027-02-sign-in-safety',
    date: '2027-02-05',
    title: 'Safer sign-in',
    points: [
      'Five wrong passwords in a row lock that email for 15 minutes; the sign-in screen says when to try again, or reset the password.',
      'Changing or resetting a password signs that account out everywhere else.',
      'Password-reset emails are limited to five an hour.',
    ],
  },
  {
    id: '2027-02-input-checks',
    date: '2027-02-04',
    title: 'Fewer wrong entries',
    points: [
      'A DPR, progress entry or attendance sheet cannot be dated after today.',
      'Quantities must be more than zero on requests, orders, receipts, issues, DPR lines and bills.',
      'A measurement that would take a BOQ item past its quantity plus the contract’s allowance (25% unless the contract says otherwise, set in Contract › Edit) is refused with the figures; record a variation for the extra first.',
      'Date fields read dates typed as 13/10/2026, 13-10-2026, 13.10.2026 or 13 Oct 26, and show them as 13 Oct 2026.',
    ],
  },
  {
    id: '2027-02-item-master',
    date: '2027-02-03',
    title: 'One name for each material',
    points: [
      'Material requests and purchase orders pick the item from the item master, with its unit filled in (and on an order, its standard rate).',
      'A name that is not in the master asks first whether you meant one that is, so the same cement is not three items in stock, rates and the leakage checks.',
      'Lines typed with other spacing or capitals are saved under the master’s name.',
      'Stock › Item master shows possible duplicates: keep one and merge the rest, once. Old names keep working.',
    ],
  },
  {
    id: '2027-02-handoffs',
    date: '2027-02-02',
    title: 'The next person is told',
    points: [
      'When a step is done, whoever acts next hears of it under “Your turn”, in the app and by email: purchase when a material request is approved, the store when a PO is approved, the requester, quality and accounts when goods arrive, accounts when the client certifies a bill, and the project manager and management when the client pays.',
      'A DPR whose remarks read as a hindrance caused by the client or a third party tells the project manager the day the notice is due.',
      'You hear when you are added to a project, and an entry sent back to you comes by email with the reason. An approval waiting past its hours is emailed too.',
      'Approval requests go to the approvers on the project; management and admin are asked only for what is above the project manager’s limit, and see the rest in the daily digest.',
      'Switch email off or on from Notifications › Alerts.',
    ],
  },
  {
    id: '2027-02-management',
    date: '2027-02-02',
    title: 'Management dashboard and reports',
    points: [
      'Reports › Management dashboard shows every project on one page: on course, watch or act now with the reasons, progress against plan, and money from contract to work done, billed, certified and paid, with cost, what clients owe, approvals waiting and cash.',
      'Open a project from it to see why it stands where it does: cost by head against budget, month by month, and the client bills, approvals, risks and orders still open.',
      'Nine reports print on A4 and download to Excel: Monthly MIS, project profit and loss, work in progress, receivables and payables ageing, procurement spend, labour and attendance, stock position and approvals waiting.',
    ],
  },
  {
    id: '2027-02-schedule-status',
    date: '2027-02-01',
    title: 'Schedule status you can trust',
    points: [
      'A project whose plan ends after its completion date (with the extensions granted) no longer shows “on track”: the header, Overview and Schedule tab say how many days late it ends, and the watch list and morning brief carry it.',
      'A project with no dated activities says “No plan yet” instead of “on track”.',
      'The client portal shows the agreed programme, the baseline you froze, never your working re-plan.',
    ],
  },
  {
    id: '2027-01-icons',
    date: '2027-01-29',
    title: 'One set of icons',
    points: [
      'Every icon in the app now comes from one family, drawn with the same line as the menu’s, so buttons, menus and pages match.',
      'Empty lists and the pictures behind them follow the dark theme, and a page you cannot open or that is not found shows Nirmaan’s own mark.',
    ],
  },
  {
    id: '2027-01-tags-stages',
    date: '2027-01-22',
    title: 'Clearer statuses and stages',
    points: [
      'Statuses are soft pills with a dot in Nirmaan’s colours: orange waits on someone, green is approved or done, red is rejected or overdue, violet is sent back, grey is a draft.',
      'An entry’s page shows where it stands as a row of stages on a line: blue up to where it is, red where it was rejected or sent back, with who did each step and when.',
      'A form opened in a drawer names its module above the title, so you can see where you are.',
    ],
  },
  {
    id: '2027-01-brand-look',
    date: '2027-01-21',
    title: 'Nirmaan’s own look',
    points: [
      'Page titles, drawer titles and the big figures on every page are set in Nirmaan’s condensed heading type, so totals and counts stand out.',
      'Tables have a quieter header and a pale blue row under the pointer; a field you are typing in has a soft blue ring, and today is underlined in the date picker.',
      'Notices are softer, with no outline, and tooltips and the dimmed page behind a drawer are Nirmaan navy.',
    ],
  },
  {
    id: '2027-01-tabs',
    date: '2027-01-20',
    title: 'Clearer tabs on every page',
    points: [
      'Tabs look the same everywhere: the chosen tab is blue over a thicker bar and the others step back. A page’s own tabs stay in view under the header while you scroll a long list.',
      'Counts sit in a small pill beside the tab’s name: red for what is waiting on someone (NCRs not closed, leave to decide), grey for how many there are. A screen reader says what the count is, such as “3 results overdue”.',
      'On a phone, a row of tabs wider than the screen fades out at the edge, so you can see there is more to swipe to.',
    ],
  },
  {
    id: '2027-01-po-email',
    date: '2027-01-18',
    title: 'Purchase orders go to the supplier by email',
    points: [
      'An approved purchase order is emailed to the vendor at the email in the vendor master: the items, totals, delivery, payment and terms, with a button to accept it when they have a supplier portal login. The order shows when it went and to whom, or why it did not, with Email vendor again.',
      'An order not from the lowest quotation that prices every item on its request asks why before it goes for approval, and the approver reads the reason on the order.',
    ],
  },
  {
    id: '2027-01-om',
    date: '2027-01-16',
    title: 'Operation and maintenance after handover',
    points: [
      'A handed-over project has Handover › O&M: set the O&M years, the % of the contract each year, the instalments, the service level benchmarks with their penalties, the minimum staff and the chemical norms.',
      'Site engineers record each day’s water produced and supplied, chlorine and pressure at the tail end, complaints and pump readings. The month shows each benchmark’s failures against what it allows and the penalty, and the days with no reading.',
      'Each period is billed as an O&M bill: the instalment less the pay of staff short of the minimum, with the penalties among the deductions. Chemicals are checked against their norm per ML, and the watch list says what the running quarter is losing.',
    ],
  },
  {
    id: '2027-01-epc',
    date: '2027-01-12',
    title: 'EPC projects: engineering, equipment and the contract currency',
    points: [
      "An EPC project has Plan › Engineering and packages: the design deliverables by discipline with the client's code (A to D) and how late each is, the equipment packages from order to commissioning with when each reaches site against the day it is needed, and what the client owes.",
      'A payment stage can now be paid on the approval of its deliverables, or on the delivery or erection of its packages. A late client input becomes a delay against the client in one click.',
      "A contract can be in another currency at its contract rate. Bills, the print, the break-up and the receipt form show it; a receipt takes the day's rate, and the books post the exchange difference.",
    ],
  },
  {
    id: '2027-01-stage-billing',
    date: '2027-01-08',
    title: 'Stage billing for lump-sum contracts',
    points: [
      "A lump-sum project's Contract tab has its billing break-up: each component's share of the lump sum and its payment stages, made in one go from the project's structure. Each stage shows what it has earned today from a dated event, progress, pipe supplied or pipe tested, and what has been billed.",
      'An RA bill on such a project takes its stages from that evidence at the measurements date, less what earlier bills took. The QS can claim a stage by hand (more needs a note), the client can pass less, and road restoration, house connections and the HT feeder are measured and paid at rate × the tender factor.',
      'The milestone grid sets each component\'s target by month. A bill withholds for a component behind it, by tiers, and releases it as the work catches up. The mobilisation advance can be recovered between two % of the contract executed.',
    ],
  },
  {
    id: '2027-01-stock-against-dpr',
    date: '2027-01-04',
    title: 'Stock against the DPR: what was issued, done and used, by component',
    points: [
      "Reconciliation's Materials view adds what the approved DPR lines say they used against what their work needed, and what should still be at the work front. Norms can now sit on an activity (a tank's concrete, a house connection's kit) as well as a BOQ item.",
      'Structure shows each component with its design need, need and use, what was issued to it and what is still there. On water and sewerage projects, Pipe gives each size from scope to laid with cut wastage and what is left to buy, and Kits counts house connections short of a part.',
      'Exceptions lists material used with nothing issued there, issues with no work after them, and pipe laid above what was issued. An issue from the store can now name its component, and pipe items take their diameter, material and weight per metre.',
    ],
  },
  {
    id: '2026-12-pipe-network',
    date: '2026-12-31',
    title: 'Pipe network: every pipe junction to junction',
    points: [
      "Project › Plan › Pipe network loads a zone's network from the design office's EPANET (.inp) file or an Excel sheet of nodes and pipes. You see what it adds or changes before saving, and pipes keep their work when it is loaded again.",
      "The tab draws the zone with each pipe in the state of its work, gives the pipe sheet by diameter (scope, trenched, laid, tested, balance) and lists the pipes ready to start.",
      'On the DPR, pipe work names its pipe (P-27, J-12 to J-13) and can\'t go past the pipe\'s length. The DPR and its print add the day\'s pipeline table, a hydraulic test names the pipes it covers, and the phone picks the pipe too.',
    ],
  },
  {
    id: '2026-12-structured-dpr',
    date: '2026-12-28',
    title: 'DPR work lines: progress by component, activity and sub-activity',
    points: [
      "The DPR's Work done section takes one line for each activity or sub-activity worked on: where, how much today, the crew, machines and material, and the work order. This week's planned activities come first, material is filled from the norms, and Copy lines brings back the last DPR's work.",
      'Approving the DPR approves its lines as progress, with hold points checked for each line. The DPR and its print show each line under its component with scope, up to previous, cumulative, % and balance, and the crew on the lines against the head count.',
      'Admins can make the DPR the only way progress is recorded (Approval rules). It is on for new companies. On the phone, the DPR takes work lines too, offline as well.',
    ],
  },
  {
    id: '2026-12-work-breakdown',
    date: '2026-12-24',
    title: 'Project structure: components, sub-components and sub-activities',
    points: [
      'Project › Plan › Structure splits a project into its components (an intake well, the treatment plant and its units, each overhead tank, each pipe zone) with their weights, and rolls progress up from the activities under each to the project. A lump-sum contract weighs components by its billing breakup; with no weights, by BOQ value.',
      'New component lays out the activities for its kind: an overhead tank gets its staging lift by lift, and every RCC item is reported as reinforcement, shuttering and concrete. Fill the planned quantities you know; the rest can wait. Excel import and export work on the structure too.',
      'BOQ items take a section (cost centre), a component and their SOR item, and the BOQ tab shows section totals. Sewerage is a project type, and a project records whether it is item rate, lump sum or EPC.',
    ],
  },
  {
    id: '2026-12-attendance-check',
    date: '2026-12-22',
    title: 'Attendance cross-check for labour bills',
    points: [
      "A labour contractor's bill in man-days is now checked against the site's head count, roll call and biometric punches for the days it covers. A bill asking for more shows it on its checks and on the Watch list, with the man-days and rupees to hold until the contractor shows the muster.",
      'Site › Attendance cross-check (also under People) lists those bills, workers marked present who did not punch on a day the device worked, and head counts above the roll call or the DPR, each with its working. Workers are named only to HR and the project manager, and nothing cuts a wage by itself.',
    ],
  },
  {
    id: '2026-12-hindrance-notice',
    date: '2026-12-20',
    title: 'Hindrances from the DPRs, and the notice clock',
    points: [
      'Delays and risks now lists what the DPRs say held up work (villagers stopping work, drawings awaited, a pole not shifted, rain), read from the issues each site writes, in English, Hindi or Hinglish. Record one as a delay, add it to the open delay it belongs to, or dismiss it.',
      'A delay the client or a third party is answerable for runs a notice clock: the contract\'s notice days (set on the Contract tab, where the filed contract\'s clause is suggested) from the day work was held up. The Watch list warns 7, 3 and 0 days before the notice is due, until a letter to the client is linked to the delay.',
      'Draft notice on a delay opens a letter filled in from its dates, the DPR entries and the contract\'s clause. Delay register prints every delay with its notice, letters and DPR entries for an extension-of-time claim.',
    ],
  },
  {
    id: '2026-12-cash-forecast',
    date: '2026-12-18',
    title: 'Cash forecast and billing readiness',
    points: [
      'Accounts, Cash forecast shows bank and cash for the next 13 weeks as a low, likely and high balance, from the books and every client bill, supplier bill, order, salary run, EMI and due on record. A client bill is expected when that client usually pays, not when the contract says.',
      'A short week says why, and the page lists which client bills to chase and which payments can wait (never MSME bills, salaries or EMIs). Each week the forecast is kept, and four weeks on it shows how far it was out.',
      'Client billing, Billing readiness lists measured work not billed, bills not sent and bills not paid on each project. Draft reminder opens a letter to the client filled in from the bill and the contract\'s payment clause.',
    ],
  },
  {
    id: '2026-12-leakage-checks',
    date: '2026-12-16',
    title: 'Leakage checks',
    points: [
      'Materials, Leakage checks lists the month\'s flags where material, money and fuel may be going missing, with the rupees at risk: material used over what the work allows or above your other sites, orders above what another site paid, fuel issued to a machine with no log that day or beyond its norm, and hired machines paid for hours they did not work.',
      'Each flag shows its working and links to the records behind it. The purchase order form and the order itself now say when a rate is above what another site paid in the 30 days before.',
      'Rates above another site, fuel with no log and idle hired machines also come to the Watch list.',
    ],
  },
  {
    id: '2026-12-whatsapp-entries',
    date: '2026-12-14',
    title: 'Send entries from WhatsApp',
    points: [
      'Switch on WhatsApp entries under Site, then send the company number a text, a photo with a caption or a voice note, in English, Hindi or Hinglish. Nirmaan drafts the DPR, material request, expense or progress entry it describes and replies with it.',
      'Reply 1 or tap Save to save it in your name and send it for approval, 2 to discard it, or open the link to change it first. Nothing is saved until you say so.',
      'A voice note is written down before it is drafted, so check its figures. Every message and what became of it is on the WhatsApp entries page.',
    ],
  },
  {
    id: '2026-12-watch-list-why',
    date: '2026-12-12',
    title: 'Warnings that say what to do, and why',
    points: [
      'Each warning on the Watch list now starts with what to do and what it costs, and says how sure it is: Checked, Likely or Check this. Open Why to see the rule and the numbers behind it.',
      'When you dismiss a warning, say whether it was Fixed, Known and accepted, or Wrong. The Track record tab shows how often each check has been right in your company, and a check marked Wrong too often pauses itself until an admin resumes it.',
      'New warnings now reach you each morning as notifications, five at most a day, most costly first. The rest stay on the Watch list.',
    ],
  },
  {
    id: '2026-12-phone-home',
    date: '2026-12-10',
    title: 'The same Home on the phone',
    points: [
      'The phone app\'s Home tab now shows a tile for every module you can use, in Hindi too, with New entry still at the top. A module opens its pages; pages the phone has no screen for open on the web.',
      'Your pins and recent pages are the same on the phone and the web. Long press a tile or a page to pin it, move it or unpin it.',
      'What the phone\'s Home showed before is now the My work tile.',
    ],
  },
  {
    id: '2026-12-discover',
    date: '2026-12-08',
    title: 'Discover on Home, and asking for a module',
    points: [
      'Discover on Home shows what is new, modules you have not opened yet, and modules your role does not open. Open any tile to see what the module is for and its pages.',
      'For a module your role does not open, Request access sends a note to your admins, and you get a notification when they answer.',
      'Admins answer requests in Admin › Home tiles, and can mark modules New or Featured for the whole company, or keep modules a role cannot open out of Discover.',
    ],
  },
  {
    id: '2026-12-launcher-home',
    date: '2026-12-06',
    title: 'A new Home: your modules, pins and recent pages',
    points: [
      'Home now opens on a tile for every module you can use, with a count where something waits for you. Type in the search box to find any page or tab by name; press Enter to open the first one.',
      'Pin the tiles you use most from a tile\'s ⋮ menu, or with Pin to Home at the top of any page or project. Pins follow you to every computer you sign in on, and Edit pins puts them in your order.',
      'Recent shows the pages, projects and records you opened last. What used to be Home is now the My work tile.',
    ],
  },
  {
    id: '2026-11-module-tiles',
    date: '2026-12-05',
    title: 'More modules in the menu, each with its own tiles',
    points: [
      'The menu now has a section for each module: Quality and safety, Documents, Plant and machinery, Subcontracts, Tenders and RMC plant have their own, and Payables sits in Accounts with the books. You see the same pages as before.',
      "Each module's overview starts with a tile for every page and tab in it (Material tests, Permits to work, Delivery status…), each with a line on what it is for. Use the arrow keys to move between tiles; a tile for a project's tab asks which project when none is picked at the top.",
      'Project cost now remembers its open tab in the address, so a link to Cash flow opens Cash flow.',
    ],
  },
  {
    id: '2026-12-takeoff',
    date: '2026-12-04',
    title: 'Measure on drawings',
    points: [
      'In the drawing viewer, set a sheet’s scale from two points a known distance apart (or a DXF’s own units), then measure lengths, areas and counts by clicking on the drawing.',
      'Measures sit beside the drawing under Measures, with totals. Tick some and add them to the measurement book, a line each, or set a BOQ item’s quantity from them.',
    ],
  },
  {
    id: '2026-12-modules',
    date: '2026-12-03',
    title: 'Turn off what you don’t use',
    points: [
      'Admin > Modules lists the parts your company may not need: meetings, material approvals, safety, site imprest, guarantees, tenders, subcontract enquiries, books, payroll, biometric devices, the RMC plant and machine loans.',
      'A module turned off leaves the sidebar, Search, New and Ask for everyone, on the web and the phone. Its records are kept, so turning it on again brings everything back.',
    ],
  },
  {
    id: '2026-11-comments',
    date: '2026-11-30',
    title: 'Comments and mentions',
    points: [
      'Every DPR, progress entry, request, order, bill, inspection, meeting and material approval has Comments: ask a question or note something for the team, and reply in the thread.',
      'Type @ to bring someone in. They get a notice that opens the record at its comments, and everyone in a thread hears of a reply.',
      'Resolve a thread once it is settled; a new reply opens it again.',
    ],
  },
  {
    id: '2026-11-earned-value',
    date: '2026-11-27',
    title: 'Earned value',
    points: [
      'A project’s Money group has an Earned value tab: how far the work is behind or ahead of the baseline (SPI) and over or under its budget (CPI), with the finish and the cost at completion they point to.',
      'The S-curve sets planned value, earned value and actual cost month by month, and the activities furthest behind are listed first.',
      'Earn from approved progress or, switched, from measured work.',
    ],
  },
  {
    id: '2026-11-schedule-links',
    date: '2026-11-24',
    title: 'Schedule links, critical path and look-ahead',
    points: [
      'On a project’s Gantt, click an activity to say what it waits on: finish to start, start to start, finish to finish or start to finish, with a lag. The critical path, each activity’s float and the earliest start its links allow are drawn on the bars.',
      'Activities planned to start before their links allow are counted at the top, and Move them puts each on the day its links allow, its length kept.',
      'The new Look-ahead tab shows the next three weeks day by day: what is under way, what is ready to start and what still waits, and on what.',
      'Export the schedule to MS Project or Primavera P6, and import one back: you see what will change before anything is saved.',
    ],
  },
  {
    id: '2026-11-material-approvals',
    date: '2026-11-20',
    title: 'Material approvals',
    points: [
      'Ask the client or consultant to approve a make or a sample from Materials and plant → Material approvals: the material, the make and model, where it is used, why this make, and the catalogue and test certificates.',
      'Each submission is a revision (R0, R1…) with the outcome and comments that came back. Requests waiting past their reply date, and those back with you to revise, are counted at the top.',
      'Each project keeps its approved makes, from the contract or approved on request. A purchase order line for one of those materials that names another make, or none, is flagged on the order.',
    ],
  },
  {
    id: '2026-11-meetings',
    date: '2026-11-18',
    title: 'Meetings and action items',
    points: [
      'Record a meeting from Site → Meetings: who came (your staff, and the client, consultant or subcontractor by name), what was noted and decided, and the actions, each with who does it by when and, if it is about one, the RFI, NCR or variation.',
      'Issue the minutes and they are emailed to everyone on the list with an email; your staff are told of their actions, which then wait in their My work until done. Print them, or send them to the site group on WhatsApp.',
      'The next meeting of the project shows what earlier ones left open, and the Actions tab lists every action by due date, the late ones first.',
    ],
  },
  {
    id: '2026-11-subcontract-enquiries',
    date: '2026-11-16',
    title: 'Subcontract enquiries',
    points: [
      'Send work out to quote from Purchases → Subcontract enquiries: pick the BOQ items and the quantity to give out (or add your own items, like scaffolding), say what the rates must include, and choose the subcontractors to ask.',
      'Enter each quote as it comes. The comparative statement sets every rate side by side, marks the lowest for each item and ranks the quotes L1, L2… on their total, each against the client’s rates.',
      'Award a quote and it becomes a draft work order at its rates and GST, with your scope as its terms. Choosing one that is not the lowest asks for the reason, which stays on the enquiry.',
    ],
  },
  {
    id: '2026-11-tenders',
    date: '2026-11-15',
    title: 'Tenders and schedules of rates',
    points: [
      'Keep the tenders you are bidding under Billing → Tenders: the notice, the client, the last date to submit and the EMD, which goes to Guarantees and licences until it comes back.',
      'Price the bid BOQ from each item’s rate analysis (materials with wastage, labour and machinery, with overheads and profit), against the state SOR, the CPWD DSR or your own rates kept under Billing → Schedule of rates and imported from Excel. Quote one percentage above or below the SOR, or a rate per item, and see the margin it leaves.',
      'Record the bids read out at opening to see where you stand (L1, L2…), then the result. A won tender becomes a project in one step, with its BOQ, rate analysis, cost budget and guarantees.',
    ],
  },
  {
    id: '2026-11-machine-loans',
    date: '2026-11-14',
    title: 'Machine loans',
    points: [
      'Record the loan on a financed machine from Accounts → Machine loans: the lender, the amount, rate and tenure, and the first EMI date. The EMI and its schedule are worked out, or use the lender’s EMI.',
      'Record each EMI as it is paid, close a loan early, and see what is owed to each lender, what falls due in the next 30 days and any EMI overdue. EMIs falling due and overdue are reminded, and an overdue one is on the watch list.',
      'The loan and every EMI go to the books and Tally by themselves: the loan to its own ledger under secured loans, the interest to finance costs. Each loan shows the interest it costs the machine for every hour it works.',
    ],
  },
  {
    id: '2026-11-fund-requests',
    date: '2026-11-13',
    title: 'Fund requests from sites',
    points: [
      'A site asks head office for money from Site imprest → Fund requests: for wages, a local purchase, a petty contractor or running costs, by a date, with the wage sheet or quotation attached.',
      "The money goes into the site's imprest, or straight to a party on account. A site can also ask on behalf of another site it works with.",
      'Requests are approved like payment requests, by the approval matrix. Accounts then release them into the imprest, or pay the party under Payables; both show on the request.',
    ],
  },
  {
    id: '2026-11-central-store',
    date: '2026-11-12',
    title: 'Central stores',
    points: [
      'Keep stock at a company store or yard that is not a site: add one from Materials and plant → Central stores (a project of type Central store or yard).',
      'Order and receive into the store like any site. Send material to a site by transfer; it stays on the road until the site receives it, and sites send spare material back the same way.',
      "Each store shows its stock, register, value and age, and what is on the road. When a site's material request needs something, the store's stock is listed beside the other sites'.",
    ],
  },
  {
    id: '2026-11-supplier-portal',
    date: '2026-11-11',
    title: 'Supplier portal',
    points: [
      "Give a supplier's or subcontractor's people a login from Vendors. They see only their own enquiries, orders, invoices and payments, nothing about your projects or other vendors.",
      'Suppliers quote on enquiries, accept purchase and work orders, and send a dispatch note with each truck. The store picks the note when receiving, and the GRN fills in from it.',
      'Invoices they send arrive in the Supplier inbox with the file. Accounts record the bill from it or return it with what to fix, and the supplier follows it through to payment.',
      'Suppliers see their statement, what is due and every payment with TDS. A change to their details, above all a new bank account, waits for your approval before it counts.',
    ],
  },
  {
    id: '2026-11-rmc',
    date: '2026-11-10',
    title: 'RMC plant',
    points: [
      'Run a ready-mix concrete plant as a project of type RMC plant: its cement, sand, aggregates and admixture are bought, received and counted in its store as at any site.',
      'Quality approves mix designs; sales quote customers and confirm orders; the plant sends trucks, each with its challan, and the materials go out of the store at the design or as weighed at the batcher.',
      'The day at the plant shows the orders to pour, the trucks sent by grade and whether the store has enough for what is left. Take cubes from a truck and the 7 and 28 day results are due in Quality.',
      'Accounts bill delivered challans with GST and record what customers pay; both go to the books and the Tally export.',
    ],
  },
  {
    id: '2026-11-statements',
    date: '2026-11-09',
    title: 'Financial statements',
    points: [
      'Accounts → Financial statements shows the trial balance, the profit and loss account and the balance sheet in Schedule III order, each beside the same period a year before, and every figure opens its ledger.',
      'See the trial balance and profit and loss project by project, and download any of them to Excel.',
      'Import the bank statement as CSV or Excel: lines that agree by amount and day are matched at once, you match the rest or make a voucher for bank charges and interest, and the bank reconciliation shows what is still in transit.',
      'Enter the day your books begin with the balances from your old books, lock the books up to a day once returns are filed, and close a year when it ends.',
    ],
  },
  {
    id: '2026-11-books',
    date: '2026-11-08',
    title: 'The books of account',
    points: [
      'A new Accounts section holds the books, the GST registers and the Tally export, with an overview of cash and bank in the books, vouchers to approve and records not posted.',
      'Accounts → Books keeps the day book, the cash and bank books and every ledger from what the modules already hold: RA bills, money received, vendor and subcontractor bills, payments, site expenses, debit notes, salaries and loans to staff. Projects are the cost centres.',
      'Make journal, payment, receipt and contra vouchers for the rest (rent, capital, cash drawn). Management approves them before they count, and can cancel one later.',
      'The Tally export now sends salary runs, salary payments and loans to staff too.',
    ],
  },
  {
    id: '2026-11-biometric',
    date: '2026-11-07',
    title: 'Biometric devices mark attendance',
    points: [
      'People → Biometric devices registers your fingerprint and face terminals. ZKTeco, eSSL and similar devices with ADMS (cloud) send punches straight in; Setup shows what to enter on the device.',
      'Other devices and attendance services can send punches to a webhook with the device\'s own key, or you can import the punch file from the device software as Excel or CSV.',
      'Match each user number on the device to an employee or a worker once. Punches then become staff attendance (with overtime to approve) and worker attendance at the device\'s site, and the Punches tab shows what each one did.',
    ],
  },
  {
    id: '2026-11-payroll',
    date: '2026-11-06',
    title: 'Payroll: salary runs, payslips and full and final',
    points: [
      'Payroll now runs the salary itself. Set each person\'s salary from a date under Payroll → Salaries; PF, ESI, professional tax and TDS a month and the CTC are worked out for you.',
      'Each month HR prepares the salary run from approved attendance, adds arrears or a bonus where needed and submits it. Management approves it, and accounts downloads the bank file and marks it paid. The PF (ECR) and ESI files come from the same run.',
      'Loans and advances are recovered from salary each month until nothing is left. When someone leaves, Full and final works out their last salary, leave encashment, gratuity, notice short and what they still owe.',
      'Everyone sees their own payslips under Staff and leave → My payslips, and in the phone app (in Hindi too) once the month is approved.',
    ],
  },
  {
    id: '2026-11-hr-records',
    date: '2026-11-05',
    title: 'HR records, service events and letters',
    points: [
      'A staff record now holds the employment terms, personal details, PAN, UAN, PF and ESI numbers and the salary account. Only HR, payroll and the person see the private parts.',
      'Record a confirmation, transfer, promotion, increment, warning or exit from the record\'s Service and letters tab. The record changes to match, and each step gets a letter number and a letter to print. Take back the latest one if it was a mistake.',
      'Staff and leave → Service records lists every step across the company. The People overview now shows head count by site, department and employment, probation ending, birthdays and work anniversaries, and whose details payroll still needs.',
    ],
  },
  {
    id: '2026-11-drawing-viewer',
    date: '2026-11-04',
    title: 'View and mark up drawings',
    points: [
      'Open a drawing from Documents with View and mark up: PDF, DXF (with its layers) and scanned or photographed drawings show in the app, to zoom and move round with the mouse, keys or two fingers.',
      'Mark it up with comment pins, clouds, boxes, arrows, text and freehand lines in four colours. Each mark is numbered (M1, M2…), can be resolved, and an open mark carries onto the next revision until it is. Raise RFI from a mark fills the RFI form for you.',
      'Compare with an earlier revision shows what changed: only on the older one in red, only on the newer one in blue. Save image gives the sheet with its marks as a picture to share.',
      'Revisions now take DXF and DWG files. DWG is kept for download, so add the PDF or DXF beside it. On the phone, Drawings lists open marks and you can pin comments on image drawings.',
    ],
  },
  {
    id: '2026-11-module-homes',
    date: '2026-11-04',
    title: 'A home page for each module',
    points: [
      'Each section of the menu now starts with its overview: Site, Materials and plant, Purchases, Billing and People. It shows the figures of that module for your sites (or the project picked at the top), what waits for your approval there, and every page in it with a line on what it is for.',
      "Each figure opens its list, and a red or orange line says when one needs someone: sites that have not sent today's report, deliveries running late, money overdue.",
    ],
  },
  {
    id: '2026-11-attendance-extras',
    date: '2026-11-03',
    title: 'Check-in at the site, on duty and tour, overtime approval',
    points: [
      "A project can now hold its site's location and a radius (in the project form). Check-in records where the phone or browser is and shows At the site or Outside the site; tick Refuse a check-in from outside to make it a rule. The phone app needs its next update for this.",
      'On duty and Tour are new kinds of leave request for work away from the site: approved like leave, with no balance, and counted present and paid in payroll.',
      'Overtime from a check-out now waits for the site manager or HR under Staff and leave → Overtime. Payroll pays approved overtime only and shows what still waits.',
    ],
  },
  {
    id: '2026-11-company-today',
    date: '2026-11-02',
    title: 'The company today, on the phone',
    points: [
      "On the phone app, owners, directors, accounts and project managers now open Home on the company's day: money paid and received today against yesterday, what is owed both ways and how much is overdue, staff and labour present, diesel issued and left, orders still to come and requests still to order, and approvals waiting by module.",
      'Tap a tile for its list: the bills most overdue, each site\'s attendance, fuel by site, late orders, approvals by kind. A row opens its record. The figures stay on the phone for when there is no signal.',
    ],
  },
  {
    id: '2026-11-small-purchase',
    date: '2026-11-01',
    title: 'Stock first, last orders and enquiries to suppliers',
    points: [
      "An approved material request shows each item's stock at its own site and at the other sites. Take from stock issues what this site holds, or transfers from another site, and only the rest is left to order.",
      'The quotation form, the comparative statement and the purchase order form show the last order of each item, with the last five (vendor, date, project and rate) a click away.',
      'Send enquiry emails the request to chosen suppliers with a link to quote. They type rates, GST, freight and delivery days without signing in, and the quote lands on the comparative statement marked From supplier. No email? Copy the link for WhatsApp.',
    ],
  },
  {
    id: '2026-10-approval-levels',
    date: '2026-10-31',
    title: 'Second and third approvals, reminders and escalation',
    points: [
      "Approval rules can ask for a second and a third approval above an amount, per kind of entry: a purchase order over ₹2 lakh, say, goes to management after the project manager approves it. Nobody approves two levels of one entry.",
      "Set when the approvers are reminded about an entry still waiting, and when it escalates: after that the next level (management above the last) can decide it too, and they are told.",
      "Every record shows its levels: who approved each and when, whose queue it is in now and since when. The Approvals inbox marks the level and escalated entries.",
      "Home has a Waiting with others card: your own entries waiting for approval, at which level and with whom. The phone shows the same in My submissions.",
    ],
  },
  {
    id: '2026-10-fuel-and-fleet',
    date: '2026-10-30',
    title: 'Fuel, utilisation, and tyres and batteries',
    points: [
      'Fuel issue puts diesel from the site store into one machine, with its hour meter or odometer, on the web and on the phone (offline too). Machinery has a Fuel tab with each site\'s fuel position for the day: opening, received, into machines, other issues and closing against its minimum level.',
      "Give a machine a fuel norm (litres an hour, or km a litre for a vehicle) and a tolerance. The watch list flags a machine whose average over its recent logs is off the norm, and a hired machine's bill recovers the diesel actually issued into it.",
      "Utilisation shows each machine's hours worked against the hours it was on site, and its availability less breakdowns, by machine and by category, for any period, with an Excel export.",
      'Each machine keeps its tyres and batteries: when each was fitted and came off, at what meter reading, why, and its life in hours or km. Open it from the tool button in Equipment.',
    ],
  },
  {
    id: '2026-10-rate-analysis',
    date: '2026-10-29',
    title: 'Rate analysis, subcontractor material and wastage',
    points: [
      "Each BOQ item has a rate analysis: the materials one unit uses, the labour days and the machine hours it takes. Fill it by hand, from the starter library (PCC, RCC, steel, brickwork, plaster, road layers, pipes), from another BOQ item, or from an Excel sheet.",
      "Reconciliation has an Estimate view for those who see cost: each item's built-up rate at today's item, labour and machine rates, with overheads and profit, against the BOQ rate, so items quoted under cost stand out.",
      "Its Subcontractors view checks the material issued to each work order against its measured work. Material used beyond the norm can be raised for recovery, and it comes off the subcontractor's next bill as its own deduction.",
      'A stock adjustment now asks for its reason (wastage, damage, theft or loss, count difference), and the Wastage view totals what was written off by reason and item. The watch list warns when a material runs over its norm.',
    ],
  },
  {
    id: '2026-10-bills-without-po',
    date: '2026-10-28',
    title: 'Hire, workshop and service bills, and debit notes',
    points: [
      "Record vendor bill now offers bills without a purchase order: a hired machine's month, filled in from its approved logs at the agreed rate, with any minimum hours and the diesel we issued recovered; a workshop's bill for closed job cards; and other services such as transport or testing, booked to a cost head.",
      'What does not match the logs or job cards is flagged for the approver, a machine and month can be billed only once, and billed logs and job cards show the bill they are on.',
      'Raise a debit note on an approved vendor or subcontractor bill for short supply, excess billing, a rate difference or material rejected or returned (also from the GRN). It comes off what is payable, reverses the input GST and goes to Tally as a debit note. Payables has a Debit notes tab.',
      "Machines have hire terms (minimum hours, who fuels it, operator), and the cost view takes a machine's hire bill in place of its logged hours.",
    ],
  },
  {
    id: '2026-10-payment-requests',
    date: '2026-10-27',
    title: 'Payment requests and advances',
    points: [
      'Ask for a bill to be paid, or an advance released on a purchase order or work order, with Request payment on the bill or order. The request goes to approval like any other entry, with rupee limits in Approval rules.',
      'Accounts pays against the approved request from Payables, which has a Payment requests tab, and is told as soon as one is approved. An admin can make every payment need an approved request.',
      "A vendor bill takes the advance paid on its PO off what is payable, and a subcontractor bill recovers what was actually paid on the work order. Payables shows each vendor's advance not yet adjusted.",
      'Advances go to Tally as payment vouchers against the party, and approvers can decide requests from the phone.',
    ],
  },
  {
    id: '2026-10-rfi-register',
    date: '2026-10-26',
    title: 'RFI register',
    points: [
      'Documents has an RFIs tab: questions to the client or consultant about a drawing or the work, with the date the answer is needed and how late it is.',
      "The client's engineer or consultant sees the project's RFIs in their portal and answers them there; you are told when they do. An answer that came by letter can be recorded too.",
      'When an answer changes the work, raise a variation or record a delay from the RFI, and it stays linked.',
      'Raise an RFI from the phone with a photo of what you found, even without signal, in English or Hindi.',
    ],
  },
  {
    id: '2026-10-ppe-register',
    date: '2026-10-25',
    title: 'PPE register',
    points: [
      'Safety has a PPE tab: every worker at a project against the kit it requires, with who is on site today without it at the top.',
      'Issue a helmet, shoes, jacket or any other item to one worker or a whole gang at once. Each item gets a replace-by date, and issuing it again replaces the old one.',
      'Record kit handed back or lost; lost items are marked to recover from the labour contractor, with totals per contractor.',
      'Site staff can issue PPE from the phone, even without signal, in English or Hindi.',
    ],
  },
  {
    id: '2026-10-material-reconciliation',
    date: '2026-10-24',
    title: 'Material reconciliation',
    points: [
      'A project\'s Materials now has Reconciliation: how much cement, steel or any other item the approved work should have used, against what the store issued to site less what came back.',
      'The QS sets the norms, such as 8.2 bags of cement per cum of M25, with the wastage allowed. Items used beyond the allowance or well below theoretical are flagged, and approvers see the excess in rupees.',
      'Pick any period, open an item to see which BOQ items it went into, and export the whole reconciliation to Excel.',
    ],
  },
  {
    id: '2026-10-ai-controls',
    date: '2026-10-23',
    title: 'Ask Nirmaan: who uses it and what it costs',
    points: [
      'Admin > Ask Nirmaan shows each month by person (questions, documents read, briefs) and by feature, and you can look back over the last year.',
      'Admins can choose which roles may use Ask Nirmaan. Admins always can.',
      'A conversation log lets admins read any conversation and export them to Excel. Opening or exporting one is recorded in the audit log, and Ask Nirmaan tells people admins can read conversations.',
      'Ask Nirmaan is included in the price: an allowance in the free trial, then an amount per active project each month, shown under Admin > Subscription. If the trial or subscription ends, Ask Nirmaan pauses with the rest of the changes.',
    ],
  },
  {
    id: '2026-10-navigation',
    date: '2026-10-22',
    title: 'A shorter sidebar, in plain words',
    points: [
      'The sidebar shows the pages your role works with. A section you close stays closed for you, and the section of the page you are on opens by itself.',
      'Recent pages and records are in Search: press Ctrl K (⌘K on a Mac) and the ones you opened last come first, before you type.',
      'Each page has one name, the same in the sidebar, its heading, the browser tab and Search, such as Daily reports, Staff and leave and Payroll inputs. The first link is Home, and the subscription page under Admin is Subscription.',
      "A page's own New button is the one to press; New in the header starts an entry from any page. Buttons say New for a record you make, and Record, Report or Request for something that happened or that you ask for.",
    ],
  },
  {
    id: '2026-10-undo',
    date: '2026-10-22',
    title: 'Undo, and clearer messages',
    points: [
      'Deleting asks once, naming what goes, with a red Delete. It waits until it is done and says so there if it could not be deleted.',
      'After deleting a holiday, unit, client, vendor, worker, item, quotation, milestone, driver, checklist, close-out line or saved view, Undo brings it back for ten seconds. Ctrl Z (⌘Z on a Mac) does the same. Taking someone off a project team can be undone too.',
      'Saving a new entry says what was made, with View to open it.',
      'Approving shows the entry as approved straight away, one or many at once. If it does not go through, it goes back to waiting and the message says why.',
      'When you are offline or something goes wrong on our side, the message says so in plain words, with Retry. What you typed in a form stays there, with Try again.',
    ],
  },
  {
    id: '2026-10-photo-checks',
    date: '2026-10-22',
    title: 'Ask Nirmaan looks at site photos',
    points: [
      'Photos on a DPR, a progress entry, a safety incident or a snag get a short caption from Ask Nirmaan, under the photos.',
      'It flags what it is sure of: workers without helmets or harnesses, an open edge without a barricade, a scaffold that looks unsafe, or a photo of other work than the entry says. Flags are advice and never hold up a submission.',
      "The project's safety officer can switch the flags off for a project; captions still show.",
      'Reporting a snag, Describe from photo fills in what is wrong, the details, where and the trade from its photo. Check it, then save.',
    ],
  },
  {
    id: '2026-10-phone-lists',
    date: '2026-10-21',
    title: 'Lists that fit a phone',
    points: [
      'On a phone each list shows a card per entry with its name, status, amount and date. Tap a card to open it.',
      'Filters sit behind a Filters button that says how many are on, and open from the bottom of the screen.',
      'On a phone Approve, Submit and the other actions of an entry stay at the bottom of the screen while you read it. Help and Ask are in your account menu.',
      'Daily reports and the other main lists fit a laptop screen without scrolling sideways. Add any column back under Columns.',
      'Payables, receivables, GST and Tally lists page, choose columns and show as cards on a phone like every other list. Their search, filters and open tab stay in the address bar, as do the tabs inside Quality, Safety, Stock and the rest, and the Approvals search.',
    ],
  },
  {
    id: '2026-10-home-five-seconds',
    date: '2026-10-21',
    title: 'Home and project overview at a glance',
    points: [
      'My work puts what waits longest first: payments overdue, deliveries late, approvals waiting longest. Cards with nothing in them fold into one line.',
      'The approvals count shows once, in My work and the sidebar; its home tile now shows progress against plan.',
      'Figures read against their plan: done against planned, billed against the contract, cost against the work done.',
      'A month with nothing in it yet says so in words, such as "No bills raised in Oct yet", instead of a red 100% fall, and an empty chart says what will appear there.',
      'A project\'s overview opens with whether it is on track or behind, and why. Removing someone from the team is in the More menu by their name, and asks first.',
    ],
  },
  {
    id: '2026-10-ask-the-contract',
    date: '2026-10-21',
    title: 'Ask the contract',
    points: [
      'Ask Nirmaan now reads the PDFs you file in Documents (contracts, specifications, method statements, reports) and your letters in and out. Ask "What is the LD cap?", "Which clause allows price variation?" or "Did we notify the client about the land delay?".',
      'Answers quote the contract\'s own words with the document and page. The link opens the PDF at that page, with the page\'s text under it to copy.',
      'Only the current revision is searched, and you see only the projects and letters your role can see. A quote that is not in the document is flagged for you to check.',
    ],
  },
  {
    id: '2026-10-speed',
    date: '2026-10-20',
    title: 'Faster pages',
    points: [
      'Lists open faster: the server reads only what a list shows, and the browser asks once before calling it instead of before every call.',
      'Resting the pointer on a record or a sidebar link fetches it ahead, so it opens at once. The next page of a list keeps the current rows on screen until it arrives.',
      'Choosing a person, vendor, client, machine or item now searches as you type, instead of loading the whole list first.',
      'Home draws in one go without pushing things down, its charts load as you scroll to them, and every page shows its outline while it loads.',
    ],
  },
  {
    id: '2026-10-targets-type',
    date: '2026-10-20',
    title: 'Easier to hit, easier to read',
    points: [
      'Every button, field and tab is at least 24 px tall, also in compact, and grows to 44 px on a touch screen.',
      'Text follows one scale with 12 px as the smallest, so compact no longer shrinks it.',
      'Figures are plain text unless something needs a look: red or amber now only marks what is late, over budget, rejected or falling.',
    ],
  },
  {
    id: '2026-10-morning-brief',
    date: '2026-10-20',
    title: 'A morning brief, and a weekly summary for the client',
    points: [
      'Ask for a morning brief on your home page: three lines on what needs you today, such as approvals waiting more than two days, a warning from your watch list or payments due this week. Each line opens the page behind it.',
      'The brief also comes by email (inside the approvals digest when you get one) and, once your alerts are on, on WhatsApp. Turn it off from the brief whenever you like.',
      'The weekly progress report now opens with a short summary of the week, written from the report\'s own figures, and the client sees it in the portal too.',
      'Admin > Ask Nirmaan shows what this month\'s spend went on: questions, bill checks, documents read, and briefs and summaries.',
    ],
  },
  {
    id: '2026-10-watch-list',
    date: '2026-10-19',
    title: 'Watch list: early warnings',
    points: [
      'A Watch list card in My work, and its own page, warns ahead of trouble: an activity whose current rate puts its finish past the baseline, a cash gap in the next eight weeks (using how long each client actually takes to pay), stock that runs out before an order could arrive, vendors late or rejected more often, machines idle or breaking down more than the month before, and sites with no DPR three days running.',
      'Each warning shows its figures and links to the records behind it. Dismiss one with a reason and it stays dismissed for everyone until its figures move on.',
      'On Mondays a notification lists what is on your watch list.',
    ],
  },
  {
    id: '2026-10-phone-ask',
    date: '2026-10-19',
    title: 'Ask Nirmaan on the phone, in Hindi',
    points: [
      'The site app has an Ask tab: type, or tap the microphone on your keyboard and speak, in Hindi, English or Hinglish. With the app in Hindi, answers come in Hindi, and their links open the record on the phone.',
      'Dictate today\'s DPR: say the work done, manpower, machines and problems, and the DPR form opens filled in to check and send, through the outbox if the signal drops.',
    ],
  },
  {
    id: '2026-10-ask-drafts',
    date: '2026-10-18',
    title: 'Ask Nirmaan fills in forms',
    points: [
      'Write "Raise an MR for 200 bags of OPC 53 for the highway by Friday", in English, Hindi or Hinglish, and Ask Nirmaan drafts the material request with items from your item master. Open form to check it and submit.',
      'The same works for a site expense, a progress entry, a DPR from rough notes, and a letter, including the covering letter for an RA bill from the bill\'s own figures.',
      'Anything to check is marked amber, such as an item not in the master or a figure not found in your records. Nothing is saved until you submit.',
    ],
  },
  {
    id: '2026-10-keyboard',
    date: '2026-10-17',
    title: 'Every page named, and the keyboard reaches everything',
    points: [
      'Browser tabs and history show each page\'s name, and a record\'s own number on its page ("PO-2026-0012 · Tata Steel · Nirmaan").',
      'In any list, Tab to the rows, move with ↑ ↓ (or J K), press Enter to open one and X to tick it. Every record opens from the keyboard.',
      'Ask Nirmaan is now Alt J (⌘J on a Mac), since Ctrl J opens the browser\'s downloads. Single-key shortcuts such as J, K and ? can be turned off in Help > Keyboard shortcuts.',
      'Home charts say what they show in a line of words and switch to a table. Dark mode no longer flashes white on load, and animations stop when your device asks for less motion.',
    ],
  },
  {
    id: '2026-10-read-documents',
    date: '2026-10-17',
    title: 'Fill a form from a photo',
    points: [
      'With Ask Nirmaan on, Fill from invoice on a new vendor bill reads a photo or PDF of the invoice: number, date, lines, taxes and the order it belongs to. The bill\'s checks run before you save.',
      'Fill from challan on a GRN reads the challan and vehicle numbers and the quantities, and Fill from title block fills a new drawing\'s number, title and revision.',
      'Each value shows where on the page it came from, anything hard to read is marked Check this, and nothing is saved until you press Save. The scan is attached to the entry.',
    ],
  },
  {
    id: '2026-10-phone-field',
    date: '2026-10-17',
    title: 'The phone app, ready for site',
    points: [
      'A new DPR, progress entry, measurement or attendance sheet is kept on the phone as you type, through a call, the camera or the phone closing the app, and leaving asks whether to keep it.',
      'A failed submit scrolls up to a list of what to fix, reads it out and buzzes; approving or sending confirms the same way.',
      'On weak signal a submit gives up after 25 seconds and goes to the outbox instead of spinning. An entry the server refused opens again with Fix and send, and the outbox shows when it last sent.',
      'The app starts in the phone\'s language (Hindi or English, switchable on the first screens), dates and times use the phone\'s own pickers, fields have stronger outlines for sunlight, and dark mode switches at once.',
    ],
  },
  {
    id: '2026-10-forms',
    date: '2026-10-17',
    title: 'Forms that keep your work',
    points: [
      'Every form now warns before throwing away changes, whether you press Esc, the browser\'s Back, Ctrl K or a link. New entries keep a draft on this device.',
      'A failed save lists what needs fixing and says how ("Choose the project"); errors from the server show on the field they belong to.',
      'Amounts show in lakhs and crores with ₹, quantities show their unit, and phones open the number keypad for them.',
      'A new DPR starts from the previous report\'s manpower and machinery, says so, and Clear empties them.',
    ],
  },
  {
    id: '2026-10-bill-checks',
    date: '2026-10-17',
    title: 'Checks before you approve a bill',
    points: [
      'Vendor bills, subcontract bills, RA bills and site expenses open with a Checks section, also in the Approvals inbox: a tick for each check that passes, and a flag for what needs a look.',
      'Flags include a rate above the PO or work order, more billed than received or measured, a BOQ item past its contract quantity, an invoice billed twice, GST that does not add up, a mistyped GSTIN and cash above ₹10,000.',
      'With Ask Nirmaan on, the line on top is written for you from the flags. Whoever approves the bill can accept a flag with a note; the bill\'s activity keeps it.',
    ],
  },
  {
    id: '2026-10-ask-summaries',
    date: '2026-10-17',
    title: 'Ask Nirmaan summarises and explains',
    points: [
      'Summarise this week on a project page: work done against plan, DPRs, labour, machines, materials, bills, new risks and what waits for a decision, with a link to every record.',
      'Explain beside a delayed activity, the Gantt\'s behind count or a cost head over budget asks why, from progress, delay entries, breakdowns, orders and bills.',
      'What changed on an RA bill after the first compares it with the one before, item by item.',
    ],
  },
  {
    id: '2026-10-ux-fixes',
    date: '2026-10-17',
    title: 'Small things, fixed',
    points: [
      'Every entry\'s Activity shows who sent it and who reviewed it, including entries made before the full history was kept.',
      'The sign-in form starts empty and offers the email keyboard on phones; demo accounts show only on the demo site.',
      'A long project name stays on one line in the header, and green status tags and team initials read clearly in both themes.',
    ],
  },
  {
    id: '2026-10-ask-nirmaan',
    date: '2026-10-17',
    title: 'Ask Nirmaan',
    points: [
      'Ask a question about your company\'s records in plain words, in English or Hindi: the Ask button in the header, Ctrl J, or type a question in Ctrl K.',
      'The answer panel opens beside the page, which narrows to make room, so you can keep working with the answer in view.',
      'Answers come only from what your role can already see, with a link to every record used. A figure the assistant could not find in those records is flagged for you to check.',
      'It only reads: it cannot create, approve, pay or delete anything. Admins switch it on or off and set a monthly allowance under Admin > Ask Nirmaan.',
    ],
  },
  {
    id: '2026-10-phone-app',
    date: '2026-10-17',
    title: 'The phone app, polished',
    points: [
      'The phone app opens on My work, the same cards as the web home: what waits for your approval, DPRs not yet sent, entries sent back to you.',
      'Dark mode under Profile > Appearance (or the same as the phone), and text that grows with the phone\'s text size without breaking the layout.',
      'On the Approvals tab, swipe a row left to approve it after a confirm, with an optional note. Lists show their outline while they load, and record actions open in a sheet from the bottom.',
    ],
  },
  {
    id: '2026-10-accessibility',
    date: '2026-10-17',
    title: 'Easier to read and to use from the keyboard',
    points: [
      'Quieter text, status tags, badges and figures are a shade darker in light mode and a shade brighter in dark mode, so they read clearly on every background.',
      'The first Tab on any page offers Skip to content, and whatever has keyboard focus now always shows a ring.',
      'Filters, search boxes and progress bars say what they are to screen readers. Help > Keyboard shortcuts lists every shortcut.',
    ],
  },
  {
    id: '2026-10-page-states',
    date: '2026-10-17',
    title: 'Clearer loading, empty and error pages',
    points: [
      'Pages and lists show their outline while they load instead of a spinner, so nothing jumps when the data arrives.',
      'An empty list says what goes there and offers the button to add the first one; a list filtered down to nothing offers Clear filters.',
      'A page you may not open, an entry that is not there, and losing the connection each get their own page with a way back, and a page that fails shows a code to quote to support.',
    ],
  },
  {
    id: '2026-10-notifications-centre',
    date: '2026-10-17',
    title: 'A notifications centre',
    points: [
      'The bell opens a panel with three tabs: For me (your entries approved or sent back, drawings issued, risks, snags), Approvals (what waits on your decision) and Reminders (missing DPRs, tests, stock, payments and papers falling due), each with its own unread count.',
      'Notifications are grouped by day, and Mark all read clears just the tab you are on.',
      'A notification about an entry opens it right there, over the page you are on, so you do not lose your place.',
      'Notices about the company, such as a read-only account, a scheduled deletion or being offline, now share one bar at the top of the page instead of stacking up.',
    ],
  },
  {
    id: '2026-10-search-everything',
    date: '2026-10-17',
    title: 'Search finds records, not just pages',
    points: [
      'Ctrl K (or the search box at the top) now finds material requests, purchase orders, bills, MB sheets, expenses, inspections, risks, documents, vendors, clients, items and people by number or name, showing only what your lists would show you.',
      'Before you type, it lists the records you opened lately.',
      'Type an action to start it: “new DPR”, “prepare RA bill”, or “new DPR for Jajpur” to open the form on that project.',
    ],
  },
  {
    id: '2026-10-lists-registers',
    date: '2026-10-17',
    title: 'Registers, stores, staff and machinery lists',
    points: [
      'The delay and risk register and the variations list have views across the top (Delays, Overdue, Not sent, With the client…) that can be saved and shared, and their filters go in the address bar.',
      'Quality tests, NCRs, safety incidents, permits, toolbox talks, documents, letters, transmittals, stock, the stock register, staff, leave, attendance, workers, the machine list, job cards, papers and drivers now work like the other lists: chips for the filters, columns you pick, a click on the row to open it, and page totals.',
      'Where a list could already be exported, you can now tick rows and export just those.',
    ],
  },
  {
    id: '2026-10-lists-masters',
    date: '2026-10-16',
    title: 'Projects, clients, vendors and users lists',
    points: [
      'Projects, clients, vendors and users have views across the top (Active projects, Subcontractors, Inactive users…) that can be saved and shared, and their filters go in the address bar as chips.',
      'Pick the columns you want, tick rows to export them, and click a row to open the project or edit the vendor, client or user.',
      'The payments list in Payables and the receipts list in Receivables add up the page, and a bill there opens its own page with Ctrl or Cmd click.',
    ],
  },
  {
    id: '2026-10-records-all-types',
    date: '2026-10-16',
    title: 'Every entry has its own page',
    points: [
      'Vendor bills, work orders, subcontractor bills, site expenses, measurements, machinery logs and inspections open as a page of their own, with the stage bar, sections and activity, at an address you can bookmark or send.',
      'In Approvals, these entries now show whole beside the queue, as daily reports and bills already did.',
      'In a list, Ctrl or Cmd click on an entry opens its page in a new tab; a plain click still opens the quick look.',
    ],
  },
  {
    id: '2026-10-lists-approvals',
    date: '2026-10-16',
    title: 'Every approval list works the same way',
    points: [
      'Vendor bills, work orders, subcontractor bills, site expenses, the measurement book, machinery logs and inspections now have views across the top (Waiting for me, Mine, Sent back, This week) and can be saved and shared.',
      'Their filters go in the address bar, so a filtered list can be bookmarked or sent, and show as chips you can take off one by one.',
      'Pick the columns you want, click a row to open it, tick rows to approve or export them together, and see the page total under the figures.',
      'Vendor bills, work orders and subcontractor bills can now be filtered by date and by who entered them.',
    ],
  },
  {
    id: '2026-10-forms-v2',
    date: '2026-10-16',
    title: 'Roomier forms that keep what you type',
    points: [
      'Daily reports, material requests, purchase orders, work orders, risks and vendors open in a large panel with sections; the buttons stay at the bottom.',
      'A new entry is kept on this device as you type, so a refresh or a closed tab does not lose it. Start over clears it.',
      'Closing a form with changes asks first, and a failed submit lists what still needs filling, with a link to each field.',
      'Ctrl Enter submits. In line tables (manpower, machinery, items) Enter moves down a line and adds one at the end.',
    ],
  },
  {
    id: '2026-10-home-by-role',
    date: '2026-10-16',
    title: 'A home page made for your job',
    points: [
      'My work, at the top, lists what waits for you: approvals, daily reports not filed today, entries sent back, bills awaiting payment, payments due, expiring guarantees, late deliveries and low stock.',
      'Directors, project managers, accounts, stores, quantity surveyors and site staff each see the figures and charts they use most, first.',
      'Figures show this month against last with a six-month trend line.',
      'New charts: planned against actual progress, cash in and out, billed against contract, and cost by head.',
    ],
  },
  {
    id: '2026-10-approvals-inbox',
    date: '2026-10-16',
    title: 'Approvals is now an inbox',
    points: [
      'What waits for you is on the left, grouped by type; the entry you pick opens beside it with Approve, Request changes and Reject underneath.',
      'Decide and the next entry opens by itself. J and K move through the queue, A approves, C asks for changes and R rejects.',
      'Tick entries of one type, or a whole group, and approve them together. Each is approved as if one by one, so its submitter hears and its history shows it.',
      'Approved today, at the top, lists what you approved, rejected or sent back since midnight.',
    ],
  },
  {
    id: '2026-10-record-pages',
    date: '2026-10-16',
    title: 'Every report, request, order and bill has its own page',
    points: [
      'Daily reports, progress entries, material requests, purchase orders and RA bills open on their own page, with a link you can copy and send.',
      'A bar across the top shows where it stands: drafted, submitted, approved, and for bills sent, certified and paid.',
      'Jump to a section from the bar above them; who did what and when is beside them, and the actions stay at the bottom of the screen.',
      'Clicking a row still opens the quick look; Open full page is at its top and in the row menu, and Ctrl click opens the page in a new tab.',
    ],
  },
  {
    id: '2026-10-project-workspace',
    date: '2026-10-16',
    title: 'A tidier project page',
    points: [
      'A project\'s 25 tabs are now six groups: Overview, Plan, Site, Materials, Money and Handover, with the tabs of each group underneath.',
      'The header shows how the project is doing: activities running late, cost against work done, and how much of that work is billed.',
      'Scroll down and the groups stay at the top with the project\'s name, and table headers stay under them.',
      'A project opens on the tab you last used on it, and each group on its last tab.',
    ],
  },
  {
    id: '2026-10-lists',
    date: '2026-10-16',
    title: 'Better lists',
    points: [
      'Daily reports, progress, material requests, purchase orders and RA bills have views across the top: Waiting for me, Mine, Sent back, This week.',
      'Save your own filters as a view, and share it with the company if it helps others.',
      'Filter by dates, hide the columns you do not need, and click anywhere on a row to open it.',
      'Tick rows to approve or export several at once. Money lists show a total for the page.',
      'The filters are in the address bar, so a filtered list can be bookmarked or sent to someone.',
    ],
  },
  {
    id: '2026-10-shell',
    date: '2026-10-16',
    title: 'A new header',
    points: [
      'Pick a project at the top left and every list shows that project only, until you switch back to All projects.',
      '+ New starts a daily report, progress entry, material request and more from any page.',
      'Star a page or a project to keep it under Favourites in the sidebar; Recent has the last few you opened.',
      'Help has the keyboard shortcuts (press ?), these notes and the tour.',
    ],
  },
  {
    id: '2026-10-appearance',
    date: '2026-10-16',
    title: 'Dark mode and compact density',
    points: ['Your name at the top right > Appearance: Light, Dark or the same as your device.', 'Density: Compact fits more rows on a screen.'],
  },
  {
    id: '2026-10-review',
    date: '2026-10-16',
    title: 'Tidier pages',
    points: ['The header says where you are.', 'Stock tables show item names in full.', 'Approvals say how long ago each entry was sent.'],
  },
];
