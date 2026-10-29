/**
 * 水面：福海、如意洲诸池、西洋楼镜池等
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeHeightSampler } from './terrain.js';

/** 程序化水波法线贴图：两个频率叠加，避免出现规则的鱼鳞纹 */
function rippleNormalTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = (x / S) * Math.PI * 2;
      const v = (y / S) * Math.PI * 2;
      const dx =
        Math.cos(u * 2 + v * 0.9) * 0.35 +
        Math.cos(u * 5.3 - v * 3.7 + 1.2) * 0.16 +
        Math.cos(u * 9.1 + v * 7.4) * 0.07 +
        Math.cos(u * 13.7 - v * 11.1 + 2.4) * 0.035;
      const dy =
        Math.sin(v * 2 - u * 0.7) * 0.35 +
        Math.sin(v * 4.7 + u * 3.1 + 0.7) * 0.16 +
        Math.sin(v * 8.3 - u * 6.9) * 0.07 +
        Math.sin(v * 12.1 + u * 9.7) * 0.035;
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
    roughness: 0.26,
    metalness: 0.0,
    transparent: true,
    opacity: 0.965,
    normalMap,
    // 波纹必须看得见：0.07 时水面就是一块平涂色板。
    normalScale: new THREE.Vector2(0.38, 0.38),
    side: THREE.DoubleSide,
    envMapIntensity: 0.45,
    clearcoat: 0.35,
    clearcoatRoughness: 0.08,
    // 多片水面交界处共面，用 polygonOffset 避免 z-fighting
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

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
