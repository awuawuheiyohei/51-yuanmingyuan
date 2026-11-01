/**
 * 穿模检测器（Node 端，不开浏览器）
 * ================================
 *
 * ## 为什么要有这个
 *
 * 「不要有穿模的情况」是硬要求，但**靠截图看是看不出来的**：
 *   · 屋面下的梁架戳出屋面 —— 只有某个角度看得见；
 *   · 游廊从殿里穿过去 —— 远看只是"廊和殿挨着"；
 *   · 水面与地形共面 —— 变成蓝绿棋盘格，一眼是"贴图错"而不是"穿模"。
 *
 * 所以这里做**几何级**的检测：拿真实数据算，拿真实数字报。
 *
 * ## 检什么
 *
 * 1. **水面 ↔ 地形**：水面与地面高程差 < 容差 ⇒ 共面 z-fighting
 *    （蓝绿棋盘格就是它）
 * 2. **水面 ↔ 水面**：两个水体贴在同一高程 ⇒ 同样 z-fighting
 * 3. **建筑 ↔ 地形**：建筑基面低于地形 ⇒ 沉进地里；高于地形 ⇒ 悬空
 * 4. **游廊 ↔ 建筑**：廊的折线穿过殿宇 ⇒ 廊穿殿（屋面交叠）
 * 5. **建筑 ↔ 建筑**：四十景建筑之间互相重叠
 *
 * ## 用法
 *
 *   node scripts/check-interpenetration.mjs
 *
 * 退出码：0 = 全过；1 = 有问题（CI 可直接用）。
 *
 * 依赖：`public/scene/scene.json`（`npm run scene` 生成）
 * 与 `src/scene/buildings/modular.js`（尺寸推导，与运行时同源）。
 */
import fs from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENE_PROGRAM } from '../src/scene/scenes-program.js';
import { deriveDimensions, separateFootprints } from '../src/scene/buildings/modular.js';
import { defaultForm } from '../src/scene/buildings/index.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sceneData = JSON.parse(fs.readFileSync(resolve(ROOT, 'public/scene/scene.json'), 'utf8'));

/** 容差（米） */
const TOL = {
  water: 0.25, // 水面与地形的高差小于此 ⇒ 共面
  waterWater: 0.12,
  ground: 0.6, // 建筑四角地面高差
  corridor: 0.0,
};

const problems = [];
const add = (kind, msg, extra = {}) =>
  problems.push({ kind, msg, ...extra });

/* ------------------------------------------------------------------ *
 * 地形采样
 * ------------------------------------------------------------------ */
const T = sceneData.terrain;
if (!T) {
  console.error('缺少 public/scene/scene.json 里的 terrain —— 先跑 `npm run scene`');
  process.exit(2);
}

/** 双线性插值取地面高程（米） */
function groundAt(x, z) {
  const fx = ((x - T.xMin) / (T.xMax - T.xMin)) * (T.size - 1);
  const fz = ((z - T.zMin) / (T.zMax - T.zMin)) * (T.size - 1);
  const x0 = Math.floor(fx);
  const z0 = Math.floor(fz);
  if (x0 < 0 || z0 < 0 || x0 >= T.size - 1 || z0 >= T.size - 1) return null;
  const tx = fx - x0;
  const tz = fz - z0;
  const h00 = T.heights[z0 * T.size + x0];
  const h10 = T.heights[z0 * T.size + x0 + 1];
  const h01 = T.heights[(z0 + 1) * T.size + x0];
  const h11 = T.heights[(z0 + 1) * T.size + x0 + 1];
  return (
    h00 * (1 - tx) * (1 - tz) +
    h10 * tx * (1 - tz) +
    h01 * (1 - tx) * tz +
    h11 * tx * tz
  );
}

/** 点是否在水体多边形内 */
function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** 两段线是否真交（不含共端点） */
function segsCross(p1, p2, p3, p4) {
  const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(p3, p4, p1);
  const d2 = d(p3, p4, p2);
  const d3 = d(p1, p2, p3);
  const d4 = d(p1, p2, p4);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
         ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** 两个多边形是否真的相交（不是只包围盒重叠） */
function ringsOverlap(A, B) {
  // 一方的顶点落在另一方内
  for (const p of A) if (pointInRing(p[0], p[1], B)) return true;
  for (const p of B) if (pointInRing(p[0], p[1], A)) return true;
  // 边相交
  for (let i = 0; i < A.length; i++) {
    const a1 = A[i];
    const a2 = A[(i + 1) % A.length];
    for (let j = 0; j < B.length; j++) {
      const b1 = B[j];
      const b2 = B[(j + 1) % B.length];
      if (segsCross(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

/* ------------------------------------------------------------------ *
 * 1) 水面 ↔ 地形：共面 z-fighting
 * ------------------------------------------------------------------ */
const waters = sceneData.water || [];
let waterSamples = 0;
for (const w of waters) {
  const level = w.level ?? w.z;
  if (level == null) continue;
  const ring = w.ring || [];
  if (ring.length < 3) continue;
  // 在包围盒内均匀取样
  const xs = ring.map((p) => p[0]);
  const zs = ring.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const N = 40;
  let coplanar = 0;
  let underground = 0;
  let total = 0;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const x = minX + ((maxX - minX) * i) / N;
      const z = minZ + ((maxZ - minZ) * j) / N;
      if (!pointInRing(x, z, ring)) continue;
      total++;
      const g = groundAt(x, z);
      if (g == null) continue;
      const diff = g - level;
      if (Math.abs(diff) < TOL.water) coplanar++;
      else if (diff < 0) underground++; // 地面低于水面 = 水在地形之上，正常
      waterSamples++;
    }
  }
  if (coplanar > 0) {
    add(
      'water-terrain',
      `水体「${w.name || '(无名)'}」有 ${coplanar}/${total} 个采样点与地形共面（高差 < ${TOL.water}m）` +
        ` ⇒ 会 z-fighting（蓝绿棋盘格）`,
      { at: [Math.round((minX + maxX) / 2), Math.round((minZ + maxZ) / 2)] }
    );
  }
  if (underground > 0) {
    add(
      'water-terrain',
      `水体「${w.name || '(无名)'}」有 ${underground}/${total} 个采样点的地面低于水面 ` +
        `⇒ 水淹陆地`,
      { at: [Math.round((minX + maxX) / 2), Math.round((minZ + maxZ) / 2)] }
    );
  }
}

/* ------------------------------------------------------------------ *
 * 2) 水面 ↔ 水面：同高程重叠
 * ------------------------------------------------------------------ */
for (let i = 0; i < waters.length; i++) {
  for (let j = i + 1; j < waters.length; j++) {
    const a = waters[i];
    const b = waters[j];
    const la = a.level ?? a.z;
    const lb = b.level ?? b.z;
    if (la == null || lb == null) continue;
    if (Math.abs(la - lb) > TOL.waterWater) continue;
    // 包围盒先粗筛
    const box = (w) => {
      const xs = w.ring.map((p) => p[0]);
      const zs = w.ring.map((p) => p[1]);
      return [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    };
    const [ax0, ax1, az0, az1] = box(a);
    const [bx0, bx1, bz0, bz1] = box(b);
    if (ax1 < bx0 || bx1 < ax0 || az1 < bz0 || bz1 < az0) continue;
    // 再做**真实多边形相交**判定（包围盒重叠 ≠ 相交）
    if (!ringsOverlap(a.ring, b.ring)) continue;
    add(
      'water-water',
      `水体「${a.name || a.cx?.toFixed(0)}」与「${b.name || b.cx?.toFixed(0)}」` +
        `高程相同（${la.toFixed(2)}m）且范围重叠 ⇒ 会 z-fighting`
    );
  }
}

/* ------------------------------------------------------------------ *
 * 3~5) 建筑相关
 * ------------------------------------------------------------------ */
const PAD = 1.6; // 与 layout.js 的 OVERHANG_PAD 一致
const buildings = [];
for (const s of sceneData.scenes || []) {
  const prog = SCENE_PROGRAM[s.name];
  if (!prog || !prog.main) continue;
  const D = deriveDimensions({
    mian: prog.main.mian,
    jin: prog.main.jin,
    rank: prog.rank,
    platform: prog.main.platform,
    roof: prog.main.roof,
  });
  const fp = [{ x: 0, z: 0, hw: D.width / 2, hd: D.depth / 2 }];
  const names = [s.name + ' 主殿'];
  for (const a of prog.aux || []) {
    const af = defaultForm(a.rank);
    const AD = deriveDimensions({
      mian: a.mian ?? af.mian,
      jin: a.jin ?? af.jin,
      rank: a.rank,
      platform: a.rank === 'pavilion' ? 'none' : 'simple',
      roof: af.roof,
    });
    fp.push({ x: a.x, z: a.z, hw: AD.width / 2, hd: AD.depth / 2 });
    names.push(s.name + '/' + (a.name || a.rank));
  }
  // 与运行时同一份分离算法（否则推开的配殿会压在游廊上）
  const sep = separateFootprints(
    fp.map((f) => ({ ...f, hw: f.hw + PAD, hd: f.hd + PAD })),
    PAD
  );
  fp.forEach((f, i) => {
    buildings.push({
      name: names[i],
      x: s.x + sep[i].x,
      z: s.z + sep[i].z,
      hw: f.hw,
      hd: f.hd,
      scene: s.name,
    });
  });
}

// 3) 建筑 ↔ 地形：沉地 / 悬空
for (const b of buildings) {
  let minG = Infinity;
  let maxG = -Infinity;
  for (const [ox, oz] of [
    [-b.hw, -b.hd],
    [b.hw, -b.hd],
    [b.hw, b.hd],
    [-b.hw, b.hd],
  ]) {
    const g = groundAt(b.x + ox, b.z + oz);
    if (g == null) continue;
    minG = Math.min(minG, g);
    maxG = Math.max(maxG, g);
  }
  if (minG === Infinity) continue;
  if (maxG - minG > TOL.ground) {
    add(
      'building-ground',
      `建筑「${b.name}」四角地面高差 ${(maxG - minG).toFixed(2)}m > ${TOL.ground}m ` +
        `⇒ 台基一端悬空 / 一端埋进地里`,
      { at: [Math.round(b.x), Math.round(b.z)], d: +(maxG - minG).toFixed(2) }
    );
  }
}

// 4) 游廊 ↔ 建筑：廊穿殿
/** 线段 vs 轴对齐矩形（Liang-Barsky） */
function segRect(x1, z1, x2, z2, cx, cz, hw, hd) {
  let t0 = 0;
  let t1 = 1;
  const dx = x2 - x1;
  const dz = z2 - z1;
  const p = [-dx, dx, -dz, dz];
  const q = [x1 - (cx - hw), cx + hw - x1, z1 - (cz - hd), cz + hd - z1];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
    }
  }
  return true;
}

let corridorSegs = 0;
for (const line of sceneData.corridors || []) {
  for (let i = 0; i < line.length - 1; i++) {
    corridorSegs++;
    const [x1, z1] = line[i];
    const [x2, z2] = line[i + 1];
    for (const b of buildings) {
      if (segRect(x1, z1, x2, z2, b.x, b.z, b.hw + 0.4, b.hd + 0.4)) {
        add('corridor-building', `游廊穿过建筑「${b.name}」`, {
          at: [Math.round((x1 + x2) / 2), Math.round((z1 + z2) / 2)],
        });
        break;
      }
    }
  }
}

// 5) 建筑 ↔ 建筑
for (let i = 0; i < buildings.length; i++) {
  for (let j = i + 1; j < buildings.length; j++) {
    const a = buildings[i];
    const b = buildings[j];
    if (a.scene === b.scene) continue; // 同一景内由 separate() 保证
    if (
      Math.abs(a.x - b.x) < a.hw + b.hw - 0.05 &&
      Math.abs(a.z - b.z) < a.hd + b.hd - 0.05
    ) {
      add('building-building', `建筑「${a.name}」与「${b.name}」重叠`, {
        at: [Math.round((a.x + b.x) / 2), Math.round((a.z + b.z) / 2)],
      });
    }
  }
}

/* ------------------------------------------------------------------ *
 * 报告
 * ------------------------------------------------------------------ */
console.log('穿模检测（几何级，不开浏览器）');
console.log('─'.repeat(72));
console.log(`  水体 ${waters.length} 处 · 采样点 ${waterSamples} · 四十景建筑 ${buildings.length} 座 · 游廊段 ${corridorSegs}`);

const byKind = {};
for (const p of problems) byKind[p.kind] = (byKind[p.kind] || 0) + 1;

if (!problems.length) {
  console.log('\n  ✅ 未发现穿模 / z-fighting');
  process.exit(0);
}

console.log('');
for (const p of problems.slice(0, 40)) {
  const at = p.at ? `  @(${p.at[0]}, ${p.at[1]})` : '';
  console.log(`  ✗ [${p.kind}] ${p.msg}${at}`);
}
if (problems.length > 40) console.log(`  … 另有 ${problems.length - 40} 条`);
console.log(
  `\n  ❌ 共 ${problems.length} 处：` +
    Object.entries(byKind)
      .map(([k, v]) => `${k} ${v}`)
      .join(' · ')
);
process.exit(1);
