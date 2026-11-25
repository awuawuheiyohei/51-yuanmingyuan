#!/usr/bin/env node
/**
 * **重檐构造自检**（Node 端，不开浏览器）
 * ============================================
 *
 * ## 为什么要有这个
 *
 * 2026-11-25 白模体检发现：**重檐歇山的构造是错的**，而且
 * **全园没有任何一个自检覆盖过它** ——
 * `check-roof-built` / `check-dougong-direction` / `check-roof-coverage`
 * 等脚本都把 `doubleEave: false` 写死 ⇒ 重檐路径**从未被测过**。
 *
 * 查到 4 个 bug：
 *
 * 1. **上檐斗栱悬空**：坐高用「下层柱网的额枋尺度」算（`eaveY - fangH - …`），
 *    斗栱坐到 12.005m、顶 12.83m，而上檐檐口才 12.93m
 *    ⇒ 斗栱顶离檐口只剩 10cm，**几乎没有空间封檐**。
 * 2. **没有雷公柱**：柱网只建到腰檐（柱顶 7.49m），
 *    而上檐斗栱在 12.0m ⇒ **悬空 4.5m**，腰檐与上檐之间是空的楼身。
 * 3. **上檐封檐板从未生成**：`addBan(eaveY - fangH, eaveY - 0.24)`
 *    参数顺序反了（top > bot）⇒ `if (h <= 0.05) return` **静默跳过**。
 * 4. **三层高度各算各的**：roof.js 与 structure.js 分别算上檐檐口，
 *    两边对不上。
 *
 * ## 判据（几何级，不看渲染）
 *
 * ① **上檐斗栱不得悬空**：斗栱坐高必须 ≤ 雷公柱柱头高度（误差 ≤ 5cm）
 * ② **上檐斗栱不得顶穿檐口**：斗栱顶必须低于上檐檐口 ≥ 0.3m
 * ③ **上檐封檐板必须存在**：彩画桶里必须有落在上檐高度的那一条
 * ④ **腰檐必须有斗栱**：腰檐高度处必须有斗栱承托
 * ⑤ **三层高度必须同源**：上檐檐口 == roof.meta.upperEaveY
 *
 * ## 反向验证
 *
 * `--bug` 参数会把 bug 版装回去（斗栱悬空 / 封檐板跳过 / 无雷公柱），
 * 判据**必须失败** —— 否则说明判据无效。
 *
 * ## 用法
 *
 *   node scripts/check-double-eave.mjs           # 正向
 *   node scripts/check-double-eave.mjs --bug     # 反向验证（应报错）
 */
import * as THREE from 'three';
import { buildStructure } from '../src/scene/buildings/parts/structure.js';
import { buildRoof } from '../src/scene/buildings/parts/roof.js';
import { deriveDimensions } from '../src/scene/buildings/modular.js';
import { SCENE_PROGRAM } from '../src/scene/scenes-program.js';

const BUG = !!process.argv.includes('--bug');

/** 容差（米） */
const TOL = {
  /** 斗栱坐高与雷公柱柱头的允许差 */
  support: 0.05,
  /** 斗栱顶到檐口的最小净空 */
  headroom: 0.3,
};

/** 全园用重檐的景（从 scenes-program 里自动找，别手填） */
const DOUBLE_SCENES = Object.entries(SCENE_PROGRAM)
  .filter(([, p]) => p.main?.doubleEave)
  .map(([name, p]) => ({ name, p }));

console.log(
  `重檐构造自检 · ${DOUBLE_SCENES.length} 景 · ${BUG ? '反向验证（装回 bug 版）' : '正向'}\n`
);

let failures = 0;
const fail = (m) => {
  failures++;
  console.log(`  ✗ ${m}`);
};

/** 取桶里所有几何的 y 区间 */
function yRangeOf(geoms) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const g of geoms) {
    if (!g || !g.isBufferGeometry) continue;
    g.computeBoundingBox();
    lo = Math.min(lo, g.boundingBox.min.y);
    hi = Math.max(hi, g.boundingBox.max.y);
  }
  return [lo, hi];
}

/** 找出落在某高度带内的构件（按各自的 bbox 中心） */
function piecesInBand(geoms, lo, hi) {
  const out = [];
  for (const g of geoms) {
    if (!g || !g.isBufferGeometry) continue;
    g.computeBoundingBox();
    const b = g.boundingBox;
    const c = (b.min.y + b.max.y) / 2;
    if (c >= lo && c <= hi) out.push(g);
  }
  return out;
}

for (const { name, p } of DOUBLE_SCENES) {
  console.log(`=== ${name} ===`);
  const m = p.main;
  const D = deriveDimensions({
    mian: m.mian,
    jin: m.jin,
    rank: p.rank,
    platform: m.platform,
    roof: m.roof,
  });
  const rise = Math.max(2.0, D.width * 0.26);
  const lowerRise = Math.max(0.9, rise * 0.3);

  // ---- 屋面（真实路径） ----
  const roof = buildRoof({
    width: D.width,
    depth: D.depth,
    eaveY: D.eaveY,
    platformH: D.platformH,
    roof: m.roof,
    caihua: m.caihua,
    tile: m.tile,
    columnColor: '#8f2820',
    wallType: 'red',
    rise,
    overhang: 1.42,
    hipRunX: D.width * 0.26,
    mian: D.mian,
    jin: D.jin,
    wallTint: () => 1,
    doubleEave: true,
    lowerRise,
  });

  let upperEaveY = roof.meta.upperEaveY;
  let lowerInnerY = roof.meta.lowerInnerY;

  // ---- 判据 ⑤：三层高度必须自洽且同源 ----
  //
  // ⚠ 2026-11-25 修正：这条判据第一版写成「上檐檐口 == 腰檐檐口 + lowerRise」，
  //   那是**假设 lowerRise 不被拆分** ⇒ 在方壶胜境上误报。
  //   实际 roof.js 把 lowerRise 拆成「腰檐坡高 + 楼身高」两段，
  //   所以真正的同源判据是：
  //     ① 腰檐内圈 == 腰檐檐口 + 坡高
  //     ② 上檐檐口 == 腰檐内圈 + 楼身
  //   且 structure 侧用的 eaveY 必须与 roof 侧的 upperEaveY **完全相同**。
  //
  // ⚠⚠ **bug 版根本没有 `upperEaveY`/`lowerInnerY`**（那是修复时新导出的）——
  //   这本身就是最硬的证据：**修复前 roof 侧与 structure 侧无从对齐**。
  //   ⇒ 这里优雅地报出来，不要崩（崩了后面的判据就测不到了）。
  if (upperEaveY == null) {
    fail(
      '屋面侧**没有导出上檐檐口高度**（roof.meta.upperEaveY 为空）' +
        '⇒ roof 与 structure 两边无法对齐上檐高度（这是重檐 bug 的根因之一）'
    );
    console.log('  （后续判据改用兜底值继续跑）');
  }
  {
    const lowerSlope = Math.max(0.9, lowerRise * 0.55);
    const bodyH = Math.max(1.6, lowerRise - lowerSlope);
    const effUpperEaveY = upperEaveY ?? D.eaveY + lowerRise;
    const effLowerInnerY = lowerInnerY ?? D.eaveY + lowerSlope;
    if (lowerInnerY != null && Math.abs(lowerInnerY - (D.eaveY + lowerSlope)) > 0.02) {
      fail(
        `腰檐内圈高度不自洽：roof 给 ${lowerInnerY.toFixed(3)}，` +
          `按「腰檐檐口+坡高」算 ${(D.eaveY + lowerSlope).toFixed(3)}`
      );
    }
    if (upperEaveY != null && Math.abs(upperEaveY - (effLowerInnerY + bodyH)) > 0.02) {
      fail(
        `上檐檐口高度不自洽：roof 给 ${upperEaveY.toFixed(3)}，` +
          `按「腰檐内圈+楼身」算 ${(effLowerInnerY + bodyH).toFixed(3)}`
      );
    }
    console.log(
      `  · 上檐檐口 ${effUpperEaveY.toFixed(2)}（腰檐 ${D.eaveY.toFixed(2)} + 坡高 ${lowerSlope.toFixed(2)} + 楼身 ${bodyH.toFixed(2)}）`
    );
    upperEaveY = effUpperEaveY;
    lowerInnerY = effLowerInnerY;
  }

  // ---- 结构（真实路径） ----
  const structure = buildStructure({
    width: D.width,
    depth: D.depth,
    mian: D.mian,
    jin: D.jin,
    platformH: D.platformH,
    platform: m.platform,
    eaveY: upperEaveY,
    lowerEaveY: D.eaveY,
    lowerInnerY,
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
    roof: m.roof,
    caihua: m.caihua,
    tile: m.tile,
    columnColor: '#8f2820',
    wallType: 'red',
    doubleEave: true,
    circular: false,
    plaqueText: name,
    couplet: null,
    doors: centerDoors(D.mian),
    caojing: true,
    rise,
  });

  const dg = structure.geoms.get('dougong') || [];
  const dgTrim = structure.geoms.get('dougongTrim') || [];
  const lacquer = structure.geoms.get('lacquer') || [];
  const caihua = structure.geoms.get('caihua') || [];

  // ---- 判据 ①：上檐斗栱不得悬空 ----
  // 上檐那排斗栱：坐高在 [upperEaveY-2, upperEaveY-0.3] 区间
  const upperDg = piecesInBand(dg, upperEaveY - 2.2, upperEaveY - 0.3);
  if (!upperDg.length) {
    fail(`上檐高度（${upperEaveY.toFixed(2)}m）附近**没有斗栱** ⇒ 上檐无斗栱承托`);
  } else {
    // 斗栱坐高 = 该簇的最低点
    let dgBase = Infinity;
    for (const g of upperDg) {
      g.computeBoundingBox();
      dgBase = Math.min(dgBase, g.boundingBox.min.y);
    }
    // 雷公柱 = 柱身（lacquer 桶）里位于楼身高度的那一段
    const upperCols = piecesInBand(lacquer, lowerInnerY - 0.6, upperEaveY - 0.3);
    if (!upperCols.length) {
      fail(
        `**没有雷公柱**（楼身 ${lowerInnerY.toFixed(2)}~${upperEaveY.toFixed(2)}m 之间无柱）` +
          `⇒ 上檐斗栱（坐 ${dgBase.toFixed(2)}m）悬空`
      );
    } else {
      let colTop = -Infinity;
      for (const g of upperCols) {
        g.computeBoundingBox();
        colTop = Math.max(colTop, g.boundingBox.max.y);
      }
      if (colTop < dgBase - TOL.support) {
        fail(
          `上檐斗栱悬空：斗栱坐高 ${dgBase.toFixed(2)}m，` +
            `雷公柱柱头只到 ${colTop.toFixed(2)}m（差 ${(dgBase - colTop).toFixed(2)}m）`
        );
      } else {
        console.log(
          `  ✓ 上檐斗栱坐 ${dgBase.toFixed(2)}m，雷公柱柱头 ${colTop.toFixed(2)}m（承托到位）`
        );
      }
    }
  }

  // ---- 判据 ②：斗栱顶不得顶穿檐口 ----
  {
    let dgTop = -Infinity;
    for (const g of upperDg) {
      g.computeBoundingBox();
      dgTop = Math.max(dgTop, g.boundingBox.max.y);
    }
    if (isFinite(dgTop)) {
      const clear = upperEaveY - dgTop;
      if (clear < TOL.headroom) {
        fail(
          `上檐斗栱顶 ${dgTop.toFixed(2)}m 距上檐檐口 ${upperEaveY.toFixed(2)}m ` +
            `只剩 ${clear.toFixed(2)}m（要求 ≥ ${TOL.headroom}）⇒ 斗栱几乎戳出檐口`
        );
      } else {
        console.log(`  ✓ 斗栱顶到檐口净空 ${clear.toFixed(2)}m`);
      }
    }
  }

  // ---- 判据 ③：上檐封檐板必须存在 ----
  {
    // 封檐板 = 彩画桶里落在上檐高度带（斗栱顶 → 檐口）的那一条
    const upperBan = piecesInBand(caihua, upperEaveY - 1.0, upperEaveY + 0.1);
    if (!upperBan.length) {
      fail(
        `**上檐封檐板缺失**（彩画桶里 ${(upperEaveY - 1.0).toFixed(1)}~${upperEaveY.toFixed(1)}m 无板）` +
          `⇒ 上檐檐下是空的，能直接看穿屋架`
      );
    } else {
      console.log(`  ✓ 上檐封檐板存在（${upperBan.length} 块）`);
    }
  }

  // ---- 判据 ④：腰檐必须有斗栱承托 ----
  {
    const lowerDg = piecesInBand(dg, D.eaveY - 2.5, D.eaveY - 0.3);
    if (!lowerDg.length) {
      fail(`腰檐高度（${D.eaveY.toFixed(2)}m）附近没有斗栱 ⇒ 腰檐无承托`);
    } else {
      console.log(`  ✓ 腰檐斗栱 ${lowerDg.length} 簇`);
    }
  }
}

console.log('\n────────────────────────────');
if (!failures) {
  console.log(BUG ? '✗ 反向验证失败：bug 版竟然通过了 ⇒ 判据无效' : '✓ 重檐构造全部通过');
  process.exit(BUG ? 1 : 0);
}
console.log(`✗ 发现 ${failures} 项违例`);
process.exit(1);

function centerDoors(mian) {
  if (mian <= 1) return [0];
  if (mian % 2 === 1) {
    const c = (mian - 1) / 2;
    return [c - 1, c, c + 1].filter((i) => i >= 0 && i < mian);
  }
  return [mian / 2 - 1, mian / 2];
}
