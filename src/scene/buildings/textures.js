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
 */
export function roofTiles() {
  if (cache.has('roofTiles')) return cache.get('roofTiles');
  const W = 256;
  const H = 256;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const rnd = mulberry32(20240713);

  g.fillStyle = '#5d5f63';
  g.fillRect(0, 0, W, H);

  const cols = 16; // 垄数
  const colW = W / cols;
  for (let i = 0; i < cols; i++) {
    const x = i * colW;
    // 每条垄：中间亮（筒瓦脊），两侧暗（瓦沟）
    const grad = g.createLinearGradient(x, 0, x + colW, 0);
    grad.addColorStop(0.0, '#3f4245');
    grad.addColorStop(0.12, '#6a6d70');
    grad.addColorStop(0.38, '#82858a');
    grad.addColorStop(0.5, '#8b8e93');
    grad.addColorStop(0.62, '#82858a');
    grad.addColorStop(0.88, '#6a6d70');
    grad.addColorStop(1.0, '#3f4245');
    g.fillStyle = grad;
    g.fillRect(x, 0, colW, H);

    // 瓦片搭接缝（横向）
    const rows = 14;
    for (let r = 1; r < rows; r++) {
      const y = (r / rows) * H;
      g.strokeStyle = `rgba(30,32,35,${0.30 + rnd() * 0.14})`;
      g.lineWidth = 1.4;
      g.beginPath();
      g.moveTo(x + 1, y);
      g.lineTo(x + colW - 1, y);
      g.stroke();
      // 缝下高光
      g.strokeStyle = 'rgba(190,192,196,0.18)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x + 1, y + 1.6);
      g.lineTo(x + colW - 1, y + 1.6);
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
  if (cache.has('roofTilesNormal')) return cache.get('roofTilesNormal');
  const W = 256;
  const H = 256;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  const cols = 16;
  const rows = 14;

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
export function stone() {
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

/** 素木色（隔扇门、窗棂底色） */
export function wood() {
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
