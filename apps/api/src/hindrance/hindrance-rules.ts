import type { DelayParty, RiskCategory } from '@erp/shared';
import { NOTICE_STAGES, delayDays } from '@erp/shared';

/**
 * Hindrance register to notice (AI item 123), the pure part: reading a DPR remark for a hindrance (cause, party and the
 * day it began), finding the notice period in a contract's text, the notice clock and the notice letter's lines.
 * Tested in `src/scripts/hindrance-test.ts`, with 100 labelled remarks in `hindrance-cases.ts`.
 */

export const addDays = (d: string, n: number) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

// ---------------------------------------------------------------------------------------------------------------------
// Reading a remark

export type Verdict = 'HINDRANCE' | 'NONE' | 'UNSURE';

export interface Reading {
  verdict: Verdict;
  category: RiskCategory | null;
  party: DelayParty | null;
  /** A short title for the delay entry */
  title: string;
  /** The words that gave it away */
  matched: string[];
  /** Days before the report's date that the hindrance began (0 = that day) */
  startOffset: number;
}

/** Words that say work was held up or slowed, in English, Hinglish and Hindi. */
const HELD =
  /\b(stop(ped|page)?|held up|hold|halt(ed)?|suspend(ed)?|delay(ed)?|wait(ing)?|await(ed|ing)?|pending|not (yet )?(available|received|supplied|delivered|handed|given|done|started|cleared|shifted|approved|issued|released|possible|allowed)|could ?n[o']t|unable|idle|no work|obstruct(ed|ion)?|object(ed|ion)|disrupt(ed)?|affected|short(age)?|non[- ]?availability|ruk(a|i|e|aa|ega)?|band (hai|tha|raha|rakha)|kaam nahi|nahi (aaya|aaye|aayi|mila|mili|hua|hui|ho paya|ho saka|hai)|intez?aar|late)\b|रुक|बंद|नहीं|इंतजार|देरी/i;

interface Rule {
  category: RiskCategory;
  party: DelayParty | null;
  title: string;
  /** Any of these names the cause */
  topic: RegExp;
  /** The remark must also say work was held up (HELD) unless the topic says it by itself */
  needsHeld: boolean;
}

/** In order: the first rule that fits wins, so the narrower causes come before the broad ones. */
const RULES: Rule[] = [
  {
    category: 'LAND',
    party: 'CLIENT',
    title: 'Land not handed over',
    topic: /\b(land (not|yet to be) (handed|given|acquired|available)|land acquisition|acquisition (not|pending)|possession (not|of land)|site not handed|front not (available|given|handed)|hand(ing)? ?over of (land|site|front))|zameen nahi (mili|di)|जमीन (नहीं|का अधिग्रहण)/i,
    needsHeld: false,
  },
  {
    category: 'LAND',
    party: 'THIRD_PARTY',
    title: 'Encroachment or objection on the land',
    topic: /\b(encroach\w*|land (owner|dispute)|villagers?|gaon (wale|walon)|gramin|farmers? (objected|stopped|objection)|kabza|atikraman|court (stay|case|order))\b|अतिक्रमण|कब्जा|ग्रामीण|गांव वाले/i,
    needsHeld: false,
  },
  {
    category: 'DESIGN',
    party: 'CLIENT',
    title: 'Drawings or design awaited',
    topic: /\b(drawings?|gfc|(?<!mix )design|naksha|nakshe|bbs|layout|levels? not (given|fixed)|revised plan)\b|ड्राइंग|नक्शा|डिजाइन/i,
    needsHeld: true,
  },
  {
    category: 'FINANCE',
    party: 'CLIENT',
    title: 'Payment not released by the client',
    topic: /\b((payment|bill|funds?|dues) (not|yet to be) (released|paid|received|cleared)|payment (pending|delayed) (from|by) (the )?(client|department|dept|authority)|paisa nahi mila|fund(s)? not (available|allotted))\b/i,
    needsHeld: false,
  },
  {
    category: 'STATUTORY',
    party: 'THIRD_PARTY',
    title: 'Permission awaited',
    topic: /\b(permission|permit|noc|clearance|sanction|anumati|railway (crossing|block)|forest (department|dept|clearance|permission)|tree cutting|trees? (not )?cut|police (permission|stopped)|pollution board|mining (lease|permit))\b|अनुमति|वन विभाग/i,
    needsHeld: true,
  },
  {
    category: 'UTILITY',
    party: 'THIRD_PARTY',
    title: 'Utility not shifted',
    topic: /\b(electric(al)? poles?|poles? (not )?shift\w*|ht line|lt line|power line|transformer|water (supply )?(line|main) (shifting|not shifted)|pipeline shifting|telephone (cable|line)|ofc|optical fib(re|er)|gas pipeline|bijli (ka|ke) (khamba|khambe|taar)|khamba|utility|utilities)\b|बिजली का खंभा|खंभ/i,
    needsHeld: true,
  },
  {
    category: 'CLIENT',
    party: 'CLIENT',
    title: 'Client instruction or decision awaited',
    topic: /\b((client|department|dept|authority|engineer|ae|ee|je|consultant|pmc|architect)('s)? (decision|instruction|approval|inspection|go[- ]ahead|clearance)|(decision|instruction|approval|inspection|go[- ]ahead) (of|from|by) (the )?(client|department|dept|authority|engineer|ae|ee|je|consultant|pmc|architect)|stopped by (the )?(client|department|dept|authority|engineer|ae|ee|consultant|pmc)|(client|department|dept|authority|engineer|consultant) (stopped|asked to stop|put on hold)|on hold (by|from)|change (of|in) scope|extra item|scope change|sahab ne rok)\b/i,
    needsHeld: false,
  },
  {
    category: 'WEATHER',
    party: 'FORCE_MAJEURE',
    title: 'Rain or bad weather',
    topic: /\b(rain\w*|downpour|shower|monsoon|flood\w*|water ?logg?(ed|ing)|cyclone|storm|thunder\w*|cloudburst|landslide|heat ?wave|baarish|barish|barsaat|paani bhar\w*|toofan|aandhi)\b|बारिश|वर्षा|बरसात|बाढ़|तूफान|पानी भर/i,
    needsHeld: false,
  },
  {
    category: 'OTHER',
    party: 'FORCE_MAJEURE',
    title: 'Bandh, curfew or unrest',
    topic: /\b(bandh|bharat band|curfew|section 144|riot\w*|unrest|law and order|chakka jam|road ?block(ade)?|election|polling|vip (visit|movement)|lockdown|epidemic)\b|कर्फ्यू|बंद का आह्वान|चुनाव/i,
    needsHeld: false,
  },
  {
    category: 'SAFETY',
    party: 'CONTRACTOR',
    title: 'Accident or safety stop',
    topic: /\b(accident|injur\w*|fatal\w*|collapse\w*|fire|safety (stop|hold|notice)|durghatna)\b|दुर्घटना/i,
    needsHeld: false,
  },
  {
    category: 'LABOUR',
    party: 'CONTRACTOR',
    title: 'Labour short',
    topic: /\b(labou?r\w*|workers?|manpower|masons?|helpers?|carpenters?|bar ?benders?|majdoor|mazdoor|mistri|karigar|festival|holi|diwali|chhath|eid|harvest)\b|मजदूर|कारीगर|मिस्त्री|हड़ताल/i,
    needsHeld: true,
  },
  {
    category: 'MATERIAL',
    party: 'CONTRACTOR',
    title: 'Material not available',
    topic: /\b(cement|steel|rebar|tmt|sand|aggregate|metal|gitti|bitumen|emulsion|bricks?|blocks?|rmc|concrete supply|ready ?mix|pipes?|diesel|fuel|material|maal|rodi|balu|baalu)\b|सीमेंट|सरिया|रेत|बालू|गिट्टी|ईंट|माल/i,
    needsHeld: true,
  },
  {
    category: 'EQUIPMENT',
    party: 'CONTRACTOR',
    title: 'Machine breakdown',
    topic: /\b(break ?down|broke(n)? down|machine (kharab|out of order|not working|failure)|kharab|(paver|roller|grader|excavator|jcb|crane|mixer|pump|batching plant|hot mix plant|tipper|dumper|vibrator|generator|dg set|compressor)\b.*\b(fail\w*|not working|repair|down|kharab|out of order|stopped))|मशीन खराब|खराब/i,
    needsHeld: false,
  },
];

/** Remarks that say there was nothing: "Nil", "No issues", "All OK", "Koi dikkat nahi". */
const NOTHING =
  /^\s*(nil|none|no|na|n\/?a|-+|\.+|ok|all ok|all fine|fine|normal|nothing|no issues?|no problems?|no hindrances?|no constraints?|no delays?|smooth|work (going|progressing|proceeding) (smoothly|as planned|normally)|koi (samasya|dikkat|pareshani|problem) nahi( hai)?|sab theek( hai)?|कोई समस्या नहीं|कुछ नहीं)\s*[.!]?\s*$/i;

/** "4 hours", "2 hrs", "3 ghante" with no "whole day": a short stop, not a hindrance to notify when it is ours or the weather's. */
const HOURS = /\b\d+(\.\d+)?\s*(hours?|hrs?|ghant(a|e))\b|घंटे/i;
const WHOLE_DAY = /\b(whole|full|entire|all) day\b|\b(pura|poora) din\b|पूरा दिन/i;
/** The remark says the problem has passed: "rain stopped, work resumed". */
const RESUMED = /\b(resumed|restarted|cleared now|solved|resolved|normal now|back to normal|shuru ho gaya|chalu ho gaya)\b/i;

/** Takes a remark apart into the words a rule matched, for the card's Why. */
function hits(re: RegExp, text: string): string[] {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  return [...new Set([...text.matchAll(g)].map((m) => m[0].trim().toLowerCase()).filter(Boolean))].slice(0, 4);
}

/**
 * What a DPR remark says: a hindrance (with its cause, who is answerable and how many days ago it began), nothing to
 * record, or unsure (it says work was held up but not why: the model reads it when Ask Nirmaan is on).
 */
export function classifyRemark(remark: string | null | undefined, reportDate: string): Reading {
  const text = (remark ?? '').replace(/\s+/g, ' ').trim();
  const none: Reading = { verdict: 'NONE', category: null, party: null, title: '', matched: [], startOffset: 0 };
  if (!text || NOTHING.test(text)) return none;
  const held = HELD.test(text);
  const rule = RULES.find((r) => r.topic.test(text) && (!r.needsHeld || held));
  const startOffset = Math.max(0, daysBetween(startDateFrom(text, reportDate), reportDate));
  if (!rule) {
    if (!held) return none;
    return { verdict: 'UNSURE', category: 'OTHER', party: null, title: titleFrom(text), matched: hits(HELD, text), startOffset };
  }
  const party = partyOf(rule, text);
  // A few hours lost to our own supply, labour or machines, or to a shower, is not a hindrance to notify.
  if (HOURS.test(text) && !WHOLE_DAY.test(text) && (party === 'CONTRACTOR' || rule.category === 'WEATHER')) return none;
  if (RESUMED.test(text) && (party === 'CONTRACTOR' || rule.category === 'WEATHER')) return none;
  return { verdict: 'HINDRANCE', category: rule.category, party, title: rule.title, matched: [...hits(rule.topic, text), ...(rule.needsHeld ? hits(HELD, text) : [])].slice(0, 5), startOffset };
}

/** Narrows a rule's party from the remark: material the client supplies is theirs; a ban or a strike is no one's. */
function partyOf(rule: Rule, text: string): DelayParty | null {
  if (rule.category === 'MATERIAL') {
    if (/\b(client|department|dept|departmental|authority)[- ]?(supplied|supply|issued|material)\b/i.test(text)) return 'CLIENT';
    if (/\b(ban|banned|mining (stopped|closed)|ngt|quarr(y|ies) (closed|sealed))\b/i.test(text)) return 'THIRD_PARTY';
  }
  if (rule.category === 'LABOUR' && /\b(general strike|bandh|transport strike|truckers'? strike)\b/i.test(text)) return 'FORCE_MAJEURE';
  if (rule.category === 'STATUTORY' && /\b(client|department|dept|authority) (to (get|obtain|apply)|has not (got|obtained|applied))\b/i.test(text)) return 'CLIENT';
  return rule.party;
}

/** A title from the remark itself when no rule names the cause: its first clause, up to 80 characters. */
function titleFrom(text: string): string {
  const first = text.split(/[.;\n]/)[0].trim();
  const t = first.length > 80 ? `${first.slice(0, 77).trimEnd()}…` : first;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * The day a hindrance began, from the remark: "since 12 Oct", "from 12/10", "since 3 days", "for the last 2 days",
 * "3 din se", "since yesterday" / "kal se", "since Monday". The report's own date when it says none; never after it.
 */
export function startDateFrom(remark: string, reportDate: string): string {
  const t = remark.toLowerCase();
  const year = Number(reportDate.slice(0, 4));
  const clamp = (d: string) => (d > reportDate ? reportDate : d);
  const dated = (day: number, month: number) => {
    if (day < 1 || day > 31 || month < 0 || month > 11) return null;
    let d = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (d > reportDate) d = `${year - 1}${d.slice(4)}`;
    return d;
  };
  let m = /\b(?:since|from|w\.?e\.?f\.?|starting|se)\s+(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3})[a-z]*\b/.exec(t);
  if (m && MONTHS.includes(m[2])) {
    const d = dated(Number(m[1]), MONTHS.indexOf(m[2]));
    if (d) return clamp(d);
  }
  m = /\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3})[a-z]*\s+se\b/.exec(t);
  if (m && MONTHS.includes(m[2])) {
    const d = dated(Number(m[1]), MONTHS.indexOf(m[2]));
    if (d) return clamp(d);
  }
  m = /\b(?:since|from|w\.?e\.?f\.?)\s+(\d{1,2})[/.-](\d{1,2})(?:[/.-]\d{2,4})?\b/.exec(t);
  if (m) {
    const d = dated(Number(m[1]), Number(m[2]) - 1);
    if (d) return clamp(d);
  }
  m = /\b(?:since|from)\s+(?:the\s+)?(?:last|past)?\s*(\d{1,3})\s+days?\b|\b(\d{1,3})\s+din\s+se\b|(\d{1,3})\s+दिन\s+से/.exec(t);
  if (m) return addDays(reportDate, -Number(m[1] ?? m[2] ?? m[3]));
  m = /\b(?:for|last|past|pichhle|pichle)\s+(?:the\s+)?(?:last|past)?\s*(\d{1,3})\s+(?:days?|din)\b/.exec(t);
  if (m) return addDays(reportDate, -(Number(m[1]) - 1));
  if (/\b(since|from) yesterday\b|\bkal se\b|कल से/.test(t)) return addDays(reportDate, -1);
  if (/\b(since|from) last week\b|\bpichhle hafte se\b/.test(t)) return addDays(reportDate, -7);
  m = /\b(?:since|from)\s+(?:last\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/.exec(t);
  if (m) {
    const want = WEEKDAYS.indexOf(m[1]);
    const dow = new Date(`${reportDate}T00:00:00Z`).getUTCDay();
    return addDays(reportDate, -((dow - want + 7) % 7));
  }
  return reportDate;
}

// ---------------------------------------------------------------------------------------------------------------------
// The contract's notice period

/** Clauses of a page of contract text: "9.1 The Contractor shall …." up to the next numbered clause. */
function clausesOf(text: string): { no: string; body: string }[] {
  const flat = text.replace(/\s+/g, ' ');
  const re = /(\d+\.\d+)\s+(.+?\.)(?=\s+\d+\.\d+\s|\s+#|\s+Clause\s|\s+Page\s\d|\s*$)/g;
  return [...flat.matchAll(re)].map((m) => ({ no: m[1], body: m[2] }));
}

/**
 * The notice period for a hindrance in a page of the contract: the clause that asks for notice (or an application)
 * within so many days of a hindrance or delay arising. A clause about notice is taken before one about applying; a
 * claim made after the hindrance ends ("within 28 days of the end of the hindrance") is not a notice period.
 */
export function noticeClause(text: string): { no: string; text: string; days: number } | null {
  let best: { no: string; text: string; days: number; score: number } | null = null;
  for (const c of clausesOf(text)) {
    const days = /within (\d{1,3}) days of (?!the end)(?:the |its |such )?(hindrance|delay|event|occurrence|cause|date)/i.exec(c.body) ?? /within (\d{1,3}) days\b/i.exec(c.body);
    if (!days || !/\b(hindrance|delay|extension of time)\b/i.test(c.body) || /\bend of the (hindrance|delay)\b/i.test(c.body)) continue;
    const score = /\b(notice|notify|intimat\w*)\b/i.test(c.body) ? 2 : /\b(apply|application|inform)\b/i.test(c.body) ? 1 : 0;
    if (!score) continue;
    if (!best || score > best.score) best = { no: c.no, text: `${c.no} ${c.body}`, days: Number(days[1]), score };
  }
  return best ? { no: best.no, text: best.text, days: best.days } : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// The notice clock

export interface Clock {
  due: string;
  daysLeft: number;
  /** The watch-list stage it is at (7, 3 or 0 days left or fewer), null while more than 7 days remain */
  stage: (typeof NOTICE_STAGES)[number] | null;
}

/** When the notice for a hindrance that began on `delayStart` is due, how many days are left on `today` and its stage. */
export function noticeClock(delayStart: string, noticeDays: number, today: string): Clock {
  const due = addDays(delayStart, noticeDays);
  const daysLeft = daysBetween(today, due);
  const stage = [...NOTICE_STAGES].reverse().find((s) => daysLeft <= s) ?? null;
  return { due, daysLeft, stage };
}

// ---------------------------------------------------------------------------------------------------------------------
// The notice letter

export interface NoticeFacts {
  projectName: string;
  agreementNo: string | null;
  title: string;
  description: string | null;
  categoryLabel: string;
  activityName: string | null;
  delayStart: string;
  delayEnd: string | null;
  today: string;
  /** DPR remarks recorded into the delay, oldest first */
  remarks: { date: string; text: string }[];
  photos: number;
  clause: { no: string; docNo: string; days: number } | null;
  noticeDays: number;
  /** Clause on extension of time, if found */
  eotClause: string | null;
  party: DelayParty | null;
}

const longDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** What each party is asked to do in the notice. */
const ASK: Record<DelayParty, string> = {
  CLIENT: 'We request you to remove the hindrance at the earliest, and to give us your instructions',
  THIRD_PARTY: 'We request you to take up the matter with the authority concerned so that the hindrance is removed at the earliest',
  FORCE_MAJEURE: 'We request you to take note of this event beyond our control',
  CONTRACTOR: 'We are taking steps to recover the time lost',
};

/** The notice's subject and text, from the delay's own facts only. */
export function noticeLetter(f: NoticeFacts): { subject: string; lines: string[] } {
  const late = daysBetween(f.delayStart, f.today) > f.noticeDays;
  const held = f.delayEnd ? `from ${longDate(f.delayStart)} to ${longDate(f.delayEnd)}` : `since ${longDate(f.delayStart)}`;
  const lost = delayDays(f.delayStart, f.delayEnd, f.today) ?? 0;
  const lines = [
    `${f.clause ? `Under Clause ${f.clause.no} of the agreement${f.agreementNo ? ` ${f.agreementNo}` : ''}` : `Under the agreement${f.agreementNo ? ` ${f.agreementNo}` : ''}`}, we give you notice that the work${f.activityName ? ` of ${f.activityName}` : ''} at ${f.projectName} has been held up ${held} (${f.categoryLabel.toLowerCase()}).`,
    ...(f.description ? ['', f.description] : []),
    ...(f.remarks.length ? ['', 'As recorded in our daily progress reports:', ...f.remarks.map((r) => `- ${longDate(r.date)}: ${r.text}`)] : []),
    '',
    `${f.delayEnd ? `The hindrance lasted ${lost} ${lost === 1 ? 'day' : 'days'}.` : `The hindrance continues; so far ${lost} ${lost === 1 ? 'day has' : 'days have'} been lost.`}${f.photos ? ` Photographs taken at site (${f.photos}) are enclosed.` : ''}`,
    '',
    `${ASK[f.party ?? 'CLIENT']}, and to record this hindrance in the hindrance register.${f.party !== 'CONTRACTOR' ? ` We reserve our right to an extension of time${f.eotClause ? ` under Clause ${f.eotClause}` : ''} for the delay.` : ''}`,
    ...(late ? ['', `This notice is sent after the ${f.noticeDays} days the agreement allows; the hindrance has been recorded at site since it began.`] : []),
  ];
  return { subject: `Notice of hindrance: ${f.title}`, lines };
}

/** The extension-of-time clause in a page of the contract: the one about claiming it, else one that grants or entitles to it. */
export function eotClause(text: string): string | null {
  const scored = clausesOf(text)
    .filter((c) => /\bextension of time\b/i.test(c.body) && !/\bnotice\b/i.test(c.body))
    .map((c) => ({ no: c.no, score: /\bclaim\w*\b/i.test(c.body) ? 2 : /\b(apply|grant\w*|entitled)\b/i.test(c.body) ? 1 : 0 }))
    .filter((c) => c.score > 0)
    .sort((x, y) => y.score - x.score);
  return scored[0]?.no ?? null;
}
