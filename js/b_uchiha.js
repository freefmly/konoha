// 우치하 일족의 구역 — 마을 동쪽 끝, 담으로 두른 거리. 부채 문장이 걸린 대문과 거리의 집들, 사스케의 집(안에 들어갈 수 있다),
// 남가 신사(본당 다다미 밑 비밀 집회장), 호화구를 익히던 못가 선착장.
// 대문은 서쪽(동쪽 골목이 끝나는 자리), 큰길이 동쪽으로 뻗어 사스케네 대문에 닿고, 남북 길이 신사와 못을 잇는다.
import * as THREE from '../vendor/three.module.js';
import { Builder, wall, stairs, tube, mergeGeos, mat4, rng, addCollider } from './build.js';
import { mat, M, textMat } from './materials.js';
import { gableRoof, hipRoof, tilePanel, beamBetween, windowUnit, doorUnit, railing, signBoard, lantern } from './arch.js';
import { treeGeometry, bushGeometry } from './flora.js';
import { boxHouse, makeKit } from './town.js';
import { UCHIHA } from './layout.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z), PI = Math.PI;
const op = (u0, u1, y0, y1) => ({ u0, u1, ys: [[y0, y1]] });
const cyl = (rt, rb, h, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg);
let C;   // 재질표 — build()에서 채운다

function palette() {
  const p = (c, o = {}) => mat('plain', c, Object.assign({ rough: 0.92 }, o));
  return {
    wall: mat('plaster', 0xefe8d8), tile: mat('tile', 0x39465a), dark: mat('planks', 0x4a3324), shrine: mat('planks', 0x6e4c34),
    navy: p(0x26304e), zab: p(0x39465a), zabR: p(0x8a2f2a), futon: p(0xe9e4d6), quilt: p(0x2f4a7a), rope: p(0xcdb47a), torii: p(0xb5352a, { rough: 0.7 }),
    porcelain: p(0xf2efe6, { rough: 0.35 }), pot: p(0x3b3b40, { rough: 0.6, metal: 0.4 }), steel: mat('metal', 0x7d848c, { rough: 0.35 }),
    slab: mat('stone', 0x8d8a84), glow: mat('glow', 0xffc878, { power: 1.4 }), paper: mat('paper', 0xf3ecd9),
    green: [mat('leaf', 0x2f6328), mat('leaf', 0x3f7a30)], bark: mat('bark', 0x7a6248),
    books: [p(0x7a2f2a), p(0x2f4a7a), p(0x3f6b46), p(0xb98a3c)],
  };
}

/* ---------- 우치하 문장(부채): 붉은 부채살과 흰 아랫단·자루 ---------- */
function drawCrest(g, cx, cy, r, crack) {
  g.lineWidth = r * 0.07; g.strokeStyle = '#1a1410'; g.lineJoin = 'round';
  g.fillStyle = '#f4f0e6'; g.beginPath(); g.rect(cx - r * 0.17, cy + r * 0.8, r * 0.34, r * 0.72); g.fill(); g.stroke();   // 자루
  g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
  g.save(); g.beginPath(); g.arc(cx, cy, r, 0, 7); g.clip();
  g.fillStyle = '#c4261d'; g.beginPath();
  g.moveTo(cx - r - 2, cy - r - 2); g.lineTo(cx + r + 2, cy - r - 2); g.lineTo(cx + r + 2, cy + r * 0.22);
  g.quadraticCurveTo(cx, cy + r * 0.82, cx - r - 2, cy + r * 0.22); g.closePath(); g.fill();
  g.restore();
  g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke();
  if (crack) {   // 수리검에 맞아 금이 간 문장
    g.strokeStyle = '#15100c'; g.lineWidth = r * 0.035;
    const ox = cx + r * 0.1, oy = cy - r * 0.15;
    for (const [a, l, k] of [[0.3, 1.0, 0.25], [1.5, 0.9, -0.2], [2.6, 1.05, 0.2], [3.7, 0.8, -0.25], [4.6, 1.0, 0.18], [5.5, 0.75, -0.15]]) {
      g.beginPath(); g.moveTo(ox, oy);
      g.lineTo(ox + Math.cos(a + k) * r * l * 0.45, oy + Math.sin(a + k) * r * l * 0.45); g.lineTo(ox + Math.cos(a) * r * l, oy + Math.sin(a) * r * l); g.stroke();
    }
  }
}
// 글자 칸에 빈칸 수를 달리 넣어 금 간 것과 성한 것이 서로 다른 재질로 기억되게 한다
const crestMat = (bg, crack = false) => textMat(crack ? '  ' : ' ', { w: 256, h: 256, bg, color: bg, draw: (g, w, h) => drawCrest(g, w / 2, h * 0.42, w * 0.31, crack) });
// 둥근 문장판. ry = 판이 보는 방향(0이면 +z)
function crestPlaque(B, x, y, z, ry, r, bg = '#efe8d8', crack = false) {
  B.geo(M.beam, cyl(r + 0.05, r + 0.05, 0.04, 32).rotateX(PI / 2), mat4(x, y, z, 0, ry, 0));
  B.geo(crestMat(bg, crack), new THREE.CircleGeometry(r, 32), mat4(x + Math.sin(ry) * 0.028, y, z + Math.cos(ry) * 0.028, 0, ry, 0));
}
// 쿠나이: 날 끝이 +y
const kunaiGeo = () => mergeGeos([[new THREE.ConeGeometry(0.03, 0.15, 4), mat4(0, 0.075, 0)], [cyl(0.009, 0.009, 0.1, 6), mat4(0, -0.05, 0)],
  [new THREE.TorusGeometry(0.02, 0.005, 5, 10), mat4(0, -0.12, 0)]]);

/* ---------- 기와를 얹은 담 ----------
   axis 'x' = x 방향으로 뻗은 담(가운데선 z = c). 양쪽으로 흘러내리는 기와 두 면과 용마루. */
function capWall(B, axis, c, a0, a1, h, t = 0.5) {
  if (axis === 'x') { B.box(C.wall, a0, 0, c - t / 2, a1, h, c + t / 2); B.box(M.stone, a0, 0, c - t / 2 - 0.05, a1, 0.5, c + t / 2 + 0.05, false); }
  else { B.box(C.wall, c - t / 2, 0, a0, c + t / 2, h, a1); B.box(M.stone, c - t / 2 - 0.05, 0, a0, c + t / 2 + 0.05, 0.5, a1, false); }
  const ov = t / 2 + 0.24, rise = 0.3, len = Math.hypot(ov, rise), w = a1 - a0;
  for (const s of [1, -1]) {
    const Vv = (axis === 'x' ? V3(0, rise, -s * ov) : V3(-s * ov, rise, 0)).normalize();
    let U = axis === 'x' ? V3(1, 0, 0) : V3(0, 0, 1), o = axis === 'x' ? V3(a0, h + 0.03, c + s * ov) : V3(c + s * ov, h + 0.03, a0);
    if (new THREE.Vector3().crossVectors(U, Vv).y < 0) { U = U.negate(); o = axis === 'x' ? V3(a1, h + 0.03, c + s * ov) : V3(c + s * ov, h + 0.03, a1); }
    tilePanel(B, C.tile, o, U, Vv, w, len, null, 2, false);
  }
  // 처마 밑널(밑에서 올려다볼 때 기와 뒷면이 비지 않게)과 용마루
  if (axis === 'x') { B.box(M.beam, a0, h - 0.03, c - ov, a1, h + 0.02, c + ov, false); B.box(C.tile, a0, h + rise - 0.02, c - 0.09, a1, h + rise + 0.12, c + 0.09, false); }
  else { B.box(M.beam, c - ov, h - 0.03, a0, c + ov, h + 0.02, a1, false); B.box(C.tile, c - 0.09, h + rise - 0.02, a0, c + 0.09, h + rise + 0.12, a1, false); }
}

/* ---------- 장지문 한 짝 ----------
   axis 'x' = x 방향으로 선 문짝(면이 z = f). 나무 울거미와 살, 창호지. */
function shoji(B, axis, f, a, b, y0, y1, cols = 3, rows = 5) {
  const bx = (m, u0, u1, ya, yb, p0, p1, col = false) => (axis === 'x' ? B.box(m, u0, ya, p0, u1, yb, p1, col) : B.box(m, p0, ya, u0, p1, yb, u1, col));
  const m = M.beamLight, p0 = f - 0.018, p1 = f + 0.018;
  bx(m, a, b, y0, y0 + 0.09, p0, p1); bx(m, a, b, y1 - 0.06, y1, p0, p1); bx(m, a, a + 0.05, y0, y1, p0, p1); bx(m, b - 0.05, b, y0, y1, p0, p1);
  for (let i = 1; i < cols; i++) { const u = a + (b - a) * i / cols; bx(m, u - 0.009, u + 0.009, y0, y1, f - 0.012, f + 0.012); }
  for (let j = 1; j < rows; j++) { const y = y0 + (y1 - y0) * j / rows; bx(m, a, b, y - 0.009, y + 0.009, f - 0.012, f + 0.012); }
  bx(M.shoji, a + 0.02, b - 0.02, y0 + 0.02, y1 - 0.02, f - 0.004, f + 0.004, true);
}

// 방석
const zabuton = (B, m, x, y, z) => B.box(m, x - 0.26, y, z - 0.26, x + 0.26, y + 0.06, z + 0.26, false);
// 낮은 상(다리 넷)
function lowTable(B, x0, z0, x1, z1, y, h = 0.34, m = M.beam) {
  B.box(m, x0, y + h - 0.05, z0, x1, y + h, z1);
  for (const [x, z] of [[x0 + 0.05, z0 + 0.05], [x1 - 0.12, z0 + 0.05], [x0 + 0.05, z1 - 0.12], [x1 - 0.12, z1 - 0.12]]) B.box(m, x, y, z, x + 0.07, y + h - 0.05, z + 0.07, false);
}
// 서랍장(단스): 앞이 fz 쪽(+1 남 / -1 북) 또는 fx 쪽
function tansu(B, x0, z0, x1, z1, y, h, rows, front) {
  B.box(M.beam, x0, y, z0, x1, y + h, z1);
  for (let i = 0; i < rows; i++) {
    const ya = y + 0.06 + (h - 0.1) * i / rows, yb = y + 0.02 + (h - 0.1) * (i + 1) / rows;
    if (front === 'w') { B.box(M.beamLight, x0 - 0.012, ya, z0 + 0.04, x0, yb, z1 - 0.04, false); B.box(M.iron, x0 - 0.03, (ya + yb) / 2 - 0.012, (z0 + z1) / 2 - 0.07, x0 - 0.012, (ya + yb) / 2 + 0.012, (z0 + z1) / 2 + 0.07, false); }
    else { const f = front === 's' ? z1 : z0, d = front === 's' ? 1 : -1; B.box(M.beamLight, x0 + 0.04, ya, Math.min(f, f + d * 0.012), x1 - 0.04, yb, Math.max(f, f + d * 0.012), false); B.box(M.iron, (x0 + x1) / 2 - 0.07, (ya + yb) / 2 - 0.012, Math.min(f + d * 0.012, f + d * 0.03), (x0 + x1) / 2 + 0.07, (ya + yb) / 2 + 0.012, Math.max(f + d * 0.012, f + d * 0.03), false); }
  }
}
// 천장에 매단 종이 등
function paperLamp(B, x, yCeil, z, out, power = 10) {
  B.geo(M.iron, tube([V3(x, yCeil, z), V3(x, yCeil - 0.3, z)], 0.006, 4, false));
  lantern(B, x, yCeil - 0.52, z, { color: 0xf3e6c4, r: 0.17, h: 0.32 });
  out.glows.push([x, yCeil - 0.52, z, 0.9]); out.lights.push([x, yCeil - 0.6, z, power, 12]);
}
// 돌등롱
function stoneLantern(B, x, z, y = 0) {
  B.geo(M.stone, cyl(0.26, 0.32, 0.18, 6), mat4(x, y + 0.09, z)); B.geo(M.stone, cyl(0.1, 0.12, 0.75, 6), mat4(x, y + 0.55, z));
  B.geo(M.stone, cyl(0.24, 0.14, 0.12, 6), mat4(x, y + 0.98, z)); B.box(M.stone, x - 0.17, y + 1.04, z - 0.17, x + 0.17, y + 1.36, z + 0.17, false);
  B.box(C.glow, x - 0.175, y + 1.12, z - 0.08, x + 0.175, y + 1.28, z + 0.08, false); B.box(C.glow, x - 0.08, y + 1.12, z - 0.175, x + 0.08, y + 1.28, z + 0.175, false);
  B.geo(M.stone, new THREE.ConeGeometry(0.4, 0.3, 6), mat4(x, y + 1.51, z)); B.geo(M.stone, new THREE.SphereGeometry(0.07, 8, 6), mat4(x, y + 1.7, z));
  addCollider(x - 0.25, y, z - 0.25, x + 0.25, y + 1.6, z + 0.25);
}
// 지붕 얹은 대문(담 사이에 낀다). axis 'z' = 담이 z 방향으로 서 있고 문은 x 방향으로 지나간다.
function roofedGate(B, x, z0, z1, h, post = 0.3) {
  for (const z of [z0, z1]) B.box(M.beam, x - post / 2, 0, z - post / 2, x + post / 2, h, z + post / 2);
  B.box(M.beam, x - post / 2 + 0.02, h - 0.34, z0, x + post / 2 - 0.02, h - 0.06, z1, false);
  gableRoof(B, C.tile, x - 0.45, z0 - 0.35, x + 0.45, z1 + 0.35, h, 0.55, { ridge: 'z', over: 0.75, overGable: 0.4 });
}

/* ============================ 담과 대문, 거리 ============================ */
function district(B, K, R, out) {
  const { x0, x1, z0, z1, gateZ } = UCHIHA, H = 3.0, g0 = gateZ - 3, g1 = gateZ + 3;
  capWall(B, 'z', x0 + 0.25, z0, g0 - 0.2, H); capWall(B, 'z', x0 + 0.25, g1 + 0.2, z1, H);
  capWall(B, 'x', z0 + 0.25, x0 + 0.5, x1 - 0.5, H); capWall(B, 'x', z1 - 0.25, x0 + 0.5, x1 - 0.5, H); capWall(B, 'z', x1 - 0.25, z0, z1, H);
  // 대문: 굵은 기둥 둘, 인방, 맞배지붕. 인방에는 문장을 물들인 남색 막이 드리워 있다(지나다닐 수 있다)
  const gx = x0 + 0.25;
  for (const z of [g0, g1]) { B.box(M.beam, gx - 0.28, 0, z - 0.28, gx + 0.28, 4.6, z + 0.28); B.box(M.stone, gx - 0.36, 0, z - 0.36, gx + 0.36, 0.5, z + 0.36, false); }
  B.box(M.beam, gx - 0.2, 4.05, g0, gx + 0.2, 4.4, g1, false);
  gableRoof(B, C.tile, gx - 0.7, g0 - 0.6, gx + 0.7, g1 + 0.6, 4.6, 0.8, { ridge: 'z', over: 1.0, overGable: 0.5 });
  const curtain = textMat(' ', { w: 1024, h: 256, bg: '#1c2440', color: '#1c2440', draw: (g, w, h) => { for (const k of [0.2, 0.5, 0.8]) drawCrest(g, w * k, h * 0.42, h * 0.3, false); } }, 'cloth');
  B.geo(curtain, new THREE.PlaneGeometry(5.4, 1.35, 18, 6), mat4(gx, 4.05 - 0.675, gateZ, 0, -PI / 2, 0));
  signBoard(B, 'うちは', gx - 0.3, 4.95, gateZ, -PI / 2, 2.0, 0.6, { both: false });

  // 거리의 집들(겉모습만): 흰 벽·검푸른 기와, 벽마다 문장
  const houses = [
    { r: [122, -19.5, 130.5, -9.2], front: 's', floors: 2, shop: null }, { r: [132.4, -19.5, 140.6, -9.2], front: 's', floors: 1, shop: 'せんべい' },
    { r: [122, 1.2, 131, 11.4], front: 'n', floors: 1, shop: null }, { r: [132.8, 1.2, 140.6, 11], front: 'n', floors: 2, shop: '茶' },
    { r: [132.5, -34, 140.6, -25], front: 'e', floors: 1, shop: null }, { r: [132.5, 17, 140.6, 26], front: 'e', floors: 2, shop: null },
  ];
  houses.forEach((h, i) => {
    const s = { x0: h.r[0], z0: h.r[1], x1: h.r[2], z1: h.r[3], front: h.front, floors: h.floors, wall: 5, roof: 3, roofKind: i % 3 === 2 ? 'hip' : 'gable', shop: h.shop, near: true };
    boxHouse(B, K, s, rng(9100 + i), out.glows);
    const y = h.floors * 3.0 - 0.55;
    if (h.front === 's') crestPlaque(B, s.x0 + 1.0, y, s.z1 + 0.03, 0, 0.36);
    else if (h.front === 'n') crestPlaque(B, s.x1 - 1.0, y, s.z0 - 0.03, PI, 0.36);
    else crestPlaque(B, s.x1 + 0.03, y, s.z0 + 1.0, PI / 2, 0.36);
  });
  // 길가 등롱 기둥
  for (const [x, z, s] of [[124, -7.4, 1], [136, -7.4, 1], [130, -0.6, -1], [141, -0.6, -1], [146.4, -18, 0], [146.4, 10, 0]]) {
    B.box(M.beam, x - 0.06, 0, z - 0.06, x + 0.06, 2.9, z + 0.06, false); addCollider(x - 0.1, 0, z - 0.1, x + 0.1, 2.9, z + 0.1);
    const dx = s === 0 ? -0.45 : 0, dz = s === 0 ? 0 : s * 0.45;
    B.box(M.beam, Math.min(x, x + dx) - 0.03, 2.7, Math.min(z, z + dz) - 0.03, Math.max(x, x + dx) + 0.03, 2.76, Math.max(z, z + dz) + 0.03, false);
    out.glows.push(lantern(B, x + dx, 2.2, z + dz, { color: 0xf0e2c0, r: 0.17, h: 0.44 }));
  }
}

/* ============================ 사스케의 집 ============================
   집터 x 148.5~167.5, z -20~12(담), 서쪽 대문이 큰길 끝을 본다. 집채는 단층 우진각 기와집(x 153~165, z -16~5).
   가운데 남북 복도를 두고 서쪽에 부엌·광·현관·사스케의 방, 동쪽에 차노마(밥 먹는 방)·큰 마루방·이타치의 방, 남쪽은 뜰을 보는 툇마루. */
function sasukeHouse(B, out) {
  const X0 = 153, X1 = 165, Z0 = -16, Z1 = 5, EZ = 3.2, F = 0.45, CE = 2.95, TOP = 3.05, T = 0.18, DY = 2.45;
  const KW = 156.38, KE = 156.5, LW = 158, LE = 158.12;   // 복도 서벽·동벽의 두 면

  // 집터 담과 대문, 문장이 줄지어 그려진 서쪽 담(하나는 쿠나이가 박혀 금이 가 있다)
  const WX = 148.5, WN = -20, WS = 12, WE = 167.5, WH = 2.2, gz0 = -5.6, gz1 = -2.4;
  capWall(B, 'z', WX, WN, gz0 - 0.15, WH, 0.36); capWall(B, 'z', WX, gz1 + 0.15, WS, WH, 0.36);
  capWall(B, 'x', WN, WX + 0.18, WE - 0.18, WH, 0.36); capWall(B, 'x', WS, WX + 0.18, WE - 0.18, WH, 0.36); capWall(B, 'z', WE, WN, WS, WH, 0.36);
  roofedGate(B, WX, gz0, gz1, 2.95);
  for (const [z, s] of [[gz0 + 0.15, -1], [gz1 - 0.15, 1]]) B.box(C.dark, WX + 0.2, 0.1, Math.min(z, z + s * 0.05), WX + 1.6, 2.5, Math.max(z, z + s * 0.05));   // 안으로 열어 둔 문짝
  [-18, -15.6, -13.2, -10.8, -8.4].forEach((z, i) => crestPlaque(B, WX - 0.21, 1.3, z, -PI / 2, 0.52, '#efe8d8', i === 2));
  B.geo(C.steel, kunaiGeo(), mat4(WX - 0.33, 1.42, -13.15, 0, 0, -PI / 2 - 0.12, 1.3));
  // 대문에서 현관까지 디딤돌
  for (let i = 0; i < 5; i++) B.geo(M.stone, cyl(0.42, 0.46, 0.06, 9), mat4(149.4 + i * 0.62, 0.03, -4.05 - i * 0.07 + (i % 2) * 0.12, 0, i * 0.8, 0));

  /* --- 바깥벽과 창 --- */
  wall(B, C.wall, 'x', Z0, Z0 + T, X0, X1, 0, TOP, [op(154, 155.8, 1.5, 2.4), op(160, 163, 1.35, 2.45)]);
  windowUnit(B, 'x', Z0, Z0 + T, 154, 155.8, 1.5, 2.4, { out: -1 }); windowUnit(B, 'x', Z0, Z0 + T, 160, 163, 1.35, 2.45, { out: -1, nx: 3 });
  wall(B, C.wall, 'z', X0, X0 + T, Z0 + T, EZ, 0, TOP, [op(-14.6, -12.4, 1.5, 2.4), op(-5.4, -3.6, 0.12, 2.4), op(0.2, 2.0, 1.3, 2.4)]);
  windowUnit(B, 'z', X0, X0 + T, -14.6, -12.4, 1.5, 2.4, { out: -1 }); windowUnit(B, 'z', X0, X0 + T, 0.2, 2.0, 1.3, 2.4, { out: -1, paper: true, nx: 3, ny: 3 });
  doorUnit(B, 'z', X0, X0 + T, -5.4, -3.6, 0.12, 2.4, { leaf: 'slide', inward: 1, paper: true });
  wall(B, C.wall, 'z', X1 - T, X1, Z0 + T, EZ, 0, TOP, [op(-14.5, -11.5, 1.35, 2.45), op(-8.2, -5.4, 1.35, 2.45), op(-1.6, 1.4, 1.35, 2.45)]);
  for (const [a, b] of [[-14.5, -11.5], [-8.2, -5.4], [-1.6, 1.4]]) windowUnit(B, 'z', X1 - T, X1, a, b, 1.35, 2.45, { out: 1, nx: 3 });
  // 툇마루 쪽 벽: 장지문을 반쯤 열어 두었다
  wall(B, C.wall, 'x', EZ - T, EZ, X0 + T, X1 - T, F, TOP, [op(153.8, 155.8, F, DY), op(156.6, 157.9, F, DY), op(159.4, 163.4, F, DY)]);
  for (const [a, b] of [[153.8, 155.8], [156.6, 157.9], [159.4, 163.4]]) doorUnit(B, 'x', EZ - T, EZ, a, b, F, DY, { leaf: null });
  const sf = EZ - T / 2;
  shoji(B, 'x', sf, 153.8, 154.8, F, DY); shoji(B, 'x', sf + 0.05, 153.85, 154.85, F, DY);
  shoji(B, 'x', sf, 159.4, 160.4, F, DY); shoji(B, 'x', sf + 0.05, 159.5, 160.5, F, DY); shoji(B, 'x', sf, 162.4, 163.4, F, DY); shoji(B, 'x', sf + 0.05, 162.3, 163.3, F, DY);
  // 모서리 기둥·도리·돌 기단
  for (const [x, sx] of [[X0, -1], [X1, 1]]) for (const [z, sz] of [[Z0, -1], [EZ, 1]]) B.box(M.beam, x + sx * 0.035, 0, z + sz * 0.035, x - sx * 0.16, TOP, z - sz * 0.16, false);
  B.box(M.beam, X0 - 0.035, TOP - 0.2, Z0 - 0.035, X1 + 0.035, TOP - 0.03, Z0, false); B.box(M.beam, X0 - 0.035, TOP - 0.2, Z0, X0, TOP - 0.03, EZ, false); B.box(M.beam, X1, TOP - 0.2, Z0, X1 + 0.035, TOP - 0.03, EZ, false);
  B.box(M.stone, X0 - 0.05, 0, Z0 - 0.05, X1 + 0.05, 0.4, Z0, false); B.box(M.stone, X1, 0, Z0, X1 + 0.05, 0.4, EZ, false);
  B.box(M.stone, X0 - 0.05, 0, Z0, X0, 0.4, -5.5, false); B.box(M.stone, X0 - 0.05, 0, -3.5, X0, 0.4, EZ, false);
  hipRoof(B, C.tile, X0, Z0, X1, Z1, TOP, 2.7, { over: 1.1 });

  /* --- 바닥과 천장 --- */
  B.box(M.floor, X0 + T, 0, Z0 + T, X1 - T, F, -6.8);
  B.box(M.floor, 155.4, 0, -6.8, X1 - T, F, -1.2);
  B.box(M.floor, X0 + T, 0, -1.2, X1 - T, F, EZ);
  B.box(M.floor, X0, 0, EZ, X1, F, Z1);                                           // 툇마루
  B.box(M.pave, X0 + T, 0, -6.8, 155.4, 0.12, -1.2);                              // 현관 바닥(신을 벗는 낮은 자리)
  B.box(M.beam, 155.02, 0.12, -6.78, 155.43, 0.3, -1.22);                         // 올라서는 디딤널
  B.box(M.beamLight, X0 + T, CE, Z0 + T, X1 - T, TOP, EZ - T);
  B.box(M.tatami, LE, F, Z0 + T, X1 - T, F + 0.02, -10, false);                   // 차노마
  B.box(M.floorDark, LE, F, -9.88, X1 - T, F + 0.015, -3.5, false);               // 큰 마루방
  B.box(M.tatami, LE, F, -3.38, X1 - T, F + 0.02, EZ - T, false);                 // 이타치의 방
  B.box(M.tatami, X0 + T, F, -1.08, KW, F + 0.02, EZ - T, false);                 // 사스케의 방

  /* --- 칸막이 --- */
  wall(B, M.white, 'z', KW, KE, Z0 + T, EZ - T, F, CE, [op(-13.7, -12.5, F, DY), op(-6.68, -1.32, F, 2.6), op(-0.4, 0.8, F, DY)]);
  wall(B, M.white, 'z', LW, LE, Z0 + T, EZ - T, F, CE, [op(-14.2, -11.6, F, DY), op(-7.6, -5.9, F, 2.5), op(-1.9, -0.7, F, DY)]);
  for (const z of [-10.5, -6.8, -1.2]) wall(B, M.white, 'x', z, z + 0.12, X0 + T, KW, F, CE);
  for (const z of [-10, -3.5]) wall(B, M.white, 'x', z, z + 0.12, LE, X1 - T, F, CE);
  doorUnit(B, 'z', KW, KE, -13.7, -12.5, F, DY, { leaf: null }); doorUnit(B, 'z', KW, KE, -0.4, 0.8, F, DY, { leaf: null }); doorUnit(B, 'z', KW, KE, -6.68, -1.32, F, 2.6, { leaf: null });
  doorUnit(B, 'z', LW, LE, -14.2, -11.6, F, DY, { leaf: null }); doorUnit(B, 'z', LW, LE, -1.9, -0.7, F, DY, { leaf: null }); doorUnit(B, 'z', LW, LE, -7.6, -5.9, F, 2.5, { leaf: null });
  shoji(B, 'z', KE + 0.03, -9.4, -8.2, F, DY, 2, 1);                               // 광으로 가는 닫힌 미닫이
  shoji(B, 'z', LE + 0.04, -11.56, -10.3, F, DY); shoji(B, 'z', KW - 0.04, 0.84, 2.0, F, DY);   // 밀어 둔 장지문
  // 큰 마루방의 두 짝 여닫이(안으로 활짝 열려 있다) — 그날 밤 사스케가 밀고 들어선 문
  for (const [z, s] of [[-7.6, -1], [-5.9, 1]]) { B.box(C.dark, LE, F, Math.min(z, z + s * 0.045), LE + 0.84, 2.48, Math.max(z, z + s * 0.045)); B.box(M.iron, LE + 0.7, F + 1.0, Math.min(z - s * 0.02, z - s * 0.005), LE + 0.76, F + 1.16, Math.max(z - s * 0.02, z - s * 0.005), false); }

  /* --- 현관: 미닫이 밖 눈썹지붕과 디딤돌, 안에는 신발장과 벗어 둔 신 --- */
  tilePanel(B, C.tile, V3(151.85, 2.55, -6.1), V3(0, 0, 1), V3(1.15, 0.4, 0).normalize(), 3.2, Math.hypot(1.15, 0.4));
  beamBetween(B, M.beam, V3(151.85, 2.5, -4.5), V3(153, 2.9, -4.5), 3.2, 0.04);
  for (const z of [-5.95, -3.05]) { B.box(M.beam, 151.95, 0, z - 0.06, 152.07, 2.5, z + 0.06, false); addCollider(151.93, 0, z - 0.08, 152.09, 2.5, z + 0.08); }
  B.box(M.beam, 151.9, 2.44, -6.1, 152.02, 2.56, -2.9, false);
  B.box(M.pave, 151.9, 0, -5.8, X0, 0.12, -3.2);
  crestPlaque(B, X0 - 0.03, 1.85, -2.5, -PI / 2, 0.34);
  B.box(M.beamLight, 153.3, 0.12, -6.72, 154.9, 1.0, -6.36);                       // 신발장
  for (const x of [153.7, 154.1, 154.5]) B.box(M.beam, x - 0.006, 0.18, -6.37, x + 0.006, 0.96, -6.352, false);
  B.put(M.white, new THREE.SphereGeometry(0.11, 12, 8), 154.3, 1.1, -6.55, 0, [1, 1.25, 1]); B.put(C.green[1], bushGeometry(3, 0.25).leaves, 154.3, 1.22, -6.55);
  for (const [x, z, r] of [[154.55, -3.3, 0.2], [154.7, -3.32, 0.1], [154.2, -2.2, 1.4], [154.24, -2.02, 1.5]]) B.geo(C.navy, new THREE.BoxGeometry(0.1, 0.035, 0.25), mat4(x, 0.14, z, 0, r, 0));

  /* --- 부엌 --- */
  B.box(M.beamLight, 153.3, F, -15.72, 156.25, F + 0.8, -15.12); B.box(M.concrete, 153.26, F + 0.8, -15.74, 156.29, F + 0.85, -15.06, false);
  for (const x of [154.05, 154.8, 155.55]) B.box(M.beam, x - 0.006, F + 0.06, -15.125, x + 0.006, F + 0.76, -15.108, false);
  B.box(C.steel, 153.5, F + 0.852, -15.6, 154.25, F + 0.862, -15.2, false);          // 개수대
  B.geo(C.steel, tube([V3(153.87, F + 0.86, -15.62), V3(153.87, F + 1.1, -15.62), V3(153.87, F + 1.12, -15.48)], 0.012, 6, false));
  B.geo(C.pot, cyl(0.15, 0.13, 0.16, 14), mat4(155.6, F + 0.93, -15.42)); B.geo(C.pot, cyl(0.16, 0.16, 0.02, 14), mat4(155.6, F + 1.02, -15.42)); B.geo(M.beam, new THREE.SphereGeometry(0.025, 8, 6), mat4(155.6, F + 1.05, -15.42));
  B.geo(C.pot, cyl(0.17, 0.17, 0.02, 14), mat4(155.0, F + 0.87, -15.42)); B.geo(M.beam, new THREE.BoxGeometry(0.24, 0.02, 0.03), mat4(155.24, F + 0.89, -15.42));   // 프라이팬
  B.box(M.beamLight, 153.2, F + 1.5, -11.9, 153.5, F + 1.54, -10.7, false);         // 그릇 선반
  for (let i = 0; i < 4; i++) B.geo(C.porcelain, cyl(0.07, 0.04, 0.06, 12), mat4(153.35, F + 1.57, -11.75 + i * 0.3));
  B.geo(M.beamLight, cyl(0.2, 0.18, 0.3, 14), mat4(155.9, F + 0.15, -11.0)); B.geo(M.beam, cyl(0.21, 0.21, 0.025, 14), mat4(155.9, F + 0.31, -11.0));          // 쌀통
  tansu(B, 153.24, -10.95, 154.6, -10.56, F, 1.7, 4, 'n');                          // 찬장
  paperLamp(B, 154.8, CE, -13.0, out, 8);

  /* --- 차노마: 낮은 상에 둘러앉는 방석 넷, 찻주전자와 찻잔 --- */
  lowTable(B, 160.6, -13.7, 162.5, -12.5, F + 0.02);
  for (const [x, z] of [[161.1, -14.2], [162.0, -14.2], [161.1, -12.0], [162.0, -12.0]]) zabuton(B, C.zab, x, F + 0.02, z);
  B.geo(C.pot, new THREE.SphereGeometry(0.08, 12, 8), mat4(161.55, F + 0.43, -13.1, 0, 0, 0, [1, 0.8, 1])); B.geo(C.pot, tube([V3(161.62, F + 0.43, -13.1), V3(161.7, F + 0.48, -13.1)], 0.012, 5, false));
  for (const [x, z] of [[161.1, -13.45], [162.0, -13.45], [161.1, -12.75], [162.0, -12.75]]) B.geo(C.porcelain, cyl(0.035, 0.028, 0.06, 10), mat4(x, F + 0.39, z));
  tansu(B, 164.25, -11.6, 164.78, -10.2, F + 0.02, 1.25, 4, 'w');
  B.geo(C.porcelain, cyl(0.05, 0.07, 0.2, 12), mat4(164.5, F + 1.37, -10.9)); B.put(C.green[1], bushGeometry(5, 0.3).leaves, 164.5, F + 1.47, -10.9);
  { const m = mat4(161.5, F + 1.45, -10.02, 0, PI, 0);   // 족자
    B.geo(C.navy, new THREE.BoxGeometry(0.54, 1.5, 0.008), m); B.geo(textMat('家内安全', { w: 128, h: 384, bg: '#efe6cf', vertical: true, pad: 0.14 }), new THREE.PlaneGeometry(0.42, 1.2), m.clone().multiply(mat4(0, 0, 0.0065))); }
  paperLamp(B, 161.5, CE, -13.0, out, 11);

  /* --- 큰 마루방: 넓은 널마루에 문장 하나, 칼걸이. 일족의 일을 의논하던 방이자 그날 밤의 방 --- */
  crestPlaque(B, 161.5, F + 1.75, -3.52, PI, 0.6);
  for (const x of [160.6, 162.4]) zabuton(B, C.zabR, x, F + 0.015, -5.2);
  B.box(M.beam, 164.35, F + 0.015, -9.3, 164.75, F + 0.08, -8.5, false);            // 칼걸이
  for (const z of [-9.2, -8.6]) { B.box(M.beam, 164.5, F + 0.08, z - 0.03, 164.6, F + 0.55, z + 0.03, false); for (const y of [0.3, 0.5]) B.box(M.beam, 164.42, F + y, z - 0.025, 164.5, F + y + 0.03, z + 0.025, false); }
  for (const y of [0.34, 0.54]) { B.geo(C.navy, cyl(0.016, 0.014, 0.95, 8), mat4(164.46, F + y, -8.9, PI / 2, 0, 0)); B.geo(M.iron, cyl(0.035, 0.035, 0.012, 10), mat4(164.46, F + y, -8.62, PI / 2, 0, 0)); }
  paperLamp(B, 161.5, CE, -6.7, out, 9);

  /* --- 이타치의 방: 낮은 책상과 두루마리, 책장, 개켜 둔 이부자리 --- */
  lowTable(B, 163.3, -2.9, 164.6, -2.1, F + 0.02, 0.32);
  zabuton(B, C.zab, 163.95, F + 0.02, -1.6);
  for (let i = 0; i < 3; i++) B.geo(C.paper, cyl(0.026, 0.026, 0.26, 8), mat4(163.6 + i * 0.09, F + 0.37, -2.5 + i * 0.05, 0, 0.3 * i, PI / 2));
  B.geo(C.steel, kunaiGeo(), mat4(164.3, F + 0.35, -2.4, PI / 2, 0.5, 0)); B.geo(C.steel, kunaiGeo(), mat4(164.38, F + 0.35, -2.55, PI / 2, 0.9, 0));
  B.box(M.beam, 158.14, F + 0.02, 0.6, 158.5, F + 1.5, 2.6);                         // 책장
  for (let r = 0; r < 3; r++) { B.box(M.beamLight, 158.5, F + 0.1 + r * 0.46, 0.64, 158.512, F + 0.5 + r * 0.46, 2.56, false);
    for (let i = 0; i < 9; i++) B.box(C.books[(i + r) % 4], 158.512, F + 0.12 + r * 0.46, 0.7 + i * 0.2, 158.53, F + 0.42 + r * 0.46 - (i % 3) * 0.03, 0.86 + i * 0.2, false); }
  B.box(C.futon, 163.6, F + 0.02, 1.7, 164.7, F + 0.2, 2.9, false); B.box(C.quilt, 163.62, F + 0.2, 1.72, 164.68, F + 0.36, 2.88, false); B.box(C.futon, 163.75, F + 0.36, 2.0, 164.5, F + 0.44, 2.4, false);
  addCollider(163.6, F, 1.7, 164.7, F + 0.44, 2.9);
  crestPlaque(B, 161.5, F + 1.7, -3.26, 0, 0.3);
  paperLamp(B, 161.5, CE, -0.2, out, 10);

  /* --- 사스케의 방: 펴 둔 이부자리, 낮은 책상, 벽의 수리검 과녁 --- */
  B.box(C.futon, 153.45, F + 0.02, -0.7, 154.5, F + 0.11, 1.35, false); B.box(C.quilt, 153.4, F + 0.1, -0.1, 154.55, F + 0.2, 1.4, false);
  B.box(C.futon, 153.72, F + 0.11, -0.62, 154.22, F + 0.19, -0.3, false);
  lowTable(B, 155.2, 2.0, 156.25, 2.6, F + 0.02, 0.32, M.beamLight);
  for (let i = 0; i < 2; i++) B.geo(C.paper, cyl(0.024, 0.024, 0.24, 8), mat4(155.5 + i * 0.3, F + 0.37, 2.3, 0, 0.4 + i, PI / 2));
  { const tm = textMat(' ', { w: 256, h: 256, bg: '#d9c9a0', color: '#d9c9a0', draw: (g, w, h) => { for (const [r, c] of [[0.44, '#1d1a16'], [0.33, '#f1ead6'], [0.22, '#1d1a16'], [0.1, '#b3352a']]) { g.fillStyle = c; g.beginPath(); g.arc(w / 2, h / 2, w * r, 0, 7); g.fill(); } } });
    B.geo(M.beamLight, cyl(0.3, 0.3, 0.04, 24).rotateX(PI / 2), mat4(155.2, F + 1.4, -1.05)); B.geo(tm, new THREE.CircleGeometry(0.28, 24), mat4(155.2, F + 1.4, -1.022));
    B.geo(C.steel, kunaiGeo(), mat4(155.26, F + 1.44, -0.93, -PI / 2 + 0.15, 0, 0)); B.geo(C.steel, kunaiGeo(), mat4(155.05, F + 1.3, -0.93, -PI / 2 - 0.1, 0, 0.2)); }
  paperLamp(B, 154.8, CE, 1.0, out, 8);
  paperLamp(B, 157.25, CE, -4.0, out, 7);

  /* --- 툇마루와 뜰 --- */
  for (const x of [X0 + 0.07, 157.2, 161.2, X1 - 0.07]) B.box(M.beam, x - 0.07, F, Z1 - 0.17, x + 0.07, TOP, Z1 - 0.03);
  B.box(M.beam, X0, TOP - 0.22, Z1 - 0.16, X1, TOP - 0.03, Z1 - 0.04, false);
  for (const x of [X0 + 0.05, X1 - 0.05]) B.box(M.beam, x - 0.05, TOP - 0.22, EZ, x + 0.05, TOP - 0.03, Z1 - 0.16, false);
  B.box(M.stone, 160.4, 0, Z1 + 0.05, 162.0, 0.22, Z1 + 0.7);                        // 섬돌
  B.box(M.beam, 160.9, F, 4.0, 161.6, F + 0.02, 4.5, false);                         // 찻쟁반과 경단 접시
  for (const x of [161.05, 161.25]) B.geo(C.porcelain, cyl(0.035, 0.028, 0.06, 10), mat4(x, F + 0.05, 4.15));
  B.geo(C.porcelain, cyl(0.08, 0.05, 0.02, 12), mat4(161.45, F + 0.03, 4.3));
  for (let i = 0; i < 3; i++) B.geo(mat('plain', [0xe9b7c0, 0xf2efe6, 0x9fc28a][i], { rough: 0.8 }), new THREE.SphereGeometry(0.022, 8, 6), mat4(161.41 + i * 0.04, F + 0.06, 4.3));
  for (const [x, z] of [[161.2, 6.3], [161.0, 7.3], [161.5, 8.3], [162.3, 9.1], [163.3, 9.6]]) B.geo(M.stone, cyl(0.36, 0.4, 0.06, 9), mat4(x, 0.03, z, 0, x, 0));
  stoneLantern(B, 164.2, 8.2);
  // 수리검 연습 과녁: 말뚝에 건 짚 과녁과 박힌 쿠나이
  B.geo(C.bark, cyl(0.09, 0.1, 1.7, 10), mat4(151.2, 0.85, 3.5)); addCollider(151.1, 0, 3.4, 151.3, 1.7, 3.6);
  B.geo(C.rope, cyl(0.32, 0.32, 0.1, 20).rotateZ(PI / 2), mat4(151.32, 1.3, 3.5)); B.geo(C.torii, cyl(0.1, 0.1, 0.102, 14).rotateZ(PI / 2), mat4(151.325, 1.3, 3.5));
  for (const [y, z, r] of [[1.36, 3.42, 0.1], [1.2, 3.6, -0.15], [1.42, 3.62, 0.05]]) B.geo(C.steel, kunaiGeo(), mat4(151.47, y, z, 0, 0, PI / 2 + r));

  out.places.push(
    { n: '사스케의 집', t: '우치하 본가. 대문 옆 담에 일족의 문장이 줄지어 그려져 있고, 그중 하나에는 쿠나이가 박혀 금이 가 있다.', b: [148.5, 167.5, -20, 12], y: [0, 6] },
    { n: '사스케의 집 · 현관', t: '신을 벗고 오르는 자리. 형 이타치가 걸터앉아 신을 신으며 "미안하다 사스케, 다음에 하자"며 이마를 톡 치던 곳.', b: [153, 156.4, -6.8, -1.2], y: [0, 3] },
    { n: '사스케의 집 · 부엌', t: '어머니 미코토가 밥을 짓던 부엌.', b: [153, 156.4, -16, -10.5], y: [0, 3] },
    { n: '사스케의 집 · 차노마', t: '네 식구가 낮은 상에 둘러앉아 밥을 먹던 다다미방.', b: [158.1, 165, -16, -10], y: [0, 3] },
    { n: '사스케의 집 · 큰 마루방', t: '아버지 후가쿠가 일족의 일을 의논하던 넓은 마루방. 그날 밤 사스케가 두 짝 문을 밀고 들어선 방이다.', b: [158.1, 165, -9.9, -3.5], y: [0, 3] },
    { n: '사스케의 집 · 이타치의 방', t: '두루마리와 책이 가지런한 형의 방.', b: [158.1, 165, -3.4, 3.1], y: [0, 3] },
    { n: '사스케의 집 · 사스케의 방', t: '이부자리와 낮은 책상, 벽에는 수리검 과녁.', b: [153, 156.4, -1.1, 3.1], y: [0, 3] },
    { n: '사스케의 집 · 툇마루', t: '뜰을 내다보는 마루. 형제가 나란히 앉아 이야기를 나누던 자리.', b: [153, 165, 3.2, 5.2], y: [0, 3] },
  );
  out.jumps.push(['사스케의 집', 143.5, 0, -4, -PI / 2, 41], ['사스케네 툇마루', 161.2, 0, 8.6, 0, 42]);
}

/* ============================ 남가 신사 ============================
   돌 기단(높이 3m) 위의 본당. 본당 다다미 한 자리가 들려 있고 그 밑 계단이 기단 속 비밀 집회장으로 내려간다 — 일족의 비석이 있는 방. */
function shrine(B, out) {
  const PX0 = 154, PX1 = 167.5, PZ0 = -41.5, PZ1 = -24.5, SY = 3.0, ST = 6.2, T = 0.18;
  const HX0 = 157, HX1 = 166, HZ0 = -39, HZ1 = -27, hx0 = 163.2, hx1 = 164.6, hz0 = -37.5, hz1 = -33.6;   // 본당, 다다미 밑 구멍
  // 도리이와 돌계단
  for (const z of [-35.2, -30.8]) { B.geo(C.torii, cyl(0.17, 0.2, 4.3, 14), mat4(147.3, 2.15, z)); B.geo(M.stone, cyl(0.3, 0.34, 0.3, 14), mat4(147.3, 0.15, z)); addCollider(147.1, 0, z - 0.2, 147.5, 4.3, z + 0.2); }
  B.box(C.torii, 147.1, 4.3, -36.4, 147.5, 4.56, -29.6, false); B.box(M.iron, 147.06, 4.56, -36.6, 147.54, 4.68, -29.4, false); B.box(C.torii, 147.2, 3.5, -35.8, 147.4, 3.72, -30.2, false);
  signBoard(B, '南賀ノ神社', 147.05, 4.0, -33, -PI / 2, 0.34, 0.6, { both: false, vertical: true, depth: 0.04 });
  stairs(B, M.stone, 'x', PX0, -1, 0, SY, -35.5, -30.5, 0.4);
  for (const z of [-36.3, -29.7]) stoneLantern(B, 149.2, z);
  // 기단: 속이 빈 돌벽과 윗판(구멍 하나)
  wall(B, M.stone, 'x', PZ0, PZ0 + 0.4, PX0, PX1, 0, SY - 0.3); wall(B, M.stone, 'x', PZ1 - 0.4, PZ1, PX0, PX1, 0, SY - 0.3);
  wall(B, M.stone, 'z', PX0, PX0 + 0.4, PZ0 + 0.4, PZ1 - 0.4, 0, SY - 0.3); wall(B, M.stone, 'z', PX1 - 0.4, PX1, PZ0 + 0.4, PZ1 - 0.4, 0, SY - 0.3);
  B.box(M.pave, PX0, SY - 0.3, PZ0, PX1, SY, hz0); B.box(M.pave, PX0, SY - 0.3, hz1, PX1, SY, PZ1);
  B.box(M.pave, PX0, SY - 0.3, hz0, hx0, SY, hz1); B.box(M.pave, hx1, SY - 0.3, hz0, PX1, SY, hz1);
  railing(B, M.beam, [[PX0 + 0.12, -35.6], [PX0 + 0.12, PZ0 + 0.12], [PX1 - 0.12, PZ0 + 0.12], [PX1 - 0.12, PZ1 - 0.12], [PX0 + 0.12, PZ1 - 0.12], [PX0 + 0.12, -30.4]], SY, 0.95, { gap: 0.32 });
  // 본당: 널벽, 서쪽으로 넓게 열린 앞, 우진각 기와지붕
  wall(B, C.shrine, 'x', HZ0, HZ0 + T, HX0, HX1, SY, ST); wall(B, C.shrine, 'x', HZ1 - T, HZ1, HX0, HX1, SY, ST);
  wall(B, C.shrine, 'z', HX1 - T, HX1, HZ0 + T, HZ1 - T, SY, ST);
  wall(B, C.shrine, 'z', HX0, HX0 + T, HZ0 + T, HZ1 - T, SY, ST, [op(-36, -30, SY, 5.6)]);
  doorUnit(B, 'z', HX0, HX0 + T, -36, -30, SY, 5.6, { leaf: null, t: 0.14 });
  for (const [x, sx] of [[HX0, -1], [HX1, 1]]) for (const [z, sz] of [[HZ0, -1], [HZ1, 1]]) B.box(M.beam, x + sx * 0.04, SY, z + sz * 0.04, x - sx * 0.2, ST, z - sz * 0.2, false);
  B.box(M.beamLight, HX0 + T, ST - 0.1, HZ0 + T, HX1 - T, ST, HZ1 - T, false);
  hipRoof(B, C.tile, HX0, HZ0, HX1, HZ1, ST, 2.7, { over: 1.3 });
  // 다다미(들린 자리만 비워 둔다)와 벽에 기대 세운 다다미 한 장
  const ix0 = HX0 + T, ix1 = HX1 - T, iz0 = HZ0 + T, iz1 = HZ1 - T, ty = SY + 0.02;
  B.box(M.tatami, ix0, SY, iz0, ix1, ty, hz0, false); B.box(M.tatami, ix0, SY, hz1, ix1, ty, iz1, false);
  B.box(M.tatami, ix0, SY, hz0, hx0, ty, hz1, false); B.box(M.tatami, hx1, SY, hz0, ix1, ty, hz1, false);
  B.geo(M.tatami, new THREE.BoxGeometry(0.9, 1.8, 0.05), mat4(162.5, SY + 0.92, iz0 + 0.18, 0.13, 0, 0), [0.9, 1.8]);
  B.geo(M.tatami, new THREE.BoxGeometry(0.9, 1.8, 0.05), mat4(161.5, SY + 0.92, iz0 + 0.24, 0.19, 0, 0), [0.9, 1.8]);
  // 금줄과 종이 술, 새전함, 안쪽 제단과 문장
  { const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(V3(HX0 - 0.06, 5.45 - 0.5 * 4 * t * (1 - t), -36 + 6 * t)); } B.geo(C.rope, tube(pts, 0.06, 8, true));
    for (let i = 1; i < 6; i++) { const t = i / 6, y = 5.45 - 0.5 * 4 * t * (1 - t); B.box(C.paper, HX0 - 0.075, y - 0.5, -36 + 6 * t - 0.07, HX0 - 0.065, y - 0.06, -36 + 6 * t + 0.07, false); } }
  B.box(M.beam, 155.6, SY, -33.7, 156.3, SY + 0.6, -32.3); for (let i = 0; i < 6; i++) B.box(M.beamLight, 155.66, SY + 0.6, -33.6 + i * 0.24, 156.24, SY + 0.63, -33.52 + i * 0.24, false);
  B.box(M.beam, 165.0, SY, -34.4, 165.8, SY + 0.9, -31.6); B.box(M.beam, 165.3, SY + 0.9, -33.9, 165.8, SY + 1.3, -32.1);
  for (const z of [-34.1, -31.9]) { B.geo(C.porcelain, cyl(0.03, 0.04, 0.22, 8), mat4(165.25, SY + 1.01, z)); B.geo(C.glow, new THREE.SphereGeometry(0.03, 8, 6), mat4(165.25, SY + 1.15, z, 0, 0, 0, [1, 1.6, 1])); out.glows.push([165.25, SY + 1.15, z, 0.5]); }
  crestPlaque(B, HX1 - T - 0.03, SY + 2.1, -33, -PI / 2, 0.55);
  out.lights.push([161.5, 5.5, -33, 10, 14]);
  // 비밀 집회장으로 내려가는 돌계단(구멍 북쪽 끝에서 남쪽으로)
  stairs(B, M.stone, 'z', hz0, 1, 0, SY, hx0, hx1, 0.25);
  // 비밀 집회장: 돌바닥에 다다미를 깔고, 남쪽 벽 앞에 일족의 비석, 양옆에 횃불
  B.box(M.pave, PX0 + 0.4, 0, PZ0 + 0.4, PX1 - 0.4, 0.03, PZ1 - 0.4);
  B.box(M.tatami, 157.1, 0.03, -32.8, 164.3, 0.05, -27.4, false);
  B.box(C.slab, 159.5, 0, -25.75, 162.1, 2.0, -25.3); B.box(C.slab, 159.2, 0, -25.9, 162.4, 0.25, -25.2, false);
  { const txt = '一つの神が安定を求め陰と陽に分極した相反する二つは作用し合い森羅万象を得る';
    const tm = textMat(' ', { w: 512, h: 384, bg: '#8a8780', color: '#8a8780', draw: (g, w, h) => { g.fillStyle = '#2a2724'; g.font = '700 34px "Yu Mincho", "MS Mincho", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      [...txt].forEach((ch, i) => { const col = Math.floor(i / 8), row = i % 8; g.fillText(ch, w - 62 - col * 96, 48 + row * 42); }); } });
    B.geo(tm, new THREE.PlaneGeometry(2.3, 1.55), mat4(160.8, 1.1, -25.76, 0, PI, 0)); }
  for (const x of [158.6, 163.0]) { B.geo(M.iron, cyl(0.03, 0.05, 1.3, 8), mat4(x, 0.65, -26.0)); B.geo(M.iron, cyl(0.12, 0.05, 0.14, 10), mat4(x, 1.36, -26.0)); B.geo(C.glow, new THREE.SphereGeometry(0.08, 10, 8), mat4(x, 1.5, -26.0, 0, 0, 0, [1, 1.5, 1])); out.glows.push([x, 1.52, -26.0, 1.1]); }
  out.lights.push([160.8, 1.9, -28.5, 12, 14]);

  out.places.push(
    { n: '남가 신사', t: '우치하 일족의 신사. 돌계단 위 본당에 일족의 문장이 걸려 있다.', b: [146.5, 168, -42, -24], y: [0, 9.5] },
    { n: '남가 신사 · 본당', t: '오른쪽 끝에서 일곱 번째 다다미 밑에 일족만 아는 계단이 있다.', b: [157, 166, -39, -27], y: [2.9, 9] },
    { n: '비밀 집회장', t: '본당 밑에 숨긴 방. 일족의 비석에는 사륜안이 깊어질수록 더 읽히는 글이 새겨져 있다.', b: [154.4, 167.1, -41.1, -24.9], y: [0, 2.6] },
  );
  out.jumps.push(['남가 신사', 148.6, 0, -33, -PI / 2, 43]);
}

/* ============================ 못과 선착장 ============================ */
function pond(B, out) {
  const x0 = 150, x1 = 166, z0 = 18, z1 = 32.5;
  B.box(M.water, x0, 0, z0, x1, 0.07, z1, false);
  B.box(M.stone, x0 - 0.4, 0, z0 - 0.4, 157.2, 0.2, z0, false); B.box(M.stone, 158.8, 0, z0 - 0.4, x1 + 0.4, 0.2, z0, false); B.box(M.stone, x0 - 0.4, 0, z1, x1 + 0.4, 0.2, z1 + 0.4, false);
  B.box(M.stone, x0 - 0.4, 0, z0, x0, 0.2, z1, false); B.box(M.stone, x1, 0, z0, x1 + 0.4, 0.2, z1, false);
  // 선착장: 물 위로 뻗은 널다리. 어린 사스케가 호화구를 익히던 자리
  B.box(M.floorDark, 157.2, 0.17, 15.2, 158.8, 0.25, 16); B.box(M.floorDark, 157.2, 0.4, 16, 158.8, 0.5, 27.5);
  for (let z = 16.3; z < 27.6; z += 2.2) for (const x of [157.28, 158.72]) B.box(M.beam, x - 0.07, 0, z - 0.07, x + 0.07, 0.72, z + 0.07, false);
  out.places.push({ n: '못가 선착장', t: '어린 사스케가 아버지에게 인정받으려고 화둔 호화구의 술을 익히던 널다리.', b: [149.6, 166.4, 15, 33], y: [0, 3] });
  out.jumps.push(['못가 선착장', 158, 0.5, 20, PI, 44]);
}

/* ============================ 나무와 덤불 ============================ */
// only: [x0, z0, x1, z1] — 그 터 안의 나무·덤불만 심는다(집을 한 채씩 따로 지을 때)
function garden(scene, R, only) {
  const inn = (x, z) => !only || (x >= only[0] && x <= only[2] && z >= only[1] && z <= only[3]);
  const trees = [[151.4, 9.2, 0.62], [166, -21.5, 0.5], [151, -39, 0.75], [168, 14.5, 0.7], [147.5, 26, 0.8], [126, -30, 0.9], [126, 22, 0.85], [150.2, -24, 0.55]].filter(t => inn(t[0], t[1]));
  const geos = [treeGeometry(301, { height: 11, depth: 4, sprays: 5, leaves: 6, leafLen: 0.5 }), treeGeometry(307, { height: 12, depth: 4, sprays: 5, leaves: 6, leafLen: 0.5 })];
  const mk = (geo, material, list, shadow = true) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, material, list.length);
    list.forEach((m, i) => im.setMatrixAt(i, m)); im.instanceMatrix.needsUpdate = true; im.castShadow = shadow; im.receiveShadow = true; im.computeBoundingSphere(); scene.add(im);
  };
  for (let k = 0; k < 2; k++) {
    const list = trees.filter((_, i) => i % 2 === k).map(([x, z, s]) => { addCollider(x - 0.4 * s, 0, z - 0.4 * s, x + 0.4 * s, 5, z + 0.4 * s); return mat4(x, 0, z, 0, R() * 6.28, 0, s); });
    mk(geos[k].wood, C.bark, list); mk(geos[k].leaves, C.green[k], list);
  }
  const bush = bushGeometry(13, 1.1), bl = [];
  for (const [x, z] of [[150, 6.5], [152.4, 10.6], [166.3, 6], [166.2, 10.5], [158, 10.8], [150, -18.5], [166.3, -18.6], [149.5, 16.5], [167, 20], [147.6, -40.5], [152.6, -26.5], [152.6, -39.6], [121.5, -22], [121.5, 14]]) if (inn(x, z)) bl.push(mat4(x, 0, z, 0, R() * 6.28, 0, 0.8 + R() * 0.6));
  mk(bush.wood, C.bark, bl, false); mk(bush.leaves, C.green[1], bl);
}

export async function build(scene, ctx) {
  C = palette();
  const out = { places: [], jumps: [], lights: [], glows: [], skip: [] };
  const K = makeKit(), R = rng(9001);
  // 새 배치: 사스케의 집과 남가 신사를 따로따로 제자리에 짓는다(구역의 담·거리·호수는 마을 쪽에서 새로 만든다)
  if (ctx.which === 'sasuke' || ctx.which === 'shrine') {
    const B = new Builder();
    if (ctx.which === 'sasuke') { sasukeHouse(B, out); B.finish(scene); garden(scene, R, [148, -21, 168.5, 13]); }
    else { shrine(B, out); B.finish(scene); garden(scene, R, [146.5, -42, 168.5, -22]); }
    return out;
  }
  for (const part of [B => district(B, K, R, out), B => sasukeHouse(B, out), B => { shrine(B, out); pond(B, out); }]) { const B = new Builder(); part(B); B.finish(scene); }
  garden(scene, R);
  const { x0, x1, z0, z1, gateZ } = UCHIHA;
  out.places.push({ n: '우치하 일족의 거리', t: '부채 문장을 내건 일족이 모여 살던 구역. 지금은 인기척 없이 고요하다.', b: [x0, x1, z0, z1] });
  out.jumps.push(['우치하 구역 대문', x0 - 7, 0, gateZ, -PI / 2, 40]);
  return out;
}
