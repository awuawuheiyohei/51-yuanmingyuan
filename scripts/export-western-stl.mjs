/**
 * **西洋楼白模导出**（给 3D设计 / cq-viewer 做几何体检）
 *
 * 西洋楼（谐奇趣、养雀笼、方外观、海晏堂、大水法、远瀛观、线法山…）
 * 走的是**另一套模块**（`src/scene/western-parts/`），
 * 它的材质在模块加载时就要 canvas ⇒ node 里跑不了 ⇒
 * 先装**无头 DOM 桩**（`dom-stub.mjs`），只要几何、不要贴图。
 *
 * 用法：
 *   node scripts/export-western-stl.mjs                       # 整片西洋楼
 *   node scripts/export-western-stl.mjs --at=海晏堂 --size=60 # 只导某处
 *   node scripts/export-western-stl.mjs --bucket=stone
 */
import * as THREE from 'three';
import fs from 'node:fs';
import { installDomStub } from './dom-stub.mjs';

// ⚠ 必须在动态 import **之前**装桩（静态 import 是提升的，桩来不及生效）
installDomStub();

const R = new URL('..', import.meta.url).pathname;
const sceneData = JSON.parse(fs.readFileSync(`${R}public/scene/scene.json`, 'utf8'));
const { makeHeightSampler } = await import(`${R}src/scene/terrain.js`);
const { buildWesternEnsemble } = await import(`${R}src/scene/western.js`);

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);
const AT = args.at ? String(args.at) : null;
const SIZE = Number(args.size || 0) || null;
const BUCKETS = args.bucket ? String(args.bucket).split(',') : null;

const heightAt = makeHeightSampler(sceneData);
const group = buildWesternEnsemble(sceneData, heightAt);
if (!group) {
  console.error('西洋楼没建出来');
  process.exit(1);
}
group.updateMatrixWorld(true);

// ---- 裁剪盒：以 --at 指名的建筑为中心 ----
let crop = null;
if (AT) {
  const b = (sceneData.westBuildings || []).find((w) => w.name === AT);
  if (!b) {
    console.error(
      `找不到「${AT}」，可选：${(sceneData.westBuildings || []).map((w) => w.name).join('、')}`
    );
    process.exit(1);
  }
  const s = SIZE || 70;
  crop = { minX: b.x - s / 2, maxX: b.x + s / 2, minZ: b.z - s / 2, maxZ: b.z + s / 2 };
  console.log(`裁剪：${AT} @ (${b.x.toFixed(1)}, ${b.z.toFixed(1)}) ± ${s / 2}m`);
}

function inCrop(p) {
  if (!crop) return true;
  for (const v of p) {
    if (v[0] < crop.minX || v[0] > crop.maxX) return false;
    if (v[2] < crop.minZ || v[2] > crop.maxZ) return false;
  }
  return true;
}

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

const a = new THREE.Vector3();
const b = new THREE.Vector3();
const c = new THREE.Vector3();
const e1 = new THREE.Vector3();
const e2 = new THREE.Vector3();
const n = new THREE.Vector3();

const tris = [];
const perBucket = {};
for (const child of group.children) {
  const bucket = child.name || 'unknown';
  if (BUCKETS && !BUCKETS.includes(bucket)) continue;
  perBucket[bucket] = 0;
  const geo = child.geometry;
  if (!geo?.attributes?.position) continue;
  const pos = geo.attributes.position;
  const idx = geo.index;
  const tri = Math.floor((idx ? idx.count : pos.count) / 3);
  for (let t = 0; t < tri; t++) {
    const ii = [0, 1, 2].map((k) => (idx ? idx.getX(t * 3 + k) : t * 3 + k));
    const p = ii.map((i) => [pos.getX(i), pos.getY(i), pos.getZ(i)]);
    if (!inCrop(p)) continue;
    a.set(...p[0]); b.set(...p[1]); c.set(...p[2]);
    e1.subVectors(b, a); e2.subVectors(c, a);
    n.crossVectors(e1, e2);
    if (n.lengthSq() < 1e-18) continue;
    n.normalize();
    tris.push({ n: toZup([n.x, n.y, n.z]), v: p.map(toZup) });
    perBucket[bucket]++;
  }
}

const tag = AT ? `-${AT}` : '';
const path = `/tmp/west${tag}.stl`;
const nTri = writeBinarySTL(path, tris, `yuanmingyuan western${AT ? ' ' + AT : ''}`);
console.log(`${path}  三角 ${nTri}`);
console.log('   各桶:', JSON.stringify(perBucket));
console.log('   西洋楼建筑:', (sceneData.westBuildings || []).map((w) => w.name).join('、'));
