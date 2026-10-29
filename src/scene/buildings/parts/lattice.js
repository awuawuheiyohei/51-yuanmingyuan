/**
 * 隔扇（门窗）的真构件
 *
 * 隔扇由四段组成，自上而下：
 *   框料   四周的边梃，上有"上下枭混"线脚（内缘起一道台阶）
 *   绦环板 框料与格心之间的一条矮板
 *   格心   真正的棂条格（步步锦），由一根根小方料组成
 *   裙板   格心之下的实心板
 *
 * 步步锦的做法：竖棂分格，格内用长短不一的横棂错落拼出"步步"，
 * 每格末端接一段短竖棂，形成阶梯状图案。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** 棂条：细长方料 */
function bar(w, h, d, x, y, z, rot = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rot) g.rotateZ(rot);
  g.translate(x, y, z);
  return g;
}

/**
 * 步步锦格心
 * @param {number} w  格心宽
 * @param {number} h  格心高
 * @param {number} t  棂条厚（进深）
 */
export function buildBubuJin(w, h, t = 0.05) {
  const parts = [];
  const barW = 0.035; // 棂条宽
  const cols = Math.max(3, Math.round(w / 0.42));
  const rows = Math.max(4, Math.round(h / 0.46));
  const cw = w / cols;
  const rh = h / rows;

  // 竖棂：每格一条
  for (let c = 0; c <= cols; c++) {
    const x = -w / 2 + c * cw;
    parts.push(bar(barW, h, t, x, 0, 0));
  }

  // 横棂：每格内用长短不一的段拼出"步步"
  for (let r = 0; r < rows; r++) {
    const y = -h / 2 + r * rh;
    for (let c = 0; c < cols; c++) {
      const x0 = -w / 2 + c * cw;
      // 这一格的横棂长度随列错落，形成阶梯
      const len = cw * (c % 2 === 0 ? 0.72 : 0.4);
      const dir = c % 2 === 0 ? 1 : -1;
      parts.push(bar(len, barW, t, x0 + (dir * len) / 2, y, 0));
      // 末端接一小段竖棂（"锦"的花头）
      if (r % 2 === 0) {
        const sx = x0 + dir * len;
        parts.push(bar(barW, rh * 0.42, t, sx, y + rh * 0.21, 0));
      }
    }
  }
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return g;
}

/**
 * 框料：四根边梃 + 上下枭混（内缘一道台阶线脚）
 */
export function buildFrame(w, h, t = 0.06, fw = 0.075) {
  const parts = [];
  // 左右边梃
  for (const sx of [-1, 1]) {
    parts.push(bar(fw, h, t, sx * (w / 2 - fw / 2), 0, 0));
  }
  // 上下边梃
  for (const sy of [-1, 1]) {
    parts.push(bar(w, fw, t, 0, sy * (h / 2 - fw / 2), 0));
  }
  // 枭混：沿内缘再叠一道细料，形成台阶
  const sy1 = fw * 0.55;
  for (const sx of [-1, 1]) {
    parts.push(bar(fw * 0.5, h - fw * 2, t * 1.25, sx * (w / 2 - fw * 1.25), 0, 0));
  }
  for (const sy of [-1, 1]) {
    parts.push(bar(w - fw * 2.5, fw * 0.5, t * 1.25, 0, sy * (h / 2 - fw * 1.25), 0));
  }
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return g;
}

/**
 * 一整扇隔扇（门扇或窗扇）
 * 竖向比例：上绦环板 → 中格心 → 下裙板
 */
export function buildShanGe(w, h, opts = {}) {
  const { lattice = 'bubu', t = 0.06 } = opts;
  const parts = [];
  const fw = 0.075;

  // 三段高度分配
  const tiaoH = h * 0.14; // 绦环板
  const qunH = h * 0.24; // 裙板
  const geH = h - tiaoH - qunH - fw * 2;

  const top = h / 2 - fw / 2;
  const bot = -h / 2 + fw / 2;

  // 框料
  parts.push(buildFrame(w, h, t, fw));

  // 绦环板（实心薄板）
  const tiao = new THREE.BoxGeometry(w - fw * 2, tiaoH, t * 0.55);
  tiao.translate(0, top - tiaoH / 2, 0);
  parts.push(tiao);

  // 裙板（实心厚板）
  const qun = new THREE.BoxGeometry(w - fw * 2, qunH, t * 0.8);
  qun.translate(0, bot + qunH / 2, 0);
  parts.push(qun);

  // 格心
  const geY = bot + qunH + geH / 2;
  const lat =
    lattice === 'bubu'
      ? buildBubuJin(w - fw * 2, geH, t * 0.7)
      : buildBubuJin(w - fw * 2, geH, t * 0.7);
  lat.translate(0, geY, 0);
  parts.push(lat);

  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return g;
}

/**
 * 槛窗（墙上的窗）：窗框 + 格心
 */
export function buildJianChuang(w, h, opts = {}) {
  return buildShanGe(w, h, opts);
}
