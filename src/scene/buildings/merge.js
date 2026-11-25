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
 * 把几何的属性集归一成 **position / normal / uv / color** 四个。
 *
 * ⚠ `mergeGeometries` 会逐个比对属性名与数量，
 *   同一个桶里只要有一个几何多一个或少一个属性 ⇒ **整桶返回 null**
 *   （只打一行 error，静默丢一桶几何）。
 *
 *   缺 `color` 的补一份全 1（= 不调制），
 *   多的（uv1/uv2/tangent…）删掉。
 *   顶点色是"贴图的调制系数"语义，全 1 就是不调制 ⇒ 语义安全。
 */
function normalizeAttrs(g) {
  if (!g || !g.attributes || !g.attributes.position) return g;
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) {
    const n = g.attributes.position.count;
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  }
  if (!g.attributes.color) {
    const n = g.attributes.position.count;
    g.setAttribute(
      'color',
      new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3)
    );
  }
  for (const k of Object.keys(g.attributes)) {
    if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
  }
  return g;
}

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
        if (!buckets.has(key)) buckets.set(key, { mat, geos: [], srcs: new Set(), owners: new Set() });
        // 记录这个桶由哪些**源构件名**合并而来。
        //
        // 合并后 mesh.name 只能放一个名字（材质名或 type-color）⇒ **构件类别丢了**。
        // 白模体检要靠「构件类别」上色（墙/柱/槅扇/格心/斗栱 各一色），
        // 出问题时才能一眼看出是哪一档坏了 ⇒ 把源名字集合存进 userData。
        //
        // ⚠ 纯增量：不影响渲染、不影响 draw call。
        buckets.get(key).srcs.add(child.userData?.bucketKey || child.name || '');
        /**
         * 记录**源建筑名**（合并会把建筑 group 清空 ⇒ 名字会丢）。
         * 白模体检页用它做「聚焦某一座建筑」（`?focus=名字`）。
         */
        const owner = child.userData?.ownerName || child.parent?.userData?.ownerName || '';
        if (owner) buckets.get(key).owners.add(owner);
        const g = child.geometry.clone();
        g.applyMatrix4(child.matrixWorld);
        // ⚠⚠ **属性集必须统一**（和索引状态一样）。
        //   `mergeGeometries` 逐个比对属性名与数量，
        //   同一个材质桶里只要有一个几何多/少一个属性 ⇒ **整桶返回 null**。
        //
        //   实测：给中式建筑的墙件补上 `color` 顶点色之后，
        //   同一个 'wall' 桶里混进了没有 color 的屋面/线脚几何 ⇒
        //   「合并材质桶 返回 null（该桶的 N 个几何会整桶消失）」，
        //   而且这里抛的是**未捕获异常** ⇒ 整个场景构建中断、页面白屏。
        //
        //   ⇒ 合并前把每个几何归一成同一套属性：position/normal/uv/color。
        normalizeAttrs(g);
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

  for (const [key, { mat, geos, srcs, owners }] of buckets) {
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
    /**
     * **源构件类别**（桶键）集合。
     *
     * 合并后 mesh.name 只能放一个字符串 ⇒ 构件类别信息丢失。
     * 白模体检（`scripts/white.html`）要靠它按类别上色：
     * 墙/柱/槅扇/格心/斗栱 各一色 ⇒ 出问题能一眼看出是哪一档坏了。
     *
     * ⚠ 纯增量字段：渲染层不读它 ⇒ 不影响 draw call、不影响性能。
     */
    if (srcs && srcs.size) mesh.userData.bucketKeys = [...srcs];
    if (owners && owners.size) mesh.userData.ownerNames = [...owners];
    group.add(mesh);
  }
  return group;
}
