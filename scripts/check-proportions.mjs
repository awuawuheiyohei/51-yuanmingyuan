/**
 * 建筑比例分析器（Node 端，直接读几何，不用开浏览器）
 * ============================
 *
 * 用途：验收"等比例真实"。
 * 肉眼看比例要靠经验；这里把构件的实际尺寸**量出来**，
 * 与清式营造则例的量级对照，一眼看出哪座建筑比例失真。
 *
 * ## 查什么
 *   1. 斗口是否落在**材等制度**（十一等，半寸刻度）上
 *   2. 柱高 / 柱径（大式恒为 10：60 斗口 ÷ 6 斗口）
 *   3. 柱高 / 明间宽（攒当法的直接后果）
 *   4. 檐高 / 面阔（**按开间数分档**）
 *   5. 台基高 / 柱高
 *   6. 进深 / 面阔
 *   7. 明间 > 次间 > 尽间（攒当递减）
 *   8. 人 1.7m 参照下的"几层楼"感（檐高 / 1.7）
 *
 * 另外跑一组**回归测试**：正大光明殿的实测数据（见
 * `data/research/architecture-notes.md`），验证推导链是否闭合。
 *
 * 用法：node scripts/check-proportions.mjs
 */
import * as THREE from 'three';
import { deriveDimensions, checkDimensions, describeDimensions, DOUKOU_GRADES, CUN } from '../src/scene/buildings/modular.js';
import { SCENE_PROGRAM } from '../src/scene/scenes-program.js';

const rows = [];
let bad = 0;

for (const [name, p] of Object.entries(SCENE_PROGRAM)) {
  const m = p.main;
  if (!m) continue;
  const D = deriveDimensions({
    mian: m.mian,
    jin: m.jin,
    rank: p.rank,
    platform: m.platform,
    roof: m.roof,
  });
  const issues = checkDimensions(D);

  const eavePerWidth = D.eaveY / D.width;
  const colHPerDia = D.colH / D.colDia;
  const colHPerBay = D.colH / D.bayW;

  const flags = [];
  // 小式建筑**本就没有斗栱**（以檐柱径为模数），不能拿斗栱去卡它
  if (D.style === 'dashi') {
    const dgPerDia = D.dougongHeight / D.colDia;
    // 斗栱通高 10 斗口 ÷ 柱径 6 斗口 = 1.67
    if (dgPerDia < 1.4 || dgPerDia > 2.0) flags.push(`斗栱/柱径=${dgPerDia.toFixed(2)}`);
  }
  if (issues.length) flags.push(...issues);

  if (flags.length) bad++;
  rows.push({
    name,
    mian: m.mian,
    jin: m.jin,
    rank: p.rank,
    style: D.style,
    grade: D.grade,
    width: D.width,
    depth: D.depth,
    colH: D.colH,
    colDia: D.colDia,
    eaveY: D.eaveY,
    plat: D.platformH,
    floors: D.eaveY / 1.7,
    flags,
  });
}

const pad = (s, n) => {
  // 中文按 2 个字宽计
  const w = [...s].reduce((a, c) => a + (c.charCodeAt(0) > 255 ? 2 : 1), 0);
  return s + ' '.repeat(Math.max(0, n - w));
};

console.log(
  pad('景名', 14) + pad('间×进', 9) + pad('面阔', 9) + pad('进深', 9) +
  pad('斗口', 9) + pad('柱高', 9) + pad('柱径', 9) + pad('檐高', 9) +
  pad('台基', 9) + pad('≈层数', 9) + '问题'
);
console.log('-'.repeat(126));
for (const r of rows) {
  const dk = r.style === 'dashi' ? `${(r.grade).toFixed(1)}等` : '小式';
  console.log(
    pad(r.name, 14) +
      pad(`${r.mian}×${r.jin}`, 9) +
      pad(`${r.width.toFixed(1)}m`, 9) +
      pad(`${r.depth.toFixed(1)}m`, 9) +
      pad(dk, 9) +
      pad(`${r.colH.toFixed(1)}m`, 9) +
      pad(`${r.colDia.toFixed(2)}m`, 9) +
      pad(`${r.eaveY.toFixed(1)}m`, 9) +
      pad(`${r.plat.toFixed(2)}m`, 9) +
      pad(`${r.floors.toFixed(1)}`, 9) +
      (r.flags.length ? r.flags.join('; ') : '✓')
  );
}
console.log(
  `\n共 ${rows.length} 景，其中 ${bad} 景有比例问题；` +
    `⚠ 层数 = 檐高 / 人高 1.7m`
);

/* ================================================================== *
 * 回归测试：正大光明殿实测数据
 * ================================================================== *
 * 圆明园正大光明殿是本项目唯一有**实测尺寸**的建筑。
 * 若推导链闭合，算出来的尺寸应与实测逐项吻合。
 *
 * 实测（清营造尺，1 尺 = 0.32m）：
 *   明间面阔  一丈六尺五寸 = 16.5 尺
 *   东西次间  一丈五尺五寸 = 15.5 尺
 *   再次尽间  一丈三尺五寸 = 13.5 尺
 *   檐柱高    一丈五尺     = 15 尺
 *   柱径      一尺五寸     = 1.5 尺
 *   斗口      二寸五分     = 2.5 寸
 *   台基      高出周围地面约四英尺 = 1.2 m
 */
console.log('\n' + '='.repeat(126));
console.log('回归测试：正大光明殿（圆明园唯一有实测尺寸的建筑）');
console.log('='.repeat(126));

const D = deriveDimensions({
  mian: 7,
  jin: 5,
  rank: 'hall',
  platform: 'xumizuo',
  roof: 'juanpengxieshan',
});

const CHI = 0.32;

/**
 * 按**开间类型**取该开间的面阔。
 * ⚠ 不能用下标：柱网是从西到东排的，明间在**正中**，
 *   下标 0 是尽间、末位也是尽间。
 */
const bayOf = (D, kind) => {
  const i = D.bays.findIndex((b) => b.kind === kind);
  return i < 0 ? null : D.bayWidths[i];
};

const cases = [
  ['斗口', D.doukou, 2.5 * CUN, 0.005],
  ['柱径', D.colDia, 1.5 * CHI, 0.01],
  ['檐柱高', D.colH, 15 * CHI, 0.02],
  ['通面阔', D.width, (16.5 + 2 * 15.5 + 4 * 13.5) * CHI, 0.05],
  ['台基高', D.platformH, 1.2, 0.05],
  ['明间面阔', bayOf(D, 'ming'), 16.5 * CHI, 0.02],
  ['次间面阔', bayOf(D, 'ci'), 15.5 * CHI, 0.02],
  ['外围稍间面阔', bayOf(D, 'shao'), 13.5 * CHI, 0.02],
];

let regressFail = 0;
for (const [label, got, want, tol] of cases) {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) regressFail++;
  console.log(
    `  ${ok ? '✓' : '✗'} ${pad(label, 12)} 推导 ${pad(got.toFixed(3) + 'm', 12)} ` +
      `实测 ${pad(want.toFixed(3) + 'm', 12)} 差 ${(got - want >= 0 ? '+' : '') + ((got - want) * 1000).toFixed(0)}mm`
  );
}

console.log(`\n  ${describeDimensions(D)}`);
console.log(
  regressFail === 0
    ? '\n  ✅ 推导链闭合：全部实测项吻合（容差内）'
    : `\n  ❌ ${regressFail} 项与实测不符 —— 推导链有断点`
);

process.exitCode = bad === 0 && regressFail === 0 ? 0 : 1;
