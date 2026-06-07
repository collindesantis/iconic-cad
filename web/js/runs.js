// =====================================================
// RUNS — deterministic run detection over placed wall modules.
//
// A run is a maximal set of collinear, contiguous wall modules sharing one
// axis: north/south walls span X at a fixed Y (horizontal runs); east/west
// walls span Y at a fixed X (vertical runs). Modules adjacent end-to-end
// (within TOL) along that axis belong to the same run.
//
// Pure + DOM-free: imports only geometry + the design registry, so it is
// unit-testable — a fixed entity set yields stable runs, tags, and position
// strings. Consumed identically by the fab card, page 1 (by run), and page 2
// (map) so the three never disagree.
// =====================================================
import { isHorizontal, getModuleBBox } from './geometry.js';
import { designFor } from './designs.js';

const TOL = 2;    // mm — end-to-end contiguity gap tolerance (modules snap exact)
const BAND = 60;  // mm — same-line cross-axis clustering tolerance

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function makeRun(line, chain) {
  // chain is pre-sorted along the run axis = increasing world X (horizontal) /
  // increasing world Y (vertical).
  const modules = chain.map(ft => {
    const d = designFor(ft.e.mod);
    return { entity: ft.e, designId: d.design_id, archetype: d.archetype, owner: ft.e.owner || null };
  });
  return {
    horiz: line.horiz,
    axis: line.horiz ? 'H' : 'V',
    cross: line.cross,
    modules,
    minX: Math.min(...chain.map(c => c.x0)),
    minY: Math.min(...chain.map(c => c.y0)),
  };
}

// Detect the runs within a single level's feature list: cluster into collinear
// lines, then split each line into contiguous chains. Returns UNLETTERED runs
// already sorted top-to-bottom (minY), ties left-to-right (minX).
function detectRunsForLevel(feats) {
  // 1. cluster features into collinear lines (same orientation + cross band)
  const lines = [];
  for (const ft of feats) {
    let line = lines.find(L => L.horiz === ft.horiz && Math.abs(L.cross - ft.cross) <= BAND);
    if (!line) { line = { horiz: ft.horiz, cross: ft.cross, items: [] }; lines.push(line); }
    line.items.push(ft);
  }

  // 2. within each line, sort along the axis and split into contiguous chains
  const runs = [];
  for (const L of lines) {
    L.items.sort((a, b) => a.a0 - b.a0);
    let chain = [], end = null;
    for (const ft of L.items) {
      if (chain.length && ft.a0 - end > TOL) { runs.push(makeRun(L, chain)); chain = []; }
      chain.push(ft);
      end = end === null ? ft.a1 : Math.max(end, ft.a1);
    }
    if (chain.length) runs.push(makeRun(L, chain));
  }

  // 3. deterministic order within the level: top-to-bottom (minY), ties left-
  //    to-right (minX).
  runs.sort((a, b) => a.minY - b.minY || a.minX - b.minX);
  return runs;
}

// entities -> ordered, lettered runs with tagged modules.
// Multi-level: entities are partitioned by `level` and processed in ascending
// level order (L1, then L2, …). Lettering runs CONTINUOUSLY across levels with
// a running index that does NOT reset — L1 → A,B,C; L2 → D,E,F… — so the letters
// are globally unique (no level prefix). Entities without an explicit level fall
// back to 'L1', so single-level callers are unaffected.
export function computeRuns(entities) {
  const walls = entities.filter(e => e.kind === 'wall' || e.kind === 'iwall');
  const levelOf = e => e.level || 'L1';
  const levelIds = [...new Set(walls.map(levelOf))].sort((a, b) => a.localeCompare(b));

  const runs = [];
  for (const lvl of levelIds) {
    const feats = walls.filter(e => levelOf(e) === lvl).map(e => {
      const bb = getModuleBBox(e.mod, e.dir);
      const horiz = isHorizontal(e.dir);
      const x0 = e.x_mm, y0 = e.y_mm, x1 = x0 + bb.w, y1 = y0 + bb.h;
      return {
        e, horiz, x0, y0, x1, y1,
        cross: horiz ? y0 : x0,           // the fixed coordinate of the wall line
        a0: horiz ? x0 : y0,              // start along the run axis
        a1: horiz ? x1 : y1,             // end along the run axis
      };
    });
    const lvlRuns = detectRunsForLevel(feats);
    for (const r of lvlRuns) r.level = lvl;
    runs.push(...lvlRuns);
  }

  // CONTINUOUS LETTERING across levels — running index never resets.
  runs.forEach((r, i) => { r.letter = String.fromCharCode(65 + i); });

  // tag + position string per module (module order = world X for horizontal
  // runs, world Y for vertical — already sorted in detectRunsForLevel).
  for (const r of runs) {
    r.modules.forEach((m, i) => {
      m.tag = `${r.letter}-${i + 1}`;
      m.positionString = `${ordinal(i + 1)} from ${r.horiz ? 'left' : 'top'} · Run ${r.letter}`;
    });
  }
  return runs;
}

// Flat tag lookup keyed by entity id — used by the map page so each footprint
// shows the same tag the run pages assigned.
export function tagsByEntityId(runs) {
  const out = {};
  for (const r of runs) for (const m of r.modules) out[m.entity.id] = { tag: m.tag, owner: m.owner };
  return out;
}
