/**
 * Weighbridge tests (item 148): a Connector's weighing, a weighbridge's settings, the ticket numbers, the net weight and
 * its units, short supply against the challan, a GRN booked above the net weight, and the watch list's short loads. No
 * database. CI runs it after the build:
 *
 *   node dist/scripts/weighbridge-test.js
 */
import assert from 'node:assert/strict';
import { grnAboveNet, kgPerUnit, kgToUnit, shortSupply, weighNet, weighStepProblem, weighTicketState, WEIGH_SHORT_LOADS } from '@erp/shared';
import { nextTicketNo, readWeighbridgeConfig, readWeighing } from '../weighbridge/weighbridge-rules';
import { weighShortCheck, type WeighLoad } from '../warnings/warning-rules';

const cases: [string, () => void][] = [];
const test = (name: string, fn: () => void) => cases.push([name, fn]);

const NOW = new Date('2026-10-20T06:00:00Z');

test('a weighing from the Connector is read, rounded and checked against the clock', () => {
  const r = readWeighing({ at: '2026-10-20T05:58:00Z', weightKg: 26420.0004, stableSeconds: 4.4 }, NOW);
  assert.deepEqual(r.weighing, { at: new Date('2026-10-20T05:58:00Z'), weightKg: 26420, stableSeconds: 4 });
  assert.equal(readWeighing({ at: '2026-10-20T05:58:00Z', weightKg: '8140' }, NOW).weighing?.stableSeconds, null);
  assert.match(readWeighing({ at: '2026-10-20T05:58:00Z' }, NOW).problem!, /No weightKg/);
  assert.match(readWeighing({ at: '2026-10-20T05:58:00Z', weightKg: 60 }, NOW).problem!, /empty bridge/);
  assert.match(readWeighing({ at: '2026-10-20T05:58:00Z', weightKg: 400_000 }, NOW).problem!, /more than a weighbridge/);
  assert.match(readWeighing({ at: '2026-10-10T05:58:00Z', weightKg: 9000 }, NOW).problem!, /more than 7 days ago/);
  assert.match(readWeighing({ at: '2026-10-20T07:00:00Z', weightKg: 9000 }, NOW).problem!, /ahead of the clock/);
  assert.match(readWeighing({ weightKg: 9000 }, NOW).problem!, /no time/);
  assert.match(readWeighing([1], NOW).problem!, /not a JSON object/);
});

test("a weighbridge's settings: a serial port or a network address, with the defaults", () => {
  assert.deepEqual(readWeighbridgeConfig({ source: 'SERIAL', port: 'com3' }).config, { source: 'SERIAL', port: 'COM3', baud: 9600, minKg: 200, stableSeconds: 3 });
  assert.deepEqual(readWeighbridgeConfig({ source: 'SERIAL', port: '/dev/ttyUSB0', baud: '2400', minKg: 500, stableSeconds: 5 }).config, {
    source: 'SERIAL',
    port: '/dev/ttyUSB0',
    baud: 2400,
    minKg: 500,
    stableSeconds: 5,
  });
  assert.deepEqual(readWeighbridgeConfig({ source: 'TCP', host: '192.168.1.50', tcpPort: 4001 }).config, { source: 'TCP', host: '192.168.1.50', tcpPort: 4001, minKg: 200, stableSeconds: 3 });
  assert.match(readWeighbridgeConfig({}).problem!, /serial port or its network address/);
  assert.match(readWeighbridgeConfig({ source: 'SERIAL', port: 'C:\\x' }).problem!, /COM3/);
  assert.match(readWeighbridgeConfig({ source: 'SERIAL', port: 'COM3', baud: 9601 }).problem!, /baud rate/);
  assert.match(readWeighbridgeConfig({ source: 'TCP', host: 'http://x', tcpPort: 4001 }).problem!, /address on the site/);
  assert.match(readWeighbridgeConfig({ source: 'TCP', host: '192.168.1.50', tcpPort: 70000 }).problem!, /port/);
  assert.match(readWeighbridgeConfig({ source: 'TCP', host: '192.168.1.50', tcpPort: 4001, minKg: 5 }).problem!, /between 20 and 20,000/);
  assert.match(readWeighbridgeConfig({ source: 'TCP', host: '192.168.1.50', tcpPort: 4001, stableSeconds: 0 }).problem!, /between 1 and 30/);
});

test('ticket numbers run on through the year and start again with the next', () => {
  assert.equal(nextTicketNo(null, 2026), 'WB-2026-0001');
  assert.equal(nextTicketNo('WB-2026-0041', 2026), 'WB-2026-0042');
  assert.equal(nextTicketNo('WB-2025-0917', 2026), 'WB-2026-0001');
});

test('the net weight is gross less tare, whichever came first, in the units a bridge weighs', () => {
  assert.deepEqual(weighNet(26_420, 8_280), { grossKg: 26_420, tareKg: 8_280, netKg: 18_140 });
  // An outgoing truck (empty first): the same net.
  assert.deepEqual(weighNet(8_280, 26_420), { grossKg: 26_420, tareKg: 8_280, netKg: 18_140 });
  assert.equal(weighNet(26_420, null), null);
  assert.equal(kgPerUnit('MT'), 1000);
  assert.equal(kgPerUnit('Kg'), 1);
  assert.equal(kgPerUnit('Qtl'), 100);
  assert.equal(kgPerUnit('tonnes'), 1000);
  assert.equal(kgPerUnit('Cum'), null);
  assert.equal(kgPerUnit('Bags'), null);
  assert.equal(kgToUnit(18_140, 'MT'), 18.14);
  assert.equal(kgToUnit(18_145, 'Qtl'), 181.45);
  assert.equal(kgToUnit(18_140, 'Cum'), null);
});

test('a second weight before the first, or too close to it, is refused', () => {
  const first = { kg: 26_420, at: new Date('2026-10-20T03:00:00Z') };
  assert.equal(weighStepProblem(first, { kg: 8_280, at: new Date('2026-10-20T03:30:00Z') }), null);
  assert.match(weighStepProblem(first, { kg: 8_280, at: new Date('2026-10-20T02:30:00Z') })!, /from before the first/);
  assert.match(weighStepProblem(first, { kg: 26_300, at: new Date('2026-10-20T03:30:00Z') })!, /differ by only 120 kg/);
});

test('short supply: the net weight against the challan, beyond the larger of 0.5% and 20 kg', () => {
  // 18 MT on the challan, 17.66 weighed: 340 kg short, 1.89%, allowance 90 kg.
  assert.deepEqual(shortSupply(17_660, 18, 'MT'), { challanKg: 18_000, netKg: 17_660, shortKg: 340, shortPct: 1.89, allowanceKg: 90, short: true });
  // Within the allowance, and over the challan.
  assert.equal(shortSupply(17_950, 18, 'MT')!.short, false);
  assert.equal(shortSupply(18_140, 18, 'MT')!.shortKg, -140);
  assert.equal(shortSupply(18_140, 18, 'MT')!.short, false);
  // A small load: the 20 kg floor.
  assert.deepEqual(shortSupply(1_975, 2, 'MT'), { challanKg: 2_000, netKg: 1_975, shortKg: 25, shortPct: 1.25, allowanceKg: 20, short: true });
  // No challan quantity, or a unit a bridge cannot weigh in.
  assert.equal(shortSupply(17_660, null, 'MT'), null);
  assert.equal(shortSupply(17_660, 0, 'MT'), null);
  assert.equal(shortSupply(17_660, 12, 'Cum'), null);
});

test('a GRN booked above the net weight is named, within the allowance it is not', () => {
  assert.equal(grnAboveNet(18, 17_660, 'MT'), 340);
  assert.equal(grnAboveNet(17.7, 17_660, 'MT'), null);
  assert.equal(grnAboveNet(17.66, 17_660, 'MT'), null);
  assert.equal(grnAboveNet(18, 17_660, 'Cum'), null);
});

test("a ticket's state follows its weights, its GRN and a cancellation", () => {
  assert.equal(weighTicketState({ secondKg: null, stockEntryId: null, cancelledAt: null }), 'FIRST');
  assert.equal(weighTicketState({ secondKg: 8280, stockEntryId: null, cancelledAt: null }), 'WEIGHED');
  assert.equal(weighTicketState({ secondKg: 8280, stockEntryId: 'g', cancelledAt: null }), 'RECEIVED');
  assert.equal(weighTicketState({ secondKg: null, stockEntryId: null, cancelledAt: new Date() }), 'CANCELLED');
});

test("the watch list names a supplier from two short loads, with the loads it is about", () => {
  const load = (ticketNo: string, date: string, netKg: number, challan: number | null): WeighLoad => {
    const s = shortSupply(netKg, challan, 'MT');
    return { ticketNo, date, shortKg: s?.shortKg ?? null, shortPct: s?.shortPct ?? null, short: !!s?.short };
  };
  const loads = [load('WB-2026-0001', '2026-10-11', 18_140, 18), load('WB-2026-0003', '2026-10-17', 19_470, 20), load('WB-2026-0002', '2026-10-14', 17_660, 18), load('WB-2026-0006', '2026-10-18', 12_000, null)];
  assert.deepEqual(weighShortCheck(loads, WEIGH_SHORT_LOADS), { loads: 3, shortLoads: 2, shortKg: 870, worstPct: 2.65, tickets: ['WB-2026-0002', 'WB-2026-0003'], last: '2026-10-17' });
  assert.equal(weighShortCheck(loads.slice(0, 2), WEIGH_SHORT_LOADS), null);
  assert.equal(weighShortCheck([], WEIGH_SHORT_LOADS), null);
});

let failed = 0;
for (const [name, fn] of cases) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`✗ ${name}\n  ${(e as Error).message.split('\n').join('\n  ')}`);
  }
}
console.log(`\nWeighbridge: ${cases.length - failed} of ${cases.length} tests pass`);
process.exit(failed ? 1 : 0);
