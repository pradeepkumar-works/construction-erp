/**
 * Grades drafts from a sentence (AI item 71) through a running API with the real model: 40 sentences in English, Hindi
 * and Hinglish, asked as the demo users they suit, each with the draft it should give (kind, project, items matched
 * to the item master, quantities, units, dates worked out from today, amounts, activities, manpower, letters). It also
 * checks that asking saved nothing. Each sentence costs a model call, so run it by hand against a deployment:
 *
 *   DRAFT_EVAL_API=https://nirmaan-api.cogitrex.ai/api npx tsx scripts/draft-eval.ts [--only mr-01,dpr-03] [--report file.md]
 */
import { writeFileSync } from 'node:fs';
import type { AiDraftDto, AiDraftKind, AiMessageDto } from '@erp/shared';

const API = process.env.DRAFT_EVAL_API ?? 'http://localhost:4000/api';
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const reportPath = args.includes('--report') ? args[args.indexOf('--report') + 1] : null;

type Lang = 'en' | 'hi' | 'hinglish';
type DateWant = 'today' | 'yesterday' | 'tomorrow' | 'mon' | 'wed' | 'fri' | 'week';

interface Case {
  id: string;
  lang: Lang;
  user: string;
  text: string;
  kind: AiDraftKind;
  project: string;
  items?: [name: string, qty: number, unit?: string][];
  date?: DateWant;
  priority?: string;
  amount?: number;
  gstRate?: number;
  category?: string | string[];
  paymentMode?: string;
  vendorHas?: string;
  activity?: string;
  quantity?: number;
  locationHas?: string;
  manpower?: Record<string, number>;
  machineryHas?: string;
  weather?: string | string[];
  has?: Partial<Record<'workExecuted' | 'issues' | 'nextDayPlan' | 'testsConducted' | 'subject' | 'summary' | 'party', RegExp>>;
  coverNote?: boolean;
}

const E = 'engineer@demo.com';
const E2 = 'engineer2@demo.com';
const PM = 'pm@demo.com';
const PM2 = 'pm2@demo.com';
const RD = 'RD-2026-01';
const WS = 'WS-2026-03';
const BL = 'BL-2026-02';

const CASES: Case[] = [
  // Material requests
  { id: 'mr-01', lang: 'en', user: E, text: 'Raise an MR for 200 bags of OPC 53 cement for the highway by Friday', kind: 'material-request', project: RD, items: [['OPC 53 Grade Cement', 200, 'Bags']], date: 'fri' },
  { id: 'mr-02', lang: 'en', user: E, text: 'We need 2 MT TMT 12mm and 50 kg binding wire for the Puri highway, urgent, needed tomorrow', kind: 'material-request', project: RD, items: [['TMT Fe500D 12mm', 2, 'MT'], ['Binding wire', 50, 'Kg']], priority: 'URGENT', date: 'tomorrow' },
  { id: 'mr-03', lang: 'en', user: E, text: 'Indent 300 Rmt of HDPE 110mm pipe and 20 electrofusion couplers for the Jajpur water project', kind: 'material-request', project: WS, items: [['HDPE PE100 110mm PN6', 300, 'Rmt'], ['HDPE electrofusion coupler 110mm', 20, 'Nos']] },
  { id: 'mr-04', lang: 'en', user: E, text: 'MR for 10 MT bitumen VG-30 and 2000 litres emulsion for RD-2026-01, needed by Monday', kind: 'material-request', project: RD, items: [['Bitumen VG-30', 10, 'MT'], ['Emulsion SS-1', 2000, 'Ltr']], date: 'mon' },
  { id: 'mr-05', lang: 'en', user: E, text: 'Raise an indent for 40 cum of 20mm aggregate on the highway', kind: 'material-request', project: RD, items: [['Aggregate 20mm', 40, 'Cum']], date: 'week' },
  { id: 'mr-06', lang: 'hi', user: E, text: 'हाईवे प्रोजेक्ट के लिए शुक्रवार तक OPC 53 सीमेंट की 150 बोरी का MR बनाओ', kind: 'material-request', project: RD, items: [['OPC 53 Grade Cement', 150, 'Bags']], date: 'fri' },
  { id: 'mr-07', lang: 'hi', user: E, text: 'जाजपुर जल परियोजना के लिए 100 मीटर DI K9 400mm पाइप चाहिए, सोमवार तक', kind: 'material-request', project: WS, items: [['DI K9 pipe 400mm', 100, 'Rmt']], date: 'mon' },
  { id: 'mr-08', lang: 'hinglish', user: E, text: 'Highway ke liye 500 litre diesel ka MR bana do, kal tak chahiye', kind: 'material-request', project: RD, items: [['Diesel', 500, 'Ltr']], date: 'tomorrow' },
  { id: 'mr-09', lang: 'hinglish', user: E, text: 'Puri highway pe 20 kg grease aur 50 litre hydraulic oil 68 chahiye, urgent hai', kind: 'material-request', project: RD, items: [['Grease (lithium)', 20, 'Kg'], ['Hydraulic oil 68', 50, 'Ltr']], priority: 'URGENT' },
  { id: 'mr-10', lang: 'en', user: E2, text: 'Raise an MR for 100 sheets of 12mm shuttering plywood for Hospital Block B by Wednesday', kind: 'material-request', project: BL, items: [['Shuttering plywood 12mm', 100]], date: 'wed' },
  { id: 'mr-11', lang: 'hi', user: E2, text: 'अस्पताल ब्लॉक B के लिए 5 MT TMT 12mm सरिया का MR बनाओ', kind: 'material-request', project: BL, items: [['TMT Fe500D 12mm', 5, 'MT']] },
  { id: 'mr-12', lang: 'en', user: E, text: 'MR for 4 oil filters for the EX200 excavator on the highway', kind: 'material-request', project: RD, items: [['Oil filter (EX200)', 4, 'Nos']] },

  // Site expenses
  { id: 'ex-01', lang: 'en', user: E, text: 'Book an expense of ₹2,400 for diesel for the generator on the highway, paid by UPI', kind: 'expense', project: RD, amount: 2400, category: 'FUEL', paymentMode: 'UPI', date: 'today' },
  { id: 'ex-02', lang: 'en', user: E, text: 'Spent 850 rupees on tea and snacks for the labour meeting today at the highway site', kind: 'expense', project: RD, amount: 850, category: 'FOOD_WELFARE', date: 'today' },
  { id: 'ex-03', lang: 'en', user: E, text: 'Log a site expense: ₹12,000 tractor hire for shifting pipes at Jajpur, paid cash yesterday', kind: 'expense', project: WS, amount: 12000, category: ['TRANSPORT', 'OTHER'], paymentMode: 'CASH', date: 'yesterday' },
  { id: 'ex-04', lang: 'hi', user: E, text: 'हाईवे साइट पर जनरेटर की मरम्मत के लिए 3500 रुपये नकद दिए, इसका खर्च दर्ज करो', kind: 'expense', project: RD, amount: 3500, category: 'REPAIRS', paymentMode: 'CASH' },
  { id: 'ex-05', lang: 'hinglish', user: E, text: 'Highway site pe 1200 ka safety helmet aur gloves liya, UPI se pay kiya, expense daal do', kind: 'expense', project: RD, amount: 1200, category: 'SAFETY', paymentMode: 'UPI' },
  { id: 'ex-06', lang: 'hinglish', user: E, text: 'Jajpur site ke liye 600 rupaye auto bhada diya cash mein, expense bana do', kind: 'expense', project: WS, amount: 600, category: ['TRANSPORT', 'TRAVEL'], paymentMode: 'CASH' },
  { id: 'ex-07', lang: 'en', user: E, text: 'Expense ₹4,720 including 18% GST for a hydraulic hose from Sahoo Auto Parts on the highway, bill SAP-221, paid by card', kind: 'expense', project: RD, amount: 4000, gstRate: 18, category: 'REPAIRS', paymentMode: 'CARD', vendorHas: 'Sahoo' },
  { id: 'ex-08', lang: 'hi', user: E, text: 'जाजपुर साइट ऑफिस का बिजली बिल 2,150 रुपये बैंक से भरा, खर्च दर्ज करो', kind: 'expense', project: WS, amount: 2150, category: 'RENT_UTILITIES', paymentMode: 'BANK' },

  // Progress entries
  { id: 'pr-01', lang: 'en', user: E, text: 'Log progress: 120 cum of GSB laying today on the highway', kind: 'progress', project: RD, activity: 'GSB laying', quantity: 120, date: 'today' },
  { id: 'pr-02', lang: 'en', user: E, text: 'Book 85 MT of DBM paving done yesterday on the highway at km 16', kind: 'progress', project: RD, activity: 'DBM paving', quantity: 85, date: 'yesterday', locationHas: '16' },
  { id: 'pr-03', lang: 'en', user: E, text: 'Progress entry for Jajpur: 450 metres of distribution network laid today in Barchana village', kind: 'progress', project: WS, activity: 'Distribution network', quantity: 450, date: 'today' },
  { id: 'pr-04', lang: 'hi', user: E, text: 'हाईवे पर आज 200 घन मीटर मिट्टी का भराव (earthwork embankment) हुआ, प्रगति दर्ज करो', kind: 'progress', project: RD, activity: 'Earthwork embankment', quantity: 200, date: 'today' },
  { id: 'pr-05', lang: 'hinglish', user: E, text: 'Jajpur mein aaj 12 house connections ho gaye, progress daal do', kind: 'progress', project: WS, activity: 'House connections', quantity: 12, date: 'today' },
  { id: 'pr-06', lang: 'hinglish', user: E, text: 'Highway pe kal 60 cum WMM bichaya, progress entry bana do', kind: 'progress', project: RD, activity: 'WMM laying', quantity: 60, date: 'yesterday' },
  { id: 'pr-07', lang: 'en', user: E2, text: 'Record 35 cum of brick masonry on Hospital Block B for today', kind: 'progress', project: BL, activity: 'Brick masonry', quantity: 35, date: 'today' },
  { id: 'pr-08', lang: 'hi', user: E2, text: 'अस्पताल ब्लॉक B में आज 180 वर्ग मीटर अंदर का प्लास्टर हुआ, प्रगति दर्ज करो', kind: 'progress', project: BL, activity: 'Internal plaster', quantity: 180, date: 'today' },

  // DPRs from rough notes
  { id: 'dpr-01', lang: 'en', user: E, text: "Make today's DPR for the highway: 8 masons, 20 helpers, 2 operators. GSB laying 120 cum km 14 to 15. Rain from 3 pm stopped work. Tomorrow WMM at km 15.", kind: 'dpr', project: RD, manpower: { Mason: 8, Helper: 20, Operator: 2 }, weather: 'RAINY', has: { workExecuted: /GSB/i, nextDayPlan: /WMM/i }, date: 'today' },
  { id: 'dpr-02', lang: 'en', user: E, text: 'DPR for Jajpur: 12 helpers and 3 plumbers laid 300 m of HDPE in Barchana. JCB 6 hours. Pipe shortage for tomorrow.', kind: 'dpr', project: WS, manpower: { Helper: 12, Plumber: 3 }, machineryHas: 'JCB', has: { workExecuted: /HDPE/i, issues: /pipe/i } },
  { id: 'dpr-03', lang: 'hi', user: E, text: 'हाईवे का आज का DPR बनाओ: 6 मिस्त्री, 15 मजदूर, DBM 80 टन बिछाया, धूप थी', kind: 'dpr', project: RD, manpower: { Mason: 6, Helper: 15 }, weather: ['SUNNY', 'HOT'], has: { workExecuted: /DBM/i } },
  { id: 'dpr-04', lang: 'hinglish', user: E, text: 'Aaj ka DPR highway ka: 10 mason, 25 helper, paver 8 ghante chala, BC paving 60 MT hua', kind: 'dpr', project: RD, manpower: { Mason: 10, Helper: 25 }, machineryHas: 'paver', has: { workExecuted: /BC/i } },
  { id: 'dpr-05', lang: 'hinglish', user: E2, text: 'Hospital Block B ka DPR banao: 4 carpenter, 6 bar bender, first floor slab ki shuttering chal rahi hai, koi issue nahi', kind: 'dpr', project: BL, manpower: { Carpenter: 4, 'Bar Bender': 6 }, has: { workExecuted: /shutter/i } },
  { id: 'dpr-06', lang: 'en', user: E2, text: 'Daily report for Hospital Block B: GF slab curing, 5 helpers, 7-day cube test passed at 21 MPa', kind: 'dpr', project: BL, manpower: { Helper: 5 }, has: { workExecuted: /curing/i, testsConducted: /21/ } },

  // Letters
  { id: 'lt-01', lang: 'en', user: PM, text: 'Write a covering letter for the latest RA bill on the highway', kind: 'letter', project: RD, coverNote: true },
  { id: 'lt-02', lang: 'en', user: PM, text: 'Write to the Executive Engineer about the land handover delay at km 18 to 19 on the highway, asking for possession by 31 October', kind: 'letter', project: RD, has: { subject: /land|handover|possession/i, party: /Executive Engineer/i, summary: /31 Oct/i } },
  { id: 'lt-03', lang: 'hi', user: PM, text: 'जाजपुर परियोजना के लिए ग्राहक को पत्र लिखो कि बिजली कनेक्शन में देरी से WTP का काम रुका है', kind: 'letter', project: WS, has: { summary: /WTP/ } },
  { id: 'lt-04', lang: 'hinglish', user: PM, text: 'Highway ke client ko letter likho ki RA bill 2 ka payment 45 din se pending hai', kind: 'letter', project: RD, has: { subject: /payment|RA bill/i } },
  { id: 'lt-05', lang: 'en', user: PM2, text: "Draft the covering letter for Hospital Block B's latest RA bill", kind: 'letter', project: BL, coverNote: true },
  { id: 'lt-06', lang: 'en', user: PM, text: 'Write a letter to RWSS Odisha for the Jajpur project asking for approval of the revised pipe alignment drawing', kind: 'letter', project: WS, has: { party: /RWSS/i, subject: /alignment|drawing/i } },
];

interface Grade {
  name: string;
  ok: boolean;
  got?: unknown;
  want?: unknown;
}

const todayIst = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
function shift(d: string, days: number) {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}
/** The coming weekday (`by Friday` on a Friday is a week on). */
function coming(dow: number) {
  const today = todayIst();
  const now = new Date(`${today}T00:00:00Z`).getUTCDay();
  return shift(today, ((dow - now + 7) % 7) || 7);
}
function wantDate(w: DateWant): string[] {
  const t = todayIst();
  if (w === 'today') return [t];
  if (w === 'yesterday') return [shift(t, -1)];
  if (w === 'tomorrow') return [shift(t, 1)];
  if (w === 'week') return [shift(t, 7)];
  const dow = { mon: 1, wed: 3, fri: 5 }[w];
  // "By Friday" said on a Thursday is tomorrow; said on a Friday some mean today. Either reading is right.
  const next = coming(dow);
  return new Date(`${t}T00:00:00Z`).getUTCDay() === dow ? [t, next] : [next];
}

const lc = (v: unknown) => String(v ?? '').toLowerCase();

async function login(email: string): Promise<string> {
  const res = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'password123' }) });
  if (!res.ok) throw new Error(`login ${email}: ${res.status}`);
  return ((await res.json()) as { accessToken: string }).accessToken;
}
const get = async <T>(tok: string, path: string): Promise<T> => {
  const res = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${tok}` } });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return (await res.json()) as T;
};

async function ask(tok: string, question: string): Promise<{ message?: AiMessageDto; error?: string; ms: number }> {
  const started = Date.now();
  const res = await fetch(`${API}/ai/ask`, { method: 'POST', headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json' }, body: JSON.stringify({ question }) });
  if (!res.ok) return { error: `${res.status} ${(await res.text()).slice(0, 200)}`, ms: Date.now() - started };
  const body = await res.text();
  let message: AiMessageDto | undefined;
  let error: string | undefined;
  for (const chunk of body.split('\n\n')) {
    const line = chunk.split('\n').find((l) => l.startsWith('data: '));
    if (!line) continue;
    const e = JSON.parse(line.slice(6)) as { type: string; message?: unknown };
    if (e.type === 'done') message = e.message as AiMessageDto;
    if (e.type === 'error') error = String(e.message);
  }
  return { message, error, ms: Date.now() - started };
}

/** Totals the user's lists show, to see that asking saved nothing. */
async function counts(tok: string) {
  const total = async (path: string) => (await get<{ total: number }>(tok, `${path}?pageSize=1`).catch(() => ({ total: -1 }))).total;
  return Promise.all(['/material-requests', '/expenses', '/progress', '/dpr', '/letters'].map(total));
}

function grade(c: Case, d: AiDraftDto | undefined, projects: Map<string, string>, activities: Map<string, string>): Grade[] {
  const out: Grade[] = [{ name: 'kind', ok: d?.kind === c.kind, got: d?.kind ?? 'no draft', want: c.kind }];
  if (!d) return out;
  const v = d.values;
  out.push({ name: 'project', ok: d.projectId === projects.get(c.project), got: d.projectName, want: c.project });
  if (c.items) {
    const lines = (v.items ?? []) as { itemName: string; quantity: number; unit: string }[];
    out.push({ name: 'line count', ok: lines.length === c.items.length, got: lines.length, want: c.items.length });
    c.items.forEach(([name, qty, unit], i) => {
      const l = lines.find((x) => lc(x.itemName) === lc(name));
      out.push({ name: `item ${name}`, ok: !!l && Number(l.quantity) === qty && (!unit || lc(l.unit) === lc(unit)), got: l ? `${l.itemName} ${l.quantity} ${l.unit}` : lines.map((x) => x.itemName).join('; '), want: `${name} ${qty} ${unit ?? ''}`.trim() });
      void i;
    });
  }
  const dateField = c.kind === 'material-request' ? 'requiredDate' : 'date';
  if (c.date) {
    const want = wantDate(c.date);
    out.push({ name: 'date', ok: want.includes(String(v[dateField])), got: v[dateField], want: want.join(' or ') });
  }
  if (c.priority) out.push({ name: 'priority', ok: v.priority === c.priority, got: v.priority, want: c.priority });
  if (c.amount !== undefined) out.push({ name: 'amount', ok: Math.abs(Number(v.amount) - c.amount) <= 1, got: v.amount, want: c.amount });
  if (c.gstRate !== undefined) out.push({ name: 'GST rate', ok: Number(v.gstRate) === c.gstRate, got: v.gstRate, want: c.gstRate });
  if (c.category) {
    const want = Array.isArray(c.category) ? c.category : [c.category];
    out.push({ name: 'category', ok: want.includes(String(v.category)), got: v.category, want: want.join(' or ') });
  }
  if (c.paymentMode) out.push({ name: 'paid by', ok: v.paymentMode === c.paymentMode, got: v.paymentMode, want: c.paymentMode });
  if (c.vendorHas) out.push({ name: 'vendor', ok: lc(v.vendor).includes(lc(c.vendorHas)), got: v.vendor, want: c.vendorHas });
  if (c.activity) {
    const want = activities.get(`${c.project}:${c.activity}`);
    out.push({ name: 'activity', ok: !!want && v.activityId === want, got: v.activityId ? [...activities].find(([, id]) => id === v.activityId)?.[0] : 'none', want: c.activity });
  }
  if (c.quantity !== undefined) out.push({ name: 'quantity', ok: Number(v.quantity) === c.quantity, got: v.quantity, want: c.quantity });
  if (c.locationHas) out.push({ name: 'location', ok: lc(v.location).includes(lc(c.locationHas)), got: v.location, want: c.locationHas });
  if (c.manpower) {
    const said = (v.manpower ?? []) as { category: string; count: number }[];
    for (const [cat, n] of Object.entries(c.manpower)) {
      const row = said.find((m) => lc(m.category) === lc(cat));
      out.push({ name: `manpower ${cat}`, ok: row?.count === n, got: row ? `${row.category} ${row.count}` : said.map((m) => `${m.category} ${m.count}`).join(', '), want: `${cat} ${n}` });
    }
  }
  if (c.machineryHas) {
    const m = (v.machinery ?? []) as { name: string; hours: number }[];
    out.push({ name: 'machinery', ok: m.some((x) => lc(x.name).includes(lc(c.machineryHas))), got: m.map((x) => `${x.name} ${x.hours}h`).join(', '), want: c.machineryHas });
  }
  if (c.weather) {
    const want = Array.isArray(c.weather) ? c.weather : [c.weather];
    out.push({ name: 'weather', ok: want.includes(String(v.weather)), got: v.weather, want: want.join(' or ') });
  }
  for (const [field, re] of Object.entries(c.has ?? {})) out.push({ name: field, ok: re!.test(String(v[field] ?? '')), got: String(v[field] ?? '').slice(0, 80), want: String(re) });
  if (c.coverNote) out.push({ name: 'cover note from the bill', ok: /Net payable: ₹[\d,]+\.\d{2}/.test(String(v.summary ?? '')), got: String(v.summary ?? '').slice(0, 80), want: 'Net payable from the bill' });
  // A figure the model made up in the text is marked, so it counts against the draft only when unmarked.
  return out;
}

async function main() {
  const cases = CASES.filter((c) => !only || only.includes(c.id));
  const users = [...new Set(cases.map((c) => c.user))];
  const tokens = new Map<string, string>();
  for (const u of users) tokens.set(u, await login(u));
  const admin = await login('admin@demo.com');
  const projects = new Map((await get<{ items: { id: string; code: string }[] }>(admin, '/projects?pageSize=100')).items.map((p) => [p.code, p.id]));
  const activities = new Map<string, string>();
  for (const [code, id] of projects) for (const a of await get<{ id: string; name: string }[]>(admin, `/projects/${id}/activities`)) activities.set(`${code}:${a.name}`, a.id);

  const before = await Promise.all(users.map((u) => counts(tokens.get(u)!)));
  const rows: string[] = [];
  const byLang = new Map<Lang, { ok: number; n: number; drafts: number }>();
  const times: number[] = [];
  let fieldsOk = 0;
  let fieldsN = 0;
  let fullyRight = 0;
  for (const c of cases) {
    const { message, error, ms } = await ask(tokens.get(c.user)!, c.text);
    times.push(ms);
    const d = message?.drafts?.find((x) => x.kind === c.kind) ?? message?.drafts?.[0];
    const grades = grade(c, d, projects, activities);
    const bad = grades.filter((g) => !g.ok);
    fieldsOk += grades.length - bad.length;
    fieldsN += grades.length;
    if (!bad.length) fullyRight++;
    const l = byLang.get(c.lang) ?? { ok: 0, n: 0, drafts: 0 };
    l.n++;
    if (!bad.length) l.ok++;
    if (d?.kind === c.kind) l.drafts++;
    byLang.set(c.lang, l);
    const detail = bad.map((g) => `${g.name}: got ${JSON.stringify(g.got)}, want ${JSON.stringify(g.want)}`);
    console.log(`${bad.length ? '✗' : '✓'} ${c.id} (${c.lang}, ${(ms / 1000).toFixed(1)} s)${error ? ` error: ${error}` : ''}${detail.map((x) => `\n    ${x}`).join('')}${d?.flags.length ? `\n    flags: ${d.flags.map((f) => f.note).join('; ')}` : ''}`);
    rows.push(`| ${c.id} | ${c.lang} | ${c.text.replace(/\|/g, '/')} | ${bad.length ? detail.join('; ').replace(/\|/g, '/') : 'right'} |`);
  }
  const after = await Promise.all(users.map((u) => counts(tokens.get(u)!)));
  const savedNothing = JSON.stringify(before) === JSON.stringify(after);
  times.sort((a, b) => a - b);
  const summary = [
    `Asked ${cases.length} sentences through ${API}: ${fullyRight} drafted entirely right (${((fullyRight / Math.max(1, cases.length)) * 100).toFixed(0)}%), ${fieldsOk} of ${fieldsN} checked fields right (${((fieldsOk / Math.max(1, fieldsN)) * 100).toFixed(1)}%). Median ${((times[Math.floor(times.length / 2)] ?? 0) / 1000).toFixed(1)} s.`,
    `Saved nothing: ${savedNothing ? 'yes' : `no (${JSON.stringify(before)} → ${JSON.stringify(after)})`}.`,
    '',
    '| Language | Sentences | Right draft kind | Entirely right |',
    '|---|---|---|---|',
    ...[...byLang].map(([lang, s]) => `| ${lang} | ${s.n} | ${s.drafts} | ${s.ok} |`),
  ].join('\n');
  console.log(`\n${summary}`);
  if (reportPath) writeFileSync(reportPath, `# Drafts from a sentence: 40-sentence check\n\n${summary}\n\n| Case | Language | Sentence | Result |\n|---|---|---|---|\n${rows.join('\n')}\n`);
  if (!savedNothing) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
