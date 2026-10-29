/**
 * 方外观 —— 回教式两层楼，容妃礼拜之所
 *
 * 考据（architecture-notes.md 第三节「方外观」）：
 *   - 两层，上下各三间
 *   - 两侧有半环形石阶通往二楼
 *   - 楼为大理石贴面，加刻回文装饰，重檐四坡蓝色琉璃瓦顶
 *   - 楼西为八角亭，东为花台树池
 *   - 方外观之南、路南有五竹亭，游廊环绕，亭瓦柱窗皆为湘妃竹色，
 *     镶嵌五色珠玉螺钿
 *
 * 局部坐标：+Z 朝南（面向大水法）。
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
  octagonalPavilion,
  planter,
  volute,
  leaf,
  acanthusBand,
  waterJet,
  spray,
  steps,
} from './kit.js';
import { buildHall } from './hall.js';

/** 回文（钥匙纹）饰带：大理石墙上的连续回字纹 */
function keyFret(len, h = 0.5, depth = 0.07) {
  const parts = [];
  const unit = h * 2.2;
  const n = Math.max(1, Math.round(len / unit));
  const step = len / n;
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + step * (i + 0.5);
    const u = h * 0.34;
    // 回字：外框三边 + 内折
    parts.push(boxAt(u * 3.4, u, depth, x - u * 0.5, h * 0.1, 0));
    parts.push(boxAt(u, u * 2.4, depth, x - u * 1.7, h * 0.1, 0));
    parts.push(boxAt(u * 1.4, u, depth, x - u * 0.2, h * 0.62, 0));
    parts.push(boxAt(u * 2.4, u, depth, x, -h * 0.2, 0));
  }
  return mergeAll(parts);
}

export function buildFangWaiGuan(c, opts) {
  const { x, y, z, rotY = 0 } = opts;
  c.setTransform(x, y, z, rotY);

  const W = 12.6; // 面阔三间（每间 4.2 m，推定）
  const D = 11.4; // 进深三间
  const PLAT = 1.0;
  const L1 = 5.6;
  const L2 = 4.9;

  /* ------------------------------------------------------------ 楼体 */
  buildHall(c, {
    w: W,
    d: D,
    platform: { h: PLAT, out: 1.8, steps: true, rail: true },
    levels: [
      { h: L1, mian: 3, wall: 'stone', columnBucket: 'stone', windowY: 1.1, windowH: 2.8 },
      { h: L2, mian: 3, wall: 'stone', columnBucket: 'stone', windowY: 1.0, windowH: 2.4 },
    ],
    roof: [
      // 重檐：下檐（腰檐）
      { width: W, depth: D, eaveY: PLAT + L1, rise: 1.8, type: 'wudian', overhang: 1.7, tile: 'lan', ridge: 'lan', wallBucket: 'stone' },
      // 上檐（四坡主顶）
      { width: W, depth: D, eaveY: PLAT + L1 + L2, rise: 3.2, type: 'wudian', overhang: 1.8, tile: 'lan', ridge: 'lan', wallBucket: 'stone' },
    ],
    wallBucket: 'stone',
    trimBucket: 'stone',
    columnBucket: 'stone',
  });

  /* ------------------------------------------------------------ 回文装饰 */
  for (const sz of [1, -1]) {
    const band = keyFret(W - 0.6, 0.55, 0.08);
    band.translate(0, PLAT + L1 - 0.85, sz * (D / 2 + 0.05));
    c.add('stone', band);
  }
  for (const sx of [1, -1]) {
    const band = keyFret(D - 0.6, 0.55, 0.08);
    band.rotateY(Math.PI / 2);
    band.translate(sx * (W / 2 + 0.05), PLAT + L1 - 0.85, 0);
    c.add('stone', band);
  }
  // 门楣上的番花
  for (const sz of [1, -1]) {
    const v = volute(0.85, 0.14, 1.6);
    v.rotateY(sz > 0 ? 0 : Math.PI);
    v.translate(0, PLAT + 3.5, sz * (D / 2 + 0.14));
    c.add('stone', v);
  }

  /* ------------------------------------------------------------ 半环形石阶（两侧，通二楼） */
  for (const sx of [-1, 1]) {
    const st = curvedSteps(2.6, 4.6, 0, Math.PI * 0.85, PLAT, PLAT + L1, 11);
    st.rotateY(sx > 0 ? -Math.PI * 0.35 : Math.PI * 1.15);
    st.translate(sx * (W / 2 + 3.4), 0, 0.5);
    c.add('stone', st);
    // 梯侧望柱
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * Math.PI * 0.85;
      const px = sx * (W / 2 + 3.4) + Math.cos(a) * 4.8 * (sx > 0 ? 1 : -1);
      const pz = 0.5 + Math.sin(a) * 4.8;
      const post = cyl(0.15, 0.17, 0.95, 8);
      post.translate(px, PLAT + (L1 * i) / 8 + 0.45, pz);
      c.add('stone', post);
    }
  }

  /* ------------------------------------------------------------ 楼西八角亭 */
  const pavX = -(W / 2 + 8.5);
  const pav = octagonalPavilion({ radius: 4.2, postH: 3.2, roof: true, roofH: 2.6 });
  pav.translate(pavX, 0, -1.0);
  c.add('stone', pav);

  /* ------------------------------------------------------------ 东花台树池 */
  const flowerX = W / 2 + 7.0;
  c.add('stone', boxAt(7.0, 0.9, 7.0, flowerX, 0.45, -1.0));
  c.add('stone', boxAt(6.2, 0.3, 6.2, flowerX, 1.0, -1.0));
  // 四角石花盆 + 树
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pl = planter(1.5, 1.2);
      pl.translate(flowerX + sx * 2.4, 1.15, -1.0 + sz * 2.4);
      c.add('stone', pl);
      const tree = sph(1.5, 9, 7);
      tree.scale(1, 1.15, 1);
      tree.translate(flowerX + sx * 2.4, 3.1, -1.0 + sz * 2.4);
      c.add('green', tree);
    }
  }

  /* ------------------------------------------------------------ 五竹亭（路南，游廊环绕） */
  const bambooZ = D / 2 + 12.0;
  // 游廊（环绕亭子）
  const corR = 7.0;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const px = Math.cos(a) * corR;
    const pz = bambooZ + Math.sin(a) * corR;
    const col = cyl(0.16, 0.18, 3.0, 8);
    col.translate(px, 1.5, pz);
    c.add('wood', col);
    // 廊枋
    if (i % 2 === 0) {
      const beam = boxAt(corR * 0.55, 0.24, 0.2, px * 0.72, 3.1, pz * 0.72 + (bambooZ * 0.28));
      beam.rotateY(-a);
      c.add('wood', beam);
    }
  }
  // 游廊屋面（湘妃竹色 → 用木色近似）
  const corRoof = cyl(0.6, corR + 1.0, 0.5, 16);
  corRoof.translate(0, 3.35, bambooZ);
  c.add('wood', corRoof);
  const corRoof2 = cyl(0.2, corR * 0.55, 1.5, 16);
  corRoof2.translate(0, 4.3, bambooZ);
  c.add('wood', corRoof2);

  // 五竹亭（亭瓦柱窗皆为湘妃竹色）
  const pav2 = octagonalPavilion({ radius: 3.6, postH: 3.0, roof: false });
  pav2.translate(0, 0.9, bambooZ);
  c.add('wood', pav2);
  const pavRoof = new THREE.LatheGeometry(
    [
      [4.3, 0.0],
      [3.5, 0.5],
      [2.2, 1.3],
      [0.9, 2.0],
      [0.2, 2.5],
    ].map(([r, y]) => new THREE.Vector2(r, y)),
    8
  );
  pavRoof.computeVertexNormals();
  pavRoof.translate(0, 0.9 + 3.0, bambooZ);
  c.add('wood', pavRoof);
  // 镶嵌五色珠玉螺钿：亭身上的小方块
  const beadColors = ['tile-hong', 'tile-lan', 'tile-lv', 'tile-jin', 'tile-wuse'];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    for (let k = 0; k < 3; k++) {
      const bead = boxAt(0.22, 0.22, 0.12, Math.cos(a) * 3.2, 1.6 + k * 0.6, bambooZ + Math.sin(a) * 3.2);
      bead.rotateY(-a);
      c.add(beadColors[(i + k) % beadColors.length], bead);
    }
  }

  c.clearTransform();
  return {};
}
