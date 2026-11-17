#!/bin/bash
LABEL="$1"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --use-angle=metal \
 --enable-gpu --hide-scrollbars --window-size=1400,800 --virtual-time-budget=45000 \
 --enable-logging=stderr --v=0 --screenshot=/tmp/perf_$LABEL.png \
 "http://localhost:5180/?hud=0&view=close&name=%E6%AD%A3%E5%A4%A7%E5%85%89%E6%98%8E" 2>&1 \
 | grep -oE "三角面数 [0-9,]+ · draw calls [0-9]+" | tail -1 | sed "s/^/$LABEL: /"
