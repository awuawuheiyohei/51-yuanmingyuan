/**
 * 清式屋顶参数化生成
 *
 * 关键做法
 * --------
 * 1. 举折曲面：屋面从脊到檐不是直线，而是"脊部陡、檐部缓"的凹曲面。
 *    用 h(t) = t^P (P≈0.62) 表达，P<1 时导数单调递减 → 上陡下缓。
 * 2. 统一高度场：以脊线为界，用「沿脊距离」和「离脊的横向距离」共同
 *    决定高度，使庑殿（斜脊）、悬山（硬山）、攒尖（尖顶）能用同一套公式。
 * 3. 翼角起翘：只在四角区域抬升并外扩平面，形成中国屋顶特有的"翘角"。
 *
 * 支持：庑殿 / 歇山 / 悬山 / 硬山 / 卷棚 / 攒尖(方·圆) / 盝顶
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const P_CURVE = 0.62; // 举折指数：<1 上陡下缓

/**
 * 垂脊（歇山）下降指数：**必须小于 P_CURVE**。
 *
 * 悬山剖面 y = ridgeY - Δ·t^P_CURVE 是凹的（脊侧陡、檐侧缓），
 * 落在「脊—折线」弦线之下。垂脊若按弦线走就比山花边高，
 * 山墙端那块屋面反而向外抬高 ⇒ **山花被自己的山面埋掉**。
 * 取更小的指数 ⇒ 垂脊先陡后缓，始终落在山花边之下 ⇒ 山花外露。
 * 参见 `heightAt()` 的 xieshan 分支与 AGENTS.md §4.1.28。
 */
const P_HIP = 0.35;

/**
 * **歇山山墙端附属构件尺寸**（博风板 / 悬鱼）。
 *
 * 导出给 `scripts/check-roof-gable-trim.mjs` 用 —— 检查脚本与生成代码
 * 必须共用**同一份常数**，否则"检查通过"只是两套数字碰巧对上。
 *
 * · `WB`  博风板**宽**（在山墙平面内，垂直于博缝）
 * · `TB`  博风板**厚**（垂直山墙平面 ⇒ 凸出山墙面）
 * · `EPS` 博风板内皮与山墙面的错开量（避免 z-fighting）
 * · `STRADDLE` 博风板**跨骑博缝**的宽度（外缘越过缝多少）
 *        —— 只做到"内缘止于缝"是止口不是盖缝 ⇒ 外面仍看得见一条亮缝。
 */
export const GABLE_TRIM = { WB: 0.3, TB: 0.1, EPS: 0.006, STRADDLE: 0.04 };

/** 举折剖面：t∈[0,1] 从脊到檐，返回下坠比例 */
function fold(t) {
  const c = Math.min(1, Math.max(0, t));
  return Math.pow(c, P_CURVE);
}

/** 平滑阶跃 */
function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * 生成一条**非均匀**的网格轴：均匀分段 + 强制插入若干特殊坐标。
 *
 * 用途：歇山屋面必须把 `±xh`（山花位置）与 `±zBreak`（折线）做成网格线，
 * 否则跨越折线的那一格会被"山花区域"判定整格跳过 ⇒ **屋面缺一条山面**
 * （从外面直接看见屋架与望板）。
 *
 * @param {number} a 轴起点
 * @param {number} b 轴终点
 * @param {number} n 均匀分段数
 * @param {number[]} specials 必须落在 [a,b] 内的特殊坐标
 * @returns {number[]} 升序坐标数组（长度 n+1 + 插入数）
 */
function gridAxis(a, b, n, specials = []) {
  const set = new Set();
  for (let i = 0; i <= n; i++) set.add(a + ((b - a) * i) / n);
  for (const s of specials) {
    if (s > a + 1e-6 && s < b - 1e-6) set.add(s);
  }
  return [...set].sort((p, q) => p - q);
}

/**
 * @typedef {object} RoofSpec
 * @property {number} width  面阔（X，建筑本体宽）
 * @property {number} depth  进深（Z，建筑本体深）
 * @property {number} eaveY  檐口高度
 * @property {number} rise   脊高比檐口的抬升量
 * @property {string} type   'wudian'|'xieshan'|'xuanshan'|'yingshan'|'juanpeng'|'zanjiandian'|'luding'
 * @property {number} overhang 出檐（Z 方向）
 * @property {number} overhangX 出檐（X 方向，仅悬山/硬山）
 * @property {number} hipRunX 歇山：檐口相对山花外伸的横向距离
 * @property {number} upturn 翼角起翘量（米）
 * @property {number} bulge   翼角平面外扩量（米）
 * @property {number} circular 是否圆形攒尖
 */

/**
 * 生成屋顶。
 * @param {RoofSpec} spec
 * @returns {{ geoms: Map<string, THREE.BufferGeometry[]>, meta: object }}
 */
export function buildRoof(spec) {
  const { doubleEave, ...rest } = spec;
  if (!doubleEave) return buildRoofCore(rest);

  /**
   * ---- 重檐（清式"重檐歇山"）：下檐（腰檐）一圈 + 楼身 + 上檐 ----
   *
   * ⚠⚠ 2026-11-25 白模体检发现的**真 bug**（全园 2 景：鸿慈永祜、方壶胜境）。
   *
   * **原来的三层高度是错的**：
   *   · 腰檐（`buildLowerEave`）：外檐口 `rest.eaveY`，内圈 `rest.eaveY + lowerRise`
   *   · 上檐（`buildRoofCore`）：檐口 `rest.eaveY + lowerRise`
   * ⇒ 腰檐的**内圈**与上檐的**檐口**落在**同一高度** ⇒ 两层屋面在那里重叠，
   *   而**中间没有楼身**。
   *   ⇒ 结构层更糟：上檐斗栱坐在 12.01m（用下层柱网的额枋尺度算出来的），
   *     而上檐檐口在 12.93m ⇒ **斗栱悬空 0.9m**，且腰檐与上檐之间
   *     **没有任何柱子承托上檐斗栱**（清式应有"雷公柱"）。
   *
   * **清式重檐歇山的正确层次**（自下而上）：
   *   ① 台基 → 下层柱网 → **腰檐斗栱**（挑在下层柱头）→ 腰檐屋面
   *      腰檐：外檐口在 `rest.eaveY`，向内升 `lowerRise` 到**腰檐内圈**
   *   ② **楼身**：腰檐内圈 → 上檐檐口（这一段是墙与窗）
   *   ③ **上层柱（雷公柱）** 从楼身升起 → **上檐斗栱** → 上檐屋面
   *      上檐：檐口在 `rest.eaveY + lowerRise + bodyH`
   *
   * ⇒ 把 `lowerRise` 拆成两段：**腰檐坡高** + **楼身高**，
   *   三层才真正分开，结构层也能据此建出雷公柱。
   */
  const geoms = new Map();
  const inset = Math.max(1.1, Math.min(2.4, Math.min(rest.width, rest.depth) * 0.085));
  const totalRise = spec.lowerRise ?? Math.max(0.9, (rest.rise ?? 3) * 0.3);
  // 腰檐坡高：占抬升量的一半多一点（腰檐是坡屋面，需要足够的坡度）
  const lowerSlope = Math.max(0.9, totalRise * 0.55);
  // 楼身高：腰檐内圈 → 上檐檐口（雷公柱所在的那一段）
  const bodyH = Math.max(1.6, totalRise - lowerSlope);
  const Wx = rest.width / 2 + (rest.overhang ?? 1.3);
  const Wz = rest.depth / 2 + (rest.overhang ?? 1.3);

  const lower = buildLowerEave(Wx, Wz, rest.eaveY, lowerSlope, inset);
  const upper = buildRoofCore({
    ...rest,
    width: rest.width - 2 * inset,
    depth: rest.depth - 2 * inset,
    // 上檐檐口 = 腰檐外檐口 + 腰檐坡高 + 楼身高
    eaveY: rest.eaveY + lowerSlope + bodyH,
    rise: Math.max(1.4, (rest.rise ?? 3) - lowerSlope),
  });

  for (const src of [lower, upper]) {
    for (const [k, list] of src.geoms) {
      if (!geoms.has(k)) geoms.set(k, []);
      geoms.get(k).push(...list);
    }
  }
  return {
    geoms,
    meta: {
      ...upper.meta,
      doubleEave: true,
      lowerEaveY: rest.eaveY,
      /** 腰檐内圈高度（楼身下沿） */
      lowerInnerY: rest.eaveY + lowerSlope,
      /** 上檐檐口高度（楼身上沿） */
      upperEaveY: rest.eaveY + lowerSlope + bodyH,
    },
    // 重檐：屋架对应的是**上檐**，所以用 upper 的高度场
    surfAt: upper.surfAt,
    surfAtXY: upper.surfAtXY,
    ridgeHalfWidth: upper.ridgeHalfWidth,
  };
}

/**
 * 屋面核心：单层屋面的完整几何（屋面 + 瓦作 + 山花/山墙 + 屋脊 + 檐口）。
 * @param {RoofSpec} spec
 * @param {Map<string, THREE.BufferGeometry[]>} [geomsIn] 复用已有材质桶
 */
function buildRoofCore(spec, geomsIn) {
  const {
    width,
    depth,
    eaveY,
    rise,
    type = 'xieshan',
    overhang = 1.3,
    overhangX = 0.9,
    hipRunX = 4.0,
    upturn = 0.85,
    bulge = 0.5,
    circular = false,
    segments = 1,
  } = spec;

  const geoms = geomsIn || new Map();
  const push = (key, g) => {
    if (!geoms.has(key)) geoms.set(key, []);
    geoms.get(key).push(g);
  };

  // ---------- 平面尺寸 ----------
  const Wx = width / 2 + (type === 'xuanshan' ? overhangX : overhang);
  const Wz = depth / 2 + overhang;

  // 脊线半长
  let xh; // 硬山/悬山：脊沿 X 贯通；庑殿：按 45° 斜脊收进
  if (type === 'wudian') xh = Math.max(0, Wx - Wz);
  else if (type === 'zanjiandian') xh = 0;
  else if (type === 'xieshan' || type === 'juanpengxieshan')
    /**
     * ⚠⚠ 歇山的**山花必须贴在建筑的山墙面上** ⇒ `xh = width/2`。
     *
     * 原来取 `Wx - hipRunX`（Wx **含出檐**）⇒ 山花往里缩了整整一个出檐+山面宽
     * （本例 39m 宽的殿缩进 4m）⇒
     *   · 山花悬在**建筑内部**，山墙面没有封板 ⇒ **从檐下能看穿到屋架**；
     *   · 垂脊的戗脊线也整体内移，山面比例全错。
     *
     * 真实歇山：正脊**贯到山墙面**，山花就挂在山墙外皮上；
     * 戗脊由山墙线的折线端斜向檐角（平面上是**斜线**，
     * 代码里 `xHip = xh + t*(Wx-xh)` 正是在近似这条斜线）。
     */
    xh = Math.max(0.5, width / 2);
  else if (type === 'yingshan') xh = width / 2;
  else xh = Wx; // 悬山 / 卷棚

  // 歇山的折线高度与折线半深
  // 折线（山花底边）的高度必须与上下两段屋面在折线处接得上，
  // 否则屋面在折线处会多出一道竖直台阶——远看就是一条黑带。
  const yBreak = eaveY + rise * 0.58;
  const tBreak = Math.pow(0.42, 1 / P_CURVE); // 使 fold(tBreak)=0.42
  const zBreak = Wz * tBreak;

  const ridgeY = eaveY + rise;

  /* ------------------------------------------------------------ 高度场 */
  /**
   * @returns {number} 屋面高度
   */
  function heightAt(x, z) {
    const az = Math.abs(z);
    const ax = Math.abs(x);

    if (type === 'luding') return eaveY + rise * 0.12; // 盝顶：平顶

    if (type === 'zanjiandian') {
      // 攒尖：锥面。方形取切比雪夫距离，圆形取径向
      const tx = circular ? ax / Wx : ax / Wx;
      const tz = circular ? az / Wz : az / Wz;
      const t = circular ? Math.hypot(tx, tz) : Math.max(tx, tz);
      return eaveY + rise * (1 - fold(Math.min(1, t)));
    }

    if (type === 'xieshan' || type === 'juanpengxieshan') {
      // 上部：山面之上的悬山段（|z| ≤ zBreak，|x| ≤ xh）
      // 下部：庑殿段（前后坡 + 45° 戗脊收分）
      // 两段在折线处必须都等于 yBreak，否则接缝处会裂出一道竖直台阶。
      if (az <= zBreak) {
        const y = ridgeY - (ridgeY - yBreak) * fold(az / zBreak);
        if (type === 'xieshan') {
          if (ax <= xh) return y;
          // ⚠⚠ 2026-11-17 **山花外侧是"山面"**（原来 return null ⇒ 破洞）。
          //
          //   歇山的构造（考据见 AGENTS.md §4.1.28）：
          //     · 正脊**到山墙就结束**（山花尖端正对正脊端头）——
          //       参照入母屋实测照片：正脊两端的甍両正坐在山花尖上；
          //     · 垂脊自**正脊端点 (xh, 0)** 斜下到檐角 (Wx, Wz)，
          //       中途在折线高度处**折断一次** ⇒ 分垂脊（上段）与戗脊（下段）；
          //     · 山花（竖直三角）挂在 x = xh 上；山花之外那一块就是**山面**，
          //       夹在「山花边（rake）」与「垂脊」之间。
          //
          //   原来这里 return null ⇒ 那一块**根本没有面** ⇒
          //   画面上山头两侧破开两个大洞，直接看见人字梁（实测）。
          //   顺带说明：原来"垂脊从 (xh, zBreak) 起"是**庑殿的斜脊做法**，
          //   歇山不适用 —— 歇山的垂脊从正脊端点就起。
          //
          //   ⇒ 高度场（自山花边向外）：
          //       x = xh      → 悬山剖面 y（= 山花的 rake）
          //       x = xHip    → 垂脊高度 yHip（垂脊是山面上的**脊**，比两侧高）
          //       x > xHip    → 角部：由垂脊高度降到檐高（戗脊外侧）
          const tH = az / Wz;
          const xHip = xh + tH * (Wx - xh);              // 垂脊的平面位置
          // ⚠⚠ 2026-11-17 **垂脊高度必须比举折掉得更快**（P_HIP < P_CURVE）。
          //
          //   悬山剖面（山花的 rake）y = ridgeY - Δ·t^P_CURVE（P_CURVE=0.62，t=z/zBreak）
          //   是**凹**的：屋面在脊侧陡、檐侧缓 ⇒ 它落在「脊—折线」的**弦**之下。
          //   若垂脊按直线（弦）走，垂脊就比山花边**高** ⇒ 山花外侧那块
          //   屋面是往外**抬高**的 ⇒ **山花被自己的山面整个埋掉**
          //   （实测 `/tmp/xs_end.png`：山墙端只剩一片陡坡，山花看不见）。
          //
          //   真歇山的山花是**外露**的：博风板压在山花的 rake 上，
          //   而垂脊在更外侧、更低处（垂脊是山墙端那块屋面的**脊**，
          //   再往外才降到檐口）⇒ 垂脊高度必须 ≤ 山花边高度。
          //   ⇒ 指数取 P_HIP < P_CURVE：垂脊先陡后缓，正好落在山花边之下。
          const yHip = ridgeY - (ridgeY - yBreak) * Math.pow(az / zBreak, P_HIP);
          if (ax >= xHip) {
            // 角部（戗脊外侧）：从垂脊高度降到檐高
            const d = (ax - xHip) / Math.max(Wx - xHip, 1e-6);
            return yHip - (yHip - eaveY) * d;
          }
          const u = (ax - xh) / Math.max(xHip - xh, 1e-6);
          return y + (yHip - y) * u;
        }
        // 卷棚歇山：山花位置改为圆缓卷落（无山花）
        const span = Math.max(1.0, Wx - xh);
        const u = Math.min(1, Math.max(0, (ax - xh) / span));
        const k = 1 - smoothstep(0, 1, u);
        return eaveY + (y - eaveY) * k;
      }
      // 下部：沿深度取 t，戗脊在 x = xh + t*(Wx-xh) 处。
      // 戗脊以内取前后坡的举折高度，戗脊以外（角部）取戗脊线上的高度——
      // 角部因此正好落在 eaveY，而不是像旧公式那样掉到 eaveY 的一半。
      const t = (az - zBreak) / (Wz - zBreak);
      const prof = yBreak - (yBreak - eaveY) * fold(t);
      // ⚠ 2026-11-17 戗脊的**平面位置**改用 az/Wz（从正脊端点 (xh,0) 斜到檐角），
      //   与上段山面的垂脊线**接得上** ⇒ 山面与下部之间不再有错台/裂缝。
      //   原来用 t=(az-zBreak)/(Wz-zBreak) ⇒ 戗脊从 (xh, zBreak) 起（庑殿做法），
      //   与上段对不上 ⇒ 山头两侧破洞。
      const xHip = xh + (az / Wz) * (Wx - xh);
      if (ax <= xHip) return prof;
      // 角部（戗脊外侧）：从**戗脊线上的高度**降到檐高。
      // ⚠⚠ 2026-11-17 原来这里是 `yBreak - (yBreak-eaveY)*t`（沿进深线性落），
      //   那会让 x=Wx 的檐口线在中间深度处停在半山腰（比檐口高好几米）——
      //   檐口线不是一条水平线。现在改成沿 x 落到檐高 ⇒ 檐口线回到 eaveY ✓
      const d = (ax - xHip) / Math.max(Wx - xHip, 1e-6);
      return prof - (prof - eaveY) * d;
    }

    // 庑殿 / 悬山 / 硬山 / 卷棚
    const base = ridgeY - rise * fold(az / Wz);
    if (ax <= xh) return base;

    if (type === 'wudian') {
      // 45° 斜脊收头
      const u = ax - xh;
      const g = (1 - fold(az / Wz)) * (1 - Math.min(1, u / Wz));
      return eaveY + rise * g;
    }
    if (type === 'juanpeng') {
      // 卷棚：两端圆缓收头，无正脊
      const u = ax - xh;
      const k = 1 - smoothstep(0, Math.max(1, Wx - xh) * 0.9, u);
      return eaveY + (base - eaveY) * k;
    }
    return base; // 悬山 / 硬山：山面垂直封闭
  }

  /* -------------------------------------------------- 屋面网格（高度场） */
  const NU = segments >= 2 ? Math.min(64, Math.round(segments)) : 26;
  const NV = NU;

  const pos = [];
  const uv = [];
  const idx = [];

  const pushVert = (x, y, z, u, v) => {
    pos.push(x, y, z);
    uv.push(u, v);
    return pos.length / 3 - 1;
  };

  if (circular) {
    // 圆形攒尖：极坐标网格
    const rings = NV;
    const segs = NU * 2;
    for (let i = 0; i <= rings; i++) {
      const t = i / rings;
      const r = Wx * t;
      for (let j = 0; j <= segs; j++) {
        const a = (j / segs) * Math.PI * 2;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r * (Wz / Wx);
        const y = heightAt(x, z);
        pushVert(x, y, z, j / segs, t);
      }
    }
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < segs; j++) {
        const a = i * (segs + 1) + j;
        const b = a + 1;
        const c = a + segs + 1;
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
  } else {
    /**
     * 矩形网格 —— **非均匀**。
     *
     * ⚠⚠ 必须把 `x = ±xh`（山花位置）与 `z = ±zBreak`（歇山折线）
     *   **插成网格线**，否则会缺一整条山面。
     *
     * 原来网格是均匀的（NU 列均分），而"山花区域"的判定是
     * `|z| ≤ zBreak && |x| > xh`（**任一角点**满足就整格跳过）。
     * 于是**跨越 z = ±zBreak 的那一格**在 |x| > xh 侧被整格跳过 ——
     * 可那一格有一半属于**下段的 45° 山面**（不是竖直山花），
     * 结果：**屋面沿折线缺了一整条**，从外面能直接看见屋架与望板
     * （`/tmp/JQ_B.png` 里那片褐色望板 + 穿出来的檩架）。
     *
     * 插线之后：
     *   · `z = ±zBreak` 正好是网格行 ⇒ 下段山面的第一排严丝合缝；
     *   · `x = ±xh` 正好是网格列 ⇒ 山花区域是**整格**的，不会误伤下段。
     */
    /**
     * ⚠⚠ 2026-11-17 歇山要多插**四条**网格线：`x = ±xh`（山花）与
     *   `x = ±xHipB`（折断点，即收山那一段的末端）。
     *
     *   只插 ±xh 时，山花外侧那一段（收山段）宽只有
     *   `xHipB - xh = (zBreak/Wz)·(Wx-xh)`，本例只有 **0.35m** ——
     *   而网格步长约 0.4m ⇒ 那一段**采不到任何网格线**，
     *   山面被采成锯齿、折断点处出现错台。
     *   把 xHipB 也插进去 ⇒ 收山段正好是**一整格**，严丝合缝。
     */
    const xHipB = xh + (zBreak / Wz) * (Wx - xh);
    const xs = gridAxis(
      -Wx,
      Wx,
      NU,
      type === 'xieshan' ? [xh, -xh, xHipB, -xHipB] : []
    );
    const zs = gridAxis(-Wz, Wz, NV, type === 'xieshan' ? [zBreak, -zBreak] : []);
    // ⚠⚠ 循环边界必须用**数组实际长度**，不能用 NU/NV ——
    //   gridAxis 插入了额外网格线，数组长度 = NU+1+插入数。
    //   用旧长度 ⇒ 屋面两端被截掉（东侧/南侧各少一条），
    //   檐口出现缺口，从下面能直接看见屋架。
    const NX = xs.length;
    const NZ = zs.length;
    const rows = [];
    for (let i = 0; i < NZ; i++) {
      const row = [];
      for (let j = 0; j < NX; j++) {
        row.push([xs[j], zs[i]]);
      }
      rows.push(row);
    }
    // 记下每格是否属于"山花竖面"（歇山），这类格子跳过，改生成竖直三角面
    const isShanhua = (x, z) =>
      type === 'xieshan' && Math.abs(z) <= zBreak && Math.abs(x) > xh;

    const grid = [];
    for (let i = 0; i < NZ; i++) {
      const row = [];
      for (let j = 0; j < NX; j++) {
        const [x0, z0] = rows[i][j];
        let x = x0;
        let z = z0;
        let y = heightAt(x0, z0);
        if (y === null) {
          // 山花区域：顶点放到折线高度，交由竖直面单独处理
          y = yBreak;
        }
        // 翼角：仅在四角抬升 + 外扩
        const cn =
          Math.pow(Math.abs(x0) / Wx, 5) * Math.pow(Math.abs(z0) / Wz, 5);
        if (cn > 0.0005) {
          const eaveT = smoothstep(0.35, 1.0, Math.abs(z0) / Wz);
          const lift = upturn * cn * eaveT;
          x = x0 * (1 + (bulge * cn) / Math.max(Wx, 0.001));
          z = z0 * (1 + (bulge * cn) / Math.max(Wz, 0.001));
          y += lift;
        }
        // UV 按**真实坐标**算（非均匀网格下不能再用 j/NU）
        row.push(
          pushVert(x, y, z, (x0 + Wx) / (2 * Wx), (z0 + Wz) / (2 * Wz))
        );
      }
      grid.push(row);
    }
    for (let i = 0; i < NZ - 1; i++) {
      for (let j = 0; j < NX - 1; j++) {
        const x0 = xs[j];
        const x1 = xs[j + 1];
        const z0 = zs[i];
        const z1 = zs[i + 1];
        const corners = [
          [x0, z0],
          [x1, z0],
          [x1, z1],
          [x0, z1],
        ];
        /**
         * 歇山：`|z| ≤ zBreak 且 |x| > xh` 的区域不铺屋面（山花另建）。
         *
         * ⚠⚠ 必须按**格心**判定，不能按角点！
         *   网格现在把 `z = ±zBreak` 做成了网格线，于是"折线以下那一排"的
         *   **上边角点恰好落在 z = zBreak** ⇒ 按角点判会 `<= zBreak` 成立
         *   ⇒ **整排 45° 山面被跳过** ⇒ 屋面沿折线缺一条，
         *   从外面直接看见褐色望板与穿出来的檩架（`/tmp/JQ_B.png`）。
         *   按格心判：折线以下的格心 z > zBreak ⇒ 不跳过 ✓
         */
        /**
         * ⚠⚠ 2026-11-17 **不再跳过"山花区域"**。
         *
         *   原来这里把 `|z| ≤ zBreak && |x| > xh` 的格子**整格跳过**，
         *   因为那一块的高度场返回 null（当时没做山面）。
         *   ⇒ 屋面在山头两侧破开两个大洞，从外面直接看见人字梁与殿内暗色
         *     （实测 `/tmp/XJ2_crop.png`；`?mat=tile` 染色证明那片深绿不是瓦）。
         *
         *   现在高度场已经给出**山面**（山花边 ↔ 垂脊之间的 45° 斜面），
         *   这些格子有合法的顶点 ⇒ **必须铺面**。
         *   山花（竖直三角）另外单独建，与屋面在 x = ±xh 处**共用一条边** ✓。
         */
        const skip = false;
        if (skip) continue;
        const a = grid[i][j];
        const b = grid[i][j + 1];
        const c = grid[i + 1][j + 1];
        const d = grid[i + 1][j];
        idx.push(a, d, b, b, d, c);
      }
    }
  }

  const roofGeo = new THREE.BufferGeometry();
  roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  roofGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  roofGeo.setIndex(idx);
  roofGeo.computeVertexNormals();
  /* ---------------------------------------------------- 瓦作（真构件） */
  // 筒瓦：每垄一道半圆管，沿坡向逐段铺
  const gangCount = Math.max(4, Math.floor((Wx * 2) / TILE.gang));

  // 屋面 UV 与**筒瓦垄距对齐**：贴图横向一个循环 6 垄，纵向一个循环 6 层瓦当，
  // 而一根筒瓦只取其中一垄（见 buildTongWa 的 U0/U1）。
  // 之前屋面网格按 (width/8, depth/8) 铺，与瓦管的取样窗口对不上——
  // 露出来的板瓦面频率是瓦管的数倍，远看整片屋面成了一张花地毯。
  const uvAttr = roofGeo.getAttribute('uv');
  const uScale = gangCount / 6; // 一循环 6 垄 = 6 根筒瓦
  const vScale = (Wz * 2) / 1.5; // 一循环 6 层瓦当 = 1.5 m
  for (let i = 0; i < uvAttr.count; i++) {
    uvAttr.setXY(i, uvAttr.getX(i) * uScale, uvAttr.getY(i) * vScale);
  }
  uvAttr.needsUpdate = true;
  push('tile', roofGeo);

  // 望板：屋面之下的铺板。屋面是单面的，从下往上看会直接看穿到天上，
  // 有了望板，屋架才有"底"，梁架也才有依附的地方。
  {
    const board = roofGeo.clone();
    /**
     * ⚠⚠ 2026-11-17 望板改为**沿法线偏移**，不再竖直下移。
     *
     *   原来 `board.translate(0, -0.075, 0)`（竖直下移 7.5 cm）。
     *   屋面多数是缓坡，竖直下移 ≈ 沿法线下移，没问题；
     *   但歇山的**山面近于垂直** ⇒ 竖直下移 7.5 cm 会让板在陡面上
     *   **横移好几米** ⇒ 跑到瓦面**前面**，把瓦盖住 ⇒
     *   山头侧面出现一大片竖直深色板 + 后面穿出来的人字梁
     *   （实测 `/tmp/XJ2_crop.png`；`?mat=board` 染色确认是 board 桶）。
     *
     *   ⇒ 逐顶点沿**自身法线**偏移 ⇒ 板永远贴在瓦面正下方 7.5 cm，
     *     任何坡度都不会跑到瓦前面去。
     */
    const nrm = board.getAttribute('normal');
    const bp = board.getAttribute('position');
    if (nrm && bp) {
      for (let i = 0; i < bp.count; i++) {
        bp.setXYZ(
          i,
          bp.getX(i) - nrm.getX(i) * 0.075,
          bp.getY(i) - nrm.getY(i) * 0.075,
          bp.getZ(i) - nrm.getZ(i) * 0.075
        );
      }
      bp.needsUpdate = true;
      board.computeVertexNormals();
    } else {
      board.translate(0, -0.075, 0);
    }
    push('board', board);
  }
  // 小屋顶（亭、轩）不做真瓦：远看无差别，却占掉大半构建时间
  const detailTiles = Wx > 3.0;
  const findStart = (x, sign) => {
    // 找出该垄在坡面上的起点（遇到山花区域会跳过）
    for (let i = 0; i <= 30; i++) {
      const z = sign * (Wz * i) / 30;
      if (heightAt(x, z) !== null) return z;
    }
    return null;
  };
  for (let gi = 0; gi <= gangCount && detailTiles; gi++) {
    const x = -Wx + (gi * Wx * 2) / gangCount;
    for (const sign of [1, -1]) {
      const z0 = findStart(x, sign);
      if (z0 === null) continue;
      const sampler = (t) => {
        const z = z0 + (sign * Wz - z0) * t;
        return { x, y: heightAt(x, z), z };
      };
      for (const g of buildTongWa(sampler, 0, 1)) push('tile', g);
    }
  }

  // 檐口：瓦当、滴水、椽头、飞椽（前后两面）
  if (detailTiles) {
    for (const g of buildWadang(Wx, Wz, eaveY, gangCount, 1)) push('tile', g);
    for (const g of buildWadang(Wx, Wz, eaveY, gangCount, -1)) push('tile', g);
  }
  const rc = Math.floor((Wx * 2) / TILE.rafterGap);
  for (const sg of [1, -1]) {
    const rf = buildRafters(Wx, Wz, eaveY, rc, sg);
    for (const g of rf.wood) push('wood', g);
    for (const g of rf.eave) push('eave', g);
  }

  /* -------------------------------------------------- 山花（歇山竖面） */
  if (type === 'xieshan') {
    for (const sgn of [-1, 1]) {
      const x = sgn * xh;
      const g = new THREE.BufferGeometry();
      const v = [
        x, ridgeY, 0,
        x, yBreak, zBreak,
        x, yBreak, -zBreak,
      ];
      g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      g.setAttribute(
        'uv',
        // UV 按**真实比例**给：山花底边 = 折线宽度，顶点 = 脊。
        // 原来给的是 (0,1)(1,0)(1,1) ⇒ 彩画贴图被拉成斜的怪块。
        new THREE.Float32BufferAttribute(
          [0.5, 1.0, 0.06, 0.0, 0.94, 0.0],
          2
        )
      );
      g.setIndex(sgn > 0 ? [0, 1, 2] : [0, 2, 1]);
      g.computeVertexNormals();
      push('shanhua', g);

      /**
       * **山花下的山墙**（歇山两端山面，yBreak 以下那一条）。
       *
       * ⚠ 屋面网格在 `|z| ≤ zBreak 且 |x| > xh` 的区域是**跳过的**
       *   （那里是竖直山面，不是坡面），而山花三角只封住了 yBreak **以上**。
       *   于是 yBreak 以下、`|x| > xh` 的山面**完全没有面** ——
       *   画面上就是山头两侧破开两个大洞，直接看见屋架（人字梁）。
       *
       *   补法：在山花所在的同一平面（x = ±xh）上，
       *   从下段檐口 eaveY 到折线高度 yBreak 补一条竖直板，
       *   正好接住山花三角的底边。
       */
      const w = new THREE.BufferGeometry();
      const wv = [
        x, eaveY, -zBreak,
        x, eaveY, zBreak,
        x, yBreak, zBreak,
        x, yBreak, -zBreak,
      ];
      w.setAttribute('position', new THREE.Float32BufferAttribute(wv, 3));
      w.setAttribute(
        'uv',
        new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2)
      );
      /**
       * ⚠ 绕向：`e1 = ẑ`、`e2 = ŷ` ⇒ `e1 × e2 = -x̂`，
       *   所以 sgn=+1（东山面）时**必须用反向索引**才能让法线朝 +x。
       *   朝内的话会被背面剔除 ⇒ 山墙看不见 ⇒ 洞还在那儿。
       */
      w.setIndex(sgn > 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]);
      w.computeVertexNormals();
      /**
       * ⚠⚠ **山墙进 'wall' 桶，不进 'shanhua' 桶**。
       *
       * 山花（yBreak **以上**的三角）才是彩画板；
       * yBreak 以下那一段是**建筑本体的山墙** —— 跟后檐墙一样是抹红灰砖墙。
       *
       * 原来两段都进 'shanhua'，而该材质是**平涂 0x27535c**（无贴图），
       * 于是每座歇山殿的山头都挂着一块**死板的青色平面**，
       * 从侧面/高处看过去像贴了张色板（`/tmp/JQ_G.png` 里的那块青色片）。
       */
      push('wall', w);

      /**
       * ⚠⚠ 2026-11-18 补做**博风板 + 悬鱼**（歇山山墙端）
       *
       *   考据（维基百科「歇山顶」）：「外侧有保护檩木的**博风板**、
       *   辅助及装饰性的**悬鱼**惹草」；博风板沿山墙的**博缝**
       *   （山花两条斜边）钉在山墙面外侧，**盖住屋面与山花的接缝**；
       *   悬鱼挂在山花尖（正脊端头下方）。
       *
       *   本项目原来两样都没有 ⇒ 山墙端那条接缝直接暴露；
       *   而垂脊首端比山花尖低 **0.307 m**（脊瓦截面压在屋面上）
       *   ⇒ 交接处是空的（实测 `scripts/probe-hip-shanghua.mjs`）。
       *
       *   博风板（每侧山墙两条，沿山花的两条斜边）：
       *     · 板**宽 0.30 m**，取在山墙平面内、垂直于斜边；
       *     · 板**厚 0.10 m**，取在山墙平面**外侧**（站在屋面之上 ⇒ 缝被遮住）；
       *     · ⚠ 板要**跨骑博缝**：内缘比缝再往里 0.30、外缘比缝往外 0.04
       *       （`STRADDLE`）。只做到"内缘正好在缝上"仍是**止口**不是**盖缝**，
       *       从外面看那条接缝仍是一条亮线。
       *     · 下端比山花底角再多出 0.20 m，与戗脊起始处搭接。
       *   悬鱼：山花尖下方的鱼形木雕（彩画木作 ⇒ 进 'shanhua' 桶），
       *       背面**贴住博风板外皮**、正面比板皮再凸出 0.05 m。
       */
      {
        const zr = zBreak;
        const dy = ridgeY - yBreak;
        const L = Math.hypot(dy, zr);
        const { WB, TB, EPS, STRADDLE } = GABLE_TRIM;
        const A = new THREE.Vector3(sgn * xh, ridgeY, 0);
        for (const zs of [-1, 1]) {
          // 斜边方向 A→B（山墙平面内，x 恒为 sgn*xh）
          const d = new THREE.Vector3(0, -dy / L, (zs * zr) / L);
          // 指向山花内部的法向（山墙平面内、垂直于斜边）
          const q = new THREE.Vector3(0, (-zs * zr) / L, -dy / L);
          const B = A.clone().addScaledVector(d, L);
          const Be = B.clone().addScaledVector(d, 0.2); // 与戗脊搭接
          const len = A.distanceTo(Be);
          const mid = A.clone().add(Be).multiplyScalar(0.5);
          const w = new THREE.Vector3(sgn, 0, 0); // 山墙外侧
          // 中心要沿 q 往外挪 STRADDLE ⇒ 板跨骑博缝（外缘越过缝）
          const center = mid
            .clone()
            .addScaledVector(q, WB / 2 - STRADDLE)
            .addScaledVector(w, EPS + TB / 2);
          const g = new THREE.BoxGeometry(WB, len, TB);
          // 右手系：Z 轴 = X×Y（= q×d，恒为 −x̂；只是轴向，位置另算）
          const zAx = new THREE.Vector3().crossVectors(q, d);
          const m = new THREE.Matrix4().makeBasis(q, d, zAx);
          m.setPosition(center);
          g.applyMatrix4(m);
          g.computeVertexNormals();
          push('ridge', g);
        }
        // 悬鱼：山花尖正下方的鱼形木雕
        {
          const pts = [
            [0, -0.04],
            [0.13, -0.19],
            [0.085, -0.38],
            [0, -0.46],
            [-0.085, -0.38],
            [-0.13, -0.19],
          ];
          const sh = new THREE.Shape();
          sh.moveTo(-pts[0][0], pts[0][1]);
          for (const [px, py] of pts.slice(1)) sh.lineTo(-px, py);
          sh.closePath();
          const g = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: false });
          // 形状建在 (z, y) 平面；绕 Y 轴 ±90° 让**挤出方向**落到 ±x，
          // 且 sgn=+1 时挤出朝 +x、sgn=−1 时朝 −x（鱼永远凸向山墙外侧）。
          if (sgn > 0) g.rotateY(Math.PI / 2);
          else g.rotateY(-Math.PI / 2);
          // 背面贴在博风板外皮上（板外皮在 xh + EPS + TB）
          g.translate(sgn * (xh + EPS + TB), ridgeY - 0.1, 0);
          g.computeVertexNormals();
          push('shanhua', g);
        }
      }

      /**
       * 山面棱柱的**南北两侧**（z = ±zBreak）：从前后方向看进去同样是空的。
       * 上边正好接住下段屋面的折线高度 yBreak，下边落在檐口高度。
       *
       * ⚠⚠ 这两块是**内部封板**，不是山花。
       *   原来也进 'shanhua' 桶（青绿彩画）⇒ 从檐下往里看，
       *   屋架之间挂着一块 4m×3.6m 的**青色大板**，
       *   像贴了张色板（`/tmp/JQ_I.png` 右侧那块）。
       *   改进 'board'（望板色）：它是屋面的内侧封板，本就该是素的。
       */
      for (const zs of [-1, 1]) {
        const z = zs * zBreak;
        // ⚠⚠ 2026-11-17 **外缘从 Wx 收到山面的实际边界**。
        //   原来这块封板一直做到 x = Wx（屋面的最外缘），
        //   但山面（歇山的上段斜面）只到 x = xHip(zBreak) 就结束了
        //   ⇒ 封板**伸出屋面轮廓之外** ⇒ 竖着戳在山头侧面，
        //   从东南方向看就是**一大片竖直的深色板 + 后面的人字梁**
        //   （实测 `/tmp/XJ2_crop.png`，`?mat=board` 染色确认是 board 桶）。
        //   ⇒ 外缘改到 xHip：封板正好接在山面与下段屋面的接缝上，不再外露。
        const xHipB = xh + (zBreak / Wz) * (Wx - xh);
        const s = new THREE.BufferGeometry();
        const sv = [
          sgn * xh, eaveY, z,
          sgn * xHipB, eaveY, z,
          sgn * xHipB, yBreak, z,
          sgn * xh, yBreak, z,
        ];
        s.setAttribute('position', new THREE.Float32BufferAttribute(sv, 3));
        s.setAttribute(
          'uv',
          new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2)
        );
        const flip = (sgn > 0) === (zs > 0);
        s.setIndex(flip ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
        s.computeVertexNormals();
        push('board', s);
      }
    }
  }

  /* ---------------------------------------------------------- 山墙（硬山） */
  if (type === 'yingshan' || type === 'xuanshan') {
    const gw = type === 'xuanshan' ? width / 2 : Wx;
    for (const sgn of [-1, 1]) {
      const x = sgn * gw;
      const v = [x, eaveY - 0.4, 0, x, eaveY, zBreakGable(Wz, eaveY, rise), x, eaveY, -zBreakGable(Wz, eaveY, rise)];
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0.5, 1, 0.5], 2));
      g.setIndex(sgn > 0 ? [0, 1, 2] : [0, 2, 1]);
      g.computeVertexNormals();
      push('wall', g);
    }
  }

  /* -------------------------------------------------------------- 屋脊 */
  const ridges = [];
  if (type === 'wudian' || type === 'xieshan') {
    ridges.push({
      kind: 'main',
      pts: [
        new THREE.Vector3(-xh, ridgeY, 0),
        new THREE.Vector3(xh, ridgeY, 0),
      ],
    });
  } else if (type === 'xuanshan' || type === 'yingshan') {
    ridges.push({
      kind: 'main',
      pts: [
        new THREE.Vector3(-xh, ridgeY, 0),
        new THREE.Vector3(xh, ridgeY, 0),
      ],
    });
  } else if (type === 'juanpeng') {
    // 卷棚：无正脊，用圆弧脊代替
    const pts = [];
    const N = 14;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const x = -xh + 2 * xh * t;
      const y = ridgeY - rise * 0.02 * Math.sin(t * Math.PI) - (type === 'juanpeng' ? 0 : 0);
      pts.push(new THREE.Vector3(x, y, 0));
    }
    ridges.push({ kind: 'roll', pts });
  } else if (type === 'juanpengxieshan') {
    // 卷棚歇山：圆缓的卷棚脊（两端略垂，中段微拱）
    const pts = [];
    const N = 18;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const x = -xh + 2 * xh * t;
      const dip = Math.pow(Math.abs(2 * t - 1), 2.4);
      const y = ridgeY - rise * 0.055 * dip + rise * 0.012 * Math.sin(t * Math.PI);
      pts.push(new THREE.Vector3(x, y, 0));
    }
    ridges.push({ kind: 'roll', pts });
  } else if (type === 'zanjiandian') {
    ridges.push({ kind: 'finial', apex: new THREE.Vector3(0, eaveY + rise, 0) });
  }

  // 垂脊 / 戗脊
  if (type === 'wudian') {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const h = hipLine(sx, sz);
        ridges.push({ kind: 'hip', pts: h.pts, beastPts: h.beastPts });
      }
    }
  } else if (type === 'xieshan' || type === 'juanpengxieshan') {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const h = hipLine(sx, sz);
        ridges.push({ kind: 'hip', pts: h.pts, beastPts: h.beastPts });
      }
    }
  } else if (type === 'juanpeng') {
    // 卷棚两端圆缓收头脊
    for (const sx of [-1, 1]) {
      ridges.push({
        kind: 'roll',
        pts: [
          new THREE.Vector3(sx * xh, ridgeY, 0),
          new THREE.Vector3(sx * (xh + (Wx - xh) * 0.45), ridgeY - rise * 0.28, 0),
          new THREE.Vector3(sx * Wx, eaveY + rise * 0.02, 0),
        ],
      });
    }
  }

  /**
   * 45° 戗脊：从山花底角 (xh, zBreak) 斜下到檐角 (Wx, Wz)。
   *
   * 戗脊必须**贴着屋面折线**走。早期版本用一条手写的两点直线，
   * 屋面的角部高度场与它对不上，戗脊就变成一根甩到屋面外的长刺——
   * 远看像屋檐上插了根签子。
   */
  function hipLine(sx, sz) {
    const pts = [];
    const N = 10;
    /**
     * ⚠⚠ **庑殿的戗脊必须从正脊端头起**。
     *
     * 原来不管什么屋顶，戗脊都从「山花底角 (xh, zBreak)」起步 ——
     * 那是**歇山**的做法（正脊到山花顶、山花下是垂脊）。
     * 庑殿没有山花：正脊直接到 (xh, 0)，戗脊自那儿沿 45° 斜线到檐角。
     * 照旧走法 ⇒ 戗脊与正脊之间**断开一大截**，角部露出一道豁口
     * （西洋楼庑殿顶看得最清楚）。
     */
    if (type === 'wudian') {
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const u = Wz * t; // 沿 45° 斜线的进深
        const x0 = sx * (xh + u);
        const z0 = sz * u;
        let y = heightAt(x0, z0);
        if (y === null) y = eaveY;
        const cn = Math.pow(Math.abs(x0) / Wx, 5) * Math.pow(Math.abs(z0) / Wz, 5);
        let x = x0;
        let z = z0;
        if (cn > 0.0005) {
          const eaveT = smoothstep(0.35, 1.0, Math.abs(z0) / Wz);
          y += upturn * cn * eaveT;
          x = x0 * (1 + (bulge * cn) / Math.max(Wx, 0.001));
          z = z0 * (1 + (bulge * cn) / Math.max(Wz, 0.001));
        }
        pts.push(new THREE.Vector3(x, y + 0.06, z));
      }
      return { pts, beastPts: null };
    }
    /**
     * ⚠ 卷棚歇山没有正脊（走卷棚脊），山墙端也不立山花 ——
     *   戗脊仍按旧走法从「山花底角 (xh, zBreak)」起步。
     */
    if (type === 'juanpengxieshan') {
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const x0 = sx * (xh + (Wx - xh) * t);
        const z0 = sz * (zBreak + (Wz - zBreak) * t);
        const y = yBreak - (yBreak - eaveY) * t;
        const cn = Math.pow(Math.abs(x0) / Wx, 5) * Math.pow(Math.abs(z0) / Wz, 5);
        let x = x0;
        let z = z0;
        let yy = y;
        if (cn > 0.0005) {
          const eaveT = smoothstep(0.35, 1.0, Math.abs(z0) / Wz);
          yy += upturn * cn * eaveT;
          x = x0 * (1 + (bulge * cn) / Math.max(Wx, 0.001));
          z = z0 * (1 + (bulge * cn) / Math.max(Wz, 0.001));
        }
        pts.push(new THREE.Vector3(x, yy + 0.06, z));
      }
      return { pts, beastPts: null };
    }
    /**
     * ⚠⚠ 2026-11-17 歇山的**垂脊 + 戗脊是同一条折线**：
     *   从**正脊端点 (xh, ridgeY, 0)** 斜下到檐角 (Wx, eaveY, Wz)，
     *   中途在折线高度处**折断一次** ⇒ 上段叫垂脊、下段叫戗脊
     *   （「正脊两端到屋檐处中间折断了一次，分为垂脊和戗脊」）。
     *
     *   原来这里从「山花底角 (xh, zBreak)」起、且高度自己线性给 ——
     *   那是**庑殿**的斜脊做法：歇山于是**少了整条垂脊**，
     *   正脊端到折线之间是空的，山墙端看着像缺了一块。
     *
     *   高度直接取 `heightAt` 在**垂脊平面线**上的值 ⇒ 与屋面网格同源，
     *   脊永远贴在屋面上，不会沉进去或浮起来。
     */
    const tB = zBreak / Wz; // 折断点（垂脊 → 戗脊）在这条平面线上的参数
    const NB = 10; // 垂脊段采样（这段短，要密）
    const NC = 16; // 戗脊段采样
    const beastPts = [];
    const pushPt = (t, isChui) => {
      const x0 = sx * (xh + (Wx - xh) * t);
      const z0 = sz * (Wz * t);
      let y = heightAt(x0, z0);
      if (y === null) y = eaveY;
      /**
       * ⚠⚠ **翼角抬升 + 外扩，必须和屋面网格用同一套公式**。
       *
       * 屋面网格在四角按 `cn = (|x|/Wx)^5·(|z|/Wz)^5` 抬升并外扩（起翘）。
       * 戗脊若只按"山花底角 → 檐角"的直线走，它就**沉在起翘后的屋面之下** ——
       * 画面上就是角部一片黄琉璃与褐色脊瓦互相穿插，
       * 看着像屋面破了个洞。
       *
       * 所以这里必须逐点复刻 `heightAt` 之后那段翼角处理。
       */
      const cn = Math.pow(Math.abs(x0) / Wx, 5) * Math.pow(Math.abs(z0) / Wz, 5);
      let x = x0;
      let z = z0;
      let yy = y;
      if (cn > 0.0005) {
        const eaveT = smoothstep(0.35, 1.0, Math.abs(z0) / Wz);
        yy += upturn * cn * eaveT;
        x = x0 * (1 + (bulge * cn) / Math.max(Wx, 0.001));
        z = z0 * (1 + (bulge * cn) / Math.max(Wz, 0.001));
      }
      const v = new THREE.Vector3(x, yy + 0.06, z);
      pts.push(v);
      if (isChui) beastPts.push(v);
    };
    for (let i = 0; i <= NB; i++) pushPt((i / NB) * tB, true);
    for (let i = 1; i <= NC; i++) pushPt(tB + (i / NC) * (1 - tB), false);
    /**
     * 走兽只排在**垂脊**上（清制：垂兽/行什在垂脊，戗兽在戗脊）。
     * 整条折线给 `buildBeastRow` 的话，兽会一路排到戗脊下端去。
     */
    return { pts, beastPts };
  }

  /* -------------------------------------------------------- 脊件几何 */
  // 脊的尺度：小建筑收小（大殿正脊宽 0.84m，亭轩收到 0.5m 上下）
  const rScale = Math.max(0.6, Math.min(1, Math.min(width, depth) / 16));
  for (const r of ridges) {
    if (r.kind === 'finial') {
      push('finial', buildFinial(r.apex, width));
      continue;
    }
    if (r.kind === 'hip') {
      // 垂脊 / 戗脊：沿戗脊线的一道脊（宽度小于正脊）
      const rw = 0.42;
      push('ridge', buildRidgeBar(r.pts, rw, 0.42, false));
      // 垂脊上的走兽：数量按清式制度（庑殿九兽 / 歇山五兽 / 悬山三兽）
      const n = BEAST_COUNT[type] ?? 5;
      if (n > 0) push('finial', buildBeastRow(r.beastPts ?? r.pts, 0.3, n));
      continue;
    }
    /**
     * 正脊（main）/ 卷棚脊（roll）：**有构造的正脊** ——
     *   脊座（水平线脚）+ 脊身（左右两排半圆筒瓦）+ 脊瓦（顶上一道凸条）。
     */
    for (const g of buildZhengJi(r.pts, { scale: rScale, heightAt })) {
      push('ridge', g);
    }
    // 正脊两端的鸱吻（跨在脊瓦上，不埋在脊身里）
    if (r.kind === 'main') {
      push(
        'finial',
        buildChiwen(r.pts, 0.8, RIDGE.seatHalfW * 2 * rScale + RIDGE.seatMold * 2 * rScale, 0.22)
      );
    }
  }

  /* ---------------------------------------------------------- 檐口构件 */
  push('eave', buildEaveTrim(Wx, Wz, eaveY, type, xh, Wz, Wx));
  push('finial', buildWadang(Wx, Wz, eaveY, type, xh));

  return {
    geoms,
    meta: { Wx, Wz, ridgeY, eaveY, xh, zBreak, yBreak, type },
    /**
     * 屋面表面高度（沿中轴 x=0 取），供屋架定位檩条。
     *
     * 屋架必须与屋面**共用同一个高度场**——否则歇山这种两段式屋面
     * 会把檩条定在屋面之上，脊檩直接戳出屋脊。
     * 这里取 x=0（屋脊轴线）的高度：正脊檩就在这条线上。
     */
    surfAt: (z) => {
      const y = heightAt(0, z);
      return y === null ? (yBreak ?? eaveY) : y;
    },
    /**
     * 完整二维高度场 `(x, z) => y`。
     *
     * 屋架的檩条要**分段**定位：歇山/庑殿的屋面在角部（戗脊一侧）
     * 明显低于中轴，通长檩在角部会顶出屋面。分段后每段按自己
     * 位置的屋面高度落位，角部那一段自然下沉。
     */
    surfAtXY: (x, z) => {
      // 山花区域 heightAt 返回 null（那里是竖直面，不是坡面）。
      // 屋架要定位檩条，需要一个数值——山花的**顶角就在脊线上**，
      // 所以回退到脊高，而不是山花底边高度。
      const y = heightAt(x, z);
      return y === null ? ridgeY : y;
    },
    /**
     * 屋脊实际存在的半宽（米）。
     * 歇山/卷棚歇山的屋脊只到山花边（xh）为止，两端是山花竖面；
     * 庑殿的屋脊可到出檐边。屋架据此决定脊檩铺多长——
     * 铺长了就会在山花处穿出来，或在屋脊两端凭空多出一截。
     */
    ridgeHalfWidth: xh,
  };
}

/**
 * 重檐建筑的下檐（腰檐）。
 *
 * 形制：外圈矩形檐口 → 内圈矩形（上檐的檐口），四面坡面 + 四角戗脊。
 * 四个坡面各由四个角点围成，四面共享四条斜向戗脊，既不重叠也不留缝。
 * 坡面按垄距铺真筒瓦，檐口排瓦当滴水，檐下一圈檐檩。
 *
 * @param {number} Wx 外檐口半宽（X）
 * @param {number} Wz 外檐口半深（Z）
 * @param {number} eaveY 下檐高度
 * @param {number} rise 下檐升起高度
 * @param {number} inset 内圈相对外圈的内收量
 */
function buildLowerEave(Wx, Wz, eaveY, rise, inset) {
  const geoms = new Map();
  const push = (k, g) => {
    if (!geoms.has(k)) geoms.set(k, []);
    geoms.get(k).push(g);
  };

  const ix = Wx - inset;
  const iz = Wz - inset;
  const yi = eaveY + rise;

  // 四个坡面：o = 外檐口两点，i = 内圈两点。四面共享斜向戗脊。
  const faces = [
    { o0: [-Wx, Wz], o1: [Wx, Wz], i0: [-ix, iz], i1: [ix, iz] }, // 南（+Z）
    { o0: [Wx, -Wz], o1: [-Wx, -Wz], i0: [ix, -iz], i1: [-ix, -iz] }, // 北（-Z）
    { o0: [Wx, Wz], o1: [Wx, -Wz], i0: [ix, iz], i1: [ix, -iz] }, // 东（+X）
    { o0: [-Wx, -Wz], o1: [-Wx, Wz], i0: [-ix, -iz], i1: [-ix, iz] }, // 西（-X）
  ];

  for (const f of faces) {
    // 坡面（平面梯形，四个角点）
    const p = [
      f.o0[0], eaveY, f.o0[1],
      f.o1[0], eaveY, f.o1[1],
      f.i1[0], yi, f.i1[1],
      f.i0[0], yi, f.i0[1],
    ];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute(
      'uv',
      new THREE.Float32BufferAttribute([0.02, 0, 0.17, 0, 0.17, 6, 0.02, 6], 2)
    );
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    push('tile', g);

    // 真筒瓦：沿坡向自外檐口铺到内圈
    const oLen = Math.hypot(f.o1[0] - f.o0[0], f.o1[1] - f.o0[1]);
    const count = Math.max(4, Math.floor(oLen / TILE.gang));
    for (let i = 0; i <= count; i++) {
      const s = i / count;
      const ox = f.o0[0] + (f.o1[0] - f.o0[0]) * s;
      const oz = f.o0[1] + (f.o1[1] - f.o0[1]) * s;
      const qx = f.i0[0] + (f.i1[0] - f.i0[0]) * s;
      const qz = f.i0[1] + (f.i1[1] - f.i0[1]) * s;
      const sampler = (t) => ({
        x: ox + (qx - ox) * t,
        y: eaveY + rise * t,
        z: oz + (qz - oz) * t,
      });
      for (const gg of buildTongWa(sampler, 0, 1)) push('tile', gg);
    }

    // 檐口：瓦当 + 滴水
    for (const gg of buildWadangEdge(
      [f.o0[0], f.o0[1]],
      [f.o1[0], f.o1[1]],
      eaveY,
      count
    )) {
      push('tile', gg);
    }

    // 檐下檐檩
    const lm = new THREE.BoxGeometry(
      Math.abs(f.o1[0] - f.o0[0]) || 0.16,
      0.2,
      Math.abs(f.o1[1] - f.o0[1]) || 0.16
    );
    lm.translate((f.o0[0] + f.o1[0]) / 2, eaveY - 0.14, (f.o0[1] + f.o1[1]) / 2);
    push('wood', lm);
  }

  // 四角戗脊：外檐角 → 内圈角
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pts = [
        new THREE.Vector3(sx * Wx, eaveY + 0.06, sz * Wz),
        new THREE.Vector3(sx * ix, yi + 0.04, sz * iz),
      ];
      push('ridge', buildRidgeBar(pts, 0.4, 0.38));
    }
  }

  return { geoms };
}

/**
 * 沿一条檐口线排瓦当（圆盘）与滴水（三角片）。
 * @param {[number,number]} p0 起点 [x,z]
 * @param {[number,number]} p1 终点 [x,z]
 */
/**
 * 一枚带纹样的瓦当。
 *
 * 清代瓦当正面有纹样：最常见的是「团寿」「万寿无疆」四字与团龙。
 * 这里用几何浮雕近似——外圈凸环 + 内盘 + 中心凸起（团寿的骨架），
 * 近看能认出"是一枚有字头的瓦当"，不是一个光板圆片。
 */
function buildWadangPiece(r) {
  const parts = [];
  // 盘身（略呈喇叭口）
  const disc = new THREE.CylinderGeometry(r * 0.96, r, 0.06, 12);
  disc.rotateX(Math.PI / 2);
  parts.push(disc);
  // 外圈凸环
  const rim = new THREE.TorusGeometry(r * 0.78, r * 0.1, 5, 12);
  parts.push(rim);
  // 中心"团寿"骨架：横竖两笔 + 中心小凸
  const bar = new THREE.BoxGeometry(r * 0.95, r * 0.2, 0.035);
  bar.translate(0, 0, 0.035);
  parts.push(bar);
  const bar2 = new THREE.BoxGeometry(r * 0.2, r * 0.95, 0.035);
  bar2.translate(0, 0, 0.035);
  parts.push(bar2);
  const boss = new THREE.SphereGeometry(r * 0.16, 6, 5);
  boss.scale(1, 1, 0.6);
  boss.translate(0, 0, 0.05);
  parts.push(boss);
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/**
 * 滴水（勾头）：清式为倒三角形的如意头，与瓦当相间。
 */
function buildDishiPiece(r) {
  const parts = [];
  const plate = new THREE.CylinderGeometry(r * 1.25, r * 1.05, 0.05, 3);
  parts.push(plate);
  // 如意头的卷云凸起
  const curl = new THREE.TorusGeometry(r * 0.5, r * 0.11, 5, 10, Math.PI * 1.4);
  curl.translate(0, r * 0.3, 0.03);
  parts.push(curl);
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

function buildWadangEdge(p0, p1, eaveY, count) {
  const parts = [];
  const r = 0.115;
  const dx = p1[0] - p0[0];
  const dz = p1[1] - p0[1];
  const len = Math.hypot(dx, dz) || 1;
  const dirX = dx / len;
  const dirZ = dz / len;
  // 外法线：垂直于檐口线、背向中心
  const cx = (p0[0] + p1[0]) / 2;
  const cz = (p0[1] + p1[1]) / 2;
  let nx = dirZ;
  let nz = -dirX;
  if (nx * cx + nz * cz < 0) {
    nx = -nx;
    nz = -nz;
  }
  const yaw = Math.atan2(nx, nz);
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const x = p0[0] + dx * t;
    const z = p0[1] + dz * t;
    const disc = buildWadangPiece(r);
    disc.rotateY(yaw);
    disc.translate(x + nx * 0.03, eaveY - 0.13, z + nz * 0.03);
    parts.push(disc);
    const drip = buildDishiPiece(r);
    drip.rotateY(yaw);
    drip.translate(x + nx * 0.11, eaveY - 0.27, z + nz * 0.11);
    parts.push(drip);
  }
  return parts;
}

/**
 * 鸱吻（正吻）：正脊两端的兽头饰件。
 *
 * ⚠ 原来吻兽整体贴在脊线上（底 -0.12h、顶 0.5h），
 *   而旧脊身是一根浮在脊线上方的管子 ⇒ 吻兽几乎全埋在管子里，
 *   只在脊端露出一小截。现在脊身是**实心的正脊**，
 *   吻兽必须**跨在脊瓦上**（baseY 抬高、宽度取脊座宽），
 *   否则会被脊身整个吃掉。
 *
 * @param {THREE.Vector3[]} pts 正脊两端
 * @param {number} h 吻兽尺度
 * @param {number} seatW 脊座宽（吻兽要跨在脊上，不能比脊还窄）
 * @param {number} baseY 吻兽底相对脊线的高度
 */
function buildChiwen(pts, h, seatW = 0.62, baseY = 0) {
  const parts = [];
  for (const end of [pts[0], pts[pts.length - 1]]) {
    // 主体
    const body = new THREE.BoxGeometry(h * 0.34, h * 0.62, seatW * 0.6);
    body.translate(0, h * 0.31, 0);
    parts.push(body);
    // 上卷的尾
    const curl = new THREE.CylinderGeometry(h * 0.16, h * 0.2, h * 0.42, 6);
    curl.rotateZ(end === pts[0] ? -0.5 : 0.5);
    curl.translate(end === pts[0] ? -h * 0.14 : h * 0.14, h * 0.72, 0);
    parts.push(curl);
    // 吻兽的嘴
    const snout = new THREE.BoxGeometry(h * 0.2, h * 0.16, seatW * 0.42);
    snout.translate(end === pts[0] ? h * 0.1 : -h * 0.1, h * 0.12, 0);
    parts.push(snout);
    for (const p of parts.slice(-3)) {
      p.translate(end.x, end.y + baseY, end.z);
    }
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/**
 * 清式垂脊小兽的制度（清工部《工程做法》）：
 *
 *   庑殿  九兽：仙人骑凤 → 龙 → 凤 → 狮子 → 天马 → 海马 → 狻猊 → 狎鱼 → 獬豸 →（行什）
 *   歇山  五兽
 *   悬山  三兽
 *   硬山 / 卷棚  无垂脊，也就无垂兽
 *
 * 排列顺序：**仙人骑凤在最高处**（垂脊与正脊的交点），行什在最下端。
 * 位置错乱（数量不对、顺序反了）在近景一眼就露馅——这是最容易考据的一项。
 */
const BEAST_COUNT = { wudian: 9, xieshan: 5, juanpengxieshan: 5, xuanshan: 3 };

/** 单只走兽：座 + 身 + 头 + 尾 */
function buildOneBeast(size, kind) {
  const parts = [];
  const body = new THREE.BoxGeometry(size * 0.52, size * 0.8, size * 0.46);
  body.translate(0, size * 0.55, 0);
  parts.push(body);
  // 头
  const head = new THREE.SphereGeometry(size * 0.28, 6, 5);
  head.scale(1, 0.85, 1.15);
  head.translate(0, size * 1.02, size * 0.1);
  parts.push(head);
  // 耳/角
  const ear = new THREE.ConeGeometry(size * 0.1, size * 0.26, 4);
  ear.rotateZ(0.4);
  ear.translate(-size * 0.12, size * 1.2, size * 0.02);
  parts.push(ear);
  const ear2 = ear.clone();
  ear2.translate(size * 0.24, 0, 0);
  parts.push(ear2);
  // 尾
  const tail = new THREE.ConeGeometry(size * 0.12, size * 0.5, 4);
  tail.rotateX(-0.9);
  tail.translate(0, size * 0.72, -size * 0.34);
  parts.push(tail);
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/** 仙人骑凤：仙人跨坐在凤背上 */
function buildRidingImmortal(size) {
  const parts = [];
  // 凤身
  const bird = new THREE.BoxGeometry(size * 0.5, size * 0.4, size * 0.9);
  bird.translate(0, size * 0.28, 0);
  parts.push(bird);
  const neck = new THREE.CylinderGeometry(size * 0.1, size * 0.14, size * 0.45, 5);
  neck.rotateX(-0.5);
  neck.translate(0, size * 0.62, size * 0.34);
  parts.push(neck);
  const birdHead = new THREE.SphereGeometry(size * 0.15, 5, 4);
  birdHead.translate(0, size * 0.82, size * 0.48);
  parts.push(birdHead);
  const tail = new THREE.ConeGeometry(size * 0.16, size * 0.6, 4);
  tail.rotateX(1.1);
  tail.translate(0, size * 0.46, -size * 0.56);
  parts.push(tail);
  // 仙人
  const body = new THREE.BoxGeometry(size * 0.34, size * 0.5, size * 0.3);
  body.translate(0, size * 0.72, -size * 0.02);
  parts.push(body);
  const head = new THREE.SphereGeometry(size * 0.16, 5, 4);
  head.translate(0, size * 1.04, -size * 0.02);
  parts.push(head);
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/**
 * 垂脊上的一列小兽。
 * @param {THREE.Vector3[]} pts 垂脊线（t=0 在正脊交点，t=1 在檐角）
 * @param {number} size 小兽尺寸
 * @param {number} count 兽数（庑殿 9 / 歇山 5 / 悬山 3）
 */
function buildBeastRow(pts, size, count) {
  const parts = [];
  const curve = new THREE.CatmullRomCurve3(pts);
  const place = (t, geo) => {
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    geo.rotateY(Math.atan2(tan.x, tan.z));
    geo.translate(p.x, p.y + size * 0.12, p.z);
    parts.push(geo);
  };
  if (count <= 0) {
    const merged0 = mergeGeometries(parts, false);
    return merged0;
  }
  // 仙人骑凤在最高处（正脊交点）
  place(0.07, buildRidingImmortal(size * 1.15));
  // 走兽依次向下
  const beasts = count - 1;
  for (let i = 0; i < beasts; i++) {
    const t = 0.2 + (i / beasts) * 0.66;
    place(t, buildOneBeast(size, i));
  }
  // 行什：最下端的一对小兽
  place(0.93, buildOneBeast(size * 0.62, 0));
  place(0.99, buildOneBeast(size * 0.62, 0));
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}



/** 硬山/悬山山墙的起坡点：屋面与山墙的交线 z */
function zBreakGable(Wz, eaveY, rise) {
  // 屋面在山墙处的高度 = eaveY + rise*(1-fold(t))，山墙从 eaveY 起到该高度
  // 取 t 使其约 0.42*rise，简化用折线求解
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const y = eaveY + rise * (1 - Math.pow(mid, P_CURVE));
    if (y < eaveY + rise * 0.42) lo = mid;
    else hi = mid;
  }
  return Wz * hi;
}

/** 正脊/垂脊：一串截面沿折线扫掠 */
/* ================================================================
 * 瓦作：把屋面做成真正的构件，而不是"贴了瓦片贴图的曲面"
 *
 * 组成：
 *   板瓦   铺在椽上的平瓦带（底面）
 *   筒瓦   每垄一道半圆筒瓦，沿坡向逐段铺（真的是半圆管）
 *   瓦当   檐口一排圆形瓦当
 *   滴水   瓦当之间的三角形滴水
 *   椽头   檐下露出的椽头一排
 *   飞椽   椽头上方斜出的飞椽一排
 *   脊筒   正脊/垂脊由小筒瓦逐个垒起
 * ================================================================ */

const TILE = {
  gang: 0.42,      // 垄距（筒瓦中心到中心）
  tongR: 0.115,    // 筒瓦半径
  banW: 0.3,       // 板瓦宽
  rafterGap: 0.42, // 椽间距
  rafterR: 0.055,  // 椽半径
};

/**
 * 在给定坡面上铺一垄筒瓦。
 * @param {(t:number)=>{x:number,y:number,z:number}} sampler t∈[0,1] 沿坡向取点
 */
function buildTongWa(sampler, t0, t1) {
  // 整垄生成**一个**几何体（早前每段一个，40 万个对象直接把加载拖到十几秒）
  // 网格密度：半圆断面 5 段足够圆滑；坡向 7 段足以表达翼角起翘。
  // 再密下去只是把三角面数翻倍（真瓦是全园最大的一笔几何开销）。
  const steps = 7;
  const ring = 5;
  const R = TILE.tongR;
  const verts = [];
  const uvs = [];
  const idx = [];

  // UV 约定：
  // 贴图横向一个循环含 6 垄瓦（程序化贴图 textures.js 的 cols），纵向一个循环含 6 层瓦当。
  // 一根筒瓦 = 一垄，所以 u 只取其中一垄的窗口。
  //
  // ⚠ 但 **AI 生成的 tile.png 并没有"6 垄"结构**（U 方向是均匀的灰面），
  // 窄条采样会命中贴图里的高光斑——一垄筒瓦整根发白，远看屋面像铺了白铁皮。
  // 所以这里取**每垄各自的一小段**（按垄序错开），既避开窄条里的固定亮斑，
  // 又让相邻筒瓦的色差来自贴图的不同位置，而不是纯色块。
  // 瓦的**形体**由几何提供，贴图只负责连续表面的苔痕与旧化。
  const U0 = 0.02;
  const U1 = 0.17;
  // 每垄沿 U 方向错开一点（覆盖贴图 1/3 宽度），避免所有垄采到同一条亮斑
  const uShift = (t0 - 0) * 0.31;

  let prevSide = null;
  for (let i = 0; i <= steps; i++) {
    const t = t0 + ((t1 - t0) * i) / steps;
    const p = sampler(t);
    const pt = sampler(Math.min(t1, t + 0.001));
    let side = new THREE.Vector3(-(pt.z - p.z), 0, pt.x - p.x);
    if (side.lengthSq() < 1e-8) side = prevSide ? prevSide.clone() : new THREE.Vector3(1, 0, 0);
    side.normalize();
    prevSide = side;
    const up = new THREE.Vector3(0, 1, 0);
    // 半圆断面：沿垄向排 7 个点
    for (let k = 0; k <= ring; k++) {
      const a = (k / ring) * Math.PI;
      const ox = Math.cos(a) * R;
      const oy = Math.sin(a) * R;
      verts.push(
        p.x + side.x * ox + up.x * oy,
        p.y + side.y * ox + up.y * oy,
        p.z + side.z * ox + up.z * oy
      );
      uvs.push(U0 + uShift + (k / ring) * (U1 - U0), (i / steps) * 6);
    }
  }
  const stride = ring + 1;
  for (let i = 0; i < steps; i++) {
    for (let k = 0; k < ring; k++) {
      const a = i * stride + k;
      /**
       * ⚠⚠ **绕向必须是"外法线朝外"**，否则整垄筒瓦会被背面剔除 ——
       *   three.js 默认 `FrontSide`，法线朝内的半圆管从外面看是**看不见的**：
       *   屋面只剩底下的板瓦，近看就是"屋面缺了一大块、露出梁架"。
       *
       *   推导：断面切向 d/da[side·cos a + up·sin a] = -side·sin a + up·cos a，
       *   垄向 T。法线 = (断面切向) × T。
       *   取垄向 +X 时 side = +Z、up = +Y ⇒ 法线 = Y × X = -Z（**朝内，错**）；
       *   交换两个顶点后 = X × Y = +Z（朝外，对）。
       *
       *   验算脚本：`scripts/check-roof-winding.mjs`
       *   （之前它报「桶 tile 法线朝下 100%」，就是这个绕反了。）
       */
      idx.push(a, a + stride, a + 1, a + stride, a + stride + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return [g];
}

/** 檐口一排：瓦当（圆盘）+ 滴水（三角） */
function buildWadang(Wx, Wz, eaveY, count, sign = 1) {
  const parts = [];
  const r = 0.115;
  for (let i = 0; i <= count; i++) {
    const x = -Wx + (i * Wx * 2) / count;
    // 瓦当：带纹样的圆盘（团寿骨架 + 外圈凸环），朝外
    const d = buildWadangPiece(r);
    if (sign < 0) d.rotateY(Math.PI);
    d.translate(x, eaveY - 0.12, sign * (Wz - 0.02));
    parts.push(d);
    // 滴水：如意头三角片，与瓦当相间
    const t = buildDishiPiece(r);
    if (sign < 0) t.rotateY(Math.PI);
    t.rotateY(Math.PI / 2);
    t.translate(x + Wx / count, eaveY - 0.22, sign * (Wz + 0.03));
    parts.push(t);
  }
  return parts;
}

/** 椽头 + 飞椽（檐下两排） */
/**
 * 檐下构造：连檐 · 檐檩 · 椽头 · 飞椽
 *
 * 清式檐口从下往上看是这么一排：
 *   最外  一圈**圆形**椽头（截面是圆的，这是中式屋檐最强的识别特征）
 *   椽头后 斜出的方料**飞椽**（端头按举折角斜切）
 *   再后   通长的**连檐**（把所有椽头串起来的方木）
 *   最里   承椽的圆木**檐檩**
 *
 * 之前只有两个方盒子，近看就是"贴图放大的板"。
 */
function buildRafters(Wx, Wz, eaveY, count, sign = 1) {
  // 椽头与飞椽是**素木**，不是红漆木件——放进 wood 桶会变成一排红圆盘。
  // 分成两个桶：wood（连檐、檐檩，漆作）与 eave（椽头、飞椽，素木深褐）。
  const wood = [];
  const eave = [];
  const r = TILE.rafterR;

  // 连檐：沿檐口通长的一根方木（漆作）
  const lianYan = new THREE.BoxGeometry(Wx * 2, r * 2.2, r * 2.6);
  lianYan.translate(0, eaveY - 0.46, sign * (Wz - 0.5));
  wood.push(lianYan);

  // 檐檩：圆木，承住椽头（藏在檐内）
  const yanLin = new THREE.CylinderGeometry(r * 1.6, r * 1.6, Wx * 2, 8);
  yanLin.rotateZ(Math.PI / 2);
  yanLin.translate(0, eaveY - 0.72, sign * (Wz - 1.05));
  wood.push(yanLin);

  const pitch = 0.42; // 飞椽出挑角（与屋面举折相呼应）
  for (let i = 0; i <= count; i++) {
    const x = -Wx + (i * Wx * 2) / count;

    // 飞椽：方料，斜向外挑，端头按坡角斜切
    const flyLen = 0.62;
    const fly = new THREE.BoxGeometry(r * 1.7, r * 1.5, flyLen);
    fly.rotateX(-sign * pitch);
    fly.translate(x, eaveY - 0.34 - Math.sin(pitch) * flyLen * 0.5, sign * (Wz - 0.72));
    eave.push(fly);

    // 椽头：**圆形**截面，端头微斜（与飞椽同角）
    const headLen = 0.46;
    const head = new THREE.CylinderGeometry(r * 1.25, r * 1.15, headLen, 8);
    head.rotateX(Math.PI / 2);
    head.rotateX(sign * pitch * 0.35);
    head.translate(x, eaveY - 0.30, sign * (Wz - 0.10));
    eave.push(head);
  }
  return { wood, eave };
}

/* ================================================================
 * 正脊：脊座 + 脊身（左右两排筒瓦）+ 脊瓦
 *
 * ⚠⚠ 为什么要重建（2026-11-17 实测）：
 *   原来的正脊是三样东西拼的，远看是一条**零起伏的平带**：
 *   ① `buildRidgeBar` 的 ExtrudeGeometry —— three.js r170 的路径挤出把断面
 *      local-y 映射成**朝下**（binormal = -up）⇒ 整条脊身沉进屋面、看不见；
 *      而"端头背面盖"用的是**未变换的原始 2D 坐标**
 *      ⇒ 脊端凭空多出一块**平贴的色板**（"正脊是一块平黄板"的真凶）。
 *   ② 一根浮在脊线上方 0.5m 的光滑 TubeGeometry（读作一根塑料管）。
 *   ③ 一排半径 8.5cm 的小半圆筒（`buildXiTong`，读作一排小点）。
 *
 * 现在按清式做法重建三段：
 *   脊座  正脊下方一道**水平**的线脚（同时把脊身沉进屋面，不漏缝）
 *   脊身  左右两排**半圆筒瓦**沿脊线垒起（断面半圆，直径 0.35m）——真几何
 *   脊瓦  压在两排筒瓦上的一道凸条
 * ================================================================ */

/**
 * 清式正脊的三段尺寸（米）。
 *
 * 依据：清工部《工程做法》正脊做法 —— 脊身以筒瓦垒砌，脊下有砖砌脊座
 * （线脚），脊上压脊瓦；垂脊做法同制而略小。
 */
const RIDGE = {
  seatHalfW: 0.34,   // 脊座（墙身）半宽
  seatTop: 0.16,     // 脊座顶（相对屋脊线）
  seatMold: 0.05,    // 脊座顶枭（凸出的线脚）
  bodyR: 0.175,      // 脊身筒瓦半径（直径 0.35m）
  tileLen: 0.30,     // 单片脊筒长
  tilePitch: 0.34,   // 脊筒间距（留缝 ⇒ 有分段）
  ring: 4,           // 筒瓦断面分段
  capHalfW: 0.26,    // 脊瓦半宽
  capRise: 0.31,     // 脊瓦高出脊座顶
};

const RIDGE_UP = new THREE.Vector3(0, 1, 0);

/**
 * 脊线的标架：(across=side, up=upv, forward=tan) 右手系。
 * @param {THREE.Vector3} tan 脊线切向
 */
function ridgeFrame(tan) {
  const side = new THREE.Vector3().crossVectors(RIDGE_UP, tan);
  if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
  side.normalize();
  const upv = new THREE.Vector3().crossVectors(tan, side).normalize();
  return { side, upv };
}

/**
 * 把 2D 断面沿 3D 路径扫掠成实体，顶点直接累加进同一组数组。
 *
 * ⚠⚠ **不用 ExtrudeGeometry 的 extrudePath**：
 *   three.js r170 的路径挤出有两个坑（AGENTS §4.1.7 同类）：
 *   ① 断面 local-y 映射成**朝下** ⇒ 脊身整条沉进屋面；
 *   ② 端头"背面盖"用的是**未变换的原始 2D 坐标**
 *      ⇒ 脊端凭空多出一块平贴的色板。
 *   这里自己算标架，断面 y 恒为"向上"，绕向保证**外法线朝外**。
 *
 * @param {{pos:number[],uv:number[],idx:number[]}} acc 累加器
 * @param {{p:THREE.Vector3,tan:THREE.Vector3,side:THREE.Vector3,upv:THREE.Vector3}[]} stations 路径站
 * @param {Array<[number,number]>} profile 断面点（across, up），**逆时针**
 */
function sweepInto(acc, stations, profile) {
  const n = profile.length;
  const base = acc.pos.length / 3;
  let arc = 0;
  for (let i = 0; i < stations.length; i++) {
    const st = stations[i];
    if (i > 0) arc += st.p.distanceTo(stations[i - 1].p);
    for (let j = 0; j < n; j++) {
      const ax = profile[j][0];
      const up = profile[j][1];
      acc.pos.push(
        st.p.x + st.side.x * ax + st.upv.x * up,
        st.p.y + st.side.y * ax + st.upv.y * up,
        st.p.z + st.side.z * ax + st.upv.z * up
      );
      acc.uv.push(arc, j / (n - 1));
    }
  }
  const stride = n;
  for (let i = 0; i < stations.length - 1; i++) {
    for (let j = 0; j < n; j++) {
      const j2 = (j + 1) % n;
      const a = base + i * stride + j;
      const b = base + (i + 1) * stride + j;
      const c = base + (i + 1) * stride + j2;
      const d = base + i * stride + j2;
      /**
       * 绕向：断面逆时针 ⇒ 侧面法线朝外。
       *   验算：path 沿 +X、side=-Z、up=+Y 时，底边三角形 (a,c,b)
       *   的法线 = (c-a)×(b-a) = (0,-8,0) ⇒ 朝下 = 底边的外法线 ✓。
       */
      acc.idx.push(a, c, b, a, d, c);
    }
  }
  ridgeCapInto(acc, stations[0], profile, true);
  ridgeCapInto(acc, stations[stations.length - 1], profile, false);
}

/**
 * 扫掠体的端盖（断面形心扇形）。
 * @param {boolean} isStart 起点盖朝 -tangent，绕向与终点盖相反
 */
function ridgeCapInto(acc, st, profile, isStart) {
  const n = profile.length;
  let cx = 0;
  let cy = 0;
  for (const p of profile) {
    cx += p[0];
    cy += p[1];
  }
  cx /= n;
  cy /= n;
  const base = acc.pos.length / 3;
  acc.pos.push(
    st.p.x + st.side.x * cx + st.upv.x * cy,
    st.p.y + st.side.y * cx + st.upv.y * cy,
    st.p.z + st.side.z * cx + st.upv.z * cy
  );
  acc.uv.push(0, 0.5);
  for (let j = 0; j < n; j++) {
    const ax = profile[j][0];
    const up = profile[j][1];
    acc.pos.push(
      st.p.x + st.side.x * ax + st.upv.x * up,
      st.p.y + st.side.y * ax + st.upv.y * up,
      st.p.z + st.side.z * ax + st.upv.z * up
    );
    acc.uv.push(0, j / n);
  }
  for (let j = 0; j < n; j++) {
    const j2 = (j + 1) % n;
    // 断面逆时针 ⇒ (形心, j, j+1) 的法线朝 +tangent（终点盖）；
    // 起点盖要朝 -tangent ⇒ 绕向反过来。
    if (isStart) acc.idx.push(base, base + 1 + j2, base + 1 + j);
    else acc.idx.push(base, base + 1 + j, base + 1 + j2);
  }
}

/**
 * 半圆筒瓦的断面：圆心在 (a0, yBase)、半径 R 的**上半圈** + 底边弦。
 * 逆时针 ✓（绕 a0 → 顶 → -a0，再沿底边回来）。
 */
function halfDiscProfile(a0, R, ring, yBase) {
  const p = [];
  for (let k = 0; k <= ring; k++) {
    const a = (k / ring) * Math.PI;
    p.push([a0 + R * Math.cos(a), yBase + R * Math.sin(a)]);
  }
  return p;
}

/**
 * 脊两侧屋面的高差（米）。
 *
 * 正脊坐在屋面的**脊线**上，而举折曲面在脊线附近极陡
 * （fold(t)=t^0.62 ⇒ t→0 时斜率→∞），
 * 所以脊座必须**沉进屋面**若干，否则脊与屋面之间会露出一条黑缝。
 * 这里沿"垂直于脊线"的方向取样，求屋面相对脊线的最大下落量。
 *
 * @param {THREE.Vector3[]} pts 脊线
 * @param {(x:number,z:number)=>number|null} heightAt 屋面高度场
 * @param {number} halfW 取样距离（脊座半宽）
 */
function ridgeRoofDrop(pts, heightAt, halfW) {
  const mid = Math.floor(pts.length / 2);
  const p = pts[mid];
  const a = pts[Math.max(0, mid - 1)];
  const b = pts[Math.min(pts.length - 1, mid + 1)];
  const tx = b.x - a.x;
  const tz = b.z - a.z;
  const L = Math.hypot(tx, tz);
  if (L < 1e-6) return 0;
  const px = -tz / L;
  const pz = tx / L;
  let drop = 0;
  for (const s of [1, -1]) {
    const y = heightAt(p.x + px * halfW * s, p.z + pz * halfW * s);
    if (y === null || y === undefined || Number.isNaN(y)) continue;
    drop = Math.max(drop, p.y - y);
  }
  return Math.max(0, drop);
}

/**
 * 生成一条**有构造的正脊**（脊座 + 脊身 + 脊瓦）。
 *
 * @param {THREE.Vector3[]} points 正脊线（首尾为脊的两端）
 * @param {object} opts
 * @param {number} opts.scale 尺度（小建筑收小）
 * @param {(x:number,z:number)=>number|null} opts.heightAt 屋面高度场
 * @returns {THREE.BufferGeometry[]}
 */
function buildZhengJi(points, opts = {}) {
  const s = opts.scale ?? 1;
  const heightAt = opts.heightAt;
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.05);
  const len = curve.getLength();
  if (len < 0.6) return [];

  const HW = RIDGE.seatHalfW * s;
  const TOP = RIDGE.seatTop * s;
  const MOLD = RIDGE.seatMold * s;
  const R = RIDGE.bodyR * s;

  // ---- 路径站（标架）----
  const nSt = Math.max(2, Math.min(64, Math.ceil(len / 1.2)));
  const stations = [];
  for (let i = 0; i <= nSt; i++) {
    const t = i / nSt;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t).normalize();
    const { side, upv } = ridgeFrame(tan);
    stations.push({ p, tan, side, upv });
  }

  /**
   * 脊座底：沉到屋面以下（比屋面再低 12cm），
   * 保证脊身与屋面之间**没有缝**。
   * 取所有站里**最深**的那个 ⇒ 卷棚脊两端下沉时也不会漏。
   */
  let bottom = -0.5;
  if (heightAt) {
    const drop = ridgeRoofDrop(points, heightAt, HW);
    bottom = -drop - 0.12;
    for (const st of stations) {
      const surf = heightAt(st.p.x, st.p.z);
      if (surf === null || surf === undefined || Number.isNaN(surf)) continue;
      bottom = Math.min(bottom, surf - st.p.y - 0.12);
    }
  }

  const acc = { pos: [], uv: [], idx: [] };

  /* ---- 脊座：水平的一道线脚（顶面平直，侧壁沉进屋面）---- */
  const seatProfile = [
    [-HW, bottom],
    [HW, bottom],
    [HW, TOP - MOLD],
    [HW + MOLD, TOP],
    [-(HW + MOLD), TOP],
    [-HW, TOP - MOLD],
  ];
  sweepInto(acc, stations, seatProfile);

  /* ---- 脊身：左右两排半圆筒瓦沿脊线垒起 ---- */
  const pitch = RIDGE.tilePitch * s;
  const tLen = RIDGE.tileLen * s;
  const nTile = Math.max(1, Math.floor(len / pitch));
  for (const dir of [1, -1]) {
    const prof = halfDiscProfile(dir * R, R, RIDGE.ring, TOP);
    for (let i = 0; i < nTile; i++) {
      const u0 = (i * pitch) / len;
      const u1 = Math.min(1, (i * pitch + tLen) / len);
      if (u1 <= u0 + 1e-4) break;
      const st = [];
      for (let k = 0; k <= 1; k++) {
        const u = u0 + (u1 - u0) * k;
        const p = curve.getPointAt(u);
        const tan = curve.getTangentAt(u).normalize();
        const { side, upv } = ridgeFrame(tan);
        st.push({ p, tan, side, upv });
      }
      sweepInto(acc, st, prof);
    }
  }

  /* ---- 脊瓦：压在两排筒瓦上的一道凸条 ---- */
  const CHW = RIDGE.capHalfW * s;
  const capTop = TOP + RIDGE.capRise * s;
  const capProfile = [
    [-CHW, TOP - 0.02 * s],
    [CHW, TOP - 0.02 * s],
    [CHW, TOP + 0.12 * s],
    [0.11 * s, capTop],
    [-0.11 * s, capTop],
    [-CHW, TOP + 0.12 * s],
  ];
  sweepInto(acc, stations, capProfile);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(acc.pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(acc.uv, 2));
  g.setIndex(acc.idx);
  g.computeVertexNormals();
  return [g];
}

function buildRidgeBar(points, width, height, addTube = true) {
  const parts = [];
  const shape = new THREE.Shape();
  const w = width / 2;
  const h = height;
  shape.moveTo(-w, 0);
  shape.lineTo(-w * 0.85, h);
  shape.lineTo(0, h * 1.18);
  shape.lineTo(w * 0.85, h);
  shape.lineTo(w, 0);
  shape.closePath();

  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.05);
  const segs = Math.max(4, Math.min(64, points.length * 6));
  const geo = new THREE.ExtrudeGeometry(shape, {
    steps: segs,
    bevelEnabled: false,
    extrudePath: curve,
  });
  parts.push(geo);

  /**
   * **脊上垒一道筒瓦**。
   *
   * ⚠ 原来正脊/垂脊只是一条**挤出来的梯形** ⇒ 平滑着色把它渲成一根
   *   **光溜溜的灰管子**，远看像塑料管，不像瓦垒的脊。
   *   清式的正脊/垂脊是**一排筒瓦立着垒上去**的，脊顶那道圆弧
   *   才是它的辨识特征（脊兽也骑在这道瓦上）。
   */
  const r = width * 0.23;
  if (addTube) {
    const tube = new THREE.TubeGeometry(curve, segs, r, 8, false);
    // 沉进脊身，只露出上半截 ⇒ 读作"瓦垒的脊"而不是"一根管子"
    tube.translate(0, height * 0.9 - r * 0.42, 0);
    parts.push(tube);
  }

  /**
   * ⚠⚠ **合并前必须统一索引状态**。
   *   `ExtrudeGeometry` 是 **non-indexed**，`TubeGeometry` 是 **indexed**
   *   ⇒ `mergeGeometries` 直接**返回 null**（只在 console 打一行 error），
   *   null 传下去 ⇒ **整条正脊/垂脊消失** ⇒ 山面敞着口，
   *   从外面直接看见屋架与望板（AGENTS.md §4.1.7 第一条）。
   */
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  const merged = mergeGeometries(flat, false);
  if (!merged) {
    throw new Error(
      `buildRidgeBar: mergeGeometries 返回 null（索引状态不一致），脊会整条消失`
    );
  }
  for (const p of flat) p.dispose();
  for (const p of parts) if (!flat.includes(p)) p.dispose();
  return merged;
}

/** 攒尖宝顶 */
function buildFinial(apex, width) {
  const parts = [];
  const r = Math.min(1.1, width * 0.055);
  const base = new THREE.CylinderGeometry(r * 1.25, r * 1.4, r * 0.8, 12);
  base.translate(apex.x, apex.y + r * 0.4, apex.z);
  parts.push(base);
  const ball = new THREE.SphereGeometry(r, 12, 10);
  ball.translate(apex.x, apex.y + r * 1.3, apex.z);
  parts.push(ball);
  const neck = new THREE.CylinderGeometry(r * 0.45, r * 0.8, r * 0.9, 10);
  neck.translate(apex.x, apex.y + r * 2.1, apex.z);
  parts.push(neck);
  const flame = new THREE.ConeGeometry(r * 0.6, r * 1.6, 10);
  flame.translate(apex.x, apex.y + r * 3.1, apex.z);
  parts.push(flame);
  return mergeGeometries(parts, false);
}

/** 檐口：檐檩条 + 椽头 + 瓦当 */
function buildEaveTrim(Wx, Wz, eaveY, type, xh, wz, wx) {
  const parts = [];
  const t = 0.16;
  const h = 0.26;
  // 前后檐口条
  for (const sz of [-1, 1]) {
    const g = new THREE.BoxGeometry(Wx * 2, h, t);
    g.translate(0, eaveY - h / 2 + 0.05, sz * Wz);
    parts.push(g);
  }
  // 两端檐口条（庑殿/歇山是斜脊，只在山花段有）
  if (type === 'xuanshan' || type === 'yingshan' || type === 'juanpeng') {
    for (const sx of [-1, 1]) {
      const g = new THREE.BoxGeometry(t, h, Wz * 2);
      g.translate(sx * Wx, eaveY - h / 2 + 0.05, 0);
      parts.push(g);
    }
  }
  // 椽头：沿前后檐每 0.45m 一根
  const step = 0.45;
  const count = Math.max(4, Math.floor((Wx * 2) / step));
  const rafter = new THREE.BoxGeometry(0.1, 0.1, 0.42);
  for (let i = 0; i < count; i++) {
    const x = -Wx + (i + 0.5) * (Wx * 2 / count);
    for (const sz of [-1, 1]) {
      const g = rafter.clone();
      g.translate(x, eaveY - 0.12, sz * (Wz - 0.2));
      parts.push(g);
    }
  }
  rafter.dispose?.();
  return mergeGeometries(parts, false);
}
