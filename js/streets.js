// 거리 — 살림집 블록에 줄지어 선 집(겉모습만), 숲과 가로수, 덤불과 풀.
// 마을이 넓어서 전부 곱게 그리면 느려진다. 그래서 땅을 네모 칸으로 나눠, 걷는 사람과 가까운 칸만 곱게 그리고 먼 칸은 가볍게 그린다.
//  - 집: 먼 칸은 벽·지붕·창만 있는 가벼운 모습. 가까워지면 그 칸의 집을 한 채씩 곱게 지어 바꿔 끼우고, 멀어지면 헐어 낸다.
//  - 나무: 가까이는 잎이 한 장씩 달린 나무, 중간은 잎이 큰 성긴 나무, 멀리는 잎 뭉치 몇십 장짜리 나무.
//  - 덤불·풀: 가까운 칸만 그린다.
import * as THREE from '../vendor/three.module.js';
import { Builder, addCollider, makeSite, refillSite, dropSince, marks, mat4, rng, tube, mergeGeos } from './build.js';
import { mat, dressLeaves } from './materials.js';
import { makeKit, boxHouse, towerHouse, WALLS, ROOFS, SHOPS } from './town.js';
import { treeGeometry, bushGeometry, tuftGeometry, blob } from './flora.js';
import { PLAN } from './plan-data.js';
import { WALL, CLIFF, STAIR, SITE, NARA_FOREST, inNaraForest, naraTrailDist, DEATH, inDeathForest, deathTrailDist, deathRiverDist } from './layout.js';
import { terrainH, inPoly } from './village.js';
import { zoneGroups, LOTS, OPEN, BARE } from './zones.js';
import { fillCells, pathDist, PATHS } from './fields.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const HC = 80, TC = 40, SC = 160;             // 집 칸, 나무·풀 칸, 먼 나무를 묶는 큰 칸의 한 변(m)

/* ---------- 땅의 쓰임새: 2m 칸으로 미리 그려 둔다 ---------- */
const LAWN = 10;   // 관저 담 둘레의 풀밭(메운 풀밭 MEADOW와 따로 둔다 — 풀밭에 나무를 심는 차례가 바뀌지 않게)
const HOK = SITE.hokage, lawnAt = (x, z) => { const d = Math.hypot(x - HOK.x, z - HOK.z); return d > 42.5 && z > CLIFF.z + 1 && (d < 58 || (z < HOK.z - 30 && Math.abs(x) < 62)) && !(Math.abs(x) < 8 && z > HOK.z); };
const DIRT = 0, TOWN = 1, GREEN = 2, ZONE = 3, OUT = 4, HILL = 5, MEADOW = 6, FIELD = 7, HOLD = 8, HOUSE = 9;   // MEADOW·FIELD = 메운 빈 터(풀밭, 논밭 터), HOLD = 줄이기 전의 정문 마당 자리(잔디)
const LU = 2, LX0 = WALL.cx - WALL.r - 4, LZ0 = WALL.cz - WALL.r - 4, LN = Math.ceil((WALL.r * 2 + 8) / LU);
const land = new Uint8Array(LN * LN);
// 다각형 안의 칸을 v로 적는다(keep에 든 쓰임새는 그대로 둔다)
function fill(poly, v, keep = null) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of poly) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
  for (let iz = Math.max(0, Math.floor((z0 - LZ0) / LU)); iz <= Math.min(LN - 1, Math.floor((z1 - LZ0) / LU)); iz++)
    for (let ix = Math.max(0, Math.floor((x0 - LX0) / LU)); ix <= Math.min(LN - 1, Math.floor((x1 - LX0) / LU)); ix++)
      if (inPoly(LX0 + (ix + 0.5) * LU, LZ0 + (iz + 0.5) * LU, poly) && !(keep && keep.includes(land[iz * LN + ix]))) land[iz * LN + ix] = v;
}
function paintLand() {
  const road = (a, b, w) => {
    const h = w / 2, dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1;
    for (let iz = Math.max(0, Math.floor((Math.min(a[1], b[1]) - h - LZ0) / LU)); iz <= Math.min(LN - 1, Math.floor((Math.max(a[1], b[1]) + h - LZ0) / LU)); iz++)
      for (let ix = Math.max(0, Math.floor((Math.min(a[0], b[0]) - h - LX0) / LU)); ix <= Math.min(LN - 1, Math.floor((Math.max(a[0], b[0]) + h - LX0) / LU)); ix++) {
        const x = LX0 + (ix + 0.5) * LU, z = LZ0 + (iz + 0.5) * LU, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
        if (Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t) < h) land[iz * LN + ix] = DIRT;
      }
  };
  for (const b of PLAN.town) fill(b, TOWN);
  for (const p of [...PLAN.greens, ...PLAN.greensGone]) fill(p, GREEN);
  for (const z of PLAN.zones) { if (z.blocks) { fill(z.poly, DIRT); for (const b of z.blocks) fill(b, ZONE); } else fill(z.poly, ZONE); }
  const R = PLAN.roads, rs = PLAN.roadside;
  fill(R.plazaOld, HOLD);                                                          // 처음의 넓은 정문 마당: 먼저 선 집들이 그대로 있도록 집을 세우지 않는 자리로 둔다
  for (const s of [...R.spokes, ...R.vertical, R.main]) road(s.a, s.b, s.w + 1);
  for (const b of PLAN.bridges) road(b[0], b[1], 9);
  fill(R.plaza, DIRT);
  for (let iz = 0; iz < LN; iz++) for (let ix = 0; ix < LN; ix++) {
    const x = LX0 + (ix + 0.5) * LU, z = LZ0 + (iz + 0.5) * LU, d = Math.hypot(x - WALL.cx, z - WALL.cz);
    if (Math.abs(d - R.ring.r) < R.ring.w / 2 + 0.5 || Math.hypot(x - PLAN.fan[0], z - PLAN.fan[1]) < PLAN.forecourt) land[iz * LN + ix] = DIRT;
    if (Math.abs(Math.abs(x) - rs.off - rs.w / 2) < rs.w / 2 && z > rs.z0 && z < rs.z1) land[iz * LN + ix] = GREEN;      // 큰길 양쪽 가로수 띠
  }
  // 메운 빈 터와 못 둘레 산책길
  fillCells((x, z, kind) => { const i = Math.floor((z - LZ0) / LU) * LN + Math.floor((x - LX0) / LU); if (land[i] === DIRT || land[i] === HOLD) land[i] = kind === 1 ? MEADOW : FIELD; });
  for (const p of PATHS) for (let i = 0; i < p.pts.length - 1; i++) road(p.pts[i], p.pts[i + 1], p.w + 0.6);
  for (let iz = 0; iz < LN; iz++) for (let ix = 0; ix < LN; ix++) if (land[iz * LN + ix] === DIRT && lawnAt(LX0 + (ix + 0.5) * LU, LZ0 + (iz + 0.5) * LU)) land[iz * LN + ix] = LAWN;
}
// 그 자리가 길(맨흙)인가 — 마을 사람이 걸을 자리를 고를 때 쓴다(people.js)
export const isRoad = (x, z) => land !== null && landAt(x, z) === DIRT;
// 그 자리의 쓰임새(담 밖과 산은 따로 가린다)
function landAt(x, z) {
  if (z < CLIFF.z) return HILL;
  if (Math.hypot(x - WALL.cx, z - WALL.cz) > WALL.r - 2.5) return z > WALL.cz && Math.abs(x) < 9 ? DIRT : OUT;
  const ix = Math.floor((x - LX0) / LU), iz = Math.floor((z - LZ0) / LU);
  return ix < 0 || iz < 0 || ix >= LN || iz >= LN ? OUT : land[iz * LN + ix];
}

/* ---------- 집 자리 잡기: 블록 가장자리를 따라 길을 보고 줄지어 세운다 ---------- */
const boxOf = h => { const c = Math.cos(h.ry), s = Math.sin(h.ry); return { x: h.x, z: h.z, ux: c, uz: -s, vx: s, vz: c, hw: h.w / 2, hd: h.d / 2 }; };
// 비스듬한 네모 둘이 gap 안으로 겹치는가(네 방향으로 나눠 재 본다)
function boxesHit(a, b, gap) {
  const dx = b.x - a.x, dz = b.z - a.z;
  for (const [ax, az] of [[a.ux, a.uz], [a.vx, a.vz], [b.ux, b.uz], [b.vx, b.vz]]) {
    const ra = a.hw * Math.abs(a.ux * ax + a.uz * az) + a.hd * Math.abs(a.vx * ax + a.vz * az);
    const rb = b.hw * Math.abs(b.ux * ax + b.uz * az) + b.hd * Math.abs(b.vx * ax + b.vz * az);
    if (Math.abs(dx * ax + dz * az) > ra + rb + gap) return false;
  }
  return true;
}
const corners = (o, pad = 0) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [o.x + o.ux * a * (o.hw + pad) + o.vx * b * (o.hd + pad), o.z + o.uz * a * (o.hw + pad) + o.vz * b * (o.hd + pad)]);

// 비스듬한 네모 터들을 쓰임새 그림에 "집"으로 적는다(집·나무·풀이 피한다)
function stamp(list) {
  for (const h of list) {
    const o = h.box || boxOf(h), r = Math.hypot(o.hw, o.hd) + 1;
    for (let iz = Math.floor((h.z - r - LZ0) / LU); iz <= Math.floor((h.z + r - LZ0) / LU); iz++) for (let ix = Math.floor((h.x - r - LX0) / LU); ix <= Math.floor((h.x + r - LX0) / LU); ix++) {
      const dx = LX0 + (ix + 0.5) * LU - h.x, dz = LZ0 + (iz + 0.5) * LU - h.z;
      if (Math.abs(dx * o.ux + dz * o.uz) < o.hw + 0.8 && Math.abs(dx * o.vx + dz * o.vz) < o.hd + 0.8 && ix >= 0 && iz >= 0 && ix < LN && iz < LN) land[iz * LN + ix] = HOUSE;
    }
  }
}
// groups: 집을 세울 블록 묶음들. 살림집 거리 하나와 가문 구역들 — 구역은 집의 생김새(style)와 꾸밈(deco)을 따로 준다.
function planHouses(R, mobile, groups) {
  const houses = [];
  let shopI = 0, G = null;
  stamp([...Object.values(SITE).filter(s => s.w), ...LOTS]);       // 들어갈 수 있는 건물과 구역의 특별한 건물 터부터 비워 둔다
  const fits = (h, mine, poly) => {
    const o = boxOf(h);
    for (const [x, z] of [...corners(o, 0.6), [h.x, h.z]]) if (!inPoly(x, z, poly) || landAt(x, z) !== G.land || terrainH(x, z) < -0.05 || (G.ok && !G.ok(x, z))) return false;
    for (const q of mine) if (boxesHit(o, q.box, 1.3)) return false;
    return true;
  };
  const add = (h, mine) => {
    const main = Math.abs(h.x) < 42, sq = Math.abs(h.w - h.d) < 2.5 && Math.min(h.w, h.d) > 7, round = sq && R() < 0.22, kindR = R();
    Object.assign(h, {
      box: boxOf(h), round, main,
      floors: round ? 2 + Math.floor(R() * 2.4) : 1 + Math.floor(R() * 2.3) + (main && R() < 0.5 ? 1 : 0),
      wall: Math.floor(R() * WALLS.length), roof: Math.floor(R() * ROOFS.length),
      roofKind: round ? (R() < 0.35 ? 'flat' : 'cone') : kindR < 0.5 ? 'gable' : kindR < 0.78 ? 'hip' : 'flat',
      shop: R() < (main ? 0.75 : 0.22) ? SHOPS[shopI++ % SHOPS.length] : null,
      seed: Math.floor(R() * 1e6), rise: 1.5 + R() * 0.9,
    });
    if (G.style) Object.assign(h, G.style(R));
    h.deco = G.deco || null;
    h.H = h.floors * 3.0 + 0.3;
    if (h.round) { h.r = Math.min(h.w, h.d) / 2 - 0.3; h.rise = h.r * (0.5 + R() * 0.25); }
    mine.push(h); houses.push(h);
  };
  for (G of groups) for (const poly of G.polys) {
    const mine = [], n = poly.length, len = [0];
    for (let i = 0; i < n; i++) { const a = poly[i], b = poly[(i + 1) % n]; len.push(len[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
    const T = len[n];
    const at = s => { s = ((s % T) + T) % T; let i = 0; while (i < n - 1 && len[i + 1] < s) i++; const a = poly[i], b = poly[(i + 1) % n], t = (s - len[i]) / Math.max(1e-6, len[i + 1] - len[i]); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
    // 가장자리 줄
    let s = R() * 4;
    while (s < T) {
      const sz = G.size || [7.5, 4.5, 7.5, 3.5];                         // 집의 폭·깊이(가장 작은 값, 더해지는 폭)
      const w = sz[0] + R() * sz[1], d = sz[2] + R() * sz[3], set0 = 1.2 + R() * 1.3, set = G.set ?? set0, a = at(s), b = at(s + w), ch = Math.hypot(b[0] - a[0], b[1] - a[1]);
      let done = false;
      if (ch > w * 0.93) {
        const ux = (b[0] - a[0]) / ch, uz = (b[1] - a[1]) / ch, mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
        let nx = uz, nz = -ux;                                           // 길 쪽(블록 바깥)을 보는 방향
        if (inPoly(mx + nx * 0.8, mz + nz * 0.8, poly)) { nx = -nx; nz = -nz; }
        for (const more of [0, 3, 6, 9]) {                               // 큰 길이 블록을 덮은 자리는 그만큼 물려 세운다
          const h = { x: mx - nx * (set + more + d / 2), z: mz - nz * (set + more + d / 2), ry: Math.atan2(nx, nz), w, d };
          if (fits(h, mine, poly)) { add(h, mine); done = true; break; }
        }
      }
      s += done ? w + (mobile ? 5 : 1.3) + R() * 2.2 : 2.5;
    }
    // 블록 안쪽에도 드문드문
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of poly) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
    const tries = mobile ? 0 : Math.round((x1 - x0) * (z1 - z0) / 260), base = mine.length ? mine[0].ry : 0;
    for (let i = 0; i < tries; i++) {
      const h = { x: x0 + R() * (x1 - x0), z: z0 + R() * (z1 - z0), ry: base + Math.floor(R() * 4) * Math.PI / 2, w: 7 + R() * 4, d: 7 + R() * 4 };
      const o = boxOf(h);
      if (mine.some(q => boxesHit(o, q.box, 3.2)) || !fits(h, mine, poly)) continue;
      add(h, mine);
    }
  }
  stamp(houses);                                                   // 집이 선 자리도 적어 둔다(나무·풀이 피한다)
  return houses;
}

/* ---------- 가벼운 집: 벽·지붕·창만 ---------- */
const newAcc = () => ({ p: [], n: [], u: [], c: [] });
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3();
// 꼭짓점 셋·넷짜리 면. hint(바깥쪽) 방향을 보도록 감는 차례를 맞춘다.
function face(A, pts, col, hint) {
  _a.set(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]); _b.set(pts[2][0] - pts[0][0], pts[2][1] - pts[0][1], pts[2][2] - pts[0][2]);
  _n.crossVectors(_a, _b).normalize();
  let flip = _n.x * hint[0] + _n.y * hint[1] + _n.z * hint[2] < 0;
  if (flip) _n.negate();
  const W = _a.length(), Ht = Math.hypot(pts[pts.length - 1][0] - pts[0][0], pts[pts.length - 1][1] - pts[0][1], pts[pts.length - 1][2] - pts[0][2]);
  const uv = pts.length === 4 ? [[0, 0], [W, 0], [W, Ht], [0, Ht]] : [[0, 0], [W, 0], [W / 2, Ht]];
  const order = pts.length === 4 ? (flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]) : (flip ? [0, 2, 1] : [0, 1, 2]);
  for (const i of order) { A.p.push(pts[i][0], pts[i][1], pts[i][2]); A.n.push(_n.x, _n.y, _n.z); A.u.push(uv[i][0], uv[i][1]); A.c.push(col.r, col.g, col.b); }
}
const COLS = new Map();
const colOf = hex => { let c = COLS.get(hex); if (!c) COLS.set(hex, c = new THREE.Color(hex)); return c; };
const hashf = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

function lightHouse(acc, h) {
  const c = Math.cos(h.ry), s = Math.sin(h.ry), H = h.H;
  const P = (lx, y, lz) => [h.x + lx * c + lz * s, y, h.z - lx * s + lz * c], D = (lx, ly, lz) => [lx * c + lz * s, ly, -lx * s + lz * c];
  const wc = colOf(WALLS[h.wall]), rc = colOf(h.roofHex ?? ROOFS[h.roof]), dk = colOf(0xffffff), door = colOf(0x6b4a30);
  if (h.round) {
    const r = h.r, N = 12, ang = i => i / N * Math.PI * 2, nw = Math.max(5, Math.round(r * 1.5));
    for (let i = 0; i < N; i++) {
      const a0 = ang(i), a1 = ang(i + 1), am = (a0 + a1) / 2, x0 = Math.cos(a0) * r, z0 = Math.sin(a0) * r, x1 = Math.cos(a1) * r, z1 = Math.sin(a1) * r, out = D(Math.cos(am), 0, Math.sin(am));
      face(acc.wall, [P(x0, 0, z0), P(x1, 0, z1), P(x1, H, z1), P(x0, H, z0)], wc, out);
      face(acc.roof, [P(x0 * (1 + 0.9 / r), H, z0 * (1 + 0.9 / r)), P(x1 * (1 + 0.9 / r), H, z1 * (1 + 0.9 / r)), P(0, H + h.rise, 0)], rc, D(Math.cos(am), 1, Math.sin(am)));
    }
    for (let fl = 0; fl < h.floors; fl++) for (let i = 0; i < nw; i++) {
      const a = Math.PI / 2 + (i + (fl % 2) * 0.5) / nw * Math.PI * 2, front = Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.6;
      if ((fl === 0 && front) || hashf(h.seed + i, fl) < 0.2) continue;
      const ox = Math.cos(a) * (r + 0.03), oz = Math.sin(a) * (r + 0.03), tx = -Math.sin(a) * 0.43, tz = Math.cos(a) * 0.43, y = fl * 3.0 + 1.3;
      face(acc.dark, [P(ox - tx, y, oz - tz), P(ox + tx, y, oz + tz), P(ox + tx, y + 1.1, oz + tz), P(ox - tx, y + 1.1, oz - tz)], dk, D(Math.cos(a), 0, Math.sin(a)));
    }
    face(acc.wall, [P(-0.6, 0, r + 0.02), P(0.6, 0, r + 0.02), P(0.6, 2.15, r + 0.02), P(-0.6, 2.15, r + 0.02)], door, D(0, 0, 1));
    return;
  }
  const hw = h.w / 2, hd = h.d / 2, flat = h.roofKind === 'flat', Ht = flat ? H + 0.8 : H;
  // 벽 넷: [모서리, 가로 방향, 바깥 방향, 폭]
  const sides = [[-hw, hd, 1, 0, 0, 1, h.w], [hw, -hd, -1, 0, 0, -1, h.w], [hw, hd, 0, -1, 1, 0, h.d], [-hw, -hd, 0, 1, -1, 0, h.d]];
  sides.forEach(([ox, oz, ux, uz, nx, nz, W], k) => {
    const Q = (u, y, dd) => P(ox + ux * u + nx * dd, y, oz + uz * u + nz * dd), out = D(nx, 0, nz);
    face(acc.wall, [Q(0, 0, 0), Q(W, 0, 0), Q(W, Ht, 0), Q(0, Ht, 0)], wc, out);
    const n = Math.max(1, Math.floor((W - 1.2) / 2.6)), gap = W / n;
    for (let fl = 0; fl < h.floors; fl++) {
      if (fl === 0 && k === 0) continue;
      for (let i = 0; i < n; i++) {
        if (hashf(h.seed + i * 7 + k, fl) < 0.18) continue;
        const u = gap * (i + 0.5), y = fl * 3.0 + 1.25;
        face(acc.dark, [Q(u - 0.52, y, 0.04), Q(u + 0.52, y, 0.04), Q(u + 0.52, y + 1.15, 0.04), Q(u - 0.52, y + 1.15, 0.04)], dk, out);
      }
    }
    if (k === 0) {
      if (h.shop) {   // 가게: 어두운 앞, 기와 차양
        const sw = Math.min(W - 2.2, 4.4) / 2, u = W / 2;
        face(acc.dark, [Q(u - sw, 0.05, 0.04), Q(u + sw, 0.05, 0.04), Q(u + sw, 2.55, 0.04), Q(u - sw, 2.55, 0.04)], dk, out);
        face(acc.roof, [Q(u - sw - 0.5, 2.75, 1.25), Q(u + sw + 0.5, 2.75, 1.25), Q(u + sw + 0.5, 3.25, 0), Q(u - sw - 0.5, 3.25, 0)], rc, D(0, 1, 0.4));
      } else face(acc.wall, [Q(W * 0.5 - 0.58, 0.05, 0.04), Q(W * 0.5 + 0.58, 0.05, 0.04), Q(W * 0.5 + 0.58, 2.2, 0.04), Q(W * 0.5 - 0.58, 2.2, 0.04)], door, out);
    }
  });
  if (flat) { face(acc.roof, [P(-hw - 0.15, Ht, hd + 0.15), P(hw + 0.15, Ht, hd + 0.15), P(hw + 0.15, Ht, -hd - 0.15), P(-hw - 0.15, Ht, -hd - 0.15)], rc, [0, 1, 0]); return; }
  const over = 0.75;
  if (h.roofKind === 'gable') {   // 용마루는 집의 가로 방향
    const sl = h.rise / hd, yE = H - over * sl, yR = H + h.rise, X = hw + 0.45, Z = hd + over;
    for (const sg of [1, -1]) {
      face(acc.roof, [P(-X, yE, sg * Z), P(X, yE, sg * Z), P(X, yR, 0), P(-X, yR, 0)], rc, D(0, 1, sg * 0.5));
      face(acc.wall, [P(sg * hw, H, hd), P(sg * hw, H, -hd), P(sg * hw, yR, 0)], wc, D(sg, 0, 0));
    }
  } else {
    const sl = h.rise / Math.min(hw, hd), X = hw + over, Z = hd + over, sh = Math.min(X, Z), yE = H - over * sl, top = yE + sh * sl, rx = X - sh, rz = Z - sh;
    face(acc.roof, [P(-X, yE, Z), P(X, yE, Z), P(rx, top, rz), P(-rx, top, rz)], rc, D(0, 1, 0.5));
    face(acc.roof, [P(X, yE, -Z), P(-X, yE, -Z), P(-rx, top, -rz), P(rx, top, -rz)], rc, D(0, 1, -0.5));
    face(acc.roof, [P(X, yE, Z), P(X, yE, -Z), P(rx, top, -rz), P(rx, top, rz)], rc, D(0.5, 1, 0));
    face(acc.roof, [P(-X, yE, -Z), P(-X, yE, Z), P(-rx, top, rz), P(-rx, top, -rz)], rc, D(-0.5, 1, 0));
  }
}
function accMesh(A, material, shadow) {
  if (!A.p.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(A.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(A.n, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(A.u, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(A.c, 3));
  const m = new THREE.Mesh(g, material); m.castShadow = shadow; m.receiveShadow = true; m.matrixAutoUpdate = false;
  return m;
}

/* ---------- 먼 나무: 줄기와 굵은 가지 셋, 큼직한 잎 뭉치 수십 장(한 덩어리, 빛깔은 꼭짓점에) ---------- */
function tinyTree(seed) {
  const R = rng(seed), H = 15, p = [], c = [], u = [];
  const bark = new THREE.Color(0x6b5a45), top = V((R() - 0.5) * 0.8, H * 0.42, (R() - 0.5) * 0.8);
  const woods = [tube([V(0, -0.4, 0), V(top.x * 0.4, H * 0.2, top.z * 0.4), top], t => 0.5 * (1 - 0.45 * t), 5, false)];
  for (let i = 0; i < 3; i++) { const a = i * 2.1 + R(), e = V(Math.cos(a) * H * 0.2, H * (0.6 + R() * 0.12), Math.sin(a) * H * 0.2); woods.push(tube([top, top.clone().lerp(e, 0.5).add(V(0, 0.5, 0)), e], t => 0.22 * (1 - 0.6 * t), 3, false)); }
  const wp = mergeGeos(woods).attributes.position;
  for (let i = 0; i < wp.count; i++) { p.push(wp.getX(i), wp.getY(i), wp.getZ(i)); c.push(bark.r, bark.g, bark.b); u.push(0.5, 0.5); }
  const cy = H * 0.7, rh = H * 0.36, rv = H * 0.3, d = new THREE.Vector3(), x = new THREE.Vector3(), up = V(0, 1, 0);
  for (let i = 0; i < 120; i++) {
    const a = R() * Math.PI * 2, e = Math.acos(1 - R() * 1.5), k = 0.55 + 0.45 * Math.sqrt(R());
    d.set(Math.sin(e) * Math.cos(a), Math.cos(e), Math.sin(e) * Math.sin(a));
    const b = V(d.x * rh * k, cy + d.y * rv * k, d.z * rh * k), L = 2.0 + R() * 1.5, w = L * 0.5;
    d.y -= 0.35; d.normalize(); x.crossVectors(d, up).normalize();
    const t = b.clone().addScaledVector(d, L), m = b.clone().addScaledVector(d, L * 0.42), l = m.clone().addScaledVector(x, -w), r = m.clone().addScaledVector(x, w);
    const g = 0.085 + R() * 0.06, col = [g * 0.32, g * 1.15, g * 0.2];
    for (const q of [b, l, t, b, t, r]) { p.push(q.x, q.y, q.z); c.push(col[0], col[1], col[2]); }
    u.push(0.5, 0, 0, 0.45, 0.5, 1, 0.5, 0, 0.5, 1, 1, 0.45);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  g.computeVertexNormals();
  // 잎 덩어리(만화 화풍): 큰 덩어리 넷에 꼭대기 하나. 줄기·가지는 늘 그리고(0), 낱잎은 실사에서만(1), 덩어리는 만화에서만(2)
  const nWood = wp.count, n0 = p.length / 3, cp = [], cn = [], kind = new Float32Array(n0).fill(1); kind.fill(0, 0, nWood);
  for (let i = 0; i < 5; i++) { const a = i * 1.57 + R(), r = i < 4 ? rh * 0.5 : 0; blob(cp, cn, V(Math.cos(a) * r, cy + (i < 4 ? (R() - 0.5) * rv * 0.5 : rv * 0.55), Math.sin(a) * r), rh * (i < 4 ? 0.62 + R() * 0.12 : 0.55), seed + i, true); }
  const m = cp.length / 3, pos = new Float32Array((n0 + m) * 3), nor = new Float32Array((n0 + m) * 3), uv = new Float32Array((n0 + m) * 2), col = new Float32Array((n0 + m) * 3), kd = new Float32Array(n0 + m);
  pos.set(p); pos.set(cp, n0 * 3); nor.set(g.attributes.normal.array); nor.set(cn, n0 * 3); uv.set(u); uv.fill(0.5, n0 * 2); col.set(c); kd.set(kind); kd.fill(2, n0);
  for (let i = 0; i < m; i++) { const gg = 0.105 + ((i / 240 | 0) % 3) * 0.012; col.set([gg * 0.32, gg * 1.15, gg * 0.2], (n0 + i) * 3); }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3)); out.setAttribute('aKind', new THREE.BufferAttribute(kd, 1));
  return out;
}

function instanced(parent, geo, material, list, shadow) {
  const im = new THREE.InstancedMesh(geo, material, list.length);
  list.forEach((m, i) => im.setMatrixAt(i, m));
  im.instanceMatrix.needsUpdate = true; im.castShadow = shadow; im.receiveShadow = true; im.matrixAutoUpdate = false;
  im.computeBoundingSphere(); im.computeBoundingBox();
  parent.add(im);
  return im;
}

export async function build(scene, ctx) {
  const MB = ctx.mobile, R = rng(20261005), K = makeKit();
  await ctx.say('거리에 집터를 잡는 중…');
  paintLand();
  const groups = [{ polys: PLAN.town, land: TOWN }, ...zoneGroups()];
  const houses = planHouses(R, MB, groups);
  // 줄인 정문 마당 자리에 덧붙인 블록은 따로 굴린 수로 집을 세운다(먼저 선 집과 나무가 달라지지 않게)
  const extra = { polys: PLAN.townExtra, land: TOWN };
  // 관저를 두른 나무 고리였던 자리는 집 블록이 된다: 숲이던 칸만 집터로 바꾼다(길과 큰길 가로수 띠는 그대로). 숲이던 칸은 적어 둔다(아래에서 나무 심는 차례를 지키는 데 쓴다)
  const wasGreen = new Uint8Array(LN * LN), NR = PLAN.greensGone.length, rs0 = PLAN.roadside;
  for (const p of PLAN.greensGone) { const b = [Math.min(...p.map(q => q[0])), Math.min(...p.map(q => q[1])), Math.max(...p.map(q => q[0])), Math.max(...p.map(q => q[1]))];
    for (let iz = Math.max(0, Math.floor((b[1] - LZ0) / LU)); iz <= Math.min(LN - 1, Math.floor((b[3] - LZ0) / LU)); iz++) for (let ix = Math.max(0, Math.floor((b[0] - LX0) / LU)); ix <= Math.min(LN - 1, Math.floor((b[2] - LX0) / LU)); ix++) {
      const x = LX0 + (ix + 0.5) * LU, z = LZ0 + (iz + 0.5) * LU, i = iz * LN + ix;
      if (land[i] !== GREEN || !inPoly(x, z, p)) continue;
      wasGreen[i] = 1; if (!(Math.abs(Math.abs(x) - rs0.off - rs0.w / 2) < rs0.w / 2 && z > rs0.z0 && z < rs0.z1)) land[i] = TOWN;
    } }
  const wasGreenAt = (x, z) => { const ix = Math.floor((x - LX0) / LU), iz = Math.floor((z - LZ0) / LU); return ix >= 0 && iz >= 0 && ix < LN && iz < LN && wasGreen[iz * LN + ix] === 1; };
  extra.polys.slice(0, extra.polys.length - NR).forEach(b => fill(b, TOWN, [HOUSE]));
  // 그 블록들 사이를 지나던 바큇살 길도 집터(풀밭)로 덮는다. 관저로 드는 큰길만 남긴다
  for (const p of extra.polys.slice(-NR)) { const b = [Math.min(...p.map(q => q[0])), Math.min(...p.map(q => q[1])), Math.max(...p.map(q => q[0])), Math.max(...p.map(q => q[1]))];
    for (let iz = Math.max(0, Math.floor((b[1] - LZ0) / LU)); iz <= Math.min(LN - 1, Math.floor((b[3] - LZ0) / LU)); iz++) for (let ix = Math.max(0, Math.floor((b[0] - LX0) / LU)); ix <= Math.min(LN - 1, Math.floor((b[2] - LX0) / LU)); ix++) {
      const x = LX0 + (ix + 0.5) * LU, z = LZ0 + (iz + 0.5) * LU, i = iz * LN + ix;
      if (land[i] === DIRT && Math.abs(x) > PLAN.roads.main.w / 2 + 0.5 && inPoly(x, z, p)) land[i] = TOWN;
    } }
  houses.push(...planHouses(rng(20261009), MB, [extra]));

  /* ----- 집: 칸마다 가벼운 모습을 먼저 세운다 ----- */
  const wallL = mat('plaster', 0xffffff, { vc: true }), roofL = mat('tile', 0xffffff, { vc: true });
  const hcells = new Map();
  for (const h of houses) {
    const key = Math.floor(h.x / HC) * 4096 + Math.floor(h.z / HC);
    let c = hcells.get(key);
    if (!c) hcells.set(key, c = { x: (Math.floor(h.x / HC) + 0.5) * HC, z: (Math.floor(h.z / HC) + 0.5) * HC, houses: [], acc: { wall: newAcc(), roof: newAcc(), dark: newAcc() }, fine: null, B: null, i: 0 });
    c.houses.push(h); lightHouse(c.acc, h);
    // 막아서는 상자 하나(곱게 지을 때 그 집의 진짜 상자·지붕면으로 바꿔 담는다)
    const from = marks();
    if (h.round) addCollider(-h.r * 0.75, 0, -h.r * 0.75, h.r * 0.75, h.H, h.r * 0.75); else addCollider(-h.w / 2, 0, -h.d / 2, h.w / 2, h.H, h.d / 2);
    h.site = makeSite(from, { x: h.x, z: h.z, ry: h.ry, pad: 2.5 });
    h.site.fp = h.round ? [-h.r, -h.r, h.r, h.r, null, true] : [-h.w / 2, -h.d / 2, h.w / 2, h.d / 2, null, false];   // 지도에 그릴 바닥꼴
    h.spec = { x0: -h.w / 2, z0: -h.d / 2, x1: h.w / 2, z1: h.d / 2, front: 's', floors: h.floors, wall: h.wall, roof: h.roof, roofHex: h.roofHex, roofKind: h.roofKind, shop: h.shop, near: false, rise: h.rise };
    h.mat = mat4(h.x, 0, h.z, 0, h.ry, 0);
  }
  for (const c of hcells.values()) {
    c.light = new THREE.Group();
    for (const m of [accMesh(c.acc.wall, wallL, true), accMesh(c.acc.roof, roofL, true), accMesh(c.acc.dark, K.dark, false)]) if (m) c.light.add(m);
    c.acc = null; scene.add(c.light);
  }

  /* ----- 나무 자리 ----- */
  await ctx.say('숲을 가꾸는 중…');
  const trees = [], near4 = new Map();
  const clear = (x, z, gap) => {   // 다른 나무와 gap 넘게 떨어져 있는가(4m 칸으로 이웃만 본다)
    const gx = Math.floor(x / 4), gz = Math.floor(z / 4), n = Math.ceil(gap / 4);
    for (let a = -n; a <= n; a++) for (let b = -n; b <= n; b++) { const l = near4.get((gx + a) * 8192 + gz + b); if (l) for (const t of l) if (Math.hypot(t.x - x, t.z - z) < gap) return false; }
    return true;
  };
  let ghost = false;
  const plant = (x, z, s, gap, big = false) => {
    if (Math.abs(Math.hypot(x - WALL.cx, z - WALL.cz) - WALL.r) < 4.5 || !clear(x, z, gap)) return;
    if (naraTrailDist(x, z) < 3.2) return;                                     // 나라 숲의 오솔길과 사슴 터
    for (const o of OPEN) if (Math.hypot(x - o[0], z - o[1]) < o[2]) return;      // 문 앞은 비워 둔다
    const y = terrainH(x, z);
    if (y < -0.05) return;                                                     // 물
    const t = { x, y, z, s, ry: R() * Math.PI * 2, k: Math.floor(R() * 6), big };
    const key = Math.floor(x / 4) * 8192 + Math.floor(z / 4); let l = near4.get(key); if (!l) near4.set(key, l = []); l.push(t);
    if (ghost) return;                                                         // 집 블록이 된 옛 숲 자리: 자리만 잡아 두고 심지는 않는다
    if (inDeathForest(x, z, 3.5) || deathTrailDist(x, z) < 3.4) return;        // 죽음의 숲과 그 오솔길: 자리만 잡아 두고 심지는 않는다(숲 안에는 아래에서 큰 나무를 따로 심는다)
    if (pathDist(x, z) < 1.6) return;                                          // 못 둘레 산책길 위: 자리만 잡아 두고 심지는 않는다(다른 나무의 자리가 바뀌지 않게)
    trees.push(t);
    const r = 0.5 * s; addCollider(x - r, y - 1, z - r, x + r, y + 6, z + r);
  };
  // 큰길 가로수(양쪽 띠 한가운데에 한 줄씩)
  { const rs = PLAN.roadside; for (const sd of [-1, 1]) for (let z = rs.z0 + rs.step / 2; z < rs.z1; z += rs.step) plant(sd * (rs.off + rs.w / 2), z, 1.05 + R() * 0.2, 6, true); }
  const STEP = MB ? 18 : 12.5;
  const sow = (x0, z0, x1, z1, step, ok, s0 = 0.95, s1 = 0.7) => {
    for (let z = z0; z < z1; z += step) for (let x = x0; x < x1; x += step) {
      const px = x + R() * step * 0.85, pz = z + R() * step * 0.85;
      if (ok(px, pz)) plant(px, pz, s0 + R() * s1, step * 0.62);
    }
  };
  const bb = poly => { let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const p of poly) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); } return [x0, z0, x1, z1]; };
  const front = (x, z) => z < CLIFF.z + 14 && z >= CLIFF.z - 9 && Math.abs(x) < CLIFF.half + CLIFF.fall + 8;   // 절벽 앞면과 꼭대기 가장자리
  for (const poly of PLAN.greens) { const b = bb(poly); sow(b[0], b[1], b[2], b[3], STEP, (x, z) => inPoly(x, z, poly) && !front(x, z) && [GREEN, OUT, HILL].includes(landAt(x, z))); }
  ghost = true; for (const poly of PLAN.greensGone) { const b = bb(poly); sow(b[0], b[1], b[2], b[3], STEP, (x, z) => inPoly(x, z, poly) && !front(x, z) && (wasGreenAt(x, z) || [GREEN, OUT, HILL].includes(landAt(x, z)))); } ghost = false;
  for (const zn of PLAN.zones) if (zn.park) { const b = bb(zn.poly); sow(b[0], b[1], b[2], b[3], STEP * 1.9, (x, z) => inPoly(x, z, zn.poly) && landAt(x, z) === ZONE, 0.9, 0.5); }
  // 담 밖을 두른 숲
  sow(WALL.cx - WALL.r - 115, WALL.cz - WALL.r - 115, WALL.cx + WALL.r + 115, WALL.cz + WALL.r + 115, STEP * 1.12, (x, z) => {
    const d = Math.hypot(x - WALL.cx, z - WALL.cz);
    return d > WALL.r + 8 && d < WALL.r + 88 && z >= CLIFF.z && !(z > WALL.cz && Math.abs(x) < 13);
  });
  // 나라 숲: 띠 바깥으로 더 깊이, 굵은 나무를 촘촘하게
  sow(WALL.cx + WALL.r * 0.6, WALL.cz - NARA_FOREST.r1, NARA_FOREST.xMax + 30, WALL.cz, STEP * 0.8, (x, z) => inNaraForest(x, z, 26) && Math.hypot(x - WALL.cx, z - WALL.cz) >= WALL.r + 80, 1.5, 0.9);
  // 바위 꼭대기의 숲(계단을 올라온 자리와 벼랑 끝은 비운다)
  sow(-(CLIFF.half + 30), CLIFF.z - 150, CLIFF.half + 30, CLIFF.z - 10, STEP * 1.4, (x, z) => terrainH(x, z) > CLIFF.top - 12 && !(x > STAIR.x0 - 12 && x < STAIR.x1 + 14 && z > CLIFF.z - 22), 0.8, 0.5);
  // 블록 안마당의 나무
  if (!MB) for (const g of groups) for (const poly of g.polys) { const b = bb(poly); for (let i = 0; i < 18; i++) { const x = b[0] + R() * (b[2] - b[0]), z = b[1] + R() * (b[3] - b[1]); if (inPoly(x, z, poly) && (!g.ok || g.ok(x, z)) && [-3.5, 3.5].every(o => landAt(x + o, z) === g.land && landAt(x, z + o) === g.land)) plant(x, z, 0.75 + R() * 0.4, 9, true); } }

  // 덧붙인 블록의 안마당과, 메운 풀밭에 드문드문 선 나무
  if (!MB) for (const poly of extra.polys) { const b = bb(poly); for (let i = 0; i < 18; i++) { const x = b[0] + R() * (b[2] - b[0]), z = b[1] + R() * (b[3] - b[1]); if (inPoly(x, z, poly) && [-3.5, 3.5].every(o => landAt(x + o, z) === TOWN && landAt(x, z + o) === TOWN)) plant(x, z, 0.75 + R() * 0.4, 9, true); } }
  sow(WALL.cx - WALL.r, CLIFF.z, WALL.cx + WALL.r, WALL.gateZ, STEP * 2.3, (x, z) => landAt(x, z) === MEADOW && R() < 0.8, 0.8, 0.5);

  // 관저 둘레(따로 굴린 수로 심는다): 담 뒤와 절벽 사이의 작은 숲, 담 둘레 풀밭에 듬성듬성 선 나무
  { const R2 = rng(20261011), put = (x, z, s, gap) => { if (landAt(x, z) !== LAWN || !clear(x, z, gap)) return; const y = terrainH(x, z), t = { x, y, z, s, ry: R2() * Math.PI * 2, k: Math.floor(R2() * 6), big: false };
      const key = Math.floor(x / 4) * 8192 + Math.floor(z / 4); let l = near4.get(key); if (!l) near4.set(key, l = []); l.push(t); trees.push(t); const r = 0.5 * s; addCollider(x - r, y - 1, z - r, x + r, y + 6, z + r); };
    for (let z = CLIFF.z + 5; z < HOK.z - 30; z += 7.5) for (let x = -60; x < 60; x += 7.5) put(x + R2() * 6, z + R2() * 6, 0.85 + R2() * 0.5, 5.5);
    for (let i = 0; i < 16; i++) { const a = (i + R2() * 0.7) / 16 * Math.PI * 2, d = 47.5 + R2() * 8; if (R2() < 0.3) continue; put(HOK.x + Math.sin(a) * d, HOK.z + Math.cos(a) * d, 0.7 + R2() * 0.35, 9); } }

  // 죽음의 숲(따로 굴린 수로 심는다): 보통 나무의 세 곱절이 넘는 큰 나무를 철망 안에 빽빽이. 오솔길·탑 터·냇물은 비운다
  { const R3 = rng(20261044), [cx, cz] = DEATH.c, ST = MB ? 30 : 21;
    for (let z = cz - DEATH.rf; z < cz + DEATH.rf; z += ST) for (let x = cx - DEATH.rf; x < cx + DEATH.rf; x += ST) {
      const px = x + R3() * ST * 0.8, pz = z + R3() * ST * 0.8, s = 2.5 + R3() * 1.5, ry = R3() * Math.PI * 2, k = Math.floor(R3() * 6);
      if (!inDeathForest(px, pz, -5) || deathTrailDist(px, pz) < 5 + s || deathRiverDist(px, pz) < DEATH.river.w / 2 + 3 + s || Math.hypot(px - cx, pz - cz) < DEATH.tower + 6) continue;
      if (Math.hypot(px - DEATH.snake[0], pz - DEATH.snake[1]) < 13 || Math.hypot(px - DEATH.centipede[0], pz - DEATH.centipede[1]) < 9) continue;
      const y = terrainH(px, pz); if (y < -0.05) continue;
      trees.push({ x: px, y, z: pz, s, ry, k, big: false }); const r = 0.42 * s; addCollider(px - r, y - 1, pz - r, px + r, y + 20, pz + r);
    } }

  /* ----- 나무·덤불·풀: 칸으로 묶는다 ----- */
  const tcells = new Map();
  const tcell = (x, z) => { const key = Math.floor(x / TC) * 4096 + Math.floor(z / TC); let c = tcells.get(key); if (!c) tcells.set(key, c = { x: (Math.floor(x / TC) + 0.5) * TC, z: (Math.floor(z / TC) + 0.5) * TC, trees: [], tufts: [], bushes: [], lod: 2, g: [null, null, null], tuft: null, bush: null }); return c; };
  for (const t of trees) tcell(t.x, t.z).trees.push(t);
  // 덤불: 집 옆구리와 뒤
  for (const h of houses) for (const [lx, lz] of [[-h.w / 2 - 0.7, (R() - 0.5) * h.d * 0.7], [h.w / 2 + 0.7, (R() - 0.5) * h.d * 0.7], [(R() - 0.5) * h.w * 0.7, -h.d / 2 - 0.8]]) {
    if (R() < 0.55) continue;
    const c = Math.cos(h.ry), s = Math.sin(h.ry), x = h.x + lx * c + lz * s, z = h.z - lx * s + lz * c;
    if (landAt(x, z) !== DIRT) tcell(x, z).bushes.push(mat4(x, 0, z, 0, R() * 6.283, 0, 0.8 + R() * 0.7));
  }
  // 풀포기: 풀밭 어디에나(길·집·물 빼고)
  { const st = MB ? 9 : 5.5, lim = WALL.r + 60;
    for (let z = WALL.cz - lim; z < WALL.cz + lim; z += st) for (let x = WALL.cx - lim; x < WALL.cx + lim; x += st) {
      const px = x + R() * st, pz = z + R() * st, lu = landAt(px, pz);
      if (lu === DIRT || lu === HOUSE || lu === HILL || Math.hypot(px - WALL.cx, pz - WALL.cz) > lim || (lu === OUT && R() < 0.5)) continue;
      const y = terrainH(px, pz); if (y < -0.02 || BARE.some(f => f(px, pz))) continue;
      tcell(px, pz).tufts.push(mat4(px, y, pz, 0, R() * 6.283, 0, 0.8 + R() * 1.1));
    } }

  const bark = mat('bark', 0x8a7257), twig = mat('bark', 0x6e5a40), greens = [0x35702a, 0x447f2e, 0x2b6026];
  const bigG = [0, 1, 2].map(i => treeGeometry(11 + i * 7, { height: 13 + i * 1.5, depth: 4, sprays: 5, leaves: 6, leafLen: 0.5 }));
  const midG = [0, 1, 2].map(i => treeGeometry(51 + i * 5, { height: 14 + i * 2, depth: 3, sprays: 5, leaves: 4, leafLen: 1.05, spread: 1.1, flat: true }));
  const tinyG = [tinyTree(5), tinyTree(9)], tinyM = mat('leaf', 0xffffff, { vc: true });
  const leafM = greens.map(g => mat('leaf', g)), bushG = [bushGeometry(5, 1), bushGeometry(9, 1.3)], tuftG = tuftGeometry(3), tuftM = mat('leaf', 0x5c9a3a);
  const tm = t => mat4(t.x, t.y, t.z, 0, t.ry, 0, t.s);
  // 칸의 나무를 한 단계(0 가까이, 1 중간, 2 멀리)로 그릴 덩어리를 만든다
  const treeGroup = (c, lod) => {
    const g = new THREE.Group(); g.matrixAutoUpdate = false;
    { const G = lod ? midG : bigG, by = [[], [], []]; c.trees.forEach(t => by[t.k % 3].push(tm(t))); by.forEach((l, i) => { if (!l.length) return; instanced(g, G[i].wood, bark, l, true); instanced(g, G[i].leaves, leafM[(i + lod) % 3], l, true); }); }
    scene.add(g); g.updateMatrixWorld(true); dressLeaves(g);
    return g;
  };
  // 먼 나무: 큰 칸마다 한 덩어리로 그린다. 작은 칸이 가까워져 고운 나무로 바뀌면 그 칸의 나무만 크기 0으로 줄여 숨긴다.
  const supers = new Map(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  for (const c of tcells.values()) for (const t of c.trees) {
    const key = Math.floor(t.x / SC) * 4096 + Math.floor(t.z / SC);
    let s = supers.get(key); if (!s) supers.set(key, s = { list: [], dirty: false });
    t.sup = s; t.si = s.list.length; s.list.push(mat4(t.x, t.y, t.z, 0, t.ry, 0, t.s * 1.08));
  }
  let si = 0;
  for (const s of supers.values()) s.im = instanced(scene, tinyG[si++ % 2], tinyM, s.list, false);
  const farShow = (c, on) => { for (const t of c.trees) { t.sup.im.setMatrixAt(t.si, on ? t.sup.list[t.si] : ZERO); t.sup.dirty = true; } };
  console.log(`STREETS 집 ${houses.length} 나무 ${trees.length} 집칸 ${hcells.size} 나무칸 ${tcells.size} 큰칸 ${supers.size} 첫집 ${houses.filter((h, i) => i % 90 === 0).map(h => h.x.toFixed(0) + "," + h.z.toFixed(0)).join(" ")}`);

  /* ----- 걷는 사람을 따라 곱게·가볍게 바꿔 그린다 ----- */
  const NEAR = MB ? 22 : 34, MID = MB ? 95 : 135, TUFT = MB ? 30 : 46, BUSH = 80;
  // 집: PRE 안이면 미리 곱게 지어 숨겨 두고, SHOW_IN 안에 들면 내놓고, SHOW_OUT 밖으로 나가면 다시 가벼운 모습으로, DROP 밖이면 지은 것을 버린다
  const PRE = MB ? 110 : 150, SHOW_IN = MB ? 45 : 100, SHOW_OUT = MB ? 110 : 150, DROP = MB ? 150 : 230;
  const cam = ctx.camera, glowsOff = { push() {} }, last = V(1e9, 0, 0);
  const dist = (c, half, p) => Math.hypot(Math.max(Math.abs(c.x - p.x) - half, 0), Math.max(Math.abs(c.z - p.z) - half, 0), Math.max(p.y - 25, 0));
  const queue = [], reveal = [];
  let shadowAt = 0, shadowBy = 0;                                       // 그림자를 다시 그릴 때(바뀐 것이 잦아들기를 기다렸다가 한 번에)
  const fineStep = c => {   // 칸의 집을 한 채 곱게 짓는다. 다 지으면 가벼운 모습과 바꿔 끼운다.
    if (!c.B) { c.B = new Builder(); c.i = 0; }
    const h = c.houses[c.i++], Bh = new Builder(), from = marks();
    (h.round ? towerHouse : boxHouse)(Bh, K, h.spec, rng(h.seed), glowsOff);
    if (h.deco) h.deco(Bh, h);
    if (h.fineDone) dropSince(from); else { refillSite(h.site, from); h.fineDone = true; }
    c.B.absorb(Bh, h.mat);
    if (c.i < c.houses.length) return false;
    c.fine = c.B.finish(scene); c.B = null; c.fine.updateMatrixWorld(true); c.fine.visible = false; c.shown = false;   // 지어서 숨겨 둔다
    return true;
  };
  const tick = () => {
    if (!cam) return;
    const p = cam.position;
    let changed = false;
    if (last.distanceTo(p) > 2) {
      last.copy(p);
      for (const c of tcells.values()) {
        const d = dist(c, TC / 2, p), lod = d < NEAR + (c.lod === 0 ? 8 : 0) ? 0 : d < MID + (c.lod <= 1 ? 10 : 0) ? 1 : 2;
        if (lod !== c.lod && c.trees.length) {
          if (lod < 2 && !c.g[lod]) c.g[lod] = treeGroup(c, lod);
          if (c.lod < 2) c.g[c.lod].visible = false; else farShow(c, false);
          if (lod < 2) c.g[lod].visible = true; else farShow(c, true);
          changed = true;
        }
        c.lod = lod;
        const tv = d < TUFT, bv = d < BUSH;
        if (tv && !c.tuft && c.tufts.length) c.tuft = instanced(scene, tuftG, tuftM, c.tufts, false);
        if (c.tuft) c.tuft.visible = tv;
        if (bv && !c.bush && c.bushes.length) { c.bush = new THREE.Group(); const by = [[], []]; c.bushes.forEach((m, i) => by[i % 2].push(m)); by.forEach((l, i) => { if (!l.length) return; instanced(c.bush, bushG[i].wood, twig, l, false); instanced(c.bush, bushG[i].leaves, leafM[i + 1], l, true); }); scene.add(c.bush); c.bush.updateMatrixWorld(true); }
        if (c.bush) c.bush.visible = bv;
      }
      for (const s of supers.values()) if (s.dirty) { s.im.instanceMatrix.needsUpdate = true; s.dirty = false; }
      queue.length = 0; reveal.length = 0;
      for (const c of hcells.values()) {
        const d = dist(c, HC / 2, p);
        if (c.fine && d > DROP) { scene.remove(c.fine); c.fine.traverse(o => o.geometry && o.geometry.dispose()); c.fine = null; if (c.shown) { c.shown = false; c.light.visible = true; changed = true; } }
        if (c.fine && c.shown && d > SHOW_OUT) { c.fine.visible = false; c.light.visible = true; c.shown = false; changed = true; }
        if (c.fine && !c.shown && d < SHOW_IN) reveal.push([d, c]);
        if (!c.fine && d < PRE) queue.push([d, c]);
        if (c.B && d > DROP) c.B = null;                                  // 짓다 만 칸에서 멀어졌으면 그만둔다
      }
      queue.sort((a, b) => a[0] - b[0]); reveal.sort((a, b) => a[0] - b[0]);
    }
    // 숨겨 둔 집은 한 장면에 한 칸씩만 내놓는다(그래픽 카드로 올리는 일이 몰리지 않게)
    if (reveal.length) { const c = reveal.shift()[1]; if (c.fine && !c.shown) { c.fine.visible = true; c.light.visible = false; c.shown = true; changed = true; } }
    // 가까운 칸부터 한 번에 조금씩 짓는다. 한 칸을 다 지으면(묶는 일이 크다) 그 장면에서는 더 짓지 않는다. 내놓을 거리 안인데 아직 못 지은 칸만 조금 서두른다
    else if (queue.length) {
      const t0 = performance.now(), budget = queue[0][0] < SHOW_IN ? (queue[0][0] < 12 ? 14 : 6) : 3;
      while (queue.length && performance.now() - t0 < budget) if (fineStep(queue[0][1])) { const [d, c] = queue.shift(); if (d < SHOW_IN) reveal.push([d, c]); break; }
    }
    // 그림자: 바뀔 때마다 마을 전체의 그림자를 다시 그리면 그때마다 화면이 끊긴다. 가벼운 집과 고운 집, 먼 나무와 가까운 나무는 그림자가 거의 같으니
    // 바뀌는 일이 잦아들 때까지 기다렸다가 한 번만 다시 그린다(길어도 4초 안에는 한 번)
    const now = performance.now();
    if (changed) { if (!shadowAt) shadowBy = now + 4000; shadowAt = Math.min(now + 900, shadowBy); }
    if (shadowAt && now >= shadowAt) { shadowAt = 0; if (ctx.weather) ctx.weather.shadowDirty = true; }
  };
  // 확인용 주소(?shot=)로 곧장 그 자리에 설 때는 둘레의 집을 미리 곱게 지어 둔다
  if (ctx.shotAt) for (const c of hcells.values()) if (dist(c, HC / 2, ctx.shotAt) < SHOW_IN) { while (!fineStep(c)); c.fine.visible = true; c.light.visible = false; c.shown = true; }
  return { tick };
}
