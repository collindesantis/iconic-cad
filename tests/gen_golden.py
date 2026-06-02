#!/usr/bin/env python3
"""
Generate tests/fixtures/golden.json from the Python/FreeCAD compiler.

Run via freecadcmd from the repo root:
    freecadcmd -c "exec(open('tests/gen_golden.py').read())"

Reads each layout_*.json fixture, calls create_blocking for every connection,
records each blocking shape's bounding box (dx, dy, dz, tx, ty, tz) and volume.
The parity test (tests/parity.mjs) asserts the JS output matches this golden.
"""
import json
import os
import sys

REPO_ROOT = os.getcwd()
sys.path.insert(0, REPO_ROOT)

import FreeCAD as App  # noqa: F401 — required in FreeCAD context
import Part            # noqa: F401

from compile_from_json import (
    create_blocking, load_yaml_specs,
)

FIXTURE_DIR = os.path.join(REPO_ROOT, 'tests', 'fixtures')
OUT_PATH = os.path.join(REPO_ROOT, 'tests', 'fixtures', 'golden.json')

FIXTURES = ['layout_c1.json', 'layout_c2.json', 'layout_t.json', 'layout_multi.json']

yaml_specs = load_yaml_specs()
golden = {}

for fname in FIXTURES:
    path = os.path.join(FIXTURE_DIR, fname)
    with open(path) as f:
        data = json.load(f)

    entities = data.get('entities') or data.get('modules') or []
    modules_by_id = {m['id']: m for m in entities}
    min_x = min(m['x_mm'] for m in entities)
    min_y = min(m['y_mm'] for m in entities)

    key_prefix = fname.replace('.json', '')
    piece_idx = 0

    for m in entities:
        for conn in m.get('connections', []):
            shapes = create_blocking(conn, None, modules_by_id, yaml_specs, min_x, min_y)
            for shape in shapes:
                bb = shape.BoundBox
                golden[f'{key_prefix}/{piece_idx}'] = {
                    'dx': round(bb.XLength, 6),
                    'dy': round(bb.YLength, 6),
                    'dz': round(bb.ZLength, 6),
                    'tx': round(bb.XMin, 6),
                    'ty': round(bb.YMin, 6),
                    'tz': round(bb.ZMin, 6),
                    'volume': round(shape.Volume, 2),
                }
                piece_idx += 1

    print(f'{fname}: {piece_idx} blocking pieces')

with open(OUT_PATH, 'w') as f:
    json.dump(golden, f, indent=2)
print(f'\nWrote {OUT_PATH} ({len(golden)} pieces total)')
