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

/** 鱼跃鸢飞主殿：五楹方殿（各五楹 = 面阔五间 × 进深五间） */
const SPEC = {
  rank: 'hall',
  width: 20.0,
  depth: 20.0,
  mian: 5,
  jin: 5,
  platformH: 1.2,
  platform: 'xumizuo',
  eaveY: 11.0,
  colDia: 0.62,
  colH: 7.2,
  wallThick: 0.5,
  hasDougong: true,
  dougongJumps: 4,
  doors: [2],
  caojing: true,
  rise: 1.6,
};

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

console.log('');
if (failures) {
  console.log(`EXIT: 失败 ${failures} 项`);
  process.exit(1);
}
console.log('EXIT: 全部通过');
