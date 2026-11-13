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
  // ⚠ 单叶半长（px）。
  //   卡片从 1.3 m 缩到 0.65 m 后，贴图里的叶子要**画大一倍**，
  //   单叶的**世界尺寸**才不变（10 cm）。
  //   顺带把"叶团"的实际尺寸从 ~50 cm 降到 ~25 cm ——
  //   近景里一团 50 cm 的绿块读作"一张大叶子"，25 cm 才是"一把叶"。
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
  // ⚠⚠ 覆盖率从 0.85 压到 0.55。
  //
  //   叶团**内部**覆盖率太高 ⇒ 一张卡片就是一块**实心的绿板**：
  //   近景（3 m）时单张卡片能占掉半个屏幕，读作"一片巨大的叶子"，
  //   根本不像树冠（实测养雀笼西侧近景，整片树冠是一块实心深绿板）。
  //
  //   压到 0.55 ⇒ 叶团内部有真实的空隙 ⇒ 卡片读作"一把散开的叶子"，
  //   树冠透得出后面的枝条与天空，侧影也碎得开。
  //   密度靠**增加卡片数**补（见 SPECIES 的 shell/core）。
  //
  // ⚠⚠ 再压到 **0.33**：叶团内部要能**看见单叶之间的缝**。
  //   之前 0.55 时，近景一个叶团（25~35 cm）读作**一块实心绿板**，
  //   边缘是圆弧 ⇒ 整张卡片读作"一张 30 cm 的巨型剪纸叶子"。
  //   0.33 时叶团内部透得出后面的叶子与天，
  //   卡片才读作"一把散开的叶子"。
  //   ⚠ 代价：整冠变疏 ⇒ 靠**加卡片数**补（见 SPECIES 的 shell/core）。
  const targetCover = 0.42;
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
      // ⚠ **暗边轮廓**：每片叶子的边缘压一道暗线。
      //   没有它，几十片叶子叠在一起就是**一整块平涂的绿色**——
      //   叶子之间没有分界，读作"剪纸"而不是"叶子"。
      //   这一道描边让每片叶子从邻居里"浮"出来。
      g.strokeStyle = 'rgba(26,40,20,0.42)';
      g.lineWidth = Math.max(0.9, s * 0.085);
      g.stroke();
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

  // ---- 整簇的方向光 ----
  //
  // ⚠ 叶团画完是**平涂**的：同一簇里每片叶子亮度一样，
  //   近景读作"一张印着叶子的纸"。
  // 这里用 `source-atop` 叠一层方向光渐变 ——
  //   source-atop **只作用在已有像素上**，不改变 alpha 轮廓（剪影不变），
  //   但让叶团左上亮、右下暗 ⇒ 立刻有了体积与光向。
  //
  // 成本：每簇一次 fillRect（不是每片叶子一次），
  // 而"每片叶子一次"会多出上万次路径操作、拖慢场景构建。
  g.save();
  g.globalCompositeOperation = 'source-atop';
  const rr = r * 1.25;
  const grd = g.createLinearGradient(cx - rr, cy - rr, cx + rr, cy + rr);
  grd.addColorStop(0, 'rgba(255,255,236,0.26)');
  grd.addColorStop(0.45, 'rgba(255,255,236,0.04)');
  grd.addColorStop(0.62, 'rgba(10,26,8,0.10)');
  grd.addColorStop(1, 'rgba(8,20,6,0.34)');
  g.fillStyle = grd;
  g.fillRect(cx - rr, cy - rr * 0.9, rr * 2, rr * 1.8);
  g.restore();
  g.globalCompositeOperation = 'source-over';
}

// 树冠贴图里叶团的位置与半径。
//
// ⚠ 簇半径是**叶团占画布的比例**，直接决定"卡片上看得见多大一片叶子"。
// 原来簇半径只有 0.30~0.42，叶团缩在画布中央 —— 一张 2m 的卡片上
// 真正看得见的只有 0.9m 的一坨，远看就是"一叠剪纸圆饼"。
// 现在簇半径放大到 0.32~0.38（叶团横跨画布 64~76%），
// 加上 drawCluster 里随角度起伏的轮廓，整团不再是圆饼。

/**
 * 叶团在画布上的分布：**不规则的一簇簇**，不是规则网格、也不是一个大圆盘。
 *
 * ⚠ 规则网格 ⇒ 读作"格子"；一个大圆盘 ⇒ 读作"剪出来的圆片"。
 *   这里用「半径按幂分布 + 角度随机」撒 18 簇：
 *   中心密、外围疏 ⇒ 整体是自然衰减的团块，边缘是碎的。
 */
function clumpLayout(seed) {
  const rnd = mulberry32(seed);
  const out = [];
  for (let i = 0; i < 18; i++) {
    const a = rnd() * Math.PI * 2;
    const rr = Math.pow(rnd(), 0.55) * 0.44;
    out.push({
      x: 0.5 + Math.cos(a) * rr,
      y: 0.5 + Math.sin(a) * rr,
      r: 0.085 + rnd() * 0.055,
    });
  }
  return out;
}

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
    clusters: clumpLayout(7001),

  },
  willow: {
    kind: 'leaf',
    palette: ['#5d7a3f', '#6d8b4b', '#4e6a35', '#7d9955'],
    // 叶团压在上部，垂丝从叶团里挂下来
    // 柳：下垂细条为主，上部散几小簇（同样不能是一个大团）
    clusters: clumpLayout(7001),
    strands: true,

    strands: true,
  },
  blossom: {
    kind: 'flower',
    palette: ['#e8a8bd', '#f0c0cf', '#d98aa4', '#f6d5de'],
    clusters: clumpLayout(7001),
    leaves: ['#6d8b4b', '#5d7a3f'],

    leaves: ['#6d8b4b', '#5d7a3f'],
  },
  poplar: {
    kind: 'leaf',
    palette: ['#5b7a42', '#6a8a4e', '#4e6a35', '#75935a'],
    // 白杨：窄高，簇要小而多
    clusters: clumpLayout(7001),

  },
  maple: {
    kind: 'leaf',
    // ⚠ 原来给的是**枯棕色**（秋叶）—— 本场景是**夏日**，
    //   一树枯叶在绿树里读作"一堆棕色纸板"，比绿树假得多。
    //   圆明园的枫在夏天是绿色的（入秋才转红）。
    palette: ['#5f8038', '#719344', '#4d6d2e', '#7fa055'],
    // 枫：散开的小簇
    clusters: clumpLayout(7001),

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
    // 柳：上部散几小簇叶（**必须走 clusters 数组**），
    // 下垂细条（不能只是直棍，要软、要密）。
    //
    // ⚠ 原来这里写死 `drawCluster(g, S*0.5, S*0.32, S*0.3, ...)` ——
    //   一个**半径 0.3 的中心实心圆盘**，完全无视 species 的 clusters 配置。
    //   ⇒ 柳树的贴图永远是"一枚剪出来的圆片"，近景一眼假。
    for (const cl of spec.clusters) {
      drawCluster(g, cl.x * S, cl.y * S, cl.r * S, rnd, spec.palette, 'leaf');
    }
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
  //
  // ⚠⚠⚠ **绝对不能按半径切圆**。
  //
  //   原来：alpha 在 r ≤ 0.42 处保持 0.97、r ≥ 0.5 处归零 ——
  //   等于把每张卡片**剪成一个边缘清晰的实心圆盘**。
  //   ⇒ 树冠在近景里读作"一枚剪出来的圆片"，
  //   远看是"一串绿色圆饼"（这正是 AGENTS 记过的"剪纸圆饼"，
  //   之前只调了叶团半径，**没动这个切圆**，所以一直治标不治本）。
  //
  //   现在：**只把画布最外一圈淡掉**（防止方形硬边），
  //   卡片轮廓完全由**叶子自己的分布**决定 ⇒ 边缘是碎的、不规则的。
  //
  //   ⚠ 代价：若叶子把整个方形画满，中间会出现"不透明方片"。
  //   ⇒ 所以叶团分布也必须**留出空当**（见 clumpLayout）。
  const img = g.getImageData(0, 0, S, S);
  const d = img.data;
  const half = S * 0.5;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      if (d[i + 3] === 0) continue;
      // 到最近一条边的距离（归一，0 = 贴边，1 = 画布中心）
      const e = Math.min(x, S - 1 - x, y, S - 1 - y) / half;
      // 最外 8% 淡出
      const f = e >= 0.08 ? 0.97 : 0.97 * (e / 0.08) * (e / 0.08) * (3 - 2 * (e / 0.08));
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

/* --------------------------------------------------------- 树皮 */

/**
 * 树皮贴图：**竖向**裂纹 + 灰白斑驳。
 *
 * ⚠ 原来树干只有一块纯色（barkMat 无 map，固有色全靠 instanceColor），
 *   近景就是一根**塑料棒**。树皮的识别特征是竖向的深沟浅脊，
 *   必须按"真实米数"铺 —— 见 scaleBarkUV。
 *
 * ⚠ 底色要**接近白**：这张图是当作**细节调制**用的，
 *   颜色由 instanceColor（树种色）承担。
 *   若底色再给深棕，就变成 §4.1.2 的**双重变暗**（贴图底色 × 固有色）。
 */
function makeBarkTexture() {
  const W = 128;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const rnd = mulberry32(90210);

  // 底：接近白的灰米色
  g.fillStyle = '#e6e0d6';
  g.fillRect(0, 0, W, H);

  // 竖向深沟：树皮的骨架
  //
  // ⚠ 沟不能**通高**：原来每道都从头画到尾 ⇒ 树干读作"一捆竹竿/瓦楞纸"。
  //   真实的树皮是**断续的板块**，沟有起止。
  for (let i = 0; i < 62; i++) {
    const x = rnd() * W;
    const dark = rnd() < 0.62;
    g.strokeStyle = dark
      ? `rgba(104,90,72,${0.12 + rnd() * 0.26})`
      : `rgba(255,252,244,${0.1 + rnd() * 0.2})`;
    g.lineWidth = 0.6 + rnd() * rnd() * 4.2;
    // 每道沟只占一段高度
    const y0 = rnd() * H * 0.8;
    const y1 = y0 + H * (0.12 + rnd() * 0.45);
    g.beginPath();
    let xx = x;
    g.moveTo(xx, y0);
    for (let y = y0; y <= y1; y += 10) {
      xx += (rnd() - 0.5) * 4.5;
      g.lineTo(xx, y);
    }
    g.stroke();
  }

  // 横向短裂纹（老的树皮板片）
  for (let i = 0; i < 46; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    g.strokeStyle = `rgba(84,72,56,${0.14 + rnd() * 0.26})`;
    g.lineWidth = 0.7 + rnd() * 1.4;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (rnd() - 0.5) * 34, y + (rnd() - 0.5) * 8);
    g.stroke();
  }

  // 斑驳：明暗小色片
  for (let i = 0; i < 260; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const r = 2 + rnd() * 9;
    const dark = rnd() < 0.5;
    g.fillStyle = dark
      ? `rgba(120,106,88,${0.05 + rnd() * 0.12})`
      : `rgba(255,250,240,${0.05 + rnd() * 0.12})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** 树皮贴图一张覆盖多少米（世界尺度） */
const BARK_TILE_M = 0.5;

/**
 * 按**真实米数**重算圆柱的 UV。
 *
 * ⚠ CylinderGeometry 的 UV 是"整圈 0~1 / 整高 0~1"，
 *   贴图会被拉成"整张贴图糊满一根 10 m 高的树干"。
 *   ⇒ 按周长与长度换算成 repeat，贴图密度才有"每米几道沟"的实感。
 */
function scaleBarkUV(g, len, r) {
  const uv = g.attributes.uv;
  if (!uv) return;
  const su = (2 * Math.PI * r) / BARK_TILE_M;
  const sv = len / BARK_TILE_M;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  }
  uv.needsUpdate = true;
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
    crowns,
  } = opts;

  const end = origin.clone().addScaledVector(dir, len);
  /**
   * ⚠ 原来 `CylinderGeometry(rad*0.72, rad, len, 4, 1)` ——
   *   **四棱柱**（= 方料）且收分只有 28% ⇒ 近景就是一根**等粗的方木料**，
   *   像架起来的椽子不像树枝。
   *   改成六棱柱 + 收分到 58% ⇒ 圆一点、梢头明显变细。
   */
  const seg = new THREE.CylinderGeometry(rad * 0.58, rad, len, 6, 1);
  // 树皮按真实米数铺（见 scaleBarkUV）
  scaleBarkUV(seg, len, rad);
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
    crownCluster(end, crownR, aspect, crownCfg, rnd, foliageOut, crowns);
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
 * 一张卡片的**明暗系数**。
 *
 * ⚠ 顶点色在这里是**乘在叶片贴图上的调制量**（接近 1 的浅色），
 *   不是"叶子的真实颜色" —— 见 AGENTS.md §4.1.2 的顶点色约定。
 *
 * 为什么必须有：
 *   真实树冠是**体积** —— 外壳受天光、内芯几乎全黑、朝下的面更暗。
 *   原来所有卡片亮度一样，整冠读作"一块贴上去的绿色剪纸"，
 *   平面感正是从这里来的。
 *
 * @param {number} up    0=朝下 1=朝上（卡片法线的 y 分量映射）
 * @param {number} depth 0=冠心 1=冠缘
 * @param {boolean} isCore 是否内芯层
 */
function cardShade(up, depth, isCore) {
  const base = isCore ? 0.3 : 0.56 + 0.34 * depth;
  return Math.max(0.12, Math.min(1.05, base * (0.68 + 0.32 * up)));
}

/**
 * 把一张卡片摆到指定位置、绕指定法线。
 * 卡片自身的平面法线对齐 normal，再绕 normal 随机自转（叶序不重样）。
 *
 * @param {number} shade 明暗系数（写进顶点色）
 */
function orientedCard(pos, normal, size, rnd, rArc, segs = 3, shade = 1) {
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
  // 明暗写进顶点色（线性空间的调制量）
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = shade;
    col[i * 3 + 1] = shade;
    col[i * 3 + 2] = shade;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
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
function crownCluster(center, R, aspect, cfg, rnd, out, crowns) {
  // 记录这个叶团的位置与半径 ——
  // 近景**实体叶**（leaf-detail.js）要在同一批叶团里撒真叶，
  // 否则实体叶与 impostor 卡片会长在两个地方，冠的形状对不上。
  if (crowns) crowns.push({ p: center.clone(), R, aspect });
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
    const up = 0.5 + 0.5 * n.y;
    const depth = Math.min(1, rr / R);
    out.push(
      orientedCard(
        p,
        n,
        cfg.card * (0.85 + rnd() * 0.4),
        rnd,
        cfg.arc,
        3,
        cardShade(up, depth, false)
      )
    );
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
    const n = sphereDir(rnd);
    const up = 0.5 + 0.5 * n.y;
    out.push(
      orientedCard(
        p,
        n,
        cfg.card * (0.75 + rnd() * 0.25),
        rnd,
        cfg.arc * 0.8,
        1,
        cardShade(up, 0.1, true)
      )
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
 *   card   —— 卡片宽度（m）。512px 贴图铺在 1.3m 上 → 1px ≈ 2.6mm，
 *             单叶全长 40px ≈ 10~11cm（真实阔叶的量级）
 *             ⚠ 卡片**不能太大**：1.6m 的卡片每一张的 alpha 轮廓就是一个
 *               大圆饼，十几张叠起来读作"剪纸堆"（近景穿帮）。
 *               卡片小 ⇒ 侧影碎、密度靠张数补。
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
    crown: { r: [1.5, 2.2], aspect: [0.40, 0.55], shell: 25, core: 10, card: 1.3, arc: 1.0 },
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
    crown: { r: [1.4, 2.1], aspect: [0.62, 0.85], shell: 25, core: 10, card: 1.3, arc: 0.9 },
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
    crown: { r: [1.2, 1.8], aspect: [0.80, 1.00], shell: 23, core: 9, card: 1.24, arc: 0.85 },
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
    crown: { r: [1.0, 1.6], aspect: [1.45, 1.95], shell: 23, core: 9, card: 1.24, arc: 0.85 },
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
    crown: { r: [1.4, 2.1], aspect: [0.80, 1.00], shell: 25, core: 10, card: 1.3, arc: 0.9 },
    bark: 0x4b3d2f,
  },
};

/** 生成一个树种的一个变体模板 */
function buildTemplate(species, variant) {
  const spec = SPECIES[species];
  const rnd = mulberry32(0x9e3779b9 ^ (variant * 2654435761) ^ species.length * 7919);
  const trunkParts = [];
  const foliageParts = [];
  /** 叶团挂点（局部坐标）—— 近景实体叶用 */
  const crowns = [];

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
    // 主干用 8 边：6 边在 5 m 内能看出棱角，是"六棱柱"不是树干
    const seg = new THREE.CylinderGeometry(r1, r0, len, 8, 1);
    scaleBarkUV(seg, len, r0);
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
      crowns,
    });
  }

  return {
    trunk: mergeGeometries(trunkParts, false),
    foliage: mergeGeometries(foliageParts, false),
    height: h,
    crowns,
  };
}
/* ------------------------------------------------------------ 总装 */

export function buildTrees(sceneData, heightAt) {
  const group = new THREE.Group();
  group.name = 'trees';
  const trees = sceneData.trees || [];
  const VARIANTS = 4;
  /**
   * 每棵树的信息 —— 近景**实体叶**（`leaf-detail.js`）要用：
   * 世界位置、朝向、缩放、叶团挂点，以及 impostor 冠的 mesh/索引
   * （近处要把那一件隐去，换成真叶）。
   */
  const treeInfo = [];

  // 树皮：贴图是**接近白的细节图**，颜色由 instanceColor（树种色）承担。
  // ⚠ 贴图底色若给深棕，就成了 §4.1.2 的双重变暗（贴图 × 固有色）。
  const barkMat = new THREE.MeshStandardMaterial({
    map: makeBarkTexture(),
    color: 0xffffff,
    roughness: 0.96,
    metalness: 0,
  });

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
        // ⚠ **顶点色必须开**：树冠的明暗（外壳受光 / 内芯全黑 / 朝下更暗）
        //   是靠顶点色写进几何的 —— 这是"树冠读作体积而不是剪纸"的关键。
        //   顶点色是**贴图的调制系数**（接近 1），不是叶子的真实颜色。
        vertexColors: true,
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

        // 记给近景实体叶用
        treeInfo.push({
          x: pos.x,
          y: pos.y,
          z: pos.z,
          q: qLeaf.clone(),
          s: scl.clone(),
          species,
          crowns: tpl.crowns,
          foliage: leafMesh,
          fIdx: i,
          seed: t.seed,
        });

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

  return { group, treeInfo };
}
