/**
 * 游廊（廊）
 *
 * 圆明园最具辨识度的构件之一：15 条游廊、总长 8481 m。
 *
 * ================================================================
 * 形制依据（清式园林游廊）—— **除注明外均为推定**
 * ================================================================
 *   · 廊宽（柱心距）2.7 m，柱高 2.85 m，柱径 0.22 m（≈ 柱高 1/13）
 *   · 屋面：**卷棚**（两坡相接、无正脊，脊部圆缓），小青瓦
 *   · 檐口：**瓦当 + 滴水**（一垄一个），檐下露**椽头**一排
 *   · 额枋上施**彩画**（旋子），额枋下悬**挂落**
 *   · 一侧设**美人靠**：棂条靠背 + 坐凳 + 鹅颈扶手
 *   · 地墁**条石**，石缝可见；柱下有**覆盆式柱础**
 *
 * ⚠ 依据说明：`data/research/architecture-notes.md` 只考据了四十景的
 *   殿宇形制，**没有**关于游廊的逐条记载。以上游廊形制按《工程做法》
 *   园林小式游廊的通行做法**推定**，不是圆明园游廊的实测复原。
 *   游廊不设斗栱（素式小式），故本文件不建斗栱 —— 免得凭空添制度。
 *
 * ================================================================
 * 建模原则（AGENTS.md §4.1：建模比贴图精细度高得多）
 * ================================================================
 * 筒瓦垄、瓦当、滴水、椽头、望板、挂落棂条、美人靠棂条、
 * 覆盆柱础 —— 全部是**实体几何**；贴图只负责连续表面（苔痕、砖缝、木纹）。
 *
 * ================================================================
 * 本轮修复（2026-10-30）
 * ================================================================
 *  1. **NaN 几何**：`sampleAt()` 没把 y 带出来，`buildEaveTileBand()`
 *     却拿 `p.y` 算檐口高度 → 整条瓦当滴水带全是 NaN，合并进
 *     `corridor-roof` 后整个屋面 Mesh 的包围盒都是 NaN（探针实测）。
 *     连带后果：**瓦当滴水整条看不见**（NaN 顶点被丢弃）。
 *  2. **瓦当与筒瓦垄对不上**：瓦当带用的垄距 0.4265 ≠ 屋面实际垄距
 *     0.386，瓦当骑在两垄之间。改为直接取屋面断面的实际垄距。
 *  3. **瓦当带的高度算了两遍**（`floorH + LV.eave` 重复叠加）。
 *  4. **发白/过曝**：柱、彩画、条石三个材质都没有固有色压档，
 *     在太阳 2.6 + 半球光 0.85 下柱身被打成粉红、条石打成白水泥。
 *     本文件克隆一份材质并单独压档（不动 `buildings/materials.js`）。
 *  5. **椽头 / 瓦当滴水只给 2 条长廊做**，其余 13 条是光板檐口。
 *     改为按长度分级，全部游廊都有瓦当滴水 + 椽头。
 *  6. **美人靠穿过柱子**（截图实测：棕色的横杆从红柱里穿出去）。
 *     把美人靠整体内移，让开柱身内侧。
 *  7. **柱础是方锥墩**，不是覆盆。改成带圆转收分的旋子。
 *  8. **屋面底下是空的**：瓦面是单层带，从下往上看穿到天上。
 *     补**望板**（屋面之下的铺板）。
 *  9. 补**挂落**（额枋下的棂条），补**檐檩与额枋的竖向关系**。
 *
 * ================================================================
 * 性能
 * ================================================================
 * 整层按材质合并成 **5 个 Mesh**（roof / wood / caihua / column / stone）。
 * ⚠ AGENTS.md §4 写的是"4 个 Mesh"，那是**彩画桶加入之前**的数字
 *   （见 git log：4 桶 → 5 桶发生在 dee830e，AGENTS.md 未同步）。
 *   五个桶对应五张**互不相同**的贴图（瓦 / 木 / 彩画 / 柱漆 / 石），
 *   合并成 4 桶就必须牺牲其中一种材质。这里保留 5 桶并如实记录。
 *
 *   三角面增量用两级 LOD 控制：
 *     A 级（≥900 m）：椽距 0.45 m、飞椽、挂落密、覆盆 8 边
 *     B 级（≥300 m）：椽距 0.70 m、无飞椽、挂落疏、覆盆 6 边
 *     C 级（<300 m）：椽距 0.95 m、挂落最疏、覆盆 6 边
 *   两级之间**屋面、额枋、地坪完全一致**，视觉上连续。
 *
 * 屋面按"截面挤出"生成：一垄半圆管就是截面里的 4 个点，
 * 一次挤出整条长廊 —— 比逐个建瓦片省一个数量级的面数。
 * ================================================================
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  roofMaterial,
  columnMaterial,
  caihuaMaterial,
  woodMaterial,
  stoneMaterial,
} from './buildings/materials.js';

/* ==================================================================
 * 尺度常量（推定，见文件头）
 * ================================================================== */
const CORRIDOR = {
  width: 2.7, // 柱心距（= 廊宽）
  colH: 2.85, // 柱高：自柱础顶面至柱头
  colDia: 0.22, // 柱径
  step: 1.8, // 步架（柱距）
  roofRise: 0.72, // 卷棚顶：檐口至脊高差
  overhang: 0.35, // 出檐（自柱心线外挑）
  // 地坪比地面高多少。
  //
  // ⚠ 原来只有 0.16m —— 台基几乎贴着地面，游廊的柱看上去是**直接插在草地里**，
  // 没有"建筑坐在石台上"的分量。真实游廊台基 0.4~0.6m，
  // 有了这个高度差，从岸上看过去才是一条**架起的廊**而不是一排栅栏。
  floorH: 0.45,
  gang: 0.386, // 瓦垄距（名义值；实际按屋面坡长均分，见 roofProfile）
  tongR: 0.11, // 筒瓦半径
  baseH: 0.16, // 柱础总高（方础 + 覆盆）
  fillet: 2.8, // 转角圆角半径（必须 > 出檐半宽，否则内角翻折）
  spring: 0.3, // 卷棚脊部圆缓段半宽
  eaveTile: 0.105, // 瓦当半径
  board: 0.075, // 望板厚（瓦面到望板底的距离）
  rafterR: 0.055, // 椽头半径（清式官式为圆椽）
  gualuo: 0.34, // 挂落高
};

/* 竖向分层（相对地坪面 F = 地面 + floorH）
 * 关系：额枋坐在柱头 → 檐檩压在额枋挑头上 → 椽压在檐檩上 →
 *       瓦面在椽之上 → 瓦口（檐口）在 EAVE_U 处
 */
const LV = {
  baseTop: CORRIDOR.baseH, // 柱础顶 0.16
  colTop: CORRIDOR.baseH + CORRIDOR.colH, // 柱头 3.01
  fangTop: 3.27, // 额枋顶（含挑头）
  ceil: 3.27, // 廊内平顶（吊顶）—— 与额枋顶齐平，两侧正好接在额枋内面上
  purlinTop: 3.49, // 檐檩顶
  eave: 3.55, // 檐口（瓦面外沿）
};

/* 路径采样步距（沿弧长） */
const STEP = {
  floor: 1.2, // 地坪条石
  bay: CORRIDOR.step, // 柱位（步架）
  beam: 3.6, // 纵向杆件（额枋/檐檩/美人靠）
  roof: 4.5, // 屋面
  fine: 0.9, // 细部（美人靠棂条、椽头）
};

/* LOD 分级：按游廊长度 */
const LEVELS = [
  { min: 900, rafter: 0.45, fly: true, gualuo: 0.42, baseSeg: 8, colSeg: 12, mr: 0.32 },
  { min: 300, rafter: 0.7, fly: false, gualuo: 0.55, baseSeg: 6, colSeg: 10, mr: 0.5 },
  { min: 0, rafter: 0.95, fly: false, gualuo: 0.75, baseSeg: 6, colSeg: 8, mr: 0.7 },
];

function levelFor(len) {
  for (const L of LEVELS) if (len >= L.min) return L;
  return LEVELS[LEVELS.length - 1];
}

const HALF = CORRIDOR.width / 2; // 1.35 柱心半距
const EAVE_U = HALF + CORRIDOR.overhang; // 1.70 檐口外沿
/* 美人靠 / 挂落要落在柱身**内侧**（柱半径 0.11 → 柱内面在 1.24），
   否则横杆会从柱子里穿出去（截图实测过的硬伤）。 */
const INNER_U = HALF - 0.13; // 1.22

/* ==================================================================
 * 材质
 * ================================================================== */
function corridorMaterials() {
  // 本文件里的构件都是"清式小式"，颜色比官式殿宇淡；
  // 但真正的问题是**过曝**：太阳 2.6 + 半球光 0.85 + IBL，
  // 固有色接近白的构件会直接被打爆（柱身 → 粉红、条石 → 白水泥）。
  // `buildings/materials.js` 里给屋面/木/石都加了压档色，柱与彩画没有；
  // 这里克隆一份并单独压档 —— 只改本文件，不动公共材质库。
  const roof = roofMaterial(false).clone();
  roof.side = THREE.DoubleSide;
  // 压档色：游廊自己的屋面色。
  //
  // ⚠ 原来这里压到 0x545860（linear ≈ 0.09），比材质库的青瓦还暗 ——
  // 背光的屋面直接渲成**纯黑**，整条游廊顶看着像一条黑带子。
  // 材质库已经调到了合理的 0x6e7176（linear ≈ 0.16），
  // 这里跟着它，不要再压一档。
  roof.color.setHex(0x6e7176);

  const column = columnMaterial('#a8302a').clone();
  // 朱红柱身：真实清式柱是**饱和的朱红**，不是粉红。
  // 原来压到 0xb07c73 —— 红多绿蓝也多，颜色发粉（"塑料红"）。
  // 要压的是**明度**不是色相：三个通道同比例压下去，饱和度保持。
  column.color.setHex(0x9e3c33);

  const caihua = caihuaMaterial('xuanzi').clone();
  // 青地（#1f6b6b）直接用会在阳光下变成泳池蓝，压一档并往冷灰走
  caihua.color.setHex(0x8c9ea0);

  const wood = woodMaterial().clone();
  // 薄木件（椽头/挂落/美人靠）双面，否则背光面整片消失
  wood.side = THREE.DoubleSide;
  wood.color.setHex(0x9b9088);

  const stone = stoneMaterial().clone();
  // 条石压一档：AI 石材贴图自带白色石脉，不压会亮得像大理石
  stone.color.setHex(0x8b877e);

  const mats = { roof, wood, caihua, column, stone };

  // DEBUG（临时）：?corr=roof/wood/… 给某个材质桶染色，用来定位是哪一层几何
  const dbg = new URLSearchParams(location.search).get('corr');
  if (dbg && mats[dbg]) {
    const C = { roof: 0xff00ff, wood: 0x00ffff, caihua: 0xffff00, column: 0xff8000, stone: 0x0080ff };
    const t = mats[dbg];
    t.color.setHex(C[dbg]);
    t.emissive.setHex(C[dbg]);
    t.emissiveIntensity = 0.6;
  }
  return mats;
}

/* ==================================================================
 * 路径工具
 * ================================================================== */

/** 去掉几乎重合的点 */
function dedupe(pts, minD = 0.08) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    const q = out[out.length - 1];
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) > minD) out.push(p);
  }
  return out;
}

/**
 * 折线转圆角路径。
 *
 * 游廊在折线处是直角转弯，屋面若直接沿折线挤出，内角会**翻折**成
 * 一个尖刺、外角则豁开一道口子（AGENTS.md §4.1「不能出现豁口或穿插」）。
 * 这里把每个转角替换成一段圆弧：圆弧半径 > 出檐半宽时，内侧曲率
 * 半径仍为正，挤出不会翻折。
 *
 * 形制简化：真实廊子的转角多做成转角亭/角楼；此处用圆弧过渡。
 */
function filletPath(pts, radius) {
  const out = [{ x: pts[0][0], z: pts[0][1] }];
  for (let i = 1; i < pts.length - 1; i++) {
    const P = pts[i];
    const A = pts[i - 1];
    const B = pts[i + 1];
    const v1x = A[0] - P[0];
    const v1z = A[1] - P[1];
    const v2x = B[0] - P[0];
    const v2z = B[1] - P[1];
    const l1 = Math.hypot(v1x, v1z);
    const l2 = Math.hypot(v2x, v2z);
    if (l1 < 1e-6 || l2 < 1e-6) continue;
    const dIn = { x: v1x / l1, z: v1z / l1 }; // P → A
    const dOut = { x: v2x / l2, z: v2z / l2 }; // P → B
    const v1 = { x: -dIn.x, z: -dIn.z }; // 行进方向（进入转角）
    const v2 = dOut;
    const cross = v1.x * v2.z - v1.z * v2.x;
    const cosT = Math.max(-1, Math.min(1, v1.x * v2.x + v1.z * v2.z));
    const theta = Math.acos(cosT);
    if (theta < 0.12 || Math.abs(cross) < 1e-6) {
      out.push({ x: P[0], z: P[1] });
      continue;
    }
    const sgn = cross > 0 ? 1 : -1;
    const n1x = -v1.z;
    const n1z = v1.x;
    const n2x = -v2.z;
    const n2z = v2.x;
    let bx = sgn * (n1x + n2x);
    let bz = sgn * (n1z + n2z);
    const bl = Math.hypot(bx, bz) || 1;
    bx /= bl;
    bz /= bl;
    const R = radius;
    const dist = R / Math.sin(theta / 2); // 圆心到 P
    const tanT = R * Math.tan(theta / 2); // 切点距 P
    const Cx = P[0] + bx * dist;
    const Cz = P[1] + bz * dist;
    const T1x = P[0] + dIn.x * tanT;
    const T1z = P[1] + dIn.z * tanT;
    const T2x = P[0] + dOut.x * tanT;
    const T2z = P[1] + dOut.z * tanT;
    const a1 = Math.atan2(T1z - Cz, T1x - Cx);
    const a2 = Math.atan2(T2z - Cz, T2x - Cx);
    let da = a2 - a1;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    const steps = Math.max(2, Math.ceil(Math.abs(da) / (Math.PI / 7)));
    for (let k = 0; k <= steps; k++) {
      const a = a1 + (da * k) / steps;
      out.push({ x: Cx + Math.cos(a) * R, z: Cz + Math.sin(a) * R });
    }
  }
  out.push({ x: pts[pts.length - 1][0], z: pts[pts.length - 1][1] });
  return out;
}

/**
 * 沿折线按固定步距重采样；**保留所有折点**，
 * 保证转角处不被拉直（否则屋面会在弯道内侧豁开）。
 */
function resamplePath(poly, step) {
  const out = [];
  let s = 0;
  let nextS = 0;
  for (let i = 0; i < poly.length - 1; i++) {
    const a = poly[i];
    const b = poly[i + 1];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    if (L < 1e-6) continue;
    const dx = (b.x - a.x) / L;
    const dz = (b.z - a.z) / L;
    while (nextS < s + L - 1e-6) {
      const t = nextS - s;
      out.push({ x: a.x + dx * t, z: a.z + dz * t, s: nextS });
      nextS += step;
    }
    s += L;
    out.push({ x: b.x, z: b.z, s });
  }
  return out;
}

/** 给路径点补上切向、左法线与地面高 */
function withFrames(pts, heightAt) {
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b.x - a.x;
    let dz = b.z - a.z;
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    pts[i].tx = dx;
    pts[i].tz = dz;
    pts[i].nx = -dz; // 左法线 = 局部 +u 方向
    pts[i].nz = dx;
    pts[i].y = heightAt ? heightAt(pts[i].x, pts[i].z) ?? 0 : 0;
  }
  return pts;
}

/* ==================================================================
 * 通用几何工具
 * ================================================================== */

/** 闭合轮廓是否逆时针（鞋带面积 > 0）—— 决定挤出面绕向 */
function profileCCW(profile) {
  let a = 0;
  for (let i = 0; i < profile.length; i++) {
    const p = profile[i];
    const q = profile[(i + 1) % profile.length];
    a += p.u * q.h - q.u * p.h;
  }
  return a > 0;
}

/**
 * 把一条闭合的横截面轮廓沿路径挤成带状几何。
 *
 * 轮廓的绕向自动判定（顺时针的轮廓会翻转面绕向），
 * 否则同一个断面在左右两侧会一个正一个反 —— 面被背面剔除，
 * 构件就"消失"了。
 *
 * @param profile [{u,h,v}] u=横向偏移（沿左法线），h=相对路径点的高度，v=贴图纵向
 * @param path    [{x,z,y,nx,nz,s}]
 */
function extrudeProfile(profile, path, opts = {}) {
  const { uScale = 1, capStart = false, capEnd = false } = opts;
  const n = path.length;
  const m = profile.length;
  const ccw = profileCCW(profile);
  const pos = [];
  const uv = [];
  const idx = [];

  for (let i = 0; i < n; i++) {
    const p = path[i];
    const su = p.s * uScale;
    for (let j = 0; j < m; j++) {
      const q = profile[j];
      pos.push(p.x + p.nx * q.u, p.y + q.h, p.z + p.nz * q.u);
      uv.push(su, q.v);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < m; j++) {
      const j2 = (j + 1) % m;
      const a = i * m + j;
      const b = i * m + j2;
      const c = (i + 1) * m + j;
      const d = (i + 1) * m + j2;
      if (ccw) idx.push(a, c, b, b, c, d);
      else idx.push(a, b, c, b, d, c);
    }
  }
  // 两端封口（廊子端头不至于露出空壳）
  if (capStart) {
    const base = pos.length / 3;
    for (let j = 0; j < m; j++) {
      const q = profile[j];
      const p = path[0];
      pos.push(p.x + p.nx * q.u, p.y + q.h, p.z + p.nz * q.u);
      uv.push(0, q.v);
    }
    for (let j = 1; j < m - 1; j++) {
      if (ccw) idx.push(base, base + j + 1, base + j);
      else idx.push(base, base + j, base + j + 1);
    }
  }
  if (capEnd) {
    const base = pos.length / 3;
    const p = path[n - 1];
    for (let j = 0; j < m; j++) {
      const q = profile[j];
      pos.push(p.x + p.nx * q.u, p.y + q.h, p.z + p.nz * q.u);
      uv.push(p.s * uScale, q.v);
    }
    for (let j = 1; j < m - 1; j++) {
      if (ccw) idx.push(base, base + j, base + j + 1);
      else idx.push(base, base + j + 1, base + j);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 用正交基摆放一个盒子（局部 x/y/z 分别沿 ex/ey/ez） */
function orientedBox(sx, sy, sz, ex, ey, ez, px, py, pz) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  g.applyMatrix4(rightHanded(ex, ey, ez));
  g.translate(px, py, pz);
  return g;
}

/** 用正交基摆放一个圆柱（轴沿 ey） */
function orientedCylinder(r, len, seg, ex, ey, ez, px, py, pz) {
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, false);
  g.applyMatrix4(rightHanded(ex, ey, ez));
  g.translate(px, py, pz);
  return g;
}

/**
 * 造一个**右手**正交基。
 *
 * makeBasis 只管填矩阵，不查手性；传进左手系会把法线镜像掉，
 * 构件看着"凹进去"或者整片变背面。左右两侧的 u 方向相反，
 * 很容易踩这个坑 —— 这里统一按叉乘修正。
 */
function rightHanded(ex, ey, ez) {
  const e = new THREE.Vector3().crossVectors(ex, ey);
  const x = e.dot(ez) < 0 ? ex.clone().negate() : ex.clone();
  return new THREE.Matrix4().makeBasis(x, ey, ez);
}

const V_UP = new THREE.Vector3(0, 1, 0);

/* ==================================================================
 * 屋面：卷棚截面（半圆筒瓦垄）
 * ================================================================== */

/**
 * 贴图约定 —— 必须与 `buildings/parts/roof.js` 严格一致，
 * 否则屋面会变成一张"花地毯"（AGENTS.md §4.1.1 已踩过的坑）：
 *
 *   · 贴图 U = **横向**：6 垄 / 循环 → 一垄瓦占 1/6 个循环，
 *     垄与垄之间落在循环边界（暗）。
 *   · 贴图 V = **沿瓦垄方向**：1 循环 = 1.5 m（= 6 层瓦当），
 *     所以 V = 沿坡距离 × (1/1.5)。
 *
 * ⚠ 之前这里写的是"沿坡距离 × 4"——比实际密度高 **6 倍**：
 *   一层瓦当只有 4 cm，屏幕上糊成一片噪点，贴图等于没贴，
 *   屋面只剩一层塑料似的光滑圆垄。
 */
const V_PER_M = 1 / 1.5;

/**
 * 卷棚屋面横截面 —— 拆成**三段**：
 *
 *   左坡（檐口 → 起翘点）/ 卷棚脊（圆弧）/ 右坡（起翘点 → 檐口）
 *
 * 为什么要拆：卷棚脊是一段**独立的构件**（瓦垄在这里翻过脊顶），
 * 它的贴图方向和坡面**转了 90°**：
 *   坡面上 —— U 横向、V 沿坡；
 *   脊上   —— U 沿脊长、V 横跨脊（瓦垄翻过脊顶的方向）。
 * 合成一条带子的话，脊那一段的 U 只能是常数 → 整条脊采样贴图的
 * **同一列**，糊成一条颜色均匀的亮带（"白屋顶"就是这么来的）。
 */
function roofProfile() {
  const W = EAVE_U;
  const rise = CORRIDOR.roofRise;
  const spring = CORRIDOR.spring;

  // 解坡角 α：使圆弧（半径 R，圆心在脊中轴上）与两坡相切
  //   f(α) = (W-spring)·tanα - rise + spring·tan(α/2) = 0
  let lo = 0.05;
  let hi = 1.2;
  for (let i = 0; i < 48; i++) {
    const a = (lo + hi) / 2;
    const f = (W - spring) * Math.tan(a) - rise + spring * Math.tan(a / 2);
    if (f > 0) hi = a;
    else lo = a;
  }
  const alpha = (lo + hi) / 2;
  const R = spring / Math.sin(alpha);
  const yc = rise - R; // 脊弧圆心（相对檐口）
  const yS = yc + R * Math.cos(alpha); // 起翘点高度
  const Ls = Math.hypot(W - spring, yS); // 单坡长
  const ribN = Math.max(2, Math.round(Ls / CORRIDOR.gang));
  const spacing = Ls / ribN;
  const R0 = CORRIDOR.tongR;

  const left = [];
  const roll = [];
  const right = [];
  const push = (arr, u, h, tu, tv) => arr.push({ u, h, tu, tv });

  // ---- 左坡：檐口 (-W,0) → 起翘点 (-spring,yS) ----
  // 瓦垄自檐口向脊排；V = 离脊距离（贴图循环数）
  const dLx = Math.cos(alpha);
  const dLy = Math.sin(alpha);
  const nLx = -Math.sin(alpha);
  const nLy = Math.cos(alpha);
  push(left, -W, 0, 0, Ls * V_PER_M);
  for (let i = 0; i < ribN; i++) {
    const d = (i + 0.5) * spacing;
    for (const phi of [-90, -30, 30, 90]) {
      const rad = (phi * Math.PI) / 180;
      const t = (phi + 90) / 180;
      const along = d + R0 * Math.sin(rad);
      const outw = R0 * Math.cos(rad);
      push(
        left,
        -W + dLx * along + nLx * outw,
        dLy * along + nLy * outw,
        (i + t) / 6,
        (Ls - d) * V_PER_M
      );
    }
  }
  push(left, -spring, yS, ribN / 6, 0);

  // ---- 脊部圆缓段（卷棚无正脊）----
  // V = 翻卷弧长（瓦垄从左坡翻过脊顶到右坡）
  const b1 = Math.atan2(yS - yc, -spring);
  const b2 = Math.atan2(yS - yc, spring);
  const arcLen = R * (b2 - b1);
  const steps = 4;
  for (let k = 0; k <= steps; k++) {
    const b = b1 + ((b2 - b1) * k) / steps;
    push(roll, Math.cos(b) * R, yc + Math.sin(b) * R, 0, (arcLen * k * V_PER_M) / steps);
  }

  // ---- 右坡：起翘点 (spring,yS) → 檐口 (W,0) ----
  const dRx = Math.cos(alpha);
  const dRy = -Math.sin(alpha);
  const nRx = Math.sin(alpha);
  const nRy = Math.cos(alpha);
  push(right, spring, yS, ribN / 6, 0);
  for (let i = 0; i < ribN; i++) {
    const d = (i + 0.5) * spacing;
    for (const phi of [90, 30, -30, -90]) {
      const rad = (phi * Math.PI) / 180;
      const t = (1 - phi) / 180;
      const along = d + R0 * Math.sin(rad);
      const outw = R0 * Math.cos(rad);
      push(
        right,
        spring + dRx * along + nRx * outw,
        yS + dRy * along + nRy * outw,
        (ribN + i + t) / 6,
        d * V_PER_M
      );
    }
  }
  push(right, W, 0, (ribN * 2) / 6, Ls * V_PER_M);

  return { left, roll, right, ribN, spacing, alpha, R, yc, yS, b1, b2, Ls };
}

/**
 * 把一条横截面（u, h）沿路径挤成带状几何。
 *
 * @param profile [{u,h,tu,tv}] tu/tv = 贴图 U/V（对整条路径恒定）
 * @param path    [{x,z,y,nx,nz,s}]
 * @param flip    绕向翻转（用于需要反面的构件）
 */
function extrudeRibbon(profile, path, flip = false) {
  const n = path.length;
  const m = profile.length;
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i < n; i++) {
    const p = path[i];
    for (let j = 0; j < m; j++) {
      const q = profile[j];
      pos.push(p.x + p.nx * q.u, p.y + q.h, p.z + p.nz * q.u);
      uv.push(q.tu, q.tv);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < m - 1; j++) {
      const a = i * m + j;
      const b = i * m + j + 1;
      const c = (i + 1) * m + j;
      const d = (i + 1) * m + j + 1;
      if (flip) idx.push(a, c, b, b, c, d);
      else idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * 卷棚脊：沿脊长的贴图 U + 横跨脊的贴图 V（瓦垄翻过脊顶的方向）。
 *
 * U 沿脊长按"每 1/6 循环一根瓦垄"推进 → 与坡面的垄距一致，
 * 否则脊上的垄和坡上的垄对不上，一眼假。
 */
function extrudeRidgeRoll(roll, path, spacing) {
  const n = path.length;
  const m = roll.length;
  const uCycle = 6 * spacing; // 沿脊：1/6 循环 = 一垄瓦的间距
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i < n; i++) {
    const p = path[i];
    const su = p.s / uCycle;
    for (let j = 0; j < m; j++) {
      const q = roll[j];
      pos.push(p.x + p.nx * q.u, p.y + q.h, p.z + p.nz * q.u);
      uv.push(su, q.tv);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < m - 1; j++) {
      const a = i * m + j;
      const b = i * m + j + 1;
      const c = (i + 1) * m + j;
      const d = (i + 1) * m + j + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * 端头封口：截面是**开口折线**（檐口→脊→檐口），
 * 不能用扇形三角化（截面是凹的，扇形会翻出轮廓外）。
 * 这里用"折线 ↔ 弦"的三角带：每个截面点对一条弦上的点，
 * 逐段拼成四边形 —— 凹的也拼得对。
 */
function capRibbonEnd(profile, pathPoint, flip = false) {
  const m = profile.length;
  const a = profile[0];
  const b = profile[m - 1];
  const pos = [];
  const uv = [];
  const idx = [];
  for (let j = 0; j < m; j++) {
    const q = profile[j];
    const t = j / (m - 1);
    // 弦上的点（与折线同 u，h 线性插值）
    const cu = a.u + (b.u - a.u) * t;
    const ch = a.h + (b.h - a.h) * t;
    pos.push(pathPoint.x + pathPoint.nx * q.u, pathPoint.y + q.h, pathPoint.z + pathPoint.nz * q.u);
    uv.push(q.tu, q.tv);
    pos.push(pathPoint.x + pathPoint.nx * cu, pathPoint.y + ch, pathPoint.z + pathPoint.nz * cu);
    uv.push(q.tu, q.tv);
  }
  for (let j = 0; j < m - 1; j++) {
    const p0 = j * 2;
    const p1 = p0 + 1;
    const p2 = p0 + 2;
    const p3 = p0 + 3;
    if (flip) idx.push(p0, p1, p2, p2, p1, p3);
    else idx.push(p0, p2, p1, p1, p2, p3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * 屋面几何：左坡 + 卷棚脊 + 右坡，沿路径挤出后合并。
 */
function buildRoof(path, prof) {
  const parts = [
    extrudeRibbon(prof.left, path),
    extrudeRibbon(prof.right, path),
    extrudeRidgeRoll(prof.roll, path, prof.spacing),
    capRibbonEnd(prof.left, path[0]),
    capRibbonEnd(prof.left, path[path.length - 1], true),
    capRibbonEnd(prof.right, path[0], true),
    capRibbonEnd(prof.right, path[path.length - 1]),
    capRibbonEnd(prof.roll, path[0]),
    capRibbonEnd(prof.roll, path[path.length - 1], true),
  ];
  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  return merged;
}

/**
 * 望板：屋面之下的铺板。
 *
 * 瓦面是**单层带**，从廊下往上看会直接看穿到天上（截图实测：
 * 檐下是一片瓦面背面）。`buildings/parts/roof.js` 里的殿宇也是
 * 克隆屋面下移 7.5 cm 当望板；游廊的屋面是断开的屋脊，不能直接克隆，
 * 只能按屋面**坡线**（不含筒瓦起伏的那条直线）另做一块板：
 *
 *   断面 = 左封檐板 → 左坡(坡线 − 板厚) → 脊弧(半径 − 板厚)
 *        → 右坡(坡线 − 板厚) → 右封檐板
 *
 * 两端的竖片就是**封檐板**，把瓦面与望板之间那道 7.5 cm 的缝封住
 * （不封的话檐下会漏一条亮缝，远看像一条白线）。
 */
function buildSoffit(path, prof) {
  const d = CORRIDOR.board;
  const R2 = prof.R - d;
  const yc = prof.yc;
  // 脊弧缩半径之后，端点不再落在坡线端点上 —— 重新解端点角，
  // 让弧正好接在坡线端上（否则望板中间会缺一块）。
  const cEnd = Math.min(0.999, Math.max(-0.999, CORRIDOR.spring / R2));
  const b1 = Math.acos(-cEnd);
  const b2 = Math.acos(cEnd);
  const pts = [];
  pts.push({ u: -EAVE_U, h: 0, tu: 0, tv: 0 }); // 左瓦口
  pts.push({ u: -EAVE_U, h: -d, tu: 0, tv: 1 }); // 左封檐板下沿
  pts.push({ u: -CORRIDOR.spring, h: prof.yS - d, tu: 0, tv: 0 }); // 左坡内端
  for (let k = 0; k <= 4; k++) {
    const b = b1 + ((b2 - b1) * k) / 4;
    pts.push({ u: Math.cos(b) * R2, h: yc + Math.sin(b) * R2, tu: 0, tv: 0 });
  }
  pts.push({ u: CORRIDOR.spring, h: prof.yS - d, tu: 0, tv: 0 }); // 右坡内端
  pts.push({ u: EAVE_U, h: -d, tu: 0, tv: 1 }); // 右封檐板下沿
  pts.push({ u: EAVE_U, h: 0, tu: 0, tv: 0 }); // 右瓦口
  return extrudeRibbon(pts, path);
}

/* ==================================================================
 * 地坪：条石 + 石缝
 * ================================================================== */

/** 地坪垫层（条石下的素土/砖垫），压入地面以免转角处露缝 */
function buildFloorBed(path) {
  // 台基剖面：底面比地坪低 0.35（埋进土里），两侧各挑出 0.22（压边石）。
  // 侧石分两层：下层大条石、上层压边 —— 两道水平线让台基有砌筑感，
  // 不是一块光板。
  const prof = [
    { u: -HALF - 0.22, h: -0.02, v: 0 },
    { u: HALF + 0.22, h: -0.02, v: 1 },
    { u: HALF + 0.22, h: -0.16, v: 2 },
    { u: HALF + 0.05, h: -0.18, v: 3 }, // 收进 → 压边石下口
    { u: HALF + 0.05, h: -0.3, v: 4 },
    { u: HALF + 0.22, h: -0.32, v: 5 }, // 再挑出 → 下层条石
    { u: HALF + 0.22, h: -0.5, v: 6 },
    { u: -HALF - 0.22, h: -0.5, v: 7 },
    { u: -HALF - 0.22, h: -0.32, v: 8 },
    { u: -HALF - 0.05, h: -0.3, v: 9 },
    { u: -HALF - 0.05, h: -0.18, v: 10 },
    { u: -HALF - 0.22, h: -0.16, v: 11 },
    { u: -HALF - 0.22, h: -0.02, v: 12 },
  ];
  const p = path.map((q) => ({ ...q, y: q.y + CORRIDOR.floorH }));
  return extrudeProfile(prof, p, { uScale: 0.35, capStart: true, capEnd: true });
}

/**
 * 条石铺地：沿廊每 1.2 m 一块，横向三列（0.9 m 一列）。
 * 每块四周内收 0.03 m，缝里露出下方垫层 —— **石缝是实体留空**，
 * 不是贴图画出来的。
 */
function buildFloorStones(path, heightAt) {
  const rows = 3;
  const colW = CORRIDOR.width / rows;
  const inset = 0.03;
  const pos = [];
  const uv = [];
  const idx = [];
  const n = path.length;
  let vi = 0;
  for (let i = 0; i < n - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const L = Math.hypot(dx, dz);
    if (L < 1e-6) continue;
    const ux = dx / L;
    const uz = dz / L;
    const lx = -uz;
    const lz = ux;
    const t0 = inset / L;
    const t1 = 1 - inset / L;
    for (let r = 0; r < rows; r++) {
      const u0 = -HALF + r * colW + inset;
      const u1 = -HALF + (r + 1) * colW - inset;
      const corners = [
        [a.x + ux * (L * t0) + lx * u0, a.z + uz * (L * t0) + lz * u0],
        [a.x + ux * (L * t1) + lx * u0, a.z + uz * (L * t1) + lz * u0],
        [a.x + ux * (L * t1) + lx * u1, a.z + uz * (L * t1) + lz * u1],
        [a.x + ux * (L * t0) + lx * u1, a.z + uz * (L * t0) + lz * u1],
      ];
      for (const c of corners) {
        pos.push(c[0], (heightAt ? heightAt(c[0], c[1]) ?? 0 : 0) + CORRIDOR.floorH, c[1]);
      }
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      // 条石面朝上
      idx.push(vi, vi + 2, vi + 1, vi, vi + 3, vi + 2);
      vi += 4;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ==================================================================
 * 柱与柱础
 * ================================================================== */

/** 柱：微收分（上径略大） */
function buildColumn(x, y, z, nx, nz, seg) {
  const r = CORRIDOR.colDia / 2;
  const g = new THREE.CylinderGeometry(r * 1.04, r, CORRIDOR.colH, seg, 1, true);
  g.translate(0, CORRIDOR.colH / 2, 0);
  g.rotateY(Math.atan2(nx, nz));
  g.translate(x, y, z);
  return g;
}

/**
 * 柱础（**覆盆式**）：方础 + 圆转收分的覆盆。
 *
 * AGENTS.md §4.1 硬要求："柱础 | 覆盆式（圆转收分），不是方柱墩"。
 * 之前是 6 边两段直锥 —— 远看就是一个小灰墩。
 * 覆盆的轮廓是**外扩的裙**：底下最宽，往上快速收，然后接近竖直。
 *   r(t) = rTop + (rBot - rTop)·(1-t)^p     p ≈ 1.8
 */
function buildColumnBase(x, y, z, seg) {
  const r = CORRIDOR.colDia / 2;
  const H = CORRIDOR.baseH;
  const rBot = r * 1.48;
  const rTop = r * 1.03;
  const plinthH = 0.035; // 方础
  const parts = [];

  const plinth = new THREE.BoxGeometry(rBot * 2, plinthH, rBot * 2);
  plinth.translate(x, y + plinthH / 2, z);
  parts.push(plinth);

  const pts = [];
  const n = 4;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const rr = rTop + (rBot - rTop) * Math.pow(1 - t, 1.8);
    pts.push(new THREE.Vector2(rr, plinthH + t * (H - plinthH)));
  }
  const lathe = new THREE.LatheGeometry(pts, seg);
  lathe.translate(x, y, z);
  parts.push(lathe);

  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  return merged;
}

/* ==================================================================
 * 额枋（彩画）/ 檐檩 / 廊内平顶 / 挂落
 * ================================================================== */

/**
 * 额枋：断面为带挑头的 T 形。
 * 靠廊内的那一面挂彩画贴图（u 沿梁长、v 横跨梁高）。
 */
function buildFangProfile(side) {
  const s = side;
  const inner = HALF - 0.08;
  const outer = HALF + 0.10;
  const arm = HALF + 0.27;
  return [
    { u: s * inner, h: LV.colTop, v: 0 },
    { u: s * inner, h: LV.fangTop, v: 1 },
    { u: s * arm, h: LV.fangTop, v: 1.12 },
    { u: s * arm, h: LV.fangTop - 0.12, v: 1.22 },
    { u: s * outer, h: LV.fangTop - 0.12, v: 1.3 },
    { u: s * outer, h: LV.colTop, v: 1.38 },
  ];
}

/** 檐檩：坐在额枋挑头上，顶部托住屋面 */
function buildPurlinProfile(side) {
  const s = side;
  const u0 = HALF + 0.10;
  const u1 = HALF + 0.27;
  return [
    { u: s * u0, h: LV.fangTop, v: 0 },
    { u: s * u0, h: LV.purlinTop, v: 1 },
    { u: s * u1, h: LV.purlinTop, v: 2 },
    { u: s * u1, h: LV.fangTop, v: 3 },
  ];
}

/** 廊内平顶（吊顶）：挡住屋面背面，从廊内看是平的木顶 */
function buildCeiling(path) {
  // ⚠ 截面点的顺序决定面绕向：两点截面的有向面积恒为 0，
  // extrudeProfile 只能给出"沿 +u 方向、法线朝上"的一种绕向。
  // 吊顶是给人**从下往上看**的，法线必须朝下 → 截面要反着写。
  // 两侧收到额枋的内面（HALF-0.08），高度与额枋顶齐平 ——
  // 留缝就会从缝里看到屋面内部，留高又会插进额枋里。
  const u = HALF - 0.08;
  const prof = [
    { u, h: LV.ceil, v: 1 },
    { u: -u, h: LV.ceil, v: 0 },
  ];
  const p = path.map((q) => ({ ...q, y: q.y + CORRIDOR.floorH }));
  return extrudeProfile(prof, p, { uScale: 0.3, capStart: true, capEnd: true });
}

/**
 * 挂落：额枋底下、柱与柱之间悬着的棂条格。
 *
 * AGENTS.md §4.1 要求的"挂落必须是真几何体"。
 * 做法：下枋（沿廊通长）+ 竖棂条（按间距排）+ 两端**角牙**。
 * 挂在柱**内侧**（u = INNER_U），否则会跟柱子穿模。
 */
function buildGuaLuo(path, side, spacing, withCorner) {
  const s = side;
  const u = INNER_U;
  const hTop = LV.colTop;
  const hBot = LV.colTop - CORRIDOR.gualuo;
  const parts = [];

  // 下枋（通长）
  const railProf = [
    { u: s * (u - 0.035), h: hBot, v: 0 },
    { u: s * (u + 0.035), h: hBot, v: 1 },
    { u: s * (u + 0.035), h: hBot + 0.07, v: 2 },
    { u: s * (u - 0.035), h: hBot + 0.07, v: 3 },
  ];
  parts.push(extrudeProfile(railProf, path, { uScale: 0.4 }));

  // 竖棂条
  const bars = [];
  let acc = 0;
  let nextS = 0;
  for (let i = 0; i < path.length; i++) {
    const q = path[i];
    if (i > 0) acc += Math.hypot(q.x - path[i - 1].x, q.z - path[i - 1].z);
    if (acc < nextS) continue;
    nextS += spacing;
    const ex = new THREE.Vector3(q.tx, 0, q.tz);
    const ez = new THREE.Vector3(q.nx * s, 0, q.nz * s);
    const mid = new THREE.Vector3(
      q.x + q.nx * s * u,
      q.y + CORRIDOR.floorH + (hBot + hTop) / 2,
      q.z + q.nz * s * u
    );
    bars.push(orientedBox(0.045, hTop - hBot, 0.035, ex, V_UP, ez, mid.x, mid.y, mid.z));
  }
  if (bars.length) {
    const merged = mergeGeometries(bars, false);
    for (const g of bars) g.dispose();
    parts.push(merged);
  }

  // 角牙（下枋两端的斜撑）
  if (withCorner) {
    const corners = [];
    for (const end of [0, path.length - 1]) {
      const q = path[end];
      const ex = new THREE.Vector3(q.tx, 0, q.tz);
      const ez = new THREE.Vector3(q.nx * s, 0, q.nz * s);
      const dir = end === 0 ? 1 : -1;
      const ang = 0.7;
      // 斜撑方向：沿廊方向斜上，**与 ex 正交**（否则正交基被拉成剪切矩阵）
      const ax = new THREE.Vector3(ex.x * dir * Math.cos(ang), Math.sin(ang), ex.z * dir * Math.cos(ang));
      ax.addScaledVector(ex, -ax.dot(ex)).normalize();
      const mid = new THREE.Vector3(
        q.x + q.nx * s * (u - 0.02) + ax.x * 0.1,
        q.y + CORRIDOR.floorH + hBot + 0.09,
        q.z + q.nz * s * (u - 0.02) + ax.z * 0.1
      );
      corners.push(orientedBox(0.05, 0.22, 0.035, ex, ax, ez, mid.x, mid.y, mid.z));
    }
    const merged = mergeGeometries(corners, false);
    for (const g of corners) g.dispose();
    parts.push(merged);
  }

  return parts;
}

/* ==================================================================
 * 檐口细部：瓦当 + 滴水 / 椽头 + 飞椽
 * ================================================================== */

/**
 * 檐口一列瓦当 + 滴水。
 *
 * 清式：每垄瓦的下端扣一枚圆瓦当，瓦当之间夹一枚如意头滴水。
 * 这里不逐枚建圆盘（太贵），而是把"瓦当 + 滴水"压成一条**扇贝断面的
 * 薄带**：断面位于"路径方向 × 竖向"平面内 —— 与真瓦当所在平面
 * （檐口线上的竖直面）一致，远看成排圆瓦当、瓦当之间滴水尖。
 *
 * ⚠ 两个坑：
 *   ① 瓦当是**竖直挂着**的（盖在筒瓦端头，平面垂直于屋面），
 *      不能顺着坡法线斜出去 —— 那样从下往上看只剩一条黑边。
 *   ② 面绕向必须随 side 翻转：左檐与右檐的外法线相反，
 *      绕向不翻的话有一侧的瓦当整排变成**背面（发黑）**。
 *
 * ⚠ 第三个坑（本轮修的）：`sampleAt()` 以前不返回 y，
 *   这里拿 `p.y` 算檐口高度 → 整条带全是 NaN → 瓦当滴水**整条看不见**。
 */
function buildEaveTileBand(path, side, spacing) {
  const R = CORRIDOR.eaveTile;
  const prof = []; // 每个采样点：{ p, lat, depth, out }
  // 沿路径累计采样
  const samples = [];
  let acc = 0;
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    if (i > 0) acc += Math.hypot(p.x - path[i - 1].x, p.z - path[i - 1].z);
    samples.push({ p, s: acc });
  }
  const total = acc;
  const step = spacing / 4; // 每个瓦当的半圆取 4 段
  const n = Math.max(1, Math.floor(total / step));
  for (let k = 0; k <= n; k++) {
    const s = k * step;
    const p = sampleAt(samples, s);
    // 一个周期内的扇贝：半圆瓦当（4 段）+ 滴水尖
    const ph = (s / spacing) % 1; // 0..1
    let depth;
    let lat;
    let out = 0;
    if (ph < 0.62) {
      // 瓦当半圆：lat 从 -R 到 +R，depth 为半圆下缘
      const t = ph / 0.62; // 0..1
      const ang = Math.PI * (t - 0.5); // -π/2 .. π/2
      lat = R * Math.sin(ang);
      depth = R * Math.cos(ang);
      // 瓦当外缘的**凸环**：两端各挑出一点，围出一圈凸起的边
      if (t < 0.16 || t > 0.84) out = 0.016;
    } else {
      // 滴水：如意头尖
      const t = (ph - 0.62) / 0.38; // 0..1
      const ang = Math.PI * (t - 0.5);
      lat = 0.135 * Math.sin(ang) * 1.4;
      depth = 0.165 * Math.cos(ang);
    }
    prof.push({ p, lat, depth, out });
  }
  // 挤成薄带：上沿贴着檐口，下沿是扇贝（竖直挂下）
  const pos = [];
  const uv = [];
  const idx = [];
  const PRONE = 0.02; // 瓦当略微挑出檐口，侧面也看得见
  for (let i = 0; i < prof.length; i++) {
    const q = prof[i];
    const p = q.p;
    const sgn = side;
    // 檐口点（局部）—— path 的 y 已经含 floorH + LV.eave
    const ex = p.x + p.nx * sgn * (EAVE_U + q.out);
    const ez = p.z + p.nz * sgn * (EAVE_U + q.out);
    const ey = p.y;
    // 沿路径方向偏移 lat
    const tx = p.tx;
    const tz = p.tz;
    const lx = p.nx * sgn; // 檐口外侧的水平法向
    const lz = p.nz * sgn;
    // 上沿
    pos.push(ex + tx * q.lat, ey, ez + tz * q.lat);
    uv.push(p.s * 0.39, 0.02);
    // 下沿：竖直挂下，并略微挑出檐口
    pos.push(ex + tx * q.lat + lx * PRONE * q.depth, ey - q.depth, ez + tz * q.lat + lz * PRONE * q.depth);
    uv.push(p.s * 0.39, 0.14);
  }
  for (let i = 0; i < prof.length - 1; i++) {
    const a = i * 2;
    // 绕向随 side 翻转，保证正面（朝廊外）始终朝观众
    if (side > 0) idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    else idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 在累计长度表里找弧长 s 对应的站点 */
function findStation(samples, s) {
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].s < s) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * 按弧长取样路径上的一个点（**位置、标架、高度都要插值**）。
 *
 * ⚠ 不能直接用 findStation 取到的路径点：路径点之间有 0.9 m，
 * 而檐口细部要按 0.1 m 采样。若只取路径点，转弯处相邻两段之间
 * 横向会差半米多 —— 瓦当带就被撕成一排**黑色三角碎片**。
 *
 * ⚠ **y 必须一起插值**（本轮修的硬伤）：漏掉 y 会让下游拿
 *   `undefined` 算高度，整段几何变成 NaN。
 */
function sampleAt(samples, s) {
  const i = findStation(samples, s);
  const b = samples[Math.min(i, samples.length - 1)];
  const a = samples[Math.max(0, i - 1)];
  const span = b.s - a.s;
  const t = span > 1e-6 ? (s - a.s) / span : 0;
  const lerp = (u, v) => u + (v - u) * t;
  const tx = lerp(a.p.tx, b.p.tx);
  const tz = lerp(a.p.tz, b.p.tz);
  const tl = Math.hypot(tx, tz) || 1;
  const nx = lerp(a.p.nx, b.p.nx);
  const nz = lerp(a.p.nz, b.p.nz);
  const nl = Math.hypot(nx, nz) || 1;
  return {
    x: lerp(a.p.x, b.p.x),
    z: lerp(a.p.z, b.p.z),
    y: lerp(a.p.y, b.p.y), // ← 以前漏了这行，檐口整条 NaN
    tx: tx / tl,
    tz: tz / tl,
    nx: nx / nl,
    nz: nz / nl,
    s,
  };
}

/**
 * 檐下椽头（+ 飞椽）：一排**圆形**椽头端面。
 *
 * 清式官式檐口从下往上看是：圆椽头（外圈）→ 斜出的方料飞椽 →
 * 通长的连檐 → 圆木檐檩。中式屋檐最强的识别特征就是那排圆椽头。
 *
 * 椽头挑出瓦口一点（4.5 cm），否则会被同一排的瓦当整排挡住
 * （瓦当下垂 0.105 m，比椽头离瓦面还近）。
 */
function buildRafterRow(path, side, spacing, withFly, prof) {
  const parts = [];
  const r = CORRIDOR.rafterR;
  // 椽头中心：挑出瓦口 4.5 cm，落在瓦口下方 0.13 m
  const uR = EAVE_U + 0.045;
  const hR = LV.eave - 0.13;
  let acc = 0;
  let nextS = 0;
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    if (i > 0) acc += Math.hypot(p.x - path[i - 1].x, p.z - path[i - 1].z);
    if (acc < nextS) continue;
    nextS += spacing;
    const sgn = side;
    const ex = new THREE.Vector3(p.tx, 0, p.tz); // 沿廊方向（圆椽的轴）
    const ez = new THREE.Vector3(p.nx * sgn, 0, p.nz * sgn); // 朝廊外
    const baseY = p.y + CORRIDOR.floorH;
    // 椽头：圆截面，端面朝廊外
    parts.push(
      orientedCylinder(r, 0.16, 6, V_UP, ex, ez, p.x + ez.x * uR, baseY + hR, p.z + ez.z * uR)
    );
    // 飞椽：斜出的方料，从檐檩外端斜挑到椽头后面
    if (withFly) {
      const a = prof.alpha;
      const dir = new THREE.Vector3(ez.x * Math.cos(a), -Math.sin(a), ez.z * Math.cos(a));
      const up = new THREE.Vector3(ez.x * Math.sin(a), Math.cos(a), ez.z * Math.sin(a));
      const u0 = HALF + 0.27; // 檐檩外端
      const h0 = LV.purlinTop;
      const len = Math.hypot(uR - u0, hR - h0);
      const mid = new THREE.Vector3(
        p.x + ez.x * ((u0 + uR) / 2),
        baseY + (h0 + hR) / 2,
        p.z + ez.z * ((u0 + uR) / 2)
      );
      parts.push(orientedBox(0.07, 0.07, len, ex, up, dir, mid.x, mid.y, mid.z));
    }
  }
  if (!parts.length) return null;
  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  return merged;
}

/* ==================================================================
 * 美人靠
 * ================================================================== */

/**
 * 美人靠：坐凳 + 寻杖 + 斜倚的棂条靠背 + 鹅颈扶手。
 *
 * 座面/靠背下枋/扶手是沿路径挤出的纵向构件；棂条是横向小方料。
 *
 * ⚠ 整体**内移到柱内侧**（u ≤ INNER_U）：原来靠背在 u=1.34，
 *   而柱身占 1.24~1.46 —— 棕色的横杆直接从红柱里穿出去，
 *   截图里非常明显（AGENTS.md §4.1："不能出现豁口或穿插"）。
 */
function buildMeiRenKao(path, side, spacing) {
  const sgn = side;
  const seatU0 = 0.8;
  const seatU1 = INNER_U - 0.04;
  const backTopU = INNER_U;
  const backBotU = INNER_U - 0.05;
  const seatH = 0.42;
  const backTopH = 0.9;
  const backBotH = 0.48;
  // 靠背倾角
  const tilt = Math.atan2(backTopH - backBotH, backBotU - backTopU);

  const p = path.map((q) => ({ ...q, y: q.y + CORRIDOR.floorH }));
  const U = (v) => sgn * v;

  // 座面 + 座下裙板（一条断面）
  const seatProf = [
    { u: U(seatU0), h: seatH - 0.07, v: 0 },
    { u: U(seatU1), h: seatH - 0.07, v: 1 },
    { u: U(seatU1), h: seatH, v: 2 },
    { u: U(seatU0), h: seatH, v: 3 },
  ];
  const seat = extrudeProfile(seatProf, p, { uScale: 0.25 });

  // 寻杖（靠背下枋，座面之上的那道横木）
  const xunProf = [
    { u: U(backBotU - 0.02), h: backBotH, v: 0 },
    { u: U(backTopU), h: backBotH, v: 1 },
    { u: U(backTopU), h: backBotH + 0.08, v: 2 },
    { u: U(backBotU - 0.02), h: backBotH + 0.08, v: 3 },
  ];
  const xun = extrudeProfile(xunProf, p, { uScale: 0.25 });

  // 鹅颈扶手：从座面前端弯上来，与靠背顶相接
  const arm = [];
  const N = 7;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const u = seatU0 + (backTopU - seatU0) * t;
    const h = seatH + (backTopH + 0.03 - seatH) * (1 - Math.pow(1 - t, 1.7));
    arm.push({ u: U(u), h, v: i / N });
  }
  for (let i = N; i >= 0; i--) {
    const t = i / N;
    const u = seatU0 + (backTopU - seatU0) * t;
    const h = seatH + (backTopH + 0.03 - seatH) * (1 - Math.pow(1 - t, 1.7)) - 0.085;
    arm.push({ u: U(u), h, v: i / N });
  }
  const armGeo = extrudeProfile(arm, p, { uScale: 0.25 });

  // 靠背棂条
  const barGeos = [];
  let acc = 0;
  let nextS = 0;
  for (let i = 0; i < path.length; i++) {
    const q = path[i];
    if (i > 0) acc += Math.hypot(q.x - path[i - 1].x, q.z - path[i - 1].z);
    if (acc < nextS) continue;
    nextS += spacing;
    const ex = new THREE.Vector3(q.tx, 0, q.tz);
    const dir = new THREE.Vector3(
      sgn * (q.nx * Math.sin(tilt)),
      Math.cos(tilt),
      sgn * (q.nz * Math.sin(tilt))
    );
    const up = new THREE.Vector3(
      sgn * (q.nx * Math.cos(tilt)),
      -Math.sin(tilt),
      sgn * (q.nz * Math.cos(tilt))
    );
    const midU = (backBotU + backTopU) / 2;
    const midH = (backBotH + backTopH) / 2;
    const len = Math.hypot(backTopH - backBotH, backBotU - backTopU) - 0.02;
    const bx = q.x + q.nx * sgn * midU;
    const bz = q.z + q.nz * sgn * midU;
    const by = q.y + CORRIDOR.floorH + midH;
    barGeos.push(orientedBox(0.05, len, 0.05, ex, dir, up, bx, by, bz));
  }
  let bars = null;
  if (barGeos.length) {
    bars = mergeGeometries(barGeos, false);
    for (const g of barGeos) g.dispose();
  }
  return { seat, xun, arm: armGeo, bars };
}

/* ==================================================================
 * 廊子总装
 * ================================================================== */

/** 决定美人靠靠哪一侧：靠水的一侧（廊子临水才设美人靠） */
function pickMeiRenSide(path, sceneData) {
  const water = sceneData.water || [];
  const pts = [];
  for (const w of water) {
    const ring = Array.isArray(w) ? w : w.ring;
    if (!Array.isArray(ring)) continue;
    for (const p of ring) if (Array.isArray(p)) pts.push(p);
  }
  if (!pts.length) return -1;
  let left = 0;
  let right = 0;
  for (let i = 0; i < path.length; i += 6) {
    const p = path[i];
    let best = Infinity;
    let bx = 0;
    let bz = 0;
    for (let k = 0; k < pts.length; k++) {
      const q = pts[k];
      const d = (q[0] - p.x) * (q[0] - p.x) + (q[1] - p.z) * (q[1] - p.z);
      if (d < best) {
        best = d;
        bx = q[0];
        bz = q[1];
      }
    }
    const lat = (bx - p.x) * p.nx + (bz - p.z) * p.nz;
    if (lat > 0) right++;
    else left++;
  }
  return right > left ? 1 : -1;
}

/**
 * 生成一条游廊的几何，按材质入桶。
 * @param level LOD 分级（见 LEVELS）
 */
function buildOneCorridor(line, heightAt, buckets, level, sceneData) {
  const raw = dedupe(line);
  if (raw.length < 2) return;
  const poly = filletPath(raw, CORRIDOR.fillet);

  const floorPath = withFrames(resamplePath(poly, STEP.floor), heightAt);
  const bayPath = withFrames(resamplePath(poly, STEP.bay), heightAt);
  const beamPath = withFrames(resamplePath(poly, STEP.beam), heightAt);
  const roofPath = withFrames(resamplePath(poly, STEP.roof), heightAt);
  const finePath = withFrames(resamplePath(poly, STEP.fine), heightAt);
  if (bayPath.length < 2) return;

  /* ---- 地坪：垫层 + 条石 ---- */
  buckets.stone.push(buildFloorBed(beamPath));
  buckets.stone.push(buildFloorStones(floorPath, heightAt));

  /* ---- 柱 + 柱础 ---- */
  for (const p of bayPath) {
    const y = p.y + CORRIDOR.floorH;
    for (const s of [-1, 1]) {
      buckets.column.push(
        buildColumn(p.x + p.nx * HALF * s, y, p.z + p.nz * HALF * s, p.nx * s, p.nz * s, level.colSeg)
      );
      buckets.stone.push(
        buildColumnBase(p.x + p.nx * HALF * s, y, p.z + p.nz * HALF * s, level.baseSeg)
      );
    }
  }

  /* ---- 额枋（彩画）+ 檐檩 ---- */
  for (const s of [-1, 1]) {
    const fangPath = beamPath.map((q) => ({ ...q, y: q.y + CORRIDOR.floorH }));
    buckets.caihua.push(extrudeProfile(buildFangProfile(s), fangPath, { uScale: 1 / 2.4 }));
    buckets.wood.push(extrudeProfile(buildPurlinProfile(s), fangPath, { uScale: 0.5 }));
  }

  /* ---- 廊内平顶 ---- */
  buckets.wood.push(buildCeiling(roofPath));

  /* ---- 屋面 + 望板 ---- */
  const prof = roofProfile();
  const roofP = roofPath.map((q) => ({ ...q, y: q.y + CORRIDOR.floorH + LV.eave }));
  buckets.roof.push(buildRoof(roofP, prof));
  buckets.wood.push(buildSoffit(roofP, prof));

  /* ---- 檐口：瓦当滴水 + 椽头（全部游廊都有，按长度分级密度） ---- */
  const eavePath = finePath.map((q) => ({ ...q, y: q.y + CORRIDOR.floorH + LV.eave }));
  for (const s of [-1, 1]) {
    buckets.roof.push(buildEaveTileBand(eavePath, s, prof.spacing));
    const r = buildRafterRow(finePath, s, level.rafter, level.fly, prof);
    if (r) buckets.wood.push(r);
  }

  /* ---- 挂落（额枋下）---- */
  const side = pickMeiRenSide(finePath, sceneData);
  {
    // 挂落挂在**美人靠的对侧**（临空那一边）；
    // 美人靠那侧的靠背本身已经是一道栏杆，再加挂落是重复。
    const glSide = side > 0 ? -1 : 1;
    for (const g of buildGuaLuo(beamPath, glSide, level.gualuo, level.fly)) {
      buckets.wood.push(g);
    }
  }

  /* ---- 美人靠 ---- */
  const mr = buildMeiRenKao(beamPath, side, level.mr);
  if (mr) {
    buckets.wood.push(mr.seat, mr.xun, mr.arm);
    if (mr.bars) buckets.wood.push(mr.bars);
  }
}

/* ==================================================================
 * 对外接口
 * ================================================================== */

let cached = null;

/**
 * 一次性生成全园游廊（按材质合并成 5 个 Mesh）。
 *
 * 注：main.js 里 buildCorridors 被调用了两次（scene.add 两次），
 * 这里返回同一个 Group 实例，第二次 scene.add 会把同一个对象
 * 从父节点摘下再挂回去 —— 场景里最终只有一份游廊。
 */
export function buildCorridors(sceneData, heightAt) {
  if (cached && cached.sceneData === sceneData && cached.heightAt === heightAt) {
    return cached.group;
  }

  const group = new THREE.Group();
  group.name = 'corridors';
  const buckets = { roof: [], wood: [], caihua: [], column: [], stone: [] };

  const lines = sceneData.corridors || [];
  for (const line of lines) {
    if (!line || line.length < 2) continue;
    let len = 0;
    for (let i = 0; i < line.length - 1; i++) {
      len += Math.hypot(line[i + 1][0] - line[i][0], line[i + 1][1] - line[i][1]);
    }
    buildOneCorridor(line, heightAt, buckets, levelFor(len), sceneData);
  }

  const mats = corridorMaterials();
  const per = {};
  let tris = 0;
  for (const [k, list] of Object.entries(buckets)) {
    if (!list.length) continue;
    const merged = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mats[k]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `corridor-${k}`;
    group.add(mesh);
    const t = merged.index ? merged.index.count / 3 : merged.attributes.position.count / 3;
    per[k] = Math.round(t);
    tris += t;
  }
  console.log(
    `  ✓ 游廊：${lines.length} 条 / ${group.children.length} 个材质桶 / ` +
      `${Math.round(tris).toLocaleString()} 三角面 ` +
      Object.entries(per)
        .map(([k, v]) => `${k}:${v.toLocaleString()}`)
        .join(' ')
  );

  cached = { sceneData, heightAt, group };
  return group;
}

/**
 * 只生成一条游廊（独立 Group）—— 供调试与复用。
 */
export function buildCorridor(line, heightAt, sceneData = null) {
  const group = new THREE.Group();
  group.name = 'corridor';
  const buckets = { roof: [], wood: [], caihua: [], column: [], stone: [] };
  const len = (line || []).reduce((a, p, i, arr) => {
    if (i === 0) return 0;
    return a + Math.hypot(p[0] - arr[i - 1][0], p[1] - arr[i - 1][1]);
  }, 0);
  buildOneCorridor(line, heightAt, buckets, levelFor(len), sceneData || {});
  const mats = corridorMaterials();
  for (const [k, list] of Object.entries(buckets)) {
    if (!list.length) continue;
    const merged = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mats[k]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
