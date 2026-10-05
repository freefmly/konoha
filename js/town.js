// 거리 — 마을을 두른 담과 정문, 길가에 늘어선 집과 가게(겉모습만 — 들어갈 수는 없다), 전봇대·걸상·통 같은 거리 살림.
import * as THREE from '../vendor/three.module.js';
import { Builder, addCollider, mat4, rng, tube, wall } from './build.js';
import { mat, M, textMat } from './materials.js';
import { gableRoof, hipRoof, coneRoof, tilePanel, beamBetween, roundWall, railing, noren, signBoard, lantern } from './arch.js';
import { bushGeometry } from './flora.js';
import { LOT, ROADS, CLIFF, WALL, UCHIHA } from './layout.js';

export const RECTS = [];   // 지은 집의 자리(나무 심을 때 피한다)
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export const WALLS = [0xe8dcc0, 0xd9b97a, 0xb9c9a0, 0xd9a58a, 0xbcc6c4, 0xf1eadb, 0xc98a5e];
export const ROOFS = [0x3f6f78, 0xa4502f, 0x6f7a45, 0x4a5560, 0xc8742e];
export const SHOPS = ['茶', '酒', '米', '薬', '書', '湯', '魚', '団子', '忍具', '甘栗甘', '本', '焼肉', '宿', '呉服', '菓子', '八百屋', '豆腐', '金物', '質', '餅'];

/* 벽면 하나에 붙일 좌표계: 가로 u(왼→오), 높이 y, 바깥으로 d. bx로 그 면 위에 상자를 놓는다. */
function face(B, ox, oy, oz, ry) {
  const base = mat4(ox, oy, oz, 0, ry, 0), m = new THREE.Matrix4(), t = new THREE.Matrix4(), r = new THREE.Matrix4();
  const f = (material, u, y, d, w, h, dep, rx = 0) => {
    t.makeTranslation(u, y, d); m.multiplyMatrices(base, t);
    if (rx) { r.makeRotationX(rx); m.multiply(r); }
    B.geo(material, new THREE.BoxGeometry(w, h, dep), m, [Math.max(w, dep), h]);
  };
  f.world = (u, y, d) => V(u, y, d).applyMatrix4(base);
  f.matrix = (u, y, d, s = 1) => { t.makeTranslation(u, y, d); m.multiplyMatrices(base, t); if (s !== 1) m.scale(V(s, s, s)); return m.clone(); };
  f.ry = ry;
  f.xdir = V(Math.cos(ry), 0, -Math.sin(ry)); f.ndir = V(Math.sin(ry), 0, Math.cos(ry));
  return f;
}

export function makeKit() {
  const K = {};
  K.dark = mat('plain', 0x26323a, { rough: 0.18, metal: 0.25 });      // 안이 어두운 유리창
  K.wood = M.beam; K.woodL = M.beamLight;
  K.door = mat('planks', 0x7b5a3c);
  K.stone = M.stone;
  K.tank = mat('metal', 0x8fa0a3, { rough: 0.55 });
  K.pipe = mat('metal', 0x6b7376, { rough: 0.5 });
  K.leaf = mat('leaf', 0x447f2e);
  K.pot = mat('plain', 0x9a5a3c, { rough: 0.85 });
  K.bush = bushGeometry(21, 1);
  K.curtain = [mat('plain', 0xd8c9a0, { rough: 0.9 }), mat('plain', 0x9db3b8, { rough: 0.9 })];
  return K;
}

// 겉창: 창틀·살·유리·창턱. 안은 어둡게 비치고 커튼이 반쯤 쳐져 있다.
function fakeWindow(K, f, u, y, w, h, R, opts = {}) {
  f(K.dark, u, y + h / 2, 0.015, w, h, 0.03);
  if (R() < 0.6) { const cw = w * (0.2 + R() * 0.2); f(K.curtain[R() < 0.5 ? 0 : 1], u - w / 2 + cw / 2 + 0.04, y + h / 2, 0.05, cw, h - 0.06, 0.02); }
  f(K.wood, u, y + h + 0.035, 0.05, w + 0.14, 0.07, 0.1); f(K.wood, u, y - 0.035, 0.05, w + 0.14, 0.07, 0.1);
  f(K.wood, u - w / 2 - 0.035, y + h / 2, 0.05, 0.07, h, 0.1); f(K.wood, u + w / 2 + 0.035, y + h / 2, 0.05, 0.07, h, 0.1);
  f(K.wood, u, y + h / 2, 0.065, 0.035, h, 0.04); f(K.wood, u, y + h * 0.55, 0.065, w, 0.035, 0.04);
  f(K.wood, u, y - 0.1, 0.1, w + 0.3, 0.06, 0.22);
  if (opts.hood) { f(opts.hood, u, y + h + 0.3, 0.26, w + 0.4, 0.05, 0.6, 0.42); f(K.wood, u - w / 2 - 0.1, y + h + 0.2, 0.2, 0.05, 0.05, 0.42, 0.42); f(K.wood, u + w / 2 + 0.1, y + h + 0.2, 0.2, 0.05, 0.05, 0.42, 0.42); }
  if (opts.shutter) for (const s of [-1, 1]) f(K.door, u + s * (w / 2 + 0.3), y + h / 2, 0.04, 0.42, h, 0.05);
  if (opts.planter) {   // 창턱 화분: 길쭉한 화분에 덤불
    f(K.pot, u, y - 0.26, 0.2, w * 0.9, 0.2, 0.22);
    f.B.geo(K.leaf, K.bush.leaves, f.matrix(u, y - 0.18, 0.2, 0.4));
  }
}
// 닫힌 널문
function fakeDoor(K, f, u, w = 1.15, h = 2.15) {
  // 문짝·문틀은 돌 기단(벽에서 0.06~0.1 나옴)보다 확실히 앞에 둔다 — 한 평면에 겹치면 문 아래쪽이 깜빡인다
  f(K.door, u, h / 2 + 0.05, 0.065, w, h, 0.13);
  f(K.wood, u, h + 0.1, 0.09, w + 0.24, 0.1, 0.18); f(K.wood, u - w / 2 - 0.06, h / 2 + 0.05, 0.09, 0.12, h + 0.1, 0.18); f(K.wood, u + w / 2 + 0.06, h / 2 + 0.05, 0.09, 0.12, h + 0.1, 0.18);
  f(K.wood, u, h * 0.5, 0.14, w, 0.05, 0.03); f(K.wood, u, h * 0.82, 0.14, w, 0.05, 0.03);
  f(M.iron, u + w / 2 - 0.14, 1.05, 0.16, 0.05, 0.16, 0.05);
  f(K.stone, u, 0.05, 0.35, w + 0.5, 0.1, 0.7);
}
// 가게 앞: 어두운 가게 안, 격자 미닫이, 포렴, 기와 차양, 간판, 등롱
function shopFront(B, K, f, u, w, tile, name, R, glows) {
  const h = 2.5;
  f(K.dark, u, h / 2 + 0.05, 0.06, w, h, 0.13);
  f(K.wood, u, h + 0.12, 0.1, w + 0.3, 0.14, 0.2); f(K.wood, u - w / 2 - 0.08, h / 2, 0.1, 0.16, h + 0.1, 0.2); f(K.wood, u + w / 2 + 0.08, h / 2, 0.1, 0.16, h + 0.1, 0.2);
  // 한쪽은 격자 미닫이
  const lw = w * 0.36, lu = u - w / 2 + lw / 2;
  for (let i = 0; i <= 8; i++) f(K.woodL, lu - lw / 2 + lw * i / 8, h / 2 + 0.05, 0.15, 0.035, h, 0.04);
  for (const yy of [0.12, h * 0.4, h * 0.75, h]) f(K.woodL, lu, yy, 0.15, lw, 0.05, 0.045);
  f(K.stone, u, 0.05, 0.4, w + 0.6, 0.1, 0.8);
  // 기와 차양과 까치발
  const d = 1.25, ya = 3.25, yb = 2.75, o = f.world(u - w / 2 - 0.5, yb, d), Vv = f.ndir.clone().multiplyScalar(-d).add(V(0, ya - yb, 0));
  const len = Vv.length(); Vv.normalize();
  tilePanel(B, tile, o, f.xdir, Vv, w + 1.0, len, null, 2, false);
  for (const s of [-1, 1]) { const uu = u + s * (w / 2 + 0.3); beamBetween(B, K.wood, f.world(uu, 2.35, 0.02), f.world(uu, yb - 0.03, d - 0.08), 0.07, 0.09); f(K.wood, uu, ya - 0.2, d / 2, 0.07, 0.07, d, Math.atan2(ya - yb, d)); }
  beamBetween(B, K.wood, f.world(u - w / 2 - 0.5, yb - 0.02, d), f.world(u + w / 2 + 0.5, yb - 0.02, d), 0.06, 0.1);
  // 포렴
  const a = f.world(u + w / 2 - w * 0.56, 0, 0.3), b = f.world(u + w / 2 - 0.1, 0, 0.3), axis = Math.abs(f.xdir.x) > 0.5 ? 'x' : 'z';
  const lo = axis === 'x' ? Math.min(a.x, b.x) : Math.min(a.z, b.z), hi = axis === 'x' ? Math.max(a.x, b.x) : Math.max(a.z, b.z);
  const cols = [['#1f3a6e', '#f4efe2'], ['#7a1f1c', '#f4efe2'], ['#f1ead6', '#1d1a16'], ['#2f5a34', '#f4efe2']][Math.floor(R() * 4)];
  const flip = axis === 'x' ? f.ndir.z < 0 : f.ndir.x > 0;
  noren(B, axis, axis === 'x' ? a.z : a.x, lo, hi, 2.45, 0.8, name.length >= 2 ? name : '', { color: cols[0], ink: cols[1], flip, n: 3 });
  // 간판(차양 위)과 등롱
  const sp = f.world(u, 3.95, 0.12);
  if ([...name].length <= 1) signBoard(B, name, sp.x, sp.y, sp.z, f.ry, 0.95, 0.95, { both: false, round: R() < 0.5 });
  else signBoard(B, name, sp.x, sp.y, sp.z, f.ry, Math.min(w * 0.8, [...name].length * 0.8 + 0.3), 0.85, { both: false });
  if (R() < 0.7) { const lp = f.world(u - w / 2 - 0.45, 2.15, 0.9); glows.push(lantern(B, lp.x, lp.y, lp.z, { text: name.length <= 2 ? name : '', color: R() < 0.7 ? 0xd8452e : 0xf0e2c0, r: 0.17, h: 0.42 })); }
}

// 지붕 위 물탱크: 다리 넷 위의 통, 원뿔 뚜껑, 내려가는 관
function waterTank(B, K, x, y, z, s = 1) {
  const r = 0.75 * s, h = 1.3 * s;
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.box(K.pipe, x + dx * r * 0.6 - 0.04, y, z + dz * r * 0.6 - 0.04, x + dx * r * 0.6 + 0.04, y + 0.5, z + dz * r * 0.6 + 0.04, false);
  B.geo(K.tank, new THREE.CylinderGeometry(r, r, h, 18), mat4(x, y + 0.5 + h / 2, z), [r * 6.3, h]);
  for (const yy of [0.62, 0.5 + h * 0.5, 0.38 + h]) B.geo(K.pipe, new THREE.CylinderGeometry(r + 0.025, r + 0.025, 0.06, 18), mat4(x, y + yy, z));
  B.geo(K.tank, new THREE.ConeGeometry(r + 0.06, 0.4 * s, 18), mat4(x, y + 0.5 + h + 0.2 * s, z));
  B.geo(K.pipe, tube([V(x + r, y + 0.7, z), V(x + r + 0.3, y + 0.7, z), V(x + r + 0.3, y + 0.05, z)], 0.04, 6, false));
}

/* ---------- 네모 집 ---------- */
export function boxHouse(B, K, s, R, glows) {
  const { x0, z0, x1, z1, front } = s, floors = s.floors, H = floors * 3.0 + 0.3;
  const wm = mat('plaster', WALLS[s.wall]), tile = mat('tile', s.roofHex ?? ROOFS[s.roof]);
  B.box(wm, x0, 0, z0, x1, H, z1);
  B.box(K.stone, x0 - 0.06, 0, z0 - 0.06, x1 + 0.06, 0.45, z1 + 0.06, false);
  // 모서리 기둥과 층 사이 띠(나무 뼈대가 드러난 벽)
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) B.box(K.wood, x - 0.11, 0.45, z - 0.11, x + 0.11, H, z + 0.11, false);
  for (let fl = 1; fl <= floors; fl++) { const y = fl * 3.0 + 0.3; B.box(K.wood, x0 - 0.05, y - 0.2, z0 - 0.05, x1 + 0.05, y - 0.02, z1 + 0.05, false); }   // 윗면이 벽 윗면과 한 평면에 겹치지 않게 조금 낮춘다
  const faces = { s: [face(B, x0, 0, z1, 0), x1 - x0], n: [face(B, x1, 0, z0, Math.PI), x1 - x0], e: [face(B, x1, 0, z1, Math.PI / 2), z1 - z0], w: [face(B, x0, 0, z0, -Math.PI / 2), z1 - z0] };
  for (const k in faces) faces[k][0].B = B;
  const hood = R() < 0.35 ? tile : null, shutter = !hood && R() < 0.3;
  for (const k in faces) {
    const [f, W] = faces[k], isFront = k === front, near = s.near || isFront;
    const n = Math.max(1, Math.floor((W - 1.2) / 2.6)), gap = W / n;
    for (let fl = 0; fl < floors; fl++) {
      if (fl === 0 && isFront) continue;
      if (!near && fl === 0 && R() < 0.5) continue;
      for (let i = 0; i < n; i++) {
        if (R() < 0.18) continue;
        const u = gap * (i + 0.5), big = R() < 0.3;
        fakeWindow(K, f, u, fl * 3.0 + 1.25, big ? 1.5 : 1.05, 1.15, R, { hood: isFront && fl > 0 ? hood : null, shutter: isFront && shutter, planter: isFront && fl > 0 && R() < 0.28 });
      }
    }
    // 뼈대 세로선
    for (let i = 1; i < n; i++) if (W > 7) f(K.wood, gap * i, H / 2 + 0.2, 0.01, 0.12, H - 0.5, 0.04);
  }
  const [ff, FW] = faces[front];
  if (s.shop) {
    shopFront(B, K, ff, FW / 2, Math.min(FW - 2.2, 4.4), tile, s.shop, R, glows);
  } else {
    fakeDoor(K, ff, FW * (0.3 + R() * 0.4));
    if (FW > 6) fakeWindow(K, ff, FW * 0.82, 1.25, 1.05, 1.15, R, { planter: R() < 0.4 });
  }
  // 2층 발코니
  if (floors >= 2 && R() < 0.45) {
    const bw = Math.min(FW - 1.5, 3.6), u = FW / 2, y = (s.shop ? 2 : 1) * 3.0 + 0.3 + (s.shop && floors < 3 ? -3.0 : 0);
    if (y > 3 && y < H - 2) {
      ff(M.floorDark, u, y - 0.06, 0.55, bw, 0.12, 1.1);
      for (const su of [-1, 1]) beamBetween(B, K.wood, ff.world(u + su * (bw / 2 - 0.1), y - 0.7, 0.02), ff.world(u + su * (bw / 2 - 0.1), y - 0.12, 0.95), 0.07, 0.09);
      const a = ff.world(u - bw / 2 + 0.04, 0, 0.02), b = ff.world(u - bw / 2 + 0.04, 0, 1.06), c = ff.world(u + bw / 2 - 0.04, 0, 1.06), d = ff.world(u + bw / 2 - 0.04, 0, 0.02);
      railing(B, K.wood, [[a.x, a.z], [b.x, b.z], [c.x, c.z], [d.x, d.z]], y, 0.95, { collide: false, gap: 0.2 });
    }
  }
  // 지붕
  const kind = s.roofKind;
  if (kind === 'gable') gableRoof(B, tile, x0, z0, x1, z1, H, s.rise ?? 1.5 + R() * 0.9, { ridge: front === 'n' || front === 's' ? 'x' : 'z', gable: wm, detail: s.near ? 4 : 2, lip: false, rafters: s.near, over: 0.75 });
  else if (kind === 'hip') hipRoof(B, tile, x0, z0, x1, z1, H, s.rise ?? 1.6 + R() * 0.8, { detail: s.near ? 4 : 2, lip: false, rafters: s.near, over: 0.75 });
  else {   // 평지붕: 난간벽 위에 기와 띠, 물탱크와 관
    B.box(wm, x0, H, z0, x1, H + 0.7, z0 + 0.25, false); B.box(wm, x0, H, z1 - 0.25, x1, H + 0.7, z1, false);
    B.box(wm, x0, H, z0, x0 + 0.25, H + 0.7, z1, false); B.box(wm, x1 - 0.25, H, z0, x1, H + 0.7, z1, false);
    B.box(tile, x0 - 0.15, H + 0.7, z0 - 0.15, x1 + 0.15, H + 0.82, z0 + 0.4, false); B.box(tile, x0 - 0.15, H + 0.7, z1 - 0.4, x1 + 0.15, H + 0.82, z1 + 0.15, false);
    B.box(tile, x0 - 0.15, H + 0.7, z0, x0 + 0.4, H + 0.82, z1, false); B.box(tile, x1 - 0.4, H + 0.7, z0, x1 + 0.15, H + 0.82, z1, false);
    B.box(M.concrete, x0 + 0.25, H, z0 + 0.25, x1 - 0.25, H + 0.06, z1 - 0.25, false);
    waterTank(B, K, x0 + 1.6 + R() * (x1 - x0 - 3.2), H + 0.06, z0 + 1.6 + R() * (z1 - z0 - 3.2), 0.9 + R() * 0.4);
    if (R() < 0.6) {   // 옥탑(계단실)과 빨랫줄
      const px = x0 + 0.8, pz = z0 + 0.8;
      B.box(wm, px, H, pz, px + 2.2, H + 2.3, pz + 2.2, false);
      tilePanel(B, tile, V(px - 0.3, H + 2.3, pz + 2.5), V(1, 0, 0), V(0, 0.35, -1).normalize(), 2.8, 3.0, null, 2, false);
    }
  }
  // 벽을 타고 내려오는 홈통
  if (R() < 0.6) {
    const f = faces[front === 'n' || front === 's' ? 'e' : 's'][0], W = faces[front === 'n' || front === 's' ? 'e' : 's'][1];
    const p0 = f.world(W - 0.35, H - 0.3, 0.1), p1 = f.world(W - 0.35, 0.3, 0.1);
    B.geo(K.pipe, tube([p0, p1], 0.05, 6, false));
    for (const yy of [1.2, H / 2, H - 1]) f(K.pipe, W - 0.35, yy, 0.05, 0.16, 0.04, 0.12);
  }
}

/* ---------- 둥근 탑집 ---------- */
export function towerHouse(B, K, s, R, glows) {
  const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2, r = Math.min(s.x1 - s.x0, s.z1 - s.z0) / 2 - 0.3, floors = s.floors, H = floors * 3.0 + 0.3;
  const wm = mat('plaster', WALLS[s.wall]), tile = mat('tile', s.roofHex ?? ROOFS[s.roof]);
  const SEG = 30;
  B.geo(wm, new THREE.CylinderGeometry(r, r, H, SEG, 1, true), mat4(cx, H / 2, cz), [r * Math.PI * 2, H]);
  B.geo(K.stone, new THREE.CylinderGeometry(r + 0.07, r + 0.1, 0.5, SEG, 1, true), mat4(cx, 0.25, cz), [r * 6.28, 0.5]);
  { const g = new THREE.RingGeometry(r, r + 0.08, SEG); g.rotateX(-Math.PI / 2); B.geo(K.stone, g, mat4(cx, 0.5, cz)); }
  for (let fl = 1; fl <= floors; fl++) B.geo(K.wood, new THREE.CylinderGeometry(r + 0.06, r + 0.06, 0.2, SEG, 1, false), mat4(cx, fl * 3.0 + 0.2, cz));
  // 충돌: 원을 가로띠로 채운다
  for (let x = -r; x < r; x += 0.7) { const xm = Math.min(Math.abs(x), Math.abs(x + 0.7)), half = Math.sqrt(Math.max(0, r * r - xm * xm)); addCollider(cx + x, 0, cz - half, cx + Math.min(x + 0.7, r), H, cz + half); }
  const fa = { s: Math.PI / 2, n: -Math.PI / 2, e: 0, w: Math.PI }[s.front];
  const at = a => { const f = face(B, cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r, Math.PI / 2 - a); f.B = B; return f; };
  const n = Math.max(5, Math.round(r * 1.5));
  for (let fl = 0; fl < floors; fl++) for (let i = 0; i < n; i++) {
    const a = fa + (i + (fl % 2) * 0.5) / n * Math.PI * 2;
    if (fl === 0 && Math.abs(Math.atan2(Math.sin(a - fa), Math.cos(a - fa))) < 0.6) continue;
    if (R() < 0.2) continue;
    // 세로 기둥선
    if (fl === 0) at(a + Math.PI / n)(K.wood, 0, H / 2 + 0.25, 0.0, 0.14, H - 0.5, 0.08);
    fakeWindow(K, at(a), 0, fl * 3.0 + 1.3, 0.85, 1.1, R, { planter: fl > 0 && R() < 0.15 });
  }
  const ff = at(fa);
  if (s.shop) {
    fakeDoor(K, ff, 0, 1.3, 2.2);
    const sp = ff.world(0, Math.min(H - 1.2, 4.3), 0.1);
    signBoard(B, [...s.shop][0], sp.x, sp.y, sp.z, ff.ry, 1.3, 1.3, { both: false, round: true, color: '#b3352a', bg: '#f1ead6' });
    const lp = ff.world(-1.1, 2.2, 0.35); glows.push(lantern(B, lp.x, lp.y, lp.z, { r: 0.17, h: 0.42 }));
    // 문 위 작은 기와 차양
    const o = ff.world(-1.3, 2.55, 0.9), Vv = ff.ndir.clone().multiplyScalar(-0.9).add(V(0, 0.4, 0)); const len = Vv.length(); Vv.normalize();
    tilePanel(B, tile, o, ff.xdir, Vv, 2.6, len, null, 2, false);
    for (const su of [-1, 1]) beamBetween(B, K.wood, ff.world(su * 1.2, 2.2, 0.02), ff.world(su * 1.2, 2.52, 0.8), 0.06, 0.08);
  } else fakeDoor(K, ff, 0, 1.15, 2.15);
  if (s.roofKind === 'flat') {   // 층층이 줄어드는 탑: 넓은 기와 처마 위에 작은 윗층
    coneRoof(B, tile, cx, cz, r + 0.9, H, 0.9, { rTop: r * 0.62, seg: 24, detail: s.near ? 4 : 2, lip: false, cap: false });
    const r2 = r * 0.6, H2 = 2.6;
    B.geo(wm, new THREE.CylinderGeometry(r2, r2, H2, 24, 1, true), mat4(cx, H + 0.9 + H2 / 2, cz), [r2 * 6.28, H2]);
    for (let i = 0; i < 5; i++) { const a = fa + i / 5 * Math.PI * 2, f = face(B, cx + Math.cos(a) * r2, H + 0.9, cz + Math.sin(a) * r2, Math.PI / 2 - a); f.B = B; fakeWindow(K, f, 0, 0.9, 0.7, 0.9, R); }
    coneRoof(B, tile, cx, cz, r2 + 0.7, H + 0.9 + H2, r2 * 0.75, { seg: 20, detail: s.near ? 4 : 2, lip: false });
  } else coneRoof(B, tile, cx, cz, r + 0.9, H, s.rise ?? r * (0.5 + R() * 0.25), { seg: 24, detail: s.near ? 4 : 2, lip: false });
  if (R() < 0.5) { const a = fa + 2.2, p0 = V(cx + Math.cos(a) * (r + 0.08), H - 0.2, cz + Math.sin(a) * (r + 0.08)); B.geo(K.pipe, tube([p0, p0.clone().setY(0.3)], 0.05, 6, false)); }
}

/* ---------- 집 자리 잡기: 길 양쪽을 따라 줄지어 세운다 ---------- */
function planHouses(R, mobile) {
  const out = [], lots = Object.values(LOT).map(L => [L.x0 - 2.5, L.z0 - 2.5, L.x1 + 2.5, L.z1 + 2.5]);
  const hit = (a, b, pad = 0) => a[0] < b[2] + pad && a[2] > b[0] - pad && a[1] < b[3] + pad && a[3] > b[1] - pad;
  const ok = r => {
    for (const [x, z] of [[r[0], r[1]], [r[2], r[1]], [r[0], r[3]], [r[2], r[3]]]) if (Math.hypot(x - WALL.cx, z - WALL.cz) > WALL.r - 7) return false;
    if (r[1] < CLIFF.z + 13) return false;
    if (r[2] > 76 && r[0] < 124 && r[1] < CLIFF.z + 24) return false;      // 바위 계단 앞은 비워 둔다
    return !lots.some(l => hit(r, l)) && !ROADS.some(d => hit(r, d, 0.8)) && !out.some(o => hit(r, o.rect, 1.3));
  };
  let shopI = 0;
  const add = (rect, front, mainSt) => {
    if (!ok(rect)) return false;
    const w = Math.min(rect[2] - rect[0], rect[3] - rect[1]);
    const round = w > 7 && Math.abs((rect[2] - rect[0]) - (rect[3] - rect[1])) < 2.5 && R() < 0.3;
    const kindR = R();
    // 우치하 구역에 걸친 집은 난수는 그대로 쓰되 세우지 않는다(다른 집들의 모습이 바뀌지 않게)
    const s = { gone: rect[0] < UCHIHA.x1 + 0.5 && rect[2] > UCHIHA.x0 - 0.5 && rect[1] < UCHIHA.z1 + 0.5 && rect[3] > UCHIHA.z0 - 0.5 };
    out.push(Object.assign(s, {
      rect, x0: rect[0], z0: rect[1], x1: rect[2], z1: rect[3], front, round,
      floors: round ? 2 + Math.floor(R() * 2.4) : 1 + Math.floor(R() * 2.3) + (mainSt && R() < 0.5 ? 1 : 0),
      wall: Math.floor(R() * WALLS.length), roof: Math.floor(R() * ROOFS.length),
      roofKind: round ? (R() < 0.35 ? 'flat' : 'cone') : kindR < 0.5 ? 'gable' : kindR < 0.78 ? 'hip' : 'flat',
      shop: R() < (mainSt ? 0.75 : 0.3) ? SHOPS[shopI++ % SHOPS.length] : null,
      seed: Math.floor(R() * 1e6),
    }));
    rect.gone = s.gone; RECTS.push(rect);
    return true;
  };
  ROADS.forEach((rd, ri) => {
    const vert = rd[3] - rd[1] > rd[2] - rd[0], a0 = vert ? rd[1] : rd[0], a1 = vert ? rd[3] : rd[2];
    for (const side of [-1, 1]) {
      let a = a0 + 1 + R() * 3;
      while (a < a1 - 6) {
        const wdt = 7.5 + R() * 4.5, dep = 7.5 + R() * 3.5, set = 1.3 + R() * 1.4;
        const e = side < 0 ? (vert ? rd[0] : rd[1]) - set : (vert ? rd[2] : rd[3]) + set;       // 길 쪽 벽면
        const rect = vert ? [side < 0 ? e - dep : e, a, side < 0 ? e : e + dep, a + wdt] : [a, side < 0 ? e - dep : e, a + wdt, side < 0 ? e : e + dep];
        const front = vert ? (side < 0 ? 'e' : 'w') : (side < 0 ? 's' : 'n');
        add(rect, front, ri === 0);
        a += wdt + (mobile ? 6 : 1.4) + R() * 2.2;   // 폰에서는 집을 성기게 세운다
      }
    }
  });
  // 길에서 물러난 안쪽에도 드문드문
  for (let i = 0; i < 500 && out.length < (mobile ? 0 : 150); i++) {
    const x = (R() - 0.5) * 330, z = WALL.cz + (R() - 0.5) * 330, w = 7 + R() * 4, d = 7 + R() * 4, rect = [x, z, x + w, z + d];
    if (out.some(o => hit(rect, o.rect, 4))) continue;
    add(rect, 'nsew'[Math.floor(R() * 4)], false);
  }
  return out;
}

/* ---------- 담과 정문 ---------- */
export function buildWall(scene, K, glows) {
  const SEG = Math.round(WALL.r * 0.65);   // 담이 커져도 한 마디 길이가 같게
  const B = new Builder(), r = WALL.r, wm = mat('plaster', 0xd8ceb4), tile = mat('tile', 0x4a5560), red = mat('plaster', 0xa63a2a), green = mat('planks', 0x3f6b46);
  const aE = Math.asin((CLIFF.z + 1 - WALL.cz) / r), a0 = aE, a1 = Math.PI - aE;      // 절벽에서 시작해 남쪽을 돌아 절벽에서 끝난다
  const gw = 6.2 / r, gate = [{ a0: Math.PI / 2 - gw, a1: Math.PI / 2 + gw, ys: [[0, 8.2]] }];
  roundWall(B, wm, WALL.cx, WALL.cz, r - 1.1, r + 1.1, 0, 9, gate, { a0, a1, seg: SEG });
  roundWall(B, K.stone, WALL.cx, WALL.cz, r - 1.2, r + 1.2, 0, 1.3, [{ a0: Math.PI / 2 - gw, a1: Math.PI / 2 + gw, ys: [[0, 1.3]] }], { a0, a1, seg: SEG, collide: false });
  // 담 위 기와: 양쪽으로 흘러내리는 두 면과 용마루
  const N = Math.round(WALL.r * 0.81);
  for (let i = 0; i < N; i++) {
    const p = a0 + (a1 - a0) * i / N, q = a0 + (a1 - a0) * (i + 1) / N, mid = (p + q) / 2;
    if (Math.abs(mid - Math.PI / 2) < gw) continue;
    const P = (rr, a, y) => V(WALL.cx + Math.cos(a) * rr, y, WALL.cz + Math.sin(a) * rr);
    for (const s of [1, -1]) {
      const e0 = P(r + s * 1.7, s > 0 ? q : p, 9.0), e1 = P(r + s * 1.7, s > 0 ? p : q, 9.0), top = P(r, mid, 9.9);
      const U = e1.clone().sub(e0), w = U.length(); U.normalize();
      const Vv = top.clone().sub(e0.clone().add(e1).multiplyScalar(0.5)); const len = Vv.length(); Vv.normalize();
      tilePanel(B, tile, e0, U, Vv, w, len, null, 2, false);
    }
  }
  const ridge = []; for (let i = 0; i <= N; i++) { const a = a0 + (a1 - a0) * i / N; ridge.push(V(WALL.cx + Math.cos(a) * r, 9.95, WALL.cz + Math.sin(a) * r)); }
  B.geo(tile, tube(ridge, 0.16, 8, true));
  // 기와 밑널: 정문 자리는 비운다(이어 두면 문루 앞으로 튀어나와 "忍" 판을 가로지른다). 끝은 붉은 기둥 속에 묻힌다
  const gp = 7.3 / r;
  for (const [p, q] of [[a0, Math.PI / 2 - gp], [Math.PI / 2 + gp, a1]]) { const g = new THREE.RingGeometry(r - 1.75, r + 1.75, Math.round(SEG * 0.6), 1, p, q - p); g.rotateX(Math.PI / 2); B.geo(K.wood, g, mat4(WALL.cx, 8.98, WALL.cz)); }

  // 정문: 붉은 기둥과 문루 지붕, 활짝 열린 초록 문짝(あ·ん)
  const gz = WALL.gateZ, gx = 6.2;
  for (const s of [-1, 1]) {
    B.box(red, s * gx - 1.3, 0, gz - 1.7, s * gx + 1.3, 10.6, gz + 1.7);
    B.box(K.stone, s * gx - 1.45, 0, gz - 1.85, s * gx + 1.45, 1.4, gz + 1.85, false);
    B.box(K.wood, s * gx - 1.4, 10.3, gz - 1.8, s * gx + 1.4, 10.6, gz + 1.8, false);
    // 문짝: 안쪽으로 열려 큰길과 나란히 서 있다
    const dx = s * (gx - 1.55), z0 = gz - 6.6, z1 = gz - 1.2;
    B.box(green, dx - 0.16, 0.15, z0, dx + 0.16, 7.9, z1);
    for (const yy of [0.6, 2.8, 5.2, 7.4]) B.box(M.iron, dx - 0.19, yy, z0 - 0.02, dx + 0.19, yy + 0.22, z1 + 0.02, false);
    for (let k = 0; k < 6; k++) for (const yy of [0.71, 2.91, 5.31, 7.51]) B.put(M.iron, new THREE.SphereGeometry(0.07, 8, 6), dx - s * 0.2, yy, z0 + 0.45 + k * 0.9);
    const ch = s < 0 ? 'あ' : 'ん', tm = textMat(ch, { w: 256, h: 256, color: '#f1ead6', pad: 0.08, font: 'gothic' });
    const g = new THREE.PlaneGeometry(3.2, 3.2);
    B.geo(tm, g, mat4(dx - s * 0.175, 4.1, (z0 + z1) / 2, 0, -s * Math.PI / 2, 0));
  }
  B.box(red, -gx - 1.3, 8.2, gz - 1.2, gx + 1.3, 10.3, gz + 1.2);
  B.box(K.wood, -gx - 1.4, 8.0, gz - 1.3, gx + 1.4, 8.3, gz + 1.3, false);
  gableRoof(B, mat('tile', 0x3f6f78), -gx - 1.6, gz - 1.9, gx + 1.6, gz + 1.9, 10.6, 2.0, { ridge: 'x', gable: red, over: 1.2, overGable: 0.9 });
  for (const s of [1, -1]) signBoard(B, '忍', 0, 9.25, gz + s * 1.24, s > 0 ? 0 : Math.PI, 1.7, 1.7, { round: true, both: false, color: '#f1ead6', bg: '#2f5a34' });

  // 문지기 초소: 정문 안쪽 길가의 작은 집, 열린 창구와 책상
  {
    const x0 = 9, x1 = 13.5, z0 = gz - 13, z1 = gz - 9, wm2 = mat('plaster', 0xe8dcc0);
    wall(B, wm2, 'z', x0, x0 + 0.18, z0, z1, 0, 2.7, [{ u0: z0 + 0.5, u1: z1 - 0.5, ys: [[1.0, 2.2]] }]);
    wall(B, wm2, 'z', x1 - 0.18, x1, z0, z1, 0, 2.7, []);
    wall(B, wm2, 'x', z0, z0 + 0.18, x0 + 0.18, x1 - 0.18, 0, 2.7, [{ u0: x0 + 1.4, u1: x0 + 2.6, ys: [[0, 2.15]] }]);
    wall(B, wm2, 'x', z1 - 0.18, z1, x0 + 0.18, x1 - 0.18, 0, 2.7, []);
    B.box(M.floorDark, x0 + 0.18, 0, z0 + 0.18, x1 - 0.18, 0.08, z1 - 0.18);
    B.box(K.woodL, x0 - 0.35, 0.94, z0 + 0.4, x0 + 0.6, 1.0, z1 - 0.4);                  // 창구 선반(책상)
    for (const z of [z0 + 0.6, z1 - 0.6]) beamBetween(B, K.wood, V(x0 - 0.3, 0.94, z), V(x0, 0.5, z), 0.06, 0.06);
    for (let i = 0; i < 3; i++) B.geo(mat('paper', 0xf1ead6), new THREE.CylinderGeometry(0.035, 0.035, 0.34, 10), mat4(x0 - 0.1, 1.04, z0 + 1.2 + i * 0.16, 0, 0.3 * i, Math.PI / 2));   // 출입 명부 두루마리
    for (const z of [z0 + 1.3, z1 - 1.3]) {   // 걸상 둘
      B.geo(K.woodL, new THREE.CylinderGeometry(0.2, 0.2, 0.05, 14), mat4(x0 + 1.1, 0.55, z));
      for (let k = 0; k < 3; k++) { const a = k / 3 * 6.283; beamBetween(B, K.wood, V(x0 + 1.1 + Math.cos(a) * 0.08, 0.53, z + Math.sin(a) * 0.08), V(x0 + 1.1 + Math.cos(a) * 0.2, 0.08, z + Math.sin(a) * 0.2), 0.035, 0.035); }
    }
    gableRoof(B, mat('tile', 0x3f6f78), x0, z0, x1, z1, 2.7, 1.1, { ridge: 'z', gable: wm2, over: 0.8 });
    signBoard(B, '受付', x0 - 0.1, 2.42, (z0 + z1) / 2, -Math.PI / 2, 1.3, 0.42, { both: false });
  }
  B.finish(scene);
}

/* ---------- 거리 살림 ---------- */
function buildProps(scene, K, R) {
  const B = new Builder();
  // 전봇대와 늘어진 전깃줄(큰길과 동서 골목)
  const pole = (x, z) => {
    B.geo(K.wood, new THREE.CylinderGeometry(0.1, 0.15, 9, 10), mat4(x, 4.5, z), [0.8, 9]);
    addCollider(x - 0.15, 0, z - 0.15, x + 0.15, 9, z + 0.15);
    return [x, z];
  };
  const line = (pts, armAxis) => {
    for (const [x, z] of pts) {
      for (const y of [8.4, 7.7]) {
        if (armAxis === 'x') B.box(K.wood, x - 0.9, y, z - 0.05, x + 0.9, y + 0.1, z + 0.05, false); else B.box(K.wood, x - 0.05, y, z - 0.9, x + 0.05, y + 0.1, z + 0.9, false);
        for (const o of [-0.75, 0, 0.75]) B.geo(M.white, new THREE.CylinderGeometry(0.04, 0.05, 0.14, 8), armAxis === 'x' ? mat4(x + o, y + 0.17, z) : mat4(x, y + 0.17, z + o));
      }
      B.geo(K.tank, new THREE.CylinderGeometry(0.22, 0.22, 0.5, 12), mat4(x + (armAxis === 'x' ? 0 : 0.3), 6.9, z + (armAxis === 'x' ? 0.3 : 0)));   // 변압기 통
    }
    for (let i = 0; i < pts.length - 1; i++) for (const y of [8.6, 7.9]) for (const o of [-0.75, 0, 0.75]) {
      const a = V(pts[i][0] + (armAxis === 'x' ? o : 0), y, pts[i][1] + (armAxis === 'x' ? 0 : o)), b = V(pts[i + 1][0] + (armAxis === 'x' ? o : 0), y, pts[i + 1][1] + (armAxis === 'x' ? 0 : o)), w = [];
      for (let k = 0; k <= 8; k++) { const t = k / 8; w.push(a.clone().lerp(b, t).add(V(0, -1.1 * 4 * t * (1 - t), 0))); }
      B.geo(M.iron, tube(w, 0.012, 3, false));
    }
  };
  const mainP = []; for (let z = -44; z <= 160; z += 29) mainP.push(pole(z % 2 ? 6.9 : -6.9, z));
  line(mainP.map(p => [-6.9, p[1]]).map((p, i) => (mainP[i][0] = -6.9, p)), 'x');
  const westP = []; for (let x = -100; x <= -12; x += 29) westP.push(pole(x, 4.8)); line(westP, 'z');
  const eastP = []; for (let x = 14; x <= 100; x += 29) eastP.push(pole(x, 92.8)); line(eastP, 'z');

  // 긴 걸상
  const bench = (x, z, ry) => {
    const f = face(B, x, 0, z, ry);
    for (const d of [-0.14, 0, 0.14]) f(K.woodL, 0, 0.45, d, 1.6, 0.04, 0.12);
    for (const y of [0.72, 0.9]) f(K.woodL, 0, y, -0.25, 1.6, 0.1, 0.03);
    for (const u of [-0.65, 0.65]) { f(K.wood, u, 0.22, 0.15, 0.06, 0.44, 0.06); f(K.wood, u, 0.48, -0.24, 0.06, 0.96, 0.06); f(K.wood, u, 0.4, -0.04, 0.05, 0.05, 0.42); }
    const c = Math.abs(Math.sin(ry)) > 0.5; addCollider(x - (c ? 0.3 : 0.8), 0, z - (c ? 0.8 : 0.3), x + (c ? 0.3 : 0.8), 0.46, z + (c ? 0.8 : 0.3));
  };
  for (const z of [-30, 34, 66, 104, 138]) { bench(-6.4, z, Math.PI / 2); if (z !== 34) bench(6.4, z + 9, -Math.PI / 2); }
  for (const x of [-60, 60]) bench(x, -50.6, Math.PI);

  // 나무통과 궤짝(가게 옆)
  const prof = []; for (let i = 0; i <= 10; i++) { const t = i / 10; prof.push(new THREE.Vector2(0.27 + 0.07 * Math.sin(Math.PI * t), t * 0.85)); }
  const barrelG = new THREE.LatheGeometry(prof, 16), hoopG = new THREE.TorusGeometry(0.31, 0.014, 5, 16); hoopG.rotateX(Math.PI / 2);
  const lidG = new THREE.CircleGeometry(0.28, 16); lidG.rotateX(-Math.PI / 2);
  const barrel = (x, z) => { B.geo(K.door, barrelG, mat4(x, 0, z)); B.geo(K.door, lidG, mat4(x, 0.82, z)); for (const y of [0.16, 0.42, 0.68]) B.geo(M.iron, hoopG, mat4(x, y, z, 0, 0, 0, y === 0.42 ? 1.1 : 1.0)); addCollider(x - 0.3, 0, z - 0.3, x + 0.3, 0.85, z + 0.3); };
  const crate = (x, z, s) => { B.box(K.woodL, x - s / 2, 0, z - s / 2, x + s / 2, s, z + s / 2); for (const y of [0.08, s - 0.06]) B.box(K.wood, x - s / 2 - 0.015, y - 0.04, z - s / 2 - 0.015, x + s / 2 + 0.015, y + 0.04, z + s / 2 + 0.015, false); };
  for (const r of RECTS) {
    if (R() > 0.3) continue;
    const x = R() < 0.5 ? r[0] - 0.57 : r[2] + 0.57, z = r[1] + 1 + R() * (r[3] - r[1] - 2);
    if (ROADS.some(d => x > d[0] - 0.4 && x < d[2] + 0.4 && z > d[1] - 0.4 && z < d[3] + 0.4)) continue;
    if (r.gone) { R(); R(); continue; }   // 우치하 구역에 걸려 세우지 않은 집: 난수 차례만 맞춘다
    barrel(x, z); if (R() < 0.6) barrel(x, z + 0.68); if (R() < 0.5) crate(x, z - 0.8, 0.6);
  }
  B.finish(scene);
}

export async function build(scene, ctx) {
  const R = rng(777), K = makeKit(), glows = [];
  const plan = planHouses(R, ctx.mobile).filter(s => !s.gone);
  // 방향별로 묶어 한 덩어리씩 만든다(등 뒤의 집은 그리지 않게)
  const SECT = 12, groups = Array.from({ length: SECT }, () => []);
  for (const s of plan) {
    const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
    s.near = !ctx.mobile && cx > -22 && cx < 22;      // 큰길·광장가의 집은 기와를 곱게
    groups[(Math.floor((cx + 180) / 120) + 3 * Math.floor((cz + 190) / 95)) % SECT].push(s);
  }
  let n = 0;
  for (const g of groups) {
    if (!g.length) continue;
    const B = new Builder();
    for (const s of g) { const Rs = rng(s.seed); if (s.round) towerHouse(B, K, s, Rs, glows); else boxHouse(B, K, s, Rs, glows); }
    B.finish(scene);
    n += g.length;
    await ctx.say(`거리에 집을 세우는 중… ${n}/${plan.length}`);
  }
  buildWall(scene, K, glows);
  buildProps(scene, K, R);
  return {
    glows,
    places: [
      { n: '정문', t: '마을의 남쪽 대문. 왼쪽 문짝에 あ, 오른쪽 문짝에 ん이 적혀 있다.', b: [-16, 16, WALL.gateZ - 16, WALL.gateZ + 6] },
      { n: '관저 앞 광장길', t: '호카게 관저와 아카데미 앞을 동서로 지나는 넓은 길.', b: [-112, 112, -70, -50] },
      { n: '서쪽 골목', t: '나루토가 사는 공동주택이 이 골목에 있다.', b: [-118, -6, -4, 4] },
      { n: '동남 골목', t: '사쿠라네 집 앞 골목.', b: [6, 118, 84, 92] },
    ],
    jumps: [],
  };
}
