/**
 * 御路中央的**云龙浮雕**
 * =====================
 *
 * ## 考据
 *
 * 清代官式建筑的御路（宫殿中轴的斜坡石）中央是**云龙石雕**——
 * 故宫太和殿、圆明园各殿的御路皆如此。
 * 所以"御路中间有云龙"是**有据的做法**，不是凭空加的装饰。
 *
 * ## 为什么必须是**几何**而不是贴图
 *
 * AGENTS.md §4.1：「**建模比贴图精细度高得多**」
 * 「凡是有立体特征的构件，必须换成真几何」。
 *
 * 浮雕的意义全在**投影**：凸起的龙身与云头在斜坡上会投出自己的影子，
 * 一眼就能读出"这是刻出来的"；贴图画的龙永远只是"一张画着龙的板"。
 *
 * ## 本地坐标系
 *
 * 与 `details.js → buildYuLu()` 一致：
 *   X = 横向（御路宽度方向）
 *   Y = 抬起方向（垂直于斜坡面）
 *   Z = 沿坡向（+Z 为**下坡**方向）
 *   原点在斜坡面中心，调用方再 `rotateX(ang)` 贴到坡上。
 *
 * 尺寸全部按**御路实际尺寸**参数化：
 * 御路约 2.85 m 宽 × 2.3 m 长 ⇒ 龙身约 1.7 m 长、10~22 cm 粗，
 * 与真实御路龙雕同量级。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/* ------------------------------------------------------------ 通用几何 */

/**
 * 沿一串点生成**锥形管**（龙身、云卷都用它）。
 *
 * @param {THREE.Vector3[]} pts  中心线
 * @param {(t:number)=>number} radiusFn 半径随参数变化
 * @param {number} rings 环数
 * @param {number} sides 每环边数
 * @param {number} flat  压扁系数（1 = 圆管；<1 = 扁的浮雕断面）
 */
function tubeAlong(pts, radiusFn, rings = 24, sides = 7, flat = 0.62) {
  const pos = [];
  const idx = [];
  const up = new THREE.Vector3(0, 1, 0);
  const T = new THREE.Vector3();
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();
  const n = pts.length;
  for (let i = 0; i < rings; i++) {
    const t = i / (rings - 1);
    // 中心线取样（按弧长近似均匀）
    const f = t * (n - 1);
    const i0 = Math.min(n - 1, Math.floor(f));
    const i1 = Math.min(n - 1, i0 + 1);
    const p = pts[i0].clone().lerp(pts[i1], f - i0);
    const pPrev = pts[Math.max(0, i0 - 1)];
    const pNext = pts[Math.min(n - 1, i1 + 1)];
    T.subVectors(pNext, pPrev);
    if (T.lengthSq() < 1e-10) T.set(0, 0, 1);
    T.normalize();
    N.crossVectors(T, up);
    if (N.lengthSq() < 1e-10) N.set(1, 0, 0);
    N.normalize();
    B.crossVectors(N, T).normalize();
    const r = radiusFn(t);
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      const ox = Math.cos(a) * r;
      const oy = Math.sin(a) * r * flat;
      pos.push(
        p.x + N.x * ox + B.x * oy,
        p.y + N.y * ox + B.y * oy,
        p.z + N.z * ox + B.z * oy
      );
    }
  }
  for (let i = 0; i < rings - 1; i++) {
    for (let k = 0; k < sides; k++) {
      const a = i * sides + k;
      const b = i * sides + ((k + 1) % sides);
      const c = (i + 1) * sides + k;
      const d = (i + 1) * sides + ((k + 1) % sides);
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  // ⚠ 必须有 uv：mergeGeometries 要求**属性集完全一致**，
  //   而下面的箱体/锥体都有 uv ⇒ 管体缺 uv 会让整组合并失败（返回 null）。
  const uv = new Float32Array((rings * sides) * 2);
  for (let i = 0; i < rings; i++) {
    for (let k = 0; k < sides; k++) {
      const o = (i * sides + k) * 2;
      uv[o] = k / sides;
      uv[o + 1] = i / (rings - 1);
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** 一片小三角鳍（龙背脊鳍） */
function finGeometry(len, h, thick) {
  const pos = [
    -thick / 2, 0, 0,
    thick / 2, 0, 0,
    0, h, -len,
    0, 0, 0,
    thick / 2, 0, 0,
    -thick / 2, 0, 0,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  // ⚠ 同样要补索引 + uv：mergeGeometries 要求**索引状态与属性集都一致**。
  g.setIndex([0, 1, 2, 3, 4, 5]);
  g.setAttribute(
    'uv',
    new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0.5, 1, 0, 0, 1, 0, 0.5, 1]), 2)
  );
  g.computeVertexNormals();
  return g;
}

/* ------------------------------------------------------------ 云头 */

/**
 * **如意云头**：一圈渐收的螺旋（云卷）。
 *
 * 用同一套 `tubeAlong` 做 ⇒ 云与龙身的断面、质感完全一致，
 * 看起来是同一把刻刀刻出来的。
 */
function cloudScroll(size, turns = 1.35, seed = 1) {
  const pts = [];
  const N = 26;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const a = t * turns * Math.PI * 2 + seed;
    const r = size * (1 - t * 0.72);
    pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
  }
  const g = tubeAlong(pts, (t) => size * (0.30 - t * 0.12), 22, 6, 0.7);
  return g;
}

/* ------------------------------------------------------------ 云龙总装 */

/**
 * 造一条**云龙浮雕**。
 *
 * 组成：
 *   · **龙身**：沿 S 形曲线爬升的锥形管（中段粗、两端细）
 *   · **脊鳍**：沿背脊排一列小三角鳍（这是"像龙"的关键剪影特征）
 *   · **龙首**：楔形头 + 张口 + 双角
 *   · **龙爪**：两爪，每爪三趾
 *   · **云**：四朵如意云头，分列两侧
 *
 * @param {number} bandW 可雕带宽（m）
 * @param {number} bandL 沿坡长（m）
 * @returns {THREE.BufferGeometry[]} 局部坐标（X 横向 / Y 抬起 / Z 沿坡）
 */
export function buildDragonRelief(bandW, bandL) {
  const parts = [];
  const RELIEF_H = 0.11; // 浮雕最大凸起高度（m）

  // ---- 龙身：S 形自下而上 ----
  const bodyPts = [];
  const NB = 15;
  const span = bandL * 0.80;
  for (let i = 0; i < NB; i++) {
    const t = i / (NB - 1);
    const z = bandL * 0.38 - t * span;
    const x = Math.sin(t * Math.PI * 2.05) * bandW * 0.17;
    bodyPts.push(new THREE.Vector3(x, 0, z));
  }
  const body = tubeAlong(
    bodyPts,
    (t) => bandW * (0.052 + 0.036 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.82)),
    30,
    7,
    0.66
  );
  parts.push(body);

  // ---- 脊鳍：沿背脊一列小鳍 ----
  for (let i = 2; i < NB - 3; i += 1) {
    const t = i / (NB - 1);
    const p = bodyPts[i];
    const pNext = bodyPts[Math.min(NB - 1, i + 1)];
    const pPrev = bodyPts[Math.max(0, i - 1)];
    const dir = new THREE.Vector3().subVectors(pNext, pPrev).normalize();
    // ⚠⚠ 2026-11-17 **不能再用 `setFromUnitVectors` 摆鳍**。
    //   `setFromUnitVectors` 只保证"把 +Y 转到目标方向"，**绕自身轴的角度是任意的**
    //   ⇒ 鳍片可能正好**躺平**在御路面上（自己看不见，只剩一条黑划痕般的影子）。
    //   ⇒ 改成：鳍在**局部坐标**里就朝后掠（几何自带），再用 **Y 轴旋转**对齐龙身走向。
    //   绕 Y 转是唯一确定的（龙身在御路面上只沿 XZ 走）。
    const f = finGeometry(bandW * 0.11, RELIEF_H * 0.85, bandW * 0.05);
    f.rotateX(-0.4); // 鳍尖朝后掠（局部 -Z）
    f.rotateY(Math.atan2(dir.x, dir.z)); // 绕 Y 对齐龙身走向
    f.translate(p.x, p.y + bandW * 0.028, p.z);
    parts.push(f);
  }

  // ---- 龙首（在上端） ----
  {
    const head = bodyPts[NB - 1];
    const pre = bodyPts[NB - 3];
    const dir = new THREE.Vector3().subVectors(head, pre).normalize();
    const ang = Math.atan2(dir.x, dir.z);
    const hw = bandW * 0.085; // 头宽
    const hl = bandW * 0.20; // 头长
    // 颅
    const skull = new THREE.BoxGeometry(hw * 1.05, hw * 0.78, hl);
    skull.rotateY(ang);
    skull.translate(
      head.x + dir.x * hl * 0.18,
      head.y + hw * 0.30,
      head.z + dir.z * hl * 0.18
    );
    parts.push(skull);
    // 吻（口鼻）
    const snout = new THREE.BoxGeometry(hw * 0.52, hw * 0.36, hl * 0.62);
    snout.rotateY(ang);
    snout.translate(
      head.x + dir.x * hl * 0.72,
      head.y + hw * 0.22,
      head.z + dir.z * hl * 0.72
    );
    parts.push(snout);
    // 双角
    //
    // ⚠ 2026-11-17 角半径 hw*0.11 → hw*0.30：原来只有 **1.1 cm 半径**的锥，
    //   在 3 m 外是亚像素细条 ⇒ 侧棱全是背光面 ⇒ 读作**一根黑划痕**。
    //   ⇒ 加粗到能读出体量（角才读得出"角"）。
    for (const sx of [-1, 1]) {
      const horn = new THREE.ConeGeometry(hw * 0.3, hl * 0.62, 6);
      horn.rotateZ(sx * 0.55);
      horn.rotateY(ang);
      horn.translate(
        head.x + dir.x * hl * 0.1 - dir.z * sx * hw * 0.36,
        head.y + hw * 0.78,
        head.z + dir.z * hl * 0.1 + dir.x * sx * hw * 0.36
      );
      parts.push(horn);
    }
    // 颚（张口的下颌）
    const jaw = new THREE.BoxGeometry(hw * 0.44, hw * 0.18, hl * 0.5);
    jaw.rotateY(ang);
    jaw.translate(
      head.x + dir.x * hl * 0.6,
      head.y + hw * 0.02,
      head.z + dir.z * hl * 0.6
    );
    parts.push(jaw);
  }

  // ---- 龙爪：两爪，每爪三趾 ----
  //
  // ⚠⚠ 2026-11-17 原来趾的落点是 `p.y + bandW*0.012`（轴上 1.2 cm），
  //   而龙身在该处的**半径是 5~9 cm** ⇒ 整根趾**埋在龙身里**，
  //   从来没有露出来过（近景只看得到两团云，找不到爪）。
  //   ⇒ 趾要落在**身子的表面上**：按同一公式算出该处半径 br，趾底压进去 2 cm。
  for (const idx of [4, 9]) {
    const p = bodyPts[idx];
    const sx = idx === 4 ? -1 : 1;
    const t = idx / (NB - 1);
    // 与身管同一公式 ⇒ 脚正好踩在身子上
    const br = bandW * (0.052 + 0.036 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.82));
    for (let k = 0; k < 3; k++) {
      // 趾加粗到能读出体量（原来 2.2×2 cm 是亚像素细条 ⇒ 只剩黑划痕）
      const toe = new THREE.BoxGeometry(bandW * 0.055, bandW * 0.055, bandW * 0.2);
      toe.rotateY((k - 1) * 0.45 + (sx > 0 ? -0.35 : 0.35));
      toe.translate(
        p.x + sx * bandW * 0.1 + (k - 1) * bandW * 0.045,
        p.y + br - bandW * 0.012,
        p.z + (k - 1) * bandW * 0.025
      );
      parts.push(toe);
    }
  }

  // ---- 云：四朵如意云头，分列两侧 ----
  const clouds = [
    [-0.30, 0.30, 1.0],
    [0.31, 0.12, 2.1],
    [-0.29, -0.16, 3.3],
    [0.27, -0.32, 4.4],
  ];
  for (const [cx, cz, sd] of clouds) {
    const c = cloudScroll(bandW * 0.085, 1.3, sd);
    c.translate(cx * bandW, 0.006, cz * bandL);
    parts.push(c);
  }

  const merged = mergeGeometries(parts, false);
  for (const p of parts) if (p !== merged) p.dispose();
  return merged;
}

/**
 * 把浮雕**贴到御路斜坡面上**（在 `buildYuLu` 的局部坐标里用）。
 *
 * @param {THREE.BufferGeometry} band 浮雕几何（局部坐标，底面在 y=0）
 * @param {number} ang  斜坡倾角（与 rotateX 一致）
 * @param {number} yTop 斜坡面（板顶）在局部坐标里的高度
 */
export function placeReliefOnSlope(band, ang, yTop) {
  const g = band.clone();
  g.translate(0, yTop, 0);
  g.rotateX(ang);
  return g;
}
