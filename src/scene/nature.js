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
import { taihuStone } from './buildings/textures.js';
import { applyTriplanar } from './triplanar.js';

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
 * 单块主体石的**尺寸上限**（米）—— 人定的尺度，不是山定的。
 *
 * 清式叠山的主体石在 1.2~2.2 m。超过这个量级，一块石头就读作"巨岩"：
 * 实测 r=14 m 的假山原算出 5.1 m 的石块，近景里一块横跨 20 m，
 * 整座山是"一堆散落的大石头"，不是"叠石成山"。
 *
 * 加了上限之后，山越大石头越多（环排数量跟着涨），环始终闭得上。
 */
/**
 * 石块**最长边**上限（米）。
 *
 * ⚠⚠ 2026-11-16 改口径：原来是 2.2 m，理由写的是"大石读作散落巨岩"。
 *   那条结论是在**资产轴向搞反**的前提下得出的 —— 石头被压成扁饼，
 *   一块就横跨十几米，看起来自然是"散落巨岩"。
 *   轴向修正后（大石头**立着**、比例正常），上限定得太小反而出问题：
 *   环排补不满坡面 ⇒ 缝里全是土胎 ⇒ 整座山读作"土坡上撒了几颗石子"。
 *   ⇒ 现在按「石头宽度 ≈ 该层周长 / 环排块数」给尺寸，
 *     上限放宽到 4 m（清式大叠山的主体石本就到这个量级）。
 */
const MAX_STONE_SIZE = 4.0;
/**
 * 石块的**横向 / 纵向**比上限。
 *
 * 资产里 `reclining`（卧牛）天生是 3.9 宽 × 1.0 高 —— 直接用就摊成
 * 8 m 宽的"大饼"，读作散落巨岩而不是叠石 ⇒ 横向压到 ASPECT_CAP 倍高。
 */
const ASPECT_CAP = 2.2;
/**
 * 土胎半径相对"层半径"的缩放。
 *
 * ⚠ 胎面带噪声 ⇒ 同一圈上不同角度的胎面半径不同（±25%）。
 *   石块若按固定的层半径摆，必然有的浮空、有的埋死 ⇒
 *   **石块的落位必须查同一张胎面**（见 `coreSurface`）。
 */
const CORE_SHRINK = 0.9;

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
let rockAssetsLod = null; // Map<kind, THREE.BufferGeometry[]>（低模，远景用）
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

/* -------------------------------------------------- 溶蚀起伏（几何） */

/** 名字 → 稳定整数种子 */
function hashName(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 三维 value noise：hash + 三线性插值（无梯度，够用） */
function hash3i(x, y, z) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function vnoise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const c000 = hash3i(xi, yi, zi), c100 = hash3i(xi + 1, yi, zi);
  const c010 = hash3i(xi, yi + 1, zi), c110 = hash3i(xi + 1, yi + 1, zi);
  const c001 = hash3i(xi, yi, zi + 1), c101 = hash3i(xi + 1, yi, zi + 1);
  const c011 = hash3i(xi, yi + 1, zi + 1), c111 = hash3i(xi + 1, yi + 1, zi + 1);
  const x00 = c000 + (c100 - c000) * u;
  const x10 = c010 + (c110 - c010) * u;
  const x01 = c001 + (c101 - c001) * u;
  const x11 = c011 + (c111 - c011) * u;
  const y0 = x00 + (x10 - x00) * v;
  const y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}

/**
 * 给一块石头加**溶蚀起伏**（沿法线的位移）。
 *
 * ⚠⚠ 为什么必须是**几何**而不是贴图：
 *   AGENTS.md §4.1 ——「换更好的贴图 ≠ 精细化」。
 *   贴图只改颜色，改不了**轮廓**。把一块石头放到 3 m 内看：
 *   它的剪影必须是一块有坑有棱的石头，不是蛋。
 *   原来的高模球体表面全平滑 ⇒ 近景读作"陶土捏的鹅卵石"。
 *
 * 做法：沿法线叠加两段噪声（粗起伏 + 细起伏），
 * 再重算法线 ⇒ 表面自己产生明暗与自阴影。
 *
 * 在**资产加载时**做一次（每种石型只算一遍，18 + 6 块），
 * 运行时零成本；石块之间的差异靠随机旋转 + 非均匀缩放拉开。
 *
 * @param {THREE.BufferGeometry} g  已归一化到「高度 1」的石头
 * @param {number} seed 稳定种子
 * @param {number} amp 起伏幅度（相对石头高度）
 */
function roughenRockAsset(g, seed, amp = 0.13) {
  const pos = g.attributes.position;
  if (!pos) return g;
  // 起伏沿**法线**方向走 ⇒ 必须先有法线（GLB 一般自带，缺失就补算）
  if (!g.attributes.normal) g.computeVertexNormals();
  const nrm = g.attributes.normal;
  g.computeBoundingSphere();
  const R = Math.max(1e-4, g.boundingSphere.radius);
  // 噪声频率以包围球半径为参照：粗起伏跨过石头约 1.7 个特征，细的约 5.5 个
  const f1 = 1.7 / R;
  const f2 = 5.5 / R;
  const s = (seed % 997) * 0.137;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const n1 = vnoise3(x * f1 + s, y * f1 + s * 1.7, z * f1 - s);
    const n2 = vnoise3(x * f2 - s, y * f2 + s * 0.6, z * f2 + s);
    // 两段叠加后落在 -1..1
    const d = (n1 - 0.5) * 1.55 + (n2 - 0.5) * 0.7;
    const k = d * amp * R;
    const nx = nrm.getX(i), ny = nrm.getY(i), nz = nrm.getZ(i);
    pos.setXYZ(i, x + nx * k, y + ny * k, z + nz * k);
  }
  pos.needsUpdate = true;
  // 位移后法线全变了 —— 必须重算，否则高光是旧的球面法线
  g.computeVertexNormals();
  return g;
}

/**
 * 从一份 manifest 加载石头几何。
 *
 * ⚠ **只请求一个文件**：`stones.glb`（所有石头合并在一起）。
 * 逐个文件加载（30 个 GLB）在 dev server 上要 **200 秒** ——
 * 静态文件请求被串行排队，每个文件 10 秒级延迟。
 * 合成一个文件后只请求一次，秒级完成。
 *
 * 合并 GLB 里每个石头是一个独立 node，node 名 = "<kind>-<variant>"，
 * 浏览器端按名字分组，还原成 kind → 几何数组 的结构。
 *
 * @param {string} base 资源目录（相对站点根）
 */
async function loadRockSet(base) {
  const t0 = performance.now();
  const res = await fetch(`${base}/combined.json`);
  if (!res.ok) throw new Error(`combined.json HTTP ${res.status}`);
  const meta = await res.json();

  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(`${base}/${meta.file}`);
  const tParse = performance.now() - t0;

  // node 名 → kind
  const nameToKind = new Map(meta.stones.map((s) => [s.name, s.kind]));
  const byKind = new Map();
  gltf.scene.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    // node 名可能是 "spire-0" 或带后缀，取第一段
    const raw = o.name || '';
    const kind = nameToKind.get(raw) || raw.split('-')[0];
    const g = o.geometry.clone();
    // ⚠⚠⚠ **不要 rotateX** —— glTF / Blender / trimesh 导出的资产**本来就是 Y 朝上**。
    //
    //   依据（两处，互相印证）：
    //   ① `scripts/gen-rock.py → normalize()` 写死「高度 = 1，底面贴 y=0，XZ 居中」，
    //      且导出的 meta 里 `"height": size[1] / h` —— **Y 就是高度轴**；
    //   ② 实测 GLB 原始 POSITION：spire-1 = 0.253(X) × **1.000(Y)** × 0.252(Z)
    //      —— Y 就是长轴。
    //
    //   原来那句 `g.rotateX(Math.PI / 2)` 把**每块石头都放倒了**：
    //   长轴 Y → Z ⇒ "归一化到高度 1"取的是**被压扁的那个轴**（0.252 而非 1.0）
    //   ⇒ 石头被横向放大 4 倍、压成 1 m 高的**薄饼**。后果（全部实测）：
    //     · 假山读作"一堆散落的大石饼"，不是叠石成山；
    //     · 瘦峰类（spire / shoot）被压成 **4:1 的扁薄片**斜插在山体上
    //       ⇒ 近景就是一堆**白色薄刺**（AGENTS 里"白色尖片"那个坑的真凶）；
    //     · 「石块尺寸封顶 2.2 m」的语义失效（2.2 变成高度，宽度摊到 8 m）。
    //
    // 归一化到「高度 1」，摆放时按假山尺寸缩放
    g.computeBoundingBox();
    const h = g.boundingBox.max.y - g.boundingBox.min.y || 1;
    g.scale(1 / h, 1 / h, 1 / h);
    // 记下「最长边」「水平最大边」相对高度的比值 ——
    // 摆放时按**最长边**给尺寸，而不是按高度：
    //   reclining 这类宽石头（3.7 宽 × 1.0 高）若按高度给尺寸，
    //   2.2 m 的"石头"会摊成 8 m 宽的大饼。
    g.computeBoundingBox();
    {
      const bb0 = g.boundingBox;
      const w0 = Math.max(bb0.max.x - bb0.min.x, bb0.max.z - bb0.min.z);
      const h0 = bb0.max.y - bb0.min.y;
      g.userData.w0 = w0;
      g.userData.maxDim = Math.max(w0, h0);
    }
    // ⚠ **溶蚀起伏**（几何，不是贴图）—— 见 roughenRockAsset。
    // 放在归一化之后、贴地对齐之前：此时石头已是"高度 1"的单位尺度，
    // 起伏幅度可以按比例给；贴地对齐放在扰动之后，底面才不会飘。
    // ⚠⚠ 位移量必须极小：位移是**相对包围球半径**的百分比，
    //   0.17 的幅度 = 把石头沿法线推出 8.5% 的体量 ⇒ 撕成白色碎片。
    //   ⇒ 压到 3~5%：只做"石面不是完美光滑"的微起伏。
    roughenRockAsset(g, hashName(raw), base.includes('lod') ? 0.035 : 0.05);
    g.computeBoundingBox();
    // 把底面对齐到 y=0
    g.translate(0, -g.boundingBox.min.y, 0);
    const norm = normalizeRockGeo(g);
    if (!norm) return;
    // ⚠ `normalizeRockGeo → toNonIndexed()` **不复制 userData** ⇒ 只能挂在这里
    norm.userData.w0 = g.userData.w0;
    norm.userData.maxDim = g.userData.maxDim;
    if (!byKind.has(kind)) byKind.set(kind, []);
    byKind.get(kind).push(norm);
  });
  if (!byKind.size) throw new Error('GLB 里没有网格');
  console.log(
    `    · ${base} 资产：${meta.stones.length} 块 / 下载+解析 ${Math.round(tParse)}ms`
  );
  return byKind;
}

async function loadRockAssets() {
  if (rockAssetsPromise) return rockAssetsPromise;
  rockAssetsPromise = (async () => {
    try {
      rockAssets = await loadRockSet('rocks');
      console.log(
        `  ✓ 假山资产：${rockAssets.size} 种石型（GPU 生成）`
      );
    } catch (err) {
      console.warn('  ! 假山资产加载失败，回退到程序化叠山：', err.message);
      rockAssets = null;
      return null;
    }
    // 低模是**可选**的：有就用（远景假山省面数），没有也不影响
    try {
      rockAssetsLod = await loadRockSet('rocks-lod');
      console.log(`  ✓ 假山低模资产：${rockAssetsLod.size} 种石型（远景用）`);
    } catch {
      rockAssetsLod = null;
    }
    return rockAssets;
  })();
  return rockAssetsPromise;
}

/**
 * 低模的 UV 重算：也走三平面，但用**更省**的写法。
 *
 * 低模只有 ~420 顶点，全园 1.5 万块 = 630 万次循环，
 * 实测 1~2 秒，可以接受 —— 换来远近一致的纹理表现。
 * （之前低模直接用资产自带 UV，旋转后不跟着转，远处石头出现拉伸怪纹。）
 */
function scaleRockUVFast(g, tileM = 2.6) {
  return scaleRockUV(g, tileM);
}

/**
 * 按最终尺寸缩放 UV —— **快版**，不做投影重算。
 *
 * ⚠ **性能**：全园假山有 ~2.8 万块石头，高模的每块 6000 顶点、低模 660 顶点，
 *   合计 **1800 万顶点**。逐顶点重算三平面投影（带三角函数）
 *   要 200 秒以上，场景构建根本没法用。
 *
 * 折中：投影在**资产生成时**算好（`scripts/gen-rock.py` 的 planar_uv，
 * 已经是三平面加权、无接缝），运行时只按尺寸乘一个系数。
 * 非均匀缩放（Y 向 0.8~1.3）会带来最多 ±25% 的纹理拉伸 —— 肉眼基本看不出，
 * 换来的是构建时间回到秒级。
 *
 * @param {THREE.BufferGeometry} g 已完成全部变换的几何
 * @param {number} [tileM=1.6] 一个 UV 周期对应多少米
 */
function scaleRockUV(g, tileM = 1.6) {
  const uv = g.attributes.uv;
  if (!uv) return g;
  g.computeBoundingBox();
  const bb = g.boundingBox;
  // 用包围盒的**平均边长**代表这块石头的尺度
  const size =
    (Math.max(bb.max.x - bb.min.x, 1e-3) +
      Math.max(bb.max.y - bb.min.y, 1e-3) +
      Math.max(bb.max.z - bb.min.z, 1e-3)) /
    3;
  const k = size / tileM;
  const arr = uv.array;
  for (let i = 0; i < arr.length; i++) arr[i] *= k;
  uv.needsUpdate = true;
  return g;
}

/**
 * 用 GPU 资产摆一座假山：**土胎核心 + 顺坡叠石**。
 *
 * ## 结构依据（清式叠山的真实做法）
 *
 * 清式叠山不是"一块块石头摞起来"，而是：
 *   ① 内部填**土胎**（三合土 + 碎石），做出山体的**实心感**；
 *   ② 表面用**石块沿坡面叠砌**，一层层咬合，顺着山势往上收。
 *
 * ⚠⚠ **为什么必须有土胎**（实测踩坑）：
 *   原来只有石头、且按"水平石层"往上摞 —— 上层石头缩到内圈，
 *   下面一层的环中间是**空的**，于是：
 *     · 石头之间**大片悬空**（近景能看见天/草从石头缝里穿过去）；
 *     · 从高处能**看穿山体**，读作"一堆漂浮的岩岛"；
 *     · 山体没有体积，整体像"散落的大石饼"，不是"山"。
 *   加了土胎之后：石头缝里露出的是**深色胎体**（不是天），
 *   山体是实心的，石头顺着坡面躺 —— 这才读得出"叠山"。
 *
 * @param {Map<string, THREE.BufferGeometry[]>} kindPool 石型 → 网格
 * @param {number} radius 山体半径
 * @param {number} height 山体高度
 * @param {number} seed 随机种子
 * @returns {{stones: THREE.BufferGeometry[], cores: THREE.BufferGeometry[]}}
 */
function buildRockeryClusterFromAssets(kindPool, radius, height, seed, recalcUV = true) {
  const rnd = mulberry32(seed);
  const stones = [];
  const cores = [];
  const kinds = [...kindPool.keys()];
  if (!kinds.length) return { stones, cores };

  /** 瘦高类（spire/shoot/cluster）：只做立峰与插石，不进主体层 */
  const PEAK_KINDS = ['spire', 'shoot', 'cluster'];
  /** 主体石：比例接近 1:1.2~1:1.4，能拼成"一课"整齐的层 */
  const COURSE_KINDS = ['strata', 'cavern'];
  /** 卧牛类：宽而扁，做少数低矮点缀 */
  const FLAT_KINDS = ['reclining'];

  const poolOf = (list) => {
    for (const k of list) {
      const p = kindPool.get(k);
      if (p?.length) return p;
    }
    return [];
  };
  const coursePool = poolOf(COURSE_KINDS).length
    ? poolOf(COURSE_KINDS)
    : poolOf(['strata', 'cavern', 'reclining']);
  const peakPool = poolOf(PEAK_KINDS);
  const flatPool = poolOf(FLAT_KINDS);
  const anyPool = poolOf(kinds);
  if (!coursePool.length && !anyPool.length) return { stones, cores };

  const span = Math.max(1.2, Math.min(radius, height));

  /* ------------------------------------------------ 山体轮廓 */
  // 底盘半径 → 顶点半径 / 顶点高度
  const R0 = radius;
  const rApex = Math.max(0.4, radius * 0.13);
  const yApex = height * 0.82;
  // 主脊：山体不是正圆锥，偏着长才有主次
  const spineLean = (rnd() - 0.5) * radius * 0.4;
  const spineDir = rnd() * Math.PI * 2;

  // 层数按山高定：每层约 span/5 高。
  const layers = Math.max(3, Math.min(5, Math.round(height / (span / 5))));

  // 轮廓采样点（每一"课"石头的中心所在）
  const prof = [];
  for (let i = 0; i < layers; i++) {
    const t = layers > 1 ? i / (layers - 1) : 0;
    prof.push({
      r: R0 + (rApex - R0) * Math.pow(t, 0.88),
      y: yApex * Math.pow(t, 1.1),
    });
  }

  /** 轮廓高度：给定半径处的坡面高度 */
  const surfaceY = (r) => {
    if (r >= prof[0].r) return prof[0].y;
    for (let i = 0; i < prof.length - 1; i++) {
      const a = prof[i];
      const b = prof[i + 1];
      if (r <= a.r && r >= b.r) {
        const k = (a.r - r) / Math.max(a.r - b.r, 1e-6);
        return a.y + (b.y - a.y) * k;
      }
    }
    return prof[prof.length - 1].y;
  };

  /** 局部坡角（弧度，向外下降为正）—— 石头要顺着坡躺 */
  const slopeAt = (r) => {
    const d = 1.4;
    const y1 = surfaceY(r + d);
    const y0 = surfaceY(Math.max(r - d, 0.02));
    return Math.atan2(y0 - y1, 2 * d);
  };

  /* ------------------------------------------------ 土胎 */
  //
  // 胎体的采样环由**这里**生成（不放在 buildRockeryCore 里），
  // 因为表面叠石要查**同一张胎面**来落位 —— 两边各算各的就会错位。
  const coreRings = [];
  const courseRing = []; // 每一"课"对应 coreRings 的第几圈
  for (let i = 0; i < prof.length; i++) {
    courseRing.push(coreRings.length);
    coreRings.push({ r: prof[i].r, y: prof[i].y });
    if (i + 1 < prof.length) {
      for (let k = 1; k <= 3; k++) {
        const f = k / 4;
        coreRings.push({
          r: prof[i].r + (prof[i + 1].r - prof[i].r) * f,
          y: prof[i].y + (prof[i + 1].y - prof[i].y) * f,
        });
      }
    }
  }
  {
    const last = prof[prof.length - 1];
    coreRings.unshift({ r: prof[0].r, y: -2.2 }); // 埋进土里
    for (let k = 1; k <= 4; k++) {
      const f = k / 5;
      coreRings.push({ r: last.r * (1 - f * 0.92), y: last.y + (yApex - last.y) * f });
    }
  }
  cores.push(buildRockeryCore(coreRings, recalcUV));

  /* ------------------------------------------------ 生成一块石头 */
  /**
   * @param {THREE.BufferGeometry} src 资产（已归一化到"高度 1"）
   * @param {number} targetH 目标高度
   * @param {number} tilt 顺坡倾角
   */
  const makeStone = (src, targetH, tilt) => {
    const g = src.clone();
    const maxDim = src.userData.maxDim || 1;
    const w0 = src.userData.w0 || 1;
    // 横向不许超过 ASPECT_CAP 倍高 —— 否则宽石头摊成大饼
    const hs = Math.min(1, ASPECT_CAP / Math.max(w0, 1e-3));
    const s = targetH / maxDim;
    // 随机压扁 15%：石头有胖瘦差别
    const squash = 0.85 + rnd() * 0.15;
    const flat = 1 / Math.sqrt(squash);
    g.scale(s * flat * hs, s * squash, s * flat * hs);
    g.rotateY(rnd() * Math.PI * 2);
    if (tilt) g.rotateX(tilt);
    // 旋转后底面会歪 ⇒ 重新贴到 y=0
    g.computeBoundingBox();
    g.translate(0, -g.boundingBox.min.y, 0);
    return g;
  };

  /**
   * 把石头摆到**胎面**上。
   *
   * ⚠⚠ 落位查的是 `coreSurface()` —— 与胎体网格**同一张曲面**。
   *   胎面半径带 ±25% 的噪声，若石块按固定的"层半径"摆，
   *   就会出现"有的浮在半空、有的埋进胎里"（悬空石的第二重成因）。
   *
   * @param {number} ringIdx 胎体的第几圈
   * @param {number} a 角度
   */
  const placeOn = (src, cx, cz, ringIdx, a, targetH, tilt, sink, out) => {
    if (!src) return null;
    const ring = coreRings[ringIdx];
    const cs = coreSurface(ring.r, ring.y, a);
    const g = makeStone(src, targetH, tilt);
    const h = g.boundingBox.max.y - g.boundingBox.min.y;
    // 沿胎面法向外挪一点，让石头探出胎体、打破锥面轮廓
    const rr = cs.r * (out ?? 1);
    g.translate(cx + Math.cos(a) * rr, cs.y - h * sink, cz + Math.sin(a) * rr);
    // UV 必须在**全部变换之后**算，否则非均匀缩放会把 UV 拉成长条
    if (recalcUV) scaleRockUV(g);
    else scaleRockUVFast(g);
    stones.push(g);
    return g;
  };

  /* ------------------------------------------------ 主体：顺坡叠石 */
  for (let l = 0; l < layers; l++) {
    const p = prof[l];
    const t = layers > 1 ? l / (layers - 1) : 0;
    // 本层石块尺寸：**跟着该层截面走**，不是跟山高走。
    //
    // ⚠⚠ 尺寸的上限/下限是"叠山像不像"的总开关：
    //   石头太小 ⇒ 环排补不满坡面，缝里全是胎体 ⇒ 读作"锥形土坡上撒了几颗石子"；
    //   石头太大 ⇒ 读作"散落巨岩"，不是叠石成山。
    //   正确的比例是**石头宽度 ≈ 该层坡面周长 / 环排块数**，
    //   于是每层刚好铺满一圈 —— 这才是"一层层叠上去"。
    const stoneSize = Math.max(
      1.0,
      Math.min(p.r * 0.26, MAX_STONE_SIZE)
    ) * (0.88 + rnd() * 0.24);
    // 环上排几块：周长 ÷ 石宽，让环尽量闭合
    //
    // ⚠ 上限 26 是**三角面预算的主控项**（AGENTS §4）：
    //   环不闭合没关系 —— 缝里露出的是**深色土胎**，读作山石的裂隙，
    //   不是"空洞"。所以宁可留缝，也不要把石头放大成巨岩。
    const circumference = 2 * Math.PI * p.r;
    const ringCount = Math.max(
      4,
      Math.min(30, Math.round(circumference / (stoneSize * 0.98)))
    );
    // 本层中心沿主脊偏移
    const cx = Math.cos(spineDir) * spineLean * t;
    const cz = Math.sin(spineDir) * spineLean * t;
    const tilt = slopeAt(p.r);

    for (let b = 0; b < ringCount; b++) {
      // ⚠ 角度与尺寸都要抖 —— 整齐等距的一圈读作"一串糖葫芦"，不像叠山。
      const a =
        (b / ringCount) * Math.PI * 2 +
        (rnd() - 0.5) * ((2 * Math.PI) / ringCount) * 0.85;
      const src = coursePool[Math.floor(rnd() * coursePool.length)];
      placeOn(
        src,
        cx,
        cz,
        courseRing[l],
        a,
        stoneSize * (0.72 + rnd() * 0.56),
        tilt,
        0.34,
        0.9 + rnd() * 0.22
      );
    }

    // 卧牛点缀：低矮宽石，压在层与层的交界
    if (flatPool.length && rnd() < 0.55) {
      const a = rnd() * Math.PI * 2;
      const src = flatPool[Math.floor(rnd() * flatPool.length)];
      placeOn(src, cx, cz, courseRing[l], a, stoneSize * 0.5, tilt * 0.5, 0.4, 0.86 + rnd() * 0.1);
    }
  }

  /* ------------------------------------------------ 插石：竖着的瘦石 */
  // 主体层都是"躺"的坡石；插入几根**竖着**的瘦石（立笋），
  // 山体才有高低起伏的轮廓变化，不然整座山读作一个平缓的锥。
  const accentCount = 1 + Math.floor(rnd() * 3);
  for (let i = 0; i < accentCount; i++) {
    if (!peakPool.length) break;
    const a = rnd() * Math.PI * 2;
    const li = Math.floor(rnd() * prof.length);
    const p = prof[li];
    const src = peakPool[Math.floor(rnd() * peakPool.length)];
    placeOn(src, 0, 0, courseRing[li], a, p.r * 0.5 + 1.2, 0, 0.35, 0.8 + rnd() * 0.12);
  }

  /* ------------------------------------------------ 立峰 */
  // 一根瘦而有肉的太湖石，压在山顶 —— 没有这一根，整座山就是一堆碎石头。
  if (peakPool.length && rnd() < 0.8) {
    const src = peakPool[Math.floor(rnd() * peakPool.length)];
    const g = src.clone();
    // ⚠ 立峰按**资产自身的比例**统一放大（不再按 (pw, ph, pw) 拉扁）：
    //   spire/shoot 本来就是瘦长形（宽/高 ≈ 0.28~0.40），
    //   强行把 X/Z 压到 pw、Y 拉到 ph ⇒ 宽度只剩 ph 的 1/7 ⇒ **一根针**，
    //   读作"插在山上的白色尖片"，不是"瘦而有肉的太湖石立峰"。
    const ph = Math.min(height * (0.26 + rnd() * 0.16), span * 0.7);
    const s = ph / (src.userData.maxDim || 1);
    g.scale(s, s, s);
    // 宽度兜上限：瘦峰不能比山体还宽
    const wPeak = (src.userData.w0 || 0.4) * ph;
    const wCap = span * 0.3;
    if (wPeak > wCap) {
      const k = wCap / wPeak;
      g.scale(k, k, k);
    }
    g.rotateY(rnd() * Math.PI * 2);
    g.rotateZ((rnd() - 0.5) * 0.18);
    g.computeBoundingBox();
    g.translate(0, -g.boundingBox.min.y, 0);
    const hh = g.boundingBox.max.y;
    const top = prof[prof.length - 1];
    g.translate(
      Math.cos(spineDir) * spineLean + (rnd() - 0.5) * radius * 0.16,
      top.y - hh * 0.3,
      Math.sin(spineDir) * spineLean + (rnd() - 0.5) * radius * 0.16
    );
    if (recalcUV) scaleRockUV(g);
    else scaleRockUVFast(g);
    stones.push(g);
  }

  return { stones, cores };
}

/**
 * 土胎表面：**给定圈与角度**，返回胎体表面的 (半径, 高度)。
 *
 * ⚠⚠ 这个函数被**两处**共用 ——
 *   ① 胎体网格本身；
 *   ② 表面叠石的**落位**（石块要骑在胎面上，不能各摆各的）。
 *   两处若各算各的，胎面与石块就会**错位**：
 *   胎体半径带噪声，石块若按固定的"层半径"放，
 *   就会有的浮在半空、有的埋进胎里 —— 这正是"悬空石"的第二重成因。
 */
function coreSurface(ringR, ringY, a) {
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  // 三段噪声：大团块 + 中等起伏 + 小疙瘩
  // ⇒ 胎体是**一块不规则的岩体**，不是一个光滑的锥面
  //
  // ⚠⚠ **频率必须低于角向采样率**（RAD=64 ⇒ 每个噪声特征至少 8 个采样）：
  //   之前第四段用了频率 21，而角向只有 44 个采样 ⇒ 每特征仅 2 个采样
  //   ⇒ **欠采样混叠** ⇒ 胎面上长出一片**扁平的薄板鳍**，
  //   近景看就是"山体上插着几块碎玻璃"。这是几何层的混叠，不是贴图问题。
  // ⚠ 噪声频率要跟**半径**走（freq = r / 特征尺寸），
  //   否则大山的凹凸会大得离谱、小山又完全没有起伏 ——
  //   同一套频率在 15 m 与 3 m 的山上读出来完全是两回事。
  const f1 = ringR / 6.5; // 大团块：约 6.5 m
  const f2 = ringR / 2.6; // 中等起伏：约 2.6 m
  const f3 = ringR / 1.1; // 小疙瘩：约 1.1 m
  const n1 = vnoise3(ca * f1, ringY * 0.16, sa * f1);
  const n2 = vnoise3(ca * f2, ringY * 0.3, sa * f2);
  const n3 = vnoise3(ca * f3, ringY * 0.55, sa * f3);
  const f = 0.26 * (n1 - 0.5) + 0.16 * (n2 - 0.5) + 0.1 * (n3 - 0.5);
  // ⚠⚠ 起伏必须是**绝对量**，不能是半径的百分比。
  //   相对量（±29%）在 15 m 半径处 = ±4.4 m 的径向跳动，
  //   而角向采样间隔才 1.4 m ⇒ 表面被撕成一片**大三角折面**，
  //   近景看就是"山体上插着几块碎玻璃"。
  //   ⇒ 改成绝对位移，并按半径封顶（小山不至于被抖散）。
  const amp = Math.min(2.6, ringR * 0.3);
  return {
    r: Math.max(0.05, ringR * CORE_SHRINK + f * amp),
    y: ringY + (n3 - 0.5) * 0.8 + (n2 - 0.5) * 0.5,
  };
}

/**
 * 土胎核心（清式叠山的"三合土胎"）。
 *
 * ⚠ **它不是装饰，是结构**：没有它，山体中间是空的 ——
 *   石头缝里会露出天/草，整座山读作"一堆漂浮的岩岛"。
 *
 * 做法：一个沿轮廓的回转面，每点半径带噪声 ⇒ 不是规整锥面，
 * 而是一块有起伏的**土石胎**；底部埋进地面 2 m，顶部收到顶点。
 *
 * @param {{r:number,y:number}[]} prof 轮廓采样点
 * @param {number} yApex 顶点高度
 * @param {number} seed
 * @returns {THREE.BufferGeometry}
 */
function buildRockeryCore(rings, hiMod) {
  // ⚠ 角向采样数：必须 ≥ 最高噪声频率 × 8，否则欠采样混叠（见 coreSurface）
  //   高模山（人走得近的那些）采样密一档；远处只留剪影。
  const RAD = hiMod ? 128 : 72;
  const rows = [];
  for (let i = 0; i < rings.length; i++) {
    const ring = rings[i];
    const row = [];
    for (let j = 0; j <= RAD; j++) {
      const a = (j / RAD) * Math.PI * 2;
      const s = coreSurface(ring.r, ring.y, a);
      row.push([Math.cos(a) * s.r, s.y, Math.sin(a) * s.r]);
    }
    rows.push(row);
  }

  const pos = [];
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < RAD; j++) {
      const a = rows[i][j];
      const b = rows[i][j + 1];
      const c = rows[i + 1][j + 1];
      const d = rows[i + 1][j];
      pos.push(...a, ...d, ...c);
      pos.push(...a, ...c, ...b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // 合并层要求属性齐（position/normal/uv）—— 土胎走三平面，UV 只是占位
  const n = pos.length / 3;
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}

/**
 * 假山。资产已加载则用 GPU 真网格，否则用程序化叠山。
 *
 * **LOD**：446 座假山全用 6000 面/块 的高模，是 6000 万三角面 —— 全园
 * 基线（13~15M）的 4 倍，一条假山就把整个场景的预算吃光了。
 * 实际看园子里的人只会贴近看其中几座，远处几千座只是"有个山"的剪影。
 * 所以按**到相机的距离**分两档：
 *   - 近（< 140m）：高模（6000 面/块），形态经得起贴近看
 *   - 远（>= 140m）：低模（220 面/块），只保留剪影
 * 相机不动时这个分配是稳定的，不会有 popping。
 */
export function buildRockery(sceneData, heightAt, cameraPos = null) {
  const group = new THREE.Group();
  group.name = 'rockery';
  // 假山用**专用的太湖石贴图**，不用 AI 的 stone（切割石板，有十字拼缝）
  // 也不用 moss（层理岩石，有强横向条带）—— 见 textures.js taihuStone()。
  const rockTex = taihuStone();
  const mat = new THREE.MeshStandardMaterial({
    map: rockTex,
    // ⚠⚠ **固有色必须由贴图与固有色共同承担，但不能双双压暗**。
    //
    //   AGENTS.md §4.1.2 的**双重变暗**：贴图底色 #a2a5a2 (linear 0.37)
    //   再乘固有色 0x7d807c (linear 0.20) ⇒ albedo 0.074 ⇒ 阳光下也是黑的。
    //   但反过来全给白（linear 1.0）也不行：本场景总照度约 3.4 倍，
    //   albedo 0.37 会被打到 **纯白**，贴图里的溶蚀斑驳全部截断、看不出形体。
    //
    //   取中间：albedo ≈ 0.15（浅灰石灰岩），
    //   阳光下 ACES 之后落在 sRGB 0.72 左右 —— 比地面亮、比天空暗，
    //   石头的坑洼与层叠才读得出来。
    color: 0xb0aca2,
    roughness: 0.96,
    metalness: 0,
    // 不用 flatShading —— 平直着色会把低模石头的三角面棱线全部显出来，
    // 近处看像一堆碎纸片；平滑着色配合法线才像石头。
    flatShading: false,
    // 石头在檐下/树影里主要靠**天光**成像，环境光太弱就只剩黑影；
    // 但环境光太强会把形体冲平（一片死白），所以取中间值。
    envMapIntensity: 0.6,
  });
  /**
   * ⚠⚠ **三平面投影**（不是几何 UV）。
   *
   * 资产自带的 UV 是**球面投影**（`gen-rock.py → planar_uv`）：
   *   方位角 + 纬度 ⇒ 石头顶部（极点）纹理被挤成一团，
   *   再叠上非均匀缩放（Y 向 0.8~1.3）⇒ 近景每块石头长出
   *   **大楔形条纹**（`/tmp/IN_A.png`），像碎玻璃不像石头。
   *
   * 改用**世界空间三平面**：无接缝、无极点奇点、不受缩放影响。
   * 代价是三次采样 —— 假山是大面积曲面，值得。
   */
  applyTriplanar(mat, { scale: 1 / 1.6 });

  /**
   * 土胎材质：比石头**暗一档**的土石色。
   *
   * ⚠ 为什么要单独一档明度：
   *   石头之间必然有缝（三角面预算不允许把环排密到无缝），
   *   缝里露出的东西决定了整座山的读感：
   *     · 露出**天/草** ⇒ 看着像"一堆漂浮的岩岛"（原来就是这个坑）；
   *     · 露出**深色胎体** ⇒ 看着是"山石的裂隙与阴处" ⇒ 有体积。
   */
  const coreMat = new THREE.MeshStandardMaterial({
    map: rockTex,
    color: 0x9e988c,
    roughness: 0.99,
    metalness: 0,
    flatShading: false,
    envMapIntensity: 0.45,
  });
  applyTriplanar(coreMat, { scale: 1 / 3.5 });

  const items = sceneData.rockery || [];
  /**
   * LOD 分配：**按假山自身的体量**（r×h），不按到相机的距离。
   *
   * ⚠ 为什么不能按距离：假山的几何在加载时就**合并成一个 Mesh**，
   *   运行时没法按距离换档（要么拆成多个 Mesh 增加 draw call，
   *   要么每帧重排几何）。而且按距离分档在相机移动时会出现
   *   "走近了还是低模"的怪现象。
   *
   * 按体量分档是稳定的：大的假山（叠山主体、游人常走到跟前的那几座）
   * 永远用高模，小的（远处的陪衬）用低模。
   *
   * 阈值取体量前 6%：446 座里最大的约 27 座用高模（2200 面/块）。
   * 实测：高模 ~1000 块(2.2M) + 低模 ~16000 块(3.5M) ≈ 5.7M 三角面。
   */
  const sorted = [...items].sort((a, b) => b.r * b.h - a.r * a.h);
  const hiCount = Math.max(1, Math.round(items.length * 0.04));
  const hiSet = new Set(sorted.slice(0, hiCount).map((r) => r.seed));

  // 合并成两个 Mesh：石头壳 + 土胎
  const all = [];
  const allCores = [];
  let hi = 0;
  let lo = 0;
  for (const r of items) {
    const useLod = !hiSet.has(r.seed);
    const pool = useLod ? rockAssetsLod : rockAssets;
    if (!pool) continue;
    if (useLod) lo++;
    else hi++;

    const geo = buildRockeryClusterFromAssets(pool, r.r, r.h, r.seed, !useLod);
    if (!geo) continue;
    // 整座山先按山中心对齐地面高程
    const baseY = (heightAt?.(r.x, r.z) ?? 0) - 0.9;
    const m = new THREE.Matrix4()
      .makeRotationY(((r.seed % 1000) / 1000) * Math.PI * 2)
      .setPosition(r.x, baseY, r.z);
    for (const list of [geo.stones, geo.cores]) {
      for (const g of list) {
        g.applyMatrix4(m);
        // ⚠ **逐块贴地**：山体横跨十几米，而地形是斜坡 ——
        // 用山中心的地面高程给所有石头定高，外围石头会离地好几米，
        // 整座山看上去是**悬在半空**的（实测 72% 的石头点离地 >0.5m）。
        //
        // 解法：每块石头按**自己脚下**的高程各下沉一点。
        // 下沉量 = 该处地面高 − 山中心地面高。这个量与它在山体里
        // 堆得多高无关，所以**不会破坏层与层的咬合关系**，
        // 只是让整座山顺着坡度"歪"过去 —— 与真实依山而建的叠山一致。
        if (heightAt) {
          g.computeBoundingBox();
          const cx = (g.boundingBox.min.x + g.boundingBox.max.x) / 2;
          const cz = (g.boundingBox.min.z + g.boundingBox.max.z) / 2;
          const groundHere = heightAt(cx, cz);
          const drop = groundHere - baseY - 0.6; // 0.6 = 埋进土里的深度
          if (Number.isFinite(drop) && drop < 0) {
            g.translate(0, drop, 0);
          }
        }
        (list === geo.cores ? allCores : all).push(g);
      }
    }
  }
  /**
   * 合并成两个 Mesh：石头壳 + 土胎。
   *
   * ⚠ **土胎单独一个材质桶**：它必须比石头**暗** ——
   *   石头缝里露出的深色胎体才读作"山石的裂隙与阴处"，
   *   要是跟石头一样亮，整座山就是"一堆白块"，没有体积感。
   */
  for (const [list, material, tag] of [
    [all, mat, '石'],
    [allCores, coreMat, '土胎'],
  ]) {
    if (!list.length) continue;
    // 合并前再统一归一化一次：GPU 资产与程序化几何的属性集合必须一致，
    // 否则 mergeGeometries 直接抛 "Invalid array length"。
    const prepared = list.map(normalizeRockGeo).filter(Boolean);
    const merged = prepared.length ? mergeGeometries(prepared, false) : null;
    if (merged) {
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    } else {
      console.warn(`  ! 假山${tag}几何合并失败，逐块添加`);
      for (const g of prepared) {
        const mesh = new THREE.Mesh(g, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      }
    }
    for (const g of list) g.dispose();
    for (const g of prepared) if (!list.includes(g)) g.dispose();
  }
  const triCount = (list) =>
    list.reduce((s, g) => s + (g.attributes.position?.count || 0) / 3, 0);
  console.log(
    `  ✓ 假山 ${items.length} 座（高模 ${hi} / 低模 ${lo}）· ` +
      `石 ${(triCount(all) / 1e6).toFixed(1)}M · 土胎 ${(triCount(allCores) / 1e6).toFixed(1)}M`
  );
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
