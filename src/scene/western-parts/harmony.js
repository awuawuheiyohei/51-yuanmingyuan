/**
 * 谐奇趣 —— 长春园最早的西洋式建筑
 *
 * 考据（architecture-notes.md 第三节「谐奇趣」）：
 *   - 两层，庑殿顶，红色圆光琉璃瓦，屋脊用蓝色琉璃番草
 *   - 上层三间，下层七间
 *   - 楼柱用汉白玉深雕西洋番花番草花纹；窗户券口有精美砖石雕刻；墙身抹粉红灰
 *   - 两侧有月式平台抄手游廊，游廊尽头为五色琉璃顶八角形奏乐亭
 *   - 楼南有月台，两旁有白玉石盘券石磴；月台上二层楼门正中西洋石狮子二座
 *     及西洋雕刻玉石栏杆
 *   - 月台下为巨大的海棠形喷水池，池中央为西洋大翻尾石鱼一尾，口中可立一人，
 *     向上喷水高达五丈余
 *   - 池周围有喷水铜雁十八只、喷水铜羊四只；池东西有两个小喷水池，
 *     游廊下亦有两个。池南有石栏杆
 *
 * 局部坐标：+Z 朝南（面向大水法）。
 */
import * as THREE from 'three';
import { buildRoof } from '../buildings/parts/roof.js';
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
  stoneFish,
  goose,
  sheep,
  stoneLion,
  balustrade,
  curvedSteps,
  octagonalPavilion,
  planter,
  columnCapital,
  waterJet,
  jetBetween,
  spray,
  fountainPlume,
  steps,
} from './kit.js';
import { buildHall } from './hall.js';
import { begoniaPool, octagonalPool, conformPool, conformPoolCoping } from './fountain.js';

export function buildHarmonyHall(c, opts) {
  const { x, y, z, rotY = 0, ground = null } = opts;
  const gy = (lx, lz) => (ground ? ground(lx, lz) : 0);
  c.setTransform(x, y, z, rotY);

  const W1 = 26.6; // 下层七间（每间 3.8 m，推定）
  const D1 = 13;
  const W2 = 12; // 上层三间
  const D2 = 10;
  const PLAT = 1.3;
  const L1H = 6.4;
  const L2H = 5.2;

  /* ------------------------------------------------------------ 楼体 */
  buildHall(c, {
    w: W1,
    d: D1,
    platform: { h: PLAT, out: 1.6, steps: true, rail: true },
    levels: [
      {
        h: L1H,
        mian: 7,
        w: W1,
        d: D1,
        wall: 'plaster',
        columnBucket: 'ornate',
        windowY: 1.3,
        windowH: 3.4,
        carved: true,
      },
      {
        h: L2H,
        mian: 3,
        w: W2,
        d: D2,
        wall: 'plaster',
        columnBucket: 'ornate',
        windowY: 1.1,
        windowH: 2.9,
        carved: true,
      },
    ],
    roof: [
      {
        // 腰檐（下层出檐）
        width: W1,
        depth: D1,
        eaveY: PLAT + L1H,
        rise: 1.9,
        type: 'wudian',
        overhang: 1.7,
        // ⚠ 考据（**存疑**）：谐奇趣为庑殿顶，"琉璃瓦颜色现已无法确定，
        //   据说为**紫色圆光琉璃瓦**，正脊与垂脊皆为三色琉璃番花脊桶"。
        //   原来用红琉璃（无任何记载支持），改为紫 + 异色琉璃脊。
        tile: 'zi',
        ridge: 'lan',
        wallBucket: 'plaster',
      },
      {
        // 主屋面（庑殿顶，紫琉璃圆光瓦，屋脊蓝琉璃番草）
        width: W2,
        depth: D2,
        eaveY: PLAT + L1H + L2H,
        rise: 3.5,
        type: 'wudian',
        overhang: 1.7,
        tile: 'zi',
        ridge: 'lan',
        ridgeScroll: true,
        wallBucket: 'plaster',
      },
    ],
    wallBucket: 'plaster',
    trimBucket: 'ornate',
    columnBucket: 'ornate',
  });

  /* ------------------------------------------------------------ 二层月台 */
  const TERR_Y = PLAT + L1H;
  const terraceZ = D2 / 2 + 3.0;
  c.add('stone', boxAt(17, 0.55, 6.4, 0, TERR_Y - 0.27, terraceZ));
  c.add('stone', boxAt(17.6, 0.22, 7.0, 0, TERR_Y - 0.62, terraceZ));
  // 月台下的支柱
  for (const sx of [-1, 1]) {
    const col = cyl(0.42, 0.46, TERR_Y + 1.6, 10);
    col.translate(sx * 7.0, (TERR_Y - 1.6) / 2, terraceZ + 1.4);
    c.add('stone', col);
  }
  // 月台栏杆（玉石雕刻）
  const rail = balustrade(16.4, 1.05, 0.13);
  rail.translate(0, TERR_Y, terraceZ + 3.0);
  c.add('stone', rail);
  for (const sx of [-1, 1]) {
    const r = balustrade(6.0, 1.05, 0.13);
    r.rotateY(Math.PI / 2);
    r.translate(sx * 8.0, TERR_Y, terraceZ);
    c.add('stone', r);
  }
  // 月台正中（二层楼门前）西洋石狮子二座
  for (const sx of [-1, 1]) {
    const lion = stoneLion(1.5);
    lion.rotateY(sx > 0 ? -0.25 : 0.25);
    lion.translate(sx * 2.3, TERR_Y, terraceZ + 1.8);
    c.add('stone', lion);
  }

  /* ------------------------------------------------------------ 白玉石盘与券石磴 */
  for (const sx of [-1, 1]) {
    // 玉盘（圆石）
    const disc = cyl(2.4, 2.6, 0.4, 16);
    disc.translate(sx * 9.4, 0.2, terraceZ + 1.0);
    c.add('stone', disc);
    // 券石磴（弧形石阶）
    const st = curvedSteps(3.0, 5.2, 0, Math.PI * 0.6, 0.2, TERR_Y, 10);
    st.rotateY(sx > 0 ? Math.PI * 0.15 : Math.PI * 0.85);
    st.translate(sx * 9.4, 0, terraceZ + 1.0);
    c.add('stone', st);
  }

  /* ------------------------------------------------------------ 海棠形大喷水池 */
  const PR = 13;
  const pool = begoniaPool(PR, 1.3, 1.1);
  const POOL_Z = terraceZ + 3.4;
  pool.rim.translate(0, 0, POOL_Z);
  pool.floor.translate(0, 0, POOL_Z);
  pool.water.translate(0, 0, POOL_Z);
  pool.coping.translate(0, 0, POOL_Z);
  conformPool(pool, ground);
  conformPoolCoping(pool, ground);
  c.add('stone', pool.rim);
  c.add('stone', pool.floor);
  c.add('stone', pool.coping);
  c.add('water', pool.water);

  // 池心大翻尾石鱼（口中可立一人，向上喷水五丈余）
  const bigFish = stoneFish(3.4, true);
  bigFish.rotateY(Math.PI);
  bigFish.translate(0, gy(0, POOL_Z + PR * 0.62) + 0.4, POOL_Z + PR * 0.62);
  c.add('stone', bigFish);
  // 五丈余的水柱：做成**一束**细流（原来是一根白柱，远看像白玉碑）
  c.add(
    'water',
    fountainPlume(15.5, 0.045, 6, 0.26).translate(0, 1.6, POOL_Z + PR * 0.62)
  );

  /* ------------------------------------------------------------ 铜雁十八 · 铜羊四 */
  const geese = [];
  const sheepList = [];
  for (let i = 0; i < 18; i++) {
    const a = Math.PI * (0.08 + (0.84 * i) / 17);
    const rr = PR - 2.2;
    const gx = Math.cos(a) * rr;
    const gz = POOL_Z + Math.sin(a) * rr * 1.05;
    const g = goose(1.5);
    g.rotateY(-a + Math.PI / 2);
    g.translate(gx, gy(gx, gz) + 0.1, gz);
    geese.push(g);
    // 雁口喷水（射向池心）
    const dir = [-gx, -gz + POOL_Z];
    const len = Math.hypot(dir[0], dir[1]) || 1;
    c.add(
      'water',
      jetBetween(
        [gx + (dir[0] / len) * 0.5, 0.85, gz + (dir[1] / len) * 0.5],
        [gx + (dir[0] / len) * 1.6, 0.1, gz + (dir[1] / len) * 1.6],
        0.035
      )
    );
  }
  c.addAll('metal', geese);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI * (0.25 + (0.5 * i) / 3);
    const rr = PR - 4.6;
    const sx2 = Math.cos(a) * rr;
    const sz2 = POOL_Z + Math.sin(a) * rr * 1.05;
    const sh = sheep(1.6);
    sh.rotateY(-a + Math.PI / 2);
    sh.translate(sx2, gy(sx2, sz2) + 0.1, sz2);
    sheepList.push(sh);
    const dir = [-sx2, -sz2 + POOL_Z];
    const len = Math.hypot(dir[0], dir[1]) || 1;
    c.add(
      'water',
      jetBetween(
        [sx2 + (dir[0] / len) * 0.6, 1.05, sz2 + (dir[1] / len) * 0.6],
        [sx2 + (dir[0] / len) * 2.0, 0.1, sz2 + (dir[1] / len) * 2.0],
        0.045
      )
    );
  }
  c.addAll('metal', sheepList);

  /* ------------------------------------------------------------ 池南石栏杆 */
  const railS = balustrade(PR * 1.7, 1.05, 0.12);
  railS.translate(0, 0, POOL_Z + PR * 1.22);
  c.add('stone', railS);
  for (const sx of [-1, 1]) {
    const r = balustrade(PR * 0.9, 1.05, 0.12);
    r.rotateY(Math.PI / 2);
    r.translate(sx * PR * 0.92, 0, POOL_Z + PR * 0.55);
    c.add('stone', r);
  }

  /* ------------------------------------------------------------ 月式平台 · 抄手游廊 · 奏乐亭 */
  for (const sx of [-1, 1]) {
    // 月式平台（半圆）
    const prof = [
      [0.0, 1.02],
      [0.3, 1.02],
      [0.38, 0.9],
      [1.0, 0.9],
    ];
    const terrace = new THREE.LatheGeometry(
      prof.map(([t, r]) => new THREE.Vector2(r * 9.5, t * 0.9)),
      16,
      Math.PI / 2,
      Math.PI
    );
    terrace.computeVertexNormals();
    terrace.rotateY(sx > 0 ? 0 : Math.PI);
    terrace.translate(sx * 18.5, 0, 2.0);
    c.add('stone', terrace);

    // 抄手游廊（柱 + 悬山屋面）
    const cw = 3.6;
    const cl = 20;
    const cxx = sx * 18.5;
    const czz = 2.0;
    for (let i = 0; i <= 6; i++) {
      const cz = czz - cl / 2 + (cl * i) / 6;
      for (const s2 of [-1, 1]) {
        // 柱身（顶端让出柱头）
        const shaftH = 3.1 - 0.26;
        const col = cyl(0.17, 0.19, shaftH, 8);
        col.translate(cxx + s2 * (cw / 2 - 0.3), 0.9 + 0.13 + shaftH / 2, cz);
        c.add('stone', col);
        // 柱头（游廊柱很细，用省面做法：颈线脚 + 顶板 + 一圈卷涡）
        const cap = columnCapital(0.175, { h: 0.26, order: 'plain' });
        cap.translate(cxx + s2 * (cw / 2 - 0.3), 0.9 + 0.13 + shaftH, cz);
        c.add('stone', cap);
      }
    }
    const rf = buildRoof({
      width: cw,
      depth: cl,
      eaveY: 3.3,
      rise: 1.0,
      type: 'yingshan',
      overhang: 0.9,
      overhangX: 0.8,
      upturn: 0.4,
      bulge: 0.25,
    });
    for (const [k, list] of rf.geoms) {
      const bucket =
        k === 'tile' || k === 'ridge' || k === 'finial'
          ? 'tile-hui'
          : k === 'wood' || k === 'eave'
            ? 'wood'
            : k === 'board'
              ? 'board' // 望板（屋面之下的铺板）必须单独一桶，不能糊成粉灰墙
              : 'plaster';
      for (const g of list) {
        if (!g || !g.attributes?.position) continue; // roof.js 的 finial 桶里混有数组
        g.translate(cxx, 0.9, czz);
        c.add(bucket, g);
      }
    }

    // 游廊下的一个小喷水池
    const sp = octagonalPool(2.6, 0.7, 0.45);
    const spx = sx * 12.4;
    const spz = 10.0;
    sp.rim.translate(spx, 0, spz);
    sp.floor.translate(spx, 0, spz);
    sp.water.translate(spx, 0, spz);
    sp.coping.translate(spx, 0, spz);
    conformPool(sp, ground);
    conformPoolCoping(sp, ground);
    c.add('stone', sp.rim);
    c.add('stone', sp.floor);
    c.add('stone', sp.coping);
    c.add('water', sp.water);
    c.add('water', waterJet(2.2, 0.10).translate(spx, 0, spz));

    // 奏乐亭（五色琉璃顶八角亭）
    const pavX = cxx;
    const pavZ = czz + cl / 2 + 4.5;
    const pav = octagonalPavilion({ radius: 4.0, postH: 3.4, roof: false });
    pav.translate(pavX, 0.9, pavZ);
    c.add('stone', pav);
    const pavRoof = buildRoof({
      width: 7.0,
      depth: 7.0,
      eaveY: 0,
      rise: 2.5,
      type: 'zanjiandian',
      circular: false,
      overhang: 1.3,
      upturn: 0.6,
      bulge: 0.4,
      segments: 8,
    });
    for (const [k, list] of rf2Buckets(pavRoof)) {
      for (const g of list) {
        if (!g || !g.attributes?.position) continue;
        g.translate(pavX, 0.9 + 3.4, pavZ);
        c.add(k, g);
      }
    }
  }

  /* ------------------------------------------------------------ 池东西两个小喷水池 */
  for (const sx of [-1, 1]) {
    const p = octagonalPool(3.2, 0.8, 0.5);
    const px = sx * (PR + 3.4);
    const pz = POOL_Z + PR * 0.5;
    p.rim.translate(px, 0, pz);
    p.floor.translate(px, 0, pz);
    p.water.translate(px, 0, pz);
    p.coping.translate(px, 0, pz);
    conformPool(p, ground);
    conformPoolCoping(p, ground);
    c.add('stone', p.rim);
    c.add('stone', p.floor);
    c.add('stone', p.coping);
    c.add('water', p.water);
    c.add('water', waterJet(2.6, 0.10).translate(px, 0, pz));
  }

  c.clearTransform();
  return {};
}

/** 把攒尖顶屋面的材质桶映射成西洋楼的桶名 */
function rf2Buckets(roof) {
  const out = new Map();
  for (const [k, list] of roof.geoms) {
    let bucket = k;
    if (k === 'tile') bucket = 'tile-wuse';
    else if (k === 'ridge' || k === 'finial') bucket = 'tile-wuse';
    else if (k === 'wood' || k === 'eave') bucket = 'wood';
    else if (k === 'wall' || k === 'shanhua') bucket = 'plaster';
    else if (k === 'board') bucket = 'board'; // 望板
    if (!out.has(bucket)) out.set(bucket, []);
    out.get(bucket).push(...list);
  }
  return out;
}
