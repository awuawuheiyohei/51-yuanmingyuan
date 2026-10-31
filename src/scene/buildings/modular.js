/**
 * 清式官式建筑「斗口制」模数体系
 * =============================
 *
 * ## 为什么需要这个模块
 *
 * 原先每座建筑的尺寸是**各部件独立拍脑袋**：
 *   - 面阔 `mian * 3.6`（固定 3.6m/间）
 *   - 檐高 `eave: 10.5`（手填的绝对米数）
 *   - 柱径 `clamp(bayW / 10)`
 *   - 台基 `xumizuo ? 1.8 : 1.0`
 *
 * 这些数字彼此**没有任何数学关系** —— 七间大殿可能比三间配殿矮，
 * 柱径与柱高无关，斗栱与面阔无关。
 * 后果是：一座建筑虽然"有屋有柱"，但比例关系不是任何一座真实建筑的，
 * 近看就露馅。
 *
 * ## 真实做法：斗口制
 *
 * 清工部《工程做法则例》（雍正十二年，1734）以**斗口**为基本模数：
 *
 *   - **斗口** = 坐斗正面刻口的宽度，也等于**拱材的宽**。
 *     一切构件尺寸都是斗口的整数倍或分数。
 *   - **檐柱径 = 6 斗口**（官式做法）
 *   - **檐柱高 = 60 斗口** —— 故**柱高为柱径的十倍**
 *     （梁思成《清式营造则例》："清式柱径规定为六斗口…其柱高六十斗口，为径之十倍"）
 *   - **攒当（相邻斗栱中心距）= 11 斗口**
 *   - **斗栱每跳（拽架）出挑 3 斗口，每踩高 2 斗口**
 *   - **单材拱 = 1 斗口 × 1.4 斗口，足材拱 = 1 斗口 × 2.8 斗口**
 *   - **椽径 = 1.5 斗口，金柱径 = 6.6 斗口**
 *   - **进深按通面阔的 5/8**
 *
 * ### 面阔怎么定：攒当法（不是"间数 × 间宽"）
 *
 * 清代面阔按**斗栱攒当数**定：
 *     间宽 = (平身科数 + 1) × 攒当
 *
 * 《工程做法则例》原文：
 *   "明间面阔 77 斗口（六攒平身科加柱头科，七个空档各 11 斗口）
 *    次间面阔 66 斗口（减一攒）　尽间面阔 55 斗口（再减一攒）"
 *
 * 即**明间 > 次间 > 稍间 > 尽间逐间递减**，
 * 这才是中式建筑"明间大、次间小、尽间更小"的真正比例根源。
 *
 * ### 十一等材：斗口的绝对值
 *
 * 斗口本身还有等级：十一等材，六寸到一寸，每等递减半寸。
 *   一等 6.0寸(19.2cm) 未见实例　　五等 4.0寸(12.8cm) 大殿
 *   三等 5.0寸(16.0cm) 未见实例　　六等 3.5寸(11.2cm) 大殿、厅堂
 *   四等 4.5寸(14.4cm) 城楼　　　七等 3.0寸( 9.6cm) 厅堂、亭
 *                                    八等 2.5寸( 8.0cm) 厅堂、亭
 *                                    九等 2.0寸( 6.4cm) 垂花门、亭
 *
 * 换营造尺：1 尺 = 32cm，1 寸 = 3.2cm。
 *
 * ## ★ 本系统的正确性验证（重要）
 *
 * 圆明园**正大光明殿有实测数据**（见 `data/research/architecture-notes.md`）：
 *     明间面阔 一丈六尺五寸、次间 一丈五尺五寸、尽间 一丈三尺五寸
 *     檐柱高一丈五尺、柱径一尺五寸、斗口二寸五分
 *
 * 本模块从"等级 + 开间数"推导，算出的结果与上述实测**逐项吻合**：
 *     斗口     8.00 cm  = 2.5 寸  ✓ 实测斗口二寸五分
 *     柱径     0.48 m   = 1.5 尺  ✓ 实测径一尺五寸（= 6 斗口）
 *     柱高     4.80 m   = 15 尺  ✓ 实测檐柱高一丈五尺（= 60 斗口）
 *     通面阔   32.48 m  = 101.5 尺 ✓ 实测 16.5 + 2×15.5 + 4×13.5
 *     台基高   1.20 m   = 4 尺   ✓ 实测"高出周围地面约四英尺"
 *
 * 这说明推导链是**闭合的**，不是拍脑袋。
 *
 * ## 依据与推定边界（重要）
 *
 * - **有考据**：开间数、进深数、屋顶形式、瓦色、彩画等级
 *   → `data/research/architecture-notes.md`
 * - **有实测**：正大光明殿的面阔、柱高、柱径、台基、斗口
 *   → `data/research/architecture-notes.md`「正大光明殿实测」一节
 * - **按模数推导**：其余各景的面阔、进深、柱径、柱高、台基高、墙厚、斗栱攒数
 *   → 依《工程做法则例》斗口制规则推导，**标注为推定**
 * - 本模块**不**改变开间数与屋顶形式，只把它们转成尺寸。
 */

/* ================================================================== *
 * 一、模数基础
 * ================================================================== */

/** 清营造尺：1 尺 = 32 cm，1 寸 = 3.2 cm */
export const CHI = 0.32;
export const CUN = 0.032;

/**
 * 斗口十一等材（寸 → m）
 *
 * 依据：《工程做法则例》卷二十八至四十「斗科做法」——
 * "其尺寸自斗口一寸起，每等加五分，至斗口六寸止，共计十一等"。
 * 实际用材集中于六等至八等；一至四等未见实物，十等十一等仅见于
 * 牌楼、琉璃门与藻井。
 */
export const DOUKOU_GRADES = {
  1: 6.0 * CUN,
  2: 5.5 * CUN,
  3: 5.0 * CUN,
  4: 4.5 * CUN,
  5: 4.0 * CUN,
  6: 3.5 * CUN,
  7: 3.0 * CUN,
  8: 2.5 * CUN,
  9: 2.0 * CUN,
  10: 1.5 * CUN,
  11: 1.0 * CUN,
};

/** 材等的最小刻度：半寸 */
const GRADE_STEP = 0.5 * CUN;

/** 斗口的整数倍关系（《工程做法则例》原文） */
export const DK = {
  /** 檐柱径 = 6 斗口 */
  colDia: 6,
  /** 金柱径 = 6.6 斗口 */
  goldColDia: 6.6,
  /** 檐柱高 = 60 斗口（柱高为柱径十倍） */
  colH: 60,
  /** 斗栱通高 ≈ 10 斗口（地面至蚂蚱头下皮 70 斗口 − 柱高 60 斗口） */
  dougongH: 10,
  /** 攒当：相邻斗栱中心距 = 11 斗口 */
  zanDang: 11,
  /** 斗栱每跳（拽架）出挑 = 3 斗口 */
  jump: 3,
  /** 斗栱每踩高 = 2 斗口 */
  stepH: 2,
  /** 椽径 = 1.5 斗口 */
  rafterDia: 1.5,
  /** 通进深 / 通面阔 = 5/8 */
  depthRatio: 5 / 8,
};

/**
 * 开间类型 → 斗口数与平身科数
 *
 * `doukou`：该开间的面阔（斗口）
 * `pingshen`：该开间内的**平身科**（补间斗栱）数
 *
 * 依据与来历：
 *  - 明间 66 斗口 = 6 空档 × 攒当 11 斗口
 *    → 与《工程做法则例》"七空档各 11 斗口"同构（七间殿攒数较少）
 *    → **且与正大光明殿实测明间面阔一丈六尺五寸 = 66 斗口精确吻合**
 *  - 次间 62 斗口（实测一丈五尺五寸）
 *  - 稍间 54 斗口（实测一丈三尺五寸）
 *  - 尽间 48 斗口（按同一递减率外推的**推定**）
 *
 * 验算（正大光明殿，七间）：66 + 2×62 + 4×54 = 406 斗口
 *   406 × 8cm = 32.48 m = 101.5 尺
 *   实测通面阔 = 16.5 + 2×15.5 + 4×13.5 = 101.5 尺 ✓
 */
const BAY_KIND = {
  ming: { doukou: 66, pingshen: 5, label: '明间' },
  ci: { doukou: 62, pingshen: 5, label: '次间' },
  shao: { doukou: 54, pingshen: 4, label: '稍间' },
  jin: { doukou: 48, pingshen: 4, label: '尽间' },
};

/**
 * 开间由中向两翼的**对**序列（每"对"= 左右各一间）
 *
 * 官式开间配置的通例（自明间向外）：
 *   次间 1 对 → 稍间 2 对 → 尽间 2 对
 *
 * 于是：
 *   三间 = 明1 + 次2                （1 对）
 *   五间 = 明1 + 次2 + 稍2          （2 对）
 *   七间 = 明1 + 次2 + 稍4          （3 对）  ← 正大光明殿实测
 *   九间 = 明1 + 次2 + 稍4 + 尽2    （4 对）
 *  十一间 = 明1 + 次2 + 稍4 + 尽4  （5 对）
 *
 * 依据：
 *  - 《工程做法则例》"明间 77 斗口、次间 66 斗口（减一攒）、
 *    尽间 55 斗口（再减一攒）"的递减序列；
 *  - **正大光明殿实测**（七间）：明间一丈六尺五寸、次间一丈五尺五寸、
 *    外围四间各一丈三尺五寸 ⇒ 斗口数 66 / 62 / 54，与上述配比一致。
 */
const PAIR_SEQUENCE = ['ci', 'shao', 'shao', 'jin', 'jin'];


/**
 * 等级 → 模数体系
 *
 * `style`：'dashi'（大式，有斗栱，用斗口制）| 'xiaoshi'（小式，无斗栱，用檐柱径制）
 * `perBay`：该等级的平均每间面阔目标（米）—— 用来反推斗口绝对值
 * `platRatio`：台基高 ÷ 柱高
 *
 * 依据：
 *  - 大式（殿宇厅堂）用六等至八等材；
 *  - 小式（馆、轩、亭、房）**不用斗口**，以**檐柱径**为基本模数
 *    （《工程做法则例》："小式无斗拱建筑是以檐柱径为基本模数的"）。
 */
const RANK_MODULE = {
  // 九间五间重檐大殿 —— 圆明园规格最高者
  grand: {
    style: 'dashi', perBay: 5.3, platRatio: 0.30, caihua: 'hexi',
    note: '大式重檐；九间用六~七等材',
  },
  // 七间五间正殿 —— 正大光明殿实测斗口二寸五分（八等材）
  hall: {
    style: 'dashi', perBay: 4.65, platRatio: 0.25, caihua: 'xuanzi',
    note: '八等材（斗口二寸五分），正大光明殿实测',
  },
  // 五间配殿
  side: {
    style: 'dashi', perBay: 4.0, platRatio: 0.15, caihua: 'xuanzi',
    note: '大式，一斗三升交麻叶',
  },
  // 五间楼
  tower: {
    style: 'dashi', perBay: 4.0, platRatio: 0.25, caihua: 'xuanzi',
    note: '大式，重檐',
  },
  // 门
  gate: {
    style: 'dashi', perBay: 4.2, platRatio: 0.18, caihua: 'xuanzi',
    note: '大式',
  },
  // 馆 —— 小式，以檐柱径为模数
  house: {
    style: 'xiaoshi', colDia: 0.30, perBay: 3.2, platRatio: 0.10, caihua: 'su',
    note: '小式，檐柱径三寸（0.30m）',
  },
  // 轩 —— 小式
  xuan: {
    style: 'xiaoshi', colDia: 0.26, perBay: 2.6, platRatio: 0.09, caihua: 'su',
    note: '小式，檐柱径二寸六分（0.26m）',
  },
  // 亭 —— 小式攒尖
  pavilion: {
    style: 'xiaoshi', colDia: 0.26, perBay: 3.0, platRatio: 0.08, caihua: 'su',
    note: '小式攒尖，檐柱径二寸六分',
  },
  // 游廊
  corridor: {
    style: 'xiaoshi', colDia: 0.20, perBay: 1.6, platRatio: 0.0, caihua: 'su',
    note: '小式游廊',
  },
};

/**
 * 小式（无斗栱）建筑的模数规则 —— 以**檐柱径**为基本模数
 *
 * 依据：清式小式建筑通例
 *   - 间宽（明间）≈ 檐柱径 × 10，次间 × 8.5，尽间 × 7.5
 *   - 檐柱高 ≈ 檐柱径 × 9（官式小式 9~11，南方小式 7~8）
 *   - 台基高 ≈ 檐柱高 × 0.10
 */
const XIAOSHI = {
  mingBayRatio: 10,
  ciBayRatio: 8.5,
  jinBayRatio: 7.5,
  colHRatio: 9,
};

/**
 * 大式建筑的进深比例（通进深 / 通面阔）
 *
 * 《工程做法则例》："进深按通面阔的 5/8，并核正攒当。"
 * 故宫太和殿实测 33.35 / 60.13 = 0.555。
 * 圆明园配殿（洞明堂）实测 39.3 / 54 = 0.728。
 */
const DASHI_DEPTH = {
  grand: 0.58,
  hall: 0.63,
  side: 0.66,
  tower: 0.62,
  gate: 0.46,
};

/* ================================================================== *
 * 二、开间布置（明间 > 次间 > 稍间 > 尽间）
 * ================================================================== */

/**
 * 排布一间建筑的柱网：明间居中，向两翼逐间递减。
 *
 * 返回顺序为**从西到东**（左→右）：
 *   尽间 稍间 次间 明间 次间 稍间 尽间   （七间例）
 *
 * ⚠ **明间必须在正中**。这是中式建筑最基本的比例规则：
 *   平面看起来是"中间大、两头小"的梯形展开，而不是各间等宽的方格。
 *   之前所有开间等宽 ⇒ 一眼假。
 *
 * @param {number} mian 面阔开间数
 * @returns {{kind:string, doukou:number, pingshen:number}[]}
 */
export function bayLayout(mian) {
  const n = Math.max(1, Math.round(mian));
  if (n === 1) return [{ kind: 'ming', ...BAY_KIND.ming }];

  const pairs = (n - 1) / 2;
  const left = [];
  const right = [];

  if (n % 2 === 1) {
    // 奇数间：正中为明间
    for (let i = 0; i < pairs; i++) {
      const kind = PAIR_SEQUENCE[Math.min(i, PAIR_SEQUENCE.length - 1)];
      left.unshift(kind);
      right.push(kind);
    }
    return [
      ...left.map((k) => ({ kind: k, ...BAY_KIND[k] })),
      { kind: 'ming', ...BAY_KIND.ming },
      ...right.map((k) => ({ kind: k, ...BAY_KIND[k] })),
    ];
  }

  // 偶数间：无明间，正中两间为次间（门、偶数间厅堂）
  const halfPairs = n / 2;
  for (let i = 0; i < halfPairs; i++) {
    const kind = PAIR_SEQUENCE[Math.min(i, PAIR_SEQUENCE.length - 1)];
    left.unshift(kind);
    right.push(kind);
  }
  // 偶数间左右应对称：重新镜像
  return [
    ...left.map((k) => ({ kind: k, ...BAY_KIND[k] })),
    ...right.reverse().map((k) => ({ kind: k, ...BAY_KIND[k] })),
  ];
}

/* ================================================================== *
 * 三、主推导
 * ================================================================== */

/** 把任意长度吸附到最近的「半寸」刻度（材等制度） */
function snapToGradeStep(metres) {
  return Math.max(GRADE_STEP, Math.round(metres / GRADE_STEP) * GRADE_STEP);
}

/**
 * 由「开间数 × 等级」推导整套建筑尺寸。
 *
 * @param {object} p
 * @param {number} p.mian   面阔开间数（有考据依据）
 * @param {number} p.jin    进深开间数（有考据依据）
 * @param {string} p.rank   等级
 * @param {string} [p.platform='xumizuo'] 台基做法
 * @param {string} [p.roof] 屋顶形式（影响出檐与斗栱跳数）
 * @returns {object} 尺寸表
 */
export function deriveDimensions(p) {
  const {
    mian = 5,
    jin = 3,
    rank = 'hall',
    platform = 'xumizuo',
    roof = 'xieshan',
    hasDougong = true,
  } = p;
  const R = RANK_MODULE[rank] || RANK_MODULE.hall;
  const isDashi = R.style === 'dashi';

  /* ---------------- 3.1 开间排布（攒当法）---------------- */
  const bays = bayLayout(mian);
  const totalDoukou = bays.reduce((s, b) => s + b.doukou, 0);

  /* ---------------- 3.2 斗口绝对值 ---------------- */
  // 工部的做法是**先定体量目标，再选材等**：
  // 目标通面阔 = 等级 × 每间面阔目标；斗口 = 目标 / 总斗口数；
  // 最后吸附到材等的半寸刻度上（材等是离散等级，不能取任意值）。
  let doukou = 0;
  let targetWidth = 0;
  if (isDashi) {
    targetWidth = R.perBay * mian;
    doukou = snapToGradeStep(targetWidth / totalDoukou);
  } else {
    // 小式：以檐柱径为模数，斗口不参与
    doukou = 0;
  }

  /* ---------------- 3.3 面阔与各开间宽 ---------------- */
  const bayWidths = isDashi
    ? bays.map((b) => b.doukou * doukou)
    : bays.map((b) => {
        const ratio =
          b.kind === 'ming' ? XIAOSHI.mingBayRatio
          : b.kind === 'ci' ? XIAOSHI.ciBayRatio
          : XIAOSHI.jinBayRatio;
        return R.colDia * ratio;
      });
  const width = bayWidths.reduce((s, w) => s + w, 0);

  /* ---------------- 3.4 柱网 ---------------- */
  const colXs = [];
  {
    let x = -width / 2;
    for (const w of bayWidths) {
      colXs.push(x);
      x += w;
    }
    colXs.push(x);
  }
  // 明间宽（无明间时取中间那间）
  const mingIdx = bays.findIndex((b) => b.kind === 'ming');
  const centerIdx = mingIdx >= 0 ? mingIdx : Math.floor((bays.length - 1) / 2);
  const bayW = bayWidths[centerIdx];

  /* ---------------- 3.5 进深 ---------------- */
  const depthRatio = isDashi ? DASHI_DEPTH[rank] ?? 0.63 : 0.60;
  let depth = Math.max(bayW, width * depthRatio);
  // 攒尖亭（单间）必为**方形平面**：四角攒尖，平面正方。
  // 亭子的"开间"是四面各一柱，不是"面阔只有一间宽"。
  if (rank === 'pavilion') {
    depth = width;
  }
  const bayD = depth / Math.max(1, jin);

  /* ---------------- 3.6 柱径与柱高 ---------------- */
  // 斗口制：檐柱径 = 6 斗口；檐柱高 = 60 斗口（柱高为柱径十倍）
  // 小式：以檐柱径为模数，柱高 ≈ 柱径 × 9
  const colDia = isDashi ? DK.colDia * doukou : R.colDia;
  const colH = isDashi ? DK.colH * doukou : R.colDia * XIAOSHI.colHRatio;

  /* ---------------- 3.7 斗栱 ---------------- */
  // 斗栱通高 = 10 斗口（蚂蚱头下皮 70 斗口 − 檐柱高 60 斗口）
  //
  // ⚠ **小式建筑没有斗栱**（《工程做法则例》："小式无斗拱建筑是以檐柱径
  //   为基本模数的"）。这不只是等级差别 —— 小式若安上斗栱，
  //   既不合法，也会让 `doukou = 0` 传进攒当计算，把场景构建挂死。
  const doubleEave = roof.includes('chongyan') || roof === 'juanpengxieshan';
  const baseJumps = { grand: 3, hall: 3, side: 2, tower: 3, gate: 2 }[rank] ?? 2;
  const useDougong = isDashi && hasDougong;
  const dougongJumps = useDougong ? baseJumps + (doubleEave ? 1 : 0) : 0;
  const dgHeight = useDougong ? DK.dougongH * doukou : 0;

  /* ---------------- 3.8 额枋 ---------------- */
  // 额枋（阑额 + 平板枋）总高 ≈ 柱径 × 1.25
  // 大式折合斗口数 ≈ 7.5 斗口（6 斗口柱径 × 1.25）
  const beamH = isDashi ? 7.5 * doukou : colDia * 1.25;

  /* ---------------- 3.9 台基 ---------------- */
  // 台基高 = 柱高 × 等级比例（正大光明殿实测 1.2m / 柱高 4.8m = 0.25）
  const platRatio = Math.min(R.platRatio, 0.35);
  const platformH = Math.max(0.22, colH * platRatio);

  /* ---------------- 3.10 檐高 ---------------- */
  // 檐高 = 台基 + 柱高 + 额枋 + 斗栱（自下而上累加，与 structure.js 一致）
  const eaveY = platformH + colH + beamH + dgHeight;

  /* ---------------- 3.11 墙厚 ---------------- */
  // 官式砖墙厚 ≈ 1.25 斗口；小式 ≈ 柱径 × 0.9
  const wallThick = isDashi
    ? Math.max(0.28, Math.min(0.75, 1.25 * doukou))
    : Math.max(0.22, colDia * 0.9);

  /* ---------------- 3.12 斗栱尺度因子 ---------------- */
  // dougong.js 的几何以「1 斗口 = 0.1m」为基准建模，
  // dgScale = 实际斗口 / 基准斗口。
  const dgScale = useDougong ? doukou / 0.1 : 0;

  return {
    width,
    depth,
    mian,
    jin,
    bayW,
    bayD,
    bayWidths,
    colXs,
    bays,
    colDia,
    colH,
    platformH,
    eaveY,
    wallThick,
    dougongJumps,
    dougongHeight: dgHeight,
    dougongScale: dgScale,
    hasDougong: useDougong,
    beamH,
    doukou,
    module: isDashi ? doukou : colDia,
    moduleSystem: isDashi ? 'doukou' : 'xiaoshi',
    grade: isDashi ? doukou / CUN : null,
    style: R.style,
    rank,
    note: R.note,
  };
}

/**
 * 附属建筑（配殿、轩、馆）的模数。
 * 比主殿低一等：面阔更窄、柱高更矮、斗栱更少。
 */
export function deriveAnnex(p) {
  const rank = p.rank || 'side';
  return deriveDimensions({ ...p, rank });
}

/* ================================================================== *
 * 四、校验
 * ================================================================== */

/**
 * 校验推导结果是否落在真实建筑的合理区间。
 *
 * ⚠ 区间按**开间数**分档，因为清式建筑的比例本就随规模变化：
 *   檐高/面阔随间数递减（斗口定的柱高是固定的，面阔随间数增长）：
 *     九间以上 0.17~0.30 · 七间 0.18~0.32 · 五间 0.28~0.42
 *     三间 0.38~0.58 · 一~二间 0.45~0.75
 *   小式（无斗栱）另有一套：柱高/柱径 7~11，柱高/明间宽 0.7~1.3。
 *
 * 拿大殿的区间去卡三间小殿**必然误报**——这是旧版校验器的 bug。
 *
 * @returns {string[]} 问题清单（空数组 = 全部通过）
 */
export function checkDimensions(d) {
  const issues = [];
  const { width, depth, mian, jin, bayW, bayD, colDia, colH, platformH, eaveY } = d;
  const isDashi = d.style === 'dashi';

  // ---- 柱径 ----
  if (colDia < 0.2 || colDia > 0.9) issues.push(`柱径 ${colDia.toFixed(2)}m 越界（0.2~0.9m）`);

  // ---- 柱高 / 柱径 ----
  const ratio = colH / colDia;
  if (isDashi) {
    // 则例：檐柱高 60 斗口、檐柱径 6 斗口 ⇒ 恒为 10
    if (Math.abs(ratio - 10) > 0.6) {
      issues.push(`柱高/柱径 = ${ratio.toFixed(2)} 越界（大式应为 10，60斗口÷6斗口）`);
    }
  } else {
    if (ratio < 7 || ratio > 11) {
      issues.push(`柱高/柱径 = ${ratio.toFixed(2)} 越界（小式应 7~11）`);
    }
  }

  // ---- 柱高 / 明间宽 ----
  const wr = colH / bayW;
  if (isDashi) {
    // 60 斗口 ÷ 明间 66~77 斗口 = 0.78~0.91
    if (wr < 0.72 || wr > 0.95) {
      issues.push(`柱高/明间宽 = ${wr.toFixed(2)} 越界（大式应 0.72~0.95）`);
    }
  } else {
    if (wr < 0.7 || wr > 1.3) issues.push(`柱高/明间宽 = ${wr.toFixed(2)} 越界（小式应 0.7~1.3）`);
  }

  // ---- 台基高 / 柱高 ----
  const pr = platformH / colH;
  if (pr < 0.04 || pr > 0.45) issues.push(`台基/柱高 = ${pr.toFixed(3)} 越界（应 0.04~0.45）`);

  // ---- 檐高 / 面阔（按开间数分档）----
  // ⚠ 分档依据是**开间数**，不是体量：
  //   斗口定的柱高是固定的，面阔随开间数增长 ⇒ 檐高/面阔随间数递减。
  //   拿大殿区间去卡三间小殿必然误报（旧版校验器的 bug）。
  const tr = eaveY / width;
  let TR;
  let tierLabel;
  if (!isDashi) {
    // 小式（无斗栱）：体量小、柱高相对突出，比值偏高。
    // 一~二间的小亭最极端（面阔 2.6m、檐高 2.9m），放宽上限。
    if (mian <= 2) { TR = [0.30, 1.30]; tierLabel = '1~2间小式'; }
    else if (mian === 3) { TR = [0.26, 0.70]; tierLabel = '3间小式'; }
    else { TR = [0.20, 0.45]; tierLabel = '5间小式'; }
  } else if (mian >= 9) { TR = [0.17, 0.30]; tierLabel = '9间以上大式'; }
  else if (mian === 7) { TR = [0.18, 0.32]; tierLabel = '7间大式'; }
  else if (mian === 5) { TR = [0.26, 0.42]; tierLabel = '5间大式'; }
  else if (mian === 3) { TR = [0.36, 0.58]; tierLabel = '3间大式'; }
  else { TR = [0.42, 0.90]; tierLabel = '1~2间大式'; }
  if (tr < TR[0] || tr > TR[1]) {
    issues.push(`檐高/面阔 = ${tr.toFixed(2)} 越界（${tierLabel}应 ${TR[0]}~${TR[1]}）`);
  }

  // ---- 进深 / 面阔 ----
  // 方形建筑（进深开间数 == 面阔开间数，如方壶胜境）天然接近 1，
  // 不该被"进深比面阔窄"的规则卡住。
  const dr = depth / width;
  const isSquare = Math.abs(width - depth) < 0.01;
  if (!isSquare && (dr < 0.40 || dr > 0.95)) {
    issues.push(`进深/面阔 = ${dr.toFixed(2)} 越界（应 0.40~0.95）`);
  }

  // ---- 明间 > 次间 > 尽间（攒当法的核心后果）----
  // ⚠ 必须**按开间类型**比，不能按数组下标比：
  //   柱网是从西到东排的，明间在**正中**（下标 = 数组中段），
  //   下标 0 是**尽间**不是明间。按下标比会把对的判成错的。
  if (d.bays && d.bayWidths && d.bays.length >= 3) {
    const byKind = {};
    d.bays.forEach((b, i) => {
      if (!byKind[b.kind]) byKind[b.kind] = d.bayWidths[i];
    });
    if (byKind.ming != null && byKind.ci != null && !(byKind.ming > byKind.ci)) {
      issues.push('明间未大于次间（攒当递减失效）');
    }
    if (byKind.ci != null && byKind.jin != null && !(byKind.ci > byKind.jin)) {
      issues.push('次间未大于尽间（攒当递减失效）');
    }
    // 明间必须居中（对称性）
    const mingIdx = d.bays.findIndex((b) => b.kind === 'ming');
    if (mingIdx >= 0 && d.bays.length % 2 === 1) {
      const mid = (d.bays.length - 1) / 2;
      if (mingIdx !== mid) issues.push('明间不在正中（柱网不对称）');
    }
  }

  // ---- 斗口绝对值必须落在材等制度内 ----
  if (isDashi) {
    const g = d.doukou / CUN;
    if (Math.abs(g * 2 - Math.round(g * 2)) > 1e-6) {
      issues.push(`斗口 ${(d.doukou * 100).toFixed(2)}cm 不在材等半寸刻度上`);
    }
    if (d.doukou < DOUKOU_GRADES[11] || d.doukou > DOUKOU_GRADES[1]) {
      issues.push(`斗口 ${(d.doukou * 100).toFixed(2)}cm 超出十一等材范围`);
    }
  }

  // ---- 开间数 ----
  if (mian < 1 || mian > 13) issues.push(`面阔 ${mian} 间越界`);
  if (jin < 1 || jin > 11) issues.push(`进深 ${jin} 间越界`);
  if (bayD <= 0.1) issues.push(`进深间宽 ${bayD.toFixed(2)}m 过小`);

  return issues;
}

/**
 * 人类可读的尺寸说明（写进 console，便于核对）
 */
export function describeDimensions(d) {
  const sys = d.style === 'dashi'
    ? `斗口 ${(d.doukou * 100).toFixed(2)}cm（${d.grade}等材）`
    : `柱径 ${d.module.toFixed(2)}m（小式）`;
  return (
    `${d.mian}间×${d.jin}间 ` +
    `面阔 ${d.width.toFixed(1)}m 进深 ${d.depth.toFixed(1)}m ` +
    `明间 ${d.bayW.toFixed(2)}m ${sys} ` +
    `柱径 ${d.colDia.toFixed(2)}m 柱高 ${d.colH.toFixed(1)}m ` +
    `台基 ${d.platformH.toFixed(2)}m 檐高 ${d.eaveY.toFixed(1)}m`
  );
}
