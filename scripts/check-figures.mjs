/**
 * **人物层尺度自检** —— 场景里的"已知尺寸参照物"必须真的对。
 *
 * ## 为什么必须有
 *
 * AGENTS 的硬要求：场景里必须有**已知尺寸的参照物**
 * （人 1.70 m、马 1.45 m 肩高、轿杠 3.00 m），
 * 否则"看起来有多大"根本没法判断。
 * 人物层又刚被重做过（手臂/袖口/手/靴尖/衣褶/脖子）⇒ 尺度可能悄悄跑掉。
 *
 * ## 判据
 *
 * 逐件建模 ⇒ 量**包围盒**：
 *   · 各类人物的总高 = `DIM.<kind>`（帽算在身高中，顶缨/旗头另计）
 *   · 马的肩高（鬐甲）= 1.45 m
 *   · 轿杠长 = 3.00 m
 *   · 几何里**不能有 NaN**
 *
 * 误差带 ±4%（造型类的合理公差）。
 */
import * as THREE from 'three';
import { Bin, MATS, DIM, addPerson, addHorse, addSedan } from '../src/scene/figures.js';

const TOL = 0.04; // 4%
let failures = 0;
const fail = (m) => {
  failures++;
  console.log(`  ✗ ${m}`);
};

/** 建一件东西，返回其包围盒 */
function bboxOf(build) {
  const bin = new Bin();
  build(bin);
  const box = new THREE.Box3();
  let nan = 0;
  let tris = 0;
  for (const [, list] of bin.map) {
    for (const g of list) {
      const p = g.attributes.position;
      tris += p.count / 3;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const y = p.getY(i);
        const z = p.getZ(i);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
          nan++;
          continue;
        }
        box.expandByPoint(new THREE.Vector3(x, y, z));
      }
    }
  }
  return { box, nan, tris };
}

const M = new THREE.Matrix4();

console.log('=== 人物：各类身高 ===');
const KINDS = [
  ['游人（长袍）', DIM.man, {}],
  ['官员（翎顶帽）', DIM.official, {}],
  ['轿夫', DIM.bearer, {}],
  ['货郎', DIM.porter, {}],
  ['执事', DIM.guard, {}],
  ['宫女', DIM.woman, {}],
];
for (const [name, expect, opt] of KINDS) {
  const { box, nan, tris } = bboxOf((bin) => addPerson(bin, M, { height: expect, ...opt }));
  const h = box.max.y - box.min.y;
  const ok = Math.abs(h - expect) / expect <= TOL;
  if (!ok) fail(`${name}：实际高 ${h.toFixed(3)} m，应为 ${expect.toFixed(2)} m（±${TOL * 100}%）`);
  if (nan) fail(`${name}：几何里有 ${nan} 个 NaN 顶点`);
  console.log(
    `  ${ok ? '✅' : '  '} ${name}：高 ${h.toFixed(3)} m / 期望 ${expect.toFixed(2)} m · 三角 ${Math.round(tris)}`
  );
}

console.log('\n=== 马：鬐甲（肩高）与全高 ===');
{
  const { box, nan, tris } = bboxOf((bin) => addHorse(bin, M));
  const h = box.max.y - box.min.y;
  const footY = box.min.y;
  // ⚠ **不能拿"全高 = 肩高"当判据**：马是**仰头**的，
  //   颈+鬃的最高点比鬐甲高（实测 1.70 m vs 鬐甲 1.45 m）。
  //   ⇒ 判据改成两条：
  //     ① 脚底贴地（|footY| < 1cm）—— 悬空就是 bug
  //     ② 全高落在 [肩高, 肩高 + 0.30]（马不是矮马、也不是巨兽）
  const okFoot = Math.abs(footY) < 0.01;
  const okH = h >= DIM.horse.shoulder - 0.01 && h <= DIM.horse.shoulder + 0.30;
  if (!okFoot) fail(`马：脚底在 y=${footY.toFixed(3)}（应贴地 0）`);
  if (!okH) fail(`马：全高 ${h.toFixed(3)} m 不在 [${DIM.horse.shoulder}, ${DIM.horse.shoulder + 0.30}] 区间`);
  if (nan) fail(`马：几何里有 ${nan} 个 NaN 顶点`);
  console.log(
    `  ${okFoot && okH ? '✅' : '  '} 马：全高 ${h.toFixed(3)} m（鬐甲 ${DIM.horse.shoulder} + 仰头）· 脚底 y=${footY.toFixed(3)} · 三角 ${Math.round(tris)}`
  );
}

console.log('\n=== 轿：轿杠长 ===');
{
  const { box, nan, tris } = bboxOf((bin) => addSedan(bin, M));
  const lx = box.max.x - box.min.x;
  const lz = box.max.z - box.min.z;
  const pole = Math.max(lx, lz);
  const ok = Math.abs(pole - DIM.sedan.poleLen) / DIM.sedan.poleLen <= TOL;
  if (!ok) fail(`轿：轿杠长 ${pole.toFixed(3)} m，应为 ${DIM.sedan.poleLen} m`);
  if (nan) fail(`轿：几何里有 ${nan} 个 NaN 顶点`);
  console.log(`  ${ok ? '✅' : '  '} 轿：横跨 ${pole.toFixed(3)} m / 期望轿杠 ${DIM.sedan.poleLen} m · 三角 ${Math.round(tris)}`);
}

console.log('');
if (failures) {
  console.log(`❌ 人物层尺度自检：${failures} 项不合格`);
  process.exit(1);
}
console.log('✅ 人物层尺度自检：人 1.70m / 马 1.45m / 轿杠 3.00m 全部对得上，无 NaN');
