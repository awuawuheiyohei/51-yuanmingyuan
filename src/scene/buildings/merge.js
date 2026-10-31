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
  // 材质实例 → 桶 key。用材质实例本身当 key（Map 支持对象键），
  // 天然保证"同名不同实例"不会被混进同一桶。
  const matToKey = new Map();
  group.updateMatrixWorld(true);

  /**
   * **递归**收集 Mesh。
   *
   * ⚠ 之前只处理 `group.children` 里的直接 Mesh ——
   *   而 buildBuilding() 返回的是**嵌套 Group**（建筑 → 构件组 → Mesh），
   *   嵌套里的 Mesh 一个都没被合并。
   *   现状建筑 369 座就这么变成了 369 个 draw call。
   */
  const collect = (node) => {
    for (const child of node.children) {
      if (child.isMesh && child.geometry) {
        // 合并的 key 必须是**材质**，不能是 Mesh 的 name。
        //
        // 原来用 `child.name || ...`：现状建筑每座都带自己的名字
        // （layout.js 里 `g.name = b.tags?.name || 'existing'`），
        // 于是每座建筑自成一桶 —— 合并等于没做。
        const mat = child.material;
        let key = matToKey.get(mat);
        if (key === undefined) {
          key = mat;
          matToKey.set(mat, key);
        }
        if (!buckets.has(key)) buckets.set(key, { mat, geos: [] });
        const g = child.geometry.clone();
        g.applyMatrix4(child.matrixWorld);
        buckets.get(key).geos.push(g);
      } else if (child.isGroup || child.children?.length) {
        collect(child);
      } else {
        others.push(child);
      }
    }
  };
  collect(group);

  // 清空原 group 的内容（保留非 Mesh 的顶层子节点）
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
    // 名字给人看（调试探针按名字分组），用材质类型+色值
    mesh.name =
      mat?.name ||
      `${mat?.type || 'Mesh'}-${mat?.color?.getHexString?.() ?? '0'}`;
    group.add(mesh);
    for (const g of geos) if (g !== geo) g.dispose();
  }
  return group;
}
