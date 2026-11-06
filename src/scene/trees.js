/**
 * 树木
 *
 * 一棵树 = 递归枝干（锥形段拼接）+ 末端的树冠簇（带 alpha 的交叉面片）。
 * 每树种 4 个随机变体，用 InstancedMesh 分发，配合每实例随机
 * 旋转 / 倾角 / 缩放，避免"一片相同的锥体"的观感。
 *
 * 树冠贴图按树种分别程序化生成：
 *   松   针叶束（细密针簇）
 *   柳   下垂柳条
 *   桃   团簇花（粉白）
 *   杨   细碎叶
 *   枫   掌状叶
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------ 树冠贴图 */

/** 画一个不规则叶簇（很多小叶/针束叠在一起） */
function drawCluster(g, cx, cy, r, rnd, palette, kind) {
  // 叶子数量与大小。
  //
  // ⚠ **踩过的坑（树冠像"一团乱麻"）**：
  // 原来单叶长度只有 `r * 0.05~0.1`（簇半径的 5~10%），
  // 一簇只画 330 片 —— 整张 512px 贴图的**覆盖面积不到 5%**，
  // alpha 均值只有 4~23（几乎全透明）。
  // 叠到树上就是：只看得见几根稀疏的线，透光、透背景，完全不像叶。
  //
  // 正确做法（两条一起改，缺一不可）：
  //   1. 数量按**目标覆盖率**反算 —— 覆盖率不够就加叶子
  //   2. 单叶尺寸按**真实叶长**定 —— 不能为了覆盖率把叶画成手掌大
  //
  // 叶长与卡片尺寸的关系：树冠卡片世界尺度约 1.7m，
  // 512px 贴图上 1px ≈ 3.3mm，所以单叶**全** 40px ≈ 13cm。
  // 单叶面积 ≈ π·s·0.62s ≈ 1.95s²（s 为半长）。
  const LEAF_LEN_PX = 20; // 单叶半长（px）
  const leafArea = Math.PI * LEAF_LEN_PX * LEAF_LEN_PX * 0.62;
  // 目标覆盖率 0.74。
  //
  // ⚠ 原来取 0.92（"密到不透光"）—— 于是每一簇都是**实心的绿块**，
  //   整棵树冠远看是一坨"生菜"，近看是几团塑料。
  // ⚠ 但也不能靠**减少簇数**来透气：簇一少，整棵树冠就稀疏得露骨架。
  // 正确解是让**簇本身半透**：簇内留 15% 缝隙 ⇒ 能看见枝条穿插，
  // 而簇的数量与分布照旧 ⇒ 树冠既厚实又有呼吸。
  // ⚠ 覆盖率不是随手定的：用 `?leaf=1` 探针量树冠贴图的 alpha 均值，
  //   目标 **35~55**（透光但饱满）；低于 25 就是稀疏的藤蔓，高于 70 就是实心绿块。
  const targetCover = 0.85;
  // ⚠ **下限必须够高**，否则覆盖率公式算出来的小数会被下限压住，
  //   贴图实际覆盖率远低于目标。
  //   实测（`?leaf=1` 探针量 alpha 均值）：松树只有 12.5（几乎是光杆），
  //   因为针叶画得极细、只画 900 根 ⇒ 覆盖率约 5%。
  //   针叶要**成束**才像松树 ⇒ 下限提到 3000。
  //   目标：整张贴图 alpha 均值 **28~40**
  //   （卡片边缘本来就大量透明，簇内才是 74~85%）。
  const n = Math.min(
    8000, // 上限：柳树簇半径大，按覆盖率反算能上万片 —— 会把构建拖死
    Math.max(
      kind === 'needle' ? 4200 : kind === 'flower' ? 1600 : 2400,
      Math.round((Math.PI * r * r * targetCover) / leafArea)
    )
  );

  // 外轮廓不能是**正圆**。
  //
  // ⚠ 之前叶团是一个标准圆盘，而一张卡片只显示这张贴图 ——
  // 于是每张卡片在树上就是一枚"剪出来的圆片"，远看整棵树像一叠圆饼。
  // 这里让半径随角度起伏（几瓣正弦叠加），轮廓碎开，才像一把散开的叶子。
  const lobes = [];
  const nLobe = 2 + Math.floor(rnd() * 3);
  for (let i = 0; i < nLobe; i++) {
    lobes.push({
      k: 2 + Math.floor(rnd() * 3), // 角频率
      a: 0.09 + rnd() * 0.15, // 起伏幅度
      p: rnd() * Math.PI * 2,
    });
  }
  const rAt = (ang) => {
    let k = 1;
    for (const L of lobes) k += L.a * Math.sin(L.k * ang + L.p);
    return r * k;
  };

  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    // 撒布半径：略微外扩，让叶丛填满卡片（衰减只砍最外 8%）
    // 注意 drawCluster 里没有画布尺寸 S，用簇半径 r 折算：
    // 簇半径最大到 S*0.40，所以外扩上限取 r*1.12。
    const rr = Math.pow(rnd(), 0.62) * rAt(a) * 1.12;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr * 0.86;
    const c = palette[Math.floor(rnd() * palette.length)];
    g.globalAlpha = 0.9 + rnd() * 0.1;
    g.fillStyle = c;
    if (kind === 'needle') {
      // 针叶束：一撮细线（稍长，近看能分出针）
      // 长度按**绝对像素**给：卡片 2m / 512px → 1px ≈ 4mm，
      // 松针真实 3~8cm，所以 8~20px。
      const len = r * (0.032 + rnd() * 0.062);
      const ang = rnd() * Math.PI * 2;
      g.strokeStyle = c;
      g.lineWidth = 1.6 + rnd() * 1.8;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      g.stroke();
    } else if (kind === 'flower') {
      // 五瓣花：花径 3~5cm（半长 3~6px），同样是绝对尺寸而非簇的百分比
      const s = LEAF_LEN_PX * (0.22 + rnd() * 0.2);
      g.beginPath();
      for (let p = 0; p < 5; p++) {
        const pa = (p / 5) * Math.PI * 2 + rnd() * 0.4;
        const px = x + Math.cos(pa) * s;
        const py = y + Math.sin(pa) * s;
        if (p === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      g.fill();
      if (rnd() < 0.35) {
        g.fillStyle = 'rgba(255,240,190,0.9)';
        g.beginPath();
        g.arc(x, y, s * 0.35, 0, Math.PI * 2);
        g.fill();
      }
    } else {
      // 单片叶子：带尖端的卵形，能看出叶脉。
      // 尺寸按**真实叶长**定：512px 贴图上 1px ≈ 1cm，
      // 单叶半长 8~16px ≈ 8~16cm，与真实阔叶树一致。
      // 不用簇半径的百分比 —— 簇大不代表叶大，那样会画出"手掌叶"。
      const s = LEAF_LEN_PX * (0.68 + rnd() * 0.64);
      const ang = rnd() * Math.PI * 2;
      g.save();
      g.translate(x, y);
      g.rotate(ang);
      g.beginPath();
      g.moveTo(-s, 0);
      g.quadraticCurveTo(0, -s * 0.62, s, 0);
      g.quadraticCurveTo(0, s * 0.62, -s, 0);
      g.closePath();
      g.fill();
      // 叶脉
      g.strokeStyle = 'rgba(30,44,24,0.4)';
      g.lineWidth = Math.max(0.8, s * 0.075);
      g.beginPath();
      g.moveTo(-s * 0.9, 0);
      g.lineTo(s * 0.9, 0);
      g.stroke();
      g.restore();
    }
  }
  g.globalAlpha = 1;
}

// 树冠贴图里叶团的位置与半径。
//
// ⚠ 簇半径是**叶团占画布的比例**，直接决定"卡片上看得见多大一片叶子"。
// 原来簇半径只有 0.30~0.42，叶团缩在画布中央 —— 一张 2m 的卡片上
// 真正看得见的只有 0.9m 的一坨，远看就是"一叠剪纸圆饼"。
// 现在簇半径放大到 0.32~0.38（叶团横跨画布 64~76%），
// 加上 drawCluster 里随角度起伏的轮廓，整团不再是圆饼。
const SPECIES_TEX = {
  pine: {
    kind: 'needle',
    palette: ['#2c4a33', '#3a5c40', '#25402c', '#456b4a'],
    // 松冠分作数团（塔形），不并成一团
    // ⚠ **小簇多簇**，不是一个巨簇。
    //   原来 r = 0.34（贴图归一化）⇒ 簇直径 = 0.68 × 2.2m 卡片 = **1.5m** ——
    //   一"簇"叶子 1.5m 大，贴到树上就是几团大叶子，不是树冠。
    //   现在每簇直径 ≈ 0.6m，散布满卡片 ⇒ 看着是**很多小叶团**。
    //   叶片总面积不变（n 按覆盖率反算）⇒ 生成时间与面数不变。
    // ⚠ 簇与簇之间要**留得出缝**。
    //   簇散得太密 ⇒ 远看成"一坨实心的绿团"，
    //   近看像一把生菜；真实的针叶/阔叶树冠能看见簇与簇之间的空当。
    clusters: [
      { x: 0.26, y: 0.28, r: 0.14 },
      { x: 0.70, y: 0.30, r: 0.13 },
      { x: 0.46, y: 0.46, r: 0.15 },
      { x: 0.18, y: 0.58, r: 0.12 },
      { x: 0.80, y: 0.58, r: 0.13 },
      { x: 0.40, y: 0.76, r: 0.12 },
      { x: 0.62, y: 0.72, r: 0.11 },
    ],
  },
  willow: {
    kind: 'leaf',
    palette: ['#5d7a3f', '#6d8b4b', '#4e6a35', '#7d9955'],
    // 叶团压在上部，垂丝从叶团里挂下来
    // 柳：下垂细条为主，上部散几小簇（同样不能是一个大团）
    clusters: [
      { x: 0.38, y: 0.26, r: 0.13 },
      { x: 0.62, y: 0.30, r: 0.12 },
      { x: 0.50, y: 0.15, r: 0.11 },
    ],
    strands: true,
  },
  blossom: {
    kind: 'flower',
    palette: ['#e8a8bd', '#f0c0cf', '#d98aa4', '#f6d5de'],
    clusters: [
      { x: 0.28, y: 0.32, r: 0.12 },
      { x: 0.64, y: 0.38, r: 0.11 },
      { x: 0.45, y: 0.54, r: 0.12 },
      { x: 0.78, y: 0.64, r: 0.10 },
      { x: 0.26, y: 0.68, r: 0.10 },
      { x: 0.50, y: 0.80, r: 0.09 },
    ],
    leaves: ['#6d8b4b', '#5d7a3f'],
  },
  poplar: {
    kind: 'leaf',
    palette: ['#5b7a42', '#6a8a4e', '#4e6a35', '#75935a'],
    // 白杨：窄高，簇要小而多
    clusters: [
      { x: 0.42, y: 0.20, r: 0.12 },
      { x: 0.60, y: 0.38, r: 0.13 },
      { x: 0.38, y: 0.54, r: 0.12 },
      { x: 0.62, y: 0.70, r: 0.12 },
      { x: 0.48, y: 0.85, r: 0.10 },
    ],
  },
  maple: {
    kind: 'leaf',
    palette: ['#9c6238', '#b5743f', '#8a5330', '#c68a4e'],
    // 枫：散开的小簇
    clusters: [
      { x: 0.26, y: 0.30, r: 0.12 },
      { x: 0.70, y: 0.28, r: 0.11 },
      { x: 0.46, y: 0.46, r: 0.13 },
      { x: 0.22, y: 0.60, r: 0.10 },
      { x: 0.78, y: 0.58, r: 0.11 },
      { x: 0.38, y: 0.74, r: 0.10 },
      { x: 0.64, y: 0.76, r: 0.10 },
    ],
  },
};

function makeFoliageTexture(species, seed) {
  // 512px：树冠卡片在世界尺度上约 4~6m，512px ≈ 1cm/px，
  // 单叶画到 10~20cm 才是真的叶子；256px 时一片叶有半米，近景就成了"草束"。
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const rnd = mulberry32(seed);
  const spec = SPECIES_TEX[species] || SPECIES_TEX.maple;

  if (spec.strands) {
    // 柳：上部一团叶，下垂细条（不能只是直棍，要软、要密）
    drawCluster(
      g,
      S * 0.5,
      S * 0.32,
      S * 0.3,
      rnd,
      spec.palette,
      'leaf'
    );
    // ⚠ 柳条的**数量**也要够：520 条垂丝铺不满 512px 的树冠，
    // 柳树因此看着稀疏透光。加密到 900 条。
    for (let i = 0; i < 900; i++) {
      const x = S * 0.12 + rnd() * S * 0.76;
      const y0 = S * (0.18 + rnd() * 0.32);
      // 垂条长度收短：原来最长 S*0.76（占画布 3/4），柳树成了"绿帘子"。
      // 真实柳条垂 30~80cm，512px 上 ≈ S*0.12~0.30。
      const len = S * (0.12 + rnd() * 0.2);
      const sway = (rnd() - 0.5) * 38;
      g.strokeStyle = spec.palette[Math.floor(rnd() * spec.palette.length)];
      g.globalAlpha = 0.55 + rnd() * 0.42;
      // ⚠ 原来 lineWidth 只有 0.5~1.4px —— 512px 贴图上细到几乎看不见，
      // 柳树因此只剩几根飘丝。加密到 1.6~3.4px 才成"柳条"。
      g.lineWidth = 1.6 + rnd() * 1.8;
      g.beginPath();
      g.moveTo(x, y0);
      g.bezierCurveTo(
        x + sway * 0.3,
        y0 + len * 0.35,
        x + sway * 0.8,
        y0 + len * 0.7,
        x + sway,
        y0 + len
      );
      g.stroke();
      // 柳叶点缀：每条垂枝上挂若干小叶，柳条才不是光杆
      const leaves = 6 + Math.floor(rnd() * 9);
      for (let k = 0; k < leaves; k++) {
        const t = 0.25 + (k / leaves) * 0.72 + rnd() * 0.08;
        g.globalAlpha = 0.72 + rnd() * 0.28;
        g.fillStyle = spec.palette[Math.floor(rnd() * spec.palette.length)];
        g.save();
        g.translate(x + sway * t, y0 + len * t);
        g.rotate((rnd() - 0.5) * 1.2 + Math.PI * 0.15);
        g.beginPath();
        // 柳叶长 5~10cm：512px 贴图上 ≈ 11~21px（全长），半长 5~10px
        g.ellipse(0, 0, 5.4 + rnd() * 5.2, 1.9 + rnd() * 2.4, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
    }
    g.globalAlpha = 1;
    return finishTex(c);
  }

  for (const cl of spec.clusters) {
    drawCluster(g, cl.x * S, cl.y * S, cl.r * S, rnd, spec.palette, spec.kind);
  }
  if (spec.leaves) {
    // 花树里掺些绿叶，不至于整团都是粉
    for (let i = 0; i < 220; i++) {
      const a = rnd() * Math.PI * 2;
      const rr = Math.pow(rnd(), 0.5) * S * 0.44;
      const x = S * 0.5 + Math.cos(a) * rr;
      const y = S * 0.5 + Math.sin(a) * rr * 0.86;
      g.globalAlpha = 0.55 + rnd() * 0.4;
      g.fillStyle = spec.leaves[Math.floor(rnd() * spec.leaves.length)];
      g.save();
      g.translate(x, y);
      g.rotate(rnd() * Math.PI * 2);
      g.beginPath();
      // 桃叶长 10~15cm：512px 贴图上 ≈ 25px（半长 13px）
      g.ellipse(0, 0, S * 0.026, S * 0.014, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    g.globalAlpha = 1;
  }
  return finishTex(c);
}

/**
 * 边缘径向透明衰减：否则卡片边界会切出一条硬直边，
 * 近看就是"方形贴图"。
 */
function applyEdgeFalloff(c) {
  const S = c.width;
  const g = c.getContext('2d');
  // 直接重写 **alpha 通道**，RGB 一律不动。
  //
  // 两个坑（都踩过）：
  // ① 用 `destination-in` + 黑色渐变做衰减：黑色会参与运算，
  //    把叶子的颜色也乘黑，越靠边越脏。必须只动 alpha。
  // ② 衰减曲线中间留一段 alpha=1 的实心区：叶片画得满时，
  //    中心区成了一块**不透明方片**，alphaTest 裁不掉——
  //    远看是一块白卡片糊在屋面前，边缘还带一圈锯齿状绿噪点。
  //
  // 现在：alpha 全程平滑衰减（中心 0.92 → 边 0），四周自然透明，
  // 不会切出硬边。
  const img = g.getImageData(0, 0, S, S);
  const d = img.data;
  const cx = S / 2;
  const cy = S / 2;
  const maxR = S * 0.5;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      if (d[i + 3] === 0) continue;
      const dx = (x - cx) / maxR;
      const dy = (y - cy) / maxR;
      const r = Math.sqrt(dx * dx + dy * dy);
      // 衰减只作用在**贴图最外圈**（r > 0.42）。
      //
      // ⚠ 之前是 r>0.22 就开始衰减，而叶片撒在半径 0.3×S 的圆里 ——
      // 外圈的叶子正好落在衰减最强的区域，被砍掉一大半。
      // 近处看树就是"几根光杆 + 一点点叶"，远看才成团。
      //
      // 现在：r ≤ 0.42 全实心（0.97），最外 16% 平滑归零。
      // 卡片边缘不会切出硬直边，但叶丛完整保留。
      let f;
      if (r <= 0.42) f = 0.97;
      else if (r >= 0.5) f = 0;
      else {
        const t = (r - 0.42) / (0.5 - 0.42);
        f = 0.97 * (1 - t) * (1 - t) * (1 + 2 * t); // smoothstep 反向
      }
      d[i + 3] = Math.round(d[i + 3] * f);
    }
  }
  g.putImageData(img, 0, 0);
}

function finishTex(c) {
  applyEdgeFalloff(c);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/* --------------------------------------------------------- 枝干生成 */

/** 从一段锥形枝干长出一棵小树的分枝系统 */
function growBranches(opts) {
  const {
    rnd,
    origin,
    dir,
    len,
    rad,
    depth,
    maxDepth,
    spread,
    out,
    foliageOut,
    crownR,
    aspect,
    crownCfg,
    species,
  } = opts;

  const end = origin.clone().addScaledVector(dir, len);
  const seg = new THREE.CylinderGeometry(rad * 0.72, rad, len, 4, 1);
  // 把圆柱对齐到 origin→end
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.clone().normalize()
  );
  const m = new THREE.Matrix4().compose(
    origin.clone().addScaledVector(dir, len * 0.5),
    q,
    new THREE.Vector3(1, 1, 1)
  );
  seg.applyMatrix4(m);
  out.push(seg);

  if (depth >= maxDepth) {
    // 末端挂一簇树冠（内芯 + 外壳，见 crownCluster）。
    //
    // 旧做法是"4 张大卡叠在枝端"：每张卡又是 6 片同心的面片，
    // 等于在一个点上糊了几十张**共面的大平板** ——
    // 侧影是一个剪出来的圆饼，整冠受光均匀，一眼看穿是贴图。
    crownCluster(end, crownR, aspect, crownCfg, rnd, foliageOut);
    return;
  }

  const n = 2 + (rnd() < 0.45 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const az = rnd() * Math.PI * 2;
    const tilt = spread * (0.55 + rnd() * 0.9);
    const nd = dir
      .clone()
      .applyAxisAngle(new THREE.Vector3(Math.cos(az), 0, Math.sin(az)), tilt)
      .normalize();
    nd.y = Math.max(nd.y, -0.25);
    nd.normalize();
    growBranches({
      ...opts,
      origin: end,
      dir: nd,
      len: len * (0.58 + rnd() * 0.2),
      rad: rad * (0.68 + rnd() * 0.15),
      depth: depth + 1,
    });
  }
}

/* ------------------------------------------------------- 树冠几何 */

/**
 * 球面上均匀取一个方向。
 *
 * 树冠卡片法线用它取 —— 只在一个圆盘里取方向，整冠就是"一块板"，
 * 近看全是同一个高光；铺满整个球面，每片叶子的受光才各不相同。
 */
function sphereDir(rnd) {
  const z = rnd() * 2 - 1;
  const a = rnd() * Math.PI * 2;
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  return new THREE.Vector3(r * Math.cos(a), z, r * Math.sin(a));
}

/**
 * 一张**带弧度**的树冠卡片。
 *
 * 为什么不直接用 PlaneGeometry：
 *   平卡片在整簇里会连成一整块硬边板 —— 远看像剪纸，近看是一张平板。
 *   沿横向弯一点（柱面弧 z = x²/2R）之后：
 *     · 同一张卡上有几个不同法线，高光沿卡面扫过去；
 *     · 卡的侧影不再是直的，边缘碎得开；
 *     · 卡片侧对镜头时还有一个斜面接着，不会整片消失。
 *
 * 段数只给 3（6 三角面）—— 卡片数以万计，段数是这里最敏感的乘数。
 */
function bowCard(w, h, rArc, segs = 3) {
  const nx = segs + 1;
  const pos = [];
  const uv = [];
  const idx = [];
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < nx; i++) {
      const u = i / segs;
      const x = (u - 0.5) * w;
      // 柱面弧：中间鼓、两端落，整体沿法线方向鼓出
      const z = (x * x) / (2 * rArc) - (w * w) / (8 * rArc);
      pos.push(x, (j - 0.5) * h, z);
      uv.push(u, j);
    }
  }
  for (let i = 0; i < segs; i++) {
    const a = i;
    const b = i + 1;
    idx.push(a, b, a + nx, b, b + nx, a + nx);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * 把一张卡片摆到指定位置、绕指定法线。
 * 卡片自身的平面法线对齐 normal，再绕 normal 随机自转（叶序不重样）。
 */
function orientedCard(pos, normal, size, rnd, rArc, segs = 3) {
  const w = size * (0.82 + rnd() * 0.42);
  const h = w * (0.7 + rnd() * 0.55);
  const g = bowCard(w, h, Math.max(0.3, rArc * (0.8 + rnd() * 0.5)), segs);
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    normal
  );
  // 绕法线自转：同一簇里叶序也要错开
  const spin = new THREE.Quaternion().setFromAxisAngle(normal, rnd() * Math.PI * 2);
  q.premultiply(spin);
  g.applyQuaternion(q);
  g.translate(pos.x, pos.y, pos.z);
  return g;
}

/**
 * 一簇树冠：**内芯 + 外壳**。
 *
 * 旧做法是"4 张大卡叠在枝端"，等于在一堆点上糊了几十张大平板：
 *   · 簇内没有纵深 → 侧面看是一张剪纸；
 *   · 中间是空的 → 阳光一打就是一颗气泡；
 *   · 卡片太大 → 近景能看到整块平板的边界。
 *
 * 现在分成两层：
 *   外壳 shell —— 半径带随机起伏的球面层，侧影碎、不规则；
 *   内芯 core  —— 半径小的密集层，把中间填实，不透光。
 * 每张卡片的法线在整个球面上取（sphereDir），不再是一个圆盘，
 * 所以同一簇里不同卡片的受光完全不同，整冠不再是一个调子。
 */
function crownCluster(center, R, aspect, cfg, rnd, out) {
  // ---- 外壳：破边
  for (let i = 0; i < cfg.shell; i++) {
    const d = sphereDir(rnd);
    const rr = R * (0.62 + rnd() * 0.62);
    const p = new THREE.Vector3(
      center.x + d.x * rr,
      center.y + d.y * rr * aspect,
      center.z + d.z * rr
    );
    // 法线：整球面随机 + 一点朝外偏置（外壳那一片要"朝着外长"）
    const radial = new THREE.Vector3(d.x, d.y * aspect, d.z).normalize();
    const n = sphereDir(rnd).addScaledVector(radial, 0.5).normalize();
    out.push(orientedCard(p, n, cfg.card * (0.85 + rnd() * 0.4), rnd, cfg.arc));
  }
  // ---- 内芯：填实中间，不让树冠透光 ----
  //
  // 内芯卡片只透过缝隙露出一点，**用平面（1 段 = 2 三角面）**即可 ——
  // 给它做弧度是白费三角面。卡片数以万计时，这个乘数很敏感。
  for (let i = 0; i < cfg.core; i++) {
    const d = sphereDir(rnd);
    const rr = R * 0.45 * Math.cbrt(rnd());
    const p = new THREE.Vector3(
      center.x + d.x * rr,
      center.y + d.y * rr * aspect,
      center.z + d.z * rr
    );
    out.push(
      orientedCard(p, sphereDir(rnd), cfg.card * (0.75 + rnd() * 0.25), rnd, cfg.arc * 0.8, 1)
    );
  }
}

/* -------------------------------------------------------- 树种参数 */

/**
 * 树冠参数 `crown`：
 *   r      —— 冠半径区间（m），外壳球壳的半径
 *   aspect —— 竖向压扁/拉长系数（松冠扁、白杨高）
 *   shell  —— 外壳卡片数（破边的那层）
 *   core   —— 内芯卡片数（填实中间的那层）
 *   card   —— 卡片宽度（m）。512px 贴图铺在 2m 上 → 1px ≈ 4mm，
 *             单叶全长 30px ≈ 12cm（真实阔叶的量级）
 *   arc    —— 卡片柱面弧的半径（m）。越小弯得越狠，卡面高光越明显
 */
const SPECIES = {
  pine: {
    trunkH: [3.2, 5.0],
    trunkR: 0.22,
    lean: 0.22,
    maxDepth: 1,
    branches: [2, 3],
    spread: 1.15, // 近水平
    lenScale: 1.0,
    leaf: 1.5,
    // 松冠：扁、平顶、分层
    crown: { r: [1.5, 2.2], aspect: [0.40, 0.55], shell: 13, core: 6, card: 2.2, arc: 1.3 },
    bark: 0x4a3d2e,
  },
  willow: {
    trunkH: [3.6, 5.4],
    trunkR: 0.26,
    lean: 0.16,
    maxDepth: 1,
    branches: [3, 4],
    spread: 0.85,
    lenScale: 1.15,
    leaf: 1.9,
    // 垂柳：冠略垂、叶片细碎
    crown: { r: [1.4, 2.1], aspect: [0.62, 0.85], shell: 13, core: 6, card: 2.2, arc: 1.2 },
    bark: 0x544431,
  },
  blossom: {
    trunkH: [2.8, 4.2],
    trunkR: 0.19,
    lean: 0.18,
    maxDepth: 1,
    branches: [3, 4],
    spread: 0.95,
    lenScale: 0.9,
    leaf: 1.4,
    // 桃杏：冠矮而圆
    crown: { r: [1.2, 1.8], aspect: [0.80, 1.00], shell: 12, core: 6, card: 2.0, arc: 1.0 },
    bark: 0x4e3f30,
  },
  poplar: {
    trunkH: [6.0, 10.0],
    trunkR: 0.28,
    lean: 0.07,
    maxDepth: 2,
    branches: [2, 3],
    spread: 0.5,
    lenScale: 0.85,
    leaf: 1.1,
    // 白杨：窄高（钻天杨）
    crown: { r: [1.0, 1.6], aspect: [1.45, 1.95], shell: 12, core: 6, card: 2.0, arc: 1.0 },
    bark: 0x5c4c38,
  },
  maple: {
    trunkH: [2.8, 4.4],
    trunkR: 0.21,
    lean: 0.15,
    maxDepth: 1,
    branches: [3, 4],
    spread: 1.0,
    lenScale: 0.85,
    leaf: 1.5,
    // 枫/皂荚：冠圆而略宽
    crown: { r: [1.4, 2.1], aspect: [0.80, 1.00], shell: 13, core: 6, card: 2.2, arc: 1.2 },
    bark: 0x4b3d2f,
  },
};

/** 生成一个树种的一个变体模板 */
function buildTemplate(species, variant) {
  const spec = SPECIES[species];
  const rnd = mulberry32(0x9e3779b9 ^ (variant * 2654435761) ^ species.length * 7919);
  const trunkParts = [];
  const foliageParts = [];

  const h = spec.trunkH[0] + rnd() * (spec.trunkH[1] - spec.trunkH[0]);
  const lean = (rnd() - 0.5) * 2 * spec.lean;
  const trunkTop = new THREE.Vector3(
    lean * h * 0.5,
    h,
    (rnd() - 0.5) * spec.lean * h * 0.5
  );

  // 主干：分三段带轻微弯折
  let p0 = new THREE.Vector3(0, 0, 0);
  let p1 = new THREE.Vector3(lean * h * 0.2, h * 0.42, (rnd() - 0.5) * 0.2);
  let p2 = trunkTop;
  for (const [a, b, r0, r1] of [
    [p0, p1, spec.trunkR, spec.trunkR * 0.78],
    [p1, p2, spec.trunkR * 0.78, spec.trunkR * 0.58],
  ]) {
    const dir = b.clone().sub(a);
    const len = dir.length();
    const seg = new THREE.CylinderGeometry(r1, r0, len, 6, 1);
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.clone().normalize()
    );
    seg.applyMatrix4(
      new THREE.Matrix4().compose(
        a.clone().addScaledVector(dir, 0.5),
        q,
        new THREE.Vector3(1, 1, 1)
      )
    );
    trunkParts.push(seg);
  }

  // 主枝
  const nb = spec.branches[0] + Math.floor(rnd() * (spec.branches[1] - spec.branches[0] + 1));
  // 树冠参数：整棵树共用一套（冠是整体，不是每枝各长各的）
  const crown = spec.crown;
  const crownR = crown.r[0] + rnd() * (crown.r[1] - crown.r[0]);
  const aspect = crown.aspect[0] + rnd() * (crown.aspect[1] - crown.aspect[0]);
  const crownCfg = {
    shell: crown.shell,
    core: crown.core,
    card: crown.card,
    arc: crown.arc,
  };
  for (let i = 0; i < nb; i++) {
    const az = (i / nb) * Math.PI * 2 + rnd() * 0.9;
    const up = species === 'poplar' ? 0.45 + rnd() * 0.3 : 0.1 + rnd() * 0.45;
    const dir = new THREE.Vector3(
      Math.cos(az) * Math.cos(up),
      Math.sin(up),
      Math.sin(az) * Math.cos(up)
    ).normalize();
    growBranches({
      rnd,
      origin: p1.clone().lerp(p2, rnd() * 0.55),
      dir,
      len: h * 0.42 * spec.lenScale * (0.8 + rnd() * 0.45),
      rad: spec.trunkR * 0.5,
      depth: 0,
      maxDepth: spec.maxDepth,
      spread: spec.spread,
      out: trunkParts,
      foliageOut: foliageParts,
      crownR,
      aspect,
      crownCfg,
      species,
    });
  }

  return {
    trunk: mergeGeometries(trunkParts, false),
    foliage: mergeGeometries(foliageParts, false),
    height: h,
  };
}
/* ------------------------------------------------------------ 总装 */

export function buildTrees(sceneData, heightAt) {
  const group = new THREE.Group();
  group.name = 'trees';
  const trees = sceneData.trees || [];
  const VARIANTS = 4;

  const barkMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });

  const byType = new Map();
  for (const t of trees) {
    if (!byType.has(t.type)) byType.set(t.type, []);
    byType.get(t.type).push(t);
  }

  const templates = new Map(); // `${species}:${variant}` → {trunk, foliage}

  for (const [species, list] of byType) {
    if (!SPECIES[species]) continue;

    // 按变体分组
    const buckets = Array.from({ length: VARIANTS }, () => []);
    list.forEach((t, i) => {
      // 用坐标哈希决定变体，保证同一棵树每次构建变体一致
      const hsh =
        Math.abs(Math.round(t.x * 13 + t.z * 7 + t.seed * 0.0001)) % VARIANTS;
      buckets[hsh].push(t);
    });

    for (let v = 0; v < VARIANTS; v++) {
      const bucket = buckets[v];
      if (!bucket.length) continue;
      const key = `${species}:${v}`;
      let tpl = templates.get(key);
      if (!tpl) {
        tpl = buildTemplate(species, v);
        if (!tpl.trunk || !tpl.foliage) {
          console.warn(`树模板 ${key} 合并失败，跳过`);
          continue;
        }
        templates.set(key, tpl);
      }

      // 枝干
      const trunkMesh = new THREE.InstancedMesh(tpl.trunk, barkMat, bucket.length);
      trunkMesh.castShadow = true;
      trunkMesh.receiveShadow = true;
      // 每实例颜色微差（树皮）
      trunkMesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(bucket.length * 3),
        3
      );

      // 树冠
      const tex = makeFoliageTexture(species, 1000 + v * 97 + species.length * 13);
      const leafMat = new THREE.MeshStandardMaterial({
        map: tex,
        // alphaTest 不能太高：贴图的 alpha 是**平滑衰减**的，
        // 阈值 0.35 会把外圈的半透明叶片切成锯齿状碎点——
        // 远看就是屋檐下的一圈绿色噪点。
        // 阈值压到 0.12 + alphaToCoverage（MSAA 抗锯齿），
        // 边缘既平滑又不会碎。
        alphaTest: 0.12,
        transparent: false,
        // 用 MSAA 做 alpha 裁剪：边缘平滑，又不需要透明排序
        alphaToCoverage: true,
        side: THREE.DoubleSide,
        roughness: 0.88,
        metalness: 0,
      });
      const leafMesh = new THREE.InstancedMesh(tpl.foliage, leafMat, bucket.length);
      leafMesh.castShadow = true;
      leafMesh.receiveShadow = true;
      leafMesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(bucket.length * 3),
        3
      );

      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const qLeaf = new THREE.Quaternion();
      const pos = new THREE.Vector3();
      const scl = new THREE.Vector3();
      const eul = new THREE.Euler();
      const eulLeaf = new THREE.Euler();
      const col = new THREE.Color();
      const barkCol = new THREE.Color(SPECIES[species].bark);
      const leafTint = new THREE.Color(0xffffff);

      trunkMesh.name = `tree_${species}_${v}_trunk`;
      leafMesh.name = `tree_${species}_${v}_foliage`;

      bucket.forEach((t, i) => {
        const rnd = mulberry32(t.seed);
        const y = heightAt?.(t.x, t.z) ?? 0;
        const s = 0.72 + rnd() * 0.62;
        const yaw = rnd() * Math.PI * 2;
        const tilt = (rnd() - 0.5) * 0.18;

        eul.set(tilt, yaw, (rnd() - 0.5) * 0.16);
        q.setFromEuler(eul);

        // 树干与树冠必须用**同一套缩放**。
        //
        // 原来两者的缩放是各抽各的随机数（x/z 差 20%、y 差 25%），
        // 于是冠会从枝上飘开半米、枝又从冠里横穿出来 ——
        // 这正是"树枝看不见、冠像贴上去的"原因之一。
        // 现在统一一套，并让竖向比例逐株不同：
        // 同一树种的树也不重样（有的冠偏圆、有的偏扁）。
        const sx = s * (0.92 + rnd() * 0.18);
        const sy = s * (0.88 + rnd() * 0.26);
        const sz = s * (0.92 + rnd() * 0.18);
        scl.set(sx, sy, sz);

        pos.set(t.x, y - 0.12, t.z);
        m.compose(pos, q, scl);
        trunkMesh.setMatrixAt(i, m);

        // 树冠：同一套缩放，但多转一点点（±0.18rad）——
        // 冠不是死板地正对主干，轮廓才不重样。
        eulLeaf.set(tilt * 0.6, yaw + (rnd() - 0.5) * 0.36, (rnd() - 0.5) * 0.16);
        qLeaf.setFromEuler(eulLeaf);
        m.compose(pos, qLeaf, scl);
        leafMesh.setMatrixAt(i, m);

        // 每株色相微差，避免"复制粘贴"
        const hueShift = (rnd() - 0.5) * 0.045;
        const valShift = 0.86 + rnd() * 0.28;
        col.copy(barkCol).offsetHSL(hueShift * 0.4, 0, (rnd() - 0.5) * 0.08);
        trunkMesh.setColorAt(i, col);
        col.copy(leafTint).offsetHSL(hueShift, (rnd() - 0.5) * 0.08, (valShift - 1) * 0.4);
        leafMesh.setColorAt(i, col);
      });

      trunkMesh.instanceMatrix.needsUpdate = true;
      leafMesh.instanceMatrix.needsUpdate = true;
      if (trunkMesh.instanceColor) trunkMesh.instanceColor.needsUpdate = true;
      if (leafMesh.instanceColor) leafMesh.instanceColor.needsUpdate = true;

      group.add(trunkMesh, leafMesh);
    }
  }

  return group;
}
