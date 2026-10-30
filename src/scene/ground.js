/**
 * 地面细部
 *
 *  - 草土地面贴图（程序化，叠在顶点色上打散大面积纯色）
 *  - OSM 步道：把园内游路画成碎石路面，是园子"有设计"的关键证据
 *  - 驳岸：沿水岸一圈条石，池与陆的交界不该是生硬的切边
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getTextureOverrides } from './buildings/textures.js';
import { ringArea } from './buildings/index.js';

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

/* ------------------------------------------------------------ 地面贴图 */

export function makeGroundTexture() {
  // 刻意**不用** AI 草地照片贴图（它自带方向性笔触，平铺到全园是一片斜纹）。
  // 程序化的随机色斑 + 随机草叶没有方向性，平铺看不出来。
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const rnd = mulberry32(20261029);

  g.fillStyle = '#8f9463';
  g.fillRect(0, 0, S, S);

  // 大块色斑：枯草 / 湿草 / 裸土 —— 对比必须够大，否则远看还是死平一块
  const PATCH = [
    '186,172,112', // 枯黄
    '78,92,52', // 深湿草
    '148,128,92', // 裸土
    '112,128,66',
    '168,158,108',
  ];
  // 大块色斑要**画在环绕位置上**（同一点画 9 遍，分别偏移 ±S），
  // 否则贴图边缘对不上——平铺到全园就是每 18m 一道网格缝，
  // 俯视时整片草地像铺了一张花地毯。
  for (let i = 0; i < 120; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const r = 36 + rnd() * 120;
    const col = PATCH[Math.floor(rnd() * PATCH.length)];
    const a0 = 0.42 + rnd() * 0.36;
    const a1 = 0.16 + rnd() * 0.2;
    for (const ox of [-S, 0, S]) {
      for (const oy of [-S, 0, S]) {
        const grd = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        grd.addColorStop(0, `rgba(${col},${a0})`);
        grd.addColorStop(0.6, `rgba(${col},${a1})`);
        grd.addColorStop(1, `rgba(${col},0)`);
        g.fillStyle = grd;
        g.beginPath();
        g.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  // 草叶笔触（同样环绕画，保证无缝）
  for (let i = 0; i < 7000; i++) {
    const x = rnd() * S;
    const y = rnd() * S;
    const len = 2 + rnd() * 7;
    const ang = -Math.PI / 2 + (rnd() - 0.5) * 1.4;
    const v = rnd();
    const col =
      v < 0.3
        ? 'rgba(196,202,138,0.75)'
        : v < 0.62
          ? 'rgba(62,74,42,0.7)'
          : 'rgba(158,152,104,0.6)';
    g.strokeStyle = col;
    g.lineWidth = 1 + rnd() * 1.4;
    for (const ox of [-S, 0, S]) {
      for (const oy of [-S, 0, S]) {
        g.beginPath();
        g.moveTo(x + ox, y + oy);
        g.lineTo(x + ox + Math.cos(ang) * len, y + oy + Math.sin(ang) * len);
        g.stroke();
      }
    }
  }

  // 细碎土粒
  for (let i = 0; i < 3400; i++) {
    g.fillStyle = `rgba(${132 + rnd() * 64},${120 + rnd() * 58},${86 + rnd() * 52},${rnd() * 0.5})`;
    g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 3.4, 1 + rnd() * 3.4);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/** 碎石路面贴图 */
export function makePathTexture() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const rnd = mulberry32(777);
  g.fillStyle = '#9a927e';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 1400; i++) {
    const v = rnd();
    g.fillStyle =
      v < 0.4
        ? `rgba(152,145,128,${rnd() * 0.7})`
        : v < 0.75
          ? `rgba(176,169,150,${rnd() * 0.6})`
          : `rgba(112,106,92,${rnd() * 0.45})`;
    const s = 1 + rnd() * 2.6;
    g.beginPath();
    g.ellipse(rnd() * S, rnd() * S, s, s * (0.6 + rnd() * 0.5), rnd() * 3.14, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/* -------------------------------------------------------------- 步道 */

function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i];
    const [xj, zj] = ring[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi)
      inside = !inside;
  }
  return inside;
}

/**
 * 把折线做成带状网格。
 * 落在水面上的段要断开 —— 否则会画出一道横穿湖面的诡异白带。
 */
function ribbon(line, width, heightAt, isWater, lift = 0.09) {
  if (line.length < 2) return null;
  const verts = [];
  const uvs = [];
  const idx = [];
  let dist = 0;
  let run = []; // 当前连续可画的一段
  const flush = () => {
    if (run.length < 2) {
      run = [];
      return;
    }
    const base = verts.length / 3;
    for (let i = 0; i < run.length; i++) {
      const [x, z] = run[i];
      const prev = run[Math.max(0, i - 1)];
      const next = run[Math.min(run.length - 1, i + 1)];
      let dx = next[0] - prev[0];
      let dz = next[1] - prev[1];
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      const nx = -dz;
      const nz = dx;
      if (i > 0)
        dist += Math.hypot(x - run[i - 1][0], z - run[i - 1][1]);
      const w = width * 0.5;
      const y = (heightAt?.(x, z) ?? 0) + lift;
      verts.push(x + nx * w, y, z + nz * w);
      verts.push(x - nx * w, y, z - nz * w);
      uvs.push(dist / 2.2, 0, dist / 2.2, 1);
    }
    for (let i = 0; i < run.length - 1; i++) {
      const a = base + i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    run = [];
  };

  for (const pt of line) {
    if (isWater && isWater(pt[0], pt[1])) {
      flush();
      continue;
    }
    run.push(pt);
  }
  flush();

  if (!idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildPaths(sceneData, heightAt) {
  const group = new THREE.Group();
  group.name = 'paths';
  const parts = [];

  // 水面占用判定
  const waters = (sceneData.water || []).filter((w) => w.ring && w.ring.length > 2);
  const isWater = (x, z) => {
    for (const w of waters) {
      if (Math.abs(x - w.cx) > 400 || Math.abs(z - w.cz) > 400) continue;
      if (pointInRing(x, z, w.ring)) return true;
    }
    return false;
  };

  for (const p of sceneData.paths || []) {
    const kind = p.kind;
    let width = 1.6;
    if (kind === 'steps') width = 2.2;
    else if (kind === 'footway') width = 1.7;
    else if (kind === 'path') width = 2.0;
    else if (kind === 'pedestrian') width = 2.6;
    else continue; // track/landuse 不铺面
    const g = ribbon(p.line, width, heightAt, isWater);
    if (g) parts.push(g);
  }
  if (!parts.length) return group;

  const tex = makePathTexture();
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.97,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(mergeGeometries(parts, false), mat);
  mesh.receiveShadow = true;
  group.add(mesh);
  for (const g of parts) g.dispose();
  return group;
}

/* -------------------------------------------------------------- 驳岸 */

export function buildRevetment(sceneData, heightAt) {
  const group = new THREE.Group();
  group.name = 'revetment';
  const parts = [];
  const waters = sceneData.water || [];
  // 水面大小比较用多边形面积（scene.json 里没存 area）
  const areas = waters.map((w) => (w.ring ? Math.abs(ringArea(w.ring)) : 0));
  for (let wi = 0; wi < waters.length; wi++) {
    const w = waters[wi];
    const ring = w.ring;
    if (!ring || ring.length < 3) continue;
    const level = w.level ?? 0;
    // 沿轮廓向外扩出一圈条石
    let cx = 0;
    let cz = 0;
    for (const [x, z] of ring) {
      cx += x;
      cz += z;
    }
    cx /= ring.length;
    cz /= ring.length;
    const verts = [];
    const idx = [];
    const uvs = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];

      // 岸线只画**真正露出**的那一段。
      // OSM 里常有互相重叠的两片水面（如后湖与福海），它们的接缝在几何上
      // 是一条几百米长的直线——照着画就会在湖面上凭空多出一条石堤。
      const mx = (a[0] + b[0]) / 2;
      const mz = (a[1] + b[1]) / 2;
      let covered = false;
      for (let wj = 0; wj < waters.length; wj++) {
        if (wj === wi) continue;
        const o = waters[wj];
        if (areas[wj] <= areas[wi]) continue;
        if (o.ring && pointInRing(mx, mz, o.ring)) {
          covered = true;
          break;
        }
      }
      if (covered) continue;

      // 每段边各自出一个四边形：跳过某段时不会把前后两段硬连起来
      const outer = (p) => {
        const dx = p[0] - cx;
        const dz = p[1] - cz;
        const d = Math.hypot(dx, dz) || 1;
        const y = heightAt?.(p[0], p[1]) ?? level;
        return [p[0] + (dx / d) * 2.2, y + 0.12, p[1] + (dz / d) * 2.2];
      };
      const oa = outer(a);
      const ob = outer(b);
      const base = verts.length / 3;
      verts.push(a[0], level + 0.35, a[1]);
      verts.push(oa[0], oa[1], oa[2]);
      verts.push(ob[0], ob[1], ob[2]);
      verts.push(b[0], level + 0.35, b[1]);
      uvs.push(i * 0.5, 0, i * 0.5, 1, i * 0.5 + 0.5, 1, i * 0.5 + 0.5, 0);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    if (!verts.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    parts.push(g);
  }
  if (!parts.length) return group;

  const mat = new THREE.MeshStandardMaterial({
    color: 0x8a8377,
    roughness: 0.95,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(mergeGeometries(parts, false), mat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  group.add(mesh);
  for (const g of parts) g.dispose();
  return group;
}
