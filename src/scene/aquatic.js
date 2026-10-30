/**
 * 水生植物：荷叶、芦苇、菖蒲
 *
 * 为什么要有：
 * - 清代圆明园的福海是**荷塘**（"圆明园荷花盛况"见乾隆诗），
 *   蓬岛瑶台四周水面种荷，是这一景的核心意象；
 * - 皇家园林的水岸必生芦苇菖蒲，没有它们，岸线是一条刀切的直边，
 *   一眼就看出是"几何体摆出来的"。
 *
 * 尺度（真实）：
 *   荷叶  径 0.35~0.55m（王莲可达 1.5m，但荷塘种的是普通荷）
 *   芦苇  高 1.2~2.2m，丛生
 *   菖蒲  高 0.4~0.7m
 *
 * 全部按材质合并成少数几个 InstancedMesh / Mesh。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 点是否在多边形内 */
function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * 荷叶：一片带缺口的圆盘（荷叶总有一个出水缺口），微微上翘。
 * 梗从水下伸到叶下。
 */
function lotusLeaf(r) {
  const shape = new THREE.Shape();
  const N = 12;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const a = t * Math.PI * 2;
    // 缺口：在一侧收进去
    const gap = 0.55 + 0.45 * Math.abs(Math.cos(a * 0.5));
    const x = Math.cos(a) * r * gap;
    const y = Math.sin(a) * r * gap;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  const g = new THREE.ShapeGeometry(shape, 12);
  g.rotateX(-Math.PI / 2);
  // 叶面微凹（荷叶中心略低）
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const d = Math.hypot(x, z) / Math.max(r, 1e-3);
    pos.setY(i, -d * d * r * 0.22);
  }
  g.computeVertexNormals();
  return g;
}

/** 芦苇：一丛细长叶（每丛 3~5 片）+ 一支穗 */
function reedClump(h) {
  const parts = [];
  const n = 3 + Math.floor(Math.random() * 0); // 固定 3 片，避免用到 Math.random
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const lean = 0.12 + (i % 3) * 0.07;
    const blade = new THREE.PlaneGeometry(0.055, h, 1, 3);
    const pos = blade.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const y = pos.getY(v);
      const t = (y + h / 2) / h;
      pos.setX(v, pos.getX(v) + Math.cos(a) * lean * t * t * h);
      pos.setZ(v, pos.getZ(v) + Math.sin(a) * lean * t * t * h);
    }
    blade.computeVertexNormals();
    blade.translate(Math.cos(a) * 0.04, h / 2, Math.sin(a) * 0.04);
    parts.push(blade);
  }
  // 穗
  const spike = new THREE.CylinderGeometry(0.022, 0.012, h * 0.22, 5);
  spike.translate(0, h * 0.92, 0);
  parts.push(spike);
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/** 菖蒲：短而密的剑叶 */
function irisClump(h) {
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const blade = new THREE.PlaneGeometry(0.05, h, 1, 2);
    const pos = blade.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const y = pos.getY(v);
      const t = (y + h / 2) / h;
      pos.setX(v, pos.getX(v) + Math.cos(a) * 0.3 * t * t * h);
      pos.setZ(v, pos.getZ(v) + Math.sin(a) * 0.3 * t * t * h);
    }
    blade.computeVertexNormals();
    blade.translate(Math.cos(a) * 0.03, h / 2, Math.sin(a) * 0.03);
    parts.push(blade);
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

export function buildAquatic(sceneData, heightAt) {
  const group = new THREE.Group();
  group.name = 'aquatic';
  const rnd = mulberry32(20261030);

  const waters = sceneData.water || [];
  const leafGeo = lotusLeaf(0.45);
  const reedGeo = reedClump(1.6);
  const irisGeo = irisClump(0.55);

  const leafMat = new THREE.MeshStandardMaterial({
    color: 0x3f6b32,
    roughness: 0.72,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  const reedMat = new THREE.MeshStandardMaterial({
    color: 0x8a9459,
    roughness: 0.9,
    side: THREE.DoubleSide,
  });

  const leaves = [];
  const reeds = [];
  const irises = [];

  for (const w of waters) {
    const ring = w.ring;
    if (!ring || ring.length < 8) continue;
    const level = w.level ?? 0;
    // 面积大、岸线长的水体才生荷与芦苇（小池不必）
    let cx = 0;
    let cz = 0;
    for (const [x, z] of ring) {
      cx += x;
      cz += z;
    }
    cx /= ring.length;
    cz /= ring.length;
    const R = Math.max(
      ...ring.map(([x, z]) => Math.hypot(x - cx, z - cz))
    );

    const nLeaf = Math.min(520, Math.round(R * 1.5));
    const nReed = Math.min(420, Math.round(ring.length * 5));

    // 荷叶：贴着岸一圈（荷塘的荷多在浅水与近岸）
    for (let i = 0; i < nLeaf; i++) {
      const t = rnd();
      const idx = Math.floor(t * ring.length);
      const a = ring[idx];
      const b = ring[(idx + 1) % ring.length];
      const s = rnd();
      const px = a[0] + (b[0] - a[0]) * s;
      const pz = a[1] + (b[1] - a[1]) * s;
      // 往岸里退 1~12m
      const dx = cx - px;
      const dz = cz - pz;
      const d = Math.hypot(dx, dz) || 1;
      const back = 1 + rnd() * Math.min(12, d * 0.35);
      const x = px + (dx / d) * back;
      const z = pz + (dz / d) * back;
      if (!pointInRing(x, z, ring)) continue;
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          (rnd() - 0.5) * 0.14,
          rnd() * Math.PI * 2,
          (rnd() - 0.5) * 0.14
        )
      );
      const sc = 0.75 + rnd() * 0.55;
      m.compose(
        new THREE.Vector3(x, level + 0.04, z),
        q,
        new THREE.Vector3(sc, 1, sc)
      );
      leaves.push(m);
    }

    // 芦苇与菖蒲：岸外侧（岸边泥地上）
    for (let i = 0; i < nReed; i++) {
      const idx = Math.floor(rnd() * ring.length);
      const a = ring[idx];
      const b = ring[(idx + 1) % ring.length];
      const s = rnd();
      const px = a[0] + (b[0] - a[0]) * s;
      const pz = a[1] + (b[1] - a[1]) * s;
      const dx = px - cx;
      const dz = pz - cz;
      const d = Math.hypot(dx, dz) || 1;
      const out = 0.4 + rnd() * 3.2;
      const x = px + (dx / d) * out;
      const z = pz + (dz / d) * out;
      const y = heightAt ? heightAt(x, z) : level;
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler((rnd() - 0.5) * 0.1, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.1)
      );
      const sc = 0.7 + rnd() * 0.6;
      m.compose(new THREE.Vector3(x, y - 0.1, z), q, new THREE.Vector3(sc, sc, sc));
      (rnd() < 0.72 ? reeds : irises).push(m);
    }
  }

  const addInstanced = (geo, mat, mats, name) => {
    if (!mats.length) return;
    const im = new THREE.InstancedMesh(geo, mat, mats.length);
    for (let i = 0; i < mats.length; i++) im.setMatrixAt(i, mats[i]);
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = true;
    im.receiveShadow = true;
    im.name = name;
    group.add(im);
  };

  addInstanced(leafGeo, leafMat, leaves, 'lotus');
  addInstanced(reedGeo, reedMat, reeds, 'reed');
  addInstanced(irisGeo, reedMat, irises, 'iris');

  for (const g of [leafGeo, reedGeo, irisGeo]) g.dispose();

  console.log(
    `  ✓ 水生植物 荷叶 ${leaves.length} 片 / 芦苇 ${reeds.length} 丛 / 菖蒲 ${irises.length} 丛`
  );
  return group;
}
