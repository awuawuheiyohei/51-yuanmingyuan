/**
 * **歇山山墙端附属构件自检**（博风板 + 悬鱼）
 *
 * ## 为什么要有这个检查
 *
 * 原来的 `scripts/probe-hip-shanghua.mjs` 用「沿 −X 打射线，看谁先挡住」
 * 来判断"博风板有没有盖住博缝"，判据**不可靠**：
 *   · 博风板是 BoxGeometry，只有 8 个角点 ⇒ 板中段按顶点邻域测必然测不到；
 *   · 改成射线法后，取样点又正好压在 half-plane 的边界上 ⇒ 结果抖动。
 * ⇒ 结论：**不要用射线遮挡判据验构件位置**，要**把构件的位置算出来比对**。
 *
 * ## 本检查怎么判
 *
 * 博风板是规则长方体 ⇒ 它的 8 个角点可以**解析地算出来**：
 *   center = mid + q·(WB/2 − STRADDLE) + w·(EPS + TB/2)
 *   corner = center ± q·(WB/2) ± d·(len/2) ± zAx·(TB/2)
 * 把这 8 个点与 `ridge` 桶里的实际顶点逐一比对（容差 1e-4），
 * 再验三条语义：
 *
 *   ① **板的长轴就是博缝**（与博缝线的距离 = STRADDLE，不是 0）
 *   ② **板跨骑博缝**：外缘越过缝 STRADDLE、内缘压住山花 0.26m
 *      ⇒ 缝被**盖住**，而不是"内缘止于缝"（止口仍是亮缝）
 *   ③ **板凸出山墙面**（x ∈ [xh+EPS, xh+EPS+TB]）⇒ 站在屋面外看得到
 *
 * 悬鱼（`shanhua` 桶）验：背面贴住博风板外皮、凸出 0.05m、
 * 挂在山花尖正下方、z 居中、尺寸 ≈ 0.26×0.42m。
 */
import * as THREE from 'three';
import { buildRoof } from '../src/scene/buildings/parts/roof.js';
import { GABLE_TRIM } from '../src/scene/buildings/parts/roof.js';

const CASES = {
  daxie: {
    name: '大歇山（九洲清晏主殿）',
    type: 'xieshan',
    width: 38.98,
    depth: 22.61,
    eaveY: 9.17,
    rise: 10.13,
    overhang: 1.42,
    hipRunX: 5.43,
  },
  xieshan: {
    name: '歇山（奉三无私殿）',
    type: 'xieshan',
    width: 32.48,
    depth: 20.46,
    eaveY: 10.1,
    rise: 8.44,
    overhang: 1.14,
    hipRunX: 4.91,
  },
};

const { WB, TB, EPS, STRADDLE } = GABLE_TRIM;
const TOL = 1e-4;
const FISH_DEPTH = 0.05;

let failures = 0;
const fail = (msg) => {
  failures++;
  console.log(`  ✗ ${msg}`);
};

function bucketVerts(res, bucket) {
  const out = [];
  for (const g of res.geoms.get(bucket) ?? []) {
    if (!g?.attributes?.position) continue;
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) out.push(new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i)));
  }
  return out;
}

/** 点到直线（过 A、方向 d）的距离；返回 {dist, signed} */
function lineDist(p, A, d, q) {
  const rel = p.clone().sub(A);
  const along = rel.dot(d);
  const perp = rel.clone().addScaledVector(d, -along);
  return { dist: perp.length(), signed: perp.dot(q) };
}

for (const [key, spec] of Object.entries(CASES)) {
  const { name, ...rest } = spec;
  const res = buildRoof(rest);
  const Wz = rest.depth / 2 + rest.overhang;
  const xh = rest.width / 2;
  const zBreak = Wz * Math.pow(0.42, 1 / 0.62);
  const yBreak = rest.eaveY + rest.rise * 0.58;
  const ridgeY = rest.eaveY + rest.rise;

  console.log(`\n=== ${name} ===`);
  console.log(
    `  xh=${xh.toFixed(3)} zBreak=${zBreak.toFixed(4)} yBreak=${yBreak.toFixed(3)} ridgeY=${ridgeY.toFixed(3)}`
  );

  const ridge = bucketVerts(res, 'ridge');
  const shanhua = bucketVerts(res, 'shanhua');
  const dy = ridgeY - yBreak;
  const L = Math.hypot(dy, zBreak);

  for (const sgn of [-1, 1]) {
    // 山花面所在平面：x = sgn*xh
    const faceX = sgn * xh;

    // ---- 山花面本体：确认它在 x = sgn*xh 上 ----
    const facePts = shanhua.filter((v) => Math.abs(Math.abs(v.x) - xh) < 0.02);
    if (!facePts.length) fail(`${sgn > 0 ? '+X' : '−X'} 侧：山花面（shanhua 桶）缺失`);

    for (const zs of [-1, 1]) {
      const tag = `${sgn > 0 ? '+X' : '−X'}/${zs > 0 ? '+Z' : '−Z'} 博风板`;
      const before = failures;
      const A = new THREE.Vector3(faceX, ridgeY, 0);
      const d = new THREE.Vector3(0, -dy / L, (zs * zBreak) / L);
      const q = new THREE.Vector3(0, (-zs * zBreak) / L, -dy / L);
      const B = A.clone().addScaledVector(d, L);
      const Be = B.clone().addScaledVector(d, 0.2);
      const len = A.distanceTo(Be);
      const mid = A.clone().add(Be).multiplyScalar(0.5);
      const w = new THREE.Vector3(sgn, 0, 0);
      const center = mid
        .clone()
        .addScaledVector(q, WB / 2 - STRADDLE)
        .addScaledVector(w, EPS + TB / 2);
      const zAx = new THREE.Vector3().crossVectors(q, d);

      // ① 8 个角点解析算出来，逐个在 ridge 桶里找
      let found = 0;
      const corners = [];
      for (const sx of [-1, 1])
        for (const sy of [-1, 1])
          for (const sz of [-1, 1]) {
            const c = center
              .clone()
              .addScaledVector(q, (sx * WB) / 2)
              .addScaledVector(d, (sy * len) / 2)
              .addScaledVector(zAx, (sz * TB) / 2);
            corners.push({ c, sx, sy, sz });
            const hit = ridge.find((v) => v.distanceTo(c) < TOL);
            if (hit) found++;
          }
      if (found < 8) {
        fail(`${tag}：8 个角点只找到 ${found} 个（博风板几何没生成或位置不对）`);
        continue;
      }

      // ② 板的长轴必须**平行博缝**（不是横跨、也不是斜的）
      //    中心线相对博缝的垂直偏移 = WB/2 − STRADDLE
      //      （板心在缝的**山花侧** WB/2−STRADDLE 处 ⇒ 外缘才越过缝）
      const axisPt = center.clone().addScaledVector(w, -(EPS + TB / 2));
      const { signed } = lineDist(axisPt, A, d, q);
      if (Math.abs(signed - (WB / 2 - STRADDLE)) > 0.005) {
        fail(`${tag}：板中心线与博缝距离 ${signed.toFixed(4)} m，应为 ${(WB / 2 - STRADDLE).toFixed(4)}`);
      }

      // ③ 外缘越过缝、内缘压住山花
      const outerEdge = corners.filter((k) => k.sx === -1).map((k) => k.c);
      const innerEdge = corners.filter((k) => k.sx === 1).map((k) => k.c);
      const outerSigned = outerEdge.map((c) => lineDist(c, A, d, q).signed);
      const innerSigned = innerEdge.map((c) => lineDist(c, A, d, q).signed);
      if (Math.min(...outerSigned) > -STRADDLE + 0.005) {
        fail(`${tag}：外缘没有越过博缝（最外 signed=${Math.min(...outerSigned).toFixed(4)}，应 ≤ −${STRADDLE}）`);
      }
      if (Math.min(...innerSigned) < 0.15) {
        fail(`${tag}：内缘没有压住山花（最小 signed=${Math.min(...innerSigned).toFixed(4)}，应 ≥ 0.15）`);
      }

      // ④ 板凸出山墙面
      const xs = corners.map((k) => k.c.x);
      const xLo = Math.min(...xs);
      const xHi = Math.max(...xs);
      const wantLo = sgn > 0 ? xh + EPS : -(xh + EPS + TB);
      const wantHi = sgn > 0 ? xh + EPS + TB : -(xh + EPS);
      if (Math.abs(xLo - wantLo) > TOL || Math.abs(xHi - wantHi) > TOL) {
        fail(`${tag}：板在 x 方向 [{xLo.toFixed(4)}, ${xHi.toFixed(4)}]，应为 [${wantLo.toFixed(4)}, ${wantHi.toFixed(4)}]`);
      }

      // ⑤ 上端必须**顶到山花尖 A**、下端必须越过山花底角 B 0.2m
      //    判据：板的**端面中点**沿缝方向 d 的坐标 —— 上端 = A，下端 = Be
      const topMid = corners
        .filter((k) => k.sy === -1)
        .map((k) => k.c)
        .reduce((a, b) => a.add(b))
        .multiplyScalar(0.25);
      const botMid = corners
        .filter((k) => k.sy === 1)
        .map((k) => k.c)
        .reduce((a, b) => a.add(b))
        .multiplyScalar(0.25);
      const topAlong = topMid.clone().sub(A).dot(d);
      if (Math.abs(topAlong) > 0.02) {
        fail(`${tag}：板上端沿缝方向偏离山花尖 ${topAlong.toFixed(4)} m（应为 0）`);
      }
      const botAlong = botMid.clone().sub(Be).dot(d);
      if (Math.abs(botAlong) > 0.02) {
        fail(`${tag}：板下端沿缝方向偏离搭接点 ${botAlong.toFixed(4)} m（应为 0）`);
      }
      // 端面中点还应落在山花尖的**法向偏移**上（= 板心偏移量）
      const topPerp = lineDist(topMid, A, d, q).signed;
      if (Math.abs(topPerp - (WB / 2 - STRADDLE)) > 0.005) {
        fail(`${tag}：板上端法向偏移 ${topPerp.toFixed(4)} m，应为 ${(WB / 2 - STRADDLE).toFixed(4)}`);
      }

      if (failures === before)
        console.log(
          `  ✅ ${tag}：8 角点齐全 · 跨骑 ${STRADDLE}m · 凸出 ${(TB * 100).toFixed(0)}cm · 上端顶山花尖 · 下端搭接 0.20m`
        );
    }

    // ---- 悬鱼 ----
    const fish = shanhua.filter((v) => {
      const dx = Math.abs(v.x) - (xh + EPS + TB);
      return dx > -0.02 && dx < FISH_DEPTH + 0.02 && v.y > ridgeY - 0.7 && v.y < ridgeY + 0.05;
    });
    if (!fish.length) {
      fail(`${sgn > 0 ? '+X' : '−X'} 侧：悬鱼缺失`);
    } else {
      const fy = fish.map((v) => v.y);
      const fz = fish.map((v) => v.z);
      const fx = fish.map((v) => Math.abs(v.x));
      const h = Math.max(...fy) - Math.min(...fy);
      const w = Math.max(...fz) - Math.min(...fz);
      const zc = (Math.max(...fz) + Math.min(...fz)) / 2;
      const back = Math.min(...fx);
      const front = Math.max(...fx);
      const ok = [];
      if (Math.abs(h - 0.42) > 0.03) ok.push(`高 ${h.toFixed(3)}（应 ≈0.42）`);
      if (Math.abs(w - 0.26) > 0.03) ok.push(`宽 ${w.toFixed(3)}（应 ≈0.26）`);
      if (Math.abs(zc) > 0.02) ok.push(`z 偏心 ${zc.toFixed(3)}（应 0）`);
      if (Math.abs(back - (xh + EPS + TB)) > 0.02) ok.push(`背面 ${back.toFixed(4)}（应贴板皮 ${(xh + EPS + TB).toFixed(4)}）`);
      if (front - back < FISH_DEPTH - 0.02) ok.push(`凸出 ${(front - back).toFixed(4)}（应 ≈${FISH_DEPTH}）`);
      if (ok.length) fail(`${sgn > 0 ? '+X' : '−X'} 侧悬鱼：${ok.join('；')}`);
      else
        console.log(
          `  ✅ ${sgn > 0 ? '+X' : '−X'} 侧悬鱼：${(w * 100).toFixed(0)}×${(h * 100).toFixed(0)}cm · 贴板皮 · 凸出 ${((front - back) * 100).toFixed(0)}cm`
        );
    }
  }
}

console.log('');
if (failures) {
  console.log(`❌ 歇山山墙端附属构件自检：${failures} 项不合格`);
  process.exit(1);
}
console.log('✅ 歇山山墙端附属构件自检：博风板跨骑博缝、悬鱼到位');
