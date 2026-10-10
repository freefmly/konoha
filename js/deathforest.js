// 죽음의 숲(제44 훈련장) — 담 밖 동남쪽, 철망을 두른 둥근 숲. 자리표는 layout.js의 DEATH, 큰 나무는 streets.js, 땅·냇물은 village.js가 맡는다.
// 원작(기억)에서 가져온 것: 철망 울타리와 마흔네 개의 문, 출입 금지 팻말, 들머리에서 동의서를 내고 두루마리(天·地)를 받는 가림막 천막,
//   숲 한가운데의 탑, 탑 안 벽에 걸린 글귀와 인을 맺은 큰 손의 석상(예선이 열린 곳), 숲 속의 냇물, 큰 뱀과 큰 지네 같은 큰 짐승.
// 지어낸 것: 숲의 크기(원작은 지름이 수십 km — 여기서는 지름 320m로 줄였다)와 자리, 탑의 생김새와 방 짜임, 문 번호가 놓인 차례, 담에 낸 작은 문.
import * as THREE from '../vendor/three.module.js';
import { Builder, marks, settle, addCollider, mat4, tube } from './build.js';
import { M, mat, textMat } from './materials.js';
import { coneRoof, roundWall, roundWindow, roundFloor, gableRoof, signBoard, noren } from './arch.js';
import { terrainH } from './village.js';
import { WALL, DEATH, deathTrailDist } from './layout.js';
import { OPEN, BARE } from './zones.js';
import { sealHands } from './campus.js';

const PI = Math.PI, V = (x, y, z) => new THREE.Vector3(x, y, z);
const cyl = (rt, rb, h, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg);

export function deathForest(scene, out) {
  const D = DEATH, [cx, cz] = D.c, RF = D.rf, u = D.u, tg = D.t;
  const B = new Builder(), glows = [], lights = [], places = [];
  const STEEL = mat('metal', 0x7d8288, { rough: 0.6 }), RUST = mat('metal', 0x6b4a36, { rough: 0.85, metal: 0.4 }), LOG = mat('wood', 0x6b5138), STONE = M.stone;
  const inst = (g, m, ms, shadow = true) => { const im = new THREE.InstancedMesh(g, m, ms.length); ms.forEach((q, i) => im.setMatrixAt(i, q)); im.instanceMatrix.needsUpdate = true; im.castShadow = shadow; im.receiveShadow = true; im.computeBoundingSphere(); scene.add(im); return im; };
  // 돌려 놓는 상자: 가운데 (x, y, z), 크기 (w, h, d), 보는 쪽 ry
  const bx = (m, w, h, d, x, y, z, ry = 0) => B.geo(m, new THREE.BoxGeometry(w, h, d), mat4(x, y, z, 0, ry, 0));
  // 그 자리의 틀: 보는 쪽(+z)이 ry일 때 옆(+x)과 앞(+z)의 방향
  const frame = (x, z, ry) => { const c = Math.cos(ry), s = Math.sin(ry); return (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c]; };

  /* ================= 철망 울타리: 마흔네 문과 그 사이의 철망 ================= */
  const N = 176, GATES = 44, PW = 2 * PI * RF / N, FH = 4.2, phi0 = D.a + PI;       // 철망 칸 수, 문 수, 한 칸 너비, 철망 높이, 열린 문(마을 쪽)의 각도
  const mesh = textMat(' ', { w: 256, h: 256, draw: (g, w, h) => { g.strokeStyle = '#8b9096'; g.lineWidth = 3.2; for (let i = -16; i <= 32; i++) { g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16 + h, h); g.stroke(); g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16 - h, h); g.stroke(); } g.strokeRect(1.5, 1.5, w - 3, h - 3); } });
  const warn = textMat('立入禁止', { w: 512, h: 192, bg: '#f2ecdc', color: '#b3261a', border: '#b3261a', font: 'gothic' });
  const panels = [], posts = [], signs = [], topA = [], topB = [];
  const at = i => { const p = phi0 + (i / N) * 2 * PI; return [cx + Math.cos(p) * RF, cz + Math.sin(p) * RF, p]; };
  for (let i = 0; i < N; i++) {
    const [x, z, p] = at(i), y = terrainH(x, z), ry = PI / 2 - p;
    const [ex, ez] = at(i + 0.5), ey = terrainH(ex, ez);
    posts.push(mat4(ex, ey + 1.6, ez)); topA.push(V(ex, ey + FH + 0.1, ez)); topB.push(V(ex, ey + FH + 0.34, ez));
    if (i === 0) continue;                                                           // 열린 문
    for (const r of [ry, ry + PI]) panels.push(mat4(x, Math.max(y, 0) + FH / 2 - 0.5, z, 0, r, 0));
    if (i % 4 === 2) signs.push(mat4(x + Math.cos(p) * 0.06, y + 2.3, z + Math.sin(p) * 0.06, 0, ry, 0), mat4(x - Math.cos(p) * 0.06, y + 2.3, z - Math.sin(p) * 0.06, 0, ry + PI, 0));
    // 막는 상자: 한 칸을 잘게 나눠 둥근 줄을 따라 놓는다
    for (let k = 0; k < 6; k++) { const [ax, az] = at(i - 0.5 + k / 6), [bx2, bz2] = at(i - 0.5 + (k + 1) / 6); addCollider(Math.min(ax, bx2) - 0.12, y - 3, Math.min(az, bz2) - 0.12, Math.max(ax, bx2) + 0.12, y + FH + 0.4, Math.max(az, bz2) + 0.12); }
  }
  inst(new THREE.PlaneGeometry(PW + 0.06, FH + 1.2), mesh, panels, false);
  inst(cyl(0.07, 0.08, 6.2, 8), STEEL, posts);
  inst(new THREE.PlaneGeometry(1.5, 0.56), warn, signs, false);
  for (const line of [topA, topB]) B.geo(RUST, tube([...line, line[0]], 0.022, 4, false));   // 철망 위의 가시 철선 두 줄
  // 문: 굵은 쇠기둥 둘과 가로대, 번호판. 열린 문(12번)만 문짝이 안으로 젖혀 있고 나머지는 쇠사슬로 잠겼다
  for (let k = 0; k < GATES; k++) {
    const [x, z, p] = at(k * 4), y = terrainH(x, z), ry = PI / 2 - p, F = frame(x, z, ry), no = (k + 11) % GATES + 1, open = k === 0;
    for (const s of [-1, 1]) { const q = F(s * 1.55, 0); bx(STEEL, 0.2, FH + 2.4, 0.2, q[0], y + FH / 2 - 0.6, q[1], ry); addCollider(q[0] - 0.16, y - 2, q[1] - 0.16, q[0] + 0.16, y + FH + 0.6, q[1] + 0.16); }
    bx(STEEL, 3.3, 0.18, 0.18, x, y + FH + 0.3, z, ry); bx(STEEL, 3.3, 0.1, 0.1, x, y + 3.5, z, ry);
    const plate = textMat(String(no), { w: 128, h: 96, bg: '#23262b', color: '#e9e3d0', font: 'gothic', pad: 0.14 });
    for (const s of [1, -1]) { const q = F(0, s * 0.11); B.geo(plate, new THREE.PlaneGeometry(0.8, 0.6), mat4(q[0], y + FH - 0.32, q[1], 0, s > 0 ? ry : ry + PI, 0)); }
    bx(STEEL, 0.9, 0.7, 0.16, x, y + FH - 0.32, z, ry);
    if (open) {
      // 문 옆의 막힌 쪽: 철판과 팻말(문이 칸보다 좁다)
      for (const s of [-1, 1]) { const q = F(s * 2.25, 0); bx(RUST, PW / 2 - 1.5, FH + 0.6, 0.06, q[0], y + FH / 2 - 0.3, q[1], ry); addCollider(Math.min(q[0], F(s * 1.6, 0)[0], F(s * 2.9, 0)[0]) - 0.1, y - 2, Math.min(q[1], F(s * 1.6, 0)[1], F(s * 2.9, 0)[1]) - 0.1, Math.max(q[0], F(s * 1.6, 0)[0], F(s * 2.9, 0)[0]) + 0.1, y + FH + 0.4, Math.max(q[1], F(s * 1.6, 0)[1], F(s * 2.9, 0)[1]) + 0.1); }
      { const q = F(-2.25, 0.05); signBoard(B, '第四十四演習場', q[0], y + 2.9, q[1], ry, 1.25, 0.34, { both: false, depth: 0.03, bg: '#f2ecdc' }); signBoard(B, '立入禁止', q[0], y + 2.3, q[1], ry, 1.25, 0.42, { both: false, depth: 0.03, bg: '#f2ecdc', color: '#b3261a' }); }
      { const q = F(2.25, 0.05); signBoard(B, '危険', q[0], y + 2.6, q[1], ry, 1.0, 0.6, { both: false, depth: 0.03, bg: '#e8c23a', color: '#1d1a16' }); }
      // 젖힌 문짝 둘(숲 안쪽으로): 쇠틀과 살
      for (const s of [-1, 1]) for (const [lz, w, h, yy] of [[-0.75, 0.08, 3.4, 1.8], [-1.5, 0.08, 3.4, 1.8]]) { const q = F(s * 1.5, lz); bx(STEEL, w, h, 0.08, q[0], y + yy, q[1], ry); }
      for (const s of [-1, 1]) for (const yy of [0.2, 1.8, 3.4]) { const q = F(s * 1.5, -0.78); bx(STEEL, 0.06, 0.08, 1.5, q[0], y + yy, q[1], ry); }
      for (const s of [-1, 1]) { const q = F(s * 1.5, -0.78); B.geo(mesh, new THREE.PlaneGeometry(1.44, 3.2), mat4(q[0] + Math.cos(ry) * 0.02 * s, y + 1.8, q[1] - Math.sin(ry) * 0.02 * s, 0, ry + s * PI / 2, 0)); B.geo(mesh, new THREE.PlaneGeometry(1.44, 3.2), mat4(q[0], y + 1.8, q[1], 0, ry - s * PI / 2, 0)); addCollider(q[0] - 0.75, y, q[1] - 0.75, q[0] + 0.75, y + 3.5, q[1] + 0.75); }
    } else {
      // 잠긴 문: 가운데 맞닿은 문틀, 감아 건 쇠사슬과 자물쇠
      bx(STEEL, 0.1, FH - 0.5, 0.1, x, y + FH / 2 - 0.3, z, ry);
      const q = F(0, 0.1); B.geo(RUST, new THREE.TorusGeometry(0.16, 0.03, 6, 12), mat4(q[0], y + 1.55, q[1], 0, ry, 0)); bx(RUST, 0.16, 0.2, 0.08, q[0], y + 1.32, q[1], ry);
    }
  }

  /* ================= 오솔길 가의 것: 담의 작은 문, 가림막 천막 ================= */
  // 담의 작은 문(제 좌표: 숲 쪽이 +z)
  const put = (x, z, ry, make) => { const holder = new THREE.Group(), from = marks(), b = new Builder(); const res = make(b) || null; b.finish(holder); return settle(scene, holder, from, { x, z, ry }, res); };
  const gry = PI / 2 - D.a;
  put(D.gate[0], D.gate[1], gry, b => {
    const planks = mat('planks', 0x5e5446);
    for (const s of [-1, 1]) { b.box(M.beam, s * 2.55 - 0.28, 0, -1.4, s * 2.55 + 0.28, 4.4, 1.4); b.box(planks, s * 2.3 - 0.07, 0.12, 1.4, s * 2.3 + 0.07, 3.9, 3.6); for (const y of [0.7, 2.0, 3.3]) b.box(M.iron, s * 2.3 - 0.09, y, 1.45, s * 2.3 + 0.09, y + 0.1, 3.55, false); }
    b.box(M.beam, -3.0, 3.95, -1.46, 3.0, 4.5, 1.46, false); b.box(STONE, -2.3, 0, -1.3, 2.3, 0.06, 1.3, false);
    signBoard(b, '第四十四演習場', -5.4, 2.6, -1.16, PI, 2.6, 0.5, { both: false });
    signBoard(b, '死の森 ― 許可なき者 立入禁止', -5.4, 1.85, -1.16, PI, 2.6, 0.4, { both: false, color: '#b3261a' });
    for (const s of [-1, 1]) { b.box(STONE, s * 3.6 - 0.22, 0, -4.2, s * 3.6 + 0.22, 1.5, -3.76); b.box(STONE, s * 3.6 - 0.3, 1.5, -4.28, s * 3.6 + 0.3, 1.62, -3.68, false); }
  });
  // 가림막 천막: 동의서를 내고 두루마리를 받는 곳. 오솔길 옆, 담과 철망 사이
  { const p = [D.gate[0] + u[0] * 12 + tg[0] * 7.5, D.gate[1] + u[1] * 12 + tg[1] * 7.5];
    put(p[0], p[1], gry + PI / 2, b => {
      const PAPER = mat('paper', 0xefe6cf), DARK = mat('plain', 0x2b2f3a), WHT = mat('plain', 0xf0ece0), CLOTH = mat('cloth', 0x3a3550);
      for (const x of [-2.4, 2.4]) for (const z of [-1.6, 1.6]) b.box(M.beam, x - 0.08, 0, z - 0.08, x + 0.08, 2.5, z + 0.08);
      gableRoof(b, mat('tile', 0x4a5560), -2.4, -1.6, 2.4, 1.6, 2.5, 0.8, { ridge: 'x', over: 0.5, overGable: 0.4, detail: 3 });
      b.box(CLOTH, -2.4, 0.9, -1.63, 2.4, 2.5, -1.6, false); b.box(CLOTH, -2.43, 0.9, -1.6, -2.4, 2.5, 1.6, false); b.box(CLOTH, 2.4, 0.9, -1.6, 2.43, 2.5, 1.6, false);   // 세 면의 가림막
      noren(b, 'x', 1.62, -2.3, 2.3, 2.45, 0.9, '巻物交換所', { color: '#3a3550' });
      b.box(M.beamLight, -1.9, 0.72, 0.5, 1.9, 0.78, 1.3); for (const x of [-1.8, 1.72]) b.box(M.beamLight, x, 0, 0.56, x + 0.08, 0.72, 1.24, false); addCollider(-1.9, 0, 0.5, 1.9, 0.78, 1.3);
      // 책상 위: 동의서 더미, 두루마리(天은 흰 것, 地는 검은 것)
      b.box(PAPER, -1.6, 0.78, 0.7, -1.3, 0.86, 1.1, false); b.box(PAPER, -1.2, 0.78, 0.72, -0.9, 0.82, 1.12, false);
      for (let i = 0; i < 5; i++) { b.geo(i % 2 ? DARK : WHT, cyl(0.06, 0.06, 0.42, 10).rotateZ(PI / 2), mat4(0.1 + i * 0.36, 0.84, 0.9 + (i % 2) * 0.12)); b.geo(M.beam, cyl(0.018, 0.018, 0.5, 6).rotateZ(PI / 2), mat4(0.1 + i * 0.36, 0.84, 0.9 + (i % 2) * 0.12)); }
      // 뒤쪽 궤짝 둘: 天, 地
      for (const [x, txt] of [[-1.3, '天'], [1.3, '地']]) { b.box(LOG, x - 0.6, 0, -1.3, x + 0.6, 0.7, -0.5); signBoard(b, txt, x, 0.38, -0.49, 0, 0.42, 0.42, { both: false, depth: 0.02, bg: txt === '天' ? '#f0ece0' : '#2b2f3a', color: txt === '天' ? '#1d1a16' : '#f0ece0' }); }
      signBoard(b, '同意書を提出のこと', 0, 2.05, -1.58, 0, 2.6, 0.36, { both: false, depth: 0.03 });
      return { places: [{ n: '죽음의 숲 들머리 천막', t: '숲에 들기 전에 동의서를 내고 天이나 地의 두루마리를 받아 가는 가림막 천막.', b: [-3, 3, -2.2, 2.4], y: [-1, 4] }] };
    }).places.forEach(q => places.push(q));
    OPEN.push([p[0], p[1], 5.5]);
  }

  /* ================= 한가운데의 탑 ================= */
  {
    const Y0 = terrainH(cx, cz), pd = phi0, dry = PI / 2 - pd;                                  // 바닥 높이, 문이 난 각도(마을 쪽), 문이 보는 쪽
    const WALLM = mat('plaster', 0xd9cdb0), RED = mat('plaster', 0x9c4636), TILE = mat('tile', 0xa8452e), GREY = mat('stone', 0xa9a79c);
    const dir = [Math.cos(pd), Math.sin(pd)], F = frame(cx, cz, dry);
    B.geo(STONE, cyl(15.4, 15.8, 3.3, 56), mat4(cx, Y0 - 1.45, cz));
    const da = Math.asin(1.9 / 13.9), wins = (n, w, y0, y1, skip = false) => { const o = []; for (let i = 0; i < n; i++) { const a = pd + (i + 0.5) * 2 * PI / n; if (skip && Math.abs(i + 0.5 - n / 2) < 0.6) continue; o.push({ a0: a - w / 2, a1: a + w / 2, ys: [[y0, y1]] }); } return o; };
    const TIERS = [[14.2, 0.6, Y0, Y0 + 9, WALLM, [{ a0: pd - da, a1: pd + da, ys: [[Y0 + 0.27, Y0 + 3.9]] }, ...wins(8, 0.22, Y0 + 5.4, Y0 + 7.2)]],
      [11.4, 0.5, Y0 + 9, Y0 + 15, RED, wins(8, 0.24, Y0 + 11, Y0 + 12.8)], [9.0, 0.45, Y0 + 15, Y0 + 20.5, WALLM, wins(6, 0.3, Y0 + 16.8, Y0 + 18.6)], [6.7, 0.4, Y0 + 20.5, Y0 + 25, RED, wins(6, 0.34, Y0 + 21.9, Y0 + 23.5)]];
    for (const [r, t, y0, y1, m, ops] of TIERS) {
      roundWall(B, m, cx, cz, r - t, r, y0, y1, ops, { matIn: WALLM, seg: 64 });
      for (const o of ops) if (o.ys[0][0] > y0 + 1) roundWindow(B, cx, cz, r - t, r, o.a0, o.a1, o.ys[0][0], o.ys[0][1], { nx: 2, ny: 2 });
      roundWall(B, M.beam, cx, cz, r, r + 0.06, y1 - 0.3, y1, [], { collide: false });
    }
    coneRoof(B, TILE, cx, cz, 16.6, Y0 + 8.5, 1.5, { rTop: 11.7, cap: false, seg: 40, detail: 3 });
    coneRoof(B, TILE, cx, cz, 13.4, Y0 + 14.5, 1.4, { rTop: 9.3, cap: false, seg: 36, detail: 3 });
    coneRoof(B, TILE, cx, cz, 10.8, Y0 + 20.0, 1.3, { rTop: 7.0, cap: false, seg: 32, detail: 3 });
    coneRoof(B, TILE, cx, cz, 8.6, Y0 + 24.7, 5.2, { seg: 28, detail: 3 });
    // 1층 바닥과 천장
    roundFloor(B, M.floor, cx, cz, 13.0, Y0 - 0.2, Y0 + 0.3); roundWall(B, M.floor, cx, cz, 12.6, 13.62, Y0 - 0.2, Y0 + 0.306, []);
    B.geo(M.beamLight, new THREE.CircleGeometry(13.6, 56).rotateX(PI / 2), mat4(cx, Y0 + 8.96, cz));
    for (let i = 0; i < 4; i++) { const a = pd + i * PI / 4; B.geo(M.beam, new THREE.BoxGeometry(27, 0.4, 0.36), mat4(cx, Y0 + 8.74, cz, 0, PI / 2 - a, 0)); }
    // 문: 굵은 나무 문틀, 돌 디딤, 문 위의 글씨
    for (const s of [-1, 1]) { const q = F(s * 1.92, 13.95); bx(M.beam, 0.44, 3.9, 0.9, q[0], Y0 + 2.2, q[1], dry); }
    { const q = F(0, 13.95); bx(M.beam, 4.5, 0.5, 0.95, q[0], Y0 + 4.05, q[1], dry); const s2 = F(0, 15.6); bx(STONE, 4.6, 0.3, 2.6, s2[0], Y0 + 0.15, s2[1], dry); const s4 = F(0, 13.95); bx(STONE, 3.5, 0.32, 0.86, s4[0], Y0 + 0.155, s4[1], dry); const s3 = F(0, 14.52); signBoard(B, '中央塔', s3[0], Y0 + 5.2, s3[1], dry, 2.4, 0.8, { both: false, depth: 0.08, bg: '#e9dcc0' }); }
    // 안: 대련 마당의 금, 돌 단 위의 손 석상(문을 마주 본다), 벽의 글귀
    B.geo(mat('plain', 0xf0ece0), new THREE.RingGeometry(6.9, 7.0, 64).rotateX(-PI / 2), mat4(cx, Y0 + 0.315, cz));
    { const q = F(0, -8.6);
      for (const [w, d, y] of [[9.5, 5.2, 0.3], [8.3, 4.4, 0.6], [7.1, 3.6, 0.9]]) bx(GREY, w, 0.3, d, q[0], Y0 + y + 0.15, q[1], dry);
      sealHands(B, GREY, q[0], Y0 + 1.2, q[1], 1.28, dry);
      addCollider(q[0] - 3.6, Y0 + 0.3, q[1] - 3.6, q[0] + 3.6, Y0 + 1.2, q[1] + 3.6); addCollider(q[0] - 1.9, Y0 + 1.2, q[1] - 1.9, q[0] + 1.9, Y0 + 7.5, q[1] + 1.9); }
    for (const [s, txt] of [[-1, '天無くば智を識り機に備え'], [1, '地無くば野を駆け利を求めん']]) { const a = pd + PI + s * 0.52, x = cx + Math.cos(a) * 13.5, z = cz + Math.sin(a) * 13.5; signBoard(B, txt, x, Y0 + 4.2, z, PI / 2 - a + PI, 0.9, 5.4, { vertical: true, both: false, depth: 0.05, bg: '#f2ead6' }); }
    // 횃불 받침 넷
    for (let i = 0; i < 4; i++) { const a = pd + PI / 4 + i * PI / 2, x = cx + Math.cos(a) * 11.6, z = cz + Math.sin(a) * 11.6;
      B.geo(M.iron, cyl(0.05, 0.07, 1.6, 8), mat4(x, Y0 + 1.1, z)); B.geo(M.iron, cyl(0.26, 0.12, 0.3, 10), mat4(x, Y0 + 2.0, z)); B.geo(mat('glow', 0xffb060, { power: 1.6 }), new THREE.ConeGeometry(0.2, 0.55, 8), mat4(x, Y0 + 2.4, z));
      addCollider(x - 0.2, Y0, z - 0.2, x + 0.2, Y0 + 2.2, z + 0.2); glows.push([x, Y0 + 2.4, z, 1.3]); lights.push([x, Y0 + 2.8, z, 16, 18]); }
    places.push({ n: '죽음의 숲 중앙 탑', t: '숲 한가운데의 탑. 天과 地의 두루마리를 모두 모은 조만 여기에 닿는다. 안에는 인을 맺은 큰 손의 석상이 서 있고, 중급닌자 시험의 예선이 여기서 열렸다.', b: [cx - 16, cx + 16, cz - 16, cz + 16], y: [Y0 - 2, Y0 + 32] });
    out.jumps.push(['죽음의 숲 중앙 탑', cx + dir[0] * 21, Y0, cz + dir[1] * 21, Math.atan2(dir[0], dir[1]), 96]);
    OPEN.push([cx, cz, D.tower + 4]);
  }

  /* ================= 숲의 큰 짐승 ================= */
  // 큰 뱀: 냇가에 몸을 사리고 고개를 든 채 굳어 있다
  { const [sx, sz] = D.snake, SK = mat('plain', 0x6d5a43, { rough: 0.7 }), BELLY = mat('plain', 0xcdbb8e, { rough: 0.8 }), pts = [];
    for (let i = 0; i <= 60; i++) { const t = i / 60, a = t * PI * 4.4, r = 7.5 - t * 4.6, x = sx + Math.cos(a) * r, z = sz + Math.sin(a) * r * 0.8; pts.push(V(x, terrainH(x, z) + 0.85 + (t > 0.86 ? (t - 0.86) * 34 : 0) + Math.floor(a / (2 * PI)) * 0.55, z)); }
    const rad = t => 0.95 * (t < 0.1 ? 0.25 + 7.5 * t : t > 0.93 ? 1 - (t - 0.93) * 2.5 : 1) * (0.9 + 0.1 * Math.sin(t * 60));
    B.geo(SK, tube(new THREE.CatmullRomCurve3(pts).getPoints(220), rad, 12, true));
    const hd = pts[60], dv = new THREE.Vector3().subVectors(pts[60], pts[58]).setY(0).normalize(), hry = Math.atan2(dv.x, dv.z);
    B.geo(SK, new THREE.SphereGeometry(1, 16, 12), mat4(hd.x + dv.x * 0.9, hd.y + 0.2, hd.z + dv.z * 0.9, 0, hry, 0, [0.95, 0.62, 1.7]));
    B.geo(BELLY, new THREE.SphereGeometry(1, 14, 10), mat4(hd.x + dv.x * 1.0, hd.y - 0.2, hd.z + dv.z * 1.0, 0.12, hry, 0, [0.8, 0.4, 1.5]));
    for (const s of [-1, 1]) { const ex = hd.x + dv.x * 1.5 + dv.z * s * 0.6, ez = hd.z + dv.z * 1.5 - dv.x * s * 0.6; B.geo(mat('glow', 0xe8c23a, { power: 1.2 }), new THREE.SphereGeometry(0.15, 10, 8), mat4(ex, hd.y + 0.5, ez)); B.geo(M.iron, new THREE.SphereGeometry(0.07, 8, 6), mat4(ex + dv.x * 0.11, hd.y + 0.5, ez + dv.z * 0.11, 0, 0, 0, [0.5, 1.3, 0.5])); }
    B.geo(mat('plain', 0xa8382c), tube([V(hd.x + dv.x * 2.4, hd.y - 0.1, hd.z + dv.z * 2.4), V(hd.x + dv.x * 3.2, hd.y - 0.3, hd.z + dv.z * 3.2), V(hd.x + dv.x * 3.7 + dv.z * 0.2, hd.y - 0.2, hd.z + dv.z * 3.7 - dv.x * 0.2)], 0.05, 5, true));
    for (let i = 0; i < 60; i += 3) addCollider(pts[i].x - 1, pts[i].y - 1.2, pts[i].z - 1, pts[i].x + 1, pts[i].y + 0.9, pts[i].z + 1);
    places.push({ n: '큰 뱀', t: '죽음의 숲에 사는 큰 뱀. 사람을 통째로 삼킬 만큼 크다. 냇가에 몸을 사린 채 꼼짝도 않는다.', b: [sx - 9, sx + 9, sz - 8, sz + 8] });
    OPEN.push([sx, sz, 11]);
  }
  // 큰 지네: 오솔길 옆 풀섶을 가로질러 기어간다
  { const [gx, gz] = D.centipede, SH = mat('plain', 0x5a2a22, { rough: 0.5 }), LEG = mat('plain', 0xc9902e, { rough: 0.6 }), n = 22;
    const P = i => { const t = i / n, x = gx - 6 + t * 12, z = gz + Math.sin(t * 5.2) * 1.8; return [x, terrainH(x, z) + 0.42, z]; };
    for (let i = 0; i <= n; i++) { const [x, y, z] = P(i), [x2, , z2] = P(Math.min(n, i + 1)), [x0, , z0] = P(Math.max(0, i - 1)), ry = Math.atan2(x2 - x0, z2 - z0), k = i === n ? 1.25 : 1;
      B.geo(SH, new THREE.SphereGeometry(1, 10, 8), mat4(x, y, z, 0, ry, 0, [0.48 * k, 0.3 * k, 0.36]));
      if (i < n) for (const s of [-1, 1]) { const ox = Math.cos(ry) * s, oz = -Math.sin(ry) * s; B.geo(LEG, tube([V(x + ox * 0.4, y, z + oz * 0.4), V(x + ox * 0.95, y + 0.25, z + oz * 0.95), V(x + ox * 1.25, y - 0.4, z + oz * 1.25)], 0.04, 5, true)); }
      if (i === n) for (const s of [-1, 1]) { const ox = Math.cos(ry) * s, oz = -Math.sin(ry) * s, fx = Math.sin(ry), fz = Math.cos(ry); B.geo(LEG, tube([V(x + ox * 0.2 + fx * 0.4, y + 0.1, z + oz * 0.2 + fz * 0.4), V(x + ox * 0.6 + fx * 1.2, y + 0.7, z + oz * 0.6 + fz * 1.2), V(x + ox * 0.9 + fx * 2.0, y + 0.5, z + oz * 0.9 + fz * 2.0)], 0.03, 5, true)); }
      if (i % 2 === 0) addCollider(x - 0.5, y - 0.6, z - 0.5, x + 0.5, y + 0.35, z + 0.5);
    }
    places.push({ n: '큰 지네', t: '죽음의 숲의 큰 지네. 길이가 12m쯤 된다.', b: [gx - 7, gx + 7, gz - 3, gz + 3] });
  }
  // 냇가의 통나무 걸상과 불 피운 자리(시험 치르던 조가 쉬어 간 자리)
  { const [x, z] = D.side[2], y = terrainH(x - 3, z + 2);
    B.geo(LOG, cyl(0.28, 0.3, 2.6, 10).rotateZ(PI / 2), mat4(x - 3, y + 0.28, z + 3.2)); addCollider(x - 4.3, y, z + 2.9, x - 1.7, y + 0.56, z + 3.5);
    for (let i = 0; i < 7; i++) { const a = i / 7 * 2 * PI; B.geo(STONE, new THREE.SphereGeometry(0.16, 8, 6), mat4(x - 3 + Math.cos(a) * 0.5, y + 0.08, z + 1.6 + Math.sin(a) * 0.5, 0, a, 0, [1, 0.7, 1])); }
    for (let i = 0; i < 4; i++) B.geo(mat('plain', 0x2b2622), cyl(0.05, 0.05, 0.7, 6).rotateZ(PI / 2), mat4(x - 3, y + 0.1 + i * 0.03, z + 1.6, 0, i * 0.8, 0));
  }

  B.finish(scene);
  const ring = []; for (let i = 0; i < 28; i++) { const a = i / 28 * 2 * PI; ring.push([cx + Math.cos(a) * RF, cz + Math.sin(a) * RF]); }
  out.places.push(...places, { n: '죽음의 숲', t: '제44 훈련장. 철망을 두른 숲으로, 큰 나무와 큰 짐승이 산다. 중급닌자 시험의 둘째 관문이 여기서 치러졌다. 문은 마흔넷이고, 평소에는 모두 잠겨 있다.', poly: ring, b: [cx - RF, cx + RF, cz - RF, cz + RF] });
  { const g0 = [cx - u[0] * (RF + 9), cz - u[1] * (RF + 9)]; out.jumps.push(['죽음의 숲 들머리', g0[0], 0, g0[1], Math.atan2(-u[0], -u[1]), 95]); }
  out.glows.push(...glows); out.lights.push(...lights);
  for (const tr of [D.trail, D.side]) for (const p of tr) OPEN.push([p[0], p[1], 4]);
  BARE.push((x, z) => deathTrailDist(x, z) < 1.4 && x < 745);   // 흙을 깐 오솔길(냇가로 가는 샛길은 풀밭 그대로다)
}
