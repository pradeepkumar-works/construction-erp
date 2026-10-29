/**
 * Today's toolbox talk (intelligence quick win Q8): a five-minute talk in Hindi and English, written from the day's work on
 * the project (activities planned for today or reported in the last days), the permits to work valid today and the
 * project's recent incidents. Pure; `SafetyService.talkForToday` loads the records and the screens read the draft. The
 * points are fixed words per hazard, never a model's, so a supervisor can read them out as they are. Tested in
 * `src/scripts/intelligence-test.ts`.
 */
import type { SafetyIncidentType, WorkPermitType } from './enums';

/** Incidents of the project this far back are told again. */
export const TALK_INCIDENT_DAYS = 180;
/** At most this many incidents are told. */
export const TALK_INCIDENTS = 2;
/** At most this many hazards make one talk (about five minutes with the opening and the close). */
export const TALK_HAZARDS = 3;
/** Activities reported this many days back count as today's work too. */
export const TALK_RECENT_DAYS = 3;

export const TALK_HAZARD_KEYS = ['HEIGHT', 'EXCAVATION', 'HOT_WORK', 'CONFINED_SPACE', 'ELECTRICAL', 'LIFTING', 'TRAFFIC', 'BITUMEN', 'MACHINES', 'CONCRETE', 'REBAR', 'GENERAL'] as const;
export type TalkHazard = (typeof TALK_HAZARD_KEYS)[number];

/** One line of the talk in both languages. */
export interface TalkLineDto {
  en: string;
  hi: string;
}

interface HazardTalk {
  /** The topic recorded with the talk: a `TOOLBOX_TOPICS` entry where one fits */
  topic: string;
  title: TalkLineDto;
  points: TalkLineDto[];
  /** Words in an activity's name or an incident's description that bring this hazard up (whole words) */
  words: string[];
}

export const TALK_HAZARDS_INFO: Record<TalkHazard, HazardTalk> = {
  HEIGHT: {
    topic: 'Working at height and harness use',
    title: { en: 'Working at height', hi: 'ऊँचाई पर काम' },
    points: [
      { en: 'Above 1.8 m, wear a full body harness and hook it to a fixed point before you step out.', hi: '1.8 मीटर से ऊपर फुल बॉडी हार्नेस पहनें और बाहर कदम रखने से पहले उसे किसी मज़बूत जगह पर बाँधें।' },
      { en: 'Check the scaffold tag and the guard rails before you climb. Never stand on a loose plank.', hi: 'चढ़ने से पहले मचान का टैग और रेलिंग देखें। ढीले तख़्ते पर कभी न खड़े हों।' },
      { en: 'Tie your tools and keep the area below barricaded, so nothing falls on anyone.', hi: 'औज़ार बाँधकर रखें और नीचे की जगह घेर दें, ताकि किसी पर कुछ न गिरे।' },
    ],
    words: ['scaffold', 'scaffolding', 'staging', 'roof', 'terrace', 'parapet', 'facade', 'height', 'tower', 'esr', 'oht', 'overhead', 'slab', 'shuttering', 'formwork', 'centering'],
  },
  EXCAVATION: {
    topic: 'Excavation and trench safety',
    title: { en: 'Excavation and trenches', hi: 'खुदाई और खाई' },
    points: [
      { en: 'Deeper than 1.5 m, the sides are sloped or shored before anyone goes in.', hi: '1.5 मीटर से गहरी खाई में उतरने से पहले किनारों को ढलान दें या सहारा (शोरिंग) लगाएँ।' },
      { en: 'Keep the dug earth and the machines at least 1 m back from the edge.', hi: 'खोदी गई मिट्टी और मशीनें किनारे से कम से कम 1 मीटर दूर रखें।' },
      { en: 'Use the ladder to go in and out, and barricade the trench before you leave at night.', hi: 'अंदर-बाहर जाने के लिए सीढ़ी लगाएँ, और रात को जाने से पहले खाई को घेर दें।' },
    ],
    words: ['excavation', 'excavate', 'trench', 'trenching', 'earthwork', 'foundation', 'footing', 'footings', 'pit', 'pits', 'digging'],
  },
  HOT_WORK: {
    topic: 'Hot work and fire prevention',
    title: { en: 'Welding and cutting', hi: 'हॉट वर्क: वेल्डिंग और कटिंग' },
    points: [
      { en: 'Clear anything that burns from 10 m around, and keep a fire extinguisher at hand.', hi: '10 मीटर तक जलने वाला सामान हटाएँ और अग्निशामक पास में रखें।' },
      { en: 'Wear the welding shield, gloves and apron. Check the hoses and cables for cuts.', hi: 'वेल्डिंग शील्ड, दस्ताने और एप्रन पहनें। पाइप और केबल में कट तो नहीं, जाँच लें।' },
      { en: 'Watch the spot for 30 minutes after the work stops.', hi: 'काम बंद होने के बाद 30 मिनट तक उस जगह पर नज़र रखें।' },
    ],
    words: ['welding', 'weld', 'cutting', 'fabrication', 'structural', 'grinding'],
  },
  CONFINED_SPACE: {
    topic: 'Confined space entry',
    title: { en: 'Tanks, chambers and manholes', hi: 'बंद जगह: टैंक, चैम्बर और मैनहोल' },
    points: [
      { en: 'Nobody goes in without the permit and a gas test of the air.', hi: 'परमिट और हवा की गैस जाँच के बिना कोई अंदर नहीं जाएगा।' },
      { en: 'One person stays at the opening the whole time, with a rope and a way to call for help.', hi: 'एक व्यक्ति पूरे समय मुहाने पर रस्सी के साथ रहेगा और मदद बुलाने का साधन रखेगा।' },
      { en: 'If you feel dizzy or short of breath, come out at once.', hi: 'चक्कर आए या साँस फूले तो तुरंत बाहर आएँ।' },
    ],
    words: ['manhole', 'manholes', 'chamber', 'chambers', 'sump', 'septic', 'sewer'],
  },
  ELECTRICAL: {
    topic: 'Electrical safety at site',
    title: { en: 'Electricity at site', hi: 'साइट पर बिजली' },
    points: [
      { en: 'Only the electrician opens or connects a panel. Switch off and lock before any repair.', hi: 'पैनल केवल इलेक्ट्रीशियन खोलेगा या जोड़ेगा। मरम्मत से पहले बिजली बंद करके ताला लगाएँ।' },
      { en: 'No bare wires pushed into a socket. Use plugs and the board with the ELCB.', hi: 'सॉकेट में नंगे तार न ठूँसें। प्लग और ELCB वाला बोर्ड ही लगाएँ।' },
      { en: 'Keep cables off wet ground and away from where vehicles run.', hi: 'केबल गीली ज़मीन से ऊपर और गाड़ियों के रास्ते से दूर रखें।' },
    ],
    words: ['electrical', 'electric', 'wiring', 'cable', 'cabling', 'panel', 'earthing', 'lighting', 'transformer', 'pump house'],
  },
  LIFTING: {
    topic: 'Crane and lifting operations',
    title: { en: 'Cranes and heavy lifts', hi: 'क्रेन और भारी सामान उठाना' },
    points: [
      { en: 'Check the slings, the hooks and the load chart before the lift.', hi: 'उठाने से पहले स्लिंग, हुक और लोड चार्ट जाँचें।' },
      { en: 'One signalman only, and nobody stands under a hanging load.', hi: 'इशारा केवल एक सिग्नलमैन देगा, और लटके हुए भार के नीचे कोई न खड़ा हो।' },
      { en: 'Guide the load with a tag line, never with your hands.', hi: 'भार को हाथ से नहीं, टैग लाइन (रस्सी) से संभालें।' },
    ],
    words: ['crane', 'erection', 'lifting', 'hoist', 'girder', 'girders', 'precast', 'launching', 'lowering'],
  },
  TRAFFIC: {
    topic: 'Traffic management and reversing vehicles',
    title: { en: 'Working beside traffic', hi: 'सड़क पर काम और गाड़ियाँ' },
    points: [
      { en: 'Put the signs and cones out before the work starts. The flagman wears the reflective jacket.', hi: 'काम शुरू होने से पहले बोर्ड और कोन लगाएँ। फ़्लैगमैन रिफ़्लेक्टिव जैकेट पहने।' },
      { en: 'Never stand behind a reversing tipper. Catch the driver’s eye before you go near.', hi: 'पीछे आते टिपर के पीछे कभी न खड़े हों। पास जाने से पहले ड्राइवर से नज़र मिलाएँ।' },
      { en: 'Walk on the side away from the traffic.', hi: 'चलते यातायात से दूर वाली तरफ़ चलें।' },
    ],
    words: ['road', 'roads', 'carriageway', 'gsb', 'wmm', 'kerb', 'shoulder', 'diversion', 'marking', 'widening', 'highway', 'tipper', 'tippers', 'reversing', 'reversed', 'reverse'],
  },
  BITUMEN: {
    topic: 'Heat stress, water and rest',
    title: { en: 'Hot bitumen and the heat', hi: 'गर्म डामर (बिटुमेन) और गर्मी' },
    points: [
      { en: 'Hot bitumen is above 150 °C. Boots, gloves and full sleeves near the paver and the sprayer.', hi: 'गर्म डामर 150 °C से ज़्यादा होता है। पेवर और स्प्रेयर के पास जूते, दस्ताने और पूरी बाँह के कपड़े पहनें।' },
      { en: 'Keep the boiler’s fire away from the drums and the stock.', hi: 'बॉयलर की आग को ड्रम और सामान से दूर रखें।' },
      { en: 'Drink water every half hour and rest in the shade.', hi: 'हर आधे घंटे पानी पिएँ और छाँव में आराम करें।' },
    ],
    words: ['bitumen', 'bituminous', 'dbm', 'asphalt', 'prime', 'tack', 'premix', 'paving', 'paver'],
  },
  MACHINES: {
    topic: 'Traffic management and reversing vehicles',
    title: { en: 'Working near machines', hi: 'मशीनों के पास काम' },
    points: [
      { en: 'Stay out of the swing of an excavator’s arm and the path of a roller.', hi: 'एक्सकेवेटर की घूमती बाँह और रोलर के रास्ते से दूर रहें।' },
      { en: 'Only the trained operator runs a machine. Take the key out when it stands.', hi: 'मशीन केवल प्रशिक्षित ऑपरेटर चलाएगा। खड़ी मशीन से चाबी निकाल लें।' },
      { en: 'No riding on a machine or in its bucket.', hi: 'मशीन पर या उसकी बकेट में बैठकर न जाएँ।' },
    ],
    words: ['excavator', 'jcb', 'roller', 'compaction', 'embankment', 'grader', 'dozer', 'backfilling', 'backfill', 'loader', 'bucket'],
  },
  CONCRETE: {
    topic: 'PPE: helmet, shoes, gloves, reflective jacket',
    title: { en: 'Concreting', hi: 'कंक्रीट डालना' },
    points: [
      { en: 'Wet cement burns the skin. Wear gloves and gumboots and wash off splashes at once.', hi: 'गीला सीमेंट त्वचा जलाता है। दस्ताने और गमबूट पहनें और छींटे तुरंत धो लें।' },
      { en: 'Keep clear of the pump pipe and its bends while it runs.', hi: 'पंप चलते समय उसकी पाइप और मोड़ से दूर रहें।' },
      { en: 'Check the vibrator’s cable and plug before use and keep them out of water.', hi: 'वाइब्रेटर की केबल और प्लग पहले जाँचें और उन्हें पानी से दूर रखें।' },
    ],
    words: ['concrete', 'concreting', 'rcc', 'pcc', 'pour', 'pouring', 'casting', 'm20', 'm25', 'm30', 'slab', 'column', 'columns', 'beam', 'beams', 'raft'],
  },
  REBAR: {
    topic: 'Manual handling and lifting',
    title: { en: 'Cutting, bending and carrying steel', hi: 'सरिया काटना, मोड़ना और उठाना' },
    points: [
      { en: 'Cap the ends of standing bars, so nobody is speared in a fall.', hi: 'खड़े सरियों के सिरों पर कैप लगाएँ, ताकि गिरने पर कोई घायल न हो।' },
      { en: 'Carry long bars in pairs on the same shoulder, and call out at corners.', hi: 'लंबे सरिये दो लोग एक ही कंधे पर उठाएँ, और मोड़ पर आवाज़ दें।' },
      { en: 'Gloves on at the bending table, and fingers clear of the pin.', hi: 'मोड़ने की टेबल पर दस्ताने पहनें और उँगलियाँ पिन से दूर रखें।' },
    ],
    words: ['reinforcement', 'rebar', 'steel', 'bar', 'bars', 'bending', 'tmt'],
  },
  GENERAL: {
    topic: 'PPE: helmet, shoes, gloves, reflective jacket',
    title: { en: 'Safety gear and a clean site', hi: 'सुरक्षा उपकरण (PPE) और साफ़ साइट' },
    points: [
      { en: 'Helmet, safety shoes and the reflective jacket, on everyone, all day.', hi: 'सभी लोग पूरे दिन हेलमेट, सेफ़्टी जूते और रिफ़्लेक्टिव जैकेट पहनें।' },
      { en: 'Keep the walkways clear of rods, nails and loose material.', hi: 'रास्तों से सरिया, कीलें और बिखरा सामान हटाकर रखें।' },
      { en: 'Know where the first aid box is and the emergency number of this site.', hi: 'इस साइट का फ़र्स्ट एड बॉक्स कहाँ है और आपातकालीन नंबर क्या है, जान लें।' },
    ],
    words: [],
  },
};

/** The hazard each kind of permit brings: the permit's own hazard always heads the talk. */
export const PERMIT_HAZARD: Record<WorkPermitType, TalkHazard> = {
  HOT_WORK: 'HOT_WORK',
  WORK_AT_HEIGHT: 'HEIGHT',
  EXCAVATION: 'EXCAVATION',
  CONFINED_SPACE: 'CONFINED_SPACE',
  ELECTRICAL: 'ELECTRICAL',
  LIFTING: 'LIFTING',
  OTHER: 'GENERAL',
};

export const PERMIT_TYPE_HI: Record<WorkPermitType, string> = {
  HOT_WORK: 'हॉट वर्क (वेल्डिंग, कटिंग)',
  WORK_AT_HEIGHT: 'ऊँचाई पर काम',
  EXCAVATION: 'खुदाई / खाई',
  CONFINED_SPACE: 'बंद जगह में काम',
  ELECTRICAL: 'बिजली का काम',
  LIFTING: 'क्रेन / भारी लिफ्ट',
  OTHER: 'अन्य काम',
};

const PERMIT_LABEL_EN: Record<WorkPermitType, string> = {
  HOT_WORK: 'hot work',
  WORK_AT_HEIGHT: 'work at height',
  EXCAVATION: 'excavation',
  CONFINED_SPACE: 'confined space entry',
  ELECTRICAL: 'electrical work',
  LIFTING: 'a crane lift',
  OTHER: 'other work',
};

const INCIDENT_EN: Record<SafetyIncidentType, string> = {
  NEAR_MISS: 'a near miss',
  FIRST_AID: 'a first aid case',
  MEDICAL_TREATMENT: 'an injury that needed treatment',
  LOST_TIME: 'an injury that cost days off work',
  PROPERTY_DAMAGE: 'damage to property',
  FATALITY: 'a death',
};
/** What happened, with its verb, after "<date> को". */
const INCIDENT_HI: Record<SafetyIncidentType, string> = {
  NEAR_MISS: 'नियर मिस (बाल-बाल बचे) हुआ',
  FIRST_AID: 'एक चोट लगी जिसमें प्राथमिक उपचार हुआ',
  MEDICAL_TREATMENT: 'एक चोट लगी जिसका इलाज कराना पड़ा',
  LOST_TIME: 'एक चोट लगी जिससे काम छूटा',
  PROPERTY_DAMAGE: 'सामान का नुकसान हुआ',
  FATALITY: 'एक मृत्यु हुई',
};

const words = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;

/** The hazards a piece of text names, in `TALK_HAZARD_KEYS` order (none for GENERAL). */
export function hazardsIn(text: string): TalkHazard[] {
  const t = words(text);
  return TALK_HAZARD_KEYS.filter((h) => TALK_HAZARDS_INFO[h].words.some((w) => t.includes(` ${w} `)));
}

export interface TalkInput {
  date: string;
  /** Activity names worked on today or planned for today */
  activities: string[];
  permits: { permitNo: string; type: WorkPermitType; location: string; description: string }[];
  /** The project's incidents within `TALK_INCIDENT_DAYS`, newest first */
  incidents: { incidentNo: string; type: SafetyIncidentType; date: string; description: string; correctiveAction: string | null }[];
}

export interface TalkSectionDto {
  hazard: TalkHazard;
  title: TalkLineDto;
  points: TalkLineDto[];
  /** What brought it up: "Permit PTW-2026-0004", "Incident INC-2026-0002", "Activity: Slab casting" */
  why: string;
}

export interface ToolboxTalkDraftDto {
  projectId: string;
  projectName: string;
  date: string;
  /** Recorded as the talk's topic: the first section's */
  topic: string;
  opening: TalkLineDto;
  sections: TalkSectionDto[];
  incidents: TalkLineDto[];
  closing: TalkLineDto;
  minutes: number;
}

const dayMonth = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const listHi = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} और ${xs[xs.length - 1]}`);
const sentence = (s: string) => {
  const t = s.trim().replace(/\s+/g, ' ');
  return /[.!?]$/.test(t) ? t : `${t}.`;
};

/**
 * The talk: the permits' hazards first (today's riskiest work), then those the recent incidents name, then those of the
 * activities, most often named first; `TALK_HAZARDS` of them, or the general one when nothing names a hazard. The recent
 * incidents are told with what changed after them.
 */
export function toolboxTalk(input: TalkInput): Omit<ToolboxTalkDraftDto, 'projectId' | 'projectName'> {
  const score = new Map<TalkHazard, { n: number; why: string }>();
  const add = (h: TalkHazard, n: number, why: string) => {
    const cur = score.get(h);
    score.set(h, cur ? { n: cur.n + n, why: cur.why } : { n, why });
  };
  for (const p of input.permits) add(PERMIT_HAZARD[p.type], 100, `Permit ${p.permitNo}`);
  const incidents = input.incidents.slice(0, TALK_INCIDENTS);
  for (const i of incidents) for (const h of hazardsIn(i.description)) add(h, 10, `Incident ${i.incidentNo}`);
  for (const a of input.activities) for (const h of hazardsIn(a)) add(h, 1, `Activity: ${a}`);
  score.delete('GENERAL');
  let picked = [...score.entries()]
    .sort((a, b) => b[1].n - a[1].n || TALK_HAZARD_KEYS.indexOf(a[0]) - TALK_HAZARD_KEYS.indexOf(b[0]))
    .slice(0, TALK_HAZARDS);
  if (!picked.length) picked = [['GENERAL', { n: 0, why: 'Nothing today names a hazard of its own' }]];
  const sections: TalkSectionDto[] = picked.map(([hazard, s]) => ({ hazard, title: TALK_HAZARDS_INFO[hazard].title, points: TALK_HAZARDS_INFO[hazard].points, why: s.why }));

  const acts = [...new Set(input.activities)].slice(0, 3);
  const permits = input.permits.slice(0, 3);
  const enParts = [
    acts.length ? `Today we work on ${list(acts)}.` : 'Before we start today, five minutes on staying safe.',
    permits.length ? `Permits today: ${list(permits.map((p) => `${p.type === 'OTHER' ? p.description : PERMIT_LABEL_EN[p.type]} at ${p.location}`))}.` : '',
  ];
  const hiParts = [
    acts.length ? `आज का काम: ${listHi(acts)}।` : 'काम शुरू करने से पहले, पाँच मिनट सुरक्षा पर।',
    permits.length ? `आज के परमिट: ${listHi(permits.map((p) => `${p.type === 'OTHER' ? p.description : PERMIT_TYPE_HI[p.type]} (${p.location})`))}।` : '',
  ];
  const told = incidents.map((i) => ({
    en: `On ${dayMonth(i.date)} we had ${INCIDENT_EN[i.type]}: ${sentence(i.description)}${i.correctiveAction ? ` Since then: ${sentence(i.correctiveAction)}` : ''}`,
    hi: `${dayMonth(i.date)} को ${INCIDENT_HI[i.type]}: ${sentence(i.description)}${i.correctiveAction ? ` उसके बाद से: ${sentence(i.correctiveAction)}` : ''}`,
  }));
  return {
    date: input.date,
    topic: TALK_HAZARDS_INFO[sections[0].hazard].topic,
    opening: { en: enParts.filter(Boolean).join(' '), hi: hiParts.filter(Boolean).join(' ') },
    sections,
    incidents: told,
    closing: { en: 'If anything looks unsafe, stop the work and tell the supervisor. Nobody will be blamed for stopping.', hi: 'कुछ भी असुरक्षित लगे तो काम रोकें और सुपरवाइज़र को बताएँ। काम रोकने पर किसी को दोष नहीं दिया जाएगा।' },
    minutes: 5,
  };
}

/** The talk as plain text in one language, for the talk's notes or to share. */
export function talkText(d: Pick<ToolboxTalkDraftDto, 'opening' | 'sections' | 'incidents' | 'closing'>, lang: 'en' | 'hi'): string {
  return [
    d.opening[lang],
    ...d.sections.flatMap((s) => [`${s.title[lang]}:`, ...s.points.map((p) => `- ${p[lang]}`)]),
    ...d.incidents.map((i) => i[lang]),
    d.closing[lang],
  ].join('\n');
}
