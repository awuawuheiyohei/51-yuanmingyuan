/**
 * 把 buildRoof 产出的屋面几何导出成二进制 STL，
 * 交给 3D设计（cq-viewer）做**白模正交视图**与网格体检。
 *
 * 为什么要导出到 STL：
 *   浏览器里带光照/贴图的渲染很难判断"几何本身闭不闭合"
 *   （望板、檩架、山花交叠在一起，靠截图分不清谁是谁）。
 *   白模正交视图没有这些干扰 ⇒ 一眼能看出山花/山墙/山面闭不闭合。
 */
import * as THREE from 'three';
import fs from 'node:fs';
import { buildRoof } from '../src/scene/buildings/parts/roof.js';

const CASES = {
  daxie: { name: '大歇山（九州清晏主殿）', type: 'xieshan', width: 38.98, depth: 22.61, eaveY: 9.17, rise: 10.13, overhang: 1.42, hipRunX: 5.43 },
  xieshan: { name: '歇山（奉三无私殿）', type: 'xieshan', width: 32.48, depth: 20.46, eaveY: 10.1, rise: 8.44, overhang: 1.14, hipRunX: 4.91 },
};

function writeBinarySTL(path, triangles, header) {
  const buf = Buffer.alloc(84 + triangles.length * 50);
  buf.write(header.slice(0, 79), 0);
  buf.writeUInt32LE(triangles.length, 80);
  let o = 84;
  for (const t of triangles) {
    buf.writeFloatLE(t.nx, o); o += 4;
    buf.writeFloatLE(t.ny, o); o += 4;
    buf.writeFloatLE(t.nz, o); o += 4;
    for (const v of t.v) {
      buf.writeFloatLE(v[0], o); o += 4;
      buf.writeFloatLE(v[1], o); o += 4;
      buf.writeFloatLE(v[2], o); o += 4;
    }
    buf.writeUInt16LE(0, o); o += 2;
  }
  fs.writeFileSync(path, buf);
  return triangles.length;
}

for (const [key, spec] of Object.entries(CASES)) {
  const { name, ...rest } = spec;
  const res = buildRoof(rest);
  const tris = [];
  const perBucket = {};
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (const [bucket, list] of res.geoms) {
    let cnt = 0;
    for (const g of list) {
      if (!g?.attributes?.position) continue;
      const pos = g.attributes.position;
      const idx = g.index;
      const tri = Math.floor((idx ? idx.count : pos.count) / 3);
      for (let t = 0; t < tri; t++) {
        const ii = [0, 1, 2].map((k) => (idx ? idx.getX(t * 3 + k) : t * 3 + k));
        const p = ii.map((i) => [pos.getX(i), pos.getY(i), pos.getZ(i)]);
        a.set(...p[0]); b.set(...p[1]); c.set(...p[2]);
        e1.subVectors(b, a); e2.subVectors(c, a);
        n.crossVectors(e1, e2);
        if (n.lengthSq() < 1e-18) continue; // 退化面直接丢掉（写入 STL 会是非流形）
        n.normalize();
        tris.push({ n: [n.x, n.y, n.z], v: p });
        cnt++;
      }
    }
    perBucket[bucket] = cnt;
  }
  const path = `/tmp/roof-${key}.stl`;
  const nTri = writeBinarySTL(path, tris, `yuanmingyuan ${name}`);
  console.log(`${path}  三角 ${nTri}`);
  console.log('   各桶:', JSON.stringify(perBucket));
}
