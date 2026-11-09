/**
 * 西洋楼景区（长春园东北部）—— 按考据重做的巴洛克石构建筑群
 *
 * 依据：`data/research/architecture-notes.md` 第三节「西洋楼考据」。
 * 瓦色取 `scenes-program.js` 的 `TILE_COLORS`（西洋楼逐条实记，不按等级顺推）。
 *
 * 中轴自西南向东北：谐奇趣 → 方外观 → 海晏堂 → 大水法 → 线法山；
 * 远瀛观在大水法正北；观水法在大水法水池之南、坐南朝北。
 *
 * 各建筑位置来自圆明园管理处官方导览图配准后的实测坐标（sceneData.westBuildings）。
 *
 * @param {object} sceneData
 * @param {Function} heightAt
 * @returns {THREE.Group | null}
 */
import * as THREE from 'three';
import { createCollector, makeWesternMaterials } from './western-parts/materials.js';
import { mergeGroupByMaterial } from './buildings/merge.js';
import { buildHarmonyHall } from './western-parts/harmony.js';
import { buildFangWaiGuan } from './western-parts/fangwai.js';
import { buildHaiYanTang } from './western-parts/haiyan.js';
import { buildDaShuiFa } from './western-parts/dawuifa.js';
import { buildYuanYingGuan } from './western-parts/yuanying.js';
import { buildGuanShuiFa } from './western-parts/guanshuifa.js';
import { buildXianFaShan } from './western-parts/xianfashan.js';
import { buildHall } from './western-parts/hall.js';
import { buildYangQueLong, buildXuShuiLou } from './western-parts/yangque.js';

/**
 * 中轴单位向量（西南 → 东北）与其"南侧"法向。
 * 由导览图实测坐标推出：谐奇趣 (490,-654) → 线法山 (906,-836)。
 */
const AXIS = (() => {
  const a = new THREE.Vector2(490, -654);
  const b = new THREE.Vector2(906, -836);
  const dir = b.clone().sub(a).normalize();
  // 法向取与远瀛观相反的一侧（远瀛观在大水法正北）
  const perp = new THREE.Vector2(-dir.y, dir.x);
  if (perp.x < 0) perp.negate(); // 让 perp 指向"南"（+Z 偏多）的一侧
  return { dir, perp };
})();

/** 观水法相对大水法的偏移（米）——**推定** */
const GUAN_SHUI_FA_OFFSET = 26.5;

/** 让建筑的"正面"（默认朝 +Z）朝向目标点 */
const faceTo = (bx, bz, tx, tz) => Math.atan2(tx - bx, tz - bz);

/**
 * 局部坐标 → 地面高差（相对建筑基面）。
 * 景区这一带地形起伏近 2 m，池壁/池水/兽像都得按它落地，否则会悬空或被草皮穿帮。
 */
function makeGround(bx, by, bz, brot, heightAt) {
  const c = Math.cos(brot);
  const s = Math.sin(brot);
  return (lx, lz) => {
    const wx = bx + lx * c + lz * s;
    const wz = bz - lx * s + lz * c;
    return heightAt(wx, wz) - by;
  };
}

export function buildWesternEnsemble(sceneData, heightAt) {
  try {
    return buildWestern(sceneData, heightAt);
  } catch (err) {
    console.error(
      '西洋楼构建失败：' + (err && err.stack ? err.stack.split('\n').join(' <<< ') : err)
    );
    throw err;
  }
}

function buildWestern(sceneData, heightAt) {
  const anchor = sceneData.westAnchor;
  const list = sceneData.westBuildings || [];
  if (!anchor || !list.length) return null;

  const group = new THREE.Group();
  group.name = 'western';

  const byName = new Map(list.map((b) => [b.name, b]));
  const c = createCollector(makeWesternMaterials());

  /** 调试取景用的机位表：名字 → {x, z, rotY（正面朝向）} */
  const views = [];

  /* ------------------------------------------------------------ 谐奇趣 */
  const he = byName.get('谐奇趣');
  const heRot = he ? faceTo(he.x, he.z, anchor.x, anchor.z) : 0;
  if (he) {
    views.push({ name: '谐奇趣', x: he.x, z: he.z, rotY: heRot });
    buildHarmonyHall(c, {
      x: he.x,
      y: heightAt(he.x, he.z),
      z: he.z,
      rotY: heRot,
      ground: makeGround(he.x, heightAt(he.x, he.z), he.z, heRot, heightAt),
    });
  }

  /* ------------------------------------------------------------ 养雀笼 */
  // 考据：砖砌楼身 + 汉白玉西洋番花石柱 + 孔雀绿琉璃瓦庑殿顶 + 露顶石栏杆；五间三进。
  // 坐标：OSM 实测（公园官方标注），紧邻谐奇趣西侧 ⇒ 与考据「养雀笼东边是谐奇趣」相符。
  const yq = byName.get('养雀笼');
  if (yq) {
    const yqRot = faceTo(yq.x, yq.z, anchor.x, anchor.z);
    views.push({ name: '养雀笼', x: yq.x, z: yq.z, rotY: yqRot });
    buildYangQueLong(c, {
      x: yq.x,
      y: heightAt(yq.x, yq.z),
      z: yq.z,
      rotY: yqRot,
      ground: makeGround(yq.x, heightAt(yq.x, yq.z), yq.z, yqRot, heightAt),
    });
  }

  /* ------------------------------------------------------------ 方外观 */
  const fw = byName.get('方外观');
  if (fw) {
    const fwRot = faceTo(fw.x, fw.z, anchor.x, anchor.z);
    views.push({ name: '方外观', x: fw.x, z: fw.z, rotY: fwRot });
    buildFangWaiGuan(c, {
      x: fw.x,
      y: heightAt(fw.x, fw.z),
      z: fw.z,
      rotY: fwRot,
      ground: makeGround(fw.x, heightAt(fw.x, fw.z), fw.z, fwRot, heightAt),
    });
  }

  /* ------------------------------------------------------------ 海晏堂 */
  const hy = byName.get('海晏堂');
  const hyRot = hy
    ? faceTo(hy.x, hy.z, fw ? fw.x : anchor.x, fw ? fw.z : anchor.z)
    : 0;
  if (hy) {
    views.push({ name: '海晏堂', x: hy.x, z: hy.z, rotY: hyRot });
    // 前楼长立面朝西（正门向西），即朝向前一座方外观
    buildHaiYanTang(c, {
      x: hy.x,
      y: heightAt(hy.x, hy.z),
      z: hy.z,
      rotY: hyRot,
      ground: makeGround(hy.x, heightAt(hy.x, hy.z), hy.z, hyRot, heightAt),
    });
  }

  /* ------------------------------------------------------------ 大水法 */
  const dw = byName.get('大水法');
  let dwRot = 0;
  if (dw) {
    dwRot = Math.atan2(AXIS.perp.x, AXIS.perp.y);
    views.push({ name: '大水法', x: dw.x, z: dw.z, rotY: dwRot });
    buildDaShuiFa(c, {
      x: dw.x,
      y: heightAt(dw.x, dw.z),
      z: dw.z,
      rotY: dwRot,
      ground: makeGround(dw.x, heightAt(dw.x, dw.z), dw.z, dwRot, heightAt),
    });
  }

  /* ------------------------------------------------------------ 远瀛观 */
  const yy = byName.get('远瀛观');
  if (yy) {
    const yyRot = faceTo(yy.x, yy.z, anchor.x, anchor.z);
    views.push({ name: '远瀛观', x: yy.x, z: yy.z, rotY: yyRot });
    buildYuanYingGuan(c, {
      x: yy.x,
      y: heightAt(yy.x, yy.z),
      z: yy.z,
      rotY: yyRot,
      ground: makeGround(yy.x, heightAt(yy.x, yy.z), yy.z, yyRot, heightAt),
    });
  }

  /* ------------------------------------------------------------ 观水法（推定位置） */
  if (dw) {
    const gx = dw.x + AXIS.perp.x * GUAN_SHUI_FA_OFFSET;
    const gz = dw.z + AXIS.perp.y * GUAN_SHUI_FA_OFFSET;
    views.push({ name: '观水法', x: gx, z: gz, rotY: dwRot + Math.PI });
    buildGuanShuiFa(c, {
      x: gx,
      y: heightAt(gx, gz),
      z: gz,
      ground: makeGround(gx, heightAt(gx, gz), gz, dwRot + Math.PI, heightAt),
      // 观水法坐南朝北：正面朝 -（景区坐标的南向），故相对大水法再转 180°
      rotY: dwRot + Math.PI,
    });
  }

  /* ------------------------------------------------------------ 线法山 */
  const xf = byName.get('线法山');
  if (xf) {
    views.push({ name: '线法山', x: xf.x, z: xf.z, rotY: dwRot });
    buildXianFaShan(c, {
      x: xf.x,
      y: heightAt(xf.x, xf.z),
      z: xf.z,
      rotY: dwRot,
      ground: makeGround(xf.x, heightAt(xf.x, xf.z), xf.z, dwRot, heightAt),
    });
  }

  /* ------------------------------------------------------------ 独立蓄水楼 */
  // 考据：「屋顶四面斜坡，但没有正脊，取而代之是一个小小的平顶」—— 盝顶。
  // 坐标：OSM 实测（在泽兰堂一带，与考据「谐奇趣西北」有出入，取实测，见 notes §5.5）。
  const xs = byName.get('蓄水楼');
  if (xs) {
    const xsRot = faceTo(xs.x, xs.z, anchor.x, anchor.z);
    views.push({ name: '蓄水楼', x: xs.x, z: xs.z, rotY: xsRot });
    buildXuShuiLou(c, {
      x: xs.x,
      y: heightAt(xs.x, xs.z),
      z: xs.z,
      rotY: xsRot,
      ground: makeGround(xs.x, heightAt(xs.x, xs.z), xs.z, xsRot, heightAt),
    });
  }

  /* ------------------------------------------------------------ 泽兰堂 / 转湘帆 */
  // 考据只把泽兰堂列在长春园"园北"，未给形制 → 按小式官式殿宇处理（推定）
  const zl = byName.get('泽兰堂');
  if (zl) {
    c.setTransform(zl.x, heightAt(zl.x, zl.z), zl.z, faceTo(zl.x, zl.z, anchor.x, anchor.z));
    buildHall(c, {
      w: 16,
      d: 11,
      platform: { h: 0.9, out: 1.3, steps: true, rail: true },
      levels: [{ h: 4.6, mian: 3, wall: 'plaster', columnBucket: 'stone', windowH: 2.4 }],
      roof: {
        width: 16,
        depth: 11,
        eaveY: 5.5,
        rise: 2.8,
        type: 'xieshan',
        overhang: 1.5,
        tile: 'lv',
        ridge: 'lv',
      },
      wallBucket: 'plaster',
      trimBucket: 'stone',
      columnBucket: 'stone',
    });
    c.clearTransform();
  }
  const zx = byName.get('转湘帆');
  if (zx) {
    c.setTransform(zx.x, heightAt(zx.x, zx.z), zx.z, faceTo(zx.x, zx.z, zl ? zl.x : anchor.x, zl ? zl.z : anchor.z));
    buildHall(c, {
      w: 14,
      d: 10,
      platform: { h: 0.9, out: 1.2, steps: true, rail: true },
      levels: [{ h: 4.3, mian: 3, wall: 'plaster', columnBucket: 'stone', windowH: 2.2 }],
      roof: {
        width: 14,
        depth: 10,
        eaveY: 5.2,
        rise: 2.6,
        type: 'xieshan',
        overhang: 1.4,
        tile: 'lv',
        ridge: 'lv',
      },
      wallBucket: 'plaster',
      trimBucket: 'stone',
      columnBucket: 'stone',
    });
    c.clearTransform();
  }

  /* ------------------------------------------------------------ 合并 */
  const built = c.build();
  // 把各材质桶的 Mesh 摊平到景区组里，再按材质整体合并
  for (const child of [...built.children]) group.add(child);

  // 整组西洋楼按材质合并：逐座建筑出 Mesh 会让 draw calls 翻好几倍
  mergeGroupByMaterial(group);

  // 喷泉院里不长树：已在构建期排除（scripts/build-scene.mjs 的 westCourts），
  // 不在运行期改实例矩阵。
  installWestDebugView(group, anchor, heightAt, views);

  return group;
}

/* ============================================================ 调试视角 */

/**
 * 西洋楼没有现成的调试视角（`?view=scene|close|garden|top` 都不对着它）。
 * 这里加一个 `?view=west`：只有在明确要求时才挂钩渲染器取相机，
 * 正常浏览时零开销、零副作用。
 *
 *   ?view=west&b=大水法            某景的**正面**（按考据定朝向）
 *   ?view=west&b=海晏堂&d=60&h=6&aim=8   距离 / 机位高 / 取景目标高
 *   ?view=west&plan=1              西洋楼全景俯视（查平面关系）
 *   ?view=west&cam=x,y,z&tgt=x,y,z 自定义机位（世界坐标）
 *
 * 取景用**移轴两点透视**：光轴水平，竖线保持竖直（建筑摄影的常规机位）。
 */
function installWestDebugView(group, anchor, heightAt, views = []) {
  if (typeof location === 'undefined') return;

  const params = new URLSearchParams(location.search);
  const view = params.get('view') || '';
  if (!view.startsWith('west')) return;

  // 统计西洋楼自身的 draw call 与三角面（合并之后）
  {
    let tris = 0;
    let meshes = 0;
    group.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      meshes++;
      const g = o.geometry;
      const cnt = g.index ? g.index.count : g.attributes.position.count;
      tris += cnt / 3;
    });
    console.log(
      `✓ 西洋楼：${meshes} 个材质桶（draw call）· ${Math.round(tris).toLocaleString()} 三角面`
    );
  }

  // 机位以大水法处的地面高程为基准（该景区在园东北的台地上，高程约 47 m）
  const g = heightAt(anchor.x, anchor.z);
  const num = (k, dflt) => {
    const v = Number(params.get(k));
    return Number.isFinite(v) && v !== 0 ? v : dflt;
  };

  let cam = null;
  let tgt = null;
  let level = true; // 是否用移轴两点透视（水平光轴）

  const camArg = params.get('cam');
  const tgtArg = params.get('tgt');
  if (camArg && tgtArg) {
    cam = camArg.split(',').map(Number);
    tgt = tgtArg.split(',').map(Number);
    level = params.get('level') !== '0';
  } else if (params.get('plan')) {
    // 俯视：看平面关系（池子、喷水塔、平台的位置对不对）
    const h = num('h', 150);
    cam = [anchor.x - 30, g + h, anchor.z + 10];
    tgt = [anchor.x + 10, g, anchor.z - 40];
    level = false;
  } else if (params.get('b')) {
    // 按考据定朝向取正面
    const v = views.find((q) => q.name === params.get('b'));
    if (v) {
      const d = num('d', 46);
      const eye = num('h', 5);
      const aim = num('aim', 7);
      // yaw：绕建筑正面轴左右挪机位（度，0 = 正对正面）
      const yaw = ((Number(params.get('yaw')) || 0) * Math.PI) / 180;
      const fx = Math.sin(v.rotY + yaw);
      const fz = Math.cos(v.rotY + yaw);
      const bg = heightAt(v.x, v.z);
      cam = [v.x + fx * d, bg + eye, v.z + fz * d];
      tgt = [v.x, bg + aim, v.z];
    }
  }

  if (!cam || !tgt) {
    // 兜底：整片西洋楼（东南向高空）
    cam = [anchor.x + 140, g + 74, anchor.z + 160];
    tgt = [anchor.x + 16, g + 10, anchor.z - 8];
    level = false;
  }

  const orig = THREE.Object3D.prototype.updateMatrixWorld;
  THREE.Object3D.prototype.updateMatrixWorld = function (force) {
    // 相机没有父节点，渲染器每帧会调 camera.updateMatrixWorld()，
    // 在这里改机位最省事（只在调试视角存在时安装）。
    if (this.isCamera) {
      this.position.set(cam[0], cam[1], cam[2]);
      if (level) {
        // 移轴两点透视：光轴水平 + setViewOffset 把目标顶到画面中央
        const dx = tgt[0] - cam[0];
        const dz = tgt[2] - cam[2];
        const dist = Math.hypot(dx, dz) || 1;
        this.rotation.set(0, Math.atan2(-dx, -dz), 0, 'YXZ');
        const theta = Math.atan2(tgt[1] - cam[1], dist);
        const H = 1000;
        const W = H * (this.aspect || 1.6);
        const half = Math.tan(THREE.MathUtils.degToRad(this.fov) / 2);
        if (Math.abs(theta) > 0.96) this.clearViewOffset();
        else this.setViewOffset(W, H, 0, (-H * Math.tan(theta)) / half, W, H);
      } else {
        this.lookAt(tgt[0], tgt[1], tgt[2]);
      }
    }
    return orig.call(this, force);
  };
}
