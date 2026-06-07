// =====================================================
// REGION — PURE build-region computation via grid flood-fill.
//
// Computes the enclosed interior of a level's EXTERIOR walls as an occupancy
// grid. Used for (a) the L2 placement check, (b) the gray standin drawn in 2D
// and 3D, and (c) the "is Story 1 a closed shell?" gate on the floor switcher.
//
// Algorithm:
//   1. Take the level's entities with kind === 'wall' (EXTERIOR walls only).
//      kind === 'iwall' (interior) are NOT barriers — they sit INSIDE the region
//      so L2 walls can frame over them.
//   2. Build an occupancy grid over the walls' bounding extent plus a 1-cell
//      margin ring. Cell = 6" (a divisor of the 48" module / 12" foot grid). A
//      cell is marked WALL if ANY exterior-wall footprint overlaps it
//      (getModuleBBox + x_mm/y_mm). Any-overlap marking guarantees a clean
//      rectangular shell never leaks at corners: OSE has no corner module —
//      corners are two perpendicular runs meeting — so adjacent perpendicular
//      footprints register as one continuous barrier.
//   3. Flood-fill OUTSIDE→in from the margin ring across non-WALL cells
//      (4-connectivity). The margin ring is EMPTY by construction.
//   4. Region (the gray standin) = the FILLED SILHOUETTE = every cell NOT reached
//      by the flood = WALL cells + the enclosed interior. So L2 walls may be
//      placed on top of L1 walls OR anywhere inside, but never overhanging. The
//      GATE flag isEnclosed is driven separately by the enclosed-interior area
//      (an open shell floods the interior → zero enclosed cells → not enclosed).
//
// A rectangular shell yields a filled rectangle; an L-shape yields a filled L
// (NOT its bounding box); an open/incomplete shell lets the flood leak inside,
// leaving zero enclosed cells → isEnclosed === false.
//
// computeRegion() is PURE over an explicit entity list → unit-testable.
// regionForLevel() is the thin doc-reading wrapper with a cache that
// markModelChanged() invalidates (see app.js).
// =====================================================
import { doc } from './state.js';
import { getModuleBBox } from './geometry.js';
import { IN_TO_MM } from './constants.js';

// Cell size: 3" — a divisor of the 48" module / 12" foot grid. Chosen so a
// ~150mm (5.9") wall footprint always spans ≥2 cells: that keeps every wall band
// a continuous ≥2-cell barrier (no straight-run leaks, no 4-connectivity slivers
// where perpendicular runs meet a notch) AND keeps the any-overlap over-mark to
// ≤1 small cell, which the exact-footprint fill trim below then removes entirely.
export const REGION_CELL_MM = 3 * IN_TO_MM;

// Cells of margin around the wall extent. ≥2 so the any-overlap over-mark (≤1
// cell) can never reach the border seed ring → the outside flood always reaches
// every exterior cell, so no exterior pocket is ever mistaken for region.
const MARGIN_CELLS = 2;

const EMPTY = 0, WALL = 1, FLOOD = 2;

// PURE: entity list -> region descriptor (see file header for the fields).
export function computeRegion(entities, cell_mm = REGION_CELL_MM) {
  const walls = entities.filter(e => e.kind === 'wall'); // exterior only (§1.1)
  if (!walls.length) return emptyRegion();

  // 1. extent over exterior-wall footprints
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const fps = walls.map(e => {
    const bb = getModuleBBox(e.mod, e.dir);
    const r = { x0: e.x_mm, y0: e.y_mm, x1: e.x_mm + bb.w, y1: e.y_mm + bb.h };
    minX = Math.min(minX, r.x0); minY = Math.min(minY, r.y0);
    maxX = Math.max(maxX, r.x1); maxY = Math.max(maxY, r.y1);
    return r;
  });

  // 2. grid with a MARGIN_CELLS-wide ring on every side
  const originX = minX - MARGIN_CELLS * cell_mm, originY = minY - MARGIN_CELLS * cell_mm;
  const cols = Math.ceil((maxX - minX) / cell_mm) + 2 * MARGIN_CELLS + 1; // +margin both sides, +ceil pad
  const rows = Math.ceil((maxY - minY) / cell_mm) + 2 * MARGIN_CELLS + 1;
  const grid = new Uint8Array(cols * rows); // EMPTY
  const at = (cx, cy) => cy * cols + cx;

  // mark WALL by any-overlap with a footprint (leak-proof at corners)
  for (const r of fps) {
    const cx0 = Math.floor((r.x0 - originX) / cell_mm);
    const cx1 = Math.floor((r.x1 - originX) / cell_mm);
    const cy0 = Math.floor((r.y0 - originY) / cell_mm);
    const cy1 = Math.floor((r.y1 - originY) / cell_mm);
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx <= cx1; cx++)
        if (cx >= 0 && cx < cols && cy >= 0 && cy < rows) grid[at(cx, cy)] = WALL;
  }

  // 3. flood from the margin ring (border cells are all EMPTY by construction)
  const stack = [];
  const push = (cx, cy) => {
    if (cx < 0 || cx >= cols || cy < 0 || cy >= rows) return;
    const i = at(cx, cy);
    if (grid[i] === EMPTY) { grid[i] = FLOOD; stack.push(i); }
  };
  for (let cx = 0; cx < cols; cx++) { push(cx, 0); push(cx, rows - 1); }
  for (let cy = 0; cy < rows; cy++) { push(0, cy); push(cols - 1, cy); }
  while (stack.length) {
    const i = stack.pop(); const cx = i % cols, cy = (i / cols) | 0;
    push(cx + 1, cy); push(cx - 1, cy); push(cx, cy + 1); push(cx, cy - 1);
  }

  // 4. The build region is the FILLED SILHOUETTE = every cell NOT reached by the
  //    outside flood = WALL cells + the enclosed interior (EMPTY-after-flood).
  //    This is the gray standin the user frames on: L2 walls may sit on top of
  //    L1 walls (WALL cells) OR anywhere in the interior, but never overhang
  //    (cells outside the shell are FLOOD / off-grid → rejected). The GATE
  //    ("is Story 1 a closed shell?") uses the enclosed-interior area: an open
  //    shell floods the interior, leaving zero enclosed cells → isEnclosed=false.
  let enclosedArea = 0;
  let rminX = Infinity, rminY = Infinity, rmaxX = -Infinity, rmaxY = -Infinity;
  for (let cy = 0; cy < rows; cy++)
    for (let cx = 0; cx < cols; cx++) {
      const s = grid[at(cx, cy)];
      if (s === EMPTY) enclosedArea += cell_mm * cell_mm;
      if (s !== FLOOD) { // silhouette cell (WALL or enclosed interior)
        const wx = originX + cx * cell_mm, wy = originY + cy * cell_mm;
        rminX = Math.min(rminX, wx); rminY = Math.min(rminY, wy);
        rmaxX = Math.max(rmaxX, wx + cell_mm); rmaxY = Math.max(rmaxY, wy + cell_mm);
      }
    }

  const isEnclosed = enclosedArea > 0;
  const bbox_mm = isEnclosed ? { minX: rminX, minY: rminY, maxX: rmaxX, maxY: rmaxY } : null;

  const stateAt = (x, y) => {
    const cx = Math.floor((x - originX) / cell_mm), cy = Math.floor((y - originY) / cell_mm);
    if (cx < 0 || cx >= cols || cy < 0 || cy >= rows) return FLOOD;
    return grid[at(cx, cy)];
  };

  // A point is "in the region" if it is anywhere inside the silhouette (not the
  // outside flood, not off-grid).
  const containsPoint = (x, y) => stateAt(x, y) !== FLOOD;

  // entire footprint inside the silhouette — every cell the bbox covers must be a
  // silhouette cell (WALL or interior). Any cell hitting the outside flood / off
  // the grid means an overhang → outside (§5).
  const containsFootprint = (mod, dir, x, y) => {
    const bb = getModuleBBox(mod, dir);
    const cx0 = Math.floor((x - originX) / cell_mm), cx1 = Math.floor((x + bb.w - originX) / cell_mm);
    const cy0 = Math.floor((y - originY) / cell_mm), cy1 = Math.floor((y + bb.h - originY) / cell_mm);
    for (let cy = cy0; cy <= cy1; cy++)
      for (let cx = cx0; cx <= cx1; cx++) {
        if (cx < 0 || cx >= cols || cy < 0 || cy >= rows) return false;
        if (grid[at(cx, cy)] === FLOOD) return false;
      }
    return true;
  };

  // FILL MASK for rendering: the enclosed interior plus the EXACT wall band. A
  // WALL cell counts only if its CENTER lies inside a real wall footprint — this
  // trims the any-overlap over-mark (the ≤1-cell fuzz beyond the wall faces) so
  // the gray silhouette stops exactly at the wall ghosts, with no protruding
  // strip. (FLOOD cells and off-footprint WALL fuzz are excluded.)
  const centerInFootprint = (x, y) => {
    for (const r of fps) if (x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1) return true;
    return false;
  };
  const isEmpty = (cx, cy) => cx >= 0 && cx < cols && cy >= 0 && cy < rows && grid[at(cx, cy)] === EMPTY;
  const isFill = (cx, cy) => {
    const s = grid[at(cx, cy)];
    if (s === EMPTY) return true; // enclosed interior
    if (s !== WALL) return false; // FLOOD
    // real wall band: center inside an actual footprint…
    if (centerInFootprint(originX + (cx + 0.5) * cell_mm, originY + (cy + 0.5) * cell_mm)) return true;
    // …or an inner-edge wall cell touching the interior, so the fill leaves no
    // gap between the gray interior and the wall band. (Outer over-mark cells
    // border only WALL/FLOOD, never EMPTY, so they stay excluded.)
    return isEmpty(cx - 1, cy) || isEmpty(cx + 1, cy) || isEmpty(cx, cy - 1) || isEmpty(cx, cy + 1);
  };

  // merged per-row rectangles of the fill cells — cheap fill for 2D/3D.
  const rects = [];
  for (let cy = 0; cy < rows; cy++) {
    let runStart = -1;
    for (let cx = 0; cx <= cols; cx++) {
      const fill = cx < cols && isFill(cx, cy);
      if (fill && runStart < 0) runStart = cx;
      else if (!fill && runStart >= 0) {
        rects.push({
          x_mm: originX + runStart * cell_mm, y_mm: originY + cy * cell_mm,
          w_mm: (cx - runStart) * cell_mm, h_mm: cell_mm,
        });
        runStart = -1;
      }
    }
  }

  return {
    cells: { cols, rows, cell_mm, originX, originY, data: grid },
    bbox_mm, area_mm2: enclosedArea, isEnclosed, containsPoint, containsFootprint, rects,
  };
}

function emptyRegion() {
  return {
    cells: null, bbox_mm: null, area_mm2: 0, isEnclosed: false,
    containsPoint: () => false, containsFootprint: () => false, rects: [],
  };
}

// ---- doc-reading wrapper + cache -----------------------------------------
// The region only changes when the level's walls change; while on L2 the L1
// walls are non-interactive, so the cache holds. markModelChanged() clears it.
let _cache = {};
export function invalidateRegion() { _cache = {}; }
export function regionForLevel(levelId) {
  if (_cache[levelId]) return _cache[levelId];
  const ents = doc.entities.filter(e => e.level === levelId);
  return (_cache[levelId] = computeRegion(ents));
}
