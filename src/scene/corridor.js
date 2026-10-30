/**
 * 游廊（廊）
 *
 * 圆明园最具辨识度的构件之一：15 条游廊、总长 8481 m。
 *
 * ================================================================
 * 形制依据（清式园林游廊）
 * ================================================================
 *   · 廊宽（柱心距）2.4~3.0 m，柱高 2.6~3.0 m，柱径 0.20~0.24 m
 *   · 屋面：**卷棚**（两坡相接、无正脊，脊部圆缓），小青瓦
 *   · 檐口：**瓦当 + 滴水**（一垄一个），檐下露**椽头**与**飞椽**
 *   · 额枋上施**彩画**（旋子）
 *   · 一侧设**美人靠**：棂条靠背 + 坐凳
 *   · 地墁**条石**，石缝可见
 *   · 柱下有**柱础**（覆盆式）
 *
 * ================================================================
 * 建模原则（AGENTS.md §4.1：建模比贴图精细度高得多）
 * ================================================================
 * 瓦垄（半圆管）、瓦当、滴水、椽头、飞椽、柱础、美人靠棂条、
 * 条石石缝 —— 全部是**实体几何**；贴图只负责连续表面（苔痕、砖缝、木纹）。
 *
 * ================================================================
 * 性能（全园基线 13~15 M 面 / 150~570 draw call）
 * ================================================================
 * 整层按材质合并成 **5 个 Mesh**（draw call ≤ 8），
 * 三角面增量控制在 **≤ 1.2 M**。为此做了两级 LOD：
 *
 *   一级（完整瓦作）：长度 ≥ LOD_A 的长廊 —— 有瓦当滴水、椽头飞椽、
 *        覆盆柱础、密棂条美人靠。
 *   二级（简化）：其余长廊 —— 素柱础、疏棂条、简式檐口（无瓦当椽头）。
 *   两级之间**屋面、额枋、地坪完全一致**，视觉上连续，只有檐口细部有别。
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
 * 尺度常量
 * ================================================================== */
const CORRIDOR = {
  width: 2.7, // 柱心距（= 廊宽，沿用原值）
  colH: 2.85, // 柱高：自柱础顶面至柱头
  colDia: 0.22, // 柱径
  step: 1.8, // 步架（柱距）
  roofRise: 0.72, // 卷棚顶：檐口至脊高差
  overhang: 0.35, // 出檐（自柱心线外挑）
  floorH: 0.16, // 地坪比地面高（与 figures.js 的廊上人物保持一致）
  gang: 0.386, // 瓦垄距（筒瓦中→中）
  tongR: 0.11, // 筒瓦半径
  baseH: 0.13, // 柱础高
  fillet: 2.8, // 转角圆角半径（必须 > 出檐半宽，否则内角翻折）
  spring: 0.3, // 卷棚脊部圆缓段半宽
  eaveTile: 0.105, // 瓦当半径
  LOD_A: 900, // 完整瓦作游廊的最短长度（m）
};

/* 竖向分层（相对地坪面 F = 地面 + floorH） */
const LV = {
  baseTop: CORRIDOR.baseH, // 柱础顶
  colTop: CORRIDOR.baseH + CORRIDOR.colH, // 柱头 2.98
  fangTop: 3.28, // 额枋顶
  ceil: 3.3, // 廊内平顶（吊顶）
  eave: 3.42, // 檐口（瓦面外沿）
  purlinTop: 3.44, // 檐檩顶
};

/* 路径采样步距（沿弧长） */
const STEP = {
  floor: 1.2, // 地坪条石
  bay: CORRIDOR.step, // 柱位（步架）
  beam: 3.6, // 纵向杆件（额枋/檐檩/美人靠）
  roof: 4.5, // 屋面
  fine: 0.9, // 细部（美人靠棂条、椽头）
};

const HALF = CORRIDOR.width / 2; // 1.35 柱心半距
const EAVE_U = HALF + CORRIDOR.overhang; // 1.70 檐口外沿

/* ==================================================================
 * 材质
 * ================================================================== */
function corridorMaterials() {
  // 小青瓦（灰瓦）。屋面是单层几何，檐下看得见背面，
  // 故克隆一份改成 DoubleSide —— 只改本文件，不动 materials.js。
  const roof = roofMaterial(false).clone();
  roof.side = THREE.DoubleSide;
  return {
    roof,
    wood: woodMaterial(), // 美人靠 / 檐檩 / 椽头
    caihua: caihuaMaterial('xuanzi'), // 额枋彩画
    column: columnMaterial('#a8302a'), // 柱
    stone: stoneMaterial(), // 柱础 / 地坪条石
  };
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
  g.applyMatrix4(new THREE.Matrix4().makeBasis(ex, ey, ez));
  g.translate(px, py, pz);
  return g;
}

const V_UP = new THREE.Vector3(0, 1, 0);

/* ==================================================================
 * 屋面：卷棚截面（半圆筒瓦垄）
 * ================================================================== */

/**
 * 卷棚屋面横截面。
 *
 * 两坡在脊部以一段圆弧相接（卷棚无正脊），单坡上按 gang 间距排
 * 半圆筒瓦垄。整条屋面就是这一个截面沿路径挤出来的。
 *
 * 贴图坐标与贴图布局严格对应（见 buildings/textures.js roofTiles）：
 *   贴图 U 向 = 横向 6 垄/循环 → 一垄瓦占 1/6 个循环，垄间瓦沟落在循环边界（暗）；
 *   贴图 V 向 = 沿坡向 6 层瓦当/循环 → v = 沿坡距离 × 4。
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

  const prof = [];
  const push = (u, h, tu, tv) => prof.push({ u, h, v: tv, u0: tu });

  // ---- 左坡：檐口 (-W,0) → 起翘点 (-spring,yS) ----
  const dLx = Math.cos(alpha);
  const dLy = Math.sin(alpha);
  const nLx = -Math.sin(alpha);
  const nLy = Math.cos(alpha);
  push(-W, 0, 0, Ls * 4);
  for (let i = 0; i < ribN; i++) {
    const d = (i + 0.5) * spacing;
    for (const phi of [-90, -30, 30, 90]) {
      const rad = (phi * Math.PI) / 180;
      const t = (phi + 90) / 180;
      const along = d + R0 * Math.sin(rad);
      const outw = R0 * Math.cos(rad);
      push(-W + dLx * along + nLx * outw, dLy * along + nLy * outw, (i + t) / 6, (Ls - d) * 4);
    }
  }
  push(-spring, yS, ribN / 6, 0);

  // ---- 脊部圆缓段 ----
  const b1 = Math.atan2(yS - yc, -spring);
  const b2 = Math.atan2(yS - yc, spring);
  for (const k of [0.25, 0.5, 0.75]) {
    const b = b1 + (b2 - b1) * k;
    push(Math.cos(b) * R, yc + Math.sin(b) * R, ribN / 6, 0);
  }

  // ---- 右坡：起翘点 (spring,yS) → 檐口 (W,0) ----
  const dRx = Math.cos(alpha);
  const dRy = -Math.sin(alpha);
  const nRx = Math.sin(alpha);
  const nRy = Math.cos(alpha);
  for (let i = 0; i < ribN; i++) {
    const d = (i + 0.5) * spacing;
    for (const phi of [90, 30, -30, -90]) {
      const rad = (phi * Math.PI) / 180;
      const t = (1 - phi) / 180;
      const along = d + R0 * Math.sin(rad);
      const outw = R0 * Math.cos(rad);
      push(spring + dRx * along + nRx * outw, yS + dRy * along + nRy * outw, (ribN + i + t) / 6, d * 4);
    }
  }
  push(W, 0, (ribN * 2) / 6, Ls * 4);

  return prof;
}

/**
 * 屋面几何：截面沿路径挤出。
 * 截面点自带 u0（贴图 U），挤出时按"同一垄取同一段 U"重排。
 */
function buildRoof(path) {
  const prof = roofProfile();
  // 挤出用的截面：u = 横向，h = 高度（相对檐口），v = 贴图 U
  const m = prof.length;
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    for (let j = 0; j < m; j++) {
      const q = prof[j];
      pos.push(p.x + p.nx * q.u, p.y + q.h, p.z + p.nz * q.u);
      uv.push(q.u0, q.v);
    }
  }
  for (let i = 0; i < path.length - 1; i++) {
    for (let j = 0; j < m - 1; j++) {
      const a = i * m + j;
      const b = i * m + j + 1;
      const c = (i + 1) * m + j;
      const d = (i + 1) * m + j + 1;
      // 屋面朝上：轮廓自左檐口经脊到右檐口，绕向须与挤出方向相反
      idx.push(a, b, c, b, d, c);
    }
  }
  // 端头封口（卷棚端面）
  const capA = pos.length / 3;
  const p0 = path[0];
  for (let j = 0; j < m; j++) {
    const q = prof[j];
    pos.push(p0.x + p0.nx * q.u, p0.y + q.h, p0.z + p0.nz * q.u);
    uv.push(q.u0, q.v);
  }
  for (let j = 1; j < m - 1; j++) idx.push(capA, capA + j + 1, capA + j);
  const capB = pos.length / 3;
  const p1 = path[path.length - 1];
  for (let j = 0; j < m; j++) {
    const q = prof[j];
    pos.push(p1.x + p1.nx * q.u, p1.y + q.h, p1.z + p1.nz * q.u);
    uv.push(q.u0, q.v);
  }
  for (let j = 1; j < m - 1; j++) idx.push(capB, capB + j, capB + j + 1);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ==================================================================
 * 地坪：条石 + 石缝
 * ================================================================== */

/** 地坪垫层（条石下的素土/砖垫），压入地面以免转角处露缝 */
function buildFloorBed(path) {
  const prof = [
    { u: -HALF - 0.04, h: -0.02, v: 0 },
    { u: HALF + 0.04, h: -0.02, v: 1 },
    { u: HALF + 0.04, h: -0.35, v: 2 },
    { u: -HALF - 0.04, h: -0.35, v: 3 },
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

/** 柱：微收分（上径略大），8 边 */
function buildColumn(x, y, z, nx, nz) {
  const r = CORRIDOR.colDia / 2;
  const g = new THREE.CylinderGeometry(r * 1.04, r, CORRIDOR.colH, 8, 1, true);
  g.translate(0, CORRIDOR.colH / 2, 0);
  g.rotateY(Math.atan2(nx, nz));
  g.translate(x, y, z);
  return g;
}

/**
 * 柱础（覆盆式）：底盘略外撇，顶部收至柱径。
 * 一级用 6 边三段轮廓，二级简化为两段。
 */
function buildColumnBase(x, y, z, detailed) {
  const r = CORRIDOR.colDia / 2;
  const pts = detailed
    ? [new THREE.Vector2(r * 1.42, 0), new THREE.Vector2(r * 1.38, 0.045), new THREE.Vector2(r * 1.03, CORRIDOR.baseH)]
    : [new THREE.Vector2(r * 1.36, 0), new THREE.Vector2(r * 1.03, CORRIDOR.baseH)];
  const g = new THREE.LatheGeometry(pts, 6);
  g.translate(x, y, z);
  return g;
}

/* ==================================================================
 * 额枋（彩画）/ 檐檩 / 廊内平顶
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
  const u0 = HALF + 0.11;
  const u1 = HALF + 0.27;
  return [
    { u: s * u0, h: LV.fangTop - 0.1, v: 0 },
    { u: s * u0, h: LV.purlinTop, v: 1 },
    { u: s * u1, h: LV.purlinTop, v: 2 },
    { u: s * u1, h: LV.fangTop - 0.1, v: 3 },
  ];
}

/** 廊内平顶（吊顶）：挡住屋面背面，从廊内看是平的木顶 */
function buildCeiling(path) {
  const prof = [
    { u: -HALF, h: LV.ceil, v: 0 },
    { u: HALF, h: LV.ceil, v: 1 },
  ];
  const p = path.map((q) => ({ ...q, y: q.y + CORRIDOR.floorH }));
  return extrudeProfile(prof, p, { uScale: 0.3 });
}

/* ==================================================================
 * 檐口细部：瓦当 + 滴水 / 椽头 + 飞椽
 * ================================================================== */

/**
 * 檐口一列瓦当 + 滴水。
 *
 * 清式：每垄瓦的下端扣一枚圆瓦当，瓦当之间夹一枚如意头滴水。
 * 这里不逐枚建圆盘（太贵），而是把"瓦当 + 滴水"压成一条**扇贝断面的
 * 薄带**：断面位于"路径方向 × 坡法线方向"平面内 —— 与真瓦当所在平面
 * 一致，远看成排圆瓦当、瓦当之间滴水尖。
 *
 * 形制简化：瓦当正面纹样（团寿/凸环）未做，见 buildings/parts/roof.js。
 */
function buildEaveTileBand(path, side) {
  const gangLen = CORRIDOR.gang * 1.105; // 沿廊方向的垄距
  const R = CORRIDOR.eaveTile;
  const prof = []; // 每个采样点：{ s, depth }
  // 沿路径累计采样
  const samples = [];
  let acc = 0;
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    if (i > 0) acc += Math.hypot(p.x - path[i - 1].x, p.z - path[i - 1].z);
    samples.push({ p, s: acc });
  }
  const total = acc;
  const step = gangLen / 4; // 每个瓦当的半圆取 4 段
  const n = Math.max(1, Math.floor(total / step));
  for (let k = 0; k <= n; k++) {
    const s = k * step;
    const idx = findStation(samples, s);
    const p = samples[idx].p;
    // 一个周期内的扇贝：半圆瓦当（4 段）+ 滴水尖
    const ph = (s / gangLen) % 1; // 0..1
    let depth;
    let lat;
    if (ph < 0.62) {
      // 瓦当半圆：lat 从 -0.105 到 +0.105，depth 为半圆下缘
      const t = ph / 0.62; // 0..1
      const ang = Math.PI * (t - 0.5); // -π/2 .. π/2
      lat = R * Math.sin(ang);
      depth = R * Math.cos(ang);
    } else {
      // 滴水：如意头尖
      const t = (ph - 0.62) / 0.38; // 0..1
      const ang = Math.PI * (t - 0.5);
      lat = 0.135 * Math.sin(ang) * 1.4;
      depth = 0.165 * Math.cos(ang);
    }
    prof.push({ p, lat, depth });
  }
  // 挤成薄带：上沿贴着檐口，下沿是扇贝
  const pos = [];
  const uv = [];
  const idx = [];
  const alpha = Math.atan2(CORRIDOR.roofRise, EAVE_U - CORRIDOR.spring);
  const nUp = { x: Math.sin(alpha), y: Math.cos(alpha) }; // 坡法线（朝外上）
  for (let i = 0; i < prof.length; i++) {
    const q = prof[i];
    const p = q.p;
    const sgn = side;
    // 檐口点（局部）
    const ex = p.x + p.nx * sgn * EAVE_U;
    const ez = p.z + p.nz * sgn * EAVE_U;
    const ey = p.y + CORRIDOR.floorH + LV.eave;
    // 沿路径方向偏移 lat，沿海法线外移 depth
    const tx = p.tx;
    const tz = p.tz;
    const lx = p.nx * sgn;
    const lz = p.nz * sgn;
    // 外法线 = 横向 * sinα + 竖向 * cosα
    const onx = lx * nUp.x;
    const onz = lz * nUp.x;
    const ony = nUp.y;
    // 上沿
    pos.push(ex + tx * q.lat, ey + ony * 0.004, ez + tz * q.lat);
    uv.push(q.p.s * 0.39, 0.02);
    // 下沿
    pos.push(
      ex + tx * q.lat + onx * q.depth,
      ey - ony * q.depth,
      ez + tz * q.lat + onz * q.depth
    );
    uv.push(q.p.s * 0.39, 0.14);
  }
  for (let i = 0; i < prof.length - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
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
 * 檐下椽头 + 飞椽（一排）。
 * 椽头是方料端头，飞椽是斜出的上段，二者一起构成清式檐口的"两层"断面。
 */
function buildRafterRow(path, side, spacing) {
  const parts = [];
  const alpha = Math.atan2(CORRIDOR.roofRise, EAVE_U - CORRIDOR.spring);
  let acc = 0;
  let nextS = 0;
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    if (i > 0) acc += Math.hypot(p.x - path[i - 1].x, p.z - path[i - 1].z);
    if (acc < nextS) continue;
    nextS += spacing;
    const sgn = side;
    const lx = p.nx * sgn;
    const lz = p.nz * sgn;
    const ex = new THREE.Vector3(p.tx, 0, p.tz);
    const ey = new THREE.Vector3(0, 1, 0);
    const ez = new THREE.Vector3(lx, 0, lz);
    const baseY = p.y + CORRIDOR.floorH;
    // 椽头：方料端头，露在瓦口之内
    const uR = HALF + 0.21;
    parts.push(
      orientedBox(
        0.11,
        0.11,
        0.15,
        ex,
        ey,
        ez,
        p.x + lx * uR,
        baseY + LV.eave - 0.12,
        p.z + lz * uR
      )
    );
    // 飞椽：斜出的小方料
    const dir = new THREE.Vector3(lx * Math.cos(alpha), -Math.sin(alpha), lz * Math.cos(alpha));
    const up = new THREE.Vector3(lx * Math.sin(alpha), Math.cos(alpha), lz * Math.sin(alpha));
    const mid = new THREE.Vector3(
      p.x + lx * (HALF + 0.12) + dir.x * 0.14,
      baseY + LV.eave - 0.045,
      p.z + lz * (HALF + 0.12) + dir.z * 0.14
    );
    parts.push(
      orientedBox(0.09, 0.09, 0.3, ex, up, dir, mid.x, mid.y, mid.z)
    );
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
 * 美人靠：坐凳 + 斜倚的棂条靠背。
 *
 * 座面/靠背下枋/扶手是沿路径挤出的纵向构件；棂条是横向小方料，
 * 每 0.5 m（一级）/ 1.2 m（二级）一根 —— 近看能认出是**木棂**，
 * 不是整块板。
 */
function buildMeiRenKao(path, side, detailed, heightAt) {
  const sgn = side;
  const seatU0 = HALF - 0.46;
  const seatU1 = HALF - 0.04;
  const seatH = 0.42;
  const backTopU = HALF - 0.01;
  const backTopH = 0.9;
  const backBotU = HALF - 0.1;
  const backBotH = 0.5;
  // 靠背倾角
  const tilt = Math.atan2(backTopH - backBotH, backBotU - backTopU);

  const p = path.map((q) => ({ ...q, y: q.y + CORRIDOR.floorH }));
  const U = (v) => sgn * v;

  // 座面 + 靠背下枋（一条断面）
  const seatProf = [
    { u: U(seatU0), h: seatH - 0.07, v: 0 },
    { u: U(seatU1), h: seatH - 0.07, v: 1 },
    { u: U(seatU1), h: seatH, v: 2 },
    { u: U(backBotU + 0.05), h: seatH, v: 3 },
    { u: U(backBotU + 0.05), h: backBotH + 0.05, v: 4 },
    { u: U(backBotU - 0.04), h: backBotH + 0.05, v: 5 },
    { u: U(backBotU - 0.04), h: seatH, v: 6 },
    { u: U(seatU0), h: seatH, v: 7 },
  ];
  const seat = extrudeProfile(seatProf, p, { uScale: 0.25 });

  // 扶手（靠背顶的横木）
  const handProf = [
    { u: U(backTopU + 0.05), h: backTopH - 0.02, v: 0 },
    { u: U(backTopU + 0.05), h: backTopH + 0.05, v: 1 },
    { u: U(backTopU - 0.09), h: backTopH + 0.05, v: 2 },
    { u: U(backTopU - 0.09), h: backTopH - 0.02, v: 3 },
  ];
  const hand = extrudeProfile(handProf, p, { uScale: 0.25 });

  // 棂条
  const barGeos = [];
  const spacing = detailed ? 0.5 : 1.2;
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
    const midU = (backBotU + backTopU) / 2 - 0.03;
    const midH = (backBotH + backTopH) / 2;
    const len = Math.hypot(backTopH - backBotH, backBotU - backTopU) - 0.04;
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
  return { seat, hand, bars };
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
 * @param detailed 一级（完整瓦作）
 */
function buildOneCorridor(line, heightAt, buckets, detailed, sceneData) {
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
      buckets.column.push(buildColumn(p.x + p.nx * HALF * s, y, p.z + p.nz * HALF * s, p.nx * s, p.nz * s));
      buckets.stone.push(buildColumnBase(p.x + p.nx * HALF * s, y, p.z + p.nz * HALF * s, detailed));
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

  /* ---- 屋面 ---- */
  const roofP = roofPath.map((q) => ({ ...q, y: q.y + CORRIDOR.floorH + LV.eave }));
  buckets.roof.push(buildRoof(roofP));

  /* ---- 檐口：瓦当滴水 + 椽头飞椽 ---- */
  if (detailed) {
    const eavePath = finePath.map((q) => ({ ...q, y: q.y + CORRIDOR.floorH + LV.eave }));
    for (const s of [-1, 1]) {
      buckets.roof.push(buildEaveTileBand(eavePath, s));
      const r = buildRafterRow(finePath, s, 0.85);
      if (r) buckets.wood.push(r);
    }
  } else {
    // 简化檐口：一条封檐板（省掉瓦当与椽头）
    for (const s of [-1, 1]) {
      const fascia = [
        { u: s * (EAVE_U - 0.02), h: LV.eave - 0.16, v: 0 },
        { u: s * (EAVE_U + 0.01), h: LV.eave - 0.16, v: 1 },
        { u: s * (EAVE_U + 0.01), h: LV.eave - 0.02, v: 2 },
        { u: s * (EAVE_U - 0.02), h: LV.eave - 0.02, v: 3 },
      ];
      const fp = beamPath.map((q) => ({ ...q, y: q.y + CORRIDOR.floorH }));
      buckets.wood.push(extrudeProfile(fascia, fp, { uScale: 0.5 }));
    }
  }

  /* ---- 美人靠 ---- */
  const side = pickMeiRenSide(finePath, sceneData);
  const mr = buildMeiRenKao(beamPath, side, detailed, heightAt);
  if (mr) {
    buckets.wood.push(mr.seat, mr.hand);
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
    buildOneCorridor(line, heightAt, buckets, len >= CORRIDOR.LOD_A, sceneData);
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
  buildOneCorridor(line, heightAt, buckets, len >= CORRIDOR.LOD_A, sceneData || {});
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
