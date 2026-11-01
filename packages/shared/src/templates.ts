/** Standard activities per project type, applied when a project is created (or later from the Activities tab). */
import type { ProjectType } from './enums';

export interface ActivityTemplateItem {
  name: string;
  unit: string;
  /** Planned start, in days from the project start. */
  startDay: number;
  durationDays: number;
}

/**
 * The built-in templates, used until an organisation saves its own for a project type. Durations are a typical
 * schedule for a mid-sized job; a project with both dates gets them stretched or squeezed to fit its period.
 */
export const DEFAULT_ACTIVITY_TEMPLATES: Record<ProjectType, ActivityTemplateItem[]> = {
  ROAD: [
    { name: 'Mobilisation and site clearance', unit: 'Sqm', startDay: 0, durationDays: 30 },
    { name: 'Earthwork embankment', unit: 'Cum', startDay: 15, durationDays: 120 },
    { name: 'Subgrade', unit: 'Cum', startDay: 60, durationDays: 100 },
    { name: 'Cross drainage and culverts', unit: 'Nos', startDay: 30, durationDays: 180 },
    { name: 'GSB laying', unit: 'Cum', startDay: 90, durationDays: 90 },
    { name: 'WMM laying', unit: 'Cum', startDay: 120, durationDays: 90 },
    { name: 'Prime and tack coat', unit: 'Sqm', startDay: 170, durationDays: 90 },
    { name: 'DBM paving', unit: 'MT', startDay: 180, durationDays: 90 },
    { name: 'BC paving', unit: 'MT', startDay: 240, durationDays: 60 },
    { name: 'Road furniture and markings', unit: 'LS', startDay: 280, durationDays: 45 },
  ],
  BUILDING: [
    { name: 'Foundation excavation', unit: 'Cum', startDay: 0, durationDays: 25 },
    { name: 'PCC bed', unit: 'Cum', startDay: 20, durationDays: 15 },
    { name: 'RCC footings and columns', unit: 'Cum', startDay: 30, durationDays: 40 },
    { name: 'Plinth beam and backfilling', unit: 'Cum', startDay: 65, durationDays: 20 },
    { name: 'RCC slab GF', unit: 'Cum', startDay: 80, durationDays: 35 },
    { name: 'RCC slab FF', unit: 'Cum', startDay: 115, durationDays: 35 },
    { name: 'Brick masonry', unit: 'Cum', startDay: 100, durationDays: 90 },
    { name: 'Plumbing and electrical conduits', unit: 'LS', startDay: 110, durationDays: 120 },
    { name: 'Internal plaster', unit: 'Sqm', startDay: 160, durationDays: 80 },
    { name: 'Flooring', unit: 'Sqm', startDay: 220, durationDays: 60 },
    { name: 'Painting', unit: 'Sqm', startDay: 260, durationDays: 45 },
    { name: 'Finishing and handover', unit: 'LS', startDay: 290, durationDays: 30 },
  ],
  WATER_SUPPLY: [
    { name: 'Survey and design approval', unit: 'LS', startDay: 0, durationDays: 30 },
    { name: 'Intake well', unit: 'Nos', startDay: 30, durationDays: 150 },
    { name: 'Raw water main laying', unit: 'Rmt', startDay: 45, durationDays: 150 },
    { name: 'WTP civil works', unit: 'LS', startDay: 60, durationDays: 240 },
    { name: 'ESR construction', unit: 'Nos', startDay: 60, durationDays: 270 },
    { name: 'Distribution network', unit: 'Rmt', startDay: 120, durationDays: 240 },
    { name: 'Hydraulic testing of pipelines', unit: 'Rmt', startDay: 150, durationDays: 240 },
    { name: 'House connections', unit: 'Nos', startDay: 240, durationDays: 150 },
    { name: 'Trial run and commissioning', unit: 'LS', startDay: 330, durationDays: 60 },
  ],
  SEWERAGE: [
    { name: 'Survey, levels and design approval', unit: 'LS', startDay: 0, durationDays: 45 },
    { name: 'Sewer trench excavation', unit: 'Rmt', startDay: 45, durationDays: 300 },
    { name: 'Sewer pipe laying and jointing', unit: 'Rmt', startDay: 60, durationDays: 300 },
    { name: 'Manholes', unit: 'Nos', startDay: 60, durationDays: 300 },
    { name: 'Pumping station civil works', unit: 'LS', startDay: 90, durationDays: 210 },
    { name: 'STP civil works', unit: 'LS', startDay: 90, durationDays: 270 },
    { name: 'Electrical and mechanical works', unit: 'LS', startDay: 270, durationDays: 120 },
    { name: 'Property connections', unit: 'Nos', startDay: 240, durationDays: 150 },
    { name: 'Road restoration', unit: 'Sqm', startDay: 120, durationDays: 300 },
    { name: 'Trial run and commissioning', unit: 'LS', startDay: 390, durationDays: 60 },
  ],
  // Other works start empty: the company's own type lists its activities.
  OTHER: [],
  // An RMC plant runs, it is not built; its schedule is the day's orders.
  PLANT: [],
  // A central store holds stock; it has no works to schedule.
  STORE: [],
};

export const MAX_TEMPLATE_ITEMS = 60;
export const MAX_TEMPLATE_DAYS = 3650;

/** Days from the template's first start to its last finish. */
export const templateSpan = (items: ActivityTemplateItem[]): number => items.reduce((m, i) => Math.max(m, i.startDay + i.durationDays), 0);

const DAY = 86_400_000;
const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

export interface ScheduledActivity {
  name: string;
  unit: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  sortOrder: number;
}

/**
 * Planned dates for template activities on a project. Without a start date the activities get no dates. With both
 * dates the template is scaled so its span fills the project period; with a start only it keeps its own durations.
 */
export function scheduleTemplate(items: ActivityTemplateItem[], startDate: string | null | undefined, endDate: string | null | undefined): ScheduledActivity[] {
  const span = templateSpan(items);
  let scale = 1;
  if (startDate && endDate && span > 0) {
    const projectDays = Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / DAY) + 1;
    if (projectDays > 0) scale = projectDays / span;
  }
  return items.map((i, idx) => {
    if (!startDate) return { name: i.name, unit: i.unit, plannedStart: null, plannedEnd: null, sortOrder: idx + 1 };
    const s = Math.round(i.startDay * scale);
    const len = Math.max(1, Math.round(i.durationDays * scale));
    let end = addDays(startDate, s + len - 1);
    if (endDate && end > endDate) end = endDate;
    let start = addDays(startDate, s);
    if (start > end) start = end;
    return { name: i.name, unit: i.unit, plannedStart: start, plannedEnd: end, sortOrder: idx + 1 };
  });
}

/** An activity on the project, as the spread and the BOQ links read it. */
export interface PlanActivity {
  id: string;
  name: string;
  unit: string;
  plannedQty: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  boqItemId: string | null;
  sortOrder: number;
}

/**
 * Dates for the activities that have none, once the project's own dates arrive:
 * an activity named after a template item takes that item's place in the schedule; the rest are spread in order over
 * the period, each taking an equal share. Activities that already have a date are left as they are.
 */
export function spreadUndated(activities: PlanActivity[], template: ActivityTemplateItem[], startDate: string, endDate: string | null): { id: string; plannedStart: string; plannedEnd: string }[] {
  const undated = activities.filter((a) => !a.plannedStart && !a.plannedEnd).sort((a, b) => a.sortOrder - b.sortOrder);
  if (!undated.length) return [];
  const scheduled = new Map(scheduleTemplate(template, startDate, endDate).map((s) => [s.name.trim().toLowerCase(), s]));
  const rest = undated.filter((a) => !scheduled.has(a.name.trim().toLowerCase()));
  const last = endDate && endDate > startDate ? endDate : addDays(startDate, Math.max(1, rest.length) * 30 - 1);
  const days = Math.round((Date.parse(`${last}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / DAY) + 1;
  const share = rest.length ? Math.max(1, Math.floor(days / rest.length)) : 0;
  const out: { id: string; plannedStart: string; plannedEnd: string }[] = [];
  let i = 0;
  for (const a of undated) {
    const fromTemplate = scheduled.get(a.name.trim().toLowerCase());
    if (fromTemplate?.plannedStart && fromTemplate.plannedEnd) {
      out.push({ id: a.id, plannedStart: fromTemplate.plannedStart, plannedEnd: fromTemplate.plannedEnd });
      continue;
    }
    const start = addDays(startDate, Math.min(days - 1, i * share));
    const end = i === rest.length - 1 ? last : addDays(startDate, Math.min(days - 1, (i + 1) * share - 1));
    out.push({ id: a.id, plannedStart: start, plannedEnd: end < start ? start : end });
    i += 1;
  }
  return out;
}
