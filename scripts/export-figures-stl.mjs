/**
 * **人物层白模导出**（给 3D设计 / cq-viewer 做几何体检）
 *
 * 人物层是 worker 重做过的（手臂/袖口/手/靴尖/衣褶/脖子），
 * 但**从没做过白模体检** ⇒ 只在渲染里看，看不出"手是方的""脖子没接上"这类问题。
 *
 * 用法：
 *   node scripts/export-figures-stl.mjs --at=-510.2,399.4 --size=40
 *   node scripts/export-figures-stl.mjs --all      # 全园（人物 30 万面）
 */
import * as THREE from 'three';
import fs from 'node:fs';
import { installDomStub } from './dom-stub.mjs';

installDomStub();

const R = new URL('..', import.meta.url).pathname;
const sceneData = JSON.parse(fs.readFileSync(`${R}public/scene/scene.json`, 'utf8'));
const { makeHeightSampler } = await import(`${R}src/scene/terrain.js`);
const { buildFigures } = await import(`${R}src/scene/figures.js`);

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);
let crop = null;
if (args.at) {
  const [cx, cz] = String(args.at).split(',').map(Number);
  const s = Number(args.size || 40) / 2;
  crop = { minX: cx - s, maxX: cx + s, minZ: cz - s, maxZ: cz + s };
  console.log(`裁剪：(${cx.toFixed(1)}, ${cz.toFixed(1)}) ± ${s}m`);
}

const heightAt = makeHeightSampler(sceneData);
const group = buildFigures(sceneData, heightAt);
group.updateMatrixWorld(true);

function inCrop(p) {
  if (!crop) return true;
  for (const v of p) {
    if (v[0] < crop.minX || v[0] > crop.maxX) return false;
    if (v[2] < crop.minZ || v[2] > crop.maxZ) return false;
  }
  return true;
}
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

const path = crop ? '/tmp/figures-crop.stl' : '/tmp/figures-all.stl';
console.log(`${path}  三角 ${writeBinarySTL(path, tris, 'yuanmingyuan figures')}`);
console.log('   各桶:', JSON.stringify(perBucket));
console.log('   人物数:', (group.userData.figures || []).length);
