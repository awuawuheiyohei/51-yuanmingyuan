/**
 * 须弥座台基
 *
 * 清式台基自下而上的层次（各层比例取实际做法）：
 *   圭角（下枭）  斜面外张，最宽
 *   下枋          方，最宽处在下枋
 *   束腰          收进，束腰内多有壸门/方砖雕饰
 *   上枋          方
 *   上枭          斜面内收，挑出檐口
 *   台面 / 台唇
 *
 * 另含：踏跺（带垂带）、御路（斜坡石）、栏杆（望柱/栏板）。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildBaluster, buildBalustradePanel, buildDiXia, buildShouMenPanels, buildYuLu } from './details.js';

/** 四棱台（上小下大 / 上大下小） */
function frustum(bw, bd, tw, td, h) {
  const g = new THREE.CylinderGeometry(
    Math.max(tw, td) * 0.707,
    Math.max(bw, bd) * 0.707,
    h,
    4,
    1
  );
  g.rotateY(Math.PI / 4);
  // 矩形底与顶需要各向缩放，改用手动构造
  g.dispose();
  return boxFrustum(bw, bd, tw, td, h);
}

/** 真正的矩形棱台 */
function boxFrustum(bw, bd, tw, td, h) {
  const hb = bw / 2;
  const hd = bd / 2;
  const ht = tw / 2;
  const hdT = td / 2;
  const y0 = -h / 2;
  const y1 = h / 2;
  const v = [
    // 底面 4 点
    -hb, y0, -hd, hb, y0, -hd, hb, y0, hd, -hb, y0, hd,
    // 顶面 4 点
    -ht, y1, -hdT, ht, y1, -hdT, ht, y1, hdT, -ht, y1, hdT,
  ];
  const idx = [
    0, 1, 5, 0, 5, 4, // 前面
    1, 2, 6, 1, 6, 5, // 右
    2, 3, 7, 2, 7, 6, // 后
    3, 0, 4, 3, 4, 7, // 左
    4, 5, 6, 4, 6, 7, // 顶
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // UV 按尺寸铺，供砖石贴图使用
  const pos = g.attributes.position;
  const uv = new Float32Array((pos.count * 2));
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) / 3;
    uv[i * 2 + 1] = pos.getY(i) / 3;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/**
 * 须弥座
 * @param {number} w  台基宽（X）
 * @param {number} d  台基深（Z）
 * @param {number} h  台基高
 * @param {number} out 出挑（台基比建筑四周多出）
 */
export function buildXumizuo(w, d, h, out = 1.2) {
  const parts = [];
  const W = w + out * 2;
  const Dp = d + out * 2;

  // 各层高度比例
  const hGui = h * 0.13; // 圭角
  const hXia = h * 0.11; // 下枋
  const hShou = h * 0.3; // 束腰
  const hShang = h * 0.1; // 上枋
  const hXiao = h * 0.14; // 上枭
  const hMian = h * 0.22; // 台面

  let y = 0;

  // 圭角：斜面外张
  const gui = boxFrustum(W - out * 0.5, Dp - out * 0.5, W, Dp, hGui);
  gui.translate(0, y + hGui / 2, 0);
  parts.push(gui);
  y += hGui;

  /**
   * **叠涩线脚** —— 须弥座读不读得出层次，全看这道挑檐。
   *
   * ⚠ 原来六层只是**六个盒子直接堆叠**（圭角是斜的，其余全是平盒），
   *   每层交界是一条**纯竖直的缝** ⇒ 远看近看都是"一块白板"，
   *   六层完全读不出来（AGENTS.md 硬要求："须弥座分六层"）。
   *
   * 真实做法：每层交界处挑出一道**薄枭**（线脚），
   * 挑出的那 5~8cm 会在自身下方投出一条**横向阴影线** ——
   * 有了这道阴影，六层才一层层数得出来。
   */
  const lip = (lw, ld, ly, lh) => {
    const g = new THREE.BoxGeometry(lw, lh, ld);
    g.translate(0, ly, 0);
    parts.push(g);
    return g;
  };

  // 下枭：圭角顶挑出的一线
  const wXia = W - out * 0.5;
  const dXia = Dp - out * 0.5;
  lip(wXia + 0.07, dXia + 0.07, y + hXia * 0.12, hXia * 0.24);

  // 下枋
  const xia = new THREE.BoxGeometry(W, hXia, Dp);
  xia.translate(0, y + hXia / 2, 0);
  parts.push(xia);
  y += hXia;

  // 束腰（收进）+ 壸门式凹龛
  const waistW = W - out * 0.72;
  const waistD = Dp - out * 0.72;
  const shou = new THREE.BoxGeometry(waistW, hShou, waistD);
  shou.translate(0, y + hShou / 2, 0);
  parts.push(shou);
  // 束腰上下各挑一道**枭**（这才是"收进"的关键）
  const wShou = waistW + 0.12;
  const dShou = waistD + 0.12;
  lip(wShou, dShou, y + hShou * 0.05, hShou * 0.1);
  lip(wShou, dShou, y + hShou * 0.95, hShou * 0.1);
  // 壸门：四面各一排
  for (const [mw, md, rot, ox, oz] of [
    [waistW, waistD, 0, 0, waistD / 2],
    [waistW, waistD, Math.PI, 0, -waistD / 2],
  ]) {
    const panels = buildShouMenPanels(mw - 0.2, hShou * 0.9, 0.02);
    panels.rotateY(rot);
    panels.translate(ox, y + hShou / 2, oz);
    parts.push(panels);
  }
  for (const sx of [-1, 1]) {
    const panels = buildShouMenPanels(waistD - 0.2, hShou * 0.9, 0.02);
    panels.rotateY((sx * Math.PI) / 2);
    panels.translate(sx * waistW / 2, y + hShou / 2, 0);
    parts.push(panels);
  }
  y += hShou;

  // 上枋
  const shang = new THREE.BoxGeometry(wShou, hShang, dShou);
  shang.translate(0, y + hShang / 2, 0);
  parts.push(shang);
  y += hShang;

  // 上枭：斜面向外挑
  const xiao = boxFrustum(wShou, dShou, W - out * 0.15, Dp - out * 0.15, hXiao);
  xiao.translate(0, y + hXiao / 2, 0);
  parts.push(xiao);
  y += hXiao;

  // 台面
  const mian = new THREE.BoxGeometry(W - out * 0.15, hMian, Dp - out * 0.15);
  mian.translate(0, y + hMian / 2, 0);
  parts.push(mian);

  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return { geometry: merged, topY: y + hMian };
}

/**
 * 踏跺（台阶）+ 垂带 + 御路
 * @param {number} width  踏跺宽
 * @param {number} h      台基高
 * @param {number} depth  出挑方向的进深
 * @param {number} dirZ   出挑方向（+1 朝 +Z）
 */
export function buildSteps(width, h, depth, dirZ = -1) {
  const parts = [];
  const n = Math.max(3, Math.round(h / 0.165));
  const stepH = h / n;
  const stepD = depth / n;
  /**
   * 踏跺两侧的**斜收**：每一级向内收一点。
   *
   * ⚠ 原来每级加宽 0.18m（每边 9cm），10 级下来底部比顶部宽 **1.8m** ——
   *   既不真实，也把**垂带整个埋掉**（垂带被埋在越来越宽的台阶里）。
   *   真实踏跺每级收 5~8cm，10 级约 0.7m。
   */
  const FLARE = 0.07;

  /**
   * 每级踏步 = **阶条（踏面）+ 阶石（踢面）**，且踏面**分块**。
   *
   * ⚠ 原来每级是**一整块** BoxGeometry ⇒ 踏面是一条连续的光板，
   *   近景读作"清水混凝土楼梯"，没有石作感。
   *   真实踏跺的踏面是**逐块阶条石**砌成的，块间有缝。
   *
   * 块的**长边顺进深方向**（缝垂直于建筑正面）——
   * 这与真实做法一致（阶条石顺垂带方向排布）。
   */
  const TREAD = 0.09; // 阶条厚
  const JOINT = 0.025; // 石缝
  //
  // ⚠⚠ 踏步外沿必须落在**一条直线**上（垂带内侧面那条），不能是逐级退台的折线。
  //   原来：每级宽度 = width + (n-i)*FLARE ⇒ 外沿是**折线**，
  //   而垂带内侧面是**直线** ⇒ 两者对不上，
  //   每级之间漏出**黑色三角缝**（近景一眼可见）。
  //   ⇒ 改成：第 i 级的外沿 x = 直线在 y = stepH*(i+1) 处的取值。
  const FLARE_TOTAL = FLARE * n; // 从底到顶的总收进量（与原来等量）
  const edgeAt = (y) => width / 2 + FLARE_TOTAL * (1 - y / h);
  for (let i = 0; i < n; i++) {
    const yTop = stepH * (i + 1);
    const w = 2 * edgeAt(yTop);
    const zc = dirZ * (depth * 0.5 + stepD * (n - i - 0.5));

    // 阶石（踢面 + 主体）
    const riser = new THREE.BoxGeometry(w, stepH + 0.02 - TREAD, stepD * 1.2);
    riser.translate(0, stepH * (i + 0.5) - TREAD * 0.5, zc);
    parts.push(riser);

    // 阶条（踏面）：沿 X 分块，块间留缝
    const nSlab = Math.max(2, Math.round(w / 1.2));
    const slabW = w / nSlab;
    for (let k = 0; k < nSlab; k++) {
      const t = new THREE.BoxGeometry(slabW - JOINT, TREAD, stepD * 1.2);
      t.translate(
        -w / 2 + slabW * (k + 0.5),
        stepH * (i + 1) + 0.01 - TREAD * 0.5,
        zc
      );
      parts.push(t);
    }
  }

  /**
   * 垂带（两侧斜立的长条石）。
   *
   * ⚠⚠⚠ 2026-11-16 修：**倾转角原来算反了**（这是"垂带与踏步之间一排黑缝"
   * 的真正根因）。
   *
   *   `bandAng = atan2(h, run)` 是那条斜线**相对水平**的夹角；
   *   而 `rotateZ(θ)` 转的是**相对竖直**的角度 ——
   *   直接把 bandAng 传给 rotateZ ⇒ 垂带被放成**几乎水平**，
   *   横着躺开 1.5 m 穿过整座踏步（近景看就是一块斜插的大板），
   *   它的内侧面压根贴不住踏步 ⇒ 到处漏出黑色三角缝。
   *
   *   ⇒ 正确：`rotateZ(sx * (π/2 − bandAng))` ⇒ 垂带立起来，
   *   长轴沿那条近垂直的斜边，内侧面正好压在踏步外沿上。
   *
   * 配套：踏步外沿也改成落在**同一条直线**上（见上面 edgeAt），
   * 两者才严丝合缝。
   */
  const bandT = 0.12; // 厚度（沿 X）
  const bandW = 0.3; // 带宽（垂直于坡向）
  const xTop = width / 2;
  const xBot = width / 2 + FLARE_TOTAL;
  const run = xBot - xTop;
  const bandLen = Math.hypot(run, h);
  const bandAng = Math.atan2(h, run); // 斜边相对水平的夹角
  const bandTilt = Math.PI / 2 - bandAng; // 相对竖直的倾角
  for (const sx of [-1, 1]) {
    const g = new THREE.BoxGeometry(bandT, bandLen, depth * 1.02);
    // 绕 Z 轴倾斜 ⇒ 长轴沿斜边、内侧面压在踏步外沿上
    g.rotateZ(sx * bandTilt);
    g.translate(sx * ((xTop + xBot) / 2), h / 2, dirZ * depth);
    parts.push(g);
    // 垂带顶上的**压条**（一条细线脚）—— 贴在垂带顶端、略向外挑
    const cap = new THREE.BoxGeometry(bandT + 0.05, 0.05, depth * 1.02);
    cap.rotateZ(sx * bandTilt);
    // 垂带长轴（局部 +Y）转过之后的方向
    const axX = sx * Math.cos(bandAng);
    const axY = Math.sin(bandAng);
    cap.translate(
      sx * ((xTop + xBot) / 2) + axX * (bandLen / 2) + sx * 0.025,
      h / 2 + axY * (bandLen / 2) + 0.025 * Math.cos(bandAng),
      dirZ * depth
    );
    parts.push(cap);
  }

  // 御路（中间斜坡石 + 两侧雕线）
  //
  // ⚠ 原来御路放在 `dirZ*depth*0.42` —— 那是**台基里面**，
  //   而斜坡石本身长 `depth*1.85`（比斜坡长得多）⇒ 一头戳进台基、一头悬空。
  //   现在：长度取真实斜坡长 hypot(h, depth)，中心落在斜坡中线上。
  const ramp = buildYuLu(width * 0.3, h, depth);
  ramp.rotateY(dirZ > 0 ? 0 : Math.PI);
  ramp.translate(0, h / 2 + 0.14, dirZ * depth);
  parts.push(ramp);

  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/**
 * 栏杆：望柱 + 栏板 + 地霞（朝南的正面栏杆）
 */
export function buildRailing(width, z, height = 1.0, dirZ = -1) {
  const parts = [];
  const n = Math.max(2, Math.round(width / 1.6));
  // 地霞（承托石）
  const di = buildDiXia(width, 0.16);
  di.translate(0, 0, z);
  parts.push(di);
  // 望柱
  for (let i = 0; i <= n; i++) {
    const x = -width / 2 + (width * i) / n;
    const post = buildBaluster(height - 0.16, 0.19);
    post.translate(x, 0.16, z);
    parts.push(post);
  }
  // 栏板（华板 + 寻杖）
  for (let i = 0; i < n; i++) {
    const x = -width / 2 + (width * (i + 0.5)) / n;
    const panel = buildBalustradePanel(width / n - 0.19, height - 0.16);
    panel.translate(x, 0.16, z);
    parts.push(panel);
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}
