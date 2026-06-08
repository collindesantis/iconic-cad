// =====================================================
// IO — JSON export / save / load against the v2 document model.
// The exported JSON is the contract shared with the compiler and any future
// backend, so it carries the orthogonal attributes (level, layer) per entity.
// =====================================================
import { doc, ui, ensureLevel2 } from './state.js';
import { ALL_MODULES } from './constants.js';
import { markModelChanged } from './app.js';

function serialize(includeMeta) {
  const out = {
    version: doc.version,
    units: doc.units,
    levels: doc.levels,
    layers: doc.layers,
    project: doc.project, // write-once setup intent (options.js); see state.js

    entities: doc.entities.map(p => p.kind === 'foundation'
      // Foundation is a derived entity: it carries params, not a module ref.
      ? { id: p.id, kind: p.kind, layer: p.layer, level: p.level, params: p.params }
      : {
      id: p.id,
      kind: p.kind,
      module: p.mod.id,
      direction: p.dir,
      x_mm: Math.round(p.x_mm * 100) / 100,
      y_mm: Math.round(p.y_mm * 100) / 100,
      level: p.level,
      layer: p.layer,
      width_mm: p.mod.width_mm,
      depth_mm: p.mod.depth_mm,
      ...(p.owner ? { owner: p.owner } : {}),
      ...(p.connections && p.connections.length > 0 ? { connections: p.connections } : {}),
    }),
  };
  if (includeMeta) {
    out.metadata = { exported: new Date().toISOString(), count: doc.entities.length };
  }
  return out;
}

function download(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportJSON(filename = 'layout.json') { download(serialize(true), filename); }
export function saveLayout(filename = 'layout-save.json') { download(serialize(false), filename); }

export function loadLayout(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const data = JSON.parse(e.target.result);
    // Project setup intent. Older files lack `project` entirely; missing
    // sub-fields fall back individually so partial saves still open clean.
    // Defaults mirror state.js (single story, Zone 5 / Missouri).
    const dp = data.project || {};
    const dc = dp.climate || {};
    doc.project = {
      name: dp.name ?? 'Untitled Eco Home',
      stories: dp.stories ?? 1,
      climate: {
        iecc_zone: dc.iecc_zone ?? 5,
        frost_mm: dc.frost_mm ?? 750,
        snow_psf: dc.snow_psf ?? 30,
        wind_mph: dc.wind_mph ?? 115,
        seismic_class: dc.seismic_class ?? 'B',
      },
    };
    // Levels round-trip: restore the saved stack (so L2 + its z_mm reload), then
    // ensureLevel2() so an older 2-story file without an explicit L2 still gains
    // one (§9). Falls back to the single default level for legacy files.
    if (Array.isArray(data.levels) && data.levels.length) {
      doc.levels = data.levels;
    }
    ensureLevel2();

    // Accept v2 (entities) or legacy flat (modules) format.
    const list = data.entities || data.modules || [];
    doc.entities.length = 0;
    ui.nextId = 0;
    for (const m of list) {
      if (m.kind === 'foundation') {
        // Derived entity — params only, no module. Geometry rebuilds from the
        // L1 silhouette at render/BOM time.
        doc.entities.push({
          id: m.id || `foundation_${ui.nextId++}`,
          kind: 'foundation',
          layer: m.layer || 'foundation',
          level: m.level || 'L1',
          params: m.params || {},
        });
        ui.nextId++;
        continue;
      }
      const mod = ALL_MODULES.find(x => x.id === m.module);
      if (!mod) { console.warn(`Unknown module: ${m.module}`); continue; }
      doc.entities.push({
        kind: m.kind || (mod.interior ? 'iwall' : 'wall'),
        mod,
        dir: m.direction,
        x_mm: m.x_mm,
        y_mm: m.y_mm,
        level: m.level || doc.activeLevel,
        layer: m.layer || 'structural',
        id: m.id || `wall_${ui.nextId}`,
        owner: m.owner || null, // claim: initials/name, set in the design file; null = unclaimed
        connections: m.connections || [],
        props: m.props || {},
      });
      ui.nextId++;
    }
    markModelChanged();
    // Refresh the floor switcher (it appears for 2-story loads).
    window.dispatchEvent(new Event('iconic:project'));
    // Signal a SUCCESSFUL load (fires only here, after parse + apply). home.js
    // uses this to switch the home view → design view deterministically, with no
    // focus/change-timing race. A bad/unparseable file throws above and never
    // reaches here, so a failed load correctly does NOT navigate.
    window.dispatchEvent(new Event('iconic:loaded'));
  };
  reader.readAsText(file);
  event.target.value = '';
}
