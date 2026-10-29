/**
 * 拉取 AWS Terrain Tiles (Terrarium 编码) 的高程瓦片，缓存到 data/raw/dem/
 *
 * 瓦片规格：
 *   https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png
 *   高度解码: h = (R*256 + G + B/256) - 32768   (单位: 米)
 * 圆明园位于北京西北平原，地势整体平坦；园内"山"是人工假山，
 * 不在真实 DEM 里，需在场景构建阶段另行程序化生成。
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BBOX } from './config.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'data/raw/dem');

const ZOOM = 14;

const lon2tileX = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const lat2tileY = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z
  );
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchTile(z, x, y) {
  const file = resolve(OUT, `${z}-${x}-${y}.png`);
  if (existsSync(file) && !process.env.FORCE_REFETCH) return 'cached';
  const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30_000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await writeFile(file, Buffer.from(await res.arrayBuffer()));
      return 'ok';
    } catch (err) {
      if (attempt === 3) throw err;
      await sleep(1500 * 2 ** attempt);
    }
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const x0 = lon2tileX(BBOX.w, ZOOM);
  const x1 = lon2tileX(BBOX.e, ZOOM);
  const y0 = lat2tileY(BBOX.n, ZOOM);
  const y1 = lat2tileY(BBOX.s, ZOOM);

  const jobs = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) jobs.push([x, y]);
  console.log(`· DEM z=${ZOOM} tiles: x ${x0}..${x1}, y ${y0}..${y1} (共 ${jobs.length} 片)`);

  let ok = 0;
  for (const [x, y] of jobs) {
    const r = await fetchTile(ZOOM, x, y);
    if (r === 'ok') ok++;
    process.stdout.write(`\r  已取 ${ok}/${jobs.length}`);
  }
  console.log('\n✓ DEM 瓦片就绪');
}

main().catch((e) => {
  console.error('失败:', e.message);
  process.exit(1);
});
