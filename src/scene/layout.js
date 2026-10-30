/**
 * 场景布局：把「四十景聚落」「现状建筑」「西洋楼」摆到正确的位置
 *
 * 坐标约定：X 向东，Z 向南，Y 向上；建筑默认面南（正面朝 -Z）。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildBuilding, specFromFootprint, defaultForm, ringArea } from './buildings/index.js';
import { mergeGroupByMaterial } from './buildings/merge.js';
import { stoneMaterial, roofMaterial } from './buildings/materials.js';
import { buildWesternEnsemble } from './western.js';
import { getTextureOverrides } from './buildings/textures.js';
import { SCENE_PROGRAM, TILE_COLORS } from './scenes-program.js';

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
 * 特殊平面（考据实记）
 *
 * - **万方安和**：平面呈"卍"字型房屋，共三十三间，建筑基础筑在水底。
 * - **澹泊宁静**：主体建筑为"田"字形殿。
 *
 * 屋面生成器按矩形轮廓工作，做不出折线平面；这里用若干矩形体量拼出轮廓，
 * 各体量共用檐高与瓦色，视觉上是一座复合建筑。
 * 体量划分是**推定**（考据只说平面形状，没给开间分配）。
 */
const PLAN_PARTS = {
  // 田字：中心方殿 + 四向翼
  tian: (w, d) => {
    const aw = w * 0.3;
    const ad = d * 0.3;
    return [
      { dx: 0, dz: 0, w: w * 0.62, d: d * 0.62 },
      { dx: 0, dz: -d * 0.31, w: aw, d: ad },
      { dx: 0, dz: d * 0.31, w: aw, d: ad },
      { dx: -w * 0.31, dz: 0, w: aw, d: ad },
      { dx: w * 0.31, dz: 0, w: aw, d: ad },
    ];
  },
  // 卍字：中心方殿 + 四条折向的臂
  wan: (w, d) => {
    const aw = w * 0.26;
    const ad = d * 0.26;
    return [
      { dx: 0, dz: 0, w: w * 0.5, d: d * 0.5 },
      { dx: 0, dz: -d * 0.28, w: aw, d: ad },
      { dx: -w * 0.13, dz: -d * 0.44, w: aw, d: ad },
      { dx: 0, dz: d * 0.28, w: aw, d: ad },
      { dx: w * 0.13, dz: d * 0.44, w: aw, d: ad },
      { dx: -w * 0.28, dz: 0, w: aw, d: ad },
      { dx: -w * 0.44, dz: -d * 0.13, w: aw, d: ad },
      { dx: w * 0.28, dz: 0, w: aw, d: ad },
      { dx: w * 0.44, dz: d * 0.13, w: aw, d: ad },
    ];
  },
};

/**
 * 四十景聚落：严格按《scenes-program.js》的逐景考证配置生成
 *
 * 主建筑形制取自 program.main（开间/进深/屋顶/彩画/台基/檐高/瓦色），
 * 配建筑群按 program.aux 的方位摆放，院落围墙按主建筑尺度围合。
 */
function buildSceneCluster(scene, heightAt, rnd) {
  const group = new THREE.Group();
  group.name = `scene-${scene.name}`;

  const program = SCENE_PROGRAM[scene.name];
  if (!program) return group;

  /**
   * 放一座建筑。
   *
   * 每座建筑都带一点**个体差异**：举高与檐高的微调。
   * 真实园林里不可能两座殿宇完全一样；全园 41 景若用同一套参数复制过去，
   * 一眼就是"建模软件里拉出来的"。
   */
  let buildSeq = 0;
  const place = (spec, dx, dz, rot = 0) => {
    const r = mulberry32(hash(scene.name) + buildSeq * 7919);
    buildSeq++;
    const b = buildBuilding({
      ...spec,
      rise: (spec.rise ?? 3) * (0.94 + r() * 0.13),
      eaveY: spec.eaveY != null ? spec.eaveY * (0.975 + r() * 0.05) : spec.eaveY,
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

  /* ---- 每景的个体配色 ----
   * 同一瓦色、同样的墙色，全园看上去就像复制粘贴。
   * 每一景给瓦色、墙色、柱色一点点色相/明度偏移，
   * 于是"一片黄琉璃"里能看出深浅差别。
   * 材质按颜色缓存、几何按景合并 ⇒ **draw call 不变**。 */
  const sceneRnd = mulberry32(hash(scene.name));
  const shiftHsl = (hex, dh, dl) => {
    const c = new THREE.Color(hex);
    const hsl = { h: 0, s: 0, l: 0 };
    c.getHSL(hsl);
    c.setHSL(
      (hsl.h + dh + 1) % 1,
      THREE.MathUtils.clamp(hsl.s + (sceneRnd() - 0.5) * 0.06, 0, 1),
      THREE.MathUtils.clamp(hsl.l + dl, 0, 1)
    );
    return `#${c.getHexString()}`;
  };
  // 材质变体：同一种砖/石/木生成多个变体，每景挑一个。
  // 几何是**按景合并**的，所以每景用自己的材质实例 → draw call 不变，
  // 但"同一个贴图铺满全园"的复制感会消失。
  const variant = Math.floor(sceneRnd() * 4);

  const baseTile = TILE_COLORS[program.main.tile];
  const tileColor = baseTile
    ? shiftHsl(baseTile.color, (sceneRnd() - 0.5) * 0.02, (sceneRnd() - 0.5) * 0.075)
    : null;
  const wallColor = shiftHsl('#9c3327', (sceneRnd() - 0.5) * 0.015, (sceneRnd() - 0.5) * 0.07);
  const columnColor = shiftHsl('#8f2820', (sceneRnd() - 0.5) * 0.015, (sceneRnd() - 0.5) * 0.07);

  /* ---- 主建筑 ---- */
  const m = program.main;
  const form = defaultForm(program.rank);
  const bayW = m.mian * 3.6; // 通面阔
  const bayD = m.jin * 3.3; // 进深
  const platformH =
    m.platform === 'xumizuo' ? 1.8 : m.platform === 'simple' ? 1.0 : 0;

  const mainSpec = {
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
    tile: m.tile,
    variant,
    tileColor,
    wallColor,
    columnColor,
    doubleEave: !!m.doubleEave,
    circular: !!m.circular,
    // 匾额题字：优先用考据实记的匾名（勤政殿、纪恩堂、哕鸾殿…），
    // 没有实记的才退回景名。匾上没有字一眼就假。
    plaqueText: program.plaque || scene.name,
    // 御书楹联（目前只有正大光明殿有实记）
    couplet: program.couplet || null,
    doors: centerDoors(m.mian),
    caojing: m.mian >= 5,
    rise: Math.max(2.0, bayW * 0.26),
  };

  if (m.plan && PLAN_PARTS[m.plan]) {
    // 特殊平面（万方安和"卍"字、澹泊宁静"田"字）：
    // 考据实记的平面形制，用若干体量拼出平面轮廓，各体量共用檐高。
    const parts = PLAN_PARTS[m.plan](bayW, bayD);
    let extW = 0;
    let extD = 0;
    for (const p of parts) {
      extW = Math.max(extW, Math.abs(p.dx) + p.w / 2);
      extD = Math.max(extD, Math.abs(p.dz) + p.d / 2);
      const pm = Math.max(1, Math.round(p.w / 3.6));
      const pj = Math.max(1, Math.round(p.d / 3.3));
      place(
        {
          ...mainSpec,
          width: p.w,
          depth: p.d,
          mian: pm,
          jin: pj,
          platform: 'none',
          platformH: 0,
          eaveY: platformH + m.eave,
          doors: centerDoors(pm),
          caojing: pm >= 5,
          rise: Math.max(1.6, p.w * 0.26),
        },
        p.dx,
        p.dz,
        0
      );
    }
    // 整座建筑共用一个台基（万方安和"基础筑在水底"）
    if (platformH > 0.05) {
      const g = new THREE.BoxGeometry(extW * 2 + 2.6, platformH, extD * 2 + 2.6);
      const y = heightAt(scene.x, scene.z);
      g.translate(scene.x, y + platformH / 2, scene.z);
      const mesh = new THREE.Mesh(g, stoneMaterial());
      mesh.name = 'stone';
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  } else {
    place(mainSpec, 0, 0, 0);
  }

  /* ---- 配建筑群 ---- */
  for (const a of program.aux || []) {
    const af = defaultForm(a.rank);
    const mian = a.mian ?? af.mian;
    const jin = a.jin ?? af.jin;
    const w = mian * (a.rank === 'pavilion' ? 3.0 : 3.5);
    const d = jin * 3.2;
    const ph = a.rank === 'pavilion' ? 0.7 : 1.0;
    const eh =
      a.eave ??
      (a.rank === 'tower' ? 8.5 : a.rank === 'pavilion' ? 4.2 : a.rank === 'gate' ? 5.2 : 5.6);
    const b = place(
      {
        rank: a.rank,
        width: w,
        depth: d,
        mian,
        jin,
        platformH: ph,
        eaveY: ph + eh,
        roof: af.roof,
        caihua: af.caihua,
        // 配建筑默认随主建筑的瓦色等级；考据里另有实记的用 a.tile 覆盖
        tile: a.tile ?? m.tile,
        variant,
        tileColor: a.tile ? null : tileColor,
        wallColor,
        columnColor,
        // 有实名的配建筑，匾额就写它的名字（飞云轩、静鉴阁…）
        plaqueText: a.name || a.mian ? a.name : undefined,
        doors: centerDoors(mian),
        rise: Math.max(1.6, w * 0.26),
      },
      a.x,
      a.z,
      a.rot || 0
    );
    // 有实名者把名字挂到建筑上，便于巡游与核查
    if (a.name) {
      b.name = a.name;
      b.userData.sceneName = scene.name;
    }
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

  // 整景按材质再合并一次：一景 5~9 座建筑，逐座出 Mesh 会让 draw calls 爆掉
  mergeGroupByMaterial(group);
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
  const h = 2.9;
  const t = 0.75;
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

      // 压顶：官式院墙是**小青瓦双坡顶**，不是一块灰板。
      // 做法：墙顶正中起脊，两侧各铺一坡瓦，出檐 0.3m。
      const halfW = t / 2 + 0.3;
      const drop = 0.34;
      const slopeLen = Math.hypot(halfW, drop);
      const pitch = Math.atan2(drop, halfW);
      // 墙的横向单位向量（局部 +Z 在世界里的方向）
      const px = -Math.sin(ang);
      const pz = Math.cos(ang);
      for (const sgn of [-1, 1]) {
        const slab = new THREE.BoxGeometry(len + 0.05, 0.1, slopeLen);
        slab.rotateX(pitch);
        slab.rotateY(-ang);
        const off = (sgn * halfW) / 2;
        slab.translate(
          mx + px * off,
          y + h + drop / 2 - 0.05,
          mz + pz * off
        );
        capParts.push(slab);
      }
      // 脊
      const ridge = new THREE.BoxGeometry(len + 0.05, 0.2, 0.24);
      ridge.rotateY(-ang);
      ridge.translate(mx, y + h + drop + 0.04, mz);
      capParts.push(ridge);
    }
  }

  // 用 AI 生成的青砖贴图，院墙才不像一块灰板
  const ov = getTextureOverrides();
  const wallMap = ov.brick ? ov.brick.clone() : null;
  if (wallMap) {
    wallMap.needsUpdate = true;
    wallMap.repeat.set(3, 1.4);
  }
  const mat = new THREE.MeshStandardMaterial({
    map: wallMap || null,
    color: wallMap ? 0xffffff : 0x6e6a61,
    roughness: 0.97,
  });
  // 墙顶小青瓦：复用官式建筑的瓦材质（灰瓦）
  const capMat = roofMaterial(false);
  const wall = new THREE.Mesh(mergeGeometries(wallParts, false), mat);
  const cap = new THREE.Mesh(mergeGeometries(capParts, false), capMat);
  cap.name = 'wallcap';
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
  mergeGroupByMaterial(existingGroup);
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
