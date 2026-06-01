// =====================================================
// FCSTD EXPORT (browser) — download a FreeCAD .fcstd with no terminal.
//
// A .fcstd is a ZIP of Document.xml + one BREP per shape. We emit one static
// Part::Feature box per module (massing volume). Position is baked into each
// box's BREP "Locations" matrix — FreeCAD ignores a hand-written Placement on
// restore, and Part::Feature does not regenerate, so the BREP wins. Verified
// against freecadcmd (volumes + positions exact). For full stud-level framing,
// run compile_from_json.py (FreeCAD); this button is the quick massing model.
// =====================================================
import { doc } from './state.js';
import { IN_TO_MM } from './constants.js';
import { isHorizontal, getModuleBBox } from './geometry.js';

// BREP of a box L=1111 W=222 H=3333 at origin with an identity Locations matrix.
let BREP_TEMPLATE = null;

const LOC_IDENT =
  '1.000000000000000 0.000000000000000 0.000000000000000 0.000000000000000 \n' +
  '0.000000000000000 1.000000000000000 0.000000000000000 0.000000000000000 \n' +
  '0.000000000000000 0.000000000000000 1.000000000000000 0.000000000000000 ';

function brepFor(L, W, H, x, y, z) {
  let s = BREP_TEMPLATE;
  for (const [tok, val] of [['1111', L], ['222', W], ['3333', H]]) {
    s = s.split(`${tok}.00000000000000000`).join(val.toFixed(17));
    s = s.split(`${tok}.000000000000000`).join(val.toFixed(15));
  }
  const loc =
    `1.000000000000000 0.000000000000000 0.000000000000000 ${x.toFixed(15)} \n` +
    `0.000000000000000 1.000000000000000 0.000000000000000 ${y.toFixed(15)} \n` +
    `0.000000000000000 0.000000000000000 1.000000000000000 ${z.toFixed(15)} `;
  return s.replace(LOC_IDENT, loc);
}

function wallHeightMm(mod) {
  const a = mod.aperture;
  if (a && a.height_ft) return a.height_ft * 12 * IN_TO_MM;
  if (mod.id.includes('4x9')) return 9 * 12 * IN_TO_MM;
  if (mod.id.includes('4x10')) return 10 * 12 * IN_TO_MM;
  if (mod.id.includes('8.5')) return 8.5 * 12 * IN_TO_MM;
  return 8 * 12 * IN_TO_MM;
}

function objectBlock(name, label) {
  return `        <Object name="${name}">
            <Properties Count="4" TransientCount="0">
                <Property name="Label" type="App::PropertyString" status="134217728">
                    <String value="${label}"/>
                </Property>
                <Property name="Placement" type="App::PropertyPlacement" status="8388608">
                    <PropertyPlacement Px="0.0" Py="0.0" Pz="0.0" Q0="0.0" Q1="0.0" Q2="0.0" Q3="1.0" A="0.0" Ox="0.0" Oy="0.0" Oz="1.0"/>
                </Property>
                <Property name="Shape" type="Part::PropertyPartShape">
                    <Part file="${name}.Shape.brp"/>
                    <ElementMap/>
                </Property>
                <Property name="Visibility" type="App::PropertyBool" status="648">
                    <Bool value="true"/>
                </Property>
            </Properties>
        </Object>
`;
}

function documentXml(boxes) {
  const deps = boxes.map(b => `        <ObjectDeps Name="${b.name}" Count="0"/>\n`).join('');
  const objs = boxes.map((b, i) =>
    `        <Object type="Part::Feature" name="${b.name}" id="${2000 + i}" />\n`).join('');
  const data = boxes.map(b => objectBlock(b.name, b.label)).join('');
  return `<?xml version='1.0' encoding='utf-8'?>
<Document SchemaVersion="4" ProgramVersion="1.1R44874 (Git)" FileVersion="1">
    <Properties Count="1" TransientCount="0">
        <Property name="Label" type="App::PropertyString" status="16777217"><String value="IconicCAD"/></Property>
    </Properties>
    <Objects Count="${boxes.length}" Dependencies="0">
${deps}${objs}    </Objects>
    <ObjectData Count="${boxes.length}">
${data}    </ObjectData>
</Document>
`;
}

// Pure: map placed entities -> box specs (also used by the node verification).
export function boxesFromEntities(entities) {
  return entities.map((p, i) => {
    const bb = getModuleBBox(p.mod, p.dir);
    return {
      name: `Box${i}`,
      label: `${p.mod.id}_${p.id}`,
      L: bb.w, W: bb.h, H: wallHeightMm(p.mod),
      x: p.x_mm, y: p.y_mm, z: (p.level && lookupZ(p.level)) || 0,
    };
  });
}

function lookupZ(levelId) {
  const lv = doc.levels.find(l => l.id === levelId);
  return lv ? lv.z_mm : 0;
}

// Pure builder (template injected) — returns { 'Document.xml':..., 'BoxN.Shape.brp':... }.
export function buildFcstdFiles(boxes, brepTemplate) {
  BREP_TEMPLATE = brepTemplate;
  const files = { 'Document.xml': documentXml(boxes) };
  for (const b of boxes) files[`${b.name}.Shape.brp`] = brepFor(b.L, b.W, b.H, b.x, b.y, b.z);
  return files;
}

export async function exportFcstd() {
  if (doc.entities.length === 0) { alert('Place some modules first.'); return; }
  if (!BREP_TEMPLATE) BREP_TEMPLATE = await (await fetch('assets/box_template.brp')).text();
  const files = buildFcstdFiles(boxesFromEntities(doc.entities), BREP_TEMPLATE);
  const { default: JSZip } = await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm');
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'house.fcstd'; a.click();
  URL.revokeObjectURL(url);
}
