#!/bin/bash
# 확인용 화면 찍기: tools/shot.sh "<주소 뒤 매개변수>" <저장할.png> [가로] [세로] [포트]
# 예) tools/shot.sh "shot=0,0,60,0,0&w=rain&full=1" out.png
Q="$1"; OUT="$2"; W="${3:-1280}"; H="${4:-720}"; PORT="${5:-8819}"
PROF="$(mktemp -d)"
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --no-first-run --user-data-dir="$(cygpath -w "$PROF")" \
  --enable-unsafe-swiftshader --ignore-gpu-blocklist --enable-gpu --window-size=$W,$H --hide-scrollbars \
  --virtual-time-budget=60000 --enable-logging=stderr --v=0 \
  --screenshot="$(cygpath -w "$OUT")" "http://localhost:$PORT/?$Q" 2>&1 | grep -E "CONSOLE|WALK|STATS|Error|error" | grep -v -E "gpu|GPU|dbus|USB|registration" | head -40
rm -rf "$PROF"
