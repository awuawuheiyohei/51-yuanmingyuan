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
 * 步步锦的**分格参数** —— 生成与自检共用同一份（避免两套数字各说各话）。
 * @returns {{cols:number, rows:number, cw:number, rh:number, barW:number}}
 */
export function bubuJinGrid(w, h) {
  const barW = 0.035; // 棂条宽
  // ⚠ 分格要密：原来 0.42m × 0.46m 一格，槅扇远看是"空架子"，
  //   不像步步锦。真实步步锦的分格约 0.22~0.30m。
  const cols = Math.max(4, Math.round(w / 0.28));
  const rows = Math.max(6, Math.round(h / 0.30));
  return { cols, rows, cw: w / cols, rh: h / rows, barW };
}

/**
 * 步步锦格心
 * @param {number} w  格心宽
 * @param {number} h  格心高
 * @param {number} t  棂条厚（进深）
 */
export function buildBubuJin(w, h, t = 0.05) {
  const parts = [];
  const { cols, rows, cw, rh, barW } = bubuJinGrid(w, h);

  // 竖棂：每格一条（落在分格线上）
  for (let c = 0; c <= cols; c++) {
    const x = -w / 2 + c * cw;
    parts.push(bar(barW, h, t, x, 0, 0));
  }

  /**
   * 横棂：画在**行分界线上**（格心的上下沿由绦环板/裙板收边）。
   *
   * ⚠⚠ 2026-11-19 修正（3D设计 白模体检发现）：
   *   原来奇数列写成 `x0 − len ⇒ x0` ⇒ 横棂**跑到前一格里去了**，
   *   于是 ① 与前一格的横棂**同 z 重叠**（z-fighting）
   *      ② 每一格有**半边是空的** ⇒ 格心读作"几根浮着的短棂条"，不是步步锦。
   *   现在**每条横棂必须整条落在自己那一格内**：
   *     偶数列：贴着左边竖棂起，长 0.75 格
   *     奇数列：从格中起，到右边竖棂前止，长 0.5 格
   *   ⇒ 两格拼出一个"步步"的阶梯，且**互不重叠**。
   */
  for (let r = 1; r < rows; r++) {
    const y = -h / 2 + r * rh;
    for (let c = 0; c < cols; c++) {
      const x0 = -w / 2 + c * cw;
      const even = c % 2 === 0;
      const xStart = even ? x0 + barW / 2 : x0 + 0.5 * cw;
      const xEnd = even ? x0 + 0.75 * cw : x0 + cw - barW / 2;
      parts.push(bar(xEnd - xStart, barW, t, (xStart + xEnd) / 2, y, 0));
      // 末端"锦"花头（短竖棂）：**从横棂上沿起** ⇒ 不与横棂同面重叠；
      // 右端也**退半个棂宽** ⇒ 不与竖棂重叠。
      if (r % 2 === 1) {
        parts.push(bar(barW, rh * 0.42, t, xEnd - barW / 2, y + barW / 2 + rh * 0.21, 0));
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
