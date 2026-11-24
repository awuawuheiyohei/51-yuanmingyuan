/**
 * **四面为门自检**（鱼跃鸢飞考据实记：「四面为门，各五楹」）
 *
 * ## 背景
 *
 * 《日下旧闻考》卷五：「多稼如云东北为鱼跃鸢飞，**四面为门，各五楹**。」
 * 本项目 `scenes-program.js` 里 2026-11-23 才把鱼跃鸢飞的主殿改为
 * `mian:5, jin:5`（= "各五楹"）并加上 `doorsAllSides: true`。
 *
 * ⚠ 默认的 `buildStructure` **只有正面开门**：背墙与两侧山墙都是**整片实墙**。
 *   所以「四面为门」不是改个数据就有的 —— 必须真在几何上开门。
 *
 * ## 判据（几何级，不看渲染）
 *
 * 开启 `doorsAllSides` 后，按**面的法线方向**检查槅扇（lacquer/lattice 桶）
 * 与暗底（dark 桶）的分布，必须在**四个方向**上都有：
 *
 *   · 正面 (+Z)
 *   · 背面 (−Z)
 *   · 左侧 (−X)
 *   · 右侧 (+X)
 *
 * 具体做法：
 *   1. 取所有"暗底"几何（门洞里的黑色背板）—— 它的**厚度方向**就是门洞法线。
 *      按其长边方向判定它属于哪个面（X 向长 ⇒ 门开在 ±X；Z 向长 ⇒ 门开在 ±Z）。
 *   2. 取所有槅扇格心（lattice 桶）—— 同样按面归属统计。
 *   3. 断言：四个面**各有 ≥1 个门洞**。
 *
 * ## ⚠ 反向验证（判据必须能失败）
 *
 * 把 `doorsAllSides` 关掉再跑一次，必须**报失败**（只剩正面一门）。
 * 若关掉后仍判过 ⇒ 判据本身是错的。
 *
 * 用法：
 *   node scripts/check-doors-all-sides.mjs
 */
import * as THREE from 'three';
import { buildStructure } from '../src/scene/buildings/parts/structure.js';
import { buildRoof } from '../src/scene/buildings/parts/roof.js';
import { deriveDimensions } from '../src/scene/buildings/modular.js';

/**
 * ⚠⚠ **必须用真实推导尺寸**（与 `layout.js` 同源），不能手填 width/depth。
 *
 *   第一版手填 20×20（正方形）⇒ 而实际鱼跃鸢飞是 23.84 × 15.02（长方形），
 *   在正方形里「分段方向写反」的误差被掩盖 ⇒ **判据测不出来**
 *   （实测：装回 bug 版，判据仍然全过）。
 *   ⇒ 面阔 ≫ 进深时，写反造成的「墙伸出屋檐」才暴露得出来。
 */
const SPEC0 = {
  rank: 'hall',
  mian: 5,
  jin: 5,
  platform: 'xumizuo',
  roof: 'xieshan',
  caihua: 'xuanzi',
  tile: 'lv',
};

const D = deriveDimensions({
  mian: SPEC0.mian,
  jin: SPEC0.jin,
  rank: SPEC0.rank,
  platform: SPEC0.platform,
  roof: SPEC0.roof,
});

/** 鱼跃鸢飞主殿：五楹方殿（各五楹 = 面阔五间 × 进深五间） */
const SPEC = {
  ...SPEC0,
  width: D.width,
  depth: D.depth,
  platformH: D.platformH,
  eaveY: D.eaveY,
  colDia: D.colDia,
  colH: D.colH,
  wallThick: D.wallThick,
  hasDougong: D.hasDougong,
  dougongJumps: D.dougongJumps,
  dougongScale: D.dougongScale,
  dougongHeight: D.dougongHeight,
  doukou: D.doukou,
  beamH: D.beamH,
  colXs: D.colXs,
  bayWidths: D.bayWidths,
  columnColor: '#8f2820',
  wallType: 'red',
  doubleEave: false,
  circular: false,
  plaqueText: '鱼跃鸢飞',
  couplet: null,
  doors: [1, 2, 3],
  caojing: true,
  rise: Math.max(2.0, D.width * 0.26),
};

console.log(
  `鱼跃鸢飞方殿：面阔 ${D.width.toFixed(2)} × 进深 ${D.depth.toFixed(2)}` +
    `（比例 ${(D.width / D.depth).toFixed(2)}）· 檐高 ${D.eaveY.toFixed(2)}`
);

const FACES = [
  { key: 'front', label: '正面 (+Z)', axis: 'z', sign: +1 },
  { key: 'back', label: '背面 (−Z)', axis: 'z', sign: -1 },
  { key: 'left', label: '左侧 (−X)', axis: 'x', sign: -1 },
  { key: 'right', label: '右侧 (+X)', axis: 'x', sign: +1 },
];

/** 统计每个面的门洞数与槅扇数 */
function survey(spec) {
  const { geoms } = buildStructure(spec);
  const counts = Object.fromEntries(FACES.map((f) => [f.key, { doors: 0, leaves: 0 }]));

  for (const [key, list] of geoms instanceof Map ? geoms.entries() : Object.entries(geoms)) {
    if (!list || !list.length) continue;
    const isDoor = key === 'dark'; // 门洞暗底
    const isLeaf = key === 'lattice'; // 槅扇格心
    if (!isDoor && !isLeaf) continue;

    for (const g of list) {
      g.computeBoundingBox();
      const bb = g.boundingBox;
      const sx = bb.max.x - bb.min.x;
      const sy = bb.max.y - bb.min.y;
      const sz = bb.max.z - bb.min.z;
      /**
       * 判定这个门洞/槅扇属于**哪个面**。
       *
       * ⚠ 判据要点（第一版写错过）：门洞暗底是一块**薄板**，
       *   它的**短边**方向 = 墙厚方向 = **门洞法线**。
       *   · 背面门：面宽沿 X ⇒ 薄边沿 Z ⇒ 法线是 ±Z
       *   · 侧面门：面宽沿 Z ⇒ 薄边沿 X ⇒ 法线是 ±X
       *
       *   ⇒ 判据是「**哪一维最薄**」，不是「哪一维最长」。
       *   （第一版用 longest ⇒ 把背面门误判成侧面门，四个面全错。）
       */
      const thinX = sx <= sz; // X 维更薄 ⇒ 法线沿 X ⇒ 门开在 ±X 面
      const axis = thinX ? 'x' : 'z';
      const center = thinX ? (bb.min.x + bb.max.x) / 2 : (bb.min.z + bb.max.z) / 2;
      const face = FACES.find(
        (f) =>
          f.axis === axis &&
          (f.sign > 0 ? center > 0 : center < 0) &&
          // 门洞/槅扇贴在外围一圈，排除正中的构件
          Math.abs(center) > SPEC.depth * 0.25
      );
      if (!face) continue;
      counts[face.key][isDoor ? 'doors' : 'leaves']++;
    }
  }
  return counts;
}

function report(title, counts) {
  console.log(`\n=== ${title} ===`);
  for (const f of FACES) {
    const c = counts[f.key];
    console.log(`  ${f.label.padEnd(12)} 门洞 ${c.doors}  槅扇 ${c.leaves}`);
  }
}

let failures = 0;
const fail = (m) => {
  failures++;
  console.log(`  ✗ ${m}`);
};

// ---- 正例：开启四面为门 ----
const on = survey({ ...SPEC, doorsAllSides: true });
report('doorsAllSides = true', on);
console.log('');
for (const f of FACES) {
  const c = on[f.key];
  if (c.doors < 1) fail(`${f.label} 没有门洞（doors=${c.doors}）`);
  if (c.leaves < 1) fail(`${f.label} 没有槅扇（leaves=${c.leaves}）`);
}

/**
 * ---- 位置判据：侧面槅扇必须**贴在侧墙上**，不能排到别处 ----
 *
 * ⚠ 这一条是本轮真抓到的 bug：`buildLeaves` 原先「先 rotateY 再按世界 X 偏移」，
 *   侧面时偏移轴就错了 ⇒ 槅扇被排到建筑内部/另一个面上（画面上是几条黄竖条）。
 *
 * 判据：侧面的槅扇，其**质心的 X** 必须落在侧墙位置（±(width/2 − wallThick/2)），
 *   且**质心的 Z** 必须落在该开间内（开间中心 ± 半开间宽）。
 */
{
  const { geoms } = buildStructure({ ...SPEC, doorsAllSides: true });
  const list = geoms.get('lattice') || [];
  const sideX = SPEC.width / 2 - SPEC.wallThick / 2;
  for (const sx of [-1, 1]) {
    // 该侧门所在的开间（正中一开间）
    const doorIdx = Math.floor(SPEC.mian / 2);
    const bayW = SPEC.width / SPEC.mian;
    const expectCz = (doorIdx + 0.5) * bayW - SPEC.width / 2;
    let found = 0;
    for (const g of list) {
      g.computeBoundingBox();
      const bb = g.boundingBox;
      const cxg = (bb.min.x + bb.max.x) / 2;
      const czg = (bb.min.z + bb.max.z) / 2;
      const sxg = bb.max.x - bb.min.x;
      const szg = bb.max.z - bb.min.z;
      // 贴在侧墙上的槅扇：X 维薄（厚度）、Z 维长（面宽）
      if (sxg > szg) continue;
      if (Math.abs(cxg - sx * sideX) > 0.35) continue;
      if (Math.abs(czg - expectCz) > bayW * 0.6) continue;
      found++;
    }
    const side = sx > 0 ? '右(+X)' : '左(−X)';
    if (found < 4) {
      fail(`${side}侧贴墙槅扇只有 ${found} 扇（应 ≥4）⇒ 位置排布错了`);
    } else {
      console.log(`  ✓ ${side}侧 ${found} 扇槅扇贴在侧墙上（x≈${(sx * sideX).toFixed(2)}）`);
    }
  }
}

/**
 * ---- 位置判据：**正面**槅扇必须落在正面墙上，且不偏移 ----
 *
 * ⚠ 本轮真踩到过：局部 X 用了**绝对**开间中心，平移时又加了一次中心
 *   ⇒ 整排槅扇**平移了两倍**开间宽，从墙上跑到建筑外面（画面上是一片黑洞）。
 */
{
  const { geoms } = buildStructure({ ...SPEC, doorsAllSides: true });
  const list = geoms.get('lattice') || [];
  const frontZ = SPEC.depth / 2 - SPEC.wallThick / 2;
  let onFront = 0;
  for (const g of list) {
    g.computeBoundingBox();
    const bb = g.boundingBox;
    const cxg = (bb.min.x + bb.max.x) / 2;
    const czg = (bb.min.z + bb.max.z) / 2;
    const sxg = bb.max.x - bb.min.x;
    const szg = bb.max.z - bb.min.z;
    // 正面的槅扇：X 维长（面宽）、Z 维薄（厚度）
    if (sxg <= szg) continue;
    if (Math.abs(czg - frontZ) > 0.4) continue;
    // 必须落在建筑面宽范围内
    if (Math.abs(cxg) > SPEC.width / 2 + 0.5) continue;
    onFront++;
  }
  if (onFront < 8) {
    fail(`正面贴墙槅扇只有 ${onFront} 扇（应 ≥8）⇒ 位置偏移了`);
  } else {
    console.log(`  ✓ 正面 ${onFront} 扇槅扇贴在正墙上（z≈${frontZ.toFixed(2)}）`);
  }
}

// ---- 反例：关闭四面为门（判据必须失败）----
const off = survey({ ...SPEC, doorsAllSides: false });
report('doorsAllSides = false（反例，判据必须在这里失败）', off);
let offFaces = 0;
for (const f of FACES) if (off[f.key].doors >= 1) offFaces++;
if (offFaces >= 4) {
  fail(
    `判据无效：关掉 doorsAllSides 后仍有 ${offFaces} 个面开门 ⇒ 判据测不出差别`
  );
} else {
  console.log(
    `  ✓ 判据可反向验证：关闭后只剩 ${offFaces} 个面开门（应 < 4）`
  );
}

/**
 * ---- 判据：**分段方向必须与墙的延伸方向一致**（抓"翼状竖板"）
 *
 * ⚠ 本轮真抓到的 bug：四面为门时我把分段方向写反了 ——
 *   ① 背墙沿 **X** 延伸（长 = 面阔）却按 `jin` 分段
 *      ⇒ 段数是进深开间数、段宽取进深开间宽 ⇒ 全部叠在面阔中央，背墙左右没墙；
 *   ② 侧墙沿 **Z** 延伸（长 = 进深）却按 `mian` 分段
 *      ⇒ 段宽取面阔开间宽（≈4.9m）而侧墙总长只有 15m
 *      ⇒ **两端各伸出 4.2m**，3D设计 白模里就是山墙端两片「翼状竖板」戳出屋檐。
 *
 * ⚠⚠ **判据不能只看"覆盖宽度"**：写反时 5 段 × 4.9m = 24.5m，
 *   覆盖反而"够宽" ⇒ 第一版判据漏判（已装回 bug 版实测过）。
 * ⇒ **直接查分段数**：背墙应有 `mian` 段、侧墙应有 `jin` 段。
 *   再查每段的**中心**是否落在对应开间内。
 */
{
  const { geoms } = buildStructure({ ...SPEC, doorsAllSides: true });
  const hd = SPEC.depth / 2;
  const hw = SPEC.width / 2;

  /**
   * ⚠ **实墙段数 = 开间数 − 1**（正中那一间是门洞，没有实墙）。
   *   ⇒ 判据是「实墙段数 + 门洞数 == 开间数」，不是「实墙段数 == 开间数」。
   *   （第一版直接比段数 ⇒ 误报；这就是"判据写错先怀疑判据"。）
   */
  const wallSegs = (geoms.get('wall') || []).filter((g) => g && g.isBufferGeometry);
  const darkSegs = (geoms.get('dark') || []).filter((g) => g && g.isBufferGeometry);
  const centers = (list, pick) =>
    list.map((g) => {
      g.computeBoundingBox();
      const b = g.boundingBox;
      return pick(b);
    });

  // ---- 背墙（z 在 −depth/2 附近，x 跨度大）----
  const backWalls = wallSegs.filter((g) => {
    g.computeBoundingBox();
    const b = g.boundingBox;
    const sz = b.max.z - b.min.z;
    const sx = b.max.x - b.min.x;
    return sz < 1.0 && sx > 2.0 && (b.min.z + b.max.z) / 2 < 0;
  });
  const backDoors = darkSegs.filter((g) => {
    g.computeBoundingBox();
    const b = g.boundingBox;
    const sz = b.max.z - b.min.z;
    const sx = b.max.x - b.min.x;
    return sz < 1.0 && sx > 2.0 && (b.min.z + b.max.z) / 2 < 0;
  });
  if (backWalls.length + backDoors.length !== SPEC.mian) {
    fail(
      `背墙实墙 ${backWalls.length} 段 + 门洞 ${backDoors.length} 个` +
        `（应合计 ${SPEC.mian} = 面阔开间数）⇒ 分段方向写反了` +
        `（背墙沿 X 延伸，必须按面阔分间）`
    );
  } else {
    console.log(
      `  ✓ 背墙按面阔分 ${SPEC.mian} 间（实墙 ${backWalls.length} + 门 ${backDoors.length}）`
    );
  }
  // 背墙两端必须**贴到角柱**（±(width/2 − colDia/2) 附近）
  {
    let minX = Infinity;
    let maxX = -Infinity;
    for (const g of backWalls) {
      g.computeBoundingBox();
      const b = g.boundingBox;
      minX = Math.min(minX, b.min.x);
      maxX = Math.max(maxX, b.max.x);
    }
    const want = SPEC.width / 2 - SPEC.colDia / 2;
    if (minX > -want + 0.35 || maxX < want - 0.35) {
      fail(
        `背墙两端只到 x=[${minX.toFixed(1)},${maxX.toFixed(1)}]，` +
          `应贴到角柱 ±${want.toFixed(1)}m ⇒ 两端各缺 ${(want - Math.abs(minX)).toFixed(1)}m`
      );
    } else {
      console.log(`  ✓ 背墙两端贴到角柱（x=[${minX.toFixed(1)},${maxX.toFixed(1)}]）`);
    }
  }

  // ---- 侧墙（x 在 ±width/2 附近，z 跨度大）----
  for (const sx of [-1, 1]) {
    const pick = (b) => Math.abs((b.min.x + b.max.x) / 2) - hw;
    const sideWalls = wallSegs.filter((g) => {
      g.computeBoundingBox();
      const b = g.boundingBox;
      const sz = b.max.z - b.min.z;
      const sxg = b.max.x - b.min.x;
      return sz > 2.0 && sxg < 1.0 && Math.sign((b.min.x + b.max.x) / 2) === sx;
    });
    const sideDoors = darkSegs.filter((g) => {
      g.computeBoundingBox();
      const b = g.boundingBox;
      const sz = b.max.z - b.min.z;
      const sxg = b.max.x - b.min.x;
      return sz > 2.0 && sxg < 1.0 && Math.sign((b.min.x + b.max.x) / 2) === sx;
    });
    const side = sx > 0 ? '右(+X)' : '左(−X)';
    if (sideWalls.length + sideDoors.length !== SPEC.jin) {
      fail(
        `${side}侧墙实墙 ${sideWalls.length} 段 + 门洞 ${sideDoors.length} 个` +
          `（应合计 ${SPEC.jin} = 进深开间数）⇒ 分段方向写反了` +
          `（侧墙沿 Z 延伸，必须按进深分间）`
      );
    } else {
      console.log(
        `  ✓ ${side}侧墙按进深分 ${SPEC.jin} 间（实墙 ${sideWalls.length} + 门 ${sideDoors.length}）`
      );
    }
    // ⚠ **查墙段的边界**（不是中心）：bug 版侧墙段 z 边界到 ±7.9（hd=7.51），
    //   中心却在 ±6.0 ⇒ 查中心**测不出来**。
    //   边界超出量 > 容差 ⇒ 墙戳出屋檐（就是白模里那两片「翼状竖板」）。
    let worstZ = 0;
    for (const g of sideWalls) {
      g.computeBoundingBox();
      const b = g.boundingBox;
      worstZ = Math.max(worstZ, Math.abs(b.min.z), Math.abs(b.max.z));
    }
    if (worstZ > hd + 0.35) {
      fail(
        `${side}侧墙边界伸到 z=±${worstZ.toFixed(1)}m（进深半值 ${hd.toFixed(1)}m）` +
          ` ⇒ 墙戳出屋檐（分段方向写反）`
      );
    } else {
      console.log(
        `  ✓ ${side}侧墙边界未超出进深 ±${hd.toFixed(1)}m（实测 ${worstZ.toFixed(1)}m）`
      );
    }
  }
}

/**
 * ---- 判据：**墙身不得超出建筑平面太多**（抓"翼状竖板"的量化版）
 *
 * ⚠⚠ **判据只查墙身桶**（wall / dark / lacquer / lattice）：
 *   斗栱、出檐、台基、踏跺**本来就该超出墙身平面**（那是出檐），
 *   一并查会全是误报（第一版误报了 171 个）。
 */
{
  const { geoms } = buildStructure({ ...SPEC, doorsAllSides: true });
  const hw = SPEC.width / 2;
  const hd = SPEC.depth / 2;
  const OVERHANG = 1.6; // 斗栱出挑 + 翼角起翘的水平伸出量
  const WALL_BUCKETS = ['wall', 'dark', 'lacquer', 'lattice'];
  const bad = [];
  for (const [bucket, list] of geoms.entries()) {
    if (!WALL_BUCKETS.includes(bucket)) continue;
    for (const g of list) {
      if (!g || !g.isBufferGeometry) continue;
      g.computeBoundingBox();
      const b = g.boundingBox;
      const cxs = (b.min.x + b.max.x) / 2;
      const czs = (b.min.z + b.max.z) / 2;
      const overX = Math.max(0, Math.abs(cxs) - hw) - OVERHANG;
      const overZ = Math.max(0, Math.abs(czs) - hd) - OVERHANG;
      if (overX > 0 || overZ > 0) {
        bad.push(
          `${bucket} 中心 x=${cxs.toFixed(1)} z=${czs.toFixed(1)}` +
            ` 尺寸 ${(b.max.x - b.min.x).toFixed(1)}×${(b.max.z - b.min.z).toFixed(1)}` +
            ` 超出 ${Math.max(overX, overZ).toFixed(1)}m`
        );
      }
    }
  }
  if (bad.length) {
    fail(`${bad.length} 个墙身构件超出建筑平面（容差 = 出檐 ${OVERHANG}m）：`);
    for (const s of bad.slice(0, 8)) console.log(`      · ${s}`);
    if (bad.length > 8) console.log(`      · …另有 ${bad.length - 8} 个`);
  } else {
    console.log(
      `  ✓ 墙身未超出建筑平面（面阔 ±${hw.toFixed(1)}m / 进深 ±${hd.toFixed(1)}m，容差 ${OVERHANG}m）`
    );
  }
}

/**
 * ---- 判据：**脊瓜柱不得戳出屋面**（白模里那根"竖线"）
 *
 * ⚠ 2026-11-24 在 3D设计 白模里看到每座歇山殿的屋脊上方有一根**细竖线**，
 *   一度以为是"脊瓜柱穿出屋面"的 bug。
 *   实际是**正脊构件（ridge，0.21m 见方的细长盒体）**在等轴测下的投影 ——
 *   渲染时被瓦面遮住，白模里才显形。
 *   真正要查的是**脊瓜柱**（托脊檩的短柱）有没有真的穿出屋面。
 *
 * 判据：对每座歇山/庑殿建筑，在每个中柱线位置取脊瓜柱顶，
 *       从柱顶**往上 0.5m 往下打射线** ⇒ 必须先命中屋面（否则说明柱露在屋面外）。
 *
 * ⚠ 射线要从**上方往下**打（`Mesh.raycast` 按 material.side 剔背面，
 *   屋面法线朝上，从下往上打一律打不中）。
 */
{
  const { geoms } = buildStructure({ ...SPEC, doorsAllSides: true });
  // 屋面几何（射线用）
  const roofGeoms = buildRoof({
    width: SPEC.width,
    depth: SPEC.depth,
    eaveY: SPEC.eaveY,
    platformH: SPEC.platformH,
    roof: SPEC.roof,
    caihua: SPEC.caihua,
    tile: SPEC.tile,
    columnColor: SPEC.columnColor,
    wallType: SPEC.wallType,
    rise: SPEC.rise,
    overhang: 1.42,
    hipRunX: SPEC.width * 0.26,
    mian: SPEC.mian,
    jin: SPEC.jin,
    wallTint: () => 1,
  }).geoms;
  const meshes = [];
  for (const [k, l] of roofGeoms.entries()) {
    for (const g of l) {
      if (!g || !g.isBufferGeometry) continue;
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial());
      m.updateMatrixWorld();
      meshes.push(m);
    }
  }
  const rc = new THREE.Raycaster();
  const midXs = D.colXs.filter((x) => Math.abs(x) < D.width * 0.26);
  let checked = 0;
  const stuck = [];
  for (const x of midXs.length ? midXs : [0]) {
    // 该 x 处的脊瓜柱顶（wood 桶里、细长、位于脊高附近）
    let top = null;
    for (const g of geoms.get('wood') || []) {
      if (!g || !g.isBufferGeometry) continue;
      g.computeBoundingBox();
      const b = g.boundingBox;
      if (
        b.max.y > SPEC.eaveY &&
        b.max.x - b.min.x < 0.5 &&
        Math.abs((b.min.x + b.max.x) / 2 - x) < 0.5
      ) {
        if (top === null || b.max.y > top) top = b.max.y;
      }
    }
    if (top === null) continue;
    checked++;
    rc.set(new THREE.Vector3(x, top + 0.5, 0), new THREE.Vector3(0, -1, 0));
    const hits = rc.intersectObjects(meshes, false);
    const roofY = hits.length ? hits[0].point.y : -Infinity;
    if (top > roofY + 0.02) {
      stuck.push(`x=${x.toFixed(1)} 柱顶 ${top.toFixed(2)} 屋面 ${roofY.toFixed(2)}`);
    }
  }
  if (stuck.length) {
    fail(`${stuck.length}/${checked} 处脊瓜柱戳出屋面：`);
    for (const s of stuck.slice(0, 5)) console.log(`      · ${s}`);
  } else {
    console.log(`  ✓ ${checked} 处脊瓜柱均被屋面覆盖（白模里的"竖线"是正脊投影，非穿模）`);
  }
}

console.log('');
if (failures) {
  console.log(`EXIT: 失败 ${failures} 项`);
  process.exit(1);
}
console.log('EXIT: 全部通过');
