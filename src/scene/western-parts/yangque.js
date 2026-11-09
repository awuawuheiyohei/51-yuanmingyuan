/**
 * 养雀笼 与 独立蓄水楼 —— 西洋楼景区缺失的两座。
 *
 * 考据（`data/research/architecture-notes.md` §5.2 / §5.5 / §5.7）：
 *
 * | 建筑 | 考据 |
 * |---|---|
 * | 养雀笼 | 「砖砌，立柱**汉白玉西洋番花石柱**，**孔雀绿琉璃瓦庑殿顶**，屋檐上安**露顶石栏杆**」；五间三进 |
 * | 独立蓄水楼 | 《圆明园志》「蓄水楼**五楹**，楼北并连，有**平台三楹**，**内为养水池**。楼内**上层东北角通水井**，上安**吸水机**，吸水于平台上池内，由地下铜管输至各喷水管」；「屋顶四面斜坡，但**没有正脊**，取而代之是一个小小的平顶」= **盝顶** |
 *
 * ## 坐标（2026-11-09 据第三方史料更新）
 *
 * - **养雀笼**：OSM 实测（公园官方标注 `tourism=attraction`），
 *   与考据「养雀笼东边是谐奇趣」相符 ⇒ 谐奇趣正西。
 * - **独立蓄水楼**：**图上读像素**（官方导览图现状上谐奇趣西北唯一的一座独立建筑，
 *   像素 4512,1318），依据三互证：
 *   ① 圆明园遗址公园官网谐奇趣页：「喷泉的供水楼在**谐奇趣西北**，称作蓄水楼」；
 *   ② 维基百科「西洋楼园林规划」自东向西的轴线序列：
 *      …方外观、谐奇趣、**养雀笼**、**蓄水楼**、万花阵和大水法、观水法…
 *      ⇒ 蓄水楼在**养雀笼以西**；
 *   ③ 现状图上该方位确有**唯一**的独立体量。
 *   ⚠ **这是推定锚点，不是实测** —— 官方导览图上蓄水楼**没有单体标注**。
 *   ⚠ OSM 的同名节点（`116.3055087, 40.0118965`，name:en = "Water Reservior for
 *   Fountains"）落在**方外观正东 151 m**（即谐奇趣东北 280 m），与上述三条
 *   方位证据**全部冲突**，且现状图上该处是草地林地、**无任何建筑** ⇒ **已否决**。
 *   详见 `architecture-notes.md` §5.7。
 *
 * ## 形制落实
 *
 * - **养雀笼**：五间三进 ⇒ 面阔 19 m、进深 12 m；砖砌抹粉红灰楼身、
 *   **汉白玉西洋番花石柱**、**孔雀绿琉璃瓦庑殿顶**、台基上**露顶石栏杆**。
 *   ⚠ **层数未载** ⇒ 按**单层**处理（不凭空加一层）。
 * - **独立蓄水楼**：**五楹**面阔（楹间 3.8 m，与谐奇趣下层七间同尺度）× 三楹进深，
 *   **二层**（下层 3.6 + 上层 3.4 m）；**楼北并连三楹平台**，台面与上层楼面同高，
 *   台上**石砌养水池**（露天，池壁 1.15 m）；
 *   楼内**上层东北角**一座**石砌井圈**（井水可见）与**辘轳吸水机**；
 *   屋面 **盝顶** —— 四面斜坡、无正脊、顶上一块小平顶。
 *   ⚠ **盝顶不能用通用屋顶生成器**：`type:'luding'` 只是"一块几乎平的板"
 *   （没有四面斜坡、也没有顶上那个平顶，屋面直接是个敞口）⇒ 这里**手工造四棱台**。
 *   ⚠ 瓦色**未载** ⇒ 按中式盝顶的常规取**灰瓦**（推定）。
 *   ⚠ 平台高度**未载** ⇒ 按"吸水机在**上层**、池水在**平台上**"的水力关系反推：
 *   池必须在吸水机之下或同高 ⇒ 平台台面 = 上层楼面（推定）。
 */
import * as THREE from 'three';
import { buildHall } from './hall.js';
import {
  box,
  boxAt,
  cyl,
  cylAt,
  lathe,
  balustrade,
  worldUV,
} from './kit.js';
import { tint } from './materials.js';

/* ------------------------------------------------------------------ 养雀笼 */

/**
 * 养雀笼：砖砌楼身 + 汉白玉西洋番花石柱 + 孔雀绿琉璃瓦庑殿顶 + 露顶石栏杆。
 *
 * 形制按「五间三进」：面阔五间（每间约 3.8m ⇒ 19m），进深三间（约 12m）。
 */
export function buildYangQueLong(c, opts) {
  const { x, y, z, rotY = 0 } = opts;
  c.setTransform(x, y, z, rotY);

  const W = 19.0; // 五间
  const D = 12.0; // 三进
  const PLAT = 1.5; // 台基高
  const L1H = 6.4; // 楼身高

  buildHall(c, {
    w: W,
    d: D,
    platform: { h: PLAT, out: 1.7, steps: true, rail: true },
    levels: [
      {
        h: L1H,
        mian: 5,
        w: W,
        d: D,
        wall: 'plaster',
        // 汉白玉西洋番花石柱
        columnBucket: 'ornate',
        windowY: 1.5,
        windowH: 3.4,
        carved: true,
      },
    ],
    roof: [
      {
        // 孔雀绿琉璃瓦庑殿顶（无正脊，庑殿即四面坡）
        width: W,
        depth: D,
        eaveY: PLAT + L1H,
        rise: 3.0,
        type: 'wudian',
        overhang: 1.7,
        tile: 'keque',
        ridge: 'keque',
        wallBucket: 'plaster',
      },
    ],
    wallBucket: 'plaster',
    trimBucket: 'ornate',
    columnBucket: 'ornate',
  });
}

/* ---------------------------------------------------------------- 蓄水楼 */

/** 楹间（米）—— 与谐奇趣下层七间（26.6 m ÷ 7 = 3.8 m）同尺度 */
const BAY = 3.8;

/**
 * **盝顶**：四面斜坡、**没有正脊**，取而代之一个**小小的平顶**。
 *
 * 做法（手工，不用通用屋顶生成器）：
 *   ① 四个梯形坡面（瓦面）—— 顶点直接摆，不经过旋转/镜像，
 *      免得三角形绕向翻转被背面剔除；
 *   ② 每坡沿**坡向**铺一排**筒瓦垄**（半埋的细圆筒）——
 *      「屋面要做成真瓦作」是本项目的硬要求，贴图不算；
 *   ③ 顶上盖一块**石平顶板**（盝顶的特征）。
 *
 * @param {number} rw 檐口宽（X）
 * @param {number} rd 檐口深（Z）
 * @param {number} tw 顶上平顶宽（X）
 * @param {number} td 顶上平顶深（Z）
 * @param {number} rh 坡高
 * @param {number} y0 檐口标高
 */
function buildLuDing(c, rw, rd, tw, td, rh, y0) {
  /* ---- ① 四个坡面 ---- */
  const pos = [];
  const quad = (a, b, cc, d) => {
    pos.push(...a, ...b, ...cc, ...a, ...cc, ...d);
  };
  // 南坡（+Z）：A→B→C 绕出来法线朝上朝外
  quad([-rw / 2, 0, rd / 2], [rw / 2, 0, rd / 2], [tw / 2, rh, td / 2], [-tw / 2, rh, td / 2]);
  // 北坡（-Z）：反序
  quad([-rw / 2, 0, -rd / 2], [-tw / 2, rh, -td / 2], [tw / 2, rh, -td / 2], [rw / 2, 0, -rd / 2]);
  // 东坡（+X）
  quad([rw / 2, 0, rd / 2], [rw / 2, 0, -rd / 2], [tw / 2, rh, -td / 2], [tw / 2, rh, td / 2]);
  // 西坡（-X）：反序
  quad([-rw / 2, 0, rd / 2], [-tw / 2, rh, td / 2], [-tw / 2, rh, -td / 2], [-rw / 2, 0, -rd / 2]);

  const slope = new THREE.BufferGeometry();
  slope.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  slope.computeVertexNormals();
  worldUV(slope);
  slope.translate(0, y0, 0);
  c.add('tile-hui', slope);

  /* ---- ② 筒瓦垄（沿坡向，半埋在坡面里） ---- */
  const sx = (rw - tw) / 2; // X 向水平进深
  const sz = (rd - td) / 2; // Z 向水平进深
  const az = Math.atan2(rh, sz); // 南北坡坡角
  const ax = Math.atan2(rh, sx); // 东西坡坡角
  const lz = Math.hypot(rh, sz);
  const lx = Math.hypot(rh, sx);
  const R = 0.145;

  /** 一坡的筒瓦垄：沿檐口方向均分 */
  const strips = (eaveLen, len, eavePoint, eaveDir, up, normal, spin) => {
    const n = Math.max(3, Math.round(eaveLen / 0.46));
    for (let i = 0; i < n; i++) {
      const u = -eaveLen / 2 + (eaveLen * (i + 0.5)) / n;
      const g = new THREE.CylinderGeometry(R, R, len, 6, 1, false);
      // 把圆柱的 +Y 轴转到"上坡方向"
      if (spin.x) g.rotateX(spin.x);
      if (spin.z) g.rotateZ(spin.z);
      g.translate(
        eavePoint[0] + eaveDir[0] * u + up[0] * (len / 2) + normal[0] * 0.05,
        eavePoint[1] + eaveDir[1] * u + up[1] * (len / 2) + normal[1] * 0.05,
        eavePoint[2] + eaveDir[2] * u + up[2] * (len / 2) + normal[2] * 0.05
      );
      c.add('tile-hui', g);
    }
  };

  // 南坡：上坡 (0, sin, -cos)，外法线 (0, cos, sin)，绕 X 转 (az - π/2)
  strips(
    rw, lz, [0, y0, rd / 2], [1, 0, 0],
    [0, Math.sin(az), -Math.cos(az)], [0, Math.cos(az), Math.sin(az)],
    { x: az - Math.PI / 2 }
  );
  // 北坡：上坡 (0, sin, cos)，外法线 (0, cos, -sin)，绕 X 转 (π/2 - az)
  strips(
    rw, lz, [0, y0, -rd / 2], [1, 0, 0],
    [0, Math.sin(az), Math.cos(az)], [0, Math.cos(az), -Math.sin(az)],
    { x: Math.PI / 2 - az }
  );
  // 东坡：上坡 (-sin, cos, 0)，外法线 (cos, sin, 0)，绕 Z 转 ax
  strips(
    rd, lx, [rw / 2, y0, 0], [0, 0, 1],
    [-Math.sin(ax), Math.cos(ax), 0], [Math.cos(ax), Math.sin(ax), 0],
    { z: ax }
  );
  // 西坡：上坡 (sin, cos, 0)，外法线 (-cos, sin, 0)，绕 Z 转 -ax
  strips(
    rd, lx, [-rw / 2, y0, 0], [0, 0, 1],
    [Math.sin(ax), Math.cos(ax), 0], [-Math.cos(ax), Math.sin(ax), 0],
    { z: -ax }
  );

  /* ---- ③ 顶上那块小平顶（石板） + 檐口石线脚 ---- */
  c.add('stone', boxAt(tw + 0.55, 0.3, td + 0.55, 0, y0 + rh + 0.15, 0));
  c.add('stone', boxAt(rw + 0.45, 0.28, rd + 0.45, 0, y0 - 0.14, 0));
}

/**
 * 独立蓄水楼：给喷泉区供水的塔楼。
 *
 * 考据：《圆明园志》「蓄水楼五楹，楼北并连，有平台三楹，内为养水池。
 * 楼内上层东北角通水井，上安吸水机，吸水于平台上池内，
 * 由地下铜管输至各喷水管」；屋顶「四面斜坡，但没有正脊，
 * 取而代之是一个小小的平顶」= 盝顶。
 */
export function buildXuShuiLou(c, opts) {
  const { x, y, z, rotY = 0 } = opts;
  c.setTransform(x, y, z, rotY);

  const W = BAY * 5; // 面阔五楹 = 19.0
  const D = BAY * 3; // 进深三楹 = 11.4
  const PLAT = 1.3; // 台基高
  const L1 = 3.6; // 下层高
  const L2 = 3.4; // 上层高
  const EAVE = PLAT + L1 + L2; // 8.30 盝顶檐口
  const FLOOR2 = PLAT + L1; // 4.90 上层楼面（井与吸水机所在）

  /* ------------------------------------------------------------ 楼身 */
  buildHall(c, {
    w: W,
    d: D,
    platform: { h: PLAT, out: 1.6, steps: true, rail: true },
    levels: [
      {
        h: L1,
        mian: 5,
        w: W,
        d: D,
        wall: 'plaster',
        columnBucket: 'stone',
        windowY: 1.05,
        windowH: 2.3,
        carved: true,
        dougong: false, // 盝顶没有斗栱
      },
      {
        h: L2,
        mian: 5,
        w: W,
        d: D,
        wall: 'plaster',
        columnBucket: 'stone',
        windowY: 0.95,
        windowH: 2.0,
        carved: true,
        dougong: false,
        door: false, // 上层不开门（门在下层，正对平台）
      },
    ],
    roof: null, // 盝顶单独造
    wallBucket: 'plaster',
    trimBucket: 'stone',
    columnBucket: 'stone',
  });

  /* ------------------------------------------- 楼北并连的平台（三楹） */
  // 平台台面**与台基齐平**（1.3 m）—— 下层北面的门正好开在平台上；
  // 台上做一座**露天石砌养水池**（「吸水于平台上池内」）。
  const PW = BAY * 3; // 平台宽 11.4
  const PD = BAY * 2; // 平台进深 7.6
  const PZ0 = -(D / 2 + 1.6); // 与台基北棱相接 = -7.3
  const PZC = PZ0 - PD / 2; // 台体中心
  const PZ1 = PZ0 - PD; // 台体北端 = -14.9
  const DECK = PLAT; // 平台台面

  // 台体：自地下（-3 m）砌到平台面
  c.add('stone', boxAt(PW, DECK + 3.0, PD, 0, (DECK - 3.0) / 2, PZC));
  // 台面挑出线脚
  c.add('stone', boxAt(PW + 0.5, 0.26, PD + 0.5, 0, DECK - 0.13, PZC));

  /* ------------------------------------------------------ 养水池（露天） */
  const POOL_W = 8.0;
  const POOL_D = 4.6;
  const WT = 0.55; // 池壁厚
  const WH = 1.4; // 池壁高
  const POOL_Z = PZ1 + 0.6 + POOL_D / 2;
  // 池底
  c.add('stone', boxAt(POOL_W, 0.24, POOL_D, 0, DECK + 0.12, POOL_Z));
  // 四壁
  c.add('stone', boxAt(POOL_W, WH, WT, 0, DECK + WH / 2, POOL_Z - POOL_D / 2 + WT / 2));
  c.add('stone', boxAt(POOL_W, WH, WT, 0, DECK + WH / 2, POOL_Z + POOL_D / 2 - WT / 2));
  c.add('stone', boxAt(WT, WH, POOL_D - WT * 2, -POOL_W / 2 + WT / 2, DECK + WH / 2, POOL_Z));
  c.add('stone', boxAt(WT, WH, POOL_D - WT * 2, POOL_W / 2 - WT / 2, DECK + WH / 2, POOL_Z));
  // 池壁压顶（四条，压在壁上而不是盖住池口）
  const CH = 0.16;
  c.add('stone', boxAt(POOL_W + 0.34, CH, WT + 0.34, 0, DECK + WH + CH / 2, POOL_Z - POOL_D / 2 + WT / 2));
  c.add('stone', boxAt(POOL_W + 0.34, CH, WT + 0.34, 0, DECK + WH + CH / 2, POOL_Z + POOL_D / 2 - WT / 2));
  c.add('stone', boxAt(WT + 0.34, CH, POOL_D - WT * 2, -POOL_W / 2 + WT / 2, DECK + WH + CH / 2, POOL_Z));
  c.add('stone', boxAt(WT + 0.34, CH, POOL_D - WT * 2, POOL_W / 2 - WT / 2, DECK + WH + CH / 2, POOL_Z));
  // 池水（压暗一点：平台上的静水不该像天空一样发白）
  c.add(
    'water',
    tint(boxAt(POOL_W - WT * 2, 0.06, POOL_D - WT * 2, 0, DECK + WH - 0.28, POOL_Z), 0x1d4a52)
  );

  /* ------------------------------------------------- 平台三面石栏杆 */
  {
    const rN = balustrade(PW - 0.5, 1.0);
    rN.translate(0, DECK, PZ1 + 0.32);
    c.add('stone', rN);
    for (const sx of [-1, 1]) {
      const r = balustrade(PD - 1.6, 1.0);
      r.rotateY(Math.PI / 2);
      r.translate(sx * (PW / 2 - 0.32), DECK, PZC);
      c.add('stone', r);
    }
  }

  /* ------------------------- 楼内上层东北角：井 + 辘轳吸水机（吸水机在室内） */
  {
    const WELL_X = W / 2 - 2.2;
    const WELL_Z = -D / 2 + 1.9;
    // 石井圈（车削剖面旋转成型：内壁 → 顶 → 外壁）
    const curb = lathe(
      [
        [0.8, 0],
        [0.8, 0.86],
        [1.2, 0.94],
        [1.2, 0],
      ],
      16
    );
    curb.translate(WELL_X, FLOOR2, WELL_Z);
    c.add('stone', curb);
    // 井水
    c.add('water', cylAt(0.78, 0.78, 0.05, WELL_X, FLOOR2 + 0.05, WELL_Z, 16));
    // 辘轳：两柱一轴
    for (const sz of [-1, 1]) {
      c.add('wood', boxAt(0.26, 2.1, 0.26, WELL_X, FLOOR2 + 1.05, WELL_Z + sz * 1.45));
    }
    const drum = cyl(0.17, 0.17, 2.4, 10);
    drum.rotateX(Math.PI / 2); // 轴沿 Z
    drum.translate(WELL_X, FLOOR2 + 2.0, WELL_Z);
    c.add('wood', drum);
    // 摇柄
    c.add('metal', boxAt(0.09, 0.52, 0.09, WELL_X + 0.26, FLOOR2 + 2.26, WELL_Z + 1.24));
    c.add('metal', cylAt(0.07, 0.07, 0.36, WELL_X + 0.44, FLOOR2 + 2.0, WELL_Z + 1.24, 8).rotateX(Math.PI / 2));
  }

  /* ------------------------------------------------------------ 盝顶 */
  buildLuDing(c, W + 1.8, D + 1.8, 3.2, 2.8, 1.75, EAVE);
}
