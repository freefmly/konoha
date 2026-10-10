// 닌자 아카데미 터 — 교사 둘레에 들어선 것들: 앞마당(흙), 제1 훈련장, 달리기 운동장, 실내 훈련장, 창설 기념비, 터의 나무.
// 교사(b_academy.js)와 같은 좌표로 지어(정면이 +z = 큰길 쪽) 터에 돌려 놓는다. 교사는 x 47~89, z -120~-104.
// 원작에서 가져온 것: 아카데미를 2대 호카게 센쥬 토비라마가 세웠다는 것, 그네 나무, 인을 맺은 큰 손 석상(원작에서는 중급닌자 시험 예선장에 선 것).
// 지어낸 것: 훈련장·운동장·실내 훈련장의 생김새와 놓인 자리, 기념비의 모양과 새긴 글.
import * as THREE from '../vendor/three.module.js';
import { Builder, marks, settle, addCollider, addRoof, mat4, tube, wall, rng, leafMark } from './build.js';
import { M, mat, textMat } from './materials.js';
import { tilePanel, beamBetween, ridgeLine, hipRoof, gableRoof, windowUnit, doorUnit, signBoard } from './arch.js';
import { treeGeometry, bushGeometry } from './flora.js';
import { PLAN } from './plan-data.js';
import { SITE } from './layout.js';
import { BARE } from './zones.js';

const PI = Math.PI, V = (x, y, z) => new THREE.Vector3(x, y, z);
const cyl = (rt, rb, h, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg);
const alongX = g => g.rotateZ(-PI / 2), alongZ = g => g.rotateX(PI / 2);

// 터의 자리표(교사 좌표)
export const CAMPUS = {
  yard: [40.6, -122, 95.4, -65.2],        // 교사를 두른 흙 마당 [x0, z0, x1, z1]
  court: [44, -140, 92, -122],            // 교사와 실내 훈련장 사이의 뒤뜰
  train: [100, -122, 132, -70],           // 제1 훈련장
  hall: [52, -168, 84, -140],             // 실내 훈련장
  track: { x: 11, z: -101, a: 21, b: 15, w: 5 },   // 달리기 운동장(길쭉한 고리. a·b = 바깥 반지름, w = 길 너비)
  paths: [[95.4, -79, 100, -75], [32, -101, 40.6, -97], [92, -132.5, 116, -129.5], [113, -129.5, 116, -122]],   // 마당 → 훈련장, 마당 → 운동장, 뒤뜰 → 훈련장 뒷문
  stone: [61.5, -80],                     // 창설 기념비
};
const inRect = (x, z, r, pad = 0) => x > r[0] - pad && x < r[2] + pad && z > r[1] - pad && z < r[3] + pad;
const trackD = (x, z, k = 0) => { const t = CAMPUS.track; return Math.hypot((x - t.x) / (t.a + k), (z - t.z) / (t.b + k)); };
const onDirt = (x, z, pad = 0) => inRect(x, z, CAMPUS.yard, pad) || inRect(x, z, CAMPUS.court, pad) || inRect(x, z, CAMPUS.train, pad) || inRect(x, z, CAMPUS.hall, pad + 1.5)
  || CAMPUS.paths.some(p => inRect(x, z, p, pad)) || (trackD(x, z, pad) < 1 && trackD(x, z, -CAMPUS.track.w - pad) > 1);

/* ---------- 센쥬 일족의 문장(기억으로 그린 것): 가운데 곧은 살과, 위아래로 벌어졌다 모이는 두 쌍의 굽은 살 ---------- */
function senjuCrest(g, cx, cy, r, col) {
  g.fillStyle = col;
  g.beginPath(); g.moveTo(cx, cy - r); g.lineTo(cx + r * 0.1, cy - r * 0.32); g.lineTo(cx + r * 0.06, cy); g.lineTo(cx + r * 0.1, cy + r * 0.32); g.lineTo(cx, cy + r);
  g.lineTo(cx - r * 0.1, cy + r * 0.32); g.lineTo(cx - r * 0.06, cy); g.lineTo(cx - r * 0.1, cy - r * 0.32); g.closePath(); g.fill();
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    g.beginPath(); g.moveTo(cx + sx * r * 0.14, cy + sy * r * 0.06);
    g.quadraticCurveTo(cx + sx * r * 0.74, cy + sy * r * 0.3, cx + sx * r * 0.2, cy + sy * r * 0.82);
    g.quadraticCurveTo(cx + sx * r * 0.46, cy + sy * r * 0.36, cx + sx * r * 0.14, cy + sy * r * 0.2); g.closePath(); g.fill();
  }
  g.fillRect(cx - r * 0.3, cy - r * 0.055, r * 0.6, r * 0.11);
}

/* ---------- 인을 맺은 두 손의 석상(未 — 검지와 중지를 곧게 세우고 나머지는 깍지 낀다). 보는 쪽이 +z, 크기 s ---------- */
export function sealHands(B, m, cx, y0, cz, s, ry = 0) {
  const base = mat4(cx, 0, cz, 0, ry, 0), L = (lx, y, lz, rx = 0, rY = 0, rz = 0, sc = 1) => new THREE.Matrix4().multiplyMatrices(base, mat4(lx, y, lz, rx, rY, rz, sc));   // ry만큼 돌려 세운다
  const DY = 0.85, P = p => V(p[0] * s, y0 + (p[1] > 2.6 ? p[1] - DY : p[1]) * s, -p[2] * s).applyMatrix4(base);   // 손은 팔뚝이 짧은 만큼 내려 앉힌다
  const limb = (pts, r, n = 16, sides = 12) => B.geo(m, tube(new THREE.CatmullRomCurve3(pts.map(P)).getPoints(n), t => r(t) * s, sides, true));
  // 손가락: 끝으로 갈수록 가늘고 마디 둘이 불거진다
  const finger = (pts, r0) => limb(pts, t => r0 * (1 - 0.24 * t) * (1 + 0.11 * Math.exp(-((t - 0.36) ** 2) / 0.004) + 0.09 * Math.exp(-((t - 0.7) ** 2) / 0.004)) * (t > 0.94 ? 1 - (t - 0.94) * 6 : 1), 22, 10);
  const ball = new THREE.SphereGeometry(1, 20, 14);
  for (const sx of [-1, 1]) {
    // 소맷부리와 팔뚝: 받침에서 비스듬히 올라와 손목에서 가늘어진다
    B.geo(m, new THREE.LatheGeometry([[0.4, 0], [0.74, 0], [0.78, 0.1], [0.74, 0.42], [0.62, 0.54], [0.4, 0.52]].map(p => new THREE.Vector2(p[0] * s, p[1] * s)), 20), L(sx * 0.8 * s, y0, 0, 0, 0, sx * 0.12));
    limb([[sx * 0.8, 0.1, 0.02], [sx * 0.7, 0.6, 0.02], [sx * 0.58, 1.15, 0], [sx * 0.5, 1.62, 0]], t => 0.56 - 0.17 * t, 12, 16);
    B.geo(m, ball, L(sx * 0.5 * s, y0 + 1.68 * s, 0, 0, 0, 0, [0.4 * s, 0.32 * s, 0.52 * s]));                                  // 손목 마디
    B.geo(m, ball, L(sx * 0.36 * s, y0 + (3.15 - DY) * s, 0.12 * s, 0, 0, -sx * 0.1, [0.38 * s, 0.86 * s, 0.8 * s]));        // 손등
    // 곧게 세운 중지(뒤)와 검지(앞)
    finger([[sx * 0.2, 3.7, 0.36], [sx * 0.175, 4.55, 0.37], [sx * 0.15, 5.4, 0.36], [sx * 0.13, 6.05, 0.34]], 0.2);
    finger([[sx * 0.2, 3.72, 0.0], [sx * 0.175, 4.6, 0.0], [sx * 0.15, 5.5, 0.0], [sx * 0.13, 6.2, 0.0]], 0.205);
    // 깍지 낀 약지와 새끼: 맞은편 손등으로 넘어가 감싼다(두 손의 손가락이 번갈아 놓인다)
    const zr = sx < 0 ? -0.3 : -0.47, zp = sx < 0 ? -0.64 : -0.8;
    finger([[sx * 0.34, 3.6, zr], [sx * 0.2, 4.02, zr], [-sx * 0.2, 4.04, zr], [-sx * 0.58, 3.72, zr], [-sx * 0.76, 3.3, zr + 0.02]], 0.185);
    finger([[sx * 0.34, 3.4, zp], [sx * 0.18, 3.8, zp], [-sx * 0.2, 3.8, zp], [-sx * 0.55, 3.5, zp], [-sx * 0.7, 3.12, zp + 0.03]], 0.16);
    // 엄지: 몸 쪽에서 나란히 세운다
    finger([[sx * 0.5, 2.85, 0.66], [sx * 0.36, 3.3, 0.8], [sx * 0.2, 3.85, 0.84], [sx * 0.15, 4.3, 0.8]], 0.22);
  }
}

export function campus(scene, out) {
  const at = SITE.academy, holder = new THREE.Group(), from = marks(), B = new Builder(), R = rng(31007);
  const places = [], glows = [], lights = [];
  const DIRT = mat('plain', 0xc2a36c, { rough: 0.96, puddles: true }), LOG = mat('wood', 0x7a5a3c), LIGHT = M.beamLight, BEAM = M.beam, STRAW = mat('wood', 0xd2b064), WHT = mat('plain', 0xf0ece0);
  const TILE = mat('tile', 0xb5552f), RED = mat('wood', 0x9c4a3a), STONE = M.stone, GREY = mat('stone', 0xa9a79c), SAND = mat('dirt', 0xe6d7a8);
  const inst = (g, m, ms) => { const im = new THREE.InstancedMesh(g, m, ms.length); ms.forEach((q, i) => im.setMatrixAt(i, q)); im.instanceMatrix.needsUpdate = true; im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); holder.add(im); return im; };
  const flat = (m, r, y = 0.03) => B.box(m, r[0], 0, r[1], r[2], y, r[3], false);
  // 길쭉한 고리 꼴의 판(달리기 길·흰 줄): 바깥 반지름 (a, b), 너비 w
  const ovalRing = (m, cx, cz, a, b, w, y) => {
    const s = new THREE.Shape(); s.absellipse(0, 0, a, b, 0, PI * 2, false, 0);
    const h = new THREE.Path(); h.absellipse(0, 0, a - w, b - w, 0, PI * 2, true, 0); s.holes.push(h);
    B.geo(m, new THREE.ShapeGeometry(s, 72).rotateX(-PI / 2), mat4(cx, y, cz));
  };
  const bench = (x, z, ry, w = 2.6) => {
    const c = Math.cos(ry), s = Math.sin(ry), q = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    B.geo(LIGHT, new THREE.BoxGeometry(w, 0.05, 0.4), mat4(x, 0.44, z, 0, ry, 0));
    for (const k of [-1, 1]) { const p = q(k * (w / 2 - 0.14), 0); B.geo(LIGHT, new THREE.BoxGeometry(0.07, 0.42, 0.34), mat4(p[0], 0.21, p[1], 0, ry, 0)); }
    const a = q(-w / 2, -0.2), b = q(w / 2, 0.2); addCollider(Math.min(a[0], b[0]), 0, Math.min(a[1], b[1]), Math.max(a[0], b[0]), 0.46, Math.max(a[1], b[1]));
  };

  /* ================= 흙 마당과 길 ================= */
  flat(DIRT, CAMPUS.yard); flat(DIRT, CAMPUS.court); for (const p of CAMPUS.paths) flat(DIRT, p);

  /* ================= 제1 훈련장 ================= */
  {
    const [x0, z0, x1, z1] = CAMPUS.train;
    flat(DIRT, CAMPUS.train);
    // 통나무 울타리: 말뚝과 가로대 둘. 서쪽(마당 쪽)과 북쪽(실내 훈련장 쪽)에 드나드는 틈
    const gaps = [['w', -79.2, -74.8], ['n', 112.6, 116.4]];
    const gPost = cyl(0.11, 0.13, 1.25, 8), posts = [];
    const run = (side, a0, a1) => {
      const n = Math.max(1, Math.round((a1 - a0) / 2.8)), fx = side === 'w' ? x0 : x1, fz = side === 'n' ? z0 : z1, ew = side === 'w' || side === 'e';
      for (let i = 0; i <= n; i++) { const u = a0 + (a1 - a0) * i / n; posts.push(ew ? mat4(fx, 0.62, u, 0, R() * 6, 0) : mat4(u, 0.62, fz, 0, R() * 6, 0)); }
      for (const y of [0.48, 0.98]) B.geo(LOG, ew ? alongZ(cyl(0.055, 0.055, a1 - a0 + 0.3, 6)) : alongX(cyl(0.055, 0.055, a1 - a0 + 0.3, 6)), ew ? mat4(fx, y, (a0 + a1) / 2) : mat4((a0 + a1) / 2, y, fz));
      if (ew) addCollider(fx - 0.1, 0, a0, fx + 0.1, 1.2, a1); else addCollider(a0, 0, fz - 0.1, a1, 1.2, fz + 0.1);
    };
    for (const [side, a, b] of [['w', z0, z1], ['e', z0, z1], ['n', x0, x1], ['s', x0, x1]]) {
      const g = gaps.find(q => q[0] === side);
      if (g) { run(side, a, g[1]); run(side, g[2], b); } else run(side, a, b);
    }
    inst(gPost, LOG, posts);
    // 들머리 문: 굵은 기둥 둘에 가로대, 훈련장 이름을 적은 널
    for (const z of [-79.2, -74.8]) { B.geo(LOG, cyl(0.17, 0.2, 3.4, 12), mat4(x0, 1.7, z)); addCollider(x0 - 0.2, 0, z - 0.2, x0 + 0.2, 3.4, z + 0.2); }
    B.geo(LOG, alongZ(cyl(0.13, 0.13, 5.6, 10)), mat4(x0, 3.05, -77)); B.geo(LOG, alongZ(cyl(0.09, 0.09, 5.0, 10)), mat4(x0, 2.6, -77));
    signBoard(B, '第一演習場', x0 - 0.02, 2.82, -77, -PI / 2, 2.6, 0.5, { both: true, depth: 0.06, bg: '#e9dcc0' });

    // 대련 터: 흰 금으로 그린 동그라미와 마주 서는 금 둘
    const RX = 111.5, RZ = -84;
    B.geo(WHT, new THREE.RingGeometry(4.86, 5.0, 64).rotateX(-PI / 2), mat4(RX, 0.045, RZ));
    for (const k of [-1, 1]) B.box(WHT, RX + k * 1.2 - 0.05, 0.03, RZ - 0.6, RX + k * 1.2 + 0.05, 0.045, RZ + 0.6, false);

    // 치기 말뚝: 새끼줄을 감은 통나무 여섯(북쪽 줄)
    const gRope = new THREE.TorusGeometry(0.2, 0.026, 6, 14).rotateX(PI / 2), ropes = [], logs = [], tops = [];
    for (let i = 0; i < 6; i++) {
      const x = 103.5 + i * 3.6, z = -118.2, h = 1.75 + (i % 3) * 0.12;
      logs.push(mat4(x, h / 2, z, 0, R() * 6, 0, [1, h, 1])); tops.push(mat4(x, h + 0.004, z));
      for (let k = 0; k < 9; k++) ropes.push(mat4(x, 0.82 + k * 0.05, z, 0, R() * 6, 0));
      addCollider(x - 0.2, 0, z - 0.2, x + 0.2, h, z + 0.2);
    }
    inst(cyl(0.175, 0.2, 1, 12), LOG, logs); inst(cyl(0.17, 0.17, 0.012, 12), LIGHT, tops); inst(gRope, STRAW, ropes);

    // 수리검 과녁: 동쪽 울타리 앞에 다리 달린 과녁판 다섯, 던지는 금, 날붙이 상자
    const ring = textMat(' ', { w: 256, h: 256, bg: '#f4f0e4', color: '#f4f0e4', draw: (g, w) => { for (const [r, c] of [[0.46, '#b3392b'], [0.36, '#f4f0e4'], [0.27, '#b3392b'], [0.17, '#f4f0e4'], [0.08, '#1d1a16']]) { g.fillStyle = c; g.beginPath(); g.arc(w / 2, w / 2, w * r, 0, 7); g.fill(); } } });
    for (let i = 0; i < 5; i++) {
      const x = 130.4, z = -112 + i * 4.2, y = 1.35 + (i % 2) * 0.2;
      for (const dz of [-0.4, 0.4]) { beamBetween(B, LOG, V(x + 0.5, 0, z + dz), V(x - 0.02, y + 0.5, z + dz), 0.08, 0.08); }
      B.geo(LIGHT, alongX(cyl(0.5, 0.5, 0.07, 28)), mat4(x - 0.05, y, z)); B.geo(ring, new THREE.CircleGeometry(0.47, 28), mat4(x - 0.09, y, z, 0, -PI / 2, 0));
      addCollider(x - 0.1, 0, z - 0.5, x + 0.5, y + 0.55, z + 0.5);
    }
    B.box(WHT, 122.0, 0.03, -114.5, 122.12, 0.045, -93.5, false);
    { const x = 120.8, z = -104; for (const [a, b, c, d] of [[-0.4, -0.3, -0.36, 0.3], [0.36, -0.3, 0.4, 0.3], [-0.4, -0.3, 0.4, -0.26], [-0.4, 0.26, 0.4, 0.3]]) B.box(LIGHT, x + a, 0.03, z + b, x + c, 0.36, z + d, false); B.box(LIGHT, x - 0.4, 0.03, z - 0.3, x + 0.4, 0.07, z + 0.3, false); addCollider(x - 0.4, 0, z - 0.3, x + 0.4, 0.36, z + 0.3); }

    // 타고 넘는 널벽: 굵은 기둥 사이에 널을 대고 매듭 지은 밧줄 둘을 늘였다
    { const x = 124.5, za = -81.5, zb = -77.5, H = 3.4;
      for (const z of [za, zb]) B.geo(LOG, cyl(0.15, 0.18, H + 0.3, 10), mat4(x, (H + 0.3) / 2, z));
      for (let k = 0; k < 11; k++) B.box(k % 2 ? LIGHT : mat('wood', 0xa67c4e), x - 0.05, 0.1 + k * 0.3, za, x + 0.05, 0.38 + k * 0.3, zb, false);
      addCollider(x - 0.18, 0, za - 0.18, x + 0.18, H, zb + 0.18);
      for (const z of [za + 1.1, zb - 1.1]) { B.geo(STRAW, tube([V(x - 0.09, H, z), V(x - 0.12, 2, z), V(x - 0.1, 0.5, z + 0.03)], 0.028, 6, true)); for (let k = 0; k < 5; k++) B.geo(STRAW, new THREE.SphereGeometry(0.055, 8, 6), mat4(x - 0.11, 0.7 + k * 0.55, z)); }
    }
    // 건너뛰는 말뚝: 높이가 제각각인 통나무
    { const ms = [], ts = [];
      for (let i = 0; i < 7; i++) for (let j = 0; j < 2; j++) { const x = 106 + i * 1.6 + (R() - 0.5) * 0.3, z = -93.4 + j * 1.7 + (R() - 0.5) * 0.3, h = 0.35 + ((i * 2 + j) % 5) * 0.28 + R() * 0.12; ms.push(mat4(x, h / 2, z, 0, R() * 6, 0, [1.05, h, 1.05])); ts.push(mat4(x, h + 0.004, z)); addCollider(x - 0.19, 0, z - 0.19, x + 0.19, h, z + 0.19); }
      inst(cyl(0.175, 0.2, 1, 12), LOG, ms); inst(cyl(0.17, 0.17, 0.012, 12), LIGHT, ts); }
    // 외나무다리: 가로 걸친 통나무 둘(높이가 다르다)
    for (const [z, h] of [[-73, 0.6], [-75.6, 1.05]]) {
      B.geo(LOG, alongX(cyl(0.15, 0.13, 6.4, 12)), mat4(123, h, z)); addCollider(119.8, h - 0.15, z - 0.14, 126.2, h + 0.15, z + 0.14);
      for (const x of [120.5, 125.5]) for (const dz of [-0.3, 0.3]) beamBetween(B, LOG, V(x, 0, z + dz), V(x, h - 0.08, z + dz * 0.2), 0.1, 0.1);
    }
    // 쉼터: 맞배지붕 아래 긴 걸상, 물독과 바가지, 목검 걸이
    { const xa = 101.2, xb = 104, za = -100, zb = -94;
      for (const x of [xa, xb]) for (const z of [za, zb]) B.box(BEAM, x - 0.08, 0, z - 0.08, x + 0.08, 2.5, z + 0.08);
      B.box(BEAM, xa - 0.1, 2.4, za - 0.1, xb + 0.1, 2.5, za + 0.06, false); B.box(BEAM, xa - 0.1, 2.4, zb - 0.06, xb + 0.1, 2.5, zb + 0.1, false);
      gableRoof(B, TILE, xa, za, xb, zb, 2.5, 0.9, { ridge: 'z', over: 0.5, overGable: 0.4, detail: 3 });
      bench(xa + 0.6, -97, PI / 2, 4.6);
      B.geo(mat('plain', 0x6b4a36), new THREE.LatheGeometry([[0, 0], [0.24, 0], [0.36, 0.3], [0.34, 0.62], [0.26, 0.7], [0.29, 0.74], [0.24, 0.74], [0.2, 0.68], [0, 0.66]].map(p => new THREE.Vector2(p[0], p[1])), 16), mat4(xb - 0.5, 0.03, zb - 0.6));
      B.geo(M.water, new THREE.CircleGeometry(0.2, 16).rotateX(-PI / 2), mat4(xb - 0.5, 0.66, zb - 0.6)); addCollider(xb - 0.86, 0, zb - 0.96, xb - 0.14, 0.76, zb - 0.24);
      B.geo(LIGHT, cyl(0.07, 0.06, 0.08, 10), mat4(xb - 0.5, 0.8, zb - 0.85)); B.geo(LIGHT, alongX(cyl(0.012, 0.012, 0.34, 6)), mat4(xb - 0.3, 0.83, zb - 0.85));
      for (const z of [za + 0.5, za + 1.9]) B.box(BEAM, xb - 0.5, 0, z - 0.04, xb - 0.42, 1.1, z + 0.04, false);
      for (let k = 0; k < 4; k++) { B.box(BEAM, xb - 0.62, 0.3 + k * 0.22, za + 0.4, xb - 0.5, 0.33 + k * 0.22, za + 2.0, false); B.geo(LIGHT, tube([0, 1, 2, 3, 4].map(q => V(xb - 0.58, 0.36 + k * 0.22 + 0.03 * Math.sin(q / 4 * PI), za + 0.3 + q * 0.45)), t => 0.02 - 0.007 * t, 6)); }
    }
    places.push({ n: '제1 훈련장', t: '아카데미 학생들이 기초를 닦는 훈련장. 대련 터의 흰 동그라미, 치기 말뚝, 수리검 과녁, 타고 넘는 널벽이 있다.', b: [x0, x1, z0, z1], y: [-1, 8] });
  }

  /* ================= 달리기 운동장 ================= */
  {
    const t = CAMPUS.track;
    ovalRing(DIRT, t.x, t.z, t.a, t.b, t.w, 0.03);
    for (const k of [0.15, t.w / 3 + 0.05, t.w * 2 / 3, t.w - 0.2]) ovalRing(WHT, t.x, t.z, t.a - k, t.b - k, 0.07, 0.045);
    B.box(WHT, t.x - 0.06, 0.03, t.z + t.b - t.w, t.x + 0.06, 0.046, t.z + t.b, false);                                    // 출발 금
    // 멀리뛰기 모래판과 디딤널(고리 안 풀밭)
    B.box(DIRT, t.x - 9, 0, t.z - 0.7, t.x + 1, 0.03, t.z + 0.7, false); B.box(SAND, t.x + 1.3, 0, t.z - 1.5, t.x + 7.5, 0.05, t.z + 1.5, false);
    for (const [a, b, c, d] of [[1.15, -1.65, 1.3, 1.65], [7.5, -1.65, 7.65, 1.65], [1.15, -1.65, 7.65, -1.5], [1.15, 1.5, 7.65, 1.65]]) B.box(LIGHT, t.x + a, 0, t.z + b, t.x + c, 0.09, t.z + d, false);
    B.box(WHT, t.x + 0.7, 0.03, t.z - 0.6, t.x + 0.95, 0.046, t.z + 0.6, false);
    // 구경하는 세 단 걸상(큰길 쪽)
    { const xa = t.x - 6, xb = t.x + 6, z = t.z + t.b + 2.2;
      for (let k = 0; k < 3; k++) { B.box(LIGHT, xa, 0.36 + k * 0.4, z + k * 0.7, xb, 0.42 + k * 0.4, z + k * 0.7 + 0.5); for (let x = xa + 0.4; x < xb; x += 2.8) B.box(BEAM, x, 0, z + k * 0.7 + 0.1, x + 0.1, 0.36 + k * 0.4, z + k * 0.7 + 0.4, false); }
    }
    // 깃대: 붉은 바탕에 나뭇잎 표를 그린 기
    { const x = t.x + t.a + 2.4, z = t.z + t.b - 2;
      B.geo(M.iron, cyl(0.045, 0.06, 7.2, 10), mat4(x, 3.6, z)); B.geo(M.iron, new THREE.SphereGeometry(0.09, 10, 8), mat4(x, 7.24, z)); addCollider(x - 0.08, 0, z - 0.08, x + 0.08, 7.2, z + 0.08);
      const flag = textMat(' ', { w: 384, h: 256, bg: '#b3392b', color: '#b3392b', draw: (g, w, h) => leafMark(g, w * 0.5, h * 0.52, h * 0.78, '#f4efe2') }, 'cloth');
      B.geo(flag, new THREE.PlaneGeometry(1.8, 1.2), mat4(x + 0.95, 6.5, z));
    }
    places.push({ n: '아카데미 운동장', t: '흙을 다진 달리기 길과 멀리뛰기 모래판. 체력 단련 수업을 여기서 한다.', b: [t.x - t.a, t.x + t.a, t.z - t.b, t.z + t.b + 5], y: [-1, 8] });
  }

  /* ================= 실내 훈련장 ================= */
  {
    const [X0, Z0, X1, Z1] = CAMPUS.hall, A = 4, T = 0.25, FL = 0.35, LOW = 4.6, SH = 6.4, TOP = 10.2;
    const CX0 = X0 + A, CX1 = X1 - A, CZ0 = Z0 + A, CZ1 = Z1 - A, MX = (X0 + X1) / 2;
    const WALLM = M.white;
    B.box(STONE, X0 - 0.35, 0, Z0 - 0.35, X1 + 0.35, FL - 0.1, Z1 + 0.35);
    B.box(M.floor, X0 + 0.05, FL - 0.1, Z0 + 0.05, X1 - 0.05, FL, Z1 - 0.05);
    B.box(STONE, MX - 2.6, 0, Z1 + 0.35, MX + 2.6, 0.14, Z1 + 1.2);
    // 바깥 벽(둘레 칸): 4m 칸마다 창, 남쪽 한가운데가 문
    const bays = (a, b, skip = null) => { const o = []; for (let u = a + 2; u < b; u += 4) if (!skip || Math.abs(u - skip) > 3) o.push({ u0: u - 1.1, u1: u + 1.1, ys: [[1.6, 3.4]] }); return o; };
    const sOps = [...bays(X0, X1, MX), { u0: MX - 2, u1: MX + 2, ys: [[FL, 3.7]] }].sort((p, q) => p.u0 - q.u0);
    wall(B, WALLM, 'x', Z1 - T, Z1, X0, X1, 0.25, LOW, sOps); wall(B, WALLM, 'x', Z0, Z0 + T, X0, X1, 0.25, LOW, bays(X0, X1));
    wall(B, WALLM, 'z', X0, X0 + T, Z0 + T, Z1 - T, 0.25, LOW, bays(Z0, Z1)); wall(B, WALLM, 'z', X1 - T, X1, Z0 + T, Z1 - T, 0.25, LOW, bays(Z0, Z1));
    for (const o of bays(X0, X1, MX)) windowUnit(B, 'x', Z1 - T, Z1, o.u0, o.u1, 1.6, 3.4, { out: 1, nx: 3, ny: 2 });
    for (const o of bays(X0, X1)) windowUnit(B, 'x', Z0, Z0 + T, o.u0, o.u1, 1.6, 3.4, { out: -1, nx: 3, ny: 2 });
    for (const o of bays(Z0, Z1)) { windowUnit(B, 'z', X0, X0 + T, o.u0, o.u1, 1.6, 3.4, { out: -1, nx: 3, ny: 2 }); windowUnit(B, 'z', X1 - T, X1, o.u0, o.u1, 1.6, 3.4, { out: 1, nx: 3, ny: 2 }); }
    doorUnit(B, 'x', Z1 - T, Z1, MX - 2, MX + 2, FL, 3.7, { leaf: null, t: 0.16 });
    // 겉의 기둥과 붉은 널 징두리
    for (let x = X0; x <= X1 + 0.01; x += 4) for (const [z, d] of [[Z1, 0.07], [Z0 - 0.07, 0.07]]) { const xx = Math.min(X1 - 0.11, Math.max(X0 + 0.11, x)); if (Math.abs(x - MX) > 1 || z < Z1) B.box(BEAM, xx - 0.11, 0.25, z, xx + 0.11, LOW, z + d, false); }
    for (let z = Z0; z <= Z1 + 0.01; z += 4) for (const [x, d] of [[X1, 0.07], [X0 - 0.07, 0.07]]) { const zz = Math.min(Z1 - 0.11, Math.max(Z0 + 0.11, z)); B.box(BEAM, x, 0.25, zz - 0.11, x + d, LOW, zz + 0.11, false); }
    B.box(RED, X0 - 0.04, 0.25, Z1, MX - 2.2, 1.35, Z1 + 0.04, false); B.box(RED, MX + 2.2, 0.25, Z1, X1 + 0.04, 1.35, Z1 + 0.04, false); B.box(RED, X0 - 0.04, 0.25, Z0 - 0.04, X1 + 0.04, 1.35, Z0, false);
    B.box(RED, X0 - 0.04, 0.25, Z0, X0, 1.35, Z1, false); B.box(RED, X1, 0.25, Z0, X1 + 0.04, 1.35, Z1, false);
    // 둘레 칸의 천장과, 가운데 높은 칸을 받치는 기둥
    const CEIL = M.beamLight;
    B.box(CEIL, X0 + T, LOW - 0.08, Z0 + T, X1 - T, LOW, CZ0, false); B.box(CEIL, X0 + T, LOW - 0.08, CZ1, X1 - T, LOW, Z1 - T, false);
    B.box(CEIL, X0 + T, LOW - 0.08, CZ0, CX0, LOW, CZ1, false); B.box(CEIL, CX1, LOW - 0.08, CZ0, X1 - T, LOW, CZ1, false);
    for (let x = CX0; x <= CX1 + 0.01; x += 4) for (const z of [CZ0, CZ1]) B.box(BEAM, x - 0.2, FL, z - 0.2, x + 0.2, LOW, z + 0.2);
    for (let z = CZ0 + 4; z < CZ1 - 0.01; z += 4) for (const x of [CX0, CX1]) B.box(BEAM, x - 0.2, FL, z - 0.2, x + 0.2, LOW, z + 0.2);
    // 가운데 높은 칸의 벽(둘레 지붕 위로 솟는다): 높은 창이 줄지어 났다
    const hi = (a, b) => { const o = []; for (let u = a + 2; u < b; u += 4) o.push({ u0: u - 1.3, u1: u + 1.3, ys: [[7.3, 9.1]] }); return o; };
    wall(B, WALLM, 'x', CZ1 - T, CZ1, CX0, CX1, LOW, TOP, hi(CX0, CX1)); wall(B, WALLM, 'x', CZ0, CZ0 + T, CX0, CX1, LOW, TOP, hi(CX0, CX1));
    wall(B, WALLM, 'z', CX0, CX0 + T, CZ0 + T, CZ1 - T, LOW, TOP, hi(CZ0, CZ1)); wall(B, WALLM, 'z', CX1 - T, CX1, CZ0 + T, CZ1 - T, LOW, TOP, hi(CZ0, CZ1));
    for (const o of hi(CX0, CX1)) { windowUnit(B, 'x', CZ1 - T, CZ1, o.u0, o.u1, 7.3, 9.1, { out: 1, nx: 4, ny: 2 }); windowUnit(B, 'x', CZ0, CZ0 + T, o.u0, o.u1, 7.3, 9.1, { out: -1, nx: 4, ny: 2 }); }
    for (const o of hi(CZ0, CZ1)) { windowUnit(B, 'z', CX0, CX0 + T, o.u0, o.u1, 7.3, 9.1, { out: -1, nx: 4, ny: 2 }); windowUnit(B, 'z', CX1 - T, CX1, o.u0, o.u1, 7.3, 9.1, { out: 1, nx: 4, ny: 2 }); }
    // 높은 칸의 벽을 받치는 보: 벽 밑면(LOW)보다 조금 내려 물린다(밑면이 한 높이로 겹치지 않게)
    for (const z of [CZ0 - 0.03, CZ1 - 0.3]) B.box(BEAM, CX0 - 0.03, LOW - 0.05, z, CX1 + 0.03, LOW + 0.3, z + 0.33, false);
    for (const x of [CX0 - 0.03, CX1 - 0.3]) B.box(BEAM, x, LOW - 0.045, CZ0, x + 0.33, LOW + 0.31, CZ1, false);
    for (let x = CX0; x <= CX1 + 0.01; x += 4) for (const [z, d] of [[CZ1, 0.06], [CZ0 - 0.06, 0.06]]) { const xx = Math.min(CX1 - 0.1, Math.max(CX0 + 0.1, x)); B.box(BEAM, xx - 0.1, SH, z, xx + 0.1, TOP, z + d, false); }
    for (let z = CZ0; z <= CZ1 + 0.01; z += 4) for (const [x, d] of [[CX1, 0.06], [CX0 - 0.06, 0.06]]) { const zz = Math.min(CZ1 - 0.1, Math.max(CZ0 + 0.1, z)); B.box(BEAM, x, SH, zz - 0.1, x + d, TOP, zz + 0.1, false); }
    // 둘레 지붕: 높은 칸의 벽에서 바깥 처마로 흘러내리는 네 면(모서리는 빗잘라 맞춘다)
    const OV = 1.0, RUN = A + OV, slope = (SH - LOW - 0.12) / A, yE = SH - slope * RUN, LEN = Math.hypot(RUN, SH - yE), k = RUN / LEN;
    const WX = X1 - X0 + OV * 2, WZ = Z1 - Z0 + OV * 2, cut = w => v => [v * k, w - v * k];
    tilePanel(B, TILE, V(X0 - OV, yE, Z1 + OV), V(1, 0, 0), V(0, SH - yE, -RUN).normalize(), WX, LEN, cut(WX), 3);
    tilePanel(B, TILE, V(X1 + OV, yE, Z0 - OV), V(-1, 0, 0), V(0, SH - yE, RUN).normalize(), WX, LEN, cut(WX), 3);
    tilePanel(B, TILE, V(X1 + OV, yE, Z1 + OV), V(0, 0, -1), V(-RUN, SH - yE, 0).normalize(), WZ, LEN, cut(WZ), 3);
    tilePanel(B, TILE, V(X0 - OV, yE, Z0 - OV), V(0, 0, 1), V(RUN, SH - yE, 0).normalize(), WZ, LEN, cut(WZ), 3);
    for (const [ex, ez, ix, iz] of [[X0 - OV, Z0 - OV, CX0, CZ0], [X1 + OV, Z0 - OV, CX1, CZ0], [X1 + OV, Z1 + OV, CX1, CZ1], [X0 - OV, Z1 + OV, CX0, CZ1]]) ridgeLine(B, TILE, V(ex, yE + 0.02, ez), V(ix, SH + 0.02, iz), 0.13);
    // 처마 밑 널(밑에서 올려다보이는 면)과 처마도리
    for (const [a, b, c, d] of [[X0 - OV, Z1, X1 + OV, Z1 + OV], [X0 - OV, Z0 - OV, X1 + OV, Z0], [X0 - OV, Z0, X0, Z1], [X1, Z0, X1 + OV, Z1]]) B.box(BEAM, a, yE - 0.1, b, c, yE - 0.02, d, false);
    B.box(BEAM, X0 - 0.06, LOW - 0.02, Z0 - 0.06, X1 + 0.06, LOW + 0.14, Z0 + T, false); B.box(BEAM, X0 - 0.06, LOW - 0.02, Z1 - T, X1 + 0.06, LOW + 0.14, Z1 + 0.06, false);
    B.box(BEAM, X0 - 0.06, LOW - 0.02, Z0, X0 + T, LOW + 0.14, Z1, false); B.box(BEAM, X1 - T, LOW - 0.02, Z0, X1 + 0.06, LOW + 0.14, Z1, false);
    addRoof(X0 - OV, Z0 - OV, X1 + OV, Z1 + OV, (x, z) => { const d = Math.max(CX0 - x, x - CX1, CZ0 - z, z - CZ1); return d <= 0 || d > RUN ? -Infinity : SH - slope * d + 0.14; });
    // 큰 지붕과 그 밑의 대들보
    hipRoof(B, TILE, CX0, CZ0, CX1, CZ1, TOP, 4.4, { over: 1.3, detail: 3 });
    B.box(CEIL, CX0 + T, TOP - 0.16, CZ0 + T, CX1 - T, TOP - 0.08, CZ1 - T, false);
    for (let z = CZ0 + 4; z < CZ1 - 0.01; z += 4) B.box(BEAM, CX0 + T, TOP - 0.56, z - 0.16, CX1 - T, TOP - 0.15, z + 0.16, false);
    for (let x = CX0 + 4; x < CX1 - 0.01; x += 4) B.box(BEAM, x - 0.1, TOP - 0.38, CZ0 + T, x + 0.1, TOP - 0.15, CZ1 - T, false);
    // 현관 지붕과 기둥, 문패
    gableRoof(B, TILE, MX - 3.2, Z1 + 0.3, MX + 3.2, Z1 + 3.6, 3.95, 1.5, { ridge: 'z', over: 0.5, overGable: 0.5, detail: 3, gable: WALLM });
    for (const x of [MX - 2.9, MX + 2.9]) { B.box(BEAM, x - 0.14, 0, Z1 + 3.16, x + 0.14, 3.95, Z1 + 3.44); B.box(STONE, x - 0.24, 0, Z1 + 3.06, x + 0.24, 0.2, Z1 + 3.54, false); B.box(BEAM, x - 0.1, 3.7, Z1, x + 0.1, 3.95, Z1 + 3.3, false); }
    B.box(BEAM, MX - 3.2, 3.7, Z1 + 3.2, MX + 3.2, 3.95, Z1 + 3.4, false);
    signBoard(B, '屋内演習場', MX, 4.25, Z1 + 3.46, 0, 3.0, 0.62, { both: false, depth: 0.07, bg: '#e9dcc0' });
    signBoard(B, '忍', MX, 8.2, CZ1 + 0.08, 0, 1.7, 1.7, { round: true, both: false, bg: '#efe3c2', color: '#1a1410', frame: RED, depth: 0.12, pad: 0.16 });

    // ---- 안: 대련 마루의 흰 금, 손 석상과 받침, 드림 글씨 ----
    for (const [a, b, c, d] of [[-6, -4, 6, -3.9], [-6, 3.9, 6, 4], [-6, -4, -5.9, 4], [5.9, -4, 6, 4], [-0.9, -0.5, -0.8, 0.5], [0.8, -0.5, 0.9, 0.5]]) B.box(WHT, MX + a, FL, -150.5 + b, MX + c, FL + 0.012, -150.5 + d, false);
    const DZ = CZ0 + 3.3;
    B.box(GREY, MX - 6.5, FL, DZ - 2.9, MX + 6.5, FL + 0.28, DZ + 2.9); B.box(GREY, MX - 5.6, FL + 0.28, DZ - 2.4, MX + 5.6, FL + 0.56, DZ + 2.4); B.box(GREY, MX - 4.6, FL + 0.56, DZ - 1.9, MX + 4.6, FL + 0.9, DZ + 1.9);
    sealHands(B, GREY, MX, FL + 0.9, DZ - 0.2, 1.5);
    addCollider(MX - 2.4, FL + 0.9, DZ - 1.5, MX + 2.4, FL + 6.4, DZ + 1.2); addCollider(MX - 0.7, FL + 6.4, DZ - 1.0, MX + 0.7, FL + 9.0, DZ + 0.2);
    signBoard(B, '印', MX, FL + 1.25, DZ + 1.93, 0, 0.5, 0.5, { both: false, depth: 0.04, bg: '#8f8d83', color: '#2a2925', frame: GREY });
    for (const [x, txt] of [[CX0 + 2, '心技体'], [CX1 - 2, '不撓不屈']]) signBoard(B, txt, x, FL + 3.6, CZ0 + 0.32, 0, 0.9, 3.4, { vertical: true, both: false, depth: 0.04, bg: '#f2ead6' });
    // 천장에서 늘인 오르기 밧줄 셋(매듭)
    for (let i = 0; i < 3; i++) { const x = CX1 - 2.2, z = -147.5 - i * 2.6; B.geo(STRAW, tube([V(x, TOP - 0.16, z), V(x + 0.02, 5, z), V(x, FL + 0.5, z + 0.02)], 0.03, 6, true)); for (let q = 0; q < 12; q++) B.geo(STRAW, new THREE.SphereGeometry(0.062, 8, 6), mat4(x + 0.01, FL + 0.9 + q * 0.7, z)); }
    // 서쪽 둘레 칸: 목검과 봉을 건 걸이 셋
    for (let i = 0; i < 3; i++) { const z0 = -162 + i * 6.5, x = X0 + T + 0.12;
      for (const z of [z0, z0 + 2.6]) B.box(BEAM, x - 0.1, FL, z - 0.04, x + 0.02, FL + 1.5, z + 0.04, false);
      for (let q = 0; q < 5; q++) { B.box(BEAM, x, FL + 0.3 + q * 0.26, z0 - 0.2, x + 0.16, FL + 0.33 + q * 0.26, z0 + 2.8, false); B.geo(q === 4 ? BEAM : LIGHT, tube([0, 1, 2, 3, 4, 5].map(u => V(x + 0.1, FL + 0.36 + q * 0.26 + (q === 4 ? 0 : 0.04 * Math.sin(u / 5 * PI)), z0 - 0.1 + u * 0.56)), t => (q === 4 ? 0.018 : 0.021 - 0.007 * t), 6)); }
      addCollider(x - 0.1, FL, z0 - 0.2, x + 0.2, FL + 1.6, z0 + 2.8);
    }
    // 동쪽 둘레 칸: 긴 걸상과 쌓아 둔 깔개, 볏짚 허수아비
    for (const z of [-162, -155, -148]) { B.box(LIGHT, X1 - T - 0.6, FL + 0.4, z - 1.6, X1 - T - 0.15, FL + 0.45, z + 1.6); for (const dz of [-1.4, 1.34]) B.box(LIGHT, X1 - T - 0.55, FL, z + dz, X1 - T - 0.2, FL + 0.4, z + dz + 0.06, false); }
    for (let q = 0; q < 6; q++) B.box(q % 2 ? mat('plain', 0x2d3f5e) : mat('plain', 0x3f6b4a), X0 + 1.2, FL + q * 0.09, Z1 - 3.2 + (q % 2) * 0.05, X0 + 3.0, FL + q * 0.09 + 0.085, Z1 - 1.4 + (q % 2) * 0.05, q === 0);
    { const ridged = (r, h, n) => { const p = []; for (let i = 0; i <= n * 3; i++) { const t = i / (n * 3); p.push(new THREE.Vector2(r * (0.93 + 0.07 * Math.abs(Math.sin(t * n * PI))) * (i === 0 || i === n * 3 ? 0.6 : 1), h * t)); } return new THREE.LatheGeometry(p, 10); };
      const gT = ridged(0.17, 0.7, 9), gA = alongX(ridged(0.06, 0.9, 12).translate(0, -0.45, 0)), gH = ridged(0.12, 0.26, 4);
      for (let i = 0; i < 4; i++) { const xx = X0 + 6 + i * 2.4, zz = Z0 + 2;
        B.box(BEAM, xx - 0.35, FL, zz - 0.05, xx + 0.35, FL + 0.08, zz + 0.05, false); B.box(BEAM, xx - 0.05, FL, zz - 0.35, xx + 0.05, FL + 0.08, zz + 0.35, false); B.box(BEAM, xx - 0.05, FL, zz - 0.05, xx + 0.05, FL + 1.5, zz + 0.05, false);
        B.geo(STRAW, gT, mat4(xx, FL + 0.65, zz)); B.geo(STRAW, gA, mat4(xx, FL + 1.22, zz)); B.geo(STRAW, gH, mat4(xx, FL + 1.42, zz)); addCollider(xx - 0.2, FL, zz - 0.2, xx + 0.2, FL + 1.7, zz + 0.2); } }
    // 등: 대들보 밑에 넷
    for (const [x, z] of [[MX - 6, -150], [MX + 6, -150], [MX - 6, -158], [MX + 6, -158]]) {
      B.geo(M.iron, tube([V(x, TOP - 0.16, z), V(x, TOP - 1.5, z)], 0.012, 5, false)); B.geo(mat('glow', 0xfff1d0, { power: 1.2 }), new THREE.SphereGeometry(0.2, 12, 8), mat4(x, TOP - 1.65, z));
      glows.push([x, TOP - 1.65, z, 1.0]); lights.push([x, TOP - 2.0, z, 18, 20]);
    }
    places.push({ n: '실내 훈련장', t: '비 오는 날이나 특별한 수련에 쓰는 마루 깐 훈련장. 안쪽에 인을 맺은 큰 손의 석상이 서 있다.', b: [X0, X1, Z0, Z1 + 3.6], y: [-1, 16] });
  }

  /* ================= 창설 기념비: 2대 호카게 센쥬 토비라마 ================= */
  {
    const [x, z] = CAMPUS.stone;
    B.box(STONE, x - 2.3, 0, z - 1.5, x + 2.3, 0.2, z + 1.5); B.box(STONE, x - 1.8, 0.2, z - 1.1, x + 1.8, 0.42, z + 1.1);
    const s = new THREE.Shape(); [[-1.15, 0], [1.2, 0], [1.3, 1.5], [1.08, 2.85], [0.56, 3.5], [-0.12, 3.7], [-0.78, 3.35], [-1.14, 2.45], [-1.27, 1.15]].forEach((p, i) => (i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])));
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.09, bevelSize: 0.09, bevelSegments: 2 }); g.translate(0, 0, -0.25);
    B.geo(mat('rock', 0x9d998c), g, mat4(x, 0.42, z)); addCollider(x - 1.4, 0.42, z - 0.36, x + 1.4, 4.1, z + 0.36);
    // 새긴 면: 센쥬 문장 아래 세로로 두 줄
    const face = textMat('  ', { w: 512, h: 1024, bg: '#33383a', color: '#33383a', draw: (c, w, h) => {
      c.strokeStyle = '#8f9a94'; c.lineWidth = 8; c.strokeRect(14, 14, w - 28, h - 28);
      senjuCrest(c, w / 2, 150, 96, '#d9d6c6');
      c.fillStyle = '#e8e4d2'; c.textAlign = 'center'; c.textBaseline = 'middle';
      const col = (txt, cx, y0, size) => { c.font = `900 ${size}px "Yu Mincho", "YuMincho", "MS Mincho", "Batang", serif`; [...txt].forEach((ch, i) => c.fillText(ch, cx, y0 + i * size * 1.06)); };
      col('忍者学校創設之碑', w * 0.62, 316, 82); col('二代目火影', w * 0.26, 430, 50); col('千手扉間', w * 0.26, 730, 62);
    } });
    B.geo(BEAM, new THREE.BoxGeometry(1.3, 2.52, 0.05), mat4(x + 0.02, 0.42 + 1.62, z + 0.355)); B.geo(face, new THREE.PlaneGeometry(1.2, 2.4), mat4(x + 0.02, 0.42 + 1.62, z + 0.384));
    // 앞의 돌 향로와 둘레의 낮은 돌기둥·쇠줄
    B.geo(GREY, new THREE.LatheGeometry([[0, 0], [0.22, 0], [0.26, 0.08], [0.14, 0.16], [0.14, 0.3], [0.3, 0.42], [0.33, 0.6], [0.28, 0.62], [0.25, 0.5], [0, 0.48]].map(p => new THREE.Vector2(p[0], p[1])), 14), mat4(x, 0.42, z + 0.78));
    const corner = [[-2.15, 1.35], [2.15, 1.35], [2.15, -1.35], [-2.15, -1.35]];
    for (const [dx, dz] of corner) { B.geo(GREY, cyl(0.09, 0.11, 0.62, 8), mat4(x + dx, 0.51, z + dz)); B.geo(GREY, new THREE.SphereGeometry(0.11, 10, 8), mat4(x + dx, 0.84, z + dz)); }
    for (const [i, j] of [[1, 2], [2, 3], [3, 0]]) { const a = corner[i], b = corner[j]; B.geo(M.iron, tube([0, 1, 2, 3, 4].map(q => V(x + a[0] + (b[0] - a[0]) * q / 4, 0.74 - 0.16 * Math.sin(q / 4 * PI), z + a[1] + (b[1] - a[1]) * q / 4)), 0.018, 6, false)); }
    places.push({ n: '아카데미 창설 기념비', t: '닌자를 길러 내는 틀을 세우려고 아카데미를 연 2대 호카게 센쥬 토비라마를 기리는 돌. 센쥬 문장 아래 "忍者学校創設之碑 — 二代目火影 千手扉間"이라 새겼다.', b: [x - 2.3, x + 2.3, z - 1.5, z + 3], y: [-1, 5] });
  }

  /* ================= 뒤뜰의 걸상과 터의 나무 ================= */
  bench(50, -131, 0); bench(86, -131, 0); bench(97.6, -112, PI / 2); bench(37.6, -84, PI / 2);
  {
    // 터의 테두리(배치도의 아카데미 터)를 교사 좌표로 옮겨, 그 안에서 지은 것들을 피해 심는다
    const cs = Math.cos(at.ry), sn = Math.sin(at.ry), toLocal = q => { const dx = q[0] - at.x, dz = q[1] - at.z; return [dx * cs - dz * sn + at.ox, dx * sn + dz * cs + at.oz]; };
    const zone = n => PLAN.zones.find(q => q.n === n).poly.map(toLocal), Z3 = zone(3), Z4 = zone(4);
    const inP = (x, z, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
    const edge = (x, z, P) => { let m = 1e9; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], vx = b[0] - a[0], vz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[1]) * vz) / (vx * vx + vz * vz))); m = Math.min(m, Math.hypot(x - a[0] - vx * t, z - a[1] - vz * t)); } return m; };
    const t = CAMPUS.track, free = (x, z) => inP(x, z, Z3) && edge(x, z, Z3) > 6 && !(inP(x, z, Z4) || edge(x, z, Z4) < 7) && !onDirt(x, z, 4) && trackD(x, z, 4) > 1
      && !(Math.abs(x - t.x) < 8 && z > t.z + t.b && z < t.z + t.b + 7) && !(x > 40 && x < 96 && z > -66 && z < -44);
    const xs = Z3.map(q => q[0]), zs = Z3.map(q => q[1]), box4 = [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
    // 가까운 곳은 드문드문, 터 뒤쪽(실내 훈련장 너머)은 작은 숲처럼 배게
    for (const [seed, n, gap, ok, hex] of [[61, 46, 12, (x, z) => free(x, z) && z > -176, 0x447f2e], [62, 60, 8.5, (x, z) => free(x, z) && z <= -176, 0x35702a], [63, 26, 15, (x, z) => free(x, z), 0x4f8a34]]) {
      const Rt = rng(seed * 977), tg = treeGeometry(seed, { height: 11 + (seed % 3) * 1.5, depth: 4, sprays: 5, leaves: 6, leafLen: 0.5 }), tm = []; let tries = 0;
      while (tm.length < n && tries++ < 6000) { const x = box4[0] + Rt() * (box4[2] - box4[0]), z = box4[1] + Rt() * (box4[3] - box4[1]); if (!ok(x, z) || trees.some(q => Math.hypot(q[0] - x, q[1] - z) < gap)) continue; tm.push([x, z]); trees.push([x, z]); addCollider(x - 0.5, 0, z - 0.5, x + 0.5, 6, z + 0.5); }
      const ms = tm.map(([x, z]) => mat4(x, 0, z, 0, Rt() * 6.28, 0, 0.85 + Rt() * 0.4));
      inst(tg.wood, mat('bark', 0x8a7257), ms); inst(tg.leaves, mat('leaf', hex), ms);
    }
    // 길가와 건물 모서리의 덤불
    const bg = bushGeometry(33, 1), bm = [];
    for (const [x, z] of [[59.2, -78.6], [63.8, -78.6], [50.5, -139], [85.5, -139], [98.2, -81], [98.2, -73], [38.5, -103], [38.5, -95]]) bm.push(mat4(x, 0, z, 0, R() * 6, 0, 0.8 + R() * 0.4));
    inst(bg.wood, mat('bark', 0x7a6248), bm); inst(bg.leaves, mat('leaf', 0x4a8a36), bm);
  }

  B.finish(holder);
  const res = settle(scene, holder, from, at, { places, glows, lights, jumps: [['제1 훈련장', 102.5, 0, -77, -PI / 2, 23], ['실내 훈련장', 68, 0, -133, 0, 24], ['아카데미 창설 기념비', 61.5, 0, -75, 0, 25]] });
  // 흙을 깐 자리에는 풀포기가 나지 않는다(마을 좌표로 물어 오므로 교사 좌표로 바꿔 본다)
  { const cs = Math.cos(at.ry), sn = Math.sin(at.ry); BARE.push((x, z) => { const dx = x - at.x, dz = z - at.z; if (Math.abs(dx) > 220 || Math.abs(dz) > 220) return false; return onDirt(dx * cs - dz * sn + at.ox, dx * sn + dz * cs + at.oz, 0.4); }); }
  out.places.push(...res.places); out.jumps.push(...res.jumps); out.glows.push(...res.glows); out.lights.push(...res.lights);
}
const trees = [];   // 터에 심은 나무의 자리(서로 너무 붙지 않게)

// 나뭇잎 문장은 build.js의 것을 쓴다(여기서 내보내던 이름을 그대로 넘겨준다)
export { leafMark };
