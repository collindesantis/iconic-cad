// =====================================================
// FOUNDATION GEOM — PURE shared foundation derivation.
//
// No THREE, no DOM, no doc globals. The single source of truth for foundation
// geometry, consumed by BOTH the 3D preview (render3d.js) and the FreeCAD
// exporter (fcstd.js). The terminal compiler mirrors this exactly in Python
// (foundation_lib.py), kept honest by the golden parity test
// (tests/foundation_parity.mjs).
//
// foundationSolids(params, silhouette) -> [ piece, … ]
//   params     = { slab_thickness_mm, beam_w_mm, beam_d_mm,
//                  skirt_depth_mm, skirt_thickness_mm }
//   silhouette = { rects, walls, containsPoint, cell_mm? }
//     rects   — the L1 filled-silhouette per-ROW strips (region.rects). Greedy-
//               merged here into MAXIMAL rectangles → the monolithic slab.
//     walls   — L1 kind:'wall' entities { id, x_mm, y_mm, mod, dir }. Grouped
//               into RUNS (a run = one full exterior side); each run gets ONE
//               grade beam + ONE continuous frost skirt.
//     containsPoint(x,y) — region probe used to find each run's OUTSIDE face.
//
//   piece = { group:'foundation', kind:'slab'|'beam'|'skirt', label,
//             dims:{dx_mm,dy_mm,dz_mm}, center:{x_mm,y_mm,z_mm} }
//
// Pieces:
//   slab_NN   — monolithic poured slab. The silhouette covered by the minimal
//               set of maximal rectangles (rectangle house → 1; L → 2–3). NOT a
//               bbox, NOT per-row strips.
//   beam_<L>  — one grade beam per run <L>, spanning the run's full length PLUS
//               per-end extensions that close the perimeter ring at corners.
//               Top at BEAM_TOP_Z (5 mm below the slab–grade datum z=0).
//   skirt_<L> — one continuous frost skirt per run on its OUTSIDE face,
//               1" (25.4 mm) outside the beam's outer face. Derived from the
//               beam geometry; corner-extended so the FPSF loop is gapless.
//
// World plan mm; z-DOWN convention: the top of the slab is the ground datum
// z=0, so every piece extrudes downward and its center z is negative (matches
// render3d's scene). Consumers apply their own origin offset / Y-mirror.
// =====================================================
import { getModuleBBox, isHorizontal } from './geometry.js';

const MERGE_TOL = 1e-6; // mm — strip x/w/edge equality (both sides exact arithmetic)
const RUN_TOL = 2;      // mm — end-to-end contiguity gap along a run
const RUN_BAND = 60;    // mm — same-line cross-axis clustering (mirrors runs.js)

// Beam top is 5 mm below the slab-top datum (z=0). This prevents z-fighting
// between the slab's bottom face and the beam's top face in the 3D preview.
const BEAM_TOP_Z = -5;

// Gap between the beam's outer face and the skirt's inner face (= 1 inch).
const SKIRT_INSET_MM = 25.4;

// SLAB — greedy-merge the per-row fill strips into MAXIMAL rectangles.
// region.rects are 1-cell-tall (~3") strips, sorted row-by-row (ascending y),
// within a row ascending x. Merge a strip into an open rect when they share
// x_mm + w_mm and the open rect's bottom edge meets the strip's top edge — i.e.
// stack vertically-adjacent equal-width strips into one taller box. A gap (or a
// width change) starts a fresh rect. Result: the minimal rectangle set covering
// the silhouette. Rectangle house → 1 box; L → 2–3.
function mergeSlabRects(rects) {
  const open = [];
  for (const s of rects) {
    let host = null;
    for (const o of open) {
      if (Math.abs(o.x_mm - s.x_mm) < MERGE_TOL &&
          Math.abs(o.w_mm - s.w_mm) < MERGE_TOL &&
          Math.abs((o.y_mm + o.h_mm) - s.y_mm) < MERGE_TOL) { host = o; break; }
    }
    if (host) host.h_mm += s.h_mm;
    else open.push({ x_mm: s.x_mm, y_mm: s.y_mm, w_mm: s.w_mm, h_mm: s.h_mm });
  }
  return open;
}

// RUNS — group the exterior walls into runs (one run = one full side), the same
// way runs.js detectRunsForLevel does but geometry-only (no design registry):
// cluster collinear walls (same orientation + cross band), split each cluster
// into end-to-end contiguous chains, then order top-to-bottom (near cross),
// ties left-to-right, and letter A,B,C… by that order. Foundation is single-
// level (L1), so the letters match computeRuns' L1 letters.
//
// Each run carries: horiz, letter, nearCross (the wall line's near edge), depth
// (perpendicular footprint dim), aMin/aMax (along-axis extent of the chain).
export function computeFoundationRuns(walls) {
  const feats = walls.map(w => {
    const bb = getModuleBBox(w.mod, w.dir);
    const horiz = isHorizontal(w.dir);
    const x0 = w.x_mm, y0 = w.y_mm, x1 = x0 + bb.w, y1 = y0 + bb.h;
    return {
      horiz,
      depth: horiz ? bb.h : bb.w,          // perpendicular footprint dim
      cross: horiz ? y0 : x0,              // near edge of the wall line
      a0: horiz ? x0 : y0,                 // start along the run axis
      a1: horiz ? x1 : y1,                 // end along the run axis
    };
  });

  // 1. cluster into collinear lines (same orientation + cross band)
  const lines = [];
  for (const ft of feats) {
    let line = lines.find(L => L.horiz === ft.horiz && Math.abs(L.cross - ft.cross) <= RUN_BAND);
    if (!line) { line = { horiz: ft.horiz, cross: ft.cross, items: [] }; lines.push(line); }
    line.items.push(ft);
  }

  // 2. within each line, sort along the axis and split into contiguous chains
  const runs = [];
  for (const L of lines) {
    L.items.sort((a, b) => a.a0 - b.a0);
    let chain = [], end = null;
    const flush = () => {
      if (!chain.length) return;
      runs.push({
        horiz: L.horiz,
        nearCross: Math.min(...chain.map(c => c.cross)),
        depth: chain[0].depth,
        aMin: Math.min(...chain.map(c => c.a0)),
        aMax: Math.max(...chain.map(c => c.a1)),
      });
      chain = [];
    };
    for (const ft of L.items) {
      if (chain.length && ft.a0 - end > RUN_TOL) flush();
      chain.push(ft);
      end = end === null ? ft.a1 : Math.max(end, ft.a1);
    }
    flush();
  }

  // 3. deterministic order: top-to-bottom (footprint minY), ties left-to-right
  //    (minX) — same key as runs.js — then letter A,B,C… by that order (matches
  //    computeRuns for L1). minX/minY = the chain's footprint corner.
  const minX = r => (r.horiz ? r.aMin : r.nearCross);
  const minY = r => (r.horiz ? r.nearCross : r.aMin);
  runs.sort((a, b) => minY(a) - minY(b) || minX(a) - minX(b));
  runs.forEach((r, i) => { r.letter = String.fromCharCode(65 + i); });
  return runs;
}

// Classify one end of run r: return { submissive, perpRun } where perpRun is
// the perpendicular dominant run that butts r at aEndVal (submissive = true),
// or null if r reaches the building corner there (dominant, submissive = false).
//
// SUBMISSIVE: perp run P satisfies BOTH
//   (a) r's cross band [r.nearCross, r.nearCross+r.depth] ⊆ [P.aMin, P.aMax]
//       (P's wall line crosses r's line — P spans r's full depth)
//   (b) P's cross band [P.nearCross, P.nearCross+P.depth] contains aEndVal
//       (P's footprint sits at r's end — r terminates at P's inner face)
// DOMINANT: no such P → r reaches the building corner; the submissive run's beam
//   and skirt bridge the corner from the other direction.
export function classifyEnd(r, aEndVal, allRuns) {
  for (const p of allRuns) {
    if (p.horiz === r.horiz) continue;
    if (p.aMin > r.nearCross + RUN_TOL) continue;
    if (r.nearCross + r.depth > p.aMax + RUN_TOL) continue;
    if (p.nearCross - RUN_TOL > aEndVal) continue;
    if (aEndVal > p.nearCross + p.depth + RUN_TOL) continue;
    return { submissive: true, perpRun: p };
  }
  return { submissive: false, perpRun: null };
}

export function foundationSolids(params, silhouette) {
  const slabT  = params.slab_thickness_mm;
  const beamW  = params.beam_w_mm;
  const beamD  = params.beam_d_mm;
  // skirt_depth_mm is reserved for the future FPSF horizontal wing (the insulated
  // apron that extends outward from the skirt base under grade). It is wired through
  // the params so the value round-trips on save/load, but is not consumed here today.
  // eslint-disable-next-line no-unused-vars
  const _skirtDepthReserved = params.skirt_depth_mm;
  const skirtT = params.skirt_thickness_mm;

  const rects = silhouette.rects || [];
  const walls = silhouette.walls || [];
  const containsPoint = silhouette.containsPoint;

  const pieces = [];

  // SLAB — monolithic: maximal rectangles covering the silhouette.
  mergeSlabRects(rects).forEach((r, i) => {
    pieces.push({
      group: 'foundation', kind: 'slab',
      label: `slab_${String(i).padStart(2, '0')}`,
      dims: { dx_mm: r.w_mm, dy_mm: r.h_mm, dz_mm: slabT },
      center: { x_mm: r.x_mm + r.w_mm / 2, y_mm: r.y_mm + r.h_mm / 2, z_mm: -slabT / 2 },
    });
  });

  const runs = computeFoundationRuns(walls);

  // GRADE BEAM — derived per run, then UNION-DECOMPOSED into a clean ring of
  // NON-OVERLAPPING boxes (same property as the skirt).
  //
  // Step 1 — per-run RAW boxes, centered on the wall line, beam_w across, with a
  // per-end extension (classifyEnd):
  //   SUBMISSIVE end — a perpendicular dominant run P butts r there. Extend by
  //     P.depth/2 + beamW/2 so this beam reaches the perpendicular beam's outer
  //     face → the corner is bridged (these raw boxes OVERLAP at corners).
  //   DOMINANT end — r reaches the building corner; no extension.
  // Step 2 — decomposeRects over the UNION of the raw boxes → the identical ring
  //   region partitioned into disjoint maximal rectangles (no corner overlaps).
  // Top at BEAM_TOP_Z (5 mm below slab top z=0). The raw boxes also seed the
  // frost skirt (a loop around the OUTSIDE of this same ring).
  const beamRawBoxes = [];
  for (const r of runs) {
    const { submissive: subMin, perpRun: pMin } = classifyEnd(r, r.aMin, runs);
    const { submissive: subMax, perpRun: pMax } = classifyEnd(r, r.aMax, runs);
    const extMin = subMin ? pMin.depth / 2 + beamW / 2 : 0;
    const extMax = subMax ? pMax.depth / 2 + beamW / 2 : 0;
    const newAMin = r.aMin - extMin;
    const newAMax = r.aMax + extMax;
    const beamLen = newAMax - newAMin;
    const beamAxisC = (newAMin + newAMax) / 2;
    const lineC = r.nearCross + r.depth / 2;
    const dx = r.horiz ? beamLen : beamW;
    const dy = r.horiz ? beamW : beamLen;
    const cx = r.horiz ? beamAxisC : lineC;
    const cy = r.horiz ? lineC : beamAxisC;
    beamRawBoxes.push({ x0: cx - dx / 2, y0: cy - dy / 2, x1: cx + dx / 2, y1: cy + dy / 2 });
  }

  const beamCenterZ = BEAM_TOP_Z - beamD / 2;
  decomposeRects(beamRawBoxes, (x, y) => inAny(beamRawBoxes, x, y)).forEach((r, i) => {
    pieces.push({
      group: 'foundation', kind: 'beam', label: `beam_${String(i).padStart(2, '0')}`,
      dims: { dx_mm: r.w_mm, dy_mm: r.h_mm, dz_mm: beamD },
      center: { x_mm: r.x_mm + r.w_mm / 2, y_mm: r.y_mm + r.h_mm / 2, z_mm: beamCenterZ },
    });
  });

  // FROST SKIRT — a clean rectilinear LOOP of non-overlapping boxes hugging the
  // OUTSIDE of the beam ring.
  //   Z: top SKIRT_INSET_MM (1") below the beam top; bottom aligned with the
  //   beam bottom → height = beamD − SKIRT_INSET_MM.
  //   Plan: SKIRT_INSET_MM (1") outside the beam outer face, skirtT thick.
  // Expand the beam raw boxes outward by `inset` (skirt inner edge) and
  // `inset+skirtT` (outer edge); the skirt band = (in outer) AND (not in inner)
  // AND EXTERIOR (drops the inner-face band). decomposeRects merges it into
  // disjoint maximal rectangles. Gapless + overlap-free for any footprint.
  const outD = SKIRT_INSET_MM + skirtT;
  const skirtOuter = beamRawBoxes.map(b => ({ x0: b.x0 - outD, y0: b.y0 - outD, x1: b.x1 + outD, y1: b.y1 + outD }));
  const skirtInner = beamRawBoxes.map(b => ({ x0: b.x0 - SKIRT_INSET_MM, y0: b.y0 - SKIRT_INSET_MM, x1: b.x1 + SKIRT_INSET_MM, y1: b.y1 + SKIRT_INSET_MM }));
  const skirtDZ = beamD - SKIRT_INSET_MM;
  const skirtCenterZ = (BEAM_TOP_Z - SKIRT_INSET_MM) - skirtDZ / 2;

  decomposeRects(
    skirtOuter.concat(skirtInner),
    (x, y) => inAny(skirtOuter, x, y) && !inAny(skirtInner, x, y) && !containsPoint(x, y),
  ).forEach((r, i) => {
    pieces.push({
      group: 'foundation', kind: 'skirt', label: `skirt_${String(i).padStart(2, '0')}`,
      dims: { dx_mm: r.w_mm, dy_mm: r.h_mm, dz_mm: skirtDZ },
      center: { x_mm: r.x_mm + r.w_mm / 2, y_mm: r.y_mm + r.h_mm / 2, z_mm: skirtCenterZ },
    });
  });

  return pieces;
}

// True if (x,y) lies strictly inside any of the plan boxes {x0,y0,x1,y1}.
function inAny(boxes, x, y) {
  return boxes.some(b => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1);
}

// Decompose a rectilinear region into DISJOINT maximal rectangles. `coordBoxes`
// supplies the candidate edge coordinates (the region's defining boxes); `keep`
// is the cell-center predicate that decides whether a compressed cell is in the
// region. Used for BOTH the beam ring (keep = inside the beam-box union) and the
// frost skirt (keep = in the outer band, not the inner band, and exterior).
//
// Coordinate compression makes every cell edge land exactly on a real boundary,
// so output dims are exact. A tolerance-dedupe (SNAP) collapses edges that
// arrive via different arithmetic paths (corner overlaps) — without it those
// float-noise duplicates would emit zero-area sliver boxes. A greedy
// horizontal-then-vertical merge yields the disjoint maximal-rectangle cover.
function decomposeRects(coordBoxes, keep) {
  if (!coordBoxes.length) return [];
  const SNAP = 1e-3; // mm — far below any real dim, far above float noise
  const dedup = vals => {
    const out = [];
    for (const v of vals) if (!out.length || v - out[out.length - 1] > SNAP) out.push(v);
    return out;
  };
  const xsAll = [], ysAll = [];
  for (const b of coordBoxes) { xsAll.push(b.x0, b.x1); ysAll.push(b.y0, b.y1); }
  const xs = dedup(xsAll.sort((a, b) => a - b));
  const ys = dedup(ysAll.sort((a, b) => a - b));

  // one unit rect per kept cell, row-major (ascending y, then x)
  const cells = [];
  for (let j = 0; j < ys.length - 1; j++) {
    const y0 = ys[j], y1 = ys[j + 1], cy = (y0 + y1) / 2;
    for (let i = 0; i < xs.length - 1; i++) {
      const x0 = xs[i], x1 = xs[i + 1], cx = (x0 + x1) / 2;
      if (keep(cx, cy)) cells.push({ x_mm: x0, y_mm: y0, w_mm: x1 - x0, h_mm: y1 - y0 });
    }
  }

  // horizontal merge: stitch contiguous same-row, same-height cells
  const hmerged = [];
  for (const c of cells) {
    const last = hmerged[hmerged.length - 1];
    if (last && Math.abs(last.y_mm - c.y_mm) < MERGE_TOL && Math.abs(last.h_mm - c.h_mm) < MERGE_TOL &&
        Math.abs((last.x_mm + last.w_mm) - c.x_mm) < MERGE_TOL) {
      last.w_mm += c.w_mm;
    } else {
      hmerged.push({ ...c });
    }
  }
  // vertical merge: stack equal x+w rows (reuse the slab merger)
  return mergeSlabRects(hmerged);
}
