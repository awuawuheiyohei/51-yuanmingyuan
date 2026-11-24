#!/usr/bin/env node
/**
 * **整景白模导出**（给 3D设计 / cq-viewer 做几何体检）
 *
 * ## 为什么还要这个
 *
 * `export-part-stl.mjs` 只能导**单座建筑**（硬编码 case）。
 * 但 2026-11-23 那轮考据订正新增了很多**景内配建筑**：
 * 鱼跃鸢飞的畅观轩/铺翠环流/传妙/多子亭、
 * 日天琳宇的穿堂/天桥/灯亭/东转角楼/西转角楼、
 * 西峰秀色的西峰秀色敞厅/小匡庐、
 * 澡身浴德的望瀛洲/深柳读书堂。
 *
 * ⇒ 这些**配建筑之间的关系**（谁压谁、谁插进谁、谁悬空）
 *   只有**整景一起看**才看得出来。
 *
 * ## 用法
 *
 *   node scripts/export-scene-stl.mjs --scene=鱼跃鸢飞
 *   node scripts/export-scene-stl.mjs --scene=日天琳宇 --bucket=wall,lattice
 *   node scripts/export-scene-stl.mjs --all
 *
 * ⚠ **查看器是 Z 轴向上（CAD 约定），我们的几何是 Y 向上**
 *   ⇒ 导出时绕 X 轴转 −90°：`(x, y, z) → (x, −z, y)`（手性不变，法线不反）。
 *
 * ⚠ 不用 `buildBuilding()`（它要 canvas 造贴图 ⇒ node 里会炸），
 *   用**纯几何接口** `buildRoof()` + `buildStructure()`，与 `export-part-stl.mjs` 同源。
 */
import * as THREE from 'three';
import fs from 'node:fs';
import { buildRoof } from '../src/scene/buildings/parts/roof.js';
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

/** 绕 X 轴转 −90°：Y-up → Z-up */
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

/** 与 `layout.js → centerDoors` 同一份 */
function centerDoors(mian) {
  if (mian <= 1) return [0];
  if (mian % 2 === 1) {
    const c = (mian - 1) / 2;
    return [c - 1, c, c + 1].filter((i) => i >= 0 && i < mian);
  }
  return [mian / 2 - 1, mian / 2];
}

/**
 * 造一座建筑的全部几何（结构 + 屋面），返回按桶分组的几何数组。
 * @param mian/jin/roof/... 形制
 * @param ox/oz 景内相对主建筑的偏移（米）
 */
function buildOne(opts) {
  const {
    mian, jin, rank, roof, caihua, platform, tile, plaque,
    ox = 0, oz = 0, doorsAllSides = false, label = '',
  } = opts;

  const D = deriveDimensions({ mian, jin, rank, platform, roof });
  const spec = {
    rank,
    width: D.width,
    depth: D.depth,
    mian: D.mian,
    jin: D.jin,
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
    plaqueText: plaque,
    couplet: null,
    doors: centerDoors(D.mian),
    doorsAllSides,
    caojing: D.mian >= 5,
    rise: Math.max(2.0, D.width * 0.26),
  };

  const rise = spec.rise;
  const overhang = 1.42;
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
    rise,
    overhang,
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

  const out = [];
  for (const [bucket, list] of st.geoms.entries()) {
    for (const g of list) out.push({ bucket, g, ox, oz, label });
  }
  for (const [bucket, list] of roofG.geoms.entries()) {
    for (const g of list) out.push({ bucket, g, ox, oz, label });
  }
  return out;
}

/** 把一个景里所有建筑（主殿 + 配建筑）造出来 */
function buildScene(sceneName) {
  const prog = SCENE_PROGRAM[sceneName];
  if (!prog) {
    console.error(`未知景：${sceneName}`);
    return null;
  }
  const m = prog.main;
  const items = [];
  items.push(
    buildOne({
      mian: m.mian, jin: m.jin, rank: prog.rank, roof: m.roof,
      caihua: m.caihua, platform: m.platform, tile: m.tile,
      plaque: prog.plaque || sceneName,
      doorsAllSides: !!m.doorsAllSides,
      ox: 0, oz: 0, label: '主殿',
    })
  );
  for (const a of prog.aux || []) {
    const af = defaultForm(a.rank);
    const am = a.mian ?? af.mian;
    const aj = a.jin ?? af.jin;
    items.push(
      buildOne({
        mian: am, jin: aj, rank: a.rank, roof: af.roof,
        caihua: af.caihua,
        platform: a.rank === 'pavilion' || a.rank === 'corridor' ? 'none' : 'simple',
        tile: m.tile,
        plaque: a.plaque || a.name,
        ox: a.x, oz: a.z, label: a.name || `配殿(${a.rank})`,
      })
    );
  }
  return items.flat();
}

/** 几何 → 三角形（并按 offset 平移） */
function toTriangles(items, bucketFilter) {
  const tris = [];
  const perBucket = {};
  for (const it of items) {
    if (bucketFilter && !bucketFilter.includes(it.bucket)) continue;
    perBucket[it.bucket] = (perBucket[it.bucket] || 0) + 1;
    const g = it.g;
    // ⚠ 桶里可能混着 **Group**（不是 BufferGeometry）—— 例如屋面把若干
    //   构件装在一个 Group 里。必须按 `isBufferGeometry` 过滤，
    //   否则 `g.attributes` 是 undefined ⇒ 直接抛错。
    if (!g || !g.isBufferGeometry) continue;
    const pos = g.attributes.position;
    const idx = g.index;
    const nTri = Math.floor((idx ? idx.count : pos.count) / 3);
    const v = new THREE.Vector3();
    for (let t = 0; t < nTri; t++) {
      const ii = [0, 1, 2].map((k) => (idx ? idx.getX(t * 3 + k) : t * 3 + k));
      const pts = ii.map((i) => {
        v.fromBufferAttribute(pos, i);
        return toZup([v.x + it.ox, v.y, v.z + it.oz]);
      });
      const a = new THREE.Vector3(...pts[0]);
      const b = new THREE.Vector3(...pts[1]);
      const c = new THREE.Vector3(...pts[2]);
      const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
      tris.push({ n: [n.x, n.y, n.z], v: pts });
    }
  }
  return { tris, perBucket };
}

const targets = args.all
  ? Object.keys(SCENE_PROGRAM)
  : [args.scene].filter(Boolean);

if (!targets.length) {
  console.error('用法：node scripts/export-scene-stl.mjs --scene=<景名> | --all [--bucket=a,b]');
  process.exit(1);
}

const bucketFilter = args.bucket ? String(args.bucket).split(',') : null;

for (const sceneName of targets) {
  const items = buildScene(sceneName);
  if (!items) continue;
  const { tris, perBucket } = toTriangles(items, bucketFilter);
  const path = `/tmp/scene-${sceneName}.stl`;
  const n = writeBinarySTL(path, tris, `yuanmingyuan scene ${sceneName}`);
  // 统计每座建筑的包围盒高度范围（查"悬空/沉地"）
  const bb = new THREE.Box3();
  for (const it of items) {
    if (!it.g || !it.g.isBufferGeometry) continue;
    it.g.computeBoundingBox();
    const b = it.g.boundingBox;
    bb.expandByPoint(new THREE.Vector3(b.min.x + it.ox, b.min.y, b.min.z + it.oz));
    bb.expandByPoint(new THREE.Vector3(b.max.x + it.ox, b.max.y, b.max.z + it.oz));
  }
  console.log(
    `${path}  三角 ${n}  建筑 ${items.length}  座  ` +
      `包围盒 X[${bb.min.x.toFixed(1)},${bb.max.x.toFixed(1)}] ` +
      `Y[${bb.min.y.toFixed(1)},${bb.max.y.toFixed(1)}] ` +
      `Z[${bb.min.z.toFixed(1)},${bb.max.z.toFixed(1)}]`
  );
  console.log('   各桶:', JSON.stringify(perBucket));
}
