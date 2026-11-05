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
  // ⚠ 分格要密：原来 0.42m × 0.46m 一格，槅扇远看是"空架子"，
  //   不像步步锦。真实步步锦的分格约 0.22~0.30m。
  const cols = Math.max(4, Math.round(w / 0.28));
  const rows = Math.max(6, Math.round(h / 0.30));
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
/**
 * 槅扇/槛窗：分成**框料**、**格心**、**素漆板**三件返回。
 *
 * 为什么要分开：框料是朱红大漆（wood 材质），格心是棂条 + 背后的暗色门洞。
 * 合成一件的话，格心会跟着上红漆——一扇门全是红的，棂条根本读不出来。
 *
 * ⚠ 2026-10-31 增：绦环板与裙板也要单独出来。
 *   它们是**素漆板**（多素黑），不是雕花木门。
 *   以前它们跟着框料走 'wood' 桶 —— 那个桶贴的是一张 AI 生成的
 *   **雕花木门照片**，于是每片裙板上都印着半扇门，同一个花纹原样重复，
 *   这就是"浓的贴图感"的直接来源。
 */
export function buildShanGeParts(w, h, opts = {}) {
  const { lattice = 'bubu', t = 0.06 } = opts;
  const frameParts = [];
  const latticeParts = [];
  const panelParts = [];
  const paperParts = [];
  const fw = 0.075;

  // 三段高度分配
  const tiaoH = h * 0.14; // 绦环板
  const qunH = h * 0.24; // 裙板
  const geH = h - tiaoH - qunH - fw * 2;

  const top = h / 2 - fw / 2;
  const bot = -h / 2 + fw / 2;

  // 框料
  frameParts.push(buildFrame(w, h, t, fw));

  // 绦环板（实心薄板）—— 素漆
  const tiao = new THREE.BoxGeometry(w - fw * 2, tiaoH, t * 0.55);
  tiao.translate(0, top - tiaoH / 2, 0);
  panelParts.push(tiao);

  // 裙板（实心厚板）—— 素漆
  const qun = new THREE.BoxGeometry(w - fw * 2, qunH, t * 0.8);
  qun.translate(0, bot + qunH / 2, 0);
  panelParts.push(qun);

  // 格心
  const geY = bot + qunH + geH / 2;
  const lat =
    lattice === 'bubu'
      ? buildBubuJin(w - fw * 2, geH, t * 0.7)
      : buildBubuJin(w - fw * 2, geH, t * 0.7);
  lat.translate(0, geY, 0);
  latticeParts.push(lat);

  /**
   * **窗纸**（格心背后裱的那层纸）。
   *
   * ⚠ 原来格心后面是**空的** —— 从外面看过去就是一片死黑
   *   （殿内暗底的颜色），整排门窗像一排黑洞。
   *   清式门窗是**裱纸窗**：棂条在前、纸在后，白天纸比暗室内亮得多，
   *   远看成一片暖黄 ⇒ 立面立刻"活"起来。
   *
   * 纸放在棂条**内侧**（z 负向），且在殿内暗底之前。
   */
  const paper = new THREE.BoxGeometry(w - fw * 2, geH, 0.012);
  paper.translate(0, geY, -t * 0.5);
  paperParts.push(paper);

  const frame = mergeGeometries(frameParts, false);
  const lat2 = mergeGeometries(latticeParts, false);
  const panel = mergeGeometries(panelParts, false);
  const pap = mergeGeometries(paperParts, false);
  for (const p of frameParts) p.dispose();
  for (const p of latticeParts) p.dispose();
  for (const p of panelParts) p.dispose();
  for (const p of paperParts) p.dispose();
  return { frame, lattice: lat2, panel, paper: pap };
}

/** 槅扇（合成一件，兼容旧调用） */
export function buildShanGe(w, h, opts = {}) {
  const { frame, lattice, panel } = buildShanGeParts(w, h, opts);
  const g = mergeGeometries([frame, lattice, panel], false);
  frame.dispose();
  lattice.dispose();
  panel.dispose();
  return g;
}

/**
 * 槛窗（墙上的窗）：窗框 + 格心
 */
export function buildJianChuang(w, h, opts = {}) {
  return buildShanGe(w, h, opts);
}
