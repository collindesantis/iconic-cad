# Layout JSON Schema (v2)

The web UI exports a JSON file consumed by:

- `compile_from_json.py` (Python → FreeCAD `.FCStd`)
- `web/js/fcstd.js` (browser → FreeCAD `.FCStd`)
- `export_ifc.py` (Python → IFC4 `.ifc`)

All three accept the same v2 schema. The legacy `modules` top-level key is
also accepted by the compilers for backwards compatibility.

## Top-level keys

| Key | Type | Description |
|---|---|---|
| `version` | integer | Schema version. Currently `2`. |
| `units` | string | Always `"mm"`. All positions and dimensions are millimetres. |
| `levels` | array | Story definitions. Each has `id` (string), `name` (string), `z_mm` (number). |
| `layers` | array | Trade layers. Each has `id`, `name`, `color`, `visible`. |
| `entities` | array | Placed modules. See below. |
| `metadata` | object | Optional. Added by Export JSON (not Save): `exported` (ISO timestamp), `count`. |

## Entity fields

Each entry in `entities` represents one placed wall module.

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique entity ID within the layout (e.g. `"wall_3"`). |
| `kind` | string | `"wall"` (exterior) or `"iwall"` (interior). |
| `module` | string | Module ID from `constants.js` / `wall_instances.yaml` (e.g. `"wall_4x8_2x6_16oc"`). Note: no `_south` suffix — that suffix only appears in the YAML ID, not the UI module ID. |
| `direction` | string | Facing direction: `"north"`, `"south"`, `"east"`, or `"west"`. |
| `x_mm` | number | Module origin X in mm (top-left corner of bounding box). |
| `y_mm` | number | Module origin Y in mm (top-left corner of bounding box). |
| `level` | string | Level ID this entity belongs to (e.g. `"L1"`). |
| `layer` | string | Layer ID (e.g. `"structural"`). |
| `width_mm` | number | Module run length in mm (before rotation). |
| `depth_mm` | number | Module depth (wall thickness) in mm. |
| `connections` | array | T-junction connections to other modules. Present only on interior walls. See below. |

## Connection fields

Each entry in `connections` describes one T-junction where this interior wall
meets an exterior wall.

| Field | Type | Description |
|---|---|---|
| `target_id` | string | `id` of the exterior wall this interior wall connects to. |
| `blocking` | string | Blocking type: `"C1"`, `"C2"`, or `"T"`. |
| `contact_x_mm` | number | Global X of the contact point on the exterior wall's interior face. |
| `contact_y_mm` | number | Global Y of the contact point on the exterior wall's interior face. |

## Blocking types

- **C1** — 1 continuous stud flush against the nearest existing stud (used when
  the interior wall lands close to a stud).
- **C2** — 2 continuous studs flanking the interior wall's end stud (used when
  in the open field, no nearby stud).
- **T** — 4 horizontal ladder blocks between the two studs bracketing the
  contact point.

## Compatibility note

The compilers also accept an older schema where the top-level key is `modules`
instead of `entities`. Field names are identical. New exports always use
`entities`.
