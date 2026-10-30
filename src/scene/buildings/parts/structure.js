/**
 * 清式官式建筑「台基 → 柱网 → 额枋 → 斗栱 → 墙体」参数化构件
 *
 * 所有构件都按「间」与「进深」模数生成，比例取自清式官式做法：
 *   通面阔（开间宽）  3.0 ~ 3.6 m
 *   柱径              通面阔 / 10 ~ /11
 *   檐柱高            面阔的 0.45 ~ 0.6 倍
 *   台基高            0.6 ~ 1.6 m（殿堂更高）
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildDougongSet, dougongProjection } from './dougong.js';
import { buildXumizuo, buildSteps, buildRailing } from './platform.js';
import { buildShanGeParts } from './lattice.js';
import { buildColumnBase } from './details.js';

const KEY = {
  stone: 'stone',
  column: 'column',
  caihua: 'caihua',
  dougong: 'dougong',
  wall: 'wall',
  wood: 'wood',
  lattice: 'lattice',
  ceiling: 'ceiling',
  gold: 'gold',
  dark: 'dark',
  finial: 'finial',
  plaque: 'plaque',
};

function bucket(map, key) {
  if (!map.has(key)) map.set(key, []);
  return map.get(key);
}

/**
 * @param {object} spec
 * @param {number} spec.width      面阔（开间总宽）
 * @param {number} spec.depth      进深
 * @param {number} spec.mian       面阔开间数
 * @param {number} spec.jin        进深开间数
 * @param {number} spec.eaveY      檐口绝对高度
 * @param {number} spec.platformH  台基高
 * @param {number} spec.bayW       单开间宽
 * @param {string} spec.platform   'xumizuo' | 'simple' | 'none'
 * @param {string} spec.caihua     'hexi' | 'xuanzi' | 'su'
 * @param {string} spec.wallType   'brick' | 'red'
 * @param {boolean} spec.hasDougong
 * @param {number[]} spec.doors    正面开门的开间索引
 * @param {boolean} spec.caojing   是否做藻井天花
 */
export function buildStructure(spec) {
  const {
    width,
    depth,
    mian = 5,
    jin = 3,
    eaveY,
    platformH = 0.9,
    bayW = width / mian,
    platform = 'xumizuo',
    caihua = 'xuanzi',
    wallType = 'brick',
    hasDougong = true,
    doors = [],
    caojing = false,
    wallThick = 0.5,
    couplet = null,
  } = spec;

  const geoms = new Map();
  const colDia = Math.max(0.28, Math.min(0.62, bayW / 10));
  const bayD = depth / jin;
  const plinthOut = 1.1;

  /* ------------------------------------------------------------- 台基 */
  let floorY = 0;
  if (platform !== 'none' && platformH > 0.05) {
    if (platform === 'xumizuo') {
      // 须弥座：圭角 — 下枋 — 束腰 — 上枋 — 上枭 — 台面
      const xm = buildXumizuo(width, depth, platformH, 1.25);
      xm.geometry.translate(0, platformH / 2, 0);
      bucket(geoms, KEY.stone).push(xm.geometry);
      floorY = platformH;
    } else {
      // 素台基
      const pw = width + 1.9;
      const pd = depth + 1.9;
      const g = new THREE.BoxGeometry(pw, platformH, pd);
      g.translate(0, platformH / 2, 0);
      bucket(geoms, KEY.stone).push(g);
      floorY = platformH;
    }

    // 踏跺（台阶 + 垂带 + 御路）：正面（南，+Z）
    const sw = Math.min(bayW * 2.8, 9.5);
    const steps = buildSteps(sw, platformH, 1.6, 1);
    steps.translate(0, 0, depth / 2 + 0.95);
    bucket(geoms, KEY.stone).push(steps);

    // 正面栏杆（望柱 + 栏板），踏跺两侧
    for (const sx of [-1, 1]) {
      const rw = Math.max(2, (width - sw) / 2 - 0.4);
      if (rw < 1.2) continue;
      const rail = buildRailing(rw, 0, 1.0, 1);
      rail.translate(sx * (sw / 2 + rw / 2 + 0.25), platformH, depth / 2 + 0.55);
      bucket(geoms, KEY.stone).push(rail);
    }
  }


  /* ------------------------------------------------------------- 柱网 */
  const colXs = [];
  for (let i = 0; i <= mian; i++) colXs.push(-width / 2 + i * bayW);
  const colZs = [];
  for (let j = 0; j <= jin; j++) colZs.push(-depth / 2 + j * bayD);

  // 构造次序：檐柱 → 额枋 → 斗栱 → 屋面
  // eaveY 是屋面起坡高度，斗栱与额枋都要在它下面
  const beamH = 0.62;
  const beamD = colDia * 1.05;
  const dgHeight = hasDougong ? 1.25 * (spec.dougongScale ?? 1) : 0;
  const colH = eaveY - floorY - beamH - dgHeight;
  const isPerimeter = (i, j) => i === 0 || i === mian || j === 0 || j === jin;

  const addColumn = (x, z, h) => {
    const g = new THREE.CylinderGeometry(colDia / 2, colDia / 2 * 1.02, h, 12);
    g.translate(x, floorY + h / 2, z);
    bucket(geoms, KEY.column).push(g);
    // 柱础：覆盆式（真建筑是圆转收分的，不是方柱墩）
    const b = buildColumnBase(colDia);
    b.translate(x, floorY, z);
    bucket(geoms, KEY.stone).push(b);
  };

  for (let i = 0; i <= mian; i++) {
    for (let j = 0; j <= jin; j++) {
      if (!isPerimeter(i, j)) continue;
      addColumn(colXs[i], colZs[j], colH);
    }
  }
  // 金柱（进深 ≥5 时加内柱，让内部空间成立）
  if (jin >= 5) {
    for (const j of [1, jin - 1]) {
      for (let i = 1; i < mian; i++) {
        addColumn(colXs[i], colZs[j], colH);
      }
    }
  }

  /* ------------------------------------------------------- 额枋 + 彩画 */
  const beamY = floorY + colH + beamH / 2;

  const addBeam = (len, x, z, alongX) => {
    const g = alongX
      ? new THREE.BoxGeometry(len, beamH, beamD)
      : new THREE.BoxGeometry(beamD, beamH, len);
    g.translate(x, beamY, z);
    bucket(geoms, KEY.caihua).push(g);
  };
  // 前后檐枋（沿 X）
  for (const j of [0, jin]) {
    for (let i = 0; i < mian; i++) {
      addBeam(bayW, (colXs[i] + colXs[i + 1]) / 2, colZs[j], true);
    }
  }
  // 两山檐枋（沿 Z）
  for (const i of [0, mian]) {
    for (let j = 0; j < jin; j++) {
      addBeam(bayD, colXs[i], (colZs[j] + colZs[j + 1]) / 2, false);
    }
  }
  // 垫板（枋下薄板，略暗）
  const banH = 0.34;
  const banY = beamY - beamH / 2 - banH / 2;
  for (const j of [0, jin]) {
    for (let i = 0; i < mian; i++) {
      const g = new THREE.BoxGeometry(bayW - 0.02, banH, beamD * 0.8);
      g.translate((colXs[i] + colXs[i + 1]) / 2, banY, colZs[j]);
      bucket(geoms, KEY.wall).push(g);
    }
  }

  /* ----------------------------------------------------------- 斗栱 */
  if (hasDougong) {
    // 斗栱按清式真尺：坐斗 0.30 见方、三跳总出挑 1.80、通高约 1.25
    const dgScale = spec.dougongScale ?? 1;
    const unit = buildDougongSet(dgScale, 'x');
    const placements = [];
    for (let i = 0; i <= mian; i++) {
      placements.push([colXs[i], colZs[0], 0]);
      placements.push([colXs[i], colZs[jin], 0]);
    }
    for (let j = 0; j <= jin; j++) {
      placements.push([colXs[0], colZs[j], Math.PI / 2]);
      placements.push([colXs[mian], colZs[j], Math.PI / 2]);
    }
    for (const [x, z, rot] of placements) {
      const g = unit.clone();
      // 斗栱坐在柱头，略微出柱心才看得见
      const dir = new THREE.Vector3(Math.sin(rot), 0, Math.cos(rot));
      const out = colDia * 0.55;
      const m = new THREE.Matrix4()
        .makeRotationY(rot)
        .setPosition(x + dir.x * out, floorY + colH + beamH, z + dir.z * out);
      g.applyMatrix4(m);
      bucket(geoms, KEY.dougong).push(g);
    }
    unit.dispose();

    // 重檐：下檐（腰檐）再挑一层斗栱，坐在同一圈柱头的中段
    if (spec.lowerEaveY != null && spec.lowerEaveY < eaveY - 0.6) {
      const lowerUnit = buildDougongSet(dgScale * 0.86, 'x');
      for (const [x, z, rot] of placements) {
        const g = lowerUnit.clone();
        const dir = new THREE.Vector3(Math.sin(rot), 0, Math.cos(rot));
        const out = colDia * 0.55;
        const m = new THREE.Matrix4()
          .makeRotationY(rot)
          .setPosition(
            x + dir.x * out,
            spec.lowerEaveY - beamH - dgHeight * 0.86,
            z + dir.z * out
          );
        g.applyMatrix4(m);
        bucket(geoms, KEY.dougong).push(g);
      }
      lowerUnit.dispose();
    }
  }

  /* ----------------------------------------------------------- 墙体 */
  const wallTop = floorY + colH + beamH - 0.06;
  const wallH = wallTop - floorY;
  if (wallH > 0.2) {
    // 后墙（北，-Z）/ 两侧山墙：实墙（收进柱径，露出角柱）
    const back = new THREE.BoxGeometry(width - colDia, wallH, wallThick);
    back.translate(0, floorY + wallH / 2, -depth / 2 + wallThick / 2);
    bucket(geoms, KEY.wall).push(back);

    for (const sx of [-1, 1]) {
      const side = new THREE.BoxGeometry(wallThick, wallH, depth - colDia);
      side.translate(sx * (width / 2 - wallThick / 2), floorY + wallH / 2, 0);
      bucket(geoms, KEY.wall).push(side);

      // 两侧山墙开槛窗：真框料 + 步步锦格心
      for (let j = 0; j < jin; j++) {
        const cz = (colZs[j] + colZs[j + 1]) / 2;
        const win = buildShanGeParts(bayD * 0.52, wallH * 0.46);
        for (const part of [win.frame, win.lattice]) {
          part.rotateY((sx * Math.PI) / 2);
          part.translate(
            sx * (width / 2 - wallThick / 2 + 0.05),
            floorY + wallH * 0.56,
            cz
          );
        }
        bucket(geoms, KEY.wood).push(win.frame);
        bucket(geoms, KEY.lattice).push(win.lattice);
      }
    }

    // 正面（南，+Z）：门所在开间做成隔扇，其余实墙
    // 墙体收进柱径，柱子在开间之间露出来（清式"墙包柱"的做法）
    const frontZ = depth / 2 - wallThick / 2;
    const doorSet = new Set(doors);
    for (let i = 0; i < mian; i++) {
      const cx = (colXs[i] + colXs[i + 1]) / 2;
      if (doorSet.has(i)) {
        // 门洞内的暗底：殿内是暗的，用墙材质会变成一块红板，
        // 隔扇就贴在红墙上，读不出"开口"
        const back = new THREE.BoxGeometry(bayW - colDia, wallH, 0.1);
        back.translate(cx, floorY + wallH / 2, frontZ - wallThick * 0.42);
        bucket(geoms, KEY.dark).push(back);
        // 隔扇门（四扇槅扇）—— 框料/绦环板/步步锦格心/裙板，全是实体
        const leafW = (bayW - colDia * 1.2) / 4;
        for (let k = 0; k < 4; k++) {
          const lx = cx - (bayW - colDia * 1.2) / 2 + leafW * (k + 0.5);
          const { frame, lattice } = buildShanGeParts(leafW * 0.94, wallH * 0.96);
          frame.translate(lx, floorY + wallH / 2, frontZ + wallThick * 0.12);
          lattice.translate(lx, floorY + wallH / 2, frontZ + wallThick * 0.12);
          // 框料上红漆，格心是棂条 + 背后的暗色门洞——分成两个材质桶
          bucket(geoms, KEY.wood).push(frame);
          bucket(geoms, KEY.lattice).push(lattice);
        }
        // 门楣
        const lintel = new THREE.BoxGeometry(bayW - colDia * 0.6, 0.22, wallThick * 1.1);
        lintel.translate(cx, floorY + wallH - 0.11, frontZ + wallThick * 0.1);
        bucket(geoms, KEY.wood).push(lintel);

        // 楹联：正门两侧柱上的黑漆金字竖联（上联在右、下联在左）
        if (couplet && i === Math.floor(mian / 2) && couplet.length >= 2) {
          const cw = 0.42;
          const ch = 2.24;
          const cxDoor = cx;
          const flank = bayW / 2 + colDia * 0.55;
          const up = new THREE.BoxGeometry(cw, ch, 0.08);
          up.translate(cxDoor + flank, floorY + wallH * 0.56, frontZ + wallThick * 0.45);
          bucket(geoms, KEY.couplet).push(up);
          const down = new THREE.BoxGeometry(cw, ch, 0.08);
          down.translate(cxDoor - flank, floorY + wallH * 0.56, frontZ + wallThick * 0.45);
          bucket(geoms, KEY.couplet2).push(down);
        }

        // 匾额：门楣之上的黑漆金字横匾（金边框 + 漆底）
        if (i === Math.floor(mian / 2)) {
          const pw = Math.min(bayW * 0.62, 3.2);
          const ph = Math.min(wallH * 0.2, 0.95);
          const frame = new THREE.BoxGeometry(pw, ph, 0.1);
          frame.translate(cx, floorY + wallH - 0.2 + ph * 0.6, frontZ + wallThick * 0.55);
          bucket(geoms, KEY.finial).push(frame);
          const board = new THREE.BoxGeometry(pw * 0.92, ph * 0.8, 0.13);
          board.translate(cx, floorY + wallH - 0.2 + ph * 0.6, frontZ + wallThick * 0.58);
          bucket(geoms, KEY.plaque).push(board);
        }
      } else {
        const panel = new THREE.BoxGeometry(bayW - colDia, wallH, wallThick);
        panel.translate(cx, floorY + wallH / 2, frontZ);
        bucket(geoms, KEY.wall).push(panel);
      }
    }
  }

  /* ----------------------------------------------------------- 藻井 */
  if (caojing) {
    const g = new THREE.PlaneGeometry(width - colDia * 2, depth - colDia * 2);
    g.rotateX(Math.PI / 2);
    g.translate(0, eaveY - 0.55, 0);
    bucket(geoms, KEY.ceiling).push(g);
  }

  return {
    geoms,
    meta: { colDia, bayW, floorY, beamH, eaveY, colXs, colZs },
  };
}

/**
 * 一斗三升斗栱单元（简化但保留层叠与出挑的形制特征）
 * 局部坐标：原点在柱头中心，+Y 向上，主栱沿 X 出挑
 */
export function buildDougongUnit(colDia = 0.4) {
  const parts = [];
  const s = colDia * 1.55; // 斗栱整体尺度：够大才看得出层叠出挑

  // 坐斗
  const zdou = new THREE.CylinderGeometry(s * 0.42, s * 0.52, s * 0.42, 4);
  zdou.rotateY(Math.PI / 4);
  zdou.translate(0, s * 0.21, 0);
  parts.push(zdou);

  // 三层：栱（横）+ 升（斗）
  const layers = 3;
  for (let l = 0; l < layers; l++) {
    const y = s * (0.42 + l * 0.36);
    const armLen = s * (3.0 - l * 0.45);
    const along = l % 2 === 0;
    const gong = along
      ? new THREE.BoxGeometry(armLen, s * 0.3, s * 0.34)
      : new THREE.BoxGeometry(s * 0.34, s * 0.3, armLen);
    gong.translate(0, y + s * 0.15, 0);
    parts.push(gong);
    // 两端升
    for (const d of [-1, 1]) {
      const sheng = new THREE.BoxGeometry(s * 0.3, s * 0.26, s * 0.3);
      if (along) sheng.translate(d * armLen * 0.42, y + s * 0.15, 0);
      else sheng.translate(0, y + s * 0.15, d * armLen * 0.42);
      parts.push(sheng);
    }
    // 翘（斜臂）：第一层加一对
    if (l === 0) {
      for (const d of [-1, 1]) {
        const qiao = new THREE.BoxGeometry(s * 1.5, s * 0.24, s * 0.24);
        qiao.rotateZ(d * 0.42);
        qiao.translate(d * s * 0.55, y + s * 0.5, 0);
        parts.push(qiao);
      }
    }
  }
  return mergeGeometries(parts, false);
}
