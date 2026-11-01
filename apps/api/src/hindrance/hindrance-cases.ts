import type { DelayParty, RiskCategory } from '@erp/shared';

/**
 * 100 DPR remarks labelled by hand: whether each is a hindrance to record and, if so, its cause and
 * who is answerable. Written the way site engineers write them: English, Hinglish and Hindi, short and long, with the
 * routine remarks ("Nil", a few hours lost to our own diesel) that must not become delays. `hindrance-test.ts` scores
 * the rules on them and needs 9 in 10 right.
 */
export interface HindranceCase {
  text: string;
  hindrance: boolean;
  category?: RiskCategory;
  party?: DelayParty | null;
}

export const HINDRANCE_CASES: HindranceCase[] = [
  // Land
  { text: 'Encroachment at Ch 12+300 to 12+650, villagers not allowing embankment work', hindrance: true, category: 'LAND', party: 'THIRD_PARTY' },
  { text: 'Land not handed over between Ch 15+000 and 15+400, work cannot start', hindrance: true, category: 'LAND', party: 'CLIENT' },
  { text: 'Gaon wale kaam rok diye, zameen ka muavza nahi mila bol rahe', hindrance: true, category: 'LAND', party: 'THIRD_PARTY' },
  { text: 'Site not handed over for Block C, front not available', hindrance: true, category: 'LAND', party: 'CLIENT' },
  { text: 'Land owner objected near km 3, stopped excavation for pipeline', hindrance: true, category: 'LAND', party: 'THIRD_PARTY' },
  { text: 'अतिक्रमण के कारण नाली का काम रुका हुआ है', hindrance: true, category: 'LAND', party: 'THIRD_PARTY' },
  { text: 'Court stay on the disputed plot, no work since 10 Oct', hindrance: true, category: 'LAND', party: 'THIRD_PARTY' },
  { text: 'Land acquisition pending for the bypass stretch', hindrance: true, category: 'LAND', party: 'CLIENT' },
  // Design
  { text: 'GF slab reinforcement drawings revised by the architect, waiting for the GFC', hindrance: true, category: 'DESIGN', party: 'CLIENT' },
  { text: 'Revised drawing for culvert at Ch 13+200 not received, work held up', hindrance: true, category: 'DESIGN', party: 'CLIENT' },
  { text: 'Naksha abhi tak nahi mila, column ka kaam ruka hai', hindrance: true, category: 'DESIGN', party: 'CLIENT' },
  { text: 'BBS for raft pending from the consultant', hindrance: true, category: 'DESIGN', party: 'CLIENT' },
  { text: 'Levels not given by the department for the drain, waiting', hindrance: true, category: 'DESIGN', party: 'CLIENT' },
  { text: 'Staircase design awaited from the structural consultant', hindrance: true, category: 'DESIGN', party: 'CLIENT' },
  { text: 'ड्राइंग नहीं मिली, स्लैब का काम बंद', hindrance: true, category: 'DESIGN', party: 'CLIENT' },
  // Client decisions and instructions
  { text: 'Work stopped by the Engineer for change in alignment', hindrance: true, category: 'CLIENT', party: 'CLIENT' },
  { text: 'Inspection by AE pending, could not pour the slab', hindrance: true, category: 'CLIENT', party: 'CLIENT' },
  { text: 'Client decision on tile selection awaited, flooring held up', hindrance: true, category: 'CLIENT', party: 'CLIENT' },
  { text: 'Department put the bridge approach on hold till the scope change is approved', hindrance: true, category: 'CLIENT', party: 'CLIENT' },
  { text: 'Client supplied DI pipes not received, laying stopped', hindrance: true, category: 'MATERIAL', party: 'CLIENT' },
  { text: 'Approval of the Engineer for the mix design pending, no concreting', hindrance: true, category: 'CLIENT', party: 'CLIENT' },
  { text: 'Sahab ne rok diya, extra item ka order aane tak kaam band', hindrance: true, category: 'CLIENT', party: 'CLIENT' },
  // Finance
  { text: 'RA bill 3 payment not released by the department, supplier stopped credit', hindrance: true, category: 'FINANCE', party: 'CLIENT' },
  { text: 'Funds not allotted for the second phase, work slowed', hindrance: true, category: 'FINANCE', party: 'CLIENT' },
  // Statutory
  { text: 'Railway crossing permission for the raw water main still pending', hindrance: true, category: 'STATUTORY', party: 'THIRD_PARTY' },
  { text: 'Forest department not allowed tree cutting at Ch 18, clearing stopped', hindrance: true, category: 'STATUTORY', party: 'THIRD_PARTY' },
  { text: 'Police permission for night work not given', hindrance: true, category: 'STATUTORY', party: 'THIRD_PARTY' },
  { text: 'NOC from the irrigation dept awaited for the canal crossing', hindrance: true, category: 'STATUTORY', party: 'THIRD_PARTY' },
  { text: 'Anumati nahi mili, road cutting ka kaam band hai', hindrance: true, category: 'STATUTORY', party: 'THIRD_PARTY' },
  { text: 'Trees not cut yet on the median, waiting for the forest clearance', hindrance: true, category: 'STATUTORY', party: 'THIRD_PARTY' },
  // Utilities
  { text: 'HT line crossing at Ch 14+100 not yet shifted, embankment held up', hindrance: true, category: 'UTILITY', party: 'THIRD_PARTY' },
  { text: 'Electric poles in the alignment not shifted by the discom', hindrance: true, category: 'UTILITY', party: 'THIRD_PARTY' },
  { text: 'Bijli ka khamba beech me hai, shift nahi hua, nali ka kaam ruka', hindrance: true, category: 'UTILITY', party: 'THIRD_PARTY' },
  { text: 'OFC cable found in trench, telecom team awaited, excavation stopped', hindrance: true, category: 'UTILITY', party: 'THIRD_PARTY' },
  { text: 'Water main shifting pending by the municipality near the junction', hindrance: true, category: 'UTILITY', party: 'THIRD_PARTY' },
  // Weather
  { text: 'Heavy rain stopped GSB laying', hindrance: true, category: 'WEATHER', party: 'FORCE_MAJEURE' },
  { text: 'Continuous rain since 3 days, site waterlogged, no work', hindrance: true, category: 'WEATHER', party: 'FORCE_MAJEURE' },
  { text: 'Baarish ki wajah se pura din kaam band raha', hindrance: true, category: 'WEATHER', party: 'FORCE_MAJEURE' },
  { text: 'Flood in the river, approach road washed away', hindrance: true, category: 'WEATHER', party: 'FORCE_MAJEURE' },
  { text: 'बारिश के कारण काम बंद रहा', hindrance: true, category: 'WEATHER', party: 'FORCE_MAJEURE' },
  { text: 'Cyclone warning, all work suspended by the district administration', hindrance: true, category: 'WEATHER', party: 'FORCE_MAJEURE' },
  { text: 'Paani bhar gaya trench me, dewatering chal raha, laying nahi hua', hindrance: true, category: 'WEATHER', party: 'FORCE_MAJEURE' },
  // Bandh and unrest
  { text: 'Bharat bandh, no labour or material movement', hindrance: true, category: 'OTHER', party: 'FORCE_MAJEURE' },
  { text: 'Curfew in the town after clashes, site closed', hindrance: true, category: 'OTHER', party: 'FORCE_MAJEURE' },
  { text: 'Polling day, work stopped as per government order', hindrance: true, category: 'OTHER', party: 'FORCE_MAJEURE' },
  { text: 'Chakka jam on the highway, trucks could not reach site', hindrance: true, category: 'OTHER', party: 'FORCE_MAJEURE' },
  // Labour (ours)
  { text: 'Labour shortage due to Chhath, only 12 workers present', hindrance: true, category: 'LABOUR', party: 'CONTRACTOR' },
  { text: 'Majdoor nahi aaye, shuttering ka kaam nahi hua', hindrance: true, category: 'LABOUR', party: 'CONTRACTOR' },
  { text: 'Carpenters left for Diwali, slab shuttering delayed', hindrance: true, category: 'LABOUR', party: 'CONTRACTOR' },
  { text: 'Bar benders on strike for wages, cutting stopped', hindrance: true, category: 'LABOUR', party: 'CONTRACTOR' },
  { text: 'मजदूर कम आए, ईंट का काम धीमा रहा नहीं हो पाया पूरा', hindrance: true, category: 'LABOUR', party: 'CONTRACTOR' },
  // Material (ours, the client's, banned)
  { text: 'Cement not available with the dealer, pour postponed, waiting', hindrance: true, category: 'MATERIAL', party: 'CONTRACTOR' },
  { text: 'Bitumen tanker delayed, DBM laying not done', hindrance: true, category: 'MATERIAL', party: 'CONTRACTOR' },
  { text: 'Sand mining ban by NGT, no sand at site, plastering stopped', hindrance: true, category: 'MATERIAL', party: 'THIRD_PARTY' },
  { text: 'Steel shortage, 12 mm TMT not delivered', hindrance: true, category: 'MATERIAL', party: 'CONTRACTOR' },
  { text: 'Gitti nahi aayi, PCC nahi hua', hindrance: true, category: 'MATERIAL', party: 'CONTRACTOR' },
  { text: 'Departmental material (cement) not issued from the store, work stopped', hindrance: true, category: 'MATERIAL', party: 'CLIENT' },
  { text: 'RMC supply delayed by the plant, column cast postponed to tomorrow', hindrance: true, category: 'MATERIAL', party: 'CONTRACTOR' },
  // Machines
  { text: 'Paver breakdown, DBM laying stopped for the day', hindrance: true, category: 'EQUIPMENT', party: 'CONTRACTOR' },
  { text: 'Hot mix plant burner failure, no mix today', hindrance: true, category: 'EQUIPMENT', party: 'CONTRACTOR' },
  { text: 'JCB kharab, khudai nahi hui', hindrance: true, category: 'EQUIPMENT', party: 'CONTRACTOR' },
  { text: 'Tower crane not working, waiting for the mechanic', hindrance: true, category: 'EQUIPMENT', party: 'CONTRACTOR' },
  { text: 'Batching plant down whole day for repair', hindrance: true, category: 'EQUIPMENT', party: 'CONTRACTOR' },
  // Safety
  { text: 'Accident at the shuttering, one worker injured, work stopped for inquiry', hindrance: true, category: 'SAFETY', party: 'CONTRACTOR' },
  { text: 'Trench collapse at km 2, work halted', hindrance: true, category: 'SAFETY', party: 'CONTRACTOR' },
  // Unclear cause
  { text: 'Work stopped at Ch 16+500 since yesterday', hindrance: true, category: 'OTHER', party: null },
  { text: 'Kaam ruka hua hai, sahi wajah kal batayenge', hindrance: true, category: 'OTHER', party: null },

  // Not hindrances: nothing to report
  { text: 'Nil', hindrance: false },
  { text: 'No issues', hindrance: false },
  { text: 'None.', hindrance: false },
  { text: '-', hindrance: false },
  { text: 'All OK', hindrance: false },
  { text: 'Koi dikkat nahi', hindrance: false },
  { text: 'कोई समस्या नहीं', hindrance: false },
  { text: 'Work progressing smoothly', hindrance: false },
  { text: 'No hindrance', hindrance: false },
  { text: 'Sab theek hai', hindrance: false },
  // Not hindrances: hours lost to our own supply, machines or a shower
  { text: 'Diesel delivery delayed by 4 hours', hindrance: false },
  { text: 'Roller breakdown for 2 hours, repaired at site', hindrance: false },
  { text: 'Light rain for 1 hour in the morning', hindrance: false },
  { text: 'Labour came late by 2 hrs', hindrance: false },
  { text: 'RMC truck late by 3 hours', hindrance: false },
  { text: 'Baarish 2 ghante, phir kaam chalu', hindrance: false },
  { text: 'Generator failed for 1 hour, power restored', hindrance: false },
  // Not hindrances: notes that are not about held-up work
  { text: 'Cement 400 bags received from the dealer', hindrance: false },
  { text: 'Labour count 42, PPE compliance 100%', hindrance: false },
  { text: 'Drawings for the second floor received and checked', hindrance: false },
  { text: 'Engineer visited the site and checked the reinforcement', hindrance: false },
  { text: 'Toolbox talk on working at height conducted', hindrance: false },
  { text: 'Cube samples taken for the column pour', hindrance: false },
  { text: 'Need 2 more tippers from next week for the earthwork', hindrance: false },
  { text: 'Client representative appreciated the finish of the plaster', hindrance: false },
  { text: 'Steel 8 MT received, stacked on the platform', hindrance: false },
  { text: 'Rain stopped by noon, work resumed after dewatering', hindrance: false },
  { text: 'Third party quality inspection done, no remarks', hindrance: false },
  { text: 'Bitumen tanker reached site at 10 am', hindrance: false },
  { text: 'Electric meter connection taken for the site office', hindrance: false },
  { text: 'Permission for the night pour received from the police', hindrance: false },
  { text: 'Kal se shuttering shuru karenge', hindrance: false },
  { text: 'Design mix trial for M30 cast today', hindrance: false },
];
