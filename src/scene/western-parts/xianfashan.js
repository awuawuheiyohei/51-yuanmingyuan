/**
 * 线法山 —— 可驰马上山的西洋式假山
 *
 * 考据（architecture-notes.md 第三节「线法山」）：
 *   - 正门为巴洛克式西洋牌楼，南北为矮松树篱
 *   - 入门为线法山，四面有盘旋马道，护以黄绿琉璃砖矮墙，可驰马上山
 *   - 山顶为八角四券石亭
 *   - 山东为线法山东门（"螺丝牌楼"），门券上刻蛤蜊、番草、军鼓、交叉军旗浮雕
 *
 * 局部坐标：+Z 朝南（正门在南）。
 */
import * as THREE from 'three';
import { mergeAll } from './materials.js';
import {
  box,
  boxAt,
  cyl,
  cylAt,
  sph,
  cone,
  lathe,
  torus,
  worldUV,
  spiralRamp,
  balustrade,
  octagonalPavilion,
  squareCapital,
  octagonalEntablature,
  baroqueGate,
  archVoussoirs,
  volute,
  leaf,
  planter,
  steps,
} from './kit.js';

/**
 * 一块**有棱角**的石头：正二十面体 + 顶点扰动。
 *
 * 用球体做石头，远看就是一堆光滑的蛋（AGENTS §4.1.1「假山像叠饼」的同款毛病）。
 * 这里对二十面体的顶点做**一致**的径向扰动（同一坐标的重复顶点扰动量相同，
 * 否则非索引网格会被撕开），得到的石头有明确的棱面，flatShading 下棱线清晰。
 */
function rockStone(r, seed = 0) {
  const g = new THREE.IcosahedronGeometry(r, 1);
  const pos = g.attributes.position;
  const cache = new Map();
  const hash = (s) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 10000) / 10000;
  };
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const key = `${x.toFixed(3)}|${y.toFixed(3)}|${z.toFixed(3)}`;
    let k = cache.get(key);
    if (k === undefined) {
      const h = hash(key + ':' + seed);
      k = 0.74 + h * 0.5;
      cache.set(key, k);
    }
    pos.setXYZ(i, x * k, y * k * (0.82 + hash(key + 'v' + seed) * 0.4), z * k);
  }
  g.computeVertexNormals();
  return worldUV(g);
}

/**
 * 山体：层叠咬合的石块（不是锥体，也不是一堆光滑的蛋）。
 *
 * ⚠ 2026-10-30 验收修：原来每层是若干压扁的光球，远看是一堆土豆，
 * 不符合 AGENTS §4.1「假山：层叠咬合的石块，不能是锥体；太湖石要瘦」。
 * 现在：① 每块石头有棱角；② 逐层错位咬合；③ 竖立的瘦石穿插在石层之间。
 */
function rockHill(radius = 20, height = 17) {
  const parts = [];
  const layers = 8;
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1);
    const r = radius * (1 - t * 0.82);
    const y = height * t * 0.92;
    const n = Math.max(5, Math.round(11 - t * 5));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + i * 0.83; // 逐层错位 → 咬合
      const rr = r * (0.55 + ((k * 37) % 11) / 18);
      const s = r * (0.26 + ((k * 53) % 13) / 34);
      const b = rockStone(s, i * 7 + k);
      b.scale(1.25, 0.7, 1.0);
      b.rotateY(a * 1.7);
      b.rotateZ(((k * 29) % 7) / 22 - 0.15);
      b.translate(Math.cos(a) * rr, y + s * 0.25, Math.sin(a) * rr);
      parts.push(b);
      // 瘦石（太湖石式的竖条）：插在石层之间
      if (k % 3 === 0) {
        const st = rockStone(s * 0.5, 100 + i * 5 + k);
        st.scale(0.62, 2.6, 0.62);
        st.rotateZ(Math.cos(a) * 0.35);
        st.translate(Math.cos(a) * rr * 1.15, y + s * 1.3, Math.sin(a) * rr * 1.15);
        parts.push(st);
      }
    }
  }
  // 山顶平台
  parts.push(cyl(radius * 0.3, radius * 0.34, 1.2, 12).translate(0, height - 0.2, 0));
  return mergeAll(parts);
}

/** 八角四券石亭：山顶亭，四面开券 */
function fourArchPavilion(radius = 4.6, postH = 3.4) {
  const parts = [];
  parts.push(cyl(radius * 1.18, radius * 1.24, 0.5, 8).translate(0, 0.25, 0));
  parts.push(cyl(radius * 1.05, radius * 1.12, 0.3, 8).translate(0, 0.6, 0));
  // 八根石柱（**带方柱柱头**：原来柱顶直接顶进檐口）
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const px = Math.cos(a) * radius * 0.94;
    const pz = Math.sin(a) * radius * 0.94;
    const postH2 = postH - 0.34;
    const p = boxAt(0.5, postH2, 0.5, px, 0.75 + postH2 / 2, pz);
    p.rotateY(-a);
    parts.push(p);
    const cap = squareCapital(0.5, 0.5, 0.34);
    cap.rotateY(-a);
    cap.translate(px, 0.75 + postH2, pz);
    parts.push(cap);
  }
  // 檐下**八角檐部**（额枋 + 檐壁 + 檐口）——原来只有两道叠板
  {
    const ent = octagonalEntablature(radius * 0.94, 0.36, { h: 0.42 });
    ent.translate(0, 0.75 + postH - 0.42, 0);
    parts.push(ent);
  }
  // 四面券（南北东西四面各一个券洞）：用**真券石**（分缝 + 拱心石），
  // 不用整圈光面半圆
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const ar = radius * 0.62;
    const springY = 0.75 + postH - ar;
    const arch = archVoussoirs(ar, 0.28, 0.46, 7);
    arch.translate(0, springY, 0);
    arch.rotateY(-a);
    arch.translate(Math.cos(a) * radius * 0.94, 0, Math.sin(a) * radius * 0.94);
    parts.push(arch);
    for (const s2 of [-1, 1]) {
      const jamb = boxAt(0.42, postH - ar, 0.42, 0, 0.75 + (postH - ar) / 2, 0);
      jamb.translate(s2 * ar, 0, 0);
      // 券脚
      const imp = boxAt(0.56, 0.18, 0.56, 0, 0, 0);
      imp.translate(s2 * ar, springY - 0.09, 0);
      for (const g of [jamb, imp]) {
        g.rotateY(-a);
        g.translate(Math.cos(a) * radius * 0.94, 0, Math.sin(a) * radius * 0.94);
        parts.push(g);
      }
    }
  }
  // 檐口 + 八角攒尖顶
  parts.push(cyl(radius * 1.28, radius * 1.24, 0.5, 8).translate(0, 0.75 + postH + 0.25, 0));
  const prof = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    prof.push(new THREE.Vector2(radius * 1.2 * (1 - t * t * 0.9), t * 2.9));
  }
  parts.push(lathe(prof, 8));
  const fin = sph(0.4, 10, 8);
  fin.translate(0, 0.75 + postH + 3.3, 0);
  parts.push(fin);
  return mergeAll(parts);
}

/** 门券浮雕：蛤蜊、番草、军鼓、交叉军旗 */
function gateReliefs(width = 7.4) {
  const parts = [];
  // 蛤蜊（扇形贝壳）
  for (const sx of [-1, 1]) {
    const shell = new THREE.LatheGeometry(
      [
        [1.15, 0],
        [0.9, 0.35],
        [0.45, 0.7],
        [0.1, 0.85],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      10
    );
    shell.computeVertexNormals();
    shell.rotateX(Math.PI / 2);
    shell.rotateZ(sx * 0.3);
    shell.translate(sx * width * 0.3, width * 0.28, 0.3);
    parts.push(shell);
  }
  // 番草
  for (let i = 0; i < 4; i++) {
    const v = volute(0.52, 0.1, 1.5);
    v.translate(-width * 0.3 + i * (width * 0.2), width * 0.3, 0.3);
    parts.push(v);
  }
  // 军鼓（圆筒 + 鼓面）
  const drum = cyl(0.62, 0.62, 0.42, 14);
  drum.rotateX(Math.PI / 2);
  drum.translate(0, width * 0.3, 0.32);
  parts.push(drum);
  // 交叉军旗
  for (const sx of [-1, 1]) {
    const pole = boxAt(0.09, 1.9, 0.09, 0, 0.95, 0);
    pole.rotateZ(sx * 0.55);
    pole.translate(sx * 0.4, width * 0.3, 0.32);
    parts.push(pole);
    const flag = boxAt(1.1, 0.7, 0.07, 0, 0, 0);
    flag.rotateZ(sx * 0.55);
    flag.translate(sx * 1.0, width * 0.3 + 0.5, 0.34);
    parts.push(flag);
  }
  return mergeAll(parts);
}

export function buildXianFaShan(c, opts) {
  const { x, y, z, rotY = 0 } = opts;
  c.setTransform(x, y, z, rotY);

  const R = 20;
  const H = 17;

  /* ------------------------------------------------------------ 山体 */
  const hill = rockHill(R, H);
  c.add('rock', hill);

  /* ------------------------------------------------------------ 四面盘旋马道 */
  // 考据：「入门为线法山，四面有盘旋马道，护以**黄绿琉璃砖矮墙**，可驰马上山」
  // 马道面是石路；琉璃砖的是**矮墙**（墙身绿琉璃、压顶黄琉璃）。
  // ⚠ 原实现把整条马道复制成绿琉璃（两份几何完全重合 → z-fighting）。
  const ramp = spiralRamp(R * 0.86, 0.6, H - 1.2, 1.55, 3.4, 44);
  c.add('stone', ramp.deck);
  c.add('tile-lv', ramp.wall);
  c.add('tile-huang', ramp.coping);

  /* ------------------------------------------------------------ 山顶八角四券石亭 */
  const pav = fourArchPavilion(4.6, 3.6);
  pav.translate(0, H + 0.2, 0);
  c.add('stone', pav);

  /* ------------------------------------------------------------ 正门：巴洛克式西洋牌楼 */
  const gate = baroqueGate(8.4, 9.4, 1.6);
  gate.translate(0, 0, R + 8.0);
  c.add('stone', gate);
  // 门后引道
  c.add('stone', boxAt(6.0, 0.3, 10.0, 0, 0.15, R + 3.5));

  /* ------------------------------------------------------------ 山东：螺丝牌楼 */
  const eastGate = baroqueGate(6.4, 7.6, 1.3);
  eastGate.rotateY(Math.PI / 2);
  eastGate.translate(R + 5.0, 0, -1.0);
  c.add('stone', eastGate);
  const rel = gateReliefs(6.0);
  rel.rotateY(Math.PI / 2);
  rel.translate(R + 5.6, 0, -1.0);
  c.add('stone', rel);

  /* ------------------------------------------------------------ 南北矮松树篱 */
  for (const sz of [1, -1]) {
    for (let i = 0; i < 14; i++) {
      const px = -R * 0.9 + (R * 1.8 * i) / 13;
      const bush = sph(0.95, 7, 6);
      bush.scale(1.35, 0.85, 1.1);
      bush.translate(px, 0.7, sz * (R + 5.4));
      c.add('green', bush);
    }
  }

  c.clearTransform();
  return {};
}
