/**
 * Site photo checks: the reply checks and the confidence bar as unit tests, the 50 labelled cases through
 * the test model, then on the demo data a DPR's photos checked through the service (captions, flags, skipped files, the
 * safety officer's switch, a snag drafted from its photo, who sees what). No real model is called. CI runs it after the
 * seed:
 *
 *   DATABASE_URL=… node dist/scripts/photo-checks-test.js
 */
import assert from 'node:assert/strict';
import { PHOTO_FLAG_MIN_CONFIDENCE, type RoleKey } from '@erp/shared';
import { PHOTO_CASES, fakePhotoReply } from '../photo-checks/fake-photos';
import { normalisePhotoReply, parsePhotoReply, photoContextText, shownFlags, storedFlags } from '../photo-checks/photo-rules';

// The test model, whatever the environment says: these tests never call the real one.
process.env.AI_PROVIDER = 'fake';

const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

test('a reply is read from inside a code fence or a sentence, and nonsense is not', () => {
  assert.deepEqual(parsePhotoReply('```json\n{"caption":"Slab","flags":[]}\n```'), { caption: 'Slab', flags: [] });
  assert.deepEqual(parsePhotoReply('Here it is: {"caption":"Slab"} hope that helps'), { caption: 'Slab' });
  assert.equal(parsePhotoReply('I cannot see a photo.'), null);
  assert.equal(parsePhotoReply('{"caption": broken'), null);
  assert.equal(parsePhotoReply('[1,2]'), null);
});

test('only known flags are kept, one per key, the surest, with confidence clamped to 0..1', () => {
  const r = normalisePhotoReply(
    {
      caption: '  Brick   masonry  on the second floor ',
      flags: [
        { key: 'no_helmet', confidence: 0.6, detail: 'one worker' },
        { key: 'NO_HELMET', confidence: 0.9, detail: 'two workers' },
        { key: 'SMOKING', confidence: 0.99 },
        { key: 'NO_HARNESS', confidence: 88 },
        { key: 'UNCLEAR', confidence: 'high' },
        { key: 'NOT_SITE', confidence: 7 },
        'junk',
      ],
    },
    { kind: 'dpr', entry: 'Brickwork' },
  );
  assert.equal(r.caption, 'Brick masonry on the second floor');
  assert.deepEqual(r.flags, [
    { key: 'NO_HELMET', detail: 'two workers', confidence: 0.9 },
    { key: 'NO_HARNESS', detail: null, confidence: 0.88 },
    { key: 'UNCLEAR', detail: null, confidence: 0 },
    { key: 'NOT_SITE', detail: null, confidence: 0.07 },
  ]);
  assert.equal(r.draft, null);
});

test('other work is flagged only on a DPR or progress entry that says what its work was', () => {
  const raw = { caption: 'Plastering', flags: [{ key: 'OTHER_WORK', confidence: 0.9 }] };
  assert.equal(normalisePhotoReply(raw, { kind: 'progress', entry: 'Brickwork' }).flags.length, 1);
  assert.equal(normalisePhotoReply(raw, { kind: 'progress', entry: null }).flags.length, 0);
  assert.equal(normalisePhotoReply(raw, { kind: 'incident', entry: 'Fall of material' }).flags.length, 0);
  assert.equal(normalisePhotoReply(raw, { kind: 'defect', entry: 'Crack' }).flags.length, 0);
});

test('a snag draft is kept only when one was asked for, and needs a title', () => {
  const snag = { title: 'Crack in plaster', description: 'A long crack', location: 'Lobby', trade: 'Plaster' };
  assert.deepEqual(normalisePhotoReply({ caption: 'Wall', snag }, { kind: 'snag-draft', entry: null }).draft, snag);
  assert.equal(normalisePhotoReply({ caption: 'Wall', snag }, { kind: 'defect', entry: null }).draft, null);
  assert.equal(normalisePhotoReply({ caption: 'Wall', snag: { description: 'no title' } }, { kind: 'snag-draft', entry: null }).draft, null);
  assert.deepEqual(normalisePhotoReply({ snag: { title: 'Leak' } }, { kind: 'snag-draft', entry: null }).draft, { title: 'Leak', description: 'Leak', location: null, trade: null });
});

test('the record shows flags at or above the bar, surest first, and none when the project switched them off', () => {
  const flags = storedFlags([
    { key: 'UNCLEAR', confidence: PHOTO_FLAG_MIN_CONFIDENCE, detail: null },
    { key: 'NO_HELMET', confidence: 0.92, detail: 'Two workers' },
    { key: 'NO_HARNESS', confidence: PHOTO_FLAG_MIN_CONFIDENCE - 0.01, detail: null },
    { key: 'MADE_UP', confidence: 1 },
    null,
  ]);
  assert.equal(flags.length, 3);
  assert.deepEqual(shownFlags(flags, false).map((f) => f.key), ['NO_HELMET', 'UNCLEAR']);
  assert.equal(shownFlags(flags, false)[0].label, 'Workers without helmets');
  assert.deepEqual(shownFlags(flags, true), []);
  assert.deepEqual(storedFlags('not a list'), []);
});

test('the words sent with a photo name the record, its work and the file, and ask for a snag only in snag mode', () => {
  const t = photoContextText({ kind: 'progress', projectName: 'NH-48 widening', entry: 'Brickwork, 12 m3', fileName: 'east.jpg' });
  assert.ok(t.startsWith('Photo check.') && t.includes('a progress entry') && t.includes('NH-48 widening') && t.includes('Brickwork, 12 m3') && t.endsWith('File: east.jpg'));
  assert.ok(t.includes('Do not add "snag"'));
  assert.ok(photoContextText({ kind: 'snag-draft', projectName: 'P', entry: null, fileName: 'a.jpg' }).includes('Draft the snag'));
});

test('the 50 labelled photos show exactly their expected flags', () => {
  assert.equal(PHOTO_CASES.length, 50);
  const wrong: string[] = [];
  for (const c of PHOTO_CASES) {
    const text = photoContextText({ kind: c.kind, projectName: 'Demo', entry: c.entry, fileName: c.file });
    const reading = normalisePhotoReply(parsePhotoReply(fakePhotoReply(text))!, { kind: c.kind, entry: c.entry });
    const shown = shownFlags(reading.flags, false).map((f) => f.key).sort();
    if (JSON.stringify(shown) !== JSON.stringify([...c.expect].sort())) wrong.push(`${c.file}: ${shown.join(', ') || 'none'} (expected ${c.expect.join(', ') || 'none'})`);
    if (!reading.caption) wrong.push(`${c.file}: no caption`);
  }
  assert.deepEqual(wrong, []);
});

async function unitTests(): Promise<number> {
  let failed = 0;
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log(`✓ ${name}`);
    } catch (e) {
      failed++;
      console.error(`✗ ${name}\n  ${(e as Error).message}`);
    }
  }
  console.log(`Photo check rules: ${tests.length - failed} of ${tests.length} tests pass`);
  return failed;
}

async function demo(): Promise<number> {
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../app.module');
  const { PrismaService } = await import('../prisma/prisma.service');
  const { PhotoChecksService } = await import('../photo-checks/photo-checks.service');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const photos = app.get(PhotoChecksService);
  const org = await prisma.organization.findFirstOrThrow({ where: { code: process.env.AI_CHECK_ORG ?? 'DEMO' } });
  const problems: string[] = [];
  const check = (name: string, ok: boolean, detail = '') => {
    if (!ok) problems.push(`${name}${detail ? `: ${detail}` : ''}`);
  };
  const refused = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      return false;
    } catch {
      return true;
    }
  };
  const users = await prisma.user.findMany({ where: { organizationId: org.id, isActive: true }, include: { role: true } });
  const as = (email: string) => {
    const u = users.find((x) => x.email === email);
    if (!u) throw new Error(`No ${email} in the demo company`);
    return { id: u.id, organizationId: org.id, roleKey: u.role.key as RoleKey, email: u.email, fullName: u.fullName };
  };
  const engineer = as('engineer@demo.com');
  const engineer2 = as('engineer2@demo.com');
  const safety = as('safety@demo.com');
  // A road project DPR: the engineer and the safety officer are on it, the building-only engineer2 is not.
  const dpr = await prisma.dailyReport.findFirstOrThrow({
    where: { organizationId: org.id, project: { type: 'ROAD' }, submittedById: engineer.id },
    orderBy: { date: 'desc' },
    select: { id: true, projectId: true },
  });
  const project = await prisma.project.findUniqueOrThrow({ where: { id: dpr.projectId }, select: { photoFlagsOff: true } });
  const bytes = new Uint8Array(Buffer.from('test photo bytes'));
  const made: string[] = [];
  const photo = async (fileName: string, mimeType: string, extra: { dprId?: string; size?: number; uploadedById?: string } = {}) => {
    const a = await prisma.attachment.create({
      data: { organizationId: org.id, fileName, mimeType, size: extra.size ?? bytes.length, storagePath: `db:test/${fileName}`, data: bytes, uploadedById: extra.uploadedById ?? engineer.id, dailyReportId: extra.dprId },
    });
    made.push(a.id);
    return a.id;
  };

  try {
    await photo('slab-nohelmet.jpg', 'image/jpeg', { dprId: dpr.id });
    await photo('slab-helmetmaybe.jpg', 'image/jpeg', { dprId: dpr.id });
    await photo('slab-plaster.png', 'image/png', { dprId: dpr.id });
    await photo('slab-night.heic', 'image/heic', { dprId: dpr.id });
    await photo('slab-huge.jpg', 'image/jpeg', { dprId: dpr.id, size: 9_000_000 });
    await photo('slab-later.jpg', 'image/jpeg', { dprId: dpr.id });

    const before = await photos.get(engineer, 'dpr', dpr.id);
    check('the record says its photos are not checked yet', before.available && before.checks.length === 0 && before.pending >= 6, JSON.stringify({ ...before, checks: before.checks.length }));
    check("a site engineer cannot switch the project's flags", !before.canSwitch);

    const first = await photos.run(engineer, 'dpr', dpr.id);
    check('one run checks at most four photos', first.checks.length === 4 && first.pending === before.pending - 4, `${first.checks.length} checked, ${first.pending} pending`);
    let after = first;
    for (let i = 0; i < 5 && after.pending > 0; i++) after = await photos.run(engineer, 'dpr', dpr.id);
    check('further runs check the rest', after.pending === 0, `${after.pending} pending`);
    const byName = new Map(after.checks.map((c) => [c.fileName, c]));
    const helmet = byName.get('slab-nohelmet.jpg');
    check('a photo with workers without helmets is captioned and flagged', helmet?.status === 'DONE' && !!helmet.caption && helmet.flags.map((f) => f.key).join() === 'NO_HELMET', JSON.stringify(helmet));
    check('a flag below the bar is not shown', byName.get('slab-helmetmaybe.jpg')?.flags.length === 0, JSON.stringify(byName.get('slab-helmetmaybe.jpg')));
    check('a photo of other work than the DPR says is flagged', byName.get('slab-plaster.png')?.flags.some((f) => f.key === 'OTHER_WORK') === true, JSON.stringify(byName.get('slab-plaster.png')));
    check('a HEIC photo is skipped with the reason', byName.get('slab-night.heic')?.status === 'SKIPPED' && !!byName.get('slab-night.heic')?.reason);
    check('a photo too large to send is skipped with the reason', byName.get('slab-huge.jpg')?.status === 'SKIPPED' && /large/i.test(byName.get('slab-huge.jpg')?.reason ?? ''));
    const rows = await prisma.photoCheck.count({ where: { attachmentId: { in: made } } });
    const again = await photos.run(engineer, 'dpr', dpr.id);
    const rowsAgain = await prisma.photoCheck.findMany({ where: { attachmentId: { in: made } }, select: { createdAt: true } });
    check('a checked photo is not sent again', rowsAgain.length === rows && again.checks.length === after.checks.length);

    // A failed reading waits a day, then is tried again.
    const later = byName.get('slab-later.jpg')!;
    await prisma.photoCheck.update({ where: { attachmentId: later.attachmentId }, data: { status: 'FAILED', caption: null, createdAt: new Date(Date.now() - 60 * 60 * 1000) } });
    check('a photo that failed an hour ago waits', (await photos.get(engineer, 'dpr', dpr.id)).pending === 0);
    await prisma.photoCheck.update({ where: { attachmentId: later.attachmentId }, data: { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) } });
    check('a photo that failed a day ago is due again', (await photos.get(engineer, 'dpr', dpr.id)).pending === 1);
    const retried = await photos.run(engineer, 'dpr', dpr.id);
    check('and is read when it is tried again', retried.pending === 0 && retried.checks.find((c) => c.attachmentId === later.attachmentId)?.status === 'DONE');

    // Who sees what.
    check('a site engineer not on the project cannot see its photo checks', await refused(() => photos.get(engineer2, 'dpr', dpr.id)));
    check('or run them', await refused(() => photos.run(engineer2, 'dpr', dpr.id)));
    check("a site engineer cannot switch the flags off", await refused(() => photos.setFlagsOff(engineer, dpr.projectId, true)));

    // The safety officer's switch: flags go, captions stay, and it is audited.
    const officerView = await photos.get(safety, 'dpr', dpr.id);
    check('the safety officer may switch the flags', officerView.canSwitch);
    await photos.setFlagsOff(safety, dpr.projectId, true);
    const off = await photos.get(engineer, 'dpr', dpr.id);
    check('with the flags off no flag shows, captions still do', off.flagsOff && off.checks.every((c) => c.flags.length === 0) && off.checks.some((c) => !!c.caption));
    const audit = await prisma.auditLog.findFirst({ where: { organizationId: org.id, entityType: 'Project', entityId: dpr.projectId, action: 'PHOTO_FLAGS_OFF' }, orderBy: { createdAt: 'desc' } });
    check('switching the flags off is audited', !!audit && audit.actorId === safety.id);
    await photos.setFlagsOff(safety, dpr.projectId, false);
    check('switched back on, the flags show again', (await photos.get(engineer, 'dpr', dpr.id)).checks.some((c) => c.flags.length > 0));

    // A snag drafted from its photo; nothing but the photo's check is saved.
    const defects = await prisma.defect.count({ where: { organizationId: org.id } });
    const leak = await photo('bathroom-leak.jpg', 'image/jpeg');
    const draft = await photos.snagDraft(engineer, leak, dpr.projectId);
    check('a snag is drafted from its photo', draft.title.includes('leak') && draft.trade === 'Plumbing' && !!draft.description, JSON.stringify(draft));
    check('drafting saves no snag', (await prisma.defect.count({ where: { organizationId: org.id } })) === defects);
    const cost = await prisma.photoCheck.count({ where: { attachmentId: leak } });
    const twice = await photos.snagDraft(engineer, leak, dpr.projectId);
    check('the draft is kept and not asked for twice', twice.title === draft.title && (await prisma.photoCheck.count({ where: { attachmentId: leak } })) === cost);
    check("someone else's upload cannot be drafted from", await refused(() => photos.snagDraft(engineer2, leak, dpr.projectId)));
    const otherPhoto = await photo('crack.jpg', 'image/jpeg', { uploadedById: engineer2.id });
    check("a snag cannot be drafted for a project the user is not on", await refused(() => photos.snagDraft(engineer2, otherPhoto, dpr.projectId)));

    // The month's spend counts the photos the model saw.
    const counted = await prisma.photoCheck.count({ where: { organizationId: org.id, model: { not: null } } });
    check('photo checks are counted in the AI spend', counted >= 5, String(counted));
  } finally {
    await prisma.photoCheck.deleteMany({ where: { attachmentId: { in: made } } });
    await prisma.attachment.deleteMany({ where: { id: { in: made } } });
    await prisma.auditLog.deleteMany({ where: { organizationId: org.id, entityType: 'Project', entityId: dpr.projectId, action: { in: ['PHOTO_FLAGS_OFF', 'PHOTO_FLAGS_ON'] }, actorId: safety.id } });
    await prisma.project.update({ where: { id: dpr.projectId }, data: { photoFlagsOff: project.photoFlagsOff } });
    await app.close();
  }

  problems.forEach((p) => console.error(`FAIL ${p}`));
  console.log(`Demo data: ${problems.length} problems`);
  return problems.length;
}

(async () => {
  const failed = await unitTests();
  const problems = process.env.DATABASE_URL ? await demo() : 0;
  process.exit(failed || problems ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
