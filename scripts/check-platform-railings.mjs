#!/usr/bin/env node
/**
 * **悬空台基构件检测**（全园 42 景）
 * ================================
 *
 * ## 为什么要有这个
 *
 * 2026-11-25 白模体检抓到：**全园 41 座小建筑**（亭/牌楼/钟鼓楼/小匡庐…）
 * 的台基上有**两处真 bug**：
 *
 * ① **踏跺超宽**：`sw = min(bayW * 2.8, 9.5)` **完全不看建筑多宽**
 *    ⇒ 单间小建筑（面阔 2.60m）算出 **sw = 7.28m**，比建筑本身还宽 4.68m
 *    ⇒ 踏跺与御路从台基里「长」出去一截，远看是一条脱开的台阶。
 *
 * ② **悬空勾栏**：栏杆宽 `rw = Math.max(2, (width - sw) / 2 - 0.4)` ——
 *    `Math.max(2, …)` 把**负数兜成 2**，于是本该「不建」的栏杆反而被造出来，
 *    而且被放在离建筑 3.6m 的地方 ⇒ **一段望柱+华板浮在半空、无任何承托**。
 *
 * ## 判据
 *
 * ① **望柱必须坐在台基上**：望柱（窄而高的小件）的水平位置必须落在
 *    **台基的水平范围内**。落在外面 ⇒ 悬空。
 * ② **踏跺不得宽过建筑面阔**：踏跺宽度 ≤ 面阔 + 容差。
 *
 * ## 反向验证
 *
 * 装回 bug 版（`sw` 不收窄 + `Math.max(2, …)`）⇒ 判据**必须失败**。
 *
 * ## 用法
 *
 *   node scripts/check-platform-railings.mjs [--scene=景名] [--verbose]
 */
import * as THREE from 'three';
import { buildStructure } from '../src/scene/buildings/parts/structure.js';
import { deriveDimensions } from '../src/scene/buildings/modular.js';
import { defaultForm } from '../src/scene/buildings/index.js';
import { SCENE_PROGRAM } from '../src/scene/scenes-program.js';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);
const VERBOSE = !!args.verbose;

/** 容差（米） */
const TOL = {
  /** 望柱允许落在台基外的余量 */
  railOutside: 0.15,
  /** 踏跺允许比面阔宽出的余量 */
  stepOver: 0.15,
  /** 勾栏的「薄」特征：某个方向小于此值 */
  railThin: 0.42,
  /** 望柱的高度下限 */
  railMinH: 0.45,
};

function centerDoors(mian) {
  if (mian <= 1) return [0];
  if (mian % 2 === 1) {
    const c = (mian - 1) / 2;
    return [c - 1, c, c + 1].filter((i) => i >= 0 && i < mian);
  }
  return [mian / 2 - 1, mian / 2];
}

/** 造一座建筑的结构层 */
function buildOne(b) {
  const D = deriveDimensions({
    mian: b.mian,
    jin: b.jin,
    rank: b.rank,
    platform: b.platform,
    roof: b.roof,
  });
  const st = buildStructure({
    width: D.width,
    depth: D.depth,
    mian: D.mian,
    jin: D.jin,
    platformH: D.platformH,
    platform: b.platform,
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
    roof: b.roof,
    caihua: b.caihua,
    tile: b.tile,
    columnColor: '#8f2820',
    wallType: 'red',
    doubleEave: false,
    circular: false,
    plaqueText: 'X',
    couplet: null,
    doors: centerDoors(D.mian),
    caojing: false,
    rise: Math.max(1.6, D.width * 0.26),
  });
  return { D, st };
}

const problems = [];
const sceneNames = args.scene
  ? String(args.scene).split(',')
  : Object.keys(SCENE_PROGRAM);

console.log(`悬空台基构件检测 · ${sceneNames.length} 景\n`);

for (const sceneName of sceneNames) {
  const prog = SCENE_PROGRAM[sceneName];
  if (!prog) continue;
  const m = prog.main;

  const list = [
    {
      label: '主殿', mian: m.mian, jin: m.jin, rank: prog.rank, roof: m.roof,
      caihua: m.caihua, platform: m.platform, tile: m.tile,
    },
  ];
  for (const a of prog.aux || []) {
    const af = defaultForm(a.rank);
    list.push({
      label: a.name || `配殿(${a.rank})`,
      mian: a.mian ?? af.mian, jin: a.jin ?? af.jin, rank: a.rank, roof: af.roof,
      caihua: af.caihua,
      // ⚠ 亭（pavilion）**实际是有台基的**：`buildBuilding` 用的是
      //   `defaultForm(rank).platform`，而 pavilion = 'simple'（不是 'none'）。
      //   layout.js 里写 'none' 只是算台基高时的名义值（因 platformH 有 0.22 下限，
      //   两者数值相同）⇒ **不能按 'none' 跳过亭**，否则漏检。
      platform: defaultForm(a.rank).platform,
      tile: m.tile,
    });
  }

  const sceneIssues = [];
  for (const b of list) {
    if (b.platform === 'none') continue;
    const { D, st } = buildOne(b);
    const stone = st.geoms.get('stone') || [];
    if (!stone.length) continue;

    // 台基 = 水平投影面积最大的那件
    let plat = null;
    for (const g of stone) {
      g.computeBoundingBox();
      const bb = g.boundingBox;
      const area = (bb.max.x - bb.min.x) * (bb.max.z - bb.min.z);
      if (!plat || area > plat.area) {
        plat = { bb, area };
      }
    }
    const platX0 = plat.bb.min.x;
    const platX1 = plat.bb.max.x;
    const platZ0 = plat.bb.min.z;
    const platZ1 = plat.bb.max.z;

    // ---- 判据 ①：望柱/栏板必须坐在台基上 ----
    for (const g of stone) {
      g.computeBoundingBox();
      const bb = g.boundingBox;
      const w = bb.max.x - bb.min.x;
      const h = bb.max.y - bb.min.y;
      const d = bb.max.z - bb.min.z;
      /**
       * 勾栏（望柱+华板）的特征：**薄**（一个方向很薄）且**高于台基面**。
       *
       * ⚠ 实测 bug 版的勾栏：w=2.19, h=0.94, **d=0.34**
       *   ⇒ 特征是「**薄**」（d 小）而不是「整体窄」（w 不小）。
       *   第一版判据写成 `max(w,d) < 0.62` ⇒ 漏检。
       */
      const thin = Math.min(w, d) < TOL.railThin;
      const above = bb.min.y >= D.platformH - 0.05;
      const isRail = thin && above && h > TOL.railMinH && Math.max(w, d) > 0.5;
      if (!isRail) continue;
      const cx = (bb.min.x + bb.max.x) / 2;
      const cz = (bb.min.z + bb.max.z) / 2;
      const outsideX = cx < platX0 - TOL.railOutside || cx > platX1 + TOL.railOutside;
      const outsideZ = cz < platZ0 - TOL.railOutside || cz > platZ1 + TOL.railOutside;
      if (outsideX || outsideZ) {
        const msg =
          `【悬空望柱】${b.label} 有勾栏落在台基之外：` +
          `位置 (x=${cx.toFixed(2)}, z=${cz.toFixed(2)})，` +
          `台基范围 x[${platX0.toFixed(2)},${platX1.toFixed(2)}] z[${platZ0.toFixed(2)},${platZ1.toFixed(2)}]` +
          `（半空无承托）`;
        sceneIssues.push(msg);
        problems.push({ scene: sceneName, msg });
      }
    }

    // ---- 判据 ②：踏跺不得宽过台基 ----
    //
    // ⚠ 基准是**台基宽**（不是面阔）：清式的踏跺是台基前的一阶，
    //   宽度可以接近甚至略过面阔，但不能超出**台基**——
    //   超出台基就是「从台基里长出去一截」的脱开状态。
    //   实测：单间小殿面阔 2.60、台基宽 4.50 ⇒ 踏跺 2.97 是合法的。
    const platW = platX1 - platX0;
    for (const g of stone) {
      g.computeBoundingBox();
      const bb = g.boundingBox;
      const w = bb.max.x - bb.min.x;
      // 踏跺特征：横向宽、在 +Z 侧（正面台阶）
      const isStep = w > platW + TOL.stepOver && bb.min.z > D.depth / 2 - 0.2;
      if (isStep) {
        const msg =
          `【踏跺超宽】${b.label} 的踏跺宽 ${w.toFixed(2)}m，超过台基宽 ` +
          `${platW.toFixed(2)}m（超 ${(w - platW).toFixed(2)}m）⇒ 与台基脱开`;
        sceneIssues.push(msg);
        problems.push({ scene: sceneName, msg });
      }
    }

    if (VERBOSE) {
      console.log(
        `    ${b.label}: 面阔 ${D.width.toFixed(2)} 进深 ${D.depth.toFixed(2)} ` +
        `台基 x[${platX0.toFixed(2)},${platX1.toFixed(2)}] z[${platZ0.toFixed(2)},${platZ1.toFixed(2)}]`
      );
    }
  }

  const mark = sceneIssues.length ? '✗' : '✓';
  console.log(`  ${mark} ${sceneName}${sceneIssues.length ? `  （${sceneIssues.length} 项）` : ''}`);
  for (const msg of sceneIssues) console.log(`      ${msg}`);
}

console.log('\n────────────────────────────');
if (!problems.length) {
  console.log('✓ 未发现悬空的台基构件');
  process.exit(0);
}
console.log(`✗ 发现 ${problems.length} 项违例`);
process.exit(1);
