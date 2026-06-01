// =====================================================
// APP — orchestration seam. Splitting "model changed" from "view changed" is
// the core lag fix: the expensive work (3D rebuild + BOM) runs only when the
// document actually changes, never on a plain mousemove / pan / zoom.
// =====================================================
import { draw2d } from './render2d.js';
import { rebuildModel3D } from './render3d.js';
import { updateBOM } from './bom.js';

// Document mutated (place / erase / undo / redo / clear / load).
export function markModelChanged() {
  updateBOM();
  rebuildModel3D();
  draw2d();
}

// Only transient/view state changed (drag, pan, zoom, rotate, blocking mode).
export function requestDraw() {
  draw2d();
}
