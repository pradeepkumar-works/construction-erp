import { EMPLOYEE_EVENT_LETTERS, EMPLOYEE_EVENT_TYPES, type EmployeeEventType, type EmployeeLetterDto } from './hr';

/**
 * HR letter templates (ARCHITECTURE "HR records"): each letter's words are a template the company may rewrite, over the
 * standard ones here. A template is paragraphs split by a blank line, with `{field}` for the person's facts and
 * `[ … ]` around words that go only when every field inside has a value. A paragraph with an empty field outside
 * brackets is left out, so "{note}" on its own line prints only when there is a note.
 */
export const HR_LETTER_KINDS = [...EMPLOYEE_EVENT_TYPES, 'EXPERIENCE'] as const;
export type HrLetterKind = (typeof HR_LETTER_KINDS)[number];
export const HR_LETTER_TITLES: Record<HrLetterKind, string> = { ...EMPLOYEE_EVENT_LETTERS, EXPERIENCE: 'Experience certificate' };
/** Each letter's name in the editor, where the two relieving letters need telling apart */
export const HR_LETTER_NAMES: Record<HrLetterKind, string> = { ...HR_LETTER_TITLES, RESIGNED: 'Relieving letter on resignation', RETIRED: 'Relieving letter on retirement' };

export const LETTER_FIELDS = {
  name: 'Their full name',
  code: 'Employee code',
  designation: 'Designation on the record',
  oldDesignation: 'Designation before a promotion',
  newDesignation: 'Designation the letter gives',
  changedDesignation: 'New designation, only when it changes',
  department: 'Department',
  company: 'Company name',
  date: 'Date the letter takes effect',
  joinedOn: 'Joining date',
  leftOn: 'Last working day',
  postedAt: 'Site they are posted at',
  fromSite: 'Site moved from (transfer)',
  toSite: 'Site moved to (transfer)',
  ctc: 'Cost to company the letter gives, a year',
  oldCtc: 'Cost to company before',
  probationEnds: 'Probation end date',
  noticeDays: 'Notice period in days',
  noticeGivenOn: 'Day notice was given',
  note: 'The note recorded with the event',
} as const;
export type LetterField = keyof typeof LETTER_FIELDS;
export const LETTER_FIELD_KEYS = Object.keys(LETTER_FIELDS) as LetterField[];
export type LetterValues = Record<LetterField, string | null>;

const CLOSE_EXIT = 'Your full and final settlement will be paid as per company rules. We thank you for your service and wish you well.';

/** The standard words of every letter, as the company finds them before it changes any. */
export const STANDARD_HR_LETTERS: Record<HrLetterKind, string> = {
  OFFERED: [
    'Dear {name},',
    'Further to our discussions, we are pleased to offer you the position of {newDesignation}[ in {department}] with {company}[, to be posted at {postedAt}].',
    'Your cost to company will be {ctc}. The break-up is set out in the salary structure given with your appointment letter.',
    'We expect you to join on {joinedOn}. Your appointment letter will be handed over on joining.',
    'You will be on probation until {probationEnds}.',
    "Either side may end the employment by giving {noticeDays} days' notice in writing.",
    '{note}',
    'This offer is made on the documents you have given us, which we have verified. Please sign and return a copy of this letter to accept it.',
  ].join('\n\n'),
  JOINED: [
    'Dear {name},',
    'We are pleased to appoint you as {newDesignation}[ in {department}] with {company}, from {date}[, posted at {postedAt}].',
    'Your cost to company will be {ctc}, made up as set out in your salary structure.',
    'You will be on probation until {probationEnds}, after which your service will be confirmed in writing.',
    "Either side may end this appointment by giving {noticeDays} days' notice in writing.",
    '{note}',
    'Please sign and return the copy of this letter to accept the appointment.',
  ].join('\n\n'),
  CONFIRMED: ['Dear {name},', 'We are pleased to confirm your service as {designation} with {company} from {date}. All other terms of your appointment stay the same.', '{note}'].join('\n\n'),
  TRANSFERRED: [
    'Dear {name},',
    'You are transferred from {fromSite} to {toSite} from {date}[, as {changedDesignation}]. Please hand over your present work and report there on that day.',
    '{note}',
  ].join('\n\n'),
  PROMOTED: ['Dear {name},', 'We are pleased to promote you from {oldDesignation} to {newDesignation} from {date}.', 'Your cost to company goes up to {ctc}.', '{note}', 'Congratulations, and thank you for your work.'].join('\n\n'),
  INCREMENT: ['Dear {name},', 'We are pleased to tell you that your cost to company is revised[ from {oldCtc}] to {ctc} from {date}.', '{note}', 'Thank you for your work. All other terms stay the same.'].join('\n\n'),
  WARNING: [
    'Dear {name},',
    'This letter is a written warning about the following, noted on {date}:',
    '{note}',
    'You are asked to make sure it does not happen again. A further lapse may lead to stronger action.',
  ].join('\n\n'),
  RESIGNED: ['Dear {name},', 'We accept your resignation[ given on {noticeGivenOn}]. You are relieved from your duties as {designation} at the close of {date}.', CLOSE_EXIT].join('\n\n'),
  TERMINATED: [
    'Dear {name},',
    'Your service with {company} ends on {date}, which is your last working day.',
    '{note}',
    'Please hand over company property and records to your manager. Your full and final settlement will follow.',
  ].join('\n\n'),
  RETIRED: ['Dear {name},', 'On your retirement, you are relieved from your duties with {company} at the close of {date}.', CLOSE_EXIT].join('\n\n'),
  EXPERIENCE: [
    'This is to certify that {name} ({code}) worked with {company} from {joinedOn} to {leftOn}[ in {department}], last as {designation}.',
    'During this time we found their work and conduct good. We wish them well.',
  ].join('\n\n'),
};

const FIELD_RE = /\{([a-zA-Z]+)\}/g;
const MAX_LETTER = 6000;

/** What is wrong with a template the company wrote, or null: unknown fields, brackets that do not close, too long. */
export function letterTemplateProblem(text: string): string | null {
  if (!text.trim()) return 'Write the letter, or use the standard one';
  if (text.length > MAX_LETTER) return `Keep the letter under ${MAX_LETTER} characters`;
  const unknown = [...text.matchAll(FIELD_RE)].map((m) => m[1]).filter((f) => !(f in LETTER_FIELDS));
  if (unknown.length) return `There is no field {${unknown[0]}}. Pick one from the list of fields.`;
  if (/[{}]/.test(text.replace(FIELD_RE, ''))) return 'A field is written as a word in curly brackets, such as {name}';
  let open = false;
  for (const ch of text) {
    if (ch === '[') {
      if (open) return 'A part in square brackets cannot hold another; close the first with ]';
      open = true;
    } else if (ch === ']') {
      if (!open) return 'There is a ] with no [ before it';
      open = false;
    } else if (ch === '\n' && open) return 'Close the part in square brackets with ] before the line ends';
  }
  if (open) return 'Close the part in square brackets with ]';
  return null;
}

const filled = (v: string | null | undefined): v is string => v !== null && v !== undefined && v.trim() !== '';

/** The letter's paragraphs as plain text: fields filled, optional parts and paragraphs with an empty field left out. */
export function fillLetter(template: string, values: Partial<LetterValues>): string[] {
  const fill = (s: string) => s.replace(FIELD_RE, (_, f: LetterField) => values[f] ?? '');
  const complete = (s: string) => [...s.matchAll(FIELD_RE)].every((m) => filled(values[m[1] as LetterField]));
  return template
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((para) => {
      const kept = para.replace(/\[([^\]\n]*)\]/g, (_, inner: string) => (complete(inner) ? inner : ''));
      return complete(kept) ? fill(kept).replace(/[ \t]+/g, ' ').trim() : '';
    })
    .filter((p) => p !== '');
}

/** The letter a kind prints: the company's own words when it has them, else the standard ones. */
export const letterTemplateFor = (kind: HrLetterKind, own: Partial<Record<HrLetterKind, string>> | null | undefined) => own?.[kind] ?? STANDARD_HR_LETTERS[kind];

/** The kind of letter an event prints, or its experience certificate. */
export const letterKindOf = (type: EmployeeEventType, experience = false): HrLetterKind => (experience ? 'EXPERIENCE' : type);

/** The person's facts for a letter, formatted by the caller's own date and money words. */
export function hrLetterValues(l: EmployeeLetterDto, fmt: { date: (d: string) => string; money: (v: string) => string }): LetterValues {
  const { event: ev, employee: e, company } = l;
  const d = (v: string | null | undefined) => (v ? fmt.date(v) : null);
  const ctc = (v: string | null | undefined) => (v ? `${fmt.money(v)} a year` : null);
  return {
    name: e.fullName,
    code: e.employeeCode,
    designation: e.designation,
    oldDesignation: ev.fromDesignation ?? e.designation,
    newDesignation: ev.toDesignation ?? e.designation,
    changedDesignation: ev.toDesignation && ev.toDesignation !== ev.fromDesignation ? ev.toDesignation : null,
    department: ev.toDepartment ?? e.department,
    company: company.name,
    date: d(ev.effectiveDate),
    joinedOn: d(e.joinedOn),
    leftOn: d(e.leftOn ?? ev.effectiveDate),
    postedAt: ev.type === 'OFFERED' ? e.postedAt : ev.type === 'JOINED' ? ev.toProjectName : (ev.toProjectName ?? e.postedAt),
    fromSite: ev.fromProjectName ?? 'head office',
    toSite: ev.toProjectName ?? 'head office',
    ctc: ctc(ev.toCtc),
    oldCtc: ctc(ev.fromCtc),
    probationEnds: d(e.probationEndsOn),
    noticeDays: e.noticeDays ? String(e.noticeDays) : null,
    noticeGivenOn: d(ev.noticeGivenOn),
    note: ev.note,
  };
}

/** The company's letter templates, as the editor reads them. */
export interface HrLetterTemplateDto {
  kind: HrLetterKind;
  title: string;
  /** The words in force: the company's own, else the standard */
  body: string;
  standard: string;
  /** True while the company has not changed it */
  isStandard: boolean;
  updatedByName: string | null;
  updatedAt: string | null;
}
