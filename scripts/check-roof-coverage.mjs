#!/usr/bin/env node
/**
 * **歇山屋面覆盖自检** —— 向上打射线，逐点检查屋面是否连续封闭。
 *
 * ## 为什么查这个
 *
 * 实测：歇山顶部的山花两侧会**破开两个大洞**，直接看见屋架（人字梁）。
 * 肉眼看图只能猜"是屋面没生成 / 是山花没封 / 是折线处有缝"，
 * 而**射线覆盖检测**能一次说清：哪个 (x,z) 位置上方没有屋面。
 *
 * ## 判据
 *
 * 对屋面覆盖范围内的采样点，沿 +Y 打射线：
 *   - `|x| ≤ xh` 且 `|z| ≤ zBreak`（上部悬山段）→ 应命中 **tile**（屋面）
 *   - `|x| > xh` 且 `|z| ≤ zBreak`（山面 / 山花区）→ 应命中 **shanhua**（山花板）
 *   - 其余（庑殿段）→ 应命中 **tile**
 *
 * 用法：node scripts/check-roof-coverage.mjs
 */
import * as THREE from 'three';
import { buildRoof } from '../src/scene/buildings/parts/roof.js';

const CASES = [
  {
    name: '大歇山（九州清晏主殿 grand 7×5）',
    spec: {
      width: 38.98, depth: 22.61, eaveY: 9.17, rise: 10.13, type: 'xieshan',
      overhang: 1.42, overhangX: 1.14, hipRunX: 5.43, upturn: 0.8, bulge: 0.45, segments: 30,
    },
  },
  {
    name: '歇山（奉三无私殿 hall 7×5）',
    spec: {
      width: 32.48, depth: 20.46, eaveY: 10.1, rise: 8.44, type: 'xieshan',
      overhang: 1.14, overhangX: 0.91, hipRunX: 4.91, upturn: 0.8, bulge: 0.45, segments: 30,
    },
  },
  {
    name: '歇山（圆明园殿 hall 5×3）',
    spec: {
      width: 23.84, depth: 15.02, eaveY: 9.1, rise: 6.2, type: 'xieshan',
      overhang: 1.14, overhangX: 0.91, hipRunX: 3.6, upturn: 0.8, bulge: 0.45, segments: 30,
    },
  },
];

let bad = 0;
for (const c of CASES) {
  const res = buildRoof(c.spec);
  const { Wx, Wz, xh, zBreak, eaveY, ridgeY, yBreak } = res.meta;
  // 每个桶合成一个 mesh 便于射线
  const meshes = [];
  for (const [key, list] of res.geoms) {
    const geos = list.filter((g) => g && g.attributes && g.attributes.position);
    if (!geos.length) continue;
    for (const g of geos) {
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial());
      m.name = key;
      m.updateMatrixWorld(true);
      meshes.push(m);
    }
  }
  const rc = new THREE.Raycaster();
  const up = new THREE.Vector3(0, 1, 0);
  const down = new THREE.Vector3(0, -1, 0);

  const holes = { tile: 0, shanhua: 0 };
  const samples = { tile: 0, shanhua: 0 };
  const N = 24;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const x = -Wx + (2 * Wx * i) / N;
      const z = -Wz + (2 * Wz * j) / N;
      // ⚠ 翼角起翘区（|x| > Wx-0.6 的四角逐渐外扩抬升），
      //   垂直射线会从斜面边擦过去 —— 那是**设计如此**，不是缺口。
      if (Math.abs(x) > Wx - 0.6) continue;
      // ⚠ 上下两段屋面在 |z| = zBreak 处**交于一条棱**，
      //   采样点正好落在棱上时垂直射线会从两个面的交界处擦过去 —— 不是缺口。
      //   （网格现在把 z=±zBreak 做成了网格线，所以只跳过极窄的一条。）
      if (Math.abs(Math.abs(z) - zBreak) < 0.06) continue;
      const isGable = Math.abs(z) <= zBreak && Math.abs(x) > xh;
      if (isGable) {
        // 山花板是**垂直于 x 轴**的面，向上打射线永远打不中 ⇒ 改打水平射线，
        // 从山面外侧朝山花平面打。
        //
        // ⚠ 山头由**两段**封住，缺一不可：
        //   · yBreak **以上** = 山花三角（'shanhua' 桶，旋子彩画）
        //   · yBreak **以下** = 山墙（'wall' 桶，抹红灰砖墙）
        //   所以要打**两条**水平射线：低的一条查山墙，高的一条查山花。
        const dir = new THREE.Vector3(-Math.sign(x) || 1, 0, 0);
        rc.set(new THREE.Vector3(x + Math.sign(x) * 3, eaveY + 1.5, z), dir);
        rc.far = 12;
        let names = rc.intersectObjects(meshes, false).map((h) => h.object.name);
        samples.shanhua++;
        const wallOk = names.includes('wall');
        // 高处那条：山花三角。山花是**尖朝上**的三角（脊处最高、折线处收成一条边），
        // 所以打射线的高度要随 |z| 变化，取三角形内部靠下一点的位置。
        // 靠近折线（|z| → zBreak）三角已经收成一条边 ⇒ 只查山墙。
        let flowerOk = true;
        if (Math.abs(z) <= zBreak * 0.7) {
          const yTop = ridgeY - (ridgeY - yBreak) * (Math.abs(z) / zBreak);
          const y = yBreak + (yTop - yBreak) * 0.45 + 0.08;
          rc.set(new THREE.Vector3(x + Math.sign(x) * 3, y, z), dir);
          rc.far = 12;
          names = rc.intersectObjects(meshes, false).map((h) => h.object.name);
          flowerOk = names.includes('shanhua');
        }
        if (!wallOk || !flowerOk) {
          holes.shanhua++;
          if (holes.shanhua <= 6) {
            console.log(
              `     · 缺山头：(${x.toFixed(1)}, ${z.toFixed(1)}) ` +
                `山墙 ${wallOk ? '有' : '缺'} / 山花 ${flowerOk ? '有' : '缺'}`
            );
          }
        }
        continue;
      }
      // 屋面区：⚠ 必须**从上方往下**打 ——
      //   three.js 的 `Mesh.raycast` 会按 `material.side` 剔除背面，
      //   屋面法线朝上，从下往上打命中的是背面 ⇒ 一律"打不中"。
      //
      // ⚠⚠ 必须命中 **tile**，不能拿 'board'（望板）顶替：
      //   望板是屋面下方 7.5cm 的一块 clone，两者有同样的洞。
      //   只要有 board 就判过 ⇒ **"屋面缺瓦、只剩望板"这类问题永远测不出来**
      //   （九州清晏的歇山就长期这样：从外面直接看见褐色望板与穿出来的檩架）。
      samples.tile++;
      rc.set(new THREE.Vector3(x, ridgeY + 3, z), down);
      rc.far = 60;
      const hits = rc.intersectObjects(meshes, false);
      const names = hits.map((h) => h.object.name);
      if (!names.includes('tile')) {
        holes.tile++;
        if (holes.tile <= 6) {
          console.log(
            `     · 缺屋面：(${x.toFixed(1)}, ${z.toFixed(1)}) 命中 [${names.join(',') || '无'}]`
          );
        }
      }
    }
  }
  const total = holes.tile + holes.shanhua;
  console.log(
    `  ${c.name}：采样 ${samples.tile + samples.shanhua} 点，缺口 ${total}` +
      `（屋面 ${holes.tile}/${samples.tile} · 山花 ${holes.shanhua}/${samples.shanhua}）`
  );
  if (total > 0) bad += total;
}

console.log('');
console.log(bad ? `  ❌ ${bad} 处屋面缺口` : '  ✅ 歇山屋面连续封闭');
process.exit(bad ? 1 : 0);
