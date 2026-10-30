/**
 * 人物与生活痕迹（尺度参照物层）
 *
 * ## 为什么要有这一层
 * 场景里原本只有建筑与树，**没有任何已知尺寸的参照物**：
 * 观众无从判断一座殿宇到底是 8 米高还是 20 米高，"等比例"只是数据层面的说法。
 * 加上人（1.70m）、马（肩高 1.45m）、轿（轿杠 3.0m）之后，
 * 尺度才在画面上成立；同时这些也是皇家园林本该有的生活痕迹。
 *
 * ## 一、实测尺度（本文件唯一不可协商的部分）
 *   成年男子 1.70m      清代成年男子常见身高（常服长袍及地，含履）
 *   宫女     1.58m      清代旗装女子
 *   品官     1.72m      戴翎顶帽（帽缨高另计）
 *   轿夫     1.70m
 *   货郎     1.70m
 *   执事     1.70m
 *   马       肩高 1.45m / 体长 2.10m   中等马体格
 *   轿舆     舆身 1.10(宽) × 1.60(长) × 1.60(高)，轿杠 3.00m，两人抬
 *   板车     车身长 2.60m
 *   小船     长 4.0~6.0m
 *
 * ## 二、形制简化（明说，便于日后考据补正）
 *   - 人物是**低面数剪影式**：八棱台袍身 + 球头 + 方块袖 + 简化手，无贴图。
 *     只有"顶戴红缨 + 翎管 + 顶珠"（品官标志）做了可辨识的细节。
 *   - 宫女"旗头"做成宽扁板 + 两根旗杆 + 绒花，未做繁复的头面堆叠。
 *   - 马的鬃/尾/鞍鞯/镫均为示意块面，未做软甲与镫踏的精细结构。
 *   - 轿舆的"轿厢"为整块体量 + 垂帘，未做棂格窗与雕饰。
 *   - 板车为双轮 + 辐条 + 辕木，未做车轴铁箍与辕饰。
 *   - 船为平底放样船体 + 乌篷 + 摇橹，未做篷骨与船板缝。
 *
 * ## 三、性能
 *   全部几何按材质合并成 **4 个 Mesh**（布/肤/木/金属），顶点色区分个体服色，
 *   draw call 恒为 4；三角面预算 ≤ 60k。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SCENE_PROGRAM } from './scenes-program.js';
import { defaultForm } from './buildings/index.js';

/* ================================================================== *
 * 一、实测尺度常量
 * ================================================================== */

export const DIM = {
  man: 1.70, // 成年男子（清代常服，长袍及地）
  woman: 1.58, // 宫女（旗装）
  official: 1.72, // 戴翎顶帽的品官
  bearer: 1.70, // 轿夫
  porter: 1.70, // 挑担货郎
  guard: 1.70, // 仪仗执事
  horse: {
    shoulder: 1.45, // 肩高（鬐甲）
    bodyLen: 2.10, // 体长（臀至鼻端）
    barrelH: 0.72, // 躯干高
  },
  sedan: {
    w: 1.10, // 舆身宽
    l: 1.60, // 舆身长
    h: 1.60, // 舆身总高（自轿底至宝顶）
    poleLen: 3.00, // 轿杠长
    poleY: 1.42, // 轿杠高（扛在肩上）
    poleX: 0.30, // 两杠间距（半距）
  },
  cart: {
    len: 2.60, // 车身长
    wid: 1.30, // 车身宽
    wheelR: 0.55, // 车轮半径
  },
  boat: {
    lenMin: 4.0,
    lenMax: 6.0,
    wid: 1.40, // 最大船宽
    depth: 0.42, // 舷高
  },
};

/** 清代服色：靛蓝 / 石青 / 褐 / 月白 / 墨 */
const PAL = {
  indigo: 0x2f4a6b,
  stoneBlue: 0x3d6f9e,
  brown: 0x6a5240,
  darkBrown: 0x4d3d2e,
  moonWhite: 0xc9cbc4,
  ink: 0x26282c,
  mandarin: 0x1e3357, // 官服深蓝
  gold: 0xc8a02a,
  brightGold: 0xd9b544,
  vermilion: 0xa83a2e, // 髹朱漆
  redPlume: 0xb3271e, // 顶戴红缨
  wood: 0x7a5c3a,
  darkWood: 0x5a4028,
  bamboo: 0xa8874c,
  canopy: 0x2a2723, // 乌篷
  skin: 0xc99a72,
  skinDark: 0xac7f59,
  sack: 0xa8977a, // 麻袋
};

/** 游人常服可选色（按出现频率给权重） */
const COMMONER_COLORS = [
  PAL.indigo, PAL.indigo, PAL.stoneBlue, PAL.brown, PAL.brown,
  PAL.darkBrown, PAL.moonWhite, PAL.ink, PAL.stoneBlue, PAL.darkBrown,
];

/* ================================================================== *
 * 二、几何工具
 * ================================================================== */

const _col = new THREE.Color();

/** 给几何体刷上顶点色（sRGB 十六进制 → 线性工作空间） */
function tint(geo, hex) {
  _col.set(hex);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = _col.r;
    arr[i * 3 + 1] = _col.g;
    arr[i * 3 + 2] = _col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** 材质桶：所有同类几何最后合并成一个 Mesh */
class Bin {
  constructor() {
    this.map = new Map();
  }
  add(bucket, geo, hex) {
    // 统一成非索引几何，mergeGeometries 才能把带索引/不带索引的混在一起
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    tint(g, hex);
    if (!this.map.has(bucket)) this.map.set(bucket, []);
    this.map.get(bucket).push(g);
  }
  build(mats, group) {
    const stats = [];
    for (const [k, list] of this.map) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) {
        console.warn(`[figures] 合并失败：${k}`);
        continue;
      }
      const mesh = new THREE.Mesh(merged, mats[k]);
      mesh.name = `figures-${k}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      stats.push([k, merged.attributes.position.count / 3]);
    }
    return stats;
  }
}

const MATS = {
  cloth: new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.92, metalness: 0.0,
  }),
  skin: new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.72, metalness: 0.0,
  }),
  wood: new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.88, metalness: 0.0,
  }),
  metal: new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.34, metalness: 0.72,
  }),
};

const V0 = new THREE.Vector3();
const V1 = new THREE.Vector3();
const Q_Y = new THREE.Vector3(0, 1, 0);

function put(bin, bucket, geo, hex, M) {
  if (M) geo.applyMatrix4(M);
  bin.add(bucket, geo, hex);
}

/** 从 a 到 b 的一段方料（手臂/腿/辐条） */
function bar(a, b, w, d) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.BoxGeometry(w, len, d);
  const q = new THREE.Quaternion().setFromUnitVectors(Q_Y, dir.clone().normalize());
  g.applyMatrix4(
    new THREE.Matrix4().compose(
      new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5),
      q,
      new THREE.Vector3(1, 1, 1)
    )
  );
  return g;
}

/** 从 a 到 b 的一段圆料（轿杠/缨管/绳/橹） */
function rod(a, b, r, seg = 6) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = Math.max(1e-4, dir.length());
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  const q = new THREE.Quaternion().setFromUnitVectors(Q_Y, dir.clone().normalize());
  g.applyMatrix4(
    new THREE.Matrix4().compose(
      new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5),
      q,
      new THREE.Vector3(1, 1, 1)
    )
  );
  return g;
}

/** 由若干横截面放样出船体（平底、两端收尖） */
function loftHull(sections) {
  const pos = [];
  const uv = [];
  const idx = [];
  const push = (x, y, z) => {
    pos.push(x, y, z);
    uv.push((x + 1) * 0.5, z * 0.25);
  };
  let prev = null;
  for (const s of sections) {
    const base = pos.length / 3;
    push(-s.hw, 0, s.z);
    push(s.hw, 0, s.z);
    push(s.hw, s.h, s.z);
    push(-s.hw, s.h, s.z);
    if (prev) {
      // 只做底 + 左右舷三面（顶面敞开）
      for (const k of [0, 1, 3]) {
        const k2 = (k + 1) % 4;
        idx.push(prev[k], base + k, prev[k2]);
        idx.push(prev[k2], base + k, base + k2);
      }
    }
    prev = [base, base + 1, base + 2, base + 3];
  }
  // 首尾封板
  const first = 0;
  const last = pos.length / 3 - 4;
  idx.push(first + 0, first + 2, first + 1);
  idx.push(first + 0, first + 3, first + 2);
  idx.push(last + 0, last + 1, last + 2);
  idx.push(last + 0, last + 2, last + 3);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ================================================================== *
 * 三、人物
 * ================================================================== */

/**
 * 一个人（低面数剪影式）。
 * 局部坐标：脚在 y=0，面朝 +Z，身高严格等于 o.height。
 */
function addPerson(bin, M, o) {
  const H = o.height ?? DIM.man;
  const s = H / DIM.man; // 尺度因子（肩宽等按 1.70m 的人设计）
  const robe = o.robe ?? PAL.indigo;
  const skin = o.skin ?? PAL.skin;
  const shoulderY = 0.80 * H;
  const robeTopY = 0.862 * H;
  const headR = 0.065 * H;
  const headCY = H - headR - 0.012;

  // 袍身：上窄下宽的八棱台（长袍及地）
  const robeG = new THREE.CylinderGeometry(0.165 * s, 0.30 * s, robeTopY, 8, 1, false);
  robeG.translate(0, robeTopY / 2, 0);
  put(bin, 'cloth', robeG, robe, M);

  // 头
  const headG = new THREE.SphereGeometry(headR, 5, 3);
  headG.scale(0.92, 1.0, 0.9);
  headG.translate(0, headCY, 0);
  put(bin, 'skin', headG, skin, M);

  // 帽
  addHat(bin, M, o, { H, s, headR, headCY, skin });

  // 臂
  addArms(bin, M, o, { H, s, shoulderY, robe, skin });
  return { H, s, shoulderY, headCY, headR };
}

/** 帽：瓜皮小帽 / 旗头 / 翎顶帽 */
function addHat(bin, M, o, g) {
  const { s, headR, headCY } = g;
  const kind = o.hat ?? 'gua';

  if (kind === 'gua') {
    // 瓜皮小帽：半球，顶在头上
    const hatG = new THREE.SphereGeometry(0.072 * s, 6, 3, 0, Math.PI * 2, 0, Math.PI * 0.5);
    hatG.scale(1, 0.85, 1);
    hatG.translate(0, headCY + headR * 0.25, 0);
    put(bin, 'cloth', hatG, o.hatColor ?? PAL.ink, M);
  } else if (kind === 'qitou') {
    // 旗头（清宫"两把头"）：宽扁板面 + 两根旗杆 + 绒花
    const board = new THREE.CylinderGeometry(0.135 * s, 0.115 * s, 0.075 * s, 6);
    board.translate(0, headCY + headR * 0.68, 0);
    put(bin, 'cloth', board, o.hatColor ?? PAL.ink, M);
    for (const sx of [-1, 1]) {
      const r = new THREE.CylinderGeometry(0.010 * s, 0.010 * s, 0.24 * s, 4, 1, true);
      r.translate(sx * 0.095 * s, headCY + headR * 0.68 + 0.12 * s, 0);
      put(bin, 'wood', r, 0x2b2b30, M);
    }
    const flower = new THREE.SphereGeometry(0.032 * s, 4, 3);
    flower.scale(1, 0.7, 1);
    flower.translate(0.115 * s, headCY + headR * 0.68 + 0.215 * s, 0.02 * s);
    put(bin, 'cloth', flower, PAL.vermilion, M);
  } else if (kind === 'dingdai') {
    // 翎顶帽：清代品官标志 —— 圆顶 + 红缨 + 翎管 + 顶珠
    const crownY = headCY + headR * 0.55;
    const crown = new THREE.CylinderGeometry(0.128 * s, 0.136 * s, 0.105 * s, 10);
    crown.translate(0, crownY, 0);
    put(bin, 'cloth', crown, 0x1c1e22, M);

    // 红缨（帽顶一束红马鬃）
    const plume = new THREE.ConeGeometry(0.034 * s, 0.16 * s, 6);
    plume.translate(0, crownY + 0.105 * s + 0.075 * s, 0);
    put(bin, 'cloth', plume, PAL.redPlume, M);

    // 顶珠（帽正中的金珠）
    const bead = new THREE.SphereGeometry(0.023 * s, 6, 4);
    bead.translate(0, crownY + 0.085 * s, 0.105 * s);
    put(bin, 'metal', bead, PAL.brightGold, M);

    // 翎管 + 翎羽（向后上方斜插）
    const tilt = -0.8;
    const tubeLen = 0.42 * s;
    const dir = new THREE.Vector3(0, Math.cos(tilt), Math.sin(tilt));
    for (const sx of [-1, 1]) {
      const base = new THREE.Vector3(sx * 0.038 * s, crownY + 0.085 * s, -0.05 * s);
      put(
        bin, 'metal',
        rod(base, base.clone().addScaledVector(dir, tubeLen), 0.011 * s, 5),
        PAL.gold, M
      );
      const tip = base.clone().addScaledVector(dir, tubeLen + 0.115 * s);
      const feather = new THREE.BoxGeometry(0.048 * s, 0.22 * s, 0.013 * s);
      const q = new THREE.Quaternion().setFromUnitVectors(Q_Y, dir.clone().normalize());
      feather.applyMatrix4(
        new THREE.Matrix4().compose(tip, q, new THREE.Vector3(1, 1, 1))
      );
      put(bin, 'cloth', feather, sx > 0 ? PAL.stoneBlue : PAL.indigo, M);
    }
  }
}

/**
 * 手臂：down = 自然下垂（一根袖管）；up = 抬手扶杠（分上臂/小臂两段，
 * 肘部要看得出来，才像"抬"而不是"站"）。
 */
function addArms(bin, M, o, g) {
  const { s, shoulderY, robe, skin } = g;
  const shX = 0.185 * s;
  const mode = o.arms ?? 'down';
  for (const sx of [-1, 1]) {
    const shoulder = new THREE.Vector3(sx * shX, shoulderY, 0);
    let elbow;
    let hand;
    if (mode === 'up') {
      const hx = (o.handX ?? 0.30) * s;
      const hy = o.handY ?? 1.42;
      const hz = o.handZ ?? 0;
      elbow = new THREE.Vector3(sx * (shX + 0.085), shoulderY - 0.235, hz * 0.35);
      hand = new THREE.Vector3(sx * hx, hy, hz);
    } else {
      elbow = new THREE.Vector3(sx * (shX + 0.055), shoulderY - 0.26, 0.02);
      hand = new THREE.Vector3(sx * (shX + 0.045), shoulderY - 0.555, 0.05);
    }
    if (mode === 'up') {
      put(bin, 'cloth', bar(shoulder, elbow, 0.115 * s, 0.135 * s), robe, M);
      put(bin, 'cloth', bar(elbow, hand, 0.100 * s, 0.120 * s), robe, M);
    } else {
      // 袖管：一根自肩垂到腕的方料
      put(bin, 'cloth', bar(shoulder, hand, 0.115 * s, 0.135 * s), robe, M);
    }
    const hg = new THREE.BoxGeometry(0.075 * s, 0.09 * s, 0.070 * s);
    hg.translate(hand.x, hand.y, hand.z);
    put(bin, 'skin', hg, skin, M);
  }
}

/* ================================================================== *
 * 四、马
 * ================================================================== */

function addHorse(bin, M) {
  const D = DIM.horse;
  const sh = D.shoulder; // 1.45 肩高
  const hl = D.bodyLen; // 2.10 体长
  const s = sh / DIM.horse.shoulder;

  // 躯干：八棱柱（胸臀略收）
  const barrel = new THREE.CylinderGeometry(0.30, 0.30, hl * 0.62, 8);
  barrel.rotateX(Math.PI / 2);
  barrel.scale(1.0, 1.12, 1.0); // 横向压扁 → 躯干高 > 宽
  barrel.translate(0, sh - D.barrelH / 2 - 0.03, -0.05);
  put(bin, 'cloth', barrel, 0x5c4432, M);

  // 胸
  const chest = new THREE.SphereGeometry(0.30, 6, 3);
  chest.scale(0.86, 1.05, 1.0);
  chest.translate(0, sh - 0.42, hl * 0.30);
  put(bin, 'cloth', chest, 0x5c4432, M);

  // 臀
  const rump = new THREE.SphereGeometry(0.31, 6, 3);
  rump.scale(0.90, 1.02, 1.0);
  rump.translate(0, sh - 0.42, -hl * 0.31);
  put(bin, 'cloth', rump, 0x5c4432, M);

  // 颈（自鬐甲向前下）
  const neckA = new THREE.Vector3(0, sh - 0.08, hl * 0.26);
  const neckB = new THREE.Vector3(0, sh - 0.34, hl * 0.47);
  put(bin, 'cloth', rod(neckA, neckB, 0.145, 6), 0x5c4432, M);

  // 头（自颈端向前下）
  const headA = new THREE.Vector3(0, sh - 0.34, hl * 0.47);
  const headB = new THREE.Vector3(0, sh - 0.52, hl * 0.66);
  const head = new THREE.BoxGeometry(0.21, 0.26, 0.52);
  const q = new THREE.Quaternion().setFromUnitVectors(
    Q_Y, new THREE.Vector3().subVectors(headB, headA).normalize()
  );
  head.applyMatrix4(
    new THREE.Matrix4().compose(
      new THREE.Vector3().addVectors(headA, headB).multiplyScalar(0.5),
      q, new THREE.Vector3(1, 1, 1)
    )
  );
  put(bin, 'cloth', head, 0x5c4432, M);

  // 耳
  for (const sx of [-1, 1]) {
    const ear = new THREE.ConeGeometry(0.038, 0.14, 5);
    ear.rotateX(-0.25);
    ear.translate(sx * 0.075, sh - 0.20, hl * 0.455);
    put(bin, 'cloth', ear, 0x4a3527, M);
  }

  // 鬃（颈脊一道）
  const mane = new THREE.BoxGeometry(0.055, 0.13, 0.50);
  mane.rotateX(0.52);
  mane.translate(0, sh - 0.13, hl * 0.36);
  put(bin, 'cloth', mane, 0x241a13, M);

  // 尾
  const tail = new THREE.CylinderGeometry(0.045, 0.085, 0.72, 5);
  tail.rotateX(0.42);
  tail.translate(0, sh - 0.78, -hl * 0.50);
  put(bin, 'cloth', tail, 0x241a13, M);

  // 四腿：上段 / 下段 / 蹄
  const legTop = sh - D.barrelH + 0.05;
  const legDefs = [
    [0.19, hl * 0.24], [0.19, -hl * 0.26],
    [-0.19, hl * 0.24], [-0.19, -hl * 0.26],
  ];
  for (const [lx, lz] of legDefs) {
    const hip = new THREE.Vector3(lx, legTop, lz);
    const knee = new THREE.Vector3(lx * 1.02, legTop * 0.52, lz + (lz > 0 ? 0.03 : -0.04));
    const fet = new THREE.Vector3(lx * 1.03, 0.14, lz + (lz > 0 ? 0.02 : -0.03));
    put(bin, 'cloth', rod(hip, knee, 0.085, 4), 0x5c4432, M);
    put(bin, 'cloth', rod(knee, fet, 0.048, 4), 0x5c4432, M);
    const hoof = new THREE.BoxGeometry(0.105, 0.13, 0.135);
    hoof.translate(lx * 1.03, 0.065, lz + (lz > 0 ? 0.02 : -0.03));
    put(bin, 'cloth', hoof, 0x2e2620, M);
  }

  // 鞍鞯（明清鞍鞯：坐垫 + 两侧垂片 + 肚带）
  const saddle = new THREE.BoxGeometry(0.42, 0.11, 0.62);
  saddle.translate(0, sh + 0.04, 0.03);
  put(bin, 'cloth', saddle, 0x4a2f22, M);
  for (const sx of [-1, 1]) {
    const blanket = new THREE.BoxGeometry(0.07, 0.42, 0.66);
    blanket.translate(sx * 0.31, sh - 0.20, 0.03);
    put(bin, 'cloth', blanket, PAL.indigo, M);
    // 垂片镶金边
    const trim = new THREE.BoxGeometry(0.02, 0.045, 0.66);
    trim.translate(sx * 0.35, sh - 0.02, 0.03);
    put(bin, 'metal', trim, PAL.gold, M);
    // 镫
    const stirrup = new THREE.BoxGeometry(0.035, 0.16, 0.11);
    stirrup.translate(sx * 0.31, sh - 0.52, 0.12);
    put(bin, 'metal', stirrup, 0xb9a06a, M);
  }
  // 肚带
  const girth = new THREE.BoxGeometry(0.64, 0.06, 0.13);
  girth.translate(0, sh - 0.24, hl * 0.16);
  put(bin, 'cloth', girth, 0x3a2418, M);
  // 衔铁（口衔）
  const bit = new THREE.BoxGeometry(0.22, 0.035, 0.035);
  bit.translate(0, sh - 0.55, hl * 0.66);
  put(bin, 'metal', bit, 0xa8a29a, M);
}

/* ================================================================== *
 * 五、轿舆（两人抬）
 * ================================================================== */

function addSedan(bin, M) {
  const S = DIM.sedan;
  const boxW = S.w; // 1.10
  const boxL = S.l; // 1.60
  const floorY = 0.30; // 轿底离地
  const boxH = 1.04; // 轿厢高
  const boxTop = floorY + boxH; // 1.34
  const roofY = 1.48; // 顶盖底
  const roofH = 0.20;
  const finialY = 1.68; // 宝顶底

  // 轿厢（髹朱漆）
  const box = new THREE.BoxGeometry(boxW, boxH, boxL);
  box.translate(0, floorY + boxH / 2, 0);
  put(bin, 'cloth', box, PAL.vermilion, M);

  // 顶盖四角柱
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const p = new THREE.BoxGeometry(0.075, roofY - boxTop, 0.075);
      p.translate(sx * (boxW / 2 - 0.04), (boxTop + roofY) / 2, sz * (boxL / 2 - 0.04));
      put(bin, 'wood', p, PAL.darkWood, M);
    }
  }

  // 顶盖
  const roof = new THREE.BoxGeometry(boxW + 0.18, roofH, boxL + 0.18);
  roof.translate(0, roofY + roofH / 2, 0);
  put(bin, 'cloth', roof, PAL.vermilion, M);

  // 鎏金宝顶
  const finial = new THREE.ConeGeometry(0.13, 0.22, 8);
  finial.translate(0, finialY + 0.11, 0);
  put(bin, 'metal', finial, PAL.brightGold, M);
  const knob = new THREE.SphereGeometry(0.055, 5, 3);
  knob.translate(0, finialY + 0.24, 0);
  put(bin, 'metal', knob, PAL.gold, M);

  // 前后垂帘（黄罗）
  for (const sz of [-1, 1]) {
    const curtain = new THREE.BoxGeometry(boxW - 0.12, 0.62, 0.05);
    curtain.translate(0, boxTop - 0.36, sz * (boxL / 2 + 0.03));
    put(bin, 'cloth', curtain, PAL.moonWhite, M);
  }
  // 两侧垂帘（蓝）
  for (const sx of [-1, 1]) {
    const curtain = new THREE.BoxGeometry(0.05, 0.55, boxL - 0.22);
    curtain.translate(sx * (boxW / 2 + 0.03), boxTop - 0.36, 0);
    put(bin, 'cloth', curtain, PAL.indigo, M);
  }

  // 轿杠（两根，沿行进方向，各 3.00m）
  for (const sx of [-1, 1]) {
    const x = sx * S.poleX;
    put(
      bin, 'wood',
      rod(
        new THREE.Vector3(x, S.poleY, -S.poleLen / 2),
        new THREE.Vector3(x, S.poleY, S.poleLen / 2),
        0.045, 6
      ),
      PAL.darkWood, M
    );
    // 挂钩（铜）：把轿厢吊在杠上
    for (const sz of [-0.62, 0.62]) {
      put(
        bin, 'metal',
        rod(
          new THREE.Vector3(x, boxTop - 0.02, sz),
          new THREE.Vector3(x, S.poleY, sz),
          0.018, 5
        ),
        0xa8863c, M
      );
    }
  }
}

/* ================================================================== *
 * 六、板车
 * ================================================================== */

function addCart(bin, M) {
  const C = DIM.cart;
  const deckY = 0.62;
  const wheelZ = -C.len * 0.22;

  // 车板
  const deck = new THREE.BoxGeometry(C.wid, 0.10, C.len);
  deck.translate(0, deckY, 0);
  put(bin, 'wood', deck, PAL.wood, M);
  // 侧帮
  for (const sx of [-1, 1]) {
    const side = new THREE.BoxGeometry(0.06, 0.30, C.len);
    side.translate(sx * (C.wid / 2 - 0.03), deckY + 0.20, 0);
    put(bin, 'wood', side, PAL.darkWood, M);
  }
  // 辕木（向前伸出的牵引杆）
  const tongue = new THREE.BoxGeometry(0.12, 0.10, 1.50);
  tongue.translate(0, deckY - 0.06, C.len / 2 + 0.72);
  put(bin, 'wood', tongue, PAL.wood, M);

  // 车轴 + 双轮（辐条看得出来）
  const axle = new THREE.CylinderGeometry(0.045, 0.045, C.wid + 0.16, 6);
  axle.rotateZ(Math.PI / 2);
  axle.translate(0, C.wheelR, wheelZ);
  put(bin, 'wood', axle, PAL.darkWood, M);

  for (const sx of [-1, 1]) {
    const wx = sx * (C.wid / 2 + 0.05);
    const rim = new THREE.CylinderGeometry(C.wheelR, C.wheelR, 0.10, 12, 1, true);
    rim.rotateZ(Math.PI / 2);
    rim.translate(wx, C.wheelR, wheelZ);
    put(bin, 'wood', rim, PAL.darkWood, M);
    const hub = new THREE.CylinderGeometry(0.09, 0.09, 0.16, 6);
    hub.rotateZ(Math.PI / 2);
    hub.translate(wx, C.wheelR, wheelZ);
    put(bin, 'wood', hub, PAL.wood, M);
    // 8 根辐条
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const p = new THREE.Vector3(
        wx,
        C.wheelR + Math.sin(a) * (C.wheelR - 0.05),
        wheelZ + Math.cos(a) * (C.wheelR - 0.05)
      );
      const q = new THREE.Vector3(
        wx,
        C.wheelR + Math.sin(a) * 0.10,
        wheelZ + Math.cos(a) * 0.10
      );
      put(bin, 'wood', bar(p, q, 0.05, 0.05), PAL.wood, M);
    }
  }

  // 前支腿（车停放时撑地）
  const leg = new THREE.BoxGeometry(0.09, deckY, 0.09);
  leg.translate(0, deckY / 2, C.len / 2 - 0.12);
  put(bin, 'wood', leg, PAL.darkWood, M);

  // 载货（麻袋）
  for (const [dx, dz, r] of [[-0.22, -0.45, 0.30], [0.20, -0.30, 0.27], [0.0, 0.35, 0.28]]) {
    const sack = new THREE.SphereGeometry(r, 5, 3);
    sack.scale(1, 0.72, 0.86);
    sack.translate(dx, deckY + 0.05 + r * 0.72, dz);
    put(bin, 'cloth', sack, PAL.sack, M);
  }
}

/* ================================================================== *
 * 七、小船（平底乌篷船）
 * ================================================================== */

function addBoat(bin, M, len) {
  const B = DIM.boat;
  const L = len;
  const W = B.wid;
  const H = B.depth;
  // 横截面：平底，两端收尖
  const sections = [
    { z: -L / 2, hw: 0.05, h: H * 0.55 },
    { z: -L * 0.34, hw: W * 0.34, h: H * 0.90 },
    { z: -L * 0.12, hw: W * 0.48, h: H },
    { z: L * 0.12, hw: W * 0.48, h: H },
    { z: L * 0.34, hw: W * 0.34, h: H * 0.90 },
    { z: L / 2, hw: 0.05, h: H * 0.55 },
  ];
  const hull = loftHull(sections);
  put(bin, 'wood', hull, 0x6b5335, M);

  // 船板（舱底）
  const floor = new THREE.BoxGeometry(W * 0.80, 0.06, L * 0.66);
  floor.translate(0, 0.04, 0);
  put(bin, 'wood', floor, 0x7d6141, M);

  // 舷边（压条）
  for (const sx of [-1, 1]) {
    const rail = new THREE.BoxGeometry(0.06, 0.07, L * 0.70);
    rail.translate(sx * W * 0.47, H - 0.02, 0);
    put(bin, 'wood', rail, PAL.darkWood, M);
  }

  // 乌篷（半圆篷）
  const canopy = new THREE.SphereGeometry(W * 0.46, 8, 4, 0, Math.PI * 2, 0, Math.PI * 0.5);
  canopy.scale(1, 0.78, 1);
  canopy.translate(0, H - 0.03, -L * 0.02);
  put(bin, 'cloth', canopy, PAL.canopy, M);
  // 篷骨
  for (const dz of [-L * 0.10, 0, L * 0.10]) {
    const rib = new THREE.TorusGeometry(W * 0.455, 0.022, 4, 10, Math.PI);
    rib.rotateY(Math.PI / 2);
    rib.translate(0, H - 0.03, dz);
    put(bin, 'wood', rib, 0x3a3229, M);
  }

  // 摇橹（船尾）
  const oarA = new THREE.Vector3(W * 0.30, H - 0.05, -L * 0.30);
  const oarB = new THREE.Vector3(W * 0.42, 0.04, -L * 0.52);
  put(bin, 'wood', rod(oarA, oarB, 0.028, 5), 0x6b5335, M);
  const blade = new THREE.BoxGeometry(0.07, 0.30, 0.16);
  blade.rotateX(0.5);
  blade.translate(oarB.x, oarB.y - 0.12, oarB.z - 0.06);
  put(bin, 'wood', blade, 0x6b5335, M);

  // 船头篙
  put(
    bin, 'wood',
    rod(
      new THREE.Vector3(0, H * 0.5, L * 0.34),
      new THREE.Vector3(0, 0.02, L * 0.52),
      0.022, 5
    ),
    0x6b5335, M
  );
}

/* ================================================================== *
 * 八、道具：扁担货郎 / 仪仗执事
 * ================================================================== */

/** 挑担货郎：扁担 + 两筐 + 筐中货 */
function addPorterKit(bin, M, s) {
  const poleY = 1.42;
  const poleX = 0.12 * s;
  const poleA = new THREE.Vector3(poleX, poleY, -0.95 * s);
  const poleB = new THREE.Vector3(poleX, poleY, 0.95 * s);
  put(bin, 'wood', rod(poleA, poleB, 0.022 * s, 5), PAL.bamboo, M);

  for (const sz of [-1, 1]) {
    const z = sz * 0.80 * s;
    // 吊绳
    put(
      bin, 'cloth',
      rod(
        new THREE.Vector3(poleX, poleY, z),
        new THREE.Vector3(poleX, 1.12 * s, z),
        0.008 * s, 4
      ),
      0x6b5b44, M
    );
    // 筐（编篓）
    const basket = new THREE.CylinderGeometry(0.20 * s, 0.145 * s, 0.28 * s, 6);
    basket.translate(poleX, 0.98 * s, z);
    put(bin, 'cloth', basket, PAL.bamboo, M);
    // 筐里的货
    const goods = new THREE.SphereGeometry(0.16 * s, 5, 3);
    goods.scale(1, 0.55, 1);
    goods.translate(poleX, 1.14 * s, z);
    put(bin, 'cloth', goods, PAL.sack, M);
  }
}

/**
 * 仪仗执事道具。kind:
 *   'parasol' 执事伞（黄罗伞盖）
 *   'banner'  飞黄旗
 *   'fan'     扇
 */
function addRegalia(bin, M, kind, s) {
  const handX = 0.30 * s;
  const handY = kind === 'fan' ? 1.30 : 1.56;
  const handZ = 0.06;
  if (kind === 'parasol') {
    const top = 2.62;
    put(
      bin, 'wood',
      rod(
        new THREE.Vector3(handX, 0.02, handZ),
        new THREE.Vector3(handX, top, handZ),
        0.024 * s, 6
      ),
      PAL.darkWood, M
    );
    const canopy = new THREE.ConeGeometry(0.58, 0.30, 10);
    canopy.translate(handX, top + 0.15, handZ);
    put(bin, 'cloth', canopy, PAL.gold, M);
    const finial = new THREE.SphereGeometry(0.05, 6, 4);
    finial.translate(handX, top + 0.32, handZ);
    put(bin, 'metal', finial, PAL.brightGold, M);
  } else if (kind === 'banner') {
    const top = 2.88;
    put(
      bin, 'wood',
      rod(
        new THREE.Vector3(handX, 0.02, handZ),
        new THREE.Vector3(handX, top, handZ),
        0.024 * s, 6
      ),
      PAL.darkWood, M
    );
    // 黄旗面（自杆顶垂下）
    const flag = new THREE.BoxGeometry(0.030, 0.86, 0.54);
    flag.translate(handX + 0.27, top - 0.46, handZ);
    put(bin, 'cloth', flag, PAL.gold, M);
    // 红缘
    const edge = new THREE.BoxGeometry(0.035, 0.10, 0.56);
    edge.translate(handX + 0.27, top - 0.92, handZ);
    put(bin, 'cloth', edge, PAL.vermilion, M);
    // 旗顶矛头
    const spike = new THREE.ConeGeometry(0.035, 0.22, 5);
    spike.translate(handX, top + 0.11, handZ);
    put(bin, 'metal', spike, PAL.brightGold, M);
  } else {
    // 扇：长柄 + 扇面
    put(
      bin, 'wood',
      rod(
        new THREE.Vector3(handX, handY, handZ),
        new THREE.Vector3(handX, handY + 0.95, handZ),
        0.020 * s, 5
      ),
      PAL.darkWood, M
    );
    const blade = new THREE.ConeGeometry(0.24, 0.34, 8);
    blade.scale(0.28, 1, 1);
    blade.translate(handX, handY + 1.10, handZ);
    put(bin, 'cloth', blade, PAL.moonWhite, M);
    const rim = new THREE.ConeGeometry(0.25, 0.36, 8);
    rim.scale(0.30, 1, 1);
    rim.translate(handX, handY + 1.10, handZ);
    put(bin, 'cloth', rim, PAL.gold, M);
  }
}

/* ================================================================== *
 * 九、空间查询
 * ================================================================== */

function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], zi = ring[i][1];
    const xj = ring[j][0], zj = ring[j][1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function polyArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(a / 2);
}

/** 水面查询：返回该点的水面高程，未在水里则返回 null */
function makeWaterTest(sceneData, heightAt) {
  const polys = [];
  for (const w of sceneData.water || []) {
    if (!w.ring || w.ring.length < 3) continue;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of w.ring) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    polys.push({ ring: w.ring, level: w.level ?? 0, minX, maxX, minZ, maxZ });
  }
  return (x, z) => {
    for (const p of polys) {
      if (x < p.minX || x > p.maxX || z < p.minZ || z > p.maxZ) continue;
      if (!pointInRing(x, z, p.ring)) continue;
      // 环内但地面高于水面 = 洲渚/岸台，不算落水
      const g = heightAt(x, z);
      if (g < p.level - 0.20) return p.level;
    }
    return null;
  };
}

/** 障碍物：OSM 现状建筑 + 四十景主/配建筑 + 西洋楼 + 假山 */
function makeObstacles(sceneData) {
  const boxes = [];
  const circles = [];
  const pushBox = (x, z, hw, hd) => boxes.push({ x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd });

  for (const b of sceneData.buildings || []) {
    if (!b.ring || b.ring.length < 3) continue;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of b.ring) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    pushBox((minX + maxX) / 2, (minZ + maxZ) / 2, (maxX - minX) / 2 + 1.0, (maxZ - minZ) / 2 + 1.0);
  }

  for (const s of sceneData.scenes || []) {
    const p = SCENE_PROGRAM[s.name];
    if (!p) continue;
    // 主建筑（含台基外沿）
    const mw = (p.main.mian * 3.6) / 2 + 3.4;
    const md = (p.main.jin * 3.3) / 2 + 3.4;
    pushBox(s.x, s.z, mw, md);
    // 配建筑
    for (const a of p.aux || []) {
      const af = defaultForm(a.rank);
      const mian = a.mian ?? af.mian;
      const jin = a.jin ?? af.jin;
      const w = (mian * (a.rank === 'pavilion' ? 3.0 : 3.5)) / 2 + 2.2;
      const d = (jin * 3.2) / 2 + 2.2;
      pushBox(s.x + a.x, s.z + a.z, w, d);
    }
  }

  for (const w of sceneData.westBuildings || []) {
    pushBox(w.x, w.z, 13, 13);
  }

  for (const r of sceneData.rockery || []) {
    circles.push({ x: r.x, z: r.z, r: (r.r || 2) + 1.2 });
  }

  return { boxes, circles };
}

function inObstacle(ob, x, z) {
  for (const b of ob.boxes) {
    if (x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1) return true;
  }
  for (const c of ob.circles) {
    const dx = c.x - x, dz = c.z - z;
    if (dx * dx + dz * dz < c.r * c.r) return true;
  }
  return false;
}

/** 游廊柱位（与 corridor.js 同一套重采样，人在廊下时踩在廊地坪上） */
function makeCorridorStations(sceneData, heightAt) {
  const STEP = 1.8;
  const stations = [];
  for (const line of sceneData.corridors || []) {
    if (!line || line.length < 2) continue;
    const pts = [];
    let carry = 0;
    for (let i = 0; i < line.length - 1; i++) {
      const [x1, z1] = line[i];
      const [x2, z2] = line[i + 1];
      const segLen = Math.hypot(x2 - x1, z2 - z1);
      if (segLen < 1e-3) continue;
      let t = carry;
      while (t < segLen) {
        pts.push([x1 + ((x2 - x1) * t) / segLen, z1 + ((z2 - z1) * t) / segLen]);
        t += STEP;
      }
      carry = t - segLen;
    }
    if (pts.length < 2) continue;
    pts.push(line[line.length - 1]);
    for (let i = 0; i < pts.length; i++) {
      const [x, z] = pts[i];
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(pts.length - 1, i + 1)];
      let dx = next[0] - prev[0];
      let dz = next[1] - prev[1];
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      stations.push({
        x, z,
        y: (heightAt(x, z) ?? 0) + 0.16, // 廊地坪比地面高 0.16m
        yaw: Math.atan2(dx, dz),
        nx: -dz,
        nz: dx,
      });
    }
  }
  // 空间散列
  const cell = 5;
  const map = new Map();
  stations.forEach((st, i) => {
    const k = `${Math.floor(st.x / cell)},${Math.floor(st.z / cell)}`;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(i);
  });
  return {
    stations,
    /** 最近的廊柱位（3m 内） */
    nearest(x, z) {
      const cx = Math.floor(x / cell);
      const cz = Math.floor(z / cell);
      let best = null;
      let bestD = 3.0;
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          const arr = map.get(`${cx + i},${cz + j}`);
          if (!arr) continue;
          for (const si of arr) {
            const st = stations[si];
            const d = Math.hypot(st.x - x, st.z - z);
            if (d < bestD) {
              bestD = d;
              best = st;
            }
          }
        }
      }
      return best;
    },
  };
}

/** 占位网格：避免人/马/轿互相穿模 */
class Occupancy {
  constructor(cell = 4) {
    this.cell = cell;
    this.map = new Map();
  }
  key(x, z) {
    return `${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`;
  }
  free(x, z, r) {
    const cx = Math.floor(x / this.cell);
    const cz = Math.floor(z / this.cell);
    const n = Math.ceil(r / this.cell) + 1;
    for (let i = -n; i <= n; i++) {
      for (let j = -n; j <= n; j++) {
        const arr = this.map.get(`${cx + i},${cz + j}`);
        if (!arr) continue;
        for (const o of arr) {
          const dx = o.x - x, dz = o.z - z;
          const rr = r + o.r;
          if (dx * dx + dz * dz < rr * rr) return false;
        }
      }
    }
    return true;
  }
  take(x, z, r) {
    const k = this.key(x, z);
    if (!this.map.has(k)) this.map.set(k, []);
    this.map.get(k).push({ x, z, r });
  }
}

/* ================================================================== *
 * 十、路径采样
 * ================================================================== */

function makePathSampler(line) {
  const segs = [];
  let total = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const x1 = line[i][0], z1 = line[i][1];
    const x2 = line[i + 1][0], z2 = line[i + 1][1];
    const L = Math.hypot(x2 - x1, z2 - z1);
    if (L < 1e-4) continue;
    segs.push({ x1, z1, x2, z2, L, s0: total });
    total += L;
  }
  return {
    total,
    at(s) {
      if (!segs.length) return null;
      const ss = Math.max(0, Math.min(total - 1e-6, s));
      let seg = segs[segs.length - 1];
      for (const g of segs) {
        if (ss >= g.s0 && ss < g.s0 + g.L) { seg = g; break; }
      }
      const t = (ss - seg.s0) / seg.L;
      return {
        x: seg.x1 + (seg.x2 - seg.x1) * t,
        z: seg.z1 + (seg.z2 - seg.z1) * t,
        yaw: Math.atan2(seg.x2 - seg.x1, seg.z2 - seg.z1),
      };
    },
  };
}

/* ================================================================== *
 * 十一、总装
 * ================================================================== */

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

/** 数量配置（皇家园林游人不算多） */
const COUNT = {
  commoner: 190, // 游人（散在路径上 + 四十景前庭）
  official: 18, // 戴翎顶帽的品官
  sedan: 12, // 轿舆（各配两名轿夫）
  horse: 12, // 马
  porter: 36, // 挑担货郎
  guard: 16, // 仪仗执事（4 景 × 4 人）
  cart: 8, // 板车
  boat: 16, // 小船
};

/** 只有这几景配銮驾（品级最高的中轴几景） */
const REGALIA_SCENES = ['正大光明', '九州清晏', '勤政亲贤', '鸿慈永祜'];

export function buildFigures(sceneData, heightAt) {
  const group = new THREE.Group();
  group.name = 'figures';

  const rnd = mulberry32(0x51f1a7c3); // 固定种子：同一份 scene.json 每次生成一致
  const bin = new Bin();
  const H = heightAt || (() => 0);

  const ob = makeObstacles(sceneData);
  const waterAt = makeWaterTest(sceneData, H);
  const corridors = makeCorridorStations(sceneData, H);
  const occ = new Occupancy(4);

  const stats = {
    commoner: 0, official: 0, bearer: 0, porter: 0,
    guard: 0, horse: 0, sedan: 0, cart: 0, boat: 0,
    onCorridor: 0,
  };

  /* ---- 可用路径 ---- */
  const WALK_KINDS = new Set(['footway', 'path', 'pedestrian']);
  const allPaths = (sceneData.paths || [])
    .filter((p) => WALK_KINDS.has(p.kind) && p.line && p.line.length > 1)
    .map((p) => ({ kind: p.kind, sampler: makePathSampler(p.line) }))
    .filter((p) => p.sampler.total > 4);

  // 按长度做累积分布（按长度加权抽样，人自然集中在长路上）
  const cum = [];
  let acc = 0;
  for (const p of allPaths) {
    acc += p.sampler.total;
    cum.push(acc);
  }
  const pickPath = () => {
    const t = rnd() * acc;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < t) lo = mid + 1;
      else hi = mid;
    }
    return allPaths[lo];
  };

  /** 位置是否可用 */
  const usable = (x, z, r) => {
    if (waterAt(x, z) !== null) return false;
    if (inObstacle(ob, x, z)) return false;
    if (!occ.free(x, z, r)) return false;
    return true;
  };

  /** 把点贴到附近游廊的柱位上（廊下的人踩在廊地坪） */
  const snapCorridor = (x, z) => {
    const st = corridors.nearest(x, z);
    if (!st) return null;
    return st;
  };

  /* ================================================================
   * A. 游人 —— 路径上成小簇散布
   * ================================================================ */
  const COMMONER_ON_PATH = 128;
  let placed = 0;
  let guardCount = 0;
  while (placed < COMMONER_ON_PATH && guardCount < 4000) {
    guardCount++;
    const p = pickPath();
    const s0 = rnd() * p.sampler.total;
    const n = 1 + Math.floor(rnd() * 3); // 每个锚点 1~3 人
    for (let k = 0; k < n && placed < COMMONER_ON_PATH; k++) {
      const s = s0 + (rnd() - 0.5) * 22;
      const pt = p.sampler.at(s);
      if (!pt) continue;
      // 侧向偏移：人不会齐刷刷站在路中线上
      const off = (rnd() - 0.5) * 2.6;
      const nx = -Math.sin(pt.yaw);
      const nz = Math.cos(pt.yaw);
      let x = pt.x + nx * off;
      let z = pt.z + nz * off;
      let groundY = H(x, z);

      // 廊下的人踩在廊地坪上
      const st = snapCorridor(x, z);
      if (st && rnd() < 0.85) {
        x = st.x;
        z = st.z;
        groundY = st.y;
        stats.onCorridor++;
      }

      if (!usable(x, z, 0.55)) continue;
      occ.take(x, z, 0.55);

      const female = rnd() < 0.26;
      const M = new THREE.Matrix4().compose(
        new THREE.Vector3(x, groundY, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, pt.yaw + (rnd() - 0.5) * 0.8, 0)),
        new THREE.Vector3(1, 1, 1)
      );
      if (female) {
        addPerson(bin, M, {
          height: DIM.woman,
          robe: rnd() < 0.5 ? PAL.stoneBlue : PAL.indigo,
          hat: 'qitou',
          skin: rnd() < 0.5 ? PAL.skin : PAL.skinDark,
        });
      } else {
        addPerson(bin, M, {
          height: DIM.man,
          robe: COMMONER_COLORS[Math.floor(rnd() * COMMONER_COLORS.length)],
          hat: 'gua',
          skin: rnd() < 0.5 ? PAL.skin : PAL.skinDark,
        });
      }
      placed++;
      stats.commoner++;
    }
  }

  /* ================================================================
   * B. 四十景前庭的游人 + 货郎
   * ================================================================ */
  const scenes = (sceneData.scenes || []).filter((s) => SCENE_PROGRAM[s.name]);
  for (const s of scenes) {
    // 前庭：主殿面南（+Z），台阶一带在轴线前方
    const forecourt = [];
    for (const r of [15, 19, 23, 27, 12]) {
      for (const dx of [0, -7, 7, -13, 13, -20, 20]) {
        forecourt.push([s.x + dx, s.z + r]);
      }
    }
    // 游人 1~2 名
    const nPeople = 1 + (rnd() < 0.55 ? 1 : 0);
    for (let i = 0; i < nPeople; i++) {
      for (const [fx, fz] of forecourt) {
        if (!usable(fx, fz, 0.55)) continue;
        occ.take(fx, fz, 0.55);
        const M = new THREE.Matrix4().compose(
          new THREE.Vector3(fx, H(fx, fz), fz),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * Math.PI * 2, 0)),
          new THREE.Vector3(1, 1, 1)
        );
        if (rnd() < 0.3) {
          addPerson(bin, M, {
            height: DIM.woman, robe: PAL.stoneBlue, hat: 'qitou', skin: PAL.skin,
          });
        } else {
          addPerson(bin, M, {
            height: DIM.man,
            robe: COMMONER_COLORS[Math.floor(rnd() * COMMONER_COLORS.length)],
            hat: 'gua', skin: PAL.skin,
          });
        }
        stats.commoner++;
        break;
      }
    }
    // 货郎（挑担）：台阶附近
    for (const [fx, fz] of forecourt) {
      if (!usable(fx, fz, 0.7)) continue;
      occ.take(fx, fz, 0.7);
      const M = new THREE.Matrix4().compose(
        new THREE.Vector3(fx, H(fx, fz), fz),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * Math.PI * 2, 0)),
        new THREE.Vector3(1, 1, 1)
      );
      const g = addPerson(bin, M, {
        height: DIM.porter,
        robe: rnd() < 0.5 ? PAL.brown : PAL.darkBrown,
        hat: 'gua',
        skin: PAL.skinDark,
        arms: 'down',
      });
      addPorterKit(bin, M, g.s);
      stats.porter++;
      break;
    }
  }

  /* ================================================================
   * C. 官员（翎顶帽）—— 品级高的几景前庭
   * ================================================================ */
  const officialScenes = REGALIA_SCENES.concat(['长春仙馆', '澹泊宁静', '茹古涵今']);
  let offCount = 0;
  for (const name of officialScenes) {
    const s = scenes.find((v) => v.name === name);
    if (!s) continue;
    const want = name === '长春仙馆' || name === '澹泊宁静' || name === '茹古涵今' ? 2 : 3;
    let done = 0;
    for (const r of [13, 17, 21, 25, 30]) {
      for (const dx of [-4, 4, -10, 10, 0, -16, 16]) {
        if (done >= want || offCount >= COUNT.official) break;
        const fx = s.x + dx;
        const fz = s.z + r;
        if (!usable(fx, fz, 0.8)) continue;
        occ.take(fx, fz, 0.8);
        const M = new THREE.Matrix4().compose(
          new THREE.Vector3(fx, H(fx, fz), fz),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * Math.PI * 2, 0)),
          new THREE.Vector3(1, 1, 1)
        );
        addPerson(bin, M, {
          height: DIM.official,
          robe: PAL.mandarin,
          hat: 'dingdai',
          skin: PAL.skin,
        });
        stats.official++;
        offCount++;
        done++;
      }
    }
  }

  /* ================================================================
   * D. 仪仗（旗/伞/扇）—— 中轴四景，2~6 人一队
   * ================================================================ */
  const regaliaKinds = ['parasol', 'banner', 'fan', 'banner'];
  for (const name of REGALIA_SCENES) {
    const s = scenes.find((v) => v.name === name);
    if (!s) continue;
    let done = 0;
    for (const r of [15, 19, 23, 27, 31, 35]) {
      for (const dx of [0, -5, 5]) {
        if (done >= 4) break;
        const fx = s.x + dx;
        const fz = s.z + r;
        if (!usable(fx, fz, 0.9)) continue;
        occ.take(fx, fz, 0.9);
        const M = new THREE.Matrix4().compose(
          new THREE.Vector3(fx, H(fx, fz), fz),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * Math.PI * 2, 0)),
          new THREE.Vector3(1, 1, 1)
        );
        const kind = regaliaKinds[done % regaliaKinds.length];
        const g = addPerson(bin, M, {
          height: DIM.guard,
          robe: kind === 'fan' ? PAL.mandarin : PAL.vermilion,
          hat: 'dingdai',
          skin: PAL.skin,
          arms: 'down',
        });
        addRegalia(bin, M, kind, g.s);
        stats.guard++;
        done++;
      }
    }
  }

  /* ================================================================
   * E. 轿舆（两人抬）—— 较宽的主路上
   * ================================================================ */
  const widePaths = allPaths
    .filter((p) => p.kind === 'path' || p.kind === 'pedestrian' || p.sampler.total > 220)
    .map((p) => ({ kind: p.kind, sampler: p.sampler }))
    .filter((p) => p.sampler.total > 40);
  const widePool = widePaths.length ? widePaths : allPaths;

  let sedanCount = 0;
  let sedanTry = 0;
  while (sedanCount < COUNT.sedan && sedanTry < 900) {
    sedanTry++;
    const p = widePool[Math.floor(rnd() * widePool.length)];
    if (!p) break;
    const pt = p.sampler.at(rnd() * p.sampler.total);
    if (!pt) continue;
    const yaw = pt.yaw + (rnd() - 0.5) * 0.5;
    const nx = -Math.sin(yaw);
    const nz = Math.cos(yaw);
    // 轿身 + 前后轿夫共占 3.6m
    const probe = [];
    for (const d of [-1.5, 0, 1.5]) {
      probe.push([pt.x + nx * d, pt.z + nz * d]);
    }
    let ok = true;
    for (const [qx, qz] of probe) {
      if (!usable(qx, qz, 1.9)) { ok = false; break; }
    }
    if (!ok) continue;
    for (const [qx, qz] of probe) occ.take(qx, qz, 1.9);

    const M = new THREE.Matrix4().compose(
      new THREE.Vector3(pt.x, H(pt.x, pt.z), pt.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
      new THREE.Vector3(1, 1, 1)
    );
    addSedan(bin, M);

    // 前后各一名轿夫，抬手扶杠
    for (const side of [1, -1]) {
      const g = addPerson(bin, M, {
        height: DIM.bearer,
        robe: PAL.darkBrown,
        hat: 'gua',
        skin: PAL.skinDark,
        arms: 'up',
        handX: DIM.sedan.poleX,
        handY: DIM.sedan.poleY,
        handZ: side * 1.42 + side * 0.10,
      });
      stats.bearer++;
    }
    sedanCount++;
    stats.sedan++;
  }

  /* ================================================================
   * F. 马 —— 主路上拴着待命的鞍马
   * ================================================================ */
  let horseCount = 0;
  let horseTry = 0;
  while (horseCount < COUNT.horse && horseTry < 900) {
    horseTry++;
    const p = widePool[Math.floor(rnd() * widePool.length)];
    if (!p) break;
    const pt = p.sampler.at(rnd() * p.sampler.total);
    if (!pt) continue;
    const yaw = pt.yaw + (rnd() - 0.5) * 0.6;
    const nx = -Math.sin(yaw);
    const nz = Math.cos(yaw);
    const ox = pt.x + nx * (rnd() < 0.5 ? -2.6 : 2.6);
    const oz = pt.z + nz * (rnd() < 0.5 ? -2.6 : 2.6);
    if (!usable(ox, oz, 1.7)) continue;
    occ.take(ox, oz, 1.7);
    const M = new THREE.Matrix4().compose(
      new THREE.Vector3(ox, H(ox, oz), oz),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
      new THREE.Vector3(1, 1, 1)
    );
    addHorse(bin, M);
    horseCount++;
    stats.horse++;
  }

  /* ================================================================
   * G. 板车 —— 主路上载货车
   * ================================================================ */
  let cartCount = 0;
  let cartTry = 0;
  while (cartCount < COUNT.cart && cartTry < 700) {
    cartTry++;
    const p = widePool[Math.floor(rnd() * widePool.length)];
    if (!p) break;
    const pt = p.sampler.at(rnd() * p.sampler.total);
    if (!pt) continue;
    const yaw = pt.yaw + (rnd() - 0.5) * 0.5;
    const nx = -Math.sin(yaw);
    const nz = Math.cos(yaw);
    const ox = pt.x + nx * (rnd() < 0.5 ? -3.2 : 3.2);
    const oz = pt.z + nz * (rnd() < 0.5 ? -3.2 : 3.2);
    if (!usable(ox, oz, 2.0)) continue;
    occ.take(ox, oz, 2.0);
    const M = new THREE.Matrix4().compose(
      new THREE.Vector3(ox, H(ox, oz), oz),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
      new THREE.Vector3(1, 1, 1)
    );
    addCart(bin, M);
    cartCount++;
    stats.cart++;
  }

  /* ================================================================
   * H. 小船 —— 只放在水面内部，且贴岸
   * ================================================================ */
  const waterPolys = (sceneData.water || [])
    .filter((w) => w.ring && w.ring.length > 3 && polyArea(w.ring) > 2500);
  let boatCount = 0;
  let boatTry = 0;
  while (boatCount < COUNT.boat && boatTry < 1600) {
    boatTry++;
    if (!waterPolys.length) break;
    const w = waterPolys[Math.floor(rnd() * waterPolys.length)];
    const ring = w.ring;
    const t = Math.floor(rnd() * ring.length);
    const px = ring[t][0];
    const pz = ring[t][1];
    const prev = ring[(t - 3 + ring.length) % ring.length];
    const next = ring[(t + 3) % ring.length];
    let tx = next[0] - prev[0];
    let tz = next[1] - prev[1];
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;
    // 内法线：向内试一点，用环内测试定方向
    const perpx = -tz;
    const perpz = tx;
    const inward = pointInRing(px + perpx * 0.8, pz + perpz * 0.8, ring);
    const nx = inward ? perpx : -perpx;
    const nz = inward ? perpz : -perpz;

    const len = DIM.boat.lenMin + rnd() * (DIM.boat.lenMax - DIM.boat.lenMin);
    const inset = DIM.boat.wid * 0.5 + 0.7 + rnd() * 0.9;
    const bx = px + nx * inset;
    const bz = pz + nz * inset;
    // 船底要真的在水下
    const g = H(bx, bz);
    if (g > w.level - 0.55) continue;
    if (g < w.level - 6) continue;
    // 不与岸线/其它船打架
    if (!occ.free(bx, bz, 2.2)) continue;
    occ.take(bx, bz, 2.2);

    const yaw = Math.atan2(tx, tz);
    const M = new THREE.Matrix4().compose(
      new THREE.Vector3(bx, w.level - 0.12, bz), // 船身吃水 0.12m
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
      new THREE.Vector3(1, 1, 1)
    );
    addBoat(bin, M, len);
    boatCount++;
    stats.boat++;
  }

  /* ---- 合并出 Mesh ---- */
  const bucketStats = bin.build(MATS, group);
  let tris = 0;
  for (const [, t] of bucketStats) tris += t;

  const total =
    stats.commoner + stats.official + stats.bearer + stats.porter + stats.guard;
  console.log(
    `  ✓ 人物层：游人 ${stats.commoner}（廊下 ${stats.onCorridor}）/ 官员 ${stats.official} / ` +
      `轿夫 ${stats.bearer} / 货郎 ${stats.porter} / 执事 ${stats.guard} / ` +
      `马 ${stats.horse} / 轿 ${stats.sedan} / 车 ${stats.cart} / 船 ${stats.boat}；` +
      `人共 ${total}；draw call ${group.children.length}，三角面 ${Math.round(tris)}`
  );

  return group;
}
