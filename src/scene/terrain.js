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

  const geo = new THREE.PlaneGeometry(
    spanX,
    spanZ,
    cols - 1,
    rows - 1
  );
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  // 颜色：低处偏暖土黄，高处偏冷灰；缓坡草绿，陡坡露岩
  const cGrass = new THREE.Color('#4e5c37');
  const cEarth = new THREE.Color('#6b6149');
  const cRock = new THREE.Color('#84837c');
  const cSand = new THREE.Color('#a89d80');
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
    tmp.lerp(cSand, Math.max(0, 0.35 - alt) * 0.4);

    // 低频大尺度色变：打散贴图的重复感
    const low =
      Math.sin(x * 0.0055 + 1.3) * 0.5 +
      Math.sin(z * 0.0041 - 0.7) * 0.5 +
      Math.sin((x + z) * 0.0026) * 0.6;
    tmp.offsetHSL(low * 0.012, low * 0.05, low * 0.055);

    // 高频抖动：打散 8bit 量化造成的等高线色带。
    // 用**整数哈希**，不要用 sin 大数伪随机——sin(x*12.9898) 在 x 上千之后
    // 精度掉光，输出变成沿网格的规则条纹，全园俯视就是一片斜向灯芯绒。
    const hsh = (Math.imul(Math.round(x * 4), 374761393) +
      Math.imul(Math.round(z * 4), 668265263)) | 0;
    const j = Math.imul(hsh ^ (hsh >>> 13), 1274126177);
    const n = (((j ^ (j >>> 16)) >>> 0) / 4294967296 - 0.5) * 0.044;
    tmp.offsetHSL(0, n * 0.5, n);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  // UV 按世界尺度铺开：程序化贴图 35m 一张，AI 照片贴图要密一些（14m）
  const tile = getTextureOverrides().grass ? 14 : 35;
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * (spanX / tile), uv.getY(i) * (spanZ / tile));
  }
  uv.needsUpdate = true;
  geo.computeVertexNormals();

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
