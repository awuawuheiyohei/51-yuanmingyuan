/**
 * 清式斗栱（一斗三升 · 翘昂）
 * ===========================
 *
 * ## 模数：斗口
 *
 * 斗栱**不是另有一套尺寸** —— 它的每一件构件都是斗口的整数倍或分数。
 * 这正是斗口制的核心：柱、枋、拱、斗、椽共用一个模数。
 *
 * 依据《工程做法则例》：
 *   - **斗口** = 坐斗正面刻口的宽度 = 拱材的宽
 *   - **攒当**（相邻斗栱中心距）= 11 斗口
 *   - **斗栱每拽架（每跳）出挑 3 斗口，每踩高 2 斗口**
 *   - **单材拱** = 1 斗口 × 1.4 斗口
 *   - **坐斗（栌斗）** 底面 3 斗口见方，高 2 斗口
 *   - **十八斗** 底面 1.8 斗口，高 1.4 斗口
 *   - **升** 底面 1.3 斗口，高 1 斗口
 *
 * ## 一攒的构造（自下而上）
 *
 *   坐斗（栌斗）：斗底 + 斗欹 + 斗腰 + 斗耳
 *   第一跳：昂（斜料，前端下斜成"昂嘴"）+ 昂上十八斗
 *   第二跳：翘（平料）+ 翘上十八斗
 *   第三跳：翘 + 翘上十八斗
 *   最上层：蚂蚱头 + 耍头（挑出的横料）
 *
 * ## 尺寸自洽性（可验算）
 *
 *   出跳 = 3 跳 × 3 斗口 + 耍头 ≈ 11 斗口 = **攒当**
 *     ⇒ 相邻两攒的蚂蚱头/耍头正好衔接，檐下连成一片
 *   通高 = 坐斗 2 + 3 × 踩高 2 = 8，加蚂蚱头 ≈ **10 斗口**
 *     ⇒ 与 `modular.js` 的 `DK.dougongH = 10` 一致
 *
 * ## 尺寸基准
 *
 * 本模块几何以 **1 斗口 = 0.1 m** 为基准建模（`D` 表全部是"斗口数 × 0.1"），
 * 实际使用时由 `dgScale = 实际斗口 / 0.1` 整体缩放。
 * ⇒ 斗栱与柱径、额枋、椽子**自动同模数**。
 *
 * 坐标：原点在柱头中心，+Y 向上，主出挑方向朝 +X。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * 模数（米）。基准：1 斗口 = 0.1 m。
 *
 * ⚠ 之前这里的每跳出挑是 0.62m（**6.2 斗口**）—— 是一斗三升的三跳，
 *   却按"每跳 6.2 斗口"造，出挑近两倍 ⇒ 斗栱看着像几根乱插的尖刺，
 *   檐下根本排不成"密实的斗栱带"。
 *   现在按则例改成 **每跳 3 斗口**，三跳共 9 斗口 + 耍头 ≈ 攒当 11 斗口。
 */
const D = {
  zDouBottom: 0.30, // 坐斗斗底边长 = 3 斗口
  zDouHeight: 0.20, // 坐斗总高 = 2 斗口
  douEar: 0.05, // 斗耳高 = 0.5 斗口
  douWaist: 0.08, // 斗腰高 = 0.8 斗口
  shiBaDou: 0.18, // 十八斗底边长 = 1.8 斗口
  shiBaHeight: 0.14, // 十八斗高 = 1.4 斗口
  sheng: 0.13, // 升底边长 = 1.3 斗口
  shengHeight: 0.10, // 升高 = 1 斗口
  armW: 0.10, // 拱宽 = 1 斗口（= 斗口本身）
  armH: 0.14, // 拱高 = 1.4 斗口（单材拱）
  armLength: 0.30, // 每跳水平出挑 = 3 斗口
  angSlope: 0.28, // 昂的斜度（垂直/水平）—— 清式昂嘴约 1:3
  tiaoLength: 0.22, // 蚂蚱头挑出 = 2.2 斗口
  shuaLength: 0.20, // 耍头挑出 = 2 斗口
};

/**
 * 合并零件 —— 带**索引状态归一**与**失败即报错**。
 *
 * ⚠⚠ `mergeGeometries` 有两个静默陷阱：
 *
 * 1. **索引状态必须一致** —— 要么全部 indexed，要么全部 non-indexed。
 *    `BoxGeometry` / `CylinderGeometry` 是 indexed，
 *    `ExtrudeGeometry`（侧影挤出）是 **non-indexed**。
 *    两者混合 ⇒ `mergeGeometries` **返回 null**（只往 console 打一行 error），
 *    下游一句 `.scale()` 就变成
 *    `Cannot read properties of null (reading 'scale')` —— 白屏，
 *    而且报错点离真正的错误点隔了几百行。
 * 2. **属性集必须一致** —— position/normal/uv 缺一个也会返回 null。
 *
 * ⇒ 这里统一转 non-indexed（**三角面数不变**，只多占一点顶点内存），
 *   并在失败时抛出**指名道姓**的错误，而不是让 null 传播到渲染层。
 */
function mergeParts(parts, label = '斗栱零件') {
  if (!parts.length) return null;
  const flat = parts.map((p) => {
    if (!p.index) return p;
    const n = p.toNonIndexed();
    p.dispose();
    return n;
  });
  const merged = mergeGeometries(flat, false);
  if (!merged) {
    throw new Error(`mergeParts(${label}) 失败：几何体属性不兼容`);
  }
  for (const p of flat) p.dispose();
  return merged;
}

/**
 * 方锥台：上小下大的斗（栌斗/十八斗/升）
 * @returns {{body: THREE.BufferGeometry, trim: THREE.BufferGeometry|null}}
 */
function makeDou(bottom, height, seed = 0) {
  const parts = [];
  const ear = D.douEar * (bottom / D.zDouBottom);
  const waist = D.douWaist * (bottom / D.zDouBottom);
  const bevel = Math.max(0.02, height - ear - waist);

  // 斗底（方）
  const b = new THREE.BoxGeometry(bottom, waist, bottom);
  b.translate(0, waist / 2, 0);
  parts.push(b);

  // 斗欹（四面斜坡）—— 用截头方锥近似
  const waistSize = bottom * 0.86;
  const c = new THREE.CylinderGeometry(
    waistSize * 0.707,
    bottom * 0.707,
    bevel,
    4,
    1
  );
  c.rotateY(Math.PI / 4);
  c.translate(0, waist + bevel / 2, 0);
  parts.push(c);

  // 斗腰（略收）
  const w = new THREE.BoxGeometry(waistSize, ear, waistSize);
  w.translate(0, waist + bevel + ear / 2, 0);
  parts.push(w);

  const merged = mergeParts(parts, '斗');
  return { body: merged, trim: null };
}


/**
 * 由**侧影轮廓**挤出的构件。
 *
 * ## 为什么不能继续用方块拼
 *
 * 昂嘴、蚂蚱头、勾头是斗栱**唯一决定轮廓**的三件 ——
 * 它们是"中国屋顶一眼认得出"的关键。堆方块只能得到"几个盒子摞起来"，
 * 近看没有轮廓，永远是示意级。
 *
 * 做法：先用二维 `Shape` 画出**侧影**（昂嘴的勾、蚂蚱头的箭、勾头的钩），
 * 再沿宽度挤出 ⇒ 得到有真实轮廓的构件。
 *
 * @param {Array<[number,number]>} pts 侧影点（x 向前，y 向上），单位：斗口
 * @param {number} width 挤出宽度（斗口）
 */
function profileExtrude(pts, width) {
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: false,
    curveSegments: 6,
  });
  // 挤出方向 z → 宽度居中在 y=0 平面
  g.translate(0, 0, -width / 2);
  return g;
}

/**
 * 翘：平出挑的方料，前端下杀（卷杀）
 *
 * @returns {{body: THREE.BufferGeometry, trim: THREE.BufferGeometry}}
 *   `body` = 方料本身（青绿彩画）；
 *   `trim` = **卷杀勾头线脚**（清式施白粉/沥粉贴金，最显眼的一笔）。
 */
function makeQiao(len) {
  const body = [];
  const trim = [];
  const b = new THREE.BoxGeometry(len, D.armH, D.armW);
  b.translate(len / 2, 0, 0);
  body.push(b);
  // 前端**卷杀**：翘头向下弯折，分四段逐级收小。
  // 用侧影挤出 ⇒ 是真的弯，不是几个方块叠出来的台阶。
  const h = D.armH;
  const w = D.armW;
  const jag = [
    [len, 0],
    [len + len * 0.1, -h * 0.12],
    [len + len * 0.17, -h * 0.34],
    [len + len * 0.2, -h * 0.62],
    [len + len * 0.17, -h * 0.82],
  ];
  trim.push(profileExtrude(jag, w * 0.94));
  return { body: mergeParts(body, '翘身'), trim: mergeParts(trim, '翘头卷杀') };
}

/**
 * 昂：斜向前下的方料，前端为"昂嘴"
 *
 * @returns {{body: THREE.BufferGeometry, trim: THREE.BufferGeometry}}
 */
function makeAng(len) {
  const body = [];
  const trim = [];
  const drop = len * D.angSlope;
  const g = new THREE.BoxGeometry(len, D.armH, D.armW);
  // 绕 Z 轴倾斜：前端（+X）下沉
  g.rotateZ(-Math.atan2(drop, len));
  g.translate(len / 2, -drop / 2, 0);
  body.push(g);
  // **昂嘴**：昂头前端的勾形雕件。
  // 侧影是"斜下 → 前伸 → 回勾"，这是清式昂嘴的样子；
  // 用方块只能做出"斜切一刀"，远看就是一根斜木棍。
  const h = D.armH;
  const kouPts = [
    [len * 0.86, -drop * 0.55],
    [len * 1.0, -drop - h * 0.05],
    [len * 1.12, -drop - h * 0.42],
    [len * 1.06, -drop - h * 0.66],
    [len * 0.96, -drop - h * 0.6],
  ];
  trim.push(profileExtrude(kouPts, D.armW * 0.92));
  return { body: mergeParts(body, '昂身'), trim: mergeParts(trim, '昂嘴') };
}

/**
 * 蚂蚱头：最上层前端的雕花件（带斜面的方料 + 束腰）
 *
 * @returns {{body: THREE.BufferGeometry, trim: THREE.BufferGeometry}}
 *   蚂蚱头整体算**勾头线脚** —— 清式蚂蚱头多施白粉或沥粉贴金，
 *   是檐下最亮的点，斗栱的"收笔"全在它身上。
 */
function makeMaZhaTou(len) {
  const body = [];
  const trim = [];
  const h = D.armH;
  // **蚂蚱头**：昂尖之上那个"蚂蚱"形的雕件 ——
  // 侧影是"束腰 + 圆头 + 前伸的尖喙"。
  // 它是斗栱最上端、也是最出挑的那一笔，轮廓必须对。
  trim.push(
    profileExtrude(
      [
        [0, -h * 0.42],
        [len * 0.22, -h * 0.42],
        [len * 0.3, -h * 0.2], // 束腰
        [len * 0.52, h * 0.12],
        [len * 0.78, h * 0.3], // 圆头
        [len * 1.0, h * 0.22], // 尖喙前伸
        [len * 0.86, h * 0.02],
        [len * 0.62, -h * 0.16],
        [len * 0.34, -h * 0.42],
      ],
      D.armW * 1.02
    )
  );
  return { body: mergeParts(body, '蚂蚱头身'), trim: mergeParts(trim, '蚂蚱头') };
}

/**
 * 耍头：蚂蚱头之后带勾头的横料
 *
 * @returns {{body: THREE.BufferGeometry, trim: THREE.BufferGeometry}}
 */
function makeShuaTou(len) {
  const body = [];
  const trim = [];
  const b = new THREE.BoxGeometry(len, D.armH, D.armW);
  b.translate(len / 2, 0, 0);
  body.push(b);
  // **勾头**：耍头前端向下的钩
  trim.push(
    profileExtrude(
      [
        [len * 0.94, D.armH * 0.42],
        [len * 1.08, D.armH * 0.12],
        [len * 1.02, -D.armH * 0.3],
        [len * 0.9, -D.armH * 0.34],
        [len * 0.94, -D.armH * 0.05],
      ],
      D.armW * 0.9
    )
  );
  return { body: mergeParts(body, '耍头身'), trim: mergeParts(trim, '勾头') };
}

/**
 * 一攒一斗三升斗栱
 * @param {number} scale 整体缩放（= 实际斗口 ÷ 0.1m 基准）
 * @param {'x'|'z'} axis 主出挑方向
 * @returns {{body: THREE.BufferGeometry, trim: THREE.BufferGeometry}}
 *   `body` = 斗栱主体（坐斗 / 拱 / 升 / 方料，青绿彩画）
 *   `trim` = **勾头线脚**（昂嘴 / 卷杀 / 蚂蚱头 / 勾头，白粉贴金）
 *
 *   分成两档材质是有道理的：清式斗栱的**勾头线脚**施沥粉贴金 / 白粉，
 *   是檐下唯一的亮色。混成一个颜色时，"一攒一攒"的轮廓在阴影里糊成一条带，
 *   远看就只是"屋檐下的一道黑线"，完全没有斗栱的节奏感。
 */
export function buildDougongParts(scale = 1, axis = 'x') {
  const bodyParts = [];
  const trimParts = [];
  const s = scale;

  // 所有尺寸先用**未缩放**的模数算好，最后统一乘 s。
  // （早前在造构件时乘一次、装配时又乘一次，出挑会变成 s² 倍。）
  const P = (g, x, y, z, isTrim = false) => {
    if (!g) return;
    g.scale(s, s, s);
    g.translate(x * s, y * s, z * s);
    (isTrim ? trimParts : bodyParts).push(g);
  };

  const jump = D.armLength;

  // 坐斗（栌斗）
  const zdou = makeDou(D.zDouBottom, D.zDouHeight);
  P(zdou.body, 0, 0, 0);
  P(zdou.trim, 0, 0, 0, true);

  let y = D.zDouHeight;
  let x = 0;

  // 第一跳：昂（斜出）+ 昂上十八斗
  // 昂从坐斗顶面起昂，昂嘴下斜；十八斗坐在昂背上。
  const ang = makeAng(jump);
  P(ang.body, x, y + D.armH * 0.5, 0);
  P(ang.trim, x, y + D.armH * 0.5, 0, true);
  const angTipX = x + jump;
  const angTipY = y + D.armH * 0.5 - jump * D.angSlope;
  const sb1 = makeDou(D.shiBaDou, D.shiBaHeight);
  P(sb1.body, angTipX - D.shiBaDou * 0.3, angTipY + D.shiBaHeight * 0.5, 0);
  P(sb1.trim, angTipX - D.shiBaDou * 0.3, angTipY + D.shiBaHeight * 0.5, 0, true);

  // 第二跳：翘（平出）+ 翘上十八斗
  // 每踩高 2 斗口（= 0.2m）
  y = angTipY + D.shiBaHeight + D.armH * 0.5;
  x = angTipX - D.shiBaDou * 0.3;
  const qiao2 = makeQiao(jump);
  P(qiao2.body, x, y, 0);
  P(qiao2.trim, x, y, 0, true);
  const t2x = x + jump;
  const sb2 = makeDou(D.shiBaDou, D.shiBaHeight);
  P(sb2.body, t2x - D.shiBaDou * 0.3, y + D.shiBaHeight * 0.5, 0);
  P(sb2.trim, t2x - D.shiBaDou * 0.3, y + D.shiBaHeight * 0.5, 0, true);

  // 第三跳：翘 + 翘上十八斗
  y = y + D.shiBaHeight + D.armH * 0.5;
  x = t2x - D.shiBaDou * 0.3;
  const qiao3 = makeQiao(jump);
  P(qiao3.body, x, y, 0);
  P(qiao3.trim, x, y, 0, true);
  const t3x = x + jump;
  const sb3 = makeDou(D.shiBaDou, D.shiBaHeight);
  P(sb3.body, t3x - D.shiBaDou * 0.3, y + D.shiBaHeight * 0.5, 0);
  P(sb3.trim, t3x - D.shiBaDou * 0.3, y + D.shiBaHeight * 0.5, 0, true);

  // 最上层：蚂蚱头 + 耍头
  y = y + D.shiBaHeight + D.armH * 0.5;
  x = t3x - D.shiBaDou * 0.3;
  const mzt = makeMaZhaTou(D.tiaoLength);
  P(mzt.body, x, y, 0);
  P(mzt.trim, x, y, 0, true);
  const st = makeShuaTou(D.shuaLength);
  P(st.body, x + D.tiaoLength * 0.55, y, 0);
  P(st.trim, x + D.tiaoLength * 0.55, y, 0, true);

  const body = mergeParts(bodyParts, '斗栱主体');
  const trim = mergeParts(trimParts, '斗栱勾头线脚');
  if (axis === 'z') {
    body?.rotateY(Math.PI / 2);
    trim?.rotateY(Math.PI / 2);
  }
  return { body, trim };
}

/**
 * 斗栱（单几何）—— **向后兼容入口**。
 *
 * 西式建筑（`western-parts/hall.js`、`haiyan.js`）把斗栱整体放进自己的
 * `'dougong'` 桶，只需要一份几何 ⇒ 这里把主体与线脚合并返回。
 * 中式建筑走 `buildDougongParts()`，两档材质分开。
 */
export function buildDougongSet(scale = 1, axis = 'x') {
  const { body, trim } = buildDougongParts(scale, axis);
  const parts = [body, trim].filter(Boolean);
  const merged = mergeParts(
    parts.map((p) => p.clone()),
    '斗栱整体'
  );
  body?.dispose();
  trim?.dispose();
  return merged;
}

/**
 * 斗栱的总出挑（含蚂蚱头/耍头），用于让屋檐出挑与斗栱对齐。
 *
 * 三跳 3 斗口 + 耍头 ≈ 11 斗口 = 攒当 ⇒ 相邻两攒正好衔接。
 */
export function dougongProjection(scale = 1) {
  return (D.armLength * 3 + D.tiaoLength * 0.55 + D.shuaLength) * scale;
}

/**
 * 斗栱总高（按实际堆叠高度算出，不写死）。
 * 坐斗 2 + 3×踩高 2 + 蚂蚱头 ≈ 10 斗口。
 */
export function dougongHeight(scale = 1) {
  const drop = D.armLength * D.angSlope;
  // 坐斗顶 → 昂中 → 昂端（十八斗底）→ 翘 → 翘端 → 翘 → 蚂蚱头
  const y1 = D.zDouHeight + D.armH * 0.5 - drop * 0.5;
  const y2 = y1 + D.shiBaHeight + D.armH * 0.5;
  const y3 = y2 + D.shiBaHeight + D.armH * 0.5;
  const top = y3 + D.shiBaHeight + D.armH * 0.5 + D.armH * 0.55;
  return top * scale;
}
