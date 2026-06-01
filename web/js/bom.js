// =====================================================
// BOM ESTIMATOR — runs on model change only (not per mousemove).
// =====================================================
import { doc } from './state.js';

let pricingData = null;

export async function loadPricing() {
  const resp = await fetch('pricing.json');
  pricingData = await resp.json();
}

export function updateBOM() {
  const el = document.getElementById('bom-content');
  if (!el) return;
  const placed = doc.entities;
  if (!pricingData || placed.length === 0) {
    el.innerHTML = 'Place modules to see estimate';
    return;
  }

  const counts = {};
  for (const p of placed) counts[p.mod.id] = (counts[p.mod.id] || 0) + 1;

  let totalStuds2x6 = 0, totalStuds2x4 = 0, totalPlates2x6 = 0, totalPlates2x4 = 0, totalOSB = 0;
  let totalNails = 0, totalScrews = 0;
  let totalCost = 0;

  const lumber = pricingData.lumber;
  const hw = pricingData.hardware;
  const specs = pricingData.module_specs;

  for (const [modId, count] of Object.entries(counts)) {
    const s = specs[modId];
    if (!s) continue;

    const is2x4 = s.lumber_type === '2x4';
    if (is2x4) {
      totalStuds2x4 += s.studs * count;
      totalPlates2x4 += s.plates * count;
    } else {
      totalStuds2x6 += s.studs * count;
      totalPlates2x6 += s.plates * count;
    }
    totalOSB += s.osb_sheets * count;
    totalNails += (s.nails_edge + s.nails_center) * count;
    totalScrews += s.corner_screws * count;

    const studKey = is2x4 ? '2x4_8ft' : '2x6_8ft';
    totalCost += s.studs * count * lumber[studKey].unit_price;
    const plateKey = is2x4
      ? (s.plate_length_ft <= 4 ? '2x4_8ft' : '2x4_10ft')
      : (s.plate_length_ft <= 4 ? '2x6_8ft' : '2x6_12ft');
    totalCost += s.plates * count * lumber[plateKey].unit_price;
    totalCost += s.osb_sheets * count * lumber['osb_7_16_4x8'].unit_price;
    totalCost += (s.nails_edge + s.nails_center) * count * hw['nail_16d_sinker'].unit_price;
    totalCost += s.corner_screws * count * hw['screw_3in'].unit_price;
  }

  el.innerHTML = `
    <table style="width:100%; border-collapse:collapse;">
      <tr><td>Modules</td><td style="text-align:right">${placed.length}</td></tr>
      <tr><td colspan="2" style="border-top:1px solid #333; padding-top:4px; color:#667; font-weight:bold;">Lumber</td></tr>
      ${totalStuds2x6 ? `<tr><td>2x6 studs</td><td style="text-align:right">${totalStuds2x6}</td></tr>` : ''}
      ${totalPlates2x6 ? `<tr><td>2x6 plates</td><td style="text-align:right">${totalPlates2x6}</td></tr>` : ''}
      ${totalStuds2x4 ? `<tr><td>2x4 studs</td><td style="text-align:right">${totalStuds2x4}</td></tr>` : ''}
      ${totalPlates2x4 ? `<tr><td>2x4 plates</td><td style="text-align:right">${totalPlates2x4}</td></tr>` : ''}
      <tr><td>OSB sheets</td><td style="text-align:right">${totalOSB}</td></tr>
      <tr><td colspan="2" style="border-top:1px solid #333; padding-top:4px; color:#667; font-weight:bold;">Hardware</td></tr>
      <tr><td>16d nails</td><td style="text-align:right">${totalNails}</td></tr>
      <tr><td>3" screws</td><td style="text-align:right">${totalScrews}</td></tr>
      <tr><td colspan="2" style="border-top:1px solid #333; padding-top:6px; color:#4fc3f7; font-weight:bold;">Est. cost</td></tr>
      <tr><td colspan="2" style="text-align:right; font-size:14px; color:#4fc3f7; font-weight:bold;">$${totalCost.toFixed(2)}</td></tr>
    </table>
  `;
}
