/**
 * CAD-AUD-008 regression: exports are gated/labeled by scope. A full-house FCStd
 * with no foundation is NOT export-ready (the UI warns); framing-only fab/summary
 * exports are allowed but carry a FRAMING-ONLY label + shell warning.
 *
 * Run from repo root: node tests/export_gate.mjs   (no FreeCAD needed)
 */
import { doc, ui } from '../web/js/state.js';
import { invalidateRegion } from '../web/js/region.js';
import { houseExportReady, shellEnclosed } from '../web/js/export_gate.js';
import { framingPackBanner, buildBookHTML } from '../web/js/render_fab.js';
import { ALL_MODULES } from '../web/js/constants.js';

let passed = 0, failed = 0;
const fail = m => { console.error(`  FAIL ${m}`); failed++; };
const ok = m => { passed++; if (process.env.VERBOSE) console.log(`  ok ${m}`); };

const wallMod = ALL_MODULES.find(m => m.id === 'wall_4x8_2x6_16oc');
const wall = { kind: 'wall', level: 'L1', dir: 'north', x_mm: 0, y_mm: 0, mod: wallMod };
const foundation = { kind: 'foundation', level: 'L1', params: {} };

// 1. framing placed, no foundation, frontier still at framing → house NOT ready
doc.project.stories = 1;
doc.entities = [wall];
ui.reachedTrade = 0;
invalidateRegion();
if (houseExportReady() === false) ok('FCStd not ready without foundation (UI warns)');
else fail('houseExportReady true with no foundation');

// 2. foundation generated + advanced past framing → house ready
doc.entities = [wall, foundation];
ui.reachedTrade = 1;
invalidateRegion();
if (houseExportReady() === true) ok('FCStd ready with foundation + frontier');
else fail('houseExportReady false despite foundation + frontier');

// 3. framing-only pack is allowed and labeled FRAMING-ONLY in the output
const banner = framingPackBanner();
if (banner.label === 'FRAMING-ONLY PACK') ok('framing pack labeled'); else fail(`label = ${banner.label}`);
const html = buildBookHTML([], 'Iconic CAD — Fab Drawings', banner);
if (html.includes('FRAMING-ONLY PACK')) ok('label rendered in book HTML'); else fail('label missing from HTML');

// 4. open shell (one wall) → banner carries a warning
if (shellEnclosed() === false && banner.warn) ok('open shell warned'); else fail(`open shell warn missing (warn="${banner.warn}")`);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
