import type { ActivityLinkType } from '@erp/shared';
import { dayNo } from './schedule-rules';

/**
 * Schedules to and from MS Project XML and Primavera P6 XER. Days are calendar days; a file's working
 * hours become days at 8 hours a day. Pure functions, tested in `src/scripts/schedule-links-test.ts`.
 *
 * A row keeps the file's own id (`key`: MS Project's UID, P6's task_id) so a second import of the same plan finds
 * the same activity even where names repeat ("Approval of drawings" under every discipline). The summary row
 * right above a task becomes its parent activity (named with the row above it, since activities nest one level).
 */
export interface FileActivity {
  key: string;
  name: string;
  start: string;
  end: string;
  /** The summary row this task sits under, when the file has one */
  parentKey?: string | null;
  /** A summary row: becomes the parent activity of the tasks under it */
  summary?: boolean;
}
export interface FileMilestone {
  key: string;
  name: string;
  date: string;
}
export interface FileLink {
  predKey: string;
  succKey: string;
  type: ActivityLinkType;
  lagDays: number;
}
export interface ScheduleFile {
  activities: FileActivity[];
  links: FileLink[];
  milestones: FileMilestone[];
  skipped: string[];
}

const HOURS_PER_DAY = 8;
const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const xmlUnesc = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');
const days = (start: string, end: string) => dayNo(end) - dayNo(start) + 1;

// MS Project: 0 FF, 1 FS, 2 SF, 3 SS.
const MSP_TYPE: Record<ActivityLinkType, number> = { FF: 0, FS: 1, SF: 2, SS: 3 };
const MSP_TYPE_BACK: Record<string, ActivityLinkType> = { '0': 'FF', '1': 'FS', '2': 'SF', '3': 'SS' };

/** `uids` keeps an activity's UID from an earlier import, so the file goes back to MS Project with the same ids. */
export function toMsProjectXml(project: { code: string; name: string; start: string | null }, activities: FileActivity[], links: FileLink[], uids?: Map<string, number>): string {
  const uid = numberKeys(activities, uids);
  const tasks = activities.map((a, i) => {
    const preds = links
      .filter((l) => l.succKey === a.key && uid.has(l.predKey))
      .map(
        (l) =>
          `<PredecessorLink><PredecessorUID>${uid.get(l.predKey)}</PredecessorUID><Type>${MSP_TYPE[l.type]}</Type><CrossProject>0</CrossProject><LinkLag>${l.lagDays * HOURS_PER_DAY * 600}</LinkLag><LagFormat>7</LagFormat></PredecessorLink>`,
      )
      .join('');
    return `<Task><UID>${uid.get(a.key)}</UID><ID>${i + 1}</ID><Name>${xmlEsc(a.name)}</Name><Type>1</Type><IsNull>0</IsNull><OutlineLevel>1</OutlineLevel><Start>${a.start}T08:00:00</Start><Finish>${a.end}T17:00:00</Finish><Duration>PT${days(a.start, a.end) * HOURS_PER_DAY}H0M0S</Duration><DurationFormat>7</DurationFormat><Milestone>0</Milestone><Summary>0</Summary>${preds}</Task>`;
  });
  const start = project.start ?? activities.map((a) => a.start).sort()[0] ?? '';
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Project xmlns="http://schemas.microsoft.com/project">',
    `<Name>${xmlEsc(project.code)}</Name><Title>${xmlEsc(project.name)}</Title>`,
    start ? `<StartDate>${start}T08:00:00</StartDate>` : '',
    '<ScheduleFromStart>1</ScheduleFromStart><MinutesPerDay>480</MinutesPerDay><MinutesPerWeek>3360</MinutesPerWeek><DaysPerMonth>30</DaysPerMonth>',
    `<Tasks>${tasks.join('')}</Tasks>`,
    '</Project>',
    '',
  ].join('\n');
}

const tag = (xml: string, name: string) => {
  const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml);
  return m ? xmlUnesc(m[1].trim()) : null;
};

/** Each activity's number in a file: its own from an earlier import where it has one, the rest numbered after them. */
function numberKeys(activities: FileActivity[], kept: Map<string, number> | undefined, from = 1): Map<string, number> {
  const out = new Map<string, number>();
  const taken = new Set<number>();
  for (const a of activities) {
    const n = kept?.get(a.key);
    if (n !== undefined && !taken.has(n)) {
      out.set(a.key, n);
      taken.add(n);
    }
  }
  let next = Math.max(from - 1, ...taken) + 1;
  for (const a of activities) if (!out.has(a.key)) out.set(a.key, next++);
  return out;
}

/** "Detailed Engineering › Mechanical": a summary row's name with the summary above it. */
const summaryName = (name: string, above: string | null | undefined) => (above ? `${above} › ${name}` : name).slice(0, 200);

/**
 * Read an MS Project XML file: its tasks with the summary row each sits under, its milestones, and the links between
 * tasks. A summary row with tasks directly under it becomes a parent activity; one holding only other summary rows
 * gives its name to theirs.
 */
export function parseMsProjectXml(text: string): ScheduleFile {
  if (!/<Project[\s>]/.test(text)) throw new Error('This is not an MS Project XML file. Save the plan from MS Project as XML and try again.');
  const tasksXml = tag(text.replace(/<\/?(\w+:)/g, (m) => m.replace(/\w+:/, '')), 'Tasks') ?? '';
  const out: ScheduleFile = { activities: [], links: [], milestones: [], skipped: [] };
  const keys = new Set<string>();
  const summaries = new Map<string, FileActivity & { above: string | null }>();
  const stack: { key: string; level: number; name: string }[] = [];
  for (const m of tasksXml.matchAll(/<Task>([\s\S]*?)<\/Task>/g)) {
    const t = m[1];
    const key = tag(t, 'UID');
    const name = tag(t, 'Name');
    const start = tag(t, 'Start')?.slice(0, 10);
    const end = tag(t, 'Finish')?.slice(0, 10);
    if (!key || key === '0' || tag(t, 'IsNull') === '1') continue;
    const level = Number(tag(t, 'OutlineLevel') ?? 1) || 1;
    while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
    const under = stack[stack.length - 1] ?? null;
    const dated = !!start && !!end && /^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end);
    if (tag(t, 'Summary') === '1') {
      stack.push({ key, level, name: name ?? key });
      if (name && dated) summaries.set(key, { key, name, start: start!, end: end! < start! ? start! : end!, summary: true, above: under?.name ?? null });
      continue;
    }
    if (tag(t, 'Milestone') === '1') {
      if (name && start && /^\d{4}-\d{2}-\d{2}$/.test(start)) out.milestones.push({ key, name: name.slice(0, 200), date: start });
      else out.skipped.push(`Milestone ${key}: no name or date`);
      continue;
    }
    if (!name || !dated) {
      out.skipped.push(`Task ${key}: no name or dates`);
      continue;
    }
    keys.add(key);
    out.activities.push({ key, name: name.slice(0, 200), start: start!, end: end! < start! ? start! : end!, parentKey: under?.key ?? null });
    for (const p of t.matchAll(/<PredecessorLink>([\s\S]*?)<\/PredecessorLink>/g)) {
      const predKey = tag(p[1], 'PredecessorUID');
      const type = MSP_TYPE_BACK[tag(p[1], 'Type') ?? '1'] ?? 'FS';
      const lag = Number(tag(p[1], 'LinkLag') ?? 0);
      if (predKey) out.links.push({ predKey, succKey: key, type, lagDays: Math.round(lag / (HOURS_PER_DAY * 600)) });
    }
  }
  return withParents(dropStray(out, keys), summaries);
}

/** The summary rows that hold tasks become parent activities, put before their tasks; a task under any other has none. */
function withParents(file: ScheduleFile, summaries: Map<string, FileActivity & { above: string | null }>): ScheduleFile {
  const used = new Set(file.activities.map((a) => a.parentKey).filter((k): k is string => !!k && summaries.has(k)));
  const placed = new Set<string>();
  const activities: FileActivity[] = [];
  for (const a of file.activities) {
    const parentKey = a.parentKey && used.has(a.parentKey) ? a.parentKey : null;
    if (parentKey && !placed.has(parentKey)) {
      const s = summaries.get(parentKey)!;
      activities.push({ key: s.key, name: summaryName(s.name, s.above), start: s.start, end: s.end, parentKey: null, summary: true });
      placed.add(parentKey);
    }
    activities.push({ ...a, parentKey });
  }
  return { ...file, activities };
}

const XER_TYPE: Record<ActivityLinkType, string> = { FS: 'PR_FS', SS: 'PR_SS', FF: 'PR_FF', SF: 'PR_SF' };

/** A Primavera P6 XER file with the project, its tasks (as task-dependent activities) and their links. */
export function toXer(project: { code: string; name: string }, activities: FileActivity[], links: FileLink[], exportedOn: string, taskIds?: Map<string, number>): string {
  const id = numberKeys(activities, taskIds, 1000);
  const row = (cells: (string | number)[]) => `%R\t${cells.map((c) => String(c).replace(/[\t\r\n]+/g, ' ')).join('\t')}`;
  const lines = [
    `ERMHDR\t19.12\t${exportedOn}\tProject\tadmin\tNirmaan\tdbxDatabaseNoName\tProject Management\tINR`,
    '%T\tPROJECT',
    '%F\tproj_id\tproj_short_name\tproj_name',
    row([1, project.code, project.name]),
    '%T\tTASK',
    '%F\ttask_id\tproj_id\ttask_code\ttask_name\ttask_type\tstatus_code\ttarget_start_date\ttarget_end_date\ttarget_drtn_hr_cnt',
    ...activities.map((a, i) => row([id.get(a.key)!, 1, `A${(i + 1) * 10}`, a.name, 'TT_Task', 'TK_NotStart', `${a.start} 08:00`, `${a.end} 17:00`, days(a.start, a.end) * HOURS_PER_DAY])),
    '%T\tTASKPRED',
    '%F\ttask_pred_id\ttask_id\tpred_task_id\tproj_id\tpred_proj_id\tpred_type\tlag_hr_cnt',
    ...links.filter((l) => id.has(l.predKey) && id.has(l.succKey)).map((l, i) => row([i + 1, id.get(l.succKey)!, id.get(l.predKey)!, 1, 1, XER_TYPE[l.type], l.lagDays * HOURS_PER_DAY])),
    '%E',
    '',
  ];
  return lines.join('\r\n');
}

/**
 * Read a Primavera XER file: the TASK rows that are activities, its milestones, the TASKPRED links, and the WBS
 * node (PROJWBS) each task sits in, which becomes its parent activity.
 */
export function parseXer(text: string): ScheduleFile {
  if (!/^ERMHDR/m.test(text) || !/%T\s+TASK/.test(text)) throw new Error('This is not a Primavera XER file. Export the project from P6 as XER and try again.');
  const tables = new Map<string, Record<string, string>[]>();
  let table = '';
  let fields: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const cells = raw.split('\t');
    if (cells[0] === '%T') {
      table = cells[1]?.trim() ?? '';
      tables.set(table, []);
    } else if (cells[0] === '%F') fields = cells.slice(1).map((f) => f.trim());
    else if (cells[0] === '%R' && table) tables.get(table)!.push(Object.fromEntries(fields.map((f, i) => [f, (cells[i + 1] ?? '').trim()])));
  }
  const out: ScheduleFile = { activities: [], links: [], milestones: [], skipped: [] };
  const keys = new Set<string>();
  const wbs = new Map((tables.get('PROJWBS') ?? []).map((w) => [w.wbs_id, w]));
  const wbsName = (id: string | undefined) => {
    const w = id ? wbs.get(id) : undefined;
    return w && w.proj_node_flag !== 'Y' ? w.wbs_name || w.wbs_short_name || null : null;
  };
  const spans = new Map<string, { start: string; end: string }>();
  for (const t of tables.get('TASK') ?? []) {
    const name = t.task_name || t.task_code;
    const start = (t.act_start_date || t.target_start_date || t.early_start_date || '').slice(0, 10);
    const end = (t.act_end_date || t.target_end_date || t.early_end_date || '').slice(0, 10);
    if (t.task_type === 'TT_Mile' || t.task_type === 'TT_FinMile') {
      const date = t.task_type === 'TT_FinMile' ? end || start : start || end;
      if (name && /^\d{4}-\d{2}-\d{2}$/.test(date)) out.milestones.push({ key: t.task_id, name: name.slice(0, 200), date });
      else out.skipped.push(`Milestone “${name}”: no date`);
      continue;
    }
    if (t.task_type === 'TT_WBS' || t.task_type === 'TT_LOE') {
      out.skipped.push(`Summary row “${name}”`);
      continue;
    }
    if (!t.task_id || !name || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      out.skipped.push(`Task ${t.task_code || t.task_id}: no name or dates`);
      continue;
    }
    keys.add(t.task_id);
    const parentKey = wbsName(t.wbs_id) ? `WBS:${t.wbs_id}` : null;
    const finish = end < start ? start : end;
    if (parentKey) {
      const s = spans.get(parentKey);
      spans.set(parentKey, { start: s && s.start < start ? s.start : start, end: s && s.end > finish ? s.end : finish });
    }
    out.activities.push({ key: t.task_id, name: name.slice(0, 200), start, end: finish, parentKey });
  }
  for (const p of tables.get('TASKPRED') ?? []) {
    const type = (p.pred_type?.replace('PR_', '') ?? 'FS') as ActivityLinkType;
    out.links.push({ predKey: p.pred_task_id, succKey: p.task_id, type: ['FS', 'SS', 'FF', 'SF'].includes(type) ? type : 'FS', lagDays: Math.round(Number(p.lag_hr_cnt || 0) / HOURS_PER_DAY) });
  }
  const summaries = new Map(
    [...spans].map(([key, span]) => {
      const w = wbs.get(key.slice(4))!;
      return [key, { key, name: wbsName(w.wbs_id)!, ...span, summary: true, above: wbsName(w.parent_wbs_id) }];
    }),
  );
  return withParents(dropStray(out, keys), summaries);
}

/** Links to rows that were not read (milestones, other projects) are left out and counted. */
function dropStray(file: ScheduleFile, keys: Set<string>): ScheduleFile {
  const kept = file.links.filter((l) => keys.has(l.predKey) && keys.has(l.succKey) && l.predKey !== l.succKey);
  const dropped = file.links.length - kept.length;
  return { ...file, links: kept, skipped: dropped ? [...file.skipped, `${dropped} link${dropped === 1 ? '' : 's'} to rows not read`] : file.skipped };
}

/** An activity already on the project, as the import matches it. */
export interface ImportTarget {
  id: string;
  name: string;
  /** The file id it came from (`MSP_XML:12`, `XER:1001`), when an import made or matched it */
  scheduleKey: string | null;
  start: string | null;
  end: string | null;
  parentActivityId: string | null;
  workElementId: string | null;
  /** Progress is recorded against it, so it cannot take sub-activities */
  hasProgress: boolean;
}
export interface ImportMilestoneTarget {
  id: string;
  name: string;
  scheduleKey: string | null;
  date: string;
}
export type ImportAction = 'CREATE' | 'UPDATE' | 'SAME';
export interface ImportRow extends FileActivity {
  scheduleKey: string;
  matchId: string | null;
  action: ImportAction;
  /** The parent to give a new activity: an activity id, or the file key of a summary made in the same import */
  parent: { id: string } | { key: string } | null;
}
export interface ImportMilestoneRow extends FileMilestone {
  scheduleKey: string;
  matchId: string | null;
  action: ImportAction;
}
export interface ImportPlan {
  rows: ImportRow[];
  milestones: ImportMilestoneRow[];
  links: FileLink[];
  notes: string[];
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * What an import does: each row finds the activity it made last time by its file id, else an activity of the same name
 * when the name is used once in the file and once among the activities no file has claimed, else it is added. Dates
 * move on what it finds; a new activity goes under the parent the file gives it. A summary row that lands on an
 * activity with progress, or on a sub-activity, cannot take sub-activities, so its tasks are added without one.
 * Links come only between tasks (never a summary row).
 */
export function importPlan(format: string, file: ScheduleFile, existing: ImportTarget[], milestones: ImportMilestoneTarget[] = []): ImportPlan {
  const sk = (key: string) => `${format}:${key}`;
  const byKey = new Map(existing.filter((a) => a.scheduleKey).map((a) => [a.scheduleKey!, a]));
  const unclaimed = existing.filter((a) => !a.scheduleKey || !a.scheduleKey.startsWith(`${format}:`));
  const count = (xs: string[]) => xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map<string, number>());
  const inFile = count(file.activities.map((a) => norm(a.name)));
  const onProject = count(unclaimed.map((a) => norm(a.name)));
  const byName = new Map(unclaimed.filter((a) => onProject.get(norm(a.name)) === 1).map((a) => [norm(a.name), a]));
  const taken = new Set<string>();
  const notes: string[] = [];
  let repeated = 0;

  const found = new Map<string, ImportTarget | null>();
  for (const f of file.activities) {
    let match = byKey.get(sk(f.key)) ?? null;
    if (!match && inFile.get(norm(f.name)) === 1) match = byName.get(norm(f.name)) ?? null;
    if (!match && (inFile.get(norm(f.name)) ?? 0) > 1) repeated++;
    if (match && taken.has(match.id)) match = null;
    if (match) taken.add(match.id);
    found.set(f.key, match);
  }
  // A summary row can hold the tasks under it only as a top-level activity with no progress of its own.
  const blocked = new Set<string>();
  for (const f of file.activities.filter((a) => a.summary)) {
    const m = found.get(f.key);
    if (m && (m.hasProgress || m.parentActivityId)) {
      blocked.add(f.key);
      notes.push(`“${f.name}” ${m.hasProgress ? 'has progress of its own' : 'is a sub-activity'}, so the tasks under it are added without a parent`);
    }
  }
  const rows: ImportRow[] = file.activities.map((f) => {
    const m = found.get(f.key) ?? null;
    const action: ImportAction = !m ? 'CREATE' : m.start === f.start && m.end === f.end ? 'SAME' : 'UPDATE';
    const parentMatch = f.parentKey ? found.get(f.parentKey) : null;
    const parent = !f.parentKey || blocked.has(f.parentKey) ? null : parentMatch ? { id: parentMatch.id } : { key: f.parentKey };
    return { ...f, scheduleKey: sk(f.key), matchId: m?.id ?? null, action, parent };
  });
  // A new summary row with no new task to hold would be an empty activity taking progress weight: leave it out.
  const holding = new Set(rows.flatMap((r) => (r.action === 'CREATE' && r.parent && 'key' in r.parent ? [r.parent.key] : [])));
  const kept = rows.filter((r) => !(r.summary && r.action === 'CREATE' && !holding.has(r.key)));
  if (kept.length < rows.length) notes.push(`${rows.length - kept.length} summary row${rows.length - kept.length === 1 ? '' : 's'} left out: every task under ${rows.length - kept.length === 1 ? 'it' : 'them'} is already on the project`);
  if (repeated) notes.push(`${repeated} row${repeated === 1 ? '' : 's'} with a name used more than once in the file ${repeated === 1 ? 'was' : 'were'} kept apart by the file’s own id`);

  const mByKey = new Map(milestones.filter((m) => m.scheduleKey).map((m) => [m.scheduleKey!, m]));
  const mCount = count(milestones.filter((m) => !m.scheduleKey).map((m) => norm(m.name)));
  const mFile = count(file.milestones.map((m) => norm(m.name)));
  const mByName = new Map(milestones.filter((m) => !m.scheduleKey && mCount.get(norm(m.name)) === 1).map((m) => [norm(m.name), m]));
  const mTaken = new Set<string>();
  const milestoneRows: ImportMilestoneRow[] = file.milestones.map((f) => {
    let m = mByKey.get(sk(f.key)) ?? (mFile.get(norm(f.name)) === 1 ? (mByName.get(norm(f.name)) ?? null) : null);
    if (m && mTaken.has(m.id)) m = null;
    if (m) mTaken.add(m.id);
    return { ...f, scheduleKey: sk(f.key), matchId: m?.id ?? null, action: !m ? 'CREATE' : m.date === f.date ? 'SAME' : 'UPDATE' };
  });

  const tasks = new Set(file.activities.filter((a) => !a.summary).map((a) => a.key));
  const links = file.links.filter((l) => tasks.has(l.predKey) && tasks.has(l.succKey));
  return { rows: kept, milestones: milestoneRows, links, notes };
}
