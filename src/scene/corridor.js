/**
 * 游廊（廊）
 *
 * 圆明园最具辨识度的构件之一。沿路布置：
 *   两列柱 + 檩 + 卷棚/悬山屋面 + 一侧美人靠（坐凳栏杆）+ 地面墁石
 *
 * 廊的尺度按清式：
 *   廊宽 2.4~3.0m，柱高 2.6~3.0m，柱径 0.22m
 *   步架（柱距）1.6~2.0m
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { roofMaterial } from './buildings/materials.js';

const CORRIDOR = {
  width: 2.7,
  colH: 2.85,
  colDia: 0.22,
  step: 1.8,
  roofRise: 0.72,
};

function cyl(r, h, seg = 8) {
  const g = new THREE.CylinderGeometry(r, r * 1.04, h, seg);
  g.translate(0, h / 2, 0);
  return g;
}

/**
 * 一次性生成全园游廊（合并成 4 个 Mesh：柱/屋面/木作/石）
 */
export function buildCorridors(sceneData, heightAt) {
  const group = new THREE.Group();
  group.name = 'corridors';
  const buckets = { column: [], roof: [], wood: [], stone: [] };

  for (const line of sceneData.corridors || []) {
    const parts = buildCorridor(line, heightAt);
    if (!parts) continue;
    for (const [k, g] of Object.entries(parts)) buckets[k].push(g);
  }

  const mats = {
    column: new THREE.MeshStandardMaterial({ color: 0x9c3327, roughness: 0.7 }),
    // 游廊屋面复用官式建筑的瓦材质：瓦垄靠贴图，几何只出双坡
    roof: roofMaterial(false),
    wood: new THREE.MeshStandardMaterial({ color: 0x6b4426, roughness: 0.85 }),
    stone: new THREE.MeshStandardMaterial({ color: 0xa9a396, roughness: 0.95 }),
  };

  for (const [k, list] of Object.entries(buckets)) {
    if (!list.length) continue;
    const merged = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mats[k]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

/**
 * 沿折线生成一段游廊
 * @param {number[][]} line 折线（局部米制坐标）
 * @param {Function} heightAt 地形高度查询
 */
export function buildCorridor(line, heightAt) {
  if (!line || line.length < 2) return null;

  const parts = { column: [], roof: [], wood: [], stone: [] };

  // 重采样：按固定步距取点
  const pts = [];
  let carry = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const [x1, z1] = line[i];
    const [x2, z2] = line[i + 1];
    const segLen = Math.hypot(x2 - x1, z2 - z1);
    if (segLen < 1e-3) continue;
    let t = carry;
    while (t < segLen) {
      pts.push([x1 + ((x2 - x1) * t) / segLen, z1 + ((z2 - z1) * t) / segLen]);
      t += CORRIDOR.step;
    }
    carry = t - segLen;
  }
  if (pts.length < 2) return null;
  pts.push(line[line.length - 1]);

  const half = CORRIDOR.width / 2;
  const colH = CORRIDOR.colH;

  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i];
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    let dx = next[0] - prev[0];
    let dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    const nx = -dz;
    const nz = dx;
    const yaw = Math.atan2(dx, dz);
    const y = heightAt?.(x, z) ?? 0;

    // 地坪
    const floor = new THREE.BoxGeometry(CORRIDOR.width, 0.16, CORRIDOR.step * 1.02);
    floor.rotateY(yaw);
    floor.translate(x, y + 0.08, z);
    parts.stone.push(floor);

    // 两侧柱
    for (const s of [-1, 1]) {
      const c = cyl(CORRIDOR.colDia / 2, colH, 8);
      c.rotateY(yaw);
      c.translate(x + nx * half * s, y + 0.16, z + nz * half * s);
      parts.column.push(c);
      // 柱础
      const b = new THREE.CylinderGeometry(
        CORRIDOR.colDia * 0.62,
        CORRIDOR.colDia * 0.7,
        0.12,
        8
      );
      b.translate(x + nx * half * s, y + 0.22, z + nz * half * s);
      parts.stone.push(b);
    }

    // 额枋（两根柱顶之间的横枋）
    if (i < pts.length - 1) {
      const nx2 = pts[i + 1][0];
      const nz2 = pts[i + 1][1];
      const segLen = Math.hypot(nx2 - x, nz2 - z) || 1;
      const mx = (x + nx2) / 2;
      const mz = (z + nz2) / 2;
      const my = (heightAt?.(mx, mz) ?? 0) + 0.16 + colH;
      for (const s of [-1, 1]) {
        const beam = new THREE.BoxGeometry(0.16, 0.3, segLen * 1.05);
        beam.rotateY(yaw);
        beam.translate(mx + nx * half * s, my + 0.15, mz + nz * half * s);
        parts.wood.push(beam);
      }
      // 檐檩（屋面下的檩条）
      for (const s of [-1, 1]) {
        const purlin = new THREE.BoxGeometry(0.12, 0.12, segLen * 1.05);
        purlin.rotateY(yaw);
        purlin.translate(mx + nx * half * s, my + 0.52, mz + nz * half * s);
        parts.wood.push(purlin);
      }
    }
  }

  // 屋面：沿整条路径拉一个双坡（卷棚）顶
  const roof = buildCorridorRoof(pts, heightAt);
  if (roof) parts.roof.push(roof);

  // 美人靠（一侧倚栏）
  const meiren = buildMeiRenKao(pts, heightAt, half);
  if (meiren) parts.wood.push(meiren);

  const out = {};
  for (const [k, list] of Object.entries(parts)) {
    if (!list.length) continue;
    const merged = mergeGeometries(list, false);
    for (const g of list) g.dispose();
    if (merged) out[k] = merged;
  }
  return out;
}

/** 卷棚屋面：两坡相接，中部起脊 */
function buildCorridorRoof(pts, heightAt) {
  const half = CORRIDOR.width / 2;
  const rise = CORRIDOR.roofRise;
  const verts = [];
  const uvs = [];
  const idx = [];

  // UV 与瓦贴图布局对齐（贴图横向 6 垄、纵向 6 层瓦当）：
  // u 沿廊子方向 → 一循环 6 垄 = 2.52m；v 沿坡向 → 一循环 6 层 = 1.5m。
  // 之前 u 是 i*0.5，一张贴图被拉到十几米长，瓦垄糊成一片。
  const U_PER_M = 1 / 2.52;
  const V_PER_M = 1 / 1.5;
  let run = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i];
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    let dx = next[0] - prev[0];
    let dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    const nx = -dz;
    const nz = dx;
    const y = (heightAt?.(x, z) ?? 0) + 0.16 + CORRIDOR.colH + 0.6;
    const over = 0.85; // 出檐
    if (i > 0) {
      run += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
    }
    const u = run * U_PER_M;
    const slope = Math.hypot(half + over, rise); // 檐口到脊的坡长
    verts.push(x + nx * (half + over), y, z + nz * (half + over));
    verts.push(x, y + rise, z);
    verts.push(x - nx * (half + over), y, z - nz * (half + over));
    uvs.push(u, 0, u, slope * V_PER_M * 0.5, u, slope * V_PER_M);
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = i * 3;
    idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
    idx.push(a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 美人靠：斜倚的坐凳栏杆 */
function buildMeiRenKao(pts, heightAt, half) {
  const parts = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[i + 1];
    let dx = x2 - x1;
    let dz = z2 - z1;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    const nx = -dz;
    const nz = dx;
    const mx = (x1 + x2) / 2;
    const mz = (z1 + z2) / 2;
    const y = (heightAt?.(mx, mz) ?? 0) + 0.16;
    const s = -1; // 靠在一侧
    // 座面
    const seat = new THREE.BoxGeometry(0.5, 0.09, len * 1.05);
    seat.rotateY(Math.atan2(dx, dz));
    seat.translate(mx + nx * (half - 0.2) * s, y + 0.46, mz + nz * (half - 0.2) * s);
    parts.push(seat);
    // 斜靠背
    const back = new THREE.BoxGeometry(0.08, 0.5, len * 1.05);
    back.rotateZ(0);
    back.rotateX(0);
    const g2 = back.clone();
    g2.rotateY(Math.atan2(dx, dz));
    g2.translate(mx + nx * (half - 0.34) * s, y + 0.7, mz + nz * (half - 0.34) * s);
    parts.push(g2);
    back.dispose();
  }
  if (!parts.length) return null;
  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  return merged;
}
