/**
 * 树木
 *
 * 一棵树 = 递归枝干（锥形段拼接）+ 末端的树冠簇（带 alpha 的交叉面片）。
 * 每树种 4 个随机变体，用 InstancedMesh 分发，配合每实例随机
 * 旋转 / 倾角 / 缩放，避免"一片相同的锥体"的观感。
 *
 * 树冠贴图按树种分别程序化生成：
 *   松   针叶束（细密针簇）
 *   柳   下垂柳条
 *   桃   团簇花（粉白）
 *   杨   细碎叶
 *   枫   掌状叶
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------ 树冠贴图 */

/** 画一个不规则叶簇（很多小叶/针束叠在一起） */
function drawCluster(g, cx, cy, r, rnd, palette, kind) {
  // 叶子数量少而大 —— 早前 120 片小叶挤在 256px 里，
  // 放大到近景就是一团糊；改成可辨认的单叶
  // 数量按 512px 画布重算：单叶只占十几像素，必须多画才密
  const n = kind === 'needle' ? 420 : kind === 'flower' ? 150 : 260;
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const rr = Math.pow(rnd(), 0.62) * r;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr * 0.86;
    const c = palette[Math.floor(rnd() * palette.length)];
    g.globalAlpha = 0.5 + rnd() * 0.5;
    g.fillStyle = c;
    if (kind === 'needle') {
      // 针叶束：一撮细线（稍长，近看能分出针）
      const len = r * (0.05 + rnd() * 0.09);
      const ang = rnd() * Math.PI * 2;
      g.strokeStyle = c;
      g.lineWidth = 0.8 + rnd() * 0.9;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      g.stroke();
    } else if (kind === 'flower') {
      // 五瓣花
      const s = r * (0.022 + rnd() * 0.026);
      g.beginPath();
      for (let p = 0; p < 5; p++) {
        const pa = (p / 5) * Math.PI * 2 + rnd() * 0.4;
        const px = x + Math.cos(pa) * s;
        const py = y + Math.sin(pa) * s;
        if (p === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      g.fill();
      if (rnd() < 0.35) {
        g.fillStyle = 'rgba(255,240,190,0.9)';
        g.beginPath();
        g.arc(x, y, s * 0.35, 0, Math.PI * 2);
        g.fill();
      }
    } else {
      // 单片叶子：带尖端的卵形，能看出叶脉（10~22cm，与真实树叶同尺）
      const s = r * (0.05 + rnd() * 0.05);
      const ang = rnd() * Math.PI * 2;
      g.save();
      g.translate(x, y);
      g.rotate(ang);
      g.beginPath();
      g.moveTo(-s, 0);
      g.quadraticCurveTo(0, -s * 0.72, s, 0);
      g.quadraticCurveTo(0, s * 0.72, -s, 0);
      g.closePath();
      g.fill();
      // 叶脉
      g.strokeStyle = 'rgba(30,44,24,0.45)';
      g.lineWidth = Math.max(0.6, s * 0.09);
      g.beginPath();
      g.moveTo(-s * 0.9, 0);
      g.lineTo(s * 0.9, 0);
      g.stroke();
      g.restore();
    }
  }
  g.globalAlpha = 1;
}

const SPECIES_TEX = {
  pine: {
    kind: 'needle',
    palette: ['#2c4a33', '#3a5c40', '#25402c', '#456b4a'],
    clusters: [
      { x: 0.5, y: 0.42, r: 0.30 },
      { x: 0.22, y: 0.62, r: 0.20 },
      { x: 0.78, y: 0.60, r: 0.20 },
    ],
  },
  willow: {
    kind: 'leaf',
    palette: ['#5d7a3f', '#6d8b4b', '#4e6a35', '#7d9955'],
    clusters: [{ x: 0.5, y: 0.5, r: 0.42 }],
    strands: true,
  },
  blossom: {
    kind: 'flower',
    palette: ['#e8a8bd', '#f0c0cf', '#d98aa4', '#f6d5de'],
    clusters: [
      { x: 0.42, y: 0.44, r: 0.30 },
      { x: 0.70, y: 0.62, r: 0.24 },
    ],
    leaves: ['#6d8b4b', '#5d7a3f'],
  },
  poplar: {
    kind: 'leaf',
    palette: ['#5b7a42', '#6a8a4e', '#4e6a35', '#75935a'],
    clusters: [{ x: 0.5, y: 0.5, r: 0.40 }],
  },
  maple: {
    kind: 'leaf',
    palette: ['#9c6238', '#b5743f', '#8a5330', '#c68a4e'],
    clusters: [{ x: 0.5, y: 0.48, r: 0.36 }],
  },
};

function makeFoliageTexture(species, seed) {
  // 512px：树冠卡片在世界尺度上约 4~6m，512px ≈ 1cm/px，
  // 单叶画到 10~20cm 才是真的叶子；256px 时一片叶有半米，近景就成了"草束"。
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const rnd = mulberry32(seed);
  const spec = SPECIES_TEX[species] || SPECIES_TEX.maple;

  if (spec.strands) {
    // 柳：上部一团叶，下垂细条（不能只是直棍，要软、要密）
    drawCluster(
      g,
      S * 0.5,
      S * 0.32,
      S * 0.3,
      rnd,
      spec.palette,
      'leaf'
    );
    for (let i = 0; i < 520; i++) {
      const x = S * 0.12 + rnd() * S * 0.76;
      const y0 = S * (0.18 + rnd() * 0.32);
      const len = S * (0.18 + rnd() * 0.58);
      const sway = (rnd() - 0.5) * 38;
      g.strokeStyle = spec.palette[Math.floor(rnd() * spec.palette.length)];
      g.globalAlpha = 0.3 + rnd() * 0.45;
      g.lineWidth = 0.5 + rnd() * 1.4;
      g.beginPath();
      g.moveTo(x, y0);
      g.bezierCurveTo(
        x + sway * 0.3,
        y0 + len * 0.35,
        x + sway * 0.8,
        y0 + len * 0.7,
        x + sway,
        y0 + len
      );
      g.stroke();
      // 柳叶点缀：每条垂枝上挂若干小叶，柳条才不是光杆
      const leaves = 4 + Math.floor(rnd() * 7);
      for (let k = 0; k < leaves; k++) {
        const t = 0.25 + (k / leaves) * 0.72 + rnd() * 0.08;
        g.globalAlpha = 0.55 + rnd() * 0.4;
        g.fillStyle = spec.palette[Math.floor(rnd() * spec.palette.length)];
        g.save();
        g.translate(x + sway * t, y0 + len * t);
        g.rotate((rnd() - 0.5) * 1.2 + Math.PI * 0.15);
        g.beginPath();
        g.ellipse(0, 0, 5 + rnd() * 5, 1.4 + rnd() * 1.6, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
    }
    g.globalAlpha = 1;
    return finishTex(c);
  }

  for (const cl of spec.clusters) {
    drawCluster(g, cl.x * S, cl.y * S, cl.r * S, rnd, spec.palette, spec.kind);
  }
  if (spec.leaves) {
    // 花树里掺些绿叶，不至于整团都是粉
    for (let i = 0; i < 220; i++) {
      const a = rnd() * Math.PI * 2;
      const rr = Math.pow(rnd(), 0.5) * S * 0.44;
      const x = S * 0.5 + Math.cos(a) * rr;
      const y = S * 0.5 + Math.sin(a) * rr * 0.86;
      g.globalAlpha = 0.55 + rnd() * 0.4;
      g.fillStyle = spec.leaves[Math.floor(rnd() * spec.leaves.length)];
      g.save();
      g.translate(x, y);
      g.rotate(rnd() * Math.PI * 2);
      g.beginPath();
      g.ellipse(0, 0, S * 0.016, S * 0.009, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    g.globalAlpha = 1;
  }
  return finishTex(c);
}

/**
 * 边缘径向透明衰减：否则卡片边界会切出一条硬直边，
 * 近看就是"方形贴图"。
 */
function applyEdgeFalloff(c) {
  const S = c.width;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(
    S * 0.5, S * 0.5, S * 0.16,
    S * 0.5, S * 0.5, S * 0.52
  );
  grd.addColorStop(0, 'rgba(0,0,0,1)');
  grd.addColorStop(0.68, 'rgba(0,0,0,0.9)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalCompositeOperation = 'destination-in';
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'source-over';
}

function finishTex(c) {
  applyEdgeFalloff(c);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/* --------------------------------------------------------- 枝干生成 */

/** 从一段锥形枝干长出一棵小树的分枝系统 */
function growBranches(opts) {
  const {
    rnd,
    origin,
    dir,
    len,
    rad,
    depth,
    maxDepth,
    spread,
    out,
    foliageOut,
    leafSize,
    species,
  } = opts;

  const end = origin.clone().addScaledVector(dir, len);
  const seg = new THREE.CylinderGeometry(rad * 0.72, rad, len, 4, 1);
  // 把圆柱对齐到 origin→end
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    dir.clone().normalize()
  );
  const m = new THREE.Matrix4().compose(
    origin.clone().addScaledVector(dir, len * 0.5),
    q,
    new THREE.Vector3(1, 1, 1)
  );
  seg.applyMatrix4(m);
  out.push(seg);

  if (depth >= maxDepth) {
    // 末端挂一簇树冠。
    //
    // 近景最忌讳"一大片贴图叶子"——人眼贴近看，4~6m 宽的卡片就是一块
    // 平板。改成**小卡片多片**：每片 1/2.5 大小、围着枝端散开 4 片，
    // 树冠就从"几张大板"变成一团有体积的细叶。
    const N = 4;
    for (let i = 0; i < N; i++) {
      const off = new THREE.Vector3(
        (rnd() - 0.5) * leafSize * 1.35,
        (rnd() - 0.3) * leafSize * 0.85,
        (rnd() - 0.5) * leafSize * 1.35
      );
      foliageOut.push(
        makeCard(
          end.clone().add(off),
          // 卡片尺寸：四片合计的投影面积要接近旧版的两张大卡，
          // 否则树冠会明显变稀（三角面数不变，只调尺寸）。
          leafSize * (0.62 + rnd() * 0.2),
          rnd,
          species
        )
      );
    }
    return;
  }

  const n = 2 + (rnd() < 0.45 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const az = rnd() * Math.PI * 2;
    const tilt = spread * (0.55 + rnd() * 0.9);
    const nd = dir
      .clone()
      .applyAxisAngle(new THREE.Vector3(Math.cos(az), 0, Math.sin(az)), tilt)
      .normalize();
    nd.y = Math.max(nd.y, -0.25);
    nd.normalize();
    growBranches({
      ...opts,
      origin: end,
      dir: nd,
      len: len * (0.58 + rnd() * 0.2),
      rad: rad * (0.68 + rnd() * 0.15),
      depth: depth + 1,
    });
  }
}

/** 一片树冠卡片：三片交叉面片 */
function makeCard(pos, size, rnd, species) {
  const parts = [];
  // 六片、朝向全错开：轮廓才碎得开，不会看成一块板
  for (let k = 0; k < 6; k++) {
    const p = new THREE.PlaneGeometry(size * 2, size * 2);
    p.rotateZ(rnd() * Math.PI);
    p.rotateY(rnd() * Math.PI);
    p.rotateX((rnd() - 0.5) * 0.8);
    // 每片略偏一点，避免五片完全重合
    p.translate(
      (rnd() - 0.5) * size * 0.7,
      (rnd() - 0.5) * size * 0.5,
      (rnd() - 0.5) * size * 0.7
    );
    p.translate(pos.x, pos.y, pos.z);
    parts.push(p);
  }
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return g;
}

/* -------------------------------------------------------- 树种参数 */

const SPECIES = {
  pine: {
    trunkH: [3.2, 5.0],
    trunkR: 0.22,
    lean: 0.22,
    maxDepth: 1,
    branches: [2, 3],
    spread: 1.15, // 近水平
    lenScale: 1.0,
    leaf: 1.5,
    leafSize: [1.5, 2.6],
    bark: 0x4a3d2e,
  },
  willow: {
    trunkH: [3.6, 5.4],
    trunkR: 0.26,
    lean: 0.16,
    maxDepth: 1,
    branches: [3, 4],
    spread: 0.85,
    lenScale: 1.15,
    leaf: 1.9,
    leafSize: [2.0, 3.2],
    bark: 0x544431,
  },
  blossom: {
    trunkH: [2.8, 4.2],
    trunkR: 0.19,
    lean: 0.18,
    maxDepth: 1,
    branches: [3, 4],
    spread: 0.95,
    lenScale: 0.9,
    leaf: 1.4,
    leafSize: [1.5, 2.4],
    bark: 0x4e3f30,
  },
  poplar: {
    trunkH: [6.0, 10.0],
    trunkR: 0.28,
    lean: 0.07,
    maxDepth: 2,
    branches: [2, 3],
    spread: 0.5,
    lenScale: 0.85,
    leaf: 1.1,
    leafSize: [1.0, 1.7],
    bark: 0x5c4c38,
  },
  maple: {
    trunkH: [2.8, 4.4],
    trunkR: 0.21,
    lean: 0.15,
    maxDepth: 1,
    branches: [3, 4],
    spread: 1.0,
    lenScale: 0.85,
    leaf: 1.5,
    leafSize: [1.6, 2.6],
    bark: 0x4b3d2f,
  },
};

/** 生成一个树种的一个变体模板 */
function buildTemplate(species, variant) {
  const spec = SPECIES[species];
  const rnd = mulberry32(0x9e3779b9 ^ (variant * 2654435761) ^ species.length * 7919);
  const trunkParts = [];
  const foliageParts = [];

  const h = spec.trunkH[0] + rnd() * (spec.trunkH[1] - spec.trunkH[0]);
  const lean = (rnd() - 0.5) * 2 * spec.lean;
  const trunkTop = new THREE.Vector3(
    lean * h * 0.5,
    h,
    (rnd() - 0.5) * spec.lean * h * 0.5
  );

  // 主干：分三段带轻微弯折
  let p0 = new THREE.Vector3(0, 0, 0);
  let p1 = new THREE.Vector3(lean * h * 0.2, h * 0.42, (rnd() - 0.5) * 0.2);
  let p2 = trunkTop;
  for (const [a, b, r0, r1] of [
    [p0, p1, spec.trunkR, spec.trunkR * 0.78],
    [p1, p2, spec.trunkR * 0.78, spec.trunkR * 0.58],
  ]) {
    const dir = b.clone().sub(a);
    const len = dir.length();
    const seg = new THREE.CylinderGeometry(r1, r0, len, 6, 1);
    const q = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.clone().normalize()
    );
    seg.applyMatrix4(
      new THREE.Matrix4().compose(
        a.clone().addScaledVector(dir, 0.5),
        q,
        new THREE.Vector3(1, 1, 1)
      )
    );
    trunkParts.push(seg);
  }

  // 主枝
  const nb = spec.branches[0] + Math.floor(rnd() * (spec.branches[1] - spec.branches[0] + 1));
  for (let i = 0; i < nb; i++) {
    const az = (i / nb) * Math.PI * 2 + rnd() * 0.9;
    const up = species === 'poplar' ? 0.45 + rnd() * 0.3 : 0.1 + rnd() * 0.45;
    const dir = new THREE.Vector3(
      Math.cos(az) * Math.cos(up),
      Math.sin(up),
      Math.sin(az) * Math.cos(up)
    ).normalize();
    growBranches({
      rnd,
      origin: p1.clone().lerp(p2, rnd() * 0.55),
      dir,
      len: h * 0.42 * spec.lenScale * (0.8 + rnd() * 0.45),
      rad: spec.trunkR * 0.5,
      depth: 0,
      maxDepth: spec.maxDepth,
      spread: spec.spread,
      out: trunkParts,
      foliageOut: foliageParts,
      leafSize: spec.leafSize[0] + rnd() * (spec.leafSize[1] - spec.leafSize[0]),
      species,
    });
  }

  return {
    trunk: mergeGeometries(trunkParts, false),
    foliage: mergeGeometries(foliageParts, false),
    height: h,
  };
}
/* ------------------------------------------------------------ 总装 */

export function buildTrees(sceneData, heightAt) {
  const group = new THREE.Group();
  group.name = 'trees';
  const trees = sceneData.trees || [];
  const VARIANTS = 4;

  const barkMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });

  const byType = new Map();
  for (const t of trees) {
    if (!byType.has(t.type)) byType.set(t.type, []);
    byType.get(t.type).push(t);
  }

  const templates = new Map(); // `${species}:${variant}` → {trunk, foliage}

  for (const [species, list] of byType) {
    if (!SPECIES[species]) continue;

    // 按变体分组
    const buckets = Array.from({ length: VARIANTS }, () => []);
    list.forEach((t, i) => {
      // 用坐标哈希决定变体，保证同一棵树每次构建变体一致
      const hsh =
        Math.abs(Math.round(t.x * 13 + t.z * 7 + t.seed * 0.0001)) % VARIANTS;
      buckets[hsh].push(t);
    });

    for (let v = 0; v < VARIANTS; v++) {
      const bucket = buckets[v];
      if (!bucket.length) continue;
      const key = `${species}:${v}`;
      let tpl = templates.get(key);
      if (!tpl) {
        tpl = buildTemplate(species, v);
        if (!tpl.trunk || !tpl.foliage) {
          console.warn(`树模板 ${key} 合并失败，跳过`);
          continue;
        }
        templates.set(key, tpl);
      }

      // 枝干
      const trunkMesh = new THREE.InstancedMesh(tpl.trunk, barkMat, bucket.length);
      trunkMesh.castShadow = true;
      trunkMesh.receiveShadow = true;
      // 每实例颜色微差（树皮）
      trunkMesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(bucket.length * 3),
        3
      );

      // 树冠
      const tex = makeFoliageTexture(species, 1000 + v * 97 + species.length * 13);
      const leafMat = new THREE.MeshStandardMaterial({
        map: tex,
        alphaTest: 0.35,
        transparent: false,
        // 用 MSAA 做 alpha 裁剪：边缘平滑，又不需要透明排序
        alphaToCoverage: true,
        side: THREE.DoubleSide,
        roughness: 0.88,
        metalness: 0,
      });
      const leafMesh = new THREE.InstancedMesh(tpl.foliage, leafMat, bucket.length);
      leafMesh.castShadow = true;
      leafMesh.receiveShadow = true;
      leafMesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(bucket.length * 3),
        3
      );

      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const pos = new THREE.Vector3();
      const scl = new THREE.Vector3();
      const eul = new THREE.Euler();
      const col = new THREE.Color();
      const barkCol = new THREE.Color(SPECIES[species].bark);
      const leafTint = new THREE.Color(0xffffff);

      bucket.forEach((t, i) => {
        const rnd = mulberry32(t.seed);
        const y = heightAt?.(t.x, t.z) ?? 0;
        const s = 0.72 + rnd() * 0.62;
        const yaw = rnd() * Math.PI * 2;
        const tilt = (rnd() - 0.5) * 0.18;

        eul.set(tilt, yaw, (rnd() - 0.5) * 0.16);
        q.setFromEuler(eul);

        pos.set(t.x, y - 0.12, t.z);
        scl.set(s * (0.9 + rnd() * 0.2), s, s * (0.9 + rnd() * 0.2));
        m.compose(pos, q, scl);
        trunkMesh.setMatrixAt(i, m);

        // 树冠：略微上浮，贴在枝端
        pos.set(t.x, y - 0.12, t.z);
        scl.set(s * (0.92 + rnd() * 0.22), s * (0.9 + rnd() * 0.25), s);
        m.compose(pos, q, scl);
        leafMesh.setMatrixAt(i, m);

        // 每株色相微差，避免"复制粘贴"
        const hueShift = (rnd() - 0.5) * 0.045;
        const valShift = 0.86 + rnd() * 0.28;
        col.copy(barkCol).offsetHSL(hueShift * 0.4, 0, (rnd() - 0.5) * 0.08);
        trunkMesh.setColorAt(i, col);
        col.copy(leafTint).offsetHSL(hueShift, (rnd() - 0.5) * 0.08, (valShift - 1) * 0.4);
        leafMesh.setColorAt(i, col);
      });

      trunkMesh.instanceMatrix.needsUpdate = true;
      leafMesh.instanceMatrix.needsUpdate = true;
      if (trunkMesh.instanceColor) trunkMesh.instanceColor.needsUpdate = true;
      if (leafMesh.instanceColor) leafMesh.instanceColor.needsUpdate = true;

      group.add(trunkMesh, leafMesh);
    }
  }

  return group;
}
