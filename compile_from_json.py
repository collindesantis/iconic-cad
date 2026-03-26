#!/usr/bin/env python3
"""
Compile a house from a JSON layout exported by the web UI.

The JSON already contains exact module positions in mm — no run
detection, port snapping, or corner math needed. Just load each
CAD shape, rotate, normalize, translate, and save.

Usage:
    freecadcmd -c "import sys; sys.argv=['compile_from_json.py','layout.json']; \
      exec(open('compile_from_json.py').read())"
"""

import json
import math
import os
import sys

import FreeCAD as App
import Part  # noqa: F401

CAD_LIBRARY = "cad_library"

# Same rotation mapping as compile_house.py (SVG Y-down → FreeCAD Y-up fix)
DIRECTION_TO_ROT = {"south": 180.0, "east": 90.0, "north": 0.0, "west": 270.0}


def find_cad_file(base_module):
    for f in os.listdir(CAD_LIBRARY):
        if f.startswith(base_module) and f.endswith(".FCStd"):
            return os.path.join(CAD_LIBRARY, f)
    raise FileNotFoundError(f"No CAD file for: {base_module}")


def load_shape(base_module, cache={}):
    if base_module in cache:
        return cache[base_module]
    path = find_cad_file(base_module)
    doc = App.openDocument(path)
    shape = None
    for obj in doc.Objects:
        if hasattr(obj, "Shape") and obj.Shape.Volume > 0:
            if "port" not in obj.Name.lower():
                shape = obj.Shape.copy()
                break
    App.closeDocument(doc.Name)
    if shape is None:
        raise RuntimeError(f"No shape in {path}")
    cache[base_module] = shape
    return shape


def prepare_shape(base_module, rot_deg):
    base = load_shape(base_module)
    shape = base.copy()
    shape.rotate(App.Vector(0, 0, 0), App.Vector(0, 0, 1), rot_deg)
    bb = shape.BoundBox
    shape.translate(App.Vector(-bb.XMin, -bb.YMin, -bb.ZMin))
    return shape


def main():
    if len(sys.argv) != 2:
        print("Usage: compile_from_json.py <layout.json>")
        sys.exit(1)

    json_path = sys.argv[1]
    with open(json_path) as f:
        data = json.load(f)

    modules = data["modules"]
    if not modules:
        print("No modules in layout")
        sys.exit(1)

    # Normalize positions so minimum is at origin
    min_x = min(m["x_mm"] for m in modules)
    min_y = min(m["y_mm"] for m in modules)

    doc = App.newDocument("HouseAssembly")

    for i, m in enumerate(modules):
        rot = DIRECTION_TO_ROT[m["direction"]]
        shape = prepare_shape(m["module"], rot)

        x = m["x_mm"] - min_x
        y = m["y_mm"] - min_y
        shape.translate(App.Vector(x, y, 0))

        name = f"wall_{i:02d}_{m['id']}"
        obj = doc.addObject("Part::Feature", name)
        obj.Shape = shape
        if obj.ViewObject:
            obj.ViewObject.Visibility = True

        print(f"Placed {name} ({m['direction']}) at ({x:.1f}, {y:.1f})")

    doc.recompute()
    out = os.path.splitext(json_path)[0] + ".FCStd"
    out_abs = os.path.abspath(out)
    doc.saveAs(out_abs)
    print(f"\nSaved {out_abs} ({len(modules)} walls)")


main()
