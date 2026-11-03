#!/usr/bin/env node
/**
 * **建筑屋面互相穿插**检测（景内：主殿 vs 配殿、配殿 vs 配殿）
 *
 * ## 为什么要有这个
 *
 * `separateFootprints()` 只保证**占地矩形**不重叠，
 * 但屋面还要再往外挑（出檐 + 翼角起翘），
 * 两进殿宇之间的间距若小于「半个进深 × 2 + 出檐余量」，
 * 屋面就会**互相插进去** —— 高的一进直接从低的一进屋面上穿出来。
 *
 * 实测：九州清晏主殿（进深 20.5m）与奉三无私殿（中心 +18m）
 * 的屋面在 z≈221~223m 处重叠 2.5m，画面上就是一片黄琉璃被褐色劈开。
 *
 * ## 判据
 *
 * 两座建筑屋面重叠 ⇔ 平面占地（墙身 + 出檐余量）相交。
 * 这里用 `pad` 补上出檐与翼角的水平伸出量。
 *
 * 用法：node scripts/check-building-overlap.mjs
 */
import { deriveDimensions, separateFootprints } from '../src/scene/buildings/modular.js';
import { defaultForm } from '../src/scene/buildings/index.js';
import { SCENE_PROGRAM } from '../src/scene/scenes-program.js';

/** 屋面出檐 + 翼角起翘的水平余量（米） */
const PAD = 1.6;

function sceneFootprints(prog) {
  const m = prog.main;
  const D = deriveDimensions({
    mian: m.mian,
    jin: m.jin,
    rank: prog.rank,
    platform: m.platform,
    roof: m.roof,
  });
  const aux = [];
  for (const a of prog.aux || []) {
    const af = defaultForm(a.rank);
    const mian = a.mian ?? af.mian;
    const jin = a.jin ?? af.jin;
    const AD = deriveDimensions({
      mian,
      jin,
      rank: a.rank,
      platform: a.rank === 'pavilion' ? 'none' : 'simple',
      roof: af.roof,
    });
    aux.push({ a, AD, name: a.name || `配殿(${a.rank})` });
  }
  const list = [
    { name: '主殿', x: 0, z: 0, hw: D.width / 2 + PAD, hd: D.depth / 2 + PAD },
    ...aux.map(({ a, AD, name }) => ({
      name,
      x: a.x,
      z: a.z,
      hw: AD.width / 2 + PAD,
      hd: AD.depth / 2 + PAD,
    })),
  ];
  return { list, D, aux };
}

let problems = 0;
const rows = [];
const after = [];

for (const [name, prog] of Object.entries(SCENE_PROGRAM)) {
  const { list } = sceneFootprints(prog);
  // 分离**之前**的原始重叠（= 数据源里的间距问题）
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const f = list[i];
      const q = list[j];
      const ox = f.hw + q.hw - Math.abs(f.x - q.x);
      const oz = f.hd + q.hd - Math.abs(f.z - q.z);
      if (ox > 0 && oz > 0) {
        problems++;
        rows.push(
          `  ✗ ${name}: ${f.name} ↔ ${q.name} 重叠 ${Math.min(ox, oz).toFixed(2)}m` +
            `（x 间距 ${Math.abs(f.x - q.x).toFixed(1)}m / z 间距 ${Math.abs(f.z - q.z).toFixed(1)}m）`
        );
      }
    }
  }
  // 分离**之后**（= 运行时真正摆出来的位置）是否还有重叠
  const sep = separateFootprints(
    list.map((f) => ({ x: f.x, z: f.z, hw: f.hw, hd: f.hd })),
    PAD
  );
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const f = { ...list[i], ...sep[i] };
      const q = { ...list[j], ...sep[j] };
      const ox = f.hw + q.hw - Math.abs(f.x - q.x);
      const oz = f.hd + q.hd - Math.abs(f.z - q.z);
      if (ox > 0 && oz > 0) {
        after.push(
          `  ✗ ${name}: ${f.name} ↔ ${q.name} 分离后仍重叠 ${Math.min(ox, oz).toFixed(2)}m` +
            `（x ${Math.abs(f.x - q.x).toFixed(1)}m / z ${Math.abs(f.z - q.z).toFixed(1)}m）`
        );
      }
    }
  }
}

console.log('景内建筑屋面重叠检测（主殿 vs 配殿 / 配殿 vs 配殿）');
console.log('─'.repeat(78));
console.log(`  ${Object.keys(SCENE_PROGRAM).length} 景 · 出檐余量 ${PAD}m`);
console.log('');
if (rows.length) {
  console.log('【分离前】数据源里的间距不足：');
  rows.forEach((r) => console.log(r));
} else {
  console.log('  ✅ 分离前无重叠');
}
console.log('');
if (after.length) {
  console.log('【分离后】运行时仍重叠（真正的穿模）：');
  after.forEach((r) => console.log(r));
} else {
  console.log('  ✅ 分离后无重叠');
}
console.log('');
// ⚠ 退出码只看**分离后**（= 运行时真正的位置）。
//   "分离前"那几条是**数据源里的间距不足**，由分离算法在运行时自动拉开，
//   不是失败 —— 否则 npm run check 会在这一项直接中断。
process.exit(after.length ? 1 : 0);
