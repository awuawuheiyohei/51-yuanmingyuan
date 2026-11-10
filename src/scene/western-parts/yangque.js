/**
 * 养雀笼 与 独立蓄水楼 —— 西洋楼景区缺失的两座。
 *
 * 考据（`data/research/architecture-notes.md` §5.2 / §5.5 / §5.7）：
 *
 * | 建筑 | 考据 |
 * |---|---|
 * | 养雀笼 | 「**明间为穿堂门**，南北侧屋内笼养孔雀等鸟类」；「**西为中式牌楼**，**东为西洋宫门样式**」，「东门和西门外的左右**券窗下都设有小型喷水塔**」；「砖砌，立柱**汉白玉西洋番花石柱**，**孔雀绿琉璃瓦庑殿顶**，屋檐上安**露顶石栏杆**」；五间三进 |
 * | 独立蓄水楼 | 《圆明园志》「蓄水楼**五楹**，楼北并连，有**平台三楹**，**内为养水池**。楼内**上层东北角通水井**，上安**吸水机**，吸水于平台上池内，由地下铜管输至各喷水管」；「屋顶四面斜坡，但**没有正脊**，取而代之是一个小小的平顶」= **盝顶** |
 *
 * ## 坐标（2026-11-09 据第三方史料更新）
 *
 * 两处都**按导览图现状轮廓读像素**（属**推定**锚点，非实测）；
 * OSM 的两个同名节点已全部否决。详见 `architecture-notes.md` §5.5 / §5.8。
 *
 * - **养雀笼**：官方导览图现状上**谐奇趣与方外观之间**那组小建筑，像素 (4765,1236)
 *   —— 其中一座画着**门洞**（＝「明间为穿堂门」✓）。
 *   方位依据：官网·养雀笼「**位于谐奇趣东侧**」、360百科「方外观位于**养雀笼之东**」、
 *   百度百科「谐奇趣东侧，**蓄水楼东面**」⇒ 三条互证。
 *   ⚠ OSM 的同名节点（116.3019642,40.0115385）落在**谐奇趣西南臂的屋面上** ⇒ 否决。
 * - **独立蓄水楼**：官方导览图现状上**谐奇趣西北**唯一的一座独立小建筑，
 *   像素 (4512,1318)。方位依据：官网·谐奇趣「供水楼在**谐奇趣西北**」、
 *   百度百科「蓄水楼东面（是养雀笼）」⇒ 蓄水楼在养雀笼以西。
 *   ⚠ OSM 的同名节点（116.3055087,40.0118965，name:en = *Water Reservior for
 *   Fountains*）落在**方外观正东 151 m**（谐奇趣东北 280 m）的**草地上**、
 *   现状图上无任何建筑 ⇒ 否决。
 *
 * ⇒ 西→东：**蓄水楼 → 谐奇趣 → 养雀笼 → 方外观**。
 *
 * ## 形制落实
 *
 * - **养雀笼**（2026-11-09 重做）：它是**一座门**，不是一座封闭的楼 ——
 *   「明间为**穿堂门**」「**西为中式牌楼**，**东为西洋宫门样式**」
 *   「东门和西门外的左右**券窗下都设有小型喷水塔**」；
 *   五间三进 ⇒ 面阔 19 m × 进深 12 m，单层（层数未载 ⇒ 不凭空加层），
 *   砖砌抹粉红灰楼身 + **汉白玉西洋番花石柱** + **孔雀绿琉璃瓦庑殿顶** +
 *   台基上**露顶石栏杆**；**明间券洞前后贯通**（不装门扇），
 *   西面加冲天式**中式牌楼**、东面加**西洋宫门**壁柱与假门楣，
 *   两面券窗下各设**小型喷水塔**（石座 + 顶盆 + 铜喷口 + 水柱）。
 *   ⚠ 南北侧「屋内笼养孔雀」的**雀笼**尚未做（列为下一步）。
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
import { buildRoof } from '../buildings/parts/roof.js';
import { buildDougongSet } from '../buildings/parts/dougong.js';
import {
  box,
  boxAt,
  cyl,
  cylAt,
  lathe,
  balustrade,
  cornice,
  pilaster,
  columnCapital,
  falsePediment,
  jetBetween,
  worldUV,
} from './kit.js';
import { tint } from './materials.js';

/* ------------------------------------------------------------------ 养雀笼 */

/**
 * 养雀笼：**一座门**（不是一座封闭的楼）。
 *
 * 考据（官网·养雀笼 / 百度百科·养雀笼 / `WIKI`）：
 *
 * | 项 | 原文 | 落实 |
 * |---|---|---|
 * | 性质 | 「**明间为穿堂门**，南北侧屋内笼养孔雀等鸟类」；「实为通往**东部**西洋各景的入口处」 | 明间的券洞**前后贯通**（东西向穿堂），不装门扇、不加暗底 |
 * | 西面 | 「**西为中式牌楼**」 | 西立面做**冲天式中式牌楼**：汉白玉冲天柱 + 额枋 + 斗栱挑檐 + 孔雀绿琉璃小顶 |
 * | 东面 | 「**东为西洋宫门样式**」 | 东立面做**西洋宫门**：券洞两侧**壁柱** + 三角式假门楣 |
 * | 喷水塔 | 「东门和西门外的左右**券窗下都设有小型喷水塔**」 | 东西两面各左右一座，共 **4 座**石座喷水塔（石座 + 顶盆 + 水 + 铜管喷口） |
 * | 屋面 | 「砖砌，立柱**汉白玉西洋番花石柱**，**孔雀绿琉璃瓦庑殿顶**，屋檐上安**露顶石栏杆**」；五间三进 | 面阔 19 m（五间）× 进深 12 m（三进），单层，庑殿顶 + 台基露顶石栏杆 |
 *
 * ⚠ **朝向**：长边（面阔 19 m）沿**南北**、进深沿**东西** ——
 *   官网说「东西两面风格迥异」⇒ 东西两面都是**短边立面**；
 *   牌楼是长边（北面）… 嗯，等等 —— 准确地说：
 *   **局部 +Z 面 = 世界西面（牌楼）**，**局部 −Z 面 = 世界东面（宫门）**，
 *   **明间穿堂沿东西向**（与"通往东部西洋各景的入口"一致）。
 *   实现上把 `rotY` 设为 −π/2：局部 +Z（正面）朝西。
 */
export function buildYangQueLong(c, opts) {
  const { x, y, z, rotY = 0 } = opts;
  c.setTransform(x, y, z, rotY);

  const W = 19.0; // 五间（长边）
  const D = 12.0; // 三进（进深）
  const BAY = W / 5; // 3.8
  const PLAT = 1.5; // 台基高
  const L1H = 5.6; // 楼身高（单层）
  const EAVE = PLAT + L1H; // 7.10 庑殿顶檐口

  /* ------------------------------------------------------------ 楼身（门） */
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
        // 券窗抬高：给下方的**小型喷水塔**让出位置（塔顶 ≈ PLAT+2.16，窗台 PLAT+2.2）
        windowY: 2.2,
        windowH: 2.6,
        carved: true,
        // **明间穿堂**：门洞前后贯通，不装门扇
        portal: true,
        doorW: 0.8,
      },
    ],
    roof: [
      {
        // 孔雀绿琉璃瓦庑殿顶（无正脊，庑殿即四面坡）
        // ⚠ 出檐分向：**东西向**（长坡那边）只出 1.0 m ——
        //   西面要挂一座中式牌楼，出檐太深会把牌楼的小顶整个吞掉。
        width: W,
        depth: D,
        eaveY: EAVE,
        rise: 3.0,
        type: 'wudian',
        overhang: 1.0,
        overhangX: 1.7,
        tile: 'keque',
        ridge: 'keque',
        wallBucket: 'plaster',
      },
    ],
    wallBucket: 'plaster',
    trimBucket: 'ornate',
    columnBucket: 'ornate',
  });

  /* ------------------------------------ 西面（局部 +Z）：冲天式中式牌楼 */
  const PF_Z = D / 2 + 1.3; // 牌楼柱心（挑到主檐之外，免得小顶被檐口吞掉）
  const PF_COL = [-8.4, -2.6, 2.6, 8.4]; // 四柱（明间两侧 + 两端，避开喷水塔）
  const PF_TOP = PLAT + 4.2; // 额枋上皮
  {
    // 汉白玉冲天柱
    for (const cx of PF_COL) {
      const h = PF_TOP + 0.5 - PLAT;
      c.add('stone', boxAt(0.66, h, 0.66, cx, PLAT + h / 2, PF_Z));
      // 柱础（覆盆式的方础）
      c.add('stone', boxAt(1.0, 0.3, 1.0, cx, PLAT + 0.15, PF_Z));
    }
    // 额枋（通长）+ 上小额枋
    c.add('stone', boxAt(W - 1.0, 0.62, 0.52, 0, PF_TOP - 0.31, PF_Z));
    c.add('stone', boxAt(W - 3.0, 0.3, 0.44, 0, PF_TOP - 0.77, PF_Z));
    // 柱头斗栱（朝西出挑，檐下可见）
    for (const cx of PF_COL) {
      const dg = buildDougongSet(0.78, 'z');
      dg.rotateY(Math.PI); // 挑向 +Z（西）
      dg.translate(cx, PF_TOP - 0.42 - 1.3 * 0.78, PF_Z);
      c.add('dougong', dg);
    }
    // 牌楼小顶（悬山，孔雀绿琉璃）
    const rf = buildRoof({
      width: W - 1.0,
      depth: 2.4,
      eaveY: PF_TOP + 0.1,
      rise: 0.85,
      type: 'yingshan',
      overhang: 0.7,
      overhangX: 0.55,
      upturn: 0.45,
      bulge: 0.28,
    });
    for (const [k, list] of rf.geoms) {
      const bucket =
        k === 'tile' || k === 'ridge' || k === 'finial'
          ? 'tile-keque'
          : k === 'wood' || k === 'eave'
            ? 'wood'
            : k === 'board'
              ? 'board'
              : 'plaster';
      for (const g of list) {
        if (!g || !g.attributes?.position) continue;
        g.translate(0, 0, PF_Z);
        c.add(bucket, g);
      }
    }
  }

  /* ------------------------------------ 东面（局部 −Z）：西洋宫门立面 */
  {
    const DOOR_W = BAY * 0.8; // 明间券洞宽
    for (const sx of [-1, 1]) {
      // 壁柱（西洋宫门的典型做法）
      const p = pilaster(L1H - 0.35, 0.78, 0.36);
      p.translate(sx * (DOOR_W / 2 + 0.42), PLAT, -D / 2 - 0.16);
      c.add('stone', p);
      // 壁柱柱头
      const cap = columnCapital(0.34, { h: 0.46, order: 'composite' });
      cap.translate(sx * (DOOR_W / 2 + 0.42), PLAT + L1H - 0.5, -D / 2 - 0.16);
      c.add('stone', cap);
    }
    // 券洞上方的三角式假门楣（巴洛克）
    const ped = falsePediment(DOOR_W * 1.05, 1.25, 0.3);
    ped.rotateY(Math.PI);
    ped.translate(0, PLAT + L1H * 0.72 + 0.15, -D / 2 - 0.18);
    c.add('stone', ped);
    // 门楣线脚
    c.add('stone', cornice(DOOR_W + 2.0, 0.42, 0.3, -1).rotateY(Math.PI)
      .translate(0, PLAT + L1H * 0.72 + 0.12, -D / 2 - 0.14));
  }

  /* ------------- 南北侧「屋内笼养孔雀」：窗内的铜丝雀笼 -------------
   * 官网·养雀笼：「**南北侧室内笼展陈孔雀等鸟类**，因而得名养雀笼」
   * 百度百科：「明间为穿堂门，**南北侧屋内笼养孔雀等鸟类**」
   * ⇒ 南北两道侧墙的次间/梢间窗内，各挂一只**铜丝笼**。
   * ⚠ 孔雀本身**未建模**（列为下一步）。
   */
  {
    const WALL_T = 0.62; // 与 hall.js 的墙厚一致
    const cageX = W / 2 - WALL_T - 0.34; // 笼子挂在墙内侧
    const cageZ = [-(D - WALL_T * 2) / 3, (D - WALL_T * 2) / 3]; // 侧墙两端的窗（中间那扇对着穿堂）
    const CW = 1.35; // 笼宽（顺墙）
    const CH = 1.5; // 笼高
    const CD = 0.55; // 笼深
    for (const sx of [1, -1]) {
      for (const cz of cageZ) {
        const cx = sx * cageX;
        const y0 = PLAT + 1.1; // 笼底（略高于窗台 PLAT+2.2 之下沿）
        // 外框：底 / 顶 / 两侧
        c.add('metal', boxAt(CD, 0.06, CW, cx, y0, cz));
        c.add('metal', boxAt(CD, 0.06, CW, cx, y0 + CH, cz));
        for (const sz of [-1, 1]) {
          c.add('metal', boxAt(CD, CH, 0.06, cx, y0 + CH / 2, cz + (sz * CW) / 2));
        }
        // 正面铜丝网：7 根竖条 + 4 根横条
        const fx = cx + sx * (CD / 2 - 0.05);
        for (let i = 0; i <= 6; i++) {
          c.add('metal', boxAt(0.04, CH, 0.04, fx, y0 + CH / 2, cz - CW / 2 + (CW * i) / 6));
        }
        for (let j = 1; j < 5; j++) {
          c.add('metal', boxAt(0.04, 0.04, CW, fx, y0 + (CH * j) / 5, cz));
        }
        // 栖木
        c.add('wood', cylAt(0.045, 0.045, CW * 0.78, cx, y0 + CH * 0.45, cz, 8).rotateX(Math.PI / 2));
      }
    }
  }

  /* ------------------- 券窗下的小型喷水塔（东西两面各左右一座，共 4 座） */
  // 「东门和西门外的左右**券窗下**都设有小型喷水塔」
  // ⇒ 塔就立在**券窗正下方、贴着墙**，台面上起，高不过窗台（PLAT+1.5）。
  for (const sz of [1, -1]) {
    for (const sx of [-1, 1]) {
      const tx = sx * BAY; // 券窗正中（明间左右两侧的那两跨）
      const tz = sz * (D / 2 + 0.78); // 贴墙
      // 石座（落在台面上）
      c.add('stone', boxAt(0.9, 1.7, 0.9, tx, PLAT + 0.85, tz));
      // 座顶线脚
      c.add('stone', boxAt(1.12, 0.14, 1.12, tx, PLAT + 1.75, tz));
      // 顶盆（车削剖面旋转成型）
      const bowl = lathe(
        [
          [0.5, 0],
          [0.5, 0.26],
          [0.43, 0.34],
          [0.43, 0.08],
          [0.0, 0.08],
        ],
        14
      );
      bowl.translate(tx, PLAT + 1.82, tz);
      c.add('stone', bowl);
      // 盆里的水
      c.add('water', cylAt(0.41, 0.41, 0.04, tx, PLAT + 2.04, tz, 14));
      // 铜喷口（从盆沿探出的一截铜管）+ 落到盆里的水柱
      c.add(
        'metal',
        cylAt(0.075, 0.075, 0.6, tx, PLAT + 2.16, tz + sz * 0.42, 8).rotateX(sz * 1.05)
      );
      c.add(
        'water',
        jetBetween(
          [tx, PLAT + 2.04, tz + sz * 0.54],
          [tx, PLAT + 1.9, tz],
          0.04
        )
      );
    }
  }
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
