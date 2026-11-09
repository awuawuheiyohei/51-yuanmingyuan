#!/usr/bin/env node
/**
 * **配准核对图**：把控制点与两座新建筑叠加到官方导览图上，导出全景核对图。
 *
 * ## 产出
 *
 *   /tmp/guide-overlay.html   —— 一个自包含的核对页（SVG 叠加在导览图上）
 *   /tmp/guide-full.png       —— 全图 + 26 个控制点 + 放大区框
 *   /tmp/guide-west.png       —— 西洋楼区放大 + 全部点名 + 两座新建筑高亮
 *
 * ## 为什么要有这张图
 *
 * 配准这件事**只能靠眼睛收尾**：系数、残差都是数，但"控制点是不是压在
 * 对应的建筑上"必须看图。养雀笼 / 蓄水楼这两处是**反解**出来的
 * （图上没有标注），更需要一张图来确认它们落在合理的位置。
 *
 * 用法：
 *   node scripts/guide-overlay.mjs          # 生成 HTML
 *   scripts/guide-overlay.mjs --shot       # 生成 HTML 并用无头 Chrome 出图
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const geo = JSON.parse(fs.readFileSync(path.join(root, 'data/guide-georef.json'), 'utf8'));

const GUIDE = path.join(root, 'data/raw/yuanmingyuan-guide.jpg');
const OUT_HTML = '/tmp/guide-overlay.html';

/** 放大核对区：西洋楼一带 */
const ZOOM = { x: 4380, y: 1060, w: 1500, h: 620, scale: 1400 / 1500 };

const c = geo.coeff;
const [a0, a1, a2] = c.lon;
const [b0, b1, b2] = c.lat;

/** 像素 → 经纬度（用当前拟合系数） */
function pxToLonLat(x, y) {
  return [a0 * x + a1 * y + a2, b0 * x + b1 * y + b2];
}

const readPts = Object.entries(geo.readPoints || {})
  .filter(([k]) => k !== '_comment')
  .map(([name, p]) => ({ ...p, name, isRead: true, isNew: false }));

/** 本轮新定位的两处（都在 readPoints 里：图上读现状轮廓，属推定锚点） */
const NEW_ONES = new Set(['养雀笼', '蓄水楼']);

const pts = geo.controlPoints.map((p) => {
  const [lon, lat] = pxToLonLat(p.x, p.y);
  return {
    ...p,
    isNew: false,
    isRead: false,
    dLon: (lon - p.lon) * 85250, // m
    dLat: (lat - p.lat) * 110574, // m
  };
});

/** 两处新锚点：像素 + 由拟合变换给出的经纬度 */
const newPts = readPts
  .filter((p) => NEW_ONES.has(p.name))
  .map((p) => ({ ...p, isNew: true, isRead: false }));

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** 一组标记的 SVG（坐标用原图像素，调用方负责 viewBox/缩放） */
function markers({ showAllLabels = false, big = 1 } = {}) {
  let s = '';
  // 图上读出的标注点（OSM 无实测坐标）—— 另一类，用橙色
  for (const p of readPts) {
    const r = 5 * big;
    s += `<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="#ffb300" fill-opacity="0.85" stroke="#101010" stroke-width="${1.6 * big}"/>`;
    if (showAllLabels) {
      s += `<text x="${p.x + r * 1.5}" y="${p.y + r * 0.9}" font-size="${16 * big}" font-family="PingFang SC,Microsoft YaHei,sans-serif" fill="#ffb300" stroke="#0b0b0b" stroke-width="${3.4 * big}" paint-order="stroke">${esc(p.name)}</text>`;
    }
  }
  for (const p of [...pts, ...newPts]) {
    const col = p.isNew ? '#ff2d9b' : '#00e5ff';
    const r = (p.isNew ? 13 : 7) * big;
    s += `<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="${col}" fill-opacity="${p.isNew ? 0.95 : 0.8}" stroke="#101010" stroke-width="${2 * big}"/>`;
    if (p.isNew) {
      s += `<circle cx="${p.x}" cy="${p.y}" r="${r * 2.1}" fill="none" stroke="${col}" stroke-width="${2.4 * big}" stroke-dasharray="${8 * big} ${6 * big}"/>`;
      s += `<text x="${p.x + r * 2.4}" y="${p.y - r}" font-size="${30 * big}" font-family="PingFang SC,Microsoft YaHei,sans-serif" font-weight="700" fill="#ff2d9b" stroke="#ffffff" stroke-width="${5 * big}" paint-order="stroke">${esc(p.name)}</text>`;
    } else if (showAllLabels) {
      s += `<text x="${p.x + r * 1.6}" y="${p.y + r * 0.9}" font-size="${20 * big}" font-family="PingFang SC,Microsoft YaHei,sans-serif" fill="#00e5ff" stroke="#0b0b0b" stroke-width="${4 * big}" paint-order="stroke">${esc(p.name)}</text>`;
    }
  }
  return s;
}

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:#101010;color:#e8e8e8;
    font-family:"PingFang SC","Microsoft YaHei",sans-serif}
  .bar{padding:10px 16px;font-size:15px;background:#1b1b1b;border-bottom:1px solid #333}
  .bar b{color:#ffd54a}
  .panel{padding:12px 16px}
  .ttl{font-size:14px;color:#9ad;margin:6px 0}
  .frame{position:relative;display:inline-block;border:1px solid #444;line-height:0}
  svg{position:absolute;left:0;top:0}
  .legend{margin:8px 0 0;font-size:13px;color:#bbb}
  .sw{display:inline-block;width:11px;height:11px;border-radius:50%;vertical-align:-1px;margin-right:4px}
</style></head><body>
<div class="bar">
  圆明园导览图配准核对 · 官方导览图 ${geo.source.pixelSize[0]}×${geo.source.pixelSize[1]}
  · 控制点 <b>${pts.length}</b> 个 + 新定位 <b>${newPts.length}</b> 处
  · 残差中位 <b>${geo.method.residualMedianM} m</b> / 最大 <b>${geo.method.residualMaxM} m</b>
</div>

<div class="panel">
  <div class="ttl">① 全图：${pts.length} 个控制点的分布（青＝原有 24 个；品红＝本轮据史料新定位的养雀笼、蓄水楼；红框为下方放大区）</div>
  <div class="frame" id="f1" style="width:1400px;overflow:hidden">
    <img src="file://${GUIDE}" width="1400" style="display:block">
    <svg id="s1" width="1400" height="727" viewBox="0 0 ${geo.source.pixelSize[0]} ${geo.source.pixelSize[1]}">${markers({ big: 5 })}</svg>
  </div>
  <div class="legend">
    <span class="sw" style="background:#00e5ff"></span>原有控制点（OSM 实测 / 图上读像素）
    <span class="sw" style="background:#ffb300;margin-left:14px"></span>图上读出的标注点（OSM 无实测坐标）
    <span class="sw" style="background:#ff2d9b;margin-left:14px"></span>本轮据史料新定位：养雀笼、蓄水楼（图上读现状轮廓，推定锚点）
  </div>
</div>

<div class="panel">
  <div class="ttl">② 放大核对：西洋楼一带（${ZOOM.x},${ZOOM.y} 起 ${ZOOM.w}×${ZOOM.h}）—— 圆点压在对应建筑上即配准可靠</div>
  <div class="frame" id="f2" style="width:1400px;height:${Math.round(ZOOM.h * ZOOM.scale)}px;overflow:hidden">
    <img src="file://${GUIDE}" width="${Math.round(geo.source.pixelSize[0] * ZOOM.scale)}"
         style="position:absolute;left:${-Math.round(ZOOM.x * ZOOM.scale)}px;top:${-Math.round(ZOOM.y * ZOOM.scale)}px">
    <svg width="1400" height="${Math.round(ZOOM.h * ZOOM.scale)}" viewBox="${ZOOM.x} ${ZOOM.y} ${ZOOM.w} ${ZOOM.h}">${markers({ showAllLabels: true, big: 1 })}</svg>
  </div>
</div>

<div class="panel">
  <div class="ttl">③ 控制点残差表（拟合位置 ↔ 实测位置的差，米）</div>
  <table style="font-size:13px;border-collapse:collapse">
    <tr style="color:#9ad;text-align:left"><th style="padding:3px 10px">点名</th><th>像素</th><th>残差 (m)</th><th>来源</th></tr>
    ${[...pts]
      .sort((a, b) => Math.hypot(b.dLon, b.dLat) - Math.hypot(a.dLon, a.dLat))
      .map(
        (p) => `<tr><td style="padding:2px 10px;color:${p.isNew ? '#ff2d9b' : '#eee'}">${esc(p.name)}${p.isNew ? ' ★' : ''}</td>
      <td style="padding:2px 10px">(${p.x}, ${p.y})</td>
      <td style="padding:2px 10px">${Math.hypot(p.dLon, p.dLat).toFixed(0)}</td>
      <td style="padding:2px 10px;color:#8a8a8a">${esc(p.source || '图上读像素 + OSM 实测')}</td></tr>`
      )
      .join('')}
  </table>
</div>
</body></html>`;

fs.writeFileSync(OUT_HTML, html);
console.log(`✓ ${OUT_HTML}`);
console.log(`  控制点 ${pts.length} 个 + 新定位 ${newPts.length} 处（${[...NEW_ONES].join('、')}）`);

if (process.argv.includes('--shot')) {
  const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const { execFileSync } = await import('node:child_process');
  // 整页一张图：全图 + 放大区 + 残差表
  execFileSync(
    CHROME,
    [
      '--headless=new', '--use-angle=metal', '--enable-gpu', '--hide-scrollbars',
      '--allow-file-access-from-files', '--window-size=1480,2280',
      '--virtual-time-budget=30000', '--screenshot=/tmp/guide-check.png',
      `file://${OUT_HTML}`,
    ],
    { stdio: 'ignore' }
  );
  console.log('✓ /tmp/guide-check.png');
}
