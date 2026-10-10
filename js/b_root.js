// 뿌리(根)의 본거지 — 호카게 바위 절벽 밑동, 묘지 북쪽 구석의 낡은 돌 창고 아래에 숨은 깊은 지하 요새.
// 땅 위에는 금줄과 봉인 부적을 두른 돌 창고 하나뿐이고, 그 안의 계단이 땅속 60m까지 꺾여 내려간다.
// 한가운데는 깊고 둥근 수직굴이다. 층마다 굴 벽을 따라 고리 복도가 돌고, 굴 한가운데를 다리가 층층이 엇갈려 건넌다(본편의 그 모습).
//   지하 12m  대기소·장비실(가면·칼·겉옷)      지하 24m  연무장
//   지하 36m  기밀자료 보관소, 단조의 집무실      지하 48m  생체 실험실(오로치마루와 손잡은 흔적)      지하 60m  굴 바닥
// ※ 본거지가 "마을 땅속 깊은 곳"이고 수직굴에 다리가 엇갈린다는 것, 갖춘 시설(연무장·자료 보관소·집무실·실험실)은 본편과 전해 받은 설정을 따랐다.
//    마을의 어느 자리인지, 입구의 생김새, 방의 배치와 가구는 지어낸 것이다.
import * as THREE from '../vendor/three.module.js';
import { Builder, wall, stairs, tube, mat4, rng, addCollider } from './build.js';
import { mat, M, weatherize } from './materials.js';
import { gableRoof, roundWall, railing, roundRailing, signBoard, lantern, beamBetween } from './arch.js';
import { ROOT } from './layout.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const PI = Math.PI, TAU = PI * 2;
const CX = -160, CZ = -124, R = 15, RG = 12;              // 수직굴의 중심과 반지름, 고리 복도의 안쪽 반지름
const LV = [-12, -24, -36, -48, -60];                      // 층 바닥(마지막은 굴 바닥)
const SX0 = -141, SXM = -138, SX1 = -135, SZN = -129, SZS = -120;   // 계단실: 서쪽 줄·동쪽 줄, 계단의 북쪽 끝·남쪽 끝
// 지하 도면(지도가 읽는다): 층마다의 방 [이름, x0, z0, x1, z1]과 다리의 방향
export const ROOT_PLAN = {
  box: [ROOT.x0, ROOT.x1, ROOT.z0, ROOT.z1], cx: -155.5, cz: -124, half: 50, shaft: [CX, CZ, R, RG], stair: [SX0, SZN - 2.5, SX1, SZS + 2.5],
  levels: [
    { y: LV[0], name: '지하 12m', bridge: 'x', rooms: [['대기소 · 장비실', -199, -134, -176.6, -114]] },
    { y: LV[1], name: '지하 24m', bridge: 'z', rooms: [['연무장', -199, -146, -176.6, -102]] },
    { y: LV[2], name: '지하 36m', bridge: 'x', rooms: [['기밀자료 보관소', -199, -140, -176.6, -108], ['단조의 집무실', -133.6, -128, -112, -110]] },
    { y: LV[3], name: '지하 48m', bridge: 'z', rooms: [['생체 실험실', -199, -142, -176.6, -106]] },
    { y: LV[4], name: '지하 60m · 굴 바닥', bridge: null, rooms: [] },
  ],
};

function canvasMat(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return weatherize(new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 }));
}

export async function build(scene, ctx) {
  const B = new Builder(), Rn = rng(8841), glows = [], lights = [];
  const ROCK = mat('stone', 0x555a63), ROCKD = mat('stone', 0x3d4148), SLAB = mat('pave', 0x6a6e76), IRON = M.iron, RUST = mat('metal', 0x6a4a3a, { rough: 0.7 });
  const MAT2 = mat('plain', 0xf0a252, { rough: 0.95 }), MAT3 = mat('plain', 0xdc8e42, { rough: 0.95 }), OLD = mat('stone', 0x9a948a), ROOFT = mat('tile', 0x4c5158), PAPER = mat('plain', 0xeee6cf), INK = mat('plain', 0x1b1714), REDP = mat('plain', 0xa52a22);
  const MASK = mat('plain', 0xf2efe8, { rough: 0.35 }), CLOAK = mat('plain', 0x1d1f26), VEST = mat('plain', 0x8a8f96), STRAW = mat('wood', 0xcdb06a), ROPE = mat('plain', 0xb89a62, { rough: 0.95 });
  const LIQ = mat('glow', 0x7fe6a8, { power: 0.9 }), LIQP = mat('glow', 0xb48ae0, { power: 0.7 }), FLESH = mat('plain', 0x4a5a48), SNAKE = mat('plain', 0xe9e6d8, { rough: 0.5 }), PURPLE = mat('plain', 0x6a3f8a, { rough: 0.9 });
  const GOLD = mat('plain', 0xb9974a, { rough: 0.5 }), CUSH = mat('plain', 0x4a2f5a), LAMPM = mat('glow', 0xffd9a0, { power: 1.3 });
  // 초롱. up = 천장까지 남은 높이(초롱 한가운데에서 잰다) — 그만큼 줄을 늘여 천장에 단다. wallZ를 주면 그 벽에서 뻗은 쇠 팔에 건다
  const lamp = (x, y, z, s = 1.3, power = 16, far = 20, up = 0.6, wallZ = null) => {
    lantern(B, x, y, z, { r: 0.26, h: 0.46, color: 0xf0dcae }); glows.push([x, y, z, s]); lights.push([x, y - 0.3, z, power, far]);
    if (wallZ === null) B.box(IRON, x - 0.012, y + 0.4, z - 0.012, x + 0.012, y + up + 0.03, z + 0.012, false);
    else { B.box(IRON, x - 0.02, y + 0.43, Math.min(z, wallZ) - 0.02, x + 0.02, y + 0.47, Math.max(z, wallZ) + 0.02, false); B.box(IRON, x - 0.07, y + 0.2, wallZ - 0.03, x + 0.07, y + 0.6, wallZ + 0.03, false); B.box(IRON, x - 0.012, y + 0.25, z - 0.012, x + 0.012, y + 0.45, z + 0.012, false); }
  };
  const strip = (x0, y, z0, x1, z1) => B.box(LAMPM, x0, y - 0.08, z0, x1, y, z1, false);       // 천장에 붙인 긴 등

  OLD.shadowSide = THREE.DoubleSide;   // 헛간 벽은 바깥 면으로도 그림자를 드리운다(안쪽 면만 쓰면 벽 밑동 바로 옆 바닥으로 볕이 샌다)
  /* ---------- 땅 위: 낡은 돌 창고 ---------- */
  // 본거지 위의 땅은 걷는 판정에서 깊이 파여 있다(layout.ROOT, village.terrainH). 땅 위를 걷는 사람은 이 덮개 판을 딛는다(계단 입구만 뚫려 있다)
  const H = ROOT.hole;
  addCollider(ROOT.x0, -0.5, ROOT.z0, H[0], 0, ROOT.z1); addCollider(H[2], -0.5, ROOT.z0, ROOT.x1, 0, ROOT.z1);
  addCollider(H[0], -0.5, ROOT.z0, H[2], 0, H[1]); addCollider(H[0], -0.5, H[3], H[2], 0, ROOT.z1);
  { const x0 = -143.6, x1 = -132.4, z0 = -133.4, z1 = -114.6, hh = 3.6;
    wall(B, OLD, 'x', z0 - 0.4, z0, x0 - 0.4, x1 + 0.4, -0.8, hh); wall(B, OLD, 'z', x0 - 0.4, x0, z0, z1, -0.8, hh); wall(B, OLD, 'z', x1, x1 + 0.4, z0, z1, -0.8, hh);
    B.box(OLD, x0 - 0.4, -0.8, z1, x1 + 0.4, -0.02, z1 + 0.4, false);
    wall(B, OLD, 'x', z1, z1 + 0.4, x0 - 0.4, x1 + 0.4, 0, hh, [{ u0: -138.9, u1: -137.1, ys: [[0, 2.5]] }]);
    for (const x of [-138.95, -137.05]) B.box(M.beam, x - 0.12, 0, z1 - 0.06, x + 0.12, 2.62, z1 + 0.46, false);
    B.box(M.beam, -139.1, 2.46, z1 - 0.06, -136.9, 2.74, z1 + 0.46, false);   // 윗틀 밑면은 벽 구멍의 윗면(2.5)보다 낮춘다(한 높이로 겹치면 깜빡인다)
    B.box(M.beam, x0 - 0.4, hh, z0 - 0.4, x1 + 0.4, hh + 0.2, z1 + 0.4);
    gableRoof(B, ROOFT, x0 - 0.4, z0 - 0.4, x1 + 0.4, z1 + 0.4, hh + 0.2, 2.2, { ridge: 'z', over: 0.7, overGable: 0.6, gable: OLD });
    // 겉은 묘지기의 헛간일 뿐이다: 문 옆에 기대 놓은 빗자루와 물통
    for (const [x, a] of [[-140.2, 0.12], [-140.6, -0.08]]) { B.geo(M.beamLight, new THREE.CylinderGeometry(0.02, 0.02, 1.7, 6), mat4(x, 0.85, z1 + 0.62, a, 0, 0)); B.geo(STRAW, new THREE.ConeGeometry(0.16, 0.42, 8), mat4(x, 0.2, z1 + 0.72 - a, 0, 0, 0)); }
    B.put(M.beamLight, new THREE.CylinderGeometry(0.2, 0.17, 0.34, 12), -135.6, 0.17, z1 + 0.75); B.geo(M.beam, new THREE.TorusGeometry(0.2, 0.012, 5, 14, PI), mat4(-135.6, 0.34, z1 + 0.75));
    // 안: 계단 입구를 가리던 궤짝들, 옆으로 밀어 놓은 돌 뚜껑, 입구 네 귀의 말뚝과 봉인 줄
    for (const [x, z, s] of [[-134.2, -117.2, 1.1], [-134.3, -118.6, 0.9], [-134.1, -117.3, 0.7], [-142.4, -116.4, 1.0], [-142.3, -117.6, 0.8]]) { const y = s === 0.7 ? 1.1 : 0; B.box(M.beamLight, x - s / 2, y, z - s / 2, x + s / 2, y + s, z + s / 2); B.box(M.beam, x - s / 2 - 0.03, y + s * 0.45, z - s / 2 - 0.03, x + s / 2 + 0.03, y + s * 0.55, z + s / 2 + 0.03, false); }
    // 결계(눈속임): 계단 입구는 거적 석 장으로 덮여 있다. 위에서는 그냥 바닥에 깐 거적으로 보이지만 막는 것이 없어 디디면 그대로 빠져 내려간다(밑에서 올려다보면 보이지 않는다)
    for (let i = 0; i < 3; i++) { const g = new THREE.PlaneGeometry(3.3, 3.2, 1, 1); g.rotateX(-PI / 2); B.geo(i % 2 ? MAT3 : MAT2, g, mat4((H[0] + H[2]) / 2 + (i - 1) * 0.06, 0.03 + i * 0.004, H[3] - 1.5 - i * 3.0, 0, (i - 1) * 0.03, 0), [1.6, 1.6]); }
    // 헛간 살림: 벽에 기대 세운 나무 솔도파(무덤 푯말) 다발, 삽과 괭이, 안쪽 벽 구석의 낡은 부적 한 장(눈여겨봐야 보인다)
    for (let i = 0; i < 7; i++) { const hh = 2.0 + (i % 3) * 0.15; B.geo(M.beamLight, new THREE.BoxGeometry(0.03, hh, 0.09), mat4(-132.43 - Math.sin(0.16) * hh / 2 - (i % 2) * 0.035, Math.cos(0.16) * hh / 2, -127 + i * 0.13, 0, 0, -0.16)); }
    for (const [z, head] of [[-121.5, 0], [-121.1, 1]]) { const L = 1.5, a = 0.2, tx = -132.43, bx = tx - Math.sin(a) * L, by = 0.3;   // 자루: 위 끝은 벽에, 아래 끝(날)은 바닥에
      B.geo(M.beamLight, new THREE.CylinderGeometry(0.02, 0.02, L, 6), mat4((tx + bx) / 2, by + Math.cos(a) * L / 2, z, 0, 0, -a));
      if (head) B.geo(IRON, new THREE.BoxGeometry(0.035, 0.3, 0.11), mat4(bx - 0.02, by - 0.13, z, 0, 0, -a)); else B.geo(IRON, new THREE.BoxGeometry(0.02, 0.32, 0.2), mat4(bx - 0.03, by - 0.14, z, 0, 0, -a)); }
    signBoard(B, '封', -142.9, 2.6, z0 + 0.02, 0, 0.14, 0.42, { both: false, depth: 0.008, bg: '#cfc4a4', color: '#6a1c14', vertical: true });
  }

  // 볕 가리개: 땅은 그림자를 드리우지 않아서 땅속까지 볕이 비쳐 든다. 땅 바로 밑에 넓은 판을 깔아 본거지 전체를 그늘에 둔다
  // (해가 비스듬하니 해 쪽인 동쪽·남쪽으로 넉넉히 넓힌다. 계단실 자리는 비운다 — 거기는 계단실의 천장이 가린다)
  { const x0 = ROOT.x0 - 12, x1 = ROOT.x1 + 80, z0 = ROOT.z0 - 12, z1 = ROOT.z1 + 80, ax = SX0 - 0.5, bx = SX1 + 0.5, az = SZN - 2.9, bz = SZS + 2.9;
    for (const [a, b, c, d] of [[x0, z0, ax, z1], [bx, z0, x1, z1], [ax, z0, bx, az], [ax, bz, bx, z1]]) B.box(ROCKD, a, -2.7, b, c, -2.3, d, false); }

  /* ---------- 계단실: 두 줄의 계단이 꺾이며 60m를 내려간다 ---------- */
  { const yb = LV[4] - 0.4;
    const up = LV.slice().reverse();                                                                   // 구멍의 높이는 아래에서 위로 적는다
    wall(B, ROCK, 'z', SX0 - 0.5, SX0, SZN - 2.9, SZS + 2.9, yb, -0.03, [{ u0: SZS + 0.15, u1: SZS + 2.35, ys: up.map(y => [y, y + 2.7]) }]);
    wall(B, ROCK, 'z', SX1, SX1 + 0.5, SZN - 2.9, SZS + 2.9, yb, -0.03, [{ u0: SZS + 0.15, u1: SZS + 2.35, ys: [[LV[2], LV[2] + 2.7]] }]);
    wall(B, ROCK, 'x', SZN - 2.9, SZN - 2.5, SX0, SX1, yb, -0.03); wall(B, ROCK, 'x', SZS + 2.5, SZS + 2.9, SX0, SX1, yb, -0.03);
    wall(B, ROCKD, 'z', SXM - 0.12, SXM + 0.12, SZN, SZS, yb, -1.2);                                   // 두 줄 사이의 벽
    B.box(ROCK, SXM - 0.12, -1.2, SZN, SXM + 0.12, -0.03, SZS, false);
    B.box(SLAB, SX0, yb - 0.2, SZN - 2.5, SX1, LV[4], SZS);                                            // 맨 밑바닥(서쪽 줄 끝은 막다른 골)
    for (const [x, z, sz] of [[SX0 + 0.8, SZN + 1.2, 1.0], [SX0 + 1.9, SZN + 1.0, 0.8], [SX0 + 0.9, SZN + 2.4, 0.7]]) B.box(M.beamLight, x - sz / 2, LV[4], z - sz / 2, x + sz / 2, LV[4] + sz, z + sz / 2);
    const TR = (SZS - SZN) / 29;                                                                       // 한 줄 서른 단(6m)
    for (let k = 0; k < 5; k++) {
      const top = k === 0 ? 0 : LV[k - 1];
      stairs(B, SLAB, 'z', SZS, -1, top - 6, top, SX0, SXM - 0.12, TR, 0.4);                           // 서쪽 줄: 북쪽으로 내려간다
      B.box(SLAB, SX0, top - 6.4, SZN - 2.5, SX1, top - 6, SZN);                                         // 북쪽 층계참
      stairs(B, SLAB, 'z', SZN, 1, top - 12, top - 6, SXM + 0.12, SX1, TR, 0.4);                       // 동쪽 줄: 남쪽으로 내려간다
      B.box(SLAB, SX0, top - 12.4, SZS, SX1, top - 12, SZS + 2.5);                                       // 남쪽 층계참(층 바닥)
      strip(SXM - 0.5, top - 1.0, SZN - 2.45, SXM + 0.5, SZN - 2.3); glows.push([SXM, top - 1.04, SZN - 2.3, 0.9]);   // 빛무리는 막대 등 자리에
      lamp(SXM, top - 12 + 2.6, SZS + 2.2, 1.0, 9, 12, 0, SZS + 2.5);                                    // 남쪽 벽의 쇠 팔에 건 초롱
      signBoard(B, ['一', '二', '三', '四', '底'][k], SX0 + 0.02, top - 12 + 3.1, SZS + 1.25, PI / 2, 0.5, 0.5, { both: false, bg: '#2a2c31', color: '#c9b98a', depth: 0.03 });
    }
    // 땅 밑에서 올려다보면 땅은 보이지 않는다(한쪽 면만 그린다): 계단 입구를 뺀 자리에 천장을 댄다
    B.box(ROCKD, SX0, -0.5, SZN - 2.5, SX1, -0.03, SZN, false); B.box(ROCKD, SXM + 0.12, -0.5, SZN, SX1, -0.03, SZS + 2.5, false); B.box(ROCKD, SX0, -0.5, SZS, SXM + 0.12, -0.03, SZS + 2.5, false);
  }

  /* ---------- 수직굴 ---------- */
  const galA = Math.atan2(SZS + 1.25 - CZ, Math.sqrt(R * R - (SZS + 1.25 - CZ) ** 2));       // 계단실에서 오는 통로가 굴 벽을 뚫는 각도
  { const up = LV.slice().reverse();
    // 굴 벽의 구멍: 계단실에서 오는 통로(모든 층)와 서쪽 방으로 가는 문(굴 바닥 빼고). 높이는 아래에서 위로 적는다
    const merged = [{ a0: galA - 0.092, a1: galA + 0.092, ys: up.map(y => [y, y + 2.7]) }, { a0: PI - 0.11, a1: PI + 0.11, ys: up.slice(1).map(y => [y, y + 3.0]) }];
    roundWall(B, ROCK, CX, CZ, R, R + 1.0, LV[4] - 0.4, -3.2, merged, { seg: 96 });
    // 천장과 바닥
    { const g = new THREE.CircleGeometry(R + 0.2, 64); g.rotateX(PI / 2); B.geo(ROCKD, g, mat4(CX, -3.2, CZ), [10, 10]); }
    { const g = new THREE.CircleGeometry(R + 0.2, 64); g.rotateX(-PI / 2); B.geo(ROCKD, g, mat4(CX, LV[4], CZ), [10, 10]); }
    for (let x = -R; x < R; x += 1) { const xm = Math.max(Math.abs(x), Math.abs(x + 1)), hz = Math.sqrt(Math.max(0, (R + 0.9) ** 2 - Math.min(Math.abs(x), Math.abs(x + 1)) ** 2)); if (xm < R + 1) addCollider(CX + x, LV[4] - 0.6, CZ - hz, CX + x + 1, LV[4], CZ + hz); }
    // 통로(계단실 ↔ 굴): 층마다
    for (const y of LV) {
      const z0 = SZS + 0.1, z1 = SZS + 2.4, xw = CX + R * Math.cos(galA) - 0.3;
      B.box(SLAB, xw - 0.6, y - 0.38, z0 - 0.3, SX0 - 0.01, y + 0.012, z1 + 0.3); B.box(ROCKD, xw - 0.6, y + 2.68, z0 - 0.3, SX0 - 0.03, y + 3.08, z1 + 0.3, false);
      wall(B, ROCK, 'x', z0 - 0.4, z0, CX + Math.sqrt(R * R - (z0 - CZ) ** 2) - 0.12, SX0 - 0.5, y, y + 2.7); wall(B, ROCK, 'x', z1, z1 + 0.4, CX + Math.sqrt(R * R - (z1 - CZ) ** 2) - 0.12, SX0 - 0.5, y, y + 2.7);
    }
    // 고리 복도와 다리: 층마다 굴 벽을 따라 돌고, 한가운데를 다리가 건넌다(층마다 방향이 엇갈린다)
    LV.slice(0, 4).forEach((y, k) => {
      { const top = new THREE.RingGeometry(RG, R, 96); top.rotateX(-PI / 2); B.geo(SLAB, top, mat4(CX, y, CZ), [R * 2, R * 2]);
        const bot = new THREE.RingGeometry(RG, R, 96); bot.rotateX(PI / 2); B.geo(ROCKD, bot, mat4(CX, y - 0.4, CZ), [R * 2, R * 2]);
        B.geo(IRON, new THREE.CylinderGeometry(RG, RG, 0.4, 96, 1, true), mat4(CX, y - 0.2, CZ)); }
      for (let x = -R; x < R; x += 0.5) {   // 밟는 판정: 띠 상자
        const xm = Math.min(Math.abs(x), Math.abs(x + 0.5)), xM = Math.max(Math.abs(x), Math.abs(x + 0.5)); if (xm >= R) continue;
        const half = Math.sqrt(R * R - xm * xm);
        if (xM < RG) { const hi = Math.sqrt(RG * RG - xM * xM); addCollider(CX + x, y - 0.4, CZ - half, CX + x + 0.5, y, CZ - hi); addCollider(CX + x, y - 0.4, CZ + hi, CX + x + 0.5, y, CZ + half); }
        else addCollider(CX + x, y - 0.4, CZ - half, CX + x + 0.5, y, CZ + half);
      }
      const alongX = k % 2 === 0, hw = 1.3, g = 0.13;                                                    // 다리: 짝수 층은 동서, 홀수 층은 남북
      if (alongX) { B.box(SLAB, CX - RG - 0.1, y - 0.35, CZ - hw, CX + RG + 0.1, y, CZ + hw); B.box(IRON, CX - RG, y - 0.9, CZ - 0.25, CX + RG, y - 0.35, CZ + 0.25, false);
        for (const s of [-1, 1]) railing(B, IRON, [[CX - RG + 0.1, CZ + s * (hw - 0.06)], [CX + RG - 0.1, CZ + s * (hw - 0.06)]], y, 1.05, { gap: 0.22 }); }
      else { B.box(SLAB, CX - hw, y - 0.35, CZ - RG - 0.1, CX + hw, y, CZ + RG + 0.1); B.box(IRON, CX - 0.25, y - 0.9, CZ - RG, CX + 0.25, y - 0.35, CZ + RG, false);
        for (const s of [-1, 1]) railing(B, IRON, [[CX + s * (hw - 0.06), CZ - RG + 0.1], [CX + s * (hw - 0.06), CZ + RG - 0.1]], y, 1.05, { gap: 0.22 }); }
      const a0 = alongX ? 0 : PI / 2;                                                                    // 고리 복도 난간(다리가 닿는 두 곳은 틔운다)
      roundRailing(B, IRON, CX, CZ, RG + 0.08, y, 1.05, a0 + g, a0 + PI - g, { gap: 0.22 }); roundRailing(B, IRON, CX, CZ, RG + 0.08, y, 1.05, a0 + PI + g, a0 + TAU - g, { gap: 0.22 });
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.5 + k * 0.4; const x = CX + Math.cos(a) * (R - 0.25), z = CZ + Math.sin(a) * (R - 0.25); B.box(LAMPM, x - 0.12, y + 2.5, z - 0.12, x + 0.12, y + 2.95, z + 0.12, false); glows.push([x, y + 2.7, z, 1.0]); }
      lights.push([CX, y + 3, CZ, 22, 30]);
    });
    // 굴 벽을 타고 오르내리는 굵은 관과, 층 사이를 도는 가는 관
    for (const [a, r] of [[0.9, 0.42], [1.25, 0.3], [2.3, 0.5], [3.9, 0.38], [4.35, 0.46], [5.4, 0.3]]) { const x = CX + Math.cos(a) * (R - r - 0.05), z = CZ + Math.sin(a) * (R - r - 0.05); B.geo(RUST, new THREE.CylinderGeometry(r, r, -LV[4] - 3.2, 12), mat4(x, (LV[4] - 3.2) / 2, z)); for (const y of [-9, -21, -33, -45, -57]) B.geo(IRON, new THREE.CylinderGeometry(r + 0.07, r + 0.07, 0.28, 12), mat4(x, y, z)); }
    for (const y of [-6.5, -18.5, -30.5, -42.5, -54.5]) { const t = new THREE.TorusGeometry(R - 0.22, 0.14, 6, 96); t.rotateX(PI / 2); B.geo(IRON, t, mat4(CX, y, CZ)); }
    // 굴 바닥: 고인 물, 한가운데의 봉인 무늬, 벽에서 나온 굵은 관 주둥이
    { const sealM = canvasMat(512, 512, (g, w) => { g.fillStyle = '#3a3d44'; g.fillRect(0, 0, w, w); g.strokeStyle = '#b9a56a'; g.lineWidth = 10; for (const r of [230, 190, 96]) { g.beginPath(); g.arc(256, 256, r, 0, TAU); g.stroke(); }
        g.lineWidth = 6; for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; g.beginPath(); g.moveTo(256 + Math.cos(a) * 100, 256 + Math.sin(a) * 100); g.lineTo(256 + Math.cos(a) * 186, 256 + Math.sin(a) * 186); g.stroke(); }
        g.fillStyle = '#b9a56a'; g.font = '900 150px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('根', 256, 262); });
      const d = new THREE.CircleGeometry(6, 48); d.rotateX(-PI / 2); B.geo(sealM, d, mat4(CX, LV[4] + 0.03, CZ));
      const w = new THREE.RingGeometry(8.2, R - 0.1, 64); w.rotateX(-PI / 2); B.geo(M.water, w, mat4(CX, LV[4] + 0.05, CZ));
      for (const a of [1.9, 3.4, 5.0]) { const x = CX + Math.cos(a) * (R - 1.1), z = CZ + Math.sin(a) * (R - 1.1); B.geo(RUST, new THREE.CylinderGeometry(1.0, 1.0, 2.4, 14, 1, true), mat4(x, LV[4] + 1.5, z, PI / 2, PI / 2 - a)); B.geo(INK, new THREE.CircleGeometry(0.98, 14), mat4(x - Math.cos(a) * 0.9, LV[4] + 1.5, z - Math.sin(a) * 0.9, 0, PI / 2 - a + PI)); }
      lights.push([CX, LV[4] + 3, CZ, 18, 26]); }
  }

  /* ---------- 방 짓는 틀 ---------- */
  // 굴 서쪽 방: 안쪽 범위 x0~x1, z0~z1, 바닥 y, 높이 h. 동쪽 벽 한가운데(굴의 서쪽 문)로 드나든다
  const WX0 = -199, WX1 = -176.6;
  const roomW = (y, z0, z1, h, floorM = SLAB, wallM = ROCK) => {
    B.box(floorM, WX0, y - 0.4, z0, WX1, y, z1); B.box(ROCKD, WX0 - 0.4, y + h, z0 - 0.4, WX1 + 0.4, y + h + 0.4, z1 + 0.4, false);
    wall(B, wallM, 'z', WX0 - 0.4, WX0, z0, z1, y, y + h); wall(B, wallM, 'x', z0 - 0.4, z0, WX0 - 0.4, WX1 + 0.4, y, y + h); wall(B, wallM, 'x', z1, z1 + 0.4, WX0 - 0.4, WX1 + 0.4, y, y + h);
    wall(B, wallM, 'z', WX1, WX1 + 0.4, z0, z1, y, y + h, [{ u0: CZ - 1.6, u1: CZ + 1.6, ys: [[y, y + 3.0]] }]);
    B.box(SLAB, WX1 + 0.02, y - 0.4, CZ - 1.65, CX - R + 0.05, y + 0.014, CZ + 1.65);                      // 문지방(굴 벽 두께만큼). 문 밑 굴 벽의 윗면·고리 복도와 한 높이면 겹쳐 깜빡이므로 살짝 돋운다
    for (const s of [-1, 1]) B.box(IRON, WX1 - 0.1, y, CZ + s * 1.6 - 0.14, CX - R + 0.1, y + 3.1, CZ + s * 1.6 + 0.14, false);
    B.box(IRON, WX1 - 0.1, y + 3.0, CZ - 1.74, CX - R + 0.1, y + 3.3, CZ + 1.74, false);
  };
  const shelf = (x0, z0, x1, z1, y, h, tiers, fill) => {   // 서가: 틀과 칸마다 채운 것
    const alongX = x1 - x0 > z1 - z0;
    B.box(M.beam, x0, y, z0, x1, y + 0.08, z1, false); B.box(M.beam, x0, y + h - 0.06, z0, x1, y + h, z1, false);
    if (alongX) { for (const x of [x0, x1 - 0.07]) B.box(M.beam, x, y, z0, x + 0.07, y + h, z1, false); } else { for (const z of [z0, z1 - 0.07]) B.box(M.beam, x0, y, z, x1, y + h, z + 0.07, false); }
    for (let t = 1; t < tiers; t++) B.box(M.beam, x0, y + h * t / tiers - 0.03, z0, x1, y + h * t / tiers, z1, false);
    addCollider(x0, y, z0, x1, y + h, z1);
    for (let t = 0; t < tiers; t++) fill(y + h * t / tiers + (t ? 0 : 0.08), h / tiers - 0.06, alongX);
  };
  const scrollsOn = (x0, z0, x1, z1) => (yy, hh, alongX) => {   // 서가 한 칸에 누운 두루마리들(마구리가 앞을 본다)
    const len = alongX ? x1 - x0 : z1 - z0, n = Math.floor((len - 0.2) / 0.17), dep = alongX ? z1 - z0 : x1 - x0;
    for (let i = 0; i < n; i++) { if (Rn() < 0.14) continue; const u = 0.14 + i * 0.17, r = 0.05 + Rn() * 0.025, yv = yy + r, lg = dep * (0.7 + Rn() * 0.25);
      const g = new THREE.CylinderGeometry(r, r, lg, 8); const m = Rn() < 0.75 ? PAPER : Rn() < 0.5 ? REDP : mat('plain', 0x2f4f6a);
      if (alongX) B.geo(m, g, mat4(x0 + u, yv, (z0 + z1) / 2, PI / 2, 0, 0)); else B.geo(m, g, mat4((x0 + x1) / 2, yv, z0 + u, 0, 0, PI / 2)); }
  };

  /* ---------- 지하 12m: 대기소·장비실 ---------- */
  { const y = LV[0], z0 = -134, z1 = -114, h = 4.4; roomW(y, z0, z1, h);
    // 가면 걸이: 서쪽 벽의 나무 판에 동물 가면이 줄지어 걸려 있다(흰 사기 가면에 붉은 무늬, 뾰족한 귀)
    B.box(M.beam, WX0, y + 1.0, CZ - 5.2, WX0 + 0.08, y + 3.4, CZ + 5.2, false);
    for (let r = 0; r < 3; r++) for (let i = 0; i < 9; i++) {
      const z = CZ - 4.6 + i * 1.15, yy = y + 1.45 + r * 0.72, kind = (i + r * 2) % 3;
      { const g = new THREE.SphereGeometry(1, 12, 8); g.scale(0.07, 0.17, 0.125); B.geo(MASK, g, mat4(WX0 + 0.12, yy, z)); }
      for (const s of [-1, 1]) { const e = new THREE.ConeGeometry(0.04, kind === 1 ? 0.16 : 0.09, 5); B.geo(MASK, e, mat4(WX0 + 0.13, yy + 0.17, z + s * 0.085, 0, 0, 0)); B.box(INK, WX0 + 0.17, yy + 0.02, z + s * 0.05 - 0.025, WX0 + 0.195, yy + 0.04, z + s * 0.05 + 0.025, false); }
      if (kind === 0) for (const s of [-1, 1]) B.box(REDP, WX0 + 0.17, yy - 0.09, z + s * 0.07 - 0.008, WX0 + 0.19, yy - 0.0, z + s * 0.07 + 0.008, false);
      if (kind === 1) B.box(REDP, WX0 + 0.175, yy + 0.07, z - 0.012, WX0 + 0.195, yy + 0.16, z + 0.012, false);
      if (kind === 2) for (const s of [-1, 0, 1]) B.box(REDP, WX0 + 0.175, yy - 0.12, z + s * 0.035 - 0.007, WX0 + 0.195, yy - 0.05, z + s * 0.035 + 0.007, false);
    }
    // 북쪽 벽: 옷걸이에 걸린 잿빛 조끼와 검은 겉옷
    B.box(M.beam, WX0 + 2, y + 2.1, z0 + 0.1, WX1 - 2, y + 2.2, z0 + 0.22, false);
    for (let i = 0; i < 9; i++) { const x = WX0 + 3 + i * 2.05; B.box(IRON, x - 0.02, y + 1.9, z0 + 0.1, x + 0.02, y + 2.12, z0 + 0.3, false);
      if (i % 2) { const g = new THREE.CylinderGeometry(0.2, 0.42, 1.5, 10); g.scale(1, 1, 0.45); B.geo(CLOAK, g, mat4(x, y + 1.15, z0 + 0.36)); }
      else { const g = new THREE.CylinderGeometry(0.21, 0.19, 0.62, 10); g.scale(1, 1, 0.55); B.geo(VEST, g, mat4(x, y + 1.56, z0 + 0.36)); for (const s of [-1, 1]) B.box(VEST, x + s * 0.25 - 0.06, y + 1.6, z0 + 0.28, x + s * 0.25 + 0.06, y + 1.86, z0 + 0.44, false); } }
    // 남쪽 벽: 칼걸이(등에 메는 짧은 칼)
    for (let rk = 0; rk < 2; rk++) { const x0 = WX0 + 3 + rk * 9;
      for (const x of [x0, x0 + 6]) B.box(M.beam, x - 0.06, y, z1 - 0.5, x + 0.06, y + 1.7, z1 - 0.1); addCollider(x0, y, z1 - 0.5, x0 + 6, y + 1.7, z1);
      for (let t = 0; t < 4; t++) { const yy = y + 0.45 + t * 0.34; B.box(M.beam, x0, yy - 0.03, z1 - 0.34, x0 + 6, yy, z1 - 0.26, false);
        for (let i = 0; i < 2; i++) { const xa = x0 + 0.5 + i * 2.9; B.box(INK, xa, yy, z1 - 0.33, xa + 0.62, yy + 0.05, z1 - 0.28, false); B.box(REDP, xa + 0.62, yy, z1 - 0.335, xa + 0.86, yy + 0.055, z1 - 0.275, false); B.box(GOLD, xa + 0.6, yy - 0.01, z1 - 0.345, xa + 0.63, yy + 0.065, z1 - 0.265, false); } } }
    // 가운데: 긴 탁자와 걸상, 임무 두루마리
    B.box(M.beam, -191, y + 0.7, CZ - 0.6, -184, y + 0.78, CZ + 0.6); for (const x of [-190.7, -184.3]) for (const z of [CZ - 0.5, CZ + 0.5]) B.box(M.beam, x - 0.06, y, z - 0.06, x + 0.06, y + 0.7, z + 0.06, false);
    for (const s of [-1, 1]) { B.box(M.beamLight, -190.6, y + 0.4, CZ + s * 1.15 - 0.2, -184.4, y + 0.46, CZ + s * 1.15 + 0.2); for (const x of [-190.3, -184.7]) B.box(M.beam, x - 0.05, y, CZ + s * 1.15 - 0.15, x + 0.05, y + 0.4, CZ + s * 1.15 + 0.15, false); }
    for (let i = 0; i < 5; i++) B.geo(i % 2 ? PAPER : REDP, new THREE.CylinderGeometry(0.045, 0.045, 0.42, 8), mat4(-189.5 + i * 1.1, y + 0.83, CZ - 0.2 + (i % 3) * 0.15, 0, i * 0.7, PI / 2));
    signBoard(B, '根', WX1 - 0.02, y + 3.5, CZ, -PI / 2, 0.9, 0.9, { both: false, bg: '#20222a', color: '#c9b98a', depth: 0.05 });
    lamp(-187.5, y + h - 0.6, CZ, 1.3, 18, 22); lamp(-195, y + h - 0.6, CZ - 6, 1.1, 12, 16); lamp(-181, y + h - 0.6, CZ + 6, 1.1, 12, 16);
  }

  /* ---------- 지하 24m: 연무장 ---------- */
  { const y = LV[1], z0 = -146, z1 = -102, h = 8; roomW(y, z0, z1, h, M.floorDark);
    for (const z of [-140, -129, -119, -108]) for (const x of [WX0 + 1.2, WX1 - 1.2]) { B.put(M.beam, new THREE.CylinderGeometry(0.3, 0.34, h, 12), x, y + h / 2, z); addCollider(x - 0.3, y, z - 0.3, x + 0.3, y + h, z + 0.3); B.box(M.beam, x - 0.5, y + h - 0.3, z - 0.5, x + 0.5, y + h, z + 0.5, false); }
    for (const z of [-140, -129, -119, -108]) B.box(M.beam, WX0, y + h - 0.5, z - 0.2, WX1, y + h - 0.1, z + 0.2, false);
    // 바닥의 겨루기 자리(흰 줄)와 표적 통나무, 짚 인형
    for (const [a, b, c, d] of [[-193, -131, -182, -130.9], [-193, -117.1, -182, -117], [-193, -131, -192.9, -117], [-182.1, -131, -182, -117]]) B.box(PAPER, a, y, b, c, y + 0.012, d, false);
    for (let i = 0; i < 6; i++) { const x = WX0 + 3 + i * 3.4, z = z0 + 4.2; B.put(M.beamLight, new THREE.CylinderGeometry(0.2, 0.22, 1.9, 12), x, y + 0.95, z); addCollider(x - 0.2, y, z - 0.2, x + 0.2, y + 1.9, z + 0.2);
      for (const yy of [0.7, 1.1, 1.5]) { const t = new THREE.TorusGeometry(0.215, 0.03, 5, 14); t.rotateX(PI / 2); B.geo(ROPE, t, mat4(x, y + yy, z)); }
      for (let k = 0; k < 3; k++) { const a = Rn() * 3 + 0.2, yy = y + 0.8 + Rn() * 0.9; B.geo(IRON, new THREE.BoxGeometry(0.03, 0.03, 0.26), mat4(x + Math.sin(a) * 0.26, yy, z + Math.cos(a) * 0.26, 0.25, a, 0)); } }
    for (let i = 0; i < 4; i++) { const x = WX0 + 4 + i * 5.2, z = z1 - 4; B.put(M.beam, new THREE.CylinderGeometry(0.06, 0.06, 1.9, 8), x, y + 0.95, z);
      { const g = new THREE.CylinderGeometry(0.24, 0.2, 0.95, 12); B.geo(STRAW, g, mat4(x, y + 1.15, z)); } { const g = new THREE.SphereGeometry(0.19, 12, 8); B.geo(STRAW, g, mat4(x, y + 1.82, z)); }
      B.geo(STRAW, new THREE.CylinderGeometry(0.07, 0.07, 1.1, 8), mat4(x, y + 1.45, z, 0, 0, PI / 2)); for (const yy of [0.85, 1.4]) { const t = new THREE.TorusGeometry(0.235, 0.025, 5, 14); t.rotateX(PI / 2); B.geo(ROPE, t, mat4(x, y + yy, z)); }
      addCollider(x - 0.25, y, z - 0.25, x + 0.25, y + 2, z + 0.25); }
    // 북쪽 벽의 과녁(동심원)과 박힌 수리검
    const tgt = canvasMat(256, 256, (g, w) => { g.fillStyle = '#d9c9a0'; g.fillRect(0, 0, w, w); for (const [r, c] of [[120, '#1b1714'], [92, '#d9c9a0'], [64, '#1b1714'], [36, '#d9c9a0'], [14, '#a52a22']]) { g.fillStyle = c; g.beginPath(); g.arc(128, 128, r, 0, TAU); g.fill(); } });
    for (let i = 0; i < 5; i++) { const x = WX0 + 3.5 + i * 4; B.geo(tgt, new THREE.CircleGeometry(0.7, 28), mat4(x, y + 2.0, z0 + 0.03)); B.box(M.beam, x - 0.8, y + 1.15, z0, x + 0.8, y + 2.85, z0 + 0.02, false);
      for (let k = 0; k < 3; k++) { const px = x + (Rn() - 0.5) * 0.9, py = y + 2 + (Rn() - 0.5) * 0.9, a = Rn() * 3; for (const r of [0, PI / 2]) B.geo(IRON, new THREE.BoxGeometry(0.2, 0.035, 0.012), mat4(px, py, z0 + 0.06, 0, 0, a + r)); } }
    // 서쪽: 한 단 높은 자리와 '根' 깃발, 무기 걸이
    B.box(M.beam, WX0, y, CZ - 4, WX0 + 3, y + 0.35, CZ + 4);
    B.geo(canvasMat(256, 512, (g, w, hh) => { g.fillStyle = '#20222a'; g.fillRect(0, 0, w, hh); g.strokeStyle = '#c9b98a'; g.lineWidth = 8; g.strokeRect(14, 14, w - 28, hh - 28); g.fillStyle = '#c9b98a'; g.font = '900 190px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('根', w / 2, hh / 2); }), new THREE.PlaneGeometry(2.4, 4.8), mat4(WX0 + 0.05, y + 4.2, CZ, 0, PI / 2));
    for (const s of [-1, 1]) { const z = CZ + s * 6.5; B.box(M.beam, WX0 + 0.1, y, z - 1.6, WX0 + 0.3, y + 2.4, z + 1.6); for (let i = 0; i < 5; i++) { const zz = z - 1.3 + i * 0.65; B.put(M.beamLight, new THREE.CylinderGeometry(0.022, 0.022, 2.0, 6), WX0 + 0.42, y + 1.1, zz); B.geo(IRON, new THREE.ConeGeometry(0.05, 0.3, 4), mat4(WX0 + 0.42, y + 2.25, zz)); } }
    for (const z of [-140, -124, -108]) for (const x of [-193, -182]) lamp(x, y + h - 0.9, z, 1.4, 20, 26, 0.9);
  }

  /* ---------- 지하 36m: 기밀자료 보관소(서쪽), 단조의 집무실(동쪽) ---------- */
  { const y = LV[2], z0 = -140, z1 = -108, h = 5; roomW(y, z0, z1, h);
    // 서가 여섯 줄(남북으로 긴 줄), 가운데 통로는 비운다
    for (let i = 0; i < 6; i++) { const x = WX0 + 2 + i * 3.1; for (const [a, b] of [[z0 + 1, CZ - 2.4], [CZ + 2.4, z1 - 1]]) { shelf(x, a, x + 0.9, b, y, 3.6, 6, scrollsOn(x, a, x + 0.9, b)); } }
    // 사다리, 열람 책상
    for (const s of [-0.22, 0.22]) beamBetween(B, M.beamLight, V3(WX0 + 4.1, y, z0 + 5 + s), V3(WX0 + 3.0, y + 3.4, z0 + 5 + s), 0.05, 0.05);
    for (let i = 1; i < 10; i++) { const t = i / 10; B.box(M.beamLight, WX0 + 4.1 - 1.1 * t - 0.03, y + 3.4 * t - 0.02, z0 + 4.78, WX0 + 4.1 - 1.1 * t + 0.03, y + 3.4 * t + 0.02, z0 + 5.22, false); }
    B.box(M.beam, -180.5, y + 0.72, CZ + 3, -178, y + 0.8, CZ + 4.4); for (const [x, z] of [[-180.4, CZ + 3.1], [-178.1, CZ + 3.1], [-180.4, CZ + 4.3], [-178.1, CZ + 4.3]]) B.box(M.beam, x - 0.05, y, z - 0.05, x + 0.05, y + 0.72, z + 0.05, false);
    B.box(PAPER, -179.9, y + 0.8, CZ + 3.3, -179.2, y + 0.812, CZ + 4.1, false); B.geo(PAPER, new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8), mat4(-178.6, y + 0.85, CZ + 3.7, PI / 2, 0, 0));
    // 맨 안쪽: 쇠창살로 막은 금서 칸 — 받침 위의 큰 봉인 두루마리
    for (let z = z0 + 0.3; z < z0 + 7; z += 0.24) B.put(IRON, new THREE.CylinderGeometry(0.025, 0.025, h - 0.2, 6), WX0 + 19.4, y + h / 2, z);
    for (const yy of [0.2, 2.4, h - 0.3]) B.box(IRON, WX0 + 19.34, y + yy, z0, WX0 + 19.46, y + yy + 0.08, z0 + 7, false);
    addCollider(WX0 + 19.3, y, z0, WX0 + 19.5, y + h, z0 + 7); B.box(IRON, WX0 + 19.3, y, z0 + 7, WX1, y + h, z0 + 7.1);
    B.box(ROCKD, WX0 + 20.4, y, z0 + 2.4, WX0 + 21.8, y + 0.9, z0 + 4.6);
    B.geo(PAPER, new THREE.CylinderGeometry(0.3, 0.3, 1.9, 14), mat4(WX0 + 21.1, y + 1.22, z0 + 3.5, PI / 2, 0, 0)); for (const s of [-1, 1]) B.geo(REDP, new THREE.CylinderGeometry(0.34, 0.34, 0.12, 14), mat4(WX0 + 21.1, y + 1.22, z0 + 3.5 + s * 0.98, PI / 2, 0, 0));
    B.geo(PURPLE, new THREE.TorusGeometry(0.31, 0.04, 6, 16), mat4(WX0 + 21.1, y + 1.22, z0 + 3.5, 0, 0, 0));
    signBoard(B, '禁', WX0 + 19.28, y + 2.9, z0 + 3.5, -PI / 2, 0.8, 0.8, { both: false, bg: '#7a1c16', color: '#f0e6c8', depth: 0.04 });
    for (const z of [z0 + 6, CZ, z1 - 6]) for (const x of [-194, -183]) lamp(x, y + h - 0.6, z, 1.2, 14, 18);
  }
  { // 단조의 집무실: 계단실 동쪽 문으로 들어간다
    const y = LV[2], x0 = -133.6, x1 = -112, z0 = -128, z1 = -110, h = 4.2, DARKW = mat('planks', 0x4a3426), OZ = SZS + 1.25;   // OZ = 문과 마주 보는 방의 가운데 줄
    B.box(SLAB, SX1 + 0.5, y - 0.4, SZS + 0.1, x0, y, SZS + 2.4);                                        // 문지방
    for (const z of [SZS + 0.05, SZS + 2.35]) B.box(IRON, SX1 - 0.05, y, z, x0 + 0.05, y + 2.8, z + 0.1, false); B.box(IRON, SX1 - 0.05, y + 2.7, SZS + 0.05, x0 + 0.05, y + 2.9, SZS + 2.45, false);
    B.box(DARKW, x0, y - 0.4, z0, x1, y, z1); B.box(ROCKD, x0 - 0.4, y + h, z0 - 0.4, x1 + 0.4, y + h + 0.4, z1 + 0.4, false);
    wall(B, ROCK, 'z', x0 - 0.4, x0, z0, z1, y, y + h, [{ u0: SZS + 0.15, u1: SZS + 2.35, ys: [[y, y + 2.7]] }]); wall(B, ROCK, 'z', x1, x1 + 0.4, z0, z1, y, y + h);
    wall(B, ROCK, 'x', z0 - 0.4, z0, x0 - 0.4, x1 + 0.4, y, y + h); wall(B, ROCK, 'x', z1, z1 + 0.4, x0 - 0.4, x1 + 0.4, y, y + h);
    for (const z of [z0, z1 - 0.06]) B.box(M.beam, x0, y, z, x1, y + 1.0, z + 0.06, false);                 // 허리 널
    // 한 단 높은 다다미 자리, 앉은뱅이 책상, 방석, 뒤의 금빛 병풍과 '根' 족자
    B.box(M.beam, x1 - 7.4, y, OZ - 4.2, x1, y + 0.3, OZ + 4.2); B.box(M.tatami, x1 - 7.2, y + 0.3, OZ - 4, x1 - 0.2, y + 0.34, OZ + 4, false);
    B.box(M.beam, x1 - 5.6, y + 0.72, OZ - 1.0, x1 - 4.5, y + 0.8, OZ + 1.0); for (const z of [OZ - 0.9, OZ + 0.9]) B.box(M.beam, x1 - 5.5, y + 0.34, z - 0.05, x1 - 4.6, y + 0.72, z + 0.05, false); addCollider(x1 - 5.6, y, OZ - 1, x1 - 4.5, y + 0.8, OZ + 1);
    B.box(PAPER, x1 - 5.35, y + 0.8, OZ - 0.5, x1 - 4.8, y + 0.812, OZ + 0.3, false); B.box(INK, x1 - 5.3, y + 0.8, OZ + 0.5, x1 - 5.05, y + 0.84, OZ + 0.72, false); B.geo(M.beam, new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), mat4(x1 - 4.9, y + 0.83, OZ + 0.6, PI / 2, 0.4, 0));
    for (let i = 0; i < 3; i++) B.geo(i % 2 ? PAPER : REDP, new THREE.CylinderGeometry(0.04, 0.04, 0.36, 8), mat4(x1 - 5.2, y + 0.84 + (i === 2 ? 0.07 : 0), OZ - 0.78 + i * 0.08, 0, 0, PI / 2));
    B.box(CUSH, x1 - 4.2, y + 0.34, OZ - 0.4, x1 - 3.4, y + 0.44, OZ + 0.4, false);
    for (let i = 0; i < 4; i++) { const zc = OZ - 2.25 + i * 1.5, a = (i % 2 ? 1 : -1) * 0.28; B.geo(GOLD, new THREE.BoxGeometry(0.04, 1.9, 1.52), mat4(x1 - 1.3, y + 1.3, zc, 0, a, 0)); B.geo(M.beam, new THREE.BoxGeometry(0.05, 1.96, 0.05), mat4(x1 - 1.3 + Math.sin(a) * 0.76, y + 1.3, zc + 0.76, 0, 0, 0)); }
    B.geo(canvasMat(256, 640, (g, w, hh) => { g.fillStyle = '#e9dfc6'; g.fillRect(0, 0, w, hh); g.fillStyle = '#3a2c20'; g.fillRect(0, 0, w, 40); g.fillRect(0, hh - 40, w, 40); g.fillStyle = '#17110e'; g.font = '900 200px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('根', w / 2, hh / 2); }), new THREE.PlaneGeometry(1.1, 2.75), mat4(x1 - 0.03, y + 2.4, OZ, 0, -PI / 2));
    // 지팡이 걸이, 촛대 둘, 벽의 마을 지도, 두루마리 서가
    B.box(M.beam, x1 - 3.0, y + 0.34, OZ + 2.6, x1 - 2.0, y + 0.42, OZ + 2.9, false); for (const dx of [0.1, 0.9]) B.box(M.beam, x1 - 3.0 + dx - 0.03, y + 0.42, OZ + 2.7, x1 - 3.0 + dx + 0.03, y + 0.75, OZ + 2.8, false);
    B.geo(M.beam, new THREE.CylinderGeometry(0.02, 0.025, 1.15, 8), mat4(x1 - 2.5, y + 0.78, OZ + 2.75, 0, 0, PI / 2));
    for (const s of [-1, 1]) { const x = x1 - 5.0, z = OZ + s * 2.6; B.put(IRON, new THREE.CylinderGeometry(0.025, 0.025, 1.2, 6), x, y + 0.94, z); B.put(IRON, new THREE.CylinderGeometry(0.14, 0.16, 0.05, 10), x, y + 0.36, z); B.put(PAPER, new THREE.CylinderGeometry(0.03, 0.03, 0.22, 8), x, y + 1.65, z); B.put(LAMPM, new THREE.SphereGeometry(0.035, 8, 6), x, y + 1.8, z); glows.push([x, y + 1.8, z, 0.8]); }
    shelf(x0 + 4, z0 + 0.1, x0 + 12, z0 + 0.8, y, 2.6, 5, scrollsOn(x0 + 4, z0 + 0.1, x0 + 12, z0 + 0.8));
    B.geo(canvasMat(512, 384, (g, w, hh) => { g.fillStyle = '#d8cba4'; g.fillRect(0, 0, w, hh); g.strokeStyle = '#3a2c20'; g.lineWidth = 5; g.strokeRect(8, 8, w - 16, hh - 16); g.beginPath(); g.arc(256, 200, 150, 0, TAU); g.stroke(); g.lineWidth = 2; for (let i = 0; i < 9; i++) { const a = PI + i / 8 * PI; g.beginPath(); g.moveTo(256, 60); g.lineTo(256 + Math.cos(a) * 150, 200 - Math.sin(a) * -150); g.stroke(); }
      g.fillStyle = '#a52a22'; for (const [x, yy] of [[256, 62], [150, 150], [330, 240], [210, 290], [360, 130]]) { g.beginPath(); g.arc(x, yy, 7, 0, TAU); g.fill(); } }), new THREE.PlaneGeometry(3.2, 2.4), mat4((x0 + x1) / 2 - 2, y + 2.4, z1 - 0.03, 0, PI));
    lamp(x0 + 6, y + h - 0.6, OZ, 1.2, 14, 18); lights.push([x1 - 4, y + 2.2, OZ, 12, 14]);
  }

  /* ---------- 지하 48m: 생체 실험실 ---------- */
  { const y = LV[3], z0 = -142, z1 = -106, h = 5.5, TILEW = mat('pave', 0x8d979a); roomW(y, z0, z1, h, TILEW);
    // 배양조: 쇠 받침과 뚜껑 사이의 유리통, 안에는 푸른 물과 검은 그림자
    const tank = (x, z, liq, rr = 0.75) => {
      B.put(IRON, new THREE.CylinderGeometry(rr + 0.15, rr + 0.22, 0.5, 16), x, y + 0.25, z); B.put(IRON, new THREE.CylinderGeometry(rr + 0.18, rr + 0.12, 0.4, 16), x, y + 3.3, z);
      B.put(liq, new THREE.CylinderGeometry(rr - 0.06, rr - 0.06, 2.5, 16), x, y + 1.78, z); B.geo(M.glass, new THREE.CylinderGeometry(rr, rr, 2.62, 16, 1, true), mat4(x, y + 1.8, z));
      B.put(RUST, new THREE.CylinderGeometry(0.13, 0.13, h - 3.5, 8), x, y + 3.5 + (h - 3.5) / 2, z); addCollider(x - rr, y, z - rr, x + rr, y + 3.5, z + rr); glows.push([x, y + 1.8, z, 1.5]);
    };
    for (let i = 0; i < 4; i++) { tank(WX0 + 2.2, z0 + 4 + i * 4.2, LIQ); const g = new THREE.SphereGeometry(1, 10, 8); g.scale(0.22, 0.7 - (i % 2) * 0.2, 0.2); B.geo(FLESH, g, mat4(WX0 + 2.2 + 0.72, y + 1.7 + (i % 2) * 0.3, z0 + 4 + i * 4.2)); }
    for (let i = 0; i < 3; i++) tank(WX0 + 6 + i * 4.4, z0 + 2.0, i === 1 ? LIQP : LIQ, 0.6);
    for (const yy of [h - 0.5, h - 0.9]) B.geo(RUST, new THREE.CylinderGeometry(0.16, 0.16, 16, 8), mat4(WX0 + 2.2 + (yy === h - 0.5 ? 0 : 0.5), y + yy, z0 + 10, PI / 2, 0, 0));
    // 수술대: 쇠 판과 묶는 띠, 위에서 내려온 등, 옆의 기구 수레
    { const x = -186, z = CZ + 6; B.box(IRON, x - 1.1, y + 0.82, z - 0.45, x + 1.1, y + 0.9, z + 0.45); B.put(IRON, new THREE.CylinderGeometry(0.14, 0.3, 0.82, 10), x, y + 0.41, z); addCollider(x - 1.1, y, z - 0.45, x + 1.1, y + 0.9, z + 0.45);
      for (const dx of [-0.7, 0, 0.7]) B.box(M.beam, x + dx - 0.06, y + 0.9, z - 0.47, x + dx + 0.06, y + 0.93, z + 0.47, false);
      B.put(IRON, new THREE.CylinderGeometry(0.03, 0.03, h - 2.6, 6), x, y + 2.6 + (h - 2.6) / 2, z); B.put(IRON, new THREE.CylinderGeometry(0.5, 0.3, 0.2, 14), x, y + 2.55, z); B.put(LAMPM, new THREE.CylinderGeometry(0.42, 0.42, 0.04, 14), x, y + 2.44, z); glows.push([x, y + 2.4, z, 1.6]); lights.push([x, y + 2.2, z, 20, 16]);
      B.box(IRON, x + 1.6, y + 0.75, z - 0.35, x + 2.3, y + 0.79, z + 0.35); for (const [dx, dz] of [[1.65, -0.3], [2.25, -0.3], [1.65, 0.3], [2.25, 0.3]]) B.box(IRON, x + dx - 0.02, y, z + dz - 0.02, x + dx + 0.02, y + 0.75, z + dz + 0.02, false);
      for (let i = 0; i < 5; i++) B.box(IRON, x + 1.7 + i * 0.11, y + 0.79, z - 0.2, x + 1.73 + i * 0.11, y + 0.8, z + 0.05 + (i % 2) * 0.1, false); }
    // 남쪽 벽: 표본 병이 늘어선 선반
    for (let t = 0; t < 4; t++) { const yy = y + 0.9 + t * 0.62; B.box(IRON, WX0 + 3, yy - 0.03, z1 - 0.5, WX1 - 3, yy, z1 - 0.1, false);
      for (let i = 0; i < 22; i++) { if (Rn() < 0.2) continue; const x = WX0 + 3.4 + i * 0.72, r = 0.09 + Rn() * 0.05, hh = 0.24 + Rn() * 0.2; B.put(Rn() < 0.6 ? LIQ : Rn() < 0.5 ? LIQP : FLESH, new THREE.CylinderGeometry(r - 0.012, r - 0.012, hh - 0.04, 8), x, yy + hh / 2, z1 - 0.3); B.geo(M.glass, new THREE.CylinderGeometry(r, r, hh, 8, 1, true), mat4(x, yy + hh / 2, z1 - 0.3)); B.put(IRON, new THREE.CylinderGeometry(r * 0.8, r * 0.8, 0.03, 8), x, yy + hh + 0.015, z1 - 0.3); } }
    addCollider(WX0 + 3, y, z1 - 0.5, WX1 - 3, y + 3, z1);
    // 오로치마루와 손잡은 흔적: 유리 상자 속의 흰 뱀 허물, 벽에 걸린 보랏빛 밧줄 매듭, 뱀 표식의 두루마리
    { const x = -184, z = z0 + 1.2; B.box(ROCKD, x - 1.6, y, z - 0.5, x + 1.6, y + 0.9, z + 0.5);
      B.geo(SNAKE, tube([V3(x - 1.3, y + 1.0, z - 0.2), V3(x - 0.7, y + 1.02, z + 0.25), V3(x, y + 1.0, z - 0.2), V3(x + 0.7, y + 1.02, z + 0.25), V3(x + 1.3, y + 1.0, z)], t => 0.07 * (1 - t * 0.6) + 0.015, 8));
      for (const [a, b, c, d] of [[x - 1.5, z - 0.4, x + 1.5, z - 0.38], [x - 1.5, z + 0.38, x + 1.5, z + 0.4], [x - 1.5, z - 0.4, x - 1.48, z + 0.4], [x + 1.48, z - 0.4, x + 1.5, z + 0.4]]) B.box(M.glass, a, y + 0.9, b, c, y + 1.3, d, false);
      B.box(M.glass, x - 1.5, y + 1.3, z - 0.4, x + 1.5, y + 1.32, z + 0.4, false);
      { const t = new THREE.TorusGeometry(0.42, 0.075, 8, 22); B.geo(PURPLE, t, mat4(x + 3.4, y + 2.5, z0 + 0.14)); for (const s of [-1, 1]) B.geo(PURPLE, tube([V3(x + 3.4, y + 2.1, z0 + 0.16), V3(x + 3.4 + s * 0.2, y + 1.7, z0 + 0.18), V3(x + 3.4 + s * 0.32, y + 1.25, z0 + 0.16)], 0.06, 7)); }
      B.geo(canvasMat(256, 512, (g, w, hh) => { g.fillStyle = '#e6dcc0'; g.fillRect(0, 0, w, hh); g.strokeStyle = '#5a3f7a'; g.lineWidth = 12; g.beginPath(); g.moveTo(128, 60); for (let i = 0; i < 40; i++) g.lineTo(128 + Math.sin(i * 0.5) * 60 * (1 - i / 60), 60 + i * 9); g.stroke(); g.fillStyle = '#5a3f7a'; g.beginPath(); g.ellipse(128, 52, 26, 18, 0, 0, TAU); g.fill(); g.fillStyle = '#17110e'; g.font = '900 64px serif'; g.textAlign = 'center'; g.fillText('蛇', 128, 480); }), new THREE.PlaneGeometry(0.8, 1.6), mat4(x - 3.4, y + 2.3, z0 + 0.03));
    }
    for (let i = 0; i < 3; i++) { const t = new THREE.CircleGeometry(0.4, 12); t.rotateX(-PI / 2); B.geo(IRON, t, mat4(-190 + i * 5, y + 0.012, CZ)); }
    // 한가운데의 큰 배양조: 굵은 관과 줄이 사방으로 뻗고, 안에는 팔 하나가 떠 있다(단조의 오른팔에 심은 하시라마의 세포 — 이름표 柱間細胞)
    { const x = -188, z = CZ - 6.5, rr = 1.5;
      B.put(IRON, new THREE.CylinderGeometry(rr + 0.3, rr + 0.45, 0.7, 20), x, y + 0.35, z); B.put(IRON, new THREE.CylinderGeometry(rr + 0.35, rr + 0.2, 0.6, 20), x, y + 4.2, z);
      B.put(LIQ, new THREE.CylinderGeometry(rr - 0.1, rr - 0.1, 3.1, 20), x, y + 2.3, z); B.geo(M.glass, new THREE.CylinderGeometry(rr, rr, 3.25, 20, 1, true), mat4(x, y + 2.32, z)); addCollider(x - rr, y, z - rr, x + rr, y + 4.5, z + rr); glows.push([x, y + 2.3, z, 2.6]); lights.push([x, y + 2.4, z + 2.4, 14, 14]);
      B.geo(FLESH, tube([V3(x + rr - 0.15, y + 3.1, z + 0.05), V3(x + rr - 0.13, y + 2.5, z - 0.03), V3(x + rr - 0.15, y + 1.9, z + 0.06), V3(x + rr - 0.13, y + 1.5, z)], t => 0.11 - 0.04 * t, 8)); { const g = new THREE.SphereGeometry(1, 8, 6); g.scale(0.07, 0.15, 0.09); B.geo(FLESH, g, mat4(x + rr - 0.13, y + 1.38, z)); }
      for (const a of [0.4, 1.9, 3.3, 4.8]) B.geo(RUST, tube([V3(x + Math.cos(a) * (rr + 0.3), y + 4.4, z + Math.sin(a) * (rr + 0.3)), V3(x + Math.cos(a) * (rr + 1.2), y + h - 0.6, z + Math.sin(a) * (rr + 1.2)), V3(x + Math.cos(a) * (rr + 3.2), y + h - 0.3, z + Math.sin(a) * (rr + 3.2))], 0.11, 8));
      for (const a of [1.0, 2.6, 5.4]) B.geo(INK, tube([V3(x + Math.cos(a) * (rr + 0.4), y + 0.2, z + Math.sin(a) * (rr + 0.4)), V3(x + Math.cos(a) * (rr + 1.6), y + 0.04, z + Math.sin(a + 0.3) * (rr + 1.6)), V3(x + Math.cos(a) * (rr + 3.4), y + 0.04, z + Math.sin(a - 0.2) * (rr + 3.4))], 0.045, 6));
      signBoard(B, '柱間細胞', x + rr + 0.4, y + 0.36, z, PI / 2, 0.9, 0.24, { both: false, bg: '#e6dcc0', color: '#17110e', depth: 0.02 }); }
    // 실험대 두 줄: 삼각 플라스크와 시험관 걸이, 접시, 현미경, 적어 둔 종이
    for (const zz of [CZ + 0.8, CZ + 11.5]) { const x0 = -194.5, x1 = -188.5;
      B.box(IRON, x0, y + 0.86, zz - 0.5, x1, y + 0.92, zz + 0.5); for (const x of [x0 + 0.1, x1 - 0.1]) B.box(IRON, x - 0.05, y, zz - 0.45, x + 0.05, y + 0.86, zz + 0.45, false); B.box(IRON, x0 + 0.1, y + 0.3, zz - 0.4, x1 - 0.1, y + 0.34, zz + 0.4, false); addCollider(x0, y, zz - 0.5, x1, y + 0.92, zz + 0.5);
      for (let i = 0; i < 5; i++) { const x = x0 + 0.5 + i * 0.55; B.put(i % 2 ? LIQ : LIQP, new THREE.ConeGeometry(0.1, 0.16, 10), x, y + 1.0, zz - 0.2); B.geo(M.glass, new THREE.ConeGeometry(0.12, 0.22, 10, 1, true), mat4(x, y + 1.03, zz - 0.2)); B.geo(M.glass, new THREE.CylinderGeometry(0.03, 0.03, 0.12, 8, 1, true), mat4(x, y + 1.19, zz - 0.2)); }
      B.box(M.beam, x0 + 3.3, y + 0.92, zz - 0.3, x0 + 4.5, y + 0.95, zz - 0.1, false); for (let i = 0; i < 6; i++) { const x = x0 + 3.4 + i * 0.2; B.put(i % 3 ? LIQ : REDP, new THREE.CylinderGeometry(0.022, 0.022, 0.12, 6), x, y + 1.0, zz - 0.2); B.geo(M.glass, new THREE.CylinderGeometry(0.03, 0.03, 0.22, 6, 1, true), mat4(x, y + 1.05, zz - 0.2)); }
      B.put(IRON, new THREE.CylinderGeometry(0.12, 0.14, 0.04, 10), x1 - 0.9, y + 0.94, zz + 0.1); B.box(IRON, x1 - 0.95, y + 0.94, zz + 0.16, x1 - 0.85, y + 1.26, zz + 0.24, false); B.geo(IRON, new THREE.CylinderGeometry(0.035, 0.03, 0.26, 8), mat4(x1 - 0.9, y + 1.2, zz + 0.08, 0.5, 0, 0));
      for (let i = 0; i < 3; i++) B.geo(PAPER, new THREE.BoxGeometry(0.3, 0.004, 0.42), mat4(x0 + 4.9 + i * 0.36, y + 0.925 + i * 0.004, zz + 0.12, 0, i * 0.3 - 0.2, 0));
      for (let i = 0; i < 2; i++) { B.put(M.glass, new THREE.CylinderGeometry(0.16, 0.16, 0.03, 12), x0 + 0.6 + i * 0.5, y + 0.935, zz + 0.25); } }
    // 두 번째 수술대(흰 천에 덮인 것), 그 머리맡의 쇠 갈고리 걸이
    { const x = -191.5, z = CZ - 12.5; B.box(IRON, x - 0.45, y + 0.82, z - 1.1, x + 0.45, y + 0.9, z + 1.1); B.put(IRON, new THREE.CylinderGeometry(0.14, 0.3, 0.82, 10), x, y + 0.41, z); addCollider(x - 0.45, y, z - 1.1, x + 0.45, y + 0.9, z + 1.1);
      { const g = new THREE.SphereGeometry(1, 14, 8, 0, TAU, 0, PI / 2); g.scale(0.36, 0.3, 0.95); B.geo(mat('plain', 0xd9d6cc), g, mat4(x, y + 0.9, z)); } { const g = new THREE.SphereGeometry(1, 10, 6, 0, TAU, 0, PI / 2); g.scale(0.2, 0.26, 0.2); B.geo(mat('plain', 0xd9d6cc), g, mat4(x, y + 0.92, z - 0.72)); }
      B.put(IRON, new THREE.CylinderGeometry(0.03, 0.03, 2.0, 6), x + 0.9, y + 1.0, z - 1.0); B.put(IRON, new THREE.CylinderGeometry(0.2, 0.24, 0.05, 10), x + 0.9, y + 0.025, z - 1.0); B.box(IRON, x + 0.6, y + 1.96, z - 1.02, x + 1.2, y + 2.0, z - 0.98, false);
      B.put(LIQP, new THREE.CylinderGeometry(0.07, 0.05, 0.26, 8), x + 0.68, y + 1.78, z - 1.0); B.geo(INK, tube([V3(x + 0.68, y + 1.65, z - 1.0), V3(x + 0.5, y + 1.2, z - 0.9), V3(x + 0.3, y + 0.98, z - 0.7)], 0.008, 4)); }
    // 쇠창살 우리 셋(북동쪽 구석): 안은 어둡고, 하나는 문이 열려 있다
    for (let i = 0; i < 3; i++) { const x0 = -182.2, x1 = -177.0, za = z0 + 4 + i * 3.4, zb = za + 3.0;
      for (let x = x0; x <= x1 + 0.01; x += 0.26) for (const z of [za, zb]) B.put(IRON, new THREE.CylinderGeometry(0.022, 0.022, 2.4, 6), x, y + 1.2, z);
      for (let z = za; z <= zb + 0.01; z += 0.26) if (!(i === 1 && z > za + 0.8 && z < za + 2.2)) B.put(IRON, new THREE.CylinderGeometry(0.022, 0.022, 2.4, 6), x0, y + 1.2, z);
      for (const yy of [0.05, 2.36]) { B.box(IRON, x0 - 0.03, y + yy, za - 0.03, x1, y + yy + 0.06, za + 0.03, false); B.box(IRON, x0 - 0.03, y + yy, zb - 0.03, x1, y + yy + 0.06, zb + 0.03, false); B.box(IRON, x0 - 0.03, y + yy, za, x0 + 0.03, y + yy + 0.06, zb, false); }
      B.box(IRON, x0, y + 2.42, za, x1, y + 2.46, zb, false); addCollider(x0 - 0.05, y, za - 0.05, x1, y + 2.5, za + 0.05); addCollider(x0 - 0.05, y, zb - 0.05, x1, y + 2.5, zb + 0.05); if (i !== 1) addCollider(x0 - 0.05, y, za, x0 + 0.05, y + 2.5, zb);
      B.box(STRAW, x0 + 1.4, y, za + 0.4, x1 - 0.3, y + 0.08, zb - 0.4, false); B.put(M.beamLight, new THREE.CylinderGeometry(0.14, 0.12, 0.2, 10), x0 + 0.6, y + 0.1, zb - 0.5); }
    // 서쪽 벽: 사람 몸의 경혈 그림, 글씨가 빼곡한 칠판, 약장
    B.geo(canvasMat(256, 512, (g, w, hh) => { g.fillStyle = '#e6dcc0'; g.fillRect(0, 0, w, hh); g.strokeStyle = '#3a2c20'; g.lineWidth = 4; g.beginPath(); g.arc(128, 70, 34, 0, TAU); g.stroke(); g.beginPath(); g.moveTo(128, 104); g.lineTo(128, 300); g.moveTo(128, 130); g.lineTo(52, 250); g.moveTo(128, 130); g.lineTo(204, 250); g.moveTo(128, 300); g.lineTo(84, 470); g.moveTo(128, 300); g.lineTo(172, 470); g.stroke();
      g.fillStyle = '#a52a22'; for (const [x, yy] of [[128, 70], [128, 150], [128, 200], [128, 250], [128, 296], [90, 190], [166, 190], [106, 385], [150, 385]]) { g.beginPath(); g.arc(x, yy, 7, 0, TAU); g.fill(); } g.fillStyle = '#17110e'; g.font = '700 26px serif'; g.fillText('経絡図', 16, 500); }), new THREE.PlaneGeometry(1.2, 2.4), mat4(WX0 + 0.03, y + 2.3, CZ + 14.2, 0, PI / 2));
    B.geo(canvasMat(512, 256, (g, w, hh) => { g.fillStyle = '#22302a'; g.fillRect(0, 0, w, hh); g.strokeStyle = '#d9d6c4'; g.lineWidth = 2; for (let r = 0; r < 7; r++) { g.beginPath(); let x = 20; g.moveTo(x, 30 + r * 32); while (x < 480 - (r % 3) * 60) { x += 8 + (x * 7 + r * 13) % 15; g.lineTo(x, 30 + r * 32 + ((x * 3 + r) % 9) - 4); } g.stroke(); } g.beginPath(); g.arc(410, 190, 40, 0, TAU); g.moveTo(370, 190); g.lineTo(450, 190); g.moveTo(410, 150); g.lineTo(410, 230); g.stroke(); }), new THREE.PlaneGeometry(3.0, 1.5), mat4(WX0 + 0.03, y + 2.2, CZ + 9.5, 0, PI / 2));
    B.box(M.beam, WX0 + 0.02, y + 1.4, CZ + 7.9, WX0 + 0.06, y + 3.0, CZ + 11.1, false);
    { const za = CZ + 2.2, zb = CZ + 5.2; B.box(M.beam, WX0 + 0.05, y, za, WX0 + 0.7, y + 2.4, zb); for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) { B.box(M.beamLight, WX0 + 0.7, y + 0.12 + r * 0.38, za + 0.08 + c * 0.42, WX0 + 0.73, y + 0.44 + r * 0.38, za + 0.44 + c * 0.42, false); B.box(IRON, WX0 + 0.73, y + 0.26 + r * 0.38, za + 0.23 + c * 0.42, WX0 + 0.76, y + 0.3 + r * 0.38, za + 0.29 + c * 0.42, false); } }
    // 단조가 모은 사륜안: 붉은 눈이 든 작은 병들이 줄지어 놓인 받침(이름표 写輪眼)
    { const x = -186.5, z = z1 - 2.6; B.box(ROCKD, x - 1.5, y, z - 0.35, x + 1.5, y + 1.0, z + 0.35);
      for (let i = 0; i < 9; i++) { const xx = x - 1.2 + i * 0.3; B.put(mat('plain', 0xe9e4da, { rough: 0.3 }), new THREE.SphereGeometry(0.05, 10, 8), xx, y + 1.12, z); B.geo(REDP, new THREE.CircleGeometry(0.028, 10), mat4(xx, y + 1.12, z - 0.049, 0, PI, 0)); B.geo(INK, new THREE.CircleGeometry(0.011, 8), mat4(xx, y + 1.12, z - 0.0505, 0, PI, 0)); B.geo(M.glass, new THREE.CylinderGeometry(0.08, 0.08, 0.22, 10, 1, true), mat4(xx, y + 1.11, z)); B.put(IRON, new THREE.CylinderGeometry(0.085, 0.085, 0.02, 10), xx, y + 1.23, z); }
      signBoard(B, '写輪眼', x, y + 0.6, z - 0.36, PI, 0.7, 0.22, { both: false, bg: '#e6dcc0', color: '#7a1c16', depth: 0.02 }); }
    // 바닥의 얼룩과, 천장에서 늘어진 쇠사슬 갈고리
    for (const [x, z, r] of [[-186.2, CZ + 5.2, 0.7], [-190.3, CZ + 0.3, 0.5], [-183, CZ - 9, 0.6]]) { const g = new THREE.CircleGeometry(r, 14); g.rotateX(-PI / 2); g.scale(1.3, 1, 0.8); B.geo(mat('plain', 0x4a2a26, { rough: 0.5 }), g, mat4(x, y + 0.014, z)); }
    for (const [x, z, l] of [[-180, CZ - 5, 1.6], [-179.2, CZ - 5.5, 2.1], [-192, CZ + 6.5, 1.4]]) { for (let i = 0; i < l / 0.13; i++) { const t = new THREE.TorusGeometry(0.045, 0.012, 4, 8); B.geo(IRON, t, mat4(x, y + h - 0.1 - i * 0.13, z, 0, i % 2 ? PI / 2 : 0, 0)); } B.geo(IRON, new THREE.TorusGeometry(0.09, 0.016, 5, 10, PI * 1.3), mat4(x, y + h - 0.2 - l, z, 0, 0, PI)); }
    for (const z of [z0 + 8, CZ + 2, z1 - 6]) for (const x of [-193, -182]) { strip(x - 1.2, y + h - 0.02, z - 0.12, x + 1.2, z + 0.12); for (const dx of [-0.7, 0.7]) glows.push([x + dx, y + h - 0.08, z, 0.8]); }
    lights.push([-187.5, y + 3.5, CZ - 8, 16, 22], [-187.5, y + 3.5, CZ + 8, 16, 22]);
  }

  const group = B.finish(scene);
  // 땅속은 땅 위에서 보이지 않는다: 입구에서 멀리 있고 땅 위에 있을 때는 통째로 그리지 않는다(돌 창고는 멀어도 작아서 눈에 띄지 않는다)
  const cam = ctx.camera, tick = () => { if (!cam) return; const p = cam.position; group.visible = p.y < -1 || Math.hypot(p.x - (-138), p.z - (-124)) < 260; };
  const P = (n, t, b, y) => ({ n, t, b, y, secret: true });
  return {
    tick, glows, lights,
    places: [
      { n: '묘지기 헛간', t: '묘지 북쪽, 호카게 바위 밑동에 붙은 낡은 돌 헛간. 빗자루와 삽, 무덤 푯말 따위를 넣어 둔다.', b: [-144, -132, -134, -114], y: [0, 6] },
      P('뿌리 본거지 · 숨은 계단', '돌 창고 바닥 밑에서 시작해 땅속 60m까지 꺾여 내려가는 계단.', [SX0 - 0.5, SX1 + 0.5, SZN - 3, SZS + 3], [-61, -0.6]),
      P('뿌리 본거지 · 대기소와 장비실', '동물 가면과 등에 메는 칼, 잿빛 조끼와 검은 겉옷이 걸려 있는 방.', [WX0, WX1, -134, -114], [LV[0] - 0.5, LV[0] + 5]),
      P('뿌리 본거지 · 연무장', '감정을 지우도록 길러지는 뿌리의 요원들이 수련하는 넓은 지하 도장.', [WX0, WX1, -146, -102], [LV[1] - 0.5, LV[1] + 8.5]),
      P('뿌리 본거지 · 기밀자료 보관소', '마을의 어두운 일들을 적은 두루마리가 줄지어 꽂힌 서고. 맨 안쪽 쇠창살 안에는 금서가 있다.', [WX0, WX1, -140, -108], [LV[2] - 0.5, LV[2] + 5.5]),
      P('뿌리 본거지 · 단조의 집무실', '시무라 단조의 방. 다다미 자리의 앉은뱅이 책상, 금빛 병풍과 根 족자.', [-134, -112, -128, -110], [LV[2] - 0.5, LV[2] + 5]),
      P('뿌리 본거지 · 생체 실험실', '푸른 물이 찬 배양조와 수술대. 흰 뱀 허물과 보랏빛 밧줄 매듭 — 오로치마루와 손잡은 흔적이 남아 있다.', [WX0, WX1, -142, -106], [LV[3] - 0.5, LV[3] + 6]),
      P('뿌리 본거지 · 굴 바닥', '땅속 60m, 수직굴의 맨 밑. 고인 물 한가운데에 根의 봉인 무늬가 새겨져 있다.', [CX - R - 1, CX + R + 1, CZ - R - 1, CZ + R + 1], [-61, -56]),
      P('뿌리 본거지 · 수직굴', '깊고 둥근 굴. 층마다 고리 복도가 돌고, 한가운데를 다리가 층층이 엇갈려 건넌다.', [CX - R - 1, CX + R + 1, CZ - R - 1, CZ + R + 1], [-56, -3]),
    ],
    jumps: [],                                                // 숨은 곳이라 바로 가기에 올리지 않는다
    skip: [],
  };
}
