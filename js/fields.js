// 빈 터 메우기 — 담 안에서 블록도 숲도 길도 아닌 채 맨흙으로 남은 자리를 찾아 풀밭(정문 쪽)과 논밭(강 건너 서쪽)으로 돌린다.
// 자리는 2m 칸으로 한 번만 셈해 두고, 땅 그림(village.js)·쓰임새 그림(streets.js)·논밭 짓기(zones.js)가 함께 읽는다.
import { PLAN } from './plan-data.js';
import { WALL, CLIFF, naraTrailDist, deathTrailDist, outTrailDist } from './layout.js';

const NAKA = PLAN.water.naka.pts;
// 메울 범위(이 안의 남은 맨흙만 바꾼다). farm = 나카 강 바깥쪽(서쪽 담 밑), meadow = 정문 둘레
const AREAS = [
  { kind: 2, poly: [...NAKA.slice(1), [-150, 1058], [-725, 1058], [-725, 84], [-500, 84]] },
  { kind: 1, poly: [[450, 698], [450, 1058], [-150, 1058], ...NAKA.slice(7).reverse(), [-325, 698]] },
  { kind: 1, poly: [[-520, 180], [-420, 180], [-420, 440], [-520, 440]] },     // 강 안쪽 둑(우치하 구역 위쪽)
];
// 산책길(흙길) — 풀밭과 숲 사이로 낸다. [점들, 폭]
const ring = (cx, cz, rx, rz, a0, a1, n) => Array.from({ length: n + 1 }, (_, i) => { const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; return [cx + Math.cos(a) * rx, cz + Math.sin(a) * rz]; });
export const POND_E = [80, 859], POND_W = [-130, 866];           // 정문 동쪽 못(냇물이 끝나는 못), 서쪽 못(나카 강이 끝나는 못)
export const PATHS = [
  { pts: ring(POND_E[0], POND_E[1], 23, 26, 0, 360, 24), w: 2.6 },                                    // 동쪽 못을 한 바퀴
  { pts: [[11, 878.5], [56, 878.5], [61.5, 873.5]], w: 3 },                                            // 큰길에서 가게 줄 사이 골목으로 못까지
  { pts: [[-152.5, 838.5], ...ring(POND_W[0], POND_W[1], 30, 35, -125, 150, 18), [-167.5, 873.5]], w: 2.6 },   // 서쪽 못: 다리 한쪽 끝에서 못을 돌아 다른 쪽 끝까지
  { pts: [[-83, 858], [-100, 866]], w: 2.6 },                                                          // 살림집 골목에서 서쪽 못으로
  { pts: [[-167.5, 873.5], [-178, 905], [-199, 960]], w: 2.6 },                                        // 다리 건너 둑 숲을 지나 담 밑 둘레길까지
];

const segD = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };
const lineD = (x, z, pts) => { let d = 1e9; for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, segD(x, z, pts[i], pts[i + 1])); return d; };
const inside = (x, z, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const boxOf = (pts, pad) => { let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); } return [x0 - pad, z0 - pad, x1 + pad, z1 + pad]; };
const inB = (x, z, b) => x > b[0] && x < b[2] && z > b[1] && z < b[3];
// 산책길 한가운데에서 얼마나 떨어져 있나(m, 길 폭의 반을 뺀 값 — 0보다 작으면 길 위)
const PBOX = PATHS.map(p => boxOf(p.pts, 8));
export const pathDist = (x, z) => { let d = 1e9; PATHS.forEach((p, i) => { if (inB(x, z, PBOX[i])) d = Math.min(d, lineD(x, z, p.pts) - p.w / 2); }); return d; };

/* ---------- 남은 맨흙 찾기 ---------- */
const U = 2, X0 = WALL.cx - WALL.r, Z0 = WALL.cz - WALL.r, N = Math.ceil(WALL.r * 2 / U);
let grid = null;
function compute() {
  grid = new Uint8Array(N * N);
  const R = PLAN.roads;
  // [다각형, 둘레에 흙길로 남길 폭]: 블록과 구역은 길 폭만큼 띄우고, 숲은 풀밭이 바로 맞닿게 한다
  const solids = [...PLAN.town, ...PLAN.townExtra, ...PLAN.zones.map(z => z.poly)].map(p => [p, 5]).concat(PLAN.greens.map(p => [p, 0]), [[R.plaza, 2]], [PLAN.water.lake, PLAN.water.isle, PLAN.water.parkPond, ...PLAN.water.ponds].map(p => [p, 3]))
    .map(([poly, pad]) => ({ poly: [...poly, poly[0]], pad, box: boxOf(poly, pad) }));
  const lines = [...R.spokes, ...R.vertical, R.main].map(s => ({ pts: [s.a, s.b], d: s.w / 2 + 1.5 })).concat(PLAN.bridges.map(b => ({ pts: b, d: 5 })), [PLAN.water.naka, PLAN.water.stream, PLAN.water.brook].map(r => ({ pts: r.pts, d: r.w / 2 + 2.5 })))
    .map(l => ({ ...l, box: boxOf(l.pts, l.d) }));
  const areas = AREAS.map(a => ({ ...a, box: boxOf(a.poly, 0) }));
  for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) {
    const x = X0 + (ix + 0.5) * U, z = Z0 + (iz + 0.5) * U, d = Math.hypot(x - WALL.cx, z - WALL.cz);
    if (d > WALL.r - 3 || Math.abs(d - R.ring.r) < R.ring.w / 2 + 1 || Math.hypot(x, z - WALL.gateZ - 7) < 27) continue;
    const strip = d > R.ring.r && z > CLIFF.z + 10 && naraTrailDist(x, z) > 2.5 && deathTrailDist(x, z) > 2.5 && outTrailDist(x, z) > 2.5;      // 둘레길과 담 사이의 띠는 마을을 빙 둘러 풀밭
    const a = areas.find(q => inB(x, z, q.box) && inside(x, z, q.poly));
    if (!a && !strip) continue;
    if (lines.some(l => inB(x, z, l.box) && lineD(x, z, l.pts) < l.d) || solids.some(s => inB(x, z, s.box) && (inside(x, z, s.poly) || (s.pad && lineD(x, z, s.poly) < s.pad))) || pathDist(x, z) < 0.3) continue;
    grid[iz * N + ix] = strip || d > R.ring.r ? 1 : a.kind;
  }
}
// 그 자리가 메운 빈 터인가: 0 아님, 1 풀밭, 2 논밭 터
export function fillAt(x, z) {
  if (!grid) compute();
  const ix = Math.floor((x - X0) / U), iz = Math.floor((z - Z0) / U);
  return ix < 0 || iz < 0 || ix >= N || iz >= N ? 0 : grid[iz * N + ix];
}
// 메운 칸을 차례로 넘긴다: f(칸 가운데 x, z, 종류, 칸 크기)
export function fillCells(f) {
  if (!grid) compute();
  for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) if (grid[iz * N + ix]) f(X0 + (ix + 0.5) * U, Z0 + (iz + 0.5) * U, grid[iz * N + ix], U);
}

/* ---------- 논밭 터 나누기: 담을 따라 도는 고리마다 네모 터를 줄지어 놓는다(터 사이는 두렁길) ---------- */
const hash = n => { const v = Math.sin(n * 127.1 + 31.7) * 43758.5453; return v - Math.floor(v); };
// 터 { x, z 가운데, a 담 한가운데에서 본 각도, w 폭(담과 나란한 쪽), d 깊이, t 종류(0 논, 1 푸성귀 밭, 2 과수원), c 네 귀 }
// 터의 제 좌표: +x = 담을 따라 도는 쪽, +z = 마을 안쪽. 놓을 때 ry = atan2(-cos a, -sin a)
export function farmPlots() {
  const out = [], D = 11, GAP = 2.2, r1 = PLAN.roads.ring.r - PLAN.roads.ring.w / 2 - GAP - D / 2;
  // 큰 터부터 놓고, 남은 틈에 작은 터를 끼운다. 고리는 2m씩 안으로 옮겨 가며, 먼저 놓은 터와 겹치지 않는 자리만 쓴다
  for (const W of [16, 10]) for (let rm = r1; rm > 330; rm -= 2) {
    const da = 2 / rm;
    for (let a = 0; a < Math.PI * 2; a += da) {
      const tx = -Math.sin(a), tz = Math.cos(a), ox = Math.cos(a), oz = Math.sin(a), x = WALL.cx + ox * rm, z = WALL.cz + oz * rm;
      if (fillAt(x, z) !== 2) continue;
      const P = (u, v) => [x + tx * u - ox * v, z + tz * u - oz * v];
      let ok = !out.some(q => Math.abs(q.rm - rm) < D + GAP && Math.abs(Math.atan2(Math.sin(q.a - a), Math.cos(q.a - a))) * rm < (q.w + W) / 2 + GAP);
      for (let u = -1; u <= 1 && ok; u += 0.5) for (let v = -1; v <= 1; v += 0.5) { const p = P(u * (W / 2 + 0.4), v * (D / 2 + 0.4)); if (fillAt(p[0], p[1]) !== 2) { ok = false; break; } }
      if (!ok) continue;
      const h = hash(Math.floor(a * 560 / 60) * 7 + Math.floor((r1 - rm) / 40) * 13.3), t = h < 0.5 ? 0 : h < 0.8 ? 1 : 2;
      out.push({ x, z, a, rm, w: W, d: D, t, c: [P(-W / 2, -D / 2), P(W / 2, -D / 2), P(W / 2, D / 2), P(-W / 2, D / 2)] });
    }
  }
  return out;
}
