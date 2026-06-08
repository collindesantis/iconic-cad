#!/usr/bin/env python3
"""
FOUNDATION LIB — pure Python port of the browser's foundation derivation.

This is the deliberate JS<->Python parallel pair (same precedent as the
wall/blocking math): it mirrors web/js/region.js (compute_region flood-fill)
and web/js/foundation_geom.js (foundation_solids) byte-for-byte in behaviour so
the terminal compiler's foundation matches the browser exactly. Kept honest by
the golden parity test tests/foundation_parity.mjs.

PURE: no FreeCAD, no I/O. Imports only the stdlib so it can run under plain
python3 (the golden generator) AND under freecadcmd (the compiler).
"""

import math

IN_TO_MM = 25.4

# ---- region (port of web/js/region.js) -----------------------------------
REGION_CELL_MM = 3 * IN_TO_MM   # 3" cell, must equal region.js REGION_CELL_MM
MARGIN_CELLS = 2
EMPTY, WALL, FLOOD = 0, 1, 2


def is_horizontal(direction):
    return direction in ("north", "south")


def module_bbox(width_mm, depth_mm, direction):
    """Post-rotation footprint, mirrors geometry.js getModuleBBox."""
    if is_horizontal(direction):
        return width_mm, depth_mm
    return depth_mm, width_mm


def _wall_dir(e):
    return e.get("direction") or e.get("dir")


def _wall_bbox(e):
    return module_bbox(e["width_mm"], e["depth_mm"], _wall_dir(e))


def compute_region(entities, cell_mm=REGION_CELL_MM):
    """Port of region.js computeRegion. Returns a region descriptor dict with:
    rects, cells, contains_point, is_enclosed, bbox."""
    walls = [e for e in entities if e.get("kind") == "wall"]  # exterior only
    if not walls:
        return _empty_region()

    # 1. extent over exterior-wall footprints
    min_x = min_y = math.inf
    max_x = max_y = -math.inf
    fps = []
    for e in walls:
        w, h = _wall_bbox(e)
        r = {"x0": e["x_mm"], "y0": e["y_mm"], "x1": e["x_mm"] + w, "y1": e["y_mm"] + h}
        min_x = min(min_x, r["x0"]); min_y = min(min_y, r["y0"])
        max_x = max(max_x, r["x1"]); max_y = max(max_y, r["y1"])
        fps.append(r)

    # 2. grid with a MARGIN_CELLS-wide ring on every side
    origin_x = min_x - MARGIN_CELLS * cell_mm
    origin_y = min_y - MARGIN_CELLS * cell_mm
    cols = math.ceil((max_x - min_x) / cell_mm) + 2 * MARGIN_CELLS + 1
    rows = math.ceil((max_y - min_y) / cell_mm) + 2 * MARGIN_CELLS + 1
    grid = bytearray(cols * rows)  # EMPTY

    def at(cx, cy):
        return cy * cols + cx

    # mark WALL by any-overlap with a footprint (leak-proof at corners)
    for r in fps:
        cx0 = math.floor((r["x0"] - origin_x) / cell_mm)
        cx1 = math.floor((r["x1"] - origin_x) / cell_mm)
        cy0 = math.floor((r["y0"] - origin_y) / cell_mm)
        cy1 = math.floor((r["y1"] - origin_y) / cell_mm)
        for cy in range(cy0, cy1 + 1):
            for cx in range(cx0, cx1 + 1):
                if 0 <= cx < cols and 0 <= cy < rows:
                    grid[at(cx, cy)] = WALL

    # 3. flood from the margin ring (border cells are all EMPTY by construction)
    stack = []

    def push(cx, cy):
        if cx < 0 or cx >= cols or cy < 0 or cy >= rows:
            return
        i = at(cx, cy)
        if grid[i] == EMPTY:
            grid[i] = FLOOD
            stack.append(i)

    for cx in range(cols):
        push(cx, 0); push(cx, rows - 1)
    for cy in range(rows):
        push(0, cy); push(cols - 1, cy)
    while stack:
        i = stack.pop()
        cx = i % cols
        cy = i // cols
        push(cx + 1, cy); push(cx - 1, cy); push(cx, cy + 1); push(cx, cy - 1)

    # 4. filled silhouette = WALL cells + enclosed interior
    enclosed_area = 0.0
    rmin_x = rmin_y = math.inf
    rmax_x = rmax_y = -math.inf
    for cy in range(rows):
        for cx in range(cols):
            s = grid[at(cx, cy)]
            if s == EMPTY:
                enclosed_area += cell_mm * cell_mm
            if s != FLOOD:
                wx = origin_x + cx * cell_mm
                wy = origin_y + cy * cell_mm
                rmin_x = min(rmin_x, wx); rmin_y = min(rmin_y, wy)
                rmax_x = max(rmax_x, wx + cell_mm); rmax_y = max(rmax_y, wy + cell_mm)

    is_enclosed = enclosed_area > 0
    bbox = ({"minX": rmin_x, "minY": rmin_y, "maxX": rmax_x, "maxY": rmax_y}
            if is_enclosed else None)

    def state_at(x, y):
        cx = math.floor((x - origin_x) / cell_mm)
        cy = math.floor((y - origin_y) / cell_mm)
        if cx < 0 or cx >= cols or cy < 0 or cy >= rows:
            return FLOOD
        return grid[at(cx, cy)]

    def contains_point(x, y):
        return state_at(x, y) != FLOOD

    # FILL MASK — enclosed interior + the EXACT wall band (trims over-mark).
    def center_in_footprint(x, y):
        for r in fps:
            if r["x0"] <= x < r["x1"] and r["y0"] <= y < r["y1"]:
                return True
        return False

    def is_empty(cx, cy):
        return 0 <= cx < cols and 0 <= cy < rows and grid[at(cx, cy)] == EMPTY

    def is_fill(cx, cy):
        s = grid[at(cx, cy)]
        if s == EMPTY:
            return True
        if s != WALL:
            return False
        if center_in_footprint(origin_x + (cx + 0.5) * cell_mm,
                               origin_y + (cy + 0.5) * cell_mm):
            return True
        return (is_empty(cx - 1, cy) or is_empty(cx + 1, cy)
                or is_empty(cx, cy - 1) or is_empty(cx, cy + 1))

    # merged per-row rectangles of the fill cells
    rects = []
    for cy in range(rows):
        run_start = -1
        for cx in range(cols + 1):
            fill = cx < cols and is_fill(cx, cy)
            if fill and run_start < 0:
                run_start = cx
            elif not fill and run_start >= 0:
                rects.append({
                    "x_mm": origin_x + run_start * cell_mm,
                    "y_mm": origin_y + cy * cell_mm,
                    "w_mm": (cx - run_start) * cell_mm,
                    "h_mm": cell_mm,
                })
                run_start = -1

    return {
        "cells": {"cols": cols, "rows": rows, "cell_mm": cell_mm,
                  "origin_x": origin_x, "origin_y": origin_y},
        "bbox": bbox, "area_mm2": enclosed_area, "is_enclosed": is_enclosed,
        "contains_point": contains_point, "rects": rects,
    }


def _empty_region():
    return {"cells": None, "bbox": None, "area_mm2": 0.0, "is_enclosed": False,
            "contains_point": lambda x, y: False, "rects": []}


# ---- foundation_solids (port of web/js/foundation_geom.js) ----------------
DEFAULT_CELL_MM = 3 * IN_TO_MM
MERGE_TOL = 1e-6   # mm — strip x/w/edge equality
RUN_TOL = 2        # mm — end-to-end contiguity gap along a run
RUN_BAND = 60      # mm — same-line cross-axis clustering

# Beam top is 5 mm below the slab-top datum (z=0) to prevent z-fighting.
BEAM_TOP_Z = -5
# Gap between beam outer face and skirt inner face (= 1 inch).
SKIRT_INSET_MM = 25.4


def _merge_slab_rects(rects):
    """Greedy-merge per-row fill strips into MAXIMAL rectangles (port of
    foundation_geom.js mergeSlabRects). Stack vertically-adjacent strips that
    share x_mm + w_mm into one taller box → minimal rectangle set covering the
    silhouette (rectangle house -> 1; L -> 2-3)."""
    open_rects = []
    for s in rects:
        host = None
        for o in open_rects:
            if (abs(o["x_mm"] - s["x_mm"]) < MERGE_TOL and
                    abs(o["w_mm"] - s["w_mm"]) < MERGE_TOL and
                    abs((o["y_mm"] + o["h_mm"]) - s["y_mm"]) < MERGE_TOL):
                host = o
                break
        if host:
            host["h_mm"] += s["h_mm"]
        else:
            open_rects.append({"x_mm": s["x_mm"], "y_mm": s["y_mm"],
                               "w_mm": s["w_mm"], "h_mm": s["h_mm"]})
    return open_rects


def _compute_runs(walls):
    """Group exterior walls into runs (one run = one full side). Port of
    foundation_geom.js computeFoundationRuns / runs.js detectRunsForLevel,
    geometry-only. Each run: horiz, letter, near_cross, depth, a_min, a_max."""
    feats = []
    for w in walls:
        bw, bh = module_bbox(w["width_mm"], w["depth_mm"], w["direction"])
        horiz = is_horizontal(w["direction"])
        x0, y0, x1, y1 = w["x_mm"], w["y_mm"], w["x_mm"] + bw, w["y_mm"] + bh
        feats.append({
            "horiz": horiz,
            "depth": bh if horiz else bw,
            "cross": y0 if horiz else x0,
            "a0": x0 if horiz else y0,
            "a1": x1 if horiz else y1,
        })

    # 1. cluster into collinear lines (same orientation + cross band)
    lines = []
    for ft in feats:
        line = next((L for L in lines if L["horiz"] == ft["horiz"]
                     and abs(L["cross"] - ft["cross"]) <= RUN_BAND), None)
        if line is None:
            line = {"horiz": ft["horiz"], "cross": ft["cross"], "items": []}
            lines.append(line)
        line["items"].append(ft)

    # 2. within each line, sort along the axis and split into contiguous chains
    runs = []
    for L in lines:
        L["items"].sort(key=lambda f: f["a0"])
        chain, end = [], None

        def flush():
            nonlocal chain
            if not chain:
                return
            runs.append({
                "horiz": L["horiz"],
                "near_cross": min(c["cross"] for c in chain),
                "depth": chain[0]["depth"],
                "a_min": min(c["a0"] for c in chain),
                "a_max": max(c["a1"] for c in chain),
            })
            chain = []

        for ft in L["items"]:
            if chain and ft["a0"] - end > RUN_TOL:
                flush()
            chain.append(ft)
            end = ft["a1"] if end is None else max(end, ft["a1"])
        flush()

    # 3. order top-to-bottom (minY), ties left-to-right (minX); letter by order
    def min_x(r):
        return r["a_min"] if r["horiz"] else r["near_cross"]

    def min_y(r):
        return r["near_cross"] if r["horiz"] else r["a_min"]

    runs.sort(key=lambda r: (min_y(r), min_x(r)))
    for i, r in enumerate(runs):
        r["letter"] = chr(65 + i)
    return runs


def _classify_end(r, a_end_val, all_runs):
    """Classify one end of run r: returns (submissive, perp_run) where perp_run is
    the perpendicular dominant run that butts r at a_end_val (submissive=True), or
    (False, None) if r reaches the building corner there (dominant)."""
    for p in all_runs:
        if p["horiz"] == r["horiz"]:
            continue
        # (a) r's cross band within p's along-axis extent
        if p["a_min"] > r["near_cross"] + RUN_TOL:
            continue
        if r["near_cross"] + r["depth"] > p["a_max"] + RUN_TOL:
            continue
        # (b) p's cross band contains a_end_val
        if p["near_cross"] - RUN_TOL > a_end_val:
            continue
        if a_end_val > p["near_cross"] + p["depth"] + RUN_TOL:
            continue
        return True, p
    return False, None


def foundation_solids(params, silhouette):
    """Port of foundation_geom.js foundationSolids. Returns ordered list of
    piece dicts {group, kind, label, dims{dx_mm,dy_mm,dz_mm},
    center{x_mm,y_mm,z_mm}}. World plan mm, z-DOWN (top of slab = z=0).
    Monolithic slab + grade-beam RING (per-run raw boxes union-decomposed into
    non-overlapping rects, top at BEAM_TOP_Z) + frost-skirt LOOP (non-overlapping
    boxes 1" outside the beam outer face)."""
    slab_t = params["slab_thickness_mm"]
    beam_w = params["beam_w_mm"]
    beam_d = params["beam_d_mm"]
    # skirt_depth_mm: reserved for the future FPSF horizontal wing (insulated
    # apron extending outward under grade). Wired through the params but not
    # consumed here today.
    _skirt_depth_reserved = params["skirt_depth_mm"]  # noqa: F841
    skirt_t = params["skirt_thickness_mm"]

    rects = silhouette.get("rects", [])
    walls = silhouette.get("walls", [])
    contains_point = silhouette["contains_point"]

    pieces = []

    # SLAB — monolithic: maximal rectangles covering the silhouette.
    for i, r in enumerate(_merge_slab_rects(rects)):
        pieces.append({
            "group": "foundation", "kind": "slab", "label": "slab_%02d" % i,
            "dims": {"dx_mm": r["w_mm"], "dy_mm": r["h_mm"], "dz_mm": slab_t},
            "center": {"x_mm": r["x_mm"] + r["w_mm"] / 2,
                       "y_mm": r["y_mm"] + r["h_mm"] / 2, "z_mm": -slab_t / 2},
        })

    runs = _compute_runs(walls)

    # GRADE BEAM — per-run RAW boxes (per-end extended via _classify_end so corners
    # are bridged; these OVERLAP at corners), then union-decomposed into a ring of
    # NON-OVERLAPPING rects. Top at BEAM_TOP_Z. Raw boxes also seed the skirt.
    # Extension: SUBMISSIVE end → P.depth/2 + beam_w/2; DOMINANT end → 0.
    beam_raw_boxes = []
    for r in runs:
        sub_min, p_min = _classify_end(r, r["a_min"], runs)
        sub_max, p_max = _classify_end(r, r["a_max"], runs)
        ext_min = p_min["depth"] / 2 + beam_w / 2 if sub_min else 0
        ext_max = p_max["depth"] / 2 + beam_w / 2 if sub_max else 0
        new_a_min = r["a_min"] - ext_min
        new_a_max = r["a_max"] + ext_max
        beam_len = new_a_max - new_a_min
        axis_c = (new_a_min + new_a_max) / 2
        line_c = r["near_cross"] + r["depth"] / 2
        dx = beam_len if r["horiz"] else beam_w
        dy = beam_w if r["horiz"] else beam_len
        cx = axis_c if r["horiz"] else line_c
        cy = line_c if r["horiz"] else axis_c
        beam_raw_boxes.append({"x0": cx - dx / 2, "y0": cy - dy / 2,
                               "x1": cx + dx / 2, "y1": cy + dy / 2})

    beam_center_z = BEAM_TOP_Z - beam_d / 2
    for i, r in enumerate(_decompose_rects(
            beam_raw_boxes, lambda x, y: _in_any(beam_raw_boxes, x, y))):
        pieces.append({
            "group": "foundation", "kind": "beam", "label": "beam_%02d" % i,
            "dims": {"dx_mm": r["w_mm"], "dy_mm": r["h_mm"], "dz_mm": beam_d},
            "center": {"x_mm": r["x_mm"] + r["w_mm"] / 2,
                       "y_mm": r["y_mm"] + r["h_mm"] / 2, "z_mm": beam_center_z},
        })

    # FROST SKIRT — non-overlapping LOOP hugging the OUTSIDE of the beam ring.
    # Z: top 1" below beam top, bottom aligned with beam bottom → height
    # = beam_d - SKIRT_INSET_MM. Plan: 1" outside the beam outer face, skirt_t
    # thick. Band = (in outer) and (not in inner) and EXTERIOR (drops inner-face
    # band), union-decomposed into disjoint maximal rects.
    out_d = SKIRT_INSET_MM + skirt_t
    skirt_outer = [{"x0": b["x0"] - out_d, "y0": b["y0"] - out_d,
                    "x1": b["x1"] + out_d, "y1": b["y1"] + out_d} for b in beam_raw_boxes]
    skirt_inner = [{"x0": b["x0"] - SKIRT_INSET_MM, "y0": b["y0"] - SKIRT_INSET_MM,
                    "x1": b["x1"] + SKIRT_INSET_MM, "y1": b["y1"] + SKIRT_INSET_MM}
                   for b in beam_raw_boxes]
    skirt_dz = beam_d - SKIRT_INSET_MM
    skirt_center_z = (BEAM_TOP_Z - SKIRT_INSET_MM) - skirt_dz / 2

    def _skirt_keep(x, y):
        return (_in_any(skirt_outer, x, y) and not _in_any(skirt_inner, x, y)
                and not contains_point(x, y))

    for i, r in enumerate(_decompose_rects(skirt_outer + skirt_inner, _skirt_keep)):
        pieces.append({
            "group": "foundation", "kind": "skirt", "label": "skirt_%02d" % i,
            "dims": {"dx_mm": r["w_mm"], "dy_mm": r["h_mm"], "dz_mm": skirt_dz},
            "center": {"x_mm": r["x_mm"] + r["w_mm"] / 2,
                       "y_mm": r["y_mm"] + r["h_mm"] / 2, "z_mm": skirt_center_z},
        })

    return pieces


def _in_any(boxes, x, y):
    """True if (x,y) lies strictly inside any plan box {x0,y0,x1,y1}."""
    return any(b["x0"] < x < b["x1"] and b["y0"] < y < b["y1"] for b in boxes)


def _decompose_rects(coord_boxes, keep):
    """Decompose a rectilinear region into DISJOINT maximal rectangles (port of
    foundation_geom.js decomposeRects). `coord_boxes` supplies candidate edge
    coordinates; `keep(cx,cy)` decides whether a compressed cell is in the region.
    Used for BOTH the beam ring (keep = inside the beam-box union) and the frost
    skirt (keep = outer band, not inner band, exterior).

    Coordinate compression makes cell edges land exactly on real boundaries
    (exact dims); a tolerance-dedupe (snap) collapses float-noise duplicate edges
    from corner overlaps (else zero-area sliver boxes); a greedy
    horizontal-then-vertical merge yields the disjoint maximal-rectangle cover."""
    if not coord_boxes:
        return []
    snap = 1e-3  # mm — far below any real dim, far above float noise

    def dedup(vals):
        out = []
        for v in vals:
            if not out or v - out[-1] > snap:
                out.append(v)
        return out

    xs_all, ys_all = [], []
    for b in coord_boxes:
        xs_all.append(b["x0"]); xs_all.append(b["x1"])
        ys_all.append(b["y0"]); ys_all.append(b["y1"])
    xs = dedup(sorted(xs_all))
    ys = dedup(sorted(ys_all))

    # one unit rect per kept cell, row-major (ascending y, then x)
    cells = []
    for j in range(len(ys) - 1):
        y0, y1 = ys[j], ys[j + 1]
        cy = (y0 + y1) / 2
        for i in range(len(xs) - 1):
            x0, x1 = xs[i], xs[i + 1]
            cx = (x0 + x1) / 2
            if keep(cx, cy):
                cells.append({"x_mm": x0, "y_mm": y0, "w_mm": x1 - x0, "h_mm": y1 - y0})

    # horizontal merge: stitch contiguous same-row, same-height cells
    hmerged = []
    for c in cells:
        last = hmerged[-1] if hmerged else None
        if (last and abs(last["y_mm"] - c["y_mm"]) < MERGE_TOL
                and abs(last["h_mm"] - c["h_mm"]) < MERGE_TOL
                and abs((last["x_mm"] + last["w_mm"]) - c["x_mm"]) < MERGE_TOL):
            last["w_mm"] += c["w_mm"]
        else:
            hmerged.append(dict(c))
    # vertical merge: stack equal x+w rows (reuse the slab merger)
    return _merge_slab_rects(hmerged)


def silhouette_for_walls(walls, cell_mm=REGION_CELL_MM):
    """Build the silhouette dict foundation_solids expects from a list of L1
    wall dicts (each with x_mm,y_mm,width_mm,depth_mm,direction,id). Runs the
    region flood-fill for the slab rects and the outside-face probe."""
    region = compute_region(walls, cell_mm)
    return {
        "rects": region["rects"],
        "walls": [{"id": w["id"], "x_mm": w["x_mm"], "y_mm": w["y_mm"],
                   "width_mm": w["width_mm"], "depth_mm": w["depth_mm"],
                   "direction": _wall_dir(w)} for w in walls],
        "contains_point": region["contains_point"],
        "cell_mm": region["cells"]["cell_mm"] if region["cells"] else None,
    }
