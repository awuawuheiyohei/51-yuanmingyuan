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
    // 大殿：九间五间、重檐庑殿（大式，有斗栱）
    grand: { mian: 9, jin: 5, roof: 'xieshan', caihua: 'hexi', wallType: 'red', platform: 'xumizuo', columnColor: '#8f2820' },
    // 正殿：七间、歇山（大式）
    hall: { mian: 7, jin: 5, roof: 'xieshan', caihua: 'xuanzi', wallType: 'red', platform: 'xumizuo', columnColor: '#8f2820' },
    // 配殿：五间、悬山（大式，一斗三升）
    side: { mian: 5, jin: 3, roof: 'yingshan', caihua: 'xuanzi', wallType: 'brick', platform: 'simple', columnColor: '#8f2820' },
    // 馆：五间、卷棚 —— **小式**（无斗栱，故不用歇山）
    house: { mian: 5, jin: 3, roof: 'juanpeng', caihua: 'su', wallType: 'brick', platform: 'simple', columnColor: '#8f2820' },
    // 轩：三间、悬山 —— **小式**
    //
    // ⚠ 原来这里给的是「歇山」。歇山是**大式**做法：有山花、有斗栱、有垂脊走兽。
    //   小式建筑（无斗栱）不该用歇山；而屋面生成器在歇山分支里要同时处理
    //   山花竖面与翼角起翘，体量一小，两套几何互相打架 ——
    //   远看就是屋角翘出一片"破翅膀"。
    //   小式轩用**悬山**（正脊通长、山面垂直封闭），与制度相符，也不打架。
    xuan: { mian: 3, jin: 3, roof: 'yingshan', caihua: 'su', wallType: 'brick', platform: 'simple', columnColor: '#8f2820' },
    // 亭：攒尖（小式）
    pavilion: { mian: 1, jin: 1, roof: 'zanjiandian', caihua: 'su', wallType: 'brick', platform: 'simple', columnColor: '#2f7a4a' },
    // 楼：两层（大式）
    tower: { mian: 5, jin: 3, roof: 'xieshan', caihua: 'xuanzi', wallType: 'brick', platform: 'xumizuo', columnColor: '#8f2820' },
    // 门（大式，歇山门楼）
    gate: { mian: 3, jin: 2, roof: 'xieshan', caihua: 'xuanzi', wallType: 'red', platform: 'xumizuo', columnColor: '#8f2820' },
    // 游廊
    corridor: { mian: 1, jin: 1, roof: 'yingshan', caihua: 'su', wallType: 'brick', platform: 'none', columnColor: '#8f2820' },
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
  //
  // ⚠ 斗栱的模数是**斗口**（= 柱径 ÷ 6），不是柱径本身。
  //   dgScale = 实际斗口 ÷ 0.1m 基准（dougong.js 以 1 斗口 = 0.1m 建模）。
  const bayW = form.width / (form.mian || 1);
  const colDia = form.colDia ?? Math.max(0.28, Math.min(0.62, bayW / 10));
  const doukou = form.doukou ?? colDia / 6;
  const dgScale = form.dougongScale ?? doukou / 0.1;
  const overhang = form.overhang ?? dougongProjection(dgScale) + 0.35;
  const rise = form.rise ?? Math.max(1.8, form.width * 0.26);

  // 重檐：下檐（腰檐）在外，上檐抬高；柱网上达上檐，下檐处再挑一层斗栱
  const lowerRise = form.doubleEave ? Math.max(0.9, rise * 0.3) : 0;

  // 先建屋顶、后建结构：
  // 屋架（骨架）必须贴着**真实屋面**走，而屋面高度场由 buildRoof 提供。
  // 顺序反了的话屋架只能自己猜高度公式，歇山这种两段式屋面就会被穿模。
  const roof = buildRoof({
    width: form.width,
    depth: form.depth,
    eaveY: form.eaveY,
    rise,
    type: form.roof,
    overhang,
    overhangX: form.overhangX ?? overhang * 0.8,
    hipRunX: form.hipRunX ?? Math.max(2.2, form.depth * 0.24),
    upturn: form.upturn ?? 0.8,
    bulge: form.bulge ?? 0.45,
    circular: form.roof === 'zanjiandian' && form.circular === true,
    segments: form.segments ?? 30,
    doubleEave: !!form.doubleEave,
    lowerRise,
  });

  const structure = buildStructure({
    ...form,
    eaveY: form.eaveY + lowerRise,
    lowerEaveY: form.doubleEave ? form.eaveY : null,
    dougongScale: dgScale,
    couplet: form.couplet || null,
    // 屋面高度场：屋架据此定位檩条
    roofSurfAt: roof.surfAt,
    roofSurfAtXY: roof.surfAtXY,
    roofRidgeHalfWidth: roof.ridgeHalfWidth,
  });

  // 合并前统一几何格式：ExtrudeGeometry 是非索引的、有些构件没有 uv，
  // 直接混合会让 mergeGeometries 静默返回 null（那一整个材质桶就没了）。
  //
  // ⚠⚠ **属性集必须完全一致**，不只是"有 position/normal/uv"就够。
  //   `mergeGeometries` 逐个比对属性名与数量，
  //   少一个就整桶失败（只打一行 error、返回 null）。
  //
  //   实测：`structure.js → applyTint` 给部分墙构件写了 **color** 顶点色
  //   （大尺度调制、打散砖贴图周期），其余墙件没有 ⇒
  //   「wall 几何合并失败（N 件），退回单件」——
  //   每座建筑退化成 N 个单独 mesh ⇒ draw call 线性膨胀，
  //   且桶内其他构件（墙裙/砖缝线脚）全部丢失。
  //
  //   ⇒ 统一成 **position / normal / uv / color** 四个属性：
  //   缺 color 的补一份全 1（= 不调制），多余的（uv1/tangent…）删掉。
  const normalizeGeo = (g) => {
    if (!g || !g.attributes) return null;
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) {
      const n = g.attributes.position.count;
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    }
    if (!g.attributes.color) {
      const n = g.attributes.position.count;
      const arr = new Float32Array(n * 3).fill(1);
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
    // 只留这四个，多余属性（uv1/uv2/tangent/…）会让整桶合并失败
    for (const key of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv', 'color'].includes(key)) g.deleteAttribute(key);
    }
    if (!g.index) {
      const n = g.attributes.position.count;
      const arr = n > 65535 ? new Uint32Array(n) : new Uint16Array(n);
      for (let i = 0; i < n; i++) arr[i] = i;
      g.setIndex(new THREE.BufferAttribute(arr, 1));
    }
    return g;
  };

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
    const valid = list.filter((g) => g && g.attributes && g.attributes.position);
    if (!valid.length) continue;
    for (const g of valid) normalizeGeo(g);
    let geo = null;
    try {
      geo = valid.length === 1 ? valid[0] : mergeGeometries(valid, false);
    } catch {
      geo = list[0];
    }
    if (!geo) {
      console.warn(`建筑 ${form.rank}: ${key} 几何合并失败（${valid.length} 件），退回单件`);
      geo = valid[0];
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
    for (const g of valid) if (g !== geo) g.dispose();
  }

  if (form.rotation) group.rotation.y = form.rotation;
  if (form.position) group.position.set(form.position[0], form.position[1], form.position[2]);
  if (form.scale) group.scale.setScalar(form.scale);
  group.userData.spec = form;
  group.userData.meta = { ...structure.meta, ...roof.meta };
  // 标记：这是一座**建筑**。
  // 主程序用它做**机位避障**（相机不许落在建筑里）——
  // 靠名字匹配材质桶键不可靠，树/假山/游廊也在场景里。
  group.userData.isBuilding = true;
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
