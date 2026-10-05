#!/bin/bash
# 소개 영상 찍기: tools/film.sh <작업 폴더> <만들 영상.mp4> ["&shots=0,3&every=15" 같은 덧붙일 매개변수]
# 화면 없는 브라우저로 촬영 모드(js/film.js)를 돌려 그림을 받고, ffmpeg로 묶는다. 덧붙일 매개변수를 주면 그림만 받고 영상은 만들지 않는다(확인용).
DIR="$1"; OUT="$2"; EXTRA="$3"; PORT=8819; RPORT=8820
FF="/c/Programming/_윈도우 앱/easy-video/node_modules/ffmpeg-static/ffmpeg.exe"
HERE="$(cd "$(dirname "$0")" && pwd)"
rm -rf "$DIR"; mkdir -p "$DIR"
python "$HERE/film_recv.py" "$(cygpath -w "$DIR")" $RPORT & RECV=$!
PROF="$(mktemp -d)"
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --no-first-run --user-data-dir="$(cygpath -w "$PROF")" \
  --ignore-gpu-blocklist --enable-gpu --window-size=1080,1920 --hide-scrollbars --autoplay-policy=no-user-gesture-required \
  --disable-background-timer-throttling --disable-renderer-backgrounding --remote-debugging-port=9333 \
  "http://localhost:$PORT/?film=1&to=http://localhost:$RPORT$EXTRA" > "$DIR/chrome.log" 2>&1 & CH=$!
for i in $(seq 1 120); do [ -f "$DIR/done.txt" ] && break; sleep 2; done
kill $CH $RECV 2>/dev/null; taskkill //F //PID $CH > /dev/null 2>&1
sleep 1; rm -rf "$PROF" 2>/dev/null
N=$(ls "$DIR" | grep -c "\.jpg$"); echo "받은 그림 $N장"
[ -f "$DIR/done.txt" ] || { echo "끝까지 찍지 못함"; exit 1; }
[ -n "$EXTRA" ] && exit 0
"$FF" -y -loglevel error -framerate 30 -i "$(cygpath -w "$DIR")/%05d.jpg" -f lavfi -i anullsrc=r=44100:cl=stereo -shortest \
  -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -c:a aac -b:a 96k -movflags +faststart "$(cygpath -w "$OUT")" && echo "영상: $OUT"
