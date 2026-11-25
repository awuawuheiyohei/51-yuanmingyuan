#!/usr/bin/env bash
# 全园白模多视图批量出图
#
#   scripts/shoot-white-scenes.sh <输出目录> [景名...]
#
# 每景一张联表 PNG（等轴测 / 正视(南) / 右视(东) / 俯视 四视图），
# 供人眼过一遍几何。
#
# ⚠ 白模走**真实构建路径**（buildLayout）⇒ 与运行时逐三角面一致。
# ⚠ vite 必须已启动（npm run dev）。
set -e

OUT="${1:-/tmp/white-scenes}"
shift || true
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

mkdir -p "$OUT"

# 景名列表：不给就全园
if [ $# -gt 0 ]; then
  SCENES=("$@")
else
  cd "$ROOT"
  SCENES=()
  while IFS= read -r n; do SCENES+=("$n"); done < <(node -e "
    import('./src/scene/scenes-program.js').then(m=>{
      console.log(Object.keys(m.SCENE_PROGRAM).join('\n'));
    });
  ")
fi

echo "出图 ${#SCENES[@]} 景 → $OUT"

i=0
for NAME in "${SCENES[@]}"; do
  i=$((i+1))
  # 中文景名必须用脚本编码（手写百分号编码会解成另一个字）
  Q=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$NAME")
  SAFE=$(printf '%s' "$NAME" | tr -d '/ \\')
  FILE="$OUT/${SAFE}.png"
  rm -f "$FILE"
  "$CHROME" --headless=new --use-angle=metal --enable-gpu --hide-scrollbars \
    --window-size=1900,1000 --virtual-time-budget=60000 \
    --enable-logging=stderr --v=0 --screenshot="$FILE" \
    "http://127.0.0.1:5180/scripts/white.html?scene=$Q&cell=460" 2>/dev/null
  printf '  [%2d/%2d] %s  ' "$i" "${#SCENES[@]}" "$NAME"
  if [ -s "$FILE" ]; then echo "ok ($(du -h "$FILE" | cut -f1))"; else echo "失败"; fi
done

echo "完成 → $OUT"
