#!/usr/bin/env node
/**
 * **屋面生成自检** —— 逐景逐建筑检查 `buildRoof()` 是否真的产出了几何。
 *
 * ## 为什么查这个
 *
 * 实测：九州清晏一带有一座建筑**整片屋面缺失**（只剩梁架、隔扇、柱子），
 * 但 `buildRoof()` 没报错 ⇒ 问题不在"抛异常"，而在"某个条件下根本没生成"。
 *
 * 用法：node scripts/check-roof-built.mjs
 */
import { deriveDimensions } from '../src/scene/buildings/modular.js';
import { dougongProjection } from '../src/scene/buildings/parts/dougong.js';
import { defaultForm } from '../src/scene/buildings/index.js';
import { buildRoof } from '../src/scene/buildings/parts/roof.js';
import { SCENE_PROGRAM } from '../src/scene/scenes-program.js';

let bad = 0;
console.log('屋面生成自检（每景主殿 + 配殿）');
console.log('─'.repeat(78));

for (const [name, prog] of Object.entries(SCENE_PROGRAM)) {
  const m = prog.main;
  const D = deriveDimensions({
    mian: m.mian,
    jin: m.jin,
    rank: prog.rank,
    platform: m.platform,
    roof: m.roof,
  });
  const cases = [
    { label: '主殿', width: D.width, depth: D.depth, eaveY: D.eaveY, roof: m.roof, doukou: D.doukou },
  ];
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
    const eh = a.eave != null ? a.eave : AD.eaveY - AD.platformH;
    cases.push({
      label: a.name || `配殿(${a.rank})`,
      width: AD.width,
      depth: AD.depth,
      eaveY: AD.platformH + eh,
      roof: af.roof,
      doukou: AD.doukou,
    });
  }

  for (const c of cases) {
    const dgScale = c.doukou ? c.doukou / 0.1 : 0;
    const overhang = dgScale > 0 ? dougongProjection(dgScale) + 0.35 : 1.3;
    let res = null;
    let err = null;
    try {
      res = buildRoof({
        width: c.width,
        depth: c.depth,
        eaveY: c.eaveY,
        rise: Math.max(1.6, c.width * 0.26),
        type: c.roof,
        overhang,
        overhangX: overhang * 0.8,
        hipRunX: Math.max(2.2, c.depth * 0.24),
        upturn: 0.8,
        bulge: 0.45,
        circular: false,
        segments: 30,
        doubleEave: false,
        lowerRise: 0,
      });
    } catch (e) {
      err = e.message;
    }
    if (err) {
      console.log(`  ✗ ${name} / ${c.label}（${c.roof}）：buildRoof 抛错 ${err}`);
      bad++;
      continue;
    }
    let tris = 0;
    let buckets = 0;
    for (const [, list] of res.geoms) {
      buckets++;
      for (const g of list) {
        if (!g || !g.attributes) continue;
        tris += Math.floor((g.index ? g.index.count : g.attributes.position.count) / 3);
      }
    }
    if (tris === 0) {
      console.log(
        `  ✗ ${name} / ${c.label}（${c.roof} w=${c.width.toFixed(1)} d=${c.depth.toFixed(1)} eave=${c.eaveY.toFixed(1)}）：屋面三角 0`
      );
      bad++;
    }
  }
}

console.log('');
console.log(bad ? `  ❌ ${bad} 处屋面缺失` : '  ✅ 所有建筑都生成了屋面');
process.exit(bad ? 1 : 0);
