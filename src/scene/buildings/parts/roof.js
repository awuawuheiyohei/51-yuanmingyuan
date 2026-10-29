/**
 * 清式屋顶参数化生成
 *
 * 关键做法
 * --------
 * 1. 举折曲面：屋面从脊到檐不是直线，而是"脊部陡、檐部缓"的凹曲面。
 *    用 h(t) = t^P (P≈0.62) 表达，P<1 时导数单调递减 → 上陡下缓。
 * 2. 统一高度场：以脊线为界，用「沿脊距离」和「离脊的横向距离」共同
 *    决定高度，使庑殿（斜脊）、悬山（硬山）、攒尖（尖顶）能用同一套公式。
 * 3. 翼角起翘：只在四角区域抬升并外扩平面，形成中国屋顶特有的"翘角"。
 *
 * 支持：庑殿 / 歇山 / 悬山 / 硬山 / 卷棚 / 攒尖(方·圆) / 盝顶
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const P_CURVE = 0.62; // 举折指数：<1 上陡下缓

/** 举折剖面：t∈[0,1] 从脊到檐，返回下坠比例 */
function fold(t) {
  const c = Math.min(1, Math.max(0, t));
  return Math.pow(c, P_CURVE);
}

/** 平滑阶跃 */
function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * @typedef {object} RoofSpec
 * @property {number} width  面阔（X，建筑本体宽）
 * @property {number} depth  进深（Z，建筑本体深）
 * @property {number} eaveY  檐口高度
 * @property {number} rise   脊高比檐口的抬升量
 * @property {string} type   'wudian'|'xieshan'|'xuanshan'|'yingshan'|'juanpeng'|'zanjiandian'|'luding'
 * @property {number} overhang 出檐（Z 方向）
 * @property {number} overhangX 出檐（X 方向，仅悬山/硬山）
 * @property {number} hipRunX 歇山：檐口相对山花外伸的横向距离
 * @property {number} upturn 翼角起翘量（米）
 * @property {number} bulge   翼角平面外扩量（米）
 * @property {number} circular 是否圆形攒尖
 */

/**
 * 生成屋顶。
 * @param {RoofSpec} spec
 * @returns {{ geoms: Map<string, THREE.BufferGeometry[]>, meta: object }}
 */
export function buildRoof(spec) {
  const {
    width,
    depth,
    eaveY,
    rise,
    type = 'xieshan',
    overhang = 1.3,
    overhangX = 0.9,
    hipRunX = 4.0,
    upturn = 0.85,
    bulge = 0.5,
    circular = false,
    segments = 1,
  } = spec;

  const geoms = new Map();
  const push = (key, g) => {
    if (!geoms.has(key)) geoms.set(key, []);
    geoms.get(key).push(g);
  };

  // ---------- 平面尺寸 ----------
  const Wx = width / 2 + (type === 'xuanshan' ? overhangX : overhang);
  const Wz = depth / 2 + overhang;

  // 脊线半长
  let xh; // 硬山/悬山：脊沿 X 贯通；庑殿：按 45° 斜脊收进
  if (type === 'wudian') xh = Math.max(0, Wx - Wz);
  else if (type === 'zanjiandian') xh = 0;
  else if (type === 'xieshan') xh = Math.max(0.5, Wx - hipRunX);
  else if (type === 'yingshan') xh = width / 2;
  else xh = Wx; // 悬山 / 卷棚

  // 歇山的折线高度与折线半深
  const yBreak = eaveY + rise * 0.42;
  const tBreak = Math.pow(0.42, 1 / P_CURVE); // 使 fold(tBreak)=0.42
  const zBreak = Wz * tBreak;

  const ridgeY = eaveY + rise;

  /* ------------------------------------------------------------ 高度场 */
  /**
   * @returns {number} 屋面高度
   */
  function heightAt(x, z) {
    const az = Math.abs(z);
    const ax = Math.abs(x);

    if (type === 'luding') return eaveY + rise * 0.12; // 盝顶：平顶

    if (type === 'zanjiandian') {
      // 攒尖：锥面。方形取切比雪夫距离，圆形取径向
      const tx = circular ? ax / Wx : ax / Wx;
      const tz = circular ? az / Wz : az / Wz;
      const t = circular ? Math.hypot(tx, tz) : Math.max(tx, tz);
      return eaveY + rise * (1 - fold(Math.min(1, t)));
    }

    if (type === 'xieshan') {
      // 上部：山面之上的悬山段（|z| ≤ zBreak，|x| ≤ xh）
      // 下部：庑殿段
      if (az <= zBreak) {
        if (ax <= xh) {
          return ridgeY - rise * fold(az / zBreak);
        }
        return null; // 山花区域：竖直面，稍后单独生成
      }
      const u = Math.max(0, ax - xh);
      const tz = (az - zBreak) / (Wz - zBreak);
      const gLower = (1 - fold(tz)) * (1 - Math.min(1, u / hipRunX));
      // 与上部衔接：|z|=zBreak 处必须等于 yBreak
      const base = yBreak - (yBreak - eaveY) * fold(tz);
      return base * (0.5 + 0.5 * (1 - Math.min(1, u / hipRunX))) + (1 - (1 - Math.min(1, u / hipRunX))) * ridgeY * 0;
    }

    // 庑殿 / 悬山 / 硬山 / 卷棚
    const base = ridgeY - rise * fold(az / Wz);
    if (ax <= xh) return base;

    if (type === 'wudian') {
      // 45° 斜脊收头
      const u = ax - xh;
      const g = (1 - fold(az / Wz)) * (1 - Math.min(1, u / Wz));
      return eaveY + rise * g;
    }
    if (type === 'juanpeng') {
      // 卷棚：两端圆缓收头，无正脊
      const u = ax - xh;
      const k = 1 - smoothstep(0, Math.max(1, Wx - xh) * 0.9, u);
      return eaveY + (base - eaveY) * k;
    }
    return base; // 悬山 / 硬山：山面垂直封闭
  }

  /* -------------------------------------------------- 屋面网格（高度场） */
  const NU = segments >= 2 ? Math.min(64, Math.round(segments)) : 26;
  const NV = NU;

  const pos = [];
  const uv = [];
  const idx = [];

  const pushVert = (x, y, z, u, v) => {
    pos.push(x, y, z);
    uv.push(u, v);
    return pos.length / 3 - 1;
  };

  if (circular) {
    // 圆形攒尖：极坐标网格
    const rings = NV;
    const segs = NU * 2;
    for (let i = 0; i <= rings; i++) {
      const t = i / rings;
      const r = Wx * t;
      for (let j = 0; j <= segs; j++) {
        const a = (j / segs) * Math.PI * 2;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r * (Wz / Wx);
        const y = heightAt(x, z);
        pushVert(x, y, z, j / segs, t);
      }
    }
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < segs; j++) {
        const a = i * (segs + 1) + j;
        const b = a + 1;
        const c = a + segs + 1;
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
  } else {
    // 矩形网格
    const rows = [];
    for (let i = 0; i <= NV; i++) {
      const tz = i / NV;
      const z = -Wz + 2 * Wz * tz;
      const row = [];
      for (let j = 0; j <= NU; j++) {
        const tx = j / NU;
        const x = -Wx + 2 * Wx * tx;
        row.push([x, z]);
      }
      rows.push(row);
    }
    // 记下每格是否属于"山花竖面"（歇山），这类格子跳过，改生成竖直三角面
    const isShanhua = (x, z) =>
      type === 'xieshan' && Math.abs(z) <= zBreak && Math.abs(x) > xh;

    const grid = [];
    for (let i = 0; i <= NV; i++) {
      const row = [];
      for (let j = 0; j <= NU; j++) {
        const [x0, z0] = rows[i][j];
        let x = x0;
        let z = z0;
        let y = heightAt(x0, z0);
        if (y === null) {
          // 山花区域：顶点放到折线高度，交由竖直面单独处理
          y = yBreak;
        }
        // 翼角：仅在四角抬升 + 外扩
        const cn =
          Math.pow(Math.abs(x0) / Wx, 5) * Math.pow(Math.abs(z0) / Wz, 5);
        if (cn > 0.0005) {
          const eaveT = smoothstep(0.35, 1.0, Math.abs(z0) / Wz);
          const lift = upturn * cn * eaveT;
          x = x0 * (1 + (bulge * cn) / Math.max(Wx, 0.001));
          z = z0 * (1 + (bulge * cn) / Math.max(Wz, 0.001));
          y += lift;
        }
        row.push(pushVert(x, y, z, j / NU, i / NV));
      }
      grid.push(row);
    }
    for (let i = 0; i < NV; i++) {
      for (let j = 0; j < NU; j++) {
        const x0 = -Wx + 2 * Wx * (j / NU);
        const x1 = -Wx + 2 * Wx * ((j + 1) / NU);
        const z0 = -Wz + 2 * Wz * (i / NV);
        const z1 = -Wz + 2 * Wz * ((i + 1) / NV);
        const corners = [
          [x0, z0],
          [x1, z0],
          [x1, z1],
          [x0, z1],
        ];
        // 歇山：|z|<=zBreak 且 |x|>xh 的区域不铺屋面（山花另建）
        let skip = false;
        if (type === 'xieshan') {
          for (const [cx, cz] of corners) {
            if (Math.abs(cz) <= zBreak && Math.abs(cx) > xh) skip = true;
          }
        }
        if (skip) continue;
        const a = grid[i][j];
        const b = grid[i][j + 1];
        const c = grid[i + 1][j + 1];
        const d = grid[i + 1][j];
        idx.push(a, d, b, b, d, c);
      }
    }
  }

  const roofGeo = new THREE.BufferGeometry();
  roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  roofGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  roofGeo.setIndex(idx);
  roofGeo.computeVertexNormals();
  // UV 按实际尺寸铺瓦垄，避免屋面出现拉伸
  const uvAttr = roofGeo.getAttribute('uv');
  for (let i = 0; i < uvAttr.count; i++) {
    uvAttr.setXY(i, uvAttr.getX(i) * (width / 8), uvAttr.getY(i) * (depth / 8));
  }
  uvAttr.needsUpdate = true;
  push('tile', roofGeo);

  /* -------------------------------------------------- 山花（歇山竖面） */
  if (type === 'xieshan') {
    for (const sgn of [-1, 1]) {
      const x = sgn * xh;
      const g = new THREE.BufferGeometry();
      const v = [
        x, ridgeY, 0,
        x, yBreak, zBreak,
        x, yBreak, -zBreak,
      ];
      g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      g.setAttribute(
        'uv',
        new THREE.Float32BufferAttribute([0, 1, 1, 0, 1, 1], 2)
      );
      g.setIndex(sgn > 0 ? [0, 1, 2] : [0, 2, 1]);
      g.computeVertexNormals();
      push('shanhua', g);
    }
  }

  /* ---------------------------------------------------------- 山墙（硬山） */
  if (type === 'yingshan' || type === 'xuanshan') {
    const gw = type === 'xuanshan' ? width / 2 : Wx;
    for (const sgn of [-1, 1]) {
      const x = sgn * gw;
      const v = [x, eaveY - 0.4, 0, x, eaveY, zBreakGable(Wz, eaveY, rise), x, eaveY, -zBreakGable(Wz, eaveY, rise)];
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0.5, 1, 0.5], 2));
      g.setIndex(sgn > 0 ? [0, 1, 2] : [0, 2, 1]);
      g.computeVertexNormals();
      push('wall', g);
    }
  }

  /* -------------------------------------------------------------- 屋脊 */
  const ridges = [];
  if (type === 'wudian' || type === 'xieshan') {
    ridges.push({
      kind: 'main',
      pts: [
        new THREE.Vector3(-xh, ridgeY, 0),
        new THREE.Vector3(xh, ridgeY, 0),
      ],
    });
  } else if (type === 'xuanshan' || type === 'yingshan') {
    ridges.push({
      kind: 'main',
      pts: [
        new THREE.Vector3(-xh, ridgeY, 0),
        new THREE.Vector3(xh, ridgeY, 0),
      ],
    });
  } else if (type === 'juanpeng') {
    // 卷棚：无正脊，用圆弧脊代替
    const pts = [];
    const N = 14;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const x = -xh + 2 * xh * t;
      const y = ridgeY - rise * 0.02 * Math.sin(t * Math.PI) - (type === 'juanpeng' ? 0 : 0);
      pts.push(new THREE.Vector3(x, y, 0));
    }
    ridges.push({ kind: 'roll', pts });
  } else if (type === 'zanjiandian') {
    ridges.push({ kind: 'finial', apex: new THREE.Vector3(0, eaveY + rise, 0) });
  }

  // 垂脊 / 戗脊
  if (type === 'wudian') {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        ridges.push({
          kind: 'hip',
          pts: hipLine(sx, sz),
        });
      }
    }
  } else if (type === 'xieshan') {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        ridges.push({
          kind: 'hip',
          pts: [
            new THREE.Vector3(sx * xh, yBreak, sz * zBreak),
            new THREE.Vector3(sx * (Wx - 0.25), eaveY + 0.12, sz * (Wz - 0.25)),
          ],
        });
      }
    }
  } else if (type === 'juanpeng') {
    // 卷棚两端圆缓收头脊
    for (const sx of [-1, 1]) {
      ridges.push({
        kind: 'roll',
        pts: [
          new THREE.Vector3(sx * xh, ridgeY, 0),
          new THREE.Vector3(sx * (xh + (Wx - xh) * 0.45), ridgeY - rise * 0.28, 0),
          new THREE.Vector3(sx * Wx, eaveY + rise * 0.02, 0),
        ],
      });
    }
  }

  function hipLine(sx, sz) {
    const pts = [];
    const N = 8;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const x = sx * (xh + (Wx - xh) * t);
      const z = sz * Wz * t;
      const y = eaveY + rise * (1 - fold(t)) * (1 - t);
      pts.push(new THREE.Vector3(x, Math.max(y, eaveY + 0.05), z));
    }
    return pts;
  }

  /* -------------------------------------------------------- 脊件几何 */
  for (const r of ridges) {
    if (r.kind === 'finial') {
      push('finial', buildFinial(r.apex, width));
    } else {
      push('ridge', buildRidgeBar(r.pts, r.kind === 'hip' ? 0.42 : 0.55, r.kind === 'hip' ? 0.42 : 0.62));
      // 正脊两端的鸱吻 + 脊上小兽
      if (r.kind === 'main') {
        push('finial', buildChiwen(r.pts, 0.62));
      }
      // 垂脊/戗脊上的小兽（简化）
      if (r.kind === 'hip') {
        push('finial', buildBeastRow(r.pts, 0.26, 3));
      }
    }
  }

  /* ---------------------------------------------------------- 檐口构件 */
  push('eave', buildEaveTrim(Wx, Wz, eaveY, type, xh, Wz, Wx));
  push('finial', buildWadang(Wx, Wz, eaveY, type, xh));

  return {
    geoms,
    meta: { Wx, Wz, ridgeY, eaveY, xh, zBreak, yBreak, type },
  };
}

/** 鸱吻：正脊两端的兽头饰件 */
function buildChiwen(pts, h) {
  const parts = [];
  for (const end of [pts[0], pts[pts.length - 1]]) {
    const g = new THREE.Group();
    // 主体
    const body = new THREE.BoxGeometry(h * 0.34, h * 0.62, h * 0.5);
    body.translate(0, h * 0.31, 0);
    parts.push(body);
    // 上卷的尾
    const curl = new THREE.CylinderGeometry(h * 0.16, h * 0.2, h * 0.42, 6);
    curl.rotateZ(end === pts[0] ? -0.5 : 0.5);
    curl.translate(end === pts[0] ? -h * 0.14 : h * 0.14, h * 0.72, 0);
    parts.push(curl);
    // 吻兽的嘴
    const snout = new THREE.BoxGeometry(h * 0.2, h * 0.16, h * 0.34);
    snout.translate(end === pts[0] ? h * 0.1 : -h * 0.1, h * 0.12, 0);
    parts.push(snout);
    for (const p of parts.slice(-3)) {
      p.translate(end.x, end.y, end.z);
    }
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/** 脊上小兽：一串简化走兽 */
function buildBeastRow(pts, size, count) {
  const parts = [];
  const curve = new THREE.CatmullRomCurve3(pts);
  for (let i = 0; i < count; i++) {
    const t = 0.16 + (i / count) * 0.68;
    const p = curve.getPoint(t);
    const g = new THREE.BoxGeometry(size * 0.5, size * 0.85, size * 0.45);
    g.rotateY(i * 0.7);
    g.translate(p.x, p.y + size * 0.7, p.z);
    parts.push(g);
    const head = new THREE.SphereGeometry(size * 0.26, 6, 5);
    head.translate(p.x, p.y + size * 1.18, p.z);
    parts.push(head);
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/** 瓦当滴水：檐口一排小圆瓦当 */
function buildWadang(Wx, Wz, eaveY, type, xh) {
  const parts = [];
  const r = 0.09;
  const mk = (x, z, ry) => {
    const g = new THREE.CylinderGeometry(r, r, 0.07, 8);
    g.rotateX(Math.PI / 2);
    if (ry) g.rotateY(ry);
    g.translate(x, eaveY - 0.14, z);
    parts.push(g);
  };
  const step = 0.34;
  const n = Math.max(6, Math.floor((Wx * 2) / step));
  for (let i = 0; i <= n; i++) {
    const x = -Wx + (i * Wx * 2) / n;
    mk(x, Wz - 0.04, 0);
    mk(x, -(Wz - 0.04), 0);
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/** 硬山/悬山山墙的起坡点：屋面与山墙的交线 z */
function zBreakGable(Wz, eaveY, rise) {
  // 屋面在山墙处的高度 = eaveY + rise*(1-fold(t))，山墙从 eaveY 起到该高度
  // 取 t 使其约 0.42*rise，简化用折线求解
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const y = eaveY + rise * (1 - Math.pow(mid, P_CURVE));
    if (y < eaveY + rise * 0.42) lo = mid;
    else hi = mid;
  }
  return Wz * hi;
}

/** 正脊/垂脊：一串截面沿折线扫掠 */
function buildRidgeBar(points, width, height) {
  const shape = new THREE.Shape();
  const w = width / 2;
  const h = height;
  shape.moveTo(-w, 0);
  shape.lineTo(-w * 0.85, h);
  shape.lineTo(0, h * 1.18);
  shape.lineTo(w * 0.85, h);
  shape.lineTo(w, 0);
  shape.closePath();

  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.05);
  const segs = Math.max(4, Math.min(64, points.length * 6));
  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: segs,
    bevelEnabled: false,
    extrudePath: curve,
  });
  return geo;
}

/** 攒尖宝顶 */
function buildFinial(apex, width) {
  const parts = [];
  const r = Math.min(1.1, width * 0.055);
  const base = new THREE.CylinderGeometry(r * 1.25, r * 1.4, r * 0.8, 12);
  base.translate(apex.x, apex.y + r * 0.4, apex.z);
  parts.push(base);
  const ball = new THREE.SphereGeometry(r, 12, 10);
  ball.translate(apex.x, apex.y + r * 1.3, apex.z);
  parts.push(ball);
  const neck = new THREE.CylinderGeometry(r * 0.45, r * 0.8, r * 0.9, 10);
  neck.translate(apex.x, apex.y + r * 2.1, apex.z);
  parts.push(neck);
  const flame = new THREE.ConeGeometry(r * 0.6, r * 1.6, 10);
  flame.translate(apex.x, apex.y + r * 3.1, apex.z);
  parts.push(flame);
  return mergeGeometries(parts, false);
}

/** 檐口：檐檩条 + 椽头 + 瓦当 */
function buildEaveTrim(Wx, Wz, eaveY, type, xh, wz, wx) {
  const parts = [];
  const t = 0.16;
  const h = 0.26;
  // 前后檐口条
  for (const sz of [-1, 1]) {
    const g = new THREE.BoxGeometry(Wx * 2, h, t);
    g.translate(0, eaveY - h / 2 + 0.05, sz * Wz);
    parts.push(g);
  }
  // 两端檐口条（庑殿/歇山是斜脊，只在山花段有）
  if (type === 'xuanshan' || type === 'yingshan' || type === 'juanpeng') {
    for (const sx of [-1, 1]) {
      const g = new THREE.BoxGeometry(t, h, Wz * 2);
      g.translate(sx * Wx, eaveY - h / 2 + 0.05, 0);
      parts.push(g);
    }
  }
  // 椽头：沿前后檐每 0.45m 一根
  const step = 0.45;
  const count = Math.max(4, Math.floor((Wx * 2) / step));
  const rafter = new THREE.BoxGeometry(0.1, 0.1, 0.42);
  for (let i = 0; i < count; i++) {
    const x = -Wx + (i + 0.5) * (Wx * 2 / count);
    for (const sz of [-1, 1]) {
      const g = rafter.clone();
      g.translate(x, eaveY - 0.12, sz * (Wz - 0.2));
      parts.push(g);
    }
  }
  rafter.dispose?.();
  return mergeGeometries(parts, false);
}
