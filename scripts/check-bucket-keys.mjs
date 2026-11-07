#!/usr/bin/env node
/**
 * **材质桶键自检** —— 桶键必须与 `materialFor` 的 switch **一一对应**。
 *
 * ## 为什么查这个
 *
 * `structure.js` 的 `KEY` 与 `roof.js` 的 `push('xxx', …)` 决定了几何进哪个桶；
 * 桶键再交给 `materials.js` 的 `materialFor(key)` 取材质。
 * **只要有一个桶键对不上**，`materialFor` 就落到 `default` 分支 ⇒
 * 返回 **`0x999999` 的灰板子** ⇒ 画面上多一块惨白的板，
 * 而且**不报任何错**（这才是最难查的）。
 *
 * 实测：`KEY` 里**没有** `board` ⇒ 垫栱板进了名为 `undefined` 的桶
 * ⇒ 檐下出现一条 0x999999 的惨白灰带（`/tmp/R_BDC.png`）。
 *
 * 用法：node scripts/check-bucket-keys.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

/* 1. materialFor 支持的桶键 */
const matSrc = read('src/scene/buildings/materials.js');
const matKeys = new Set(
  [...matSrc.matchAll(/case '([a-zA-Z0-9_]+)':/g)].map((m) => m[1])
);

/* 2. 代码里实际用到的桶键 */
const used = new Map(); // key → 来源
const unusedKeys = new Set();
const add = (key, src) => {
  if (!key) return;
  if (!used.has(key)) used.set(key, new Set());
  used.get(key).add(src);
};

const structSrc = read('src/scene/buildings/parts/structure.js');
const keyBlock = structSrc.match(/const KEY = \{([\s\S]*?)\n\};/);
if (!keyBlock) {
  console.error('  ❌ 没找到 structure.js 里的 KEY 定义');
  process.exit(1);
}
for (const m of keyBlock[1].matchAll(/(\w+):\s*'([a-zA-Z0-9_]+)'/g)) {
  // 只有**真的被引用过**（bucket(geoms, KEY.x)）的键才算"用到"；
  // 声明了但没人用的键只是死条目，不影响渲染。
  const ref = new RegExp(`KEY\\.${m[1]}\\b`).test(structSrc.slice(keyBlock[0].length + keyBlock[0].index));
  if (ref) add(m[2], `KEY.${m[1]}`);
  else unusedKeys.add(m[2]);
}

const roofSrc = read('src/scene/buildings/parts/roof.js');
for (const m of roofSrc.matchAll(/push\('([a-zA-Z0-9_]+)'/g)) {
  add(m[1], 'roof.js');
}
const detailSrc = read('src/scene/buildings/parts/details.js');
for (const m of detailSrc.matchAll(/bucket\([^,]+,\s*'([a-zA-Z0-9_]+)'\)/g)) {
  add(m[1], 'details.js');
}
const layoutSrc = read('src/scene/layout.js');
for (const m of layoutSrc.matchAll(/bucket\([^,]+,\s*'([a-zA-Z0-9_]+)'\)/g)) {
  add(m[1], 'layout.js');
}
const corridorSrc = read('src/scene/corridor.js');
for (const m of corridorSrc.matchAll(/bucket\([^,]+,\s*'([a-zA-Z0-9_]+)'\)/g)) {
  add(m[1], 'corridor.js');
}

/* 3. 比对 */
console.log('材质桶键自检（桶键 ↔ materialFor switch）');
console.log('──────────────────────────────────────────────────────────────────────────────');

let bad = 0;
for (const [key, srcs] of [...used.entries()].sort()) {
  const ok = matKeys.has(key);
  if (!ok) {
    bad++;
    console.log(
      `  ✗ 桶键 "${key}"（${[...srcs].join(', ')}）在 materialFor 里没有对应分支 ` +
        `⇒ 会落到 default ⇒ **0x999999 的灰板子**`
    );
  }
}

const unused = [...matKeys].filter((k) => !used.has(k));
if (unused.length) {
  console.log(`  · materialFor 里有但当前没用到：${unused.join(', ')}`);
}
if (unusedKeys.size) {
  console.log(`  · KEY 里声明但没人引用的死条目：${[...unusedKeys].join(', ')}`);
}

console.log('');
console.log(
  bad
    ? `  ❌ ${bad} 个桶键对不上（几何会变成灰板子）`
    : `  ✅ ${used.size} 个桶键全部对得上`
);
process.exit(bad ? 1 : 0);
