/**
 * 场景布局：把「四十景聚落」「现状建筑」「西洋楼」摆到正确的位置
 *
 * 坐标约定：X 向东，Z 向南，Y 向上；建筑默认面南（正面朝 -Z）。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildBuilding, specFromFootprint, defaultForm, ringArea } from './buildings/index.js';
import { mergeGroupByMaterial } from './buildings/merge.js';
import {
  stoneMaterial,
  roofMaterial,
  brickMaterial,
  paveMaterial,
  flagstoneMaterial,
} from './buildings/materials.js';
import { buildWesternEnsemble } from './western.js';
import { getTextureOverrides } from './buildings/textures.js';
import { SCENE_PROGRAM, TILE_COLORS } from './scenes-program.js';
import { deriveDimensions } from './buildings/modular.js';

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
      // 每座建筑一个稳定的 UV 种子：彩画带/铺地在贴图里错开起点，
      // 避免"每栋殿都是同一条印上去的带子"（不动材质，不加 draw call）
      uvSeed: (hash(scene.name) + buildSeq * 7919) % 100000,
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

  /**
   * 尺寸由**斗口制模数**推导，不再手填。
   *
   * ⚠ 原来这里是 `bayW = m.mian * 3.6`、`eaveY = platformH + m.eave`：
   *   面阔按固定 3.6m/间、檐高是 scenes-program.js 里手填的绝对米数，
   *   两者**没有任何数学关系** —— 七间大殿可能比五间配殿还矮。
   *
   * 现在：开间数/进深数/等级（有考据依据）→ 斗口 → 整套尺寸自洽推导。
   * 详见 `src/scene/buildings/modular.js`。
   */
  const D = deriveDimensions({
    mian: m.mian,
    jin: m.jin,
    rank: program.rank,
    platform: m.platform,
    roof: m.roof,
  });
  const bayW = D.width;
  const bayD = D.depth;

  const mainSpec = {
    rank: program.rank,
    width: D.width,
    depth: D.depth,
    mian: m.mian,
    jin: m.jin,
    platformH: D.platformH,
    platform: m.platform,
    eaveY: D.eaveY,
    // 模数派生的构件尺度（柱径、柱高、墙厚、斗栱跳数、斗口）
    colDia: D.colDia,
    colH: D.colH,
    wallThick: D.wallThick,
    dougongJumps: D.dougongJumps,
    dougongScale: D.dougongScale,
    dougongHeight: D.dougongHeight,
    hasDougong: D.hasDougong,
    doukou: D.doukou,
    beamH: D.beamH,
    // **非等宽柱网**：明间居中最大，向两翼逐间递减（攒当法）
    colXs: D.colXs,
    bayWidths: D.bayWidths,
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
    rise: Math.max(2.0, D.bayW * 0.26),
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
      // 每个体量按**自己的开间数**重新走一遍模数推导 ——
      // 卍字/田字各体量大小不同，柱高与台基要跟着各自的开间数走，
      // 不能共用主体的檐高。
      const pm = Math.max(1, Math.round(p.w / D.bayW));
      const pj = Math.max(1, Math.round(p.d / D.bayD));
      const PD = deriveDimensions({
        mian: pm,
        jin: pj,
        rank: program.rank,
        platform: 'none',
        roof: m.roof,
      });
      place(
        {
          ...mainSpec,
          width: p.w,
          depth: p.d,
          mian: pm,
          jin: pj,
          platform: 'none',
          platformH: 0,
          eaveY: PD.eaveY,
          colDia: PD.colDia,
          colH: PD.colH,
          wallThick: PD.wallThick,
          dougongScale: PD.dougongScale,
          dougongHeight: PD.dougongHeight,
          hasDougong: PD.hasDougong,
          doukou: PD.doukou,
          beamH: PD.beamH,
          // 每个体量按**自己的**开间数重新算柱网（各体量大小不同）
          colXs: PD.colXs,
          bayWidths: PD.bayWidths,
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
    if (D.platformH > 0.05) {
      const g = new THREE.BoxGeometry(extW * 2 + 2.6, D.platformH, extD * 2 + 2.6);
      const y = heightAt(scene.x, scene.z);
      g.translate(scene.x, y + D.platformH / 2, scene.z);
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
  /**
   * 配建筑的**碰撞规避**。
   *
   * `scenes-program.js` 里的 `a.x / a.z` 是**平面布局的意图**
   * （"茶膳房在正殿西北方"），但那些数值是照着**旧尺寸**手填的。
   * 现在主建筑按斗口制变大了（原 23.1m → 32.5m），
   * 手填偏移就可能让配殿的屋面与主殿屋面**交叠**。
   *
   * 这里保留作者写下的**方位意图**（象限、朝向），
   * 但把距离拉到"刚好不重叠"——不改变构图关系，只修尺度。
   *
   * ⚠ 判据用**屋面外轮廓**（含出檐），不是柱网：
   *   穿模的是屋面，不是墙体。
   */
  const OVERHANG_PAD = 1.6; // 出檐 + 翼角起翘的余量（米）
  /** 已放置建筑的包围盒（含出檐） */
  const placed = [];
  const mainHalfW = D.width / 2;
  const mainHalfD = D.depth / 2;
  placed.push({
    x: 0,
    z: 0,
    halfW: mainHalfW + OVERHANG_PAD,
    halfD: mainHalfD + OVERHANG_PAD,
  });

  /** 把 (x,z) 推到与所有已放置建筑都不重叠的位置（保持方位意图） */
  const separate = (x, z, halfW, halfD) => {
    let nx = x;
    let nz = z;
    for (let iter = 0; iter < 8; iter++) {
      let moved = false;
      for (const p of placed) {
        // X 方向重叠？
        if (Math.abs(nx - p.x) < halfW + p.halfW) {
          // Z 方向也重叠？→ 沿**较近的轴**推开
          const overlapX = halfW + p.halfW - Math.abs(nx - p.x);
          const overlapZ = halfD + p.halfD - Math.abs(nz - p.z);
          if (overlapZ > 0) {
            if (overlapX >= overlapZ) {
              const dir = nx >= p.x ? 1 : -1;
              nx = p.x + dir * (halfW + p.halfW);
            } else {
              const dir = nz >= p.z ? 1 : -1;
              nz = p.z + dir * (halfD + p.halfD);
            }
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
    return [nx, nz];
  };

  for (const a of program.aux || []) {
    const af = defaultForm(a.rank);
    const mian = a.mian ?? af.mian;
    const jin = a.jin ?? af.jin;
    // 配建筑同样走斗口制：等级定尺度，开间数定大小。
    // 原来这里是 `mian * 3.5` + 手填檐高（8.5/4.2/5.2/5.6），
    // 与主建筑、与彼此都没有关系。
    const AD = deriveDimensions({
      mian,
      jin,
      rank: a.rank,
      platform: a.rank === 'pavilion' ? 'none' : 'simple',
      roof: af.roof,
    });
    const w = AD.width;
    const d = AD.depth;
    const ph = AD.platformH;
    // 考据实记了檐高的才用实记值（`a.eave`），否则用模数推导
    const eh = a.eave != null ? a.eave : AD.eaveY - AD.platformH;

    // 碰撞规避：保持方位意图，只把距离拉开到不重叠
    const [ax, az] = separate(a.x, a.z, w / 2 + OVERHANG_PAD, d / 2 + OVERHANG_PAD);

    const b = place(
      {
        rank: a.rank,
        width: w,
        depth: d,
        mian,
        jin,
        platformH: ph,
        eaveY: ph + eh,
        colDia: AD.colDia,
        colH: AD.colH,
        wallThick: AD.wallThick,
        dougongJumps: AD.dougongJumps,
        dougongScale: AD.dougongScale,
        dougongHeight: AD.dougongHeight,
        hasDougong: AD.hasDougong,
        doukou: AD.doukou,
        beamH: AD.beamH,
        colXs: AD.colXs,
        bayWidths: AD.bayWidths,
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
      ax,
      az,
      a.rot || 0
    );
    // 登记入已放置集合，供后续配殿避让
    placed.push({
      x: ax,
      z: az,
      halfW: w / 2 + OVERHANG_PAD,
      halfD: d / 2 + OVERHANG_PAD,
    });
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

  /* ---- 院内地面：墁砖地 + 十字甬路 ----
   * 官式院落里地面不是草地，而是**方砖墁地**，中间压一道十字甬路（石板）。
   * 一片空草地在近景里既不真实，也让建筑"浮"在地面上。
   *
   * ⚠ 贴图密度必须按**真实米数**算（`paveMaterial`），
   *   否则 48m 的墁砖地一张贴图铺 4.8m，砖块大得像巨石。
   */
  {
    const y0 = heightAt(scene.x, scene.z);
    const halfY = Math.max(14, half * 0.92);
    // 墁砖地：一张略带起伏的砖面（起伏交给顶点，边缘下沉埋进土里）
    const pave = new THREE.PlaneGeometry(halfY * 2, halfY * 1.72, 26, 22);
    pave.rotateX(-Math.PI / 2);
    const pos = pave.attributes.position;
    // 顶点色：大尺度色偏，打散"一张贴图铺满全院"的重复感。
    // 波长取 30~80m（**不能用低频**：波长 180m 会变成"地毯上一块块深浅"）。
    const pcol = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const px = pos.getX(i);
      const pz = pos.getZ(i);
      const edge = Math.max(Math.abs(px) / halfY, Math.abs(pz) / (halfY * 0.86));
      const bump = Math.sin(px * 1.7) * Math.cos(pz * 1.9) * 0.012;
      pos.setY(i, 0.06 + bump - edge * edge * 0.10);
      const low = Math.sin(px * 0.038 + 1.1) * 0.5 + Math.cos(pz * 0.041 - 0.6) * 0.5;
      const mid = Math.sin(px * 0.021 - 0.3) * 0.5 + Math.cos(pz * 0.026 + 0.9) * 0.4;
      const k = 1 + low * 0.030 + mid * 0.018;
      pcol[i * 3] = k * (1 + mid * 0.012);
      pcol[i * 3 + 1] = k;
      pcol[i * 3 + 2] = k * (1 - low * 0.012);
    }
    pave.setAttribute('color', new THREE.BufferAttribute(pcol, 3));
    pave.computeVertexNormals();
    // 逐景错开贴图起点：否则每个院子的墁砖地是同一张贴图，
    // 俯视时全园是一张铺满的"花地毯"。
    {
      const uv = pave.attributes.uv;
      const su = (hash(scene.name) % 97) / 97;
      const sv = (hash(scene.name) % 61) / 61;
      for (let k = 0; k < uv.count; k++) {
        uv.setXY(k, uv.getX(k) + su, uv.getY(k) + sv);
      }
      uv.needsUpdate = true;
    }
    pave.translate(scene.x, y0, scene.z);
    const paveMesh = new THREE.Mesh(pave, paveMaterial(halfY * 2, halfY * 1.72));
    paveMesh.name = 'paving';
    paveMesh.receiveShadow = true;
    group.add(paveMesh);

    // 十字甬路：一道石板路（南北 + 东西）
    //
    // 石板是**一块块独立的几何体**，板与板之间留真实接缝 ——
    // 不是在一张贴图上画格子。
    // 单块约 1.15m × 0.53m（御路石板的实际量级）。
    const roadW = 3.2;
    const SLAB_L = 1.15; // 单块石板长（沿路方向）
    const SLAB_W = 0.53; // 单块石板宽（横跨路宽）
    const cols = Math.max(1, Math.round(roadW / SLAB_W));
    const slabW = roadW / cols;
    const flagMat = flagstoneMaterial();
    for (const [dx, dz, lx, lz] of [
      [0, 0, roadW, halfY * 1.7],
      [0, 0, halfY * 1.9, roadW],
    ]) {
      const alongX = lx > lz;
      const n = Math.max(3, Math.round((alongX ? lx : lz) / SLAB_L));
      const segLen = (alongX ? lx : lz) / n;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n - 0.5;
        for (let c = 0; c < cols; c++) {
          const s = (c + 0.5) / cols - 0.5;
          const sx = scene.x + (alongX ? t * lx : s * roadW);
          const sz = scene.z + (alongX ? s * roadW : t * lz);
          // 留 4cm 接缝（板与板之间能看见土/砖底）
          const slab = new THREE.BoxGeometry(
            alongX ? segLen - 0.04 : slabW - 0.04,
            0.13,
            alongX ? slabW - 0.04 : segLen - 0.04
          );
          slab.translate(sx, y0 + 0.12, sz);
          const m = new THREE.Mesh(slab, flagMat);
          m.name = 'paving';
          m.receiveShadow = true;
          m.castShadow = true;
          group.add(m);
        }
      }
    }
  }


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
