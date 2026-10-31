/**
 * WhatsApp entries' tests (AI item 120). First the rules on their own: reading the Cloud API's and WATI's webhooks,
 * telling a Save or Discard reply from a new message, the reply text and the create body. Then, when DATABASE_URL is
 * set, the demo company with the test model: a text becomes a material request that "1" saves in the sender's name, a
 * webhook sent twice is read once, a voice note is heard and drafted as a DPR that "2" discards, a photo's expense is
 * saved by its button with the photo attached, a question is only answered, nobody else can save someone's draft, a
 * draft over a day old waits for the app, the company switch and a new phone number stop it, and the voice notes are
 * counted in the AI spend.
 *
 *   node dist/scripts/whatsapp-capture-test.js                 # rules only
 *   DATABASE_URL=… node dist/scripts/whatsapp-capture-test.js  # rules and demo data
 */
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'crypto';
import type { AiDraftDto, RoleKey } from '@erp/shared';
import { createBody, draftReply, firstProblem, metaSignatureOk, parseMeta, parseWati, pickDraft, plainText, questionOf, replyIntent, withinSaveWindow } from '../whatsapp/whatsapp-rules';

// Never the real model, and no messages out, from a test.
process.env.AI_PROVIDER = 'fake';
process.env.TRANSCRIBE_PROVIDER = 'fake';
delete process.env.WATI_API_ENDPOINT;
delete process.env.WHATSAPP_ACCESS_TOKEN;

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

const draft = (over: Partial<AiDraftDto> = {}): AiDraftDto => ({
  kind: 'material-request',
  title: 'Indent for Block B: 50 Bags OPC 53 Grade Cement, needed by 30 Oct 2026',
  projectId: 'p1',
  projectName: 'Block B',
  values: { projectId: 'p1', requiredDate: '2026-10-30', priority: 'NORMAL', items: [{ itemName: 'OPC 53 Grade Cement', unit: 'Bags', quantity: 50 }] },
  flags: [],
  ...over,
});

test('the Cloud API webhook gives texts, photos with captions, voice notes and button taps; statuses are left out', () => {
  const body = {
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                { from: '919800000006', id: 'wamid.1', type: 'text', text: { body: 'raise mr 50 bags cement' } },
                { from: '919800000006', id: 'wamid.2', type: 'image', image: { id: 'm1', mime_type: 'image/jpeg', caption: 'diesel bill' } },
                { from: '919800000006', id: 'wamid.3', type: 'audio', audio: { id: 'm2', mime_type: 'audio/ogg; codecs=opus', voice: true } },
                { from: '919800000006', id: 'wamid.4', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'save:3f9a1c2e-1111-4222-8333-444455556666', title: 'Save' } } },
                { from: '919800000006', id: 'wamid.5', type: 'sticker', sticker: {} },
              ],
            },
          },
          { value: { statuses: [{ id: 'wamid.0', status: 'read' }] } },
        ],
      },
    ],
  };
  const got = parseMeta(body);
  assert.deepEqual(got.map((e) => e.type), ['TEXT', 'PHOTO', 'VOICE', 'BUTTON', 'OTHER']);
  assert.equal(got[0].from, '919800000006');
  assert.equal(got[0].text, 'raise mr 50 bags cement');
  assert.deepEqual(got[1].media, { ref: 'm1', mimeType: 'image/jpeg' });
  assert.equal(got[1].text, 'diesel bill');
  assert.equal(got[2].media?.ref, 'm2');
  assert.equal(got[3].buttonId, 'save:3f9a1c2e-1111-4222-8333-444455556666');
  assert.deepEqual(parseMeta({}), []);
  assert.deepEqual(parseMeta({ entry: [{ changes: [{ value: { messages: [{ id: 'x', type: 'text' }] } }] }] }), [], 'no sender, nothing read');
});

test("WATI's webhook gives one message, and nothing for the company's own messages or other events", () => {
  assert.deepEqual(parseWati({ waId: '919800000006', whatsappMessageId: 'w1', type: 'text', text: 'haan', eventType: 'message', owner: false }), {
    from: '919800000006',
    providerRef: 'w1',
    type: 'TEXT',
    text: 'haan',
    media: null,
    buttonId: null,
  });
  assert.equal(parseWati({ waId: '919800000006', type: 'voice', data: 'data/audios/a.opus', id: 'w2' })?.media?.ref, 'data/audios/a.opus');
  assert.equal(parseWati({ waId: '919800000006', type: 'image', data: 'https://x/y.jpg', text: 'bill', id: 'w3' })?.type, 'PHOTO');
  assert.equal(parseWati({ waId: '919800000006', type: 'text', text: 'hi', owner: true }), null);
  assert.equal(parseWati({ waId: '919800000006', type: 'text', text: 'hi', eventType: 'sentMessageDELIVERED' }), null);
});

test('the Cloud API signature is the app-secret HMAC over the exact bytes', () => {
  const raw = Buffer.from('{"entry":[]}');
  const sig = `sha256=${createHmac('sha256', 's3cret').update(raw).digest('hex')}`;
  assert.equal(metaSignatureOk('s3cret', raw, sig), true);
  assert.equal(metaSignatureOk('other', raw, sig), false);
  assert.equal(metaSignatureOk('s3cret', Buffer.from('{"entry": []}'), sig), false);
  assert.equal(metaSignatureOk('s3cret', raw, undefined), false);
});

test('Save and Discard are a button, or a reply that is only the word, in English, Hinglish or Hindi', () => {
  for (const t of ['1', 'Save', 'haan', 'Haan ji', 'ok', 'हाँ']) assert.equal(replyIntent({ type: 'TEXT', text: t, buttonId: null })?.action, 'SAVE', t);
  for (const t of ['2', 'no', 'nahi', 'cancel', 'नहीं']) assert.equal(replyIntent({ type: 'TEXT', text: t, buttonId: null })?.action, 'DISCARD', t);
  for (const t of ['1 bag cement', 'haan but change the date', 'raise mr', '']) assert.equal(replyIntent({ type: 'TEXT', text: t, buttonId: null }), null, t);
  assert.deepEqual(replyIntent({ type: 'BUTTON', text: 'Discard', buttonId: 'discard:3f9a1c2e-1111-4222-8333-444455556666' }), { action: 'DISCARD', id: '3f9a1c2e-1111-4222-8333-444455556666' });
  assert.equal(replyIntent({ type: 'VOICE', text: null, buttonId: null }), null);
});

test('a draft waits a day; the first draft WhatsApp can save is the one used', () => {
  const now = new Date('2026-10-23T12:00:00Z');
  assert.equal(withinSaveWindow(new Date('2026-10-22T12:30:00Z'), now), true);
  assert.equal(withinSaveWindow(new Date('2026-10-22T11:00:00Z'), now), false);
  assert.equal(pickDraft([draft({ kind: 'letter' }), draft({ kind: 'expense' })])?.kind, 'expense');
  assert.equal(pickDraft([draft({ kind: 'letter' })])?.kind, 'letter');
  assert.equal(pickDraft([]), null);
});

test('the reply names the draft, what to check and how to save it; a voice note is marked to check', () => {
  const text = draftReply(draft({ flags: [{ field: 'requiredDate', note: 'No date given; set to a week from today' }] }), 'https://app/whatsapp-capture?id=1', { buttons: false, voice: true });
  assert.match(text, /^Indent, not saved yet:/);
  assert.match(text, /From your voice note: check the figures/);
  assert.match(text, /Check: No date given/);
  assert.match(text, /Reply 1 to save it in your name, 2 to discard/);
  assert.match(text, /Open or change it: https:\/\/app\/whatsapp-capture\?id=1$/);
  assert.match(draftReply(draft(), 'x', { buttons: true, voice: false }), /Tap Save/);
  assert.doesNotMatch(draftReply(draft({ kind: 'letter' }), 'x', { buttons: false, voice: false }), /Reply 1/, 'a letter is only opened in the app');
});

test('what is asked: the words and the voice note; a photo says it will be attached', () => {
  assert.equal(questionOf({ type: 'VOICE', text: null, transcript: 'aaj 6 mistri' }), 'aaj 6 mistri');
  assert.match(questionOf({ type: 'PHOTO', text: 'diesel bill 450', transcript: null }), /^diesel bill 450\n\(A site photo came with this/);
  assert.match(questionOf({ type: 'PHOTO', text: null, transcript: null }), /no caption/);
  assert.equal(plainText('Filled **50 bags**: [MR-12](/material-requests/1)'), 'Filled *50 bags*: MR-12');
});

test('the create body: decimals as strings, empty values out, the client id and the photo', () => {
  const b = createBody('material-request', draft().values, { id: 'c1', attachmentIds: [] });
  assert.deepEqual(b, { projectId: 'p1', requiredDate: '2026-10-30', priority: 'NORMAL', items: [{ itemName: 'OPC 53 Grade Cement', unit: 'Bags', quantity: '50' }], id: 'c1', submit: true });
  const e = createBody('expense', { projectId: 'p1', amount: 450, gstRate: 0, vendor: undefined, remarks: '' }, { id: 'c2', attachmentIds: ['a1'] });
  assert.deepEqual(e, { projectId: 'p1', amount: '450', gstRate: '0', id: 'c2', submit: true, attachmentIds: ['a1'] });
  assert.equal(createBody('progress', { quantity: 12.5 }, { id: 'c3', attachmentIds: [] }).quantity, '12.5');
  assert.equal(firstProblem([{ property: 'items', children: [{ property: '0', children: [{ property: 'quantity', constraints: { isNumberString: 'quantity must be a number string' } }] }] }]), 'items.0.quantity must be a number string');
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`✗ ${name}\n  ${(e as Error).message}`);
  }
}
console.log(`WhatsApp rules: ${tests.length - failed} of ${tests.length} tests pass`);

async function demo(): Promise<number> {
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../app.module');
  const { PrismaService } = await import('../prisma/prisma.service');
  const { WhatsappService } = await import('../whatsapp/whatsapp.service');
  const { MessagingService } = await import('../messaging/messaging.service');
  const { AiService } = await import('../ai/ai.service');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const wa = app.get(WhatsappService);
  const messaging = app.get(MessagingService);
  const ai = app.get(AiService);
  const org = await prisma.organization.findFirstOrThrow({ where: { code: process.env.AI_CHECK_ORG ?? 'DEMO' } });
  const problems: string[] = [];
  const check = (name: string, ok: boolean, detail = '') => {
    if (!ok) problems.push(`${name}${detail ? `: ${detail}` : ''}`);
    else console.log(`  ok ${name}`);
  };
  const refuses = async (name: string, fn: () => Promise<unknown>, status: number) => {
    try {
      await fn();
      check(name, false, 'it went through');
    } catch (e) {
      const got = (e as { getStatus?: () => number }).getStatus?.();
      check(name, got === status, `${got}: ${(e as Error).message}`);
    }
  };
  const users = await prisma.user.findMany({ where: { organizationId: org.id, isActive: true }, include: { role: true } });
  const as = (email: string) => {
    const u = users.find((x) => x.email === email);
    if (!u) throw new Error(`No ${email} in the demo company`);
    return { id: u.id, organizationId: org.id, roleKey: u.role.key as RoleKey, email: u.email, fullName: u.fullName };
  };
  const engineer = as('engineer@demo.com');
  const pm = as('pm@demo.com');
  const admin = as('admin@demo.com');
  const phones = new Map(users.map((u) => [u.id, { phone: u.phone, captureFrom: u.captureFrom }]));
  const from = '919800000006';
  const run = randomUUID().slice(0, 8);
  const ref = (n: number) => `test-${run}-${n}`;
  const made: { kind: string; id: string }[] = [];
  const row = (id: string | null) => (id ? prisma.inboundMessage.findUnique({ where: { id }, include: { user: { select: { fullName: true } } } }) : Promise.resolve(null));

  try {
    await prisma.user.update({ where: { id: engineer.id }, data: { phone: '9800000006' } });
    await prisma.organization.update({ where: { id: org.id }, data: { aiEnabled: true } });

    // The switch takes the profile's number, which no one else may have on.
    const setup = await wa.updateSetup(engineer, true);
    check('switching on takes the number on the profile', setup.enabled && setup.phone === from, JSON.stringify(setup));
    await prisma.user.update({ where: { id: pm.id }, data: { phone: '+91 98000 00006' } });
    await refuses("someone else can't switch on the same number", () => wa.updateSetup(pm, true), 409);
    await prisma.user.update({ where: { id: pm.id }, data: { phone: phones.get(pm.id)!.phone } });

    // A number nobody switched on is not kept.
    const stranger = await wa.receive({ from: '919811122233', providerRef: ref(0), type: 'TEXT', text: 'raise mr 5 bags cement', media: null, buttonId: null });
    check('a number nobody switched on is not read', stranger.id === null);

    // A text becomes a material request; the same webhook again is read once; "1" saves it in the sender's name.
    const mrText = 'raise mr for 50 bags of opc 53 grade cement for rd-2026-01';
    const first = await wa.receive({ from, providerRef: ref(1), type: 'TEXT', text: mrText, media: null, buttonId: null });
    const mr = await row(first.id);
    const mrDraft = mr?.draft as unknown as AiDraftDto | null;
    check('a text is drafted', mr?.state === 'DRAFTED' && mrDraft?.kind === 'material-request', `${mr?.state} ${mr?.error ?? ''} ${mr?.reply ?? ''}`);
    check('the draft carries its message', mrDraft?.captureId === mr?.id);
    check('the reply shows the draft and how to save it', /^Indent, not saved yet:/.test(mr?.reply ?? '') && /Reply 1 to save/.test(mr?.reply ?? ''), mr?.reply ?? '');
    check('the message went into Ask Nirmaan as the sender', !!mr?.threadId && !!(await prisma.aiThread.findFirst({ where: { id: mr.threadId!, userId: engineer.id } })));
    const again = await wa.receive({ from, providerRef: ref(1), type: 'TEXT', text: mrText, media: null, buttonId: null });
    check('a webhook sent twice is read once', again.id === first.id && (await prisma.inboundMessage.count({ where: { providerRef: ref(1) } })) === 1);
    await wa.receive({ from, providerRef: ref(2), type: 'TEXT', text: '1', media: null, buttonId: null });
    const savedMr = await row(first.id);
    check('"1" saves the draft', savedMr?.state === 'SAVED' && savedMr.outcome === 'SAVED' && savedMr.recordId === savedMr.recordClientId, `${savedMr?.state} ${savedMr?.error ?? ''}`);
    const record = savedMr?.recordId ? await prisma.materialRequest.findUnique({ where: { id: savedMr.recordId }, include: { items: true } }) : null;
    if (record) made.push({ kind: 'material-request', id: record.id });
    check('the request is in the sender\'s name, sent for approval', record?.submittedById === engineer.id && record.status === 'SUBMITTED', `${record?.submittedById} ${record?.status}`);
    check('as drafted', record?.items.length === 1 && Number(record.items[0].quantity) === 50, JSON.stringify(record?.items));
    const twice = await wa.save(engineer, first.id!);
    check('a second Save is the same save', twice.record?.id === record?.id && (await prisma.materialRequest.count({ where: { id: record?.id ?? '' } })) === 1);

    // A voice note is heard and drafted as a DPR; "nahi" discards it.
    const voice = await wa.receive({
      from,
      providerRef: ref(3),
      type: 'VOICE',
      text: null,
      media: { ref: 'x', mimeType: 'audio/ogg' },
      buttonId: null,
      mediaBytes: { bytes: Buffer.from('FAKE:log dpr for rd-2026-01: 6 masons and 4 helpers on slab shuttering, rain stopped work for two hours'), mimeType: 'audio/ogg; codecs=opus' },
    });
    const v = await row(voice.id);
    check('a voice note is heard', v?.transcript?.startsWith('log dpr for rd-2026-01') === true && v.transcribeModel === 'fake', `${v?.state} ${v?.error ?? ''}`);
    check('and drafted as a DPR', v?.state === 'DRAFTED' && (v.draft as unknown as AiDraftDto).kind === 'dpr', `${v?.state} ${v?.error ?? ''} ${v?.reply ?? ''}`);
    check('marked to check', /From your voice note/.test(v?.reply ?? ''));
    check('the voice note is kept', !!v?.attachmentId);
    await wa.receive({ from, providerRef: ref(4), type: 'TEXT', text: 'nahi', media: null, buttonId: null });
    const discarded = await row(voice.id);
    check('"nahi" discards it', discarded?.state === 'DISCARDED' && discarded.outcome === 'DISCARDED' && !discarded.recordId);

    // A photo's expense is saved by its button, with the photo attached.
    const photo = await wa.receive({
      from,
      providerRef: ref(5),
      type: 'PHOTO',
      text: 'book expense rs 450 for diesel for the generator for rd-2026-01',
      media: { ref: 'y', mimeType: 'image/jpeg' },
      buttonId: null,
      mediaBytes: { bytes: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), mimeType: 'image/jpeg' },
    });
    const p = await row(photo.id);
    check('a photo with a caption is drafted', p?.state === 'DRAFTED' && (p.draft as unknown as AiDraftDto).kind === 'expense', `${p?.state} ${p?.error ?? ''} ${p?.reply ?? ''}`);
    await wa.receive({ from, providerRef: ref(6), type: 'BUTTON', text: 'Save', media: null, buttonId: `save:${photo.id}` });
    const savedP = await row(photo.id);
    check('its Save button saves it', savedP?.state === 'SAVED', `${savedP?.state} ${savedP?.error ?? ''}`);
    if (savedP?.recordId) made.push({ kind: 'expense', id: savedP.recordId });
    const att = savedP?.attachmentId ? await prisma.attachment.findUnique({ where: { id: savedP.attachmentId } }) : null;
    check('with the photo attached', !!att && att.expenseId === savedP?.recordId, `${att?.expenseId}`);

    // A question is only answered.
    const q = await wa.receive({ from, providerRef: ref(7), type: 'TEXT', text: 'what approvals are waiting', media: null, buttonId: null });
    const qa = await row(q.id);
    check('a question is answered, nothing drafted', qa?.state === 'ANSWERED' && !qa.draft && !!qa.reply, `${qa?.state} ${qa?.reply ?? ''}`);
    await wa.receive({ from, providerRef: ref(8), type: 'TEXT', text: '1', media: null, buttonId: null });
    check('"1" with nothing waiting saves nothing', (await prisma.inboundMessage.count({ where: { userId: engineer.id, state: 'SAVED', providerRef: { startsWith: `test-${run}` } } })) === 2);

    // Only the sender saves; a draft over a day old waits for the app.
    const late = await wa.receive({ from, providerRef: ref(9), type: 'TEXT', text: 'raise mr for 20 bags of opc 53 grade cement for rd-2026-01', media: null, buttonId: null });
    await refuses("someone else can't save it", () => wa.save(pm, late.id!), 403);
    await prisma.inboundMessage.update({ where: { id: late.id! }, data: { createdAt: new Date(Date.now() - 25 * 3600_000) } });
    await wa.receive({ from, providerRef: ref(10), type: 'TEXT', text: 'haan', media: null, buttonId: null });
    check('a draft over a day old is not saved by "haan"', (await row(late.id))?.state === 'DRAFTED');
    await refuses('nor from the page', () => wa.save(engineer, late.id!), 400);
    const lateDto = (await wa.list(engineer, { id: late.id! })).items[0];
    check('the page says it can no longer be saved here', lateDto?.canSave === false && lateDto.state === 'DRAFTED');

    // Changed in the form and saved there: linked as changed.
    const changed = await wa.receive({ from, providerRef: ref(11), type: 'TEXT', text: 'raise mr for 30 bags of opc 53 grade cement for rd-2026-01', media: null, buttonId: null });
    const cd = (await row(changed.id))!.draft as unknown as AiDraftDto;
    const { MaterialRequestsService } = await import('../material-requests/material-requests.service');
    const own = await app.get(MaterialRequestsService).create(engineer, { projectId: cd.projectId, requiredDate: String(cd.values.requiredDate), items: [{ itemName: 'OPC 53 Grade Cement', unit: 'Bags', quantity: '35' }], submit: true } as never);
    made.push({ kind: 'material-request', id: own.id });
    const linked = await wa.savedInApp(engineer, changed.id!, own.id);
    check('saved after a change in the app counts as changed', linked.state === 'SAVED' && linked.outcome === 'CHANGED' && linked.record?.id === own.id);

    // The list and its go-live figures; the company's only for admins.
    const mine = await wa.list(engineer, {});
    check('the sender sees their messages', mine.items.some((m) => m.id === first.id) && mine.stats.saved >= 2 && mine.stats.changed >= 1 && mine.stats.discarded >= 1, JSON.stringify(mine.stats));
    await refuses("a site engineer can't see the company's", () => wa.list(engineer, { scope: 'company' }), 403);
    check("an admin sees the company's", (await wa.list(admin, { scope: 'company' })).items.some((m) => m.id === first.id));

    // Ask Nirmaan off for the company: the message is kept and the sender told why.
    await prisma.organization.update({ where: { id: org.id }, data: { aiEnabled: false } });
    const off = await row((await wa.receive({ from, providerRef: ref(12), type: 'TEXT', text: 'raise mr for 5 bags of cement for rd-2026-01', media: null, buttonId: null })).id);
    check('with Ask Nirmaan off nothing is drafted, and the sender is told', off?.state === 'FAILED' && /switched off/.test(off.reply ?? ''), `${off?.state} ${off?.reply ?? ''}`);
    await prisma.organization.update({ where: { id: org.id }, data: { aiEnabled: true } });

    // Webhooks: Meta's check and signature, WATI's secret.
    process.env.WHATSAPP_VERIFY_TOKEN = 'verify-me';
    process.env.WHATSAPP_APP_SECRET = 'app-secret';
    process.env.WATI_WEBHOOK_SECRET = 'wati-secret';
    check("Meta's check gets its challenge back", wa.verify('subscribe', 'verify-me', '12345') === '12345');
    await refuses('a wrong verify token is refused', async () => wa.verify('subscribe', 'nope', '1'), 403);
    const raw = Buffer.from(JSON.stringify({ entry: [] }));
    await refuses('an unsigned webhook is refused', () => wa.metaWebhook(raw, 'sha256=00', {}), 403);
    const good = await wa.metaWebhook(raw, `sha256=${createHmac('sha256', 'app-secret').update(raw).digest('hex')}`, { entry: [] });
    check('a signed webhook is taken', good.ok);
    await refuses("a wrong WATI address is refused", () => wa.watiWebhook('nope', {}), 403);
    check('the right one is taken', (await wa.watiWebhook('wati-secret', { eventType: 'templateMessageSent' })).ok);

    // A new number on the profile switches entries off.
    await messaging.updatePrefs(engineer, { phone: '9800000099' } as never);
    check('a new number switches entries off', (await prisma.user.findUniqueOrThrow({ where: { id: engineer.id } })).captureFrom === null);

    // The voice notes are in the AI spend.
    const settings = await ai.settings(admin);
    const line = settings.byFeature.find((f) => f.feature === 'VOICE_NOTES');
    check('voice notes are counted in the month', (line?.count ?? 0) >= 1, JSON.stringify(line));
  } finally {
    const rows = await prisma.inboundMessage.findMany({ where: { organizationId: org.id, providerRef: { startsWith: `test-${run}` } }, select: { attachmentId: true, threadId: true } });
    await prisma.inboundMessage.deleteMany({ where: { organizationId: org.id, providerRef: { startsWith: `test-${run}` } } });
    for (const m of made) {
      if (m.kind === 'expense') await prisma.expense.delete({ where: { id: m.id } }).catch(() => undefined);
      else await prisma.materialRequest.delete({ where: { id: m.id } }).catch(() => undefined);
    }
    const attIds = rows.map((r) => r.attachmentId).filter((x): x is string => !!x);
    await prisma.attachment.deleteMany({ where: { id: { in: attIds } } });
    const threads = [...new Set(rows.map((r) => r.threadId).filter((x): x is string => !!x))];
    await prisma.aiMessage.deleteMany({ where: { threadId: { in: threads } } });
    await prisma.aiThread.deleteMany({ where: { id: { in: threads } } });
    for (const [id, p] of phones) await prisma.user.update({ where: { id }, data: { phone: p.phone, captureFrom: p.captureFrom } });
  }
  await app.close();
  for (const p of problems) console.log(`FAIL ${p}`);
  console.log(`Demo data: ${problems.length} problems`);
  return problems.length;
}

(async () => {
  const demoProblems = process.env.DATABASE_URL ? await demo() : 0;
  process.exit(failed || demoProblems ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
