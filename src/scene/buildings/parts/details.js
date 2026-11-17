/**
 * 细部构件：柱础、望柱、栏板、束腰、地霞
 *
 * 这些在真建筑里都是"有轮廓、有线脚"的实体，
 * 用方料或贴图代替是最容易被看穿的地方。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildDragonRelief, placeReliefOnSlope } from './dragon-relief.js';

/**
 * 覆盆式柱础：上小下大的圆台 + 一圈束腰
 * 清式大式建筑柱础为覆盆式，轮廓是圆转的，不是方柱墩
 */
export function buildColumnBase(colDia) {
  const r = colDia * 0.72;
  const h = colDia * 0.42;
  const parts = [];

  // 覆盆：用 Lathe 做出圆转的收分轮廓
  const profile = [];
  const steps = 7;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // 下缘略外撇，中部收分
    const rr = r * (1.06 - 0.22 * t - 0.12 * Math.sin(t * Math.PI));
    profile.push(new THREE.Vector2(rr, t * h));
  }
  const basin = new THREE.LatheGeometry(profile, 12);
  basin.translate(0, h, 0);
  parts.push(basin);

  // 础盘（底下那圈方石）
  const plate = new THREE.BoxGeometry(colDia * 1.72, h * 0.22, colDia * 1.72);
  plate.translate(0, h * 0.11, 0);
  parts.push(plate);

  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return g;
}

/**
 * 望柱：栏杆的柱头，有柱身 + 莲瓣/云纹柱头
 */
export function buildBaluster(h = 1.0, w = 0.18) {
  const parts = [];
  // 柱身（略收分）
  const body = new THREE.CylinderGeometry(w * 0.42, w * 0.5, h * 0.78, 8);
  body.translate(0, h * 0.39, 0);
  parts.push(body);
  // 柱头：仰莲
  const head = new THREE.SphereGeometry(w * 0.52, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
  head.scale(1, 0.85, 1);
  head.translate(0, h * 0.78, 0);
  parts.push(head);
  // 柱头顶的小莲苞
  const bud = new THREE.SphereGeometry(w * 0.2, 8, 6);
  bud.translate(0, h * 0.93, 0);
  parts.push(bud);
  // 柱脚
  const foot = new THREE.CylinderGeometry(w * 0.56, w * 0.6, h * 0.08, 8);
  foot.translate(0, h * 0.04, 0);
  parts.push(foot);

  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return g;
}

/**
 * 栏板：华板 + 上下寻杖，中间留出"壸门"式的曲线空当
 */
export function buildBalustradePanel(len, h = 1.0) {
  const parts = [];
  // 下地霞
  const bottom = new THREE.BoxGeometry(len, h * 0.16, 0.1);
  bottom.translate(0, h * 0.08, 0);
  parts.push(bottom);
  // 上寻杖
  const top = new THREE.BoxGeometry(len, h * 0.13, 0.12);
  top.translate(0, h * 0.435, 0);
  parts.push(top);
  // 华板（中间实板，左右留空当 —— 简化为两块竖条 + 一条横档）
  const centerW = len * 0.46;
  const center = new THREE.BoxGeometry(centerW, h * 0.2, 0.07);
  center.translate(0, h * 0.27, 0);
  parts.push(center);
  // 两侧透空处的边框
  for (const sx of [-1, 1]) {
    const side = new THREE.BoxGeometry((len - centerW) / 2, h * 0.2, 0.06);
    side.translate(sx * (centerW / 2 + (len - centerW) / 4), h * 0.27, 0);
    parts.push(side);
  }
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return g;
}

/**
 * 束腰的壸门：须弥座束腰上的一格格凹龛。
 *
 * ## 形制
 *
 * 清式束腰上的壸门是**喇叭口**（也叫"龛襻"）——
 * 墙面上一方龛，龛口**外宽内窄**、向外挑出一圈斜面，
 * 像一只朝天的小喇叭。斜面不是装饰，是**采光的构造**：
 * 它让龛口在受光时有一条亮边、在背光时有一条暗边。
 *
 * ## ⚠⚠ 踩过的坑（"凹龛发黑"）
 *
 *   原来做的是：四根**深 5 cm、凸出墙面 2 cm** 的直框条，
 *   围出一个 5 cm 深的"井"。井壁全在背光里 ⇒ 渲染成**纯黑的方孔** ——
 *   近景看就是一排小黑方洞。AGENTS 里"须弥座束腰有壸门凹龛"这条
 *   其实一直没做对：那个不是凹龛，是个**黑洞**。
 *
 *   根因：**凹龛不能靠"挖"来做**（布尔挖不动，也不该挖），
 *   只能靠**斜面**来做 —— 斜面自己受光、自己投影，
 *   龛的"深"由明暗读出来，不由几何读出来。
 *
 * ## 本实现
 *
 *   每龛 = 一块**砖雕面**（贴在墙面上，当龛底）
 *        + 四片**喇叭口斜面**（外沿挑出墙外、斜着收到龛底）
 *   于是四片的受光天然分级：
 *     · 下片斜面朝**上外** ⇒ 吃到天光 ⇒ **一条亮边** ✓
 *     · 上片斜面朝**下外** ⇒ 背光 ⇒ 一条暗边 ✓
 *     · 左右两片朝侧面 ⇒ 一亮一暗，随太阳转 ✓
 *     · 龛底在影里但有天光 ⇒ 灰，不是纯黑 ✓
 */
export function buildShouMenPanels(w, h, d) {
  const parts = [];
  /**
   * 龛的**比例与排布**。
   *
   * ⚠ 原来按"每 0.9 m 一个龛、龛宽 = 间距×0.62"排 —— 在 1.2 m 高的台基上
   *   束腰只有 0.36 m 高，于是龛变成 **0.56 × 0.21 m 的横条**，
   *   近景读作"一排开缝"，不是壸门。
   *
   * ✅ 正确：壸门的**宽由束腰的高度定**（略扁，约 1 : 1.5），
   *   再按这个宽度均分整面 —— 龛与龛之间只留一道窄竖框。
   *   这才是清式束腰的样子（故宫须弥座的束腰就是一方一方的小龛）。
   */
  const ph = h * 0.7; // 龛高
  const pwFull = ph * 1.5; // 龛宽（略扁）
  const pitch = pwFull * 1.22; // 每龛占位（含竖框）
  const count = Math.max(2, Math.round(w / pitch));
  const cw = w / count;
  for (let i = 0; i < count; i++) {
    const x = -w / 2 + cw * (i + 0.5);
    const pw = Math.min(pwFull, cw * 0.82); // 龛口（外沿）宽
    const s = pw * 0.11; // 喇叭口的水平收进：外宽内窄
    const c = 0.055; // 喇叭口挑出墙面的高度
    const t = 0.045; // 斜面石厚
    const hw = pw / 2;
    const hh = ph / 2;
    const iw = hw - s;
    const ih = hh - s;
    const L = Math.hypot(s, c); // 斜面长度
    const ang = Math.atan2(s, c); // 斜面倾角（相对墙面）

    // 砖雕面（龛底）：贴在墙面上，只探出一点点，避免 z-fighting
    const plate = new THREE.BoxGeometry(iw * 2, ih * 2, 0.03);
    plate.translate(x, 0, 0.012);
    parts.push(plate);

    // 上、下两道斜面（沿 X 延伸）
    //
    // ⚠ 倾角符号：局部 +Z 经 rotateX(-ang) 映射到 (0, +s, +c)
    //   ⇒ 斜面从**龛底往外沿**是"上挑"的。
    //   上龛口因此朝**下外**（背光），下龛口朝**上外**（受光）✓
    for (const sy of [-1, 1]) {
      const g = new THREE.BoxGeometry(iw * 2 + s * 2, t, L);
      g.rotateX(-ang);
      g.translate(x, sy * (hh - s / 2), 0.012 + c / 2);
      parts.push(g);
    }

    // 左、右两道斜面（沿 Y 延伸）
    // ⚠ 左右必须**反号**：左片的外沿朝 -X、右片朝 +X，
    //   否则两片会朝同一个方向倾斜 ⇒ 一片埋进墙里。
    for (const sx of [-1, 1]) {
      const g = new THREE.BoxGeometry(t, ih * 2 + s * 2, L);
      g.rotateY(sx * ang);
      g.translate(x + sx * (hw - s / 2), 0, 0.012 + c / 2);
      parts.push(g);
    }
  }
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return g;
}

/**
 * 地霞：栏杆下的承托石
 */
export function buildDiXia(len, h = 0.18) {
  const g = new THREE.BoxGeometry(len, h, 0.34);
  g.translate(0, h / 2, 0);
  return g;
}

/**
 * 御路：台基正中的斜坡石，两侧带雕线
 */
export function buildYuLu(width, h, depth) {
  const parts = [];
  // 斜坡石：长度取**真实斜坡长**（原来固定 depth*1.85 ⇒ 一头戳进台基、一头悬空）
  const slopeLen = Math.hypot(h, depth) * 1.06;
  const ang = Math.atan2(h, depth);
  //
  // ⚠⚠ **御路要逐块石板**（AGENTS.md 硬要求："逐块石板御路"）。
  //   原来只造**一整条** BoxGeometry ⇒ 近景是一块**光板**，
  //   读作"一块斜放的水泥板"，而不是石作。
  //   ⇒ 沿坡向切成若干块，块间留 2 cm 石缝 ⇒ 读作逐块砌的御路石。
  const N = Math.max(3, Math.round(slopeLen / 1.6));
  const blockLen = slopeLen / N;
  const joint = 0.02;
  for (let i = 0; i < N; i++) {
    // ⚠ 先在**局部 Z 向**摆好，再 rotateX —— 旋转的支点在御路中心。
    const zc = -slopeLen / 2 + blockLen * (i + 0.5);
    const b = new THREE.BoxGeometry(width, 0.16, blockLen - joint);
    b.translate(0, 0, zc);
    b.rotateX(ang);
    parts.push(b);
  }
  // 两侧雕线（凸起的宽边条）
  //
  // ⚠ 原来只有 6cm 高、贴在 16cm 厚的御路板上 ⇒ 从斜上方看几乎看不见，
  //   御路读作"一块光板"（AGENTS.md 硬要求："御路有雕线"）。
  //   真实御路两侧是**凸起的宽边条**（宽约 12cm、高约 11cm），
  //   中间是雕花坡面。现在把边条加高加宽，才读得出"御路"。
  for (const sx of [-1, 1]) {
    const e = new THREE.BoxGeometry(width * 0.12, 0.11, slopeLen);
    e.rotateX(ang);
    e.translate(sx * width * 0.44, 0.115, 0);
    parts.push(e);
  }

  // ---- 中央云龙浮雕 ----
  //
  // ⚠ 御路中间按考据（清代官式御路中央即云龙石雕）应当是**云龙**，
  //   原来只有两侧的雕线边条、中间是光板 ⇒ "御路有雕线"只做了一半。
  //
  // 做法：几何浮雕（不是贴图）—— 凸起的龙身与云头在斜坡上**投出自己的影子**，
  // 一眼就能读出"这是刻出来的"；贴图画的龙永远只是"一张画着龙的板"。
  //
  // 尺寸按御路实际尺度参数化（御路约 2.85 m 宽 × 2.3 m 长），
  // 浮雕底面贴在斜坡板顶（局部 y = 0.08），凸起高度与两侧边条齐平。
  {
    const bandW = width * 0.7; // 两条边条之间的可雕带宽
    const bandL = slopeLen * 0.86;
    const relief = buildDragonRelief(bandW, bandL);
    parts.push(placeReliefOnSlope(relief, ang, 0.08));
    relief.dispose();
  }
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return g;
}
