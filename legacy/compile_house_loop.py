import os
import re
import sys
import xml.etree.ElementTree as ET

import FreeCAD as App
import Part  # noqa: F401

SVG_FILE = 'house1meta.svg'
CAD_LIBRARY = 'cad_library'
OUT_FILE = 'house.FCStd'
SVG_NS = {'svg': 'http://www.w3.org/2000/svg'}
ICON_HALF = 32.0


def parse_transform(transform: str):
    """Return (center_x, center_y, rotation_deg)."""
    center_x = center_y = None
    rot = 0.0

    if not transform:
        return None, None, 0.0

    m_t = re.search(r'translate\(\s*([\-\d.]+)(?:[ ,]+([\-\d.]+))?\s*\)', transform)
    if m_t:
        tx = float(m_t.group(1))
        ty = float(m_t.group(2) or 0.0)
        center_x = tx + ICON_HALF
        center_y = ty + ICON_HALF

    m_r = re.search(r'rotate\(\s*([\-\d.]+)(?:[ ,]+([\-\d.]+)[ ,]+([\-\d.]+))?\s*\)', transform)
    if m_r:
        rot = float(m_r.group(1)) % 360.0
        if m_r.group(2) is not None and center_x is None:
            center_x = float(m_r.group(2))
            center_y = float(m_r.group(3))

    return center_x, center_y, rot


def find_shape_object(doc):
    for obj in doc.Objects:
        if hasattr(obj, 'Shape'):
            try:
                if not obj.Shape.isNull():
                    return obj
            except Exception:
                pass
    return None


def rotated_shape(shape, rot_deg):
    shp = shape.copy()
    shp.rotate(App.Vector(0, 0, 0), App.Vector(0, 0, 1), rot_deg)
    return shp


def align_bbox_min(shape, target_x, target_y, target_z=0.0):
    bb = shape.BoundBox
    dx = target_x - bb.XMin
    dy = target_y - bb.YMin
    dz = target_z - bb.ZMin
    moved = shape.copy()
    moved.translate(App.Vector(dx, dy, dz))
    return moved


def cluster_two(values):
    vals = sorted(values)
    if len(vals) < 2:
        return vals[0], vals[0]
    # largest gap split
    gaps = [(vals[i+1] - vals[i], i) for i in range(len(vals)-1)]
    _, idx = max(gaps, key=lambda t: t[0])
    left = vals[:idx+1]
    right = vals[idx+1:]
    return sum(left)/len(left), sum(right)/len(right)


def main():
    if not os.path.exists(SVG_FILE):
        raise FileNotFoundError(f'Missing SVG file: {SVG_FILE}')
    if not os.path.isdir(CAD_LIBRARY):
        raise FileNotFoundError(f'Missing CAD library directory: {CAD_LIBRARY}')

    root = ET.parse(SVG_FILE).getroot()
    instances = []

    for g in root.findall('.//svg:g', SVG_NS):
        module = g.attrib.get('data-module')
        if not module:
            continue
        cx, cy, rot = parse_transform(g.attrib.get('transform', ''))
        if cx is None or cy is None:
            print(f'SKIP: could not parse transform for {g.attrib.get("id")}', file=sys.stderr)
            continue
        instances.append({
            'id': g.attrib.get('id', 'unnamed'),
            'module': module,
            'cx': cx,
            'cy': cy,
            'rot': rot,
        })

    if not instances:
        raise RuntimeError('No wall instances found in SVG')

    # Normalize to NW icon-graph origin for reasoning only.
    min_cx = min(i['cx'] for i in instances)
    min_cy = min(i['cy'] for i in instances)
    for i in instances:
        i['gx'] = i['cx'] - min_cx
        i['gy'] = i['cy'] - min_cy
        i['is_horizontal'] = i['rot'] in (0.0, 180.0)
        i['is_vertical'] = i['rot'] in (90.0, 270.0)

    horizontals = [i for i in instances if i['is_horizontal']]
    verticals = [i for i in instances if i['is_vertical']]
    if len(horizontals) < 2 or len(verticals) < 2:
        raise RuntimeError('Expected both horizontal and vertical wall groups')

    north_y, south_y = cluster_two([i['gy'] for i in horizontals])
    west_x, east_x = cluster_two([i['gx'] for i in verticals])
    if north_y > south_y:
        north_y, south_y = south_y, north_y
    if west_x > east_x:
        west_x, east_x = east_x, west_x

    for i in horizontals:
        i['run'] = 'north' if abs(i['gy'] - north_y) <= abs(i['gy'] - south_y) else 'south'
    for i in verticals:
        i['run'] = 'west' if abs(i['gx'] - west_x) <= abs(i['gx'] - east_x) else 'east'

    north_run = sorted([i for i in instances if i['run'] == 'north'], key=lambda k: k['gx'])
    south_run = sorted([i for i in instances if i['run'] == 'south'], key=lambda k: k['gx'])
    west_run = sorted([i for i in instances if i['run'] == 'west'], key=lambda k: k['gy'])
    east_run = sorted([i for i in instances if i['run'] == 'east'], key=lambda k: k['gy'])

    print('Parsed runs:')
    print('  north:', [i['id'] for i in north_run])
    print('  south:', [i['id'] for i in south_run])
    print('  west :', [i['id'] for i in west_run])
    print('  east :', [i['id'] for i in east_run])

    # Load all module shapes once and keep canonical rotated extents.
    shape_cache = {}
    def get_shape(module):
        if module in shape_cache:
            return shape_cache[module]
        cad_path = os.path.join(CAD_LIBRARY, module + '.FCStd')
        if not os.path.exists(cad_path):
            raise FileNotFoundError(f'Missing CAD file: {cad_path}')
        doc = App.openDocument(cad_path)
        try:
            obj = find_shape_object(doc)
            if obj is None:
                raise RuntimeError(f'No shape found in {cad_path}')
            shape_cache[module] = obj.Shape.copy()
        finally:
            App.closeDocument(doc.Name)
        return shape_cache[module]

    # Determine real run dimensions from actual rotated CAD shapes.
    def rotated_bb(module, rot):
        shp = rotated_shape(get_shape(module), rot)
        return shp.BoundBox, shp

    north_dims = [rotated_bb(i['module'], 0.0)[0] for i in north_run]
    south_dims = [rotated_bb(i['module'], 180.0)[0] for i in south_run]
    west_dims = [rotated_bb(i['module'], 270.0)[0] for i in west_run]
    east_dims = [rotated_bb(i['module'], 90.0)[0] for i in east_run]

    north_width = sum(bb.XLength for bb in north_dims)
    south_width = sum(bb.XLength for bb in south_dims)
    west_height = sum(bb.YLength for bb in west_dims)
    east_height = sum(bb.YLength for bb in east_dims)

    north_thickness = max((bb.YLength for bb in north_dims), default=0.0)
    south_thickness = max((bb.YLength for bb in south_dims), default=0.0)
    west_thickness = max((bb.XLength for bb in west_dims), default=0.0)
    east_thickness = max((bb.XLength for bb in east_dims), default=0.0)

    shell_width = max(north_width, south_width)
    shell_inner_height = max(west_height, east_height)
    shell_height = north_thickness + shell_inner_height + south_thickness

    print(f'shell_width={shell_width}')
    print(f'shell_height={shell_height}')
    print(f'north_thickness={north_thickness}, south_thickness={south_thickness}')
    print(f'west_thickness={west_thickness}, east_thickness={east_thickness}')

    assembly_doc = App.newDocument('HouseAssembly')
    count = 0

    # Place runs in CAD using NW outer corner as (0,0,0), with +Y downward.
    # North run: left to right at top.
    x_cursor = 0.0
    for i in north_run:
        shp = rotated_shape(get_shape(i['module']), 0.0)
        bb = shp.BoundBox
        placed = align_bbox_min(shp, x_cursor, 0.0, 0.0)
        obj = assembly_doc.addObject('Part::Feature', f"{i['module']}_{count:02d}")
        obj.Shape = placed
        count += 1
        x_cursor += bb.XLength
        print(f"Placed {i['id']} north at x={bb.XMin if False else x_cursor-bb.XLength}, y=0 rot=0")

    # South run: left to right at bottom outer edge.
    x_cursor = 0.0
    south_y_cad = north_thickness + shell_inner_height
    for i in south_run:
        shp = rotated_shape(get_shape(i['module']), 180.0)
        bb = shp.BoundBox
        placed = align_bbox_min(shp, x_cursor, south_y_cad, 0.0)
        obj = assembly_doc.addObject('Part::Feature', f"{i['module']}_{count:02d}")
        obj.Shape = placed
        count += 1
        x_cursor += bb.XLength
        print(f"Placed {i['id']} south at x={x_cursor-bb.XLength}, y={south_y_cad} rot=180")

    # West run: top to bottom, inset below north wall.
    y_cursor = north_thickness
    for i in west_run:
        shp = rotated_shape(get_shape(i['module']), 270.0)
        bb = shp.BoundBox
        placed = align_bbox_min(shp, 0.0, y_cursor, 0.0)
        obj = assembly_doc.addObject('Part::Feature', f"{i['module']}_{count:02d}")
        obj.Shape = placed
        count += 1
        y_cursor += bb.YLength
        print(f"Placed {i['id']} west at x=0, y={y_cursor-bb.YLength} rot=270")

    # East run: top to bottom, inset below north wall.
    y_cursor = north_thickness
    east_x_cad = shell_width - east_thickness
    for i in east_run:
        shp = rotated_shape(get_shape(i['module']), 90.0)
        bb = shp.BoundBox
        placed = align_bbox_min(shp, east_x_cad, y_cursor, 0.0)
        obj = assembly_doc.addObject('Part::Feature', f"{i['module']}_{count:02d}")
        obj.Shape = placed
        count += 1
        y_cursor += bb.YLength
        print(f"Placed {i['id']} east at x={east_x_cad}, y={y_cursor-bb.YLength} rot=90")

    assembly_doc.recompute()
    out_abs = os.path.abspath(OUT_FILE)
    assembly_doc.saveAs(out_abs)
    print(f'Saved assembly to {out_abs}')
    print(f'Placed {count} wall instances')


if __name__ == '__main__':
    main()
