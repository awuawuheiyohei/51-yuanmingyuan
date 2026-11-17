import * as THREE from 'three';
import { buildRoof } from '../src/scene/buildings/parts/roof.js';
const tris = (g) => g && g.getAttribute ? (g.index ? g.index.count : g.getAttribute('position').count) / 3 : 0;
for (const type of ['xieshan', 'juanpengxieshan', 'wudian', 'yingshan', 'juanpeng']) {
  const spec = { width: 28, depth: 20, eaveY: 10.5, rise: 7.3, type, overhang: 2.2, overhangX: 1.8, hipRunX: 4, upturn: 0.8, bulge: 0.45, segments: 30 };
  const r = buildRoof(spec);
  const list = r.geoms.get('ridge') || [];
  let t = 0; const box = new THREE.Box3();
  for (const g of list) { t += tris(g); if (g) { g.computeBoundingBox(); box.union(g.boundingBox); } }
  console.log(type.padEnd(16), 'ridge n=' + String(list.length).padStart(3), 'tris=' + String(Math.round(t)).padStart(7),
    ' y', box.min.y.toFixed(2), '→', box.max.y.toFixed(2), ' (ridgeY', r.meta.ridgeY.toFixed(2) + ')');
}
