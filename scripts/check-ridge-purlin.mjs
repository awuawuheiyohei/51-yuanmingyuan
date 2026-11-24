#!/usr/bin/env node
/**
 * **脊瓜柱穿模自检**（全园）
 *
 * ## 背景
 *
 * 2026-11-24 在 3D设计（cq-viewer）整景白模里看到：每座歇山殿的屋脊上方
 * 都有一根**细竖线**。第一反应是「脊瓜柱穿出屋面」。
 *
 * 实测（射线 + bbox）结论：**不是穿模** —— 那是**正脊构件**
 * （`ridge` 桶，0.21m 见方的细长盒体）在等轴测投影下的形状。
 * 渲染时正脊被瓦面与自身厚度遮住，白模（单材质、无遮挡优化）才显形。
 *
 * 但"脊瓜柱到底有没有戳出屋面"这个问题本身必须能自动回答。
 *
 * ## 判据（几何级，射线）
 *
 * 对每一座歇山/庑殿/卷棚歇山建筑：
 *   ① 在每个中柱线位置（`|x| < 面阔 × 0.26`）找出该处的**脊瓜柱顶**；
 *   ② 从柱顶**往上 0.5m** 向下打射线（`Mesh.raycast` 按 `material.side`
 *      剔背面 ⇒ 屋面法线朝上，**必须从上往下打**）；
 *   ③ 必须**先命中屋面**（命中点 y ≥ 柱顶）⇒ 柱在屋面之下。
 *
 * ⚠ **反向验证**：把柱顶人为抬高到屋面之上，判据必须失败。
 *
 * 用法：node scripts/check-ridge-purlin.mjs
 */
import * as THREE from 'three';
import { buildStructure } from '../src/scene/buildings/parts/structure.js';
import { buildRoof } from '../src/scene/buildings/parts/roof.js';
import { deriveDimensions } from '../src/scene/buildings/modular.js';
import { defaultForm } from '../src/scene/buildings/index.js';
import { SCENE_PROGRAM } from '../src/scene/scenes-program.js';

/** 哪些屋顶做法有正脊（需要查脊瓜柱） */
const RIDGE_ROOFS = /xieshan|wudian|juanpeng/;

let failures = 0;
const fail = (m) => {
  failures++;
  console.log(`  ✗ ${m}`);
};

function buildOne({ mian, jin, rank, roof, caihua, platform, tile }) {
  const D = deriveDimensions({ mian, jin, rank, platform, roof });
  const spec = {
    rank,
    width: D.width,
    depth: D.depth,
    mian,
    jin,
    platformH: D.platformH,
    platform,
    eaveY: D.eaveY,
    colDia: D.colDia,
    colH: D.colH,
    wallThick: D.wallThick,
    dougongJumps: D.dougongJumps,
    dougongScale: D.dougongScale,
    dougongHeight: D.dougongHeight,
    hasDougong: D.hasDougong,
    doukou: D.doukou,
    beamH: D.beamH,
    colXs: D.colXs,
    bayWidths: D.bayWidths,
    roof,
    caihua,
    tile,
    columnColor: '#8f2820',
    wallType: 'red',
    doubleEave: false,
    circular: false,
    plaqueText: 'x',
    couplet: null,
    doors: [1, 2, 3],
    doorsAllSides: false,
    caojing: mian >= 5,
    rise: Math.max(2.0, D.width * 0.26),
  };
  const roofG = buildRoof({
    width: spec.width,
    depth: spec.depth,
    eaveY: spec.eaveY,
    platformH: spec.platformH,
    roof,
    caihua,
    tile,
    columnColor: spec.columnColor,
    wallType: spec.wallType,
    rise: spec.rise,
    overhang: 1.42,
    hipRunX: spec.width * 0.26,
    mian,
    jin,
    wallTint: () => 1,
  });
  const st = buildStructure({
    ...spec,
    roofSurfAt: roofG.surfAt,
    roofSurfAtXY: roofG.surfAtXY,
    roofRidgeHalfWidth: roofG.roofRidgeHalfWidth,
  });
  return { spec, D, st, roofG };
}

/** 找出该 x 处脊瓜柱的顶面高度 */
function ridgePostTop(st, x, eaveY) {
  let top = null;
  for (const g of st.geoms.get('wood') || []) {
    if (!g || !g.isBufferGeometry) continue;
    g.computeBoundingBox();
    const b = g.boundingBox;
    if (
      b.max.y > eaveY &&
      b.max.x - b.min.x < 0.5 &&
      Math.abs((b.min.x + b.max.x) / 2 - x) < 0.5
    ) {
      if (top === null || b.max.y > top) top = b.max.y;
    }
  }
  return top;
}

console.log('脊瓜柱穿模检测（柱顶必须被屋面覆盖）');
console.log('─'.repeat(78));

let checked = 0;
let buildings = 0;
const bad = [];

for (const [sceneName, prog] of Object.entries(SCENE_PROGRAM)) {
  const items = [{ label: '主殿', rank: null, mian: prog.main.mian, jin: prog.main.jin, roof: prog.main.roof, caihua: prog.main.caihua, platform: prog.main.platform, tile: prog.main.tile }];
  for (const a of prog.aux || []) {
    const df = defaultForm(a.rank);
    items.push({
      label: a.name || a.rank,
      rank: a.rank,
      mian: a.mian ?? df.mian,
      jin: a.jin ?? df.jin,
      roof: df.roof,
      caihua: df.caihua,
      platform: a.rank === 'pavilion' || a.rank === 'corridor' ? 'none' : 'simple',
      tile: prog.main.tile,
    });
  }
  for (const it of items) {
    if (!RIDGE_ROOFS.test(it.roof)) continue;
    const { spec, D, st, roofG } = buildOne(it);
    buildings++;

    // 屋面网格（射线用）
    const meshes = [];
    for (const [, l] of roofG.geoms.entries()) {
      for (const g of l) {
        if (!g || !g.isBufferGeometry) continue;
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial());
        m.updateMatrixWorld();
        meshes.push(m);
      }
    }
    const rc = new THREE.Raycaster();
    const midXs = D.colXs.filter((x) => Math.abs(x) < D.width * 0.26);
    for (const x of midXs.length ? midXs : [0]) {
      const top = ridgePostTop(st, x, spec.eaveY);
      if (top === null) continue;
      checked++;
      rc.set(new THREE.Vector3(x, top + 0.5, 0), new THREE.Vector3(0, -1, 0));
      const hits = rc.intersectObjects(meshes, false);
      const roofY = hits.length ? hits[0].point.y : -Infinity;
      if (top > roofY + 0.02) {
        bad.push(`${sceneName} / ${it.label}  x=${x.toFixed(1)}  柱顶 ${top.toFixed(2)} 屋面 ${roofY.toFixed(2)}`);
      }
    }
  }
}

console.log(`  ${Object.keys(SCENE_PROGRAM).length} 景 · ${buildings} 座有脊建筑 · 查 ${checked} 处脊瓜柱`);
console.log('');
if (bad.length) {
  fail(`${bad.length} 处脊瓜柱戳出屋面：`);
  for (const b of bad.slice(0, 10)) console.log(`      · ${b}`);
  if (bad.length > 10) console.log(`      · …另有 ${bad.length - 10} 处`);
} else {
  console.log('  ✅ 所有脊瓜柱都被屋面覆盖（白模里的"竖线"是正脊投影，不是穿模）');
}

// ---- 反向验证：把柱顶人为抬高，判据必须失败 ----
{
  const { spec, D, st, roofG } = buildOne({
    mian: 5, jin: 5, rank: 'hall', roof: 'xieshan', caihua: 'xuanzi',
    platform: 'xumizuo', tile: 'lv',
  });
  const meshes = [];
  for (const [, l] of roofG.geoms.entries()) {
    for (const g of l) {
      if (!g || !g.isBufferGeometry) continue;
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial());
      m.updateMatrixWorld();
      meshes.push(m);
    }
  }
  const rc = new THREE.Raycaster();
  const midXs = D.colXs.filter((x) => Math.abs(x) < D.width * 0.26);
  const x = midXs.length ? midXs[0] : 0;
  const realTop = ridgePostTop(st, x, spec.eaveY);
  if (realTop === null) {
    fail('反向验证失败：找不到脊瓜柱');
  } else {
    // 假想：柱顶被抬到脊高之上 1m
    const fakeTop = spec.eaveY + spec.rise + 1;
    rc.set(new THREE.Vector3(x, fakeTop + 0.5, 0), new THREE.Vector3(0, -1, 0));
    const hits = rc.intersectObjects(meshes, false);
    const roofY = hits.length ? hits[0].point.y : -Infinity;
    if (fakeTop > roofY + 0.02) {
      console.log('  ✓ 判据可反向验证：柱顶抬到屋面之上时判据失败');
    } else {
      fail('判据无效：柱顶抬到屋面之上仍判过');
    }
  }
}

console.log('');
if (failures) {
  console.log(`EXIT: 失败 ${failures} 项`);
  process.exit(1);
}
console.log('EXIT: 全部通过');
