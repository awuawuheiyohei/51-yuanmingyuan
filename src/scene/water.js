/**
 * 水面：福海、如意洲诸池、西洋楼镜池等
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeHeightSampler } from './terrain.js';

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

  // --- 周期性 value noise（必须在 u/v 上无缝，否则贴图边界会有接缝） ---
  const hash = (x, y, p) => {
    let h = x * 374761393 + y * 668265263 + p * 2147483647;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  const smooth = (t) => t * t * (3 - 2 * t);
  /** 周期为 P 的二维 value noise */
  const vnoise = (x, y, P, p) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = smooth(x - xi);
    const yf = smooth(y - yi);
    const w = (a, b) => hash(((a % P) + P) % P, ((b % P) + P) % P, p);
    const a = w(xi, yi);
    const b = w(xi + 1, yi);
    const cc = w(xi, yi + 1);
    const d = w(xi + 1, yi + 1);
    return (a + (b - a) * xf) * (1 - yf) + (cc + (d - cc) * xf) * yf;
  };
  /** fbm：三层，频率 4/8/16，幅度递减 */
  const fbm = (x, y) => {
    let v = 0;
    let amp = 1;
    let norm = 0;
    for (let o = 0; o < 3; o++) {
      const P = 4 << o;
      v += vnoise((x * P) / S, (y * P) / S, P, o + 1) * amp;
      norm += amp;
      amp *= 0.55;
    }
    return v / norm;
  };

  // 先算高度场，再中心差分求梯度
  const H = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) H[y * S + x] = fbm(x, y);
  }
  const at = (x, y) => H[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 2.4;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 2.4;
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

export function buildWater(sceneData) {
  const group = new THREE.Group();
  group.name = 'water';

  const normalMap = rippleNormalTexture();
  // 水面几何的 UV 是米制坐标，一张波纹贴图覆盖约 3.5m
  // （之前 9m 一张，主频波长 4.5m，远看像瓦楞板）
  normalMap.repeat.set(1 / 3.5, 1 / 3.5);

  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x0f3b45,
    // ⚠ 原来 0.26 + clearcoat 0.35 ⇒ 整片湖糊成一面镜子（半个湖是白晃晃的高光）
    roughness: 0.40,
    metalness: 0.0,
    transparent: true,
    opacity: 0.965,
    normalMap,
    // 波纹必须看得见：0.07 时水面就是一块平涂色板。
    normalScale: new THREE.Vector2(0.24, 0.24),
    side: THREE.DoubleSide,
    envMapIntensity: 0.34,
    clearcoat: 0.12,
    clearcoatRoughness: 0.16,
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
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vRipDist;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvRipDist = -mvPosition.z;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vRipDist;')
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
          mapN.xy *= normalScale * ripFade;
          normal = normalize( tbn * mapN );
        #endif`
      );
  };
  mat.customProgramCacheKey = () => 'water-ripple-noise-v5';

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
