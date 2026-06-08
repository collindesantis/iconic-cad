// =====================================================
// TRADES — the build flow over the left trade rail + the bottom-center NEXT
// TRADE gate. Fixed order: FRAMING → FOUNDATION → 3D PREVIEW.
//
// Per-trade "done"-ness is DERIVED from the model every time (never stored), so
// it is robust on load and after any edit:
//   framing    = every level that has exterior walls is enclosed (region gate).
//   foundation = a foundation entity exists (GO was pressed).
//   3d preview = terminal; reachable once foundation is done, no further gate.
//
// Going BACK to a done trade is free (view only). Framing stays editable; the
// FIRST framing edit while a foundation exists INVALIDATES downstream — the
// foundation is derived, so invalidation = delete + regenerate later
// (notifyFramingEdited). ui.activeTrade records only WHERE the user is.
// =====================================================
import { doc, ui } from './state.js';
import { regionForLevel } from './region.js';
import { switchTab } from './ui.js';
import { setRenderMode } from './render3d.js';
import { openFoundationModal } from './foundation.js';

export const TRADES = ['framing', 'foundation', '3d'];

const RAIL_ID = { framing: 'btn-tab-framing', foundation: 'btn-tab-foundation', '3d': 'btn-tab-3d' };
const NEXT_HINT = {
  framing:    'Finish a true silhouette for each story before continuing.',
  foundation: 'Generate the foundation to continue.',
  '3d':       'Final step — view your whole build.',
};

// ---- Derived done-conditions ---------------------------------------------
export function framingDone() {
  // Every level that contains EXTERIOR walls must be a closed shell. Two-story
  // requires both L1 and L2; single-story is L1 only. No walls anywhere = not done.
  const levels = [...new Set(doc.entities.filter(e => e.kind === 'wall').map(e => e.level || 'L1'))];
  if (!levels.length) return false;
  return levels.every(l => regionForLevel(l).isEnclosed);
}
export function foundationDone() {
  return doc.entities.some(e => e.kind === 'foundation');
}
export function tradeDone(trade) {
  if (trade === 'framing')    return framingDone();
  if (trade === 'foundation') return foundationDone();
  return true; // 3d preview is terminal — no gate
}

// ---- View per trade -------------------------------------------------------
// framing → 2D build grid (solid preview). foundation → 3D REVIEW (framing
// transparent, foundation solid). 3d → 3D all solid.
function applyTradeView(trade) {
  if (trade === 'framing') {
    switchTab('2d');
    setRenderMode('solid');
  } else if (trade === 'foundation') {
    switchTab('3d');
    setRenderMode('foundation-review');
  } else {
    switchTab('3d');
    setRenderMode('solid');
  }
}

export function setActiveTrade(trade) {
  ui.activeTrade = trade;
  applyTradeView(trade);
  refreshTradeUI();
  // Entering the foundation trade for the first time (not yet generated) opens
  // the autogen popup. Re-visiting a generated foundation just shows the review.
  if (trade === 'foundation' && !foundationDone()) openFoundationModal();
}

// ---- Rail + NEXT TRADE rendering -----------------------------------------
export function refreshTradeUI() {
  const ai = TRADES.indexOf(ui.activeTrade);

  TRADES.forEach((t, i) => {
    const btn = document.getElementById(RAIL_ID[t]);
    if (!btn) return;
    btn.classList.remove('trade-current', 'trade-done', 'trade-locked');
    if (i === ai)      btn.classList.add('trade-current'); // active highlight
    else if (i < ai)   btn.classList.add('trade-done');    // behind — blue, view it
    else               btn.classList.add('trade-locked');  // ahead — gray, gated
  });

  const wrap = document.getElementById('next-trade-wrap');
  const btn  = document.getElementById('btn-next-trade');
  const hint = document.getElementById('next-trade-hint');
  if (!wrap || !btn || !hint) return;
  const terminal = ui.activeTrade === '3d';
  wrap.classList.toggle('terminal', terminal);
  hint.textContent = NEXT_HINT[ui.activeTrade];
  if (terminal) {
    btn.style.display = 'none'; // terminal trade — hide NEXT TRADE
  } else {
    btn.style.display = '';
    const ready = tradeDone(ui.activeTrade);
    btn.classList.toggle('ready', ready); // green when done, gray otherwise
    btn.disabled = !ready;
  }
}

// ---- Flashes --------------------------------------------------------------
let _lockedTimer = null;
function flashLocked() {
  const el = document.getElementById('trade-locked-hint');
  if (!el) return;
  el.classList.add('show');
  clearTimeout(_lockedTimer);
  _lockedTimer = setTimeout(() => el.classList.remove('show'), 1600);
}

let _toastTimer = null;
function flashToast(msg) {
  const el = document.getElementById('trade-toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ---- Foundation invalidation on framing edit ------------------------------
function clearFoundation() {
  for (let i = doc.entities.length - 1; i >= 0; i--) {
    if (doc.entities[i].kind === 'foundation') doc.entities.splice(i, 1);
  }
}

// Call from every framing-mutating handler (place/erase/clear/undo/redo) BEFORE
// markModelChanged. If a foundation exists it is downstream of the silhouette →
// delete it, drop back to framing, and notify. No-op when no foundation exists.
export function notifyFramingEdited() {
  if (!foundationDone()) return;
  clearFoundation();
  flashToast('Foundation cleared — regenerate it after editing framing.');
  setActiveTrade('framing');
}

// ---- Wiring ---------------------------------------------------------------
function onRailClick(trade) {
  const ai = TRADES.indexOf(ui.activeTrade);
  const ti = TRADES.indexOf(trade);
  if (ti > ai) { flashLocked(); return; } // locked — a trade ahead
  setActiveTrade(trade);                   // current, or done (behind) → view it
}

function onNext() {
  const ai = TRADES.indexOf(ui.activeTrade);
  if (ai >= TRADES.length - 1) return;
  if (!tradeDone(ui.activeTrade)) return;  // gray/disabled anyway
  setActiveTrade(TRADES[ai + 1]);
}

export function initTrades() {
  TRADES.forEach(t => {
    document.getElementById(RAIL_ID[t])?.addEventListener('click', () => onRailClick(t));
  });
  document.getElementById('btn-next-trade')?.addEventListener('click', onNext);

  // GO in the foundation popup wrote the entity → enter review + re-gate.
  window.addEventListener('iconic:foundation', () => {
    setRenderMode('foundation-review');
    refreshTradeUI();
  });

  // Model changed (place/erase/load) → the framing gate may have flipped.
  window.addEventListener('iconic:model', refreshTradeUI);

  // New design / Options GO / successful load → start at framing.
  window.addEventListener('iconic:project', () => setActiveTrade('framing'));
  window.addEventListener('iconic:loaded',  () => setActiveTrade('framing'));

  refreshTradeUI();
}
