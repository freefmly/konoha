// 배치도(plan.mjs)의 자리표를 앱 좌표(미터)로 바꿔 js/plan-data.js 로 내보낸다.  실행: node plan/export.mjs
// 앱 좌표: +x 동, +z 남. 관저(FAN)를 지금 앱의 관저 자리(0,-104)에 맞춘다 → x = -(도면y-270)*2.5, z = (도면x-75)*2.5-104
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as P from './plan.mjs';

const U = P.UNIT, r1 = v => Math.round(v * 10) / 10;
const T = p => [r1(-(p[1] - P.FAN.y) * U), r1((p[0] - P.FAN.x) * U - 104)];
const TP = poly => poly.map(T);
const circlePoly = (c, n = 28) => Array.from({ length: n }, (_, i) => [c[0] + c[2] * Math.cos(i / n * Math.PI * 2), c[1] + c[2] * Math.sin(i / n * Math.PI * 2)]);
// 도면의 타원(가로 rx, 세로 ry, rot도 기울임)을 앱 좌표의 다각형으로
const ellPoly = (e, n = 36) => Array.from({ length: n }, (_, i) => {
  const t = i / n * Math.PI * 2, a = (e.rot || 0) * Math.PI / 180, x = e.rx * Math.cos(t), y = e.ry * Math.sin(t);
  return [e.x + x * Math.cos(a) - y * Math.sin(a), e.y + x * Math.sin(a) + y * Math.cos(a)];
});

const wall = { cx: T([P.C.x, P.C.y])[0], cz: T([P.C.x, P.C.y])[1], r: P.C.r * U };
const zones = P.ZONES.map(z => {
  const poly = z.circle ? circlePoly(z.circle) : P.zonePts(z), sub = P.zoneBlocks(z);
  return { n: z.n, name: z.name, fill: z.fill, at: T(z.at), poly: TP(poly), blocks: sub ? sub.map(TP) : null, walled: !!z.walled, park: !!z.trees };
});
const spokes = P.SPOKES.map(k => ({ a: T(P.pol(k.a, k.r0 || 13)), b: T(P.pol(k.a, k.r1 || P.reach(k.a))), w: P.SPOKE_W * U }));
const data = {
  wall, fan: T([P.FAN.x, P.FAN.y]), forecourt: P.FORECOURT * U,
  town: P.townBlocks().map(TP),                                     // 일반 살림집 블록
  townExtra: P.EXTRA_BLOCKS.map(TP),                                // 나중에 덧붙인 블록(집을 따로 세운다 — 먼저 있던 집들이 바뀌지 않게)
  zones,                                                            // 이름 붙은 구역(블록으로 나뉜 구역은 blocks)
  greens: P.GREEN.slice(0, -P.RING_N).map(TP),                      // 숲·녹지
  greensGone: P.GREEN.slice(-P.RING_N).map(TP),                     // 숲이었다가 집 블록이 된 자리(나무 심는 차례를 지키려고 남겨 둔다)
  roads: {
    main: { a: T([P.MAINROAD.x0, P.FAN.y]), b: T([P.MAINROAD.x1, P.FAN.y]), w: P.MAINROAD.w * U },
    spokes,
    vertical: P.VROADS.map(([x, y0, y1, w]) => ({ a: T([x, y0]), b: T([x, y1]), w: w * U })),
    ring: { r: P.RING.r * U, w: P.RING.w * U },
    plaza: TP(P.PLAZA), plazaOld: TP(P.PLAZA_OLD),
  },
  roadside: { z0: T([P.ROADSIDE.x0, 0])[1], z1: T([P.ROADSIDE.x1, 0])[1], off: P.ROADSIDE.off * U, w: P.ROADSIDE.w * U, step: P.ROADSIDE.step * U },
  water: {
    naka: { pts: TP(P.NAKA), w: 7 * U },                           // 나카 강(바위 쪽이 상류)
    stream: { pts: TP(P.NE_STREAM), w: 5 * U },                    // 이누즈카 구역 옆 냇물
    brook: { pts: TP(P.BROOK), w: 3 * U },                         // 제3 훈련장의 냇물
    lake: TP(ellPoly(P.LAKE)), isle: TP(ellPoly(P.ISLE)), isleLand: TP(ellPoly({ ...P.ISLE, rx: 9, ry: 5.5 })),
    ponds: P.PONDS.map(([x, y, rx, ry]) => TP(ellPoly({ x, y, rx, ry }, 24))),
    parkPond: TP(ellPoly(P.PARK_POND)), parkIsle: TP(ellPoly({ ...P.PARK_POND, rx: P.PARK_POND.isle, ry: P.PARK_POND.isle }, 24)),
    pier: TP(P.PIER),
  },
  bridges: P.BRIDGES.map(TP),
  train: P.TRAIN.map(t => ({ id: t.id, name: t.name, at: T(t.at) })),
};
const out = `// 마을 자리표 — plan/plan.mjs(배치도)에서 뽑은 것. 손으로 고치지 말고 배치도를 고친 뒤 node plan/export.mjs 로 다시 뽑는다.
// 단위 m, +x 동쪽, +z 남쪽. 다각형은 [x, z] 꼭짓점 목록.
export const PLAN = ${JSON.stringify(data)};
`;
const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'js', 'plan-data.js');
fs.writeFileSync(file, out);
console.log('plan-data.js', (out.length / 1024).toFixed(0) + 'KB', '블록', data.town.length + zones.reduce((n, z) => n + (z.blocks ? z.blocks.length : 0), 0), '담', JSON.stringify(wall));
