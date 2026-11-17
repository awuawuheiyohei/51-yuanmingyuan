import * as THREE from 'three';
import { buildRoof } from '../src/scene/buildings/parts/roof.js';

const spec = { width: 28, depth: 20, eaveY: 10.5, rise: 7.3, type: 'xieshan', overhang: 2.2, overhangX: 1.8, hipRunX: 4, upturn: 0.8, bulge: 0.45, segments: 30 };
const r = buildRoof(spec);
const list = r.geoms.get('ridge') || [];
console.log('ridge pieces:', list.length);
const groups = new Map();
list.forEach((g, i) => {
  g.computeBoundingBox();
  const b = g.boundingBox;
  const tris = Math.round((g.index ? g.index.count : g.getAttribute('position').count) / 3);
  const key = `${b.min.toArray().map(v=>+v.toFixed(1)).join()}|${b.max.toArray().map(v=>+v.toFixed(1)).join()}`;
  if (!groups.has(key)) groups.set(key, { n: 0, tris: 0, ex: g });
  const gr = groups.get(key); gr.n++; gr.tris += tris;
});
let i = 0;
for (const [k, gr] of groups) { console.log(String(i++).padStart(3), 'n=' + String(gr.n).padStart(4), 'tris=' + String(gr.tris).padStart(6), k); }
