/**
 * CAD-AUD-012 regression: FCStd export imports JSZip from a vendored local file,
 * not a CDN, so offline export works.
 *
 * Run from repo root: node tests/fcstd_local_jszip.mjs   (no FreeCAD needed)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let passed = 0, failed = 0;
const fail = m => { console.error(`  FAIL ${m}`); failed++; };
const ok = m => { passed++; if (process.env.VERBOSE) console.log(`  ok ${m}`); };

const src = readFileSync(fileURLToPath(new URL('../web/js/fcstd.js', import.meta.url)), 'utf8');

if (!/cdn\.jsdelivr\.net/.test(src)) ok('no cdn.jsdelivr.net import'); else fail('still imports from cdn.jsdelivr.net');
if (/import\(['"]\.\.\/vendor\/jszip[^'"]*['"]\)/.test(src)) ok('imports local ../vendor/jszip'); else fail('does not import local vendored jszip');

// the vendored module must load headless and expose a constructable default
const { default: JSZip } = await import('../web/vendor/jszip.min.mjs');
if (typeof JSZip === 'function') ok('vendored JSZip default is constructable'); else fail(`vendored default is ${typeof JSZip}`);
try { const z = new JSZip(); z.file('a.txt', 'hi'); ok('JSZip instantiates + .file works'); }
catch (e) { fail(`JSZip unusable: ${e.message}`); }

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
