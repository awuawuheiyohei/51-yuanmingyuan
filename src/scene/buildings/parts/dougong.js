/**
 * 清式斗栱（一斗三升 · 翘昂）
 * ===========================
 *
 * ## 模数：斗口
 *
 * 斗栱**不是另有一套尺寸** —— 它的每一件构件都是斗口的整数倍或分数。
 * 这正是斗口制的核心：柱、枋、拱、斗、椽共用一个模数。
 *
 * 依据《工程做法则例》：
 *   - **斗口** = 坐斗正面刻口的宽度 = 拱材的宽
 *   - **攒当**（相邻斗栱中心距）= 11 斗口
 *   - **斗栱每拽架（每跳）出挑 3 斗口，每踩高 2 斗口**
 *   - **单材拱** = 1 斗口 × 1.4 斗口
 *   - **坐斗（栌斗）** 底面 3 斗口见方，高 2 斗口
 *   - **十八斗** 底面 1.8 斗口，高 1.4 斗口
 *   - **升** 底面 1.3 斗口，高 1 斗口
 *
 * ## 一攒的构造（自下而上）
 *
 *   坐斗（栌斗）：斗底 + 斗欹 + 斗腰 + 斗耳
 *   第一跳：昂（斜料，前端下斜成"昂嘴"）+ 昂上十八斗
 *   第二跳：翘（平料）+ 翘上十八斗
 *   第三跳：翘 + 翘上十八斗
 *   最上层：蚂蚱头 + 耍头（挑出的横料）
 *
 * ## 尺寸自洽性（可验算）
 *
 *   出跳 = 3 跳 × 3 斗口 + 耍头 ≈ 11 斗口 = **攒当**
 *     ⇒ 相邻两攒的蚂蚱头/耍头正好衔接，檐下连成一片
 *   通高 = 坐斗 2 + 3 × 踩高 2 = 8，加蚂蚱头 ≈ **10 斗口**
 *     ⇒ 与 `modular.js` 的 `DK.dougongH = 10` 一致
 *
 * ## 尺寸基准
 *
 * 本模块几何以 **1 斗口 = 0.1 m** 为基准建模（`D` 表全部是"斗口数 × 0.1"），
 * 实际使用时由 `dgScale = 实际斗口 / 0.1` 整体缩放。
 * ⇒ 斗栱与柱径、额枋、椽子**自动同模数**。
 *
 * 坐标：原点在柱头中心，+Y 向上，主出挑方向朝 +X。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * 模数（米）。基准：1 斗口 = 0.1 m。
 *
 * ⚠ 之前这里的每跳出挑是 0.62m（**6.2 斗口**）—— 是一斗三升的三跳，
 *   却按"每跳 6.2 斗口"造，出挑近两倍 ⇒ 斗栱看着像几根乱插的尖刺，
 *   檐下根本排不成"密实的斗栱带"。
 *   现在按则例改成 **每跳 3 斗口**，三跳共 9 斗口 + 耍头 ≈ 攒当 11 斗口。
 */
const D = {
  zDouBottom: 0.30, // 坐斗斗底边长 = 3 斗口
  zDouHeight: 0.20, // 坐斗总高 = 2 斗口
  douEar: 0.05, // 斗耳高 = 0.5 斗口
  douWaist: 0.08, // 斗腰高 = 0.8 斗口
  shiBaDou: 0.18, // 十八斗底边长 = 1.8 斗口
  shiBaHeight: 0.14, // 十八斗高 = 1.4 斗口
  sheng: 0.13, // 升底边长 = 1.3 斗口
  shengHeight: 0.10, // 升高 = 1 斗口
  armW: 0.10, // 拱宽 = 1 斗口（= 斗口本身）
  armH: 0.14, // 拱高 = 1.4 斗口（单材拱）
  armLength: 0.30, // 每跳水平出挑 = 3 斗口
  angSlope: 0.28, // 昂的斜度（垂直/水平）—— 清式昂嘴约 1:3
  tiaoLength: 0.22, // 蚂蚱头挑出 = 2.2 斗口
  shuaLength: 0.20, // 耍头挑出 = 2 斗口
};

/** 方锥台：上小下大的斗（栌斗/十八斗/升） */
function makeDou(bottom, height, seed = 0) {
  const parts = [];
  const ear = D.douEar * (bottom / D.zDouBottom);
  const waist = D.douWaist * (bottom / D.zDouBottom);
  const bevel = Math.max(0.02, height - ear - waist);

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
function makeQiao(len) {
  const parts = [];
  const body = new THREE.BoxGeometry(len, D.armH, D.armW);
  body.translate(len / 2, 0, 0);
  parts.push(body);
  // 前端卷杀：两段逐渐收小并下垂
  const n = 2;
  for (let i = 0; i < n; i++) {
    const t = (i + 1) / n;
    const s = 1 - t * 0.45;
    const b = new THREE.BoxGeometry(len * 0.13, D.armH * s, D.armW * s);
    b.translate(len + len * 0.065 * (i + 0.5), -D.armH * 0.42 * t, 0);
    parts.push(b);
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/** 昂：斜向前下的方料，前端为"昂嘴" */
function makeAng(len) {
  const parts = [];
  const drop = len * D.angSlope;
  const g = new THREE.BoxGeometry(len, D.armH, D.armW);
  // 绕 Z 轴倾斜：前端（+X）下沉
  g.rotateZ(-Math.atan2(drop, len));
  g.translate(len / 2, -drop / 2, 0);
  parts.push(g);
  // 昂嘴（下端斜切）
  const kou = new THREE.BoxGeometry(len * 0.2, D.armH * 0.7, D.armW * 0.9);
  kou.rotateZ(-0.5);
  kou.translate(len * 1.02, -drop - D.armH * 0.3, 0);
  parts.push(kou);
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/** 蚂蚱头：最上层前端的雕花件（带斜面的方料 + 束腰） */
function makeMaZhaTou(len) {
  const parts = [];
  const b = new THREE.BoxGeometry(len * 0.6, D.armH * 1.05, D.armW * 1.02);
  b.translate(len * 0.3, 0, 0);
  parts.push(b);
  const head = new THREE.BoxGeometry(len * 0.36, D.armH * 0.82, D.armW * 0.88);
  head.rotateZ(-0.4);
  head.translate(len * 0.7, -D.armH * 0.18, 0);
  parts.push(head);
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/** 耍头：蚂蚱头之后带勾头的横料 */
function makeShuaTou(len) {
  const parts = [];
  const b = new THREE.BoxGeometry(len, D.armH, D.armW);
  b.translate(len / 2, 0, 0);
  parts.push(b);
  const gou = new THREE.BoxGeometry(len * 0.22, D.armH * 0.9, D.armW * 0.9);
  gou.rotateZ(0.55);
  gou.translate(len * 1.02, -D.armH * 0.22, 0);
  parts.push(gou);
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/**
 * 一攒一斗三升斗栱
 * @param {number} scale 整体缩放（= 实际斗口 ÷ 0.1m 基准）
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

  const jump = D.armLength;

  // 坐斗（栌斗）
  const zdou = makeDou(D.zDouBottom, D.zDouHeight);
  P(zdou, 0, 0, 0);

  let y = D.zDouHeight;
  let x = 0;

  // 第一跳：昂（斜出）+ 昂上十八斗
  // 昂从坐斗顶面起昂，昂嘴下斜；十八斗坐在昂背上。
  const ang = makeAng(jump);
  P(ang, x, y + D.armH * 0.5, 0);
  const angTipX = x + jump;
  const angTipY = y + D.armH * 0.5 - jump * D.angSlope;
  const sb1 = makeDou(D.shiBaDou, D.shiBaHeight);
  P(sb1, angTipX - D.shiBaDou * 0.3, angTipY + D.shiBaHeight * 0.5, 0);

  // 第二跳：翘（平出）+ 翘上十八斗
  // 每踩高 2 斗口（= 0.2m）
  y = angTipY + D.shiBaHeight + D.armH * 0.5;
  x = angTipX - D.shiBaDou * 0.3;
  const qiao2 = makeQiao(jump);
  P(qiao2, x, y, 0);
  const t2x = x + jump;
  const sb2 = makeDou(D.shiBaDou, D.shiBaHeight);
  P(sb2, t2x - D.shiBaDou * 0.3, y + D.shiBaHeight * 0.5, 0);

  // 第三跳：翘 + 翘上十八斗
  y = y + D.shiBaHeight + D.armH * 0.5;
  x = t2x - D.shiBaDou * 0.3;
  const qiao3 = makeQiao(jump);
  P(qiao3, x, y, 0);
  const t3x = x + jump;
  const sb3 = makeDou(D.shiBaDou, D.shiBaHeight);
  P(sb3, t3x - D.shiBaDou * 0.3, y + D.shiBaHeight * 0.5, 0);

  // 最上层：蚂蚱头 + 耍头
  y = y + D.shiBaHeight + D.armH * 0.5;
  x = t3x - D.shiBaDou * 0.3;
  const mzt = makeMaZhaTou(D.tiaoLength);
  P(mzt, x, y, 0);
  const st = makeShuaTou(D.shuaLength);
  P(st, x + D.tiaoLength * 0.55, y, 0);

  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (axis === 'z') merged.rotateY(Math.PI / 2);
  return merged;
}

/**
 * 斗栱的总出挑（含蚂蚱头/耍头），用于让屋檐出挑与斗栱对齐。
 *
 * 三跳 3 斗口 + 耍头 ≈ 11 斗口 = 攒当 ⇒ 相邻两攒正好衔接。
 */
export function dougongProjection(scale = 1) {
  return (D.armLength * 3 + D.tiaoLength * 0.55 + D.shuaLength) * scale;
}

/**
 * 斗栱总高（按实际堆叠高度算出，不写死）。
 * 坐斗 2 + 3×踩高 2 + 蚂蚱头 ≈ 10 斗口。
 */
export function dougongHeight(scale = 1) {
  const drop = D.armLength * D.angSlope;
  // 坐斗顶 → 昂中 → 昂端（十八斗底）→ 翘 → 翘端 → 翘 → 蚂蚱头
  const y1 = D.zDouHeight + D.armH * 0.5 - drop * 0.5;
  const y2 = y1 + D.shiBaHeight + D.armH * 0.5;
  const y3 = y2 + D.shiBaHeight + D.armH * 0.5;
  const top = y3 + D.shiBaHeight + D.armH * 0.5 + D.armH * 0.55;
  return top * scale;
}
