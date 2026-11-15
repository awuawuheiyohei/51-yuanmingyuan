/**
 * 圆明园**园墙**（虎皮石墙）
 * ==============================
 *
 * ## 考据（确证部分）
 *
 * 依据：圆明园遗址公园《圆明园围墙历史变迁考》（据清代**样式雷**大墙图、
 * 1933 年**实测遗址图**、清宫档案、**残存围墙**）：
 *
 * - 圆明园**确有围墙**，且是皇家园林的重要组成部分（界墙 + 保护屏障）；
 * - 圆明园大墙外围长 **2004 丈 3 尺 = 6413.7 m**；长春园围墙 **3754 m**；
 *   绮春园外墙 **1156 丈 7 尺 2 寸 = 3701.5 m**；
 *   **三园内外围墙总长近 20000 m**；
 * - **材料与做法**：园墙为**虎皮石墙**（"藻园南墙即圆明园南虎皮石墙"、
 *   "北大墙按原址恢复为虎皮石墙"）；西大墙（外垣）另为**大城砖**筑砌，
 *   俗称"饽饽门大墙"；
 * - **北垣为双层复墙**：内外两道围墙，墙间留约 **12.6 m** 的巡逻夹道；
 * - 三园之间以**围墙门**（随墙门）连通；北垣正中设**大北门**（五开间城楼）。
 *
 * ## 推定部分（文献未载 ⇒ 必须在注释里写明）
 *
 * - **高度 4.5 m**：清代文献与样式雷图均未载确切高度；
 *   参照苑囿/陵园围墙通例与现存墙基比例**推定**。
 * - **墙厚 0.8 m**：同上，**推定**。
 * - **墙顶素面石压顶、无瓦顶**：现状复建的北大墙为素顶虎皮石墙，
 *   故推定清代亦无瓦顶。
 * - **单层**：北垣的双层复墙与 12.6 m 夹道是**北垣特有**；
 *   本项目的园界多边形是**三园合并外轮廓**，一般园墙按单层处理。
 * - **随墙门未建**：历史上三园间有围墙门，但其**位置无实测依据**
 *   ⇒ 不摆（摆位置就是编造复原结论）。
 *
 * ## 为什么必须建这道墙
 *
 * 原来园界只体现在**地形顶点色**上（园内灰绿 / 园外褐绿），
 * 俯视时是一道**笔直的色块边界**——像贴图接缝，不像园林的界。
 * 有了虎皮石墙，园子才有"墙里是园、墙外是野"的层次。
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { stoneFace } from './buildings/textures.js';

/** 墙高（m）—— 推定，见文件头 */
const WALL_H = 4.5;
/** 墙厚（m）—— 推定 */
const WALL_T = 0.8;
/** 分段长度（m）：太短则面数暴涨，太长则墙脚不贴坡 */
const SEG_LEN = 3.0;
/** 墙顶压顶的出挑（m） */
const CAP_OUT = 0.12;
/** 压顶厚（m） */
const CAP_H = 0.16;

/**
 * 建园墙。
 *
 * @param {Array<[number,number]>} ring 园界多边形（世界 XZ，闭合）
 * @param {(x:number,z:number)=>number} heightAt 地面高程采样
 * @returns {THREE.Group}
 */
export function buildParkWall(ring, heightAt) {
  const group = new THREE.Group();
  group.name = 'parkWall';
  if (!ring || ring.length < 3) return group;

  const bodyParts = [];
  const capParts = [];

  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len < 0.5) continue;
    const ang = Math.atan2(dz, dx);
    const n = Math.max(1, Math.round(len / SEG_LEN));
    const step = len / n;

    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const mx = a[0] + dx * t;
      const mz = a[1] + dz * t;
      const y = heightAt?.(mx, mz) ?? 0;

      // 墙身
      const g = new THREE.BoxGeometry(step + 0.04, WALL_H, WALL_T);
      g.rotateY(-ang);
      g.translate(mx, y + WALL_H / 2 - 0.25, mz);
      bodyParts.push(g);

      // 墙顶压顶：素面石，两侧各出挑一点（虎皮石墙不做瓦顶）
      const cap = new THREE.BoxGeometry(step + 0.04, CAP_H, WALL_T + CAP_OUT * 2);
      cap.rotateY(-ang);
      cap.translate(mx, y + WALL_H - 0.25 + CAP_H / 2, mz);
      capParts.push(cap);
    }
  }

  // 虎皮石材质：比台基的汉白玉**深一档、暖一档**（园墙是粗石，不是白石）
  const map = stoneFace('#8d8577', 0.75).clone();
  map.needsUpdate = true;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  const mat = new THREE.MeshStandardMaterial({
    map,
    color: 0xb8b2a6,
    roughness: 0.98,
    metalness: 0,
  });

  const add = (parts, name) => {
    if (!parts.length) return;
    const merged = mergeGeometries(parts, false);
    for (const p of parts) if (p !== merged) p.dispose();
    if (!merged) return;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  add(bodyParts, 'parkWallBody');
  add(capParts, 'parkWallCap');

  console.log(
    `  ✓ 园墙：虎皮石，高 ${WALL_H}m（推定），周长 ${(
      ring.reduce((s, p, i) => {
        const q = ring[(i + 1) % ring.length];
        return s + Math.hypot(q[0] - p[0], q[1] - p[1]);
      }, 0) / 1000
    ).toFixed(2)} km`
  );
  return group;
}
