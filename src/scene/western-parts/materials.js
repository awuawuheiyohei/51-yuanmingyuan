/**
 * 西洋楼材质表 + 几何收集器
 *
 * 为什么单独一张材质表：
 *   整组西洋楼最后要按材质合并成极少数几个 Mesh（见 `mergeGroupByMaterial`），
 *   所以"几何归到哪个桶"必须在一开始就定死，不能中途换材质。
 *
 * 瓦色一律取 `scenes-program.js` 的 `TILE_COLORS`（西洋楼的瓦色是逐条考据的，
 * 不能按清式等级顺推）：
 *   谐奇趣 红圆光琉璃 + 屋脊蓝琉璃番草
 *   方外观 蓝琉璃（重檐四坡）
 *   海晏堂 孔雀绿琉璃庑殿顶
 *   远瀛观 宝顶五色琉璃 / 第二层鱼鳞金瓦 / 屋脊五色琉璃番草
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  plainStoneMaterial,
  caihuaMaterial,
  woodMaterial,
  dougongMaterial,
  boardMaterial,
} from '../buildings/materials.js';
import { roofTilesNormal, rusticatedStone } from '../buildings/textures.js';
import { TILE_COLORS } from '../scenes-program.js';

/**
 * UV 约定：1 UV 单位 = 3 m。
 * 石材贴图 repeat=4 ⇒ 一张贴图铺 0.75 m（与建筑系统现有的须弥座/柱础一致），
 * 远看是细腻的白 marble 肌理，近看有石纹——**浮雕靠几何，不靠贴图**。
 * 屋面几何自带 UV（瓦垄/瓦当的贴图对位），**不能**再缩放，所以屋面走原 UV。
 */
export const UVK = 1 / 3;

/**
 * 材质桶归并表：把"外观接近"的桶合并，压 draw call。
 *
 * 整组西洋楼最后按材质合并成极少数几个 Mesh（见 `mergeGroupByMaterial`），
 * 桶越少 draw call 越少。西洋楼基线要求 ≤10 个 draw call，
 * 所以：花浮雕（ornate）并进素石（stone）——番花本来就是几何浮雕，
 * 贴图只是底纹；琉璃瓦按**顶点色**并成一个 tile 桶（见 `add`）。
 */
export const BUCKET_ALIAS = {
  ornate: 'stone',
};

/** 给几何刷上顶点色（linear 空间，与 material.color 相乘） */
export function tint(geo, hex) {
  const col = new THREE.Color(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = col.r;
    arr[i * 3 + 1] = col.g;
    arr[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** 收集器：按材质桶攒几何，最后一块 Mesh 一桶 */
export function createCollector(materials) {
  const buckets = new Map();
  let matrix = null;
  const api = {
    materials,
    /** 设定后续 add 施加的变换（null 表示不平移） */
    setMatrix(mat) {
      matrix = mat;
    },
    /** 设定局部坐标系的原点与朝向（正面朝 +Z） */
    setTransform(x, y, z, rotY = 0) {
      matrix = new THREE.Matrix4().makeRotationY(rotY).setPosition(x, y, z);
    },
    clearTransform() {
      matrix = null;
    },
    /** @param {string} bucket @param {THREE.BufferGeometry} geo */
    add(bucket, geo) {
      if (!geo || !geo.attributes?.position) return;
      let b = bucket;
      if (b.startsWith('tile-')) {
        // 琉璃瓦：瓦色按考据逐条定死，但**不需要一个色一个桶**——
        // 刷成顶点色后所有瓦色共用一个材质桶，draw call 从 7 降到 1。
        const spec = TILE_COLORS[b.slice(5)];
        if (spec) {
          tint(geo, spec.color);
          b = 'tile';
        }
      } else if (BUCKET_ALIAS[b]) {
        b = BUCKET_ALIAS[b];
      } else if (b === 'water' && geo.userData?.isJet) {
        // **水柱与池面分桶**。
        //
        // ⚠ 原来两者共用一个材质：水柱是**近乎不透明的纯白**（opacity 0.93），
        //   近看就是一根根白色塑料管 —— 而真实喷泉水柱是通透的水。
        //   但池面必须基本不透明（否则会看穿池底、露出草地）。
        //
        //   判定用**几何上的显式标记**（`userData.isJet`），不用包围盒长宽比：
        //   斜向水柱旋转后包围盒三个轴差不多长，按比例判会漏掉一大半。
        b = 'waterJet';
      }
      if (matrix) geo.applyMatrix4(matrix);
      if (!buckets.has(b)) buckets.set(b, []);
      buckets.get(b).push(geo);
    },
    addAll(bucket, list) {
      for (const g of list || []) api.add(bucket, g);
    },
    /** 生成 Mesh（每桶一个），返回 Group */
    build() {
      const group = new THREE.Group();
      for (const [name, geos] of buckets) {
        const mat = materials[name];
        if (!mat) {
          console.warn(`西洋楼：未知材质桶 ${name}`);
          continue;
        }
        const geo = mergeAll(geos);
        if (!geo) continue;
        const mesh = new THREE.Mesh(geo, mat);
        mesh.name = name;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      }
      return group;
    },
  };
  return api;
}

/** 合并前统一几何格式：属性集、索引、UV 必须一致，否则 mergeGeometries 静默失败 */
export function normalizeGeo(g) {
  for (const k of Object.keys(g.attributes)) {
    // color 要留着：琉璃瓦与池水靠顶点色区分，同桶内必须一致
    if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color') {
      g.deleteAttribute(k);
    }
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) {
    const n = g.attributes.position.count;
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  } else if (g.attributes.uv.itemSize !== 2) {
    g.deleteAttribute('uv');
    const n = g.attributes.position.count;
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  }
  // 顶点色：缺省补白，保证同桶内属性集完全一致（否则合并会静默失败）
  if (!g.attributes.color) {
    const n = g.attributes.position.count;
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  } else if (g.attributes.color.itemSize !== 3) {
    g.deleteAttribute('color');
    const n = g.attributes.position.count;
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  }
  if (!g.index) {
    const n = g.attributes.position.count;
    const arr = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
    for (let i = 0; i < n; i++) arr[i] = i;
    g.setIndex(new THREE.BufferAttribute(arr, 1));
  }
  return g;
}

/**
 * 手动拼接几何（`mergeGeometries` 失败时的兜底）。
 *
 * 为什么要有它：原实现失败时 `return valid[0]` —— **只留下第一件，其余全丢**。
 * 一旦某个桶里混进属性集不一致的几何（例如带 uv2 的 BoxGeometry），
 * 整桶建筑就会凭空消失，而且只在控制台留一句 warn。
 * 这里改成自己拼：宁可慢一点也不丢东西。
 */
function concatGeos(geos) {
  const ATTRS = [
    ['position', 3],
    ['normal', 3],
    ['uv', 2],
    ['color', 3],
  ];
  let total = 0;
  let idxTotal = 0;
  for (const g of geos) {
    total += g.attributes.position.count;
    idxTotal += g.index ? g.index.count : g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  for (const [name, itemSize] of ATTRS) {
    const arr = new Float32Array(total * itemSize);
    let off = 0;
    for (const g of geos) {
      const n = g.attributes.position.count;
      const src = g.attributes[name];
      if (src) arr.set(src.array.subarray(0, n * itemSize), off);
      else arr.fill(name === 'color' ? 1 : 0, off, off + n * itemSize);
      off += n * itemSize;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, itemSize));
  }
  const idx = total > 65535 ? new Uint32Array(idxTotal) : new Uint16Array(idxTotal);
  let io = 0;
  let vo = 0;
  for (const g of geos) {
    const n = g.attributes.position.count;
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.getX(i) + vo;
    } else {
      for (let i = 0; i < n; i++) idx[io++] = vo + i;
    }
    vo += n;
  }
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

/** 合并一组几何（失败时手动拼接，**保证不丢几何**） */
export function mergeAll(geos) {
  const valid = (geos || []).filter((g) => g && g.attributes && g.attributes.position);
  if (!valid.length) return null;
  for (const g of valid) normalizeGeo(g);
  if (valid.length === 1) return valid[0];
  try {
    const merged = mergeGeometries(valid, false);
    if (merged) return merged;
  } catch {
    /* 落到下面的兜底 */
  }
  console.warn('西洋楼：mergeGeometries 失败，改用手动拼接（不丢几何）');
  return concatGeos(valid);
}

/* ------------------------------------------------------------------ 水波纹 */

/**
 * 程序化波纹法线贴图（水面 UV 用米制坐标，repeat 1/3.5 ⇒ 一张贴图 3.5 m）。
 * 与 `scene/water.js` 的湖面同一套做法，只是这里自己生成一份，避免跨模块耦合。
 */
function rippleNormalTexture() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);

  /**
   * **可平铺的值噪声**（周期 = S）。
   *
   * ⚠ 原来用的是几组正弦叠加（sin(u*2)+sin(v*3)+sin(u*7+v*5)）。
   *   正弦的主频是**整数**，图案必然有强烈的格状周期 ——
   *   池面 UV 是米、法线又在天地色之间翻转反射，
   *   远看就是一个**蓝绿相间的棋盘格**（一格 1.2m）。
   *   换成**多倍频值噪声**：没有单一主频 ⇒ 没有格纹。
   */
  const hash = (x, y) => {
    // 周期取模 ⇒ 左右/上下无缝
    const xi = ((x % S) + S) % S;
    const yi = ((y % S) + S) % S;
    let h = Math.imul(xi, 374761393) + Math.imul(yi, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const smooth = (t) => t * t * (3 - 2 * t);
  const valueNoise = (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smooth(x - x0);
    const fy = smooth(y - y0);
    const a = hash(x0, y0);
    const b = hash(x0 + 1, y0);
    const cc = hash(x0, y0 + 1);
    const d = hash(x0 + 1, y0 + 1);
    return (a * (1 - fx) + b * fx) * (1 - fy) + (cc * (1 - fx) + d * fx) * fy;
  };
  /** 多倍频 fbm，周期仍是 S ⇒ 无缝 */
  const fbm = (x, y) => {
    let v = 0;
    let amp = 0.55;
    let freq = 1 / S;
    for (let o = 0; o < 3; o++) {
      v += amp * valueNoise(x * freq, y * freq);
      amp *= 0.5;
      freq *= 2;
    }
    return v;
  };

  const H = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) H[y * S + x] = fbm(x, y);
  }
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const xm = (x - 1 + S) % S;
      const xp = (x + 1) % S;
      const ym = (y - 1 + S) % S;
      const yp = (y + 1) % S;
      const dx = (H[y * S + xp] - H[y * S + xm]) * 2.4;
      const dy = (H[yp * S + x] - H[ym * S + x]) * 2.4;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * S + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  // 池面 UV 是**米** ⇒ repeat 决定贴图覆盖多少米。
  // 1.6m 一张 ⇒ 波纹细节 0.2~0.5m，是水波而不是格子。
  tex.repeat.set(1 / 1.6, 1 / 1.6);
  return tex;
}

/* ------------------------------------------------------------------ 程序化贴图 */

/** 无缝落笔：把坐标折回画布内再画，贴图才能平铺不出现接缝 */
function wrapDraw(g, W, H, fn) {
  for (const dx of [-W, 0, W]) {
    for (const dy of [-H, 0, H]) {
      g.save();
      g.translate(dx, dy);
      fn(g);
      g.restore();
    }
  }
}

/** 确定性随机（同一张贴图每次生成一致） */
function rnd(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * **粉红灰**墙面（西洋楼楼身抹灰）。
 *
 * 考据：谐奇趣「墙身抹粉红灰」；海晏堂「楼身抹粉红色灰」。
 *
 * 之前这一段直接用砖纹贴图 × 淡粉色，结果渲染出来是**深褐色砖墙**——
 * 砖纹贴图的砖块本身是灰褐色（141,138,132），乘上粉色还是暗的。
 * 抹灰是**连续的浅色面**，只有极淡的批灰痕，不该露砖缝。
 */
function plasterTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  const r = rnd(20260930);
  g.fillStyle = '#f2ded3';
  g.fillRect(0, 0, S, S);
  // 批灰的大块深浅（石灰浆不匀）
  //
  // ⚠ 半径不能大：贴图被平铺到整面墙上，一个 46px 的斑放大后
  // 就是半米宽的"霉斑"，近看满墙都是蘑菇圈。
  // 压到 6~20px，并降低不透明度 → 变成细腻的批灰质感。
  for (let i = 0; i < 150; i++) {
    const x = r() * S;
    const y = r() * S;
    const rad = 6 + r() * 14;
    const light = r() > 0.45;
    wrapDraw(g, S, S, (gg) => {
      const grd = gg.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, light ? 'rgba(255,244,236,0.20)' : 'rgba(198,158,142,0.16)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      gg.fillStyle = grd;
      gg.beginPath();
      gg.arc(x, y, rad, 0, Math.PI * 2);
      gg.fill();
    });
  }
  // 批刀横痕
  g.globalAlpha = 0.16;
  for (let i = 0; i < 26; i++) {
    const y = r() * S;
    const h = 1 + r() * 2.2;
    g.fillStyle = r() > 0.5 ? '#fff3ea' : '#d8bcac';
    g.fillRect(0, y, S, h);
  }
  g.globalAlpha = 1;
  // 细颗粒
  for (let i = 0; i < 2600; i++) {
    const x = r() * S;
    const y = r() * S;
    g.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(160,120,105,0.28)';
    g.fillRect(x, y, 1, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * **太湖石**贴图：灰绿斑驳的石头面（不是砖）。
 *
 * 之前岩石材质直接用 `brickWall()`，结果假山是一层层"砖纹"——
 * 石头没有砖缝。现在改成无规则的斑驳 + 苔痕点。
 */
function rockTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  const r = rnd(777211);
  g.fillStyle = '#9aa095';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 160; i++) {
    const x = r() * S;
    const y = r() * S;
    const rad = 6 + r() * 34;
    const dark = r() > 0.5;
    wrapDraw(g, S, S, (gg) => {
      const grd = gg.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, dark ? 'rgba(96,102,94,0.42)' : 'rgba(206,210,198,0.38)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      gg.fillStyle = grd;
      gg.beginPath();
      gg.arc(x, y, rad, 0, Math.PI * 2);
      gg.fill();
    });
  }
  // 苔痕（偏黄绿的小斑点）
  for (let i = 0; i < 220; i++) {
    const x = r() * S;
    const y = r() * S;
    g.fillStyle = `rgba(${110 + ((r() * 40) | 0)},${120 + ((r() * 40) | 0)},${70 + ((r() * 30) | 0)},${
      0.1 + r() * 0.2
    })`;
    g.beginPath();
    g.ellipse(x, y, 1.5 + r() * 4, 1 + r() * 3, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ------------------------------------------------------------------ 材质 */

export function makeWesternMaterials() {
  // 汉白玉 / 大理石：**素面**石（条石砌筑）。
  //
  // 番花浮雕那张贴图（baroque）不能拿来铺大面——它是"一块雕花板"，
  // 铺在广场地面��会变成一张巨大的花地毯。番花只用在柱身与栏板
  // 这些**小面积**构件上（见 mats.ornate）。
  //
  // ⚠ **必须 clone 材质**：`plainStoneMaterial()` 返回的是**缓存单例**，
  //   直接改它的 map 会连中式建筑的须弥座/柱础一起换掉。
  //
  // ⚠ 西洋楼用**程序化的欧式粗琢石**，不用 AI 那张 `stone.png` ——
  //   那张是"切割石板"（规则方格 + 十字拼缝），铺大墙面就是一张格子布。
  const stone = plainStoneMaterial().clone();
  stone.map = rusticatedStone().clone();
  stone.map.needsUpdate = true;
  stone.map.wrapS = stone.map.wrapT = THREE.RepeatWrapping;
  stone.map.repeat.set(1, 1);
  stone.color.set(0xdad5c8);

  // 太湖石 / 假山：灰绿斑驳的石头面（**不能**用砖纹——石头没有砖缝）
  const rockTex = rockTexture();
  rockTex.repeat.set(2, 2);
  const rock = new THREE.MeshStandardMaterial({
    map: rockTex,
    color: 0xc4c7bb,
    roughness: 1,
    flatShading: true,
  });

  // 粉红灰墙身（砖砌抹粉红灰）
  const plasterTex = plasterTexture();
  plasterTex.repeat.set(1, 1);
  const plaster = new THREE.MeshStandardMaterial({
    map: plasterTex,
    // ⚠ 不能给纯白（0xffffff）：贴图底色本身就是浅粉白 #f2ded3，
    // 再乘白 + 太阳直射 → 整面墙过曝成**死白**，看不出是墙还是空。
    // 西洋楼的主立面是大面积墙，这个固有色必须压暗。
    color: 0xa39a94,
    roughness: 0.95,
  });

  // 彩画（额枋）：复用建筑系统的和玺彩画贴图
  const paint = caihuaMaterial('hexi');

  // 斗栱：彩画木件
  const dougong = dougongMaterial();

  // 望板：屋面之下的铺板。
  //
  // 为什么必须补：西洋楼用的是**清式屋面**（`buildings/parts/roof.js` 的 buildRoof），
  // 屋面本身是单面网格，从檐下往上看会直接看穿到天上；`roof.js` 专门生成了一
  // 层 'board' 桶来补这个底。西洋楼原先没有 'board' 材质桶，控制台一直报
  // 「西洋楼：未知材质桶 board」——**所有西洋楼的屋面底板都被丢掉了**。
  const board = boardMaterial();

  // 木作（隔扇/窗框/栏杆）
  const wood = woodMaterial();

  // 法式铜窗玻璃 / 大玻璃镜
  // 之前太黑（0x27323f），远看每个窗洞都是个黑洞；提亮成带天光的蓝灰，
  // 靠环境反射把"玻璃"读出来。
  const glass = new THREE.MeshStandardMaterial({
    color: 0x9fb6c6,
    roughness: 0.12,
    metalness: 0.28,
    envMapIntensity: 2.4,
  });

  // 植被（线法松、矮松树篱、湘妃竹亭、庭院观赏树）
  //
  // ⚠ **不能开 flatShading**。叶簇是 8×6 段的压扁椭球，
  //   平面着色时每个面都是硬边 ⇒ 一团叶子看着像**叠起来的绿锥子**
  //   （就是"绿球树"那个老问题的根源）。
  //   平滑着色 + 稍多的段数 ⇒ 叶团才像一团 foliage。
  //   颜色也压一点饱和度：0x4f7a3c 太鲜，远看像塑料草。
  // 叶丛：顶点色给**绿度斑驳**（见 kit.js → leafTint）——
  // 光滑球面远看就是"一堆深绿色石头"，加了斑驳才像树。
  const green = new THREE.MeshStandardMaterial({
    color: 0x76975c,
    vertexColors: true,
    roughness: 0.95,
    flatShading: false,
  });

  // **树干**：不能复用 wood（那是中式建筑的红漆柱身，涂在树干上是暗红色，
  // 像一根红蜡烛）。树干是**树皮**：褐色、粗糙。
  const bark = new THREE.MeshStandardMaterial({
    color: 0x6b5a48,
    roughness: 0.96,
    metalness: 0,
  });

  // 铜活（铜狮/铜鹿/铜犬/铜鹤/铜蒺藜/黄铜门）
  const metal = new THREE.MeshStandardMaterial({
    color: 0xa8935a,
    roughness: 0.34,
    metalness: 0.78,
    envMapIntensity: 1.5,
  });

  // 池水：带波纹法线 + 清漆层，反射天空（不是一块平涂色板）
  // 顶点色区分两种水：**池面**刷深青，**水柱/水花**刷白（见 kit.js 的 waterJet）。
  const water = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.24,
    metalness: 0.0,
    transparent: true,
    opacity: 0.93,
    normalMap: rippleNormalTexture(),
    normalScale: new THREE.Vector2(0.22, 0.22),
    side: THREE.DoubleSide,
    envMapIntensity: 0.6,
    clearcoat: 0.4,
    clearcoatRoughness: 0.08,
  });

  // 琉璃瓦：**一个**材质桶，瓦色靠顶点色（红/蓝/孔雀绿/绿/五色/金…）。
  // 之前一色一材质 → 7 个 draw call；现在 1 个。
  const tile = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    normalMap: roofTilesNormal(),
    // 琉璃瓦面是**光滑釉面**，不该有瓦垄的凹凸
    normalScale: new THREE.Vector2(0.1, 0.1),
    roughness: 0.26,
    metalness: 0.06,
    envMapIntensity: 1.2,
  });

  /**
   * **喷泉水柱** —— 与池面分开。
   *
   * ⚠ 水柱要**通透**：真实喷泉是水，看得见背后的东西，
   *   边缘还有一圈亮的高光。做成近乎不透明的纯白 = 塑料管。
   */
  const waterJet = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.1,
    metalness: 0.0,
    transparent: true,
    opacity: 0.42,
    normalMap: rippleNormalTexture(),
    normalScale: new THREE.Vector2(0.35, 0.35),
    side: THREE.DoubleSide,
    envMapIntensity: 1.15,
    clearcoat: 0.6,
    clearcoatRoughness: 0.05,
  });

  const mats = {
    stone, rock, plaster, paint, dougong, wood, board, glass, metal, green, bark, water, waterJet,
    tile,
  };
  return mats;
}
