/**
 * 按分片补取 OSM 要素（用于扩大范围时补数据，不覆盖已有层）
 *
 * 用法：node scripts/fetch-osm-tiles.mjs buildings <s> <w> <n> <e>
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = resolve(ROOT, 'data/raw');

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.jp/api/interpreter',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass(query) {
  let last;
  for (let i = 0; i < 6; i++) {
    const ep = ENDPOINTS[i % ENDPOINTS.length];
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 110_000);
      const res = await fetch(ep, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'yuanmingyuan-3d/0.1 (local research build)',
        },
        body: new URLSearchParams({ data: `[out:json][timeout:100];${query}out geom;` }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (text.trimStart().startsWith('#')) throw new Error(text.split('\n')[0]);
      return JSON.parse(text);
    } catch (e) {
      last = e;
      console.warn(`  ! ${ep.split('/')[2]} 失败(${e.message})`);
      await sleep(2500 * 2 ** (i % 3));
    }
  }
  throw new Error(`全部端点失败: ${last?.message}`);
}

async function main() {
  const layer = process.argv[2] || 'buildings';
  const S = parseFloat(process.argv[3]);
  const W = parseFloat(process.argv[4]);
  const N = parseFloat(process.argv[5]);
  const E = parseFloat(process.argv[6]);
  const nx = parseInt(process.env.TILES_X || '3');
  const ny = parseInt(process.env.TILES_Y || '3');

  await mkdir(RAW, { recursive: true });
  const outFile = resolve(RAW, `osm-${layer}.json`);
  const existing = existsSync(outFile)
    ? JSON.parse(await readFile(outFile, 'utf8'))
    : { elements: [] };
  const seen = new Set(
    existing.elements.map((e) => `${e.type}/${e.id}`)
  );
  console.log(`已有 ${seen.size} 个要素，开始补取 ${nx}×${ny} 片`);

  const dw = (E - W) / nx;
  const dh = (N - S) / ny;
  let added = 0;

  for (let iy = 0; iy < ny; iy++) {
    for (let ix = 0; ix < nx; ix++) {
      const b = `${(S + iy * dh).toFixed(4)},${(W + ix * dw).toFixed(4)},${(
        S + (iy + 1) * dh
      ).toFixed(4)},${(W + (ix + 1) * dw).toFixed(4)}`;
      const q =
        layer === 'buildings'
          ? `(way["building"](${b});relation["building"](${b}););`
          : `(way["natural"="water"](${b});relation["natural"="water"](${b});way["waterway"](${b}););`;
      process.stdout.write(`  片 ${iy}-${ix} ${b} … `);
      try {
        const d = await overpass(q);
        let n = 0;
        for (const e of d.elements || []) {
          const k = `${e.type}/${e.id}`;
          if (seen.has(k)) continue;
          seen.add(k);
          existing.elements.push(e);
          n++;
        }
        added += n;
        console.log(`${n} 新增`);
      } catch (e) {
        console.log(`失败 ${e.message}`);
      }
      await sleep(1500);
    }
  }

  await writeFile(outFile, JSON.stringify(existing));
  console.log(`✓ 补入 ${added} 个要素，共 ${existing.elements.length} → data/raw/osm-${layer}.json`);
}

main().catch((e) => {
  console.error('失败:', e.message);
  process.exit(1);
});
