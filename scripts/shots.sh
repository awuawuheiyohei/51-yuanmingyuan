#!/usr/bin/env bash
# 重新生成 docs/screenshots 里的验收截图
#
# 用法： bash scripts/shots.sh
# 依赖：dev server 已在 http://127.0.0.1:5180 运行（npm run dev）
set -euo pipefail

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT="docs/screenshots"
mkdir -p "$OUT"

shot() {
  local name="$1" query="$2" size="${3:-1600,900}"
  local tmp="/tmp/shot_$name.png"
  "$CHROME" --headless=new --use-angle=metal --enable-gpu --hide-scrollbars \
    --window-size="$size" --virtual-time-budget=120000 \
    --screenshot="$tmp" "http://127.0.0.1:5180/?$query" 2>/dev/null || true
  # 虚拟时间不够时只会拍到 loading 屏（文件很小），重试
  for i in 1 2 3; do
    if [ -f "$tmp" ] && [ "$(stat -f%z "$tmp")" -gt 400000 ]; then break; fi
    "$CHROME" --headless=new --use-angle=metal --enable-gpu --hide-scrollbars \
      --window-size="$size" --virtual-time-budget=150000 \
      --screenshot="$tmp" "http://127.0.0.1:5180/?$query" 2>/dev/null || true
  done
  if [ -f "$tmp" ]; then
    cp "$tmp" "$OUT/$name.png"
    echo "  ✓ $OUT/$name.png  ($(stat -f%z "$tmp") bytes)"
  else
    echo "  ✗ $name 失败"
  fi
}

echo "→ 生成验收截图"
shot "全园鸟瞰"   "view=top"
shot "正大光明"   "view=close&name=%E6%AD%A3%E5%A4%A7%E5%85%89%E6%98%8E" "1400,800"
shot "勤政亲贤"   "view=close&name=%E5%8B%A4%E6%94%BF%E4%BA%B2%E8%B4%A4" "1400,800"
shot "福海"       "view=garden"
shot "西洋楼大水法" "view=west" "1500,850"
shot "谐奇趣"     "view=at&x=490&z=-654&h=12&d=56&yaw=2.5" "1400,800"
echo "完成"
