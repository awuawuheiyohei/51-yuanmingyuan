#!/usr/bin/env node
/**
 * **屋面三角形绕向自检**
 *
 * ## 为什么查这个
 *
 * 屋面网格里若有三角形的**绕向反了**，three.js 默认 `FrontSide` 材质会把它们
 * **背面剔除** ⇒ 画面上就是"屋面缺了一块"，露出底下的梁架。
 * 九州清晏（歇山 + 黄琉璃）近景里左上角整片屋面消失、只剩红梁与黄椽，
 * 右上角黄面与褐色面交错 —— 都是这个症状。
 *
 * ## 判据
 *
 * 屋顶的**大面片**（屋面板、翼角板）法线必须朝上。
 * 小件（筒瓦、瓦当、滴水、垂脊）是立体构件，朝向本就四面八方，**不判**。
 * 所以只看**包围盒最大边 > 1.5m** 的几何。
 *
 * 用法：node scripts/check-roof-winding.mjs
 */
import * as THREE from 'three';
import { buildRoof } from '../src/scene/buildings/parts/roof.js';

const CASES = [
  // ⚠ 参数必须与运行时**完全一致**，否则查不到真问题：
  //   九州清晏主殿 = grand 级 7×5 ⇒ 面阔 38.98m、檐高 9.17m、
  //   举高 = 38.98×0.26 = 10.13m（**大歇山**），出檐 = 斗栱出挑 + 0.35。
  { name: '大歇山（九州清晏主殿 grand 7×5）', type: 'xieshan', width: 38.98, depth: 22.61, eaveY: 9.17, rise: 10.13, overhang: 1.42, hipRunX: 5.43 },
  { name: '歇山（奉三无私殿 hall 7×5）', type: 'xieshan', width: 32.48, depth: 20.46, eaveY: 10.1, rise: 8.44, overhang: 1.14, hipRunX: 4.91 },
  { name: '歇山（九州清晏主殿）', type: 'xieshan', width: 32.48, depth: 20.46, eaveY: 11.9, rise: 5.0, overhang: 1.14 },
  { name: '卷棚歇山（正大光明殿）', type: 'juanpengxieshan', width: 32.48, depth: 20.46, eaveY: 7.4, rise: 4.0, overhang: 1.14 },
  { name: '悬山', type: 'xuanshan', width: 12, depth: 8, eaveY: 4.5, rise: 2.2, overhang: 1.0 },
  { name: '硬山', type: 'yingshan', width: 12, depth: 8, eaveY: 4.5, rise: 2.2, overhang: 1.0 },
  { name: '卷棚', type: 'juanpeng', width: 12, depth: 8, eaveY: 4.5, rise: 2.2, overhang: 1.0 },
  { name: '重檐歇山', type: 'xieshan', width: 32.48, depth: 20.46, eaveY: 7.4, rise: 4.0, overhang: 1.14, doubleEave: true, lowerEaveY: 5.0 },
];

const MIN_EXTENT = 1.5; // 只查大面片

let bad = 0;
console.log('屋面大面片绕向自检（法线应朝上）');
console.log('─'.repeat(78));

for (const c of CASES) {
  const { name, ...spec } = c;
  let res;
  try {
    res = buildRoof(spec);
  } catch (e) {
    console.log(`  ✗ ${name}: 构建失败 ${e.message}`);
    bad++;
    continue;
  }
  const rows = [];
  for (const [key, list] of res.geoms) {
    for (const g of list) {
      if (!g || !g.attributes) continue;
      const pos = g.attributes.position;
      if (!pos) continue;
      g.computeBoundingBox();
      const bb = g.boundingBox;
      const ext = Math.max(
        bb.max.x - bb.min.x,
        bb.max.y - bb.min.y,
        bb.max.z - bb.min.z
      );
      if (ext < MIN_EXTENT) continue;
      const idx = g.index;
      const triCount = Math.floor((idx ? idx.count : pos.count) / 3);
      let down = 0;
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      const c3 = new THREE.Vector3();
      const e1 = new THREE.Vector3();
      const e2 = new THREE.Vector3();
      const n = new THREE.Vector3();
      for (let t = 0; t < triCount; t++) {
        const i0 = idx ? idx.getX(t * 3) : t * 3;
        const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
        const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
        a.fromBufferAttribute(pos, i0);
        b.fromBufferAttribute(pos, i1);
        c3.fromBufferAttribute(pos, i2);
        e1.subVectors(b, a);
        e2.subVectors(c3, a);
        n.crossVectors(e1, e2);
        if (n.y < 0) down++;
      }
      const ratio = triCount ? down / triCount : 0;
      if (ratio > 0.3) {
        rows.push(
          `     ✗ 桶 "${key}" 尺寸 ${ext.toFixed(1)}m：三角 ${triCount}，朝下 ${(ratio * 100).toFixed(0)}%` +
            `，中心 (${((bb.min.x + bb.max.x) / 2).toFixed(1)}, ${((bb.min.y + bb.max.y) / 2).toFixed(1)}, ${((bb.min.z + bb.max.z) / 2).toFixed(1)})`
        );
        bad++;
      }
    }
  }
  console.log(`  ${name}`);
  if (rows.length) rows.forEach((r) => console.log(r));
  else console.log('     ✅ 大面片绕向正常');
}

console.log('');
console.log(bad ? `  ❌ ${bad} 处绕向异常` : '  ✅ 全部屋面绕向正常');
process.exit(bad ? 1 : 0);
