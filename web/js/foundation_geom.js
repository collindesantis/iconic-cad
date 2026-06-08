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
//     rects   — the L1 filled-silhouette rectangles (region.rects); the slab.
//     walls   — L1 kind:'wall' entities { id, x_mm, y_mm, mod, dir }; the beam
//               + skirt trace each one. mod carries width_mm/depth_mm.
//     containsPoint(x,y) — region probe used to find each wall's OUTSIDE face.
//
//   piece = { group:'foundation', kind:'slab'|'beam'|'skirt', label,
//             dims:{dx_mm,dy_mm,dz_mm}, center:{x_mm,y_mm,z_mm} }
//
// World plan mm; z-DOWN convention: the top of the slab is the ground datum
// z=0, so every piece extrudes downward and its center z is negative (matches
// render3d's scene). Consumers apply their own origin offset / Y-mirror.
// =====================================================
import { getModuleBBox } from './geometry.js';

// 3" region cell, kept in sync with region.js REGION_CELL_MM. Only used as a
// fallback for the outside-face probe distance if the caller omits cell_mm.
const DEFAULT_CELL_MM = 3 * 25.4;

export function foundationSolids(params, silhouette) {
  const slabT  = params.slab_thickness_mm;
  const beamW  = params.beam_w_mm;
  const beamD  = params.beam_d_mm;
  const skirtD = params.skirt_depth_mm;
  const skirtT = params.skirt_thickness_mm;

  const rects = silhouette.rects || [];
  const walls = silhouette.walls || [];
  const containsPoint = silhouette.containsPoint;
  const cell = silhouette.cell_mm || DEFAULT_CELL_MM;
  const probe = cell * 0.75; // ~¾ cell past a wall face — clear of the over-mark

  const pieces = [];

  // SLAB — one box per L1 silhouette rect, extruded down from z=0.
  rects.forEach((r, i) => {
    pieces.push({
      group: 'foundation', kind: 'slab',
      label: `slab_${String(i).padStart(2, '0')}`,
      dims: { dx_mm: r.w_mm, dy_mm: r.h_mm, dz_mm: slabT },
      center: { x_mm: r.x_mm + r.w_mm / 2, y_mm: r.y_mm + r.h_mm / 2, z_mm: -slabT / 2 },
    });
  });

  // GRADE BEAM + FROST SKIRT — one of each per L1 exterior wall.
  for (const w of walls) {
    const bb = getModuleBBox(w.mod, w.dir);
    const horiz = bb.w >= bb.h;        // wall runs along X
    const len = horiz ? bb.w : bb.h;
    const cx = w.x_mm + bb.w / 2;      // footprint center (world plan mm)
    const cy = w.y_mm + bb.h / 2;

    // GRADE BEAM — along the run, beam_w across, beam_d deep, top at z=0.
    pieces.push({
      group: 'foundation', kind: 'beam', label: `beam_${w.id}`,
      dims: { dx_mm: horiz ? len : beamW, dy_mm: horiz ? beamW : len, dz_mm: beamD },
      center: { x_mm: cx, y_mm: cy, z_mm: -beamD / 2 },
    });

    // FROST SKIRT — thin EPS panel on the wall's OUTSIDE face (the side whose
    // just-past-the-face probe is NOT inside the silhouette).
    //
    // CORNER-CLOSING RULE: each skirt panel is grown by skirt_thickness past
    // BOTH ends of its wall run (length += 2*skirt_thickness, center unchanged).
    // At an exterior corner two perpendicular runs meet; the neighbour's skirt
    // sits skirt_thickness outside the perpendicular wall, so extending by
    // exactly that distance makes this panel reach across the corner square and
    // overlap the neighbour — leaving NO gap (FPSF stays continuous). Exterior
    // walls form a closed loop, so every skirt end is either a corner (the
    // extension fills it) or a collinear butt joint (the panels simply overlap,
    // a harmless union) — never a free end that would stick out into nothing.
    const grown = len + 2 * skirtT;
    if (horiz) {
      const topOut = !containsPoint(cx, w.y_mm - probe);
      const fy = topOut ? w.y_mm - skirtT / 2
                        : w.y_mm + bb.h + skirtT / 2;
      pieces.push({
        group: 'foundation', kind: 'skirt', label: `skirt_${w.id}`,
        dims: { dx_mm: grown, dy_mm: skirtT, dz_mm: skirtD },
        center: { x_mm: cx, y_mm: fy, z_mm: -skirtD / 2 },
      });
    } else {
      const leftOut = !containsPoint(w.x_mm - probe, cy);
      const fx = leftOut ? w.x_mm - skirtT / 2
                         : w.x_mm + bb.w + skirtT / 2;
      pieces.push({
        group: 'foundation', kind: 'skirt', label: `skirt_${w.id}`,
        dims: { dx_mm: skirtT, dy_mm: grown, dz_mm: skirtD },
        center: { x_mm: fx, y_mm: cy, z_mm: -skirtD / 2 },
      });
    }
  }

  return pieces;
}
