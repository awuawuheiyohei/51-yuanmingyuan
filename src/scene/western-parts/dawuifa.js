/**
 * 大水法 —— 西洋楼的核心喷泉群
 *
 * 考据（architecture-notes.md 第三节「大水法」）：
 *   - 北为西洋式石龛，石龛紧靠远瀛观平台
 *   - 石龛正中有铜雕西洋式狮子头，口中喷水，落入半圆形七级水台
 *   - 水池为半圆海棠形；左右岸上泄水沟尽头各有翻尾石鱼一座，池中左右亦有石鱼各一
 *   - 池正中有一铜鹿，南向似跑，其角分为八杈，由各角尖上喷水八道
 *   - 鹿东西各有铜猎犬五只，水由口喷出射向铜鹿（俗称"十犬喷鹿"）
 *   - 池沿岸用白玉石精雕花纹，安放带座石花盆，内植三层线法松
 *   - 水池东西石鱼北侧，又有翻尾大海猪各一，水自口中喷出，射出三丈余
 *   - 大水池外，东西各有十三层方形喷水塔一座；塔顶有铜蒺藜十六角，喷水十六道
 *
 * 局部坐标：原点在池心，**+Z 朝南**（面向观水法），-Z 为北（远瀛观一侧）。
 * 尺度：池半径 24 m、石龛面宽 19 m —— 均为**推定**（WIKI 只记构件名，不给尺寸）。
 */
import * as THREE from 'three';
import { mergeAll } from './materials.js';
import {
  boxAt,
  cyl,
  cylAt,
  sph,
  cone,
  torus,
  lathe,
  beastHead,
  bronzeDeer,
  hound,
  stoneFish,
  seaPig,
  planter,
  leaf,
  volute,
  waterJet,
  jetBetween,
  spray,
  pavementField,
} from './kit.js';
import {
  begoniaPool,
  begoniaShape,
  conformPool,
  waterTable,
  waterChannel,
  stoneNiche,
  fountainTower,
  caltrop,
} from './fountain.js';

export function buildDaShuiFa(c, opts) {
  const { x, y, z, rotY = 0, ground = null } = opts;
  const gy = (lx, lz) => (ground ? ground(lx, lz) : 0);
  c.setTransform(x, y, z, rotY);

  const R = 24; // 池半径（推定）
  const POOL_Z = -13; // 池的北缘（海棠形池的平直边）在本地的 z
  const NICHE_Z = -21; // 石龛正面

  /* ---------------------------------------------------------- 石龛 */
  const niche = stoneNiche(19, 16, 2.4);
  niche.translate(0, 0, NICHE_Z - 1.2);
  c.add('stone', niche);
  // 石龛的地裙：往地里延伸 3 m，任何地形起伏都不会悬空
  c.add('stone', boxAt(19.4, 4.0, 2.8, 0, -2.0, NICHE_Z - 1.2));

  /* ---------------------------------------------------------- 七级水台 */
  const wt = waterTable(8, 7, 0.62, 0.92);
  wt.geometry.translate(0, 0, NICHE_Z + 0.6);
  c.add('stone', wt.geometry);

  // 每层台面外沿的小喷水（层层喷水落入两岸泄水沟）
  const tierJets = [];
  for (let i = 0; i < 7; i++) {
    const rr = 8 - i * 0.92;
    const yy = (i + 1) * 0.62;
    for (const sx of [-1, 1]) {
      const a = sx * 0.85;
      const from = [Math.cos(a) * rr * 0.96, yy + 0.1, NICHE_Z + 0.6 + Math.sin(a) * rr * 0.96];
      const to = [Math.cos(a) * (rr + 5.5), yy - 1.1, NICHE_Z + 0.6 + Math.sin(a) * (rr + 5.5)];
      tierJets.push(jetBetween(from, to, 0.06));
    }
  }
  c.addAll('water', tierJets);

  /* ---------------------------------------------------------- 铜狮子头 */
  const lionHead = beastHead(2.3, {
    muzzle: 0.55,
    snout: 'box',
    ear: 'round',
    mane: true,
    wide: 1.15,
  });
  lionHead.rotateX(Math.PI * 0.12);
  lionHead.translate(0, 7.4, NICHE_Z + 0.75);
  c.add('metal', lionHead);
  // 狮子头下的托座
  const lionRing = torus(0.85, 0.16, 6, 14);
  lionRing.translate(0, 7.4, NICHE_Z + 0.75);
  c.add('metal', lionRing);
  // 狮口喷水：落向七级水台
  c.add(
    'water',
    jetBetween([0, 7.05, NICHE_Z + 1.1], [0, wt.topY + 0.2, NICHE_Z + 1.2], 0.12)
  );
  c.add('water', spray(0.3, 0.7).translate(0, wt.topY, NICHE_Z + 1.2));

  /* ---------------------------------------------------------- 海棠形池 */
  const pool = begoniaPool(R, 1.5, 1.3);
  pool.rim.translate(0, 0, POOL_Z);
  pool.floor.translate(0, 0, POOL_Z);
  pool.water.translate(0, 0, POOL_Z);
  conformPool(pool, ground);
  c.add('stone', pool.rim);
  c.add('stone', pool.floor);
  c.add('water', pool.water);

  /* ---------------------------------------------------------- 泄水沟 */
  for (const sx of [-1, 1]) {
    const ch = waterChannel(13.5, 1.5, 0.55);
    ch.rotateY(Math.PI / 2);
    ch.translate(sx * 16.2, 0, POOL_Z + 1.4);
    c.add('stone', ch);
  }

  /* ---------------------------------------------------------- 翻尾石鱼 */
  // 岸上：泄水沟尽头的上鱼（口朝下）与下鱼（口朝上，水被激回池中）
  for (const sx of [-1, 1]) {
    const up = stoneFish(1.5, true);
    up.rotateX(Math.PI * 0.92);
    up.translate(sx * 22.2, gy(sx * 22.2, POOL_Z + 1.6) + 2.1, POOL_Z + 1.6);
    c.add('stone', up);
    const low = stoneFish(1.5, true);
    low.rotateX(-Math.PI * 0.42);
    low.translate(sx * 22.2, gy(sx * 22.2, POOL_Z + 5.6) + 0.55, POOL_Z + 5.6);
    c.add('stone', low);
    // 上鱼吐水落入下鱼口
    c.add(
      'water',
      jetBetween([sx * 22.2, 1.65, POOL_Z + 2.4], [sx * 22.2, 0.95, POOL_Z + 5.2], 0.08)
    );
    // 下鱼把水激回池中
    c.add(
      'water',
      jetBetween([sx * 22.2, 1.05, POOL_Z + 6.4], [sx * 19.0, 0.0, POOL_Z + 10.5], 0.07)
    );
  }
  // 池中左右亦有石鱼
  for (const sx of [-1, 1]) {
    const f = stoneFish(1.7, true);
    f.rotateX(-Math.PI * 0.34);
    f.translate(sx * 11.5, gy(sx * 11.5, POOL_Z + 11) + 0.55, POOL_Z + 11);
    c.add('stone', f);
    c.add(
      'water',
      jetBetween([sx * 11.5, 1.35, POOL_Z + 11.8], [sx * 9.5, 0.05, POOL_Z + 8.5], 0.07)
    );
  }

  /* ---------------------------------------------------------- 翻尾大海猪 */
  for (const sx of [-1, 1]) {
    const pig = seaPig(2.4);
    pig.rotateY(sx > 0 ? -0.5 : 0.5);
    pig.translate(sx * 28.5, gy(sx * 28.5, POOL_Z - 1.5) + 0.4, POOL_Z - 1.5);
    c.add('stone', pig);
    // 口中喷水三丈余（约 9 m，推定）
    c.add('water', jetBetween([sx * 28.5, 2.9, POOL_Z - 0.4], [sx * 27.0, 9.2, POOL_Z + 1.6], 0.1));
    c.add('water', spray(0.34, 0.8).translate(sx * 27.0, 9.2, POOL_Z + 1.6));
  }

  /* ---------------------------------------------------------- 铜鹿（十犬喷鹿） */
  const deerZ = POOL_Z + 15;
  const deer = bronzeDeer(2.6);
  deer.translate(0, gy(0, deerZ) + 0.1, deerZ);
  c.add('metal', deer);
  // 八杈鹿角各喷一道水
  const antlerTips = [];
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const t = i / 3;
      antlerTips.push([
        sx * (0.09 + 0.08 + t * 0.16) * 2.6 + sx * 0.25,
        (1.86 + 0.3 + t * 0.1) * 2.6 + 0.1,
        deerZ + (0.64 + t * 0.1) * 2.6,
      ]);
    }
  }
  for (const p of antlerTips) {
    c.add('water', jetBetween(p, [p[0] * 0.55, p[1] + 3.2, p[2] + 0.9], 0.045));
  }

  /* ---------------------------------------------------------- 铜猎犬十只 */
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const hx = sx * 6.2;
      const hz = deerZ + 1.5 + i * 2.9;
      const yaw = Math.atan2(-hx, deerZ + 1.6 - hz);
      const dog = hound(1.5);
      dog.rotateY(yaw);
      dog.translate(hx, gy(hx, hz) + 0.1, hz);
      c.add('metal', dog);
      // 犬口喷水射向铜鹿
      const mouth = [hx - Math.sin(yaw) * 0.95 * 1.5, 1.3, hz + Math.cos(yaw) * 0.95 * 1.5];
      c.add('water', jetBetween(mouth, [sx * 1.4, 1.9, deerZ + 1.2], 0.05));
    }
  }

  /* ---------------------------------------------------------- 十三层喷水塔 */
  for (const sx of [-1, 1]) {
    const tower = fountainTower(13);
    tower.translate(sx * 31, gy(sx * 31, POOL_Z + 17), POOL_Z + 17);
    c.add('stone', tower);
    // 塔顶铜蒺藜十六角
    const cal = caltrop(1.5);
    cal.translate(sx * 31, 9.6, POOL_Z + 17);
    c.add('metal', cal);
    // 蒺藜十六道喷水
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      c.add(
        'water',
        jetBetween(
          [sx * 31 + Math.cos(a) * 0.8, 9.9, POOL_Z + 17 + Math.sin(a) * 0.8],
          [sx * 31 + Math.cos(a) * 2.4, 6.6, POOL_Z + 17 + Math.sin(a) * 2.4],
          0.035
        )
      );
    }
    // 塔身小喷水管的水
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      c.add(
        'water',
        jetBetween(
          [sx * 31 + Math.cos(a) * 2.4, 1.4, POOL_Z + 17 + Math.sin(a) * 2.4],
          [sx * 31 + Math.cos(a) * 4.2, 0.1, POOL_Z + 17 + Math.sin(a) * 4.2],
          0.035
        )
      );
    }
  }

  /* ---------------------------------------------------------- 池岸石花盆 */
  for (let i = 0; i < 9; i++) {
    const a = Math.PI * (0.1 + (0.8 * i) / 8);
    const rr = R + 0.4;
    const px = Math.cos(a) * rr;
    const pz = POOL_Z + Math.sin(a) * rr * 1.05;
    const pl = planter(1.5, 1.1);
    pl.rotateY(a);
    pl.translate(px, 0.0, pz);
    c.add('stone', pl);
    // 盆中三层线法松（简化为三层叠置的绿丛）
    for (let k = 0; k < 3; k++) {
      const t = sph(0.62 - k * 0.13, 8, 6);
      t.scale(1.25, 0.62, 1.25);
      t.translate(px, 1.35 + k * 0.36, pz);
      c.add('green', t);
    }
  }

  /* ---------------------------------------------------------- 池岸精雕花纹
   * 考据：大水法「池沿岸用**白玉石精雕花纹**，安放带座石花盆」。
   * 做法：沿海棠池南岸的外立面按间距贴番花浮雕（几何，不是贴图）。
   * 形制简化：只雕南岸可见的一段，间距约 3 m，一叶一涡。
   */
  {
    const outline = begoniaShape(R).getPoints(96);
    const motifs = [];
    let acc = 0;
    let prev = null;
    for (const p of outline) {
      if (!prev) {
        prev = p;
        continue;
      }
      const step = Math.hypot(p.x - prev.x, p.y - prev.y);
      acc += step;
      if (acc < 3.0) {
        prev = p;
        continue;
      }
      acc = 0;
      // 只取南岸（shape 的 y > 0，即世界 +Z 侧）
      if (p.y < R * 0.18) {
        prev = p;
        continue;
      }
      const px = p.x;
      const pz = POOL_Z + p.y;
      const yaw = Math.atan2(p.x, p.y - 0); // 轮廓法向朝外
      const lf = leaf(0.9, 0.32, 0.07);
      lf.rotateY(yaw + Math.PI / 2);
      lf.translate(px, gy(px, pz) + 0.24, pz);
      motifs.push(lf);
      const v = volute(0.42, 0.06, 1.4);
      v.rotateY(yaw + Math.PI / 2);
      v.translate(px, gy(px, pz) + 0.06, pz);
      motifs.push(v);
      prev = p;
    }
    c.addAll('stone', motifs);
  }

  /* ---------------------------------------------------------- 广场地面铺砌
   * 依据：brief「大水法 —— 广场地面用砖石琉璃铺砌」。
   * ⚠ 考据 notes 里没有这一条，故只做"砖石铺地 + 琉璃方砖收边"，
   *    **不编造纹样母题**（母题待考）。
   * 位置：大水池之南、观水法之北的御前广场。
   */
  {
    const pw = 48;
    const pd = 7.2;
    const pz0 = POOL_Z + R + 0.9 + pd / 2;
    const pav = pavementField(pw, pd, 1.7, (lx, lz) => gy(lx, lz + pz0));
    pav.a.translate(0, 0, pz0);
    pav.b.translate(0, 0, pz0);
    pav.edge.translate(0, 0, pz0);
    c.add('stone', pav.a);
    c.add('stone', pav.b);
    // 最外一圈用蓝琉璃收边（不新增材质桶：tile-lan 已在方外观屋面用过）
    c.add('tile-lan', pav.edge);
  }

  c.clearTransform();
  return { poolR: R, poolNorthZ: POOL_Z, nicheZ: NICHE_Z };
}
