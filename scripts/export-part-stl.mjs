/**
 * **建筑构件白模导出**（给 3D设计 / cq-viewer 做几何体检）
 *
 * 为什么要有这个：
 *   浏览器里带光照/贴图的渲染很难判断"几何本身对不对"
 *   —— 斗栱、棂心、匾额这些**立面细部**互相叠在一起，靠截图分不清谁是谁。
 *   导出成白模（单一 STL、单一材质）后，任何一个"多出来的块""少掉的一跳"
 *   都能一眼看出来。
 *
 * ⚠⚠ **查看器是 Z 轴向上（CAD 约定），我们的几何是 Y 向上**
 *   ⇒ 导出时绕 X 轴转 −90°：`(x, y, z) → (x, −z, y)`
 *     · 手性不变（行列式 +1）⇒ 三角形绕向不变，法线不会反；
 *     · 查看器的 Z（向上）= 我们的 Y（向上）；
 *     · 查看器的 X = 我们的 X ⇒ 左右方向不变。
 *
 * 用法：
 *   node scripts/export-part-stl.mjs                          # 整座大歇山，全桶
 *   node scripts/export-part-stl.mjs --bucket=dougong,dougongTrim
 *   node scripts/export-part-stl.mjs --x0=2 --x1=9 --y0=8 --y1=12 --z0=10 --z1=14
 */
import * as THREE from 'three';
import fs from 'node:fs';
import { buildRoof } from '../src/scene/buildings/parts/roof.js';
import { buildStructure } from '../src/scene/buildings/parts/structure.js';
import { deriveDimensions } from '../src/scene/buildings/modular.js';

const CASES = {
  daxie: {
    name: '大歇山（九州清晏主殿）',
    rank: 'grand',
    mian: 7,
    jin: 5,
    platform: 'xumizuo',
    roof: 'xieshan',
    caihua: 'hexi',
    tile: 'huang',
    plaque: '九洲清晏',
    overhang: 1.42,
    hipRunX: 5.43,
  },
  xieshan: {
    name: '歇山（奉三无私殿）',
    rank: 'hall',
    mian: 7,
    jin: 5,
    platform: 'xumizuo',
    roof: 'xieshan',
    caihua: 'xuanzi',
    tile: 'hui',
    plaque: '奉三无私',
    overhang: 1.14,
    hipRunX: 4.91,
  },
  wudian: {
    name: '庑殿（正大光明殿）',
    rank: 'hall',
    mian: 7,
    jin: 5,
    platform: 'xumizuo',
    roof: 'juanpengxieshan',
    caihua: 'hexi',
    tile: 'hui',
    plaque: '正大光明',
    couplet: ['心天之心而宵衣旰食', '乐民之乐以和性怡情'],
  },
};

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);
const CASE_KEY = args.case || 'daxie';
const BUCKETS = args.bucket ? String(args.bucket).split(',') : null;
const num = (k) => (args[k] !== undefined ? Number(args[k]) : null);
const CROP = {
  x0: num('x0'),
  x1: num('x1'),
  y0: num('y0'),
  y1: num('y1'),
  z0: num('z0'),
  z1: num('z1'),
};

/** 绕 X 轴转 −90°：Y-up → Z-up（手性不变） */
function toZup(p) {
  return [p[0], -p[2], p[1]];
}

function writeBinarySTL(path, triangles, header) {
  const buf = Buffer.alloc(84 + triangles.length * 50);
  buf.write(header.slice(0, 79), 0);
  buf.writeUInt32LE(triangles.length, 80);
  let o = 84;
  for (const t of triangles) {
    buf.writeFloatLE(t.n[0], o); o += 4;
    buf.writeFloatLE(t.n[1], o); o += 4;
    buf.writeFloatLE(t.n[2], o); o += 4;
    for (const v of t.v) {
      buf.writeFloatLE(v[0], o); o += 4;
      buf.writeFloatLE(v[1], o); o += 4;
      buf.writeFloatLE(v[2], o); o += 4;
    }
    buf.writeUInt16LE(0, o); o += 2;
  }
  fs.writeFileSync(path, buf);
  return triangles.length;
}

/**
 * 三角形是否落在裁剪盒内 —— **三个顶点都要在盒内**。
 *
 * ⚠⚠ 这里曾经写错过：写成 `['x', p[0]]`（把"第一个顶点"当成了 x 值），
 *   于是裁剪框**完全没生效**（每个三角形的第 0 个顶点都被当成 x 值）。
 *   ⇒ 正确写法是**逐顶点**判 `v[0]/v[1]/v[2]`。
 */
function inCrop(p) {
  for (const v of p) {
    if (CROP.x0 !== null && v[0] < CROP.x0) return false;
    if (CROP.x1 !== null && v[0] > CROP.x1) return false;
    if (CROP.y0 !== null && v[1] < CROP.y0) return false;
    if (CROP.y1 !== null && v[1] > CROP.y1) return false;
    if (CROP.z0 !== null && v[2] < CROP.z0) return false;
    if (CROP.z1 !== null && v[2] > CROP.z1) return false;
  }
  return true;
}

const spec0 = CASES[CASE_KEY];
if (!spec0) {
  console.error(`未知 case=${CASE_KEY}，可选：${Object.keys(CASES).join(', ')}`);
  process.exit(1);
}

/** 与 `layout.js → centerDoors` 同一份：奇数开间取中间三间做门 */
function centerDoors(mian) {
  if (mian <= 1) return [0];
  if (mian % 2 === 1) {
    const c = (mian - 1) / 2;
    return [c - 1, c, c + 1].filter((i) => i >= 0 && i < mian);
  }
  return [mian / 2 - 1, mian / 2];
}

const D = deriveDimensions({
  mian: spec0.mian,
  jin: spec0.jin,
  rank: spec0.rank,
  platform: spec0.platform,
  roof: spec0.roof,
});

/** 与 `layout.js → mainSpec` 同源的构造（斗口制推导出来的尺寸全带过来） */
const spec = {
  rank: spec0.rank,
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
  caihua: spec0.caihua,
  tile: spec0.tile,
  columnColor: '#8f2820',
  wallType: 'red',
  doubleEave: false,
  circular: false,
  plaqueText: spec0.plaque,
  couplet: spec0.couplet || null,
  doors: centerDoors(D.mian),
  caojing: D.mian >= 5,
  /**
   * ⚠⚠ `rise` 必须用 **`D.width`**（整座面阔），不是 `D.bayW`（单间宽）。
   *   `layout.js` 里写的是 `const bayW = D.width;`（一个**命名坑**：
   *   变量叫 bayW、值却是面阔），后面 `rise: Math.max(2.0, D.bayW * 0.26)`
   *   用的就是这个别名 ⇒ 实际 rise = 38.98 × 0.26 = **10.13**。
   *   照抄成 `D.bayW`（= 6.336）⇒ rise = 2.0 ⇒ **导出的屋面是平的**，
   *   白模里看到的一切屋面构件都建立在错误的屋面上。
   */
  rise: Math.max(2.0, D.width * 0.26),
  overhang: spec0.overhang,
  hipRunX: spec0.hipRunX,
};

/**
 * ⚠ 这里**不能用 `buildBuilding()`** —— 它会造贴图材质，而 `textures.js`
 *   要 `document.createElement('canvas')` ⇒ 在 node 里直接炸。
 * ⇒ 改用**纯几何接口**：`buildRoof()` + `buildStructure()`（两者都只返回几何桶）。
 *   两者必须用**同一份 spec**，否则结构与屋面对不上。
 */
const rise = spec.rise;
const overhang = spec.overhang;
const roof = buildRoof({
  width: spec.width,
  depth: spec.depth,
  eaveY: spec.eaveY,
  rise,
  type: spec.roof,
  overhang,
  overhangX: overhang * 0.8,
  hipRunX: spec.hipRunX,
  upturn: 0.8,
  bulge: 0.45,
  circular: false,
  segments: 30,
  doubleEave: false,
  lowerRise: 0,
});
const structure = buildStructure({
  ...spec,
  dougongScale: spec.dougongScale,
  couplet: spec.couplet,
  roofSurfAt: roof.surfAt,
  roofSurfAtXY: roof.surfAtXY,
  roofRidgeHalfWidth: roof.ridgeHalfWidth,
});

/** 合并两个桶表：屋面 + 结构 */
const allBuckets = new Map();
for (const [k, list] of roof.geoms) allBuckets.set(k, [...(allBuckets.get(k) || []), ...list]);
for (const [k, list] of structure.geoms) allBuckets.set(k, [...(allBuckets.get(k) || []), ...list]);

const a = new THREE.Vector3();const b = new THREE.Vector3();
const c = new THREE.Vector3();
const e1 = new THREE.Vector3();
const e2 = new THREE.Vector3();
const n = new THREE.Vector3();

const tris = [];
const perBucket = {};
for (const [bucket, list] of allBuckets) {
  if (BUCKETS && !BUCKETS.includes(bucket)) continue;
  perBucket[bucket] = 0;
  for (const geo of list) {
    if (!geo?.attributes?.position) continue;
    const pos = geo.attributes.position;
    const idx = geo.index;
    const tri = Math.floor((idx ? idx.count : pos.count) / 3);
    for (let t = 0; t < tri; t++) {
      const ii = [0, 1, 2].map((k) => (idx ? idx.getX(t * 3 + k) : t * 3 + k));
      const p = ii.map((i) => [pos.getX(i), pos.getY(i), pos.getZ(i)]);
      if (!inCrop(p)) continue;
      a.set(...p[0]); b.set(...p[1]); c.set(...p[2]);
      e1.subVectors(b, a); e2.subVectors(c, a);
      n.crossVectors(e1, e2);
      if (n.lengthSq() < 1e-18) continue; // 退化面
      n.normalize();
      tris.push({ n: toZup([n.x, n.y, n.z]), v: p.map(toZup) });
      perBucket[bucket]++;
    }
  }
}

const tagParts = [];
if (BUCKETS) tagParts.push(BUCKETS.join('_'));
if (CROP.x0 !== null || CROP.y0 !== null || CROP.z0 !== null) {
  tagParts.push(
    `c${CROP.x0 ?? '*'}_${CROP.x1 ?? '*'}_${CROP.y0 ?? '*'}_${CROP.y1 ?? '*'}_${CROP.z0 ?? '*'}_${CROP.z1 ?? '*'}`
  );
}
const tag = tagParts.length ? `-${tagParts.join('-')}` : '';
const path = `/tmp/part-${CASE_KEY}${tag}.stl`;
const nTri = writeBinarySTL(path, tris, `yuanmingyuan ${spec0.name}`);
console.log(`${path}  三角 ${nTri}`);
console.log('   各桶:', JSON.stringify(perBucket));
console.log(
  `   建筑：宽 ${D.width.toFixed(2)} × 深 ${D.depth.toFixed(2)}，檐高 ${D.eaveY.toFixed(2)}，` +
    `台基 ${D.platformH.toFixed(2)}，斗口 ${D.doukou.toFixed(3)}，斗栱跳 ${D.dougongJumps}`
);
console.log(
  `   屋面：rise=${rise.toFixed(2)} ⇒ 脊高 ${(spec.eaveY + rise).toFixed(2)}` +
    `（檐高 ${spec.eaveY.toFixed(2)} + rise）· 出檐 ${overhang.toFixed(2)} · 翼角 ${spec.hipRunX.toFixed(2)}`
);
