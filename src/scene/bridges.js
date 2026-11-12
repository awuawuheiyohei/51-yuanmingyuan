/**
 * **曲桥** —— 福海三岛之间的桥。
 *
 * 考据：
 * - 《日下旧闻考》卷五：「蓬岛瑶台在福海中央，门三楹，南向。正殿七楹。殿前东为畅襟楼，
 *   西为神洲三岛，东偏为随安室，西偏为日日平安报好音。由蓬岛瑶台**东南度桥为东岛**，
 *   有亭为瀛海仙山，**西北度桥为北岛**，正宇三楹。」
 * - 《日下尊闻录》：「蓬岛瑶台在海中央，**内外周遭为桥者十一**。」
 * - 北京旅游网：「三座岛屿彼此有**曲桥**相连……其间以**石拱桥**以及**爬山廊、复廊**连接。」
 * - 《四十景图·蓬岛瑶台》（乾隆朝宫廷画师唐岱、沈源绘）：大岛上有带栏杆的**斜向廊桥**
 *   伸向左上（北岛）与右下（东岛）—— 桥是**带栏杆的廊桥**形制，不是光板。
 *
 * ## 形制
 *
 * 一座曲桥由四部分组成（全是实体几何，没有贴图）：
 *   ① **桥面**：沿二次贝塞尔曲线（平面走曲线 ⇒ "曲"）铺的石板带，厚 0.5 m；
 *   ② **起拱**：桥面中间比两端高（`rise`），两端落在岛顶，跨中掠过水面；
 *   ③ **石栏杆**：两侧连续的条石 + 望柱（每 ~2.6 m 一根）；
 *   ④ **桥墩**：从桥面下到水面的石墩（跨中才需要）。
 *
 * @param {object} o
 * @param {number} o.x0 @param {number} o.z0 起点（世界坐标）
 * @param {number} o.x1 @param {number} o.z1 终点（世界坐标）
 * @param {number} o.y0 @param {number} o.y1 两端桥面高程
 * @param {number} [o.width=3.2] 桥面宽
 * @param {number} [o.rise=1.6] 中间起拱高度
 * @param {number} [o.bow=0] 平面中部侧向偏移（曲桥的"曲"）
 * @param {number} [o.waterY] 水面高程（用于定桥墩高度）
 * @param {number} [o.seg=12] 曲线分段
 * @returns {THREE.BufferGeometry|null}
 */
import * as THREE from 'three';

export function buildCurveBridge({
  x0,
  z0,
  x1,
  z1,
  y0,
  y1,
  width = 3.2,
  rise = 1.6,
  bow = 0,
  waterY = null,
  seg = 12,
}) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const L = Math.hypot(dx, dz);
  if (L < 0.5) return null;

  // 平面二次贝塞尔：中部向法向侧偏 `bow` ⇒ 曲桥的"曲"
  const nx = -dz / L;
  const nz = dx / L;
  const cx = (x0 + x1) / 2 + nx * bow;
  const cz = (z0 + z1) / 2 + nz * bow;

  // 竖向：两端取 y0/y1，中间起拱
  const pts = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const u = 1 - t;
    const x = u * u * x0 + 2 * u * t * cx + t * t * x1;
    const z = u * u * z0 + 2 * u * t * cz + t * t * z1;
    const y = u * y0 + t * y1 + rise * Math.sin(Math.PI * t);
    pts.push(new THREE.Vector3(x, y, z));
  }

  const parts = [];
  const THICK = 0.5;
  const RAIL_H = 0.95;
  const RAIL_W = 0.34;
  const zAxis = new THREE.Vector3(0, 0, 1);
  const upAxis = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < seg; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const dir = new THREE.Vector3().subVectors(p1, p0);
    const len = dir.length();
    if (len < 1e-4) continue;
    const q = new THREE.Quaternion().setFromUnitVectors(zAxis, dir.clone().normalize());
    const mid = new THREE.Vector3().addVectors(p0, p1).multiplyScalar(0.5);
    const localUp = upAxis.clone().applyQuaternion(q);
    const localX = new THREE.Vector3(1, 0, 0).applyQuaternion(q);

    // ① 桥面（顶面贴着曲线）
    const deck = new THREE.BoxGeometry(width, THICK, len + 0.06);
    deck.applyQuaternion(q);
    deck.translate(
      mid.x - localUp.x * (THICK / 2),
      mid.y - localUp.y * (THICK / 2),
      mid.z - localUp.z * (THICK / 2)
    );
    parts.push(deck);

    // ② 两侧石栏杆：连续条石
    for (const s of [-1, 1]) {
      const rail = new THREE.BoxGeometry(RAIL_W, RAIL_H, len + 0.06);
      rail.applyQuaternion(q);
      const off = localX.clone().multiplyScalar((s * (width - RAIL_W)) / 2);
      const up = localUp.clone().multiplyScalar(RAIL_H / 2);
      rail.translate(mid.x + off.x + up.x, mid.y + off.y + up.y, mid.z + off.z + up.z);
      parts.push(rail);
      // 望柱（每隔一段一根）
      if (i % 3 === 0) {
        const post = new THREE.BoxGeometry(0.26, RAIL_H + 0.22, 0.26);
        post.applyQuaternion(q);
        const px = p0.x + off.x;
        const py = p0.y + up.y + localUp.x * 0.11;
        const pz = p0.z + off.z;
        post.translate(px, py, pz);
        parts.push(post);
      }
    }
  }

  // ③ 桥墩：跨中两座，从桥面下到水面
  if (waterY != null) {
    for (const t of [0.35, 0.65]) {
      const i = Math.min(seg - 1, Math.round(t * seg));
      const p = pts[i];
      const h = p.y - THICK - waterY;
      if (h <= 0.2) continue;
      const pier = new THREE.BoxGeometry(width * 0.55, h, 1.5);
      pier.translate(p.x, waterY + h / 2, p.z);
      parts.push(pier);
    }
  }

  if (!parts.length) return null;
  const merged = mergeIndexed(parts);
  return merged;
}

/** 合并一组几何（统一索引、属性一致，避免 mergeGeometries 返回 null） */
function mergeIndexed(geos) {
  const valid = geos.filter((g) => g && g.attributes && g.attributes.position);
  if (!valid.length) return null;
  let total = 0;
  let idxTotal = 0;
  for (const g of valid) {
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) {
      const n = g.attributes.position.count;
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    }
    total += g.attributes.position.count;
    idxTotal += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  const idx = total > 65535 ? new Uint32Array(idxTotal) : new Uint16Array(idxTotal);
  let vo = 0;
  let io = 0;
  for (const g of valid) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array.subarray(0, n * 3), vo * 3);
    nor.set(g.attributes.normal.array.subarray(0, n * 3), vo * 3);
    uv.set(g.attributes.uv.array.subarray(0, n * 2), vo * 2);
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.getX(i) + vo;
    } else {
      for (let i = 0; i < n; i++) idx[io++] = i + vo;
    }
    vo += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
