#!/usr/bin/env bash
# 全园各景按 **真 1.70m 人眼高度** 逐景出图（相机修正后的视觉验收基线）
#
# ⚠ 景名是中文 ⇒ URL 里**必须**用 python3 的 urllib.parse.quote 生成
#   （手写百分号编码错过一次：「晏」写成「安」⇒ 静默拍到别的景）。
#
# ⚠⚠ **只拍"有建筑"的景**：`scene.json` 的锚点里有 6 个**空锚点**
#   （福海/水流云在是自然景点；紫碧山房/含卫城/思永斋/涵月楼这 4 个四十景
#   **目前没有建筑实现**）⇒ 拍它们只会得到一张空草地，那不是"构图失败"。
#   ⇒ 脚本把空锚点**单独列出来**，不混进验收清单。
#
# ⚠ macOS 自带的是 **bash 3.2** ⇒ 没有 `mapfile`/`readarray`
#   ⇒ 用 while-read 逐行处理（POSIX 兼容）。
#
# 用法： scripts/shoot-all-scenes.sh [输出目录]
set -u
cd "$(dirname "$0")/.."
OUT="${1:-/tmp/scene-shots}"
mkdir -p "$OUT"

# ---- 有建筑的景（`SCENE_PROGRAM` 里有程序）+ 空锚点清单 ----
node --input-type=module > "$OUT/.plan.txt" <<'NODE'
import fs from 'node:fs';
const R = process.cwd();
const s = JSON.parse(fs.readFileSync(`${R}/public/scene/scene.json`, 'utf8'));
const { SCENE_PROGRAM } = await import(`${R}/src/scene/scenes-program.js`);
const withB = [], empty = [];
for (const sc of s.scenes) {
  if (sc.western) continue;
  (SCENE_PROGRAM[sc.name] ? withB : empty).push(sc.name);
}
console.log(`#WITH\t${withB.join('\t')}`);
console.log(`#EMPTY\t${empty.join('\t')}`);
NODE

WITH=$(grep '^#WITH' "$OUT/.plan.txt" | cut -f2- | tr '\t' '\n')
EMPTY=$(grep '^#EMPTY' "$OUT/.plan.txt" | cut -f2- | tr '\t' '\n')

echo "有建筑 $(printf '%s\n' "$WITH" | grep -c .) 景 → $OUT"
echo "空锚点（无建筑、不拍）：$(printf '%s ' $EMPTY)"

while IFS= read -r n; do
  [ -z "$n" ] && continue
  enc=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$n")
  safe=$(python3 -c "import sys;print(sys.argv[1].replace('/','_'))" "$n")
  # **两个距离都拍**：AGENTS 的验收规则是「13 m 看构造、30 m 看整体」
  #   ⇒ d=14 拍构造细节（斗栱/棂心/匾额/栏板），d=45 拍整体。
  ./scripts/shot.sh "$OUT/$safe.png" "view=close&name=$enc&d=45" >/dev/null 2>&1
  ./scripts/shot.sh "$OUT/${safe}__近14m.png" "view=close&name=$enc&d=14" >/dev/null 2>&1
  echo "  ✔ $n"
done <<< "$WITH"

rm -f "$OUT/.plan.txt"
echo "完成：$OUT"
