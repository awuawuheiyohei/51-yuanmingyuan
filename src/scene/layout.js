/**
 * 场景布局：把「四十景聚落」「现状建筑」「西洋楼」摆到正确的位置
 *
 * 坐标约定：X 向东，Z 向南，Y 向上；建筑默认面南（正面朝 -Z）。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildBuilding, specFromFootprint, defaultForm, ringArea } from './buildings/index.js';
import { buildWesternEnsemble } from './western.js';
import { SCENE_PROGRAM } from './scenes-program.js';

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

function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * 四十景聚落：严格按《scenes-program.js》的逐景考证配置生成
 *
 * 主建筑形制取自 program.main（开间/进深/屋顶/彩画/台基/檐高），
 * 配建筑群按 program.aux 的方位摆放，院落围墙按主建筑尺度围合。
 */
function buildSceneCluster(scene, heightAt, rnd) {
  const group = new THREE.Group();
  group.name = `scene-${scene.name}`;

  const program = SCENE_PROGRAM[scene.name];
  if (!program) return group;

  const place = (spec, dx, dz, rot = 0) => {
    const b = buildBuilding({
      ...spec,
      position: [
        scene.x + dx,
        heightAt(scene.x + dx, scene.z + dz),
        scene.z + dz,
      ],
      rotation: rot,
    });
    group.add(b);
    return b;
  };

  /* ---- 主建筑 ---- */
  const m = program.main;
  const form = defaultForm(program.rank);
  const bayW = m.mian * 3.6; // 通面阔
  const bayD = m.jin * 3.3; // 进深
  const platformH =
    m.platform === 'xumizuo' ? 1.8 : m.platform === 'simple' ? 1.0 : 0;
  place(
    {
      rank: program.rank,
      width: bayW,
      depth: bayD,
      mian: m.mian,
      jin: m.jin,
      platformH,
      platform: m.platform,
      eaveY: platformH + m.eave,
      roof: m.roof,
      caihua: m.caihua,
      circular: !!m.circular,
      doors: centerDoors(m.mian),
      caojing: m.mian >= 5,
      rise: Math.max(2.0, bayW * 0.26),
    },
    0,
    0,
    0
  );

  /* ---- 配建筑群 ---- */
  for (const a of program.aux || []) {
    const af = defaultForm(a.rank);
    const w = af.mian * (a.rank === 'pavilion' ? 3.0 : 3.5);
    const d = af.jin * 3.2;
    const ph = a.rank === 'pavilion' ? 0.7 : 1.0;
    const eh =
      a.rank === 'tower' ? 8.5 : a.rank === 'pavilion' ? 4.2 : a.rank === 'gate' ? 5.2 : 5.6;
    place(
      {
        rank: a.rank,
        width: w,
        depth: d,
        mian: af.mian,
        jin: af.jin,
        platformH: ph,
        eaveY: ph + eh,
        doors: centerDoors(af.mian),
        rise: Math.max(1.6, w * 0.26),
      },
      a.x,
      a.z,
      a.rot || 0
    );
  }

  /* ---- 院落围墙 ---- */
  const half = Math.max(
    26,
    Math.max(
      Math.abs(m.mian * 3.6) / 2 + 12,
      ...(program.aux || []).map((a) => Math.abs(a.x) + 12)
    )
  );
  group.add(buildCourtyardWall(half, half * 0.78, heightAt, scene.x, scene.z));

  return group;
}

function centerDoors(mian) {
  if (mian <= 1) return [0];
  if (mian % 2 === 1) {
    const c = (mian - 1) / 2;
    return [c - 1, c, c + 1].filter((i) => i >= 0 && i < mian);
  }
  return [mian / 2 - 1, mian / 2];
}

/** 院落围墙：分段贴地，避免在起伏地形上悬空（整院合并为 2 个 Mesh） */
function buildCourtyardWall(halfW, halfD, heightAt, cx, cz) {
  const group = new THREE.Group();
  const wallParts = [];
  const capParts = [];
  const h = 3.4;
  const t = 0.9;
  const SEG = 14;

  const sides = [
    { from: [cx - halfW, cz + halfD], to: [cx + halfW, cz + halfD] },
    { from: [cx + halfW, cz + halfD], to: [cx + halfW, cz - halfD] },
    { from: [cx + halfW, cz - halfD], to: [cx - halfW, cz - halfD] },
    { from: [cx - halfW, cz - halfD], to: [cx - halfW, cz + halfD] },
  ];

  for (const side of sides) {
    const [x1, z1] = side.from;
    const [x2, z2] = side.to;
    for (let i = 0; i < SEG; i++) {
      const t0 = i / SEG;
      const t1 = (i + 1) / SEG;
      const ax = x1 + (x2 - x1) * t0;
      const az = z1 + (z2 - z1) * t0;
      const bx = x1 + (x2 - x1) * t1;
      const bz = z1 + (z2 - z1) * t1;
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      const len = Math.hypot(bx - ax, bz - az);
      const ang = Math.atan2(bz - az, bx - ax);
      const y = heightAt?.(mx, mz) ?? 0;

      const g = new THREE.BoxGeometry(len + 0.05, h, t);
      g.rotateY(-ang);
      g.translate(mx, y + h / 2, mz);
      wallParts.push(g);

      const cap = new THREE.BoxGeometry(len + 0.05, 0.35, t + 0.5);
      cap.rotateY(-ang);
      cap.translate(mx, y + h + 0.17, mz);
      capParts.push(cap);
    }
  }

  const mat = new THREE.MeshStandardMaterial({ color: 0x9a958c, roughness: 0.95 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0x5d5f63, roughness: 0.9 });
  const wall = new THREE.Mesh(mergeGeometries(wallParts, false), mat);
  const cap = new THREE.Mesh(mergeGeometries(capParts, false), capMat);
  wall.castShadow = wall.receiveShadow = true;
  cap.castShadow = true;
  group.add(wall, cap);
  for (const g of wallParts) g.dispose();
  for (const g of capParts) g.dispose();
  return group;
}

/**
 * 主入口：按 OSM 现状建筑生成
 */
function buildExistingBuilding(b, heightAt) {
  // 轮廓可能带孔洞（relation），这里只取外环
  const ring = b.ring;
  const minX = Math.min(...ring.map((p) => p[0]));
  const maxX = Math.max(...ring.map((p) => p[0]));
  const minZ = Math.min(...ring.map((p) => p[1]));
  const maxZ = Math.max(...ring.map((p) => p[1]));
  const w = maxX - minX;
  const d = maxZ - minZ;
  if (w < 3 || d < 3) return null;

  const cx = b.cx;
  const cz = b.cz;
  const spec = specFromFootprint(
    ring.map(([x, z]) => [x - cx, z - cz])
  );
  const y = heightAt(cx, cz);
  const g = buildBuilding({
    ...spec,
    position: [cx, y, cz],
    rotation: 0,
  });
  g.name = b.tags?.name || 'existing';
  return g;
}

/**
 * 总装
 */
export function buildLayout(sceneData, heightAt) {
  const group = new THREE.Group();
  group.name = 'layout';
  const rnd = mulberry32(20261101);
  const park = sceneData.park;

  /* ---- 现状建筑（限三园核心范围内） ---- */
  let existing = 0;
  const existingGroup = new THREE.Group();
  existingGroup.name = 'existing-buildings';
  const g = sceneData.garden;
  const inGarden = g
    ? (x, z) =>
        x >= g.xMin && x <= g.xMax && z >= g.zMin && z <= g.zMax
    : () => true;
  for (const b of sceneData.buildings || []) {
    if (!inGarden(b.cx, b.cz)) continue;
    if (park && !pointInRing(b.cx, b.cz, park)) continue;
    const bld = buildExistingBuilding(b, heightAt);
    if (!bld) continue;
    existingGroup.add(bld);
    existing++;
  }
  group.add(existingGroup);

  /* ---- 四十景聚落 ---- */
  const sceneGroup = new THREE.Group();
  sceneGroup.name = 'scenes';
  let sceneCount = 0;
  for (const s of sceneData.scenes || []) {
    if (s.western) continue;
    if (!SCENE_PROGRAM[s.name]) continue;
    const g = buildSceneCluster(s, heightAt, mulberry32(hash(s.name)));
    if (g.children.length) {
      sceneGroup.add(g);
      sceneCount++;
    }
  }
  group.add(sceneGroup);

  /* ---- 西洋楼 ---- */
  const western = buildWesternEnsemble(sceneData, heightAt);
  if (western) group.add(western);

  return { group, existing, sceneCount };
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
