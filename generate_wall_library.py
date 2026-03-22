#!/usr/bin/env python3
"""
Wall module generator with port markers for port-based assembly.

Each wall module is built in a canonical "south-facing" pose:
  - Width along +X, depth (studs) along +Y, height along +Z
  - OSB sheathing on the south face (Y = -osb_thickness to 0)
  - Stud frame from Y=0 to Y=stud_depth
  - Bottom plate at Z=0, top plate at Z = height - plate_thickness

Port markers are small cubes placed at ground level (Z=0) on the
stud-frame face (Y=0) at each end of the wall:
  - port_left:  center at X=0,           Y=0, Z=0
  - port_right: center at X=wall_width,  Y=0, Z=0

The compiler reads these port positions to snap walls together.
Ports sit at Y=0 (inner stud face), so when two walls connect
in a straight run, their ports coincide exactly. Corner inset
offsets are computed by the compiler from wall thickness.

Usage (must run via freecadcmd):
    freecadcmd -c "import sys; sys.argv=['generate_wall_library.py','wall_instances.yaml']; exec(open('generate_wall_library.py').read())"
"""

from pathlib import Path
import sys
import yaml
import FreeCAD
import Part

OUTPUT_DIR = Path("cad_library")
IN_TO_MM = 25.4
PORT_SIZE = 1.0  # mm, tiny marker cube


def load_yaml(path):
    with open(path, "r") as f:
        return yaml.safe_load(f)


def nominal_to_actual(nominal):
    """Return (thickness_in, depth_in) for nominal lumber size."""
    table = {
        "2x2": (1.5, 1.5),
        "2x3": (1.5, 2.5),
        "2x4": (1.5, 3.5),
        "2x6": (1.5, 5.5),
        "2x8": (1.5, 7.25),
        "2x10": (1.5, 9.25),
        "2x12": (1.5, 11.25),
    }
    return table[nominal]


def in_mm(v):
    return v * IN_TO_MM


def ft_in(v):
    return v * 12.0


def stud_positions(width_in, stud_thick_in, spacing_oc_in):
    """Compute stud X positions (in inches) including end studs."""
    pos = [0.0]
    right_edge = width_in - stud_thick_in
    cur = spacing_oc_in
    while cur + stud_thick_in <= right_edge:
        pos.append(cur)
        cur += spacing_oc_in
    if pos[-1] != right_edge:
        pos.append(right_edge)
    return pos


def build_wall(instance):
    """Build a wall module with port markers. Returns FreeCAD Document."""
    iid = instance["id"]
    p = instance["parameters"]

    width_in = ft_in(p["nominal_width_ft"])
    height_in = ft_in(p["nominal_height_ft"])
    stud_thick_in, stud_depth_in = nominal_to_actual(p["stud_lumber_nominal"])
    spacing_in = p["stud_spacing_oc_in"]
    osb_thick_in = p["osb_thickness_in"]

    # Convert everything to mm
    W = in_mm(width_in)
    H = in_mm(height_in)
    st = in_mm(stud_thick_in)
    sd = in_mm(stud_depth_in)
    osb = in_mm(osb_thick_in)
    plate_t = st  # plate thickness = stud thickness

    stud_len = H - 2.0 * plate_t

    shapes = []

    # --- Bottom plate: X=0..W, Y=0..sd, Z=0..plate_t ---
    shapes.append(Part.makeBox(W, sd, plate_t))

    # --- Top plate: same footprint, at top ---
    top = Part.makeBox(W, sd, plate_t)
    top.translate(FreeCAD.Vector(0, 0, H - plate_t))
    shapes.append(top)

    # --- Studs ---
    for x_in in stud_positions(width_in, stud_thick_in, spacing_in):
        s = Part.makeBox(st, sd, stud_len)
        s.translate(FreeCAD.Vector(in_mm(x_in), 0, plate_t))
        shapes.append(s)

    # --- OSB sheathing: south face, Y = -osb..0 ---
    osb_panel = Part.makeBox(W, osb, H)
    osb_panel.translate(FreeCAD.Vector(0, -osb, 0))
    shapes.append(osb_panel)

    # --- Compound ---
    wall = Part.makeCompound(shapes)

    doc = FreeCAD.newDocument(iid)
    obj = doc.addObject("Part::Feature", "wall_module")
    obj.Shape = wall

    # --- Port markers ---
    # Ports at the outer corners (OSB face, Y = -osb) so that when
    # two walls snap together at a corner, they meet at the building edge.
    half = PORT_SIZE / 2.0
    port_y = -osb  # outer face (OSB surface)

    # port_left: left (X=0) end, outer face, ground level
    pl = Part.makeBox(PORT_SIZE, PORT_SIZE, PORT_SIZE)
    pl.translate(FreeCAD.Vector(-half, port_y - half, -half))
    pl_obj = doc.addObject("Part::Feature", "port_left")
    pl_obj.Shape = pl

    # port_right: right (X=W) end, outer face, ground level
    pr = Part.makeBox(PORT_SIZE, PORT_SIZE, PORT_SIZE)
    pr.translate(FreeCAD.Vector(W - half, port_y - half, -half))
    pr_obj = doc.addObject("Part::Feature", "port_right")
    pr_obj.Shape = pr

    doc.recompute()
    return doc


def main():
    if len(sys.argv) != 2:
        print("Usage: generate_wall_library.py instances.yaml")
        sys.exit(1)

    data = load_yaml(sys.argv[1])
    OUTPUT_DIR.mkdir(exist_ok=True)

    for inst in data["instances"]:
        iid = inst["id"]
        print(f"Generating {iid}...")
        doc = build_wall(inst)
        out = OUTPUT_DIR / f"{iid}.FCStd"
        out.parent.mkdir(exist_ok=True)
        doc.saveAs(str(out))
        print(f"  Saved {out}")

        # Print port positions for verification
        for o in doc.Objects:
            if o.Name.startswith("port_"):
                bb = o.Shape.BoundBox
                cx = (bb.XMin + bb.XMax) / 2.0
                cy = (bb.YMin + bb.YMax) / 2.0
                cz = (bb.ZMin + bb.ZMax) / 2.0
                print(f"  {o.Name}: center=({cx:.1f}, {cy:.1f}, {cz:.1f})")

    print(f"\nGenerated {len(data['instances'])} modules in {OUTPUT_DIR}/")


if __name__ == "__main__":
    main()
