
/**
 * 屋架（抬梁式）——建筑的**骨架**
 *
 * 之前的实现是：柱网 → 额枋 → 斗栱 → 屋面。屋面是个壳，
 * 壳底下什么都没有——从下往上看只有一层望板的背面，
 * 整个建筑就没有"骨"。真实的官式建筑屋面下是一副完整的梁架：
 *
 *   脊檩   屋脊正下的大檩
 *   脊瓜柱 托住脊檩的短柱
 *   三架梁 架在瓜柱上的短梁（前后向）
 *   金檩   架在五架梁上、承瓜柱的檩
 *   瓜柱   五架梁到金檩之间的短柱
 *   五架梁 落在柱头额枋上的大梁（前后向，通长）
 *   垫板   五架梁背上垫金檩的薄板
 *   角背   檐柱上斜撑到金檩的斜杆
 *
 * 这套东西从廊下、隔扇缝、檐口斜看进去都能看见，
 * 是"这是盖出来的房子"和"这是一个壳"的分水岭。
 */
function buildRoofFrame(opts) {
  const {
    width,
    depth,
    colXs,
    eaveY,
    rise,
    colTop,
    geoms,
    bucket,
    KEY,
    fold,
    /**
     * 屋面表面高度函数 `(z) => y`。
     *
     * **必须由 buildRoof 提供**（与屋面网格共用同一套高度场）。
     * 之前屋架自己算 `ridgeY - rise*fold(|z|/Wz)`，但：
     *   ① Wz 取 halfD+1.2，屋面实际是 depth/2+overhang → 举折对不上；
     *   ② 歇山是两段式（山面 + 庑殿段），单段公式在折线处差一大截。
     * 结果：檩条被定在屋面之上，脊檩直接**戳出屋脊** 2m 多——
     * 远看就是屋脊上悬着一根横杠。
     */
    surfAt,
    /** 完整二维高度场 `(x, z) => y`——分段定位檩条时用 */
    surfAtXY = null,
    /** 屋脊实际存在的半宽（米）——脊檩只铺这一段 */
    ridgeHalfWidth = null,
  } = opts;
  const pushWood = (g) => bucket(geoms, KEY.wood).push(g);

  const halfD = depth / 2;
  const ridgeY = eaveY + rise;
  const purlinR = 0.11;

  const zEave = halfD - 0.25;
  const zGold = halfD * 0.5;
  const yGold = surfAt(zGold) - purlinR * 1.6;
  const yRidge = Math.min(ridgeY - purlinR * 1.8, surfAt(0) - purlinR * 2.2);

  const beamH = 0.5; // 五架梁高
  const beamW = 0.26;

  // ---- 檩（沿 X 通长）----
  //
  // **檩必须逐柱位分段**，不能通长一根：
  // 歇山/庑殿的屋面在**角部**明显低于中轴（戗脊把屋面收下去），
  // 通长檩在角部就会顶出屋面。所以每段檩按**该段中点的屋面高度**定位，
  // 角部那一段自然下沉，贴着戗脊走。
  const purlin = (y, z, r = purlinR) => {
    const g = new THREE.CylinderGeometry(r, r, width + 0.3, 7);
    g.rotateZ(Math.PI / 2);
    g.translate(0, y, z);
    pushWood(g);
  };

  /**
   * 沿 X 分段打一根檩。每段单独按屋面高度定位。
   * @param {number} z      檩所在的 Z（进深方向）
   * @param {number} drop   檩顶距屋面的余量（檩径 + 望板 + 瓦厚）
   * @param {number} r      檩半径
   * @param {number} [fallbackY] 没有屋面高度场时的退路
   */
  const segmentedPurlin = (z, drop, r = purlinR, fallbackY = null) => {
    // 分段点：每根柱线一个节点
    const xs = [-width / 2, ...colXs, width / 2].sort((a, b) => a - b);
    // 先算出每个节点的落位高度
    const nodeY = xs.map((x) => {
      if (surfAtXY) return surfAtXY(x, z) - drop;
      return fallbackY !== null ? fallbackY : surfAt(z) - drop;
    });
    for (let i = 0; i < xs.length - 1; i++) {
      const x0 = xs[i];
      const x1 = xs[i + 1];
      if (x1 - x0 < 0.05) continue;
      const y0 = nodeY[i];
      const y1 = nodeY[i + 1];
      const midX = (x0 + x1) / 2;
      const midY = (y0 + y1) / 2;
      const len = x1 - x0 + 0.02;
      const g = new THREE.CylinderGeometry(r, r, len, 7);
      g.rotateZ(Math.PI / 2);
      // 两端高度不同时，沿 X 略微倾斜，贴合屋面的走势（真实檩是直的，
      // 但屋面本身有转折；这里用微倾避免出现台阶状断裂）
      const dy = y1 - y0;
      if (Math.abs(dy) > 0.001) {
        g.rotateY(-Math.atan2(dy, x1 - x0));
      }
      g.translate(midX, midY, z);
      pushWood(g);
    }
  };

  // 檐檩：支在檐柱上，位置固定在檐檩线
  const yEave = eaveY - 0.12;
  purlin(yEave, zEave);
  purlin(yEave, -zEave);
  // 金檩：按各段屋面高度下沉，角部不穿出
  const dropGold = purlinR * 1.6;
  segmentedPurlin(zGold, dropGold, purlinR, surfAt(zGold) - dropGold);
  segmentedPurlin(-zGold, dropGold, purlinR, surfAt(-zGold) - dropGold);
  // 脊檩：在屋脊轴线上。**只铺屋脊真正存在的那一段**——
  // 歇山/卷棚歇山的屋脊到山花边（|x| = xh）为止，两端是山花竖面，
  // 没有脊檩。若通长铺（或按山花处的低屋面下沉），
  // 檩就会从山花里穿出来，或者在屋脊两端凭空多出一截——
  // 远看就是屋脊上悬着一根横杠。
  const dropRidge = purlinR * 2.2;
  const ridgeSpan = ridgeHalfWidth !== null ? ridgeHalfWidth : width / 2;
  if (ridgeSpan > 0.2) {
    const g = new THREE.CylinderGeometry(purlinR * 1.25, purlinR * 1.25, ridgeSpan * 2 + 0.1, 7);
    g.rotateZ(Math.PI / 2);
    g.translate(0, surfAt(0) - dropRidge, 0);
    pushWood(g);
  }

  // ---- 梁（沿 Z 通长）与瓜柱 ----
  const beamAlongZ = (x, y0, y1, w = beamW) => {
    const len = Math.abs(y1 - y0) > 0 ? zEave * 2 : zEave * 2;
    const g = new THREE.BoxGeometry(w, beamH, len);
    g.translate(x, y0 + beamH / 2, 0);
    pushWood(g);
  };

  for (const x of colXs) {
    // 五架梁：落在柱头（额枋）上
    const y0 = colTop;
    const g = new THREE.BoxGeometry(beamW, beamH, zEave * 2);
    g.translate(x, y0 + beamH / 2, 0);
    pushWood(g);

    // 该柱位处的金檩高度：分段檩在角部下沉，瓜柱必须跟着落位，
    // 否则瓜柱会从下沉的金檩旁边穿出去。
    const goldY = surfAtXY
      ? surfAtXY(x, zGold) - purlinR * 1.6
      : yGold;

    // 瓜柱：五架梁背 → 金檩
    const zh = goldY - (y0 + beamH);
    if (zh > 0.12) {
      for (const zs of [1, -1]) {
        const p = new THREE.BoxGeometry(beamW * 0.8, zh, beamW * 0.8);
        p.translate(x, y0 + beamH + zh / 2, zs * zGold);
        pushWood(p);
      }
      // 垫板：五架梁背上垫金檩
      const pad = new THREE.BoxGeometry(beamW * 1.1, 0.09, zGold * 2);
      pad.translate(x, y0 + beamH + 0.045, 0);
      pushWood(pad);
    }

    // 角背：檐柱上斜撑到金檩。
    //
    // **旋转角必须用 atan2(|Δz|, Δy)**——斜杆的长轴是 BoxGeometry 的本地 Y 轴，
    // 绕 X 轴旋转 θ 后指向 (0, cosθ, sinθ)，所以 θ 是"偏离竖直的角度"，
    // 即 tanθ = |Δz| / Δy。
    //
    // 之前写成 atan2(dy, dz)：那是"偏离水平的角度"，两者互为余角，
    // 斜杆被立得比实际更陡，顶端戳出屋面 1m 多（远看屋面里插着一根刺）。
    // 而且两侧的斜杆方向相反，必须按 zs 取相反的旋转符号，否则北坡那根会甩出去。
    for (const zs of [1, -1]) {
      const yA = y0 + beamH * 0.5; // 起点：五架梁端头（檐柱上方）
      const yB = goldY; // 终点：金檩底
      const dy = yB - yA;
      const dz = Math.abs(zEave - zGold);
      if (dy <= 0.05 || dz <= 0.05) continue;
      const len = Math.hypot(dy, dz);
      const br = new THREE.BoxGeometry(beamW * 0.7, len, beamW * 0.7);
      // θ = atan2(|Δz|, Δy)：斜杆相对竖直的倾角
      const theta = Math.atan2(dz, dy);
      // zs=+1（南坡）：杆向 -Z 倾斜 → sinθ<0 → θ 取负
      br.rotateX(zs > 0 ? -theta : theta);
      br.translate(x, (yA + yB) / 2, (zs * (zEave + zGold)) / 2);
      pushWood(br);
    }
  }

  // ---- 三架梁 + 脊瓜柱（只在中柱线上）----
  const midXs = colXs.filter((x) => Math.abs(x) < width * 0.26);
  for (const x of midXs.length ? midXs : [0]) {
    // 三架梁架在金檩上：金檩在哪，这根梁就在哪
    const y0 = surfAtXY ? surfAtXY(x, zGold) - purlinR * 1.6 : yGold;
    const g = new THREE.BoxGeometry(beamW * 0.9, beamH * 0.8, zGold * 2);
    g.translate(x, y0 + beamH * 0.4, 0);
    pushWood(g);
    // 脊瓜柱：托住脊檩。脊檩位置由屋面在屋脊轴线的高度决定
    const ridgeY2 = surfAtXY
      ? Math.min(ridgeY - purlinR * 1.8, surfAtXY(x, 0) - purlinR * 2.2)
      : yRidge;
    const zh = ridgeY2 - (y0 + beamH * 0.8);
    if (zh > 0.12) {
      const p = new THREE.BoxGeometry(beamW * 0.8, zh, beamW * 0.8);
      p.translate(x, y0 + beamH * 0.8 + zh / 2, 0);
      pushWood(p);
    }
  }
}

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
    /**
     * 屋面表面高度函数 `(z) => y`（由 buildRoof 提供）。
     * 没有它就退回到单段举折公式——歇山会穿模，所以必须传。
     */
    roofSurfAt = null,
    /** 屋面完整二维高度场 `(x, z) => y`（用于分段定位檩条） */
    roofSurfAtXY = null,
    /** 屋脊实际存在的半宽（米） */
    roofRidgeHalfWidth = null,
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

  /* --------------------------------------------------------- 屋架（骨架）*/
  // 屋面下的梁架：五架梁 / 瓜柱 / 金檩 / 三架梁 / 脊瓜柱 / 脊檩 / 角背
  //
  // 檩条的高度必须由**真实屋面高度场**反推（roofSurfAt），
  // 不能自己套举折公式：屋面 Wz、歇山折线都只有 roof.js 知道。
  // 之前屋架自算高度，脊檩会高出屋面 2m，屋脊上凭空悬一根横杠。
  const frameRise = spec.rise ?? Math.max(1.8, width * 0.26);
  const foldT = (t) => Math.pow(Math.min(1, Math.max(0, t)), 0.62);
  const fallbackSurf = (z) => {
    const Wz = depth / 2 + 1.3;
    return eaveY + frameRise - frameRise * foldT(Math.abs(z) / Wz);
  };
  buildRoofFrame({
    width,
    depth,
    colXs,
    eaveY,
    rise: frameRise,
    colTop: floorY + colH,
    geoms,
    bucket,
    KEY,
    fold: foldT,
    surfAt: roofSurfAt || fallbackSurf,
    surfAtXY: roofSurfAtXY,
    ridgeHalfWidth: roofRidgeHalfWidth,
  });

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
    // 清式藻井是**真木作**：井口枋 → 层层叠涩的井框（每层内收）→
    // 井心方井（内供佛像/镜子）。原来是一张贴图平面——从下往上看
    // 就是一块印刷品，没有一点体积感。
    //
    // 现在全部建为几何：叠涩层数越多，从下往上看层层收进，
    // 才有"井"的深度。
    const cw = (width - colDia * 2) * 0.56;
    const cd = (depth - colDia * 2) * 0.56;
    const topY = eaveY - 0.55;

    // 1) 井口枋（最外一圈方框）：四根枋木
    for (const [bw, bd, ox, oz] of [
      [cw + 0.72, 0.30, 0, cd / 2 + 0.18],
      [cw + 0.72, 0.30, 0, -cd / 2 - 0.18],
      [0.30, cd + 0.72, cw / 2 + 0.18, 0],
      [0.30, cd + 0.72, -cw / 2 - 0.18, 0],
    ]) {
      const b = new THREE.BoxGeometry(bw, 0.34, bd);
      b.translate(ox, topY - 0.17, oz);
      bucket(geoms, KEY.wood).push(b);
    }

    // 2) 叠涩：层层内收的井框，每层是一圈"回"字木
    const RINGS = 4;
    for (let k = 0; k < RINGS; k++) {
      const t = (k + 1) / RINGS;
      const iw = cw * (1 - t * 0.62);
      const id = cd * (1 - t * 0.62);
      const y = topY - 0.34 - k * 0.26;
      const w = 0.20; // 井框木宽
      // 每一层：四条边框
      for (const [bw, bd, ox, oz] of [
        [iw + w * 2, w, 0, id / 2 + w / 2],
        [iw + w * 2, w, 0, -id / 2 - w / 2],
        [w, id, iw / 2 + w / 2, 0],
        [w, id, -iw / 2 - w / 2, 0],
      ]) {
        const b = new THREE.BoxGeometry(bw, 0.26, bd);
        b.translate(ox, y, oz);
        bucket(geoms, KEY.wood).push(b);
      }
    }

    // 3) 井心方井底：最深处的平面（内供佛像/镜子）
    {
      const iw = cw * (1 - 0.62);
      const id = cd * (1 - 0.62);
      const g = new THREE.PlaneGeometry(iw, id);
      g.rotateX(Math.PI / 2);
      g.translate(0, topY - 0.34 - RINGS * 0.26 - 0.02, 0);
      bucket(geoms, KEY.ceiling).push(g);
    }
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
