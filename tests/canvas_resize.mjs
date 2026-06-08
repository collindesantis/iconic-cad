/**
 * CAD-AUD-014 regression: resizeCanvas() is a no-op while #canvas-wrap is hidden
 * (zero size), so a window resize during Foundation/3D can't zero the framing
 * canvas; and once the wrapper is visible again it sizes + draws.
 *
 * Manual repro (not automatable in this harness): enter Foundation, resize the
 * viewport while the 2D canvas is hidden, click Framing — the review must show
 * the modules, not a blank grid.
 *
 * Run from repo root: node tests/canvas_resize.mjs   (no FreeCAD needed)
 */

// --- minimal DOM stub so render2d.js imports + runs headless ---
let drawCalls = 0;
const ctx = new Proxy({}, {
  get: (_t, k) => {
    if (k === 'createLinearGradient' || k === 'createPattern' || k === 'createRadialGradient')
      return () => ({ addColorStop() {} });
    // count actual draw work as a signal that draw2d() ran
    return () => { drawCalls++; };
  },
  set: () => true,
});
const canvas = { width: 0, height: 0, getContext: () => ctx,
  addEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
const wrap = { clientWidth: 0, clientHeight: 0, style: {} };
const generic = () => new Proxy({ style: {}, classList: { toggle() {}, add() {}, remove() {} },
  addEventListener() {}, getContext: () => ctx, dataset: {} }, { get: (t, k) => (k in t ? t[k] : () => {}) });

globalThis.document = {
  getElementById: id => id === 'design-canvas' ? canvas : id === 'canvas-wrap' ? wrap : generic(),
  createElement: () => generic(),
};
globalThis.window = { addEventListener() {}, devicePixelRatio: 1 };
globalThis.requestAnimationFrame = () => 0;

const { resizeCanvas } = await import('../web/js/render2d.js');

let passed = 0, failed = 0;
const fail = m => { console.error(`  FAIL ${m}`); failed++; };
const ok = m => { passed++; if (process.env.VERBOSE) console.log(`  ok ${m}`); };

// 1. hidden wrapper (zero size): resize is skipped, canvas stays unsized
wrap.clientWidth = 0; wrap.clientHeight = 0;
canvas.width = 1280; canvas.height = 720; // a previously good size
drawCalls = 0;
const r1 = resizeCanvas();
if (r1 === false) ok('hidden resize returns false'); else fail(`hidden resize returned ${r1}`);
if (canvas.width === 1280) ok('hidden resize did not zero canvas'); else fail(`canvas zeroed to ${canvas.width}`);
if (drawCalls === 0) ok('hidden resize did not draw'); else fail(`drew while hidden (${drawCalls})`);

// 2. visible wrapper: resize sizes the canvas and draws
wrap.clientWidth = 900; wrap.clientHeight = 600;
canvas.width = 0; canvas.height = 0; // as if a prior hidden resize had zeroed it
drawCalls = 0;
const r2 = resizeCanvas();
if (r2 === true) ok('visible resize returns true'); else fail(`visible resize returned ${r2}`);
if (canvas.width === 900 && canvas.height === 600) ok('canvas sized 900x600'); else fail(`canvas ${canvas.width}x${canvas.height}`);
if (drawCalls > 0) ok('visible resize drew'); else fail('visible resize did not draw');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
