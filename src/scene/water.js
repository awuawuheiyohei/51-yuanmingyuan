/**
 * 水面：福海、如意洲诸池、西洋楼镜池等
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeHeightSampler } from './terrain.js';

/** 程序化水波法线贴图 */
function rippleNormalTexture() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = (x / S) * Math.PI * 2;
      const v = (y / S) * Math.PI * 2;
      const dx =
        Math.cos(u * 3 + v * 1.2) * 0.6 + Math.cos(u * 7 - v * 4) * 0.25;
      const dy =
        Math.sin(v * 3 - u * 0.8) * 0.6 + Math.sin(v * 6 + u * 3.3) * 0.25;
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
  normalMap.repeat.set(24, 24);

  const mat = new THREE.MeshStandardMaterial({
    color: 0x2f7f86,
    roughness: 0.08,
    metalness: 0.25,
    transparent: true,
    opacity: 0.96,
    normalMap,
    normalScale: new THREE.Vector2(0.35, 0.35),
    side: THREE.DoubleSide,
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
