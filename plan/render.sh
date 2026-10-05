#!/bin/bash
# 배치도 두 장(구역만 / 길과 블록까지)을 svg로 뽑고 크롬으로 png를 찍는다.  사용: bash plan/render.sh
cd "$(dirname "$0")/.." || exit 1
for m in plan detail; do
  node plan/plan.mjs $([ "$m" = detail ] && echo detail) || exit 1
  PROF="$(mktemp -d)"
  "/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --no-first-run --user-data-dir="$(cygpath -w "$PROF")" \
    --window-size=2065,1380 --hide-scrollbars --screenshot="$(cygpath -w "$PWD/plan/village-$m.png")" \
    "file:///$(cygpath -m "$PWD")/plan/village-$m.svg" 2>&1 | grep -iE "written"
  rm -rf "$PROF"
done
