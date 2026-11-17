import * as THREE from 'three';
import { buildRoof } from '../src/scene/buildings/parts/roof.js';
const spec = { width: 28, depth: 20, eaveY: 10.5, rise: 7.3, type: 'xieshan', overhang: 2.2, overhangX: 1.8, hipRunX: 4, upturn: 0.8, bulge: 0.45, segments: 30 };
const r = buildRoof(spec);
// 正脊是 'ridge' 桶里最大的一件
const list = r.geoms.get('ridge');
let main = list[0]; let best = -1;
for (const g of list) { g.computeBoundingBox(); const s = g.boundingBox.getSize(new THREE.Vector3()); if (s.x > best) { best = s.x; main = g; } }
main.computeBoundingBox();
console.log('正脊 bbox', JSON.stringify(main.boundingBox.min.toArray().map(v=>+v.toFixed(2))), '→', JSON.stringify(main.boundingBox.max.toArray().map(v=>+v.toFixed(2))));
const pos = main.getAttribute('position'); const nor = main.getAttribute('normal');
// 统计法线朝向：脊座顶面（y≈ridgeY+0.16，|z|小）应朝上
let up = 0, down = 0, side = 0;
for (let i = 0; i < pos.count; i++) {
  const y = pos.getY(i), ny = nor.getY(i);
  if (Math.abs(y - (17.8 + 0.16)) < 0.012) { if (ny > 0.5) up++; else if (ny < -0.5) down++; }
  if (Math.abs(pos.getZ(i)) > 0.30 && Math.abs(pos.getZ(i)) < 0.36 && ny !== 0) side++;
}
console.log('脊座顶面法线：朝上', up, '朝下', down, '（应几乎全朝上）');
// 侧面法线：z>0 的一侧应朝 +z
let out = 0, inn = 0;
for (let i = 0; i < pos.count; i++) {
  const z = pos.getZ(i), nz = nor.getZ(i);
  if (z > 0.30 && z < 0.40 && Math.abs(nz) > 0.3) { if (nz > 0) out++; else inn++; }
}
console.log('南侧（z>0）法线：朝外', out, '朝内', inn, '（应朝外）');
// 端盖法线（脊的西端 x=-14）
let endOut = 0, endIn = 0;
for (let i = 0; i < pos.count; i++) {
  const x = pos.getX(i), nx = nor.getX(i);
  if (x < -13.9 && x > -14.1 && Math.abs(nx) > 0.3) { if (nx < 0) endOut++; else endIn++; }
}
console.log('西端端盖法线：朝外(-x)', endOut, '朝内(+x)', endIn);
