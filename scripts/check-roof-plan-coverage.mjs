/**
 * **屋面平面覆盖自检** —— 找出屋顶"盖不满"的地方（破洞 / 缺口）。
 *
 * ⚠ 为什么不能只靠 `check-roof-coverage.mjs`（自上而下打射线）：
 *   射线是**垂直**的 ⇒ 只能发现"从上往下漏"的洞。
 *   歇山山墙端的破洞是**近乎竖直**的（山面/山花交界的窄缝），
 *   垂直射线打不中 ⇒ 那套检查全过，画面上却是两个大洞。
 *
 * 判据（与射线无关，纯几何）：
 *   屋面是一个**单值高度场** ⇒ 它在平面上的投影应当覆盖整个
 *   `[-Wx, Wx] × [-Wz, Wz]` 矩形（出檐已算在 Wx/Wz 里）。
 *   ⇒ 把所有 `tile` 桶三角形的**平面投影**光栅化成格子，
 *     任何"格子中心落在所有三角形之外"的区域 ⇒ **洞**。
 *
 *   边界容差：檐口外沿一圈（0.3m）不参与判定（那里本来就该是空的），
 *   正脊/折线这类**内部**折线不得用容差糊过去。
 */
import * as THREE from 'three';
import { buildRoof } from '../src/scene/buildings/parts/roof.js';

const CASES = {
  daxie: { name: '大歇山（九州清晏主殿）', type: 'xieshan', width: 38.98, depth: 22.61, eaveY: 9.17, rise: 10.13, overhang: 1.42, hipRunX: 5.43 },
  xieshan: { name: '歇山（奉三无私殿）', type: 'xieshan', width: 32.48, depth: 20.46, eaveY: 10.1, rise: 8.44, overhang: 1.14, hipRunX: 4.91 },
  wudian: { name: '庑殿（正大光明殿）', type: 'wudian', width: 32.48, depth: 20.46, eaveY: 9.6, rise: 8.2, overhang: 1.4, hipRunX: 6.2 },
};

const CELL = 0.1;      // 光栅格 10cm
const EDGE = 0.35;     // 檐口外沿容差（不判定）

function planTris(res, bucket) {
  const out = [];
  const list = res.geoms.get(bucket) ?? [];
  for (const g of list) {
    if (!g?.attributes?.position) continue;
    const pos = g.attributes.position;
    const idx = g.index;
    const tri = Math.floor((idx ? idx.count : pos.count) / 3);
    for (let t = 0; t < tri; t++) {
      const ii = [0, 1, 2].map((k) => (idx ? idx.getX(t * 3 + k) : t * 3 + k));
      const p = ii.map((i) => [pos.getX(i), pos.getZ(i)]);
      // 退化三角形（正脊线上三点共线）直接丢掉
      const area =
        Math.abs(
          (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) -
          (p[2][0] - p[0][0]) * (p[1][1] - p[0][1])
        ) / 2;
      if (area < 1e-9) continue;
      out.push(p);
    }
  }
  return out;
}

function pointInTri(px, pz, t) {
  const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
  const d1 = d(t[0], t[1], [px, pz]);
  const d2 = d(t[1], t[2], [px, pz]);
  const d3 = d(t[2], t[0], [px, pz]);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

let bad = 0;

for (const [key, spec] of Object.entries(CASES)) {
  const { name, ...rest } = spec;
  const res = buildRoof(rest);
  const Wx = rest.width / 2 + (rest.overhang ?? 1.3);
  const Wz = rest.depth / 2 + (rest.overhang ?? 1.3);

  const tris = planTris(res, 'tile');
  const nx = Math.ceil((2 * Wx) / CELL);
  const nz = Math.ceil((2 * Wz) / CELL);
  const covered = new Uint8Array(nx * nz);

  // 逐三角形 → 包围盒 → 只在包围盒里的格子上做点在三角形内判定
  for (const t of tris) {
    const minx = Math.min(t[0][0], t[1][0], t[2][0]);
    const maxx = Math.max(t[0][0], t[1][0], t[2][0]);
    const minz = Math.min(t[0][1], t[1][1], t[2][1]);
    const maxz = Math.max(t[0][1], t[1][1], t[2][1]);
    const i0 = Math.max(0, Math.floor((minx + Wx) / CELL));
    const i1 = Math.min(nx - 1, Math.floor((maxx + Wx) / CELL));
    const j0 = Math.max(0, Math.floor((minz + Wz) / CELL));
    const j1 = Math.min(nz - 1, Math.floor((maxz + Wz) / CELL));
    for (let i = i0; i <= i1; i++) {
      const px = -Wx + (i + 0.5) * CELL;
      for (let j = j0; j <= j1; j++) {
        const pz = -Wz + (j + 0.5) * CELL;
        if (covered[i * nz + j]) continue;
        if (pointInTri(px, pz, t)) covered[i * nz + j] = 1;
      }
    }
  }

  // 收集洞（排除檐口外沿一圈）
  const holes = [];
  for (let i = 0; i < nx; i++) {
    const x = -Wx + (i + 0.5) * CELL;
    if (Math.abs(x) > Wx - EDGE) continue;
    for (let j = 0; j < nz; j++) {
      const z = -Wz + (j + 0.5) * CELL;
      if (Math.abs(z) > Wz - EDGE) continue;
      if (!covered[i * nz + j]) holes.push([x, z]);
    }
  }

  // 按 0.5m 聚类，方便人读
  const clusters = new Map();
  for (const [x, z] of holes) {
    const k = `${Math.floor(x / 0.5)}|${Math.floor(z / 0.5)}`;
    if (!clusters.has(k)) clusters.set(k, []);
    clusters.get(k).push([x, z]);
  }

  const total = nx * nz;
  const cov = covered.reduce((a, b) => a + b, 0);
  console.log(`\n=== ${name} (${key}) ===`);
  console.log(`  tile 桶三角 ${tris.length}  平面覆盖 ${cov}/${total} = ${((cov / total) * 100).toFixed(1)}%`);
  console.log(`  洞格 ${holes.length}  聚类 ${clusters.size}`);
  for (const [, pts] of clusters) {
    const xs = pts.map((p) => p[0]);
    const zs = pts.map((p) => p[1]);
    const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const cz = zs.reduce((a, b) => a + b, 0) / zs.length;
    console.log(
      `    x∈[${Math.min(...xs).toFixed(2)}, ${Math.max(...xs).toFixed(2)}] ` +
      `z∈[${Math.min(...zs).toFixed(2)}, ${Math.max(...zs).toFixed(2)}] ` +
      `中心 (${cx.toFixed(2)}, ${cz.toFixed(2)})  ${pts.length} 格`
    );
  }
  if (clusters.size) bad++;
}

console.log(`\n${bad ? `❌ ${bad} 个屋面存在平面缺口` : '✅ 所有屋面平面覆盖完整'}`);
process.exit(bad ? 1 : 0);
