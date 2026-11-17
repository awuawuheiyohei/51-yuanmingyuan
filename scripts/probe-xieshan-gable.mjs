/**
 * 歇山**山墙端**（+X）几何体检：把山面区域的屋面顶点按 (x,z) 打印出来，
 * 用来肉眼核对「山面是斜面、檐口线是水平线、正脊端点接得上垂脊」。
 *
 * 用法：node scripts/probe-xieshan-gable.mjs
 */
import * as THREE from 'three';
import { buildRoof } from '../src/scene/buildings/parts/roof.js';

const spec = {
  name: '大歇山（九州清晏主殿）',
  type: 'xieshan',
  width: 38.98,
  depth: 22.61,
  eaveY: 9.17,
  rise: 10.13,
  overhang: 1.42,
  hipRunX: 5.43,
};
const { name, ...rest } = spec;
const res = buildRoof(rest);
const Wx = rest.width / 2 + rest.overhang;
const Wz = rest.depth / 2 + rest.overhang;
const xh = rest.width / 2;
const zBreak = Wz * Math.pow(0.42, 1 / 0.62);

console.log(`=== ${name} ===`);
console.log(`Wx=${Wx.toFixed(3)} Wz=${Wz.toFixed(3)} xh(山花)=${xh.toFixed(3)} zBreak=${zBreak.toFixed(4)}`);

// ---- 1. 檐口线：x = Wx 的所有顶点，其 y 应当全是 eaveY ----
const tile = (res.geoms.get('tile') ?? []).filter((g) => g?.attributes?.position);
let eaveMax = -Infinity;
let eaveMin = Infinity;
let eaveN = 0;
for (const g of tile) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    if (Math.abs(x - Wx) > 0.02) continue;
    const y = p.getY(i);
    eaveMax = Math.max(eaveMax, y);
    eaveMin = Math.min(eaveMin, y);
    eaveN++;
  }
}
console.log(
  `\n[1] 檐口线 x=Wx：${eaveN} 个顶点，y ∈ [${eaveMin.toFixed(3)}, ${eaveMax.toFixed(3)}] ` +
  `（应恒等于 eaveY=${rest.eaveY}）${Math.abs(eaveMax - rest.eaveY) < 0.05 && Math.abs(eaveMin - rest.eaveY) < 0.05 ? '✅' : '❌ 檐口不水平'}`
);

// ---- 2. 山面剖面：取 z = 0 与 z = ±zBreak/2 两条切片，打印 (x, y) ----
for (const zc of [0, zBreak / 2, zBreak]) {
  const row = [];
  for (const g of tile) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const y = p.getY(i);
      if (Math.abs(z - zc) > 0.03) continue;
      if (x < xh - 0.3) continue; // 只看山墙端
      row.push([x, y]);
    }
  }
  row.sort((a, b) => a[0] - b[0]);
  // 同 x 只留最高点（那是屋面上表面）
  const prof = [];
  for (const [x, y] of row) {
    if (prof.length && Math.abs(prof[prof.length - 1][0] - x) < 0.05) {
      prof[prof.length - 1][1] = Math.max(prof[prof.length - 1][1], y);
    } else prof.push([x, y]);
  }
  console.log(`\n[2] 剖面 z=${zc.toFixed(3)}（x ≥ ${xh.toFixed(2)}）：`);
  console.log(
    '    ' + prof.map(([x, y]) => `(${x.toFixed(2)}, ${y.toFixed(2)})`).join('  ')
  );
}

// ---- 3. 山花 / 山墙 / 垂脊 的实际几何范围 ----
for (const bucket of ['shanhua', 'wall', 'ridge']) {
  const gs = res.geoms.get(bucket) ?? [];
  let bb = null;
  for (const g of gs) {
    if (!g?.attributes?.position) continue;
    g.computeBoundingBox();
    if (!bb) bb = g.boundingBox.clone();
    else bb.union(g.boundingBox);
  }
  if (bb) {
    console.log(
      `\n[3] ${bucket} 桶 x∈[${bb.min.x.toFixed(2)}, ${bb.max.x.toFixed(2)}] ` +
      `y∈[${bb.min.y.toFixed(2)}, ${bb.max.y.toFixed(2)}] z∈[${bb.min.z.toFixed(2)}, ${bb.max.z.toFixed(2)}]`
    );
  }
}
