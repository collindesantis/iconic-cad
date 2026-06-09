/**
 * CAD-AUD-009 regression: the BREP-verify step is wired into CI (so pre-baked
 * FreeCAD assets can't silently drift from the generator), and members.js no
 * longer falsely claims FreeCAD export is built from enumerateMembers().
 *
 * Run from repo root: node tests/ci_verify_gate.mjs   (no FreeCAD needed)
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let passed = 0, failed = 0;
const fail = m => { console.error(`  FAIL ${m}`); failed++; };
const ok = m => { passed++; if (process.env.VERBOSE) console.log(`  ok ${m}`); };
const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const VERIFY = /build_lib\.py --verify --no-thumbs/;

// GitHub: the verify gate may live in ANY workflow file (it was split into a
// path-filtered geometry-verify.yml job). Assert it exists somewhere.
const ghDir = fileURLToPath(new URL('../.github/workflows/', import.meta.url));
const ghHasVerify = readdirSync(ghDir).some(f => VERIFY.test(readFileSync(ghDir + f, 'utf8')));
if (ghHasVerify) ok('a GitHub workflow runs build_lib --verify --no-thumbs');
else fail('no GitHub workflow runs the build_lib --verify gate');

// GitLab: single config file.
if (VERIFY.test(read('../.gitlab-ci.yml'))) ok('.gitlab-ci.yml runs build_lib --verify --no-thumbs');
else fail('.gitlab-ci.yml missing build_lib --verify gate');

const members = read('../web/js/members.js');
// the corrected comment must state the real architecture (BREP translation)…
if (/pre-baked BREP/i.test(members)) ok('members.js documents pre-baked BREP architecture');
else fail('members.js does not document the BREP-translation reality');
// …and must NOT keep the old false "consumed by ... the FreeCAD export" claim.
if (/consumed by[\s\S]{0,80}FreeCAD\s*\n?\s*\/\/\s*export/i.test(members))
  fail('members.js still claims FreeCAD export consumes enumerateMembers()');
else ok('members.js drops the false FreeCAD-consumes-members claim');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
