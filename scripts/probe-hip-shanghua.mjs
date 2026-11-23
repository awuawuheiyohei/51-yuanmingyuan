/**
 * **垂脊 × 山花 交接处几何偏差探针**
 *
 * 量三件事：
 *   ① 垂脊（ridge 桶里那条斜脊）与**屋面实体**的距离 ⇒ 浮空 / 沉入
 *   ② 垂脊首点与**山花顶点**的距离 ⇒ 交接缝
 *   ③ 山花三条边与**垂脊中线**的偏差
 *
 * 判据：垂脊是压在屋面上的脊瓦，它的**中线**应落在屋面上（偏差 ≈ 半个脊宽），
 *       而**脊身底面**应贴合屋面 ⇒ 中线偏差 ≈ +rw/2。
 */
import * as THREE from 'three';
import { buildRoof } from '../src/scene/buildings/parts/roof.js';

const spec = {
  name: '大歇山（九洲清晏主殿）',
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
const yBreak = rest.eaveY + rest.rise * 0.58;
const ridgeY = rest.eaveY + rest.rise;

console.log(`=== ${name} ===`);
console.log(`xh=${xh.toFixed(3)} Wx=${Wx.toFixed(3)} zBreak=${zBreak.toFixed(4)} yBreak=${yBreak.toFixed(3)} ridgeY=${ridgeY.toFixed(3)}`);

function verts(bucket) {
  const out = [];
  for (const g of res.geoms.get(bucket) ?? []) {
    if (!g?.attributes?.position) continue;
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) out.push([p.getX(i), p.getY(i), p.getZ(i)]);
  }
  return out;
}

const tile = verts('tile');
const shanhua = verts('shanhua');
const wall = verts('wall');
const ridge = verts('ridge');
console.log(`桶：tile ${tile.length}  shanhua ${shanhua.length}  wall ${wall.length}  ridge ${ridge.length}`);

// ---- 山花的三个角 ----
const sh = [...shanhua].sort((a, b) => b[1] - a[1]);
console.log(`\n[山花] 顶点（去重）：`);
const uniq = [];
for (const v of sh) {
  if (!uniq.some((u) => Math.abs(u[0] - v[0]) < 1e-6 && Math.abs(u[1] - v[1]) < 1e-6 && Math.abs(u[2] - v[2]) < 1e-6)) uniq.push(v);
}
uniq.forEach((v) => console.log(`   (${v.map((n) => n.toFixed(3)).join(', ')})`));

// ---- 垂脊：ridge 桶里 x > 0 且 z > 0 的那一条（+X/+Z 角）----
const hip = ridge
  .filter((v) => v[0] > xh - 0.01 && v[2] > 0)
  .sort((a, b) => a[2] - b[2]);
console.log(`\n[垂脊] +X/+Z 角，点数 ${hip.length}：`);

// 屋面实体（tile）建 KD 式粗查：按 x 分桶
const buckets = new Map();
for (const v of tile) {
  const k = Math.round(v[0] * 4);
  if (!buckets.has(k)) buckets.set(k, []);
  buckets.get(k).push(v);
}
function nearestSurface(p) {
  let best = Infinity;
  let bp = null;
  const k0 = Math.round(p[0] * 4);
  for (let k = k0 - 3; k <= k0 + 3; k++) {
    for (const v of buckets.get(k) ?? []) {
      const dx = v[0] - p[0];
      const dy = v[1] - p[1];
      const dz = v[2] - p[2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < best) { best = d; bp = v; }
    }
  }
  return { d: best, p: bp };
}

let maxDev = 0;
let maxAt = null;
for (const v of hip) {
  const { d, p } = nearestSurface(v);
  if (d > maxDev) { maxDev = d; maxAt = { v, p }; }
  if (d > 0.05) {
    console.log(
      `   (${v.map((n) => n.toFixed(2)).join(', ')})  → 屋面 ${d.toFixed(3)} m` +
      (p ? `  最近点 (${p.map((n) => n.toFixed(2)).join(', ')})` : '')
    );
  }
}
console.log(`\n[①] 垂脊 → 屋面 最大偏差 ${maxDev.toFixed(3)} m` + (maxAt ? ` @ (${maxAt.v.map((n) => n.toFixed(2)).join(', ')})` : ''));

// ---- ② 垂脊首点 ↔ 山花尖（排除悬鱼：悬鱼挂在尖下方、x 更外） ----
const apexOfShanhua = uniq
  .filter((v) => v[0] > 0 && Math.abs(v[0] - xh) < 0.02)
  .reduce((m, v) => (v[1] > m[1] ? v : m), [0, -Infinity, 0]);
const first = hip[0];
let bestD = Infinity;
let bestV = null;
for (const v of uniq) {
  const d = Math.hypot(v[0] - first[0], v[1] - first[1], v[2] - first[2]);
  if (d < bestD) { bestD = d; bestV = v; }
}
console.log(`[②] 垂脊首点 (${first.map((n) => n.toFixed(3)).join(', ')}) → 最近山花桶顶点 (${bestV.map((n) => n.toFixed(3)).join(', ')})：${bestD.toFixed(3)} m`);
console.log(`    山花尖 = (${apexOfShanhua.map((n) => n.toFixed(3)).join(', ')})；垂脊首点与山花尖相距 ${Math.hypot(first[0] - apexOfShanhua[0], first[1] - apexOfShanhua[1], first[2] - apexOfShanhua[2]).toFixed(3)} m`);

// ---- ②b 射线遮挡法：**已废弃**（判据不可信） ----
/**
 * ⚠⚠ 2026-11-18 删掉原来的「沿 −X 打射线看谁先挡住」判据：
 *   · 博风板是 BoxGeometry，只有 8 个角点 ⇒ 按顶点邻域测板中段必然测不到；
 *   · 改成射线后，取样点又正好压在 half-plane 边界上 ⇒ 结论抖动（7/18、6/18 乱跳）。
 *   ⇒ **不要用射线遮挡判据验构件位置**，要**把构件位置解析算出来比对**。
 *   替代：`scripts/check-roof-gable-trim.mjs`（博风板 8 角点 + 跨骑博缝 + 悬鱼贴板皮）。
 *
 *   另外：山花是否被屋面压住，**取决于观察方向**，不是固定属性 ——
 *   正对山墙端看，垂脊正好挡住山花；斜 30~60° 看就能看到。
 *   ⇒ 这件事只能靠**截图**判断，不能用单一方向的射线断言。
 */



// ---- ③ 山花边 ↔ 垂脊中线：山花斜边上任一点到垂脊折线的距离 ----
function distToPolyline(p, poly) {
  let best = Infinity;
  for (let i = 0; i + 1 < poly.length; i++) {
    const a = poly[i], b = poly[i + 1];
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
    const L2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
    let t = L2 > 0 ? (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    const q = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
    const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    if (d < best) best = d;
  }
  return best;
}
const apex = uniq.reduce((m, v) => (v[1] > m[1] ? v : m), uniq[0]);
const base = uniq.reduce((m, v) => (v[1] < m[1] ? v : m), uniq[0]);
const mid = uniq.find((v) => v !== apex && v !== base);
console.log(`[③] 山花斜边中点到垂脊折线：${distToPolyline(mid, hip).toFixed(3)} m`);
console.log(`    山花斜边端点 → 垂脊折线：${distToPolyline(base, hip).toFixed(3)} m`);
console.log(`    山花尖 → 垂脊折线：${distToPolyline(apex, hip).toFixed(3)} m`);

// ---- ④ 山花是否被屋面遮住：沿 +X→-X 打射线，看山花面上 (y,z) 处先命中谁 ----
//     简化：比较山花面上下沿在每个 z 的「屋面最低点」是否低于山花
let hidden = 0;
let checked = 0;
for (let z = -zBreak + 0.2; z < zBreak; z += 0.4) {
  // 山花面上该 z 的上下沿
  const f = Math.abs(z) / zBreak;
  const yTop = ridgeY - (ridgeY - yBreak) * Math.pow(f, 0.62); // 悬山剖面（rake）
  const yBot = yBreak;
  // 该 z 处、x > xh 的屋面最低高度（角部落到底）
  let minSurf = Infinity;
  for (const v of tile) {
    if (v[0] <= xh + 1e-3) continue;
    if (Math.abs(v[2] - z) > 0.25) continue;
    if (v[1] < minSurf) minSurf = v[1];
  }
  if (!isFinite(minSurf)) continue;
  checked++;
  if (minSurf < yTop - 0.01) hidden++;
}
console.log(`[④] 山花被山墙端屋面遮挡的 z 采样：${hidden}/${checked} 处被遮` +
  (checked ? `（${((hidden / checked) * 100).toFixed(0)}%）` : ''));
