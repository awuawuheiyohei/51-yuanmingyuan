/**
 * 水面：福海、如意洲诸池、西洋楼镜池等
 *
 * ## 2026-11-17 这一轮加了什么
 *
 * 用户原话"水太假"。原来这块水面只有**一张法线贴图 + 环境反射**，
 * 人眼高度看过去就是"一块蓝灰渐变的玻璃板"——没有岸、没有深浅、没有倒影。
 * 这一轮补三层，全部走**逐片元**的路子：
 *
 * 1. **岸线泡沫**：用地形高程算出每一点的水深，水深 → 0 的那一圈
 *    就是**真实水线**，在那儿叠一条带噪声起伏的白沫带（0.3~0.8 m 宽）。
 * 2. **深浅渐变**：同一个水深场驱动 —— 靠岸浅（偏绿偏亮、能看穿池底），
 *    深处偏蓝黑。
 * 3. **岸影倒影（近似）**：近岸压暗，并叠上**被拉长的暗色竖纹**
 *    （沿"离岸方向"拉长），读作"岸上有东西倒下来"。
 *    ⚠ **这不是真反射**，是真平面反射的替身，见文末「为什么不做真反射」。
 *
 * ## ⚠ 关键前提：`ShapeGeometry` 只有轮廓顶点
 *
 * `THREE.ShapeGeometry` 用 earcut 三角化轮廓，**三角形内部一个顶点都不生成**
 * ⇒ 全部顶点都落在岸线上 ⇒ 任何"到岸线的距离"逐顶点属性在水面上恒等于 0，
 * 根本没法用来做渐变。
 *
 * ⇒ 所以走**逐片元**：把地形高程烘成一张纹理，片元里按世界坐标采样，
 * 得到逐像素的水深。零新增三角面、零新增 draw call。
 *
 * ## ⚠ 高程必须与地形用同一套插值
 *
 * 水面的水深 = 水位 − 地形高程。地形网格（`terrain.js`）的顶点高程用的是
 * `sampleHeight()` 的**双线性**插值；这里采样同一张高程纹理、
 * 同一套 UV 换算 ⇒ 求出的水线与**渲染出来的**水线重合，
 * 泡沫带才会严丝合缝地贴在岸上。
 *
 * ## ⚠ 岸线不在 OSM 轮廓上
 *
 * OSM 的水面轮廓（`w.ring`）其实**埋在土里**——实测沿环取样，
 * 地形高程普遍比水位高 2~5 m。真正能看见的水线是地形穿过水位的那条等高线。
 * ⇒ 泡沫带必须跟着**地形等高线**走，跟着 `w.ring` 画会整条画进土里。
 *
 * ## ⚠ DEM 是 10 m 量化栅格，**直接求梯度会炸**
 *
 * 高程是量化台阶，直接做 12 m 差分 ⇒ 坡度在格边来回跳
 * ⇒ `水深 ÷ 坡度` 算出的"离岸距离"在**湖心**也会变成几米
 * ⇒ ① 岸影带会长到湖里去；② 岸影方向逐像素乱跳 ⇒ 噪声被打散成
 *   **一片规则方格网**（实测：福海近景整片水浮出 ~5 m 的方格，
 *   比改之前的"平玻璃板"还假）。
 *
 * ⇒ 高度纹理存**两个通道**：R = 原始高程（定**水线**用，必须准），
 *   G = 21 m 尺度的高斯模糊高程（定**坡度**与**深浅色**用，必须平）。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/* ------------------------------------------------------------------ *
 * 噪声（法线贴图与岸沫噪声共用）
 * ------------------------------------------------------------------ */

/** 整数哈希 → [0,1) */
function hash2(x, y, p) {
  let h = x * 374761393 + y * 668265263 + p * 2147483647;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** C2 连续（五次 fade）：Perlin 噪声的标准淡入淡出 */
const smoothQuintic = (t) => t * t * t * (t * (t * 6 - 15) + 10);

/**
 * ⚠⚠ 周期 **gradient（Perlin）噪声**，不再用 value noise。
 *
 * ## 为什么必须换
 *
 * value noise 是"把晶格点的哈希值插值起来"。任何 fade 曲线（三次/五次）
 * 在晶格边界处**导数都归零** ⇒ 高度场的梯度在格边形成尖峰
 * ⇒ 法线贴图是用**中心差分**求的 ⇒ 这些尖峰被原样放大成
 * **一条条硬边的亮/暗线**（实测：在近景水面上是"瓷砖网格"，
 * 俯视福海是整片湖上的一把扇形直线）。
 *
 * 量化（法线贴图梯度场的二阶差分，值越大 = 硬边越硬）：
 * | 噪声 | 最大二阶差分 | 格边尖峰/平均 |
 * |---|---|---|
 * | value noise（原来的 fbm） | **2.80** | **12153×** |
 * | gradient noise（Perlin） | **0.014** | 4387× |
 * ⇒ 硬边几乎消失（**200 倍**）。
 *
 * gradient noise 的晶格上放的是**随机方向向量**（不是随机数值），
 * 插值的是"梯度与位移的点积" ⇒ 导数在格边一般不为 0 ⇒ 梯度场连续 ✓
 *
 * ## 附带好处
 *
 * ① 无缝平铺更好：接缝处高程差 0.091 → **0.006**（13 倍）。
 * ② 噪声特征**不再以晶格点为中心** ⇒ 没有"网格感"。
 *
 * @param P 周期（晶格数），取模 ⇒ 贴图可无缝平铺
 */
function pnoise(x, y, P, p) {
  // 晶格点上的伪随机梯度方向
  const g = (ix, iy) => {
    const a = hash2(((ix % P) + P) % P, ((iy % P) + P) % P, p) * Math.PI * 2;
    return [Math.cos(a), Math.sin(a)];
  };
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = smoothQuintic(xf);
  const v = smoothQuintic(yf);
  const dot = (ix, iy, dx, dy) => {
    const q = g(ix, iy);
    return q[0] * dx + q[1] * dy;
  };
  const n00 = dot(xi, yi, xf, yf);
  const n10 = dot(xi + 1, yi, xf - 1, yf);
  const n01 = dot(xi, yi + 1, xf, yf - 1);
  const n11 = dot(xi + 1, yi + 1, xf - 1, yf - 1);
  const a0 = n00 + u * (n10 - n00);
  const a1 = n01 + u * (n11 - n01);
  return (a0 + v * (a1 - a0)) * 0.7071;
}

/**
 * fbm：三层，频率 4/8/16，幅度递减。
 * ⚠ 返回值域约 **[−0.26, 0.27]、均值 0**（Perlin 的性质），
 *   不是 value noise 的 [0,1]。
 *   ⇒ 当"掩膜"用（岸沫/竖纹）时必须**自己映射到 [0,1]**，
 *     否则掩膜会变成一片 0.5 的平值 ⇒ 噪声起伏全没了。
 */
function fbm(x, y) {
  let v = 0;
  let amp = 1;
  let norm = 0;
  for (let o = 0; o < 3; o++) {
    const P = 4 << o;
    v += pnoise((x * P) / 256, (y * P) / 256, P, o + 1) * amp;
    norm += amp;
    amp *= 0.55;
  }
  return v / norm;
}

/* ------------------------------------------------------------------ *
 * 程序化水波法线贴图
 * ------------------------------------------------------------------ */

/**
 * 程序化水波法线贴图。
 *
 * ⚠ 2026-11-12 改用**不规则的多尺度噪声**（fbm），不再用正弦叠加：
 * 正弦叠加的主频（u*2 + v*0.9）波长 = 贴图周期的 1/2，
 * 于是整片湖浮出一层**规则的方格** —— 远看像"泳池瓷砖"，不是湖。
 * 噪声没有周期性 ⇒ 拍频也不成规则。
 *
 * 做法：三层 value-noise（格子哈希 + 双线性 + 平滑）叠成高度场，
 * 再用**中心差分**求梯度 ⇒ 法线。
 *
 * ⚠⚠ 2026-11-17：噪声插值必须用 **C2 连续的五次 smoothstep**，
 *   不能用三次。三次（= 双线性）插值在**每个噪声格内部**留下可见的折痕
 *   （value noise 的经典毛病），法线图把这些折痕放大成
 *   **一格一格的硬边小方块**（约 0.22 m 一格，3.5 m 贴图 ÷ 16 格）。
 *   ⇒ 在浅色水面上尤其刺眼：整片近景浮出一层"瓷砖网格"。
 *   五次插值把二阶导也接上 ⇒ 折痕消失 ✓
 *   （实测：倾角分布不变 —— 均值净扰动 3.78° vs 4.00°，最大 28°），
 *   所以 2026-11-17 调好的梯度乘数 5.0 与 normalScale 0.55 **不用改**。
 */
function rippleNormalTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);

  // 先算高度场，再中心差分求梯度
  const H = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) H[y * S + x] = fbm(x, y);
  }
  const at = (x, y) => H[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // ⚠⚠ 2026-11-17（原注释）：梯度乘数 2.4 ⇒ 法线的 xy 只有 ~0.15（≈8.5° 倾角），
      //   再被着色器的 normalScale(0.24) 一乘 ⇒ **实际扰动只有 2°** ⇒
      //   水面在近景也完全看不出波纹（镜面高光是一块光滑的白斑）。
      //
      // ⚠⚠ 2026-11-17（本轮）：噪声换成 gradient(Perlin) 后重调。
      //   原来的 value noise 有"格边硬边"（见 pnoise 的注释），
      //   那批硬边贡献了绝大部分**尖峰**（最大净扰动 28°），
      //   去掉硬边后波纹整体变弱 ⇒ 乘数必须**加大**。
      //   实测（normalScale = 0.55 时）：
      //     乘数 5  → 净扰动均值 2.8° / rms 3.1° / 最大 7.8°（太弱，不合格）
      //     乘数 11 → 净扰动均值 6.0° / rms 6.6° / 最大 15.1° ✓
      //   AGENTS.md 要求净扰动 **> 5°**（< 5° 等于没有波纹）⇒ 取 11。
      const dx = (at(x + 1, y) - at(x - 1, y)) * 11.0;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 11.0;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * S + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/* ------------------------------------------------------------------ *
 * 岸沫 / 倒影竖纹噪声
 * ------------------------------------------------------------------ */

/**
 * 岸沫与倒影竖纹用的 fbm 噪声（单通道 R，**已归一化到 [0,1]**）。
 *
 * ⚠ Perlin 的 fbm 值域是 **[−0.26, 0.27]、均值 0**，不是 [0,1]。
 *   这里按实测 min/max 线性映射到 [0,1] ⇒ 掩膜才有真正的起伏 ✓
 *   （不映射的话掩膜是一平 0.5 ⇒ 泡沫的"带噪声起伏"就没了）。
 *
 * ⚠ 与 §4.1.20 同理：**这张贴图也要存 linear 均值**
 *   （`userData.avgLinear`）。凡是把它当"调制系数"用的地方，
 *   都要除以均值，"均值 = 1"才有语义，否则整体偏暗/偏亮。
 */
function shoreNoiseTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);

  // 先算原始值，取 min/max 归一化
  const raw = new Float32Array(S * S);
  let lo = Infinity;
  let hi = -Infinity;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const v = fbm(x, y);
      raw[y * S + x] = v;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  const span = hi - lo || 1;

  let sum = 0;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const n = (raw[y * S + x] - lo) / span;
      sum += n;
      const i = (y * S + x) * 4;
      const v = Math.round(n * 255);
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  // canvas 是 sRGB ⇒ 采样后是 linear；均值要在 linear 空间统计
  // （fbm 本身线性 ⇒ 直接用算术均值即可）
  tex.userData.avgLinear = sum / (S * S);
  return tex;
}

/* ------------------------------------------------------------------ *
 * 地形高程纹理
 * ------------------------------------------------------------------ */

/**
 * 地形高程 → 半浮点纹理（RG16F），供水面在**片元里**求水深。
 *
 * - **R = 原始高程**：定**水线**用（泡沫带要贴着真实岸线，必须准）。
 * - **G = 模糊高程**（21 m 尺度 ≈ 高斯）：定**坡度**与**深浅色**用。
 *
 * ⚠⚠ **为什么要两个通道**
 *
 * DEM 是 **10 m 量化栅格**，直接做 12 m 差分求坡度 ⇒ 坡度在格边来回跳
 * ⇒ `水深 ÷ 坡度` 算出的"离岸距离"在**湖心**也会变成几米
 * ⇒ ① 岸影带会长到湖里去；② 岸影方向逐像素乱跳 ⇒ 噪声图案被打散成
 *   **一片规则方格网**（实测：福海近景整片水浮出 ~5 m 的方格，
 *   比改之前的"平玻璃板"还假）。
 * ⇒ 坡度一律从**模糊高程**上取，颜色也用模糊水深（颜色必须平）。
 *
 * ⚠ **UV 换算必须复刻 `terrain.js` 的 `sampleHeight()`**：
 *   `fx = (x - minX) / sizeX * (cols - 1)`，再取 `floor(fx)` 与 `floor(fx)+1`
 *   做双线性。贴图采样位置要落在**纹素中心** `(c + 0.5) / cols`，
 *   插值权重才与 `sampleHeight()` 完全一致 ⇒ 泡沫线与渲染出来的水线重合。
 *
 * ⚠ 用半浮点（RG16F）而不是 RG32F：WebGL2 里**浮点纹理的线性过滤**
 *   要靠 `OES_texture_float_linear` 扩展（不保证有），
 *   而**半浮点的线性过滤是 WebGL2 核心功能** ✓。
 *   高程 ~45 m 处半浮点分辨率约 0.03 m，够用。
 */
function buildHeightTexture(sceneData) {
  const t = sceneData.terrain;
  const { cols, rows, heights } = t;

  // --- 模糊高程：两次 5 格盒式模糊 ≈ 高斯（σ ≈ 2 格 ≈ 20 m） ---
  const blur = (src) => {
    const tmp = new Float32Array(cols * rows);
    const out = new Float32Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let s = 0;
        let n = 0;
        for (let d = -2; d <= 2; d++) {
          const cc = c + d;
          if (cc < 0 || cc >= cols) continue;
          s += src[r * cols + cc];
          n++;
        }
        tmp[r * cols + c] = s / n;
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let s = 0;
        let n = 0;
        for (let d = -2; d <= 2; d++) {
          const rr = r + d;
          if (rr < 0 || rr >= rows) continue;
          s += tmp[rr * cols + c];
          n++;
        }
        out[r * cols + c] = s / n;
      }
    }
    return out;
  };
  const soft = blur(blur(heights));

  const data = new Uint16Array(cols * rows * 2);
  for (let i = 0; i < cols * rows; i++) {
    data[i * 2] = THREE.DataUtils.toHalfFloat(heights[i]);
    data[i * 2 + 1] = THREE.DataUtils.toHalfFloat(soft[i]);
  }
  const tex = new THREE.DataTexture(data, cols, rows, THREE.RGFormat, THREE.HalfFloatType);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

/* ------------------------------------------------------------------ *
 * 主构建
 * ------------------------------------------------------------------ */

export function buildWater(sceneData) {
  const group = new THREE.Group();
  group.name = 'water';

  const normalMap = rippleNormalTexture();
  // 水面几何的 UV 是米制坐标，一张波纹贴图覆盖约 3.5m
  // （之前 9m 一张，主频波长 4.5m，远看像瓦楞板）
  normalMap.repeat.set(1 / 3.5, 1 / 3.5);

  const noiseTex = shoreNoiseTexture();
  const heightTex = buildHeightTexture(sceneData);
  const terrain = sceneData.terrain;

  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x0f3b45,
    // ⚠⚠ 2026-11-17：**大片高光爆白**（西北半个湖糊成白纸）。
    //   根因是 **clearcoat**：清漆层是一个**独立的高光瓣**，
    //   `clearcoatRoughness = 0.16` 时它的 GGX 峰值比漫反射高两个数量级
    //   ⇒ 太阳的镜面反射被削平成一片**纯白**（不是"晃眼"，是"过曝成纸"）。
    //   ⇒ 清漆减到 0.05、粗糙度放到 0.5（峰更矮更宽），
    //     主粗糙度也提到 0.52（高光摊开，不再是一块硬边白斑）。
    //   保留 clearcoat 只是为了"水面上那一点釉光"，不是为了当镜子。
    roughness: 0.52,
    metalness: 0.0,
    transparent: true,
    opacity: 0.965,
    normalMap,
    // ⚠ 波纹必须看得见：0.07 时水面就是一块平涂色板；
    //   而"贴图本身只有 2° + normalScale 0.24 = 净 2°" 等于没有波纹。
    //   现在的组合（贴图 ~17° × 0.55 ≈ 净 9°）才能在近景读出波纹。
    normalScale: new THREE.Vector2(0.55, 0.55),
    side: THREE.DoubleSide,
    envMapIntensity: 0.34,
    clearcoat: 0.05,
    clearcoatRoughness: 0.5,
    // 多片水面交界处共面，用 polygonOffset 避免 z-fighting
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  /**
   * **远处把波纹淡出**（与地面同一类问题的同一解法）。
   *
   * ## 为什么
   *
   * 水面的法线图一张覆盖 3.5 m，纹理本身还有 2.7 cm 级的细纹。
   * 俯视全园时湖面被缩小几十倍 ⇒ 采样落进 mip 高层，
   * 细纹的纹素网格与**屏幕像素网格**频率接近 ⇒ 拍频，
   * 于是一片湖会浮出一层**规则的白色点阵**（2026-11-10 福海恢复水面后才暴露）。
   * 地面的同类问题见 `terrain.js` 的距离淡出。
   *
   * ## 怎么解
   *
   * 远处本来就看不清 3.5 cm 的波纹 ⇒ 把**法线扰动**按距离淡出，
   * 让远处水面回到一块平整的镜子（只剩环境反射），
   * 近景（< 40 m）波纹一点不少；更远处淡成环境的镜面反射（避免法线图在远处拍频）。
   */
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uHeight = { value: heightTex };
    // (minX, minZ, sizeX, sizeZ)
    shader.uniforms.uHeightRect = {
      value: new THREE.Vector4(terrain.minX, terrain.minZ, terrain.sizeX, terrain.sizeZ),
    };
    shader.uniforms.uHeightGrid = { value: new THREE.Vector2(terrain.cols, terrain.rows) };
    shader.uniforms.uNoise = { value: noiseTex };
    // ⚠ 噪声贴图的 linear 均值（§4.1.20）：当调制系数用时必须除以它
    shader.uniforms.uNoiseAvg = { value: noiseTex.userData.avgLinear || 0.5 };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aLevel;
        varying float vRipDist;
        varying vec3 vWPos;
        varying float vLevel;`
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vRipDist = -mvPosition.z;
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vLevel = aLevel;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uHeight;
        uniform vec4 uHeightRect;
        uniform vec2 uHeightGrid;
        uniform sampler2D uNoise;
        uniform float uNoiseAvg;
        varying float vRipDist;
        varying vec3 vWPos;
        varying float vLevel;

        // 地形高程（与 terrain.js 的 sampleHeight 同一套双线性插值）
        // .r = 原始高程（定水线），.g = 模糊高程（定坡度与深浅色）
        vec2 terrainHG(vec2 p) {
          vec2 f = (p - uHeightRect.xy) / uHeightRect.zw * (uHeightGrid - 1.0);
          vec2 uv = (f + 0.5) / uHeightGrid;
          return texture2D(uHeight, uv).rg;
        }`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#ifdef USE_NORMALMAP_OBJECTSPACE
          normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
          #ifdef FLIP_SIDED
            normal = - normal;
          #endif
          #ifdef DOUBLE_SIDED
            normal = normal * faceDirection;
          #endif
          normal = normalize( normalMatrix * normal );
        #elif defined( USE_NORMALMAP_TANGENTSPACE )
          vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
          // 远处把波纹淡出，避免法线图在远处拍频成规则点阵
          float ripFade = 1.0 - smoothstep( 40.0, 190.0, vRipDist );
          // ⚠ **保留 25% 的底**，不要淡到 0：
          //   淡到 0 ⇒ 远处水面是一面**完美镜子** ⇒ 只剩一块天空的平面渐变，
          //   读作"一块蓝灰玻璃"而不是水。
          //   留一点起伏 ⇒ 远处水面仍有细微的明暗碎光 ✓
          mapN.xy *= normalScale * mix(0.25, 1.0, ripFade);
          normal = normalize( tbn * mapN );
        #endif`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>

        // ============================================================
        //  岸线场：水深 = 水位 − 地形高程
        // ============================================================
        vec2 hg = terrainHG(vWPos.xz);
        float hRaw = hg.r;      // 原始高程 → 定水线
        float hSoft = hg.g;     // 模糊高程 → 定坡度与深浅色
        // ⚠ 坡度必须取自**模糊高程**且步长 ≥ 20 m：
        //   DEM 是 10 m 量化台阶，直接差分得到的坡度在格边来回跳
        //   ⇒ "离岸距离"在湖心也会变小 ⇒ 岸影带长到湖里，
        //     还会在水面撒出一片规则方格网（实测过）。
        float gx = terrainHG(vWPos.xz + vec2(24.0, 0.0)).g - hSoft;
        float gz = terrainHG(vWPos.xz + vec2(0.0, 24.0)).g - hSoft;
        vec2 wGrad = vec2(gx, gz) / 24.0;
        float wSlope = length(wGrad);
        // 原始水深：>0 = 水在地形之上（看得见的水）
        float wDepthRaw = vLevel - hRaw;
        // 平滑水深：定深浅色用（颜色必须平，不能一块一块）
        float wDepth = vLevel - hSoft;
        // 到水线的**水平距离**近似：水深 ÷ 地面坡度。
        // 坡度 ≈ 0.2 m/m 时，0.15 m 的水深就是 0.75 m 的离岸距离 ✓
        float shoreDist = wDepthRaw / max(wSlope, 0.03);

        // ---- ① 岸线泡沫 ----
        // 近景清晰、随距离淡出；带噪声起伏，不是一条均匀白线
        float foamFade = 1.0 - smoothstep(45.0, 150.0, vRipDist);
        float fn1 = texture2D(uNoise, vWPos.xz * 0.55).r;
        float fn2 = texture2D(uNoise, vWPos.xz * 2.1 + 0.41).r;
        float foamBand = smoothstep(0.75, 0.05, shoreDist);
        float foamBreak = smoothstep(0.26, 0.68, fn1 * 0.62 + fn2 * 0.38);
        float foam = foamBand * mix(0.25, 1.0, foamBreak) * foamFade;

        // ---- ② 深浅渐变 ----
        // 靠岸浅：偏绿偏亮、能看穿一点看见池底；中间深：偏蓝黑
        float shallowT = smoothstep(0.0, 2.2, wDepth);
        // ⚠ 2026-11-17 浅水色压深一档（0.118 → 0.055）：
        //   本场景总照度约 3.4 倍（AGENTS §4.1.2），
        //   linear 0.118 的"浅绿"会被打到 sRGB≈0.66 ⇒ 浅水带读作**一片奶白雾**，
        //   俯视整湖像蒙了层霜。压深后落在 sRGB≈0.5，是**青绿浅水**而不是牛奶。
        vec3 shallowCol = vec3(0.019, 0.055, 0.050);
        vec3 deepCol = vec3(0.004, 0.032, 0.052);
        diffuseColor.rgb = mix(shallowCol, deepCol, shallowT);
        // 浅处略降不透明度 ⇒ 透出池底；深处保持不透
        diffuseColor.a = mix(0.94, 0.97, shallowT);
        // 泡沫：不透明（盖住下面的水与池底），但别过曝成纯白
        vec3 foamCol = vec3(0.50, 0.53, 0.52);
        float foamUse = foam;
        diffuseColor.rgb = mix(diffuseColor.rgb, foamCol, foamUse);
        diffuseColor.a = mix(diffuseColor.a, 1.0, foamUse);`
      )
      .replace(
        '#include <opaque_fragment>',
        `// ============================================================
        //  ③ 岸影倒影（**近似**，不是真反射）
        // ============================================================
        // 近岸压暗 + 叠一条沿"离岸方向"拉长的暗色竖纹 ⇒ 读作"岸上有东西倒下来"
        {
          float bankFade = 1.0 - smoothstep(70.0, 200.0, vRipDist);
          float bankT = smoothstep(5.0, 0.0, shoreDist) * bankFade;
          if (bankT > 0.002) {
            // 离岸方向 = 模糊高程的下坡方向（稳，不会逐像素乱跳）
            vec2 perp = wSlope > 0.004 ? -wGrad / wSlope : vec2(0.0, 1.0);
            vec2 along = vec2(-perp.y, perp.x);
            float sC = dot(vWPos.xz, perp);
            float aC = dot(vWPos.xz, along);
            // 竖纹：沿岸方向变化快、离岸方向变化慢 ⇒ 一条条拉长的暗痕
            float streak = texture2D(uNoise, vec2(aC * 0.16, sC * 0.02)).r;
            // 掠射角反射才强（菲涅耳），正视时主要是看水底
            float fres = pow(1.0 - saturate(dot(normalize(vViewPosition), normal)), 5.0);
            vec3 bankCol = vec3(0.020, 0.031, 0.022);
            float bankMix = bankT * mix(0.30, 1.0, smoothstep(0.25, 0.85, streak));
            outgoingLight = mix(
              outgoingLight,
              bankCol * (0.55 + 1.6 * streak),
              bankMix * (0.30 + 0.70 * fres)
            );
          }
        }
        #include <opaque_fragment>`
      );
  };
  mat.customProgramCacheKey = () => 'water-ripple-noise-v7-shore';

  // 所有水面合并成一个 Mesh：各自的水位烘进顶点位置
  const parts = [];
  const shoreParts = [];
  for (const w of sceneData.water || []) {
    const ring = w.ring;
    if (!ring || ring.length < 3) continue;
    const level = w.level ?? 0;

    const shape = new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, z)));
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(Math.PI / 2);
    geo.translate(0, level, 0);

    // ⚠ 逐顶点水位：合并后一片水面对应多片水体，
    //   片元里靠它算"水深 = 水位 − 地形高程"。
    //   （同一片水体内所有顶点取值相同 ⇒ 插值后仍是常数 ✓）
    const n = geo.attributes.position.count;
    const lv = new Float32Array(n);
    lv.fill(level);
    geo.setAttribute('aLevel', new THREE.BufferAttribute(lv, 1));

    /**
     * ⚠⚠ 逐顶点切线：水面是**水平面**，UV 就是世界 XZ（米），
     *   所以切线系在整个水面上是**同一个**：(+X 为切线，+Z 为副切线)。
     *
     * ## 为什么必须显式给
     *
     * 不给切线属性时，three.js 用 `getTangentFrame()` **按屏幕空间导数**
     * 现算切线系。导数是按 2×2 像素块算的 ⇒ **跨过三角形边界的那个像素块
     * 会把两个三角形的导数混在一起** ⇒ 切线系在**每一条三角形边上**都错
     * ⇒ 法线图被放大成**沿水面网格每条 earcut 三角形边的一条亮线**
     *   （实测：俯视福海，整片湖浮出一把扇形的直线；人眼高度近景是
     *   一层"瓷砖网格"——比改之前的平玻璃板还假）。
     *
     * ⇒ 显式给切线 ⇒ three.js 走 `USE_TANGENT` 分支，切线系来自属性，
     *   **每条三角形边上完全一致** ⇒ 边线消失 ✓
     *
     * ⚠ w = −1：three.js 的副切线 = `cross(N, T) * w`，
     *   而 `cross((0,1,0),(1,0,0)) = (0,0,−1)` ⇒ w = −1 才让副切线指向 +Z
     *   （UV 的 v 方向）✓
     */
    const tan = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      tan[i * 4] = 1;
      tan[i * 4 + 3] = -1;
    }
    geo.setAttribute('tangent', new THREE.BufferAttribute(tan, 4));

    parts.push(geo);

    // 池岸：沿轮廓的一圈浅色带，模拟驳岸
    const pts = ring.map(([x, z]) => new THREE.Vector3(x, level + 0.06, z));
    shoreParts.push(new THREE.BufferGeometry().setFromPoints(pts));
  }

  if (parts.length) {
    const merged = mergeGeometries(parts, false);
    const mesh = new THREE.Mesh(merged, mat);
    mesh.renderOrder = 1;
    group.add(mesh);
    for (const g of parts) g.dispose();
  }
  if (shoreParts.length) {
    const merged = mergeGeometries(shoreParts, false);
    const line = new THREE.LineSegments(
      merged,
      new THREE.LineBasicMaterial({
        color: 0xb9ad8d,
        transparent: true,
        opacity: 0.45,
      })
    );
    group.add(line);
    for (const g of shoreParts) g.dispose();
  }
  return group;
}

/** 让水面波纹缓慢流动 */
export function animateWater(group, t) {
  const mat = group.children.find((c) => c.isMesh)?.material;
  if (mat?.normalMap) {
    mat.normalMap.offset.x = t * 0.012;
    mat.normalMap.offset.y = t * 0.008;
  }
}
