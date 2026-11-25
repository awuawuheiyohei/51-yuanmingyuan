#!/usr/bin/env node
/**
 * **构件穿屋面检测**（全园 42 景，Node 端）
 * ==========================================
 *
 * ## 为什么要有这个
 *
 * 「某个构件戳出了屋面」是渲染里**最难看出**的一类错误：
 * 只有在某个特定角度、某个特定距离才会露出一点点。
 * 上一轮在 3D设计白模里抓到的「翼状竖板」就是这一类。
 *
 * 现有的 `check-roof-coverage.mjs`（自上往下打射线查屋面破洞）与
 * `check-ridge-purlin.mjs`（脊瓜柱）只覆盖**特定构件**。
 * ⇒ 这里做**通用**检测：任何建筑本体构件，只要它的顶点**高过该点��屋面**，
 *   就是穿模。
 *
 * ## 做法
 *
 * ① 对每座建筑，按屋面的高度场 `surfAtXY(x, z)` 求该点的屋面高度；
 * ② 遍历建筑本体的所有几何（**不含屋面本身**），
 *    找出顶点 y 明显高于屋面高度的那些（容差 TOL.roof）；
 * ③ 报出构件类别与超出量。
 *
 * ⚠ **必须排除合法的高出**：
 *   · 屋面自己的构件（tile/ridge/board/eave/finial/shanhua…）
 *   · 正脊上的宝顶（finial）、垂脊走兽 —— 它们本就高过坡面
 *   · 雷公柱/斗栱：坐在檐口**内侧**，理论上低于屋面
 *   ⇒ 只查**结构层**的桶（与 `check-geometry-invariants` 同源）。
 *
 * ## 用法
 *
 *   node scripts/check-roof-penetration.mjs [--scene=景名] [--verbose]
 *
 * 退出码：0 = 全过；1 = 有穿模。
 */
import * as THREE from 'three';
import { buildStructure } from '../src/scene/buildings/parts/structure.js';
import { buildRoof } from '../src/scene/buildings/parts/roof.js';
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
  /** 构件顶点高出屋面多少才算穿模（浮点与屋面离散化误差） */
  roof: 0.35,
  /** 屋面轮廓的判定：|z| 超过 半进深+出檐 ⇒ 该点在轮廓外，不判 */
  overhang: 1.5,
};

function centerDoors(mian) {
  if (mian <= 1) return [0];
  if (mian % 2 === 1) {
    const c = (mian - 1) / 2;
    return [c - 1, c, c + 1].filter((i) => i >= 0 && i < mian);
  }
  return [mian / 2 - 1, mian / 2];
}

/** 造一座建筑的结构层几何 + 屋面高度场 */
function buildOne(b) {
  const D = deriveDimensions({
    mian: b.mian,
    jin: b.jin,
    rank: b.rank,
    platform: b.platform,
    roof: b.roof,
  });
  const rise = Math.max(2.0, D.width * 0.26);
  const lowerRise = b.doubleEave ? Math.max(0.9, rise * 0.3) : 0;

  const roofG = buildRoof({
    width: D.width,
    depth: D.depth,
    eaveY: D.eaveY,
    platformH: D.platformH,
    roof: b.roof,
    caihua: b.caihua,
    tile: b.tile,
    columnColor: '#8f2820',
    wallType: 'red',
    rise,
    overhang: 1.42,
    hipRunX: D.width * 0.26,
    mian: D.mian,
    jin: D.jin,
    wallTint: () => 1,
    doubleEave: !!b.doubleEave,
    lowerRise,
  });

  const upperEaveY = b.doubleEave
    ? (roofG.meta?.upperEaveY ?? D.eaveY + lowerRise)
    : D.eaveY;

  const st = buildStructure({
    width: D.width,
    depth: D.depth,
    mian: D.mian,
    jin: D.jin,
    platformH: D.platformH,
    platform: b.platform,
    eaveY: upperEaveY,
    lowerEaveY: b.doubleEave ? D.eaveY : null,
    lowerInnerY: b.doubleEave ? roofG.meta?.lowerInnerY : null,
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
    doubleEave: !!b.doubleEave,
    circular: false,
    plaqueText: 'X',
    couplet: null,
    doors: centerDoors(D.mian),
    caojing: D.mian >= 5,
    rise,
    roofSurfAt: roofG.surfAt,
    roofSurfAtXY: roofG.surfAtXY,
    roofRidgeHalfWidth: roofG.roofRidgeHalfWidth,
  });

  return {
    D, st,
    surfAtXY: roofG.surfAtXY,
    ridgeY: roofG.meta?.ridgeY,
    upperEaveY: b.doubleEave ? (roofG.meta?.upperEaveY ?? D.eaveY + lowerRise) : D.eaveY,
    lowerInnerY: b.doubleEave ? roofG.meta?.lowerInnerY : null,
  };
}

/** 结构层里可能合法高过屋面的桶（宝顶/走兽在脊上，斗栱在檐下） */
const ALLOW_HIGH = new Set(['finial']);

/**
 * **正脊轴线附近的木作**（脊檩/脊瓜柱）**不参与穿模判定**。
 *
 * ⚠⚠ 原因（实测）：屋面高度场 `surfAtXY(x, z)` 在**正脊处是尖峰**——
 *   中轴上高 6.62（脊顶），而 z = −0.12（脊檩的边缘）处只有 6.30（脊旁坡面）。
 *   脊檩是**骑在脊上**的通长木件（z ∈ [−0.12, 0.14]，顶 6.51）
 *   ⇒ 它必然「高出」z=±0.12 处的坡面高度，**但它并没有穿出屋面**
 *   （它藏在正脊之下，正脊盖住它）。
 *
 * ⇒ 判据：对 |z| ≤ 脊半宽 的顶点，**与脊顶高度比**，而不是与坡面高度比。
 */
const RIDGE_HALF_W = 0.35; // 正脊半宽（米）

const problems = [];
const sceneNames = args.scene
  ? String(args.scene).split(',')
  : Object.keys(SCENE_PROGRAM);

console.log(`构件穿屋面检测 · ${sceneNames.length} 景\n`);

for (const sceneName of sceneNames) {
  const prog = SCENE_PROGRAM[sceneName];
  if (!prog) continue;
  const m = prog.main;

  const list = [
    {
      label: '主殿',
      mian: m.mian, jin: m.jin, rank: prog.rank, roof: m.roof, caihua: m.caihua,
      platform: m.platform, tile: m.tile, doubleEave: !!m.doubleEave,
    },
  ];
  for (const a of prog.aux || []) {
    const af = defaultForm(a.rank);
    list.push({
      label: a.name || `配殿(${a.rank})`,
      mian: a.mian ?? af.mian, jin: a.jin ?? af.jin, rank: a.rank, roof: af.roof,
      caihua: af.caihua,
      platform: a.rank === 'pavilion' || a.rank === 'corridor' ? 'none' : 'simple',
      tile: m.tile, doubleEave: false,
    });
  }

  const sceneIssues = [];
  for (const b of list) {
    const { D, st, surfAtXY, ridgeY, upperEaveY, lowerInnerY } = buildOne(b);
    if (!surfAtXY) continue;

    for (const [bucket, geos] of st.geoms.entries()) {
      if (ALLOW_HIGH.has(bucket)) continue;
      /**
       * ⚠ **重檐的雷公柱**：它在腰檐与上檐之间的**楼身**里，
       *   高于腰檐屋面是**合法的**（楼身本来就该有东西）。
       *   ⇒ 重檐时，柱桶里高于腰檐屋面的部分（= 雷公柱）不参与判定。
       */
      const skipAboveY = b.doubleEave ? (lowerInnerY ?? D.eaveY) : null;
      let worst = null;
      for (const g of geos) {
        if (!g || !g.isBufferGeometry) continue;
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i);
          const y = p.getY(i);
          const z = p.getZ(i);
          /**
           * 判据用的「屋面高度」：
           *   · 正脊轴线附近（|z| ≤ 脊半宽）⇒ 用**脊顶高度**比
           *     （脊檩/脊瓜柱骑在脊上，本来就接近脊顶）
           *   · 别处 ⇒ 用该点的坡面高度比
           */
          const onRidge = Math.abs(z) <= RIDGE_HALF_W;
          const surf = onRidge
            ? (ridgeY != null ? ridgeY : surfAtXY(x, z))
            : surfAtXY(x, z);
          if (surf == null || !isFinite(surf)) continue;
          /**
           * ⚠ **点在屋面轮廓之外 ⇒ 高度场失效**，不能据此判穿模。
           *
           * 例：角柱在建筑角上（x = ±width/2），它的 z 已越过檐口
           *   ⇒ `surfAtXY` 返回的是**边缘的低值**（如 6.02），
           *   而柱顶在 11.48 ⇒ 误报「高出 5.46m」。
           *   踏跺/御路伸出檐外（z = depth/2 + 0.95）也是同理。
           *
           * ⇒ 只对**落在建筑本体轮廓之内**（|z| ≤ 半进深）**且**
           *   **不在角部**（|x| ≤ 半面阔）的顶点判穿模。
           *
           * ⚠ 角部为什么也要排除：角柱/角斗栱/角部彩画板都在**戗脊斜收**的
           *   轮廓之外 —— 屋面在那里已经斜下去，高度场给出的低值没有意义。
           *   实测同一栋建筑的 7 个桶（柱/斗栱/勾头/彩画/檩/裙板/墙）
           *   全在 x ≈ −24.1~−25.3（半面阔 24.10）处报 ⇒ 全是角部构件。
           */
          if (Math.abs(z) > D.depth / 2) continue;
          if (Math.abs(x) > D.width / 2) continue;
          // 雷公柱（重檐）：柱身在楼身里，不算穿模
          if (skipAboveY != null && y >= skipAboveY - 0.02) continue;
          const over = y - surf;
          if (over > TOL.roof && (!worst || over > worst.over)) {
            worst = { over, x, y, z, surf, onRidge };
          }
        }
      }
      if (worst) {
        const msg =
          `【穿屋面】${b.label} 的 ${bucket} 桶有顶点高出屋面 ${worst.over.toFixed(2)}m：` +
          `(x=${worst.x.toFixed(2)}, y=${worst.y.toFixed(2)}, z=${worst.z.toFixed(2)}) ` +
          `屋面高 ${worst.surf.toFixed(2)}${worst.onRidge ? '（脊顶）' : ''}`;
        sceneIssues.push(msg);
        problems.push({ scene: sceneName, msg });
      }
    }
  }

  const mark = sceneIssues.length ? '✗' : '✓';
  console.log(`  ${mark} ${sceneName}${sceneIssues.length ? `  （${sceneIssues.length} 项）` : ''}`);
  for (const msg of sceneIssues) console.log(`      ${msg}`);
}

console.log('\n────────────────────────────');
if (!problems.length) {
  console.log('✓ 未发现构件穿出屋面');
  process.exit(0);
}
console.log(`✗ 发现 ${problems.length} 项穿模`);
process.exit(1);
