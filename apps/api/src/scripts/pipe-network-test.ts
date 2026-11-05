/**
 * Pipe network tests. Reading an EPANET file (units, valves, pumps, coordinates) and a design office's sheet
 * with loose headers, the checks that stop an import, what a re-import changes (matched by code, never shortening a pipe
 * below its work), a segment's stages held to its length and weighted, the zone's pipe sheet, the pipes ready to
 * start, a Google Earth alignment cut at its named points and by chainage, the cap a DPR line meets, the DPR's pipeline summary, and a stage guessed from an activity's name.
 *
 *   node dist/scripts/pipe-network-test.js
 */
import assert from 'node:assert/strict';
import {
  activityPipeStage,
  guessPipeStage,
  importPlan,
  networkProblems,
  chainageLabel,
  groundDistanceM,
  parseEpanetInp,
  parseKml,
  parseNetworkSheets,
  pipelineSummary,
  segmentCapProblem,
  segmentLabel,
  segmentStatus,
  workingFronts,
  zoneTable,
} from '@erp/shared';

const tests: [string, () => void][] = [];
const test = (name: string, fn: () => void) => tests.push([name, fn]);

const INP = `
[TITLE]
Zone 4 demo network ; invented
[JUNCTIONS]
;ID  Elev  Demand
J-1  104.2  1.2
J-2  103.8  0.8
J-3  103.1  0.6
[RESERVOIRS]
R-1  120
[TANKS]
T-1  112  3  1  5  12  0
[PIPES]
;ID  Node1  Node2  Length  Diameter  Roughness
P-1  T-1  J-1  250.5  200  140
P-2  J-1  J-2  180  160  140
P-3  J-2  J-3  95.25  110  140
[PUMPS]
PU-1  R-1  T-1  HEAD 1
[VALVES]
V-1  J-2  J-3  110  TCV  0
[COORDINATES]
T-1  0  0
J-1  250  0
J-2  430  0
J-3  430  -95
[OPTIONS]
Units  LPS
[END]
`;

test('an EPANET file gives nodes, pipes, coordinates and a valve point; pumps are left out and said so', () => {
  const f = parseEpanetInp(INP);
  assert.deepEqual(f.nodes.map((n) => [n.code, n.kind]), [['J-1', 'JUNCTION'], ['J-2', 'JUNCTION'], ['J-3', 'JUNCTION'], ['R-1', 'SOURCE'], ['T-1', 'TANK'], ['V-1', 'SLUICE_VALVE']]);
  assert.deepEqual(f.pipes.map((p) => [p.code, p.from, p.to, p.lengthM, p.diameterMm]), [['P-1', 'T-1', 'J-1', 250.5, 200], ['P-2', 'J-1', 'J-2', 180, 160], ['P-3', 'J-2', 'J-3', 95.25, 110]]);
  const j2 = f.nodes.find((n) => n.code === 'J-2')!;
  assert.deepEqual([j2.x, j2.y, j2.groundLevel], [430, 0, 103.8]);
  const valve = f.nodes.find((n) => n.code === 'V-1')!;
  assert.deepEqual([valve.x, valve.y], [430, -47.5]);
  assert.ok(f.notes.some((n) => /1 pump left out/.test(n)));
  assert.deepEqual(networkProblems(f), []);
});

test('an EPANET file in US units comes out in metres and millimetres', () => {
  const f = parseEpanetInp(INP.replace('Units  LPS', 'Units  GPM'));
  assert.equal(f.pipes[0].lengthM, 76.352);
  assert.equal(f.pipes[0].diameterMm, 5080);
  assert.ok(f.notes.some((n) => /feet/.test(n)));
});

test("a design office's sheet reads with loose headers, existing pipes and kinds by their words", () => {
  const f = parseNetworkSheets(
    [
      { 'Node ID': 'ESR-1', Type: 'ESR', 'G.L.': '' , Easting: 10, Northing: 20 },
      { 'Node ID': 'J-1', Type: '', GL: '101.5', Chainage: '1+250.5' },
      { 'Node ID': 'SV-1', Type: 'Sluice valve', Chainage: 1290.4 },
    ],
    [
      { 'Pipe No': 'P-1', 'From node': 'ESR-1', 'To node': 'J-1', 'Length (m)': '1,250.5', 'Dia (mm)': 160, Material: 'HDPE PE100', Class: 'PN 6', Status: 'Proposed' },
      { 'Pipe No': 'P-2', 'From node': 'J-1', 'To node': 'SV-1', 'Length (m)': 40, 'Dia (mm)': 110, Material: 'CI', Status: 'Existing' },
    ],
  );
  assert.deepEqual(f.nodes.map((n) => n.kind), ['TANK', 'JUNCTION', 'SLUICE_VALVE']);
  assert.deepEqual([f.nodes[0].x, f.nodes[0].y, f.nodes[1].groundLevel], [10, 20, 101.5]);
  assert.deepEqual(f.nodes.map((n) => n.chainage), [null, 1251, 1290], 'a chainage as the site writes it, in whole metres');
  assert.deepEqual(f.pipes.map((p) => [p.lengthM, p.diameterMm, p.material, p.pipeClass, p.scope]), [[1250.5, 160, 'HDPE', 'PN 6', 'PROPOSED'], [40, 110, 'CI', null, 'EXISTING']]);
});

test('an import stops on repeated codes, pipes to nowhere and missing sizes, and says which', () => {
  const problems = networkProblems({
    nodes: [
      { code: 'J-1', kind: 'JUNCTION', groundLevel: null, x: null, y: null, chainage: null },
      { code: 'J-1', kind: 'JUNCTION', groundLevel: null, x: null, y: null, chainage: null },
    ],
    pipes: [
      { code: 'P-1', from: 'J-1', to: 'J-9', lengthM: 0, diameterMm: 110, material: 'HDPE', pipeClass: null, scope: 'PROPOSED', surface: null, crossing: null },
      { code: 'P-2', from: 'J-1', to: 'T-1', lengthM: 20, diameterMm: 0, material: 'HDPE', pipeClass: null, scope: 'PROPOSED', surface: null, crossing: null },
    ],
  }, ['T-1']);
  assert.deepEqual(problems, ['Node J-1 is in the file twice', 'Pipe P-1 ends at J-9, which is not in the file', 'Pipe P-1 has no length', 'Pipe P-2 has no diameter']);
});

test('a re-import matches by code: new, changed and kept pipes, and none made shorter than its work', () => {
  const pipe = (code: string, lengthM: number, diameterMm = 110) => ({ code, from: 'A', to: 'B', lengthM, diameterMm, material: 'HDPE' as const, pipeClass: null, scope: 'PROPOSED' as const, surface: null, crossing: null });
  const plan = importPlan(
    { nodes: [], pipes: [{ ...pipe('P-1', 100), doneM: 80 }, { ...pipe('P-2', 50), doneM: 50 }, pipe('P-3', 40), pipe('P-10', 30)] },
    { nodes: [], pipes: [pipe('P-1', 100), pipe('P-2', 45), pipe('P-3', 40, 90), pipe('P-4', 60)] },
  );
  assert.deepEqual(plan.pipes, { added: 1, changed: 2, unchanged: 1 });
  assert.deepEqual(plan.notInFile, ['P-10']);
  assert.deepEqual(plan.shortened, ['P-2']);
});

test("a segment's stages are held to its length, weighted, and a passed test counts it tested", () => {
  const s = segmentStatus(200, { done: { TRENCH: 230, BEDDING: 200, LAY_JOINT: 120 } });
  assert.deepEqual([s.done.TRENCH, s.done.LAY_JOINT, s.furthest, s.started], [200, 120, 'BEDDING', true]);
  assert.equal(s.pct, 15 + 5 + 24);
  const tested = segmentStatus(200, { done: { TRENCH: 200, BEDDING: 200, LAY_JOINT: 200 }, tested: true });
  assert.equal(tested.done.TEST, 200);
  // Joints are tested before the trench is filled over them, so a tested pipe shows as tested.
  assert.equal(tested.furthest, 'TEST');
  assert.equal(tested.pct, 75);
  assert.equal(segmentStatus(80, { done: {} }).started, false);
});

test("a zone's pipe sheet: rows by diameter and material, largest first, existing pipes left out", () => {
  const st = (len: number, laid: number) => segmentStatus(len, { done: { TRENCH: len, LAY_JOINT: laid } });
  const t = zoneTable([
    { diameterMm: 110, material: 'HDPE', lengthM: 100, scope: 'PROPOSED', status: st(100, 40) },
    { diameterMm: 160, material: 'HDPE', lengthM: 200, scope: 'PROPOSED', status: st(200, 200) },
    { diameterMm: 110, material: 'HDPE', lengthM: 50, scope: 'PROPOSED', status: st(50, 0) },
    { diameterMm: 300, material: 'CI', lengthM: 500, scope: 'EXISTING', status: st(500, 500) },
  ]);
  assert.deepEqual(t.rows.map((r) => [r.diameterMm, r.pipes, r.scopeM, r.laidM, r.balanceM]), [[160, 1, 200, 200, 0], [110, 2, 150, 40, 110]]);
  assert.deepEqual([t.total.scopeM, t.total.trenchedM, t.total.laidM, t.total.balanceM], [350, 350, 240, 110]);
});

test('pipes ready to start reach the tank or a pipe laid end to end', () => {
  const laid = segmentStatus(100, { done: { TRENCH: 100, LAY_JOINT: 100 } });
  const none = segmentStatus(100, { done: {} });
  const half = segmentStatus(100, { done: { TRENCH: 50 } });
  const seg = (id: string, fromCode: string, toCode: string, status = none, scope: 'PROPOSED' | 'EXISTING' = 'PROPOSED') => ({ id, code: id, fromCode, toCode, scope, status, lengthM: 100 });
  const fronts = workingFronts(
    [seg('P-1', 'T-1', 'J-1', laid), seg('P-2', 'J-1', 'J-2'), seg('P-3', 'J-2', 'J-3'), seg('P-4', 'J-1', 'J-4', half), seg('P-5', 'T-1', 'J-5'), seg('P-6', 'J-1', 'J-6', none, 'EXISTING')],
    [{ code: 'T-1', kind: 'TANK' }],
  );
  // Nothing laid yet: the pipes at the tank are the fronts.
  assert.deepEqual(workingFronts([seg('P-1', 'T-1', 'J-1'), seg('P-2', 'J-1', 'J-2')], [{ code: 'T-1', kind: 'TANK' }]).map((f) => [f.code, f.viaCode]), [['P-1', null]]);
  assert.deepEqual(fronts.map((f) => [f.code, f.fromCode, f.viaCode]), [['P-2', 'J-1', 'P-1'], ['P-5', 'T-1', 'P-1']]);
});

// A main drawn due north from 21°N 78°E: a metre of latitude is 1 / 111195 of a degree on the sphere.
const north = (m: number, east = 0) => `${(78 + east / (111195 * Math.cos((21 * Math.PI) / 180))).toFixed(8)},${(21 + m / 111195).toFixed(8)},0`;
const KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Devgarh RWRM</name>
<Placemark><name><![CDATA[Rising main 300 mm DI K9]]></name><LineString><tessellate>1</tessellate><coordinates>
${north(0)} ${north(700)}
${north(1200)}
</coordinates></LineString></Placemark>
<Placemark><name>SV-1</name><Point><coordinates>${north(300, 10)}</coordinates></Point></Placemark>
<Placemark><name>Intake well</name><Point><coordinates>${north(0, 3)}</coordinates></Point></Placemark>
<Placemark><name>Temple</name><Point><coordinates>${north(600, 100)}</coordinates></Point></Placemark>
</Document></kml>`;

test('a Google Earth main reads as segments by chainage, cut at its named points and every 500 m', () => {
  assert.equal(chainageLabel(1250), '1+250');
  assert.equal(chainageLabel(0), '0+000');
  assert.ok(Math.abs(groundDistanceM([78, 21], [78, 21 + 1000 / 111195]) - 1000) < 0.5);
  const f = parseKml(KML, { diameterMm: 150, material: 'HDPE' });
  assert.deepEqual(
    f.nodes.map((n) => [n.code, n.kind, Math.round(n.chainage!)]),
    [
      ['Intake well', 'SOURCE', 0],
      ['SV-1', 'SLUICE_VALVE', 300],
      ['0+500', 'JUNCTION', 500],
      ['1+000', 'JUNCTION', 1000],
      ['1+200', 'JUNCTION', 1200],
    ],
  );
  assert.deepEqual(f.pipes.map((p) => [p.code, p.from, p.to, Math.round(p.lengthM)]), [
    ['P1', 'Intake well', 'SV-1', 300],
    ['P2', 'SV-1', '0+500', 200],
    ['P3', '0+500', '1+000', 500],
    ['P4', '1+000', '1+200', 200],
  ]);
  assert.ok(Math.abs(f.pipes.reduce((s, p) => s + p.lengthM, 0) - 1200) < 0.5, 'the segments add up to the line');
  assert.ok(f.pipes.every((p) => p.diameterMm === 300 && p.material === 'DI' && p.pipeClass === 'K9'), 'diameter, material and class from the name');
  assert.ok(Math.abs(f.nodes[4].y! - 1200) < 5 && Math.abs(f.nodes[4].x!) < 1, 'placed in metres north of the start');
  assert.equal(f.nodes[0].groundLevel, null, 'Google Earth altitude 0 is no level');
  assert.ok(f.nodes.every((n) => Number.isInteger(n.chainage)), 'a chainage is whole metres, as the import takes it');
  assert.ok(f.notes.some((n) => /1 point was more than 25 m/.test(n)));
  assert.deepEqual(networkProblems(f), []);
});

test('two lines that meet join at one node; a line with no diameter of its own takes the default, a short end is not cut', () => {
  const two = `<kml><Document>
<Placemark><name>Branch A</name><ExtendedData><Data name="Dia (mm)"><value>200</value></Data><Data name="Material"><value>HDPE</value></Data></ExtendedData><LineString><coordinates>${north(0)} ${north(400)}</coordinates></LineString></Placemark>
<Placemark><name>Branch B</name><LineString><coordinates>${north(400)} ${north(400, 300)}</coordinates></LineString></Placemark>
</Document></kml>`;
  const f = parseKml(two, { diameterMm: 110, material: 'PVC', splitM: 250 });
  assert.deepEqual(f.nodes.map((n) => n.code), ['L1-0+000', 'L1-0+250', 'L1-0+400', 'L2-0+300']);
  assert.deepEqual(f.pipes.map((p) => [p.code, p.from, p.to, p.diameterMm, p.material]), [
    ['L1-P1', 'L1-0+000', 'L1-0+250', 200, 'HDPE'],
    ['L1-P2', 'L1-0+250', 'L1-0+400', 200, 'HDPE'],
    ['L2-P1', 'L1-0+400', 'L2-0+300', 110, 'PVC'],
  ]);
  assert.deepEqual(networkProblems(f), []);
  const valves = `<kml><Document><Placemark><name>RM-1</name><LineString><coordinates>${north(0)} ${north(1000)}</coordinates></LineString></Placemark>
${[['AV-01', 200], ['WO 2', 400], ['SC3', 600], ['BFV-1', 700], ['ESR Khordha', 1000]].map(([n, m]) => `<Placemark><name>${n}</name><Point><coordinates>${north(m as number)}</coordinates></Point></Placemark>`).join('')}
</Document></kml>`;
  assert.deepEqual(
    parseKml(valves, { diameterMm: 300, material: 'DI' }).nodes.filter((n) => !/\+/.test(n.code)).map((n) => [n.code, n.kind]),
    [['AV-01', 'AIR_VALVE'], ['WO 2', 'SCOUR'], ['SC3', 'SCOUR'], ['BFV-1', 'SLUICE_VALVE'], ['ESR Khordha', 'TANK']],
    'the short names on site drawings read as their kinds',
  );
  const none = parseKml('<kml><Placemark><name>Tank</name><Point><coordinates>78,21</coordinates></Point></Placemark></kml>', { diameterMm: 110, material: 'PVC' });
  assert.equal(none.pipes.length, 0);
  assert.match(none.notes[0], /no line/);
  assert.ok(networkProblems(none).includes('The file has no pipes'));
});

test("a DPR line can't take a stage past the pipe's length, and says how much is left", () => {
  const p = { code: 'P-27', lengthM: 120 };
  assert.equal(segmentCapProblem(p, 'LAY_JOINT', 80, 40, 2), null);
  assert.equal(segmentCapProblem(p, 'LAY_JOINT', 80, 50, 2), 'Line 2: P-27 is 120 m long and 80 m is already laid and jointed; at most 40 m is left');
  assert.match(segmentCapProblem(p, 'TRENCH', 0, 130, 1)!, /^Line 1: P-27 is 120 m long/);
});

test("a DPR's pipeline summary: metres per stage by zone and diameter, and valves fixed", () => {
  const rows = pipelineSummary([
    { pipeStage: 'LAY_JOINT', segmentDiameterMm: 110, componentName: 'Distribution', subComponentName: 'Zone 2', quantity: '84' },
    { pipeStage: 'LAY_JOINT', segmentDiameterMm: 110, componentName: 'Distribution', subComponentName: 'Zone 2', quantity: '36' },
    { pipeStage: 'BACKFILL', segmentDiameterMm: 160, componentName: 'Distribution', subComponentName: 'Zone 2', quantity: '96' },
    { pipeStage: 'VALVES', segmentDiameterMm: null, componentName: 'Distribution', subComponentName: 'Zone 2', quantity: '1', pipeNodeId: 'sv1' },
    { pipeStage: null, segmentDiameterMm: null, componentName: 'Tank', subComponentName: null, quantity: '11.5' },
  ]);
  assert.deepEqual(rows.map((r) => [r.diameterMm, r.metres, r.valves]), [[160, { BACKFILL: 96 }, 0], [110, { LAY_JOINT: 120 }, 0], [0, {}, 1]]);
});

test("an activity's stage comes from its own setting, else its name on a pipe zone or main", () => {
  assert.deepEqual(
    ['Trench excavation', 'Bedding', 'Pipe lowering, laying and jointing', 'Valves, specials and chambers', 'Backfilling and compaction', 'Hydraulic testing', 'Road restoration over the trench', 'Flushing, disinfection and commissioning', 'Thrust blocks and anchors'].map(guessPipeStage),
    ['TRENCH', 'BEDDING', 'LAY_JOINT', 'VALVES', 'BACKFILL', 'TEST', 'RESTORATION', 'COMMISSIONING', null],
  );
  assert.equal(activityPipeStage({ name: 'Trench excavation', elementType: 'OHT' }), null);
  assert.equal(activityPipeStage({ name: 'Trench excavation', elementType: 'PIPE_ZONE' }), 'TRENCH');
  assert.equal(activityPipeStage({ name: 'Anything', pipeStage: 'TEST', elementType: 'GENERAL' }), 'TEST');
  assert.equal(segmentLabel({ code: 'P-27', fromCode: 'J-12', toCode: 'J-13' }), 'P-27, J-12 to J-13');
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${name}\n     ${(e as Error).message}`);
  }
}
console.log(`\n${tests.length - failed} of ${tests.length} passed`);
if (failed) process.exit(1);
