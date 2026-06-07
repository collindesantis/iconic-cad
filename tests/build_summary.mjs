/**
 * Build-summary tests (no FreeCAD, no browser):
 *   1. runs.js is pure + deterministic — a fixed entity set yields stable runs,
 *      tags, owners, and position strings; the documented left→right /
 *      top→bottom rule holds.
 *   2. bay computation derives 14½ / 14½ / 13 from real stud faces (§0).
 *   3. cut-list parity: one panel's card cut-list totals equal the framing the
 *      enumerator emits; the whole-build total equals the sum over instances.
 *   4. cardSVG renders (derived-only, no template) without throwing.
 *
 * Run from repo root: node tests/build_summary.mjs
 */
import { ALL_MODULES, IN_TO_MM } from '../web/js/constants.js';
import { enumerateMembers } from '../web/js/members.js';
import { computeRuns, tagsByEntityId } from '../web/js/runs.js';
import { bayGapsMM, inFrac, designIdFor } from '../web/js/designs.js';
import { cutListGrouped } from '../web/js/bom.js';
import { cardSVG } from '../web/js/render_fab.js';

let passed = 0, failed = 0;
const mod = id => ALL_MODULES.find(m => m.id === id);
const fail = m => { console.error(`  FAIL ${m}`); failed++; };
const ok = m => { passed++; if (process.env.VERBOSE) console.log(`  ok ${m}`); };
const eq = (a, b, label) => { if (a === b) { ok(label); } else fail(`${label}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`); };

const IN48 = 48 * IN_TO_MM;

// ---- fixture: 4 north panels in a row + 2 east panels stacked on the right --
function fixture() {
  const std = mod('wall_4x8_2x6_16oc');
  const win = mod('window_4x8_2x6_36x48');
  const door = mod('door_4x8_2x6_38x83');
  const E = (5.5 + 0.4375) * IN_TO_MM; // exterior depth
  let n = 0;
  const e = (m, dir, x, y, owner) =>
    ({ id: `w${n++}`, kind: 'wall', mod: m, dir, x_mm: x, y_mm: y, ...(owner ? { owner } : {}) });
  return [
    e(std, 'north', 0 * IN48, 0),
    e(win, 'north', 1 * IN48, 0, 'Marcin J.'),
    e(std, 'north', 2 * IN48, 0),
    e(door, 'north', 3 * IN48, 0),
    e(std, 'east', 4 * IN48, 0),          // right wall, top
    e(std, 'east', 4 * IN48, 1 * IN48),   // right wall, below it
  ];
}

// ---- 1. runs: structure, tags, ordering, owners, position strings ----------
{
  const ents = fixture();
  const runs = computeRuns(ents);
  eq(runs.length, 2, 'two runs detected');
  const [A, B] = runs;
  eq(A.letter, 'A', 'top run lettered A');
  eq(A.horiz, true, 'run A is horizontal');
  eq(A.modules.length, 4, 'run A has 4 modules');
  eq(A.modules.map(m => m.tag).join(','), 'A-1,A-2,A-3,A-4', 'run A tags');
  eq(A.modules[0].positionString, '1st from left · Run A', 'A-1 position string');
  eq(A.modules[2].positionString, '3rd from left · Run A', 'A-3 position string');
  eq(A.modules[1].owner, 'Marcin J.', 'A-2 owner carried');
  eq(A.modules[0].owner, null, 'A-1 unclaimed');
  eq(B.letter, 'B', 'right run lettered B');
  eq(B.horiz, false, 'run B is vertical');
  eq(B.modules.length, 2, 'run B has 2 modules');
  eq(B.modules.map(m => m.tag).join(','), 'B-1,B-2', 'run B tags');
  eq(B.modules[0].positionString, '1st from top · Run B', 'B-1 position string (vertical)');
  // design id wiring: standard=W-01, window=W-02, door=W-03
  eq(A.modules[0].designId, 'W-01', 'standard -> W-01');
  eq(A.modules[1].designId, 'W-02', 'window -> W-02');
  eq(A.modules[3].designId, 'W-03', 'door -> W-03');
  // tag lookup keyed by entity id agrees
  const tm = tagsByEntityId(runs);
  eq(tm[ents[1].id].tag, 'A-2', 'tagsByEntityId maps A-2');
  eq(tm[ents[1].id].owner, 'Marcin J.', 'tagsByEntityId carries owner');
}

// ---- 1b. determinism: identical input -> identical tags/positions -----------
{
  const a = computeRuns(fixture());
  const b = computeRuns(fixture());
  const flat = rs => rs.flatMap(r => r.modules.map(m => `${m.tag}|${m.positionString}|${m.designId}`)).join(';');
  eq(flat(a), flat(b), 'computeRuns deterministic');
}

// ---- 2. bay gaps derive 14½ / 14½ / 13 from stud faces ---------------------
{
  const gaps = bayGapsMM(enumerateMembers(mod('wall_4x8_2x6_16oc'))).map(g => inFrac(g / IN_TO_MM));
  eq(gaps.join(' / '), '14½ / 14½ / 13', 'standard panel bays = 14½/14½/13 (computed)');
}

// ---- 3. cut-list parity ----------------------------------------------------
const totalQty = rows => rows.reduce((s, r) => s + r.qty, 0);
const memberCount = m => enumerateMembers(m.mod).reduce((s, x) => s + (x.plies || 1), 0);
{
  // one panel: card cut list (cutListGrouped) totals == enumerated framing
  for (const id of ['wall_4x8_2x6_16oc', 'window_4x8_2x6_36x48', 'door_4x8_2x6_38x83']) {
    const e = { kind: 'wall', mod: mod(id) };
    eq(totalQty(cutListGrouped([e])), memberCount(e), `cut-list total == members for ${id}`);
  }
  // whole build: aggregate total == sum over instances
  const ents = fixture();
  const whole = totalQty(cutListGrouped(ents));
  const summed = ents.reduce((s, e) => s + totalQty(cutListGrouped([e])), 0);
  eq(whole, summed, 'whole-build cut-list total == sum over instances');
}

// ---- 4. cardSVG renders derived-only (no template) -------------------------
{
  try {
    const svg = cardSVG({ kind: 'wall', mod: mod('wall_4x8_2x6_16oc') }, { label: 'A-1', templates: null });
    if (typeof svg === 'string' && svg.includes('<svg') && svg.includes('W-01')) ok('cardSVG renders (derived-only)');
    else fail('cardSVG output missing <svg>/design id');
  } catch (e) { fail(`cardSVG threw: ${e.message}`); }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
