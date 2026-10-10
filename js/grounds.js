// 훈련장 넷 — 제2(섬 있는 못), 제3(통나무 셋과 위령비), 제4(정문 쪽 공원 숲), 제43(동남쪽 담 밑 숲). 마을 좌표로 바로 짓는다.
// 원작(기억)에서 가져온 것: 제3 훈련장의 통나무 셋·위령비·냇물(방울 뺏기 시험을 치른 곳), 물 위를 걷는 수련.
// 지어낸 것: 제2·제4·제43 훈련장의 쓰임새와 놓인 것 모두(원작에는 이름만 나오거나 나오지 않는다), 제3 훈련장의 생김새와 자리, 위령비에 새긴 줄(이름은 적지 않았다).
import * as THREE from '../vendor/three.module.js';
import { Builder, addCollider, mat4, tube } from './build.js';
import { M, mat, textMat } from './materials.js';
import { signBoard } from './arch.js';
import { terrainH } from './village.js';
import { PLAN } from './plan-data.js';
import { OPEN, BARE } from './zones.js';

const PI = Math.PI, V = (x, y, z) => new THREE.Vector3(x, y, z);
const cyl = (rt, rb, h, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg);

// 자리표: 터의 한가운데 [x, z], 반지름, 길에서 들어오는 오솔길의 끝(길 쪽)
export const GROUNDS = {
  g3: { c: [478, 562], r: 15, road: [556, 562] },
  g4: { c: [-120, 640], r: 16, road: [-176, 632] },
  g43: { c: [411, 767], r: 13, road: [438, 789] },
};

export function grounds(scene, out) {
  const B = new Builder(), R = (() => { let s = 4421; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const DIRT = mat('plain', 0xc2a36c, { rough: 0.96, puddles: true }), LOG = mat('wood', 0x7a5a3c), LIGHT = M.beamLight, STRAW = mat('wood', 0xd2b064), WHT = mat('plain', 0xf0ece0), STONE = M.stone;
  const ring = textMat(' ', { w: 256, h: 256, bg: '#f4f0e4', color: '#f4f0e4', draw: (g, w) => { for (const [r, c] of [[0.46, '#b3392b'], [0.36, '#f4f0e4'], [0.27, '#b3392b'], [0.17, '#f4f0e4'], [0.08, '#1d1a16']]) { g.fillStyle = c; g.beginPath(); g.arc(w / 2, w / 2, w * r, 0, 7); g.fill(); } } });
  const bx = (m, w, h, d, x, y, z, ry = 0) => B.geo(m, new THREE.BoxGeometry(w, h, d), mat4(x, y, z, 0, ry, 0));
  const solid = (x, z, r, h, y = 0) => addCollider(x - r, y, z - r, x + r, y + h, z + r);
  const log = (x, z, h, r = 0.2) => { B.geo(LOG, cyl(r * 0.9, r, h, 12), mat4(x, h / 2, z, 0, R() * 6, 0)); B.geo(LIGHT, cyl(r * 0.86, r * 0.86, 0.012, 12), mat4(x, h + 0.004, z)); solid(x, z, r, h); };
  // 과녁: 둥근 널에 붉은 테. ry = 보는 쪽
  const target = (x, y, z, ry, s = 1) => { B.geo(LIGHT, cyl(0.5 * s, 0.5 * s, 0.07, 28).rotateX(PI / 2), mat4(x, y, z, 0, ry, 0)); B.geo(ring, new THREE.CircleGeometry(0.47 * s, 28), mat4(x + Math.sin(ry) * 0.04, y, z + Math.cos(ry) * 0.04, 0, ry, 0)); };
  const targetPost = (x, z, ry, h = 2.3) => { log(x, z, h); for (const y of [1.2, 1.75]) B.geo(STRAW, new THREE.TorusGeometry(0.215, 0.022, 6, 14).rotateX(PI / 2), mat4(x, y, z)); target(x + Math.sin(ry) * 0.26, 1.48, z + Math.cos(ry) * 0.26, ry, 0.8); };
  // 볏짚 허수아비
  const ridged = (r, h, n) => { const p = []; for (let i = 0; i <= n * 3; i++) { const t = i / (n * 3); p.push(new THREE.Vector2(r * (0.93 + 0.07 * Math.abs(Math.sin(t * n * PI))) * (i === 0 || i === n * 3 ? 0.6 : 1), h * t)); } return new THREE.LatheGeometry(p, 10); };
  const gT = ridged(0.17, 0.7, 9), gA = ridged(0.06, 0.9, 12).translate(0, -0.45, 0).rotateZ(-PI / 2), gH = ridged(0.12, 0.26, 4);
  const dummy = (x, z, ry) => { bx(M.beam, 0.7, 0.08, 0.1, x, 0.07, z, ry); bx(M.beam, 0.1, 0.08, 0.7, x, 0.07, z, ry); bx(M.beam, 0.1, 1.5, 0.1, x, 0.78, z, ry); B.geo(STRAW, gT, mat4(x, 0.68, z)); B.geo(STRAW, gA, mat4(x, 1.25, z, 0, ry, 0)); B.geo(STRAW, gH, mat4(x, 1.45, z)); solid(x, z, 0.2, 1.7); };
  const bench = (x, z, ry) => { B.geo(LOG, cyl(0.24, 0.26, 2.4, 10).rotateZ(PI / 2), mat4(x, 0.26, z, 0, ry, 0)); const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry)); addCollider(x - 1.2 * c - 0.26 * s, 0, z - 1.2 * s - 0.26 * c, x + 1.2 * c + 0.26 * s, 0.52, z + 1.2 * s + 0.26 * c); };
  // 들머리 문: 굵은 통나무 둘에 가로대, 이름을 적은 널. ry = 문이 보는 쪽(길 쪽)
  const gate = (x, z, ry, text) => {
    const c = Math.cos(ry), s = Math.sin(ry);
    for (const k of [-1, 1]) { const px = x + k * 2.1 * c, pz = z - k * 2.1 * s; B.geo(LOG, cyl(0.17, 0.2, 3.5, 12), mat4(px, 1.75, pz)); solid(px, pz, 0.2, 3.5); }
    bx(LOG, 5.2, 0.24, 0.24, x, 3.15, z, ry); bx(LOG, 4.6, 0.16, 0.16, x, 2.62, z, ry);
    signBoard(B, text, x, 2.9, z, ry, 2.4, 0.46, { both: true, depth: 0.06, bg: '#e9dcc0' });
  };
  // 흙 마당과 길에서 드는 오솔길: 나무와 풀을 비운다
  const yard = G => {
    const [cx, cz] = G.c, [rx, rz] = G.road, len = Math.hypot(rx - cx, rz - cz), ry = Math.atan2(rx - cx, rz - cz);
    B.geo(DIRT, new THREE.CircleGeometry(G.r, 56).rotateX(-PI / 2), mat4(cx, 0.035, cz));
    bx(DIRT, 2.6, 0.03, len - G.r + 1, (cx + rx) / 2 + Math.sin(ry) * (G.r - 1) / 2, 0.02, (cz + rz) / 2 + Math.cos(ry) * (G.r - 1) / 2, ry);
    OPEN.push([cx, cz, G.r + 2.5]);
    for (let d = G.r; d <= len; d += 4) OPEN.push([cx + Math.sin(ry) * d, cz + Math.cos(ry) * d, 3.6]);
    const ux = Math.sin(ry), uz = Math.cos(ry);
    BARE.push((x, z) => { const dx = x - cx, dz = z - cz; if (dx * dx + dz * dz < (G.r + 0.3) ** 2) return true; const t = dx * ux + dz * uz; return t > 0 && t < len && Math.abs(dx * uz - dz * ux) < 1.5; });
    return { ry, gx: cx + ux * (G.r + 1.5), gz: cz + uz * (G.r + 1.5) };
  };

  /* ================= 제3 훈련장: 통나무 셋과 위령비 ================= */
  {
    const G = GROUNDS.g3, [cx, cz] = G.c, Y = yard(G);
    gate(Y.gx, Y.gz, Y.ry, '第三演習場');
    // 통나무 셋: 가운데 통나무에는 묶었던 밧줄이 감겨 있다
    for (const dz of [-2.3, 0, 2.3]) { B.geo(LOG, cyl(0.27, 0.31, 2.0, 14), mat4(cx - 2, 1.0, cz + dz, 0, R() * 6, 0)); B.geo(LIGHT, cyl(0.26, 0.26, 0.012, 14), mat4(cx - 2, 2.004, cz + dz)); solid(cx - 2, cz + dz, 0.31, 2.0); }
    for (let k = 0; k < 6; k++) B.geo(STRAW, new THREE.TorusGeometry(0.31, 0.03, 6, 16).rotateX(PI / 2), mat4(cx - 2, 0.8 + k * 0.075, cz, 0, R() * 6, 0));
    B.geo(STRAW, tube([V(cx - 1.72, 0.8, cz), V(cx - 1.4, 0.3, cz + 0.2), V(cx - 1.0, 0.06, cz + 0.5), V(cx - 0.5, 0.05, cz + 0.4)], 0.03, 6, true));
    // 도시락 둘(통나무 앞에 놓고 간 것)
    for (const dz of [-2.3, 2.3]) { bx(mat('plain', 0x2b2622), 0.3, 0.07, 0.22, cx - 1.2, 0.075, cz + dz, 0.3); bx(mat('plain', 0xa8382c), 0.31, 0.02, 0.23, cx - 1.2, 0.12, cz + dz, 0.3); }
    // 위령비: 둥근 돌 단 위에, 쿠나이 날처럼 뾰족한 검푸른 돌. 줄지어 새긴 이름들(글자는 적지 않고 새긴 자국만 냈다)
    { const sx = cx - 9.5, sz = cz + 5.5, sry = Math.atan2(cx - sx, cz - sz), DARK = mat('stone', 0x4b5560, { rough: 0.45 });
      B.geo(STONE, cyl(2.5, 2.7, 0.22, 28), mat4(sx, 0.11, sz)); B.geo(STONE, cyl(1.9, 2.0, 0.22, 28), mat4(sx, 0.33, sz)); addCollider(sx - 2.5, 0, sz - 2.5, sx + 2.5, 0.22, sz + 2.5); addCollider(sx - 1.9, 0.22, sz - 1.9, sx + 1.9, 0.44, sz + 1.9);
      const s = new THREE.Shape(); [[-0.55, 0], [0.55, 0], [0.86, 0.75], [0.62, 1.55], [0, 2.25], [-0.62, 1.55], [-0.86, 0.75]].forEach((p, i) => (i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])));
      const g = new THREE.ExtrudeGeometry(s, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.1, bevelSegments: 2 }); g.translate(0, 0, -0.25);
      B.geo(DARK, g, mat4(sx, 0.54, sz, 0, sry, 0)); solid(sx, sz, 0.8, 2.9, 0.44);
      const face = textMat('  ', { w: 256, h: 384, bg: '#3d4650', color: '#3d4650', draw: (c, w, h) => { c.fillStyle = '#aab4bd'; let q = 7; for (let col = 0; col < 7; col++) for (let y = 30; y < h - 30;) { q = (q * 16807) % 2147483647; const l = 14 + (q % 22); c.fillRect(34 + col * 30, y, 4, l); y += l + 7; } } });
      B.geo(face, new THREE.PlaneGeometry(0.78, 1.15), mat4(sx + Math.sin(sry) * 0.362, 1.4, sz + Math.cos(sry) * 0.362, 0, sry, 0));
      // 앞에 놓인 꽃
      const fx = sx + Math.sin(sry) * 1.2, fz = sz + Math.cos(sry) * 1.2;
      B.geo(mat('plain', 0x6f7a80), cyl(0.07, 0.09, 0.24, 10), mat4(fx, 0.56, fz));
      for (let k = 0; k < 5; k++) { const a = k * 1.26, hx = fx + Math.cos(a) * 0.08, hz = fz + Math.sin(a) * 0.08; B.geo(mat('leaf', 0x3f7a3a), cyl(0.008, 0.008, 0.3, 5), mat4(hx, 0.82, hz, Math.sin(a) * 0.25, 0, Math.cos(a) * 0.25)); B.geo(k % 2 ? WHT : mat('plain', 0xe8c23a), new THREE.SphereGeometry(0.05, 8, 6), mat4(fx + Math.cos(a) * 0.12, 0.98, fz + Math.sin(a) * 0.12)); }
      out.places.push({ n: '위령비', t: '임무를 하다 목숨을 잃은 나뭇잎 마을 닌자들의 이름을 새긴 돌. 카카시가 날마다 찾아와 서 있던 곳.', b: [sx - 3, sx + 3, sz - 3, sz + 3] });
    }
    bench(cx + 6, cz - 9, 0.4); for (const [dx, dz, ry] of [[4, 9, PI], [8, 6, -PI / 2 - 0.5]]) targetPost(cx + dx, cz + dz, ry);
    out.places.push({ n: '제3 훈련장', t: '통나무 셋이 선 숲 속 훈련장. 카카시가 나루토·사스케·사쿠라에게 방울 뺏기 시험을 치르게 한 곳이다. 북쪽으로 냇물이 흐르고, 한쪽에 위령비가 서 있다.', b: [cx - G.r, cx + G.r, cz - G.r, cz + G.r] });
    out.jumps.push(['제3 훈련장', Y.gx + Math.sin(Y.ry) * 4, 0, Y.gz + Math.cos(Y.ry) * 4, Y.ry, 97]);
  }

  /* ================= 제4 훈련장: 타고 넘고 건너는 터 ================= */
  {
    const G = GROUNDS.g4, [cx, cz] = G.c, Y = yard(G);
    gate(Y.gx, Y.gz, Y.ry, '第四演習場');
    // 그물 오르기 틀: 높은 통나무 둘 사이에 밧줄 그물
    { const x0 = cx - 4, x1 = cx + 4, z = cz - 8, H = 5.2;
      for (const x of [x0, x1]) { B.geo(LOG, cyl(0.17, 0.21, H + 0.3, 12), mat4(x, (H + 0.3) / 2, z)); solid(x, z, 0.21, H + 0.3); }
      B.geo(LOG, cyl(0.12, 0.12, 8.6, 10).rotateZ(PI / 2), mat4(cx, H, z));
      const net = textMat(' ', { w: 256, h: 256, draw: (g, w, h) => { g.strokeStyle = '#c9b07a'; g.lineWidth = 7; for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.stroke(); } } });
      for (const ry of [0, PI]) B.geo(net, new THREE.PlaneGeometry(7.6, H - 0.3), mat4(cx, H / 2 + 0.05, z, 0, ry, 0));
      addCollider(x0, 0, z - 0.1, x1, H, z + 0.1);
    }
    // 외줄: 두 기둥 사이에 팽팽히 맨 밧줄과, 붙잡는 윗줄
    { const z0 = cz - 4, z1 = cz + 7, x = cx + 10;
      for (const z of [z0, z1]) { B.geo(LOG, cyl(0.15, 0.18, 3.6, 12), mat4(x, 1.8, z)); solid(x, z, 0.18, 3.6); for (let k = 0; k < 5; k++) bx(LOG, 0.5, 0.07, 0.1, x - 0.3, 0.4 + k * 0.38, z, 0); }
      for (const [y, sag] of [[1.9, 0.18], [3.4, 0.1]]) B.geo(STRAW, tube([0, 1, 2, 3, 4, 5, 6].map(k => V(x, y - sag * Math.sin(k / 6 * PI), z0 + (z1 - z0) * k / 6)), 0.035, 6, false));
      addCollider(x - 0.06, 1.66, z0, x + 0.06, 1.78, z1);
    }
    // 외나무다리 셋(지그재그, 높이가 다르다)
    for (const [dx, dz, ry, h] of [[-9, 2, 0.5, 0.5], [-6.6, 6.4, -0.5, 0.85], [-9.4, 10.2, 0.5, 1.2]]) {
      B.geo(LOG, cyl(0.15, 0.13, 5.2, 12).rotateZ(PI / 2), mat4(cx + dx, h, cz + dz, 0, ry, 0));
      for (const k of [-1, 1]) { const px = cx + dx + k * 2.1 * Math.cos(ry), pz = cz + dz - k * 2.1 * Math.sin(ry); B.geo(LOG, cyl(0.13, 0.15, h, 10), mat4(px, h / 2, pz)); solid(px, pz, 0.15, h); }
      for (let k = -2; k <= 2; k++) addCollider(cx + dx + k * Math.cos(ry) - 0.5, h - 0.14, cz + dz - k * Math.sin(ry) - 0.5, cx + dx + k * Math.cos(ry) + 0.5, h + 0.14, cz + dz - k * Math.sin(ry) + 0.5);
    }
    // 건너뛰는 말뚝과 허수아비, 과녁
    for (let i = 0; i < 9; i++) log(cx - 2 + (i % 3) * 1.7 + (R() - 0.5) * 0.3, cz + 3 + Math.floor(i / 3) * 1.7 + (R() - 0.5) * 0.3, 0.4 + (i * 7 % 5) * 0.27, 0.2);
    for (const [dx, dz] of [[3.5, 10.5], [5.6, 10], [7.6, 9]]) dummy(cx + dx, cz + dz, R() * 3);
    for (const [a, ry] of [[2.5, -0.9], [3.1, 0], [3.7, 0.7]]) targetPost(cx + Math.sin(a) * 13.6, cz + Math.cos(a) * 13.6, a + PI);
    bench(cx + 2, cz - 12.6, 0.1);
    out.places.push({ n: '제4 훈련장', t: '정문 쪽 공원 숲 속의 훈련장. 그물 오르기 틀, 외줄, 외나무다리, 건너뛰는 말뚝으로 몸놀림을 익힌다.', b: [cx - G.r, cx + G.r, cz - G.r, cz + G.r] });
    out.jumps.push(['제4 훈련장', Y.gx + Math.sin(Y.ry) * 4, 0, Y.gz + Math.cos(Y.ry) * 4, Y.ry, 98]);
  }

  /* ================= 제43 훈련장: 사방에 과녁을 두른 터 ================= */
  {
    const G = GROUNDS.g43, [cx, cz] = G.c, Y = yard(G);
    gate(Y.gx, Y.gz, Y.ry, '第四十三演習場');
    // 한가운데 돌 깐 자리(여기 서서 사방으로 던진다)
    B.geo(STONE, cyl(1.6, 1.6, 0.05, 28), mat4(cx, 0.05, cz)); B.geo(WHT, new THREE.RingGeometry(1.42, 1.5, 32).rotateX(-PI / 2), mat4(cx, 0.078, cz));
    // 둘레의 과녁 기둥 여덟(높이가 제각각), 그 사이 나뭇가지에 매단 과녁 넷
    for (let i = 0; i < 8; i++) { const a = i / 8 * 2 * PI + 0.25; if (Math.abs(((a - Y.ry + PI * 3) % (2 * PI)) - PI) < 0.35) continue; targetPost(cx + Math.sin(a) * (G.r - 1.6), cz + Math.cos(a) * (G.r - 1.6), a + PI, 1.9 + (i % 3) * 0.5); }
    for (let i = 0; i < 4; i++) { const a = i / 4 * 2 * PI + 0.65, x = cx + Math.sin(a) * (G.r - 3.4), z = cz + Math.cos(a) * (G.r - 3.4), h = 3.4 + (i % 2) * 0.8;
      B.geo(LOG, cyl(0.1, 0.13, h + 0.9, 10), mat4(x, (h + 0.9) / 2, z)); solid(x, z, 0.13, h + 0.9); bx(LOG, 0.1, 0.1, 1.3, x - Math.sin(a) * 0.6, h + 0.75, z - Math.cos(a) * 0.6, a);
      B.geo(STRAW, cyl(0.012, 0.012, 0.6, 5), mat4(x - Math.sin(a) * 1.15, h + 0.42, z - Math.cos(a) * 1.15)); target(x - Math.sin(a) * 1.15, h - 0.2, z - Math.cos(a) * 1.15, a + PI, 0.75); }
    // 목인(팔이 달린 치기 기둥) 셋
    for (const [dx, dz] of [[-4.2, 3.4], [-5.6, 0.4], [-4.4, -2.8]]) { const x = cx + dx, z = cz + dz;
      B.geo(LOG, cyl(0.2, 0.22, 1.9, 14), mat4(x, 0.95, z)); solid(x, z, 0.22, 1.9);
      for (const [y, a, l] of [[1.5, 0.5, 0.75], [1.5, -0.5, 0.75], [1.05, 0, 0.7], [0.5, 0.2, 0.85]]) B.geo(LIGHT, cyl(0.04, 0.05, l, 8).rotateZ(PI / 2), mat4(x + Math.cos(a) * (0.2 + l / 2), y, z - Math.sin(a) * (0.2 + l / 2), 0, a, 0)); }
    // 날붙이 상자와 걸상
    { const x = cx + 2.6, z = cz + 1.2; bx(LIGHT, 0.8, 0.04, 0.6, x, 0.05, z, 0.4); for (const [dx, dz, w, d] of [[0, 0.3, 0.8, 0.04], [0, -0.3, 0.8, 0.04], [0.4, 0, 0.04, 0.6], [-0.4, 0, 0.04, 0.6]]) bx(LIGHT, w, 0.3, d, x + dx * Math.cos(0.4) + dz * Math.sin(0.4), 0.2, z - dx * Math.sin(0.4) + dz * Math.cos(0.4), 0.4); solid(x, z, 0.45, 0.35); }
    bench(cx + 5.5, cz - 6.5, 0.9);
    out.places.push({ n: '제43 훈련장', t: '동남쪽 담 밑 숲 속의 훈련장. 한가운데 돌 자리에 서서 사방의 과녁에 수리검을 던진다.', b: [cx - G.r, cx + G.r, cz - G.r, cz + G.r] });
    out.jumps.push(['제43 훈련장', Y.gx + Math.sin(Y.ry) * 4, 0, Y.gz + Math.cos(Y.ry) * 4, Y.ry, 99]);
  }

  /* ================= 제2 훈련장: 섬 있는 못의 물 위 말뚝 ================= */
  {
    const isle = PLAN.water.isleLand, ic = isle.reduce((t, p) => [t[0] + p[0] / isle.length, t[1] + p[1] / isle.length], [0, 0]);
    // 섬에서 서쪽 물가로: 물인 자리에만 말뚝을 박는다(머리가 물 위로 조금 나온다). 줄은 살짝 굽이친다
    const dir = [-0.97, -0.24]; let shore = null, n = 0;
    for (let d = 6; d < 90; d += 1.7) {
      const w = Math.sin(d * 0.35) * 0.9, x = ic[0] + dir[0] * d - dir[1] * w, z = ic[1] + dir[1] * d + dir[0] * w, y = terrainH(x, z);
      if (y < -0.4) { const top = 0.12 + (n % 3) * 0.1; B.geo(LOG, cyl(0.2, 0.22, top + 1.8, 12), mat4(x, top - (top + 1.8) / 2, z, 0, R() * 6, 0)); B.geo(LIGHT, cyl(0.19, 0.19, 0.012, 12), mat4(x, top + 0.004, z)); addCollider(x - 0.22, -1.6, z - 0.22, x + 0.22, top, z + 0.22); n++; }
      else if (n > 3 && y > -0.02) { shore = [ic[0] + dir[0] * (d + 3), ic[1] + dir[1] * (d + 3)]; break; }
    }
    if (shore) {
      const ry = Math.atan2(dir[0], dir[1]);
      gate(shore[0], shore[1], ry, '第二演習場'); OPEN.push([shore[0], shore[1], 5]);
      const p = [shore[0] - dir[1] * 4.5, shore[1] + dir[0] * 4.5];
      signBoard(B, '水面歩行の行', p[0], 1.2, p[1], ry, 1.6, 0.4, { both: true, depth: 0.05, bg: '#e9dcc0' }); bx(M.beam, 0.1, 1.0, 0.1, p[0], 0.5, p[1], ry);
      out.jumps.push(['제2 훈련장', shore[0] + dir[0] * 4, 0, shore[1] + dir[1] * 4, Math.atan2(-dir[0], -dir[1]) + PI, 96.5]);
      out.places.push({ n: '제2 훈련장', t: '섬 있는 못. 차크라로 물 위를 걷는 수련을 하는 곳으로, 물가에서 섬까지 말뚝이 박혀 있다.', b: [Math.min(shore[0], ic[0]) - 6, Math.max(shore[0], ic[0]) + 6, Math.min(shore[1], ic[1]) - 8, Math.max(shore[1], ic[1]) + 8] });
    }
  }
  B.finish(scene);
}
