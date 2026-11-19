/**
 * **步步锦格心自检**
 *
 * ## 背景
 *
 * 2026-11-19 用 3D设计（cq-viewer）导**单扇槅扇白模**做正面体检时发现：
 * 格心读作"**两根梯子** + 中间一条空带"，根本不是步步锦。
 *
 * 数值定位（`buildBubuJin`）：奇数列的横棂写成 `x0 − len ⇒ x0`
 * ⇒ 它**跑到前一格里去了**。后果有两个：
 *   ① 偶数列的格子被前后两根横棂**完全跨满**（没有空隙）；
 *   ② **奇数列的格子一根横棂都没有**（全空）⇒ 就是白模里那条"空带"；
 *   ③ 与前一格的横棂**同 z 重叠** ⇒ z-fighting。
 *
 * ## 判据（几何级，不看渲染）
 *
 * 把格心的 XY 覆盖**光栅化**，然后逐格看：
 * **每一格（去掉靠竖棂的边距）都必须有横棂**。
 *   · 旧写法 ⇒ 奇数列整列为空 ⇒ ❌
 *   · 新写法 ⇒ 每列都有横棂（长短交替成"步步"）⇒ ✅
 *
 * ⚠ 顺带查"格心覆盖率"：太低说明棂条太稀（远看是空架子）。
 */
import * as THREE from 'three';
import { buildBubuJin, bubuJinGrid } from '../src/scene/buildings/parts/lattice.js';

/** 典型一扇槅扇（九州清晏主殿明间，实测：格心 1.254m × 3.788m） */
const CASES = [
  { name: '大歇山明间槅扇', w: 1.254, h: 3.788, t: 0.042 },
  { name: '小式槅扇（窄）', w: 0.62, h: 2.1, t: 0.042 },
];

const CELL = 0.004; // 光栅 4mm
let failures = 0;
const fail = (m) => {
  failures++;
  console.log(`  ✗ ${m}`);
};

for (const c of CASES) {
  console.log(`\n=== ${c.name}（格心 ${c.w}m × ${c.h}m）===`);
  const g = buildBubuJin(c.w, c.h, c.t);
  const grid = bubuJinGrid(c.w, c.h);
  const { cols, rows, cw, rh, barW } = grid;
  console.log(
    `  分格 ${cols} 列 × ${rows} 行（格 ${(cw * 100).toFixed(1)}cm × ${(rh * 100).toFixed(1)}cm）· 棂条宽 ${(barW * 100).toFixed(1)}cm`
  );

  // ---- 光栅化 XY 覆盖（所有棂条都是轴对齐长方体 ⇒ 用三角形 bbox 即可）----
  const nx = Math.ceil(c.w / CELL) + 1;
  const ny = Math.ceil(c.h / CELL) + 1;
  const cov = new Uint8Array(nx * ny);
  const pos = g.attributes.position;
  const idx = g.index;
  const nTri = Math.floor((idx ? idx.count : pos.count) / 3);
  for (let t = 0; t < nTri; t++) {
    const ii = [0, 1, 2].map((k) => (idx ? idx.getX(t * 3 + k) : t * 3 + k));
    const p = ii.map((i) => [pos.getX(i), pos.getY(i)]);
    const minX = Math.min(p[0][0], p[1][0], p[2][0]);
    const maxX = Math.max(p[0][0], p[1][0], p[2][0]);
    const minY = Math.min(p[0][1], p[1][1], p[2][1]);
    const maxY = Math.max(p[0][1], p[1][1], p[2][1]);
    const i0 = Math.max(0, Math.floor((minX + c.w / 2) / CELL));
    const i1 = Math.min(nx - 1, Math.ceil((maxX + c.w / 2) / CELL));
    const j0 = Math.max(0, Math.floor((minY + c.h / 2) / CELL));
    const j1 = Math.min(ny - 1, Math.ceil((maxY + c.h / 2) / CELL));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) cov[j * nx + i] = 1;
    }
  }
  let covered = 0;
  for (let k = 0; k < cov.length; k++) covered += cov[k];
  const ratio = (covered * CELL * CELL) / (c.w * c.h);
  console.log(`  覆盖率 ${(ratio * 100).toFixed(1)}%`);
  if (ratio < 0.06) fail(`覆盖率只有 ${(ratio * 100).toFixed(1)}% —— 棂条太稀，远看是"空架子"`);

  // ---- 逐列逐行分界线检查：**每条行分界线上，每一列都要有一根横棂穿过** ----
  //
  // ⚠ 横棂是画在**行分界线上**的（格心的上下沿由绦环板/裙板收边），
  //   所以"格子内部"本来就不该有横棂 —— 要查的是
  //   「行分界线 × 列内区段」这个位置上**有没有横棂**。
  const margin = barW * 0.75; // 去掉靠竖棂的边距
  let empty = 0;
  const emptyCols = new Set();
  for (let cc = 0; cc < cols; cc++) {
    const x0 = -c.w / 2 + cc * cw;
    for (let rr = 1; rr < rows; rr++) {
      const yr = -c.h / 2 + rr * rh;
      const i0 = Math.ceil((x0 + margin + c.w / 2) / CELL);
      const i1 = Math.floor((x0 + cw - margin + c.w / 2) / CELL);
      const j0 = Math.ceil((yr - barW * 0.4 + c.h / 2) / CELL);
      const j1 = Math.floor((yr + barW * 0.4 + c.h / 2) / CELL);
      let hit = 0;
      for (let j = j0; j <= j1 && !hit; j++)
        for (let i = i0; i <= i1; i++) if (cov[j * nx + i]) { hit = 1; break; }
      if (!hit) {
        empty++;
        emptyCols.add(cc);
      }
    }
  }
  if (empty) {
    fail(
      `有 ${empty} 处「列 × 行分界线」上**没有横棂**（涉及第 ${[...emptyCols].sort((a, b) => a - b).join('、')} 列）` +
        ` ⇒ 横棂跑到别的格里去了`
    );
  } else {
    console.log(`  ✅ 每条行分界线上、每一列都有横棂（${cols} 列 × ${rows - 1} 行全部有）`);
  }
}

console.log('');
if (failures) {
  console.log(`❌ 步步锦格心自检：${failures} 项不合格`);
  process.exit(1);
}
console.log('✅ 步步锦格心自检：每格都有横棂，长短交替成"步步"');
