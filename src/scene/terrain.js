/**
 * 地形：把高程网格变成可渲染网格，并按高程/坡度做顶点着色
 */
import * as THREE from 'three';
import { makeGroundTexture } from './ground.js';
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

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + (minX + sizeX / 2);
    const z = pos.getZ(i) + (minZ + sizeZ / 2);
    pos.setX(i, x);
    pos.setZ(i, z);
    const h = heightAt(x, z);
    pos.setY(i, h);

    // 坡度
    const d = 6;
    const hx = heightAt(x + d, z) - heightAt(x - d, z);
    const hz = heightAt(x, z + d) - heightAt(x, z - d);
    const slope = Math.min(1, Math.hypot(hx, hz) / (2 * d) / 0.55);

    const alt = THREE.MathUtils.clamp((h - 44) / 22, 0, 1);
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
    // 用**整数哈希**，不要用 sin 大数伪随机——sin(x*12.9898) 在 x 上千之后
    // 精度掉光，输出变成沿网格的规则条纹，全园俯视就是一片斜向灯芯绒。
    const hsh = (Math.imul(Math.round(x * 4), 374761393) +
      Math.imul(Math.round(z * 4), 668265263)) | 0;
    const j = Math.imul(hsh ^ (hsh >>> 13), 1274126177);
    const n = (((j ^ (j >>> 16)) >>> 0) / 4294967296 - 0.5) * 0.044;
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
  // DEM 是 10m 分辨率上采样的，三角形化后每个 DEM 格子的台阶会变成一片
  // 规则的斜向刻面（俯视时满屏灯芯绒）。差分步长取 6m（大于 DEM 格距），
  // 法线就只反映真实坡度、不反映量化台阶。
  {
    const nrm = geo.getAttribute('normal');
    const d = 6;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const hx = heightAt(x + d, z) - heightAt(x - d, z);
      const hz = heightAt(x, z + d) - heightAt(x, z - d);
      const len = Math.hypot(hx, 2 * d, hz) || 1;
      nrm.setXYZ(i, -hx / len, (2 * d) / len, -hz / len);
    }
    nrm.needsUpdate = true;
  }

  const mat = new THREE.MeshStandardMaterial({
    map: makeGroundTexture(),
    vertexColors: true,
    roughness: 0.98,
    metalness: 0,
  });
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
