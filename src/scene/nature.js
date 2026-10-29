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

/**
 * 给几何重算 UV：按每个顶点的**主法线轴**做平面投影。
 *
 * 为什么不用 IcosahedronGeometry 自带的球面 UV：球面 UV 在多面体上会绕成
 * 一圈圈"年轮"，叠上苔痕贴图后每块石头都像树桩——这是旧版假山最假的地方。
 * 平面投影（按主轴切换）是零成本的近似，等价于三平面贴图的主轴版本。
 */
function planarUV(g, scale = 0.34) {
  const pos = g.attributes.position;
  const nrm = g.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = Math.abs(nrm.getX(i));
    const ny = Math.abs(nrm.getY(i));
    const nz = Math.abs(nrm.getZ(i));
    let u;
    let v;
    if (ny >= nx && ny >= nz) {
      u = x;
      v = z;
    } else if (nx >= nz) {
      u = z;
      v = y;
    } else {
      u = x;
      v = y;
    }
    uv[i * 2] = u * scale;
    uv[i * 2 + 1] = v * scale;
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

/**
 * 一块石头。
 * 太湖石的形态要点：瘦（有向上的长势）、皱（表面凹凸）、漏（孔洞）、透（镂空）。
 * 这里用带噪声的多面体，噪声取"低频大起伏 + 高频细皱"，避免炸成碎片。
 *
 * @param {number} size  石块尺寸
 * @param {Function} rnd
 * @param {object} [opt]
 * @param {number} [opt.squash=1] 竖向压扁系数（1 = 不压）
 * @param {number} [opt.detail=1] 细分级别
 */
function makeRock(size, rnd, opt = {}) {
  const squash = opt.squash ?? 1;
  const detail = opt.detail ?? 2;
  const g = new THREE.IcosahedronGeometry(size, detail);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  const seed = rnd() * 10;
  const lean = (rnd() - 0.5) * 0.5;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const nrm = v.clone().normalize();
    // 低频大起伏（决定整体轮廓）
    const low =
      Math.sin(nrm.x * 2.1 + seed) * 0.14 +
      Math.cos(nrm.y * 1.7 + seed * 1.3) * 0.12 +
      Math.sin(nrm.z * 2.4 + seed * 0.7) * 0.1;
    // 高频细皱（表面质感）
    const hi =
      Math.sin(nrm.x * 9.5 + seed) * 0.035 +
      Math.cos(nrm.z * 11.2 + seed) * 0.03;
    v.multiplyScalar(1 + low + hi);
    // 竖向：不再是统一的"压扁片"，而是每块石各自的长势（有的扁、有的瘦）
    v.y *= squash;
    // 侧向拉伸 + 轻微倾斜，让石块彼此咬合而不是叠成同心圆
    v.x *= 1 + lean * 0.5;
    v.z *= 1 - lean * 0.3;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  g.rotateX((rnd() - 0.5) * 1.1);
  g.rotateY(rnd() * Math.PI * 2);
  g.rotateZ((rnd() - 0.5) * 1.1);
  planarUV(g, 0.3 / Math.max(0.4, size));
  return g;
}

/**
 * 一座叠山：自下而上逐层收分，每层若干块石咬合
 */
function buildRockeryCluster(radius, height, seed) {
  const rnd = mulberry32(seed);
  const parts = [];
  const layers = 5 + Math.floor(rnd() * 4);

  // 主脊：叠山有主次，不是一圈圈同心圆盘。
  // 这里定一条自下而上的偏斜轴，石块围绕它咬合堆叠。
  const spineLean = (rnd() - 0.5) * radius * 0.9;
  const spineDir = rnd() * Math.PI * 2;

  for (let l = 0; l < layers; l++) {
    const t = l / layers;
    // 层高不等分：有的层厚、有的层薄，叠山才有起伏
    const y = height * Math.pow(t, 1.25) * 0.86;
    const r = radius * (1 - t * 0.55) * (0.75 + rnd() * 0.5);
    // 中心随主脊偏移
    const cx = Math.cos(spineDir) * spineLean * t;
    const cz = Math.sin(spineDir) * spineLean * t;

    const blocks = 3 + Math.floor(rnd() * 4);
    for (let b = 0; b < blocks; b++) {
      const a = rnd() * Math.PI * 2;
      // 面积均匀分布，且允许探出轮廓（真山不是规整的圆锥）
      const d = r * Math.sqrt(rnd()) * 1.05;
      const size = radius * (0.16 + rnd() * 0.34) * (1 - t * 0.35);
      // 每块石各有长势：约三成偏瘦（太湖石），其余偏扁
      const squash = rnd() < 0.32 ? 1.15 + rnd() * 0.9 : 0.5 + rnd() * 0.42;
      const g = makeRock(size, rnd, { squash, detail: rnd() < 0.4 ? 1 : 2 });
      g.translate(
        cx + Math.cos(a) * d,
        y + size * 0.3 + rnd() * size * 0.45,
        cz + Math.sin(a) * d
      );
      parts.push(g);
    }

    // 层间垫石：让咬合更实（不把层填满，留缝才透气）
    if (l < layers - 1 && rnd() < 0.8) {
      const filler = makeRock(
        radius * (0.2 + rnd() * 0.2) * (1 - t * 0.3),
        rnd,
        { squash: 0.7 + rnd() * 0.5 }
      );
      filler.translate(
        cx + (rnd() - 0.5) * r * 1.3,
        y + height * (0.03 + rnd() * 0.05),
        cz + (rnd() - 0.5) * r * 1.3
      );
      parts.push(filler);
    }
  }

  // 收顶：一块较大的石压顶
  const cap = makeRock(radius * 0.34, rnd, { squash: 0.8 + rnd() * 0.5 });
  cap.translate(
    Math.cos(spineDir) * spineLean,
    height * 0.86,
    Math.sin(spineDir) * spineLean
  );
  parts.push(cap);

  // 太湖石：瘦峰。做成上细下粗的**歪斜石柱**，柱身分段错位并在腰部留出
  // 孔洞（"漏"），而不是一根光滑的锥。
  if (rnd() < 0.6) {
    const h = height * (0.85 + rnd() * 0.6);
    const segs = 4 + Math.floor(rnd() * 3);
    const baseR = radius * (0.16 + rnd() * 0.1);
    let px = (rnd() - 0.5) * radius * 1.2;
    let pz = (rnd() - 0.5) * radius * 1.2;
    let py = 0;
    for (let s = 0; s < segs; s++) {
      const t = s / segs;
      const segH = (h / segs) * (0.8 + rnd() * 0.5);
      const r0 = baseR * (1 - t * 0.62);
      const g = new THREE.CylinderGeometry(r0 * 0.62, r0, segH, 7, 3);
      const pos = g.attributes.position;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const n =
          Math.sin(v.y * 2.6 + s * 1.7 + seed * 0.01) * 0.2 +
          Math.cos(v.x * 3.4 + v.z * 2.1) * 0.16;
        pos.setXYZ(i, v.x * (1 + n), v.y, v.z * (1 + n));
      }
      g.computeVertexNormals();
      // 每段往一个方向歪一点 → 整根石头有走势
      const tilt = (rnd() - 0.5) * 0.22;
      g.rotateZ(tilt);
      px += Math.sin(tilt) * segH * 0.5;
      g.translate(px, py + segH / 2, pz);
      planarUV(g, 0.35);
      parts.push(g);
      py += segH * 0.86;
    }
    // 腰部的孔洞：一段半环，天然形成"漏"
    if (rnd() < 0.7) {
      const hole = new THREE.TorusGeometry(
        baseR * 0.62,
        baseR * 0.2,
        6,
        10,
        Math.PI * 1.25
      );
      hole.rotateY(rnd() * Math.PI * 2);
      hole.rotateX(Math.PI / 2);
      hole.translate(px * 0.6, h * (0.3 + rnd() * 0.25), pz * 0.6);
      planarUV(hole, 0.35);
      parts.push(hole);
    }
  }

  // 底部铺地：埋进地里，不能露成一个白盘子
  const base = new THREE.ConeGeometry(radius * 1.15, height * 0.18, 9, 1);
  base.translate(0, height * 0.015, 0);
  planarUV(base, 0.3);
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
