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
  archedPane,
  windowSurround,
  frenchMuntins,
  falsePediment,
  cornice,
  pilaster,
  columnCapital,
  acanthusBand,
  balustrade,
  steps,
  volute,
  leaf,
} from './kit.js';

const WALL_T = 0.62;

/**
 * 汉白玉番花柱：柱身 + 覆盆础 + **西洋柱头** + 环身番花浮雕。
 *
 * 考据：谐奇趣「楼柱用汉白玉**深雕**西洋番花番草花纹」；
 *       海晏堂「立柱为汉白玉精刻西洋番花石柱」。
 *
 * ⚠ 2026-10-31 验收改（两处）：
 *  ① **浮雕原来是"鱼鳍"** —— 叶长取 `shaftH * 0.22`（5 m 柱上就是 1.15 m 的叶片），
 *     切向贴在半径 0.4 m 的柱身上，梢端离柱面近 1 m，远看柱子上插了一圈刀片。
 *     现在叶片缩到 ≈ 1.05 r，并绕柱面成圈密排，梢端只离柱面 ~0.05 m，
 *     读作"深雕番花"而不是"插着的鳍"。
 *  ② **柱头是中式车削的覆盆顶**，不是西洋柱式 —— 柱头是西洋立面最认得出的元素，
 *     现在换成 `kit.columnCapital`（颈线脚 + 圆转 + 番花叶 + 卷涡 + 顶板）。
 */
export function carvedColumn(h, r = 0.42, relief = true) {
  const parts = [];
  const BASE_H = 0.3; // 柱础（覆盆）高
  const CAP_H = Math.max(0.36, r * 1.15); // 西洋柱头高
  const shaftH = Math.max(0.6, h - BASE_H - CAP_H);
  const rTop = r * 0.88;

  // 柱身（带收分）
  const shaft = cyl(rTop, r, shaftH, 12);
  shaft.translate(0, BASE_H + shaftH / 2, 0);
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
      prof.map(([t, rs]) => new THREE.Vector2(r * rs, t * BASE_H)),
      12
    )
  );
  // 柱础顶的一道方线脚
  parts.push(boxAt(r * 1.66, 0.05, r * 1.66, 0, BASE_H - 0.02, 0));

  // **柱头**：西洋柱式
  const cap = columnCapital(rTop, { h: CAP_H, order: 'composite' });
  cap.translate(0, BASE_H + shaftH, 0);
  parts.push(cap);

  if (relief) {
    // 柱身三圈番花（叶 + 卷涡 + 界格线脚）
    for (const bt of [0.26, 0.52, 0.78]) {
      const y = BASE_H + shaftH * bt;
      const rr = rTop + (r - rTop) * (1 - bt); // 该高度处的柱身半径
      // 界格：一圈凸起的线脚，给浮雕分出"横带"
      const ringY = y - r * 0.62;
      const ringFrac = Math.max(0, Math.min(1, (ringY - BASE_H) / shaftH));
      const rrRing = rTop + (r - rTop) * (1 - ringFrac);
      parts.push(torus(rrRing + 0.005, 0.028, 5, 12).rotateX(Math.PI / 2).translate(0, ringY, 0));
      // 六片番花叶（密排成圈，梢端只微微离柱面）
      const n = 6;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + bt * 1.3;
        const lf = leaf(r * 1.05, r * 0.58, 0.055);
        lf.rotateZ(Math.PI / 2); // 叶长转为切向
        lf.rotateY(a); // 法线转为径向（朝外）
        lf.translate(Math.sin(a) * (rr - 0.02), y, Math.cos(a) * (rr - 0.02));
        parts.push(lf);
      }
      // 两枚卷涡（夹在叶之间）
      for (let i = 0; i < 2; i++) {
        const a = (i / 2) * Math.PI * 2 + Math.PI / n + bt * 1.3;
        const v = volute(r * 0.58, 0.055, 1.45, 22);
        v.rotateY(a);
        v.translate(Math.sin(a) * (rr - 0.03), y + r * 0.18, Math.cos(a) * (rr - 0.03));
        parts.push(v);
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

    // 券花窗框 + 玻璃（**四个立面都做**——只做正面的背面是空的洞，
    // 从侧后方看就是一片破面）
    const frameParts = [];
    const metalMirror = [];

    /**
     * 立面开窗：券花窗套 + 玻璃 + 法式铜棂。
     *
     * ⚠ 深度关系原来做错了（2026-10-30 验收发现）：
     *   玻璃被放在**墙外皮之外**（浮在墙面前面的一块平板），
     *   而铜棂落在玻璃**后面** —— 玻璃材质是不透明的，等于把"法式铜窗"的棂条
     *   全部遮住，每个窗洞只剩一块蓝灰色板子，近看根本不是窗。
     * 现在改成：墙外皮 ─┬─ 铜棂（退进 0.05 m，最靠外，在洞口里看得见）
     *                 └─ 玻璃（退进 0.12 m，在棂条之后）
     *
     * @param o    洞口 {x,y,w,h,door}
     * @param face 墙外皮坐标（带符号：正面 +ld/2，背面 -ld/2，侧墙 ±lw/2）
     * @param out  外法线方向（+1 / -1）
     * @param yaw  墙面朝向（0 / π / ±π/2）
     */
    const addWindow = (o, face, out, yaw) => {
      const sw = windowSurround(o.w, o.h, WALL_T * 1.25);
      if (yaw) sw.rotateY(yaw);
      sw.translate(o.x, floorY + o.y, face - out * 0.186);
      c.add(trimBucket, sw);
      if (o.door) {
        // 门洞：铜雕花门 + 暗底（暗底退到墙里，铜门扇在暗底之前）
        const dark = box(o.w - 0.3, o.h - 0.2, 0.08);
        if (yaw) dark.rotateY(yaw);
        dark.translate(o.x, floorY + o.y + (o.h - 0.2) / 2, face - out * 0.3);
        c.add(glassBucket, dark);
        for (const sx of [-1, 1]) {
          const leafG = box(o.w * 0.42, o.h * 0.86, 0.1);
          leafG.translate(sx * o.w * 0.23, o.h * 0.45, 0);
          if (yaw) leafG.rotateY(yaw);
          leafG.translate(o.x, floorY + o.y, face - out * 0.22);
          c.add(metalBucket, leafG);
          const v = volute(o.w * 0.16, 0.05, 1.4);
          if (yaw) v.rotateY(yaw);
          v.translate(o.x + sx * o.w * 0.23, floorY + o.y + o.h * 0.5, face - out * 0.22);
          c.add(metalBucket, v);
        }
        return;
      }
      // 玻璃：跟着券口形状走（矩形会戳进券洞两侧的墙）
      const pane = archedPane(o.w, o.h, 0.12);
      if (yaw) pane.rotateY(yaw);
      pane.translate(o.x, floorY + o.y, face - out * 0.12);
      c.add(glassBucket, pane);
      // 铜窗棂：法式铜窗是细棂条（必须排在玻璃**之前**，否则被遮住）
      const mt = frenchMuntins(o.w, o.h, 0.09);
      if (yaw) mt.rotateY(yaw);
      mt.translate(o.x, floorY + o.y, face - out * 0.05);
      frameParts.push(mt);
    };

    for (const o of openingsF) {
      addWindow(o, ld / 2, 1, 0); // 正面（朝 +Z）
      addWindow(o, -ld / 2, -1, Math.PI); // 背面（朝 -Z）
    }
    // 两侧墙的窗（洞口的局部 x 与墙板一致，旋转后自然落到 ±Z 上）
    for (const sx of [1, -1]) {
      for (const o of sideOpen) {
        addWindow(o, (sx * lw) / 2, sx, (Math.PI / 2) * sx);
      }
    }
    c.addAll(metalBucket, frameParts);

    /* ---------------------------------------------------------- 法式铜窗（海晏堂）
     * 考据：海晏堂「窗为法式铜窗，窗间立柱为大玻璃镜，镜子上方为三角式
     *       巴洛克假门楣装饰」「石券花窗口与汉白玉石柱之间墙面为五色琉璃番花」。
     */
    if (lv.french) {
      const pierW = bay - (openingsF[0]?.w ?? bay * 0.5);
      for (let i = 0; i < n - 1; i++) {
        const px = -lw / 2 + bay * (i + 1);
        for (const face of [
          { f: ld / 2, out: 1, yaw: 0 },
          { f: -ld / 2, out: -1, yaw: Math.PI },
        ]) {
          // 大玻璃镜：**贴在墙外皮上**。
          // 原先放在墙皮之内（墙皮 -0.2 m），整块镜子埋在砖里，等于没有镜子。
          const mh = h - 1.4;
          const mir = boxAt(pierW * 0.72, mh, 0.08, 0, floorY + 0.7 + mh / 2, 0);
          if (face.yaw) mir.rotateY(face.yaw);
          mir.translate(px, 0, face.f + face.out * 0.04);
          c.add(glassBucket, mir);
          // 镜框（铜）：压在镜子上下
          const fr = boxAt(pierW * 0.78, 0.1, 0.12, 0, floorY + 0.66, 0);
          const fr2 = boxAt(pierW * 0.78, 0.1, 0.12, 0, floorY + 0.74 + mh, 0);
          for (const g2 of [fr, fr2]) {
            if (face.yaw) g2.rotateY(face.yaw);
            g2.translate(px, 0, face.f + face.out * 0.09);
            metalMirror.push(g2);
          }
          // 镜子上方的三角式巴洛克假门楣：挑出墙面
          const ped = falsePediment(pierW * 0.86, Math.min(1.5, bay * 0.4), 0.26);
          if (face.yaw) ped.rotateY(face.yaw);
          ped.translate(px, floorY + 0.8 + mh, face.f + face.out * 0.13);
          c.add(trimBucket, ped);
        }
      }
      c.addAll(metalBucket, metalMirror);
      // 五色琉璃番花：券口与石柱之间的墙面
      const glazeBuckets = ['tile-hong', 'tile-lan', 'tile-keque', 'tile-lv', 'tile-wuse'];
      for (const o of openingsF) {
        for (const sx of [-1, 1]) {
          const gx = o.x + sx * (o.w / 2 + 0.36);
          for (let k = 0; k < 5; k++) {
            const lf = leaf(0.62, 0.2, 0.05);
            lf.rotateZ(sx * 0.9);
            lf.translate(gx, floorY + o.y + 0.5 + k * 0.62, ld / 2 - WALL_T / 2 + WALL_T * 0.55);
            c.add(glazeBuckets[(k + (sx > 0 ? 2 : 0)) % 5], lf);
          }
        }
      }
    }

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
      // 山花是**砖石山墙**（清式做法是抹灰墙 + 博风板 + 悬鱼），
      // 不是彩画。用和玺彩画刷上去，一大片山花看着像铺了地毯。
      else if (key === 'shanhua') bucket = rf.gableBucket ?? 'stone';
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
  // 出廊（前后各出一步廊）：柱 + 柱头 + 额枋
  for (const sz of [1, -1]) {
    for (let i = 0; i <= mian; i++) {
      const x = -w / 2 + bay * i;
      const shaftH = h * 0.92 - 0.4;
      const col = cyl(0.26, 0.28, shaftH, 10);
      col.translate(x, baseY + shaftH / 2, sz * (d / 2 + 1.7));
      c.add('stone', col);
      // **柱头**：西洋柱式（原来出廊的柱是一根光杆）
      const cap = columnCapital(0.26, { h: 0.4, order: 'composite' });
      cap.translate(x, baseY + shaftH, sz * (d / 2 + 1.7));
      c.add('stone', cap);
    }
    const beam = boxAt(w + 1.2, 0.55, 0.42, 0, baseY + h * 0.94, sz * (d / 2 + 1.7));
    c.add('stone', beam);
  }
  return { bay };
}
