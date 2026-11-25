#!/usr/bin/env node
/**
 * **白模联表拼图** —— 把多景白模 PNG 拼成一张大图，便于一次性人眼过一遍。
 *
 *   node scripts/make-white-sheet.mjs <输入目录> <输出.png> [每行几张] [起始] [结束]
 *
 * 只拼**每张的第一格（等轴测）**——那是信息量最大的一格，
 * 其余三格（正/右/俯）留给单景细查时用 `?views=` 出。
 */
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const [, , inDir, outFile, perRowArg, fromArg, toArg] = process.argv;
if (!inDir || !outFile) {
  console.error('用法: node scripts/make-white-sheet.mjs <输入目录> <输出.png> [每行几张] [起始] [结束]');
  process.exit(1);
}
const perRow = Number(perRowArg || 3);
const from = Number(fromArg || 0);
const to = Number(toArg || 999);

const files = fs
  .readdirSync(inDir)
  .filter((f) => f.endsWith('.png'))
  .sort();

const picked = files.slice(from, to === 999 ? files.length : to);
if (!picked.length) {
  console.error('没有可拼的 PNG');
  process.exit(1);
}

/**
 * 每张只取左上角的「等轴测」格。
 *
 * ⚠ 源图布局（`white.html`）：一行 4 个视图，每格 `cell` 宽，
 *   上面是**固定 44px 高**的标题栏（white.html 里 `#bar` 的 height）。
 *   ⇒ 第一格 = (0, 44) 起，尺寸 cell×cell。
 *   ⚠ 改 `white.html` 的 `#bar` 高度时必须同步改这里的 BAR_H。
 */
const BAR_H = 44;
const CELL = 460; // white.html 的默认 cell

const first = [];
for (const f of picked) {
  const png = PNG.sync.read(fs.readFileSync(path.join(inDir, f)));
  const cw = Math.min(CELL, png.width);
  const ch = Math.min(CELL, png.height - BAR_H);
  const out = new PNG({ width: cw, height: ch });
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const si = ((BAR_H + y) * png.width + x) * 4;
      const di = (y * cw + x) * 4;
      out.data[di] = png.data[si];
      out.data[di + 1] = png.data[si + 1];
      out.data[di + 2] = png.data[si + 2];
      out.data[di + 3] = png.data[si + 3];
    }
  }
  first.push({ name: f.replace(/\.png$/, ''), png: out });
}
if (!first.length) {
  console.error('没有可拼的格子');
  process.exit(1);
}

const cw = first[0].png.width;
const ch = first[0].png.height;
const cols = perRow;
const rows = Math.ceil(first.length / cols);
const sheet = new PNG({ width: cw * cols, height: ch * rows });
sheet.data.fill(16);

first.forEach((it, i) => {
  const ox = (i % cols) * cw;
  const oy = Math.floor(i / cols) * ch;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const si = (y * cw + x) * 4;
      const di = ((oy + y) * sheet.width + ox + x) * 4;
      sheet.data[di] = it.png.data[si];
      sheet.data[di + 1] = it.png.data[si + 1];
      sheet.data[di + 2] = it.png.data[si + 2];
      sheet.data[di + 3] = 255;
    }
  }
});

fs.writeFileSync(outFile, PNG.sync.write(sheet));
console.log(`${outFile}  ${sheet.width}×${sheet.height}  ${first.length} 景（每行 ${cols}）`);
console.log('顺序: ' + first.map((f) => f.name).join(' / '));
