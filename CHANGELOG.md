# Changelog

## Unreleased

- Fix: Python compiler now accepts v2 `entities` JSON from web UI export (`KeyError: 'modules'` resolved)
- FreeCAD imports guarded so pure geometry functions are testable without FreeCAD
- Parity test harness committed (`tests/parity.mjs`, `tests/test_blocking_math.py`, golden from FreeCAD)
- GitHub Actions CI (no FreeCAD required)
- `requirements.txt` with pinned versions; `generate.sh` / `compile.sh` wrappers
- `scripts/gen_specs.py`: `web/assets/lib/specs.json` generated from YAML; browser no longer hard-codes wall specs
- Docs: README, `adding_modules.md`, `layout_schema.md`, `CONTRIBUTING.md` updated for modular web/js layout and all three export paths

## 2025-06 — Browser FreeCAD + IFC export

- Browser FreeCAD export (`web/js/fcstd.js`): builds `.FCStd` in-browser using pre-baked BREPs, matching Python compiler output exactly
- IFC4 export (`export_ifc.py`): one `IfcWall` per module, grouped by storey
- Iso-thumbnail library with NESW direction selector
- Web UI modularized into `web/js/` (13 modules); 3D preview lag fixed

## 2025-05 — Apertures

- Window and door aperture modules (`aperture_wall_panel`): king/jack studs, header, cripples, sill
- Double door, sliding door, garage door variants
- Interior door with T-junction-only placement and geometric swing-conflict guard
- Interior-wall placement rules: seam-only attachment to apertures, corner keep-outs, parallel keep-outs

## 2025-04 — Interior walls

- Interior walls with C1/C2/T blocking at T-junctions
- Live 3D preview (three.js); live BOM estimator (`pricing.json`)
- Save/load layouts; undo/redo; rotate (R), erase, zoom/pan

## 2025-03 — Web UI foundation

- Drag-and-snap wall layout tool replacing Inkscape/SVG workflow
- JSON export with exact mm positions; `compile_from_json.py` port-free compiler
- Directional icons (N/S/E/W) per OSE spec; corner port snapping
