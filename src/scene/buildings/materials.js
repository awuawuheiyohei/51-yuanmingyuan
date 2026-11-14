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
  paveBrick,
  redBrick,
  stone,
  stoneFace,
  wood,
  caoJing,
  latticeWindow,
  plaqueBoard,
  windowPaper,
} from './textures.js';
import { TILE_COLORS } from '../scenes-program.js';
import { applyTriplanar } from '../triplanar.js';

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

/**
 * 檐椽 / 飞椽（椽头）。
 *
 * ⚠ 原来用**裸木色** 0x6b5a48 ⇒ 檐下一排褐色小方块，
 *   和望板连成一大片**土黄带**（从下往上看整条檐口像块木板）。
 *   清式官式建筑的檐下是**施彩画**的：椽头刷石绿、留白圈，
 *   整条檐口读作青绿带，不是木头色。
 */
export function eaveMaterial() {
  return make('eave', () =>
    new THREE.MeshStandardMaterial({ color: 0x5d6b50, roughness: 0.86 })
  );
}

/**
 * 官式建筑的石材（须弥座、条石、栏杆、柱础）。
 *
 * 用**程序化素石面**而不是 AI 生成的那张"西洋番花浮雕石"——
 * 后者是给西洋楼用的，给中式须弥座贴上巴洛克卷草，一眼就串味。
 *
 * ⚠⚠ **也不再用 AI 的 `stone.png`**：
 *   那是一张**切割石板照片**，板缝是**纯白的高光**。
 *   贴到须弥座上就是两道发亮的白线，贴到御路石板上就是一张白网格。
 *   真实石缝是灰浆（暗线），不是发光的白线。
 *   → 改用 `stoneFace()`：**一根缝都不画**，缝交给几何。
 *
 * **三平面投影**：石构件的 UV 是 0~1 铺在整块料上的（须弥座、台基都没做
 * 按米数细分），平面 UV 会被拉成"长条"。世界空间三平面投影让**所有石构件
 * 的纹理密度一致**（1 个周期 = 1.5m），也不会有接缝。
 */
export function stoneMaterial(variant = 0) {
  return make(`stone-v${variant}`, () => {
    // blobScale 0.65：大构件也要收着点，斑太重会读成"迷彩"
    const map = stoneFace('#a9a49b', 0.2).clone();
    map.needsUpdate = true;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    const mat = new THREE.MeshStandardMaterial({
      map,
      // 石作压一档：汉白玉/青石在日光下会发白，太亮就读成"塑料"。
      color: 0xaca89f,
      roughness: 1,
      metalness: 0,
    });
    // 周期 1.0m：须弥座是**细琢**的，斑不能大到 50cm（那就成脏混凝土了）
    return applyTriplanar(mat, { scale: 1 / 1.0 });
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
      roughness: kind === 'black' ? 0.42 : 0.36,
      metalness: 0.05,
      // ⚠ 黑漆不能是**死黑**：裙板/绦环板多在阴影里，
      //   纯黑 + 无光 ⇒ 近看就是一块挖空的黑洞。
      //   给一点极弱的暖自发光，把漆面提起来（清式黑漆是深褐带漆光，不是纯黑）。
      emissive: kind === 'black' ? 0x140f0b : 0x140806,
      emissiveIntensity: kind === 'black' ? 0.9 : 0.35,
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
  return make('dougong', () => {
    // ⚠ 主体色**不能太深**：斗栱整个处在檐下阴影里，
    //   太深 ⇒ 拱身、升、斗全糊成一团黑，只剩亮色的勾头浮着。
    //   略提亮 + 降粗糙度，让阴影里也还有层次。
    const mat = new THREE.MeshStandardMaterial({
      color: 0x35707a,
      roughness: 0.62,
      metalness: 0.05,
    });
    /**
     * ⚠ 檐下只有**天光**（IBL），没有直射太阳 ⇒ 斗栱整体落在阴影里，
     *   纯靠漫反射就是一条**黑带**，"一攒一攒"完全读不出来。
     *   给一点极弱的**青绿自发光**（相当于环境光在青绿漆面上的回光），
     *   阴影里能看出层次，阳光下也不会发光。
     */
    mat.emissive = new THREE.Color(0x123c42);
    mat.emissiveIntensity = 0.55;
    return mat;
  });
}

/**
 * 斗栱的**勾头线脚**（昂嘴 / 卷杀 / 蚂蚱头 / 勾头）。
 *
 * 清式官式建筑里这一档施**沥粉贴金 / 白粉** —— 是檐下唯一的亮色。
 * 混进斗栱主体色时，"一攒一攒"的轮廓在檐下阴影里糊成一条黑带，
 * 远看完全读不出斗栱的节奏（这是"看着假"的一大来源）。
 */
export function dougongTrimMaterial() {
  return make('dougongTrim', () => {
    // ⚠ 用**暖金**而不是纯白：清式勾头线脚是**沥粉贴金**，
    //   纯白在青绿底上像一条白布带；暖金才像描金的线脚。
    const mat = new THREE.MeshStandardMaterial({
      color: 0xe0c98c,
      roughness: 0.48,
      metalness: 0.2,
    });
    // 同上：檐下阴影里，沥粉贴金的线脚必须**自己发一点光**，
    // 否则整排斗栱退化成一条黑带（"一攒一攒"读不出来）。
    mat.emissive = new THREE.Color(0x4a3a14);
    mat.emissiveIntensity = 0.85;
    return mat;
  });
}

export function wallMaterial(type = 'brick', tint = null, variant = 0) {
  return make(`wall-${type}-${tint || 'd'}-v${variant}`, () => {
    // 红墙不是一块纯色板：清代官墙是砖砌抹红灰，砖缝、斑驳、水痕都要在。
    if (type === 'red') {
      // 抹红灰砖墙用**网格已知**的程序化贴图（8 皮 × 4 块 = 1.6m），
      // AI 那张的砖块大小不可控 ⇒ 砖的真实尺寸定不下来。
      const map = redBrick().clone();
      map.needsUpdate = true;
      map.wrapS = map.wrapT = THREE.RepeatWrapping;
      // ⚠ repeat 归 (1,1)：**砖的真实尺寸由几何的 UV 决定**
      //   （`structure.js → scaleBoxUV`，一张贴图 = 3.2m）。
      //   材质上再乘 repeat 就会把砖缩到 0.16m 见方，远看是马赛克不是砖墙。
      map.repeat.set(1, 1);
      const rgh = variantRough('brick', variant);
      if (rgh) rgh.repeat.set(1, 1);
      return new THREE.MeshStandardMaterial({
        map,
        // ⚠ **不挂 normalMap**。
        //   AI 那张砖法线是"细密斜向拉丝"，挂上去每块砖都变成**皱纹皮革**。
        //   抹红灰墙的砖面本来就是抹过灰的、**平滑**的 ——
        //   凹凸只该出现在砖缝（缝的明暗已经在 map 里了）。
        roughnessMap: rgh || null,
        color: tint || 0xffffff,
        // ⚠ 顶点色是**逐顶点调制**（抹灰不匀、风化），
        //   用来打散砖贴图 3.2m 周期的重复感。值是**乘在贴图上的系数**。
        vertexColors: true,
        roughness: 0.93,
      });
    }
    const map = brickWall().clone();
    map.needsUpdate = true;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    // 同红墙：砖的尺寸由几何 UV 决定（一张贴图 = 3.2m），材质不再缩放
    map.repeat.set(1, 1);
    return new THREE.MeshStandardMaterial({
      map,
      vertexColors: true,
      roughness: 0.95,
    });
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
export function paveMaterial() {
  /**
   * 墁砖地材质。
   *
   * ⚠ **不再设 repeat** —— 几何已经是**逐块独立方砖**，
   *   每块的 UV 直接对到贴图里**不同的一块**（见 `layout.js`）。
   *   如果这里再叠 repeat，就会二次缩放，砖的尺寸立刻错掉。
   *
   * ⚠ 因此所有院子的墁砖地**共用一个材质实例** ⇒ **不增加 draw call**。
   */
  return make('pave', () => {
    const map = paveBrick().clone();
    map.needsUpdate = true;
    map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
    map.repeat.set(1, 1);
    return new THREE.MeshStandardMaterial({
      map,
      // 墁砖是**青灰**的，不是一块白地砖。固有色压到 0x8b877f，
      // 否则阳光下整片地泛白，像浴室瓷砖。
      color: 0x8b877f,
      // 逐砖的明暗/色偏（调制系数，接近 1 的浅色）——
      // 这是打散"一张贴图铺满全院"重复感的主力。
      // ⚠ 幅度必须小（±4%）：大了就成"花地毯/棋盘格"，
      //   一眼看出地上贴了张贴图。
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
 *
 * ⚠ 逐块石板会取**贴图里不同的区域**（见 layout.js 的 UV 偏移），
 *   否则一排石板是同一张图反复贴，一眼看出复制粘贴。
 * ⚠ 逐块石板还有独立的**明暗**（顶点色），真实石板是分块加工的，
 *   不会块块一样亮。
 */
export function flagstoneMaterial() {
  return make('flagstone', () => {
    // ⚠ blobScale 0：石板路要**均匀细石**。
    //   大块色差（哪怕只剩 0.3）在 0.6m 的贴图周期下也有 4~20cm，
    //   铺成一条路就是一片"迷彩" ⇒ 石板路**不要大斑**，靠几何接缝分块。
    const map = stoneFace('#a5a199', 0).clone();
    map.needsUpdate = true;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    /**
     * ⚠⚠ **必须三平面（世界空间），不能用几何 UV**。
     *
     * 每块石板是一块独立几何体，UV 是 0~1 铺满整块 ⇒
     * **每块石板上都是同一张图、同一个起手式** ⇒ 一条御路读作
     * **印刷棋盘格**（`/tmp/T_YARD3.png` 的中缝）。
     * UV 偏移只能挪动图案位置，改不了"图案本身重复"。
     *
     * 世界空间三平面 ⇒ 石面连续、每块只露出图案的一小段，
     * **分块由几何接缝来表达**（这也才是真石板的样子）。
     */
    const mat = new THREE.MeshStandardMaterial({
      map,
      // 逐块石板的明暗差（顶点色）：分块加工的石头不会块块一样亮
      vertexColors: true,
      color: 0x948f86,
      roughness: 0.95,
    });
    // 周期 0.35m：石面颗粒（点凿）尺度对得上真实细凿石，
    // 又远小于石板尺寸（0.53m 宽），板与板的图案不会对上。
    return applyTriplanar(mat, { scale: 1 / 0.35 });
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
      // ⚠ 不是裸木色：望板是**施彩画的檐底**（清式连檐刷青绿），
      //   用木头色 ⇒ 从廊下往上看是一大片土黄板，像没上漆。
      color: 0x4c5c4d,
      roughness: 0.9,
      side: THREE.DoubleSide,
    })
  );
}

export function woodMaterial(variant = 0) {
  return make(`wood-v${variant}`, () => {
    /**
     * ⚠⚠ **不用 AI 的 `wood.png`**。
     *
     * 那是一张**雕花木门照片**（AGENTS.md §4.1.1 记过：贴到柱子上就是
     * "柱上画了半扇门"）。而这个桶装的是**檩、梁、桁架、门楣** ——
     * 这些构件在檐下**露在外面**，用那张照片 ⇒ 屋架渲成一片**红彤彤的
     * 雕花格子**，像挂了红灯笼，比裸木还假。
     *
     * 清式官式建筑檐下露出的梁架是**施彩画的**（青绿/沥粉），
     * 所以这里用程序化木纹 + 青灰漆色。
     */
    const map = wood().clone();
    map.needsUpdate = true;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(3, 3);
    return new THREE.MeshStandardMaterial({
      map,
      // 青灰漆：檐下梁架是施彩画的，不是裸木
      color: 0x6f7a68,
      roughness: 0.88,
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
  return make(`lattice-${kind}`, () => {
    // ⚠ 棂条应当与**框料同色（朱红漆）**。
    //   清式槅扇的标准配色是：朱红框料 + 朱红棂条 + 黑漆裙板/绦环板。
    //   原来棂条做成紫檀素木色，和朱红框料并排时像"两件不同东西拼的"。
    const map = lacquer('#9e2f27', 5).clone();
    map.needsUpdate = true;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(1, 1);
    return new THREE.MeshStandardMaterial({
      map,
      color: 0xffffff,
      roughness: 0.45,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
  });
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

/**
 * 山花（歇山山尖的三角板）。
 *
 * ⚠⚠ 原来只有**一个纯色** 0x27535c（没有任何贴图）⇒ 每座歇山殿的山头
 *   都挂着一块**死板的青色平面**，近看就是"贴了张色板"。
 *   清式山花施**彩画**（旋子/和玺），这里直接用彩画贴图。
 */
export function shanhuaMaterial() {
  return make('shanhua', () => {
    const map = caihua('xuanzi').clone();
    map.needsUpdate = true;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    return new THREE.MeshStandardMaterial({
      map,
      // 压成青绿底：山花的彩画以石青/石绿为主
      color: 0x9fc4c6,
      roughness: 0.78,
    });
  });
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
    // 殿内是暗的，但**不是死黑**：给它一点暖褐，
    // 免得从门洞看进去像一块挖空的黑洞。
    new THREE.MeshStandardMaterial({
      color: 0x2c2119,
      emissive: 0x120c07,
      emissiveIntensity: 0.5,
      roughness: 0.95,
    })
  );
}

/**
 * **窗纸** —— 格心背后裱的那层纸。
 *
 * 清式官式建筑的槅扇、槛窗都是**裱纸窗**：棂条在前、纸在后。
 * 白天纸比暗室内亮得多，远看成一片暖黄 ⇒ 立面立刻"活"起来。
 *
 * ⚠ 用**自发光**模拟背光：室内没有光源，纯靠外部照明的话，
 *   纸窗会和周围一样暗，等于没做。
 */
export function paperMaterial() {
  return make('paper', () => {
    // ⚠ 纯色纸近看像"贴了张色卡" ⇒ 加一层**纸纤维**纹理。
    const map = windowPaper().clone();
    map.needsUpdate = true;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(7, 7);   // 纤维要细：repeat 太小 ⇒ 看着像麻布
    //
    // ⚠⚠ **棂心背板必须压暗、且不能自发光**（2026-11-14）。
    //
    //   原来：color 0xe2d2a8（linear ≈ 0.72）+ emissive 0x55461f / 0.3
    //   ⇒ 棂心在**日光下自己发光**，比朱红棂条还亮，
    //   整片立面读作"一张米黄色的方格纸"（AGENTS 的坑表里
    //   「每栋殿的彩画带一模一样」「格心的步步锦像贴图」，
    //   真凶其实是**背板太亮**，把实体棂条的立体感全吃掉了）。
    //
    //   真实槅扇：背板后面是**暗的殿内**，只有天光透过绢纱 ⇒
    //   棂心是一块**偏暗的暖色**，朱红棂条在其上清清楚楚地浮出来。
    return new THREE.MeshStandardMaterial({
      map,
      // 中性偏暖的暗色（不要发绿：绢纱在暗殿里是灰暖的，不是橄榄绿）
      color: 0x5f574a,
      // 绢纱透一点天光，但**不能发光** —— 自发光会让它在正午也亮成一张白纸
      emissive: 0x241c0d,
      emissiveIntensity: 0.06,
      roughness: 0.95,
      metalness: 0,
      side: THREE.DoubleSide,
    });
  });
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
      dougongTrim: 0x00ffff,
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
    case 'gold':
      return goldMaterial();
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
    case 'dougongTrim':
      return dougongTrimMaterial();
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
    case 'paper':
      return paperMaterial();
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
