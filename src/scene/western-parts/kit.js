/**
 * 西洋楼几何零件库
 *
 * 原则（AGENTS.md §4.1）：**建模比贴图精细度高得多**。
 * 这里提供的每个零件都是实体几何：券洞、卷涡、番花、兽首、翻尾石鱼……
 * 贴图只负责连续表面（砖缝、木纹、石材浮雕底纹）。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { UVK, mergeAll } from './materials.js';

/* ============================================================ 基础体 */

/**
 * 世界尺度投影 UV：按法线主轴做三向投影，1 UV 单位 = 32 m。
 * 这样贴图在所有零件上的密度一致，不会出现"大面糊成一块"。
 */
export function worldUV(geo, scale = UVK) {
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = Math.abs(nrm.getX(i));
    const ny = Math.abs(nrm.getY(i));
    const nz = Math.abs(nrm.getZ(i));
    let u;
    let v;
    if (nx >= ny && nx >= nz) {
      u = z;
      v = y;
    } else if (ny >= nx && ny >= nz) {
      u = x;
      v = z;
    } else {
      u = x;
      v = y;
    }
    uv[i * 2] = u * scale;
    uv[i * 2 + 1] = v * scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

export function box(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  return worldUV(g);
}

export function boxAt(w, h, d, x, y, z) {
  const g = box(w, h, d);
  g.translate(x, y, z);
  return g;
}

export function cyl(rt, rb, h, seg = 12, open = false) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  return worldUV(g);
}

export function cylAt(rt, rb, h, x, y, z, seg = 12) {
  const g = cyl(rt, rb, h, seg);
  g.translate(x, y, z);
  return g;
}

export function sph(r, w = 12, h = 8) {
  const g = new THREE.SphereGeometry(r, w, h);
  return worldUV(g);
}

export function cone(r, h, seg = 10) {
  const g = new THREE.ConeGeometry(r, h, seg);
  return worldUV(g);
}

export function torus(r, t, seg = 8, rings = 16, arc = Math.PI * 2) {
  const g = new THREE.TorusGeometry(r, t, seg, rings, arc);
  return worldUV(g);
}

export function lathe(pts, seg = 14) {
  const g = new THREE.LatheGeometry(pts, seg);
  return worldUV(g);
}

/** 绕 Y 轴旋转一个几何体 */
export function rotY(geo, a) {
  geo.rotateY(a);
  return geo;
}
/** 绕 X 轴旋转 */
export function rotX(geo, a) {
  geo.rotateX(a);
  return geo;
}
/** 绕 Z 轴旋转 */
export function rotZ(geo, a) {
  geo.rotateZ(a);
  return geo;
}

/* ============================================================ 巴洛克饰件 */

/**
 * 卷涡（volute）：阿基米德螺线带，末端收细。
 * 巴洛克最认得出的一个符号，谐奇趣番花柱、远瀛观门楣都用它。
 */
export function volute(size = 1, depth = 0.14, turns = 1.55) {
  const steps = 34;
  const outer = [];
  const inner = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * turns * Math.PI * 2;
    const r = size * (0.16 + 0.84 * t);
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    const dr = size * 0.84;
    const tx = -Math.sin(a) * dr;
    const ty = Math.cos(a) * r;
    const len = Math.hypot(tx, ty) || 1;
    const nx = ty / len;
    const ny = -tx / len;
    const w = size * 0.19 * (1 - t * 0.78);
    outer.push([x + nx * w, y + ny * w]);
    inner.push([x - nx * w, y - ny * w]);
  }
  const shape = new THREE.Shape();
  shape.moveTo(outer[0][0], outer[0][1]);
  for (const p of outer) shape.lineTo(p[0], p[1]);
  for (let i = inner.length - 1; i >= 0; i--) shape.lineTo(inner[i][0], inner[i][1]);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 4 });
  g.computeVertexNormals();
  return worldUV(g);
}

/** 番花叶（acanthus leaf） */
export function leaf(len = 1, wid = 0.34, depth = 0.07) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(wid, len * 0.16, wid * 0.72, len * 0.7, 0, len);
  s.bezierCurveTo(-wid * 0.72, len * 0.7, -wid, len * 0.16, 0, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 7 });
  g.computeVertexNormals();
  return worldUV(g);
}

/**
 * 番花饰带：卷涡 + 叶子的循环纹样，贴在墙面/柱身上。
 * @param {number} len 带长
 * @param {number} h  带高
 * @param {number} depth 浮雕凸出
 */
export function acanthusBand(len, h, depth = 0.06) {
  const parts = [];
  const unit = h * 1.5;
  const n = Math.max(1, Math.round(len / unit));
  const step = len / n;
  for (let i = 0; i < n; i++) {
    const cx = -len / 2 + step * (i + 0.5);
    const lf = leaf(h * 0.92, h * 0.34, depth);
    lf.translate(cx, 0, 0);
    parts.push(lf);
    const v = volute(h * 0.42, depth * 0.9, 1.4);
    v.rotateZ(Math.PI * 0.5);
    v.translate(cx + step * 0.34, h * 0.1, 0);
    parts.push(v);
    const v2 = volute(h * 0.3, depth * 0.8, 1.3);
    v2.rotateZ(-Math.PI * 0.55);
    v2.translate(cx - step * 0.36, h * 0.06, 0);
    parts.push(v2);
  }
  return mergeAll(parts);
}

/** 巴洛克山花（三角檐饰），内含涡卷浮雕 */
export function pediment(w, h, depth = 0.5, relief = true) {
  const parts = [];
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, h);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
  g.computeVertexNormals();
  worldUV(g);
  parts.push(g);
  if (relief) {
    const v = volute(h * 0.3, 0.09, 1.5);
    v.translate(0, h * 0.22, depth);
    parts.push(v);
    for (const sx of [-1, 1]) {
      const lf = leaf(h * 0.55, h * 0.2, 0.07);
      lf.rotateZ(sx * 0.5);
      lf.translate(sx * w * 0.22, h * 0.12, depth);
      parts.push(lf);
    }
  }
  return mergeAll(parts);
}

/** 线脚（檐部）：几道叠涩线脚，巴洛克立面的水平分界 */
export function cornice(len, depth, h = 0.5, dirZ = 1) {
  const parts = [];
  const layers = [
    [0.0, 0.16, 1.0],
    [0.16, 0.12, 1.14],
    [0.28, 0.1, 0.94],
    [0.38, 0.12, 1.1],
  ];
  for (const [y, t, k] of layers) {
    parts.push(boxAt(len * k, t, depth * k, 0, y + t / 2, (dirZ * depth * (k - 1)) / 2));
  }
  return mergeAll(parts);
}

/** 壁柱：柱身 + 柱础 + 柱头（三段式，不是光板） */
export function pilaster(h, w = 0.6, d = 0.34) {
  const parts = [];
  parts.push(boxAt(w, h - 0.5, d, 0, h / 2, 0));
  // 柱础
  parts.push(boxAt(w * 1.45, 0.2, d * 1.5, 0, 0.1, 0));
  parts.push(boxAt(w * 1.22, 0.1, d * 1.3, 0, 0.25, 0));
  // 柱头
  parts.push(boxAt(w * 1.1, 0.12, d * 1.2, 0, h - 0.44, 0));
  parts.push(boxAt(w * 1.32, 0.1, d * 1.42, 0, h - 0.33, 0));
  const v = volute(w * 0.3, 0.07, 1.4);
  v.rotateY(Math.PI / 2);
  v.translate(0, h - 0.24, d * 0.72);
  parts.push(v);
  return mergeAll(parts);
}

/* ============================================================ 立面 */

/**
 * 带券洞的墙板（巴洛克立面）。
 * openings: [{x, y, w, h}] —— x 为洞心（相对板心），y 为洞底标高，h 为洞高（含半圆顶）
 */
export function archedPanel(w, h, d, openings = []) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(w / 2, h);
  shape.lineTo(-w / 2, h);
  shape.closePath();
  for (const o of openings) {
    const r = Math.min(o.w / 2, o.h / 2);
    const p = new THREE.Path();
    const y1 = o.y + o.h - r;
    p.moveTo(o.x - r, o.y);
    p.lineTo(o.x - r, y1);
    p.absarc(o.x, y1, r, Math.PI, 0, true);
    p.lineTo(o.x + r, o.y);
    p.closePath();
    shape.holes.push(p);
  }
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: d,
    bevelEnabled: false,
    curveSegments: 8,
  });
  g.translate(0, 0, -d / 2);
  g.computeVertexNormals();
  return worldUV(g);
}

/** 券洞里的窗（玻璃 + 铜窗框 + 三角假门楣） */
export function frenchWindow(w, h, thick = 0.12) {
  const parts = [];
  // 玻璃
  const glass = boxAt(w - 0.24, h - 0.24, 0.05, 0, h / 2, 0);
  parts.push(glass);
  return { glass: mergeAll(parts), frame: null };
}

/** 券花窗的框（石材）：外框 + 窗楣 + 键槽 */
export function windowSurround(w, h, d = 0.22) {
  const parts = [];
  const t = 0.22;
  const r = w / 2;
  const y1 = h - r;
  // 两侧竖边
  parts.push(boxAt(t, y1, d, -r - t / 2, y1 / 2, 0));
  parts.push(boxAt(t, y1, d, r + t / 2, y1 / 2, 0));
  // 拱券（用分段小方块垒出半圆）
  const n = 7;
  for (let i = 0; i <= n; i++) {
    const a = Math.PI - (i / n) * Math.PI;
    const cx = Math.cos(a) * (r + t / 2);
    const cy = y1 + Math.sin(a) * (r + t / 2);
    const b = box(t * 1.25, t * 1.5, d);
    b.rotateZ(a - Math.PI / 2);
    b.translate(cx, cy, 0);
    parts.push(b);
  }
  // 窗楣线脚
  parts.push(boxAt(w + t * 3, 0.16, d * 1.3, 0, h + 0.12, 0));
  return mergeAll(parts);
}

/* ============================================================ 台基与栏 */

/** 西洋石栏杆：地座 + 车削望柱 + 扶手 */
export function baluster(h = 0.8, r = 0.11) {
  const prof = [
    [0.0, 1.25],
    [0.05, 1.3],
    [0.1, 1.0],
    [0.18, 0.62],
    [0.4, 0.52],
    [0.5, 0.8],
    [0.6, 0.52],
    [0.8, 0.48],
    [0.9, 0.9],
    [0.97, 1.2],
    [1.0, 0.9],
  ];
  const pts = prof.map(([t, rs]) => new THREE.Vector2(r * rs, t * h));
  return lathe(pts, 10);
}

/** 一段西洋石栏杆 */
export function balustrade(len, h = 0.95, r = 0.11) {
  const parts = [];
  parts.push(boxAt(len, 0.13, 0.34, 0, 0.065, 0));
  const n = Math.max(2, Math.round(len / 1.35));
  const bh = h - 0.26;
  for (let i = 0; i <= n; i++) {
    const x = -len / 2 + (len * i) / n;
    const b = baluster(bh, r);
    b.translate(x, 0.13, 0);
    parts.push(b);
  }
  parts.push(boxAt(len, 0.12, 0.4, 0, h - 0.06, 0));
  return mergeAll(parts);
}

/**
 * 台阶（无垂带，西洋式）：顶踏步贴着 z=0，向 +Z（南）逐级降到地面。
 */
export function steps(w, h, d, n = 5) {
  const parts = [];
  const sh = h / n;
  const sd = d / n;
  for (let i = 0; i < n; i++) {
    const top = h - i * sh;
    parts.push(boxAt(w, top + 0.01, sd * 1.04, 0, (top + 0.01) / 2, sd * (i + 0.5)));
  }
  return mergeAll(parts);
}

/** 弧形（半环）石阶：方外观的半环形石阶、远瀛观的弧形石梯 */
export function curvedSteps(rInner, rOuter, a0, a1, y0, y1, n = 10) {
  const parts = [];
  const seg = 4;
  const arcLen = (Math.abs(a1 - a0) * rOuter) / n;
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const am = a0 + (a1 - a0) * (t0 + 0.5 / n);
    const y = y0 + (y1 - y0) * t0;
    for (let k = 0; k < seg; k++) {
      const aa = am + ((k + 0.5) / seg - 0.5) * ((a1 - a0) / n);
      const b = box(rOuter - rInner, (y1 - y0) / n + 0.02, arcLen * 1.08);
      b.translate((rInner + rOuter) / 2, y + (y1 - y0) / n / 2, 0);
      b.rotateY(-aa);
      parts.push(b);
    }
  }
  return mergeAll(parts);
}

/** 螺旋马道（线法山四面盘旋马道）：沿圆周盘旋的坡道 */
export function spiralRamp(r, y0, y1, turns = 1.6, width = 3.2, seg = 40) {
  const parts = [];
  for (let i = 0; i < seg; i++) {
    const t0 = i / seg;
    const t1 = (i + 1) / seg;
    const a0 = t0 * turns * Math.PI * 2;
    const a1 = t1 * turns * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const y = y0 + (y1 - y0) * t0;
    const arc = Math.abs(a1 - a0) * r;
    const b = box(width, 0.5, arc * 1.05);
    b.translate(0, y, 0);
    b.rotateY(-am);
    parts.push(b);
    // 挡土矮墙
    for (const s of [-1, 1]) {
      const wall = box(0.4, 0.8, arc * 1.05);
      wall.translate(s * (width / 2 + 0.2), y + 0.6, 0);
      wall.rotateY(-am);
      parts.push(wall);
    }
  }
  return mergeAll(parts);
}

/* ============================================================ 动物 */

/**
 * 兽首（十二生肖 / 铜狮 / 铜鹿共用）：头 + 吻 + 鼻 + 眼 + 耳 + 角/冠 + 鬃。
 * 朝向 +Z。
 */
export function beastHead(size = 1, opts = {}) {
  const {
    muzzle = 0.5,
    snout = 'box', // box | disc | beak | long | flat
    ear = 'round', // round | long | floppy | pointed | none
    horn = 'none', // none | cow | ram | dragon
    mane = false,
    crest = false,
    wide = 1,
    tusk = false,
  } = opts;
  const S = size;
  const parts = [];
  const eyes = [];

  // 颅
  const skull = sph(0.34 * S, 12, 9);
  skull.scale(wide, 0.88, 0.94);
  parts.push(skull);

  // 吻
  const mz = 0.3 * S;
  const ml = muzzle * S;
  if (snout === 'beak') {
    const b = cone(0.13 * S, ml, 8);
    b.rotateX(Math.PI / 2);
    b.translate(0, -0.02 * S, mz + ml / 2);
    parts.push(b);
  } else if (snout === 'disc') {
    const c = cyl(0.15 * S, 0.17 * S, 0.09 * S, 10);
    c.rotateX(Math.PI / 2);
    c.translate(0, -0.03 * S, mz + ml * 0.85);
    parts.push(c);
    for (const sx of [-1, 1]) {
      const n = cyl(0.018 * S, 0.018 * S, 0.03 * S, 6);
      n.rotateX(Math.PI / 2);
      n.translate(sx * 0.055 * S, -0.03 * S, mz + ml * 0.85 + 0.05 * S);
      parts.push(n);
    }
  } else if (snout === 'long') {
    const c = cyl(0.1 * S, 0.16 * S, ml, 9);
    c.rotateX(Math.PI / 2);
    c.translate(0, -0.04 * S, mz + ml / 2);
    parts.push(c);
  } else if (snout === 'flat') {
    const b = boxAt(0.3 * S, 0.17 * S, ml, 0, -0.02 * S, mz + ml / 2);
    parts.push(b);
  } else {
    const b = boxAt(0.22 * S * wide, 0.19 * S, ml, 0, -0.02 * S, mz + ml / 2);
    parts.push(b);
  }

  // 鼻头
  const nose = sph(0.055 * S, 8, 6);
  nose.translate(0, 0.01 * S, mz + ml * 0.96);
  parts.push(nose);

  // 眼
  for (const sx of [-1, 1]) {
    const e = sph(0.05 * S, 8, 6);
    e.translate(sx * 0.15 * S * wide, 0.09 * S, 0.2 * S);
    parts.push(e);
    eyes.push([sx * 0.15 * S * wide, 0.09 * S, 0.2 * S]);
  }

  // 耳
  if (ear === 'round') {
    for (const sx of [-1, 1]) {
      const e = sph(0.1 * S, 8, 6);
      e.scale(1, 1, 0.45);
      e.translate(sx * 0.27 * S * wide, 0.2 * S, 0.02 * S);
      parts.push(e);
    }
  } else if (ear === 'long') {
    for (const sx of [-1, 1]) {
      const e = sph(0.075 * S, 8, 6);
      e.scale(0.6, 2.1, 0.6);
      e.translate(sx * 0.11 * S * wide, 0.42 * S, -0.02 * S);
      parts.push(e);
    }
  } else if (ear === 'floppy') {
    for (const sx of [-1, 1]) {
      const e = sph(0.085 * S, 8, 6);
      e.scale(0.5, 1.5, 0.9);
      e.rotateZ(sx * 0.5);
      e.translate(sx * 0.3 * S * wide, 0.06 * S, 0.02 * S);
      parts.push(e);
    }
  } else if (ear === 'pointed') {
    for (const sx of [-1, 1]) {
      const e = cone(0.07 * S, 0.2 * S, 7);
      e.rotateZ(sx * 0.35);
      e.translate(sx * 0.22 * S * wide, 0.28 * S, -0.02 * S);
      parts.push(e);
    }
  }

  // 角
  if (horn === 'cow') {
    for (const sx of [-1, 1]) {
      const h = torus(0.13 * S, 0.032 * S, 6, 12, Math.PI * 1.1);
      h.rotateY(Math.PI / 2);
      h.rotateZ(sx * 0.6);
      h.translate(sx * 0.22 * S * wide, 0.24 * S, 0.02 * S);
      parts.push(h);
    }
  } else if (horn === 'ram') {
    for (const sx of [-1, 1]) {
      const h = torus(0.16 * S, 0.036 * S, 6, 14, Math.PI * 1.5);
      h.rotateY(Math.PI / 2);
      h.rotateZ(sx * 0.9);
      h.translate(sx * 0.19 * S * wide, 0.2 * S, 0.0);
      parts.push(h);
    }
  } else if (horn === 'dragon') {
    for (const sx of [-1, 1]) {
      const h = cone(0.04 * S, 0.34 * S, 6);
      h.rotateZ(sx * 0.75);
      h.translate(sx * 0.14 * S * wide, 0.3 * S, 0.0);
      parts.push(h);
      const b = cone(0.028 * S, 0.18 * S, 5);
      b.rotateZ(sx * 1.15);
      b.translate(sx * 0.24 * S * wide, 0.28 * S, -0.04 * S);
      parts.push(b);
    }
  }

  // 鬃
  if (mane) {
    const ring = torus(0.4 * S, 0.075 * S, 7, 16);
    ring.rotateX(Math.PI / 2);
    ring.scale(wide, 1, 0.85);
    ring.translate(0, 0.05 * S, -0.04 * S);
    parts.push(ring);
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2;
      const t = sph(0.075 * S, 6, 5);
      t.scale(1, 1.4, 1);
      t.translate(
        Math.cos(a) * 0.38 * S * wide,
        0.05 * S + Math.sin(a) * 0.34 * S,
        -0.06 * S + Math.cos(a) * 0.16 * S
      );
      parts.push(t);
    }
  }

  // 冠（鸡）
  if (crest) {
    for (let i = 0; i < 3; i++) {
      const c = sph(0.07 * S, 6, 5);
      c.scale(0.7, 1.5, 0.9);
      c.translate((i - 1) * 0.11 * S, 0.31 * S, 0.0);
      parts.push(c);
    }
  }

  // 獠牙
  if (tusk) {
    for (const sx of [-1, 1]) {
      const t = cone(0.03 * S, 0.16 * S, 6);
      t.rotateX(Math.PI);
      t.rotateZ(sx * 0.2);
      t.translate(sx * 0.09 * S, -0.1 * S, mz + ml * 0.85);
      parts.push(t);
    }
  }

  return mergeAll(parts);
}

/** 十二生肖兽首配置：每个生肖一套头型参数（考据要求"兽首人身"，各肖特征不同） */
export const ZODIAC = [
  { key: 'shu', name: '鼠', head: { muzzle: 0.34, snout: 'long', ear: 'round', wide: 0.9 } },
  { key: 'niu', name: '牛', head: { muzzle: 0.44, snout: 'flat', ear: 'pointed', horn: 'cow', wide: 1.15 } },
  { key: 'hu', name: '虎', head: { muzzle: 0.42, snout: 'box', ear: 'round', wide: 1.1 } },
  { key: 'tu', name: '兔', head: { muzzle: 0.34, snout: 'long', ear: 'long', wide: 0.85 } },
  { key: 'long', name: '龙', head: { muzzle: 0.56, snout: 'long', ear: 'pointed', horn: 'dragon', wide: 1.0 } },
  { key: 'she', name: '蛇', head: { muzzle: 0.52, snout: 'flat', ear: 'none', wide: 0.95 } },
  { key: 'ma', name: '马', head: { muzzle: 0.62, snout: 'long', ear: 'pointed', wide: 0.95 } },
  { key: 'yang', name: '羊', head: { muzzle: 0.4, snout: 'long', ear: 'floppy', horn: 'ram', wide: 0.9 } },
  { key: 'hou', name: '猴', head: { muzzle: 0.36, snout: 'flat', ear: 'round', wide: 1.05 } },
  { key: 'ji', name: '鸡', head: { muzzle: 0.3, snout: 'beak', ear: 'none', crest: true, wide: 0.85 } },
  { key: 'gou', name: '狗', head: { muzzle: 0.46, snout: 'box', ear: 'floppy', wide: 1.0 } },
  { key: 'zhu', name: '猪', head: { muzzle: 0.44, snout: 'disc', ear: 'pointed', wide: 1.1, tusk: true } },
];

/** 人身（兽首人身像的袍身 + 手臂） */
export function robedBody(size = 1, height = 1.9) {
  const parts = [];
  const prof = [
    [0.0, 0.46],
    [0.05, 0.42],
    [0.4, 0.3],
    [0.72, 0.22],
    [0.9, 0.19],
    [1.0, 0.13],
  ];
  const pts = prof.map(([t, r]) => new THREE.Vector2(r * size, t * height));
  parts.push(lathe(pts, 12));
  // 双臂
  for (const sx of [-1, 1]) {
    const arm = cyl(0.055 * size, 0.075 * size, height * 0.44, 8);
    arm.rotateZ(sx * 0.28);
    arm.translate(sx * 0.21 * size, height * 0.52, 0.02 * size);
    parts.push(arm);
    const hand = sph(0.06 * size, 7, 5);
    hand.translate(sx * 0.3 * size, height * 0.3, 0.05 * size);
    parts.push(hand);
  }
  return mergeAll(parts);
}

/** 铜鹿：体 + 颈 + 头 + 四腿 + 尾 + 八杈鹿角 */
export function bronzeDeer(size = 1) {
  const S = size;
  const parts = [];
  const body = sph(0.5 * S, 12, 9);
  body.scale(0.78, 0.82, 1.5);
  body.translate(0, 1.05 * S, 0);
  parts.push(body);
  // 颈
  const neck = cyl(0.14 * S, 0.2 * S, 0.6 * S, 9);
  neck.rotateX(-0.5);
  neck.translate(0, 1.45 * S, 0.5 * S);
  parts.push(neck);
  // 头
  const head = sph(0.2 * S, 10, 8);
  head.scale(0.8, 0.9, 1.3);
  head.translate(0, 1.72 * S, 0.72 * S);
  parts.push(head);
  const muzzle = cyl(0.07 * S, 0.11 * S, 0.2 * S, 8);
  muzzle.rotateX(Math.PI / 2);
  muzzle.translate(0, 1.66 * S, 0.9 * S);
  parts.push(muzzle);
  for (const sx of [-1, 1]) {
    const ear = sph(0.07 * S, 7, 5);
    ear.scale(0.4, 1.2, 0.8);
    ear.rotateZ(sx * 0.6);
    ear.translate(sx * 0.14 * S, 1.8 * S, 0.66 * S);
    parts.push(ear);
  }
  // 八杈鹿角：主干 + 分枝
  for (const sx of [-1, 1]) {
    const base = new THREE.Vector3(sx * 0.09 * S, 1.86 * S, 0.64 * S);
    const main = cyl(0.028 * S, 0.05 * S, 0.62 * S, 6);
    main.rotateZ(sx * 0.3);
    main.rotateX(-0.25);
    main.translate(base.x + sx * 0.08 * S, base.y + 0.3 * S, base.z);
    parts.push(main);
    for (let i = 0; i < 3; i++) {
      const t = i / 3;
      const bx = base.x + sx * (0.08 + t * 0.16) * S;
      const by = base.y + (0.18 + t * 0.42) * S;
      const bz = base.z + (0.04 + t * 0.1) * S;
      const br = cyl(0.02 * S, 0.032 * S, 0.34 * S, 5);
      br.rotateZ(sx * (0.7 + t * 0.4));
      br.rotateX(-0.35);
      br.translate(bx + sx * 0.08 * S, by + 0.12 * S, bz);
      parts.push(br);
    }
  }
  // 四腿
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = cyl(0.045 * S, 0.07 * S, 1.05 * S, 6);
      leg.translate(sx * 0.24 * S, 0.52 * S, sz * 0.42 * S);
      parts.push(leg);
    }
  }
  // 尾
  const tail = cyl(0.02 * S, 0.045 * S, 0.22 * S, 5);
  tail.rotateX(0.9);
  tail.translate(0, 1.2 * S, -0.72 * S);
  parts.push(tail);
  return mergeAll(parts);
}

/** 铜猎犬：体 + 头 + 四腿 + 尾 */
export function hound(size = 1) {
  const S = size;
  const parts = [];
  const body = sph(0.3 * S, 10, 8);
  body.scale(0.85, 0.9, 1.7);
  body.translate(0, 0.62 * S, 0);
  parts.push(body);
  const neck = cyl(0.1 * S, 0.14 * S, 0.3 * S, 8);
  neck.rotateX(-0.7);
  neck.translate(0, 0.74 * S, 0.36 * S);
  parts.push(neck);
  const head = sph(0.14 * S, 9, 7);
  head.scale(0.85, 0.95, 1.15);
  head.translate(0, 0.86 * S, 0.52 * S);
  parts.push(head);
  const snout = cyl(0.05 * S, 0.08 * S, 0.2 * S, 7);
  snout.rotateX(Math.PI / 2);
  snout.translate(0, 0.8 * S, 0.68 * S);
  parts.push(snout);
  for (const sx of [-1, 1]) {
    const ear = sph(0.055 * S, 7, 5);
    ear.scale(0.5, 1.3, 0.9);
    ear.rotateZ(sx * 0.45);
    ear.translate(sx * 0.12 * S, 0.92 * S, 0.48 * S);
    parts.push(ear);
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = cyl(0.032 * S, 0.05 * S, 0.62 * S, 6);
      leg.translate(sx * 0.16 * S, 0.31 * S, sz * 0.26 * S);
      parts.push(leg);
    }
  }
  const tail = cyl(0.018 * S, 0.04 * S, 0.3 * S, 5);
  tail.rotateX(-0.9);
  tail.translate(0, 0.8 * S, -0.42 * S);
  parts.push(tail);
  return mergeAll(parts);
}

/** 铜雁 */
export function goose(size = 1) {
  const S = size;
  const parts = [];
  const body = sph(0.22 * S, 10, 8);
  body.scale(0.9, 0.85, 1.5);
  body.translate(0, 0.34 * S, 0);
  parts.push(body);
  const neck = cyl(0.05 * S, 0.075 * S, 0.36 * S, 7);
  neck.rotateX(-0.35);
  neck.translate(0, 0.52 * S, 0.2 * S);
  parts.push(neck);
  const head = sph(0.085 * S, 8, 6);
  head.scale(0.9, 0.9, 1.2);
  head.translate(0, 0.68 * S, 0.3 * S);
  parts.push(head);
  const beak = cone(0.035 * S, 0.13 * S, 6);
  beak.rotateX(Math.PI / 2);
  beak.translate(0, 0.67 * S, 0.4 * S);
  parts.push(beak);
  for (const sx of [-1, 1]) {
    const leg = cyl(0.018 * S, 0.022 * S, 0.3 * S, 5);
    leg.translate(sx * 0.07 * S, 0.15 * S, 0.02 * S);
    parts.push(leg);
  }
  const tail = cone(0.1 * S, 0.24 * S, 6);
  tail.rotateX(Math.PI / 2 + 0.4);
  tail.translate(0, 0.4 * S, -0.32 * S);
  parts.push(tail);
  return mergeAll(parts);
}

/** 铜羊 */
export function sheep(size = 1) {
  const S = size;
  const parts = [];
  const body = sph(0.3 * S, 10, 8);
  body.scale(0.95, 0.95, 1.4);
  body.translate(0, 0.6 * S, 0);
  parts.push(body);
  // 羊毛
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const f = sph(0.13 * S, 7, 6);
    f.translate(Math.cos(a) * 0.24 * S, 0.62 * S + Math.sin(a * 2) * 0.08 * S, Math.sin(a) * 0.34 * S);
    parts.push(f);
  }
  const head = sph(0.14 * S, 9, 7);
  head.scale(0.8, 1.1, 1.1);
  head.translate(0, 0.86 * S, 0.4 * S);
  parts.push(head);
  const snout = cyl(0.06 * S, 0.09 * S, 0.16 * S, 7);
  snout.rotateX(Math.PI / 2);
  snout.translate(0, 0.78 * S, 0.53 * S);
  parts.push(snout);
  for (const sx of [-1, 1]) {
    const horn = torus(0.11 * S, 0.028 * S, 6, 12, Math.PI * 1.4);
    horn.rotateY(Math.PI / 2);
    horn.rotateZ(sx * 0.8);
    horn.translate(sx * 0.11 * S, 0.95 * S, 0.34 * S);
    parts.push(horn);
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = cyl(0.03 * S, 0.05 * S, 0.6 * S, 6);
      leg.translate(sx * 0.16 * S, 0.3 * S, sz * 0.22 * S);
      parts.push(leg);
    }
  }
  const tail = sph(0.08 * S, 7, 5);
  tail.translate(0, 0.66 * S, -0.4 * S);
  parts.push(tail);
  return mergeAll(parts);
}

/** 铜鹤：长颈长腿，颈作 S 形 */
export function crane(size = 1) {
  const S = size;
  const parts = [];
  const body = sph(0.22 * S, 10, 8);
  body.scale(0.8, 0.9, 1.4);
  body.translate(0, 1.05 * S, 0);
  parts.push(body);
  // 颈（S 形：三段）
  const n1 = cyl(0.04 * S, 0.05 * S, 0.34 * S, 7);
  n1.rotateX(-0.5);
  n1.translate(0, 1.26 * S, 0.2 * S);
  parts.push(n1);
  const n2 = cyl(0.035 * S, 0.042 * S, 0.3 * S, 7);
  n2.rotateX(0.45);
  n2.translate(0, 1.48 * S, 0.28 * S);
  parts.push(n2);
  const head = sph(0.075 * S, 8, 6);
  head.scale(0.9, 0.9, 1.3);
  head.translate(0, 1.6 * S, 0.34 * S);
  parts.push(head);
  const beak = cone(0.028 * S, 0.2 * S, 6);
  beak.rotateX(Math.PI / 2);
  beak.translate(0, 1.58 * S, 0.48 * S);
  parts.push(beak);
  // 翅
  for (const sx of [-1, 1]) {
    const w = sph(0.14 * S, 8, 6);
    w.scale(0.35, 0.85, 1.5);
    w.rotateZ(sx * 0.15);
    w.translate(sx * 0.16 * S, 1.08 * S, -0.02 * S);
    parts.push(w);
  }
  // 腿
  for (const sx of [-1, 1]) {
    const leg = cyl(0.016 * S, 0.02 * S, 1.0 * S, 5);
    leg.translate(sx * 0.07 * S, 0.5 * S, 0.02 * S);
    parts.push(leg);
    const foot = boxAt(0.05 * S, 0.02 * S, 0.14 * S, sx * 0.07 * S, 0.01 * S, 0.06 * S);
    parts.push(foot);
  }
  const tail = cone(0.09 * S, 0.22 * S, 6);
  tail.rotateX(Math.PI / 2 + 0.5);
  tail.translate(0, 1.12 * S, -0.3 * S);
  parts.push(tail);
  return mergeAll(parts);
}

/** 铜猴 */
export function monkey(size = 1) {
  const S = size;
  const parts = [];
  const body = sph(0.26 * S, 10, 8);
  body.scale(0.9, 1.05, 0.8);
  body.translate(0, 0.62 * S, 0);
  parts.push(body);
  const head = sph(0.19 * S, 10, 8);
  head.scale(1, 0.95, 0.95);
  head.translate(0, 1.0 * S, 0.04 * S);
  parts.push(head);
  const muzzle = sph(0.12 * S, 8, 6);
  muzzle.scale(1, 0.75, 0.9);
  muzzle.translate(0, 0.93 * S, 0.16 * S);
  parts.push(muzzle);
  for (const sx of [-1, 1]) {
    const ear = sph(0.07 * S, 7, 5);
    ear.scale(0.45, 1, 1);
    ear.translate(sx * 0.19 * S, 1.02 * S, 0.0);
    parts.push(ear);
    const arm = cyl(0.04 * S, 0.05 * S, 0.44 * S, 6);
    arm.rotateX(0.4);
    arm.translate(sx * 0.24 * S, 0.72 * S, 0.06 * S);
    parts.push(arm);
    const leg = cyl(0.05 * S, 0.06 * S, 0.36 * S, 6);
    leg.rotateX(-0.5);
    leg.translate(sx * 0.12 * S, 0.22 * S, 0.1 * S);
    parts.push(leg);
  }
  const tail = cyl(0.016 * S, 0.03 * S, 0.62 * S, 5);
  tail.rotateX(-1.1);
  tail.translate(0, 0.86 * S, -0.26 * S);
  parts.push(tail);
  return mergeAll(parts);
}

/**
 * 翻尾石鱼：鱼身 + 翻起的尾 + 背鳍 + 胸鳍。
 * 朝向 +Z；tailUp=true 时尾部上翻（大水法的翻尾石鱼）。
 */
export function stoneFish(size = 1, tailUp = true) {
  const S = size;
  const parts = [];
  const body = sph(0.5 * S, 12, 9);
  body.scale(0.62, 0.78, 1.15);
  body.translate(0, 0, 0);
  parts.push(body);
  // 头
  const head = sph(0.3 * S, 10, 8);
  head.scale(0.85, 0.85, 0.95);
  head.translate(0, -0.04 * S, 0.42 * S);
  parts.push(head);
  // 嘴（微张）
  const jaw = boxAt(0.2 * S, 0.07 * S, 0.22 * S, 0, -0.14 * S, 0.56 * S);
  parts.push(jaw);
  for (const sx of [-1, 1]) {
    const eye = sph(0.05 * S, 7, 6);
    eye.translate(sx * 0.16 * S, 0.06 * S, 0.5 * S);
    parts.push(eye);
  }
  // 背鳍
  const dorsal = cone(0.16 * S, 0.5 * S, 6);
  dorsal.scale(1, 1, 0.3);
  dorsal.translate(0, 0.42 * S, -0.02 * S);
  parts.push(dorsal);
  // 胸鳍
  for (const sx of [-1, 1]) {
    const f = cone(0.13 * S, 0.36 * S, 5);
    f.scale(1, 1, 0.25);
    f.rotateZ(sx * 1.15);
    f.translate(sx * 0.3 * S, -0.06 * S, 0.2 * S);
    parts.push(f);
  }
  // 尾（翻起）
  const tail = cone(0.3 * S, 0.62 * S, 7);
  tail.scale(1, 1, 0.22);
  if (tailUp) {
    tail.rotateX(-Math.PI / 2 + 0.5);
    tail.translate(0, 0.24 * S, -0.78 * S);
  } else {
    tail.rotateX(Math.PI / 2);
    tail.translate(0, 0, -0.78 * S);
  }
  parts.push(tail);
  const g = mergeAll(parts);
  if (tailUp) g.rotateX(-0.18);
  return g;
}

/** 大海猪（翻尾海猪）：肥硕的猪形鱼，头抬起向上喷水 */
export function seaPig(size = 1) {
  const S = size;
  const parts = [];
  const body = sph(0.62 * S, 12, 9);
  body.scale(0.9, 0.85, 1.25);
  body.translate(0, 0, 0);
  parts.push(body);
  // 头（抬起）
  const head = sph(0.34 * S, 10, 8);
  head.scale(1, 0.9, 0.95);
  head.translate(0, 0.4 * S, 0.5 * S);
  parts.push(head);
  const snout = cyl(0.15 * S, 0.19 * S, 0.16 * S, 10);
  snout.rotateX(Math.PI / 2 - 0.6);
  snout.translate(0, 0.52 * S, 0.72 * S);
  parts.push(snout);
  for (const sx of [-1, 1]) {
    const eye = sph(0.055 * S, 7, 6);
    eye.translate(sx * 0.2 * S, 0.48 * S, 0.62 * S);
    parts.push(eye);
    const fin = cone(0.12 * S, 0.3 * S, 5);
    fin.scale(1, 1, 0.25);
    fin.rotateZ(sx * 1.2);
    fin.translate(sx * 0.52 * S, 0.02 * S, 0.1 * S);
    parts.push(fin);
  }
  // 翻起的尾
  const tail = cone(0.32 * S, 0.72 * S, 7);
  tail.scale(1, 1, 0.2);
  tail.rotateX(-Math.PI / 2 + 0.55);
  tail.translate(0, 0.3 * S, -0.78 * S);
  parts.push(tail);
  // 背鳍
  const dorsal = cone(0.14 * S, 0.36 * S, 5);
  dorsal.scale(1, 1, 0.28);
  dorsal.translate(0, 0.58 * S, -0.1 * S);
  parts.push(dorsal);
  return mergeAll(parts);
}

/** 西洋石狮（谐奇趣二层门前 / 远瀛观门前）：蹲姿 */
export function stoneLion(size = 1) {
  const S = size;
  const parts = [];
  const body = sph(0.42 * S, 12, 9);
  body.scale(0.9, 1.05, 1.35);
  body.translate(0, 0.85 * S, 0);
  parts.push(body);
  // 前腿
  for (const sx of [-1, 1]) {
    const leg = cyl(0.1 * S, 0.13 * S, 0.8 * S, 8);
    leg.translate(sx * 0.24 * S, 0.4 * S, 0.4 * S);
    parts.push(leg);
    const paw = sph(0.13 * S, 7, 6);
    paw.scale(1, 0.7, 1.3);
    paw.translate(sx * 0.24 * S, 0.1 * S, 0.52 * S);
    parts.push(paw);
  }
  // 后腿蹲踞
  for (const sx of [-1, 1]) {
    const leg = sph(0.19 * S, 8, 6);
    leg.scale(0.9, 1.1, 1.2);
    leg.translate(sx * 0.25 * S, 0.26 * S, -0.32 * S);
    parts.push(leg);
  }
  // 鬃与头
  const head = beastHead(0.85 * S, {
    muzzle: 0.5,
    snout: 'box',
    ear: 'round',
    mane: true,
    wide: 1.05,
  });
  head.translate(0, 1.42 * S, 0.42 * S);
  parts.push(head);
  // 尾
  const tail = cyl(0.03 * S, 0.05 * S, 0.42 * S, 5);
  tail.rotateX(-1.2);
  tail.translate(0, 1.0 * S, -0.52 * S);
  parts.push(tail);
  return mergeAll(parts);
}

/** 石花盆（带座）：大水法池沿岸 / 观水法栏上 */
export function planter(size = 1, height = 1.0) {
  const S = size;
  const parts = [];
  const prof = [
    [0.0, 0.62],
    [0.08, 0.66],
    [0.12, 0.56],
    [0.5, 0.44],
    [0.82, 0.54],
    [0.9, 0.62],
    [0.96, 0.6],
    [1.0, 0.5],
  ];
  parts.push(
    lathe(
      prof.map(([t, r]) => new THREE.Vector2(r * S, t * height)),
      12
    )
  );
  // 座
  parts.push(boxAt(0.95 * S, 0.16 * S, 0.95 * S, 0, -0.08 * S, 0));
  return mergeAll(parts);
}

/** 石鼎炉 / 八角石鼎（观水法、海晏堂） */
export function stoneTripod(size = 1, height = 2.6) {
  const S = size;
  const parts = [];
  const prof = [
    [0.0, 0.42],
    [0.08, 0.5],
    [0.16, 0.34],
    [0.5, 0.3],
    [0.72, 0.5],
    [0.86, 0.56],
    [0.92, 0.5],
    [1.0, 0.46],
  ];
  parts.push(
    lathe(
      prof.map(([t, r]) => new THREE.Vector2(r * S, t * height)),
      10
    )
  );
  // 三足
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = cyl(0.05 * S, 0.07 * S, height * 0.3, 6);
    leg.translate(Math.cos(a) * 0.3 * S, height * 0.12, Math.sin(a) * 0.3 * S);
    parts.push(leg);
  }
  return mergeAll(parts);
}

/* ============================================================ 水 */

/** 水柱：从 y=0 向上射到 y=len，细而略带锥度 */
export function waterJet(len, r = 0.05, seg = 6) {
  const g = new THREE.CylinderGeometry(r * 0.7, r, len, seg, 1, true);
  g.translate(0, len / 2, 0);
  g.computeVertexNormals();
  return worldUV(g);
}

/** 从 A 射到 B 的水柱（兽首喷水用） */
export function jetBetween(a, b, r = 0.05) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz) || 0.001;
  const g = new THREE.CylinderGeometry(r * 0.72, r, len, 6, 1, true);
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(dx, dy, dz).normalize()
  );
  g.applyQuaternion(q);
  g.translate(a[0] + dx / 2, a[1] + dy / 2, a[2] + dz / 2);
  g.computeVertexNormals();
  return worldUV(g);
}

/** 落水花（水柱顶端的散花） */
export function spray(r = 0.14, h = 0.4) {
  const g = new THREE.ConeGeometry(r, h, 7, 1, true);
  g.translate(0, h / 2, 0);
  g.computeVertexNormals();
  return worldUV(g);
}

/* ============================================================ 组合件 */

/** 巴洛克式西洋牌楼（线法山正门 / 螺丝牌楼）：两柱一梁 + 卷涡山花 */
export function baroqueGate(width = 8, height = 9, depth = 1.4) {
  const parts = [];
  const half = width / 2;
  for (const sx of [-1, 1]) {
    const p = pilaster(height * 0.72, 1.1, depth);
    p.translate(sx * half, 0, 0);
    parts.push(p);
    // 柱顶小台
    parts.push(boxAt(1.5, 0.28, depth * 1.4, sx * half, height * 0.72 + 0.14, 0));
  }
  // 横梁
  parts.push(boxAt(width + 1.4, height * 0.2, depth, 0, height * 0.82, 0));
  parts.push(cornice(width + 1.6, depth * 1.25, 0.6, 0));
  // 山花
  const ped = pediment(width * 0.8, height * 0.26, depth * 0.8, true);
  ped.translate(0, height * 0.92, 0);
  parts.push(ped);
  return mergeAll(parts);
}

/** 八角亭（谐奇趣奏乐亭 / 方外观八角亭 / 线法山山顶石亭） */
export function octagonalPavilion(opts = {}) {
  const {
    radius = 4,
    postH = 3.0,
    roofH = 2.2,
    solid = false,
    roof = true,
    baseH = 0.6,
  } = opts;
  const parts = [];
  // 台基
  const prof = [
    [0.0, 1.12],
    [0.18, 1.12],
    [0.24, 1.0],
    [1.0, 1.0],
  ];
  parts.push(
    lathe(
      prof.map(([t, r]) => new THREE.Vector2(r * radius, t * baseH)),
      8
    )
  );
  const base = baseH;
  // 柱（或实墙）
  if (solid) {
    const wall = cyl(radius * 0.94, radius * 0.94, postH, 8, true);
    wall.translate(0, base + postH / 2, 0);
    parts.push(wall);
  } else {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const p = cyl(0.17, 0.19, postH, 8);
      p.translate(Math.cos(a) * radius * 0.88, base + postH / 2, Math.sin(a) * radius * 0.88);
      parts.push(p);
      // 柱头
      const cap = boxAt(0.42, 0.2, 0.42, Math.cos(a) * radius * 0.88, base + postH, Math.sin(a) * radius * 0.88);
      parts.push(cap);
    }
    // 檐枋
    const ring = torus(radius * 0.88, 0.13, 6, 8);
    ring.rotateX(Math.PI / 2);
    ring.translate(0, base + postH, 0);
    parts.push(ring);
  }
  // 攒尖顶（八角锥）
  const roofBase = base + postH;
  if (roof) {
    const prof2 = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      prof2.push(new THREE.Vector2(radius * (1.12 - 0.1 * t) * (1 - t * t * 0.94), roofH * t));
    }
    parts.push(lathe(prof2, 8));
    // 宝顶
    const fin = sph(0.32, 10, 8);
    fin.translate(0, roofBase + roofH + 0.2, 0);
    parts.push(fin);
    const spire = cone(0.16, 1.0, 8);
    spire.translate(0, roofBase + roofH + 0.8, 0);
    parts.push(spire);
  }
  return mergeAll(parts);
}

/** 半圆形西洋式屏风（观水法座后）：石框 + 五件石刻屏心 */
export function semicircleScreen(radius = 6, height = 4.4) {
  const parts = [];
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const a = Math.PI * (i / n);
    const x = -Math.cos(a) * radius;
    const z = -Math.sin(a) * radius * 0.42;
    const p = boxAt(0.7, height, 0.5, x, height / 2, z);
    parts.push(p);
    const cap = boxAt(0.95, 0.3, 0.7, x, height + 0.15, z);
    parts.push(cap);
  }
  // 上下横枋
  for (const y of [0.5, height - 0.6]) {
    for (let i = 0; i < n; i++) {
      const a0 = Math.PI * (i / n);
      const a1 = Math.PI * ((i + 1) / n);
      const x0 = -Math.cos(a0) * radius;
      const z0 = -Math.sin(a0) * radius * 0.42;
      const x1 = -Math.cos(a1) * radius;
      const z1 = -Math.sin(a1) * radius * 0.42;
      const len = Math.hypot(x1 - x0, z1 - z0);
      const b = boxAt(len, 0.55, 0.42, (x0 + x1) / 2, y, (z0 + z1) / 2);
      b.rotateY(-Math.atan2(z1 - z0, x1 - x0));
      parts.push(b);
    }
  }
  return mergeAll(parts);
}

/** 屏风上的五件石刻屏心（浮雕板） */
export function screenPanels(radius = 6, height = 4.4) {
  const parts = [];
  for (let i = 0; i < 5; i++) {
    const a = Math.PI * (0.16 + (0.68 * i) / 4);
    const x = -Math.cos(a) * radius;
    const z = -Math.sin(a) * radius * 0.42;
    const p = boxAt(1.5, height * 0.62, 0.2, x, height * 0.45, z + 0.2);
    p.rotateY(-(a - Math.PI / 2));
    parts.push(p);
    const v = volute(0.5, 0.08, 1.5);
    v.rotateY(-(a - Math.PI / 2));
    v.translate(x, height * 0.45, z + 0.34);
    parts.push(v);
  }
  return mergeAll(parts);
}

/** 宝座（观水法台中） */
export function throne() {
  const parts = [];
  // 座
  parts.push(boxAt(1.9, 0.22, 1.6, 0, 0.72, 0));
  parts.push(boxAt(1.7, 0.5, 1.4, 0, 0.4, 0));
  // 靠背
  parts.push(boxAt(1.9, 2.6, 0.28, 0, 2.1, -0.66));
  parts.push(boxAt(2.2, 0.26, 0.5, 0, 3.4, -0.66));
  // 扶手
  for (const sx of [-1, 1]) {
    parts.push(boxAt(0.24, 0.22, 1.5, sx * 0.95, 1.5, 0));
    parts.push(boxAt(0.2, 0.8, 0.2, sx * 0.95, 1.0, 0.6));
  }
  // 靠背雕花
  const v = volute(0.75, 0.12, 1.6);
  v.translate(0, 2.35, -0.5);
  parts.push(v);
  return mergeAll(parts);
}
