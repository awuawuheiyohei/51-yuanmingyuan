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
    // ⚠⚠ 合并前必须**统一索引状态**（全 indexed 或全 non-indexed）。
    //   `mergeGeometries` 遇到混合状态只会在 console 打一行 error 并
    //   **返回 null** —— null 一路传到渲染层，整桶几何**无声消失**
    //   （AGENTS.md §4.1.7 第一条：曾因此整园白屏）。
    //   这里**指名道姓地抛错**，别让错误静默传播。
    const flat = geos.map((g) => {
      if (!g) return g;
      if (!g.index) return g;
      const n = g.toNonIndexed();
      return n;
    });
    let geo = null;
    try {
      geo = flat.length === 1 ? flat[0] : mergeGeometries(flat, false);
    } catch (err) {
      throw new Error(
        `mergeGroupByMaterial: 合并材质桶 "${key}" 失败：${err.message}`
      );
    }
    if (!geo) {
      throw new Error(
        `mergeGroupByMaterial: 合并材质桶 "${key}" 返回 null（几何索引状态不一致或属性集不匹配），` +
          `该桶的 ${flat.length} 个几何会整桶消失`
      );
    }
    for (const g of flat) if (g !== geo) g.dispose();
    for (const g of geos) if (g !== geo && !flat.includes(g)) g.dispose();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // 名字给人看（调试探针按名字分组），用材质类型+色值
    mesh.name =
      mat?.name ||
      `${mat?.type || 'Mesh'}-${mat?.color?.getHexString?.() ?? '0'}`;
    group.add(mesh);
  }
  return group;
}
