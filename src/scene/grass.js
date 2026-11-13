/**
 * **草丛** —— 近景地面的实体草叶。
 *
 * ## 为什么必须是几何
 *
 * 地面贴图再细，30 m 外也只是一层颜色；人眼高度看过去，
 * 一片**完全平的绿板**是整个场景最容易露馅的地方（AGENTS §4.1「视觉保真度是硬要求」：
 * 凡是**有立体特征**的构件都必须换成真几何）。
 * ⇒ 这里撒的是**一片片草叶**（每丛 6 片、每片带弯曲、顶端收尖），
 *   不是一张带草叶图案的贴图。
 *
 * ## 为什么"跟着相机"铺
 *
 * 圆明园核心范围 2361×1672 m ≈ 400 万 m²。全园按 1 丛/m² 撒 = 400 万丛，
 * 三角面直接爆掉 ⇒ 改成**相机周围 45 m 内**才铺草（实例化，一批 draw call）。
 *
 * ## 撒点规则（确定性 ⇒ 相机移动时草不会"跳"）
 *
 * 以 **1.4 m 的格**为单位，每格的草位由 `hash(格号)` 决定 ⇒ 同一格永远长在同���处；
 * 相机移动时只是换一批格，格子边界之外才出现/消失（45 m 外，看不见）。
 *
 * ## 排除（避免草长在不该长的地方）
 *
 * | 排除项 | 判据 |
 * |---|---|
 * | 水面 | 该格中心落在任一水面多边形内 |
 * | 路面 | 该格中心距任一步道/游线 < 2.6 m |
 * | 院落与建筑 | 该格中心落在任一建筑占地（含 12 m 余量）内 |
 * | 陡坡 | 坡度太大（岩壁）不长草 |
 */
import * as THREE from 'three';

const CELL = 1.2; // 网格边长（m）
const RADIUS = 38; // 铺多大半径（m）
const PER_CELL = 3; // 每格几丛 ⇒ 约 2 丛/m²
const MAX_TUFTS = 12000; // 实例上限

/** 平滑阶跃（与 terrain.js / water.js 同一套写法） */
function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1e-6)));
  return t * t * (3 - 2 * t);
}

/* ---------------------------------------------------------------- 草丛几何 */

/**
 * 一片草叶：带弯曲的锥形条。
 * 底宽 → 中段（向外弯）→ 顶端收尖，共 4 个三角形。
 */
function bladeGeometry(h, w, bend) {
  const g = new THREE.BufferGeometry();
  const v = new Float32Array([
    // 左下、右下、左中、右中、尖
    -w, 0, 0,
    w, 0, 0,
    -w * 0.55, h * 0.56, bend * 0.55,
    w * 0.55, h * 0.56, bend * 0.55,
    0, h, bend,
  ]);
  const idx = [0, 1, 2, 1, 3, 2, 2, 3, 4];
  g.setAttribute('position', new THREE.BufferAttribute(v, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // 顶点色：根部深、梢部浅（自阴影感）
  const cols = new Float32Array(15);
  const cBase = [0.13, 0.17, 0.07];
  const cTip = [0.34, 0.44, 0.16];
  const per = [
    cBase, cBase, cBase, cBase, cTip,
  ];
  for (let i = 0; i < 5; i++) {
    cols[i * 3] = per[i][0];
    cols[i * 3 + 1] = per[i][1];
    cols[i * 3 + 2] = per[i][2];
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}

/** 一丛：6 片草叶绕 Y 均布，各带一点外倾与长短差 */
function tuftGeometry() {
  const parts = [];
  const N = 6;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + 0.37;
    const h = 0.115 + ((i * 37) % 11) / 85; // 0.115 ~ 0.24 m（草地草，不是芦苇）
    const b = bladeGeometry(h, 0.011, 0.028 + ((i * 53) % 7) / 160);
    b.rotateY(a);
    b.rotateX(((i * 29) % 9) / 60);
    parts.push(b);
  }
  return parts;
}

/* ------------------------------------------------------------ 撒点与排除 */

function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

function pointInRing(x, z, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c;
  }
  return c;
}

function distToSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  if (l2 < 1e-9) return Math.hypot(px - ax, pz - az);
  let t = ((px - ax) * dx + (pz - az) * dz) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

/**
 * @param {object} sceneData 场景数据（water / paths）
 * @param {Function} heightAt 地形高程采样
 * @param {Array} footprints 建筑占地矩形（layout.footprints）
 * @param {number} waterLevel 水面高程（低于它的都算水里）
 */
export function buildGrass(sceneData, heightAt, footprints = [], waterLevel = null) {
  const group = new THREE.Group();
  group.name = 'grass';

  /* ---- 材质 ---- */
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0,
    side: THREE.DoubleSide,
    // 草叶要透一点光，不然一丛丛黑
    alphaTest: 0,
    transparent: false,
  });

  const parts = tuftGeometry();
  const tuft = new THREE.BufferGeometry();
  // 手动合并几片草叶（都是同一属性集，可以直接拼）
  let vCount = 0;
  let iCount = 0;
  for (const p of parts) {
    vCount += p.attributes.position.count;
    iCount += p.index.count;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const col = new Float32Array(vCount * 3);
  const idx = new Uint16Array(iCount);
  let vo = 0;
  let io = 0;
  for (const p of parts) {
    const n = p.attributes.position.count;
    pos.set(p.attributes.position.array, vo * 3);
    nor.set(p.attributes.normal.array, vo * 3);
    col.set(p.attributes.color.array, vo * 3);
    for (let i = 0; i < p.index.count; i++) idx[io++] = p.index.getX(i) + vo;
    vo += n;
  }
  tuft.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  tuft.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  tuft.setAttribute('color', new THREE.BufferAttribute(col, 3));
  tuft.setIndex(new THREE.BufferAttribute(idx, 1));
  tuft.computeBoundingSphere();

  const inst = new THREE.InstancedMesh(tuft, mat, MAX_TUFTS);
  inst.name = 'grass-tufts';
  inst.castShadow = false;
  inst.receiveShadow = true;
  inst.frustumCulled = false;
  inst.count = 0;
  group.add(inst);

  /* ---- 排除用的数据 ---- */
  const waters = (sceneData.water || [])
    .filter((w) => w.ring && w.ring.length > 2)
    .map((w) => ({ ring: w.ring, level: w.level }));
  const pathLines = (sceneData.paths || [])
    .filter((p) => p.line && p.line.length > 1)
    .map((p) => p.line);
  const fps = footprints;

  /** 该格能不能长草 */
  const cellOk = new Map();
  function okAt(x, z) {
    const key = `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
    let v = cellOk.get(key);
    if (v !== undefined) return v;
    v = true;
    // 水面
    for (const w of waters) {
      if (pointInRing(x, z, w.ring)) {
        v = false;
        break;
      }
    }
    // 建筑与院落
    if (v) {
      for (const f of fps) {
        if (
          x > f.minX - 12 &&
          x < f.maxX + 12 &&
          z > f.minZ - 12 &&
          z < f.maxZ + 12
        ) {
          v = false;
          break;
        }
      }
    }
    // 路面
    if (v) {
      for (const line of pathLines) {
        let hit = false;
        for (let i = 1; i < line.length; i++) {
          if (distToSeg(x, z, line[i - 1][0], line[i - 1][1], line[i][0], line[i][1]) < 2.6) {
            hit = true;
            break;
          }
        }
        if (hit) {
          v = false;
          break;
        }
      }
    }
    cellOk.set(key, v);
    return v;
  }

  /* ---- 铺草 ---- */
  const mtx = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const p3 = new THREE.Vector3();
  const colr = new THREE.Color();
  let lastX = Infinity;
  let lastZ = Infinity;

  function refill(camX, camZ) {
    const c0 = Math.floor((camX - RADIUS) / CELL);
    const c1 = Math.floor((camX + RADIUS) / CELL);
    const d0 = Math.floor((camZ - RADIUS) / CELL);
    const d1 = Math.floor((camZ + RADIUS) / CELL);

    // ⚠⚠ **按到相机的距离排序后再铺**。
    //
    // 原来按行扫描（cz 从小到大）填，填满 MAX_TUFTS 就停 ——
    // 而 MAX_TUFTS 恰好约等于铺满整个方形区所需的丛数，
    // 于是远处被拒的格子（水面/路面/建筑）挤占名额后，
    // 扫描线后面的整片区域**一片草都没有**：
    // 画面里出现一道**笔直的横向截断线**（实测在福海岸边可见）。
    //
    // 改成按距离由近及远填 ⇒ 名额永远优先给近处，
    // 被截掉的必然是**最远**的一圈，而那一圈本来就要渐隐。
    const cells = [];
    for (let cz = d0; cz <= d1; cz++) {
      for (let cx = c0; cx <= c1; cx++) {
        const dx = (cx + 0.5) * CELL - camX;
        const dz = (cz + 0.5) * CELL - camZ;
        const dist = Math.hypot(dx, dz);
        if (dist > RADIUS) continue; // 圆形边界，不要方形
        cells.push([cx, cz, dist]);
      }
    }
    cells.sort((a, b) => a[2] - b[2]);

    let n = 0;
    for (const [cx, cz, dist] of cells) {
      const h = hash2(cx, cz);
      // 边缘渐隐：越靠近铺展半径，草丛越小 ⇒ 没有硬边
      const fade =
        dist > RADIUS * 0.72
          ? 1 - smoothstep(RADIUS * 0.72, RADIUS, dist)
          : 1;
      for (let k = 0; k < PER_CELL && n < MAX_TUFTS; k++) {
        const hh = hash2(cx * 31 + k, cz * 17 + k * 7);
        const x = (cx + ((hh & 0xffff) / 65535)) * CELL;
        const z = (cz + (((hh >>> 16) & 0xffff) / 65535)) * CELL;
        if (!okAt(x, z)) continue;
        const y = heightAt(x, z);
        if (!isFinite(y)) continue;
        // ⚠ 不能用"全局最高水位"当阈值 —— 那是别的湖的高程，
        //   会把整片低地判成水里、��不长草。水的排除已在 okAt() 里
        //   按**水面多边形**逐格判定 ✓。
        // 坡度：太陡不长草
        const gx = heightAt(x + 1.2, z) - heightAt(x - 1.2, z);
        const gz = heightAt(x, z + 1.2) - heightAt(x, z - 1.2);
        if (Math.hypot(gx, gz) > 1.6) continue;
        const sc = 0.7 + ((h >>> 7) % 100) / 180; // 0.7 ~ 1.25
        const rot = ((h >>> 13) % 360) * (Math.PI / 180);
        p3.set(x, y - 0.03, z);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
        const f = fade * sc;
        scl.set(f, f * (0.85 + ((h >>> 19) % 100) / 130), f);
        mtx.compose(p3, q, scl);
        inst.setMatrixAt(n, mtx);
        // 每丛一点色差（黄绿↔蓝绿）
        const t = ((h >>> 23) % 100) / 100;
        // 每丛一点色差：偏黄的枯草 ↔ 偏蓝的嫩草（幅度要小，不然像撒了荧光棒）
        colr.setRGB(0.80 + t * 0.30, 0.86 - t * 0.10, 0.72 - t * 0.30);
        inst.setColorAt(n, colr);
        n++;
      }
    }
    inst.count = n;
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  }

  return {
    group,
    /** 相机移动时重铺（超过 3 m 才重算） */
    update(camX, camZ) {
      if (Math.hypot(camX - lastX, camZ - lastZ) < 3) return;
      lastX = camX;
      lastZ = camZ;
      refill(camX, camZ);
    },
  };
}
