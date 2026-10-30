/**
 * 清式屋顶参数化生成
 *
 * 关键做法
 * --------
 * 1. 举折曲面：屋面从脊到檐不是直线，而是"脊部陡、檐部缓"的凹曲面。
 *    用 h(t) = t^P (P≈0.62) 表达，P<1 时导数单调递减 → 上陡下缓。
 * 2. 统一高度场：以脊线为界，用「沿脊距离」和「离脊的横向距离」共同
 *    决定高度，使庑殿（斜脊）、悬山（硬山）、攒尖（尖顶）能用同一套公式。
 * 3. 翼角起翘：只在四角区域抬升并外扩平面，形成中国屋顶特有的"翘角"。
 *
 * 支持：庑殿 / 歇山 / 悬山 / 硬山 / 卷棚 / 攒尖(方·圆) / 盝顶
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const P_CURVE = 0.62; // 举折指数：<1 上陡下缓

/** 举折剖面：t∈[0,1] 从脊到檐，返回下坠比例 */
function fold(t) {
  const c = Math.min(1, Math.max(0, t));
  return Math.pow(c, P_CURVE);
}

/** 平滑阶跃 */
function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * @typedef {object} RoofSpec
 * @property {number} width  面阔（X，建筑本体宽）
 * @property {number} depth  进深（Z，建筑本体深）
 * @property {number} eaveY  檐口高度
 * @property {number} rise   脊高比檐口的抬升量
 * @property {string} type   'wudian'|'xieshan'|'xuanshan'|'yingshan'|'juanpeng'|'zanjiandian'|'luding'
 * @property {number} overhang 出檐（Z 方向）
 * @property {number} overhangX 出檐（X 方向，仅悬山/硬山）
 * @property {number} hipRunX 歇山：檐口相对山花外伸的横向距离
 * @property {number} upturn 翼角起翘量（米）
 * @property {number} bulge   翼角平面外扩量（米）
 * @property {number} circular 是否圆形攒尖
 */

/**
 * 生成屋顶。
 * @param {RoofSpec} spec
 * @returns {{ geoms: Map<string, THREE.BufferGeometry[]>, meta: object }}
 */
export function buildRoof(spec) {
  const { doubleEave, ...rest } = spec;
  if (!doubleEave) return buildRoofCore(rest);

  /* ---- 重檐（清式"重檐歇山"）：下檐（腰檐）一圈 + 上檐 ---- */
  const geoms = new Map();
  const inset = Math.max(1.1, Math.min(2.4, Math.min(rest.width, rest.depth) * 0.085));
  const lowerRise = spec.lowerRise ?? Math.max(0.9, (rest.rise ?? 3) * 0.3);
  const Wx = rest.width / 2 + (rest.overhang ?? 1.3);
  const Wz = rest.depth / 2 + (rest.overhang ?? 1.3);

  const lower = buildLowerEave(Wx, Wz, rest.eaveY, lowerRise, inset);
  const upper = buildRoofCore({
    ...rest,
    width: rest.width - 2 * inset,
    depth: rest.depth - 2 * inset,
    eaveY: rest.eaveY + lowerRise,
    rise: Math.max(1.4, (rest.rise ?? 3) - lowerRise),
  });

  for (const src of [lower, upper]) {
    for (const [k, list] of src.geoms) {
      if (!geoms.has(k)) geoms.set(k, []);
      geoms.get(k).push(...list);
    }
  }
  return { geoms, meta: { ...upper.meta, doubleEave: true, lowerEaveY: rest.eaveY } };
}

/**
 * 屋面核心：单层屋面的完整几何（屋面 + 瓦作 + 山花/山墙 + 屋脊 + 檐口）。
 * @param {RoofSpec} spec
 * @param {Map<string, THREE.BufferGeometry[]>} [geomsIn] 复用已有材质桶
 */
function buildRoofCore(spec, geomsIn) {
  const {
    width,
    depth,
    eaveY,
    rise,
    type = 'xieshan',
    overhang = 1.3,
    overhangX = 0.9,
    hipRunX = 4.0,
    upturn = 0.85,
    bulge = 0.5,
    circular = false,
    segments = 1,
  } = spec;

  const geoms = geomsIn || new Map();
  const push = (key, g) => {
    if (!geoms.has(key)) geoms.set(key, []);
    geoms.get(key).push(g);
  };

  // ---------- 平面尺寸 ----------
  const Wx = width / 2 + (type === 'xuanshan' ? overhangX : overhang);
  const Wz = depth / 2 + overhang;

  // 脊线半长
  let xh; // 硬山/悬山：脊沿 X 贯通；庑殿：按 45° 斜脊收进
  if (type === 'wudian') xh = Math.max(0, Wx - Wz);
  else if (type === 'zanjiandian') xh = 0;
  else if (type === 'xieshan' || type === 'juanpengxieshan')
    xh = Math.max(0.5, Wx - hipRunX);
  else if (type === 'yingshan') xh = width / 2;
  else xh = Wx; // 悬山 / 卷棚

  // 歇山的折线高度与折线半深
  // 折线（山花底边）的高度必须与上下两段屋面在折线处接得上，
  // 否则屋面在折线处会多出一道竖直台阶——远看就是一条黑带。
  const yBreak = eaveY + rise * 0.58;
  const tBreak = Math.pow(0.42, 1 / P_CURVE); // 使 fold(tBreak)=0.42
  const zBreak = Wz * tBreak;

  const ridgeY = eaveY + rise;

  /* ------------------------------------------------------------ 高度场 */
  /**
   * @returns {number} 屋面高度
   */
  function heightAt(x, z) {
    const az = Math.abs(z);
    const ax = Math.abs(x);

    if (type === 'luding') return eaveY + rise * 0.12; // 盝顶：平顶

    if (type === 'zanjiandian') {
      // 攒尖：锥面。方形取切比雪夫距离，圆形取径向
      const tx = circular ? ax / Wx : ax / Wx;
      const tz = circular ? az / Wz : az / Wz;
      const t = circular ? Math.hypot(tx, tz) : Math.max(tx, tz);
      return eaveY + rise * (1 - fold(Math.min(1, t)));
    }

    if (type === 'xieshan' || type === 'juanpengxieshan') {
      // 上部：山面之上的悬山段（|z| ≤ zBreak，|x| ≤ xh）
      // 下部：庑殿段（前后坡 + 45° 戗脊收分）
      // 两段在折线处必须都等于 yBreak，否则接缝处会裂出一道竖直台阶。
      if (az <= zBreak) {
        const y = ridgeY - (ridgeY - yBreak) * fold(az / zBreak);
        if (type === 'xieshan') {
          if (ax <= xh) return y;
          return null; // 山花区域：竖直面，稍后单独生成
        }
        // 卷棚歇山：山花位置改为圆缓卷落（无山花）
        const span = Math.max(1.0, Wx - xh);
        const u = Math.min(1, Math.max(0, (ax - xh) / span));
        const k = 1 - smoothstep(0, 1, u);
        return eaveY + (y - eaveY) * k;
      }
      // 下部：沿深度取 t，戗脊在 x = xh + t*(Wx-xh) 处。
      // 戗脊以内取前后坡的举折高度，戗脊以外（角部）取戗脊线上的高度——
      // 角部因此正好落在 eaveY，而不是像旧公式那样掉到 eaveY 的一半。
      const t = (az - zBreak) / (Wz - zBreak);
      const prof = yBreak - (yBreak - eaveY) * fold(t);
      const xHip = xh + t * (Wx - xh);
      if (ax <= xHip) return prof;
      return yBreak - (yBreak - eaveY) * t;
    }

    // 庑殿 / 悬山 / 硬山 / 卷棚
    const base = ridgeY - rise * fold(az / Wz);
    if (ax <= xh) return base;

    if (type === 'wudian') {
      // 45° 斜脊收头
      const u = ax - xh;
      const g = (1 - fold(az / Wz)) * (1 - Math.min(1, u / Wz));
      return eaveY + rise * g;
    }
    if (type === 'juanpeng') {
      // 卷棚：两端圆缓收头，无正脊
      const u = ax - xh;
      const k = 1 - smoothstep(0, Math.max(1, Wx - xh) * 0.9, u);
      return eaveY + (base - eaveY) * k;
    }
    return base; // 悬山 / 硬山：山面垂直封闭
  }

  /* -------------------------------------------------- 屋面网格（高度场） */
  const NU = segments >= 2 ? Math.min(64, Math.round(segments)) : 26;
  const NV = NU;

  const pos = [];
  const uv = [];
  const idx = [];

  const pushVert = (x, y, z, u, v) => {
    pos.push(x, y, z);
    uv.push(u, v);
    return pos.length / 3 - 1;
  };

  if (circular) {
    // 圆形攒尖：极坐标网格
    const rings = NV;
    const segs = NU * 2;
    for (let i = 0; i <= rings; i++) {
      const t = i / rings;
      const r = Wx * t;
      for (let j = 0; j <= segs; j++) {
        const a = (j / segs) * Math.PI * 2;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r * (Wz / Wx);
        const y = heightAt(x, z);
        pushVert(x, y, z, j / segs, t);
      }
    }
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < segs; j++) {
        const a = i * (segs + 1) + j;
        const b = a + 1;
        const c = a + segs + 1;
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
  } else {
    // 矩形网格
    const rows = [];
    for (let i = 0; i <= NV; i++) {
      const tz = i / NV;
      const z = -Wz + 2 * Wz * tz;
      const row = [];
      for (let j = 0; j <= NU; j++) {
        const tx = j / NU;
        const x = -Wx + 2 * Wx * tx;
        row.push([x, z]);
      }
      rows.push(row);
    }
    // 记下每格是否属于"山花竖面"（歇山），这类格子跳过，改生成竖直三角面
    const isShanhua = (x, z) =>
      type === 'xieshan' && Math.abs(z) <= zBreak && Math.abs(x) > xh;

    const grid = [];
    for (let i = 0; i <= NV; i++) {
      const row = [];
      for (let j = 0; j <= NU; j++) {
        const [x0, z0] = rows[i][j];
        let x = x0;
        let z = z0;
        let y = heightAt(x0, z0);
        if (y === null) {
          // 山花区域：顶点放到折线高度，交由竖直面单独处理
          y = yBreak;
        }
        // 翼角：仅在四角抬升 + 外扩
        const cn =
          Math.pow(Math.abs(x0) / Wx, 5) * Math.pow(Math.abs(z0) / Wz, 5);
        if (cn > 0.0005) {
          const eaveT = smoothstep(0.35, 1.0, Math.abs(z0) / Wz);
          const lift = upturn * cn * eaveT;
          x = x0 * (1 + (bulge * cn) / Math.max(Wx, 0.001));
          z = z0 * (1 + (bulge * cn) / Math.max(Wz, 0.001));
          y += lift;
        }
        row.push(pushVert(x, y, z, j / NU, i / NV));
      }
      grid.push(row);
    }
    for (let i = 0; i < NV; i++) {
      for (let j = 0; j < NU; j++) {
        const x0 = -Wx + 2 * Wx * (j / NU);
        const x1 = -Wx + 2 * Wx * ((j + 1) / NU);
        const z0 = -Wz + 2 * Wz * (i / NV);
        const z1 = -Wz + 2 * Wz * ((i + 1) / NV);
        const corners = [
          [x0, z0],
          [x1, z0],
          [x1, z1],
          [x0, z1],
        ];
        // 歇山：|z|<=zBreak 且 |x|>xh 的区域不铺屋面（山花另建）
        let skip = false;
        if (type === 'xieshan') {
          for (const [cx, cz] of corners) {
            if (Math.abs(cz) <= zBreak && Math.abs(cx) > xh) skip = true;
          }
        }
        if (skip) continue;
        const a = grid[i][j];
        const b = grid[i][j + 1];
        const c = grid[i + 1][j + 1];
        const d = grid[i + 1][j];
        idx.push(a, d, b, b, d, c);
      }
    }
  }

  const roofGeo = new THREE.BufferGeometry();
  roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  roofGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  roofGeo.setIndex(idx);
  roofGeo.computeVertexNormals();
  /* ---------------------------------------------------- 瓦作（真构件） */
  // 筒瓦：每垄一道半圆管，沿坡向逐段铺
  const gangCount = Math.max(4, Math.floor((Wx * 2) / TILE.gang));

  // 屋面 UV 与**筒瓦垄距对齐**：贴图横向一个循环 6 垄，纵向一个循环 6 层瓦当，
  // 而一根筒瓦只取其中一垄（见 buildTongWa 的 U0/U1）。
  // 之前屋面网格按 (width/8, depth/8) 铺，与瓦管的取样窗口对不上——
  // 露出来的板瓦面频率是瓦管的数倍，远看整片屋面成了一张花地毯。
  const uvAttr = roofGeo.getAttribute('uv');
  const uScale = gangCount / 6; // 一循环 6 垄 = 6 根筒瓦
  const vScale = (Wz * 2) / 1.5; // 一循环 6 层瓦当 = 1.5 m
  for (let i = 0; i < uvAttr.count; i++) {
    uvAttr.setXY(i, uvAttr.getX(i) * uScale, uvAttr.getY(i) * vScale);
  }
  uvAttr.needsUpdate = true;
  push('tile', roofGeo);

  // 望板：屋面之下的铺板。屋面是单面的，从下往上看会直接看穿到天上，
  // 有了望板，屋架才有"底"，梁架也才有依附的地方。
  {
    const board = roofGeo.clone();
    board.translate(0, -0.075, 0);
    push('board', board);
  }
  // 小屋顶（亭、轩）不做真瓦：远看无差别，却占掉大半构建时间
  const detailTiles = Wx > 3.0;
  const findStart = (x, sign) => {
    // 找出该垄在坡面上的起点（遇到山花区域会跳过）
    for (let i = 0; i <= 30; i++) {
      const z = sign * (Wz * i) / 30;
      if (heightAt(x, z) !== null) return z;
    }
    return null;
  };
  for (let gi = 0; gi <= gangCount && detailTiles; gi++) {
    const x = -Wx + (gi * Wx * 2) / gangCount;
    for (const sign of [1, -1]) {
      const z0 = findStart(x, sign);
      if (z0 === null) continue;
      const sampler = (t) => {
        const z = z0 + (sign * Wz - z0) * t;
        return { x, y: heightAt(x, z), z };
      };
      for (const g of buildTongWa(sampler, 0, 1)) push('tile', g);
    }
  }

  // 檐口：瓦当、滴水、椽头、飞椽（前后两面）
  if (detailTiles) {
    for (const g of buildWadang(Wx, Wz, eaveY, gangCount, 1)) push('tile', g);
    for (const g of buildWadang(Wx, Wz, eaveY, gangCount, -1)) push('tile', g);
  }
  const rc = Math.floor((Wx * 2) / TILE.rafterGap);
  for (const sg of [1, -1]) {
    const rf = buildRafters(Wx, Wz, eaveY, rc, sg);
    for (const g of rf.wood) push('wood', g);
    for (const g of rf.eave) push('eave', g);
  }

  /* -------------------------------------------------- 山花（歇山竖面） */
  if (type === 'xieshan') {
    for (const sgn of [-1, 1]) {
      const x = sgn * xh;
      const g = new THREE.BufferGeometry();
      const v = [
        x, ridgeY, 0,
        x, yBreak, zBreak,
        x, yBreak, -zBreak,
      ];
      g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      g.setAttribute(
        'uv',
        new THREE.Float32BufferAttribute([0, 1, 1, 0, 1, 1], 2)
      );
      g.setIndex(sgn > 0 ? [0, 1, 2] : [0, 2, 1]);
      g.computeVertexNormals();
      push('shanhua', g);
    }
  }

  /* ---------------------------------------------------------- 山墙（硬山） */
  if (type === 'yingshan' || type === 'xuanshan') {
    const gw = type === 'xuanshan' ? width / 2 : Wx;
    for (const sgn of [-1, 1]) {
      const x = sgn * gw;
      const v = [x, eaveY - 0.4, 0, x, eaveY, zBreakGable(Wz, eaveY, rise), x, eaveY, -zBreakGable(Wz, eaveY, rise)];
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0.5, 1, 0.5], 2));
      g.setIndex(sgn > 0 ? [0, 1, 2] : [0, 2, 1]);
      g.computeVertexNormals();
      push('wall', g);
    }
  }

  /* -------------------------------------------------------------- 屋脊 */
  const ridges = [];
  if (type === 'wudian' || type === 'xieshan') {
    ridges.push({
      kind: 'main',
      pts: [
        new THREE.Vector3(-xh, ridgeY, 0),
        new THREE.Vector3(xh, ridgeY, 0),
      ],
    });
  } else if (type === 'xuanshan' || type === 'yingshan') {
    ridges.push({
      kind: 'main',
      pts: [
        new THREE.Vector3(-xh, ridgeY, 0),
        new THREE.Vector3(xh, ridgeY, 0),
      ],
    });
  } else if (type === 'juanpeng') {
    // 卷棚：无正脊，用圆弧脊代替
    const pts = [];
    const N = 14;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const x = -xh + 2 * xh * t;
      const y = ridgeY - rise * 0.02 * Math.sin(t * Math.PI) - (type === 'juanpeng' ? 0 : 0);
      pts.push(new THREE.Vector3(x, y, 0));
    }
    ridges.push({ kind: 'roll', pts });
  } else if (type === 'juanpengxieshan') {
    // 卷棚歇山：圆缓的卷棚脊（两端略垂，中段微拱）
    const pts = [];
    const N = 18;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const x = -xh + 2 * xh * t;
      const dip = Math.pow(Math.abs(2 * t - 1), 2.4);
      const y = ridgeY - rise * 0.055 * dip + rise * 0.012 * Math.sin(t * Math.PI);
      pts.push(new THREE.Vector3(x, y, 0));
    }
    ridges.push({ kind: 'roll', pts });
  } else if (type === 'zanjiandian') {
    ridges.push({ kind: 'finial', apex: new THREE.Vector3(0, eaveY + rise, 0) });
  }

  // 垂脊 / 戗脊
  if (type === 'wudian') {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        ridges.push({
          kind: 'hip',
          pts: hipLine(sx, sz),
        });
      }
    }
  } else if (type === 'xieshan' || type === 'juanpengxieshan') {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        ridges.push({ kind: 'hip', pts: hipLine(sx, sz) });
      }
    }
  } else if (type === 'juanpeng') {
    // 卷棚两端圆缓收头脊
    for (const sx of [-1, 1]) {
      ridges.push({
        kind: 'roll',
        pts: [
          new THREE.Vector3(sx * xh, ridgeY, 0),
          new THREE.Vector3(sx * (xh + (Wx - xh) * 0.45), ridgeY - rise * 0.28, 0),
          new THREE.Vector3(sx * Wx, eaveY + rise * 0.02, 0),
        ],
      });
    }
  }

  /**
   * 45° 戗脊：从山花底角 (xh, zBreak) 斜下到檐角 (Wx, Wz)。
   *
   * 戗脊必须**贴着屋面折线**走。早期版本用一条手写的两点直线，
   * 屋面的角部高度场与它对不上，戗脊就变成一根甩到屋面外的长刺——
   * 远看像屋檐上插了根签子。
   */
  function hipLine(sx, sz) {
    const pts = [];
    const N = 10;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const x = sx * (xh + (Wx - xh) * t);
      const z = sz * (zBreak + (Wz - zBreak) * t);
      const y = yBreak - (yBreak - eaveY) * t;
      pts.push(new THREE.Vector3(x, y + 0.06, z));
    }
    return pts;
  }

  /* -------------------------------------------------------- 脊件几何 */
  for (const r of ridges) {
    if (r.kind === 'finial') {
      push('finial', buildFinial(r.apex, width));
    } else {
      const rw = r.kind === 'hip' ? 0.42 : 0.62;
      push('ridge', buildRidgeBar(r.pts, rw, r.kind === 'hip' ? 0.42 : 0.62));
      // 脊上垒的小筒瓦
      for (const g of buildXiTong(r.pts, rw)) push('ridge', g);
      // 正脊两端的鸱吻 + 脊上小兽
      if (r.kind === 'main') {
        push('finial', buildChiwen(r.pts, 0.62));
      }
      // 垂脊上的走兽：数量按清式制度（庑殿九兽 / 歇山五兽 / 悬山三兽）
      if (r.kind === 'hip') {
        const n = BEAST_COUNT[type] ?? 5;
        if (n > 0) push('finial', buildBeastRow(r.pts, 0.3, n));
      }
    }
  }

  /* ---------------------------------------------------------- 檐口构件 */
  push('eave', buildEaveTrim(Wx, Wz, eaveY, type, xh, Wz, Wx));
  push('finial', buildWadang(Wx, Wz, eaveY, type, xh));

  return {
    geoms,
    meta: { Wx, Wz, ridgeY, eaveY, xh, zBreak, yBreak, type },
  };
}

/**
 * 重檐建筑的下檐（腰檐）。
 *
 * 形制：外圈矩形檐口 → 内圈矩形（上檐的檐口），四面坡面 + 四角戗脊。
 * 四个坡面各由四个角点围成，四面共享四条斜向戗脊，既不重叠也不留缝。
 * 坡面按垄距铺真筒瓦，檐口排瓦当滴水，檐下一圈檐檩。
 *
 * @param {number} Wx 外檐口半宽（X）
 * @param {number} Wz 外檐口半深（Z）
 * @param {number} eaveY 下檐高度
 * @param {number} rise 下檐升起高度
 * @param {number} inset 内圈相对外圈的内收量
 */
function buildLowerEave(Wx, Wz, eaveY, rise, inset) {
  const geoms = new Map();
  const push = (k, g) => {
    if (!geoms.has(k)) geoms.set(k, []);
    geoms.get(k).push(g);
  };

  const ix = Wx - inset;
  const iz = Wz - inset;
  const yi = eaveY + rise;

  // 四个坡面：o = 外檐口两点，i = 内圈两点。四面共享斜向戗脊。
  const faces = [
    { o0: [-Wx, Wz], o1: [Wx, Wz], i0: [-ix, iz], i1: [ix, iz] }, // 南（+Z）
    { o0: [Wx, -Wz], o1: [-Wx, -Wz], i0: [ix, -iz], i1: [-ix, -iz] }, // 北（-Z）
    { o0: [Wx, Wz], o1: [Wx, -Wz], i0: [ix, iz], i1: [ix, -iz] }, // 东（+X）
    { o0: [-Wx, -Wz], o1: [-Wx, Wz], i0: [-ix, -iz], i1: [-ix, iz] }, // 西（-X）
  ];

  for (const f of faces) {
    // 坡面（平面梯形，四个角点）
    const p = [
      f.o0[0], eaveY, f.o0[1],
      f.o1[0], eaveY, f.o1[1],
      f.i1[0], yi, f.i1[1],
      f.i0[0], yi, f.i0[1],
    ];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute(
      'uv',
      new THREE.Float32BufferAttribute([0.02, 0, 0.17, 0, 0.17, 6, 0.02, 6], 2)
    );
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    push('tile', g);

    // 真筒瓦：沿坡向自外檐口铺到内圈
    const oLen = Math.hypot(f.o1[0] - f.o0[0], f.o1[1] - f.o0[1]);
    const count = Math.max(4, Math.floor(oLen / TILE.gang));
    for (let i = 0; i <= count; i++) {
      const s = i / count;
      const ox = f.o0[0] + (f.o1[0] - f.o0[0]) * s;
      const oz = f.o0[1] + (f.o1[1] - f.o0[1]) * s;
      const qx = f.i0[0] + (f.i1[0] - f.i0[0]) * s;
      const qz = f.i0[1] + (f.i1[1] - f.i0[1]) * s;
      const sampler = (t) => ({
        x: ox + (qx - ox) * t,
        y: eaveY + rise * t,
        z: oz + (qz - oz) * t,
      });
      for (const gg of buildTongWa(sampler, 0, 1)) push('tile', gg);
    }

    // 檐口：瓦当 + 滴水
    for (const gg of buildWadangEdge(
      [f.o0[0], f.o0[1]],
      [f.o1[0], f.o1[1]],
      eaveY,
      count
    )) {
      push('tile', gg);
    }

    // 檐下檐檩
    const lm = new THREE.BoxGeometry(
      Math.abs(f.o1[0] - f.o0[0]) || 0.16,
      0.2,
      Math.abs(f.o1[1] - f.o0[1]) || 0.16
    );
    lm.translate((f.o0[0] + f.o1[0]) / 2, eaveY - 0.14, (f.o0[1] + f.o1[1]) / 2);
    push('wood', lm);
  }

  // 四角戗脊：外檐角 → 内圈角
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pts = [
        new THREE.Vector3(sx * Wx, eaveY + 0.06, sz * Wz),
        new THREE.Vector3(sx * ix, yi + 0.04, sz * iz),
      ];
      push('ridge', buildRidgeBar(pts, 0.4, 0.38));
    }
  }

  return { geoms };
}

/**
 * 沿一条檐口线排瓦当（圆盘）与滴水（三角片）。
 * @param {[number,number]} p0 起点 [x,z]
 * @param {[number,number]} p1 终点 [x,z]
 */
/**
 * 一枚带纹样的瓦当。
 *
 * 清代瓦当正面有纹样：最常见的是「团寿」「万寿无疆」四字与团龙。
 * 这里用几何浮雕近似——外圈凸环 + 内盘 + 中心凸起（团寿的骨架），
 * 近看能认出"是一枚有字头的瓦当"，不是一个光板圆片。
 */
function buildWadangPiece(r) {
  const parts = [];
  // 盘身（略呈喇叭口）
  const disc = new THREE.CylinderGeometry(r * 0.96, r, 0.06, 12);
  disc.rotateX(Math.PI / 2);
  parts.push(disc);
  // 外圈凸环
  const rim = new THREE.TorusGeometry(r * 0.78, r * 0.1, 5, 12);
  parts.push(rim);
  // 中心"团寿"骨架：横竖两笔 + 中心小凸
  const bar = new THREE.BoxGeometry(r * 0.95, r * 0.2, 0.035);
  bar.translate(0, 0, 0.035);
  parts.push(bar);
  const bar2 = new THREE.BoxGeometry(r * 0.2, r * 0.95, 0.035);
  bar2.translate(0, 0, 0.035);
  parts.push(bar2);
  const boss = new THREE.SphereGeometry(r * 0.16, 6, 5);
  boss.scale(1, 1, 0.6);
  boss.translate(0, 0, 0.05);
  parts.push(boss);
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/**
 * 滴水（勾头）：清式为倒三角形的如意头，与瓦当相间。
 */
function buildDishiPiece(r) {
  const parts = [];
  const plate = new THREE.CylinderGeometry(r * 1.25, r * 1.05, 0.05, 3);
  parts.push(plate);
  // 如意头的卷云凸起
  const curl = new THREE.TorusGeometry(r * 0.5, r * 0.11, 5, 10, Math.PI * 1.4);
  curl.translate(0, r * 0.3, 0.03);
  parts.push(curl);
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

function buildWadangEdge(p0, p1, eaveY, count) {
  const parts = [];
  const r = 0.115;
  const dx = p1[0] - p0[0];
  const dz = p1[1] - p0[1];
  const len = Math.hypot(dx, dz) || 1;
  const dirX = dx / len;
  const dirZ = dz / len;
  // 外法线：垂直于檐口线、背向中心
  const cx = (p0[0] + p1[0]) / 2;
  const cz = (p0[1] + p1[1]) / 2;
  let nx = dirZ;
  let nz = -dirX;
  if (nx * cx + nz * cz < 0) {
    nx = -nx;
    nz = -nz;
  }
  const yaw = Math.atan2(nx, nz);
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const x = p0[0] + dx * t;
    const z = p0[1] + dz * t;
    const disc = buildWadangPiece(r);
    disc.rotateY(yaw);
    disc.translate(x + nx * 0.03, eaveY - 0.13, z + nz * 0.03);
    parts.push(disc);
    const drip = buildDishiPiece(r);
    drip.rotateY(yaw);
    drip.translate(x + nx * 0.11, eaveY - 0.27, z + nz * 0.11);
    parts.push(drip);
  }
  return parts;
}

/** 鸱吻：正脊两端的兽头饰件 */
function buildChiwen(pts, h) {
  const parts = [];
  for (const end of [pts[0], pts[pts.length - 1]]) {
    const g = new THREE.Group();
    // 主体
    const body = new THREE.BoxGeometry(h * 0.34, h * 0.62, h * 0.5);
    body.translate(0, h * 0.31, 0);
    parts.push(body);
    // 上卷的尾
    const curl = new THREE.CylinderGeometry(h * 0.16, h * 0.2, h * 0.42, 6);
    curl.rotateZ(end === pts[0] ? -0.5 : 0.5);
    curl.translate(end === pts[0] ? -h * 0.14 : h * 0.14, h * 0.72, 0);
    parts.push(curl);
    // 吻兽的嘴
    const snout = new THREE.BoxGeometry(h * 0.2, h * 0.16, h * 0.34);
    snout.translate(end === pts[0] ? h * 0.1 : -h * 0.1, h * 0.12, 0);
    parts.push(snout);
    for (const p of parts.slice(-3)) {
      p.translate(end.x, end.y, end.z);
    }
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/**
 * 清式垂脊小兽的制度（清工部《工程做法》）：
 *
 *   庑殿  九兽：仙人骑凤 → 龙 → 凤 → 狮子 → 天马 → 海马 → 狻猊 → 狎鱼 → 獬豸 →（行什）
 *   歇山  五兽
 *   悬山  三兽
 *   硬山 / 卷棚  无垂脊，也就无垂兽
 *
 * 排列顺序：**仙人骑凤在最高处**（垂脊与正脊的交点），行什在最下端。
 * 位置错乱（数量不对、顺序反了）在近景一眼就露馅——这是最容易考据的一项。
 */
const BEAST_COUNT = { wudian: 9, xieshan: 5, juanpengxieshan: 5, xuanshan: 3 };

/** 单只走兽：座 + 身 + 头 + 尾 */
function buildOneBeast(size, kind) {
  const parts = [];
  const body = new THREE.BoxGeometry(size * 0.52, size * 0.8, size * 0.46);
  body.translate(0, size * 0.55, 0);
  parts.push(body);
  // 头
  const head = new THREE.SphereGeometry(size * 0.28, 6, 5);
  head.scale(1, 0.85, 1.15);
  head.translate(0, size * 1.02, size * 0.1);
  parts.push(head);
  // 耳/角
  const ear = new THREE.ConeGeometry(size * 0.1, size * 0.26, 4);
  ear.rotateZ(0.4);
  ear.translate(-size * 0.12, size * 1.2, size * 0.02);
  parts.push(ear);
  const ear2 = ear.clone();
  ear2.translate(size * 0.24, 0, 0);
  parts.push(ear2);
  // 尾
  const tail = new THREE.ConeGeometry(size * 0.12, size * 0.5, 4);
  tail.rotateX(-0.9);
  tail.translate(0, size * 0.72, -size * 0.34);
  parts.push(tail);
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/** 仙人骑凤：仙人跨坐在凤背上 */
function buildRidingImmortal(size) {
  const parts = [];
  // 凤身
  const bird = new THREE.BoxGeometry(size * 0.5, size * 0.4, size * 0.9);
  bird.translate(0, size * 0.28, 0);
  parts.push(bird);
  const neck = new THREE.CylinderGeometry(size * 0.1, size * 0.14, size * 0.45, 5);
  neck.rotateX(-0.5);
  neck.translate(0, size * 0.62, size * 0.34);
  parts.push(neck);
  const birdHead = new THREE.SphereGeometry(size * 0.15, 5, 4);
  birdHead.translate(0, size * 0.82, size * 0.48);
  parts.push(birdHead);
  const tail = new THREE.ConeGeometry(size * 0.16, size * 0.6, 4);
  tail.rotateX(1.1);
  tail.translate(0, size * 0.46, -size * 0.56);
  parts.push(tail);
  // 仙人
  const body = new THREE.BoxGeometry(size * 0.34, size * 0.5, size * 0.3);
  body.translate(0, size * 0.72, -size * 0.02);
  parts.push(body);
  const head = new THREE.SphereGeometry(size * 0.16, 5, 4);
  head.translate(0, size * 1.04, -size * 0.02);
  parts.push(head);
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/**
 * 垂脊上的一列小兽。
 * @param {THREE.Vector3[]} pts 垂脊线（t=0 在正脊交点，t=1 在檐角）
 * @param {number} size 小兽尺寸
 * @param {number} count 兽数（庑殿 9 / 歇山 5 / 悬山 3）
 */
function buildBeastRow(pts, size, count) {
  const parts = [];
  const curve = new THREE.CatmullRomCurve3(pts);
  const place = (t, geo) => {
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    geo.rotateY(Math.atan2(tan.x, tan.z));
    geo.translate(p.x, p.y + size * 0.12, p.z);
    parts.push(geo);
  };
  if (count <= 0) {
    const merged0 = mergeGeometries(parts, false);
    return merged0;
  }
  // 仙人骑凤在最高处（正脊交点）
  place(0.07, buildRidingImmortal(size * 1.15));
  // 走兽依次向下
  const beasts = count - 1;
  for (let i = 0; i < beasts; i++) {
    const t = 0.2 + (i / beasts) * 0.66;
    place(t, buildOneBeast(size, i));
  }
  // 行什：最下端的一对小兽
  place(0.93, buildOneBeast(size * 0.62, 0));
  place(0.99, buildOneBeast(size * 0.62, 0));
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}



/** 硬山/悬山山墙的起坡点：屋面与山墙的交线 z */
function zBreakGable(Wz, eaveY, rise) {
  // 屋面在山墙处的高度 = eaveY + rise*(1-fold(t))，山墙从 eaveY 起到该高度
  // 取 t 使其约 0.42*rise，简化用折线求解
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const y = eaveY + rise * (1 - Math.pow(mid, P_CURVE));
    if (y < eaveY + rise * 0.42) lo = mid;
    else hi = mid;
  }
  return Wz * hi;
}

/** 正脊/垂脊：一串截面沿折线扫掠 */
/* ================================================================
 * 瓦作：把屋面做成真正的构件，而不是"贴了瓦片贴图的曲面"
 *
 * 组成：
 *   板瓦   铺在椽上的平瓦带（底面）
 *   筒瓦   每垄一道半圆筒瓦，沿坡向逐段铺（真的是半圆管）
 *   瓦当   檐口一排圆形瓦当
 *   滴水   瓦当之间的三角形滴水
 *   椽头   檐下露出的椽头一排
 *   飞椽   椽头上方斜出的飞椽一排
 *   脊筒   正脊/垂脊由小筒瓦逐个垒起
 * ================================================================ */

const TILE = {
  gang: 0.42,      // 垄距（筒瓦中心到中心）
  tongR: 0.115,    // 筒瓦半径
  banW: 0.3,       // 板瓦宽
  rafterGap: 0.42, // 椽间距
  rafterR: 0.055,  // 椽半径
};

/**
 * 在给定坡面上铺一垄筒瓦。
 * @param {(t:number)=>{x:number,y:number,z:number}} sampler t∈[0,1] 沿坡向取点
 */
function buildTongWa(sampler, t0, t1) {
  // 整垄生成**一个**几何体（早前每段一个，40 万个对象直接把加载拖到十几秒）
  // 网格密度：半圆断面 5 段足够圆滑；坡向 7 段足以表达翼角起翘。
  // 再密下去只是把三角面数翻倍（真瓦是全园最大的一笔几何开销）。
  const steps = 7;
  const ring = 5;
  const R = TILE.tongR;
  const verts = [];
  const uvs = [];
  const idx = [];

  // UV 约定（与贴图布局严格对应，否则屋面会被采样成一片黑）：
  // 贴图横向一个循环含 6 垄瓦（见 textures.js 的 cols），纵向一个循环含 6 层瓦当。
  // 一根筒瓦 = 一垄，所以 u 只取其中一垄的窗口 [0.02, 0.17]；
  // v 沿坡向铺 6 个循环 → 36 层瓦当，与真实瓦作搭接密度一致。
  const U0 = 0.02;
  const U1 = 0.17;

  let prevSide = null;
  for (let i = 0; i <= steps; i++) {
    const t = t0 + ((t1 - t0) * i) / steps;
    const p = sampler(t);
    const pt = sampler(Math.min(t1, t + 0.001));
    let side = new THREE.Vector3(-(pt.z - p.z), 0, pt.x - p.x);
    if (side.lengthSq() < 1e-8) side = prevSide ? prevSide.clone() : new THREE.Vector3(1, 0, 0);
    side.normalize();
    prevSide = side;
    const up = new THREE.Vector3(0, 1, 0);
    // 半圆断面：沿垄向排 7 个点
    for (let k = 0; k <= ring; k++) {
      const a = (k / ring) * Math.PI;
      const ox = Math.cos(a) * R;
      const oy = Math.sin(a) * R;
      verts.push(
        p.x + side.x * ox + up.x * oy,
        p.y + side.y * ox + up.y * oy,
        p.z + side.z * ox + up.z * oy
      );
      uvs.push(U0 + (k / ring) * (U1 - U0), (i / steps) * 6);
    }
  }
  const stride = ring + 1;
  for (let i = 0; i < steps; i++) {
    for (let k = 0; k < ring; k++) {
      const a = i * stride + k;
      idx.push(a, a + 1, a + stride, a + stride, a + 1, a + stride + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return [g];
}

/** 檐口一排：瓦当（圆盘）+ 滴水（三角） */
function buildWadang(Wx, Wz, eaveY, count, sign = 1) {
  const parts = [];
  const r = 0.115;
  for (let i = 0; i <= count; i++) {
    const x = -Wx + (i * Wx * 2) / count;
    // 瓦当：带纹样的圆盘（团寿骨架 + 外圈凸环），朝外
    const d = buildWadangPiece(r);
    if (sign < 0) d.rotateY(Math.PI);
    d.translate(x, eaveY - 0.12, sign * (Wz - 0.02));
    parts.push(d);
    // 滴水：如意头三角片，与瓦当相间
    const t = buildDishiPiece(r);
    if (sign < 0) t.rotateY(Math.PI);
    t.rotateY(Math.PI / 2);
    t.translate(x + Wx / count, eaveY - 0.22, sign * (Wz + 0.03));
    parts.push(t);
  }
  return parts;
}

/** 椽头 + 飞椽（檐下两排） */
/**
 * 檐下构造：连檐 · 檐檩 · 椽头 · 飞椽
 *
 * 清式檐口从下往上看是这么一排：
 *   最外  一圈**圆形**椽头（截面是圆的，这是中式屋檐最强的识别特征）
 *   椽头后 斜出的方料**飞椽**（端头按举折角斜切）
 *   再后   通长的**连檐**（把所有椽头串起来的方木）
 *   最里   承椽的圆木**檐檩**
 *
 * 之前只有两个方盒子，近看就是"贴图放大的板"。
 */
function buildRafters(Wx, Wz, eaveY, count, sign = 1) {
  // 椽头与飞椽是**素木**，不是红漆木件——放进 wood 桶会变成一排红圆盘。
  // 分成两个桶：wood（连檐、檐檩，漆作）与 eave（椽头、飞椽，素木深褐）。
  const wood = [];
  const eave = [];
  const r = TILE.rafterR;

  // 连檐：沿檐口通长的一根方木（漆作）
  const lianYan = new THREE.BoxGeometry(Wx * 2, r * 2.2, r * 2.6);
  lianYan.translate(0, eaveY - 0.46, sign * (Wz - 0.5));
  wood.push(lianYan);

  // 檐檩：圆木，承住椽头（藏在檐内）
  const yanLin = new THREE.CylinderGeometry(r * 1.6, r * 1.6, Wx * 2, 8);
  yanLin.rotateZ(Math.PI / 2);
  yanLin.translate(0, eaveY - 0.72, sign * (Wz - 1.05));
  wood.push(yanLin);

  const pitch = 0.42; // 飞椽出挑角（与屋面举折相呼应）
  for (let i = 0; i <= count; i++) {
    const x = -Wx + (i * Wx * 2) / count;

    // 飞椽：方料，斜向外挑，端头按坡角斜切
    const flyLen = 0.62;
    const fly = new THREE.BoxGeometry(r * 1.7, r * 1.5, flyLen);
    fly.rotateX(-sign * pitch);
    fly.translate(x, eaveY - 0.34 - Math.sin(pitch) * flyLen * 0.5, sign * (Wz - 0.72));
    eave.push(fly);

    // 椽头：**圆形**截面，端头微斜（与飞椽同角）
    const headLen = 0.46;
    const head = new THREE.CylinderGeometry(r * 1.25, r * 1.15, headLen, 8);
    head.rotateX(Math.PI / 2);
    head.rotateX(sign * pitch * 0.35);
    head.translate(x, eaveY - 0.30, sign * (Wz - 0.10));
    eave.push(head);
  }
  return { wood, eave };
}

/** 脊：正脊/垂脊用小筒瓦逐个垒起 */
function buildXiTong(points, width) {
  const parts = [];
  const curve = new THREE.CatmullRomCurve3(points);
  const len = curve.getLength();
  const n = Math.max(4, Math.floor(len / 0.16));
  const r = 0.085;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    // 一片脊筒：半圆瓦，横着躺
    const g = new THREE.CylinderGeometry(r, r, width * 0.92, 6, 1, false, 0, Math.PI);
    g.rotateZ(Math.PI / 2);
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      tan
    );
    g.applyQuaternion(q);
    g.translate(p.x, p.y, p.z);
    parts.push(g);
  }
  return parts;
}

function buildRidgeBar(points, width, height) {
  const shape = new THREE.Shape();
  const w = width / 2;
  const h = height;
  shape.moveTo(-w, 0);
  shape.lineTo(-w * 0.85, h);
  shape.lineTo(0, h * 1.18);
  shape.lineTo(w * 0.85, h);
  shape.lineTo(w, 0);
  shape.closePath();

  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.05);
  const segs = Math.max(4, Math.min(64, points.length * 6));
  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: segs,
    bevelEnabled: false,
    extrudePath: curve,
  });
  return geo;
}

/** 攒尖宝顶 */
function buildFinial(apex, width) {
  const parts = [];
  const r = Math.min(1.1, width * 0.055);
  const base = new THREE.CylinderGeometry(r * 1.25, r * 1.4, r * 0.8, 12);
  base.translate(apex.x, apex.y + r * 0.4, apex.z);
  parts.push(base);
  const ball = new THREE.SphereGeometry(r, 12, 10);
  ball.translate(apex.x, apex.y + r * 1.3, apex.z);
  parts.push(ball);
  const neck = new THREE.CylinderGeometry(r * 0.45, r * 0.8, r * 0.9, 10);
  neck.translate(apex.x, apex.y + r * 2.1, apex.z);
  parts.push(neck);
  const flame = new THREE.ConeGeometry(r * 0.6, r * 1.6, 10);
  flame.translate(apex.x, apex.y + r * 3.1, apex.z);
  parts.push(flame);
  return mergeGeometries(parts, false);
}

/** 檐口：檐檩条 + 椽头 + 瓦当 */
function buildEaveTrim(Wx, Wz, eaveY, type, xh, wz, wx) {
  const parts = [];
  const t = 0.16;
  const h = 0.26;
  // 前后檐口条
  for (const sz of [-1, 1]) {
    const g = new THREE.BoxGeometry(Wx * 2, h, t);
    g.translate(0, eaveY - h / 2 + 0.05, sz * Wz);
    parts.push(g);
  }
  // 两端檐口条（庑殿/歇山是斜脊，只在山花段有）
  if (type === 'xuanshan' || type === 'yingshan' || type === 'juanpeng') {
    for (const sx of [-1, 1]) {
      const g = new THREE.BoxGeometry(t, h, Wz * 2);
      g.translate(sx * Wx, eaveY - h / 2 + 0.05, 0);
      parts.push(g);
    }
  }
  // 椽头：沿前后檐每 0.45m 一根
  const step = 0.45;
  const count = Math.max(4, Math.floor((Wx * 2) / step));
  const rafter = new THREE.BoxGeometry(0.1, 0.1, 0.42);
  for (let i = 0; i < count; i++) {
    const x = -Wx + (i + 0.5) * (Wx * 2 / count);
    for (const sz of [-1, 1]) {
      const g = rafter.clone();
      g.translate(x, eaveY - 0.12, sz * (Wz - 0.2));
      parts.push(g);
    }
  }
  rafter.dispose?.();
  return mergeGeometries(parts, false);
}
