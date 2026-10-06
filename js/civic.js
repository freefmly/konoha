// 관저 둘레의 시설 — 상급닌자 대기소, 정보부, 전서구 탑. 셋 다 제 좌표(정면이 +z)로 지어 마을의 제자리에 돌려 놓는다.
// 구역의 자리는 배치도(plan-data.js)에서 읽고, 집·나무가 피해 가도록 터를 zones.js의 LOTS에 알려 둔다.
import * as THREE from '../vendor/three.module.js';
import { Builder, marks, settle, addCollider, addRoof, mat4, tube, wall, stairs, mergeGeos, rng as rngOf } from './build.js';
import { M, mat, textMat } from './materials.js';
import { beamBetween, hipRoof, gableRoof, coneRoof, roundWall, roundWindow, roundFloor, roundRailing, railing, windowUnit, doorUnit, signBoard, lantern } from './arch.js';
import { treeGeometry, bushGeometry } from './flora.js';
import { uchihaKit } from './b_uchiha.js';
import { PLAN } from './plan-data.js';
import { LOTS, OPEN } from './zones.js';
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
      [-11.6, '月光ハヤテ', '겟코 하야테의 무덤', '중닌 시험 예선의 심판을 맡았던 특별 상급닌자.'], [11.6, '日向ネジ', '휴가 네지의 무덤', '휴가 분가의 천재. 제4차 닌자대전에서 나루토와 히나타를 지키고 숨졌다.'],
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
    grove(B, holder, 2627, 22, [-60, -75, 60, 34], (x, z) => inZone(x, z) && !(x > X0 - 5 && x < X1 + 6 && z > Z0 - 4 && z < Z1 + 9) && !(Math.abs(x) < 4 && z > 0) && !(z > -26 && z < -20 && x > -14 && x < 24) && !(x > X1 && x < X1 + 5 && z < 2 && z > -24));
    places.unshift({ n: '나뭇잎 병원', t: '닌자와 마을 사람들을 돌보는 병원. 웬만한 병과 상처는 여기 의료 닌자들이 고치고, 크게 다친 사람은 츠나데나 시즈네가 나선다.', b: [X0 - 2, X1 + 2, Z0 - 2, Z1 + 4], y: [0, 14] });
    return { places, glows, lights, jumps: [['나뭇잎 병원', 0, 0, 20, 0, 87], ['병원 옥상', 6, RF, 5.5, PI / 2, 88]] };
  });
  out.places.push({ n: '병원 터', t: '큰길 서쪽, 병원의 앞마당과 뒤뜰.', poly: Z.poly, b: bound(Z.poly) }, ...res.places);
  out.jumps.push(...res.jumps); out.glows.push(...res.glows); out.lights.push(...res.lights);
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
  if (out.ticks.length) out.tick = (t, dt) => { for (const f of out.ticks) f(t, dt); };
  return out;
}
