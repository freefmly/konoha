// 사쿠라의 집(하루노 집안의 2층 살림집), 이노의 집(야마나카 꽃집), 쵸지의 집(아키미치 집안의 살림집) — 가구와 꾸밈 도구를 함께 쓴다.
import * as THREE from '../vendor/three.module.js';
import { Builder, wall, stairs, tube, mergeGeos, mat4, rng, addCollider } from './build.js';
import { mat, M, textMat } from './materials.js';
import { gableRoof, tilePanel, beamBetween, windowUnit, doorUnit, railing, noren, signBoard } from './arch.js';

const PI = Math.PI;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const lathe = (prof, seg = 12) => new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p[0], p[1])), seg);
const cyl = (rt, rb, h, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg);
let P, G, F;   // 재질표, 함께 쓰는 도형, 꽃 — build()에서 채운다

/* ---------- 재질 ---------- */
function palette() {
  const C = (c, o) => mat('plain', c, o), D = c => mat('plain', c, { side: 'double' });
  return {
    cream: mat('plaster', 0xf3e3c8), roofS: mat('tile', 0x9a4b3b), roofI: mat('tile', 0x3d6f6a),
    pink: C(0xf0a2b6), red: C(0xb5303a), white: C(0xf3efe6), purple: C(0x8466b5), blue: C(0x3c5a8c), green: C(0x5d8a57),
    black: C(0x26242a), paper: C(0xe9dfc4), kraft: C(0xb89468), terra: C(0xb9603c), soil: C(0x3a2a20),
    zinc: C(0xa9b1b5, { rough: 0.45, metal: 0.3 }), steel: C(0xc9cdd0, { rough: 0.35, metal: 0.3 }), mirror: C(0xcfe0e8, { rough: 0.06 }),
    water: C(0x2d4a52, { rough: 0.1 }), porcelain: C(0xe8eef0, { rough: 0.3 }), brass: C(0xc9a04a, { rough: 0.4, metal: 0.4 }),
    glow: mat('glow', 0xffe2b0, { power: 1.1 }), pinkC: mat('cloth', 0xf3b3c4), purpleC: mat('cloth', 0x9a7cc8),
    books: [C(0x7a2e2e), C(0x2f4f6f), C(0x3f6b4a), C(0x8a6a3a), C(0x5a3d6e)],
    // 꽃과 잎(양면)
    fG: D(0x4f8f3e), fGd: D(0x2f6b35), fY: D(0xf2c21e), fW: D(0xf7f3ea), fR: D(0xc8283a), fP: D(0xf08fb0), fM: D(0xb8479a), fO: D(0xe8842a), fBr: D(0x4a3020),
  };
}

/* ---------- 꽃 ----------
   꽃잎·잎 한 장: +x로 뻗는다. rise = 처음 들린 각, curl = 끝까지 가며 더 휘는 각(음수면 뒤로 젖혀진다), cup = 가운데 골 깊이,
   base = 가장 넓은 자리(1보다 크면 끝 쪽), blunt = 끝이 뭉툭한 정도 */
function blade(len, wid, o = {}) {
  const { n = 3, rise = 0, curl = 0, cup = 0.2, base = 1, blunt = 0 } = o;
  const pos = [], uv = [], idx = [];
  let x = 0, y = 0;
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = rise + curl * t;
    if (i) { const am = rise + curl * (t - 0.5 / n); x += Math.cos(am) * len / n; y += Math.sin(am) * len / n; }
    const h = wid / 2 * Math.sin(PI * (0.05 + (0.95 - 0.4 * blunt) * Math.pow(t, base)));
    const lx = -Math.sin(a) * cup * h, ly = Math.cos(a) * cup * h;
    pos.push(x + lx, y + ly, -h, x, y, 0, x + lx, y + ly, h);
    uv.push(t, 0, t, 0.5, t, 1);
    if (i) { const q = i * 3, p = q - 3; idx.push(p, p + 1, q + 1, p, q + 1, q, p + 1, p + 2, q + 2, p + 1, q + 2, q + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// 한 장을 둥글게 n장 돌려 놓기, 그리고 묶음 전체를 행렬 m 아래로 옮기기
const ring = (g, n, r, y = 0, ph = 0) => Array.from({ length: n }, (_, i) => { const a = ph + i / n * PI * 2; return [g, mat4(Math.cos(a) * r, y, -Math.sin(a) * r, 0, a, 0)]; });
const under = (m, list) => list.map(e => (Array.isArray(e) ? [e[0], m.clone().multiply(e[1])] : [e, m]));

function makeFlowers() {
  const f = {};
  { // 해바라기: 두 겹 혀꽃, 씨앗 원반, 꽃받침, 큰 잎 석 장
    const top = V3(0, 0.78, 0.05), hm = mat4(top.x, top.y, top.z, 1.05, 0, 0);
    const stem = tube([V3(0, 0, 0), V3(0.012, 0.3, 0), V3(-0.004, 0.6, 0.008), V3(0, 0.74, 0.025), top], 0.011, 5, false);
    const pet = blade(0.095, 0.036, { n: 2, rise: 0.1, curl: -0.35, cup: 0.25 }), pet2 = blade(0.08, 0.032, { n: 2, rise: 0.22, curl: -0.3 });
    const disc = lathe([[0, 0.016], [0.028, 0.014], [0.046, 0.006], [0.05, -0.004], [0.04, -0.016], [0, -0.022]], 10);
    const sep = blade(0.05, 0.022, { n: 1, rise: -0.25 }), leaf = blade(0.17, 0.13, { n: 3, rise: 0.55, curl: -1.0, base: 0.7, cup: 0.12 });
    f.sun = [
      [P.fY, mergeGeos(under(hm, [...ring(pet, 13, 0.044), ...ring(pet2, 12, 0.04, 0.004, 0.26)]))],
      [P.fBr, mergeGeos(under(hm, [disc]))],
      [P.fG, mergeGeos([stem, ...under(hm, ring(sep, 9, 0.036, -0.014, 0.1))])],
      [P.fGd, mergeGeos([[leaf, mat4(0.01, 0.24, 0, 0, 0.6, 0)], [leaf, mat4(-0.008, 0.4, 0, 0, 2.9, 0)], [leaf, mat4(0, 0.54, 0.008, 0, 4.9, 0)]])],
    ];
  }
  const rose = pm => { // 장미: 안에서 밖으로 네 겹 꽃잎, 꽃받침, 세 쪽 겹잎, 가시
    const hm = mat4(0, 0.52, 0, 0.25, 0, 0), o = { base: 1.2, blunt: 0.8 };
    const stem = tube([V3(0, 0, 0), V3(0.008, 0.2, 0.004), V3(-0.004, 0.38, 0), V3(0, 0.52, 0)], 0.006, 5, false);
    const p0 = blade(0.03, 0.03, { n: 2, rise: 1.45, curl: 0.3, cup: 0.6, ...o }), p1 = blade(0.04, 0.044, { n: 2, rise: 1.15, curl: -0.1, cup: 0.5, ...o });
    const p2 = blade(0.046, 0.052, { n: 3, rise: 0.85, curl: -0.6, cup: 0.4, ...o }), p3 = blade(0.05, 0.054, { n: 3, rise: 0.5, curl: -0.8, cup: 0.3, ...o });
    const sep = blade(0.03, 0.011, { n: 1, rise: -0.7 }), hip = lathe([[0, -0.02], [0.011, -0.014], [0.014, 0]], 6);
    const lf = blade(0.055, 0.034, { n: 2, rise: 0.15, curl: -0.4, base: 0.8 }), pt = tube([V3(0, 0, 0), V3(0.05, 0, 0)], 0.003, 3, false);
    const spray = (y, ry) => under(mat4(0, y, 0, 0, ry, 0.5), [[lf, mat4(0.05, 0, 0)], [lf, mat4(0.03, 0, 0.004, 0, 0.9, 0)], [lf, mat4(0.03, 0, -0.004, 0, -0.9, 0)], pt]);
    const thorn = new THREE.ConeGeometry(0.004, 0.014, 3);
    return [
      [pm, mergeGeos(under(hm, [...ring(p0, 3, 0.004, 0.01), ...ring(p1, 5, 0.01, 0.005, 0.4), ...ring(p2, 5, 0.014, 0, 1.0), ...ring(p3, 5, 0.016, -0.004, 0.3)]))],
      [P.fGd, mergeGeos([stem, ...under(hm, [...ring(sep, 5, 0.008, -0.004, 0.2), hip]), ...spray(0.2, 0.5), ...spray(0.33, 3.4),
        [thorn, mat4(0.01, 0.12, 0, 0, 0, -1.3)], [thorn, mat4(-0.006, 0.27, 0.004, 0, 0, 1.3)], [thorn, mat4(0.004, 0.42, -0.006, 1.3, 0, 0)]])],
    ];
  };
  { // 백합: 뒤로 젖혀진 꽃덮이 여섯 장, 수술 여섯에 꽃밥, 암술, 어긋난 줄잎, 봉오리
    const hm = mat4(0, 0.7, 0.02, 0.75, 0, 0);
    const stem = tube([V3(0, 0, 0), V3(0.006, 0.25, 0), V3(-0.004, 0.5, 0.004), V3(0, 0.7, 0.02)], 0.007, 5, false);
    const tep = blade(0.13, 0.048, { n: 4, rise: 1.05, curl: -2.0, base: 0.85, cup: 0.3 });
    const fil = tube([V3(0, 0, 0), V3(0.014, 0.05, 0), V3(0.034, 0.088, 0)], 0.0018, 3, false), anth = new THREE.BoxGeometry(0.014, 0.005, 0.005);
    const pist = tube([V3(0, 0, 0), V3(0, 0.1, 0)], 0.0028, 4, true), lf = blade(0.13, 0.024, { n: 2, rise: 0.75, curl: -1.0, cup: 0.3 });
    const bud = lathe([[0, 0], [0.012, 0.015], [0.016, 0.05], [0.008, 0.085], [0, 0.095]], 6), bst = tube([V3(0, 0.55, 0), V3(0.02, 0.6, -0.012), V3(0.03, 0.63, -0.02)], 0.004, 4, false);
    const leaves = []; for (let i = 0; i < 9; i++) leaves.push([lf, mat4(0, 0.1 + i * 0.055, 0, 0, i * 2.4, 0)]);
    f.lily = [
      [P.fW, mergeGeos([...under(hm, ring(tep, 6, 0.006)), [bud, mat4(0.03, 0.62, -0.02, -0.3, 0, -0.5)]])],
      [P.fO, mergeGeos(under(hm, ring(anth, 6, 0.036, 0.09, 0.26)))],
      [P.fG, mergeGeos([stem, bst, ...leaves, ...under(hm, [...ring(fil, 6, 0.003, 0, 0.26), pist])])],
    ];
  }
  const cosmos = pm => { // 코스모스: 끝이 넓은 꽃잎 여덟 장, 노란 꽃술, 실 같은 잎, 곁가지에 한 송이 더
    const top = V3(0.01, 0.6, 0), hm = mat4(top.x, top.y, top.z, 0.5, 0, 0), hm2 = mat4(-0.06, 0.5, 0.03, 0.3, 2, 0.3);
    const stem = tube([V3(0, 0, 0), V3(-0.01, 0.22, 0.006), V3(0.012, 0.42, -0.004), top], 0.004, 4, false);
    const br = tube([V3(-0.004, 0.3, 0.002), V3(-0.05, 0.4, 0.02), V3(-0.06, 0.5, 0.03)], 0.003, 3, false);
    const pet = blade(0.044, 0.03, { n: 2, rise: 0.12, curl: -0.2, base: 1.9, blunt: 0.8, cup: 0.12 }), eye = lathe([[0, 0.008], [0.007, 0.006], [0.01, 0]], 6);
    const lf = blade(0.075, 0.005, { n: 1, rise: 0.5 }), leaves = [];
    for (let i = 0; i < 8; i++) leaves.push([lf, mat4(0, 0.1 + (i >> 1) * 0.07, 0, 0, i * PI + (i >> 1) * 1.3, 0)]);
    return [
      [pm, mergeGeos([...under(hm, ring(pet, 8, 0.008)), ...under(hm2, ring(pet, 8, 0.008))])],
      [P.fY, mergeGeos([...under(hm, [eye]), ...under(hm2, [eye])])],
      [P.fG, mergeGeos([stem, br, ...leaves])],
    ];
  };
  const tulip = pm => { // 튤립: 오므린 꽃잎 여섯 장, 밑에서 올라온 넓은 잎 두 장
    const hm = mat4(0, 0.4, 0), stem = tube([V3(0, 0, 0), V3(0.006, 0.2, 0), V3(0, 0.4, 0)], 0.007, 5, false);
    const pet = blade(0.062, 0.046, { n: 3, rise: 1.3, curl: 0.45, base: 0.9, cup: 0.55 }), lf = blade(0.3, 0.06, { n: 4, rise: 1.25, curl: -0.55, base: 0.6, cup: 0.3 });
    return [
      [pm, mergeGeos(under(hm, [...ring(pet, 3, 0.012), ...ring(pet, 3, 0.016, -0.003, PI / 3)]))],
      [P.fG, mergeGeos([stem, [lf, mat4(0, 0.01, 0, 0, 0.4, 0)], [lf, mat4(0, 0.01, 0, 0, 3.3, 0)]])],
    ];
  };
  f.roseR = rose(P.fR); f.roseP = rose(P.fP); f.roseW = rose(P.fW);
  f.cosP = cosmos(P.fP); f.cosW = cosmos(P.fW); f.cosM = cosmos(P.fM);
  f.tulR = tulip(P.fR); f.tulY = tulip(P.fY); f.tulO = tulip(P.fO);
  { // 화분 식물: 늘어지는 줄잎(고사리풍), 넓은 잎, 길게 드리우는 덩굴
    const a = blade(0.36, 0.04, { n: 4, rise: 1.25, curl: -2.0, cup: 0.3 }), b = blade(0.26, 0.035, { n: 3, rise: 1.4, curl: -1.4, cup: 0.3 });
    f.fern = [[P.fG, mergeGeos(ring(a, 9, 0.01))], [P.fGd, mergeGeos(ring(b, 7, 0.006, 0, 0.3))]];
    const leaf = blade(0.16, 0.12, { n: 3, rise: 0.3, curl: -0.8, base: 0.7, cup: 0.15 }), st = [], lv = [];
    for (let i = 0; i < 7; i++) {
      const an = i * 2.3, r = 0.05 + (i % 3) * 0.025, h = 0.16 + i * 0.035, c = Math.cos(an), s = -Math.sin(an);
      st.push(tube([V3(0, 0, 0), V3(c * r * 0.4, h * 0.6, s * r * 0.4), V3(c * r, h, s * r)], 0.004, 4, false)); lv.push([leaf, mat4(c * r, h, s * r, 0, an, 0)]);
    }
    f.broad = [[P.fG, mergeGeos(st)], [P.fGd, mergeGeos(lv)]];
    const t = blade(0.6, 0.05, { n: 6, rise: 0.9, curl: -3.4, cup: 0.25 }), t2 = blade(0.4, 0.045, { n: 5, rise: 1.1, curl: -3.0, cup: 0.25 });
    f.trail = [[P.fG, mergeGeos(ring(t, 8, 0.02))], [P.fGd, mergeGeos(ring(t2, 7, 0.01, 0, 0.4))]];
  }
  return f;
}
const putF = (B, fl, x, y, z, ry = 0, s = 1, rx = 0) => { const m = mat4(x, y, z, rx, ry, 0, s); for (const [mt, g] of fl) B.geo(mt, g, m); };
// 한 자리에 꽂은 꽃다발: 줄기가 밖으로 조금씩 벌어진다
function bunch(B, R, kinds, x, y, z, n, spread = 0.3, s = 1, rad = 0.05) {
  for (let i = 0; i < n; i++) {
    const a = i / n * PI * 2 + R() * 0.9, r = n > 1 ? rad * (0.3 + 0.7 * R()) * s : 0;
    putF(B, kinds[i % kinds.length], x + Math.cos(a) * r, y, z - Math.sin(a) * r, a + PI / 2, s * (0.88 + R() * 0.24), spread * (0.35 + 0.65 * R()));
  }
}
function bucketOf(B, R, kinds, x, y, z, n, s = 1) {   // 양철 양동이에 물과 꽃
  const ry = R() * 6;
  B.put(P.zinc, G.bucket, x, y, z, ry, s); B.put(P.zinc, G.handle, x, y, z, ry, s);
  B.put(P.water, G.disc, x, y + 0.24 * s, z, 0, 0.126 * s);
  if (n) bunch(B, R, kinds, x, y + 0.03 * s, z, n, 0.3, s);
}
function potOf(B, plant, x, y, z, s = 1, ry = 0, m = P.terra) {   // 토분에 흙과 식물
  B.put(m, G.pot, x, y, z, ry, s); B.put(P.soil, G.disc, x, y + 0.16 * s, z, 0, 0.095 * s);
  if (plant) putF(B, plant, x, y + 0.16 * s, z, ry, s);
}
function vaseOf(B, R, kinds, x, y, z, n, s = 1, m = P.porcelain) {   // 꽃병
  B.put(m, G.vase, x, y, z, 0, s);
  bunch(B, R, kinds, x, y + 0.03 * s, z, n, 0.12, s * 0.62, 0.01);
}

/* ---------- 함께 쓰는 도형 ---------- */
function cushion(w, h, d) {   // 가운데가 부풀고 가장자리가 눌린 방석·베개
  const g = new THREE.BoxGeometry(w, h, d, 4, 2, 4), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) / (w / 2), z = p.getZ(i) / (d / 2); p.setY(i, p.getY(i) * (0.3 + 0.7 * (1 - 0.75 * x ** 4) * (1 - 0.75 * z ** 4))); }
  g.computeVertexNormals();
  return g;
}
function quiltGeo(w, l, drop) {   // 주름진 이불: 윗면과 양옆으로 늘어진 자락
  const nu = 14, nv = 12, pos = [], uv = [], idx = [], tot = w + drop * 2;
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const p = i / nu * tot, v = j / nv * l, fold = 0.016 * Math.sin(v * 9 + Math.sin(p * 4) * 1.6) + 0.012 * Math.sin(p * 13 + v * 3);
    let u, y;
    if (p < drop - 1e-6) { u = -w / 2 - 0.02 + fold * 0.6; y = p - drop; }
    else if (p > drop + w + 1e-6) { u = w / 2 + 0.02 + fold * 0.6; y = drop + w - p; }
    else { u = p - drop - w / 2; y = 0.035 + fold - 0.03 * Math.pow(Math.abs(u) / (w / 2), 6); }
    pos.push(u, y, v); uv.push(p, v);
    if (i < nu && j < nv) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1; idx.push(a, c, b, b, c, c + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function makeGeos() {
  const g = {}, up = geo => { geo.rotateX(-PI / 2); return geo; };
  g.knob = new THREE.SphereGeometry(0.016, 8, 6);
  g.ball = new THREE.SphereGeometry(1, 8, 6); g.pebble = new THREE.SphereGeometry(1, 6, 4);
  g.disc = up(new THREE.CircleGeometry(1, 14));
  g.pillow = cushion(0.56, 0.13, 0.34); g.zabuton = cushion(0.52, 0.08, 0.52); g.seat = cushion(0.4, 0.04, 0.4); g.sack = cushion(0.7, 0.2, 0.45); g.futon = cushion(1.5, 0.16, 0.9);
  g.bucket = lathe([[0, 0], [0.105, 0], [0.14, 0.3], [0.15, 0.3], [0.15, 0.315], [0.136, 0.315], [0.103, 0.025], [0, 0.025]], 10);
  { const pts = []; for (let i = 0; i <= 6; i++) { const a = i / 6 * PI; pts.push(V3(Math.cos(a) * 0.155, 0.3 - Math.sin(a) * 0.035, Math.sin(a) * 0.178)); } g.handle = tube(pts, 0.004, 4, false); }
  g.pot = lathe([[0, 0], [0.07, 0], [0.1, 0.15], [0.112, 0.15], [0.112, 0.185], [0.098, 0.185], [0.094, 0.15]], 10);
  g.vase = lathe([[0, 0], [0.045, 0], [0.07, 0.06], [0.075, 0.13], [0.052, 0.21], [0.04, 0.25], [0.05, 0.29], [0.042, 0.29], [0.033, 0.25], [0.04, 0.2]], 12);
  g.cup = lathe([[0, 0], [0.025, 0], [0.034, 0.055], [0.03, 0.055], [0.022, 0.008], [0, 0.008]], 10);
  g.bowl = lathe([[0, 0], [0.03, 0], [0.065, 0.05], [0.06, 0.05], [0.028, 0.008], [0, 0.008]], 12);
  g.plate = lathe([[0, 0], [0.06, 0], [0.1, 0.018], [0.096, 0.02], [0.058, 0.006], [0, 0.006]], 14);
  { // 찻주전자: 몸통·뚜껑 꼭지·주둥이·손잡이
    const hd = []; for (let i = 0; i <= 6; i++) { const a = -0.9 + i / 6 * 1.8; hd.push(V3(-0.062 - Math.cos(a) * 0.04, 0.055 + Math.sin(a) * 0.04, 0)); }
    g.teapot = mergeGeos([lathe([[0, 0], [0.05, 0], [0.075, 0.04], [0.07, 0.085], [0.04, 0.1], [0.012, 0.103], [0.016, 0.12], [0, 0.125]], 12),
      tube([V3(0.065, 0.04, 0), V3(0.1, 0.06, 0), V3(0.125, 0.1, 0)], t => 0.014 - 0.006 * t, 6, false), tube(hd, 0.006, 5, false)]);
  }
  { // 냄비(손잡이 둘, 뚜껑)와 화구
    g.cookpot = mergeGeos([lathe([[0, 0], [0.1, 0], [0.105, 0.11], [0.112, 0.11], [0.112, 0.118], [0.06, 0.14], [0.012, 0.148], [0.014, 0.165], [0, 0.17]], 14),
      [new THREE.BoxGeometry(0.05, 0.012, 0.03), mat4(0.13, 0.095, 0)], [new THREE.BoxGeometry(0.05, 0.012, 0.03), mat4(-0.13, 0.095, 0)]]);
    const tor = up(new THREE.TorusGeometry(0.07, 0.01, 6, 14)), pr = [];
    for (let i = 0; i < 4; i++) pr.push([new THREE.BoxGeometry(0.07, 0.014, 0.012), mat4(Math.cos(i * PI / 2) * 0.075, 0.012, Math.sin(i * PI / 2) * 0.075, 0, -i * PI / 2, 0)]);
    g.burner = mergeGeos([tor, ...pr]);
    g.pan = mergeGeos([lathe([[0, 0], [0.11, 0], [0.13, 0.04], [0.124, 0.04], [0.106, 0.008], [0, 0.008]], 14), [new THREE.BoxGeometry(0.2, 0.014, 0.025), mat4(0.22, 0.035, 0)]]);
  }
  { // 물뿌리개: 몸통·긴 주둥이와 살수구·뒤 손잡이·윗손잡이
    const back = [], topH = [];
    for (let i = 0; i <= 7; i++) { const a = -PI / 2 + i / 7 * PI; back.push(V3(-0.095 - Math.cos(a) * 0.09, 0.11 + Math.sin(a) * 0.085, 0)); }
    for (let i = 0; i <= 6; i++) { const a = i / 6 * PI; topH.push(V3(Math.cos(a) * 0.085, 0.2 + Math.sin(a) * 0.07, 0)); }
    const head = cyl(0.036, 0.012, 0.045, 10);
    g.can = mergeGeos([lathe([[0, 0], [0.1, 0], [0.1, 0.2], [0.062, 0.222], [0.056, 0.216], [0.09, 0.192], [0.09, 0.02], [0, 0.02]], 12),
      tube([V3(0.09, 0.05, 0), V3(0.2, 0.15, 0), V3(0.3, 0.27, 0)], t => 0.02 - 0.008 * t, 6, false), [head, mat4(0.312, 0.283, 0, 0, 0, -0.75)], tube(back, 0.008, 5, false), tube(topH, 0.007, 5, false)]);
  }
  // 두루마리(종이 몸통·축 마구리·묶은 띠)와 포장지 두루마리
  g.scroll = cyl(0.028, 0.028, 0.26, 7);
  g.scrollEnds = mergeGeos([[cyl(0.011, 0.011, 0.03, 5), mat4(0, 0.145, 0)], [cyl(0.011, 0.011, 0.03, 5), mat4(0, -0.145, 0)]]);
  g.scrollBand = cyl(0.0295, 0.0295, 0.03, 7);
  g.roll = cyl(0.045, 0.045, 0.56, 12); g.rollCore = cyl(0.018, 0.018, 0.57, 8);
  g.cone = new THREE.CylinderGeometry(0.12, 0.015, 0.36, 10, 1, true);
  // 종이 갓 전등(살이 도드라진 둥근 갓)
  { const ribs = 6, prof = []; for (let i = 0; i <= ribs * 2; i++) { const t = i / (ribs * 2); prof.push([0.17 * (0.5 + 0.5 * Math.pow(Math.sin(PI * (0.1 + 0.8 * t)), 0.7)) * (1 + 0.03 * Math.cos(t * ribs * PI * 2)), -0.13 + 0.26 * t]); }
    g.shade = lathe(prof, 12); g.shadeRim = mergeGeos([[cyl(0.092, 0.092, 0.02, 14), mat4(0, 0.135, 0)], [cyl(0.092, 0.092, 0.02, 14), mat4(0, -0.135, 0)]]); }
  // 책상 전등: 받침·굽은 목·갓
  g.deskLamp = mergeGeos([cyl(0.06, 0.07, 0.02, 12), tube([V3(0, 0.01, 0), V3(0, 0.22, 0), V3(0.04, 0.32, 0), V3(0.11, 0.34, 0)], 0.008, 5, false),
    [new THREE.CylinderGeometry(0.03, 0.075, 0.09, 12, 1, true), mat4(0.13, 0.31, 0, 0, 0, -0.5)]]);
  // 닌자 샌들: 밑창·발등 띠·뒤꿈치 싸개
  g.sandal = mergeGeos([[new THREE.BoxGeometry(0.1, 0.022, 0.25), mat4(0, 0.011, 0)], [new THREE.BoxGeometry(0.104, 0.05, 0.07), mat4(0, 0.045, 0.03)],
    [new THREE.BoxGeometry(0.104, 0.09, 0.012), mat4(0, 0.065, -0.118)], [new THREE.BoxGeometry(0.012, 0.07, 0.1), mat4(0.046, 0.055, -0.07)], [new THREE.BoxGeometry(0.012, 0.07, 0.1), mat4(-0.046, 0.055, -0.07)]]);
  g.mirrorRim = new THREE.TorusGeometry(0.3, 0.025, 8, 28); g.mirrorFace = new THREE.CircleGeometry(0.29, 28);
  g.stone = cyl(0.36, 0.42, 0.06, 9); g.stone.translate(0, 0.03, 0);
  g.tableTop = cyl(1, 1, 0.04, 28);
  g.bottle = lathe([[0, 0], [0.018, 0], [0.02, 0.05], [0.008, 0.062], [0.008, 0.08], [0.011, 0.08], [0.011, 0.095], [0, 0.095]], 8);
  return g;
}

/* ---------- 가구를 제 좌표로 짜서 90° 단위로 돌려 놓는 틀 ----------
   u = 오른쪽, v = 앞쪽. rot: 0 = 앞이 남(+z), 1 = 동(+x), 2 = 북, 3 = 서. 벽에 붙는 가구는 원점이 뒤 가운데(v = 0..깊이). */
function local(B, ox, oy, oz, rot = 0) {
  const Pt = (u, v) => (rot === 0 ? [ox + u, oz + v] : rot === 1 ? [ox + v, oz - u] : rot === 2 ? [ox - u, oz - v] : [ox - v, oz + u]);
  const L = {
    B, oy, P: Pt,
    box(m, u0, y0, v0, u1, y1, v1, c = false) { const [xa, za] = Pt(u0, v0), [xb, zb] = Pt(u1, v1); B.box(m, xa, oy + y0, za, xb, oy + y1, zb, c); },
    put(m, g, u, y, v, ry = 0, s = 1, rx = 0, rz = 0) { const [x, z] = Pt(u, v); B.put(m, g, x, oy + y, z, ry + rot * PI / 2, s, rx, rz); },
    col(u0, y0, v0, u1, y1, v1) { const [xa, za] = Pt(u0, v0), [xb, zb] = Pt(u1, v1); addCollider(xa, oy + y0, za, xb, oy + y1, zb); },
    pt(u, y, v) { const [x, z] = Pt(u, v); return V3(x, oy + y, z); },
    legs(m, u0, v0, u1, v1, y0, y1, t) { for (const [u, v] of [[u0, v0], [u1 - t, v0], [u0, v1 - t], [u1 - t, v1 - t]]) L.box(m, u, y0, v, u + t, y1, v + t); },
    flora(fn, u, y, v, ...a) { const [x, z] = Pt(u, v); fn(x, oy + y, z, ...a); },
  };
  return L;
}

// 침대: 머리가 뒤(-v). 다리·옆널·머리판 살·매트리스·베개·주름진 이불과 접어 넘긴 홑청
function bed(L, w, len, quiltM) {
  const hw = w / 2, hl = len / 2, wd = M.beamLight;
  L.legs(wd, -hw, -hl, hw, hl, 0, 0.3, 0.08);
  L.box(wd, -hw, 0.18, -hl, -hw + 0.04, 0.34, hl); L.box(wd, hw - 0.04, 0.18, -hl, hw, 0.34, hl); L.box(wd, -hw, 0.18, hl - 0.04, hw, 0.42, hl);
  L.box(wd, -hw, 0, -hl - 0.05, -hw + 0.08, 0.95, -hl + 0.03); L.box(wd, hw - 0.08, 0, -hl - 0.05, hw, 0.95, -hl + 0.03);
  L.box(wd, -hw, 0.86, -hl - 0.04, hw, 0.95, -hl + 0.02); L.box(wd, -hw, 0.4, -hl - 0.04, hw, 0.47, -hl + 0.02);
  for (let i = 1; i < 6; i++) { const u = -hw + w * i / 6; L.box(wd, u - 0.03, 0.47, -hl - 0.03, u + 0.03, 0.86, -hl + 0.01); }
  L.box(P.white, -hw + 0.04, 0.3, -hl + 0.03, hw - 0.04, 0.46, hl - 0.04);
  L.put(P.white, G.pillow, 0, 0.51, -hl + 0.27);
  L.put(quiltM, quiltGeo(w + 0.04, len - 0.62, 0.2), 0, 0.47, -hl + 0.55);
  L.box(P.white, -hw - 0.045, 0.3, -hl + 0.5, hw + 0.045, 0.52, -hl + 0.7);
  L.col(-hw, 0, -hl, hw, 0.6, hl);
}
// 책상: 상판·다리·오른쪽 서랍 석 단(앞판·손잡이)·가리개널. 앉는 쪽이 +v
function desk(L, w, d) {
  const hw = w / 2, hd = d / 2, wd = M.beamLight;
  L.box(wd, -hw, 0.7, -hd, hw, 0.74, hd); L.legs(wd, -hw + 0.03, -hd + 0.03, hw - 0.03, hd - 0.03, 0, 0.7, 0.05);
  L.box(wd, -hw + 0.06, 0.36, -hd + 0.035, hw - 0.06, 0.7, -hd + 0.05);
  L.box(wd, hw - 0.46, 0.12, -hd + 0.05, hw - 0.05, 0.7, hd - 0.04);
  for (let i = 0; i < 3; i++) { const y = 0.14 + i * 0.185; L.box(M.beam, hw - 0.445, y, hd - 0.04, hw - 0.065, y + 0.17, hd - 0.026); L.put(P.brass, G.knob, hw - 0.255, y + 0.085, hd - 0.018); }
  L.box(M.beam, -hw + 0.1, 0.61, hd - 0.05, hw - 0.5, 0.69, hd - 0.036); L.put(P.brass, G.knob, -0.2, 0.65, hd - 0.03);
  L.col(-hw, 0, -hd, hw, 0.74, hd);
}
// 의자: 다리·가로대·앉는 널(방석)·등받이 살. 앉은 사람이 +v를 본다
function chair(L, cm) {
  const wd = M.beamLight;
  L.legs(wd, -0.2, -0.2, 0.2, 0.2, 0, 0.43, 0.04); L.box(wd, -0.21, 0.41, -0.21, 0.21, 0.45, 0.21);
  if (cm) L.put(cm, G.seat, 0, 0.47, 0);
  L.box(wd, -0.2, 0.45, -0.2, -0.16, 0.92, -0.16); L.box(wd, 0.16, 0.45, -0.2, 0.2, 0.92, -0.16);
  L.box(wd, -0.2, 0.84, -0.195, 0.2, 0.92, -0.165); L.box(wd, -0.2, 0.6, -0.19, 0.2, 0.64, -0.17);
  for (const u of [-0.09, 0, 0.09]) L.box(wd, u - 0.015, 0.64, -0.188, u + 0.015, 0.84, -0.172);
  for (const s of [-1, 1]) L.box(wd, s * 0.18 - 0.012, 0.18, -0.18, s * 0.18 + 0.012, 0.21, 0.18);
  L.col(-0.2, 0, -0.2, 0.2, 0.9, 0.2);
}
// 식탁·작업대: 상판·다리·테두리널
function table(L, w, d, h = 0.74, wd = M.beamLight) {
  const hw = w / 2, hd = d / 2;
  L.box(wd, -hw, h - 0.04, -hd, hw, h, hd); L.legs(wd, -hw + 0.05, -hd + 0.05, hw - 0.05, hd - 0.05, 0, h - 0.04, 0.07);
  L.box(wd, -hw + 0.1, h - 0.14, -hd + 0.07, hw - 0.1, h - 0.04, -hd + 0.09); L.box(wd, -hw + 0.1, h - 0.14, hd - 0.09, hw - 0.1, h - 0.04, hd - 0.07);
  L.box(wd, -hw + 0.07, h - 0.14, -hd + 0.1, -hw + 0.09, h - 0.04, hd - 0.1); L.box(wd, hw - 0.09, h - 0.14, -hd + 0.1, hw - 0.07, h - 0.04, hd - 0.1);
  L.col(-hw, 0, -hd, hw, h, hd);
}
// 둥근 밥상(차부다이)
function lowTable(L, r, h = 0.34) {
  L.put(M.beam, G.tableTop, 0, h - 0.02, 0, 0, [r, 1, r]); L.put(M.beam, G.tableTop, 0, h - 0.07, 0, 0, [r * 0.82, 1.4, r * 0.82]);
  for (let i = 0; i < 4; i++) { const a = PI / 4 + i * PI / 2, u = Math.cos(a) * r * 0.62, v = Math.sin(a) * r * 0.62; L.box(M.beam, u - 0.03, 0, v - 0.03, u + 0.03, h - 0.09, v + 0.03); }
  L.col(-r * 0.7, 0, -r * 0.7, r * 0.7, h, r * 0.7);
}
function teaSet(L, u, y, v, cups) {   // 찻주전자와 찻잔
  L.put(P.terra, G.teapot, u, y, v, 0.6);
  for (let i = 0; i < cups; i++) { const a = 0.8 + i * 1.5; L.put(P.porcelain, G.cup, u + Math.cos(a) * 0.2, y, v + Math.sin(a) * 0.2); }
}
function scrollAt(L, u, y, v, k, s = 1) {
  L.put(P.paper, G.scroll, u, y, v, 0, s, PI / 2); L.put(M.beam, G.scrollEnds, u, y, v, 0, s, PI / 2); L.put(k % 2 ? P.red : P.green, G.scrollBand, u, y, v, 0, s, PI / 2);
}
// 책장·선반: 옆널·뒷널·층널, 층마다 책(책등 띠)·두루마리·화분·꽃병·포장지를 채운다
function bookcase(L, w, d, h, rows, R, wd = M.beam) {
  const hw = w / 2, gap = (h - 0.06) / rows.length;
  L.box(wd, -hw, 0, 0, -hw + 0.03, h, d); L.box(wd, hw - 0.03, 0, 0, hw, h, d); L.box(wd, -hw, 0, 0, hw, h, 0.015);
  L.box(wd, -hw - 0.012, h, 0, hw + 0.012, h + 0.03, d + 0.012);
  rows.forEach((kind, r) => {
    const y = 0.06 + gap * r;
    L.box(wd, -hw + 0.03, y - 0.025, 0.015, hw - 0.03, y, d);
    if (kind === 'books') {
      for (let u = -hw + 0.045; u < hw - 0.09;) {
        const bw = 0.028 + R() * 0.034, bh = (gap - 0.05) * (0.6 + R() * 0.38), bd = (d - 0.03) * (0.7 + R() * 0.25);
        L.box(P.books[(R() * P.books.length) | 0], u, y, 0.02, u + bw, y + bh, 0.02 + bd);
        L.box(P.paper, u + 0.004, y + bh * 0.68, 0.02 + bd, u + bw - 0.004, y + bh * 0.82, 0.022 + bd);
        u += bw + 0.002; if (R() < 0.1) u += 0.06 + R() * 0.1;
      }
    } else if (kind === 'scrolls') {
      for (let u = -hw + 0.08, k = 0; u < hw - 0.09; u += 0.066, k++) for (let j = 0; j < (k % 3 === 2 ? 1 : 2); j++) scrollAt(L, u + j * 0.033, y + 0.03 + j * 0.056, d / 2 + 0.01, k + j);
    } else if (kind === 'pots') {
      for (let u = -hw + 0.18, k = 0; u < hw - 0.12; u += 0.27, k++) {
        if (k % 2) for (let j = 0; j < 3; j++) L.put(P.terra, G.pot, u, y + j * 0.045, d / 2, k, 0.8);
        else L.flora((x, yy, z) => potOf(L.B, k % 4 ? F.fern : F.broad, x, yy, z, 0.7, k), u, y, d / 2);
      }
    } else if (kind === 'vases') {
      for (let u = -hw + 0.16, k = 0; u < hw - 0.1; u += 0.24, k++) L.put([P.porcelain, P.blue, P.green, P.terra][k % 4], G.vase, u, y, d / 2, 0, 0.75 + (k % 3) * 0.12);
    } else if (kind === 'rolls') {
      for (let u = -hw + 0.12, k = 0; u < hw - 0.08; u += 0.11, k++) { L.put([P.pink, P.kraft, P.white, P.green, P.purple][k % 5], G.roll, u, y + 0.196, d / 2, 0, 0.7); L.put(P.kraft, G.rollCore, u, y + 0.196, d / 2, 0, 0.7); }
    }
  });
  L.col(-hw, 0, 0, hw, h, d);
}
// 옷장: 몸통·굽·덮개널, 울거미를 두른 문 두 짝과 손잡이
function wardrobe(L, w, d, h) {
  const hw = w / 2, wd = M.beamLight;
  L.box(wd, -hw, 0.08, 0, hw, h, d - 0.02); L.box(M.beam, -hw + 0.03, 0, 0.03, hw - 0.03, 0.08, d - 0.05); L.box(M.beam, -hw - 0.02, h, 0, hw + 0.02, h + 0.05, d + 0.01);
  for (const s of [-1, 1]) {
    const a = s < 0 ? -hw + 0.02 : 0.005, b = s < 0 ? -0.005 : hw - 0.02;
    L.box(wd, a, 0.12, d - 0.02, b, h - 0.03, d);
    L.box(M.beam, a, 0.12, d, a + 0.05, h - 0.03, d + 0.012); L.box(M.beam, b - 0.05, 0.12, d, b, h - 0.03, d + 0.012);
    for (const y of [0.12, h * 0.5, h - 0.08]) L.box(M.beam, a + 0.05, y, d, b - 0.05, y + 0.05, d + 0.012);
    L.put(P.brass, G.knob, s * 0.05, h * 0.5 + 0.13, d + 0.025);
  }
  L.col(-hw, 0, 0, hw, h, d);
}
// 서랍장(단스): 단마다 서랍 앞판·쇠 손잡이·모서리 쇠붙이
function tansu(L, w, d, h, rows = 4) {
  const hw = w / 2;
  L.box(M.beam, -hw, 0.06, 0, hw, h, d - 0.015); L.box(M.beam, -hw + 0.04, 0, 0.04, hw - 0.04, 0.06, d - 0.05);
  for (let r = 0; r < rows; r++) {
    const y0 = 0.09 + (h - 0.12) * r / rows, y1 = 0.09 + (h - 0.12) * (r + 1) / rows - 0.02, parts = r === rows - 1 && w > 0.8 ? [[-hw + 0.03, -0.01], [0.01, hw - 0.03]] : [[-hw + 0.03, hw - 0.03]];
    for (const [a, b] of parts) {
      L.box(M.beamLight, a, y0, d - 0.015, b, y1, d);
      const um = (a + b) / 2, ym = (y0 + y1) / 2;
      L.box(M.iron, um - 0.05, ym - 0.008, d, um + 0.05, ym + 0.008, d + 0.014);
      for (const c of [a, b - 0.03]) L.box(M.iron, c, y0, d, c + 0.03, y0 + 0.03, d + 0.004);
    }
  }
  L.col(-hw, 0, 0, hw, h, d);
}
// 찬장·수납장의 문짝(손잡이) 또는 서랍
function doors(L, m, a, b, y0, y1, v, n, drawer = false) {
  for (let i = 0; i < n; i++) {
    const p = a + (b - a) * i / n + 0.01, q = a + (b - a) * (i + 1) / n - 0.01;
    L.box(m, p, y0, v, q, y1, v + 0.018);
    if (drawer) L.box(M.iron, (p + q) / 2 - 0.05, (y0 + y1) / 2 - 0.006, v + 0.018, (p + q) / 2 + 0.05, (y0 + y1) / 2 + 0.006, v + 0.03);
    else { const hx = i % 2 ? p + 0.04 : q - 0.04; L.box(M.iron, hx - 0.006, y1 - 0.2, v + 0.018, hx + 0.006, y1 - 0.08, v + 0.03); }
  }
}
function cabinet(L, w, d, h, n, top = M.beam, drawers = false) {
  const hw = w / 2;
  L.box(M.beam, -hw, 0, 0, hw, 0.08, d - 0.06); L.box(M.beamLight, -hw, 0.08, 0, hw, h - 0.04, d - 0.02); L.box(top, -hw, h - 0.04, 0, hw, h, d + 0.02);
  if (drawers) { doors(L, M.beamLight, -hw, hw, h - 0.2, h - 0.06, d - 0.02, n, true); doors(L, M.beamLight, -hw, hw, 0.1, h - 0.22, d - 0.02, n); }
  else doors(L, M.beamLight, -hw, hw, 0.1, h - 0.06, d - 0.02, n);
  L.col(-hw, 0, 0, hw, h, d);
}
// 개수대: 상판에 구멍을 내고 물받이·수도꼭지
function sinkUnit(L, w, d, h) {
  const hw = w / 2, st = P.steel, a = -0.35, b = 0.35, v0 = 0.14, v1 = d - 0.08;
  L.box(M.beam, -hw, 0, 0, hw, 0.08, d - 0.06); L.box(M.beamLight, -hw, 0.08, 0, hw, h - 0.2, d - 0.02);
  L.box(M.beamLight, -hw, h - 0.2, d - 0.04, hw, h - 0.04, d - 0.02); L.box(M.beamLight, -hw, h - 0.2, 0, hw, h - 0.04, 0.02);
  L.box(M.beamLight, -hw, h - 0.2, 0, -hw + 0.02, h - 0.04, d - 0.02); L.box(M.beamLight, hw - 0.02, h - 0.2, 0, hw, h - 0.04, d - 0.02);
  L.box(st, -hw, h - 0.04, 0, a, h, d + 0.02); L.box(st, b, h - 0.04, 0, hw, h, d + 0.02); L.box(st, a, h - 0.04, 0, b, h, v0); L.box(st, a, h - 0.04, v1, b, h, d + 0.02);
  L.box(st, a, h - 0.2, v0, b, h - 0.185, v1);
  L.box(st, a - 0.01, h - 0.2, v0, a, h - 0.04, v1); L.box(st, b, h - 0.2, v0, b + 0.01, h - 0.04, v1); L.box(st, a, h - 0.2, v0 - 0.01, b, h - 0.04, v0); L.box(st, a, h - 0.2, v1, b, h - 0.04, v1 + 0.01);
  doors(L, M.beamLight, -hw, hw, 0.1, h - 0.22, d - 0.02, 2);
  L.B.geo(st, tube([L.pt(0, h, 0.07), L.pt(0, h + 0.24, 0.07), L.pt(0, h + 0.3, 0.12), L.pt(0, h + 0.26, 0.22)], 0.012, 6, true));
  for (const s of [-1, 1]) L.put(st, cyl(0.022, 0.022, 0.05, 8), s * 0.1, h + 0.025, 0.07);
  L.col(-hw, 0, 0, hw, h, d);
}
function fridge(L, w, d, h) {   // 냉장고: 위아래 문과 손잡이
  const hw = w / 2;
  L.box(P.white, -hw, 0.04, 0, hw, h, d - 0.04); L.box(P.black, -hw + 0.03, 0, 0.03, hw - 0.03, 0.04, d - 0.08);
  L.box(P.white, -hw + 0.008, 0.06, d - 0.04, hw - 0.008, h * 0.6, d); L.box(P.white, -hw + 0.008, h * 0.6 + 0.015, d - 0.04, hw - 0.008, h - 0.01, d);
  for (const [y0, y1] of [[h * 0.42, h * 0.56], [h * 0.64, h * 0.78]]) L.box(P.steel, hw - 0.08, y0, d, hw - 0.055, y1, d + 0.035);
  L.col(-hw, 0, 0, hw, h, d);
}
function stove(L, u, y, v) {   // 화구 둘·손잡이, 냄비와 프라이팬
  L.box(P.black, u - 0.32, y, v - 0.22, u + 0.32, y + 0.07, v + 0.22);
  for (const s of [-1, 1]) { L.put(M.iron, G.burner, u + s * 0.16, y + 0.078, v - 0.02); L.put(P.white, G.knob, u + s * 0.16, y + 0.035, v + 0.225, 0, 1.3); }
  L.put(P.steel, G.cookpot, u - 0.16, y + 0.1, v - 0.02, 0.4); L.put(P.black, G.pan, u + 0.16, y + 0.1, v - 0.02, -0.7);
}
// 전신 거울: 발 달린 기둥 둘 사이에 건 거울
function cheval(L) {
  const wd = M.beamLight;
  for (const s of [-1, 1]) { L.box(wd, s * 0.27 - 0.02, 0, 0.1, s * 0.27 + 0.02, 1.5, 0.14); L.box(wd, s * 0.27 - 0.025, 0, -0.03, s * 0.27 + 0.025, 0.04, 0.3); }
  L.box(wd, -0.25, 0.3, 0.105, 0.25, 1.62, 0.135); L.box(P.mirror, -0.215, 0.335, 0.135, 0.215, 1.585, 0.139);
  L.col(-0.3, 0, 0, 0.3, 1.6, 0.26);
}
// 화장대: 서랍 둘, 둥근 거울, 화장품 병, 둥근 걸상
function dresser(L, cm) {
  const wd = M.beamLight, hw = 0.55, d = 0.45;
  L.box(wd, -hw, 0.66, 0, hw, 0.7, d); L.legs(wd, -hw + 0.02, 0.02, hw - 0.02, d - 0.02, 0, 0.66, 0.045);
  for (const s of [-1, 1]) {
    const a = s > 0 ? 0.2 : -hw + 0.03, b = s > 0 ? hw - 0.03 : -0.2;
    L.box(wd, a, 0.5, 0.03, b, 0.66, d - 0.014); L.box(M.beam, a + 0.015, 0.515, d - 0.014, b - 0.015, 0.645, d); L.put(P.brass, G.knob, (a + b) / 2, 0.58, d + 0.01);
  }
  for (const s of [-1, 1]) L.box(wd, s * 0.2 - 0.02, 0.7, 0.03, s * 0.2 + 0.02, 1.0, 0.06);
  L.put(wd, G.mirrorRim, 0, 1.22, 0.05); L.put(P.mirror, G.mirrorFace, 0, 1.22, 0.06);
  [[-0.42, 0.14, P.pink, 1], [-0.34, 0.2, P.purple, 0.8], [-0.28, 0.13, P.porcelain, 1.2], [0.4, 0.15, P.red, 0.7], [0.33, 0.22, P.blue, 1]].forEach(([u, v, m, s]) => L.put(m, G.bottle, u, 0.7, v, 0, s));
  L.box(P.pink, 0.12, 0.7, 0.24, 0.26, 0.715, 0.34); L.box(M.beam, 0.2, 0.7, 0.36, 0.34, 0.706, 0.375);   // 분첩·빗
  L.put(wd, G.tableTop, 0, 0.4, d + 0.4, 0, [0.17, 1, 0.17]); L.put(cm, G.tableTop, 0, 0.44, d + 0.4, 0, [0.16, 1.2, 0.16]);
  for (let i = 0; i < 3; i++) { const a = i * 2.1; L.box(wd, Math.cos(a) * 0.11 - 0.018, 0, d + 0.4 + Math.sin(a) * 0.11 - 0.018, Math.cos(a) * 0.11 + 0.018, 0.38, d + 0.4 + Math.sin(a) * 0.11 + 0.018); }
  L.col(-hw, 0, 0, hw, 0.7, d);
}
// 층층 꽃 진열대: 뒤가 높은 세 단. 단마다 널 두 장·가로대, 옆 받침과 비스듬한 버팀. 단의 높이·깊이 자리를 돌려준다
function stand(L, w, tiers = 3) {
  const hw = w / 2, D = 0.36, out = [];
  for (let i = 0; i < tiers; i++) {
    const y = 0.22 + (tiers - 1 - i) * 0.3, v0 = i * D;
    L.box(M.beamLight, -hw, y - 0.03, v0 + 0.01, hw, y, v0 + D * 0.5 - 0.008); L.box(M.beamLight, -hw, y - 0.03, v0 + D * 0.5 + 0.008, hw, y, v0 + D - 0.01);
    L.box(M.beam, -hw + 0.05, y - 0.09, v0 + D * 0.5 - 0.02, hw - 0.05, y - 0.03, v0 + D * 0.5 + 0.02);
    for (const u of [-hw + 0.08, 0, hw - 0.08]) L.box(M.beam, u - 0.025, 0, v0 + D * 0.5 - 0.025, u + 0.025, y - 0.03, v0 + D * 0.5 + 0.025);
    out.push({ y, v: v0 + D / 2 });
  }
  for (const u of [-hw + 0.08, hw - 0.08]) beamBetween(L.B, M.beam, L.pt(u, out[0].y - 0.1, D * 0.5), L.pt(u, 0.06, D * (tiers - 0.5)), 0.04, 0.06);
  L.col(-hw, 0, 0, hw, 0.95, tiers * D);
  return out;
}
// 나무 궤짝: 모서리 기둥에 가로 살
function crate(L, u, v, w, d, h, y = 0) {
  for (const [a, b] of [[u - w / 2, v - d / 2], [u + w / 2 - 0.03, v - d / 2], [u - w / 2, v + d / 2 - 0.03], [u + w / 2 - 0.03, v + d / 2 - 0.03]]) L.box(M.beam, a, y, b, a + 0.03, y + h, b + 0.03);
  for (let i = 0; i < 3; i++) {
    const ya = y + 0.02 + i * (h - 0.09) / 2;
    L.box(M.beamLight, u - w / 2, ya, v - d / 2 - 0.012, u + w / 2, ya + 0.07, v - d / 2); L.box(M.beamLight, u - w / 2, ya, v + d / 2, u + w / 2, ya + 0.07, v + d / 2 + 0.012);
    L.box(M.beamLight, u - w / 2 - 0.012, ya, v - d / 2, u - w / 2, ya + 0.07, v + d / 2); L.box(M.beamLight, u + w / 2, ya, v - d / 2, u + w / 2 + 0.012, ya + 0.07, v + d / 2);
  }
  for (let i = 0; i < 4; i++) { const a = u - w / 2 + 0.01 + i * (w - 0.02) / 4; L.box(M.beamLight, a, y + h - 0.02, v - d / 2, a + (w - 0.02) / 4 - 0.012, y + h, v + d / 2); }
}

/* ---------- 건물 공통 ---------- */
// [u0, u1, y0, y1, 'd'(창을 끼우지 않는 문 구멍)] 목록 → wall()의 구멍 꼴(같은 자리의 위아래 창은 한데 묶는다)
const holes = list => { const m = new Map(); for (const [u0, u1, y0, y1] of list) { const k = u0 + ',' + u1; if (!m.has(k)) m.set(k, { u0, u1, ys: [] }); m.get(k).ys.push([y0, y1]); } return [...m.values()]; };
function side(B, m, axis, f0, f1, u0, u1, y0, y1, out, list) {
  wall(B, m, axis, f0, f1, u0, u1, y0, y1, holes(list));
  for (const [a, b, ya, yb, kind] of list) if (!kind) windowUnit(B, axis, f0, f1, a, b, ya, yb, { out });
}
// 모서리 기둥과 층 사이 띠
function trim(B, x0, z0, x1, z1, yTop, belts = []) {
  const e = 0.035;
  for (const [x, sx] of [[x0, -1], [x1, 1]]) for (const [z, sz] of [[z0, -1], [z1, 1]]) B.box(M.beam, x + sx * e, 0, z + sz * e, x - sx * 0.16, yTop, z - sz * 0.16, false);
  for (const y of belts) {
    B.box(M.beam, x0 - e, y, z0 - e, x1 + e, y + 0.16, z0, false); B.box(M.beam, x0 - e, y, z1, x1 + e, y + 0.16, z1 + e, false);
    B.box(M.beam, x0 - e, y, z0, x0, y + 0.16, z1, false); B.box(M.beam, x1, y, z0, x1 + e, y + 0.16, z1, false);
  }
}
// 천장에 매단 종이 갓 전등
function lamp(B, x, yCeil, z, glows, drop = 0.55) {
  B.geo(M.iron, tube([V3(x, yCeil, z), V3(x, yCeil - drop + 0.14, z)], 0.006, 4, false));
  B.put(P.glow, G.shade, x, yCeil - drop, z); B.put(M.beam, G.shadeRim, x, yCeil - drop, z);
  glows.push([x, yCeil - drop, z, 0.9]);
}
// 창 양옆으로 걷어 묶은 주름 커튼과 봉
function curtains(B, axis, f, u0, u1, yTop, drop, m, inward = 1) {
  const w = (u1 - u0) * 0.3;
  B.geo(M.beam, tube(axis === 'x' ? [V3(u0 - 0.15, yTop + 0.03, f), V3(u1 + 0.15, yTop + 0.03, f)] : [V3(f, yTop + 0.03, u0 - 0.15), V3(f, yTop + 0.03, u1 + 0.15)], 0.014, 6, true));
  for (const um of [u0 + w / 2 - 0.08, u1 - w / 2 + 0.08]) {
    const g = new THREE.PlaneGeometry(w, drop, 12, 5), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, 0.03 * Math.sin(p.getX(i) * 42));
    g.computeVertexNormals();
    B.geo(m, g, axis === 'x' ? mat4(um, yTop - drop / 2, f, 0, inward > 0 ? 0 : PI, 0) : mat4(f, yTop - drop / 2, um, 0, inward > 0 ? PI / 2 : -PI / 2, 0));
  }
}
// 족자: 비단 바탕에 종이 글씨, 위아래 축
function kakejiku(B, text, x, y, z, ry, w = 0.42, h = 1.2, cloth = P.blue) {
  const m = mat4(x, y, z, 0, ry, 0);
  B.geo(cloth, new THREE.BoxGeometry(w + 0.12, h + 0.36, 0.008), m);
  B.geo(textMat(text, { w: 128, h: Math.round(128 * h / w), bg: '#efe6cf', vertical: true, pad: 0.14 }), new THREE.PlaneGeometry(w, h), m.clone().multiply(mat4(0, 0, 0.0055)));
  for (const s of [-1, 1]) { const g = cyl(0.016, 0.016, w + 0.2, 8); B.geo(M.beam, g, m.clone().multiply(mat4(0, s * (h / 2 + 0.18), 0.005, 0, 0, PI / 2))); }
}
// 액자(뒤로 살짝 기울여 세울 수 있다)
function photo(B, pm, x, y, z, ry, w, h, tilt = 0) {
  const m = mat4(x, y, z, -tilt, ry, 0);
  B.geo(M.beam, new THREE.BoxGeometry(w + 0.05, h + 0.05, 0.02), m);
  B.geo(pm, new THREE.PlaneGeometry(w, h), m.clone().multiply(mat4(0, 0, 0.0105)));
}
// 단체 사진: 하늘·풀밭 앞에 선 사람들(머리 모양과 옷 색으로 누군지 알아보게)
const teamPhoto = (id, people) => textMat(id, { w: 256, h: 192, bg: '#9fd0ea', color: '#9fd0ea', draw: (g, w, h) => {
  g.fillStyle = '#7fae62'; g.fillRect(0, h * 0.7, w, h * 0.3);
  for (const [x, top, hair, body, kind] of people) {
    const cx = x * w, hy = top * h, r = 19;
    g.fillStyle = body; g.beginPath(); g.roundRect(cx - (kind === 'big' ? 32 : 23), hy + r - 3, kind === 'big' ? 64 : 46, h, 12); g.fill();
    g.fillStyle = '#f2cfa8'; g.beginPath(); g.arc(cx, hy, r, 0, 7); g.fill();
    g.fillStyle = hair; g.beginPath(); g.arc(cx, hy - 3, r + 2, PI * 1.02, PI * 1.98); g.fill();
    if (kind === 'spiky' || kind === 'mask') for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(cx + i * 9 - 7, hy - 14); g.lineTo(cx + i * 11 + (kind === 'mask' ? 6 : 0), hy - 36); g.lineTo(cx + i * 9 + 7, hy - 14); g.fill(); }
    if (kind === 'long') g.fillRect(cx - r - 2, hy - 4, 8, 40), g.fillRect(cx + r - 6, hy - 4, 8, 40);
    if (kind === 'tail') { g.beginPath(); g.moveTo(cx - 8, hy - 18); g.lineTo(cx, hy - 44); g.lineTo(cx + 8, hy - 18); g.fill(); }
    if (kind === 'pony') g.fillRect(cx + r - 4, hy - 16, 9, 58);
    if (kind === 'mask') { g.fillStyle = '#2b3550'; g.fillRect(cx - r, hy + 2, r * 2, r); g.fillRect(cx - r, hy - 12, r * 2, 6); }
    else { g.fillStyle = '#2b3550'; g.fillRect(cx - r, hy - 13, r * 2, 5); }                                   // 이마 보호대
    g.fillStyle = '#222'; g.fillRect(cx - 8, hy - 3, 4, 4); g.fillRect(cx + 4, hy - 3, 4, 4);
    if (kind !== 'mask') { g.strokeStyle = '#7a3b2e'; g.lineWidth = 2; g.beginPath(); g.arc(cx, hy + 5, 6, 0.2, PI - 0.2); g.stroke(); }
  }
} });

/* ============================ 사쿠라의 집 ============================ */
function buildSakura(B, R, out) {
  const X0 = 32, X1 = 46, Z0 = 63, Z1 = 76, T = 0.2, F1 = 0.4, F2 = 3.4, CE = 6.1, TOP = 6.2, wl = P.cream;
  const { glows } = out;
  // 바깥벽(아래위층 한 번에)과 창
  side(B, wl, 'x', Z0, Z0 + T, X0, X1, 0, TOP, -1, [[34, 36.5, 1.3, 2.7], [34, 36.5, 4.3, 5.7], [41.5, 43.5, 1.5, 2.6], [41.5, 43.5, 4.3, 5.7]]);
  side(B, wl, 'x', Z1 - T, Z1, X0, X1, 0, TOP, 1, [[33.4, 35.8, 1.3, 2.7], [33.4, 35.8, 4.3, 5.7], [36.6, 38, 1.3, 2.7], [36.6, 38, F2, 5.6, 'd'], [41.5, 42.7, 0, 2.4, 'd'], [41.5, 42.7, 4.3, 5.7]]);
  side(B, wl, 'z', X0, X0 + T, Z0 + T, Z1 - T, 0, TOP, -1, [[65, 67, 1.3, 2.7], [65, 67, 4.3, 5.7], [71, 73.5, 1.3, 2.7], [71, 73.5, 4.3, 5.7]]);
  side(B, wl, 'z', X1 - T, X1, Z0 + T, Z1 - T, 0, TOP, 1, [[65, 67, 1.5, 2.6], [65, 67, 4.3, 5.7], [70.6, 72.4, 3.0, 4.6]]);
  trim(B, X0, Z0, X1, Z1, TOP, [3.12, TOP - 0.16]);
  for (const [a, b, c, d] of [[X0 - 0.05, Z0 - 0.05, X1 + 0.05, Z0], [X0 - 0.05, Z0, X0, Z1], [X1, Z0, X1 + 0.05, Z1], [X0 - 0.05, Z1, 41.4, Z1 + 0.05], [42.8, Z1, X1 + 0.05, Z1 + 0.05]]) B.box(M.stone, a, 0, b, c, 0.45, d, false);
  gableRoof(B, P.roofS, X0, Z0, X1, Z1, TOP, 2.6, { ridge: 'x', gable: wl });

  // 바닥: 1층 마루, 현관(신발 벗는 낮은 자리), 2층 마루(계단 구멍), 천장
  B.box(M.floor, X0 + T, 0, Z0 + T, 40, F1, Z1 - T); B.box(M.floor, 40, 0, Z0 + T, X1 - T, F1, 74.6);
  B.box(M.pave, 40, 0, 74.6, X1 - T, 0.12, Z1 - T); B.box(M.beam, 40, 0.12, 74.57, X1 - T, F1 + 0.025, 74.63, false);   // 마루 턱의 앞면이 마루 옆면과 한 평면에 겹치지 않게 내민다
  B.box(M.pave, 41.1, 0, Z1 - T - 0.02, 43.1, 0.135, 77.2);
  B.box(M.floor, X0 + T, 3.2, Z0 + T, 44.4, F2, Z1 - T); B.box(M.floor, 44.4, 3.2, Z0 + T, X1 - T, F2, 69.4); B.box(M.floor, 44.4, 3.2, 73.9, X1 - T, F2, Z1 - T);
  B.box(M.beamLight, X0 + T, CE, Z0 + T, X1 - T, TOP, Z1 - T);
  // 1층 칸막이: 거실 | 부엌·복도, 부엌 | 복도. 계단은 동쪽 벽을 따라 북으로 오른다
  wall(B, M.white, 'z', 39.8, 40, Z0 + T, Z1 - T, F1, 3.2, [{ u0: 64.6, u1: 67.6, ys: [[F1, 2.7]] }, { u0: 70.6, u1: 72, ys: [[F1, 2.6]] }]);
  wall(B, M.white, 'x', 69.2, 69.4, 40, X1 - T, F1, 3.2, [{ u0: 41, u1: 42.3, ys: [[F1, 2.6]] }]);
  doorUnit(B, 'z', 39.8, 40, 64.6, 67.6, F1, 2.7, { leaf: null }); doorUnit(B, 'z', 39.8, 40, 70.6, 72, F1, 2.6, { leaf: null }); doorUnit(B, 'x', 69.2, 69.4, 41, 42.3, F1, 2.6, { leaf: null });
  B.box(M.white, 44.25, F1, 69.4, 44.4, 3.2, 73.6);
  stairs(B, M.floor, 'z', 69.4, 1, F1, F2, 44.4, X1 - T, 0.3);
  beamBetween(B, M.beam, V3(44.46, F1 + 1.1, 73.5), V3(44.46, F2 + 0.9, 69.5), 0.05, 0.06);                // 계단 손잡이
  railing(B, M.beamLight, [[44.3, 69.5], [44.3, 73.95], [X1 - T, 73.95]], F2, 1.0);
  // 2층 칸막이: 사쿠라의 방 | 다다미방 | 복도
  wall(B, M.white, 'z', 39.8, 40, Z0 + T, Z1 - T, F2, CE, [{ u0: 65.4, u1: 66.8, ys: [[F2, 5.6]] }, { u0: 71.2, u1: 72.5, ys: [[F2, 5.6]] }]);
  wall(B, M.white, 'x', 68.8, 69, X0 + T, 39.8, F2, CE);
  doorUnit(B, 'z', 39.8, 40, 71.2, 72.5, F2, 5.6, { leaf: 'swing', inward: -1 });
  doorUnit(B, 'z', 39.8, 40, 65.4, 66.8, F2, 5.6, { leaf: 'slide', inward: -1, paper: true });
  // 현관문과 포렴(하루노 집안의 흰 동그라미), 문 위 눈썹지붕, 벽의 문장
  doorUnit(B, 'x', Z1 - T, Z1, 41.5, 42.7, 0.12, 2.4, { leaf: 'swing', inward: -1 });
  noren(B, 'x', Z1 + 0.14, 41.5, 42.7, 2.36, 0.62, ' ○ ', { color: '#b5303a' });
  const pv = V3(0, 0.45, -1.2).normalize();
  tilePanel(B, P.roofS, V3(40.8, 2.65, 77.2), V3(1, 0, 0), pv, 2.6, Math.hypot(0.45, 1.2));
  beamBetween(B, M.beam, V3(42.1, 2.6, 77.2), V3(42.1, 3.05, 76), 2.6, 0.04);
  beamBetween(B, M.beam, V3(40.8, 2.58, 77.2), V3(43.4, 2.58, 77.2), 0.07, 0.12);
  for (const x of [40.95, 43.25]) { beamBetween(B, M.beam, V3(x, 2.1, 76.02), V3(x, 2.56, 77.1), 0.07, 0.09); B.box(M.beam, x - 0.035, 2.0, Z1, x + 0.035, 3.0, Z1 + 0.06, false); }
  const crest = textMat('  ', { w: 256, h: 256, bg: '#b5303a', color: '#b5303a', draw: (g, w, h) => { g.strokeStyle = '#f7f1e6'; g.lineWidth = 26; g.beginPath(); g.arc(w / 2, h / 2, 74, 0, 7); g.stroke(); } });
  B.geo(M.beam, cyl(0.47, 0.47, 0.05, 28).rotateX(PI / 2), mat4(44.3, 1.9, Z1 + 0.03)); B.geo(crest, new THREE.CircleGeometry(0.42, 28), mat4(44.3, 1.9, Z1 + 0.058));
  // 발코니(사쿠라의 방 앞): 마루·난간·받침 기둥·화분
  B.box(M.floorDark, 32.6, 3.2, Z1, 39.4, F2, 77.5);
  railing(B, M.beam, [[32.68, Z1 + 0.06], [32.68, 77.42], [39.32, 77.42], [39.32, Z1 + 0.06]], F2, 1.0);
  for (const x of [32.75, 39.25]) { B.box(M.beam, x - 0.07, 0, 77.28, x + 0.07, 3.2, 77.42); beamBetween(B, M.beam, V3(x, 2.5, 76.02), V3(x, 3.15, 76.9), 0.07, 0.09); }
  B.box(M.beam, 32.6, 3.06, 77.3, 39.4, 3.2, 77.42, false);
  doorUnit(B, 'x', Z1 - T, Z1, 36.6, 38, F2, 5.6, { leaf: 'slide', inward: -1 });
  potOf(B, F.tulR, 33.1, F2, 77.1, 1.1); potOf(B, F.fern, 33.7, F2, 77.15, 1); potOf(B, F.cosP, 38.9, F2, 77.1, 1.1, 1); potOf(B, F.tulY, 38.3, F2, 77.15, 1, 2);
  B.box(M.beam, 34.6, F2, 76.95, 36.2, F2 + 0.2, 77.25, false); B.box(P.soil, 34.63, F2 + 0.16, 76.98, 36.17, F2 + 0.205, 77.22, false);
  for (let i = 0; i < 5; i++) putF(B, [F.cosP, F.cosW, F.cosM][i % 3], 34.8 + i * 0.3, F2 + 0.2, 77.1, i * 1.7, 0.8, 0.1);

  /* 1층 거실 겸 식당 */
  {
    const L = local(B, 36, F1, 66, 0);
    table(L, 1.6, 0.9);
    for (const [u, v, r] of [[-0.4, -0.75, 0], [0.4, -0.75, 0], [-0.4, 0.75, 2], [0.4, 0.75, 2]]) chair(local(B, 36 + u, F1, 66 + v, r), P.red);
    vaseOf(B, R, [F.cosP, F.cosW, F.cosM], 36, F1 + 0.74, 66, 5, 0.9);
    teaSet(L, -0.5, 0.74, 0.05, 2);
    L.put(P.porcelain, G.plate, 0.5, 0.74, 0);                                    // 경단 접시(분홍·흰·풀빛 세 알씩)
    for (const dv of [-0.03, 0.03]) { [P.pink, P.white, P.green].forEach((m, i) => L.put(m, G.ball, 0.455 + i * 0.034, 0.775, dv, 0, 0.017)); L.B.geo(M.beamLight, tube([L.pt(0.43, 0.775, dv), L.pt(0.59, 0.775, dv)], 0.003, 4, true)); }
    B.box(M.tatami, 33.3, F1, 70.2, 38.7, F1 + 0.03, 74.7, false);                // 다다미 자리와 둥근 밥상
    const T2 = local(B, 36, F1 + 0.03, 72.4, 0);
    lowTable(T2, 0.6); teaSet(T2, 0.1, 0.34, 0, 3);
    [[0, -0.95, P.red], [0, 0.95, P.pink], [-0.95, 0, P.blue], [0.95, 0, P.red]].forEach(([u, v, m], i) => T2.put(m, G.zabuton, u, 0.04, v, i * 0.2));
    tansu(local(B, X0 + T, F1, 68.9, 1), 1.5, 0.45, 0.82, 3);
    vaseOf(B, R, [F.tulR, F.tulY, F.tulO], 32.45, F1 + 0.82, 68.5, 5, 1);
    photo(B, teamPhoto('   ', [[0.25, 0.42, '#c9a27a', '#3d5a80', 'spiky'], [0.5, 0.5, '#f29ab5', '#c8283a', 'long'], [0.75, 0.42, '#e8c05a', '#f3efe6', 'long']]), 32.42, F1 + 0.96, 69.3, PI / 2, 0.26, 0.2, 0.2);
    bookcase(local(B, 39.8, F1, 69.1, 3), 1.3, 0.34, 1.8, ['books', 'scrolls', 'books', 'vases'], R);
    kakejiku(B, '春野', 38.3, F1 + 1.75, Z0 + T + 0.01, 0, 0.4, 1.1, P.red);
    potOf(B, F.broad, 32.7, F1, 75.3, 1.8); addCollider(32.5, F1, 75.1, 32.9, F1 + 0.8, 75.5);
    lamp(B, 36, 3.2, 66, glows); lamp(B, 36, 3.2, 72.4, glows);
  }
  /* 부엌 */
  {
    cabinet(local(B, 40.85, F1, Z0 + T, 0), 1.3, 0.6, 0.85, 2, P.steel);
    sinkUnit(local(B, 42.5, F1, Z0 + T, 0), 2.0, 0.6, 0.85);
    cabinet(local(B, 44.35, F1, Z0 + T, 0), 1.7, 0.6, 0.85, 3, P.steel, true);
    B.box(P.steel, 45.2, F1 + 0.81, Z0 + T, X1 - T, F1 + 0.85, 63.8, false); B.box(M.beamLight, 45.2, F1, Z0 + T, X1 - T, F1 + 0.81, 63.8, false);
    const E = local(B, X1 - T, F1, 65.0, 3);
    cabinet(E, 2.4, 0.6, 0.85, 3, P.steel);
    stove(E, 0.1, 0.85, 0.3);
    E.box(M.beamLight, -0.9, 0.85, 0.2, -0.55, 0.87, 0.45); E.box(P.steel, -0.82, 0.87, 0.3, -0.64, 0.875, 0.33); E.box(M.beam, -0.64, 0.87, 0.295, -0.56, 0.885, 0.335);   // 도마와 칼
    for (let i = 0; i < 3; i++) E.put(P.red, G.ball, -0.8 + i * 0.07, 0.9, 0.4, 0, 0.03);
    E.box(M.iron, -0.5, 1.72, 0.02, 0.9, 1.76, 0.05);                               // 걸이 봉에 건 국자·뒤집개
    for (let i = 0; i < 3; i++) { E.box(M.iron, 0.5 + i * 0.14, 1.42, 0.03, 0.51 + i * 0.14, 1.72, 0.04); E.put(P.steel, i === 1 ? G.plate : G.bowl, 0.505 + i * 0.14, 1.4, 0.05, 0, 0.6, PI / 2); }
    E.box(P.steel, -0.35, 1.85, 0, 0.55, 2.0, 0.5); E.box(P.steel, -0.2, 2.0, 0, 0.4, 2.8, 0.3);   // 연기 덮개
    const N = local(B, 40.85, F1, Z0 + T, 0);                                       // 벽 선반의 그릇
    for (const y of [1.45, 1.8]) { N.box(M.beam, -0.6, y - 0.03, 0, 0.6, y, 0.26); for (const u of [-0.5, 0.5]) N.box(M.beam, u - 0.015, y - 0.16, 0, u + 0.015, y - 0.03, 0.2); }
    for (let i = 0; i < 4; i++) { for (let j = 0; j < 3; j++) N.put(P.porcelain, G.bowl, -0.42 + i * 0.28, 1.45 + j * 0.022, 0.13); N.put(i % 2 ? P.blue : P.porcelain, G.cup, -0.45 + i * 0.3, 1.8, 0.12, 0, 1.2); }
    N.put(P.white, lathe([[0, 0], [0.12, 0], [0.13, 0.12], [0.1, 0.2], [0.03, 0.22], [0, 0.22]], 12), -0.3, 0.85, 0.3);   // 밥솥
    N.put(P.steel, G.teapot, 0.3, 0.85, 0.3, 2.2, 1.6);
    fridge(local(B, X1 - T, F1, 68.4, 3), 0.8, 0.7, 1.75);
    lamp(B, 42.6, 3.2, 66.4, glows);
  }
  /* 현관과 복도 */
  {
    const S = local(B, X1 - T, 0.12, 75.2, 3);
    cabinet(S, 1.0, 0.38, 0.9, 2);
    potOf(B, F.fern, 45.55, 1.02, 75.5, 0.8);
    [[41.0, 74.85, 0.1, P.blue], [43.2, 74.9, -0.2, P.blue], [43.9, 74.85, 0.15, P.red]].forEach(([x, z, r, m]) => { for (const s of [-1, 1]) B.put(m, G.sandal, x + s * 0.07, 0.12, z, PI + r + s * 0.06); });
    B.box(M.beam, 40.2, F1, 70.0, 40.5, F1 + 0.75, 70.35, false);                 // 작은 받침에 꽃병
    vaseOf(B, R, [F.lily], 40.35, F1 + 0.75, 70.17, 2, 1); addCollider(40.2, F1, 70.0, 40.5, F1 + 0.75, 70.35);
    lamp(B, 42.3, 3.2, 72.4, glows, 0.45);
  }
  /* 2층 — 사쿠라의 방 */
  {
    bed(local(B, 33.45, F2, 69.72, 1), 1.1, 2.0, P.pink);
    const nt = local(B, 34.95, F2, 69.0, 0);
    tansu(nt, 0.5, 0.42, 0.5, 2);
    photo(B, teamPhoto(' ', [[0.2, 0.5, '#f2c530', '#e87a1e', 'spiky'], [0.4, 0.5, '#f29ab5', '#c8283a', 'long'], [0.6, 0.5, '#1c1c28', '#2f4f8f', 'spiky'], [0.82, 0.36, '#c9cdd3', '#4a6a48', 'mask']]), 34.95, F2 + 0.63, 69.2, 0, 0.32, 0.24, 0.22);
    bookcase(local(B, 36.9, F2, 69.0, 0), 1.5, 0.34, 1.9, ['books', 'scrolls', 'books', 'books', 'scrolls'], R);
    wardrobe(local(B, 39.8, F2, 69.95, 3), 1.4, 0.6, 2.0);
    cheval(local(B, 39.78, F2, 73.5, 3));
    const D = local(B, 32.62, F2, 72.25, 1);
    desk(D, 1.5, 0.65); chair(local(B, 33.4, F2, 72.25, 3), P.pink);
    D.box(P.paper, -0.17, 0.74, -0.1, -0.005, 0.755, 0.14); D.box(P.paper, 0.005, 0.74, -0.1, 0.17, 0.755, 0.14); D.box(P.red, -0.18, 0.738, -0.11, 0.18, 0.743, 0.15);   // 펼친 의학서
    for (let i = 0; i < 4; i++) D.box(P.books[i], -0.66 + i * 0.012, 0.74 + i * 0.04, -0.05 - i * 0.008, -0.44 + i * 0.01, 0.778 + i * 0.04, 0.24);                    // 쌓아 둔 책
    scrollAt(local(B, 32.45, F2 + 0.77, 71.75, 0), 0, 0, 0, 0); scrollAt(local(B, 32.52, F2 + 0.77, 71.68, 0), 0, 0, 0, 1); scrollAt(local(B, 32.48, F2 + 0.822, 71.715, 0), 0, 0, 0, 2);
    D.put(P.blue, G.cup, 0.35, 0.74, -0.22, 0, 1.3); for (let i = 0; i < 3; i++) D.B.geo(P.books[i], tube([D.pt(0.345 + i * 0.01, 0.75, -0.22), D.pt(0.33 + i * 0.02, 0.9, -0.23 + i * 0.01)], 0.004, 4, true));
    D.put(P.red, G.deskLamp, -0.6, 0.74, -0.22, -0.6); D.put(P.glow, G.ball, -0.5, 1.02, -0.16, 0, 0.022);
    D.flora((x, y, z) => vaseOf(B, R, [F.cosP, F.cosW], x, y, z, 3, 0.6, P.pink), 0.2, 0.74, -0.2);
    D.put(P.red, new THREE.TorusGeometry(0.045, 0.006, 4, 12).rotateX(PI / 2), 0.3, 0.747, 0.12);       // 붉은 머리띠
    B.put(P.pink, G.tableTop, 36.4, F2 + 0.004, 72.7, 0, [1.15, 0.3, 1.15]); B.put(P.white, G.tableTop, 36.4, F2 + 0.005, 72.7, 0, [0.9, 0.32, 0.9]); B.put(P.pink, G.tableTop, 36.4, F2 + 0.006, 72.7, 0, [0.8, 0.34, 0.8]);   // 둥근 깔개
    { const Lt = local(B, 36.4, F2 + 0.006, 72.7, 0); lowTable(Lt, 0.45, 0.32);                                      // 깔개 위 낮은 상: 읽던 책과 찻잔, 경단
      Lt.box(P.books[0], -0.25, 0.32, -0.1, -0.05, 0.35, 0.18); Lt.box(P.paper, -0.245, 0.325, -0.095, -0.045, 0.345, 0.175); Lt.put(P.porcelain, G.cup, 0.12, 0.32, -0.12);
      Lt.put(P.porcelain, G.plate, 0.15, 0.32, 0.14, 0, 0.8); [P.pink, P.white, P.green].forEach((m, i) => Lt.put(m, G.ball, 0.115 + i * 0.034, 0.35, 0.14, 0, 0.017)); }
    B.put(P.pink, G.zabuton, 35.55, F2 + 0.06, 73.0, 0.4); B.put(P.red, G.zabuton, 37.2, F2 + 0.06, 72.3, 1.1, 0.8);
    curtains(B, 'z', X0 + T + 0.16, 71, 73.5, 5.85, 1.75, P.pinkC, 1); curtains(B, 'x', Z1 - T - 0.16, 33.4, 35.8, 5.85, 1.75, P.pinkC, -1);
    B.geo(crest, new THREE.PlaneGeometry(0.6, 0.6), mat4(38.6, F2 + 1.7, 69.012));
    potOf(B, F.roseP, 32.5, F2, 75.4, 1.3); potOf(B, F.broad, 39.4, F2, 75.4, 1.5); addCollider(39.2, F2, 75.2, 39.6, F2 + 0.7, 75.6);
    lamp(B, 36.2, CE, 72.6, glows);
  }
  /* 2층 — 다다미방(부모의 방) */
  {
    B.box(M.tatami, X0 + T, F2, Z0 + T, 39.8, F2 + 0.02, 68.8, false);
    const T2 = local(B, 35.4, F2 + 0.02, 66, 0);
    lowTable(T2, 0.5); teaSet(T2, 0, 0.34, 0, 2);
    T2.put(P.blue, G.zabuton, -0.85, 0.04, 0); T2.put(P.red, G.zabuton, 0.85, 0.04, 0);
    tansu(local(B, 34.2, F2, 68.8, 2), 1.3, 0.45, 1.05, 4);
    vaseOf(B, R, [F.lily, F.roseW], 34.2, F2 + 1.05, 68.55, 3, 1, P.blue);
    for (let i = 0; i < 3; i++) B.put(i === 2 ? P.blue : P.white, G.futon, 38.4, F2 + 0.1 + i * 0.15, 63.95, 0);       // 개어 둔 이부자리
    B.put(P.white, G.pillow, 38.4, F2 + 0.56, 63.95, 0.2); addCollider(37.6, F2, 63.4, 39.2, F2 + 0.55, 64.5);
    kakejiku(B, '桜花爛漫', 37.4, F2 + 1.55, Z0 + T + 0.01, 0);
    // 사방등(나무 살에 종이)
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.box(M.beam, 32.8 + dx * 0.13 - 0.012, F2, 63.8 + dz * 0.13 - 0.012, 32.8 + dx * 0.13 + 0.012, F2 + 0.75, 63.8 + dz * 0.13 + 0.012, false);
    for (const y of [0.2, 0.72]) B.box(M.beam, 32.66, F2 + y, 63.66, 32.94, F2 + y + 0.025, 63.94, false);
    B.box(M.shoji, 32.68, F2 + 0.225, 63.68, 32.92, F2 + 0.72, 63.92, false); glows.push([32.8, F2 + 0.5, 63.8, 0.7]);
    lamp(B, 35.4, CE, 66, glows);
  }
  /* 2층 복도 */
  {
    cabinet(local(B, 42.5, F2, Z0 + T, 0), 1.4, 0.4, 0.8, 2);
    vaseOf(B, R, [F.sun, F.sun, F.cosW], 42.5, F2 + 0.8, 63.4, 3, 1.1, P.terra);
    potOf(B, F.fern, 40.5, F2, 75.3, 1.6); addCollider(40.3, F2, 75.1, 40.7, F2 + 0.6, 75.5);
    photo(B, teamPhoto('   ', [[0.25, 0.42, '#c9a27a', '#3d5a80', 'spiky'], [0.5, 0.5, '#f29ab5', '#c8283a', 'long'], [0.75, 0.42, '#e8c05a', '#f3efe6', 'long']]), 40.012, F2 + 1.6, 69.6, PI / 2, 0.5, 0.38);
    lamp(B, 42.3, CE, 67, glows);
  }

  /* 마당: 낮은 돌담과 대문 기둥·문패, 디딤돌, 꽃밭, 우편함 */
  const gx0 = 28.4, gx1 = 49.6, gz0 = 58.4, gz1 = 82.6;
  for (const [a, b, c, d] of [[gx0, gz0, gx0 + 0.3, gz1], [gx1 - 0.3, gz0, gx1, gz1], [gx0, gz0, gx1, gz0 + 0.3], [gx0, gz1 - 0.3, 41.0, gz1], [43.2, gz1 - 0.3, gx1, gz1]]) {
    B.box(M.stone, a, 0, b, c, 0.85, d); B.box(M.concrete, a - 0.04, 0.85, b - 0.04, c + 0.04, 0.93, d + 0.04, false);
  }
  for (const x of [40.89, 43.31]) { B.box(M.beam, x - 0.14, 0, gz1 - 0.36, x + 0.14, 1.75, gz1 + 0.06); B.prism(P.roofS, 'z', [[x - 0.2, 1.75], [x + 0.2, 1.75], [x, 1.9]], gz1 - 0.42, gz1 + 0.12); }
  signBoard(B, '春野', 40.89, 1.25, gz1 + 0.085, 0, 0.13, 0.36, { vertical: true, both: false, depth: 0.03 });
  for (let i = 0; i < 6; i++) B.put(M.pave, G.stone, 42.1 + (i % 2 ? 0.14 : -0.12), 0, 81.7 - i * 0.82, i * 1.3, [1 + (i % 3) * 0.12, 1, 0.9 + (i % 2) * 0.2]);
  B.box(P.soil, 33, 0, 77.8, 39.6, 0.07, 78.6, false);
  for (let x = 33; x < 39.6; x += 0.33) for (const z of [77.77, 78.6]) B.put(M.stone, G.pebble, x + 0.16, 0.03, z, x, [0.15, 0.09, 0.1]);
  for (let i = 0; i < 20; i++) putF(B, [F.cosP, F.cosW, F.cosM, F.tulR, F.tulY][i % 5], 33.2 + i * 0.32, 0.06, 78.0 + (i % 3) * 0.2, R() * 6, 0.85 + R() * 0.3, 0.12);
  B.box(P.soil, 44.6, 0, 76.1, 45.9, 0.07, 76.8, false);
  for (let i = 0; i < 4; i++) putF(B, F.sun, 44.8 + i * 0.3, 0.06, 76.4 + (i % 2) * 0.15, PI + (R() - 0.5), 1.25 + R() * 0.3, 0.1);
  B.box(M.beam, 43.75, 0, 81.75, 43.85, 1.05, 81.85); B.box(P.red, 43.62, 1.05, 81.66, 43.98, 1.3, 81.94, false); B.box(P.black, 43.68, 1.2, 81.94, 43.92, 1.22, 81.945, false);
  B.prism(P.red, 'z', [[43.58, 1.3], [44.02, 1.3], [43.8, 1.4]], 81.62, 81.98);

  out.places.push(
    { n: '사쿠라의 집', t: '하루노 집안의 2층 살림집. 포렴과 벽에 집안 문장인 흰 동그라미가 그려져 있다.', b: [gx0, gx1, gz0, gz1] },
    { n: '사쿠라네 현관', t: '신을 벗고 마루로 올라선다.', b: [40, 45.8, 69.4, 75.8], y: [0, 3.2] },
    { n: '사쿠라네 거실', t: '식탁과 다다미 자리의 둥근 밥상. 접시에는 삼색 경단.', b: [32.2, 39.8, 63.2, 75.8], y: [0, 3.2] },
    { n: '사쿠라네 부엌', t: '개수대와 화구, 그릇 선반.', b: [40, 45.8, 63.2, 69.2], y: [0, 3.2] },
    { n: '사쿠라의 방', t: '의학서와 두루마리가 쌓인 책상, 머리맡에는 7반 사진.', b: [32.2, 39.8, 69, 75.8], y: [F2, TOP] },
    { n: '다다미방', t: '사쿠라의 부모 메부키와 키자시가 쓰는 방.', b: [32.2, 39.8, 63.2, 68.8], y: [F2, TOP] },
    { n: '사쿠라네 2층 복도', t: '계단을 오르면 왼쪽이 사쿠라의 방이다.', b: [40, 45.8, 63.2, 75.8], y: [F2, TOP] },
    { n: '사쿠라의 발코니', t: '사쿠라가 골목을 내다보는 자리.', b: [32.6, 39.4, 76, 77.5], y: [F2, TOP] },
  );
  out.jumps.push(['사쿠라의 집 앞', 42.1, 0, 81.5, 0, 40], ['사쿠라의 방', 37.6, F2, 73.6, 1.0, 41]);
  out.lights.push([36, 2.6, 69.5, 15, 17], [42.4, 2.6, 68.5, 14, 15], [36.2, 5.5, 72.4, 14, 15], [39.6, 5.5, 66, 13, 15]);
}

/* ============================ 쵸지의 집 ============================
   아키미치 집안의 2층 살림집(집 좌표: x 0~16, z 0~13, 남쪽이 앞). 아버지 쵸자가 일족의 우두머리라 여느 집보다 크고, 무엇보다 식당과 부엌이 넓다.
   1층: 큰 식당(긴 식탁·다다미 자리) | 부엌 | 현관과 계단 / 2층: 쵸지의 방 | 부모의 다다미방 | 복도. 집 안 꾸밈은 원작에 없어 일족의 특징에서 지어냈다. */
function buildChoji(B, R, out) {
  const X0 = 0, X1 = 16, Z0 = 0, Z1 = 13, T = 0.2, F1 = 0.4, F2 = 3.4, CE = 6.1, TOP = 6.2, wl = P.cream;
  const { glows } = out;
  const yel = mat('plain', 0xe8b83a), orange = mat('plain', 0xd9722a);
  // 아키미치 문장(원 안에 세로줄 셋과 엇갈린 빗금)
  const crest = textMat('   ', { w: 256, h: 256, bg: '#f3ead6', color: '#f3ead6', draw: (g, w, h) => {
    g.strokeStyle = '#1a1410'; g.lineWidth = 24; g.beginPath(); g.arc(w / 2, h / 2, 104, 0, 7); g.stroke();
    g.save(); g.beginPath(); g.arc(w / 2, h / 2, 104, 0, 7); g.clip(); g.lineWidth = 22;
    for (const [a, b, c, d] of [[128, 10, 128, 246], [62, 46, 62, 210], [194, 46, 194, 210], [62, 46, 194, 210], [194, 46, 62, 210]]) { g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); }
    g.restore();
  } });
  // 바깥벽(아래위층 한 번에)과 창
  side(B, wl, 'x', Z0, Z0 + T, X0, X1, 0, TOP, -1, [[2, 4.5, 1.3, 2.7], [2, 4.5, 4.3, 5.7], [6, 8.5, 1.3, 2.7], [6, 8.5, 4.3, 5.7], [11.5, 13.5, 1.5, 2.6], [11.5, 13.5, 4.3, 5.7]]);
  side(B, wl, 'x', Z1 - T, Z1, X0, X1, 0, TOP, 1, [[1.4, 3.8, 1.3, 2.7], [1.4, 3.8, 4.3, 5.7], [5.6, 8, 1.3, 2.7], [5.6, 8, 4.3, 5.7], [11.5, 12.7, 0, 2.4, 'd'], [11.5, 12.7, 4.3, 5.7]]);
  side(B, wl, 'z', X0, X0 + T, Z0 + T, Z1 - T, 0, TOP, -1, [[2, 4, 1.3, 2.7], [2, 4, 4.3, 5.7], [7.6, 10, 1.3, 2.7], [7.6, 10, 4.3, 5.7]]);
  side(B, wl, 'z', X1 - T, X1, Z0 + T, Z1 - T, 0, TOP, 1, [[2, 4, 1.5, 2.6], [2, 4, 4.3, 5.7], [7.6, 9.4, 3.0, 4.6]]);
  trim(B, X0, Z0, X1, Z1, TOP, [3.12, TOP - 0.16]);
  for (const [a, b, c, d] of [[X0 - 0.05, Z0 - 0.05, X1 + 0.05, Z0], [X0 - 0.05, Z0, X0, Z1], [X1, Z0, X1 + 0.05, Z1], [X0 - 0.05, Z1, 11.4, Z1 + 0.05], [12.8, Z1, X1 + 0.05, Z1 + 0.05]]) B.box(M.stone, a, 0, b, c, 0.45, d, false);
  gableRoof(B, P.roofS, X0, Z0, X1, Z1, TOP, 2.8, { ridge: 'x', gable: wl });

  // 바닥: 1층 마루, 현관(신발 벗는 낮은 자리), 2층 마루(계단 구멍), 천장
  B.box(M.floor, X0 + T, 0, Z0 + T, 10, F1, Z1 - T); B.box(M.floor, 10, 0, Z0 + T, X1 - T, F1, 11.5);
  B.box(M.pave, 10, 0, 11.5, X1 - T, 0.12, Z1 - T); B.box(M.beam, 10, 0.12, 11.47, X1 - T, F1 + 0.025, 11.53, false);
  B.box(M.pave, 11.1, 0, Z1 - T - 0.02, 13.1, 0.135, 14.2);
  B.box(M.floor, X0 + T, 3.2, Z0 + T, 14.4, F2, Z1 - T); B.box(M.floor, 14.4, 3.2, Z0 + T, X1 - T, F2, 6.4); B.box(M.floor, 14.4, 3.2, 10.9, X1 - T, F2, Z1 - T);
  B.box(M.beamLight, X0 + T, CE, Z0 + T, X1 - T, TOP, Z1 - T);
  // 1층 칸막이: 식당 | 부엌·현관, 부엌 | 현관. 계단은 동쪽 벽을 따라 북으로 오른다
  wall(B, M.white, 'z', 9.8, 10, Z0 + T, Z1 - T, F1, 3.2, [{ u0: 2.2, u1: 5.2, ys: [[F1, 2.7]] }, { u0: 8.6, u1: 10, ys: [[F1, 2.6]] }]);
  wall(B, M.white, 'x', 6.2, 6.4, 10, X1 - T, F1, 3.2, [{ u0: 11, u1: 12.3, ys: [[F1, 2.6]] }]);
  doorUnit(B, 'z', 9.8, 10, 2.2, 5.2, F1, 2.7, { leaf: null }); doorUnit(B, 'z', 9.8, 10, 8.6, 10, F1, 2.6, { leaf: null }); doorUnit(B, 'x', 6.2, 6.4, 11, 12.3, F1, 2.6, { leaf: null });
  B.box(M.white, 14.25, F1, 6.4, 14.4, 3.2, 10.6);
  stairs(B, M.floor, 'z', 6.4, 1, F1, F2, 14.4, X1 - T, 0.3);
  beamBetween(B, M.beam, V3(14.46, F1 + 1.1, 10.5), V3(14.46, F2 + 0.9, 6.5), 0.05, 0.06);
  railing(B, M.beamLight, [[14.3, 6.5], [14.3, 10.95], [X1 - T, 10.95]], F2, 1.0);
  // 2층 칸막이: 쵸지의 방(남서) | 부모의 다다미방(북서) | 복도(동)
  wall(B, M.white, 'z', 9.8, 10, Z0 + T, Z1 - T, F2, CE, [{ u0: 2.4, u1: 3.8, ys: [[F2, 5.6]] }, { u0: 8.2, u1: 9.5, ys: [[F2, 5.6]] }]);
  wall(B, M.white, 'x', 5.8, 6, X0 + T, 9.8, F2, CE);
  doorUnit(B, 'z', 9.8, 10, 8.2, 9.5, F2, 5.6, { leaf: 'swing', inward: -1 });
  doorUnit(B, 'z', 9.8, 10, 2.4, 3.8, F2, 5.6, { leaf: 'slide', inward: -1, paper: true });
  // 현관문과 포렴(食), 문 위 눈썹지붕, 벽의 문장
  doorUnit(B, 'x', Z1 - T, Z1, 11.5, 12.7, 0.12, 2.4, { leaf: 'swing', inward: -1 });
  noren(B, 'x', Z1 + 0.14, 11.5, 12.7, 2.36, 0.62, ' 食 ', { color: '#b5303a' });
  const pv = V3(0, 0.45, -1.2).normalize();
  tilePanel(B, P.roofS, V3(10.8, 2.65, 14.2), V3(1, 0, 0), pv, 2.6, Math.hypot(0.45, 1.2));
  beamBetween(B, M.beam, V3(12.1, 2.6, 14.2), V3(12.1, 3.05, 13), 2.6, 0.04);
  beamBetween(B, M.beam, V3(10.8, 2.58, 14.2), V3(13.4, 2.58, 14.2), 0.07, 0.12);
  for (const x of [10.95, 13.25]) { beamBetween(B, M.beam, V3(x, 2.1, 13.02), V3(x, 2.56, 14.1), 0.07, 0.09); B.box(M.beam, x - 0.035, 2.0, Z1, x + 0.035, 3.0, Z1 + 0.06, false); }
  B.geo(M.beam, cyl(0.52, 0.52, 0.05, 28).rotateX(PI / 2), mat4(9.6, 1.95, Z1 + 0.03)); B.geo(crest, new THREE.CircleGeometry(0.47, 28), mat4(9.6, 1.95, Z1 + 0.058));

  /* 1층 식당: 여덟이 앉는 긴 식탁에 그릇이 그득하다 */
  {
    const L = local(B, 5, F1, 4.3, 0);
    table(L, 3.6, 1.25);
    for (const u of [-1.3, -0.45, 0.45, 1.3]) { chair(local(B, 5 + u, F1, 4.3 - 0.95, 0), P.red); chair(local(B, 5 + u, F1, 4.3 + 0.95, 2), P.red); }
    for (let i = 0; i < 8; i++) {   // 자리마다 밥그릇과 접시, 가운데에는 큰 접시들
      const u = [-1.3, -0.45, 0.45, 1.3][i % 4], v = i < 4 ? -0.4 : 0.4;
      L.put(P.porcelain, G.bowl, u - 0.12, 0.74, v); L.put(P.white, G.ball, u - 0.12, 0.79, v, 0, 0.05); L.put(P.porcelain, G.plate, u + 0.14, 0.74, v, 0, 0.8);
    }
    for (let i = 0; i < 5; i++) { const u = -1.4 + i * 0.7; L.put(P.blue, G.plate, u, 0.74, 0, 0, 1.25); for (let k = 0; k < 5; k++) L.put([orange, P.terra, yel, P.green, P.red][(i + k) % 5], G.ball, u + Math.cos(k * 1.26) * 0.07, 0.775, Math.sin(k * 1.26) * 0.07, 0, 0.032); }
    L.put(M.beamLight, cyl(0.2, 0.17, 0.2, 14), 1.72, 0.84, 0); L.put(M.beam, cyl(0.21, 0.21, 0.03, 14), 1.72, 0.955, 0);   // 밥통
    teaSet(L, -1.72, 0.74, 0, 2);
    B.box(M.tatami, 0.6, F1, 8.2, 6.6, F1 + 0.03, 12.5, false);                    // 다다미 자리와 둥근 밥상
    const T2 = local(B, 3.6, F1 + 0.03, 10.4, 0);
    lowTable(T2, 0.7); teaSet(T2, -0.2, 0.34, 0.1, 3);
    T2.put(P.terra, G.bowl, 0.25, 0.34, -0.1, 0, 1.8); for (let k = 0; k < 6; k++) T2.put(yel, G.ball, 0.25 + Math.cos(k) * 0.05, 0.4, -0.1 + Math.sin(k) * 0.05, 0, 0.03);   // 과자 그릇
    [[0, -1.05, P.red], [0, 1.05, orange], [-1.05, 0, P.red], [1.05, 0, orange]].forEach(([u, v, m], i) => T2.put(m, G.zabuton, u, 0.04, v, i * 0.2, 1.15));
    tansu(local(B, X0 + T, F1, 6.6, 1), 1.6, 0.45, 0.82, 3);
    photo(B, teamPhoto('    ', [[0.2, 0.44, '#2a2420', '#5a6b4a', 'tail'], [0.45, 0.5, '#9a5a32', '#b5303a', 'big'], [0.72, 0.46, '#e8c860', '#6a4a8a', 'pony']]), 0.42, F1 + 0.98, 6.4, PI / 2, 0.3, 0.22, 0.2);
    bookcase(local(B, 9.8, F1, 6.6, 3), 1.5, 0.34, 1.8, ['books', 'pots', 'books', 'vases'], R);
    kakejiku(B, '食', 5, F1 + 1.75, Z0 + T + 0.01, 0, 0.42, 1.0, P.red);
    potOf(B, F.broad, 0.7, F1, 12.3, 1.8); addCollider(0.5, F1, 12.1, 0.9, F1 + 0.8, 12.5);
    lamp(B, 3.6, 3.2, 4.3, glows); lamp(B, 6.6, 3.2, 4.3, glows); lamp(B, 3.6, 3.2, 10.4, glows);
  }
  /* 부엌: 개수대와 화구, 냉장고 둘, 쌀자루 무지 */
  {
    cabinet(local(B, 10.85, F1, Z0 + T, 0), 1.3, 0.6, 0.85, 2, P.steel);
    sinkUnit(local(B, 12.5, F1, Z0 + T, 0), 2.0, 0.6, 0.85);
    cabinet(local(B, 14.35, F1, Z0 + T, 0), 1.7, 0.6, 0.85, 3, P.steel, true);
    B.box(P.steel, 15.2, F1 + 0.81, Z0 + T, X1 - T, F1 + 0.85, 0.8, false); B.box(M.beamLight, 15.2, F1, Z0 + T, X1 - T, F1 + 0.81, 0.8, false);
    const E = local(B, X1 - T, F1, 2.4, 3);
    cabinet(E, 3.0, 0.6, 0.85, 4, P.steel);
    stove(E, -0.6, 0.85, 0.3); stove(E, 0.5, 0.85, 0.3);
    E.box(P.steel, -1.0, 1.85, 0, 0.9, 2.0, 0.5); E.box(P.steel, -0.4, 2.0, 0, 0.3, 2.8, 0.3);        // 연기 덮개
    E.box(M.iron, -1.3, 1.72, 0.02, 1.3, 1.76, 0.05);                                                  // 걸이 봉에 건 국자·그릇
    for (let i = 0; i < 5; i++) { E.box(M.iron, -1.1 + i * 0.5, 1.42, 0.03, -1.09 + i * 0.5, 1.72, 0.04); E.put(P.steel, i % 2 ? G.plate : G.bowl, -1.095 + i * 0.5, 1.4, 0.05, 0, 0.6, PI / 2); }
    const N = local(B, 10.85, F1, Z0 + T, 0);                                                          // 벽 선반의 그릇
    for (const y of [1.45, 1.8]) { N.box(M.beam, -0.6, y - 0.03, 0, 0.6, y, 0.26); for (const u of [-0.5, 0.5]) N.box(M.beam, u - 0.015, y - 0.16, 0, u + 0.015, y - 0.03, 0.2); }
    for (let i = 0; i < 4; i++) { for (let j = 0; j < 5; j++) N.put(P.porcelain, G.bowl, -0.42 + i * 0.28, 1.45 + j * 0.022, 0.13); N.put(i % 2 ? P.blue : P.porcelain, G.cup, -0.45 + i * 0.3, 1.8, 0.12, 0, 1.2); }
    N.put(P.white, lathe([[0, 0], [0.16, 0], [0.17, 0.16], [0.13, 0.26], [0.04, 0.28], [0, 0.28]], 12), -0.3, 0.85, 0.3);   // 큰 밥솥
    fridge(local(B, 13.3, F1, 6.2, 2), 0.85, 0.7, 1.8); fridge(local(B, 14.3, F1, 6.2, 2), 0.85, 0.7, 1.8);
    for (let i = 0; i < 5; i++) B.put(P.kraft, G.sack, 15.2, F1 + 0.1 + (i >> 1) * 0.2, 4.6 + (i % 2) * 0.5 + (i === 4 ? 0.25 : 0), PI / 2);   // 쌀자루
    addCollider(14.8, F1, 4.3, 15.7, F1 + 0.7, 5.5);
    lamp(B, 12.8, 3.2, 3.2, glows);
  }
  /* 현관과 복도 */
  {
    const S = local(B, X1 - T, 0.12, 12.2, 3);
    cabinet(S, 1.0, 0.38, 0.9, 2);
    [[11.0, 11.85, 0.1, P.blue, 1.35], [10.6, 11.9, -0.1, P.red, 1.1], [13.3, 11.9, -0.2, orange, 1.2]].forEach(([x, z, r, m, s]) => { for (const k of [-1, 1]) B.put(m, G.sandal, x + k * 0.08 * s, 0.12, z, PI + r + k * 0.06, s); });
    B.geo(M.beamLight, cyl(0.03, 0.03, 2.3, 8), mat4(10.3, 1.25, 12.55, 0, 0, 0.12));                 // 문간에 세워 둔 봉
    lamp(B, 12.3, 3.2, 9.2, glows, 0.45);
  }
  /* 2층 — 쵸지의 방: 침대와 책상, 과자 봉지가 여기저기 */
  {
    bed(local(B, 1.5, F2, 6.78, 1), 1.35, 2.0, P.green);
    const nt = local(B, 3.0, F2, 6.0, 0);
    tansu(nt, 0.5, 0.42, 0.5, 2);
    photo(B, teamPhoto('     ', [[0.16, 0.5, '#2a2420', '#5a6b4a', 'tail'], [0.38, 0.52, '#9a5a32', '#b5303a', 'big'], [0.6, 0.5, '#e8c860', '#6a4a8a', 'pony'], [0.84, 0.36, '#2a2420', '#4a6a48', 'spiky']]), 3.0, F2 + 0.63, 6.2, 0, 0.32, 0.24, 0.22);
    bookcase(local(B, 5.2, F2, 6.0, 0), 1.6, 0.34, 1.9, ['books', 'rolls', 'books', 'scrolls', 'books'], R);
    wardrobe(local(B, 9.8, F2, 7.0, 3), 1.5, 0.6, 2.0);
    const D = local(B, 0.62, F2, 9.9, 1);
    desk(D, 1.5, 0.65); chair(local(B, 1.4, F2, 9.9, 3), P.red);
    // 과자 봉지: 책상 위, 침대 옆, 깔개 위
    const bag = (x, y, z, ry, m, s = 1) => B.put(m, G.sack, x, y + 0.09 * s, z, ry, [0.36 * s, 0.9 * s, 0.6 * s]);
    bag(0.5, F2 + 0.74, 9.6, 0.4, yel, 0.9); bag(0.55, F2 + 0.74, 10.3, -0.3, P.red, 0.9);
    [[2.5, 7.9, 0.2, yel], [2.8, 8.3, 1.1, P.red], [2.4, 8.5, 2.0, orange], [5.3, 9.9, 0.7, yel], [6.3, 10.6, 2.6, P.red]].forEach(([x, z, r, m]) => bag(x, F2, z, r, m));
    B.put(P.green, G.tableTop, 5.8, F2 + 0.004, 10.2, 0, [1.3, 0.3, 1.3]); B.put(P.white, G.tableTop, 5.8, F2 + 0.005, 10.2, 0, [1.05, 0.32, 1.05]);   // 둥근 깔개
    { const Lt = local(B, 5.8, F2 + 0.006, 10.2, 0); lowTable(Lt, 0.5, 0.32);
      Lt.put(P.terra, G.bowl, 0, 0.32, 0, 0, 2.2); for (let k = 0; k < 9; k++) Lt.put(yel, G.disc, Math.cos(k * 0.7) * 0.07, 0.37 + k * 0.006, Math.sin(k * 0.7) * 0.07, k, 0.045, 0.3);   // 감자칩 그릇
      Lt.put(P.porcelain, G.cup, 0.3, 0.32, -0.15); }
    B.put(P.red, G.zabuton, 4.8, F2 + 0.06, 10.6, 0.4, 1.15); B.put(orange, G.zabuton, 6.8, F2 + 0.06, 9.8, 1.1, 1.15);
    // 벽에 건 봉과 닌자 조끼 걸이
    B.geo(M.beamLight, cyl(0.028, 0.028, 2.3, 8).rotateX(PI / 2), mat4(9.74, F2 + 1.75, 11.2)); for (const z of [10.3, 12.1]) B.box(M.beam, 9.68, F2 + 1.68, z - 0.02, 9.8, F2 + 1.72, z + 0.02, false);
    B.geo(crest, new THREE.PlaneGeometry(0.7, 0.7), mat4(7.6, F2 + 1.7, 6.012));
    potOf(B, F.broad, 0.6, F2, 12.4, 1.5); addCollider(0.4, F2, 12.2, 0.8, F2 + 0.7, 12.6);
    lamp(B, 5, CE, 9.6, glows);
  }
  /* 2층 — 부모의 다다미방: 개어 둔 이부자리, 쵸자의 붉은 갑옷 걸이 */
  {
    B.box(M.tatami, X0 + T, F2, Z0 + T, 9.8, F2 + 0.02, 5.8, false);
    const T2 = local(B, 4.4, F2 + 0.02, 3, 0);
    lowTable(T2, 0.55); teaSet(T2, 0, 0.34, 0, 2);
    T2.put(P.red, G.zabuton, -0.95, 0.04, 0, 0, 1.2); T2.put(orange, G.zabuton, 0.95, 0.04, 0, 0, 1.2);
    tansu(local(B, 2.2, F2, 5.8, 2), 1.4, 0.45, 1.05, 4);
    for (let i = 0; i < 4; i++) B.put(i % 2 ? P.red : P.white, G.futon, 8.4, F2 + 0.1 + i * 0.15, 0.95, 0, 1.1);
    B.put(P.white, G.pillow, 8.4, F2 + 0.72, 0.95, 0.2); addCollider(7.5, F2, 0.4, 9.3, F2 + 0.7, 1.5);
    kakejiku(B, '秋道', 5.25, F2 + 1.55, Z0 + T + 0.01, 0, 0.36, 1.1);
    // 갑옷 걸이: 나무 틀에 붉은 가슴판과 어깨판, 허리 밧줄
    { const A = local(B, 0.75, F2, 1.0, 1);
      A.box(M.beam, -0.03, 0, -0.03, 0.03, 1.5, 0.03); A.box(M.beam, -0.3, 0, -0.2, 0.3, 0.05, 0.2); A.box(M.beam, -0.42, 1.38, -0.025, 0.42, 1.44, 0.025);
      A.box(P.red, -0.36, 0.72, -0.17, 0.36, 1.38, 0.17); A.box(P.black, -0.37, 0.98, -0.175, 0.37, 1.02, 0.175); A.box(P.black, -0.37, 1.2, -0.175, 0.37, 1.24, 0.175);
      for (const s of [-1, 1]) A.box(P.red, s * 0.52 - 0.14, 1.12, -0.19, s * 0.52 + 0.14, 1.46, 0.19);
      A.box(P.kraft, -0.38, 0.62, -0.19, 0.38, 0.72, 0.19); A.put(crest, new THREE.CircleGeometry(0.13, 20), 0, 1.1, 0.176);
      A.col(-0.6, 0, -0.25, 0.6, 1.5, 0.25); }
    lamp(B, 4.4, CE, 3, glows);
  }
  /* 2층 복도 */
  {
    cabinet(local(B, 12.5, F2, Z0 + T, 0), 1.4, 0.4, 0.8, 2);
    vaseOf(B, R, [F.sun, F.sun, F.cosW], 12.5, F2 + 0.8, 0.4, 3, 1.1, P.terra);
    potOf(B, F.fern, 10.5, F2, 12.3, 1.6); addCollider(10.3, F2, 12.1, 10.7, F2 + 0.6, 12.5);
    lamp(B, 12.3, CE, 4, glows);
  }

  /* 마당: 낮은 돌담과 대문 기둥·문패, 디딤돌, 봉 치는 말뚝, 텃밭 */
  const gx0 = -3.6, gx1 = 19.6, gz0 = -3.6, gz1 = 19.2;
  for (const [a, b, c, d] of [[gx0, gz0, gx0 + 0.3, gz1], [gx1 - 0.3, gz0, gx1, gz1], [gx0, gz0, gx1, gz0 + 0.3], [gx0, gz1 - 0.3, 11.0, gz1], [13.2, gz1 - 0.3, gx1, gz1]]) {
    B.box(M.stone, a, 0, b, c, 0.85, d); B.box(M.concrete, a - 0.04, 0.85, b - 0.04, c + 0.04, 0.93, d + 0.04, false);
  }
  for (const x of [10.89, 13.31]) { B.box(M.beam, x - 0.14, 0, gz1 - 0.36, x + 0.14, 1.75, gz1 + 0.06); B.prism(P.roofS, 'z', [[x - 0.2, 1.75], [x + 0.2, 1.75], [x, 1.9]], gz1 - 0.42, gz1 + 0.12); }
  signBoard(B, '秋道', 10.89, 1.25, gz1 + 0.085, 0, 0.13, 0.36, { vertical: true, both: false, depth: 0.03 });
  for (let i = 0; i < 6; i++) B.put(M.pave, G.stone, 12.1 + (i % 2 ? 0.14 : -0.12), 0, 18.3 - i * 0.78, i * 1.3, [1 + (i % 3) * 0.12, 1, 0.9 + (i % 2) * 0.2]);
  for (const x of [3.2, 5.6]) { B.geo(M.beam, cyl(0.16, 0.18, 1.9, 12), mat4(x, 0.95, 16.4)); for (const y of [0.8, 1.2, 1.6]) B.geo(P.kraft, new THREE.TorusGeometry(0.175, 0.03, 5, 14).rotateX(PI / 2), mat4(x, y, 16.4)); addCollider(x - 0.2, 0, 16.2, x + 0.2, 1.9, 16.6); }   // 봉 치는 말뚝
  B.box(P.soil, 14.4, 0, 14.6, 18.8, 0.07, 18.2, false);                                              // 텃밭
  for (let i = 0; i < 24; i++) putF(B, i % 3 ? F.fern : F.broad, 14.8 + (i % 6) * 0.72, 0.06, 15.0 + Math.floor(i / 6) * 0.95, R() * 6, 0.5 + R() * 0.2);

  out.places.push(
    { n: '쵸지의 집', t: '아키미치 집안의 2층 살림집. 아버지 쵸자가 일족의 우두머리다. 포렴에 먹을 식(食) 자.', b: [gx0, gx1, gz0, gz1] },
    { n: '쵸지네 현관', t: '신을 벗고 마루로 올라선다. 문간에 봉이 세워져 있다.', b: [10, 15.8, 6.4, 12.8], y: [0, 3.2] },
    { n: '쵸지네 식당', t: '여덟이 둘러앉는 긴 식탁. 이 집에서는 밥상이 곧 집의 한가운데다.', b: [0.2, 9.8, 0.2, 12.8], y: [0, 3.2] },
    { n: '쵸지네 부엌', t: '화구 넷에 냉장고 둘, 구석에는 쌀자루.', b: [10, 15.8, 0.2, 6.2], y: [0, 3.2] },
    { n: '쵸지의 방', t: '과자 봉지가 여기저기 놓인 방. 머리맡에는 10반 사진, 벽에는 봉.', b: [0.2, 9.8, 6, 12.8], y: [F2, TOP] },
    { n: '쵸지네 다다미방', t: '쵸지의 부모가 쓰는 방. 구석에 쵸자의 붉은 갑옷이 걸려 있다.', b: [0.2, 9.8, 0.2, 5.8], y: [F2, TOP] },
    { n: '쵸지네 2층 복도', t: '계단을 오르면 왼쪽 안쪽이 쵸지의 방이다.', b: [10, 15.8, 0.2, 12.8], y: [F2, TOP] },
  );
  out.jumps.push(['쵸지의 집 앞', 12.1, 0, 18.4, 0, 55], ['쵸지의 방', 7.2, F2, 11.2, 0.9, 56]);
  out.lights.push([5, 2.6, 6.5, 16, 18], [12.6, 2.6, 4.5, 14, 15], [5, 5.5, 9.4, 14, 15], [4.6, 5.5, 3, 13, 15]);
}

/* ============================ 이노의 집 — 야마나카 꽃집 ============================ */
function buildIno(B, R, out) {
  const X0 = -25, X1 = -11, Z0 = 41, Z1 = 55, T = 0.2, F1 = 0.2, F2 = 3.2, CE = 5.9, TOP = 6.0, wl = M.white;
  const { glows } = out;
  // 바깥벽. 동쪽(큰길 쪽) 1층은 가게 앞을 넓게 텄다
  side(B, wl, 'x', Z0, Z0 + T, X0, X1, 0, TOP, -1, [[-23, -21, 1.2, 2.4], [-17, -14, 4.1, 5.5]]);
  side(B, wl, 'x', Z1 - T, Z1, X0, X1, 0, TOP, 1, [[-24.2, -22.4, 1.2, 2.4], [-24.2, -22.4, 4.1, 5.5], [-17, -14, 4.1, 5.5]]);
  side(B, wl, 'z', X0, X0 + T, Z0 + T, Z1 - T, 0, TOP, -1, [[42, 44, 4.1, 5.5], [46.5, 48.5, 2.9, 4.4], [51.5, 53.5, 1.2, 2.4], [51.5, 53.5, 4.1, 5.5]]);
  wall(B, wl, 'z', X1 - T, X1, Z0 + T, Z1 - T, 0, 3.0, [{ u0: 43, u1: 53, ys: [[0, 2.7]] }]);
  side(B, wl, 'z', X1 - T, X1, Z0 + T, Z1 - T, 3.0, TOP, 1, [[43, 46, 4.1, 5.5], [50, 53, 4.1, 5.5]]);
  B.box(M.beam, X1 - T - 0.03, 2.64, 42.9, X1 + 0.03, 2.95, 53.1, false);   // 인방은 구멍 윗면(2.7)보다 내려온다
  for (const z of [46.33, 49.67]) B.box(M.beam, X1 - T - 0.01, 0, z - 0.09, X1 + 0.01, 2.7, z + 0.09);
  for (const [za, zb] of [[42.82, 43.03], [52.97, 53.18]]) B.box(M.beam, X1 - T - 0.02, 0, za, X1 + 0.02, 2.7, zb, false);   // 문설주는 구멍 옆면보다 안으로 들어온다
  trim(B, X0, Z0, X1, Z1, TOP, [2.96, TOP - 0.16]);
  for (const [a, b, c, d] of [[X0 - 0.05, Z0 - 0.05, X1 + 0.05, Z0], [X0 - 0.05, Z1, X1 + 0.05, Z1 + 0.05], [X0 - 0.05, Z0, X0, Z1]]) B.box(M.stone, a, 0, b, c, 0.4, d, false);
  gableRoof(B, P.roofI, X0, Z0, X1, Z1, TOP, 2.4, { ridge: 'z', gable: wl });

  // 바닥: 가게(판석)·작업실(마루), 가게 앞 진열 자리, 2층 마루(계단 구멍), 천장
  B.box(M.pave, -18, 0, Z0 + T, X1, F1, Z1 - T); B.box(M.floorDark, X0 + T, 0, Z0 + T, -18, F1, Z1 - T);
  B.box(M.pave, X1, 0, 41.5, -9.0, 0.1, 54.5);
  B.box(M.floor, -23.4, 3.0, Z0 + T, X1 - T, F2, Z1 - T); B.box(M.floor, X0 + T, 3.0, Z0 + T, -23.4, F2, 45.6); B.box(M.floor, X0 + T, 3.0, 50.1, -23.4, F2, Z1 - T);
  B.box(M.beamLight, X0 + T, CE, Z0 + T, X1 - T, TOP, Z1 - T);
  for (const z of [46.33, 49.67]) B.box(M.beam, -18, 2.78, z - 0.09, X1 - T, 3.0, z + 0.09, false);       // 가게 천장 보
  // 가게 | 작업실 칸막이와 포렴, 계단(서쪽 벽을 따라 북으로 오른다)
  wall(B, M.white, 'z', -18.2, -18, Z0 + T, Z1 - T, F1, 3.0, [{ u0: 47, u1: 48.4, ys: [[F1, 2.4]] }]);
  doorUnit(B, 'z', -18.2, -18, 47, 48.4, F1, 2.4, { leaf: null });
  noren(B, 'z', -17.93, 47, 48.4, 2.36, 0.75, ' 花 ', { color: '#6f52a8' });
  B.box(M.white, -23.4, F1, 45.6, -23.25, 3.0, 49.8);
  stairs(B, M.floorDark, 'z', 45.6, 1, F1, F2, X0 + T, -23.4, 0.3);
  beamBetween(B, M.beam, V3(-23.46, F1 + 1.1, 49.7), V3(-23.46, F2 + 0.9, 45.7), 0.05, 0.06);
  railing(B, M.beamLight, [[-23.3, 45.7], [-23.3, 50.15], [X0 + T, 50.15]], F2, 1.0);
  // 2층 칸막이: 복도 | 거실(북)·이노의 방(남)
  wall(B, M.white, 'z', -21.6, -21.4, Z0 + T, Z1 - T, F2, CE, [{ u0: 43, u1: 44.3, ys: [[F2, 5.4]] }, { u0: 51, u1: 52.3, ys: [[F2, 5.4]] }]);
  wall(B, M.white, 'x', 48, 48.2, -21.4, X1 - T, F2, CE);
  doorUnit(B, 'z', -21.6, -21.4, 51, 52.3, F2, 5.4, { leaf: 'swing', inward: 1 });
  doorUnit(B, 'z', -21.6, -21.4, 43, 44.3, F2, 5.4, { leaf: 'slide', inward: 1, paper: true });

  // 가게 앞 눈썹지붕(기와)과 받침 기둥, 간판
  const av = V3(-2.1, 0.55, 0).normalize();
  tilePanel(B, P.roofI, V3(-8.9, 2.5, 54.6), V3(0, 0, -1), av, 13.2, Math.hypot(2.1, 0.55));
  beamBetween(B, M.beam, V3(-8.9, 2.46, 48), V3(-11, 3.01, 48), 13.2, 0.04);
  beamBetween(B, M.beam, V3(-8.9, 2.43, 41.4), V3(-8.9, 2.43, 54.6), 0.08, 0.14);
  beamBetween(B, M.beam, V3(-9.05, 2.34, 41.5), V3(-9.05, 2.34, 54.5), 0.1, 0.12);
  for (const z of [41.6, 46.33, 49.67, 54.4]) B.box(M.beam, -9.12, 0, z - 0.07, -8.98, 2.3, z + 0.07);
  for (let z = 41.6; z < 54.5; z += 1.066) beamBetween(B, M.beam, V3(-8.95, 2.36, z), V3(-11, 2.9, z), 0.06, 0.09);   // 서까래 윗면이 밑널과 겹치지 않게 조금 내린다
  signBoard(B, 'やまなか花', -10.95, 3.6, 48, PI / 2, 4.4, 0.74, { color: '#5a3a94', bg: '#f7f1e2', font: 'gothic', both: false });
  B.box(M.beam, X1, 4.92, 42.17, -10.0, 4.99, 42.23, false);
  for (const x of [-10.72, -10.28]) B.geo(M.iron, tube([V3(x, 4.92, 42.2), V3(x, 4.74, 42.2)], 0.006, 4, false));
  signBoard(B, '花', -10.5, 4.42, 42.2, 0, 0.6, 0.6, { round: true, color: '#f7f1e2', bg: '#6f52a8', pad: 0.2 });

  /* 1층 — 꽃가게 */
  const bk = (kinds, n, s = 1.1) => (x, y, z) => bucketOf(B, R, kinds, x, y, z, n, s);
  const pt = (plant, s = 1) => (x, y, z) => potOf(B, plant, x, y, z, s, R() * 6);
  {
    // 북쪽·남쪽 벽의 층층 진열대: 뒷단 화분, 가운뎃단·앞단 꽃 양동이
    const rowsN = [[pt(F.fern, 1.1), pt(F.broad, 1.1), pt(F.tulR, 1.1), pt(F.fern, 1.1)], [bk([F.cosP, F.cosW, F.cosM], 4), bk([F.tulY, F.tulR, F.tulO], 5, 1)], [bk([F.roseR], 4), bk([F.roseP, F.roseW], 4)]];
    const rowsS = [[pt(F.broad, 1.1), pt(F.tulY, 1.1), pt(F.fern, 1.1)], [bk([F.lily], 3), bk([F.roseW, F.roseP], 4)], [bk([F.cosM, F.cosP], 4), bk([F.tulO, F.tulY], 5, 1)]];
    for (const [L, w, rows] of [[local(B, -14.5, F1, Z0 + T, 0), 5.4, rowsN], [local(B, -14.1, F1, Z1 - T, 2), 4.6, rowsS]]) {
      stand(L, w).forEach((t, i) => { let k = 0; for (let u = -w / 2 + 0.3; u < w / 2 - 0.15; u += 0.56, k++) L.flora(rows[i][k % rows[i].length], u, t.y, t.v); });
    }
    // 가운데 낮은 단: 키 큰 꽃(해바라기·백합)
    const C = local(B, -14.6, F1, 48, 0);
    for (const v of [-0.95, 0, 0.95]) crate(C, 0, v, 1.5, 0.9, 0.34);
    C.col(-0.78, 0, -1.42, 0.78, 0.9, 1.42);
    [[-0.38, -1.1, [F.sun], 3], [0.38, -1.1, [F.lily], 3], [-0.38, -0.4, [F.lily, F.roseW], 4], [0.38, -0.4, [F.sun], 3], [-0.38, 0.4, [F.sun], 3], [0.38, 0.4, [F.roseR, F.roseP], 4], [-0.38, 1.1, [F.roseP], 4], [0.38, 1.1, [F.lily], 3]]
      .forEach(([u, v, kinds, n]) => C.flora(bk(kinds, n, 1.2), u, 0.34, v));
    // 계산대: 금전 등록기, 포장지 걸이, 리본 타래, 포장한 꽃다발, 장미 한 송이
    const K = local(B, -16.6, F1, 51.1, 1);
    cabinet(K, 2.6, 0.6, 0.95, 4, M.beam);
    K.box(P.black, -0.95, 0.95, 0.12, -0.6, 1.05, 0.5); K.box(P.steel, -0.93, 1.05, 0.14, -0.62, 1.15, 0.46); K.box(P.steel, -0.93, 1.15, 0.34, -0.62, 1.3, 0.46); K.box(P.glow, -0.9, 1.19, 0.335, -0.65, 1.27, 0.34);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) K.box(P.white, -0.9 + i * 0.07, 1.15, 0.17 + j * 0.05, -0.85 + i * 0.07, 1.162, 0.205 + j * 0.05);
    K.box(P.brass, -0.82, 0.98, 0.115, -0.73, 1.0, 0.12);
    for (const u of [0.42, 1.08]) K.box(M.beam, u - 0.015, 0.95, 0.12, u + 0.015, 1.42, 0.18);       // 포장지 두루마리 걸이
    [[P.pink, 1.06], [P.kraft, 1.2], [P.white, 1.34]].forEach(([m, y]) => { K.put(m, G.roll, 0.75, y, 0.15, 0, 1, 0, PI / 2); K.put(M.beam, G.rollCore, 0.75, y, 0.15, 0, 1.12, 0, PI / 2); });
    K.box(P.pink, 0.5, 0.955, 0.19, 1.0, 1.05, 0.194); K.box(P.pink, 0.5, 0.952, 0.19, 1.0, 0.956, 0.5);
    [[P.red, 0.1], [P.purple, 0.19], [P.fY, 0.28]].forEach(([m, u]) => K.put(m, cyl(0.035, 0.035, 0.03, 12), u, 0.965, 0.2));   // 리본 타래
    K.box(P.steel, 0.12, 0.95, 0.38, 0.3, 0.956, 0.4); K.box(P.red, 0.26, 0.95, 0.36, 0.36, 0.962, 0.42);                          // 가위
    K.flora((x, y, z) => { B.put(P.fP, G.cone, x, y + 0.18, z); bunch(B, R, [F.roseR, F.roseW, F.roseP], x, y + 0.02, z, 5, 0.32, 0.6, 0.01); B.put(P.red, cyl(0.03, 0.03, 0.03, 10), x, y + 0.08, z); B.put(P.steel, G.cup, x, y, z, 0, 1.6); }, -0.25, 0.95, 0.32);
    K.flora((x, y, z) => vaseOf(B, R, [F.roseR], x, y, z, 1, 0.7), -0.42, 0.95, 0.12);
    K.put(M.beamLight, G.tableTop, 0.2, 0.5, -0.5, 0, [0.17, 1, 0.17]); for (let i = 0; i < 3; i++) K.box(M.beamLight, 0.2 + Math.cos(i * 2.1) * 0.11 - 0.018, 0, -0.5 + Math.sin(i * 2.1) * 0.11 - 0.018, 0.2 + Math.cos(i * 2.1) * 0.11 + 0.018, 0.48, -0.5 + Math.sin(i * 2.1) * 0.11 + 0.018);
    // 벽 선반(꽃병·빈 화분), 물뿌리개, 천장에 매단 화분
    bookcase(local(B, -18, F1, 44.4, 1), 2.4, 0.36, 1.9, ['pots', 'vases', 'pots', 'vases'], R);
    B.put(P.green, G.can, -16.9, F1, 46.3, 0.7, 1.2); B.put(P.brass, G.can, -12.1, F1, 53.1, 2.4, 1.1);
    for (const [x, z, f] of [[-13.2, 44.6, F.trail], [-13.2, 51.4, F.trail], [-16.3, 48, F.fern]]) {
      for (let i = 0; i < 3; i++) B.geo(M.iron, tube([V3(x, 3.0, z), V3(x + Math.cos(i * 2.1) * 0.11, 2.42, z + Math.sin(i * 2.1) * 0.11)], 0.004, 3, false));
      potOf(B, f, x, 2.25, z, 1.15);
    }
    lamp(B, -14.6, 3.0, 45.2, glows, 0.4); lamp(B, -14.6, 3.0, 50.8, glows, 0.4);
  }
  /* 가게 앞 진열(눈썹지붕 아래): 궤짝 위와 바닥의 양동이·화분, 세움 간판 */
  for (const [zc, kindsA, kindsB] of [[44.6, [F.sun], [F.cosP, F.cosW, F.cosM]], [51.4, [F.lily, F.roseP], [F.tulR, F.tulY, F.tulO]]]) {
    const A = local(B, -10.1, 0.1, zc, 1);
    for (const u of [-0.85, 0.85]) crate(A, u, -0.3, 1.5, 0.55, 0.4);
    for (let i = 0; i < 5; i++) A.flora(bk(i % 2 ? [F.roseR, F.roseW] : kindsA, i % 2 ? 4 : 3, 1.15), -1.4 + i * 0.7, 0.4, -0.3);
    for (let i = 0; i < 5; i++) A.flora(i % 3 === 2 ? pt(i === 2 ? F.fern : F.broad, 1.25) : bk(kindsB, 4, 1.05), -1.5 + i * 0.75, 0, 0.32);
    A.col(-1.7, 0, -0.6, 1.7, 0.95, 0.5);
  }
  B.put(P.green, G.can, -9.75, 0.1, 47.0, -0.8, 1.15);
  {
    const sg = textMat('本日の花', { w: 192, h: 320, bg: '#2c3a30', color: '#f1ecd8', vertical: true, pad: 0.16 });
    for (const s of [-1, 1]) { const m = mat4(-9.7, 0.55, 49.1 + s * 0.14, s * 0.22, 0, 0); B.geo(M.beam, new THREE.BoxGeometry(0.56, 0.95, 0.03), m); B.geo(sg, new THREE.PlaneGeometry(0.46, 0.76), m.clone().multiply(mat4(0, 0.04, s * 0.016, 0, s > 0 ? 0 : PI, 0))); }
    addCollider(-10, 0.1, 48.9, -9.4, 1.0, 49.3);
  }

  /* 1층 뒤 — 작업실·창고 */
  {
    const Wt = local(B, -20.6, F1, 51.6, 0);
    table(Wt, 2.0, 0.95, 0.85, M.beam);
    [[P.pink, -0.5, -0.2, 0.3], [P.kraft, -0.45, 0.05, -0.2], [P.white, -0.55, 0.28, 0.1]].forEach(([m, u, v, r]) => { Wt.put(m, G.roll, u, 0.895, v, r, 1, 0, PI / 2); Wt.put(P.kraft, G.rollCore, u, 0.895, v, r, 1, 0, PI / 2); });
    Wt.box(P.pink, -0.1, 0.851, -0.3, 0.5, 0.854, 0.3);                               // 펼쳐 둔 포장지 위에 손질하던 꽃
    Wt.flora((x, y, z) => { B.put(P.fW, G.cone, x, y + 0.18, z); bunch(B, R, [F.cosP, F.roseW, F.cosM], x, y + 0.02, z, 5, 0.32, 0.6, 0.01); B.put(P.zinc, G.cup, x, y, z, 0, 1.6); }, 0.75, 0.85, -0.2);
    Wt.box(P.steel, 0.1, 0.855, 0.05, 0.3, 0.86, 0.07); Wt.box(P.purple, 0.25, 0.855, 0.02, 0.36, 0.866, 0.1);
    [[P.red, 0.6], [P.purple, 0.7], [P.green, 0.8]].forEach(([m, u]) => Wt.put(m, cyl(0.035, 0.035, 0.03, 12), u, 0.865, 0.3));
    Wt.put(P.kraft, G.ball, 0.2, 0.89, 0.3, 0, 0.04);                                  // 노끈 뭉치
    sinkUnit(local(B, -20.4, F1, Z0 + T, 0), 1.8, 0.6, 0.85);
    bucketOf(B, R, [F.lily, F.sun], -19.2, F1, 41.7, 4, 1.2); bucketOf(B, R, [F.tulR, F.tulY], -18.75, F1, 42.3, 5, 1.1);
    bookcase(local(B, -20.0, F1, Z1 - T, 2), 3.0, 0.4, 2.0, ['pots', 'rolls', 'vases', 'pots'], R, M.beamLight);
    for (let i = 0; i < 3; i++) B.put(P.kraft, G.sack, -24.25, F1 + 0.1 + i * 0.17, 53.9 - (i % 2) * 0.06, PI / 2 + i * 0.1);         // 흙 자루
    B.put(P.kraft, G.sack, -24.2, F1 + 0.1, 53.1, 1.2); addCollider(-24.75, F1, 52.7, -23.8, F1 + 0.6, 54.3);
    for (let i = 0; i < 5; i++) B.put(P.zinc, G.bucket, -24.3, F1 + i * 0.07, 44.9, i, 1.1);                                           // 포개 둔 빈 양동이
    for (let i = 0; i < 4; i++) B.put(P.zinc, G.bucket, -24.25, F1 + i * 0.07, 44.2, i * 2, 1.1);
    const Cr = local(B, -24.2, F1, 42.6, 0);
    crate(Cr, 0, -0.5, 0.9, 0.6, 0.4); crate(Cr, 0, -0.5, 0.9, 0.6, 0.4, 0.4); crate(Cr, 0, 0.3, 0.9, 0.6, 0.4);
    for (let i = 0; i < 3; i++) Cr.flora(pt(null, 0.9), -0.25 + i * 0.25, 0.4, 0.3);
    addCollider(-24.75, F1, 41.7, -23.6, F1 + 0.8, 45.2);
    B.put(P.brass, G.can, -19.0, F1, 49.5, 2.0, 1.1);
    lamp(B, -20.8, 3.0, 47.6, glows, 0.4);
  }
  /* 2층 — 이노의 방 */
  {
    bed(local(B, -12.3, F2, 54.15, 3), 1.1, 2.0, P.purple);
    const nt = local(B, -13.75, F2, Z1 - T, 2);
    tansu(nt, 0.5, 0.42, 0.5, 2);
    photo(B, teamPhoto('    ', [[0.18, 0.36, '#3a3028', '#4a6a48', 'spiky'], [0.4, 0.5, '#f0d66a', '#8466b5', 'pony'], [0.6, 0.5, '#1c1c28', '#6b7a70', 'tail'], [0.83, 0.48, '#b5652a', '#c8283a', 'big']]), -13.75, F2 + 0.63, 54.55, PI, 0.32, 0.24, 0.22);
    dresser(local(B, -14.8, F2, 48.2, 0), P.purple);
    vaseOf(B, R, [F.lily], -15.22, F2 + 0.7, 48.5, 2, 0.75);
    wardrobe(local(B, -21.4, F2, 49.6, 1), 1.4, 0.6, 2.0);
    const D = local(B, -16.6, F2, 54.42, 2);
    desk(D, 1.5, 0.65); chair(local(B, -16.6, F2, 53.65, 0), P.purple);
    // 꽃꽂이(수반에 침봉을 놓고 꽂은 꽃), 꽃 도감, 꽃가위
    D.put(P.black, lathe([[0, 0], [0.13, 0], [0.16, 0.04], [0.15, 0.045], [0.12, 0.015], [0, 0.015]], 16), -0.35, 0.74, -0.08);
    D.flora((x, y, z) => { putF(B, F.lily, x, y + 0.015, z, 2.6, 0.75, 0.12); putF(B, F.roseP, x + 0.03, y + 0.015, z + 0.02, 0.5, 0.6, 0.5); putF(B, F.cosW, x - 0.04, y + 0.015, z, 4, 0.5, 0.75); putF(B, F.trail, x, y + 0.02, z - 0.02, 1, 0.25); }, -0.35, 0.74, -0.08);
    D.box(P.books[2], 0.05, 0.74, -0.15, 0.27, 0.775, 0.15); D.box(P.paper, 0.06, 0.745, -0.14, 0.275, 0.77, 0.14); D.box(P.steel, 0.4, 0.74, 0, 0.56, 0.746, 0.02); D.box(P.purple, 0.5, 0.74, -0.03, 0.6, 0.752, 0.05);
    D.put(P.purple, G.deskLamp, 0.62, 0.74, -0.2, 2.4); D.put(P.glow, G.ball, 0.52, 1.02, -0.13, 0, 0.022);
    bookcase(local(B, -21.4, F2, 53.6, 1), 1.4, 0.32, 1.5, ['books', 'vases', 'books', 'pots'], R, M.beamLight);
    B.put(P.purple, G.tableTop, -16.4, F2 + 0.004, 51.2, 0, [1.3, 0.3, 1.3]); B.put(P.white, G.tableTop, -16.4, F2 + 0.005, 51.2, 0, [1.05, 0.32, 1.05]); B.put(P.purple, G.tableTop, -16.4, F2 + 0.006, 51.2, 0, [0.95, 0.34, 0.95]);
    { const Lt = local(B, -16.4, F2 + 0.006, 51.2, 0); lowTable(Lt, 0.5, 0.32);                                      // 깔개 위 낮은 상: 꽃병과 찻잔
      Lt.flora((x, y, z) => vaseOf(B, R, [F.roseP, F.roseW, F.cosM], x, y, z, 4, 0.7, P.purple), -0.1, 0.32, -0.1); Lt.put(P.porcelain, G.cup, 0.2, 0.32, 0.1); Lt.put(P.porcelain, G.cup, 0.05, 0.32, 0.25); }
    B.put(P.pink, G.zabuton, -17.3, F2 + 0.06, 51.5, 0.5); B.put(P.purple, G.zabuton, -15.5, F2 + 0.06, 50.8, 1.2);
    B.put(P.porcelain, G.vase, -11.8, F2, 48.8, 0, 2.2); bunch(B, R, [F.sun, F.sun, F.lily], -11.8, F2 + 0.08, 48.8, 5, 0.12, 1.25, 0.01); addCollider(-12.05, F2, 48.55, -11.55, F2 + 0.8, 49.05);
    potOf(B, F.broad, -18.2, F2, 48.75, 1.7); addCollider(-18.4, F2, 48.55, -18, F2 + 0.7, 48.95);
    curtains(B, 'z', X1 - T - 0.16, 50, 53, 5.65, 1.75, P.purpleC, -1); curtains(B, 'x', Z1 - T - 0.16, -17, -14, 5.65, 1.75, P.purpleC, -1);
    // 벽에 건 누름꽃 액자
    for (let i = 0; i < 3; i++) {
      const pm = textMat(' '.repeat(5 + i), { w: 128, h: 160, bg: '#f4eedd', color: '#f4eedd', draw: (g, w, h) => { const cs = ['#d6457a', '#e8a21e', '#7a55b0']; for (let k = 0; k < 6; k++) { g.fillStyle = cs[i]; g.beginPath(); g.ellipse(w / 2 + Math.cos(k * 1.047) * 22, h * 0.36 + Math.sin(k * 1.047) * 22, 16, 9, k * 1.047, 0, 7); g.fill(); } g.fillStyle = '#e8c63a'; g.beginPath(); g.arc(w / 2, h * 0.36, 9, 0, 7); g.fill(); g.strokeStyle = '#4f8f3e'; g.lineWidth = 5; g.beginPath(); g.moveTo(w / 2, h * 0.5); g.quadraticCurveTo(w / 2 + 14, h * 0.7, w / 2 - 4, h * 0.92); g.stroke(); } });
      photo(B, pm, -19.8 + i * 0.55, F2 + 1.7, 48.212, 0, 0.3, 0.38);
    }
    lamp(B, -16.4, CE, 51.2, glows);
  }
  /* 2층 — 거실(다다미) */
  {
    B.box(M.tatami, -21.4, F2, Z0 + T, X1 - T, F2 + 0.02, 48, false);
    const T2 = local(B, -16.2, F2 + 0.02, 44.7, 0);
    lowTable(T2, 0.65); teaSet(T2, -0.15, 0.34, 0.1, 3);
    T2.flora((x, y, z) => vaseOf(B, R, [F.cosP, F.cosM, F.cosW], x, y, z, 4, 0.7, P.blue), 0.3, 0.34, -0.15);
    [[0, -1.0, P.purple], [-1.0, 0.2, P.blue], [1.0, 0.2, P.green]].forEach(([u, v, m], i) => T2.put(m, G.zabuton, u, 0.04, v, i * 0.25));
    tansu(local(B, -20.2, F2, Z0 + T, 0), 1.6, 0.45, 1.1, 4);
    B.put(P.blue, G.vase, -20.2, F2 + 1.1, 41.45, 0, 1.3); bunch(B, R, [F.sun, F.lily, F.sun], -20.2, F2 + 1.14, 41.45, 3, 0.14, 0.8, 0.01);
    // 도코노마: 한 단 높인 널, 족자, 꽃꽂이
    B.box(M.beam, -13.2, F2, Z0 + T, -11.4, F2 + 0.12, 42.0, false); B.box(M.beam, -13.3, F2, Z0 + T, -13.2, CE, 41.32, false);
    kakejiku(B, '花鳥風月', -12.3, F2 + 1.6, Z0 + T + 0.012, 0, 0.42, 1.2, P.purple);
    B.put(P.black, G.bowl, -12.3, F2 + 0.12, 41.65, 0, 2); putF(B, F.lily, -12.3, F2 + 0.16, 41.65, 0.4, 0.8, 0.1); putF(B, F.roseR, -12.26, F2 + 0.16, 41.68, 2, 0.6, 0.55); putF(B, F.cosW, -12.34, F2 + 0.16, 41.66, 4.2, 0.55, 0.6);
    bookcase(local(B, -14.2, F2, 48, 2), 1.8, 0.32, 0.9, ['books', 'scrolls'], R);
    photo(B, teamPhoto('     ', [[0.25, 0.4, '#e9d27a', '#5a6a58', 'pony'], [0.52, 0.5, '#f0d66a', '#8466b5', 'pony'], [0.78, 0.42, '#c9a27a', '#b4a0c8', 'long']]), -14.6, F2 + 1.06, 47.8, PI, 0.3, 0.22, 0.2);
    potOf(B, F.fern, -13.7, F2 + 0.93, 47.8, 0.9);
    lamp(B, -16.2, CE, 44.7, glows);
  }
  /* 2층 복도 */
  {
    cabinet(local(B, -23.3, F2, Z1 - T, 2), 1.4, 0.4, 0.8, 2);
    B.put(P.terra, G.vase, -23.3, F2 + 0.8, 54.55, 0, 1.1); bunch(B, R, [F.tulR, F.tulY, F.tulO], -23.3, F2 + 0.84, 54.55, 5, 0.12, 0.7, 0.01);
    potOf(B, F.broad, -24.3, F2, 41.7, 1.7); addCollider(-24.5, F2, 41.5, -24.1, F2 + 0.7, 41.9);
    lamp(B, -22.6, CE, 52.5, glows, 0.5);
  }

  out.places.push(
    { n: '야마나카 꽃집', t: '이노의 집. 1층은 꽃가게, 2층은 살림집이다. 간판에는 "やまなか花".', b: [-28, -7, 38, 58] },
    { n: '꽃가게', t: '양동이마다 장미·백합·해바라기·코스모스·튤립. 계산대 옆에는 포장지 두루마리.', b: [-18, -9, 41.2, 54.8], y: [0, 3.0] },
    { n: '꽃집 작업실', t: '꽃을 다듬고 포장하는 뒷방. 빈 화분과 흙 자루가 쌓여 있다.', b: [-24.8, -18, 41.2, 54.8], y: [0, 3.0] },
    { n: '이노의 방', t: '화장대와 꽃꽂이, 머리맡에는 이노·시카·쵸 10반 사진.', b: [-21.4, -11.2, 48.2, 54.8], y: [F2, TOP] },
    { n: '야마나카네 거실', t: '다다미 거실. 도코노마에는 "花鳥風月" 족자와 꽃꽂이.', b: [-21.4, -11.2, 41.2, 48], y: [F2, TOP] },
    { n: '야마나카네 2층 복도', t: '계단을 올라 왼쪽이 거실, 오른쪽 끝이 이노의 방.', b: [-24.8, -21.6, 41.2, 54.8], y: [F2, TOP] },
  );
  out.jumps.push(['야마나카 꽃집 앞', -4.5, 0, 48, PI / 2, 42], ['이노의 방', -19.5, F2, 51.6, -PI / 2, 43]);
  out.lights.push([-14.6, 2.5, 48, 16, 17], [-21, 2.5, 48.5, 13, 14], [-16.4, 5.3, 51.3, 14, 15], [-17, 5.3, 44.6, 13, 15]);
}

export function build(scene, ctx) {
  P = palette(); G = makeGeos(); F = makeFlowers();
  const out = { places: [], jumps: [], lights: [], glows: [], skip: [] };
  const B = new Builder();
  if (!ctx.which || ctx.which === 'sakura') buildSakura(B, rng(4101), out);
  if (!ctx.which || ctx.which === 'ino') buildIno(B, rng(4102), out);
  if (ctx.which === 'choji') buildChoji(B, rng(4103), out);
  B.finish(scene);
  return out;
}
