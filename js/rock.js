// 호카게 바위 — 북쪽 절벽에 새긴 역대 호카게 여섯 얼굴(왼쪽부터 초대 하시라마 … 6대 카카시. 나루토가 호카게가 되기 전이라 7대의 얼굴은 없다)과, 바위 꼭대기로 오르는 나무 계단.
// 얼굴은 "앞으로 얼마나 튀어나왔나"를 (x, y)마다 계산해 절벽 면을 밀어내 빚는다: 이마·광대·코·입술·머리카락을 둥근 덩이로 쌓고, 눈매·입·수염 자국은 홈으로 판다.
import * as THREE from '../vendor/three.module.js';
import { Builder, addCollider, stairs } from './build.js';
import { mat, M, weatherize } from './materials.js';
import { beamBetween, railing } from './arch.js';
import { CLIFF, STAIR } from './layout.js';
import { mountainH } from './village.js';

const NEG = -40;
// 얼굴과 바위 굴곡은 처음 빚은 크기(꼭대기 60m)로 계산하고, 절벽을 뜰 때 K배로 키운다.
const K = CLIFF.k, TOP0 = CLIFF.top / K;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// 부드럽게 이어 붙이는 최댓값(k가 클수록 둥글게 섞인다)
const smax = (a, b, k) => { const h = clamp(0.5 + 0.5 * (a - b) / k, 0, 1); return b + (a - b) * h + k * h * (1 - h); };
// 둥근 덩이(타원체의 윗면)
const SKIRT = 2.6;
const ell = (u, v, cu, cv, ru, rv, cz, rz) => { const a = (u - cu) / ru, b = (v - cv) / rv, q = 1 - a * a - b * b; return q <= 0 ? cz - (Math.sqrt(a * a + b * b) - 1) * Math.min(ru, rv) * SKIRT : cz + rz * Math.sqrt(q); };
// 굵기가 변하는 가래떡 모양(머리카락 한 가닥, 콧등). strands를 주면 가닥 결이 팬다.
function cap(u, v, c, strands = 0) {
  const [ax, ay, az, ra, bx, by, bz, rb] = c;
  const dx = bx - ax, dy = by - ay, t = clamp(((u - ax) * dx + (v - ay) * dy) / (dx * dx + dy * dy), 0, 1);
  const px = ax + dx * t, py = ay + dy * t, d = Math.hypot(u - px, v - py), r = ra + (rb - ra) * t;
  if (d >= r) return az + (bz - az) * t - (d - r) * SKIRT;
  let z = az + (bz - az) * t + Math.sqrt(r * r - d * d) * 0.85;
  if (strands) { const side = (u - ax) * dy - (v - ay) * dx > 0 ? 1 : -1; z += 0.11 * Math.cos(side * d / r * Math.PI * strands + 0.8); }
  return z;
}
// 선분을 따라 판 홈의 깊이(0~1)
function groove(u, v, ax, ay, bx, by, w) {
  const dx = bx - ax, dy = by - ay, t = clamp(((u - ax) * dx + (v - ay) * dy) / (dx * dx + dy * dy), 0, 1);
  const d = Math.hypot(u - ax - dx * t, v - ay - dy * t);
  if (d >= w) return 0;
  const g = 1 - d / w; return g * g * (3 - 2 * g);
}
const poly = (u, v, pts, w) => { let g = 0; for (let i = 0; i < pts.length - 1; i++) g = Math.max(g, groove(u, v, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], w)); return g; };
const ring = (u, v, cu, cv, r, w) => { const d = Math.abs(Math.hypot(u - cu, v - cv) - r); if (d >= w) return 0; const g = 1 - d / w; return g * g * (3 - 2 * g); };

// 이마 보호대에 새기는 나뭇잎 표식(소용돌이 + 잎꼭지)
const LEAF = (() => {
  const p = [];
  for (let i = 0; i <= 26; i++) { const a = i / 26 * Math.PI * 3.1 + 0.4, r = 0.12 + 0.62 * i / 26; p.push([Math.cos(a) * r * 1.05, Math.sin(a) * r * 0.9]); }
  p.push([-1.25, -0.72]);
  return p;
})();

/* ---------- 여섯 호카게: 얼굴 생김새의 차이 ----------
   원작의 바위 얼굴처럼 각지게 깎는다: 뾰족한 턱, 날 선 콧날, 큼직하게 판 눈매, 덩어리진 머리카락.
   fans: 머리카락 뭉치 묶음 [가닥 수, 시작 각, 끝 각(도, 0=위·+는 보는 쪽 오른쪽), 길이, 밑동 굵기, 기울임, 앞으로 나온 정도, 씨앗]
   locks: 길게 늘어진 머리 [ax,ay,az,ra, bx,by,bz,rb], lines: 얼굴에 판 선 */
const HOKAGE = [
  { name: '초대 호카게 · 센주 하시라마', band: true, w: 1.0, jaw: 1.12, brow: -0.1, mouth: -0.05, scalp: true, seed: 3,
    locks: [[-1.2, 9.6, 3.6, 2.3, -5.9, 4.6, 3.0, 2.2], [-5.9, 4.6, 3.0, 2.2, -6.5, -3.5, 2.2, 1.9], [-6.5, -3.5, 2.2, 1.9, -6.2, -12.5, 1.2, 1.3],
      [1.2, 9.6, 3.6, 2.3, 5.9, 4.6, 3.0, 2.2], [5.9, 4.6, 3.0, 2.2, 6.5, -3.5, 2.2, 1.9], [6.5, -3.5, 2.2, 1.9, 6.2, -12.5, 1.2, 1.3],
      [-0.8, 6.0, 5.5, 1.0, -4.9, 1.5, 4.4, 0.85], [-4.9, 1.5, 4.4, 0.85, -5.1, -6.0, 3.2, 0.5], [0.8, 6.0, 5.5, 1.0, 4.9, 1.5, 4.4, 0.85], [4.9, 1.5, 4.4, 0.85, 5.1, -6.0, 3.2, 0.5]],
    lines: [] },
  { name: '2대 호카게 · 센주 토비라마', band: true, guard: true, w: 0.97, jaw: 1.0, brow: -0.4, mouth: -0.12, seed: 7,
    fans: [[6, -95, 95, 5.6, 2.6, 0, 0, 2], [5, -70, 70, 3.6, 2.1, 0, 1.2, 4]],
    lines: [[[-2.7, -0.3], [-3.2, -3.6]], [[2.7, -0.3], [3.2, -3.6]], [[0, -5.9], [0, -8.2]]] },
  { name: '3대 호카게 · 사루토비 히루젠', band: true, w: 1.03, jaw: 1.1, brow: -0.05, mouth: -0.02, goatee: true, seed: 11,
    fans: [[5, -85, 85, 5.2, 2.7, 0, 0, 5], [4, -60, 60, 3.4, 2.2, 0, 1.2, 6]],
    lines: [[[-3.5, 0.0], [-4.2, -2.6]], [[3.5, 0.0], [4.2, -2.6]], [[-1.1, -2.2], [-2.3, -4.9]], [[1.1, -2.2], [2.3, -4.9]], [[-4.4, 1.2], [-5.0, 0.6]], [[4.4, 1.2], [5.0, 0.6]]] },
  { name: '4대 호카게 · 나미카제 미나토', band: true, w: 0.96, jaw: 0.9, brow: -0.15, mouth: 0.06, seed: 17,
    fans: [[7, -105, 105, 6.4, 2.5, 0, 0, 9], [6, -80, 80, 4.2, 2.0, 0, 1.2, 10]],
    locks: [[-4.9, 5.6, 4.9, 1.5, -6.2, 0.0, 4.0, 1.25], [-6.2, 0.0, 4.0, 1.25, -5.2, -6.6, 3.0, 0.3], [4.9, 5.6, 4.9, 1.5, 6.2, 0.0, 4.0, 1.25], [6.2, 0.0, 4.0, 1.25, 5.2, -6.6, 3.0, 0.3]],
    lines: [] },
  { name: '5대 호카게 · 츠나데', band: false, w: 0.94, jaw: 0.82, brow: 0.05, mouth: 0.04, lashes: true, diamond: true, scalp: true, seed: 23,
    locks: [[-0.5, 9.8, 4.6, 2.2, -4.5, 5.2, 5.1, 2.0], [-4.5, 5.2, 5.1, 2.0, -6.0, -2.4, 3.8, 1.5], [-6.0, -2.4, 3.8, 1.5, -5.4, -9.0, 2.6, 0.35],
      [0.5, 9.8, 4.6, 2.2, 4.5, 5.2, 5.1, 2.0], [4.5, 5.2, 5.1, 2.0, 6.0, -2.4, 3.8, 1.5], [6.0, -2.4, 3.8, 1.5, 5.4, -9.0, 2.6, 0.35]],
    lines: [] },
  { name: '6대 호카게 · 하타케 카카시', band: true, w: 0.96, jaw: 0.95, brow: 0.0, mouth: 0, mask: true, sleepy: true, seed: 29,
    fans: [[6, -70, 95, 7.2, 2.7, 24, 0, 13], [5, -50, 75, 4.6, 2.1, 24, 1.2, 14]],
    lines: [] },
];
const HX0 = i => -50 + 20 * i, HY0 = 37.5, HS0 = 1.42;                                  // 처음 크기에서의 얼굴 자리·크기
export const HEAD_X = i => HX0(i) * K, HEAD_Y = HY0 * K, HEAD_S = HS0 * K;               // 마을 좌표(m)

const hs = (i, s) => { const j = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453; return j - Math.floor(j); };
// 매듭점 사이를 잇는 값. smooth면 부드럽게, 아니면 곧게(각진 윤곽).
function knots(v, K, smooth = true) {
  if (v <= K[0][0]) return K[0][1];
  for (let i = 0; i < K.length - 1; i++) if (v <= K[i + 1][0]) { let t = (v - K[i][0]) / (K[i + 1][0] - K[i][0]); if (smooth) t = t * t * (3 - 2 * t); return K[i][1] + (K[i + 1][1] - K[i][1]) * t; }
  return K[K.length - 1][1];
}
// 날이 선 머리카락 한 뭉치: 가운데가 능선처럼 솟고 끝으로 갈수록 가늘어진다
function blade(u, v, b) {
  const [ax, ay, az, bx, by, bz, r0] = b;
  const dx = bx - ax, dy = by - ay, t = clamp(((u - ax) * dx + (v - ay) * dy) / (dx * dx + dy * dy), 0, 1);
  const d = Math.hypot(u - ax - dx * t, v - ay - dy * t), r = r0 * Math.pow(1 - t, 0.75) + 0.06, zc = az + (bz - az) * t;
  return d >= r ? zc - (d - r) * SKIRT : zc + (r - d) * 0.85;
}
// 얼굴마다 미리 계산해 두는 것: 머리카락 뭉치, 바위에 간 금
for (const H of HOKAGE) {
  H.blades = [];
  for (const [n, a0, a1, len, r, lean, lift, seed] of H.fans || []) for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1), ang = a0 + (a1 - a0) * t + (hs(i, seed) - 0.5) * 16, ar = ang * Math.PI / 180;
    const bu = Math.sin(ar) * 4.6, bv = 6.0 + Math.cos(ar) * 2.4, ta = (ang * 0.9 + lean) * Math.PI / 180, L = len * (0.75 + 0.5 * hs(i + 20, seed));
    H.blades.push([bu, bv, 4.3 + lift, bu + Math.sin(ta) * L, bv + Math.cos(ta) * L, 2.2 + lift, r * (0.85 + 0.3 * hs(i + 40, seed))]);
  }
  H.cracks = [];
  for (let c = 0; c < 3; c++) {
    let u = (hs(c, H.seed) - 0.5) * 9, v = 9 - hs(c + 5, H.seed) * 6; const pts = [[u, v]];
    for (let k = 0; k < 7; k++) { u += (hs(c * 9 + k, H.seed + 1) - 0.5) * 1.5; v -= 1.1 + hs(c * 7 + k, H.seed + 2) * 1.4; pts.push([u, v]); }
    H.cracks.push(pts);
  }
}

const W_K = [[-8.75, 0], [-8.3, 1.25], [-7.4, 1.95], [-3.0, 4.75], [0.5, 5.3], [4.0, 5.4], [7.5, 4.9], [9.6, 3.2], [10.6, 0]];       // 얼굴 반폭(턱끝 → 이마)
const Z_K = [[-10.6, 1.5], [-9.0, 2.1], [-8.35, 4.25], [-7.2, 4.75], [-4.4, 5.05], [-2.0, 5.25], [1.0, 4.95], [2.7, 5.35], [5.0, 5.1], [8.5, 3.4], [10.6, 0.5]];   // 얼굴 한가운데의 옆모습
const skull = (u, v) => ell(u, v, 0, 2.6, 5.9, 7.6, -1.5, 6.6);

// 얼굴 하나의 돌출(머리 단위). u, v는 얼굴 중심에서의 거리.
function headDepth(H, u0, v) {
  const u = u0 / H.w, au = Math.abs(u), sg = u < 0 ? -1 : 1;
  // 얼굴 판: 앞은 평평하고 옆으로 급하게 꺾이는 각진 단면, 아래로 갈수록 좁아지는 턱
  const jw = v < -3 ? 1 + (H.jaw - 1) * sstep(-3, -7.4, v) : 1;
  const Wd = knots(v, W_K) * jw, Z0 = knots(v, Z_K);
  let z;
  if (Wd > 0.05 && au < Wd) z = Z0 - 3.6 * Math.pow(au / Wd, 2.6); else z = Z0 - 3.6 - (au - Wd) * SKIRT;
  z = smax(z, skull(u, v), 0.6);
  z = smax(z, cap(u, v, [0, -7.5, 0.5, 2.5, 0, -12.0, 0.2, 2.8]), 0.5);                                  // 목
  z = smax(z, ell(au, v, 5.6, 0.7, 0.75, 1.75, 1.6, 1.3), 0.3);                               // 귀
  // 눈: 눈꺼풀 선을 깊게 긋고 그 안을 평평하게 판 다음 눈동자를 새긴다
  const eo = H.sleepy ? 1.12 : 1.3, upK = H.sleepy ? [[1.0, 0.8], [2.4, 1.36], [4.25, eo]] : [[1.0, 0.72], [2.3, 1.74], [4.25, eo]], loK = [[1.0, upK[0][1]], [2.7, 0.22], [4.25, eo]];
  if (au > 1.0 && au < 4.25) {
    const up = knots(au, upK, false), lo = knots(au, loK, false), t = Math.min(v - lo, up - v);
    if (t > 0) {
      z -= 0.36 * sstep(0, 0.16, t);
      z -= 0.2 * ring(au, v, 2.62, 0.98, 0.6, 0.12) * sstep(0.02, 0.12, t);
      z -= 0.26 * sstep(0.24, 0.1, Math.hypot(au - 2.62, v - 0.98));
    }
  }
  z -= (H.lashes ? 0.55 : 0.46) * poly(au, v, upK, H.lashes ? 0.27 : 0.21);
  z -= 0.22 * poly(au, v, loK, 0.13);
  const bt = H.brow || 0, brK = [[0.75, 2.5 + bt], [2.6, 3.0 + bt * 0.3], [4.7, 2.75 - bt * 0.5]];
  if (au > 0.8 && au < 4.6) { const up = knots(au, upK, false), br = knots(au, brK, false); if (v > up && v < br) z -= 0.3 * Math.sin(Math.PI * (v - up) / (br - up)); }   // 눈두덩 그늘
  z += 0.4 * poly(au, v, brK, 0.36);                                                           // 눈썹
  // 코: 날이 선 쐐기, 코끝 밑은 뚝 끊겨 그늘이 진다
  {
    const k = clamp((2.2 - v) / 4.1, 0, 1), zr = 5.25 + 1.45 * k + (H.mask ? 0.1 : 0);
    let zn = zr - au * (H.mask ? 1.25 : 1.95);
    if (v < -1.9) zn -= (-1.9 - v) * (H.mask ? 2.2 : 7); if (v > 2.2) zn -= (v - 2.2) * 3;
    z = H.mask ? smax(z, zn, 0.5) : Math.max(z, zn);
    if (!H.mask) z -= 0.18 * sstep(0.24, 0.08, Math.hypot(au - 0.42, v + 2.02));
  }
  if (!H.mask) {
    const mc = H.mouth;
    z -= 0.4 * poly(au, v, [[0, -4.45], [0.9, -4.45 + mc * 0.3], [1.6, -4.4 + mc]], 0.16);    // 입
    z -= 0.16 * groove(au, v, 0, -5.2, 0.6, -5.17, 0.13);                                      // 아랫입술 밑
  } else {
    // 복면: 콧등 아래를 덮은 천. 윗단은 도드라진 선, 뺨에는 당겨진 주름
    const edge = 0.5 - 0.04 * u * u;
    z += 0.26 * sstep(edge + 0.1, edge - 0.1, v) * sstep(-10.2, -9.0, v);
    z -= 0.12 * poly(au, v, [[0.5, -3.0], [2.8, -4.6], [3.6, -6.6]], 0.25);
  }
  for (const l of H.lines) z -= 0.34 * groove(u, v, l[0][0], l[0][1], l[1][0], l[1][1], 0.2);
  if (H.goatee) z = Math.max(z, blade(u, v, [0, -8.3, 4.2, 0, -12.2, 3.3, 1.0]));
  if (H.diamond) z -= 0.26 * poly(u, v, [[0, 5.5], [0.4, 4.85], [0, 4.2], [-0.4, 4.85], [0, 5.5]], 0.13);
  // 이마 보호대: 머리를 두른 띠와 쇠판
  const bend = 0.012 * u * u, v0 = 3.45 - bend, v1 = 5.25 - bend;
  if (H.band) {
    const inb = sstep(v0 - 0.06, v0 + 0.06, v) * sstep(v1 + 0.06, v1 - 0.06, v);
    if (inb > 0 && au < 6.2) {
      let b = Math.max(z, skull(u, v)) + 0.42;
      const plate = sstep(3.15, 3.0, au);
      b += 0.2 * plate;
      if (plate > 0) {
        b -= 0.17 * poly((u - 0.1) / 0.72, (v - (v0 + v1) / 2) / 0.72, LEAF, 0.17);
        b -= 0.13 * sstep(0.17, 0.07, Math.hypot(au - 2.62, v - (v0 + v1) / 2));               // 못 자리
      }
      z += (Math.max(z, b) - z) * inb;
    }
    if (H.guard) {   // 2대의 보호대는 광대와 턱 옆까지 내려온다
      z = Math.max(z, cap(u, v, [sg * 5.2, 4.0, 3.2, 1.05, sg * 5.0, -2.2, 3.4, 0.95]));
      z = Math.max(z, cap(u, v, [sg * 5.0, -2.2, 3.4, 0.95, sg * 3.3, -6.3, 3.7, 0.6]));
    }
  }
  // 머리카락
  let hair = NEG, any = false;
  if (H.scalp) { hair = ell(u, v, 0, 6.4, 6.5, 4.6, 0, 6.2) + 0.1 * Math.cos(u * 3.4) * sstep(4.6, 6.6, v) - 0.3 * sstep(0.35, 0.0, au) * sstep(5.5, 7.0, v); any = true; }
  if (H.blades.length) {
    hair = ell(u, v, 0, 6.0, 6.2, 4.2, 0.4, 4.9); any = true;
    for (const b of H.blades) hair = smax(hair, blade(u, v, b), 0.12);
  }
  if (H.locks) { any = true; for (const c of H.locks) hair = smax(hair, cap(u, v, c, 4), 0.2); }
  if (any) {
    const top = H.band ? sstep(v1 - 0.25, v1 + 0.1, v) : H.diamond ? sstep(6.0, 6.6, v + 0.07 * u * u) : 0;
    const cover = Math.max(top, H.locks && au > 3.5 ? 1 : 0);
    if (cover > 0) z += (Math.max(z, hair) - z) * Math.min(1, cover);
  }
  for (const c of H.cracks) z -= 0.2 * poly(u, v, c, 0.16);                                    // 바위에 간 금
  return z;
}

/* ---------- 절벽 면 ---------- */
function vn(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const h = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return (h(ix, iy) * (1 - u) + h(ix + 1, iy) * u) * (1 - v) + (h(ix, iy + 1) * (1 - u) + h(ix + 1, iy + 1) * u) * v;
}
// 맨 바위의 굴곡: 세로로 팬 골과 층층이 진 턱, 아래로 갈수록 앞으로 나온다
function rockDepth(x, y) {
  const gully = 1 - Math.abs(2 * vn(x * 0.09 + 5.2, y * 0.012) - 1);
  const ledge = vn(x * 0.03 + 9.1, y * 0.33);
  let d = 0.055 * (TOP0 - y) + 1.5 * gully * gully + 0.8 * ledge + 0.7 * vn(x * 0.11, y * 0.11);
  d *= 1 - sstep((STAIR.x0 - 12) / K, (STAIR.x0 - 6) / K, x) * sstep((STAIR.x1 + 12) / K, (STAIR.x1 + 6) / K, x);                  // 계단이 붙는 자리는 반반하게 깎는다
  return d;
}
function cliffDepth(x, y) {
  let d = rockDepth(x, y), near = 0, h = NEG;
  const i0 = Math.floor((x + 50) / 20);
  for (const i of [i0, i0 + 1]) {
    if (i < 0 || i > 5) continue;
    const u = (x - HX0(i)) / HS0, v = (y - HY0) / HS0;
    if (Math.abs(u) > 11.5 || v < -16.5 || v > 15.5) continue;
    h = Math.max(h, headDepth(HOKAGE[i], u, v));
    near = Math.max(near, sstep(1.25, 0.8, Math.hypot(u / 8.4, (v - 0.5) / 15)));       // 얼굴 둘레는 바위를 얕게 쳐냈다
  }
  d *= 1 - 0.5 * near;
  if (h > NEG) d = smax(d, h * HS0 + 1.8 + 0.07 * (vn(x * 1.7, y * 1.7) - 0.5) + 0.1 * (vn(x * 0.55 + 3.0, y * 0.55) - 0.5), 1.0);   // 정으로 쪼은 자국
  return d;
}

function buildCliff(scene, mobile) {
  // 얼굴이 있는 가운데는 촘촘하게, 바깥은 성기게 나눈 격자
  const xs = [], ys = [], FINE = mobile ? 0.26 : 0.16, X1 = 77, Y0 = 13.5, Y1 = 59.2, W = (CLIFF.half + CLIFF.fall + 6) / K;
  for (let x = -W; x < -X1; x += 1.5) xs.push(x);
  for (let x = -X1; x < X1; x += FINE) xs.push(x);
  for (let x = X1; x <= W + 0.01; x += 1.5) xs.push(x);
  for (let y = -1; y < Y0; y += 1.5) ys.push(y);
  for (let y = Y0; y < Y1; y += FINE) ys.push(y);
  for (let y = Y1; y < TOP0; y += 1.5) ys.push(y);
  ys.push(TOP0);
  const nx = xs.length, ny = ys.length, D = new Float32Array(nx * ny), Yv = new Float32Array(nx * ny);
  for (let i = 0; i < nx; i++) {
    const top = mountainH(xs[i] * K, CLIFF.z - 1) / K;
    for (let j = 0; j < ny; j++) {
      const y = Math.min(ys[j], top);
      Yv[j * nx + i] = y;
      D[j * nx + i] = cliffDepth(xs[i], y) * sstep(top, top - 1.2, y) * sstep(0, 6, top);
    }
  }
  const pos = new Float32Array(nx * ny * 3), nor = new Float32Array(nx * ny * 3), uv = new Float32Array(nx * ny * 2), col = new Float32Array(nx * ny * 3), face = new Float32Array(nx * ny);
  const at = (i, j) => D[clamp(j, 0, ny - 1) * nx + clamp(i, 0, nx - 1)];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, x = xs[i], y = Yv[k], d = D[k];
    pos[k * 3] = x * K; pos[k * 3 + 1] = y * K; pos[k * 3 + 2] = CLIFF.z + d * K;
    const i0 = Math.max(0, i - 1), i1 = Math.min(nx - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(ny - 1, j + 1);
    const dx = (at(i1, j) - at(i0, j)) / Math.max(1e-3, xs[i1] - xs[i0]), dy = (at(i, j1) - at(i, j0)) / Math.max(1e-3, Yv[j1 * nx + i] - Yv[j0 * nx + i]);
    const l = 1 / Math.hypot(dx, dy, 1);
    nor[k * 3] = -dx * l; nor[k * 3 + 1] = -dy * l; nor[k * 3 + 2] = l;
    uv[k * 2] = (x + d * 0.8) * K; uv[k * 2 + 1] = (y + d * 0.6) * K;                 // 튀어나온 옆면에서 무늬가 길게 늘어지지 않게
    // 팬 곳은 어둡게, 도드라진 곳은 밝게(흐린 날에도 얼굴 윤곽이 읽힌다)
    const s = 3, avg = (at(i - s, j) + at(i + s, j) + at(i, j - s) + at(i, j + s)) / 4;
    const span = Math.max(xs[Math.min(nx - 1, i + s)] - xs[Math.max(0, i - s)], 0.5);
    const spanY = Yv[Math.min(ny - 1, j + s) * nx + i] - Yv[Math.max(0, j - s) * nx + i];
    const c = span < 1.5 && spanY < 1.5 ? clamp(1 + (d - avg) * 2.6, 0.42, 1.16) : 1;
    const st = 0.84 + 0.2 * vn(x * 0.22 + 2.0, y * 0.035);                 // 빗물이 흘러내린 세로 얼룩
    col[k * 3] = c * st; col[k * 3 + 1] = c * st * 0.99; col[k * 3 + 2] = c * st * 0.97;
    // 얼굴에서 얼마나 가까운가(1 = 얼굴 위). 만화 화풍에서 바위의 금과 얼룩을 얼굴에는 긋지 않으려고 적어 둔다
    { const hi = clamp(Math.round((x + 50) / 20), 0, 5), u = (x - HX0(hi)) / HS0, v = (y - HY0) / HS0; face[k] = sstep(1.3, 0.85, Math.hypot(u / 8.4, (v - 0.5) / 15)); }
  }
  const idx = new Uint32Array((nx - 1) * (ny - 1) * 6); let n = 0;
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx + 1, d = a + nx;
    idx[n++] = a; idx[n++] = b; idx[n++] = c; idx[n++] = a; idx[n++] = c; idx[n++] = d;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aFace', new THREE.BufferAttribute(face, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  const t = mat('rock');
  // 만화 화풍: 바위를 한 빛깔로 밀지 않고, 애니 배경 그림처럼 누런 갈색 바탕에 큰 얼룩 두 톤·가로로 누운 층·가늘고 짙은 금을 그려 넣는다(얼굴 위는 비운다)
  const ink = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aFace; varying float vFace;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvFace = aFace;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vFace;').replace('#include <color_fragment>', `#include <color_fragment>
        if (uToon > 0.5) {
          vec2 rp = vWPos.xy;
          float rOpen = 1.0 - vFace;
          vec3 rT = vec3(0.93, 0.86, 0.79);                                                               // 샛노랑을 눌러 누런 갈색으로
          rT *= mix(vec3(1.0), vec3(0.84, 0.76, 0.68), smoothstep(0.49, 0.52, wFbm(rp * vec2(0.017, 0.028))) * (0.35 + 0.65 * rOpen));   // 큰 얼룩
          rT *= mix(1.0, 0.86, smoothstep(0.60, 0.64, wNoise(vec2(rp.x * 0.011 + 3.0, rp.y * 0.21))) * rOpen);                         // 가로로 누운 층
          float rA = abs(wNoise(vec2(rp.x * 0.075, rp.y * 0.02) + 11.0) - 0.5), rB = abs(wNoise(vec2(rp.x * 0.028 + 5.0, rp.y * 0.085)) - 0.5);
          float rCrack = max(1.0 - smoothstep(0.004, 0.011, rA), 1.0 - smoothstep(0.003, 0.008, rB)) * rOpen * step(0.45, wNoise(rp * 0.05 + 7.0));   // 금(군데군데 끊긴다)
          diffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11))), diffuseColor.rgb, 0.55);   // 볕과 색 올림이 겹쳐 주황빛으로 뜨지 않게 색을 한 번 눌러 둔다
          diffuseColor.rgb *= mix(rT, rT * vec3(0.40, 0.33, 0.30), rCrack);
        }`);
  };
  ink.key = 'rock';
  const m = weatherize(new THREE.MeshStandardMaterial({ color: 0xd6b07c, map: t.map, normalMap: t.normalMap, roughness: 0.93, vertexColors: true }), { flat: true, extra: ink });
  const mesh = new THREE.Mesh(g, m);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
  scene.add(mesh);
  // 걸어서 뚫고 들어가지 못하게(아래로 갈수록 앞으로 나온 만큼 계단식으로 막는다)
  const Wc = CLIFF.half + CLIFF.fall, yTop = CLIFF.top - 0.7;
  for (const [xa, xb] of [[-Wc, STAIR.x0 - 8], [STAIR.x1 + 8, Wc]]) {
    addCollider(xa, 0, CLIFF.z - 8, xb, 12 * K, CLIFF.z + 4.6 * K);
    addCollider(xa, 12 * K, CLIFF.z - 8, xb, 30 * K, CLIFF.z + 3.0 * K);
    addCollider(xa, 30 * K, CLIFF.z - 8, xb, yTop, CLIFF.z + 0.6 * K);
  }
  addCollider(STAIR.x0 - 8, 0, CLIFF.z - 8, STAIR.x1 + 8, yTop, CLIFF.z + 0.25);
}

/* ---------- 바위 꼭대기로 오르는 계단(절벽 동쪽에 붙은, 여러 번 꺾이는 나무 계단) ---------- */
const NF = Math.round(CLIFF.top / 12), RISE = CLIFF.top / NF;      // 꺾이는 층 수, 한 층에 오르는 높이
function buildStairs(scene) {
  const B = new Builder(), step = mat('planks', 0x8a6844), post = M.beam;
  const zA0 = CLIFF.z + 0.4, zA1 = CLIFF.z + 2.1, zB0 = zA1, zB1 = CLIFF.z + 3.8, xW = STAIR.x0, xE = STAIR.x1, NS = Math.round(RISE / 0.2);
  const flights = [];                                                  // [z 범위, 오르는 방향, 시작 높이] — 바깥 줄과 절벽 쪽 줄을 번갈아 오른다
  for (let i = 0; i < NF; i++) flights.push(i % 2 ? [zA0, zA1, -1, RISE * i] : [zB0, zB1, 1, RISE * i]);
  for (const [z0, z1, dir, y0] of flights) {
    const top = dir > 0 ? xE : xW, bot = dir > 0 ? xW : xE;
    stairs(B, step, 'x', top, -dir, y0, y0 + RISE, z0, z1, 0.4, 0.12);
    // 계단을 받치는 옆판과 난간
    for (const z of [z0 + 0.06, z1 - 0.06]) beamBetween(B, post, new THREE.Vector3(bot, y0 - 0.2, z), new THREE.Vector3(top, y0 + RISE - 0.2, z), 0.1, 0.3);
    for (const z of [z0 + 0.05, z1 - 0.05]) {
      if (z < CLIFF.z + 0.6) continue;                                   // 절벽 쪽은 바위가 막아 준다
      for (const h of [1.05, 0.55]) beamBetween(B, post, new THREE.Vector3(bot, y0 + h, z), new THREE.Vector3(top, y0 + RISE + h, z), 0.07, 0.07);
      for (let k = 0; k <= NS; k += 3) { const x = bot + (top - bot) * k / NS, y = y0 + RISE * k / NS; B.box(post, x - 0.035, y - 0.1, z - 0.035, x + 0.035, y + 1.05, z + 0.035, false); }
      const NC = Math.round(NS / 3);
      for (let k = 0; k < NC; k++) { const xa = bot + (top - bot) * k / NC, xb = bot + (top - bot) * (k + 1) / NC, y = y0 + RISE * k / NC; addCollider(Math.min(xa, xb), y, z - 0.05, Math.max(xa, xb), y + RISE / NC + 1.1, z + 0.05); }
    }
  }
  // 까치발: 절벽에 박은 가로대와 그 밑의 빗대
  const bracket = (x, y, zOut) => {
    if (y < 2.4) { B.box(post, x - 0.08, 0, zOut - 0.16, x + 0.08, y, zOut, false); return; }
    B.box(post, x - 0.08, y - 0.18, CLIFF.z - 0.3, x + 0.08, y, zOut, false);
    beamBetween(B, post, new THREE.Vector3(x, y - 0.1, zOut - 0.15), new THREE.Vector3(x, y - 0.1 - (zOut - CLIFF.z) * 0.9, CLIFF.z + 0.05), 0.12, 0.14);
  };
  // 층계참(동쪽·서쪽 끝에 번갈아 놓인다)
  const landing = (side, y) => {
    const x0 = side === 'e' ? xE : xW - 3, x1 = x0 + 3;
    B.box(step, x0, y - 0.14, zA0, x1, y, zB1);
    const xo = side === 'e' ? x1 : x0;                                     // 바깥쪽 끝
    railing(B, post, [[xo, zA0 + 0.05], [xo, zB1 - 0.05]], y, 1.05);
    railing(B, post, [[x0, zB1 - 0.05], [x1, zB1 - 0.05]], y, 1.05);
    for (const x of [x0 + 0.2, x1 - 0.2]) bracket(x, y - 0.14, zB1 - 0.1);
  };
  for (let i = 1; i < NF; i++) landing(i % 2 ? 'e' : 'w', RISE * i);
  // 맨 위 층계참은 바위 꼭대기와 이어진다
  const tx0 = NF % 2 ? xE : xW - 3, tx1 = tx0 + 3, yT = CLIFF.top, xo = NF % 2 ? tx1 : tx0, xi = NF % 2 ? tx0 : tx1;
  B.box(step, tx0, yT - 0.14, CLIFF.z - 0.6, tx1, yT, zB1);
  railing(B, post, [[xo, CLIFF.z + 0.3], [xo, zB1 - 0.05], [xi, zB1 - 0.05]], yT, 1.05);
  for (const x of [tx0 + 0.2, tx1 - 0.2]) bracket(x, yT - 0.14, zB1 - 0.1);
  // 계단 밑 까치발
  for (const [z0, z1, dir, y0] of flights) for (let k = 1; k < 8; k++) {
    const x = xW + (xE - xW) * k / 8, y = y0 + RISE * (dir > 0 ? k / 8 : 1 - k / 8);
    bracket(x, y - 0.42, z1 - 0.02);
  }
  // 꼭대기 전망대 난간(계단 입구만 틔운다)
  const zr = CLIFF.z - 0.9, xr = CLIFF.half - 6;
  railing(B, post, [[-xr, zr], [tx0 - 0.2, zr]], yT, 1.1, { gap: 0.3 });
  railing(B, post, [[tx1 + 0.2, zr], [xr, zr]], yT, 1.1, { gap: 0.3 });
  B.finish(scene);
}

export function build(scene, ctx) {
  buildCliff(scene, ctx && ctx.mobile);   // 폰에서는 격자를 성기게
  buildStairs(scene);
  const yTop = [CLIFF.top - 10, CLIFF.top + 30], Wc = CLIFF.half + CLIFF.fall;
  const places = HOKAGE.map((h, i) => ({ n: '호카게 바위 꼭대기', t: '발아래가 ' + h.name + '의 얼굴이다.', b: [HEAD_X(i) - 10 * K, HEAD_X(i) + 10 * K, CLIFF.z - 30, CLIFF.z + 1], y: yTop }));
  places.push({ n: '호카게 바위', t: '역대 호카게 여섯 사람의 얼굴. 왼쪽부터 하시라마, 토비라마, 히루젠, 미나토, 츠나데, 카카시.', b: [-75 * K, 75 * K, CLIFF.z, CLIFF.z + 22], y: [0, 40] });
  places.push({ n: '바위 오르는 계단', t: '절벽에 붙여 지은 나무 계단. 이리저리 꺾어 오르면 호카게 바위 꼭대기다.', b: [STAIR.x0 - 6, STAIR.x1 + 6, CLIFF.z, CLIFF.z + 5], y: [0, CLIFF.top + 10] });
  places.push({ n: '호카게 바위 꼭대기', t: '마을이 한눈에 내려다보인다.', b: [-Wc, Wc, CLIFF.z - 120, CLIFF.z + 1], y: yTop });
  return {
    places,
    jumps: [['호카게 바위 앞', 0, 0, -62, 0, 2], ['바위 꼭대기', 0, CLIFF.top, CLIFF.z - 6, Math.PI, 3], ['바위 오르는 계단', STAIR.x0 - 1, 0, CLIFF.z + 8, 0, 4]],
  };
}
