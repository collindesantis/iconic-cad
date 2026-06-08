/**
 * CAD-AUD-013 regression: foundation quantities enter the dollar estimate, and
 * the priced foundation amount matches the displayed foundationEstimate() rows.
 *
 * Run from repo root: node tests/foundation_cost.mjs   (no FreeCAD needed)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { doc } from '../web/js/state.js';
import { invalidateRegion } from '../web/js/region.js';
import { computeTotalCost, foundationEstimate, foundationLineItems } from '../web/js/bom.js';
import { ALL_MODULES } from '../web/js/constants.js';

const pricing = JSON.parse(readFileSync(fileURLToPath(new URL('../web/pricing.json', import.meta.url))));
const catalog = { ...pricing.lumber, ...pricing.hardware, ...pricing.foundation };

let passed = 0, failed = 0;
const fail = m => { console.error(`  FAIL ${m}`); failed++; };
const ok = m => { passed++; if (process.env.VERBOSE) console.log(`  ok ${m}`); };
const near = (a, b) => Math.abs(a - b) < 1e-6;

const wallMod = ALL_MODULES.find(m => m.id === 'wall_4x8_2x6_16oc');
const wall = { kind: 'wall', level: 'L1', dir: 'north', x_mm: 0, y_mm: 0, mod: wallMod };
const foundation = {
  kind: 'foundation', level: 'L1',
  params: { slab_thickness_mm: 152, beam_w_mm: 305, beam_d_mm: 610, skirt_depth_mm: 1219, skirt_thickness_mm: 51 },
};

// base: framing only
doc.entities = [wall];
invalidateRegion();
const base = computeTotalCost(doc.entities, catalog);

// with a generated foundation
doc.entities = [wall, foundation];
invalidateRegion();
const withF = computeTotalCost(doc.entities, catalog);

// 1. foundation contributes a nonzero priced amount
const fe = foundationEstimate(doc.entities);
const items = foundationLineItems(doc.entities);
const priced = items.reduce((s, li) => s + li.qty * catalog[li.material_key].unit_price, 0);
if (priced > 0) ok(`foundation priced at $${priced.toFixed(2)}`); else fail('foundation priced $0');

// 2. total rose by exactly the priced foundation amount
if (withF > base) ok(`total rose ${base.toFixed(2)} -> ${withF.toFixed(2)}`);
else fail(`total did not rise (${base} -> ${withF})`);
if (near(withF - base, priced)) ok('delta equals priced foundation amount');
else fail(`delta ${(withF - base).toFixed(4)} != priced ${priced.toFixed(4)}`);

// 3. line items derive from the same fe rows the BOM displays
if (near(items[0].qty, fe.concrete_m3)) ok('concrete line == displayed m³');
else fail(`concrete line ${items[0].qty} != fe ${fe.concrete_m3}`);
if (near(items[1].qty, fe.eps_sf)) ok('EPS line == displayed sf');
else fail(`EPS line ${items[1].qty} != fe ${fe.eps_sf}`);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
