/** The org chart: people under whom they report to, roots for no manager or one who left, loops broken. Run: node dist/scripts/org-chart-test.js */
import assert from 'node:assert/strict';
import { orgChart, type OrgNode, type OrgPerson } from '@erp/shared';

const p = (id: string, fullName: string, reportingToId: string | null = null): OrgPerson => ({ id, fullName, reportingToId });
/** The tree as indented names, a loop marked, so a case reads as the chart does. */
const draw = (nodes: OrgNode<OrgPerson>[], depth = 0): string[] =>
  nodes.flatMap((n) => [`${'  '.repeat(depth)}${n.person.fullName}${n.loop ? ' (loop)' : ''}`, ...draw(n.reports, depth + 1)]);

const cases: [string, () => void][] = [
  ['people sit under whom they report to, by name at each level', () => {
    const people = [p('qa', 'Usha QA', 'md'), p('md', 'Mohan MD'), p('se2', 'Bina SE', 'pm'), p('pm', 'Kiran PM', 'md'), p('se1', 'Arun SE', 'pm')];
    assert.deepEqual(draw(orgChart(people)), ['Mohan MD', '  Kiran PM', '    Arun SE', '    Bina SE', '  Usha QA']);
  }],
  ['everyone below a person is counted at every level', () => {
    const [root] = orgChart([p('md', 'Mohan MD'), p('pm', 'Kiran PM', 'md'), p('se', 'Arun SE', 'pm'), p('qa', 'Usha QA', 'md')]);
    assert.equal(root.below, 3);
    assert.equal(root.reports.find((r) => r.person.id === 'pm')!.below, 1);
  }],
  ['someone whose manager left (not in the list) starts a tree of their own', () => {
    assert.deepEqual(draw(orgChart([p('se', 'Arun SE', 'gone'), p('md', 'Mohan MD')])), ['Arun SE', 'Mohan MD']);
  }],
  ['a loop cannot hang the chart: one on it becomes a root, marked, and everyone is drawn once', () => {
    const people = [p('a', 'Asha', 'b'), p('b', 'Bala', 'a'), p('c', 'Chetan', 'a'), p('d', 'Deepa', 'd')];
    const lines = draw(orgChart(people));
    assert.deepEqual(lines, ['Deepa', 'Asha (loop)', '  Bala', '  Chetan']);
  }],
  ['a person hanging under a loop is drawn under it, not as a root', () => {
    const lines = draw(orgChart([p('x', 'Aaron', 'b'), p('a', 'Bhanu', 'b'), p('b', 'Charu', 'a')]));
    assert.equal(lines.filter((l) => !l.startsWith(' ')).length, 1);
    assert.equal(lines.length, 3);
  }],
  ['no one is left out of a large chart with several loops', () => {
    const people = Array.from({ length: 300 }, (_, i) => p(`e${i}`, `Person ${String(i).padStart(3, '0')}`, i % 50 === 0 ? `e${i + 49}` : `e${i - 1}`));
    const count = (nodes: OrgNode<OrgPerson>[]): number => nodes.reduce((n, x) => n + 1 + count(x.reports), 0);
    const roots = orgChart(people);
    assert.equal(count(roots), 300);
    assert.equal(roots.length, 6);
    assert.ok(roots.every((r) => r.loop));
  }],
];

let failed = 0;
for (const [name, fn] of cases) {
  try {
    fn();
    console.log(`ok  ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}\n  ${(e as Error).message}`);
  }
}
console.log(`${cases.length - failed}/${cases.length} passed`);
if (failed) process.exit(1);
