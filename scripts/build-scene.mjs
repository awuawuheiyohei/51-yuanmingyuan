/**
 * 把 data/raw/ 下的 OSM 要素与 DEM 瓦片融合成 scene.json
 *
 * 输出：
 *   terrain  高程网格（局部米制坐标）
 *   water    水面多边形（福海等）
 *   buildings 建筑轮廓（含官式建筑与西洋楼）
 *   scenes   四十景锚点（含形制配置）
 *   rockery  假山群
 *   trees    树木
 *
 * 坐标：局部 ENU。原点在 bbox 中心，X 向东，Z 向南，Y 向上。
 */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { BBOX, LON0, LAT0 } from './config.mjs';
import { SCENE_PROGRAM } from '../src/scene/scenes-program.js';
import { deriveDimensions, separateFootprints } from '../src/scene/buildings/modular.js';
import { defaultForm } from '../src/scene/buildings/index.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = resolve(ROOT, 'data/raw');
const OUT = resolve(ROOT, 'public/scene');

const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LON = 111320 * Math.cos((LAT0 * Math.PI) / 180);

const toX = (lon) => (lon - LON0) * M_PER_DEG_LON;
const toZ = (lat) => -(lat - LAT0) * M_PER_DEG_LAT;
const toLon = (x) => LON0 + x / M_PER_DEG_LON;
const toLat = (z) => LAT0 - z / M_PER_DEG_LAT;

/* ------------------------------------------------------------------ 工具 */

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ringArea(ring) {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[(i + 1) % ring.length];
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
}

function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/* ------------------------------------------------------------------ DEM */

const TILE_SIZE = 256;
const ZOOM = 14;

const lon2tileX = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2tileY = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z
  );
};

async function loadDemTiles() {
  const dir = resolve(RAW, 'dem');
  if (!existsSync(dir)) return new Map();
  const files = await readdir(dir);
  const tiles = new Map();
  for (const f of files) {
    if (!f.endsWith('.png')) continue;
    const [z, x, y] = f.replace('.png', '').split('-').map(Number);
    const png = PNG.sync.read(await readFile(resolve(dir, f)));
    tiles.set(`${z}/${x}/${y}`, png);
  }
  return tiles;
}

/** Terrarium 解码: h = (R*256 + G + B/256) - 32768 */
function sampleDem(tiles, lon, lat) {
  const tx = lon2tileX(lon, ZOOM);
  const ty = lat2tileY(lat, ZOOM);
  const png = tiles.get(`${ZOOM}/${tx}/${ty}`);
  if (!png) return null;
  const worldSize = TILE_SIZE * 2 ** ZOOM;
  const gx = ((lon + 180) / 360) * worldSize;
  const r = (lat * Math.PI) / 180;
  const gy = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * worldSize;
  const px = Math.min(TILE_SIZE - 1, Math.max(0, Math.floor(gx - tx * TILE_SIZE)));
  const py = Math.min(TILE_SIZE - 1, Math.max(0, Math.floor(gy - ty * TILE_SIZE)));
  const i = (py * png.width + px) * 4;
  return png.data[i] * 256 + png.data[i + 1] + png.data[i + 2] / 256 - 32768;
}

/* ------------------------------------------------------- 四十景配置表 */

/**
 * 四十景锚点坐标
 *
 * 两类来源，标注在 source 字段：
 *   'osm'      OpenStreetMap 园内实测标注（tourism=attraction / named buildings）
 *   'guide'    圆明园管理处官方《圆明园导览图》像素配准反算
 *              （10016×5197 官方图，与 OSM 实测点做最小二乘配准，
 *                残差中位约 50m）
 * 'guide' 的坐标来自官方导览图标注，比 OSM 覆盖更全。
 */
const SCENES = [
  { name: '正大光明', lon: 116.290597, lat: 40.001945, source: 'guide' },
  { name: '九州清晏', lon: 116.290179, lat: 40.003573, source: 'guide' },
  { name: '勤政亲贤', lon: 116.292393, lat: 40.002241, source: 'guide' },
  { name: '镂月开云', lon: 116.292315, lat: 40.003656, source: 'guide' },
  { name: '天然图画', lon: 116.291981, lat: 40.004986, source: 'guide' },
  { name: '碧桐书院', lon: 116.291472, lat: 40.005762, source: 'guide' },
  { name: '慈云普护', lon: 116.289936, lat: 40.005991, source: 'guide' },
  { name: '上下天光', lon: 116.289251, lat: 40.005604, source: 'guide' },
  { name: '杏花春馆', lon: 116.288394, lat: 40.005138, source: 'guide' },
  { name: '坦坦荡荡', lon: 116.288472, lat: 40.003925, source: 'guide' },
  { name: '茹古涵今', lon: 116.288553, lat: 40.003052, source: 'guide' },
  { name: '长春仙馆', lon: 116.288717, lat: 40.001846, source: 'guide' },
  { name: '山高水长', lon: 116.285908, lat: 40.003609, source: 'guide' },
  { name: '万方安和', lon: 116.286855, lat: 40.005029, source: 'guide' },
  { name: '月地云居', lon: 116.284469, lat: 40.00601, source: 'guide' },
  { name: '鸿慈永祜', lon: 116.283844, lat: 40.008793, source: 'guide' },
  { name: '武陵春色', lon: 116.286866, lat: 40.007025, source: 'guide' },
  { name: '映水兰香', lon: 116.289347, lat: 40.007674, source: 'guide' },
  { name: '澹泊宁静', lon: 116.290203, lat: 40.007891, source: 'guide' },
  { name: '水木明瑟', lon: 116.290293, lat: 40.008824, source: 'guide' },
  { name: '濂溪乐处', lon: 116.287732, lat: 40.00915, source: 'guide' },
  { name: '日光琳宇', lon: 116.28589, lat: 40.008072, source: 'guide' },
  { name: '汇芳书院', lon: 116.286328, lat: 40.010133, source: 'guide' },
  { name: '多稼如云', lon: 116.288295, lat: 40.010475, source: 'guide' },
  { name: '跃鸾飞', lon: 116.290906, lat: 40.011506, source: 'guide', alias: '鱼跃鸢飞' },
  { name: '西峰秀', lon: 116.292437, lat: 40.010308, source: 'guide', alias: '西峰秀色' },
  { name: '坐石临流', lon: 116.29255, lat: 40.007461, source: 'guide' },
  { name: '曲院风荷', lon: 116.293944, lat: 40.004753, source: 'guide' },
  { name: '同天深处', lon: 116.300245, lat: 40.01239, source: 'guide', alias: '方壶胜境' },
  { name: '蓬岛瑶台', lon: 116.298174, lat: 40.008536, source: 'guide' },
  { name: '平湖秋月', lon: 116.29605, lat: 40.010754, source: 'guide' },
  { name: '宜书房', lon: 116.299513, lat: 40.011303, source: 'guide', alias: '藏密楼' },
  { name: '北远山村', lon: 116.28836, lat: 40.011536, source: 'osm' },
  { name: '廓然大公', lon: 116.294319, lat: 40.010766, source: 'guide' },
  { name: '洁身浴德', lon: 116.295579, lat: 40.006796, source: 'guide' },
  { name: '夹镜鸣琴', lon: 116.298331, lat: 40.006112, source: 'guide' },
  { name: '别有洞天', lon: 116.301109, lat: 40.006342, source: 'guide' },
  { name: '接秀山房', lon: 116.301675, lat: 40.008412, source: 'guide' },
  { name: '涵虚朗鉴', lon: 116.304855, lat: 40.004105, source: 'guide' },
  { name: '方壶胜境', lon: 116.301675, lat: 40.012390, source: 'guide', alias: '接秀山房北' },
  { name: '水流云在', lon: 116.290194, lat: 40.009108, source: 'osm' },
  { name: '紫碧山房', lon: 116.283042, lat: 40.010509, source: 'guide' },
  { name: '含卫城', lon: 116.292432, lat: 40.009347, source: 'guide' },
  { name: '思永斋', lon: 116.30449, lat: 40.007644, source: 'guide' },
  { name: '涵月楼', lon: 116.303164, lat: 40.007266, source: 'guide' },
  { name: '福海', lon: 116.299042, lat: 40.008676, source: 'osm', water: true },
  { name: '西洋楼', lon: 116.30627, lat: 40.01281, source: 'guide', western: true },
];

/**
 * 西洋楼景区各建筑（官方导览图配准）
 * 中轴自西南向东北：谐奇趣 → 方外观 → 海晏堂 → 大水法 → 线法山
 * 远瀛观在大水法正北，泽兰堂、转湘帆在大水法东南。
 */
const WEST_BUILDINGS = [
  { name: '谐奇趣', lon: 116.302247, lat: 40.011416, kind: 'chinese' },
  { name: '方外观', lon: 116.303406, lat: 40.012357, kind: 'chinese' },
  { name: '海晏堂', lon: 116.305158, lat: 40.012596, kind: 'chinese' },
  { name: '大水法', lon: 116.30627, lat: 40.01281, kind: 'fountain' },
  { name: '远瀛观', lon: 116.306102, lat: 40.01338, kind: 'euro' },
  { name: '线法山', lon: 116.307126, lat: 40.01306, kind: 'rockery' },
  { name: '泽兰堂', lon: 116.306694, lat: 40.012184, kind: 'chinese' },
  { name: '转湘帆', lon: 116.307975, lat: 40.012207, kind: 'chinese' },
];

/* --------------------------------------------------------------- 主流程 */

async function loadOsm(name) {
  const f = resolve(RAW, `osm-${name}.json`);
  if (!existsSync(f)) return [];
  const d = JSON.parse(await readFile(f, 'utf8'));
  return d.elements || [];
}

/** OSM way/relation → 多边形环（局部米制） */
function elementRings(el) {
  if (el.type === 'way' && el.geometry) {
    const ring = el.geometry.map((g) => [toX(g.lon), toZ(g.lat)]);
    if (ring.length > 2) return [ring];
    return [];
  }
  if (el.type !== 'relation' || !el.members) return [];

  // relation：把成员 way 首尾相接拼成闭合环
  // 只取 role=outer / 空 role 的成员；inner（洞）单独处理
  const outer = [];
  const inner = [];
  for (const m of el.members) {
    if (m.type !== 'way' || !m.geometry) continue;
    const pts = m.geometry.map((g) => [toX(g.lon), toZ(g.lat)]);
    if (pts.length < 2) continue;
    if (m.role === 'inner') inner.push(pts);
    else outer.push(pts);
  }
  const rings = chainWays(outer);
  // 内环（洞）也作为独立环输出，交由上层按包含关系处理
  for (const i of inner) {
    if (i.length > 2) rings.push(i);
  }
  return rings;
}

/** 把零散的 way 段拼成闭合环 */
function chainWays(ways) {
  if (!ways.length) return [];
  const key = (p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;
  const remaining = ways.map((w) => w.slice());
  const rings = [];

  while (remaining.length) {
    let cur = remaining.shift();
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < remaining.length; i++) {
        const cand = remaining[i];
        const headK = key(cur[0]);
        const tailK = key(cur[cur.length - 1]);
        if (headK === key(cand[0])) {
          cur = cur.concat(cand.slice(1));
        } else if (headK === key(cand[cand.length - 1])) {
          cur = cur.concat(cand.slice(0, -1).reverse());
        } else if (tailK === key(cand[cand.length - 1])) {
          cur = cur.slice(0, -1).concat(cand.slice().reverse());
        } else if (tailK === key(cand[0])) {
          cur = cur.slice(0, -1).concat(cand);
        } else {
          continue;
        }
        remaining.splice(i, 1);
        changed = true;
        break;
      }
    }
    const k0 = key(cur[0]);
    const kN = key(cur[cur.length - 1]);
    if (cur.length > 2 && k0 === kN) {
      cur = cur.slice(0, -1);
      if (Math.abs(ringArea(cur)) > 1) rings.push(cur);
    } else if (cur.length > 2) {
      // 未闭合：尝试强制闭合（OSM 关系常见）
      const area = Math.abs(ringArea(cur));
      if (area > 2000) rings.push(cur);
    }
  }
  return rings;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const rnd = mulberry32(20261029);

  console.log('· 载入 DEM 瓦片 …');
  const demTiles = await loadDemTiles();

  /* ---- 地形网格 ---- */
  const COLS = 320;
  const ROWS = 320;
  const minX = toX(BBOX.w);
  const maxX = toX(BBOX.e);
  const minZ = toZ(BBOX.n);
  const maxZ = toZ(BBOX.s);
  const sizeX = maxX - minX;
  const sizeZ = maxZ - minZ;
  const heights = new Float32Array(COLS * ROWS);
  let demMissing = 0;
  for (let r = 0; r < ROWS; r++) {
    const z = minZ + (sizeZ * r) / (ROWS - 1);
    const lat = toLat(z);
    for (let c = 0; c < COLS; c++) {
      const x = minX + (sizeX * c) / (COLS - 1);
      const lon = toLon(x);
      const h = sampleDem(demTiles, lon, lat);
      if (h === null) {
        demMissing++;
        heights[r * COLS + c] = 0;
      } else {
        heights[r * COLS + c] = h;
      }
    }
  }
  console.log(`  ✓ 地形 ${COLS}×${ROWS}（DEM 缺失 ${demMissing} 格）`);
  if (demMissing > 0) {
    // 用邻近有效值填补
    const known = [];
    for (let i = 0; i < heights.length; i++) if (demMissing === 0 || heights[i] !== 0) known.push(heights[i]);
    const avg = known.reduce((a, b) => a + b, 0) / Math.max(1, known.length);
    for (let i = 0; i < heights.length; i++) if (heights[i] === 0) heights[i] = avg;
  }

  /* ---- 园界（先于水面，用于裁掉园外要素） ---- */
  const parkEls = await loadOsm('park');
  let parkRing = null;
  let parkBest = 0;
  for (const el of parkEls) {
    const nm = (el.tags || {}).name || '';
    if (!nm.includes('圆明园')) continue;
    for (const ring of elementRings(el)) {
      const a = Math.abs(ringArea(ring));
      if (a > parkBest) {
        parkBest = a;
        parkRing = ring;
      }
    }
  }
  console.log(`  ✓ 园界 ${parkBest ? (parkBest / 1e4).toFixed(0) + ' 公顷' : '未找到'}`);

  /* ---- 三园核心范围 ----
   * OSM 的「圆明园遗址公园」多边形东西向比历史园林本体宽出近一公里，
   * 东侧多出一大片并不属于乾隆园林的空地（是今日园区的扩展部分）。
   * 这里改以四十景的实测分布 + 福海反推"三园核心"范围：
   *   西缘 = 最西一景再向西 300m
   *   东缘 = 福海中心再向东 320m
   * 用于裁剪建筑 / 水面 / 树木，避免把园外算进来。          */
  const anchorXs = SCENES.map((s) => toX(s.lon));
  const anchorZs = SCENES.map((s) => toZ(s.lat));
  const garden = {
    xMin: Math.min(...anchorXs) - 260,
    xMax: Math.max(...anchorXs) + 120,
    zMin: Math.min(...anchorZs) - 240,
    zMax: Math.max(...anchorZs) + 220,
  };
  const inGarden = (x, z) =>
    x >= garden.xMin && x <= garden.xMax && z >= garden.zMin && z <= garden.zMax;
  console.log(
    `  ✓ 三园核心范围 x[${garden.xMin.toFixed(0)}, ${garden.xMax.toFixed(0)}] ` +
      `z[${garden.zMin.toFixed(0)}, ${garden.zMax.toFixed(0)}]（东西 ${(garden.xMax - garden.xMin).toFixed(0)}m）`
  );

  /* ---- 四十景锚点 ---- */
  const sceneOut = SCENES.map((s) => {
    const prog = SCENE_PROGRAM[s.name];
    return {
      ...s,
      x: toX(s.lon),
      z: toZ(s.lat),
      note: prog?.note || s.note || '',
      rock: prog?.rock ?? 0,
      grove: prog?.grove || null,
      waterKind: prog?.water || null,
    };
  });

  /* ---- 水面 ---- */
  console.log('· 解析水面 …');
  const waterEls = await loadOsm('water');
  const water = [];
  for (const el of waterEls) {
    const t = el.tags || {};
    const isBig = t.name || t.water === 'lake' || t.natural === 'water';
    // 清河、万泉河是穿园而过的现代河道，不是园内水面
    if (/河|渠|沟/.test(t.name || '')) continue;
    for (const ring of elementRings(el)) {
      const a = Math.abs(ringArea(ring));
      if (a < 220) continue; // 过滤小水塘
      // 必须基本落在园内，否则是园外的河湖（颐和园一侧）
      if (parkRing) {
        let inside = 0;
        for (const [x, z] of ring) {
          if (pointInRing(x, z, parkRing)) inside++;
        }
        const ratio = inside / ring.length;
        if (ratio < 0.995) continue;
        // 质心也必须在园内
        let cx = 0;
        let cz = 0;
        for (const [x, z] of ring) {
          cx += x;
          cz += z;
        }
        cx /= ring.length;
        cz /= ring.length;
        if (!pointInRing(cx, cz, parkRing)) continue;
      }
      // 还要落在三园核心范围内
      {
        let cx = 0;
        let cz = 0;
        for (const [x, z] of ring) {
          cx += x;
          cz += z;
        }
        cx /= ring.length;
        cz /= ring.length;
        if (!inGarden(cx, cz)) continue;
      }
      water.push({ ring, area: a, big: !!isBig });
    }
  }
  water.sort((a, b) => b.area - a.area);
  // 去掉重叠：若小水面 85% 以上落在大水面内，视为重复或误标的内环
  const dropped = [];
  const waterKeep = [];
  for (const w of water) {
    let covered = 0;
    for (const s2 of waterKeep) {
      let inside = 0;
      for (const [x, z] of w.ring) if (pointInRing(x, z, s2.ring)) inside++;
      if (inside / w.ring.length > 0.85) {
        covered = 1;
        break;
      }
    }
    if (covered) {
      dropped.push(w);
      continue;
    }
    waterKeep.push(w);
    if (waterKeep.length >= 60) break;
  }
  if (dropped.length) {
    console.log(`  ✓ 剔除重叠水面 ${dropped.length} 片`);
  }

  // 逐景水景：考据中明确有池的景，在其旁补一小片水面
  let pondAdded = 0;
  for (const s of sceneOut) {
    if (s.waterKind !== 'pond') continue;
    const r = 34 + rnd() * 26;
    const seg = 18;
    const ring = [];
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const rr = r * (0.72 + rnd() * 0.5);
      ring.push([s.x + Math.cos(a) * rr + 42, s.z + Math.sin(a) * rr * 0.7 + 26]);
    }
    waterKeep.push({ ring, area: Math.abs(ringArea(ring)), big: false, level: null, pond: true });
    pondAdded++;
  }
  console.log(`  ✓ 水面 ${waterKeep.length} 片（另补逐景池 ${pondAdded} 处，最大 ${(waterKeep[0]?.area / 1e4 || 0).toFixed(1)} 公顷）`);

  /* ---- 水位与开凿 ----
   * 福海、如意洲诸池都是人工挖出的，真实 DEM 上没有凹陷，
   * 因此这里自行确定水位并把地形"挖"到水位以下。            */
  const gridH = (x, z) => {
    const fx = ((x - minX) / sizeX) * (COLS - 1);
    const fz = ((z - minZ) / sizeZ) * (ROWS - 1);
    const c = Math.max(0, Math.min(COLS - 1, Math.round(fx)));
    const r = Math.max(0, Math.min(ROWS - 1, Math.round(fz)));
    return heights[r * COLS + c];
  };

  for (const w of waterKeep) {
    const ring = w.ring;
    // 质心
    let cx = 0;
    let cz = 0;
    for (const [x, z] of ring) {
      cx += x;
      cz += z;
    }
    w.cx = cx / ring.length;
    w.cz = cz / ring.length;
    // 水位：取岸线最低高程减一点余量。
    // 用最低值而不是中位数——园内地面本就是平的，中位数会让部分岸线
    // 低于水面而"漫"到岸上；用最低值保证水面不溢出岸线。
    const edgeH = ring.map(([x, z]) => gridH(x, z)).sort((a, b) => a - b);
    const level = (edgeH[0] ?? 0) - 0.08;
    w.level = level;

    // 质心与最大半径，用于估算深度剖面
    let maxR = 1;
    for (const [x, z] of ring) maxR = Math.max(maxR, Math.hypot(x - cx, z - cz));
    w.maxR = maxR;

    // 开凿
    const depth = Math.min(9, Math.sqrt(w.area) * 0.09 + 1.2);
    const cells = [];
    for (let r = 0; r < ROWS; r++) {
      const z = minZ + (sizeZ * r) / (ROWS - 1);
      for (let c = 0; c < COLS; c++) {
        const x = minX + (sizeX * c) / (COLS - 1);
        if (!pointInRing(x, z, ring)) continue;
        const idx = r * COLS + c;
        if (heights[idx] >= level) continue;
        const d = Math.hypot(x - cx, z - cz) / maxR; // 0 中心 → 1 岸边
        const target = level - depth * (1 - Math.pow(d, 2.2));
        if (target < heights[idx]) heights[idx] = target;
        cells.push([r, c]);
      }
    }
    // 护岸：沿池边一圈抬起一点，让水陆有明确边界
    for (const [r, c] of cells) {
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr < 0 || cc < 0 || rr >= ROWS || cc >= COLS) continue;
        const x = minX + (sizeX * cc) / (COLS - 1);
        const z = minZ + (sizeZ * rr) / (ROWS - 1);
        if (pointInRing(x, z, ring)) continue;
        const idx = rr * COLS + cc;
        if (heights[idx] < level + 0.35) heights[idx] = level + 0.35;
      }
    }
  }
  console.log('  ✓ 已按水位开凿湖池地形');

  // 开凿会在栅格上留下台阶，水面半透明时会透出来 —— 做一次平滑
  const smooth = heights.slice();
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = 1; c < COLS - 1; c++) {
      const i = r * COLS + c;
      smooth[i] =
        (heights[i] * 4 +
          heights[i - 1] +
          heights[i + 1] +
          heights[i - COLS] +
          heights[i + COLS]) /
        8;
    }
  }
  heights.set(smooth);

  /* ---- 建筑（OSM 现状轮廓） ---- */
  console.log('· 解析建筑轮廓 …');
  const bldEls = await loadOsm('buildings');
  const buildings = [];
  for (const el of bldEls) {
    const rings = elementRings(el);
    if (!rings.length) continue;
    const ring = rings.reduce((a, b) => (Math.abs(ringArea(b)) > Math.abs(ringArea(a)) ? b : a));
    const area = Math.abs(ringArea(ring));
    if (area < 12) continue;
    // 三园核心范围之外的不算圆明园建筑
    {
      let bx = 0;
      let bz = 0;
      for (const [x, z] of ring) {
        bx += x;
        bz += z;
      }
      bx /= ring.length;
      bz /= ring.length;
      if (!inGarden(bx, bz)) continue;
    }
    // 质心
    let cx = 0;
    let cz = 0;
    for (const [x, z] of ring) {
      cx += x;
      cz += z;
    }
    cx /= ring.length;
    cz /= ring.length;
    buildings.push({ ring, area, cx, cz, tags: el.tags || {} });
  }
  console.log(`  ✓ 现状建筑 ${buildings.length} 座`);

  /* ---- 步道 ---- */
  const pathEls = await loadOsm('paths');
  const paths = [];
  for (const el of pathEls) {
    if (el.type !== 'way' || !el.geometry) continue;
    const t = el.tags || {};
    const kind = t.highway || t.barrier || t.landuse || '';
    if (!kind) continue;
    const line = el.geometry.map((g) => [toX(g.lon), toZ(g.lat)]);
    if (line.length < 2) continue;
    paths.push({ kind, line });
  }
  console.log(`  ✓ 步道/林地 ${paths.length} 条`);

  /* ---- 步道裁剪 ----
   * OSM 的路网是连续的，穿过湖面、也一直延伸到园外去。
   * 直接铺出来就是：一条白线横穿福海、几条白线伸出园界。
   * 这里按"在三园内 且 不在水上"把折线切成若干干地段。 */
  const waterPts = (x, z) => waterKeep.some((w) => pointInRing(x, z, w.ring));
  const dryInGarden = (x, z) => inGarden(x, z) && !waterPts(x, z);

  /**
   * 按 insideFn 把折线切成若干连续段。
   * 端点与中点都测一次，免得漏掉两点之间那一小段跨水。
   */
  function splitBy(line, insideFn) {
    const runs = [];
    let cur = null;
    for (let i = 0; i < line.length; i++) {
      const [x, z] = line[i];
      let ok = insideFn(x, z);
      if (ok && i > 0) {
        const [px, pz] = line[i - 1];
        ok = insideFn((x + px) / 2, (z + pz) / 2);
      }
      if (ok) {
        if (!cur) {
          cur = [];
          runs.push(cur);
        }
        cur.push([x, z]);
      } else cur = null;
    }
    return runs;
  }

  const pathSegs = [];
  let cutCross = 0;
  for (const p of paths) {
    const runs = splitBy(p.line, dryInGarden);
    if (runs.length !== 1) cutCross++;
    for (const r of runs) {
      // 太短的碎段没有意义（多为跨界时被切出来的残段）
      let len = 0;
      for (let i = 0; i < r.length - 1; i++)
        len += Math.hypot(r[i + 1][0] - r[i][0], r[i + 1][1] - r[i][1]);
      if (len < 6) continue;
      pathSegs.push({ kind: p.kind, line: r, len });
    }
  }
  console.log(
    `  ✓ 步道裁剪：${paths.length} 条 → ${pathSegs.length} 段（切掉跨水/出园 ${cutCross} 条）`
  );

  /* ---- 游廊选线 ----
   * 圆明园的长廊沿水岸与景点之间连接。选"园内较长、且靠近景点"的
   * 游路来起廊，让廊出现在该出现的地方，而不是满园乱铺。 */
  const sceneAnchors = SCENES.map((s2) => [toX(s2.lon), toZ(s2.lat)]);
  // 落在水面上的点
  const inAnyWater = (x, z) =>
    waterKeep.some((w) => pointInRing(x, z, w.ring));
  const corridorCandidates = [];
  // 游廊沿**原始**长路径选线（一条路可能只被湖面切开一小段，
  // 裁剪后就没法起廊了）；跨水的部分在成线后再切。
  for (const p of paths) {
    if (p.kind !== 'footway' && p.kind !== 'path' && p.kind !== 'pedestrian') continue;
    const line = p.line;
    if (line.length < 4) continue;
    let len = 0;
    for (let i = 0; i < line.length - 1; i++)
      len += Math.hypot(line[i + 1][0] - line[i][0], line[i + 1][1] - line[i][1]);
    if (len < 55) continue;
    const mx = line[Math.floor(line.length / 2)][0];
    const mz = line[Math.floor(line.length / 2)][1];
    if (garden && !inGarden(mx, mz)) continue;
    // 靠近某个景才起廊
    let near = false;
    for (const [ax, az] of sceneAnchors) {
      if (Math.hypot(ax - mx, az - mz) < 190) {
        near = true;
        break;
      }
    }
    if (!near) continue;
    corridorCandidates.push({ line, len });
  }
  corridorCandidates.sort((a, b) => b.len - a.len);
  /**
   * 四十景建筑的**占地**（主殿 + 配殿）。
   *
   * ⚠ 游廊必须避开它们：长廊从殿宇里穿过去，就是**穿模**——
   *   廊的屋面与殿的屋面交叠，廊柱插进殿身，远看是"廊穿殿"。
   *   游廊选线只看"离景点近不近"，不看"会不会撞上殿" ⇒ 必须补这一刀。
   *
   * 尺寸由斗口制模数推导（`modular.js`），所以建筑变宽变高时
   * 这里自动跟着变，不会漏判。
   */
  /** 与 layout.js 的 OVERHANG_PAD 必须一致（出檐 + 翼角起翘余量） */
  const PAD = 1.6;
  const sceneFootprints = [];
  for (const s2 of sceneOut) {
    const prog = SCENE_PROGRAM[s2.name];
    if (!prog || !prog.main) continue;
    const D = deriveDimensions({
      mian: prog.main.mian,
      jin: prog.main.jin,
      rank: prog.rank,
      platform: prog.main.platform,
      roof: prog.main.roof,
    });
    const fp = [{ x: 0, z: 0, hw: D.width / 2 + PAD, hd: D.depth / 2 + PAD }];
    for (const a of prog.aux || []) {
      const af = defaultForm(a.rank);
      const AD = deriveDimensions({
        mian: a.mian ?? af.mian,
        jin: a.jin ?? af.jin,
        rank: a.rank,
        platform: a.rank === 'pavilion' ? 'none' : 'simple',
        roof: af.roof,
      });
      fp.push({ x: a.x, z: a.z, hw: AD.width / 2 + PAD, hd: AD.depth / 2 + PAD });
    }
    // ⚠ **必须用与布局同一份分离算法**（`modular.js → separateFootprints`）：
    //   配殿会被推开，若这里还用原始方位去切游廊，
    //   推开的配殿就正好落在没被切掉的游廊上 ⇒ 廊穿殿。
    const sep = separateFootprints(fp, PAD);
    for (let k = 0; k < fp.length; k++) {
      sceneFootprints.push({
        x: s2.x + sep[k].x,
        z: s2.z + sep[k].z,
        r: Math.hypot(fp[k].hw, fp[k].hd) - PAD, // 保守：取外接圆（去掉已计的余量）
      });
    }
  }
  /** 该点是否落在四十景建筑里（留 2.5m 余量给屋面出檐） */
  const inSceneBuilding = (x, z) =>
    sceneFootprints.some((f) => Math.hypot(x - f.x, z - f.z) < f.r + 2.5);

  /**
   * 切线之前先把折线**加密**。
   *
   * ⚠ `splitBy` 只在**折线顶点**上判定：OSM 的路径顶点可能相距十几米，
   *   一座只有几米宽的殿宇正好落在两个顶点之间 —— 判定不到，
   *   游廊就从殿里穿过去了（廊顶与殿顶交叠 = 穿模）。
   *   先按 3m 加密，逐点判定就不会漏。
   */
  const densify = (line, step = 3) => {
    const out = [line[0]];
    for (let i = 0; i < line.length - 1; i++) {
      const [x1, z1] = line[i];
      const [x2, z2] = line[i + 1];
      const len = Math.hypot(x2 - x1, z2 - z1);
      const n = Math.max(1, Math.ceil(len / step));
      for (let k = 1; k <= n; k++) {
        out.push([x1 + ((x2 - x1) * k) / n, z1 + ((z2 - z1) * k) / n]);
      }
    }
    return out;
  };

  // 成线后再切掉跨水段与穿殿段：长廊不能从湖面上架过去，也不能从殿里穿过去
  const corridors = [];
  for (const c of corridorCandidates.slice(0, 14)) {
    for (const run of splitBy(
      densify(c.line),
      (x, z) => inGarden(x, z) && !inAnyWater(x, z) && !inSceneBuilding(x, z)
    )) {
      let l = 0;
      for (let i = 0; i < run.length - 1; i++)
        l += Math.hypot(run[i + 1][0] - run[i][0], run[i + 1][1] - run[i][1]);
      if (l < 25) continue;
      corridors.push(run);
    }
  }
  console.log(
    `  ✓ 游廊选线 ${corridors.length} 条（总长 ${corridors
      .reduce((s2, l) => {
        let t = 0;
        for (let i = 0; i < l.length - 1; i++)
          t += Math.hypot(l[i + 1][0] - l[i][0], l[i + 1][1] - l[i][1]);
        return s2 + t;
      }, 0)
      .toFixed(0)} m）`
  );



  /* ---- 假山群 ---- */
  console.log('· 生成假山群 …');
  const rockery = [];
  for (const s of sceneOut) {
    if (!s.rock || s.rock < 0.05) continue;
    // 叠山：强度越高，山体越高、延展越广
    const n = Math.round(5 + s.rock * 26);
    const spread = 22 + s.rock * 120;
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const r = (18 + rnd() * spread) * (0.55 + s.rock * 0.7);
      // 叠山不许压在正殿上：山头盖住屋面，比没有山还糟
      if (r < 20) continue;
      rockery.push({
        x: s.x + Math.cos(a) * r,
        z: s.z + Math.sin(a) * r,
        r: 3 + rnd() * 9 * (0.45 + s.rock),
        h: 3 + rnd() * 12 * (0.45 + s.rock),
        seed: Math.floor(rnd() * 1e6),
        y: 0,
      });
    }
  }
  console.log(`  ✓ 假山 ${rockery.length} 座`);

  /* ---- 树木 ---- */
  console.log('· 生成树木 …');
  const trees = [];
  // 以针叶为主、间杂花树（参照视频中林相：松为主，配桃柳枫）
  const treeTypes = [
    'pine', 'pine', 'pine', 'pine',
    'willow', 'willow', 'willow',
    'blossom', 'blossom',
    'poplar', 'poplar', 'poplar',
    'maple',
  ];
  /**
   * 各树种的**实际高度区间**（米）。
   * 全园都用同一高度是不对的：白杨能到 15~20m，垂柳 5~10m，桃杏只有 3.5~6.5m。
   * 高度是判断"等比例"最直接的线索——树矮了，殿宇就显大。
   */
  const TREE_HEIGHT = {
    pine: [7, 13], // 松（含古松，园中最老的树）
    willow: [5, 10], // 垂柳
    blossom: [3.5, 6.5], // 桃、杏、海棠
    poplar: [12, 20], // 白杨（钻天杨）
    maple: [7, 12], // 枫、皂荚
  };
  const treeH = (type) => {
    const r = TREE_HEIGHT[type] || [5, 9];
    return r[0] + rnd() * (r[1] - r[0]);
  };
  const inPark = (x, z) =>
    (parkRing ? pointInRing(x, z, parkRing) : true) && inGarden(x, z);
  // 预先把水面做成网格占用表，避免逐点做点在多边形内
  const waterMask = new Uint8Array(COLS * ROWS);
  for (const w of waterKeep) {
    for (let r = 0; r < ROWS; r++) {
      const z = minZ + (sizeZ * r) / (ROWS - 1);
      for (let c = 0; c < COLS; c++) {
        const x = minX + (sizeX * c) / (COLS - 1);
        if (pointInRing(x, z, w.ring)) waterMask[r * COLS + c] = 1;
      }
    }
  }
  const isWaterCell = (x, z) => {
    const c = Math.round(((x - minX) / sizeX) * (COLS - 1));
    const r = Math.round(((z - minZ) / sizeZ) * (ROWS - 1));
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return false;
    return waterMask[r * COLS + c] === 1;
  };

  // 西洋楼景区：喷泉院落里不能长树。
  // 大水法一带正好落在一片密林里，树冠会把海棠形水池、石龛、喷水塔全盖死。
  // 这里在**构建期**把院落范围排除掉——不要在运行期去改实例矩阵。
  const westCourts = [];
  {
    // WEST_BUILDINGS 是模块级常量，这里自己换算成局部坐标
    const wOf = (n) => {
      const b = WEST_BUILDINGS.find((b2) => b2.name === n);
      return b ? { ...b, x: toX(b.lon), z: toZ(b.lat) } : null;
    };
    const dw = wOf('大水法');
    const he = wOf('谐奇趣');
    const hy = wOf('海晏堂');
    // 景区中轴方向（谐奇趣 → 线法山）与"南"向法向
    const ax = (he && dw
      ? Math.atan2(dw.z - he.z, dw.x - he.x)
      : 0);
    const perpX = Math.cos(ax + Math.PI / 2);
    const perpZ = Math.sin(ax + Math.PI / 2);
    const GSF = 26.5; // 观水法相对大水法的偏移（推定，与 western.js 一致）
    if (dw) {
      westCourts.push({ x: dw.x, z: dw.z, rx: 34, rz: 30 }); // 大水法海棠池
      westCourts.push({
        x: dw.x + perpX * GSF,
        z: dw.z + perpZ * GSF,
        rx: 17,
        rz: 14,
      }); // 观水法台
    }
    if (he) westCourts.push({ x: he.x, z: he.z, rx: 22, rz: 22 }); // 谐奇趣海棠池
    if (hy) westCourts.push({ x: hy.x, z: hy.z, rx: 26, rz: 23 }); // 海晏堂生肖院
  }
  const inWestCourt = (x, z) =>
    westCourts.some((c) => {
      const dx = (x - c.x) / c.rx;
      const dz = (z - c.z) / c.rz;
      return dx * dx + dz * dz <= 1;
    });

  // 景区建筑前要留出空地。
  // 树是按林相随机撒的，撒到建筑跟前就会把屋面盖死——从地面看过去，
  // 一座座殿宇全埋在树冠里，既不真实也看不见。真实园林里建筑周围必有庭院。
  /**
   * 景区建筑前的**庭院空地**（不种树）。
   *
   * ⚠ 半径必须由**斗口制推导出的实际建筑尺寸**决定，不能写死。
   *   原来固定 r = 30m，是照着旧尺寸（主殿面阔 23.1m）定的；
   *   改成斗口制后主殿面阔 32.5m、配殿也变宽，
   *   30m 的空地盖不住 —— 树就长在殿前，屋面被埋。
   *
   * 依据：真实官式院落里，殿前是**开敞的月台 + 庭院**，
   * 树只种在墙外与配建筑之后。
   */
  const clearings = [];
  const axialPaths = [];
  for (const s2 of sceneOut) {
    if (!s2.name) continue;
    const prog = SCENE_PROGRAM[s2.name];
    if (!prog || !prog.main) continue;
    const D = deriveDimensions({
      mian: prog.main.mian,
      jin: prog.main.jin,
      rank: prog.rank,
      platform: prog.main.platform,
      roof: prog.main.roof,
    });
    // 主殿半宽 + 最远的配殿外缘 + 余地
    let reach = D.width / 2;
    for (const a of prog.aux || []) {
      const af = defaultForm(a.rank);
      const AD = deriveDimensions({
        mian: a.mian ?? af.mian,
        jin: a.jin ?? af.jin,
        rank: a.rank,
        platform: a.rank === 'pavilion' ? 'none' : 'simple',
        roof: af.roof,
      });
      reach = Math.max(reach, Math.abs(a.x) + AD.width / 2);
    }
    clearings.push({ x: s2.x, z: s2.z, r: reach + 12 });
    // 御路通道：正面朝南（+Z），南面开一条与主殿同宽的轴线御道
    axialPaths.push({
      x: s2.x,
      z: s2.z,
      halfW: Math.max(9, D.width / 2 + 4),
      len: 78 + D.depth,
    });
  }
  for (const w of WEST_BUILDINGS) {
    // ⚠ 半径 20m **不够**：树直接长在西洋楼的立面前，
    //   从任何角度看都先被树挡住 —— 建筑的几何做得再好也看不见。
    //   西洋楼本就是"疏林草地"的开敞格局，30m 留空不违和，
    //   反倒更接近欧洲式庭园的疏朗。
    clearings.push({ x: toX(w.lon), z: toZ(w.lat), r: 30 });
  }
  const inClearing = (x, z) =>
    clearings.some((c) => (x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r);

  // 御路通道：每景正面朝南（建筑正面朝 +Z），南面开一条空廊。
  // 真实园林里正殿前必有轴线御道；不空出来，从任何角度都只能看见树。
  const inCorridor = (x, z) =>
    axialPaths.some(
      (c) => Math.abs(x - c.x) < c.halfW && z > c.z - 6 && z < c.z + c.len
    );

  for (let i = 0; i < 62000; i++) {
    const x = minX + rnd() * sizeX;
    const z = minZ + rnd() * sizeZ;
    if (!inPark(x, z)) continue;
    // 避开水面
    if (isWaterCell(x, z)) continue;
    // 避开西洋楼喷泉院落
    if (inWestCourt(x, z)) continue;
    // 避开景区建筑前的庭院空地
    if (inClearing(x, z)) continue;
    // 避开御路通道
    if (inCorridor(x, z)) continue;
    // 避开建筑
    let inBuilding = false;
    for (const b of buildings) {
      if (Math.abs(b.cx - x) < 22 && Math.abs(b.cz - z) < 22 && pointInRing(x, z, b.ring)) {
        inBuilding = true;
        break;
      }
    }
    if (inBuilding) continue;
    const type = treeTypes[Math.floor(rnd() * treeTypes.length)];
    trees.push({
      x,
      z,
      h: treeH(type),
      type,
      seed: Math.floor(rnd() * 1e6),
      y: 0,
    });
  }

  // 逐景林相：按考据给每景补一片该景特有的树种
  let groveCount = 0;
  for (const s of sceneOut) {
    if (!s.grove) continue;
    const n = 26 + Math.floor(rnd() * 26);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 30 + rnd() * 95;
      const x = s.x + Math.cos(a) * r;
      const z = s.z + Math.sin(a) * r;
      if (!inPark(x, z) || isWaterCell(x, z)) continue;
      // 林相也要让开建筑：树贴着殿宇种，屋面就看不见了
      if (inClearing(x, z)) continue;
      if (inCorridor(x, z)) continue;
      trees.push({
        x,
        z,
        h: treeH(s.grove),
        type: s.grove,
        seed: Math.floor(rnd() * 1e6),
        y: 0,
      });
      groveCount++;
    }
  }
  console.log(`  ✓ 树木 ${trees.length} 棵（其中逐景林相 ${groveCount} 棵）`);

  /**
   * 剔除**同高程且部分重叠**的水面。
   *
   * ⚠ 前面那次去重只处理"小水面 85% 落在大水面内"（完全包含），
   *   **部分重叠**的两片水会活下来。而它们的**水位由各自岸线最低点决定**，
   *   常常正好相同 —— 两片水面在同一高度重叠 ⇒ **z-fighting**，
   *   渲染出来就是**蓝绿相间的棋盘格**（草皮/另一片水从缝里透出来）。
   *
   *   这里按**水位相同 + 边界真相交**再清一遍（保留面积大的那片）。
   */
  {
    const ringCross = (A, B) => {
      // A 的顶点落在 B 内
      for (const [x, z] of A) if (pointInRing(x, z, B)) return true;
      for (const [x, z] of B) if (pointInRing(x, z, A)) return true;
      // 边相交
      const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      for (let i = 0; i < A.length; i++) {
        const a1 = A[i];
        const a2 = A[(i + 1) % A.length];
        for (let j = 0; j < B.length; j++) {
          const b1 = B[j];
          const b2 = B[(j + 1) % B.length];
          const d1 = d(b1, b2, a1);
          const d2 = d(b1, b2, a2);
          const d3 = d(a1, a2, b1);
          const d4 = d(a1, a2, b2);
          if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
              ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
        }
      }
      return false;
    };
    const levelTol = 0.15; // 水位差 < 15cm 视为同高程（与人眼可辨的 2cm 台阶无关）
    let removed = 0;
    for (let i = 0; i < waterKeep.length; i++) {
      const w = waterKeep[i];
      if (!w || w.level == null) continue;
      for (let j = 0; j < waterKeep.length; j++) {
        if (i === j) continue;
        const o = waterKeep[j];
        if (!o || o.level == null) continue;
        if (Math.abs(w.level - o.level) > levelTol) continue;
        // 保留**更大**的那片；面积相等时保留序号靠前的
        // （否则两片面积相同会互相"让位"，谁也删不掉）
        if (w.area < o.area) continue;
        if (w.area === o.area && j > i) continue;
        if (!ringCross(w.ring, o.ring)) continue;
        waterKeep[i] = null;
        removed++;
        break;
      }
    }
    const kept = waterKeep.filter(Boolean);
    waterKeep.length = 0;
    waterKeep.push(...kept);
    if (removed) console.log(`  ✓ 剔除同高程重叠水面 ${removed} 片（防 z-fighting）`);
  }

  /* ---- 福海中的仙山（岛）----
   * 蓬岛瑶台、同天深处是福海里的仙山楼阁。
   * 必须在开凿之后堆：先挖出湖盆，再从湖底把岛堆起来，
   * 否则挖湖会把刚堆的岛又挖平。高度取相对抬升，并保证高出水面。 */
  const islandSpecs = [];
  for (const s2 of sceneOut) {
    if (s2.waterKind !== 'lake' || !s2.rock || s2.rock < 0.4) continue;
    let near = null;
    let nd = Infinity;
    for (const w of waterKeep) {
      const d = Math.hypot(w.cx - s2.x, w.cz - s2.z);
      if (d < nd) {
        nd = d;
        near = w;
      }
    }
    if (!near) continue;
    islandSpecs.push({
      x: s2.x,
      z: s2.z,
      r: 52 + s2.rock * 70,
      h: 7 + s2.rock * 9,
      level: near.level,
    });
  }
  if (islandSpecs.length) {
    for (let r = 0; r < ROWS; r++) {
      const z = minZ + (sizeZ * r) / (ROWS - 1);
      for (let c = 0; c < COLS; c++) {
        const x = minX + (sizeX * c) / (COLS - 1);
        for (const isl of islandSpecs) {
          const d = Math.hypot(x - isl.x, z - isl.z);
          if (d > isl.r) continue;
          const t = 1 - d / isl.r;
          const idx = r * COLS + c;
          const target = Math.max(
            isl.level + 1.6,
            heights[idx] + isl.h * Math.pow(t, 0.75)
          );
          if (target > heights[idx]) heights[idx] = target;
        }
      }
    }
    console.log(`  ✓ 福海仙山 ${islandSpecs.length} 处（开凿后堆岛）`);
  }

  /* ---- 西洋楼锚点 ----
   * 官方导览图上「西洋楼遗址」位于三园东北部（长春园一带），
   * 大水法在中轴核心。锚点取大水法。                              */
  const westAnchor = {
    x: toX(116.30627),
    z: toZ(40.01281),
    scale: 1,
    note: '圆明园管理处官方导览图配准',
  };
  const westBuildings = WEST_BUILDINGS.map((b) => ({
    ...b,
    x: toX(b.lon),
    z: toZ(b.lat),
  }));
  console.log(
    `  ✓ 西洋楼锚点 大水法 → 局部 (${westAnchor.x.toFixed(0)}, ${westAnchor.z.toFixed(0)})，` +
      `景区 ${westBuildings.length} 处`
  );

  /* ---- 写出 ---- */
  const scene = {
    meta: {
      generated: new Date().toISOString(),
      origin: { lon: LON0, lat: LAT0 },
      bbox: BBOX,
      note: '建筑数量为规则化初版基线，非逐一考证结果',
    },
    terrain: { cols: COLS, rows: ROWS, minX, minZ, sizeX, sizeZ, heights: Array.from(heights) },
    water: waterKeep.map((w) => ({
      ring: w.ring,
      level: w.level,
      cx: w.cx,
      cz: w.cz,
    })),
    park: parkRing,
    garden,
    buildings: buildings.map((b) => ({
      ring: b.ring,
      cx: b.cx,
      cz: b.cz,
      area: b.area,
      tags: b.tags,
    })),
    // 路网已在构建期裁剪（三园内、不跨水），这里直接用裁剪后的段
    paths: pathSegs.map((p) => ({ kind: p.kind, line: p.line })),
    corridors,
    scenes: sceneOut,
    westAnchor,
    westBuildings,
    rockery,
    trees,
  };

  await writeFile(resolve(OUT, 'scene.json'), JSON.stringify(scene));
  const size = (await readFile(resolve(OUT, 'scene.json'))).length;
  console.log(`\n✓ scene.json → public/scene/scene.json (${(size / 1e6).toFixed(1)} MB)`);
}

main().catch((e) => {
  console.error('失败:', e);
  process.exit(1);
});
