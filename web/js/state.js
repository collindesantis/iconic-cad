// =====================================================
// STATE — the document model + transient view/UI state.
// Data only; no behaviour, no DOM, no imports of other app modules.
// =====================================================
import { ZOOM_DEFAULT } from './constants.js';

// ---- The document ---------------------------------------------------------
// `doc` is the single source of truth and the thing we serialise. Entities
// carry ORTHOGONAL attributes (level + layer + side), so the UI can later view
// the same data by story, by trade, or by room without restructuring it.
//
// Entity shape (in-memory):
//   { id, kind:'wall'|'iwall', mod:<module ref>, dir, x_mm, y_mm,
//     level:<levelId>, layer:<layerId>, owner:<initials|null>, connections:[], props:{} }
// `owner` is the claim: a builder's name/initials set in the design file (no
// claim UI yet). Absent/null = unclaimed. Round-tripped through io.js.
// On export `mod` is written as its module id string.
export const doc = {
  version: 2,
  units: 'mm',

  // Stories/levels. Single default level for now; full multi-level editing is
  // the next punch — the slot exists so entities already carry a `level`.
  levels: [{ id: 'L1', name: 'Level 1', z_mm: 0 }],
  activeLevel: 'L1',

  // Trade layers. Only `structural` is authored today; the rest are reserved
  // slots so adding a trade is a feature, not a model rewrite.
  layers: [
    { id: 'structural', name: 'Structural', color: '#4fc3f7', visible: true },
    { id: 'foundation', name: 'Foundation', color: '#a1887f', visible: true },
    { id: 'electrical', name: 'Electrical', color: '#ffd54f', visible: true },
    { id: 'plumbing',   name: 'Plumbing',   color: '#80cbc4', visible: true },
    { id: 'hvac',       name: 'HVAC',        color: '#81c784', visible: true },
    { id: 'solar',      name: 'Solar / PV',  color: '#ff8a65', visible: true },
  ],
  activeLayer: 'structural',

  entities: [], // was `placed`
};

// ---- View (camera over the 2D plan) --------------------------------------
export const view = {
  zoom: ZOOM_DEFAULT, // PX_PER_MM
  offsetX: 400,
  offsetY: 300,
};

// ---- Transient UI state (not serialised) ---------------------------------
export const ui = {
  dragState: null,     // { mod, dir }
  snapTarget: null,    // { x_mm, y_mm, connection? } or null
  eraseMode: false,
  mouseCanvasX: 0,
  mouseCanvasY: 0,
  blockingMode: 'C',   // 'C' or 'T'
  isPanning: false,
  panStartX: 0,
  panStartY: 0,
  nextId: 0,
  activeTab: '2d',     // '2d' | '3d'
  placeDir: 'north',   // direction applied to a module picked in iso-library mode
  libMode: 'iso',      // 'iso' (one thumbnail + NESW selector) | 'icons' (4 per module)
};

// ---- Undo / redo ----------------------------------------------------------
export const history = []; // { type:'place'|'erase', module, index? }
export const future = [];
