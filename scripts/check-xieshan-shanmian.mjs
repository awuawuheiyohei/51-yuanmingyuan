/**
 * 歇山「山花外侧」区域的几何自检：
 *   1. 该区域（|z| ≤ zBreak 且 |x| > xh）**必须有面**（以前是破洞）；
 *   2. 这些面的顶点**不得有 NaN**；
 *   3. 屋面在该区域的**高度**必须落在 [eaveY, ridgeY] 之间。
 */
import * as THREE from 'three';
import { buildRoof } from '../src/scene/buildings/parts/roof.js';

const CASES = [
  { name: '大歇山（九州清晏主殿）', type: 'xieshan', width: 38.98, depth: 22.61, eaveY: 9.17, rise: 10.13, overhang: 1.42, hipRunX: 5.43 },
  { name: '歇山（奉三无私殿）', type: 'xieshan', width: 32.48, depth: 20.46, eaveY: 10.1, rise: 8.44, overhang: 1.14, hipRunX: 4.91 },
  { name: '歇山（圆明园殿）', type: 'xieshan', width: 32.48, depth: 20.46, eaveY: 11.9, rise: 5.0, overhang: 1.14 },
];

let bad = 0;
for (const c of CASES) {
  const { name, ...spec } = c;
  const res = buildRoof(spec);
  // 与 roof.js 相同的推导
  const Wx = spec.width / 2 + spec.overhang;
  const Wz = spec.depth / 2 + spec.overhang;
  const xh = Math.max(0.5, spec.width / 2);
  const P_CURVE = 1.6;
  const tBreak = Math.pow(0.42, 1 / P_CURVE);
  const zBreak = Wz * tBreak;
  const eaveY = spec.eaveY;
  const ridgeY = eaveY + spec.rise;

  let inRegion = 0;
  let nan = 0;
  let below = 0;
  let above = 0;
  let up = 0;
  let down = 0;
  for (const [key, list] of res.geoms) {
    for (const g of list) {
      if (!g?.attributes?.position) continue;
      const pos = g.attributes.position;
      const idx = g.index;
      const tri = Math.floor((idx ? idx.count : pos.count) / 3);
      for (let t = 0; t < tri; t++) {
        const i0 = idx ? idx.getX(t * 3) : t * 3;
        const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
        const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
        const p = [i0, i1, i2].map((i) => ({
          x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i),
        }));
        if (p.some((v) => !Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z))) {
          nan++;
          continue;
        }
        // 该三角形是否整体落在「山花外侧」区域
        // 只看**屋面桶(tile)**：正脊/垂脊/鸱吻也在这个区域里，
        // 但它们是立体构件，法线本就四面八方，不能拿来判"屋面是否被剔除"。
        if (key !== 'tile') continue;
        const allOut = p.every((v) => Math.abs(v.z) <= zBreak + 1e-6 && Math.abs(v.x) > xh - 1e-6);
        if (!allOut) continue;
        inRegion++;
        // 该三角的**平面法线**朝上还是朝下（背面剔除会让朝下的看不见）
        const e1 = new THREE.Vector3(p[1].x - p[0].x, p[1].y - p[0].y, p[1].z - p[0].z);
        const e2 = new THREE.Vector3(p[2].x - p[0].x, p[2].y - p[0].y, p[2].z - p[0].z);
        const n = new THREE.Vector3().crossVectors(e1, e2);
        if (n.y > 0) up++;
        else down++;
        // 高度越界只对**屋面桶**判：正脊（脊座+脊身+脊瓦）本来就压在正脊线之上，
        // 垂脊/鸱吻也在那个高度 —— 它们不算"越界"。
        if (key === 'tile') {
          for (const v of p) {
            if (v.y < eaveY - 0.6) below++;
            if (v.y > ridgeY + 0.6) above++;
          }
        }
      }
    }
  }
  const ok = inRegion > 0 && nan === 0 && below === 0 && above === 0 && down === 0;
  if (!ok) bad++;
  console.log(
    `  ${ok ? '✅' : '✗'} ${name}：山花外侧三角 ${inRegion}，NaN ${nan}，` +
      `越界(低 ${below}/高 ${above})，法线朝上 ${up}/朝下 ${down}`
  );
}

console.log('');
console.log(bad ? `  ❌ ${bad} 项不过` : '  ✅ 歇山山花外侧区域全部有面、无 NaN、高度在檐口~正脊之间');
process.exit(bad ? 1 : 0);
