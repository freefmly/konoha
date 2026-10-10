// 닌자 아카데미(忍者学校) — 옆으로 긴 2층 교사에 가운데 3층 망루, 그 앞에 층층이 눈썹지붕을 두른 둥근 탑(현관). 남쪽은 앞마당(과녁 통나무·철봉·말뚝)과 정문.
// 1층: 둥근 현관·현관 홀(신발장)·복도·계단식 교실·교무실 / 2층: 탑의 담화실·홀·복도·실습실·두루마리 서고 / 3층: 탑의 전망 방·망루.
// 둥근 탑과 붉은 기와 처마, 정면의 큰 표지(나뭇잎 표·アカデミー·忍)는 원작 애니메이션의 아카데미 그림을 보고 지었다. 탑 안의 방은 지어낸 것이다.
import * as THREE from '../vendor/three.module.js';
import { Builder, wall, stairs, tube, mergeGeos, mat4, rng, addCollider } from './build.js';
import { mat, M, textMat } from './materials.js';
import { gableRoof, hipRoof, coneRoof, tilePanel, beamBetween, windowUnit, doorUnit, railing, signBoard, roundWall, roundWindow, roundFloor } from './arch.js';
import { addRoof } from './build.js';
import { leafMark } from './campus.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const PI = Math.PI;

// 자리표(세계 좌표). 집터 x 40..96, z -124..-64.
const X0 = 47, X1 = 89, Z0 = -120, Z1 = -104, T = 0.25;      // 교사 바깥 벽
const CX0 = 62, CX1 = 74;                                      // 가운데 탑(현관·계단·망루)
const WY0 = 0.12, F1 = 0.3, F2 = 3.9, F3 = 7.5, EAVE = 7.5, TOP = 10.9;
const CZ = -106.8;                                             // 복도와 방 사이 벽(두께 0.2, 남쪽이 복도)
const ST = { x0: 66.9, x1: 72, z0: Z0 + T, z1: -118 };         // 계단 자리(동쪽으로 오른다)
const SOUTH = -65.0;                                           // 남쪽 담 중심선

export function build(scene, ctx) {
  const B = new Builder(), R = rng(4107);
  const WALL = M.white, BEAM = M.beam, LIGHT = M.beamLight;
  const RED = mat('plain', 0xb3392b), WHT = mat('plain', 0xf0ece0), NAVY = mat('plain', 0x2d3f5e), GRN = mat('plain', 0x2f4a3c);
  const ROOF = mat('tile', 0xa8432c), ROOF2 = mat('tile', 0xb9663a), REDP = mat('plaster', 0xa5473c), REDW = mat('wood', 0xa33a2c);
  const PAPER = mat('paper', 0xefe6cf), STRAW = mat('wood', 0xd2b064), LOG = mat('wood', 0x7a5a3c), LEAF = mat('leaf', 0x3f7a3a);
  const BULB = mat('glow', 0xffe2a8, { power: 1.4 });
  const glows = [];

  /* ================= 작은 도형들(한 번 만들어 여러 번 놓는다) ================= */
  const cyl = (r0, r1, h, n = 10, open = false) => new THREE.CylinderGeometry(r0, r1, h, n, 1, open);
  const alongX = g => g.rotateZ(-PI / 2);
  // 말아 둔 두루마리(축이 x): 종이 말이 + 양 끝으로 나온 축 + 묶은 띠
  const gRoll = alongX(cyl(0.045, 0.045, 0.34, 8)), gRod = alongX(cyl(0.014, 0.014, 0.42, 5)), gBand = alongX(cyl(0.048, 0.048, 0.05, 8, true));
  const BANDS = [RED, NAVY, GRN];
  const scroll = (x, y, z, ry = 0, s = 1, band = BANDS[R() * 3 | 0]) => {
    const m = mat4(x, y, z, 0, ry, 0, s);
    B.geo(PAPER, gRoll, m); B.geo(BEAM, gRod, m); B.geo(band, gBand, m);
  };
  // 쿠나이(끝이 +x): 나뭇잎꼴 날 + 자루 + 고리
  const gKunai = (() => {
    const tip = new THREE.ConeGeometry(0.03, 0.13, 4), back = new THREE.ConeGeometry(0.03, 0.05, 4).rotateX(PI);
    const g = mergeGeos([[tip, mat4(0, 0.065, 0, 0, 0, 0, [1, 1, 0.3])], [back, mat4(0, -0.025, 0, 0, 0, 0, [1, 1, 0.3])],
      [cyl(0.009, 0.009, 0.1, 6), mat4(0, -0.1, 0)], [new THREE.TorusGeometry(0.02, 0.005, 5, 12), mat4(0, -0.17, 0)]]);
    return alongX(g);
  })();
  // 수리검: 네 날 별 모양에 가운데 구멍
  const gShuriken = (() => {
    const s = new THREE.Shape();
    for (let i = 0; i < 8; i++) { const a = i * PI / 4, r = i % 2 ? 0.03 : 0.09; i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(r, 0); }
    s.closePath();
    const h = new THREE.Path(); h.absarc(0, 0, 0.012, 0, PI * 2, true); s.holes.push(h);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: false, curveSegments: 8 });
    return g.translate(0, 0, -0.003);
  })();
  // 면(법선 ry) 위의 한 점에 날붙이를 꽂는다
  const stick = (x, y, z, ry, kind) => {
    const nx = Math.sin(ry), nz = Math.cos(ry);
    if (kind) B.geo(M.iron, gKunai, mat4(x + nx * 0.09, y, z + nz * 0.09, R() * 6, ry + PI / 2, (R() - 0.5) * 0.5));
    else B.geo(M.iron, gShuriken, mat4(x + nx * 0.06, y, z + nz * 0.06, R() * 6, ry + PI / 2, 0));
  };
  // 수리검 과녁: 흰 판에 붉은 동심원과 검은 정곡. ry는 판이 보는 방향
  const gDisc = cyl(0.42, 0.42, 0.06, 28).rotateX(PI / 2);
  const RINGS = [[0.3, 0.37, RED], [0.15, 0.22, RED], [0, 0.06, M.iron]].map(([a, b, m]) => [a ? new THREE.RingGeometry(a, b, 28) : new THREE.CircleGeometry(b, 20), m]);
  const target = (x, y, z, ry, hits = 3) => {
    const nx = Math.sin(ry), nz = Math.cos(ry);
    B.geo(WHT, gDisc, mat4(x, y, z, 0, ry, 0));
    RINGS.forEach(([g, m], i) => B.geo(m, g, mat4(x + nx * (0.032 + i * 0.002), y, z + nz * (0.032 + i * 0.002), 0, ry, 0)));
    for (let i = 0; i < hits; i++) {
      const a = R() * 6.28, r = R() * 0.33;
      stick(x + nx * 0.03 + nz * Math.cos(a) * r, y + Math.sin(a) * r, z + nz * 0.03 - nx * Math.cos(a) * r, ry, R() < 0.45);
    }
  };
  // 과녁을 밧줄로 동여맨 통나무 기둥
  const gLog = cyl(0.19, 0.22, 1, 12), gRope = new THREE.TorusGeometry(0.215, 0.022, 6, 14).rotateX(PI / 2);
  const targetPost = (x, y0, z, ry, h = 2.3) => {
    B.geo(LOG, gLog, mat4(x, y0 + h / 2, z, 0, R() * 6, 0, [1, h, 1]));
    B.geo(LIGHT, cyl(0.185, 0.185, 0.012, 12), mat4(x, y0 + h + 0.004, z));             // 잘린 윗면
    for (const ry2 of [1.28, 1.72]) B.geo(STRAW, gRope, mat4(x, y0 + ry2, z));
    target(x + Math.sin(ry) * 0.25, y0 + 1.5, z + Math.cos(ry) * 0.25, ry, 2 + (R() * 3 | 0));
    addCollider(x - 0.2, y0, z - 0.2, x + 0.2, y0 + h, z + 0.2);
  };
  // 볏짚 허수아비(타격 연습용): 십자 받침·기둥·새끼줄 감은 몸통과 팔·머리
  const ridged = (r, h, n) => { const p = []; for (let i = 0; i <= n * 3; i++) { const t = i / (n * 3); p.push(new THREE.Vector2(r * (0.93 + 0.07 * Math.abs(Math.sin(t * n * PI))) * (i === 0 || i === n * 3 ? 0.6 : 1), h * t)); } return new THREE.LatheGeometry(p, 10); };
  const gTorso = ridged(0.17, 0.7, 9), gArm = alongX(ridged(0.06, 0.9, 12).translate(0, -0.45, 0)), gHead = ridged(0.12, 0.26, 4);
  const dummy = (x, y0, z, ry = 0) => {
    B.box(BEAM, x - 0.35, y0, z - 0.05, x + 0.35, y0 + 0.08, z + 0.05, false); B.box(BEAM, x - 0.05, y0, z - 0.35, x + 0.05, y0 + 0.08, z + 0.35, false);
    B.box(BEAM, x - 0.05, y0, z - 0.05, x + 0.05, y0 + 1.5, z + 0.05, false);
    B.geo(STRAW, gTorso, mat4(x, y0 + 0.65, z)); B.geo(STRAW, gArm, mat4(x, y0 + 1.22, z, 0, ry, 0)); B.geo(STRAW, gHead, mat4(x, y0 + 1.42, z));
    addCollider(x - 0.2, y0, z - 0.2, x + 0.2, y0 + 1.7, z + 0.2);
  };
  // 화분: 질그릇 + 길쭉한 잎을 한 장씩
  const gBlade = (() => {
    const pos = [], idx = [], n = 6;
    for (let i = 0; i <= n; i++) { const t = i / n, w = 0.05 * Math.sin(PI * (0.12 + 0.88 * t)) * (i === n ? 0 : 1), y = 0.5 * t * (1 - 0.25 * t), z = 0.28 * t * t; pos.push(-w, y, z + w * 0.3, 0, y, z, w, y, z + w * 0.3); }
    for (let i = 0; i < n; i++) { const a = i * 3; idx.push(a, a + 1, a + 4, a, a + 4, a + 3, a + 1, a + 2, a + 5, a + 1, a + 5, a + 4); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(pos.length / 3 * 2).fill(0), 2));
    g.setIndex(idx); g.computeVertexNormals(); return g;
  })();
  const gPot = new THREE.LatheGeometry([[0, 0], [0.16, 0], [0.2, 0.3], [0.23, 0.34], [0.2, 0.34], [0.18, 0.3], [0, 0.3]].map(p => new THREE.Vector2(p[0], p[1])), 14);
  const POT = mat('plain', 0x9a5a3c);
  const plant = (x, y, z) => {
    B.geo(POT, gPot, mat4(x, y, z));
    for (let i = 0; i < 18; i++) B.geo(LEAF, gBlade, mat4(x, y + 0.3, z, (R() - 0.2) * 0.7, i * 2.4 + R(), 0, 0.8 + R() * 0.7));
    addCollider(x - 0.2, y, z - 0.2, x + 0.2, y + 0.8, z + 0.2);
  };
  // 천장에 매단 등: 줄 + 갓 + 불빛
  const gShade = new THREE.LatheGeometry([[0.04, 0.16], [0.1, 0.12], [0.3, 0], [0.31, -0.02]].map(p => new THREE.Vector2(p[0], p[1])), 16);
  const pendant = (x, yCeil, z, drop = 0.6) => {
    B.geo(M.iron, tube([V3(x, yCeil, z), V3(x, yCeil - drop, z)], 0.008, 5, false));
    B.geo(mat('plain', 0xb9663a, { side: 'double' }), gShade, mat4(x, yCeil - drop - 0.16, z));
    B.geo(BULB, new THREE.SphereGeometry(0.07, 10, 8), mat4(x, yCeil - drop - 0.12, z));
    glows.push([x, yCeil - drop - 0.12, z, 0.9]);
    return [x, yCeil - drop - 0.3, z];
  };
  // 종이 더미·낱장
  const papers = (x, y, z, n = 1, ry = 0) => { const g = new THREE.BoxGeometry(0.21, 0.004 * n, 0.3); B.geo(PAPER, g, mat4(x, y + 0.002 * n, z, 0, ry, 0)); };
  // 방석(가운데가 봉긋한 네모)
  const gCushion = (() => { const g = new THREE.BoxGeometry(0.5, 0.15, 0.5, 6, 2, 6), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i) / 0.25, z = p.getZ(i) / 0.25; p.setY(i, p.getY(i) * (1 - 0.75 * Math.max(x * x, z * z) ** 2)); } g.computeVertexNormals(); return g; })();
  // 게시판: 나무틀 + 판 + 압정으로 꽂은 종이. axis 'x'면 z=f 벽에 붙어 dir(±1) 쪽을 본다
  const notice = (axis, f, dir, u0, u1, y0, y1, n = 6) => {
    const bx = (m, a, b, ya, yb, d0, d1) => { const p0 = f + dir * d0, p1 = f + dir * d1; axis === 'x' ? B.box(m, a, ya, Math.min(p0, p1), b, yb, Math.max(p0, p1), false) : B.box(m, Math.min(p0, p1), ya, a, Math.max(p0, p1), yb, b, false); };
    bx(GRN, u0, u1, y0, y1, 0, 0.02); bx(BEAM, u0 - 0.05, u1 + 0.05, y1, y1 + 0.05, 0, 0.04); bx(BEAM, u0 - 0.05, u1 + 0.05, y0 - 0.05, y0, 0, 0.04);
    bx(BEAM, u0 - 0.05, u0, y0, y1, 0, 0.04); bx(BEAM, u1, u1 + 0.05, y0, y1, 0, 0.04);
    for (let i = 0; i < n; i++) { const u = u0 + 0.1 + (u1 - u0 - 0.45) * (i + R() * 0.6) / n, v = y0 + 0.08 + R() * Math.max(0.01, y1 - y0 - 0.5), w = 0.2 + R() * 0.1, h = 0.26 + R() * 0.1; bx(R() < 0.75 ? PAPER : WHT, u, u + w, v, v + h, 0.02, 0.026); bx(RED, u + w / 2 - 0.012, u + w / 2 + 0.012, v + h - 0.04, v + h - 0.016, 0.026, 0.036); }
  };

  /* ================= 몸채: 바닥·벽·창 ================= */
  B.box(M.stone, X0 - 0.2, 0, Z0 - 0.2, X1 + 0.2, WY0, Z1 + 0.2);
  B.box(M.floor, X0 + 0.05, WY0, Z0 + 0.05, X1 - 0.05, F1, Z1 - 0.05);
  const Y1 = [1.3, 2.9], Y2 = [4.9, 6.5], Y3 = [8.5, 10.1];
  const cols = (cs, w, ys) => cs.map(c => ({ u0: c - w / 2, u1: c + w / 2, ys }));
  const fit = (axis, f0, f1, ops, out, o = {}) => { for (const op of ops) for (const [a, b] of op.ys) windowUnit(B, axis, f0, f1, op.u0, op.u1, a, b, { out, nx: 3, ny: 2, ...o }); };
  // 양 날개의 남·북 벽: 3m 칸마다 창
  for (const [xa, xb] of [[X0, CX0], [CX1, X1]]) {
    const ops = cols([1.5, 4.5, 7.5, 10.5, 13.5].map(d => xa + d), 2.0, [Y1, Y2]);
    wall(B, WALL, 'x', Z1 - T, Z1, xa, xb, WY0, EAVE, ops); fit('x', Z1 - T, Z1, ops, 1);
    wall(B, WALL, 'x', Z0, Z0 + T, xa, xb, WY0, EAVE, ops); fit('x', Z0, Z0 + T, ops, -1);
    for (let i = 0; i <= 5; i++) {                       // 벽 겉의 기둥
      const x = Math.min(xb - 0.09, Math.max(xa + 0.09, xa + i * 3));
      B.box(BEAM, x - 0.09, WY0, Z1, x + 0.09, EAVE, Z1 + 0.05, false); B.box(BEAM, x - 0.09, WY0, Z0 - 0.05, x + 0.09, EAVE, Z0, false);
    }
  }
  // 날개 끝 벽(서: 1층 교실은 칠판 벽이라 창이 없다)
  const endOps = (both) => [{ u0: -106.35, u1: -104.5, ys: [Y1, Y2] }, ...cols([-116.5, -110.5], 2.0, both ? [Y1, Y2] : [Y2])].sort((a, b) => a.u0 - b.u0);
  wall(B, WALL, 'z', X0, X0 + T, Z0 + T, Z1 - T, WY0, EAVE, endOps(false)); fit('z', X0, X0 + T, endOps(false), -1);
  wall(B, WALL, 'z', X1 - T, X1, Z0 + T, Z1 - T, WY0, EAVE, endOps(true)); fit('z', X1 - T, X1, endOps(true), 1);
  // 탑: 남쪽(현관·2층 창·3층 발코니 문), 북쪽, 옆 벽(아래는 날개와의 칸막이, 복도가 뚫려 있다)
  const NK = [[F2, F2 + 2.5], [F3, F3 + 2.2]];                 // 2·3층에서 둥근 탑으로 건너가는 문
  const tS = [{ u0: 63, u1: 65.2, ys: [Y1, Y2, Y3] }, { u0: 66, u1: 70, ys: [[WY0, 3.0], ...NK] }, { u0: 70.8, u1: 73, ys: [Y1, Y2, Y3] }];
  const sink = ops => ops.map(o => ({ ...o, ys: o.ys.map(([a, b]) => (a === F1 || a === F2 || a === F3 ? [a - 0.03, b] : [a, b])) }));   // 문 구멍은 바닥 윗면보다 3cm 아래에서 시작한다(문 밑에 남는 벽의 윗면이 바닥과 한 높이로 겹치면 깜빡인다)
  wall(B, WALL, 'x', Z1 - T, Z1, CX0, CX1, WY0, TOP, sink(tS));
  fit('x', Z1 - T, Z1, [tS[0], tS[2]], 1, { nx: 2 });
  doorUnit(B, 'x', Z1 - T, Z1, 66, 70, F1, 3.0, { leaf: null, t: 0.14 });
  for (const [a, b] of NK) doorUnit(B, 'x', Z1 - T, Z1, 66, 70, a, b, { leaf: null });
  const tN = [{ u0: 63, u1: 65.6, ys: [Y1, Y2, Y3] }, { u0: 67.5, u1: 71, ys: [Y3] }];
  wall(B, WALL, 'x', Z0, Z0 + T, CX0, CX1, WY0, TOP, tN); fit('x', Z0, Z0 + T, tN, -1);
  const corr = [{ u0: -106.5, u1: -104.4, ys: [[F1, 2.9], [F2, 6.5]] }];
  wall(B, WALL, 'z', CX0, CX0 + T, Z0 + T, Z1 - T, WY0, TOP, sink(corr)); wall(B, WALL, 'z', CX1 - T, CX1, Z0 + T, Z1 - T, WY0, TOP, sink(corr));
  for (const x of [CX0, CX1 - T]) for (const [y0, y1] of corr[0].ys) doorUnit(B, 'z', x, x + T, -106.5, -104.4, y0, y1, { leaf: null });
  for (const x of [CX0, CX1 - 0.2]) for (const [z, d] of [[Z1, 0.05], [Z0 - 0.05, 0.05]]) B.box(BEAM, x, WY0, z, x + 0.2, TOP, z + d, false);
  // 층 사이 띠(바깥)
  for (const [z0, z1] of [[Z1, Z1 + 0.06], [Z0 - 0.06, Z0]]) { B.box(BEAM, X0 - 0.03, F2 - 0.22, z0, X1 + 0.03, F2, z1, false); B.box(BEAM, CX0, F3 - 0.22, z0, CX1, F3, z1, false); }
  for (const [x0, x1] of [[X0 - 0.06, X0], [X1, X1 + 0.06]]) { B.box(BEAM, x0, F2 - 0.22, Z0 - 0.03, x1, F2, Z1 + 0.03, false); for (const z of [Z0, Z1 - 0.18]) B.box(BEAM, x0, WY0, z, x1, EAVE, z + 0.18, false); }

  // 윗층 바닥(계단 구멍을 남긴다)
  const slab = (y, xa, xb) => {
    B.box(M.floor, xa, y - 0.2, Z0 + 0.1, ST.x0, y, Z1 - 0.1); B.box(M.floor, ST.x1, y - 0.2, Z0 + 0.1, xb, y, Z1 - 0.1);
    B.box(M.floor, ST.x0, y - 0.2, ST.z1, ST.x1, y, Z1 - 0.1);
  };
  slab(F2, X0 + 0.1, X1 - 0.1); slab(F3, CX0 + 0.1, CX1 - 0.1);

  // 복도 벽: 방 문(미닫이)과 복도 쪽 창
  const cW = [{ u0: 48.4, u1: 49.8, ys: [[F1, 2.5], [F2, 6.1]] }, { u0: 51, u1: 54, ys: [[2.1, 3.1], [4.9, 6.3]] }, { u0: 55, u1: 58, ys: [[2.1, 3.1], [4.9, 6.3]] }, { u0: 59, u1: 60.4, ys: [[F2, 6.1]] }];
  const cE = [{ u0: 75.6, u1: 77, ys: [[F1, 2.5], [F2, 6.1]] }, { u0: 78.5, u1: 81.5, ys: [[1.3, 2.7], [4.9, 6.3]] }, { u0: 82.5, u1: 85.5, ys: [[1.3, 2.7], [4.9, 6.3]] }, { u0: 86, u1: 87.4, ys: [[F1, 2.5]] }];
  for (const [ops, xa, xb, names] of [[cW, X0 + T, CX0, ['教室', '実習室']], [cE, CX1, X1 - T, ['職員室', '書庫']]]) {
    wall(B, WALL, 'x', CZ, CZ + 0.2, xa, xb, F1, EAVE, sink(ops));
    for (const o of ops) for (const [a, b] of o.ys) {
      if (a === F1 || a === F2) {
        doorUnit(B, 'x', CZ, CZ + 0.2, o.u0, o.u1, a, b, { leaf: 'slide', inward: -1, paper: true });
        signBoard(B, names[a === F1 ? 0 : 1], (o.u0 + o.u1) / 2, b + 0.35, CZ + 0.225, 0, 0.7, 0.26, { both: false, depth: 0.03 });
      } else windowUnit(B, 'x', CZ, CZ + 0.2, o.u0, o.u1, a, b, { sill: false, nx: 4, ny: 1 });
    }
  }
  // 날개의 보: 1층 천장 장선, 2층은 지붕 밑이 드러난 대들보와 대공
  for (const xa of [X0, CX1]) for (let i = 1; i < 5; i++) {
    const x = xa + i * 3;
    B.box(BEAM, x - 0.08, F2 - 0.36, Z0 + T, x + 0.08, F2 - 0.2, Z1 - T, false);
    B.box(BEAM, x - 0.1, EAVE - 0.22, Z0 + T, x + 0.1, EAVE, Z1 - T, false); B.box(BEAM, x - 0.07, EAVE, -112.07, x + 0.07, EAVE + 2.9, -111.93, false);
  }
  for (const [xa, xb] of [[X0 + 0.2, CX0 + 0.1], [CX1 - 0.1, X1 - 0.2]]) B.box(BEAM, xa, EAVE + 2.7, -112.14, xb, EAVE + 2.99, -111.86, false);   // 마룻도리

  /* ================= 지붕 ================= */
  gableRoof(B, ROOF, X0, Z0, CX0 - 0.35, Z1, EAVE, 3.0, { ridge: 'x', over: 0.8, gable: WALL, detail: 3 });
  gableRoof(B, ROOF, CX1 + 0.35, Z0, X1, Z1, EAVE, 3.0, { ridge: 'x', over: 0.8, gable: WALL, detail: 3 });
  hipRoof(B, ROOF2, CX0, Z0, CX1, Z1, TOP, 2.6, { over: 0.9, detail: 3 });
  /* ================= 둥근 탑(현관): 위로 갈수록 좁아지는 네 단, 단마다 눈썹지붕 ================= */
  const TX = 68, TZ = -97, NX0 = 66, NX1 = 70, NT = 0.25;       // 탑의 중심, 교사와 탑을 잇는 이음칸(안쪽 너비 4m)
  // 고리 꼴 기와 지붕. a0~a1 범위만 깐다(뒤쪽 이음칸 자리는 비운다)
  const ringRoof = (m, r, yEave, rise, rTop, seg = 40) => {
    const G = Math.asin((NX1 - NX0 + NT * 2 + 0.1) / 2 / rTop), a0 = -PI / 2 + G, a1 = PI * 1.5 - G, n = Math.round(seg * (a1 - a0) / (PI * 2)), da = (a1 - a0) / n, rim = [];
    for (let i = 0; i < n; i++) {
      const p = a0 + i * da, q = p + da, am = (p + q) / 2;
      const p0 = V3(TX + Math.cos(p) * r, yEave, TZ + Math.sin(p) * r), p1 = V3(TX + Math.cos(q) * r, yEave, TZ + Math.sin(q) * r);
      const U = new THREE.Vector3().subVectors(p0, p1), w = U.length(); U.normalize();
      const hw = w / 2, ch = Math.cos(da / 2), inR = r * ch, inTop = rTop * ch, plen = Math.hypot(inR - inTop, rise), wTop = rTop * Math.sin(da / 2);
      tilePanel(B, m, p1, U, V3(-Math.cos(am) * (inR - inTop), rise, -Math.sin(am) * (inR - inTop)).normalize(), w, plen, v => { const h = hw + (wTop - hw) * v / plen; return [hw - h, hw + h]; }, 3);
    }
    for (let i = 0; i <= n; i++) { const p = a0 + i * da; rim.push(V3(TX + Math.cos(p) * r, yEave - 0.03, TZ + Math.sin(p) * r)); }
    B.geo(BEAM, tube(rim, 0.07, 6, true));
    B.geo(mat('wood', 0x5a3b28, { side: 'double' }), new THREE.RingGeometry(rTop - 0.3, r, n, 1, a0, a1 - a0).rotateX(PI / 2), mat4(TX, yEave - 0.02, TZ));
    addRoof(TX - r, TZ - r, TX + r, TZ + r, (x, z) => { const d = Math.hypot(x - TX, z - TZ); if (d > r || d < rTop) return -Infinity; let a = Math.atan2(z - TZ, x - TX); if (a < a0) a += PI * 2; return a > a1 ? -Infinity : yEave + 0.12 + rise * (r - d) / (r - rTop); }, true);
  };
  const TIER = [                                                // [바깥 반지름, 벽 두께, 밑, 위, 재질]
    [6.0, 0.3, WY0, F2, WALL], [5.0, 0.28, F2, F3, REDP], [4.1, 0.25, F3, 10.6, WALL], [3.1, 0.22, 10.6, 12.4, REDP]];
  const backDoor = (r, ys) => { const g = Math.asin((NX1 - NX0) / 2 / (r - 0.15)); return { a0: -PI / 2 - g, a1: -PI / 2 + g, ys }; };
  const win = (k, wd, ys) => ({ a0: PI / 2 + k * PI / 3 - wd / 2, a1: PI / 2 + k * PI / 3 + wd / 2, ys });
  const fd = Math.asin(1.6 / 6.0);
  const OPS = [
    [backDoor(6.0, [[WY0, 3.0]]), { a0: PI / 2 - fd, a1: PI / 2 + fd, ys: [[WY0, 3.0]] }, ...[-2, -1.25, 1.25, 2].map(k => win(k, 0.3, [[1.3, 2.7]]))],
    [backDoor(5.0, [NK[0]]), ...[-2, -1, 1, 2].map(k => win(k, 0.38, [[F2 + 1.0, F2 + 2.5]]))],
    [backDoor(4.1, [NK[1]]), ...[-2, -1, 0, 1, 2].map(k => win(k, 0.52, [[F3 + 0.95, F3 + 2.25]]))], []];
  TIER.forEach(([r, t, y0, y1, m], i) => {
    roundWall(B, m, TX, TZ, r - t, r, y0, y1, OPS[i], { matIn: WALL });
    for (const o of OPS[i]) if (o.ys[0][0] > y0 + 0.5) roundWindow(B, TX, TZ, r - t, r, o.a0, o.a1, o.ys[0][0], o.ys[0][1], { nx: 2, ny: 2 });
    roundWall(B, BEAM, TX, TZ, r, r + 0.05, y1 - 0.24, y1, [], { collide: false, a0: -PI / 2 + 0.6, a1: PI * 1.5 - 0.6 });   // 단 위의 띠
  });
  B.geo(M.stone, new THREE.CylinderGeometry(6.3, 6.3, WY0, 48), mat4(TX, WY0 / 2, TZ));
  // 바닥: 네모 띠로 깐 원판은 가장자리가 톱니 꼴이라, 벽 안쪽 면보다 작게 깔고 둥근 고리로 가장자리를 메운다
  for (const [rin, y0, y1] of [[5.7, WY0, F1], [5.7, F2 - 0.2, F2], [4.72, F3 - 0.2, F3], [3.85, 10.42, 10.6]]) { roundFloor(B, M.floor, TX, TZ, rin - 0.3, y0, y1); roundWall(B, M.floor, TX, TZ, rin - 0.85, rin + 0.03, y0 - 0.004, y1 + 0.004, []); }
  // 눈썹지붕 셋과 꼭대기의 원뿔 지붕, 찰주
  ringRoof(ROOF2, 7.1, 3.5, 1.05, 5.25); ringRoof(ROOF2, 5.95, F3 - 0.4, 0.9, 4.3); ringRoof(ROOF2, 5.0, 10.25, 0.9, 3.3);
  coneRoof(B, ROOF, TX, TZ, 3.95, 12.3, 2.7, { seg: 28, detail: 3 });
  B.geo(BEAM, new THREE.CylinderGeometry(0.03, 0.06, 1.3, 8), mat4(TX, 16.2, TZ)); B.geo(BEAM, new THREE.SphereGeometry(0.11, 10, 8), mat4(TX, 16.2, TZ));
  // 이음칸: 층마다 교사에서 탑으로 건너가는 짧은 복도
  [[6.0, WY0, F2 - 0.2, null], [5.0, F2, F3 - 0.2, F2], [4.1, F3, 10.6, F3]].forEach(([r, y0, y1, fl]) => {
    const zE = TZ - Math.sqrt((r - 0.15) ** 2 - ((NX1 - NX0) / 2 + NT) ** 2);
    B.box(WALL, NX0 - NT, y0, Z1, NX0, y1, zE); B.box(WALL, NX1, y0, Z1, NX1 + NT, y1, zE);
    if (fl) B.box(M.floor, NX0 - NT, fl - 0.2, Z1 - 0.12, NX1 + NT, fl - 0.012, zE); else B.box(M.floor, NX0, WY0, Z1 - 0.06, NX1, F1 - 0.012, zE);   // 둥근 바닥과 겹치는 자리는 살짝 낮춘다(겹친 면이 깜빡이지 않게)
  });
  B.box(BEAM, NX0 - NT - 0.1, 10.6, Z1, NX1 + NT + 0.1, 10.76, TZ - 2.9);
  // 현관문: 붉은 문틀과 안으로 열어 둔 붉은 문짝, 돌 디딤
  B.box(M.stone, 65.9, 0, -91.25, 70.1, 0.15, -90.1);
  B.box(REDW, 66.25, 3.0, -91.22, 69.75, 3.32, -90.92, false);
  for (const sx of [-1, 1]) { const x = TX + sx * 1.6; B.box(REDW, x - 0.12, WY0, -91.3, x + 0.12, 3.0, -91.0, false); B.box(REDW, Math.min(x, x + sx * 0.07), F1, -92.95, Math.max(x, x + sx * 0.07), 2.95, -91.5); B.geo(M.iron, new THREE.TorusGeometry(0.09, 0.014, 6, 14).rotateY(PI / 2), mat4(x - sx * 0.02, 1.5, -92.7)); }
  // 문 옆의 붉은 곁채 둘(작은 창과 기와 차양)
  for (const sx of [-1, 1]) {
    const xa = TX + sx * 4.4 - 1.3, xb = xa + 2.6, za = -94.2, zb = -91.4;
    B.box(REDP, xa, 0, za, xb, 2.6, zb); B.box(M.stone, xa - 0.06, 0, za, xb + 0.06, 0.3, zb + 0.06, false);
    for (const dx of [0.35, 1.5]) { B.box(WHT, xa + dx, 1.25, zb, xa + dx + 0.75, 1.95, zb + 0.03, false); B.box(NAVY, xa + dx + 0.07, 1.32, zb + 0.03, xa + dx + 0.68, 1.88, zb + 0.04, false); }
    const o = V3(xa - 0.2, 2.6, zb + 0.45), Vv = V3(0, 0.75, -1.6), len = Vv.length(); Vv.normalize();
    tilePanel(B, ROOF2, o, V3(1, 0, 0), Vv, 3.0, len, null, 3);
    B.box(BEAM, xa - 0.2, 2.5, zb + 0.3, xb + 0.2, 2.6, zb + 0.45, false); B.box(BEAM, xa - 0.2, 2.5, za, xa - 0.1, 3.3, zb + 0.4, false); B.box(BEAM, xb + 0.1, 2.5, za, xb + 0.2, 3.3, zb + 0.4, false);
  }
  // 정면의 큰 표지: 나뭇잎 표, "アカデミー" 띠, 붉은 동그라미 안의 忍 — 첫 눈썹지붕에 기대 세웠다
  {
    const sign = textMat(' ', { w: 512, h: 1024, draw: (g, w, h) => {
      const ink = '#3a2a22', disc = (x, y, rx, ry, fill, lw = 12) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fillStyle = fill; g.fill(); if (lw) { g.lineWidth = lw; g.strokeStyle = ink; g.stroke(); } };
      disc(w / 2, 190, 150, 172, '#f3efe4'); disc(w / 2, 740, 236, 236, '#f3efe4'); disc(w / 2, 740, 196, 196, '#c8392e', 8);
      leafMark(g, w / 2 - 4, 196, 250, '#2b2622');
      g.fillStyle = '#f3efe4'; g.strokeStyle = ink; g.lineWidth = 12; g.beginPath(); g.roundRect(18, 372, w - 36, 132, 22); g.fill(); g.stroke();
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#c8392e'; g.font = '900 86px "Yu Gothic", "Meiryo", "MS Gothic", "Malgun Gothic", sans-serif'; g.fillText('アカデミー', w / 2, 442, w - 70);
      g.fillStyle = '#1a1512'; g.font = '900 300px "Yu Mincho", "YuMincho", "MS Mincho", "Batang", serif'; g.fillText('忍', w / 2, 752);
    } });
    const tilt = 0.2, L = 4.7, yb = 3.4, zb = TZ + 7.22;
    B.geo(sign, new THREE.PlaneGeometry(L / 2, L), mat4(TX, yb + Math.cos(tilt) * L / 2, zb - Math.sin(tilt) * L / 2, -tilt, 0, 0));
    for (const dx of [-0.6, 0.6]) { beamBetween(B, BEAM, V3(TX + dx, yb + 3.0, zb - 0.66), V3(TX + dx, yb + 2.7, TZ + 4.98), 0.08, 0.08); beamBetween(B, BEAM, V3(TX + dx, yb + 0.5, zb - 0.14), V3(TX + dx, yb + 0.72, TZ + 6.3), 0.08, 0.08); }
  }
  // 탑 안 — 1층 둥근 현관: 바닥의 나뭇잎 표, 화분
  B.geo(textMat(' ', { w: 256, h: 256, bg: '#c9a877', color: '#c9a877', draw: (g, w) => { g.strokeStyle = '#7a3a2a'; g.lineWidth = 8; g.beginPath(); g.arc(w / 2, w / 2, w * 0.46, 0, 7); g.stroke(); leafMark(g, w / 2, w / 2, w * 0.7, '#7a3a2a'); } }), new THREE.CircleGeometry(1.7, 40).rotateX(-PI / 2), mat4(TX, F1 + 0.012, TZ));
  for (const sx of [-1, 1]) { plant(TX + sx * 4.6, F1, TZ - 1.6); plant(TX + sx * 2.7, F1, TZ + 4.4); }
  pendant(TX, F2 - 0.2, TZ, 0.5);
  // 2층 담화실: 둥근 낮은 상과 방석
  B.geo(LIGHT, cyl(1.0, 1.0, 0.06, 28), mat4(TX, F2 + 0.36, TZ + 0.6)); B.geo(BEAM, cyl(0.5, 0.6, 0.33, 16), mat4(TX, F2 + 0.165, TZ + 0.6)); addCollider(TX - 1, F2, TZ - 0.4, TX + 1, F2 + 0.39, TZ + 1.6);
  for (let i = 0; i < 5; i++) { const a = i / 5 * PI * 2 + 0.3; B.geo(i % 2 ? RED : NAVY, gCushion, mat4(TX + Math.cos(a) * 1.6, F2 + 0.05, TZ + 0.6 + Math.sin(a) * 1.6, 0, a, 0)); }
  scroll(TX - 0.2, F2 + 0.435, TZ + 0.5, 0.4); papers(TX + 0.35, F2 + 0.39, TZ + 0.8, 4, 0.5);
  signBoard(B, '談話室', TX, F2 + 2.75, Z1 + 0.04, 0, 0.9, 0.28, { both: false, depth: 0.03 });
  pendant(TX, F3 - 0.2, TZ + 0.6, 0.6);
  // 3층 전망 방: 세 다리 위의 놋쇠 망원경(정문 쪽을 본다)
  { const BR = mat('metal', 0x8a6a3a), y = F3;
    for (let i = 0; i < 3; i++) { const a = i / 3 * PI * 2 + 0.5; beamBetween(B, BEAM, V3(TX + Math.cos(a) * 0.5, y, TZ + 1.6 + Math.sin(a) * 0.5), V3(TX, y + 1.25, TZ + 1.6), 0.05, 0.05); }
    B.geo(BR, cyl(0.07, 0.05, 1.1, 12).rotateX(PI / 2 - 0.12), mat4(TX, y + 1.33, TZ + 1.75)); B.geo(BR, cyl(0.085, 0.085, 0.08, 12).rotateX(PI / 2 - 0.12), mat4(TX, y + 1.4, TZ + 2.3));
    addCollider(TX - 0.4, y, TZ + 1.2, TX + 0.4, y + 1.5, TZ + 2.3);
    signBoard(B, '展望室', TX, F3 + 2.5, Z1 + 0.04, 0, 0.9, 0.28, { both: false, depth: 0.03 });
    pendant(TX, 10.42, TZ, 0.4);
  }
  // 교사 날개의 층 사이 기와 처마(남·북)와 그 밑의 널
  for (const [xa, xb] of [[X0 - 0.3, CX0 - 0.15], [CX1 + 0.15, X1 + 0.3]]) for (const sgn of [1, -1]) {
    const zw = sgn > 0 ? Z1 : Z0, ze = zw + sgn * 1.15, yw = F2 + 0.1, ye = F2 - 0.42, w = xb - xa, len = Math.hypot(1.15, yw - ye);
    tilePanel(B, ROOF, V3(sgn > 0 ? xa : xb, ye, ze), V3(sgn, 0, 0), V3(0, yw - ye, -sgn * 1.15).normalize(), w, len, null, 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([xa, ye - 0.04, ze, xb, ye - 0.04, ze, xb, yw - 0.04, zw, xa, yw - 0.04, zw], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, w, 0, w, len, 0, len], 2)); g.setIndex([0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2]); g.computeVertexNormals();
    B.geo(BEAM, g); B.box(BEAM, xa, ye - 0.1, Math.min(ze, ze - sgn * 0.1), xb, ye - 0.02, Math.max(ze, ze - sgn * 0.1), false);
    for (let x = xa + 0.4; x < xb; x += 1.5) beamBetween(B, BEAM, V3(x, F2 - 0.75, zw), V3(x, ye - 0.06, ze - sgn * 0.12), 0.07, 0.09);
  }

  /* ================= 계단(1→2층 속이 찬 계단, 2→3층 디딤판 계단이 그 위에 겹친다) ================= */
  stairs(B, M.floorDark, 'x', ST.x1, -1, F1, F2, ST.z0, ST.z1, 0.3);
  stairs(B, M.floorDark, 'x', ST.x1, -1, F2, F3, ST.z0, ST.z1, 0.3, 0.2);
  // 비탈 난간: 손스침 + 단마다 살. base를 주면 살이 그 바닥까지 내려가 구멍 가장자리도 막는다
  const stairRail = (yl, yh, z, base = null) => {
    const n = Math.round((yh - yl) / 0.2), tr = (ST.x1 - ST.x0) / (n - 1);
    beamBetween(B, BEAM, V3(ST.x0 - 0.05, yl + 1.12, z), V3(ST.x1 + 0.05, yh + 1.12 - 0.2 + 0.2, z), 0.08, 0.07);
    for (let k = 1; k < n; k++) {
      const xa = ST.x0 + (k - 1) * tr, yt = yl + k * 0.2, yb = base ?? yt;
      for (const f of [0.25, 0.75]) { const x = xa + tr * f, yr = yl + 1.08 + (x - ST.x0) / tr * 0.2; B.box(BEAM, x - 0.015, yb, z - 0.015, x + 0.015, yr, z + 0.015, false); }
      addCollider(xa, yb, z - 0.04, xa + tr, yt + 1.15, z + 0.04);
    }
    B.box(BEAM, ST.x0 - 0.1, yl, z - 0.05, ST.x0, yl + 1.2, z + 0.05); B.box(BEAM, ST.x1, yh, z - 0.05, ST.x1 + 0.1, yh + 1.2, z + 0.05);
  };
  stairRail(F1, F2, ST.z1 - 0.05); stairRail(F2, F3, ST.z1 - 0.05, F2);
  beamBetween(B, BEAM, V3(ST.x0, F2 - 0.02, ST.z1 - 0.05), V3(ST.x1, F3 - 0.22, ST.z1 - 0.05), 0.06, 0.24);
  railing(B, BEAM, [[ST.x0, ST.z0], [ST.x0, ST.z1], [ST.x1, ST.z1]], F3, 1.0);

  /* ================= 1층 현관 홀: 신발장 ================= */
  const SOLE = NAVY;
  const shoeRack = (xa, xb, za, zb, open) => {                    // z로 긴 신발장, open(±1) 쪽이 열린 면
    const H = 1.5, y0 = F1;
    B.box(LIGHT, xa, y0, za, xb, y0 + 0.06, zb, false); B.box(LIGHT, xa, y0 + H - 0.04, za, xb, y0 + H, zb, false);
    const bk = open > 0 ? xa : xb - 0.03; B.box(LIGHT, bk, y0, za, bk + 0.03, y0 + H, zb, false);
    const nz = Math.round((zb - za) / 0.42), cw = (zb - za) / nz;
    for (let i = 0; i <= nz; i++) { const z = Math.min(zb - 0.03, za + i * cw); B.box(LIGHT, xa, y0, z, xb, y0 + H, z + 0.03, false); }
    for (let j = 1; j < 5; j++) B.box(LIGHT, xa, y0 + j * 0.29, za, xb, y0 + j * 0.29 + 0.025, zb, false);
    for (let i = 0; i < nz; i++) for (let j = 0; j < 5; j++) {
      if (R() < 0.45) continue;                                    // 닌자 샌들 한 켤레(바닥 + 발등 끈)
      const y = y0 + (j ? j * 0.29 + 0.025 : 0.06), zc = za + (i + 0.5) * cw, xm = (xa + xb) / 2;
      for (const dz of [-0.07, 0.07]) { B.box(SOLE, xm - 0.12, y, zc + dz - 0.045, xm + 0.12, y + 0.025, zc + dz + 0.045, false); B.box(SOLE, xm + open * 0.02 - 0.03, y + 0.025, zc + dz - 0.045, xm + open * 0.02 + 0.03, y + 0.09, zc + dz + 0.045, false); }
    }
    addCollider(xa, y0, za, xb, y0 + H, zb);
  };
  shoeRack(63.5, 63.9, -112.5, -107.4, -1); shoeRack(63.9, 64.3, -112.5, -107.4, 1);
  shoeRack(71.7, 72.1, -112.5, -107.4, -1); shoeRack(72.1, 72.5, -112.5, -107.4, 1);
  B.box(mat('plain', 0x6b3a2a), 66.2, F1, -106.2, 69.8, F1 + 0.02, -104.5, false);       // 현관 깔개
  for (const x of [65.2, 70.8]) B.box(BEAM, x - 0.12, F1, -113.6, x + 0.12, F2 - 0.2, -113.36);   // 홀 기둥
  B.box(BEAM, CX0 + T, F2 - 0.42, -113.58, CX1 - T, F2 - 0.2, -113.38, false);
  notice('z', CX0 + T, 1, -117.5, -114.5, 1.3, 2.5, 9);
  plant(63, F1, -118.9); plant(73.1, F1, -114.4);
  { // 우산꽂이: 통에 우산 몇 자루
    const x = 73.2, z = -105;
    B.geo(BEAM, cyl(0.2, 0.17, 0.5, 12, true), mat4(x, F1 + 0.25, z)); B.geo(BEAM, cyl(0.17, 0.17, 0.02, 12), mat4(x, F1 + 0.01, z));
    for (let i = 0; i < 4; i++) { const a = i * 1.7, px = x + Math.cos(a) * 0.08, pz = z + Math.sin(a) * 0.08; B.geo(i % 2 ? RED : NAVY, new THREE.ConeGeometry(0.045, 0.75, 8), mat4(px, F1 + 0.5, pz, Math.sin(a) * 0.1, 0, Math.cos(a) * 0.1)); B.geo(BEAM, tube([V3(px, F1 + 0.85, pz), V3(px, F1 + 1.0, pz), V3(px + 0.05, F1 + 1.05, pz)], 0.012, 5), mat4()); }
    addCollider(x - 0.2, F1, z - 0.2, x + 0.2, F1 + 0.9, z + 0.2);
  }

  /* ================= 1층 교실: 계단식 긴 책상 ================= */
  const RX = 52, PITCH = 1.9, zA = Z0 + T, blocks = [[-118.85, -113.9], [-112.65, -107.7]];
  for (let k = 1; k <= 4; k++) B.box(M.floorDark, RX + PITCH * k, F1, zA, k < 4 ? RX + PITCH * (k + 1) : CX0, F1 + 0.3 * k, CZ);
  for (let k = 0; k <= 4; k++) {
    const x = RX + PITCH * k, y = F1 + 0.3 * k;
    for (const [za, zb] of blocks) {
      // 책상: 상판·앞가림판·선반·칸막이
      B.box(LIGHT, x + 0.18, y + 0.69, za, x + 0.74, y + 0.74, zb, false); B.box(LIGHT, x + 0.2, y + 0.08, za, x + 0.24, y + 0.69, zb, false);
      B.box(LIGHT, x + 0.24, y + 0.5, za, x + 0.7, y + 0.525, zb, false);
      for (let i = 0; i <= 3; i++) { const z = za + (zb - za - 0.05) * i / 3; B.box(LIGHT, x + 0.2, y, z, x + 0.72, y + 0.69, z + 0.05, false); }
      addCollider(x + 0.18, y, za, x + 0.74, y + 0.74, zb);
      // 긴 걸상: 앉는 널 + 다리 + 가로대
      B.box(LIGHT, x + 1.0, y + 0.4, za, x + 1.38, y + 0.45, zb);
      for (let i = 0; i <= 3; i++) { const z = za + 0.1 + (zb - za - 0.26) * i / 3; B.box(LIGHT, x + 1.04, y, z, x + 1.1, y + 0.4, z + 0.06, false); B.box(LIGHT, x + 1.28, y, z, x + 1.34, y + 0.4, z + 0.06, false); B.box(LIGHT, x + 1.1, y + 0.16, z + 0.01, x + 1.28, y + 0.21, z + 0.05, false); }
      B.box(LIGHT, x + 1.16, y + 0.16, za + 0.1, x + 1.22, y + 0.21, zb - 0.1, false);
      for (let i = 0; i < 3; i++) {                                // 자리마다 공책·두루마리·붓
        const z = za + (zb - za) * (i + 0.5) / 3 + (R() - 0.5) * 0.5, r = R();
        if (r < 0.55) papers(x + 0.46, y + 0.74, z, 1 + (R() * 4 | 0), PI / 2 + (R() - 0.5) * 0.5);
        if (r > 0.35 && r < 0.8) scroll(x + 0.45, y + 0.785, z + 0.4, PI / 2 + (R() - 0.5) * 0.6);
        if (r > 0.7) B.geo(BEAM, cyl(0.007, 0.004, 0.2, 5).rotateX(PI / 2), mat4(x + 0.6, y + 0.747, z - 0.3, 0, R() * 3, 0));
      }
    }
  }
  // 교단·칠판·교탁
  B.box(M.floorDark, X0 + T, F1, -118, 49.4, F1 + 0.15, -109);
  const bx0 = X0 + T, bzc = -113.5;
  B.box(GRN, bx0, 1.35, bzc - 3, bx0 + 0.04, 2.75, bzc + 3, false);
  B.box(BEAM, bx0, 2.75, bzc - 3.07, bx0 + 0.06, 2.82, bzc + 3.07, false); B.box(BEAM, bx0, 1.28, bzc - 3.07, bx0 + 0.06, 1.35, bzc + 3.07, false);
  for (const z of [bzc - 3.07, bzc + 3]) B.box(BEAM, bx0, 1.35, z, bx0 + 0.06, 2.75, z + 0.07, false);
  B.box(BEAM, bx0, 1.24, bzc - 2.9, bx0 + 0.12, 1.28, bzc + 2.9, false);                 // 분필 받침
  for (let i = 0; i < 5; i++) B.geo(i % 2 ? WHT : RED, cyl(0.008, 0.008, 0.07, 6).rotateX(PI / 2), mat4(bx0 + 0.07, 1.288, bzc - 2 + i * 0.5 + R() * 0.3, 0, R() - 0.5, 0));
  B.box(NAVY, bx0 + 0.03, 1.28, bzc + 2.2, bx0 + 0.1, 1.32, bzc + 2.36, false);          // 칠판지우개
  B.geo(textMat('忍術の基本 ― 変化・分身・変わり身', { w: 1024, h: 128, color: '#f1f1e6', font: 'gothic', weight: 700, pad: 0.04 }), new THREE.PlaneGeometry(5.6, 0.7), mat4(bx0 + 0.045, 2.3, bzc, 0, PI / 2, 0));
  B.geo(textMat('手裏剣は手首で投げる', { w: 1024, h: 128, color: '#f0dc82', font: 'gothic', weight: 700, pad: 0.04 }), new THREE.PlaneGeometry(3.6, 0.45), mat4(bx0 + 0.045, 1.7, bzc + 1, 0, PI / 2, 0));
  { // 교탁: 세 면 판 + 상판, 위에 출석부와 두루마리
    const x = 50.0, z = -113.5;
    B.box(BEAM, x + 0.3, F1, z - 0.6, x + 0.34, F1 + 1.0, z + 0.6, false); B.box(BEAM, x - 0.3, F1, z - 0.6, x + 0.3, F1 + 1.0, z - 0.56, false); B.box(BEAM, x - 0.3, F1, z + 0.56, x + 0.3, F1 + 1.0, z + 0.6, false);
    B.box(BEAM, x - 0.36, F1 + 1.0, z - 0.66, x + 0.4, F1 + 1.05, z + 0.66, false); B.box(BEAM, x - 0.3, F1 + 0.5, z - 0.56, x + 0.3, F1 + 0.53, z + 0.56, false);
    addCollider(x - 0.36, F1, z - 0.66, x + 0.4, F1 + 1.05, z + 0.66);
    papers(x, F1 + 1.05, z - 0.2, 6, 0.2); scroll(x, F1 + 1.095, z + 0.3, PI / 2 + 0.3); scroll(x + 0.1, F1 + 1.095, z + 0.42, PI / 2 + 0.1);
  }
  // 뒷벽 족자(세로 글씨)와 옆 게시판
  signBoard(B, '忍耐', CX0 - 0.03, F1 + 3.0 - 0.9, -113.5, -PI / 2, 0.5, 1.2, { vertical: true, both: false, depth: 0.03, bg: '#f2ead6' });
  notice('x', CZ, -1, 51.2, 53.8, 1.0, 1.9, 5);
  const lights = [pendant(55, F2 - 0.2, -113.3)];
  pendant(50, F2 - 0.2, -113.3);

  /* ================= 1층 교무실 ================= */
  // 의자: 앉는 판·네 다리·등받이 살. dir은 등받이가 있는 쪽(z ±1)
  const chair = (x, z, dir, y0 = F1) => {
    B.box(BEAM, x - 0.21, y0 + 0.42, z - 0.21, x + 0.21, y0 + 0.46, z + 0.21, false);
    for (const dx of [-0.18, 0.18]) for (const dz of [-0.18, 0.18]) B.box(BEAM, x + dx - 0.02, y0, z + dz - 0.02, x + dx + 0.02, y0 + (dz * dir > 0 ? 0.95 : 0.42), z + dz + 0.02, false);
    for (const y of [0.62, 0.78, 0.9]) B.box(BEAM, x - 0.18, y0 + y, z + dir * 0.18 - 0.012, x + 0.18, y0 + y + 0.05, z + dir * 0.18 + 0.012, false);
    addCollider(x - 0.21, y0, z - 0.21, x + 0.21, y0 + 0.46, z + 0.21);
  };
  // 사무 책상: 상판·다리판·서랍 세 칸(손잡이). dir은 앉는 쪽(z ±1)
  const gKnob = new THREE.SphereGeometry(0.018, 8, 6);
  const desk = (x, z, dir, y0 = F1) => {
    const w = 0.7, d = 0.37;
    B.box(LIGHT, x - w, y0 + 0.69, z - d, x + w, y0 + 0.73, z + d, false);
    B.box(LIGHT, x - w + 0.03, y0, z - d + 0.03, x - w + 0.07, y0 + 0.69, z + d - 0.03, false);
    B.box(LIGHT, x - w + 0.07, y0 + 0.2, z - dir * (d - 0.05) - 0.015, x + w - 0.45, y0 + 0.69, z - dir * (d - 0.05) + 0.015, false);   // 앞가림판
    B.box(LIGHT, x + w - 0.45, y0 + 0.05, z - d + 0.03, x + w - 0.03, y0 + 0.69, z + d - 0.03, false);                                  // 서랍 몸통
    for (let i = 0; i < 3; i++) { const y = y0 + 0.09 + i * 0.2, zf = z + dir * (d - 0.03); B.box(BEAM, x + w - 0.43, y, Math.min(zf, zf + dir * 0.015), x + w - 0.05, y + 0.17, Math.max(zf, zf + dir * 0.015), false); B.geo(M.iron, gKnob, mat4(x + w - 0.24, y + 0.09, zf + dir * 0.025)); }
    addCollider(x - w, y0, z - d, x + w, y0 + 0.73, z + d);
    // 책상 위: 서류 더미·두루마리·먹통과 붓
    const t = y0 + 0.73;
    papers(x - 0.35 + R() * 0.2, t, z + (R() - 0.5) * 0.2, 3 + (R() * 14 | 0), R() - 0.5); if (R() < 0.7) papers(x + 0.2, t, z - dir * 0.05, 1 + (R() * 5 | 0), R() - 0.5);
    for (let i = 0, n = 1 + (R() * 3 | 0); i < n; i++) scroll(x + 0.42 + (R() - 0.5) * 0.1, t + 0.045, z - dir * (0.22 - i * 0.1), (R() - 0.5) * 0.4);
    B.geo(M.iron, cyl(0.035, 0.04, 0.05, 10), mat4(x - 0.55, t + 0.025, z - dir * 0.2)); B.geo(BEAM, cyl(0.006, 0.004, 0.2, 5), mat4(x - 0.55, t + 0.11, z - dir * 0.2, 0.25, R() * 6, 0));
    chair(x - 0.15, z + dir * 0.75, dir, y0);
  };
  for (const x of [79.2, 80.75, 82.3, 83.85]) { desk(x, -114.4, -1); desk(x, -113.6, 1); }
  for (const x of [80, 81.55, 83.1]) { desk(x, -110.3, -1); desk(x, -109.5, 1); }
  desk(86.6, -108.6, -1);                                                                  // 창가의 주임 자리
  // 두루마리 장: 칸마다 두루마리를 눕혀 쌓는다(양쪽에서 보인다)
  const scrollShelf = (xc, za, zb, y0, fill = 0.7, back = 0) => {
    const xa = xc - 0.23, xb = xc + 0.23, H = 2.15, nd = Math.round((zb - za) / 1.05), cw = (zb - za) / nd;
    for (let i = 0; i <= nd; i++) { const z = Math.min(zb - 0.04, za + i * cw); B.box(BEAM, xa, y0, z, xb, y0 + H, z + 0.04, false); }
    for (let j = 0; j <= 5; j++) B.box(BEAM, xa, y0 + 0.06 + j * 0.41, za, xb, y0 + 0.1 + j * 0.41, zb, false);
    if (back) B.box(BEAM, back > 0 ? xb - 0.02 : xa, y0, za, back > 0 ? xb : xa + 0.02, y0 + H, zb, false);
    for (let j = 0; j < 5; j++) for (let i = 0; i < nd; i++) {
      const y = y0 + 0.1 + j * 0.41 + 0.048, a = za + i * cw + 0.1, n = Math.floor((cw - 0.12) / 0.1); let prev = false;
      for (let q = 0; q < n; q++) {
        const on = R() < fill;
        if (on) scroll(xc, y, a + q * 0.1, (R() - 0.5) * 0.08);
        if (on && prev && R() < 0.6) scroll(xc, y + 0.083, a + q * 0.1 - 0.05, (R() - 0.5) * 0.08);
        prev = on;
      }
    }
    addCollider(xa, y0, za, xb, y0 + H, zb);
  };
  scrollShelf(CX1 + 0.24, -119.6, -116.4, F1, 0.6, -1);
  notice('z', CX1, 1, -115.6, -111.4, 1.2, 2.5, 12);                                       // 임무·시간표 게시판
  signBoard(B, '任務表', CX1 + 0.03, 2.75, -113.5, PI / 2, 1.0, 0.3, { both: false, depth: 0.03 });
  { // 찻상: 주전자·찻잔·쟁반
    const x = 87.6, z = -118.6, y = F1;
    B.box(BEAM, x - 0.5, y + 0.5, z - 0.4, x + 0.5, y + 0.55, z + 0.4, false); for (const dx of [-0.44, 0.4]) for (const dz of [-0.34, 0.3]) B.box(BEAM, x + dx, y, z + dz, x + dx + 0.04, y + 0.5, z + dz + 0.04, false);
    addCollider(x - 0.5, y, z - 0.4, x + 0.5, y + 0.55, z + 0.4);
    B.box(BEAM, x - 0.3, y + 0.55, z - 0.2, x + 0.3, y + 0.565, z + 0.2, false);
    const pot = new THREE.LatheGeometry([[0, 0], [0.07, 0], [0.1, 0.05], [0.09, 0.12], [0.04, 0.15], [0.05, 0.17], [0, 0.18]].map(p => new THREE.Vector2(p[0], p[1])), 12);
    B.geo(M.iron, pot, mat4(x - 0.12, y + 0.565, z)); B.geo(M.iron, tube([V3(x - 0.03, y + 0.63, z), V3(x + 0.04, y + 0.67, z), V3(x + 0.06, y + 0.7, z)], 0.012, 6), mat4());
    B.geo(M.iron, new THREE.TorusGeometry(0.07, 0.007, 5, 12, PI), mat4(x - 0.12, y + 0.7, z));
    const cup = new THREE.LatheGeometry([[0, 0.005], [0.025, 0], [0.035, 0.06], [0.03, 0.06], [0.022, 0.012], [0, 0.012]].map(p => new THREE.Vector2(p[0], p[1])), 10);
    for (const [dx, dz] of [[0.1, -0.1], [0.18, 0.05], [0.08, 0.1]]) B.geo(WHT, cup, mat4(x + dx, y + 0.565, z + dz));
  }
  plant(88.2, F1, -107.4);
  lights.push(pendant(81.5, F2 - 0.2, -114));
  pendant(86.6, F2 - 0.2, -110);

  /* ================= 복도(1·2층): 창가 긴 의자·게시판 ================= */
  const bench = (x0, x1, z, y0) => { B.box(LIGHT, x0, y0 + 0.4, z - 0.18, x1, y0 + 0.45, z + 0.18); for (const x of [x0 + 0.1, x1 - 0.16]) { B.box(LIGHT, x, y0, z - 0.15, x + 0.06, y0 + 0.4, z - 0.09, false); B.box(LIGHT, x, y0, z + 0.09, x + 0.06, y0 + 0.4, z + 0.15, false); B.box(LIGHT, x, y0 + 0.15, z - 0.09, x + 0.06, y0 + 0.2, z + 0.09, false); } };
  notice('x', CZ + 0.2, 1, 78, 81, 2.95 - 1.0 + F1, 3.1, 0);
  bench(55.2, 57.8, CZ + 0.42, F1); bench(82.6, 85.4, CZ + 0.42, F2); bench(55.2, 57.8, CZ + 0.42, F2);

  /* ================= 2층 홀: 역대 호카게 현판 ================= */
  ['初代火影', '二代目火影', '三代目火影', '四代目火影'].forEach((t, i) => signBoard(B, t, CX1 - T - 0.03, F2 + 1.9, -116.2 + i * 1.9, -PI / 2, 0.5, 1.5, { vertical: true, both: false, depth: 0.04, bg: '#f2ead6' }));
  signBoard(B, '火の意志', CX0 + T + 0.03, F2 + 2.2, -112.5, PI / 2, 3.2, 0.9, { both: false, depth: 0.04, bg: '#f2ead6' });
  bench(63.2, 63.2 + 0.001 + 2.6, -108.2, F2);
  for (const z of [-116.2, -110.5]) { B.box(BEAM, 73.0, F2, z - 0.9, 73.4, F2 + 0.45, z + 0.9); }      // 현판 아래 받침 궤
  { // 졸업생에게 주는 이마 보호대를 늘어놓은 진열상
    const x0 = 66, x1 = 70, z = -109.2, y = F2;
    B.box(BEAM, x0, y + 0.78, z - 0.4, x1, y + 0.83, z + 0.4, false); B.box(NAVY, x0 + 0.05, y + 0.83, z - 0.35, x1 - 0.05, y + 0.836, z + 0.35, false);
    for (const x of [x0 + 0.06, x1 - 0.14]) for (const dz of [-0.34, 0.26]) B.box(BEAM, x, y, z + dz, x + 0.08, y + 0.78, z + dz + 0.08, false);
    B.box(BEAM, x0 + 0.1, y + 0.2, z - 0.03, x1 - 0.1, y + 0.26, z + 0.03, false);
    addCollider(x0, y, z - 0.4, x1, y + 0.83, z + 0.4);
    const plate = new THREE.BoxGeometry(0.16, 0.012, 0.07, 4, 1, 1), band = new THREE.BoxGeometry(0.62, 0.006, 0.055);
    for (let i = 0; i < 7; i++) { const x = x0 + 0.4 + i * 0.53, zz = z + (i % 2 ? 0.14 : -0.14), ry = (R() - 0.5) * 0.3; B.geo(i % 3 === 2 ? RED : mat('plain', 0x24365a), band, mat4(x, y + 0.84, zz, 0, ry, 0)); B.geo(mat('metal', 0xb9bcc2), plate, mat4(x, y + 0.848, zz, 0, ry, 0)); }
    signBoard(B, '卒業の証', 68, y + 0.98, z, 0, 0.6, 0.2, { depth: 0.03, bg: '#f2ead6' });
  }
  lights.push(pendant(68, F3 - 0.2, -110.5));

  /* ================= 2층 실습실 ================= */
  B.box(M.tatami, 50.3, F2, -117.6, 58.4, F2 + 0.04, -108.6, false);
  B.box(BEAM, 50.2, F2, -117.7, 58.5, F2 + 0.045, -117.6, false); B.box(BEAM, 50.2, F2, -108.6, 58.5, F2 + 0.045, -108.5, false);
  for (const z of [-118.4, -115.4, -112.4, -109.4]) targetPost(61.3, F2, z, -PI / 2, 2.1);  // 동쪽 벽 앞 과녁 기둥
  for (const [x, z] of [[52, -116], [55, -113.2], [57.5, -110.4]]) dummy(x, F2 + 0.04, z, R() * 3);
  { // 목검 걸이(복도 벽 창 아래)와 봉
    const z = CZ - 0.12, y = F2;
    for (const x of [51.3, 53.7]) { B.box(BEAM, x - 0.04, y, z - 0.1, x + 0.04, y + 0.95, z, false); for (let i = 0; i < 4; i++) B.box(BEAM, x - 0.03, y + 0.22 + i * 0.2, z - 0.22, x + 0.03, y + 0.25 + i * 0.2, z - 0.1, false); }
    for (let i = 0; i < 4; i++) {                                 // 살짝 휜 목검: 칼몸 + 코등이 + 자루
      const yy = y + 0.27 + i * 0.2, zz = z - 0.17, pts = []; for (let k = 0; k <= 6; k++) pts.push(V3(51.0 + k * 0.5, yy + 0.05 * Math.sin(k / 6 * PI), zz));
      B.geo(LIGHT, tube(pts, t => 0.018 - 0.006 * t, 6), mat4()); B.geo(BEAM, cyl(0.035, 0.035, 0.012, 10).rotateZ(PI / 2), mat4(51.75, yy + 0.022, zz));
    }
    addCollider(51, y, z - 0.25, 54, y + 0.95, z);
    for (let i = 0; i < 3; i++) B.geo(BEAM, cyl(0.016, 0.016, 1.8, 6), mat4(47.5 + i * 0.12, y + 0.9, -107.2 - i * 0.05, 0.12, 0, -0.08));
  }
  for (let i = 0; i < 5; i++) B.geo(i % 2 ? NAVY : RED, gCushion, mat4(48.2, F2 + 0.05 + i * 0.09, -118.9, 0, R() * 0.3, 0));   // 쌓아 둔 방석
  for (const [x, z] of [[51.5, -110], [53, -111.2]]) B.geo(NAVY, gCushion, mat4(x, F2 + 0.09, z, 0, R(), 0));
  { // 낮은 상: 쿠나이·수리검을 늘어놓았다
    const x = 48.6, z = -113.5, y = F2;
    B.box(BEAM, x - 0.4, y + 0.3, z - 0.8, x + 0.4, y + 0.34, z + 0.8, false); for (const dz of [-0.7, 0.64]) B.box(BEAM, x - 0.34, y, z + dz, x + 0.34, y + 0.3, z + dz + 0.06, false);
    addCollider(x - 0.4, y, z - 0.8, x + 0.4, y + 0.34, z + 0.8);
    for (let i = 0; i < 5; i++) B.geo(M.iron, gKunai, mat4(x - 0.1, y + 0.35, z - 0.6 + i * 0.12, PI / 2, 0.1 * (R() - 0.5), 0));
    for (let i = 0; i < 6; i++) B.geo(M.iron, gShuriken, mat4(x + 0.1 + R() * 0.1, y + 0.345 + i * 0.001, z + 0.15 + i * 0.1, PI / 2, R(), 0));
    scroll(x, y + 0.385, z + 0.65);
  }
  signBoard(B, '一日一善', X0 + T + 0.03, F2 + 2.75, -113.5, PI / 2, 2.2, 0.5, { both: false, depth: 0.03, bg: '#f2ead6' });

  /* ================= 2층 두루마리 서고 ================= */
  for (const x of [77.2, 79.8, 82.4, 85.0]) scrollShelf(x, -119.4, -113.1, F2, 0.68);
  scrollShelf(X1 - T - 0.24, -109.2, -107.0, F2, 0.55, 1);
  { // 열람 상: 펼쳐 놓은 두루마리(양쪽 말이 사이에 종이), 방석
    const x0 = 78.5, x1 = 83.5, z = -110.2, y = F2;
    B.box(BEAM, x0, y + 0.32, z - 0.5, x1, y + 0.37, z + 0.5, false); for (const x of [x0 + 0.1, x1 - 0.18]) B.box(BEAM, x, y, z - 0.42, x + 0.08, y + 0.32, z + 0.42, false);
    addCollider(x0, y, z - 0.5, x1, y + 0.37, z + 0.5);
    for (const xc of [79.6, 82.2]) { scroll(xc, y + 0.415, z - 0.3, 0, 1, RED); scroll(xc, y + 0.415, z + 0.25, 0, 1, RED); B.box(PAPER, xc - 0.17, y + 0.37, z - 0.3, xc + 0.17, y + 0.374, z + 0.25, false); }
    papers(80.9, y + 0.37, z, 8, 0.3); B.geo(M.iron, cyl(0.035, 0.04, 0.05, 10), mat4(81.4, y + 0.395, z - 0.2));
    for (const [x, dz] of [[79.6, 0.85], [82.2, 0.85], [80.9, -0.85]]) B.geo(RED, gCushion, mat4(x, y + 0.05, z + dz, 0, R() * 0.4, 0));
  }
  { // 봉인의 서: 받침대에 뉘어 둔 큰 두루마리
    const x = 87.6, z = -117.5, y = F2;
    for (const dz of [-0.45, 0.45]) { B.box(BEAM, x - 0.3, y, z + dz - 0.04, x + 0.3, y + 0.08, z + dz + 0.04, false); beamBetween(B, BEAM, V3(x - 0.25, y + 0.08, z + dz), V3(x, y + 0.5, z + dz), 0.06, 0.06); beamBetween(B, BEAM, V3(x + 0.25, y + 0.08, z + dz), V3(x, y + 0.5, z + dz), 0.06, 0.06); }
    const m = mat4(x, y + 0.72, z, 0, PI / 2, 0, 4.2); B.geo(PAPER, gRoll, m); B.geo(BEAM, gRod, m); B.geo(GRN, gBand, m);
    addCollider(x - 0.3, y, z - 0.9, x + 0.3, y + 0.95, z + 0.9);
  }
  { // 사다리(서가에 기대어)
    const x = 86.0, y = F2, a = V3(x, y, -118.9), b = V3(x + 0.0, y + 2.1, -118.9);
    for (const dz of [0, 0.42]) beamBetween(B, LIGHT, V3(x + 0.55, y, -118.9 + dz), V3(x - 0.75 + 0.02, y + 2.1, -118.9 + dz), 0.04, 0.06);
    for (let i = 1; i < 7; i++) { const t = i / 7; B.box(LIGHT, x + 0.55 - 1.28 * t - 0.02, y + 2.1 * t, -118.9, x + 0.55 - 1.28 * t + 0.02, y + 2.1 * t + 0.03, -118.48, false); }
  }
  signBoard(B, '静粛', CX1 + 0.03, F2 + 2.5, -109.5, PI / 2, 0.45, 1.0, { vertical: true, both: false, depth: 0.03, bg: '#f2ead6' });
  lights.push(pendant(81, EAVE - 0.22, -111.2, 0.9));
  pendant(78.5, EAVE - 0.22, -116.2, 0.9); pendant(83.7, EAVE - 0.22, -116.2, 0.9); pendant(54.5, EAVE - 0.22, -113, 0.9);

  /* ================= 3층 망루: 종 ================= */
  {
    const x = 68, z = -110, yC = TOP - 0.3;
    B.box(BEAM, CX0 + T, yC, z - 0.1, CX1 - T, yC + 0.2, z + 0.1, false);
    const bell = new THREE.LatheGeometry([[0, 0.62], [0.07, 0.62], [0.17, 0.56], [0.23, 0.42], [0.26, 0.15], [0.33, 0.02], [0.34, 0], [0.3, 0], [0.24, 0.14], [0.2, 0.4], [0.14, 0.52], [0, 0.56]].map(p => new THREE.Vector2(p[0], p[1])), 20);
    const BR = mat('metal', 0x8a6a3a);
    B.geo(BR, bell, mat4(x, yC - 1.0, z)); B.geo(BR, new THREE.TorusGeometry(0.06, 0.018, 6, 12), mat4(x, yC - 0.33, z));
    B.geo(M.iron, tube([V3(x, yC, z), V3(x, yC - 0.3, z)], 0.012, 5, false)); B.geo(M.iron, new THREE.SphereGeometry(0.06, 10, 8), mat4(x, yC - 0.92, z));
    B.geo(STRAW, tube([V3(x, yC - 0.9, z), V3(x + 0.02, yC - 1.6, z), V3(x, yC - 2.2, z + 0.02)], 0.015, 6), mat4());   // 당김줄
    for (const [za, zb] of [[-117.2, -112.5], [-109, -105]]) for (const xa of [CX0 + T + 0.05, CX1 - T - 0.41]) { B.box(LIGHT, xa, F3 + 0.4, za, xa + 0.36, F3 + 0.45, zb); for (const zz of [za + 0.1, zb - 0.16]) B.box(LIGHT, xa + 0.04, F3, zz, xa + 0.32, F3 + 0.4, zz + 0.06, false); }
    // 지도 상: 마을 지도 종이와 누름돌
    B.box(BEAM, 66.8, F3 + 0.7, -107.4, 69.2, F3 + 0.75, -106.0, false); for (const dx of [66.86, 69.06]) for (const dz of [-107.34, -106.14]) B.box(BEAM, dx, F3, dz, dx + 0.08, F3 + 0.7, dz + 0.08, false);
    addCollider(66.8, F3, -107.4, 69.2, F3 + 0.75, -106.0);
    B.box(PAPER, 67.1, F3 + 0.75, -107.2, 68.9, F3 + 0.755, -106.2, false);
    B.geo(textMat('木ノ葉隠れの里', { w: 512, h: 96, color: '#3a2a1c' }), new THREE.PlaneGeometry(1.2, 0.22).rotateX(-PI / 2), mat4(68, F3 + 0.757, -106.45));
    for (const [dx, dz] of [[67.2, -107.1], [68.8, -106.3]]) B.geo(M.stone, new THREE.SphereGeometry(0.05, 8, 6), mat4(dx, F3 + 0.78, dz, 0, 0, 0, [1, 0.6, 1]));
    scroll(68.6, F3 + 0.795, -107.0, 0.4);
    signBoard(B, '見張り', CX1 - T - 0.03, F3 + 2.4, -112, -PI / 2, 1.2, 0.4, { both: false, depth: 0.03, bg: '#f2ead6' });
    pendant(68, TOP - 0.1, -114.5, 0.5);
  }

  /* ================= 운동장 ================= */
  for (let z = -90.0; z < SOUTH - 0.5; z += 1.5) B.box(M.pave, 66.3, 0, z, 69.7, 0.05, Math.min(z + 1.44, SOUTH + 0.4), false);   // 판석 길
  for (let i = 0; i < 9; i++) B.box(M.pave, 71.5 + i * 2.0, 0, -93.2 + (i % 2) * 0.25, 72.6 + i * 2.0, 0.045, -92.2 + (i % 2) * 0.25, false);  // 과녁장으로 가는 디딤돌
  // 담: 돌 밑단 + 회벽 + 기와 지붕
  const CAP = ROOF2, TV = 0.405;
  const yardWall = (axis, c, a0, a1) => {
    const bx = (m, d, y0, y1, col) => (axis === 'x' ? B.box(m, a0, y0, c - d, a1, y1, c + d, col) : B.box(m, c - d, y0, a0, c + d, y1, a1, col));
    bx(M.stone, 0.2, 0, 0.5, true); bx(WALL, 0.14, 0.5, 1.84, true); bx(BEAM, 0.3, 1.84, 1.9, false);
    const w = a1 - a0;
    if (axis === 'x') {
      tilePanel(B, CAP, V3(a0, 1.9, c + 0.34), V3(1, 0, 0), V3(0, 0.22, -0.34).normalize(), w, TV, null, 2);
      tilePanel(B, CAP, V3(a1, 1.9, c - 0.34), V3(-1, 0, 0), V3(0, 0.22, 0.34).normalize(), w, TV, null, 2);
      beamBetween(B, CAP, V3(a0, 2.15, c), V3(a1, 2.15, c), 0.14, 0.1);
    } else {
      tilePanel(B, CAP, V3(c + 0.34, 1.9, a1), V3(0, 0, -1), V3(-0.34, 0.22, 0).normalize(), w, TV, null, 2);
      tilePanel(B, CAP, V3(c - 0.34, 1.9, a0), V3(0, 0, 1), V3(0.34, 0.22, 0).normalize(), w, TV, null, 2);
      beamBetween(B, CAP, V3(c, 2.15, a0), V3(c, 2.15, a1), 0.14, 0.1);
    }
  };
  // 뒤는 뒤뜰로 트였고, 서쪽 담에는 운동장으로, 동쪽 담에는 제1 훈련장으로 가는 문이 났다
  yardWall('x', SOUTH, 40.2, 65.72); yardWall('x', SOUTH, 70.28, 95.8);
  yardWall('z', 40.4, -122, -101.3); yardWall('z', 40.4, -96.7, SOUTH - 0.2); yardWall('z', 95.6, -122, -79.3); yardWall('z', 95.6, -74.7, SOUTH - 0.2);
  for (const [x, za, zb, txt] of [[40.4, -101.3, -96.7, '運動場'], [95.6, -79.3, -74.7, '第一演習場']]) {
    for (const z of [za, zb]) { B.box(BEAM, x - 0.23, 0, z - 0.23, x + 0.23, 2.9, z + 0.23); B.box(M.stone, x - 0.3, 0, z - 0.3, x + 0.3, 0.22, z + 0.3, false); }   // 기둥은 담의 돌 밑단(반폭 0.2)보다 굵게: 옆면이 한 평면이면 깜빡인다
    B.box(BEAM, x - 0.1, 2.5, za - 0.4, x + 0.1, 2.72, zb + 0.4, false);
    gableRoof(B, ROOF2, x - 0.4, za - 0.2, x + 0.4, zb + 0.2, 2.9, 0.42, { ridge: 'z', over: 0.42, overGable: 0.35, detail: 3 });
    signBoard(B, txt, x, 2.2, (za + zb) / 2, x < 68 ? PI / 2 : -PI / 2, 1.9, 0.4, { both: true, depth: 0.05, bg: '#e9dcc0' });
  }
  // 정문: 두 기둥 + 가로대 + 작은 기와지붕, 문패
  for (const x of [65.7, 69.85]) { B.box(BEAM, x, 0, SOUTH - 0.23, x + 0.45, 3.3, SOUTH + 0.23); B.box(M.stone, x - 0.08, 0, SOUTH - 0.31, x + 0.53, 0.25, SOUTH + 0.31, false); }
  B.box(BEAM, 65.3, 2.85, SOUTH - 0.12, 70.7, 3.1, SOUTH + 0.12, false);
  gableRoof(B, ROOF2, 65.6, SOUTH - 0.45, 70.4, SOUTH + 0.45, 3.3, 0.45, { ridge: 'x', over: 0.45, overGable: 0.4, detail: 3 });
  signBoard(B, '忍者学校', 70.075, 1.75, SOUTH + 0.265, 0, 0.3, 1.3, { vertical: true, both: false, depth: 0.05, bg: '#e9dcc0' });
  // 수리검 과녁장: 동쪽 담 앞에 통나무 기둥 다섯, 던지는 선, 날붙이 상자
  for (let i = 0; i < 5; i++) targetPost(92.6, 0, -97 + i * 3.6, -PI / 2, 2.2 + (i % 2) * 0.25);
  B.box(WHT, 84.9, 0, -98, 85.05, 0.045, -81.6, false);
  { const x = 83.6, z = -89.6;
    B.box(LIGHT, x - 0.35, 0, z - 0.25, x + 0.35, 0.04, z + 0.25, false); for (const [a, b, c, d] of [[-0.35, -0.25, -0.32, 0.25], [0.32, -0.25, 0.35, 0.25], [-0.35, -0.25, 0.35, -0.22], [-0.35, 0.22, 0.35, 0.25]]) B.box(LIGHT, x + a, 0, z + b, x + c, 0.3, z + d, false);
    addCollider(x - 0.35, 0, z - 0.25, x + 0.35, 0.3, z + 0.25);
    for (let i = 0; i < 7; i++) B.geo(M.iron, gKunai, mat4(x - 0.2 + i * 0.07, 0.2, z + (R() - 0.5) * 0.2, 0, R() * 3, -1.2 - R() * 0.3));
    for (let i = 0; i < 5; i++) B.geo(M.iron, gShuriken, mat4(x + 0.6 + R() * 0.5, 0.035, z + (R() - 0.5) * 0.9, PI / 2, R(), 0));   // 흘린 수리검
  }
  // 훈련 말뚝: 높이가 제각각인 통나무(밟고 건너뛴다)
  for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) {
    const x = 77 + i * 1.5 + (R() - 0.5) * 0.3, z = -73.5 + j * 1.5 + (R() - 0.5) * 0.3, h = 0.35 + ((i + j) % 4) * 0.3 + R() * 0.15;
    B.geo(LOG, gLog, mat4(x, h / 2, z, 0, R() * 6, 0, [1.05, h, 1.05])); B.geo(LIGHT, cyl(0.19, 0.19, 0.012, 12), mat4(x, h + 0.004, z));
    addCollider(x - 0.19, 0, z - 0.19, x + 0.19, h, z + 0.19);
  }
  // 철봉: 높이 다른 세 칸
  { const z = -70, xs = [57, 58.8, 60.6, 62.4], hs = [1.35, 1.75, 2.15];
    xs.forEach((x, i) => { const h = Math.max(hs[i - 1] || 0, hs[i] || 0) + 0.12; B.geo(M.iron, cyl(0.045, 0.045, h, 10), mat4(x, h / 2, z)); B.geo(M.iron, cyl(0.1, 0.12, 0.06, 10), mat4(x, 0.03, z)); B.geo(M.iron, new THREE.SphereGeometry(0.05, 8, 6), mat4(x, h, z)); addCollider(x - 0.06, 0, z - 0.06, x + 0.06, h, z + 0.06); });
    hs.forEach((h, i) => { B.geo(M.iron, alongX(cyl(0.022, 0.022, 1.8, 8)), mat4(xs[i] + 0.9, h, z)); addCollider(xs[i], h - 0.03, z - 0.03, xs[i + 1], h + 0.03, z + 0.03); });
  }
  // 서쪽: 타격 연습 허수아비와 평균대 통나무, 긴 의자
  for (let i = 0; i < 4; i++) dummy(44 + i * 2.2, 0, -94.5, 0);
  { const pts = [V3(43.2, 0.55, -86), V3(50.4, 0.55, -86)];
    B.geo(LOG, alongX(cyl(0.16, 0.14, 7.2, 12)), mat4(46.8, 0.55, -86)); addCollider(43.2, 0.39, -86.15, 50.4, 0.7, -85.85);
    for (const x of [44, 49.6]) { B.geo(LOG, cyl(0.14, 0.16, 0.42, 10), mat4(x, 0.21, -86.3)); B.geo(LOG, cyl(0.14, 0.16, 0.42, 10), mat4(x, 0.21, -85.7)); addCollider(x - 0.15, 0, -86.45, x + 0.15, 0.42, -85.55); }
  }
  bench(58, 61, -102.6, 0); bench(75, 78, -102.6, 0);

  B.finish(scene);

  const YD = [-1, 30];
  return {
    places: [
      { n: '아카데미 둥근 탑', t: '층층이 기와 눈썹지붕을 두른 아카데미의 얼굴. 정면에 나뭇잎 표와 忍 글자를 내걸었다. 1층은 현관, 2층은 담화실, 3층은 전망 방.', b: [TX - 6, TX + 6, Z1 + 0.05, TZ + 6], y: [0, 11] },
      { n: '닌자 아카데미 앞마당', t: '수리검 과녁 통나무와 철봉, 훈련 말뚝이 늘어선 흙 마당. 정문 문패에는 忍者学校라 적혀 있다.', b: [40, 96, -104, -64], y: YD },
      { n: '아카데미 현관 홀', t: '신발장에 닌자 샌들이 가지런하다. 북쪽 계단으로 윗층에 오른다.', b: [CX0, CX1, Z0, Z1], y: [0, F2 - 0.2] },
      { n: '1층 복도', t: '운동장 쪽으로 창이 나란히 난 복도.', b: [X0, X1, CZ + 0.2, Z1], y: [0, F2 - 0.2] },
      { n: '교실', t: '뒤로 갈수록 높아지는 계단식 긴 책상. 나루토가 졸던 그 자리.', b: [X0, CX0, Z0, CZ], y: [0, F2 - 0.2] },
      { n: '교무실', t: '선생들의 책상마다 서류와 두루마리가 쌓여 있다.', b: [CX1, X1, Z0, CZ], y: [0, F2 - 0.2] },
      { n: '2층 홀', t: '역대 호카게의 현판과 "불의 의지" 글씨가 걸려 있다.', b: [CX0, CX1, Z0, Z1], y: [F2 - 0.2, F3 - 0.2] },
      { n: '2층 복도', t: '창 너머로 운동장이 내려다보인다.', b: [X0, X1, CZ + 0.2, Z1], y: [F2 - 0.2, 11] },
      { n: '실습실', t: '다다미 위에 볏짚 허수아비, 벽 쪽에는 과녁 기둥과 목검.', b: [X0, CX0, Z0, CZ], y: [F2 - 0.2, 11] },
      { n: '두루마리 서고', t: '술법 두루마리가 칸칸이 쌓인 서가. 구석에는 봉인의 서.', b: [CX1, X1, Z0, CZ], y: [F2 - 0.2, 11] },
      { n: '망루', t: '수업 종이 매달린 꼭대기 방. 남쪽 문으로 둥근 탑의 전망 방에 건너간다.', b: [CX0, CX1, Z0, Z1], y: [F3 - 0.2, 14] },
    ],
    jumps: [
      ['닌자 아카데미', 68, 0, -60.5, 0, 20],
      ['아카데미 교실', 50.6, F1 + 0.15, -111, -PI / 2, 21],
      ['아카데미 두루마리 서고', 76.3, F2, -108.4, -PI / 2 + 0.5, 22],
    ],
    lights: [...lights.map(p => [p[0], p[1], p[2], 15, 17]), [TX, 2.8, TZ, 13, 13], [TX, F2 + 2.5, TZ + 0.6, 13, 12], [TX, F3 + 2.2, TZ, 11, 11]],
    glows,
    skip: [],
  };
}
