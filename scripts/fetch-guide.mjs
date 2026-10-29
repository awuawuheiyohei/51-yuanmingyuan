/**
 * 拉取圆明园管理处官方《圆明园导览图》原图
 *
 * 这是本项目最权威的位置来源：图上标出全部景区名与规划/现状范围。
 * 配准结果（像素 → 经纬度）已固化在 data/guide-georef.json，
 * 坐标取用见 scripts/build-scene.mjs 的 SCENES 表（source: 'guide'）。
 */
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'data/raw');

const MAP_URL =
  'https://www.yuanmingyuanpark.cn/pw/kdt/202312/W020231230388847385783.jpg';
const PAGE =
  'https://www.yuanmingyuanpark.cn/pw/kdt/202312/t20231230_4634877.html';

async function main() {
  await mkdir(OUT, { recursive: true });
  const file = resolve(OUT, 'yuanmingyuan-guide.jpg');
  if (existsSync(file) && !process.env.FORCE_REFETCH) {
    console.log('· 官方导览图已缓存，跳过');
  } else {
    console.log('· 下载官方导览图 …');
    const res = await fetch(MAP_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120.0', Referer: PAGE },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
  }
  const s = await stat(file);
  console.log(`  ✓ data/raw/yuanmingyuan-guide.jpg (${(s.size / 1e6).toFixed(1)} MB)`);
  console.log('  配准参数见 data/guide-georef.json');
}

main().catch((e) => {
  console.error('失败:', e.message);
  process.exit(1);
});
