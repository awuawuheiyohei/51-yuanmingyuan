/**
 * 挑一个「能拍到假山、且机位不会被建筑挡住」的取景点。
 *
 * 用途：验收假山形态时，相机要能站到假山前面平视它。
 * 之前用 ?view=at 直接拍，机位常常落进院子里 —— 满屏红墙，什么都看不见。
 *
 * 做法：
 *   1. 候选 = 假山表里最大的若干座（h*r 大 = 假山本身够大，看得出细节）
 *   2. 对每座，沿 8 个方位角找机位，要求：
 *      - 机位不在任何建筑轮廓的包围圆里
 *      - 机位到假山中心的连线上没有建筑挡住
 *   3. 输出 URL，直接贴进浏览器就能拍。
 *
 * 用法：node scripts/pick-rock-view.mjs [要几个]
 */
import fs from 'node:fs';

const scene = JSON.parse(fs.readFileSync('public/scene/scene.json', 'utf8'));
const rockery = scene.rockery || [];
const buildings = scene.buildings || [];

/** 建筑的平面包围圆（中心 + 半径） */
const circles = buildings.map((b) => {
  const ring = b.ring || [];
  if (!ring.length) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of ring) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  return { cx, cz, r: Math.hypot(maxX - cx, maxZ - cz), h: b.h || 0 };
}).filter(Boolean);

/** 点是否落在某个建筑里 */
function inBuilding(x, z, pad = 0) {
  for (const c of circles) {
    if (Math.hypot(x - c.cx, z - c.cz) < c.r + pad) return c;
  }
  return null;
}

/** 线段（假山中心→机位）是否被建筑挡住 */
function blocked(ax, az, bx, bz) {
  const steps = 24;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    if (inBuilding(x, z, 1.5)) return true;
  }
  return false;
}

const want = Number(process.argv[2] || 4);
const cands = [...rockery].sort((a, b) => b.h * b.r - a.h * a.r).slice(0, 60);
const found = [];

for (const rk of cands) {
  if (found.length >= want) break;
  // 机位距离：按假山高度取，要能看清形态又不能太远
  const d = Math.max(16, Math.min(rk.h * 2.6, 44));
  for (const yaw of [0.5, 1.0, 1.6, 2.2, 2.8, 3.4, 4.0, 4.6, 5.2, 5.8]) {
    const camX = rk.x + Math.sin(yaw) * d;
    const camZ = rk.z + Math.cos(yaw) * d;
    if (inBuilding(camX, camZ, 4)) continue; // 机位自己不能泡在院子里
    if (blocked(rk.x, rk.z, camX, camZ)) continue; // 视线不能被挡
    found.push({ rk, camX, camZ, yaw, d });
    break;
  }
}

console.log(`找到 ${found.length} 个可用机位：\n`);
for (const f of found) {
  const url =
    `http://127.0.0.1:5180/?view=rock&hud=0&x=${f.rk.x.toFixed(1)}&z=${f.rk.z.toFixed(1)}` +
    `&d=${f.d.toFixed(0)}&yaw=${f.yaw.toFixed(2)}&eh=2.2`;
  console.log(`假山 x=${f.rk.x.toFixed(0)} z=${f.rk.z.toFixed(0)} r=${f.rk.r.toFixed(1)} h=${f.rk.h.toFixed(1)}`);
  console.log(`  机位 (${f.camX.toFixed(0)}, ${f.camZ.toFixed(0)}) 距离 ${f.d.toFixed(0)}m`);
  console.log(`  ${url}\n`);
}
