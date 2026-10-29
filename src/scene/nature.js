/**
 * 自然要素：假山（叠山）与树木
 *
 * 假山是圆明园全貌的视觉主角——乾隆在园中堆山叠石，
 * 视频里的成片石林就是这么来的。这里用带噪声位移的锥体群来生成，
 * 保留太湖石那种瘦、皱、漏、透的形态。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getTextureOverrides } from './buildings/textures.js';

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
 * 假山（叠山）
 *
 * 清式叠山是"石"不是"锥"：由大小不一的石块层叠咬合而成，
 * 走向有主次，缝隙透光。这里用被噪声削过的多面体做石块，
 * 按层堆叠并逐层旋转、收分；另配少量瘦长的太湖石峰。
 */

/** 一块石头：低面数多面体 + 噪声位移 + 明显压扁成片状 */
function makeRock(size, rnd) {
  const g = new THREE.IcosahedronGeometry(size, 1);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // 噪声要"皱"不要"炸"：幅度收住，主频低一些
    const n =
      Math.sin(v.x * 1.15 + rnd() * 0.3) * 0.09 +
      Math.cos(v.y * 0.95 + v.z * 0.7) * 0.08 +
      Math.sin(v.z * 1.4 + v.x * 0.8) * 0.05;
    v.multiplyScalar(1 + n);
    v.y *= 0.42 + rnd() * 0.2; // 压成片状
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  g.rotateX(rnd() * 0.5);
  g.rotateY(rnd() * Math.PI * 2);
  g.rotateZ(rnd() * 0.4);
  return g;
}

/**
 * 一座叠山：自下而上逐层收分，每层若干块石咬合
 */
function buildRockeryCluster(radius, height, seed) {
  const rnd = mulberry32(seed);
  const parts = [];
  const layers = 4 + Math.floor(rnd() * 4);

  for (let l = 0; l < layers; l++) {
    const t = l / layers;
    const y = height * t * 0.82;
    const r = radius * (1 - t * 0.62);
    const blocks = 4 + Math.floor(rnd() * 4);
    for (let b = 0; b < blocks; b++) {
      const a = rnd() * Math.PI * 2;
      const d = rnd() * r * 0.85;
      const size = radius * (0.22 + rnd() * 0.4) * (1 - t * 0.4);
      const g = makeRock(size, rnd);
      g.translate(
        Math.cos(a) * d,
        y + size * 0.35 + rnd() * size * 0.3,
        Math.sin(a) * d
      );
      parts.push(g);
    }
    // 层间垫石，让咬合更实
    if (l < layers - 1) {
      const filler = makeRock(radius * (0.3 + rnd() * 0.25) * (1 - t * 0.4), rnd);
      filler.translate(
        (rnd() - 0.5) * r,
        y + height * 0.06,
        (rnd() - 0.5) * r
      );
      parts.push(filler);
    }
  }

  // 收顶：一两块较大的石压顶
  const cap = makeRock(radius * 0.42, rnd);
  cap.translate(0, height * 0.84, 0);
  parts.push(cap);

  // 太湖石：旁立一两根瘦峰
  if (rnd() < 0.55) {
    const h = height * (0.7 + rnd() * 0.5);
    const g = new THREE.CylinderGeometry(
      radius * 0.1,
      radius * 0.26,
      h,
      7,
      4
    );
    const pos = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = Math.sin(v.y * 2.6 + seed * 0.01) * 0.16 + Math.cos(v.x * 3.1) * 0.12;
      pos.setXYZ(v, v.x * (1 + n), v.y, v.z * (1 + n));
    }
    g.computeVertexNormals();
    g.rotateZ((rnd() - 0.5) * 0.28);
    g.translate(
      (rnd() - 0.5) * radius * 1.1,
      h * 0.45,
      (rnd() - 0.5) * radius * 1.1
    );
    parts.push(g);
  }

  // 底部铺地：埋进地里，不能露成一个白盘子
  const base = new THREE.ConeGeometry(radius * 1.2, height * 0.2, 9, 1);
  base.translate(0, height * 0.02, 0);
  parts.push(base);

  // 注意：IcosahedronGeometry 是非索引的，Cylinder/Cone 是索引的，
  // mergeGeometries 不接受混合 —— 统一转成非索引再合
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  const merged = mergeGeometries(flat, false);
  for (const g of flat) g.dispose();
  for (const g of parts) if (!g.index) g.dispose();
  return merged;
}

export function buildRockery(sceneData, heightAt) {
  const group = new THREE.Group();
  group.name = 'rockery';
  const ov = getTextureOverrides();
  const mat = new THREE.MeshStandardMaterial({
    map: ov.moss || null,
    color: ov.moss ? 0xa8a49a : 0x676155,
    roughness: 0.99,
    metalness: 0,
    flatShading: true,
    envMapIntensity: 0.45,
  });

  const items = sceneData.rockery || [];
  // 合并成一个 Mesh：几百座假山各一个 draw call 太浪费
  const all = [];
  for (const r of items) {
    const geo = buildRockeryCluster(r.r, r.h, r.seed);
    if (!geo) continue;
    const m = new THREE.Matrix4()
      .makeRotationY(((r.seed % 1000) / 1000) * Math.PI * 2)
      .setPosition(r.x, (heightAt?.(r.x, r.z) ?? 0) - 0.9, r.z);
    geo.applyMatrix4(m);
    all.push(geo);
  }
  if (all.length) {
    const merged = mergeGeometries(all, false);
    if (merged) {
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    for (const g of all) g.dispose();
  }
  return group;
}
