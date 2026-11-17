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

const smoothstep01 = (t) => t * t * (3 - 2 * t);

/** 周期为 P 的二维 value noise（必须在 u/v 上无缝，否则贴图边界有接缝） */
function vnoise(x, y, P, p) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smoothstep01(x - xi);
  const yf = smoothstep01(y - yi);
  const w = (a, b) => hash2(((a % P) + P) % P, ((b % P) + P) % P, p);
  const a = w(xi, yi);
  const b = w(xi + 1, yi);
  const cc = w(xi, yi + 1);
  const d = w(xi + 1, yi + 1);
  return (a + (b - a) * xf) * (1 - yf) + (cc + (d - cc) * yf) * yf;
}

/** fbm：三层，频率 4/8/16，幅度递减。返回值域 [0,1] */
function fbm(x, y) {
  let v = 0;
  let amp = 1;
  let norm = 0;
  for (let o = 0; o < 3; o++) {
    const P = 4 << o;
    v += vnoise((x * P) / 256, (y * P) / 256, P, o + 1) * amp;
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
      // ⚠⚠ 2026-11-17：梯度乘数 2.4 ⇒ 法线的 xy 只有 ~0.15（≈8.5° 倾角），
      //   再被着色器的 normalScale(0.24) 一乘 ⇒ **实际扰动只有 2°** ⇒
      //   水面在近景也完全看不出波纹（镜面高光是一块光滑的白斑）。
      //   ⇒ 梯度乘数提到 5.0（≈17°），normalScale 提到 0.55（净 ~9°），
      //     波纹才在近景成立、远处随距离淡出。
      const dx = (at(x + 1, y) - at(x - 1, y)) * 5.0;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 5.0;
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
 * 岸沫与倒影竖纹用的 fbm 噪声（单通道 R）。
 *
 * ⚠ 与 §4.1.20 同理：**这张贴图也要存 linear 均值**
 *   （`userData.avgLinear`）。凡是把它当"调制系数"用的地方，
 *   都要除以均值，"均值 = 1"才有语义，否则整体偏暗/偏亮。
 *   （fbm 的值域是 [0,1]，均值约 0.5。）
 */
function shoreNoiseTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  let sum = 0;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      // 采样频率取 1/256 ⇒ 一个像素一个噪声格，周期正好铺满贴图
      const n = fbm(x, y);
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
 * 地形高程 → 半浮点纹理（R16F），供水面在**片元里**求水深。
 *
 * ⚠ **UV 换算必须复刻 `terrain.js` 的 `sampleHeight()`**：
 *   `fx = (x - minX) / sizeX * (cols - 1)`，再取 `floor(fx)` 与 `floor(fx)+1`
 *   做双线性。贴图采样位置要落在**纹素中心** `(c + 0.5) / cols`，
 *   插值权重才与 `sampleHeight()` 完全一致 ⇒ 泡沫线与渲染出来的水线重合。
 *
 * ⚠ 用半浮点（R16F）而不是 R32F：WebGL2 里**浮点纹理的线性过滤**
 *   要靠 `OES_texture_float_linear` 扩展（不保证有），
 *   而**半浮点的线性过滤是 WebGL2 核心功能** ✓。
 *   高程 ~45 m 处半浮点分辨率约 0.03 m，够用。
 */
function buildHeightTexture(sceneData) {
  const t = sceneData.terrain;
  const { cols, rows, heights } = t;
  const data = new Uint16Array(cols * rows);
  for (let i = 0; i < heights.length; i++) {
    data[i] = THREE.DataUtils.toHalfFloat(heights[i]);
  }
  const tex = new THREE.DataTexture(data, cols, rows, THREE.RedFormat, THREE.HalfFloatType);
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
        float terrainH(vec2 p) {
          vec2 f = (p - uHeightRect.xy) / uHeightRect.zw * (uHeightGrid - 1.0);
          vec2 uv = (f + 0.5) / uHeightGrid;
          return texture2D(uHeight, uv).r;
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
        float hC = terrainH(vWPos.xz);
        float hX = terrainH(vWPos.xz + vec2(12.0, 0.0));
        float hZ = terrainH(vWPos.xz + vec2(0.0, 12.0));
        // 地形梯度（指向岸上），步长与 terrain.js 着色用的 12 m 一致
        vec2 wGrad = vec2(hX - hC, hZ - hC) / 12.0;
        float wSlope = length(wGrad);
        // >0 = 水在地形之上（看得见的水）；<0 = 这一片是埋在土里的
        float wDepth = vLevel - hC;
        // 到水线的**水平距离**近似：水深 ÷ 地面坡度。
        // 坡度 ≈ 0.05 m/m 时，0.03 m 的水深就是 0.6 m 的离岸距离 ✓
        float shoreDist = wDepth / max(wSlope, 0.012);

        // ---- ① 岸线泡沫 ----
        // 近景清晰、随距离淡出；带噪声起伏，不是��条均匀白线
        float foamFade = 1.0 - smoothstep(45.0, 150.0, vRipDist);
        float fn1 = texture2D(uNoise, vWPos.xz * 0.55).r;
        float fn2 = texture2D(uNoise, vWPos.xz * 2.1 + 0.41).r;
        float foamBand = smoothstep(0.72, 0.04, shoreDist);
        float foamBreak = smoothstep(0.28, 0.70, fn1 * 0.62 + fn2 * 0.38);
        float foam = foamBand * mix(0.28, 1.0, foamBreak) * foamFade;

        // ---- ② 深浅渐变 ----
        // 靠岸浅：偏绿偏亮、能看穿一点看见池底；中间深：偏蓝黑
        float shallowT = smoothstep(0.0, 1.7, wDepth);
        vec3 shallowCol = vec3(0.052, 0.118, 0.092);
        vec3 deepCol = vec3(0.005, 0.030, 0.050);
        diffuseColor.rgb = mix(shallowCol, deepCol, shallowT);
        // 浅处降不透明度 ⇒ 透出池底；深处保持 0.965 不透
        diffuseColor.a = mix(0.86, 0.965, shallowT);

        // 泡沫：亮白、不透明（盖住下面的水与池底）
        vec3 foamCol = vec3(0.70, 0.72, 0.70);
        diffuseColor.rgb = mix(diffuseColor.rgb, foamCol, foam);
        diffuseColor.a = mix(diffuseColor.a, 1.0, foam);`
      )
      .replace(
        '#include <opaque_fragment>',
        `// ============================================================
        //  ③ 岸影倒影（**近似**，不是真反射）
        // ============================================================
        // 近岸压暗 + 叠一条沿"离岸方向"拉长的暗色竖纹 ⇒ 读作"岸上有东西倒下来"
        {
          float bankFade = 1.0 - smoothstep(70.0, 200.0, vRipDist);
          float bankT = smoothstep(7.0, 0.0, shoreDist) * bankFade;
          if (bankT > 0.002) {
            // 离岸方向 = 地形下坡方向
            vec2 perp = wSlope > 0.0015 ? -wGrad / wSlope : vec2(0.0, 1.0);
            vec2 along = vec2(-perp.y, perp.x);
            float sC = dot(vWPos.xz, perp);
            float aC = dot(vWPos.xz, along);
            // 竖纹：沿岸方向变化快、离岸方向变化慢 ⇒ 一条条拉长的暗痕
            float streak = texture2D(uNoise, vec2(aC * 0.24, sC * 0.028)).r;
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
  mat.customProgramCacheKey = () => 'water-ripple-noise-v6-shore';

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
