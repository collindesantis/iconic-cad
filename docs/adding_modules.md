# Adding a module to Iconic CAD

This is the worked template for adding new modules, using the **window + door
apertures** as the example. Follow the same five touch-points for any future
module (sliding door, double door, garage header, etc.).

## The pipeline (what you're plugging into)

Per the Iconic CAD Protocol, one YAML schema compiles three ways:

```
wall_instances.yaml ──scripts/gen_specs.py──▶ web/assets/lib/specs.json
        (schema)   ──generate_wall_library.py──▶ cad_library/<id>.FCStd   (the part)
                                                          │
                                                          ▼
web UI (web/js/) ──Export──▶ layout.json ──compile_from_json.py──▶ House.FCStd
  place + snap                   │         (Python + FreeCAD, ./compile.sh)
  3D + BOM                       │
                                  ├──web/js/fcstd.js──▶ house.FCStd
                                  │   (browser, no terminal)
                                  │
                                  └──export_ifc.py──▶ house.ifc
                                      (Python, requires ifcopenshell)
```

The YAML is the single source of truth. The generator turns each instance into
a FreeCAD part. The web UI lets a user place parts and exports positions; the
JSON compiler reassembles the parts into a house. (The old SVG/icon compiler is
retired — see the `legacy` branch.)

## Design principle for apertures

**A door is a window taken to the floor.** Same king/jack/header/cripple logic;
a window just adds a sill and lower cripples. So windows and doors are *one*
parametric object — a `family: aperture_wall_panel` driven by an `aperture`
block — not two code paths. They are 48"-wide wall panels and snap exactly like
a plain wall. Exact framing dims were measured from OSE source CAD; see
[aperture_framing_reference.md](aperture_framing_reference.md).

## The five touch-points

### 1. Schema — `wall_instances.yaml`

Add an instance with the shared wall parameters plus an `aperture` block:

```yaml
- id: window_4x8_2x6_36x48_south
  family: aperture_wall_panel
  parameters:
    nominal_width_ft: 4.0
    nominal_height_ft: 8.0
    stud_lumber_nominal: "2x6"
    stud_spacing_oc_in: 16
    osb_thickness_in: 0.4375
    exterior_face: south
    reference_house_orientation: faces_south
    aperture:
      type: window            # window | door
      rough_opening_width_in: 36
      rough_opening_height_in: 48
      sill_height_in: 24       # top of sill; 0 = opening to floor (door)
      header_lumber_nominal: "2x8"
      header_plies: 2
```

`osb_thickness_in: 0` makes it an interior (2x4, no-OSB) panel.

### 2. CAD generator — `generate_wall_library.py`

`build_aperture_panel()` reads the `aperture` block and emits conventional
platform framing (kings, jacks, header at the RO top, cripples above, plus a
sill + lower cripples for a window). `main()` dispatches to it whenever an
instance has an `aperture` key. Port markers are identical to walls, so the
JSON compiler treats apertures as ordinary panels — no compiler changes needed.

Regenerate:

```bash
freecadcmd -c "import sys; sys.argv=['generate_wall_library.py','wall_instances.yaml']; exec(open('generate_wall_library.py').read())"
```

Verify a panel's framing by measuring its solids (W × D × H, origin) in
`freecadcmd` — that's how the reference dims were checked.

### 3. Web UI placement + plan silhouette — `web/js/constants.js`, `web/js/render2d.js`

- Add the module to `APERTURE_MODULES` (exterior) or `INT_APERTURE_MODULES`
  (interior) in `web/js/constants.js` with an `aperture` metadata object (inches).
  These flow into `ALL_MODULES`, so snapping/ports/save/load work for free.
- `drawAperturePlan()` in `web/js/render2d.js` renders the conventional top-down
  floor-plan symbol — glazing double-line + jamb ticks for a window; opening gap
  + leaf + swing arc for a door (hinged to the interior side).
- The library palette tile uses an inline-SVG plan thumbnail (no icon files);
  pick it, then press **R** to rotate.

### 3b. Browser FreeCAD export specs — `scripts/gen_specs.py`

After adding the module to `wall_instances.yaml`, regenerate the wall specs used
by the browser FreeCAD export:

```bash
python scripts/gen_specs.py
```

This updates `web/assets/lib/specs.json`. Commit both the YAML change and the
regenerated JSON together. CI asserts they stay in sync.

### 4. 3D preview — `web/js/render3d.js`

`buildAperture3D()` in `web/js/render3d.js` mirrors the generator framing in
three.js so the live preview shows the real opening (OSB cut out around the RO).
`buildWall3D()` dispatches to it for any module with an `aperture`.

### 5. BOM — `web/pricing.json`

Add a `module_specs.<id>` entry (`studs`, `plates`, `osb_sheets`,
`lumber_type`, nail/screw counts). Stud counts for apertures are full-stud-
equivalent estimates (kings + jacks + cripples + header stock); note this in
the entry's `notes`.

## Checklist for a new module

- [ ] `wall_instances.yaml` instance added
- [ ] `generate_wall_library.py` builds it (run `./generate.sh`, measure solids)
- [ ] `compile_from_json.py` reassembles it (run `./compile.sh test_layout.json`)
- [ ] `web/js/constants.js`: module entry in `APERTURE_MODULES` / `INT_APERTURE_MODULES`
- [ ] `web/js/render2d.js`: plan silhouette in `drawAperturePlan()`
- [ ] `web/js/render3d.js`: 3D framing in `buildAperture3D()`
- [ ] `scripts/gen_specs.py`: re-run → commit updated `web/assets/lib/specs.json`
- [ ] `web/pricing.json`: BOM spec
- [ ] dims sourced from real CAD / code, not guessed — record them in
      [aperture_framing_reference.md](aperture_framing_reference.md)
