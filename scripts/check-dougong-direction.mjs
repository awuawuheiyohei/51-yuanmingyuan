/**
 * **斗栱出挑方向自检**
 *
 * ## 为什么必须有这个检查
 *
 * 2026-11-18 在 3D设计（cq-viewer）白模里发现一个**全园级**的 bug：
 *   斗栱本该**朝檐口外挑**，实际却**沿立面方向排**（整体差了 90°）。
 *
 * 根因：`buildDougongParts(scale, 'x')` 造出来的斗栱沿**局部 +X** 出挑，
 * 而摆放时要转到 `dir = (sin rot, 0, cos rot)`；
 * `makeRotationY(θ)` 把 +X 映到 `(cos θ, 0, −sin θ)`，
 * ⇒ 要对上 `dir` 必须 **θ = rot − π/2**，原来写的是 `makeRotationY(rot)`。
 *
 * 渲染里的症状很轻（"檐下是一条黑带"），**几何上却是全错的**：
 * 287 座建筑的每一攒斗栱都转错了方向 ⇒ 昂嘴不朝外、蚂蚱头不朝外。
 *
 * ## 判据
 *
 * 一攒斗栱是个**长条形**（沿出挑方向拉长、垂直方向很薄）。
 *   · 前/后檐那一排 ⇒ 出挑方向是 ±Z ⇒ 该件的 **Z 向尺寸 > X 向尺寸**
 *   · 两山那一排   ⇒ 出挑方向是 ±X ⇒ 该件的 **X 向尺寸 > Z 向尺寸**
 *
 * 先按"最大边 ≤ 2 m"滤掉**柱头枋**（它通长跨整根梁，不是斗栱）。
 */
import * as THREE from 'three';
import { buildStructure } from '../src/scene/buildings/parts/structure.js';
import { deriveDimensions } from '../src/scene/buildings/modular.js';

const CASES = {
  daxie: { name: '大歇山（九州清晏主殿）', rank: 'grand', mian: 7, jin: 5, platform: 'xumizuo', roof: 'xieshan', tile: 'huang' },
  xieshan: { name: '歇山（奉三无私殿）', rank: 'hall', mian: 7, jin: 5, platform: 'xumizuo', roof: 'xieshan', tile: 'hui' },
};

const MAX_UNIT_SIZE = 2.0; // 一攒斗栱的最大边（米）；柱头枋通长 ⇒ 被滤掉

let failures = 0;
const fail = (m) => {
  failures++;
  console.log(`  ✗ ${m}`);
};

for (const [key, spec0] of Object.entries(CASES)) {
  const D = deriveDimensions({
    mian: spec0.mian,
    jin: spec0.jin,
    rank: spec0.rank,
    platform: spec0.platform,
    roof: spec0.roof,
  });
  const res = buildStructure({
    width: D.width,
    depth: D.depth,
    mian: D.mian,
    jin: D.jin,
    platformH: D.platformH,
    platform: spec0.platform,
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
    roof: spec0.roof,
    caihua: 'hexi',
    tile: spec0.tile,
    columnColor: '#8f2820',
    wallType: 'red',
    doubleEave: false,
    circular: false,
    plaqueText: 'X',
    couplet: null,
    doors: [2, 3, 4],
    caojing: true,
    rise: Math.max(2.0, D.width * 0.26),
  });

  console.log(`\n=== ${spec0.name} ===`);
  const pieces = [];
  for (const g of res.geoms.get('dougong') ?? []) {
    if (!g?.attributes?.position) continue;
    const p = g.attributes.position;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    const extX = maxX - minX;
    const extZ = maxZ - minZ;
    const extY = maxY - minY;
    if (Math.max(extX, extY, extZ) > MAX_UNIT_SIZE) continue; // 柱头枋
    pieces.push({ cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, extX, extZ });
  }

  const maxAbsX = Math.max(...pieces.map((p) => Math.abs(p.cx)));
  const maxAbsZ = Math.max(...pieces.map((p) => Math.abs(p.cz)));
  console.log(
    `  斗栱件数 ${pieces.length}（柱头枋已滤掉）· 分布 x±${maxAbsX.toFixed(2)} z±${maxAbsZ.toFixed(2)}`
  );

  const bands = [
    { name: '前檐（南，+Z 出挑）', test: (p) => p.cz > 0.75 * maxAbsZ, other: (p) => p.cx < -0.75 * maxAbsX || p.cx > 0.75 * maxAbsX, want: 'z' },
    { name: '后檐（北，−Z 出挑）', test: (p) => p.cz < -0.75 * maxAbsZ, other: (p) => p.cx < -0.75 * maxAbsX || p.cx > 0.75 * maxAbsX, want: 'z' },
    { name: '东山（+X 出挑）', test: (p) => p.cx > 0.75 * maxAbsX, other: (p) => p.cz < -0.75 * maxAbsZ || p.cz > 0.75 * maxAbsZ, want: 'x' },
    { name: '西山（−X 出挑）', test: (p) => p.cx < -0.75 * maxAbsX, other: (p) => p.cz < -0.75 * maxAbsZ || p.cz > 0.75 * maxAbsZ, want: 'x' },
  ];

  for (const b of bands) {
    // ⚠ **角柱上的斗栱要排除**：角柱同时有前后檐与两山檐两攒，
    //   两攒朝**不同**方向（这是对的）⇒ 拿单一方向去判它必然"错"。
    const sel = pieces.filter((p) => b.test(p) && !b.other(p));
    if (!sel.length) {
      fail(`${b.name}：这一排没找到斗栱（构件分布不对？）`);
      continue;
    }
    const wrong = sel.filter((p) => (b.want === 'z' ? p.extZ <= p.extX : p.extX <= p.extZ));
    if (wrong.length) {
      fail(
        `${b.name}：${sel.length} 攒里有 **${wrong.length} 攒朝向是错的**` +
          `（应沿 ${b.want.toUpperCase()} 出挑）—— 例：中心 (${wrong[0].cx.toFixed(2)}, ${wrong[0].cz.toFixed(2)})，` +
          `X 向 ${wrong[0].extX.toFixed(2)}m / Z 向 ${wrong[0].extZ.toFixed(2)}m`
      );
    } else {
      const avg =
        b.want === 'z'
          ? sel.reduce((s, p) => s + p.extZ / p.extX, 0) / sel.length
          : sel.reduce((s, p) => s + p.extX / p.extZ, 0) / sel.length;
      console.log(
        `  ✅ ${b.name}：${sel.length} 攒全部朝檐外挑（长宽比均值 ${avg.toFixed(2)}）`
      );
    }
  }

  // ---- 角部：每个角上应同时有"两个方向"的斗栱 ----
  const corners = [
    { name: '东南角', test: (p) => p.cx > 0.75 * maxAbsX && p.cz > 0.75 * maxAbsZ },
    { name: '西南角', test: (p) => p.cx < -0.75 * maxAbsX && p.cz > 0.75 * maxAbsZ },
    { name: '东北角', test: (p) => p.cx > 0.75 * maxAbsX && p.cz < -0.75 * maxAbsZ },
    { name: '西北角', test: (p) => p.cx < -0.75 * maxAbsX && p.cz < -0.75 * maxAbsZ },
  ];
  for (const c of corners) {
    const sel = pieces.filter(c.test);
    if (!sel.length) continue;
    const alongX = sel.filter((p) => p.extX > p.extZ).length;
    const alongZ = sel.filter((p) => p.extZ > p.extX).length;
    if (!alongX || !alongZ) {
      fail(
        `${c.name}：应有**两向**斗栱（前后檐 + 两山檐各一攒），` +
          `实测沿 X ${alongX} 攒 / 沿 Z ${alongZ} 攒`
      );
    } else {
      console.log(`  ✅ ${c.name}：两向都有（沿 X ${alongX} 攒 / 沿 Z ${alongZ} 攒）`);
    }
  }
}

console.log('');
if (failures) {
  console.log(`❌ 斗栱出挑方向自检：${failures} 项不合格`);
  process.exit(1);
}
console.log('✅ 斗栱出挑方向自检：四排斗栱全部朝檐口外挑');
