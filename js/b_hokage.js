// 호카게 관저 — 붉은 회벽의 둥근 본채(3층 + 옥상 마당과 탑), 양옆 둥근 별채, 현관 지붕과 돌계단.
// 본채 중심 (0, -104). 정면은 남쪽(+z). 층 사이 계단은 본채 한가운데 계단실(곧은 계단 두 줄)에 있다.
// 건물 몸체(벽·바닥·지붕·계단)는 아래 치수로 지은 뒤 본채 중심에서 S배로 키운다. 가구·난간·등불·실내 팻말은 사람 크기 그대로, 자리만 키운 건물에 맞춰 놓는다.
import * as THREE from '../vendor/three.module.js';
import { Builder, wall, stairs, tube, mergeGeos, mat4, rng, addCollider, colliders, marks, rescale } from './build.js';
import { mat, M, textMat, weatherize } from './materials.js';
import { coneRoof, gableRoof, beamBetween, roundWall, roundWindow, roundRailing, railing, signBoard, lantern, doorUnit, windowUnit } from './arch.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const PI = Math.PI, TAU = PI * 2;
const CX = 0, CZ = -104, RO = 13, RI = 12.6;          // 본채 중심, 바깥·안 반지름
const Y1 = 1, Y2 = 5, Y3 = 9, YR = 13;                // 1·2·3층 바닥, 옥상 바닥
const ZN0 = -105.6, ZN1 = -104.05, ZS0 = -103.95, ZS1 = -102.4;   // 계단실의 북쪽 줄·남쪽 줄
const AX = 20.5, AR = 5.5, ARI = 5.2, AY2 = 4.4, AYT = 7.8;        // 별채 중심 x(±), 반지름, 2층 바닥, 벽 윗선

const S = 1.3;                                          // 건물 몸체를 키우는 배율
const sx = x => CX + (x - CX) * S, sy = y => y * S, sz = z => CZ + (z - CZ) * S;      // 지은 치수의 자리 → 키운 뒤의 자리
const SP = pts => pts.map(([x, z]) => [sx(x), sz(z)]);
const DOOR = 2.3 * S;                                   // 키운 뒤의 문 높이

let RED, TILE, PAPER, CERAMIC, GREEN, PETAL, REDP, CLOTHW, GLOWM, CORK, BOOK, BANDS, G;
let BF, KEEP;                                           // 제 크기로 놓는 것들의 조립기, 키우지 않을 충돌 상자 번호
// fn 안에서 등록한 충돌 상자는 이미 제자리·제 크기다(나중에 키우지 않는다)
const fin = fn => { const n = colliders.length, r = fn(); for (let i = n; i < colliders.length; i++) KEEP.add(i); return r; };

/* ---------- 재질과 되풀이해 쓰는 도형 ---------- */
const bx = (w, h, d, x, y, z, ry = 0, rx = 0, rz = 0) => [new THREE.BoxGeometry(w, h, d), mat4(x, y, z, rx, ry, rz)];
const cy = (rt, rb, h, x, y, z, seg = 12, rx = 0, rz = 0) => [new THREE.CylinderGeometry(rt, rb, h, seg), mat4(x, y, z, rx, 0, rz)];
const lathe = (pts, seg = 16) => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg);

// 잎 한 장: 가운데 잎맥에서 접히고 끝으로 갈수록 처진다(+z로 뻗는다)
function leafGeo(len, wid, droop = 0.4, n = 6) {
  const pos = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, w = wid * 0.5 * Math.sin(PI * Math.pow(t, 0.75)) + (i === 0 ? 0.006 : 0), y = -droop * len * t * t;
    pos.push(-w, y + w * 0.35, len * t, 0, y, len * t, w, y + w * 0.35, len * t);
  }
  for (let i = 0; i < n; i++) { const a = i * 3, b = a + 3; idx.push(a, a + 1, b + 1, a, b + 1, b, a + 1, a + 2, b + 2, a + 1, b + 2, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// 그림을 직접 그려 만드는 재질(초상·지도·문장)
function canvasMat(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return weatherize(new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }));
}

// 역대 호카게 초상: [이름, 머리색, 머리 모양]
const KAGE = [['初代', '#2a1d16', 'long'], ['二代目', '#e4e6ee', 'spiky'], ['三代目', '#8f877a', 'spiky'], ['四代目', '#e9c53c', 'spiky'], ['五代目', '#e8d588', 'tails']];
function drawKage(g, w, h, [name, hair, style], i) {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#cfc3a4'); gr.addColorStop(1, '#a99a78');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const cx = w / 2, hy = h * 0.4;
  g.fillStyle = hair;
  if (style === 'long') { g.beginPath(); g.moveTo(cx - 62, hy - 30); g.quadraticCurveTo(cx, hy - 95, cx + 62, hy - 30); g.lineTo(cx + 72, h * 0.78); g.lineTo(cx - 72, h * 0.78); g.fill(); }
  if (style === 'tails') { for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * 44, hy); g.quadraticCurveTo(cx + s * 92, hy + 60, cx + s * 70, h * 0.8); g.lineTo(cx + s * 48, h * 0.78); g.quadraticCurveTo(cx + s * 62, hy + 50, cx + s * 30, hy + 20); g.fill(); } }
  // 옷(흰 겉옷에 붉은 깃)과 목
  g.fillStyle = '#efe9da'; g.beginPath(); g.moveTo(cx - 98, h * 0.86); g.quadraticCurveTo(cx - 80, h * 0.62, cx - 24, h * 0.6); g.lineTo(cx + 24, h * 0.6); g.quadraticCurveTo(cx + 80, h * 0.62, cx + 98, h * 0.86); g.fill();
  g.fillStyle = '#b3261a'; g.beginPath(); g.moveTo(cx - 30, h * 0.6); g.lineTo(cx, h * 0.76); g.lineTo(cx + 30, h * 0.6); g.lineTo(cx + 18, h * 0.6); g.lineTo(cx, h * 0.7); g.lineTo(cx - 18, h * 0.6); g.fill();
  g.fillStyle = '#e3bd98'; g.fillRect(cx - 16, hy + 40, 32, 34);
  g.beginPath(); g.ellipse(cx, hy, 46, 56, 0, 0, TAU); g.fill();
  // 머리
  g.fillStyle = hair;
  if (style === 'spiky') { for (let k = -5; k <= 5; k++) { const a = -PI / 2 + k * 0.3; g.beginPath(); g.moveTo(cx + Math.cos(a - 0.2) * 44, hy + Math.sin(a - 0.2) * 50); g.lineTo(cx + Math.cos(a) * (78 + (k & 1) * 14), hy + Math.sin(a) * (84 + (k & 1) * 14)); g.lineTo(cx + Math.cos(a + 0.2) * 44, hy + Math.sin(a + 0.2) * 50); g.fill(); } }
  g.beginPath(); g.ellipse(cx, hy - 26, 48, 36, 0, PI, TAU); g.fill();
  if (style !== 'spiky') { g.beginPath(); g.moveTo(cx - 48, hy - 28); g.quadraticCurveTo(cx - 10, hy - 30, cx, hy - 52); g.quadraticCurveTo(cx + 10, hy - 30, cx + 48, hy - 28); g.lineTo(cx + 48, hy - 40); g.lineTo(cx - 48, hy - 40); g.fill(); }
  // 이마 보호대(초대·2대·4대)
  if (i === 0 || i === 1 || i === 3) { g.fillStyle = '#2c3f66'; g.fillRect(cx - 47, hy - 30, 94, 14); g.fillStyle = '#b9bcc2'; g.fillRect(cx - 22, hy - 29, 44, 12); }
  // 눈·입
  g.strokeStyle = '#2a1d16'; g.lineWidth = 3; g.lineCap = 'round';
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * 10, hy + 2); g.lineTo(cx + s * 28, hy); g.stroke(); g.beginPath(); g.moveTo(cx + s * 9, hy - 9); g.lineTo(cx + s * 30, hy - 12); g.stroke(); }
  g.beginPath(); g.moveTo(cx - 10, hy + 32); g.lineTo(cx + 10, hy + 32); g.stroke();
  if (i === 1) { g.strokeStyle = '#b3261a'; g.lineWidth = 4; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * 24, hy + 12); g.lineTo(cx + s * 34, hy + 30); g.stroke(); } g.beginPath(); g.moveTo(cx, hy + 40); g.lineTo(cx, hy + 54); g.stroke(); }
  if (i === 2) { g.fillStyle = hair; g.beginPath(); g.moveTo(cx - 8, hy + 46); g.lineTo(cx, hy + 70); g.lineTo(cx + 8, hy + 46); g.fill(); g.strokeStyle = '#8a6a50'; g.lineWidth = 2; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * 14, hy + 10); g.lineTo(cx + s * 26, hy + 22); g.stroke(); } }
  if (i === 4) { g.fillStyle = '#6a4aa8'; g.beginPath(); g.moveTo(cx, hy - 34); g.lineTo(cx + 5, hy - 27); g.lineTo(cx, hy - 20); g.lineTo(cx - 5, hy - 27); g.fill(); }
  // 이름 띠
  g.fillStyle = '#2a1d16'; g.fillRect(0, h * 0.86, w, h * 0.14);
  g.fillStyle = '#efe6cf'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 ${h * 0.09}px "Yu Mincho", "MS Mincho", serif`;
  g.fillText(name + ' 火影', cx, h * 0.935);
}

// 마을 전도(회의실 벽·탁자)
function drawMap(g, w, h) {
  g.fillStyle = '#e2d4b0'; g.fillRect(0, 0, w, h);
  const R = rng(99), cx = w / 2, cyy = h * 0.54, r = h * 0.4;
  g.fillStyle = '#b9a67c'; g.fillRect(cx - r * 0.9, cyy - r * 1.16, r * 1.8, r * 0.2);          // 호카게 바위
  g.strokeStyle = '#5a4630'; g.lineWidth = 5; g.beginPath(); g.arc(cx, cyy, r, 0, TAU); g.stroke();
  g.lineWidth = 2; g.beginPath(); g.moveTo(cx, cyy - r * 0.8); g.lineTo(cx, cyy + r); g.moveTo(cx - r * 0.8, cyy - r * 0.45); g.lineTo(cx + r * 0.8, cyy - r * 0.45); g.moveTo(cx - r * 0.9, cyy + r * 0.2); g.lineTo(cx + r * 0.9, cyy + r * 0.2); g.stroke();
  for (let i = 0; i < 90; i++) {
    const a = R() * TAU, d = Math.sqrt(R()) * r * 0.9, x = cx + Math.cos(a) * d, y = cyy + Math.sin(a) * d;
    if (Math.abs(x - cx) < 9) continue;
    g.fillStyle = ['#8a4a36', '#4a6a5e', '#7a6a4a'][i % 3]; g.fillRect(x - 5, y - 4, 7 + R() * 7, 6 + R() * 5);
  }
  g.fillStyle = '#b3261a'; g.beginPath(); g.arc(cx, cyy - r * 0.62, 11, 0, TAU); g.fill();
  g.fillStyle = '#2a1d16'; g.textAlign = 'center'; g.font = `900 ${h * 0.075}px "Yu Mincho", "MS Mincho", serif`;
  g.fillText('木ノ葉隠れの里 全図', cx, h * 0.085);
}

// 나뭇잎 마을 문장(소용돌이 잎)
function drawLeaf(g, w) {
  const c = w / 2;
  g.fillStyle = '#efe6cf'; g.beginPath(); g.arc(c, c, c, 0, TAU); g.fill();
  g.strokeStyle = '#2a1d16'; g.lineWidth = w * 0.06; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath();
  for (let i = 0; i <= 60; i++) { const t = i / 60, a = t * TAU * 1.6 + 0.4, r = w * (0.03 + 0.19 * t); const x = c + w * 0.04 + Math.cos(a) * r, y = c + Math.sin(a) * r; i ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.stroke();
  g.beginPath(); g.moveTo(c + w * 0.2, c - w * 0.16); g.lineTo(c - w * 0.3, c - w * 0.2); g.lineTo(c - w * 0.38, c + w * 0.02); g.lineTo(c - w * 0.16, c + w * 0.12); g.stroke();
  g.beginPath(); g.moveTo(c - w * 0.1, c + w * 0.2); g.lineTo(c - w * 0.2, c + w * 0.34); g.stroke();
}

function init() {
  RED = mat('plaster', 0xb5412c); TILE = mat('tile', 0x3e5f58);
  PAPER = mat('plain', 0xeee4c8); CERAMIC = mat('plain', 0x8f5b3e, { rough: 0.5 });
  GREEN = mat('plain', 0x3f7a35, { side: 'double', rough: 0.6 }); PETAL = mat('plain', 0xd9483a, { side: 'double' });
  REDP = mat('plain', 0xa82a20); CLOTHW = mat('plain', 0xf2efe6, { side: 'double' });
  GLOWM = mat('glow', 0xffd9a0, { power: 1.2 }); CORK = mat('plain', 0xa9845a, { rough: 0.95 });
  BOOK = [mat('plain', 0x7a2e2a), mat('plain', 0x2f4f6a), mat('plain', 0x3f5f3a), mat('plain', 0x9a7a3a)];
  BANDS = [REDP, BOOK[1], BOOK[2]];
  G = {};
  // 의자(앉는 쪽이 +z)
  G.chair = mergeGeos([
    bx(0.44, 0.05, 0.44, 0, 0.45, 0),
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => bx(0.05, 0.45, 0.05, a * 0.19, 0.225, b * 0.19)),
    bx(0.05, 0.55, 0.05, -0.19, 0.72, -0.19), bx(0.05, 0.55, 0.05, 0.19, 0.72, -0.19), bx(0.44, 0.08, 0.04, 0, 0.96, -0.19),
    ...[-0.1, 0, 0.1].map(x => bx(0.045, 0.42, 0.02, x, 0.7, -0.19)),
    bx(0.03, 0.03, 0.36, -0.19, 0.18, 0), bx(0.03, 0.03, 0.36, 0.19, 0.18, 0), bx(0.36, 0.03, 0.03, 0, 0.28, 0.19),
  ]);
  // 호카게 의자: 높은 등받이, 팔걸이, 붉은 방석
  G.kageChair = mergeGeos([
    bx(0.66, 0.06, 0.6, 0, 0.44, 0), ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => bx(0.07, 0.44, 0.07, a * 0.29, 0.22, b * 0.26)),
    bx(0.07, 1.0, 0.07, -0.29, 0.97, -0.27), bx(0.07, 1.0, 0.07, 0.29, 0.97, -0.27), bx(0.72, 0.1, 0.08, 0, 1.5, -0.27),
    bx(0.52, 0.86, 0.03, 0, 1.0, -0.28),
    ...[-1, 1].flatMap(s => [bx(0.06, 0.05, 0.56, s * 0.31, 0.72, 0.0), bx(0.05, 0.26, 0.05, s * 0.31, 0.58, 0.24)]),
  ]);
  G.kageCushion = mergeGeos([bx(0.56, 0.08, 0.5, 0, 0.51, 0.02), bx(0.46, 0.7, 0.05, 0, 1.02, -0.25)]);
  // 두루마리(누운 것: x축으로 길다) — 종이 몸통 / 띠와 축 마구리
  G.scroll = mergeGeos([cy(0.036, 0.036, 0.3, 0, 0, 0, 10, 0, PI / 2)]);
  G.scrollBand = mergeGeos([cy(0.038, 0.038, 0.05, 0, 0, 0, 10, 0, PI / 2), cy(0.012, 0.012, 0.38, 0, 0, 0, 6, 0, PI / 2), cy(0.02, 0.02, 0.02, 0.19, 0, 0, 8, 0, PI / 2), cy(0.02, 0.02, 0.02, -0.19, 0, 0, 8, 0, PI / 2)]);
  // 서가에 꽂힌 두루마리(z축으로 길다 — 앞에서 마구리가 보인다)
  { const c = new THREE.CircleGeometry(0.05, 6); G.scrollEnd = mergeGeos([[new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6, 1, true), mat4(0, 0, 0, PI / 2)], [c, mat4(0, 0, 0.15)]]); }
  { const c = new THREE.CircleGeometry(0.018, 5); G.scrollKnob = mergeGeos([[new THREE.CylinderGeometry(0.018, 0.018, 0.04, 3, 1, true), mat4(0, 0, 0.17, PI / 2)], [c, mat4(0, 0, 0.19)]]); }
  G.unit = new THREE.BoxGeometry(1, 1, 1);
  G.sheet = new THREE.PlaneGeometry(1, 1);
  // 화분 두 가지: 넓은 잎이 포기째 솟는 것 / 줄기 끝에 긴 잎이 늘어지는 큰 것
  const pot = lathe([[0, 0], [0.15, 0], [0.21, 0.32], [0.235, 0.33], [0.235, 0.37], [0.19, 0.37], [0.19, 0.33], [0, 0.33]], 18);
  const soil = new THREE.CircleGeometry(0.19, 14); soil.rotateX(-PI / 2);
  const R = rng(41), la = [], lb = [];
  for (let i = 0; i < 17; i++) { const len = 0.42 + R() * 0.3; la.push([leafGeo(len, 0.13 + R() * 0.06, 0.35 + R() * 0.3), mat4((R() - 0.5) * 0.1, 0.33, (R() - 0.5) * 0.1, -(0.5 + R() * 0.9), i * 2.4, 0)]); }
  G.plantA = [[CERAMIC, pot], [M.beam, mergeGeos([[soil, mat4(0, 0.335, 0)]])], [GREEN, mergeGeos(la)]];
  const trunkPts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; trunkPts.push(V3(Math.sin(t * 2.2) * 0.06, 0.33 + t * 1.05, Math.cos(t * 1.7) * 0.04 - 0.04)); }
  const top = trunkPts[8];
  for (let i = 0; i < 24; i++) { const len = 0.5 + R() * 0.35, up = 0.9 - (i / 24) * 1.3; lb.push([leafGeo(len, 0.07 + R() * 0.03, 0.7 + R() * 0.5, 7), mat4(top.x, top.y - (i % 6) * 0.03, top.z, -up, i * 2.4, 0)]); }
  G.plantB = [[CERAMIC, pot], [M.beam, mergeGeos([[soil, mat4(0, 0.335, 0)], tube(trunkPts, t => 0.045 - 0.02 * t, 8)])], [GREEN, mergeGeos(lb)]];
  // 꽃병: 줄기 셋에 꽃잎 여섯 장짜리 붉은 꽃
  const stems = [], petals = [], hearts = [];
  for (let k = 0; k < 3; k++) {
    const a = k * 2.1, tip = V3(Math.cos(a) * 0.09, 0.42 + k * 0.05, Math.sin(a) * 0.09);
    stems.push(tube([V3(0, 0.14, 0), V3(tip.x * 0.4, 0.3, tip.z * 0.4), tip], 0.006, 5));
    stems.push([leafGeo(0.13, 0.05, 0.5, 4), mat4(tip.x * 0.4, 0.28, tip.z * 0.4, -0.5, a + 1.2, 0)]);
    for (let p = 0; p < 6; p++) petals.push([leafGeo(0.065, 0.05, 0.6, 4), mat4(tip.x, tip.y, tip.z, -0.75, p * TAU / 6 + k, 0)]);
    hearts.push([new THREE.SphereGeometry(0.014, 8, 6), mat4(tip.x, tip.y + 0.012, tip.z)]);
  }
  G.vase = [[CERAMIC, lathe([[0, 0], [0.05, 0], [0.075, 0.07], [0.06, 0.15], [0.03, 0.19], [0.04, 0.22], [0.03, 0.22], [0.022, 0.19], [0, 0.19]], 14)], [GREEN, mergeGeos(stems)], [PETAL, mergeGeos(petals)], [BOOK[3], mergeGeos(hearts)]];
  // 찻주전자와 찻잔
  const handle = new THREE.TorusGeometry(0.085, 0.009, 6, 14, PI);
  G.teapot = mergeGeos([lathe([[0, 0], [0.07, 0], [0.11, 0.05], [0.115, 0.1], [0.085, 0.15], [0.045, 0.165], [0.045, 0.178], [0.016, 0.2], [0, 0.2]], 16),
    tube([V3(0.1, 0.07, 0), V3(0.16, 0.1, 0), V3(0.2, 0.16, 0)], t => 0.02 - 0.008 * t, 7), [handle, mat4(0, 0.16, 0)]]);
  G.cup = lathe([[0, 0], [0.028, 0], [0.04, 0.062], [0.035, 0.062], [0.025, 0.01], [0, 0.01]], 12);
  // 나무통: 배가 부른 통널에 쇠테 셋
  G.barrel = [[M.beamLight, lathe([[0, 0], [0.27, 0], [0.31, 0.18], [0.33, 0.42], [0.31, 0.66], [0.27, 0.84], [0.25, 0.84], [0.25, 0.8], [0, 0.8]], 18)],
    [M.iron, mergeGeos([0.12, 0.42, 0.72].map((y, i) => { const t = new THREE.TorusGeometry(i === 1 ? 0.332 : 0.303, 0.012, 5, 18); t.rotateX(PI / 2); return [t, mat4(0, y, 0)]; }))]];
  // 돌등롱: 받침·기둥·화사석(불집)·지붕·보주
  G.toro = [[M.stone, mergeGeos([cy(0.34, 0.42, 0.2, 0, 0.1, 0, 6), cy(0.11, 0.15, 0.8, 0, 0.6, 0, 8), cy(0.37, 0.2, 0.15, 0, 1.07, 0, 6),
    ...[0, 1, 2, 3, 4, 5].map(i => bx(0.06, 0.34, 0.06, Math.cos(i * TAU / 6) * 0.24, 1.32, Math.sin(i * TAU / 6) * 0.24, -i * TAU / 6)),
    cy(0.3, 0.3, 0.05, 0, 1.51, 0, 6), cy(0.07, 0.55, 0.3, 0, 1.69, 0, 6), [lathe([[0, 0], [0.09, 0.02], [0.05, 0.08], [0.09, 0.15], [0.05, 0.24], [0, 0.28]], 10), mat4(0, 1.82, 0)]])],
  [GLOWM, mergeGeos([cy(0.2, 0.2, 0.32, 0, 1.32, 0, 6)])]];
  // 호카게 삿갓: 흰 삿갓에 붉은 앞판과 火, 뒤·옆으로 드리운 흰 천
  const hat = lathe([[0, 0.2], [0.04, 0.185], [0.3, 0.035], [0.31, 0.02], [0.3, 0.02], [0.04, 0.16], [0, 0.17]], 24);
  const veil = new THREE.CylinderGeometry(0.29, 0.3, 0.17, 20, 2, true, 0.75, TAU - 1.5);
  const panel = new THREE.CylinderGeometry(0.045, 0.306, 0.152, 6, 1, true, -0.42, 0.84);
  G.hat = [[CLOTHW, mergeGeos([hat, [veil, mat4(0, -0.06, 0)]])], [REDP, mergeGeos([[panel, mat4(0, 0.113, 0)]])],
    [textMat('火', { w: 128, h: 128, color: '#f4efe2' }), mergeGeos([[new THREE.PlaneGeometry(0.11, 0.11), mat4(0, 0.1, 0.195, -1.05, 0, 0)]])]];
  // 사방등(바닥에 두는 종이 등)
  G.andon = [[M.beam, mergeGeos([...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => bx(0.025, 0.5, 0.025, a * 0.12, 0.25, b * 0.12)), bx(0.3, 0.03, 0.3, 0, 0.015, 0), bx(0.28, 0.025, 0.28, 0, 0.49, 0)])], [GLOWM, mergeGeos([bx(0.22, 0.36, 0.22, 0, 0.28, 0)])]];
}

/* ---------- 놓는 도구 ---------- */
// 자리(ox,oy,oz)와 방향(ry: 90° 단위)을 가진 틀. 틀 안 좌표로 상자·도형을 놓는다(+z가 "앞").
// 틀의 자리는 지은 치수로 적는다(키운 건물의 그 자리로 옮겨진다). 틀 안의 것은 제 크기 그대로다.
function frame(B, ox, oy, oz, ry = 0) { return frameW(sx(ox), sy(oy), sz(oz), ry); }
function frameW(ox, oy, oz, ry) {
  const c = Math.round(Math.cos(ry)), s = Math.round(Math.sin(ry));
  const W = (lx, lz) => [ox + lx * c + lz * s, oz - lx * s + lz * c];
  return {
    W, ry, oy,
    box(m, x0, y0, z0, x1, y1, z1, col = false) { const a = W(x0, z0), b = W(x1, z1); fin(() => BF.box(m, a[0], oy + y0, a[1], b[0], oy + y1, b[1], col)); },
    put(m, g, x, y, z, r = 0, sc = 1, rx = 0, rz = 0) { const a = W(x, z); BF.put(m, g, a[0], oy + y, a[1], ry + r, sc, rx, rz); },
    parts(list, x, y, z, r = 0, sc = 1) { for (const [m, g] of list) this.put(m, g, x, y, z, r, sc); },
    solid(x0, y0, z0, x1, y1, z1) { const a = W(x0, z0), b = W(x1, z1); fin(() => addCollider(a[0], oy + y0, a[1], b[0], oy + y1, b[1])); },
    sub(lx, ly, lz, r = 0) { const a = W(lx, lz); return frameW(a[0], oy + ly, a[1], ry + r); },      // 이 틀 안의 한 자리에 놓는 딸린 틀
  };
}

function disc(B, m, x, y, z, r0, r1, up, seg = 48) {
  const g = r0 > 0 ? new THREE.RingGeometry(r0, r1, seg) : new THREE.CircleGeometry(r1, seg);
  g.rotateX(up ? -PI / 2 : PI / 2);
  B.geo(m, g, mat4(x, y, z), [r1 * 2, r1 * 2]);
}

// 둥근 바닥판. 띠 상자를 원 안쪽에 맞춰 잘라 벽 밖으로 삐져나오지 않는다(r은 벽 두께 안에 둔다).
function slab(B, m, cx, cz, r, y0, y1, holes = []) {
  const step = 0.25, n = Math.ceil(r / step);
  for (let i = -n; i < n; i++) {
    const xa = cx + i * step, xb = xa + step, xM = Math.max(Math.abs(xa - cx), Math.abs(xb - cx));
    if (xM >= r) continue;
    const half = Math.sqrt(r * r - xM * xM);
    let segs = [[cz - half, cz + half]];
    for (const h of holes) {
      if (h[2] <= xa + 1e-6 || h[0] >= xb - 1e-6) continue;
      const next = [];
      for (const [a, b] of segs) { if (h[3] <= a || h[1] >= b) { next.push([a, b]); continue; } if (h[1] > a) next.push([a, h[1]]); if (h[3] < b) next.push([h[3], b]); }
      segs = next;
    }
    for (const [a, b] of segs) if (b - a > 0.02) B.box(m, xa, y0, a, xb, y1, b);
  }
}

// 창 자리: 한 바퀴를 n칸으로 나누고 칸 가운데에 half 각도 폭의 창
const slots = (n, half, skip = []) => { const o = []; for (let i = 0; i < n; i++) if (!skip.includes(i)) o.push([i * TAU / n - half, i * TAU / n + half]); return o; };

// 창이 띠처럼 둘린 둥근 벽 한 층
function ringWall(B, cx, cz, rIn, rOut, y0, y1, wins, wy0, wy1, extra = [], nx = 3) {
  roundWall(B, RED, cx, cz, rIn, rOut, y0, y1, [...wins.map(([a0, a1]) => ({ a0, a1, ys: [[wy0, wy1]] })), ...extra], { matIn: M.white, seg: 96 });
  for (const [a0, a1] of wins) roundWindow(B, cx, cz, rIn, rOut, a0, a1, wy0, wy1, { nx, ny: 2 });
  roundWall(B, M.beam, cx, cz, rOut, rOut + 0.06, wy1 + 0.1, wy1 + 0.26, [], { collide: false });      // 창 위 띠장
}
// 둥근 벽의 문틀
function roundDoorFrame(B, cx, cz, rIn, rOut, a, half, y0, y1) {
  const o = { collide: false }, t = 0.09 / rIn, lap = 0.02 / rIn;   // 틀은 구멍 안쪽으로 조금 들어온다(구멍 옆면·윗면과 한 평면이면 깜빡인다)
  roundWall(B, M.beam, cx, cz, rIn - 0.03, rOut + 0.04, y0, y1 + 0.1, [], { ...o, a0: a - half - t, a1: a - half + lap });
  roundWall(B, M.beam, cx, cz, rIn - 0.03, rOut + 0.04, y0, y1 + 0.1, [], { ...o, a0: a + half - lap, a1: a + half + t });
  roundWall(B, M.beam, cx, cz, rIn - 0.03, rOut + 0.04, y1 - 0.02, y1 + 0.1, [], { ...o, a0: a - half, a1: a + half });
}
// 벽을 따라 도는 기와 처마(벽에서 바깥으로 흘러내리는 고리 지붕)
function skirt(B, cx, cz, rWall, rOut, yTop, drop, seg) {
  coneRoof(B, TILE, cx, cz, rOut, yTop - drop, drop, { rTop: rWall, seg, cap: false, soffit: false, detail: 2 });
  disc(B, M.beam, cx, yTop - drop - 0.04, cz, rWall, rOut - 0.03, false, seg);
  roundWall(B, M.beam, cx, cz, rWall, rWall + 0.1, yTop - 0.02, yTop + 0.12, [], { collide: false });
  for (let i = 0; i < seg; i++) {   // 서까래
    const a = (i + 0.5) / seg * TAU, c = Math.cos(a), s = Math.sin(a);
    beamBetween(B, M.beam, V3(cx + c * rWall, yTop - drop - 0.1, cz + s * rWall), V3(cx + c * (rOut - 0.06), yTop - drop - 0.1, cz + s * (rOut - 0.06)), 0.07, 0.1);
  }
}
// 원뿔 지붕 + 처마 밑 널·서까래 + 실내 천장
function capRoof(B, cx, cz, rWall, rIn, yWall, over, rise, detail) {
  const r = rWall + over, yE = yWall - 0.4;
  coneRoof(B, TILE, cx, cz, r, yE, rise, { seg: 32, detail, soffit: false });
  disc(B, M.beam, cx, yE - 0.03, cz, rWall, r - 0.03, false, 32);
  for (let i = 0; i < 32; i++) { const a = (i + 0.5) / 32 * TAU, c = Math.cos(a), s = Math.sin(a); beamBetween(B, M.beam, V3(cx + c * rWall, yE - 0.09, cz + s * rWall), V3(cx + c * (r - 0.06), yE - 0.09, cz + s * (r - 0.06)), 0.07, 0.1); }
  disc(B, M.beamLight, cx, yWall - 0.2, cz, 0, rIn + 0.05, false, 40);                                  // 천장 널
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; beamBetween(B, M.beam, V3(cx, yWall - 0.28, cz), V3(cx + Math.cos(a) * rIn, yWall - 0.28, cz + Math.sin(a) * rIn), 0.1, 0.14); }
}
// 매끈한 고리 마루(바깥 난간 복도) — 보이는 면은 둥글게, 충돌은 띠 상자로
function ringDeck(B, m, cx, cz, r0, r1, y0, y1) {
  disc(B, m, cx, y1, cz, r0, r1, true, 96); disc(B, m, cx, y0, cz, r0, r1, false, 96);
  B.geo(M.beam, new THREE.CylinderGeometry(r1, r1, y1 - y0, 96, 1, true), mat4(cx, (y0 + y1) / 2, cz), [TAU * r1, y1 - y0]);
  const step = 0.5, n = Math.ceil(r1 / step);
  for (let i = -n; i < n; i++) {
    const xa = i * step, xb = xa + step, xm = Math.min(Math.abs(xa), Math.abs(xb)), xM = Math.max(Math.abs(xa), Math.abs(xb));
    if (xm >= r1) continue;
    const half = Math.sqrt(r1 * r1 - xm * xm);
    if (xM < r0) { const hi = Math.sqrt(r0 * r0 - xM * xM); addCollider(cx + xa, y0, cz - half, cx + xb, y1, cz - hi); addCollider(cx + xa, y0, cz + hi, cx + xb, y1, cz + half); }
    else addCollider(cx + xa, y0, cz - half, cx + xb, y1, cz + half);
  }
}
// 계단 옆 비스듬한 난간(x 방향 계단)
function stairRail(B, x0, ya, x1, yb, z, h = 0.95) {
  beamBetween(B, M.beam, V3(x0, ya + h, z), V3(x1, yb + h, z), 0.07, 0.07);
  beamBetween(B, M.beam, V3(x0, ya + h * 0.5, z), V3(x1, yb + h * 0.5, z), 0.04, 0.04);
  const n = Math.round(Math.abs(x1 - x0) / 0.3);
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = x0 + (x1 - x0) * t, y = ya + (yb - ya) * t, s = i % 4 === 0 ? 0.04 : 0.014;
    B.box(M.beam, x - s, y - 0.2, z - s, x + s, y + h, z + s, false);
    if (i < n) { const y2 = ya + (yb - ya) * (i + 1) / n; addCollider(x, Math.min(y, y2) - 0.2, z - 0.05, x0 + (x1 - x0) * (i + 1) / n, Math.max(y, y2) + h, z + 0.05); }
  }
}

/* ---------- 가구 ---------- */
// 서가. kind: 'books' 책 | 'scrolls' 두루마리 칸 | 'mix' 한 줄씩 번갈아. 등은 z=0, 앞은 +z.
function rack(F, w, h, kind, R) {
  const d = 0.42, t = 0.04, rows = Math.max(2, Math.round((h - 0.12) / 0.44)), rh = (h - 0.12) / rows;
  F.box(M.beam, -w / 2, 0, 0, -w / 2 + t, h, d); F.box(M.beam, w / 2 - t, 0, 0, w / 2, h, d);
  F.box(M.beam, -w / 2, 0, 0, w / 2, h, 0.025);
  F.box(M.beam, -w / 2 - 0.04, h, 0, w / 2 + 0.04, h + 0.06, d + 0.04);
  F.box(M.beam, -w / 2 + t, 0, 0.04, w / 2 - t, 0.08, d - 0.03);
  for (let r = 0; r < rows; r++) {
    const y = 0.12 + r * rh;
    F.box(M.beam, -w / 2 + t, y - t, 0.025, w / 2 - t, y, d);
    if (kind === 'scrolls' || (kind === 'mix' && r % 2 === 0)) {
      const nc = Math.max(1, Math.round(w / 0.55)), cw = (w - 2 * t) / nc;
      for (let c = 0; c < nc; c++) {
        const x0 = -w / 2 + t + c * cw;
        if (c) F.box(M.beam, x0 - 0.012, y, 0.025, x0 + 0.012, y + rh - t, d);
        let n = R() < 0.15 ? 0 : Math.floor((cw - 0.03) / 0.104) - (R() * 2 | 0);
        for (let layer = 0; layer < 2 && n > 0; layer++, n -= 1 + (R() * 3 | 0)) for (let i = 0; i < n; i++) {
          const sx = x0 + 0.068 + (i + layer * 0.5) * 0.104, sy = y + 0.051 + layer * 0.09, sz = 0.2 + R() * 0.04;
          F.put(PAPER, G.scrollEnd, sx, sy, sz); F.put(BANDS[R() * 3 | 0], G.scrollKnob, sx, sy, sz);
        }
      }
    } else {
      let x = -w / 2 + t + 0.02;
      while (x < w / 2 - t - 0.1) {
        if (R() < 0.07) { x += 0.08 + R() * 0.1; continue; }
        const bw = 0.035 + R() * 0.055, bh = rh * (0.55 + R() * 0.3);
        F.box(BOOK[R() * 4 | 0], x, y, 0.07 + R() * 0.04, x + bw, y + bh, d - 0.04 - R() * 0.05);
        x += bw + 0.004;
      }
    }
  }
  F.solid(-w / 2, 0, 0, w / 2, h, d);
}
// 두루마리 더미(틀 안 x축으로 누워 삼각으로 쌓인다)
function scrollPile(F, x, y, z, n, R) {
  for (let layer = 0, k = n; k > 0; layer++, k--) for (let i = 0; i < k; i++) {
    const lz = (i - (k - 1) / 2) * 0.078, j = (R() - 0.5) * 0.12, lx = x + (R() - 0.5) * 0.06, ly = y + 0.037 + layer * 0.066;
    F.put(PAPER, G.scroll, lx, ly, z + lz, j); F.put(BANDS[R() * 3 | 0], G.scrollBand, lx, ly, z + lz, j);
  }
}
// 서류 더미: 조금씩 어긋난 종이 뭉치를 쌓는다
function paperStack(F, x, y, z, h, R) {
  for (let yy = 0; yy < h - 1e-3;) {
    const hh = Math.min(h - yy, 0.025 + R() * 0.05);
    F.put(PAPER, G.unit, x + (R() - 0.5) * 0.02, y + yy + hh / 2, z + (R() - 0.5) * 0.02, (R() - 0.5) * 0.25, [0.21, hh - 0.004, 0.3]);
    yy += hh;
  }
}
// 서랍 달린 책상. 앉는 쪽이 -z.
function desk(F, w, d, h = 0.76) {
  const t = 0.05;
  F.box(M.beam, -w / 2, h - t, -d / 2, w / 2, h, d / 2);
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? -w / 2 + 0.06 : w / 2 - 0.56;
    F.box(M.beamLight, x0, 0.05, -d / 2 + 0.05, x0 + 0.5, h - t, d / 2 - 0.05);
    F.box(M.beam, x0 + 0.03, 0, -d / 2 + 0.08, x0 + 0.47, 0.05, d / 2 - 0.08);
    for (let k = 0; k < 3; k++) {
      const y = 0.09 + k * 0.205;
      F.box(M.beam, x0 + 0.03, y, -d / 2 + 0.03, x0 + 0.47, y + 0.18, -d / 2 + 0.05);
      F.box(M.iron, x0 + 0.2, y + 0.08, -d / 2 + 0.005, x0 + 0.3, y + 0.1, -d / 2 + 0.03);
    }
  }
  F.box(M.beamLight, -w / 2 + 0.56, 0.22, d / 2 - 0.09, w / 2 - 0.56, h - t, d / 2 - 0.06);
  for (let x = -w / 2 + 0.56; x <= w / 2 - 0.55; x += (w - 1.12) / 4) F.box(M.beam, x - 0.03, 0.22, d / 2 - 0.06, x + 0.03, h - t, d / 2 - 0.04);
  F.solid(-w / 2, 0, -d / 2, w / 2, h, d / 2);
}
function table(F, w, d, h, m = M.beam) {
  F.box(m, -w / 2, h - 0.05, -d / 2, w / 2, h, d / 2);
  F.box(m, -w / 2 + 0.08, h - 0.13, -d / 2 + 0.08, w / 2 - 0.08, h - 0.05, d / 2 - 0.08);
  for (const a of [-1, 1]) for (const b of [-1, 1]) F.box(m, a * (w / 2 - 0.1) - 0.04, 0, b * (d / 2 - 0.1) - 0.04, a * (w / 2 - 0.1) + 0.04, h - 0.05, b * (d / 2 - 0.1) + 0.04);
  F.solid(-w / 2, 0, -d / 2, w / 2, h, d / 2);
}
// 긴 걸상(등받이는 -z 쪽)
function bench(F, w, back = true) {
  for (let k = 0; k < 3; k++) F.box(M.beamLight, -w / 2, 0.4, -0.2 + k * 0.14, w / 2, 0.44, -0.08 + k * 0.14);
  for (const s of [-1, 1]) {
    const x = s * (w / 2 - 0.15);
    F.box(M.beam, x - 0.04, 0, -0.18, x + 0.04, 0.4, -0.1); F.box(M.beam, x - 0.04, 0, 0.1, x + 0.04, 0.4, 0.18); F.box(M.beam, x - 0.03, 0.32, -0.18, x + 0.03, 0.4, 0.18);
    if (back) F.box(M.beam, x - 0.03, 0.44, -0.2, x + 0.03, 0.9, -0.15);
  }
  F.box(M.beam, -w / 2 + 0.15, 0.14, -0.02, w / 2 - 0.15, 0.19, 0.02);
  if (back) for (const y of [0.62, 0.8]) F.box(M.beamLight, -w / 2, y, -0.22, w / 2, y + 0.1, -0.2);
  F.solid(-w / 2, 0, -0.22, w / 2, back ? 0.9 : 0.44, 0.2);
}
// 방석 깐 긴 의자(등받이는 -z 쪽)
function sofa(F, w, cm) {
  F.box(M.beam, -w / 2, 0.08, -0.4, w / 2, 0.3, 0.4); for (const a of [-1, 1]) for (const b of [-1, 1]) F.box(M.beam, a * (w / 2 - 0.1) - 0.04, 0, b * 0.32 - 0.04, a * (w / 2 - 0.1) + 0.04, 0.08, b * 0.32 + 0.04);
  F.box(M.beam, -w / 2, 0.3, -0.42, w / 2, 0.88, -0.3); for (const s of [-1, 1]) F.box(M.beam, s * w / 2 - (s > 0 ? 0.12 : 0), 0.3, -0.4, s * w / 2 + (s < 0 ? 0.12 : 0), 0.62, 0.4);
  const n = Math.max(1, Math.round((w - 0.24) / 0.75)), cw = (w - 0.24) / n;
  for (let i = 0; i < n; i++) { const x = -w / 2 + 0.12 + cw * (i + 0.5); F.put(cm, new THREE.SphereGeometry(1, 12, 8), x, 0.36, 0.06, 0, [cw / 2 - 0.02, 0.09, 0.32]); F.put(cm, new THREE.SphereGeometry(1, 12, 8), x, 0.62, -0.26, 0, [cw / 2 - 0.02, 0.24, 0.07], -0.15); }
  F.solid(-w / 2, 0, -0.42, w / 2, 0.88, 0.4);
}
// 세워 둔 깃발: 장대에 세로로 드리운 천(글자 한 자)
function flagAt(F, x, z, text, bg) {
  F.box(M.beam, x - 0.2, 0, z - 0.2, x + 0.2, 0.06, z + 0.2); F.put(M.beam, new THREE.CylinderGeometry(0.025, 0.03, 2.7, 8), x, 1.35, z); F.put(mat('metal', 0xc9a04a, { rough: 0.4 }), new THREE.SphereGeometry(0.05, 10, 8), x, 2.72, z);
  F.put(M.beam, new THREE.CylinderGeometry(0.012, 0.012, 0.6, 6).rotateZ(PI / 2), x, 2.55, z + 0.03);
  F.put(textMat(text, { w: 128, h: 384, bg, color: '#f4efe2', pad: 0.2 }, 'cloth'), new THREE.PlaneGeometry(0.56, 1.6, 2, 6), x, 1.74, z + 0.04);
  F.solid(x - 0.1, 0, z - 0.1, x + 0.1, 2.7, z + 0.1);
}
// 쇠창살 한 줄(틀 안 좌표, z = c에서 x0~x1 또는 x = c에서 z0~z1)
function cageBars(F, ax, c, u0, u1, h) {
  const n = Math.round((u1 - u0) / 0.14);
  for (let i = 0; i <= n; i++) { const u = u0 + (u1 - u0) * i / n; if (ax === 'x') F.box(M.iron, u - 0.014, 0, c - 0.014, u + 0.014, h, c + 0.014); else F.box(M.iron, c - 0.014, 0, u - 0.014, c + 0.014, h, u + 0.014); }
  for (const y of [0.04, h / 2, h - 0.04]) { if (ax === 'x') F.box(M.iron, u0, y - 0.025, c - 0.025, u1, y + 0.025, c + 0.025); else F.box(M.iron, c - 0.025, y - 0.025, u0, c + 0.025, y + 0.025, u1); }
}
function chairAt(F, x, z, r, m = M.beamLight) { F.put(m, G.chair, x, 0, z, r); const a = F.W(x, z); fin(() => addCollider(a[0] - 0.2, F.oy, a[1] - 0.2, a[0] + 0.2, F.oy + 0.9, a[1] + 0.2)); }
function plantAt(B, kind, x, y, z, r = 0, s = 1) { x = sx(x); y = sy(y); z = sz(z); for (const [m, g] of G[kind]) BF.put(m, g, x, y, z, r, s); fin(() => addCollider(x - 0.2 * s, y, z - 0.2 * s, x + 0.2 * s, y + 0.9, z + 0.2 * s)); }
// 나무 궤짝: 널판 몸통에 모서리 각목과 띠
function crate(F, x, y, z, s) {
  const a = x - s / 2, b = x + s / 2, c = z - s / 2, d = z + s / 2, t = 0.05;
  F.box(M.beamLight, a + 0.02, y, c + 0.02, b - 0.02, y + s - 0.01, d - 0.02);
  for (const [px, pz] of [[a, c], [b - t, c], [a, d - t], [b - t, d - t]]) F.box(M.beam, px, y, pz, px + t, y + s, pz + t);
  for (const yy of [y, y + s - t]) { F.box(M.beam, a, yy, c, b, yy + t, c + 0.03); F.box(M.beam, a, yy, d - 0.03, b, yy + t, d); F.box(M.beam, a, yy, c, a + 0.03, yy + t, d); F.box(M.beam, b - 0.03, yy, c, b, yy + t, d); }
  F.solid(a, y, c, b, y + s, d);
}
// 찻상 차림: 쟁반에 주전자와 잔
function teaSet(F, x, y, z, cups) {
  F.box(M.beam, x - 0.24, y, z - 0.16, x + 0.24, y + 0.015, z + 0.16);
  F.put(CERAMIC, G.teapot, x - 0.08, y + 0.015, z, 0.5);
  for (let i = 0; i < cups; i++) F.put(PAPER, G.cup, x + 0.1 + (i % 2) * 0.09, y + 0.015, z - 0.08 + (i >> 1) * 0.1 + (i % 2) * 0.03);
}
// 이부자리: 요, 주름진 이불, 접어 넘긴 깃, 베개
function futon(F, x, y, z, R) {
  F.box(PAPER, x - 0.5, y, z - 1.0, x + 0.5, y + 0.09, z + 1.0);
  const q = new THREE.PlaneGeometry(1.16, 1.45, 14, 16); q.rotateX(-PI / 2);
  const p = q.attributes.position, ph = R() * 6;
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i), pz = p.getZ(i), edge = Math.max(0, Math.abs(px) - 0.46);
    p.setY(i, 0.075 + 0.022 * Math.sin(px * 9 + ph) * Math.cos(pz * 6 + ph * 2) + 0.016 * Math.sin(pz * 13 + px * 4) - edge * 0.55);
  }
  q.computeVertexNormals();
  F.put(BOOK[1], q, x, y + 0.09, z + 0.26);
  F.box(PAPER, x - 0.56, y + 0.15, z - 0.5, x + 0.56, y + 0.19, z - 0.28);
  F.put(PAPER, new THREE.SphereGeometry(1, 14, 10), x, y + 0.15, z - 0.75, 0, [0.24, 0.07, 0.14]);
}
function lamp(B, glows, x, yCeil, z) { x = sx(x); z = sz(z); const y = sy(yCeil) - 0.5; fin(() => lantern(BF, x, y, z, { r: 0.28, h: 0.5, color: 0xf3dfae })); glows.push([x, y, z, 1.6]); }

/* ---------- 본채: 벽·바닥·처마 ---------- */
function shell(B) {
  const ent = { a0: PI / 2 - 0.119, a1: PI / 2 + 0.119, ys: [[Y1, 3.4]] };
  const pe = { a0: -0.0795, a1: 0.0795, ys: [[Y1, 3.3]] }, pw = { a0: PI - 0.0795, a1: PI + 0.0795, ys: [[Y1, 3.3]] };
  const bal = { a0: 1.5 * PI - 0.056, a1: 1.5 * PI + 0.056, ys: [[Y3, 11.2]] };
  ringWall(B, CX, CZ, RI, RO, 0, Y2, slots(24, 0.095, [0, 6, 12]), 2.0, 3.7, [ent, pe, pw]);
  ringWall(B, CX, CZ, RI, RO, Y2, Y3, slots(24, 0.095), 6.0, 7.8);
  ringWall(B, CX, CZ, RI, RO, Y3, YR, slots(24, 0.1, [6, 18]), 9.9, 12.0, [bal]);
  roundDoorFrame(B, CX, CZ, RI, RO, 1.5 * PI, 0.056, Y3, 11.2);
  for (const a of [0, PI]) roundDoorFrame(B, CX, CZ, RI, RO, a, 0.0795, Y1, 3.3);
  for (let i = 0; i < 24; i++) { const a = (i + 0.5) * TAU / 24; roundWall(B, M.beam, CX, CZ, RO, RO + 0.07, 1.1, 12.2, [], { a0: a - 0.012, a1: a + 0.012, collide: false }); }   // 창 사이 기둥
  roundWall(B, M.stone, CX, CZ, RO, RO + 0.3, 0, 1.1, [], { collide: false });                          // 돌 기단
  roundWall(B, M.beam, CX, CZ, RO - 0.02, RO + 0.16, YR - 0.1, YR + 0.1, [], { collide: false });      // 옥상 테두리
  // 바닥: 1층 기단, 2·3층, 옥상(계단 구멍은 머리 공간만큼 길게)
  slab(B, M.floor, CX, CZ, 12.95, 0, Y1);
  slab(B, M.floor, CX, CZ, 12.95, Y2 - 0.2, Y2, [[-3, ZN0, 2, ZN1]]);
  slab(B, M.floor, CX, CZ, 12.95, Y3 - 0.2, Y3, [[-2, ZS0, 3, ZS1]]);
  slab(B, M.floor, CX, CZ, 12.95, YR - 0.3, YR - 0.15, [[-3, ZN0, 2, ZN1]]);
  slab(B, M.pave, CX, CZ, 12.95, YR - 0.15, YR, [[-3, ZN0, 2, ZN1]]);
  // 층마다 천장 보(방사형)와 벽 아래 허리 널
  for (const [yf, yc, ops] of [[Y1, Y2 - 0.2, [ent, pe, pw]], [Y2, Y3 - 0.2, []], [Y3, YR - 0.3, [bal]]]) {
    roundWall(B, M.beamLight, CX, CZ, RI - 0.03, RI, yf, yf + 0.9, ops, { collide: false, seg: 96 });
    roundWall(B, M.beam, CX, CZ, RI - 0.05, RI, yf + 0.9, yf + 0.96, ops, { collide: false, seg: 96 });
    for (let i = 0; i < 16; i++) {
      const a = (i + 0.5) * TAU / 16, a2 = (i + 1.5) * TAU / 16, P = (r, an) => V3(CX + Math.cos(an) * r, yc - 0.1, CZ + Math.sin(an) * r);
      beamBetween(B, M.beam, P(5.3, a), P(RI, a), 0.14, 0.2); beamBetween(B, M.beam, P(5.3, a), P(5.3, a2), 0.14, 0.2);
    }
  }
  for (let i = 0; i < 8; i++) {   // 1층 홀의 나무 기둥
    const a = (i + 0.5) * TAU / 8, x = CX + Math.cos(a) * 8.2, z = CZ + Math.sin(a) * 8.2;
    B.put(M.beam, new THREE.CylinderGeometry(0.19, 0.21, Y2 - 0.3 - Y1, 14), x, (Y1 + Y2 - 0.3) / 2, z);
    B.put(M.stone, new THREE.CylinderGeometry(0.27, 0.32, 0.16, 14), x, Y1 + 0.08, z);
    B.box(M.beam, x - 0.3, Y2 - 0.46, z - 0.3, x + 0.3, Y2 - 0.3, z + 0.3, false);
    addCollider(x - 0.2, Y1, z - 0.2, x + 0.2, Y2 - 0.3, z + 0.2);
  }
  // 2층 선의 기와 처마, 3층 선의 바깥 난간 복도, 옥상 처마
  skirt(B, CX, CZ, RO, 14.5, 5.6, 0.85, 48);
  ringDeck(B, M.floorDark, CX, CZ, RO, 14.9, Y3 - 0.2, Y3 + 0.01);
  fin(() => roundRailing(BF, M.beam, CX, CZ, 14.75 * S, sy(Y3) + 0.013, 1.05, 0, TAU, { gap: 0.2 }));
  for (let i = 0; i < 24; i++) {   // 복도 밑 까치발
    const a = (i + 0.5) * TAU / 24, c = Math.cos(a), s = Math.sin(a), P = (r, y) => V3(CX + c * r, y, CZ + s * r);
    beamBetween(B, M.beam, P(RO, Y3 - 0.27), P(14.85, Y3 - 0.27), 0.12, 0.14);
    beamBetween(B, M.beam, P(RO + 0.02, Y3 - 1.1), P(14.5, Y3 - 0.3), 0.1, 0.12);
  }
  skirt(B, CX, CZ, RO, 14.7, YR, 0.85, 48);
  // 정면 위 둥근 판의 火
  signBoard(B, '火', 0, 10.75, CZ + RO + 0.1, 0, 2.7, 2.7, { round: true, both: false, color: '#b3261a', bg: '#f1e9d4', depth: 0.14, pad: 0.16 });
}

/* ---------- 계단실과 칸막이 ---------- */
function core(B) {
  wall(B, M.white, 'x', ZN0 - 0.2, ZN0, -4.7, 4.7, Y1, YR - 0.3);
  wall(B, M.white, 'x', ZN1, ZS0, -4.65, 4.65, Y1, YR - 0.3);
  wall(B, M.white, 'x', ZS1, ZS1 + 0.2, -4.7, 4.7, Y2, YR - 0.3);
  stairs(B, M.floorDark, 'x', 2, -1, Y1, Y2, ZN0, ZN1, 0.35);      // 1→2층: 북쪽 줄, 동쪽으로 오른다
  stairs(B, M.floorDark, 'x', -2, 1, Y2, Y3, ZS0, ZS1, 0.35);      // 2→3층: 남쪽 줄, 서쪽으로
  stairs(B, M.floorDark, 'x', 2, -1, Y3, YR, ZN0, ZN1, 0.35);      // 3층→옥상 탑: 북쪽 줄, 동쪽으로
  for (const [xa, ya, xb, yb, z] of [[-4.65, Y1, 2, Y2, ZN1 - 0.07], [4.65, Y2, -2, Y3, ZS0 + 0.07], [-4.65, Y3, 2, YR, ZN1 - 0.07]]) {   // 벽에 붙인 손잡이
    const zf = sz(z), dz = Math.sign(z - (ZN1 + ZS0) / 2);
    beamBetween(BF, M.beam, V3(sx(xa), sy(ya) + 0.95, zf), V3(sx(xb), sy(yb) + 0.95, zf), 0.06, 0.06);
    for (let i = 0; i <= 7; i++) { const t = i / 7, x = sx(xa + (xb - xa) * t), y = sy(ya + (yb - ya) * t); BF.box(M.iron, x - 0.015, y + 0.86, zf - 0.02, x + 0.015, y + 0.93, zf - 0.1 * dz, false); }
  }
  fin(() => {
    railing(BF, M.beam, SP([[-3.06, ZN0], [-3.06, ZN1]]), sy(Y2), 1.0);
    railing(BF, M.beam, SP([[3.06, ZS0], [3.06, ZS1]]), sy(Y3), 1.0);
    railing(BF, M.beam, SP([[2, ZN0 - 0.06], [-3.06, ZN0 - 0.06], [-3.06, ZN1 + 0.06], [2, ZN1 + 0.06]]), sy(YR), 1.0);
  });
  // 2·3층 남쪽 방(회의실·집무실)을 가르는 벽과 미닫이
  for (const [ya, yb] of [[Y2, Y3 - 0.2], [Y3, YR - 0.3]]) for (const s of [1, -1]) {
    const u0 = s > 0 ? 6.5 : -8.0, u1 = u0 + 1.5;
    wall(B, M.white, 'x', ZS1, ZS1 + 0.2, s > 0 ? 4.7 : -12.5, s > 0 ? 12.5 : -4.7, ya, yb, [{ u0, u1, ys: [[ya, ya + 2.3]] }]);
    doorUnit(B, 'x', ZS1, ZS1 + 0.2, u0, u1, ya, ya + 2.3, { leaf: 'slide', inward: -1, paper: true });
    for (const [x0, x1] of s > 0 ? [[4.7, 12.45]] : [[-12.45, -4.7]]) for (const z of [ZS1 - 0.02, ZS1 + 0.2]) B.box(M.beam, x0, ya, z, x1, ya + 0.12, z + 0.02, false);   // 걸레받이
  }
}

/* ---------- 1층: 현관 홀과 임무 접수처 ---------- */
function floor1(B, R, glows) {
  const F = frame(B, 0, Y1, -98.6, 0), L = 4.5 * S;       // 접수 책상(반 길이 L)
  F.box(M.beam, -L, 0.98, -0.42, L, 1.05, 0.46);
  F.box(M.beamLight, -L, 0.1, 0.3, L, 0.98, 0.36);
  for (let k = 0; k <= 16; k++) { const x = -L + k * L / 8; F.box(M.beam, x - 0.04, 0, 0.36, x + 0.04, 0.98, 0.4); }
  F.box(M.beam, -L, 0, 0.26, L, 0.1, 0.42);
  for (const x of [-L, L - 0.06]) F.box(M.beamLight, x, 0, -0.42, x + 0.06, 0.98, 0.3);
  F.box(M.beamLight, -L + 0.06, 0.5, -0.38, L - 0.06, 0.53, 0.3);
  F.solid(-L, 0, -0.42, L, 1.05, 0.46);
  ['A', 'B', 'C', 'D'].forEach((ch, i) => {   // 등급별 임무 두루마리 자리
    const x = (-3.3 + i * 2.2) * S;
    { const a = F.W(x - 0.55, 0.3); signBoard(BF, ch, a[0], F.oy + 1.17, a[1], 0, 0.2, 0.2, { both: false, depth: 0.03, bg: '#efe6cf', color: '#b3261a', font: 'gothic' }); }
    scrollPile(F, x, 1.05, 0, 4 - (i & 1), R);
    paperStack(F, x + 0.6, 1.05, -0.05, 0.06 + R() * 0.16, R);
    chairAt(F, x, -1.05, 0);
  });
  F.parts(G.vase, L - 0.4, 1.05, 0.1); F.parts(G.vase, -L + 0.4, 1.05, 0.1, 1);
  for (let i = 0; i < 4; i++) scrollPile(F, (-3.6 + i * 2.4) * S, 0.53, -0.05, 3, R);
  { const a = F.W(0, 0.4);   // 천장에서 드리운 접수처 팻말
    signBoard(BF, '任務受付', a[0], F.oy + 3.15, a[1], 0, 2.8, 0.62, { bg: '#e9dcc0' });
    for (const x of [-1.2, 1.2]) BF.box(M.iron, x - 0.012, F.oy + 3.46, a[1] - 0.012, x + 0.012, sy(Y2 - 0.2), a[1] + 0.012, false); }
  { const a = F.W(0, 0.415); signBoard(BF, '任務受付はこちらまで', a[0], F.oy + 0.56, a[1], 0, 4.6, 0.46, { both: false, depth: 0.02, bg: '#f4f1e8', frame: PAPER }); }   // 책상 앞에 드리운 흰 현수막
  { const b = F.W(0, 0.4); signBoard(BF, '皆さんガンバ', b[0], F.oy + 3.8, b[1], 0, 2.4, 0.4, { depth: 0.02, bg: '#f4f1e8' }); }                                                  // 뒤 벽 위의 현수막
  BF.put(textMat('忍', { w: 256, h: 256, bg: '#f1e9d4', color: '#2a1d16', pad: 0.16 }), new THREE.PlaneGeometry(2.6, 2.6).rotateX(PI / 2), 0, sy(Y2 - 0.2) - 0.03, sz(-94.6), 0);   // 천장의 忍
  // 접수처 뒤 벽의 임무 두루마리 서가
  for (const x of [-2.32, 2.32]) rack(frame(B, x, Y1, ZS0, 0), 4.5 * S, 2.9, 'scrolls', R);
  // 게시판(서쪽)
  const N = frame(B, -8.6, Y1, -98.6, PI / 2);
  for (const x of [-1.35, 1.35]) N.box(M.beam, x - 0.06, 0, -0.06, x + 0.06, 2.45, 0.06);
  N.box(CORK, -1.29, 0.85, -0.03, 1.29, 2.15, 0.03);
  for (const y of [0.8, 2.15]) N.box(M.beam, -1.35, y, -0.05, 1.35, y + 0.07, 0.05);
  N.box(M.beam, -1.5, 2.45, -0.2, 1.5, 2.52, 0.2);
  N.solid(-1.4, 0, -0.08, 1.4, 2.5, 0.08);
  { const a = N.W(0, 0.07); signBoard(BF, '任務掲示板', a[0], N.oy + 2.31, a[1], PI / 2, 1.5, 0.22, { both: false, depth: 0.03 }); }
  const notes = ['任務依頼', '手配書', '告示'].map(t => textMat(t, { w: 128, h: 180, bg: '#efe6cf', color: '#2a1d16', vertical: true, pad: 0.14 }));
  for (let i = 0; i < 15; i++) {
    const x = -1.08 + (i % 5) * 0.54 + (R() - 0.5) * 0.12, y = 1.12 + (i / 5 | 0) * 0.38 + (R() - 0.5) * 0.08;
    N.put(i % 4 === 3 ? PAPER : notes[i % 3], G.sheet, x, y, 0.034 + i * 0.0006, 0, [0.22, 0.31, 1], 0, (R() - 0.5) * 0.22);
    N.put(REDP, G.unit, x, y + 0.13, 0.04, 0, 0.018);     // 압정
  }
  // 기다리는 걸상(동쪽), 화분
  bench(frame(B, 9.4, Y1, -100.6, -PI / 2), 2.0); bench(frame(B, 9.0, Y1, -97.6, -PI / 2), 2.0);
  for (const s of [-1, 1]) { plantAt(B, 'plantB', s * 2.7, Y1, -92.5, s, 1.15); plantAt(B, 'plantA', s * 11.2, Y1, -101.6, s * 2); }
  // 북쪽: 쉬는 자리와 짐
  for (const x of [-2.4, 2.4]) bench(frame(B, x, Y1, ZN0 - 0.44, PI), 3.2);
  { const C = frame(B, 3.0, Y1, -104.85, 0); crate(C, 0, 0, 0, 0.9); crate(C, 1.05, 0, -0.05, 0.8); crate(C, 0.2, 0.9, -0.05, 0.6); }
  { const C = frame(B, 6.5, Y1, -113.2, 0); crate(C, 0, 0, 0, 1.0); crate(C, 1.1, 0, 0.6, 0.8); crate(C, 0.2, 1.0, 0.1, 0.7); }
  { const C = frame(B, -6.6, Y1, -113.3, 0); for (const [x, z] of [[0, 0], [-0.8, 0.6], [0.8, -0.6]]) { C.parts(G.barrel, x, 0, z); C.solid(x - 0.3, 0, z - 0.3, x + 0.3, 0.84, z + 0.3); } }
  plantAt(B, 'plantB', 0, Y1, -115.6, 2, 1.2);
  signBoard(BF, '二階 資料室・会議室', sx(-4.7) - 0.06, sy(Y1) + 2.5, sz(-104.82), -PI / 2, 0.34, 1.5, { both: false, vertical: true, depth: 0.04 });
  lamp(B, glows, -4.5, Y2 - 0.42, -95); lamp(B, glows, 4.5, Y2 - 0.42, -95); lamp(B, glows, 0, Y2 - 0.42, -110.5);
}

/* ---------- 2층: 회의실(남)과 자료실(북) ---------- */
function floor2(B, R, glows, MAP) {
  const T = frame(B, 0, Y2, -96.6, 0);
  table(T, 6.4 * S, 1.6, 0.74);
  for (let i = 0; i < 7; i++) { const x = (-3.6 + i * 1.2) * S * 0.86; chairAt(T, x, 1.2, PI); chairAt(T, x, -1.2, 0); T.put(PAPER, G.cup, x + 0.2, 0.74, 0.55); T.put(PAPER, G.cup, x - 0.2, 0.74, -0.55); }
  chairAt(T, 3.2 * S + 0.45, 0, -PI / 2); chairAt(T, -3.2 * S - 0.45, 0, PI / 2);
  T.put(MAP, G.sheet, 0, 0.745, 0, 0, [1.5, 1.1, 1], -PI / 2);
  for (const s of [-1, 1]) { T.put(PAPER, G.scroll, s * 0.79, 0.777, 0, PI / 2, [3.6, 1, 1]); T.put(BANDS[0], G.scrollBand, s * 0.79, 0.777, 0, PI / 2, [3.2, 1, 1]); }
  teaSet(T, -2.2, 0.74, 0, 0); paperStack(T, 1.9, 0.74, 0.1, 0.08, R); paperStack(T, 2.3, 0.74, -0.2, 0.04, R); scrollPile(T, -1.4, 0.74, -0.3, 2, R);
  // 벽의 마을 전도
  const z = ZS1 + 0.2, zf = sz(z), y2 = sy(Y2);
  BF.box(M.beam, -1.75, y2 + 0.95, zf, 1.75, y2 + 3.15, zf + 0.04, false);
  BF.put(MAP, G.sheet, 0, y2 + 2.05, zf + 0.045, 0, [3.3, 2.0, 1]);
  for (const s of [-1, 1]) { rack(frame(B, s * 10.3, Y2, z, 0), 2.6, 2.1, 'books', R); plantAt(B, 'plantA', s * 3.9, Y2, z + 0.4, s); plantAt(B, 'plantB', s * 5.2, Y2, -92.9, s * 2, 1.1); }
  for (const s of [-1, 1]) signBoard(BF, '会議室', sx(s * 7.25), y2 + DOOR + 0.32, sz(ZS1) - 0.03, PI, 1.0, 0.3, { both: false, depth: 0.04 });
  { // 서쪽 끝: 세워 둔 임무 배치판
    const N = frame(B, -9.4, Y2, -96.9, PI / 2);
    for (const x of [-1.25, 1.25]) { N.box(M.beam, x - 0.05, 0, -0.05, x + 0.05, 2.2, 0.05); N.box(M.beam, x - 0.05, 0, -0.35, x + 0.05, 0.06, 0.35); }
    N.box(CORK, -1.2, 0.8, -0.025, 1.2, 2.1, 0.025); N.box(M.beam, -1.25, 2.1, -0.04, 1.25, 2.17, 0.04); N.box(M.beam, -1.25, 0.74, -0.04, 1.25, 0.8, 0.04); N.solid(-1.3, 0, -0.1, 1.3, 2.2, 0.1);
    { const a = N.W(0, 0.035); signBoard(BF, '任務配置', a[0], N.oy + 1.98, a[1], PI / 2, 1.0, 0.2, { both: false, depth: 0.02 }); }
    ['第七班', '第八班', '第十班', 'ガイ班', '暗部', '医療班'].forEach((t, i) => { N.put(textMat(t, { w: 128, h: 64, bg: '#efe6cf', color: '#2a1d16', pad: 0.14 }), G.sheet, -0.75 + (i % 3) * 0.75, 1.6 - (i / 3 | 0) * 0.5, 0.03, 0, [0.6, 0.26, 1]); N.put(REDP, G.unit, -0.75 + (i % 3) * 0.75, 1.75 - (i / 3 | 0) * 0.5, 0.036, 0, 0.018); N.put(i % 2 ? BOOK[1] : BOOK[2], G.unit, -0.6 + (i % 3) * 0.75, 1.42 - (i / 3 | 0) * 0.5, 0.034, 0, [0.22, 0.05, 0.004]); });
  }
  { // 동쪽 끝: 찻장과 차림
    const E = frame(B, 9.5, Y2, -96.9, -PI / 2);
    E.box(M.beam, -1.1, 0, -0.25, 1.1, 0.9, 0.25); E.box(M.beamLight, -1.04, 0.06, 0.25, -0.03, 0.84, 0.265); E.box(M.beamLight, 0.03, 0.06, 0.25, 1.04, 0.84, 0.265); for (const x of [-0.12, 0.12]) E.box(M.iron, x - 0.015, 0.4, 0.265, x + 0.015, 0.52, 0.285); E.solid(-1.1, 0, -0.25, 1.1, 0.9, 0.27);
    teaSet(E, -0.4, 0.9, 0, 4); E.parts(G.vase, 0.6, 0.9, 0, 0, 1.2); for (let i = 0; i < 6; i++) E.put(PAPER, G.cup, 0.05 + (i % 3) * 0.1, 0.9, -0.1 + (i / 3 | 0) * 0.12);
  }
  { const T2 = frame(B, 0, Y2, -92.3, 0); flagAt(T2, -1.6, 0, '火', '#a82a20'); flagAt(T2, 1.6, 0, '忍', '#2f4f6a'); }
  // 자료실: 계단실 벽 서가, 맞등 서가 두 줄
  for (const x of [-2.35, 2.35]) rack(frame(B, x, Y2, ZN0 - 0.2, PI), 4.6 * S, 3.0, 'mix', R);
  for (const [zz, w] of [[-109.3, 9], [-112.9, 6.5]]) for (const r of [0, PI]) rack(frame(B, 0, Y2, zz, r), w * S, 2.6, r ? (w > 8 ? 'scrolls' : 'books') : 'mix', R);
  rack(frame(B, 10.6, Y2, ZS1, PI), 1.8, 2.4, 'books', R);
  signBoard(BF, '資料室', 0, y2 + 2.5, sz(ZN0 - 0.2) - 0.48, PI, 1.0, 0.3, { both: false, depth: 0.04 });
  // 사다리(가운데 서가의 북쪽 면에 기대 놓았다)
  { const zt = sz(-109.3) - 0.48, zb = zt - 0.82;
    for (const x of [4.4, 4.85]) beamBetween(BF, M.beamLight, V3(x, y2, zb), V3(x, y2 + 2.7, zt), 0.05, 0.07);
    for (let k = 1; k < 8; k++) beamBetween(BF, M.beamLight, V3(4.4, y2 + k * 0.33, zb + k * 0.1), V3(4.85, y2 + k * 0.33, zb + k * 0.1), 0.035, 0.035); }
  { // 금술 서고(북서쪽): 쇠창살 안에 봉인 딱지를 붙인 두루마리. 문은 잠겨 있다
    const K = frame(B, -8.2, Y2, -109.4, PI / 2), w = 1.6, d = 1.2, h = 2.5;
    rack(K.sub(0, 0, -d + 0.05, 0), 2.8, 2.2, 'scrolls', R);
    cageBars(K, 'x', d, -w, w, h); cageBars(K, 'x', -d, -w, w, h); cageBars(K, 'z', -w, -d, d, h); cageBars(K, 'z', w, -d, d, h);
    K.box(M.iron, -0.5, 0, d - 0.03, -0.44, h, d + 0.03); K.box(M.iron, 0.44, 0, d - 0.03, 0.5, h, d + 0.03); K.box(M.iron, 0.3, 1.0, d + 0.02, 0.46, 1.16, d + 0.07); K.box(mat('metal', 0xc9a04a, { rough: 0.4 }), 0.34, 0.9, d + 0.03, 0.42, 1.0, d + 0.06);   // 문틀과 자물쇠
    K.solid(-w, 0, -d, w, h, d);
    for (const [x, y] of [[-0.9, 1.5], [0.2, 1.9], [0.95, 1.1], [-0.3, 0.8]]) K.put(textMat('封', { w: 64, h: 128, bg: '#efe6cf', color: '#a82a20', pad: 0.12 }), G.sheet, x, y, -d + 0.5, 0, [0.12, 0.26, 1]);
    { const a = K.W(0, d + 0.04); signBoard(BF, '禁術の書庫　立入禁止', a[0], K.oy + h + 0.2, a[1], PI / 2, 2.2, 0.3, { both: false, depth: 0.03, color: '#a82a20' }); }
  }
  // 열람 책상(서쪽)
  const D = frame(B, -9.6, Y2, -105.2, PI / 2);
  desk(D, 1.7, 0.8); chairAt(D, 0, -0.75, 0);
  paperStack(D, -0.5, 0.76, 0, 0.12, R); scrollPile(D, 0.4, 0.76, 0.05, 3, R); D.parts(G.andon, 0.05, 0.76, 0.22, 0, 0.6);
  { const a = D.W(0.05, 0.22); glows.push([a[0], D.oy + 0.95, a[1], 0.8]); }
  plantAt(B, 'plantA', -3.9, Y2, -104.8, 1);
  const C = frame(B, -2.9, Y2, -103.2, 0); crate(C, 0, 0, 0, 0.8); crate(C, -0.9, 0, 0.1, 0.7);
  lamp(B, glows, -3.8, Y3 - 0.42, -96.6); lamp(B, glows, 3.8, Y3 - 0.42, -96.6); lamp(B, glows, 0, Y3 - 0.42, -107.5);
}

/* ---------- 3층: 호카게 집무실(남)과 복도(북) ---------- */
function floor3(B, R, glows) {
  // 붉은 양탄자
  disc(BF, REDP, 0, sy(Y3) + 0.012, sz(-96.4), 0, 3.7 * S, true, 48); disc(BF, PAPER, 0, sy(Y3) + 0.016, sz(-96.4), 3.2 * S, 3.36 * S, true, 48);
  const D = frame(B, 0, Y3, -94.1, PI);     // 책상은 북쪽(문)을 본다 — 호카게는 창을 등지고 앉는다. 창 바로 앞에 놓인다
  desk(D, 3.4, 1.4);
  D.put(M.beam, G.kageChair, 0, 0, -1.2, 0); D.put(REDP, G.kageCushion, 0, 0, -1.2, 0); D.solid(-0.35, 0, -1.5, 0.35, 1.5, -0.9);
  for (const [x, z, h] of [[-1.4, 0.3, 0.52], [-1.12, 0.32, 0.3], [-1.38, -0.1, 0.18], [1.35, 0.25, 0.44], [1.08, 0.3, 0.2], [1.36, -0.15, 0.62], [0.55, 0.42, 0.1]]) paperStack(D, x, 0.76, z, h, R);
  D.put(PAPER, G.sheet, 0, 0.763, -0.25, 0.1, [0.42, 0.3, 1], -PI / 2);                       // 쓰던 서류와 벼루·붓·도장
  D.box(M.iron, 0.36, 0.76, -0.4, 0.5, 0.785, -0.2); D.put(M.beam, G.scroll, 0.6, 0.772, -0.3, PI / 2 + 0.2, [0.6, 0.18, 0.18]);
  D.box(REDP, 0.36, 0.76, -0.12, 0.41, 0.84, -0.07);
  scrollPile(D, -0.6, 0.76, 0.3, 3, R); D.put(PAPER, G.cup, -0.45, 0.76, -0.3);
  D.put(REDP, new THREE.SphereGeometry(1, 14, 8), 0.85, 0.79, -0.05, 0, [0.16, 0.04, 0.16]); D.put(M.glass, new THREE.SphereGeometry(0.12, 20, 14), 0.85, 0.93, -0.05);   // 수정 구슬
  for (const [x, z, h] of [[2.2, 0.2, 0.9], [2.5, 0.05, 0.6], [-2.2, 0.3, 0.75], [-2.3, -0.5, 0.4]]) { paperStack(D, x, 0, z, h, R); D.solid(x - 0.12, 0, z - 0.16, x + 0.12, h, z + 0.16); }
  flagAt(D, -3.3, -1.7, '火', '#a82a20'); flagAt(D, 3.3, -1.7, '火', '#a82a20');                                                         // 책상 뒤 양옆의 깃발
  D.box(mat('plain', 0xd9772a), -0.95, 0.76, -0.38, -0.8, 0.785, -0.17); D.box(PAPER, -0.945, 0.763, -0.375, -0.805, 0.782, -0.175);          // 읽다 엎어 둔 주황 표지 책
  // 삿갓 걸이
  D.box(M.beam, 2.42, 0, -1.28, 2.78, 0.05, -0.92); D.put(M.beam, new THREE.CylinderGeometry(0.03, 0.04, 1.25, 8), 2.6, 0.65, -1.1); D.put(M.beam, new THREE.SphereGeometry(0.1, 12, 8), 2.6, 1.27, -1.1);
  D.parts(G.hat, 2.6, 1.27, -1.1, 0, 1.25); D.solid(2.4, 0, -1.3, 2.8, 1.5, -0.9);
  // 역대 호카게 초상(계단실 남쪽 벽)
  const z = ZS1 + 0.2, zf = sz(z), y3 = sy(Y3);
  KAGE.forEach((k, i) => {
    const x = (-3.4 + i * 1.7) * S, m = canvasMat(256, 320, (g, w, h) => drawKage(g, w, h, k, i));
    BF.box(M.beam, x - 0.5, y3 + 1.55, zf, x + 0.5, y3 + 2.85, zf + 0.05, false);
    BF.put(m, G.sheet, x, y3 + 2.2, zf + 0.056, 0, [0.88, 1.1, 1]);
  });
  signBoard(BF, '火の意志', 0, y3 + 3.25, zf + 0.04, 0, 2.2, 0.42, { both: false, depth: 0.04 });
  for (const s of [-1, 1]) {
    rack(frame(B, s * 10.4, Y3, z, 0), 2.6, 2.4, 'mix', R);
    plantAt(B, 'plantB', s * 4.6, Y3, -92.6, s, 1.2); plantAt(B, 'plantA', s * 11.6, Y3, -99.6, s * 2); plantAt(B, 'plantA', s * 4.2, Y3, z + 0.45, s * 3, 0.9);
    signBoard(BF, '火影室', sx(s * 7.25), y3 + DOOR + 0.32, sz(ZS1) - 0.03, PI, 1.0, 0.3, { both: false, depth: 0.04 });
  }
  // 손님 자리(서쪽): 낮은 탁자와 걸상 / 동쪽: 차 탁자
  const GS = frame(B, -7.6, Y3, -96.6, PI / 2);
  { const a = GS.W(0, 0); disc(BF, BOOK[2], a[0], sy(Y3) + 0.012, a[1], 0, 2.3, true, 32); }
  table(GS, 1.5, 0.7, 0.42); teaSet(GS, 0, 0.42, 0, 4); sofa(GS.sub(0, 0, -1.25, 0), 2.2, BOOK[2]); sofa(GS.sub(0, 0, 1.25, PI), 2.2, BOOK[2]);
  const E = frame(B, 8.2, Y3, -96.4, -PI / 2);
  table(E, 1.3, 0.8, 0.72, M.beamLight); E.parts(G.vase, 0.35, 0.72, 0, 0, 1.3); scrollPile(E, -0.25, 0.72, 0, 3, R); chairAt(E, 0, -0.8, 0);
  { // 봉인의 서: 동쪽 창가 받침 위의 큰 두루마리
    const K = frame(B, 10.2, Y3, -98.9, -PI / 2);
    K.box(M.beam, -0.9, 0, -0.3, 0.9, 0.8, 0.3); K.box(M.beamLight, -0.84, 0.06, 0.3, 0.84, 0.74, 0.315); K.solid(-0.9, 0, -0.3, 0.9, 1.2, 0.3);
    for (const s of [-1, 1]) { K.box(M.beam, s * 0.5 - 0.03, 0.8, -0.16, s * 0.5 + 0.03, 0.9, 0.16); }
    K.put(PAPER, new THREE.CylinderGeometry(0.15, 0.15, 1.2, 16).rotateZ(PI / 2), 0, 1.05, 0); for (const s of [-1, 1]) { K.put(BOOK[2], new THREE.CylinderGeometry(0.17, 0.17, 0.06, 16).rotateZ(PI / 2), s * 0.6, 1.05, 0); K.put(M.beam, new THREE.CylinderGeometry(0.05, 0.05, 0.14, 10).rotateZ(PI / 2), s * 0.7, 1.05, 0); }
    K.put(REDP, new THREE.CylinderGeometry(0.153, 0.153, 0.3, 16).rotateZ(PI / 2), 0, 1.05, 0); K.put(textMat('封', { w: 64, h: 64, bg: '#efe6cf', color: '#2a1d16', pad: 0.1 }), G.sheet, 0, 1.05, 0.156, 0, [0.2, 0.2, 1]);
    { const a = K.W(0, 0.32); signBoard(BF, '封印の書', a[0], K.oy + 0.42, a[1], -PI / 2, 0.9, 0.24, { both: false, depth: 0.02 }); }
  }
  // 북쪽 복도: 비서 책상, 걸상, 화분
  const Q = frame(B, -9.3, Y3, -105.4, PI / 2);
  desk(Q, 1.7, 0.8); chairAt(Q, 0, -0.75, 0); paperStack(Q, -0.55, 0.76, 0.05, 0.34, R); paperStack(Q, -0.3, 0.76, 0.1, 0.12, R); scrollPile(Q, 0.45, 0.76, 0, 2, R);
  for (const x of [-2.4, 2.4]) bench(frame(B, x, Y3, ZN0 - 0.44, PI), 3.0);
  { const a = Q.W(0, 0.42); signBoard(BF, '面会受付', a[0], Q.oy + 0.98, a[1], PI / 2, 0.9, 0.22, { both: false, depth: 0.02 }); }
  { const Q2 = frame(B, 9.3, Y3, -105.4, -PI / 2); desk(Q2, 1.7, 0.8); chairAt(Q2, 0, -0.75, 0); paperStack(Q2, 0.5, 0.76, 0.05, 0.22, R); scrollPile(Q2, -0.4, 0.76, 0, 3, R); Q2.parts(G.vase, 0, 0.76, 0.2); }
  for (const s of [-1, 1]) { rack(frame(B, s * 10.6, Y3, -108.0, s > 0 ? -PI / 2 : PI / 2), 2.4, 2.2, 'mix', R); bench(frame(B, s * 5.4, Y3, -114.2, 0), 2.6); }
  for (const s of [-1, 1]) plantAt(B, 'plantB', s * 1.7, Y3, -115.4, s, 1.1);
  plantAt(B, 'plantA', 3.9, Y3, -103.2, 2);
  lamp(B, glows, -4.2, YR - 0.72, -97.4); lamp(B, glows, 4.2, YR - 0.72, -97.4); lamp(B, glows, 0, YR - 0.72, -110);
}

/* ---------- 옥상 마당과 탑 ---------- */
function roofTop(B, glows) {
  fin(() => roundRailing(BF, M.beam, CX, CZ, 12.4 * S, sy(YR), 1.1, 0, TAU, { gap: 0.2 }));
  const door = { a0: PI / 2 - 0.18, a1: PI / 2 + 0.18, ys: [[YR, 15.3]] };
  ringWall(B, CX, CZ, 4.2, 4.5, YR, 16.2, slots(8, 0.2, [2]), 14.0, 15.4, [door], 2);
  roundDoorFrame(B, CX, CZ, 4.2, 4.5, PI / 2, 0.18, YR, 15.3);
  for (let i = 0; i < 8; i++) { const a = (i + 0.5) * TAU / 8; roundWall(B, M.beam, CX, CZ, 4.5, 4.57, YR, 16.0, [], { a0: a - 0.03, a1: a + 0.03, collide: false }); }
  capRoof(B, CX, CZ, 4.5, 4.2, 16.2, 1.0, 2.8, 3);
  lamp(B, glows, 1.0, 16.0, -101.6);
  signBoard(B, '火', 0, 15.75, CZ + 4.56, 0, 0.5, 0.5, { round: true, both: false, color: '#b3261a', bg: '#f1e9d4' });
  // 마당 걸상
  for (const s of [-1, 1]) bench(frame(B, s * 8.2, YR, CZ, s > 0 ? -PI / 2 : PI / 2), 2.6);
}

/* ---------- 별채(양옆 둥근 2층 채)와 이음 통로 ---------- */
function annex(B, s, R, glows) {
  const cx = s * AX, di = s > 0 ? 6 : 0;
  const door = { a0: di * TAU / 12 - 0.1935, a1: di * TAU / 12 + 0.1935, ys: [[Y1, 3.3]] };
  ringWall(B, cx, CZ, ARI, AR, 0, AY2, slots(12, 0.15, [di]), 2.0, 3.4, [door], 2);
  ringWall(B, cx, CZ, ARI, AR, AY2, AYT, slots(12, 0.15), 5.4, 6.9, [], 2);
  roundDoorFrame(B, cx, CZ, ARI, AR, di * TAU / 12, 0.1935, Y1, 3.3);
  for (let i = 0; i < 12; i++) { const a = (i + 0.5) * TAU / 12; roundWall(B, M.beam, cx, CZ, AR, AR + 0.07, 1.1, AYT - 0.4, [], { a0: a - 0.028, a1: a + 0.028, collide: false }); }
  roundWall(B, M.stone, cx, CZ, AR, AR + 0.25, 0, 1.1, [], { collide: false });
  roundWall(B, M.beam, cx, CZ, AR, AR + 0.08, AY2 - 0.25, AY2 + 0.05, [], { collide: false });
  slab(B, M.floor, cx, CZ, 5.45, 0, Y1);
  const hole = [[cx - 1.5, CZ - 3.9, cx + 2.0, CZ - 2.6]];
  slab(B, M.floor, cx, CZ, 5.45, AY2 - 0.2, s > 0 ? AY2 - 0.04 : AY2, hole);
  if (s > 0) slab(B, M.tatami, cx, CZ, 5.45, AY2 - 0.04, AY2, hole);                       // 숙직실은 다다미
  capRoof(B, cx, CZ, AR, ARI, AYT, 0.9, 3.4, 2);
  // 계단(북쪽 벽을 따라 동쪽으로 오른다)
  wall(B, M.white, 'x', CZ - 4.0, CZ - 3.9, cx - 3.4, cx + 3.4, Y1, AYT - 0.2);
  stairs(B, M.floorDark, 'x', cx + 2.0, -1, Y1, AY2, CZ - 3.9, CZ - 2.6, 0.3);
  fin(() => {
    stairRail(BF, sx(cx - 2.2), sy(Y1 + 0.4), sx(cx + 0.5), sy(Y1 + 2.2), sz(CZ - 2.56));
    railing(BF, M.beam, SP([[cx + 2.0, CZ - 2.55], [cx - 1.56, CZ - 2.55], [cx - 1.56, CZ - 3.9]]), sy(AY2), 1.0);
  });
  // 본채와 잇는 통로
  const x0 = s > 0 ? RO : -15.0, x1 = x0 + 2.0, wx0 = s > 0 ? 12.9 : -15.2, wx1 = wx0 + 2.3;
  B.box(M.floor, x0, 0, CZ - 1.2, x1, Y1, CZ + 1.2);
  for (const [f0, f1, out] of [[CZ - 1.2, CZ - 1.0, -1], [CZ + 1.0, CZ + 1.2, 1]]) {
    wall(B, RED, 'x', f0, f1, wx0, wx1, 0, 3.7, [{ u0: x0 + 0.5, u1: x0 + 1.5, ys: [[2.0, 3.1]] }]);
    windowUnit(B, 'x', f0, f1, x0 + 0.5, x0 + 1.5, 2.0, 3.1, { out });
    B.box(M.stone, wx0, 0, out > 0 ? f1 : f0 - 0.08, wx1, 1.1, out > 0 ? f1 + 0.08 : f0, false);
  }
  B.box(M.beamLight, wx0, 3.7, CZ - 1.2, wx1, 3.9, CZ + 1.2);
  gableRoof(B, TILE, wx0 + 0.05, CZ - 1.2, wx1 - 0.05, CZ + 1.2, 3.9, 0.6, { ridge: 'x', over: 0.45, overGable: 0, rafters: false });
  lamp(B, glows, cx, AY2 - 0.42, CZ + 0.6); lamp(B, glows, cx, AYT - 0.5, CZ + 0.6);

  const F1 = frame(B, cx, Y1, CZ, 0), F2 = frame(B, cx, AY2, CZ, 0);
  if (s > 0) {
    // 1층 대기실: 찻상을 사이에 둔 걸상
    const T = frame(B, cx + 1.0, Y1, CZ + 2.0, 0);
    table(T, 1.5, 0.7, 0.42); teaSet(T, -0.2, 0.42, 0, 4); T.parts(G.vase, 0.5, 0.42, 0.05);
    bench(T.sub(0, 0, -1.05, 0), 2.0, false); bench(T.sub(0, 0, 1.2, PI), 2.2);
    bench(frame(B, cx + 4.1, Y1, CZ - 0.2, -PI / 2), 2.0);
    plantAt(B, 'plantB', cx - 2.6, Y1, CZ + 3.2, 1, 1.1); plantAt(B, 'plantA', cx + 3.6, Y1, CZ + 2.3, 2); plantAt(B, 'plantA', cx - 3.9, Y1, CZ - 1.9, 3, 0.9);
    signBoard(BF, '待合室', sx(cx - ARI) + 0.1, sy(Y1) + DOOR + 0.45, CZ, PI / 2, 1.0, 0.3, { both: false, depth: 0.04 });
    // 2층 숙직실: 이부자리 둘, 개켜 둔 이불, 앉은뱅이 책상과 사방등
    futon(F2, -1.6, 0, 1.9, R); futon(F2, -0.2, 0, 1.9, R);
    for (let k = 0; k < 4; k++) F2.box(k % 2 ? BOOK[1] : PAPER, 2.5, k * 0.13, 2.0 + k * 0.01, 3.5, k * 0.13 + 0.12, 2.9 - k * 0.02);
    F2.solid(2.5, 0, 2.0, 3.5, 0.52, 2.9);
    const L = frame(B, cx + 2.9, AY2, CZ - 0.2, -PI / 2);
    table(L, 1.1, 0.6, 0.34); scrollPile(L, -0.2, 0.34, 0, 2, R); L.put(PAPER, G.cup, 0.3, 0.34, 0.1); L.box(REDP, -0.3, 0, 0.4, 0.3, 0.07, 0.9);
    F2.parts(G.andon, -3.2, 0, 0.4); { const a = F2.W(-3.2, 0.4); glows.push([a[0], F2.oy + 0.3, a[1], 0.9]); }
    rack(frame(B, cx - 1.0, AY2, CZ - 2.3, 0), 1.0, 1.3, 'books', R);
    plantAt(B, 'plantA', cx + 3.4, AY2, CZ - 1.9, 1, 0.9);
  } else {
    // 1층 창고: 궤짝·통·두루마리 서가
    rack(frame(B, cx - 0.3, Y1, CZ + 4.1, PI), 3.6, 2.4, 'scrolls', R);
    crate(F1, -3.4, 0, 1.6, 1.0); crate(F1, -3.5, 1.0, 1.6, 0.7); crate(F1, -2.6, 0, 2.7, 0.8); crate(F1, -3.9, 0, 0.5, 0.8);
    crate(F1, 1.2, 0, 0.9, 1.0); crate(F1, 0.1, 0, 1.0, 0.9); crate(F1, 0.7, 1.0, 0.95, 0.8); crate(F1, -1.1, 0, -1.2, 0.9);
    for (const [x, z] of [[-2.4, -1.7], [-3.1, -1.4], [-2.9, -2.1], [2.6, 2.6]]) { F1.parts(G.barrel, x, 0, z); F1.solid(x - 0.3, 0, z - 0.3, x + 0.3, 0.84, z + 0.3); }
    F1.parts(G.barrel, -2.8, 0.84, -1.75, 1, 0.8);
    signBoard(BF, '倉庫', sx(cx + ARI) - 0.1, sy(Y1) + DOOR + 0.45, CZ, -PI / 2, 0.8, 0.3, { both: false, depth: 0.04 });
    // 2층 문서 정리실: 책상 둘과 서가
    for (const x of [-1.7, 1.5]) {
      const D = frame(B, cx + x, AY2, CZ + 0.9, 0);
      desk(D, 1.7, 0.8); chairAt(D, 0, -0.75, 0); paperStack(D, -0.55, 0.76, 0, 0.1 + R() * 0.3, R); paperStack(D, 0.55, 0.76, 0.1, 0.08 + R() * 0.2, R); scrollPile(D, 0.05, 0.76, 0.1, 2, R);
    }
    rack(frame(B, cx, AY2, CZ + 4.1, PI), 3.6, 2.2, 'mix', R); rack(frame(B, cx - 1.2, AY2, CZ - 2.3, 0), 1.6, 1.3, 'books', R);
    F2.parts(G.andon, 3.6, 0, 0.2); { const a = F2.W(3.6, 0.2); glows.push([a[0], F2.oy + 0.3, a[1], 0.9]); }
    plantAt(B, 'plantB', cx - 3.9, AY2, CZ + 0.4, 1, 1.0);
  }
}

/* ---------- 정면: 현관 지붕, 돌계단, 등롱, 판석 마당 ---------- */
function front(B, glows) {
  B.box(M.pave, -11, -0.3, -85.8, 11, 0.04, -70.6);
  for (const s of [-1, 1]) B.box(M.stone, s * 11, -0.3, -85.8, s * 11.35, 0.14, -70.6);                // 마당 가장자리 돌
  B.box(M.stone, -3.6, 0, -91.3, 3.6, Y1, -87.4);
  stairs(B, M.stone, 'z', -87.4, 1, 0, Y1, -3.6, 3.6, 0.4);
  for (const s of [-1, 1]) {
    B.box(M.stone, s * 3.6, 0, -87.7, s * 4.4, 1.15, -85.5);                                           // 소맷돌과 그 위 돌등롱
    { const P = frame(B, s * 4.0, 1.15, -86.3, 0); P.parts(G.toro, 0, 0, 0); glows.push([P.W(0, 0)[0], P.oy + 1.32, P.W(0, 0)[1], 1.3]); }
    { const P = frame(B, s * 9.2, 0.04, -78, 0); P.parts(G.toro, 0, 0, 0, 0, 1.25); P.solid(-0.4, 0, -0.4, 0.4, 2.4, 0.4); glows.push([P.W(0, 0)[0], P.oy + 1.66, P.W(0, 0)[1], 1.5]); }
    fin(() => railing(BF, M.beam, SP([[s * 3.5, -90.85], [s * 3.5, -87.75]]), sy(Y1), 1.0));
    for (const z of [-87.75, -90.5]) { B.box(M.beam, s * 3.0 - 0.11, Y1, z - 0.11, s * 3.0 + 0.11, 3.5, z + 0.11); B.box(M.stone, s * 3.0 - 0.18, Y1, z - 0.18, s * 3.0 + 0.18, Y1 + 0.12, z + 0.18, false); }
    B.box(M.beam, s * 3.0 - 0.09, 3.3, -91.1, s * 3.0 + 0.09, 3.5, -87.6, false);
    // 문설주와 안으로 열린 문짝
    B.box(M.beam, s * 1.4, Y1, -91.46, s * 1.6, 3.4, -90.94);
    const x = s * 1.34;
    B.box(M.beamLight, x - 0.03, Y1 + 0.02, -92.95, x + 0.03, 3.36, -91.5);
    for (const y of [Y1 + 0.02, 2.1, 3.22]) B.box(M.beam, x - 0.045, y, -92.95, x + 0.045, y + 0.14, -91.5, false);
    for (const z of [-92.95, -91.62]) B.box(M.beam, x - 0.045, Y1 + 0.02, z, x + 0.045, 3.36, z + 0.12, false);
    B.put(M.iron, new THREE.TorusGeometry(0.07, 0.012, 6, 14), x - s * 0.05, 2.0, -92.75, PI / 2);
    fin(() => lantern(BF, sx(s * 1.9), sy(3.3) - 0.37, sz(-87.75), { text: '火' })); glows.push([sx(s * 1.9), sy(3.3) - 0.37, sz(-87.75), 1.2]);
    // 깃발(노보리)
    const bx0 = s * 6.6, bz = -84.6;
    B.put(M.beam, new THREE.CylinderGeometry(0.035, 0.045, 5.2, 8), bx0, 2.6, bz); addCollider(bx0 - 0.06, 0, bz - 0.06, bx0 + 0.06, 5.2, bz + 0.06);
    B.geo(M.beam, tube([V3(bx0, 5.0, bz), V3(bx0 - s * 0.95, 5.0, bz)], 0.02, 6));
    B.geo(textMat(s > 0 ? '火影邸' : '木ノ葉隠れの里', { w: 128, h: 600, vertical: true, color: '#f4efe2', bg: s > 0 ? '#a82a20' : '#2f4f6a', pad: 0.1 }, 'cloth'), new THREE.PlaneGeometry(0.8, 3.6, 4, 14), mat4(bx0 - s * 0.5, 3.2, bz));
  }
  B.box(M.beam, -1.6, 3.4, -91.46, 1.6, 3.62, -90.94, false);
  B.box(M.beam, -3.1, 3.3, -87.84, 3.1, 3.5, -87.66, false);
  gableRoof(B, TILE, -3.1, -90.8, 3.1, -87.6, 3.5, 0.9, { ridge: 'z', over: 0.6, overGable: 0.5, gable: M.white });
  signBoard(B, '火影邸', 0, 3.92, -90.93, 0, 1.9, 0.46, { both: false });
  B.put(canvasMat(256, 256, drawLeaf), new THREE.CircleGeometry(0.3, 28), 0, 3.83, -87.585);
  B.put(M.beam, new THREE.TorusGeometry(0.31, 0.025, 6, 28), 0, 3.83, -87.59);
}

export async function build(scene, ctx) {
  init();
  const B = new Builder(), R = rng(7701), glows = [], from = marks();
  BF = new Builder(); KEEP = new Set();
  const MAP = canvasMat(512, 384, drawMap);
  shell(B); core(B);
  floor1(B, R, glows); floor2(B, R, glows, MAP); floor3(B, R, glows); roofTop(B, glows);
  annex(B, 1, R, glows); annex(B, -1, R, glows);
  front(B, glows);
  // 몸체를 본채 중심에서 S배로 키운다. 벽·기와 무늬는 늘어나지 않게 무늬 좌표도 같이 키운다(글씨·그림은 그대로).
  const grow = new THREE.Matrix4().makeTranslation(CX, 0, CZ).multiply(new THREE.Matrix4().makeScale(S, S, S)).multiply(new THREE.Matrix4().makeTranslation(-CX, 0, -CZ));
  for (const mesh of B.finish(scene).children) {
    mesh.geometry.applyMatrix4(grow);
    if (mesh.material.map && mesh.material.map.wrapS === THREE.RepeatWrapping) { const uv = mesh.geometry.attributes.uv.array; for (let i = 0; i < uv.length; i++) uv[i] *= S; }
  }
  rescale(from, S, CX, CZ, KEEP);
  BF.finish(scene);
  const out = {
    places: [
      { n: '호카게 관저 앞마당', t: '붉은 둥근 관저 앞 판석 마당. 돌계단 위 현관 지붕 아래로 들어간다.', b: [-12, 12, -91, -70], y: [0, 4] },
      { n: '현관 홀 · 임무 접수처', t: 'A·B·C·D 등급 임무 두루마리를 내어 주는 긴 접수 책상. 서쪽엔 임무 게시판, 뒤쪽 계단으로 2층에 오른다.', b: [-13, 13, -117, -91], y: [Y1, Y2 - 0.1] },
      { n: '회의실', t: '마을 전도를 펴 놓은 긴 탁자. 상급 닌자 회의가 열리는 방.', b: [-13, 13, ZS1 + 0.1, -91], y: [Y2, Y3 - 0.1] },
      { n: '자료실', t: '임무 기록과 술법 두루마리가 천장까지 꽂힌 서가.', b: [-13, 13, -117, ZS1 + 0.1], y: [Y2, Y3 - 0.1] },
      { n: '호카게 집무실', t: '창이 빙 둘러 마을이 내려다보이는 방. 서류 더미 쌓인 책상이 놓여 있다. 벽에는 역대 호카게의 초상.', b: [-13, 13, ZS1 + 0.1, -91], y: [Y3, YR - 0.1] },
      { n: '3층 복도', t: '집무실 앞 복도와 비서 자리. 북쪽 문으로 바깥 난간 복도에 나간다.', b: [-13, 13, -117, ZS1 + 0.1], y: [Y3, YR - 0.1] },
      { n: '바깥 난간 복도', t: '본채를 한 바퀴 도는 나무 난간 복도. 남쪽은 마을, 북쪽은 호카게 바위.', b: [-15, 15, -119, -89], y: [Y3, YR - 0.1] },
      { n: '옥상 탑', t: '옥상으로 올라오는 계단이 닿는 작은 둥근 탑.', b: [-4.5, 4.5, -108.5, -99.5], y: [YR, 16.5] },
      { n: '관저 옥상 마당', t: '호카게 취임식이 열리는 넓은 옥상. 마을이 한눈에 들어온다.', b: [-13, 13, -117, -91], y: [YR, 17] },
      { n: '대기실', t: '호카게를 뵈러 온 이들이 차를 마시며 기다리는 동쪽 별채.', b: [15, 26, -109.5, -98.5], y: [Y1, AY2 - 0.1] },
      { n: '숙직실', t: '밤샘 당번 닌자가 눈을 붙이는 다다미방.', b: [15, 26, -109.5, -98.5], y: [AY2, 8] },
      { n: '창고', t: '임무 장비 궤짝과 두루마리를 쌓아 둔 서쪽 별채.', b: [-26, -15, -109.5, -98.5], y: [Y1, AY2 - 0.1] },
      { n: '문서 정리실', t: '임무 보고서를 정리해 자료실로 올리는 방.', b: [-26, -15, -109.5, -98.5], y: [AY2, 8] },
    ],
    jumps: [['호카게 관저 앞', 0, 0, -77, 0, 10], ['호카게 집무실', 0, Y3, -100.6, PI, 11], ['관저 옥상', 0, YR, -96.5, PI, 12]],
    lights: [[0, 4.2, -96.5, 22, 24], [0, 8.2, -99, 20, 24], [0, 12.0, -98.5, 22, 24], [AX, 3.6, CZ + 0.6, 12, 14]],
    glows, skip: [],
  };
  // 자리 이름·바로 가기·등불도 키운 건물의 자리로
  for (const p of out.places) { p.b = [sx(p.b[0]), sx(p.b[1]), sz(p.b[2]), sz(p.b[3])]; p.y = p.y.map(sy); }
  out.jumps = out.jumps.map(([n, x, y, z, yaw, k]) => [n, sx(x), sy(y), sz(z), yaw, k]);
  out.lights = out.lights.map(([x, y, z, power, far]) => [sx(x), sy(y), sz(z), power * S * S, far * S]);
  return out;
}
