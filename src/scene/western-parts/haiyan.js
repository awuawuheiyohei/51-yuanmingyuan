/**
 * 海晏堂 —— 西洋楼中最大的建筑（前楼 + 后楼 + 十二生肖喷泉）
 *
 * 考据（architecture-notes.md 第三节「海晏堂」）：
 *   - 分前后楼。前楼一层，坐落于高台之上，正面十一间，深一间，正门向西
 *     （此处释为面阔十一间、进深约五间，**推定**）
 *   - 楼身为砖砌，立柱为汉白玉精刻西洋番花石柱；孔雀绿琉璃瓦庑殿顶
 *   - 屋檐上安露顶石栏杆；屋顶垂脊四角各安翻尾石鱼一条
 *   - 楼身抹粉红色灰；石券花窗口与汉白玉石柱之间墙面为五色琉璃番花
 *   - 正门位于二层，门为黄铜西洋雕花；窗为法式铜窗，窗间立柱为大玻璃镜，
 *     镜子上方为三角式巴洛克假门楣装饰
 *   - 门前为平台，左右为叠落石跑梯，中央为喷水池
 *   - 两侧共有导水台六十个，水纹形泄水沟四道
 *   - 正门前有西洋式石豹两只，口中吐水
 *   - 大喷水池中央为石蚌，其上为转轮水法，再上为喷水石鱼二只
 *   - 池中央有喷水台一座，两旁石台二座，沿石跑梯八字展开，
 *     上为十二生肖兽首人身喷水像：南侧鼠虎龙马猴狗，北侧牛兔蛇羊鸡猪
 *   - 喷水池外叠落石梯两旁有西洋八角石鼎各一，高八尺余
 *   - 后楼（东楼）亦为两层，与前楼通过平台楼梯相连；后楼中央为蓄水池（锡海），
 *     二层东西两端各有蓄水楼一座，楼内各有水井，上安轧水机
 *   - 后楼南北各有西洋八角喷水池二座；西池有二铜猴在树下捅马蜂窝；
 *     南面东池内一铜猴坐假山上执伞，喷泉名为"猴打伞"
 *
 * 局部坐标：+X 东、+Z 南。前楼的长立面（十一间）朝**西**（正门向西），
 * 后楼在其东。
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
  beastHead,
  robedBody,
  ZODIAC,
  monkey,
  stoneFish,
  stoneTripod,
  planter,
  balustrade,
  acanthusBand,
  pediment,
  volute,
  waterJet,
  jetBetween,
  spray,
  steps,
} from './kit.js';
import { buildHall } from './hall.js';
import { octagonalPool, clamAndWheel, conformPool } from './fountain.js';

/** 西洋石豹（正门前，口中吐水） */
function stoneLeopard(size = 1) {
  const S = size;
  const parts = [];
  const body = sph(0.4 * S, 11, 8);
  body.scale(0.78, 0.86, 1.7);
  body.translate(0, 0.78 * S, 0);
  parts.push(body);
  const neck = cyl(0.14 * S, 0.18 * S, 0.26 * S, 8);
  neck.rotateX(-0.85);
  neck.translate(0, 0.9 * S, 0.5 * S);
  parts.push(neck);
  const head = beastHead(0.72 * S, {
    muzzle: 0.46,
    snout: 'box',
    ear: 'round',
    wide: 1.1,
  });
  head.translate(0, 1.02 * S, 0.72 * S);
  parts.push(head);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const leg = cyl(0.045 * S, 0.07 * S, 0.78 * S, 6);
      leg.translate(sx * 0.2 * S, 0.39 * S, sz * 0.38 * S);
      parts.push(leg);
    }
  }
  const tail = cyl(0.022 * S, 0.045 * S, 0.62 * S, 5);
  tail.rotateX(-1.1);
  tail.rotateZ(0.5);
  tail.translate(0.16 * S, 0.86 * S, -0.6 * S);
  parts.push(tail);
  return mergeAll(parts);
}

export function buildHaiYanTang(c, opts) {
  const { x, y, z, rotY = 0, ground = null } = opts;
  const gy = (lx, lz) => (ground ? ground(lx, lz) : 0);
  c.setTransform(x, y, z, rotY);

  const FW = 46; // 前楼面阔（十一间 × 4.2 m，推定）
  const FD = 20; // 前楼进深
  const PLAT = 2.2; // 高台高
  const ROT = -Math.PI / 2; // 前楼立面朝西

  /* ---------------------------------------------------------- 前楼 */
  // 前楼的长立面（十一间）朝**西**，故整座楼在景区坐标系里再转 -90°
  c.setTransform(x, y, z, rotY - Math.PI / 2);
  buildHall(c, {
    w: FW,
    d: FD,
    platform: { h: PLAT, out: 3.0, steps: false, rail: false },
    levels: [
      {
        h: 8.4,
        mian: 11,
        wall: 'plaster',
        columnBucket: 'stone',
        windowY: 1.9,
        windowH: 4.2,
        door: true,
      },
    ],
    roof: {
      width: FW,
      depth: FD,
      eaveY: PLAT + 8.4,
      rise: 4.2,
      type: 'wudian',
      overhang: 2.2,
      tile: 'keque',
      ridge: 'keque',
      wallBucket: 'plaster',
      hipFishBucket: 'stone',
      hipFish: () => stoneFish(1.5, true),
    },
    wallBucket: 'plaster',
    trimBucket: 'stone',
    columnBucket: 'stone',
    glassBucket: 'glass',
  });
  c.setTransform(x, y, z, rotY);

  /* ---------------------------------------------------------- 后楼（东楼） */
  const RX0 = 16; // 后楼西端
  const RW = 26; // 后楼长（东西向）
  const RD = 16; // 后楼深（南北向）
  const rxc = RX0 + RW / 2;
  const rzt = 0;

  // 后楼台基
  c.add('stone', boxAt(RW + 3.0, PLAT + 2.6, RD + 3.0, rxc, (PLAT - 2.6) / 2, rzt));
  c.add('stone', boxAt(RW + 3.6, 0.3, RD + 3.6, rxc, PLAT - 0.25, rzt));

  // 后楼两层（石砌 + 券花窗）
  for (let lv = 0; lv < 2; lv++) {
    const h = lv === 0 ? 7.0 : 5.6;
    const y0 = PLAT + (lv === 0 ? 0 : 7.0);
    for (const sz of [1, -1]) {
      const panel = archedPanelLocal(RW, h, 0.6, 5, y0);
      panel.translate(rxc, y0, rzt + sz * (RD / 2 - 0.3));
      c.add('plaster', panel);
    }
    for (const sx of [1, -1]) {
      const panel = archedPanelLocal(RD - 1.2, h, 0.6, 3, y0);
      panel.rotateY((Math.PI / 2) * sx);
      panel.translate(rxc + sx * (RW / 2 - 0.3), y0, rzt);
      c.add('plaster', panel);
    }
    // 檐部
    for (const sz of [1, -1]) {
      const cm = corniceLocal(RW + 1.0, 0.9);
      cm.translate(rxc, y0 + h - 0.4, rzt + sz * (RD / 2 + 0.2));
      c.add('stone', cm);
    }
    for (const sx of [1, -1]) {
      const cm = corniceLocal(RD + 0.6, 0.9);
      cm.rotateY(Math.PI / 2);
      cm.translate(rxc + sx * (RW / 2 + 0.2), y0 + h - 0.4, rzt);
      c.add('stone', cm);
    }
  }
  // 后楼屋面（孔雀绿琉璃庑殿顶）
  addRoofLocal(c, RW, RD, PLAT + 12.6, 3.4, 'keque', rxc, rzt);
  // 二层东西端各蓄水楼
  for (const sx of [1, -1]) {
    const tx = rxc + sx * (RW / 2 - 3.4);
    c.add('plaster', boxAt(6.2, 6.4, RD - 3.0, tx, PLAT + 12.6 + 3.2, rzt));
    c.add('stone', boxAt(6.8, 0.4, RD - 2.4, tx, PLAT + 12.6 + 6.4, rzt));
    // 楼内水井
    c.add('stone', cyl(1.5, 1.6, 1.2, 12).translate(tx, PLAT + 12.9, rzt));
    // 轧水机
    c.add('metal', cyl(0.9, 0.9, 1.6, 10).translate(tx, PLAT + 14.2, rzt));
  }
  // 后楼中央锡海（蓄水池）
  c.add('stone', boxAt(9.0, 2.2, RD - 2.0, rxc, PLAT + 13.6, rzt));
  c.add('water', boxAt(8.2, 0.2, RD - 3.0, rxc, PLAT + 14.5, rzt));

  /* ---------------------------------------------------------- 门前平台与喷水池 */
  const COURT_X = -FD / 2 - 2.5; // 平台西缘
  const courtW = 22;
  const courtD = 34;
  c.add('stone', boxAt(courtW, 4.0, courtD, COURT_X - courtW / 2 + 2, -1.0, 0));
  c.add('stone', boxAt(courtW + 0.6, 0.2, courtD + 0.6, COURT_X - courtW / 2 + 2, 1.1, 0));

  // 叠落石跑梯（南北各一）：从平台叠落到地面
  for (const sz of [1, -1]) {
    for (let i = 0; i < 4; i++) {
      const t = i / 4;
      const x = COURT_X - 1.5 - i * 2.4;
      const y = 1.0 - i * 0.24;
      const w = 5.5 - i * 0.4;
      c.add('stone', boxAt(2.6, 0.26, w, x, y, sz * 13.5));
      c.add('stone', boxAt(2.6, y, w, x, y / 2, sz * 13.5));
    }
    // 跑梯两侧导水台（每侧 30 个，合计六十个）
    for (let i = 0; i < 30; i++) {
      const t = i / 29;
      const px = COURT_X - 2.0 - t * 10.0;
      const pz = sz * (12.0 + t * 5.4);
      const plat = boxAt(0.9, 0.5, 0.9, px, 0.25 + t * 0.9, pz);
      c.add('stone', plat);
    }
    // 水纹形泄水沟（每侧两道，共四道）
    for (let k = 0; k < 2; k++) {
      for (let i = 0; i < 12; i++) {
        const t = i / 11;
        const px = COURT_X - 1.8 - t * 9.6;
        const pz = sz * (11.2 + k * 1.5 + Math.sin(t * 7) * 0.5);
        c.add('stone', boxAt(0.95, 0.2, 0.95, px, 0.12 + t * 0.8, pz));
      }
    }
  }

  // 大喷水池
  const pool = octagonalPool(9.0, 1.2, 0.8);
  const PX = COURT_X - courtW / 2 + 2;
  pool.rim.translate(PX, 0, 0);
  pool.floor.translate(PX, 0, 0);
  pool.water.translate(PX, 0, 0);
  conformPool(pool, ground);
  c.add('stone', pool.rim);
  c.add('stone', pool.floor);
  c.add('water', pool.water);
  // 池缘栏杆
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const r = balustrade(4.2, 0.95);
    r.rotateY(-a + Math.PI / 2);
    r.translate(PX + Math.cos(a) * 9.4, 0, Math.sin(a) * 9.4);
    c.add('stone', r);
  }

  // 池中央喷水台 + 石蚌 + 转轮水法 + 喷水石鱼二只
  c.add('stone', cyl(2.4, 2.8, 1.2, 12).translate(PX, 0.6, 0));
  const clam = clamAndWheel(1.0);
  clam.translate(PX, 1.2, 0);
  c.add('stone', clam);
  for (const sx of [-1, 1]) {
    const f = stoneFish(1.2, true);
    f.rotateY(sx > 0 ? -0.6 : 0.6);
    f.translate(PX + sx * 2.6, 4.6, 0);
    c.add('stone', f);
    c.add(
      'water',
      jetBetween(
        [PX + sx * 2.6, 4.0, 0],
        [PX + sx * 1.2, 0.2, 0],
        0.06
      )
    );
  }
  // 两旁石台二座
  for (const sz of [-1, 1]) {
    c.add('stone', cyl(1.8, 2.1, 1.0, 10).translate(PX, 0.5, sz * 7.2));
    c.add('water', waterJet(2.6, 0.06).translate(PX, 1.0, sz * 7.2));
  }

  /* ---------------------------------------------------------- 十二生肖 */
  const south = ['shu', 'hu', 'long', 'ma', 'hou', 'gou'];
  const north = ['niu', 'tu', 'she', 'yang', 'ji', 'zhu'];
  const place = (key, px, pz, faceYaw) => {
    const z = ZODIAC.find((q) => q.key === key);
    if (!z) return;
    const base = gy(px, pz);
    // 石台
    c.add('stone', cyl(1.15, 1.35, 0.9, 10).translate(px, base + 0.45, pz));
    c.add('stone', boxAt(2.6, 0.18, 2.6, px, base + 0.94, pz));
    // 人身
    const body = robedBody(1.0, 2.0);
    body.rotateY(faceYaw);
    body.translate(px, base + 1.03, pz);
    c.add('stone', body);
    // 兽首
    const head = beastHead(0.78, z.head);
    head.rotateY(faceYaw);
    head.translate(px, base + 3.03, pz);
    c.add('metal', head);
    // 口中喷水（射向池心）
    const dir = [PX - px, 0, -pz];
    const len = Math.hypot(dir[0], dir[2]) || 1;
    const mouth = [
      px + (dir[0] / len) * 0.62,
      base + 3.18,
      pz + (dir[2] / len) * 0.62,
    ];
    const target = [PX + (dir[0] / len) * 1.2, base + 1.1, pz + (dir[2] / len) * 1.2];
    c.add('water', jetBetween(mouth, target, 0.055));
  };
  south.forEach((k, i) => {
    const t = i / 5;
    const px = -19 - t * 11.5;
    const pz = 3.6 + t * 10.0;
    place(k, px, pz, Math.atan2(PX - px, -pz));
  });
  north.forEach((k, i) => {
    const t = i / 5;
    const px = -19 - t * 11.5;
    const pz = -3.6 - t * 10.0;
    place(k, px, pz, Math.atan2(PX - px, -pz));
  });

  /* ---------------------------------------------------------- 八角石鼎 */
  for (const sz of [-1, 1]) {
    const ding = stoneTripod(1.0, 2.7);
    ding.translate(COURT_X - 19.5, 0, sz * 16.5);
    c.add('stone', ding);
  }

  /* ---------------------------------------------------------- 正门前石豹 */
  for (const sz of [-1, 1]) {
    const leo = stoneLeopard(1.5);
    leo.rotateY(-Math.PI / 2);
    leo.translate(-FD / 2 - 2.0, 1.0, sz * 3.4);
    c.add('stone', leo);
    c.add(
      'water',
      jetBetween(
        [-FD / 2 - 3.1, 1.75, sz * 3.4],
        [-FD / 2 - 6.0, 0.2, sz * 3.4],
        0.07
      )
    );
  }

  /* ---------------------------------------------------------- 后楼八角喷水池四座 */
  const poolSpots = [
    [rxc - 9.5, 14.0, 'west'],
    [rxc + 9.5, 14.0, 'east'],
    [rxc - 9.5, -14.0, 'west'],
    [rxc + 9.5, -14.0, 'east'],
  ];
  for (const [px, pz, tag] of poolSpots) {
    const p = octagonalPool(4.6, 0.8, 0.5);
    p.rim.translate(px, 0, pz);
    p.floor.translate(px, 0, pz);
    p.water.translate(px, 0, pz);
    conformPool(p, ground);
    c.add('stone', p.rim);
    c.add('stone', p.floor);
    c.add('water', p.water);
    c.add('water', waterJet(2.4, 0.055).translate(px, 0, pz));
    if (tag === 'west') {
      // 西池：二铜猴在树下捅马蜂窝
      for (const sx of [-1, 1]) {
        const mk = monkey(1.1);
        mk.rotateY(sx > 0 ? -0.4 : 0.4);
        mk.translate(px + sx * 1.4, 0.2, pz + 0.6);
        c.add('metal', mk);
      }
      // 树（马蜂窝在树上）
      c.add('wood', cyl(0.24, 0.34, 4.4, 8).translate(px, 2.2, pz + 1.4));
      c.add('green', sph(1.5, 8, 6).translate(px, 4.8, pz + 1.4));
      c.add('wood', sph(0.42, 7, 5).translate(px + 0.7, 3.9, pz + 1.2));
    } else if (pz > 0) {
      // 南面东池：铜猴坐假山上执伞
      const rock = sph(1.3, 9, 7);
      rock.scale(1, 0.75, 1);
      rock.translate(px, 0.7, pz);
      c.add('rock', rock);
      const mk = monkey(1.0);
      mk.translate(px, 1.3, pz);
      c.add('metal', mk);
      // 伞
      c.add('metal', cyl(0.06, 0.06, 2.4, 6).translate(px, 2.9, pz));
      c.add('metal', cone(1.5, 0.7, 10).translate(px, 4.0, pz));
    }
  }

  c.clearTransform();
  return {};
}

/* ------------------------------------------------------------------ 局部工具 */

/** 局部带券洞的墙板（供后楼使用） */
function archedPanelLocal(w, h, t, n, baseY) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(w / 2, h);
  shape.lineTo(-w / 2, h);
  shape.closePath();
  const bay = w / n;
  for (let i = 0; i < n; i++) {
    const cx = -w / 2 + bay * (i + 0.5);
    const ow = bay * 0.46;
    const oh = h * 0.36;
    const r = ow / 2;
    const p = new THREE.Path();
    p.moveTo(cx - r, 1.0);
    p.lineTo(cx - r, 1.0 + oh - r);
    p.absarc(cx, 1.0 + oh - r, r, Math.PI, 0, true);
    p.lineTo(cx + r, 1.0);
    p.closePath();
    shape.holes.push(p);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false, curveSegments: 8 });
  g.translate(0, 0, -t / 2);
  g.computeVertexNormals();
  const pos = g.attributes.position;
  const nrm = g.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nrm.getX(i));
    const ny = Math.abs(nrm.getY(i));
    const nz = Math.abs(nrm.getZ(i));
    let u;
    let v;
    if (nx >= ny && nx >= nz) {
      u = pos.getZ(i);
      v = pos.getY(i);
    } else if (ny >= nx && ny >= nz) {
      u = pos.getX(i);
      v = pos.getZ(i);
    } else {
      u = pos.getX(i);
      v = pos.getY(i);
    }
    uv[i * 2] = u / 32;
    uv[i * 2 + 1] = v / 32;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** 局部线脚 */
function corniceLocal(len, depth) {
  const parts = [];
  const layers = [
    [0.0, 0.16, 1.0],
    [0.16, 0.12, 1.14],
    [0.28, 0.1, 0.94],
  ];
  for (const [y, t, k] of layers) {
    parts.push(boxAt(len * k, t, depth * k, 0, y + t / 2, 0));
  }
  return mergeAll(parts);
}

/** 局部屋面（叠涩瓦顶 + 压边），ox/oz 为在景区坐标系里的中心偏移 */
function addRoofLocal(c, w, d, eaveY, rise, tileKey, ox = 0, oz = 0) {
  c.add(`tile-${tileKey}`, boxAt(w + 3.2, 0.5, d + 3.2, ox, eaveY + 0.25, oz));
  c.add(`tile-${tileKey}`, boxAt(w + 2.4, rise * 0.55, d + 2.4, ox, eaveY + 0.5 + rise * 0.275, oz));
  c.add(`tile-${tileKey}`, boxAt(w + 1.2, rise * 0.45, d + 1.2, ox, eaveY + 0.5 + rise * 0.55 + rise * 0.225, oz));
  c.add('wood', boxAt(w + 3.6, 0.3, d + 3.6, ox, eaveY - 0.15, oz));
}
