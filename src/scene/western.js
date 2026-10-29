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

  /* ------------------------------------------------------------ 谐奇趣 */
  const he = byName.get('谐奇趣');
  const heRot = he ? faceTo(he.x, he.z, anchor.x, anchor.z) : 0;
  if (he) {
    buildHarmonyHall(c, {
      x: he.x,
      y: heightAt(he.x, he.z),
      z: he.z,
      rotY: heRot,
      ground: makeGround(he.x, heightAt(he.x, he.z), he.z, heRot, heightAt),
    });
  }

  /* ------------------------------------------------------------ 方外观 */
  const fw = byName.get('方外观');
  if (fw) {
    const fwRot = faceTo(fw.x, fw.z, anchor.x, anchor.z);
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
    buildXianFaShan(c, {
      x: xf.x,
      y: heightAt(xf.x, xf.z),
      z: xf.z,
      rotY: dwRot,
      ground: makeGround(xf.x, heightAt(xf.x, xf.z), xf.z, dwRot, heightAt),
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
  installWestDebugView(group, anchor, heightAt);

  return group;
}

/* ============================================================ 调试视角 */

/**
 * 西洋楼没有现成的调试视角（`?view=scene|close|garden|top` 都不对着它）。
 * 这里加一个 `?view=west`：只有在明确要求时才挂钩渲染器取相机，
 * 正常浏览时零开销、零副作用。
 *
 *   ?view=west            大水法全景（西南向）
 *   ?view=west2           海晏堂十二生肖（西向）
 *   ?view=west3           远瀛观（南向）
 *   ?view=west4           整片西洋楼（东南向高空）
 *   ?view=west&cam=x,y,z&tgt=x,y,z   自定义机位（局部坐标）
 */
function installWestDebugView(group, anchor, heightAt) {
  if (typeof location === 'undefined') return;
  const params = new URLSearchParams(location.search);
  const view = params.get('view') || '';
  if (!view.startsWith('west')) return;

  // 机位以大水法处的地面高程为基准（该景区在园东北的台地上，高程约 47 m）
  const g = heightAt(anchor.x, anchor.z);
  const presets = {
    west: {
      cam: [anchor.x - 92, g + 26, anchor.z + 56],
      tgt: [anchor.x + 2, g + 7, anchor.z + 2],
    },
    west2: {
      cam: [anchor.x - 150, g + 15, anchor.z + 30],
      tgt: [anchor.x - 46, g + 6, anchor.z + 12],
    },
    west3: {
      cam: [anchor.x - 14, g + 22, anchor.z + 86],
      tgt: [anchor.x - 4, g + 18, anchor.z - 48],
    },
    west4: {
      cam: [anchor.x + 140, g + 74, anchor.z + 160],
      tgt: [anchor.x + 16, g + 10, anchor.z - 8],
    },
  };
  const p = presets[view] || presets.west;
  const camArg = params.get('cam');
  const tgtArg = params.get('tgt');
  const cam = camArg ? camArg.split(',').map(Number) : p.cam;
  const tgt = tgtArg ? tgtArg.split(',').map(Number) : p.tgt;

  const orig = THREE.Object3D.prototype.updateMatrixWorld;
  THREE.Object3D.prototype.updateMatrixWorld = function (force) {
    // 相机没有父节点，渲染器每帧会调 camera.updateMatrixWorld()，
    // 在这里改机位最省事（只在调试视角存在时安装）。
    if (this.isCamera) {
      this.position.set(cam[0], cam[1], cam[2]);
      this.lookAt(tgt[0], tgt[1], tgt[2]);
    }
    return orig.call(this, force);
  };
}
