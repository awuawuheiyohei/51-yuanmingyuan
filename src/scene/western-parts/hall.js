/**
 * 西洋楼里的"官式屋面西洋楼"通用构造
 *
 * 谐奇趣、方外观、海晏堂、远瀛观都是**中国屋顶 + 西洋装饰**的混合体：
 *   屋面、斗栱、额枋、须弥座是清式官做法；
 *   柱子、券花窗、法式铜窗、山花、卷涡是西洋做法。
 * 所以这里把"墙身 + 柱 + 窗 + 线脚"做成参数化的，再用建筑系统的
 * `buildRoof` 生成真正的清式屋面（筒瓦、板瓦、瓦当、滴水、翼角起翘）。
 */
import * as THREE from 'three';
import { buildRoof } from '../buildings/parts/roof.js';
import { buildDougongSet } from '../buildings/parts/dougong.js';
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
  worldUV,
  archedPanel,
  windowSurround,
  cornice,
  pilaster,
  acanthusBand,
  balustrade,
  steps,
  volute,
  leaf,
} from './kit.js';

const WALL_T = 0.62;

/**
 * 汉白玉番花柱：柱身 + 覆盆础 + 柱头 + 环身番花浮雕。
 */
export function carvedColumn(h, r = 0.42, relief = true) {
  const parts = [];
  const shaftH = h - 0.55;
  const shaft = cyl(r * 0.88, r, shaftH, 12);
  shaft.translate(0, 0.28 + shaftH / 2, 0);
  parts.push(shaft);
  // 柱础（覆盆）
  const prof = [
    [0.0, 1.5],
    [0.12, 1.42],
    [0.3, 1.1],
    [0.8, 0.98],
    [1.0, 1.0],
  ];
  parts.push(
    lathe(
      prof.map(([t, rs]) => new THREE.Vector2(r * rs, t * 0.3)),
      12
    )
  );
  // 柱头
  const cap = lathe(
    [
      [0.0, 1.0],
      [0.35, 1.28],
      [0.62, 1.05],
      [0.85, 1.5],
      [1.0, 1.62],
    ].map(([t, rs]) => new THREE.Vector2(r * rs, t * 0.26)),
    12
  );
  cap.translate(0, h - 0.28, 0);
  parts.push(cap);
  if (relief) {
    // 柱身两圈番花
    for (const y of [shaftH * 0.36, shaftH * 0.66]) {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const lf = leaf(shaftH * 0.2, r * 0.42, 0.055);
        lf.rotateZ(Math.PI / 2);
        lf.rotateY(-a);
        lf.translate(Math.sin(a) * r * 0.92, 0.3 + y, Math.cos(a) * r * 0.92);
        parts.push(lf);
      }
    }
  }
  return mergeAll(parts);
}

/** 立面开洞：一排等距的券洞 */
function bayOpenings(width, n, y0, wh, doorBay = -1, doorH = null) {
  const bay = width / n;
  const list = [];
  for (let i = 0; i < n; i++) {
    const cx = -width / 2 + bay * (i + 0.5);
    const isDoor = i === doorBay;
    list.push({
      x: cx,
      y: y0,
      w: bay * (isDoor ? 0.62 : 0.5),
      h: isDoor ? doorH ?? wh * 1.25 : wh,
      door: isDoor,
    });
  }
  return list;
}

/**
 * 造一座官式屋面 / 西洋装饰的建筑。
 *
 * @param {object} c  收集器（Collector）
 * @param {object} opts
 */
export function buildHall(c, opts) {
  const {
    w,
    d,
    levels = [{ h: 6, mian: 5 }],
    roof = null,
    wallBucket = 'plaster',
    columnBucket = 'stone',
    glassBucket = 'glass',
    metalBucket = 'metal',
    trimBucket = 'stone',
    windowStyle = 'arch',
    doorBuckets = null,
  } = opts;
  // 调用方可能只给平台的部分字段，这里补齐缺省
  const platform = {
    h: 1.2,
    out: 1.4,
    bucket: 'stone',
    steps: true,
    rail: true,
    railBucket: null,
    ...(opts.platform || {}),
  };

  const railBucket = platform.railBucket || trimBucket;
  let baseY = 0;

  /* ------------------------------------------------------------ 台基 */
  if (platform.h > 0.05) {
    const pw = w + platform.out * 2;
    const pd = d + platform.out * 2;
    // 台基向下延伸 3 m 埋进地里：地形起伏时不会浮在草皮上
    const skirt = 3.0;
    c.add(
      platform.bucket,
      boxAt(pw, platform.h * 0.68 + skirt, pd, 0, (platform.h * 0.68 - skirt) / 2, 0)
    );
    c.add(platform.bucket, boxAt(pw + 0.44, platform.h * 0.14, pd + 0.44, 0, platform.h * 0.75, 0));
    c.add(platform.bucket, boxAt(pw + 0.16, platform.h * 0.14, pd + 0.16, 0, platform.h * 0.89, 0));
    if (platform.steps !== false) {
      const sw = Math.min(w * 0.3, 9);
      const sd = Math.max(1.6, platform.h * 2.1);
      const st = steps(sw, platform.h, sd, 5);
      st.translate(0, 0, d / 2 + platform.out);
      c.add(platform.bucket, st);
    }
    if (platform.rail) {
      // 正面栏杆（踏跺两侧）
      const sw = Math.min(w * 0.3, 9);
      const rw = (w - sw) / 2 - 0.6;
      if (rw > 1.5) {
        for (const sx of [-1, 1]) {
          const r = balustrade(rw, 1.0);
          r.translate(sx * (sw / 2 + rw / 2 + 0.4), platform.h, d / 2 + platform.out - 0.35);
          c.add(railBucket, r);
        }
      }
      // 左右侧栏杆
      for (const sx of [-1, 1]) {
        const r = balustrade(pd - 1.2, 1.0);
        r.rotateY(Math.PI / 2);
        r.translate(sx * (w / 2 + platform.out - 0.35), platform.h, 0);
        c.add(railBucket, r);
      }
    }
    baseY = platform.h;
  }

  /* ------------------------------------------------------------ 各层 */
  let floorY = baseY;
  levels.forEach((lv, li) => {
    const h = lv.h;
    const lw = lv.w ?? w; // 每层可收分
    const ld = lv.d ?? d;
    const n = lv.mian;
    const bay = lw / n;
    const wh = lv.windowH ?? Math.min(h * 0.42, bay * 0.66);
    const wallBucketLv = lv.wall || wallBucket;
    const doorBay = lv.door === false ? -1 : Math.floor(n / 2);
    const openingsF = bayOpenings(lw, n, lv.windowY ?? 0.9, wh, doorBay, h * 0.72);

    // 前后墙板
    for (const sz of [1, -1]) {
      const panel = archedPanel(lw, h, WALL_T, openingsF);
      panel.translate(0, floorY, sz * (ld / 2 - WALL_T / 2));
      c.add(wallBucketLv, panel);
    }
    // 两侧墙板
    const sideN = Math.max(1, Math.round(n / 2));
    const sideOpen = [];
    const sideW = d - WALL_T * 2;
    for (let i = 0; i < sideN; i++) {
      const cz = -sideW / 2 + (sideW * (i + 0.5)) / sideN;
      sideOpen.push({ x: cz, y: lv.windowY ?? 0.9, w: (sideW / sideN) * 0.5, h: wh });
    }
    for (const sx of [1, -1]) {
      const panel = archedPanel(sideW, h, WALL_T, sideOpen);
      panel.rotateY((Math.PI / 2) * sx);
      panel.translate(sx * (lw / 2 - WALL_T / 2), floorY, 0);
      c.add(wallBucketLv, panel);
    }

    // 券花窗框 + 玻璃
    const glassParts = [];
    const frameParts = [];
    for (const o of openingsF) {
      const sw = windowSurround(o.w, o.h, WALL_T * 1.25);
      sw.translate(o.x, floorY + o.y, ld / 2 - WALL_T / 2 + WALL_T * 0.2);
      c.add(trimBucket, sw);
      if (o.door) {
        // 门洞：铜雕花门 + 暗底
        const dark = boxAt(o.w - 0.3, o.h - 0.2, 0.08, o.x, floorY + o.y + (o.h - 0.2) / 2, ld / 2 - WALL_T * 0.3);
        c.add(glassBucket, dark);
        for (const sx of [-1, 1]) {
          const leafG = boxAt(o.w * 0.42, o.h * 0.86, 0.1, o.x + sx * o.w * 0.23, floorY + o.y + o.h * 0.45, ld / 2 - WALL_T * 0.1);
          c.add(metalBucket, leafG);
          const v = volute(o.w * 0.16, 0.05, 1.4);
          v.translate(o.x + sx * o.w * 0.23, floorY + o.y + o.h * 0.5, ld / 2 - WALL_T * 0.02);
          c.add(metalBucket, v);
        }
      } else {
        const g = boxAt(o.w - 0.22, o.h - 0.26, 0.06, o.x, floorY + o.y + (o.h - 0.26) / 2, ld / 2 - WALL_T / 2);
        c.add(glassBucket, g);
        // 铜窗棂：横竖格条
        for (let k = 1; k < 3; k++) {
          const m = boxAt(o.w - 0.22, 0.06, 0.09, o.x, floorY + o.y + ((o.h - 0.26) * k) / 3, ld / 2 - WALL_T / 2 + 0.02);
          frameParts.push(m);
        }
        const vm = boxAt(0.06, o.h - 0.26, 0.09, o.x, floorY + o.y + (o.h - 0.26) / 2, ld / 2 - WALL_T / 2 + 0.02);
        frameParts.push(vm);
      }
    }
    c.addAll(metalBucket, frameParts);

    // 楼板（层间楼板，避免看穿）
    if (li > 0) {
      c.add(wallBucketLv, boxAt(lw - WALL_T, 0.3, ld - WALL_T, 0, floorY - 0.15, 0));
    }

    // 檐柱（番花石柱）
    if (lv.columns !== false) {
      const colH = h - 0.4;
      for (let i = 0; i <= n; i++) {
        const x = -lw / 2 + bay * i;
        for (const sz of [1, -1]) {
          const col = carvedColumn(colH, 0.4, lv.carved !== false);
          col.translate(x, floorY, sz * (ld / 2 + 0.32));
          c.add(lv.columnBucket || columnBucket, col);
        }
      }
    }

    // 斗栱（檐下可见）：每根柱头挑一攒，朝内外各挑一跳
    if (lv.dougong !== false) {
      const dgScale = lv.dougongScale ?? 0.92;
      const unitX = buildDougongSet(dgScale, 'x');
      const unitZ = buildDougongSet(dgScale, 'z');
      const dgY = floorY + h - 0.42 - 1.3 * dgScale;
      const place = (unit, px, pz, flip) => {
        for (const s2 of [1, -1]) {
          const g = unit.clone();
          if (s2 < 0) {
            if (flip) g.rotateY(Math.PI);
            else g.scale(-1, 1, 1);
          }
          g.translate(px, dgY, pz);
          c.add('dougong', g);
        }
      };
      for (let i = 0; i <= n; i++) {
        const x = -lw / 2 + bay * i;
        for (const sz of [1, -1]) place(unitX, x, sz * (ld / 2 + 0.32), sz < 0);
      }
      const sideN = Math.max(1, Math.round(n / 2));
      for (const sx of [1, -1]) {
        for (let j = 0; j <= sideN; j++) {
          const cz = -ld / 2 + (ld * j) / sideN;
          place(unitZ, sx * (lw / 2 + 0.32), cz, sx < 0);
        }
      }
      unitX.dispose();
      unitZ.dispose();
    }

    // 檐部线脚
    if (lv.cornice !== false) {
      const cy = floorY + h - 0.42;
      for (const sz of [1, -1]) {
        const cm = cornice(lw + 1.0, 0.9, 0.42, 0);
        cm.translate(0, cy, sz * (ld / 2 + 0.2));
        c.add(trimBucket, cm);
      }
      for (const sx of [1, -1]) {
        const cm = cornice(ld + 0.6, 0.9, 0.42, 0);
        cm.rotateY(Math.PI / 2);
        cm.translate(sx * (lw / 2 + 0.2), cy, 0);
        c.add(trimBucket, cm);
      }
    }

    floorY += h;
  });

  /* ------------------------------------------------------------ 屋面 */
  const roofs = roof ? (Array.isArray(roof) ? roof : [roof]) : [];
  for (const rf of roofs) {
    const r = buildRoof({
      width: rf.width ?? w,
      depth: rf.depth ?? d,
      eaveY: rf.eaveY ?? floorY,
      rise: rf.rise ?? Math.max(1.6, (rf.width ?? w) * 0.16),
      type: rf.type ?? 'wudian',
      overhang: rf.overhang ?? 1.5,
      overhangX: rf.overhangX ?? 1.2,
      hipRunX: rf.hipRunX ?? Math.max(2.4, (rf.depth ?? d) * 0.26),
      upturn: rf.upturn ?? 0.9,
      bulge: rf.bulge ?? 0.5,
      segments: rf.segments ?? 1,
      doubleEave: !!rf.doubleEave,
      lowerRise: rf.lowerRise,
    });
    const tileBucket = `tile-${rf.tile ?? 'hui'}`;
    const ridgeBucket = `tile-${rf.ridge ?? rf.tile ?? 'hui'}`;
    for (const [key, list] of r.geoms) {
      let bucket = key;
      if (key === 'tile') bucket = tileBucket;
      else if (key === 'ridge') bucket = ridgeBucket;
      else if (key === 'finial') bucket = rf.finialBucket ?? tileBucket;
      else if (key === 'wall') bucket = rf.wallBucket ?? wallBucket;
      else if (key === 'shanhua') bucket = 'paint';
      else if (key === 'eave' || key === 'wood') bucket = 'wood';
      c.addAll(bucket, list);
    }
    // 屋脊番草卷云（远瀛观、谐奇趣）
    if (rf.ridgeScroll) {
      const rw = (rf.width ?? w) / 2 + (rf.overhang ?? 1.5);
      const rd = (rf.depth ?? d) / 2 + (rf.overhang ?? 1.5);
      const xh = Math.max(0, rw - rd);
      const y = (rf.eaveY ?? floorY) + (rf.rise ?? 3) + 0.22;
      const n = Math.max(3, Math.round((xh * 2) / 3.2));
      for (let i = 0; i <= n; i++) {
        const x = -xh + (xh * 2 * i) / n;
        const v = volute(0.62, 0.13, 1.5);
        v.rotateY(Math.PI / 2);
        v.translate(x, y, 0);
        c.add(ridgeBucket, v);
      }
      for (const sx of [-1, 1]) {
        const v = volute(0.72, 0.14, 1.6);
        v.rotateY(Math.PI / 2);
        v.translate(sx * xh, y + 0.12, 0);
        c.add(ridgeBucket, v);
      }
    }
    // 垂脊四角的翻尾石鱼（海晏堂）
    if (rf.hipFish) {
      const rw = (rf.width ?? w) / 2 + (rf.overhang ?? 1.5);
      const rd = (rf.depth ?? d) / 2 + (rf.overhang ?? 1.5);
      const ey = (rf.eaveY ?? floorY) + 0.45;
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const fish = rf.hipFish(sx, sz);
          fish.rotateY(Math.atan2(sx * rw, sz * rd) + Math.PI);
          fish.translate(sx * (rw - 0.6), ey, sz * (rd - 0.6));
          c.add(rf.hipFishBucket ?? 'stone', fish);
        }
      }
    }
  }

  return { topY: floorY };
}

/**
 * 汉白玉"五楹二十五间"体量（远瀛观）：主楼五开间，前后各出廊，
 * 共二十五间。
 */
export function marbleMainHall(c, opts) {
  const {
    w,
    d,
    h,
    mian = 5,
    baseY = 0,
    windowH = null,
    eaveY = null,
  } = opts;
  const wh = windowH ?? h * 0.4;
  const bay = w / mian;

  // 前后墙板
  for (const sz of [1, -1]) {
    const panel = archedPanel(w, h, WALL_T, bayOpenings(w, mian, 1.0, wh, Math.floor(mian / 2), h * 0.74));
    panel.translate(0, baseY, sz * (d / 2 - WALL_T / 2));
    c.add('stone', panel);
  }
  // 两侧墙板
  const sideW = d - WALL_T * 2;
  const sideOpen = [];
  for (let i = 0; i < 3; i++) {
    sideOpen.push({
      x: -sideW / 2 + (sideW * (i + 0.5)) / 3,
      y: 1.0,
      w: (sideW / 3) * 0.5,
      h: wh,
    });
  }
  for (const sx of [1, -1]) {
    const panel = archedPanel(sideW, h, WALL_T, sideOpen);
    panel.rotateY((Math.PI / 2) * sx);
    panel.translate(sx * (w / 2 - WALL_T / 2), baseY, 0);
    c.add('stone', panel);
  }
  // 出廊（前后各出一步廊）：柱 + 额枋
  for (const sz of [1, -1]) {
    for (let i = 0; i <= mian; i++) {
      const x = -w / 2 + bay * i;
      const col = cyl(0.26, 0.28, h * 0.92, 10);
      col.translate(x, baseY + h * 0.46, sz * (d / 2 + 1.7));
      c.add('stone', col);
    }
    const beam = boxAt(w + 1.2, 0.55, 0.42, 0, baseY + h * 0.94, sz * (d / 2 + 1.7));
    c.add('stone', beam);
  }
  return { bay };
}
