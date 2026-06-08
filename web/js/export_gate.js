// =====================================================
// EXPORT GATE — PURE export-scope predicates. No DOM, no three.js. Shared by the
// export UI (ui.js), the FreeCAD export warn-gate, and the framing-pack labels on
// fab/summary so every exporter judges completeness from one place. (CAD-AUD-008)
// =====================================================
import { doc, ui } from './state.js';
import { regionForLevel } from './region.js';

// FreeCAD "house" export readiness: the user must have advanced to/through the
// Foundation trade AND a foundation entity must exist. Otherwise an emitted
// house.FCStd is framing-only, not a full house — the caller should warn first.
// (1 = index of 'foundation' in TRADES; kept literal to stay three.js-free.)
const FOUNDATION_TRADE_INDEX = 1;
export function houseExportReady() {
  const hasFoundation = doc.entities.some(e => e.kind === 'foundation');
  return ui.reachedTrade >= FOUNDATION_TRADE_INDEX && hasFoundation;
}

// Is the framing shell a closed silhouette for every required story? Drives both
// the framing-done trade gate and the "shell not enclosed" warning on the
// framing-only fab/summary packs.
export function shellEnclosed() {
  const levels = [...new Set(doc.entities.filter(e => e.kind === 'wall').map(e => e.level || 'L1'))];
  // A 2-story project needs an enclosed Story 2 too, not just Story 1.
  if (doc.project.stories === 2 && !levels.includes('L2')) levels.push('L2');
  if (!levels.length) return false;
  return levels.every(l => regionForLevel(l).isEnclosed);
}
