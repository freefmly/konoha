// 관저 둘레의 시설 — 상급닌자 대기소, 정보부, 전서구 탑. 셋 다 제 좌표(정면이 +z)로 지어 마을의 제자리에 돌려 놓는다.
// 구역의 자리는 배치도(plan-data.js)에서 읽고, 집·나무가 피해 가도록 터를 zones.js의 LOTS에 알려 둔다.
import * as THREE from '../vendor/three.module.js';
import { Builder, marks, settle, addCollider, addRoof, mat4, tube, wall, mergeGeos, rng as rngOf } from './build.js';
import { M, mat, textMat } from './materials.js';
import { beamBetween, hipRoof, gableRoof, coneRoof, roundWall, roundWindow, roundFloor, roundRailing, railing, windowUnit, doorUnit, signBoard, lantern } from './arch.js';
import { treeGeometry, bushGeometry } from './flora.js';
import { uchihaKit } from './b_uchiha.js';
import { PLAN } from './plan-data.js';
import { LOTS, OPEN } from './zones.js';

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
function face(B, m, axis, f0, f1, u0, u1, y0, y1, out, cols, ups, frame, iron) {
  const low = k => (k === 'd' ? [[y0 + 0.2, y0 + 2.6]] : k === 'w' ? [[y0 + 1.2, y0 + 2.5]] : k === 'h' ? [[y0 + 2.3, y0 + 2.75]] : []);
  wall(B, m, axis, f0, f1, u0, u1, y0, y1, cols.map(([a, b, k]) => ({ u0: a, u1: b, ys: [...low(k), ...ups.map(f => [f + 1.1, f + 2.4])] })), true, true);
  for (const [a, b, k] of cols) {
    if (k === 'd') doorUnit(B, axis, f0, f1, a, b, y0 + 0.2, y0 + 2.6, { frame, leaf: null });
    if (k === 'w') windowUnit(B, axis, f0, f1, a, b, y0 + 1.2, y0 + 2.5, { frame, out });
    if (k === 'h') bars(B, iron, axis, (f0 + f1) / 2, a, b, y0 + 2.3, y0 + 2.75, false);
    for (const f of ups) windowUnit(B, axis, f0, f1, a, b, f + 1.1, f + 2.4, { frame, out, paper: true });
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
        { n: '해석동', t: '야마나카 이노이치가 이끄는 해석반의 방. 입을 열지 않는 사람의 머릿속에서 기억을 곧바로 읽어 낸다.', b: [-28.4, -15.6, -10, 2.8], y: [0, 8] }],
      jumps: [['정보부 정문', 0, 0, Z1 + 7, 0, 83], ['정보부 해석동', -22, 0, 6.3, 0, 84]], glows, lights,
    };
  });
  out.places.push({ n: '정보부 터', t: '큰길 서쪽, 관저 바로 아래의 자리.', poly: Z.poly, b: bound(Z.poly) }, ...res.places);
  out.jumps.push(...res.jumps); out.glows.push(...res.glows); out.lights.push(...res.lights);
}
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
  if (out.ticks.length) out.tick = (t, dt) => { for (const f of out.ticks) f(t, dt); };
  return out;
}
