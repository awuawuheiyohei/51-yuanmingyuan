import * as THREE from 'three';
import { buildRoof } from '../src/scene/buildings/parts/roof.js';

function signedVolume(g) {
  const p = g.getAttribute('position'); const idx = g.index;
  const n = idx ? idx.count : p.count;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), cr = new THREE.Vector3();
  let V = 0;
  for (let i = 0; i < n; i += 3) {
    const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i+1) : i+1, i2 = idx ? idx.getX(i+2) : i+2;
    a.fromBufferAttribute(p, i0); b.fromBufferAttribute(p, i1); c.fromBufferAttribute(p, i2);
    V += a.dot(cr.crossVectors(b, c)) / 6;
  }
  return V;
}
const spec = { width: 28, depth: 20, eaveY: 10.5, rise: 7.3, type: 'xieshan', overhang: 2.2, overhangX: 1.8, hipRunX: 4, upturn: 0.8, bulge: 0.45, segments: 30 };
const r = buildRoof(spec);
const list = r.geoms.get('ridge');
list.forEach((g, i) => {
  g.computeBoundingBox();
  const s = g.boundingBox.getSize(new THREE.Vector3());
  console.log('ridge piece', i, 'tris', ((g.index ? g.index.count : g.getAttribute("position").count)/3), 'bbox size', s.toArray().map(v=>+v.toFixed(2)).join('x'), 'signedVolume', signedVolume(g).toFixed(3));
});
