// 마을 배치 — 모든 건물·길이 함께 보는 자리표. +x 동쪽, +z 남쪽, y 위. 마을 바닥은 y=0.
// 호카게 바위는 북쪽 절벽(z=-150, 남쪽을 봄), 그 앞에 호카게 관저. 관저에서 길이 부채꼴로 퍼져 남쪽 끝 정문까지 이어진다.
// 구역·길·물길의 자리는 배치도(plan/plan.mjs)에서 뽑은 plan-data.js 가 원본이다.
import { PLAN } from './plan-data.js';

// 뿌리 본거지(땅속): 걷는 판정에서 땅을 깊이 파내는 범위 [x0, x1, z0, z1]와, 땅 그림에 뚫는 계단 입구(3m 칸에 맞춘다)
export const ROOT = { x0: -200, x1: -110, z0: -147, z1: -101, hole: [-141, -129, -138, -120] };
export const CLIFF = { z: -150, k: 1.8, top: 108, half: 234, fall: 100 };   // 절벽 앞면 z, 바위 배율(처음 빚은 크기의 몇 배), 꼭대기 높이, 평평한 반폭, 양옆 비탈 폭
export const STAIR = { x0: 146, x1: 170 };   // 바위 꼭대기로 오르는 계단이 붙는 자리(x 범위)
export const WALL = { cx: PLAN.wall.cx, cz: PLAN.wall.cz, r: PLAN.wall.r, gateZ: PLAN.wall.cz + PLAN.wall.r };   // 마을을 두른 담과 남쪽 정문

// 새 배치로 옮긴 건물의 자리. 건물은 옛 집터 좌표 그대로 짓고, 그 가운데(ox, oz)를 새 자리(x, z)에 놓아 ry만큼 돌린다. zone은 배치도의 구역 번호.
// w, d는 집터의 크기(건물 좌표의 x, z 방향) — 그 자리에는 풀·나무를 심지 않는다.
export const SITE = {
  hokage: { x: 0, z: -90, ry: 0, ox: 0, oz: -104 },                                           // 호카게 관저 — 지은 자리(0,-104)에서 앞(남쪽)으로 14m. 뒤 담과 절벽 사이에 작은 숲이 들어선다
  academy: { zone: 3, x: 60, z: 120, ry: -Math.PI / 2, ox: 68, oz: -94, w: 56, d: 60 },      // 닌자 아카데미 — 아카데미 터의 큰길 쪽. 운동장과 정문이 큰길(서쪽)을 본다
  swing: { x: 60, z: 120, ry: -Math.PI / 2, ox: 68, oz: -94 },                               // 아카데미 마당의 그네 나무(아카데미와 같은 좌표)
  naruto: { zone: 11, x: 35.5, z: 298, ry: -1.527, ox: -51, oz: -18.5, w: 26, d: 27 },      // 나루토의 집 — 큰길 동쪽 블록, 큰길(서쪽)을 보고 블록 결을 따라 살짝 비스듬히
  ino: { zone: 15, x: 23.5, z: 406, ry: Math.PI, ox: -17.5, oz: 48, w: 21, d: 20 },         // 야마나카 꽃집 — 큰길 동쪽, 큰길을 본다
  ichiraku: { zone: 13, x: 20, z: 476, ry: 0, ox: 14.5, oz: 16, w: 15, d: 16 },             // 이치라쿠 라멘 — 큰길 동쪽, 카운터가 큰길로 열린다
  sakura: { zone: 24, x: -34.5, z: 716, ry: Math.PI / 2, ox: 39, oz: 70.5, w: 22, d: 25 },  // 사쿠라의 집 — 큰길 서쪽, 큰길을 본다
  inoichi: { x: 318.0, z: 418.6, ry: 0, ox: 8, oz: 7.8, w: 24, d: 23.5 },                 // 야마나카 본가(이노와 어머니가 사는 집) — 야마나카 구역 남서쪽 모퉁이, 대문이 꽃집으로 가는 남쪽 큰길을 본다
  hyuga: { x: -210.3714, z: 142.3571, ry: 2.434822, ox: 0, oz: 0 },                          // 휴우가 종가의 본채와 별채 — 저택 터(휴우가 구역 블록 3)의 한가운데가 원점, 터의 담·도장은 zones.js가 세운다
  sarutobi: { x: 123.64, z: -14.18, ry: -2.1991, ox: 8, oz: 7.8, w: 24, d: 23.5 },          // 사루토비 본가(히루젠·코노하마루의 집) — 사루토비 구역의 관저 쪽 길가, 대문이 관저를 본다
  inuzuka: { x: 239.2, z: 736.6, ry: -Math.PI / 2, ox: 8, oz: 7.8, w: 24, d: 23.5 },          // 이누즈카 본가(츠메·하나·키바의 집) — 이누즈카 구역 가운데 골목가, 대문이 그 골목(서쪽)을 본다
  aburame: { x: -526.9, z: 388, ry: Math.PI / 2, ox: 8, oz: 7.8, w: 24, d: 23.5 },            // 아부라메 본가(시비·시노의 집) — 아부라메 구역 한가운데, 대문이 강 쪽(동쪽)을 본다
  nara: { x: 373.4, z: 167.3, ry: -2.1991, ox: 8, oz: 7.8, w: 24, d: 23.5 },                 // 나라 본가(시카마루와 어머니 요시노의 집) — 나라 구역 가운데 길 끝 블록, 대문이 그 길(관저 쪽)을 본다
  choji: { x: 228.0, z: 209.5, ry: -2.5128, ox: 8, oz: 7.8, w: 24, d: 23.5 },              // 쵸지의 집 — 아키미치 구역, 회관 앞 블록. 블록의 관저 쪽 길가에 붙어 대문이 그 길을 본다
  sasuke: { x: -313, z: 555, ry: -0.316, ox: 158, oz: -4, w: 19, d: 32 },                   // 사스케의 집 — 우치하 구역, 우치하 구역의 호수 부두 옆 블록. 대문이 호수 쪽 길을 본다
  shrine: { zone: 35, x: -299.7, z: 676.8, ry: -1.962, ox: 157.25, oz: -33, w: 21, d: 17 }, // 남가 신사 — 우치하 구역 안 신사 터. 도리이가 구역 안쪽을 본다
};

// 담·집·시설까지 다 채운 구역의 번호(빈 터 표시인 구역 빛깔·팻말을 끈다)
export const DONE_ZONES = [33, 36, 37, 7, 9, 10, 32, 6, 21, 22, 40, 41, 4, 28, 29, 30, 26, 27, 12, 14, 18, 19, 16, 17, 23, 25, 20, 31, 39];

// ── 아래는 옛 배치(담 반지름 185m 시절)의 집터·길. 새 배치로 옮길 때까지 건물 파일들이 읽으므로 남겨 둔다.
export const LOT = {
  hokage:   { x0: -38, x1: 38, z0: -128, z1: -60, cx: 0, cz: -104, front: 's' },   // 호카게 관저(둥근 본채 중심 cx,cz) — 새 배치에서도 이 자리
  academy:  { x0: 40, x1: 96, z0: -124, z1: -64, front: 's' },                     // 닌자 아카데미(남쪽이 운동장·정문)
  naruto:   { x0: -64, x1: -38, z0: -32, z1: -5, front: 's' },                     // 나루토의 집(공동주택)
  ino:      { x0: -28, x1: -7, z0: 38, z1: 58, front: 'e' },                       // 야마나카 꽃집 — 큰길 서쪽, 동쪽을 봄
  sakura:   { x0: 28, x1: 50, z0: 58, z1: 83, front: 's' },                        // 사쿠라의 집
  ichiraku: { x0: 7, x1: 22, z0: 8, z1: 24, front: 'w' },                          // 이치라쿠 라멘 — 큰길 동쪽, 서쪽을 봄
};
// 흙길: [x0, z0, x1, z1]
export const ROADS = [
  [-6, -52, 6, 182],        // 큰길(정문 → 관저 앞 광장)
  [-112, -70, 112, -50],    // 관저 앞 광장길(동서)
  [-118, -4, -6, 4],        // 서쪽 골목(나루토 집 앞)
  [6, -8, 118, 0],          // 동쪽 골목
  [6, 84, 118, 92],         // 동남 골목(사쿠라 집 앞)
  [-118, 70, -6, 78],       // 서남 골목
  [-112, -50, -104, 78],    // 서쪽 세로길
  [104, -50, 112, 92],      // 동쪽 세로길
];
// 우치하 일족의 구역(옛 자리): 담으로 두른 안쪽에 거리·사스케의 집·남가 신사·선착장.
export const UCHIHA = {
  x0: 119, x1: 169, z0: -44, z1: 36, gateZ: -4,
  dirt: [[112, -8, 146, 0], [142, -42, 146.5, 34], [146, -7, 153, -1], [120.5, -20.5, 142, -8], [120.5, 0, 142, 12.5], [146, -36, 154, -30], [156, 12, 160, 18]],   // 흙바닥(길·마당)
};
export const inUchiha = (x, z, pad = 0) => x > UCHIHA.x0 - pad && x < UCHIHA.x1 + pad && z > UCHIHA.z0 - pad && z < UCHIHA.z1 + pad;

// 나라 숲(담 밖 북동쪽): 나라 구역 뒤 담에 낸 작은 문에서 오솔길이 사슴 터를 지나 숲 깊은 곳까지 이어진다.
// 각도는 담의 한가운데에서 잰다(0 = 동, 음수 = 북쪽). a = 문이 난 방향, a0~a1 = 숲이 퍼진 범위, r1 = 숲 끝(걸어갈 수 있는 끝), xMax = 촘촘한 땅이 깔린 동쪽 끝
export const NARA_FOREST = (() => {
  const P = (r, a) => [WALL.cx + Math.cos(a) * r, WALL.cz + Math.sin(a) * r];
  return {
    a: -0.44, a0: -0.72, a1: -0.26, r1: WALL.r + 205, xMax: 712, gate: P(WALL.r, -0.44),
    glade: [...P(WALL.r + 106, -0.47), 26],     // 사슴 터 [x, z, 반지름]
    grave: [...P(WALL.r + 165, -0.6), 10],      // 숲 깊은 곳의 무덤 자리
    trail: [[WALL.r - 22, -0.44], [WALL.r, -0.44], [WALL.r + 40, -0.445], [WALL.r + 78, -0.46], [WALL.r + 104, -0.47], [WALL.r + 118, -0.5], [WALL.r + 136, -0.55], [WALL.r + 153, -0.585], [WALL.r + 162, -0.598]].map(([r, a]) => P(r, a)),
  };
})();
export const inNaraForest = (x, z, pad = 0) => {
  const F = NARA_FOREST, dx = x - WALL.cx, dz = z - WALL.cz, d = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
  return d > WALL.r && d < F.r1 + pad && a > F.a0 - pad / 700 && a < F.a1 + pad / 700 && x < F.xMax + pad;
};
// 오솔길·사슴 터·무덤 자리에서 얼마나 떨어져 있나(m). 나무와 풀을 비울 때 쓴다
export const naraTrailDist = (x, z) => {
  const F = NARA_FOREST; let d = Math.min(Math.hypot(x - F.glade[0], z - F.glade[1]) - F.glade[2], Math.hypot(x - F.grave[0], z - F.grave[1]) - F.grave[2]);
  for (let i = 0; i < F.trail.length - 1; i++) { const a = F.trail[i], b = F.trail[i + 1], vx = b[0] - a[0], vz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[1]) * vz) / (vx * vx + vz * vz))); d = Math.min(d, Math.hypot(x - a[0] - vx * t, z - a[1] - vz * t)); }
  return d;
};

// 죽음의 숲(제44 훈련장, 담 밖 동남쪽): 철망을 두른 둥근 숲. 담의 작은 문에서 오솔길이 철망의 12번 문을 지나 한가운데의 탑까지 이어지고, 탑 동쪽으로 냇물이 흐른다.
// a = 담의 문이 난 방향(담 한가운데에서 잰 각도), c = 숲의 한가운데, rf = 철망의 반지름, tower = 탑 터의 반지름
export const DEATH = (() => {
  const a = 0.42, u = [Math.cos(a), Math.sin(a)], t = [-u[1], u[0]], rf = 160, c = [WALL.cx + u[0] * (WALL.r + 185), WALL.cz + u[1] * (WALL.r + 185)];
  const L = (du, dt) => [c[0] + u[0] * du + t[0] * dt, c[1] + u[1] * du + t[1] * dt];   // 숲 한가운데에서 담 반대쪽으로 du, 옆으로 dt
  return {
    a, u, t, c, rf, tower: 27, gate: [WALL.cx + u[0] * WALL.r, WALL.cz + u[1] * WALL.r],
    trail: [L(-205, 0), L(-185, 0), L(-160, 0), L(-124, 16), L(-84, 24), L(-50, 9), L(-25, 0)],               // 담 안쪽 → 담의 문 → 철망의 문 → 탑
    side: [L(8, -25), L(30, -44), L(52, -52)],                                                                  // 탑에서 냇가로
    river: { pts: [L(196, -62), L(150, -40), L(104, -58), L(62, -64), L(18, -82), L(-40, -150), L(-56, -178)], w: 7 },
    snake: L(66, -42), centipede: L(-96, 46),
  };
})();
export const inDeathForest = (x, z, pad = 0) => Math.hypot(x - DEATH.c[0], z - DEATH.c[1]) < DEATH.rf + pad;
const segD = (x, z, pts) => { let d = 1e9; for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1], vx = b[0] - a[0], vz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[1]) * vz) / (vx * vx + vz * vz))); d = Math.min(d, Math.hypot(x - a[0] - vx * t, z - a[1] - vz * t)); } return d; };
// 오솔길에서 얼마나 떨어져 있나(m), 냇물 한가운데에서 얼마나 떨어져 있나(m)
export const deathTrailDist = (x, z) => (Math.abs(x - DEATH.c[0]) > 260 || Math.abs(z - DEATH.c[1]) > 260 ? 1e9 : Math.min(segD(x, z, DEATH.trail), segD(x, z, DEATH.side)));
export const deathRiverDist = (x, z) => (Math.abs(x - DEATH.c[0]) > 260 || Math.abs(z - DEATH.c[1]) > 260 ? 1e9 : segD(x, z, DEATH.river.pts));

// 담 밖의 나머지: 엄중 교정 시설(서북쪽 호수 가운데 섬), 정문 밖을 가로지르는 큰 강.
// a = 담의 작은 문이 난 방향(담 한가운데에서 잰 각도), c = 한가운데, trail = 담 안쪽에서 거기까지의 오솔길
export const OUTER = (() => {
  const R0 = WALL.r, P = (a, r, t = 0) => [WALL.cx + Math.cos(a) * r - Math.sin(a) * t, WALL.cz + Math.sin(a) * r + Math.cos(a) * t];
  const ell = (c, ax, az, n) => Array.from({ length: n }, (_, i) => [c[0] + Math.cos(i / n * Math.PI * 2) * ax, c[1] + Math.sin(i / n * Math.PI * 2) * az]);
  const ja = -2.256, jc = P(ja, R0 + 150);
  return {
    jail: { a: ja, c: jc, ax: 50, az: 44, isle: 19, lake: ell(jc, 50, 44, 40), land: ell(jc, 19, 19, 28), trail: [P(ja, R0 - 22), P(ja, R0), P(ja, R0 + 36, -7), P(ja, R0 + 72, 5), P(ja, R0 + 96)] },
    river: { pts: [[748, 1101], [705, 1098], [375, 1079], [50, 1093], [-150, 1074], [-695, 1098], [-748, 1102]], w: 22 },
  };
})();
export const jailK = (x, z) => Math.hypot((x - OUTER.jail.c[0]) / OUTER.jail.ax, (z - OUTER.jail.c[1]) / OUTER.jail.az);   // 호수 가장자리가 1
export const outTrailDist = (x, z) => {
  let d = 1e9; for (const T of [OUTER.jail]) if (Math.abs(x - T.c[0]) < 260 && Math.abs(z - T.c[1]) < 260) d = Math.min(d, segD(x, z, T.trail));
  return d;
};
export const outRiverDist = (x, z) => (z < 1040 || z > 1135 ? 1e9 : segD(x, z, OUTER.river.pts));
// 담 밖에서 걸어 다닐 수 있는 자리(죽음의 숲·나라 숲은 따로 본다): 교정 시설의 호수 둘레, 그리로 가는 오솔길, 정문 밖 길과 다리
export const outerFree = (x, z) => jailK(x, z) < 1.22 || outTrailDist(x, z) < 6 || (Math.abs(x) < 9 && z > WALL.gateZ && z < WALL.gateZ + 96);
