#!/usr/bin/env node
/**
 * **全园屋面覆盖检测**（向上打射线，逐点检查屋面是否连续封闭）
 * ============================================================
 *
 * ## 为什么要有这个
 *
 * 现有的 `check-roof-coverage.mjs` 只测了 **3 个硬编码 case**
 * （九洲清晏主殿 / 奉三无私殿 / 圆明园殿）⇒
 * **其余 39 景、以及所有配殿/楼/轩/亭的屋面从未被测过**。
 *
 * 实测：歇山/悬山的山花两侧会**破开大洞**，直接看见屋架（人字梁）。
 * 肉眼只能猜"是屋面没生成还是山花没封"，而**射线检测能一次说清**：
 * 哪个 (x,z) 位置上方没有屋面。
 *
 * ## 判据
 *
 * 对屋面覆盖范围内的采样点，沿 +Y 打射线：
 *   - `|x| ≤ xh` 且 `|z| ≤ zBreak`（上部悬山段）→ 应命中 **tile**（屋面）
 *   - `|x| > xh` 且 `|z| ≤ zBreak`（山面 / 山花区）→ 应命中 **shanhua**（山花板）或 **wall**（山墙）
 *   - 其余（庑殿段）→ 应命中 **tile**
 *
 * ⚠ 判据必须命中 **`tile`**，不能拿 **`board`（望板）**顶替 ——
 *   望板是屋面**下方 7.5cm 的一块 clone**，它有同样的洞。
 *   只判 board ⇒ "屋面缺瓦只剩望板"永远测不出来（AGENTS.md §4.1.5 的原话）。
 *
 * ## 用法
 *
 *   node scripts/check-roof-coverage-all.mjs [--scene=景名] [--verbose]
 *
 * 退出码：0 = 全过；1 = 有破洞。
 */
import * as THREE from 'three';
import { buildRoof } from '../src/scene/buildings/parts/roof.js';
import { deriveDimensions } from '../src/scene/buildings/modular.js';
import { defaultForm } from '../src/scene/buildings/index.js';
import { SCENE_PROGRAM } from '../src/scene/scenes-program.js';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);
const VERBOSE = !!args.verbose;

/** 采样网格（米） */
const STEP = 0.45;

const problems = [];
const sceneNames = args.scene
  ? String(args.scene).split(',')
  : Object.keys(SCENE_PROGRAM);

console.log(`全园屋面覆盖检测 · ${sceneNames.length} 景\n`);

const raycaster = new THREE.Raycaster();
raycaster.firstHitOnly = true;

for (const sceneName of sceneNames) {
  const prog = SCENE_PROGRAM[sceneName];
  if (!prog) continue;
  const m = prog.main;

  const list = [
    {
      label: '主殿', mian: m.mian, jin: m.jin, rank: prog.rank, roof: m.roof,
      platform: m.platform, eave: m.eave, doubleEave: !!m.doubleEave,
    },
  ];
  for (const a of prog.aux || []) {
    const af = defaultForm(a.rank);
    list.push({
      label: a.name || `配殿(${a.rank})`,
      mian: a.mian ?? af.mian, jin: a.jin ?? af.jin, rank: a.rank, roof: af.roof,
      platform: a.rank === 'pavilion' || a.rank === 'corridor' ? 'none' : 'simple',
      eave: a.eave, doubleEave: false,
    });
  }

  const sceneIssues = [];
  for (const b of list) {
    const D = deriveDimensions({
      mian: b.mian, jin: b.jin, rank: b.rank, platform: b.platform, roof: b.roof,
    });
    const rise = Math.max(1.6, D.width * 0.26);
    const lowerRise = b.doubleEave ? Math.max(0.9, rise * 0.3) : 0;

    const res = buildRoof({
      width: D.width,
      depth: D.depth,
      eaveY: D.eaveY,
      platformH: D.platformH,
      roof: b.roof,
      caihua: 'xuanzi',
      tile: 'hui',
      columnColor: '#8f2820',
      wallType: 'red',
      rise,
      overhang: 1.42,
      hipRunX: D.width * 0.26,
      mian: b.mian,
      jin: b.jin,
      wallTint: () => 1,
      doubleEave: !!b.doubleEave,
      lowerRise,
    });

    const { Wx, Wz, xh, zBreak } = res.meta;

    // 每桶合成一个 mesh 便于射线（命名保留桶键）
    const meshes = [];
    for (const [key, list2] of res.geoms) {
      for (const g of list2) {
        if (!g || !g.attributes || !g.attributes.position) continue;
        const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
        mesh.name = key;
        mesh.updateMatrixWorld(true);
        meshes.push(mesh);
      }
    }

    // 采样范围：屋面投影内
    let holes = 0;
    let samples = 0;
    const holePts = [];
    for (let x = -Wx + STEP; x <= Wx - STEP; x += STEP) {
      for (let z = -Wz + STEP; z <= Wz - STEP; z += STEP) {
        samples++;
        const origin = new THREE.Vector3(x, 200, z);
        const dir = new THREE.Vector3(0, -1, 0);
        raycaster.set(origin, dir);
        const hits = raycaster.intersectObjects(meshes, false);
        if (!hits.length) {
          holes++;
          if (holePts.length < 5) holePts.push([x, z]);
          continue;
        }
        const hitName = hits[0].object.name;
        const isGable = Math.abs(x) > xh && Math.abs(z) <= zBreak;
        // 期望：山花区命中 shanhua/wall；其余命中 tile
        /**
         * ⚠ 正脊（`ridge`）是**合法的屋面覆盖** —— 它就骑在中轴上，
         *   采样网格必然打中它 ⇒ 不能只认 `tile`。
         *   同理 `finial`（宝顶）也在脊上。
         *   真正要抓的是「命中 board（望板）或什么都没命中」——
         *   那是屋面缺了、只剩下面那块望板。
         */
        /**
         * ⚠⚠ **山花区不能要求命中 shanhua**：
         *   歇山的山花是**竖板**，它**上方还有坡面**（悬山段）⇒
         *   从上往下打射线**先打到坡面（tile）**，根本碰不到山花。
         *   实测：x=−20.5（xh=19.5 之外）命中 tile 是**正常**的。
         *
         * ⇒ 判据：只要命中**任何屋面构件**（tile / shanhua / wall / ridge / finial）
         *   就算覆盖；**命中 board（望板）或无命中**才是破洞。
         */
        const ok =
          hitName === 'tile' ||
          hitName === 'shanhua' ||
          hitName === 'wall' ||
          hitName === 'ridge' ||
          hitName === 'finial';
        if (!ok) {
          holes++;
          if (holePts.length < 5) holePts.push([x, z, hitName]);
        }
      }
    }

    if (holes) {
      const msg =
        `【屋面破洞】${b.label}（${b.roof}，面阔 ${D.width.toFixed(1)}）` +
        `屋面有 ${holes}/${samples} 个采样点没被正确覆盖：` +
        holePts.map((p) => `(x=${p[0].toFixed(1)}, z=${p[1].toFixed(1)}${p[2] ? ` 命中 ${p[2]}` : ' 无命中'})`).join(' ');
      sceneIssues.push(msg);
      problems.push({ scene: sceneName, msg });
    } else if (VERBOSE) {
      console.log(`    ${b.label}: ✓ ${samples} 个采样点全覆盖`);
    }
  }

  const mark = sceneIssues.length ? '✗' : '✓';
  console.log(`  ${mark} ${sceneName}${sceneIssues.length ? `  （${sceneIssues.length} 项）` : ''}`);
  for (const msg of sceneIssues) console.log(`      ${msg}`);
}

console.log('\n────────────────────────────');
if (!problems.length) {
  console.log('✓ 全园屋面连续封闭，无破洞');
  process.exit(0);
}
console.log(`✗ 发现 ${problems.length} 项屋面破洞`);
process.exit(1);
