/**
 * Tests for drafts from a sentence (AI item 71):
 *
 * - No AI path writes a record: every call in `src/ai` whose name creates, changes, submits, approves, pays or deletes
 *   goes to the assistant's own tables (threads, messages, document reads), its company switch, or nowhere.
 * - Figures the model wrote into a draft that are not in the question or a record read are marked to check.
 * - With a database (CI runs it after the seed): the draft tools match the demo company's items, units, activities and
 *   RA bills, refuse a project the user cannot see, and running every draft tool as every user saves nothing.
 *
 *   node dist/scripts/ai-drafts-test.js
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AiDraftDto, RoleKey } from '@erp/shared';
import { groundDrafts } from '../ai/ai.service';
import { coverNote } from '../ai/ai-drafts.service';

const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

/** Calls whose names write, and the receivers allowed to take them in `src/ai`. */
const WRITE_CALL = /([A-Za-z_$][\w$.]*)\.(create|update|upsert|delete|remove|submit|review|approve|reject|pay|record|issue|post|patch|put|resubmit|cancel|close|save)\w*\(/g;
const ALLOWED_RECEIVERS = [/^this\.prisma\.ai[A-Z]\w*$/, /^this\.prisma\.organization$/, /^this\.ai$/];

test('no AI path calls a create, submit, approve or delete on a record', () => {
  const dir = join(__dirname, '..', 'ai');
  const found: string[] = [];
  for (const f of readdirSync(dir).filter((n) => /\.(ts|js)$/.test(n) && !n.endsWith('.d.ts'))) {
    const src = readFileSync(join(dir, f), 'utf8');
    for (const m of src.matchAll(WRITE_CALL)) if (!ALLOWED_RECEIVERS.some((r) => r.test(m[1]))) found.push(`${f}: ${m[0]}`);
  }
  assert.deepEqual(found, [], 'only the assistant’s own tables may be written');
});

const draft = (values: Record<string, unknown>): AiDraftDto => ({ kind: 'letter', title: 't', projectId: 'p', projectName: 'P', values, flags: [] });

test('a figure in a drafted letter that no record or the question gave is marked to check', () => {
  const results = [{ bill: { netPayable: '1234567.00', grossAmount: '1500000.00' } }];
  const [ok] = groundDrafts([draft({ summary: 'Net payable: ₹12,34,567.00 on a gross of ₹15,00,000.00' })], results, 'write the cover letter');
  assert.deepEqual(ok.flags, []);
  const [bad] = groundDrafts([draft({ summary: 'Net payable: ₹12,34,567.00; we also claim ₹4,50,000 for idle labour' })], results, 'write the cover letter');
  assert.equal(bad.flags.length, 1);
  assert.equal(bad.flags[0].field, 'summary');
  assert.match(bad.flags[0].note, /4,50,000/);
});

test("a draft's own figures do not vouch for themselves", () => {
  const own = { draft: { values: { summary: 'Amount ₹9,99,999' } } };
  const [d] = groundDrafts([draft({ summary: 'Amount ₹9,99,999' })], [own], 'write a letter');
  assert.equal(d.flags.length, 1);
});

test('figures the user said are fine in a DPR', () => {
  const [d] = groundDrafts([{ ...draft({ workExecuted: 'Brickwork 12 cum on second floor' }), kind: 'dpr' }], [], 'dpr: 12 cum brickwork second floor');
  assert.deepEqual(d.flags, []);
});

test("an RA bill's covering letter carries the bill's figures", () => {
  const note = coverNote(
    { billLabel: 'RA bill 3', billDate: '2026-10-05', measuredUpTo: '2026-09-30', agreementNo: 'EE/RB/12', agreementDate: '2026-01-10', grossAmount: '1500000.00', pvAmount: '0.00', gstRate: '18.00', gstAmount: '270000.00', totalDeductions: '120000.00', netPayable: '1650000.00', grossUpto: '4500000.00' },
    'Highway widening',
  );
  assert.match(note, /RA bill 3 dated 5 Oct 2026 for Highway widening under agreement EE\/RB\/12 dated 10 Jan 2026, for work measured up to 30 Sept? 2026/);
  assert.match(note, /Value of work in this bill: ₹15,00,000\.00/);
  assert.match(note, /GST at 18%: ₹2,70,000\.00/);
  assert.match(note, /Net payable: ₹16,50,000\.00/);
  assert.doesNotMatch(note, /Price variation/);
});

async function runDemo(): Promise<string[]> {
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../app.module');
  const { AiToolsService } = await import('../ai/ai-tools.service');
  const { PrismaService } = await import('../prisma/prisma.service');
  const { setTenant, tenantMiddleware } = await import('../prisma/tenant-context');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const tools = app.get(AiToolsService);
  const org = await prisma.organization.findFirstOrThrow({ where: { code: process.env.AI_CHECK_ORG ?? 'DEMO' } });
  const problems: string[] = [];
  const check = (name: string, ok: boolean, detail = '') => {
    if (!ok) problems.push(`${name}${detail ? `: ${detail}` : ''}`);
  };
  await new Promise<void>((resolve, reject) =>
    tenantMiddleware(null, null, () => {
      setTenant(org.id);
      (async () => {
        const users = await prisma.user.findMany({ where: { organizationId: org.id, isActive: true }, include: { role: true } });
        const as = (email: string) => {
          const u = users.find((x) => x.email === email);
          if (!u) throw new Error(`No ${email} in the demo company`);
          return { id: u.id, organizationId: org.id, roleKey: u.role.key as RoleKey, email: u.email, fullName: u.fullName };
        };
        const projects = await prisma.project.findMany({ where: { organizationId: org.id }, select: { id: true, code: true } });
        const road = projects.find((p) => p.code === 'RD-2026-01')!;
        const hospital = projects.find((p) => p.code === 'BL-2026-02')!;
        const draftOf = async (email: string, tool: string, input: Record<string, unknown>) => {
          const r = await tools.run(as(email), tool, input);
          if (r.isError || !r.draft) throw new Error(`${tool} as ${email}: ${r.text}`);
          return r.draft;
        };
        const counts = () =>
          Promise.all([prisma.materialRequest.count(), prisma.expense.count(), prisma.progressEntry.count(), prisma.dailyReport.count(), prisma.letter.count(), prisma.auditLog.count()]);
        const before = await counts();

        // Items and units from the item master, as the store keeps them.
        const mr = await draftOf('engineer@demo.com', 'draft_material_request', { projectId: road.id, items: [{ name: 'opc 53 cement', quantity: 200, unit: 'bags' }, { name: 'TMT 12 mm', quantity: 2, unit: 'MT' }, { name: 'unobtanium widgets', quantity: 5, unit: 'nos' }], requiredDate: '2099-01-02' });
        const items = mr.values.items as { itemName: string; unit: string; quantity: number }[];
        check('MR: OPC 53 cement is the item master entry', items[0].itemName === 'OPC 53 Grade Cement' && items[0].unit === 'Bags', JSON.stringify(items[0]));
        check('MR: TMT 12 mm is the 12mm bar', items[1].itemName === 'TMT Fe500D 12mm', JSON.stringify(items[1]));
        check('MR: an unknown item is kept and flagged', items[2].itemName === 'unobtanium widgets' && mr.flags.some((f) => f.field === 'items.2.itemName'), JSON.stringify(mr.flags));
        check('MR: the unit of an unknown item takes the unit master spelling', items[2].unit === 'Nos', items[2].unit);
        check('MR: known items are not flagged', !mr.flags.some((f) => f.field.startsWith('items.0') || f.field.startsWith('items.1')), JSON.stringify(mr.flags));
        const hindiUnit = await draftOf('engineer@demo.com', 'draft_material_request', { project: 'puri highway', items: [{ name: 'OPC 53 cement', quantity: 50, unit: 'MT' }] });
        check('MR: a project named in words is found', hindiUnit.projectId === road.id, hindiUnit.projectName);
        check('MR: a unit unlike the item master’s is flagged', hindiUnit.flags.some((f) => f.field === 'items.0.unit'), JSON.stringify(hindiUnit.flags));
        const tie = await draftOf('engineer@demo.com', 'draft_material_request', { projectId: road.id, items: [{ name: 'Bitumen VG-30', quantity: 10, unit: 'MT' }, { name: 'Bitumen emulsion', quantity: 2000, unit: 'Ltr' }] });
        const tieItems = tie.values.items as { itemName: string }[];
        check('MR: a tie goes to the item kept in the unit said, and one item is not matched twice', tieItems[0].itemName === 'Bitumen VG-30' && tieItems[1].itemName === 'Emulsion SS-1', JSON.stringify(tieItems));

        // Activities from the project's schedule.
        const progress = await draftOf('engineer@demo.com', 'draft_progress', { projectId: road.id, activity: 'GSB', quantity: 40, unit: 'cum', date: '2026-10-01' });
        const gsb = await prisma.activity.findFirst({ where: { projectId: road.id, name: 'GSB laying' }, select: { id: true } });
        check('Progress: "GSB" is the GSB laying activity', progress.values.activityId === gsb?.id, String(progress.values.activityId));
        const unknown = await draftOf('engineer@demo.com', 'draft_progress', { projectId: road.id, activity: 'tiling', quantity: 40 });
        check('Progress: an activity not on the schedule is left to pick', !unknown.values.activityId && unknown.flags.some((f) => f.field === 'activityId'));

        // The project boundary: a site engineer on the road cannot draft for the hospital.
        const outside = await tools.run(as('engineer@demo.com'), 'draft_dpr', { projectId: hospital.id, workExecuted: 'Slab casting' });
        check('A project the user cannot see is refused', outside.isError && !outside.draft, outside.text);
        const future = await tools.run(as('engineer@demo.com'), 'draft_expense', { projectId: road.id, amount: 500, description: 'Tea', date: '2099-01-01' });
        check('An expense dated in the future is refused', future.isError, future.text);

        // An RA bill's covering letter, from the bill.
        const bill = await prisma.raBill.findFirst({ where: { projectId: road.id }, orderBy: { billNo: 'desc' }, select: { id: true, netPayable: true } });
        if (bill) {
          const letter = await draftOf('pm@demo.com', 'draft_letter', { projectId: road.id, raBillId: bill.id });
          const net = `₹${Number(bill.netPayable).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          check('Letter: the cover note carries the net payable', String(letter.values.body).includes(`Net payable: ${net}`), String(letter.values.body));
          check('Letter: it goes to the client', typeof letter.values.party === 'string' && letter.values.party.length > 0);
        } else problems.push('No RA bill on the road project to write a cover note for');
        const site = await tools.run(as('engineer@demo.com'), 'draft_letter', { projectId: road.id, subject: 'Hindrance' });
        check('Letter: a role without correspondence cannot draft one', site.isError, site.text);

        // Every draft tool, as every user, with inputs that would make a record: nothing is saved.
        const inputs: Record<string, Record<string, unknown>> = {
          draft_material_request: { projectId: road.id, items: [{ name: 'Diesel', quantity: 100, unit: 'Ltr' }] },
          draft_expense: { projectId: road.id, amount: 1200, description: 'Diesel for generator', category: 'FUEL' },
          draft_progress: { projectId: road.id, activity: 'WMM laying', quantity: 10 },
          draft_dpr: { projectId: road.id, workExecuted: 'WMM laying 10 cum', date: '2026-10-01' },
          draft_letter: { projectId: road.id, subject: 'Test', body: 'Test letter' },
        };
        for (const u of users) for (const [tool, input] of Object.entries(inputs)) await tools.run(as(u.email), tool, input);
        const after = await counts();
        check('Drafting saved nothing (MRs, expenses, progress, DPRs, letters, audit log)', JSON.stringify(after) === JSON.stringify(before), `${before.join(',')} → ${after.join(',')}`);
      })().then(resolve, reject);
    }),
  );
  await app.close();
  return problems;
}

async function main() {
  let failed = 0;
  for (const [name, fn] of tests) {
    try {
      await fn();
    } catch (e) {
      failed++;
      console.error(`✗ ${name}\n  ${(e as Error).message}`);
    }
  }
  console.log(`Drafts: ${tests.length - failed} of ${tests.length} tests pass`);
  if (process.env.DATABASE_URL) {
    const problems = await runDemo();
    for (const p of problems) console.error(`FAIL ${p}`);
    console.log(`Demo data: ${problems.length} problems`);
    failed += problems.length;
  }
  process.exit(failed ? 1 : 0);
}

void main();
