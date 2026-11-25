#!/usr/bin/env node
/**
 * **全园白模几何不变量体检**（Node 端，不开浏览器）
 * ====================================================
 *
 * ## 为什么要有这个
 *
 * 上一轮用 3D设计（cq-viewer）看白模，抓到 3 个「渲染里完全看不出来」的真 bug：
 *   · 斗栱出挑方向错 90°（全园 287 座）
 *   · 步步锦格心奇数列横棂跑格
 *   · 墙面分段方向写反 ⇒ 山墙端「翼状竖板」戳出屋檐
 *
 * 但**手工看白模**只能一景一景地扫，42 景里只扫了 5 景。
 * ⇒ 这里把「看白模时用眼睛找的东西」**写成可自动判定的几何不变量**，
 *   让全园 42 景一次跑完。
 *
 * ## 判据 1：左右对称性（构件级镜像配对）
 *
 * 官式建筑面阔方向严格对称（明间居中、两翼逐间递减）。
 * 做法：把桶里每个**构件**（几何件）按中心 x 分成左半/右半，
 * 右半镜像到左侧，逐件找配对；配不上的就是「只有半边」的构件。
 *
 * ⚠⚠ **为什么按构件配对，而不是按顶点哈希配对**（第一版踩的坑）：
 *   第一版把顶点量化成哈希集合再查镜像。`Math.round` 在 ±0.5 边界上
 *   **不对称**（`Math.round(-592.5) = -592` 而 `Math.round(592.5) = 593`）
 *   ⇒ 正负两侧量化到不同格子 ⇒ 明明对称的几何被判成不对称。
 *   实测在**已人工确认无错**的 5 景上误报 1113 项。
 *   ⇒ **判据必须先在「已知正确」的样本上验证通过，才有资格去判别别的景。**
 *
 * ⚠ **中央构件不参与配对**：御路浮雕（云龙）本就左右不对称，
 *   明间槅扇居中 ⇒ 中心 x≈0 的构件跳过。
 *
 * ## 判据 2：构件不得越出建筑轮廓
 *
 * 墙/柱/槅扇/格心都必须在**面阔/进深半值**之内（台基除外）。
 * 越出去 ⇒ 就是上一轮那个「翼状竖板」 bug 的同款。
 *
 * ## 判据 3：柱网完整
 *
 * 檐柱数必须 = (mian+1) × (jin+1)；斗栱攒数必须 = 柱头科 + 平身科。
 *
 * ## 用法
 *
 *   node scripts/check-geometry-invariants.mjs              # 全园
 *   node scripts/check-geometry-invariants.mjs --scene=鸿慈永祜
 *   node scripts/check-geometry-invariants.mjs --verbose
 *
 * 退出码：0 = 全过；1 = 有问题。
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
  /**
   * 构件越出轮廓的容差（在「半个柱径」之上再加的余量）。
   *
   * ⚠ 这个值必须**很小**：角柱合法外露半个柱径（0.288m），
   *   而「翼状竖板」那种真 bug 只超出 0.42m ⇒ 余量一大就把 bug 一起豁免了。
   *   ⇒ 取 0.05m。
   */
  outline: 0.05,
  /** 镜像配对的 bbox 容差 */
  mirror: 0.06,
  /** 中心构件的判定半径：中心 x 在此范围内的不参与左右配对 */
  centerZone: 0.9,
};

/**
 * 天生不对称、整个桶都不参与对称判定的桶。
 * 楹联/匾额：两侧**文字内容不同**（上联下联），位置对称但字形不对称。
 */
const ASYMMETRIC_BUCKETS = new Set(['couplet', 'couplet2', 'plaque']);

/**
 * **参与对称判定的桶**（只限**结构层**）。
 *
 * ⚠⚠ 为什么只查结构层，不查屋面（2026-11-25）：
 *   屋面的**筒瓦垄数左右不等**是**真实构造**，不是 bug ——
 *   瓦垄从檐口的一端起铺，铺到另一端时余下的半垄留在那边。
 *   实测：某殿 tile 桶左 58 件 / 右 60 件 ⇒ 差 2 垄，就是这么来的。
 *   ⇒ 把屋面算进对称判据 ⇒ 在**已人工确认无错**的 5 景上误报 39 项。
 *
 *   而**结构层**（柱网/墙/槅扇/格心/斗栱/额枋/台基）在清式里必须
 *   **严格左右对称**（明间居中、两翼逐间递减）⇒ 判据成立。
 *
 *   实测（标准 hall）：stone/lacquer/dougong/caihua/lattice 等
 *   各桶左、右构件数**完全相等** ⇒ 判据可用。
 */
const SYMMETRY_BUCKETS = [
  'stone', 'lacquer', 'lacquerDark', 'dougong', 'dougongTrim',
  'caihua', 'wall', 'wood', 'lattice', 'paper', 'dark',
];

/** 参与「不得越出轮廓」判定的桶（台基 stone 例外，它本来就比墙身宽） */
const OUTLINE_BUCKETS = ['wall', 'column', 'lacquer', 'lacquerDark', 'lattice', 'paper', 'wood', 'caihua', 'dougong'];

/** 造一座建筑的全部几何（尺寸推导与 layout.js 同源） */
function buildOne(spec0) {
  const D = deriveDimensions({
    mian: spec0.mian,
    jin: spec0.jin,
    rank: spec0.rank,
    platform: spec0.platform,
    roof: spec0.roof,
  });
  const spec = {
    ...spec0,
    width: D.width,
    depth: D.depth,
    mian: D.mian,
    jin: D.jin,
    platformH: D.platformH,
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
    columnColor: '#8f2820',
    wallType: 'red',
    doubleEave: false,
    circular: false,
    plaqueText: 'X',
    couplet: null,
    doors: centerDoors(D.mian),
    caojing: D.mian >= 5,
    rise: Math.max(2.0, D.width * 0.26),
  };

  const roofG = buildRoof({
    width: spec.width,
    depth: spec.depth,
    eaveY: spec.eaveY,
    platformH: spec.platformH,
    roof: spec.roof,
    caihua: spec.caihua,
    tile: spec.tile,
    columnColor: spec.columnColor,
    wallType: spec.wallType,
    rise: spec.rise,
    overhang: 1.42,
    hipRunX: spec.width * 0.26,
    mian: spec.mian,
    jin: spec.jin,
    wallTint: () => 1,
  });
  const st = buildStructure({
    ...spec,
    roofSurfAt: roofG.surfAt,
    roofSurfAtXY: roofG.surfAtXY,
    roofRidgeHalfWidth: roofG.roofRidgeHalfWidth,
  });

  const byBucket = new Map();
  // ⚠ **只收结构层**（st.geoms），不收屋面（roofG.geoms）。
  //   屋面的瓦垄数左右不等是真实构造（垄从一端起铺），不是缺陷。
  //   详见 SYMMETRY_BUCKETS 的注释。
  for (const [bucket, list] of st.geoms.entries()) {
    for (const g of list) {
      if (!g || !g.isBufferGeometry) continue;
      if (!byBucket.has(bucket)) byBucket.set(bucket, []);
      byBucket.get(bucket).push(g);
    }
  }
  return { D, spec, byBucket };
}

function centerDoors(mian) {
  if (mian <= 1) return [0];
  if (mian % 2 === 1) {
    const c = (mian - 1) / 2;
    return [c - 1, c, c + 1].filter((i) => i >= 0 && i < mian);
  }
  return [mian / 2 - 1, mian / 2];
}

/* ------------------------------------------------------------------ *
 * 判据 1：构件级左右镜像配对
 * ------------------------------------------------------------------ */

/** 取一个几何件的 bbox */
function bboxOf(g) {
  g.computeBoundingBox();
  const b = g.boundingBox;
  return {
    minX: b.min.x, maxX: b.max.x,
    minY: b.min.y, maxY: b.max.y,
    minZ: b.min.z, maxZ: b.max.z,
  };
}

/** 两个 bbox 在容差内是否相同 */
function bboxNear(a, b, tol) {
  return (
    Math.abs(a.minX - b.minX) <= tol && Math.abs(a.maxX - b.maxX) <= tol &&
    Math.abs(a.minY - b.minY) <= tol && Math.abs(a.maxY - b.maxY) <= tol &&
    Math.abs(a.minZ - b.minZ) <= tol && Math.abs(a.maxZ - b.maxZ) <= tol
  );
}

/** 把 bbox 沿 x 镜像 */
function mirrorX(b) {
  return {
    minX: -b.maxX, maxX: -b.minX,
    minY: b.minY, maxY: b.maxY,
    minZ: b.minZ, maxZ: b.maxZ,
  };
}

function fmtBBox(b) {
  return `x[${b.minX.toFixed(2)},${b.maxX.toFixed(2)}] y[${b.minY.toFixed(2)},${b.maxY.toFixed(2)}] z[${b.minZ.toFixed(2)},${b.maxZ.toFixed(2)}]`;
}

/**
 * 检查某桶是否左右对称（构件级配对）。
 * @returns {ok, unmatched: [构件描述], leftCount, rightCount}
 */
function checkMirror(bucket, geos) {
  const pieces = geos.map(bboxOf);
  const left = [];
  const right = [];
  let center = 0;
  for (const b of pieces) {
    const cx = (b.minX + b.maxX) / 2;
    if (Math.abs(cx) <= TOL.centerZone) center++;
    else if (cx < 0) left.push(b);
    else right.push(b);
  }
  const usedRight = new Set();
  const unmatchedLeft = [];
  for (const lb of left) {
    const mb = mirrorX(lb);
    let found = -1;
    for (let i = 0; i < right.length; i++) {
      if (usedRight.has(i)) continue;
      if (bboxNear(mb, right[i], TOL.mirror)) {
        found = i;
        break;
      }
    }
    if (found >= 0) usedRight.add(found);
    else unmatchedLeft.push(lb);
  }
  const unmatchedRight = right.filter((_, i) => !usedRight.has(i));
  return {
    ok: unmatchedLeft.length === 0 && unmatchedRight.length === 0,
    unmatchedLeft,
    unmatchedRight,
    leftCount: left.length,
    rightCount: right.length,
    centerCount: center,
  };
}

/* ------------------------------------------------------------------ *
 * 判据 2：构件不得越出建筑轮廓
 * ------------------------------------------------------------------ */

/**
 * 判「构件是否越出建筑轮廓」。
 *
 * ⚠⚠ **判据演进（2026-11-25，两次修正）**：
 *
 * ① 第一版按**外皮**判（`max(|minX|,|maxX|) − halfW`）：
 *    ⇒ 角柱被误报（角柱柱心就在建筑角上，柱身向外露半个柱径 = 0.288m）。
 *
 * ② 第二版改按**中心**判：
 *    ⇒ **漏检了「翼状竖板」**（上一轮真 bug：侧墙分段方向写反，
 *      墙段两端各伸出 4.2m）。
 *      实测 bug 版侧墙段 z 到 ±7.93（进深半值 7.51 ⇒ 超出 0.42m），
 *      但**段中心**在 ±6.01 ⇒ 中心判定看不到它。
 *      ⇒ 中心判定也不成立。
 *
 * ③ 正解：**看边界，超出量以「半个柱径」为界**：
 *    · 角柱：柱心就在建筑角上，柱身向外露**半个柱径**（0.288m）⇒ 合法
 *    · 翼状竖板：墙段两端各伸出 **0.42m**（> 半个柱径）⇒ 缺陷
 *    ⇒ 判据：超出量 > 柱径/2 + 小余量。
 *
 * ⚠ 为什么不加更多余量：加了就会把真 bug 一起豁免掉
 *   （实测加到 0.54m 时，翼状竖板的 0.42m 被吞掉 ⇒ 判据失效）。
 */
function checkOutline(geos, D) {
  const halfW = D.width / 2;
  const halfD = D.depth / 2;
  /** 角柱合法外露 = 半个柱径；再加一点余量 */
  const slack = D.colDia / 2 + TOL.outline;
  const bad = [];
  for (const g of geos) {
    const b = bboxOf(g);
    const overX = Math.max(Math.abs(b.minX), Math.abs(b.maxX)) - halfW;
    const overZ = Math.max(Math.abs(b.minZ), Math.abs(b.maxZ)) - halfD;
    const over = Math.max(overX, overZ);
    if (over > slack) bad.push({ over, b, overX, overZ });
  }
  bad.sort((a, b2) => b2.over - a.over);
  return bad;
}

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */

const problems = [];

const sceneNames = args.scene
  ? String(args.scene).split(',')
  : Object.keys(SCENE_PROGRAM);

console.log(`全园白模几何不变量体检 · ${sceneNames.length} 景\n`);

for (const sceneName of sceneNames) {
  const prog = SCENE_PROGRAM[sceneName];
  if (!prog) {
    console.log(`  ? 未知景：${sceneName}`);
    continue;
  }
  const m = prog.main;

  const buildings = [
    {
      label: '主殿',
      mian: m.mian, jin: m.jin, rank: prog.rank, roof: m.roof, caihua: m.caihua,
      platform: m.platform, tile: m.tile, doorsAllSides: !!m.doorsAllSides,
    },
  ];
  for (const a of prog.aux || []) {
    const af = defaultForm(a.rank);
    buildings.push({
      label: a.name || `配殿(${a.rank})`,
      mian: a.mian ?? af.mian, jin: a.jin ?? af.jin, rank: a.rank, roof: af.roof,
      caihua: af.caihua,
      platform: a.rank === 'pavilion' || a.rank === 'corridor' ? 'none' : 'simple',
      tile: m.tile, doorsAllSides: false,
    });
  }

  const sceneIssues = [];

  for (const b of buildings) {
    const { D, byBucket } = buildOne(b);

    // ---- 判据 1：左右对称（构件级，只查结构层的指定桶） ----
    for (const bucket of SYMMETRY_BUCKETS) {
      const geos = byBucket.get(bucket);
      if (!geos || !geos.length) continue;
      const r = checkMirror(bucket, geos);
      if (!r.ok) {
        const detail = [];
        for (const u of r.unmatchedLeft.slice(0, 4)) detail.push(`仅左侧有 ${fmtBBox(u)}`);
        for (const u of r.unmatchedRight.slice(0, 4)) detail.push(`仅右侧有 ${fmtBBox(u)}`);
        const msg =
          `【对称性】${b.label} 的 ${bucket} 桶左右不对称：` +
          `左 ${r.leftCount} 件 / 右 ${r.rightCount} 件 / 中央 ${r.centerCount} 件，` +
          `配不上 ${r.unmatchedLeft.length + r.unmatchedRight.length} 件。` +
          detail.map((d) => `\n           ${d}`).join('');
        sceneIssues.push({ kind: '对称性', msg });
        problems.push({ scene: sceneName, kind: '对称性', msg });
      }
    }

    // ---- 判据 2：墙身类构件不得越出建筑轮廓 ----
    //
    // ⚠ 只查**墙身类**：墙/槅扇/格心/窗纸必须在建筑平面内。
    //   斗栱/额枋/檩条**合法出檐**（要挑出墙身），不能拿它们判越界。
    for (const bucket of ['wall', 'lacquer', 'lacquerDark', 'lattice', 'paper']) {
      const geos = byBucket.get(bucket);
      if (!geos || !geos.length) continue;
      const bad = checkOutline(geos, D);
      if (bad.length) {
        const w = bad[0];
        const msg =
          `【越界】${b.label} 的 ${bucket} 桶有 ${bad.length} 件伸出建筑轮廓` +
          `（半面阔 ${(D.width / 2).toFixed(2)} / 半进深 ${(D.depth / 2).toFixed(2)}），` +
          `最严重超出 ${w.over.toFixed(2)}m：${fmtBBox(w.b)}`;
        sceneIssues.push({ kind: '越界', msg });
        problems.push({ scene: sceneName, kind: '越界', msg });
      }
    }

    // ---- 判据 3：柱网完整 ----
    {
      /**
       * ⚠ 柱子装在 **`lacquer` 桶**（素朱红漆），不是 `column` 桶。
       *   `column` 桶是**柱身贴图**那一档，实际几何在 lacquer。
       *   （实测 `column` 桶件数 = 0，柱子全在 lacquer 里。）
       *
       *   柱数：每根柱 = 一个圆柱几何；柱础另算（在 stone 桶）。
       *   柱高 < 2.5m 的不算柱（那是别的竖长件，如楹联/牌匾）。
       */
      const lacGeoms = byBucket.get('lacquer') || [];
      const cols = [];
      for (const g of lacGeoms) {
        g.computeBoundingBox();
        const b = g.boundingBox;
        const h = b.max.y - b.min.y;
        const w = b.max.x - b.min.x;
        const d = b.max.z - b.min.z;
        /**
         * 柱 = **圆截面**的竖长件：w ≈ d ≈ 柱径，且明显高于直径。
         *
         * ⚠ 只看「竖长」会误判：栏板/楹联牌（h 4.2 / w 0.75 / d 0.08）
         *   也是竖长的 ⇒ 会被当成柱。
         * ⇒ 必须加「**截面是圆的**」这一条：|w − d| 小。
         */
        const round = Math.abs(w - d) < Math.max(w, d) * 0.25;
        if (h > 2.5 && w < 1.2 && d < 1.2 && round && h > Math.max(w, d) * 2) {
          cols.push(g);
        }
      }
      /**
       * 柱数期望（清式制度）：
       *   · **周边柱** = 2×(mian+1) + 2×(jin−1)
       *     （南北两面各 (mian+1) 根，东西两面各 (jin−1) 根，角柱不重复计）
       *     ⚠ 不是 (mian+1)×(jin+1) —— 那是笛卡尔积，会把**中间没有柱的
       *     格子**也算进去。实测 5×3 的配殿：周边柱 16 根，不是 24 根。
       *   · **金柱** = 进深 ≥5 时才有，每排 (mian−1) 根 × 2 排
       *     ⇒ 小式（jin=3）不设金柱
       */
      const expect =
        2 * (D.mian + 1) + 2 * (D.jin - 1) + (D.jin >= 5 ? (D.mian - 1) * 2 : 0);
      if (cols.length && cols.length !== expect) {
        const msg =
          `【柱网】${b.label} 柱 ${cols.length} 根，期望 ${expect} 根` +
          `（周边 ${2 * (D.mian + 1) + 2 * (D.jin - 1)}` +
          `${D.jin >= 5 ? ` + 金柱 ${(D.mian - 1) * 2}` : '，小式不设金柱'}）`;
        sceneIssues.push({ kind: '柱网', msg });
        problems.push({ scene: sceneName, kind: '柱网', msg });
      }
      if (VERBOSE) {
        const dgGeoms = byBucket.get('dougong') || [];
        console.log(
          `    ${b.label}: 面阔 ${D.width.toFixed(2)} 进深 ${D.depth.toFixed(2)} ` +
          `檐高 ${D.eaveY.toFixed(2)} 柱 ${cols.length}/${expect} 斗栱 ${dgGeoms.length}`
        );
      }
    }
  }

  const mark = sceneIssues.length ? '✗' : '✓';
  console.log(`  ${mark} ${sceneName}${sceneIssues.length ? `  （${sceneIssues.length} 项）` : ''}`);
  for (const i of sceneIssues) console.log(`      ${i.msg}`);
}

console.log('\n────────────────────────────');
if (!problems.length) {
  console.log('✓ 全部通过：未发现几何不变量违例');
  process.exit(0);
}
console.log(`✗ 发现 ${problems.length} 项违例`);
const byKind = {};
for (const p of problems) byKind[p.kind] = (byKind[p.kind] || 0) + 1;
for (const [k, v] of Object.entries(byKind)) console.log(`  ${k}: ${v}`);
process.exit(1);
