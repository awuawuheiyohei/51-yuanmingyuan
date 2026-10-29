/**
 * 须弥座台基
 *
 * 清式台基自下而上的层次（各层比例取实际做法）：
 *   圭角（下枭）  斜面外张，最宽
 *   下枋          方，最宽处在下枋
 *   束腰          收进，束腰内多有壸门/方砖雕饰
 *   上枋          方
 *   上枭          斜面内收，挑出檐口
 *   台面 / 台唇
 *
 * 另含：踏跺（带垂带）、御路（斜坡石）、栏杆（望柱/栏板）。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** 四棱台（上小下大 / 上大下小） */
function frustum(bw, bd, tw, td, h) {
  const g = new THREE.CylinderGeometry(
    Math.max(tw, td) * 0.707,
    Math.max(bw, bd) * 0.707,
    h,
    4,
    1
  );
  g.rotateY(Math.PI / 4);
  // 矩形底与顶需要各向缩放，改用手动构造
  g.dispose();
  return boxFrustum(bw, bd, tw, td, h);
}

/** 真正的矩形棱台 */
function boxFrustum(bw, bd, tw, td, h) {
  const hb = bw / 2;
  const hd = bd / 2;
  const ht = tw / 2;
  const hdT = td / 2;
  const y0 = -h / 2;
  const y1 = h / 2;
  const v = [
    // 底面 4 点
    -hb, y0, -hd, hb, y0, -hd, hb, y0, hd, -hb, y0, hd,
    // 顶面 4 点
    -ht, y1, -hdT, ht, y1, -hdT, ht, y1, hdT, -ht, y1, hdT,
  ];
  const idx = [
    0, 1, 5, 0, 5, 4, // 前面
    1, 2, 6, 1, 6, 5, // 右
    2, 3, 7, 2, 7, 6, // 后
    3, 0, 4, 3, 4, 7, // 左
    4, 5, 6, 4, 6, 7, // 顶
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // UV 按尺寸铺，供砖石贴图使用
  const pos = g.attributes.position;
  const uv = new Float32Array((pos.count * 2));
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) / 3;
    uv[i * 2 + 1] = pos.getY(i) / 3;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/**
 * 须弥座
 * @param {number} w  台基宽（X）
 * @param {number} d  台基深（Z）
 * @param {number} h  台基高
 * @param {number} out 出挑（台基比建筑四周多出）
 */
export function buildXumizuo(w, d, h, out = 1.2) {
  const parts = [];
  const W = w + out * 2;
  const Dp = d + out * 2;

  // 各层高度比例
  const hGui = h * 0.13; // 圭角
  const hXia = h * 0.11; // 下枋
  const hShou = h * 0.3; // 束腰
  const hShang = h * 0.1; // 上枋
  const hXiao = h * 0.14; // 上枭
  const hMian = h * 0.22; // 台面

  let y = 0;

  // 圭角：斜面外张
  const gui = boxFrustum(W - out * 0.5, Dp - out * 0.5, W, Dp, hGui);
  gui.translate(0, y + hGui / 2, 0);
  parts.push(gui);
  y += hGui;

  // 下枋
  const xia = new THREE.BoxGeometry(W, hXia, Dp);
  xia.translate(0, y + hXia / 2, 0);
  parts.push(xia);
  y += hXia;

  // 束腰（收进）
  const waistW = W - out * 0.55;
  const waistD = Dp - out * 0.55;
  const shou = new THREE.BoxGeometry(waistW, hShou, waistD);
  shou.translate(0, y + hShou / 2, 0);
  parts.push(shou);
  y += hShou;

  // 上枋
  const shang = new THREE.BoxGeometry(waistW, hShang, waistD);
  shang.translate(0, y + hShang / 2, 0);
  parts.push(shang);
  y += hShang;

  // 上枭：斜面向外挑
  const xiao = boxFrustum(waistW, waistD, W - out * 0.15, Dp - out * 0.15, hXiao);
  xiao.translate(0, y + hXiao / 2, 0);
  parts.push(xiao);
  y += hXiao;

  // 台面
  const mian = new THREE.BoxGeometry(W - out * 0.15, hMian, Dp - out * 0.15);
  mian.translate(0, y + hMian / 2, 0);
  parts.push(mian);

  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return { geometry: merged, topY: y + hMian };
}

/**
 * 踏跺（台阶）+ 垂带 + 御路
 * @param {number} width  踏跺宽
 * @param {number} h      台基高
 * @param {number} depth  出挑方向的进深
 * @param {number} dirZ   出挑方向（+1 朝 +Z）
 */
export function buildSteps(width, h, depth, dirZ = -1) {
  const parts = [];
  const n = Math.max(3, Math.round(h / 0.165));
  const stepH = h / n;
  const stepD = depth / n;

  for (let i = 0; i < n; i++) {
    const w = width + (n - i) * 0.18;
    const g = new THREE.BoxGeometry(w, stepH + 0.02, stepD * 1.2);
    g.translate(0, stepH * (i + 0.5), dirZ * (depth * 0.5 + stepD * (n - i - 0.5)));
    parts.push(g);
  }

  // 垂带（两侧斜坡石）
  for (const sx of [-1, 1]) {
    const g = new THREE.BoxGeometry(0.42, 0.16, depth * 1.9);
    g.rotateX(dirZ * Math.atan2(h, depth * 1.7));
    g.translate(sx * (width / 2 + 0.1), h / 2 + 0.05, dirZ * depth * 0.42);
    parts.push(g);
  }

  // 御路（中间斜坡石，稍高）
  const ramp = new THREE.BoxGeometry(width * 0.3, 0.14, depth * 1.75);
  ramp.rotateX(dirZ * Math.atan2(h, depth * 1.7));
  ramp.translate(0, h / 2 + 0.13, dirZ * depth * 0.42);
  parts.push(ramp);

  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/**
 * 栏杆：望柱 + 栏板 + 地霞（朝南的正面栏杆）
 */
export function buildRailing(width, z, height = 1.0, dirZ = -1) {
  const parts = [];
  const post = 0.18;
  const n = Math.max(2, Math.round(width / 1.6));
  for (let i = 0; i <= n; i++) {
    const x = -width / 2 + (width * i) / n;
    const g = new THREE.BoxGeometry(post, height, post);
    g.translate(x, height / 2, z);
    parts.push(g);
    const cap = new THREE.BoxGeometry(post * 1.35, 0.09, post * 1.35);
    cap.translate(x, height + 0.04, z);
    parts.push(cap);
  }
  for (let i = 0; i < n; i++) {
    const x = -width / 2 + (width * (i + 0.5)) / n;
    const panel = new THREE.BoxGeometry((width / n) - post, height * 0.52, 0.1);
    panel.translate(x, height * 0.34, z);
    parts.push(panel);
    const dia = new THREE.BoxGeometry((width / n) - post, height * 0.2, 0.12);
    dia.translate(x, height * 0.78, z);
    parts.push(dia);
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}
