// 호카게 바위 — 북쪽 절벽에 새긴 역대 호카게 일곱 얼굴(왼쪽부터 초대 하시라마 … 7대 나루토)과, 바위 꼭대기로 오르는 나무 계단.
// 얼굴은 "앞으로 얼마나 튀어나왔나"를 (x, y)마다 계산해 절벽 면을 밀어내 빚는다: 이마·광대·코·입술·머리카락을 둥근 덩이로 쌓고, 눈매·입·수염 자국은 홈으로 판다.
import * as THREE from '../vendor/three.module.js';
import { Builder, addCollider, stairs } from './build.js';
import { mat, M, weatherize } from './materials.js';
import { beamBetween, railing } from './arch.js';
import { CLIFF } from './layout.js';
import { mountainH } from './village.js';

const NEG = -40;
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

/* ---------- 일곱 호카게: 얼굴 생김새의 차이 ----------
   spikes: [밑동 u, 밑동 v, 방향(도, 0=위·+는 보는 쪽 오른쪽), 길이, 굵기], locks: 긴 머리 가닥 [ax,ay,az,ra,bx,by,bz,rb] */
const fan = (n, a0, a1, len, r, lean = 0, rnd = 0) => {
  const out = [], hs = i => { const j = Math.sin(i * 12.9898 + rnd) * 43758.5453; return j - Math.floor(j); };
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1), ang = a0 + (a1 - a0) * t + (hs(i + 40) - 0.5) * 14, ar = ang * Math.PI / 180;
    out.push([Math.sin(ar) * 5.3, 6.6 + Math.cos(ar) * 2.9, ang * 0.92 + lean, len * (0.72 + 0.6 * hs(i)), r * (0.85 + 0.35 * hs(i + 9))]);
    // 사이사이 짧은 안쪽 가닥
    if (i < n - 1) { const a2 = (a0 + (a1 - a0) * (i + 0.5) / (n - 1)) * Math.PI / 180; out.push([Math.sin(a2) * 3.6, 6.9 + Math.cos(a2) * 2.2, a2 * 180 / Math.PI * 0.7 + lean, len * 0.55, r * 0.9]); }
  }
  return out;
};
const HOKAGE = [
  { name: '초대 호카게 · 센주 하시라마', band: true, w: 1.0, jaw: 1.0,
    scalp: true,
    locks: [[-1.0, 10.2, 3.2, 2.5, -6.3, 4.0, 2.6, 2.3], [-6.3, 4.0, 2.6, 2.3, -7.0, -4.5, 1.4, 2.0], [-7.0, -4.5, 1.4, 2.0, -6.6, -11.5, 0.4, 1.4],
      [1.0, 10.2, 3.2, 2.5, 6.3, 4.0, 2.6, 2.3], [6.3, 4.0, 2.6, 2.3, 7.0, -4.5, 1.4, 2.0], [7.0, -4.5, 1.4, 2.0, 6.6, -11.5, 0.4, 1.4],
      [-0.9, 6.6, 5.6, 1.2, -5.0, 1.2, 4.2, 1.0], [-5.0, 1.2, 4.2, 1.0, -5.5, -5.2, 3.0, 0.6], [0.9, 6.6, 5.6, 1.2, 5.0, 1.2, 4.2, 1.0], [5.0, 1.2, 4.2, 1.0, 5.5, -5.2, 3.0, 0.6]],
    lines: [], mouth: 0 },
  { name: '2대 호카게 · 센주 토비라마', band: true, w: 0.97, jaw: 0.94,
    spikes: fan(7, -88, 88, 4.4, 1.9, 0, 2), brow: -0.35,
    guard: true,
    lines: [[[-3.1, -0.7], [-3.5, -3.4]], [[3.1, -0.7], [3.5, -3.4]], [[0, -6.3], [0, -8.7]]], mouth: -0.12 },
  { name: '3대 호카게 · 사루토비 히루젠', band: true, w: 1.02, jaw: 1.02,
    spikes: fan(6, -80, 80, 4.0, 2.0, 0, 5), brow: 0.1,
    goatee: true,
    lines: [[[-3.7, 0.1], [-4.4, -2.3]], [[3.7, 0.1], [4.4, -2.3]], [[-1.5, -2.3], [-2.7, -4.8]], [[1.5, -2.3], [2.7, -4.8]], [[-4.3, 1.4], [-5.0, 0.9]], [[4.3, 1.4], [5.0, 0.9]]], mouth: 0 },
  { name: '4대 호카게 · 나미카제 미나토', band: true, w: 0.98, jaw: 0.95,
    spikes: fan(8, -98, 98, 5.2, 1.9, 0, 9),
    locks: [[-5.1, 6.0, 4.6, 1.5, -6.5, 0.2, 3.6, 1.2], [-6.5, 0.2, 3.6, 1.2, -5.6, -6.4, 2.6, 0.35], [5.1, 6.0, 4.6, 1.5, 6.5, 0.2, 3.6, 1.2], [6.5, 0.2, 3.6, 1.2, 5.6, -6.4, 2.6, 0.35]],
    lines: [], mouth: 0.1 },
  { name: '5대 호카게 · 츠나데', band: false, w: 0.95, jaw: 0.9, lashes: true, diamond: true,
    scalp: true,
    locks: [[-0.5, 10.0, 4.4, 2.2, -4.7, 5.0, 5.0, 2.0], [-4.7, 5.0, 5.0, 2.0, -6.3, -2.6, 3.4, 1.5], [-6.3, -2.6, 3.4, 1.5, -5.6, -8.6, 2.2, 0.4],
      [0.5, 10.0, 4.4, 2.2, 4.7, 5.0, 5.0, 2.0], [4.7, 5.0, 5.0, 2.0, 6.3, -2.6, 3.4, 1.5], [6.3, -2.6, 3.4, 1.5, 5.6, -8.6, 2.2, 0.4]],
    lines: [], mouth: 0.05 },
  { name: '6대 호카게 · 하타케 카카시', band: true, w: 0.97, jaw: 0.96, mask: true, sleepy: true,
    spikes: fan(7, -66, 88, 6.2, 2.0, 20, 13),
    lines: [], mouth: 0 },
  { name: '7대 호카게 · 우즈마키 나루토', band: true, w: 1.0, jaw: 1.0,
    spikes: fan(9, -100, 100, 2.8, 1.7, 0, 17),
    lines: [[[-2.5, -1.5], [-5.2, -1.0]], [[-2.5, -2.5], [-5.2, -2.5]], [[-2.5, -3.5], [-5.0, -4.0]], [[2.5, -1.5], [5.2, -1.0]], [[2.5, -2.5], [5.2, -2.5]], [[2.5, -3.5], [5.0, -4.0]]], mouth: 0.22 },
];
export const HEAD_X = i => -60 + 20 * i, HEAD_Y = 38, HEAD_S = 1.3;

// 머리뼈(이마 보호대·머리카락이 얹히는 바탕)
const skull = (u, v) => ell(u, v, 0, 1.5, 6.3, 8.6, -2.0, 7.4);

// 얼굴 하나의 돌출(m). u, v는 얼굴 중심에서의 거리.
function headDepth(H, u, v) {
  u /= H.w;
  const au = Math.abs(u), sg = u < 0 ? -1 : 1, jw = H.jaw;
  let z = skull(u, v);
  z = smax(z, ell(u, v, 0, -4.9, 4.3 * jw, 4.7, -1.5, 5.9), 1.1);            // 턱
  z = smax(z, ell(u, v, 0, -7.5, 2.4 * jw, 2.0, 2.3, 1.25), 0.9);            // 턱끝
  z = smax(z, ell(u, v, 0, -12.5, 3.2, 5.0, -2.5, 4.4), 1.0);                // 목
  z = smax(z, ell(au, v, 6.2, 0.4, 0.9, 2.0, 0.2, 1.5), 0.4);                // 귀
  z = smax(z, ell(au, v, 3.1, -2.0, 2.6, 2.8, 3.1, 1.5), 1.0);               // 광대
  z = smax(z, ell(au, v, 2.6, 2.5, 2.8, 0.9, 4.3, 1.1), 0.5);                // 눈썹뼈
  // 눈두덩: 살짝 꺼진 자리에 눈꺼풀과 눈동자를 새긴다
  { const a = (au - 2.7) / 2.2, b = (v - 0.95) / 1.3, q = 1 - a * a - b * b; if (q > 0) z -= 0.7 * q; }
  z = smax(z, ell(au, v, 2.75, 0.95, 1.7, 0.85, 3.95, 0.7), 0.25);            // 눈알
  if (!H.mask) {
    z = smax(z, cap(u, v, [0, 2.2, 4.5, 0.5, 0, -1.4, 5.5, 0.72]), 0.5);     // 콧등
    z = smax(z, ell(u, v, 0, -1.75, 0.95, 0.8, 5.0, 1.45), 0.35);            // 코끝
    z = smax(z, ell(au, v, 0.7, -2.0, 0.5, 0.42, 4.9, 0.8), 0.25);           // 콧방울
    z = smax(z, ell(u, v, 0, -5.0, 1.15, 0.4, 4.3, 0.42), 0.35);             // 아랫입술
    const mc = H.mouth;                                                      // 입매(끝이 올라가면 웃는 얼굴)
    z -= 0.42 * poly(au, v, [[0, -4.45], [1.0, -4.43 + mc * 0.3], [1.75, -4.36 + mc]], 0.2);
  } else {
    // 복면: 콧등 아래를 천이 덮어 코·입의 윤곽만 은은하게 비친다
    z = smax(z, cap(u, v, [0, 1.8, 4.5, 0.6, 0, -1.5, 5.3, 0.85]), 0.9);
    z = smax(z, ell(u, v, 0, -1.8, 1.0, 0.9, 4.9, 1.1), 0.8);
    const edge = 0.1 - 0.035 * u * u;
    z += 0.3 * sstep(edge + 0.12, edge - 0.12, v) * sstep(-11.5, -9.5, v);
    z -= 0.12 * poly(au, v, [[0.4, -3.2], [3.2, -5.0], [4.6, -7.4]], 0.3);     // 천이 당겨진 주름
  }
  // 눈매: 위·아래 눈꺼풀 선, 눈동자 테, 눈썹
  const lt = H.sleepy ? 1.3 : 1.82, bt = H.brow || 0;
  z -= (H.lashes ? 0.45 : 0.34) * poly(au, v, [[1.05, 0.72], [1.8, lt - 0.28], [2.8, lt], [3.8, lt - 0.3], [4.4, 0.98]], H.lashes ? 0.26 : 0.19);
  z -= 0.24 * poly(au, v, [[1.05, 0.72], [2.0, 0.22], [2.9, 0.12], [3.8, 0.4], [4.4, 0.98]], 0.15);
  z -= 0.22 * ring(au, v, 2.78, 0.95, 0.62, 0.13);
  z -= 0.28 * sstep(0.26, 0.04, Math.hypot(au - 2.78, v - 0.95));
  z += 0.26 * poly(au, v, [[0.9, 2.85 + bt], [2.5, 3.2 + bt * 0.2], [4.4, 2.75 - bt * 0.6]], 0.36);      // 눈썹(도드라짐)
  for (const l of H.lines) z -= 0.3 * groove(u, v, l[0][0], l[0][1], l[1][0], l[1][1], 0.2);
  if (H.goatee) z = smax(z, cap(u, v, [0, -8.9, 3.2, 0.95, 0, -11.9, 2.4, 0.15], 3), 0.3);
  if (H.diamond) z -= 0.25 * poly(u, v, [[0, 6.0], [0.42, 5.3], [0, 4.6], [-0.42, 5.3], [0, 6.0]], 0.13);
  // 이마 보호대: 머리를 두른 띠와 쇠판
  if (H.band) {
    const bend = 0.014 * u * u, v0 = 3.75 - bend, v1 = 5.65 - bend, s = skull(u, v);
    const inb = sstep(v0 - 0.1, v0 + 0.08, v) * sstep(v1 + 0.1, v1 - 0.08, v);
    if (inb > 0 && s > -1.9) {
      let b = s + 0.42;
      const plate = sstep(3.1, 2.9, au);
      b += 0.22 * plate;
      if (plate > 0) {
        b -= 0.16 * poly((u - 0.1) / 0.78, (v - (v0 + v1) / 2) / 0.78, LEAF, 0.16);
        b -= 0.12 * sstep(0.16, 0.06, Math.hypot(au - 2.55, v - (v0 + v1) / 2 - 0.0));   // 못 자리
      }
      z = z + (Math.max(z, b) - z) * inb;
    }
    if (H.guard) {   // 2대의 보호대는 광대와 턱 옆까지 내려온다
      z = smax(z, cap(u, v, [sg * 5.5, 4.2, 3.0, 1.15, sg * 5.3, -2.5, 3.2, 1.0]), 0.2);
      z = smax(z, cap(u, v, [sg * 5.3, -2.5, 3.2, 1.0, sg * 3.6, -6.6, 3.6, 0.7]), 0.2);
    }
  }
  // 머리카락
  let hair = NEG;
  if (H.scalp) hair = ell(u, v, 0, 6.6, 6.8, 4.6, 0, 6.3) + 0.1 * Math.cos(u * 3.3) * sstep(5.0, 7.0, v);
  if (H.spikes) {
    const mass = (a, b) => ell(a, b, 0, 6.4, 6.6, 4.4, 0, 5.9);
    hair = mass(u, v);
    for (const sp of H.spikes) {
      const a = sp[2] * Math.PI / 180, bz = Math.max(2.2, mass(sp[0] * 0.8, 6.4 + (sp[1] - 6.4) * 0.8)) - 0.2;
      hair = smax(hair, cap(u, v, [sp[0] * 0.8, 6.4 + (sp[1] - 6.4) * 0.8, bz, sp[4], sp[0] + Math.sin(a) * sp[3], sp[1] + Math.cos(a) * sp[3], bz - 0.9, 0.2], 2), 0.3);
    }
  }
  if (H.locks) for (const c of H.locks) hair = smax(hair, cap(u, v, c, 4), 0.3);
  if (H.scalp || H.spikes || H.locks) {
    const top = H.band ? sstep(5.4 - 0.014 * u * u, 5.8 - 0.014 * u * u, v) : 1;      // 보호대 위에서만 머리숱이 덮는다(가닥은 얼굴 옆으로 내려와도 된다)
    const cover = Math.max(top, H.locks && au > 3.6 ? 1 : 0, H.diamond ? sstep(6.3, 6.9, v + 0.06 * u * u) + (au > 3.2 ? 1 : 0) : 0);
    if (cover > 0) z = z + (smax(z, hair, 0.3) - z) * Math.min(1, cover);
  }
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
  let d = 0.055 * (CLIFF.top - y) + 1.5 * gully * gully + 0.8 * ledge + 0.7 * vn(x * 0.11, y * 0.11);
  d *= 1 - sstep(74, 80, x) * sstep(124, 118, x);                  // 계단이 붙는 자리는 반반하게 깎는다
  return d;
}
function cliffDepth(x, y) {
  let d = rockDepth(x, y);
  const i = Math.round((x + 60) / 20);
  if (i >= 0 && i <= 6) {
    const u = (x - HEAD_X(i)) / HEAD_S, v = (y - HEAD_Y) / HEAD_S;
    if (Math.abs(u) < 9.6 && v > -17 && v < 16.5) {
      const h = headDepth(HOKAGE[i], u, v);
      const near = sstep(1.25, 0.8, Math.hypot(u / 8.2, (v - 0.5) / 14.5));         // 얼굴 둘레는 바위를 얕게 쳐냈다
      d *= 1 - 0.5 * near;
      d = smax(d, h * HEAD_S + 1.6, 1.2);
    }
  }
  return d;
}

function buildCliff(scene) {
  // 얼굴이 있는 가운데는 촘촘하게, 바깥은 성기게 나눈 격자
  const xs = [], ys = [], FINE = 0.2, X1 = 73, Y0 = 17, Y1 = 58.4, W = CLIFF.half + CLIFF.fall + 6;
  for (let x = -W; x < -X1; x += 2) xs.push(x);
  for (let x = -X1; x < X1; x += FINE) xs.push(x);
  for (let x = X1; x <= W + 0.01; x += 2) xs.push(x);
  for (let y = -1; y < Y0; y += 1.5) ys.push(y);
  for (let y = Y0; y < Y1; y += FINE) ys.push(y);
  for (let y = Y1; y < CLIFF.top; y += 1.5) ys.push(y);
  ys.push(CLIFF.top);
  const nx = xs.length, ny = ys.length, D = new Float32Array(nx * ny), Yv = new Float32Array(nx * ny);
  for (let i = 0; i < nx; i++) {
    const top = mountainH(xs[i], CLIFF.z - 1);
    for (let j = 0; j < ny; j++) {
      const y = Math.min(ys[j], top);
      Yv[j * nx + i] = y;
      D[j * nx + i] = cliffDepth(xs[i], y) * sstep(top, top - 2.5, y) * sstep(0, 6, top);
    }
  }
  const pos = new Float32Array(nx * ny * 3), nor = new Float32Array(nx * ny * 3), uv = new Float32Array(nx * ny * 2), col = new Float32Array(nx * ny * 3);
  const at = (i, j) => D[clamp(j, 0, ny - 1) * nx + clamp(i, 0, nx - 1)];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, x = xs[i], y = Yv[k], d = D[k];
    pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = CLIFF.z + d;
    const i0 = Math.max(0, i - 1), i1 = Math.min(nx - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(ny - 1, j + 1);
    const dx = (at(i1, j) - at(i0, j)) / Math.max(1e-3, xs[i1] - xs[i0]), dy = (at(i, j1) - at(i, j0)) / Math.max(1e-3, Yv[j1 * nx + i] - Yv[j0 * nx + i]);
    const l = 1 / Math.hypot(dx, dy, 1);
    nor[k * 3] = -dx * l; nor[k * 3 + 1] = -dy * l; nor[k * 3 + 2] = l;
    uv[k * 2] = x + d * 0.8; uv[k * 2 + 1] = y + d * 0.6;                 // 튀어나온 옆면에서 무늬가 길게 늘어지지 않게
    // 팬 곳은 어둡게, 도드라진 곳은 밝게(흐린 날에도 얼굴 윤곽이 읽힌다)
    const s = 3, avg = (at(i - s, j) + at(i + s, j) + at(i, j - s) + at(i, j + s)) / 4;
    const span = Math.max(xs[Math.min(nx - 1, i + s)] - xs[Math.max(0, i - s)], 0.5);
    const spanY = Yv[Math.min(ny - 1, j + s) * nx + i] - Yv[Math.max(0, j - s) * nx + i];
    const c = span < 1.5 && spanY < 1.5 ? clamp(1 + (d - avg) * 1.9, 0.55, 1.14) : 1;
    const st = 0.84 + 0.2 * vn(x * 0.22 + 2.0, y * 0.035);                 // 빗물이 흘러내린 세로 얼룩
    col[k * 3] = c * st; col[k * 3 + 1] = c * st * 0.99; col[k * 3 + 2] = c * st * 0.97;
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
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  const t = mat('rock');
  const m = weatherize(new THREE.MeshStandardMaterial({ color: 0xd2b488, map: t.map, normalMap: t.normalMap, roughness: 0.93, vertexColors: true }));
  const mesh = new THREE.Mesh(g, m);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
  scene.add(mesh);
  // 걸어서 뚫고 들어가지 못하게(아래로 갈수록 앞으로 나온 만큼 계단식으로 막는다)
  const Wc = CLIFF.half + CLIFF.fall;
  for (const [xa, xb] of [[-Wc, 78], [122, Wc]]) {
    addCollider(xa, 0, CLIFF.z - 8, xb, 12, CLIFF.z + 3.4);
    addCollider(xa, 12, CLIFF.z - 8, xb, 30, CLIFF.z + 2.2);
    addCollider(xa, 30, CLIFF.z - 8, xb, 59.6, CLIFF.z + 0.6);
  }
  addCollider(78, 0, CLIFF.z - 8, 122, 59.6, CLIFF.z + 0.25);
}

/* ---------- 바위 꼭대기로 오르는 계단(절벽 동쪽에 붙은 네 번 꺾이는 나무 계단) ---------- */
function buildStairs(scene) {
  const B = new Builder(), step = mat('planks', 0x8a6844), post = M.beam;
  const zA0 = CLIFF.z + 0.4, zA1 = CLIFF.z + 2.1, zB0 = zA1, zB1 = CLIFF.z + 3.8, xW = 85, xE = 115, RISE = 15;
  const flights = [[zB0, zB1, 1, 0], [zA0, zA1, -1, RISE], [zB0, zB1, 1, RISE * 2], [zA0, zA1, -1, RISE * 3]];   // [z 범위, 오르는 방향, 시작 높이]
  for (const [z0, z1, dir, y0] of flights) {
    const top = dir > 0 ? xE : xW, bot = dir > 0 ? xW : xE;
    stairs(B, step, 'x', top, -dir, y0, y0 + RISE, z0, z1, 0.4, 0.12);
    // 계단을 받치는 옆판과 난간
    for (const z of [z0 + 0.06, z1 - 0.06]) beamBetween(B, post, new THREE.Vector3(bot, y0 - 0.2, z), new THREE.Vector3(top, y0 + RISE - 0.2, z), 0.1, 0.3);
    for (const z of [z0 + 0.05, z1 - 0.05]) {
      if (z < CLIFF.z + 0.6) continue;                                   // 절벽 쪽은 바위가 막아 준다
      for (const h of [1.05, 0.55]) beamBetween(B, post, new THREE.Vector3(bot, y0 + h, z), new THREE.Vector3(top, y0 + RISE + h, z), 0.07, 0.07);
      for (let k = 0; k <= 75; k += 3) { const x = bot + (top - bot) * k / 75, y = y0 + RISE * k / 75; B.box(post, x - 0.035, y - 0.1, z - 0.035, x + 0.035, y + 1.05, z + 0.035, false); }
      for (let k = 0; k < 25; k++) { const xa = bot + (top - bot) * k / 25, xb = bot + (top - bot) * (k + 1) / 25, y = y0 + RISE * k / 25; addCollider(Math.min(xa, xb), y, z - 0.05, Math.max(xa, xb), y + RISE / 25 + 1.1, z + 0.05); }
    }
  }
  // 까치발: 절벽에 박은 가로대와 그 밑의 빗대
  const bracket = (x, y, zOut) => {
    if (y < 2.4) { B.box(post, x - 0.08, 0, zOut - 0.16, x + 0.08, y, zOut, false); return; }
    B.box(post, x - 0.08, y - 0.18, CLIFF.z - 0.3, x + 0.08, y, zOut, false);
    beamBetween(B, post, new THREE.Vector3(x, y - 0.1, zOut - 0.15), new THREE.Vector3(x, y - 0.1 - (zOut - CLIFF.z) * 0.9, CLIFF.z + 0.05), 0.12, 0.14);
  };
  // 층계참
  const landing = (x0, x1, y, open) => {
    B.box(step, x0, y - 0.14, zA0, x1, y, zB1);
    const xo = open === 'e' ? x1 : x0;                                     // 바깥쪽 끝
    railing(B, post, [[xo, zA0 + 0.05], [xo, zB1 - 0.05]], y, 1.05);
    railing(B, post, [[x0, zB1 - 0.05], [x1, zB1 - 0.05]], y, 1.05);
    for (const x of [x0 + 0.2, x1 - 0.2]) bracket(x, y - 0.14, zB1 - 0.1);
  };
  landing(xE, xE + 3, RISE, 'e'); landing(xW - 3, xW, RISE * 2, 'w'); landing(xE, xE + 3, RISE * 3, 'e');
  // 맨 위 층계참은 바위 꼭대기와 이어진다
  B.box(step, xW - 3, RISE * 4 - 0.14, CLIFF.z - 0.6, xW, RISE * 4, zB1);
  railing(B, post, [[xW - 3, CLIFF.z + 0.3], [xW - 3, zB1 - 0.05], [xW, zB1 - 0.05]], RISE * 4, 1.05);
  for (const x of [xW - 2.8, xW - 0.2]) bracket(x, RISE * 4 - 0.14, zB1 - 0.1);
  // 계단 밑 까치발
  for (const [z0, z1, dir, y0] of flights) for (let k = 1; k < 8; k++) {
    const x = xW + (xE - xW) * k / 8, y = y0 + RISE * (dir > 0 ? k / 8 : 1 - k / 8);
    bracket(x, y - 0.42, z1 - 0.02);
  }
  // 꼭대기 전망대 난간(계단 입구만 틔운다)
  const yT = CLIFF.top, zr = CLIFF.z - 0.9;
  railing(B, post, [[-124, zr], [xW - 3.2, zr]], yT, 1.1, { gap: 0.3 });
  railing(B, post, [[xW + 0.2, zr], [124, zr]], yT, 1.1, { gap: 0.3 });
  B.finish(scene);
}

export function build(scene) {
  buildCliff(scene);
  buildStairs(scene);
  const places = HOKAGE.map((h, i) => ({ n: '호카게 바위 꼭대기', t: '발아래가 ' + h.name + '의 얼굴이다.', b: [HEAD_X(i) - 10, HEAD_X(i) + 10, CLIFF.z - 30, CLIFF.z + 1], y: [50, 90] }));
  places.push({ n: '호카게 바위', t: '역대 호카게 일곱 사람의 얼굴. 왼쪽부터 하시라마, 토비라마, 히루젠, 미나토, 츠나데, 카카시, 나루토.', b: [-75, 75, CLIFF.z, CLIFF.z + 14], y: [0, 40] });
  places.push({ n: '바위 오르는 계단', t: '절벽에 붙여 지은 나무 계단. 네 번 꺾어 오르면 호카게 바위 꼭대기다.', b: [80, 120, CLIFF.z, CLIFF.z + 5], y: [0, 70] });
  places.push({ n: '호카게 바위 꼭대기', t: '마을이 한눈에 내려다보인다.', b: [-190, 190, CLIFF.z - 120, CLIFF.z + 1], y: [50, 90] });
  return {
    places,
    jumps: [['호카게 바위 앞', 0, 0, -62, 0, 2], ['바위 꼭대기', 0, CLIFF.top, CLIFF.z - 6, Math.PI, 3], ['바위 오르는 계단', 84, 0, CLIFF.z + 8, 0, 4]],
  };
}
