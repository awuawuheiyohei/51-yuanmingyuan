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
  } = spec;

  const geoms = new Map();
  const colDia = Math.max(0.28, Math.min(0.62, bayW / 10));
  const bayD = depth / jin;
  const plinthOut = 1.1;

  /* ------------------------------------------------------------- 台基 */
  if (platform !== 'none' && platformH > 0.05) {
    const pw = width + plinthOut * 2;
    const pd = depth + plinthOut * 2;
    if (platform === 'xumizuo') {
      // 须弥座：圭角(下) — 束腰(中) — 上枭(上)
      const h0 = platformH * 0.28;
      const h1 = platformH * 0.26;
      const h2 = platformH * 0.46;
      const g0 = new THREE.BoxGeometry(pw, h0, pd);
      g0.translate(0, h0 / 2, 0);
      bucket(geoms, KEY.stone).push(g0);
      const g1 = new THREE.BoxGeometry(pw - 0.34, h1, pd - 0.34);
      g1.translate(0, h0 + h1 / 2, 0);
      bucket(geoms, KEY.stone).push(g1);
      const g2 = new THREE.BoxGeometry(pw - 0.1, h2, pd - 0.1);
      g2.translate(0, h0 + h1 + h2 / 2, 0);
      bucket(geoms, KEY.stone).push(g2);
    } else {
      const g = new THREE.BoxGeometry(pw, platformH, pd);
      g.translate(0, platformH / 2, 0);
      bucket(geoms, KEY.stone).push(g);
    }

    // 踏跺（台阶）：正面（南，+Z）居中
    const steps = Math.max(2, Math.round(platformH / 0.17));
    const sw = Math.min(bayW * 2.6, 8.5);
    for (let i = 0; i < steps; i++) {
      const h = platformH / steps;
      const w = sw + (steps - i) * 0.34;
      const g = new THREE.BoxGeometry(w, h + 0.02, 0.36);
      g.translate(0, h * (i + 0.5), pd / 2 + 0.18 - i * 0.36);
      bucket(geoms, KEY.stone).push(g);
    }
    // 御路石（中间斜坡石）
    const ramp = new THREE.BoxGeometry(sw * 0.34, 0.12, platformH * 1.35);
    ramp.rotateX(-Math.atan2(platformH, platformH * 1.35));
    ramp.translate(0, platformH / 2, pd / 2 + 0.2);
    bucket(geoms, KEY.stone).push(ramp);

    // 四周栏板（可选，简单石栏）
    if (platform === 'xumizuo') {
      for (const sz of [-1, 1]) {
        const g = new THREE.BoxGeometry(pw, 0.5, 0.2);
        g.translate(0, platformH + 0.25, sz * (pd / 2 - 0.1));
        bucket(geoms, KEY.stone).push(g);
      }
    }
  }

  const floorY = platformH; // 室内地坪

  /* ------------------------------------------------------------- 柱网 */
  const colXs = [];
  for (let i = 0; i <= mian; i++) colXs.push(-width / 2 + i * bayW);
  const colZs = [];
  for (let j = 0; j <= jin; j++) colZs.push(-depth / 2 + j * bayD);

  const colH = eaveY - floorY;
  const isPerimeter = (i, j) => i === 0 || i === mian || j === 0 || j === jin;

  const addColumn = (x, z, h) => {
    const g = new THREE.CylinderGeometry(colDia / 2, colDia / 2 * 1.02, h, 12);
    g.translate(x, floorY + h / 2, z);
    bucket(geoms, KEY.column).push(g);
    // 柱础
    const b = new THREE.CylinderGeometry(colDia * 0.85, colDia * 0.95, 0.14, 12);
    b.translate(x, floorY + 0.07, z);
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
  const beamH = 0.62;
  const beamD = colDia * 1.05;
  const beamY = eaveY - beamH / 2 - 0.02;

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
    const unit = buildDougongUnit(colDia);
    const placements = [];
    for (let i = 0; i <= mian; i++) {
      placements.push([colXs[i], colZs[0], 0]);
      placements.push([colXs[i], colZs[jin], 0]);
    }
    for (let j = 0; j <= jin; j++) {
      placements.push([colXs[0], colZs[j], Math.PI / 2]);
      placements.push([colXs[mian], colZs[j], Math.PI / 2]);
    }
    // 斗栱外挑：略出柱心，才能从檐下看见
    const out = colDia * 0.85;
    for (const [x, z, rot] of placements) {
      const g = unit.clone();
      const dir = new THREE.Vector3(Math.sin(rot), 0, Math.cos(rot));
      const m = new THREE.Matrix4()
        .makeRotationY(rot)
        .setPosition(x + dir.x * out, eaveY - 0.02, z + dir.z * out);
      g.applyMatrix4(m);
      bucket(geoms, KEY.dougong).push(g);
    }
    unit.dispose();
  }

  /* ----------------------------------------------------------- 墙体 */
  const wallTop = eaveY - beamH - 0.1;
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
    }

    // 正面（南，+Z）：门所在开间做成隔扇，其余实墙
    // 墙体收进柱径，柱子在开间之间露出来（清式"墙包柱"的做法）
    const frontZ = depth / 2 - wallThick / 2;
    const doorSet = new Set(doors);
    for (let i = 0; i < mian; i++) {
      const cx = (colXs[i] + colXs[i + 1]) / 2;
      if (doorSet.has(i)) {
        // 门洞内的暗底，使隔扇读作"开口"
        const back = new THREE.BoxGeometry(bayW - colDia, wallH, 0.1);
        back.translate(cx, floorY + wallH / 2, frontZ - wallThick * 0.42);
        bucket(geoms, KEY.wall).push(back);
        // 隔扇门（四扇槅扇）
        const leafW = (bayW - colDia * 1.2) / 4;
        for (let k = 0; k < 4; k++) {
          const lx = cx - (bayW - colDia * 1.2) / 2 + leafW * (k + 0.5);
          const frame = new THREE.BoxGeometry(leafW * 0.94, wallH * 0.96, 0.08);
          frame.translate(lx, floorY + wallH / 2, frontZ + wallThick * 0.1);
          bucket(geoms, KEY.wood).push(frame);
          // 棂心（花窗）
          const lat = new THREE.PlaneGeometry(leafW * 0.78, wallH * 0.6);
          lat.translate(lx, floorY + wallH * 0.6, frontZ + wallThick * 0.16);
          bucket(geoms, KEY.lattice).push(lat);
        }
        // 门楣
        const lintel = new THREE.BoxGeometry(bayW - colDia * 0.6, 0.22, wallThick * 1.1);
        lintel.translate(cx, floorY + wallH - 0.11, frontZ + wallThick * 0.1);
        bucket(geoms, KEY.wood).push(lintel);
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
