# 2026-06-01 - Aperture system, web UI refactor, and browser-side FreeCAD compile

**Tags:** apertures, doors, windows, web-ui, doc-model, freecad, ifc
**Commits:** b9addbb…42553ef (11). Bare SHAs in headers are git refs (`git show <sha>`), not links.
**Slides:** https://docs.google.com/presentation/d/1vHQ19yCI7JtXhpin1AzwZWD58SGa1JyhoXT0GvU7VVA/edit?usp=sharing
**Public write-up:** none yet

---

## Where we started

The web UI could lay out exterior and interior walls with snap logic, drop C/T
blocking at interior junctions, tally a live BOM + cost, and show a crude
box-geometry 3D preview. Layouts exported to JSON and `compile_from_json.py`
turned that into a stud-level FreeCAD assembly. Three gaps going in: no openings
(walls were solid), the 3D preview leaked geometry and lagged, the UI was one
~1900-line `index.html`, and the only path to a real `.fcstd` was a terminal
with FreeCAD installed. The plan was windows and doors; it turned into a much
bigger day.

## Apertures: windows and doors as one object (b9addbb, 67ae607, 8e3d789)

A door is a window taken to the floor, so one parametric family
(`aperture_wall_panel` in `wall_instances.yaml`) drives both. It carries a rough
opening, sill, and header, and the generator emits platform framing from those:
king/jack studs, header, cripples, plus a sill and lower cripples for windows,
with the opening cut from the OSB. An aperture is still a 48" panel, so it snaps
and compiles exactly like a plain wall and the JSON compiler needed no changes.
End-of-day lineup: window (+ 9' and 10' height variants), exterior door (in and
out swing), interior door, double door, sliding, garage. Window framing follows
Marcin's latest OSE spec (subheader + 24" blocking). Framing dims were measured
from OSE source CAD, recorded in [`docs/aperture_framing_reference.md`](../aperture_framing_reference.md).

## Placement rules and door swing geometry (67be284, ff35024, 3ace8f9, 8e3d789)

Openings broke old placement assumptions, so attachment was made physically
honest: interior walls attach to an aperture only at a *seam* (double king studs
give a real bolting surface), never over the opening; interior walls attach to
exterior walls by T-junction only, never floating port-snaps; interior doors are
forced to T-junction placement so they can't chain across an exterior wall and
float outdoors; 48" keep-outs enforced globally. The door swing guard replaced a
hardcoded heuristic (which missed most real collisions, so it was deleted) with
geometry: each door leaf's swept arc is computed as a circular sector in global
mm using the same formulas the renderer draws with, then tested for overlap.
Conflicting placement is rejected; press R to flip the swing to the open side.

## Web UI refactor and the v2 document model (fca56f1)

The single ~1900-line `index.html` was split into ES modules under `web/js/`
(`state, app, render2d, render3d, snap, geometry, bom, io, ui, view, constants,
main`) with no build step. The document model was promoted to v2: a layout is a
`doc` with `levels[]`, `layers[]`, and `entities[]`, every entity carrying
orthogonal `level` / `layer` / side attributes plus a stable id. That is the
slot where trades and stories plug in: adding a trade becomes a data question,
not a rewrite. The 3D preview was also fixed: it had rebuilt from scratch on
every mousemove and never disposed its geometry (a GPU leak) with a perpetual
idle render loop. Now the hot path does only 2D work, the 3D rebuild and BOM run
on model change, old geometry is disposed before rebuild, rendering is
on-demand, and the camera fits once.

## Library redesign (1ba3b9f)

Replaced four directional icons per module with one baked isometric thumbnail
(real three.js geometry rendered offscreen) plus a single NESW direction
selector over the grid. Toggle to "Icons" mode restores the per-direction SVGs;
the choice persists. One image per module instead of four scales as the module
count grows, and the iso thumbnail reads the actual 3D shape at a glance. (This
commit also added the Python `export_ifc.py` IFC4 interop tool, see below.)

## Full compile in the browser (6636feb, 42553ef)

The "Export FreeCAD" button now produces a complete `.fcstd` entirely
client-side, no terminal and no FreeCAD install. It uses the same `cad_library`
shapes as the Python compiler, pre-baked per direction, positioned by injecting
a translation into each shape's BREP OCCT `Locations` matrix (FreeCAD ignores a
hand-written `Placement`, so position has to live in the BREP). Verified
byte-equivalent to `compile_from_json.py`: per-object volumes and centres
identical on every layout and blocking type (the parity test that backs this was
committed the next day, 6/2). This is the proof of the no-backend architecture:
the full stud-level model comes out of a static web page. A separate Python tool,
`export_ifc.py` (added in 1ba3b9f), emits an IFC4 model for trade-software
interop; it is terminal-only, not a browser export.

## README and docs (031ffbc)

Documented the full window/door/garage/sliding lineup, the swing tiles, the
collision guard, the OSE window framing, and the corrected interior-door rule;
ignored root-level scratch layout JSONs.

## Decisions / why

- **One aperture family, not two systems.** A door is a window to the floor, so
  unifying them means the compiler needs no special-casing and new opening types
  (double, sliding, garage) are cheap additions.
- **Geometry over heuristics for the swing guard.** Hardcoded edge rules missed
  real collisions; computing the actual swept sector makes the block decision
  match exactly what the user sees on screen.
- **Orthogonal doc model before the trade features exist.** Putting
  `level`/`layer`/side on every entity now means trades and stories are additive
  later, not a model rewrite. Least visual change of the day, most important.
- **Compile in the browser via BREP Locations injection.** Baking position into
  the BREP (rather than a Placement FreeCAD discards on restore) is what lets the
  full compile run client-side with output identical to the Python path.

## Next / open

- [ ] OSB notching + corner stud for drywall nailing (carried from 3/26)
- [ ] Parameterize precut studs (3/8" shorter, noted not yet wired)
- [ ] Test stage/phase swapping against the v2 layer model
- [ ] `bake_lib.py` for single-command part-library baking (browser export still needs manually baked BREPs per new module)
