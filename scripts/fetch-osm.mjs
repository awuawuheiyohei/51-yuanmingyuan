/**
 * 从 Overpass 分片拉取圆明园范围内的 OSM 要素，缓存到 data/raw/osm-*.json
 *
 * 策略：按要素类型拆成多个小查询，避免大 bbox 触发网关超时；
 * 每片带指数退避重试；结果落到 data/raw 后不再联网（可离线重建场景）。
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BBOX_STR } from './config.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = resolve(ROOT, 'data/raw');

const BBOX = { s: 39.994, w: 116.278, n: 40.017, e: 116.315 };

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

/** 每片查询：要素类型 → Overpass 过滤语句 */
const QUERIES = {
  buildings: `(
    way["building"](${BBOX_STR});
    relation["building"](${BBOX_STR});
  );`,
  water: `(
    way["natural"="water"](${BBOX_STR});
    relation["natural"="water"](${BBOX_STR});
    way["waterway"](${BBOX_STR});
    relation["waterway"](${BBOX_STR});
    way["landuse"="reservoir"](${BBOX_STR});
  );`,
  // 园界：按名精确匹配圆明园，响应体小得多
  park: `(
    way["leisure"="park"]["name"~"圆明园"](${BBOX_STR});
    relation["leisure"="park"]["name"~"圆明园"](${BBOX_STR});
    relation["boundary"="protected_area"]["name"~"圆明园"](${BBOX_STR});
    way["boundary"="protected_area"]["name"~"圆明园"](${BBOX_STR});
  );`,
  // 只取园内步道/游廊走向与林地，剔除机动车道以免响应体过大
  paths: `(
    way["highway"~"^(path|footway|track|pedestrian|steps)$"](${BBOX_STR});
    way["barrier"="wall"](${BBOX_STR});
    way["landuse"~"^(forest|grass|meadow|farmland|cemetery|recreation_ground)$"](${BBOX_STR});
    relation["landuse"~"^(forest|grass|meadow|farmland|cemetery|recreation_ground)$"](${BBOX_STR});
  );`,
  // 西洋楼景区：OSM 未给建筑轮廓，这里只取景点与地名锚点
  west: `(
    nwr["name"~"大水法|远瀛观|海晏堂|谐奇趣|方外观|观水法|线法山|黄花园|西洋楼|长春园|绮春园|如意洲|小有天|狮子林|玲珑馆|春泽斋|正觉寺|含经堂|十二生肖|兽首"](39.998,116.266,40.017,116.293);
  );`,
  poi: `(
    nwr["tourism"](${BBOX_STR});
    nwr["historic"~"^(memorial|monument|castle|ruins)$"](${BBOX_STR});
    nwr["name"~"景|殿|阁|楼|轩|馆|斋|堂|洲|海|园|宫|门|桥|榭|庵|寺|塔|楼|阁"](${BBOX_STR});
  );`,
};

/** 每层用不同的输出方式：几何重的用 out geom，轻的用 out center 减小响应体 */
const OUTPUT = {
  buildings: 'out geom;',
  water: 'out geom;',
  park: 'out geom;',
  paths: 'out geom;',
  poi: 'out center tags;',
  west: 'out center tags;',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass(query, output = 'out geom;') {
  let lastErr;
  for (let attempt = 0; attempt < 6; attempt++) {
    const endpoint = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 120_000);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'yuanmingyuan-3d/0.1 (local research build)',
        },
        body: new URLSearchParams({ data: `[out:json][timeout:110];${query}${output}` }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (text.trimStart().startsWith('#')) throw new Error(text.split('\n')[0]);
      return JSON.parse(text);
    } catch (err) {
      lastErr = err;
      const wait = 2000 * 2 ** attempt;
      console.warn(`  ! ${endpoint.split('/')[2]} 失败(${err.message})，${wait / 1000}s 后重试`);
      await sleep(wait);
    }
  }
  throw new Error(`Overpass 全部端点失败: ${lastErr?.message}`);
}

async function main() {
  await mkdir(RAW, { recursive: true });
  const only = process.argv[2];

  for (const [key, q] of Object.entries(QUERIES)) {
    if (only && only !== key) continue;
    const out = resolve(RAW, `osm-${key}.json`);
    if (existsSync(out) && !process.env.FORCE_REFETCH) {
      console.log(`· ${key}: 已缓存，跳过`);
      continue;
    }
    console.log(`· 拉取 ${key} ...`);
    const data = await overpass(q, OUTPUT[key]);
    const n = data.elements?.length ?? 0;
    await writeFile(out, JSON.stringify(data));
    console.log(`  ✓ ${key}: ${n} 个要素 → data/raw/osm-${key}.json`);
    await sleep(1200); // 礼貌限速
  }
}

main().catch((e) => {
  console.error('失败:', e.message);
  process.exit(1);
});
