// =====================================================
// DESIGNS — the design catalog + a small shared SVG kit.
//
// Two jobs, both pure and DOM-free:
//   1. A deterministic registry mapping each module def to a design id (W-##)
//      and an archetype ('standard' | 'window' | 'door'). The id is stable
//      across sessions because it is derived from the static module list, not
//      from what happens to be placed. Drives the tile design id, the glyph,
//      and the card-template lookup.
//   2. SVG primitives shared by the fab card, the run tiles, and the map:
//      number formatting, lumber colours, a member-rect glyph, and the claim
//      circle. Centralised so every sheet speaks one visual language (§9).
// =====================================================
import { ALL_MODULES, IN_TO_MM, STUD_THICK } from './constants.js';
import { enumerateMembers } from './members.js';

// ---- archetype ------------------------------------------------------------
export function archetypeOf(mod) {
  if (!mod.aperture) return 'standard';
  return mod.aperture.type === 'window' ? 'window' : 'door';
}

// ---- design id registry ---------------------------------------------------
// W-01 = first standard module, W-02 = first window, W-03 = first door, then
// every remaining distinct module sequential (W-04…). Built once from the
// static catalog so a given module always resolves to the same id.
const _designById = {};
(function buildRegistry() {
  const seed = { standard: 'W-01', window: 'W-02', door: 'W-03' };
  const used = new Set();
  for (const a of ['standard', 'window', 'door']) {
    const m = ALL_MODULES.find(mm => archetypeOf(mm) === a);
    if (m && !_designById[m.id]) { _designById[m.id] = seed[a]; used.add(seed[a]); }
  }
  let n = 4;
  for (const m of ALL_MODULES) {
    if (_designById[m.id]) continue;
    let id;
    do { id = 'W-' + String(n++).padStart(2, '0'); } while (used.has(id));
    _designById[m.id] = id; used.add(id);
  }
})();

export function designIdFor(mod) { return _designById[mod.id] || 'W-??'; }
export function designFor(mod) {
  return { design_id: designIdFor(mod), archetype: archetypeOf(mod) };
}

// =====================================================
// SHARED SVG KIT
// =====================================================
export const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const f2 = n => (Math.round(n * 100) / 100).toString();
export const inOf = mm => Math.round(mm / IN_TO_MM);            // whole inches

// inches -> fraction string to the nearest 1/8 (14.5 -> "14½", 60.75 -> "60¾")
const FRAC = { 0: '', 1: '⅛', 2: '¼', 3: '⅜', 4: '½', 5: '⅝', 6: '¾', 7: '⅞' };
export function inFrac(inches) {
  const whole = Math.floor(inches + 1e-6);
  const eighths = Math.round((inches - whole) * 8);
  if (eighths === 0) return `${whole}`;
  if (eighths === 8) return `${whole + 1}`;
  return `${whole === 0 ? '' : whole}${FRAC[eighths]}`;
}

// feet-inches label "96″ (8′-0″)"
export function ftInLabel(inches) {
  const ft = Math.floor(inches / 12), rem = inches - ft * 12;
  return `${inFrac(inches)}″ (${ft}′-${inFrac(rem)}″)`;
}

// lumber fill/stroke by nominal (§1, §9)
export function lumberStyle(nominal) {
  if (nominal === '2x4') return 'fill="#dde4d4" stroke="#8ca078" stroke-width=".6"';
  if (nominal === 'OSB') return 'fill="url(#bs-sheath)" stroke="#c2b594" stroke-width=".5"';
  if (nominal === '2x6') return 'fill="#ece1c8" stroke="#b59a63" stroke-width=".6"';
  return 'fill="#e3d2ad" stroke="#b59a63" stroke-width=".6"'; // 2x8/2x10/2x12 — headers
}

// <defs> needed by lumberStyle's OSB hatch + a reusable stylesheet block. Drop
// once near the top of any SVG that uses the kit.
export const SHEATH_DEFS =
  `<pattern id="bs-sheath" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
  `<line x1="0" y1="0" x2="0" y2="6" stroke="#c2b594" stroke-width="1"/></pattern>`;

export const SHEET_CSS =
  `.ink{fill:#14110c}.sub{fill:#6f6a60}.faint{fill:#a59f93}` +
  `.sec{font-size:11px;letter-spacing:1.6px;fill:#8a8478}` +
  `.bsmono{font-family:'SF Mono','Menlo','Consolas',monospace}` +
  `.tpl{fill:#b5651d}`;

// ---- panel geometry helpers (derive, never hardcode) ----------------------
// Overall framed height of a panel: top of the highest member.
export function panelHeightMM(members) {
  return members.reduce((mx, m) => Math.max(mx, m.z_mm + m.h_mm), 0);
}

// Studs that define bays: the full-height vertical members along the bottom
// plate (role 'stud' for plain walls; kings bound the bays on apertures).
function bayStuds(members) {
  let s = members.filter(m => m.role === 'stud');
  if (!s.length) s = members.filter(m => m.role === 'king');
  return s.slice().sort((a, b) => a.x_mm - b.x_mm);
}

// Bay interior faces + clear gap (mm) between adjacent studs. l/r are the facing
// interior faces; gap is the clear bay. For the stock geometry the gaps are
// [14½,14½,13]″ — COMPUTED from real stud faces, never typed (§0).
export function bayFaces(members) {
  const s = bayStuds(members);
  const out = [];
  for (let i = 0; i + 1 < s.length; i++) {
    const l = s[i].x_mm + s[i].w_mm, r = s[i + 1].x_mm;
    out.push({ l, r, gap: r - l });
  }
  return out;
}

// Clear-gap bay widths (mm). Returns [] when fewer than two studs.
export function bayGapsMM(members) {
  return bayFaces(members).map(b => b.gap);
}

// Stud left-edge layout positions (inches) for the procedure "mark layout" line.
export function studLayoutIn(members) {
  return bayStuds(members).map(m => inFrac(m.x_mm / IN_TO_MM));
}

// ---- glyph: member-rect elevation scaled into a box (§4 tiles, legend) -----
export function glyphSVG(mod, X, Y, BW, BH) {
  const members = enumerateMembers(mod);
  const W = mod.width_mm;
  const H = panelHeightMM(members);
  const s = Math.min(BW / W, BH / H);
  const dW = W * s, dH = H * s;
  const ox = X + (BW - dW) / 2, oy = Y + (BH - dH) / 2;
  const px = x => ox + x * s;
  const py = z => oy + (H - z) * s;
  const out = [`<rect x="${f2(px(0))}" y="${f2(oy)}" width="${f2(dW)}" height="${f2(dH)}" fill="#f6f1e6"/>`];
  for (const m of members) {
    if (m.role === 'sheathing') continue; // glyph shows framing, not skin
    out.push(`<rect x="${f2(px(m.x_mm))}" y="${f2(py(m.z_mm + m.h_mm))}" width="${f2(m.w_mm * s)}" height="${f2(m.h_mm * s)}" ${lumberStyle(m.nominal)}/>`);
  }
  return out.join('');
}

// ---- claim marker ---------------------------------------------------------
export function ownerInitials(owner) {
  if (!owner) return '';
  const parts = String(owner).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const OWNER_PALETTE = ['#6f8f7f', '#b5651d', '#5a7d9a', '#9a6f8f', '#8f8f5a', '#7f6f5a'];
export function ownerColor(owner) {
  let h = 0;
  for (const c of String(owner)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return OWNER_PALETTE[h % OWNER_PALETTE.length];
}

// Claim circle: filled with initials when owned, gray dotted silhouette when not.
export function claimCircleSVG(owner, cx, cy, r = 18) {
  if (owner) {
    return `<circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(r)}" fill="${ownerColor(owner)}"/>` +
      `<text x="${f2(cx)}" y="${f2(cy + r * 0.22)}" fill="#fff" font-size="${f2(r * 0.66)}" font-weight="700" text-anchor="middle">${esc(ownerInitials(owner))}</text>`;
  }
  return `<circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(r)}" fill="#f4f2ee" stroke="#9a958b" stroke-width="1.3" stroke-dasharray="3 3"/>` +
    `<circle cx="${f2(cx)}" cy="${f2(cy - r * 0.22)}" r="${f2(r * 0.28)}" fill="#cfcabc"/>` +
    `<path d="M${f2(cx - r * 0.55)} ${f2(cy + r * 0.5)} a${f2(r * 0.55)} ${f2(r * 0.45)} 0 0 1 ${f2(r * 1.1)} 0 z" fill="#cfcabc"/>`;
}
