/**
 * 材质库 —— 全部由程序化贴图生成，无外部素材依赖
 */
import * as THREE from 'three';
import {
  roofTiles,
  roofTilesNormal,
  caihua,
  redWall,
  ornateStone,
  normalFor,
  roughFor,
  variantNormal,
  variantRough,
  variantTexture,
  columnPaint,
  lacquer,
  brickWall,
  stone,
  wood,
  caoJing,
  latticeWindow,
  plaqueBoard,
} from './textures.js';
import { TILE_COLORS } from '../scenes-program.js';

const cache = new Map();

function make(key, factory) {
  if (!cache.has(key)) cache.set(key, factory());
  return cache.get(key);
}

/**
 * 屋面材质。
 *
 * - **灰瓦**：贴图给出砖缝与苔痕等连续表面，筒瓦的形状由几何提供。
 * - **琉璃瓦**：釉面是单色的，靠几何（筒瓦/板瓦/瓦当/滴水）出形、靠法线出釉面高光，
 *   不再贴条纹图——条纹贴在半圆管上会变成"每垄 16 条竖线"，一眼假。
 */
export function roofMaterial(glazed = false, color = '#2f7a4a') {
  const mat = make(`roof-${glazed}-${color}`, () => {
    const normalMap = roofTilesNormal();
    if (glazed) {
      return new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        normalMap,
        // 琉璃瓦面是**光滑釉面**，不该有瓦垄的凹凸。
        // 法线强度给高了，屋面会变成一张"花砖"——西洋楼海晏堂的孔雀绿琉璃顶
        // 远看整片都是方格纹。
        normalScale: new THREE.Vector2(0.1, 0.1),
        roughness: 0.26,
        metalness: 0.06,
        envMapIntensity: 1.2,
      });
    }
    return new THREE.MeshStandardMaterial({
      map: roofTiles().map,
      normalMap,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughness: 0.88,
      metalness: 0.02,
      // 青瓦的固有色。
      //
      // ⚠ 两次踩坑：
      //   ① 给 0xb9bcc2（linear 0.73）→ 太阳下过曝，整片屋面白得像铁皮；
      //   ② 矫枉过正给 0x4a4e54（linear 0.075）→ **比真实青瓦还暗**，
      //      背光面直接渲成纯黑，游廊的顶看着像一条黑带。
      // 真实青瓦（新瓦约 0.20~0.25 反照率，sRGB 约 0x777a7e；
      // 旧瓦更暗）——取 0x6e7176（linear ≈ 0.16），
      // 阳面是青灰、背面是深灰，不会黑白两头翻车。
      color: 0x6e7176,
    });
  });
  // DEBUG（临时）：?roof=tile 把所有屋面染成品红，定位"白屋顶"到底是谁
  const dbg = new URLSearchParams(location.search).get('roof');
  if (dbg === 'tile' && !glazed) {
    mat.color.setHex(0xff00ff);
    if (mat.emissive) {
      mat.emissive.setHex(0xff00ff);
      mat.emissiveIntensity = 0.6;
    }
  }
  return mat;
}

export function ridgeMaterial(color = '#6e7176') {
  return make(`ridge-${color}`, () => {
    // 正脊/垂脊是**小筒瓦垒成**的，本身要有瓦的质感，不能是纯色亮面。
    // 之前 map=no + 浅灰色（#858b91）在阳光下直接打到 255，
    // 远看屋脊是一条**白带子**。
    // 现在：给瓦贴图 + 深灰固有色，与屋面同族。
    const map = roofTiles().map?.clone();
    if (map) {
      map.needsUpdate = true;
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(1, 8);
    }
    return new THREE.MeshStandardMaterial({
      map: map || null,
      color: new THREE.Color(color).multiplyScalar(0.62),
      roughness: 0.92,
      metalness: 0.02,
    });
  });
}

export function eaveMaterial() {
  return make('eave', () =>
    new THREE.MeshStandardMaterial({ color: 0x6b5a48, roughness: 0.9 })
  );
}

/**
 * 官式建筑的石材（须弥座、条石、栏杆、柱础）。
 *
 * 用**青砖**贴图而不是 AI 生成的那张"西洋番花浮雕石"——后者是给西洋楼
 * 用的，给中式须弥座贴上巴洛克卷草，一眼就串味。
 */
export function stoneMaterial(variant = 0) {
  return make(`stone-v${variant}`, () => {
    const map = (variantTexture('stone', variant) || stone()).clone();
    map.needsUpdate = true;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(2, 2);
    return new THREE.MeshStandardMaterial({
      map,
      // 条石：再压一档。AI 那张石材贴图带白色石脉，
      // 铺在向阳的须弥座上会亮得像大理石/冰面。
      color: 0x928d85,
      roughness: 1,
    });
  });
}

/**
 * 素面石材（大面铺砌用）：无雕花，只保留石块的砌缝与质感。
 */
export function plainStoneMaterial() {
  return make('plain-stone', () => {
    const map = stone().clone();
    map.needsUpdate = true;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(2, 2);
    return new THREE.MeshStandardMaterial({
      map,
      color: 0xe4e0d6,
      roughness: 0.92,
    });
  });
}

/**
 * 西洋楼的汉白玉/大理石：带西洋番花浮雕的石材贴图。
 * 只用于柱身、栏板、券口这类小面积构件。
 */
export function ornateStoneMaterial() {
  return make('ornate-stone', () => {
    const map = ornateStone().clone();
    map.needsUpdate = true;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(2, 2);
    return new THREE.MeshStandardMaterial({ map, roughness: 0.95 });
  });
}

/**
 * 素漆（大漆）：柱身、槅扇框料、绦环板、裙板、垫板。
 *
 * ⚠ **不能用 AI 的 `wood.png`**。那张是一整幅**雕花木门照片**，
 *   贴到 0.48m 的柱子上就成了"柱子上画了半扇门"，
 *   而且同一块花纹在每根柱上原样重复 —— 这就是"浓的贴图感"的根源。
 *
 * 这里用程序化**素漆**：漆底 + 极淡竖纹 + 涂刷不匀，
 * 没有图案、不可辨识，只提供"漆面"质感。
 *
 * @param {'red'|'black'} kind 漆色
 * @param {number} seed 种子（不同构件给不同种子）
 */
export function lacquerMaterial(kind = 'red', seed = 1) {
  const base = kind === 'black' ? '#2a211b' : '#9e2f27';
  return make(`lacquer-${kind}`, () => {
    const map = lacquer(base, seed).clone();
    map.needsUpdate = true;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    // 一张漆纹覆盖约 0.6m：竖纹细到看不出是纹，只感到"漆面"
    map.repeat.set(1, 1);
    return new THREE.MeshStandardMaterial({
      map,
      roughness: kind === 'black' ? 0.55 : 0.42,
      metalness: 0.04,
    });
  });
}

export function columnMaterial(color = '#a8302a') {
  return make(`column-${color}`, () => {
    const map = columnPaint(color);
    return new THREE.MeshStandardMaterial({ map, roughness: 0.62, metalness: 0.04 });
  });
}

export function caihuaMaterial(style = 'xuanzi') {
  return make(`caihua-${style}`, () => {
    const map = caihua(style);
    return new THREE.MeshStandardMaterial({ map, roughness: 0.55, metalness: 0.08 });
  });
}

export function dougongMaterial() {
  return make('dougong', () =>
    new THREE.MeshStandardMaterial({ color: 0x1f4a55, roughness: 0.7, metalness: 0.04 })
  );
}

export function wallMaterial(type = 'brick', tint = null, variant = 0) {
  return make(`wall-${type}-${tint || 'd'}-v${variant}`, () => {
    // 红墙不是一块纯色板：清代官墙是砖砌抹红灰，砖缝、斑驳、水痕都要在。
    if (type === 'red') {
      const map = redWall(variant).clone();
      map.needsUpdate = true;
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      map.repeat.set(4, 2);
      const nrm = variantNormal('brick', variant);
      const rgh = variantRough('brick', variant);
      if (nrm) nrm.repeat.set(4, 2);
      if (rgh) rgh.repeat.set(4, 2);
      return new THREE.MeshStandardMaterial({
        map,
        normalMap: nrm || null,
        roughnessMap: rgh || null,
        normalScale: new THREE.Vector2(0.85, 0.85),
        color: tint || 0xffffff,
        roughness: 0.93,
      });
    }
    const map = brickWall().clone();
    map.needsUpdate = true;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(3, 2);
    return new THREE.MeshStandardMaterial({ map, roughness: 0.95 });
  });
}

/**
 * 墁砖地：官式院落里铺的方砖（比墙砖大、色偏灰）。
 * 带法线贴图，砖缝真的有起伏。
 */
/**
 * 墁砖地（官式院落地面）—— 按**真实米数**定贴图密度。
 *
 * ## 为什么不能用固定的 repeat
 *
 * 原来 `brickMaterial()` 写死 `repeat.set(10, 10)`，铺在 48m × 41m 的
 * 墁砖地平面上 ⇒ **一张贴图铺 4.8m**。而砖贴图本身是**墙面**贴图
 * （3 块砖 × 6 皮顺砌），于是地面上出现的是
 * **1.6m × 0.8m 的"巨石"** —— 近看就是一片乱石地，
 * 哪还有官式院落"墁砖"的规整。
 *
 * ## 密度基准
 *
 * 官式方砖（墁砖）的实际尺寸约 **0.5m 见方**。
 * 砖贴图每张含 3 块横向 ⇒ 一张贴图覆盖 1.5m。
 * 于是 repeat = 实际尺寸 / 1.5。
 *
 * @param {number} sizeX 铺装面 X 向尺寸（米）
 * @param {number} sizeZ 铺装面 Z 向尺寸（米）
 */
export function paveMaterial(sizeX, sizeZ) {
  const rx = Math.max(1, Math.round(sizeX / 1.5));
  const rz = Math.max(1, Math.round(sizeZ / 1.5));
  return make(`pave-${rx}x${rz}`, () => {
    const map = (variantTexture('brick', 0) || brickWall()).clone();
    map.needsUpdate = true;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(rx, rz);
    const nrm = variantNormal('brick', 0);
    if (nrm) nrm.repeat.set(rx, rz);
    return new THREE.MeshStandardMaterial({
      map,
      normalMap: nrm || null,
      normalScale: new THREE.Vector2(0.55, 0.55),
      color: 0xa9a49a,
      // 顶点色用来**打散贴图的重复感**（大尺度明暗/色偏），
      // 与地形用的是同一套办法。逐顶点调制，不改贴图、不加 draw call。
      vertexColors: true,
      roughness: 0.97,
    });
  });
}

/**
 * 御路 / 甬路的**石板**：每块石板是一块独立的**几何体**（有真实接缝），
 * 贴图只负责石面本身的颗粒与色差。
 *
 * 贴图 repeat = (1,1)：一张贴图正好铺满一块石板（1.15m × 0.53m），
 * 石与石之间的缝是几何留出来的，不是画出来的。
 */
export function flagstoneMaterial() {
  return make('flagstone', () => {
    const map = (variantTexture('stone', 0) || stone()).clone();
    map.needsUpdate = true;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(1, 1);
    const nrm = variantNormal('stone', 0);
    if (nrm) nrm.repeat.set(1, 1);
    return new THREE.MeshStandardMaterial({
      map,
      normalMap: nrm || null,
      normalScale: new THREE.Vector2(0.6, 0.6),
      color: 0x9d9a92,
      roughness: 0.95,
    });
  });
}

export function brickMaterial(variant = 0) {
  return make(`brick-pave-v${variant}`, () => {
    const map = (variantTexture('brick', variant) || brickWall()).clone();
    map.needsUpdate = true;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(10, 10);
    const nrm = variantNormal('brick', variant);
    if (nrm) nrm.repeat.set(10, 10);
    return new THREE.MeshStandardMaterial({
      map,
      normalMap: nrm || null,
      normalScale: new THREE.Vector2(0.7, 0.7),
      color: 0xa9a49a,
      roughness: 0.97,
    });
  });
}

/**
 * 望板：屋面之下的铺板，要**双面**——
 * 从廊下往上看，它就是头顶那片"天"。
 */
export function boardMaterial() {
  return make('board', () =>
    new THREE.MeshStandardMaterial({
      color: 0x6a5340,
      roughness: 0.92,
      side: THREE.DoubleSide,
    })
  );
}

export function woodMaterial(variant = 0) {
  return make(`wood-v${variant}`, () => {
    const map = (variantTexture('wood', variant) || wood()).clone();
    map.needsUpdate = true;
    // AI 生成的木纹贴图偏亮红，直接用像塑料；压一档更像旧漆
    return new THREE.MeshStandardMaterial({
      map,
      normalMap: variantNormal('wood', variant),
      normalScale: new THREE.Vector2(0.55, 0.55),
      color: 0x9d9189,
      roughness: 0.86,
    });
  });
}

/**
 * 槅扇的**格心**（棂条）。
 *
 * ⚠ **必须去掉 map**。
 *   棂条本身已经是**实体几何**（`parts/lattice.js → buildBubuJin`，
 *   一根根小方料拼出步步锦）。若再叠一张画着同样花纹的贴图，
 *   就会出现"图案印在图案上"，而且贴图花纹会**逐扇原样重复** ——
 *   这正是"浓的贴图感"的第二个来源。
 *   现在只给素漆色，棂条由几何自己说话，缝里透出背后的暗色门洞。
 */
export function latticeMaterial(kind = 'bubu') {
  return make(`lattice-${kind}`, () =>
    new THREE.MeshStandardMaterial({
      color: 0x6d4a3a, // 棂条：紫檀/栗色素木
      roughness: 0.72,
      metalness: 0.0,
      side: THREE.DoubleSide,
    })
  );
}

export function ceilingMaterial() {
  return make('ceiling', () => {
    const map = caoJing();
    map.repeat.set(2, 2);
    // 藻井是**朝下的**天花，只该从室内看得见。
    // 之前用 DoubleSide，屋面一旦有缺口，从高处俯视就露出一整片花纹天花，
    // 像在地上铺了一张地毯。
    return new THREE.MeshStandardMaterial({
      map,
      roughness: 0.7,
      side: THREE.FrontSide,
    });
  });
}

export function goldMaterial() {
  return make('gold', () =>
    new THREE.MeshStandardMaterial({ color: 0xd9b45a, roughness: 0.35, metalness: 0.65 })
  );
}

export function shanhuaMaterial() {
  return make('shanhua', () =>
    new THREE.MeshStandardMaterial({ color: 0x27535c, roughness: 0.78 })
  );
}

/**
 * 匾额：黑漆金字。
 * @param {string} [text] 匾文（空则纯漆地）
 */
export function plaqueMaterial(text = '', vertical = false) {
  return make(`plaque-${text}-${vertical ? 'v' : 'h'}`, () =>
    new THREE.MeshStandardMaterial({
      map: text ? plaqueBoard(text, vertical) : null,
      color: text ? 0xffffff : 0x1a1410,
      roughness: 0.42,
      metalness: 0.05,
    })
  );
}

/** 门窗洞内的暗色（殿内阴影） */
export function darkMaterial() {
  return make('dark', () =>
    new THREE.MeshStandardMaterial({ color: 0x241a14, roughness: 0.95 })
  );
}

/** 材质键 → 材质实例 的映射 */
export function materialFor(key, spec = {}) {
  // 瓦色键（'hui'|'huang'|'lv'…）→ 琉璃/灰瓦参数
  const tileSpec = TILE_COLORS[spec.tile] || null;
  const glazed = tileSpec ? tileSpec.glazed : !!spec.glazed;
  // 每景的瓦色可以微调（spec.tileColor）：同一等级的殿宇若瓦色完全一致，
  // 整个园子就像复制粘贴。材质按颜色缓存，合并又是按景做的，
  // 所以这样改**不增加 draw call**。
  const tileColor = spec.tileColor || (tileSpec ? tileSpec.color : spec.glazedColor || '#2f7a4a');
  const mat = materialForBase(key, spec, glazed, tileColor, tileSpec);
  // DEBUG（临时）：?mat=tile/wood/… 给某个材质桶染色，用来定位是哪一层几何
  // 注意：材质按**颜色**缓存，同一键可能有多个实例（每景瓦色不同），
  // 所以要把 cache 里该键的**所有实例**都染了，否则只染中一个。
  const dbg = new URLSearchParams(location.search).get('mat');
  if (dbg) {
    const C = {
      tile: 0xff00ff, wood: 0x00ffff, caihua: 0xffff00, column: 0xff8000,
      stone: 0x0080ff, ridge: 0x00ff80, board: 0xff2020, eave: 0x2020ff,
      dougong: 0xffa000, shanhua: 0xff00ff, ceiling: 0x00ff40,
    };
    if (dbg === key) {
      const c = C[key] ?? 0x00ff00;
      mat?.color?.setHex(c);
      if (mat?.emissive) {
        mat.emissive.setHex(c);
        mat.emissiveIntensity = 0.6;
      }
    }
    // 同时把所有缓存实例里 map 带该关键字的也染了
    for (const [ck, m] of cache) {
      if (!m?.color) continue;
      if (ck.startsWith(dbg) || ck.includes(`-${dbg}-`)) {
        const c = C[dbg] ?? 0x00ff00;
        m.color.setHex(c);
        if (m.emissive) {
          m.emissive.setHex(c);
          m.emissiveIntensity = 0.6;
        }
      }
    }
  }
  return mat;
}

function materialForBase(key, spec, glazed, tileColor, tileSpec) {
  switch (key) {
    case 'tile':
      return roofMaterial(glazed, tileColor);
    case 'ridge':
      // 琉璃瓦的脊与瓦同色相（只是更暗），灰瓦脊用深灰
      return ridgeMaterial(
        tileSpec
          ? new THREE.Color(tileSpec.color).multiplyScalar(0.72).getStyle()
          : '#6e7176'
      );
    case 'eave':
      return eaveMaterial();
    case 'finial':
      return goldMaterial();
    case 'stone':
      return stoneMaterial(spec.variant ?? 0);
    case 'column':
      return columnMaterial(spec.columnColor);
    case 'lacquer':
      return lacquerMaterial('red');
    case 'lacquerDark':
      return lacquerMaterial('black');
    case 'caihua':
      return caihuaMaterial(spec.caihua);
    case 'dougong':
      return dougongMaterial();
    case 'wall':
      return wallMaterial(spec.wallType, spec.wallColor, spec.variant ?? 0);
    case 'wood':
      return woodMaterial(spec.variant ?? 0);
    case 'board':
      return boardMaterial();
    case 'lattice':
      return latticeMaterial(spec.windowKind);
    case 'ceiling':
      return ceilingMaterial();
    case 'shanhua':
      return shanhuaMaterial();
    case 'dark':
      return darkMaterial();
    case 'plaque':
      return plaqueMaterial(spec.plaqueText || '', false);
    case 'couplet':
      return plaqueMaterial((spec.couplet || [])[0] || '', true);
    case 'couplet2':
      return plaqueMaterial((spec.couplet || [])[1] || '', true);
    default:
      return new THREE.MeshStandardMaterial({ color: 0x999999 });
  }
}

export function disposeMaterials() {
  for (const m of cache.values()) m.dispose?.();
  cache.clear();
}
