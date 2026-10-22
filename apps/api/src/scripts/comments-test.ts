/**
 * Comments and mentions' tests (v6 item 116): what a comment needs, who hears of it, who may change it, the order of
 * threads and how a comment's mentions are drawn, with no database. CI runs it after the build:
 *
 *   node dist/scripts/comments-test.js
 */
import assert from 'node:assert/strict';
import { commentSegments } from '@erp/shared';
import { commentProblem, keptMentions, mayChange, noticeBody, noticeTitle, threadOrder, whoToTell } from '../comments/comment-rules';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);

const kavita = { id: 'u-kavita', name: 'Kavita Rao' };
const suresh = { id: 'u-suresh', name: 'Suresh Nayak' };

test('a comment needs words, a sensible length and each mention written out', () => {
  assert.equal(commentProblem('  ', []), 'Write the comment');
  assert.equal(commentProblem('x'.repeat(4001), []), 'Keep the comment under 4000 characters');
  assert.equal(commentProblem('@Kavita Rao can we pour on Friday?', [kavita]), null);
  assert.equal(commentProblem('Can we pour on Friday?', [kavita]), 'Write @Kavita Rao in the comment, or take them off the mentions');
  const many = Array.from({ length: 11 }, (_, i) => ({ id: `u${i}`, name: `P${i}` }));
  assert.equal(commentProblem(many.map((m) => `@${m.name}`).join(' '), many), 'Mention at most 10 people in one comment');
});

test('only mentions still written in the text count, each once', () => {
  assert.deepEqual(keptMentions('@Kavita Rao and @Kavita Rao again', [kavita, kavita, suresh]), [kavita]);
  assert.deepEqual(keptMentions('nobody', [kavita]), []);
});

test('those mentioned hear they were, the rest of the thread hears of the reply, never the writer, never twice', () => {
  // A new thread: only those mentioned, not the writer even if they mention themselves.
  assert.deepEqual(whoToTell('a', ['b', 'a', 'b'], null), { mentioned: ['b'], replied: [] });
  // A reply: the thread's writers and those mentioned in it, less the replier and anyone this reply mentions.
  assert.deepEqual(whoToTell('b', ['c'], { writers: ['a', 'b', 'a'], mentioned: ['b', 'c', 'd'] }), { mentioned: ['c'], replied: ['a', 'd'] });
  assert.deepEqual(whoToTell('a', [], { writers: ['a'], mentioned: [] }), { mentioned: [], replied: [] });
});

test('the author edits a comment; the author or an admin removes it; removed stays removed', () => {
  const c = { authorId: 'a', removedAt: null };
  assert.equal(mayChange(c, { id: 'a', isAdmin: false }, 'edit'), true);
  assert.equal(mayChange(c, { id: 'b', isAdmin: true }, 'edit'), false);
  assert.equal(mayChange(c, { id: 'b', isAdmin: true }, 'remove'), true);
  assert.equal(mayChange(c, { id: 'b', isAdmin: false }, 'remove'), false);
  assert.equal(mayChange({ authorId: 'a', removedAt: new Date() }, { id: 'a', isAdmin: false }, 'edit'), false);
});

test('open threads come first with the latest word on top, then the resolved, latest resolved first', () => {
  const d = (s: string) => new Date(`2026-10-${s}T10:00:00Z`);
  const threads = [
    { id: 'old-open', resolvedAt: null, lastAt: d('10') },
    { id: 'resolved-early', resolvedAt: d('11'), lastAt: d('11') },
    { id: 'new-open', resolvedAt: null, lastAt: d('20') },
    { id: 'resolved-late', resolvedAt: d('15'), lastAt: d('12') },
  ];
  assert.deepEqual(threadOrder(threads).map((t) => t.id), ['new-open', 'old-open', 'resolved-late', 'resolved-early']);
});

test('a notice names who and where, and cuts the comment to a line', () => {
  assert.equal(noticeTitle('Asha Rao', 'mentioned', 'Purchase Order PO-0007'), 'Asha Rao mentioned you on Purchase Order PO-0007');
  assert.equal(noticeTitle('Asha Rao', 'replied', 'MOM-0003 Progress review'), 'Asha Rao replied on MOM-0003 Progress review');
  assert.equal(noticeBody('Pour\n\n on   Friday'), 'Pour on Friday');
  assert.equal(noticeBody('x'.repeat(200), 20), `${'x'.repeat(19)}…`);
});

test('a comment is drawn with each mention on its own, longest name first', () => {
  const kav = { id: 'k', name: 'Kavita' };
  assert.deepEqual(commentSegments('@Kavita Rao and @Kavita, see this', [kav, kavita]), [
    { text: '@Kavita Rao', mentionId: 'u-kavita' },
    { text: ' and ' },
    { text: '@Kavita', mentionId: 'k' },
    { text: ', see this' },
  ]);
  assert.deepEqual(commentSegments('no one', [kavita]), [{ text: 'no one' }]);
  assert.deepEqual(commentSegments('', []), []);
});

let failed = 0;
for (const [name, fn] of cases) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n${(e as Error).message}`);
  }
}
console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
