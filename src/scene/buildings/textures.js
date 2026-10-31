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
export function brickWall(tint = '#8d8a84') {
  if (OVERRIDE.brick) return OVERRIDE.brick;
  const key = `brick-${tint}`;
  if (cache.has(key)) return cache.get(key);
  const W = 256;
  const H = 256;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const rnd = mulberry32(999);
  g.fillStyle = tint;
  g.fillRect(0, 0, W, H);
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
  for (let i = 0; i < 48; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const n = 14 + Math.floor(rnd() * 28);
    const col = rnd() < 0.5 ? '96,116,58' : '72,92,44';
    for (let k = 0; k < n; k++) {
      const a = rnd() * Math.PI * 2;
      const rr = rnd() * (7 + rnd() * 18);
      g.fillStyle = `rgba(${col},${0.26 + rnd() * 0.4})`;
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
