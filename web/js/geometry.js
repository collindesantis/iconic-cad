// =====================================================
// GEOMETRY — module bounding box + port positions after rotation.
// =====================================================

export function isHorizontal(dir) { return dir === 'north' || dir === 'south'; }

// After rotation, bbox dimensions
export function getModuleBBox(mod, dir) {
  if (isHorizontal(dir)) {
    return { w: mod.width_mm, h: mod.depth_mm };
  } else {
    return { w: mod.depth_mm, h: mod.width_mm };
  }
}

// Port positions relative to module origin (top-left of bbox).
// 4 corner ports — user chooses which corner to snap to.
// Straight runs: snap TL↔TR or BL↔BR (same edge alignment).
// Corners: snap corner-to-corner for flush perpendicular joints.
export function getPortPositions(mod, dir) {
  const bb = getModuleBBox(mod, dir);
  return [
    { x: 0,    y: 0,    label: 'TL' },
    { x: bb.w, y: 0,    label: 'TR' },
    { x: 0,    y: bb.h, label: 'BL' },
    { x: bb.w, y: bb.h, label: 'BR' },
  ];
}
