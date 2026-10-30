/**
 * 自然要素：假山（叠山）与树木
 *
 * 假山是圆明园全貌的视觉主角——乾隆在园中堆山叠石，
 * 视频里的成片石林就是这么来的。这里用带噪声位移的锥体群来生成，
 * 保留太湖石那种瘦、皱、漏、透的形态。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
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

/**
 * 假山（叠山）——GPU 生成的真网格资产
 *
 * 资产来自 `scripts/gen-rock.py`：在 MPS 上用 SDF + marching cubes
 * 生成带「漏、透、皱、断口」的真石头网格（太湖石那种形态），
 * 导出 GLB 到 `public/rocks/`。这里加载它们并按假山位置表摆放。
 *
 * 加载失败（离线 / 没跑生成脚本）时**回退到程序化叠山**，
 * 保证场景永远能出图。
 */
let rockAssets = null; // Map<kind, THREE.BufferGeometry[]>（世界尺度已归一）
let rockAssetsPromise = null;

/**
 * 把几何体归一成 mergeGeometries 能合并的形态。
 *
 * mergeGeometries 要求所有几何**属性集合完全一致**（position/normal/uv），
 * 且要么都索引要么都不索引。GLB 里的几何常常缺 uv 或索引方式不同，
 * 混在一起合并会直接抛 "Invalid array length"。
 */
function normalizeRockGeo(g) {
  if (!g.attributes.position) return null;
  // **统一转成非索引几何**。
  // mergeGeometries 在混合索引/非索引、或索引位宽不同时会抛
  // "Invalid array length"。非索引是唯一 100% 安全的合并形态，
  // 代价是顶点数变多——石头网格最终会合并成 1 个 Mesh，
  // 顶点翻倍换来的是绝不炸，比省顶点重要。
  const out = g.index ? g.toNonIndexed() : g;
  if (out !== g) g.dispose();
  if (!out.attributes.normal) out.computeVertexNormals();
  if (!out.attributes.uv) {
    const n = out.attributes.position.count;
    out.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  }
  // 多余的属性（tangents/color/uv1…）会让合并失败 → 只留三者
  for (const key of Object.keys(out.attributes)) {
    if (!['position', 'normal', 'uv'].includes(key)) out.deleteAttribute(key);
  }
  out.clearGroups();
  return out;
}

async function loadRockAssets() {
  if (rockAssetsPromise) return rockAssetsPromise;
  rockAssetsPromise = (async () => {
    try {
      const res = await fetch('rocks/manifest.json');
      if (!res.ok) throw new Error(`manifest HTTP ${res.status}`);
      const manifest = await res.json();
      const list = manifest.stones || [];
      if (!list.length) throw new Error('manifest 里没有石头');

      const loader = new GLTFLoader();
      const byKind = new Map();
      for (const s of list) {
        const gltf = await loader.loadAsync(`rocks/${s.file}`);
        const src = gltf.scene;
        src.traverse((o) => {
          if (!o.isMesh || !o.geometry) return;
          const g = o.geometry.clone();
          // GLB 的坐标轴与 three.js 不同，先转到 Y 朝上
          g.rotateX(Math.PI / 2);
          // 归一化到「高度 1」，摆放时按假山尺寸缩放
          g.computeBoundingBox();
          const h = g.boundingBox.max.y - g.boundingBox.min.y || 1;
          g.scale(1 / h, 1 / h, 1 / h);
          g.computeBoundingBox();
          // 把底面对齐到 y=0
          g.translate(0, -g.boundingBox.min.y, 0);
          const norm = normalizeRockGeo(g);
          if (!norm) return;
          if (!byKind.has(s.kind)) byKind.set(s.kind, []);
          byKind.get(s.kind).push(norm);
        });
      }
      if (!byKind.size) throw new Error('GLB 里没有网格');
      rockAssets = byKind;
      console.log(
        `  ✓ 假山资产：${list.length} 块 / ${byKind.size} 种石型（GPU 生成）`
      );
      return byKind;
    } catch (err) {
      console.warn('  ! 假山资产加载失败，回退到程序化叠山：', err.message);
      rockAssets = null;
      return null;
    }
  })();
  return rockAssetsPromise;
}

/**
 * 用 GPU 资产摆一座假山：一堆大小不一的石头咬合堆叠。
 * @returns {THREE.BufferGeometry[]}
 */
function buildRockeryClusterFromAssets(kindPool, radius, height, seed) {
  const rnd = mulberry32(seed);
  const parts = [];
  const kinds = [...kindPool.keys()];
  if (!kinds.length) return parts;

  // 叠山有主次：一条自下而上的偏斜主脊，石块围绕它咬合
  const spineLean = (rnd() - 0.5) * radius * 0.9;
  const spineDir = rnd() * Math.PI * 2;
  const layers = 4 + Math.floor(rnd() * 3);

  for (let l = 0; l < layers; l++) {
    const t = l / layers;
    const y = height * Math.pow(t, 1.2) * 0.8;
    const r = radius * (1 - t * 0.5) * (0.75 + rnd() * 0.45);
    const cx = Math.cos(spineDir) * spineLean * t;
    const cz = Math.sin(spineDir) * spineLean * t;
    const blocks = 3 + Math.floor(rnd() * 4);
    for (let b = 0; b < blocks; b++) {
      const kind = kinds[Math.floor(rnd() * kinds.length)];
      const pool = kindPool.get(kind);
      if (!pool?.length) continue;
      const src = pool[Math.floor(rnd() * pool.length)];
      const g = src.clone();      const a = rnd() * Math.PI * 2;
      const d = r * Math.sqrt(rnd()) * 0.95;
      // 单块石头的尺寸：底层大、顶层小
      const size = radius * (0.28 + rnd() * 0.42) * (1 - t * 0.4);
      g.scale(size, size * (0.85 + rnd() * 0.6), size);
      g.rotateY(rnd() * Math.PI * 2);
      g.rotateX((rnd() - 0.5) * 0.25);
      g.translate(cx + Math.cos(a) * d, y, cz + Math.sin(a) * d);
      parts.push(g);
    }
  }
  return parts;
}

/**
 * 假山。资产已加载则用 GPU 真网格，否则用程序化叠山。
 */
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
    const geo = rockAssets
      ? buildRockeryClusterFromAssets(rockAssets, r.r, r.h, r.seed)
      : buildRockeryCluster(r.r, r.h, r.seed);
    if (!geo) continue;
    const list = Array.isArray(geo) ? geo : [geo];
    for (const g of list) {
      const m = new THREE.Matrix4()
        .makeRotationY(((r.seed % 1000) / 1000) * Math.PI * 2)
        .setPosition(r.x, (heightAt?.(r.x, r.z) ?? 0) - 0.9, r.z);
      g.applyMatrix4(m);
      all.push(g);
    }
  }
  if (all.length) {
    // 合并前再统一归一化一次：GPU 资产与程序化几何的属性集合必须一致，
    // 否则 mergeGeometries 直接抛 "Invalid array length"。
    const prepared = all.map(normalizeRockGeo).filter(Boolean);
    const merged = prepared.length ? mergeGeometries(prepared, false) : null;
    if (merged) {
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    } else {
      console.warn('  ! 假山几何合并失败，逐块添加');
      for (const g of prepared) {
        const mesh = new THREE.Mesh(g, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      }
    }
    for (const g of all) g.dispose();
    for (const g of prepared) if (!all.includes(g)) g.dispose();
  }
  return group;
}

/**
 * 预加载假山资产。场景装配时先 await 这个，
 * 这样假山一出场就是 GPU 真网格，不用先出程序化版再换。
 */
export async function preloadRockAssets() {
  await loadRockAssets();
  return rockAssets;
}
