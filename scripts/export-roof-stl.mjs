/**
 * 把 buildRoof 产出的屋面几何导出成二进制 STL，
 * 交给 3D设计（cq-viewer）做**白模正交视图**与网格体检。
 *
 * 为什么要导出到 STL：
 *   浏览器里带光照/贴图的渲染很难判断"几何本身闭不闭合"
 *   （望板、檩架、山花交叠在一起，靠截图分不清谁是谁）。
 *   白模正交视图没有这些干扰 ⇒ 一眼能看出山花/山墙/山面闭不闭合。
 *
 * ⚠⚠ **查看器是 Z 轴向上（CAD 约定），我们的屋面是 Y 轴向上**
 *   ⇒ 直接导出会躺着看，什么都判断不出来。
 *   ⇒ 导出时绕 X 轴转 −90°：`(x, y, z) → (x, −z, y)`
 *     · 手性不变（行列式 +1）⇒ 三角形绕向不变，法线不会反；
 *     · 查看器的 Z（向上）= 我们的 Y（向上）⇒ 「右视图 (+X)」就是真正的右立面；
 *     · 查看器的 X = 我们的 X ⇒ 左右方向不变。
 *
 * 用法：
 *   node scripts/export-roof-stl.mjs                    # 全部屋面
 *   node scripts/export-roof-stl.mjs --gx=15            # 只导 x ≥ 15（山墙端）
 */
import * as THREE from 'three';
import fs from 'node:fs';
import { buildRoof } from '../src/scene/buildings/parts/roof.js';

const CASES = {
  daxie: { name: '大歇山（九州清晏主殿）', type: 'xieshan', width: 38.98, depth: 22.61, eaveY: 9.17, rise: 10.13, overhang: 1.42, hipRunX: 5.43 },
  xieshan: { name: '歇山（奉三无私殿）', type: 'xieshan', width: 32.48, depth: 20.46, eaveY: 10.1, rise: 8.44, overhang: 1.14, hipRunX: 4.91 },
};

/** 命令行：--gx=<minX> 只保留 x ≥ minX 的三角形（放大山墙端用） */
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);
const GX = args.gx !== undefined ? Number(args.gx) : null;
/** --gz=<maxAbsZ> 只保留 |z| ≤ maxAbsZ（把山花那块框出来） */
const GZ = args.gz !== undefined ? Number(args.gz) : null;
/**
 * --only=<bucket[,bucket]> 只导指定材质桶。
 * 例：`--only=shanhua` ⇒ 只导山花/悬鱼 ⇒ 单独看悬鱼长什么样。
 */
const ONLY = args.only ? String(args.only).split(',') : null;

/** 绕 X 轴转 −90°：Y-up → Z-up（手性不变） */
function toZup(p) {
  return [p[0], -p[2], p[1]];
}

function writeBinarySTL(path, triangles, header) {
  const buf = Buffer.alloc(84 + triangles.length * 50);
  buf.write(header.slice(0, 79), 0);
  buf.writeUInt32LE(triangles.length, 80);
  let o = 84;
  for (const t of triangles) {
    buf.writeFloatLE(t.n[0], o); o += 4;
    buf.writeFloatLE(t.n[1], o); o += 4;
    buf.writeFloatLE(t.n[2], o); o += 4;
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
    if (ONLY && !ONLY.includes(bucket)) continue;
    let cnt = 0;
    for (const g of list) {
      if (!g?.attributes?.position) continue;
      const pos = g.attributes.position;
      const idx = g.index;
      const tri = Math.floor((idx ? idx.count : pos.count) / 3);
      for (let t = 0; t < tri; t++) {
        const ii = [0, 1, 2].map((k) => (idx ? idx.getX(t * 3 + k) : t * 3 + k));
        const p = ii.map((i) => [pos.getX(i), pos.getY(i), pos.getZ(i)]);
        // 只导山墙端（放大看 zBreak 端点）
        if (GX !== null && !p.every((q) => q[0] >= GX)) continue;
        if (GZ !== null && !p.every((q) => Math.abs(q[2]) <= GZ)) continue;
        a.set(...p[0]); b.set(...p[1]); c.set(...p[2]);
        e1.subVectors(b, a); e2.subVectors(c, a);
        n.crossVectors(e1, e2);
        if (n.lengthSq() < 1e-18) continue; // 退化面直接丢掉（写入 STL 会是非流形）
        n.normalize();
        // 绕 X 轴转 −90°（Y-up → Z-up）：法线同步转
        const nn = toZup([n.x, n.y, n.z]);
        tris.push({ n: nn, v: p.map(toZup) });
        cnt++;
      }
    }
    perBucket[bucket] = cnt;
  }
  const tag = GX !== null ? `-x${GX}` : '';
  const tagOnly = ONLY ? `-${ONLY.join('_')}` : '';
  const path = `/tmp/roof-${key}${tag}${tagOnly}.stl`;
  const nTri = writeBinarySTL(path, tris, `yuanmingyuan ${name}`);
  console.log(`${path}  三角 ${nTri}`);
  console.log('   各桶:', JSON.stringify(perBucket));
}
