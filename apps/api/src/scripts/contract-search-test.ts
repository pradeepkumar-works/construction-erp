/**
 * Ask the contract: reading PDFs by page, the search words, excerpts and the quote check as unit tests,
 * then on the demo data the 30 contract questions (each must find its clause on the expected page among the first
 * three results), letters, and who sees what. No model is called. CI runs it after the seed:
 *
 *   DATABASE_URL=… node dist/scripts/contract-search-test.js
 */
import assert from 'node:assert/strict';
import type { RoleKey } from '@erp/shared';
import { CONTRACT_QUESTIONS, DEMO_CONTRACTS, LETTER_QUESTIONS, textPdf } from '../documents/demo-contracts';
import { excerpt, pageText, readPdfPages, searchWords, tsQueryText, unverifiedQuotes } from '../documents/document-text';

const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

test('a generated contract reads back page by page, with each answer on its page', async () => {
  for (const c of DEMO_CONTRACTS) {
    const pages = await readPdfPages(textPdf(c.title, c.pages));
    assert.equal(pages.length, c.pages.length, c.docNo);
    for (const q of CONTRACT_QUESTIONS.filter((x) => x.docNo === c.docNo)) {
      assert.ok(pages[q.page - 1].replace(/\s+/g, ' ').includes(q.phrase), `${c.docNo} page ${q.page} should have "${q.phrase}"`);
    }
  }
});

test('page text keeps lines and joins a word split at a line-end hyphen', () => {
  assert.equal(pageText([{ str: 'Liquidated dam-', hasEOL: true }, { str: 'ages  shall not', hasEOL: true }, { str: '' }, { str: 'exceed 10%.' }]), 'Liquidated damages shall not\nexceed 10%.');
});

test('a question becomes the words worth searching for, with what contracts call them', () => {
  assert.deepEqual(searchWords('What is the LD cap?'), ['ld', 'liquidated', 'damages', 'compensation', 'delay', 'cap', 'maximum', 'exceed', 'limit']);
  assert.ok(searchWords('Did we notify the client about the land delay?').includes('encroachment'));
  assert.ok(searchWords('How many years of O&M?').includes('maintenance'));
  assert.equal(tsQueryText('what is it?'), null);
  assert.equal(tsQueryText('Clause 14.2'), '14.2');
});

test('an excerpt keeps the part of a long page where the words are', () => {
  const page = `${'Preamble line.\n'.repeat(200)}Clause 12. Liquidated damages shall not exceed 10%.\n${'Other text.\n'.repeat(200)}`;
  const e = excerpt(page, 'liquidated damages cap', 600);
  assert.ok(e.includes('Liquidated damages shall not exceed 10%'));
  assert.ok(e.length <= 610);
  assert.ok(e.startsWith('… '));
});

test("a quote must be in what the search returned; a made-up one is caught", () => {
  const source = ['12.2 Liquidated damages shall not exceed a maximum of 10% (ten per cent) of the Contract Price.'];
  assert.deepEqual(unverifiedQuotes('Clause 12.2 says "Liquidated damages shall not exceed a maximum of 10% (ten per cent)" (page 4).', source), []);
  assert.deepEqual(unverifiedQuotes('It says “liquidated damages shall not exceed … of the Contract Price”.', source), []);
  assert.deepEqual(unverifiedQuotes('It says "Liquidated damages shall not exceed 5% of the Contract Price".', source), ['“Liquidated damages shall not exceed 5% of the Contract Price”']);
  assert.deepEqual(unverifiedQuotes('Short "quote" is fine.', source), []);
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
  console.log(`Contract search rules: ${tests.length - failed} of ${tests.length} tests pass`);
  return failed;
}

async function demo(): Promise<number> {
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../app.module');
  const { PrismaService } = await import('../prisma/prisma.service');
  const { DocumentTextService } = await import('../documents/document-text.service');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const search = app.get(DocumentTextService);
  const org = await prisma.organization.findFirstOrThrow({ where: { code: process.env.AI_CHECK_ORG ?? 'DEMO' } });
  const problems: string[] = [];
  const check = (name: string, ok: boolean, detail = '') => {
    if (!ok) problems.push(`${name}${detail ? `: ${detail}` : ''}`);
  };
  const users = await prisma.user.findMany({ where: { organizationId: org.id, isActive: true }, include: { role: true } });
  const as = (email: string) => {
    const u = users.find((x) => x.email === email);
    if (!u) throw new Error(`No ${email} in the demo company`);
    return { id: u.id, organizationId: org.id, roleKey: u.role.key as RoleKey, email: u.email, fullName: u.fullName };
  };
  const contracts = await prisma.document.findMany({ where: { organizationId: org.id, docNo: { in: DEMO_CONTRACTS.map((c) => c.docNo) } }, select: { id: true, docNo: true, projectId: true, currentRevisionId: true } });
  check('the seed files the three sample contracts', contracts.length === 3, contracts.map((c) => c.docNo).join(', '));
  const projectOf = new Map(contracts.map((c) => [c.docNo, c.projectId]));
  const files = await prisma.attachment.findMany({ where: { revisionId: { in: contracts.map((c) => c.currentRevisionId!) } }, select: { id: true } });

  try {
    // Read from scratch, as the first search after filing does.
    await prisma.documentPage.deleteMany({ where: { attachmentId: { in: files.map((f) => f.id) } } });
    await prisma.attachment.updateMany({ where: { id: { in: files.map((f) => f.id) } }, data: { textIndexedAt: null, textPages: null, textError: null } });
    const md = as('md@demo.com');
    const askOnly = await search.search(md, { query: 'liquidated damages', projectId: projectOf.get('RD-AGR-01'), read: false });
    check("Ask's search reads nothing itself and says what is unread", !askOnly.hits.some((h) => h.title.startsWith('RD-AGR-01')) && askOnly.unread >= 1, JSON.stringify({ hits: askOnly.hits.length, unread: askOnly.unread }));
    const first = await search.search(md, { query: 'liquidated damages', projectId: projectOf.get('RD-AGR-01') });
    check('the first search reads the filed contract', first.hits.some((h) => h.title.startsWith('RD-AGR-01') && h.page === 4), JSON.stringify(first.hits.map((h) => [h.title, h.page])));
    await search.readPending(org.id, null, 20);
    const read = await prisma.attachment.findMany({ where: { id: { in: files.map((f) => f.id) } }, select: { textPages: true, textError: true } });
    check('every contract is read, a row per page', read.every((r) => (r.textPages ?? 0) >= 5 && !r.textError), JSON.stringify(read));

    // A file that failed is tried again a day later, not on every search.
    const [failedRecently, failedYesterday] = files;
    const hour = 60 * 60 * 1000;
    await prisma.attachment.update({ where: { id: failedRecently.id }, data: { textError: 'test failure', textPages: 0, textIndexedAt: new Date(Date.now() - hour) } });
    await prisma.attachment.update({ where: { id: failedYesterday.id }, data: { textError: 'test failure', textPages: 0, textIndexedAt: new Date(Date.now() - 25 * hour) } });
    await search.readPending(org.id, null, 20);
    const retried = await prisma.attachment.findMany({ where: { id: { in: [failedRecently.id, failedYesterday.id] } }, select: { id: true, textPages: true, textError: true } });
    const recent = retried.find((r) => r.id === failedRecently.id);
    const older = retried.find((r) => r.id === failedYesterday.id);
    check('a file that failed an hour ago waits', recent?.textError === 'test failure', JSON.stringify(recent));
    check('a file that failed a day ago is read again', !older?.textError && (older?.textPages ?? 0) >= 5, JSON.stringify(older));
    await prisma.attachment.update({ where: { id: failedRecently.id }, data: { textIndexedAt: null, textError: null } });
    await search.readPending(org.id, null, 20);

    let top1 = 0;
    let top3 = 0;
    for (const q of CONTRACT_QUESTIONS) {
      const { hits } = await search.search(md, { query: q.question, projectId: projectOf.get(q.docNo) });
      const rank = hits.findIndex((h) => h.title.startsWith(q.docNo) && h.page === q.page);
      if (rank === 0) top1++;
      if (rank >= 0 && rank < 3) top3++;
      else check(`"${q.question}" finds ${q.docNo} page ${q.page} among the first three`, false, hits.slice(0, 3).map((h) => `${h.title.split(' ')[0]} p${h.page}`).join(', ') || 'nothing');
      const hit = hits[rank];
      if (hit) check(`"${q.question}": the excerpt carries the clause`, hit.text.replace(/\s+/g, ' ').includes(q.phrase));
      if (hit) check(`"${q.question}": the link opens the page`, /^\/documents\/view\?file=[0-9a-f-]{36}&page=\d+$/.test(hit.href), hit.href);
    }
    console.log(`Contract questions: ${top1} of ${CONTRACT_QUESTIONS.length} first, ${top3} in the first three`);

    for (const l of LETTER_QUESTIONS) {
      const { hits } = await search.search(md, { query: l.question, projectId: projectOf.get('RD-AGR-01') });
      const rank = hits.findIndex((h) => h.source === 'LETTER' && h.text.includes(l.subject));
      check(`"${l.question}" finds the letter "${l.subject}" among the first three`, rank >= 0 && rank < 3, hits.slice(0, 3).map((h) => h.title).join(' | '));
    }

    // Who sees what: the engineer is not on the hospital project and does not see letters.
    const engineer = as('engineer@demo.com');
    const mine = await search.search(engineer, { query: 'liquidated damages maximum' });
    check("a site engineer finds their own projects' contracts", mine.hits.some((h) => h.title.startsWith('RD-AGR-01')));
    check("a site engineer does not find a project they are not on", !mine.hits.some((h) => h.title.startsWith('HB-AGR-01')));
    const theirs = await search.search(engineer, { query: 'encroachment hindrance notice' });
    check('a site engineer does not find letters', !theirs.hits.some((h) => h.source === 'LETTER'));
    let refused = false;
    try {
      await search.search(engineer, { query: 'arbitration', projectId: projectOf.get('HB-AGR-01') });
    } catch {
      refused = true;
    }
    check("a site engineer cannot search a project they are not on", refused);
    let pageRefused = false;
    const hbFile = await prisma.attachment.findFirst({ where: { revision: { document: { docNo: 'HB-AGR-01', organizationId: org.id } } }, select: { id: true } });
    try {
      await search.page(engineer, hbFile!.id, 1);
    } catch {
      pageRefused = true;
    }
    check("a site engineer cannot open a page of another project's contract", pageRefused);
    const view = await search.page(md, hbFile!.id, 2);
    check('the page view gives the file, the page and its text', view.page === 2 && !!view.text?.includes('Compensation for delay') && view.recordHref.startsWith('/documents?id='), JSON.stringify({ ...view, text: view.text?.slice(0, 40) }));

    // A superseded revision is not searched: file R1 without the clause, then put R0 back.
    const road = contracts.find((c) => c.docNo === 'RD-AGR-01')!;
    const r1 = await prisma.documentRevision.create({ data: { documentId: road.id, revision: 'R1-TEST', issuedOn: new Date(), status: 'FOR_CONSTRUCTION', issuedById: md.id } });
    await prisma.document.update({ where: { id: road.id }, data: { currentRevisionId: r1.id } });
    try {
      const after = await search.search(md, { query: 'liquidated damages', projectId: road.projectId });
      check('a superseded revision is not searched', !after.hits.some((h) => h.title.startsWith('RD-AGR-01')), after.hits.map((h) => h.title).join(' | '));
    } finally {
      await prisma.document.update({ where: { id: road.id }, data: { currentRevisionId: road.currentRevisionId } });
      await prisma.documentRevision.delete({ where: { id: r1.id } });
    }
  } finally {
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
