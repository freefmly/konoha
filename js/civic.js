// 관저 둘레의 시설 — 상급닌자 대기소, 정보부, 전서구 탑. 셋 다 제 좌표(정면이 +z)로 지어 마을의 제자리에 돌려 놓는다.
// 구역의 자리는 배치도(plan-data.js)에서 읽고, 집·나무가 피해 가도록 터를 zones.js의 LOTS에 알려 둔다.
import * as THREE from '../vendor/three.module.js';
import { Builder, marks, settle, addCollider, addRoof, mat4, tube, wall, stairs, mergeGeos, rng as rngOf } from './build.js';
import { M, mat, textMat } from './materials.js';
import { beamBetween, hipRoof, gableRoof, coneRoof, roundWall, roundWindow, roundFloor, roundRailing, railing, windowUnit, doorUnit, signBoard, lantern, noren } from './arch.js';
import { treeGeometry, bushGeometry } from './flora.js';
import { uchihaKit } from './b_uchiha.js';
import { PLAN } from './plan-data.js';
import { LOTS, OPEN, BARE, zoneGroups } from './zones.js';
import { inPoly } from './village.js';

const PI = Math.PI, V = (x, y, z) => new THREE.Vector3(x, y, z);
const zone = n => PLAN.zones.find(z => z.n === n);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg);
const lathe = (prof, seg = 14) => new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p[0], p[1])), seg);
const SPH = new THREE.SphereGeometry(1, 12, 9);

// 제 좌표로 지은 것을 마을의 제자리에 돌려 놓는다. make(B, holder) — holder에는 따로 그릴 것(흔들리는 나무 따위)을 직접 넣는다.
function put(scene, at, make) {
  const holder = new THREE.Group(), from = marks(), B = new Builder();
  const res = make(B, holder) || null;
  B.finish(holder);
  return settle(scene, holder, from, at, res);
}
// 자리(x, y, z)·돌림에 맞춰 작은 부품을 놓는 틀. p.base는 그 자리의 행렬.
function part(B, x, y, z, ry = 0) {
  const base = mat4(x, y, z, 0, ry, 0);
  const p = (m, g, lx = 0, ly = 0, lz = 0, rx = 0, rY = 0, rz = 0, s = 1) => B.geo(m, g, new THREE.Matrix4().multiplyMatrices(base, mat4(lx, ly, lz, rx, rY, rz, s)));
  p.base = base;
  return p;
}
// 돌려 놓은 가구의 충돌 상자(직각으로만 돌린다)
function solid(x, y, z, ry, w, d, h) {
  const t = Math.abs(Math.sin(ry)) > 0.7, a = t ? d : w, b = t ? w : d;
  addCollider(x - a / 2, y, z - b / 2, x + a / 2, y + h, z + b / 2);
}
// 임의 모양의 평평한 판: inside(x, z)가 참인 곳만 좁은 띠로 깐다(가운데가 비껴 뚫린 둥근 바닥, 말굽 꼴 마루)
function plate(B, m, x0, z0, x1, z1, y0, y1, inside, collide = true) {
  const sx = 0.25, sz = 0.125;
  for (let x = x0; x < x1 - 1e-6; x += sx) {
    let a = null;
    for (let z = z0; z <= z1 + sz; z += sz) {
      const on = z < z1 && inside(x + sx / 2, z + sz / 2);
      if (on && a === null) a = z;
      if (!on && a !== null) { B.box(m, x, y0, a, x + sx, y1, z, collide); a = null; }
    }
  }
}
// 쇠창살: 세로 살과 가로대 셋
function bars(B, m, axis, c, u0, u1, y0, y1, collide = true) {
  const n = Math.max(1, Math.round((u1 - u0) / 0.13)), bx = (a, b, ya, yb, t) => (axis === 'x' ? B.box(m, a, ya, c - t, b, yb, c + t, false) : B.box(m, c - t, ya, a, c + t, yb, b, false));
  for (let i = 0; i <= n; i++) { const u = u0 + (u1 - u0) * i / n; bx(u - 0.018, u + 0.018, y0, y1, 0.018); }
  for (const y of [y0 + 0.05, (y0 + y1) / 2, y1 - 0.05]) bx(u0, u1, y - 0.03, y + 0.03, 0.03);
  if (collide) { if (axis === 'x') addCollider(u0, y0, c - 0.05, u1, y1, c + 0.05); else addCollider(c - 0.05, y0, u0, c + 0.05, y1, u1); }
}
// 곧은 벽 한 면에 문·창을 내며 쌓는다. cols = [[u0, u1, 종류]] — 'd' 문, 'w' 창, 'h' 높은 창살 구멍, 'u' 아래층은 막힌 벽. ups = 위층 바닥 높이들(그 층마다 같은 자리에 종이 바른 창).
function face(B, m, axis, f0, f1, u0, u1, y0, y1, out, cols, ups, frame, iron, paper = true) {
  const low = k => (k === 'd' ? [[y0 + 0.2, y0 + 2.6]] : k === 'w' ? [[y0 + 1.2, y0 + 2.5]] : k === 'h' ? [[y0 + 2.3, y0 + 2.75]] : []);
  wall(B, m, axis, f0, f1, u0, u1, y0, y1, cols.map(([a, b, k]) => ({ u0: a, u1: b, ys: [...low(k), ...ups.map(f => [f + 1.1, f + 2.4])] })), true, true);
  for (const [a, b, k] of cols) {
    if (k === 'd') doorUnit(B, axis, f0, f1, a, b, y0 + 0.2, y0 + 2.6, { frame, leaf: null });
    if (k === 'w') windowUnit(B, axis, f0, f1, a, b, y0 + 1.2, y0 + 2.5, { frame, out });
    if (k === 'h') bars(B, iron, axis, (f0 + f1) / 2, a, b, y0 + 2.3, y0 + 2.75, false);
    for (const f of ups) windowUnit(B, axis, f0, f1, a, b, f + 1.1, f + 2.4, { frame, out, paper, glass: !paper });
  }
}

/* ---------- 가구 ---------- */
function tableAt(B, m, x, y, z, ry, w, d, h = 0.74) {
  const p = part(B, x, y, z, ry);
  p(m, box(w, 0.05, d), 0, h - 0.025, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p(m, box(0.07, h - 0.05, 0.07), sx * (w / 2 - 0.09), (h - 0.05) / 2, sz * (d / 2 - 0.09));
  p(m, box(w - 0.2, 0.08, 0.03), 0, h - 0.09, d / 2 - 0.09); p(m, box(w - 0.2, 0.08, 0.03), 0, h - 0.09, -d / 2 + 0.09);
  solid(x, y, z, ry, w, d, h);
}
function chairAt(B, m, x, y, z, ry) {   // 앉는 쪽이 +z
  const p = part(B, x, y, z, ry);
  p(m, box(0.42, 0.04, 0.42), 0, 0.44, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const h = sz < 0 ? 0.92 : 0.44; p(m, box(0.04, h, 0.04), sx * 0.18, h / 2, sz * 0.18); }
  p(m, box(0.4, 0.2, 0.03), 0, 0.78, -0.18); p(m, box(0.4, 0.05, 0.03), 0, 0.58, -0.18);
  solid(x, y, z, ry, 0.44, 0.44, 0.46);
}
function benchAt(B, m, x, y, z, ry, w) {
  const p = part(B, x, y, z, ry);
  p(m, box(w, 0.05, 0.4), 0, 0.42, 0);
  for (const sx of [-1, 1]) { p(m, box(0.06, 0.4, 0.34), sx * (w / 2 - 0.12), 0.2, 0); }
  p(m, box(w - 0.3, 0.05, 0.05), 0, 0.2, 0);
  solid(x, y, z, ry, w, 0.4, 0.44);
}
function deskAt(B, m, x, y, z, ry, w = 1.6, d = 0.78) {   // 앉는 쪽이 -z, 앞판이 +z
  const p = part(B, x, y, z, ry);
  p(m, box(w, 0.05, d), 0, 0.755, 0);
  for (const sx of [-1, 1]) p(m, box(0.04, 0.73, d - 0.06), sx * (w / 2 - 0.04), 0.365, 0);
  p(m, box(w - 0.08, 0.5, 0.03), 0, 0.48, d / 2 - 0.06);
  p(m, box(0.42, 0.56, d - 0.12), w / 2 - 0.27, 0.45, -0.02);
  for (let k = 0; k < 3; k++) p(M.iron, box(0.14, 0.02, 0.02), w / 2 - 0.27, 0.27 + k * 0.18, -d / 2 + 0.04);
  solid(x, y, z, ry, w, d, 0.78);
}
function cabinetAt(B, m, x, y, z, ry, w, h, d = 0.5, rows = 4) {   // 서랍이 +z를 본다
  const p = part(B, x, y, z, ry);
  p(m, box(w, h, d), 0, h / 2, 0);
  for (let k = 0; k < rows; k++) { const yy = (k + 0.5) * h / rows; p(M.iron, box(w - 0.06, 0.012, 0.012), 0, yy + h / rows / 2 - 0.006, d / 2 + 0.004); p(M.iron, box(0.16, 0.025, 0.03), 0, yy + 0.03, d / 2 + 0.015); p(M.white, box(0.12, 0.05, 0.006), 0, yy - 0.07, d / 2 + 0.004); }
  solid(x, y, z, ry, w, d, h);
}
const SCROLL_HEX = [0xe6dcc0, 0x4a7a58, 0x8a3a30, 0x3d5a80, 0xc9a24a, 0xd8cfb4];
function shelfAt(B, m, x, y, z, ry, w, h, rows, R, d = 0.36) {   // 두루마리 선반. 열린 쪽이 +z
  const p = part(B, x, y, z, ry), sg = cyl(0.045, 0.045, d - 0.08, 8).rotateX(PI / 2), cap = cyl(0.016, 0.016, 0.03, 6).rotateX(PI / 2);
  p(m, box(w, h, 0.03), 0, h / 2, -d / 2 + 0.015);
  for (const sx of [-1, 1]) p(m, box(0.04, h, d), sx * (w / 2 - 0.02), h / 2, 0);
  for (let k = 0; k <= rows; k++) {
    const yy = 0.04 + k * (h - 0.08) / rows;
    p(m, box(w, 0.035, d), 0, yy, 0);
    if (k === rows) break;
    const n = Math.floor((w - 0.14) / 0.1);
    for (let i = 0; i < n; i++) {
      if (R() < 0.22) continue;
      const sm = mat('plain', SCROLL_HEX[Math.floor(R() * SCROLL_HEX.length)], { rough: 0.9 }), sxp = -w / 2 + 0.12 + i * 0.1, up = R() < 0.3 && yy + 0.2 < h ? 0.085 : 0;
      p(sm, sg, sxp, yy + 0.065 + up, 0.02); p(M.beam, cap, sxp, yy + 0.065 + up, d / 2 - 0.02);
    }
  }
  solid(x, y, z, ry, w, d, h);
}
function cotAt(B, x, y, z, ry, frame, cloth) {
  const p = part(B, x, y, z, ry);
  p(frame, box(0.85, 0.06, 1.9), 0, 0.32, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p(frame, box(0.05, 0.32, 0.05), sx * 0.38, 0.16, sz * 0.9);
  p(cloth, box(0.8, 0.09, 1.84), 0, 0.395, 0);
  p(mat('plain', 0x6a7068, { rough: 1 }), box(0.78, 0.07, 0.5), 0, 0.47, 0.6);
  p(mat('plain', 0xd8d2c2, { rough: 1 }), box(0.5, 0.09, 0.28), 0, 0.47, -0.72);
  solid(x, y, z, ry, 0.85, 1.9, 0.45);
}
// 화분: 토분에 덤불
function potAt(B, x, y, z, s = 1, bush = BUSH) {
  B.geo(mat('plain', 0x9a5a3c, { rough: 0.85 }), lathe([[0, 0], [0.2, 0], [0.28, 0.42], [0.31, 0.44], [0.25, 0.44], [0.24, 0.38], [0, 0.38]]), mat4(x, y, z, 0, 0, 0, s));
  B.geo(mat('leaf', 0x447f2e), bush.leaves, mat4(x, y + 0.36 * s, z, 0, x * 3 + z, 0, 0.5 * s));
  addCollider(x - 0.25 * s, y, z - 0.25 * s, x + 0.25 * s, y + 0.9 * s, z + 0.25 * s);
}
let BUSH = null;

/* ---------- 매 ---------- */
let HAWK = null;
const hawkMats = () => HAWK || (HAWK = { brown: mat('plain', 0x6b4a30, { rough: 0.9 }), dark: mat('plain', 0x3d2b1e, { rough: 0.9 }), cream: mat('plain', 0xe2d3b2, { rough: 0.9 }), beak: mat('plain', 0xd9a83a, { rough: 0.6 }), eye: mat('plain', 0x14110e, { rough: 0.3 }), wing: mat('plain', 0x4a3424, { rough: 0.9, side: 'double' }) });
// 홰에 앉은 매. m: 발이 놓일 자리의 행렬(새는 +z를 본다)
function hawk(B, m, s = 1) {
  const H = hawkMats();
  const P = (mt, g, x, y, z, rx = 0, ry = 0, rz = 0, sc = [1, 1, 1]) => B.geo(mt, g, new THREE.Matrix4().multiplyMatrices(m, mat4(x * s, y * s, z * s, rx, ry, rz, sc.map(v => v * s))));
  P(H.brown, SPH, 0, 0.21, -0.02, 0.35, 0, 0, [0.085, 0.155, 0.1]);                 // 몸통
  P(H.cream, SPH, 0, 0.2, 0.03, 0.35, 0, 0, [0.07, 0.125, 0.078]);                  // 가슴
  for (let k = 0; k < 4; k++) P(H.brown, SPH, (k % 2 ? 0.02 : -0.02), 0.14 + k * 0.04, 0.1 + k * 0.012, 0, 0, 0, [0.022, 0.006, 0.006]);   // 가슴의 가로 무늬
  P(H.brown, SPH, 0, 0.375, 0.055, 0, 0, 0, [0.062, 0.06, 0.066]);                   // 머리
  P(H.beak, new THREE.ConeGeometry(1, 1, 8), 0, 0.36, 0.125, 1.95, 0, 0, [0.02, 0.055, 0.022]);   // 굽은 부리
  P(H.dark, new THREE.ConeGeometry(1, 1, 6), 0, 0.338, 0.146, 2.7, 0, 0, [0.011, 0.025, 0.011]);
  for (const sx of [-1, 1]) {
    P(H.eye, SPH, sx * 0.045, 0.39, 0.09, 0, 0, 0, [0.011, 0.011, 0.011]);
    P(H.dark, SPH, sx * 0.082, 0.2, -0.045, 0.5, 0, sx * -0.12, [0.026, 0.16, 0.085]);    // 접은 날개
    P(H.beak, cyl(1, 1, 1, 5), sx * 0.035, 0.04, 0, 0, 0, 0, [0.009, 0.08, 0.009]);       // 다리와 발
    P(H.beak, SPH, sx * 0.035, 0.008, 0.012, 0, 0, 0, [0.018, 0.01, 0.03]);
  }
  P(H.dark, box(1, 1, 1), 0, 0.07, -0.13, -0.95, 0, 0, [0.075, 0.014, 0.17]);             // 꽁지
}
// 하늘을 도는 매: 몸은 한 덩어리, 날개 둘은 따로 움직인다
function flyingHawk() {
  const H = hawkMats(), g = new THREE.Group();
  const body = mergeGeos([[SPH, mat4(0, 0, 0, 0, 0, 0, [0.09, 0.08, 0.26])], [SPH, mat4(0, 0.02, 0.26, 0, 0, 0, [0.06, 0.055, 0.07])], [box(1, 1, 1), mat4(0, 0, -0.33, 0, 0, 0, [0.16, 0.012, 0.22])]]);
  g.add(new THREE.Mesh(body, H.brown));
  const wings = [-1, 1].map(sx => {
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.16, 0, 0, -0.12, sx * 0.55, 0, -0.2, sx * 0.55, 0, 0.1, sx * 0.55, 0, 0.1, sx * 0.55, 0, -0.2, sx * 1.05, 0, -0.26, sx * 1.0, 0, -0.02], 3));
    wg.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(16).fill(0), 2));
    wg.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]); wg.computeVertexNormals();
    const w = new THREE.Mesh(wg, H.wing); w.position.set(sx * 0.07, 0.03, 0.04); g.add(w);
    return w;
  });
  g.rotation.order = 'YXZ';
  return { g, wings };
}

/* ============================ 상급닌자 대기소 ============================
   아카데미 옆, 큰길 동쪽. 상급닌자들이 호카게의 명령이나 급한 일을 기다리며 머무는 곳.
   원작(나루토 위키)에 적힌 것: 밖의 둥근 초록 간판 "上"과 그 아래 갈색 간판 "人生色々", 안은 창이 여럿 난 둥근 방,
   기둥 하나를 둘러싼 긴 붉은 소파, 기둥을 감은 풀, 작은 초록 통풍구.
   건물의 겉모습(둥근 벽·겹지붕), 찻장·임무 게시판·재떨이·화분·앞마당은 지어낸 것이다. */
function standby(scene, out) {
  const Z = zone(4), R = 6.6, RI = 6.4, FY = 0.15, TOP = 3.6;
  const at = { x: 26.5, z: 64, ry: -PI / 2 };          // 문이 큰길(서쪽)을 본다
  LOTS.push({ x: at.x - 3.2, z: at.z, ry: at.ry, w: 18, d: 25 });
  const WALLM = mat('plaster', 0xe6d7b4), TILE = mat('tile', 0x9a4a2e), TRIM = mat('wood', 0x3f6a55), RED = mat('plain', 0xa8261f, { rough: 0.95 }), REDD = mat('plain', 0x7d1c18, { rough: 0.95 });
  const GREEN = mat('plain', 0x3f8f52, { rough: 0.7 }), VINE = mat('plain', 0x3f7a35, { rough: 0.7, side: 'double' }), BULB = mat('glow', 0xffe2a8);
  const res = put(scene, at, B => {
    const glows = [], lights = [], WIN = [1, 2, 3, 4, 5, 6, 7].map(k => PI / 2 + k * PI / 4);
    // 기단과 바닥
    roundFloor(B, M.stone, 0, 0, R + 0.25, 0, 0.08, [], 0, false);
    roundFloor(B, M.floor, 0, 0, R - 0.05, 0, FY);
    // 둥근 벽: 정면에 문, 나머지 일곱 방향에 창
    roundWall(B, WALLM, 0, 0, RI, R, 0, TOP, [{ a0: PI / 2 - 0.16, a1: PI / 2 + 0.16, ys: [[FY, 2.5]] }, ...WIN.map(a => ({ a0: a - 0.17, a1: a + 0.17, ys: [[1.05, 2.45]] }))], { matIn: M.white });
    for (const a of WIN) roundWindow(B, 0, 0, RI, R, a - 0.17, a + 0.17, 1.05, 2.45, { frame: TRIM, nx: 3 });
    roundWall(B, TRIM, 0, 0, R, R + 0.05, 0.08, 0.5, [{ a0: PI / 2 - 0.16, a1: PI / 2 + 0.16, ys: [[0.08, 0.5]] }], { collide: false });   // 허리 아래 굽도리
    roundWall(B, TRIM, 0, 0, R, R + 0.05, TOP - 0.22, TOP, [], { collide: false });
    // 문틀
    for (const s of [-1, 1]) B.box(TRIM, s * 1.08 - 0.09, FY, R - 0.32, s * 1.08 + 0.09, 2.6, R + 0.1, false);
    B.box(TRIM, -1.2, 2.5, R - 0.32, 1.2, 2.68, R + 0.1, false);
    B.box(M.stone, -1.5, 0, R - 0.1, 1.5, 0.08, R + 1.0, false);
    // 천장
    plate(B, M.white, -RI, -RI, RI, RI, TOP - 0.1, TOP - 0.02, (x, z) => x * x + z * z < RI * RI, false);
    addCollider(-4.5, TOP - 0.1, -4.5, 4.5, TOP, 4.5);
    for (let k = 0; k < 8; k++) { const a = k * PI / 4 + PI / 8; beamBetween(B, M.beam, V(Math.cos(a) * 0.4, TOP - 0.16, Math.sin(a) * 0.4), V(Math.cos(a) * RI, TOP - 0.16, Math.sin(a) * RI), 0.12, 0.12); }
    // 겹지붕: 아래 고리 지붕, 가운데 솟은 둥근 고창, 그 위의 작은 지붕
    coneRoof(B, TILE, 0, 0, R + 0.9, TOP, 1.5, { rTop: 2.7, cap: false });
    roundWall(B, WALLM, 0, 0, 2.3, 2.5, 4.95, 6.6, [0, 1, 2, 3, 4, 5].filter(k => k !== 1).map(k => ({ a0: PI / 6 + k * PI / 3 - 0.2, a1: PI / 6 + k * PI / 3 + 0.2, ys: [[5.5, 6.2]] })), { collide: false });
    for (const k of [0, 2, 3, 4, 5]) roundWindow(B, 0, 0, 2.3, 2.5, PI / 6 + k * PI / 3 - 0.2, PI / 6 + k * PI / 3 + 0.2, 5.5, 6.2, { frame: TRIM, nx: 2, ny: 1 });
    addCollider(-1.8, 4.95, -1.8, 1.8, 6.6, 1.8);
    coneRoof(B, TILE, 0, 0, 3.3, 6.6, 1.5);
    // 간판: 둥근 초록 판에 上, 그 아래 갈색 판에 人生色々
    signBoard(B, '上', 0, 5.85, 2.62, 0, 1.8, 1.8, { round: true, bg: '#3f8f52', color: '#f6f1e2', both: false, frame: M.beam });
    signBoard(B, '人生色々', 0, 3.0, R + 0.72, 0, 2.3, 0.5, { bg: '#7a5236', color: '#f1e6c8', both: false });
    for (const s of [-1, 1]) B.box(M.iron, s * 0.95 - 0.015, 3.25, R + 0.705, s * 0.95 + 0.015, 3.58, R + 0.735, false);

    // 가운데 기둥과 그 둘레의 풀
    B.geo(M.white, cyl(0.3, 0.32, TOP - FY - 0.1, 20), mat4(0, FY + (TOP - FY - 0.1) / 2, 0));
    B.geo(M.beam, cyl(0.37, 0.37, 0.12, 20), mat4(0, TOP - 0.22, 0));
    B.geo(mat('plain', 0x8a5a3c, { rough: 0.85 }), lathe([[0.36, 0], [0.82, 0], [0.9, 0.42], [0.94, 0.45], [0.84, 0.45], [0.8, 0.36], [0.36, 0.36]], 24), mat4(0, FY, 0));
    B.geo(mat('plain', 0x3b2b1f), new THREE.RingGeometry(0.34, 0.82, 24).rotateX(-PI / 2), mat4(0, FY + 0.37, 0));
    for (let k = 0; k < 6; k++) { const a = k * 1.047 + 0.3; B.geo(mat('leaf', k % 2 ? 0x447f2e : 0x35702a), BUSH.leaves, mat4(Math.cos(a) * 0.6, FY + 0.34, Math.sin(a) * 0.6, 0, a * 2, 0, 0.42 + (k % 3) * 0.06)); }
    for (let v = 0; v < 2; v++) {   // 기둥을 감아 오르는 덩굴
      const pts = [], n = 90;
      for (let i = 0; i <= n; i++) { const t = i / n, a = v * PI + t * (v ? -10 : 12), r = 0.34 - 0.02 * t; pts.push(V(Math.cos(a) * r, FY + 0.4 + t * (v ? 2.5 : 2.9), Math.sin(a) * r)); }
      B.geo(VINE, tube(pts, 0.014, 5, false));
      for (let i = 3; i < n; i += 2) { const p = pts[i], a = Math.atan2(p.z, p.x); B.geo(VINE, SPH, mat4(p.x * 1.22, p.y + 0.02, p.z * 1.22, 0.5 * (i % 3 - 1), -a + (i % 4 ? 0.6 : -0.6), 0.3, [0.075, 0.008, 0.045])); }
    }
    addCollider(-0.85, FY, -0.85, 0.85, 1.2, 0.85);
    // 기둥을 둘러싼 긴 붉은 소파 셋(안쪽을 보고 앉는다)
    for (let k = 0; k < 3; k++) {
      const a0 = PI / 2 + 0.3 + k * PI * 2 / 3, a1 = a0 + PI * 2 / 3 - 0.6;
      roundWall(B, REDD, 0, 0, 2.25, 3.05, FY, FY + 0.2, [], { a0, a1, seg: 60, collide: false });
      roundWall(B, RED, 0, 0, 2.2, 3.0, FY + 0.2, FY + 0.46, [], { a0, a1, seg: 60 });
      roundWall(B, RED, 0, 0, 2.82, 3.08, FY + 0.46, FY + 0.95, [], { a0, a1, seg: 60 });
      for (const [b0, b1] of [[a0, a0 + 0.07], [a1 - 0.07, a1]]) roundWall(B, REDD, 0, 0, 2.18, 3.1, FY + 0.46, FY + 0.68, [], { a0: b0, a1: b1, seg: 60, collide: false });
      const n = 5; for (let i = 1; i < n; i++) { const a = a0 + (a1 - a0) * i / n; roundWall(B, REDD, 0, 0, 2.2, 3.0, FY + 0.455, FY + 0.468, [], { a0: a - 0.006, a1: a + 0.006, collide: false }); }
    }
    // 재떨이 스탠드(아스마의 자리)
    { const x = Math.cos(PI / 2 + 0.02) * 1.75, z = 1.75; B.geo(M.iron, cyl(0.02, 0.02, 0.6, 6), mat4(x, FY + 0.3, z)); B.geo(M.iron, cyl(0.14, 0.14, 0.02, 12), mat4(x, FY + 0.01, z)); B.geo(M.iron, cyl(0.11, 0.08, 0.06, 12), mat4(x, FY + 0.62, z)); }
    // 작은 초록 통풍구(문 맞은편 벽 위쪽)
    { const p = part(B, 0, 0, -RI + 0.03, 0); p(GREEN, box(0.5, 0.34, 0.05), 0, 3.0, 0); for (let k = 0; k < 5; k++) p(mat('plain', 0x2c6a3c), box(0.42, 0.02, 0.03), 0, 2.88 + k * 0.06, 0.03, 0.5); }
    // 벽가: 찻장, 임무 게시판, 화분
    {
      const a = PI, x = Math.cos(a) * 5.7, z = Math.sin(a) * 5.7, p = part(B, x, FY, z, PI / 2);
      p(M.beam, box(1.9, 0.86, 0.5), 0, 0.43, 0); p(M.beamLight, box(1.96, 0.04, 0.56), 0, 0.88, 0);
      for (const sx of [-0.62, 0, 0.62]) { p(M.beamLight, box(0.56, 0.7, 0.02), sx, 0.43, 0.255); p(M.iron, SPH, sx + 0.2, 0.46, 0.275, 0, 0, 0, 0.018); }
      p(M.iron, lathe([[0, 0], [0.1, 0], [0.13, 0.08], [0.11, 0.17], [0.05, 0.2], [0, 0.2]]), -0.5, 0.9, 0); p(M.iron, new THREE.TorusGeometry(0.09, 0.008, 5, 14, PI), -0.5, 1.1, 0);
      for (let k = 0; k < 5; k++) p(mat('plain', 0xe9e4d6, { rough: 0.5 }), cyl(0.036, 0.03, 0.06, 10), -0.12 + (k % 3) * 0.13, 0.93, -0.08 + Math.floor(k / 3) * 0.14);
      p(M.beamLight, box(0.5, 0.02, 0.32), 0.6, 0.91, 0);
      solid(x, FY, z, PI / 2, 1.96, 0.56, 0.9);
    }
    {
      const a = 0, p = part(B, Math.cos(a) * (RI - 0.06), FY, 0, -PI / 2);
      p(M.beam, box(1.9, 1.2, 0.04), 0, 1.6, 0); p(mat('plain', 0xb89a6a, { rough: 1 }), box(1.78, 1.08, 0.02), 0, 1.6, 0.025);
      const Rb = rngOf(404);
      for (let k = 0; k < 9; k++) p(mat('plain', k % 4 === 0 ? 0xe8d9a0 : 0xeee8d8, { rough: 1 }), box(0.3, 0.4, 0.004), -0.66 + (k % 5) * 0.33 + (Rb() - 0.5) * 0.05, 1.82 - Math.floor(k / 5) * 0.48 + (Rb() - 0.5) * 0.05, 0.04, 0, 0, (Rb() - 0.5) * 0.12);
      signBoard(B, '任務', Math.cos(a) * (RI - 0.1), FY + 2.4, 0, -PI / 2, 0.7, 0.3, { both: false });
    }
    for (const a of [PI / 2 - 0.5, PI / 2 + 0.5]) potAt(B, Math.cos(a) * 5.6, FY, Math.sin(a) * 5.6, 1.1);
    // 등
    for (const [x, z] of [[2.9, 2.9], [-2.9, 2.9], [0, -4.1]]) { B.geo(M.iron, cyl(0.008, 0.008, 0.5, 5), mat4(x, TOP - 0.36, z)); B.geo(BULB, lathe([[0, 0], [0.16, 0.02], [0.2, 0.14], [0.1, 0.24], [0, 0.26]]), mat4(x, TOP - 0.86, z)); glows.push([x, TOP - 0.74, z, 0.7]); lights.push([x, TOP - 0.9, z, 15, 15]); }

    // 앞마당: 큰길에서 문까지 포석, 긴 의자 둘, 화분
    B.box(M.pave, -1.6, 0, R + 1.0, 1.6, 0.035, R + 8.9, false);
    for (const s of [-1, 1]) { benchAt(B, M.beam, s * 3.3, 0, R + 2.2, 0, 2.2); potAt(B, s * 1.75, 0, R + 0.75, 1.2); }
    for (const s of [-1, 1]) { B.box(M.beam, s * 2.1 - 0.07, 0, R + 7.8, s * 2.1 + 0.07, 2.5, R + 7.94, false); glows.push(lantern(B, s * 2.1, 2.15, R + 7.87, { text: '上', color: 0xf0e2c0, r: 0.2, h: 0.5 })); addCollider(s * 2.1 - 0.1, 0, R + 7.77, s * 2.1 + 0.1, 2.5, R + 7.97); }
    return {
      places: [{ n: '상급닌자 대기소', t: '상급닌자들이 호카게의 명령이나 급한 일을 기다리며 머무는 곳. 기둥을 둘러싼 붉은 소파에 카카시·아스마·쿠레나이가 앉아 있곤 했다.', b: [-R, R, -R, R], y: [0, 9] },
        { n: '상급닌자 대기소 앞', t: '둥근 초록 간판에 上, 그 아래 갈색 간판에는 "人生色々"(인생은 가지가지).', b: [-5, 5, R, R + 9], y: [0, 9] }],
      jumps: [['상급닌자 대기소', 0, 0, R + 6.5, 0, 80]], glows, lights,
    };
  });
  out.places.push({ n: '상급닌자 대기소 터', t: '아카데미와 큰길 사이의 자리.', poly: Z.poly, b: bound(Z.poly) }, ...res.places);
  out.jumps.push(...res.jumps); out.glows.push(...res.glows); out.lights.push(...res.lights);
}

/* ============================ 전서구 탑 ============================
   매 같은 전서조가 소식을 실어 오고 쉬어 가는 곳. 통신반이 맡고, 암호해독반과 가까이 일한다.
   원작(나루토 위키)에 적힌 것: 높은 나무 꼭대기에 지은 둥근 건물, 나선 계단, 벽을 따라 늘어선 새장, 가운데의 긴 갈색 탁자,
   소식을 기다리며 앉는 바닥의 둥근 단, 앞쪽에 새가 내려앉는 말굽(U) 꼴 마루.
   나무 줄기가 방 뒤쪽을 뚫고 올라가는 짜임새, 두루마리 칸, 하늘을 도는 매는 지어낸 것이다. */
function aviary(scene, out) {
  const Z = zone(29), c0 = [Z.poly.reduce((s, p) => s + p[0], 0) / Z.poly.length, Z.poly.reduce((s, p) => s + p[1], 0) / Z.poly.length];
  const Y = 16, TR = 1.6, SR = 3.0, CZ = 3.3, R = 6.9, RI = 6.7, HT = 3.4, A0 = PI / 2, TA = PI * 4 - 0.45, N = 80, DA = TA / N;
  const at = { x: c0[0], z: c0[1], ry: PI / 2, ox: 0, oz: 5.5 };       // 말굽 마루가 큰길(동쪽)을 본다
  LOTS.push({ x: c0[0], z: c0[1], ry: 0, w: 27, d: 27 });
  const WOODT = mat('wood', 0x6e5843, { scale: 2 }), WALLM = mat('plaster', 0xe4d6b2), TILE = mat('tile', 0x6f7a45), CAGE = mat('wood', 0x8a6a44), WIRE = mat('plain', 0x2e2c2a, { rough: 0.6 });
  const stepM = mat('planks', 0x9a7450), BULB = mat('glow', 0xffe2a8);
  const turn = a => { let d = a - A0; d -= Math.floor(d / (PI * 2)) * PI * 2; return d; };                 // 계단이 시작하는 방향에서 잰 각(0~2π)
  const inRoom = (x, z) => x * x + (z - CZ) * (z - CZ) < RI * RI + 0.5;
  const res = put(scene, at, (B, holder) => {
    const glows = [], lights = [];
    // 줄기: 밑동이 벌어진 곧은 줄기가 방 뒤쪽을 뚫고 지붕 위까지 오른다
    {
      const H = Y + 7.5, pts = [];
      for (let i = 0; i <= 48; i++) pts.push(V(0, -0.5 + (H + 0.5) * i / 48, 0));
      const g = tube(pts, t => { const y = -0.5 + (H + 0.5) * t; return (y < Y + 1 ? TR * (1 + 0.34 * Math.exp(-Math.max(0, y) * 1.4)) : TR - (y - Y - 1) / 6.5 * 0.55) * (1 + 0.025 * Math.sin(y * 2.3)); }, 18, true);
      const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 10, uv.getY(i) * H);
      B.geo(WOODT, g);
      for (let i = -5; i < 5; i++) { const xa = i * 0.31, xm = Math.min(Math.abs(xa), Math.abs(xa + 0.31)), hz = Math.sqrt(1.55 * 1.55 - xm * xm); addCollider(xa, 0, -hz, xa + 0.31, H, hz); }
      for (let k = 0; k < 7; k++) {   // 땅 위로 드러난 뿌리(계단 들머리는 비운다)
        const a = A0 + 1.15 + k * 0.74, len = 2.6 + (k % 3) * 0.7, pr = [];
        for (let i = 0; i <= 6; i++) { const t = i / 6, r = 1.5 + len * t, aa = a + 0.25 * Math.sin(t * 2 + k); pr.push(V(Math.cos(aa) * r, 0.7 * (1 - t) * (1 - t) - 0.12 * t, Math.sin(aa) * r)); }
        B.geo(WOODT, tube(pr, t => 0.42 * (1 - 0.75 * t), 8, false));
      }
    }
    // 나선 계단: 줄기를 두 바퀴 감아 오른다. 밟는 면은 매끈한 비탈로 따로 적어 둔다(디딤판은 보이기만 한다).
    for (let k = 0; k < 2; k++) addRoof(-SR - 0.1, -SR - 0.1, SR + 0.1, SR + 0.1, (x, z) => {
      const r = Math.hypot(x, z);
      if (r < TR - 0.12 || r > SR + 0.08) return -Infinity;
      const h = (k * PI * 2 + turn(Math.atan2(z, x))) / TA * Y;
      return h > Y + 1e-6 ? -Infinity : h;
    });
    const rail = [];
    for (let i = 0; i < N; i++) {
      const a = A0 + i * DA, b = a + DA, yt = (i + 1) * Y / N, am = (a + b) / 2, cx = Math.cos(am), sz = Math.sin(am);
      roundWall(B, stepM, 0, 0, TR - 0.1, SR, yt - 0.07, yt, [], { a0: a, a1: b + 0.012, collide: false });
      beamBetween(B, M.beam, V(cx * (TR - 0.15), yt - 0.55, sz * (TR - 0.15)), V(cx * (SR - 0.15), yt - 0.1, sz * (SR - 0.15)), 0.07, 0.09);   // 줄기에서 뻗은 까치발
      B.box(M.beam, cx * (SR - 0.04) - 0.03, yt, sz * (SR - 0.04) - 0.03, cx * (SR - 0.04) + 0.03, yt + 1.0, sz * (SR - 0.04) + 0.03, false);  // 난간 기둥
      rail.push(V(cx * (SR - 0.04), yt + 1.02, sz * (SR - 0.04)));
      addCollider(cx * (SR + 0.06) - 0.2, yt - 0.3, sz * (SR + 0.06) - 0.2, cx * (SR + 0.06) + 0.2, yt + 1.1, sz * (SR + 0.06) + 0.2);
      if (i < 9) { const xs = [Math.cos(a) * TR, Math.cos(a) * SR, Math.cos(b) * TR, Math.cos(b) * SR], zs = [Math.sin(a) * TR, Math.sin(a) * SR, Math.sin(b) * TR, Math.sin(b) * SR]; addCollider(Math.min(...xs) + 0.05, 0, Math.min(...zs) + 0.05, Math.max(...xs) - 0.05, yt - 0.02, Math.max(...zs) - 0.05); B.box(M.beam, cx * 2.3 - 0.05, 0, sz * 2.3 - 0.05, cx * 2.3 + 0.05, yt - 0.07, sz * 2.3 + 0.05, false); }
    }
    B.geo(M.beam, tube(rail, 0.045, 6, true));
    { const p = rail[0]; B.box(M.beam, p.x - 0.06, 0, p.z - 0.06, p.x + 0.06, 1.3, p.z + 0.06, false); }
    // 밑동의 포석과 팻말
    plate(B, M.pave, -5.4, -5.4, 5.4, 5.4, 0, 0.035, (x, z) => { const r = Math.hypot(x, z); return r < 5.4 && r > 1.5; }, false);
    B.box(M.pave, 2.2, 0, 4.5, 3.8, 0.035, 14, false);
    { for (const s of [-1, 1]) B.box(M.beam, 4.6 + s * 0.75 - 0.06, 0, 4.14, 4.6 + s * 0.75 + 0.06, 2.3, 4.26, false); signBoard(B, '通信班', 4.6, 1.85, 4.2, 0, 1.5, 0.5); signBoard(B, '伝書鳥', 4.6, 1.3, 4.2, 0, 1.1, 0.34); addCollider(3.8, 0, 4.1, 5.4, 2.3, 4.3); }

    // 방을 받치는 굵은 가지: 계단 길을 비켜 줄기에서 뻗어 올라 바닥 밑 둘레보를 받친다
    for (const b of [0.5, 1.5, 2.6, -0.5, -1.5, -2.6]) {
      const tx = Math.cos(A0 + b) * 5.6, tz = CZ + Math.sin(A0 + b) * 5.6, al = Math.atan2(tz, tx), h0 = turn(al) / TA * Y, ca = Math.cos(al), sa = Math.sin(al);
      const cv = new THREE.CatmullRomCurve3([V(ca * 1.2, h0 + 5.1, sa * 1.2), V(ca * 2.4, h0 + 6.2, sa * 2.4), V(ca * 3.5, Math.min(Y - 1.2, h0 + 7.3), sa * 3.5), V((ca * 3.5 + tx) / 2, (Math.min(Y - 1.2, h0 + 7.3) + Y) / 2 + 0.3, (sa * 3.5 + tz) / 2), V(tx, Y - 0.45, tz)]);
      B.geo(WOODT, tube(cv.getPoints(18), t => 0.46 - 0.2 * t, 9, true), null, [3, 8]);
    }
    roundWall(B, M.beam, 0, CZ, 6.2, 6.85, Y - 0.6, Y - 0.22, [], { collide: false });
    for (let k = 0; k < 7; k++) { const x = -5.4 + k * 1.8, hz = Math.sqrt(Math.max(0, 6.3 * 6.3 - x * x)); B.box(M.beam, x - 0.09, Y - 0.5, CZ - hz, x + 0.09, Y - 0.22, CZ + hz, false); }
    // 바닥: 줄기 둘레의 계단 구멍만 비우고, 계단이 끝나는 자리는 참으로 잇는다
    plate(B, M.floor, -R, CZ - R, R, CZ + R, Y - 0.22, Y, (x, z) => {
      if (x * x + (z - CZ) * (z - CZ) > R * R) return false;
      const r = Math.hypot(x, z);
      if (r > SR + 0.06) return true;
      return r > TR - 0.15 && turn(Math.atan2(z, x)) > PI * 2 - 0.47;
    });
    // 계단 구멍의 난간
    roundRailing(B, M.beam, 0, 0, SR + 0.16, Y, 1.0, A0 + 0.04, A0 + PI * 2 - 0.5);
    railing(B, M.beam, [[0, TR - 0.05], [0.14, SR + 0.16]].map(([x, z]) => [x + 0.14, z]), Y, 1.0);
    // 둥근 벽: 앞은 말굽 마루로 크게 트이고, 양옆에 새가 드나드는 살창
    const WINS = [1.05, -1.05, 1.78, -1.78].map(d => A0 + d);
    roundWall(B, WALLM, 0, CZ, RI, R, Y, Y + HT, [{ a0: A0 - 0.42, a1: A0 + 0.42, ys: [[Y, Y + 2.7]] }, ...WINS.map(a => ({ a0: a - 0.18, a1: a + 0.18, ys: [[Y + 1.0, Y + 2.4]] }))], { matIn: M.white });
    for (const a of WINS) roundWindow(B, 0, CZ, RI, R, a - 0.18, a + 0.18, Y + 1.0, Y + 2.4, { frame: M.beam, nx: 4, ny: 3, glass: false });
    for (const s of [-1, 1]) { const a = A0 + s * 0.42; B.geo(M.beam, cyl(0.13, 0.13, 2.9, 10), mat4(Math.cos(a) * (R - 0.1), Y + 1.45, CZ + Math.sin(a) * (R - 0.1))); }
    roundWall(B, M.beam, 0, CZ, RI - 0.04, R + 0.05, Y + 2.7, Y + 2.92, [], { a0: A0 - 0.44, a1: A0 + 0.44, collide: false });
    roundWall(B, M.beam, 0, CZ, R, R + 0.05, Y + HT - 0.2, Y + HT, [], { collide: false });
    // 천장과 지붕
    plate(B, M.white, -RI, CZ - RI, RI, CZ + RI, Y + HT - 0.1, Y + HT - 0.02, (x, z) => x * x + (z - CZ) * (z - CZ) < RI * RI && Math.hypot(x, z) > 1.25, false);
    for (let k = 0; k < 8; k++) { const a = k * PI / 4 + 0.2; beamBetween(B, M.beam, V(Math.cos(a) * 1.2, Y + HT - 0.16, CZ + Math.sin(a) * 1.2), V(Math.cos(a) * RI, Y + HT - 0.16, CZ + Math.sin(a) * RI), 0.12, 0.12); }
    coneRoof(B, TILE, 0, CZ, R + 0.9, Y + HT, 3.0);
    B.geo(M.beam, new THREE.TorusGeometry(1.42, 0.14, 6, 18).rotateX(PI / 2), mat4(0, Y + HT + 1.55, 0, -0.36, 0, 0));        // 줄기가 지붕을 뚫는 자리의 테

    // 말굽 꼴 마루: 새가 내려앉는 자리
    const DR = 9.3, DA2 = 0.95;
    plate(B, stepM, -DR, CZ, DR, CZ + DR, Y - 0.2, Y, (x, z) => { const r = Math.hypot(x, z - CZ); return r >= R - 0.05 && r < DR && Math.abs(Math.atan2(z - CZ, x) - A0) < DA2; });
    roundWall(B, M.beam, 0, CZ, DR - 0.3, DR + 0.04, Y - 0.26, Y + 0.02, [], { a0: A0 - DA2 - 0.01, a1: A0 + DA2 + 0.01, collide: false });       // 가장자리 테(띠로 깐 마루의 끝을 가린다)
    for (const s of [-1, 1]) { const a = A0 + s * (DA2 + 0.005); beamBetween(B, M.beam, V(Math.cos(a) * (R - 0.1), Y - 0.12, CZ + Math.sin(a) * (R - 0.1)), V(Math.cos(a) * DR, Y - 0.12, CZ + Math.sin(a) * DR), 0.3, 0.28); }
    roundRailing(B, M.beam, 0, CZ, DR - 0.1, Y, 1.05, A0 - DA2 + 0.02, A0 + DA2 - 0.02, { gap: 0.4 });
    for (const s of [-1, 1]) { const a = A0 + s * (DA2 - 0.02); railing(B, M.beam, [[Math.cos(a) * (R + 0.05), CZ + Math.sin(a) * (R + 0.05)], [Math.cos(a) * (DR - 0.1), CZ + Math.sin(a) * (DR - 0.1)]], Y, 1.05, { gap: 0.4 }); }
    for (let k = 0; k < 5; k++) {   // 마루를 받치는 까치발
      const a = A0 + (k - 2) * 0.44, ca = Math.cos(a), sa = Math.sin(a);
      B.box(M.beam, ca * 6.6 - 0.08, Y - 1.9, CZ + sa * 6.6 - 0.08, ca * 6.6 + 0.08, Y - 0.5, CZ + sa * 6.6 + 0.08, false);
      beamBetween(B, M.beam, V(ca * 6.6, Y - 1.8, CZ + sa * 6.6), V(ca * (DR - 0.2), Y - 0.24, CZ + sa * (DR - 0.2)), 0.11, 0.13);
      beamBetween(B, M.beam, V(ca * 6.4, Y - 0.3, CZ + sa * 6.4), V(ca * (DR - 0.1), Y - 0.3, CZ + sa * (DR - 0.1)), 0.11, 0.12);
    }
    for (const s of [-1, 1]) {      // 높은 홰
      const a = A0 + s * 0.5, x = Math.cos(a) * 8.4, z = CZ + Math.sin(a) * 8.4;
      B.box(M.beam, x - 0.05, Y, z - 0.05, x + 0.05, Y + 1.9, z + 0.05, false); B.geo(M.beam, cyl(0.03, 0.03, 1.2, 8).rotateZ(PI / 2), mat4(x, Y + 1.9, z, 0, a - A0, 0));
      addCollider(x - 0.1, Y, z - 0.1, x + 0.1, Y + 1.9, z + 0.1);
      hawk(B, mat4(x + s * 0.3 * Math.cos(a - A0), Y + 1.93, z, 0, s * 0.5 + 0.2, 0), 1.25);
    }
    for (const d of [-0.62, 0.1, 0.71]) { const a = A0 + d; hawk(B, mat4(Math.cos(a) * (DR - 0.1), Y + 1.07, CZ + Math.sin(a) * (DR - 0.1), 0, d * 1.3 + 0.3, 0), 1.2); }

    // 새장: 벽을 따라 두 단으로
    const Rc = rngOf(2929);
    for (const d of [0.645, -0.645, 1.42, -1.42, 2.12, -2.12, 2.46, -2.46]) {
      const a = A0 + d, x = Math.cos(a) * 6.2, z = CZ + Math.sin(a) * 6.2, ry = Math.atan2(-Math.cos(a), -Math.sin(a)), p = part(B, x, Y, z, ry);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) p(CAGE, box(0.05, 2.3, 0.05), sx * 0.46, 1.15, sz * 0.33);
      for (const [y0, y1] of [[0.45, 1.32], [1.4, 2.27]]) {
        p(CAGE, box(0.97, 0.04, 0.71), 0, y0, 0); p(CAGE, box(0.97, 0.04, 0.71), 0, y1, 0); p(CAGE, box(0.9, 0.02, 0.64), 0, y0 + 0.04, 0);
        for (let i = 1; i < 10; i++) p(WIRE, box(0.012, y1 - y0, 0.012), -0.46 + i * 0.092, (y0 + y1) / 2, 0.33);
        for (const sx of [-1, 1]) for (let i = 1; i < 6; i++) p(WIRE, box(0.012, y1 - y0, 0.012), sx * 0.46, (y0 + y1) / 2, -0.33 + i * 0.11);
        p(CAGE, cyl(0.016, 0.016, 0.9, 6).rotateZ(PI / 2), 0, y0 + 0.3, -0.05);
        p(mat('plain', 0xb8a070, { rough: 0.8 }), cyl(0.06, 0.05, 0.04, 8), 0.3, y0 + 0.06, 0.2);
        if (Rc() < 0.6) hawk(B, new THREE.Matrix4().multiplyMatrices(p.base, mat4((Rc() - 0.5) * 0.4, y0 + 0.315, -0.05, 0, (Rc() - 0.5) * 1.2, 0)), 1.05);
      }
      solid(x, Y, z, ry, 0.98, 0.72, 2.3);
    }
    // 가운데의 긴 갈색 탁자: 소식 두루마리와 통, 먹과 붓
    {
      const tx = 0.4, tz = 6.6;
      tableAt(B, M.beam, tx, Y, tz, 0, 3.3, 0.95);
      const sg = cyl(0.035, 0.035, 0.26, 8).rotateZ(PI / 2);
      for (let k = 0; k < 7; k++) B.geo(mat('plain', SCROLL_HEX[k % SCROLL_HEX.length], { rough: 0.9 }), sg, mat4(tx - 1.3 + (k % 4) * 0.2, Y + 0.775 + (k > 3 ? 0.062 : 0), tz - 0.2 + (k > 3 ? 0.03 : (k % 2) * 0.09), 0, 0.2 * (k % 3 - 1), 0));
      B.geo(mat('plain', 0xeee8d8, { rough: 1 }), box(0.6, 0.004, 0.36), mat4(tx - 0.1, Y + 0.744, tz + 0.1, 0, 0.1, 0));
      B.geo(mat('plain', 0x1c1a18, { rough: 0.5 }), box(0.14, 0.03, 0.2), mat4(tx + 0.4, Y + 0.757, tz + 0.12)); B.geo(M.beam, cyl(0.008, 0.008, 0.22, 5).rotateX(PI / 2), mat4(tx + 0.56, Y + 0.75, tz + 0.1, 0, 0.3, 0));
      for (let k = 0; k < 4; k++) B.geo(mat('plain', 0xb9925a, { rough: 0.7 }), cyl(0.022, 0.022, 0.11, 8), mat4(tx + 1.0 + (k % 2) * 0.07, Y + 0.8, tz - 0.15 + Math.floor(k / 2) * 0.07));   // 새 다리에 매는 통
      { const pm = mat4(tx + 1.35, Y + 0.742, tz + 0.1); B.geo(M.beam, cyl(0.1, 0.12, 0.03, 10), pm); B.geo(M.beam, cyl(0.015, 0.015, 0.4, 6), mat4(tx + 1.35, Y + 0.94, tz + 0.1)); B.geo(M.beam, cyl(0.014, 0.014, 0.3, 6).rotateZ(PI / 2), mat4(tx + 1.35, Y + 1.14, tz + 0.1)); hawk(B, mat4(tx + 1.35, Y + 1.155, tz + 0.1, 0, -2.2, 0), 1.2); }   // 탁자 위 홰에 앉은 매
      for (const sx of [-1, 1]) benchAt(B, M.beam, tx, Y, tz + sx * 0.85, 0, 2.6);
    }
    // 소식을 기다리며 앉는 둥근 단
    {
      const x = -3.7, z = 5.4;
      B.geo(M.beamLight, cyl(1.15, 1.15, 0.26, 28), mat4(x, Y + 0.13, z)); B.geo(M.tatami, new THREE.CircleGeometry(1.05, 28).rotateX(-PI / 2), mat4(x, Y + 0.265, z), [2, 2]);
      for (let k = 0; k < 3; k++) B.geo(mat('plain', [0x7a3a34, 0x3d5a80, 0x4a7a58][k], { rough: 1 }), box(0.5, 0.07, 0.5), mat4(x + Math.cos(k * 2.1) * 0.55, Y + 0.3, z + Math.sin(k * 2.1) * 0.55, 0, k, 0));
      for (let i = -4; i < 4; i++) { const xa = i * 0.29, xm = Math.min(Math.abs(xa), Math.abs(xa + 0.29)), hz = Math.sqrt(1.33 - xm * xm); addCollider(x + xa, Y, z - hz, x + xa + 0.29, Y + 0.26, z + hz); }
    }
    // 두루마리 칸(받은 소식을 나눠 넣는다)
    { const a = A0 - 1.42, x = Math.cos(a) * 4.9, z = CZ + Math.sin(a) * 4.9; shelfAt(B, M.beam, 4.3, Y, 5.6, -PI / 2, 1.5, 1.7, 4, rngOf(77)); signBoard(B, '暗号班行', 4.1, Y + 1.95, 5.6, -PI / 2, 0.9, 0.26, { both: false }); void x; void z; }
    for (const [x, z] of [[0, 8.2], [-3, 3.6], [3.4, 3.2]]) { B.geo(M.iron, cyl(0.008, 0.008, 0.5, 5), mat4(x, Y + HT - 0.36, z)); B.geo(BULB, lathe([[0, 0], [0.16, 0.02], [0.2, 0.14], [0.1, 0.24], [0, 0.26]]), mat4(x, Y + HT - 0.86, z)); glows.push([x, Y + HT - 0.74, z, 0.7]); lights.push([x, Y + HT - 0.9, z, 15, 15]); }

    // 지붕 위로 퍼진 나무갓(바람에 흔들리므로 따로 그린다)
    {
      const tg = treeGeometry(2929, { height: 23, depth: 4, sprays: 6, leaves: 7, leafLen: 0.75, spread: 1.15 });
      for (const [g, m] of [[tg.wood, mat('bark', 0x6e5843)], [tg.leaves, mat('leaf', 0x35702a)]]) { const me = new THREE.Mesh(g, m); me.position.set(0, Y + 5.2, 0); me.castShadow = true; me.receiveShadow = true; holder.add(me); }
    }
    return {
      places: [{ n: '전서구 탑', t: '높은 나무 꼭대기의 둥근 집. 매들이 다른 마을의 소식을 실어 오고 쉬어 간다. 통신반이 맡아 암호해독반과 함께 일한다.', b: [-9.5, 9.5, -6, 13], y: [0, 60] },
        { n: '전서구 탑의 새장', t: '벽을 따라 새장이 늘어서 있고, 가운데 긴 탁자에서 소식을 풀고 묶는다.', b: [-R, R, CZ - R, CZ + R], y: [Y, Y + HT] },
        { n: '새가 내려앉는 마루', t: '먼 길을 날아온 매가 내려앉는 말굽 꼴 마루. 마을이 한눈에 내려다보인다.', b: [-8, 8, CZ + R, CZ + DR], y: [Y, Y + HT] }],
      jumps: [['전서구 탑', 4.6, 0, 9.5, 0.5, 81], ['전서구 탑 위(새장)', 0, Y, 4.6, PI, 82]], glows, lights,
    };
  });
  out.places.push(...res.places); out.jumps.push(...res.jumps); out.glows.push(...res.glows); out.lights.push(...res.lights);
  // 탑 위를 맴도는 매
  const birds = [0, 1, 2].map(i => { const f = flyingHawk(); f.g.scale.setScalar(1.7); scene.add(f.g); return { ...f, r: 15 + i * 6, y: Y + 13 + i * 4.5, sp: (i % 2 ? -1 : 1) * (0.2 - i * 0.03), ph: i * 2.1 }; });
  const fly = t => {
    for (const b of birds) {
      const a = t * b.sp + b.ph, dir = Math.sign(b.sp);
      b.g.position.set(c0[0] + Math.cos(a) * b.r, b.y + Math.sin(t * 0.23 + b.ph) * 1.6, c0[1] + Math.sin(a) * b.r);
      b.g.rotation.set(0, Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir), -dir * 0.3);
      const beat = Math.max(0, Math.sin(t * 0.5 + b.ph * 3)) > 0.8 ? Math.sin(t * 9) * 0.5 : 0.1 + Math.sin(t * 1.3 + b.ph) * 0.05;   // 주로 미끄러지듯 날다가 이따금 날갯짓
      b.wings[0].rotation.z = -beat; b.wings[1].rotation.z = beat;
    }
  };
  fly(0); out.ticks.push(fly);
}

/* ============================ 정보부 ============================
   모리노 이비키가 이끄는 나뭇잎 마을 정보부. 고문·심문 부대가 여기에 자리를 두고, 야마나카 이노이치의 해석반이 사로잡은 적의 머릿속에서 정보를 읽어 낸다.
   카린과 사스케가 이곳에 갇힌 적이 있다(여기까지가 나루토 위키에 적힌 것).
   원작에는 건물의 생김새가 글로 남아 있지 않아, 담을 두른 터에 본관(3층)·해석동(둥근 집)·유치동을 두는 짜임새와 방 배치·가구는 모두 지어낸 것이다.
   해석동의 장치(사로잡은 사람을 가둔 둥근 통과 그 둘레의 술식)는 원작의 장면을 본떴다. */
function intel(scene, out) {
  const Z = zone(28), U = uchihaKit(), R = rngOf(2828);
  const at = { x: -31.5, z: 73, ry: PI / 2 };          // 정문이 큰길(동쪽)을 본다. 제 좌표의 +x가 북쪽(관저 쪽)
  LOTS.push({ x: at.x, z: at.z, ry: at.ry, w: 68, d: 29 });
  OPEN.push([-16.25, at.z, 5]);                        // 정문 앞의 가로수 한 그루는 심지 않는다
  const WALLM = mat('plaster', 0xa9aea6), TILE = mat('tile', 0x39424a), TRIM = mat('wood', 0x2f3436), IRON = mat('metal', 0x3a3d42, { rough: 0.6 }), STEEL = mat('metal', 0x8b9094, { rough: 0.5 });
  const GREYF = mat('plain', 0x77736a, { rough: 0.95 }), CABM = mat('plain', 0x66705f, { rough: 0.6, metal: 0.3 }), BULB = mat('glow', 0xffe2a8), DARKG = mat('plain', 0x1a2226, { rough: 0.1, metal: 0.4 });
  const PAPER = mat('plain', 0xeee8d8, { rough: 1 }), BLACK = mat('plain', 0x1b1b1e, { rough: 0.9 }), COT = mat('plain', 0xb8b2a0, { rough: 1 });
  const T = 0.25;
  const res = put(scene, at, B => {
    const glows = [], lights = [], lamp = (x, yc, z, pow = 14) => { B.geo(M.iron, cyl(0.008, 0.008, 0.5, 5), mat4(x, yc - 0.25, z)); B.geo(IRON, new THREE.ConeGeometry(0.2, 0.14, 12, 1, true), mat4(x, yc - 0.5, z)); B.geo(BULB, SPH, mat4(x, yc - 0.58, z, 0, 0, 0, 0.06)); glows.push([x, yc - 0.6, z, 0.6]); lights.push([x, yc - 0.75, z, pow, 14]); };
    /* ----- 담과 정문 ----- */
    const X0 = -33, X1 = 33, Z0 = -13.5, Z1 = 13.5;
    U.capWall(B, 'x', Z0, X0, X1, 3.0, 0.5, TILE); U.capWall(B, 'z', X0, Z0, Z1, 3.0, 0.5, TILE); U.capWall(B, 'z', X1, Z0, Z1, 3.0, 0.5, TILE);
    U.capWall(B, 'x', Z1, X0, -2.9, 3.0, 0.5, TILE); U.capWall(B, 'x', Z1, 2.9, X1, 3.0, 0.5, TILE);
    for (const s of [-1, 1]) { B.box(TRIM, s * 2.7 - 0.22, 0, Z1 - 0.22, s * 2.7 + 0.22, 4.3, Z1 + 0.22); B.box(M.stone, s * 2.7 - 0.32, 0, Z1 - 0.32, s * 2.7 + 0.32, 0.4, Z1 + 0.32, false); }
    B.box(TRIM, -3.5, 3.4, Z1 - 0.11, 3.5, 3.64, Z1 + 0.11, false); B.box(TRIM, -3.9, 4.16, Z1 - 0.16, 3.9, 4.4, Z1 + 0.16, false);
    gableRoof(B, TILE, -3.7, Z1 - 0.8, 3.7, Z1 + 0.8, 4.4, 0.75, { ridge: 'x', over: 0.5, overGable: 0.5 });
    signBoard(B, '木ノ葉隠れ情報部', 2.7, 2.2, Z1 + 0.26, 0, 0.42, 2.5, { vertical: true, both: false });
    signBoard(B, '関係者以外立入禁止', -2.7, 2.2, Z1 + 0.26, 0, 0.3, 2.3, { vertical: true, both: false, bg: '#efe8d8', color: '#8a1c16' });
    for (const s of [-1, 1]) glows.push(lantern(B, s * 2.0, 3.0, Z1 + 0.3, { text: '情', color: 0xf0e2c0, r: 0.19, h: 0.48 }));
    // 마당의 포석: 정문 → 본관, 본관 앞에서 해석동·유치동으로
    B.box(M.pave, -1.7, 0, 2, 1.7, 0.035, Z1 + 4.5, false); B.box(M.pave, -24, 0, 5.2, 24, 0.035, 7.4, false);
    B.box(M.pave, -23.2, 0, 2.6, -20.8, 0.035, 5.2, false); B.box(M.pave, 15.2, 0, -3, 17.4, 0.035, 5.2, false); B.box(M.pave, 11, 0, -2.2, 15.2, 0.035, -0.2, false);
    for (const [x, z] of [[-8, 10.5], [8, 10.5], [-30, 10], [30, 10], [-30, -10.5], [12.6, -10.5]]) B.geo(mat('leaf', 0x35702a), BUSH.leaves, mat4(x, 0, z, 0, x, 0, 1.5 + (x % 3) * 0.1));

    /* ----- 본관: 3층. 1층만 들어갈 수 있다 ----- */
    const MX0 = -11, MX1 = 11, MZ0 = -10, MZ1 = 2, F = 0.2, C1 = 3.4, MT = 9.5, UPS = [3.5, 6.5];
    B.box(M.stone, MX0 - 0.15, 0, MZ0 - 0.15, MX1 + 0.15, 0.1, MZ1 + 0.15, false);
    B.box(M.floorDark, MX0 + T, 0, MZ0 + T, MX1 - T, F, MZ1 - T);
    B.box(M.stone, -1.6, 0, MZ1, 1.6, 0.1, MZ1 + 1.2, false);
    face(B, WALLM, 'x', MZ1 - T, MZ1, MX0, MX1, 0, MT, 1, [[-9.2, -7.6, 'w'], [-4.6, -3, 'w'], [-1.1, 1.1, 'd'], [3, 4.6, 'w'], [7.6, 9.2, 'w']], UPS, TRIM, IRON);
    face(B, WALLM, 'x', MZ0, MZ0 + T, MX0, MX1, 0, MT, -1, [[-9, -7.4, 'u'], [-4, -2.4, 'u'], [2.4, 4, 'u'], [7.4, 9, 'w']], UPS, TRIM, IRON);
    face(B, WALLM, 'z', MX0, MX0 + T, MZ0 + T, MZ1 - T, 0, MT, -1, [[-8, -6.4, 'u'], [-2.2, -0.6, 'w']], UPS, TRIM, IRON);
    face(B, WALLM, 'z', MX1 - T, MX1, MZ0 + T, MZ1 - T, 0, MT, 1, [[-8, -6.4, 'w'], [-1.8, -0.6, 'd']], UPS, TRIM, IRON);
    B.box(M.white, MX0 + T, C1, MZ0 + T, MX1 - T, C1 + 0.1, MZ1 - T);                    // 1층 천장
    for (const y of [3.5, 6.5]) { B.box(TRIM, MX0 - 0.06, y - 0.12, MZ0 - 0.06, MX1 + 0.06, y + 0.06, MZ0, false); B.box(TRIM, MX0 - 0.06, y - 0.12, MZ1, MX1 + 0.06, y + 0.06, MZ1 + 0.06, false); B.box(TRIM, MX0 - 0.06, y - 0.12, MZ0, MX0, y + 0.06, MZ1, false); B.box(TRIM, MX1, y - 0.12, MZ0, MX1 + 0.06, y + 0.06, MZ1, false); }
    for (const [x, z] of [[MX0, MZ0], [MX0, MZ1], [MX1, MZ0], [MX1, MZ1]]) B.box(TRIM, x - 0.13, 0, z - 0.13, x + 0.13, MT, z + 0.13, false);
    hipRoof(B, TILE, MX0, MZ0, MX1, MZ1, MT, 2.6, { over: 0.9 });
    signBoard(B, '情報部', 0, 3.02, MZ1 + 0.08, 0, 2.3, 0.56, { both: false });
    for (const s of [-1, 1]) { B.box(TRIM, s * 1.7 - 0.06, 0, MZ1 + 0.3, s * 1.7 + 0.06, 2.5, MZ1 + 0.42, false); glows.push(lantern(B, s * 1.7, 2.1, MZ1 + 0.72, { color: 0xf0e2c0, r: 0.18, h: 0.46 })); beamBetween(B, TRIM, V(s * 1.7, 2.44, MZ1 + 0.36), V(s * 1.7, 2.44, MZ1 + 0.76), 0.05, 0.05); }
    // 칸막이
    const PW = (axis, c, u0, u1, ops) => { wall(B, M.white, axis, c - 0.08, c + 0.08, u0, u1, F, C1, ops.map(([a, b, k]) => ({ u0: a, u1: b, ys: [k === 'd' ? [F, 2.4] : [1.2, 2.3]] })), true, true); for (const [a, b, k] of ops) if (k === 'd') doorUnit(B, axis, c - 0.08, c + 0.08, a, b, F, 2.4, { frame: TRIM, leaf: null }); };
    PW('z', -5, MZ0 + T, MZ1 - T, [[-7.5, -6.5, 'd'], [-1.6, -0.6, 'd']]);
    PW('z', 5, MZ0 + T, MZ1 - T, [[-7.5, -6.5, 'd'], [-1.6, -0.6, 'd']]);
    PW('x', -3.5, MX0 + T, -5.08, [[-9.6, -7.2, 'm']]);
    PW('x', -3.5, 5.08, MX1 - T, []);
    windowUnit(B, 'x', -3.58, -3.42, -9.6, -7.2, 1.2, 2.3, { frame: TRIM, glass: false, sill: false, nx: 1, ny: 1 });
    B.box(DARKG, -9.6, 1.2, -3.51, -7.2, 2.3, -3.49);                                    // 심문실을 들여다보는 유리(안쪽에서는 거울)
    // 현관 홀: 접수대, 긴 의자, 게시판
    {
      const p = part(B, 0, F, -6.6, 0);
      p(TRIM, box(4.2, 1.05, 0.6), 0, 0.525, 0); p(M.beam, box(4.4, 0.05, 0.8), 0, 1.075, 0); for (let k = 0; k < 5; k++) p(M.beam, box(0.04, 1.0, 0.02), -1.8 + k * 0.9, 0.52, 0.31);
      p(PAPER, box(0.5, 0.03, 0.36), -0.9, 1.115, 0.05, 0, 0.1); p(BLACK, box(0.46, 0.012, 0.32), -0.9, 1.136, 0.05, 0, 0.1);
      p(mat('metal', 0xc9a24a, { rough: 0.4 }), SPH, 0.4, 1.12, 0.15, 0, 0, 0, [0.06, 0.04, 0.06]); p(M.iron, cyl(0.07, 0.07, 0.015, 12), 0.4, 1.105, 0.15);
      for (let k = 0; k < 3; k++) p(mat('plain', SCROLL_HEX[k + 1], { rough: 0.9 }), cyl(0.04, 0.04, 0.3, 8).rotateZ(PI / 2), 1.3, 1.14 + (k === 2 ? 0.07 : 0), -0.1 + (k % 2) * 0.09 + (k === 2 ? 0.045 : 0));
      addCollider(-2.2, F, -7.0, 2.2, F + 1.1, -6.2);
      shelfAt(B, M.beam, -2.4, F, MZ0 + T + 0.2, 0, 2.0, 2.2, 5, R); shelfAt(B, M.beam, 2.4, F, MZ0 + T + 0.2, 0, 2.0, 2.2, 5, R);
      signBoard(B, '受付', 0, F + 2.6, -6.6, 0, 0.9, 0.34);
      B.geo(M.iron, cyl(0.006, 0.006, 0.45, 4), mat4(-0.35, C1 - 0.22, -6.6)); B.geo(M.iron, cyl(0.006, 0.006, 0.45, 4), mat4(0.35, C1 - 0.22, -6.6));
      chairAt(B, M.beam, 0, F, -7.7, 0);
      for (const s of [-1, 1]) { benchAt(B, M.beam, s * 4.35, F, -3.6, PI / 2, 2.4); potAt(B, s * 4.2, F, 1.1, 1.1); }
      // 게시판(서쪽 칸막이) — 수배 전단
      const q = part(B, -4.9, F, -4.1, PI / 2);
      q(M.beam, box(2.0, 1.2, 0.04), 0, 1.5, 0); q(mat('plain', 0xb89a6a, { rough: 1 }), box(1.88, 1.08, 0.02), 0, 1.5, 0.025);
      for (let k = 0; k < 8; k++) q(k % 3 ? PAPER : mat('plain', 0xe8d9a0, { rough: 1 }), box(0.32, 0.42, 0.004), -0.7 + (k % 4) * 0.46 + (R() - 0.5) * 0.05, 1.76 - Math.floor(k / 4) * 0.5, 0.04, 0, 0, (R() - 0.5) * 0.1);
      signBoard(B, '尋問室', -4.9, F + 2.62, -7, PI / 2, 0.8, 0.26, { both: false }); signBoard(B, '資料室', -4.9, F + 2.62, -1.1, PI / 2, 0.8, 0.26, { both: false });
      signBoard(B, '部長室', 4.9, F + 2.62, -7, -PI / 2, 0.8, 0.26, { both: false }); signBoard(B, '詰所', 4.9, F + 2.62, -1.1, -PI / 2, 0.6, 0.26, { both: false });
      lamp(0, C1, -2.5, 16); lamp(0, C1, -8.3, 12);
    }
    // 심문실: 쇠 탁자 하나, 의자 둘, 갓등 하나
    {
      tableAt(B, STEEL, -8.2, F, -7, 0, 1.5, 0.8); chairAt(B, STEEL, -8.2, F, -7.85, 0); chairAt(B, M.beam, -8.2, F, -6.15, PI);
      B.geo(PAPER, box(0.3, 0.004, 0.42), mat4(-8.4, F + 0.744, -7.1, 0, 0.2, 0)); B.geo(BLACK, cyl(0.008, 0.008, 0.16, 5).rotateZ(PI / 2), mat4(-8.05, F + 0.75, -7.05, 0, 0.5, 0));
      for (const z of [-9.2, -8.6]) { B.geo(IRON, new THREE.TorusGeometry(0.07, 0.014, 6, 12), mat4(MX0 + T + 0.03, F + 1.5, z, 0, PI / 2, 0)); B.geo(IRON, cyl(0.02, 0.02, 0.06, 6).rotateZ(PI / 2), mat4(MX0 + T + 0.03, F + 1.57, z)); }
      B.geo(STEEL, cyl(0.16, 0.13, 0.28, 12, 1), mat4(-10.2, F + 0.14, -4.2));
      lamp(-8.2, C1, -7, 9);
    }
    // 자료실: 심문실을 들여다보는 책상, 서류함과 두루마리 선반
    {
      deskAt(B, M.beam, -8.4, F, -2.6, PI, 2.0, 0.7); chairAt(B, M.beam, -9, F, -1.8, PI); chairAt(B, M.beam, -7.8, F, -1.8, PI);
      B.geo(PAPER, box(0.3, 0.02, 0.4), mat4(-8.9, F + 0.79, -2.6, 0, 0.1, 0)); B.geo(PAPER, box(0.3, 0.004, 0.4), mat4(-7.9, F + 0.782, -2.55, 0, -0.2, 0));
      cabinetAt(B, CABM, -5.45, F, 0.25, -PI / 2, 0.9, 1.4);      // 문(z -1.6~-0.6)을 막지 않게 문 남쪽 벽에 붙인다
      for (const z of [0.35, 1.28]) cabinetAt(B, CABM, -10.3, F, z, PI / 2, 0.9, 1.4);
      shelfAt(B, M.beam, -6.4, F, MZ1 - T - 0.2, PI, 1.8, 2.2, 5, R);                      // 앞벽의 창을 가리지 않는 자리
      lamp(-8, C1, -0.6, 13);
    }
    // 부장실: 이비키의 책상, 서가, 걸어 둔 검은 외투
    {
      deskAt(B, M.beam, 8, F, -7.8, 0, 2.0, 0.9); chairAt(B, M.beam, 8, F, -8.75, 0);
      for (const sx of [-0.55, 0.55]) chairAt(B, M.beam, 8 + sx, F, -6.5, PI);
      B.geo(PAPER, box(0.34, 0.05, 0.44), mat4(7.5, F + 0.805, -7.8, 0, 0.1, 0)); B.geo(mat('plain', SCROLL_HEX[2], { rough: 0.9 }), cyl(0.04, 0.04, 0.34, 8).rotateZ(PI / 2), mat4(8.5, F + 0.82, -7.7, 0, 0.3, 0));
      B.geo(mat('plain', 0x1c1a18, { rough: 0.5 }), box(0.14, 0.03, 0.2), mat4(8.1, F + 0.795, -8.05));
      shelfAt(B, M.beam, MX1 - T - 0.2, F, -5.0, -PI / 2, 1.9, 2.3, 5, R); cabinetAt(B, CABM, 5.45, F, -9, PI / 2, 0.9, 1.4);
      // 옷걸이에 건 검은 긴 외투와 두건
      const p = part(B, 10.1, F, -9.2, 0);
      p(M.beam, cyl(0.025, 0.025, 1.85, 8), 0, 0.925, 0); p(M.beam, cyl(0.2, 0.24, 0.04, 12), 0, 0.02, 0); for (let k = 0; k < 4; k++) p(M.beam, cyl(0.012, 0.012, 0.22, 5), Math.cos(k * 1.57) * 0.08, 1.8, Math.sin(k * 1.57) * 0.08, 0, 0, 0);
      p(BLACK, lathe([[0.2, 0], [0.24, 0.5], [0.2, 1.0], [0.21, 1.2], [0.1, 1.3], [0.05, 1.33]], 12), 0, 0.38, 0.03); p(mat('plain', 0x2b3550, { rough: 0.9 }), SPH, 0, 1.86, 0, 0, 0, 0, [0.12, 0.09, 0.12]);
      addCollider(9.8, F, -9.5, 10.4, F + 1.9, -8.9);
      signBoard(B, '忍', 8, F + 2.0, MZ0 + T + 0.04, 0, 0.7, 0.9);
      lamp(8, C1, -6.9, 14);
    }
    // 대기실(유치동으로 나가는 문): 탁자와 긴 의자, 무기 걸이
    {
      tableAt(B, M.beam, 7.6, F, -1.0, 0, 1.6, 0.8); benchAt(B, M.beam, 7.6, F, -1.75, 0, 1.5); benchAt(B, M.beam, 7.6, F, -0.25, 0, 1.5);
      B.geo(mat('plain', 0xe9e4d6, { rough: 0.5 }), cyl(0.036, 0.03, 0.06, 10), mat4(7.3, F + 0.77, -1.0)); B.geo(mat('plain', 0xe9e4d6, { rough: 0.5 }), cyl(0.036, 0.03, 0.06, 10), mat4(7.9, F + 0.77, -0.85));
      B.geo(M.iron, lathe([[0, 0], [0.1, 0], [0.13, 0.08], [0.11, 0.17], [0.05, 0.2], [0, 0.2]]), mat4(7.6, F + 0.74, -1.15));
      const p = part(B, 8, F, MZ1 - T - 0.06, PI);
      p(M.beam, box(2.2, 0.08, 0.06), 0, 1.7, 0); p(M.beam, box(2.2, 0.08, 0.06), 0, 0.9, 0);
      for (let k = 0; k < 5; k++) { p(M.beam, cyl(0.016, 0.016, 1.5, 6), -0.8 + k * 0.4, 1.05, 0.06); p(STEEL, new THREE.ConeGeometry(0.035, 0.24, 4), -0.8 + k * 0.4, 1.92, 0.06); }
      lamp(8, C1, -1, 13);
    }

    /* ----- 유치동: 복도와 감방 넷 ----- */
    const CX0 = 15, CX1 = 31, CZ0 = -11, CZ1 = -3, CT = 3.3;
    B.box(GREYF, CX0 + T, 0, CZ0 + T, CX1 - T, F, CZ1 - T); B.box(M.stone, 15.4, 0, CZ1, 17.2, 0.1, CZ1 + 0.9, false);
    const CW = 3.875, cell = i => CX0 + T + i * CW;
    face(B, WALLM, 'x', CZ1 - T, CZ1, CX0, CX1, 0, CT, 1, [[15.7, 16.9, 'd'], [20, 21.4, 'w'], [25, 26.4, 'w']], [], TRIM, IRON);
    face(B, WALLM, 'x', CZ0, CZ0 + T, CX0, CX1, 0, CT, -1, [0, 1, 2, 3].map(i => [cell(i) + 1.5, cell(i) + 2.3, 'h']), [], TRIM, IRON);
    face(B, WALLM, 'z', CX0, CX0 + T, CZ0 + T, CZ1 - T, 0, CT, -1, [], [], TRIM, IRON); face(B, WALLM, 'z', CX1 - T, CX1, CZ0 + T, CZ1 - T, 0, CT, 1, [], [], TRIM, IRON);
    for (const [a, b] of [[20, 21.4], [25, 26.4]]) bars(B, IRON, 'x', CZ1 + 0.03, a, b, 1.2, 2.5, false);
    B.box(M.white, CX0 + T, CT - 0.1, CZ0 + T, CX1 - T, CT, CZ1 - T, false);
    gableRoof(B, TILE, CX0, CZ0, CX1, CZ1, CT, 1.7, { ridge: 'x', gable: WALLM });
    signBoard(B, '留置場', 16.3, 2.95, CZ1 + 0.08, 0, 1.3, 0.4, { both: false });
    const BZ = -5.5;
    B.box(TRIM, CX0 + T, 2.9, BZ - 0.08, CX1 - T, CT - 0.1, BZ + 0.08, false);
    for (let i = 0; i < 4; i++) {
      const xa = cell(i), xb = xa + CW, open = i === 1;
      if (i < 3) wall(B, WALLM, 'z', xb - 0.1, xb + 0.1, CZ0 + T, BZ, F, CT - 0.1);
      bars(B, IRON, 'x', BZ, xa, xa + 0.6, F, 2.9); bars(B, IRON, 'x', BZ, xa + 1.5, xb - (i < 3 ? 0.1 : 0), F, 2.9);
      B.box(IRON, xa + 0.57, F, BZ - 0.04, xa + 0.63, 2.9, BZ + 0.04, false); B.box(IRON, xa + 1.47, F, BZ - 0.04, xa + 1.53, 2.9, BZ + 0.04, false);
      B.box(IRON, xa + 0.6, 2.1, BZ - 0.03, xa + 1.5, 2.9, BZ + 0.03, false);
      if (open) bars(B, IRON, 'z', xa + 0.6, BZ, BZ + 0.9, F, 2.1);                    // 열려 있는 감방 문
      else { bars(B, IRON, 'x', BZ, xa + 0.63, xa + 1.47, F, 2.1); B.box(IRON, xa + 1.3, 1.0, BZ - 0.06, xa + 1.46, 1.2, BZ + 0.06, false); B.geo(PAPER, box(0.12, 0.34, 0.004), mat4(xa + 1.05, 1.45, BZ + 0.035)); B.geo(mat('plain', 0x8a1c16), box(0.05, 0.2, 0.004), mat4(xa + 1.05, 1.45, BZ + 0.038)); }
      cotAt(B, xb - 0.75, F, CZ0 + T + 1.1, 0, IRON, COT);
      B.geo(STEEL, cyl(0.15, 0.12, 0.26, 12), mat4(xa + 0.45, F + 0.13, CZ0 + T + 0.45));
      if (i % 2 === 0) for (let k = 0; k < 5; k++) B.box(BLACK, xa + 0.03 + 0.0, 1.3, -9.6 + k * 0.09, xa + 0.04, 1.3 + (k === 4 ? 0.02 : 0.22), -9.58 + k * 0.09 + (k === 4 ? -0.36 : 0), false);   // 벽에 그은 날짜 금
    }
    lamp(19, CT - 0.1, -4.2, 12); lamp(27, CT - 0.1, -4.2, 12);

    /* ----- 해석동: 둥근 집. 가운데에 머릿속을 읽는 장치 ----- */
    {
      const ax = -22, az = -3.6, AR = 6.2, AI = 6.0, AT = 4.2;
      roundFloor(B, M.stone, ax, az, AR + 0.2, 0, 0.1, [], 0, false); roundFloor(B, GREYF, ax, az, AR - 0.05, 0, F);
      const slits = [0, 1, 2, 3, 4, 5].map(k => PI / 2 + PI / 3 * (k + 0.5));
      roundWall(B, WALLM, ax, az, AI, AR, 0, AT, [{ a0: PI / 2 - 0.17, a1: PI / 2 + 0.17, ys: [[F, 2.5]] }, ...slits.map(a => ({ a0: a - 0.12, a1: a + 0.12, ys: [[3.0, 3.6]] }))], { matIn: M.white });
      for (const a of slits) roundWindow(B, ax, az, AI, AR, a - 0.12, a + 0.12, 3.0, 3.6, { frame: TRIM, nx: 2, ny: 1 });
      for (const s of [-1, 1]) B.box(TRIM, ax + s * 1.08 - 0.09, F, az + AR - 0.32, ax + s * 1.08 + 0.09, 2.6, az + AR + 0.1, false);
      B.box(TRIM, ax - 1.2, 2.5, az + AR - 0.32, ax + 1.2, 2.68, az + AR + 0.1, false);
      roundWall(B, TRIM, ax, az, AR, AR + 0.05, AT - 0.22, AT, [], { collide: false });
      plate(B, M.white, ax - AI, az - AI, ax + AI, az + AI, AT - 0.1, AT - 0.02, (x, z) => (x - ax) ** 2 + (z - az) ** 2 < AI * AI, false);
      addCollider(ax - 4.2, AT - 0.1, az - 4.2, ax + 4.2, AT, az + 4.2);
      coneRoof(B, TILE, ax, az, AR + 0.8, AT, 2.6);
      signBoard(B, '解析班', ax, 3.05, az + AR + 0.1, 0, 1.6, 0.44, { both: false });
      // 바닥의 술식: 겹친 고리와 둘레의 글자, 네 방향으로 뻗는 줄
      const seal = textMat(' ', { w: 512, h: 512, bg: '#77736a', color: '#77736a', key: 'intel-seal', draw: (g, w, h) => {
        g.translate(w / 2, h / 2); g.strokeStyle = '#17150f'; g.fillStyle = '#17150f';
        for (const [r, lw] of [[244, 7], [200, 3], [118, 5], [100, 2]]) { g.lineWidth = lw; g.beginPath(); g.arc(0, 0, r, 0, PI * 2); g.stroke(); }
        g.font = '900 34px "Yu Mincho", "MS Mincho", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        const txt = [...'心転身探視秘術封印解析記憶読取結界'];
        txt.forEach((ch, i) => { g.save(); g.rotate(i / txt.length * PI * 2); g.fillText(ch, 0, -222); g.restore(); });
        for (let k = 0; k < 12; k++) { g.save(); g.rotate(k * PI / 6); g.lineWidth = k % 3 ? 2 : 6; g.beginPath(); g.moveTo(0, -118); g.lineTo(0, -200); g.stroke(); g.restore(); }
        const t2 = [...'開閉生死陰陽'];
        t2.forEach((ch, i) => { g.save(); g.rotate(i / t2.length * PI * 2 + 0.26); g.font = '900 30px "Yu Mincho", "MS Mincho", serif'; g.fillText(ch, 0, -158); g.restore(); });
      } });
      B.geo(seal, new THREE.CircleGeometry(4.1, 48).rotateX(-PI / 2), mat4(ax, F + 0.012, az));
      // 가운데 통: 사로잡은 사람의 몸을 가두고 머리만 내놓는다
      B.geo(IRON, cyl(1.3, 1.4, 0.4, 28), mat4(ax, F + 0.2, az));
      B.geo(mat('metal', 0x5a5f66, { rough: 0.5 }), new THREE.SphereGeometry(1.22, 28, 12, 0, PI * 2, 0, PI / 2), mat4(ax, F + 0.4, az));
      for (const y of [0.55, 0.95, 1.3]) { const rr = Math.sqrt(1.22 * 1.22 - (y - 0.4) * (y - 0.4)); B.geo(IRON, new THREE.TorusGeometry(rr + 0.01, 0.03, 6, 32).rotateX(PI / 2), mat4(ax, F + y, az)); }
      for (let k = 0; k < 12; k++) { const a = k * PI / 6; B.geo(STEEL, SPH, mat4(ax + Math.cos(a) * 1.24, F + 0.42, az + Math.sin(a) * 1.24, 0, 0, 0, 0.035)); }
      B.geo(IRON, cyl(0.3, 0.36, 0.14, 16), mat4(ax, F + 1.62, az)); B.geo(BLACK, cyl(0.2, 0.2, 0.02, 16), mat4(ax, F + 1.7, az));
      for (let k = 0; k < 3; k++) { const a = k * 2.094 + 0.5; B.geo(STEEL, box(0.08, 0.24, 0.16), mat4(ax + Math.cos(a) * 0.3, F + 1.76, az + Math.sin(a) * 0.3, 0, -a, 0)); }
      for (let k = 0; k < 4; k++) B.geo(PAPER, box(0.16, 0.5, 0.004), mat4(ax + Math.cos(k * 1.571 + 0.8) * 1.21, F + 0.75, az + Math.sin(k * 1.571 + 0.8) * 1.21, 0.5, -(k * 1.571 + 0.8) + PI / 2, 0));
      addCollider(ax - 1.0, F, az - 1.0, ax + 1.0, F + 1.7, az + 1.0); addCollider(ax - 1.35, F, az - 0.5, ax + 1.35, F + 0.9, az + 0.5); addCollider(ax - 0.5, F, az - 1.35, ax + 0.5, F + 0.9, az + 1.35);
      // 해석반의 자리 셋: 술식 판에 손을 얹고 앉는다. 판에서 통으로 줄이 이어진다
      for (const d of [PI, PI / 2 + PI * 2 / 3 + 0.5, PI / 2 - PI * 2 / 3 - 0.5]) {
        const a = PI / 2 + d, x = ax + Math.cos(a) * 3.4, z = az + Math.sin(a) * 3.4, ry = Math.atan2(-Math.cos(a), -Math.sin(a)), p = part(B, x, F, z, ry);
        p(IRON, box(0.9, 0.5, 0.5), 0, 0.25, 0); p(STEEL, box(0.86, 0.04, 0.6), 0, 0.56, 0.02, -0.35);
        p(textMat('解', { w: 256, h: 128, bg: '#d9d2c0', color: '#17150f', key: 'intel-pad', draw: (g, w, h) => { g.strokeStyle = '#17150f'; g.lineWidth = 4; g.strokeRect(8, 8, w - 16, h - 16); for (const cx of [64, 192]) { g.beginPath(); g.arc(cx, h / 2, 34, 0, PI * 2); g.stroke(); } } }), new THREE.PlaneGeometry(0.78, 0.5), 0, 0.585, 0.03, -PI / 2 - 0.35, 0, PI);
        p(mat('plain', 0x3d5a80, { rough: 1 }), box(0.55, 0.07, 0.55), 0, 0.035, -0.75);
        B.geo(BLACK, tube([V(x + Math.cos(a) * -0.3, F + 0.05, z + Math.sin(a) * -0.3), V(ax + Math.cos(a + 0.3) * 2.2, F + 0.03, az + Math.sin(a + 0.3) * 2.2), V(ax + Math.cos(a) * 1.38, F + 0.12, az + Math.sin(a) * 1.38)].flatMap((q, i, arr) => (i ? [arr[i - 1].clone().lerp(q, 0.5), q] : [q])), 0.03, 6, true));
        solid(x, F, z, ry, 0.9, 0.6, 0.7);
      }
      shelfAt(B, M.beam, ax - 3.6, F, az - 4.3, 0.0, 2.2, 2.2, 5, R);
      { const a = PI / 2 + 2.2; cabinetAt(B, CABM, ax + 4.9, F, az + 2.2, -PI / 2, 0.9, 1.4); void a; }
      for (const [x, z] of [[0, 2.6], [-2.6, -1.6], [2.6, -1.6]]) lamp(ax + x, AT - 0.1, az + z, 13);
    }
    return {
      places: [{ n: '정보부', t: '모리노 이비키가 이끄는 나뭇잎 마을 정보부. 담 안에 본관과 해석동, 유치동이 있다.', b: [X0, X1, Z0, Z1], y: [0, 14] },
        { n: '정보부 현관', t: '접수대 뒤로 두루마리 선반이 늘어섰다. 왼쪽이 심문실과 자료실, 오른쪽이 부장실.', b: [-5, 5, MZ0, MZ1], y: [0, C1] },
        { n: '심문실', t: '쇠 탁자 하나에 의자 둘. 이비키는 몸보다 마음을 몰아붙여 입을 열게 한다.', b: [MX0, -5, MZ0, -3.5], y: [0, C1] },
        { n: '자료실', t: '어두운 유리 너머로 심문실이 들여다보인다. 서류함에는 심문 기록이 쌓여 있다.', b: [MX0, -5, -3.5, MZ1], y: [0, C1] },
        { n: '정보부 부장실', t: '모리노 이비키의 방. 옷걸이에 검은 긴 외투와 두건이 걸려 있다.', b: [5, MX1, MZ0, -3.5], y: [0, C1] },
        { n: '정보부 대기실', t: '지키는 닌자들이 쉬는 방. 동쪽 문으로 나가면 유치동이다.', b: [5, MX1, -3.5, MZ1], y: [0, C1] },
        { n: '유치동', t: '사로잡은 적이나 죄를 지은 닌자를 가두는 곳. 카린과 사스케도 이곳에 갇혀 있었다.', b: [CX0, CX1, CZ0, CZ1], y: [0, 6] },
        { n: '해석동', t: '야마나카 이노이치가 이끌었던 해석반의 방. 입을 열지 않는 사람의 머릿속에서 기억을 곧바로 읽어 낸다.', b: [-28.4, -15.6, -10, 2.8], y: [0, 8] }],
      jumps: [['정보부 정문', 0, 0, Z1 + 7, 0, 83], ['정보부 해석동', -22, 0, 6.3, 0, 84]], glows, lights,
    };
  });
  out.places.push({ n: '정보부 터', t: '큰길 서쪽, 관저 바로 아래의 자리.', poly: Z.poly, b: bound(Z.poly) }, ...res.places);
  out.jumps.push(...res.jumps); out.glows.push(...res.glows); out.lights.push(...res.lights);
}
/* ============================ 묘지 ============================
   마을 변두리, 관저 서쪽의 묘지. 마을 사람들이 묻히는 곳.
   원작(나루토 위키)에 적힌 것: 앞쪽에 "불의 의지"를 나타내는 조형물이 서 있고 그 받침에 "火影"이 새겨져 있다는 것,
   아스마·린·사쿠모·단·하야테·네지(그리고 애니에서 시카쿠·이노이치)의 무덤이 여기 있다는 것, 아카데미 학생들이 비석을 닦고 꽃을 간다는 것.
   조형물의 빛깔과 세부 모양, 낮은 돌담과 길의 짜임새, 석등·물 긷는 곳·긴 의자·나무, 이름난 무덤의 자리는 지어낸 것이다.
   위령비(순직한 닌자의 이름을 새긴 돌)는 여기가 아니라 제3 훈련장 옆에 있는 것이라 두지 않았다. */
function cemetery(scene, out) {
  const Z = zone(30), P0 = Z.poly, cg = [P0.reduce((s, p) => s + p[0], 0) / P0.length, P0.reduce((s, p) => s + p[1], 0) / P0.length];
  const W = P0.map(q => { const l = Math.hypot(cg[0] - q[0], cg[1] - q[1]); return [q[0] + (cg[0] - q[0]) / l * 3.5, q[1] + (cg[1] - q[1]) / l * 3.5]; });   // 담이 서는 줄(길에서 조금 들여서)
  const G = W[16], dl = Math.hypot(cg[0] - G[0], cg[1] - G[1]), d = [(cg[0] - G[0]) / dl, (cg[1] - G[1]) / dl];     // 문: 관저 쪽 변의 한가운데. d = 문에서 묘지 안으로
  const at = { x: G[0], z: G[1], ry: Math.atan2(d[0], d[1]) }, cs = Math.cos(at.ry), sn = Math.sin(at.ry);
  const toL = q => { const dx = q[0] - G[0], dz = q[1] - G[1]; return [dx * cs - dz * sn, dx * sn + dz * cs]; };
  const PL = W.map(toL), NP = PL.length;                                                                              // 제 좌표로 옮긴 담 줄
  const edge = (x, z) => { let m = 1e9; for (let i = 0; i < NP; i++) { const a = PL[i], b = PL[(i + 1) % NP], vx = b[0] - a[0], vz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[1]) * vz) / (vx * vx + vz * vz))); m = Math.min(m, Math.hypot(x - a[0] - vx * t, z - a[1] - vz * t)); } return m; };
  const inside = (x, z, pad) => inPoly(x, z, PL) && edge(x, z) > pad;
  const R = rngOf(3030), STONE = mat('stone', 0xb9b2a2), STONED = mat('stone', 0x8f897c), FLAME = mat('metal', 0x9a3b22, { rough: 0.55 }), MOSS = mat('leaf', 0x4f7a3a);
  const CROSS = [58, 94, 130];
  const res = put(scene, at, (B, holder) => {
    // 낮은 돌담: 문 자리만 비운다
    for (let i = 0; i < NP; i++) {
      const a = PL[i], b = PL[(i + 1) % NP], L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
      let s0 = null;
      for (let s = 0; s <= L + 0.5; s += 0.5) {
        const x = a[0] + ux * s, z = a[1] + uz * s, stop = s > L || Math.hypot(x, z) < 3.4;
        if (!stop && s0 === null) s0 = s;
        if (stop && s0 !== null) {
          const e = Math.min(L, s - 0.5) + (s > L ? 0.2 : 0), p0 = V(a[0] + ux * s0, 0.5, a[1] + uz * s0), p1 = V(a[0] + ux * e, 0.5, a[1] + uz * e);
          beamBetween(B, STONE, p0, p1, 0.42, 1.0); beamBetween(B, STONED, p0.clone().setY(1.05), p1.clone().setY(1.05), 0.56, 0.1);
          for (let t = s0; t < e; t += 0.5) { const xa = a[0] + ux * t, za = a[1] + uz * t, xb = a[0] + ux * Math.min(e, t + 0.5), zb = a[1] + uz * Math.min(e, t + 0.5); addCollider(Math.min(xa, xb) - 0.2, 0, Math.min(za, zb) - 0.2, Math.max(xa, xb) + 0.2, 1.1, Math.max(za, zb) + 0.2); }
          s0 = null;
        }
      }
    }
    // 문기둥
    for (const s of [-1, 1]) {
      const q = PL[16 + s], l = Math.hypot(q[0], q[1]), x = q[0] / l * 3.3, z = q[1] / l * 3.3;
      B.box(STONE, x - 0.45, 0, z - 0.45, x + 0.45, 2.3, z + 0.45); B.box(STONED, x - 0.58, 2.3, z - 0.58, x + 0.58, 2.48, z + 0.58, false);
      B.geo(STONED, new THREE.ConeGeometry(0.6, 0.5, 4).rotateY(PI / 4), mat4(x, 2.73, z));
      if (s < 0) signBoard(B, '木ノ葉墓地', x, 1.35, z - 0.48, PI, 0.34, 1.5, { vertical: true, both: false, bg: '#c9c2b2', frame: STONED });
    }
    // 길: 문에서 안쪽 끝까지 곧은 길, 가로지르는 길 셋, 조형물 둘레의 둥근 마당
    let zEnd = 10; while (inside(0, zEnd + 1, 6)) zEnd += 1;
    B.box(M.pave, -1.8, 0, -3.5, 1.8, 0.035, zEnd, false);
    for (const cz of CROSS) { let x0 = 0, x1 = 0; while (inside(x0 - 1, cz, 6)) x0 -= 1; while (inside(x1 + 1, cz, 6)) x1 += 1; B.box(M.pave, x0, 0, cz - 1.2, x1, 0.036, cz + 1.2, false); }
    B.geo(M.pave, new THREE.CircleGeometry(7.5, 56).rotateX(-PI / 2), mat4(0, 0.04, 16), [15, 15]);

    // "불의 의지" 조형물: 여덟모 받침 위에 타오르는 불꽃. 받침 앞에 火影
    {
      const cz = 16;
      B.geo(STONED, cyl(2.5, 2.7, 0.3, 8), mat4(0, 0.15, cz, 0, PI / 8, 0)); B.geo(STONE, cyl(1.9, 2.1, 0.35, 8), mat4(0, 0.475, cz, 0, PI / 8, 0));
      B.geo(STONE, cyl(1.25, 1.4, 1.0, 8), mat4(0, 1.15, cz, 0, PI / 8, 0)); B.geo(STONED, cyl(1.4, 1.3, 0.14, 8), mat4(0, 1.72, cz, 0, PI / 8, 0));
      B.geo(textMat('火影', { w: 512, h: 256, bg: '#c9c2b2', color: '#1f1b18' }), new THREE.PlaneGeometry(0.88, 0.5), mat4(0, 1.15, cz - 1.24, -0.134, PI, 0));   // 받침의 기운 면에 맞춰 눕힌다
      const flame = (x, z, h, r, lean, ph) => {
        const pts = []; for (let i = 0; i <= 26; i++) { const t = i / 26; pts.push(V(x + lean * t * t * 1.2 + 0.28 * r * Math.sin(t * 5 + ph) * t, 1.75 + h * t, z + 0.22 * r * Math.sin(t * 4 + ph + 1) * t)); }
        B.geo(FLAME, tube(pts, t => Math.max(0.012, r * Math.pow(Math.sin(PI * Math.pow(t, 0.5)), 0.8) * (1 - 0.3 * t)), 14, true));
      };
      flame(0, cz, 4.0, 1.0, 0, 0); flame(-0.75, cz + 0.1, 2.5, 0.6, -0.5, 1.7); flame(0.8, cz - 0.1, 2.9, 0.62, 0.45, 3.1); flame(0.05, cz - 0.55, 1.9, 0.5, 0.05, 4.4); flame(-0.1, cz + 0.6, 2.2, 0.5, -0.1, 5.5);
      addCollider(-2.4, 0, cz - 2.4, 2.4, 0.3, cz + 2.4); addCollider(-1.8, 0, cz - 1.8, 1.8, 0.65, cz + 1.8); addCollider(-1.2, 0, cz - 1.2, 1.2, 5.5, cz + 1.2);
      for (const s of [-1, 1]) { B.geo(STONED, cyl(0.16, 0.2, 0.3, 10), mat4(s * 0.8, 0.8, cz - 1.75)); for (let k = 0; k < 5; k++) B.geo(mat('plain', [0xf2efe6, 0xe9c765][k % 2], { rough: 0.8 }), SPH, mat4(s * 0.8 + Math.cos(k * 1.3) * 0.09, 1.05 + (k % 3) * 0.05, cz - 1.75 + Math.sin(k * 1.3) * 0.09, 0, 0, 0, 0.06)); }
    }
    // 석등: 길 양옆
    const lanternAt = (x, z) => {
      B.geo(STONED, cyl(0.3, 0.36, 0.16, 6), mat4(x, 0.08, z)); B.geo(STONE, cyl(0.11, 0.13, 0.85, 8), mat4(x, 0.58, z)); B.geo(STONED, cyl(0.28, 0.14, 0.14, 6), mat4(x, 1.07, z));
      B.geo(STONE, box(0.34, 0.3, 0.34), mat4(x, 1.29, z)); B.geo(mat('glow', 0xffd9a0, { power: 0.5 }), box(0.2, 0.18, 0.36), mat4(x, 1.29, z)); B.geo(mat('glow', 0xffd9a0, { power: 0.5 }), box(0.36, 0.18, 0.2), mat4(x, 1.29, z));
      B.geo(STONED, new THREE.ConeGeometry(0.42, 0.28, 6), mat4(x, 1.58, z)); B.geo(STONED, SPH, mat4(x, 1.76, z, 0, 0, 0, 0.07));
      addCollider(x - 0.3, 0, z - 0.3, x + 0.3, 1.7, z + 0.3);
    };
    for (let z = 4; z < zEnd - 2; z += 18) { if (Math.abs(z - 16) < 9) continue; for (const s of [-1, 1]) lanternAt(s * 2.5, z); }
    for (const s of [-1, 1]) { lanternAt(s * 6.6, 9.6); lanternAt(s * 6.6, 22.4); }
    // 물 긷는 곳: 지붕 아래 돌 물확, 나무 물통과 국자, 기대 세운 빗자루(비석을 닦고 꽃을 가는 아카데미 학생들의 것)
    {
      const x = 13.5, z = 15;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box(M.beam, x + sx * 1.3 - 0.07, 0, z + sz * 0.9 - 0.07, x + sx * 1.3 + 0.07, 2.2, z + sz * 0.9 + 0.07);
      gableRoof(B, mat('tile', 0x4a5560), x - 1.4, z - 1.0, x + 1.4, z + 1.0, 2.2, 0.7, { ridge: 'x', over: 0.5, overGable: 0.4 });
      B.box(STONE, x - 0.9, 0, z - 0.45, x + 0.5, 0.6, z + 0.45); B.box(M.water, x - 0.78, 0.5, z - 0.33, x + 0.38, 0.62, z + 0.33, false);
      const pail = lathe([[0, 0], [0.13, 0], [0.16, 0.26], [0.145, 0.26], [0.12, 0.03], [0, 0.03]], 12);
      for (let k = 0; k < 4; k++) { const px = x + 0.85 + (k % 2) * 0.36, pz = z - 0.3 + Math.floor(k / 2) * 0.4; B.geo(M.beamLight, pail, mat4(px, 0, pz)); B.geo(M.beamLight, new THREE.TorusGeometry(0.14, 0.008, 4, 12, PI), mat4(px, 0.26, pz, 0, k, 0)); }
      for (let k = 0; k < 3; k++) { B.geo(M.beamLight, cyl(0.012, 0.012, 0.5, 5).rotateZ(PI / 2), mat4(x - 0.3 + k * 0.1, 0.65, z - 0.3 + k * 0.25, 0, 0.3 * k, 0)); B.geo(M.beamLight, cyl(0.05, 0.04, 0.06, 8), mat4(x - 0.55 + k * 0.1, 0.65, z - 0.3 + k * 0.25)); }
      for (let k = 0; k < 2; k++) { const bx = x - 1.2 + k * 0.18, bz = z + 0.95; beamBetween(B, M.beamLight, V(bx, 0.05, bz + 0.25), V(bx, 1.5, bz), 0.03, 0.03); B.geo(mat('plain', 0xb9925a, { rough: 1 }), new THREE.ConeGeometry(0.13, 0.4, 8), mat4(bx, 0.22, bz + 0.22, -0.16, 0, 0)); }
    }
    for (const s of [-1, 1]) benchAt(B, M.beam, s * 9.5, 0, 16, PI / 2, 2.2);

    // 비석: 받침돌·몸돌·덮개돌, 앞에 꽃병 둘과 향 받침. 줄지어 문 쪽을 본다
    const grave = mergeGeos([[box(1.0, 0.14, 0.72), mat4(0, 0.07, 0)], [box(0.72, 0.5, 0.3), mat4(0, 0.39, 0.1)], [box(0.82, 0.07, 0.4), mat4(0, 0.675, 0.1)], [box(0.5, 0.3, 0.02), mat4(0, 0.39, -0.055)],
      [cyl(0.05, 0.045, 0.18, 8), mat4(-0.32, 0.23, -0.2)], [cyl(0.05, 0.045, 0.18, 8), mat4(0.32, 0.23, -0.2)], [box(0.26, 0.05, 0.14), mat4(0, 0.165, -0.24)]]);
    const bloom = mergeGeos([-1, 1].flatMap(s => [0, 1, 2].map(k => [SPH, mat4(s * 0.32 + Math.cos(k * 2.1) * 0.045, 0.4 + k * 0.03, -0.2 + Math.sin(k * 2.1) * 0.045, 0, 0, 0, 0.04)])));
    const gm = [], fm = [[], [], []];
    for (let z = 36; z < 175; z += 4.5) {
      if (CROSS.some(c => Math.abs(z - c) < 3.2)) continue;
      for (let x = 4.2; x < 110; x += 3) for (const s of [-1, 1]) {
        const gx = s * x + (R() - 0.5) * 0.12, r = R(), r2 = R();
        if (!inside(gx, z, 5.5) || r < 0.07) continue;
        const m = mat4(gx, 0, z, 0, (R() - 0.5) * 0.04, 0, [1, 0.9 + r2 * 0.3, 1]);
        gm.push(m); if (r > 0.62) fm[Math.floor(r2 * 3)].push(m);
        addCollider(gx - 0.5, 0, z - 0.36, gx + 0.5, 0.7, z + 0.36);
      }
    }
    const inst = (g, m, list) => { if (!list.length) return; const im = new THREE.InstancedMesh(g, m, list.length); list.forEach((q, i) => im.setMatrixAt(i, q)); im.instanceMatrix.needsUpdate = true; im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); holder.add(im); };
    inst(grave, STONE, gm);
    [0xf2efe6, 0xe9c765, 0xe58aa0].forEach((hex, i) => inst(bloom, mat('plain', hex, { rough: 0.8 }), fm[i]));
    // 이름난 무덤: 조형물 뒤 첫 줄
    const places = [];
    const NAMED = [[-4.4, '猿飛アスマ', '사루토비 아스마의 무덤', '3대 호카게의 아들이자 제10반의 스승. 아카츠키의 히단과 싸우다 숨졌다.'], [4.4, 'のはらリン', '노하라 린의 무덤', '카카시와 오비토의 동료였던 의료 닌자. 카카시는 틈날 때마다 이 앞에 선다.'],
      [-8, 'はたけサクモ', '하타케 사쿠모의 무덤', '"나뭇잎의 하얀 송곳니"라 불린 카카시의 아버지.'], [8, '加藤ダン', '카토 단의 무덤', '호카게를 꿈꾸었던 츠나데의 연인. 시즈네의 삼촌.'],
      [-11.6, '月光ハヤテ', '겟코 하야테의 무덤', '중닌 시험 예선의 심판을 맡았던 특별 상급닌자.'], [11.6, '日向ネジ', '휴우가 네지의 무덤', '휴우가 분가의 천재. 제4차 닌자대전에서 나루토와 히나타를 지키고 숨졌다.'],
      [-15.2, '奈良シカク', '나라 시카쿠의 무덤', '나라 일족의 우두머리이자 시카마루의 아버지. 제4차 닌자대전에서 연합군 본부의 참모를 맡아 끝까지 작전을 전하고 숨졌다.'], [15.2, '山中いのいち', '야마나카 이노이치의 무덤', '야마나카 일족의 우두머리이자 이노의 아버지. 제4차 닌자대전에서 연합군 본부의 통신을 맡아 끝까지 소식을 전하고 숨졌다.']];
    NAMED.forEach(([x, kanji, n, t], i) => {
      const z = 30.5, S = 1.3;
      B.geo(STONE, grave, mat4(x, 0, z, 0, 0, 0, S));
      B.geo(textMat(kanji, { w: 128, h: 256, vertical: true, bg: '#c9c2b2', color: '#2a2622' }), new THREE.PlaneGeometry(0.36, 0.56), mat4(x, 0.39 * S, z - 0.068 * S - 0.012, 0, PI, 0));
      for (const s of [-1, 1]) for (let k = 0; k < 4; k++) { B.geo(mat('plain', 0x4c9440, { rough: 0.7 }), cyl(0.006, 0.006, 0.22, 4), mat4(x + s * 0.32 * S + Math.cos(k * 1.6) * 0.03, 0.44, z - 0.2 * S + Math.sin(k * 1.6) * 0.03)); B.geo(mat('plain', [0xf2efe6, 0xe9c765, 0xe58aa0, 0xb04a8a][(k + i) % 4], { rough: 0.8 }), SPH, mat4(x + s * 0.32 * S + Math.cos(k * 1.6) * 0.045, 0.56 + (k % 2) * 0.04, z - 0.2 * S + Math.sin(k * 1.6) * 0.045, 0, 0, 0, 0.045)); }
      addCollider(x - 0.65, 0, z - 0.47, x + 0.65, 0.9, z + 0.47);
      places.push({ n, t, b: [x - 1.6, x + 1.6, z - 3.2, z + 0.8], y: [0, 4] });
    });
    // 아스마의 무덤 앞에 놓인 담배 한 갑과 라이터
    { const p = part(B, -4.4, 0.182, 30.5 - 0.4, 0); p(mat('plain', 0xe9e4d6, { rough: 0.7 }), box(0.07, 0.022, 0.1), -0.27, 0.011, 0, 0, 0.3); p(mat('metal', 0xb4babd, { rough: 0.4 }), box(0.035, 0.05, 0.012), 0.27, 0.025, 0, 0, -0.4); }   // 받침돌 위, 향 받침과 꽃병 사이

    // 나무: 담 안쪽에 드문드문
    {
      const tg = treeGeometry(3031, { height: 12, depth: 4, sprays: 5, leaves: 6, leafLen: 0.5 }), tm = [];
      let tries = 0;
      while (tm.length < 16 && tries++ < 3000) {
        const x = (R() - 0.5) * 230, z = R() * 180, e = inside(x, z, 2.2) ? edge(x, z) : 0;
        if (e < 2.4 || e > 4.6 || Math.hypot(x, z) < 14 || tm.some(q => Math.hypot(q[0] - x, q[1] - z) < 16)) continue;
        tm.push([x, z]); addCollider(x - 0.5, 0, z - 0.5, x + 0.5, 6, z + 0.5);
      }
      const ms = tm.map(([x, z]) => mat4(x, 0, z, 0, R() * 6.28, 0, 0.9 + R() * 0.3));
      inst(tg.wood, mat('bark', 0x8a7257), ms); inst(tg.leaves, mat('leaf', 0x35702a), ms);
      for (const [x, z] of tm) B.geo(MOSS, BUSH.leaves, mat4(x + 1.6, 0, z + 0.8, 0, x, 0, 0.9));
    }
    places.push({ n: '불의 의지 조형물', t: '마을을 지키려는 뜻, "불의 의지"를 나타낸 조형물. 받침에 火影(호카게) 두 글자가 새겨져 있다.', b: [-8, 8, 8, 24], y: [0, 8] });
    return { places, jumps: [['묘지', 0, 0, -9, PI, 85], ['묘지의 이름난 무덤', 0, 0, 25.5, PI, 86]] };
  });
  out.places.push({ n: '나뭇잎 마을 묘지', t: '마을 변두리의 묘지. 아카데미 학생들이 돌아가며 비석을 닦고 꽃을 간다.', poly: W, b: bound(W) }, ...res.places);
  out.jumps.push(...res.jumps);
}
/* ---------- 병원·도서관이 함께 쓰는 것 ---------- */
// 마을 좌표의 다각형을 자리(at)의 제 좌표로 옮긴다
function localPoly(poly, at) {
  const cs = Math.cos(at.ry), sn = Math.sin(at.ry);
  return poly.map(q => { const dx = q[0] - at.x, dz = q[1] - at.z; return [dx * cs - dz * sn, dx * sn + dz * cs]; });
}
const polyEdge = (x, z, P) => { let m = 1e9; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], vx = b[0] - a[0], vz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[1]) * vz) / (vx * vx + vz * vz))); m = Math.min(m, Math.hypot(x - a[0] - vx * t, z - a[1] - vz * t)); } return m; };
// 터에 나무를 드문드문 심는다(ok(x, z)가 참인 자리에만). 바람에 흔들리므로 holder에 따로 넣는다.
function grove(B, holder, seed, n, box4, ok, gap = 13) {
  const R = rngOf(seed), tg = treeGeometry(seed, { height: 12, depth: 4, sprays: 5, leaves: 6, leafLen: 0.5 }), tm = [];
  let tries = 0;
  while (tm.length < n && tries++ < 4000) {
    const x = box4[0] + R() * (box4[2] - box4[0]), z = box4[1] + R() * (box4[3] - box4[1]);
    if (!ok(x, z) || tm.some(q => Math.hypot(q[0] - x, q[1] - z) < gap)) continue;
    tm.push([x, z]); addCollider(x - 0.5, 0, z - 0.5, x + 0.5, 6, z + 0.5);
  }
  const ms = tm.map(([x, z]) => mat4(x, 0, z, 0, R() * 6.28, 0, 0.9 + R() * 0.35));
  for (const [g, m] of [[tg.wood, mat('bark', 0x8a7257)], [tg.leaves, mat('leaf', seed % 2 ? 0x447f2e : 0x35702a)]]) {
    const im = new THREE.InstancedMesh(g, m, ms.length); ms.forEach((q, i) => im.setMatrixAt(i, q)); im.instanceMatrix.needsUpdate = true; im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); holder.add(im);
  }
  return tm;
}
// 칸막이벽: ops = [[u0, u1, 'd' 문 | 'o' 천장까지 트인 곳]]
function partition(B, m, frame, axis, c, u0, u1, y, ops = [], h = 3.2) {
  wall(B, m, axis, c - 0.08, c + 0.08, u0, u1, y, y + h, ops.map(([a, b, k]) => ({ u0: a, u1: b, ys: [[y, y + (k === 'o' ? 2.7 : 2.3)]] })));
  for (const [a, b, k] of ops) if (k === 'd') doorUnit(B, axis, c - 0.08, c + 0.08, a, b, y, y + 2.3, { frame, leaf: null });
}
// 병원 침대: 머리맡이 -z
function bedAt(B, x, y, z, ry, frame, blanket) {
  const p = part(B, x, y, z, ry), white = mat('plain', 0xf4f1ea, { rough: 1 });
  for (const sz of [-1, 1]) { const h = sz < 0 ? 1.05 : 0.8; for (const sx of [-1, 1]) p(frame, cyl(0.022, 0.022, h, 6), sx * 0.45, h / 2, sz * 1.0); p(frame, cyl(0.022, 0.022, 0.9, 6).rotateZ(PI / 2), 0, h, sz * 1.0); p(frame, cyl(0.016, 0.016, 0.9, 6).rotateZ(PI / 2), 0, h - 0.25, sz * 1.0); for (const sx of [-0.2, 0, 0.2]) p(frame, cyl(0.01, 0.01, 0.25, 5), sx, h - 0.125, sz * 1.0); }
  p(frame, box(0.9, 0.05, 2.0), 0, 0.45, 0); p(white, box(0.86, 0.14, 1.94), 0, 0.545, 0);
  p(white, box(0.5, 0.1, 0.3), 0, 0.66, -0.74); p(blanket, box(0.9, 0.06, 1.25), 0, 0.64, 0.3); p(white, box(0.9, 0.065, 0.22), 0, 0.642, -0.36);
  solid(x, y, z, ry, 0.94, 2.06, 0.66);
}
function standAt(B, x, y, z, m) { B.box(m, x - 0.22, y, z - 0.2, x + 0.22, y + 0.62, z + 0.2); B.box(M.iron, x - 0.06, y + 0.4, z + 0.2, x + 0.06, y + 0.42, z + 0.22, false); }
const JAR_HEX = [0x7aa6a0, 0xb07a4a, 0xd8cfb4, 0x6a8a5a, 0xa85a50, 0x8a8ab0];
function jarShelfAt(B, m, x, y, z, ry, w, h, rows, R, d = 0.32) {   // 약병 선반. 열린 쪽이 +z
  const p = part(B, x, y, z, ry);
  p(m, box(w, h, 0.03), 0, h / 2, -d / 2 + 0.015);
  for (const sx of [-1, 1]) p(m, box(0.04, h, d), sx * (w / 2 - 0.02), h / 2, 0);
  for (let k = 0; k <= rows; k++) {
    const yy = 0.04 + k * (h - 0.08) / rows;
    p(m, box(w, 0.035, d), 0, yy, 0);
    if (k === rows) break;
    for (let sxp = -w / 2 + 0.14; sxp < w / 2 - 0.1; sxp += 0.15) {
      if (R() < 0.15) continue;
      const hh = 0.12 + R() * 0.1, jm = mat('plain', JAR_HEX[Math.floor(R() * JAR_HEX.length)], { rough: 0.35 });
      p(jm, cyl(0.05, 0.05, hh, 10), sxp, yy + 0.02 + hh / 2, 0.02); p(M.beamLight, cyl(0.035, 0.035, 0.03, 8), sxp, yy + 0.035 + hh, 0.02);
    }
  }
  solid(x, y, z, ry, w, d, h);
}
// 천장 등(둥근 갓)
function ceilLamp(B, x, yc, z, glows, lights, pow = 14) {
  B.geo(mat('glow', 0xfff1d0, { power: 1.1 }), new THREE.SphereGeometry(0.22, 14, 8, 0, PI * 2, PI / 2, PI / 2), mat4(x, yc - 0.02, z)); B.geo(M.iron, cyl(0.24, 0.24, 0.03, 16), mat4(x, yc - 0.015, z));
  glows.push([x, yc - 0.2, z, 0.6]); lights.push([x, yc - 0.4, z, pow, 14]);
}

/* ============================ 나뭇잎 병원 ============================
   닌자와 마을 사람들을 돌보는 병원. 큰길 서쪽, 정문이 큰길을 본다.
   원작(나루토 위키)에 적힌 것: 건물 앞에 "医" 글자가 있다는 것, 록 리와 사스케가 입원했던 곳이라는 것,
   전쟁 뒤 사쿠라가 이노와 함께 아이들의 마음을 돌보는 진료실을 열었다는 것.
   옥상의 빨래(흰 홑이불)와 물탱크 둘 — 나루토의 나선환과 사스케의 치도리가 뚫어 놓은 — 은 원작 만화의 장면에서 가져왔다.
   건물의 생김새(2층·평지붕)와 방 배치, 가구, 마당은 지어낸 것이다. */
function hospital(scene, out) {
  const Z = zone(26), at = { x: -46, z: 262, ry: PI / 2 };          // 제 좌표의 +z가 큰길(동쪽), +x가 북쪽(관저 쪽)
  const X0 = -18, X1 = 18, Z0 = -8, Z1 = 8, T = 0.25, F = 0.2, F2 = 3.6, RF = 7.0, TOP = 8.0, C = 1.2;
  LOTS.push({ x: at.x + 8, z: at.z, ry: at.ry, w: 42, d: 40 });
  const PL = localPoly(Z.poly, at), R = rngOf(2626);
  const WALLM = mat('plaster', 0xf1eee4), TRIM = mat('wood', 0x3f7a78), LINO = mat('plain', 0xcfd6c8, { rough: 0.7 }), STEEL = mat('metal', 0xb4babd, { rough: 0.5 }), WHITE = mat('plain', 0xf4f1ea, { rough: 1 });
  const BLANK = [mat('plain', 0xa9c9c0, { rough: 1 }), mat('plain', 0xc9d6a8, { rough: 1 })], CURT = mat('cloth', 0xe9efe2), TANK = mat('metal', 0x9aa6a8, { rough: 0.6 }), HOLE = mat('plain', 0x14161a, { rough: 1 });
  const RED = '#b3261a';
  const res = put(scene, at, (B, holder) => {
    const glows = [], lights = [], places = [];
    const sign = (text, x, y, z, ry, w = 0.9) => signBoard(B, text, x, y, z, ry, w, 0.26, { both: false });
    /* ----- 뼈대 ----- */
    B.box(M.stone, X0 - 0.15, 0, Z0 - 0.15, X1 + 0.15, 0.1, Z1 + 0.15, false);
    B.box(LINO, X0 + T, 0, Z0 + T, X1 - T, F, Z1 - T);
    // 2층 바닥(1층에서 오르는 계단 구멍을 비운다)과 옥상 바닥(옥상으로 오르는 계단 구멍을 비운다)
    B.box(LINO, X0 + T, F2 - 0.2, Z0 + T, -0.2, F2, -6.2); B.box(LINO, 4.6, F2 - 0.2, Z0 + T, X1 - T, F2, -6.2); B.box(LINO, X0 + T, F2 - 0.2, -6.2, X1 - T, F2, Z1 - T);
    B.box(M.concrete, X0 + T, RF - 0.2, Z0 + T, X1 - T, RF, -6.0); B.box(M.concrete, X0 + T, RF - 0.2, -6.0, -4.6, RF, -4.45); B.box(M.concrete, 0.4, RF - 0.2, -6.0, X1 - T, RF, -4.45); B.box(M.concrete, X0 + T, RF - 0.2, -4.45, X1 - T, RF, Z1 - T);
    const ROOMS = [-15, -9, 9, 15], UPS = [F2];
    face(B, WALLM, 'x', Z1 - T, Z1, X0, X1, 0, TOP, 1, [...ROOMS.map(c => [c - 0.9, c + 0.9, 'w']), [-4.6, -2.8, 'w'], [-1.3, 1.3, 'd'], [2.8, 4.6, 'w']].sort((a, b) => a[0] - b[0]), UPS, TRIM, M.iron, false);
    face(B, WALLM, 'x', Z0, Z0 + T, X0, X1, 0, TOP, -1, ROOMS.map(c => [c - 0.9, c + 0.9, 'w']), UPS, TRIM, M.iron, false);
    for (const [f0, f1, o] of [[X0, X0 + T, -1], [X1 - T, X1, 1]]) face(B, WALLM, 'z', f0, f1, Z0 + T, Z1 - T, 0, TOP, o, [[-5.5, -3.7, 'w'], [-0.7, 0.7, 'w'], [3.7, 5.5, 'w']], UPS, TRIM, M.iron, false);
    for (const y of [F2 - 0.1, RF - 0.1]) { B.box(TRIM, X0 - 0.06, y - 0.1, Z0 - 0.06, X1 + 0.06, y + 0.1, Z0, false); B.box(TRIM, X0 - 0.06, y - 0.1, Z1, X1 + 0.06, y + 0.1, Z1 + 0.06, false); B.box(TRIM, X0 - 0.06, y - 0.1, Z0, X0, y + 0.1, Z1, false); B.box(TRIM, X1, y - 0.1, Z0, X1 + 0.06, y + 0.1, Z1, false); }
    B.box(TRIM, X0 - 0.08, TOP, Z0 - 0.08, X1 + 0.08, TOP + 0.1, Z0 + T + 0.04, false); B.box(TRIM, X0 - 0.08, TOP, Z1 - T - 0.04, X1 + 0.08, TOP + 0.1, Z1 + 0.08, false); B.box(TRIM, X0 - 0.08, TOP, Z0, X0 + T + 0.04, TOP + 0.1, Z1, false); B.box(TRIM, X1 - T - 0.04, TOP, Z0, X1 + 0.08, TOP + 0.1, Z1, false);
    // 현관: 차양과 간판, 둥근 판에 붉은 医
    B.box(M.stone, -2.6, 0, Z1, 2.6, 0.1, Z1 + 2.8, false);
    for (const s of [-1, 1]) B.box(TRIM, s * 2.3 - 0.1, 0, Z1 + 2.4, s * 2.3 + 0.1, 2.9, Z1 + 2.6);
    B.box(WALLM, -2.7, 2.9, Z1, 2.7, 3.1, Z1 + 2.8, false); B.box(TRIM, -2.76, 3.1, Z1, 2.76, 3.18, Z1 + 2.86, false);
    signBoard(B, '木ノ葉病院', 0, 3.5, Z1 + 2.8, 0, 3.2, 0.6, { both: false, bg: '#f4f1ea' });
    signBoard(B, '医', 0, 7.05, Z1 + 0.06, 0, 1.7, 1.7, { round: true, both: false, bg: '#f4f1ea', color: RED, frame: mat('plain', 0xb3261a) });
    // 칸막이: 가운데 복도(z ±1.2), 방 사이 벽, 계단 홀
    for (const y of [F, F2]) {
      for (const s of [-1, 1]) {
        partition(B, M.white, TRIM, 'x', s * C, X0 + T, -6, y, [[-15.55, -14.45, 'd'], [-9.55, -8.45, 'd']]);
        partition(B, M.white, TRIM, 'x', s * C, 6, X1 - T, y, [[8.45, 9.55, 'd'], [14.45, 15.55, 'd']]);
        for (const x of [-12, 12]) partition(B, M.white, TRIM, 'z', x, s > 0 ? C + 0.08 : Z0 + T, s > 0 ? Z1 - T : -C - 0.08, y);
        for (const x of [-6, 6]) partition(B, M.white, TRIM, 'z', x, s > 0 ? C + 0.08 : Z0 + T, s > 0 ? Z1 - T : -C - 0.08, y);
      }
      partition(B, M.white, TRIM, 'x', -C, -5.92, 5.92, y, [[-2.5, 2.5, 'o']]);
      for (const x of [-12, 0, 12]) ceilLamp(B, x, y + 3.2, 0, glows, lights, 12);
    }
    // 계단: 1층 → 2층(뒷벽 쪽), 2층 → 옥상(그 앞줄)
    stairs(B, M.concrete, 'x', 4.6, -1, F, F2, -7.75, -6.2, 0.3);
    stairs(B, M.concrete, 'x', -4.6, 1, F2, RF, -6.0, -4.45, 0.3);
    railing(B, STEEL, [[-0.25, -7.75], [-0.25, -6.12], [4.55, -6.12]], F2, 1.0, { gap: 0.3 });
    railing(B, STEEL, [[0.3, -4.38], [-4.6, -4.38]], F2, 1.0, { gap: 0.3 });
    sign('二階 病室', 3.9, F + 2.5, -C + 0.1, 0, 1.0); sign('屋上', -3.9, F2 + 2.5, -C + 0.1, 0, 0.6);
    // 옥상 계단실
    {
      const hx0 = -5.9, hx1 = 0.6, hz0 = -6.2, hz1 = -4.25, hy = RF + 2.4;
      wall(B, WALLM, 'x', hz0, hz0 + 0.15, hx0, hx1, RF, hy); wall(B, WALLM, 'x', hz1 - 0.15, hz1, hx0, hx1, RF, hy, [{ u0: -5.72, u1: -4.4, ys: [[RF, RF + 2.1]] }]);
      wall(B, WALLM, 'z', hx0, hx0 + 0.15, hz0 + 0.15, hz1 - 0.15, RF, hy); wall(B, WALLM, 'z', hx1 - 0.15, hx1, hz0 + 0.15, hz1 - 0.15, RF, hy);
      B.box(M.concrete, hx0 - 0.15, hy, hz0 - 0.15, hx1 + 0.15, hy + 0.15, hz1 + 0.15);
      doorUnit(B, 'x', hz1 - 0.15, hz1, -5.72, -4.4, RF, RF + 2.1, { frame: TRIM, leaf: null });
    }

    /* ----- 1층 ----- */
    // 현관 홀: 접수대, 기다리는 긴 의자, 화분
    {
      const p = part(B, 3.6, F, 4.6, -PI / 2);
      p(WHITE, box(3.4, 1.0, 0.55), 0, 0.5, 0); p(TRIM, box(3.5, 0.05, 0.7), 0, 1.025, 0); p(TRIM, box(3.4, 0.12, 0.02), 0, 0.5, 0.285);
      p(mat('plain', 0xeee8d8, { rough: 1 }), box(0.3, 0.02, 0.4), -0.9, 1.06, 0, 0, 0.1); p(mat('metal', 0xc9a24a, { rough: 0.4 }), SPH, 0.2, 1.08, 0.1, 0, 0, 0, [0.05, 0.035, 0.05]);
      p(mat('plain', 0xf4f1ea), cyl(0.07, 0.05, 0.16, 10), 1.2, 1.13, 0); for (let k = 0; k < 3; k++) p(mat('plain', [0xe58aa0, 0xe9c765, 0xf2efe6][k], { rough: 0.8 }), SPH, 1.2 + Math.cos(k * 2.1) * 0.05, 1.32 + k * 0.02, Math.sin(k * 2.1) * 0.05, 0, 0, 0, 0.045);
      solid(3.6, F, 4.6, -PI / 2, 3.5, 0.7, 1.05); chairAt(B, M.beamLight, 4.8, F, 4.6, -PI / 2);
      sign('受付', 3.2, F + 2.5, 4.6, -PI / 2, 0.7);
      jarShelfAt(B, M.beamLight, 5.6, F, 2.2, -PI / 2, 1.4, 1.9, 4, R);
      for (const z of [2.6, 4.4, 6.2]) benchAt(B, M.beamLight, -3.6, F, z, 0, 3.4);
      for (const x of [-5.3, 5.3]) potAt(B, x, F, 7.2, 1.2);
      // 벽의 안내판과 포스터
      const q = part(B, -5.88, F, 4.4, PI / 2);
      q(TRIM, box(2.2, 1.3, 0.04), 0, 1.6, 0); q(mat('plain', 0xe9efe2, { rough: 1 }), box(2.08, 1.18, 0.02), 0, 1.6, 0.025);
      for (let k = 0; k < 6; k++) q(mat('plain', [0xf4f1ea, 0xe8d9a0, 0xcfe0e8][k % 3], { rough: 1 }), box(0.5, 0.42, 0.004), -0.68 + (k % 3) * 0.68, 1.88 - Math.floor(k / 3) * 0.54, 0.04, 0, 0, (R() - 0.5) * 0.06);
      ceilLamp(B, 0, F + 3.2, 4.6, glows, lights, 16);
      places.push({ n: '나뭇잎 병원 현관', t: '접수대와 기다리는 자리. 복도 양쪽으로 진료실과 약국, 뒤쪽 계단으로 2층 병실에 오른다.', b: [-6, 6, -C, Z1], y: [0, F2 - 0.2] });
    }
    // 진료실(둘): 책상과 의자, 진찰 침대, 약장, 벽의 인체 그림
    const exam = (xc, s, n) => {
      const zo = s * (Z1 - T);
      deskAt(B, M.beamLight, xc - 1.6, F, zo - s * 0.55, s > 0 ? 0 : PI, 1.5, 0.75); chairAt(B, M.beamLight, xc - 1.6, F, zo - s * 1.5, s > 0 ? 0 : PI); chairAt(B, STEEL, xc - 0.3, F, zo - s * 1.3, s > 0 ? PI / 2 : -PI / 2);
      B.geo(mat('plain', 0xeee8d8, { rough: 1 }), box(0.3, 0.02, 0.4), mat4(xc - 1.8, F + 0.79, zo - s * 0.5, 0, 0.2, 0));
      bedAt(B, xc + 2.3, F, s * 4.6, s > 0 ? PI : 0, STEEL, WHITE);
      jarShelfAt(B, M.beamLight, xc + 1.9, F, s * (C + 0.3), s > 0 ? 0 : PI, 1.6, 1.9, 4, R);
      const bm = textMat('人', { w: 256, h: 512, bg: '#efe8d8', color: '#efe8d8', key: 'body-chart', draw: (g, w, h) => {
        g.strokeStyle = '#2a2622'; g.lineWidth = 5; g.beginPath(); g.arc(w / 2, 80, 40, 0, PI * 2); g.stroke();
        g.beginPath(); g.moveTo(w / 2, 120); g.lineTo(w / 2, 300); g.moveTo(w / 2 - 80, 170); g.lineTo(w / 2 + 80, 170); g.moveTo(w / 2, 300); g.lineTo(w / 2 - 50, 460); g.moveTo(w / 2, 300); g.lineTo(w / 2 + 50, 460); g.stroke();
        g.fillStyle = '#b3261a'; for (const [x, y] of [[0, 150], [-40, 170], [40, 170], [0, 200], [0, 250], [-25, 380], [25, 380], [0, 80]]) { g.beginPath(); g.arc(w / 2 + x, y, 6, 0, PI * 2); g.fill(); }
      } });
      const wx = xc < 0 ? X0 + T : xc - 2.92; B.geo(M.beam, box(0.66, 1.26, 0.03), mat4(wx + 0.02, F + 1.7, s * 2.4, 0, PI / 2, 0)); B.geo(bm, new THREE.PlaneGeometry(0.6, 1.2), mat4(wx + 0.04, F + 1.7, s * 2.4, 0, PI / 2, 0));
      ceilLamp(B, xc, F + 3.2, s * 4.4, glows, lights);
      sign('診察室', xc, F + 2.5, s * C - s * 0.1, s > 0 ? PI : 0);
      places.push({ n, t: '의료 닌자가 환자를 보는 방. 벽에는 경혈을 짚은 인체 그림.', b: [xc - 3, xc + 3, Math.min(s * C, zo), Math.max(s * C, zo)], y: [0, F2 - 0.2] });
    };
    exam(-15, 1, '진료실'); exam(15, -1, '둘째 진료실');
    // 약국: 약병 선반과 조제대
    {
      const xc = -9;
      for (const dx of [-1.95, 1.95]) jarShelfAt(B, M.beam, xc + dx, F, Z1 - T - 0.2, PI, 1.8, 2.2, 5, R);
      jarShelfAt(B, M.beam, -6.3, F, 4.6, -PI / 2, 2.2, 2.2, 5, R);
      tableAt(B, M.beamLight, xc, F, 4.2, 0, 2.6, 0.8, 0.9);
      B.geo(M.stone, lathe([[0, 0], [0.09, 0], [0.13, 0.1], [0.11, 0.1], [0.08, 0.03], [0, 0.03]]), mat4(xc - 0.7, F + 0.9, 4.2)); B.geo(M.stone, cyl(0.02, 0.03, 0.16, 6), mat4(xc - 0.66, F + 0.99, 4.2, 0, 0, -0.5));
      for (let k = 0; k < 5; k++) B.geo(mat('plain', JAR_HEX[k], { rough: 0.35 }), cyl(0.045, 0.045, 0.13, 10), mat4(xc + 0.1 + k * 0.17, F + 0.965, 4.3));
      B.geo(mat('metal', 0xc9a24a, { rough: 0.4 }), box(0.3, 0.02, 0.12), mat4(xc - 0.2, F + 0.93, 4.0)); for (const s of [-1, 1]) B.geo(mat('metal', 0xc9a24a, { rough: 0.4 }), cyl(0.06, 0.06, 0.01, 10), mat4(xc - 0.2 + s * 0.13, F + 0.91, 4.0));
      for (let k = 0; k < 4; k++) B.geo(mat('plain', 0xeee8d8, { rough: 1 }), box(0.12, 0.012, 0.16), mat4(xc + 0.7 + (k % 2) * 0.15, F + 0.906 + Math.floor(k / 2) * 0.012, 3.95));
      ceilLamp(B, xc, F + 3.2, 4.4, glows, lights); sign('薬局', xc, F + 2.5, C - 0.1, PI, 0.7);
      places.push({ n: '약국', t: '약초를 갈고 달여 약을 짓는 방. 병마다 나라 일족이 대 준 약재가 들어 있다.', b: [-12, -6, C, Z1], y: [0, F2 - 0.2] });
    }
    // 처치실: 가운데 침상, 바닥에 치료 술식, 기구 수레, 갓등
    {
      const xc = -15, zc = -4.6;
      const sm = textMat(' ', { w: 512, h: 512, bg: '#cfd6c8', color: '#cfd6c8', key: 'heal-seal', draw: (g, w, h) => {
        g.translate(w / 2, h / 2); g.strokeStyle = '#1f2a24'; g.fillStyle = '#1f2a24';
        for (const [r, lw] of [[240, 6], [205, 2], [120, 4]]) { g.lineWidth = lw; g.beginPath(); g.arc(0, 0, r, 0, PI * 2); g.stroke(); }
        g.font = '900 30px "Yu Mincho", "MS Mincho", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        const txt = [...'治癒再生経絡気血陰陽調和快復'];
        txt.forEach((ch, i) => { g.save(); g.rotate(i / txt.length * PI * 2); g.fillText(ch, 0, -222); g.restore(); });
        for (let k = 0; k < 8; k++) { g.save(); g.rotate(k * PI / 4); g.lineWidth = 3; g.beginPath(); g.moveTo(0, -120); g.lineTo(0, -205); g.stroke(); g.restore(); }
      } });
      B.geo(sm, new THREE.CircleGeometry(2.5, 40).rotateX(-PI / 2), mat4(xc, F + 0.012, zc));
      bedAt(B, xc, F, zc, PI / 2, STEEL, WHITE);
      const p = part(B, xc + 1.7, F, zc + 1.3, 0.3);
      p(STEEL, box(0.6, 0.03, 0.4), 0, 0.8, 0); p(STEEL, box(0.6, 0.03, 0.4), 0, 0.35, 0); for (const sx of [-1, 1]) for (const sz of [-1, 1]) p(STEEL, cyl(0.012, 0.012, 0.8, 5), sx * 0.28, 0.4, sz * 0.18);
      for (let k = 0; k < 4; k++) p(STEEL, box(0.012, 0.006, 0.14), -0.18 + k * 0.07, 0.82, 0, 0, k * 0.1); p(WHITE, cyl(0.07, 0.06, 0.08, 10), 0.18, 0.86, 0.05); p(WHITE, box(0.2, 0.05, 0.14), 0, 0.39, 0);
      B.geo(M.iron, cyl(0.012, 0.012, 0.6, 5), mat4(xc, F + 2.9, zc)); B.geo(STEEL, new THREE.ConeGeometry(0.45, 0.2, 16, 1, true), mat4(xc, F + 2.55, zc)); B.geo(mat('glow', 0xfff1d0, { power: 1.3 }), cyl(0.3, 0.3, 0.02, 16), mat4(xc, F + 2.47, zc)); glows.push([xc, F + 2.4, zc, 0.7]); lights.push([xc, F + 2.3, zc, 15, 14]);
      jarShelfAt(B, M.beamLight, xc + 1.9, F, -C - 0.3, PI, 1.6, 1.9, 4, R);
      sign('処置室', xc, F + 2.5, -C + 0.1, 0);
      places.push({ n: '처치실', t: '크게 다친 닌자를 여럿이 둘러앉아 술식으로 고치는 방. 바닥에 치료 술식이 그려져 있다.', b: [-18, -12, Z0, -C], y: [0, F2 - 0.2] });
    }
    // 린넨실: 개어 쌓은 홑이불과 빨래 수레
    {
      const xc = -9;
      for (const sd of [-1, 1]) { const lx = xc + sd * 2.62, lry = sd < 0 ? PI / 2 : -PI / 2, p = part(B, lx, F, -4.6, lry); p(M.beamLight, box(2.2, 2.1, 0.03), 0, 1.05, -0.24); for (const sx of [-1, 1]) p(M.beamLight, box(0.04, 2.1, 0.5), sx * 1.08, 1.05, 0); for (let k = 0; k < 5; k++) { p(M.beamLight, box(2.2, 0.035, 0.5), 0, 0.04 + k * 0.5, 0); if (k < 4) for (let i = 0; i < 4; i++) { const n = 1 + Math.floor(R() * 4); for (let j = 0; j < n; j++) p(j % 3 === 2 ? BLANK[i % 2] : WHITE, box(0.42, 0.07, 0.4), -0.78 + i * 0.52, 0.1 + k * 0.5 + j * 0.075, 0); } } solid(lx, F, -4.6, lry, 2.2, 0.5, 2.1); }
      const p = part(B, xc, F, -5.6, 0.2);
      p(STEEL, box(0.9, 0.03, 0.6), 0, 0.2, 0); for (const sx of [-1, 1]) for (const sz of [-1, 1]) { p(STEEL, cyl(0.012, 0.012, 0.75, 5), sx * 0.43, 0.55, sz * 0.28); p(BLACKM(), cyl(0.05, 0.05, 0.03, 10).rotateZ(PI / 2), sx * 0.43, 0.05, sz * 0.28); }
      p(CURT, cyl(0.42, 0.34, 0.6, 12, 1, true), 0, 0.55, 0, 0, 0, 0, [1, 1, 0.65]); p(WHITE, SPH, 0, 0.82, 0, 0, 0, 0, [0.36, 0.14, 0.24]);
      addCollider(xc - 0.5, F, -6.0, xc + 0.5, F + 0.9, -5.2);
      ceilLamp(B, xc, F + 3.2, -4.4, glows, lights, 11); sign('リネン室', xc, F + 2.5, -C + 0.1, 0);
      places.push({ n: '린넨실', t: '빨아서 개어 둔 홑이불과 환자옷. 옥상 빨랫줄에서 걷어 온 것들이다.', b: [-12, -6, Z0, -C], y: [0, F2 - 0.2] });
    }
    // 어린이 마음 진료실: 낮은 탁자와 방석, 장난감, 벽의 아이들 그림(전쟁 뒤 사쿠라가 이노와 함께 연 곳)
    {
      const xc = 9, zc = 4.6;
      B.geo(mat('plain', 0xe8d9a0, { rough: 1 }), box(3.6, 0.02, 3.2), mat4(xc, F + 0.01, zc));
      B.geo(M.beamLight, cyl(0.7, 0.7, 0.05, 20), mat4(xc, F + 0.36, zc)); B.geo(M.beamLight, cyl(0.1, 0.25, 0.34, 10), mat4(xc, F + 0.17, zc)); addCollider(xc - 0.6, F, zc - 0.6, xc + 0.6, F + 0.38, zc + 0.6);
      for (let k = 0; k < 4; k++) B.geo(mat('plain', [0xe58aa0, 0x7aa6c8, 0xe9c765, 0x8ab88a][k], { rough: 1 }), box(0.5, 0.08, 0.5), mat4(xc + Math.cos(k * 1.57 + 0.4) * 1.15, F + 0.06, zc + Math.sin(k * 1.57 + 0.4) * 1.15, 0, k, 0));
      for (let k = 0; k < 7; k++) B.geo(mat('plain', [0xd8452e, 0x2e5a9e, 0xe9c765, 0x4c9440][k % 4], { rough: 0.7 }), box(0.1, 0.1, 0.1), mat4(xc - 0.3 + (k % 3) * 0.12, F + 0.435 + (k > 4 ? 0.1 : 0), zc - 0.1 + Math.floor(k / 3) * 0.12 - (k > 4 ? 0.06 : 0), 0, k * 0.3, 0));
      { const p = part(B, xc + 0.3, F + 0.385, zc + 0.25, 0.6), tan = mat('plain', 0xb98a58, { rough: 1 }); p(tan, SPH, 0, 0.1, 0, 0, 0, 0, [0.09, 0.1, 0.08]); p(tan, SPH, 0, 0.24, 0, 0, 0, 0, 0.075); for (const sx of [-1, 1]) { p(tan, SPH, sx * 0.06, 0.31, 0, 0, 0, 0, 0.03); p(tan, SPH, sx * 0.1, 0.12, 0.02, 0, 0, 0, [0.035, 0.06, 0.035]); p(tan, SPH, sx * 0.05, 0.02, 0.06, 0, 0, 0, [0.04, 0.035, 0.06]); } }   // 곰 인형
      const q = part(B, xc, F, Z1 - T - 0.03, PI);
      for (let k = 0; k < 6; k++) {
        const dm = textMat(' ', { w: 128, h: 96, bg: '#f7f3e6', color: '#f7f3e6', key: 'kid-draw' + k, draw: (g, w, h) => { const cols = ['#e58aa0', '#2e5a9e', '#e9a23a', '#4c9440', '#d8452e', '#6a4a8a']; g.lineWidth = 5; g.lineCap = 'round';
          g.strokeStyle = cols[k]; g.beginPath(); g.arc(34 + k * 6, 40, 16, 0, PI * 2); g.stroke(); g.beginPath(); g.moveTo(34 + k * 6, 56); g.lineTo(34 + k * 6, 82); g.moveTo(18 + k * 6, 66); g.lineTo(50 + k * 6, 66); g.stroke();
          g.strokeStyle = cols[(k + 2) % 6]; g.beginPath(); g.arc(98 - k * 3, 26, 12, 0, PI * 2); g.stroke(); for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(98 - k * 3 + Math.cos(i) * 16, 26 + Math.sin(i) * 16); g.lineTo(98 - k * 3 + Math.cos(i) * 22, 26 + Math.sin(i) * 22); g.stroke(); }
          g.strokeStyle = cols[3]; g.beginPath(); g.moveTo(6, 90); g.lineTo(122, 90); g.stroke(); } });
        if (Math.abs(-2.2 + (k % 3) * 2.2) < 1.2) continue;   // 창 자리는 비운다
        q(dm, new THREE.PlaneGeometry(0.5, 0.38), -2.2 + (k % 3) * 2.2, 1.9 - Math.floor(k / 3) * 0.55, 0.02, 0, 0, (k % 2 - 0.5) * 0.08);
      }
      shelfAt(B, M.beamLight, xc + 2.6, F, 3.2, -PI / 2, 1.6, 1.2, 3, R);
      ceilLamp(B, xc, F + 3.2, zc, glows, lights); sign('こども心療室', xc, F + 2.5, C - 0.1, PI, 1.3);
      places.push({ n: '어린이 마음 진료실', t: '전쟁으로 마음을 다친 아이들을 돌보려고 사쿠라가 이노와 함께 연 진료실.', b: [6, 12, C, Z1], y: [0, F2 - 0.2] });
    }
    // 의국: 책상 둘, 옷장, 찻주전자
    {
      const xc = 15;
      deskAt(B, M.beamLight, xc - 1.4, F, Z1 - T - 0.5, 0, 1.5, 0.75); deskAt(B, M.beamLight, xc + 1.4, F, Z1 - T - 0.5, 0, 1.5, 0.75); chairAt(B, M.beamLight, xc - 1.4, F, 6.3, 0); chairAt(B, M.beamLight, xc + 1.4, F, 6.3, 0);
      for (let k = 0; k < 2; k++) cabinetAt(B, WHITE, xc - 2.0 + k * 0.95, F, C + 0.35, 0, 0.9, 1.9, 0.5, 2);
      tableAt(B, M.beamLight, xc + 1.9, F, 3.3, 0, 1.0, 0.7); B.geo(M.iron, lathe([[0, 0], [0.1, 0], [0.13, 0.08], [0.11, 0.17], [0.05, 0.2], [0, 0.2]]), mat4(xc + 1.8, F + 0.74, 3.3)); for (let k = 0; k < 3; k++) B.geo(WHITE, cyl(0.036, 0.03, 0.06, 10), mat4(xc + 2.05 + (k % 2) * 0.1, F + 0.77, 3.15 + k * 0.1));
      for (let k = 0; k < 3; k++) B.geo(mat('plain', SCROLL_HEX[k + 1], { rough: 0.9 }), box(0.22, 0.04, 0.3), mat4(xc - 1.6, F + 0.8 + k * 0.04, Z1 - T - 0.5, 0, k * 0.2, 0));
      ceilLamp(B, xc, F + 3.2, 4.6, glows, lights); sign('医局', xc, F + 2.5, C - 0.1, PI, 0.7);
      places.push({ n: '의국', t: '의료 닌자들이 쉬고 기록을 적는 방.', b: [12, 18, C, Z1], y: [0, F2 - 0.2] });
    }
    // 검사실: 긴 작업대의 시약병, 약장
    {
      const xc = 9;
      tableAt(B, STEEL, xc, F, Z0 + T + 0.5, 0, 4.4, 0.8, 0.9);
      for (let k = 0; k < 9; k++) { const hh = 0.1 + (k % 3) * 0.06; B.geo(mat('plain', JAR_HEX[k % 6], { rough: 0.2 }), k % 2 ? lathe([[0, 0], [0.07, 0], [0.07, 0.02], [0.02, hh], [0.02, hh + 0.05], [0, hh + 0.05]], 10) : cyl(0.03, 0.03, hh + 0.05, 8), mat4(xc - 1.8 + k * 0.42, F + 0.9 + (k % 2 ? 0 : (hh + 0.05) / 2), Z0 + T + 0.45 + (k % 3) * 0.08)); }
      { const p = part(B, xc + 1.2, F + 0.9, Z0 + T + 0.7, 0.4); p(M.iron, box(0.16, 0.03, 0.2), 0, 0.015, 0); p(M.iron, box(0.04, 0.28, 0.04), 0, 0.17, -0.07); p(M.iron, cyl(0.03, 0.025, 0.2, 8), 0, 0.3, 0.0, 0.5); p(STEEL, box(0.1, 0.012, 0.1), 0, 0.12, 0.02); }
      jarShelfAt(B, M.beamLight, xc - 2.6, F, -3.6, PI / 2, 2.2, 2.0, 4, R); cabinetAt(B, WHITE, xc + 2.5, F, -2.8, -PI / 2, 0.9, 1.4);
      chairAt(B, STEEL, xc - 0.4, F, -6.3, PI);
      ceilLamp(B, xc, F + 3.2, -4.6, glows, lights); sign('検査室', xc, F + 2.5, -C + 0.1, 0);
      places.push({ n: '검사실', t: '피와 독을 살피는 방. 시즈네가 독을 풀 약을 지을 때 쓰던 시약병이 늘어서 있다.', b: [6, 12, Z0, -C], y: [0, F2 - 0.2] });
    }

    /* ----- 2층: 병실 ----- */
    const ward = (xc, s, who) => {
      const zo = s * (Z1 - T), zh = zo - s * 1.1, ry = s > 0 ? PI : 0, y = F2;
      for (const dx of who ? [-1.7] : [-1.7, 1.7]) { bedAt(B, xc + dx, y, zh, ry, STEEL, BLANK[(xc + dx > 0) ^ (s > 0) ? 0 : 1]); standAt(B, xc + dx + (dx < 0 ? -0.82 : 0.82), y, zo - s * 0.28, WHITE); }
      // 침대 사이 가림천
      if (!who) { B.geo(STEEL, cyl(0.012, 0.012, 2.4, 5).rotateX(PI / 2), mat4(xc, y + 2.1, zo - s * 1.3)); B.geo(CURT, new THREE.PlaneGeometry(1.0, 1.7, 8, 4), mat4(xc, y + 1.25, zo - s * 0.6, 0, PI / 2, 0)); }
      chairAt(B, M.beamLight, xc + (who ? -0.6 : 0.55), y, zh - s * 0.2, who ? -PI / 2 : PI / 2);
      ceilLamp(B, xc, y + 3.2, s * 4.6, glows, lights, 12);
      return { y, zo, zh, bx: xc - 1.7, sx: xc - 2.52 };
    };
    for (const [xc, s] of [[-9, 1], [-15, -1], [-9, -1], [9, 1], [9, -1], [15, -1]]) { ward(xc, s); sign('病室', xc, F2 + 2.5, s * C - s * 0.1, s > 0 ? PI : 0, 0.6); }
    places.push({ n: '병실', t: '침대 둘씩 놓인 병실. 창으로 마을이 내다보인다.', b: [X0, X1, Z0, Z1], y: [F2, RF - 0.2] });
    {   // 록 리의 병실: 머리맡의 수선화 한 송이, 바닥의 아령과 벽에 기댄 목발
      const w = ward(-15, 1, 'lee'), y = w.y;
      B.geo(WHITE, lathe([[0, 0], [0.04, 0], [0.05, 0.1], [0.025, 0.17], [0.03, 0.2], [0, 0.2]]), mat4(w.sx, y + 0.62, w.zo - 0.28)); B.geo(mat('plain', 0x4c9440), cyl(0.006, 0.006, 0.3, 4), mat4(w.sx, y + 0.9, w.zo - 0.28));
      for (let k = 0; k < 6; k++) B.geo(mat('plain', 0xf2d24a, { rough: 0.8 }), SPH, mat4(w.sx + Math.cos(k * 1.047) * 0.04, y + 1.06, w.zo - 0.28 + Math.sin(k * 1.047) * 0.04, 0, 0, 0, [0.03, 0.012, 0.03])); B.geo(mat('plain', 0xe9a23a), cyl(0.018, 0.022, 0.03, 8), mat4(w.sx, y + 1.07, w.zo - 0.28));
      for (const [x, z, r] of [[-13.4, 3.2, 0.3], [-13.0, 3.5, 1.2]]) { const p = part(B, x, y, z, r); p(M.iron, cyl(0.02, 0.02, 0.3, 6).rotateZ(PI / 2), 0, 0.08, 0); for (const sx of [-1, 1]) p(M.iron, cyl(0.08, 0.08, 0.07, 12).rotateZ(PI / 2), sx * 0.17, 0.08, 0); }
      for (const dz of [0, 0.14]) { beamBetween(B, M.beamLight, V(-12.25, y, 5.0 + dz), V(-12.14, y + 1.3, 5.0 + dz), 0.03, 0.03); B.geo(M.beamLight, box(0.04, 0.04, 0.2), mat4(-12.13, y + 1.32, 5.0 + dz)); }
      signBoard(B, '努力', -17.72, y + 1.9, 2.6, PI / 2, 0.5, 0.9, { vertical: true, both: false });
      sign('ロック・リー', -15, F2 + 2.5, C - 0.1, PI, 1.0);
      places.push({ n: '록 리의 병실', t: '중닌 시험에서 가아라에게 크게 다친 리가 누워 있던 방. 머리맡에 사쿠라가 꽂아 둔 수선화, 바닥에는 몰래 들던 아령.', b: [-18, -12, C, Z1], y: [F2, RF - 0.2] });
    }
    {   // 사스케의 병실: 머리맡 접시의 사과
      const w = ward(15, 1, 'sasuke'), y = w.y, sx = w.sx, sz = w.zo - 0.28;
      B.geo(WHITE, cyl(0.12, 0.08, 0.02, 14), mat4(sx, y + 0.63, sz));
      for (let k = 0; k < 5; k++) { B.geo(mat('plain', 0xf3e6b8, { rough: 0.6 }), SPH, mat4(sx + Math.cos(k * 1.26) * 0.06, y + 0.655, sz + Math.sin(k * 1.26) * 0.06, 0, -k * 1.26, 0, [0.035, 0.018, 0.02])); B.geo(mat('plain', 0xc2332a, { rough: 0.5 }), SPH, mat4(sx + Math.cos(k * 1.26) * 0.078, y + 0.66, sz + Math.sin(k * 1.26) * 0.078, 0, -k * 1.26, 0, [0.02, 0.016, 0.02])); }
      B.geo(STEEL, box(0.012, 0.004, 0.12), mat4(sx + 0.15, y + 0.625, sz + 0.05, 0, 0.4, 0)); B.geo(M.beam, box(0.016, 0.014, 0.07), mat4(sx + 0.13, y + 0.628, sz - 0.03, 0, 0.4, 0));
      B.geo(mat('plain', 0xc2332a, { rough: 0.5 }), SPH, mat4(13.5, y + 0.045, 4.4, 0, 0, 0, 0.045));   // 바닥에 구른 사과 한 알
      sign('うちはサスケ', 15, F2 + 2.5, C - 0.1, PI, 1.1);
      places.push({ n: '사스케의 병실', t: '이타치에게 당한 뒤 사스케가 누워 있던 방. 사쿠라가 깎아 온 사과 접시를 사스케가 쳐서 떨어뜨렸다.', b: [12, 18, C, Z1], y: [F2, RF - 0.2] });
    }
    // 2층 휴게실: 긴 의자와 낮은 탁자, 화분
    {
      for (const s of [-1, 1]) benchAt(B, M.beamLight, s * 3.2, F2, 5.4, PI / 2, 2.6);
      tableAt(B, M.beamLight, 0, F2, 5.4, 0, 1.4, 0.8, 0.45);
      for (let k = 0; k < 3; k++) B.geo(mat('plain', SCROLL_HEX[k + 2], { rough: 0.9 }), box(0.22, 0.02, 0.3), mat4(-0.3 + k * 0.28, F2 + 0.46 + k * 0.002, 5.4, 0, k * 0.4, 0));
      for (const x of [-5.3, 5.3]) potAt(B, x, F2, 7.2, 1.2);
      ceilLamp(B, 0, F2 + 3.2, 4.6, glows, lights, 14);
      places.push({ n: '병원 휴게실', t: '걸을 수 있는 환자와 문병 온 사람들이 앉아 쉬는 자리.', b: [-6, 6, C, Z1], y: [F2, RF - 0.2] });
    }

    /* ----- 옥상: 빨랫줄의 흰 홑이불, 물탱크 둘 ----- */
    {
      const y = RF;
      for (let r = 0; r < 4; r++) {
        const z = -1.5 + r * 2.4, x0 = 4, x1 = 16;
        for (const x of [x0, x1]) { B.box(STEEL, x - 0.04, y, z - 0.04, x + 0.04, y + 2.1, z + 0.04, false); B.box(STEEL, x - 0.04, y + 2.02, z - 0.5, x + 0.04, y + 2.08, z + 0.5, false); addCollider(x - 0.08, y, z - 0.08, x + 0.08, y + 2.1, z + 0.08); }
        B.geo(M.iron, tube([V(x0, y + 2.05, z), V(x1, y + 2.05, z)], 0.008, 4, false));
        for (let k = 0; k < 4; k++) { if ((r + k) % 5 === 4) continue; const w = 2.3, xc = x0 + 1.6 + k * 2.9; B.geo(CURT, new THREE.PlaneGeometry(w, 1.7, 10, 6), mat4(xc, y + 1.19, z)); for (const sx of [-1, 1]) B.geo(M.beamLight, box(0.02, 0.07, 0.03), mat4(xc + sx * 0.9, y + 2.04, z)); }
      }
      // 물탱크: 왼쪽은 나루토의 나선환(앞은 작게 패이고 뒤가 크게 터졌다), 오른쪽은 사스케의 치도리(앞에 큰 구멍)
      const tank = (x, z, front, back) => {
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box(STEEL, x + sx * 1.0 - 0.06, y, z + sz * 1.0 - 0.06, x + sx * 1.0 + 0.06, y + 0.7, z + sz * 1.0 + 0.06, false);
        B.geo(TANK, cyl(1.5, 1.5, 3.0, 28), mat4(x, y + 2.2, z)); B.geo(TANK, new THREE.SphereGeometry(1.5, 28, 8, 0, PI * 2, 0, PI / 2), mat4(x, y + 3.7, z, 0, 0, 0, [1, 0.25, 1]));
        for (const yy of [1.0, 2.2, 3.4]) B.geo(STEEL, new THREE.TorusGeometry(1.51, 0.03, 5, 28).rotateX(PI / 2), mat4(x, y + yy, z));
        B.geo(STEEL, cyl(0.06, 0.06, 0.7, 8), mat4(x - 1.2, y + 0.35, z + 1.25)); B.geo(STEEL, cyl(0.06, 0.06, 0.6, 8).rotateX(PI / 2), mat4(x - 1.2, y + 0.7, z + 1.0));
        // 앞(+x)과 뒤(-x)의 구멍
        const blot = (dir, r) => { B.geo(HOLE, SPH, mat4(x + dir * 1.46, y + 2.3, z, 0, 0, 0, [0.09, r, r])); for (let k = 0; k < 9; k++) { const a = k * 0.7 + r; B.geo(TANK, new THREE.ConeGeometry(r * 0.2, r * 0.5, 4), mat4(x + dir * (1.5 + r * 0.1), y + 2.3 + Math.sin(a) * r * 0.95, z + Math.cos(a) * r * 0.95, a, 0, -dir * 1.2)); } };
        blot(1, front); blot(-1, back);
        addCollider(x - 1.3, y, z - 1.3, x + 1.3, y + 4.1, z + 1.3);
      };
      tank(-11.5, 4.2, 0.22, 1.15); tank(-11.5, -0.2, 0.85, 0.0001);
      signBoard(B, '貯水', -9.96, y + 1.2, 4.2, PI / 2, 0.5, 0.3, { both: false });
      for (let k = 0; k < 2; k++) { const p = part(B, 2.6 + k * 0.7, y, 6.6, k * 0.5); p(M.beamLight, lathe([[0, 0], [0.24, 0], [0.3, 0.3], [0.28, 0.3], [0.22, 0.03], [0, 0.03]], 14), 0, 0, 0); p(WHITE, SPH, 0, 0.26, 0, 0, 0, 0, [0.22, 0.1, 0.22]); }   // 빨래 바구니
      places.push({ n: '병원 옥상', t: '흰 홑이불이 널린 옥상. 나루토와 사스케가 여기서 맞붙어, 나선환과 치도리가 물탱크를 하나씩 뚫어 놓았다. 앞은 작게 패였는데 뒤가 크게 터진 쪽이 나루토의 것이다.', b: [X0, X1, Z0, Z1], y: [RF, RF + 6] });
    }

    /* ----- 마당 ----- */
    B.box(M.pave, -1.8, 0, Z1 + 2.8, 1.8, 0.035, 31.5, false); B.box(M.pave, -14, 0, 12.5, 14, 0.035, 14.5, false);
    for (const s of [-1, 1]) {
      benchAt(B, M.beam, s * 6, 0, 15.3, PI, 2.2); benchAt(B, M.beam, s * 11, 0, 15.3, PI, 2.2);
      B.box(TRIM, s * 2.4 - 0.07, 0, 22, s * 2.4 + 0.07, 2.6, 22.14, false); glows.push(lantern(B, s * 2.4, 2.2, 22.07, { text: '医', color: 0xf4f1ea, ink: RED, r: 0.2, h: 0.5 })); addCollider(s * 2.4 - 0.1, 0, 21.97, s * 2.4 + 0.1, 2.6, 22.17);
      for (let k = 0; k < 6; k++) B.geo(mat('leaf', k % 2 ? 0x447f2e : 0x35702a), BUSH.leaves, mat4(s * (4.2 + k * 2.3), 0, Z1 + 1.0, 0, k, 0, 1.0));
    }
    // 뒤뜰: 환자들이 바람 쐬는 뜰
    B.box(M.pave, X1 + 0.2, 0, -1, X1 + 3.4, 0.035, 1, false); B.box(M.pave, X1 + 1.4, 0, -22, X1 + 3.4, 0.035, -1, false); B.box(M.pave, -12, 0, -23.5, X1 + 3.4, 0.035, -21.5, false);
    for (const x of [-8, 0, 8]) benchAt(B, M.beam, x, 0, -24.3, 0, 2.2);
    const inZone = (x, z) => inPoly(x, z, PL) && polyEdge(x, z, PL) > 5;
    grove(B, holder, 2627, 16, [-60, -75, 60, 34], (x, z) => inZone(x, z) && !(x > X0 - 5 && x < X1 + 6 && z > Z0 - 4 && z < Z1 + 9) && !(Math.abs(x) < 4 && z > 0) && !(z > -26 && z < -20 && x > -14 && x < 24) && !(x > X1 && x < X1 + 5 && z < 2 && z > -24));
    places.unshift({ n: '나뭇잎 병원', t: '닌자와 마을 사람들을 돌보는 병원. 웬만한 병과 상처는 여기 의료 닌자들이 고치고, 크게 다친 사람은 츠나데나 시즈네가 나선다.', b: [X0 - 2, X1 + 2, Z0 - 2, Z1 + 4], y: [0, 14] });
    return { places, glows, lights, jumps: [['나뭇잎 병원', 0, 0, 20, 0, 87], ['병원 옥상', 6, RF, 5.5, PI / 2, 88]] };
  });
  out.places.push({ n: '병원 터', t: '큰길 서쪽, 병원의 앞마당과 뒤뜰.', poly: Z.poly, b: bound(Z.poly) }, ...res.places);
  out.jumps.push(...res.jumps); out.glows.push(...res.glows); out.lights.push(...res.lights);
}
/* ============================ 나뭇잎 도서관 ============================
   마을 사람 누구나 드나드는 도서관. 큰길 서쪽, 병원 아래. 정문이 큰길을 본다.
   원작(나루토 위키)에 적힌 것: 마을 한가운데쯤에 있어 누구나 쓸 수 있고, 어려운 의학책부터 사람 사귀는 법을 다룬 책까지 갖췄다는 것.
   (사이가 사람 사귀는 법 책을 읽고, 사쿠라가 의학책을 파고들던 곳이다.)
   건물의 생김새(높은 열람실과 서고 위 2층 마루), 책꽂이 배치, 대출대, 뜰은 모두 지어낸 것이다. */
const BOOK_HEX = [0x7a2e2a, 0x2e4a6a, 0x3f6a4a, 0x8a6a2e, 0x4a3a5a, 0x9a8a6a, 0x2f2f33, 0xa85a3a, 0xd8cfb4, 0x5a7a8a];
function library(scene, out) {
  const Z = zone(27), at = { x: -52, z: 380, ry: PI / 2 };          // 제 좌표의 +z가 큰길(동쪽), +x가 북쪽
  const X0 = -16, X1 = 16, Z0 = -9, Z1 = 9, T = 0.25, F = 0.2, MZ = 3.6, TOP = 6.8, ME = -1;   // ME: 2층 마루의 앞 가장자리
  LOTS.push({ x: at.x + 8, z: at.z, ry: at.ry, w: 38, d: 40 });
  const PL = localPoly(Z.poly, at), R = rngOf(2727);
  const WALLM = mat('plaster', 0xe9dfc4), TILE = mat('tile', 0x3f6f78), TRIM = M.beam, SHELF = mat('wood', 0x6a4a32), WHITE = mat('plain', 0xf4f1ea, { rough: 1 });
  const res = put(scene, at, (B, holder) => {
    const glows = [], lights = [], places = [], books = [], col = new THREE.Color();
    // 책 한 줄: base 자리의 (u0~u1, y, v)에 등이 +z를 보게 꽂는다
    const bookRow = (base, u0, u1, y, v, gapH) => {
      let u = u0 + 0.02;
      while (u < u1 - 0.06) {
        if (R() < 0.05) { u += 0.08 + R() * 0.2; continue; }
        const t = 0.035 + R() * 0.045, h = Math.min(gapH - 0.04, 0.2 + R() * 0.11), lean = R() < 0.06 ? 0.22 : 0;
        books.push([new THREE.Matrix4().multiplyMatrices(base, mat4(u + t / 2 + lean * h / 2, y + h / 2, v, 0, 0, -lean, [t, h, 0.19])), BOOK_HEX[Math.floor(R() * BOOK_HEX.length)]]);
        u += t + 0.004 + lean * h;
      }
    };
    // 책꽂이: both면 양면(가운데 등판), 아니면 벽에 붙이는 한 면. 열린 쪽이 ±z
    const stack = (x, y, z, ry, w, both, h = 2.2, rows = 5) => {
      const d = both ? 0.56 : 0.3, p = part(B, x, y, z, ry), gap = (h - 0.12) / rows;
      p(SHELF, box(w, h, 0.03), 0, h / 2, both ? 0 : -d / 2 + 0.015);
      for (const sx of [-1, 1]) p(SHELF, box(0.05, h, d), sx * (w / 2 - 0.025), h / 2, 0);
      p(SHELF, box(w + 0.06, 0.06, d + 0.04), 0, h - 0.03, 0);
      for (let k = 0; k < rows; k++) {
        const yy = 0.08 + k * gap;
        p(SHELF, box(w - 0.1, 0.03, d - 0.02), 0, yy - 0.015, 0);
        bookRow(p.base, -w / 2 + 0.05, w / 2 - 0.05, yy, both ? d / 2 - 0.12 : 0.03, gap);
        if (both) bookRow(new THREE.Matrix4().multiplyMatrices(p.base, mat4(0, 0, 0, 0, PI, 0)), -w / 2 + 0.05, w / 2 - 0.05, yy, d / 2 - 0.12, gap);
      }
      solid(x, y, z, ry, w, d, h);
    };
    const tag = (text, x, y, z, ry, w = 0.9) => signBoard(B, text, x, y, z, ry, w, 0.3, { both: true });
    // 표지가 보이게 눕혀 놓은 책
    const cover = (title, x, y, z, ry, bg, ink = '#f1e6c8') => { B.geo(mat('plain', new THREE.Color(bg).getHex(), { rough: 0.9 }), box(0.2, 0.035, 0.28), mat4(x, y + 0.0175, z, 0, ry, 0)); B.geo(textMat(title, { w: 128, h: 192, vertical: true, bg, color: ink }), new THREE.PlaneGeometry(0.19, 0.27), mat4(x, y + 0.037, z, -PI / 2, ry, 0)); };

    /* ----- 뼈대 ----- */
    B.box(M.stone, X0 - 0.2, 0, Z0 - 0.2, X1 + 0.2, 0.1, Z1 + 0.2, false);
    B.box(M.floor, X0 + T, 0, Z0 + T, X1 - T, F, Z1 - T);
    const UPS = [MZ - 0.2];
    face(B, WALLM, 'x', Z1 - T, Z1, X0, X1, 0, TOP, 1, [[-12.9, -11.1, 'w'], [-8.9, -7.1, 'w'], [-4.9, -3.1, 'w'], [-1.3, 1.3, 'd'], [3.1, 4.9, 'w'], [7.1, 8.9, 'w'], [11.1, 12.9, 'w']], UPS, TRIM, M.iron, false);
    face(B, WALLM, 'x', Z0, Z0 + T, X0, X1, 0, TOP, -1, [], [], TRIM, M.iron, false);
    face(B, WALLM, 'z', X0, X0 + T, Z0 + T, Z1 - T, 0, TOP, -1, [[1.6, 3.4, 'w'], [5.2, 7.0, 'w']], UPS, TRIM, M.iron, false);
    face(B, WALLM, 'z', X1 - T, X1, Z0 + T, Z1 - T, 0, TOP, 1, [[5.2, 7.0, 'w']], UPS, TRIM, M.iron, false);
    for (const [x, z] of [[X0, Z0], [X0, Z1], [X1, Z0], [X1, Z1]]) B.box(TRIM, x - 0.14, 0, z - 0.14, x + 0.14, TOP, z + 0.14, false);
    for (const y of [0.5, 3.4, TOP - 0.1]) { B.box(TRIM, X0 - 0.05, y - 0.08, Z0 - 0.05, X1 + 0.05, y + 0.08, Z0, false); B.box(TRIM, X0 - 0.05, y - 0.08, Z1, X1 + 0.05, y + 0.08, Z1 + 0.05, false); B.box(TRIM, X0 - 0.05, y - 0.08, Z0, X0, y + 0.08, Z1, false); B.box(TRIM, X1, y - 0.08, Z0, X1 + 0.05, y + 0.08, Z1, false); }
    hipRoof(B, TILE, X0, Z0, X1, Z1, TOP, 3.2, { over: 1.0 });
    // 현관: 맞배 지붕 문간과 현판
    B.box(M.stone, -2.8, 0, Z1, 2.8, 0.1, Z1 + 3.0, false);
    for (const s of [-1, 1]) { B.box(TRIM, s * 2.4 - 0.12, 0, Z1 + 2.5, s * 2.4 + 0.12, 3.0, Z1 + 2.74); beamBetween(B, TRIM, V(s * 2.4, 2.9, Z1), V(s * 2.4, 2.9, Z1 + 2.7), 0.14, 0.16); }
    B.box(TRIM, -2.6, 2.84, Z1 + 2.5, 2.6, 3.0, Z1 + 2.74, false);
    gableRoof(B, TILE, -2.6, Z1 + 0.1, 2.6, Z1 + 2.8, 3.0, 1.0, { ridge: 'z', over: 0.5, overGable: 0.4, gable: WALLM });
    signBoard(B, '木ノ葉図書館', 0, 2.55, Z1 + 2.78, 0, 3.0, 0.5, { both: false });

    /* ----- 2층 마루: 서고 위. 앞 가장자리에 난간, 북쪽 벽을 따라 오르는 계단 ----- */
    B.box(M.floor, X0 + T, MZ - 0.2, Z0 + T, X1 - T, MZ, ME);
    B.box(TRIM, X0 + T, MZ - 0.42, ME - 0.2, X1 - T, MZ - 0.2, ME, false);
    for (const x of [-13.5, -7.5, -1.5, 1.5, 7.5, 13.5]) { B.box(TRIM, x - 0.12, F, ME - 0.22, x + 0.12, MZ - 0.42, ME + 0.02); for (const s of [-1, 1]) beamBetween(B, TRIM, V(x + s * 0.1, MZ - 0.95, ME - 0.1), V(x + s * 0.75, MZ - 0.44, ME - 0.1), 0.09, 0.1); }
    for (let x = -12; x <= 12; x += 3) B.box(TRIM, x - 0.07, MZ - 0.36, Z0 + T, x + 0.07, MZ - 0.2, ME - 0.2, false);
    stairs(B, M.floorDark, 'z', ME, 1, F, MZ, 14.2, 15.75, 0.3);
    railing(B, TRIM, [[X0 + T, ME + 0.05], [14.15, ME + 0.05]], MZ, 1.0, { gap: 0.22 });
    { const n = 17; for (let k = 0; k <= 16; k += 4) { const z = ME + 0.3 * (16 - k) + 0.15, y = F + (k + 1) * 0.2; B.box(TRIM, 14.12, y - 0.2, z - 0.04, 14.2, y + 0.95, z + 0.04, false); } beamBetween(B, TRIM, V(14.16, F + 0.2 + 0.95, ME + 4.95), V(14.16, MZ + 0.95, ME + 0.1), 0.07, 0.07); void n; }
    addCollider(14.1, F, ME, 14.2, MZ + 1, ME + 4.9);

    /* ----- 1층 서고: 양면 책꽂이 여덟 줄 ----- */
    const SECT = [[-12, '歴史'], [-9, '地理'], [-6, '植物'], [-3, '医学'], [3, '忍術'], [6, '物語'], [9, '料理'], [12, '人づきあい']];
    for (const [x, name] of SECT) {
      for (const zc of [-6.3, -3.3]) stack(x, F, zc, PI / 2, 2.8, true);
      B.geo(M.iron, cyl(0.006, 0.006, 0.5, 4), mat4(x, MZ - 0.45, ME - 0.9)); tag(name, x, MZ - 0.85, ME - 0.9, 0, name.length > 2 ? 1.5 : 0.8);
    }
    for (const x of [-10.5, -4.5, 4.5, 10.5]) ceilLamp(B, x, MZ - 0.2, -4.8, glows, lights, 11);
    places.push({ n: '도서관 서고', t: '역사·지리·식물·의학·인술·이야기·요리, 그리고 사람 사귀는 법까지. 갈래마다 팻말이 걸려 있다.', b: [X0, X1, Z0, ME], y: [0, MZ - 0.2] });

    /* ----- 1층 열람실(천장이 높은 앞쪽) ----- */
    // 대출대와 목록 서랍
    {
      const p = part(B, -9.6, F, 6.0, PI / 2);
      p(SHELF, box(3.6, 1.0, 0.6), 0, 0.5, 0); p(M.beamLight, box(3.8, 0.05, 0.8), 0, 1.025, 0); for (let k = 0; k < 5; k++) p(M.beamLight, box(0.04, 0.92, 0.02), -1.6 + k * 0.8, 0.5, 0.31);
      p(mat('plain', 0xeee8d8, { rough: 1 }), box(0.34, 0.03, 0.46), -1.0, 1.065, 0, 0, 0.1); p(mat('metal', 0xc9a24a, { rough: 0.4 }), SPH, 0.1, 1.08, 0.12, 0, 0, 0, [0.05, 0.035, 0.05]);
      p(M.beam, box(0.1, 0.05, 0.06), 0.6, 1.075, 0.1); p(mat('plain', 0x8a1c16), box(0.08, 0.02, 0.04), 0.6, 1.11, 0.1);
      for (let k = 0; k < 5; k++) p(mat('plain', BOOK_HEX[k * 2 % 10], { rough: 0.9 }), box(0.2, 0.035, 0.28), 1.3, 1.07 + k * 0.036, -0.05, 0, (k % 3 - 1) * 0.15);
      solid(-9.6, F, 6.0, PI / 2, 3.8, 0.8, 1.05); chairAt(B, M.beam, -10.8, F, 6.0, PI / 2);
      tag('貸出', -9.6, F + 2.6, 6.0, PI / 2, 0.8); B.geo(M.iron, cyl(0.006, 0.006, 3.8, 4), mat4(-9.6, F + 4.7, 5.7)); B.geo(M.iron, cyl(0.006, 0.006, 3.8, 4), mat4(-9.6, F + 4.7, 6.3));
      // 목록 서랍장
      const q = part(B, -15.4, F, 4.3, PI / 2);
      q(SHELF, box(2.2, 1.3, 0.5), 0, 0.65, 0); for (let r = 0; r < 5; r++) for (let c = 0; c < 8; c++) { q(M.beamLight, box(0.24, 0.2, 0.02), -0.945 + c * 0.27, 0.2 + r * 0.24, 0.255); q(M.iron, box(0.07, 0.03, 0.02), -0.945 + c * 0.27, 0.2 + r * 0.24, 0.27); }
      solid(-15.4, F, 4.3, PI / 2, 2.2, 0.5, 1.3);
      // 돌려받은 책 수레
      const c = part(B, -7.6, F, 7.6, 0.3);
      for (const yy of [0.3, 0.75]) { c(SHELF, box(0.9, 0.03, 0.45), 0, yy, 0); for (let k = 0; k < 7; k++) c(mat('plain', BOOK_HEX[(k * 3 + (yy > 0.5 ? 1 : 0)) % 10], { rough: 0.9 }), box(0.05, 0.24, 0.19), -0.36 + k * 0.07, yy + 0.135, 0); }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) c(M.iron, cyl(0.012, 0.012, 0.95, 5), sx * 0.43, 0.5, sz * 0.2);
      addCollider(-8.1, F, 7.3, -7.1, F + 1, 7.9);
    }
    signBoard(B, 'しずかに', -5.9, F + 2.9, Z1 - T - 0.04, PI, 1.3, 0.34, { both: false });
    // 긴 책상 여섯: 의자와 책상 등
    const TABLES = [[-11, 1.4], [-5, 1.4], [-5, 5.0], [4, 1.4], [4, 5.0], [10, 5.0]];
    for (const [x, z] of TABLES) {
      tableAt(B, M.beamLight, x, F, z, 0, 2.6, 1.0);
      for (const sx of [-0.65, 0.65]) { chairAt(B, M.beam, x + sx, F, z - 0.8, 0); chairAt(B, M.beam, x + sx, F, z + 0.8, PI); }
      B.geo(M.iron, cyl(0.07, 0.09, 0.02, 10), mat4(x, F + 0.75, z)); B.geo(M.iron, cyl(0.01, 0.01, 0.3, 5), mat4(x, F + 0.9, z)); B.geo(mat('glow', 0xffe2a8, { power: 0.9 }), new THREE.ConeGeometry(0.13, 0.14, 12, 1, true), mat4(x, F + 1.08, z)); glows.push([x, F + 1.05, z, 0.35]);
    }
    // 사이가 읽던 책들: 사람 사귀는 법
    { const [x, z] = TABLES[2]; cover('友だちの作り方', x - 0.6, F + 0.74, z + 0.2, 0.2, '#3d5a80'); cover('人の気持ちがわかる本', x - 0.3, F + 0.74, z + 0.22, -0.15, '#7a3a34'); cover('笑顔のすすめ', x + 0.75, F + 0.74, z - 0.2, 2.9, '#4a7a58');
      for (let k = 0; k < 3; k++) B.geo(mat('plain', BOOK_HEX[k + 3], { rough: 0.9 }), box(0.2, 0.035, 0.28), mat4(x + 0.4, F + 0.7575 + k * 0.036, z + 0.2, 0, k * 0.2, 0));
      places.push({ n: '사이가 앉던 자리', t: '사람 마음을 몰랐던 사이가 "친구 만드는 법", "남의 기분을 아는 책" 같은 책을 쌓아 놓고 읽던 책상.', b: [x - 1.6, x + 1.6, z - 1.5, z + 1.5], y: [0, 3] }); }
    // 사쿠라가 파고들던 의학책
    { const [x, z] = TABLES[3]; cover('医療忍術大全', x - 0.5, F + 0.74, z - 0.2, 3.0, '#2f4a3a'); cover('毒と薬草', x + 0.6, F + 0.74, z + 0.2, 0.15, '#6a4a2a');
      for (let k = 0; k < 5; k++) B.geo(mat('plain', BOOK_HEX[(k * 2 + 1) % 10], { rough: 0.9 }), box(0.22, 0.05, 0.3), mat4(x + 0.1, F + 0.765 + k * 0.051, z - 0.18, 0, k * 0.12 - 0.2, 0));
      B.geo(mat('plain', 0xeee8d8, { rough: 1 }), box(0.3, 0.004, 0.4), mat4(x - 0.9, F + 0.742, z + 0.15, 0, -0.2, 0)); B.geo(M.beam, cyl(0.008, 0.008, 0.2, 5).rotateX(PI / 2), mat4(x - 0.7, F + 0.748, z + 0.15, 0, 0.5, 0));
      places.push({ n: '의학책이 쌓인 자리', t: '츠나데의 제자가 된 사쿠라가 두꺼운 의료 인술 책을 쌓아 놓고 파고들던 책상.', b: [x - 1.6, x + 1.6, z - 1.5, z + 1.5], y: [0, 3] }); }
    for (const x of [-2.2, 2.2]) potAt(B, x, F, 8.0, 1.2);
    // 높은 천장의 등
    for (const [x, z] of [[-9, 3.4], [0, 3.4], [9, 3.4], [-9, -4.5], [0, -4.5], [9, -4.5]]) { B.geo(M.iron, cyl(0.008, 0.008, 1.0, 5), mat4(x, TOP - 0.5, z)); B.geo(mat('glow', 0xffe2a8, { power: 1.0 }), lathe([[0, 0], [0.2, 0.03], [0.26, 0.2], [0.14, 0.34], [0, 0.36]]), mat4(x, TOP - 1.36, z)); glows.push([x, TOP - 1.2, z, 0.8]); lights.push([x, TOP - 1.5, z, 16, 16]); }
    places.push({ n: '도서관 열람실', t: '천장이 높은 열람실. 창가의 긴 책상에 앉아 책을 읽는다. 벽에는 "조용히".', b: [X0, X1, ME, Z1], y: [0, TOP] });

    /* ----- 2층 마루: 벽을 따라 책꽂이, 난간 가의 책상 ----- */
    for (let x = -12.6; x <= 9.5; x += 4.4) stack(x, MZ, Z0 + T + 0.16, 0, 4.2, false);
    for (const zc of [-6.4, -3.4]) stack(X0 + T + 0.16, MZ, zc, PI / 2, 2.6, false);
    stack(X1 - T - 0.16, MZ, -5.4, -PI / 2, 4.2, false);
    for (const x of [-12, -7, -2, 3, 8]) { deskAt(B, M.beamLight, x, MZ, ME - 0.5, 0, 1.6, 0.7); chairAt(B, M.beam, x, MZ, ME - 1.35, 0); }
    cover('木ノ葉の歴史', -12.3, MZ + 0.78, ME - 0.5, 0.1, '#5a3a2a'); cover('忍の心得', 3.2, MZ + 0.78, ME - 0.5, -0.2, '#2e4a6a');
    tableAt(B, M.beamLight, 0, MZ, -5.2, 0, 2.2, 0.9, 0.42); for (const sx of [-1.7, 1.7]) benchAt(B, M.beam, sx, MZ, -5.2, PI / 2, 1.6);
    tag('古書・巻物', 0, MZ + 2.5, Z0 + T + 0.5, 0, 1.4); shelfAt(B, SHELF, 13.0, MZ, Z0 + T + 0.2, 0, 2.4, 2.2, 5, R);
    places.push({ n: '도서관 2층', t: '서고 위의 마루. 벽을 따라 옛 책과 두루마리가 꽂혀 있고, 난간 가 책상에서 열람실이 내려다보인다.', b: [X0, X1, Z0, ME], y: [MZ, TOP] });

    // 책을 한꺼번에 그린다(권마다 빛깔만 다르다)
    {
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat('plain', 0xffffff, { rough: 0.9 }), books.length);
      books.forEach(([m, hex], i) => { im.setMatrixAt(i, m); im.setColorAt(i, col.setHex(hex)); });
      im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.receiveShadow = true; im.computeBoundingSphere(); holder.add(im);
    }

    /* ----- 뜰 ----- */
    B.box(M.pave, -1.8, 0, Z1 + 3.0, 1.8, 0.035, 39.5, false); B.box(M.pave, -13, 0, 14, 13, 0.035, 16, false);
    for (const s of [-1, 1]) {
      for (const x of [5, 10]) benchAt(B, M.beam, s * x, 0, 16.8, PI, 2.2);
      B.box(TRIM, s * 2.4 - 0.07, 0, 24, s * 2.4 + 0.07, 2.6, 24.14, false); glows.push(lantern(B, s * 2.4, 2.2, 24.07, { text: '本', color: 0xf0e2c0, r: 0.2, h: 0.5 })); addCollider(s * 2.4 - 0.1, 0, 23.97, s * 2.4 + 0.1, 2.6, 24.17);
      for (let k = 0; k < 6; k++) B.geo(mat('leaf', k % 2 ? 0x447f2e : 0x35702a), BUSH.leaves, mat4(s * (4.2 + k * 2.1), 0, Z1 + 1.0, 0, k, 0, 1.0));
    }
    // 나무 그늘의 책 읽는 자리
    B.box(M.pave, -1.2, 0, Z0 - 16, 1.2, 0.035, Z0 - 0.2, false); B.box(M.pave, X0 - 3.2, 0, -1, X0 - 0.2, 0.035, 1, false); B.box(M.pave, X0 - 3.2, 0, Z0 - 2, X0 - 1.2, 0.035, -1, false); B.box(M.pave, X0 - 3.2, 0, Z0 - 3.4, 1.2, 0.035, Z0 - 1.4, false);
    plate(B, M.pave, -6, Z0 - 28, 6, Z0 - 16, 0, 0.037, (x, z) => Math.hypot(x, z - (Z0 - 22)) < 5.5, false);
    for (const a of [0, PI, PI * 1.5]) benchAt(B, M.beam, Math.cos(a) * 4.2, 0, Z0 - 22 + Math.sin(a) * 4.2, -a - PI / 2, 2.0);
    const inZone = (x, z) => inPoly(x, z, PL) && polyEdge(x, z, PL) > 5;
    grove(B, holder, 2728, 18, [-70, -110, 70, 36], (x, z) => inZone(x, z) && !(x > X0 - 6 && x < X1 + 5 && z > Z0 - 5 && z < Z1 + 10) && !(Math.abs(x) < 4 && z > 0) && !(Math.hypot(x, z - (Z0 - 22)) < 9) && !(Math.abs(x) < 3 && z < 0 && z > Z0 - 20));
    places.unshift({ n: '나뭇잎 도서관', t: '마을 사람 누구나 드나드는 도서관. 어려운 의학책부터 사람 사귀는 법을 다룬 책까지 갖추고 있다.', b: [X0 - 2, X1 + 2, Z0 - 2, Z1 + 4], y: [0, 12] });
    return { places, glows, lights, jumps: [['나뭇잎 도서관', 0, 0, 22, 0, 89], ['도서관 2층', 0, MZ, -4, PI, 90]] };
  });
  out.places.push({ n: '도서관 터', t: '큰길 서쪽, 도서관의 앞뜰과 나무 그늘.', poly: Z.poly, b: bound(Z.poly) }, ...res.places);
  out.jumps.push(...res.jumps); out.glows.push(...res.glows); out.lights.push(...res.lights);
}
/* ============================ 번화가 ============================
   큰길 동쪽의 가게 거리. 바둑판 골목마다 가게가 줄지어 서고, 골목 위로 붉은 등 줄이 걸려 있다.
   큰길가 북쪽(이치라쿠 라멘·야키니쿠 큐 둘레)은 포장마차가 서는 장터 마당.
   원작에는 번화가의 지도가 없어 골목의 짜임새, 가게 이름, 골목 어귀의 문과 등 줄, 포장마차는 모두 지어낸 것이다
   (이름 있는 가게 — 야키니쿠 큐·경단 가게·아마구리아마·슈슈야 — 는 따로 짓는다). */
const TOWN_SHOPS = ['八百屋', '魚屋', '肉屋', '豆腐', '米屋', '酒屋', '茶屋', '甘味処', '蕎麦', 'うどん', '寿司', '天ぷら', '居酒屋', '焼鳥', 'おでん', '定食', '弁当', '菓子', '饅頭', '煎餅', '呉服', '履物', '傘屋', '金物', '忍具', '武器', '巻物', '書店', '古本', '薬屋', '花屋', '玩具', '提灯', '銭湯', '宿屋', '質屋', '写真', '理髪', '雑貨', '陶器', '漬物', '乾物', '味噌', '飴屋', '竹細工', '染物'];
function downtown(scene, out) {
  const Z = zone(12), R = rngOf(1212), K = { red: mat('glow', 0xd8452e, { power: 0.9 }), white: mat('glow', 0xf0e2c0, { power: 0.9 }) };
  const VX = [44.5, 93, 141.5], HZ = [503, 560, 616.5, 673.5, 730], ZA = 450, ZB = 784, XA = 10, XB = 155;      // 세로 골목의 x, 가로 골목의 z
  /* ----- 골목가의 가게: 겉모습은 streets.js가 줄지어 세운다 ----- */
  let si = 0;
  const chochin = lathe([[0, -0.2], [0.07, -0.2], [0.13, -0.12], [0.15, 0], [0.13, 0.12], [0.07, 0.2], [0, 0.2]], 8);
  const banners = ['営業中', '大安売', '新入荷', '名物'].map((t, i) => textMat(t, { w: 64, h: 256, vertical: true, bg: ['#7a1f1c', '#1f3a6e', '#2f5a34', '#f1ead6'][i], color: i === 3 ? '#1d1a16' : '#f4efe2' }, 'cloth'));
  const crateM = mat('planks', 0xb08a58), barrelM = mat('wood', 0x8a6238);
  zoneGroups().push({
    polys: Z.blocks, land: 3, size: [8, 4.5, 8.5, 3], set: 0.75,                              // 가게는 골목에 바짝 붙여 세운다
    ok: (x, z) => !(x < 31 && z > 649 && z < 671) && Z.blocks.some(b => { const xs = b.map(q => q[0]), zs = b.map(q => q[1]); const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs); return x > x0 && x < x1 && z > z0 && z < z1 && Math.min(x - x0, x1 - x, z - z0, z1 - z) < 13.5; }),   // 경단 가게 자리(큰길가)는 비우고, 블록 한가운데(안마당)에는 집을 세우지 않는다                                           // 경단 가게 자리(큰길가)
    style: Rr => { const k = Rr(); return { round: false, floors: 2 + (Rr() < 0.4 ? 1 : 0), roofKind: k < 0.45 ? 'gable' : k < 0.7 ? 'hip' : 'flat', shop: Rr() < 0.78 ? TOWN_SHOPS[si++ % TOWN_SHOPS.length] : null }; },
    deco: (B, h) => {
      if (!h.shop) return;
      const s = h.seed, sd = s % 2 ? 1 : -1, u = sd * (h.w / 2 - 0.55), zf = h.d / 2;
      // 처마 밑의 붉은 등
      B.geo(M.iron, cyl(0.008, 0.008, 0.3, 4), mat4(u, 2.75, zf + 0.5)); B.geo(s % 5 ? K.red : K.white, chochin, mat4(u, 2.4, zf + 0.5)); B.geo(M.beam, box(0.04, 0.04, 0.55), mat4(u, 2.9, zf + 0.27));
      // 세워 둔 깃발
      if (s % 3 === 0) { const bu = -u; B.geo(M.beamLight, cyl(0.02, 0.02, 2.8, 5), mat4(bu, 1.4, zf + 0.75)); B.geo(M.beamLight, cyl(0.012, 0.012, 0.5, 4).rotateZ(PI / 2), mat4(bu + 0.22, 2.72, zf + 0.75)); B.geo(banners[s % 4], new THREE.PlaneGeometry(0.44, 1.7, 2, 6), mat4(bu + 0.24, 1.85, zf + 0.75)); }
      // 문 옆의 궤짝이나 술통
      if (s % 4 === 1) { for (let k = 0; k < 3; k++) B.geo(crateM, box(0.55, 0.4, 0.45), mat4(-u + (k === 2 ? 0.05 : (k - 0.5) * 0.6) * (k === 2 ? 1 : 1), 0.2 + (k === 2 ? 0.4 : 0), zf + 0.45, 0, (s + k) % 3 * 0.1, 0)); }
      else if (s % 4 === 2) { for (let k = 0; k < 2; k++) { B.geo(barrelM, lathe([[0, 0], [0.24, 0], [0.3, 0.35], [0.24, 0.7], [0, 0.7]], 10), mat4(-u + k * 0.62 - 0.3, 0, zf + 0.45)); for (const yy of [0.12, 0.58]) B.geo(M.iron, new THREE.TorusGeometry(0.27, 0.012, 4, 10).rotateX(PI / 2), mat4(-u + k * 0.62 - 0.3, yy, zf + 0.45)); } }
    },
  });

  /* ----- 골목 위의 등 줄: 장대 둘 사이에 처진 줄, 줄마다 등 다섯 ----- */
  const poles = [], cables = [], lampsR = [], lampsW = [], _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
  const seg = (a, b) => { _x.subVectors(b, a); const L = _x.length(); _x.normalize(); _y.set(0, 1, 0).addScaledVector(_x, -_x.y).normalize(); _z.crossVectors(_x, _y); cables.push(new THREE.Matrix4().makeBasis(_x.clone().multiplyScalar(L), _y.clone().multiplyScalar(0.018), _z.clone().multiplyScalar(0.018)).setPosition((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)); };
  const string = (ax, az, bx, bz, n) => {
    const H = 5.3, sag = 0.7, pts = [];
    for (const [x, z] of [[ax, az], [bx, bz]]) { poles.push(mat4(x, H / 2, z, 0, 0, 0, [1, H, 1])); addCollider(x - 0.1, 0, z - 0.1, x + 0.1, H, z + 0.1); }
    for (let i = 0; i <= n + 1; i++) { const t = i / (n + 1); pts.push(V(ax + (bx - ax) * t, H - 0.1 - sag * 4 * t * (1 - t), az + (bz - az) * t)); }
    for (let i = 0; i <= n; i++) seg(pts[i], pts[i + 1]);
    for (let i = 1; i <= n; i++) (n % 2 === 0 && i % 2 === 0 || (ax + az) % 7 < 1 ? lampsW : lampsR).push(mat4(pts[i].x, pts[i].y - 0.24, pts[i].z, 0, i, 0, 1.25));
    if (Math.round(ax + az) % 3 === 0) out.glows.push([(ax + bx) / 2, H - 1.0, (az + bz) / 2, 1.1]);
  };
  const cross = (v, list, r) => list.some(c => Math.abs(v - c) < r);
  for (const cx of VX) for (let z = ZA + 9; z < ZB - 4; z += 15) { if (cross(z, HZ, 5)) continue; string(cx - 2.8, z, cx + 2.8, z, 5); }
  for (const cz of HZ) for (let x = XA + 8; x < XB - 4; x += 15) { if (cross(x, VX, 5)) continue; string(x, cz - 2.8, x, cz + 2.8, 5); }
  const inst = (g, m, list, shadow = false) => { const im = new THREE.InstancedMesh(g, m, list.length); list.forEach((q, i) => im.setMatrixAt(i, q)); im.instanceMatrix.needsUpdate = true; im.castShadow = shadow; im.receiveShadow = true; im.computeBoundingSphere(); scene.add(im); };
  inst(cyl(0.06, 0.08, 1, 6), M.beam, poles, true); inst(new THREE.BoxGeometry(1, 1, 1), M.iron, cables);
  inst(chochin, K.red, lampsR); inst(chochin, K.white, lampsW);

  const B = new Builder();
  /* ----- 골목 어귀의 문: 큰길에서 가로 골목으로 들어서는 자리 ----- */
  const tile = mat('tile', 0xa4502f);
  HZ.forEach((cz, i) => {
    const x = 13, name = ['一番街', '二番街', '三番街', '四番街', '五番街'][i];
    for (const s of [-1, 1]) { B.box(M.beam, x - 0.18, 0, cz + s * 3.0 - 0.18, x + 0.18, 4.6, cz + s * 3.0 + 0.18); B.box(M.stone, x - 0.28, 0, cz + s * 3.0 - 0.28, x + 0.28, 0.4, cz + s * 3.0 + 0.28, false); }
    B.box(M.beam, x - 0.1, 3.7, cz - 3.6, x + 0.1, 3.92, cz + 3.6, false); B.box(M.beam, x - 0.14, 4.5, cz - 3.9, x + 0.14, 4.72, cz + 3.9, false);
    gableRoof(B, tile, x - 0.7, cz - 3.8, x + 0.7, cz + 3.8, 4.72, 0.7, { ridge: 'z', over: 0.45, overGable: 0.45 });
    signBoard(B, name, x, 4.2, cz, -PI / 2, 2.6, 0.5, { bg: '#7a1f1c', color: '#f4efe2' });
    for (const s of [-1, 1]) out.glows.push(lantern(B, x - 0.35, 3.1, cz + s * 2.2, { text: '商', r: 0.22, h: 0.55 }));
  });

  /* ----- 포장마차와 길가 살림 ----- */
  const stallC = [['#b3261a', 0xb3261a], ['#1f3a6e', 0x1f3a6e], ['#2f5a34', 0x2f5a34], ['#8a5a1e', 0x8a5a1e]];
  const yatai = (x, z, ry, name, k) => {
    const p = part(B, x, 0, z, ry), [css, hex] = stallC[k % 4], cloth = mat('plain', hex, { rough: 0.95, side: 'double' });
    p(M.beamLight, box(2.3, 0.75, 0.85), 0, 0.5, 0); p(M.beam, box(2.5, 0.05, 1.1), 0, 0.9, 0.05);
    for (const sx of [-1, 1]) { p(M.beam, cyl(0.34, 0.34, 0.06, 14).rotateZ(PI / 2), sx * 1.2, 0.34, -0.1); p(M.iron, cyl(0.06, 0.06, 0.08, 8).rotateZ(PI / 2), sx * 1.2, 0.34, -0.1); for (const sz of [-1, 1]) p(M.beam, box(0.06, 1.5, 0.06), sx * 1.1, 1.65, sz * 0.45); }
    p(cloth, box(2.7, 0.04, 1.5), 0, 2.45, 0.1, 0.12); p(M.beam, box(2.5, 0.05, 0.05), 0, 2.36, 0.6);
    for (let i = 0; i < 4; i++) p(textMat([...name][i] || ' ', { w: 64, h: 96, bg: css, color: '#f4efe2' }, 'cloth'), new THREE.PlaneGeometry(0.56, 0.6, 2, 3), -0.87 + i * 0.58, 2.04, 0.62);
    p(M.iron, cyl(0.2, 0.17, 0.22, 12), -0.6, 1.03, 0); p(M.iron, cyl(0.2, 0.17, 0.22, 12), 0.1, 1.03, 0); p(mat('plain', 0xe9e4d6, { rough: 0.5 }), cyl(0.09, 0.06, 0.07, 10), 0.75, 0.96, 0.25); p(mat('plain', 0xe9e4d6, { rough: 0.5 }), cyl(0.09, 0.06, 0.07, 10), 0.95, 0.96, 0.1);
    p(M.iron, cyl(0.008, 0.008, 0.25, 4), 1.2, 2.2, 0.62); p(K.red, chochin, 1.2, 1.9, 0.62, 0, 0, 0, 1.2);
    for (let i = 0; i < 3; i++) { p(M.beamLight, cyl(0.17, 0.17, 0.04, 10), -0.8 + i * 0.8, 0.5, 1.05); p(M.beamLight, cyl(0.03, 0.03, 0.48, 6), -0.8 + i * 0.8, 0.24, 1.05); }
    solid(x, 0, z, ry, 2.5, 1.1, 1.0);
    const c = Math.cos(ry), s = Math.sin(ry); out.glows.push([x + 1.2 * c + 0.62 * s, 1.9, z - 1.2 * s + 0.62 * c, 0.6]);
  };
  // 장터 마당: 이치라쿠 라멘과 야키니쿠 큐 둘레
  [[36, 458, 'たこ焼'], [36, 472, 'やきそば'], [36, 494, 'おでん'], [36, 512, 'もろこし'], [36, 534, 'りんご飴'], [36, 550, 'お面'], [20, 503, '金魚'], [20, 553, 'わたあめ']].forEach(([x, z, name], i) => yatai(x, z, x > 30 ? -PI / 2 : 0, name, i));
  for (const z of [465, 487, 503, 523, 542]) benchAt(B, M.beam, 31.5, 0, z, PI / 2, 2.0);
  // 골목 모퉁이의 포장마차와 긴 의자
  [[VX[0] + 2.2, HZ[1] + 8, PI / 2, '甘酒'], [VX[1] - 2.2, HZ[2] - 9, -PI / 2, '焼鳥'], [VX[1] + 2.2, HZ[3] + 9, PI / 2, '団子'], [VX[2] - 2.2, HZ[0] + 10, -PI / 2, 'そば'], [VX[0] - 2.2, HZ[3] + 12, -PI / 2, 'たい焼'], [VX[2] - 2.2, HZ[4] - 10, -PI / 2, 'ラムネ']].forEach(([x, z, ry, name], i) => yatai(x, z, ry, name, i + 2));
  for (const cx of VX) for (const cz of HZ) if (R() < 0.6) benchAt(B, M.beam, cx + (R() < 0.5 ? -2.6 : 2.6), 0, cz + (R() < 0.5 ? -7 : 7), PI / 2, 1.8);
  B.finish(scene);

  out.places.push({ n: '번화가', t: '가게와 술집이 바둑판 골목마다 늘어선 거리. 골목 위로 붉은 등 줄이 걸려 있다.', poly: Z.poly, b: bound(Z.poly) },
    { n: '장터 마당', t: '이치라쿠 라멘과 야키니쿠 큐 사이의 마당. 포장마차가 줄지어 선다.', b: [10, 41, 450, 557], y: [0, 6] });
  out.jumps.push(['번화가', 6, 0, HZ[2], -PI / 2, 91], ['번화가 한가운데', VX[1], 0, HZ[2] + 4, 0, 92]);
}
/* ============================ 번화가의 이름 있는 가게 ============================
   야키니쿠 큐 · 경단 가게 · 아마구리아마 · 슈슈야. 넷 다 안에 들어갈 수 있다.
   원작(나루토 위키)에 적힌 것
   - 야키니쿠 큐: 넓은 창, 초록 자리의 칸막이 좌석 여럿과 초록 방석을 깐 바닥 자리, 벽에 붙은 차림표, 상마다 가운데 박힌 숯불 화로와 집게.
     아스마가 제10반을 데리고 다니던 단골집. 파를 얹은 소금 우설이 이름난 음식.
   - 경단 가게: 흰 경단을 꿴 꼬치 꼴 간판에 붉은 "だんご", 안은 수수한 나무 상, 네모난 등, 벽마다 걸린 차림표. 안코의 단골집이고, 이타치와 키사메가 차를 마시고 간 곳.
   - 아마구리아마: 밤 과자를 파는 단것 가게. 차 거리의 첫째 가게는 밖에서 먹는다. 다른 나라의 과자(모래 경단·기린 넥타·바위 떡)도 늘어놓았다.
   - 슈슈야: 중국풍 술집. 기둥이 받친 높은 천장과 작은 등 여럿, 술을 늘어놓은 바와 걸상, 나무 칸막이 좌석. 큰 접시 요리와 숯불 닭꼬치, 제 술이 이름났다. 지라이야가 떠나기 전 츠나데와 한잔한 곳.
   건물의 겉모습과 크기, 자리 배치의 세부, 부엌, 가게 밖 의자와 양산은 지어낸 것이다. 경단 가게는 배치도의 자리가 골목에 걸쳐 있어 바로 위 블록 모퉁이로 옮겨 세웠다. */
let _chochin = null; const CHOCHIN = () => _chochin || (_chochin = lathe([[0, -0.2], [0.07, -0.2], [0.13, -0.12], [0.15, 0], [0.13, 0.12], [0.07, 0.2], [0, 0.2]], 8));
// 줄에 매단 등
function hangLamp(B, x, yTop, z, drop, glows, lights, pow = 14, boxy = false) {
  B.geo(M.iron, cyl(0.008, 0.008, drop, 5), mat4(x, yTop - drop / 2, z));
  if (boxy) { B.geo(mat('glow', 0xffe9c0, { power: 1.0 }), box(0.5, 0.26, 0.26), mat4(x, yTop - drop - 0.13, z)); for (const s of [-1, 1]) { B.geo(M.beam, box(0.54, 0.03, 0.3), mat4(x, yTop - drop - 0.13 + s * 0.13, z)); B.geo(M.beam, box(0.03, 0.26, 0.3), mat4(x + s * 0.26, yTop - drop - 0.13, z)); } }
  else B.geo(mat('glow', 0xffe2a8, { power: 1.0 }), lathe([[0, 0], [0.2, 0.03], [0.26, 0.2], [0.14, 0.34], [0, 0.36]]), mat4(x, yTop - drop - 0.34, z));
  glows.push([x, yTop - drop - 0.15, z, 0.7]); if (lights) lights.push([x, yTop - drop - 0.4, z, pow, 14]);
}
// 가게의 뼈대: 기단·바닥·네 벽. cols = { s, n, e, w } (face()의 cols). ups를 주면 그 높이에 종이 바른 높은 창.
function shopShell(B, X0, Z0, X1, Z1, H, wallM, trim, floorM, cols, ups = [], paper = true) {
  const T = 0.25;
  B.box(M.stone, X0 - 0.15, 0, Z0 - 0.15, X1 + 0.15, 0.1, Z1 + 0.15, false); B.box(floorM, X0 + T, 0, Z0 + T, X1 - T, 0.2, Z1 - T);
  face(B, wallM, 'x', Z1 - T, Z1, X0, X1, 0, H, 1, cols.s || [], ups, trim, M.iron, paper); face(B, wallM, 'x', Z0, Z0 + T, X0, X1, 0, H, -1, cols.n || [], ups, trim, M.iron, paper);
  face(B, wallM, 'z', X0, X0 + T, Z0 + T, Z1 - T, 0, H, -1, cols.w || [], ups, trim, M.iron, paper); face(B, wallM, 'z', X1 - T, X1, Z0 + T, Z1 - T, 0, H, 1, cols.e || [], ups, trim, M.iron, paper);
  for (const [x, z] of [[X0, Z0], [X0, Z1], [X1, Z0], [X1, Z1]]) B.box(trim, x - 0.13, 0, z - 0.13, x + 0.13, H, z + 0.13, false);
  for (const y of [0.5, H - 0.1]) { B.box(trim, X0 - 0.05, y - 0.08, Z0 - 0.05, X1 + 0.05, y + 0.08, Z0, false); B.box(trim, X0 - 0.05, y - 0.08, Z1, X1 + 0.05, y + 0.08, Z1 + 0.05, false); B.box(trim, X0 - 0.05, y - 0.08, Z0, X0, y + 0.08, Z1, false); B.box(trim, X1, y - 0.08, Z0, X1 + 0.05, y + 0.08, Z1, false); }
}
// 칸막이 좌석: 등받이 높은 긴 의자 둘이 상을 사이에 두고 마주 본다(의자는 ±z, 길이는 x 방향). fire면 상 가운데 숯불 화로.
function boothAt(B, x, y, z, ry, seatM, fire, glows) {
  const p = part(B, x, y, z, ry);
  for (const s of [-1, 1]) { p(M.beam, box(1.5, 0.4, 0.5), 0, 0.2, s * 0.95); p(seatM, box(1.46, 0.09, 0.48), 0, 0.445, s * 0.95); p(M.beam, box(1.5, 1.2, 0.08), 0, 0.6, s * 1.24); p(seatM, box(1.4, 0.5, 0.05), 0, 0.82, s * 1.18); }
  p(M.beamLight, box(1.2, 0.05, 0.8), 0, 0.715, 0); p(M.beam, box(0.9, 0.69, 0.5), 0, 0.345, 0);
  if (fire) brazierAt(B, new THREE.Matrix4().multiplyMatrices(p.base, mat4(0, 0.74, 0)), glows, x, y + 0.8, z);
  const t = Math.abs(Math.sin(ry)) > 0.7, a = t ? 2.56 : 1.5, b = t ? 1.5 : 2.56;
  addCollider(x - a / 2, y, z - b / 2, x + a / 2, y + 1.2, z + b / 2);
  return p;
}
// 상에 박힌 숯불 화로: 쇠 테, 벌건 숯, 석쇠와 집게
function brazierAt(B, m, glows, gx, gy, gz) {
  const P = (mt, g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) => B.geo(mt, g, new THREE.Matrix4().multiplyMatrices(m, mat4(x, y, z, rx, ry, rz, s)));
  P(M.iron, cyl(0.19, 0.17, 0.05, 14), 0, 0.025); P(mat('glow', 0xff5a1e, { power: 1.3 }), cyl(0.15, 0.15, 0.012, 12), 0, 0.045);
  for (let k = -3; k <= 3; k++) P(M.iron, box(0.008, 0.008, 0.34 * Math.sqrt(1 - (k * 0.045 / 0.17) ** 2 * 0.9)), k * 0.045, 0.062);
  for (let k = 0; k < 3; k++) P(mat('plain', k ? 0x9a4a3a : 0x6a3a2a, { rough: 0.7 }), box(0.07, 0.012, 0.05), -0.06 + k * 0.06, 0.072, (k % 2 - 0.5) * 0.08, 0, k);
  P(mat('metal', 0xb4babd, { rough: 0.4 }), box(0.012, 0.008, 0.2), 0.3, 0.006, 0.12, 0, 0.5); P(mat('metal', 0xb4babd, { rough: 0.4 }), box(0.012, 0.008, 0.2), 0.32, 0.006, 0.12, 0, 0.62);
  if (glows) glows.push([gx, gy, gz, 0.3]);
}
const stoolAt = (B, x, y, z, m) => { B.geo(m, cyl(0.17, 0.17, 0.05, 12), mat4(x, y + 0.66, z)); B.geo(M.iron, cyl(0.025, 0.025, 0.64, 6), mat4(x, y + 0.32, z)); B.geo(M.iron, cyl(0.16, 0.18, 0.03, 12), mat4(x, y + 0.015, z)); B.geo(M.iron, new THREE.TorusGeometry(0.13, 0.01, 4, 12).rotateX(PI / 2), mat4(x, y + 0.25, z)); addCollider(x - 0.17, y, z - 0.17, x + 0.17, y + 0.68, z + 0.17); };
// 경단 꼬치: 삼색(분홍·흰·풀빛) 또는 한 빛깔
function dango(B, m, hexes = [0xf2a6b8, 0xf7f3ea, 0x9ac27a], s = 1) {
  B.geo(M.beamLight, cyl(0.004 * s, 0.004 * s, 0.2 * s, 4).rotateZ(PI / 2), new THREE.Matrix4().multiplyMatrices(m, mat4(0.02 * s, 0, 0)));
  hexes.forEach((hex, i) => B.geo(mat('plain', hex, { rough: 0.6 }), SPH, new THREE.Matrix4().multiplyMatrices(m, mat4((-0.045 + i * 0.04) * s, 0, 0, 0, 0, 0, 0.021 * s))));
}
// 가게 밖의 붉은 천 깐 긴 의자와 붉은 양산
function teaBench(B, x, z, ry, parasol) {
  benchAt(B, M.beam, x, 0, z, ry, 1.9);
  const p = part(B, x, 0, z, ry); p(mat('plain', 0xb3261a, { rough: 1, side: 'double' }), box(1.94, 0.02, 0.46), 0, 0.455, 0); p(mat('plain', 0xb3261a, { rough: 1, side: 'double' }), box(1.94, 0.3, 0.01), 0, 0.31, 0.225);
  if (parasol) { p(M.beam, cyl(0.025, 0.025, 2.5, 6), 1.25, 1.25, -0.2); p(mat('plain', 0xb3261a, { rough: 0.9, side: 'double' }), new THREE.ConeGeometry(1.35, 0.42, 16, 1, true), 1.25, 2.4, -0.2); for (let k = 0; k < 8; k++) p(M.beam, cyl(0.008, 0.008, 1.4, 4), 1.25 + Math.cos(k * PI / 4) * 0.64, 2.38, -0.2 + Math.sin(k * PI / 4) * 0.64, 0, -k * PI / 4, PI / 2 - 0.3); }
}
const menuStrip = (B, text, x, y, z, ry, bg = '#f4efe2') => { B.geo(textMat(text, { w: 64, h: 224, vertical: true, bg, color: '#1d1a16' }), new THREE.PlaneGeometry(0.2, 0.7), mat4(x, y, z, 0, ry, 0)); };

function shops(scene, out) {
  const take = res => { out.places.push(...res.places); out.jumps.push(...res.jumps); out.glows.push(...res.glows); out.lights.push(...res.lights); };
  const GREEN = mat('plain', 0x3f7a4a, { rough: 0.95 }), WOODSEAT = mat('plain', 0x7a4a2e, { rough: 0.9 }), CHINA = mat('plain', 0xf1ece0, { rough: 0.4 });
  const cup = (B, x, y, z) => B.geo(CHINA, cyl(0.035, 0.028, 0.055, 10), mat4(x, y + 0.0275, z));
  const plate = (B, x, y, z, r = 0.11) => B.geo(CHINA, cyl(r, r * 0.6, 0.02, 14), mat4(x, y + 0.01, z));

  /* ---------- 야키니쿠 큐 ---------- */
  {
    const at = { x: 21, z: 536, ry: -PI / 2 }, X0 = -8, X1 = 8, Z0 = -6, Z1 = 6, H = 3.6, F = 0.2, T = 0.25;
    LOTS.push({ x: at.x - 1.5, z: at.z, ry: at.ry, w: 18, d: 17 });
    const WALLM = mat('plaster', 0xe9dab0), TILE = mat('tile', 0xa4502f), TRIM = M.beam;
    take(put(scene, at, B => {
      const glows = [], lights = [], places = [];
      shopShell(B, X0, Z0, X1, Z1, H, WALLM, TRIM, M.floorDark, { s: [[-7, -2.4, 'w'], [-1, 1, 'd'], [2.4, 7, 'w']], w: [[0.4, 4.6, 'w']], e: [[0.4, 4.6, 'w']] });
      gableRoof(B, TILE, X0, Z0, X1, Z1, H, 2.2, { ridge: 'x', gable: WALLM, over: 0.9 });
      signBoard(B, '焼肉Q', 0, 3.05, Z1 + 0.1, 0, 3.4, 0.8, { both: false, bg: '#f1ead6', color: '#b3261a' });
      noren(B, 'x', Z1 + 0.22, -1, 1, 2.58, 0.75, '焼肉', { color: '#7a1f1c' });
      for (const s of [-1, 1]) { B.box(TRIM, s * 1.7 - 0.06, 0, Z1 + 0.3, s * 1.7 + 0.06, 2.5, Z1 + 0.42, false); beamBetween(B, TRIM, V(s * 1.7, 2.44, Z1 + 0.36), V(s * 1.7, 2.44, Z1 + 0.8), 0.05, 0.05); glows.push(lantern(B, s * 1.7, 2.1, Z1 + 0.76, { text: '肉', r: 0.2, h: 0.5 })); }
      B.box(M.stone, -1.4, 0, Z1, 1.4, 0.1, Z1 + 1.0, false);
      // 부엌과 계산대
      B.box(M.beam, X0 + T, F, -3.3, 4.1, F + 1.0, -2.75); B.box(M.beamLight, X0 + T, F + 1.0, -3.4, 4.2, F + 1.05, -2.65, false);
      { const p = part(B, 3.4, F + 1.05, -3.0, 0); p(M.iron, box(0.4, 0.26, 0.34), 0, 0.13, 0); p(mat('plain', 0xd8cfb4), box(0.3, 0.1, 0.02), 0, 0.2, 0.18, -0.3); for (let k = 0; k < 4; k++) plate(B, -6.5 + k * 0.5, F + 1.05, -3.0 + (k % 2) * 0.1, 0.13); }
      jarShelfAt(B, M.beam, -5.4, F, Z0 + T + 0.2, 0, 3.0, 2.2, 4, rngOf(1401)); tableAt(B, mat('metal', 0xb4babd, { rough: 0.5 }), -1.2, F, Z0 + T + 0.5, 0, 3.4, 0.8, 0.9);
      for (let k = 0; k < 5; k++) { B.geo(CHINA, box(0.5, 0.03, 0.34), mat4(-2.4 + k * 0.6, F + 0.915, Z0 + T + 0.5)); for (let i = 0; i < 6; i++) B.geo(mat('plain', i % 2 ? 0xb8443a : 0xc9605a, { rough: 0.6 }), box(0.14, 0.02, 0.09), mat4(-2.56 + k * 0.6 + (i % 3) * 0.16, F + 0.94, Z0 + T + 0.42 + Math.floor(i / 3) * 0.14, 0, 0.2 * i, 0)); }
      { const p = part(B, 3.0, F, Z0 + T + 0.5, 0); p(M.iron, box(1.3, 0.85, 0.8), 0, 0.425, 0); p(mat('glow', 0xff5a1e, { power: 0.8 }), box(1.0, 0.02, 0.5), 0, 0.86, 0); p(M.iron, cyl(0.26, 0.2, 0.3, 14), 0, 1.02, 0); solid(3.0, F, Z0 + T + 0.5, 0, 1.3, 0.8, 0.9); }
      // 칸막이 좌석 여섯: 초록 자리, 상 가운데 숯불 화로
      for (const s of [-1, 1]) for (const z of [-1.3, 1.5, 4.3]) boothAt(B, s * 6.95, F, z, 0, GREEN, true, glows);
      // 제10반의 자리(왼쪽 가운데): 쵸지가 쌓아 올린 빈 접시, 아스마의 재떨이
      { const x = -6.95, z = 1.5, y = F + 0.74; for (let k = 0; k < 9; k++) plate(B, x - 0.42, y + k * 0.021, z + 0.22, 0.1); for (let k = 0; k < 4; k++) cup(B, x - 0.4 + k * 0.26, y, z - 0.3); B.geo(M.iron, cyl(0.06, 0.05, 0.025, 10), mat4(x + 0.45, y + 0.0125, z + 0.28)); B.geo(CHINA, cyl(0.006, 0.006, 0.07, 4).rotateZ(PI / 2), mat4(x + 0.45, y + 0.03, z + 0.28, 0, 0.4, 0));
        plate(B, x + 0.4, y, z - 0.28, 0.12); for (let i = 0; i < 5; i++) { B.geo(mat('plain', 0xc9a28a, { rough: 0.6 }), box(0.07, 0.012, 0.05), mat4(x + 0.34 + (i % 3) * 0.06, y + 0.025, z - 0.3 + Math.floor(i / 3) * 0.06, 0, i, 0)); B.geo(mat('plain', 0x7aa650, { rough: 0.7 }), box(0.03, 0.008, 0.03), mat4(x + 0.34 + (i % 3) * 0.06, y + 0.035, z - 0.3 + Math.floor(i / 3) * 0.06, 0, i * 2, 0)); }   // 파를 얹은 소금 우설
        places.push({ n: '제10반의 자리', t: '아스마가 시카마루·이노·쵸지를 데리고 임무가 끝날 때마다 앉던 자리. 쵸지 앞에는 늘 빈 접시가 쌓였다.', b: [-7.75, -5.6, 0.2, 2.8], y: [0, 3] }); }
      // 가운데 바닥 자리: 다다미 단 위의 낮은 상 둘, 초록 방석
      B.box(M.beam, -2.5, F, -1.9, 2.5, F + 0.28, 1.7); B.box(M.tatami, -2.4, F + 0.28, -1.8, 2.4, F + 0.3, 1.6, false);
      for (const x of [-1.2, 1.2]) { const y = F + 0.3; B.geo(M.beamLight, box(1.1, 0.05, 0.8), mat4(x, y + 0.33, -0.1)); B.geo(M.beam, box(0.8, 0.3, 0.5), mat4(x, y + 0.15, -0.1)); brazierAt(B, mat4(x, y + 0.355, -0.1), glows, x, y + 0.45, -0.1); for (const [dx, dz] of [[0, -0.85], [0, 0.85]]) for (const sx of [-0.3, 0.3]) B.geo(GREEN, box(0.46, 0.07, 0.46), mat4(x + dx + sx, y + 0.035, -0.1 + dz, 0, sx, 0)); }
      // 벽에 붙은 차림표
      ['タン塩', 'カルビ', 'ロース', 'ハラミ', 'ホルモン', '野菜盛', 'ライス', 'ビール'].forEach((t, i) => menuStrip(B, t, -3.4 + i * 0.5, F + 2.6, Z0 + T + 0.02, 0));
      for (const s of [-1, 1]) ['上カルビ', '特上タン', '冷麺'].forEach((t, i) => menuStrip(B, t, s * (X1 - T - 0.02), F + 2.3, -2.2 + i * 0.5, s > 0 ? -PI / 2 : PI / 2, '#f1e2b8'));
      for (const [x, z] of [[-4.2, 3.2], [4.2, 3.2], [-4.2, -0.8], [4.2, -0.8], [0, -4.6]]) hangLamp(B, x, H + 0.6, z, 1.5, glows, lights, 14);
      places.unshift({ n: '야키니쿠 큐', t: '숯불에 고기를 구워 먹는 집. 파를 얹은 소금 우설이 이름났고, 아스마의 제10반이 늘 찾던 단골집이다.', b: [X0, X1, Z0, Z1 + 2], y: [0, 7] });
      return { places, glows, lights, jumps: [['야키니쿠 큐', 0, 0, Z1 + 5, 0, 93]] };
    }));
  }

  /* ---------- 경단 가게 ---------- */
  {
    const at = { x: 20.5, z: 660, ry: -PI / 2 }, X0 = -5.5, X1 = 5.5, Z0 = -4.5, Z1 = 4.5, H = 3.2, F = 0.2, T = 0.25;
    LOTS.push({ x: at.x - 1.5, z: at.z, ry: at.ry, w: 13, d: 14 });
    const WALLM = mat('plaster', 0xe8dcc0), TILE = mat('tile', 0x6f7a45), TRIM = M.beam, Rd = rngOf(1801);
    take(put(scene, at, B => {
      const glows = [], lights = [], places = [];
      shopShell(B, X0, Z0, X1, Z1, H, WALLM, TRIM, M.floor, { s: [[-4.6, -1.8, 'w'], [-1, 1, 'd'], [1.8, 4.6, 'w']], w: [[-1.2, 1.2, 'w']], e: [[-1.2, 1.2, 'w']] });
      gableRoof(B, TILE, X0, Z0, X1, Z1, H, 1.9, { ridge: 'x', gable: WALLM, over: 0.9 });
      // 간판: 흰 경단 셋을 꿴 꼬치에 붉은 "だんご"
      { const y = 3.55, z = Z1 + 1.0;
        B.geo(M.beamLight, cyl(0.05, 0.05, 4.6, 8).rotateZ(PI / 2), mat4(0.3, y, z));
        for (const s of [-1, 1]) beamBetween(B, TRIM, V(s * 2.1, y, Z1 + 0.1), V(s * 2.1, y, z), 0.07, 0.07);
        ['だ', 'ん', 'ご'].forEach((ch, i) => { const x = -1.25 + i * 1.25; B.geo(mat('plain', 0xf7f3ea, { rough: 0.6 }), SPH, mat4(x, y, z, 0, 0, 0, [0.58, 0.58, 0.5])); B.geo(textMat(ch, { w: 128, h: 128, bg: '#f7f3ea', color: '#b3261a' }), new THREE.CircleGeometry(0.4, 24), mat4(x, y, z + 0.47)); });
      }
      noren(B, 'x', Z1 + 0.22, -1, 1, 2.58, 0.7, '', { color: '#1f3a6e', n: 3 });
      B.box(M.stone, -1.4, 0, Z1, 1.4, 0.1, Z1 + 1.0, false);
      teaBench(B, -3.3, Z1 + 1.3, 0, false); teaBench(B, 3.3, Z1 + 1.3, 0, true);
      // 계산대와 경단 진열
      B.box(M.beam, X0 + T, F, -3.0, 2.6, F + 0.95, -2.45); B.box(M.beamLight, X0 + T, F + 0.95, -3.1, 2.7, F + 1.0, -2.35, false);
      for (let k = 0; k < 6; k++) { const x = -4.6 + k * 1.15; plate(B, x, F + 1.0, -2.72, 0.16); for (let i = 0; i < 4; i++) dango(B, mat4(x - 0.09 + i * 0.06, F + 1.045, -2.72, 0, PI / 2, 0), k % 3 === 1 ? [0xb5894a, 0xb5894a, 0xb5894a] : k % 3 === 2 ? [0x8ab06a, 0x8ab06a, 0x8ab06a] : undefined); }
      shelfAt(B, M.beam, -2.8, F, Z0 + T + 0.2, 0, 3.0, 2.0, 4, Rd); { const p = part(B, 1.4, F, Z0 + T + 0.55, 0); p(M.iron, box(0.9, 0.8, 0.7), 0, 0.4, 0); p(M.iron, lathe([[0, 0], [0.22, 0], [0.28, 0.16], [0.24, 0.34], [0.1, 0.4], [0, 0.4]]), 0, 0.8, 0); p(mat('glow', 0xff5a1e, { power: 0.6 }), box(0.5, 0.1, 0.02), 0, 0.3, 0.36); solid(1.4, F, Z0 + T + 0.55, 0, 0.9, 0.7, 0.85); }
      // 수수한 나무 상 넷
      const TB = [[-3.1, -0.4], [-3.1, 2.6], [3.1, -0.4], [3.1, 2.6]];
      for (const [x, z] of TB) { tableAt(B, M.beamLight, x, F, z, 0, 1.7, 0.75); for (const s of [-1, 1]) benchAt(B, M.beam, x, F, z + s * 0.72, 0, 1.6); }
      // 이타치와 키사메가 앉았던 자리: 벗어 둔 삿갓 둘, 찻잔과 경단 접시
      { const [x, z] = TB[3], y = F + 0.74; cup(B, x - 0.4, y, z - 0.15); cup(B, x + 0.35, y, z + 0.12); plate(B, x, y, z, 0.13); for (let i = 0; i < 3; i++) dango(B, mat4(x - 0.05 + i * 0.05, y + 0.04, z, 0, PI / 2 + 0.2, 0));
        B.geo(M.iron, lathe([[0, 0], [0.07, 0], [0.09, 0.07], [0.07, 0.13], [0.03, 0.15], [0, 0.15]], 10), mat4(x + 0.6, y, z - 0.2));
        for (const dx of [-0.45, 0.45]) { const hy = F + 0.445, hz = z + 0.72; B.geo(mat('plain', 0xd8c48a, { rough: 0.9, side: 'double' }), new THREE.ConeGeometry(0.34, 0.2, 18, 1, true), mat4(x + dx, hy + 0.1, hz)); B.geo(mat('plain', 0xb3261a), SPH, mat4(x + dx, hy + 0.2, hz, 0, 0, 0, 0.02)); for (let k = 0; k < 10; k++) B.geo(mat('plain', 0xf7f3ea, { rough: 1, side: 'double' }), box(0.05, 0.16, 0.003), mat4(x + dx + Math.cos(k * 0.628) * 0.33, hy + 0.0, hz + Math.sin(k * 0.628) * 0.33, 0, -k * 0.628 + PI / 2, 0)); }
        places.push({ n: '창가의 구석 자리', t: '나루토를 노리고 마을에 숨어든 이타치와 키사메가 삿갓을 벗어 놓고 차를 마시던 자리. 카카시가 가게 앞에 서자 둘은 자취를 감췄다.', b: [1.8, 5.3, 1.4, 4.3], y: [0, 3] }); }
      // 안코의 자리: 다 먹은 꼬치가 수북한 접시
      { const [x, z] = TB[0], y = F + 0.74; plate(B, x, y, z, 0.15); for (let i = 0; i < 14; i++) B.geo(M.beamLight, cyl(0.004, 0.004, 0.2, 4).rotateZ(PI / 2), mat4(x + (Rd() - 0.5) * 0.08, y + 0.025 + i * 0.004, z + (Rd() - 0.5) * 0.08, 0, Rd() * 3, 0)); cup(B, x + 0.4, y, z - 0.1); plate(B, x - 0.45, y, z + 0.05, 0.11); for (let i = 0; i < 2; i++) dango(B, mat4(x - 0.47 + i * 0.05, y + 0.04, z + 0.05, 0, PI / 2, 0));
        places.push({ n: '안코의 자리', t: '마을에서 단것을 가장 좋아하는 미타라시 안코가 꼬치를 수북이 쌓아 놓고 가는 자리.', b: [-5.3, -1.8, -1.5, 0.8], y: [0, 3] }); }
      // 벽마다 걸린 차림표와 네모난 등
      ['みたらし', '三色', '草だんご', 'あんみつ', 'ぜんざい', 'お茶'].forEach((t, i) => { const s = i % 2 ? 1 : -1, z = -1.9 + Math.floor(i / 2) * 0.45 + (Math.floor(i / 2) > 0 ? 3.2 : 0); B.geo(M.beamLight, box(0.26, 0.76, 0.02), mat4(s * (X1 - T - 0.02), F + 2.3, z, 0, s > 0 ? -PI / 2 : PI / 2, 0)); menuStrip(B, t, s * (X1 - T - 0.035), F + 2.3, z, s > 0 ? -PI / 2 : PI / 2, '#e9d6a8'); });
      for (const [x, z] of [[-3.1, 1.1], [3.1, 1.1], [0, -1], [0, 2.6]]) hangLamp(B, x, H + 0.4, z, 1.3, glows, lights, 13, true);
      places.unshift({ n: '경단 가게', t: '경단으로 이름난 찻집. 간판은 흰 경단 셋을 꿴 꼬치에 붉은 글씨로 "だんご".', b: [X0, X1, Z0, Z1 + 2.5], y: [0, 6] });
      return { places, glows, lights, jumps: [['경단 가게', 0, 0, Z1 + 5, 0, 94]] };
    }));
  }

  /* ---------- 아마구리아마 ---------- */
  {
    const at = { x: -28.5, z: 619, ry: PI / 2 }, X0 = -5, X1 = 5, Z0 = -3.5, Z1 = 3.5, H = 3.0, F = 0.2, T = 0.25;
    LOTS.push({ x: at.x + 1.5, z: at.z, ry: at.ry, w: 12, d: 12 });
    const WALLM = mat('plaster', 0xf1eadb), TILE = mat('tile', 0x8a5a2e), TRIM = M.beam, Ra = rngOf(1901), CHEST = mat('plain', 0x5a3320, { rough: 0.5 });
    take(put(scene, at, B => {
      const glows = [], lights = [], places = [];
      B.box(M.stone, X0 - 0.15, 0, Z0 - 0.15, X1 + 0.15, 0.1, Z1 + 0.15, false); B.box(M.floor, X0 + T, 0, Z0 + T, X1 - T, F, Z1 - T);
      // 앞벽: 손님이 밖에서 사 가는 넓은 판매 창과 옆문
      wall(B, WALLM, 'x', Z1 - T, Z1, X0, X1, 0, H, [{ u0: -4.2, u1: 1.4, ys: [[1.1, 2.5]] }, { u0: 2.4, u1: 3.6, ys: [[F, 2.5]] }], true, true);
      doorUnit(B, 'x', Z1 - T, Z1, 2.4, 3.6, F, 2.5, { frame: TRIM, leaf: null });
      for (const u of [-4.2, 1.4]) B.box(TRIM, u - 0.06, 1.1, Z1 - T - 0.03, u + 0.06, 2.5, Z1 + 0.03, false); B.box(TRIM, -4.26, 2.5, Z1 - T - 0.03, 1.46, 2.6, Z1 + 0.03, false);
      B.box(M.beamLight, -4.4, 1.04, Z1 - 0.6, 1.6, 1.1, Z1 + 0.55, false); for (const u of [-4.1, -1.4, 1.3]) beamBetween(B, TRIM, V(u, 0.55, Z1 + 0.02), V(u, 1.02, Z1 + 0.45), 0.06, 0.07);
      face(B, WALLM, 'x', Z0, Z0 + T, X0, X1, 0, H, -1, [], [], TRIM, M.iron); face(B, WALLM, 'z', X0, X0 + T, Z0 + T, Z1 - T, 0, H, -1, [[-0.9, 0.9, 'w']], [], TRIM, M.iron); face(B, WALLM, 'z', X1 - T, X1, Z0 + T, Z1 - T, 0, H, 1, [[-0.9, 0.9, 'w']], [], TRIM, M.iron);
      for (const [x, z] of [[X0, Z0], [X0, Z1], [X1, Z0], [X1, Z1]]) B.box(TRIM, x - 0.13, 0, z - 0.13, x + 0.13, H, z + 0.13, false);
      hipRoof(B, TILE, X0, Z0, X1, Z1, H, 1.8, { over: 1.1 });
      signBoard(B, '甘栗甘', 0, 3.4, Z1 + 0.3, 0, 2.6, 0.7, { both: false, bg: '#5a3320', color: '#f1e2b8' }); for (const s of [-1, 1]) B.box(TRIM, s * 1.1 - 0.04, 2.8, Z1 + 0.24, s * 1.1 + 0.04, 3.06, Z1 + 0.32, false);
      noren(B, 'x', Z1 + 0.08, -4.1, 1.3, 2.5, 0.45, '甘栗甘甘栗', { color: '#7a1f1c', n: 5 });
      B.box(M.stone, 2.0, 0, Z1, 4.0, 0.1, Z1 + 0.9, false);
      // 판매 창의 과자: 군밤 더미, 밤 양갱, 만주와 콩떡, 경단
      { const y = 1.1, z = Z1 + 0.15;
        B.geo(M.beamLight, lathe([[0, 0], [0.2, 0], [0.3, 0.12], [0.28, 0.12], [0.18, 0.02], [0, 0.02]], 14), mat4(-3.6, y, z)); for (let k = 0; k < 26; k++) { const a = Ra() * 6.28, r = Ra() * 0.2; B.geo(CHEST, SPH, mat4(-3.6 + Math.cos(a) * r, y + 0.05 + (0.2 - r) * 0.5 * Ra() + 0.02, z + Math.sin(a) * r, 0, a, 0, [0.035, 0.03, 0.035])); }
        for (let k = 0; k < 2; k++) { B.geo(M.beam, box(0.44, 0.04, 0.3), mat4(-2.7 + k * 0.56, y + 0.02, z)); for (let i = 0; i < 6; i++) B.geo(mat('plain', k ? 0x6a3a22 : 0xc9a24a, { rough: 0.4 }), box(0.1, 0.05, 0.1), mat4(-2.84 + k * 0.56 + (i % 3) * 0.14, y + 0.065, z - 0.07 + Math.floor(i / 3) * 0.14)); }
        for (let k = 0; k < 2; k++) { plate(B, -1.5 + k * 0.5, y, z, 0.18); for (let i = 0; i < 6; i++) B.geo(mat('plain', k ? 0xf7f3ea : 0xc98a5e, { rough: 0.7 }), SPH, mat4(-1.5 + k * 0.5 + Math.cos(i * 1.047) * 0.09, y + 0.045, z + Math.sin(i * 1.047) * 0.09, 0, 0, 0, [0.045, 0.032, 0.045])); }
        plate(B, -0.4, y, z, 0.18); for (let i = 0; i < 5; i++) dango(B, mat4(-0.5 + i * 0.05, y + 0.04, z, 0, PI / 2, 0));
        // 다른 나라의 과자 셋
        [['砂だんご', 0xd8c08a], ['キリンネクター', 0xe9c765], ['岩おこし', 0x8a8478]].forEach(([name, hex], i) => { const x = 0.15 + i * 0.42; B.geo(mat('plain', hex, { rough: 0.7 }), i === 1 ? cyl(0.05, 0.05, 0.2, 10) : box(0.2, 0.1, 0.16), mat4(x, y + (i === 1 ? 0.1 : 0.05), z)); B.geo(textMat(name, { w: 128, h: 48, bg: '#f4efe2', color: '#1d1a16' }), new THREE.PlaneGeometry(0.34, 0.11), mat4(x, y + 0.06, z + 0.3, -0.5, 0, 0)); });
      }
      // 가게 안: 밤 볶는 솥, 밤 자루, 과자 병 선반
      { const p = part(B, -2.6, F, -1.4, 0); p(M.iron, cyl(0.42, 0.36, 0.6, 14), 0, 0.3, 0); p(mat('glow', 0xff5a1e, { power: 0.8 }), box(0.3, 0.14, 0.02), 0, 0.2, 0.4); p(M.iron, new THREE.SphereGeometry(0.55, 16, 8, 0, PI * 2, PI / 2, PI / 2), 0, 0.95, 0, 0, 0, 0, [1, 0.6, 1]); p(mat('plain', 0x2a2420, { rough: 1 }), cyl(0.5, 0.5, 0.02, 16), 0, 0.9, 0);
        for (let k = 0; k < 30; k++) { const a = Ra() * 6.28, r = Ra() * 0.44; p(CHEST, SPH, Math.cos(a) * r, 0.93, Math.sin(a) * r, 0, a, 0, [0.035, 0.03, 0.035]); } p(M.beamLight, cyl(0.015, 0.015, 0.9, 5), 0.3, 1.1, 0.1, 0, 0, 0.9); addCollider(-3.15, F, -1.95, -2.05, F + 1.0, -0.85); glows.push([-2.6, F + 0.3, -1.0, 0.4]); }
      for (let k = 0; k < 3; k++) { const x = -4.2 + k * 0.6, z = 0.6 + (k % 2) * 0.5; B.geo(mat('plain', 0xb89a6a, { rough: 1 }), lathe([[0, 0], [0.24, 0.02], [0.3, 0.3], [0.26, 0.55], [0.14, 0.62], [0.16, 0.7], [0, 0.66]], 10), mat4(x, F, z)); for (let i = 0; i < 6; i++) B.geo(CHEST, SPH, mat4(x + Math.cos(i) * 0.07, F + 0.66, z + Math.sin(i) * 0.07, 0, 0, 0, [0.035, 0.03, 0.035])); }
      addCollider(-4.5, F, 0.3, -2.7, F + 0.7, 1.4);
      for (const x of [-2.6, 0.8]) jarShelfAt(B, M.beam, x, F, Z0 + T + 0.2, 0, 3.0, 2.1, 4, Ra);
      tableAt(B, M.beamLight, 3.4, F, -1.6, 0, 1.6, 0.8); for (let k = 0; k < 4; k++) B.geo(M.beamLight, box(0.3, 0.08, 0.22), mat4(3.0 + (k % 2) * 0.5, F + 0.78 + Math.floor(k / 2) * 0.08, -1.6, 0, k * 0.1, 0));
      hangLamp(B, -1.5, H - 0.02, 0.6, 0.5, glows, lights, 14); hangLamp(B, 2.6, H - 0.02, 0.6, 0.5, glows, lights, 12);
      // 밖에서 먹는 자리
      teaBench(B, -3.0, Z1 + 3.2, 0, true); teaBench(B, 1.0, Z1 + 3.2, 0, false); teaBench(B, -1.0, Z1 + 5.0, 0, false);
      places.push({ n: '아마구리아마', t: '군밤과 밤 과자로 이름난 단것 가게. 아스마가 제10반을 중닌 시험에 올리기 전에 여기서 한턱냈다. 판매 창 끝에는 다른 나라에서 온 과자도 놓여 있다.', b: [X0, X1, Z0, Z1 + 6], y: [0, 6] });
      return { places, glows, lights, jumps: [['아마구리아마', -1.4, 0, Z1 + 7.5, 0, 95]] };
    }));
  }

  /* ---------- 슈슈야 ---------- */
  {
    const at = { x: 275, z: 469, ry: PI }, X0 = -8.5, X1 = 8.5, Z0 = -6.5, Z1 = 6.5, H = 4.8, F = 0.2, T = 0.25;
    LOTS.push({ x: at.x, z: at.z - 1.5, ry: at.ry, w: 19, d: 17 });
    const WALLM = mat('plaster', 0xe6d2a8), TILE = mat('tile', 0x2f6a4a), REDW = mat('wood', 0xa82a20), Rs = rngOf(1601), GOLD = '#e9c765';
    take(put(scene, at, B => {
      const glows = [], lights = [], places = [];
      const WIN = [[-7, -4.8, 'w'], [-3.6, -1.8, 'w'], [-1.1, 1.1, 'd'], [1.8, 3.6, 'w'], [4.8, 7, 'w']];
      shopShell(B, X0, Z0, X1, Z1, H, WALLM, REDW, M.floorDark, { s: WIN, w: [[-3, -1, 'w'], [1.4, 3.4, 'w']], e: [[-3, -1, 'w'], [1.4, 3.4, 'w']] }, [2.0]);
      hipRoof(B, TILE, X0, Z0, X1, Z1, H, 2.6, { over: 1.3 });
      // 붉은 기둥과 현판, 처마 밑의 붉은 등
      for (const x of [-8.3, -4.2, -1.45, 1.45, 4.2, 8.3]) { B.geo(REDW, cyl(0.2, 0.2, H, 14), mat4(x, H / 2, Z1 + 0.28)); B.geo(M.stone, cyl(0.28, 0.32, 0.25, 14), mat4(x, 0.125, Z1 + 0.28)); B.geo(mat('plain', 0xc9a24a, { rough: 0.5 }), cyl(0.23, 0.23, 0.12, 14), mat4(x, H - 0.3, Z1 + 0.28)); addCollider(x - 0.2, 0, Z1 + 0.08, x + 0.2, H, Z1 + 0.48); }
      signBoard(B, '酒酒屋', 0, 3.25, Z1 + 0.12, 0, 2.8, 0.8, { both: false, bg: '#8a1c16', color: GOLD, frame: mat('plain', 0xc9a24a, { rough: 0.5 }) });
      for (const x of [-6.2, -2.9, 2.9, 6.2]) { B.geo(M.iron, cyl(0.008, 0.008, 0.5, 4), mat4(x, H - 0.45, Z1 + 0.9)); glows.push(lantern(B, x, H - 1.0, Z1 + 0.9, { text: '酒', r: 0.24, h: 0.6 })); }
      B.box(M.stone, -1.6, 0, Z1, 1.6, 0.1, Z1 + 1.2, false);
      // 높은 천장과 작은 등 여럿, 천장을 받친 붉은 기둥 넷
      B.box(M.floorDark, X0 + T, H - 0.12, Z0 + T, X1 - T, H - 0.04, Z1 - T, false);
      for (const x of [-3.6, 3.6]) for (const z of [-1.2, 3.2]) { B.geo(REDW, cyl(0.2, 0.2, H - F - 0.1, 14), mat4(x, F + (H - F - 0.1) / 2, z)); B.geo(mat('plain', 0xc9a24a, { rough: 0.5 }), cyl(0.24, 0.24, 0.14, 14), mat4(x, H - 0.3, z)); B.geo(M.stone, cyl(0.26, 0.3, 0.2, 14), mat4(x, F + 0.1, z)); addCollider(x - 0.2, F, z - 0.2, x + 0.2, H, z + 0.2); }
      for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) { const x = -6.4 + i * 3.2, z = -4.8 + j * 3.2; B.geo(M.iron, cyl(0.006, 0.006, 0.5, 4), mat4(x, H - 0.37, z)); B.geo(mat('glow', 0xffd9a0, { power: 1.2 }), SPH, mat4(x, H - 0.68, z, 0, 0, 0, 0.07)); if ((i + j) % 2 === 0) glows.push([x, H - 0.68, z, 0.4]); if (i % 2 === 0 && j % 2 === 1) lights.push([x, H - 1.0, z, 15, 16]); }
      // 바: 술병을 늘어놓은 선반과 걸상 일곱
      B.box(REDW, -6.2, F, -4.5, 6.2, F + 1.08, -3.85); B.box(M.beam, -6.3, F + 1.08, -4.6, 6.3, F + 1.14, -3.7, false); B.box(M.iron, -6.2, F + 0.22, -3.86, 6.2, F + 0.26, -3.72, false);
      for (let k = 0; k < 7; k++) stoolAt(B, -5.1 + k * 1.7, F, -3.2, REDW);
      for (const x of [-4.4, 0, 4.4]) jarShelfAt(B, M.beam, x, F, Z0 + T + 0.2, 0, 4.0, 2.9, 5, Rs);
      for (let k = 0; k < 3; k++) { const x = 7.2, y = F + (k === 2 ? 0.62 : 0), z = -5.4 + (k === 2 ? 0.35 : k * 0.72); B.geo(mat('plain', 0xe9dfc4, { rough: 0.9 }), lathe([[0, 0], [0.3, 0], [0.34, 0.3], [0.3, 0.62], [0, 0.62]], 14), mat4(x, y, z)); B.geo(textMat('酒', { w: 64, h: 64, bg: '#e9dfc4', color: '#8a1c16' }), new THREE.PlaneGeometry(0.34, 0.34), mat4(x - 0.345, y + 0.32, z, 0, -PI / 2, 0)); for (const yy of [0.1, 0.52]) B.geo(mat('plain', 0xb89a6a), new THREE.TorusGeometry(0.33, 0.015, 4, 14).rotateX(PI / 2), mat4(x, y + yy, z)); }
      addCollider(6.85, F, -5.75, 7.55, F + 1.25, -4.35);
      // 숯불 닭꼬치 화로(바 안쪽 끝)
      { const p = part(B, -7.2, F, -5.2, 0); p(M.iron, box(1.2, 0.85, 0.6), 0, 0.425, 0); p(mat('glow', 0xff5a1e, { power: 1.0 }), box(1.0, 0.02, 0.3), 0, 0.86, 0); for (let k = 0; k < 7; k++) { p(M.beamLight, cyl(0.004, 0.004, 0.44, 4).rotateX(PI / 2), -0.42 + k * 0.14, 0.89, 0); for (let i = 0; i < 3; i++) p(mat('plain', i % 2 ? 0x9a5a2e : 0xc98a4a, { rough: 0.6 }), SPH, -0.42 + k * 0.14, 0.895, -0.09 + i * 0.09, 0, 0, 0, [0.03, 0.022, 0.035]); } solid(-7.2, F, -5.2, 0, 1.2, 0.6, 0.9); glows.push([-7.2, F + 0.95, -5.2, 0.5]); }
      // 지라이야와 츠나데가 앉았던 자리: 술병 하나에 잔 둘
      { const y = F + 1.14, z = -4.0; B.geo(CHINA, lathe([[0, 0], [0.05, 0], [0.06, 0.08], [0.03, 0.15], [0.025, 0.19], [0.035, 0.2], [0, 0.2]], 10), mat4(0.85, y, z)); for (const dx of [-0.3, 0.25]) B.geo(CHINA, cyl(0.03, 0.02, 0.03, 10), mat4(0.85 + dx, y + 0.015, z + 0.08)); plate(B, 0.2, y, z, 0.1);
        places.push({ n: '바 한가운데 자리', t: '아메가쿠레로 숨어들기 전날 밤, 지라이야가 츠나데와 나란히 앉아 술잔을 기울이던 자리. "돌아오면 내기에서 진 셈 치지."', b: [-1.6, 2.4, -3.8, -2.4], y: [0, 3] }); }
      // 나무 칸막이 좌석 여섯
      for (const s of [-1, 1]) for (const z of [-1.5, 1.3, 4.1]) boothAt(B, s * 7.45, F, z, 0, WOODSEAT, false, null);
      // 가운데 둥근 상: 큰 접시 요리
      { const x = 0, z = 1.4, y = F; B.geo(M.beam, cyl(1.15, 1.15, 0.06, 28), mat4(x, y + 0.74, z)); B.geo(M.beam, cyl(0.14, 0.4, 0.71, 12), mat4(x, y + 0.355, z)); B.geo(REDW, cyl(0.62, 0.62, 0.03, 24), mat4(x, y + 0.785, z)); B.geo(CHINA, cyl(0.5, 0.36, 0.035, 24), mat4(x, y + 0.817, z));
        for (let k = 0; k < 16; k++) { const a = k * 0.4, r = 0.1 + (k % 4) * 0.09; B.geo(mat('plain', [0xc98a4a, 0x7aa650, 0xb8443a, 0xe9c765][k % 4], { rough: 0.6 }), SPH, mat4(x + Math.cos(a) * r, y + 0.86, z + Math.sin(a) * r, 0, a, 0, [0.06, 0.03, 0.045])); }
        for (let k = 0; k < 6; k++) { const a = k * PI / 3; plate(B, x + Math.cos(a) * 0.9, y + 0.77, z + Math.sin(a) * 0.9, 0.09); chairAt(B, M.beam, x + Math.cos(a) * 1.75, y, z + Math.sin(a) * 1.75, Math.atan2(-Math.cos(a), -Math.sin(a))); }
        addCollider(x - 1.0, y, z - 1.0, x + 1.0, y + 0.8, z + 1.0); }
      places.unshift({ n: '슈슈야', t: '중국풍 술집. 큰 접시에 한꺼번에 담아 내는 요리와 숯불 닭꼬치, 가게에서 빚은 술이 이름났다.', b: [X0, X1, Z0, Z1 + 2], y: [0, 8] });
      return { places, glows, lights, jumps: [['슈슈야', 0, 0, Z1 + 6, 0, 96]] };
    }));
  }
}
/* ============================ 텐텐 · 리 · 사이의 집 ============================
   원작(나루토 위키)에 적힌 것
   - 텐텐: 전쟁 뒤 무기 가게 "忍具転転転"을 열어 모아 온 닌자 도구를 늘어놓고 판다(육도선인의 보물 가운데 셋도 있다). 평화로워져 손님이 드물다.
     취미는 점치기, 좋아하는 것은 깨 경단과 중국 음식, 좋아하는 말은 "百発百中".
   - 리: 취미는 가이 선생과 하는 체술 수련, 좋아하는 것은 카레라이스, 좋아하는 말은 "努力" "根性" "愛".
   - 사이: 그림으로 싸우는 닌자. 형처럼 따르던 신과 자신을 양 끝에 그린 그림책을 끝내 완성하지 못하고 간직했다. 사람 사귀는 법을 책으로 배운다.
   세 사람의 집은 원작에 생김새가 나오지 않아, 건물과 방 꾸밈은 모두 위의 설정에서 지어낸 것이다.
   텐텐의 가게에 둔 보물 셋(파초선·홍표주박·호박 정병)은 어느 셋인지 확인하지 못하고 고른 것이다. */
function homes3(scene, out) {
  const take = res => { out.places.push(...res.places); out.jumps.push(...res.jumps); out.glows.push(...res.glows); out.lights.push(...res.lights); };
  const STEELM = mat('metal', 0xb4babd, { rough: 0.45 }), DARKI = mat('metal', 0x4a4d52, { rough: 0.5 }), CHINA = mat('plain', 0xf1ece0, { rough: 0.4 });
  const scroll = (B, text, x, y, z, ry, w = 0.5, h = 1.2) => signBoard(B, text, x, y, z, ry, w, h, { vertical: true, both: false, bg: '#efe8d8' });
  // 나무 침대(머리맡이 -z)
  const woodBed = (B, x, y, z, ry, quilt) => { const p = part(B, x, y, z, ry); p(M.beam, box(1.0, 0.3, 2.05), 0, 0.2, 0); p(M.beam, box(1.0, 0.75, 0.06), 0, 0.42, -1.0); p(mat('plain', 0xf4f1ea, { rough: 1 }), box(0.94, 0.12, 1.98), 0, 0.41, 0); p(mat('plain', 0xf4f1ea, { rough: 1 }), box(0.5, 0.1, 0.3), 0, 0.52, -0.75); p(quilt, box(0.98, 0.08, 1.3), 0, 0.5, 0.3); solid(x, y, z, ry, 1.0, 2.05, 0.55); };
  // 사진 액자: 사람을 빛깔 덩어리로 그린다
  const photo = (B, key, people, x, y, z, ry, w = 0.5) => { B.geo(M.beam, box(w + 0.06, w * 0.75 + 0.06, 0.02), mat4(x, y, z, 0, ry, 0)); B.geo(textMat(' ', { w: 256, h: 192, bg: '#9fd0ea', color: '#9fd0ea', key, draw: (g, W, H) => { g.fillStyle = '#7ab86a'; g.fillRect(0, H * 0.7, W, H * 0.3); people.forEach(([hair, cloth, tall], i) => { const cx = W * (i + 0.7) / (people.length + 0.4), top = H * (0.72 - 0.42 * tall); g.fillStyle = cloth; g.fillRect(cx - 20, top + 26, 40, H * 0.72 - top - 4); g.fillStyle = '#f1cfa8'; g.beginPath(); g.arc(cx, top + 14, 16, 0, PI * 2); g.fill(); g.fillStyle = hair; g.beginPath(); g.arc(cx, top + 9, 17, PI, 0); g.fill(); }); } }), new THREE.PlaneGeometry(w, w * 0.75), mat4(x + Math.sin(ry) * 0.012, y, z + Math.cos(ry) * 0.012, 0, ry, 0)); };

  /* ---------- 텐텐의 집: 아래층은 무기 가게 "忍具転転転", 위층이 살림방 ---------- */
  {
    const at = { x: -30, z: 776, ry: PI / 2 }, X0 = -6, X1 = 6, Z0 = -4.5, Z1 = 4.5, F = 0.2, F2 = 3.4, H = 6.6, T = 0.25;
    LOTS.push({ x: at.x + 1.5, z: at.z, ry: at.ry, w: 14, d: 14 });
    const WALLM = mat('plaster', 0xe9dcc0), TILE = mat('tile', 0x8a3a30), TRIM = M.beam, Rt = rngOf(2501);
    // 무기 도형
    const kunai = mergeGeos([[new THREE.ConeGeometry(0.035, 0.16, 4).scale(1, 1, 0.3), mat4(0, 0.1, 0)], [new THREE.ConeGeometry(0.035, 0.05, 4).scale(1, 1, 0.3), mat4(0, -0.005, 0, PI, 0, 0)], [cyl(0.009, 0.009, 0.1, 5), mat4(0, -0.08, 0)], [new THREE.TorusGeometry(0.02, 0.005, 4, 10), mat4(0, -0.15, 0)]]);
    const star = (() => { const s = new THREE.Shape(); for (let i = 0; i < 8; i++) { const a = i * PI / 4, r = i % 2 ? 0.035 : 0.11; i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(r, 0); } const hole = new THREE.Path(); hole.absarc(0, 0, 0.014, 0, PI * 2, true); s.holes.push(hole); return new THREE.ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: false }); })();
    const sword = (B, m, len = 0.8) => { const P = (mt, g, x, y, z, s) => B.geo(mt, g, new THREE.Matrix4().multiplyMatrices(m, mat4(x, y, z, 0, 0, 0, s))); P(STEELM, box(len, 0.03, 0.006), len / 2, 0, 0, 1); P(mat('plain', 0xc9a24a, { rough: 0.5 }), box(0.012, 0.07, 0.05), 0, 0, 0, 1); P(mat('plain', 0x2a2a30, { rough: 0.9 }), box(0.24, 0.028, 0.022), -0.12, 0, 0, 1); };
    take(put(scene, at, B => {
      const glows = [], lights = [], places = [];
      shopShell(B, X0, Z0, X1, Z1, H, WALLM, TRIM, M.floorDark, { s: [[-5, -2.6, 'w'], [-1, 1, 'd'], [2.6, 5, 'w']], w: [[0.4, 2.6, 'w']], e: [[0.4, 2.6, 'w']] }, [F2 - 0.2], false);
      gableRoof(B, TILE, X0, Z0, X1, Z1, H, 2.0, { ridge: 'x', gable: WALLM, over: 0.8 });
      B.box(TRIM, X0 - 0.05, F2 - 0.3, Z1, X1 + 0.05, F2 - 0.1, Z1 + 0.05, false);
      signBoard(B, '忍具転転転', 0, 3.05, Z1 + 0.1, 0, 3.6, 0.7, { both: false, bg: '#2a2a30', color: '#e9c765' });
      B.geo(STEELM, star, mat4(-2.6, 3.05, Z1 + 0.14, 0, 0, 0.3, 3.4)); B.geo(STEELM, star, mat4(2.6, 3.05, Z1 + 0.14, 0, 0, 0.7, 3.4));
      noren(B, 'x', Z1 + 0.22, -1, 1, 2.58, 0.6, '忍具', { color: '#2a2a30', ink: '#e9c765' });
      B.box(M.stone, -1.4, 0, Z1, 1.4, 0.1, Z1 + 1.0, false);
      for (const s of [-1, 1]) { const x = s * 3.8, z = Z1 + 0.6; B.geo(mat('wood', 0x8a6238), lathe([[0, 0], [0.3, 0], [0.36, 0.4], [0.3, 0.8], [0.27, 0.8], [0.3, 0.42], [0, 0.05]], 12), mat4(x, 0, z)); for (let k = 0; k < 5; k++) { const a = k * 1.3, dx = Math.cos(a) * 0.12, dz = Math.sin(a) * 0.12; beamBetween(B, k % 2 ? M.beamLight : M.beam, V(x + dx * 0.4, 0.1, z + dz * 0.4), V(x + dx * 2.2, 2.0 + (k % 3) * 0.15, z + dz * 2.2), 0.03, 0.03); if (k % 2) B.geo(STEELM, new THREE.ConeGeometry(0.035, 0.24, 4).scale(1, 1, 0.3), mat4(x + dx * 2.3, 2.12 + (k % 3) * 0.15, z + dz * 2.3)); } addCollider(x - 0.35, 0, z - 0.35, x + 0.35, 0.8, z + 0.35); }
      // 2층 바닥(계단 구멍을 비운다), 계단, 난간
      B.box(M.floor, X0 + T, F2 - 0.2, -3.05, X1 - T, F2, Z1 - T); B.box(M.floor, X0 + T, F2 - 0.2, Z0 + T, -0.1, F2, -3.05); B.box(M.floor, 4.4, F2 - 0.2, Z0 + T, X1 - T, F2, -3.05);
      stairs(B, M.floorDark, 'x', 4.4, -1, F, F2, Z0 + T, -3.05, 0.3);
      railing(B, TRIM, [[-0.15, Z0 + T], [-0.15, -3.0], [4.35, -3.0]], F2, 1.0, { gap: 0.24 });
      /* 가게 */
      // 계산대(가게 주인이 졸던 자리)와 뒤의 큰 두루마리
      B.box(M.beam, -5.4, F, -1.6, -2.2, F + 1.0, -1.0); B.box(M.beamLight, -5.5, F + 1.0, -1.7, -2.1, F + 1.05, -0.9, false); chairAt(B, M.beam, -3.8, F, -2.2, 0);
      B.geo(mat('plain', 0xeee8d8, { rough: 1 }), box(0.32, 0.02, 0.44), mat4(-4.4, F + 1.06, -1.3, 0, 0.15, 0)); B.geo(DARKI, box(0.34, 0.2, 0.3), mat4(-2.8, F + 1.15, -1.3));
      signBoard(B, '大安売', -3.8, F + 1.3, -0.98, 0, 0.9, 0.28, { both: false, bg: '#b3261a', color: '#f4efe2' });
      for (let k = 0; k < 3; k++) { const x = -5.0 + k * 0.85; B.geo(mat('plain', [0x3f6a4a, 0x8a3a30, 0x3d5a80][k], { rough: 0.9 }), cyl(0.3, 0.3, 1.5, 16), mat4(x, F + 0.75, -3.75)); for (const yy of [0.0, 1.5]) B.geo(M.beam, cyl(0.33, 0.33, 0.06, 16), mat4(x, F + yy + (yy ? -0.03 : 0.03), -3.75)); B.geo(textMat(['口寄', '封', '武'][k], { w: 64, h: 64, bg: '#efe8d8', color: '#1d1a16' }), new THREE.PlaneGeometry(0.3, 0.3), mat4(x, F + 0.8, -3.44)); }
      addCollider(-5.4, F, -4.1, -2.8, F + 1.5, -3.4);
      // 서쪽 벽: 쿠나이와 수리검 판
      for (const [z, kind] of [[-2.9, 'k'], [-1.9, 's'], [3.4, 'k']]) { const p = part(B, X0 + T + 0.03, F, z, PI / 2); p(M.beamLight, box(0.9, 1.3, 0.04), 0, 1.6, 0); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { if (kind === 'k') p(DARKI, kunai, -0.3 + c * 0.2, 2.02 - r * 0.3, 0.035, 0, 0, PI); else p(STEELM, star, -0.3 + c * 0.2, 2.02 - r * 0.3, 0.025, 0, 0, (r + c) * 0.4); } }
      // 동쪽 벽: 칼걸이와 큰 수리검, 긴 무기
      { const xw = X1 - T - 0.03; for (let k = 0; k < 4; k++) { const y = F + 1.0 + k * 0.32, z = -1.4; for (const dz of [-0.45, 0.45]) B.geo(M.beam, box(0.12, 0.05, 0.04), mat4(xw - 0.05, y - 0.03, z + dz)); sword(B, mat4(xw - 0.09, y, z + 0.5, 0, PI / 2, 0), 0.75 + (k % 2) * 0.12); }
        B.geo(DARKI, star, mat4(xw - 0.03, F + 2.3, 3.3, 0, -PI / 2, 0.4, 7)); B.geo(DARKI, new THREE.TorusGeometry(0.16, 0.025, 5, 16), mat4(xw - 0.04, F + 2.3, 3.3, 0, PI / 2, 0));
        for (let k = 0; k < 4; k++) { const z = 3.0 + k * 0.28; beamBetween(B, k % 2 ? M.beam : M.beamLight, V(xw - 0.35, F, z), V(xw - 0.08, F + 2.0, z), 0.035, 0.035); if (k < 2) B.geo(STEELM, new THREE.ConeGeometry(0.04, 0.3, 4).scale(1, 1, 0.3), mat4(xw - 0.06, F + 2.14, z, 0, 0, 0.13)); }
        addCollider(xw - 0.45, F, 2.8, xw, F + 2.0, 4.0); }
      // 가운데 진열장: 육도선인의 보물 셋
      { const x = 1.6, z = 1.0, y = F; B.box(M.beam, x - 1.1, y, z - 0.45, x + 1.1, y + 0.9, z + 0.45); B.geo(mat('plain', 0x4a2a5a, { rough: 1 }), box(2.1, 0.02, 0.8), mat4(x, y + 0.91, z));
        for (const [dx, dz] of [[-1.08, 0], [1.08, 0]]) B.geo(M.glass, box(0.02, 0.8, 0.86), mat4(x + dx, y + 1.3, z + dz)); for (const dz of [-0.43, 0.43]) B.geo(M.glass, box(2.16, 0.8, 0.02), mat4(x, y + 1.3, z + dz)); B.geo(M.glass, box(2.18, 0.02, 0.88), mat4(x, y + 1.7, z)); addCollider(x - 1.1, y, z - 0.45, x + 1.1, y + 1.7, z + 0.45);
        // 파초선: 자루에 큰 깃 셋
        { const p = part(B, x - 0.7, y + 0.92, z, 0.2); p(M.beam, cyl(0.02, 0.02, 0.3, 6), 0, 0.15, 0); for (let k = -1; k <= 1; k++) { p(mat('plain', 0xf4f1ea, { rough: 0.9 }), SPH, k * 0.1, 0.48, 0, 0, 0, -k * 0.35, [0.07, 0.22, 0.015]); p(mat('plain', 0x7a3a8a, { rough: 0.9 }), SPH, k * 0.16, 0.64, 0, 0, 0, -k * 0.35, [0.045, 0.06, 0.016]); } }
        // 홍표주박
        B.geo(mat('plain', 0xb3261a, { rough: 0.5 }), lathe([[0, 0], [0.12, 0.02], [0.17, 0.16], [0.12, 0.3], [0.07, 0.36], [0.11, 0.46], [0.08, 0.56], [0.03, 0.6], [0.035, 0.66], [0, 0.66]], 14), mat4(x, y + 0.92, z)); B.geo(mat('plain', 0xe9c765), new THREE.TorusGeometry(0.075, 0.012, 5, 14).rotateX(PI / 2), mat4(x, y + 1.28, z));
        // 호박 정병
        B.geo(mat('plain', 0xd8922e, { rough: 0.3 }), lathe([[0, 0], [0.1, 0], [0.16, 0.12], [0.17, 0.3], [0.1, 0.42], [0.07, 0.46], [0.1, 0.5], [0, 0.5]], 14), mat4(x + 0.7, y + 0.92, z));
        ['芭蕉扇', '紅葫蘆', '琥珀の浄瓶'].forEach((t, i) => B.geo(textMat(t, { w: 128, h: 40, bg: '#f4efe2', color: '#1d1a16' }), new THREE.PlaneGeometry(0.4, 0.12), mat4(x - 0.7 + i * 0.7, y + 0.95, z + 0.34, -0.6, 0, 0)));
        places.push({ n: '보물 진열장', t: '텐텐이 전쟁터에서 거둔 육도선인의 보물. 파초선, 홍표주박, 호박 정병. 팔 생각은 없고 자랑하려고 내놓았다.', b: [0.2, 3.0, 0, 2.6], y: [0, 3] }); }
      for (const [x, z] of [[-2.5, 1.6], [2.5, -0.4]]) hangLamp(B, x, F2 - 0.2, z, 0.5, glows, lights, 14);
      places.unshift({ n: '忍具転転転(텐텐의 무기 가게)', t: '텐텐이 온 세상에서 모아 온 닌자 도구를 늘어놓고 파는 가게. 평화로워진 뒤로 손님이 드물어 주인은 계산대에서 졸기 일쑤다.', b: [X0, X1, Z0, Z1 + 2], y: [0, F2 - 0.2] });
      /* 위층: 텐텐의 방 */
      { const y = F2;
        woodBed(B, -4.9, y, 2.2, PI, mat('plain', 0xd98a9a, { rough: 1 })); deskAt(B, M.beamLight, -3.4, y, Z0 + T + 0.45, PI, 1.5, 0.7); chairAt(B, M.beam, -3.4, y, -3.2, PI);
        B.geo(CHINA, cyl(0.13, 0.08, 0.02, 14), mat4(-3.0, y + 0.79, -3.8)); for (let k = 0; k < 5; k++) { B.geo(mat('plain', 0xe9d8a8, { rough: 0.8 }), SPH, mat4(-3.0 + Math.cos(k * 1.26) * 0.06, y + 0.83, -3.8 + Math.sin(k * 1.26) * 0.06, 0, 0, 0, 0.032)); }   // 깨 경단
        photo(B, 'team-guy', [['#1d1a16', '#3f7a4a', 0.95], ['#5a3a28', '#e9dcc0', 0.75], ['#1d1a16', '#3f7a4a', 0.7], ['#5a3a28', '#e98aa0', 0.7]], -4.0, y + 0.95, -3.95, 0, 0.36);
        scroll(B, '百発百中', -1.4, y + 1.7, Z0 + T + 0.04, 0, 0.5, 1.4);
        // 점치는 낮은 상: 팔괘 그림, 점대 통, 엽전
        { const x = 0.6, z = 1.6; B.geo(M.beam, cyl(0.6, 0.6, 0.05, 20), mat4(x, y + 0.34, z)); B.geo(M.beam, cyl(0.1, 0.24, 0.32, 10), mat4(x, y + 0.16, z)); addCollider(x - 0.5, y, z - 0.5, x + 0.5, y + 0.36, z + 0.5);
          B.geo(textMat(' ', { w: 256, h: 256, bg: '#efe8d8', color: '#efe8d8', key: 'tenten-bagua', draw: (g, W) => { g.translate(W / 2, W / 2); g.strokeStyle = '#1d1a16'; g.lineWidth = 4; g.beginPath(); for (let i = 0; i <= 8; i++) { const a = i * PI / 4 + PI / 8; i ? g.lineTo(Math.cos(a) * 118, Math.sin(a) * 118) : g.moveTo(Math.cos(a) * 118, Math.sin(a) * 118); } g.stroke(); for (let i = 0; i < 8; i++) { g.save(); g.rotate(i * PI / 4); for (let k = 0; k < 3; k++) { g.lineWidth = 7; g.beginPath(); if ((i >> k) & 1) { g.moveTo(-26, -96 + k * 14); g.lineTo(26, -96 + k * 14); } else { g.moveTo(-26, -96 + k * 14); g.lineTo(-6, -96 + k * 14); g.moveTo(6, -96 + k * 14); g.lineTo(26, -96 + k * 14); } g.stroke(); } g.restore(); } g.beginPath(); g.arc(0, 0, 34, 0, PI * 2); g.lineWidth = 4; g.stroke(); g.beginPath(); g.arc(0, 0, 34, -PI / 2, PI / 2); g.arc(0, 17, 17, PI / 2, -PI / 2, true); g.arc(0, -17, 17, PI / 2, -PI / 2); g.fill(); } }), new THREE.PlaneGeometry(0.6, 0.6), mat4(x, y + 0.37, z, -PI / 2, 0, 0));
          B.geo(M.beamLight, cyl(0.05, 0.045, 0.16, 10), mat4(x + 0.42, y + 0.445, z - 0.25)); for (let k = 0; k < 9; k++) B.geo(M.beamLight, cyl(0.004, 0.004, 0.3, 4), mat4(x + 0.42 + (k % 3 - 1) * 0.015, y + 0.56, z - 0.25 + (Math.floor(k / 3) - 1) * 0.015, (k % 3 - 1) * 0.12, 0, (Math.floor(k / 3) - 1) * 0.12));
          for (let k = 0; k < 3; k++) B.geo(mat('plain', 0xb8923a, { rough: 0.5 }), cyl(0.03, 0.03, 0.006, 10), mat4(x - 0.35 + k * 0.09, y + 0.375, z + 0.35));
          for (const [dx, dz] of [[0, 0.95], [0, -0.95]]) B.geo(mat('plain', 0x8a3a30, { rough: 1 }), box(0.5, 0.07, 0.5), mat4(x + dx, y + 0.035, z + dz)); }
        cabinetAt(B, M.beam, X1 - T - 0.3, y, 3.4, -PI / 2, 1.2, 1.9, 0.55, 3);
        // 쓰다 둔 무기 두루마리와 닦던 쿠나이
        for (let k = 0; k < 3; k++) B.geo(mat('plain', [0x3f6a4a, 0x8a3a30, 0x3d5a80][k], { rough: 0.9 }), cyl(0.07, 0.07, 0.5, 10).rotateZ(PI / 2), mat4(3.6, y + 0.07 + (k === 2 ? 0.12 : 0), 0.6 + (k === 2 ? 0.07 : k * 0.15), 0, 0.2, 0));
        for (let k = 0; k < 4; k++) B.geo(DARKI, kunai, mat4(-3.9 + k * 0.1, y + 0.785, -3.5, PI / 2, 0, 0.2 * k));
        for (const [x, z] of [[-2, 1.5], [3, 1.5]]) hangLamp(B, x, H + 0.4, z, 1.2, glows, lights, 13);
        places.push({ n: '텐텐의 방', t: '가게 위의 살림방. 벽에는 "百発百中"(백발백중), 낮은 상에는 팔괘 그림과 점대 — 텐텐의 취미는 점치기다. 책상에는 좋아하는 깨 경단.', b: [X0, X1, Z0, Z1], y: [F2, H + 2] }); }
      return { places, glows, lights, jumps: [['텐텐의 집(무기 가게)', 0, 0, Z1 + 6, 0, 97]] };
    }));
  }

  /* ---------- 리의 집: 숲 속 빈터의 작은 집과 수련 마당 ---------- */
  {
    const at = { x: 408, z: 476, ry: PI }, X0 = -4.5, X1 = 4.5, Z0 = -3.5, Z1 = 3.5, F = 0.2, H = 3.0, T = 0.25;
    LOTS.push({ x: at.x, z: at.z - 3, ry: at.ry, w: 22, d: 26 });
    const WALLM = mat('plaster', 0xe9e2c8), TILE = mat('tile', 0x4f7a3a), TRIM = M.beam, SUIT = mat('plain', 0x2f8a4a, { rough: 0.9 }), ORANGE = mat('plain', 0xe5762b, { rough: 0.9 }), ROPE = mat('plain', 0xc9b58a, { rough: 1 });
    const dumbbell = (B, x, y, z, ry, s = 1) => { const p = part(B, x, y, z, ry); p(DARKI, cyl(0.02, 0.02, 0.3, 6).rotateZ(PI / 2), 0, 0.08 * s, 0, 0, 0, 0, s); for (const sx of [-1, 1]) p(DARKI, cyl(0.08, 0.08, 0.07, 12).rotateZ(PI / 2), sx * 0.17 * s, 0.08 * s, 0, 0, 0, 0, s); };
    take(put(scene, at, B => {
      const glows = [], lights = [], places = [];
      shopShell(B, X0, Z0, X1, Z1, H, WALLM, TRIM, M.floor, { s: [[-3.8, -1.6, 'w'], [-0.6, 0.6, 'd'], [1.6, 3.8, 'w']], w: [[-1, 1, 'w']], e: [[-1, 1, 'w']] }, [], false);
      gableRoof(B, TILE, X0, Z0, X1, Z1, H, 1.7, { ridge: 'x', gable: WALLM, over: 0.8 });
      B.box(M.stone, -1.0, 0, Z1, 1.0, 0.1, Z1 + 0.9, false);
      signBoard(B, 'ロック・リー', 1.1, 1.6, Z1 + 0.06, 0, 0.7, 0.2, { both: false });
      // 방
      woodBed(B, -3.0, F, Z0 + T + 0.55, PI / 2, SUIT);
      scroll(B, '努力', -0.6, F + 1.75, Z0 + T + 0.04, 0, 0.5, 1.2); scroll(B, '根性', 0.3, F + 1.75, Z0 + T + 0.04, 0, 0.5, 1.2);
      signBoard(B, '青春', 2.4, F + 1.9, Z0 + T + 0.04, 0, 1.2, 0.7, { both: false, bg: '#e5762b', color: '#f4efe2' });
      photo(B, 'team-guy', [['#1d1a16', '#3f7a4a', 0.95], ['#5a3a28', '#e9dcc0', 0.75], ['#1d1a16', '#3f7a4a', 0.7], ['#5a3a28', '#e98aa0', 0.7]], -4.21, F + 1.6, 2.2, PI / 2, 0.5);
      // 똑같은 초록 옷 셋이 걸린 옷걸이, 벗어 둔 다리 추
      { const x = X1 - T - 0.35, p = part(B, x, F, -1.9, 0); p(TRIM, cyl(0.02, 0.02, 1.6, 6).rotateX(PI / 2), 0, 1.75, 0); for (const sz of [-1, 1]) p(TRIM, box(0.05, 1.75, 0.05), 0, 0.875, sz * 0.8);
        for (let k = 0; k < 3; k++) { const z = -0.5 + k * 0.5; p(SUIT, box(0.1, 0.62, 0.4), 0, 1.38, z); for (const s of [-1, 1]) { p(SUIT, box(0.09, 0.62, 0.15), 0, 0.78, z + s * 0.11); p(SUIT, box(0.08, 0.5, 0.11), 0, 1.4, z + s * 0.26, s * 0.25); p(ORANGE, box(0.1, 0.24, 0.16), 0, 0.42, z + s * 0.11); } p(M.iron, new THREE.TorusGeometry(0.03, 0.006, 4, 8, PI), 0, 1.75, z); }
        addCollider(x - 0.15, F, -2.75, x + 0.15, F + 1.8, -1.05); }
      for (const dz of [0, 0.26]) { B.geo(ORANGE, cyl(0.07, 0.065, 0.24, 10), mat4(3.2, F + 0.12, 0.6 + dz)); for (let k = 0; k < 4; k++) B.geo(DARKI, box(0.035, 0.2, 0.05), mat4(3.2 + Math.cos(k * 1.57) * 0.08, F + 0.12, 0.6 + dz + Math.sin(k * 1.57) * 0.08, 0, -k * 1.57, 0)); }
      // 낮은 상의 카레라이스
      { const x = -0.4, z = 0.6, y = F; B.geo(M.beamLight, box(1.0, 0.05, 0.7), mat4(x, y + 0.33, z)); for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.geo(M.beamLight, box(0.06, 0.3, 0.06), mat4(x + sx * 0.42, y + 0.15, z + sz * 0.28)); addCollider(x - 0.5, y, z - 0.35, x + 0.5, y + 0.36, z + 0.35);
        B.geo(CHINA, cyl(0.16, 0.1, 0.03, 16), mat4(x, y + 0.37, z)); B.geo(mat('plain', 0xf7f3ea, { rough: 0.9 }), SPH, mat4(x - 0.05, y + 0.395, z, 0, 0, 0, [0.07, 0.03, 0.09])); B.geo(mat('plain', 0x9a5a1e, { rough: 0.5 }), SPH, mat4(x + 0.05, y + 0.39, z, 0, 0, 0, [0.07, 0.022, 0.1])); for (let k = 0; k < 4; k++) B.geo(mat('plain', k % 2 ? 0xe58a3a : 0xe9d27a, { rough: 0.6 }), box(0.025, 0.02, 0.025), mat4(x + 0.03 + (k % 2) * 0.04, y + 0.41, z - 0.04 + Math.floor(k / 2) * 0.06));
        B.geo(STEELM, box(0.012, 0.004, 0.16), mat4(x + 0.24, y + 0.358, z, 0, 0.3, 0)); B.geo(CHINA, cyl(0.035, 0.03, 0.09, 10), mat4(x - 0.3, y + 0.4, z - 0.15)); B.geo(mat('plain', 0x3f7a4a, { rough: 1 }), box(0.5, 0.07, 0.5), mat4(x, y + 0.035, z + 0.75)); }
      // 방 안의 수련 도구: 아령, 역기, 문틀의 턱걸이 봉
      dumbbell(B, 2.0, F, 2.2, 0.4); dumbbell(B, 2.4, F, 2.6, 1.2); dumbbell(B, -2.6, F, 2.4, 0.2, 1.5);
      { const p = part(B, 1.6, F, -0.9, 0.15); p(DARKI, cyl(0.018, 0.018, 1.7, 6).rotateZ(PI / 2), 0, 0.24, 0); for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) p(DARKI, cyl(0.24 - k * 0.04, 0.24 - k * 0.04, 0.05, 16).rotateZ(PI / 2), sx * (0.6 + k * 0.06), 0.24, 0); addCollider(0.7, F, -1.2, 2.5, F + 0.48, -0.6); }
      B.geo(DARKI, cyl(0.02, 0.02, 1.3, 6).rotateZ(PI / 2), mat4(0, F + 2.5, Z1 - T - 0.2));
      hangLamp(B, 0, H + 0.3, 0, 1.1, glows, lights, 14);
      places.push({ n: '리의 집', t: '숲 속 빈터의 작은 집. 벽에는 "努力"(노력)과 "根性"(근성), 옷걸이에는 똑같은 초록 옷이 세 벌. 상에는 좋아하는 카레라이스.', b: [X0, X1, Z0, Z1], y: [0, 5] });
      // 수련 마당: 줄 감은 말뚝, 통나무, 돌 추, 모래 자루, 횟수 판
      B.box(M.dirt, -7, 0, Z1 + 0.9, 7, 0.03, Z1 + 13, false);
      for (const [x, z] of [[-4.5, 7], [-2.8, 9], [-5.2, 10.2]]) { B.geo(M.beam, cyl(0.16, 0.18, 1.9, 10), mat4(x, 0.95, z)); for (let k = 0; k < 9; k++) B.geo(ROPE, new THREE.TorusGeometry(0.175, 0.022, 4, 12).rotateX(PI / 2), mat4(x, 0.75 + k * 0.045, z)); for (let k = 0; k < 9; k++) B.geo(ROPE, new THREE.TorusGeometry(0.17, 0.022, 4, 12).rotateX(PI / 2), mat4(x, 1.35 + k * 0.045, z)); addCollider(x - 0.18, 0, z - 0.18, x + 0.18, 1.9, z + 0.18); }
      { const x = 4.4, z = 8.2; for (const sx of [-1, 1]) B.box(M.beam, x + sx * 1.1 - 0.08, 0, z - 0.08, x + sx * 1.1 + 0.08, 2.9, z + 0.08); B.box(M.beam, x - 1.3, 2.8, z - 0.08, x + 1.3, 2.96, z + 0.08, false); B.geo(ROPE, cyl(0.012, 0.012, 0.9, 5), mat4(x, 2.35, z)); B.geo(mat('plain', 0xb89a6a, { rough: 1 }), lathe([[0, 0], [0.2, 0.05], [0.24, 0.3], [0.24, 0.95], [0.16, 1.1], [0, 1.12]], 12), mat4(x, 0.8, z)); addCollider(x - 0.25, 0.8, z - 0.25, x + 0.25, 1.9, z + 0.25); }
      for (let k = 0; k < 4; k++) { const s = 0.3 + k * 0.08; B.geo(M.stone, box(s * 1.6, s, s * 1.2), mat4(1.2 + k * 0.95, s / 2, 11.4, 0, k * 0.3, 0)); B.geo(ROPE, new THREE.TorusGeometry(s * 0.5, 0.02, 4, 12, PI), mat4(1.2 + k * 0.95, s, 11.4, 0, k * 0.3, 0)); }
      addCollider(0.8, 0, 11.0, 4.6, 0.5, 11.8);
      B.geo(M.beam, cyl(0.22, 0.24, 3.2, 10).rotateZ(PI / 2), mat4(-1.0, 0.24, 11.6, 0, 0.2, 0)); addCollider(-2.6, 0, 11.2, 0.6, 0.48, 12.0);
      for (const s of [-1, 1]) B.box(M.beam, 6.0 + s * 0.7 - 0.05, 0, 5.4, 6.0 + s * 0.7 + 0.05, 1.9, 5.5, false); signBoard(B, '腕立て五百回', 6.0, 1.55, 5.45, PI, 1.5, 0.3, { both: false }); signBoard(B, '逆立ち歩き百周', 6.0, 1.15, 5.45, PI, 1.5, 0.3, { both: false }); addCollider(5.2, 0, 5.35, 6.8, 1.9, 5.55);
      for (let k = 0; k < 2; k++) dumbbell(B, -1.5 + k * 0.6, 0, 5.5, k, 1.6);
      places.push({ n: '리의 수련 마당', t: '줄 감은 말뚝과 모래 자루, 돌 추. 판에는 오늘의 몫 — 팔굽혀펴기 오백 번, 물구나무로 마당 백 바퀴. 못 채우면 줄넘기 천 번이다.', b: [-7, 7, Z1 + 0.9, Z1 + 13], y: [0, 4] });
      return { places, glows, lights, jumps: [['리의 집', 0, 0, Z1 + 15, 0, 98]] };
    }));
  }

  /* ---------- 사이의 아파트: 2층 공동주택의 아래층 왼쪽 방 ---------- */
  {
    const at = { x: 208, z: 469, ry: PI }, X0 = -7, X1 = 7, Z0 = -4, Z1 = 4, F = 0.2, F2 = 3.4, H = 6.8, T = 0.25;
    LOTS.push({ x: at.x - 2, z: at.z - 1.5, ry: at.ry, w: 22, d: 14 });
    const WALLM = mat('plaster', 0xdcd6c8), TRIM = mat('wood', 0x3a4048), INK = mat('plain', 0x1b1b1e, { rough: 0.6 });
    const ink = (key, draw) => textMat(' ', { w: 256, h: 256, bg: '#f1ecdf', color: '#f1ecdf', key, draw: (g, W, Hh) => { g.strokeStyle = '#1b1b1e'; g.fillStyle = '#1b1b1e'; g.lineCap = 'round'; g.lineJoin = 'round'; draw(g, W, Hh); } });
    const mountain = ink('sai-mount', (g, W, Hh) => { g.lineWidth = 7; g.beginPath(); g.moveTo(10, 200); g.lineTo(70, 90); g.lineTo(105, 140); g.lineTo(160, 50); g.lineTo(246, 200); g.stroke(); g.lineWidth = 3; g.globalAlpha = 0.5; for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(20 + k * 12, 215 + k * 6); g.lineTo(236 - k * 20, 215 + k * 6); g.stroke(); } g.globalAlpha = 1; g.beginPath(); g.arc(205, 50, 16, 0, PI * 2); g.stroke(); });
    const bird = ink('sai-bird', g => { g.lineWidth = 9; g.beginPath(); g.moveTo(30, 150); g.quadraticCurveTo(90, 60, 128, 130); g.quadraticCurveTo(166, 60, 226, 110); g.stroke(); g.lineWidth = 12; g.beginPath(); g.moveTo(128, 130); g.quadraticCurveTo(150, 170, 120, 205); g.stroke(); g.beginPath(); g.arc(134, 118, 12, 0, PI * 2); g.fill(); g.lineWidth = 4; g.beginPath(); g.moveTo(144, 114); g.lineTo(166, 108); g.stroke(); });
    const tiger = ink('sai-tiger', g => { g.lineWidth = 10; g.beginPath(); g.moveTo(40, 170); g.quadraticCurveTo(60, 90, 130, 100); g.quadraticCurveTo(200, 95, 215, 150); g.stroke(); g.beginPath(); g.arc(215, 120, 26, 0, PI * 2); g.stroke(); g.lineWidth = 7; for (const x of [70, 100, 150, 185]) { g.beginPath(); g.moveTo(x, 150); g.lineTo(x - 6, 215); g.stroke(); } g.beginPath(); g.moveTo(40, 170); g.quadraticCurveTo(10, 140, 30, 100); g.stroke(); g.lineWidth = 5; for (const x of [85, 115, 145]) { g.beginPath(); g.moveTo(x, 100); g.lineTo(x + 8, 135); g.stroke(); } g.beginPath(); g.arc(207, 114, 3, 0, PI * 2); g.arc(224, 114, 3, 0, PI * 2); g.fill(); });
    const book = ink('sai-book', (g, W, Hh) => { g.lineWidth = 3; g.beginPath(); g.moveTo(W / 2, 10); g.lineTo(W / 2, Hh - 10); g.stroke(); for (const [cx, dark] of [[96, true], [160, false]]) { g.lineWidth = 6; g.beginPath(); g.arc(cx, 90, 22, 0, PI * 2); dark ? g.fill() : g.stroke(); g.beginPath(); g.moveTo(cx, 112); g.lineTo(cx, 180); g.moveTo(cx, 180); g.lineTo(cx - 14, 226); g.moveTo(cx, 180); g.lineTo(cx + 14, 226); g.stroke(); } g.beginPath(); g.moveTo(96, 135); g.lineTo(128, 150); g.lineTo(160, 135); g.stroke(); });
    take(put(scene, at, B => {
      const glows = [], lights = [], places = [];
      shopShell(B, X0, Z0, X1, Z1, H, WALLM, TRIM, M.floor, { s: [[-6.2, -4.8, 'w'], [-4.2, -3.0, 'd'], [-2.2, -0.8, 'w'], [0.8, 2.2, 'w'], [3.0, 4.2, 'd'], [4.8, 6.2, 'w']], n: [[-4.4, -2.6, 'w'], [2.6, 4.4, 'w']], w: [[-1, 1, 'w']], e: [[-1, 1, 'w']] }, [F2 - 0.2], false);
      // 평지붕과 난간벽, 물탱크
      B.box(M.concrete, X0, H, Z0, X1, H + 0.12, Z1, false); for (const [a, b, c, d] of [[X0, Z0, X1, Z0 + 0.25], [X0, Z1 - 0.25, X1, Z1], [X0, Z0, X0 + 0.25, Z1], [X1 - 0.25, Z0, X1, Z1]]) B.box(WALLM, a, H, b, c, H + 0.8, d, false);
      B.box(TRIM, X0 - 0.08, H + 0.8, Z0 - 0.08, X1 + 0.08, H + 0.9, Z1 + 0.08, false); addRoof(X0, Z0, X1, Z1, () => H + 0.12);
      B.geo(mat('metal', 0x8fa0a3, { rough: 0.55 }), cyl(0.8, 0.8, 1.4, 18), mat4(4.6, H + 1.3, -1.6)); B.geo(mat('metal', 0x8fa0a3, { rough: 0.55 }), new THREE.ConeGeometry(0.86, 0.4, 18), mat4(4.6, H + 2.2, -1.6)); for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.box(DARKI, 4.6 + dx * 0.5 - 0.04, H + 0.12, -1.6 + dz * 0.5 - 0.04, 4.6 + dx * 0.5 + 0.04, H + 0.6, -1.6 + dz * 0.5 + 0.04, false);
      // 2층 바닥과 앞 복도, 바깥 계단
      B.box(M.floor, X0 + T, F2 - 0.2, Z0 + T, X1 - T, F2, Z1 - T);
      B.box(M.concrete, X0, F2 - 0.2, Z1, X1, F2, Z1 + 1.5); for (const x of [-6.8, -2.3, 2.3, 6.8]) B.box(TRIM, x - 0.07, 0, Z1 + 1.36, x + 0.07, F2 - 0.2, Z1 + 1.5);
      stairs(B, M.concrete, 'x', X1, 1, 0, F2, Z1 + 0.05, Z1 + 1.5, 0.3);
      railing(B, DARKI, [[X0 + 0.05, Z1 + 0.05], [X0 + 0.05, Z1 + 1.45], [X1, Z1 + 1.45]], F2, 1.0, { gap: 0.3 });
      beamBetween(B, DARKI, V(X1, F2 + 1.0, Z1 + 1.45), V(X1 + 4.8, 1.0, Z1 + 1.45), 0.06, 0.06); for (let k = 0; k <= 4; k++) B.box(DARKI, X1 + k * 1.2 - 0.03, F2 - k * 0.8 - (k ? 0 : 0), Z1 + 1.42, X1 + k * 1.2 + 0.03, F2 - k * 0.8 + 1.0, Z1 + 1.48, false);
      addCollider(X1, 0, Z1 + 1.45, X1 + 4.8, F2 + 1.0, Z1 + 1.55);
      // 방 사이 벽(아래층·위층)
      for (const y of [F, F2]) partition(B, M.white, TRIM, 'z', 0, Z0 + T, Z1 - T, y, [], y === F ? 3.0 : 3.3);
      B.box(M.white, X0 + T, F2 - 0.3, Z0 + T, X1 - T, F2 - 0.2, Z1 - T, false);
      for (const [x, t] of [[-3.6, 'サイ'], [3.6, '空室']]) signBoard(B, t, x + 0.95, 1.6, Z1 + 0.06, 0, 0.5, 0.22, { both: false });
      B.box(M.stone, -4.5, 0, Z1, -2.7, 0.1, Z1 + 0.8, false); B.box(M.stone, 2.7, 0, Z1, 4.5, 0.1, Z1 + 0.8, false);
      /* 사이의 방 */
      { const y = F;
        // 그림틀과 그리다 만 새 그림, 먹과 붓
        { const p = part(B, -4.6, y, -0.6, 0.5); for (const sx of [-1, 1]) p(M.beamLight, box(0.04, 1.75, 0.04), sx * 0.34, 0.86, 0.1, -0.16); p(M.beamLight, box(0.04, 1.7, 0.04), 0, 0.82, -0.32, 0.26); p(M.beamLight, box(0.8, 0.04, 0.08), 0, 0.78, 0.2); p(mat('plain', 0xf1ecdf, { rough: 1 }), box(0.78, 0.98, 0.02), 0, 1.3, 0.12, -0.16); p(bird, new THREE.PlaneGeometry(0.74, 0.94), 0, 1.3, 0.134, -0.16); addCollider(-5.05, y, -1.05, -4.15, y + 1.8, -0.15); }
        { const x = -2.6, z = 0.3; B.geo(M.beam, box(1.3, 0.05, 0.7), mat4(x, y + 0.31, z)); for (const sx of [-1, 1]) B.geo(M.beam, box(0.05, 0.28, 0.6), mat4(x + sx * 0.6, y + 0.14, z)); addCollider(x - 0.65, y, z - 0.35, x + 0.65, y + 0.34, z + 0.35);
          B.geo(INK, box(0.16, 0.03, 0.22), mat4(x - 0.4, y + 0.35, z)); B.geo(mat('plain', 0x0a0a0c, { rough: 0.2 }), box(0.11, 0.004, 0.13), mat4(x - 0.4, y + 0.366, z + 0.03)); B.geo(INK, box(0.03, 0.03, 0.12), mat4(x - 0.22, y + 0.35, z));
          for (let k = 0; k < 4; k++) { B.geo(M.beamLight, cyl(0.007, 0.007, 0.24, 5).rotateX(PI / 2), mat4(x - 0.05 + k * 0.05, y + 0.345, z, 0, 0.1 * k, 0)); B.geo(INK, new THREE.ConeGeometry(0.01, 0.05, 6).rotateX(PI / 2), mat4(x - 0.05 + k * 0.05 + 0.012 * k, y + 0.345, z + 0.14, 0, 0.1 * k, 0)); }
          B.geo(mat('plain', 0xf1ecdf, { rough: 1 }), box(0.5, 0.004, 0.36), mat4(x + 0.3, y + 0.338, z)); B.geo(mat('plain', 0x3d5a80, { rough: 1 }), box(0.5, 0.07, 0.5), mat4(x, y + 0.035, z + 0.75));
          // 끝내지 못한 그림책: 양 끝에서 걸어온 두 아이가 가운데서 손을 잡는다
          B.geo(mat('plain', 0x4a3a2a, { rough: 0.9 }), box(0.46, 0.02, 0.32), mat4(x + 0.3, y + 0.35, z - 0.02, 0, 0.1, 0)); B.geo(book, new THREE.PlaneGeometry(0.44, 0.3), mat4(x + 0.3, y + 0.362, z - 0.02, -PI / 2, 0.1, 0));
          places.push({ n: '사이의 그림책', t: '형처럼 따르던 신과 자신을 양 끝에서부터 그려 나간 그림책. 가운데 쪽에서 둘이 손을 잡게 하려 했지만, 신이 죽은 뒤로 끝내 완성하지 못하고 간직해 왔다.', b: [-3.6, -1.6, -0.4, 1.6], y: [0, 2] }); }
        // 바닥에 펼친 긴 두루마리: 초수위화의 짐승
        B.geo(mat('plain', 0xf1ecdf, { rough: 1 }), box(0.5, 0.006, 2.2), mat4(-1.2, y + 0.004, -1.6, 0, 0.3, 0)); B.geo(tiger, new THREE.PlaneGeometry(0.46, 0.46), mat4(-1.05, y + 0.009, -1.2, -PI / 2, 0.3, 0)); B.geo(bird, new THREE.PlaneGeometry(0.46, 0.46), mat4(-1.33, y + 0.009, -2.05, -PI / 2, 0.3, 0)); for (const s of [-1, 1]) B.geo(M.beam, cyl(0.04, 0.04, 0.56, 8).rotateZ(PI / 2), mat4(-1.2 + s * 0.33, y + 0.04, -1.6 + s * 1.07, 0, 0.3, 0));
        // 벽의 먹 그림
        for (const [m, z] of [[mountain, 2.4], [tiger, 0.9]]) { B.geo(M.beam, box(0.86, 0.86, 0.02), mat4(X0 + T + 0.02, y + 1.7, z, 0, PI / 2, 0)); B.geo(m, new THREE.PlaneGeometry(0.8, 0.8), mat4(X0 + T + 0.035, y + 1.7, z, 0, PI / 2, 0)); }
        // 침대, 책꽂이(사람 사귀는 법 책), 단도 걸이
        woodBed(B, -5.9, y, Z0 + T + 1.2, 0, mat('plain', 0x4a4a52, { rough: 1 }));
        shelfAt(B, M.beam, -0.5, y, -2.2, -PI / 2, 1.8, 1.9, 4, rngOf(1702));
        { const x = -0.42, yy = y + 1.92; for (const [t, bg, i] of [['友だちの作り方', '#3d5a80', 0], ['人の気持ちがわかる本', '#7a3a34', 1], ['あだ名のつけ方', '#4a7a58', 2]]) { B.geo(mat('plain', new THREE.Color(bg).getHex(), { rough: 0.9 }), box(0.035, 0.28, 0.2), mat4(x - 0.03, yy + 0.14, -2.7 + i * 0.3, 0, 0, i === 2 ? 0.2 : 0)); B.geo(textMat(t, { w: 128, h: 192, vertical: true, bg, color: '#f1e6c8' }), new THREE.PlaneGeometry(0.19, 0.27), mat4(x - 0.05, yy + 0.14, -2.7 + i * 0.3, 0, -PI / 2, 0)); } }
        { const x = -3.2, z = Z0 + T + 0.2; B.geo(M.beam, box(0.9, 0.04, 0.25), mat4(x, y + 0.9, z)); for (const sx of [-1, 1]) { B.geo(M.beam, box(0.04, 0.9, 0.22), mat4(x + sx * 0.42, y + 0.45, z)); B.geo(M.beam, box(0.05, 0.12, 0.05), mat4(x + sx * 0.3, y + 0.98, z)); } B.geo(INK, box(0.5, 0.035, 0.03), mat4(x + 0.05, y + 1.05, z)); B.geo(mat('plain', 0x8a1c16), box(0.14, 0.04, 0.035), mat4(x - 0.27, y + 1.05, z)); addCollider(x - 0.45, y, z - 0.13, x + 0.45, y + 1.1, z + 0.13); }
        hangLamp(B, -3.4, F2 - 0.3, 0.2, 0.5, glows, lights, 14);
        places.push({ n: '사이의 방', t: '먹 냄새가 밴 조용한 방. 그림틀에는 그리다 만 새, 바닥에는 초수위화에 쓰는 짐승 두루마리. 책꽂이 위에는 사람 사귀는 법을 다룬 책이 놓여 있다.', b: [X0, 0, Z0, Z1], y: [0, F2 - 0.2] }); }
      places.unshift({ n: '사이의 아파트', t: '사이가 세 들어 사는 2층 공동주택. 아래층 왼쪽이 사이의 방이고, 나머지는 비어 있다.', b: [X0, X1 + 5, Z0, Z1 + 2], y: [0, 10] }, { n: '빈 방', t: '세를 놓은 빈 방.', b: [0, X1, Z0, Z1], y: [0, F2 - 0.2] });
      return { places, glows, lights, jumps: [['사이의 아파트', -3.6, 0, Z1 + 7, 0, 99]] };
    }));
  }
}
/* ============================ 센주 공원 ============================
   번화가 동쪽의 큰 공원. 못 한가운데 섬에 아주 큰 나무가 서 있고, 남쪽에 놀이터가 있다.
   원작(나루토 위키 "Senju Park")에 적힌 것: 이름(千手公園), 센주 일족과 얽힌 넓은 숲이라는 것,
   못에 둘러싸인 큰 나무와 놀이터가 있다는 것.
   지어낸 것: 섬으로 건너가는 붉은 다리, 나무에 두른 금줄, 정자, 벚나무, 돌등, 꽃밭, 울타리와 문기둥,
   놀이 기구의 종류와 놓인 자리, 못의 잉어와 연잎. */
// 줄(pts)을 따라 폭 w로 까는 납작한 띠(산책길)
function ribbon(pts, w, y = 0.04, closed = false) {
  const n = pts.length, pos = [], uv = [], idx = [];
  let L = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l * w / 2, nz = dx / l * w / 2;
    if (i) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    pos.push(pts[i][0] + nx, y, pts[i][1] + nz, pts[i][0] - nx, y, pts[i][1] - nz); uv.push(0, L, w, L);
  }
  for (let i = 0; i < (closed ? n : n - 1); i++) { const a = i * 2, b = ((i + 1) % n) * 2; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  if (g.attributes.normal.getY(0) < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); }
  return g;
}
// 굽은 줄기의 높이 y에서 한가운데와 굵기를 잰다(금줄을 두르거나 막을 자리를 잡을 때). gap = 줄기 마디 사이의 높이.
// 마디가 드문드문하므로 y 아래 마디와 위 마디를 따로 재서 그 사이를 잇는다.
function trunkAt(geo, y, gap, lim = 6) {
  const p = geo.attributes.position;
  const ring = (y0, y1) => {
    let sx = 0, sy = 0, sz = 0, n = 0, r = 0;
    for (let i = 0; i < p.count; i++) { const v = p.getY(i); if (v >= y0 && v < y1 && Math.hypot(p.getX(i), p.getZ(i)) < lim) { sx += p.getX(i); sy += v; sz += p.getZ(i); n++; } }
    if (!n) return null;
    sx /= n; sy /= n; sz /= n;
    for (let i = 0; i < p.count; i++) { const v = p.getY(i); if (v >= y0 && v < y1 && Math.hypot(p.getX(i), p.getZ(i)) < lim) r += Math.hypot(p.getX(i) - sx, p.getZ(i) - sz); }
    return { x: sx, y: sy, z: sz, r: r / n };
  };
  const a = ring(y - gap, y), b = ring(y, y + gap);
  if (!a || !b) return a || b || { x: 0, z: 0, r: 1 };
  const t = (y - a.y) / (b.y - a.y || 1);
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, r: a.r + (b.r - a.r) * t };
}
function park(scene, out) {
  const Z = zone(20), at = { x: 235, z: 596, ry: 0 };
  const C = [0, -11], PA = 30, PB = 24;                      // 못 한가운데와 반지름(동서, 남북). 섬은 반지름 11
  const HX = 65, HZ = 92.5;                                   // 공원 터의 반 너비
  const PG = [-22, 32, 22, 66];                               // 놀이터 모래 마당
  const AZ = [28, -42];                                       // 정자
  const R = rngOf(2020), WY = -0.45;
  const ell = (x, z, a, b) => ((x - C[0]) / a) ** 2 + ((z - C[1]) / b) ** 2;
  const ticks = [];
  let bare = null;
  const res = put(scene, at, (B, holder) => {
    const places = [], jumps = [], glows = [], lights = [];
    const SAND = mat('dirt', 0xe6dab4), PATH = mat('dirt', 0xc8b78c), LOG = mat('wood', 0x8c6c4a), RED = mat('plain', 0xb5392b, { rough: 0.55 }), TILE = mat('tile', 0x3f4a47, { rough: 0.6 });
    const PAINT = hex => mat('plain', hex, { rough: 0.5 }), CONC = mat('plain', 0xa3a59f, { rough: 0.95 }), STRAW = mat('plain', 0xd9c58a, { rough: 0.95 }), PAPER = mat('paper', 0xf6f3ea);
    const BARK = mat('bark', 0x7b6349), GLOW = mat('glow', 0xffe6b0, { power: 1.0 });
    const inst = (g, m, ms, shadow = true) => { const im = new THREE.InstancedMesh(g, m, ms.length); ms.forEach((q, i) => im.setMatrixAt(i, q)); im.instanceMatrix.needsUpdate = true; im.castShadow = shadow; im.receiveShadow = true; im.computeBoundingSphere(); holder.add(im); return im; };

    /* ---- 산책길: 못을 한 바퀴 도는 길과 네 문에서 들어오는 길 ---- */
    const RA = PA + 6, RB = PB + 6;
    B.geo(PATH, ribbon(Array.from({ length: 96 }, (_, i) => [C[0] + Math.cos(i / 96 * PI * 2) * RA, C[1] + Math.sin(i / 96 * PI * 2) * RB]), 3.2, 0.04, true));
    const WAYS = [[[-HX, C[1]], [-RA, C[1]]], [[RA, C[1]], [HX, C[1]]], [[0, -HZ], [0, C[1] - RB]], [[0, C[1] + RB], [0, PG[1]]], [[0, PG[3]], [0, HZ]], [[-HX, 50], [PG[0], 50]]];
    for (const w of WAYS) B.geo(PATH, ribbon(w, 3.2, 0.045));
    B.box(SAND, PG[0], 0, PG[1], PG[2], 0.035, PG[3], false);
    const wayDist = (x, z) => { let d = Math.abs(Math.sqrt(ell(x, z, RA, RB)) - 1) * RB; for (const [a, b] of WAYS) d = Math.min(d, polyEdge(x, z, [a, b])); return d; };
    const inPG = (x, z, pad = 0) => x > PG[0] - pad && x < PG[2] + pad && z > PG[1] - pad && z < PG[3] + pad;
    const free = (x, z, pad = 3.5) => Math.abs(x) < HX - 4 && Math.abs(z) < HZ - 4 && ell(x, z, PA + 2, PB + 2) > 1 && wayDist(x, z) > pad && !inPG(x, z, pad) && Math.hypot(x - AZ[0], z - AZ[1]) > 7;

    bare = (x, z) => inPG(x, z, 0.4) || wayDist(x, z) < 2 || (Math.abs(x - AZ[0]) < 3.2 && Math.abs(z - AZ[1]) < 3.2) || (x < -51 && x > -57 && Math.abs(Math.abs(z - C[1]) - 8) < 3);

    /* ---- 울타리와 문 ---- */
    const GATES = [[-64, C[1], 'z', 7, -PI / 2], [64, C[1], 'z', 7, PI / 2], [0, -91.5, 'x', 7, PI], [0, 91.5, 'x', 7, 0], [-64, 50, 'z', 5, -PI / 2]];
    const fence = (ax, c, u0, u1) => {   // ax 'x': z = c인 줄, 'z': x = c인 줄
      const n = Math.max(1, Math.round((u1 - u0) / 2.4));
      for (let i = 0; i <= n; i++) { const u = u0 + (u1 - u0) * i / n; B.geo(LOG, cyl(0.085, 0.1, 1.0, 7), ax === 'x' ? mat4(u, 0.5, c) : mat4(c, 0.5, u)); }
      for (const y of [0.42, 0.8]) (ax === 'x' ? B.box(LOG, u0, y, c - 0.04, u1, y + 0.09, c + 0.04, false) : B.box(LOG, c - 0.04, y, u0, c + 0.04, y + 0.09, u1, false));
      if (ax === 'x') addCollider(u0, 0, c - 0.1, u1, 1.0, c + 0.1); else addCollider(c - 0.1, 0, u0, c + 0.1, 1.0, u1);
    };
    for (const [ax, c, lim] of [['z', -64, 91.5], ['z', 64, 91.5], ['x', -91.5, 64], ['x', 91.5, 64]]) {
      const cuts = GATES.filter(g => g[2] === ax && Math.abs((ax === 'z' ? g[0] : g[1]) - c) < 0.1).map(g => [(ax === 'z' ? g[1] : g[0]) - g[3] / 2, (ax === 'z' ? g[1] : g[0]) + g[3] / 2]).sort((a, b) => a[0] - b[0]);
      let u = -lim; for (const [a, b] of cuts) { fence(ax, c, u, a); u = b; } fence(ax, c, u, lim);
    }
    GATES.forEach(([gx, gz, ax, w, ry], gi) => {
      for (const s of [-1, 1]) {
        const x = ax === 'z' ? gx : gx + s * w / 2, z = ax === 'z' ? gz + s * w / 2 : gz;
        B.box(M.stone, x - 0.28, 0, z - 0.28, x + 0.28, 1.9, z + 0.28); B.box(M.stone, x - 0.36, 1.9, z - 0.36, x + 0.36, 2.02, z + 0.36, false);
        B.geo(M.stone, new THREE.ConeGeometry(0.42, 0.26, 4).rotateY(PI / 4), mat4(x, 2.15, z));
        if (s === (ry === 0 || ry === PI / 2 ? -1 : 1) && gi !== 4) signBoard(B, gi % 2 ? 'せんじゅこうえん' : '千手公園', x + Math.sin(ry) * 0.29, 1.15, z + Math.cos(ry) * 0.29, ry, 0.3, 1.25, { vertical: true, both: false, bg: '#d9d4c6', depth: 0.02 });
      }
    });

    /* ---- 섬의 큰 나무 ---- */
    {
      const tg = treeGeometry(2001, { height: 54, depth: 6, sprays: 11, leaves: 8, leafLen: 1.05, spread: 1.1 });
      const GAP = 54 * 0.36 / 7, t0 = trunkAt(tg.wood, 0.3, GAP), tx = C[0] - t0.x, tz = C[1] - t0.z, ms = [mat4(tx, 0, tz)];
      inst(tg.wood, BARK, ms); inst(tg.leaves, mat('leaf', 0x3a7430), ms);
      for (let y = 0; y < 12; y += 1.5) { const t = trunkAt(tg.wood, y + 0.75, GAP), r = t.r * 0.8; addCollider(tx + t.x - r, y, tz + t.z - r, tx + t.x + r, y + 1.5, tz + t.z + r); }
      // 땅 위로 불거진 뿌리
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * PI * 2 + R() * 0.4, L = 4.6 + R() * 2.2, w = (R() - 0.5) * 1.2, pts = [];
        for (let k = 0; k <= 6; k++) { const t = k / 6, d = t0.r * 0.55 + L * t, sw = Math.sin(t * PI) * w; pts.push(V(C[0] + Math.cos(a) * d - Math.sin(a) * sw, 1.5 * (1 - t) ** 2.2 - 0.14 * t, C[1] + Math.sin(a) * d + Math.cos(a) * sw)); }
        B.geo(mat('wood', 0x7b6349), tube(pts, t => 0.62 * (1 - 0.74 * t), 7, false));
      }
      // 금줄(굵은 새끼줄)과 종이 오리
      const t2 = trunkAt(tg.wood, 2.3, GAP), rx = tx + t2.x, rz = tz + t2.z, rr = t2.r + 0.1;
      B.geo(STRAW, new THREE.TorusGeometry(rr, 0.13, 7, 36).rotateX(PI / 2), mat4(rx, 2.3, rz));
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * PI * 2, x = rx + Math.cos(a) * (rr + 0.12), z = rz + Math.sin(a) * (rr + 0.12), p = part(B, x, 2.2, z, -a + PI / 2);
        if (i % 2) { p(STRAW, cyl(0.02, 0.07, 0.42, 6), 0, -0.2, 0); }
        else for (let k = 0; k < 4; k++) p(PAPER, box(0.13, 0.15, 0.008), (k % 2 ? 0.05 : -0.05), -0.08 - k * 0.14, 0);
      }
      // 나무 앞의 알림판
      { const x = C[0] + 3.4, z = C[1] + 6.2; for (const s of [-1, 1]) B.box(LOG, x + s * 0.62 - 0.05, 0, z - 0.05, x + s * 0.62 + 0.05, 1.45, z + 0.05, false); signBoard(B, '千手公園の大樹', x, 1.22, z, 0, 1.3, 0.3, { both: false, bg: '#efe6cf' }); signBoard(B, '木に登らないこと', x, 0.9, z, 0, 1.3, 0.24, { both: false, bg: '#efe6cf', color: '#8a2a20' }); addCollider(x - 0.7, 0, z - 0.08, x + 0.7, 1.45, z + 0.08); }
      places.push({ n: '센주 공원의 큰 나무', t: '못 한가운데 섬에 선 아주 큰 나무. 공원이 생기기 전부터 이 자리에 있었다고 한다.', b: [C[0] - 9, C[0] + 9, C[1] - 9, C[1] + 9], y: [-1, 45] });
    }

    /* ---- 섬으로 건너가는 붉은 다리 ---- */
    {
      const z0 = C[1] + 7.6, z1 = C[1] + PB + 2.4, n = Math.round((z1 - z0) / 0.5), top = t => 0.18 + 1.25 * Math.sin(PI * t), HW = 1.3;
      for (let i = 0; i < n; i++) { const a = z0 + (z1 - z0) * i / n, b = z0 + (z1 - z0) * (i + 1) / n, y = top((i + 0.5) / n); B.box(M.floorDark, -HW, y - 0.14, a, HW, y, b); }
      const posts = 9;
      for (const s of [-1, 1]) {
        let prev = null;
        for (let k = 0; k <= posts; k++) {
          const t = k / posts, z = z0 + (z1 - z0) * t, y = top(t), x = s * (HW - 0.06);
          B.box(RED, x - 0.07, y - 0.2, z - 0.07, x + 0.07, y + 0.98, z + 0.07, false);
          if (k === 0 || k === posts) B.geo(mat('metal', 0x8a6a2a, { rough: 0.5 }), lathe([[0, 0], [0.1, 0.02], [0.11, 0.1], [0.07, 0.16], [0.1, 0.24], [0.04, 0.34], [0, 0.4]], 10), mat4(x, y + 0.98, z));
          if (prev) { for (const h of [0.9, 0.5]) beamBetween(B, RED, V(x, prev[1] + h, prev[0]), V(x, y + h, z), 0.09, 0.09); addCollider(x - 0.08, Math.min(prev[1], y), prev[0], x + 0.08, Math.max(prev[1], y) + 1.05, z); }
          prev = [z, y];
        }
        for (const t of [0.25, 0.5, 0.75]) B.geo(RED, cyl(0.11, 0.11, top(t) + 1.6, 8), mat4(s * (HW - 0.2), (top(t) - 1.6) / 2 - 0.14, z0 + (z1 - z0) * t));
      }
      for (const t of [0.25, 0.5, 0.75]) B.box(RED, -HW, top(t) - 0.34, z0 + (z1 - z0) * t - 0.08, HW, top(t) - 0.2, z0 + (z1 - z0) * t + 0.08, false);
    }

    /* ---- 못: 물가의 바위, 연잎, 잉어 ---- */
    {
      const ROCKG = new THREE.IcosahedronGeometry(1, 1);
      for (let i = 0; i < 22; i++) {
        const a = i / 22 * PI * 2 + R() * 0.2; if (Math.abs(a - PI / 2) < 0.22) continue;
        const k = 1.03 + R() * 0.03, s = 0.45 + R() * 0.7;
        B.geo(M.rock, ROCKG, new THREE.Matrix4().multiplyMatrices(mat4(C[0] + Math.cos(a) * PA * k, -0.1, C[1] + Math.sin(a) * PB * k, 0, R() * 6, 0), new THREE.Matrix4().makeScale(s * 1.3, s * 0.75, s)));
      }
      const PAD = new THREE.CircleGeometry(1, 12, 0.25, PI * 2 - 0.5).rotateX(-PI / 2), padM = mat('plain', 0x4f8a3c, { rough: 0.6 }), padMs = [];
      const PETAL = new THREE.ConeGeometry(0.05, 0.16, 5), pink = mat('plain', 0xf0a6c0, { rough: 0.6 });
      let tries = 0;
      while (padMs.length < 46 && tries++ < 900) {
        const a = R() * PI * 2, k = 0.55 + R() * 0.36, x = C[0] + Math.cos(a) * PA * k, z = C[1] + Math.sin(a) * PB * k;
        if (Math.hypot(x - C[0], z - C[1]) < 14 || (Math.abs(x) < 3 && z > C[1])) continue;
        const s = 0.22 + R() * 0.2; padMs.push(new THREE.Matrix4().multiplyMatrices(mat4(x, WY + 0.015, z, 0, R() * 6, 0), new THREE.Matrix4().makeScale(s, 1, s)));
        if (padMs.length % 6 === 0) { for (let p = 0; p < 7; p++) B.geo(pink, PETAL, mat4(x + Math.cos(p * 0.9) * 0.05, WY + 0.1, z + Math.sin(p * 0.9) * 0.05, Math.sin(p * 0.9) * 0.5, 0, -Math.cos(p * 0.9) * 0.5)); B.geo(mat('plain', 0xe9c765), SPH, mat4(x, WY + 0.1, z, 0, 0, 0, 0.035)); }
      }
      inst(PAD, padM, padMs, false);
      // 잉어: 못을 천천히 돈다
      const body = new THREE.SphereGeometry(1, 10, 7).scale(0.085, 0.07, 0.3), tail = new THREE.ConeGeometry(0.11, 0.2, 4).rotateX(-PI / 2).scale(0.25, 1, 1).translate(0, 0, -0.36), fin = new THREE.ConeGeometry(0.05, 0.12, 3).rotateX(PI).scale(0.3, 1, 1).translate(0, 0.07, 0);
      const koiG = mergeGeos([body, tail, fin]);
      const kois = [0xf2efe8, 0xe8642c, 0xd9a83a, 0xe8642c, 0xf2efe8, 0x2b2b2e, 0xe8642c, 0xd9a83a, 0xf2efe8].map((hex, i) => {
        const m = new THREE.Mesh(koiG, mat('plain', hex, { rough: 0.35 })); m.matrixAutoUpdate = false; holder.add(m);
        return { m, k: 0.52 + (i % 4) * 0.1, w: (i % 2 ? -1 : 1) * (0.045 + (i % 3) * 0.012), p: i * 0.71, s: 0.9 + (i % 3) * 0.25 };
      });
      const swim = t => { for (const f of kois) { const a = f.p + t * f.w, wob = Math.sin(t * 0.7 + f.p * 3) * 0.05, x = C[0] + Math.cos(a) * PA * (f.k + wob), z = C[1] + Math.sin(a) * PB * (f.k + wob), dx = -Math.sin(a) * PA * f.w, dz = Math.cos(a) * PB * f.w; f.m.matrix.copy(mat4(x, WY - 0.09, z, 0, Math.atan2(dx, dz) + Math.sin(t * 3 + f.p) * 0.12, 0, f.s)); } };
      swim(0); ticks.push(swim);
      places.push({ n: '센주 공원의 못', t: '큰 나무를 둘러싼 못. 연잎 사이로 잉어가 돈다.', b: [C[0] - PA, C[0] + PA, C[1] - PB, C[1] + PB], y: [-2, 3] });
    }

    /* ---- 돌등·가로등·걸상 ---- */
    const ishidoro = (x, z) => {
      B.geo(M.stone, cyl(0.34, 0.4, 0.16, 6), mat4(x, 0.08, z)); B.geo(M.stone, cyl(0.13, 0.16, 0.8, 8), mat4(x, 0.56, z)); B.geo(M.stone, cyl(0.3, 0.16, 0.14, 6), mat4(x, 1.03, z));
      for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) B.box(M.stone, x + dx * 0.17 - 0.04, 1.1, z + dz * 0.17 - 0.04, x + dx * 0.17 + 0.04, 1.42, z + dz * 0.17 + 0.04, false);
      B.geo(GLOW, box(0.26, 0.26, 0.26), mat4(x, 1.26, z)); B.geo(M.stone, new THREE.ConeGeometry(0.46, 0.3, 6), mat4(x, 1.57, z)); B.geo(M.stone, SPH, mat4(x, 1.76, z, 0, 0, 0, 0.08));
      addCollider(x - 0.3, 0, z - 0.3, x + 0.3, 1.8, z + 0.3); glows.push([x, 1.26, z, 0.55]);
    };
    for (const [x, z] of [[-2.3, C[1] + PB + 3.3], [2.3, C[1] + PB + 3.3], [-PA - 3.2, C[1] + 4], [PA + 3.2, C[1] - 4], [-6, C[1] - PB - 3.2], [AZ[0] - 4.6, AZ[1] + 4.2]]) ishidoro(x, z);
    const lamp = (x, z) => {
      B.geo(M.iron, cyl(0.06, 0.09, 3.3, 8), mat4(x, 1.65, z)); B.geo(M.iron, cyl(0.16, 0.16, 0.05, 8), mat4(x, 3.3, z));
      B.geo(GLOW, box(0.3, 0.38, 0.3), mat4(x, 3.52, z)); for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) B.geo(M.iron, box(0.03, 0.4, 0.03), mat4(x + dx * 0.15, 3.52, z + dz * 0.15));
      B.geo(M.iron, new THREE.ConeGeometry(0.34, 0.2, 4).rotateY(PI / 4), mat4(x, 3.82, z));
      addCollider(x - 0.1, 0, z - 0.1, x + 0.1, 3.9, z + 0.1); glows.push([x, 3.52, z, 0.85]); lights.push([x, 3.3, z, 18, 16]);
    };
    for (const [x, z] of [[-59, C[1] - 2.6], [59, C[1] + 2.6], [2.6, -86], [-2.6, 87], [-27, C[1] - 24], [27, C[1] + 23.5], [-27, C[1] + 23.5], [-20.6, 33.4], [20.6, 64.6], [-2.6, 26]]) lamp(x, z);
    const seat = (x, z, ry) => {   // 등받이 있는 걸상. 앉는 쪽이 +z
      const p = part(B, x, 0, z, ry);
      for (const s of [-1, 1]) { p(CONC, box(0.1, 0.42, 0.5), s * 0.7, 0.21, 0); p(CONC, box(0.1, 0.5, 0.08), s * 0.7, 0.65, -0.24, -0.16); }
      for (const dz of [-0.14, 0.02, 0.18]) p(LOG, box(1.7, 0.04, 0.13), 0, 0.45, dz);
      for (const dy of [0.62, 0.8]) p(LOG, box(1.7, 0.13, 0.035), 0, dy, -0.22 - (dy - 0.6) * 0.16, -0.16);
      solid(x, 0, z, ry, 1.7, 0.56, 0.9);
    };
    const zs = C[1] + RB * Math.sqrt(1 - (9 / RA) ** 2), xs = RA * Math.sqrt(1 - (8 / RB) ** 2);
    for (const s of [-1, 1]) { seat(s * 9, C[1] - (zs - C[1]) - 2.5, 0); seat(s * 9, zs + 2.5, PI); seat(-xs - 2.5, C[1] + s * 8, PI / 2); seat(xs + 2.5, C[1] + s * 8, -PI / 2); }
    for (const [x, z, ry] of [[-2.6, -64, PI / 2], [2.6, -72, -PI / 2], [-12, PG[1] + 1, 0], [13, PG[1] + 1, 0], [-12, PG[3] - 1, PI], [12, PG[3] - 1, PI], [PG[2] - 1, 40, -PI / 2], [PG[2] - 1, 52, -PI / 2]]) seat(x, z, ry);

    /* ---- 정자 ---- */
    {
      const [ax, az] = AZ, h = 2.6;
      B.box(M.stone, ax - 3, 0, az - 3, ax + 3, 0.22, az + 3);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { B.box(LOG, ax + sx * 2.4 - 0.1, 0.22, az + sz * 2.4 - 0.1, ax + sx * 2.4 + 0.1, 0.22 + h, az + sz * 2.4 + 0.1); B.box(M.stone, ax + sx * 2.4 - 0.18, 0.22, az + sz * 2.4 - 0.18, ax + sx * 2.4 + 0.18, 0.34, az + sz * 2.4 + 0.18, false); }
      for (const s of [-1, 1]) { B.box(LOG, ax - 2.6, 0.22 + h - 0.2, az + s * 2.4 - 0.07, ax + 2.6, 0.22 + h, az + s * 2.4 + 0.07, false); B.box(LOG, ax + s * 2.4 - 0.07, 0.22 + h - 0.2, az - 2.6, ax + s * 2.4 + 0.07, 0.22 + h, az + 2.6, false); }
      hipRoof(B, TILE, ax - 2.5, az - 2.5, ax + 2.5, az + 2.5, 0.22 + h, 1.5, { over: 0.9 });
      benchAt(B, LOG, ax, 0.22, az - 2.05, 0, 3.6); benchAt(B, LOG, ax + 2.05, 0.22, az + 0.2, PI / 2, 3.2);
      for (const y of [0.6, 0.95]) { B.box(LOG, ax - 2.3, 0.22 + y, az - 2.44, ax + 2.3, 0.3 + y, az - 2.36, false); B.box(LOG, ax + 2.36, 0.22 + y, az - 2.3, ax + 2.44, 0.3 + y, az + 2.3, false); }
      addCollider(ax - 2.4, 0.22, az - 2.5, ax + 2.4, 1.3, az - 2.34); addCollider(ax + 2.34, 0.22, az - 2.4, ax + 2.5, 1.3, az + 2.4);
      B.box(M.beamLight, ax - 3.3, 0.22 + h, az - 3.3, ax + 3.3, 0.22 + h + 0.05, az + 3.3, false);   // 천장(지붕 속이 들여다보이지 않게)
      hangLamp(B, ax, 0.22 + h, az, 0.1, glows, lights, 14);
      places.push({ n: '공원의 정자', t: '못을 내려다보며 쉬어 가는 정자.', b: [ax - 3, ax + 3, az - 3, az + 3], y: [0, 5] });
    }

    /* ---- 나무: 벚나무는 못 둘레에, 큰 나무들은 빈 풀밭에 ---- */
    {
      const sg = treeGeometry(77, { height: 8.5, depth: 4, sprays: 7, leaves: 7, leafLen: 0.32, spread: 1.3 }), sm = [];
      for (let i = 0; i < 16; i++) {
        const a = (i + 0.5) / 16 * PI * 2, x = C[0] + Math.cos(a) * (RA + 6.5), z = C[1] + Math.sin(a) * (RB + 6.5);
        if (!free(x, z, 3) || Math.hypot(x - AZ[0], z - AZ[1]) < 9) continue;
        sm.push(mat4(x, 0, z, 0, R() * 6.28, 0, 0.9 + R() * 0.3)); addCollider(x - 0.3, 0, z - 0.3, x + 0.3, 5, z + 0.3);
      }
      inst(sg.wood, mat('bark', 0x5c483c), sm); inst(sg.leaves, mat('leaf', 0xf3b4c9), sm);
      const tm = grove(B, holder, 2024, 46, [-HX, -HZ, HX, HZ], (x, z) => free(x, z, 5) && ell(x, z, RA + 12, RB + 12) > 1, 11);
      for (let i = 0; i < tm.length; i += 3) B.geo(mat('leaf', 0x3f7a30), BUSH.leaves, mat4(tm[i][0] + 2.2, 0, tm[i][1] + 1.4, 0, i, 0, 1.1));
    }

    /* ---- 꽃밭: 서쪽 문 안쪽 양옆 ---- */
    {
      const FL = new THREE.SphereGeometry(0.07, 6, 4), hexes = [0xf2efe6, 0xe9c765, 0xe58aa0, 0xd0483a, 0xb07ad0], fm = [], fc = [];
      for (const s of [-1, 1]) {
        const x = -54, z = C[1] + s * 8;
        B.geo(M.stone, new THREE.TorusGeometry(2.6, 0.16, 6, 28).rotateX(PI / 2), mat4(x, 0.1, z)); B.geo(mat('dirt', 0x6a5238), cyl(2.55, 2.55, 0.14, 28), mat4(x, 0.07, z));
        for (let i = 0; i < 7; i++) { const a = i / 7 * PI * 2, d = i ? 1.5 : 0; B.geo(mat('leaf', 0x4c8a3a), BUSH.leaves, mat4(x + Math.cos(a) * d, 0.1, z + Math.sin(a) * d, 0, a, 0, 0.42)); }
        for (let i = 0; i < 110; i++) { const a = R() * PI * 2, d = Math.sqrt(R()) * 2.3; fm.push(mat4(x + Math.cos(a) * d, 0.36 + R() * 0.2, z + Math.sin(a) * d)); fc.push(hexes[Math.floor(d * 2 + s + 2) % 5]); }
        addCollider(x - 2.4, 0, z - 2.4, x + 2.4, 0.5, z + 2.4);
      }
      const im = inst(FL, mat('plain', 0xffffff, { rough: 0.7 }), fm, false), col = new THREE.Color(); fc.forEach((h, i) => im.setColorAt(i, col.setHex(h))); im.instanceColor.needsUpdate = true;
    }

    /* ---- 놀이터 ---- */
    {
      const BLUE = PAINT(0x3f6fb5), YEL = PAINT(0xe2b93a), RD = PAINT(0xc9442f), GRN = PAINT(0x4f9a56), STEEL = mat('metal', 0xb9bec2, { rough: 0.35 });
      const pipe = (m, a, b, r = 0.03) => B.geo(m, tube([a, b], r, 7, true));
      // 그네 둘
      {
        const x = -14, z = 39.5, H = 2.4;
        for (const s of [-1, 1]) { for (const d of [-1, 1]) pipe(BLUE, V(x + s * 2.2, H, z), V(x + s * 2.2, 0, z + d * 1.1), 0.045); addCollider(x + s * 2.2 - 0.08, 0, z - 1.1, x + s * 2.2 + 0.08, 1.2, z - 0.7); addCollider(x + s * 2.2 - 0.08, 0, z + 0.7, x + s * 2.2 + 0.08, 1.2, z + 1.1); }
        pipe(BLUE, V(x - 2.3, H, z), V(x + 2.3, H, z), 0.045);
        [[-1, 0.0], [1, 0.42]].forEach(([s, sw]) => {
          const L = 1.9, sy = H - Math.cos(sw) * L, sz = z + Math.sin(sw) * L, sx = x + s * 1.0;
          for (const d of [-1, 1]) pipe(M.iron, V(sx + d * 0.22, H, z), V(sx + d * 0.22, sy, sz), 0.012);
          B.geo(RD, box(0.52, 0.04, 0.2), mat4(sx, sy, sz, -sw, 0, 0)); addCollider(sx - 0.26, sy - 0.05, sz - 0.1, sx + 0.26, sy + 0.05, sz + 0.1);
        });
        for (const d of [-1, 1]) { pipe(YEL, V(x - 2.6, 0.5, z + d * 2.3), V(x + 2.6, 0.5, z + d * 2.3), 0.03); for (const s of [-1, 0, 1]) pipe(YEL, V(x + s * 2.6, 0.5, z + d * 2.3), V(x + s * 2.6, 0, z + d * 2.3), 0.03); addCollider(x - 2.6, 0, z + d * 2.3 - 0.04, x + 2.6, 0.55, z + d * 2.3 + 0.04); }
      }
      // 미끄럼틀: 서쪽 계단으로 올라 동쪽으로 내려온다
      {
        const x = -3, z = 49, T = 1.8, n = 6;
        B.box(YEL, x - 0.6, T - 0.06, z - 0.6, x + 0.6, T, z + 0.6); for (const sx of [-1, 1]) for (const sz of [-1, 1]) pipe(BLUE, V(x + sx * 0.56, 0, z + sz * 0.56), V(x + sx * 0.56, T + 0.9, z + sz * 0.56), 0.035);
        for (const sz of [-1, 1]) { pipe(BLUE, V(x - 0.56, T + 0.9, z + sz * 0.56), V(x + 0.56, T + 0.9, z + sz * 0.56), 0.03); pipe(BLUE, V(x - 0.56, T + 0.45, z + sz * 0.56), V(x + 0.56, T + 0.45, z + sz * 0.56), 0.02); addCollider(x - 0.6, T, z + sz * 0.56 - 0.04, x + 0.6, T + 0.95, z + sz * 0.56 + 0.04); }
        for (let k = 0; k < n; k++) { const xa = x - 0.6 - (n - k) * 0.36, y = T * (k + 1) / (n + 1); B.box(BLUE, xa, y - 0.05, z - 0.42, xa + 0.36, y, z + 0.42); }
        for (const sz of [-1, 1]) { pipe(YEL, V(x - 0.6 - n * 0.36, 0.95, z + sz * 0.45), V(x - 0.56, T + 0.9, z + sz * 0.45), 0.025); pipe(YEL, V(x - 0.6 - n * 0.36, 0, z + sz * 0.45), V(x - 0.6 - n * 0.36, 0.95, z + sz * 0.45), 0.025); addCollider(x - 0.6 - n * 0.36, 0, z + sz * 0.45 - 0.03, x - 0.6, T + 0.9, z + sz * 0.45 + 0.03); }
        const L = 4.2, p0 = V(x + 0.6, T - 0.03, z), p1 = V(x + 0.6 + L, 0.22, z);
        beamBetween(B, STEEL, p0, p1, 0.74, 0.04); for (const sz of [-1, 1]) beamBetween(B, RD, V(p0.x, p0.y + 0.1, z + sz * 0.39), V(p1.x, p1.y + 0.1, z + sz * 0.39), 0.05, 0.24);
        B.box(STEEL, p1.x, 0.2, z - 0.37, p1.x + 0.7, 0.24, z + 0.37, false); pipe(BLUE, V(p1.x + 0.5, 0.2, z), V(p1.x + 0.5, 0, z), 0.03); pipe(BLUE, V(x + 0.6 + L * 0.5, T * 0.5, z), V(x + 0.6 + L * 0.5, 0, z), 0.03);
        for (let k = 0; k < 9; k++) { const xa = p0.x + L * k / 9, y = T - (T - 0.22) * (k + 0.5) / 9; addCollider(xa, y - 0.3, z - 0.37, xa + L / 9, y, z + 0.37); }
        for (const sz of [-1, 1]) for (let k = 0; k < 9; k++) { const xa = p0.x + L * k / 9, y = T - (T - 0.22) * (k + 0.5) / 9; addCollider(xa, y, z + sz * 0.4 - 0.03, xa + L / 9, y + 0.3, z + sz * 0.4 + 0.03); }
      }
      // 시소 둘
      [[11, 38.5, 0.2, RD, BLUE], [11, 41.7, -0.2, GRN, YEL]].forEach(([x, z, tilt, c1, c2]) => {
        B.geo(BLUE, cyl(0.07, 0.1, 0.5, 8), mat4(x, 0.25, z)); B.geo(M.iron, cyl(0.03, 0.03, 0.5, 6).rotateX(PI / 2), mat4(x, 0.5, z));
        const p = (m, g, lx, ly, lz) => B.geo(m, g, new THREE.Matrix4().multiplyMatrices(mat4(x, 0.55, z, 0, 0, tilt), mat4(lx, ly, lz)));
        p(LOG, box(3.4, 0.05, 0.26), 0, 0, 0); p(c1, box(0.5, 0.03, 0.3), -1.42, 0.04, 0); p(c2, box(0.5, 0.03, 0.3), 1.42, 0.04, 0);
        for (const s of [-1, 1]) { p(M.iron, cyl(0.014, 0.014, 0.24, 5), s * 1.05, 0.14, 0); p(M.iron, cyl(0.014, 0.014, 0.3, 5).rotateX(PI / 2), s * 1.05, 0.26, 0); }
        B.geo(mat('plain', 0x2a2a2c, { rough: 0.9 }), cyl(0.2, 0.2, 0.1, 10).rotateX(PI / 2), mat4(x + (tilt > 0 ? -1.55 : 1.55), 0.1, z));
        addCollider(x - 1.7, 0, z - 0.15, x + 1.7, 0.75, z + 0.15);
      });
      // 정글짐
      {
        const x = 14.5, z = 56, c = 0.55, n = 4, cols = [RD, YEL, BLUE, GRN];
        for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) pipe(cols[(i + j) % 4], V(x + (i - 2) * c, 0, z + (j - 2) * c), V(x + (i - 2) * c, (i % 4 && j % 4 ? 2.2 : 1.65), z + (j - 2) * c), 0.022);
        for (let l = 1; l <= 4; l++) for (let i = 0; i <= n; i++) {
          const y = l * c, in4 = l === 4; if (in4 && !(i % 4)) continue;
          pipe(cols[l % 4], V(x - (in4 ? 1 : 2) * c, y, z + (i - 2) * c), V(x + (in4 ? 1 : 2) * c, y, z + (i - 2) * c), 0.02);
          pipe(cols[(l + 1) % 4], V(x + (i - 2) * c, y, z - (in4 ? 1 : 2) * c), V(x + (i - 2) * c, y, z + (in4 ? 1 : 2) * c), 0.02);
        }
        addCollider(x - 1.12, 0, z - 1.12, x + 1.12, 1.65, z + 1.12);
      }
      // 철봉 셋(낮은 것부터)
      {
        const x = -18, z = 55;
        [0.95, 1.25, 1.6].forEach((h, i) => { pipe(STEEL, V(x + i * 1.5, h, z), V(x + (i + 1) * 1.5, h, z), 0.018); });
        for (let i = 0; i <= 3; i++) { const h = [0.95, 1.25, 1.6, 1.6][i] + 0.1; B.geo(BLUE, cyl(0.045, 0.045, h, 8), mat4(x + i * 1.5, h / 2, z)); addCollider(x + i * 1.5 - 0.06, 0, z - 0.06, x + i * 1.5 + 0.06, h, z + 0.06); }
        for (let i = 0; i < 3; i++) addCollider(x + i * 1.5, [0.95, 1.25, 1.6][i] - 0.05, z - 0.03, x + (i + 1) * 1.5, [0.95, 1.25, 1.6][i] + 0.03, z + 0.03);
      }
      // 모래밭: 모래성과 들통, 삽
      {
        const x0 = -3, z0 = 57, x1 = 3, z1 = 62, SD = mat('dirt', 0xead9a8);
        B.box(SD, x0, 0, z0, x1, 0.1, z1, false);
        for (const [a, b, c, d] of [[x0 - 0.16, z0 - 0.16, x1 + 0.16, z0], [x0 - 0.16, z1, x1 + 0.16, z1 + 0.16], [x0 - 0.16, z0, x0, z1], [x1, z0, x1 + 0.16, z1]]) B.box(LOG, a, 0, b, c, 0.2, d, false);
        for (const [mx, mz, s] of [[-1, 58.4, 0.7], [1.9, 60.8, 0.5], [-1.6, 61, 0.4]]) B.geo(SD, SPH, new THREE.Matrix4().multiplyMatrices(mat4(mx, 0.08, mz), new THREE.Matrix4().makeScale(s, s * 0.32, s)));
        { const cx = 0.4, cz = 59.2; B.geo(SD, cyl(0.5, 0.58, 0.26, 14), mat4(cx, 0.22, cz)); for (let i = 0; i < 4; i++) { const a = i * PI / 2 + PI / 4; B.geo(SD, cyl(0.13, 0.15, 0.5, 8), mat4(cx + Math.cos(a) * 0.44, 0.34, cz + Math.sin(a) * 0.44)); B.geo(SD, new THREE.ConeGeometry(0.15, 0.2, 8), mat4(cx + Math.cos(a) * 0.44, 0.69, cz + Math.sin(a) * 0.44)); } B.geo(SD, cyl(0.2, 0.24, 0.4, 8), mat4(cx, 0.55, cz)); B.geo(SD, new THREE.ConeGeometry(0.24, 0.26, 8), mat4(cx, 0.88, cz)); pipe(LOG, V(cx, 1.0, cz), V(cx, 1.22, cz), 0.006); B.geo(RD, box(0.12, 0.08, 0.004), mat4(cx + 0.06, 1.17, cz)); }
        B.geo(RD, new THREE.CylinderGeometry(0.13, 0.1, 0.2, 12, 1, true), mat4(1.5, 0.2, 58.2)); B.geo(RD, cyl(0.1, 0.1, 0.01, 12), mat4(1.5, 0.105, 58.2)); B.geo(M.iron, new THREE.TorusGeometry(0.13, 0.006, 4, 12, PI), mat4(1.5, 0.3, 58.2));
        { const p = part(B, 2.1, 0.12, 58.9, 0.7); p(YEL, box(0.03, 0.02, 0.3), 0, 0.02, 0, 0.3); p(YEL, box(0.1, 0.015, 0.14), 0, -0.02, 0.2, 0.3); }
        B.geo(PAINT(0xd0483a), SPH, mat4(5.2, 0.18, 56.2, 0, 0, 0, 0.15));
      }
      // 토관 셋
      {
        const x = -11, z = 62, PG_ = lathe([[0.48, -1.1], [0.6, -1.1], [0.6, 1.1], [0.48, 1.1], [0.48, -1.1]], 20).rotateZ(PI / 2);
        for (const [dz, y] of [[-0.62, 0.6], [0.62, 0.6], [0, 1.66]]) B.geo(CONC, PG_, mat4(x, y, z + dz));
        addCollider(x - 1.1, 0, z - 1.22, x + 1.1, 1.2, z + 1.22); addCollider(x - 1.1, 1.06, z - 0.6, x + 1.1, 2.26, z + 0.6);
      }
      // 수리검 과녁: 아이들이 닌자 놀이를 하던 자리
      {
        const x = 20.6, z = 46, p = part(B, x, 0, z, -PI / 2);
        p(LOG, box(0.12, 1.9, 0.12), 0, 0.95, -0.08); p(LOG, cyl(0.5, 0.5, 0.08, 20).rotateX(PI / 2), 0, 1.5, 0);
        [[0.46, 0xf2efe6], [0.32, 0x2b2b2e], [0.18, 0xf2efe6], [0.07, 0xc9442f]].forEach(([r, hex], i) => p(mat('plain', hex, { rough: 0.8 }), new THREE.CircleGeometry(r, 20), 0, 1.5, 0.042 + i * 0.002));
        for (const [sx, sy, rz] of [[0.12, 0.1, 0.4], [-0.22, -0.16, 1.1], [0.3, -0.28, 0.2]]) for (const a of [0, PI / 4]) p(M.iron, box(0.15, 0.03, 0.006), sx, 1.5 + sy, 0.07, 0.25, 0.2, rz + a);
        p(M.iron, new THREE.ConeGeometry(0.02, 0.16, 4).rotateX(-PI / 2), -0.04, 1.47, 0.1); p(M.iron, cyl(0.012, 0.012, 0.1, 5).rotateX(PI / 2), -0.04, 1.47, 0.22); p(M.iron, new THREE.TorusGeometry(0.022, 0.006, 4, 10), -0.04, 1.47, 0.29);
        p(M.iron, box(0.15, 0.006, 0.03), -0.9, 0.045, 1.4, 0, 0.6); p(M.iron, box(0.03, 0.006, 0.15), -0.9, 0.045, 1.4, 0, 0.6);
        addCollider(x - 0.1, 0, z - 0.5, x + 0.12, 2.0, z + 0.5);
      }
      // 땅에 그린 동그라미 놀이(켄켄파)
      { const RING = new THREE.RingGeometry(0.3, 0.34, 20).rotateX(-PI / 2), wm = mat('plain', 0xf2efe6, { rough: 0.9 }); let z = 43.2; for (const k of [1, 1, 2, 1, 2, 1]) { for (let i = 0; i < k; i++) B.geo(wm, RING, mat4(5 + (k === 2 ? (i ? 0.38 : -0.38) : 0), 0.045, z)); z += 0.78; } }
      // 시계 기둥과 마실 물
      {
        const x = 2.8, z = 27; B.geo(M.iron, cyl(0.05, 0.08, 3.4, 8), mat4(x, 1.7, z)); B.geo(PAINT(0xf2efe6), cyl(0.36, 0.36, 0.16, 20).rotateZ(PI / 2), mat4(x, 3.6, z)); B.geo(M.iron, new THREE.TorusGeometry(0.36, 0.03, 6, 20).rotateY(PI / 2), mat4(x, 3.6, z));
        for (const s of [-1, 1]) { for (let i = 0; i < 12; i++) { const a = i / 12 * PI * 2; B.geo(M.iron, box(0.006, i % 3 ? 0.04 : 0.07, 0.014), mat4(x + s * 0.083, 3.6 + Math.cos(a) * 0.29, z + Math.sin(a) * 0.29, a, 0, 0)); } B.geo(M.iron, box(0.008, 0.2, 0.02), mat4(x + s * 0.086, 3.6 + 0.07, z + s * 0.045, s * 0.6, 0, 0)); B.geo(M.iron, box(0.008, 0.27, 0.014), mat4(x + s * 0.088, 3.6 + 0.02, z - s * 0.12, -s * 1.4, 0, 0)); }
        addCollider(x - 0.08, 0, z - 0.08, x + 0.08, 3.4, z + 0.08);
        const fx = -6.2, fz = 27; B.box(CONC, fx - 0.25, 0, fz - 0.25, fx + 0.25, 0.85, fz + 0.25); B.geo(STEEL, cyl(0.2, 0.14, 0.06, 14), mat4(fx, 0.88, fz)); B.geo(STEEL, cyl(0.015, 0.015, 0.1, 6), mat4(fx, 0.95, fz)); B.geo(STEEL, SPH, mat4(fx, 1.0, fz, 0, 0, 0, 0.03));
        B.geo(STEEL, cyl(0.012, 0.012, 0.14, 6).rotateX(PI / 2), mat4(fx, 0.45, fz + 0.3)); B.geo(STEEL, cyl(0.03, 0.03, 0.02, 8), mat4(fx, 0.47, fz + 0.36)); B.box(CONC, fx - 0.3, 0, fz + 0.25, fx + 0.3, 0.06, fz + 0.75, false);
      }
      places.push({ n: '센주 공원 놀이터', t: '그네, 미끄럼틀, 시소, 정글짐, 철봉, 모래밭, 토관이 있는 놀이터. 과녁에는 아이들이 던진 수리검이 꽂혀 있다.', b: [PG[0], PG[2], PG[1], PG[3]], y: [0, 5] });
    }
    return { places, glows, lights, jumps: [['센주 공원', -57, 0, C[1], -PI / 2, 91], ['센주 공원 놀이터', 0, 0, PG[1] - 2, PI, 92]] };
  });
  // 공원 터에는 숲의 나무를 심지 않는다(나무는 여기서 심었다)
  for (let x = -HX + 7; x < HX; x += 13) for (let z = -HZ + 7; z < HZ; z += 13) OPEN.push([at.x + x, at.z + z, 11.5]);
  BARE.push((x, z) => Math.abs(x - at.x) < HX && Math.abs(z - at.z) < HZ && bare(x - at.x, z - at.z));   // 흙길과 모래 마당에는 풀포기가 나지 않는다
  out.places.push({ n: '센주 공원', t: '센주 일족의 이름이 붙은 큰 공원. 못에 둘러싸인 큰 나무와 놀이터가 있다.', poly: Z.poly, b: bound(Z.poly) }, ...res.places);
  out.jumps.push(...res.jumps); out.glows.push(...res.glows); out.lights.push(...res.lights); out.ticks.push(...ticks);
}
/* ============================ 중급닌자 시험 경기장 ============================
   중급닌자 선발 시험의 본선이 열리는 둥근 경기장. 높은 벽에 둘러싸인 흙 마당을 계단식 관람석이 빙 두른다.
   나루토 위키에는 이 건물만 다룬 글이 없다. 아래는 만화의 본선 장면을 떠올려 옮긴 것이다(위키로 확인하지 못함):
   둥근 흙 마당과 높은 벽, 계단식 관람석, 호카게와 카제카게가 앉던 지붕 있는 자리, 선수들이 기다리던 난간 자리,
   마당 한쪽의 나무, 나루토가 네지와 싸울 때 판 땅굴 구멍, 본선 대진.
   지어낸 것: 크기와 문의 자리, 관람석으로 오르는 계단 통로, 벽 위의 깃발, 벽의 싸움 자국이 난 자리. */
function arena(scene, out) {
  const Z = zone(31), at = { x: Z.at[0], z: Z.at[1], ry: 0 };
  const RF = 22, RW = 24.5, RB = 35.7, RO = 36.5, TD = 0.95, TH = 0.45, NT = 11, WALK = 5, TOP = 12.5;
  const tr = i => RW + TD * i, ty = i => WALK + TH * (i + 1);      // 관람석 단 i의 안쪽 반지름과 윗면 높이
  const res = put(scene, at, (B, holder) => {
    const places = [], glows = [], lights = [];
    const WALLM = mat('plaster', 0xd9cdb0), STONE = M.stone, STEP = mat('plain', 0xb9b2a0, { rough: 0.95 }), STEP2 = mat('plain', 0xa9a290, { rough: 0.95 }), DIRT = mat('dirt', 0xcdbb8e);
    const TILE = mat('tile', 0x3f5a52, { rough: 0.6 }), LOG = mat('wood', 0x7a5a3c), RED = mat('plain', 0xa8382c, { rough: 0.7 }), DARK = mat('plain', 0x24211e, { rough: 1 });
    const inst = (g, m, ms) => { const im = new THREE.InstancedMesh(g, m, ms.length); ms.forEach((q, i) => im.setMatrixAt(i, q)); im.instanceMatrix.needsUpdate = true; im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); holder.add(im); return im; };
    const S = PI / 2, TW = 2.5;                                    // 남쪽(정문) 각도, 정문 굴의 반 너비
    const dS = Math.asin(TW / RF), dSo = Math.asin(TW / RB), dBal = Math.asin(5 / RF);

    /* ---- 마당 ---- */
    B.geo(DIRT, new THREE.CircleGeometry(RF, 72).rotateX(-PI / 2), mat4(0, 0.03, 0));
    // 마당 벽(관람석 앞 난간까지). 정문 굴과 그 위 선수 대기석 자리는 뚫는다
    roundWall(B, WALLM, 0, 0, RF, RF + 0.4, 0, WALK + 1, [
      { a0: S - dBal, a1: S - dS, ys: [[WALK, WALK + 1]] }, { a0: S - dS, a1: S + dS, ys: [[0, 3.6], [WALK, WALK + 1]] }, { a0: S + dS, a1: S + dBal, ys: [[WALK, WALK + 1]] }]);
    roundWall(B, STONE, 0, 0, RF - 0.06, RF + 0.46, WALK + 1, WALK + 1.08, [{ a0: S - dBal, a1: S + dBal, ys: [[WALK + 1, WALK + 1.08]] }], { collide: false });
    roundWall(B, STONE, 0, 0, RF - 0.05, RF, 0, 0.9, [{ a0: S - dS, a1: S + dS, ys: [[0, 0.9]] }], { collide: false });

    /* ---- 관람석 ---- */
    roundWall(B, STEP, 0, 0, RF + 0.4, RW, WALK - TH, WALK, []);                                   // 앞 통로
    for (let i = 0; i < NT; i++) {
      const r0 = tr(i), r1 = i === NT - 1 ? RB : tr(i + 1), y = ty(i), da = 1.25 / r0;
      const ops = i < 3 ? [0, PI].map(a => ({ a0: a - da, a1: a + da, ys: [[y - TH * 2, y]] })) : [];   // 동·서 계단 통로가 올라오는 자리
      roundWall(B, i % 2 ? STEP2 : STEP, 0, 0, r0, r1, y - TH * 2, y, ops);
    }
    // 바깥벽: 문 셋(남쪽 정문, 동·서 계단 통로)과 위쪽에 줄지은 창
    {
      const ops = [{ a0: S - dSo, a1: S + dSo, ys: [[0, 3.6]] }, ...[0, PI].map(a => ({ a0: a - 1.25 / RB, a1: a + 1.25 / RB, ys: [[0, 3]] }))];
      for (let k = 0; k < 24; k++) { const a = (k + 0.5) / 24 * PI * 2; ops.push({ a0: a - 0.036, a1: a + 0.036, ys: [[10.7, 11.9]] }); }
      roundWall(B, WALLM, 0, 0, RB, RO, 0, TOP, ops);
      roundWall(B, STONE, 0, 0, RO, RO + 0.07, 0, 1.2, ops.slice(0, 3).map(o => ({ ...o, ys: [[0, 1.2]] })), { collide: false });
      roundWall(B, STONE, 0, 0, RB - 0.06, RO + 0.1, 9.9, 10.1, [], { collide: false });
      for (let k = 0; k < 24; k++) { const a = k / 24 * PI * 2; if (k % 6 === 0 || k === 6) continue; B.geo(WALLM, box(0.5, TOP, 0.7), mat4(Math.cos(a) * (RO + 0.2), TOP / 2, Math.sin(a) * (RO + 0.2), 0, -a, 0)); }
      coneRoof(B, TILE, 0, 0, RO + 0.8, TOP, 0.8, { rTop: RB - 0.7, seg: 48, detail: 2, cap: false, soffit: false });
      // 벽 위의 깃발
      for (let k = 0; k < 12; k++) {
        const a = (k + 0.5) / 12 * PI * 2, x = Math.cos(a) * (RB + 0.4), z = Math.sin(a) * (RB + 0.4);
        B.geo(M.iron, cyl(0.035, 0.045, 3.2, 6), mat4(x, TOP + 2.2, z)); B.geo(mat('cloth', k % 2 ? 0x3f7a4a : 0xb5392b), new THREE.PlaneGeometry(1.5, 0.95), mat4(x - Math.sin(a) * 0.78, TOP + 3.25, z + Math.cos(a) * 0.78, 0, -a + PI / 2, 0));
      }
    }

    /* ---- 남쪽 정문: 관람석 밑을 지나 마당으로 나가는 굴 ---- */
    {
      for (const s of [-1, 1]) B.box(WALLM, s * TW, 0, RF + 0.2, s * (TW + 0.4), 4, RB + 0.2);
      B.box(WALLM, -TW - 0.4, 3.6, RF + 0.2, TW + 0.4, 4, RB + 0.2, false);
      B.box(mat('dirt', 0xb7a67e), -TW, 0, RF - 0.2, TW, 0.035, RO + 3, false);
      signBoard(B, '中忍選抜試験　本選会場', 0, 4.75, RO + 0.06, 0, 7.5, 0.95, { both: false });
      for (const s of [-1, 1]) {   // 활짝 열어 둔 문짝
        B.box(LOG, s * (TW + 0.05), 0, RO, s * (TW + 0.2), 3.5, RO + 2.45); for (const y of [0.5, 1.75, 3.0]) B.box(M.iron, s * (TW + 0.03), y, RO + 0.05, s * (TW + 0.22), y + 0.12, RO + 2.4, false);
        hangLamp(B, 0, 3.6, RF + 3.5 + (s + 1) * 3.5, 0.2, glows, lights, 12);
      }
      // 본선 대진표
      const LINES = ['本選　組み合わせ', 'うずまきナルト　対　日向ネジ', '我愛羅　対　うちはサスケ', 'カンクロウ　対　油女シノ', 'テマリ　対　奈良シカマル'];
      B.box(LOG, -TW + 0.0, 1.0, 26.6, -TW + 0.05, 3.2, 31.4, false);
      LINES.forEach((t, i) => signBoard(B, t, -TW + 0.07, 2.95 - i * 0.42, 29, PI / 2, 4.4, i ? 0.36 : 0.4, { both: false, bg: i ? '#efe6cf' : '#2b2622', color: i ? '#1a1410' : '#efe6cf', depth: 0.02 }));
    }

    /* ---- 선수 대기석: 정문 굴 위의 난간 자리와 마당으로 내려가는 계단 ---- */
    {
      const z0 = 19.6;
      B.box(STEP, -5, WALK - 0.3, z0, 5, WALK, 21.7); B.box(STEP, -3.2, WALK - 0.3, 21.7, 3.2, WALK, RF + 0.4);
      for (const x of [-4.6, 2.9]) B.box(STONE, x - 0.2, 0, z0 + 0.1, x + 0.2, WALK - 0.3, z0 + 0.5);
      bars(B, M.iron, 'x', z0 + 0.05, -5, 3.6, WALK, WALK + 1.05); bars(B, M.iron, 'z', -4.95, z0, 21.3, WALK, WALK + 1.05); bars(B, M.iron, 'z', 4.95, z0, 21.3, WALK, WALK + 1.05);
      for (let k = 0; k < 20; k++) { const zb = z0 - 0.45 * k, y = WALK - 0.25 * (k + 1); B.box(STEP2, 3.7, 0, zb - 0.45, 5, y, zb); }
      for (const x of [3.7, 5]) { beamBetween(B, M.iron, V(x, WALK + 0.95, z0), V(x, 0.95, z0 - 9), 0.05, 0.05); for (let k = 0; k <= 4; k++) B.geo(M.iron, cyl(0.02, 0.02, 0.95, 5), mat4(x, WALK + 0.475 - k * 1.25, z0 - k * 2.25)); }
      places.push({ n: '선수 대기석', t: '본선에 오른 선수들이 제 차례를 기다리던 자리. 계단으로 마당에 내려간다.', b: [-5, 5, z0, 22], y: [WALK - 0.5, WALK + 3] });
    }

    /* ---- 동·서 계단 통로: 바깥에서 관람석 앞 통로로 오른다 ---- */
    for (const s of [-1, 1]) {
      for (let k = 0; k < 23; k++) { const xo = RO - 0.5 * k; B.box(STEP2, s * (xo - 0.5), 0, -1.25, s * xo, WALK * (k + 1) / 23, 1.25); }
      B.box(STEP2, s * (RW - 0.1), 0, -1.25, s * (RO - 11.5), WALK, 1.25);
      for (let i = 0; i < NT; i++) for (const sz of [-1, 1]) B.box(WALLM, s * tr(i), 0, sz * 1.25, s * (i === NT - 1 ? RB : tr(i + 1)), ty(i) - TH * 2 + 0.05, sz * 1.6);
      signBoard(B, s > 0 ? '東　観覧席' : '西　観覧席', s * (RO + 0.06), 3.45, 0, s * PI / 2, 2.4, 0.6, { both: false });
    }

    /* ---- 카게석: 북쪽 관람석 꼭대기의 지붕 있는 자리 ---- */
    {
      const Y = ty(NT - 1) + 0.1, z0 = -RB, z1 = -29;
      B.box(STONE, -4.5, 7.2, z0, 4.5, Y, z1);
      B.box(WALLM, -4.5, Y, z1 - 0.3, 4.5, Y + 1.0, z1); for (const s of [-1, 1]) B.box(WALLM, s * 4.2, Y, -34, s * 4.5, Y + 1.0, z1);
      for (const s of [-1, 1]) for (const z of [z1 - 0.15, z0 + 0.3]) B.box(RED, s * 4.35 - 0.13, Y, z - 0.13, s * 4.35 + 0.13, Y + 3.55, z + 0.13, false);
      B.box(M.beamLight, -5, Y + 3.5, z0 - 0.2, 5, Y + 3.56, z1 + 0.4, false);
      hipRoof(B, TILE, -4.7, z0 - 0.1, 4.7, z1 + 0.1, Y + 3.56, 1.9, { over: 0.8 });
      signBoard(B, '火', -2.1, 8.9, z1 + 0.04, 0, 1.5, 1.5, { both: false, bg: '#b5392b', color: '#f4efe2' }); signBoard(B, '風', 2.1, 8.9, z1 + 0.04, 0, 1.5, 1.5, { both: false, bg: '#3f7a4a', color: '#f4efe2' });
      for (const [x, hex] of [[-1.4, 0xb5392b], [1.4, 0x3f7a4a]]) {   // 호카게와 카제카게의 자리
        const p = part(B, x, Y, -31.6, 0), cu = mat('plain', hex, { rough: 0.9 });
        p(LOG, box(0.9, 0.5, 0.8), 0, 0.25, 0); p(cu, box(0.8, 0.1, 0.7), 0, 0.55, 0.02); p(LOG, box(0.9, 1.5, 0.12), 0, 0.75, -0.4); p(cu, box(0.7, 0.8, 0.05), 0, 1.05, -0.33); for (const s of [-1, 1]) p(LOG, box(0.1, 0.3, 0.8), s * 0.45, 0.65, 0);
        addCollider(x - 0.5, Y, -32.1, x + 0.5, Y + 1.5, -31.2);
      }
      tableAt(B, LOG, 0, Y, -31.5, 0, 0.6, 0.5, 0.6); B.geo(mat('plain', 0xe6dcc0), cyl(0.05, 0.04, 0.08, 10), mat4(-0.12, Y + 0.64, -31.5)); B.geo(mat('plain', 0xe6dcc0), cyl(0.05, 0.04, 0.08, 10), mat4(0.14, Y + 0.64, -31.45));
      hangLamp(B, 0, Y + 3.5, -32, 0.3, glows, lights, 12);
      places.push({ n: '카게석', t: '본선을 지켜보는 호카게와 카제카게의 자리. 나뭇잎 무너뜨리기 때 이 지붕 위에서 3대 호카게가 오로치마루와 싸웠다.', b: [-4.5, 4.5, z0, z1], y: [7, 18] });
    }

    /* ---- 마당에 남은 것들 ---- */
    {
      const R = rngOf(3131), tg = treeGeometry(3131, { height: 11, depth: 4, sprays: 5, leaves: 6, leafLen: 0.5 }), tm = [];
      for (const [a, r] of [[PI + 0.35, 17.5], [PI + 0.75, 18], [PI + 1.12, 17], [PI + 0.55, 13.5], [PI + 0.98, 13]]) { const x = Math.cos(a) * r, z = Math.sin(a) * r; tm.push(mat4(x, 0, z, 0, R() * 6, 0, 0.85 + R() * 0.3)); addCollider(x - 0.45, 0, z - 0.45, x + 0.45, 6, z + 0.45); B.geo(mat('leaf', 0x3f7a30), BUSH.leaves, mat4(x + 1.5, 0, z + 1.1, 0, a, 0, 0.9)); }
      inst(tg.wood, mat('bark', 0x8a7257), tm); inst(tg.leaves, mat('leaf', 0x3a742c), tm);
      // 나루토가 판 땅굴 구멍 둘
      for (const [x, z] of [[3.2, 1.5], [-2.4, -3.6]]) {
        B.geo(DARK, new THREE.CircleGeometry(0.6, 20).rotateX(-PI / 2), mat4(x, 0.045, z)); B.geo(DARK, new THREE.CylinderGeometry(0.6, 0.5, 0.5, 20, 1, true), mat4(x, -0.2, z));
        for (let i = 0; i < 9; i++) { const a = i / 9 * PI * 2 + R(), d = 0.75 + R() * 0.25, s = 0.18 + R() * 0.2; B.geo(mat('dirt', 0xa8936a), SPH, new THREE.Matrix4().multiplyMatrices(mat4(x + Math.cos(a) * d, 0.03, z + Math.sin(a) * d), new THREE.Matrix4().makeScale(s * 1.3, s * 0.6, s))); }
      }
      // 땅에 박힌 쿠나이와 수리검
      for (let i = 0; i < 9; i++) {
        const a = R() * PI * 2, d = 3 + R() * 14, x = Math.cos(a) * d, z = Math.sin(a) * d, p = part(B, x, 0.03, z, R() * 6);
        if (i % 3) { p(M.iron, new THREE.ConeGeometry(0.022, 0.16, 4), 0, 0.03, 0, PI + 0.4, 0, 0); p(DARK, cyl(0.012, 0.012, 0.1, 5), 0.0, 0.15, 0.045, 0.4); p(M.iron, new THREE.TorusGeometry(0.022, 0.006, 4, 10), 0, 0.22, 0.075, 0.4); }
        else for (const r of [0, PI / 4]) p(M.iron, box(0.15, 0.006, 0.03), 0, 0.05, 0, 0.9, r, 0);
      }
      // 벽의 싸움 자국: 움푹 팬 자리와 사방으로 간 금
      {
        const a = -0.55, p = part(B, Math.cos(a) * (RF - 0.03), 2.4, Math.sin(a) * (RF - 0.03), -a - PI / 2);
        p(mat('plain', 0x6f675a, { rough: 1 }), new THREE.CircleGeometry(1.2, 14), 0, 0, 0); p(DARK, new THREE.CircleGeometry(0.55, 10), 0.1, -0.05, 0.004);
        for (let i = 0; i < 11; i++) { const c = i / 11 * PI * 2 + R() * 0.4, L = 1.2 + R() * 1.6; p(DARK, box(L, 0.035, 0.004), Math.cos(c) * (0.9 + L / 2), Math.sin(c) * (0.9 + L / 2), 0.003, 0, 0, c); if (i % 2) p(DARK, box(L * 0.5, 0.025, 0.004), Math.cos(c) * (1.1 + L) + Math.cos(c + 0.6) * L * 0.2, Math.sin(c) * (1.1 + L) + Math.sin(c + 0.6) * L * 0.2, 0.003, 0, 0, c + 0.6); }
      }
      places.push({ n: '경기장 마당', t: '본선의 싸움터. 나루토가 네지를 올려 치려고 판 땅굴 구멍이 남아 있다.', b: [-RF, RF, -RF, RF], y: [-1, 4.5] });
    }
    return { places, glows, lights, jumps: [['중급닌자 시험 경기장', 0, 0, RO + 7, 0, 100], ['경기장 마당', 0, 0, 12, 0, 101], ['카게석', 0, ty(NT - 1) + 0.1, -30.6, PI, 102]] };
  });
  OPEN.push([at.x, at.z, 41]);
  BARE.push((x, z) => Math.hypot(x - at.x, z - at.z) < RO + 0.3 || (Math.abs(x - at.x) < 2.6 && z > at.z && z < at.z + RO + 3));
  out.places.push({ n: '중급닌자 시험 경기장', t: '중급닌자 선발 시험의 본선이 열리는 경기장. 영주와 손님들 앞에서 한 사람씩 맞붙는다.', poly: Z.poly, b: bound(Z.poly) }, ...res.places);
  out.jumps.push(...res.jumps); out.glows.push(...res.glows); out.lights.push(...res.lights);
}
/* ============================ 나뭇잎 온천 ============================
   마을 남서쪽 숲 속의 공중 목욕탕. 앞채(현관·탈의실) 뒤로 대나무 울타리를 두른 노천탕이 있다.
   원작(나루토 위키 "Konoha Hot Springs")에 적힌 것: 한가운데서 남탕과 여탕으로 나뉜 공중 목욕탕이라는 것,
   닌자가 물 위 걷기 수련터로도 쓴다는 것, 지라이야가 나루토를 데려와 쉬게 한 곳이라는 것.
   지어낸 것: 건물의 생김새와 방 배치, 탁구대와 우유 냉장고, 바위 탕의 모양, 두꺼비 돌, 단풍나무,
   울타리 밖 엿보는 구멍과 취재 수첩(지라이야가 여탕을 엿보며 "취재"하던 버릇에서 따온 것). */
function onsen(scene, out) {
  const Z = zone(39), at = { x: -281.25, z: 851, ry: -PI / 2 };   // 앞(제 좌표 +z)이 서쪽 길을 본다
  const X0 = -11, X1 = 11, Z0 = 8, Z1 = 17, ZM = 12.5, H = 3.3, F = 0.2, FB = -19.5, FX = 11.6;
  const ticks = [];
  const res = put(scene, at, (B, holder) => {
    const places = [], glows = [], lights = [], R = rngOf(3939);
    const WALLM = mat('plaster', 0xe9e0c8), TRIM = mat('wood', 0x5a3f2a), FLOOR = mat('planks', 0xb08a58), TILE = mat('tile', 0x4a4f58, { rough: 0.6 }), LOG = mat('wood', 0x8c6c4a);
    const BAMBOO = mat('plain', 0xb9b06a, { rough: 0.6 }), BAMBOO2 = mat('plain', 0x8a8448, { rough: 0.7 }), PAVE = M.pave, BLUE = '#1f3a6e', REDC = '#9a2a2a';
    const inst = (g, m, ms, shadow = true) => { const im = new THREE.InstancedMesh(g, m, ms.length); ms.forEach((q, i) => im.setMatrixAt(i, q)); im.instanceMatrix.needsUpdate = true; im.castShadow = shadow; im.receiveShadow = true; im.computeBoundingSphere(); holder.add(im); return im; };
    const scaled = (x, y, z, sx, sy, sz, ry = 0) => new THREE.Matrix4().multiplyMatrices(mat4(x, y, z, 0, ry, 0), new THREE.Matrix4().makeScale(sx, sy, sz));

    /* ---- 앞채 ---- */
    shopShell(B, X0, Z0, X1, Z1, H, WALLM, TRIM, FLOOR, {
      s: [[-1.1, 1.1, 'd'], [-8.5, -6.3, 'w'], [-5, -2.8, 'w'], [2.8, 5, 'w'], [6.3, 8.5, 'w']],
      n: [[-6.4, -4.8, 'd'], [4.8, 6.4, 'd'], [-9.6, -7.6, 'h'], [-3.6, -1.6, 'h'], [1.6, 3.6, 'h'], [7.6, 9.6, 'h']],
      w: [[9.2, 11.4, 'h'], [13.4, 15.8, 'w']], e: [[9.2, 11.4, 'h'], [13.4, 15.8, 'w']] });
    B.box(M.beamLight, X0, H, Z0, X1, H + 0.08, Z1, false);
    gableRoof(B, TILE, X0, Z0, X1, Z1, H + 0.08, 2.3, { ridge: 'x', gable: WALLM, over: 0.9 });
    gableRoof(B, TILE, -2.4, Z1, 2.4, Z1 + 2.2, 2.95, 0.9, { ridge: 'z', over: 0.4, overGable: 0.3 });        // 현관 지붕
    for (const s of [-1, 1]) { B.box(TRIM, s * 2.2 - 0.09, 0, Z1 + 1.9, s * 2.2 + 0.09, 2.95, Z1 + 2.08); B.box(M.stone, s * 2.2 - 0.16, 0, Z1 + 1.82, s * 2.2 + 0.16, 0.14, Z1 + 2.16, false); }
    B.box(M.stone, -2.4, 0, Z1, 2.4, 0.1, Z1 + 2.3, false);
    noren(B, 'x', Z1 + 0.1, -1.05, 1.05, 2.58, 0.8, 'ゆ', { color: BLUE, n: 3 });
    signBoard(B, '木ノ葉温泉', 0, 3.3, Z1 + 2.68, 0, 2.3, 0.5, { both: false });
    for (const s of [-1, 1]) glows.push(lantern(B, s * 1.75, 2.35, Z1 + 2.0, { text: '湯', r: 0.2, h: 0.5 }));
    // 칸막이: 현관방과 탈의실 사이, 남·여 탈의실 사이
    partition(B, WALLM, TRIM, 'x', ZM, X0 + 0.25, X1 - 0.25, F, [[-6.4, -4.8, 'd'], [4.8, 6.4, 'd']], H - F);
    partition(B, WALLM, TRIM, 'z', 0, Z0 + 0.25, ZM - 0.08, F, [], H - F);
    noren(B, 'x', ZM + 0.12, -6.3, -4.9, F + 2.25, 0.7, '男', { color: BLUE, n: 1 }); noren(B, 'x', ZM + 0.12, 4.9, 6.3, F + 2.25, 0.7, '女', { color: REDC, n: 1 });
    for (const [x, z] of [[0, 14.8], [-5.5, 10.3], [5.5, 10.3], [-7, 14.8], [7, 14.8]]) ceilLamp(B, x, H, z, glows, lights, 12);

    /* ---- 현관방: 번대, 신발장, 우유 냉장고, 탁구대 ---- */
    {
      deskAt(B, TRIM, 0, F, 13.35, 0, 2.0, 0.7); chairAt(B, TRIM, 0, F, 12.95, 0);
      signBoard(B, '入浴料　大人 十両　小人 五両', 0, F + 1.02, 13.72, 0, 1.7, 0.2, { both: false, bg: '#efe6cf', depth: 0.02 });
      B.geo(mat('plain', 0xc9a24a, { rough: 0.5 }), cyl(0.09, 0.07, 0.08, 10), mat4(-0.6, F + 0.82, 13.4)); B.geo(mat('plain', 0x2b2b2e), box(0.26, 0.02, 0.18), mat4(0.5, F + 0.79, 13.35, 0, 0.2, 0));
      signBoard(B, '忍の水面歩行修行　歓迎', -3, F + 1.9, ZM + 0.1, 0, 2.2, 0.32, { both: false, bg: '#efe6cf', depth: 0.02 }); signBoard(B, '湯あがりに牛乳', 3, F + 1.9, ZM + 0.1, 0, 1.6, 0.32, { both: false, bg: '#efe6cf', depth: 0.02 });
      // 신발장(현관 옆 앞벽)
      for (const s of [-1, 1]) { const x = s * 2.0; B.box(TRIM, x - 0.7, F, Z1 - 0.62, x + 0.7, F + 1.2, Z1 - 0.27); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { B.box(M.beamLight, x - 0.64 + c * 0.33, F + 0.06 + r * 0.29, Z1 - 0.64, x - 0.36 + c * 0.33, F + 0.3 + r * 0.29, Z1 - 0.62, false); if ((r * 3 + c + (s > 0 ? 1 : 0)) % 3 === 0) B.geo(mat('plain', 0x8a2a2a), box(0.05, 0.02, 0.05), mat4(x - 0.5 + c * 0.33, F + 0.18 + r * 0.29, Z1 - 0.65)); } }
      // 우유 냉장고: 흰 우유, 커피 우유, 과일 우유
      {
        const x = -10.3, z = 14.6; B.box(M.white, x - 0.35, F, z - 0.6, x + 0.35, F + 1.8, z + 0.6); B.box(M.glass, x + 0.35, F + 0.35, z - 0.52, x + 0.37, F + 1.7, z + 0.52, false); B.box(mat('glow', 0xf4fbff, { power: 0.5 }), x - 0.3, F + 0.35, z - 0.52, x - 0.28, F + 1.7, z + 0.52, false);
        for (let r = 0; r < 3; r++) { B.box(M.iron, x - 0.28, F + 0.5 + r * 0.4, z - 0.52, x + 0.33, F + 0.52 + r * 0.4, z + 0.52, false); for (let i = 0; i < 8; i++) { B.geo(mat('plain', [0xf7f3ea, 0x8a5a3a, 0xf0c95a][r], { rough: 0.3 }), cyl(0.035, 0.04, 0.16, 8), mat4(x + 0.18, F + 0.6 + r * 0.4, z - 0.42 + i * 0.12)); B.geo(mat('plain', [0x3f6fb5, 0x6a3a22, 0xd0483a][r]), cyl(0.03, 0.03, 0.02, 8), mat4(x + 0.18, F + 0.69 + r * 0.4, z - 0.42 + i * 0.12)); } }
        signBoard(B, '牛乳', x + 0.36, F + 1.9, z, PI / 2, 0.8, 0.26, { both: false, bg: '#f4efe2', depth: 0.02 }); glows.push([x + 0.3, F + 1.0, z, 0.5]);
        B.box(mat('plain', 0x4a6a8a), x - 0.3, F, z + 0.8, x + 0.1, F + 0.5, z + 1.2); for (let i = 0; i < 5; i++) B.geo(M.glass, cyl(0.035, 0.04, 0.16, 8), mat4(x - 0.2 + (i % 3) * 0.1, F + 0.56, z + 0.9 + Math.floor(i / 3) * 0.12));   // 빈 병 상자
      }
      benchAt(B, LOG, -7.2, F, 16.2, 0, 2.2);
      // 탁구대
      {
        const x = 8.3, z = 14.9, G = mat('plain', 0x2f6a5a, { rough: 0.6 }), W = mat('plain', 0xf2efe6);
        B.box(G, x - 1.37, F + 0.72, z - 0.76, x + 1.37, F + 0.76, z + 0.76, false); for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) B.box(M.iron, x + sx * 1.15 - 0.03, F, z + sz * 0.6 - 0.03, x + sx * 1.15 + 0.03, F + 0.72, z + sz * 0.6 + 0.03, false);
        B.box(W, x - 1.37, F + 0.761, z - 0.01, x + 1.37, F + 0.763, z + 0.01, false); for (const s of [-1, 1]) { B.box(W, x - 1.37, F + 0.761, z + s * 0.75 - 0.01, x + 1.37, F + 0.763, z + s * 0.75 + 0.01, false); B.box(W, x + s * 1.36 - 0.01, F + 0.761, z - 0.76, x + s * 1.36 + 0.01, F + 0.763, z + 0.76, false); }
        B.box(mat('plain', 0x1f2a3a, { rough: 0.9 }), x - 0.006, F + 0.76, z - 0.84, x + 0.006, F + 0.91, z + 0.84, false);
        for (const [px, pz, hex] of [[x - 1.0, z + 0.3, 0xb5392b], [x + 0.9, z - 0.35, 0x24211e]]) { B.geo(mat('plain', hex), cyl(0.075, 0.075, 0.012, 14), mat4(px, F + 0.77, pz)); B.geo(LOG, box(0.025, 0.012, 0.1), mat4(px, F + 0.77, pz + 0.12)); }
        B.geo(mat('plain', 0xf0a03a, { rough: 0.4 }), SPH, mat4(x - 0.4, F + 0.78, z - 0.2, 0, 0, 0, 0.02)); addCollider(x - 1.37, F, z - 0.76, x + 1.37, F + 0.92, z + 0.76);
      }
      places.push({ n: '온천 현관방', t: '번대에서 값을 치르고 들어간다. 탕에서 나오면 우유 한 병, 그리고 탁구.', b: [X0, X1, ZM, Z1], y: [0, H] });
    }

    /* ---- 탈의실(남 = 서, 여 = 동) ---- */
    for (const s of [-1, 1]) {
      const BASK = mat('plain', 0xc9a86a, { rough: 0.9 });
      // 바구니 선반(바깥벽 쪽)
      { const x = s * 10.45; B.box(TRIM, x - 0.25, F, 8.6, x + 0.25, F + 1.8, 12.1); for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) { const z = 8.95 + c * 0.7, y = F + 0.12 + r * 0.43; B.box(M.beamLight, x - s * 0.26, y, z - 0.3, x - s * 0.24, y + 0.36, z + 0.3, false); if ((r * 2 + c + (s > 0 ? 0 : 1)) % 3) B.geo(BASK, new THREE.CylinderGeometry(0.22, 0.18, 0.2, 10, 1, true), mat4(x - s * 0.2, y + 0.11, z)); if ((r + c * 2) % 4 === 0) B.geo(mat('plain', s > 0 ? 0xe58aa0 : 0x5a7aa0), box(0.28, 0.06, 0.3), mat4(x - s * 0.2, y + 0.08, z)); } }
      benchAt(B, LOG, s * 3.0, F, 10.3, PI / 2, 2.4);
      // 거울과 세면대(가운데 칸막이 쪽), 체중계
      { const x = s * 0.1; B.box(M.glass, x + s * 0.0, F + 1.0, 9.0, x + s * 0.02, F + 1.9, 10.6, false); B.box(TRIM, x, F + 0.95, 8.95, x + s * 0.03, F + 1.0, 10.65, false); B.box(M.white, x, F + 0.7, 9.1, x + s * 0.45, F + 0.82, 10.5); B.box(TRIM, x, F, 9.15, x + s * 0.4, F + 0.7, 10.45, false); for (const z of [9.45, 10.15]) { B.geo(mat('plain', 0xd8dde0, { rough: 0.3 }), cyl(0.16, 0.12, 0.03, 14), mat4(x + s * 0.24, F + 0.83, z)); B.geo(M.iron, cyl(0.012, 0.012, 0.14, 6), mat4(x + s * 0.06, F + 0.89, z)); } }
      { const x = s * 1.2, z = 11.7; B.box(M.iron, x - 0.2, F, z - 0.25, x + 0.2, F + 0.06, z + 0.25, false); B.box(M.iron, x - 0.03, F, z - 0.27, x + 0.03, F + 1.2, z - 0.22, false); B.geo(M.white, cyl(0.16, 0.16, 0.04, 16).rotateX(PI / 2), mat4(x, F + 1.25, z - 0.25)); }
      signBoard(B, s < 0 ? '男湯' : '女湯', s * 5.6, F + 2.55, Z0 + 0.3, 0, 0.9, 0.3, { both: false, bg: s < 0 ? BLUE : REDC, color: '#f4efe2', depth: 0.02 });
      places.push({ n: s < 0 ? '남탕 탈의실' : '여탕 탈의실', t: '옷을 바구니에 담아 두고 탕으로 나간다.', b: [s < 0 ? X0 : 0, s < 0 ? 0 : X1, Z0, ZM], y: [0, H] });
    }

    /* ---- 노천탕 마당: 대나무 울타리, 돌바닥 ---- */
    B.box(PAVE, -FX, 0, FB, FX, 0.05, Z0, false);
    {
      const POLE = cyl(0.045, 0.045, 2.7, 6), ms = [];
      const run = (ax, c, u0, u1) => {
        const n = Math.round((u1 - u0) / 0.095);
        for (let i = 0; i <= n; i++) { const u = u0 + (u1 - u0) * i / n, y = 1.35 + ((i * 7) % 5) * 0.012; ms.push(ax === 'x' ? mat4(u, y, c) : mat4(c, y, u)); }
        for (const y of [0.5, 1.5, 2.4]) for (const d of [-0.06, 0.06]) (ax === 'x' ? B.box(BAMBOO2, u0, y - 0.03, c + d - 0.02, u1, y + 0.03, c + d + 0.02, false) : B.box(BAMBOO2, c + d - 0.02, y - 0.03, u0, c + d + 0.02, y + 0.03, u1, false));
        for (let u = u0; u <= u1 + 0.01; u += (u1 - u0) / Math.max(1, Math.round((u1 - u0) / 2.8))) (ax === 'x' ? B.box(TRIM, u - 0.07, 0, c - 0.07, u + 0.07, 2.85, c + 0.07, false) : B.box(TRIM, c - 0.07, 0, u - 0.07, c + 0.07, 2.85, u + 0.07, false));
        if (ax === 'x') B.box(BAMBOO2, u0, 0, c - 0.012, u1, 2.6, c + 0.012, false); else B.box(BAMBOO2, c - 0.012, 0, u0, c + 0.012, 2.6, u1, false);   // 대 사이로 들여다보이지 않게 속에 댄 널
        if (ax === 'x') addCollider(u0, 0, c - 0.08, u1, 2.8, c + 0.08); else addCollider(c - 0.08, 0, u0, c + 0.08, 2.8, u1);
      };
      run('x', FB, -FX, FX); run('z', -FX, FB, Z0); run('z', FX, FB, Z0); run('z', 0, FB, Z0);
      run('x', Z0 - 0.02, -FX, -X1 - 0.02); run('x', Z0 - 0.02, X1 + 0.02, FX);
      inst(POLE, BAMBOO, ms);
      signBoard(B, 'のぞき厳禁', 5.8, 2.0, FB + 0.1, 0, 1.5, 0.34, { both: false, bg: '#efe6cf', color: '#8a2a20', depth: 0.02 });
    }
    const steam = [];
    for (const s of [-1, 1]) {
      const cx = s * 5.6, cz = -8.5, pa = 3.9, pb = 6.6;
      // 문 앞 마루와 씻는 자리
      B.box(FLOOR, s < 0 ? -FX + 0.1 : 0.1, 0, 5.4, s < 0 ? -0.1 : FX - 0.1, F, Z0);
      for (let i = 0; i < 3; i++) {
        const x = s * 10.9, z = 4.2 - i * 1.5;
        B.box(M.stone, x - 0.12, 0.05, z - 0.1, x + 0.12, 0.75, z + 0.1); B.geo(M.iron, cyl(0.015, 0.015, 0.16, 6).rotateZ(PI / 2), mat4(x - s * 0.18, 0.55, z)); B.geo(M.iron, cyl(0.02, 0.02, 0.05, 6), mat4(x - s * 0.26, 0.52, z));
        B.geo(LOG, cyl(0.17, 0.17, 0.26, 12), mat4(x - s * 0.85, 0.18, z)); addCollider(x - s * 0.85 - 0.17, 0, z - 0.17, x - s * 0.85 + 0.17, 0.31, z + 0.17);
        B.geo(LOG, new THREE.CylinderGeometry(0.15, 0.13, 0.14, 12, 1, true), mat4(x - s * 0.45, 0.12, z + 0.35)); B.geo(LOG, cyl(0.13, 0.13, 0.015, 12), mat4(x - s * 0.45, 0.058, z + 0.35));
        B.box(M.glass, x + s * 0.1, 0.8, z - 0.25, x + s * 0.12, 1.3, z + 0.25, false);
      }
      // 바위 탕
      B.geo(mat('plain', 0x4a5258, { rough: 0.9 }), new THREE.CircleGeometry(1, 40).rotateX(-PI / 2), scaled(cx, 0.06, cz, pa, 1, pb));
      { const w = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-PI / 2), M.water); w.matrixAutoUpdate = false; w.matrix.copy(scaled(cx, 0.36, cz, pa, 1, pb)); w.receiveShadow = true; holder.add(w); }
      const ROCKG = new THREE.IcosahedronGeometry(1, 1);
      for (let i = 0; i < 40; i++) {
        const a = i / 40 * PI * 2 + R() * 0.06, k = 1.02 + R() * 0.07, x = cx + Math.cos(a) * pa * k, z = cz + Math.sin(a) * pb * k;
        const gap = Math.abs(a - PI / 2) < 0.2, sz = gap ? 0.3 : 0.38 + R() * 0.38;
        B.geo(M.rock, ROCKG, scaled(x, gap ? 0.05 : sz * 0.35, z, sz * 1.25, gap ? 0.16 : sz * 0.8, sz, R() * 6));
        if (!gap && sz > 0.6) addCollider(x - sz * 0.6, 0, z - sz * 0.6, x + sz * 0.6, sz, z + sz * 0.6);
      }
      // 물이 나오는 대나무 홈통과 바위 더미
      { const x = cx - s * 0.6, z = cz - pb - 0.5; for (const [dx, dz, sz] of [[0, 0, 0.9], [0.9, 0.3, 0.6], [-0.8, 0.4, 0.55]]) B.geo(M.rock, ROCKG, scaled(x + dx, sz * 0.5, z + dz, sz * 1.1, sz * 0.9, sz, dx)); B.geo(BAMBOO, cyl(0.05, 0.05, 1.5, 8).rotateX(PI / 2 - 0.15), mat4(x, 1.05, z + 0.9)); B.geo(mat('plain', 0xcfe6ea, { rough: 0.1 }), cyl(0.025, 0.03, 0.62, 6), mat4(x, 0.66, z + 1.66)); addCollider(x - 1, 0, z - 0.6, x + 1, 1.2, z + 0.6); }
      // 돌등, 단풍나무, 나무 물통 더미, 수건 걸이
      { const x = s * 1.3, z = -17.6; B.geo(M.stone, cyl(0.3, 0.36, 0.14, 6), mat4(x, 0.12, z)); B.geo(M.stone, cyl(0.12, 0.15, 0.75, 8), mat4(x, 0.56, z)); B.geo(M.stone, cyl(0.28, 0.15, 0.12, 6), mat4(x, 0.99, z)); B.geo(mat('glow', 0xffe6b0, { power: 1 }), box(0.24, 0.24, 0.24), mat4(x, 1.17, z)); for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) B.box(M.stone, x + dx * 0.15 - 0.035, 1.05, z + dz * 0.15 - 0.035, x + dx * 0.15 + 0.035, 1.3, z + dz * 0.15 + 0.035, false); B.geo(M.stone, new THREE.ConeGeometry(0.42, 0.28, 6), mat4(x, 1.44, z)); addCollider(x - 0.3, 0, z - 0.3, x + 0.3, 1.6, z + 0.3); glows.push([x, 1.17, z, 0.5]); lights.push([x, 1.4, z, 10, 12]); }
      { const tg = treeGeometry(390 + s, { height: 7, depth: 4, sprays: 6, leaves: 7, leafLen: 0.3, spread: 1.3 }), m = [mat4(s * 10, 0, -17.2, 0, s, 0, 1)]; inst(tg.wood, mat('bark', 0x5c483c), m); inst(tg.leaves, mat('leaf', s < 0 ? 0xc9442f : 0xd9772a), m); addCollider(s * 10 - 0.25, 0, -17.45, s * 10 + 0.25, 4, -16.95); B.geo(mat('leaf', 0x3f7a30), BUSH.leaves, mat4(s * 9.6, 0, -15.6, 0, 1, 0, 0.8)); }
      for (const [dx, dy] of [[0, 0], [0.32, 0], [0.64, 0], [0.16, 0.15], [0.48, 0.15], [0.32, 0.3]]) { B.geo(LOG, new THREE.CylinderGeometry(0.15, 0.13, 0.14, 12, 1, true), mat4(s * 1.2 + s * dx, F + 0.07 + dy, 6.3)); B.geo(LOG, cyl(0.13, 0.13, 0.015, 12), mat4(s * 1.2 + s * dx, F + 0.01 + dy, 6.3)); }
      { const x = s * 9.2, z = 6.2; for (const d of [-0.6, 0.6]) B.box(LOG, x + d - 0.03, F, z - 0.03, x + d + 0.03, F + 1.3, z + 0.03, false); B.box(LOG, x - 0.66, F + 1.25, z - 0.025, x + 0.66, F + 1.3, z + 0.025, false); for (const [d, hex] of [[-0.35, 0xf2efe6], [0.05, s < 0 ? 0x5a7aa0 : 0xe58aa0], [0.4, 0xf2efe6]]) B.geo(mat('cloth', hex), new THREE.PlaneGeometry(0.3, 0.7), mat4(x + d, F + 0.93, z + 0.03)); }
      for (let i = 0; i < 9; i++) steam.push({ x: cx + (R() - 0.5) * pa * 1.4, z: cz + (R() - 0.5) * pb * 1.4, p: R(), v: 0.07 + R() * 0.05, s: 0.7 + R() * 0.8 });
      places.push({ n: s < 0 ? '남탕(노천탕)' : '여탕(노천탕)', t: '대나무 울타리를 두른 바위 탕. 뜨거운 물 위에 서는 수련을 하는 닌자도 있다.', b: [s < 0 ? -FX : 0, s < 0 ? 0 : FX, FB, Z0], y: [0, 3] });
    }
    // 남탕의 두꺼비 돌(입에서 물이 나온다)
    {
      const x = -9.3, z = -6, G = mat('stone', 0x7f8a72);
      for (const m of [scaled(x, 0.41, z, 0.5, 0.36, 0.44)]) B.geo(G, SPH, m);
      B.geo(G, SPH, scaled(x + 0.3, 0.62, z, 0.3, 0.2, 0.34)); for (const d of [-0.17, 0.17]) { B.geo(G, SPH, mat4(x + 0.3, 0.8, z + d, 0, 0, 0, 0.09)); B.geo(mat('plain', 0x1b1b1e), SPH, mat4(x + 0.37, 0.82, z + d, 0, 0, 0, 0.04)); B.geo(G, SPH, scaled(x + 0.15, 0.2, z + d * 2.4, 0.26, 0.16, 0.14)); }
      B.geo(mat('plain', 0xcfe6ea, { rough: 0.1 }), tube([V(x + 0.58, 0.6, z), V(x + 1.0, 0.55, z), V(x + 1.3, 0.38, z)], 0.02, 6, false)); addCollider(x - 0.45, 0, z - 0.45, x + 0.55, 0.9, z + 0.45);
    }
    // 김: 탕에서 천천히 피어오른다
    {
      const g = new THREE.SphereGeometry(0.5, 8, 6), sm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.17, depthWrite: false });
      for (const f of steam) { f.m = new THREE.Mesh(g, sm); f.m.matrixAutoUpdate = false; f.m.frustumCulled = false; holder.add(f.m); }
      const puff = t => { for (const f of steam) { const u = (f.p + t * f.v) % 1, k = Math.sin(u * PI) * f.s * (0.6 + u); f.m.matrix.copy(scaled(f.x + Math.sin(t * 0.4 + f.p * 9) * 0.3 * u, 0.5 + u * 3.2, f.z + Math.cos(t * 0.3 + f.p * 7) * 0.3 * u, k, k * 0.8, k)); } };
      puff(0); ticks.push(puff);
    }

    /* ---- 울타리 밖: 엿보는 구멍과 취재 수첩(여탕 쪽 뒤 울타리) ---- */
    {
      const x = 7.2, z = FB - 0.1;
      B.geo(mat('plain', 0x14110e), new THREE.CircleGeometry(0.05, 10).rotateY(PI), mat4(x, 1.45, z - 0.06));
      B.geo(M.rock, new THREE.IcosahedronGeometry(1, 1), scaled(x + 0.9, 0.2, z - 0.8, 0.5, 0.3, 0.42)); B.geo(mat('paper', 0xf2ead2), box(0.2, 0.02, 0.28), mat4(x + 0.9, 0.51, z - 0.8, 0, 0.4, 0)); B.geo(mat('plain', 0x8a2a2a), box(0.2, 0.006, 0.28), mat4(x + 0.9, 0.497, z - 0.8, 0, 0.4, 0)); B.geo(LOG, cyl(0.007, 0.007, 0.16, 5).rotateZ(PI / 2), mat4(x + 0.95, 0.53, z - 0.72, 0, -0.5, 0));
      B.geo(LOG, box(0.4, 0.3, 0.3), mat4(x, 0.15, z - 0.45)); addCollider(x - 0.2, 0, z - 0.6, x + 0.2, 0.3, z - 0.3);
    }

    /* ---- 앞마당: 길에서 현관까지 디딤돌, 걸상, 안내 기둥 ---- */
    for (let i = 0; i < 5; i++) B.geo(M.stone, cyl(0.42, 0.45, 0.06, 9), mat4((i % 2 ? 0.18 : -0.18), 0.03, Z1 + 3.0 + i * 0.95, 0, i, 0));
    benchAt(B, LOG, -5.5, 0, Z1 + 0.9, 0, 2.2); benchAt(B, LOG, 5.5, 0, Z1 + 0.9, 0, 2.2);
    { const x = 4.2, z = Z1 + 5.2; B.box(TRIM, x - 0.1, 0, z - 0.1, x + 0.1, 2.6, z + 0.1); signBoard(B, '温泉', x, 2.0, z + 0.12, 0, 0.5, 1.0, { vertical: true, both: false }); }
    return { places, glows, lights, jumps: [['나뭇잎 온천', 0, 0, Z1 + 6.5, 0, 103], ['온천 노천탕(남탕)', -5.9, F, 6.8, 0, 104]] };
  });
  OPEN.push([at.x, at.z, 27], [at.x - 26, at.z, 8]);
  BARE.push((x, z) => Math.abs(x - at.x) < 21.5 && Math.abs(z - at.z) < 12.5);
  out.places.push({ n: '나뭇잎 온천', t: '마을의 공중 목욕탕. 한가운데서 남탕과 여탕으로 나뉜다. 지라이야가 나루토를 데려와 쉬게 한 곳.', poly: Z.poly, b: bound(Z.poly) }, ...res.places);
  out.jumps.push(...res.jumps); out.glows.push(...res.glows); out.lights.push(...res.lights); out.ticks.push(...ticks);
}
let _blackM = null; const BLACKM = () => _blackM || (_blackM = mat('plain', 0x1b1b1e, { rough: 0.9 }));
const bound = poly => [Math.min(...poly.map(q => q[0])), Math.max(...poly.map(q => q[0])), Math.min(...poly.map(q => q[1])), Math.max(...poly.map(q => q[1]))];

// 집·나무를 세우기 전에 터부터 알려 둔다(zones.js 다음, streets.js 앞에서 부른다)
export async function build(scene, ctx) {
  BUSH = bushGeometry(21, 1);
  const out = { places: [], jumps: [], glows: [], lights: [], ticks: [] };
  await ctx.say('상급닌자 대기소에 소파를 들이는 중…');
  standby(scene, out);
  await ctx.say('정보부의 문을 걸어 잠그는 중…');
  intel(scene, out);
  await ctx.say('전서구 탑에 매를 앉히는 중…');
  aviary(scene, out);
  await ctx.say('묘지의 비석을 닦는 중…');
  cemetery(scene, out);
  await ctx.say('병원의 홑이불을 너는 중…');
  hospital(scene, out);
  await ctx.say('도서관의 책을 꽂는 중…');
  library(scene, out);
  await ctx.say('번화가에 등을 내거는 중…');
  downtown(scene, out);
  await ctx.say('고깃집 숯불을 피우는 중…');
  shops(scene, out);
  await ctx.say('텐텐네 무기를 닦는 중…');
  homes3(scene, out);
  await ctx.say('공원의 잉어에게 먹이를 주는 중…');
  park(scene, out);
  await ctx.say('경기장 마당을 고르는 중…');
  arena(scene, out);
  await ctx.say('온천 물을 데우는 중…');
  onsen(scene, out);
  if (out.ticks.length) out.tick = (t, dt) => { for (const f of out.ticks) f(t, dt); };
  return out;
}
