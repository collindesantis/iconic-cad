#!/usr/bin/env python3
"""
Export an IFC4 model from a web-UI layout JSON.

IFC is the open multi-trade interchange format (IfcProject -> IfcSite ->
IfcBuilding -> IfcBuildingStorey -> IfcWall). This reads the same JSON the
web UI exports and emits one IfcWall per module, grouped by level/storey, so
the model opens in any IFC viewer or hands off to a trade's software.

Today it exports the structural walls (all that the model carries). As trade
layers (electrical, plumbing, ...) gain real entities, they map onto their own
IFC classes (IfcFlowSegment, IfcOutlet, ...) under the same storeys.

Usage:
    python3 export_ifc.py layout.json [out.ifc]

Requires: ifcopenshell  (pip install ifcopenshell)
"""
import json
import sys

import numpy as np
import ifcopenshell
from ifcopenshell.api import run

IN_TO_MM = 25.4
HORIZONTAL = ("north", "south")


def wall_height_mm(module_id):
    """Wall height from the module id (matches the 3D builder's logic)."""
    if "4x9" in module_id:
        return 9 * 12 * IN_TO_MM
    if "4x10" in module_id:
        return 10 * 12 * IN_TO_MM
    if "8.5" in module_id:
        return 8.5 * 12 * IN_TO_MM
    return 8 * 12 * IN_TO_MM


def main(in_path, out_path):
    with open(in_path) as f:
        data = json.load(f)
    items = data.get("entities") or data.get("modules") or []
    levels = {lv["id"]: lv for lv in data.get("levels", [])}

    model = run("project.create_file", version="IFC4")
    project = run("root.create_entity", model, ifc_class="IfcProject", name="Iconic CAD House")

    # Length unit = millimetre, so JSON mm values pass through unchanged.
    mm = run("unit.add_si_unit", model, unit_type="LENGTHUNIT", prefix="MILLI")
    run("unit.assign_unit", model, units=[mm])

    model_ctx = run("context.add_context", model, context_type="Model")
    body = run("context.add_context", model, context_type="Model",
               context_identifier="Body", target_view="MODEL_VIEW", parent=model_ctx)

    site = run("root.create_entity", model, ifc_class="IfcSite", name="Site")
    building = run("root.create_entity", model, ifc_class="IfcBuilding", name="Building")
    run("aggregate.assign_object", model, products=[site], relating_object=project)
    run("aggregate.assign_object", model, products=[building], relating_object=site)

    # One storey per level (default a single Level 1).
    storeys = {}

    def storey_for(level_id):
        if level_id not in storeys:
            lv = levels.get(level_id, {})
            st = run("root.create_entity", model, ifc_class="IfcBuildingStorey",
                     name=lv.get("name", level_id or "Level 1"))
            run("aggregate.assign_object", model, products=[st], relating_object=building)
            storeys[level_id] = (st, lv.get("z_mm", 0))
        return storeys[level_id]

    n = 0
    for it in items:
        module_id = it.get("module", "wall")
        direction = it.get("direction", "north")
        x = float(it.get("x_mm", 0))
        y = float(it.get("y_mm", 0))
        w = float(it.get("width_mm", 1219.2))
        depth = float(it.get("depth_mm", 150.8125))
        height = wall_height_mm(module_id)

        storey, z = storey_for(it.get("level", "L1"))

        wall = run("root.create_entity", model, ifc_class="IfcWall",
                   name=f"{module_id} [{it.get('id', n)}]")
        run("spatial.assign_container", model, products=[wall], relating_structure=storey)

        rep = run("geometry.add_wall_representation", model, context=body,
                  length=w, height=height, thickness=depth)
        run("geometry.assign_representation", model, product=wall, representation=rep)

        # Wall geometry runs along local +X; rotate 90° for vertical (E/W) runs.
        m = np.eye(4)
        if direction not in HORIZONTAL:
            m[0, 0], m[0, 1] = 0.0, -1.0
            m[1, 0], m[1, 1] = 1.0, 0.0
        m[0, 3], m[1, 3], m[2, 3] = x, y, z
        run("geometry.edit_object_placement", model, product=wall, matrix=m, is_si=False)
        n += 1

    model.write(out_path)
    print(f"Wrote {out_path}: {n} walls, {len(storeys)} storey(s)")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    src = sys.argv[1]
    dst = sys.argv[2] if len(sys.argv) > 2 else src.rsplit(".", 1)[0] + ".ifc"
    main(src, dst)
