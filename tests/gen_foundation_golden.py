#!/usr/bin/env python3
"""
Generate tests/fixtures/foundation_golden.json from the Python foundation
derivation (foundation_lib.py).

Run from repo root with plain python3 (NO FreeCAD needed — the derivation is
pure):
    python3 tests/gen_foundation_golden.py

Reads each foundation_*.json fixture, runs the region flood-fill + foundation
piece derivation, and records the ordered piece list (label, kind, dims,
center). The parity test (tests/foundation_parity.mjs) asserts the JS
foundationSolids output matches this golden — proving the JS<->Python pair
(region + foundation) agree on a rectangular AND an L-shaped silhouette.
"""
import json
import os
import sys

REPO_ROOT = os.getcwd()
sys.path.insert(0, REPO_ROOT)

from foundation_lib import foundation_solids, silhouette_for_walls

FIXTURE_DIR = os.path.join(REPO_ROOT, 'tests', 'fixtures')
OUT_PATH = os.path.join(FIXTURE_DIR, 'foundation_golden.json')

FIXTURES = ['foundation_rect', 'foundation_L']

# Fixed foundation params (foundation.js autogen defaults).
PARAMS = {
    'slab_thickness_mm': 101.6,
    'beam_w_mm': 304.8,
    'beam_d_mm': 457.2,
    'skirt_depth_mm': 750.0,
    'skirt_thickness_mm': 50.8,
}

golden = {}
for name in FIXTURES:
    with open(os.path.join(FIXTURE_DIR, name + '.json')) as f:
        data = json.load(f)
    walls = [e for e in (data.get('entities') or data.get('modules') or [])
             if e.get('kind') == 'wall' and e.get('level', 'L1') == 'L1']
    silhouette = silhouette_for_walls(walls)
    pieces = foundation_solids(PARAMS, silhouette)
    golden[name] = {'params': PARAMS, 'pieces': pieces}
    print(f'{name}: {len(pieces)} pieces ({len(silhouette["rects"])} slab rects)')

with open(OUT_PATH, 'w') as f:
    json.dump(golden, f, indent=2)
print(f'\nWrote {OUT_PATH}')
