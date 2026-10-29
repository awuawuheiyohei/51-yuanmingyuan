/**
 * 按材质合并几何的通用工具。
 *
 * 为什么要它：一景里常有 5~9 座建筑，每座建筑按材质合并后仍有 6~8 个 Mesh，
 * 逐座挂在场景里的话 draw calls 会随建筑数线性膨胀（实测一度到 2354）。
 * 把整组建筑再按材质合一遍，一景就只剩 6~8 个 draw call。
 *
 * 注意：合并后的几何处于**世界坐标**，因此调用方所在的 Group 必须位于原点。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * 把 group 里的所有 Mesh 按材质名合并，返回同一个 group。
 * 非 Mesh 的子节点（灯光、组）原样保留。
 *
 * @param {THREE.Group} group
 * @returns {THREE.Group}
 */
export function mergeGroupByMaterial(group) {
  const buckets = new Map();
  const others = [];
  group.updateMatrixWorld(true);

  for (const child of [...group.children]) {
    if (!child.isMesh || !child.geometry) {
      others.push(child);
      continue;
    }
    const key = child.name || child.material?.name || 'misc';
    if (!buckets.has(key)) buckets.set(key, { mat: child.material, geos: [] });
    const g = child.geometry.clone();
    g.applyMatrix4(child.matrixWorld);
    buckets.get(key).geos.push(g);
  }

  for (const child of [...group.children]) group.remove(child);
  for (const child of others) group.add(child);

  for (const [key, { mat, geos }] of buckets) {
    if (!geos.length) continue;
    let geo = null;
    try {
      geo = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    } catch {
      geo = geos[0];
    }
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = key;
    group.add(mesh);
    for (const g of geos) if (g !== geo) g.dispose();
  }
  return group;
}
