// 나루토의 집 — 둥근 탑이 붙은 3층 회벽 공동주택. 1층 현관 홀·창고·세탁실, 2층 셋방 두 칸, 3층 나루토의 방, 옥상 물탱크.
// 남쪽 바깥 계단과 복도(난간)로 층을 오르고, 동쪽 바깥 계단으로 옥상에 오른다.
import * as THREE from '../vendor/three.module.js';
import { Builder, wall, stairs, tube, mat4, rng, addCollider } from './build.js';
import { mat, M, textMat } from './materials.js';
import { tilePanel, beamBetween, gableRoof, coneRoof, roundWall, roundWindow, windowUnit, doorUnit, boxWalls, railing, signBoard } from './arch.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const PI = Math.PI;
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cylG = (r0, r1, h, seg = 12, open = false) => new THREE.CylinderGeometry(r1, r0, h, seg, 1, open);   // r0 아래, r1 위
const sph = (r, a = 10, b = 8) => new THREE.SphereGeometry(r, a, b);
const lathe = (pts, seg = 16) => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg);

// 건물 뼈대 치수
const BX0 = -53, BX1 = -41, BZ0 = -27, BZ1 = -17, T = 0.2;      // 네모 본채
const CX = -56, CZ = -22, R = 4, RI = 3.75, HA = Math.acos(3 / 4); // 둥근 탑(본채 서쪽 벽에 물려 있다)
const GZ1 = -15.2, SZ1 = -13.4;                                  // 복도 남쪽 끝, 계단 띠 남쪽 끝
const YR = 10;                                                   // 옥상 바닥

// 실내 그림(액자·달력·포스터) 재질 — 실내 전용
function pic(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 });
}
// 나뭇잎 표식: 소용돌이에서 뾰족한 잎끝으로 이어진다
function leafMark(g, cx, cy, s, col) {
  g.strokeStyle = col; g.lineWidth = s * 0.085; g.lineCap = 'round'; g.lineJoin = 'miter';
  g.beginPath();
  for (let i = 0; i <= 70; i++) {
    const a = i / 70 * PI * 3.1 + 0.4, r = s * (0.05 + 0.3 * i / 70), x = cx + s * 0.08 + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.lineTo(cx + s * 0.3, cy - s * 0.36); g.lineTo(cx - s * 0.52, cy - s * 0.2); g.lineTo(cx - s * 0.2, cy + s * 0.34); g.lineTo(cx - s * 0.36, cy + s * 0.5);
  g.stroke();
}

// 잎 한 장: 밑동에서 +z로 뻗으며 휘어 내린다. up = 처음 치켜든 각, bend = 휘는 정도, fold = 가운데 골
function leafGeo(L, W, up = 0.9, bend = 0.9, fold = 0.3, seg = 5) {
  const pos = [], uv = [], idx = [];
  let y = 0, z = 0, th = up;
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, w = W * 0.5 * Math.pow(Math.sin(PI * Math.min(0.999, 0.1 + 0.9 * t)), 0.8);
    pos.push(-w, y + w * fold, z, 0, y, z, w, y + w * fold, z); uv.push(0, t, 0.5, t, 1, t);
    th -= bend / seg; y += Math.sin(th) * L / seg; z += Math.cos(th) * L / seg;
  }
  for (let i = 0; i < seg; i++) { const a = i * 3; idx.push(a, a + 4, a + 1, a, a + 3, a + 4, a + 1, a + 5, a + 2, a + 1, a + 4, a + 5); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// 폭신한 것(베개·방석·요): 가장자리로 갈수록 납작해진다
function puff(g, k = 0.6) {
  g.computeBoundingBox();
  const b = g.boundingBox, hx = (b.max.x - b.min.x) / 2, hz = (b.max.z - b.min.z) / 2, p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) / hx, z = p.getZ(i) / hz; p.setY(i, p.getY(i) * (1 - k * x * x) * (1 - k * z * z)); }
  g.computeVertexNormals();
  return g;
}
// 이불: 침대 위에 덮여 양옆으로 늘어지고, 구김이 지고, 머리맡 쪽이 젖혀져 있다
function blanketGeo(w, len, drop) {
  const g = new THREE.PlaneGeometry(w + drop * 2, len, 30, 26); g.rotateX(-PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), over = Math.max(0, Math.abs(x) - w / 2);
    let y = 0.016 * Math.sin(x * 9 + z * 4) + 0.012 * Math.sin(z * 13 - x * 5) + 0.02 * Math.sin((x + z) * 6.3) + 0.06 * Math.exp(-((x - 0.1) ** 2 * 14 + (z - 0.25) ** 2 * 5));
    const tb = Math.max(0, -len / 2 + 0.28 - z) / 0.28;                    // 젖혀진 머리맡 자락
    y += 0.07 * Math.sin(tb * PI * 0.9);
    if (over > 0) { p.setX(i, Math.sign(x) * (w / 2 + 0.035 * (1 - Math.exp(-over * 8)) + 0.012 * Math.sin(z * 11))); y -= over; }
    p.setY(i, y);
  }
  g.computeVertexNormals();
  return g;
}
// 봉에 걸쳐 널린 수건(∩ 꼴)
function drapeGeo(w, la, lb) {
  const prof = [[-0.014, -la], [-0.014, 0], [0, 0.014], [0.014, 0], [0.014, -lb]], pos = [], idx = [];
  for (const [z, y] of prof) pos.push(-w / 2, y, z, w / 2, y, z);
  for (let i = 0; i < prof.length - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(pos.map(() => 0).slice(0, pos.length / 3 * 2), 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// 0~1 칸에 그린 옷 모양(빨랫줄용 — 위쪽 uv.y=1이 줄에 매달린다)
function clothGeo(pts) { return new THREE.ShapeGeometry(new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])))); }

export function build(scene, ctx) {
  const B = new Builder();
  const R0 = rng(7701);
  /* ---------- 재질 ---------- */
  const WALLM = mat('plaster', 0xe9dab0), TOWER = mat('plaster', 0xdfb87c), TILE = mat('tile', 0xa83d2b), TRIM = mat('wood', 0x3d6b60);
  const CONC = M.concrete, WOOD = M.beamLight, DARKW = M.beam, STEEL = mat('metal', 0xb4babd, { rough: 0.5 });
  const WHITE = mat('plain', 0xf0ede4), ORANGE = mat('plain', 0xe5762b), BLUE = mat('plain', 0x2e5a9e), RED = mat('plain', 0xb8322c), BLACK = mat('plain', 0x232327);
  const GREEN = mat('plain', 0x4c9440, { side: 'double', rough: 0.6 }), GREEN2 = mat('plain', 0x2f6e3a, { side: 'double', rough: 0.6 });
  const PAPER = mat('plain', 0xeee5c8, { side: 'double' }), POT = mat('plain', 0xb4633f), SOIL = mat('plain', 0x3b2b1f), YEL = mat('plain', 0xe9c765), PINK = mat('plain', 0xe58aa0);
  const BLANKET = mat('plain', 0x5d9b8f, { rough: 0.95, side: 'double' }), CARD = mat('plain', 0xb89462), TANK = mat('plain', 0x8fa39b, { rough: 0.6 });
  const BULB = mat('glow', 0xffe2a8), SHRUB = mat('leaf', 0x3f7a35);
  const C_WHITE = mat('cloth', 0xf2efe6), C_ORANGE = mat('cloth', 0xe5762b), C_BLUE = mat('cloth', 0x2e5a9e);

  const lights = [], glows = [];
  // 자리(x,y,z)·돌림에 맞춰 작은 부품을 놓는 틀
  const at = (x, y, z, ry = 0, s = 1) => {
    const base = mat4(x, y, z, 0, ry, 0, s);
    return (m, g, lx = 0, ly = 0, lz = 0, rx = 0, rY = 0, rz = 0, sc = 1) => B.geo(m, g, new THREE.Matrix4().multiplyMatrices(base, mat4(lx, ly, lz, rx, rY, rz, sc)));
  };
  // 가운데·바닥 높이로 놓는 상자
  const bx = (m, cx, y0, cz, w, h, d, col = false) => B.box(m, cx - w / 2, y0, cz - d / 2, cx + w / 2, y0 + h, cz + d / 2, col);

  /* ================= 뼈대 ================= */
  // 탑 바닥판(원에서 본채 쪽을 잘라 낸 꼴)
  const seg = [];
  for (let i = 0; i <= 64; i++) { const a = HA + (2 * PI - 2 * HA) * i / 64; seg.push(new THREE.Vector2(R * Math.cos(a), R * Math.sin(a))); }
  const segShape = new THREE.Shape(seg);
  const towerSlab = (m, y0, y1) => { const g = new THREE.ExtrudeGeometry(segShape, { depth: y1 - y0, bevelEnabled: false }); g.rotateX(-PI / 2); B.geo(m, g, mat4(CX, y0, CZ)); };
  const discCollide = (y0, y1) => { for (let x = -4; x < 3; x += 0.5) { const xm = Math.min(Math.abs(x), Math.abs(x + 0.5)); addCollider(CX + x, y0, CZ - Math.sqrt(15.2 - xm * xm), CX + x + 0.5, y1, CZ + Math.sqrt(15.2 - xm * xm)); } };

  const FL = [
    { y: 0.2, top: 3.2, n: [[-51.8, -50.4, 'w']], s: [[-52, -50.6, 'd'], [-48.5, -46.5, 'w'], [-44, -42.4, 'w']], e: [[-23, -21.5, 'w']] },
    { y: 3.4, top: 6.4, n: [[-51, -49.2, 'w'], [-45, -43.2, 'w']], s: [[-51.2, -50, 'd'], [-49.4, -48, 'w'], [-46.8, -45.4, 'w'], [-44.6, -43.4, 'd']], e: [[-24, -22.2, 'w']] },
    { y: 6.6, top: 9.8, n: [[-50.6, -49, 'w'], [-47.6, -46.4, 'd'], [-44.5, -43, 'w']], s: [[-52.2, -50.8, 'w'], [-50, -48.8, 'd'], [-47.8, -45.4, 'w'], [-44.4, -42.8, 'w']], e: [[-25.5, -24, 'w']] },
  ];
  const TW = [[1.35, 1.79], [2.92, 3.36], [4.49, 4.93]];   // 탑의 창(남·서·북)
  const SIDE = { n: ['x', BZ0, BZ0 + T, -1], s: ['x', BZ1 - T, BZ1, 1], e: ['z', BX1 - T, BX1, 1] };
  B.box(CONC, BX0 - 0.1, 0, BZ0 - 0.1, BX1 + 0.1, 0.14, BZ1 + 0.1, false);                 // 기단
  FL.forEach((f, fi) => {
    const { y, top } = f, ys = k => (k === 'd' ? [[y, y + 2.3]] : [[y + 1.0, y + 2.3]]);
    // 바닥판: 아래는 회칠 천장, 위는 마루
    B.box(M.white, BX0, y - 0.2, BZ0 - (fi ? 0.06 : 0), BX1 + (fi ? 0.06 : 0), y - 0.02, BZ1 + (fi ? 0.06 : 0), false);
    B.box(M.floor, BX0, y - 0.02, BZ0, BX1, y, BZ1, false);
    addCollider(BX0, y - 0.2, BZ0, BX1, y, BZ1);
    towerSlab(M.white, y - 0.2, y - 0.02); towerSlab(M.floor, y - 0.02, y); discCollide(y - 0.2, y);
    if (fi) roundWall(B, CONC, CX, CZ, R, R + 0.06, y - 0.2, y, [], { a0: HA + 0.03, a1: 2 * PI - HA - 0.03, collide: false });
    // 벽
    const ops = {};
    for (const k of ['n', 's', 'e']) ops[k] = f[k].map(o => ({ u0: o[0], u1: o[1], ys: ys(o[2]) }));
    ops.w = [{ u0: CZ - 2.2, u1: CZ + 2.2, ys: [[y, y + 2.6]] }];                          // 탑으로 트인 넓은 아치
    boxWalls(B, WALLM, BX0, BZ0, BX1, BZ1, y, top, ops, T);
    roundWall(B, TOWER, CX, CZ, RI, R, y, top, TW.map(w => ({ a0: w[0], a1: w[1], ys: [[y + 1.0, y + 2.3]] })), { a0: HA, a1: 2 * PI - HA });
    for (const w of TW) roundWindow(B, CX, CZ, RI, R, w[0], w[1], y + 1.0, y + 2.3, { frame: TRIM });
    for (const k of ['n', 's', 'e']) for (const o of f[k]) {
      const [ax, f0, f1, out] = SIDE[k];
      if (o[2] === 'w') windowUnit(B, ax, f0, f1, o[0], o[1], y + 1.0, y + 2.3, { frame: TRIM, out, nx: o[1] - o[0] > 2 ? 3 : 2 });
      else doorUnit(B, ax, f0, f1, o[0], o[1], y, y + 2.3, { frame: TRIM, leafMat: TRIM, inward: -out });
    }
  });
  // 칸막이: 1층 창고 벽(문 뚫림), 2층 두 셋방 사이
  wall(B, WALLM, 'z', -45, -44.85, BZ0 + T, BZ1 - T, 0.2, 3.2, [{ u0: -21, u1: -19.8, ys: [[0.2, 2.4]] }]);
  doorUnit(B, 'z', -45, -44.85, -21, -19.8, 0.2, 2.4, { frame: DARKW, leaf: null });
  wall(B, WALLM, 'z', -47.4, -47.2, BZ0 + T, BZ1 - T, 3.4, 6.4);

  // 옥상 바닥·난간벽, 탑 머리
  B.box(M.white, BX0, 9.8, BZ0 - 0.06, BX1 + 0.06, 9.92, BZ1 + 0.06, false); B.box(CONC, BX0, 9.92, BZ0 - 0.06, BX1 + 0.06, YR, BZ1 + 0.06, false);
  addCollider(BX0, 9.8, BZ0, BX1, YR, BZ1);
  towerSlab(M.white, 9.8, YR);
  const PY = YR + 0.9;
  B.box(WALLM, BX0, YR, BZ0, BX1, PY, BZ0 + T); B.box(WALLM, BX0, YR, BZ1 - T, BX1, PY, BZ1);
  B.box(WALLM, BX1 - T, YR, BZ0, BX1, PY, -23.3); B.box(WALLM, BX1 - T, YR, -21.8, BX1, PY, BZ1);
  B.box(WALLM, BX0, YR, BZ0, BX0 + T, PY, -24.6); B.box(WALLM, BX0, YR, -19.4, BX0 + T, PY, BZ1);
  for (const [a, b, c, d] of [[BX0 - 0.05, BZ0 - 0.05, BX1 + 0.05, BZ0 + T + 0.05], [BX0 - 0.05, BZ1 - T - 0.05, BX1 + 0.05, BZ1 + 0.05], [BX1 - T - 0.05, BZ0, BX1 + 0.05, -23.3], [BX1 - T - 0.05, -21.8, BX1 + 0.05, BZ1]])
    B.box(CONC, a, PY, b, c, PY + 0.06, d, false);                                          // 난간벽 덮개돌
  roundWall(B, CONC, CX, CZ, R, R + 0.06, 9.8, YR, [], { a0: HA + 0.03, a1: 2 * PI - HA - 0.03, collide: false }); roundWall(B, TOWER, CX, CZ, RI, R, YR, 12, []);
  roundWall(B, TILE, CX, CZ, R, R + 0.05, 11.2, 11.45, [], { collide: false });             // 붉은 띠
  coneRoof(B, TILE, CX, CZ, 4.7, 12, 3.2, { seg: 32 });

  /* ================= 바깥 복도·계단 ================= */
  B.box(M.pave, -56.6, 0, BZ1, -38.8, 0.2, -12.8);                                         // 앞 포장
  B.box(M.pave, -52.2, 0, -12.8, -50.4, 0.08, -5.2);                                       // 골목에서 들어오는 길
  B.box(CONC, BX0, 3.2, BZ1, BX1, 3.4, GZ1); B.box(CONC, -50.3, 3.2, GZ1, -48.5, 3.4, SZ1); // 2층 복도·층계참
  B.box(CONC, -56.3, 6.4, BZ1, -39.6, 6.6, GZ1); B.box(CONC, -56.3, 6.4, GZ1, -54.8, 6.6, SZ1); // 3층 복도·층계참
  B.box(CONC, BX1, 9.8, -23.3, -39.6, YR, -21.8);                                          // 옥상 층계참
  stairs(B, CONC, 'x', -48.5, 1, 0.2, 3.4, GZ1 + 0.05, SZ1, 0.3, 0.2);
  stairs(B, CONC, 'x', -54.8, 1, 3.4, 6.6, GZ1 + 0.05, SZ1, 0.3, 0.2);
  stairs(B, CONC, 'z', -21.8, 1, 6.6, YR, BX1 + 0.05, -39.6, 0.3, 0.2);
  // 기울어진 난간과 계단 옆판
  const stairRail = (axis, f, uA, yA, uB, yB) => {
    const P = (u, y) => (axis === 'x' ? V(u, y, f) : V(f, y, u));
    beamBetween(B, TRIM, P(uA, yA + 1.0), P(uB, yB + 1.0), 0.08, 0.07); beamBetween(B, TRIM, P(uA, yA + 0.3), P(uB, yB + 0.3), 0.05, 0.05);
    beamBetween(B, TRIM, P(uA, yA - 0.2), P(uB, yB - 0.2), 0.07, 0.28);
    const n = Math.round(Math.abs(uB - uA) / 0.15);
    for (let k = 0; k <= n; k++) {
      const t = k / n, u = uA + (uB - uA) * t, y = yA + (yB - yA) * t, s = (k % 6 === 0 || k === n ? 0.08 : 0.028) / 2, h = k % 6 === 0 || k === n ? 1.05 : 0.98;
      if (axis === 'x') B.box(TRIM, u - s, y, f - s, u + s, y + h, f + s, false); else B.box(TRIM, f - s, y, u - s, f + s, y + h, u + s, false);
      if (k < n) { const u2 = uA + (uB - uA) * (k + 1) / n; if (axis === 'x') addCollider(u, y - 0.2, f - 0.05, u2, y + 1.1, f + 0.05); else addCollider(f - 0.05, y - 0.2, u, f + 0.05, y + 1.1, u2); }
    }
  };
  for (const f of [GZ1 + 0.1, SZ1 - 0.05]) { stairRail('x', f, -44, 0.2, -48.5, 3.4); stairRail('x', f, -50.3, 3.4, -54.8, 6.6); }
  stairRail('z', -39.65, -17, 6.6, -21.8, YR);
  railing(B, TRIM, [[-52.95, BZ1], [-52.95, GZ1 - 0.05], [-50.3, GZ1 - 0.05]], 3.4); railing(B, TRIM, [[-48.5, GZ1 - 0.05], [-41.05, GZ1 - 0.05], [-41.05, BZ1]], 3.4);
  railing(B, TRIM, [[-50.3, SZ1 - 0.05], [-48.5, SZ1 - 0.05]], 3.4);
  railing(B, TRIM, [[-54.8, SZ1 - 0.05], [-56.25, SZ1 - 0.05], [-56.25, BZ1 + 0.05], [BX0, BZ1 + 0.05]], 6.6);
  railing(B, TRIM, [[-54.8, GZ1 - 0.05], [-39.65, GZ1 - 0.05], [-39.65, BZ1]], 6.6);
  railing(B, TRIM, [[-39.65, -21.8], [-39.65, -23.25], [BX1, -23.25]], YR);
  // 받침 기둥(복도·층계참·옥상 층계참)
  for (const x of [-52.9, -48.3, -44.6, -41.1]) B.box(CONC, x - 0.08, 0.2, -15.38, x + 0.08, 9.5, -15.22);
  for (const x of [-56.2, -54.9]) for (const z of [-13.5, -15.1]) B.box(CONC, x - 0.07, 0.2, z - 0.07, x + 0.07, 6.4, z + 0.07);
  for (const x of [-50.2, -48.6]) B.box(CONC, x - 0.07, 0.2, -13.57, x + 0.07, 3.2, -13.43);
  for (const z of [-23.2, -21.9]) B.box(CONC, -39.77, 0, z - 0.07, -39.63, 9.8, z + 0.07);
  // 3층 복도 위 눈썹지붕(붉은 기와)
  {
    const x0 = -53.4, x1 = -39.3, zE = -14.5, yE = 9.5, yT = 10.4, Vn = V(0, yT - yE, BZ1 - zE).normalize(), len = Math.hypot(yT - yE, BZ1 - zE);
    tilePanel(B, TILE, V(x0, yE, zE), V(1, 0, 0), Vn, x1 - x0, len);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([x0, yE - 0.02, zE, x1, yE - 0.02, zE, x1, yT - 0.02, BZ1, x0, yT - 0.02, BZ1], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, x1 - x0, 0, x1 - x0, len, 0, len], 2));
    g.setIndex([0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2]); g.computeVertexNormals(); B.geo(DARKW, g);
    for (let x = x0 + 0.1; x < x1; x += 0.8) beamBetween(B, DARKW, V(x, yT - 0.1, BZ1), V(x, yE - 0.07, zE + 0.03), 0.07, 0.11);
    beamBetween(B, DARKW, V(x0, yE - 0.02, zE), V(x1, yE - 0.02, zE), 0.07, 0.14); beamBetween(B, DARKW, V(x0, 9.56, -15.3), V(x1, 9.56, -15.3), 0.12, 0.14);
  }

  /* ================= 살림살이 부품 ================= */
  const chair = (x, y, z, ry, m = WOOD) => {
    const P = at(x, y, z, ry);
    P(m, box(0.4, 0.035, 0.4), 0, 0.44, 0);
    for (const sx of [-1, 1]) { for (const sz of [-1, 1]) P(m, box(0.04, 0.44, 0.04), sx * 0.17, 0.22, sz * 0.17); P(m, box(0.04, 0.45, 0.04), sx * 0.17, 0.68, -0.18); }
    P(m, box(0.38, 0.07, 0.025), 0, 0.85, -0.18); P(m, box(0.38, 0.05, 0.025), 0, 0.66, -0.18);
    for (const sz of [-1, 1]) P(m, box(0.3, 0.03, 0.03), 0, 0.15, sz * 0.17);
    addCollider(x - 0.2, y, z - 0.2, x + 0.2, y + 0.45, z + 0.2);
  };
  const table = (x, y, z, w, d, h, m = WOOD) => {
    bx(m, x, y + h - 0.04, z, w, 0.04, d, true);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(m, x + sx * (w / 2 - 0.06), y, z + sz * (d / 2 - 0.06), 0.05, h - 0.04, 0.05);
    for (const s of [-1, 1]) { bx(m, x, y + h - 0.13, z + s * (d / 2 - 0.06), w - 0.14, 0.09, 0.025); bx(m, x + s * (w / 2 - 0.06), y + h - 0.13, z, 0.025, 0.09, d - 0.14); }
  };
  // 천장등: 줄·갓·전구
  const lamp = (x, yc, z, pow = 14) => {
    B.geo(BLACK, tube([V(x, yc, z), V(x, yc - 0.5, z)], 0.008, 5, false));
    B.geo(GREEN2, lathe([[0.2, -0.14], [0.06, 0], [0.03, 0.04]], 18), mat4(x, yc - 0.5, z));
    B.put(BULB, sph(0.05), x, yc - 0.6, z);
    lights.push([x, yc - 0.75, z, pow, 14]); glows.push([x, yc - 0.6, z, 0.8]);
  };
  // 화분: 질그릇 + 흙 + 잎(종류마다 다른 생김새)
  const LEAF = [leafGeo(0.26, 0.11, 1.0, 1.3), leafGeo(0.42, 0.05, 1.45, 0.25, 0.15), leafGeo(0.09, 0.06, 0.5, 0.8), leafGeo(0.07, 0.045, 0.9, 0.5, 0.1, 3), leafGeo(0.2, 0.08, 0.2, 1.4)];
  const potG = lathe([[0, 0], [0.06, 0], [0.085, 0.12], [0.095, 0.125], [0.095, 0.14], [0.075, 0.14], [0.06, 0.02], [0, 0.02]], 14);
  const plant = (x, y, z, kind, s = 1) => {
    const P = at(x, y, z, R0() * 6, s);
    P(POT, potG); P(SOIL, cylG(0.07, 0.07, 0.01, 12), 0, 0.118, 0);
    if (kind === 0) for (let i = 0; i < 11; i++) P(i % 2 ? GREEN : GREEN2, LEAF[0], 0, 0.12, 0, 0, i * 2.4, 0, 0.75 + R0() * 0.5);          // 넓은 잎이 방사꼴로
    else if (kind === 1) for (let i = 0; i < 9; i++) P(i % 3 ? GREEN2 : GREEN, LEAF[1], (R0() - 0.5) * 0.04, 0.12, (R0() - 0.5) * 0.04, 0, i * 2.4, 0, 0.7 + R0() * 0.6);   // 곧게 선 칼잎
    else if (kind === 2) {                                                                                                                   // 줄기에 잎이 어긋나 달리고 끝에 꽃
      for (let k = 0; k < 3; k++) {
        const a = k * 2.1 + R0(), h = 0.26 + R0() * 0.14, tx = Math.cos(a) * 0.05, tz = Math.sin(a) * 0.05;
        B.geo(GREEN2, tube([V(0, 0.12, 0), V(tx * 0.5, 0.12 + h * 0.5, tz * 0.5), V(tx, 0.12 + h, tz)], 0.006, 5, false), mat4(x, y, z, 0, 0, 0, s));
        for (let i = 1; i < 6; i++) P(GREEN, LEAF[2], tx * i / 6, 0.12 + h * i / 6, tz * i / 6, 0, i * 2.4 + a, 0);
        for (let i = 0; i < 6; i++) P(k === 1 ? YEL : PINK, LEAF[3], tx, 0.12 + h, tz, 0, i * PI / 3, 0);
        P(YEL, sph(0.014, 8, 6), tx, 0.125 + h, tz);
      }
    } else for (let i = 0; i < 14; i++) P(i % 2 ? GREEN : GREEN2, LEAF[4], 0, 0.13, 0, 0, i * 2.4, 0, 0.6 + R0() * 0.9);                     // 화분 밖으로 늘어지는 잎
  };
  // 컵라면: 컵·붉은 띠·(열린 것은) 국물·면발·나루토 어묵·젓가락·젖혀진 뚜껑
  const cupG = lathe([[0, 0], [0.045, 0], [0.062, 0.105], [0.067, 0.11], [0.06, 0.11], [0.044, 0.008], [0, 0.008]], 18);
  const cup = (x, y, z, ry = 0, open = true) => {
    const P = at(x, y, z, ry);
    P(WHITE, cupG); P(RED, cylG(0.052, 0.058, 0.04, 18, true), 0, 0.06, 0);
    if (!open) { P(WHITE, cylG(0.068, 0.068, 0.006, 18), 0, 0.112, 0); P(RED, cylG(0.04, 0.04, 0.002, 14), 0, 0.116, 0); return; }
    P(ORANGE, cylG(0.056, 0.056, 0.004, 16), 0, 0.088, 0);
    for (let i = 0; i < 16; i++) {                                           // 꼬불꼬불한 면발
      const a0 = R0() * 6, r0 = 0.012 + R0() * 0.034, pts = [];
      for (let k = 0; k <= 14; k++) { const a = a0 + k * 0.42, r = r0 + 0.006 * Math.sin(k * 2.2); pts.push(V(Math.cos(a) * r, 0.092 + 0.004 * Math.sin(k * 1.7 + i) + i * 0.0004, Math.sin(a) * r)); }
      P(YEL, tube(pts, 0.0035, 5, false));
    }
    P(WHITE, cylG(0.016, 0.016, 0.005, 12), -0.02, 0.099, 0.018); P(PINK, new THREE.TorusGeometry(0.008, 0.002, 4, 10, 4.6), -0.02, 0.1022, 0.018, PI / 2);
    for (const s of [0, 1]) P(WOOD, tube([V(0.0, 0.085, -0.012 + s * 0.016), V(0.2, 0.19, -0.004 + s * 0.03)], t => 0.0028 + 0.002 * t, 5), 0, 0, 0);
    P(PAPER, new THREE.CircleGeometry(0.066, 16, 0, PI), -0.062, 0.115, 0, 0, PI / 2, 0); // 반쯤 뜯어 세운 뚜껑
  };
  const milk = (x, y, z, ry = 0) => {
    const P = at(x, y, z, ry);
    P(WHITE, box(0.07, 0.15, 0.07), 0, 0.075, 0); P(BLUE, box(0.072, 0.05, 0.072), 0, 0.07, 0);
    const g = new THREE.CylinderGeometry(0.001, 0.0495, 0.035, 4, 1); g.rotateY(PI / 4); g.scale(1, 1, 1);
    P(WHITE, g, 0, 0.1675, 0, 0, 0, 0, [1, 1, 1]); P(WHITE, box(0.07, 0.022, 0.004), 0, 0.19, 0);
  };
  // 두루마리: 감긴 것 / 펼쳐진 것
  const scroll = (x, y, z, ry, col, open = false) => {
    const P = at(x, y, z, ry);
    P(PAPER, cylG(0.026, 0.026, 0.3, 12), 0, 0.027, 0, 0, 0, PI / 2); P(col, cylG(0.0275, 0.0275, 0.09, 12), 0, 0.027, 0, 0, 0, PI / 2);
    for (const s of [-1, 1]) P(BLACK, cylG(0.012, 0.016, 0.03, 8), s * 0.165, 0.027, 0, 0, 0, s * PI / 2);
    if (open) {
      const g = new THREE.PlaneGeometry(0.28, 0.55, 1, 6); g.rotateX(-PI / 2);
      const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, 0.004 + 0.006 * Math.sin(p.getZ(i) * 14) + Math.max(0, p.getZ(i) - 0.2) * 0.25);
      g.computeVertexNormals(); P(PAPER, g, 0, 0, 0.29);
      for (let i = 0; i < 5; i++) P(BLACK, box(0.2 - (i % 2) * 0.06, 0.001, 0.012), -0.02, 0.012, 0.12 + i * 0.07);
    }
  };
  // 벽에 건 그림(ry: 그림이 보는 방향, 0 = +z)
  const hang = (m, x, y, z, ry, w, h, frame = DARKW) => {
    const P = at(x, y, z, ry);
    if (frame) P(frame, box(w + 0.05, h + 0.05, 0.02), 0, 0, 0.01);
    P(m, new THREE.PlaneGeometry(w, h), 0, 0, 0.022);
  };
  // 닌자 샌들 한 켤레
  const sandals = (x, y, z, ry) => { const P = at(x, y, z, ry); for (const s of [-0.07, 0.07]) { P(BLUE, box(0.09, 0.02, 0.24), s, 0.01, 0); P(BLUE, box(0.09, 0.05, 0.1), s, 0.045, 0.07); P(BLUE, box(0.09, 0.07, 0.02), s, 0.055, -0.11); } };
  // 상자(골판지) — 뚜껑 날개와 띠
  const carton = (x, y, z, w, h, d, ry = 0, label = null) => {
    const P = at(x, y, z, ry);
    P(CARD, box(w, h, d), 0, h / 2, 0); P(PAPER, box(w + 0.004, 0.002, 0.05), 0, h + 0.001, 0); P(PAPER, box(0.05, h * 0.3, d + 0.004), 0, h * 0.85, 0);
    if (label) P(label, new THREE.PlaneGeometry(w * 0.7, h * 0.5), 0, h * 0.45, d / 2 + 0.003);
  };
  const RAMEN = textMat('ラーメン', { w: 256, h: 128, color: '#b8322c', bg: '#f0e6cc', font: 'gothic' });

  /* ================= 1층 ================= */
  // 현관 홀: 우편함(2단 4칸), 신발장, 알림판, 우산꽂이, 긴 의자
  for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
    const x = -48.1 + c * 0.62, y = 1.1 + r * 0.42;
    B.box(STEEL, x, y, -26.8, x + 0.56, y + 0.36, -26.56, false);
    B.box(BLACK, x + 0.08, y + 0.25, -26.56, x + 0.48, y + 0.28, -26.553, false);
    B.box(PAPER, x + 0.16, y + 0.1, -26.56, x + 0.4, y + 0.17, -26.553, false);
    B.put(BLACK, sph(0.015, 8, 6), x + 0.5, y + 0.13, -26.55);
    if ((r * 4 + c) % 3 === 1) B.geo(PAPER, box(0.2, 0.003, 0.12), mat4(x + 0.28, y + 0.268, -26.52, 0.25, 0, 0));   // 삐져나온 편지
  }
  signBoard(B, '郵便', -46.9, 2.15, -26.78, 0, 0.5, 0.2, { both: false, font: 'gothic', depth: 0.03 });
  {
    const x0 = -48.4, x1 = -46.6, z0 = -17.58, z1 = -17.22;                                 // 신발장
    addCollider(x0, 0.2, z0, x1, 1.1, z1); B.box(WOOD, x0, 0.2, z1 - 0.02, x1, 1.1, z1, false);
    for (const x of [x0, (x0 + x1) / 2 - 0.015, x1 - 0.03]) B.box(WOOD, x, 0.2, z0, x + 0.03, 1.1, z1, false);
    for (let i = 0; i < 4; i++) { const y = i === 3 ? 1.07 : 0.24 + i * 0.28; B.box(WOOD, x0, y, z0, x1, y + 0.03, z1, false); if (i < 3) for (let k = 0; k < 4; k++) if ((i + k) % 3) sandals(x0 + 0.27 + k * 0.42, y + 0.03, (z0 + z1) / 2, PI); }
    plant(-47.9, 1.1, -17.4, 0, 1.1); plant(-47.0, 1.1, -17.4, 2);
  }
  {
    const P = at(-45.0, 1.65, -24.7, -PI / 2);                                              // 알림판(창고 벽)
    P(DARKW, box(1.8, 0.95, 0.03), 0, 0, 0.015); P(mat('plain', 0x6f8a55), box(1.7, 0.85, 0.01), 0, 0, 0.032);
    for (let i = 0; i < 6; i++) { P(PAPER, new THREE.PlaneGeometry(0.2 + (i % 2) * 0.06, 0.28), -0.65 + i * 0.26, (i % 2 ? 0.12 : -0.1), 0.04, 0, 0, (R0() - 0.5) * 0.2); P(RED, sph(0.012, 6, 5), -0.65 + i * 0.26, (i % 2 ? 0.24 : 0.02), 0.045); }
  }
  {
    const P = at(-50.15, 0.2, -17.6);                                                       // 우산꽂이
    P(STEEL, cylG(0.13, 0.15, 0.5, 14, true), 0, 0.25, 0); P(STEEL, cylG(0.13, 0.13, 0.02, 14), 0, 0.01, 0);
    for (const [dx, dz, col] of [[0.04, 0.02, RED], [-0.05, -0.03, BLUE]]) {
      P(col, tube([V(dx, 0.05, dz), V(dx * 1.6, 0.45, dz * 1.6), V(dx * 2, 0.8, dz * 2)], t => 0.012 + 0.03 * Math.sin(t * PI) * (1 - t * 0.4), 8), 0, 0, 0);
      const hk = []; for (let i = 0; i <= 8; i++) { const a = i / 8 * PI; hk.push(V(dx * 2 + 0.03 - 0.03 * Math.cos(a), 0.8 + 0.12 + 0.03 * Math.sin(a) - (i > 4 ? 0 : 0), dz * 2)); }
      P(DARKW, tube([V(dx * 2, 0.78, dz * 2), V(dx * 2, 0.92, dz * 2), ...hk], 0.009, 6), 0, 0, 0);
    }
  }
  { const z = -24.3, x = -52.45; bx(WOOD, x, 0.6, z, 0.4, 0.05, 1.6, true); for (const s of [-0.7, 0.7]) { bx(WOOD, x, 0.2, z + s, 0.36, 0.4, 0.06); } bx(WOOD, x, 0.32, z, 0.06, 0.06, 1.4); }   // 긴 의자
  B.geo(mat('plain', 0x8a4a3a), cylG(1.5, 1.5, 0.012, 36), mat4(-49.2, 0.206, -22.2)); B.geo(YEL, new THREE.TorusGeometry(1.3, 0.03, 4, 40), mat4(-49.2, 0.212, -22.2, PI / 2));   // 깔개와 탁자
  table(-49.2, 0.2, -22.2, 0.9, 0.9, 0.7); chair(-49.2, 0.2, -21.45, PI); chair(-49.2, 0.2, -22.95, 0); chair(-48.45, 0.2, -22.2, -PI / 2);
  { const P = at(-49.3, 0.9, -22.15, 0.4); P(PAPER, box(0.42, 0.006, 0.3), 0, 0.003, 0); for (let i = 0; i < 6; i++) P(BLACK, box(0.16, 0.001, 0.008), -0.1 + (i % 2) * 0.2, 0.007, -0.1 + (i >> 1) * 0.08); plant(-48.95, 0.9, -22.4, 2, 0.9); }
  B.box(mat('plain', 0x7a5a3a), -52.1, 0.2, -18.5, -50.5, 0.215, -17.5, false);                                             // 현관 깔개
  plant(-45.5, 0.2, -17.7, 1, 2.6); plant(-52.3, 0.2, -26.3, 0, 2.6); addCollider(-45.75, 0.2, -17.95, -45.25, 1.2, -17.45); addCollider(-52.55, 0.2, -26.55, -52.05, 0.9, -26.05);
  { const P = at(-45.0, 2.45, -22.4, -PI / 2); P(DARKW, cylG(0.2, 0.2, 0.04, 24), 0, 0, 0.02, PI / 2); P(WHITE, cylG(0.17, 0.17, 0.042, 24), 0, 0, 0.022, PI / 2); P(BLACK, box(0.012, 0.13, 0.004), 0, 0.06, 0.046); P(BLACK, box(0.1, 0.012, 0.004), 0.05, 0, 0.046); for (let i = 0; i < 12; i++) P(BLACK, box(0.008, 0.025, 0.003), Math.sin(i * PI / 6) * 0.15, Math.cos(i * PI / 6) * 0.15, 0.045, 0, 0, -i * PI / 6); }   // 벽시계
  lamp(-49, 3.2, -22);
  // 창고: 선반(상자·깡통), 나무 궤짝, 빗자루, 양동이, 사다리
  for (const [z0, z1] of [[-26.6, -23.6], [-21.0, -18.2]]) {
    for (const z of [z0, z1]) for (const x of [-41.75, -41.27]) bx(STEEL, x, 0.2, z, 0.04, 2.0, 0.04);
    for (let i = 0; i < 4; i++) B.box(WOOD, -41.78, 0.5 + i * 0.5, z0, -41.22, 0.53 + i * 0.5, z1, false);
    addCollider(-41.8, 0.2, z0, -41.2, 2.2, z1);
    for (let i = 0; i < 4; i++) for (let k = 0; k < 3; k++) {
      const z = z0 + 0.45 + k * (z1 - z0 - 0.9) / 2, y = 0.53 + i * 0.5, q = (i * 3 + k + (z0 < -22 ? 0 : 1)) % 4;
      if (q === 0) carton(-41.5, y, z, 0.5, 0.3, 0.4, -PI / 2, RAMEN);
      else if (q === 1) for (const dz of [-0.14, 0.14]) { const P = at(-41.5, y, z + dz); P(STEEL, cylG(0.09, 0.09, 0.2, 12), 0, 0.1, 0); P(k ? RED : BLUE, cylG(0.092, 0.092, 0.1, 12, true), 0, 0.1, 0); P(BLACK, new THREE.TorusGeometry(0.08, 0.004, 4, 12, PI), 0, 0.2, 0); }
      else if (q === 2) { scroll(-41.5, y, z - 0.1, 0.2, RED); scroll(-41.5, y, z + 0.05, -0.1, BLUE); scroll(-41.5, y + 0.05, z - 0.03, 0.05, GREEN2); }
    }
  }
  for (const [x, z, n] of [[-44.25, -26.2, 3], [-43.3, -26.3, 2]]) for (let i = 0; i < n; i++) {   // 나무 궤짝(널 사이 틈과 띠)
    const y = 0.2 + i * 0.46, P = at(x + (i % 2) * 0.04, y, z, i * 0.12);
    P(WOOD, box(0.8, 0.44, 0.6), 0, 0.22, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P(DARKW, box(0.05, 0.45, 0.05), sx * 0.385, 0.225, sz * 0.285);
    for (const k of [0.11, 0.33]) for (const sz of [-1, 1]) P(DARKW, box(0.72, 0.012, 0.01), 0, k, sz * 0.302);
    if (i === n - 1) addCollider(x - 0.42, 0.2, z - 0.32, x + 0.46, y + 0.44, z + 0.32);
  }
  for (const [x, lean, col] of [[-43.6, 0.16, YEL], [-43.2, 0.2, CARD]]) {                  // 빗자루(수숫대 솔)
    const P = at(x, 0.2, -17.75, 0);
    P(WOOD, tube([V(0, 0.3, 0), V(0, 1.5, lean * 1.9)], 0.014, 6), 0, 0, 0);
    for (let i = 0; i < 16; i++) { const a = (i - 7.5) * 0.045; P(col, tube([V(0, 0.34, 0.01), V(Math.sin(a) * 0.3, 0.02, -0.05 + (i % 3) * 0.012)], t => 0.012 - 0.006 * t, 4), 0, 0, 0); }
    P(RED, cylG(0.03, 0.03, 0.05, 8), 0, 0.31, 0.005);
  }
  {
    const P = at(-42.1, 0.2, -18.0);                                                        // 양동이와 걸레
    P(STEEL, lathe([[0, 0], [0.11, 0], [0.15, 0.28], [0.155, 0.29], [0.14, 0.28], [0.1, 0.012], [0, 0.012]], 16));
    const hd = []; for (let i = 0; i <= 10; i++) { const a = i / 10 * PI; hd.push(V(Math.cos(a) * 0.15, 0.27 + Math.sin(a) * 0.05, Math.sin(a) * 0.14)); }
    P(BLACK, tube(hd, 0.005, 5, false)); P(WHITE, drapeGeo(0.2, 0.12, 0.16), 0.02, 0.29, -0.145, 0, 0.2, 0);
    addCollider(-42.25, 0.2, -18.15, -41.95, 0.5, -17.85);
  }
  for (const s of [-0.2, 0.2]) beamBetween(B, WOOD, V(-44.1, 0.2, -22.6 + s), V(-44.8, 2.6, -22.6 + s), 0.04, 0.07);   // 벽에 기댄 사다리
  for (let i = 1; i < 9; i++) B.geo(WOOD, tube([V(-44.1 - i * 0.078, 0.2 + i * 0.267, -22.8), V(-44.1 - i * 0.078, 0.2 + i * 0.267, -22.4)], 0.015, 6));
  // 세탁실(탑): 세탁기, 빨래통과 빨래판, 건조대, 바구니, 온수통과 배관
  {
    const P = at(-59.0, 0.2, -22, PI / 2);                                                  // 세탁기(앞이 동쪽)
    P(WHITE, box(0.62, 0.84, 0.56), 0, 0.42, 0); P(STEEL, box(0.62, 0.1, 0.1), 0, 0.89, -0.23); P(STEEL, box(0.5, 0.02, 0.4), 0, 0.85, 0.05);
    P(BLACK, box(0.52, 0.004, 0.42), 0, 0.842, 0.05); for (const dx of [-0.2, -0.05]) P(BLACK, cylG(0.03, 0.03, 0.03, 10), dx, 0.9, -0.17, PI / 2);
    P(BLUE, box(0.12, 0.03, 0.01), 0.18, 0.9, -0.178); for (const sx of [-1, 1]) for (const sz of [-1, 1]) P(BLACK, cylG(0.025, 0.025, 0.03, 8), sx * 0.26, -0.0, sz * 0.23);
    P(BLACK, tube([V(0.25, 0.7, -0.28), V(0.4, 0.5, -0.3), V(0.45, 0.1, -0.2), V(0.6, 0.03, 0.1)], 0.018, 6), 0, 0, 0);
    addCollider(-59.3, 0.2, -22.35, -58.7, 1.15, -21.65);
  }
  {
    const P = at(-56.3, 0.2, -24.7);                                                        // 나무 빨래통(쇠테) + 빨래판
    P(WOOD, lathe([[0, 0], [0.3, 0], [0.36, 0.3], [0.37, 0.3], [0.34, 0.3], [0.29, 0.03], [0, 0.03]], 20));
    for (const y of [0.07, 0.23]) P(STEEL, new THREE.TorusGeometry(0.315 + y * 0.2, 0.008, 5, 24), 0, y, 0, PI / 2);
    P(M.water, cylG(0.33, 0.33, 0.004, 20), 0, 0.2, 0);
    const Q = at(-56.3, 0.2, -24.7, 0.5);
    Q(WOOD, box(0.3, 0.6, 0.025), 0, 0.42, -0.1, -0.5); for (let i = 0; i < 10; i++) Q(STEEL, cylG(0.008, 0.008, 0.24, 5), 0, 0.26 + i * 0.03, -0.0 - i * 0.0165 - 0.005, 0, 0, PI / 2);
    addCollider(-56.67, 0.2, -25.07, -55.93, 0.52, -24.33);
  }
  {
    const x = -56.2, z = -19.6;                                                             // 건조대: A꼴 다리, 봉 세 줄, 수건
    for (const sx of [-0.55, 0.55]) for (const sz of [-1, 1]) B.geo(STEEL, tube([V(x + sx, 0.2, z + sz * 0.3), V(x + sx, 1.25, z)], 0.012, 6));
    for (const [dy, dz] of [[1.25, 0], [0.95, 0.1], [0.95, -0.1]]) B.geo(STEEL, tube([V(x - 0.6, 0.2 + dy - 0.2 * 0 - 0.2, z + dz), V(x + 0.6, dy, z + dz)].map((p, i) => (p.y = dy, p)), 0.009, 6));
    B.geo(WHITE, drapeGeo(0.36, 0.5, 0.4), mat4(x - 0.3, 1.25, z)); B.geo(ORANGE, drapeGeo(0.3, 0.35, 0.45), mat4(x + 0.25, 1.25, z)); B.geo(BLUE, drapeGeo(0.3, 0.3, 0.28), mat4(x, 0.95, z + 0.1));
    addCollider(x - 0.6, 0.2, z - 0.3, x + 0.6, 1.3, z + 0.3);
    const P = at(-58.0, 0.2, -20.2);                                                        // 빨래 바구니(엮은 결)
    const pr = []; for (let i = 0; i <= 12; i++) pr.push([0.2 + i * 0.006 + (i % 2) * 0.008, i * 0.03]);
    P(CARD, lathe([[0, 0], ...pr, [0.26, 0.36], [0.25, 0.36], [0.19, 0.02], [0, 0.02]], 18)); P(WHITE, puff(box(0.36, 0.14, 0.36), 0.5), 0, 0.3, 0); P(ORANGE, puff(box(0.24, 0.1, 0.2), 0.5), 0.05, 0.36, 0.03, 0, 0.6);
    addCollider(-58.26, 0.2, -20.46, -57.74, 0.56, -19.94);
  }
  {
    const P = at(-57.9, 0.2, -24.2);                                                        // 온수통
    P(TANK, lathe([[0, 0.1], [0.28, 0.1], [0.3, 0.14], [0.3, 1.5], [0.24, 1.62], [0, 1.66]], 18));
    for (const y of [0.4, 1.2]) P(STEEL, new THREE.TorusGeometry(0.303, 0.01, 5, 20), 0, y, 0, PI / 2);
    for (let i = 0; i < 3; i++) P(BLACK, cylG(0.02, 0.02, 0.1, 6), Math.cos(i * 2.1) * 0.22, 0.05, Math.sin(i * 2.1) * 0.22);
    P(STEEL, tube([V(0, 1.64, 0), V(0, 2.2, 0), V(0.3, 2.5, 0.2), V(0.3, 3.0, 0.2)], 0.025, 8), 0, 0, 0);
    P(STEEL, tube([V(0.28, 0.5, 0.1), V(0.6, 0.5, 0.3), V(1.0, 0.45, 0.2), V(1.3, 0.4, -0.3)], 0.016, 6), 0, 0, 0); P(RED, cylG(0.04, 0.04, 0.02, 8), 0.3, 0.5, 0.1, 0, 0, PI / 2);
    addCollider(-58.2, 0.2, -24.5, -57.6, 1.9, -23.9);
  }

  /* ================= 2층: 셋방 두 칸 ================= */
  const Y2 = 3.4;
  // 서쪽 방(다다미): 둥근 밥상과 방석, 서랍장, 족자, 개어 둔 이불, 사방등, 분재
  B.box(M.tatami, -52.6, Y2, -26.6, -47.6, Y2 + 0.025, -19.3, false);
  {
    const P = at(-50.2, Y2, -23.3);
    P(DARKW, cylG(0.5, 0.5, 0.04, 28), 0, 0.31, 0); P(DARKW, cylG(0.4, 0.42, 0.05, 20, true), 0, 0.265, 0);
    for (let i = 0; i < 4; i++) P(DARKW, box(0.06, 0.27, 0.06), Math.cos(i * PI / 2 + 0.78) * 0.36, 0.135, Math.sin(i * PI / 2 + 0.78) * 0.36);
    P(mat('plain', 0x6a4a3a), lathe([[0, 0], [0.06, 0], [0.085, 0.05], [0.08, 0.1], [0.05, 0.12], [0, 0.125]], 14), 0.1, 0.33, 0.05);      // 찻주전자
    P(mat('plain', 0x6a4a3a), tube([V(0.17, 0.39, 0.05), V(0.22, 0.42, 0.05), V(0.24, 0.45, 0.05)], 0.01, 6), 0, 0, 0);
    const hd = []; for (let i = 0; i <= 8; i++) { const a = i / 8 * PI; hd.push(V(0.1 + Math.cos(a) * 0.06, 0.44 + Math.sin(a) * 0.06, 0.05)); } P(DARKW, tube(hd, 0.006, 5, false));
    for (const [dx, dz] of [[-0.15, 0.12], [-0.1, -0.2]]) P(WHITE, lathe([[0, 0], [0.025, 0], [0.035, 0.06], [0.03, 0.06], [0.02, 0.008], [0, 0.008]], 12), dx, 0.33, dz);
    addCollider(-50.7, Y2, -23.8, -49.7, Y2 + 0.33, -22.8);
    for (const [dx, dz, r] of [[0, 0.95, 0.1], [-0.95, -0.1, -0.2]]) B.geo(mat('plain', 0x6b4a8a), puff(new THREE.BoxGeometry(0.55, 0.09, 0.55, 6, 2, 6), 0.45), mat4(-50.2 + dx, Y2 + 0.07, -23.3 + dz, 0, r, 0));
  }
  const tansu = (x0, x1, y, z0, d, h, rows) => {                                            // 서랍장(앞이 +z)
    B.box(DARKW, x0, y, z0, x1, y + h, z0 + d, false); addCollider(x0, y, z0, x1, y + h, z0 + d);
    for (let i = 0; i < rows; i++) {
      const ya = y + 0.06 + i * (h - 0.1) / rows, yb = ya + (h - 0.1) / rows - 0.03;
      B.box(WOOD, x0 + 0.04, ya, z0 + d, x1 - 0.04, yb, z0 + d + 0.015, false);
      for (const t of [0.25, 0.75]) B.geo(M.iron, new THREE.TorusGeometry(0.03, 0.006, 4, 10, PI), mat4(x0 + (x1 - x0) * t, (ya + yb) / 2, z0 + d + 0.02, 0, 0, PI));
    }
  };
  tansu(-48.9, -47.6, Y2, -26.8, 0.45, 1.3, 4);
  plant(-48.25, Y2 + 1.3, -26.55, 3, 1.2);
  {
    const P = at(-47.4, Y2 + 1.9, -22.5, -PI / 2);                                          // 족자
    P(mat('plain', 0x5a6d8a), box(0.5, 1.4, 0.006), 0, 0, 0.004);
    P(textMat('火の意志', { w: 128, h: 512, vertical: true, bg: '#efe6cc', color: '#1a1410' }), new THREE.PlaneGeometry(0.36, 1.1), 0, 0.02, 0.009);
    for (const y of [0.72, -0.72]) P(DARKW, cylG(0.018, 0.018, 0.58, 8), 0, y, 0.012, 0, 0, PI / 2);
  }
  {
    const P = at(-57.6, Y2, -23.7, 0.5);                                                    // 개어 둔 이불과 베개
    for (let i = 0; i < 3; i++) P(i === 1 ? BLUE : WHITE, puff(new THREE.BoxGeometry(1.0, 0.16, 0.7, 8, 2, 6), 0.25), 0, 0.085 + i * 0.14, 0);
    P(WHITE, puff(new THREE.BoxGeometry(0.45, 0.14, 0.3, 6, 2, 5), 0.5), 0.1, 0.5, 0);
    addCollider(-58.15, Y2, -24.2, -57.05, Y2 + 0.45, -23.2);
  }
  const andon = (x, y, z) => {                                                              // 사방등
    const P = at(x, y, z);
    P(DARKW, box(0.3, 0.03, 0.3), 0, 0.015, 0); P(DARKW, box(0.3, 0.03, 0.3), 0, 0.72, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P(DARKW, box(0.025, 0.72, 0.025), sx * 0.13, 0.36, sz * 0.13);
    P(M.shoji, box(0.25, 0.6, 0.25), 0, 0.37, 0); for (const yy of [0.25, 0.5]) P(DARKW, box(0.265, 0.012, 0.265), 0, yy, 0);
    const hd = []; for (let i = 0; i <= 8; i++) { const a = i / 8 * PI; hd.push(V(Math.cos(a) * 0.13, 0.73 + Math.sin(a) * 0.12, 0)); } P(DARKW, tube(hd, 0.008, 5, false));
    glows.push([x, y + 0.4, z, 0.7]); addCollider(x - 0.15, y, z - 0.15, x + 0.15, y + 0.75, z + 0.15);
  };
  andon(-57.9, Y2, -20.4);
  { bx(DARKW, -59.0, Y2 + 0.4, -22, 0.4, 0.04, 0.4, true); for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(DARKW, -59.0 + sx * 0.16, Y2, -22 + sz * 0.16, 0.035, 0.4, 0.035); plant(-59.0, Y2 + 0.44, -22, 2, 1.3); }
  lamp(-50.5, 6.4, -22.3);
  signBoard(B, '貸室', -49.75, 5.1, -16.96, 0, 0.3, 0.18, { both: false, font: 'gothic', depth: 0.03 });
  // 동쪽 방(빈방): 맨 매트리스 침대, 책상과 의자, 책장, 이삿짐 상자
  {
    B.box(WOOD, -46.9, Y2 + 0.2, -26.75, -44.9, Y2 + 0.32, -25.75, false); addCollider(-46.9, Y2, -26.75, -44.9, Y2 + 0.48, -25.75);
    for (const x of [-46.85, -44.95]) for (const z of [-26.7, -25.8]) bx(WOOD, x, Y2, z, 0.07, 0.2, 0.07);
    B.box(WOOD, -46.95, Y2 + 0.1, -26.75, -46.9, Y2 + 0.85, -25.75, false);
    B.geo(mat('plain', 0xd8d2c0), puff(new THREE.BoxGeometry(1.96, 0.18, 0.96, 10, 2, 6), 0.12), mat4(-45.9, Y2 + 0.41, -26.25));
    for (let i = 0; i < 7; i++) B.box(BLUE, -46.7 + i * 0.27, Y2 + 0.495, -26.7, -46.66 + i * 0.27, Y2 + 0.5, -25.8, false);
    table(-41.55, Y2, -21.1, 0.6, 1.4, 0.74); B.box(WOOD, -41.84, Y2 + 0.55, -21.7, -41.3, Y2 + 0.69, -21.0, false); B.put(M.iron, sph(0.02, 8, 6), -41.86, Y2 + 0.62, -21.35);
    chair(-42.3, Y2, -21.1, -PI / 2);
    const x0 = -47.2, x1 = -46.9, z0 = -23.4, z1 = -22.4;                                   // 책장
    for (const z of [z0, z1 - 0.03]) B.box(WOOD, x0, Y2, z, x1, Y2 + 1.8, z + 0.03, false);
    for (let i = 0; i < 5; i++) B.box(WOOD, x0, Y2 + 0.05 + i * 0.43, z0, x1, Y2 + 0.08 + i * 0.43, z1, false);
    B.box(WOOD, x0, Y2, z0, x0 + 0.015, Y2 + 1.8, z1, false); addCollider(x0, Y2, z0, x1, Y2 + 1.8, z1);
    const cols = [RED, BLUE, GREEN2, CARD];
    for (let i = 0; i < 3; i++) for (let k = 0; k < (i === 1 ? 7 : 3); k++) { const h = 0.24 + ((i + k) % 3) * 0.04; B.box(cols[(i * 2 + k) % 4], x0 + 0.06, Y2 + 0.08 + i * 0.43, z0 + 0.06 + k * 0.055, x1 - 0.03, Y2 + 0.08 + i * 0.43 + h, z0 + 0.105 + k * 0.055, false); }
    scroll(-47.03, Y2 + 0.94 + 0.43, -22.9, PI / 2 + 0.1, RED);
    carton(-42.0, Y2, -18.0, 0.6, 0.45, 0.5, 0.2); carton(-42.1, Y2 + 0.45, -18.0, 0.45, 0.3, 0.4, -0.2); carton(-43.0, Y2, -17.8, 0.5, 0.35, 0.4, 0.5);
    addCollider(-42.4, Y2, -18.3, -41.6, Y2 + 0.75, -17.7);
    signBoard(B, '空室', -43.05, 5.1, -16.96, 0, 0.3, 0.18, { both: false, font: 'gothic', depth: 0.03 });
  }

  /* ================= 3층: 나루토의 방 ================= */
  const Y3 = 6.6;
  // 침대(탑, 서쪽 창가): 틀·머리판·요·구겨진 이불·베개·수면 모자
  {
    const x0 = -58.4, x1 = -57.3, z0 = -23.1, z1 = -21.0, xm = (x0 + x1) / 2;
    B.box(WOOD, x0, Y3 + 0.18, z0, x1, Y3 + 0.3, z1, false); addCollider(x0, Y3, z0, x1, Y3 + 0.5, z1);
    for (const x of [x0 + 0.05, x1 - 0.05]) for (const z of [z0 + 0.05, z1 - 0.05]) bx(WOOD, x, Y3, z, 0.08, 0.18, 0.08);
    B.box(WOOD, x0, Y3 + 0.18, z0 - 0.05, x1, Y3 + 0.95, z0, false); for (let i = 0; i < 2; i++) B.box(DARKW, x0 + 0.1 + i * 0.5, Y3 + 0.55, z0 - 0.002, x0 + 0.5 + i * 0.5, Y3 + 0.88, z0 + 0.006, false);
    B.box(WOOD, x0, Y3 + 0.18, z1, x1, Y3 + 0.6, z1 + 0.05, false);
    B.geo(WHITE, puff(new THREE.BoxGeometry(1.06, 0.2, 2.06, 8, 2, 12), 0.1), mat4(xm, Y3 + 0.4, (z0 + z1) / 2));
    B.geo(BLANKET, blanketGeo(1.08, 1.45, 0.3), mat4(xm, Y3 + 0.565, z1 - 0.75));
    B.geo(WHITE, puff(new THREE.BoxGeometry(0.6, 0.15, 0.36, 8, 2, 6), 0.55), mat4(xm, Y3 + 0.58, z0 + 0.27, 0, 0.12, 0));
    const P = at(xm + 0.12, Y3 + 0.64, z0 + 0.25, 0.7);                                     // 수면 모자: 끝이 늘어진 검은 고깔, 눈과 이빨
    P(BLACK, tube([V(0, 0, 0), V(0, 0.1, 0), V(0.05, 0.19, 0), V(0.14, 0.24, 0), V(0.24, 0.2, 0), V(0.3, 0.1, 0)], t => 0.1 * (1 - t) + 0.015, 12), 0, 0, 0);
    P(WHITE, new THREE.TorusGeometry(0.1, 0.02, 6, 16), 0, 0.01, 0, PI / 2); P(WHITE, sph(0.035, 8, 6), 0.31, 0.08, 0);
    for (const s of [-1, 1]) { P(WHITE, sph(0.022, 8, 6), -0.04, 0.09, s * 0.075); P(BLACK, sph(0.01, 6, 5), -0.05, 0.09, s * 0.092); }
    for (let i = 0; i < 4; i++) P(WHITE, new THREE.ConeGeometry(0.012, 0.03, 4), -0.085, 0.045, -0.04 + i * 0.027, PI);
  }
  {
    const x = -57.95, z = -23.75;                                                           // 머리맡 탁자: 7반 사진, 자명종
    bx(WOOD, x, Y3, z, 0.55, 0.5, 0.45, true); B.box(DARKW, x - 0.22, Y3 + 0.28, z + 0.225, x + 0.22, Y3 + 0.44, z + 0.235, false); B.put(M.iron, sph(0.015, 8, 6), x, Y3 + 0.36, z + 0.245);
    const photo = pic(256, 192, (g, w, h) => {
      g.fillStyle = '#9ec7e6'; g.fillRect(0, 0, w, h); g.fillStyle = '#5d8f4a'; g.fillRect(0, h * 0.7, w, h * 0.3);
      const fig = (cx, cy, s, hair, cloth) => { g.fillStyle = cloth; g.fillRect(cx - 20 * s, cy + 14 * s, 40 * s, 60 * s); g.fillStyle = '#f1cfa8'; g.beginPath(); g.arc(cx, cy, 16 * s, 0, 7); g.fill(); g.fillStyle = hair; g.beginPath(); g.arc(cx, cy - 4 * s, 17 * s, PI, 2 * PI); g.fill(); for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(cx + i * 7 * s - 5 * s, cy - 12 * s); g.lineTo(cx + i * 8 * s, cy - 28 * s); g.lineTo(cx + i * 7 * s + 5 * s, cy - 12 * s); g.fill(); } };
      fig(128, 62, 1.15, '#b9bcc4', '#3d5a45'); g.fillStyle = '#2a3550'; g.fillRect(110, 62, 36, 14);                       // 카카시(복면)
      fig(62, 112, 1, '#f0c93a', '#e5762b'); fig(128, 122, 1, '#e58aa0', '#b8322c'); fig(194, 112, 1, '#1d2030', '#2e5a9e');   // 나루토·사쿠라·사스케
    });
    const P = at(x - 0.08, Y3 + 0.5, z - 0.05, 0.5);
    P(DARKW, box(0.3, 0.24, 0.02), 0, 0.125, 0, -0.2); P(photo, new THREE.PlaneGeometry(0.25, 0.19), 0, 0.127, 0.0115, -0.2); P(DARKW, box(0.03, 0.2, 0.015), 0, 0.09, -0.06, 0.35);
    const Q = at(x + 0.16, Y3 + 0.5, z + 0.1, 0.3);
    Q(RED, cylG(0.055, 0.055, 0.04, 16), 0, 0.07, 0, PI / 2); Q(WHITE, cylG(0.047, 0.047, 0.042, 16), 0, 0.07, 0, PI / 2);
    Q(BLACK, box(0.004, 0.035, 0.002), 0, 0.085, 0.022); Q(BLACK, box(0.025, 0.004, 0.002), 0.012, 0.07, 0.022);
    for (const s of [-1, 1]) { Q(STEEL, sph(0.02, 8, 6), s * 0.035, 0.125, 0); Q(BLACK, cylG(0.005, 0.005, 0.03, 5), s * 0.03, 0.012, 0); }
  }
  B.geo(mat('plain', 0xc9743a), cylG(1.3, 1.3, 0.012, 36), mat4(-56.0, Y3 + 0.006, -21.6)); B.geo(mat('plain', 0xe9c765), new THREE.TorusGeometry(1.1, 0.03, 4, 40), mat4(-56.0, Y3 + 0.012, -21.6, PI / 2));   // 둥근 깔개
  lamp(-56.3, 9.8, -21.8, 12);
  // 식탁과 의자: 컵라면(먹던 것·빈 것), 우유팩, 물컵
  table(-45.6, Y3, -21.4, 0.9, 0.8, 0.72);
  chair(-45.6, Y3, -20.75, PI); chair(-46.35, Y3, -21.4, PI / 2);
  cup(-45.65, Y3 + 0.72, -21.3, 0.5, true); cup(-45.25, Y3 + 0.72, -21.6, 0, false); cup(-45.22, Y3 + 0.836, -21.6, 0.4, false);
  milk(-45.9, Y3 + 0.72, -21.55, 0.3);
  B.geo(M.glass, cylG(0.028, 0.034, 0.1, 12, true), mat4(-45.85, Y3 + 0.77, -21.2)); B.geo(WHITE, cylG(0.028, 0.031, 0.05, 12), mat4(-45.85, Y3 + 0.745, -21.2));
  { const P = at(-46.35, Y3 + 0.46, -21.4, PI / 2); cup(-46.35, Y3 + 0.4575, -21.4, 2, false); void P; }   // 의자 위에도 하나
  lamp(-46.5, 9.8, -22);
  // 부엌(동쪽 벽): 냉장고, 조리대(개수대·수도꼭지), 가스레인지와 주전자, 위 찬장
  {
    const FR = mat('plain', 0xdfe4dd, { rough: 0.45 });
    B.box(FR, -41.9, Y3 + 0.04, -26.75, -41.25, Y3 + 1.7, -26.05, false); addCollider(-41.9, Y3, -26.75, -41.2, Y3 + 1.7, -26.05);   // 냉장고(문이 서쪽)
    B.box(BLACK, -41.905, Y3 + 1.18, -26.75, -41.895, Y3 + 1.2, -26.05, false);
    for (const [ya, yb] of [[1.26, 1.5], [0.7, 1.1]]) B.box(STEEL, -41.95, Y3 + ya, -26.14, -41.9, Y3 + yb, -26.11, false);
    for (const x of [-41.85, -41.3]) for (const z of [-26.7, -26.1]) bx(BLACK, x, Y3, z, 0.05, 0.04, 0.05);
    cup(-41.6, Y3 + 1.7, -26.5, 0, false); cup(-41.45, Y3 + 1.7, -26.3, 1, false); cup(-41.6, Y3 + 1.816, -26.5, 2, false);
    hang(pic(128, 128, (g, w, h) => { g.fillStyle = '#f4efe2'; g.fillRect(0, 0, w, h); leafMark(g, w / 2, h / 2, 90, '#b8322c'); }), -41.905, Y3 + 1.45, -26.5, -PI / 2, 0.16, 0.16, null);
    const z0 = -25.95, z1 = -21.3, xa = -41.85, xb = -41.2, yT = Y3 + 0.85;                  // 조리대
    B.box(WOOD, xa + 0.03, Y3 + 0.08, z0, xb, yT - 0.21, z1, false); B.box(WOOD, xa + 0.03, yT - 0.21, z0, xb, yT - 0.04, -25.45, false); B.box(WOOD, xa + 0.03, yT - 0.21, -24.65, xb, yT - 0.04, z1, false); B.box(BLACK, xa + 0.06, Y3, z0, xb, Y3 + 0.08, z1, false); addCollider(xa, Y3, z0, xb, yT, z1);
    for (let i = 0; i < 5; i++) { const za = z0 + 0.04 + i * 0.93, zb = za + 0.86; B.box(DARKW, xa + 0.015, Y3 + 0.12, za, xa + 0.03, yT - 0.08, zb, false); B.put(M.iron, sph(0.016, 8, 6), xa + 0.005, yT - 0.2, zb - 0.08); }
    const s0 = -25.45, s1 = -24.65;                                                         // 개수대: 상판을 파고 통을 넣는다
    B.box(STEEL, xa, yT - 0.04, z0, xb, yT, s0, false); B.box(STEEL, xa, yT - 0.04, s1, xb, yT, z1, false);
    B.box(STEEL, xa, yT - 0.04, s0, xa + 0.1, yT, s1, false); B.box(STEEL, xb - 0.12, yT - 0.04, s0, xb, yT, s1, false);
    B.box(STEEL, xa + 0.1, yT - 0.2, s0, xb - 0.12, yT - 0.18, s1, false);
    for (const z of [s0, s1 - 0.01]) B.box(STEEL, xa + 0.1, yT - 0.2, z, xb - 0.12, yT - 0.04, z + 0.01, false);
    for (const x of [xa + 0.1, xb - 0.13]) B.box(STEEL, x, yT - 0.2, s0, x + 0.01, yT - 0.04, s1, false);
    B.put(BLACK, cylG(0.025, 0.025, 0.004, 10), -41.5, yT - 0.178, -25.05);
    B.geo(STEEL, tube([V(-41.26, yT, -25.05), V(-41.26, yT + 0.22, -25.05), V(-41.32, yT + 0.3, -25.05), V(-41.45, yT + 0.3, -25.05), V(-41.5, yT + 0.25, -25.05)], 0.014, 8));
    for (const s of [-0.09, 0.09]) { B.put(STEEL, cylG(0.018, 0.018, 0.05, 8), -41.26, yT, -25.05 + s); B.geo(s < 0 ? RED : BLUE, box(0.05, 0.012, 0.012), mat4(-41.26, yT + 0.055, -25.05 + s)); }
    B.geo(WHITE, lathe([[0, 0], [0.05, 0], [0.11, 0.05], [0.105, 0.05], [0.05, 0.008], [0, 0.008]], 14), mat4(-41.52, yT - 0.18, -25.25));   // 통 안의 그릇과 젓가락
    for (const s of [0, 1]) B.geo(WOOD, tube([V(-41.6, yT - 0.15, -25.3 + s * 0.02), V(-41.4, yT - 0.12, -25.15 + s * 0.02)], 0.003, 5));
    B.geo(YEL, puff(box(0.1, 0.035, 0.07), 0.3), mat4(-41.3, yT + 0.018, -24.5));           // 수세미
    const P = at(-41.52, yT, -23.2, PI / 2);                                                // 가스레인지(앞이 서쪽)
    P(BLACK, box(0.62, 0.1, 0.42), 0, 0.05, 0); P(STEEL, box(0.6, 0.006, 0.4), 0, 0.103, 0);
    for (const sx of [-0.16, 0.16]) {
      P(BLACK, new THREE.TorusGeometry(0.06, 0.012, 6, 16), sx, 0.115, 0, PI / 2); P(STEEL, cylG(0.03, 0.03, 0.012, 10), sx, 0.112, 0);
      for (let i = 0; i < 4; i++) P(BLACK, box(0.1, 0.012, 0.012), sx + Math.cos(i * PI / 2) * 0.07, 0.132, Math.sin(i * PI / 2) * 0.07, 0, -i * PI / 2, 0);
      P(BLACK, cylG(0.02, 0.02, 0.025, 10), sx, 0.05, 0.215, PI / 2); P(WHITE, box(0.004, 0.02, 0.004), sx, 0.058, 0.229);
    }
    P(ORANGE, tube([V(0.28, 0.05, -0.2), V(0.4, 0.04, -0.24), V(0.5, 0.2, -0.26), V(0.5, 0.6, -0.27)], 0.012, 6), 0, 0, 0);   // 가스 호스
    const K = at(-41.52, yT + 0.14, -23.36, 2.2);                                           // 주전자
    K(STEEL, lathe([[0, 0], [0.085, 0], [0.105, 0.03], [0.105, 0.085], [0.075, 0.125], [0.03, 0.135], [0.03, 0.14], [0, 0.14]], 18));
    K(BLACK, sph(0.016, 8, 6), 0, 0.152, 0); K(STEEL, tube([V(0.095, 0.05, 0), V(0.15, 0.085, 0), V(0.175, 0.13, 0)], t => 0.016 - 0.006 * t, 8), 0, 0, 0);
    const hd = []; for (let i = 0; i <= 10; i++) { const a = i / 10 * PI; hd.push(V(Math.cos(a) * 0.085, 0.12 + Math.sin(a) * 0.1, 0)); } K(BLACK, tube(hd, 0.008, 6, false));
    B.box(WOOD, -41.55, Y3 + 1.6, -23.9, xb, Y3 + 2.3, z1, false);                          // 위 찬장
    for (let i = 0; i < 3; i++) { const za = -23.87 + i * 0.86; B.box(DARKW, -41.565, Y3 + 1.64, za, -41.55, Y3 + 2.26, za + 0.8, false); B.put(M.iron, sph(0.014, 8, 6), -41.575, Y3 + 1.72, za + 0.72); }
    for (let i = 0; i < 4; i++) cup(-41.45, yT, -22.35 + i * 0.16, i, false);               // 쟁여 둔 컵라면
    for (let i = 0; i < 3; i++) cup(-41.45, yT + 0.116, -22.27 + i * 0.16, i + 1, false);
    carton(-42.3, Y3, -26.4, 0.5, 0.36, 0.4, 0.15, RAMEN); addCollider(-42.56, Y3, -26.62, -42.04, Y3 + 0.36, -26.18);
  }
  // 남쪽 큰 창 아래 화분 선반
  B.box(WOOD, -47.8, Y3 + 0.92, -17.55, -45.4, Y3 + 0.96, -17.2, false); for (const x of [-47.7, -46.6, -45.5]) beamBetween(B, WOOD, V(x, Y3 + 0.92, -17.5), V(x, Y3 + 0.6, -17.22), 0.03, 0.03);
  [[-47.55, 0, 1.1], [-47.1, 2, 1], [-46.65, 1, 1], [-46.2, 3, 1.2], [-45.7, 0, 0.9]].forEach(([x, k, s]) => plant(x, Y3 + 0.96, -17.38, k, s));
  plant(-52.35, Y3, -17.65, 1, 2.2); addCollider(-52.6, Y3, -17.9, -52.1, Y3 + 1.0, -17.4);
  plant(-51.5, Y3 + 1.0 + 0.0, -17.12, 3, 0.9);                                             // 작은 창턱에도
  // 서랍장(고글·화분), 벽에 건 주황 웃옷, 쓰레기통, 식탁 밑 깔개, 방석
  tansu(-52.7, -51.2, Y3, -26.8, 0.45, 0.95, 3); plant(-52.3, Y3 + 0.95, -26.55, 0, 1.1);
  { const P = at(-51.7, Y3 + 0.95, -26.55, 0.3); P(BLUE, new THREE.TorusGeometry(0.085, 0.012, 5, 16), 0, 0.012, 0, PI / 2, 0, 0, [1, 0.8, 1]); for (const s of [-1, 1]) { P(STEEL, cylG(0.036, 0.036, 0.03, 12), s * 0.04, 0.03, 0.062, PI / 2); P(M.glass, cylG(0.03, 0.03, 0.032, 12), s * 0.04, 0.03, 0.063, PI / 2); } }
  {
    const P = at(-52.78, Y3 + 1.15, -25.3, PI / 2);
    P(DARKW, box(0.6, 0.06, 0.02), 0, 0.72, 0.01); for (const dx of [-0.2, 0, 0.2]) P(M.iron, tube([V(dx, 0.72, 0.02), V(dx, 0.7, 0.07), V(dx, 0.73, 0.09)], 0.006, 5), 0, 0, 0);
    const JK = clothGeo([[0.3, 1], [0.42, 0.94], [0.58, 0.94], [0.7, 1], [1, 0.82], [0.95, 0.3], [0.8, 0.32], [0.78, 0.66], [0.76, 0], [0.24, 0], [0.22, 0.66], [0.2, 0.32], [0.05, 0.3], [0, 0.82]]);
    const OR2 = mat('plain', 0xe5762b, { side: 'double' });
    P(OR2, JK, -0.42, -0.1, 0.05, 0, 0, 0, [0.84, 0.8, 1]); P(BLUE, box(0.3, 0.1, 0.012), 0, 0.6, 0.056); P(BLUE, box(0.02, 0.62, 0.012), 0, 0.25, 0.058); P(WHITE, new THREE.TorusGeometry(0.1, 0.03, 6, 14, PI), 0, 0.66, 0.06, 0, 0, PI);
  }
  {
    const P = at(-41.75, Y3, -20.8);
    P(BLUE, lathe([[0, 0], [0.13, 0], [0.17, 0.36], [0.175, 0.37], [0.16, 0.36], [0.12, 0.012], [0, 0.012]], 16)); P(WHITE, puff(box(0.26, 0.1, 0.26), 0.5), 0, 0.3, 0);
    cup(-41.78, Y3 + 0.33, -20.83, 1, false); cup(-41.4, Y3, -20.6, 2, false); addCollider(-41.93, Y3, -20.98, -41.57, Y3 + 0.4, -20.62);
    const Q = at(-42.2, Y3 + 0.062, -20.7, 0.8); Q(WHITE, cupG, 0, 0, 0, 0, 0, PI / 2); Q(RED, cylG(0.052, 0.058, 0.04, 18, true), -0.06, 0, 0, 0, 0, PI / 2);   // 굴러다니는 빈 컵
  }
  B.box(mat('plain', 0x3f6b8a), -46.7, Y3, -22.3, -44.6, Y3 + 0.012, -20.3, false);
  for (const [x, z, r] of [[-50.9, -22.0, 0.3], [-49.3, -23.6, -0.4]]) B.geo(ORANGE, puff(new THREE.BoxGeometry(0.55, 0.1, 0.55, 6, 2, 6), 0.45), mat4(x, Y3 + 0.07, z, 0, r, 0));
  { const P = at(-50.3, Y3, -22.9, 0.5); P(DARKW, box(0.7, 0.03, 0.5), 0, 0.3, 0); for (const sx of [-1, 1]) for (const sz of [-1, 1]) P(DARKW, box(0.04, 0.3, 0.04), sx * 0.3, 0.15, sz * 0.2); addCollider(-50.6, Y3, -23.2, -50.0, Y3 + 0.32, -22.6); scroll(-50.3, Y3 + 0.315, -22.9, 1.1, RED, true); cup(-50.5, Y3 + 0.315, -22.75, 1, false); }
  // 벽: 달력, 나뭇잎 포스터, 이치라쿠 전단
  hang(pic(256, 384, (g, w, h) => {
    g.fillStyle = '#f4efe2'; g.fillRect(0, 0, w, h); g.fillStyle = '#b8322c'; g.fillRect(0, 0, w, 96);
    g.fillStyle = '#fff'; g.font = '900 64px "Yu Gothic", sans-serif'; g.textAlign = 'center'; g.fillText('10月', w / 2, 72);
    g.font = '700 26px "Yu Gothic", sans-serif';
    for (let d = 1; d <= 31; d++) { const c = (d + 3) % 7, r = Math.floor((d + 3) / 7); g.fillStyle = c === 0 ? '#b8322c' : '#2a2a2a'; g.fillText(String(d), 22 + c * 35, 140 + r * 46); }
    g.strokeStyle = '#b8322c'; g.lineWidth = 4; g.beginPath(); g.arc(22 + 3 * 35, 131 + 1 * 46, 18, 0, 7); g.stroke();   // 10월 10일(생일)에 동그라미
  }), -48.3, Y3 + 1.7, -17.2, PI, 0.4, 0.6, null);
  B.put(BLACK, sph(0.012, 6, 5), -48.3, Y3 + 2.02, -17.215);
  hang(pic(256, 340, (g, w, h) => { g.fillStyle = '#2e5a9e'; g.fillRect(0, 0, w, h); g.fillStyle = '#f4efe2'; g.fillRect(14, 14, w - 28, h - 28); leafMark(g, w / 2 + 8, h * 0.44, 190, '#1c2a44'); g.fillStyle = '#1c2a44'; g.font = '900 40px "Yu Mincho", serif'; g.textAlign = 'center'; g.fillText('木ノ葉', w / 2, h - 36); }), -45.5, Y3 + 1.6, -26.8, 0, 0.9, 1.2, null);
  hang(pic(256, 340, (g, w, h) => { g.fillStyle = '#e9c765'; g.fillRect(0, 0, w, h); g.fillStyle = '#b8322c'; g.font = '900 150px "Yu Mincho", serif'; g.textAlign = 'center'; g.fillText('一', w / 2, 130); g.fillText('楽', w / 2, 270); g.fillStyle = '#1a1410'; g.font = '700 30px "Yu Gothic", sans-serif'; g.fillText('ラーメン', w / 2, 320); }), -48.3, Y3 + 1.6, -26.8, 0, 0.5, 0.66, null);
  // 바닥: 흩어진 두루마리, 현관 깔개와 샌들
  [[-50.6, -21.4, 0.4, RED, true], [-49.8, -22.6, 1.9, BLUE, false], [-51.3, -23.0, -0.6, GREEN2, false], [-50.1, -20.3, 2.6, RED, false], [-51.6, -20.6, 1.2, BLUE, true], [-49.3, -24.2, 0.2, GREEN2, false], [-48.6, -21.2, -1.1, RED, false]]
    .forEach(([x, z, r, c, o]) => scroll(x, Y3, z, r, c, o));
  B.box(mat('plain', 0x7a5a3a), -49.9, Y3, -18.3, -48.9, Y3 + 0.015, -17.6, false); sandals(-49.3, Y3 + 0.015, -17.9, 0.3);
  signBoard(B, 'うずまき', -48.33, 8.15, -16.96, 0, 0.44, 0.15, { both: false, font: 'gothic', depth: 0.03 });
  // 발코니(북쪽): 바닥·난간·받침·기와 차양, 화분과 물뿌리개
  {
    const x0 = -49.2, x1 = -44.8, z0 = -28.4;
    B.box(CONC, x0, Y3 - 0.2, z0, x1, Y3, BZ0);
    railing(B, TRIM, [[x0 + 0.05, BZ0], [x0 + 0.05, z0 + 0.05], [x1 - 0.05, z0 + 0.05], [x1 - 0.05, BZ0]], Y3);
    for (const x of [x0 + 0.1, x1 - 0.1]) beamBetween(B, CONC, V(x, Y3 - 0.2, z0 + 0.1), V(x, Y3 - 1.3, BZ0), 0.1, 0.12);
    const yE = 9.1, yT = 9.65, zE = -28.6, Vn = V(0, yT - yE, BZ0 - zE).normalize(), len = Math.hypot(yT - yE, BZ0 - zE);
    tilePanel(B, TILE, V(x1 + 0.2, yE, zE), V(-1, 0, 0), Vn, x1 - x0 + 0.4, len);
    for (let x = x0 - 0.1; x <= x1 + 0.2; x += 0.75) beamBetween(B, DARKW, V(x, yT - 0.08, BZ0), V(x, yE - 0.06, zE + 0.03), 0.06, 0.09);
    for (const x of [x0 - 0.1, x1 + 0.1]) beamBetween(B, DARKW, V(x, yE - 0.1, zE + 0.2), V(x, yE - 0.9, BZ0), 0.05, 0.05);
    [[-48.8, -28.0, 0, 1.6], [-48.3, -28.1, 2, 1.4], [-45.2, -28.05, 1, 1.5], [-45.3, -27.4, 3, 1.5], [-48.85, -27.4, 2, 1.2]].forEach(([x, z, k, s]) => plant(x, Y3, z, k, s));
    const P = at(-45.9, Y3, -28.05, 0.6);                                                   // 물뿌리개
    P(TANK, lathe([[0, 0], [0.09, 0], [0.09, 0.2], [0.075, 0.2], [0.075, 0.01], [0, 0.01]], 14));
    P(TANK, tube([V(0.08, 0.05, 0), V(0.2, 0.16, 0), V(0.27, 0.24, 0)], 0.012, 6), 0, 0, 0); P(TANK, cylG(0.012, 0.035, 0.03, 10), 0.28, 0.25, 0, 0, 0, -0.85);
    const hd = []; for (let i = 0; i <= 8; i++) { const a = i / 8 * PI; hd.push(V(-0.08 - Math.sin(a) * 0.07, 0.04 + i * 0.02, 0)); } P(TANK, tube(hd, 0.008, 5, false));
  }

  /* ================= 옥상 ================= */
  // 물탱크: 쇠다리 받침, 테 두른 통, 고깔 뚜껑, 사다리, 배관
  {
    const tx = -49.5, tz = -24.3, yb = YR + 1.0;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { bx(M.iron, tx + sx * 0.7, YR, tz + sz * 0.7, 0.09, 1.0, 0.09); }
    for (const s of [-1, 1]) { beamBetween(B, M.iron, V(tx - 0.7, YR + 0.1, tz + s * 0.7), V(tx + 0.7, YR + 0.9, tz + s * 0.7), 0.04, 0.04); beamBetween(B, M.iron, V(tx + s * 0.7, YR + 0.9, tz - 0.7), V(tx + s * 0.7, YR + 0.1, tz + 0.7), 0.04, 0.04); }
    bx(M.iron, tx, yb - 0.08, tz, 1.7, 0.08, 1.7);
    const pr = [[0, 0], [1.0, 0]]; for (let i = 0; i <= 17; i++) pr.push([1.0 + (i % 6 === 2 ? 0.035 : 0), i * 0.1]);
    pr.push([1.04, 1.72], [0.3, 2.05], [0.3, 2.12], [0, 2.14]);
    B.geo(TANK, lathe(pr, 28), mat4(tx, yb, tz));
    B.geo(M.iron, cylG(0.32, 0.32, 0.03, 14), mat4(tx, yb + 2.14, tz));
    for (const s of [-0.18, 0.18]) B.geo(M.iron, tube([V(tx + 1.06, YR, tz + s), V(tx + 1.06, yb + 1.85, tz + s), V(tx + 0.9, yb + 1.95, tz + s)], 0.016, 6));
    for (let i = 1; i < 10; i++) B.geo(M.iron, tube([V(tx + 1.06, YR + i * 0.28, tz - 0.18), V(tx + 1.06, YR + i * 0.28, tz + 0.18)], 0.012, 6));
    B.geo(STEEL, tube([V(tx, yb, tz), V(tx, YR + 0.35, tz), V(tx - 0.3, YR + 0.12, tz - 0.6), V(tx - 0.5, YR + 0.12, tz - 2.3), V(tx - 0.5, YR + 1.0, tz - 2.62), V(tx - 0.5, YR + 1.0, tz - 2.85), V(tx - 0.5, 0.5, tz - 2.85)], 0.04, 8));
    B.geo(RED, new THREE.TorusGeometry(0.07, 0.014, 5, 12), mat4(tx - 0.4, YR + 0.12, tz - 1.4, 0, 0, 0)); B.put(RED, cylG(0.015, 0.015, 0.1, 6), tx - 0.4, YR + 0.12, tz - 1.4);
    B.geo(STEEL, tube([V(tx - 0.95, yb + 0.3, tz + 0.4), V(tx - 1.6, yb + 0.3, tz + 0.7), V(tx - 2.2, YR + 0.2, tz + 1.4), V(-52.2, YR + 0.2, -22.0)], 0.03, 8));   // 탑 쪽으로 가는 관
    addCollider(tx - 1.05, YR, tz - 1.05, tx + 1.05, YR + 3.2, tz + 1.05);
  }
  // 환기통 둘, 안테나
  for (const [x, z] of [[-51.6, -18.6], [-41.8, -20.2]]) { const P = at(x, YR, z); P(STEEL, cylG(0.12, 0.12, 0.8, 12), 0, 0.4, 0); P(STEEL, cylG(0.24, 0.02, 0.14, 12), 0, 0.93, 0); for (let i = 0; i < 3; i++) P(STEEL, box(0.02, 0.12, 0.02), Math.cos(i * 2.1) * 0.1, 0.84, Math.sin(i * 2.1) * 0.1); addCollider(x - 0.14, YR, z - 0.14, x + 0.14, YR + 1, z + 0.14); }
  { const P = at(-41.6, PY, -18.0); P(M.iron, cylG(0.02, 0.02, 2.4, 6), 0, 1.2, 0); for (let i = 0; i < 4; i++) P(M.iron, cylG(0.008, 0.008, 0.9 - i * 0.16, 5), 0, 1.5 + i * 0.26, 0, 0, 0, PI / 2); }
  // 빨랫줄: 양쪽 T꼴 장대, 줄 두 가닥, 널린 옷
  {
    const xa = -50.6, xb = -44.2, z = -19.3, y = YR + 1.9;
    for (const x of [xa, xb]) { B.geo(WOOD, cylG(0.04, 0.035, 1.95, 8), mat4(x, YR + 0.975, z)); B.geo(WOOD, box(0.05, 0.05, 1.0), mat4(x, y, z)); addCollider(x - 0.06, YR, z - 0.06, x + 0.06, y, z + 0.06); B.geo(CONC, cylG(0.14, 0.1, 0.16, 10), mat4(x, YR + 0.08, z)); }
    const sag = (x) => y - 0.02 - 0.09 * Math.sin((x - xa) / (xb - xa) * PI);
    for (const dz of [-0.4, 0.4]) { const pts = []; for (let i = 0; i <= 16; i++) { const x = xa + (xb - xa) * i / 16; pts.push(V(x, sag(x), z + dz)); } B.geo(BLACK, tube(pts, 0.006, 5, false)); }
    const SHIRT = clothGeo([[0.3, 1], [0.7, 1], [1, 0.84], [0.92, 0.6], [0.74, 0.7], [0.74, 0], [0.26, 0], [0.26, 0.7], [0.08, 0.6], [0, 0.84]]);
    const PANTS = clothGeo([[0.2, 1], [0.8, 1], [0.86, 0], [0.56, 0], [0.5, 0.62], [0.44, 0], [0.14, 0]]);
    const TOWEL = new THREE.PlaneGeometry(1, 1, 3, 8); TOWEL.translate(0.5, 0.5, 0);
    const hangUp = (g, m, x, dz, w, h) => { B.geo(m, g, mat4(x - w / 2, sag(x) - h, z + dz, 0, 0, 0, [w, h, 1])); for (const s of [0.25, 0.75]) B.geo(WOOD, box(0.012, 0.07, 0.03), mat4(x - w / 2 + w * s, sag(x) - 0.01, z + dz)); };
    hangUp(SHIRT, C_ORANGE, -49.4, -0.4, 0.8, 0.75); hangUp(PANTS, C_ORANGE, -48.2, -0.4, 0.6, 0.95); hangUp(TOWEL, C_WHITE, -47.1, -0.4, 0.5, 0.85); hangUp(SHIRT, C_BLUE, -45.8, -0.4, 0.75, 0.7);
    hangUp(TOWEL, C_WHITE, -48.9, 0.4, 0.9, 1.1); hangUp(TOWEL, C_BLUE, -46.6, 0.4, 0.45, 0.8); hangUp(SHIRT, C_WHITE, -45.4, 0.4, 0.7, 0.7);
  }
  // 옥탑 창고(붉은 맞배지붕): 라면 상자와 대걸레
  {
    const x0 = -45.5, z0 = -26.6, x1 = -42, z1 = -23.9, yT = YR + 2.3;
    boxWalls(B, WALLM, x0, z0, x1, z1, YR, yT, { s: [{ u0: -44.4, u1: -43.2, ys: [[YR, YR + 2.15]] }], w: [{ u0: -25.8, u1: -24.8, ys: [[YR + 1.1, YR + 1.9]] }] }, 0.15);
    doorUnit(B, 'x', z1 - 0.15, z1, -44.4, -43.2, YR, YR + 2.15, { frame: TRIM, leaf: null });
    windowUnit(B, 'z', x0, x0 + 0.15, -25.8, -24.8, YR + 1.1, YR + 1.9, { frame: TRIM, out: -1 });
    gableRoof(B, TILE, x0, z0, x1, z1, yT, 0.9, { over: 0.35, overGable: 0.3, gable: WALLM });
    carton(-42.5, YR, -26.1, 0.6, 0.4, 0.5, 0.1, RAMEN); carton(-42.5, YR + 0.4, -26.1, 0.6, 0.4, 0.5, -0.1, RAMEN); carton(-42.5, YR, -25.4, 0.6, 0.4, 0.5, PI / 2 + 0.1, RAMEN);
    addCollider(-42.85, YR, -26.4, -42.15, YR + 0.8, -25.1);
    carton(-44.9, YR, -26.1, 0.5, 0.35, 0.5, 0.3); scroll(-44.9, YR + 0.35, -26.1, 0.6, RED); scroll(-44.8, YR + 0.35, -26.25, 0.2, BLUE);
    const P = at(-45.2, YR, -24.3);                                                        // 대걸레
    P(WOOD, tube([V(0, 0.05, 0), V(-0.1, 1.4, 0)], 0.014, 6), 0, 0, 0); for (let i = 0; i < 12; i++) P(WHITE, tube([V(0, 0.1, 0), V(Math.cos(i * 0.52) * 0.12, 0.01, Math.sin(i * 0.52) * 0.12)], 0.012, 4), 0, 0, 0);
    lights.push([-43.8, YR + 2.0, -25.2, 6, 8]);
  }

  /* ================= 마당·바깥 ================= */
  // 골목 쪽 낮은 돌담(가운데 터짐)과 문기둥
  for (const [a, b] of [[-63.4, -52.6], [-50.0, -38.6]]) { B.box(M.stone, a, 0, -5.9, b, 0.85, -5.6); B.box(CONC, a - 0.03, 0.85, -5.94, b + 0.03, 0.93, -5.56, false); }
  for (const x of [-52.45, -50.15]) { B.box(M.stone, x - 0.2, 0, -5.98, x + 0.2, 1.3, -5.52); B.box(CONC, x - 0.25, 1.3, -6.03, x + 0.25, 1.4, -5.47, false); }
  // 우편함 기둥·쓰레기통·떨기나무·바깥 화분
  {
    const P = at(-49.6, 0, -6.6);
    P(WOOD, box(0.08, 1.1, 0.08), 0, 0.55, 0); P(RED, box(0.34, 0.26, 0.24), 0, 1.2, 0); P(BLACK, box(0.24, 0.02, 0.01), 0, 1.24, 0.121); P(RED, box(0.38, 0.03, 0.28), 0, 1.345, 0);
    addCollider(-49.7, 0, -6.7, -49.5, 1.3, -6.5);
  }
  for (const [x, z] of [[-40.2, -13.6], [-39.6, -13.7]]) {
    const P = at(x, 0.2, z);
    const pr = []; for (let i = 0; i <= 8; i++) pr.push([0.2 + i * 0.006 + (i % 2) * 0.012, i * 0.08]);
    P(STEEL, lathe([[0, 0], ...pr, [0.27, 0.66]], 16)); P(STEEL, lathe([[0.28, 0], [0.27, 0.04], [0.06, 0.1], [0, 0.1]], 16), 0, 0.66, 0); P(BLACK, new THREE.TorusGeometry(0.04, 0.008, 4, 10, PI), 0, 0.76, 0);
    addCollider(x - 0.25, 0.2, z - 0.25, x + 0.25, 1.0, z + 0.25);
  }
  const SL = leafGeo(0.16, 0.08, 0.4, 0.9, 0.3, 3);
  for (const [x, z, s] of [[-54.6, -8.2, 1.2], [-46.5, -7.6, 0.9], [-43.2, -9.4, 1.3], [-60.5, -9.5, 1.4]]) {
    for (let i = 0; i < 6; i++) { const a = i * 1.05 + R0(); B.geo(mat('bark', 0x5a4632), tube([V(x, 0, z), V(x + Math.cos(a) * 0.2 * s, 0.4 * s, z + Math.sin(a) * 0.2 * s), V(x + Math.cos(a) * 0.45 * s, 0.75 * s, z + Math.sin(a) * 0.45 * s)], t => 0.03 * (1 - t * 0.7), 5)); }
    for (let i = 0; i < 150; i++) {
      const a = R0() * 6.28, e = R0() * 1.4, r = (0.35 + R0() * 0.3) * s;
      B.geo(SHRUB, SL, mat4(x + Math.cos(a) * Math.cos(e) * r, (0.5 + Math.sin(e) * 0.45) * s, z + Math.sin(a) * Math.cos(e) * r, (R0() - 0.5), a + PI / 2 + R0(), 0, 0.8 + R0() * 0.8));
    }
    addCollider(x - 0.3 * s, 0, z - 0.3 * s, x + 0.3 * s, 0.9 * s, z + 0.3 * s);
  }
  plant(-52.5, 0.2, -16.5, 1, 2.4); plant(-50.1, 0.2, -16.6, 0, 2.2); plant(-49.6, 0.2, -16.5, 2, 1.8);
  // 물받이 홈통(북쪽 벽·탑), 전봇대와 전깃줄, 가로등
  B.geo(STEEL, tube([V(-52.3, 10.6, -27.1), V(-52.3, 0.5, -27.1), V(-52.3, 0.3, -27.35)], 0.05, 8));
  for (let y = 1.5; y < 10; y += 2.2) B.box(M.iron, -52.38, y, -27.12, -52.22, y + 0.04, -27, false);
  { const a = 3.9, x = CX + Math.cos(a) * 4.08, z = CZ + Math.sin(a) * 4.08; B.geo(STEEL, tube([V(x, 12, z), V(x, 0.4, z), V(x + Math.cos(a) * 0.25, 0.2, z + Math.sin(a) * 0.25)], 0.05, 8)); }
  {
    const x = -39.6, z = -8.2;
    B.geo(mat('wood', 0x54412f), cylG(0.15, 0.11, 9, 10), mat4(x, 4.5, z)); addCollider(x - 0.15, 0, z - 0.15, x + 0.15, 9, z + 0.15);
    B.geo(DARKW, box(1.8, 0.1, 0.1), mat4(x, 8.4, z)); B.geo(DARKW, box(1.2, 0.08, 0.08), mat4(x, 7.8, z));
    for (const dx of [-0.8, 0, 0.8]) B.geo(WHITE, lathe([[0, 0], [0.04, 0], [0.05, 0.05], [0.03, 0.07], [0.05, 0.1], [0.03, 0.13], [0, 0.14]], 10), mat4(x + dx, 8.45, z));
    B.geo(M.iron, lathe([[0, 0], [0.16, 0], [0.18, 0.1], [0.18, 0.5], [0.14, 0.56], [0, 0.56]], 12), mat4(x + 0.3, 6.9, z));   // 변압기
    const wire = (p0, p1, sg) => { const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(p0.clone().lerp(p1, t).setY(p0.y + (p1.y - p0.y) * t - sg * Math.sin(t * PI))); } B.geo(BLACK, tube(pts, 0.012, 4, false)); };
    wire(V(x - 0.8, 8.6, z), V(-41.1, 10.9, -17.1), 0.5); wire(V(x, 8.6, z), V(-41.1, 9.3, -15.3), 0.4);
    B.geo(M.iron, tube([V(x, 5.6, z), V(x - 0.5, 5.9, z), V(x - 1.0, 5.85, z)], 0.025, 6)); B.geo(M.iron, lathe([[0.2, -0.1], [0.07, 0], [0.04, 0.04]], 12), mat4(x - 1.0, 5.8, z)); B.put(BULB, sph(0.06), x - 1.0, 5.72, z);
    glows.push([x - 1.0, 5.72, z, 1.2]);
  }

  B.finish(scene);
  return {
    places: [
      { n: '나루토의 집 앞', t: '둥근 탑이 붙은 3층 공동주택. 바깥 계단으로 층을 오른다.', b: [-58, -38.5, -17, -5], y: [0, 3] },
      { n: '현관 홀', t: '우편함과 신발장, 알림판이 있는 1층 홀.', b: [-53, -45, -27, -17], y: [0.2, 3.2] },
      { n: '창고', t: '빗자루와 궤짝, 사다리를 넣어 둔 공동 창고.', b: [-45, -41, -27, -17], y: [0.2, 3.2] },
      { n: '세탁실', t: '둥근 탑 아래층. 빨래통과 건조대, 온수통.', b: [-60, -53, -26, -18], y: [0.2, 3.2] },
      { n: '2층 복도', t: '셋방 두 칸의 문이 나란한 바깥 복도.', b: [-53, -41, -17, SZ1], y: [3.4, 6.4] },
      { n: '서쪽 셋방', t: '다다미에 둥근 밥상이 놓인 이웃집. 탑 쪽에 이불을 개어 두었다.', b: [-60, -47.3, -27, -17], y: [3.4, 6.4] },
      { n: '동쪽 셋방 (빈방)', t: '새 주인을 기다리는 빈방. 맨 침대와 책상뿐이다.', b: [-47.3, -41, -27, -17], y: [3.4, 6.4] },
      { n: '3층 복도', t: '맨 위층. 붉은 기와 차양 아래 "うずまき" 문패가 걸려 있다.', b: [-56.3, -39.6, -17, SZ1], y: [6.6, 9.8] },
      { n: '나루토의 방', t: '식탁엔 먹다 만 컵라면과 우유팩, 바닥엔 두루마리, 창가엔 화분.', b: [-53, -41, -27, -17], y: [6.6, 9.8] },
      { n: '나루토의 침대', t: '둥근 탑 창가의 침대. 머리맡에 수면 모자와 7반 사진.', b: [-60, -53, -26, -18], y: [6.6, 9.8] },
      { n: '발코니', t: '나루토가 기르는 화분들과 물뿌리개.', b: [-49.2, -44.8, -28.4, -27], y: [6.6, 9.8] },
      { n: '옥상', t: '물탱크와 배관, 빨랫줄에 널린 주황색 옷.', b: [-53, -39.6, -27, -17], y: [10, 14] },
      { n: '옥탑 창고', t: '라면 상자를 쟁여 둔 작은 지붕 밑 창고.', b: [-45.5, -42, -26.6, -23.9], y: [10, 13] },
    ],
    jumps: [['나루토의 집', -51.3, 0, -9, 0, 30], ['나루토의 방', -49.4, 6.6, -19.5, 0.6, 31], ['나루토 집 옥상', -46.5, 10, -21.5, 0.8, 32]],
    lights, glows, skip: [],
  };
}
