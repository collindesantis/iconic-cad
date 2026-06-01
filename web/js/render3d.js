// =====================================================
// RENDER 3D — three.js preview / experiment view.
//
// Performance model (the old version rebuilt the whole scene + leaked GPU
// memory on every mousemove). Now:
//   • rebuildModel3D() runs ONLY on model change; it disposes old geometry.
//   • render is on-demand (controls 'change', rebuild, tab switch, resize) —
//     no perpetual requestAnimationFrame burning the GPU while idle.
//   • damping is off, so render-on-change is sufficient.
//   • one renderer hops between the small preview panel and the big 3D tab.
// =====================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { doc } from './state.js';
import { IN_TO_MM, STUD_THICK, STUD_DEPTH, OSB_THICK, LUMBER_DEPTH } from './constants.js';

let renderer, scene, camera, controls, modelRoot;
let hasFitted = false;

const matLumber = new THREE.MeshLambertMaterial({ color: 0xdaa520 });
const matOSB = new THREE.MeshLambertMaterial({ color: 0x8fbc8f });
const matIWallLumber = new THREE.MeshLambertMaterial({ color: 0xc4a882 });

export function init3d() {
  const previewContainer = document.getElementById('preview-container');
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(196, 196);
  renderer.setClearColor(0x111828);
  previewContainer.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, 1, 1, 100000);
  camera.position.set(3000, 3000, 4000);
  camera.lookAt(0, 0, 0);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;            // render-on-change, no idle rAF
  controls.addEventListener('change', renderOnce);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(2000, 3000, 4000);
  scene.add(dirLight);

  modelRoot = new THREE.Group();
  scene.add(modelRoot);

  rebuildModel3D();
}

export function renderOnce() {
  if (renderer) renderer.render(scene, camera);
}

function addBoxTo(group, sx, sy, sz, px, py, pz, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  m.position.set(px, py, pz);
  group.add(m);
}

function buildWall3D(mod, dir, xPos, yPos) {
  if (mod.aperture) return buildAperture3D(mod, dir, xPos, yPos);
  const group = new THREE.Group();
  const isInt = mod.interior;

  const W = mod.width_mm;
  const H = (mod.id.includes('8.5') ? 8.5 : 8) * 12 * IN_TO_MM;
  const D = isInt ? (3.5 * IN_TO_MM) : STUD_DEPTH;
  const O = isInt ? 0 : OSB_THICK;
  const PT = STUD_THICK;
  const ST = STUD_THICK;
  const wallMat = isInt ? matIWallLumber : matLumber;

  const oc = mod.id.includes('16oc') ? 16 : mod.id.includes('24oc') ? 24 : 18;
  const studPos = [0];
  let cur = oc * IN_TO_MM;
  while (cur + ST <= W - ST) { studPos.push(cur); cur += oc * IN_TO_MM; }
  studPos.push(W - ST);
  const studH = H - 2 * PT;

  function addBox(sx, sy, sz, px, py, pz, mat) { addBoxTo(group, sx, sy, sz, px, py, pz, mat); }

  if (dir === 'north' || dir === 'south') {
    const osbY = dir === 'south' ? -O / 2 : D + O / 2;
    addBox(W, D, PT, W/2, D/2, PT/2, wallMat);
    addBox(W, D, PT, W/2, D/2, H - PT/2, wallMat);
    for (const sx of studPos) addBox(ST, D, studH, sx + ST/2, D/2, PT + studH/2, wallMat);
    if (O > 0) addBox(W, O, H, W/2, osbY, H/2, matOSB);
  } else {
    const osbX = dir === 'west' ? -O / 2 : D + O / 2;
    addBox(D, W, PT, D/2, -W/2, PT/2, wallMat);
    addBox(D, W, PT, D/2, -W/2, H - PT/2, wallMat);
    for (const sy of studPos) addBox(D, ST, studH, D/2, -(sy + ST/2), PT + studH/2, wallMat);
    if (O > 0) addBox(O, W, H, osbX, -W/2, H/2, matOSB);
  }

  group.position.x = xPos;
  if (dir === 'north') group.position.y = -(yPos + D + O);
  else if (dir === 'south') group.position.y = -(yPos + D);
  else group.position.y = -yPos;

  return group;
}

// Window/door panel mirroring the FreeCAD generator framing.
function buildAperture3D(mod, dir, xPos, yPos) {
  const group = new THREE.Group();
  const isInt = mod.interior;
  const a = mod.aperture;

  const W = mod.width_mm;
  const H = (a.height_ft || (mod.id.includes('4x9') ? 9 : mod.id.includes('4x10') ? 10 : 8)) * 12 * IN_TO_MM;
  const D = isInt ? (3.5 * IN_TO_MM) : STUD_DEPTH;
  const O = isInt ? 0 : OSB_THICK;
  const PT = STUD_THICK, ST = STUD_THICK;
  const wallMat = isInt ? matIWallLumber : matLumber;

  const roW = a.ro_w_in * IN_TO_MM;
  const roX0 = (W - roW) / 2, roX1 = roX0 + roW;
  const roZ0 = a.sill_in * IN_TO_MM;
  const roZ1 = roZ0 + a.ro_h_in * IN_TO_MM;
  const isWin = a.type === 'window' && roZ0 > 0;
  const hdrDep = LUMBER_DEPTH[a.header_nominal] || 7.25 * IN_TO_MM;
  const zStudTop = H - PT, zStudBot = PT;

  const cripX = [];
  let g = a.oc * IN_TO_MM;
  while (g + ST < roX1) { if (g > roX0) cripX.push(g); g += a.oc * IN_TO_MM; }
  if (!cripX.length) cripX.push((roX0 + roX1) / 2 - ST / 2);

  const horiz = (dir === 'north' || dir === 'south');
  const osbAt = horiz
    ? (dir === 'south' ? -O / 2 : D + O / 2)
    : (dir === 'west' ? -O / 2 : D + O / 2);

  function member(runStart, runLen, z0, zLen, mat) {
    if (runLen <= 0 || zLen <= 0) return;
    if (horiz) addBoxTo(group, runLen, D, zLen, runStart + runLen / 2, D / 2, z0 + zLen / 2, mat);
    else       addBoxTo(group, D, runLen, zLen, D / 2, -(runStart + runLen / 2), z0 + zLen / 2, mat);
  }
  function osb(runStart, runLen, z0, zLen) {
    if (runLen <= 0 || zLen <= 0 || O <= 0) return;
    if (horiz) addBoxTo(group, runLen, O, zLen, runStart + runLen / 2, osbAt, z0 + zLen / 2, matOSB);
    else       addBoxTo(group, O, runLen, zLen, osbAt, -(runStart + runLen / 2), z0 + zLen / 2, matOSB);
  }

  if (isWin) member(0, W, 0, PT, wallMat);
  else { member(0, roX0, 0, PT, wallMat); member(roX1, W - roX1, 0, PT, wallMat); }
  member(0, W, zStudTop, PT, wallMat);

  member(0, ST, zStudBot, zStudTop - zStudBot, wallMat);
  member(W - ST, ST, zStudBot, zStudTop - zStudBot, wallMat);
  member(roX0 - ST, ST, zStudBot, roZ1 - zStudBot, wallMat);
  member(roX1, ST, zStudBot, roZ1 - zStudBot, wallMat);
  member(roX0 - ST, roW + 2 * ST, roZ1, hdrDep, wallMat);
  const zAbove = roZ1 + hdrDep;
  for (const cx of cripX) member(cx, ST, zAbove, zStudTop - zAbove, wallMat);
  if (isWin) {
    const zSillBot = roZ0 - PT;
    member(roX0, roW, zSillBot, PT, wallMat);
    const zCripBot = zStudBot;
    for (const cx of cripX) member(cx, ST, zCripBot, zSillBot - zCripBot, wallMat);
    if (zSillBot - zCripBot > PT + 1) {
      member(roX0, roW, zCripBot, PT, wallMat);
      const blockSpacing = 24 * IN_TO_MM;
      for (let zb = zCripBot + blockSpacing; zb + PT < zSillBot - 1; zb += blockSpacing) {
        member(roX0, roW, zb, PT, wallMat);
      }
    }
  }

  osb(0, roX0, 0, H);
  osb(roX1, W - roX1, 0, H);
  osb(roX0, roW, roZ1, H - roZ1);
  if (roZ0 > 0) osb(roX0, roW, 0, roZ0);

  group.position.x = xPos;
  if (dir === 'north') group.position.y = -(yPos + D + O);
  else if (dir === 'south') group.position.y = -(yPos + D);
  else group.position.y = -yPos;
  return group;
}

// Rebuild the scene from the document. Disposes prior geometry (no leak).
export function rebuildModel3D() {
  // dispose + clear previous meshes
  modelRoot.traverse(obj => { if (obj.isMesh && obj.geometry) obj.geometry.dispose(); });
  modelRoot.clear();

  const placed = doc.entities;
  if (placed.length === 0) {
    hasFitted = false;
    renderOnce();
    return;
  }

  const minX = Math.min(...placed.map(p => p.x_mm));
  const minY = Math.min(...placed.map(p => p.y_mm));
  for (const p of placed) {
    modelRoot.add(buildWall3D(p.mod, p.dir, p.x_mm - minX, p.y_mm - minY));
  }

  // Fit the camera ONCE (when going from empty to populated) so it doesn't
  // snap back / fight the user's orbit on every edit.
  if (!hasFitted) {
    const box = new THREE.Box3().setFromObject(modelRoot);
    const center = new THREE.Vector3(); box.getCenter(center);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 3000;
    controls.target.copy(center);
    camera.position.set(center.x + maxDim, center.y + maxDim, maxDim * 1.2);
    controls.update();
    hasFitted = true;
  }
  renderOnce();
}

// Recenter on demand (e.g. a "fit" button or tab switch after big edits).
export function fitCamera() { hasFitted = false; rebuildModel3D(); }

// Move the single renderer between the small preview and the big 3D tab.
export function setViewport(tab) {
  if (!renderer) return;
  const el = renderer.domElement;
  if (tab === '3d') {
    const wrap = document.getElementById('canvas3d-wrap');
    wrap.appendChild(el);
    resize3d();
  } else {
    const prev = document.getElementById('preview-container');
    prev.appendChild(el);
    renderer.setSize(196, 196);
    camera.aspect = 1;
    camera.updateProjectionMatrix();
    renderOnce();
  }
}

export function resize3d() {
  const wrap = document.getElementById('canvas3d-wrap');
  if (!wrap || wrap.clientWidth === 0) return;
  renderer.setSize(wrap.clientWidth, wrap.clientHeight);
  camera.aspect = wrap.clientWidth / wrap.clientHeight;
  camera.updateProjectionMatrix();
  renderOnce();
}
