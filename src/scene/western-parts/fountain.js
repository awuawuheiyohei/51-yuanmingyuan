/**
 * 西洋楼喷泉构件库
 *
 * 考据要点（architecture-notes.md 第三节）：
 *   大水法 —— 北为西洋式石龛（紧靠远瀛观平台），龛正中铜狮头喷水落入
 *              半圆形七级水台；水池为半圆海棠形；池心铜鹿，八杈角各喷一道水，
 *              鹿东西各五只铜猎犬对喷（"十犬喷鹿"）；池东西有翻尾石鱼与
 *              翻尾大海猪；大池外东西各有十三层方形喷水塔。
 *   海晏堂 —— 门前大喷水池中央石蚌，其上转轮水法，再上喷水石鱼二只；
 *              十二生肖兽首人身像沿石跑梯八字展开。
 */
import * as THREE from 'three';
import { mergeAll, UVK } from './materials.js';
import {
  box,
  boxAt,
  cyl,
  cylAt,
  sph,
  cone,
  lathe,
  torus,
  worldUV,
  volute,
  leaf,
  archVoussoirs,
  archTrim,
} from './kit.js';

/* ============================================================ 池 */

/**
 * 海棠形半圆池轮廓（R 为半径）。
 * 海棠叶：中尖、两侧微瓣，所以半径在中段拉出叶尖、边缘带小波浪。
 */
export function begoniaShape(R) {
  const s = new THREE.Shape();
  s.moveTo(-R, 0);
  s.lineTo(R, 0);
  const n = 56;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = Math.PI * t;
    let r = R * (1 + 0.04 * Math.cos(6 * a));
    const tip = Math.max(0, 1 - Math.abs(a - Math.PI / 2) / 0.4);
    r += R * 0.24 * tip * tip;
    s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  s.closePath();
  return s;
}

/** 把 XY 平面的 shape 摊到 XZ 平面（shape 的 +Y → 世界 +Z，即南） */
function flatten(shapeGeo) {
  const g = shapeGeo.clone();
  g.rotateX(Math.PI / 2);
  g.computeVertexNormals();
  return worldUV(g);
}

/**
 * 把几何体贴到起伏的地面上。
 * 池子必须随地形起伏，否则水面会被草皮穿帮、池壁也会悬空。
 * @param {THREE.BufferGeometry} geo
 * @param {(lx:number,lz:number)=>number} groundAt 局部坐标下的地面高
 * @param {number} topY 顶面相对地面的高度
 * @param {number} botY 底面相对地面的高度
 */
function conform(geo, groundAt, topY, botY) {
  const pos = geo.attributes.position;
  const span = topY - botY;
  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i);
    const lz = pos.getZ(i);
    const g = groundAt ? groundAt(lx, lz) : 0;
    const y = pos.getY(i); // 挤出体：顶面 y=0，底面 y=-1
    pos.setY(i, g + topY + y * span);
  }
  geo.computeVertexNormals();
  return geo;
}

/** 水面 UV 改成米制（波纹贴图按 3.5 m 一张铺） */
function meterUV(geo) {
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i);
    uv[i * 2 + 1] = pos.getZ(i);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

/**
 * 海棠形半圆石池。
 * @param {number} R 半径
 * @param {number} depth 池深
 * @param {number} wall 池壁宽
 * @param {Function} groundAt 局部坐标 → 地面高（没有则按平地处理）
 * @returns {{rim:THREE.BufferGeometry, floor:THREE.BufferGeometry, water:THREE.BufferGeometry}}
 */
export function begoniaPool(R, depth = 1.2, wall = 1.0) {
  const outer = begoniaShape(R);
  const innerPts = begoniaShape(R - wall).getPoints(60);
  const hole = new THREE.Path();
  hole.moveTo(innerPts[0].x, innerPts[0].y);
  for (let i = innerPts.length - 1; i >= 0; i--) hole.lineTo(innerPts[i].x, innerPts[i].y);
  outer.holes.push(hole);

  const rim = new THREE.ExtrudeGeometry(outer, { depth: 1.0, bevelEnabled: false, curveSegments: 4 });
  rim.rotateX(Math.PI / 2);
  rim.computeVertexNormals();
  worldUV(rim);

  const inner = new THREE.Shape();
  const ip = begoniaShape(R - wall).getPoints(60);
  inner.moveTo(ip[0].x, ip[0].y);
  for (const p of ip) inner.lineTo(p.x, p.y);
  inner.closePath();

  const floor = flatten(new THREE.ShapeGeometry(inner, 8));
  floor.translate(0, -depth, 0);

  const water = flatten(new THREE.ShapeGeometry(inner, 8));

  return { rim, floor, water };
}

/** 八角喷水池（海晏堂后楼南北各二座、观水法） */
export function octagonalPool(R, depth = 0.9, wall = 0.55) {
  const outer = new THREE.Shape();
  const inner = new THREE.Shape();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = Math.cos(a) * R;
    const y = Math.sin(a) * R;
    if (i === 0) outer.moveTo(x, y);
    else outer.lineTo(x, y);
    const xi = Math.cos(a) * (R - wall);
    const yi = Math.sin(a) * (R - wall);
    if (i === 0) inner.moveTo(xi, yi);
    else inner.lineTo(xi, yi);
  }
  outer.closePath();
  inner.closePath();
  const hole = new THREE.Path();
  const ip = inner.getPoints(8);
  hole.moveTo(ip[0].x, ip[0].y);
  for (let i = ip.length - 1; i >= 0; i--) hole.lineTo(ip[i].x, ip[i].y);
  outer.holes.push(hole);

  const rim = new THREE.ExtrudeGeometry(outer, { depth: 1.0, bevelEnabled: false });
  rim.rotateX(Math.PI / 2);
  rim.computeVertexNormals();
  worldUV(rim);

  const floor = flatten(new THREE.ShapeGeometry(inner, 1));
  floor.translate(0, -depth, 0);
  const water = flatten(new THREE.ShapeGeometry(inner, 1));
  return { rim, floor, water };
}

/**
 * 半圆形七级水台：层层收进，每层台面外沿喷水入泄水沟。
 * 形状用旋成体一次成型（不是一摞锥体）。
 */
export function waterTable(R = 8, tiers = 7, tierH = 0.62, dr = 0.92) {
  const prof = [new THREE.Vector2(0, 0)];
  let y = 0;
  let r = R;
  for (let i = 0; i < tiers; i++) {
    prof.push(new THREE.Vector2(r, y));
    prof.push(new THREE.Vector2(r, y + tierH));
    y += tierH;
    r -= dr;
    prof.push(new THREE.Vector2(r, y));
  }
  prof.push(new THREE.Vector2(0, y));
  const g = new THREE.LatheGeometry(prof, 40, -Math.PI / 2, Math.PI);
  g.computeVertexNormals();
  worldUV(g);
  return { geometry: g, topY: y, topR: r };
}

/** 泄水沟：两条低石墙夹一道槽 */
export function waterChannel(len, w = 1.4, h = 0.5) {
  const parts = [];
  for (const sx of [-1, 1]) {
    parts.push(boxAt(len, h, 0.42, 0, h / 2, sx * (w / 2)));
  }
  parts.push(boxAt(len, 0.16, w, 0, 0.08, 0));
  return mergeAll(parts);
}

/* ============================================================ 大水法 */

/**
 * 西洋式石龛（大水法北端的壁面）：券洞 + 扇贝壳 + 壁柱 + 断山花。
 * 朝向 +Z（面南，正对池子）。
 */
export function stoneNiche(w = 19, h = 16, d = 2.2) {
  const parts = [];
  const openW = 8.4;
  const openH = 11.2;

  // 券洞墙身
  const wall = new THREE.Shape();
  wall.moveTo(-w / 2, 0);
  wall.lineTo(w / 2, 0);
  wall.lineTo(w / 2, h);
  wall.lineTo(-w / 2, h);
  wall.closePath();
  const hole = new THREE.Path();
  const r = openW / 2;
  const y1 = openH - r;
  hole.moveTo(-r, 0);
  hole.lineTo(-r, y1);
  hole.absarc(0, y1, r, Math.PI, 0, true);
  hole.lineTo(r, 0);
  hole.closePath();
  wall.holes.push(hole);
  const wallGeo = new THREE.ExtrudeGeometry(wall, { depth: d, bevelEnabled: false, curveSegments: 10 });
  wallGeo.translate(0, 0, -d / 2);
  wallGeo.computeVertexNormals();
  worldUV(wallGeo);
  parts.push(wallGeo);

  // 券洞的石作：**券脚 + 券石分缝 + 拱心石 + 券面线脚**
  // （巴洛克券洞的识别特征；没有这圈，近看就是一个剪出来的洞）
  const springY = openH - r;
  parts.push(archTrim(r, springY, d, { t: 0.42, count: 13 }));
  // 券口两侧的番花
  for (const sx of [-1, 1]) {
    const lf = leaf(1.5, 0.5, 0.1);
    lf.rotateZ(sx * 1.05);
    lf.translate(sx * (r + 0.45), springY + r * 0.6, d / 2);
    parts.push(lf);
    const v = volute(0.9, 0.14, 1.55);
    v.rotateZ(sx > 0 ? -Math.PI * 0.35 : Math.PI * 1.35);
    v.translate(sx * (r + 0.1), springY + r * 0.22, d / 2);
    parts.push(v);
  }

  // 券洞里的扇贝壳（同心半圆 + 放射肋）
  for (let i = 0; i < 6; i++) {
    const rr = r - 0.12 - i * 0.62;
    if (rr < 0.5) break;
    const arc = torus(rr, 0.13, 6, 18, Math.PI);
    arc.translate(0, y1 - rr + rr, 0);
    arc.translate(0, 0, -d / 2 + 0.25 + i * 0.3);
    parts.push(arc);
  }
  for (let i = 0; i <= 9; i++) {
    const a = Math.PI * (i / 9);
    const rib = box(0.16, r - 0.2, 0.3);
    rib.rotateZ(a - Math.PI / 2);
    rib.translate(Math.cos(a) * (r - 0.2) * 0.5, y1 + Math.sin(a) * (r - 0.2) * 0.5, -d / 2 + 0.5);
    parts.push(rib);
  }

  // 两侧壁柱
  for (const sx of [-1, 1]) {
    const p = boxAt(1.7, h - 1.2, d * 1.15, sx * (w / 2 - 1.0), (h - 1.2) / 2, 0);
    parts.push(p);
    parts.push(boxAt(2.2, 0.4, d * 1.4, sx * (w / 2 - 1.0), 0.2, 0));
    parts.push(boxAt(2.1, 0.34, d * 1.35, sx * (w / 2 - 1.0), h - 1.2, 0));
    // 柱头卷涡
    const v = volute(0.7, 0.14, 1.5);
    v.rotateY(Math.PI / 2);
    v.translate(sx * (w / 2 - 1.0), h - 1.55, d * 0.7);
    parts.push(v);
  }

  // 檐部 + 断山花
  parts.push(boxAt(w + 1.4, 0.5, d * 1.4, 0, h - 0.25, 0));
  parts.push(boxAt(w + 1.9, 0.36, d * 1.6, 0, h + 0.16, 0));
  // 山花断口两翼
  for (const sx of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(sx * 5.0, 0);
    shape.lineTo(0, 3.0);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.7, bevelEnabled: false });
    g.translate(sx * 3.4, h + 0.3, -0.35);
    g.computeVertexNormals();
    worldUV(g);
    parts.push(g);
  }
  // 中央纹章（椭圆雕饰）
  const cart = torus(1.5, 0.22, 6, 18);
  cart.translate(0, h + 1.7, 0.36);
  parts.push(cart);
  const cv = volute(0.9, 0.16, 1.6);
  cv.translate(0, h + 1.7, 0.4);
  parts.push(cv);

  return mergeAll(parts);
}

/**
 * 十三层方形喷水塔：大池外东西各一座。
 *
 * 考据：大水法「大水池外，东西各有**十三层方形喷水塔**一座：塔在水池中，
 *       池底有大喷水管八根，塔身上有小喷水管**八十根**，水射高六尺；
 *       塔顶有铜蒺藜十六角，喷水十六道，落入池中」。
 *
 * 做法：十三层塔身**逐层收分**（每层收 5.5 cm），每层一道叠涩线脚；
 *       每层四面开**喷水孔**（凸起的口圈 + 伸出的短管）；
 *       八十根小管按"每面 20 根"分配（各层 2/1 根相间）。
 *
 * 形制简化：管口不做水花（水花在 dawuifa.js 里用锥体水柱表示）。
 */
export function fountainTower(tiers = 13) {
  const parts = [];
  const baseW = 3.8;
  const gap = 0.62;
  const inset = 0.055;
  // 每层的喷水管数（每面）：合计 20 根/面 → 80 根
  const NOZ = [2, 2, 2, 1, 1, 1, 2, 2, 2, 1, 1, 1, 2];

  // 池底座
  parts.push(boxAt(baseW + 1.6, 0.5, baseW + 1.6, 0, 0.25, 0));
  parts.push(boxAt(baseW + 0.7, 0.3, baseW + 0.7, 0, 0.62, 0));

  for (let i = 0; i < tiers; i++) {
    const y0 = 0.75 + i * gap;
    const w = baseW - i * inset;
    // 层身
    parts.push(boxAt(w, gap * 0.78, w, 0, y0 + gap * 0.39, 0));
    // 层顶叠涩线脚
    parts.push(boxAt(w + 0.5, 0.14, w + 0.5, 0, y0 + gap * 0.78, 0));
    parts.push(boxAt(w + 0.24, 0.09, w + 0.24, 0, y0 + gap * 0.78 + 0.11, 0));
    // 每层的喷水孔（四面）
    const cnt = NOZ[i % NOZ.length];
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      for (let k = 0; k < cnt; k++) {
        const off = cnt === 1 ? 0 : (k - 0.5) * 1.15;
        const px = dx ? dx * (w / 2 + 0.1) : off;
        const pz = dz ? dz * (w / 2 + 0.1) : off;
        const ny = y0 + gap * 0.42;
        // 孔口（凸起的圆圈）
        const ring = cyl(0.11, 0.11, 0.07, 6);
        if (dx) ring.rotateZ(-dx * Math.PI / 2);
        else ring.rotateX(dz * Math.PI / 2);
        ring.translate(px, ny, pz);
        parts.push(ring);
        // 短管（喷水嘴）
        const n = cyl(0.055, 0.075, 0.32, 5);
        if (dx) n.rotateZ(-dx * Math.PI / 2);
        else n.rotateX(dz * Math.PI / 2);
        n.translate(px + (dx ? dx * 0.15 : 0), ny, pz + (dz ? dz * 0.15 : 0));
        parts.push(n);
      }
    }
  }

  // 塔顶出檐（承铜蒺藜）
  const topW = baseW - (tiers - 1) * inset;
  parts.push(boxAt(topW + 0.8, 0.22, topW + 0.8, 0, 0.75 + tiers * gap + 0.1, 0));
  parts.push(cyl(0.55, 0.6, 0.5, 10).translate(0, 0.75 + tiers * gap + 0.45, 0));

  // 池底大喷水管八根
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const n = cyl(0.11, 0.15, 0.8, 6);
    n.rotateZ(-Math.cos(a) * 1.1);
    n.rotateX(Math.sin(a) * 1.1);
    n.translate(Math.cos(a) * (baseW / 2 + 0.4), 0.85, Math.sin(a) * (baseW / 2 + 0.4));
    parts.push(n);
  }

  return mergeAll(parts);
}

/**
 * 铜蒺藜（十六角）：塔顶的喷水构件。
 *
 * 考据：大水法「塔顶有铜蒺藜十六角，喷水十六道」。
 * 形制简化：蒺藜本体是球 + 十六根朝外的短管（原"尖刺"改成管口，
 *           因为考据说它是要喷水的）。
 */
export function caltrop(r = 1.1) {
  const parts = [];
  const core = sph(r * 0.4, 10, 8);
  parts.push(core);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    // 管身
    const sp = cyl(0.055 * r, 0.085 * r, 0.8 * r, 6);
    sp.rotateZ(-Math.PI / 2);
    sp.translate(r * 0.55, 0, 0);
    sp.rotateY(-a);
    parts.push(sp);
    // 管口（喇叭口）
    const lip = cyl(0.1 * r, 0.06 * r, 0.12 * r, 6);
    lip.rotateZ(-Math.PI / 2);
    lip.translate(r * 0.95, 0, 0);
    lip.rotateY(-a);
    parts.push(lip);
  }
  // 顶部的宝珠
  parts.push(sph(r * 0.16, 8, 6).translate(0, r * 0.42, 0));
  return mergeAll(parts);
}

/**
 * 石蚌 + 转轮水法（海晏堂大喷水池中央）。
 * 石蚌：张开的两片贝壳；其上为转轮水法（水车）；再上为喷水石鱼二只。
 */
export function clamAndWheel(size = 1) {
  const parts = [];
  const S = size;
  // 下壳（凹面朝上：做成两片扇形壳瓣）
  for (const sx of [-1, 1]) {
    const valve = new THREE.Shape();
    const r = 2.2 * S;
    valve.moveTo(0, 0);
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * Math.PI - Math.PI / 2;
      valve.lineTo(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55);
    }
    for (let i = 12; i >= 0; i--) {
      const a = (i / 12) * Math.PI - Math.PI / 2;
      valve.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    valve.closePath();
    const g = new THREE.ExtrudeGeometry(valve, { depth: 0.22 * S, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    g.rotateY(sx * 0.55);
    g.translate(sx * 0.9 * S, 0.15 * S, 0);
    g.computeVertexNormals();
    worldUV(g);
    parts.push(g);
    // 壳肋
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i / 4) * Math.PI;
      const rib = box(0.12 * S, 0.1 * S, 1.7 * S);
      rib.rotateY(a);
      rib.translate(sx * 0.9 * S + Math.cos(a) * 0.5 * S, 0.28 * S, Math.sin(a) * 0.5 * S);
      parts.push(rib);
    }
  }
  // 转轮水法（水车）
  const wheel = torus(1.15 * S, 0.13 * S, 6, 18);
  wheel.rotateX(Math.PI / 2);
  wheel.translate(0, 1.5 * S, 0);
  parts.push(wheel);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const spoke = box(0.1 * S, 0.1 * S, 2.2 * S);
    spoke.rotateY(a);
    spoke.translate(0, 1.5 * S, 0);
    parts.push(spoke);
  }
  const axle = cyl(0.1 * S, 0.1 * S, 1.4 * S, 8);
  axle.rotateZ(Math.PI / 2);
  axle.translate(0, 1.5 * S, 0);
  parts.push(axle);
  // 水轮下的承台
  parts.push(boxAt(1.6 * S, 0.4 * S, 1.6 * S, 0, 0.2 * S, 0));
  return mergeAll(parts);
}

/** 喷水石鱼（海晏堂池上二只 / 谐奇趣池心大翻尾石鱼） */
export function fountainFish(size = 1) {
  return null; // 由 kit.stoneFish 提供，这里保留接口
}


/**
 * 把池子贴到起伏的地面上（池壁随地形、水面略高于地面）。
 * 必须在池子**摆放到位之后**调用（conform 用的是池子最终的局部坐标）。
 * @param {{rim:THREE.BufferGeometry, floor:THREE.BufferGeometry, water:THREE.BufferGeometry}} pool
 * @param {(lx:number,lz:number)=>number} groundAt
 */
export function conformPool(pool, groundAt) {
  if (!groundAt) return pool;
  conform(pool.rim, groundAt, 0.5, -1.8);
  conform(pool.floor, groundAt, -1.6, -1.8);
  conform(pool.water, groundAt, 0.16, 0.16);
  meterUV(pool.water);
  return pool;
}
