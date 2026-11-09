#!/usr/bin/env node
/**
 * **导览图配准：补控制点 + 最小二乘重拟合**
 *
 * ## 为什么需要这一步
 *
 * 圆明园管理处官方导览图（10016×5197）是**现状图**：西洋楼一带只标了
 * 「西洋楼遗址」一个总名，**养雀笼、蓄水楼都没有单体标注** ⇒
 * 无法像谐奇趣那样"在图上读像素"。
 *
 * ## 这两处的锚点从哪来
 *
 * **OpenStreetMap 的实测坐标**（`data/raw/osm-poi.json`）：
 * 公园把这两处作为 `tourism=attraction` 标了出来：
 *   养雀笼  116.3019642, 40.0115385
 *   蓄水楼  116.3055087, 40.0118965（name:en = "Water Reservior for Fountains"）
 * 这与现有 24 个控制点用的是**同一类数据**（都是 OSM 实测坐标），
 * 不是一个量级的问题。
 *
 * ## 流程
 *
 * 1. 用**现有**仿射的逆变换，把这两个经纬度**反解**成导览图像素坐标；
 * 2. 把它们作为**新的控制点**加进 `data/guide-georef.json`；
 * 3. 用全部控制点**重新最小二乘拟合**仿射，更新 coeff 与残差统计。
 *
 * ⚠ **诚实说明**：第 1 步是从旧变换反解的，所以第 3 步的重拟合对这两点
 *   等于"零信息增量"（新点本来就落在旧直线上），整体系数只会微调。
 *   真正的价值是：**这两处的经纬度从此进入控制点表**，
 *   以后任何一次重配准都会带上它们；而且它们的坐标来源（OSM 实测）
 *   比"图上读像素"更硬。
 *
 * 用法：node scripts/regeoref.mjs [--dry]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(root, 'data/guide-georef.json');
const dry = process.argv.includes('--dry');

const geo = JSON.parse(fs.readFileSync(FILE, 'utf8'));

/* ------------------------------------------------ 新控制点（OSM 实测坐标） */
const NEW_POINTS = [
  {
    name: '养雀笼',
    lon: 116.3019642,
    lat: 40.0115385,
    source: 'OSM tourism=attraction（实测）；与考据「养雀笼东边是谐奇趣」相符',
  },
  {
    name: '蓄水楼',
    lon: 116.3055087,
    lat: 40.0118965,
    source:
      'OSM tourism=attraction（实测，name:en = Water Reservior for Fountains）；' +
      '与考据「谐奇趣西北」有出入，取实测',
  },
];

/* ------------------------------------------- 仿射：lon = a0x + a1y + a2 等 */
const c = geo.coeff;
const [a0, a1, a2] = c.lon;
const [b0, b1, b2] = c.lat;

/** 用现系数反解像素坐标 */
function invToPixel(lon, lat) {
  const u = lon - a2;
  const v = lat - b2;
  const det = a0 * b1 - a1 * b0;
  return {
    x: (u * b1 - a1 * v) / det,
    y: (a0 * v - b0 * u) / det,
  };
}

/** 最小二乘拟合一个轴：y = p0*x + p1*y + p2（注意别与外层 y 混淆） */
function fit(pts, axis) {
  // 法方程：A^T A · p = A^T b，A 的行 = [x, y, 1]
  let sxx = 0, sxy = 0, sx = 0, syy = 0, sy = 0, n = 0;
  let bx = 0, by = 0, bn = 0;
  for (const p of pts) {
    const X = p.x, Y = p.y, B = p[axis];
    sxx += X * X; sxy += X * Y; sx += X;
    syy += Y * Y; sy += Y; n += 1;
    bx += X * B; by += Y * B; bn += B;
  }
  // 解 3×3 对称方程组（高斯消元）
  const M = [
    [sxx, sxy, sx, bx],
    [sxy, syy, sy, by],
    [sx, sy, n, bn],
  ];
  for (let i = 0; i < 3; i++) {
    let piv = i;
    for (let k = i + 1; k < 3; k++) if (Math.abs(M[k][i]) > Math.abs(M[piv][i])) piv = k;
    [M[i], M[piv]] = [M[piv], M[i]];
    for (let k = i + 1; k < 3; k++) {
      const f = M[k][i] / M[i][i];
      for (let j = i; j < 4; j++) M[k][j] -= f * M[i][j];
    }
  }
  const p = [0, 0, 0];
  for (let i = 2; i >= 0; i--) {
    let s = M[i][3];
    for (let j = i + 1; j < 3; j++) s -= M[i][j] * p[j];
    p[i] = s / M[i][i];
  }
  return p;
}

/* ------------------------------------------------------- 1. 反解像素坐标 */
const existing = new Set(geo.controlPoints.map((p) => p.name));
for (const np of NEW_POINTS) {
  if (existing.has(np.name)) {
    console.log(`  · ${np.name} 已在控制点表里，跳过`);
    continue;
  }
  const { x, y } = invToPixel(np.lon, np.lat);
  geo.controlPoints.push({
    name: np.name,
    x: Math.round(x),
    y: Math.round(y),
    lon: np.lon,
    lat: np.lat,
    source: np.source,
  });
  console.log(
    `  + ${np.name}：反解像素 (${Math.round(x)}, ${Math.round(y)})  ` +
      `lon ${np.lon} lat ${np.lat}`
  );
}

/* --------------------------------------------------------- 2. 重拟合 + 残差 */
const lonP = fit(geo.controlPoints, 'lon');
const latP = fit(geo.controlPoints, 'lat');

const M_PER_DEG_LON = 111320 * Math.cos((40.005 * Math.PI) / 180);
const M_PER_DEG_LAT = 110574;

const residuals = [];
for (const p of geo.controlPoints) {
  const plon = lonP[0] * p.x + lonP[1] * p.y + lonP[2];
  const plat = latP[0] * p.x + latP[1] * p.y + latP[2];
  const dx = (plon - p.lon) * M_PER_DEG_LON;
  const dy = (plat - p.lat) * M_PER_DEG_LAT;
  residuals.push({ name: p.name, d: Math.hypot(dx, dy) });
}
residuals.sort((x, y) => x.d - y.d);
const med = residuals[Math.floor(residuals.length / 2)].d;
const max = residuals[residuals.length - 1].d;

console.log('');
console.log(`  控制点 ${geo.controlPoints.length} 个，重拟合后残差（中位/最大）：`);
console.log(`    ${med.toFixed(0)} m / ${max.toFixed(0)} m`);
console.log(
  `    最大残差：${residuals.slice(-3).map((r) => `${r.name} ${r.d.toFixed(0)}m`).join('、')}`
);

/* ------------------------------------------------------------ 3. 写回文件 */
geo.coeff = { lon: lonP, lat: latP };
geo.method = geo.method || {};
geo.method.approach =
  '人工/工具在原图上读取景区标注文字的像素位置，与 OpenStreetMap 实测坐标做最小二乘仿射配准（平面相似变换）；' +
  '养雀笼与蓄水楼在图上无单体标注，其像素由旧变换反解、经纬度取 OSM 实测值';
geo.method.residualMedianM = Math.round(med);
geo.method.residualMaxM = Math.round(max);
geo.method.controlPointCount = geo.controlPoints.length;
geo.method.note =
  '养雀笼 / 蓄水楼：OSM 官方标注的实测坐标（非图上读像素），已并入控制点表';

if (dry) {
  console.log('  (--dry，未写文件)');
} else {
  fs.writeFileSync(FILE, JSON.stringify(geo, null, 2) + '\n');
  console.log(`  ✓ 已写回 ${path.relative(root, FILE)}`);
}
