#!/bin/bash
# 无头 Chrome 截图小工具
#
#   scripts/shot.sh <输出.png> "<URL 查询串>"
#
# 例：
#   scripts/shot.sh /tmp/a.png "view=look&ex=-503&ez=430&ey=%2B5&tx=-503&tz=398&ty=%2B0.5"
#
# ⚠ vite 绑的是 IPv6 `::1` ⇒ 必须用 `localhost`，用 `127.0.0.1` 连不上。
set -e
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT="$1"
Q="$2"
[ -n "$OUT" ] && [ -n "$Q" ] || { echo "用法: scripts/shot.sh <out.png> <query>"; exit 1; }
rm -f "$OUT"
"$CHROME" --headless=new --use-angle=metal --enable-gpu --hide-scrollbars \
  --window-size=1400,800 --virtual-time-budget=45000 \
  --enable-logging=stderr --v=0 --screenshot="$OUT" \
  "http://localhost:5180/?hud=0&$Q" 2>/dev/null
ls -la "$OUT"
