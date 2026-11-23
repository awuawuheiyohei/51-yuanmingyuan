#!/usr/bin/env bash
# 全园各景按 **真 1.70m 人眼高度** 逐景出图（相机修正后的视觉验收基线）
#
# ⚠ 景名是中文 ⇒ URL 里**必须**用 python3 的 urllib.parse.quote 生成
#   （手写百分号编码错过一次：「晏」写成「安」⇒ 静默拍到别的景）。
#
# 用法： scripts/shoot-all-scenes.sh [输出目录]
set -u
cd "$(dirname "$0")/.."
OUT="${1:-/tmp/scene-shots}"
mkdir -p "$OUT"

# ⚠ macOS 自带的是 **bash 3.2** ⇒ 没有 `mapfile`/`readarray`
# ⇒ 用 while-read 逐行处理（POSIX 兼容）。
node -e "
const s=require('./public/scene/scene.json');
for(const sc of s.scenes) if(!sc.western) console.log(sc.name);
" > "$OUT/.names.txt"
TOTAL=$(wc -l < "$OUT/.names.txt" | tr -d ' ')
echo "共 $TOTAL 景 → $OUT"

while IFS= read -r n; do
  [ -z "$n" ] && continue
  enc=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$n")
  safe=$(python3 -c "import sys;print(sys.argv[1].replace('/','_'))" "$n")
  ./scripts/shot.sh "$OUT/$safe.png" "view=close&name=$enc&d=45" >/dev/null 2>&1
  echo "  ✔ $n"
done < "$OUT/.names.txt"
rm -f "$OUT/.names.txt"
echo "完成：$OUT"
