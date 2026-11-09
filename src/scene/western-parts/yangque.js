/**
 * 养雀笼 与 独立蓄水楼 —— 西洋楼景区缺失的两座。
 *
 * 考据（`data/research/architecture-notes.md` §5.2 / §5.5）：
 *
 * | 建筑 | 考据 |
 * |---|---|
 * | 养雀笼 | 「砖砌，立柱**汉白玉西洋番花石柱**，**孔雀绿琉璃瓦庑殿顶**，屋檐上安**露顶石栏杆**」；五间三进 |
 * | 独立蓄水楼 | 「屋顶四面斜坡，但**没有正脊**，取而代之是一个小小的平顶」—— 即 **盝顶** |
 *
 * 坐标：OSM 实测（公园官方标注），已并入 `data/guide-georef.json` 控制点表。
 *
 * ⚠ **层数未载**：养雀笼的考据只说「五间三进」（平面）与屋面做法，
 *   没说几层 ⇒ 按**单层**处理（不凭空加一层）。
 * ⚠ 独立蓄水楼的位置：考据说「谐奇趣西北」，而 OSM 实测点在泽兰堂一带，
 *   两者有出入 ⇒ 取**实测**（与本项目其它建筑的坐标来源一致），并在
 *   `architecture-notes.md §5.5` 记录这一分歧。
 */
import * as THREE from 'three';
import { buildHall } from './hall.js';

/* ------------------------------------------------------------------ 养雀笼 */

/**
 * 养雀笼：砖砌楼身 + 汉白玉西洋番花石柱 + 孔雀绿琉璃庑殿顶 + 露顶石栏杆。
 *
 * 形制按「五间三进」：面阔五间（每间约 3.8m ⇒ 19m），进深三间（约 12m）。
 */
export function buildYangQueLong(c, opts) {
  const { x, y, z, rotY = 0, ground = null } = opts;
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

/**
 * 独立蓄水楼：给喷泉区供水的小塔楼。
 *
 * 考据：「屋顶四面斜坡，但**没有正脊**，取而代之是一个小小的平顶」= **盝顶**。
 * 楼内「各有水井，上安轧水机」⇒ 塔身做成**方形的砖石井塔**。
 */
export function buildXuShuiLou(c, opts) {
  const { x, y, z, rotY = 0, ground = null } = opts;
  c.setTransform(x, y, z, rotY);

  const W = 6.6;
  const D = 6.6;
  const PLAT = 0.9;
  const L1H = 6.6; // 井塔（内有水井与轧水机）

  buildHall(c, {
    w: W,
    d: D,
    platform: { h: PLAT, out: 1.2, steps: true, rail: false },
    levels: [
      {
        h: L1H,
        mian: 1,
        w: W,
        d: D,
        wall: 'plaster',
        columnBucket: 'stone',
        windowY: 3.4,
        windowH: 1.5,
        carved: false,
      },
    ],
    // ⚠ 不走通用屋顶生成器：**盝顶**在通用生成器里只是"一块几乎平的板"，
    //   没有四面斜坡、也没有"顶上一个小平顶" —— 屋面直接是个敞口。
    roof: null,
    wallBucket: 'plaster',
    trimBucket: 'stone',
    columnBucket: 'stone',
  });

  /**
   * **盝顶**：四面斜坡、没有正脊，取而代之一个**小小的平顶**。
   *
   * 做法：四棱台（斜坡）+ 顶上一块小平顶板。
   * 四棱台用 4 段 CylinderGeometry 再转 45°（半径 = 边长 ÷ √2）。
   */
  {
    const eaveY = PLAT + L1H;
    const RW = W + 0.9; // 略出挑
    const RD = D + 0.9;
    const topW = 2.1;
    const topD = 2.1;
    const h = 1.45;

    // 四面斜坡（瓦面）
    const fr = new THREE.CylinderGeometry(
      Math.max(topW, topD) * 0.7071,
      Math.max(RW, RD) * 0.7071,
      h,
      4,
      1
    );
    fr.rotateY(Math.PI / 4);
    fr.translate(0, eaveY + h / 2, 0);
    c.add('tile-hui', fr);

    // 顶上那个小平顶（盝顶的特征）
    const cap = new THREE.BoxGeometry(topW + 0.26, 0.26, topD + 0.26);
    cap.translate(0, eaveY + h + 0.13, 0);
    c.add('tile-hui', cap);

    // 檐口一圈石线脚（把斜坡的底沿收住）
    const cor = new THREE.BoxGeometry(RW + 0.3, 0.24, RD + 0.3);
    cor.translate(0, eaveY - 0.12, 0);
    c.add('stone', cor);
  }
}
