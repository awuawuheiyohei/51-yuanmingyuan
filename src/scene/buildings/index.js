/**
 * 官式建筑总装：把「台基柱网额枋斗栱墙体」与「屋顶」拼成一座建筑。
 *
 * 同一材质的所有几何会合并成一个 Mesh，整座建筑只产生 6~8 个 draw call，
 * 这样全园几百座建筑也扛得住。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildStructure } from './parts/structure.js';
import { buildRoof } from './parts/roof.js';
import { dougongProjection } from './parts/dougong.js';
import { materialFor } from './materials.js';

/**
 * @typedef {object} BuildingSpec
 * @property {number} width
 * @property {number} depth
 * @property {number} mian        面阔开间数
 * @property {number} jin         进深开间数
 * @property {number} eaveY       檐口高（含台基）
 * @property {number} platformH   台基高
 * @property {string} platform    'xumizuo'|'simple'|'none'
 * @property {string} roof        屋顶类型
 * @property {string} caihua      彩画等级
 * @property {string} wallType    'brick'|'red'
 * @property {string} columnColor 柱色
 * @property {boolean} glazed     是否琉璃瓦
 * @property {number[]} doors     正面开门开间
 * @property {number} rotation    绕 Y 旋转（弧度）
 * @property {number[]} position  [x, y, z]
 * @property {number} scale
 */

/** 依据等级给出默认形制（清式官式建筑等级序列） */
export function defaultForm(rank = 'hall') {
  const table = {
    // 大殿：九间五间、重檐庑殿
    grand: { mian: 9, jin: 5, roof: 'xieshan', caihua: 'hexi', wallType: 'red', platform: 'xumizuo', columnColor: '#a8302a' },
    // 正殿：七间、歇山
    hall: { mian: 7, jin: 5, roof: 'xieshan', caihua: 'xuanzi', wallType: 'red', platform: 'xumizuo', columnColor: '#a8302a' },
    // 配殿：五间、硬山/悬山
    side: { mian: 5, jin: 3, roof: 'yingshan', caihua: 'xuanzi', wallType: 'brick', platform: 'simple', columnColor: '#a8302a' },
    // 馆：五间、卷棚
    house: { mian: 5, jin: 3, roof: 'juanpeng', caihua: 'su', wallType: 'brick', platform: 'simple', columnColor: '#a8302a' },
    // 轩：面阔较小、单檐
    xuan: { mian: 3, jin: 3, roof: 'xieshan', caihua: 'su', wallType: 'brick', platform: 'simple', columnColor: '#a8302a' },
    // 亭：攒尖
    pavilion: { mian: 1, jin: 1, roof: 'zanjiandian', caihua: 'su', wallType: 'brick', platform: 'simple', columnColor: '#2f7a4a' },
    // 楼：两层
    tower: { mian: 5, jin: 3, roof: 'xieshan', caihua: 'xuanzi', wallType: 'brick', platform: 'xumizuo', columnColor: '#a8302a' },
    // 门
    gate: { mian: 3, jin: 2, roof: 'xieshan', caihua: 'xuanzi', wallType: 'red', platform: 'xumizuo', columnColor: '#a8302a' },
    // 游廊
    corridor: { mian: 1, jin: 1, roof: 'yingshan', caihua: 'su', wallType: 'brick', platform: 'none', columnColor: '#a8302a' },
  };
  return table[rank] || table.hall;
}

/**
 * 生成一座建筑
 * @param {BuildingSpec} spec
 * @returns {THREE.Group}
 */
export function buildBuilding(spec) {
  const form = {
    ...defaultForm(spec.rank),
    ...spec,
  };

  const group = new THREE.Group();

  // 斗栱尺度与出檐必须联动：清式是"出檐 = 斗栱出挑 + 飞椽"，
  // 两者脱节会一眼看穿比例不对。
  const bayW = form.width / (form.mian || 1);
  const colDia = Math.max(0.28, Math.min(0.62, bayW / 10));
  const dgScale = form.dougongScale ?? Math.min(1.15, Math.max(0.72, colDia / 0.45));
  const overhang = form.overhang ?? dougongProjection(dgScale) + 0.35;

  const structure = buildStructure({ ...form, dougongScale: dgScale });
  const roof = buildRoof({
    width: form.width,
    depth: form.depth,
    eaveY: form.eaveY,
    rise: form.rise ?? Math.max(1.8, form.width * 0.26),
    type: form.roof,
    overhang,
    overhangX: form.overhangX ?? overhang * 0.8,
    hipRunX: form.hipRunX ?? Math.max(2.2, form.depth * 0.24),
    upturn: form.upturn ?? 0.8,
    bulge: form.bulge ?? 0.45,
    circular: form.roof === 'zanjiandian' && form.circular === true,
    segments: form.segments ?? 30,
  });

  // 合并各材质键的几何
  const merged = new Map();
  const add = (key, geom) => {
    if (!geom) return;
    if (!merged.has(key)) merged.set(key, []);
    merged.get(key).push(geom);
  };
  for (const [key, list] of structure.geoms) for (const g of list) add(key, g);
  for (const [key, list] of roof.geoms) for (const g of list) add(key, g);

  for (const [key, list] of merged) {
    if (!list.length) continue;
    let geo = null;
    try {
      geo = list.length === 1 ? list[0] : mergeGeometries(list, false);
    } catch {
      geo = list[0];
    }
    if (!geo) continue;
    if (!geo.attributes.uv) {
      const count = geo.attributes.position.count;
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
    }
    const mesh = new THREE.Mesh(geo, materialFor(key, form));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = key;
    group.add(mesh);
    if (list.length > 1) for (const g of list) if (g !== geo) g.dispose();
  }

  if (form.rotation) group.rotation.y = form.rotation;
  if (form.position) group.position.set(form.position[0], form.position[1], form.position[2]);
  if (form.scale) group.scale.setScalar(form.scale);
  group.userData.spec = form;
  group.userData.meta = { ...structure.meta, ...roof.meta };
  return group;
}

/**
 * 依据 OSM 轮廓估算一座建筑的体量与等级
 * @param {number[][]} ring  轮廓点（局部米制坐标）
 */
export function specFromFootprint(ring, opts = {}) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of ring) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  const w = maxX - minX;
  const d = maxZ - minZ;
  const area = Math.abs(ringArea(ring));

  let rank = 'house';
  if (area > 900) rank = 'grand';
  else if (area > 380) rank = 'hall';
  else if (area > 150) rank = 'side';
  else if (area > 55) rank = 'xuan';
  else rank = 'pavilion';

  const form = defaultForm(rank);
  const mian = form.mian;
  const bayW = w / mian;
  const jin = Math.max(1, Math.min(form.jin, Math.round(d / bayW)));

  const eaveY = (opts.platformH ?? 1.1) + Math.max(3.0, bayW * 1.15);

  return {
    ...form,
    rank,
    width: w,
    depth: d,
    mian,
    jin,
    bayW,
    eaveY,
    platformH: opts.platformH ?? 1.1,
    doors: centerDoors(mian),
    caojing: rank === 'grand' || rank === 'hall',
    rise: Math.max(1.3, w * 0.15),
  };
}

function centerDoors(mian) {
  if (mian <= 1) return [0];
  if (mian % 2 === 1) {
    const c = (mian - 1) / 2;
    return [c - 1, c, c + 1].filter((i) => i >= 0 && i < mian);
  }
  return [mian / 2 - 1, mian / 2];
}

export function ringArea(ring) {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[(i + 1) % ring.length];
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
}
