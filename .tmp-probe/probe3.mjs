import * as THREE from 'three';
import { buildRoof } from '../src/scene/buildings/parts/roof.js';
const spec = { width: 28, depth: 20, eaveY: 10.5, rise: 7.3, type: 'xieshan', overhang: 2.2, overhangX: 1.8, hipRunX: 4, upturn: 0.8, bulge: 0.45, segments: 30 };
const r = buildRoof(spec);
for (const [k, list] of r.geoms) {
  const nulls = list.filter(g => !g || !g.getAttribute).length;
  console.log(k.padEnd(10), 'n=' + list.length, 'nulls=' + nulls);
}
