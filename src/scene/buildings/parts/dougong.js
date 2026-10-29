/**
 * 清式斗栱
 *
 * 一斗三升（官式建筑最常见的一攒）自下而上的构件次序：
 *
 *   坐斗（栌斗）：斗底 + 斗腰 + 斗耳 + 四边斗欹
 *   第一跳：昂（斜料，前端下斜成"昂嘴"）+ 昂上十八斗
 *   第二跳：翘（平料）+ 翘上十八斗
 *   第三跳：翘 + 翘上十八斗
 *   最上层：蚂蚱头 + 耍头（挑出的横料）
 *
 * 尺寸取自清式大式建筑的实际尺度（米）：
 *   坐斗底面 0.30 见方、高 0.24；十八斗底 0.18、高 0.14；升底 0.13、高 0.10
 *   翘/昂 断面 0.16；每跳出挑 0.90；三跳总出挑 1.80
 *   斗栱通高约 1.25m
 *
 * 坐标：原点在柱头中心，+Y 向上，主出挑方向朝 +X。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * 模数（米）。以清式大式建筑的实际尺度为准：
 *   坐斗底面 0.30 见方、总高 0.26；三跳累计出挑约 1.8m；
 *   蚂蚱头/耍头再挑出约 0.55m；通高约 0.92m。
 * 比例上"竖高 : 横长"约 1 : 2.6，这正是斗栱看起来的样子。
 */
const D = {
  zDouBottom: 0.3, // 坐斗斗底边长
  zDouHeight: 0.26, // 坐斗总高
  douEar: 0.075, // 斗耳高
  douWaist: 0.09, // 斗腰高
  shiBaDou: 0.18, // 十八斗底边长
  shiBaHeight: 0.16,
  sheng: 0.13, // 升底边长
  shengHeight: 0.1,
  armSection: 0.2, // 翘/昂断面
  armLength: 0.62, // 每跳水平出挑
  angSlope: 0.22, // 昂的斜度（垂直/水平）
  tiaoLength: 0.55, // 蚂蚱头/耍头挑出长
};

/** 方锥台：上小下大的斗（栌斗/十八斗/升） */
function makeDou(bottom, height, seed = 0) {
  const parts = [];
  const half = bottom / 2;
  const ear = D.douEar * (bottom / D.zDouBottom);
  const waist = D.douWaist * (bottom / D.zDouBottom);
  const bevel = height - ear - waist;

  // 斗底（方）
  const b = new THREE.BoxGeometry(bottom, waist, bottom);
  b.translate(0, waist / 2, 0);
  parts.push(b);

  // 斗欹（四面斜坡）—— 用截头方锥近似
  const waistSize = bottom * 0.86;
  const c = new THREE.CylinderGeometry(
    waistSize * 0.707,
    bottom * 0.707,
    bevel,
    4,
    1
  );
  c.rotateY(Math.PI / 4);
  c.translate(0, waist + bevel / 2, 0);
  parts.push(c);

  // 斗腰（略收）
  const w = new THREE.BoxGeometry(waistSize, ear, waistSize);
  w.translate(0, waist + bevel + ear / 2, 0);
  parts.push(w);

  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/** 翘：平出挑的方料，前端下杀（卷杀） */
function makeQiao(len, section) {
  const parts = [];
  const body = new THREE.BoxGeometry(len, section, section);
  body.translate(len / 2, 0, 0);
  parts.push(body);
  // 前端卷杀：两三段逐渐收小并下垂
  const n = 3;
  for (let i = 0; i < n; i++) {
    const t = (i + 1) / n;
    const s = section * (1 - t * 0.55);
    const b = new THREE.BoxGeometry(len * 0.11, s, s);
    b.translate(len + len * 0.055 * (i + 0.5), -section * 0.5 * t * 0.9, 0);
    parts.push(b);
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/** 昂：斜向前下的方料，前端为"昂嘴" */
function makeAng(len, section) {
  const parts = [];
  const drop = len * D.angSlope;
  const g = new THREE.BoxGeometry(len, section, section);
  // 绕 Z 轴倾斜：前端（+X）下沉
  g.rotateZ(-Math.atan2(drop, len));
  g.translate(len / 2, -drop / 2, 0);
  parts.push(g);
  // 昂嘴（下端斜切）
  const kou = new THREE.BoxGeometry(len * 0.16, section * 0.75, section * 0.9);
  kou.rotateZ(-0.5);
  kou.translate(len * 1.02, -drop - section * 0.28, 0);
  parts.push(kou);
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/** 蚂蚱头：最上层前端的雕花件（简化为带斜面的方料） */
function makeMaZhaTou(len, section) {
  const parts = [];
  const b = new THREE.BoxGeometry(len * 0.55, section * 1.05, section * 1.02);
  b.translate(len * 0.28, 0, 0);
  parts.push(b);
  const head = new THREE.BoxGeometry(len * 0.34, section * 0.8, section * 0.85);
  head.rotateZ(-0.42);
  head.translate(len * 0.68, -section * 0.2, 0);
  parts.push(head);
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/** 耍头：蚂蚱头之后带勾头的横料 */
function makeShuaTou(len, section) {
  const parts = [];
  const b = new THREE.BoxGeometry(len, section, section);
  b.translate(len / 2, 0, 0);
  parts.push(b);
  const gou = new THREE.BoxGeometry(len * 0.2, section * 0.9, section * 0.9);
  gou.rotateZ(0.55);
  gou.translate(len * 1.02, -section * 0.25, 0);
  parts.push(gou);
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/**
 * 一攒一斗三升斗栱
 * @param {number} scale 整体缩放（按柱径微调）
 * @param {'x'|'z'} axis 主出挑方向
 * @returns {THREE.BufferGeometry}
 */
export function buildDougongSet(scale = 1, axis = 'x') {
  const parts = [];
  const s = scale;

  // 所有尺寸先用**未缩放**的模数算好，最后统一乘 s。
  // （早前在造构件时乘一次、装配时又乘一次，出挑会变成 s² 倍。）
  const P = (g, x, y, z) => {
    g.scale(s, s, s);
    g.translate(x * s, y * s, z * s);
    parts.push(g);
  };

  const sec = D.armSection;
  const jump = D.armLength;

  // 坐斗
  const zdou = makeDou(D.zDouBottom, D.zDouHeight);
  P(zdou, 0, 0, 0);

  let y = D.zDouHeight;
  let x = 0;

  // 第一跳：昂（斜出）+ 昂上十八斗
  const ang = makeAng(jump, sec);
  P(ang, x, y + sec * 0.5, 0);
  const angTipX = x + jump;
  const angTipY = y + sec * 0.5 - jump * D.angSlope;
  const sb1 = makeDou(D.shiBaDou, D.shiBaHeight);
  P(sb1, angTipX - D.shiBaDou * 0.3, angTipY + D.shiBaHeight * 0.5, 0);

  // 第二跳：翘（平出）
  y = angTipY + D.shiBaHeight + sec * 0.5;
  x = angTipX - D.shiBaDou * 0.3;
  const qiao2 = makeQiao(jump, sec);
  P(qiao2, x, y, 0);
  const t2x = x + jump;
  const sb2 = makeDou(D.shiBaDou, D.shiBaHeight);
  P(sb2, t2x - D.shiBaDou * 0.3, y + D.shiBaHeight * 0.5, 0);

  // 第三跳：翘
  y = y + D.shiBaHeight + sec * 0.5;
  x = t2x - D.shiBaDou * 0.3;
  const qiao3 = makeQiao(jump * 0.92, sec);
  P(qiao3, x, y, 0);
  const t3x = x + jump * 0.92;

  // 最上层：蚂蚱头 + 耍头
  const mzt = makeMaZhaTou(D.tiaoLength, sec);
  P(mzt, t3x, y + sec * 0.5, 0);
  const st = makeShuaTou(D.tiaoLength * 0.85, sec);
  P(st, t3x + D.tiaoLength * 0.5, y + sec * 0.5, 0);

  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (axis === 'z') merged.rotateY(Math.PI / 2);
  return merged;
}

/** 斗栱的总出挑（含蚂蚱头/耍头），用于让屋檐出挑与斗栱对齐 */
export function dougongProjection(scale = 1) {
  return (D.armLength * 2.92 + D.tiaoLength * 1.25) * scale;
}

/** 斗栱总高（按实际堆叠高度算出，不写死） */
export function dougongHeight(scale = 1) {
  const sec = D.armSection;
  const jump = D.armLength;
  const drop = jump * D.angSlope;
  // 坐斗顶 → 昂中 → 昂端（十八斗底）→ 翘 → 翘端（十八斗底）→ 翘 → 蚂蚱头顶
  const y1 = D.zDouHeight + sec * 0.5 - drop * 0.5;
  const y2 = y1 + D.shiBaHeight + sec * 0.5;
  const y3 = y2 + D.shiBaHeight + sec * 0.5;
  const top = y3 + sec * 1.05;
  return top * scale;
}
