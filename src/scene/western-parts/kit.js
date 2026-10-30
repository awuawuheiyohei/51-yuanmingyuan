/**
 * 西洋楼几何零件库
 *
 * 原则（AGENTS.md §4.1）：**建模比贴图精细度高得多**。
 * 这里提供的每个零件都是实体几何：券洞、卷涡、番花、兽首、翻尾石鱼……
 * 贴图只负责连续表面（砖缝、木纹、石材浮雕底纹）。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { UVK, mergeAll, tint } from './materials.js';

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

/**
 * 巴洛克**卷涡山花**（S 形山花）：两端卷起来、中间下凹的三角檐饰。
 *
 * 考据：线法山正门「巴洛克式西洋牌楼」、山东「螺丝牌楼」。
 * 形制简化：山花曲线用折线近似，卷涡用两只 `volute` 收头。
 */
export function scrolledPediment(w, h, depth = 0.45) {
  const parts = [];
  // 中间的浅三角底板
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, h * 0.78);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
  g.computeVertexNormals();
  worldUV(g);
  parts.push(g);
  // 两侧的卷涡（S 形）
  for (const sx of [-1, 1]) {
    const v = volute(h * 0.34, 0.11, 1.55);
    v.rotateZ(sx > 0 ? -Math.PI * 0.15 : Math.PI * 1.15);
    v.translate(sx * w * 0.42, h * 0.1, depth);
    parts.push(v);
    const lf = leaf(h * 0.36, h * 0.14, 0.07);
    lf.rotateZ(sx * 0.6);
    lf.translate(sx * w * 0.3, h * 0.16, depth);
    parts.push(lf);
  }
  // 山花下沿的托檐
  parts.push(boxAt(w * 1.06, 0.12, depth * 1.25, 0, -0.06, depth * 0.12));
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
 * 券石环（voussoir arch）：巴洛克券洞最认得出的识别特征。
 *
 * 考据：西洋楼各处券洞 —— 远瀛观门窗、大水法石龛、线法山八角四券石亭、
 *       海晏堂石券花窗口。
 *
 * 做法：每块券石是一个**扇环柱面**（radial joint，缝是放射状的，
 *       不是砌砖那种水平缝），块与块之间留一点角度缝；
 *       正上方一块**拱心石**（keystone）比两侧券石厚、并凸出。
 *
 * 形制简化：只做**一层**券石（真实巴洛克常做两三道叠涩券），
 * 券面线脚（archivolt）另用一道薄环表示。
 */
export function archVoussoirs(radius, thickness, depth, count = 9, opts = {}) {
  const { keystone = true, gap = 0.016, keystoneScale = 1.2 } = opts;
  const parts = [];
  const step = Math.PI / count;
  for (let i = 0; i < count; i++) {
    const a0 = Math.PI - i * step + gap;
    const a1 = Math.PI - (i + 1) * step - gap;
    const mid = (a0 + a1) / 2;
    const isKey = keystone && Math.abs(mid - Math.PI / 2) < step * 0.55;
    const th = thickness * (isKey ? keystoneScale : 1);
    const s = new THREE.Shape();
    const N = 4;
    for (let k = 0; k <= N; k++) {
      const a = a0 + ((a1 - a0) * k) / N;
      const x = Math.cos(a) * (radius + th);
      const y = Math.sin(a) * (radius + th);
      if (k === 0) s.moveTo(x, y);
      else s.lineTo(x, y);
    }
    for (let k = N; k >= 0; k--) {
      const a = a0 + ((a1 - a0) * k) / N;
      s.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
    }
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 1 });
    g.translate(0, 0, -depth / 2);
    g.computeVertexNormals();
    worldUV(g);
    parts.push(g);
  }
  return mergeAll(parts);
}

/**
 * 券洞的**券脚 + 券面线脚 + 拱心石**（套在洞口外面）。
 *
 * @param {number} r  券半径（洞口半宽）
 * @param {number} y1 起券线标高（洞口底 → 起券线的距离即 y1）
 * @param {number} d  墙厚方向进深
 */
export function archTrim(r, y1, d, opts = {}) {
  const { t = 0.22, count = 9, archivolt = true } = opts;
  const parts = [];
  // 券石环
  const ring = archVoussoirs(r, t, d, count);
  ring.translate(0, y1, 0);
  parts.push(ring);
  // 券面线脚（贴在券石外一圈，凸出墙面）
  if (archivolt) {
    const band = archVoussoirs(r + t, t * 0.32, d * 0.28, count, { keystone: false });
    band.translate(0, y1, d / 2 + d * 0.12);
    parts.push(band);
  }
  // 券脚（起券线上的托块）
  for (const sx of [-1, 1]) {
    parts.push(boxAt(t * 1.45, 0.2, d * 1.22, sx * (r + t / 2), y1 - 0.1, 0));
  }
  return mergeAll(parts);
}

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

/**
 * 券洞里的**玻璃面**（跟着券口形状走的平板，不是矩形）。
 *
 * 为什么要专门做：券洞是"矩形 + 半圆顶"，若玻璃仍用矩形方板，
 * 四个上角会戳进券洞两侧的墙里（穿模），近看很假。
 *
 * 形制简化：单层平板，不做波纹玻璃。
 */
export function archedPane(w, h, inset = 0.11) {
  const r = Math.max(0.04, Math.min(w / 2, h / 2) - inset);
  const y1 = h - inset - r;
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + inset, inset);
  s.lineTo(w / 2 - inset, inset);
  s.lineTo(w / 2 - inset, y1);
  s.absarc(0, y1, r, 0, Math.PI, false);
  s.lineTo(-w / 2 + inset, inset);
  s.closePath();
  const g = new THREE.ShapeGeometry(s, 12);
  g.computeVertexNormals();
  return g;
}

/**
 * 券花窗的框（石材）：**券脚 + 券石分缝 + 拱心石 + 券面线脚 + 窗楣**，
 * 券口另加一圈番花浮雕。
 *
 * 考据：谐奇趣「窗户券口有精美砖石雕刻」；海晏堂「石券花窗口」。
 *
 * 形制简化：券石只一层；番花只做拱心两侧两片叶 + 两只卷涡，
 * 不做满铺缠枝（满铺在近看时反而糊成一片）。
 */
export function windowSurround(w, h, d = 0.22, opts = {}) {
  const { relief = true } = opts;
  const parts = [];
  const t = 0.22;
  const r = Math.min(w / 2, h / 2);
  const y1 = h - r;
  // 两侧竖边
  parts.push(boxAt(t, y1, d, -r - t / 2, y1 / 2, 0));
  parts.push(boxAt(t, y1, d, r + t / 2, y1 / 2, 0));
  // 券脚 + 券石 + 拱心石 + 券面线脚
  parts.push(archTrim(r, y1, d, { t, count: 9 }));
  // 窗楣线脚
  parts.push(boxAt(w + t * 3, 0.16, d * 1.3, 0, h + 0.12, 0));
  parts.push(boxAt(w + t * 2.2, 0.09, d * 1.5, 0, h + 0.245, 0));
  // **窗台**（承雨石 + 挑出的台面 + 线脚）——巴洛克窗下必有一道，
  // 没有窗台，窗就是墙上一个洞。
  parts.push(boxAt(w + t * 2.6, 0.12, d * 1.7, 0, -0.06, 0));
  parts.push(boxAt(w + t * 3.2, 0.07, d * 2.0, 0, -0.155, 0));
  parts.push(boxAt(w + t * 1.8, 0.14, d * 1.3, 0, -0.26, 0));
  // 券口番花（拱心两侧）
  if (relief) {
    for (const sx of [-1, 1]) {
      const lf = leaf(t * 1.5, t * 0.5, 0.055);
      lf.rotateZ(sx * 1.15);
      lf.translate(sx * (r + t * 0.5), y1 + r * 0.62, d / 2);
      parts.push(lf);
      const v = volute(t * 0.85, 0.05, 1.35);
      v.rotateZ(sx > 0 ? -Math.PI * 0.4 : Math.PI * 1.4);
      v.translate(sx * (r + t * 0.1), y1 + r * 0.28, d / 2);
      parts.push(v);
    }
  }
  return mergeAll(parts);
}

/**
 * 法式铜窗的**铜窗棂**（细棂条）：法式窗是"玻璃 + 一套细金属棂"，
 * 不是一块玻璃加两条粗木条。
 *
 * 考据：海晏堂「窗为法式铜窗」。
 *
 * 形制简化：下半段是"竖棂 3 格 + 横档 4 道"的方格，上半段的半圆顶做**放射状
 * 扇形棂**（真实法式窗上段就是扇形）。整副棂只做到券洞的内接矩形，
 * 不会戳进券洞两侧的墙。
 *
 * 返回几何（调用方放进 `metal` 桶）。
 */
export function frenchMuntins(w, h, depth = 0.09, opts = {}) {
  const { lights = 3, rows = 4, bar = 0.045 } = opts;
  const r = Math.min(w / 2, h / 2);
  const iw = Math.max(0.3, 2 * r - 0.22);
  const ih = Math.max(0.3, h - r - 0.22);
  const yb = ih / 2; // 原点在窗台（框底），不是框心
  const parts = [];
  // 外框
  parts.push(boxAt(iw, bar * 1.7, depth, 0, yb + ih / 2, 0));
  parts.push(boxAt(iw, bar * 1.7, depth, 0, yb - ih / 2, 0));
  parts.push(boxAt(bar * 1.7, ih, depth, -iw / 2, yb, 0));
  parts.push(boxAt(bar * 1.7, ih, depth, iw / 2, yb, 0));
  // 竖棂
  for (let i = 1; i < lights; i++) {
    const x = -iw / 2 + (iw * i) / lights;
    parts.push(boxAt(bar, ih, depth * 0.85, x, yb, 0));
  }
  // 横档
  for (let i = 1; i < rows; i++) {
    const y = yb - ih / 2 + (ih * i) / rows;
    parts.push(boxAt(iw, bar, depth * 0.85, 0, y, 0));
  }
  // 半圆顶的放射扇形棂
  const L = Math.max(0.12, r - 0.14);
  for (let i = 0; i <= lights; i++) {
    const a = Math.PI * (i / lights);
    const rad = box(bar, L, depth * 0.8);
    rad.rotateZ(a - Math.PI / 2);
    rad.translate((L / 2) * Math.cos(a), yb + ih / 2 + (L / 2) * Math.sin(a), 0);
    parts.push(rad);
  }
  // 扇形外圈
  const hoop = torus(L + 0.03, bar * 0.9, 4, 12, Math.PI);
  hoop.translate(0, yb + ih / 2, 0);
  parts.push(hoop);
  return mergeAll(parts);
}

/**
 * 三角式巴洛克**假门楣**（窗间镜子上方的山花）。
 *
 * 考据：海晏堂「镜子上方为三角式巴洛克假门楣装饰」。
 */
export function falsePediment(w, h, depth = 0.24) {
  const parts = [];
  const p = pediment(w, h, depth, true);
  parts.push(p);
  // 山花下的托檐
  parts.push(boxAt(w * 1.12, 0.1, depth * 1.2, 0, -0.05, 0));
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

/**
 * 瓶式柱头（栏杆望柱顶上的收头）：车削的花瓶/花篮式。
 *
 * 考据：大水法「池沿岸用白玉石精雕花纹」；观水法「栏上有石刻花盆四对」。
 * 形制简化：只做瓶形，不做雕花的瓶身（浮雕留给栏板）。
 */
export function urnFinial(size = 0.2) {
  const S = size;
  const prof = [
    [0.0, 0.5],
    [0.12, 0.58],
    [0.3, 0.86],
    [0.5, 1.0],
    [0.68, 0.8],
    [0.8, 0.48],
    [0.88, 0.66],
    [1.0, 0.82],
  ].map(([t, r]) => new THREE.Vector2(r * S, t * S * 1.6));
  return lathe(prof, 8);
}

/**
 * 一段西洋石栏杆：地座 + **实心栏板（带番花浮雕）** + 车削望柱 +
 * 两端瓶式柱头 + 扶手。
 *
 * 考据：大水法「池沿岸用白玉石精雕花纹」——池岸栏板是**实心雕花板**，
 *       不是通透的西洋栏杆；观水法「栏上有石刻花盆四对」用的是同一套栏。
 *
 * 形制简化：栏板浮雕只做"一叶一涡" repeating，不做满铺缠枝。
 */
export function balustrade(len, h = 0.95, r = 0.11, opts = {}) {
  const { panel = true, relief = true } = opts;
  const parts = [];
  // 地座
  parts.push(boxAt(len, 0.13, 0.34, 0, 0.065, 0));
  const baseY = 0.13;
  // 栏板（实心薄板 + 浮雕）
  const ph = panel ? Math.min(0.34, h * 0.34) : 0;
  if (panel) {
    parts.push(boxAt(len, ph, 0.1, 0, baseY + ph / 2, 0));
    if (relief) {
      const n = Math.max(1, Math.round(len / 1.45));
      const step = len / n;
      for (let i = 0; i < n; i++) {
        const cx = -len / 2 + step * (i + 0.5);
        const lf = leaf(ph * 0.82, ph * 0.3, 0.05);
        lf.translate(cx, baseY + ph * 0.48, 0.05);
        parts.push(lf);
        const v = volute(ph * 0.3, 0.045, 1.35);
        v.rotateZ(Math.PI * 0.5);
        v.translate(cx + step * 0.32, baseY + ph * 0.5, 0.05);
        parts.push(v);
      }
    }
  }
  // 车削望柱
  const n = Math.max(2, Math.round(len / 1.35));
  const bh = h - 0.26;
  for (let i = 0; i <= n; i++) {
    const x = -len / 2 + (len * i) / n;
    const b = baluster(bh, r);
    b.translate(x, baseY, 0);
    parts.push(b);
  }
  // 两端望柱 + 瓶式柱头
  for (const sx of [-1, 1]) {
    const x = sx * (len / 2 - 0.1);
    parts.push(boxAt(0.26, h - 0.22, 0.26, x, (h - 0.22) / 2 + 0.04, 0));
    const urn = urnFinial(0.19);
    urn.translate(x, h - 0.18, 0);
    parts.push(urn);
  }
  // 扶手（两道线脚）
  parts.push(boxAt(len, 0.12, 0.4, 0, h - 0.06, 0));
  parts.push(boxAt(len, 0.05, 0.46, 0, h - 0.145, 0));
  return mergeAll(parts);
}

/**
 * 台阶（无垂带，西洋式）：顶踏步贴着 z=0，向 +Z（南）逐级降到地面。
 * 每级踏步前缘加一道**踏步线脚**（nosing），否则远看是一整块斜坡。
 */
export function steps(w, h, d, n = 5) {
  const parts = [];
  const sh = h / n;
  const sd = d / n;
  for (let i = 0; i < n; i++) {
    const top = h - i * sh;
    parts.push(boxAt(w, top + 0.01, sd * 1.04, 0, (top + 0.01) / 2, sd * (i + 0.5)));
    // 踏步线脚（踏面前缘凸出的薄板）
    parts.push(boxAt(w + 0.1, 0.07, sd * 0.18, 0, top - 0.03, sd * (i + 0.09)));
  }
  return mergeAll(parts);
}

/**
 * 广场地面**琉璃砖拼花**（几何分格，不是贴图）。
 *
 * 依据：brief「大水法 —— 广场地面用砖石琉璃铺砌」。
 * ⚠ `data/research/architecture-notes.md` 第三节「大水法」条目下**没有**这一句，
 *    所以这里只做"砖石铺地 + 琉璃方砖收边"的通俗做法，**不编造纹样母题**；
 *    母题与配比属**待考**项。
 *
 * 做法：一格一格**实体砖**（不是一张带花纹的贴图）；
 *      每格顶点贴地（按地面高程回调），不会浮在草皮上或穿帮。
 *
 * @param {number} w  铺装宽（X）
 * @param {number} d  铺装深（Z）
 * @param {number} cell 砖格边长
 * @param {Function} groundAt 局部坐标 → 地面高
 * @returns {{a:THREE.BufferGeometry, b:THREE.BufferGeometry, edge:THREE.BufferGeometry}}
 *          a/b 为奇偶两色铺地，edge 为最外一圈的琉璃收边
 */
export function pavementField(w, d, cell, groundAt) {
  const a = [];
  const b = [];
  const edge = [];
  const nx = Math.max(1, Math.round(w / cell));
  const nz = Math.max(1, Math.round(d / cell));
  const sx = w / nx;
  const sz = d / nz;
  const lift = 0.07;
  const tile = (cx, cz, tw, td) => {
    const g = new THREE.PlaneGeometry(tw * 0.94, td * 0.94);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const gy = groundAt ? groundAt(pos.getX(k) + cx, pos.getZ(k) + cz) : 0;
      pos.setY(k, gy + lift);
    }
    g.computeVertexNormals();
    worldUV(g);
    g.translate(cx, 0, cz);
    return g;
  };
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const cx = -w / 2 + sx * (i + 0.5);
      const cz = -d / 2 + sz * (j + 0.5);
      const border = i === 0 || j === 0 || i === nx - 1 || j === nz - 1;
      const g = tile(cx, cz, sx, sz);
      if (border) edge.push(g);
      else if ((i + j) % 2 === 0) a.push(g);
      else b.push(g);
    }
  }
  return { a: mergeAll(a), b: mergeAll(b), edge: mergeAll(edge) };
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
 * 兽首（十二生肖 / 铜狮 / 铜豹 / 铜鹿共用）：头 + 吻 + 鼻 + 眼 + 耳 + 角/冠 + 鬃。
 * 朝向 +Z。
 *
 * 考据：海晏堂「上为十二生肖兽首人身喷水像」，十二者形制各不相同，
 *       远看必须能认出是哪一个生肖。
 *
 * 形制简化：眼是球体不做球面雕瞳；鬃用环 + 鬃毛球，不做逐根发丝。
 */
export function beastHead(size = 1, opts = {}) {
  const {
    muzzle = 0.5,
    snout = 'box', // box | disc | beak | long | flat | wedge
    ear = 'round', // round | long | floppy | pointed | none
    horn = 'none', // none | cow | ram | dragon
    mane = false,
    crest = false, // 鸡冠
    wattle = false, // 鸡垂肉
    crestTop = false, // 头顶鬃脊（马/龙）
    wide = 1,
    tusk = false,
    brow = false, // 眉弓
    whisker = false, // 须
    scale = false, // 鳞
    hood = false, // 蛇的颈囊
    stripe = false, // 虎纹
    jaw = false, // 张口（露下颌）
    fangs = false,
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
    // 喙的上下喙合缝
    const seam = boxAt(0.02 * S, 0.03 * S, ml * 0.8, 0, -0.02 * S, mz + ml / 2);
    parts.push(seam);
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
  } else if (snout === 'wedge') {
    // 楔形吻（蛇）：上宽下窄的三角头
    const s2 = new THREE.Shape();
    s2.moveTo(-0.17 * S, 0.09 * S);
    s2.lineTo(0.17 * S, 0.09 * S);
    s2.lineTo(0, -0.13 * S);
    s2.closePath();
    const w = new THREE.ExtrudeGeometry(s2, { depth: ml, bevelEnabled: false });
    w.rotateX(-Math.PI / 2);
    w.translate(0, -0.02 * S, mz);
    w.computeVertexNormals();
    worldUV(w);
    parts.push(w);
  } else {
    const b = boxAt(0.22 * S * wide, 0.19 * S, ml, 0, -0.02 * S, mz + ml / 2);
    parts.push(b);
  }

  // 鼻头
  const nose = sph(0.055 * S, 8, 6);
  nose.translate(0, 0.01 * S, mz + ml * 0.96);
  parts.push(nose);

  // 鼻孔（长吻动物要能看见）
  if (snout === 'long' || snout === 'flat') {
    for (const sx of [-1, 1]) {
      const n = sph(0.026 * S, 6, 5);
      n.scale(1, 1.4, 0.7);
      n.translate(sx * 0.055 * S, -0.02 * S, mz + ml * 0.82);
      parts.push(n);
    }
  }

  // 眼
  for (const sx of [-1, 1]) {
    const e = sph(0.05 * S, 8, 6);
    e.translate(sx * 0.15 * S * wide, 0.09 * S, 0.2 * S);
    parts.push(e);
    eyes.push([sx * 0.15 * S * wide, 0.09 * S, 0.2 * S]);
  }

  // 眉弓
  if (brow) {
    for (const sx of [-1, 1]) {
      const b2 = boxAt(0.1 * S, 0.035 * S, 0.12 * S, 0, 0, 0);
      b2.rotateZ(sx * 0.18);
      b2.translate(sx * 0.15 * S * wide, 0.15 * S, 0.21 * S);
      parts.push(b2);
    }
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

  // 鬃（颈圈式）
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

  // 头顶鬃脊（马/龙）：沿颅顶一排三角鬃毛
  if (crestTop) {
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const c = cone(0.045 * S, 0.16 * S, 5);
      c.rotateX(-0.5);
      c.translate(0, (0.3 - t * 0.05) * S, (0.22 - t * 0.5) * S);
      parts.push(c);
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

  // 垂肉（鸡）
  if (wattle) {
    for (const sx of [-1, 1]) {
      const w = sph(0.05 * S, 6, 5);
      w.scale(0.7, 1.8, 0.7);
      w.translate(sx * 0.05 * S, -0.1 * S, mz + ml * 0.55);
      parts.push(w);
    }
  }

  // 鳞（蛇/龙）：颅顶一排小鳞片
  if (scale) {
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      const sc = sph(0.045 * S, 6, 5);
      sc.scale(1.2, 0.5, 1.2);
      sc.translate(0, (0.26 - t * 0.02) * S, (0.2 - t * 0.42) * S);
      parts.push(sc);
    }
  }

  // 颈囊（蛇）：头后一片摊开的薄翼
  if (hood) {
    const h = sph(0.4 * S, 12, 8);
    h.scale(1.25, 0.9, 0.18);
    h.translate(0, 0.06 * S, -0.1 * S);
    parts.push(h);
  }

  // 虎纹：颅上几道凸起的横带
  if (stripe) {
    for (let i = 0; i < 4; i++) {
      const t = i / 3;
      const st = boxAt(0.055 * S, 0.045 * S, 0.34 * S, 0, 0, 0);
      st.rotateX(0.25);
      st.translate((t - 0.5) * 0.34 * S * wide, (0.3 - t * 0.03) * S, 0.02 * S);
      parts.push(st);
    }
  }

  // 须（鼠/兔/龙）
  if (whisker) {
    for (const sx of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const w = cyl(0.008 * S, 0.011 * S, 0.36 * S, 4);
        w.rotateZ(sx * (0.9 + k * 0.22));
        w.rotateY(sx * 0.3);
        w.translate(sx * 0.16 * S, -0.04 * S, mz + ml * 0.7);
        parts.push(w);
      }
    }
  }

  // 张口：下颌（与上吻之间留出真的缝）
  if (jaw) {
    const jl = ml * 0.88;
    const j = box(0.2 * S * wide, 0.1 * S, jl);
    j.rotateX(0.16);
    j.translate(0, -0.15 * S, mz + jl * 0.46);
    parts.push(j);
    // 下颌前端收窄
    const tip = box(0.12 * S * wide, 0.07 * S, 0.1 * S);
    tip.translate(0, -0.175 * S, mz + jl * 0.92);
    parts.push(tip);
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

  // 尖牙（虎/狗）
  if (fangs) {
    for (const sx of [-1, 1]) {
      const f = cone(0.022 * S, 0.11 * S, 5);
      f.rotateX(Math.PI);
      f.translate(sx * 0.075 * S, -0.1 * S, mz + ml * 0.72);
      parts.push(f);
    }
  }

  return mergeAll(parts);
}

/**
 * 十二生肖兽首配置：每个生肖一套头型参数。
 *
 * 考据：海晏堂「上为十二生肖兽首人身喷水像」，南侧鼠虎龙马猴狗、
 *       北侧牛兔蛇羊鸡猪。十二者形制必须能分辨。
 *
 * 形制简化：见 `beastHead` 头部说明。
 */
export const ZODIAC = [
  // 鼠：圆耳 + 长尖吻 + 须
  { key: 'shu', name: '鼠', head: { muzzle: 0.3, snout: 'long', ear: 'round', wide: 0.85, brow: true, whisker: true } },
  // 牛：宽扁吻 + 牛角 + 尖耳
  { key: 'niu', name: '牛', head: { muzzle: 0.44, snout: 'flat', ear: 'pointed', horn: 'cow', wide: 1.18, brow: true } },
  // 虎：圆耳 + 虎纹 + 虎牙
  { key: 'hu', name: '虎', head: { muzzle: 0.4, snout: 'box', ear: 'round', wide: 1.12, stripe: true, brow: true, fangs: true } },
  // 兔：长耳 + 小吻 + 须
  { key: 'tu', name: '兔', head: { muzzle: 0.32, snout: 'long', ear: 'long', wide: 0.82, whisker: true } },
  // 龙：龙角 + 长吻 + 鬃 + 鳞 + 须
  { key: 'long', name: '龙', head: { muzzle: 0.56, snout: 'long', ear: 'pointed', horn: 'dragon', wide: 1.0, mane: true, crestTop: true, scale: true, brow: true, whisker: true } },
  // 蛇：无耳 + 楔形吻 + 颈囊 + 鳞
  { key: 'she', name: '蛇', head: { muzzle: 0.5, snout: 'wedge', ear: 'none', wide: 0.95, hood: true, scale: true, brow: true } },
  // 马：长吻 + 尖耳 + 头顶鬃脊
  { key: 'ma', name: '马', head: { muzzle: 0.62, snout: 'long', ear: 'pointed', wide: 0.95, crestTop: true, brow: true } },
  // 羊：卷角 + 垂耳 + 窄吻
  { key: 'yang', name: '羊', head: { muzzle: 0.38, snout: 'long', ear: 'floppy', horn: 'ram', wide: 0.9, brow: true, whisker: true } },
  // 猴：圆耳 + 扁脸 + 突吻
  { key: 'hou', name: '猴', head: { muzzle: 0.3, snout: 'flat', ear: 'round', wide: 1.06, brow: true } },
  // 鸡：喙 + 冠 + 垂肉
  { key: 'ji', name: '鸡', head: { muzzle: 0.28, snout: 'beak', ear: 'none', crest: true, wattle: true, wide: 0.84, brow: true } },
  // 狗：垂耳 + 长吻 + 獠牙
  { key: 'gou', name: '狗', head: { muzzle: 0.46, snout: 'box', ear: 'floppy', wide: 1.0, brow: true, fangs: true, jaw: true } },
  // 猪：圆盘吻 + 尖耳 + 獠牙
  { key: 'zhu', name: '猪', head: { muzzle: 0.44, snout: 'disc', ear: 'pointed', wide: 1.12, tusk: true, brow: true } },
];

/**
 * 人身（兽首人身像的袍身）：袍身 + 交领 + 腰带 + 宽袖 + 下摆。
 *
 * 考据：海晏堂「上为十二生肖兽首人身喷水像」，「十二铜像」。
 *
 * 形制简化：袍纹不做团花，只做衣领、腰带、袖口三道线；
 *           袍身按旋转体成型（真人比例的袍服是上下不匀的）。
 */
export function robedBody(size = 1, height = 1.9, opts = {}) {
  const { collar = true, sash = true, sleeve = true } = opts;
  const parts = [];
  // 袍身：下摆外张、腰部收束
  const prof = [
    [0.0, 0.5],
    [0.05, 0.47],
    [0.22, 0.42],
    [0.42, 0.33],
    [0.55, 0.27],
    [0.72, 0.29],
    [0.88, 0.24],
    [0.96, 0.18],
    [1.0, 0.15],
  ];
  const pts = prof.map(([t, r]) => new THREE.Vector2(r * size, t * height));
  parts.push(lathe(pts, 12));
  // 交领（两片斜襟）
  if (collar) {
    for (const sx of [-1, 1]) {
      const c = boxAt(0.13 * size, 0.42 * size, 0.09 * size, 0, 0, 0);
      c.rotateZ(sx * 0.34);
      c.translate(sx * 0.075 * size, height * 0.86, 0.17 * size);
      parts.push(c);
    }
  }
  // 腰带
  if (sash) {
    const b = torus(0.3 * size, 0.045 * size, 5, 12);
    b.rotateX(Math.PI / 2);
    b.scale(1, 1, 0.72);
    b.translate(0, height * 0.56, 0);
    parts.push(b);
    // 垂下的绦带
    const tassel = boxAt(0.07 * size, 0.42 * size, 0.06 * size, 0.16 * size, height * 0.34, 0.24 * size);
    parts.push(tassel);
  }
  // 双臂（宽袖）
  if (sleeve) {
    for (const sx of [-1, 1]) {
      const arm = cyl(0.07 * size, 0.1 * size, height * 0.42, 8);
      arm.rotateZ(sx * 0.3);
      arm.translate(sx * 0.24 * size, height * 0.52, 0.02 * size);
      parts.push(arm);
      // 袖口
      const cuff = cyl(0.11 * size, 0.09 * size, 0.07 * size, 8);
      cuff.rotateZ(sx * 0.3);
      cuff.translate(sx * 0.3 * size, height * 0.33, 0.05 * size);
      parts.push(cuff);
      const hand = sph(0.06 * size, 7, 5);
      hand.translate(sx * 0.33 * size, height * 0.28, 0.06 * size);
      parts.push(hand);
    }
  }
  return mergeAll(parts);
}

/**
 * 兽首人身像的**承座**（石台）：方座 + 束腰 + 圆座 + 线脚。
 *
 * 考据：海晏堂「沿石跑梯八字展开，上为十二生肖兽首人身喷水像」——
 *       像立在石台上，不是直接坐在地上。
 */
export function figurePedestal(size = 1, height = 0.95) {
  const S = size;
  const parts = [];
  // 方座
  parts.push(boxAt(1.5 * S, 0.16 * S, 1.5 * S, 0, 0.08 * S, 0));
  parts.push(boxAt(1.36 * S, 0.1 * S, 1.36 * S, 0, 0.21 * S, 0));
  // 束腰
  parts.push(cyl(0.5 * S, 0.56 * S, height * 0.34, 12).translate(0, height * 0.43, 0));
  // 圆座 + 线脚
  parts.push(cyl(0.62 * S, 0.58 * S, 0.12 * S, 12).translate(0, height * 0.66, 0));
  parts.push(cyl(0.66 * S, 0.66 * S, 0.08 * S, 12).translate(0, height * 0.76, 0));
  // 顶板
  parts.push(cyl(0.7 * S, 0.68 * S, 0.1 * S, 12).translate(0, height * 0.85, 0));
  return mergeAll(parts);
}

/**
 * 铜鹿：体 + 颈 + 头 + 四腿 + 尾 + **八杈鹿角**。
 *
 * 考据：大水法「池正中有一铜鹿，南向似跑，其角分为八杈，由各角尖上喷水八道」。
 * 形制简化：角做成"主干 + 四根杈枝"，杈枝末端即喷水口；
 *           鹿身不雕毛纹。
 */
export function bronzeDeer(size = 1) {
  const S = size;
  const parts = [];
  const body = sph(0.5 * S, 12, 9);
  body.scale(0.78, 0.82, 1.5);
  body.translate(0, 1.05 * S, 0);
  parts.push(body);
  // 胸
  const chest = sph(0.36 * S, 10, 8);
  chest.scale(0.9, 0.95, 0.8);
  chest.translate(0, 1.08 * S, 0.5 * S);
  parts.push(chest);
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
  const nose = sph(0.055 * S, 7, 5);
  nose.translate(0, 1.65 * S, 1.0 * S);
  parts.push(nose);
  for (const sx of [-1, 1]) {
    const eye = sph(0.038 * S, 7, 5);
    eye.translate(sx * 0.12 * S, 1.76 * S, 0.82 * S);
    parts.push(eye);
    const ear = sph(0.07 * S, 7, 5);
    ear.scale(0.4, 1.2, 0.8);
    ear.rotateZ(sx * 0.6);
    ear.translate(sx * 0.14 * S, 1.8 * S, 0.66 * S);
    parts.push(ear);
  }
  // 八杈鹿角：每侧主干 + 四杈（末端是喷水口）
  for (const sx of [-1, 1]) {
    const base = new THREE.Vector3(sx * 0.09 * S, 1.86 * S, 0.64 * S);
    const main = cyl(0.028 * S, 0.05 * S, 0.62 * S, 6);
    main.rotateZ(sx * 0.3);
    main.rotateX(-0.25);
    main.translate(base.x + sx * 0.08 * S, base.y + 0.3 * S, base.z);
    parts.push(main);
    for (let i = 0; i < 4; i++) {
      const t = i / 4;
      const bx = base.x + sx * (0.08 + t * 0.2) * S;
      const by = base.y + (0.16 + t * 0.5) * S;
      const bz = base.z + (0.03 + t * 0.12) * S;
      const br = cyl(0.016 * S, 0.028 * S, 0.3 * S, 5);
      br.rotateZ(sx * (0.75 + t * 0.35));
      br.rotateX(-0.35);
      br.translate(bx + sx * 0.075 * S, by + 0.1 * S, bz);
      parts.push(br);
    }
  }
  // 四腿（南向似跑：前腿抬）
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = cyl(0.045 * S, 0.07 * S, 1.05 * S, 6);
      if (sz > 0) {
        leg.rotateX(0.35);
        leg.translate(sx * 0.24 * S, 0.6 * S, sz * 0.42 * S);
      } else {
        leg.translate(sx * 0.24 * S, 0.52 * S, sz * 0.42 * S);
      }
      parts.push(leg);
      const hoof = cyl(0.06 * S, 0.055 * S, 0.12 * S, 6);
      hoof.translate(sx * 0.24 * S, 0.06 * S, sz * 0.42 * S + (sz > 0 ? 0.16 * S : 0));
      parts.push(hoof);
    }
  }
  // 尾
  const tail = cyl(0.02 * S, 0.045 * S, 0.22 * S, 5);
  tail.rotateX(0.9);
  tail.translate(0, 1.2 * S, -0.72 * S);
  parts.push(tail);
  return mergeAll(parts);
}

/**
 * 铜猎犬：体 + 长吻 + 垂耳 + 四腿 + 卷尾。
 *
 * 考据：大水法「鹿东西各有铜猎犬五只，水由口喷出射向铜鹿」（十犬喷鹿）。
 * 形制简化：不做短毛雕刻，靠轮廓（长吻 + 垂耳 + 细腰）辨形。
 */
export function hound(size = 1) {
  const S = size;
  const parts = [];
  const body = sph(0.3 * S, 10, 8);
  body.scale(0.85, 0.9, 1.7);
  body.translate(0, 0.62 * S, 0);
  parts.push(body);
  // 腰（细）
  const waist = sph(0.22 * S, 9, 7);
  waist.scale(0.8, 0.85, 1.2);
  waist.translate(0, 0.6 * S, -0.25 * S);
  parts.push(waist);
  const neck = cyl(0.1 * S, 0.14 * S, 0.3 * S, 8);
  neck.rotateX(-0.7);
  neck.translate(0, 0.74 * S, 0.36 * S);
  parts.push(neck);
  const head = sph(0.14 * S, 9, 7);
  head.scale(0.85, 0.95, 1.15);
  head.translate(0, 0.86 * S, 0.52 * S);
  parts.push(head);
  // 长吻
  const snout = cyl(0.042 * S, 0.075 * S, 0.3 * S, 7);
  snout.rotateX(Math.PI / 2);
  snout.translate(0, 0.79 * S, 0.75 * S);
  parts.push(snout);
  const nose = sph(0.045 * S, 7, 5);
  nose.translate(0, 0.78 * S, 0.89 * S);
  parts.push(nose);
  for (const sx of [-1, 1]) {
    const eye = sph(0.032 * S, 7, 5);
    eye.translate(sx * 0.09 * S, 0.9 * S, 0.57 * S);
    parts.push(eye);
    // 垂耳
    const ear = sph(0.055 * S, 7, 5);
    ear.scale(0.45, 1.5, 0.9);
    ear.rotateZ(sx * 0.55);
    ear.translate(sx * 0.13 * S, 0.79 * S, 0.47 * S);
    parts.push(ear);
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = cyl(0.032 * S, 0.05 * S, 0.62 * S, 6);
      leg.translate(sx * 0.16 * S, 0.31 * S, sz * 0.26 * S);
      parts.push(leg);
      const paw = sph(0.05 * S, 6, 5);
      paw.scale(1, 0.7, 1.2);
      paw.translate(sx * 0.16 * S, 0.04 * S, sz * 0.28 * S);
      parts.push(paw);
    }
  }
  // 卷尾
  const tail = torus(0.11 * S, 0.028 * S, 5, 10, Math.PI * 1.5);
  tail.rotateX(Math.PI / 2);
  tail.rotateZ(0.6);
  tail.translate(0, 0.86 * S, -0.5 * S);
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

/**
 * 石花盆（**带座**）：大水法池沿岸 / 观水法栏上。
 *
 * 考据：大水法「池沿岸用白玉石精雕花纹，安放带座石花盆，内植三层线法松」；
 *       观水法「栏上有石刻花盆四对」。
 *
 * 做法：方座（带线脚）+ 束腰 + 花瓶腹 + 口沿，**座与盆分体**——
 * 「带座」的关键就在这一段。形制简化：盆身不做浅浮雕花纹。
 */
export function planter(size = 1, height = 1.0) {
  const S = size;
  const parts = [];
  // 方座 + 线脚
  parts.push(boxAt(0.94 * S, 0.14 * S, 0.94 * S, 0, -0.07 * S, 0));
  parts.push(boxAt(0.84 * S, 0.07 * S, 0.84 * S, 0, 0.035 * S, 0));
  // 束腰
  parts.push(boxAt(0.58 * S, 0.1 * S, 0.58 * S, 0, 0.12 * S, 0));
  // 盆身（车削）
  const baseY = 0.17 * S;
  const prof = [
    [0.0, 0.34],
    [0.1, 0.4],
    [0.3, 0.5],
    [0.55, 0.54],
    [0.75, 0.46],
    [0.88, 0.52],
    [1.0, 0.55],
  ];
  parts.push(
    lathe(
      prof.map(([t, r]) => new THREE.Vector2(r * S, baseY + t * (height - baseY))),
      12
    )
  );
  // 口沿（厚边，翻出来的）
  const rimY = baseY + (height - baseY);
  parts.push(
    lathe(
      [
        [0.0, 0.55],
        [0.035, 0.62],
        [0.075, 0.58],
      ].map(([t, r]) => new THREE.Vector2(r * S, rimY + t * S * 0.22)),
      12
    )
  );
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
  return tint(worldUV(g), 0xffffff);
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
  return tint(worldUV(g), 0xffffff);
}

/** 落水花（水柱顶端的散花） */
export function spray(r = 0.14, h = 0.4) {
  const g = new THREE.ConeGeometry(r, h, 7, 1, true);
  g.translate(0, h / 2, 0);
  g.computeVertexNormals();
  return tint(worldUV(g), 0xffffff);
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
  // 山花（巴洛克卷涡式）
  const ped = scrolledPediment(width * 0.86, height * 0.3, depth * 0.8);
  ped.translate(0, height * 0.9, 0);
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
