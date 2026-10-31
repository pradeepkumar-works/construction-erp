/**
 * Three sample contracts for the demo company, one per demo project, and the questions they are tested
 * with. The seed files them as CONTRACT documents with a generated text PDF, and `src/scripts/contract-search-test.ts`
 * checks that each question finds its clause on the expected page. The terms match the projects' contract terms in the
 * seed (retention, advance, defects liability, price variation, liquidated damages).
 *
 * Text is plain ASCII ("Rs." for rupees), because the generated PDF uses the standard Helvetica font. A page is a list
 * of paragraphs; a paragraph starting with "# " is a heading.
 */

export interface DemoContract {
  /** The project's `type` in the seed */
  projectType: 'ROAD' | 'BUILDING' | 'WATER_SUPPLY';
  docNo: string;
  title: string;
  from: string;
  pages: string[][];
}

export interface ContractQuestion {
  docNo: string;
  question: string;
  /** 1-based page the answer is on */
  page: number;
  /** Words that must be on that page */
  phrase: string;
}

export const DEMO_CONTRACTS: DemoContract[] = [
  {
    projectType: 'ROAD',
    docNo: 'RD-AGR-01',
    title: 'EPC Agreement: four-laning of Bhubaneswar - Puri Road, Km 12 to Km 28',
    from: 'Odisha Works Department',
    pages: [
      [
        '# AGREEMENT No. 04/EE/R&B/2025-26',
        'This Agreement is made between the Governor of Odisha, acting through the Executive Engineer, R&B Division, Khordha (the "Authority"), and Nirmaan Demo Constructions Pvt. Ltd. (the "Contractor"), for the widening to four lanes of the Bhubaneswar - Puri Road from Km 12 to Km 28 on Engineering, Procurement and Construction (EPC) basis.',
        '# Article 1. Definitions',
        '1.1 "Appointed Date" means the date on which the Authority hands over the first stretch of the Right of Way and issues the notice to proceed. "Authority Engineer" means LEA Associates, appointed by the Authority to supervise the works. "Contract Price" means the lump sum price stated in Article 3. "Scheduled Completion Date" means the date 360 days after the Appointed Date.',
        '1.2 Words in the singular include the plural. Headings are for convenience and do not affect the meaning of any clause.',
        '# Article 2. Scope of the project',
        '2.1 The Contractor shall design, procure and construct the four-lane carriageway, service roads, pipe culverts, minor bridges, drains, road furniture and junctions described in Schedule B, and shall maintain the works during the Defects Liability Period.',
        '2.2 The Contractor shall obtain all approvals that are its responsibility under Schedule E, including consents for batching plants, quarries and borrow areas.',
        '# Article 3. Contract Price',
        '3.1 The Contract Price is Rs. 18,65,00,000 (Rupees Eighteen Crore Sixty Five Lakh only), exclusive of GST, for completing the works within the time set out in this Agreement. The Contract Price is subject only to the price adjustment in Clause 14 and to change of scope under Clause 20.',
        '3.2 The Contract Price shall be paid in stages in the proportions of Schedule H, against stage payment statements under Clause 16.',
      ],
      [
        '# Clause 5. Performance security',
        '5.1 Within 15 days of the date of this Agreement the Contractor shall furnish a performance security of 5% (five per cent) of the Contract Price, in the form of an unconditional bank guarantee from a scheduled bank.',
        '5.2 The performance security shall remain valid until 60 days after the end of the Defects Liability Period. If the Contractor fails to extend it, the Authority may encash it.',
        '# Clause 6. Mobilisation advance',
        '6.1 On request the Authority shall pay a mobilisation advance of up to 5% (five per cent) of the Contract Price, against a bank guarantee for 110% of the advance.',
        '6.2 The advance carries simple interest at 10% per annum on the amount outstanding.',
        '6.3 The advance shall be recovered by deducting 10% of the amount of each interim payment, starting from the first stage payment, until the advance and interest are fully recovered. Any balance shall be recovered before 90% of the Contract Price has been paid.',
        '# Clause 7. Obligations of the Contractor',
        '7.1 The Contractor shall execute the works in accordance with the Specifications and Standards (MoRTH Specifications for Road and Bridge Works, fifth revision) and Good Industry Practice.',
        '7.2 The Contractor shall keep a hindrance register at site, signed weekly by the Authority Engineer, recording every event that stops or slows the works.',
        '7.3 The Contractor shall provide traffic management, signage and barricading at every work zone, and shall be liable for any accident caused by its failure to do so.',
      ],
      [
        '# Clause 8. Right of Way',
        '8.1 The Authority shall hand over the Right of Way free from encroachments: at least 90% of the length on the Appointed Date, and the balance within 150 days of the Appointed Date.',
        '8.2 If any part of the Right of Way is not handed over in time, or is lost to encroachment, land acquisition or utility shifting, the Contractor shall be entitled to an extension of time for the affected work and to the cost of idle resources certified by the Authority Engineer.',
        '# Clause 9. Notice of hindrance',
        '9.1 The Contractor shall give the Authority Engineer written notice of any hindrance, including delay in handing over land, within 14 days of the hindrance arising, stating its cause and the work held up. A hindrance not notified within 14 days shall not be considered for extension of time.',
        '9.2 While a hindrance lasts the Contractor shall send a fortnightly update with the length and work affected.',
        '# Clause 10. Extension of time',
        '10.1 The Contractor may claim an extension of time for delay caused by the Authority, by a Change of Scope or by Force Majeure. The claim shall be made within 28 days of the end of the hindrance, with the hindrance register entries and the programme showing the critical path.',
        '10.2 The Authority shall decide the claim within 30 days. Extension granted for delay not attributable to the Contractor shall be without liquidated damages.',
        '# Clause 11. Programme',
        '11.1 The Contractor shall submit its programme within 15 days of the Appointed Date, showing the milestones of Schedule J, and shall revise it whenever actual progress falls behind by more than 30 days.',
      ],
      [
        '# Clause 12. Liquidated damages',
        '12.1 If the Contractor fails to achieve a milestone or the Scheduled Completion Date, it shall pay the Authority liquidated damages of 0.5% (half per cent) of the Contract Price for each week of delay, or part of a week.',
        '12.2 Liquidated damages shall not exceed a maximum of 10% (ten per cent) of the Contract Price. Damages recovered for a milestone are refunded if the next milestone and the Scheduled Completion Date are met.',
        '12.3 Liquidated damages may be deducted from any payment due to the Contractor or recovered from the performance security.',
        '# Clause 13. Bonus for early completion',
        '13.1 If the works are completed more than 30 days before the Scheduled Completion Date, the Contractor shall be paid a bonus of 0.03% of the Contract Price for each day saved, up to a maximum of 3% of the Contract Price.',
        '# Clause 14. Price adjustment',
        '14.1 The Contract Price shall be adjusted for increase or decrease in the cost of labour, materials and fuel by the price adjustment formula below, applied to the value of each stage payment.',
        '14.2 The components of the Contract Price are: labour 15%, cement 10%, steel 10%, bitumen 15%, fuel and lubricants (POL) 10%, other materials 30%, and a fixed part of 10% that is not adjusted.',
        '14.3 Labour is adjusted by the Consumer Price Index for industrial workers, cement, steel and other materials by the Wholesale Price Index for each, bitumen by the price of the IOC refinery at Paradip, and POL by the price of high speed diesel at Bhubaneswar. The base index is the one current 28 days before the last date of bid submission.',
      ],
      [
        '# Clause 16. Payments',
        '16.1 The Contractor shall submit a stage payment statement each month for the stages completed, in the form of Schedule H, with the measurements and test reports.',
        '16.2 The Authority Engineer shall verify and certify the statement within 10 days. The Authority shall pay the certified amount within 30 days of receiving the statement.',
        '16.3 A payment delayed beyond 30 days carries interest at the State Bank of India one-year MCLR plus 2% per annum for the period of delay.',
        '16.4 Retention money of 5% (five per cent) shall be deducted from each stage payment. Half of the retention money shall be released on the issue of the Completion Certificate and the other half at the end of the Defects Liability Period.',
        '# Clause 17. Taxes and deductions',
        '17.1 GST at the rate in force (18% on the date of this Agreement) shall be paid in addition to the Contract Price.',
        '17.2 The Authority shall deduct income tax at source at 2%, GST TDS at 2% and the building and other construction workers welfare cess at 1% from every payment.',
        '# Clause 18. Quality assurance',
        '18.1 The Contractor shall set up a field laboratory within 30 days of the Appointed Date and carry out the tests in the Quality Assurance Plan. The Authority Engineer may test any material at any time; material that fails shall be removed at the Contractor\'s cost.',
      ],
      [
        '# Clause 19. Defects liability',
        '19.1 The Defects Liability Period is 24 months from the date of the Completion Certificate. During this period the Contractor shall make good at its own cost any defect in the works within 15 days of notice.',
        '# Clause 20. Change of scope',
        '20.1 The Authority may require a change of scope up to 10% of the Contract Price without renegotiating the price. The change is valued at the rates of the Schedule of Rates of the Works Department current on the date of the change order, or at agreed rates where no rate exists.',
        '20.2 A change of scope beyond 10% of the Contract Price needs the Contractor\'s consent.',
        '# Clause 21. Force majeure',
        '21.1 Neither party is liable for failure to perform caused by a Force Majeure event, such as flood, cyclone, earthquake, epidemic or war, provided notice is given within 7 days of its occurrence.',
        '# Clause 22. Termination',
        '22.1 The Authority may terminate this Agreement for Contractor default, including abandonment of the works or failure to achieve progress, after a 30 day notice to cure that the Contractor fails to remedy. The performance security shall then be encashed.',
        '# Clause 23. Dispute resolution',
        '23.1 Any dispute shall first be referred to conciliation by the Chief Engineer within 30 days. A dispute not resolved by conciliation shall be settled by arbitration under the Arbitration and Conciliation Act, 1996, by a tribunal of three arbitrators. The seat of arbitration is Bhubaneswar.',
        '# Clause 24. Insurance',
        '24.1 The Contractor shall take out a contractor\'s all risk policy for the full Contract Price and third party insurance, valid until the Completion Certificate.',
      ],
    ],
  },
  {
    projectType: 'BUILDING',
    docNo: 'HB-AGR-01',
    title: 'Contract agreement: District Hospital Block B (G+3), Cuttack',
    from: 'Dept. of Health & Family Welfare',
    pages: [
      [
        '# AGREEMENT No. 17/CDMO/2025-26 (ITEM RATE CONTRACT)',
        'This item rate contract is made between the Chief District Medical Officer, Cuttack, for the Department of Health and Family Welfare (the "Department"), and Nirmaan Demo Constructions Pvt. Ltd. (the "Contractor"), for the construction of District Hospital Block B, ground and three upper floors, at Cuttack.',
        '# Clause 1. Tendered value and time',
        '1.1 The tendered value of the work is Rs. 9,42,00,000 (Rupees Nine Crore Forty Two Lakh only). The Contractor shall be paid for the quantities actually executed at the rates in the accepted schedule of quantities.',
        '1.2 The time allowed for completion is 390 days from the date of start, which is the 15th day after the letter of acceptance, or the day the site is handed over, whichever is later.',
        '# Clause 1A. Security deposit and performance guarantee',
        '1A.1 A security deposit of 2.5% (two and a half per cent) shall be deducted from each running account bill. It shall be refunded after the Defects Liability Period.',
        '1A.2 The Contractor shall furnish a performance guarantee of 3% of the tendered value within 15 days of the letter of acceptance, valid until 60 days after the Defects Liability Period.',
        '# Clause 1B. Advances',
        '1B.1 No mobilisation advance is payable under this contract. No advance shall be paid for plant and machinery.',
        '1B.2 A secured advance of up to 75% of the value of non-perishable materials brought to site may be paid against an indemnity bond, to be recovered when the material is used.',
      ],
      [
        '# Clause 2. Compensation for delay',
        '2.1 If the Contractor fails to maintain the required progress or to complete the work by the stipulated date, it shall pay compensation at 0.5% (half per cent) of the tendered value for every week of delay.',
        '2.2 The total compensation for delay shall not exceed 10% (ten per cent) of the tendered value. The Engineer-in-Charge shall decide the compensation, and it may be recovered from any bill.',
        '# Clause 5. Time and extension for delay',
        '5.1 The Contractor shall record every hindrance in the hindrance register kept at site. If the work is delayed by a cause beyond the Contractor\'s control, such as late drawings, late decisions or extra work, the Contractor shall apply for extension of time within 14 days of the hindrance, with the register entries.',
        '5.2 The Engineer-in-Charge shall grant a fair extension within 30 days, and his decision shall be final unless referred to arbitration.',
        '# Clause 6. Drawings and instructions',
        '6.1 The Architect, Shilpa Architects, shall issue working drawings in good time. The Contractor shall request any drawing at least 21 days before it is needed, and the Architect shall issue it within 14 days of the request.',
        '6.2 Revised drawings issued after the work shown on them has started are a cause of delay under Clause 5, and work rendered useless by them shall be paid as extra work.',
      ],
      [
        '# Clause 7. Running account bills and payment',
        '7.1 The Contractor shall submit a running account bill every month for the work measured, recorded in the measurement book by the Junior Engineer and checked by the Assistant Engineer.',
        '7.2 The Department shall pay a running account bill within 30 days of its submission, less the security deposit, taxes and any recoveries. Running payments are advances against the final bill.',
        '7.3 Retention money of 5% (five per cent) shall be deducted from each running account bill, in addition to the security deposit, and released with the final bill.',
        '# Clause 9. Final bill',
        '9.1 The final bill shall be submitted within 3 months of the completion of the work, with all measurements, and shall be paid within 6 months of its submission after it has been checked.',
        '# Clause 10CC. Price escalation',
        '10CC.1 Clause 10CC (price escalation for increase in prices of materials and wages) is not applicable to this contract. The rates are firm for the whole period of the contract, including any extension of time, and no claim for escalation shall be entertained.',
      ],
      [
        '# Clause 12. Deviations',
        '12.1 The Engineer-in-Charge may order additions, omissions and alterations. Deviations up to 10% of the tendered value shall be paid at the contract rates.',
        '12.2 For items beyond the deviation limit, and for extra items, rates shall be derived from the Odisha Schedule of Rates current at the time, with the tender percentage applied, or from market rates plus 15% for overheads and profit where no schedule rate exists.',
        '# Clause 15. Quality of work',
        '15.1 Cement concrete shall be tested by cube tests: one set of six cubes for every 50 cubic metres or part of each grade placed in a day. Cubes shall be tested at 7 and 28 days in the site laboratory or an NABL accredited laboratory.',
        '15.2 Work found defective shall be removed and redone at the Contractor\'s cost. The Department may engage a third-party quality auditor, whose observations the Contractor shall comply with within 15 days.',
        '# Clause 17. Defects liability',
        '17.1 The Defects Liability Period is 12 months from the date of completion recorded by the Engineer-in-Charge. The Contractor shall make good any defect noticed during this period at its own cost.',
      ],
      [
        '# Clause 19. Labour, safety and welfare',
        '19.1 The Contractor shall comply with the Building and Other Construction Workers Act. The welfare cess of 1% shall be deducted from every bill. Income tax at 2% and GST TDS at 2% shall also be deducted at source.',
        '19.2 The Contractor shall provide safety helmets, harnesses for work at height, scaffolds with toe boards and a first aid box, and shall report any accident to the Engineer-in-Charge within 24 hours.',
        '# Clause 21. Termination',
        '21.1 The Department may terminate the contract if the Contractor abandons the work, fails to start within 30 days, or fails to maintain progress after a 15 day notice. The security deposit and performance guarantee shall then be forfeited.',
        '# Clause 25. Settlement of disputes and arbitration',
        '25.1 Any dispute shall first be referred to the Superintending Engineer, who shall decide within 30 days. If the Contractor is not satisfied, the dispute shall be referred to a sole arbitrator appointed by the Chief Engineer, under the Arbitration and Conciliation Act, 1996. Claims above 20% of the tendered value are not arbitrable. The seat of arbitration is Cuttack.',
      ],
    ],
  },
  {
    projectType: 'WATER_SUPPLY',
    docNo: 'WS-AGR-01',
    title: 'EPC contract with O&M: Jajpur Rural Piped Water Supply Scheme (JJM)',
    from: 'RWSS Odisha (Jal Jeevan Mission)',
    pages: [
      [
        '# AGREEMENT No. 09/EE/RWSS/2025-26',
        'This contract is made between the Executive Engineer, RWSS Division, Jajpur, for Rural Water Supply and Sanitation Odisha under the Jal Jeevan Mission (the "Employer"), and Nirmaan Demo Constructions Pvt. Ltd. (the "Contractor"), for the design, construction, commissioning and five years of operation and maintenance of the Jajpur Rural Piped Water Supply Scheme.',
        '# Section 1. Scope and price',
        '1.1 The works comprise the intake well, the raw water main, a 12 MLD water treatment plant, 14 elevated service reservoirs (ESR), the clear water rising main, the distribution network and functional household tap connections in 86 villages.',
        '1.2 The contract price is Rs. 31,20,00,000 (Rupees Thirty One Crore Twenty Lakh only) for the construction, exclusive of GST, plus the operation and maintenance charges of Schedule F.',
        '1.3 The construction period is 570 days from the date of commencement. It is followed by a trial run of 3 months and operation and maintenance for 5 years.',
        '# Section 2. Mobilisation advance',
        '2.1 A mobilisation advance of 10% (ten per cent) of the contract price shall be paid against a bank guarantee of equal value, in two equal instalments.',
        '2.2 The advance bears simple interest at 9% per annum. It shall be recovered at 12% (twelve per cent) of the gross amount of each running bill, starting from the first bill, until fully recovered with interest.',
      ],
      [
        '# Section 3. Payment by milestones',
        '3.1 The contract price shall be paid against the following milestones: water treatment plant 25%, elevated service reservoirs 20%, raw water and clear water mains and the distribution network 40%, functional household tap connections 10%, and trial run and commissioning 5%.',
        '3.2 Within each milestone, payment is made in the stages of Schedule C, against a running bill each month. The Employer shall pay a running bill within 30 days of its certification by the Project Management Consultant, WAPCOS.',
        '3.3 Retention money of 5% (five per cent) shall be deducted from each running bill. It shall be released after the trial run, on submission of a bank guarantee of equal value valid until the end of the Defects Liability Period.',
        '# Section 4. Permissions and crossings',
        '4.1 The Contractor shall prepare and submit the applications for crossing railway lines, national highways, state highways and canals. The Employer shall pursue the applications with the railway, NHAI, the Works Department and the Water Resources Department, and shall pay the fees and deposits charged by them.',
        '4.2 Delay in obtaining a crossing permission beyond 90 days of a complete application shall entitle the Contractor to an extension of time for the work held up, but not to any compensation.',
      ],
      [
        '# Section 5. Liquidated damages',
        '5.1 For delay in completing a milestone or the whole work, the Contractor shall pay liquidated damages of 0.5% (half per cent) of the contract price for each week of delay.',
        '5.2 The total liquidated damages shall not exceed 10% (ten per cent) of the contract price.',
        '# Section 6. Price adjustment',
        '6.1 The contract price shall be adjusted for changes in the cost of inputs by the formula of Schedule G. The components are: DI and HDPE pipes 35%, cement 8%, steel 10%, labour 15%, fuel 5%, other materials 17%, and a fixed part of 10%.',
        '6.2 Pipes are adjusted by the Wholesale Price Index for iron and steel pipes and for plastic pipes, cement and steel by their Wholesale Price Index, labour by the Consumer Price Index for industrial workers, and fuel by the price of high speed diesel. The base month is the month before the last date of bid submission.',
        '6.3 Price adjustment applies only to work done within the construction period and any extension not attributable to the Contractor.',
      ],
      [
        '# Section 7. Testing of pipelines',
        '7.1 Every section of pipeline shall be hydraulically tested before backfilling the joints, at 1.5 times the working pressure of the pipe or the design pressure, whichever is higher, held for 2 hours without loss.',
        '7.2 Gravity mains and the distribution network shall also be tested for leakage. The allowable leakage shall not exceed the limits of IS 3114 for DI pipes and IS 4985 for HDPE pipes.',
        '7.3 A section that fails the test shall be repaired and tested again at the Contractor\'s cost.',
        '# Section 8. Trial run and commissioning',
        '8.1 After completing the works the Contractor shall run the whole scheme for a trial run of 3 months, supplying at least 55 litres per person per day to every connected household, with water quality meeting IS 10500.',
        '8.2 The commissioning certificate shall be issued at the end of a successful trial run.',
      ],
      [
        '# Section 9. Defects liability, operation and maintenance',
        '9.1 The Defects Liability Period is 12 months from the commissioning certificate.',
        '9.2 After the trial run the Contractor shall operate and maintain the scheme for 5 years, including staff, power, chemicals, repairs and water quality testing, at the rates of Schedule F. O&M payments are made quarterly against the service levels achieved.',
        '# Section 10. Dispute resolution',
        '10.1 Disputes shall be referred to a Dispute Resolution Board of three members, which shall give its decision within 84 days. A party not satisfied with the decision may refer the dispute to arbitration under the Arbitration and Conciliation Act, 1996. The seat of arbitration is Bhubaneswar.',
        '# Section 11. Deductions',
        '11.1 Income tax at 2%, GST TDS at 2% and the labour welfare cess at 1% shall be deducted from every running bill. GST at 18% is paid in addition to the contract price.',
      ],
    ],
  },
];

/** Thirty questions, ten per contract, with the page and words the answer is in. */
export const CONTRACT_QUESTIONS: ContractQuestion[] = [
  { docNo: 'RD-AGR-01', question: 'What is the LD cap?', page: 4, phrase: 'maximum of 10%' },
  { docNo: 'RD-AGR-01', question: 'How much are the liquidated damages per week of delay?', page: 4, phrase: '0.5% (half per cent) of the Contract Price for each week' },
  { docNo: 'RD-AGR-01', question: 'Which clause allows price variation?', page: 4, phrase: 'Clause 14. Price adjustment' },
  { docNo: 'RD-AGR-01', question: 'What is the defects liability period?', page: 6, phrase: 'Defects Liability Period is 24 months' },
  { docNo: 'RD-AGR-01', question: 'How is the mobilisation advance recovered?', page: 2, phrase: 'deducting 10% of the amount of each interim payment' },
  { docNo: 'RD-AGR-01', question: 'How much performance security do we have to give?', page: 2, phrase: 'performance security of 5%' },
  { docNo: 'RD-AGR-01', question: 'Within how many days must we notify a hindrance?', page: 3, phrase: 'within 14 days of the hindrance arising' },
  { docNo: 'RD-AGR-01', question: 'What happens if the right of way is not handed over in time?', page: 3, phrase: 'entitled to an extension of time' },
  { docNo: 'RD-AGR-01', question: 'How many days does the Authority have to pay our bill?', page: 5, phrase: 'within 30 days of receiving the statement' },
  { docNo: 'RD-AGR-01', question: 'Where is the seat of arbitration for disputes?', page: 6, phrase: 'seat of arbitration is Bhubaneswar' },

  { docNo: 'HB-AGR-01', question: 'What is the security deposit percentage?', page: 1, phrase: 'security deposit of 2.5%' },
  { docNo: 'HB-AGR-01', question: 'Is there any price escalation clause?', page: 3, phrase: 'is not applicable to this contract' },
  { docNo: 'HB-AGR-01', question: 'Can we get a mobilisation advance?', page: 1, phrase: 'No mobilisation advance is payable' },
  { docNo: 'HB-AGR-01', question: 'What is the maximum compensation for delay?', page: 2, phrase: 'shall not exceed 10% (ten per cent) of the tendered value' },
  { docNo: 'HB-AGR-01', question: 'Up to what limit are deviations paid at contract rates?', page: 4, phrase: 'Deviations up to 10% of the tendered value' },
  { docNo: 'HB-AGR-01', question: 'How long is the defects liability period?', page: 4, phrase: 'Defects Liability Period is 12 months' },
  { docNo: 'HB-AGR-01', question: 'Who appoints the arbitrator?', page: 5, phrase: 'sole arbitrator appointed by the Chief Engineer' },
  { docNo: 'HB-AGR-01', question: 'How quickly must the architect issue a drawing we ask for?', page: 2, phrase: 'within 14 days of the request' },
  { docNo: 'HB-AGR-01', question: 'When must the final bill be submitted?', page: 3, phrase: 'within 3 months of the completion' },
  { docNo: 'HB-AGR-01', question: 'How often do we have to take concrete cube samples?', page: 4, phrase: 'one set of six cubes for every 50 cubic metres' },

  { docNo: 'WS-AGR-01', question: 'What interest is charged on the mobilisation advance?', page: 1, phrase: 'simple interest at 9% per annum' },
  { docNo: 'WS-AGR-01', question: 'At what rate is the advance recovered from bills?', page: 1, phrase: 'recovered at 12% (twelve per cent)' },
  { docNo: 'WS-AGR-01', question: 'How many years of O&M are in the contract?', page: 5, phrase: 'operate and maintain the scheme for 5 years' },
  { docNo: 'WS-AGR-01', question: 'What is the hydraulic test pressure for pipelines?', page: 4, phrase: '1.5 times the working pressure' },
  { docNo: 'WS-AGR-01', question: 'Who is responsible for getting the railway crossing permission?', page: 2, phrase: 'crossing railway lines' },
  { docNo: 'WS-AGR-01', question: 'How much is paid for the elevated service reservoirs milestone?', page: 2, phrase: 'elevated service reservoirs 20%' },
  { docNo: 'WS-AGR-01', question: 'What is the cap on liquidated damages?', page: 3, phrase: 'shall not exceed 10% (ten per cent) of the contract price' },
  { docNo: 'WS-AGR-01', question: 'Which index is used to adjust the price of pipes?', page: 3, phrase: 'Wholesale Price Index for iron and steel pipes' },
  { docNo: 'WS-AGR-01', question: 'When is the retention money released?', page: 2, phrase: 'released after the trial run' },
  { docNo: 'WS-AGR-01', question: 'How long is the trial run?', page: 4, phrase: 'trial run of 3 months' },
];

/** Letters in the demo, asked about by subject (their text is the letter's own subject and summary). */
export const LETTER_QUESTIONS: { question: string; subject: string }[] = [
  { question: 'Did we notify the client about the land delay?', subject: 'Hindrance: encroachment inside the ROW at Ch 12+300 to 12+650' },
  { question: 'Have we asked for an extension of time for the encroachment?', subject: 'Request for extension of time: encroachment at Ch 12+300' },
];

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 56;
const SIZE = 10;
const LEADING = 13.5;
const WRAP = 92;

function wrap(text: string, width = WRAP): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if (line && line.length + 1 + word.length > width) {
      out.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
}

/**
 * A text PDF (A4, Helvetica) with one page per entry of `pages`, a running title at the top and "Page n of m" at the
 * bottom, so its text can be read back by page. Lines past the bottom margin are dropped, so keep pages short.
 */
export function textPdf(title: string, pages: string[][]): Buffer {
  const esc = (t: string) => t.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, '-');
  const streams = pages.map((paragraphs, i) => {
    const ops: string[] = [`BT /F1 8 Tf ${MARGIN} ${PAGE_H - 36} Td (${esc(title)}) Tj ET`];
    let y = PAGE_H - MARGIN - 10;
    for (const p of paragraphs) {
      const heading = p.startsWith('# ');
      for (const l of wrap(heading ? p.slice(2) : p, heading ? 80 : WRAP)) {
        if (y < MARGIN + 20) break;
        ops.push(`BT /${heading ? 'F2' : 'F1'} ${heading ? SIZE + 1 : SIZE} Tf ${MARGIN} ${y.toFixed(1)} Td (${esc(l)}) Tj ET`);
        y -= LEADING;
      }
      y -= LEADING / 2;
    }
    ops.push(`BT /F1 8 Tf ${PAGE_W / 2 - 24} 30 Td (Page ${i + 1} of ${pages.length}) Tj ET`);
    return ops.join('\n');
  });
  // Objects: 1 catalog, 2 pages, 3 font, 4 bold font, then a page and its content stream per page.
  const n = pages.length;
  const pageObj = (i: number) => 5 + i * 2;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${streams.map((_, i) => `${pageObj(i)} 0 R`).join(' ')}] /Count ${n} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    ...streams.flatMap((s, i) => [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageObj(i) + 1} 0 R >>`,
      `<< /Length ${Buffer.byteLength(s, 'latin1')} >>\nstream\n${s}\nendstream`,
    ]),
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}
