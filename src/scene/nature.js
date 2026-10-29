/**
 * 自然要素：假山（叠山）与树木
 *
 * 假山是圆明园全貌的视觉主角——乾隆在园中堆山叠石，
 * 视频里的成片石林就是这么来的。这里用带噪声位移的锥体群来生成，
 * 保留太湖石那种瘦、皱、漏、透的形态。
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

/**
 * 生成单座假山：由若干瘦削岩体堆叠而成
 * 参照太湖石"瘦、皱、漏、透"的形态，避免规则锥体感
 */
function buildRockeryCluster(radius, height, seed) {
  const rnd = mulberry32(seed);
  const parts = [];
  const n = 7 + Math.floor(rnd() * 6);
  for (let i = 0; i < n; i++) {
    const g = new THREE.ConeGeometry(
      radius * (0.22 + rnd() * 0.34),
      height * (0.3 + rnd() * 0.5),
      5 + Math.floor(rnd() * 3),
      3
    );
    // 噪声位移：制造皱褶
    const pos = g.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const x = pos.getX(v);
      const y = pos.getY(v);
      const z = pos.getZ(v);
      const nse =
        Math.sin(x * 1.7 + seed * 0.01) * 0.16 +
        Math.cos(y * 1.1 + z * 0.9) * 0.14 +
        Math.sin(z * 2.3) * 0.1;
      pos.setXYZ(v, x * (1 + nse), y * (1 + nse * 0.5), z * (1 + nse));
    }
    g.computeVertexNormals();
    const a = rnd() * Math.PI * 2;
    const d = rnd() * radius * 0.85;
    g.translate(Math.cos(a) * d, height * (0.12 + rnd() * 0.42), Math.sin(a) * d);
    g.rotateY(rnd() * Math.PI * 2);
    g.rotateZ((rnd() - 0.5) * 0.3);
    parts.push(g);
  }
  // 底部护坡
  const base = new THREE.ConeGeometry(radius * 1.25, height * 0.34, 9, 1);
  base.translate(0, height * 0.17, 0);
  parts.push(base);
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

export function buildRockery(sceneData, heightAt) {
  const group = new THREE.Group();
  group.name = 'rockery';
  const mat = new THREE.MeshStandardMaterial({
    color: 0x8b8a84,
    roughness: 0.96,
    metalness: 0,
    flatShading: true,
  });

  const items = sceneData.rockery || [];
  // 合并成一个 Mesh：几百座假山各一个 draw call 太浪费
  const all = [];
  for (const r of items) {
    const geo = buildRockeryCluster(r.r, r.h, r.seed);
    const m = new THREE.Matrix4()
      .makeRotationY(((r.seed % 1000) / 1000) * Math.PI * 2)
      .setPosition(r.x, (heightAt?.(r.x, r.z) ?? 0) - 0.8, r.z);
    geo.applyMatrix4(m);
    all.push(geo);
  }
  if (all.length) {
    const merged = mergeGeometries(all, false);
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    for (const g of all) g.dispose();
  }
  return group;
}

/* ------------------------------------------------------------------ 树 */

const TREE_STYLE = {
  // 松：层叠的伞状针叶
  pine: { trunk: 0x5a4632, leaf: 0x33523a, leaf2: 0x41654a, shape: 'conifer', hMul: 1.15 },
  // 柳：下垂枝条
  willow: { trunk: 0x6b563c, leaf: 0x688049, leaf2: 0x7d9557, shape: 'weeping', hMul: 0.95 },
  // 桃花/海棠：粉花
  blossom: { trunk: 0x5f4a36, leaf: 0xc9909f, leaf2: 0xd8a9b4, shape: 'round', hMul: 0.85 },
  // 杨：高大挺直
  poplar: { trunk: 0x6e5a42, leaf: 0x5a7346, leaf2: 0x6b8350, shape: 'column', hMul: 1.45 },
  // 枫/黄栌：秋色
  maple: { trunk: 0x5b4634, leaf: 0xa5714f, leaf2: 0xbb8a5c, shape: 'round', hMul: 0.95 },
};

/** 树冠几何（低模），按类型分 */
function foliageGeometry(kind, r, seed) {
  const rnd = mulberry32(seed);
  const parts = [];
  if (kind === 'conifer') {
    for (let i = 0; i < 4; i++) {
      const t = i / 4;
      const g = new THREE.ConeGeometry(r * (1 - t * 0.55), r * 1.1, 7);
      g.translate(0, r * 0.55 + i * r * 0.72, 0);
      parts.push(g);
    }
  } else if (kind === 'weeping') {
    const g = new THREE.SphereGeometry(r, 8, 6);
    g.scale(1.15, 0.8, 1.15);
    g.translate(0, r * 0.9, 0);
    parts.push(g);
    // 下垂枝
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + rnd();
      const d = r * 0.75;
      const b = new THREE.SphereGeometry(r * 0.34, 6, 5);
      b.scale(1, 2.6, 1);
      b.translate(Math.cos(a) * d, r * 0.62, Math.sin(a) * d);
      parts.push(b);
    }
  } else if (kind === 'column') {
    const g = new THREE.SphereGeometry(r, 7, 8);
    g.scale(0.62, 2.3, 0.62);
    g.translate(0, r * 1.5, 0);
    parts.push(g);
  } else {
    // 圆冠：多个球叠成蓬松团
    for (let i = 0; i < 4; i++) {
      const a = rnd() * Math.PI * 2;
      const d = rnd() * r * 0.5;
      const g = new THREE.SphereGeometry(r * (0.6 + rnd() * 0.4), 7, 6);
      g.translate(Math.cos(a) * d, r * 0.85 + (rnd() - 0.5) * r * 0.5, Math.sin(a) * d);
      parts.push(g);
    }
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

export function buildTrees(sceneData, heightAt) {
  const group = new THREE.Group();
  group.name = 'trees';
  const trees = sceneData.trees || [];

  // 按类型分组，每类用 InstancedMesh
  const byType = new Map();
  for (const t of trees) {
    if (!byType.has(t.type)) byType.set(t.type, []);
    byType.get(t.type).push(t);
  }

  for (const [type, list] of byType) {
    const style = TREE_STYLE[type] || TREE_STYLE.maple;
    const trunkGeo = new THREE.CylinderGeometry(0.11, 0.2, 1, 5);
    trunkGeo.translate(0, 0.5, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: style.trunk, roughness: 0.95 });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, list.length);
    trunks.castShadow = true;

    const foliageMat = new THREE.MeshStandardMaterial({
      color: style.leaf,
      roughness: 0.9,
      flatShading: true,
    });
    const folGeo = foliageGeometry(style.shape, 1, 12345);
    const foliage = new THREE.InstancedMesh(folGeo, foliageMat, list.length);
    foliage.castShadow = true;
    foliage.receiveShadow = true;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();

    list.forEach((t, i) => {
      const rnd = mulberry32(t.seed);
      const y = heightAt?.(t.x, t.z) ?? 0;
      const trunkH = t.h * 0.42;
      const crownR = t.h * 0.36 * (0.8 + rnd() * 0.5);
      const scale = 0.85 + rnd() * 0.4;

      pos.set(t.x, y - 0.2, t.z);
      scl.set(scale, trunkH * scale, scale);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI * 2);
      m.compose(pos, q, scl);
      trunks.setMatrixAt(i, m);

      pos.set(t.x, y + trunkH * scale * 0.92, t.z);
      scl.set(crownR * scale, crownR * scale * style.hMul, crownR * scale);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * Math.PI * 2);
      m.compose(pos, q, scl);
      foliage.setMatrixAt(i, m);
    });
    trunks.instanceMatrix.needsUpdate = true;
    foliage.instanceMatrix.needsUpdate = true;
    group.add(trunks, foliage);
  }
  return group;
}
