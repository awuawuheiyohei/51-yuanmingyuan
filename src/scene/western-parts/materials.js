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
  stoneMaterial,
  roofMaterial,
  caihuaMaterial,
  woodMaterial,
  dougongMaterial,
} from '../buildings/materials.js';
import { brickWall } from '../buildings/textures.js';
import { TILE_COLORS } from '../scenes-program.js';

/**
 * UV 约定：1 UV 单位 = 3 m。
 * 石材贴图 repeat=4 ⇒ 一张贴图铺 0.75 m（与建筑系统现有的须弥座/柱础一致），
 * 远看是细腻的白 marble 肌理，近看有石纹——**浮雕靠几何，不靠贴图**。
 * 屋面几何自带 UV（瓦垄/瓦当的贴图对位），**不能**再缩放，所以屋面走原 UV。
 */
export const UVK = 1 / 3;

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
      if (matrix) geo.applyMatrix4(matrix);
      if (!buckets.has(bucket)) buckets.set(bucket, []);
      buckets.get(bucket).push(geo);
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
    if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
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
  if (!g.index) {
    const n = g.attributes.position.count;
    const arr = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
    for (let i = 0; i < n; i++) arr[i] = i;
    g.setIndex(new THREE.BufferAttribute(arr, 1));
  }
  return g;
}

/** 合并一组几何（失败时退回第一件，保证不丢东西） */
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
  console.warn('西洋楼：几何合并失败，退回单件');
  return valid[0];
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
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = (x / S) * Math.PI * 2;
      const v = (y / S) * Math.PI * 2;
      // 两组交叉的波 + 一点细碎扰动
      const h =
        Math.sin(u * 2 + Math.cos(v) * 1.3) * 0.5 +
        Math.sin(v * 3 - u) * 0.3 +
        Math.sin(u * 7 + v * 5) * 0.12;
      const dx = Math.cos(u * 2 + Math.cos(v) * 1.3) * 0.5 + Math.cos(u * 7 + v * 5) * 0.12;
      const dy = Math.cos(v * 3 - u) * 0.3 + Math.cos(u * 7 + v * 5) * 0.12;
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
  tex.repeat.set(1 / 3.5, 1 / 3.5);
  return tex;
}

/* ------------------------------------------------------------------ 材质 */

export function makeWesternMaterials() {
  // 汉白玉 / 大理石：复用建筑系统的石材材质（带 AI 生成的番花浮雕贴图）。
  // 但要**放大贴图密度**：默认一张贴图铺 8m，番花浮雕每块约 2m——
  // 铺在广场大面上就密排成一张"地毯"。这里改成一张铺 32m，浮雕每块约 8m。
  const stone = stoneMaterial();
  if (stone.map) {
    stone.map = stone.map.clone();
    stone.map.needsUpdate = true;
    stone.map.wrapS = stone.map.wrapT = THREE.RepeatWrapping;
    stone.map.repeat.set(1, 1);
  }

  // 太湖石：粗糙灰石（平面着色，靠形体出细节）
  const rockTex = brickWall().clone();
  rockTex.needsUpdate = true;
  rockTex.repeat.set(2, 2);
  const rock = new THREE.MeshStandardMaterial({
    map: rockTex,
    color: 0xc4c7bb,
    roughness: 1,
    flatShading: true,
  });

  // 粉红灰墙身（砖砌抹粉红灰）
  const plasterTex = brickWall().clone();
  plasterTex.needsUpdate = true;
  plasterTex.repeat.set(1, 1);
  const plaster = new THREE.MeshStandardMaterial({
    map: plasterTex,
    color: 0xf6ded2,
    roughness: 0.95,
  });

  // 彩画（额枋）：复用建筑系统的和玺彩画贴图
  const paint = caihuaMaterial('hexi');

  // 斗栱：彩画木件
  const dougong = dougongMaterial();

  // 木作（隔扇/窗框/栏杆）
  const wood = woodMaterial();

  // 法式铜窗玻璃 / 大玻璃镜
  const glass = new THREE.MeshStandardMaterial({
    color: 0x27323f,
    roughness: 0.16,
    metalness: 0.55,
    envMapIntensity: 1.5,
  });

  // 植被（线法松、矮松树篱）
  const green = new THREE.MeshStandardMaterial({
    color: 0x4f7a3c,
    roughness: 0.92,
    flatShading: true,
  });

  // 铜活（铜狮/铜鹿/铜犬/铜鹤/铜蒺藜/黄铜门）
  const metal = new THREE.MeshStandardMaterial({
    color: 0xa8935a,
    roughness: 0.34,
    metalness: 0.78,
    envMapIntensity: 1.5,
  });

  // 池水：带波纹法线 + 清漆层，反射天空（不是一块平涂色板）
  const water = new THREE.MeshPhysicalMaterial({
    color: 0x123f49,
    roughness: 0.24,
    metalness: 0.0,
    transparent: true,
    opacity: 0.97,
    normalMap: rippleNormalTexture(),
    normalScale: new THREE.Vector2(0.4, 0.4),
    side: THREE.DoubleSide,
    envMapIntensity: 0.6,
    clearcoat: 0.4,
    clearcoatRoughness: 0.08,
  });

  const mats = { stone, rock, plaster, paint, dougong, wood, glass, metal, green, water };

  // 琉璃瓦：直接用 TILE_COLORS 的色，材质实例按色缓存
  for (const [key, spec] of Object.entries(TILE_COLORS)) {
    mats[`tile-${key}`] = roofMaterial(spec.glazed, spec.color);
  }
  return mats;
}
