import type { ActivityLinkType } from '@erp/shared';
import { dayNo } from './schedule-rules';

/**
 * Schedules to and from MS Project XML and Primavera P6 XER (v6 item 114). Days are calendar days; a file's working
 * hours become days at 8 hours a day. Pure functions, tested in `src/scripts/schedule-links-test.ts`.
 */
export interface FileActivity {
  key: string;
  name: string;
  start: string;
  end: string;
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

export function toMsProjectXml(project: { code: string; name: string; start: string | null }, activities: FileActivity[], links: FileLink[]): string {
  const uid = new Map(activities.map((a, i) => [a.key, i + 1]));
  const tasks = activities.map((a, i) => {
    const preds = links
      .filter((l) => l.succKey === a.key && uid.has(l.predKey))
      .map(
        (l) =>
          `<PredecessorLink><PredecessorUID>${uid.get(l.predKey)}</PredecessorUID><Type>${MSP_TYPE[l.type]}</Type><CrossProject>0</CrossProject><LinkLag>${l.lagDays * HOURS_PER_DAY * 600}</LinkLag><LagFormat>7</LagFormat></PredecessorLink>`,
      )
      .join('');
    return `<Task><UID>${i + 1}</UID><ID>${i + 1}</ID><Name>${xmlEsc(a.name)}</Name><Type>1</Type><IsNull>0</IsNull><OutlineLevel>1</OutlineLevel><Start>${a.start}T08:00:00</Start><Finish>${a.end}T17:00:00</Finish><Duration>PT${days(a.start, a.end) * HOURS_PER_DAY}H0M0S</Duration><DurationFormat>7</DurationFormat><Milestone>0</Milestone><Summary>0</Summary>${preds}</Task>`;
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

/** Read an MS Project XML file: its tasks (not the summary rows or milestones) and their predecessor links. */
export function parseMsProjectXml(text: string): ScheduleFile {
  if (!/<Project[\s>]/.test(text)) throw new Error('This is not an MS Project XML file. Save the plan from MS Project as XML and try again.');
  const tasksXml = tag(text.replace(/<\/?(\w+:)/g, (m) => m.replace(/\w+:/, '')), 'Tasks') ?? '';
  const out: ScheduleFile = { activities: [], links: [], skipped: [] };
  const keys = new Set<string>();
  for (const m of tasksXml.matchAll(/<Task>([\s\S]*?)<\/Task>/g)) {
    const t = m[1];
    const key = tag(t, 'UID');
    const name = tag(t, 'Name');
    const start = tag(t, 'Start')?.slice(0, 10);
    const end = tag(t, 'Finish')?.slice(0, 10);
    if (!key || key === '0' || tag(t, 'IsNull') === '1') continue;
    if (tag(t, 'Summary') === '1') {
      out.skipped.push(`Summary row “${name ?? key}”`);
      continue;
    }
    if (tag(t, 'Milestone') === '1') {
      out.skipped.push(`Milestone “${name ?? key}” (add it under Milestones)`);
      continue;
    }
    if (!name || !start || !end || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      out.skipped.push(`Task ${key}: no name or dates`);
      continue;
    }
    keys.add(key);
    out.activities.push({ key, name: name.slice(0, 200), start, end: end < start ? start : end });
    for (const p of t.matchAll(/<PredecessorLink>([\s\S]*?)<\/PredecessorLink>/g)) {
      const predKey = tag(p[1], 'PredecessorUID');
      const type = MSP_TYPE_BACK[tag(p[1], 'Type') ?? '1'] ?? 'FS';
      const lag = Number(tag(p[1], 'LinkLag') ?? 0);
      if (predKey) out.links.push({ predKey, succKey: key, type, lagDays: Math.round(lag / (HOURS_PER_DAY * 600)) });
    }
  }
  return dropStray(out, keys);
}

const XER_TYPE: Record<ActivityLinkType, string> = { FS: 'PR_FS', SS: 'PR_SS', FF: 'PR_FF', SF: 'PR_SF' };

/** A Primavera P6 XER file with the project, its tasks (as task-dependent activities) and their links. */
export function toXer(project: { code: string; name: string }, activities: FileActivity[], links: FileLink[], exportedOn: string): string {
  const id = new Map(activities.map((a, i) => [a.key, 1000 + i]));
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

/** Read a Primavera XER file: the TASK rows that are activities (not milestones or WBS summaries) and the TASKPRED links. */
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
  const out: ScheduleFile = { activities: [], links: [], skipped: [] };
  const keys = new Set<string>();
  for (const t of tables.get('TASK') ?? []) {
    const name = t.task_name || t.task_code;
    if (t.task_type === 'TT_Mile' || t.task_type === 'TT_FinMile') {
      out.skipped.push(`Milestone “${name}” (add it under Milestones)`);
      continue;
    }
    if (t.task_type === 'TT_WBS' || t.task_type === 'TT_LOE') {
      out.skipped.push(`Summary row “${name}”`);
      continue;
    }
    const start = (t.act_start_date || t.target_start_date || t.early_start_date || '').slice(0, 10);
    const end = (t.act_end_date || t.target_end_date || t.early_end_date || '').slice(0, 10);
    if (!t.task_id || !name || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      out.skipped.push(`Task ${t.task_code || t.task_id}: no name or dates`);
      continue;
    }
    keys.add(t.task_id);
    out.activities.push({ key: t.task_id, name: name.slice(0, 200), start, end: end < start ? start : end });
  }
  for (const p of tables.get('TASKPRED') ?? []) {
    const type = (p.pred_type?.replace('PR_', '') ?? 'FS') as ActivityLinkType;
    out.links.push({ predKey: p.pred_task_id, succKey: p.task_id, type: ['FS', 'SS', 'FF', 'SF'].includes(type) ? type : 'FS', lagDays: Math.round(Number(p.lag_hr_cnt || 0) / HOURS_PER_DAY) });
  }
  return dropStray(out, keys);
}

/** Links to rows that were not read (milestones, other projects) are left out and counted. */
function dropStray(file: ScheduleFile, keys: Set<string>): ScheduleFile {
  const kept = file.links.filter((l) => keys.has(l.predKey) && keys.has(l.succKey) && l.predKey !== l.succKey);
  const dropped = file.links.length - kept.length;
  return { ...file, links: kept, skipped: dropped ? [...file.skipped, `${dropped} link${dropped === 1 ? '' : 's'} to rows not read`] : file.skipped };
}
