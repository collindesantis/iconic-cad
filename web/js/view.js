// =====================================================
// VIEW — mm <-> canvas-pixel conversion for the 2D plan.
// Pure functions over the shared view state (zoom).
// =====================================================
import { view } from './state.js';

export function mmToPx(mm) { return mm * view.zoom; }
export function pxToMm(px) { return px / view.zoom; }
