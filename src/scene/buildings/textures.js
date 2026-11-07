/**
 * 程序化生成全部贴图 —— 不依赖任何外部素材，天然离线可用、无版权问题。
 *
 * 关键贴图：
 *   瓦垄(roofTiles)   筒瓦一垄一垄的明暗 + 横向瓦片接缝
 *   瓦垄法线          给出真实的垄状反光
 *   和玺彩画          枋心金龙 + 藻头旋子 + 箍头
 *   旋子彩画          金线旋子
 *   苏式彩画          包袱山水（园林常用）
 *   柱身沥粉彩画      柱头缠枝
 *   砖墙 / 灰墙
 *   石材
 *   藻井               宫殿梁架顶部
 */
import * as THREE from 'three';

const cache = new Map();

/**
 * AI 生成材质覆盖表。
 * scripts/gen-textures.py 用本机 MPS 跑扩散模型生成写实材质后，
 * 通过 setTextureOverrides() 注入；未生成时回落到程序化贴图。
 */
const OVERRIDE = {};

/** 各材质的平铺密度：按真实米制定，一块砖 ~12cm 高 */
const OVERRIDE_REPEAT = {
  brick: [2.6, 2.6],
  tile: [1, 1],
  wood: [1, 1],
  stone: [2.2, 2.2],
  moss: [2.4, 2.4],
  grass: [1, 1],
};

/** 由反照率推出的法线 / 粗糙度贴图（scripts/gen-maps.py 生成） */
const OVERRIDE_N = {};
const OVERRIDE_R = {};
/** 同一材质的多个变体：`<name>#v0` … 用来打散"贴图复制"的重复感 */
const OVERRIDE_V = {};

export function setTextureOverrides(map) {
  for (const [k, tex] of Object.entries(map)) {
    if (!tex) continue;
    // manifest 里的键：`brick` / `brick#normal` / `brick#v0` / `brick#v0#normal`
    const parts = k.split('#');
    const base = parts[0];
    const variant = parts[1] && parts[1].startsWith('v') ? parts[1] : '';
    const kind = parts[2] || (parts[1] === 'normal' || parts[1] === 'rough' ? parts[1] : '');
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    const key = base + variant;
    if (kind === 'normal' || kind === 'rough') {
      // 法线/粗糙度是**数据**，不能按 sRGB 解码
      tex.colorSpace = THREE.NoColorSpace;
      if (kind === 'normal') OVERRIDE_N[key] = tex;
      else OVERRIDE_R[key] = tex;
      continue;
    }
    tex.colorSpace = THREE.SRGBColorSpace;
    const r = OVERRIDE_REPEAT[base] || OVERRIDE_REPEAT[k];
    if (r) tex.repeat.set(r[0], r[1]);
    if (variant) {
      (OVERRIDE_V[base] ||= {})[variant] = tex;
    } else {
      OVERRIDE[base] = tex;
    }
  }
  // 变体按 v0、v1、v2 的顺序排，保证"第几个变体"是稳定的
  for (const k of Object.keys(OVERRIDE_V)) {
    OVERRIDE_V[k] = Object.entries(OVERRIDE_V[k])
      .sort((a, b) => parseInt(a[0].slice(1)) - parseInt(b[0].slice(1)))
      .map((e) => e[1]);
  }
}

export function getTextureOverrides() {
  return { ...OVERRIDE };
}

/** 取某材质的第 v 个变体（没有变体就退回本体） */
export function variantTexture(name, v = 0) {
  const list = OVERRIDE_V[name];
  if (!list || !list.length) return OVERRIDE[name] || null;
  return list[((v % list.length) + list.length) % list.length];
}

/** 该材质有没有变体可用 */
export function hasVariants(name) {
  return !!(OVERRIDE_V[name] && OVERRIDE_V[name].length);
}

export function normalFor(name) {
  return OVERRIDE_N[name] || null;
}

/** 变体专属的法线/粗糙度（没有就退回本体） */
export function variantNormal(name, v = 0) {
  return OVERRIDE_N[`${name}#v${v}`] || OVERRIDE_N[name] || null;
}

export function variantRough(name, v = 0) {
  return OVERRIDE_R[`${name}#v${v}`] || OVERRIDE_R[name] || null;
}

export function roughFor(name) {
  return OVERRIDE_R[name] || null;
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(canvas, { repeat = [1, 1], wrap = THREE.RepeatWrapping, srgb = true } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = wrap;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = 8;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 确定性伪随机，保证每次构建贴图一致 */
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

/* ------------------------------------------------------------------ 瓦垄 */

/**
 * 灰筒瓦屋面。沿屋面坡向排布筒瓦垄（半圆凸起），横向有瓦片搭接接缝。
 * canvas 的 U 方向 = 沿坡向（从脊到檐），V 方向 = 沿垄方向。
 *
 * ⚠ **为什么不用 AI 生成的 tile.png**：
 *   1. 那张图是**银色金属瓦**（亮白筒身 + 黑缝），不是清式青瓦；
 *   2. 它的垄数/行数与代码里的 UV 约定**对不上**
 *      （实测 U 方向暗缝在 x=96/294/479，V 方向暗缝密集成片），
 *      而屋面 UV 是按「U 方向 6 垄、V 方向 6 行搭接」算的 ——
 *      两者错位 → 采样全落在黑缝上 → **整片屋面渲染成黑色**。
 *
 * 所以瓦贴图一律走程序化：布局与 UV 严格配套，颜色也可控。
 */
export function roofTiles() {
  if (cache.has('roofTiles')) return cache.get('roofTiles');
  // 512px：屋面 UV 是「每 1/6 周期一垄」，一个周期铺 6×0.386m ≈ 2.3m，
  // 512px → 1px ≈ 4.5mm，瓦垄的明暗过渡才不会被 mipmap 抹平。
  const W = 512;
  const H = 512;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const rnd = mulberry32(20240713);

  // 瓦面底色。
  //
  // ⚠ 这里是**双重压暗**的坑：贴图底色（sRGB）会转到 linear 工作空间，
  // 再乘材质的固有色（也是 linear）。底色给 #5d5f63（linear ≈ 0.11）
  // × 固有色 0x6e7176（linear ≈ 0.16）= 0.018 —— 渲出来接近纯黑。
  // 青瓦真实的反照率约 0.2，这里把贴图底色提到 #8b8e93，
  // 乘出来 ≈ 0.045，屋面是**深青灰**而不是黑。
  g.fillStyle = '#8b8e93';
  g.fillRect(0, 0, W, H);

  const cols = 6; // 垄数（与屋面 UV 约定配套：U 方向每 1/6 周期一垄）
  const colW = W / cols;
  for (let i = 0; i < cols; i++) {
    const x = i * colW;
    // 每条垄：中间亮（筒瓦脊），两侧暗（瓦沟）
    const grad = g.createLinearGradient(x, 0, x + colW, 0);
    grad.addColorStop(0.0, '#6a6d72');
    grad.addColorStop(0.12, '#909399');
    grad.addColorStop(0.38, '#a8abb0');
    grad.addColorStop(0.5, '#b0b3b8');
    grad.addColorStop(0.62, '#a8abb0');
    grad.addColorStop(0.88, '#909399');
    grad.addColorStop(1.0, '#6a6d72');
    g.fillStyle = grad;
    g.fillRect(x, 0, colW, H);

    // 瓦片搭接缝（横向）
    const rows = 6;
    for (let r = 1; r < rows; r++) {
      const y = (r / rows) * H;
      g.strokeStyle = `rgba(30,32,35,${0.30 + rnd() * 0.14})`;
      g.lineWidth = 2.6;
      g.beginPath();
      g.moveTo(x + 2, y);
      g.lineTo(x + colW - 2, y);
      g.stroke();
      // 缝下高光
      g.strokeStyle = 'rgba(190,192,196,0.18)';
      g.lineWidth = 1.8;
      g.beginPath();
      g.moveTo(x + 2, y + 3);
      g.lineTo(x + colW - 2, y + 3);
      g.stroke();
    }
  }

  // 整体脏旧感
  for (let i = 0; i < 900; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    g.fillStyle = `rgba(${rnd() > 0.5 ? '255,255,255' : '0,0,0'},${rnd() * 0.05})`;
    g.fillRect(x, y, 2 + rnd() * 5, 2 + rnd() * 5);
  }

  const tex = toTexture(c, { repeat: [1, 1] });
  const result = { map: tex };
  cache.set('roofTiles', result);
  return result;
}

/** 瓦垄法线贴图：横向正弦起伏 + 纵向接缝 */
export function roofTilesNormal() {
  // ⚠ 同样不用 AI 生成的 tile_n.png：那张是**银瓦**的法线，
  // 垄/行布局也与屋面 UV 约定对不上（见 roofTiles() 的说明）。
  if (cache.has('roofTilesNormal')) return cache.get('roofTilesNormal');
  const W = 512;
  const H = 512;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  const cols = 6;
  const rows = 6;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const v = y / H;
      // 垄状：沿 x 方向余弦
      const bump = Math.cos(u * cols * Math.PI * 2);
      // 接缝：沿 y 方向的突变
      const rowF = v * rows;
      const seam = Math.abs(rowF - Math.round(rowF)) < 0.06 ? -0.55 : 0;
      // 法线 n = normalize(-dh/dx, -dh/dy, 1)
      const dhdx = bump * 0.55;
      const dhdy = seam * 0.4;
      const len = Math.hypot(dhdx, dhdy, 1);
      const i = (y * W + x) * 4;
      img.data[i] = ((-dhdx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((-dhdy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = toTexture(c, { srgb: false });
  cache.set('roofTilesNormal', tex);
  return tex;
}

/** 琉璃瓦（黄/绿琉璃），用于重要殿宇 */
export function glazedTiles(base = '#3f6b4f', hi = '#7fc79a') {
  const key = `glazed-${base}-${hi}`;
  if (cache.has(key)) return cache.get(key);
  const W = 256;
  const H = 256;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  const cols = 16;
  const colW = W / cols;
  for (let i = 0; i < cols; i++) {
    const x = i * colW;
    const grad = g.createLinearGradient(x, 0, x + colW, 0);
    grad.addColorStop(0.0, base);
    grad.addColorStop(0.35, hi);
    grad.addColorStop(0.5, hi);
    grad.addColorStop(0.65, hi);
    grad.addColorStop(1.0, base);
    g.fillStyle = grad;
    g.fillRect(x, 0, colW, H);
  }
  const tex = toTexture(c);
  cache.set(key, tex);
  return tex;
}

/* ---------------------------------------------------------------- 彩画 */

const PALETTE = {
  qing: '#1f6b6b', // 青（底色）
  lv: '#2f8f4f', // 绿
  zi: '#4a3f8f', // 紫
  jin: '#e8c46a', // 金（沥粉）
  zhu: '#b6342c', // 朱
  yang: '#d98ea6', // 洋红/粉
  hei: '#20242a',
};

/** 旋子：一条螺旋卷尾的抽象纹样 */
/**
 * 旋子：清式旋子彩画的基本母题。
 * 带"沥粉"效果：金色线条外再描一道深色边，模拟沥粉贴金。
 */
function drawXuanzi(g, cx, cy, r, color, lw, gilt = true) {
  const path = [];
  const turns = 2.15;
  const steps = 90;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * Math.PI * 2 * turns;
    const rr = r * (0.18 + 0.82 * t);
    path.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.86]);
  }
  const stroke = (w, col) => {
    g.strokeStyle = col;
    g.lineWidth = w;
    g.beginPath();
    path.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
  };
  if (gilt) stroke(lw + 2.6, 'rgba(38,26,10,0.6)');
  stroke(lw, color);
}

/** 盒子：藻头中段的三方连续方格（清式"盒子"） */
function drawHezi(g, x, y, w, h, color, gilt = true) {
  const cells = 3;
  const cw = w / cells;
  const ch = h / cells;
  if (gilt) {
    g.strokeStyle = 'rgba(38,26,10,0.55)';
    g.lineWidth = 4;
    g.strokeRect(x, y, w, h);
  }
  g.strokeStyle = color;
  g.lineWidth = 2.4;
  g.strokeRect(x, y, w, h);
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      const cx = x + i * cw;
      const cy = y + j * ch;
      g.strokeStyle = color;
      g.lineWidth = 1.8;
      g.beginPath();
      g.moveTo(cx + cw * 0.24, cy + ch * 0.76);
      g.lineTo(cx + cw * 0.76, cy + ch * 0.76);
      g.lineTo(cx + cw * 0.76, cy + ch * 0.24);
      g.lineTo(cx + cw * 0.24, cy + ch * 0.24);
      g.closePath();
      g.stroke();
    }
  }
}

/** 箍头：找头 + 盒子两段 */
function drawGutou(g, x, y, w, h, color, gilt = true) {
  g.fillStyle = PALETTE.qing;
  g.fillRect(x, y, w, h);
  if (gilt) {
    g.strokeStyle = 'rgba(38,26,10,0.5)';
    g.lineWidth = 3.6;
    g.strokeRect(x, y, w, h);
  }
  g.strokeStyle = color;
  g.lineWidth = 2.2;
  g.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
  g.beginPath();
  g.moveTo(x + w * 0.12, y + h * 0.84);
  g.lineTo(x + w * 0.52, y + h * 0.16);
  g.stroke();
  drawHezi(g, x + w * 0.56, y + h * 0.16, w * 0.34, h * 0.68, color, gilt);
}

/**
 * 枋上彩画带（额枋贴图）。
 * 清式彩画横向五段：箍头 | 藻头 | 枋心 | 藻头 | 箍头
 *   藻头 = 旋眼（三瓣旋转） + 盒子（三方连续） + 找头
 * style: 'hexi' 和玺 / 'xuanzi' 旋子 / 'su' 苏式（包袱）
 */
export function caihua(style = 'xuanzi') {
  const key = `caihua-${style}`;
  if (cache.has(key)) return cache.get(key);
  const W = 2048;
  const H = 256;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const rnd = mulberry32(4242);

  // 底：青地
  g.fillStyle = PALETTE.qing;
  g.fillRect(0, 0, W, H);
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, 'rgba(255,255,255,0.12)');
  bg.addColorStop(0.5, 'rgba(0,0,0,0)');
  bg.addColorStop(1, 'rgba(0,0,0,0.24)');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  const gutouW = W * 0.075;
  const zaoTouW = W * 0.185;
  const fangXinW = W - 2 * (gutouW + zaoTouW);

  drawGutou(g, 0, 0, gutouW, H, PALETTE.jin);
  drawGutou(g, W - gutouW, 0, gutouW, H, PALETTE.jin);

  // 藻头：旋眼 + 盒子 + 找头
  for (const ax of [gutouW, W - gutouW - zaoTouW]) {
    g.fillStyle = PALETTE.qing;
    g.fillRect(ax, 0, zaoTouW, H);
    g.strokeStyle = PALETTE.jin;
    g.lineWidth = 4;
    g.strokeRect(ax + 4, 4, zaoTouW - 8, H - 8);

    const rr = H * 0.34;
    for (let k = 0; k < 3; k++) {
      const cxx = ax + zaoTouW * 0.27;
      const cyy = H * 0.5;
      const s = 1 - k * 0.26;
      g.save();
      g.translate(cxx, cyy);
      g.rotate(k * 0.5);
      g.translate(-cxx, -cyy);
      drawXuanzi(g, cxx, cyy, rr * s, PALETTE.jin, 3.4);
      g.restore();
    }
    drawHezi(g, ax + zaoTouW * 0.45, H * 0.15, zaoTouW * 0.3, H * 0.7, PALETTE.jin);
    g.strokeStyle = PALETTE.jin;
    g.lineWidth = 3;
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      g.moveTo(ax + zaoTouW * 0.8, H * (0.28 + k * 0.2));
      g.lineTo(ax + zaoTouW * 0.95, H * (0.14 + k * 0.2));
      g.stroke();
    }
  }

  // 枋心
  const fx = gutouW + zaoTouW;
  g.fillStyle = PALETTE.qing;
  g.fillRect(fx, 0, fangXinW, H);
  g.strokeStyle = 'rgba(38,26,10,0.55)';
  g.lineWidth = 6;
  g.strokeRect(fx + 6, 6, fangXinW - 12, H - 12);
  g.strokeStyle = PALETTE.jin;
  g.lineWidth = 3;
  g.strokeRect(fx + 6, 6, fangXinW - 12, H - 12);

  if (style === 'hexi') {
    // 和玺：枋心画金龙
    g.save();
    g.beginPath();
    g.rect(fx + 14, 14, fangXinW - 28, H - 28);
    g.clip();
    const cy = H / 2;
    const spine = [];
    for (let i = 0; i <= 160; i++) {
      const t = i / 160;
      spine.push([
        fx + 30 + t * (fangXinW - 60),
        cy + Math.sin(t * Math.PI * 2.6) * (H * 0.21),
      ]);
    }
    const drawSpine = (w, col) => {
      g.strokeStyle = col;
      g.lineWidth = w;
      g.lineJoin = 'round';
      g.beginPath();
      spine.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
    };
    drawSpine(16, 'rgba(38,26,10,0.62)');
    drawSpine(10, PALETTE.jin);
    g.fillStyle = 'rgba(244,214,140,0.9)';
    for (let i = 0; i < 260; i++) {
      const idx = Math.floor(rnd() * spine.length);
      const [x, y] = spine[idx];
      g.beginPath();
      g.arc(x + (rnd() - 0.5) * 8, y + (rnd() - 0.5) * 13, 2.8, 0, Math.PI * 2);
      g.fill();
    }
    const cx = fx + fangXinW / 2;
    g.strokeStyle = 'rgba(38,26,10,0.6)';
    g.lineWidth = 7;
    g.beginPath();
    g.arc(cx, cy - H * 0.02, 19, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = PALETTE.jin;
    g.beginPath();
    g.arc(cx, cy - H * 0.02, 16, 0, Math.PI * 2);
    g.fill();
    g.restore();
  } else if (style === 'su') {
    // 苏式：包袱山水
    g.save();
    g.beginPath();
    g.rect(fx + 14, 14, fangXinW - 28, H - 28);
    g.clip();
    const cy = H / 2;
    g.fillStyle = 'rgba(176,206,220,0.62)';
    g.beginPath();
    g.moveTo(fx + 40, H - 24);
    for (let i = 0; i <= 30; i++) {
      const t = i / 30;
      g.lineTo(
        fx + 40 + t * (fangXinW - 80),
        H - 30 - Math.abs(Math.sin(t * 7.3)) * 36
      );
    }
    g.lineTo(fx + fangXinW - 40, H - 24);
    g.closePath();
    g.fill();
    const cx = fx + fangXinW / 2;
    g.strokeStyle = 'rgba(38,26,10,0.6)';
    g.lineWidth = 7;
    g.beginPath();
    g.ellipse(cx, cy + 4, 18, 24, 0, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = PALETTE.jin;
    g.beginPath();
    g.ellipse(cx, cy + 4, 15, 21, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  } else {
    // 旋子：一整二破旋子（枋心中央一个整旋子，两侧各半个）
    const cx = fx + fangXinW / 2;
    drawXuanzi(g, cx, H / 2, H * 0.4, PALETTE.jin, 5);
    for (const sgn of [-1, 1]) {
      g.save();
      g.beginPath();
      g.rect(cx + sgn * fangXinW * 0.16, 14, fangXinW * 0.18, H - 28);
      g.clip();
      drawXuanzi(g, cx + sgn * fangXinW * 0.34, H / 2, H * 0.3, PALETTE.jin, 4);
      g.restore();
    }
    g.strokeStyle = PALETTE.jin;
    g.lineWidth = 2.8;
    g.beginPath();
    g.moveTo(fx + 20, 20);
    g.lineTo(fx + fangXinW - 20, 20);
    g.moveTo(fx + 20, H - 20);
    g.lineTo(fx + fangXinW - 20, H - 20);
    g.stroke();
  }

  // 老化磨损
  for (let i = 0; i < 1100; i++) {
    g.fillStyle = `rgba(0,0,0,${rnd() * 0.06})`;
    g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 5, 1 + rnd() * 4);
  }

  const tex = toTexture(c, { repeat: [1, 1] });
  cache.set(key, tex);
  return tex;
}

/** 柱身：红底沥粉彩画（柱头缠枝 + 柱身素面） */
/**
 * **素漆**（大漆）：柱身、槅扇框料、绦环板、裙板、垫板用的漆面。
 *
 * ## 为什么要单独做一张
 *
 * `public/textures/wood.png` 是 AI 生成的**一张雕花木门照片**（红漆地 +
 * 密集的金龙/花板浮雕）。它被贴到：
 *   · 0.48m 直径的**柱子**上（一张门的局部）；
 *   · 0.4m × 0.5m 的**槅扇裙板**上；
 *   · 额枋下的**垫板**上。
 *
 * 结果就是**"浓的贴图感"**：一个柱子上出现半扇门的花纹，
 * 同一块花纹在每根柱、每片裙板上原样重复 —— 一眼是贴图，不是构件。
 *
 * ## 真实的做法
 *
 * 清式官式建筑里：
 *   · **柱子** = 素朱红漆（柱头一圈做彩画），柱身没有花纹；
 *   · **槅扇框料** = 素朱红；**绦环板/裙板** = 素漆（多素黑）；
 *   · 雕花与彩画只出现在**额枋、斗栱、檐檩**上 —— 那几处本来就该有彩画。
 *
 * 所以这里做一张**程序化素漆**：漆底 + 极淡的竖向木纹 + 轻微不匀，
 * 没有图案、不可辨识、只提供"漆面"这个质感。
 *
 * @param {string} base 漆色（sRGB hex）
 * @param {number} seed 随机种子（不同构件给不同种子，避免一模一样）
 */
export function lacquer(base = '#a8302a', seed = 1) {
  const key = `lacquer-${base}-${seed}`;
  if (cache.has(key)) return cache.get(key);
  const W = 128;
  const H = 256;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const rnd = mulberry32(seed * 7919 + base.length * 131);
  const col = new THREE.Color(base);

  g.fillStyle = `#${col.getHexString()}`;
  g.fillRect(0, 0, W, H);

  // 竖向木纹：漆下隐约的木条纹理（官式大木是通长木料，纹是竖的）
  for (let i = 0; i < 260; i++) {
    const x = rnd() * W;
    const y0 = rnd() * H;
    const len = 30 + rnd() * 150;
    const dark = rnd() < 0.5;
    // ⚠ 对比要压得很低：漆下的木纹只是"隐约"，不是拉丝。
    //   原来深色到 0.065，柱身在阳光下像金属管。
    g.strokeStyle = dark
      ? `rgba(0,0,0,${0.008 + rnd() * 0.018})`
      : `rgba(255,255,255,${0.005 + rnd() * 0.012})`;
    g.lineWidth = 0.7 + rnd() * 1.6;
    g.beginPath();
    g.moveTo(x, y0);
    g.bezierCurveTo(x + (rnd() - 0.5) * 3, y0 + len * 0.4, x + (rnd() - 0.5) * 3, y0 + len * 0.7, x, y0 + len);
    g.stroke();
  }

  // 漆面不匀：涂刷的厚薄不匀（大漆的常态）
  for (let i = 0; i < 70; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const r = 12 + rnd() * 46;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const up = rnd() < 0.5;
    grd.addColorStop(0, up ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  const tex = toTexture(c);
  cache.set(key, tex);
  return tex;
}

export function columnPaint(color = '#a8302a') {
  const key = `col-${color}`;
  if (cache.has(key)) return cache.get(key);
  const W = 128;
  const H = 512;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.fillRect(0, 0, W, H);
  // 柱头（约顶部 18%）缠枝莲
  g.save();
  g.beginPath();
  g.rect(0, 0, W, H * 0.2);
  g.clip();
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.fillRect(0, 0, W, H * 0.2);
  g.strokeStyle = PALETTE.jin;
  g.lineWidth = 3;
  g.beginPath();
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    const x = t * W;
    const y = H * 0.1 + Math.sin(t * Math.PI * 6) * (H * 0.05);
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
  g.restore();
  // 柱身竖向高光
  const grad = g.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0.30)');
  grad.addColorStop(0.34, 'rgba(255,255,255,0.14)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.02)');
  grad.addColorStop(1, 'rgba(0,0,0,0.32)');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // 柱脚
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(0, H * 0.94, W, H * 0.06);

  const tex = toTexture(c);
  cache.set(key, tex);
  return tex;
}

/* -------------------------------------------------------------- 墙 / 石 */

/** 灰砖墙 */
/**
 * **墁砖地**（官式方砖铺地）的专用贴图。
 *
 * ## 为什么不能用 `brickWall()`
 *
 * `brickWall()` 是**墙面**贴图：顺砖砌、每皮错半砖。
 * 把它铺在地上 —— 砖的长边是横向的、砖缝是横向通长的 ——
 * 读着像"乱石地/花地毯"，根本不是官式**方砖墁地**。
 * 官式院落的墁砖地是**方砖**（约 0.4~0.5m 见方）**正缝对格**铺设。
 *
 * ## 规格
 *   · 1024px = 16×16 块方砖 ⇒ 每块 64px
 *   · 一块方砖 = 0.5m ⇒ **一张贴图覆盖 8m × 8m**
 *   · 砖缝 5px ≈ 4cm（真实的灰浆缝）
 *   · **每块砖有独立的色偏**（不同窑口的方砖颜色本就有差），
 *     这也是打散 8m 贴图周期的主要手段
 *
 * @param {string} tint 砖色（sRGB hex）
 */
export function paveBrick(tint = '#9c968b') {
  // ⚠ **刻意不用 AI 覆盖**：AI 的 brick 是**墙面顺砖图**，
  //   铺在地上读着是"乱石地"。墁砖地必须用方砖正缝网格。
  //
  // ⚠ **分辨率要够**：一块方砖 = 0.5m，贴图每边 32 块 ⇒ 一张 = 16m × 16m。
  //   原来 1024px/16 块 = 8m 周期 ⇒ 大院子上 8m 就重复一次，一眼平铺感。
  //   2048px/32 块把周期翻倍，配合**逐块顶点色差**（见 layout.js）才压得住。
  const key = `pavebrick-${tint}`;
  if (cache.has(key)) return cache.get(key);
  const S = 2048;
  const N = 32; // 每边 32 块方砖
  const cell = S / N;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d', { willReadFrequently: true });
  const rnd = mulberry32(20261031);
  const base = new THREE.Color(tint);

  // 灰浆缝底色（比砖深，但**不能太深**）
  //
  // ⚠ 原来 INSET=2.5px（缝宽 3.9cm）+ 深灰缝 ⇒ 整片地读作"浴室瓷砖"。
  //   官式墁砖是**磨砖对缝**，缝宽约 1~1.5cm，颜色只比砖深一点。
  //   64px = 0.5m ⇒ 1px ≈ 7.8mm ⇒ INSET 0.9px ⇒ 缝宽 ≈ 1.4cm。✓
  g.fillStyle = '#857f74';
  g.fillRect(0, 0, S, S);

  // 逐块铺砖：分窑烧的方砖，明度与色相都有差
  //
  // ⚠ 色差必须**小**：真实墁砖是同一窑、同一批、磨过之后颜色很接近。
  //   差得大（原来 ±7% 明度）就成"花地毯/棋盘格"。
  const INSET = 0.75; // 缝宽（绝对像素，**不随分辨率放大**，否则缝会变成沟）
  for (let r = 0; r < N; r++) {
    for (let q = 0; q < N; q++) {
      const v = 0.965 + rnd() * 0.07;
      const warm = (rnd() - 0.5) * 0.035;
      const col = base.clone();
      col.offsetHSL(warm, (rnd() - 0.5) * 0.025, (v - 1) * 0.22);
      g.fillStyle = `#${col.getHexString()}`;
      g.fillRect(q * cell + INSET, r * cell + INSET, cell - INSET * 2, cell - INSET * 2);
    }
  }

  // 颗粒 + 砖边微暗：**用 ImageData 批量写**。
  // ⚠ 逐个 fillRect 在 2048px 上要几秒（首屏直接卡住）；
  //   1024 块 × 40 颗粒 = 4 万次 fillRect ⇒ 必须批量。
  const img = g.getImageData(0, 0, S, S);
  const d = img.data;
  const at = (x, y) => (y * S + x) * 4;
  for (let r = 0; r < N; r++) {
    for (let q = 0; q < N; q++) {
      const x0 = q * cell + INSET;
      const y0 = r * cell + INSET;
      const w = cell - INSET * 2;
      // 砖面细颗粒（方砖是磨过的，比墙砖细腻）
      //
      // ⚠ 数量要够：原来 40 粒/砖 ⇒ 砖面是**一片纯色**，
      //   近景看就是"塑料方砖"。加到 120 粒并把幅度提到 ±7%，
      //   才有"磨过的砖面"那种细密的颗粒感。
      for (let k = 0; k < 120; k++) {
        const ix = x0 + Math.floor(rnd() * w);
        const iy = y0 + Math.floor(rnd() * w);
        const a = Math.round(rnd() * 0.07 * 255);
        const add = rnd() < 0.5 ? a : -a;
        const p = at(ix, iy);
        d[p] = Math.max(0, Math.min(255, d[p] + add));
        d[p + 1] = Math.max(0, Math.min(255, d[p + 1] + add));
        d[p + 2] = Math.max(0, Math.min(255, d[p + 2] + add));
      }
      // 四边微暗（磨圆的棱）
      const edgeDark = 0.055;
      for (let i = 0; i < w; i++) {
        for (const [ex, ey] of [
          [x0 + i, y0],
          [x0 + i, y0 + w - 1],
          [x0, y0 + i],
          [x0 + w - 1, y0 + i],
        ]) {
          const p = at(ex, ey);
          d[p] = Math.round(d[p] * (1 - edgeDark));
          d[p + 1] = Math.round(d[p + 1] * (1 - edgeDark));
          d[p + 2] = Math.round(d[p + 2] * (1 - edgeDark));
        }
      }
    }
  }
  g.putImageData(img, 0, 0);

  const tex = toTexture(c);
  cache.set(key, tex);
  return tex;
}

export function brickWall(tint = '#8d8a84') {
  if (OVERRIDE.brick) return OVERRIDE.brick;
  const key = `brick-${tint}`;
  if (cache.has(key)) return cache.get(key);
  const W = 512;
  const H = 512;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const rnd = mulberry32(999);
  g.fillStyle = tint;
  g.fillRect(0, 0, W, H);
  // ⚠ **16 皮砖**：清式城砖约 0.4m × 0.2m，
  //   16 皮 ⇒ 一张贴图 = 16 × 0.2 = **3.2m × 3.2m**。
  //   原来 256px/8皮 = 1.6m 一张 ⇒ 每 1.6m 整张重复一次，
  //   一面 30m 的墙要重复 19 次，远看就是"印上去的砖纹"。
  //   现在与红砖墙统一到 **3.2m**，几何 UV 的 tile 也统一。
  const rows = 16;
  const bh = H / rows;
  for (let r = 0; r < rows; r++) {
    const offset = r % 2 ? bh : 0;
    for (let x = -bh; x < W; x += bh * 2) {
      const bw = bh * 2;
      const v = 0.86 + rnd() * 0.22;
      g.fillStyle = `rgba(${Math.floor(141 * v)},${Math.floor(138 * v)},${Math.floor(132 * v)},1)`;
      g.fillRect(x + offset + 1.5, r * bh + 1.5, bw - 3, bh - 3);
    }
  }
  g.strokeStyle = 'rgba(60,58,55,0.5)';
  g.lineWidth = 1;
  for (let r = 0; r <= rows; r++) {
    g.beginPath();
    g.moveTo(0, r * bh);
    g.lineTo(W, r * bh);
    g.stroke();
  }
  const tex = toTexture(c);
  cache.set(key, tex);
  return tex;
}

/** 汉白玉 / 青石台基 */
/** 西洋楼番花浮雕石（远瀛观、谐奇趣的柱身与栏板） */
export function ornateStone() {
  if (OVERRIDE.baroque) return OVERRIDE.baroque;
  return stone();
}

/**
 * 匾额：黑漆地 + 金框 + 金字（清代官式"黑漆金字"）。
 *
 * 正大光明殿的"正大光明"四字是雍正御笔——匾额没有字，一眼就假。
 *
 * @param {string} text 匾文
 * @returns {THREE.CanvasTexture}
 */
export function plaqueBoard(text, vertical = false) {
  const key = `plaque-${text}-${vertical ? 'v' : 'h'}`;
  if (cache.has(key)) return cache.get(key);
  const W = vertical ? 96 : 512;
  const H = vertical ? 512 : 160;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const rnd = mulberry32(text.length * 977 + text.charCodeAt(0));

  // 漆地：深黑带一点不匀
  g.fillStyle = '#140f0a';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) {
    g.globalAlpha = 0.03 + rnd() * 0.05;
    g.fillStyle = rnd() < 0.5 ? '#2c2118' : '#0a0705';
    g.beginPath();
    g.ellipse(rnd() * W, rnd() * H, 20 + rnd() * 70, 10 + rnd() * 40, rnd() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;

  // 金框（内外两道）
  const gold = '#c9a227';
  g.strokeStyle = gold;
  g.lineWidth = 5;
  g.strokeRect(9, 9, W - 18, H - 18);
  g.lineWidth = 1.6;
  g.strokeRect(19, 19, W - 38, H - 38);

  // 金字。横匾从右往左排（传统右起读法）；楹联竖排，上联在右。
  const chars = [...text].slice(0, vertical ? 9 : 5);
  if (chars.length) {
    const size = vertical
      ? Math.min(50, (H - 80) / chars.length)
      : Math.min(92, (W - 90) / chars.length);
    g.font = `bold ${size}px "Songti SC", "STSong", "SimSun", "Noto Serif CJK SC", serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (vertical) {
      const step = (H - 60) / chars.length;
      for (let i = 0; i < chars.length; i++) {
        const cy = 34 + step * (i + 0.5);
        g.fillStyle = 'rgba(0,0,0,0.55)';
        g.fillText(chars[i], W / 2 + 2, cy + 2);
        g.fillStyle = gold;
        g.fillText(chars[i], W / 2, cy);
      }
    } else {
      const step = (W - 90) / chars.length;
      for (let i = 0; i < chars.length; i++) {
        const cx = W - 45 - step * (i + 0.5);
        g.fillStyle = 'rgba(0,0,0,0.55)';
        g.fillText(chars[i], cx + 2, H / 2 + 2);
        g.fillStyle = gold;
        g.fillText(chars[i], cx, H / 2);
      }
    }
  }

  const tex = toTexture(c);
  cache.set(key, tex);
  return tex;
}

/**
 * 官式红墙：青砖墙抹红灰，再经风雨。
 *
 * 直接给红墙一个纯色或一张干净的砖图，看着就是"一块红板"。
 * 真实的官墙有三层变化：
 *   ① 抹红灰的颜色不匀（有深有浅）
 *   ② 竖向的水痕——雨水从檐口冲下来留下的流痕
 *   ③ 墙根积尘、墙头被雨水冲淡
 */
/**
 * **抹红灰砖墙**（清式官墙）：红灰抹面 + 隐约的砖缝。
 *
 * ## 为什么不用 AI 的那张
 *
 * AI 的 `brick.png` 砖块大小不可控（不同变体不同），而"砖的真实尺寸"
 * 必须**确定**：清式城砖约 **0.4m × 0.2m**。
 * 这里固定成 **8 皮 × 4 块 = 一张贴图 1.6m × 1.6m**，
 * 于是每块砖恒为 0.4m × 0.2m —— 无论墙有多大。
 *
 * 墙面 UV 由几何缩放（`structure.js → scaleBoxUV`，tile = 1.6m），
 * 材质 repeat 归 (1,1)。
 */
export function redBrick() {
  const key = 'redbrick';
  if (cache.has(key)) return cache.get(key);
  /**
   * 抹红灰砖墙贴图。
   *
   * ⚠ **尺寸必须与几何的 UV 约定一致**：1024px / 16 皮 / 每皮 64px，
   *   砖宽 128px ⇒ 一张 = 8 块 × 0.4m = **3.2m 宽**，高 16 皮 × 0.2m = **3.2m**。
   *   原来 256px/8 皮 = **1.6m 一张** ⇒ 每 1.6m 整张重复一次，
   *   一面 30m 的墙要重复 19 次 —— 远看就是"印上去的砖纹"。
   *
   * ⚠ 逐块色差要**够大**（±14%）：抹红灰墙的砖本来就有明显的色差，
   *   差得小就退化成"一张红贴图"。
   */
  const S = 1024;
  const COURSES = 16; // 皮数
  const cell = S / COURSES; // 每皮 64px
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  const rnd = mulberry32(31337);

  g.fillStyle = '#9a4438';
  g.fillRect(0, 0, S, S);

  // 砖：每皮错半砖，每块 2:1
  for (let r = 0; r < COURSES; r++) {
    const off = r % 2 ? cell : 0;
    for (let x = -cell; x < S; x += cell * 2) {
      const v = 0.86 + rnd() * 0.28;
      g.fillStyle = `rgba(${Math.floor(168 * v)},${Math.floor(72 * v)},${Math.floor(60 * v)},1)`;
      const bx = x + off + 1.6;
      const by = r * cell + 1.6;
      const bw = cell * 2 - 3.2;
      const bh = cell - 3.2;
      g.fillRect(bx, by, bw, bh);
      // **砖的下缘投影** —— 砖是凸出墙面的，底边必有一道影。
      // ⚠ 这道影是**不用法线贴图也能读出"这是砖墙"**的关键：
      //   去掉 AI 砖法线（它把砖面拉成"皱纹皮革"）后，
      //   只靠贴图明暗，砖缝就几乎看不见了；有了下缘影，砖块立刻立起来。
      const grad = g.createLinearGradient(0, by + bh - bh * 0.34, 0, by + bh);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.30)');
      g.fillStyle = grad;
      g.fillRect(bx, by + bh - bh * 0.34, bw, bh * 0.34);
      // 砖的上缘微微受光
      const lit = g.createLinearGradient(0, by, 0, by + bh * 0.22);
      lit.addColorStop(0, 'rgba(255,225,215,0.16)');
      lit.addColorStop(1, 'rgba(255,225,215,0)');
      g.fillStyle = lit;
      g.fillRect(bx, by, bw, bh * 0.22);
    }
  }
  // 抹红灰：正片叠底压成砖红
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = '#d7a396';
  g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'source-over';
  // 薄灰浆：砖缝的硬对比化掉（抹灰墙的砖缝是"隐约"，不是黑线）
  // ⚠ 透明度不能太大：整片提亮会把砖缝的对比吃掉。
  g.fillStyle = 'rgba(206,150,138,0.18)';
  g.fillRect(0, 0, S, S);
  // 抹灰不匀：一块块的深浅（斑块随分辨率放大）
  const k = S / 256;
  for (let i = 0; i < 80; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = (14 + rnd() * 52) * k;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = rnd() < 0.5;
    grd.addColorStop(0, dark ? 'rgba(88,40,34,0.17)' : 'rgba(228,182,170,0.13)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // 轻微竖向水痕（雨水从墙头流下）
  for (let i = 0; i < 18; i++) {
    const x = rnd() * S;
    g.fillStyle = `rgba(120,80,72,${0.03 + rnd() * 0.05})`;
    g.fillRect(x, 0, (1 + rnd() * 3) * k, S);
  }

  const tex = toTexture(c);
  cache.set(key, tex);
  return tex;
}

export function redWall(variant = 0) {
  const key = `redwall-${variant}`;
  if (cache.has(key)) return cache.get(key);
  const base = variantTexture('brick', variant) || brickWall();
  const src = base.image;
  const W = 512;
  const H = 512;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const rnd = mulberry32(31337);

  if (src) g.drawImage(src, 0, 0, W, H);
  else {
    g.fillStyle = '#8d8a84';
    g.fillRect(0, 0, W, H);
  }

  // 抹红灰：正片叠底压成砖红，颜色不匀
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = '#d7a396';
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';

  // 再罩一层薄灰浆：把砖缝的硬对比化掉（抹灰墙的砖缝是"隐约"，不是黑线）
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = 'rgba(206,150,138,0.34)';
  g.fillRect(0, 0, W, H);

  // 抹灰不匀：一块块的深浅
  for (let i = 0; i < 90; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const r = 18 + rnd() * 70;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const dark = rnd() < 0.5;
    grd.addColorStop(0, dark ? 'rgba(90,40,34,0.16)' : 'rgba(226,180,168,0.13)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  // 竖向水痕：从上往下的细流痕
  for (let i = 0; i < 130; i++) {
    const x = rnd() * W;
    const w = 1 + rnd() * 5;
    const y0 = rnd() * H * 0.5;
    const len = 40 + rnd() * 220;
    const grd = g.createLinearGradient(0, y0, 0, y0 + len);
    grd.addColorStop(0, 'rgba(58,30,24,0.20)');
    grd.addColorStop(0.7, 'rgba(58,30,24,0.09)');
    grd.addColorStop(1, 'rgba(58,30,24,0)');
    g.fillStyle = grd;
    g.fillRect(x, y0, w, len);
  }

  // 墙根积尘 + 墙头被雨冲淡
  const grd2 = g.createLinearGradient(0, H, 0, H * 0.68);
  grd2.addColorStop(0, 'rgba(74,66,52,0.30)');
  grd2.addColorStop(1, 'rgba(74,66,52,0)');
  g.fillStyle = grd2;
  g.fillRect(0, H * 0.68, W, H * 0.32);
  const grd3 = g.createLinearGradient(0, 0, 0, H * 0.3);
  grd3.addColorStop(0, 'rgba(226,214,196,0.22)');
  grd3.addColorStop(1, 'rgba(226,214,196,0)');
  g.fillStyle = grd3;
  g.fillRect(0, 0, W, H * 0.3);

  const tex = toTexture(c);
  cache.set(key, tex);
  return tex;
}

export function stone() {
  if (OVERRIDE.stone) return OVERRIDE.stone;
  if (cache.has('stone')) return cache.get('stone');
  const W = 256;
  const H = 256;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const rnd = mulberry32(777);
  g.fillStyle = '#b9b5ac';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 2600; i++) {
    const v = rnd();
    g.fillStyle = `rgba(${v > 0.5 ? '255,255,255' : '90,88,84'},${rnd() * 0.16})`;
    g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 3, 1 + rnd() * 3);
  }
  // 石缝（阶条石分格）
  g.strokeStyle = 'rgba(120,116,108,0.55)';
  g.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    const p = (i / 4) * W;
    g.beginPath();
    g.moveTo(p, 0);
    g.lineTo(p, H);
    g.moveTo(0, p);
    g.lineTo(W, p);
    g.stroke();
  }
  const tex = toTexture(c);
  cache.set('stone', tex);
  return tex;
}

/**
 * **素石面** —— 官式石材（须弥座 / 柱础 / 栏杆 / 踏跺 / 御路石板）的通用面。
 *
 * ## 为什么不用 AI 那张 `stone.png`
 *
 * AI 生成的 stone 是一张**切割石板照片**：2×2 块板，板缝是**纯白**的高光。
 * 贴到任何石构件上都会出现两条**发亮的白线** ——
 * 须弥座上就是两道白光，御路石板上就是一张白网格。
 * 真实石缝是**灰浆**（暗线），不是发光的白线。
 *
 * ## 缝是几何，不是贴图
 *
 * 官式建筑里凡是"分块"的石作（石板路、阶条石），缝都是**真实几何留出来的**。
 * 所以这张贴图**只管石面本身**：斑驳、石脉、颗粒、凿痕，
 * **一根缝都不画**。画了缝就变成"贴图上的格子"，正是要去掉的贴图感。
 *
 * @param {string} tint 石色（sRGB hex）
 */
export function stoneFace(tint = '#a9a49b') {
  const key = `stoneface-${tint}`;
  if (cache.has(key)) return cache.get(key);
  const S = 512;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  const rnd = mulberry32(90210);
  g.fillStyle = tint;
  g.fillRect(0, 0, S, S);

  // ① 大块斑驳（低频）：石灰岩的色差
  //    ⚠ 必须做 3×3 wrap —— 跨边的斑被切断后，平铺会出现竖向接缝。
  for (let i = 0; i < 110; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 35 + rnd() * 150;
    const dark = rnd() < 0.5;
    const col = dark ? '92,90,84' : '228,224,214';
    for (const ox of [-S, 0, S]) {
      for (const oy of [-S, 0, S]) {
        const grd = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        grd.addColorStop(0, `rgba(${col},${(0.09 + rnd() * 0.14).toFixed(3)})`);
        grd.addColorStop(1, `rgba(${col},0)`);
        g.fillStyle = grd;
        g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
  }

  // ② 石脉：石灰岩里的浅色石英脉，细而断续
  //
  // ⚠ **必须 3×3 wrap**：三平面投影会把这张贴图平铺成 1.5m 一格，
  //   跨边的笔画被切断 ⇒ 每一格边界都出现一条可见的接缝。
  for (let i = 0; i < 26; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const len = 30 + rnd() * 180;
    const a = (rnd() - 0.5) * 0.9 + (rnd() < 0.5 ? 0 : Math.PI / 2);
    const cx = x + Math.cos(a) * len * 0.5 + (rnd() - 0.5) * 22;
    const cy = y + Math.sin(a) * len * 0.5 + (rnd() - 0.5) * 22;
    g.strokeStyle = `rgba(236,232,222,${(0.09 + rnd() * 0.13).toFixed(3)})`;
    g.lineWidth = 0.8 + rnd() * 2.2;
    for (const ox of [-S, 0, S]) {
      for (const oy of [-S, 0, S]) {
        g.beginPath();
        g.moveTo(x + ox, y + oy);
        g.quadraticCurveTo(cx + ox, cy + oy, x + Math.cos(a) * len + ox, y + Math.sin(a) * len + oy);
        g.stroke();
      }
    }
  }

  // ③ 凿痕：**点凿**（不是划痕）
  //
  // ⚠ 原来画的是 2.5~10px 的**细长划痕**、方向还大致一致
  //   ⇒ 在 1.5m 贴图周期下读作"拉丝金属"，不像石头。
  //   真实的细凿石面是**密集的点凿坑**（短、粗、方向随机）。
  //   同样 3×9 wrap（见上）。
  const chisel = 0; // 点凿：方向完全随机（不再是"拉丝"）
  for (let i = 0; i < 1500; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const len = 1.4 + rnd() * 2.6; // ≈ 4~11mm
    const a = rnd() * Math.PI * 2;
    g.strokeStyle = rnd() < 0.55
      ? `rgba(255,255,255,${(rnd() * 0.2).toFixed(3)})`
      : `rgba(56,54,50,${(rnd() * 0.26).toFixed(3)})`;
    g.lineWidth = 1.4 + rnd() * 1.4; // 粗 ⇒ 读作凿坑不是划痕
    g.lineCap = 'round';
    for (const ox of [-S, 0, S]) {
      for (const oy of [-S, 0, S]) {
        g.beginPath();
        g.moveTo(x + ox, y + oy);
        g.lineTo(x + Math.cos(a) * len + ox, y + Math.sin(a) * len + oy);
        g.stroke();
      }
    }
  }

  // ③b 开片：石灰岩表面细微的裂纹网（比凿痕更淡、更长）
  for (let i = 0; i < 26; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const len = 40 + rnd() * 160;
    const a = rnd() * Math.PI * 2;
    g.strokeStyle = `rgba(58,56,52,${(0.05 + rnd() * 0.09).toFixed(3)})`;
    g.lineWidth = 0.9;
    for (const ox of [-S, 0, S]) {
      for (const oy of [-S, 0, S]) {
        g.beginPath();
        g.moveTo(x + ox, y + oy);
        g.lineTo(x + Math.cos(a) * len + ox, y + Math.sin(a) * len + oy);
        g.stroke();
      }
    }
  }

  // ④ 细颗粒：一次 ImageData 批量写，避免几万次 fillRect 卡住首屏
  {
    const img = g.getImageData(0, 0, S, S);
    const d = img.data;
    for (let i = 0; i < 26000; i++) {
      const p = ((rnd() * S) | 0) * 4 + ((rnd() * S) | 0) * S * 4;
      const a = Math.round(rnd() * 26);
      const add = rnd() < 0.5 ? a : -a;
      d[p] = Math.max(0, Math.min(255, d[p] + add));
      d[p + 1] = Math.max(0, Math.min(255, d[p + 1] + add));
      d[p + 2] = Math.max(0, Math.min(255, d[p + 2] + add));
    }
    g.putImageData(img, 0, 0);
  }

  const tex = toTexture(c);
  cache.set(key, tex);
  return tex;
}

/**
 * 太湖石（假山）贴图 —— 程序化生成。
 *
 * 为什么不用现成的 stone / moss：
 *   - `stone`（AI 生成）是**切割石板**，带明显的十字拼缝，
 *     贴到假山上每块石头都会露出一个"十"字，看着像拼贴画。
 *   - `moss`（AI 生成）是**层理岩石**，有强烈的横向条带方向性，
 *     贴在不规则曲面上会拉成横条纹。
 *
 * 太湖石是**石灰岩溶蚀体**：底色灰白、质地细腻，
 * 表面有大小不一的溶蚀孔洞（"漏"）和风化斑，外加零星苔藓。
 * 所以这里画：灰白底 + 粒状斑驳 + 溶蚀麻点 + 苔斑。
 * **刻意不做任何方向性笔触** —— 方向性会暴露平铺接缝。
 */
/**
 * **欧式粗琢石（rusticated ashlar）** —— 西洋楼石墙专用。
 *
 * ## 为什么不用 AI 那张 `stone.png`
 *
 * AI 的石材贴图是**切割石板**：规则的方格 + 明显的十字拼缝，
 * 贴到西洋楼的大墙面上一眼就是"格子布"—— 这正是"贴图感"最刺眼的一处。
 * （太湖石贴图当初也是为了避开这个"十字"才单独画的。）
 *
 * ## 粗琢石长什么样
 *
 * 欧式石墙（尤其是 18~19 世纪的西洋楼）用的是**粗琢石**：
 * ① 每层石块**高度一致**，接缝**上下对齐**（不是中式错缝）；
 * ② 每块石头四周有**斜面倒角**（chamfer），边缘受光、缝里落影；
 * ③ 每块石头的**颜色都不一样**（不同批次、不同石材）；
 * ④ 表面有**细密的凿痕**（点凿/斜凿）；
 * ⑤ 中间面比边缘略凹（粗琢的手工面）。
 *
 * ## UV 约定
 *
 * 512px / 4×4 块，配合洋楼的 `UVK = 1/3`（1 UV 单位 = 3m）
 * ⇒ 一张贴图铺 3m，**每块石头 0.75m** —— 与西洋楼的大块粗琢石相符。
 */
export function rusticatedStone() {
  if (cache.has('rusticatedStone')) return cache.get('rusticatedStone');
  const S = 512;
  const N = 4; // 每边 4 块
  const cell = S / N;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  const rnd = mulberry32(20261104);
  const img = g.createImageData(S, S);
  const d = img.data;
  const put = (x, y, r, gg, b) => {
    const i = (y * S + x) * 4;
    d[i] = r;
    d[i + 1] = gg;
    d[i + 2] = b;
    d[i + 3] = 255;
  };
  for (let r = 0; r < N; r++) {
    for (let q = 0; q < N; q++) {
      // ③ 每块石头颜色不同（明度 ±11%，色相 ±3%）
      //
      // ⚠ 基色必须**压暗到暖灰**（不是白）：底色给到 186 乘材质色 0xe4e0d6
      //   ≈ 接近纯白 ⇒ 大墙面看着像"泡沫板/瓷砖"，不像石头。
      //   18~19 世纪西洋楼用的是巴黎附近的浅灰石灰岩，偏暖。
      // ⚠ 色差要**小**：真实粗琢石只有几块稍微深一点，
      //   差得大就成了"花斑/棋盘格"。
      const v = 0.955 + rnd() * 0.09;
      const warm = (rnd() - 0.5) * 0.03;
      const br = Math.floor((150 + warm * 150) * v);
      const bg = Math.floor((144 + warm * 50) * v);
      const bb = Math.floor((134 - warm * 70) * v);
      const x0 = q * cell;
      const y0 = r * cell;
      for (let y = y0; y < y0 + cell; y++) {
        for (let x = x0; x < x0 + cell; x++) {
          const dx = Math.min(x - x0, x0 + cell - 1 - x);
          const dy = Math.min(y - y0, y0 + cell - 1 - y);
          const de = Math.min(dx, dy);
          let k = 0.985; // 中间面略凹（粗凿的手工面）
          if (de < 3) {
            k = 0.60 + 0.40 * (de / 3); // 灰缝：深
          } else if (de < 10) {
            // ② 斜面倒角：朝光的一侧亮、背光的一侧暗
            const upper = y - y0 < x - x0;
            const e = upper ? 1.07 : 0.89;
            k = 1 + (e - 1) * (1 - (de - 3) / 7);
          }
          put(x, y, br * k, bg * k, bb * k);
        }
      }
      // ④ 细密凿痕（斜向短线）
      for (let i = 0; i < 300; i++) {
        const sx = x0 + 4 + rnd() * (cell - 8);
        const sy = y0 + 4 + rnd() * (cell - 8);
        const ang = (rnd() < 0.5 ? 1 : -1) * (0.3 + rnd() * 0.55);
        const len = 3 + rnd() * 7;
        for (let t = 0; t < len; t++) {
          const px = Math.round(sx + Math.cos(ang) * t);
          const py = Math.round(sy + Math.sin(ang) * t);
          if (px < x0 || px >= x0 + cell || py < y0 || py >= y0 + cell) continue;
          const i2 = (py * S + px) * 4;
          const f = 0.87 + rnd() * 0.26;
          d[i2] = Math.min(255, d[i2] * f);
          d[i2 + 1] = Math.min(255, d[i2 + 1] * f);
          d[i2 + 2] = Math.min(255, d[i2 + 2] * f);
        }
      }
    }
  }
  g.putImageData(img, 0, 0);

  /**
   * **大尺度风化斑**（画在 ImageData 之上）。
   *
   * ⚠ 这一步是"打散 3m 周期"的关键：
   *   粗琢石本身是规整网格（真实特征，不能去掉），
   *   但真实的石墙有**明显的风雨侵蚀不均** ——
   *   同一块石头不同位置深浅不同，整墙有大片的深色晕染。
   *   只靠逐块色差的话，3m 的重复周期在远处一眼可见。
   */
  for (let i = 0; i < 15; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 40 + rnd() * 120;
    const dark = rnd() < 0.55;
    for (const ox of [-S, 0, S]) {
      for (const oy of [-S, 0, S]) {
        const grd = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        grd.addColorStop(0, dark ? 'rgba(88,84,76,0.10)' : 'rgba(226,220,206,0.09)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd;
        g.beginPath();
        g.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  // 竖向水痕：雨水从檐口流下，横贯整张（跨块无缝）
  for (let i = 0; i < 22; i++) {
    const x = rnd() * S;
    g.fillStyle = `rgba(96,92,84,${0.025 + rnd() * 0.045})`;
    g.fillRect(x, 0, 1 + rnd() * 4, S);
  }

  const tex = toTexture(c);
  cache.set('rusticatedStone', tex);
  return tex;
}

/**
 * **窗纸**（槅扇/槛窗格心背后裱的那层纸）。
 *
 * 清式官式建筑的槅扇、槛窗都是**裱纸窗**：棂条在前、纸在后。
 * 纸是半透的桑皮纸，背光时泛暖黄；近看有**纤维**与轻微斑驳，
 * 绝不是一块平色。
 *
 * 256px：纤维只要"感到是纸"就够，不必看清单根纤维。
 */
export function windowPaper() {
  if (cache.has('windowPaper')) return cache.get('windowPaper');
  const S = 256;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  const rnd = mulberry32(20261106);
  // 底色：淡米黄
  g.fillStyle = '#efe2bd';
  g.fillRect(0, 0, S, S);
  // 大尺度不匀（纸浆厚薄）
  //
  // ⚠ 必须**做 3×3 wrap**（同 offset 画九遍）：贴图会平铺，
  //   跨边的斑若被切断，wrap 后就会出现一条条**竖向接缝**。
  for (let i = 0; i < 46; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 18 + rnd() * 58;
    const dark = rnd() < 0.5;
    for (const ox of [-S, 0, S]) {
      for (const oy of [-S, 0, S]) {
        const grd = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        grd.addColorStop(0, dark ? 'rgba(196,176,132,0.20)' : 'rgba(255,250,226,0.24)');
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grd;
        g.beginPath();
        g.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  // 纤维：细长的浅色短线，随机方向
  for (let i = 0; i < 900; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const a = rnd() * Math.PI;
    const len = 2 + rnd() * 9;
    g.strokeStyle = rnd() < 0.5 ? 'rgba(255,252,232,0.30)' : 'rgba(188,168,124,0.22)';
    g.lineWidth = 0.7 + rnd() * 0.6;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  // 细颗粒
  for (let i = 0; i < 900; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.16)' : 'rgba(150,132,96,0.14)';
    g.fillRect(rnd() * S, rnd() * S, 1, 1);
  }
  const tex = toTexture(c);
  cache.set('windowPaper', tex);
  return tex;
}

export function taihuStone() {
  if (cache.has('taihuStone')) return cache.get('taihuStone');
  // 512px：贴图周期 1.6m → 1px ≈ 3mm，足够表现石灰岩颗粒。
  // 1024px 在浏览器端生成要好几秒（几万次逐像素写），会卡住场景构建。
  const S = 512;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  const rnd = mulberry32(20261030);

  // 底色：太湖石是**冷灰**石灰岩（不是土黄）。
  // 偏黄会跟园里的泥土地面、赭石色墙混成一片，看着像泥块不是石头。
  g.fillStyle = '#a2a5a2';
  g.fillRect(0, 0, S, S);

  // 大块明暗：溶蚀造成的高低起伏，幅度要大（否则还是死平一块）
  for (let i = 0; i < 150; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 40 + rnd() * 170;
    const dark = rnd() < 0.5;
    const col = dark ? '88,90,90' : '186,188,184';
    for (const ox of [-S, 0, S]) {
      for (const oy of [-S, 0, S]) {
        const grd = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        grd.addColorStop(0, `rgba(${col},${0.12 + rnd() * 0.18})`);
        grd.addColorStop(1, `rgba(${col},0)`);
        g.fillStyle = grd;
        g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
  }

  // 粒状斑驳：细密的小颗粒，模拟石灰岩的粗糙表面。
  // ⚠ 用 ImageData **一次性**写像素，不要逐个 fillRect ——
  // 1024px 下 42000 次 fillRect 要好几秒，场景会卡在"正在构建"。
  {
    const img = g.getImageData(0, 0, S, S);
    const d = img.data;
    for (let i = 0; i < 16000; i++) {
      const x = (rnd() * S) | 0;
      const y = (rnd() * S) | 0;
      const light = rnd() > 0.5;
      const a = rnd() * 0.15;
      const s = 1 + ((rnd() * 2.6) | 0);
      for (let dy = 0; dy < s; dy++) {
        for (let dx = 0; dx < s; dx++) {
          const px = ((y + dy) * S + (x + dx)) * 4;
          if (px + 3 >= d.length) continue;
          const tgt = light ? 226 : 72;
          const cur = d[px];
          // 与原色按 alpha 混合（冷灰，不是偏黄）
          d[px] = cur + (tgt - cur) * a;
          d[px + 1] = d[px + 1] + ((light ? 228 : 74) - d[px + 1]) * a;
          d[px + 2] = d[px + 2] + ((light ? 224 : 74) - d[px + 2]) * a;
        }
      }
    }
    g.putImageData(img, 0, 0);
  }

  // 溶蚀麻点（"漏"的视觉来源）：小坑有深色边、底部更暗。
  // 同样用 ImageData 批量画，别用 420 次 createRadialGradient（太慢）。
  {
    const img = g.getImageData(0, 0, S, S);
    const d = img.data;
    for (let i = 0; i < 380; i++) {
      const cx = rnd() * S;
      const cy = rnd() * S;
      const r = 1.8 + rnd() * 6.5;
      const x0 = Math.max(0, Math.floor(cx - r));
      const x1 = Math.min(S - 1, Math.ceil(cx + r));
      const y0 = Math.max(0, Math.floor(cy - r));
      const y1 = Math.min(S - 1, Math.ceil(cy + r));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const dd = Math.hypot(x - cx, y - cy);
          if (dd > r) continue;
          // 中心暗、边缘淡
          const t = 1 - dd / r;
          const a = t * t * 0.55;
          const p = (y * S + x) * 4;
          if (p + 3 >= d.length) continue;
          d[p] = d[p] + (46 - d[p]) * a;
          d[p + 1] = d[p + 1] + (44 - d[p + 1]) * a;
          d[p + 2] = d[p + 2] + (40 - d[p + 2]) * a;
        }
      }
    }
    g.putImageData(img, 0, 0);
  }

  // 细石纹：**不用描边笔触**。
  //
  // ⚠ 弧线笔触在曲面上会被三平面 UV 拉成"人字纹"（近看是规则的
  // V 形折痕，像织物纹理，不像石头）。线条类笔触与程序化投影天生不合。
  // 改用**色块斑驳**（不同明暗的小色片）表现石灰岩的颗粒。
  //
  // ⚠ 性能：这些色块必须用 **ImageData 一次性写**。
  // 逐块 fillRect（5200 次）在 1024px 画布上要好几秒，
  // 场景会卡在"正在构建圆明园"。
  {
    const img = g.getImageData(0, 0, S, S);
    const d = img.data;
    for (let i = 0; i < 5200; i++) {
      const x = (rnd() * S) | 0;
      const y = (rnd() * S) | 0;
      const w = 2 + ((rnd() * 7) | 0);
      const h = 2 + ((rnd() * 7) | 0);
      // 明暗斑：大块深/浅，模拟溶蚀造成的高低起伏
      const light = rnd() > 0.5;
      const a = 0.05 + rnd() * 0.1;
      const tr = light ? 210 : 74;
      const tg = light ? 212 : 78;
      const tb = light ? 208 : 76;
      const yEnd = Math.min(S, y + h);
      const xEnd = Math.min(S, x + w);
      for (let dy = 0; y + dy < yEnd; dy++) {
        const rowBase = (y + dy) * S;
        for (let dx = 0; x + dx < xEnd; dx++) {
          const p = (rowBase + x + dx) * 4;
          d[p] = d[p] + (tr - d[p]) * a;
          d[p + 1] = d[p + 1] + (tg - d[p + 1]) * a;
          d[p + 2] = d[p + 2] + (tb - d[p + 2]) * a;
        }
      }
    }
    g.putImageData(img, 0, 0);
  }

  // 苔藓：零星绿斑，边缘不规则（用小圆点堆出锯齿边）
  // ⚠ 苔藓要**零星**：太湖石本体是**灰白石灰岩**，苔只是点缀。
  //   原来 48 处 × 透明度 0.26~0.66 ⇒ 整块石头发墨绿，
  //   远看像一堆绿石头（洋楼大水法前那几块尤其明显）。
  for (let i = 0; i < 26; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const n = 10 + Math.floor(rnd() * 20);
    const col = rnd() < 0.5 ? '96,116,58' : '72,92,44';
    for (let k = 0; k < n; k++) {
      const a = rnd() * Math.PI * 2;
      const rr = rnd() * (7 + rnd() * 18);
      g.fillStyle = `rgba(${col},${0.16 + rnd() * 0.26})`;
      g.beginPath();
      g.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr, 1.6 + rnd() * 4, 0, Math.PI * 2);
      g.fill();
    }
  }

  const tex = toTexture(c, { repeat: [1, 1] });
  cache.set('taihuStone', tex);
  return tex;
}

/** 素木色（隔扇门、窗棂底色） */
export function wood() {
  if (OVERRIDE.wood) return OVERRIDE.wood;
  if (cache.has('wood')) return cache.get('wood');
  const W = 128;
  const H = 128;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  g.fillStyle = '#7a4b2c';
  g.fillRect(0, 0, W, H);
  const rnd = mulberry32(31337);
  for (let i = 0; i < 500; i++) {
    g.strokeStyle = `rgba(${rnd() > 0.5 ? '160,110,64' : '70,42,22'},${rnd() * 0.35})`;
    g.lineWidth = 0.6 + rnd() * 1.4;
    const y = rnd() * H;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(W * 0.3, y + rnd() * 6, W * 0.7, y - rnd() * 6, W, y + rnd() * 3);
    g.stroke();
  }
  const tex = toTexture(c);
  cache.set('wood', tex);
  return tex;
}

/** 藻井（平闇），铺在梁架顶部 */
export function caoJing() {
  if (cache.has('caojing')) return cache.get('caojing');
  const W = 512;
  const H = 512;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const rnd = mulberry32(8080);
  g.fillStyle = '#14343f';
  g.fillRect(0, 0, W, H);
  // 井口方格
  const cells = 5;
  const cs = W / cells;
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < cells; j++) {
      const x = i * cs;
      const y = j * cs;
      g.fillStyle = i % 2 === j % 2 ? '#1b4a56' : '#17505a';
      g.fillRect(x + 4, y + 4, cs - 8, cs - 8);
      g.strokeStyle = PALETTE.jin;
      g.lineWidth = 2;
      g.strokeRect(x + 8, y + 8, cs - 16, cs - 16);
      // 井心旋花
      drawXuanzi(g, x + cs / 2, y + cs / 2, cs * 0.3, PALETTE.jin, 2.5);
      drawXuanzi(g, x + cs / 2, y + cs / 2, cs * 0.16, PALETTE.zhu, 2);
    }
  }
  for (let i = 0; i < 500; i++) {
    g.fillStyle = `rgba(0,0,0,${rnd() * 0.12})`;
    g.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 5, 2 + rnd() * 4);
  }
  const tex = toTexture(c);
  cache.set('caojing', tex);
  return tex;
}

/** 窗棂格心（步步锦 / 灯笼锦） */
export function latticeWindow(kind = 'bubu') {
  const key = `lattice-${kind}`;
  if (cache.has(key)) return cache.get(key);
  const W = 128;
  const H = 128;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.strokeStyle = '#6d4023';
  g.lineWidth = 5;
  g.strokeRect(0, 0, W, H);
  if (kind === 'bubu') {
    // 步步锦
    g.lineWidth = 3.4;
    const pts = [
      [0.12, 0.12, 0.88, 0.12], [0.12, 0.34, 0.66, 0.34], [0.34, 0.34, 0.34, 0.66],
      [0.34, 0.66, 0.88, 0.66], [0.66, 0.12, 0.66, 0.34], [0.66, 0.34, 0.88, 0.34],
      [0.5, 0.12, 0.5, 0.34], [0.12, 0.5, 0.34, 0.5], [0.66, 0.5, 0.88, 0.5],
      [0.12, 0.66, 0.34, 0.66], [0.34, 0.78, 0.88, 0.78], [0.88, 0.12, 0.88, 0.34],
    ];
    for (const [x1, y1, x2, y2] of pts) {
      g.beginPath();
      g.moveTo(x1 * W, y1 * H);
      g.lineTo(x2 * W, y2 * H);
      g.stroke();
    }
  } else {
    // 灯笼锦
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(W / 2, 0);
    g.lineTo(W / 2, H);
    g.moveTo(0, H / 2);
    g.lineTo(W, H / 2);
    g.stroke();
    g.beginPath();
    g.ellipse(W / 2, H / 2, W * 0.3, H * 0.3, 0, 0, Math.PI * 2);
    g.stroke();
  }
  const tex = toTexture(c, { wrap: THREE.ClampToEdgeWrapping });
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

export function disposeTextures() {
  for (const v of cache.values()) {
    if (v?.dispose) v.dispose();
    else if (v?.map?.dispose) v.map.dispose();
  }
  cache.clear();
}
