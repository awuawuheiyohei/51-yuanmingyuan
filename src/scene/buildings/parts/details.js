/**
 * 细部构件：柱础、望柱、栏板、束腰、地霞
 *
 * 这些在真建筑里都是"有轮廓、有线脚"的实体，
 * 用方料或贴图代替是最容易被看穿的地方。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * 覆盆式柱础：上小下大的圆台 + 一圈束腰
 * 清式大式建筑柱础为覆盆式，轮廓是圆转的，不是方柱墩
 */
export function buildColumnBase(colDia) {
  const r = colDia * 0.72;
  const h = colDia * 0.42;
  const parts = [];

  // 覆盆：用 Lathe 做出圆转的收分轮廓
  const profile = [];
  const steps = 7;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // 下缘略外撇，中部收分
    const rr = r * (1.06 - 0.22 * t - 0.12 * Math.sin(t * Math.PI));
    profile.push(new THREE.Vector2(rr, t * h));
  }
  const basin = new THREE.LatheGeometry(profile, 12);
  basin.translate(0, h, 0);
  parts.push(basin);

  // 础盘（底下那圈方石）
  const plate = new THREE.BoxGeometry(colDia * 1.72, h * 0.22, colDia * 1.72);
  plate.translate(0, h * 0.11, 0);
  parts.push(plate);

  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return g;
}

/**
 * 望柱：栏杆的柱头，有柱身 + 莲瓣/云纹柱头
 */
export function buildBaluster(h = 1.0, w = 0.18) {
  const parts = [];
  // 柱身（略收分）
  const body = new THREE.CylinderGeometry(w * 0.42, w * 0.5, h * 0.78, 8);
  body.translate(0, h * 0.39, 0);
  parts.push(body);
  // 柱头：仰莲
  const head = new THREE.SphereGeometry(w * 0.52, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
  head.scale(1, 0.85, 1);
  head.translate(0, h * 0.78, 0);
  parts.push(head);
  // 柱头顶的小莲苞
  const bud = new THREE.SphereGeometry(w * 0.2, 8, 6);
  bud.translate(0, h * 0.93, 0);
  parts.push(bud);
  // 柱脚
  const foot = new THREE.CylinderGeometry(w * 0.56, w * 0.6, h * 0.08, 8);
  foot.translate(0, h * 0.04, 0);
  parts.push(foot);

  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return g;
}

/**
 * 栏板：华板 + 上下寻杖，中间留出"壸门"式的曲线空当
 */
export function buildBalustradePanel(len, h = 1.0) {
  const parts = [];
  // 下地霞
  const bottom = new THREE.BoxGeometry(len, h * 0.16, 0.1);
  bottom.translate(0, h * 0.08, 0);
  parts.push(bottom);
  // 上寻杖
  const top = new THREE.BoxGeometry(len, h * 0.13, 0.12);
  top.translate(0, h * 0.435, 0);
  parts.push(top);
  // 华板（中间实板，左右留空当 —— 简化为两块竖条 + 一条横档）
  const centerW = len * 0.46;
  const center = new THREE.BoxGeometry(centerW, h * 0.2, 0.07);
  center.translate(0, h * 0.27, 0);
  parts.push(center);
  // 两侧透空处的边框
  for (const sx of [-1, 1]) {
    const side = new THREE.BoxGeometry((len - centerW) / 2, h * 0.2, 0.06);
    side.translate(sx * (centerW / 2 + (len - centerW) / 4), h * 0.27, 0);
    parts.push(side);
  }
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return g;
}

/**
 * 束腰的壸门：须弥座束腰上的一格格凹龛
 */
export function buildShouMenPanels(w, h, d) {
  const parts = [];
  const count = Math.max(2, Math.round(w / 0.9));
  const cw = w / count;
  for (let i = 0; i < count; i++) {
    const x = -w / 2 + cw * (i + 0.5);
    // 凹龛：四边凸起的框
    const t = 0.055;
    const pw = cw * 0.62;
    const ph = h * 0.66;
    for (const sy of [-1, 1]) {
      const b = new THREE.BoxGeometry(pw, t, 0.05);
      b.translate(x, sy * (ph / 2 - t / 2), d / 2 + 0.02);
      parts.push(b);
    }
    for (const sx of [-1, 1]) {
      const b = new THREE.BoxGeometry(t, ph, 0.05);
      b.translate(x + sx * (pw / 2 - t / 2), 0, d / 2 + 0.02);
      parts.push(b);
    }
  }
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return g;
}

/**
 * 地霞：栏杆下的承托石
 */
export function buildDiXia(len, h = 0.18) {
  const g = new THREE.BoxGeometry(len, h, 0.34);
  g.translate(0, h / 2, 0);
  return g;
}

/**
 * 御路：台基正中的斜坡石，两侧带雕线
 */
export function buildYuLu(width, h, depth) {
  const parts = [];
  const slab = new THREE.BoxGeometry(width, 0.16, depth * 1.85);
  slab.rotateX(-Math.atan2(h, depth * 1.7));
  parts.push(slab);
  // 两侧雕线（凸起的边条）
  for (const sx of [-1, 1]) {
    const e = new THREE.BoxGeometry(width * 0.08, 0.06, depth * 1.85);
    e.rotateX(-Math.atan2(h, depth * 1.7));
    e.translate(sx * width * 0.46, 0.1, 0);
    parts.push(e);
  }
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return g;
}
