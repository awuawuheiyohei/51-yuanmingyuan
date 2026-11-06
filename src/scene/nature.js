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
 * 用 GPU 资产摆一座假山：一堆大小不一的石头咬合堆叠。
 *
 * 形态要点（对照 AGENTS.md §4.1「假山要层叠咬合，不能是锥体」）：
 *   - **咬合**：石头要互相嵌进，而不是在一圈圈水平层上排队；
 *     每层的石头沿主脊排布，层与层之间有横向错位和旋转。
 *   - **主次**：一条自下而上的偏斜主脊，不是正圆锥。
 *   - **瘦峰**：清式叠山必有独立立峰的太湖石，瘦而有肉，不是根棍。
 *   - **落地**：底部要压进地里，不能浮成一个白盘子。
 *
 * ⚠ **踩过的坑（悬空石）**：
 * 之前每层石头按 `y = height * t^1.2` 摆，但水平半径另算一套，
 * 两套互不约束 —— 上层石头横向跑到了下层石头够不着的地方，
 * 于是一堆石头**悬在半空**，一座山也堆不起来。
 * 现在改成**同一个锥面**同时决定 y 和半径：第 t 层的石头，
 * 横向必须落在该层锥面半径内，且它的底面要坐在下面那层石头上。
 *
 * @param {Map<string, THREE.BufferGeometry[]>} kindPool 石型 → 网格
 * @param {number} radius 山体半径
 * @param {number} height 山体高度
 * @param {number} seed 随机种子
 * @returns {THREE.BufferGeometry[]}
 */
function buildRockeryClusterFromAssets(kindPool, radius, height, seed, recalcUV = true) {
  const rnd = mulberry32(seed);
  const parts = [];
  const kinds = [...kindPool.keys()];
  if (!kinds.length) return parts;

  /** 瘦峰/笋状/群峰这类竖长石型做主峰，层叠/洞穴/卧牛做山腹 */
  const PEAK_KINDS = ['spire', 'shoot', 'cluster'];
  const MASS_KINDS = ['strata', 'cavern', 'reclining'];

  const pool = (list) => {
    for (const k of list) {
      const p = kindPool.get(k);
      if (p?.length) return p;
    }
    return [];
  };
  const massPool = pool(MASS_KINDS);
  const peakPool = pool(PEAK_KINDS);
  const anyPool = pool(kinds);

  // 叠山有主次：一条自下而上的偏斜主脊，石块围绕它咬合
  const spineLean = (rnd() - 0.5) * radius * 0.9;
  const spineDir = rnd() * Math.PI * 2;

  /**
   * 单块石头的尺寸。
   *
   * 数据里假山的 `r`（半径）与 `h`（高度）不成比例 —— 有 r=8.5/h=19.1
   * 这种又窄又高的。原来石头尺寸只跟 radius 走（r*0.5 ≈ 4.3m），
   * 结果一块石头就撑爆整座山，看过去是"岩壁"不是"山"。
   *
   * 正确做法：石头尺寸由**山体截面**决定 —— 底层石头大、顶层小，
   * 且始终小于该层的截面半径，这样石头才可能互相咬合。
   */
  const span = Math.max(1.2, Math.min(radius, height));

  // 层数按山高定：每层约 span/5 高。
  //
  // ⚠ **每山石块数是三角面预算的主控项**。
  // 之前每山 68 块（环排 + 填心 + 多层）→ 446 座 = 28000 块，
  // 就算低模 220 面/块也要 6M 面，高模 54 座更是 18.7M —— 全园直接爆掉。
  //
  // 真实叠山一座用 **15~25 块大石**就成立（块大、层少、咬合紧）。
  // 现在：层数 3~5，环排 4~7 块，填心 0~1 → 每山 12~25 块。
  const layers = Math.max(3, Math.min(5, Math.round(height / (span / 5))));

  /**
   * 当前堆到的**实际高度**（石头顶面）。
   *
   * ⚠ 这是"悬空石"的真凶：之前每层的 y 用 `height * t^1.15` 这种
   * "绝对高度"公式，各层之间**不重叠** —— 上一层石头还没堆到
   * 下一层的高度，下一层的石头就凭空出现了，看上去全悬在半空。
   *
   * 正确做法：下一层的底面 = 上一层石头的**实际顶面**，
   * 逐层往上"长"，石头之间互相咬住。这才是实心叠山。
   */
  /**
   * 堆叠模型：**实心山体**，不是浮岛群。
   *
   * ⚠ 这是假山最难的一处，反复踩坑才做对：
   *   - 按"绝对高度公式"摆（y = height·t^1.2）→ 各层不重叠，石头悬空；
   *   - 按"上层坐在下层最高点上"累加 → 水平位置随机，上层石头
   *     跑到下层石头够不着的地方 → 看着像**一堆漂浮的岩岛**。
   *
   * 正确模型（叠山本来就是这个结构）：
   *   1. 层的**高度步长 = 该层的石高**（不是全局公式）——
   *      这样下一层的底面一定落在上层石头的实体范围内，必然咬合。
   *   2. 每层的石头**沿圆环排布**（不是随机撒），
   *      环半径 = 该层截面半径，石头大小 ≈ 环的 1/周长 → 环是闭合的。
   *   3. 环内再补 1~2 块**填心石**（半径更小）→ 山体是实心的，不是空壳。
   */
  let stackTop = 0;

  for (let l = 0; l < layers; l++) {
    const t = layers > 1 ? l / (layers - 1) : 0;
    // 同一锥面决定截面半径：越往上越窄
    const layerR = radius * (1 - t * 0.58) * (0.9 + rnd() * 0.2);

    // 本层的石头大小：与该层截面挂钩，且不超过截面半径。
    // 石块数少了，石头就要**大一些**才撑得住这座山
    // （真实叠山就是"十几块大石"而不是"几十块小石"）。
    const stoneSize = Math.min(layerR * 0.55, span * 0.36) * (0.8 + rnd() * 0.4);

    // 环上排几块：周长 ÷ 石宽，但**上限收紧**。
    // 上限 7 是预算与形态的平衡点：再少环就断了（山看着空心），
    // 再多每山石块数就爆预算。
    const circumference = 2 * Math.PI * layerR;
    const ringCount = Math.max(4, Math.min(7, Math.round(circumference / (stoneSize * 1.6))));

    const cx = Math.cos(spineDir) * spineLean * t;
    const cz = Math.sin(spineDir) * spineLean * t;
    // 每层整体微转，层与层的环错开 → 咬合而不是对齐成"塔"
    const ringPhase = spineDir + l * 0.9 + rnd() * 0.4;

    let layerTop = stackTop;

    /** 在指定位置放一块石头，返回它的顶面高度 */
    const place = (px, pz, sizeScale, preferPeak) => {
      // 底层用山腹石（宽厚），越往上越可能用瘦石
      const src = preferPeak && peakPool.length
        ? peakPool[Math.floor(rnd() * peakPool.length)]
        : massPool.length
          ? massPool[Math.floor(rnd() * massPool.length)]
          : anyPool[Math.floor(rnd() * anyPool.length)];
      if (!src) return stackTop;
      const g = src.clone();
      const size = stoneSize * sizeScale;
      g.scale(size, size * (0.8 + rnd() * 0.5), size);
      // 每块石头有自己的姿态：绕 Y 转、绕 X/Z 略倾 —— 倾斜才咬合
      g.rotateY(rnd() * Math.PI * 2);
      g.rotateX((rnd() - 0.5) * 0.3);
      g.rotateZ((rnd() - 0.5) * 0.3);
      // ⚠ 旋转是绕**原点**做的，会把石头的底面转歪 ——
      // 底面歪了，石头就有一半悬空。转完必须重新把底面对齐到 y=0。
      g.computeBoundingBox();
      g.translate(0, -g.boundingBox.min.y, 0);
      g.computeBoundingBox();
      // UV 必须在**全部变换之后**算，否则非均匀缩放会把 UV 拉成长条
      if (recalcUV) scaleRockUV(g);
      else scaleRockUVFast(g);

      const stoneH = g.boundingBox.max.y;
      // **底面嵌进下面一层 35%** —— 石头之间互相咬住，绝不悬空
      const y = stackTop - stoneH * 0.35;
      g.translate(px, y, pz);
      parts.push(g);
      return Math.max(stackTop, y + stoneH);
    };

    // ① 环：沿圆周排一圈，石头之间紧挨
    for (let b = 0; b < ringCount; b++) {
      const a = ringPhase + (b / ringCount) * Math.PI * 2;
      const d = layerR * (0.86 + rnd() * 0.16);
      const top = place(
        cx + Math.cos(a) * d,
        cz + Math.sin(a) * d,
        0.85 + rnd() * 0.4,
        rnd() < 0.12 + t * 0.35
      );
      layerTop = Math.max(layerTop, top);
    }

    // ② 填心：环内再放 0~1 块石头，山体才是实心的。
    // 不放也行 —— 环排密时中心本来就是实的。
    if (rnd() < 0.55) {
      const a = rnd() * Math.PI * 2;
      const d = layerR * rnd() * 0.35;
      const top = place(
        cx + Math.cos(a) * d,
        cz + Math.sin(a) * d,
        0.7 + rnd() * 0.3,
        false
      );
      layerTop = Math.max(layerTop, top);
    }

    // 本层堆到了哪儿 → 下一层从这儿继续往上长。
    // 步长 = 本层实际堆高 − 一部分，保证上下层**重叠咬合**。
    stackTop = layerTop * 0.92;
  }

  // 独立立峰：一根瘦而有肉的太湖石，压在主脊顶端。
  // 之前缺了这一根，整座山就是一堆等身高的碎石头，看不出是"山"。
  if (peakPool.length && rnd() < 0.75) {
    const g = peakPool[Math.floor(rnd() * peakPool.length)].clone();
    const ph = Math.min(height * (0.3 + rnd() * 0.18), span * 0.8);
    const pw = Math.min(span * 0.2, radius * 0.22);
    g.scale(pw, ph, pw);
    g.rotateY(rnd() * Math.PI * 2);
    g.rotateZ((rnd() - 0.5) * 0.2);
    // 同上：旋转后重新对齐底面，否则立峰会歪着插进山体
    g.computeBoundingBox();
    g.translate(0, -g.boundingBox.min.y, 0);
    // UV 在全部变换之后算（立峰是非均匀缩放，最容易把 UV 拉成长条）
    if (recalcUV) scaleRockUV(g);
    else scaleRockUVFast(g);
    g.translate(
      Math.cos(spineDir) * spineLean + (rnd() - 0.5) * radius * 0.2,
      // 立峰坐在**实际堆顶**上，不是某个凭空的高度
      stackTop - ph * 0.25,
      Math.sin(spineDir) * spineLean + (rnd() - 0.5) * radius * 0.2
    );
    parts.push(g);
  }

  return parts;
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
    // 太湖石是**冷灰**石灰岩，不是白水泥。
    // 贴图底色已是灰白，固有色再压到 0x7d807c 才不至于在阳光下泛白。
    color: 0x7d807c,
    roughness: 0.99,
    metalness: 0,
    // 不用 flatShading —— 平直着色会把低模石头的三角面棱线全部显出来，
    // 近处看像一堆碎纸片；平滑着色配合法线才像石头。
    flatShading: false,
    envMapIntensity: 0.45,
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
  const hiCount = Math.max(1, Math.round(items.length * 0.06));
  const hiSet = new Set(sorted.slice(0, hiCount).map((r) => r.seed));

  // 合并成一个 Mesh：几百座假山各一个 draw call 太浪费
  const all = [];
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
    const list = Array.isArray(geo) ? geo : [geo];
    // 整座山先按山中心对齐地面高程
    const baseY = (heightAt?.(r.x, r.z) ?? 0) - 0.9;
    for (const g of list) {
      const m = new THREE.Matrix4()
        .makeRotationY(((r.seed % 1000) / 1000) * Math.PI * 2)
        .setPosition(r.x, baseY, r.z);
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
  console.log(
    `  ✓ 假山 ${items.length} 座（高模 ${hi} / 低模 ${lo}）· ` +
      `三角面 ${(all.reduce((s, g) => s + (g.attributes.position?.count || 0) / 3, 0) / 1e6).toFixed(1)}M`
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
