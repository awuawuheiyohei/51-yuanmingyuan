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
 * ## 二、建模方式（明说，便于日后考据补正）
 *
 * 人物按**分层剪影**建，不是"一根棱台"：
 *   - 长袍：八边截面放样，及地 A 字摆（摆最宽、腰最窄）
 *   - 马褂/背心：另一层**异色**壳体，肩线有坡、下摆略外张，**看得见衣边**
 *   - 大襟：胸口一段斜襟边线（清式长袍的大襟只到腋下，不是一条长杠）
 *   - 白领（内衬翻出）+ 袖口挽边 + 靴尖露出袍摆
 *   - 头：卵形 + 小鼻锥提示朝向；颈是实的圆柱，头不悬空
 *   - 帽三种：瓜皮帽（圆顶 + 帽墙 + 顶疙瘩）/ 翎顶帽（檐 + 圆顶 + 红缨 +
 *     翎管 + 翎羽 + 顶珠）/ 旗头（宽扁板 + 两根旗杆 + 绒花）
 *   - 手臂：上臂 + 小臂两段**六边圆管**（不是方块板），带肘弯、肘部凸起、
 *     袖口、手；姿态四态：下垂 / 前伸 / 双手抬（轿夫握杠）/ 单手抬（执事持伞旗）
 *   - 姿态抖动：前后倾、左右倾、转头、两臂前后错落，由**独立随机流**按人序号
 *     生成 —— 确定性，不用 Math.random()，也不动摆位那条随机流。
 *
 * 马按**四足兽**建：躯干截面放样（鬐甲高于臀）、长颈上昂、楔形头带口鼻、
 *   眼、耳、额鬃、颈脊鬃片 + 垂鬃、尾分股下垂、四腿分大/小/管/蹄四段且
 *   关节有凸起；鞍具分件：鞍垫（贴身放样）、鞍座、鞍桥、肚带、镫、镫绦、
 *   笼头、衔铁、缰绳。肩高 1.45m、臀至鼻端 2.10m 不变。
 *
 * 轿舆不再是整块木箱：轿底板、四角柱、上下枋、**棂格窗（真棂条几何）**、
 *   下裙板、垂帘、攒尖轿盖（收分放样）、鎏金宝顶、檐口金边、盖角起翘、
 *   3.00m 轿杠 + 杠头铜箍 + 挂钩。**两名轿夫站在轿杠两端，杠压在肩上。**
 *
 * 板车为双轮 + 辐条 + 辕木 + 轭木 + 铁箍 + 载货；
 * 船为平底放样船体 + 舷侧护木 + 舱内横梁 + 乌篷 + 四道篷骨 + 摇橹 + 篙。
 *
 * 未做：衣纹/褶皱贴图（贴图零外部依赖，全程序化几何）、
 *   马的软甲与镫踏精细结构、轿厢雕饰、旗头繁复的头面堆叠。
 *
 * ## 三、性能
 *   全部几何按材质合并成 **4 个 Mesh**（布/肤/木/金属），顶点色区分个体服色，
 *   draw call 恒为 4；三角面 ~145k（252 人 + 9 马 + 12 轿 + 6 车 + 16 船）。
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

/** 肩关节半宽（× 身高）——身体与挂件定位共用一处，避免手与道具对不上 */
const SHOULDER_X_RATIO = 0.115;
/** 执事伸臂持物的外伸量（× 身高） */
const REACH_RATIO = 0.070;

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

/**
 * 变截面方料（手臂/腿/大襟）：a→b 为走向，a 端截面 w0×d0，b 端 w1×d1。
 * 比纯方料多一层收分，肢体才有"上粗下细"的锥度。
 */
function taperBox(a, b, w0, d0, w1, d1) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = Math.max(1e-4, dir.length());
  const g = new THREE.BoxGeometry(w0, len, d0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > 0) {
      pos.setX(i, pos.getX(i) * (w1 / w0));
      pos.setZ(i, pos.getZ(i) * (d1 / d0));
    }
  }
  g.computeVertexNormals();
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

/**
 * 变截面圆管段（袖/领）：a→b，两端半轴 (rx,rz)。
 * 用六边放样而不是方料 —— 袖子是圆的，方块会读成"贴了块板子"。
 */
function taperTube(a, b, rx0, rz0, rx1, rz1, n = 6) {
  const side = new THREE.Vector3(1, 0, 0);
  return tubeAlong(
    [a.clone(), b.clone()],
    [side, side],
    [[rx0, rz0], [rx1, rz1]],
    n, false, false
  );
}

/**
 * 横截面放样：把一串"环"连成实体（人躯干、马躯干、轿盖）。
 * sections[i] = { c:[x,y,z], u:[..], v:[..] }
 *   c = 环中心；u/v = 截面两条半轴向量（u 一般沿宽、v 一般沿深）。
 * 绕序由 u/v 与走向自动纠正，保证法线朝外。
 */
function loftRings(sections, n = 8, capFirst = false, capLast = false) {
  const pos = [];
  const uv = [];
  const idx = [];
  const v3 = new THREE.Vector3();
  // c/u/v 既可以是数组，也可以是 Vector3（fromArray 传 Vector3 会静默出 NaN）
  const toV3 = (x) => (x && x.isVector3 ? x.clone() : new THREE.Vector3().fromArray(x));
  const C = sections.map((s) => toV3(s.c));
  const U = sections.map((s) => toV3(s.u));
  const V = sections.map((s) => toV3(s.v));

  sections.forEach((_, i) => {
    for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2;
      v3.copy(C[i])
        .addScaledVector(U[i], Math.cos(a))
        .addScaledVector(V[i], Math.sin(a));
      pos.push(v3.x, v3.y, v3.z);
      uv.push(j / n, i / Math.max(1, sections.length - 1));
    }
  });

  // 绕序纠正：约定 v = u × 走向
  const T = new THREE.Vector3().subVectors(C[1], C[0]).normalize();
  const want = new THREE.Vector3().crossVectors(U[0], T);
  const flip = want.dot(V[0]) < 0;
  const tri = (a, b, c) => {
    if (flip) idx.push(a, c, b);
    else idx.push(a, b, c);
  };

  for (let i = 0; i < sections.length - 1; i++) {
    const b0 = i * n;
    const b1 = (i + 1) * n;
    for (let j = 0; j < n; j++) {
      const j2 = (j + 1) % n;
      tri(b0 + j, b1 + j, b0 + j2);
      tri(b0 + j2, b1 + j, b1 + j2);
    }
  }

  if (capFirst) {
    const ci = pos.length / 3;
    pos.push(C[0].x, C[0].y, C[0].z);
    uv.push(0.5, 0);
    for (let j = 0; j < n; j++) tri(ci, j, (j + 1) % n);
  }
  if (capLast) {
    const base = (sections.length - 1) * n;
    const ci = pos.length / 3;
    const last = C[C.length - 1];
    pos.push(last.x, last.y, last.z);
    uv.push(0.5, 1);
    for (let j = 0; j < n; j++) tri(ci, base + ((j + 1) % n), base + j);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * 沿折线放样一根管（马颈/腿/尾/鬃）：每点给中心、侧向轴、截面半径。
 * pts:[Vector3] sides:[Vector3] sizes:[[rx,ry],...] n: 截面边数
 */
function tubeAlong(pts, sides, sizes, n = 6, capStart = false, capEnd = false) {
  const rings = [];
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    const tan = new THREE.Vector3().subVectors(next, prev).normalize();
    const side = sides[i].clone().projectOnPlane(tan);
    if (side.lengthSq() < 1e-8) side.set(1, 0, 0).projectOnPlane(tan);
    side.normalize();
    const up = new THREE.Vector3().crossVectors(side, tan).normalize();
    rings.push({
      c: pts[i].clone(),
      u: side.multiplyScalar(sizes[i][0]),
      v: up.multiplyScalar(sizes[i][1]),
    });
  }
  return loftRings(rings, n, capStart, capEnd);
}

/** 把十六进制色压暗一档（长袍与马褂分色用） */
function darken(hex, k) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return c.getHex();
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
 * 一个人。局部坐标：脚在 y=0，面朝 +Z，身高严格等于 o.height。
 *
 * 剪影是硬要求：30~80m 外要看出"人"，而不是看出一根棱台。所以身上分层：
 *   长袍（及地、A 字摆）→ 马褂（短罩衣，下摆外张，异色）
 *   → 白领 → 肩线与颈 → 头（卵形，带鼻）→ 帽
 *   → 两段式手臂（上臂/小臂，带肘弯、袖口、手）→ 靴尖
 *
 * 姿态由 o.pose 驱动（确定性抖动，不用 Math.random()）：
 *   lean/side 前后左右倾，headYaw 转头，armMode 抬臂/前伸。
 */
function addPerson(bin, M, o) {
  const H = o.height ?? DIM.man;
  const s = H / DIM.man; // 尺度因子（肩宽等按 1.70m 的人设计）
  const robe = o.robe ?? PAL.indigo;
  const skin = o.skin ?? PAL.skin;
  const vest = o.vest ?? darken(robe, 0.62); // 马褂：压暗一档，与长袍分明
  const trim = o.trim ?? PAL.moonWhite; // 白领/袖口/大襟
  const pose = o.pose ?? {};

  const headR = 0.058 * H;
  // 头顶高度按帽型给：瓜皮帽把 DIM 的身高吃满（帽算在身高里）；
  // 翎顶帽的顶缨、旗头的头面高度另计（与 DIM 注释"帽缨高另计"一致）。
  const HEAD_TOP = { gua: 0.9458, qitou: 0.952, dingdai: 0.952 };
  const headTop = (HEAD_TOP[o.hat ?? 'gua'] ?? 0.952) * H;
  const headCY = headTop - headR;
  const chinY = headCY - headR * 1.04;
  const collarY = 0.828 * H; // 领口
  const shoulderY = 0.788 * H; // 肩点
  const shoulderX = SHOULDER_X_RATIO * H; // 肩关节半宽
  const hemY = 0.012 * H; // 袍摆离地

  // 姿态：上身随高度渐次偏移，读作"微倾"而不是"插在木桩上"
  const lean = pose.lean ?? 0;
  const sideLean = pose.side ?? 0;
  const drift = (y) => {
    const t = Math.max(0, (y - hemY) / Math.max(1e-4, collarY - hemY));
    return { x: sideLean * 0.09 * H * t, z: lean * 0.30 * H * t };
  };
  const sec = (y, rx, rz) => {
    const d = drift(y);
    return { c: [d.x, y, d.z], u: [rx, 0, 0], v: [0, 0, rz] };
  };

  // ---- 长袍：八边截面放样，及地 A 字摆 ----
  const body = loftRings(
    [
      sec(hemY, 0.162 * H, 0.104 * H), // 摆（最宽 → A 字摆）
      sec(0.28 * H, 0.148 * H, 0.095 * H),
      sec(0.52 * H, 0.120 * H, 0.079 * H), // 腰（最窄）
      sec(0.71 * H, 0.129 * H, 0.083 * H), // 胸
      sec(shoulderY, 0.131 * H, 0.084 * H), // 肩线
      sec(collarY, 0.060 * H, 0.052 * H), // 领口（收进）
    ],
    8
  );
  put(bin, 'cloth', body, robe, M);

  // ---- 马褂：短罩衣，下摆外张，与长袍异色 ----
  const vestG = loftRings(
    [
      sec(0.844 * H, 0.082 * H, 0.069 * H), // 领口一小圈
      sec(0.788 * H, 0.140 * H, 0.092 * H), // 肩线（马褂搭在肩上）
      sec(0.640 * H, 0.146 * H, 0.096 * H),
      sec(0.505 * H, 0.153 * H, 0.101 * H), // 下摆（略外张，看得见边）
    ],
    8
  );
  put(bin, 'cloth', vestG, vest, M);

  // ---- 大襟（右衽斜襟）：一条窄边线，30m 外就能读出"衣服" ----
  const placket = taperBox(
    new THREE.Vector3(-0.050 * H, 0.792 * H, 0.088 * H),
    new THREE.Vector3(0.030 * H, 0.658 * H, 0.098 * H),
    0.010 * H, 0.010 * H, 0.008 * H, 0.010 * H
  );
  put(bin, 'cloth', placket, trim, M);

  // ---- 颈 ----
  const neck = new THREE.CylinderGeometry(0.035 * H, 0.040 * H, 0.062 * H, 5);
  neck.translate(0, collarY + 0.022 * H, 0.004 * H);
  put(bin, 'skin', neck, skin, M);

  // ---- 白领（内衬翻出的一圈） ----
  const collar = new THREE.CylinderGeometry(
    0.072 * H, 0.082 * H, 0.032 * H, 6, 1, true
  );
  collar.translate(0, collarY + 0.012 * H, 0);
  put(bin, 'cloth', collar, trim, M);

  // ---- 头：卵形（别做成气球），带一点鼻提示朝向 ----
  const headM = new THREE.Matrix4().makeRotationY(pose.headYaw ?? 0);
  /**
   * ⚠ 段数不能太粗：原来 `SphereGeometry(headR, 4, 3)` = **24 个三角面**，
   *   近景看就是一个**扁盒子**（"纸片人"）。
   *   提到 8×6（≈80 面），脸型才有弧度；251 个人合计多 1.8 万面，可接受。
   */
  const head = new THREE.SphereGeometry(headR, 8, 6);
  head.scale(0.9, 1.06, 0.95);
  head.translate(0, headCY, 0.005 * H);
  head.applyMatrix4(headM);
  put(bin, 'skin', head, skin, M);

  // 鼻：四棱锥（三角锥太尖，近景像根刺）
  const nose = new THREE.ConeGeometry(0.011 * H, 0.022 * H, 4);
  nose.rotateX(Math.PI / 2);
  nose.translate(0, headCY - 0.008 * H, headR * 0.86);
  nose.applyMatrix4(headM);
  put(bin, 'skin', nose, o.skinDark ?? darken(skin, 0.88), M);

  // 眼 + 眉：两小块深色。
  //
  // ⚠ **没有五官的脸像 mannequin** —— 远看无所谓，
  //   近景（人物常被镜头带到 1~2m）一眼就穿帮。
  //   眼与眉都用**深色小块**（走 'skin' 桶 + 顶点色），不额外加材质桶。
  const eyeY = headCY + 0.016 * H;
  const eyeZ = headR * 0.84;
  for (const sx of [-1, 1]) {
    const eye = new THREE.BoxGeometry(0.019 * H, 0.0085 * H, 0.006 * H);
    eye.translate(sx * 0.030 * H, eyeY, eyeZ);
    eye.applyMatrix4(headM);
    put(bin, 'skin', eye, 0x241c16, M);
    const brow = new THREE.BoxGeometry(0.022 * H, 0.005 * H, 0.005 * H);
    brow.translate(sx * 0.030 * H, eyeY + 0.016 * H, eyeZ);
    brow.applyMatrix4(headM);
    put(bin, 'skin', brow, 0x241c16, M);
  }

  // 耳：两片扁球（低模即可，多半藏在帽下）
  for (const sx of [-1, 1]) {
    const ear = new THREE.SphereGeometry(0.014 * H, 5, 4);
    ear.scale(0.42, 1.0, 0.72);
    ear.translate(sx * headR * 0.9, headCY - 0.004 * H, 0);
    ear.applyMatrix4(headM);
    put(bin, 'skin', ear, skin, M);
  }

  // ---- 脑后发（帽下露出的部分） ----
  const hair = new THREE.SphereGeometry(
    headR * 1.05, 4, 2, Math.PI, Math.PI, 0, Math.PI * 0.66
  );
  hair.scale(0.95, 1.0, 1.0);
  hair.translate(0, headCY + headR * 0.08, -headR * 0.08);
  hair.applyMatrix4(headM);
  put(bin, 'cloth', hair, 0x241c16, M);

  // ---- 靴：袍摆下露出的鞋尖 ----
  for (const sx of [-1, 1]) {
    const shoe = new THREE.BoxGeometry(0.055 * H, 0.030 * H, 0.115 * H);
    shoe.translate(sx * 0.038 * H, 0.015 * H, 0.070 * H);
    put(bin, 'cloth', shoe, 0x2a2622, M);
  }

  // ---- 帽 ----
  addHat(bin, M, o, { H, s, headR, headCY, headTop, headM, chinY });

  // ---- 臂 ----
  addArms(bin, M, o, {
    H, s, shoulderY, shoulderX, collarY, hemY,
    robe, skin, trim, vest, pose,
  });

  return { H, s, shoulderY, shoulderX, collarY, headCY, headR, chinY };
}

/**
 * 帽：瓜皮小帽 / 旗头 / 翎顶帽。
 * 三种都要一眼认得出，所以各自的标志性构件（顶疙瘩、旗杆、红缨翎管）都做实体。
 */
function addHat(bin, M, o, g) {
  const { H, s, headR, headCY, headTop, headM } = g;
  const kind = o.hat ?? 'gua';
  const hatColor = o.hatColor ?? PAL.ink;
  const base = headTop - headR * 0.62; // 帽根（贴着头顶下缘）

  if (kind === 'gua') {
    // 瓜皮小帽：圆顶 + 一圈帽墙 + 顶上的疙瘩
    const capR = 0.066 * H;
    const cap = new THREE.SphereGeometry(
      capR, 6, 3, 0, Math.PI * 2, 0, Math.PI * 0.56
    );
    cap.scale(1, 0.92, 1);
    cap.translate(0, base + capR * 0.30, 0);
    cap.applyMatrix4(headM);
    put(bin, 'cloth', cap, hatColor, M);

    const wall = new THREE.CylinderGeometry(
      capR * 1.01, capR * 1.02, 0.030 * H, 6, 1, true
    );
    wall.translate(0, base + 0.014 * H, 0);
    wall.applyMatrix4(headM);
    put(bin, 'cloth', wall, darken(hatColor, 0.8), M);

    const knob = new THREE.SphereGeometry(0.017 * H, 4, 2);
    knob.scale(1, 0.8, 1);
    knob.translate(0, base + capR * 1.16, 0);
    knob.applyMatrix4(headM);
    put(bin, 'cloth', knob, hatColor, M);
  } else if (kind === 'qitou') {
    // 旗头（清宫"两把头"）：宽扁板面 + 两根旗杆 + 绒花
    const board = new THREE.CylinderGeometry(0.138 * H, 0.116 * H, 0.062 * H, 6);
    board.translate(0, base + 0.030 * H, 0);
    board.applyMatrix4(headM);
    put(bin, 'cloth', board, hatColor, M);

    const plate = new THREE.CylinderGeometry(0.118 * H, 0.138 * H, 0.030 * H, 6);
    plate.translate(0, base + 0.072 * H, 0);
    plate.applyMatrix4(headM);
    put(bin, 'cloth', plate, darken(hatColor, 1.25), M);

    for (const sx of [-1, 1]) {
      const r = new THREE.CylinderGeometry(0.009 * H, 0.009 * H, 0.120 * H, 4);
      r.translate(sx * 0.098 * H, base + 0.125 * H, 0);
      r.applyMatrix4(headM);
      put(bin, 'wood', r, 0x2b2b30, M);
      const flower = new THREE.SphereGeometry(0.026 * H, 4, 2);
      flower.scale(1, 0.72, 1);
      flower.translate(sx * 0.098 * H, base + 0.180 * H, 0.012 * H);
      flower.applyMatrix4(headM);
      put(bin, 'cloth', flower, PAL.vermilion, M);
    }
  } else if (kind === 'dingdai') {
    // 翎顶帽：清代品官标志 —— 檐 + 圆顶 + 红缨 + 翎管 + 顶珠
    const crownY = base + 0.060 * H;

    // 檐（压住头顶的一圈）
    const brim = new THREE.CylinderGeometry(0.132 * H, 0.138 * H, 0.016 * H, 8);
    brim.scale(1, 1, 1.06);
    brim.translate(0, base + 0.008 * H, 0);
    brim.applyMatrix4(headM);
    put(bin, 'cloth', brim, 0x1c1e22, M);

    // 圆顶
    const crown = new THREE.SphereGeometry(
      0.118 * H, 8, 3, 0, Math.PI * 2, 0, Math.PI * 0.62
    );
    crown.scale(1, 0.80, 1);
    crown.translate(0, crownY - 0.030 * H, 0);
    crown.applyMatrix4(headM);
    put(bin, 'cloth', crown, 0x1c1e22, M);

    // 红缨（帽顶一束红马鬃）
    const plume = new THREE.ConeGeometry(0.032 * H, 0.155 * H, 5);
    plume.translate(0, crownY + 0.078 * H, 0);
    plume.applyMatrix4(headM);
    put(bin, 'cloth', plume, PAL.redPlume, M);

    // 顶珠（帽正中的金珠）
    const bead = new THREE.SphereGeometry(0.021 * H, 5, 3);
    bead.translate(0, crownY + 0.052 * H, 0.098 * H);
    bead.applyMatrix4(headM);
    put(bin, 'metal', bead, PAL.brightGold, M);

    // 翎管 + 翎羽（向后上方斜插）
    const dir = new THREE.Vector3(0, Math.cos(-0.8), Math.sin(-0.8));
    const tubeLen = 0.13 * H;
    for (const sx of [-1, 1]) {
      const base2 = new THREE.Vector3(sx * 0.036 * H, crownY + 0.055 * H, -0.048 * H);
      const tip = base2.clone().addScaledVector(dir, tubeLen);
      const tube = rod(base2, tip, 0.010 * H, 5);
      tube.applyMatrix4(headM);
      put(bin, 'metal', tube, PAL.gold, M);
      const feather = new THREE.BoxGeometry(0.040 * H, 0.130 * H, 0.011 * H);
      const q = new THREE.Quaternion().setFromUnitVectors(Q_Y, dir.clone().normalize());
      feather.applyMatrix4(
        new THREE.Matrix4().compose(
          tip.clone().addScaledVector(dir, 0.065 * H), q, new THREE.Vector3(1, 1, 1)
        )
      );
      feather.applyMatrix4(headM);
      put(bin, 'cloth', feather, sx > 0 ? PAL.stoneBlue : PAL.indigo, M);
    }
  }
}

/**
 * 手臂：两段（上臂/小臂）+ 肘弯 + 袖口 + 手。
 * 姿态模式：
 *   'down'  自然下垂（带前后错落，不是一根直棍）
 *   'carry' 一臂前伸（提物/搭手）
 *   'up'    双手抬到指定点（轿夫握杠）
 *   'one'   单手（+X 侧）抬到指定点（执事持伞/旗、货郎扶担）
 */
function addArms(bin, M, o, g) {
  const { H, s, shoulderY, shoulderX, robe, skin, trim, pose } = g;
  const mode = o.arms ?? 'down';
  const swing = pose.armSwing ?? 0;

  for (const sx of [-1, 1]) {
    const shoulder = new THREE.Vector3(sx * shoulderX, shoulderY, 0.005 * H);
    const targeted =
      mode === 'up' || (mode === 'one' && sx > 0);

    let elbow;
    let hand;
    if (targeted) {
      const hx = sx * (o.handX ?? 0.30 * s);
      const hy = o.handY ?? 1.42;
      const hz = o.handZ ?? 0;
      hand = new THREE.Vector3(hx, hy, hz);
      // 肘向侧下张开，形成"抬臂"的折角
      elbow = new THREE.Vector3(
        sx * (shoulderX + 0.048 * s),
        shoulderY - 0.200 * H,
        hz * 0.35 + 0.040 * H
      );
    } else if (mode === 'carry' && sx > 0) {
      elbow = new THREE.Vector3(
        sx * (shoulderX + 0.038 * s), shoulderY - 0.150 * H, 0.055 * H
      );
      hand = new THREE.Vector3(
        sx * (shoulderX - 0.004 * s), shoulderY - 0.290 * H, 0.135 * H
      );
    } else {
      const sw = sx > 0 ? swing : -swing * 0.6;
      elbow = new THREE.Vector3(
        sx * (shoulderX + 0.034 * s), shoulderY - 0.143 * H, 0.012 * H + sw * 0.35
      );
      hand = new THREE.Vector3(
        sx * (shoulderX + 0.021 * s), shoulderY - 0.290 * H, 0.028 * H + sw
      );
    }

    // 上臂 + 小臂（圆管，截面渐收）
    put(
      bin, 'cloth',
      taperTube(shoulder, elbow, 0.046 * s, 0.050 * s, 0.040 * s, 0.044 * s, 6),
      robe, M
    );
    put(
      bin, 'cloth',
      taperTube(elbow, hand, 0.040 * s, 0.044 * s, 0.031 * s, 0.035 * s, 6),
      robe, M
    );
    // 肘（一个小凸起，接住上下臂的折角）
    const eb = new THREE.SphereGeometry(0.045 * s, 4, 2);
    eb.scale(1, 0.92, 1);
    eb.translate(elbow.x, elbow.y, elbow.z);
    put(bin, 'cloth', eb, robe, M);

    // 袖口（挽边露出内衬）
    const cdir = new THREE.Vector3().subVectors(hand, elbow).normalize();
    const cuffA = hand.clone().addScaledVector(cdir, -0.036 * s);
    put(
      bin, 'cloth',
      taperBox(cuffA, hand, 0.082 * s, 0.090 * s, 0.074 * s, 0.082 * s),
      trim, M
    );

    // 手
    const hg = new THREE.SphereGeometry(0.040 * s, 4, 3);
    hg.scale(1, 1.35, 0.80);
    hg.translate(hand.x, hand.y - 0.018 * s, hand.z);
    put(bin, 'skin', hg, skin, M);
  }
}

/* ================================================================== *
 * 四、马
 * ================================================================== */

/**
 * 一匹马。局部坐标：蹄底在 y=0，面朝 +Z。
 * 肩高（鬐甲）严格 1.45m；臀至鼻端严格 2.10m。
 *
 * 剪影要点：颈自鬐甲上昂、楔形头带口鼻、鬐甲高于臀、
 * 四腿分"大/小/管/蹄"四段且关节处有凸起、尾与鬃分股。
 * 鞍鞯/鞍座/镫/笼头/衔铁/缰绳各自独立成件（布/木/金属三桶）。
 */
function addHorse(bin, M) {
  const D = DIM.horse;
  const sh = D.shoulder; // 1.45 鬐甲
  const coat = 0x5c4432;
  const coatDark = 0x4a3527;
  const maneC = 0x241a13;
  const X = new THREE.Vector3(1, 0, 0);
  const P = (x, y, z) => new THREE.Vector3(x, y, z);

  // ---- 躯干：自后臀到胸前的一串截面（鬐甲最高） ----
  const trunk = [
    { z: -0.64, y0: 0.99, y1: 1.22, w: 0.075 },
    { z: -0.50, y0: 0.87, y1: 1.29, w: 0.170 },
    { z: -0.30, y0: 0.78, y1: 1.33, w: 0.228 },
    { z: -0.05, y0: 0.76, y1: 1.36, w: 0.245 },
    { z: 0.14, y0: 0.76, y1: sh, w: 0.240 }, // 鬐甲 = 肩高
    { z: 0.30, y0: 0.82, y1: 1.31, w: 0.190 },
    { z: 0.40, y0: 0.92, y1: 1.17, w: 0.110 },
  ];
  const trunkSec = trunk.map((t) => {
    const cy = (t.y0 + t.y1) / 2;
    const ry = (t.y1 - t.y0) / 2;
    return { c: [0, cy, t.z], u: [t.w, 0, 0], v: [0, -ry, 0] };
  });
  put(bin, 'cloth', loftRings(trunkSec, 8, true, false), coat, M);

  // ---- 颈：自鬐甲向前上昂 ----
  const neckPts = [P(0, 1.16, 0.22), P(0, 1.30, 0.45), P(0, 1.42, 0.66), P(0, 1.49, 0.84)];
  const neckSz = [[0.125, 0.160], [0.110, 0.142], [0.095, 0.122], [0.082, 0.105]];
  put(bin, 'cloth', tubeAlong(neckPts, neckPts.map(() => X), neckSz, 8, true, false), coat, M);

  // ---- 头：楔形，带口鼻 ----
  const headPts = [P(0, 1.50, 0.86), P(0, 1.45, 1.05), P(0, 1.38, 1.26), P(0, 1.32, 1.46)];
  const headSz = [[0.086, 0.104], [0.074, 0.098], [0.058, 0.080], [0.055, 0.070]];
  put(bin, 'cloth', tubeAlong(headPts, headPts.map(() => X), headSz, 8, false, true), coat, M);
  // 眼：一对深色小珠，头才有"脸"
  for (const sx of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.017, 4, 2);
    eye.translate(sx * 0.070, 1.497, 0.985);
    put(bin, 'skin', eye, 0x1a1512, M);
  }

  // ---- 耳 ----
  for (const sx of [-1, 1]) {
    const ear = new THREE.ConeGeometry(0.036, 0.130, 4);
    ear.rotateX(0.20);
    ear.rotateZ(sx * 0.18);
    ear.translate(sx * 0.058, 1.635, 0.845);
    put(bin, 'cloth', ear, coatDark, M);
  }
  // 额鬃（两耳之间）
  const forelock = new THREE.ConeGeometry(0.024, 0.075, 4);
  forelock.rotateX(1.25);
  forelock.translate(0, 1.618, 0.892);
  put(bin, 'cloth', forelock, maneC, M);

  // ---- 鬃：沿颈脊的一道薄片 + 几缕垂发 ----
  const crest = [P(0, 1.345, 0.22), P(0, 1.468, 0.45), P(0, 1.575, 0.66), P(0, 1.622, 0.84)];
  const crestSz = [[0.020, 0.076], [0.019, 0.070], [0.017, 0.060], [0.015, 0.048]];
  put(bin, 'cloth', tubeAlong(crest, crest.map(() => X), crestSz, 5, true, true), maneC, M);
  for (let i = 0; i < 4; i++) {
    const t = 0.18 + i * 0.22;
    const a = crest[0].clone().lerp(crest[3], t);
    const strand = new THREE.ConeGeometry(0.032, 0.130, 4);
    strand.rotateX(Math.PI * 0.88);
    strand.rotateZ((i % 2 ? 1 : -1) * 0.22);
    strand.translate((i % 2 ? 1 : -1) * 0.040, a.y - 0.048, a.z + 0.012);
    put(bin, 'cloth', strand, maneC, M);
  }

  // ---- 尾 ----
  const tailPts = [P(0, 1.19, -0.60), P(0, 1.02, -0.72), P(0, 0.83, -0.83), P(0, 0.62, -0.88)];
  const tailSz = [[0.045, 0.045], [0.042, 0.042], [0.050, 0.048], [0.072, 0.060]];
  put(bin, 'cloth', tubeAlong(tailPts, tailPts.map(() => X), tailSz, 6, true, true), maneC, M);
  const tailTuft = new THREE.ConeGeometry(0.058, 0.215, 5);
  tailTuft.rotateX(0.16);
  tailTuft.translate(0, 0.520, -0.900);
  put(bin, 'cloth', tailTuft, maneC, M);

  // ---- 四腿：大腿/小腿/管/蹄，关节处加粗 ----
  const legDefs = [
    { x: 0.152, z: 0.16, front: true },
    { x: -0.152, z: 0.16, front: true },
    { x: 0.150, z: -0.34, front: false },
    { x: -0.150, z: -0.34, front: false },
  ];
  for (const L of legDefs) {
    const pts = L.front
      ? [
          P(L.x, 1.00, L.z + 0.01),
          P(L.x * 0.985, 0.62, L.z - 0.05), // 膝（向后）
          P(L.x * 0.975, 0.24, L.z + 0.01), // 管（向前下）
          P(L.x * 0.970, 0.13, L.z + 0.025),
        ]
      : [
          P(L.x, 1.00, L.z - 0.02),
          P(L.x * 0.975, 0.78, L.z + 0.04), // 飞节
          P(L.x * 0.950, 0.54, L.z - 0.09), // 跗（向后）
          P(L.x * 0.940, 0.24, L.z - 0.03),
          P(L.x * 0.935, 0.13, L.z - 0.02),
        ];
    const sz = L.front
      ? [[0.104, 0.102], [0.052, 0.052], [0.037, 0.037], [0.041, 0.043]]
      : [[0.110, 0.108], [0.062, 0.062], [0.043, 0.043], [0.035, 0.035], [0.039, 0.041]];
    put(bin, 'cloth', tubeAlong(pts, pts.map(() => X), sz, 6, false, false), coat, M);
    // 关节凸起（膝/跗）
    const joint = new THREE.SphereGeometry(0.050, 4, 2);
    joint.scale(1, 0.9, 1);
    joint.translate(pts[1].x, pts[1].y, pts[1].z);
    put(bin, 'cloth', joint, coat, M);
    // 蹄
    const hoof = new THREE.CylinderGeometry(0.052, 0.064, 0.130, 6);
    hoof.translate(pts[pts.length - 1].x, 0.065, pts[pts.length - 1].z + 0.005);
    put(bin, 'cloth', hoof, 0x2e2620, M);
  }

  // ---- 鞍鞯（垫毯）+ 鞍座 + 肚带 + 镫 ----
  // 鞍垫：沿躯干截面放样，贴身一圈（顶部压在鞍下，两侧垂下来）
  const padSec = [
    { z: -0.30, y0: 0.76, y1: 1.33, w: 0.228 },
    { z: 0.00, y0: 0.74, y1: 1.36, w: 0.245 },
    { z: 0.30, y0: 0.80, y1: 1.31, w: 0.190 },
  ].map((t) => {
    const cy = (t.y0 + t.y1) / 2;
    const ry = (t.y1 - t.y0) / 2 + 0.018;
    return { c: [0, cy, t.z], u: [t.w + 0.018, 0, 0], v: [0, -ry, 0] };
  });
  put(bin, 'cloth', loftRings(padSec, 8, true, true), PAL.indigo, M);
  for (const sx of [-1, 1]) {
    // 垂片（贴身垂下，不要张成翅膀）
    const flap = new THREE.BoxGeometry(0.030, 0.20, 0.52);
    flap.translate(sx * 0.248, 1.195, 0.00);
    put(bin, 'cloth', flap, PAL.indigo, M);
    // 镶金边
    const trim = new THREE.BoxGeometry(0.012, 0.020, 0.52);
    trim.translate(sx * 0.260, 1.100, 0.00);
    put(bin, 'metal', trim, PAL.gold, M);
    // 镫（金属环）+ 镫绦
    const strap = new THREE.BoxGeometry(0.022, 0.24, 0.045);
    strap.translate(sx * 0.270, 1.278, 0.00);
    put(bin, 'cloth', strap, 0x3a2418, M);
    const stirrup = new THREE.TorusGeometry(0.052, 0.013, 3, 6);
    stirrup.rotateY(Math.PI / 2);
    stirrup.translate(sx * 0.270, 1.145, 0.00);
    put(bin, 'metal', stirrup, 0xb9a06a, M);
  }
  // 鞍座（中间凹、两端翘）
  const seat = taperBox(P(0, 1.368, -0.02), P(0, 1.458, 0.02), 0.340, 0.560, 0.250, 0.440);
  put(bin, 'wood', seat, 0x4a2f22, M);
  const cantle = new THREE.BoxGeometry(0.28, 0.085, 0.080);
  cantle.translate(0, 1.472, -0.228);
  put(bin, 'wood', cantle, 0x4a2f22, M);
  const pommel = new THREE.BoxGeometry(0.24, 0.070, 0.070);
  pommel.translate(0, 1.468, 0.238);
  put(bin, 'wood', pommel, 0x4a2f22, M);
  // 肚带（勒在背上的一道）
  const girth = new THREE.BoxGeometry(0.46, 0.035, 0.080);
  girth.translate(0, 1.352, 0.130);
  put(bin, 'cloth', girth, 0x3a2418, M);

  // ---- 笼头 / 衔铁 / 缰绳 ----
  // 额带
  const brow = new THREE.BoxGeometry(0.165, 0.028, 0.038);
  brow.translate(0, 1.585, 0.885);
  put(bin, 'wood', brow, 0x33241a, M);
  // 鼻带（绕口鼻一圈）
  const noseband = new THREE.TorusGeometry(0.062, 0.013, 3, 6);
  noseband.rotateY(Math.PI / 2);
  noseband.rotateX(0.5);
  noseband.translate(0, 1.300, 1.275);
  put(bin, 'wood', noseband, 0x33241a, M);
  // 衔铁（口衔）
  const bit = new THREE.BoxGeometry(0.150, 0.028, 0.028);
  bit.translate(0, 1.315, 1.300);
  put(bin, 'metal', bit, 0xa8a29a, M);
  // 颊带
  for (const sx of [-1, 1]) {
    put(
      bin, 'wood',
      rod(P(sx * 0.062, 1.590, 0.885), P(sx * 0.062, 1.320, 1.295), 0.011, 4),
      0x33241a, M
    );
  }
  // 缰绳（从衔铁到鞍前）
  for (const sx of [-1, 1]) {
    put(
      bin, 'cloth',
      rod(P(sx * 0.060, 1.325, 1.300), P(sx * 0.105, 1.470, 0.250), 0.010, 4),
      0x3a2418, M
    );
  }
}

/* ================================================================== *
 * 五、轿舆（两人抬）
 * ================================================================== */

/**
 * 一顶轿舆（两人抬）。舆身 1.10×1.60；轿厢自轿底至宝顶共 1.60m；
 * 轿杠严格 3.00m，间距按 DIM.sedan.poleX（半距 0.30m）。
 *
 * 轿厢**不是一块实心木箱**：轿底板、四角柱、上下枋、棂格窗（真棂条几何）、
 * 垂帘、轿盖（收分攒尖）、鎏金宝顶、挂钩。
 */
function addSedan(bin, M) {
  const S = DIM.sedan;
  const boxW = S.w; // 1.10
  const boxL = S.l; // 1.60
  const floorY = 0.30; // 轿底离地
  const boxH = 1.04; // 轿厢高
  const boxTop = floorY + boxH; // 1.34
  const roofY = 1.40; // 顶盖底
  const roofH = 0.30;
  const roofTop = roofY + roofH; // 1.70
  const finialTop = floorY + S.h; // 1.90 宝顶尖

  // ---- 轿底板 ----
  const floor = new THREE.BoxGeometry(boxW, 0.06, boxL);
  floor.translate(0, floorY + 0.03, 0);
  put(bin, 'wood', floor, PAL.darkWood, M);

  // ---- 四角柱（轿厢立柱 + 顶盖柱，一根到顶） ----
  const postH = roofY - floorY;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const p = new THREE.BoxGeometry(0.070, postH, 0.070);
      p.translate(
        sx * (boxW / 2 - 0.035), floorY + postH / 2, sz * (boxL / 2 - 0.035)
      );
      put(bin, 'wood', p, PAL.darkWood, M);
    }
  }

  // ---- 上下枋（四周的横枋） ----
  const railY = boxTop - 0.035;
  for (const sx of [-1, 1]) {
    const r = new THREE.BoxGeometry(0.055, 0.070, boxL - 0.07);
    r.translate(sx * (boxW / 2 - 0.035), railY, 0);
    put(bin, 'wood', r, PAL.darkWood, M);
  }
  for (const sz of [-1, 1]) {
    const r = new THREE.BoxGeometry(boxW - 0.07, 0.070, 0.055);
    r.translate(0, railY, sz * (boxL / 2 - 0.035));
    put(bin, 'wood', r, PAL.darkWood, M);
  }
  const sillY = floorY + 0.10;
  for (const sx of [-1, 1]) {
    const r = new THREE.BoxGeometry(0.050, 0.055, boxL - 0.07);
    r.translate(sx * (boxW / 2 - 0.035), sillY, 0);
    put(bin, 'wood', r, PAL.darkWood, M);
  }
  for (const sz of [-1, 1]) {
    const r = new THREE.BoxGeometry(boxW - 0.07, 0.055, 0.050);
    r.translate(0, sillY, sz * (boxL / 2 - 0.035));
    put(bin, 'wood', r, PAL.darkWood, M);
  }

  // ---- 棂格窗：真棂条几何（不是贴图） ----
  // 两侧长窗：竖棂 5 根 + 横棂 2 道
  const winY0 = sillY + 0.04;
  const winY1 = railY - 0.05;
  const winH = winY1 - winY0;
  const winYc = (winY0 + winY1) / 2;
  const bar = 0.022;
  for (const sx of [-1, 1]) {
    const x = sx * (boxW / 2 - 0.028);
    // 上下边梃
    for (const y of [winY0, winY1]) {
      const h = new THREE.BoxGeometry(0.034, 0.034, boxL - 0.20);
      h.translate(x, y, 0);
      put(bin, 'wood', h, PAL.wood, M);
    }
    // 竖棂
    for (let i = 0; i < 5; i++) {
      const z = (i / 4 - 0.5) * (boxL - 0.28);
      const v = new THREE.BoxGeometry(bar, winH, bar);
      v.translate(x, winYc, z);
      put(bin, 'wood', v, PAL.wood, M);
    }
    // 横棂
    for (let i = 1; i <= 2; i++) {
      const y = winY0 + (winH * i) / 3;
      const hbar = new THREE.BoxGeometry(bar, bar, boxL - 0.28);
      hbar.translate(x, y, 0);
      put(bin, 'wood', hbar, PAL.wood, M);
    }
  }
  // 前后门：竖棂 3 根 + 横棂 1 道
  for (const sz of [-1, 1]) {
    const z = sz * (boxL / 2 - 0.028);
    for (const y of [winY0, winY1]) {
      const h = new THREE.BoxGeometry(boxW - 0.20, 0.034, 0.034);
      h.translate(0, y, z);
      put(bin, 'wood', h, PAL.wood, M);
    }
    for (let i = 0; i < 3; i++) {
      const x = (i / 2 - 0.5) * (boxW - 0.30);
      const v = new THREE.BoxGeometry(bar, winH, bar);
      v.translate(x, winYc, z);
      put(bin, 'wood', v, PAL.wood, M);
    }
    const hbar = new THREE.BoxGeometry(boxW - 0.28, bar, bar);
    hbar.translate(0, winY0 + winH * 0.55, z);
    put(bin, 'wood', hbar, PAL.wood, M);
  }

  // ---- 下裙板：窗台以下补实板，轿厢才是个"厢"而不是一个架子 ----
  const skirtH = sillY - floorY;
  for (const sx of [-1, 1]) {
    const p = new THREE.BoxGeometry(0.040, skirtH, boxL - 0.09);
    p.translate(sx * (boxW / 2 - 0.030), floorY + skirtH / 2, 0);
    put(bin, 'cloth', p, PAL.vermilion, M);
  }
  for (const sz of [-1, 1]) {
    const p = new THREE.BoxGeometry(boxW - 0.09, skirtH, 0.040);
    p.translate(0, floorY + skirtH / 2, sz * (boxL / 2 - 0.030));
    put(bin, 'cloth', p, PAL.vermilion, M);
  }

  // ---- 垂帘：一条条垂下的布片，前黄罗侧蓝 ----
  const curtainStrips = 5;
  for (const sz of [-1, 1]) {
    const z = sz * (boxL / 2 + 0.035);
    for (let i = 0; i < curtainStrips; i++) {
      const x = (i / (curtainStrips - 1) - 0.5) * (boxW - 0.22);
      const c = new THREE.BoxGeometry((boxW - 0.22) / curtainStrips + 0.02, 0.60, 0.030);
      c.translate(x, railY - 0.34, z + (i % 2 ? 0.012 : -0.012));
      put(bin, 'cloth', c, PAL.moonWhite, M);
    }
  }
  for (const sx of [-1, 1]) {
    const x = sx * (boxW / 2 + 0.035);
    for (let i = 0; i < 4; i++) {
      const z = (i / 3 - 0.5) * (boxL - 0.26);
      const c = new THREE.BoxGeometry(0.030, 0.30, (boxL - 0.26) / 4 + 0.02);
      c.translate(x + (i % 2 ? 0.010 : -0.010), railY - 0.19, z);
      put(bin, 'cloth', c, PAL.indigo, M);
    }
  }

  // ---- 轿盖：收分攒尖（不是一块平板） ----
  const eaveW = boxW + 0.20;
  const eaveL = boxL + 0.20;
  const roof = loftRings(
    [
      { c: [0, roofY, 0], u: [eaveW / 2, 0, 0], v: [0, 0, eaveL / 2] },
      { c: [0, roofY + roofH * 0.42, 0], u: [eaveW / 2 - 0.20, 0, 0], v: [0, 0, eaveL / 2 - 0.20] },
      { c: [0, roofY + roofH * 0.78, 0], u: [eaveW / 2 - 0.38, 0, 0], v: [0, 0, eaveL / 2 - 0.38] },
      { c: [0, roofTop, 0], u: [eaveW / 2 - 0.50, 0, 0], v: [0, 0, eaveL / 2 - 0.50] },
    ],
    8,
    false,
    true
  );
  put(bin, 'cloth', roof, PAL.vermilion, M);
  // 檐口鎏金边
  for (const sx of [-1, 1]) {
    const e = new THREE.BoxGeometry(0.035, 0.030, eaveL);
    e.translate(sx * (eaveW / 2 - 0.012), roofY + 0.015, 0);
    put(bin, 'metal', e, PAL.gold, M);
  }
  for (const sz of [-1, 1]) {
    const e = new THREE.BoxGeometry(eaveW, 0.030, 0.035);
    e.translate(0, roofY + 0.015, sz * (eaveL / 2 - 0.012));
    put(bin, 'metal', e, PAL.gold, M);
  }
  // 盖角起翘（攒尖的四角小翘头）
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const tip = new THREE.ConeGeometry(0.016, 0.058, 4);
      tip.rotateZ(-sx * 0.62);
      tip.rotateX(sz * 0.62);
      tip.translate(sx * (eaveW / 2 - 0.050), roofY + 0.048, sz * (eaveL / 2 - 0.050));
      put(bin, 'metal', tip, PAL.gold, M);
    }
  }

  // ---- 鎏金宝顶（锥 + 珠 + 小尖，顶尖正好落在 1.90m） ----
  const finial = new THREE.ConeGeometry(0.098, 0.115, 8);
  finial.translate(0, roofTop + 0.058, 0);
  put(bin, 'metal', finial, PAL.brightGold, M);
  const knob = new THREE.SphereGeometry(0.040, 5, 3);
  knob.translate(0, roofTop + 0.125, 0);
  put(bin, 'metal', knob, PAL.gold, M);
  const spire = new THREE.ConeGeometry(0.017, finialTop - (roofTop + 0.160), 4);
  spire.translate(0, (roofTop + 0.160 + finialTop) / 2, 0);
  put(bin, 'metal', spire, PAL.brightGold, M);

  // ---- 轿杠（两根，沿行进方向，各 3.00m） ----
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
    // 杠头铜箍
    for (const sz of [-1, 1]) {
      const cap = new THREE.CylinderGeometry(0.052, 0.052, 0.070, 5);
      cap.rotateX(Math.PI / 2);
      cap.translate(x, S.poleY, sz * (S.poleLen / 2 - 0.035));
      put(bin, 'metal', cap, 0xa8863c, M);
    }
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
  // 轭木（套在牲口脖子上的横木）
  const yoke = new THREE.BoxGeometry(0.86, 0.075, 0.075);
  yoke.translate(0, deckY - 0.06, C.len / 2 + 1.40);
  put(bin, 'wood', yoke, PAL.darkWood, M);
  for (const sx of [-1, 1]) {
    const boss = new THREE.CylinderGeometry(0.055, 0.055, 0.090, 6);
    boss.rotateX(Math.PI / 2);
    boss.translate(sx * 0.30, deckY - 0.06, C.len / 2 + 1.40);
    put(bin, 'metal', boss, 0x8d8378, M);
  }
  // 辕木铁箍
  for (const dz of [0.40, 1.05]) {
    const band = new THREE.BoxGeometry(0.135, 0.115, 0.045);
    band.translate(0, deckY - 0.06, C.len / 2 + dz);
    put(bin, 'metal', band, 0x8d8378, M);
  }

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

  // 舷侧护木（压住船板的条木）
  for (const sx of [-1, 1]) {
    const rail2 = new THREE.BoxGeometry(0.035, 0.055, L * 0.66);
    rail2.translate(sx * W * 0.455, H * 0.62, 0);
    put(bin, 'wood', rail2, 0x8a6d47, M);
  }
  // 舱内横梁（座板）
  for (const dz of [-L * 0.18, L * 0.16]) {
    const thwart = new THREE.BoxGeometry(W * 0.86, 0.045, 0.20);
    thwart.translate(0, H * 0.86, dz);
    put(bin, 'wood', thwart, 0x7d6141, M);
  }
  // 乌篷（半圆篷）
  const canopy = new THREE.SphereGeometry(W * 0.46, 6, 4, 0, Math.PI * 2, 0, Math.PI * 0.5);
  canopy.scale(1, 0.78, 1);
  canopy.translate(0, H - 0.03, -L * 0.02);
  put(bin, 'cloth', canopy, PAL.canopy, M);
  // 篷骨
  for (const dz of [-L * 0.14, -L * 0.05, L * 0.04, L * 0.12]) {
    const rib = new THREE.TorusGeometry(W * 0.455, 0.020, 3, 8, Math.PI);
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

/**
 * 挑担货郎：扁担 + 两筐 + 筐中货。
 * 扁担**压在肩上**（不是浮在身侧）：x 取肩关节半宽，y 取肩点上方一点，
 * 与人物身体对得上；手也握在同一根扁担上。
 */
function addPorterKit(bin, M, g) {
  const s = g.s;
  const poleX = g.shoulderX; // 压在肩上
  const poleY = g.shoulderY + 0.075 * g.H; // 肩头顶面
  const poleA = new THREE.Vector3(poleX, poleY, -0.95 * s);
  const poleB = new THREE.Vector3(poleX, poleY, 0.95 * s);
  put(bin, 'wood', rod(poleA, poleB, 0.022 * s, 5), PAL.bamboo, M);
  // 肩垫（压肩的一块布）
  const pad = new THREE.BoxGeometry(0.085 * g.H, 0.030 * g.H, 0.120 * g.H);
  pad.translate(poleX, poleY - 0.022 * g.H, 0.02);
  put(bin, 'cloth', pad, PAL.sack, M);

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
function addRegalia(bin, M, kind, s, g) {
  const handX = g.shoulderX + 0.070 * g.H; // 执事伸臂持物的位置
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

/**
 * 障碍物：OSM 现状建筑 + 四十景主/配建筑 + 西洋楼 + 假山
 *
 * 四十景的台基与踏跺比建筑体本身大（须弥座外挑 1.25m×2，
 * 踏跺再往南伸约 3.3m），人若站在台基里会被"埋进地里"，
 * 所以主/配建筑的南侧留得比北侧宽。
 */
function makeObstacles(sceneData) {
  const boxes = [];
  const circles = [];
  /** hw = 东西半宽；hdN/hdS = 北/南半深 */
  const pushBox = (x, z, hw, hdN, hdS) =>
    boxes.push({ x0: x - hw, x1: x + hw, z0: z - hdN, z1: z + hdS });

  for (const b of sceneData.buildings || []) {
    if (!b.ring || b.ring.length < 3) continue;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of b.ring) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    pushBox(
      (minX + maxX) / 2, (minZ + maxZ) / 2,
      (maxX - minX) / 2 + 1.0, (maxZ - minZ) / 2 + 1.0, (maxZ - minZ) / 2 + 1.0
    );
  }

  for (const s of sceneData.scenes || []) {
    const p = SCENE_PROGRAM[s.name];
    if (!p) continue;
    // 主建筑（须弥座外挑 2.5m，踏跺再往南 3.4m）
    const mw = (p.main.mian * 3.6) / 2 + 3.2;
    const mdN = (p.main.jin * 3.3) / 2 + 3.0;
    const mdS = (p.main.jin * 3.3) / 2 + 4.2;
    pushBox(s.x, s.z, mw, mdN, mdS);
    // 配建筑（素台基外挑 0.95m，踏跺往南 3.3m）
    for (const a of p.aux || []) {
      const af = defaultForm(a.rank);
      const mian = a.mian ?? af.mian;
      const jin = a.jin ?? af.jin;
      const w = (mian * (a.rank === 'pavilion' ? 3.0 : 3.5)) / 2 + 1.9;
      const dN = (jin * 3.2) / 2 + 1.9;
      const dS = (jin * 3.2) / 2 + 3.6;
      pushBox(s.x + a.x, s.z + a.z, w, dN, dS);
    }
  }

  for (const w of sceneData.westBuildings || []) {
    pushBox(w.x, w.z, 14, 14, 14);
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

/** 数量配置（皇家园林游人不算多；马轿约为人数的 1/12） */
const COUNT = {
  commoner: 172, // 游人（散在路径上 + 四十景前庭）
  official: 18, // 戴翎顶帽的品官
  sedan: 12, // 轿舆（各配两名轿夫）
  horse: 9, // 马
  porter: 28, // 挑担货郎
  guard: 16, // 仪仗执事（4 景 × 4 人）
  cart: 6, // 板车
  boat: 16, // 小船
};

/** 只有这几景配銮驾（品级最高的中轴几景） */
const REGALIA_SCENES = ['正大光明', '九州清晏', '勤政亲贤', '鸿慈永祜'];

export function buildFigures(sceneData, heightAt) {
  const group = new THREE.Group();
  group.name = 'figures';

  const rnd = mulberry32(0x51f1a7c3); // 固定种子：同一份 scene.json 每次生成一致
  /**
   * 姿态抖动用**另一条随机流**：摆位（rnd）与姿态（poseRnd）分开，
   * 这样改姿态不会连带改掉全园人物的位置。仍然是确定性的，不用 Math.random()。
   */
  const poseRnd = mulberry32(0x51a7f16);
  const nextPose = (kind) => {
    const p = {
      lean: (poseRnd() - 0.5) * 0.10, // 前后倾
      side: (poseRnd() - 0.5) * 0.07, // 左右倾
      headYaw: (poseRnd() - 0.5) * 0.80, // 转头
      armSwing: (poseRnd() - 0.5) * 0.045, // 两臂前后错落
      armMode: 'down',
    };
    if (kind === 'commoner') {
      const r = poseRnd();
      p.armMode = r < 0.20 ? 'carry' : 'down';
    }
    return p;
  };
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
  // 摆放台账：父级可用 group.userData.figures 自查位置
  const records = [];
  const rec = (kind, x, z, y, r) => records.push({ kind, x, z, y, r });

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

  /**
   * 距最近的四十景中心是否小于 minDist。
   * 规则 6 要求"人/马/轿避开景中心 18m"——对**路径上的散撒**严格执行；
   * 但规则 3/5 又要求货郎、官员、执事就站在台阶前，
   * 那是有意为之的近景，不受此限（真正的硬约束是"不压建筑"，已用足迹精确判定）。
   */
  const sceneCenters = (sceneData.scenes || []).map((s) => ({ x: s.x, z: s.z }));
  const nearScene = (x, z, minDist) => {
    for (const c of sceneCenters) {
      const dx = c.x - x, dz = c.z - z;
      if (dx * dx + dz * dz < minDist * minDist) return true;
    }
    return false;
  };
  const SCENE_KEEPOUT = 18;

  /** 把点贴到附近游廊的柱位上（廊下的人踩在廊地坪） */
  const snapCorridor = (x, z) => {
    const st = corridors.nearest(x, z);
    if (!st) return null;
    return st;
  };

  /* ================================================================
   * A. 游人 —— 路径上成小簇散布
   * ================================================================ */
  const COMMONER_ON_PATH = 102;
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
      // 规则 6：路径上的散撒游人避开景中心 18m
      if (nearScene(x, z, SCENE_KEEPOUT)) continue;
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
          pose: nextPose('commoner'),
        });
      } else {
        addPerson(bin, M, {
          height: DIM.man,
          robe: COMMONER_COLORS[Math.floor(rnd() * COMMONER_COLORS.length)],
          hat: 'gua',
          skin: rnd() < 0.5 ? PAL.skin : PAL.skinDark,
          pose: nextPose('commoner'),
        });
      }
      placed++;
      stats.commoner++;
      rec('commoner', x, z, groundY, 0.55);
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
      if (stats.commoner >= COUNT.commoner) break;
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
            pose: nextPose('commoner'),
          });
        } else {
          addPerson(bin, M, {
            height: DIM.man,
            robe: COMMONER_COLORS[Math.floor(rnd() * COMMONER_COLORS.length)],
            hat: 'gua', skin: PAL.skin,
            pose: nextPose('commoner'),
          });
        }
        stats.commoner++;
        rec('commoner', fx, fz, H(fx, fz), 0.55);
        break;
      }
    }
    // 货郎（挑担）：台阶附近
    if (stats.porter >= COUNT.porter) continue;
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
        // 一手扶扁担（担子压在肩上，手不能空垂）
        arms: 'one',
        handX: (SHOULDER_X_RATIO + 0.020) * DIM.porter,
        handY: DIM.porter * (0.788 + 0.075),
        handZ: 0.13,
        pose: nextPose('porter'),
      });
      addPorterKit(bin, M, g);
      stats.porter++;
      rec('porter', fx, fz, H(fx, fz), 0.7);
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
          pose: nextPose('official'),
        });
        stats.official++;
        rec('official', fx, fz, H(fx, fz), 0.8);
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
          // 一手抬起持伞/持旗（手的位置与道具杆重合）
          arms: 'one',
          handX: (SHOULDER_X_RATIO + REACH_RATIO) * DIM.guard,
          handY: kind === 'fan' ? 1.30 : 1.56,
          handZ: 0.06,
          pose: nextPose('guard'),
        });
        addRegalia(bin, M, kind, g.s, g);
        stats.guard++;
        rec('guard', fx, fz, H(fx, fz), 0.9);
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
      if (nearScene(qx, qz, SCENE_KEEPOUT)) { ok = false; break; }
    }
    if (!ok) continue;
    for (const [qx, qz] of probe) occ.take(qx, qz, 1.9);

    const M = new THREE.Matrix4().compose(
      new THREE.Vector3(pt.x, H(pt.x, pt.z), pt.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
      new THREE.Vector3(1, 1, 1)
    );
    addSedan(bin, M);

    // 前后各一名轿夫：人站在**轿杠两端**，杠压在肩上、双手各握一根。
    // （原来人站在轿厢正中、只在原地伸手，轿厢把人整个吞掉了。）
    for (const side of [1, -1]) {
      const bx = pt.x + nx * side * 1.45;
      const bz = pt.z + nz * side * 1.45;
      const Mb = new THREE.Matrix4().compose(
        new THREE.Vector3(bx, H(bx, bz), bz),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
        new THREE.Vector3(1, 1, 1)
      );
      addPerson(bin, Mb, {
        height: DIM.bearer,
        robe: PAL.darkBrown,
        hat: 'gua',
        skin: PAL.skinDark,
        arms: 'up',
        handX: DIM.sedan.poleX,
        handY: DIM.sedan.poleY,
        handZ: 0.02,
        pose: nextPose('bearer'),
      });
      stats.bearer++;
      rec('bearer', bx, bz, H(bx, bz), 1.9);
    }
    sedanCount++;
    stats.sedan++;
    rec('sedan', pt.x, pt.z, H(pt.x, pt.z), 1.9);
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
    if (nearScene(ox, oz, SCENE_KEEPOUT)) continue;
    occ.take(ox, oz, 1.7);
    const M = new THREE.Matrix4().compose(
      new THREE.Vector3(ox, H(ox, oz), oz),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
      new THREE.Vector3(1, 1, 1)
    );
    addHorse(bin, M);
    horseCount++;
    stats.horse++;
    rec('horse', ox, oz, H(ox, oz), 1.7);
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
    if (nearScene(ox, oz, SCENE_KEEPOUT)) continue;
    occ.take(ox, oz, 2.0);
    const M = new THREE.Matrix4().compose(
      new THREE.Vector3(ox, H(ox, oz), oz),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
      new THREE.Vector3(1, 1, 1)
    );
    addCart(bin, M);
    cartCount++;
    stats.cart++;
    rec('cart', ox, oz, H(ox, oz), 2.0);
  }

  /* ================================================================
   * H. 小船 —— 只放在水面内部，且贴岸
   *
   * 注意：园内水面是**按水位开凿**出来的（build-scene.mjs），
   * 剖面是 level - depth*(1 - d^2.2)，越靠岸越浅，岸边一格地面
   * 几乎与水面齐平。所以"贴岸"不能只按环偏移 1~2m——
   * 必须沿岸法线**向内步进**，直到脚下地面真的低于水面。
   * ================================================================ */
  const waterPolys = (sceneData.water || [])
    .filter((w) => w.ring && w.ring.length > 3 && polyArea(w.ring) > 2500);
  let boatCount = 0;
  let boatTry = 0;
  while (boatCount < COUNT.boat && boatTry < 2400) {
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

    // 沿岸法线向内步进，找到第一处"脚下确实在水下"的点
    let bx = null;
    let bz = null;
    for (let d = 1.0; d <= 90; d += 0.8) {
      const tx2 = px + nx * d;
      const tz2 = pz + nz * d;
      if (!pointInRing(tx2, tz2, ring)) break;
      if (H(tx2, tz2) < w.level - 0.30) {
        bx = tx2;
        bz = tz2;
        break;
      }
    }
    if (bx === null) continue;

    const len = DIM.boat.lenMin + rnd() * (DIM.boat.lenMax - DIM.boat.lenMin);
    // 不与岸线/其它船打架
    if (!occ.free(bx, bz, 2.4)) continue;
    occ.take(bx, bz, 2.4);

    const yaw = Math.atan2(tx, tz);
    const M = new THREE.Matrix4().compose(
      new THREE.Vector3(bx, w.level - 0.12, bz), // 船身吃水 0.12m
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)),
      new THREE.Vector3(1, 1, 1)
    );
    addBoat(bin, M, len);
    boatCount++;
    stats.boat++;
    rec('boat', bx, bz, w.level - 0.12, 2.4);
  }

  /* ---- 合并出 Mesh ---- */
  group.userData.figures = records;
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

/* ================================================================== *
 * 十二、诊断导出
 *
 * 供离线几何检查脚本（逐件测三角面/包围盒/NaN）使用。
 * 运行时（main.js）只用 buildFigures，不受影响，draw call 仍是 4。
 * ================================================================== */
export { Bin, MATS, addPerson, addHat, addArms, addHorse, addSedan, addCart, addBoat };
