#!/bin/bash
# 깜빡이는 면 찾기: 같은 자리에서 깊이 정밀도(near)만 조금 바꿔 두 장을 찍고, 달라진 곳(겹친 면은 무늬가 바뀐다)을 붉게 칠한다.
# tools/zfight.sh "x,y,z,yaw,pitch" <저장할.png> ["추가 매개변수"]
IFS=, read X Y Z YAW PITCH <<< "$1"; OUT="$2"; EXTRA="$3"
D="$(dirname "$OUT")"
"$(dirname "$0")/shot.sh" "shot=$X,$Y,$Z,$YAW,$PITCH&fly=1&nohud=1&freeze=1&wind=0&near=0.18$EXTRA" "$D/_za.png" 1280 720 >/dev/null
"$(dirname "$0")/shot.sh" "shot=$X,$Y,$Z,$YAW,$PITCH&fly=1&nohud=1&freeze=1&wind=0&near=0.1931$EXTRA" "$D/_zb.png" 1280 720 >/dev/null
python - "$D/_za.png" "$D/_zb.png" "$OUT" <<'PY'
import sys, numpy as np
from PIL import Image
a = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(int); b = np.asarray(Image.open(sys.argv[2]).convert('RGB')).astype(int)
d = np.abs(a - b).max(axis=2)
hot = d > 30
# 16칸 묶음에서 달라진 점이 많은 곳만(가는 선의 계단 현상은 뺀다)
H, W = hot.shape; blocks = hot[:H // 16 * 16, :W // 16 * 16].reshape(H // 16, 16, W // 16, 16).sum(axis=(1, 3))
out = a.copy().astype(np.uint8); n = 0
for by, bx in zip(*np.where(blocks >= 6)):
    out[by * 16:(by + 1) * 16, bx * 16:(bx + 1) * 16, 0] = 255; n += 1
Image.fromarray(out).save(sys.argv[3])
# 가장 많이 달라진 묶음 둘을 확대해 나란히(왼쪽 near 0.18, 오른쪽 0.193) 저장
order = np.argsort(blocks, axis=None)[::-1][:2]
for k, o in enumerate(order):
    by, bx = divmod(int(o), blocks.shape[1])
    if blocks[by, bx] < 6: break
    y0 = max(0, min(H - 160, by * 16 - 72)); x0 = max(0, min(W - 240, bx * 16 - 112))
    crop = np.concatenate([a[y0:y0 + 160, x0:x0 + 240], b[y0:y0 + 160, x0:x0 + 240]], axis=1).astype(np.uint8)
    Image.fromarray(crop).resize((1440, 480), Image.NEAREST).save(sys.argv[3].replace('.png', '_c%d.png' % k))

print('깜빡임 의심 묶음', n, '/ 달라진 점', int(hot.sum()))
PY
