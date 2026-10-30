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
  spiralRamp,
  balustrade,
  octagonalPavilion,
  baroqueGate,
  archVoussoirs,
  volute,
  leaf,
  planter,
  steps,
} from './kit.js';

/** 山体：层叠咬合的石块（不是锥体） */
function rockHill(radius = 20, height = 17) {
  const parts = [];
  const layers = 7;
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1);
    const r = radius * (1 - t * 0.78);
    const y = height * t;
    const n = Math.max(4, Math.round(9 - t * 4));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + i * 0.7;
      const rr = r * (0.62 + ((k * 37) % 11) / 24);
      const s = r * (0.3 + ((k * 53) % 13) / 30);
      const b = sph(s, 7, 6);
      b.scale(1.15, 0.72, 1.0);
      b.rotateY(a * 1.3);
      b.translate(Math.cos(a) * rr, y + s * 0.3, Math.sin(a) * rr);
      parts.push(b);
      // 瘦石（太湖石式的竖条）
      if (k % 3 === 0) {
        const st = sph(s * 0.55, 6, 5);
        st.scale(0.55, 2.3, 0.55);
        st.rotateZ(Math.cos(a) * 0.4);
        st.translate(Math.cos(a) * rr * 1.12, y + s * 1.1, Math.sin(a) * rr * 1.12);
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
  // 八根石柱
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const p = boxAt(0.5, postH, 0.5, Math.cos(a) * radius * 0.94, 0.75 + postH / 2, Math.sin(a) * radius * 0.94);
    p.rotateY(-a);
    parts.push(p);
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
  const ramp = spiralRamp(R * 0.86, 0.6, H - 1.2, 1.55, 3.4, 44);
  c.add('stone', ramp);
  // 黄绿琉璃砖矮墙（墙身绿琉璃、压顶黄琉璃）
  const rampWall = spiralRamp(R * 0.86, 0.6, H - 1.2, 1.55, 3.4, 44);
  c.add('tile-lv', rampWall);

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
