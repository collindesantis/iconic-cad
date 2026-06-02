"""
Unit tests for FreeCAD-free geometry functions in compile_from_json.

These test the pure math — stud layout decisions, canonical contact
coordinate conversion, and T-junction bracketing — without requiring FreeCAD.

Run: python -m pytest tests/test_blocking_math.py -v
  or: python -m unittest tests.test_blocking_math
"""
import unittest
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from compile_from_json import (
    stud_positions,
    get_canonical_contact,
    stud_centers_assembled,
    get_frame_depth_range,
    IN_TO_MM,
)

W4 = 4 * 12      # 48 inches
W3 = 3 * 12      # 36 inches


class TestStudPositions(unittest.TestCase):
    def test_16oc_4ft(self):
        pos = stud_positions(W4, 1.5, 16)
        self.assertEqual(pos[0], 0.0)
        self.assertEqual(pos[-1], W4 - 1.5)   # right edge stud
        # Interior studs at 16, 32 (33.5 <= 46.5, so 32 in)
        self.assertIn(16, pos)
        self.assertIn(32, pos)

    def test_24oc_4ft(self):
        pos = stud_positions(W4, 1.5, 24)
        self.assertEqual(pos[0], 0.0)
        self.assertEqual(pos[-1], W4 - 1.5)
        self.assertIn(24, pos)
        # 48 would need 48+1.5=49.5 <= 46.5 → False, so only one interior stud
        self.assertEqual(len(pos), 3)   # [0, 24, 46.5]

    def test_single_center(self):
        # iwall_3x8.5_2x4_single uses spacing=18
        pos = stud_positions(W3, 1.5, 18)
        self.assertEqual(pos[0], 0.0)
        self.assertEqual(pos[-1], W3 - 1.5)
        # 18+1.5=19.5 <= 34.5 → True, so stud at 18; 36+1.5 > 34.5 → stop
        self.assertIn(18, pos)

    def test_no_duplicate_end(self):
        # If spacing lands exactly on right edge, no duplicate
        # 2 ft wall, 1.5in stud, 24oc: only end studs
        pos = stud_positions(24, 1.5, 24)
        self.assertEqual(len(pos), 2)   # [0, 22.5]


class TestGetCanonicalContact(unittest.TestCase):
    """Canonical contact is the position along the wall's own run axis."""
    W = 48 * IN_TO_MM

    def test_north(self):
        # north: canonical_x = contact_x - wall_x
        c = get_canonical_contact('north', self.W, 200, 0, 100, 0)
        self.assertAlmostEqual(c, 100.0)

    def test_south(self):
        # south: canonical_x = width - (contact_x - wall_x)
        c = get_canonical_contact('south', self.W, 200, 0, 100, 0)
        self.assertAlmostEqual(c, self.W - 100.0)

    def test_east(self):
        # east: canonical_x = contact_y - wall_y
        c = get_canonical_contact('east', self.W, 0, 200, 0, 100)
        self.assertAlmostEqual(c, 100.0)

    def test_west(self):
        # west: canonical_x = width - (contact_y - wall_y)
        c = get_canonical_contact('west', self.W, 0, 200, 0, 100)
        self.assertAlmostEqual(c, self.W - 100.0)


class TestStudCentersAssembled(unittest.TestCase):
    """Stud centers in global assembled coordinates."""
    def _centers(self, direction, tx=0, ty=0, spacing=16):
        studs = stud_positions(W4, 1.5, spacing)
        w = W4 * IN_TO_MM
        return stud_centers_assembled(direction, tx, ty, w, studs, 1.5)

    def test_north_no_offset(self):
        ctrs = self._centers('north')
        # First stud center = (0 + 0.75) * 25.4 = 19.05
        self.assertAlmostEqual(ctrs[0], 19.05)

    def test_south_reversed(self):
        # South mirrors north: north[i] + south[i] == width for each stud
        ctrs_n = self._centers('north')
        ctrs_s = self._centers('south')
        w = W4 * IN_TO_MM
        for cn, cs in zip(ctrs_n, ctrs_s):
            self.assertAlmostEqual(cn + cs, w, places=4)

    def test_east_uses_ty(self):
        ctrs = self._centers('east', ty=100)
        self.assertAlmostEqual(ctrs[0], 100 + 19.05)

    def test_west_uses_ty(self):
        ctrs = self._centers('west', ty=100)
        w = W4 * IN_TO_MM
        self.assertAlmostEqual(ctrs[0], 100 + w - 19.05)


class TestGetFrameDepthRange(unittest.TestCase):
    """Frame depth range for each direction."""
    SD = 5.5 * IN_TO_MM
    OSB = 0.4375 * IN_TO_MM

    def test_north(self):
        lo, hi, axis = get_frame_depth_range('north', 0, 0, self.SD, self.OSB)
        self.assertAlmostEqual(lo, self.OSB)
        self.assertAlmostEqual(hi, self.OSB + self.SD)
        self.assertEqual(axis, 'y')

    def test_south(self):
        lo, hi, axis = get_frame_depth_range('south', 0, 0, self.SD, self.OSB)
        self.assertAlmostEqual(lo, 0)
        self.assertAlmostEqual(hi, self.SD)
        self.assertEqual(axis, 'y')

    def test_east(self):
        lo, hi, axis = get_frame_depth_range('east', 0, 0, self.SD, self.OSB)
        self.assertAlmostEqual(lo, 0)
        self.assertAlmostEqual(hi, self.SD)
        self.assertEqual(axis, 'x')

    def test_west(self):
        lo, hi, axis = get_frame_depth_range('west', 0, 0, self.SD, self.OSB)
        self.assertAlmostEqual(lo, self.OSB)
        self.assertAlmostEqual(hi, self.OSB + self.SD)
        self.assertEqual(axis, 'x')


class TestTJunctionBracketing(unittest.TestCase):
    """T-junction stud bracketing: the pair of studs flanking the contact."""
    def _bracket(self, canonical_x_in, width_in=48, st_in=1.5, spacing=16):
        studs = stud_positions(width_in, st_in, spacing)
        left_end = 0
        right_start = width_in - st_in
        for s in studs:
            if s + st_in <= canonical_x_in:
                left_end = s + st_in
            if s >= canonical_x_in:
                right_start = s
                break
        return left_end, right_start

    def test_between_first_and_second_stud(self):
        lo, hi = self._bracket(24.0)    # 24" is between stud at 16 and stud at 32
        self.assertAlmostEqual(lo, 17.5)  # 16 + 1.5
        self.assertAlmostEqual(hi, 32.0)

    def test_at_left_edge(self):
        # contact at 0.5" is inside the end stud (0→1.5"); no stud's right edge ≤ 0.5"
        # so left_end stays 0 and the block spans from wall edge to first field stud
        lo, hi = self._bracket(0.5)
        self.assertAlmostEqual(lo, 0)
        self.assertAlmostEqual(hi, 16.0)  # first field stud starts at 16"

    def test_at_right_gap(self):
        lo, hi = self._bracket(40.0)    # between stud at 32 and right-edge stud at 46.5
        self.assertAlmostEqual(lo, 33.5)  # 32 + 1.5
        self.assertAlmostEqual(hi, 46.5)


if __name__ == '__main__':
    unittest.main()
