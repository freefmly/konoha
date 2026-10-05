// 나뭇잎 마을 새 배치도(안) — 자리표와 그림을 한 파일에서 뽑는다.
// 도면 단위: 1칸 = 2.5m. 담의 중심 (285,270), 반지름 240칸(= 600m). 왼쪽이 호카게 바위, 오른쪽이 정문.
// 앱 좌표로 옮길 때(plan/export.mjs): 관저(FAN)가 지금 앱의 관저 자리(0,-104)에 오게 한다 → 앱 x(동) = -(y-270)*2.5, 앱 z(남) = (x-75)*2.5-104  (지도의 위쪽이 앱의 동쪽)
// 앱이 읽는 자리표는 node plan/export.mjs → js/plan-data.js
// 실행: node plan/plan.mjs → village-plan.svg (구역만) / node plan/plan.mjs detail → village-detail.svg (길과 블록까지). 그 뒤 크롬으로 png를 찍는다
//
// 뼈대: 호카게 관저(FAN)에서 큰 바큇살 길이 담까지 뻗어 마을을 부채꼴 조각으로 나눈다. 조각 안의 블록은 고리 조각 모양.
// 세로 큰길(x=292)의 정문 쪽, 아래로는 18도 길까지가 반듯한 격자 거리다. 마을 가운데에서 위로 가는 세로 길은 둘(x=234, x=292).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const UNIT = 2.5, C = { x: 285, y: 270, r: 240 };   // 담의 중심은 큰길(y=270) 위에 둔다 — 정문이 큰길 끝에 온다
export const FAN = { x: 75, y: 270 };
export const SPOKES = [{ a: -66 }, { a: -42, r1: 214 }, { a: -17, r1: 54 }, { a: -17, r0: 124, r1: 226 }, { a: 18 }, { a: 45, r1: 89 }, { a: 45, r0: 199 }, { a: 63 }];   // 큰 바큇살 길: 각도(0 = 정문 쪽 큰길, 음수 = 지도 위쪽), r0~r1 구간(없으면 관저 앞~담)
const EDGES = [-90, -66, -42, -17, 0, 18, 45, 63, 90];       // 부채꼴 조각의 경계
export const XGRID = 292, XMID = 234;                          // 세로 큰길 둘. XGRID 오른쪽이 격자 거리
const D = Math.PI / 180, r1 = v => +v.toFixed(1);
export const pol = (a, r) => [r1(FAN.x + r * Math.cos(a * D)), r1(FAN.y + r * Math.sin(a * D))];
// 각도 a0~a1, 반지름 r0~r1 의 고리 조각
export const sector = (a0, a1, r0, r1) => {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 2.5)), pts = [];
  for (let i = 0; i <= n; i++) pts.push(pol(a0 + (a1 - a0) * i / n, r1));
  for (let i = n; i >= 0; i--) pts.push(pol(a0 + (a1 - a0) * i / n, r0));
  return pts;
};
// 반평면으로 자르기: f(p) ≥ 0 인 쪽만 남긴다
const cut = (poly, f) => { const out = []; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], fa = f(a), fb = f(b); if (fa >= 0) out.push(a); if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); } } return out; };
const clipX = (poly, xmax) => cut(poly, p => xmax - p[0]);

// 구역: n 번호, name 이름, fill 색, at 번호 자리, note 처리. 모양은 pts / rect / circle.
// fan [a0,a1,r0,r1] 이 있으면 부채꼴 구역(안의 블록도 고리 조각), grid 가 있으면 격자 구역
export const ZONES = [
  // ── 관저 앞 첫 고리(r 56~122)
  { n: 6, name: '사루토비 구역', fill: '#b9692a', at: pol(-54, 89), fan: [-66, -42, 56, 122], note: '새로(겉모습)' },
  { n: 4, name: '상급닌자 대기소', fill: '#3d8f6a', at: pol(-8.5, 69), pts: sector(-12, -5, 56, 82), note: '새로(겉모습) · 아카데미 터 안 큰길 모퉁이' },
  { n: 3, name: '아카데미 터', fill: '#f4e3a1', at: pol(-38, 72), pts: sector(-42, -2.5, 56, 122), note: '교사 이사 + 운동장·훈련관·별관 · 큰길에 맞닿음' },
  { n: 28, name: '정보부', fill: '#6b5a8c', at: pol(11.5, 71), pts: sector(5, 18, 56, 87), note: '새로(겉모습)' },
  { n: 29, name: '전서구 탑', fill: '#c9a227', at: pol(13, 106), circle: [...pol(13, 106), 6], note: '새로(겉모습)' },
  { n: 30, name: '묘지', fill: '#555555', at: pol(73, 86), pts: sector(63, 88, 56, 122), note: '새로' },
  // ── 위쪽 부채꼴: 이노-시카-초
  { n: 7, name: '나라 구역', fill: '#1f6b2a', at: pol(-54, 180), fan: [-66, -42, 126, 250], clipX: 231, note: '새로 · 시카마루네 집 자리' },
  { n: 9, name: '아키미치 구역', fill: '#f0c02c', at: pol(-29.5, 185), fan: [-42, -17, 126, 240], clipX: 289, note: '새로(겉모습)' },
  { n: 10, name: '야마나카 구역', fill: '#2f97dc', grid: 0, at: [263, 98], rect: [237, 48, 289, 150], note: '새로(겉모습)' },
  // ── 큰길가
  { n: 11, name: '나루토의 집(아파트)', fill: '#f08a2c', at: pol(-5.5, 161), pts: sector(-8.5, -2.5, 150.5, 171.5), note: '이사' },
  { n: 12, name: '번화가(상점·술집)', fill: '#222222', grid: 0, at: [372, 228], rect: [296, 208, 432, 266], note: '새로(겉모습)' },
  { n: 15, name: '야마나카 꽃집(이노의 집)', fill: '#7fd0ff', at: [279, 257], rect: [269, 248, 289, 266], note: '이사' },
  { n: 13, name: '이치라쿠 라멘', fill: '#ffe23d', at: [307, 256], rect: [296, 246, 318, 266], note: '이사' },
  { n: 14, name: '야키니쿠 큐', fill: '#a03fb5', at: [331, 256], rect: [320, 246, 342, 266], note: '새로(겉모습)' },
  { n: 18, name: '경단 가게', fill: '#ff9db0', at: [387, 258], rect: [379, 250, 395, 266], note: '새로(겉모습)' },
  { n: 19, name: '아마구리아마(단것 가게)', fill: '#c98a4a', at: [364, 286], rect: [356, 278, 372, 294], note: '새로(겉모습)' },
  { n: 24, name: '사쿠라의 집', fill: '#ff5fa2', at: [403, 287], rect: [393, 278, 413, 296], note: '이사' },
  { n: 25, name: '텐텐의 집', fill: '#8fe0e0', at: [427, 287], rect: [417, 278, 437, 296], note: '새로(겉모습)' },
  // ── 격자 거리(정문 쪽 위)
  { n: 16, name: '슈슈야(술집)', fill: '#d9463a', at: [304, 160], rect: [296, 151, 312, 169], note: '새로(겉모습)' },
  { n: 17, name: '사이의 아파트', fill: '#e8e8e8', at: [304, 187], rect: [296, 178, 312, 196], note: '새로(겉모습)' },
  { n: 20, name: '공원', fill: '#8cc152', at: [355, 176], rect: [318, 150, 392, 202], trees: true, note: '새로' },
  { n: 21, name: '이누즈카 구역', fill: '#7d7d7d', grid: 0, at: [419, 180], rect: [397, 156, 442, 205], note: '새로(겉모습)' },
  { n: 22, name: '이누즈카 견사', fill: '#5a5a5a', grid: 0, at: [433, 135], pts: [[420, 118], [444, 118], [448, 152], [420, 152]], note: '새로(겉모습)' },
  { n: 23, name: '리의 집', fill: '#3fbf4a', at: [307, 107], rect: [300, 100, 314, 114], note: '새로(겉모습)' },
  // ── 아래쪽 부채꼴
  { n: 26, name: '병원', fill: '#8c1c2c', at: pol(10.5, 149), pts: sector(2.5, 18, 126, 171.5), note: '새로(겉모습)' },
  { n: 27, name: '도서관', fill: '#c9c9c9', at: pol(10.5, 195), pts: sector(3, 18, 175, 215), note: '새로(겉모습)' },
  { n: 31, name: '경기장', fill: '#f3a6b8', at: pol(26, 216), circle: [...pol(26, 216), 15], note: '새로(겉모습)' },
  { n: 32, name: '휴가 구역', fill: '#a9a4e6', at: pol(42, 146), fan: [18, 63, 91, 196], walled: '#544fa0', note: '새로(겉모습)' },
  { n: 33, name: '우치하 구역', fill: '#e23b2e', at: pol(30, 270), grid: 18, pts: [pol(18, 232), pol(18, 357), pol(24, 345), pol(29, 331), pol(35, 310), pol(41, 285), pol(45, 266)], walled: '#6e140d', note: '이사 + 크게 · 강가 숲 띠 안쪽까지' },
  { n: 36, name: '우치하 센베이', fill: '#ffd9a0', at: pol(27.7, 259), pts: sector(26, 29.5, 252, 266), note: '새로(겉모습)' },
  { n: 37, name: '경무부대 본부', fill: '#33415c', at: pol(21.5, 253), pts: sector(19.5, 23.5, 244, 262), note: '새로(겉모습)' },
  { n: 35, name: '남가 신사', fill: '#7a1010', at: pol(21, 334.5), pts: sector(19.5, 22.5, 326, 343), note: '이사' },
  { n: 39, name: '온천', fill: '#3a5fd0', at: [457, 383], rect: [447, 374, 467, 391], note: '새로(겉모습)' },
  { n: 40, name: '아부라메 구역', fill: '#f4f4f4', at: pol(48, 285), pts: [pol(52, 256), pol(48, 277), pol(44, 296), pol(44, 312), pol(48, 293), pol(52, 272)], note: '새로(겉모습)' },
  { n: 41, name: '아부라메 벌레 사육장', fill: '#dedede', at: pol(40.7, 319), pts: [pol(43, 301), pol(38.5, 321), pol(38.5, 337), pol(43, 317)], note: '새로(겉모습)' },
];
// 물길: 왼쪽(바위 쪽)이 상류. 섬 있는 못 → 담 안쪽을 따라 → 우치하 구역 끝의 호수 → 정문 아래쪽 못에서 끝난다(담 밖으로 빠지지 않는다)
export const ISLE = { x: pol(60, 205)[0], y: pol(60, 205)[1], rx: 22, ry: 13, rot: -30 };   // 섬 있는 못(제2 훈련장)
export const NAKA = [[60, 205], [54, 236], [47, 273], [41, 301], [35, 327], [29, 350], [24, 362], [19, 372], [15, 380], [11, 388]].map(p => pol(...p)).concat([[463, 322]]);
export const LAKE = { x: pol(29, 312)[0], y: pol(29, 312)[1], rx: 20, ry: 13, rot: -61 };   // 우치하 구역 안의 호수(약 100m × 65m). 강에서 물길(FEED)로 물을 끌어들인다
export const FEED = [pol(31.5, 322), pol(32, 339)];
export const PIER = [pol(29, 295), pol(29, 308)];                                            // 부두: 구역 쪽 물가에서 호수 가운데로
export const NE_STREAM = [[452, 60], [450, 100], [456, 150], [470, 186], [471, 214], [460, 234]];
// 훈련장(과녁 표시)
export const TRAIN = [
  { id: '1', at: pol(-29.5, 41), name: '제1 훈련장 — 아카데미 옆, 기초 단련' },
  { id: '2', at: [ISLE.x, ISLE.y], name: '제2 훈련장 — 섬 있는 못(물 위 수련)' },
  { id: '3', at: [330, 76], name: '제3 훈련장 — 통나무 셋·냇물·위령비' },
  { id: '4', at: [372, 318], name: '제4 훈련장 — 정문 쪽 공원' },
  { id: '43', at: [440, 100], name: '제43 훈련장' },
  { id: '44', at: [382, 52], name: '제44 훈련장(죽음의 숲) — 철망·출입문만, 숲은 담 밖으로' },
  { id: '0', at: [486, 498], name: '제0 훈련장 — 담 밖 금렵구(위키 기준)' },
];
// 담 안 숲·녹지
export const GREEN = [
  [[296, 20], [476, 20], [476, 112], [452, 116], [416, 112], [396, 112], [396, 148], [296, 148]],   // 위쪽 숲(제3·제43·죽음의 숲 가장자리). 공원(20) 위는 전부 녹지
  [pol(45, 266), pol(41, 285), pol(35, 310), pol(29, 331), pol(24, 345), pol(18, 357), pol(18, 378), pol(24, 366), pol(29, 354), pol(35, 331), pol(41, 305), pol(45, 286)],   // 우치하 구역과 나카 강 사이의 숲 띠
  [[346, 300], [440, 300], [458, 346], [424, 374], [396, 368], [346, 332]],             // 정문 쪽 공원(제4 훈련장)
  sector(53, 67, 186, 246),                                                             // 섬 못 둘레
  [[448, 160], [490, 160], [494, 250], [448, 250]],                                     // 오른쪽 위 냇가
  [[425, 338], [500, 333], [492, 405], [468, 428], [410, 402]],                         // 강 하류 둑
  // 관저 앞 나무 고리(r 30~52). 큰길 양옆 가로수는 ROADSIDE
  sector(-88, -66, 30, 52), sector(-66, -42, 30, 52), sector(-42, -17, 30, 52), sector(-17, 0, 30, 52), sector(0, 18, 30, 52),   // 큰길 양옆은 사잇길 없이 한 덩어리씩
  sector(18, 45, 30, 52), sector(45, 63, 30, 52), sector(63, 88, 30, 52),
  
];
export const ROADSIDE = { x0: 131, x1: 199, off: 4.5, w: 4, step: 6.2 };   // 큰길 양쪽 가로수 줄: 나무 고리 밖(x0)부터 첫 둥근 길(x1)까지, 길 가장자리에서 폭 w
export const ROCK = [[57, 216], [57, 320], [50, 342], [30, 358], [-4, 352], [-16, 268], [-4, 184], [30, 178], [50, 194]];
export const PLAZA = [[446, 226], [522, 236], [522, 266], [446, 266]];   // 정문 안 마당
export const PONDS = [[463, 322, 11, 9], [398, 344, 10, 7], [460, 238, 7, 6]];   // 작은 못: 나카 강이 끝나는 못, 공원 못, 냇물이 끝나는 못 [x, y, rx, ry]
export const BROOK = [[330, 22], [334, 60], [322, 96]];                          // 제3 훈련장의 냇물
export const BRIDGES = [[pol(45, 275), pol(45, 290)], [pol(18, 367), pol(18, 382)], [[452, 331], [466, 337]]];   // 다리: 강을 건너는 자리 [한쪽 끝, 다른 쪽 끝]
export const VROADS = [[XGRID, 40, 340, 4.5], [XMID, 46, 266, 4], [440, 150, 400, 3]];                           // 세로 길 [x, y0, y1, 폭]
export const MAINROAD = { x0: 86, x1: 530, w: 9 }, SPOKE_W = 5.5, RING = { r: C.r - 9, w: 3 }, FORECOURT = 28;   // 큰길, 바큇살 길 폭, 담 안쪽 둘레길, 관저 앞마당 반지름

/* ============================ 블록 자르기 ============================ */
export const zonePts = z => z.pts || (z.fan ? (z.clipX ? clipX(sector(...z.fan), z.clipX) : sector(...z.fan)) : z.rect ? [[z.rect[0], z.rect[1]], [z.rect[2], z.rect[1]], [z.rect[2], z.rect[3]], [z.rect[0], z.rect[3]]] : null);
const inPoly = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const inZone = (p, z) => z.circle ? Math.hypot(p[0] - z.circle[0], p[1] - z.circle[1]) < z.circle[2] : inPoly(p, zonePts(z));
const distLine = (p, pts) => { let d = 1e9; for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1], vx = b[0] - a[0], vy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / (vx * vx + vy * vy))); d = Math.min(d, Math.hypot(p[0] - a[0] - vx * t, p[1] - a[1] - vy * t)); } return d; };
const wet = (p, k = 1) => distLine(p, NAKA) < 7 * k || distLine(p, NE_STREAM) < 5 * k || Math.hypot(p[0] - LAKE.x, p[1] - LAKE.y) < 22 * k || Math.hypot(p[0] - ISLE.x, p[1] - ISLE.y) < 24 * k || Math.hypot(p[0] - 463, p[1] - 322) < 13;
const cutRect = (poly, x0, y0, x1, y1) => { let q = cut(poly, p => p[0] - x0); q = q.length ? cut(q, p => x1 - p[0]) : q; q = q.length ? cut(q, p => p[1] - y0) : q; return q.length ? cut(q, p => y1 - p[1]) : q; };
const areaOf = q => { let s2 = 0; for (let i = 0; i < q.length; i++) { const a = q[i], b = q[(i + 1) % q.length]; s2 += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s2) / 2; };
export const mid = q => [q.reduce((t, p) => t + p[0], 0) / q.length, q.reduce((t, p) => t + p[1], 0) / q.length];
const inWall = (p, pad = 15) => Math.hypot(p[0] - C.x, p[1] - C.y) < C.r - pad;
const angOf = p => Math.atan2(p[1] - FAN.y, p[0] - FAN.x) / D;
// 고리 하나(r0~r1)를 각도 a0~a1 사이에서 호 길이 arc 쯤으로 나눈다. 칸 사이 샛길 폭 gap
const ringCells = (a0, a1, r0, r1, arc, gap = 3) => {
  const rm = (r0 + r1) / 2, n = Math.max(1, Math.round(rm * (a1 - a0) * D / arc)), g = gap / rm / D / 2, out = [];
  for (let k = 0; k < n; k++) out.push(sector(a0 + (a1 - a0) * k / n + (k ? g : 0), a0 + (a1 - a0) * (k + 1) / n - (k < n - 1 ? g : 0), r0, r1));
  return out;
};
// 부채꼴 구역 안의 블록: 깊이 depth 쯤의 고리로 나누고 고리마다 호 길이 arc 쯤으로 나눈다
export function fanBlocks(z, depth, arc, gap = 3) {
  const [a0, a1, r0, r1] = z.fan, rings = Math.max(1, Math.round((r1 - r0) / (depth + gap))), step = (r1 - r0 + gap) / rings, out = [];
  for (let i = 0; i < rings; i++) for (let b of ringCells(a0, a1, r0 + i * step, r0 + (i + 1) * step - gap, arc, gap)) {
    if (z.clipX) b = clipX(b, z.clipX);
    if (b.length < 3 || areaOf(b) < 50) continue;
    const m = mid(b);
    if (!inWall(m, 12) || wet(m, 0.95) || (z.pts && !inPoly(m, z.pts)) || ZONES.some((q, i) => i > ZONES.indexOf(z) && inZone(m, q))) continue;
    out.push(b);
  }
  return out;
}
// 다각형을 ang도 기운 그물로 잘라 블록들을 낸다(격자 거리용)
export function blocksIn(poly, ang, cw, ch, gap, minFrac = 0.3) {
  const a = ang * D, c = Math.cos(a), sn = Math.sin(a), R = p => [p[0] * c + p[1] * sn, -p[0] * sn + p[1] * c], Ri = p => [p[0] * c - p[1] * sn, p[0] * sn + p[1] * c];
  const q = poly.map(R), xs = q.map(p => p[0]), ys = q.map(p => p[1]), out = [];
  for (let gx = Math.floor(Math.min(...xs) / cw) * cw; gx < Math.max(...xs); gx += cw) for (let gy = Math.floor(Math.min(...ys) / ch) * ch; gy < Math.max(...ys); gy += ch) {
    const cell = cutRect(q, gx + gap / 2, gy + gap / 2, gx + cw - gap / 2, gy + ch - gap / 2);
    if (cell.length >= 3 && areaOf(cell) > minFrac * (cw - gap) * (ch - gap)) out.push(cell.map(Ri));
  }
  return out;
}
// 블록 크기: 부채꼴 구역 [깊이, 호 길이], 격자 구역 [가로, 세로, 길 폭]
const SUB = { 6: [30, 30], 7: [22, 30], 9: [21, 30], 32: [23, 36] };
const CELL = { 33: [24, 17.5, 2.8], 10: [26.5, 25, 3], 12: [22.7, 19.4, 2.6], 21: [22.5, 16.4, 2.6], 22: [14, 11.4, 2.4] };
// 구역 안의 블록들(블록으로 나누지 않는 한 채짜리 터는 null). 자기보다 나중에 그리는(위에 얹히는) 구역에 가린 칸은 뺀다
export const zoneBlocks = z => z.fan ? fanBlocks(z, ...SUB[z.n]) : CELL[z.n] ? blocksIn(zonePts(z), z.grid, ...CELL[z.n], 0.22).filter(b => { const m = mid(b); return !wet(m, 0.95) && !ZONES.some((q, i) => i > ZONES.indexOf(z) && inZone(m, q)); }) : null;
export const reach = a => { let r = 20; while (inWall(pol(a, r + 2), 9)) r += 2; return r; };   // 바큇살 길이 담 안쪽 둘레길에 닿는 반지름
const taken = m => ZONES.some(z => inZone(m, z)) || GREEN.some(g => inPoly(m, g)) || inPoly(m, ROCK) || inPoly(m, PLAZA) || wet(m, 1.2);
// 일반 살림집 블록
export function townBlocks() {
  const out = [];
  // 부채꼴 거리: 바큇살 사이마다 고리를 바깥으로 쌓는다. 격자 거리와 맞닿는 조각은 세로 큰길에서 끊는다
  const edges = EDGES, rings = [[56, 87], [91, 122]];
  for (let r = 126; r < 430; r += 24.5) rings.push([r, r + 21]);
  for (let i = 0; i < edges.length - 1; i++) for (const [r0, r1] of rings) for (let b of ringCells(edges[i], edges[i + 1], r0, r1, 27)) {
    if (edges[i + 1] <= 18) b = clipX(b, XGRID - 3.5);
    if (b.length < 3 || areaOf(b) < 90) continue;
    const m = mid(b);
    if (!inWall(m) || taken(m)) continue;
    out.push(b);
  }
  // 격자 거리: 세로 큰길 오른쪽, 아래로는 18도 길까지
  let disc = [[-100, -100], [700, -100], [700, 700], [-100, 700]];
  for (let k = 0; k < 96; k++) { const t = k / 96 * Math.PI * 2, nx = Math.cos(t), ny = Math.sin(t); disc = cut(disc, p => (C.r - 13) - ((p[0] - C.x) * nx + (p[1] - C.y) * ny)); }
  for (const poly of [cutRect(disc, XGRID + 3.5, 0, 600, 264.5), cutRect(disc, XGRID + 3.5, 275.5, 600, 600)]) for (const b of blocksIn(poly, 0, 27, 19.2, 3, 0.35)) {
    const m = mid(b), a = angOf(m);
    if (a > 17 || taken(m)) continue;
    out.push(b);
  }
  return out;
}

/* ============================ 그림 ============================ */
const DETAIL = process.argv.includes('detail');
const MAIN = !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);   // 이 파일을 직접 돌렸을 때만 그림을 남긴다(다른 스크립트가 자리표만 가져다 쓸 수 있게)
const P = a => a.map(p => `${r1(p[0])},${r1(p[1])}`).join(' ');
const shape = (z, extra = '') => z.circle ? `<circle cx="${z.circle[0]}" cy="${z.circle[1]}" r="${z.circle[2]}" ${extra}/>` : `<polygon points="${P(zonePts(z))}" ${extra}/>`;
const line = (pts, w, col, extra = '') => `<polyline points="${P(pts)}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
const ell = (e, extra) => `<ellipse cx="${e.x}" cy="${e.y}" rx="${e.rx}" ry="${e.ry}" transform="rotate(${e.rot || 0} ${e.x} ${e.y})" ${extra}/>`;
const dark = hex => { const v = parseInt(hex.slice(1), 16); return (0.299 * (v >> 16) + 0.587 * (v >> 8 & 255) + 0.114 * (v & 255)) < 140; };
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const ROAD = '#e6c98c', BLOCK = '#c49a55', S = 2.5, MX = -22, MY = -8, MW = 590, MH = 552, LEG = 590;
const W = Math.round(MW * S) + LEG, H = Math.round(MH * S);
let trees = ''; for (let i = 0; i < 46; i++) trees += `<circle cx="${(rnd() * 80).toFixed(1)}" cy="${(rnd() * 80).toFixed(1)}" r="${(3 + rnd() * 5).toFixed(1)}" fill="${rnd() < 0.5 ? '#2f7d32' : '#3b8f3a'}"/>`;



// 한 채짜리 터 안의 건물 자리(상세 지도)
const BLD = { 3: [sector(-39, -22, 96, 106), sector(-39, -31, 110, 119), sector(-25, -19.5, 108, 119)], 4: [sector(-11, -6.5, 60, 78)], 26: [sector(5, 16, 133, 146), sector(8, 13, 146, 165)], 27: [sector(6, 15.5, 181, 209)], 28: [sector(8, 15.5, 62, 81)], 35: [sector(20.3, 21.8, 330, 340)], 37: [sector(20.4, 22.6, 248, 258)] };

let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Malgun Gothic','맑은 고딕',sans-serif">
<defs>
<pattern id="trees" width="80" height="80" patternUnits="userSpaceOnUse"><rect width="80" height="80" fill="#6fb040"/>${trees}</pattern>
<clipPath id="wall"><circle cx="${C.x}" cy="${C.y}" r="${C.r - 2}"/></clipPath>
</defs>
<rect width="${W}" height="${H}" fill="#111"/>
<g transform="scale(${S}) translate(${-MX},${-MY})">
<rect x="${MX}" y="${MY}" width="${MW}" height="${MH}" fill="url(#trees)"/>`;

// 담 밖: 큰 강, 나라 숲, 죽음의 숲, 금렵구, 교정 시설
s += line([[-30, 160], [40, 108], [120, 58], [215, 18], [330, 0], [440, -12]], 16, '#9ccbe6');
s += line([[556, -12], [548, 120], [554, 250], [546, 330], [556, 548]], 15, '#9ccbe6');
s += `<polygon points="${P([[-22, -8], [150, -8], [96, 40], [40, 78], [-22, 120]])}" fill="#17521f" opacity="0.72"/>`;
s += `<polygon points="${P([[318, -8], [520, -8], [505, 20], [455, 44], [400, 28], [340, 32]])}" fill="#0f3d17" opacity="0.8"/>`;
s += `<ellipse cx="486" cy="505" rx="44" ry="26" fill="#2c6b2a" stroke="#333" stroke-width="1" stroke-dasharray="3 2"/>`;
s += `<ellipse cx="50" cy="462" rx="30" ry="19" fill="#9ccbe6"/><polygon points="50,448 61,467 50,475 39,467" fill="#8a8a8a" stroke="#333" stroke-width="0.8"/>${line([[61, 464], [80, 456]], 2, '#6b4a2a')}`;

// 담 안 바닥과 일반 블록
s += `<g clip-path="url(#wall)"><circle cx="${C.x}" cy="${C.y}" r="${C.r}" fill="${DETAIL ? ROAD : BLOCK}"/>`;
if (DETAIL) { const TAN = ['#c49a55', '#bf9550', '#c9a05b']; for (const b of townBlocks()) s += `<polygon points="${P(b)}" fill="${TAN[Math.floor(rnd() * 3)]}"/>`; }
else s += `<polygon points="${P(sector(-89, 89, 13, 56))}" fill="${ROAD}"/>`;
for (const g of GREEN) s += `<polygon points="${P(g)}" fill="url(#trees)"/>`;
s += `<polygon points="${P([[340, 20], [470, 20], [462, 62], [420, 68], [346, 66]])}" fill="#0f3d17" opacity="0.75"/>${line([[344, 67], [420, 69], [462, 63]], 1.4, '#222', 'stroke-dasharray="3 2"')}`;
// 구역
for (const z of ZONES) {
  const sub = DETAIL && zoneBlocks(z);
  if (sub) {
    s += shape(z, `fill="${ROAD}" stroke="${ROAD}" stroke-width="3"`);
    for (const b of sub) s += `<polygon points="${P(b)}" fill="${z.fill}"/>`;
  } else {
    s += shape(z, `fill="${z.fill}" stroke="${ROAD}" stroke-width="${z.n === 31 ? 6 : 2.2}"`);
    if (z.trees) s += shape(z, 'fill="url(#trees)" opacity="0.55"');
  }
  if (z.walled && DETAIL) s += shape(z, `fill="none" stroke="${z.walled}" stroke-width="1.5"`);   // 담으로 두른 구역
  if (!DETAIL) continue;
  for (const b of BLD[z.n] || []) s += `<polygon points="${P(b)}" fill="#000" opacity="0.3"/>`;
  if (z.n === 3) s += ell({ x: pol(-30, 76)[0], y: pol(-30, 76)[1], rx: 14, ry: 8, rot: -30 }, 'fill="#e3c98a" stroke="#fff" stroke-width="1"');   // 운동장
  if (z.n === 31) s += `<circle cx="${z.circle[0]}" cy="${z.circle[1]}" r="9.5" fill="#e3c98a" stroke="#b9687c" stroke-width="1"/>`;                 // 경기장 바닥
  if (z.n === 30) for (let r = 62; r < 120; r += 6) for (let a = 65.5; a < 87; a += 360 / (2 * Math.PI * r) * 5.5) { const p = pol(a, r); if (!inWall(p, 14)) continue; s += `<rect x="${p[0] - 1}" y="${p[1] - 1.3}" width="2" height="2.6" fill="#ddd"/>`; }   // 묘비
}
// 물
s += line(NAKA, 7, '#9ccbe6') + line(NE_STREAM, 5, '#9ccbe6') + line(BROOK, 3, '#9ccbe6');
s += ell(LAKE, 'fill="#8cc3e6" stroke="#5b9cc4" stroke-width="1"') + line(FEED, 4, '#9ccbe6') + line(PIER, 2.2, '#6b4a2a');
s += ell(ISLE, 'fill="#8cc3e6" stroke="#5b9cc4" stroke-width="1"') + ell({ ...ISLE, rx: 9, ry: 5.5 }, 'fill="#6fb040" stroke="#3b7a2a" stroke-width="0.8"');
for (const [x, y, rx, ry] of PONDS) s += `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#8cc3e6"/>`;
// 큰 바큇살 길(담까지) · 큰길 · 세로 큰길 · 둘레길 · 다리

for (const k of SPOKES) s += line([pol(k.a, k.r0 || 13), pol(k.a, k.r1 || reach(k.a))], SPOKE_W, ROAD);
s += line([[MAINROAD.x0, FAN.y], [MAINROAD.x1, FAN.y]], MAINROAD.w, ROAD);
for (const [x, y0, y1, w] of VROADS) s += line([[x, y0], [x, y1]], w, ROAD);
s += `<circle cx="${C.x}" cy="${C.y}" r="${RING.r}" fill="none" stroke="${ROAD}" stroke-width="${RING.w}"/><polygon points="${P(PLAZA)}" fill="${ROAD}"/>`;
s += `<circle cx="${FAN.x}" cy="${FAN.y}" r="${FORECOURT}" fill="${ROAD}"/>`;
for (const side of [-1, 1]) {   // 큰길 양쪽 가로수
  const y0 = FAN.y + side * ROADSIDE.off, y1 = y0 + side * ROADSIDE.w;
  s += `<rect x="${ROADSIDE.x0}" y="${Math.min(y0, y1)}" width="${ROADSIDE.x1 - ROADSIDE.x0}" height="${ROADSIDE.w}" fill="#6fb040"/>`;
  for (let x = ROADSIDE.x0 + 3; x < ROADSIDE.x1; x += ROADSIDE.step) s += `<circle cx="${r1(x)}" cy="${(y0 + y1) / 2}" r="2.1" fill="#2f7d32"/>`;
}
s += BRIDGES.map((b, i) => line(b, i < 2 ? 4.5 : 3.2, '#7a5230')).join('') + `</g>`;
// 담, 정문, 바위, 관저
s += `<circle cx="${C.x}" cy="${C.y}" r="${C.r}" fill="none" stroke="#111" stroke-width="4.5"/><rect x="519" y="259" width="12" height="22" fill="#b33" stroke="#111" stroke-width="1.2"/>`;
s += `<polygon points="${P(ROCK)}" fill="#cbb89a" stroke="#8a775c" stroke-width="1.5"/>`;
for (let i = 0; i < 7; i++) s += `<ellipse cx="49" cy="${232 + i * 12}" rx="5.5" ry="5" fill="#b09b7c" stroke="#7a6850" stroke-width="0.8"/>`;
s += `<circle cx="${FAN.x}" cy="${FAN.y}" r="12" fill="#ef9a1f" stroke="#8a4b00" stroke-width="1.5"/><circle cx="${FAN.x}" cy="${FAN.y}" r="6.5" fill="#ffc94d" stroke="#8a4b00" stroke-width="0.8"/>`;

// 번호
const tag = (n, x, y, fill = '#fff', size = 11) => `<text x="${x}" y="${y}" font-size="${size}" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="${fill}" stroke="${fill === '#fff' ? '#000' : '#fff'}" stroke-width="2.4" paint-order="stroke" stroke-linejoin="round">${n}</text>`;
const small = new Set([4, 11, 13, 14, 15, 16, 17, 18, 19, 23, 24, 25, 28, 29, 35, 36, 37, 40, 41]), big = new Set([7, 12, 32, 33]);
for (const z of ZONES) s += tag(z.n, z.at[0], z.at[1], dark(z.fill) ? '#fff' : '#111', small.has(z.n) ? 8 : big.has(z.n) ? 17 : 12);
s += tag(1, 22, 268, '#111', 13) + tag(2, FAN.x, FAN.y, '#111', 8.5) + tag(5, 20, 205, '#111', 9) + tag(8, 40, 30, '#fff', 15) + tag(34, LAKE.x, LAKE.y + 3, '#111', 8) + tag(38, ...pol(8.5, 405), '#111', 9) + tag(42, 540, 270, '#fff', 11) + tag(43, 50, 464, '#fff', 8);
for (const t of TRAIN) s += `<circle cx="${t.at[0]}" cy="${t.at[1]}" r="7.5" fill="#fff" stroke="#d2202a" stroke-width="2.2"/><text x="${t.at[0]}" y="${t.at[1]}" font-size="${t.id.length > 1 ? 7 : 8.5}" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="#b3121c">${t.id}</text>`;
// 축척
s += `<g transform="translate(20,522)"><rect x="-6" y="-13" width="150" height="26" rx="3" fill="#fff" opacity="0.85"/><path d="M0 4H80M0 0V8M40 1V7M80 0V8" stroke="#111" stroke-width="1.4" fill="none"/><text x="88" y="5" font-size="8.5" fill="#111" dominant-baseline="central">200m (담 반지름 600m)</text></g>`;
s += `</g>`;

// 범례
const LX = Math.round(MW * S) + 18; let ly = 46;
s += `<text x="${LX}" y="${ly}" font-size="26" font-weight="700" fill="#fff">${DETAIL ? '나뭇잎 마을 상세 지도(안)' : '나뭇잎 마을 새 배치도(안)'}</text>`; ly += 30;
s += `<text x="${LX}" y="${ly}" font-size="15" fill="#bbb">왼쪽 호카게 바위 · 오른쪽 정문 · 나루토가 호카게가 되기 전 시점</text>`; ly += 30;
const EXTRA = { 1: ['호카게 바위', '#cbb89a', '그대로'], 2: ['호카게 관저(집무실+살림)', '#ef9a1f', '그대로 · 지하 암부 본부는 나중'], 5: ['고문서 보관소(산 속)', '#cbb89a', '나중'], 8: ['나라 숲(담 밖)', '#17521f', '새로'], 34: ['화둔 호수와 부두', '#8cc3e6', '새로 · 우치하 구역 안, 강을 끌어들임'], 38: ['나카 강', '#9ccbe6', '새로 · 왼쪽이 상류, 오른쪽이 하류'], 42: ['정문', '#b33', '그대로'], 43: ['엄중 교정 시설(담 밖 섬)', '#8a8a8a', '나중'] };
const rows = [];
for (let n = 1; n <= 43; n++) { const z = ZONES.find(q => q.n === n); rows.push(z ? [n, z.name, z.fill, z.note] : [n, ...EXTRA[n]]); }
const colW = 286, RH = 25.5, half = Math.ceil(rows.length / 2);
rows.forEach((r, i) => {
  const x = LX + (i >= half ? colW : 0), y = ly + (i % half) * RH * 1.72;
  s += `<rect x="${x}" y="${y - 12}" width="22" height="18" fill="${r[2]}" stroke="#888" stroke-width="1"/><text x="${x + 30}" y="${y}" font-size="16.5" font-weight="700" fill="#fff" dominant-baseline="central">${r[0]}) ${r[1]}</text><text x="${x + 30}" y="${y + 19}" font-size="12.5" fill="#9fb0c0" dominant-baseline="central">${r[3]}</text>`;
});
ly += half * RH * 1.72 + 14;
s += `<text x="${LX}" y="${ly}" font-size="18" font-weight="700" fill="#ff8a8f">◎ 훈련장</text>`; ly += 26;
for (const t of TRAIN) { s += `<circle cx="${LX + 10}" cy="${ly - 1}" r="9" fill="#fff" stroke="#d2202a" stroke-width="2.4"/><text x="${LX + 10}" y="${ly - 1}" font-size="${t.id.length > 1 ? 9 : 11}" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="#b3121c">${t.id}</text><text x="${LX + 30}" y="${ly}" font-size="14.5" fill="#fff" dominant-baseline="central">${t.name}</text>`; ly += 25; }
ly += 14;
s += `<text x="${LX}" y="${ly}" font-size="14" fill="#bbb">넣지 않음: 센쥬 구역·센쥬 공원, 우즈마키 구역, 훗날의 나루토 집</text>`; ly += 22;
s += `<text x="${LX}" y="${ly}" font-size="14" fill="#bbb">${DETAIL ? '갈색 칸은 일반 살림집 블록 · 칸 사이의 밝은 띠가 길' : '갈색 바탕은 일반 살림집 거리 · 밝은 줄은 관저에서 뻗는 큰 바큇살 길'}</text>`;
s += `</svg>`;

const dir = path.dirname(fileURLToPath(import.meta.url)), name = DETAIL ? 'village-detail.svg' : 'village-plan.svg';
if (MAIN) { fs.writeFileSync(path.join(dir, name), s); console.log(name, W, H); }
