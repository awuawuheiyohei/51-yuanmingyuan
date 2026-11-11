#!/usr/bin/env node
/**
 * **导览图配准：补控制点 + 最小二乘重拟合**
 *
 * ## 配准的基本规矩（别搞反）
 *
 * 一个点要进**控制点表**，它的「像素」和「经纬度」必须**各自独立取得**：
 * 像素是**在图上读出来的**，经纬度是**实测的**。
 * 反过来（拿经纬度反解像素）得到的点**不构成约束** ——
 * 它本来就落在旧直线上，拟合它等于没拟合（见下面的"诚实说明"）。
 *
 * 所以本脚本分两类处理：
 *
 * | 类 | 像素来源 | 经纬度来源 | 放哪 |
 * |---|---|---|---|
 * | 四十景（24 个） | 图上读标注文字位置 | OSM 实测 | `controlPoints`（真约束） |
 * | 养雀笼 | **图上读现状轮廓** | 由拟合变换给出 | `readPoints`（不是约束） |
 * | 蓄水楼 | **图上读现状轮廓** | 由拟合变换给出 | `readPoints`（不是约束） |
 *
 * ## 养雀笼 / 蓄水楼为什么改成"图上读"（2026-11-09 第三方史料核对后）
 *
 * 官方导览图（10016×5197）是**现状图**，西洋楼一带只标了「西洋楼遗址」一个总名，
 * 这两处**没有单体标注** ⇒ 只能读现状轮廓，不能读标注文字。
 *
 * ### 第三方史料（互相印证）
 *
 * - **圆明园遗址公园官网·养雀笼**：「位于**谐奇趣东侧**，实为通往东部西洋各景的
 *   入口处，**西为中式牌楼，东为西洋宫门样式**，东门和西门外的左右**券窗下都设有
 *   小型喷水塔**」；「南北侧室内笼展陈孔雀等鸟类」。
 * - **360百科·方外观**：「方外观位于**养雀笼之东**」。
 * - **百度百科·养雀笼**：「谐奇趣东侧，**蓄水楼东面**」；「黄花阵（万花阵）广场东侧」。
 * - **圆明园遗址公园官网·谐奇趣**：「喷泉的**供水楼在谐奇趣西北**，称作**蓄水楼**」；
 *   《圆明园志》（搜狗/中文百科转载）：「楼西北方建有蓄水楼。蓄水楼五楹，楼北并连，
 *   有平台三楹，内为养水池。楼内上层东北角通水井，上安吸水机」。
 * - **国家文物局**（2016-10-10《圆明园海晏堂蓄水楼遗址完成考古发掘与资料整理》）：
 *   海晏堂景区的供水塔是**工字形**（南北十三间、东西两端二层水车房、中部"锡海"），
 *   **西为十一间楼**、其前即十二生肖喷泉，**东**面盘旋楼梯门外有路通往
 *   **海晏堂东部的大水法**景区；配图可见其现状只剩**倒四棱台形夯土台基**、
 *   **没有屋顶**。⇒ **与谐奇趣那座盝顶五楹楼不是同一栋**（此前被混为一谈）。
 *
 * ⇒ 西→东的次序：**蓄水楼 → 谐奇趣 → 养雀笼 → 方外观**，
 *   四条方位证据（官网×2、360百科、百度百科）全部成立。
 *
 * ⚠ **OSM 的两个同名节点都已否决**：
 *   - `蓄水楼 116.3055087, 40.0118965`（name:en = "Water Reservior for Fountains"）
 *     落在**方外观正东 151 m**（与方外观几乎同纬度），即谐奇趣**东北** 280 m，
 *     与上面全部方位证据冲突；且在官方现状图上该处是**草地与林地，没有任何建筑**。
 *   - `养雀笼 116.3019642, 40.0115385` 落在**谐奇趣西南臂的屋面上**（导览图上
 *     谐奇趣的轮廓覆盖该点）—— 不可能是一座独立建筑。
 *   ⇒ 本项目原先记的「养雀笼东边是谐奇趣」是**读反了**：官网原文是
 *     「养雀笼**位于谐奇趣东侧**」，意思正好相反。
 *
 * ⚠ **维基百科那条轴线序列不可用**：§三 引的
 *   「自东向西依次为：线法墙、方河、线法山、远瀛观（中轴）、海晏堂、方外观、
 *   谐奇趣、养雀笼、蓄水楼、万花阵和大水法、观水法」
 *   与官方导览图**自相矛盾**（它把大水法排到最西端、把方外观排在谐奇趣西侧，
 *   而导览图上恰恰相反）⇒ 顺序不可采信，只有「方外观、谐奇趣」这些**并列成员**
 *   本身可用。
 *
 * ### 现在的锚点（都是"图上读现状轮廓"，属**推定**而非实测）
 *
 * | 建筑 | 像素 | 图上的样子 | 方位自检 |
 * |---|---|---|---|
 * | 蓄水楼 | (4512, 1318) | 谐奇趣西北唯一的一座独立小建筑 | 谐奇趣西北 ✓、养雀笼以西 ✓ |
 * | 养雀笼 | (4765, 1236) | 谐奇趣与方外观之间那组小建筑，其中一座画着**门洞**（穿堂门 ✓） | 谐奇趣东侧 ✓、方外观之西 ✓、蓄水楼东面 ✓ |
 *
 * 考证依据见 `data/research/architecture-notes.md` §5.7。
 *
 * 用法：node scripts/regeoref.mjs [--dry]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(root, 'data/guide-georef.json');
const dry = process.argv.includes('--dry');

const geo = JSON.parse(fs.readFileSync(FILE, 'utf8'));

/**
 * **已作废的读点名**（改名/删除后要在这里清掉，否则会残留在 readPoints 里）。
 * 2026-11-11：「同天深处」作废 —— 四十景里没有它，是蓬岛瑶台注记的误抄，
 * 正名为「洞天深处」（在勤政亲贤以东，不在福海中央）。
 */
const RETIRED_POINTS = ['同天深处'];

/* --------------------------------------------------- 控制点：OSM 实测坐标 */
/* （原先这里放的是「养雀笼 / 蓄水楼」两个 OSM 点，现已全部否决，见下。） */
const NEW_POINTS = [];

/* --------------------------------- 图上读像素的点（不是拟合约束，只记录位置） */
const GUIDE_POINTS = [
  {
    name: '方壶胜境建筑群',
    x: 4264,
    y: 1280,
    note:
      '导览图上「方壶胜境」标注**南侧**那组粉色建筑轮廓的中心（标注本身压在庭院空处，' +
      '不在任何建筑上）。⚠ 推定锚点。详见 architecture-notes.md §5.8',
  },
  {
    name: '洞天深处',
    x: 3184,
    y: 3470,
    note:
      '导览图上「洞天深处 Dongtian Shenchu」的标注（**勤政亲贤以东**，' +
      '标注旁画着四座方形院落）。依据：百度百科四十景「洞天深处，位于勤政亲贤以东，' +
      '有四座方形院落，为皇子读书居住之所。东北为皇家画馆如意馆」。' +
      '⚠ 2026-11-11 正名：原条目叫「同天深处」，是蓬岛瑶台注记的误抄。' +
      '详见 architecture-notes.md §5.9',
  },
  {
    name: '蓄水楼',
    x: 4512,
    y: 1318,
    note:
      '导览图现状上谐奇趣西北唯一的一座独立小建筑（残存轮廓中心）。' +
      '依据：官网「喷泉的供水楼在谐奇趣西北」+《圆明园志》五楹/盝顶 + ' +
      '百度百科「养雀笼…蓄水楼东面」⇒ 蓄水楼在养雀笼以西。' +
      '⚠ 推定锚点，非实测；OSM 同名节点（方外观正东 151m、现状图上无建筑）已否决。' +
      '详见 architecture-notes.md §5.7',
  },
  {
    name: '养雀笼',
    x: 4765,
    y: 1236,
    note:
      '导览图现状上谐奇趣与方外观之间那组小建筑（其中一座画着门洞 = 穿堂门，' +
      '与「明间为穿堂门」相符）。依据：官网养雀笼页「位于谐奇趣东侧」、' +
      '360百科「方外观位于养雀笼之东」、百度百科「谐奇趣东侧，蓄水楼东面」。' +
      '⚠ 推定锚点，非实测；OSM 同名节点（落在谐奇趣西南臂上）已否决。' +
      '详见 architecture-notes.md §5.7',
  },
];

/* ------------------------------------------- 仿射：lon = a0x + a1y + a2 等 */
const c = geo.coeff;
const [a0, a1, a2] = c.lon;
const [b0, b1, b2] = c.lat;

/** 用现系数反解像素坐标 */
function invToPixel(lon, lat) {
  const u = lon - a2;
  const v = lat - b2;
  const det = a0 * b1 - a1 * b0;
  return {
    x: (u * b1 - a1 * v) / det,
    y: (a0 * v - b0 * u) / det,
  };
}

/** 最小二乘拟合一个轴：y = p0*x + p1*y + p2（注意别与外层 y 混淆） */
function fit(pts, axis) {
  // 法方程：A^T A · p = A^T b，A 的行 = [x, y, 1]
  let sxx = 0, sxy = 0, sx = 0, syy = 0, sy = 0, n = 0;
  let bx = 0, by = 0, bn = 0;
  for (const p of pts) {
    const X = p.x, Y = p.y, B = p[axis];
    sxx += X * X; sxy += X * Y; sx += X;
    syy += Y * Y; sy += Y; n += 1;
    bx += X * B; by += Y * B; bn += B;
  }
  // 解 3×3 对称方程组（高斯消元）
  const M = [
    [sxx, sxy, sx, bx],
    [sxy, syy, sy, by],
    [sx, sy, n, bn],
  ];
  for (let i = 0; i < 3; i++) {
    let piv = i;
    for (let k = i + 1; k < 3; k++) if (Math.abs(M[k][i]) > Math.abs(M[piv][i])) piv = k;
    [M[i], M[piv]] = [M[piv], M[i]];
    for (let k = i + 1; k < 3; k++) {
      const f = M[k][i] / M[i][i];
      for (let j = i; j < 4; j++) M[k][j] -= f * M[i][j];
    }
  }
  const p = [0, 0, 0];
  for (let i = 2; i >= 0; i--) {
    let s = M[i][3];
    for (let j = i + 1; j < 3; j++) s -= M[i][j] * p[j];
    p[i] = s / M[i][i];
  }
  return p;
}

/* ------------------------------------------- 1. 控制点：OSM 实测（反解像素） */
const existing = new Set(geo.controlPoints.map((p) => p.name));
for (const np of NEW_POINTS) {
  if (existing.has(np.name)) {
    console.log(`  · ${np.name} 已在控制点表里，跳过`);
    continue;
  }
  const { x, y } = invToPixel(np.lon, np.lat);
  geo.controlPoints.push({
    name: np.name,
    x: Math.round(x),
    y: Math.round(y),
    lon: np.lon,
    lat: np.lat,
    source: np.source,
  });
  console.log(
    `  + ${np.name}：反解像素 (${Math.round(x)}, ${Math.round(y)})  ` +
      `lon ${np.lon} lat ${np.lat}`
  );
}

/* ------------------- 2. 养雀笼 / 蓄水楼：从控制点表移到「图上读像素」一类 */
{
  for (const gp of GUIDE_POINTS) {
    const i = geo.controlPoints.findIndex((p) => p.name === gp.name);
    if (i >= 0) {
      const old = geo.controlPoints[i];
      console.log(
        `  ! ${gp.name} 原控制点 (${old.x}, ${old.y}) 来自已被否决的 OSM 节点 ⇒ 移出控制点表`
      );
      geo.controlPoints.splice(i, 1);
    }
    geo.readPoints = geo.readPoints || {};
    for (const dead of RETIRED_POINTS) {
      if (geo.readPoints[dead]) {
        delete geo.readPoints[dead];
        console.log(`  - 清掉已作废的读点名：${dead}`);
      }
    }
    geo.readPoints[gp.name] = { x: gp.x, y: gp.y, lon: 0, lat: 0, note: gp.note };
    console.log(`  + ${gp.name}：图上读像素 (${gp.x}, ${gp.y}) 写入 readPoints`);
  }
}

/* --------------------------------------------------------- 3. 重拟合 + 残差 */
const lonP = fit(geo.controlPoints, 'lon');
const latP = fit(geo.controlPoints, 'lat');

const M_PER_DEG_LON = 111320 * Math.cos((40.005 * Math.PI) / 180);
const M_PER_DEG_LAT = 110574;

const residuals = [];
for (const p of geo.controlPoints) {
  const plon = lonP[0] * p.x + lonP[1] * p.y + lonP[2];
  const plat = latP[0] * p.x + latP[1] * p.y + latP[2];
  const dx = (plon - p.lon) * M_PER_DEG_LON;
  const dy = (plat - p.lat) * M_PER_DEG_LAT;
  residuals.push({ name: p.name, d: Math.hypot(dx, dy) });
}
residuals.sort((x, y) => x.d - y.d);
const med = residuals[Math.floor(residuals.length / 2)].d;
const max = residuals[residuals.length - 1].d;

console.log('');
console.log(`  控制点 ${geo.controlPoints.length} 个，重拟合后残差（中位/最大）：`);
console.log(`    ${med.toFixed(0)} m / ${max.toFixed(0)} m`);
console.log(
  `    最大残差：${residuals.slice(-3).map((r) => `${r.name} ${r.d.toFixed(0)}m`).join('、')}`
);

/* ------- 4. readPoints 的经纬度全部由新系数重算（它们本来就是派生量） */
for (const [name, p] of Object.entries(geo.readPoints)) {
  if (name === '_comment') continue;
  p.lon = lonP[0] * p.x + lonP[1] * p.y + lonP[2];
  p.lat = latP[0] * p.x + latP[1] * p.y + latP[2];
}

/* ------------------------------------------------------------ 5. 写回文件 */
geo.coeff = { lon: lonP, lat: latP };
geo.method = geo.method || {};
geo.method.approach =
  '人工/工具在原图上读取景区标注文字的像素位置，与 OpenStreetMap 实测坐标做最小二乘仿射配准（平面相似变换）；' +
  '养雀笼与蓄水楼在图上无单体标注，按第三方史料定位后，改用导览图现状轮廓读像素（属推定锚点）';
geo.method.residualMedianM = Math.round(med);
geo.method.residualMaxM = Math.round(max);
geo.method.controlPointCount = geo.controlPoints.length;
geo.method.note =
  '养雀笼 / 蓄水楼：官方导览图无单体标注，锚点取现状轮廓（图上读像素，推定）；' +
  'OSM 的两个同名节点（蓄水楼落在方外观正东 151m 的草地上、养雀笼落在谐奇趣西南臂屋面上）' +
  '均已否决，依据见 architecture-notes.md §5.7';

if (dry) {
  console.log('  (--dry，未写文件)');
} else {
  fs.writeFileSync(FILE, JSON.stringify(geo, null, 2) + '\n');
  console.log(`  ✓ 已写回 ${path.relative(root, FILE)}`);
}
