/**
 * 近景**实体叶**（leaf detail）
 * =============================
 *
 * ## 为什么要有这一层
 *
 * 树冠的卡片方案（impostor）有个**硬上限**：
 * 贴图里一个叶团是画上去的一团色块，凑近 3 m 看，
 * 每个色块就读作**一张 30~60 cm 的巨型剪纸叶子**。
 * 贴图分辨率再高也没用 —— 形状本身是错的。
 *
 * AGENTS.md 的原则在这里最硬：「**建模比贴图精细度高得多**」
 * 「凡是有立体特征的构件，必须换成真几何」。叶子显然有立体特征。
 *
 * ## 做法：真叶 + 迟滞切换
 *
 *   · 近处（< 8 m）  → **完全不用** impostor 卡片，改用**实体叶簇**
 *   · 中间（8~15 m）→ 两种并存：卡片做底色与轮廓，实体叶做细节
 *   · 远处（> 15 m）→ 只有卡片（省面数）
 *
 * 切换用**迟滞带**（进 15 m / 出 17.5 m），
 * 免得站在边界上时树冠一帧有实体叶、一帧没有。
 *
 * ## 预算
 *
 * 近景 16 m 内平均只有 **2.9 棵树**（最多 14 棵）——
 * 每棵近景树 ~1500 簇 × 56 面 ≈ 8.4 万面 ⇒ 最坏 ~120 万面。
 * 相对全园 5400 万面可以接受，且**只影响贴脸的那几棵**。
 *
 * ## 顶点色的用法
 *
 * 本模块的材质**没有贴图**（叶子本身就是几何），
 * 所以顶点色是**真正的调制量**（灰度 0.5~1.05：中脉浅、叶缘深、
 * 根深梢浅），颜色由**材质固有色**（树种色）承担。
 * ⚠ 这与"贴图材质里顶点色≈1 的浅色调制"是两种不同用法，别混。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/* ------------------------------------------------------------ 常量 */

/** 近景补真叶的半径（m） */
const RADIUS = 14.0;
/** 进入近景的距离（m）——比 RADIUS 小，形成迟滞带 */
const ENTER = 11.0;
/** 退出近景的距离（m）——比 ENTER 大 */
const EXIT = 13.0;
/** 实例上限（最坏 14 棵 × 1800 簇） */
const MAX_INST = 64000;
/** 每棵近景树的叶簇数 */
const SPRIG_PER_TREE = 3200;
/** impostor 冠在多近时完全隐去（实体叶在此距离已足够密） */
const HIDE_CARD = 9.0;

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1e-6)));
  return t * t * (3 - 2 * t);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------ 一片叶 */

/**
 * 一片**真叶**：沿中脉 SEG 段，每段 3 列顶点（左缘 / 中脉 / 右缘）。
 *
 * 关键的三处立体：
 *   ① 中脉**拱起**、叶缘**下垂** ⇒ 叶片是 V 形截面，不是平板；
 *   ② 尖端与基部**收窄** ⇒ 是叶片形，不是椭圆片；
 *   ③ 顶点色：中脉浅、边缘深、根深梢浅 ⇒ 有自阴影感。
 *
 * 局部坐标：叶基在原点，叶片沿 **+Y** 伸展，宽度沿 X，法线朝 +Z。
 */
function leafGeometry(len, wid, narrow = false) {
  const SEG = 4;
  const pos = [];
  const col = [];
  const idx = [];
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    // 轮廓：中部最宽；细长叶（柳/杨）更早收尖
    const shape = narrow ? Math.pow(t, 0.55) : Math.pow(t, 0.8);
    const w = wid * 0.5 * Math.sin(Math.PI * shape);
    const y = t * len;
    const arch = Math.sin(Math.PI * t) * len * 0.07; // 中脉拱起
    const droop = -Math.pow(t, 1.8) * len * 0.1; // 叶缘下垂
    const yOff = droop + (t > 0 ? 0 : 0);
    // 三列
    pos.push(-w, y + yOff, 0);
    pos.push(0, y + yOff + arch, 0);
    pos.push(w, y + yOff, 0);
    // 顶点色：根深梢浅 × 中脉浅叶缘深
    const along = 0.68 + 0.36 * t;
    col.push(along * 0.66, along * 0.66, along * 0.66);
    col.push(along, along, along);
    col.push(along * 0.66, along * 0.66, along * 0.66);
  }
  for (let i = 0; i < SEG; i++) {
    const a = i * 3;
    const b = (i + 1) * 3;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
    idx.push(a + 1, b + 1, a + 2, b + 1, b + 2, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * 一束**针叶**（松）：几根细长薄片从一点散开。
 * 只有 2 个三角面一片 —— 针叶多、面积小，靠张数取胜。
 */
function needleGeometry(len, wid) {
  const pos = [];
  const col = [];
  const idx = [];
  const SEG = 2;
  let v = 0;
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    const y = t * len;
    const w = wid * (1 - t * 0.85);
    pos.push(-w, y, 0);
    pos.push(w, y, 0);
    const sh = 0.6 + 0.4 * t;
    col.push(sh, sh, sh);
    col.push(sh, sh, sh);
  }
  for (let i = 0; i < SEG; i++) {
    const a = i * 2;
    const b = (i + 1) * 2;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------ 一簇叶 */

/**
 * 一簇：细枝 + 若干叶（沿枝两侧交错着生）。
 *
 * 局部坐标：枝沿 **+Y** 生长并向 +Z 弯垂，叶从枝上向四周伸出。
 * 一簇阔叶 ≈ 56 面；一簇针叶 ≈ 20 面。
 */
function sprigGeometry(kind, opt) {
  const { leafLen, leafWid, nLeaves, branchLen, narrow, needle } = opt;
  const parts = [];

  /* ---- 细枝：两条边的锥形带（很细，看不见侧厚） ---- */
  {
    const SEG = 3;
    const pos = [];
    const col = [];
    const idx = [];
    const bw = leafLen * 0.035;
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG;
      const w = bw * (1 - t * 0.7);
      pos.push(-w, t * branchLen, Math.pow(t, 1.6) * branchLen * 0.26);
      pos.push(w, t * branchLen, Math.pow(t, 1.6) * branchLen * 0.26);
      const sh = 0.55 + 0.35 * t;
      col.push(sh, sh, sh);
      col.push(sh, sh, sh);
    }
    for (let i = 0; i < SEG; i++) {
      const a = i * 2;
      const b = (i + 1) * 2;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    parts.push(g);
  }

  /* ---- 叶 ---- */
  const rnd = mulberry32(0x51f0 + kind.length * 977 + nLeaves * 31);
  const leafProto = needle
    ? needleGeometry(leafLen, leafWid)
    : leafGeometry(leafLen, leafWid, narrow);
  for (let i = 0; i < nLeaves; i++) {
    const t = (i + 0.5) / nLeaves;
    const y = t * branchLen;
    const z = Math.pow(t, 1.6) * branchLen * 0.26;
    // 黄金角排布 ⇒ 叶序不重样
    const spin = i * 2.39996 + rnd() * 0.4;
    const up = needle ? 0.25 + rnd() * 0.5 : 0.3 + rnd() * 0.45;
    const dir = new THREE.Vector3(
      Math.cos(spin) * Math.cos(up),
      Math.sin(up),
      Math.sin(spin) * Math.cos(up)
    ).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir
    );
    const q2 = new THREE.Quaternion().setFromAxisAngle(dir, rnd() * Math.PI * 2);
    q.premultiply(q2);
    const leaf = leafProto.clone();
    leaf.applyQuaternion(q);
    leaf.translate(0, y, z);
    parts.push(leaf);
  }
  leafProto.dispose();

  const merged = mergeGeometries(parts, false);
  for (const p of parts) if (p !== merged) p.dispose();
  return merged;
}

/* ------------------------------------------------------------ 树种配置 */

/**
 * 每种树的"叶簇"配方。
 *
 * `leafLen` 是**真实叶长**（米）—— 决定近景叶片看起来对不对：
 * 柳叶 8~12 cm、白杨 5~8 cm、枫叶 10~14 cm、松针 3~8 cm。
 */
const SPRIG = {
  // ⚠ **松树不进实体叶层**。
  //   松树的 impostor 贴图画的是**一根根细针**，近看仍读作"针叶"；
  //   而实体针叶是**一根根独立的深色小棍**，稀疏地飘在冠里，
  //   反而比贴图假（实测：松针实体化后像"天上飘着几道细杠"）。
  //   ⇒ 松树保留 impostor，只做阔叶。
  pine: null,
  willow: {
    color: 0x6d8b4b,
    narrow: true,
    leafLen: 0.105,
    leafWid: 0.014,
    nLeaves: 9,
    branchLen: 0.28,
  },
  poplar: {
    color: 0x628248,
    narrow: true,
    leafLen: 0.078,
    leafWid: 0.030,
    nLeaves: 9,
    branchLen: 0.24,
  },
  blossom: {
    color: 0xd98aa4,
    leafLen: 0.095,
    leafWid: 0.044,
    nLeaves: 8,
    branchLen: 0.25,
  },
  maple: {
    color: 0x628248,
    leafLen: 0.115,
    leafWid: 0.064,
    nLeaves: 8,
    branchLen: 0.26,
  },
};

/* ------------------------------------------------------------ 总装 */

/**
 * 建立近景实体叶系统。
 *
 * @param {Array} treeInfo 每棵树的信息（见 trees.js → buildTrees 返回值）：
 *   { x, y, z, q(Quaternion), s(Vector3), species, crowns[{p,R,aspect}],
 *     foliage(InstancedMesh), fIdx }
 * @returns {{group: THREE.Group, update: (camX:number, camZ:number)=>void}}
 */
export function buildLeafDetail(treeInfo) {
  const group = new THREE.Group();
  group.name = 'leafDetail';

  // 每个树种一个 InstancedMesh ⇒ 5 个 draw call
  const meshes = new Map();
  for (const [kind, cfg] of Object.entries(SPRIG)) {
    if (!cfg) continue; // 该树种不进实体叶层
    const geo = sprigGeometry(kind, cfg);
    const mat = new THREE.MeshStandardMaterial({
      color: cfg.color,
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.86,
      metalness: 0,
      // 叶子薄、透一点光，不然背面是死黑
      envMapIntensity: 0.6,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, MAX_INST);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_INST * 3),
      3
    );
    mesh.count = 0;
    mesh.frustumCulled = false;
    group.add(mesh);
    meshes.set(kind, mesh);
  }

  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const qSpin = new THREE.Quaternion();
  const vPos = new THREE.Vector3();
  const vScl = new THREE.Vector3();
  const vLocal = new THREE.Vector3();
  const vDir = new THREE.Vector3();
  const col = new THREE.Color();
  const AXIS_Y = new THREE.Vector3(0, 1, 0);
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

  // 每棵树的原始冠矩阵（被隐去时要还原）
  const origMat = new Map();

  // ⚠⚠ **必须按相机移动节流**。
  //   每帧重扫 1.1 万棵树 + 重写几万个实例矩阵 ⇒ 帧率直接崩，
  //   无头截图也会被拖到超时（实测）。
  //   相机不动时近景树的集合就不变 ⇒ 完全不用重算。
  let lastX = Infinity;
  let lastZ = Infinity;
  let lastT = 0;
  const MOVE_EPS = 3.0; // 米：相机不动就不必重算
  const TIME_EPS = 250; // 毫秒：再兜一层，避免相机持续缓慢移动时每帧重算

  function update(camX, camZ) {
    if (Math.hypot(camX - lastX, camZ - lastZ) < MOVE_EPS) return;
    const now = performance.now();
    if (now - lastT < TIME_EPS) return;
    lastT = now;
    lastX = camX;
    lastZ = camZ;
    const counts = new Map();
    for (const m of meshes.values()) counts.set(m, 0);

    for (const t of treeInfo) {
      const d = Math.hypot(t.x - camX, t.z - camZ);

      // ---- 迟滞判定近景 ----
      const wasNear = t.__near;
      const isNear = wasNear ? d < EXIT : d < ENTER;
      t.__near = isNear;

      // ---- impostor 冠的显隐 ----
      // 近处完全隐去（实体叶已足够密）；离开近景时还原。
      // ⚠ 只对**有实体叶的树种**做 —— 松树没有实体叶，
      //   隐掉它的 impostor 就等于把树变秃。
      const wantHidden = d < HIDE_CARD && !!meshes.get(t.species);
      if (wantHidden !== t.__hidden) {
        t.__hidden = wantHidden;
        if (!origMat.has(t)) {
          // ⚠ `InstancedMesh.getMatrixAt(index, matrix)` **没有返回值**
          //   （它只是 `matrix.fromArray(...)`）——
          //   直接把它当返回值存下来会存进 `undefined`，还原时炸。
          const mm = new THREE.Matrix4();
          t.foliage.getMatrixAt(t.fIdx, mm);
          origMat.set(t, mm.clone());
        }
        t.foliage.setMatrixAt(t.fIdx, wantHidden ? ZERO : origMat.get(t));
        t.foliage.instanceMatrix.needsUpdate = true;
      }

      if (!isNear) continue;

      // 越近越多（8 m 处达到满密度）
      const fade = 1 - smoothstep(ENTER - 5, ENTER, d);
      if (fade <= 0.02) continue;
      const n = Math.round(SPRIG_PER_TREE * fade);
      if (!n) continue;

      const mesh = meshes.get(t.species);
      if (!mesh) continue; // 该树种没有实体叶（松树）
      let idx = counts.get(mesh);
      if (idx + n > MAX_INST) continue;

      /* ---- 在冠的各个叶团里撒簇 ---- */
      const rnd = mulberry32((t.seed ?? 1) ^ 0x9e37);
      const clusters = t.crowns;
      if (!clusters || !clusters.length) continue;
      const per = Math.max(1, Math.round(n / clusters.length));

      for (const c of clusters) {
        // 叶团中心 → 世界坐标
        vLocal.copy(c.p).multiply(t.s);
        vLocal.applyQuaternion(t.q);
        const cx = t.x + vLocal.x;
        const cy = t.y + vLocal.y;
        const cz = t.z + vLocal.z;
        const R = c.R * t.s.x;
        const asp = c.aspect;

        for (let i = 0; i < per && idx < MAX_INST; i++) {
          // 球面方向 + 半径（偏心分布，密在冠缘）
          const u = rnd() * 2 - 1;
          const a = rnd() * Math.PI * 2;
          const rr = Math.pow(rnd(), 0.45);
          const s2 = Math.sqrt(Math.max(0, 1 - u * u));
          const lx = Math.cos(a) * s2 * R * rr;
          const ly = u * R * asp * rr;
          const lz = Math.sin(a) * s2 * R * rr;

          vPos.set(cx + lx, cy + ly, cz + lz);
          // 枝梢朝冠外略倾（不是全竖直）
          vDir.set(lx, ly * 0.5 + R * 0.4, lz);
          if (vDir.lengthSq() < 1e-8) vDir.set(0, 1, 0);
          vDir.normalize();
          q.setFromUnitVectors(AXIS_Y, vDir);
          qSpin.setFromAxisAngle(AXIS_Y, rnd() * Math.PI * 2);
          q.premultiply(qSpin);
          const sc = 0.75 + rnd() * 0.55;
          vScl.set(sc, sc, sc);
          mtx.compose(vPos, q, vScl);
          mesh.setMatrixAt(idx, mtx);

          // 每簇一点色差（明度为主，色相微偏）
          const t2 = rnd();
          col.setRGB(
            0.88 + t2 * 0.26,
            0.9 + t2 * 0.18,
            0.86 + t2 * 0.2
          );
          mesh.setColorAt(idx, col);
          idx++;
        }
      }
      counts.set(mesh, idx);
    }

    for (const m of meshes.values()) {
      m.count = counts.get(m);
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  return { group, update };
}
