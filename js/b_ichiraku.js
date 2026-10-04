// 이치라쿠 라멘(ラーメン一楽) — 큰길 동쪽의 작은 라멘 가게. 서쪽(큰길)으로 열린 카운터 가게.
// 앞: 처마 밑 카운터 자리(x 9.5~12.5) → 주방(x 12.5~17) → 창고·준비실(x 17~21) → 계단 → 다락(쉬는 방).
import * as THREE from '../vendor/three.module.js';
import { Builder, wall, stairs, tube, mat4, rng, addCollider } from './build.js';
import { mat, M, textMat } from './materials.js';
import { gableRoof, tilePanel, beamBetween, windowUnit, doorUnit, railing, noren, signBoard, lantern } from './arch.js';

const PI = Math.PI;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const lathe = (pts, seg = 16) => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg);
const cyl = (rTop, rBot, h, seg = 14) => new THREE.CylinderGeometry(rTop, rBot, h, seg);
const sph = (r, a = 12, b = 8) => new THREE.SphereGeometry(r, a, b);
const tor = (r, t, a = 6, b = 18, arc = PI * 2) => new THREE.TorusGeometry(r, t, a, b, arc);   // XY 평면에 선 고리(rx=π/2로 눕힌다)
const disc = (r, seg = 20) => { const g = new THREE.CircleGeometry(r, seg); g.rotateX(-PI / 2); return g; };
const boxG = (w, h, d, a = 1, b = 1, c = 1) => new THREE.BoxGeometry(w, h, d, a, b, c);

// 꼭짓점을 함수로 주물러 모양을 빚는다
function warp(g, fn) {
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); fn(v); p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals();
  return g;
}
// 모서리가 둥근 납작한 덩어리(포대·베개·방석)
function pillow(sx, sy, sz, e = 0.5) {
  const f = v => Math.sign(v) * Math.pow(Math.abs(v), e);
  return warp(new THREE.SphereGeometry(1, 18, 12), v => v.set(f(v.x) * sx, v.y * sy, f(v.z) * sz));
}
// 구불구불한 면발 한 가닥
function wavy(p0, p1, amp, wl, rad, ph, mound = 0) {
  const d = new THREE.Vector3().subVectors(p1, p0), L = d.length(), n = Math.max(6, Math.ceil(L / wl * 7));
  const px = -d.z / L, pz = d.x / L, pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, o = Math.sin(t * L / wl * PI * 2 + ph) * amp;
    pts.push(V(p0.x + d.x * t + px * o, p0.y + d.y * t + Math.sin(PI * t) * mound + Math.cos(t * L / wl * PI * 2 + ph) * amp * 0.25, p0.z + d.z * t + pz * o));
  }
  return tube(pts, rad, 5, true);
}
// 가장자리가 물결진 원판(나루토마키)
function scallop(r, h, lobes = 12, depth = 0.08) {
  return warp(cyl(r, r, h, 48), v => { const a = Math.atan2(v.z, v.x), k = 1 + depth * Math.cos(a * lobes); v.x *= k; v.z *= k; });
}

// 부품 묶음: 한 번 빚어 두고 여러 자리에 놓는다(묶음 안의 상자는 충돌을 넣지 않는다)
class Kit extends Builder { box(m, x0, y0, z0, x1, y1, z1) { super.box(m, x0, y0, z0, x1, y1, z1, false); } }
function kit(fn) {
  const K = new Kit(), out = [];
  fn(K);
  for (const [m, b] of K.parts) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(b.u, 2));
    out.push([m, g]);
  }
  return out;
}
const place = (B, k, x, y, z, ry = 0, s = 1, rx = 0, rz = 0) => { const m = mat4(x, y, z, rx, ry, rz, s); for (const [mt, g] of k) B.geo(mt, g, m); };

/* ---------- 자리 ---------- */
const XF = 9.5, X0 = 12.5, XP = 17, X1 = 21, Z0 = 10, Z1 = 22;      // 처마 앞선, 본채 서벽, 주방·창고 사이 벽, 동벽 / 북벽, 남벽
const F0 = 0.15, F1 = 0.2, F2 = 3.2, EAVE = 5.2, RISE = 2.3;       // 카운터 자리 바닥, 본채 바닥, 다락 바닥, 처마 높이, 용마루까지
const CT = 1.17;                                                    // 카운터 윗면

export function build(scene, ctx) {
  const B = new Builder();
  const C = {
    tile: mat('tile', 0x46586a), plank: mat('planks', 0x8c5f3c), china: mat('plain', 0xf4f1e8, { rough: 0.3, side: 'double' }),
    red: mat('plain', 0xb3261e, { rough: 0.55 }), broth: mat('plain', 0xc48a35, { rough: 0.12 }), milk: mat('plain', 0xe9dcb8, { rough: 0.15 }),
    noodle: mat('plain', 0xf2d98c, { rough: 0.5 }), pink: mat('plain', 0xf07f9a), meat: mat('plain', 0xcf9273), brown: mat('plain', 0x6e4127),
    nori: mat('plain', 0x18261b), green: mat('plain', 0x5fa644, { side: 'double' }), yolk: mat('plain', 0xf2a01d),
    steel: mat('metal', 0xb9bdc2, { rough: 0.34 }), sack: mat('plain', 0xd8ccae, { rough: 0.97 }), straw: mat('plain', 0xc9a45c, { rough: 0.95 }),
    brick: mat('brick', 0xa3573d), fire: mat('glow', 0xff7a2a, { power: 1.4 }), bulb: mat('glow', 0xffe2a8, { power: 1.8 }),
    futon: mat('plain', 0xece7d8, { rough: 0.97 }), blue: mat('plain', 0x4a6a8e, { rough: 0.97 }), rose: mat('plain', 0xb8566a, { rough: 0.97 }),
  };
  const glows = [], steamSrc = [];

  /* ================= 뼈대: 바닥·벽·지붕 ================= */
  B.box(M.stone, 8.9, 0, 10.4, XF, 0.08, 21.6);                       // 가게 앞 디딤돌
  B.box(M.pave, XF, 0, Z0, X0, F0, Z1);                               // 카운터 자리 바닥(판석)
  B.box(M.concrete, X0, 0, Z0, XP + 0.2, F1, Z1);                     // 주방 바닥
  B.box(M.floorDark, XP + 0.2, 0, Z0, X1, F1, Z1);                    // 창고 바닥
  B.box(M.stone, 17.5, 0, Z1, 19.1, 0.1, 22.7);                       // 옆문 디딤돌

  // 본채 벽(아래·위층을 한 번에)
  wall(B, M.white, 'x', Z0, Z0 + 0.2, X0, X1, F1, EAVE, [{ u0: 14, u1: 15.6, ys: [[1.5, 2.4], [4.0, 5.0]] }, { u0: 18.2, u1: 19.2, ys: [[1.9, 2.5]] }]);
  wall(B, M.white, 'x', Z1 - 0.2, Z1, X0, X1, F1, EAVE, [{ u0: 14, u1: 15.6, ys: [[4.0, 5.0]] }, { u0: 17.7, u1: 18.9, ys: [[F1, 2.4], [4.0, 5.0]] }]);
  wall(B, M.white, 'z', X1 - 0.2, X1, Z0 + 0.2, Z1 - 0.2, F1, EAVE, [{ u0: 18, u1: 19.4, ys: [[1.3, 2.3], [4.0, 5.0]] }]);
  wall(B, M.white, 'z', X0, X0 + 0.2, Z0 + 0.2, Z1 - 0.2, 2.6, EAVE, [{ u0: 10.9, u1: 12.3, ys: [[4.0, 5.0]] }, { u0: 19.7, u1: 21.1, ys: [[4.0, 5.0]] }]);   // 서쪽은 아래가 트였다
  windowUnit(B, 'x', Z0, Z0 + 0.2, 14, 15.6, 1.5, 2.4, { out: -1 }); windowUnit(B, 'x', Z0, Z0 + 0.2, 14, 15.6, 4.0, 5.0, { out: -1 });
  windowUnit(B, 'x', Z0, Z0 + 0.2, 18.2, 19.2, 1.9, 2.5, { out: -1, ny: 1 });
  windowUnit(B, 'x', Z1 - 0.2, Z1, 14, 15.6, 4.0, 5.0, { out: 1 }); windowUnit(B, 'x', Z1 - 0.2, Z1, 17.7, 18.9, 4.0, 5.0, { out: 1 });
  windowUnit(B, 'z', X1 - 0.2, X1, 18, 19.4, 1.3, 2.3, { out: 1 }); windowUnit(B, 'z', X1 - 0.2, X1, 18, 19.4, 4.0, 5.0, { out: 1 });
  windowUnit(B, 'z', X0, X0 + 0.2, 10.9, 12.3, 4.0, 5.0, { out: -1 }); windowUnit(B, 'z', X0, X0 + 0.2, 19.7, 21.1, 4.0, 5.0, { out: -1 });
  doorUnit(B, 'x', Z1 - 0.2, Z1, 17.7, 18.9, F1, 2.4, { inward: -1 });                                       // 옆마당으로 나가는 문
  // 주방·창고 사이 벽과 문(짧은 포렴)
  wall(B, M.white, 'z', XP, XP + 0.2, Z0 + 0.2, Z1 - 0.2, F1, 3.0, [{ u0: 17.6, u1: 19.0, ys: [[F1, 2.4]] }]);
  doorUnit(B, 'z', XP, XP + 0.2, 17.6, 19.0, F1, 2.4, { leaf: null });
  noren(B, 'z', XP + 0.1, 17.65, 18.95, 2.36, 0.6, '', { n: 3, color: '#1f3a6e' });
  // 서쪽 트인 면: 가운데 기둥과 인방
  B.box(M.beam, X0, F0, 15.9, X0 + 0.2, 2.6, 16.1);
  B.box(M.beam, X0 - 0.04, 2.6, Z0 + 0.2, X0 + 0.24, 2.84, Z1 - 0.2, false);
  // 바깥 치장: 모서리 기둥·중인방·아랫도리 널
  for (const [x, z] of [[X0, Z0], [X1, Z0], [X0, Z1], [X1, Z1], [XP + 0.1, Z0], [XP + 0.1, Z1], [X1, 16]]) B.box(M.beam, x - 0.13, 0, z - 0.13, x + 0.13, EAVE, z + 0.13, false);
  B.box(M.beam, X0, 2.96, Z0 - 0.03, X1 + 0.03, 3.2, Z0, false); B.box(M.beam, X0, 2.96, Z1, X1 + 0.03, 3.2, Z1 + 0.03, false); B.box(M.beam, X1, 2.96, Z0, X1 + 0.03, 3.2, Z1, false);
  B.box(C.plank, X0, 0, Z0 - 0.035, X1, 1.1, Z0, false); B.box(C.plank, X1, 0, Z0, X1 + 0.035, 1.1, Z1, false);
  B.box(C.plank, X0, 0, Z1, 17.6, 1.1, Z1 + 0.035, false); B.box(C.plank, 19.0, 0, Z1, X1, 1.1, Z1 + 0.035, false);

  // 다락 바닥(계단 구멍 x 19.5~20.8, z 12~16.7)과 그 밑 장선
  B.box(M.floor, X0 + 0.2, 3.0, Z0 + 0.2, 19.5, F2, Z1 - 0.2);
  B.box(M.floor, 19.5, 3.0, Z0 + 0.2, X1 - 0.2, F2, 12.0); B.box(M.floor, 19.5, 3.0, 16.7, X1 - 0.2, F2, Z1 - 0.2);
  for (let z = 11.5; z < 21.5; z += 1.5) B.box(M.beam, X0 + 0.2, 2.84, z - 0.06, z > 11.9 && z < 16.8 ? 19.5 : X1 - 0.2, 3.0, z + 0.06, false);
  // 계단: 창고 동벽을 따라 북으로 오른다
  stairs(B, M.beamLight, 'z', 12.0, 1, F1, F2, 19.6, 20.8, 0.3);
  for (let j = 0; j < 14; j++) addCollider(19.5, 3.0 - j * 0.2, 12 + j * 0.3, 19.58, 4.0 - j * 0.2, 12.3 + j * 0.3);   // 계단 옆 난간(막힘)
  beamBetween(B, M.beam, V(19.54, 1.35, 16.2), V(19.54, 4.15, 12.0), 0.07, 0.07);
  beamBetween(B, M.beam, V(19.54, 0.85, 16.2), V(19.54, 3.65, 12.0), 0.04, 0.04);
  for (let j = 0; j <= 14; j += 2) { const z = 12 + j * 0.3, y = 3.2 - j * 0.2; B.box(M.beam, 19.5, Math.max(F1, y - 0.2), z - 0.035, 19.58, y + 0.98, z + 0.035, false); }
  railing(B, M.beam, [[19.52, 12.0], [19.52, 16.68], [20.8, 16.68]], F2, 1.0);

  // 다락 칸막이(다다미방 | 마루)와 미닫이
  wall(B, M.white, 'z', XP, XP + 0.12, Z0 + 0.2, Z1 - 0.2, F2, 5.5, [{ u0: 13.6, u1: 15.0, ys: [[F2, 5.3]] }]);
  doorUnit(B, 'z', XP, XP + 0.12, 13.6, 15.0, F2, 5.3, { leaf: 'slide', paper: true, inward: 1 });
  B.box(M.beam, XP - 0.04, 5.5, Z0 + 0.2, XP + 0.16, 5.62, Z1 - 0.2, false);
  B.box(M.tatami, X0 + 0.2, F2, Z0 + 0.2, XP, F2 + 0.04, Z1 - 0.2);
  // 다락 대들보와 동자기둥
  for (const z of [13, 16, 19]) { B.box(M.beam, X0 + 0.2, EAVE, z - 0.09, X1 - 0.2, EAVE + 0.2, z + 0.09, false); B.box(M.beam, 16.67, EAVE + 0.2, z - 0.08, 16.83, EAVE + RISE - 0.15, z + 0.08, false); }
  B.box(M.beam, 16.66, EAVE + RISE - 0.3, Z0 + 0.2, 16.84, EAVE + RISE - 0.12, Z1 - 0.2, false);   // 마룻대

  gableRoof(B, C.tile, X0, Z0, X1, Z1, EAVE, RISE, { ridge: 'z', gable: M.white });

  // 가게 앞 달개지붕(처마 x 8.7 → 본채 벽)
  {
    const ex = 8.7, ey = 2.55, tx = X0 + 0.05, ty = 3.45, za = 9.6, zb = 22.4, len = Math.hypot(tx - ex, ty - ey);
    tilePanel(B, C.tile, V(ex, ey + 0.05, za), V(0, 0, 1), V(tx - ex, ty - ey, 0).normalize(), zb - za, len);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([ex, ey, za, ex, ey, zb, tx, ty, zb, tx, ty, za], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, zb - za, 0, zb - za, len, 0, len], 2));
    g.setIndex([0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2]); g.computeVertexNormals();
    B.geo(M.beam, g);
    beamBetween(B, M.beam, V(ex, ey, za), V(ex, ey, zb), 0.07, 0.14);
    for (const z of [za, zb]) beamBetween(B, M.beam, V(ex, ey - 0.02, z), V(tx, ty - 0.02, z), 0.05, 0.2);
    for (let z = Z0 + 0.4; z < Z1; z += 0.62) beamBetween(B, M.beam, V(ex + 0.05, ey - 0.07, z), V(X0, 3.38, z), 0.07, 0.11);
    B.box(M.beam, X0 - 0.14, 3.42, za, X0, 3.6, zb, false);                                               // 벽과 만나는 자리의 누름대
    // 앞 기둥·도리, 양옆 널벽(살창)
    for (const z of [Z0, 15.92, Z1 - 0.16]) B.box(M.beam, XF, 0, z, XF + 0.16, 2.4, z + 0.16);
    B.box(M.beam, XF - 0.02, 2.4, Z0, XF + 0.18, 2.62, Z1, false);
    for (const [f0, f1] of [[Z0, Z0 + 0.15], [Z1 - 0.15, Z1]]) {
      wall(B, C.plank, 'x', f0, f1, XF, X0, 0, 2.4, [{ u0: 10.3, u1: 11.9, ys: [[1.1, 2.1]] }]);
      B.prism(C.plank, 'z', [[XF, 2.4], [X0, 2.4], [X0, 3.4], [XF, 2.7]], f0, f1);
      const fm = (f0 + f1) / 2;
      for (let x = 10.3; x <= 11.91; x += 0.16) B.box(M.beam, x - 0.02, 1.1, fm - 0.03, x + 0.02, 2.1, fm + 0.03, false);
      B.box(M.beam, 10.24, 1.04, f0 - 0.03, 11.96, 1.1, f1 + 0.03, false); B.box(M.beam, 10.24, 2.1, f0 - 0.03, 11.96, 2.16, f1 + 0.03, false);
      addCollider(10.3, 1.1, fm - 0.03, 11.9, 2.1, fm + 0.03);
    }
  }

  /* ================= 간판·포렴·등롱 ================= */
  // arch.noren은 z 방향으로 걸면 글자 순서가 뒤집힌다 → 거꾸로 적어 넘긴다(큰길에서 읽을 때 북→남)
  const NOREN = { color: '#f1ead8', ink: '#b3261e', flip: true };
  noren(B, 'z', XF + 0.08, 10.3, 15.8, 2.38, 0.8, 'ラーメン', NOREN);
  noren(B, 'z', XF + 0.08, 16.2, 21.7, 2.38, 0.8, ' 一楽 ', NOREN);
  noren(B, 'z', X0 + 0.1, 19.6, 21.6, 2.58, 0.75, '', { n: 3, color: '#1f3a6e' });                         // 주방 드나드는 자리
  signBoard(B, 'ラーメン一楽', 11.3, 4.12, 16, -PI / 2, 5.8, 1.1, { bg: '#f3ecd9', color: '#1a1410', both: false, depth: 0.08 });
  for (const z of [13.6, 16, 18.4]) {                                                                      // 간판 버팀대(지붕 위에 선다)
    B.box(M.beam, 11.32, 3.1, z - 0.04, 11.4, 4.6, z + 0.04, false);
    beamBetween(B, M.beam, V(11.4, 4.4, z), V(12.5, 3.9, z), 0.05, 0.05);
  }
  for (const z of [10.7, 21.3]) {                                                                          // 붉은 등롱
    const p = lantern(B, 9.25, 1.98, z, { r: 0.22, h: 0.6, text: 'ラ｜メン', ink: '#1a1410' });
    B.geo(M.beam, tube([V(XF + 0.05, 2.5, z), V(9.25, 2.5, z)], 0.015, 5));
    glows.push([p[0], p[1], p[2], 1.3]);
  }
  // 차림표 널(인방 밑에 줄지어 매달린 나무 패)
  const MENU = ['味噌ラ｜メン', '醤油ラ｜メン', '豚骨ラ｜メン', '塩ラ｜メン', 'チャ｜シュ｜メン', 'ネギラ｜メン', 'ワンタンメン', '大盛', '替玉', '餃子', 'ライス'];
  MENU.forEach((t, i) => {
    const z = 10.75 + i * 0.47 + (i > 9 ? 0.25 : 0);
    signBoard(B, t, X0 - 0.1, 2.24, z + (z > 15.75 ? 0.5 : 0), -PI / 2, 0.2, 0.6, { vertical: true, both: false, bg: '#ead7a6', depth: 0.03, pad: 0.08 });
  });
  // 세워 둔 간판(가게 남서쪽 길가)
  for (const [s, t, col] of [[1, '営業中', '#b3261e'], [-1, 'ラ｜メン', '#1a1410']]) {
    const m = mat4(8.1, 0.47, 22.9 + s * 0.13, -0.22, s > 0 ? 0 : PI, 0);
    B.geo(M.beam, boxG(0.56, 0.96, 0.03), m);
    B.geo(textMat(t, { w: 128, h: 256, vertical: true, color: col, bg: '#f3ecd9', pad: 0.1 }), new THREE.PlaneGeometry(0.46, 0.86), m.clone().multiply(mat4(0, 0, 0.017)));
  }
  addCollider(7.82, 0, 22.65, 8.38, 0.95, 23.15);

  /* ================= 부품 묶음 ================= */
  const BOWL = [[0, 0], [0.05, 0], [0.05, 0.012], [0.075, 0.03], [0.105, 0.06], [0.122, 0.09], [0.125, 0.094], [0.119, 0.09], [0.1, 0.06], [0.07, 0.032], [0, 0.022]];
  const bowlParts = K => { K.geo(C.china, lathe(BOWL, 28)); K.geo(C.red, lathe([[0.1166, 0.077], [0.1228, 0.088]], 28)); K.geo(C.red, lathe([[0.051, 0.001], [0.051, 0.011]], 28)); };
  const bowlKit = kit(bowlParts);
  const stackKit = kit(K => { for (let i = 0; i < 6; i++) { const m = mat4(0, i * 0.034, 0, 0, i * 0.7); K.geo(C.china, lathe(BOWL, 20), m); K.geo(C.red, lathe([[0.1166, 0.077], [0.1228, 0.088]], 20), m); } });

  // 라멘 한 그릇: 국물·면발·나루토마키·차슈·김·파·멘마·달걀·젓가락·렌게
  const ramenKit = kit(K => {
    const R = rng(71);
    bowlParts(K);
    K.geo(C.broth, disc(0.108, 28), mat4(0, 0.077, 0));
    for (let i = 0; i < 18; i++) {
      const a = R() * PI * 2, b = a + PI * (0.55 + R() * 0.9), r = 0.09;
      K.geo(C.noodle, wavy(V(Math.cos(a) * r, 0.078 + R() * 0.004, Math.sin(a) * r), V(Math.cos(b) * r, 0.078 + R() * 0.004, Math.sin(b) * r), 0.006 + R() * 0.004, 0.022 + R() * 0.01, 0.0031, R() * 6.28, 0.007));
    }
    for (const [x, z, ry, rx] of [[0.035, 0.05, 0.3, 0.12], [0.062, 0.022, 1.4, -0.1]]) {                  // 나루토마키
      const m = mat4(x, 0.09, z, rx, ry, 0.08);
      K.geo(C.china, scallop(0.022, 0.006), m);
      const pts = []; for (let i = 0; i <= 44; i++) { const t = i / 44, a = t * 2.4 * PI * 2, r = 0.0025 + t * 0.014; pts.push(V(Math.cos(a) * r, 0.0034, Math.sin(a) * r)); }
      K.geo(C.pink, tube(pts, 0.0016, 4), m);
    }
    for (const [x, z, ry, rz] of [[-0.035, -0.04, 0.2, 0.1], [-0.005, -0.058, 0.9, -0.08], [-0.058, -0.008, -0.5, 0.14]]) {   // 차슈
      const m = mat4(x, 0.091, z, 0, ry, rz, [1, 1, 0.82]);
      K.geo(C.meat, cyl(0.038, 0.038, 0.006, 20), m);
      K.geo(C.brown, tor(0.038, 0.0034, 5, 20), m.clone().multiply(mat4(0, 0, 0, PI / 2)));
      K.geo(C.china, tor(0.017, 0.003, 4, 14, PI * 1.5), m.clone().multiply(mat4(0.004, 0.0015, 0, PI / 2)));
    }
    for (const [x, ry] of [[-0.03, 0.25], [0.035, -0.2]]) K.geo(C.nori, boxG(0.06, 0.075, 0.0016), mat4(x, 0.112, -0.098 + Math.abs(x) * 0.25, -0.3, ry));   // 김
    for (let i = 0; i < 16; i++) K.geo(C.green, tor(0.0055, 0.002, 4, 8), mat4((R() - 0.5) * 0.07, 0.089 + R() * 0.004, (R() - 0.5) * 0.07, PI / 2 + (R() - 0.5) * 0.6, R() * 3));   // 파
    for (let i = 0; i < 4; i++) K.geo(C.straw, boxG(0.036, 0.004, 0.009), mat4(0.052 + i * 0.004, 0.088 + i * 0.002, -0.035 + i * 0.007, 0, 0.5 + i * 0.25));   // 멘마
    {                                                                                                      // 반숙 달걀 반쪽
      const m = mat4(-0.05, 0.097, 0.045, 0.15, 0.6);
      K.geo(C.china, new THREE.SphereGeometry(1, 14, 7, 0, PI * 2, PI / 2, PI / 2), m.clone().multiply(mat4(0, 0, 0, 0, 0, 0, [0.024, 0.017, 0.03])));
      K.geo(C.china, disc(1, 16), m.clone().multiply(mat4(0, 0, 0, 0, 0, 0, [0.024, 1, 0.03])));
      K.geo(C.yolk, disc(1, 14), m.clone().multiply(mat4(0, 0.0006, 0, 0, 0, 0, [0.012, 1, 0.015])));
    }
    K.geo(M.beam, tube([V(0.088, 0.0985, 0.16), V(0.108, 0.0985, -0.1)], t => 0.0036 - 0.0016 * t, 6));    // 젓가락
    K.geo(M.beam, tube([V(0.102, 0.0985, 0.158), V(0.114, 0.0985, -0.102)], t => 0.0036 - 0.0016 * t, 6));
    K.geo(C.china, new THREE.SphereGeometry(1, 12, 6, 0, PI * 2, PI / 2, PI / 2), mat4(0.005, 0.09, 0.07, 0, 0.3, 0, [0.02, 0.011, 0.03]));   // 렌게
    K.geo(C.china, tube([V(0.012, 0.086, 0.094), V(0.022, 0.094, 0.115), V(0.034, 0.1, 0.14), V(0.04, 0.103, 0.158)], 0.0055, 6));
  });

  // 둥근 의자
  const stoolKit = kit(K => {
    K.geo(C.red, lathe([[0, 0.6], [0.17, 0.6], [0.192, 0.62], [0.196, 0.655], [0.18, 0.685], [0.1, 0.702], [0, 0.708]], 22));
    K.geo(M.beam, cyl(0.172, 0.172, 0.03, 22), mat4(0, 0.587, 0));
    for (let i = 0; i < 4; i++) { const a = PI / 4 + i * PI / 2, c = Math.cos(a), s = Math.sin(a); beamBetween(K, M.beam, V(c * 0.12, 0.58, s * 0.12), V(c * 0.2, 0, s * 0.2), 0.036, 0.036); }
    K.geo(M.iron, tor(0.165, 0.011, 6, 22), mat4(0, 0.22, 0, PI / 2));
  });

  // 젓가락 통 + 양념(간장·시치미·고추기름)
  const condKit = kit(K => {
    const R = rng(5);
    K.geo(M.beam, lathe([[0, 0], [0.034, 0], [0.036, 0.1], [0.031, 0.1], [0.029, 0.008], [0, 0.008]], 12));
    for (let i = 0; i < 12; i++) { const a = R() * 6.28, r = R() * 0.02; K.geo(M.beamLight, tube([V(Math.cos(a) * r, 0.01, Math.sin(a) * r), V(Math.cos(a) * r * 1.9, 0.2 + R() * 0.02, Math.sin(a) * r * 1.9)], 0.003, 4)); }
    K.geo(C.brown, lathe([[0, 0], [0.026, 0], [0.028, 0.06], [0.012, 0.085], [0.012, 0.1]], 12), mat4(0.09, 0, 0.01));          // 간장병
    K.geo(C.red, cyl(0.014, 0.014, 0.018, 10), mat4(0.09, 0.108, 0.01));
    K.geo(C.red, lathe([[0, 0], [0.018, 0], [0.02, 0.05], [0.014, 0.058]], 10), mat4(0.15, 0, -0.01));                            // 시치미
    K.geo(C.steel, cyl(0.015, 0.015, 0.012, 10), mat4(0.15, 0.064, -0.01));
    K.geo(C.china, lathe([[0, 0], [0.028, 0], [0.034, 0.03], [0.03, 0.045], [0.026, 0.03], [0, 0.008]], 12), mat4(0.21, 0, 0.015));   // 고추기름 단지
    K.geo(C.red, disc(0.027, 12), mat4(0.21, 0.032, 0.015));
  });
  const glassKit = kit(K => K.geo(M.glass, lathe([[0, 0], [0.028, 0], [0.034, 0.1], [0.031, 0.1], [0.026, 0.006], [0, 0.006]], 12)));

  // 면 사리(생면 한 덩이)
  const nestKit = kit(K => { const R = rng(9); for (let i = 0; i < 9; i++) { const a = R() * 6.28, b = a + PI * (0.6 + R() * 0.8), r = 0.05; K.geo(C.noodle, wavy(V(Math.cos(a) * r, 0.006 + i * 0.003, Math.sin(a) * r), V(Math.cos(b) * r, 0.006 + i * 0.003, Math.sin(b) * r), 0.008, 0.024, 0.0032, R() * 6, 0.012)); } });

  // 국자
  const ladleKit = kit(K => {
    K.geo(C.steel, lathe([[0, -0.05], [0.036, -0.036], [0.05, 0], [0.046, 0], [0.032, -0.033], [0, -0.045]], 14));
    K.geo(C.steel, tube([V(0.048, -0.002, 0), V(0.06, 0.12, 0), V(0.065, 0.3, 0), V(0.06, 0.36, 0), V(0.04, 0.38, 0), V(0.03, 0.36, 0)], 0.006, 6));
  });
  // 테보(면 건지개)
  const teboKit = kit(K => {
    K.geo(C.steel, lathe([[0, -0.16], [0.045, -0.155], [0.06, 0], [0.065, 0.004], [0.056, 0], [0.042, -0.15], [0, -0.154]], 12));
    for (let i = 0; i < 4; i++) K.geo(C.steel, tor(0.047 + i * 0.004, 0.0025, 4, 12), mat4(0, -0.13 + i * 0.04, 0, PI / 2));
    K.geo(C.steel, tube([V(0.058, 0, 0), V(0.1, 0.025, 0), V(0.2, 0.06, 0)], 0.006, 6));
    K.geo(M.beamLight, cyl(0.013, 0.015, 0.16, 8), mat4(0.27, 0.085, 0, 0, 0, -PI / 2 + 0.33));
  });
  // 육수 솥(寸胴)
  const potKit = (brothMat, lid) => kit(K => {
    K.geo(C.steel, lathe([[0, 0], [0.26, 0], [0.27, 0.012], [0.27, 0.5], [0.278, 0.508], [0.27, 0.516], [0.258, 0.508], [0.258, 0.025], [0, 0.02]], 28));
    K.geo(brothMat, disc(0.257, 28), mat4(0, 0.43, 0));
    for (const s of [1, -1]) K.geo(C.steel, tor(0.055, 0.009, 6, 12, PI), mat4(0, 0.42, s * 0.27, s * PI / 2));
    for (const [x, z, ry] of [[0.08, 0.05, 0.4], [-0.1, -0.06, 1.7], [0.02, -0.14, 2.6]]) {              // 떠 있는 돼지 뼈
      const m = mat4(x, 0.44, z, 0, ry, 0.2);
      K.geo(C.china, cyl(0.014, 0.014, 0.1, 8), m.clone().multiply(mat4(0, 0, 0, 0, 0, PI / 2)));
      for (const e of [-0.05, 0.05]) K.geo(C.china, sph(0.021, 8, 6), m.clone().multiply(mat4(e, 0, 0, 0, 0, 0, [1, 0.9, 1.25])));
    }
    K.geo(C.green, tube([V(-0.16, 0.435, 0.1), V(-0.05, 0.44, 0.15), V(0.07, 0.435, 0.17)], 0.009, 6));   // 대파
    K.geo(C.nori, boxG(0.12, 0.003, 0.07), mat4(-0.12, 0.433, -0.14, 0, 0.5));                            // 다시마
    if (lid) {
      const m = mat4(0.09, 0.535, 0.02, 0, 0, 0.16);
      K.geo(C.steel, lathe([[0, 0.022], [0.2, 0.014], [0.285, 0], [0.288, 0.006], [0.2, 0.024], [0, 0.034]], 28), m);
      K.geo(C.brown, lathe([[0, 0.03], [0.014, 0.034], [0.03, 0.06], [0.026, 0.07], [0, 0.072]], 10), m);
    }
  });

  /* ================= 카운터 자리 ================= */
  B.box(C.plank, 12.55, F0, Z0 + 0.15, 13.15, 1.1, 19.45);                                                // 카운터 몸
  B.box(M.beamLight, 12.25, 1.1, Z0 + 0.15, 13.02, CT, 19.5);                                             // 윗널
  B.box(M.beam, 13.0, 1.1, Z0 + 0.15, 13.26, 1.3, 19.5, false);                                           // 주방 쪽 높은 턱
  B.box(M.beam, 12.55, F0, 19.45, 13.15, CT, 19.5, false);
  for (let z = 10.6; z < 19.4; z += 0.7) B.box(M.beam, 12.52, F0, z - 0.03, 12.55, 1.1, z + 0.03, false);  // 앞판 띠장
  B.geo(M.iron, tube([V(12.4, 0.42, 10.2), V(12.4, 0.42, 19.4)], 0.02, 8));                               // 발걸이
  for (let z = 10.6; z < 19.4; z += 2.2) B.geo(M.iron, tube([V(12.55, 0.42, z), V(12.4, 0.42, z)], 0.014, 6));
  const SEATS = [11.3, 12.7, 14.1, 15.5, 16.9, 18.3];
  for (const z of SEATS) { place(B, stoolKit, 11.85, F0, z, z); addCollider(11.67, F0, z - 0.18, 12.03, 0.85, z + 0.18); }
  for (const [z, ry] of [[12.7, -1.5], [15.5, -1.7], [18.3, -1.4]]) { place(B, ramenKit, 12.66, CT, z, ry, 1.15); steamSrc.push({ p: [12.66, CT + 0.1, z], n: 10, h: 0.6, r: 0.1, s0: 0.12, s1: 0.36, a: 0.24, sp: 0.42 }); }
  for (const z of SEATS) place(B, glassKit, 12.9, CT, z - 0.3);
  for (const z of [11.6, 14.3, 17.3]) place(B, condKit, 13.13, 1.3, z, PI / 2);
  for (const z of [10.6, 13.4, 16.5, 18.9]) place(B, stackKit, 13.13, 1.3, z);
  // 물 주전자
  B.geo(C.steel, lathe([[0, 0], [0.07, 0], [0.085, 0.05], [0.08, 0.17], [0.05, 0.2], [0.045, 0.21], [0, 0.215]], 16), mat4(12.72, CT, 10.75));
  B.geo(C.steel, tor(0.06, 0.008, 5, 12, PI), mat4(12.72, CT + 0.11, 10.83, 0, PI / 2, -PI / 2));
  B.geo(C.steel, tube([V(12.72, CT + 0.1, 10.67), V(12.72, CT + 0.17, 10.6), V(12.72, CT + 0.2, 10.56)], 0.012, 6));
  // 걸상 옆 배달통(오카모치)
  {
    const x = 10.0, z = 21.45;
    B.box(M.beamLight, x - 0.2, F0, z - 0.17, x + 0.2, F0 + 0.62, z + 0.17);
    for (const xx of [x - 0.2, x + 0.17]) B.box(M.beam, xx, F0 + 0.62, z - 0.03, xx + 0.03, F0 + 0.8, z + 0.03, false);
    B.box(M.beam, x - 0.2, F0 + 0.77, z - 0.035, x + 0.2, F0 + 0.81, z + 0.035, false);
    B.box(M.beam, x - 0.21, F0 + 0.02, z - 0.19, x + 0.21, F0 + 0.06, z - 0.17, false); B.box(M.beam, x - 0.21, F0 + 0.58, z - 0.19, x + 0.21, F0 + 0.62, z - 0.17, false);
    B.geo(textMat('一楽', { w: 128, h: 256, vertical: true, color: '#b3261e' }), new THREE.PlaneGeometry(0.2, 0.4), mat4(x, F0 + 0.32, z - 0.176, 0, PI));
  }

  /* ================= 주방 ================= */
  // 화덕: 벽돌 몸에 쇠 윗판, 아궁이 셋
  B.box(C.brick, 16.1, F1, 11.0, XP, 0.96, 16.0);
  B.box(C.steel, 16.05, 0.96, 10.95, XP, 1.0, 16.05, false);
  const BURN = [12.0, 13.7, 15.3];
  for (const z of BURN) {
    B.geo(M.iron, tor(0.22, 0.016, 6, 20), mat4(16.55, 1.01, z, PI / 2));
    for (let i = 0; i < 4; i++) B.geo(M.iron, boxG(0.26, 0.02, 0.025), mat4(16.55, 1.012, z, 0, i * PI / 4));
    B.box(M.iron, 16.07, 0.4, z - 0.22, 16.1, 0.78, z + 0.22, false);                                      // 아궁이 문
    for (let k = 0; k < 4; k++) B.box(C.fire, 16.062, 0.47 + k * 0.07, z - 0.15, 16.07, 0.5 + k * 0.07, z + 0.15, false);
    B.geo(M.iron, tor(0.035, 0.007, 5, 10, PI), mat4(16.06, 0.34, z, 0, PI / 2, PI));
  }
  place(B, potKit(C.broth, false), 16.55, 1.02, BURN[0]);
  place(B, potKit(C.milk, true), 16.55, 1.02, BURN[1], 0.8);
  place(B, ladleKit, 16.4, 1.47, BURN[0] - 0.12, 2.6, 1, 0, 0.25);
  // 면 삶는 솥과 테보 넷
  B.geo(C.steel, lathe([[0, 0], [0.3, 0], [0.33, 0.02], [0.33, 0.3], [0.34, 0.31], [0.33, 0.318], [0.318, 0.31], [0.318, 0.03], [0, 0.025]], 28), mat4(16.55, 1.02, BURN[2]));
  B.geo(M.water, disc(0.317, 28), mat4(16.55, 1.27, BURN[2]));
  for (const s of [1, -1]) B.geo(C.steel, tor(0.055, 0.009, 6, 12, PI), mat4(16.55, 1.25, BURN[2] + s * 0.33, s * PI / 2));
  for (let i = 0; i < 4; i++) {
    const a = PI + (i - 1.5) * 0.62, x = 16.55 + Math.cos(a) * 0.2, z = BURN[2] - Math.sin(a) * 0.2;
    place(B, teboKit, x, 1.345, z, a);
    if (i % 2) place(B, nestKit, x, 1.25, z, i, 0.8);
  }
  addCollider(16.2, 1.0, 11.6, 16.95, 1.55, 15.7);
  steamSrc.push({ p: [16.55, 1.5, BURN[0]], n: 26, h: 1.2, r: 0.24, s0: 0.35, s1: 0.95, a: 0.26, sp: 0.3 }, { p: [16.62, 1.52, BURN[1]], n: 14, h: 1.0, r: 0.18, s0: 0.25, s1: 0.75, a: 0.22, sp: 0.28 },
    { p: [16.55, 1.36, BURN[2]], n: 26, h: 1.25, r: 0.28, s0: 0.35, s1: 0.95, a: 0.26, sp: 0.33 });
  // 연기받이와 연통(북벽을 뚫고 나가 지붕 위로)
  B.prism(C.steel, 'z', [[15.95, 2.1], [XP, 2.1], [XP, 2.8], [16.45, 2.8]], 10.9, 16.1);
  B.box(M.iron, 15.93, 2.06, 10.88, XP, 2.1, 16.12, false);
  B.geo(C.steel, tube([V(16.72, 2.6, 10.9), V(16.72, 2.6, 9.42), V(16.72, 2.75, 9.3), V(16.72, 6.2, 9.3)], 0.11, 10));
  B.geo(C.steel, lathe([[0.24, 0], [0.02, 0.14], [0, 0.14]], 12), mat4(16.72, 6.3, 9.3));
  for (const a of [0, 2.1, 4.2]) B.geo(M.iron, tube([V(16.72 + Math.cos(a) * 0.1, 6.18, 9.3 + Math.sin(a) * 0.1), V(16.72 + Math.cos(a) * 0.18, 6.32, 9.3 + Math.sin(a) * 0.18)], 0.01, 4));
  for (const y of [3.6, 4.6]) B.geo(M.iron, tor(0.12, 0.012, 5, 14), mat4(16.72, y, 9.3, PI / 2));
  steamSrc.push({ p: [16.72, 6.45, 9.3], n: 14, h: 2.6, r: 0.5, s0: 0.5, s1: 1.8, a: 0.2, sp: 0.2 });

  // 손질대(북벽): 도마·칼·파·차슈·면 상자·양념 단지·달걀
  {
    const y = 1.05;
    B.box(M.beamLight, 13.4, 0.99, Z0 + 0.2, 15.95, y, 10.92, false);
    for (const x of [13.45, 15.84]) for (const z of [10.26, 10.82]) B.box(M.beam, x, F1, z, x + 0.07, 0.99, z + 0.07, false);
    B.box(M.beam, 13.45, 0.45, 10.26, 15.9, 0.49, 10.89, false);
    addCollider(13.4, F1, Z0 + 0.2, 15.95, y, 10.92);
    for (const x of [13.75, 14.1, 14.45]) place(B, stackKit, x, 0.49, 10.6);
    B.geo(C.steel, lathe([[0, 0], [0.16, 0], [0.18, 0.02], [0.18, 0.26], [0.172, 0.26], [0.17, 0.03], [0, 0.02]], 18), mat4(15.3, 0.49, 10.58));   // 아래 선반의 빈 솥
    // 도마와 칼
    B.box(M.beamLight, 14.25, y, 10.42, 14.85, y + 0.035, 10.8, false);
    B.geo(C.steel, new THREE.ExtrudeGeometry(new THREE.Shape([[0, 0], [0.19, 0], [0.2, 0.012], [0.17, 0.05], [0, 0.05]].map(p => new THREE.Vector2(p[0], p[1]))), { depth: 0.002, bevelEnabled: false }), mat4(14.5, y + 0.04, 10.72, PI / 2, 0.4));
    B.geo(M.beam, cyl(0.012, 0.014, 0.11, 8), mat4(14.455, y + 0.045, 10.739, 0, 0.4, PI / 2));
    // 대파 두 대와 썬 파
    for (const [z, k] of [[10.5, 0], [10.55, 1]]) {
      B.geo(C.china, tube([V(14.28, y + 0.05, z), V(14.5, y + 0.05, z + 0.01)], 0.011, 6));
      B.geo(C.green, tube([V(14.5, y + 0.05, z + 0.01), V(14.66, y + 0.05, z + 0.02 + k * 0.02), V(14.8, y + 0.048, z + 0.06 * (k ? 1 : -0.5))], t => 0.011 - 0.005 * t, 6));
    }
    const R = rng(3);
    for (let i = 0; i < 26; i++) B.geo(C.green, tor(0.008, 0.003, 4, 8), mat4(14.33 + R() * 0.12, y + 0.04 + R() * 0.012, 10.66 + R() * 0.1, PI / 2 + (R() - 0.5), R() * 3));
    // 실로 묶은 차슈 덩이와 썬 조각
    B.geo(C.meat, cyl(0.045, 0.045, 0.24, 14), mat4(15.1, y + 0.05, 10.55, 0, 0.2, PI / 2));
    for (let i = 0; i < 6; i++) B.geo(C.sack, tor(0.046, 0.003, 4, 14), mat4(15.0 + i * 0.04, y + 0.05, 10.55 - (i - 2.5) * 0.008, 0, 0.2 + PI / 2));
    for (let i = 0; i < 4; i++) { const m = mat4(15.28 + i * 0.012, y + 0.01 + i * 0.006, 10.57 + i * 0.03, 0.1, 0, 0.12); B.geo(C.meat, cyl(0.045, 0.045, 0.007, 14), m); B.geo(C.brown, tor(0.045, 0.004, 4, 14), m.clone().multiply(mat4(0, 0, 0, PI / 2))); }
    // 면 상자(생면 사리 여섯)
    B.box(M.beamLight, 13.45, y, 10.3, 14.1, y + 0.012, 10.85, false);
    for (const [a, b, c, d] of [[13.45, 10.3, 14.1, 10.315], [13.45, 10.835, 14.1, 10.85], [13.45, 10.3, 13.465, 10.85], [14.085, 10.3, 14.1, 10.85]]) B.box(M.beamLight, a, y, b, c, y + 0.07, d, false);
    for (let i = 0; i < 6; i++) place(B, nestKit, 13.57 + (i % 3) * 0.2, y + 0.012, 10.45 + (i / 3 | 0) * 0.25, i * 1.3, 1.5);
    // 달걀 바구니
    B.geo(C.straw, lathe([[0, 0], [0.07, 0], [0.11, 0.05], [0.105, 0.05], [0.066, 0.008], [0, 0.008]], 14), mat4(15.72, y, 10.42));
    for (let i = 0; i < 7; i++) B.geo(C.china, sph(0.022, 8, 6), mat4(15.72 + Math.cos(i) * 0.045 * (i ? 1 : 0), y + 0.035 + (i ? 0 : 0.025), 10.42 + Math.sin(i) * 0.045 * (i ? 1 : 0), 0, i, 0, [1, 1.3, 1]));
    // 양념(다레) 단지
    for (const [x, z] of [[15.58, 10.76], [15.82, 10.72], [15.8, 10.54], [15.52, 10.58]]) {
      B.geo(C.brown, lathe([[0, 0], [0.05, 0], [0.07, 0.05], [0.066, 0.12], [0.05, 0.135], [0.042, 0.13], [0.058, 0.11], [0.06, 0.05], [0, 0.01]], 14), mat4(x, y, z));
      B.geo(M.beamLight, cyl(0.05, 0.05, 0.012, 12), mat4(x, y + 0.14, z));
    }
  }
  // 벽걸이 조리 도구(북벽 동쪽)
  B.geo(M.iron, tube([V(15.85, 1.95, 10.27), V(16.95, 1.95, 10.27)], 0.012, 6));
  place(B, ladleKit, 16.05, 1.6, 10.3, PI / 2, 1);
  place(B, teboKit, 16.3, 1.9, 10.3, 0, 1, 0, -PI / 2 + 0.05);
  place(B, teboKit, 16.5, 1.9, 10.3, 0, 1, 0, -PI / 2 - 0.04);
  for (const x of [16.72, 16.76]) B.geo(M.beamLight, tube([V(x, 1.93, 10.29), V(x + 0.005, 1.5, 10.29)], t => 0.006 - 0.003 * t, 5));   // 긴 젓가락
  // 개수대(화덕 남쪽)
  {
    const a = 16.3, b = XP, z0 = 16.25, z1 = 17.4, y = 1.0;
    for (const [x0, zz0, x1, zz1] of [[a, z0, b, z0 + 0.04], [a, z1 - 0.04, b, z1], [a, z0, a + 0.04, z1], [b - 0.04, z0, b, z1]]) B.box(C.steel, x0, y - 0.3, zz0, x1, y, zz1, false);
    B.box(C.steel, a, y - 0.32, z0, b, y - 0.3, z1, false);
    for (const x of [a, b - 0.05]) for (const z of [z0, z1 - 0.05]) B.box(C.steel, x, F1, z, x + 0.05, y - 0.32, z + 0.05, false);
    B.box(M.water, a + 0.04, y - 0.12, z0 + 0.04, b - 0.04, y - 0.1, z1 - 0.04, false);
    B.geo(C.steel, tube([V(b - 0.08, y, 16.8), V(b - 0.08, y + 0.28, 16.8), V(b - 0.14, y + 0.34, 16.8), V(b - 0.26, y + 0.32, 16.8), V(b - 0.3, y + 0.24, 16.8)], 0.016, 8));
    for (const z of [16.68, 16.92]) { B.geo(C.steel, cyl(0.012, 0.012, 0.06, 6), mat4(b - 0.08, y + 0.03, z)); B.geo(C.steel, boxG(0.02, 0.012, 0.07), mat4(b - 0.08, y + 0.065, z)); }
    place(B, bowlKit, a + 0.25, y - 0.14, 16.6, 0, 1, 0.5); place(B, bowlKit, a + 0.3, y - 0.12, 17.0, 1, 1, -0.4, 0.3);
    addCollider(a, F1, z0, b, y, z1);
  }
  // 그릇 선반(남벽)
  {
    const x0 = 13.7, x1 = 16.5, z0 = 21.36, z1 = 21.8;
    for (const x of [x0, x1 - 0.06]) for (const z of [z0, z1 - 0.06]) B.box(M.beam, x, F1, z, x + 0.06, 2.3, z + 0.06, false);
    for (const y of [0.55, 1.1, 1.65, 2.2]) B.box(M.beamLight, x0, y, z0, x1, y + 0.035, z1, false);
    addCollider(x0, F1, z0, x1, 2.3, z1);
    for (let i = 0; i < 7; i++) place(B, stackKit, x0 + 0.2 + i * 0.37, 1.135, 21.58, i);
    for (let i = 0; i < 5; i++) place(B, stackKit, x0 + 0.2 + i * 0.37, 1.685, 21.58, i * 2);
    for (let i = 0; i < 4; i++) {                                                                          // 됫병
      const m = mat4(15.75 + i * 0.16, 1.685, 21.58 + (i % 2) * 0.05);
      B.geo(C.nori, lathe([[0, 0], [0.05, 0], [0.052, 0.22], [0.02, 0.3], [0.018, 0.38]], 12), m);
      B.geo(C.china, lathe([[0.0525, 0.06], [0.0525, 0.17]], 12), m); B.geo(C.red, cyl(0.02, 0.02, 0.03, 8), m.clone().multiply(mat4(0, 0.39, 0)));
    }
    B.geo(C.steel, lathe([[0, 0], [0.2, 0], [0.22, 0.02], [0.22, 0.34], [0.21, 0.34], [0.208, 0.03], [0, 0.02]], 18), mat4(14.1, 0.585, 21.58));
    B.geo(C.steel, lathe([[0, 0], [0.16, 0], [0.18, 0.02], [0.18, 0.28], [0.17, 0.28], [0.168, 0.03], [0, 0.02]], 18), mat4(14.7, 0.585, 21.58));
    for (let i = 0; i < 3; i++) B.geo(C.straw, lathe([[0, 0], [0.1, 0.01], [0.19, 0.06], [0.2, 0.065], [0.19, 0.068], [0.1, 0.02], [0, 0.01]], 16), mat4(15.5, 0.585 + i * 0.022, 21.58));   // 소쿠리
    for (let i = 0; i < 5; i++) { const x = x0 + 0.3 + i * 0.5; B.geo(C.brown, lathe([[0, 0], [0.07, 0], [0.1, 0.07], [0.09, 0.2], [0.06, 0.23], [0, 0.235]], 12), mat4(x, 2.235, 21.58)); B.geo(C.sack, tor(0.062, 0.006, 4, 12), mat4(x, 2.43, 21.58, PI / 2)); }
  }

  /* ================= 창고·준비실 ================= */
  // 밀가루 포대
  const sackKit = kit(K => {
    K.geo(C.sack, warp(pillow(0.4, 1, 0.27, 0.55), v => { v.y = Math.sign(v.y) * Math.pow(Math.abs(v.y), 0.6) * 0.14; }), mat4(0, 0.14, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.geo(C.sack, new THREE.ConeGeometry(0.03, 0.07, 6), mat4(sx * 0.385, 0.15, sz * 0.25, 0, 0, -sx * 1.3));   // 묶은 귀
    K.geo(C.straw, tube([V(-0.39, 0.15, -0.2), V(-0.4, 0.16, 0), V(-0.39, 0.15, 0.2)], 0.004, 4));          // 꿰맨 실
    K.geo(textMat('小麦粉', { w: 256, h: 128, color: '#8a2c22' }), new THREE.PlaneGeometry(0.42, 0.2), mat4(0, 0.284, 0, -PI / 2));
  });
  {
    const R = rng(21);
    for (const [x, y, z] of [[17.65, 0, 11.6], [17.65, 0, 12.55], [17.65, 0, 13.5], [17.65, 0, 14.45], [17.67, 0.25, 12.05], [17.66, 0.25, 13.0], [17.68, 0.25, 13.95], [17.66, 0.5, 12.5], [17.67, 0.5, 13.45], [17.66, 0.74, 13.0]])
      place(B, sackKit, x, F1 + y, z, PI / 2 + (R() - 0.5) * 0.25);
    addCollider(17.2, F1, 11.15, 18.0, 0.7, 14.95); addCollider(17.2, 0.7, 11.9, 18.0, 1.2, 14.0);
    // 풀어 놓은 포대와 됫박
    B.geo(C.sack, lathe([[0, 0], [0.2, 0], [0.25, 0.1], [0.25, 0.42], [0.27, 0.5], [0.255, 0.52], [0.235, 0.45], [0, 0.44]], 14), mat4(17.6, F1, 15.6));
    B.geo(C.sack, tor(0.26, 0.022, 6, 14), mat4(17.6, F1 + 0.5, 15.6, PI / 2));
    B.geo(C.china, warp(sph(0.23, 14, 8), v => { v.y = Math.max(0, v.y) * 0.35; }), mat4(17.6, F1 + 0.43, 15.6));
    B.box(M.beamLight, 17.52, F1 + 0.5, 15.5, 17.66, F1 + 0.58, 15.64, false);
    addCollider(17.33, F1, 15.33, 17.87, 0.75, 15.87);
  }
  // 살 상자와 채소
  const crateKit = kit(K => {
    const w = 0.3, d = 0.2, h = 0.3;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(M.beamLight, sx * w - 0.015, 0, sz * d - 0.015, sx * w + 0.015, h, sz * d + 0.015);
    for (const y of [0.02, 0.12, 0.22]) { for (const sz of [-1, 1]) K.box(M.beamLight, -w, y, sz * d + (sz > 0 ? 0.015 : -0.027), w, y + 0.07, sz * d + (sz > 0 ? 0.027 : -0.015)); for (const sx of [-1, 1]) K.box(M.beamLight, sx * w + (sx > 0 ? 0.015 : -0.027), y, -d, sx * w + (sx > 0 ? 0.027 : -0.015), y + 0.07, d); }
    for (let i = 0; i < 5; i++) K.box(M.beamLight, -w + 0.02 + i * 0.118, 0, -d, -w + 0.1 + i * 0.118, 0.012, d);
  });
  const negiKit = kit(K => { const R = rng(4); for (let i = 0; i < 9; i++) { const z = -0.13 + (i % 5) * 0.06 + R() * 0.02, y = 0.05 + (i / 5 | 0) * 0.035; K.geo(C.china, tube([V(-0.27, y, z), V(-0.02, y + 0.005, z)], 0.013, 6)); K.geo(C.green, tube([V(-0.02, y + 0.005, z), V(0.2, y + 0.02, z + (R() - 0.5) * 0.04), V(0.42, y + 0.07 + R() * 0.05, z + (R() - 0.5) * 0.1)], t => 0.013 - 0.007 * t, 6)); } });
  const onionKit = kit(K => { const R = rng(6); for (let i = 0; i < 14; i++) K.geo(C.straw, lathe([[0, 0], [0.03, 0.005], [0.046, 0.032], [0.04, 0.062], [0.012, 0.08], [0.005, 0.105]], 10), mat4(-0.2 + (i % 5) * 0.1 + R() * 0.02, 0.03 + (i / 10 | 0) * 0.07, -0.11 + ((i / 5 | 0) % 2) * 0.12 + R() * 0.03, (R() - 0.5) * 0.8, R() * 6, (R() - 0.5) * 0.8)); });
  const cabbageKit = kit(K => {
    for (const [x, z] of [[-0.14, 0], [0.14, 0.01]]) {
      K.geo(C.green, sph(0.115, 12, 9), mat4(x, 0.14, z, 0, 0, 0, [1, 0.88, 1]));
      for (let i = 0; i < 5; i++) K.geo(C.green, new THREE.SphereGeometry(0.128, 8, 6, 0, 1.7, 0.5, 1.7), mat4(x, 0.135, z, 0.15, i * 1.26 + x * 9, 0.1));
    }
  });
  const boneKit = kit(K => { const R = rng(8); for (let i = 0; i < 9; i++) { const m = mat4(-0.18 + (i % 3) * 0.17, 0.05 + (i / 3 | 0) * 0.05, (R() - 0.5) * 0.2, (R() - 0.5) * 0.5, R() * 3); K.geo(C.china, cyl(0.016, 0.02, 0.2, 7), m.clone().multiply(mat4(0, 0, 0, 0, 0, PI / 2))); for (const e of [-0.1, 0.1]) K.geo(C.china, sph(0.03, 8, 6), m.clone().multiply(mat4(e, 0, 0, 0, 0, 0, [1, 0.85, 1.3]))); } });
  for (const [x, y, z, ry, fill] of [[20.35, 0, 20.25, PI / 2, negiKit], [20.35, 0, 21.3, PI / 2 + 0.1, onionKit], [19.6, 0, 21.4, 0.05, cabbageKit], [20.33, 0.3, 21.28, PI / 2 - 0.08, boneKit], [20.35, 0, 19.5, PI / 2 - 0.05, null], [20.35, 0.3, 19.5, PI / 2 + 0.08, onionKit]]) {
    place(B, crateKit, x, F1 + y, z, ry); if (fill) place(B, fill, x, F1 + y, z, ry);
  }
  addCollider(20.1, F1, 19.9, 20.8, 0.55, 21.7); addCollider(20.1, 0.5, 20.95, 20.8, 0.85, 21.7); addCollider(19.25, F1, 21.15, 19.95, 0.55, 21.75); addCollider(20.1, F1, 19.15, 20.8, 0.85, 19.9);
  // 된장·간장 통
  const barrelKit = t => kit(K => {
    K.geo(M.beamLight, lathe([[0, 0], [0.27, 0], [0.31, 0.2], [0.325, 0.4], [0.31, 0.6], [0.28, 0.78], [0.26, 0.78], [0.26, 0.74], [0, 0.74]], 20));
    for (const [y, r] of [[0.1, 0.295], [0.2, 0.313], [0.6, 0.313], [0.7, 0.297]]) K.geo(C.straw, tor(r, 0.014, 5, 20), mat4(0, y, 0, PI / 2));
    K.geo(M.beam, cyl(0.2, 0.2, 0.03, 16), mat4(0, 0.755, 0)); K.geo(M.beam, boxG(0.3, 0.03, 0.05), mat4(0, 0.785, 0));
    K.geo(C.china, boxG(0.2, 0.3, 0.012), mat4(0, 0.4, 0.325));
    K.geo(textMat(t, { w: 128, h: 192, vertical: true, color: '#1a1410' }), new THREE.PlaneGeometry(0.18, 0.28), mat4(0, 0.4, 0.332));
  });
  place(B, barrelKit('味噌'), 20.2, F1, 10.75, -PI / 2 + 0.1); place(B, barrelKit('醤油'), 20.25, F1, 11.5, -PI / 2 - 0.1); place(B, barrelKit('味噌'), 19.55, F1, 10.7, PI + 0.3);
  addCollider(19.2, F1, 10.35, 20.6, 1.0, 11.85);
  // 선반(북벽): 단지·깡통·다시마·멸치
  {
    const x0 = 17.35, x1 = 19.05, z0 = Z0 + 0.2, z1 = 10.68;
    for (const x of [x0, x1 - 0.06]) for (const z of [z0 + 0.02, z1 - 0.06]) B.box(M.beam, x, F1, z, x + 0.06, 1.85, z + 0.06, false);
    for (const y of [0.5, 0.95, 1.4, 1.8]) B.box(M.beamLight, x0, y, z0, x1, y + 0.035, z1, false);
    addCollider(x0, F1, z0, x1, 1.85, z1);
    const R = rng(12);
    for (let i = 0; i < 5; i++) { const x = x0 + 0.2 + i * 0.33; B.geo(C.brown, lathe([[0, 0], [0.08, 0], [0.12, 0.08], [0.11, 0.24], [0.07, 0.28], [0, 0.285]], 12), mat4(x, 0.535, 10.44)); B.geo(M.beamLight, cyl(0.075, 0.075, 0.02, 12), mat4(x, 0.83, 10.44)); }
    for (let i = 0; i < 7; i++) { const x = x0 + 0.15 + i * 0.22; B.geo(C.steel, cyl(0.07, 0.07, 0.18 + (i % 2) * 0.05, 14), mat4(x, 1.075 + (i % 2) * 0.025, 10.42)); B.geo(i % 3 ? C.red : C.china, lathe([[0.0705, 0.03], [0.0705, 0.13]], 14), mat4(x, 0.985, 10.42)); }
    for (let i = 0; i < 4; i++) {                                                                          // 다시마 묶음
      const x = x0 + 0.25 + i * 0.3;
      for (let k = 0; k < 5; k++) B.geo(C.nori, warp(boxG(0.22, 0.006, 0.3, 4, 1, 6), v => { v.y += Math.sin(v.z * 22 + k) * 0.006 + Math.sin(v.x * 30 + i) * 0.004; }), mat4(x, 1.445 + k * 0.012, 10.44, 0, (R() - 0.5) * 0.2));
      B.geo(C.straw, tor(0.04, 0.005, 4, 10), mat4(x, 1.47, 10.44, 0, 0, 0, [2.9, 0.9, 1]));
    }
    B.geo(C.straw, lathe([[0, 0], [0.12, 0.01], [0.2, 0.07], [0.21, 0.075], [0.2, 0.08], [0.12, 0.022], [0, 0.012]], 16), mat4(18.75, 1.435, 10.44));   // 멸치 소쿠리
    for (let i = 0; i < 40; i++) B.geo(C.steel, sph(1, 6, 4), mat4(18.75 + (R() - 0.5) * 0.24, 1.46 + R() * 0.02, 10.44 + (R() - 0.5) * 0.24, 0, R() * 6, 0, [0.022, 0.004, 0.006]));
    for (let i = 0; i < 3; i++) place(B, stackKit, x0 + 0.25 + i * 0.4, 1.835, 10.44, i);
  }
  // 벽에 건 고추 타래와 마늘(주방 쪽 벽)
  {
    const R = rng(31);
    for (const z of [16.2, 16.6]) {
      B.geo(C.straw, tube([V(17.26, 2.3, z), V(17.26, 1.5, z)], 0.006, 4));
      for (let i = 0; i < 22; i++) { const a = R() * 6.28; B.geo(z < 16.4 ? C.red : C.china, z < 16.4 ? new THREE.ConeGeometry(0.011, 0.07, 6) : sph(0.022, 7, 5), mat4(17.27 + Math.abs(Math.cos(a)) * 0.03, 1.55 + i * 0.033, z + Math.sin(a) * 0.035, 2.4 + R() * 0.5, a)); }
    }
    B.geo(M.iron, tube([V(17.2, 2.32, 16.1), V(17.3, 2.32, 16.1)], 0.006, 4));
  }
  // 빗자루와 물통(옆문 곁)
  B.geo(M.beamLight, tube([V(19.4, F1 + 0.25, 19.9 - 0.4 + 0.4), V(19.3, 1.6, 19.9)], 0.012, 6));
  for (let i = 0; i < 12; i++) B.geo(C.straw, tube([V(19.4, F1 + 0.27, 19.9), V(19.41 + (i % 4 - 1.5) * 0.02, F1, 19.9 + (i - 5.5) * 0.022)], 0.006, 4));
  B.geo(M.beamLight, lathe([[0, 0], [0.13, 0], [0.16, 0.26], [0.15, 0.26], [0.122, 0.015], [0, 0.015]], 14), mat4(17.5, F1, 21.4));
  for (const y of [0.05, 0.2]) B.geo(M.iron, tor(0.137 + y * 0.11, 0.006, 4, 14), mat4(17.5, F1 + y, 21.4, PI / 2));
  B.geo(M.iron, tor(0.155, 0.006, 4, 12, PI), mat4(17.5, F1 + 0.25, 21.4, 0, 0.6));

  /* ================= 다락: 쉬는 방 ================= */
  const quilt = (g, k) => warp(g, v => { if (v.y > 0) v.y += k * Math.cos(v.x * PI * 5) * Math.cos(v.z * PI * 5); });
  const futonKit = cm => kit(K => {
    K.geo(C.futon, quilt(boxG(1.0, 0.1, 2.0, 14, 1, 28), 0.01), mat4(0, 0.05, 0));                         // 요
    K.geo(cm, warp(boxG(1.2, 0.08, 1.38, 24, 1, 26), v => {                                                // 이불(주름과 늘어진 가장자리)
      const e = Math.max(0, Math.abs(v.x) - 0.48);
      v.y += 0.022 * Math.sin(v.x * 8 + v.z * 3.5) + 0.014 * Math.sin(v.z * 11 - v.x * 4) - e * 1.1 + 0.035 * Math.exp(-((v.x - 0.1) ** 2 + (v.z - 0.1) ** 2) * 6);
    }), mat4(0, 0.155, 0.3));
    K.geo(C.futon, cyl(0.05, 0.05, 1.2, 12), mat4(0, 0.17, -0.4, 0, 0, PI / 2, [0.7, 1, 1.5]));   // 접어 젖힌 깃
    K.geo(C.futon, pillow(0.21, 0.06, 0.13, 0.6), mat4(0, 0.16, -0.76));                                   // 베개
    K.geo(cm, boxG(0.44, 0.004, 0.1), mat4(0, 0.221, -0.76));
  });
  place(B, futonKit(C.blue), 13.6, F2 + 0.04, 12.0, PI / 2); place(B, futonKit(C.rose), 13.6, F2 + 0.04, 20.0, PI / 2 + 0.03);
  addCollider(12.7, F2, 11.4, 14.7, F2 + 0.25, 12.6); addCollider(12.7, F2, 19.4, 14.7, F2 + 0.25, 20.6);
  // 밥상(둥근 차부다이)과 찻주전자·찻잔·귤
  {
    const x = 14.8, z = 16.0, y = F2 + 0.04, ty = y + 0.33;
    B.geo(M.beamLight, lathe([[0, 0], [0.5, 0], [0.52, 0.015], [0.52, 0.03], [0.5, 0.045], [0, 0.045]], 28), mat4(x, ty - 0.045, z));
    B.geo(M.beam, tor(0.4, 0.02, 4, 24), mat4(x, ty - 0.07, z, PI / 2));
    for (let i = 0; i < 4; i++) { const a = PI / 4 + i * PI / 2; B.geo(M.beam, lathe([[0, 0], [0.03, 0], [0.022, 0.08], [0.036, 0.16], [0.028, 0.24], [0.04, 0.29]], 10), mat4(x + Math.cos(a) * 0.36, y, z + Math.sin(a) * 0.36)); }
    addCollider(x - 0.4, y, z - 0.4, x + 0.4, ty, z + 0.4);
    B.geo(M.iron, lathe([[0, 0], [0.05, 0], [0.078, 0.03], [0.082, 0.06], [0.066, 0.09], [0.03, 0.098], [0.028, 0.104], [0.012, 0.11], [0.016, 0.125], [0, 0.128]], 16), mat4(x - 0.1, ty, z - 0.05));   // 무쇠 주전자
    B.geo(M.iron, tube([V(x - 0.03, ty + 0.05, z - 0.05), V(x + 0.03, ty + 0.075, z - 0.05), V(x + 0.05, ty + 0.1, z - 0.05)], t => 0.012 - 0.005 * t, 6));
    B.geo(M.iron, tor(0.07, 0.006, 5, 14, PI), mat4(x - 0.1, ty + 0.09, z - 0.05));
    steamSrc.push({ p: [x + 0.05, ty + 0.12, z - 0.05], n: 4, h: 0.4, r: 0.05, s0: 0.06, s1: 0.2, a: 0.16, sp: 0.4 });
    for (const [dx, dz] of [[0.14, 0.14], [-0.2, 0.2]]) { B.geo(C.china, lathe([[0, 0], [0.025, 0], [0.034, 0.06], [0.03, 0.06], [0.022, 0.008], [0, 0.008]], 12), mat4(x + dx, ty, z + dz)); B.geo(C.green, disc(0.029, 12), mat4(x + dx, ty + 0.045, z + dz)); }
    B.geo(M.beam, lathe([[0, 0], [0.06, 0], [0.11, 0.035], [0.105, 0.035], [0.058, 0.008], [0, 0.008]], 16), mat4(x + 0.1, ty, z - 0.25));   // 귤 그릇
    for (const [dx, dz, dy] of [[0.06, -0.25, 0.04], [0.14, -0.25, 0.04], [0.1, -0.2, 0.04], [0.1, -0.24, 0.1]]) { B.geo(C.yolk, sph(0.04, 10, 8), mat4(x + dx, ty + dy, z + dz, 0, 0, 0, [1, 0.82, 1])); B.geo(C.green, cyl(0.006, 0.006, 0.006, 5), mat4(x + dx, ty + dy + 0.033, z + dz)); }
    // 방석 둘
    const zabu = kit(K => { K.geo(C.blue, pillow(0.28, 0.045, 0.28, 0.42), mat4(0, 0.045, 0)); K.geo(C.futon, sph(0.012, 6, 4), mat4(0, 0.085, 0)); for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.geo(C.futon, new THREE.ConeGeometry(0.012, 0.05, 5), mat4(sx * 0.27, 0.045, sz * 0.27, sz * 1.2, 0, -sx * 1.2)); });
    place(B, zabu, x + 0.05, y, z + 0.85, 0.1); place(B, zabu, x + 0.05, y, z - 0.85, -0.15); place(B, zabu, x - 0.85, y, z + 0.05, 0.5);
  }
  // 행등(안돈)
  {
    const x = 13.0, z = 14.2, y = F2 + 0.04;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box(M.beam, x + sx * 0.14 - 0.012, y, z + sz * 0.14 - 0.012, x + sx * 0.14 + 0.012, y + 0.66, z + sz * 0.14 + 0.012, false);
    B.box(M.beam, x - 0.16, y + 0.1, z - 0.16, x + 0.16, y + 0.125, z + 0.16, false); B.box(M.beam, x - 0.16, y + 0.6, z - 0.16, x + 0.16, y + 0.62, z + 0.16, false);
    B.box(mat('paper', 0xffe6b0), x - 0.13, y + 0.125, z - 0.13, x + 0.13, y + 0.6, z + 0.13, false);
    B.geo(M.beam, tor(0.1, 0.008, 4, 12, PI), mat4(x, y + 0.66, z));
    addCollider(x - 0.16, y, z - 0.16, x + 0.16, y + 0.66, z + 0.16);
    glows.push([x, y + 0.38, z, 1.2]);
  }
  // 족자와 병풍
  B.geo(textMat('一麺入魂', { w: 128, h: 512, vertical: true, bg: '#efe6cf', color: '#1a1410', pad: 0.14 }), new THREE.PlaneGeometry(0.42, 1.3), mat4(12.72, 4.35, 16.0, 0, PI / 2));
  for (const y of [3.68, 5.02]) B.geo(M.beam, cyl(0.02, 0.02, 0.52, 8), mat4(12.74, y, 16.0, PI / 2));
  B.geo(C.straw, tube([V(12.72, 5.02, 15.85), V(12.71, 5.15, 16.0), V(12.72, 5.02, 16.15)], 0.004, 4));
  ['山', '火', '林', '風'].forEach((ch, i) => signBoard(B, ch, 14.9, F2 + 0.04 + 0.78, 17.7 + i * 0.457, PI / 2 + (i % 2 ? 0.42 : -0.42), 0.5, 1.5, { bg: '#efe6cf', depth: 0.03, pad: 0.22 }));
  addCollider(14.75, F2, 17.4, 15.05, F2 + 1.6, 19.4);
  // 경대(아야메의 거울)
  {
    const x = 12.95, z = 18.3, y = F2 + 0.04;
    B.box(M.beam, x - 0.2, y, z - 0.3, x + 0.2, y + 0.3, z + 0.3);
    for (const zz of [z - 0.15, z + 0.15]) { B.box(M.beamLight, x + 0.2, y + 0.04, zz - 0.13, x + 0.212, y + 0.26, zz + 0.13, false); B.geo(M.iron, sph(0.014, 6, 4), mat4(x + 0.222, y + 0.15, zz)); }
    for (const zz of [z - 0.2, z + 0.2]) B.box(M.beam, x - 0.12, y + 0.3, zz - 0.015, x - 0.09, y + 0.78, zz + 0.015, false);
    B.geo(M.beam, cyl(0.2, 0.2, 0.03, 24), mat4(x - 0.105, y + 0.58, z, 0, 0, PI / 2 - 0.12));
    B.geo(C.steel, cyl(0.18, 0.18, 0.006, 24), mat4(x - 0.088, y + 0.582, z, 0, 0, PI / 2 - 0.12));
    B.geo(C.red, lathe([[0, 0], [0.03, 0], [0.036, 0.03], [0.03, 0.05], [0, 0.052]], 10), mat4(x + 0.08, y + 0.3, z + 0.18));   // 연지 통
    B.geo(M.beamLight, boxG(0.05, 0.012, 0.16), mat4(x + 0.1, y + 0.306, z - 0.1, 0, 0.3));              // 빗
  }
  // 다락 마루: 장롱(단스)
  {
    const x0 = 20.3, x1 = 20.8, z0 = 17.0, z1 = 17.95, y = F2;                                             // 서쪽을 본다
    B.box(M.beam, x0, y, z0, x1, y + 1.1, z1);
    for (let i = 0; i < 4; i++) {
      const ya = y + 0.06 + i * 0.26;
      B.box(M.beamLight, x0 - 0.012, ya, z0 + 0.04, x0, ya + 0.22, z1 - 0.04, false);
      for (const zz of [z0 + 0.28, z1 - 0.28]) B.geo(M.iron, tor(0.035, 0.006, 4, 10, PI), mat4(x0 - 0.018, ya + 0.12, zz, 0, PI / 2, PI));
      for (const zz of [z0 + 0.05, z1 - 0.09]) B.box(M.iron, x0 - 0.015, ya, zz, x0 - 0.011, ya + 0.04, zz + 0.04, false);
    }
    // 테우치의 조리 모자와 가족 사진
    B.geo(C.china, lathe([[0, 0], [0.1, 0], [0.1, 0.05], [0.125, 0.16], [0.11, 0.2], [0, 0.21]], 16), mat4(20.55, y + 1.1, 17.25));
    B.box(M.beam, 20.6, y + 1.1, 17.6, 20.63, y + 1.32, 17.86, false); B.box(C.china, 20.595, y + 1.12, 17.62, 20.6, y + 1.3, 17.84, false);
  }
  // 옷걸이(이코)에 걸친 흰 조리복과 앞치마
  {
    const x = 17.6, y = F2;
    for (const z of [19.6, 20.9]) { B.box(M.beam, x - 0.03, y, z - 0.03, x + 0.03, y + 1.6, z + 0.03, false); B.box(M.beam, x - 0.2, y, z - 0.035, x + 0.2, y + 0.06, z + 0.035, false); }
    B.box(M.beam, x - 0.025, y + 1.55, 19.45, x + 0.025, y + 1.6, 21.05, false); B.box(M.beam, x - 0.02, y + 0.5, 19.6, x + 0.02, y + 0.54, 20.9, false);
    addCollider(x - 0.2, y, 19.5, x + 0.2, y + 1.6, 21.0);
    const drape = (m, z0, z1, len, sl) => { for (const s of [-1, 1]) B.geo(m, warp(boxG(0.012, len, z1 - z0, 1, 8, 8), v => { v.x += 0.012 * Math.sin(v.z * 14) * (0.5 - v.y / len); }), mat4(x + s * 0.035, y + 1.6 - len / 2, (z0 + z1) / 2)); B.geo(m, cyl(0.036, 0.036, z1 - z0, 8, 1), mat4(x, y + 1.6, (z0 + z1) / 2, PI / 2)); if (sl) for (const zz of [z0 - 0.16, z1 + 0.16]) B.geo(m, boxG(0.014, 0.42, 0.3), mat4(x + 0.04, y + 1.37, zz)); };
    drape(C.china, 19.85, 20.4, 0.95, true);                                                               // 조리복
    drape(C.blue, 20.62, 20.9, 0.7, false);                                                                // 앞치마
  }
  // 쌓아 둔 방석과 고리짝
  for (let i = 0; i < 4; i++) B.geo(i % 2 ? C.rose : C.blue, pillow(0.28, 0.045, 0.28, 0.42), mat4(18.0, F2 + 0.045 + i * 0.08, 10.75, 0, i * 0.12));
  B.box(C.straw, 18.5, F2, 10.35, 19.3, F2 + 0.4, 10.9); B.box(C.straw, 18.48, F2 + 0.4, 10.33, 19.32, F2 + 0.46, 10.92, false);
  for (const xx of [18.7, 19.1]) B.box(M.beam, xx - 0.02, F2, 10.32, xx + 0.02, F2 + 0.47, 10.93, false);
  addCollider(17.7, F2, 10.45, 18.3, F2 + 0.35, 11.05);

  /* ================= 등과 옆마당 ================= */
  const lampKit = kit(K => {
    K.geo(M.iron, tube([V(0, 0, 0), V(0, 0.5, 0)], 0.006, 4));
    K.geo(M.iron, lathe([[0.03, 0.02], [0.17, -0.1], [0.175, -0.1], [0.04, 0.03], [0, 0.035]], 16));
    K.geo(C.bulb, sph(0.045, 10, 8), mat4(0, -0.06, 0));
  });
  const LAMPS = [[11.0, 2.4, 16], [14.8, 2.5, 14.0], [18.7, 2.5, 16.5], [18.4, 4.75, 15.0]];
  for (const [x, y, z] of LAMPS) { place(B, lampKit, x, y, z); glows.push([x, y - 0.06, z, 0.8]); }
  // 옆마당(남쪽): 빈 병 상자·빗물 통·쓰레기통
  for (const [x, y, z] of [[14.0, 0, 22.5], [14.0, 0.3, 22.5], [14.7, 0, 22.48]]) {
    place(B, crateKit, x, y, z, 0.03 * (y ? -1 : 1));
    for (let i = 0; i < 8; i++) { const m = mat4(x - 0.2 + (i % 4) * 0.135, y + 0.012, z - 0.08 + (i / 4 | 0) * 0.16); B.geo(C.brown, lathe([[0, 0], [0.04, 0], [0.042, 0.16], [0.016, 0.23], [0.015, 0.29]], 8), m); }
  }
  addCollider(13.68, 0, 22.26, 15.02, 0.6, 22.74);
  place(B, barrelKit('水'), 16.3, 0, 22.5, 0.2); addCollider(15.98, 0, 22.18, 16.62, 0.8, 22.82);
  B.geo(C.steel, lathe([[0, 0], [0.2, 0], [0.24, 0.55], [0.25, 0.56], [0.23, 0.56], [0.19, 0.02], [0, 0.02]], 16), mat4(20.2, 0, 22.55));
  B.geo(C.steel, lathe([[0.26, 0.56], [0.25, 0.6], [0.05, 0.66], [0, 0.66]], 16), mat4(20.2, 0, 22.55)); B.geo(M.iron, tor(0.04, 0.008, 4, 10, PI), mat4(20.2, 0.66, 22.55));
  addCollider(19.95, 0, 22.3, 20.45, 0.66, 22.8);

  B.finish(scene);

  /* ================= 김(움직이는 입자) ================= */
  let total = 0; for (const s of steamSrc) { s.i0 = total; total += s.n; }
  const sg = new THREE.BufferGeometry(), sp = new Float32Array(total * 3), sa = new Float32Array(total), ss = new Float32Array(total), seed = new Float32Array(total * 3);
  const SR = rng(99); for (let i = 0; i < total * 3; i++) seed[i] = SR();
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('aA', new THREE.BufferAttribute(sa, 1)); sg.setAttribute('aS', new THREE.BufferAttribute(ss, 1));
  const sm = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uScale: { value: 500 } },
    vertexShader: 'attribute float aA; attribute float aS; uniform float uScale; varying float vA; void main(){ vA = aA; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aS * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying float vA; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = 1.0 - smoothstep(0.0, 1.0, d); gl_FragColor = vec4(vec3(0.95, 0.95, 0.93), a * a * vA); }',
  });
  const steam = new THREE.Points(sg, sm);
  steam.frustumCulled = false; steam.renderOrder = 5;
  scene.add(steam);
  const tick = t => {
    sm.uniforms.uScale.value = ctx.renderer.domElement.height * 0.688;
    for (const s of steamSrc) for (let k = 0; k < s.n; k++) {
      const i = s.i0 + k, a = seed[i * 3], b = seed[i * 3 + 1], c = seed[i * 3 + 2];
      const l = (t * s.sp * (0.7 + 0.6 * a) + b * 7) % 1, ang = c * 6.283 + t * 0.5 * (a - 0.5), rr = s.r * (0.35 + l * 0.9) * (0.4 + 0.6 * b);
      sp[i * 3] = s.p[0] + Math.cos(ang) * rr + Math.sin(t * 0.9 + c * 9 + l * 4) * s.r * 0.35 * l;
      sp[i * 3 + 1] = s.p[1] + l * s.h;
      sp[i * 3 + 2] = s.p[2] + Math.sin(ang) * rr + Math.cos(t * 0.7 + a * 9 + l * 3) * s.r * 0.35 * l;
      sa[i] = 2.2 * s.a * Math.sin(PI * Math.min(1, l * 1.15)) * (1 - l * 0.5);
      ss[i] = s.s0 + (s.s1 - s.s0) * l;
    }
    sg.attributes.position.needsUpdate = sg.attributes.aA.needsUpdate = sg.attributes.aS.needsUpdate = true;
  };
  tick(0);

  return {
    places: [
      { n: '이치라쿠 라멘', t: '큰길가의 작은 라멘 가게. 나루토가 가장 좋아하는 곳이다.', b: [7, 22, 8, 24] },
      { n: '이치라쿠 — 카운터 자리', t: '포렴을 걷고 들어서면 둥근 의자 여섯과 긴 카운터. 갓 나온 라멘에서 김이 오른다.', b: [XF, X0, Z0, Z1], y: [0, 3] },
      { n: '이치라쿠 — 주방', t: '육수 솥과 면 삶는 솥이 끓는다. 테우치와 아야메가 일하는 자리.', b: [X0, XP + 0.1, Z0, Z1], y: [0, 3] },
      { n: '이치라쿠 — 창고·준비실', t: '밀가루 포대와 된장·간장 통, 육수 재료 상자. 계단은 다락으로 오른다.', b: [XP + 0.1, X1, Z0, Z1], y: [0, 3] },
      { n: '이치라쿠 — 다락 쉬는 방', t: '테우치 부녀가 장사를 마치고 쉬는 다다미방. 이불 두 채와 작은 밥상.', b: [X0, XP + 0.06, Z0, Z1], y: [3, 8] },
      { n: '이치라쿠 — 다락 마루', t: '계단을 올라온 마루. 장롱과 옷걸이에 흰 조리복이 걸려 있다.', b: [XP + 0.06, X1, Z0, Z1], y: [3, 8] },
    ],
    jumps: [
      ['이치라쿠 라멘', 3.5, 0, 16, -PI / 2, 50],
      ['이치라쿠 — 카운터 자리', 10.9, F0, 15.2, -PI / 2, 51],
      ['이치라쿠 — 다락', 16.2, F2 + 0.04, 14.3, PI / 2, 52],
    ],
    lights: [[11.0, 2.3, 16, 12, 13], [14.8, 2.4, 14.0, 15, 15], [18.7, 2.4, 16.5, 11, 13], [16.4, 4.9, 15.5, 13, 16]],
    glows,
    skip: [steam],
    tick,
  };
}
