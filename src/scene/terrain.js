/**
 * 地形：把高程网格变成可渲染网格，并按高程/坡度做顶点着色
 */
import * as THREE from 'three';
import { makeGroundTexture, makeGroundDetailTexture } from './ground.js';
import { getTextureOverrides } from './buildings/textures.js';

export function buildTerrain(sceneData, opts = {}) {
  const t = sceneData.terrain;
  const { cols, rows, minX, minZ, sizeX, sizeZ, heights } = t;

  // 向外扩一圈，避免地形在视野边缘断成一 floating 的方板
  const MARGIN = 420;
  const spanX = sizeX + MARGIN * 2;
  const spanZ = sizeZ + MARGIN * 2;

  /**
   * 园界多边形 → 点在园内还是园外。
   * 园内是**园圃草地**（灰绿），园外是**农田**（偏黄的褐绿）。
   * 两者分开，俯视时园子才有明确的边界感，而不是一张贴图糊到天边。
   */
  const parkRing = sceneData.park || [];
  const inPark = (x, z) => {
    if (parkRing.length < 3) return true;
    let inside = false;
    for (let i = 0, j = parkRing.length - 1; i < parkRing.length; j = i++) {
      const xi = parkRing[i][0];
      const zi = parkRing[i][1];
      const xj = parkRing[j][0];
      const zj = parkRing[j][1];
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  };

  const geo = new THREE.PlaneGeometry(
    spanX,
    spanZ,
    cols - 1,
    rows - 1
  );
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  /**
   * 地表顶点色 —— 是**贴图的调制系数**，不是颜色本身。
   *
   * ⚠ **踩过的坑（整个地面死黑）**：
   * 原来这里直接写 `new THREE.Color('#4e5c37')` 之类。
   * three.js 的 Color 构造按 **sRGB 解释并转到 linear 工作空间**，
   * `#4e5c37` 的线性值是 (0.075, 0.106, 0.039) —— 接近黑。
   * 顶点色又与**已经是 sRGB 的贴图**相乘，等于双重变暗，
   * 整块草地渲染出来是纯黑（探针实测 vc=rgb(0.07,0.08,0.04)）。
   *
   * 正确做法：顶点色取**接近 1 的浅色调制系数**，
   * 真实的色彩与明暗全部交给贴图去表现，
   * 顶点色只负责大尺度的色偏与打散重复感。
   */
  const cGrass = new THREE.Color(1.0, 1.0, 1.0);
  const cEarth = new THREE.Color(1.06, 0.99, 0.86); // 偏暖土黄
  const cRock = new THREE.Color(1.02, 1.03, 1.06); // 偏冷灰
  const cSand = new THREE.Color(1.08, 1.03, 0.9); // 浅暖
  // 园外农田：偏黄的褐绿，与园内草地明确区分
  const cField = new THREE.Color(1.14, 1.08, 0.82);
  const tmp = new THREE.Color();

  const heightAt = (x, z) =>
    sampleHeight(heights, cols, rows, minX, minZ, sizeX, sizeZ, x, z);

  /**
   * **平滑高程场** —— 只用于**着色**（坡度 / 高程色 / 法线），不用于顶点高度。
   *
   * ## 为什么必须有
   *
   * DEM 是 **10m 分辨率**采样的，高度是**量化台阶**。
   * 直接拿它算坡度（`h(x+6) − h(x−6)`）时，步长 6m < 网格 10m
   * ⇒ 差分每次都跨格取样 ⇒ 坡度变成**锯齿状阶跃**。
   * 锯齿坡度 → 顶点色锯齿 → 顶点之间线性插值 ⇒ 整个地面被切成
   * **可见的三角面片** ⇒ 俯视满屏规则斜向灯芯绒
   * （`?view=top` 一眼可见；AGENTS.md §4.1.2 记过这条坑）。
   *
   * ## 为什么不改顶点高度
   *
   * 顶点高度保持**原始 DEM**（不篡改真实地形），
   * 只把着色用的场平滑掉。代价：地面轮廓仍有 10m 台阶，
   * 但 10m 尺度上肉眼不可见，而着色面片是全园可见的。
   */
  const smoothHeights = (() => {
    const out = new Float32Array(heights.length);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let s = 0;
        let w = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const rr = r + dr;
            const cc = c + dc;
            if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) continue;
            const ww = (dr === 0 ? 2 : 1) * (dc === 0 ? 2 : 1);
            s += heights[rr * cols + cc] * ww;
            w += ww;
          }
        }
        out[r * cols + c] = s / w;
      }
    }
    return out;
  })();
  const heightSmooth = (x, z) =>
    sampleHeight(smoothHeights, cols, rows, minX, minZ, sizeX, sizeZ, x, z);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + (minX + sizeX / 2);
    const z = pos.getZ(i) + (minZ + sizeZ / 2);
    pos.setX(i, x);
    pos.setZ(i, z);
    const h = heightAt(x, z);
    pos.setY(i, h);

    // 坡度（用**平滑高程**，否则 DEM 量化台阶会被放大成三角面片）
    const d = 12;
    const hx = heightSmooth(x + d, z) - heightSmooth(x - d, z);
    const hz = heightSmooth(x, z + d) - heightSmooth(x, z - d);
    const slope = Math.min(1, Math.hypot(hx, hz) / (2 * d) / 0.55);

    const alt = THREE.MathUtils.clamp((heightSmooth(x, z) - 44) / 22, 0, 1);
    tmp.copy(cGrass).lerp(cEarth, alt * 0.55);
    tmp.lerp(cRock, slope * 0.85);
    // 沙色只出现在**园内低洼**。
    // 原来权重是 `max(0, 0.35-alt)*0.4` —— 园外是平阔的农田，
    // 高程普遍低于 44m，alt=0 → 沙色权重 0.14 全开，
    // 俯视时整片园外是明黄色，与园内的灰绿割裂成两个世界。
    // 改成只在真正的低洼（alt<0.1）才有一点点。
    tmp.lerp(cSand, Math.max(0, 0.1 - alt) * 0.35);

    // 园外 → 农田色（偏黄褐），园内 → 保持草地
    //
    // ⚠ 顶点密度限制：DEM 是 10m 网格，园界附近一个顶点都没有，
    //   所以园内/园外的颜色分界是**粗粒度**的（几十米级别）。
    // 想要更锐利的分界，得单独做园外的农田 Mesh。
    // 这里先保证「不至于全园一片黄」——园外农田色权重压到 0.45，
    // 保留与园内的可区分度，又不至于割裂成两个世界。
    if (!inPark(x, z)) {
      tmp.lerp(cField, 0.45);
    }

    // 低频 + 中频大尺度色变：打散贴图的重复感。
    // 一张平铺的草地贴图最大的破绽就是"每 14m 出现同样的花纹"，
    // 只靠贴图解决不了——必须让**顶点色**在不同尺度上错开，
    // 肉眼看过去就没有明显的接缝周期了。
    //
    // ⚠ 但**不能用低频项**：波长 1/0.0055 ≈ 180m，
    // 落在地上就是**一百米级的云状色斑**（近景看是地毯上一块块深浅），
    // 比不处理还难看。这里只用中频（波长 30~80m）且幅度极小，
    // 作用仅仅是"让平铺接缝不明显"，不是"画出地形色带"。
    const low = Math.sin(x * 0.0125 + 1.3) * 0.5 + Math.cos(z * 0.0138 - 0.7) * 0.5;
    const mid =
      Math.sin(x * 0.031 - 0.4) * 0.5 +
      Math.cos(z * 0.026 + 1.1) * 0.4 +
      Math.sin((x - z) * 0.019 + 2.3) * 0.35;
    // 大尺度色偏：调制系数上做**小幅**偏移。
    //
    // ⚠ 幅度不能大：在接近 1 的系数上 offsetHSL 的明度杠杆很长，
    //   0.10 的明度偏移 = 10% 的明暗差，叠加贴图后就是
    //   **几十米尺度的色斑**（近景看是一块块深浅不匀的大地毯）。
    //   压到 0.045 以下，只留"打散贴图重复"的最小作用。
    tmp.offsetHSL(low * 0.006 + mid * 0.003, low * 0.025 + mid * 0.013, low * 0.03 + mid * 0.016);

    // 高频抖动：打散 8bit 量化造成的等高线色带。
    //
    // ⚠⚠ **绝不能在这里做逐顶点白噪声**。
    //   DEM 是 10m 网格 ⇒ 每个顶点一个独立随机值 ⇒ 顶点之间线性插值
    //   ⇒ 整个地面被切成**可见的三角面片** ⇒ 俯视满屏规则斜向灯芯绒
    //   （`?view=top` 一眼可见；AGENTS.md §4.1.2 记过这条坑，
    //   但当时只治了"sin 大数伪随机变成条纹"，没治"白噪声变面片"）。
    //
    //   正确做法：抖动放到**逐像素**（材质 dithering），与网格无关。
    //   这里只保留一个**极小**的逐顶点扰动（0.6%），作用是让顶点色
    //   不落在同一个量化档位上，肉眼看不出面片。
    const hsh = (Math.imul(Math.round(x * 4), 374761393) +
      Math.imul(Math.round(z * 4), 668265263)) | 0;
    const j = Math.imul(hsh ^ (hsh >>> 13), 1274126177);
    const n = (((j ^ (j >>> 16)) >>> 0) / 4294967296 - 0.5) * 0.012;
    tmp.offsetHSL(0, n * 0.5, n);

    // **钳制下限**：调制系数不能掉到很暗，否则局部出现黑斑
    tmp.r = Math.max(0.55, tmp.r);
    tmp.g = Math.max(0.55, tmp.g);
    tmp.b = Math.max(0.55, tmp.b);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  // UV 按世界尺度铺开。
  //
  // 这里**不用** AI 生成的草地照片贴图：那张图自带大面积的方向性笔触
  // （SD 把它画成了"修剪过的草坪"），平铺到全园就是一片规则斜纹——
  // 放大到 38m 一张虽然斜纹没了，近景却糊成一片绿。
  // 程序化贴图是随机色斑 + 随机草叶，没有方向性，平铺看不出来。
  //
  // 周期 12m：512px 贴图 → 1px ≈ 2.3cm，
  // 草叶笔触 1.2~3.8px ≈ 3~9cm，正好是真实草高。
  const tile = 12;
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * (spanX / tile), uv.getY(i) * (spanZ / tile));
  }
  uv.needsUpdate = true;
  // 法线用**中心差分**重算，不用 computeVertexNormals。
  //
  // ⚠ 差分必须用**平滑高程**且步长 ≥ DEM 格距：
  //   DEM 是 10m 分辨率采样的，直接差分（步长 6m）每次都跨格取样，
  //   坡度变成锯齿阶跃 ⇒ 三角形化后每个 DEM 格子的台阶变成一片
  //   规则的斜向刻面（俯视时满屏灯芯绒）。
  {
    const nrm = geo.getAttribute('normal');
    const d = 12;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const hx = heightSmooth(x + d, z) - heightSmooth(x - d, z);
      const hz = heightSmooth(x, z + d) - heightSmooth(x, z - d);
      const len = Math.hypot(hx, 2 * d, hz) || 1;
      nrm.setXYZ(i, -hx / len, (2 * d) / len, -hz / len);
    }
    nrm.needsUpdate = true;
  }

  // 近景细节层（1.4m / 3.7m 两个互质周期）
  const detailTex = makeGroundDetailTexture();

  const mat = new THREE.MeshStandardMaterial({
    map: makeGroundTexture(),
    vertexColors: true,
    roughness: 0.98,
    metalness: 0,
    // 逐像素抖动（three 内置）：打散 8bit 色带。
    // ⚠ 必须在**片元**里做 —— 逐顶点做会随 DEM 网格切出三角面片。
    dithering: true,
  });
  /**
   * **远处把贴图淡出到它的平均色**。
   *
   * ## 为什么
   *
   * 俯视全园时地面被缩小 ~50 倍 ⇒ 采样落在 mip 5~6（每张贴图只剩 16~8 px），
   * 而**贴图周期（12m）在屏幕上只有 ~9 px** ——
   * mip 层的纹素网格与屏幕像素网格**频率几乎相同** ⇒ 拍频（moiré）
   * ⇒ 满屏**规则斜向灯芯绒**（AGENTS.md §4.1.2 记过这条坑，一直没定位到）。
   *
   * 去掉贴图（`map: null`）斜纹立刻消失，证实是**采样拍频**，
   * 不是几何/顶点色/光照的问题。
   *
   * ## 怎么解
   *
   * 远处本来也看不清 2.3cm 的草叶 ⇒ 把贴图**淡出成它的平均色**，
   * 只保留**顶点色**那层平滑的大尺度变化。
   * 近景（< 25m）贴图全保留，细节一点不少。
   *
   * ⚠ 淡出目标是"平均色"而不是"白色"—— 否则远处地面会整体变亮好几倍。
   */
  const MAP_AVG = new THREE.Color('#6b764c'); // 贴图底色（linear 工作空间）
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uMapAvg = { value: new THREE.Vector3(MAP_AVG.r, MAP_AVG.g, MAP_AVG.b) };
    shader.uniforms.uDetailMap = { value: detailTex };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vTriDist;\nvarying vec3 vGroundPos;')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvTriDist = -mvPosition.z;\nvGroundPos = (modelMatrix * vec4(transformed,1.0)).xyz;'
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform vec3 uMapAvg;\nuniform sampler2D uDetailMap;\nvarying float vTriDist;\nvarying vec3 vGroundPos;'
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
  #ifdef USE_MAP
    // ---- 近景细节层 ----
    // 主贴图 12 m 一张，近景必然糊。叠一层高频细节，
    // 24 m 之外淡出（远景本来也看不见细节）。
    // 两个**互质**周期叠用 ⇒ 平铺网格规律被打散。
    float dFade = 1.0 - smoothstep(4.0, 24.0, vTriDist);
    if (dFade > 0.002) {
      vec3 d1 = texture2D(uDetailMap, vGroundPos.xz * 0.72).rgb;
      vec3 d2 = texture2D(uDetailMap, vGroundPos.xz * 0.27 + 0.37).rgb;
      vec3 det = (d1 * 0.62 + d2 * 0.38) * 2.0;
      diffuseColor.rgb *= mix(vec3(1.0), det, dFade * 0.42);
    }
  #endif`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
  #ifdef USE_COLOR
    float triFade = smoothstep(25.0, 110.0, vTriDist);
    diffuseColor.rgb = mix(diffuseColor.rgb, vColor * uMapAvg, triFade);
  #endif`
      );
  };
  mat.customProgramCacheKey = () => 'terrain-fade-v2-detail';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  mesh.userData.heightAt = (x, z) => heightAt(x, z);
  return mesh;
}

export function sampleHeight(heights, cols, rows, minX, minZ, sizeX, sizeZ, x, z) {
  const fx = ((x - minX) / sizeX) * (cols - 1);
  const fz = ((z - minZ) / sizeZ) * (rows - 1);
  const c = Math.floor(fx);
  const r = Math.floor(fz);
  if (c < 0 || r < 0 || c >= cols - 1 || r >= rows - 1) return 0;
  const tx = fx - c;
  const tz = fz - r;
  const h00 = heights[r * cols + c];
  const h10 = heights[r * cols + c + 1];
  const h01 = heights[(r + 1) * cols + c];
  const h11 = heights[(r + 1) * cols + c + 1];
  return (
    h00 * (1 - tx) * (1 - tz) +
    h10 * tx * (1 - tz) +
    h01 * (1 - tx) * tz +
    h11 * tx * tz
  );
}

/** 供其它模块使用的地形高度查询器 */
export function makeHeightSampler(sceneData) {
  const t = sceneData.terrain;
  return (x, z) =>
    sampleHeight(t.heights, t.cols, t.rows, t.minX, t.minZ, t.sizeX, t.sizeZ, x, z);
}
