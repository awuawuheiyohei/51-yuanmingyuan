/**
 * 远瀛观 —— 全汉白玉的三层庑殿顶寝宫
 *
 * 考据（architecture-notes.md 第三节「远瀛观」）：
 *   - 坐落于高台之上，全部为汉白玉雕刻筑成
 *   - 主楼五楹，二十五间（此处释为面阔五间、进深五间，共二十五间，**推定**）
 *   - 楼为三层庑殿顶：正中之大宝顶用五色琉璃圆光瓦；第二层用鱼鳞金瓦；
 *     楼顶为五色琉璃番草卷云花纹屋脊
 *   - 正门两旁汉白玉石柱刻西洋番花下垂葡萄叶，深雕三寸余；楼门前石狮子一对
 *   - 楼前为大平台，台基座东西有弧形石梯两座，环抱台基下面喷水池
 *   - 楼前平台以精美太湖石及花木填空
 *
 * 局部坐标：+Z 朝南（面向大水法），-Z 为北（背靠远瀛观高台的一侧）。
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
  curvedSteps,
  balustrade,
  stoneLion,
  stoneTripod,
  planter,
  volute,
  leaf,
  waterJet,
  jetBetween,
  spray,
  archedPanel,
  windowSurround,
} from './kit.js';
import { buildHall, carvedColumn } from './hall.js';
import { octagonalPool, conformPool } from './fountain.js';

export function buildYuanYingGuan(c, opts) {
  const { x, y, z, rotY = 0, ground = null } = opts;
  c.setTransform(x, y, z, rotY);

  const W = 30; // 面阔五楹（每楹 6 m，推定）
  const D = 19; // 进深五间
  const PLAT = 3.2; // 高台高
  const HALL_H = [7.0, 6.0, 5.0];

  /* ------------------------------------------------------------ 高台 */
  // 高台向下埋 3 m，地形起伏也不悬空
  c.add('stone', boxAt(W + 4.4, PLAT + 2.5, D + 4.4, 0, (PLAT - 2.5) / 2, 0));
  c.add('stone', boxAt(W + 5.2, 0.3, D + 5.2, 0, PLAT - 0.35, 0));
  c.add('stone', boxAt(W + 4.6, 0.25, D + 4.6, 0, PLAT - 0.08, 0));

  /* ------------------------------------------------------------ 主楼 */
  buildHall(c, {
    w: W,
    d: D,
    platform: { h: 0, out: 0 },
    levels: [
      { h: HALL_H[0], mian: 5, w: W, d: D, wall: 'stone', columnBucket: 'stone', windowY: 1.4, windowH: 3.6 },
      { h: HALL_H[1], mian: 5, w: 24, d: 15, wall: 'stone', columnBucket: 'stone', windowY: 1.2, windowH: 3.0, door: false },
      { h: HALL_H[2], mian: 5, w: 18, d: 11, wall: 'stone', columnBucket: 'stone', windowY: 1.0, windowH: 2.6, door: false },
    ],
    roof: [
      {
        width: W,
        depth: D,
        eaveY: PLAT + HALL_H[0],
        rise: 2.9,
        type: 'wudian',
        overhang: 1.9,
        tile: 'wuse',
        ridge: 'wuse',
        ridgeScroll: true,
        wallBucket: 'stone',
      },
      {
        width: 24,
        depth: 15,
        eaveY: PLAT + HALL_H[0] + HALL_H[1],
        rise: 3.1,
        type: 'wudian',
        overhang: 1.8,
        tile: 'jin',
        ridge: 'wuse',
        wallBucket: 'stone',
      },
      {
        width: 18,
        depth: 11,
        eaveY: PLAT + HALL_H[0] + HALL_H[1] + HALL_H[2],
        rise: 2.7,
        type: 'wudian',
        overhang: 1.7,
        tile: 'wuse',
        ridge: 'wuse',
        ridgeScroll: true,
        wallBucket: 'stone',
      },
    ],
    wallBucket: 'stone',
    trimBucket: 'stone',
    columnBucket: 'stone',
  });

  /* ------------------------------------------------------------ 五色琉璃大宝顶 */
  const topY = PLAT + HALL_H[0] + HALL_H[1] + HALL_H[2] + 2.7;
  const bt = [];
  const base = lathe(
    [
      [0.0, 2.6],
      [0.1, 2.2],
      [0.18, 1.5],
      [0.3, 1.7],
      [0.5, 1.1],
      [0.72, 1.35],
      [0.86, 0.9],
      [1.0, 1.25],
    ].map(([t, r]) => new THREE.Vector2(r, t * 4.6)),
    16
  );
  base.translate(0, topY, 0);
  bt.push(base);
  const globe = sph(1.15, 14, 10);
  globe.translate(0, topY + 5.1, 0);
  bt.push(globe);
  const neck = cyl(0.42, 0.7, 1.3, 10);
  neck.translate(0, topY + 6.4, 0);
  bt.push(neck);
  const flame = cone(0.62, 2.1, 10);
  flame.translate(0, topY + 8.0, 0);
  bt.push(flame);
  c.add('tile-wuse', mergeAll(bt));
  // 宝顶下的铁座（金属）
  const ring = torus(1.5, 0.2, 8, 18);
  ring.rotateX(Math.PI / 2);
  ring.translate(0, topY + 0.2, 0);
  c.add('metal', ring);

  /* ------------------------------------------------------------ 正门石柱（番花下垂葡萄叶）
   * 考据：远瀛观「正门两旁汉白玉石柱刻西洋番花**下垂葡萄叶**，**深雕三寸余**」。
   * 做法：柱身上部一圈番花（卷涡），葡萄叶自番花**向下垂挂**成三串，
   *       叶脉用一条凸起的脊线表示（"深雕三寸"的量感靠实体厚度）。
   * 形制简化：葡萄（果实）只做小球串，不做一颗颗圆珠。
   */
  for (const sx of [-1, 1]) {
    const col = carvedColumn(8.2, 0.62, false);
    col.translate(sx * 3.6, PLAT, D / 2 + 1.9);
    c.add('stone', col);
    // 柱头上部一圈番花卷涡
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      const v = volute(0.6, 0.11, 1.5);
      v.rotateY(a);
      v.translate(
        sx * 3.6 + Math.sin(a) * 0.6,
        PLAT + 6.75,
        D / 2 + 1.9 + Math.cos(a) * 0.6
      );
      c.add('stone', v);
    }
    // 下垂葡萄叶：三串
    for (let s = 0; s < 3; s++) {
      const a = (s / 3) * Math.PI * 2 + 0.2;
      const ox = sx * 3.6 + Math.sin(a) * 0.58;
      const oz = D / 2 + 1.9 + Math.cos(a) * 0.58;
      const len = 2.3 + (s % 2) * 0.5;
      for (let k = 0; k < 3; k++) {
        const lf = leaf(len * (0.62 - k * 0.1), 0.42, 0.1);
        lf.rotateZ(Math.PI); // 叶尖朝下
        lf.rotateY(a + (k - 1) * 0.5);
        lf.translate(ox, PLAT + 5.9 - k * 0.75, oz);
        c.add('stone', lf);
      }
      // 葡萄串
      for (let k = 0; k < 3; k++) {
        const gr = sph(0.13, 7, 6);
        gr.translate(ox, PLAT + 3.0 - k * 0.3, oz);
        c.add('stone', gr);
      }
    }
  }

  /* ------------------------------------------------------------ 门前石狮子一对 */
  for (const sx of [-1, 1]) {
    const lion = stoneLion(1.9);
    lion.rotateY(sx > 0 ? -0.3 : 0.3);
    lion.translate(sx * 6.2, PLAT, D / 2 + 2.4);
    c.add('stone', lion);
  }

  /* ------------------------------------------------------------ 楼前大平台 */
  const platW = 42;
  const platD = 24;
  const platZ = D / 2 + 2.2 + platD / 2;
  c.add('stone', boxAt(platW, 4.0, platD, 0, -1.0, platZ));
  c.add('stone', boxAt(platW + 0.7, 0.22, platD + 0.7, 0, 1.11, platZ));
  // 平台面铺装分格
  for (let i = -4; i <= 4; i++) {
    c.add('stone', boxAt(0.22, 0.08, platD - 0.6, i * 4.4, 1.26, platZ));
  }

  /* ------------------------------------------------------------ 弧形石梯两座（东西） */
  for (const sx of [-1, 1]) {
    // 弧形梯：从平台绕上台基
    const st = curvedSteps(9.5, 14.5, 0, Math.PI * 0.55, 1.2, PLAT, 9);
    st.rotateY(sx > 0 ? -Math.PI * 0.5 : Math.PI * 0.5);
    st.translate(sx * (W / 2 + 1.6), 0, D / 2 + 4.0);
    c.add('stone', st);
    // 梯侧栏
    for (let i = 0; i < 8; i++) {
      const t = i / 8;
      const a = t * Math.PI * 0.55;
      const rr = 14.5;
      const px = sx * (W / 2 + 1.6) + (sx > 0 ? Math.sin(a) * rr : -Math.sin(a) * rr) * 0;
      const pz = D / 2 + 4.0 + Math.cos(a) * rr * (sx > 0 ? 1 : -1) * -1;
      const post = cyl(0.16, 0.18, 1.0, 8);
      post.translate(px, 1.2 + t * (PLAT - 1.2) + 0.5, pz);
      c.add('stone', post);
    }
    // 弧形梯下喷水池
    const pool = octagonalPool(6.5, 0.9, 0.6);
    pool.rim.translate(sx * (W / 2 + 6.0), 0, D / 2 + 1.0);
    pool.floor.translate(sx * (W / 2 + 6.0), 0, D / 2 + 1.0);
    pool.water.translate(sx * (W / 2 + 6.0), 0, D / 2 + 1.0);
    conformPool(pool, ground);
    c.add('stone', pool.rim);
    c.add('stone', pool.floor);
    c.add('water', pool.water);
    // 池中喷水
    c.add('water', waterJet(3.4, 0.07).translate(sx * (W / 2 + 6.0), 0, D / 2 + 1.0));
    c.add('water', spray(0.26, 0.6).translate(sx * (W / 2 + 6.0), 3.4, D / 2 + 1.0));
  }

  /* ------------------------------------------------------------ 平台太湖石与花木 */
  const rockSpots = [
    [-15, 24, 2.6],
    [-11.5, 26.5, 1.9],
    [14, 25, 2.4],
    [17.5, 22, 1.7],
    [0, 30, 2.1],
    [-4.5, 29, 1.4],
  ];
  for (const [rx, rz, rs] of rockSpots) {
    const cluster = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + rs;
      const b = sph(rs * (0.42 + (i % 3) * 0.12), 8, 6);
      b.scale(1, 1.5, 1);
      b.translate(Math.cos(a) * rs * 0.5, rs * 0.55 + (i % 2) * rs * 0.3, Math.sin(a) * rs * 0.5);
      cluster.push(b);
    }
    const g = mergeAll(cluster);
    g.rotateY(rs * 2);
    g.translate(rx, 1.26, D / 2 + 2.2 + rz - 2.2);
    c.add('rock', g);
    // 树（简化为球丛）
    const bush = sph(rs * 0.7, 8, 6);
    bush.scale(1, 0.8, 1);
    bush.translate(rx + rs * 1.6, 1.26 + rs * 0.6, D / 2 + 2.2 + rz - 2.2 + rs);
    c.add('green', bush);
  }

  /* ------------------------------------------------------------ 平台南缘栏杆 */
  const rail = balustrade(platW - 2, 1.1);
  rail.translate(0, 1.22, platZ + platD / 2 - 0.3);
  c.add('stone', rail);
  for (const sx of [-1, 1]) {
    const r = balustrade(platD - 1.5, 1.1);
    r.rotateY(Math.PI / 2);
    r.translate(sx * (platW / 2 - 0.3), 1.22, platZ);
    c.add('stone', r);
  }

  c.clearTransform();
  return { platW, platD };
}
