// =====================================================
// RENDER SUMMARY — the Build Summary packet.
//
//   page 1  modules by run (tiles, claim circles, mechanical estimates)   §4
//   page 2  in-place map (each module at its real plan position)          §5
//   page 3  cut & pick list (the BOM re-rendered as a build sheet)        §6
//   + one fab card per distinct design (deduped)                          §8
//
// All derived from the current model. Run order/tags come from runs.js so the
// pages and the cards agree. Weight/time are simple, labelled ESTIMATES from
// tweakable constants — not engineering.
// =====================================================
import { doc } from './state.js';
import { IN_TO_MM } from './constants.js';
import { enumerateMembers } from './members.js';
import { getModuleBBox } from './geometry.js';
import { computeRuns, tagsByEntityId } from './runs.js';
import {
  esc, f2, inFrac, glyphSVG, claimCircleSVG, SHEATH_DEFS, SHEET_CSS,
  panelHeightMM, archetypeOf,
} from './designs.js';
import { cutListGrouped, aggregateLineItems, getCatalog } from './bom.js';
import {
  cardSVG, buildBookHTML, downloadText, openPrintWindow,
  loadCardTemplates, instanceMaterials,
} from './render_fab.js';

// ---- ESTIMATE CONSTANTS (tweakable; labelled as estimates everywhere) -----
const LB_PER_FT = { '2x4': 1.1, '2x6': 1.7, '2x8': 2.3, '2x10': 2.9, '2x12': 3.5 };
const OSB_SHEET_LB = 46;        // 7/16" 4×8 sheet
const TIME_BASE_MIN = 3;        // base handling per panel
const TIME_K_MIN = 0.7;         // per framing member

function estimateWeight(mod) {
  let lb = 0;
  for (const m of enumerateMembers(mod)) {
    if (m.role === 'sheathing') {
      const sqft = (m.w_mm / IN_TO_MM) * (m.h_mm / IN_TO_MM) / 144;
      lb += (sqft / 32) * OSB_SHEET_LB;
    } else {
      const ft = m.length_mm / IN_TO_MM / 12;
      lb += ft * (LB_PER_FT[m.nominal] || LB_PER_FT['2x6']) * (m.plies || 1);
    }
  }
  return Math.round(lb);
}
function estimateMinutes(mod) {
  const n = enumerateMembers(mod).filter(m => m.role !== 'sheathing').length;
  return Math.round(TIME_BASE_MIN + TIME_K_MIN * n);
}

// ---- tile (page 1) --------------------------------------------------------
function tileLines(mod) {
  const members = enumerateMembers(mod);
  const W = mod.width_mm, H = panelHeightMM(members);
  const size = `${inFrac(W / IN_TO_MM)}×${inFrac(H / IN_TO_MM)}`;
  if (mod.aperture) {
    const a = mod.aperture;
    const kind = a.type === 'window' ? 'R.O.' : (a.type === 'door' ? 'door' : a.type);
    return [`${size} · ${a.ro_w_in}×${a.ro_h_in} ${kind}`, `kings · jacks · ${a.header_plies || 1}-ply hdr`];
  }
  const studs = members.filter(m => m.role === 'stud').length;
  const plates = members.filter(m => m.role === 'bottom_plate' || m.role === 'top_plate').length;
  return [`${size} · ${mod.interior ? '2x4' : '2x6'} · standard`, `${studs} studs · ${plates} plates`];
}

function tileSVG(m, x, y) {
  const mod = m.entity.mod;
  const claimed = !!m.owner;
  const [l1, l2] = tileLines(mod);
  const w = estimateWeight(mod), t = estimateMinutes(mod);
  const out = [`<g transform="translate(${f2(x)},${f2(y)})">`];
  out.push(`<rect x="0" y="0" width="160" height="190" rx="8" fill="#fff" stroke="${claimed ? '#cbb48f' : '#e2dccf'}" stroke-width="${claimed ? 1.5 : 1}"/>`);
  out.push(`<text x="12" y="24" class="ink" font-size="16" font-weight="700">${esc(m.tag)}</text>`);
  out.push(`<text x="148" y="20" class="faint bsmono" font-size="9" text-anchor="end">${esc(m.designId)}</text>`);
  out.push(`<line x1="12" y1="32" x2="148" y2="32" stroke="#ece7db" stroke-width="1"/>`);
  out.push(`<g transform="translate(14,40)">${glyphSVG(mod, 0, 0, 84, 72)}</g>`);
  out.push(claimCircleSVG(m.owner, 124, 66, 18));
  if (claimed) out.push(`<text x="124" y="98" class="sub" font-size="8" text-anchor="middle">${esc(m.owner)}</text>`);
  out.push(`<text x="12" y="126" class="ink" font-size="9">${esc(l1)}</text>`);
  out.push(`<text x="12" y="142" class="ink" font-size="9">${esc(l2)}</text>`);
  out.push(`<text x="12" y="158" class="sub" font-size="9">≈${w} lb · ~${t} min (est.)</text>`);
  out.push(`<rect x="12" y="166" width="136" height="18" fill="#f6f4ef"/>`);
  out.push(`<text x="18" y="179" class="ink" font-size="9">${esc(m.positionString)}</text>`);
  out.push('</g>');
  return out.join('');
}

// ===================== PAGE 1 — MODULES BY RUN =====================
// Runs arrive already grouped by level then ordered within level (runs.js). When
// the build spans >1 level a level title is emitted before each level's first
// run, so page 1 reads "Level 1 / runs…, Level 2 / runs…" (§8).
export function summaryPage1(runs, levelNames = {}) {
  const SVW = 1000, PER_ROW = 4, PITCH = 192, ROW_H = 206, RUN_GAP = 24;
  const body = [];
  let y = 130, modCount = 0, totW = 0, totMin = 0;
  const designs = new Set();
  const multiLevel = new Set(runs.map(r => r.level || 'L1')).size > 1;
  let curLevel = null;
  for (const r of runs) {
    const lvl = r.level || 'L1';
    if (multiLevel && lvl !== curLevel) {
      curLevel = lvl;
      y += 8;
      body.push(`<text x="40" y="${f2(y)}" class="ink" font-size="13" font-weight="700" letter-spacing="1">${esc((levelNames[lvl] || lvl).toUpperCase())}</text>`);
      y += 22;
    }
    body.push(`<text x="40" y="${f2(y)}" class="sec">RUN ${r.letter} <tspan class="faint" letter-spacing="0" font-size="9"> — ${r.modules.length} module${r.modules.length === 1 ? '' : 's'} · ${r.horiz ? 'left → right' : 'top → bottom'}</tspan></text>`);
    body.push(`<line x1="40" y1="${f2(y + 6)}" x2="960" y2="${f2(y + 6)}" stroke="#d8d2c6" stroke-width=".8"/>`);
    y += 20;
    r.modules.forEach((m, i) => {
      const col = i % PER_ROW, row = Math.floor(i / PER_ROW);
      body.push(tileSVG(m, 40 + col * PITCH, y + row * ROW_H));
      modCount++; totW += estimateWeight(m.entity.mod); totMin += estimateMinutes(m.entity.mod); designs.add(m.designId);
    });
    const rows = Math.ceil(r.modules.length / PER_ROW) || 1;
    y += rows * ROW_H + RUN_GAP;
  }
  const SVH = Math.max(360, y + 30);

  const p = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVW} ${SVH}" font-family="'Helvetica Neue',Arial,sans-serif">`];
  p.push(`<defs>${SHEATH_DEFS}<style>${SHEET_CSS}</style></defs>`);
  p.push(`<rect x="0" y="0" width="${SVW}" height="${SVH}" fill="#ffffff"/>`);
  p.push(`<rect x="12" y="12" width="${SVW - 24}" height="${SVH - 24}" fill="none" stroke="#d8d2c6" stroke-width="1"/>`);
  p.push(`<text x="40" y="46" class="ink" font-size="19" font-weight="700" letter-spacing=".5">BUILD SUMMARY</text>`);
  p.push(`<text x="40" y="64" class="sub bsmono" font-size="11">page 1 · modules by run</text>`);
  p.push(`<line x1="40" y1="80" x2="${SVW - 40}" y2="80" stroke="#e6e0d4" stroke-width="1"/>`);
  p.push(`<text x="40" y="100" class="ink bsmono" font-size="11">${modCount} MODULE${modCount === 1 ? '' : 'S'}</text>`);
  p.push(`<text x="180" y="100" class="ink bsmono" font-size="11">${designs.size} DESIGN${designs.size === 1 ? '' : 'S'}</text>`);
  p.push(`<text x="320" y="100" class="ink bsmono" font-size="11">≈${totW.toLocaleString()} LB</text>`);
  p.push(`<text x="470" y="100" class="ink bsmono" font-size="11">EST. ~${(totMin / 60).toFixed(1)} CREW-HR</text>`);
  p.push(`<text x="690" y="100" class="faint bsmono" font-size="9">weight + time are estimates</text>`);
  p.push(body.join('\n'));
  p.push('</svg>');
  return p.join('\n');
}

// ===================== PAGE 2 — IN-PLACE MAP =====================
// One map per level (§8). `entities` is already filtered to the level; `runs` is
// the whole-build run set (tagsByEntityId gives the same tags the run pages use).
export function summaryPage2(runs, entities, levelLabel = null) {
  const SVW = 900, SVH = 680;
  const walls = entities.filter(e => e.kind === 'wall' || e.kind === 'iwall');
  const tagMap = tagsByEntityId(runs);

  const p = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVW} ${SVH}" font-family="'Helvetica Neue',Arial,sans-serif">`];
  p.push(`<defs><style>${SHEET_CSS}.tag{font-size:11px;font-weight:700;fill:#14110c}</style></defs>`);
  p.push(`<rect x="0" y="0" width="${SVW}" height="${SVH}" fill="#ffffff"/>`);
  p.push(`<rect x="12" y="12" width="${SVW - 24}" height="${SVH - 24}" fill="none" stroke="#d8d2c6" stroke-width="1"/>`);
  p.push(`<text x="40" y="46" class="ink" font-size="19" font-weight="700" letter-spacing=".5">BUILD MAP · MODULES IN PLACE${levelLabel ? ` · ${esc(levelLabel.toUpperCase())}` : ''}</text>`);
  p.push(`<text x="40" y="64" class="sub bsmono" font-size="11">page 2 · each module shown in its real position</text>`);
  p.push(`<line x1="40" y1="80" x2="${SVW - 40}" y2="80" stroke="#e6e0d4" stroke-width="1"/>`);

  if (!walls.length) { p.push('</svg>'); return p.join('\n'); }

  // fit footprints into a centred box; reuse getModuleBBox for footprints (§5).
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  const fps = walls.map(e => {
    const bb = getModuleBBox(e.mod, e.dir);
    const r = { e, x0: e.x_mm, y0: e.y_mm, x1: e.x_mm + bb.w, y1: e.y_mm + bb.h };
    minx = Math.min(minx, r.x0); miny = Math.min(miny, r.y0);
    maxx = Math.max(maxx, r.x1); maxy = Math.max(maxy, r.y1);
    return r;
  });
  const boxX = 70, boxY = 120, boxW = SVW - 140, boxH = 440;
  const spanX = Math.max(1, maxx - minx), spanY = Math.max(1, maxy - miny);
  const s = Math.min(boxW / spanX, boxH / spanY);
  const offx = boxX + (boxW - spanX * s) / 2, offy = boxY + (boxH - spanY * s) / 2;
  const X = x => offx + (x - minx) * s, Y = y => offy + (y - miny) * s;

  for (const fp of fps) {
    const rx = X(fp.x0), ry = Y(fp.y0), rw = (fp.x1 - fp.x0) * s, rh = (fp.y1 - fp.y0) * s;
    const t = tagMap[fp.e.id] || {};
    p.push(`<rect x="${f2(rx)}" y="${f2(ry)}" width="${f2(rw)}" height="${f2(rh)}" fill="#ece1c8" stroke="#b59a63" stroke-width=".8"/>`);
    const cx = rx + rw / 2, cy = ry + rh / 2;
    p.push(claimCircleSVG(t.owner, cx, cy, 12));
    if (t.tag) {
      // tag sits just outside the thin side of the band so the circle stays clear
      const horiz = rw >= rh;
      const tx = horiz ? cx : (cx + rw / 2 + 14);
      const ty = horiz ? (ry - 6) : (cy + 4);
      p.push(`<text x="${f2(tx)}" y="${f2(ty)}" class="tag" text-anchor="${horiz ? 'middle' : 'start'}">${esc(t.tag)}</text>`);
    }
  }

  p.push(`<line x1="40" y1="${SVH - 70}" x2="${SVW - 40}" y2="${SVH - 70}" stroke="#d8d2c6" stroke-width=".8"/>`);
  p.push(`<g transform="translate(56,${SVH - 56})">${claimCircleSVG(null, 0, 0, 10)}</g>`);
  p.push(`<text x="78" y="${SVH - 52}" class="sub" font-size="10">unclaimed wall (claimed walls fill with initials)</text>`);
  p.push(`<text x="470" y="${SVH - 52}" class="faint" font-size="10">Corners are two runs meeting — there is no corner module.</text>`);
  p.push('</svg>');
  return p.join('\n');
}

// ===================== PAGE 3 — CUT & PICK LIST =====================
export function summaryPage3(entities, templates) {
  const SVW = 850, SVH = 1100;
  const walls = entities.filter(e => e.kind === 'wall' || e.kind === 'iwall');
  const cut = cutListGrouped(walls).filter(r => r.nominal !== 'OSB');
  const agg = aggregateLineItems(walls);
  const catalog = getCatalog();

  // non-lumber tally from the authored templates × instances
  const nl = new Map();
  for (const e of walls) {
    for (const it of instanceMaterials(templates, e.mod)) {
      const q = parseFloat(it.qty);
      const cur = nl.get(it.text) || { qty: 0, hasNum: false };
      if (!isNaN(q)) { cur.qty += q; cur.hasNum = true; }
      nl.set(it.text, cur);
    }
  }

  const p = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVW} ${SVH}" font-family="'Helvetica Neue',Arial,sans-serif">`];
  p.push(`<defs><style>${SHEET_CSS}</style></defs>`);
  p.push(`<rect x="0" y="0" width="${SVW}" height="${SVH}" fill="#ffffff"/>`);
  p.push(`<rect x="12" y="12" width="${SVW - 24}" height="${SVH - 24}" fill="none" stroke="#d8d2c6" stroke-width="1"/>`);
  p.push(`<text x="40" y="46" class="ink" font-size="19" font-weight="700" letter-spacing=".5">CUT &amp; PICK LIST</text>`);
  p.push(`<text x="40" y="64" class="sub bsmono" font-size="11">page 3 · whole-build bill, derived from the model BOM</text>`);
  p.push(`<line x1="40" y1="80" x2="${SVW - 40}" y2="80" stroke="#e6e0d4" stroke-width="1"/>`);

  const LX = 40, LXE = SVW - 40;
  const head = (y, label) => {
    p.push(`<text x="${LX}" y="${f2(y)}" class="sec">${esc(label)}</text>`);
    p.push(`<line x1="${LX}" y1="${f2(y + 8)}" x2="${LXE}" y2="${f2(y + 8)}" stroke="#d8d2c6" stroke-width=".8"/>`);
  };
  let y = 110;

  // CUT LIST (lumber)
  head(y, 'CUT LIST · LUMBER'); y += 28;
  p.push(`<text x="${LX}" y="${f2(y)}" class="faint bsmono" font-size="9">QTY</text>`);
  p.push(`<text x="${LX + 60}" y="${f2(y)}" class="faint bsmono" font-size="9">PART</text>`);
  p.push(`<text x="540" y="${f2(y)}" class="faint bsmono" font-size="9">MAT</text>`);
  p.push(`<text x="${LXE}" y="${f2(y)}" class="faint bsmono" font-size="9" text-anchor="end">LENGTH</text>`);
  y += 6; p.push(`<line x1="${LX}" y1="${f2(y)}" x2="${LXE}" y2="${f2(y)}" stroke="#ece7db" stroke-width="1"/>`); y += 18;
  for (const r of cut) {
    p.push(`<text x="${LX}" y="${f2(y)}" class="ink bsmono" font-size="11">[${r.qty}]</text>`);
    p.push(`<text x="${LX + 60}" y="${f2(y)}" class="ink" font-size="11">${esc(r.part)}</text>`);
    p.push(`<text x="540" y="${f2(y)}" class="sub bsmono" font-size="11">${esc(r.nominal)}</text>`);
    p.push(`<text x="${LXE}" y="${f2(y)}" class="ink bsmono" font-size="11" text-anchor="end">${esc(r.lengthLabel)}</text>`);
    y += 21;
  }
  y += 18;

  // PICK LIST (OSB + fasteners + non-lumber)
  head(y, 'PICK LIST · SHEATHING · FASTENERS · NON-LUMBER'); y += 28;
  const pick = (label, qtyStr) => {
    p.push(`<text x="${LX}" y="${f2(y)}" class="ink bsmono" font-size="11">${esc(qtyStr)}</text>`);
    p.push(`<text x="${LX + 60}" y="${f2(y)}" class="ink" font-size="11">${esc(label)}</text>`);
    y += 20;
  };
  // OSB + hardware from the generic BOM agg (catalog descriptions)
  for (const key of ['osb_7_16_4x8', 'nail_16d_sinker', 'screw_3in']) {
    if (!agg[key]) continue;
    const c = catalog[key];
    pick(c ? c.description : key, `[${agg[key]}]`);
  }
  // non-lumber from templates
  for (const [text, v] of nl) {
    pick(text, v.hasNum ? `[${Math.round(v.qty)}]` : '—');
  }
  y += 14;
  p.push(`<text x="${LX}" y="${f2(y)}" class="faint" font-size="9">Lumber + OSB + fasteners summed from the model BOM (bom.js). Non-lumber summed from the per-archetype panel templates × placed instances. Source against local pricing before ordering.</text>`);

  p.push(`<text x="${SVW / 2}" y="${SVH - 20}" font-size="9" fill="#a59f93" text-anchor="middle">Iconic CAD / Open Source Ecology · CC BY-SA 4.0 · generated ${new Date().toISOString().slice(0, 10)}</text>`);
  p.push('</svg>');
  return p.join('\n');
}

// ===================== PACKET =====================
// Zero-arg, reads `doc`. async because the cards load authored templates.
export async function generateBuildSummary(filename) {
  const walls = doc.entities.filter(e => e.kind === 'wall' || e.kind === 'iwall');
  if (!walls.length) { alert('Place modules first.'); return; }

  const templates = await loadCardTemplates();
  const runs = computeRuns(doc.entities);
  const levelNames = Object.fromEntries(doc.levels.map(l => [l.id, l.name]));

  // Levels that actually have wall entities, in doc order (Level 1 then Level 2).
  const levelsWithWalls = doc.levels
    .map(l => l.id)
    .filter(id => walls.some(e => (e.level || 'L1') === id));
  if (!levelsWithWalls.length) levelsWithWalls.push('L1'); // legacy: entities sans level

  const sheets = [
    { label: 'Summary · Runs', title: null, fullpage: true, sections: [{ type: 'summary', svg: summaryPage1(runs, levelNames) }] },
  ];
  // One in-place map per level that has entities, in order (§8).
  for (const lvl of levelsWithWalls) {
    const lvlEnts = doc.entities.filter(e => (e.level || 'L1') === lvl);
    const label = levelsWithWalls.length > 1 ? (levelNames[lvl] || lvl) : null;
    sheets.push({
      label: label ? `Summary · Map · ${label}` : 'Summary · Map',
      title: null, fullpage: true,
      sections: [{ type: 'map', svg: summaryPage2(runs, lvlEnts, label) }],
    });
  }
  sheets.push({ label: 'Summary · Cut & Pick', title: null, fullpage: true, sections: [{ type: 'cutpick', svg: summaryPage3(doc.entities, templates) }] });

  // one fab card per distinct design (deduped), referenced by the tiles' W-##.
  const seen = new Set(), reps = [];
  for (const r of runs) for (const m of r.modules) {
    if (seen.has(m.designId)) continue;
    seen.add(m.designId); reps.push(m);
  }
  reps.sort((a, b) => a.designId.localeCompare(b.designId));
  for (const m of reps) {
    sheets.push({
      label: m.designId, title: null, fullpage: true,
      sections: [{ type: 'card', svg: cardSVG(m.entity, { label: m.designId, templates }) }],
    });
  }

  const html = buildBookHTML(sheets, 'Iconic CAD — Build Summary');
  downloadText(html, filename || 'build-summary.html', 'text/html');
  openPrintWindow(html);
}
