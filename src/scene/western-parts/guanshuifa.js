/**
 * 观水法 —— 坐南朝北的御座平台
 *
 * 考据（architecture-notes.md 第三节「观水法」）：
 *   - 坐南朝北，左右列石鼎炉各一台，栏上有石刻花盆四对
 *   - 台中设宝座，左右列二铜鹤，二鹤头相对，口衔铜横条，
 *     条下横布五色玻璃六棱坠子
 *   - 座后有西洋式屏风一座，半圆形，中嵌石刻屏心五件
 *   - 石屏东西为方形小塔各一，塔两旁有石刻花盆，
 *     再东西为西洋座钟式精雕巴洛克角门各一（出角门可至长春园泽兰堂）
 *
 * 局部坐标：+Z 为**北**（朝大水法），故本组的 rotY 相对景区坐标系 +180°。
 * 该点的位置为**推定**：位于大水法水池正南（按 brief 与 WIKI「坐南朝北」），
 * 具体偏移量见 western.js 的 GUAN_SHUI_FA_OFFSET。
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
  crane,
  balustrade,
  baluster,
  stoneTripod,
  planter,
  volute,
  leaf,
  pediment,
  throne,
  semicircleScreen,
  screenPanels,
  waterJet,
  spray,
} from './kit.js';
import { octagonalPool } from './fountain.js';

/** 方形小塔（观水法屏风两侧） */
function squareTower(size = 2.2, height = 5.4) {
  const parts = [];
  parts.push(boxAt(size + 0.8, 0.5, size + 0.8, 0, 0.25, 0));
  parts.push(boxAt(size, height - 1.4, size, 0, 0.5 + (height - 1.4) / 2, 0));
  // 四角的壁柱
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push(boxAt(0.36, height - 1.6, 0.36, sx * (size / 2 - 0.1), 0.5 + (height - 1.6) / 2, sz * (size / 2 - 0.1)));
    }
  }
  // 檐口 + 攒尖顶
  parts.push(boxAt(size + 1.2, 0.42, size + 1.2, 0, height - 0.9, 0));
  parts.push(boxAt(size + 0.6, 0.3, size + 0.6, 0, height - 0.55, 0));
  const prof = [];
  for (let i = 0; i <= 5; i++) {
    const t = i / 5;
    prof.push(new THREE.Vector2((size / 2 + 0.7) * (1 - t * t * 0.92), t * 2.2));
  }
  parts.push(lathe(prof, 8));
  const fin = sph(0.28, 9, 7);
  fin.translate(0, height + 1.5, 0);
  parts.push(fin);
  return mergeAll(parts);
}

/** 座钟式巴洛克角门（出角门可至长春园泽兰堂） */
function clockTowerGate(height = 7.2) {
  const parts = [];
  parts.push(boxAt(4.6, 0.6, 3.0, 0, 0.3, 0));
  parts.push(boxAt(3.4, height - 2.6, 2.4, 0, 0.6 + (height - 2.6) / 2, 0));
  // 侧壁柱
  for (const sx of [-1, 1]) {
    parts.push(boxAt(0.5, height - 2.8, 0.5, sx * 1.6, 0.6 + (height - 2.8) / 2, 1.2));
    const v = volute(0.6, 0.12, 1.5);
    v.rotateY(Math.PI / 2);
    v.translate(sx * 1.6, height - 2.4, 1.4);
    parts.push(v);
  }
  // 顶檐
  parts.push(boxAt(4.4, 0.44, 3.0, 0, height - 1.9, 0));
  parts.push(boxAt(3.8, 0.3, 2.6, 0, height - 1.5, 0));
  // 座钟（钟面 + 钟顶）
  const clock = cyl(1.0, 1.05, 0.35, 16);
  clock.rotateX(Math.PI / 2);
  clock.translate(0, height - 0.3, 1.5);
  parts.push(clock);
  const dome = sph(1.0, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.scale(1, 0.8, 1);
  dome.translate(0, height + 0.6, 1.3);
  parts.push(dome);
  const spire = cone(0.2, 1.1, 8);
  spire.translate(0, height + 1.7, 1.3);
  parts.push(spire);
  return mergeAll(parts);
}

export function buildGuanShuiFa(c, opts) {
  const { x, y, z, rotY = 0 } = opts;
  c.setTransform(x, y, z, rotY);

  const PW = 22; // 台宽
  const PD = 15; // 台深
  const PLAT = 1.2;

  /* ------------------------------------------------------------ 台基 */
  c.add('stone', boxAt(PW, PLAT - 0.35, PD, 0, (PLAT - 0.35) / 2, 0));
  c.add('stone', boxAt(PW + 0.7, 0.3, PD + 0.7, 0, PLAT - 0.2, 0));
  c.add('stone', boxAt(PW + 0.2, 0.2, PD + 0.2, 0, PLAT - 0.05, 0));
  // 正面（北）踏跺
  for (let i = 0; i < 4; i++) {
    c.add('stone', boxAt(7.0 - i * 0.4, (PLAT * (4 - i)) / 4 / 1, 0.9, 0, (PLAT * (4 - i)) / 8, PD / 2 + 0.5 + i * 0.9));
  }

  /* ------------------------------------------------------------ 宝座 */
  const th = throne();
  th.rotateY(Math.PI);
  th.translate(0, PLAT, 1.8);
  c.add('stone', th);
  // 宝座后的御座台
  c.add('stone', boxAt(6.0, 0.5, 3.0, 0, PLAT + 0.25, 1.8));
  c.add('stone', boxAt(6.6, 0.24, 3.6, 0, PLAT + 0.55, 1.8));

  /* ------------------------------------------------------------ 二铜鹤 + 铜横条 + 五色玻璃坠 */
  const CS = 1.6;
  for (const sx of [-1, 1]) {
    const cr = crane(CS);
    cr.rotateY(sx > 0 ? -Math.PI / 2 : Math.PI / 2);
    cr.translate(sx * 3.4, PLAT, 1.4);
    c.add('metal', cr);
  }
  const barY = PLAT + 1.6 * CS;
  const bar = cyl(0.09, 0.09, 5.8, 8);
  bar.rotateZ(Math.PI / 2);
  bar.translate(0, barY, 1.4);
  c.add('metal', bar);
  // 条下五色玻璃六棱坠子
  const beadColors = ['tile-hong', 'tile-lan', 'tile-lv', 'tile-jin', 'tile-wuse'];
  for (let i = 0; i < 5; i++) {
    const bx = -1.6 + i * 0.8;
    const pendant = cyl(0.19, 0.19, 0.5, 6);
    pendant.translate(bx, barY - 0.42, 1.4);
    c.add(beadColors[i], pendant);
    const link = cyl(0.03, 0.03, 0.2, 5);
    link.translate(bx, barY - 0.1, 1.4);
    c.add('metal', link);
  }

  /* ------------------------------------------------------------ 半圆形西洋屏风 */
  const screen = semicircleScreen(7.0, 4.8);
  screen.translate(0, PLAT, -1.6);
  c.add('stone', screen);
  const panels = screenPanels(7.0, 4.8);
  panels.translate(0, PLAT, -1.6);
  c.add('stone', panels);

  /* ------------------------------------------------------------ 屏风东西方形小塔 */
  for (const sx of [-1, 1]) {
    const tw = squareTower(2.2, 5.6);
    tw.translate(sx * 8.6, PLAT, -3.0);
    c.add('stone', tw);
    // 塔两旁的石刻花盆
    for (const s2 of [-1, 1]) {
      const pl = planter(1.2, 1.0);
      pl.translate(sx * 8.6 + s2 * 2.4, PLAT, -3.0);
      c.add('stone', pl);
    }
  }

  /* ------------------------------------------------------------ 再东西：座钟式巴洛克角门 */
  for (const sx of [-1, 1]) {
    const gate = clockTowerGate(7.4);
    gate.rotateY(sx > 0 ? 0.35 : -0.35);
    gate.translate(sx * 12.4, PLAT, -2.4);
    c.add('stone', gate);
  }

  /* ------------------------------------------------------------ 左右石鼎炉 */
  for (const sx of [-1, 1]) {
    const ding = stoneTripod(1.0, 2.7);
    ding.translate(sx * 6.6, PLAT, 5.2);
    c.add('stone', ding);
  }

  /* ------------------------------------------------------------ 栏与石刻花盆四对 */
  const railZ = PD / 2 - 0.4;
  const rail = balustrade(PW - 1.2, 1.1);
  rail.translate(0, PLAT, railZ);
  c.add('stone', rail);
  for (const sx of [-1, 1]) {
    const r = balustrade(PD - 1.2, 1.1);
    r.rotateY(Math.PI / 2);
    r.translate(sx * (PW / 2 - 0.4), PLAT, 0);
    c.add('stone', r);
  }
  // 四对石刻花盆（每对两只，共 8 只）
  for (let i = 0; i < 4; i++) {
    const px = -6.6 + i * 4.4;
    for (const s2 of [-1, 1]) {
      const pl = planter(0.95, 0.85);
      pl.translate(px, PLAT + 1.1, railZ - s2 * 0.5);
      c.add('stone', pl);
    }
  }

  c.clearTransform();
  return {};
}
