// 담 밖의 나머지 — 엄중 교정 시설, 정문 밖 큰 강의 다리. 자리표는 layout.js의 OUTER, 땅·물은 village.js, 나무는 streets.js가 맡는다.
// 원작(기억)에서 가져온 것: 교정 시설이 호수 한가운데 섬에 있고 다리 하나로만 이어진다는 것(미즈키가 갇혀 있던 곳).
// 지어낸 것: 생김새와 자리, 담에 낸 작은 문, 교정 시설의 담·망루·옥사의 짜임, 큰 강의 다리.
import * as THREE from '../vendor/three.module.js';
import { Builder, marks, settle, addCollider, mat4, tube, wall } from './build.js';
import { M, mat, textMat } from './materials.js';
import { coneRoof, roundWall, signBoard, railing } from './arch.js';
import { stairs } from './build.js';
import { terrainH } from './village.js';
import { WALL, OUTER, outTrailDist } from './layout.js';
import { OPEN, BARE } from './zones.js';

const PI = Math.PI, V = (x, y, z) => new THREE.Vector3(x, y, z);
const cyl = (rt, rb, h, seg = 10) => new THREE.CylinderGeometry(rt, rb, h, seg);

export function outer(scene, out, camera) {
  const B = new Builder(), places = [];
  let seed = 9173; const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const LOG = mat('wood', 0x6b5138), PLANK = mat('planks', 0x6e5a40), STONE = M.stone, IRON = M.iron, HAY = mat('plain', 0xc9a85a, { rough: 1 });
  const inst = (g, m, ms) => { const im = new THREE.InstancedMesh(g, m, ms.length); ms.forEach((q, i) => im.setMatrixAt(i, q)); im.instanceMatrix.needsUpdate = true; im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); scene.add(im); return im; };
  const bx = (m, w, h, d, x, y, z, ry = 0) => B.geo(m, new THREE.BoxGeometry(w, h, d), mat4(x, y, z, 0, ry, 0));
  const put = (x, z, ry, make) => { const holder = new THREE.Group(), from = marks(), b = new Builder(); const res = make(b) || null; b.finish(holder); return settle(scene, holder, from, { x, z, ry }, res); };
  // 담의 작은 문(제 좌표: 담 밖이 +z)
  const wallGate = (a, top, sub) => put(WALL.cx + Math.cos(a) * WALL.r, WALL.cz + Math.sin(a) * WALL.r, PI / 2 - a, b => {
    for (const s of [-1, 1]) { b.box(M.beam, s * 2.55 - 0.28, 0, -1.4, s * 2.55 + 0.28, 4.4, 1.4); b.box(PLANK, s * 2.3 - 0.07, 0.12, 1.4, s * 2.3 + 0.07, 3.9, 3.6); for (const y of [0.7, 2.0, 3.3]) b.box(IRON, s * 2.3 - 0.09, y, 1.45, s * 2.3 + 0.09, y + 0.1, 3.55, false); }
    b.box(M.beam, -3.0, 3.95, -1.46, 3.0, 4.5, 1.46, false); b.box(STONE, -2.3, 0, -1.3, 2.3, 0.06, 1.3, false);
    signBoard(b, top, -5.4, 2.6, -1.16, PI, 2.6, 0.5, { both: false }); signBoard(b, sub, -5.4, 1.85, -1.16, PI, 2.6, 0.4, { both: false, color: '#b3261a' });
    for (const s of [-1, 1]) { b.box(STONE, s * 3.6 - 0.22, 0, -4.2, s * 3.6 + 0.22, 1.5, -3.76); b.box(STONE, s * 3.6 - 0.3, 1.5, -4.28, s * 3.6 + 0.3, 1.62, -3.68, false); }
  });

  /* ================= 엄중 교정 시설: 호수 한가운데의 섬 ================= */
  {
    const J = OUTER.jail, [cx, cz] = J.c, u = [Math.cos(J.a), Math.sin(J.a)], d = [-u[0], -u[1]], FL = 0.5, RI = J.isle;   // d = 섬에서 마을(다리) 쪽
    wallGate(J.a, '木ノ葉厳重矯正施設', '関係者以外 立入禁止');
    const GREY = mat('stone', 0x8f918c), DARK = mat('stone', 0x6d7072), CELL = mat('plaster', 0xb9b6aa), TILE = mat('tile', 0x4a5560);
    // 섬: 물 위로 솟은 돌 기단
    B.geo(GREY, cyl(RI, RI + 0.6, FL + 2.2, 48), mat4(cx, FL - (FL + 2.2) / 2, cz));
    for (let x = -RI; x < RI; x += 1) { const m = Math.min(Math.abs(x), Math.abs(x + 1)), hz = Math.sqrt(RI * RI - m * m); addCollider(cx + x, -2, cz - hz, cx + x + 1, FL, cz + hz); }
    // 둥근 담과 문, 망루 넷
    const ga = Math.atan2(d[1], d[0]), gd = Math.asin(1.7 / (RI - 1.6));
    roundWall(B, GREY, cx, cz, RI - 2.0, RI - 1.2, FL, 7.6, [{ a0: ga - gd, a1: ga + gd, ys: [[FL, 4.3]] }], { seg: 64 });
    roundWall(B, DARK, cx, cz, RI - 2.1, RI - 1.1, 7.6, 7.9, [], { seg: 64, collide: false });
    { const spikes = []; for (let i = 0; i < 120; i++) { const a = i / 120 * 2 * PI; spikes.push(mat4(cx + Math.cos(a) * (RI - 1.6), 8.15, cz + Math.sin(a) * (RI - 1.6))); } inst(new THREE.ConeGeometry(0.06, 0.5, 5), IRON, spikes); }
    for (let i = 0; i < 4; i++) { const a = ga + PI / 4 + i * PI / 2, x = cx + Math.cos(a) * (RI - 1.6), z = cz + Math.sin(a) * (RI - 1.6);
      B.geo(GREY, cyl(1.9, 2.1, 9.6, 20), mat4(x, FL + 4.8, z)); B.geo(DARK, cyl(2.25, 2.25, 0.3, 20), mat4(x, FL + 9.45, z)); B.geo(mat('plain', 0x1d2026), cyl(1.95, 1.95, 1.3, 20, 1, true), mat4(x, FL + 10.25, z));
      for (let k = 0; k < 6; k++) { const b2 = k / 6 * 2 * PI; B.geo(GREY, cyl(0.12, 0.12, 1.3, 6), mat4(x + Math.cos(b2) * 1.95, FL + 10.25, z + Math.sin(b2) * 1.95)); }
      coneRoof(B, TILE, x, z, 2.7, FL + 10.9, 1.8, { seg: 16, detail: 2 });
      addCollider(x - 1.7, FL, z - 1.7, x + 1.7, FL + 11, z + 1.7);
      B.geo(mat('glow', 0xfff1c8, { power: 1.4 }), new THREE.SphereGeometry(0.22, 10, 8), mat4(x - Math.cos(a) * 1.7, FL + 10.2, z - Math.sin(a) * 1.7)); out.glows.push([x - Math.cos(a) * 1.7, FL + 10.2, z - Math.sin(a) * 1.7, 1.4]); }
    // 문: 쇠 문틀, 안으로 젖힌 쇠창살 문짝, 현판
    { const gx = cx + d[0] * (RI - 1.6), gz = cz + d[1] * (RI - 1.6), ry = Math.atan2(d[0], d[1]), c = Math.cos(ry), s = Math.sin(ry);
      for (const k of [-1, 1]) bx(IRON, 0.3, 3.9, 1.1, gx + k * 1.62 * c, FL + 1.95, gz - k * 1.62 * s, ry);
      bx(IRON, 3.9, 0.4, 1.1, gx, FL + 4.02, gz, ry);
      signBoard(B, '木ノ葉厳重矯正施設', gx + s * 0.62, FL + 5.3, gz + c * 0.62, ry, 3.6, 0.6, { both: false, depth: 0.06, bg: '#d9d4c4' });
      const bars = textMat(' ', { w: 128, h: 256, draw: (g, w, h) => { g.fillStyle = '#3a3d42'; for (let i = 0; i < 8; i++) g.fillRect(4 + i * 16, 0, 7, h); for (const y of [8, 120, 236]) g.fillRect(0, y, w, 12); } });
      for (const k of [-1, 1]) { const px = gx + k * 1.45 * c - s * 1.35, pz = gz - k * 1.45 * s - c * 1.35; for (const r of [ry + PI / 2, ry - PI / 2]) B.geo(bars, new THREE.PlaneGeometry(1.5, 3.6), mat4(px, FL + 1.85, pz, 0, r, 0)); addCollider(px - 0.4, FL, pz - 0.4, px + 0.4, FL + 3.7, pz + 0.4); }
    }
    // 옥사(1층은 들어갈 수 있다): 남쪽 복도와 북쪽 감방 넷. 2층은 창살 달린 높은 창뿐
    { const X0 = cx - 8, X1 = cx + 8, Z0 = cz - 9.5, Z1 = cz - 1.5, T = 0.3, H1 = FL + 3.3, H2 = FL + 6.8, ZC = cz - 4.2, floor = mat('pave', 0x8a8c88);
      B.box(floor, X0, FL, Z0, X1, FL + 0.06, Z1);
      const hi = (a, b2, y) => { const o = []; for (let v = a + 1.2; v < b2 - 0.6; v += 2) o.push({ u0: v - 0.35, u1: v + 0.35, ys: [[y, y + 0.5]] }); return o; };
      wall(B, CELL, 'x', Z1 - T, Z1, X0, X1, FL, H2, [{ u0: cx - 0.9, u1: cx + 0.9, ys: [[FL + 0.03, FL + 2.5]] }, ...hi(X0, cx - 1.4, FL + 5.2), ...hi(cx + 1.4, X1, FL + 5.2)].sort((p, q) => p.u0 - q.u0));
      wall(B, CELL, 'x', Z0, Z0 + T, X0, X1, FL, H2, [...hi(X0, X1, FL + 2.3), ...hi(X0 + 1, X1, FL + 5.2)].sort((p, q) => p.u0 - q.u0));
      wall(B, CELL, 'z', X0, X0 + T, Z0 + T, Z1 - T, FL, H2, hi(Z0, Z1, FL + 5.2)); wall(B, CELL, 'z', X1 - T, X1, Z0 + T, Z1 - T, FL, H2, hi(Z0, Z1, FL + 5.2));
      B.box(DARK, X0 - 0.15, H2, Z0 - 0.15, X1 + 0.15, H2 + 0.35, Z1 + 0.15); { const hx0 = X0 + T + 0.9, hx1 = X0 + 6.6, hz0 = Z1 - T - 1.2;   // 계단 구멍
        B.box(CELL, X0 + T, H1, Z0 + T, X1 - T, H1 + 0.25, hz0); B.box(CELL, X0 + T, H1, hz0, hx0, H1 + 0.25, Z1 - T); B.box(CELL, hx1, H1, hz0, X1 - T, H1 + 0.25, Z1 - T); }
      for (const k of [-1, 1]) bx(IRON, 0.22, 2.6, 0.4, cx + k * 0.93, FL + 1.3, Z1 - T / 2); bx(IRON, 2.1, 0.24, 0.4, cx, FL + 2.54, Z1 - T / 2);   // 문설주·윗틀은 벽 구멍 안으로 들인다(구멍의 옆면·윗면과 한 평면에 겹치면 깜빡인다)
      signBoard(B, '獄舎', cx, FL + 3.0, Z1 + 0.04, 0, 0.9, 0.4, { both: false, depth: 0.04, bg: '#d9d4c4' });
      // 감방 칸막이와 쇠창살(가운데 둘째 방은 문이 열려 있다)
      for (let i = 1; i < 4; i++) B.box(CELL, X0 + i * 4 - 0.1, FL, Z0 + T, X0 + i * 4 + 0.1, H1, ZC);
      for (let i = 0; i < 4; i++) { const a = X0 + i * 4 + (i ? 0.1 : T), b2 = X0 + (i + 1) * 4 - (i < 3 ? 0.1 : T), open = i === 1;
        for (let x = a + 0.07; x < b2; x += 0.14) { if (open && x > a + 1.2 && x < a + 2.2) continue; B.box(IRON, x - 0.02, FL + 0.06, ZC - 0.02, x + 0.02, H1, ZC + 0.02, false); }
        for (const y of [FL + 0.12, FL + 1.6, H1 - 0.1]) { if (open) { B.box(IRON, a, y - 0.03, ZC - 0.03, a + 1.2, y + 0.03, ZC + 0.03, false); B.box(IRON, a + 2.2, y - 0.03, ZC - 0.03, b2, y + 0.03, ZC + 0.03, false); } else B.box(IRON, a, y - 0.03, ZC - 0.03, b2, y + 0.03, ZC + 0.03, false); }
        if (open) { addCollider(a, FL, ZC - 0.05, a + 1.2, H1, ZC + 0.05); addCollider(a + 2.2, FL, ZC - 0.05, b2, H1, ZC + 0.05); B.box(IRON, a + 2.2, FL + 0.06, ZC, a + 2.24, FL + 2.2, ZC + 1.0); }
        else addCollider(a, FL, ZC - 0.05, b2, H1, ZC + 0.05);
        // 잠자리 널과 담요, 물그릇
        B.box(PLANK, a + 0.15, FL + 0.4, Z0 + T + 0.1, a + 1.05, FL + 0.46, Z0 + T + 2.1); for (const z of [Z0 + T + 0.2, Z0 + T + 1.9]) B.box(IRON, a + 0.2, FL + 0.06, z, a + 1.0, FL + 0.4, z + 0.06, false);
        B.box(mat('plain', 0x5d6470), a + 0.17, FL + 0.46, Z0 + T + 0.5, a + 1.03, FL + 0.52, Z0 + T + 2.08, false); addCollider(a + 0.15, FL, Z0 + T + 0.1, a + 1.05, FL + 0.5, Z0 + T + 2.1);
        B.geo(mat('plain', 0x8a6a4a), cyl(0.12, 0.09, 0.08, 10), mat4(b2 - 0.5, FL + 0.1, ZC - 0.6));
        signBoard(B, ['壱', '弐', '参', '肆'][i], (a + b2) / 2, H1 - 0.35, ZC + 0.06, 0, 0.3, 0.3, { both: false, depth: 0.02, bg: '#d9d4c4' });
      }
      // 2층으로 오르는 계단(복도 서쪽, 남쪽 벽에 붙여): 동쪽에서 올라 서쪽 끝에서 2층 복도에 선다
      { const F2 = H1 + 0.25, hx0 = X0 + T + 0.9, hx1 = X0 + 6.6, hz0 = Z1 - T - 1.2;
        stairs(B, floor, 'x', hx0, 1, FL + 0.06, F2, hz0, Z1 - T, (hx1 - hx0) / 17);
        railing(B, IRON, [[hx0, hz0 - 0.05], [hx1 + 0.05, hz0 - 0.05], [hx1 + 0.05, Z1 - T]], F2, 1.0);
        // 2층: 독방 둘(잠긴 쇠문), 면회실, 간수실. 앞벽은 쇠창살이 아니라 벽이다
        wall(B, CELL, 'x', ZC - 0.1, ZC + 0.1, X0 + T, X1 - T, F2, H2, [2, 3].map(i => ({ u0: X0 + i * 4 + 1.3, u1: X0 + i * 4 + 2.3, ys: [[F2, F2 + 2.2]] })));
        for (let i = 1; i < 4; i++) B.box(CELL, X0 + i * 4 - 0.1, F2, Z0 + T, X0 + i * 4 + 0.1, H2, ZC - 0.1);
        for (const i of [2, 3]) { for (const k of [0, 1]) B.box(IRON, X0 + i * 4 + 1.3 + k * 0.92, F2, ZC - 0.14, X0 + i * 4 + 1.38 + k * 0.92, F2 + 2.12, ZC + 0.14, false); B.box(IRON, X0 + i * 4 + 1.3, F2 + 2.1, ZC - 0.14, X0 + i * 4 + 2.3, F2 + 2.17, ZC + 0.14, false); }
        for (const i of [0, 1]) { const xm = X0 + i * 4 + 2;   // 독방의 쇠문: 밥 넣는 구멍과 빗장, 문패
          B.box(IRON, xm - 0.55, F2, ZC + 0.1, xm + 0.55, F2 + 2.15, ZC + 0.16, false); B.box(mat('plain', 0x14161a), xm - 0.2, F2 + 1.5, ZC + 0.16, xm + 0.2, F2 + 1.62, ZC + 0.17, false); B.box(mat('plain', 0x14161a), xm - 0.25, F2 + 0.35, ZC + 0.16, xm + 0.25, F2 + 0.5, ZC + 0.17, false);
          B.box(mat('metal', 0x8a6a3a), xm - 0.75, F2 + 1.05, ZC + 0.16, xm + 0.3, F2 + 1.13, ZC + 0.2, false); for (const dx of [-0.45, 0.45]) for (const dy of [0.2, 1.95]) B.geo(IRON, new THREE.SphereGeometry(0.035, 8, 6), mat4(xm + dx, F2 + dy, ZC + 0.17));
          signBoard(B, i ? '独房 弐' : '独房 壱', xm, F2 + 2.5, ZC + 0.13, 0, 0.9, 0.3, { both: false, depth: 0.02, bg: '#d9d4c4' }); }
        // 면회실: 가로지른 낮은 벽 위로 쇠창살, 양쪽에 걸상
        { const a = X0 + 8.1, b2 = X0 + 11.9, zm = Z0 + T + 2.4;
          B.box(CELL, a, F2, zm - 0.1, b2, F2 + 0.95, zm + 0.1); B.box(M.beamLight, a, F2 + 0.95, zm - 0.3, b2, F2 + 1.0, zm + 0.3, false); addCollider(a, F2, zm - 0.1, b2, H2, zm + 0.1);
          for (let x = a + 0.07; x < b2; x += 0.14) B.box(IRON, x - 0.02, F2 + 1.0, zm - 0.02, x + 0.02, H2, zm + 0.02, false);
          for (const [x, z] of [[a + 1.2, zm + 0.9], [a + 2.6, zm + 0.9], [a + 1.9, zm - 0.9]]) { B.geo(M.beam, cyl(0.2, 0.2, 0.05, 12), mat4(x, F2 + 0.45, z)); B.geo(M.beam, cyl(0.04, 0.06, 0.43, 8), mat4(x, F2 + 0.215, z)); addCollider(x - 0.2, F2, z - 0.2, x + 0.2, F2 + 0.47, z + 0.2); }
          signBoard(B, '面会室', X0 + 9.8, F2 + 2.5, ZC + 0.13, 0, 0.9, 0.3, { both: false, depth: 0.02, bg: '#d9d4c4' }); signBoard(B, '面会は十五分まで', a + 0.03, F2 + 1.9, ZC - 1.2, PI / 2, 1.5, 0.3, { both: false, depth: 0.02 }); }
        // 간수실: 잠자리, 옷장 셋, 찻상
        { const a = X0 + 12.1, b2 = X1 - T, zn = Z0 + T;
          B.box(PLANK, a + 0.1, F2 + 0.4, zn + 0.1, a + 1.0, F2 + 0.46, zn + 2.1); B.box(mat('plain', 0x3f6b4a), a + 0.12, F2 + 0.46, zn + 0.5, a + 0.98, F2 + 0.54, zn + 2.08, false); B.box(mat('plain', 0xf0ece0), a + 0.2, F2 + 0.46, zn + 0.14, a + 0.9, F2 + 0.58, zn + 0.46, false); addCollider(a + 0.1, F2, zn + 0.1, a + 1.0, F2 + 0.5, zn + 2.1);
          for (let k = 0; k < 3; k++) { B.box(IRON, b2 - 0.5, F2, zn + 0.1 + k * 0.62, b2 - 0.02, F2 + 1.8, zn + 0.68 + k * 0.62); B.box(mat('plain', 0x14161a), b2 - 0.51, F2 + 1.45, zn + 0.2 + k * 0.62, b2 - 0.5, F2 + 1.6, zn + 0.58 + k * 0.62, false); }
          B.box(M.beamLight, a + 1.5, F2 + 0.34, zn + 2.6, a + 2.5, F2 + 0.39, zn + 3.4); for (const [dx, dz] of [[1.55, 2.65], [2.4, 2.65], [1.55, 3.3], [2.4, 3.3]]) B.box(M.beamLight, a + dx, F2, zn + dz, a + dx + 0.05, F2 + 0.34, zn + dz + 0.05, false); addCollider(a + 1.5, F2, zn + 2.6, a + 2.5, F2 + 0.39, zn + 3.4);
          B.geo(IRON, new THREE.LatheGeometry([[0, 0], [0.07, 0], [0.1, 0.05], [0.09, 0.12], [0.04, 0.15], [0, 0.16]].map(p => new THREE.Vector2(p[0], p[1])), 12), mat4(a + 1.85, F2 + 0.39, zn + 3.0)); for (const dx of [0.2, 0.35]) B.geo(mat('plain', 0xf0ece0), cyl(0.035, 0.025, 0.06, 10), mat4(a + 1.85 + dx, F2 + 0.42, zn + 2.9 + dx * 0.4));
          signBoard(B, '看守室', X0 + 13.8, F2 + 2.5, ZC + 0.13, 0, 0.9, 0.3, { both: false, depth: 0.02, bg: '#d9d4c4' }); }
        for (const x of [cx - 4, cx + 4]) { B.geo(mat('glow', 0xffe2a8, { power: 1.2 }), new THREE.SphereGeometry(0.1, 10, 8), mat4(x, H2 - 0.15, ZC + 0.7)); out.glows.push([x, H2 - 0.15, ZC + 0.7, 0.8]); out.lights.push([x, H2 - 0.5, ZC + 0.7, 12, 12]); }
        places.push({ n: '옥사 2층', t: '잠긴 쇠문의 독방 둘과 면회실, 간수실이 있다.', b: [X0, X1, Z0, Z1], y: [H1 + 0.05, H2 + 0.3] });
      }
      // 복도 끝의 지킴이 책상과 열쇠 걸이
      B.box(M.beamLight, X1 - T - 1.7, FL + 0.72, Z1 - T - 1.0, X1 - T - 0.2, FL + 0.78, Z1 - T - 0.2); B.box(M.beamLight, X1 - T - 1.65, FL + 0.06, Z1 - T - 0.95, X1 - T - 1.58, FL + 0.72, Z1 - T - 0.25, false); addCollider(X1 - T - 1.7, FL, Z1 - T - 1.0, X1 - T - 0.2, FL + 0.78, Z1 - T - 0.2);
      B.box(M.beam, X1 - T - 0.03, FL + 1.5, ZC + 0.4, X1 - T, FL + 1.9, ZC + 1.2, false); for (let k = 0; k < 4; k++) B.geo(IRON, new THREE.TorusGeometry(0.05, 0.012, 5, 10), mat4(X1 - T - 0.05, FL + 1.62, ZC + 0.5 + k * 0.2, 0, PI / 2, 0));
      for (const x of [cx - 4, cx + 4]) { B.geo(mat('glow', 0xffe2a8, { power: 1.2 }), new THREE.SphereGeometry(0.1, 10, 8), mat4(x, H1 - 0.12, cz - 3.6)); out.glows.push([x, H1 - 0.12, cz - 3.6, 0.8]); out.lights.push([x, H1 - 0.5, cz - 3.6, 12, 12]); }
      places.push({ n: '옥사 1층', t: '죄를 지은 닌자를 가두는 곳. 복도를 따라 쇠창살 친 감방이 넷 있고, 서쪽 계단으로 2층에 오른다.', b: [X0, X1, Z0, Z1], y: [FL - 0.3, H1 + 0.05] });
    }
    // 마당: 운동 시간에 도는 흰 금
    B.geo(mat('plain', 0xe9e4d6), new THREE.RingGeometry(5.0, 5.12, 40).rotateX(-PI / 2), mat4(cx + d[0] * 2, FL + 0.012, cz + 7 + d[1] * 0));
    // 다리: 섬의 문에서 물가까지 곧게 놓은 널다리. 물가 쪽 끝에 디딤단 둘
    { let ts = RI + 2; while (ts < 90 && terrainH(cx + d[0] * ts, cz + d[1] * ts) < -0.02) ts += 0.5; ts += 1.5;
      const t0 = RI - 0.6, len = ts - t0, mx = cx + d[0] * (t0 + len / 2), mz = cz + d[1] * (t0 + len / 2), ry = Math.atan2(d[0], d[1]), c = Math.cos(ry), s = Math.sin(ry);
      bx(PLANK, 3.0, 0.16, len, mx, FL - 0.08, mz, ry);
      for (const k of [-1, 1]) { bx(M.beam, 0.12, 0.1, len, mx + k * 1.4 * c, FL + 0.95, mz - k * 1.4 * s, ry); bx(M.beam, 0.08, 0.08, len, mx + k * 1.4 * c, FL + 0.5, mz - k * 1.4 * s, ry); }
      for (let t = t0 + 1; t < ts; t += 3) for (const k of [-1, 1]) { const px = cx + d[0] * t + k * 1.4 * c, pz = cz + d[1] * t - k * 1.4 * s; B.geo(LOG, cyl(0.1, 0.12, 3.4, 8), mat4(px, FL - 0.6, pz)); addCollider(px - 0.14, -1.5, pz - 0.14, px + 0.14, FL + 1.05, pz + 0.14); }
      for (let t = t0; t < ts; t += 0.6) { const px = cx + d[0] * t, pz = cz + d[1] * t; addCollider(px - 1.25, FL - 0.5, pz - 1.25, px + 1.25, FL, pz + 1.25); }
      for (const [k, h] of [[0.5, 0.26], [1.3, 0.02]]) { const px = cx + d[0] * (ts + k), pz = cz + d[1] * (ts + k); bx(STONE, 3.0, h + 0.24, 0.9, px, (h + 0.24) / 2 - 0.12, pz, ry); if (h > 0.1) addCollider(px - 1.2, -0.5, pz - 0.8, px + 1.2, h, pz + 0.8); }
      const sp = [cx + d[0] * (ts + 5), cz + d[1] * (ts + 5)];
      out.jumps.push(['엄중 교정 시설', sp[0], 0, sp[1], Math.atan2(d[0], d[1]), 93]); OPEN.push([sp[0], sp[1], 6]);
      const q = [sp[0] + c * 3, sp[1] - s * 3]; bx(M.beam, 0.1, 1.6, 0.1, q[0], 0.8, q[1], ry); signBoard(B, '面会は許可証を持参のこと', q[0], 1.7, q[1], ry, 2.2, 0.36, { both: true, depth: 0.04 });
    }
    for (const p of J.trail) OPEN.push([p[0], p[1], 4]);
    places.push({ n: '나뭇잎 엄중 교정 시설', t: '호수 한가운데 섬에 지은 감옥. 다리 하나로만 뭍과 이어진다. 봉인의 서를 훔치게 꾄 미즈키가 여기에 갇혔다.', poly: J.lake, b: [cx - J.ax, cx + J.ax, cz - J.az, cz + J.az] });
  }

  /* ================= 정문 밖 큰 강의 다리 ================= */
  {
    let z0 = WALL.gateZ + 30, z1; while (z0 < WALL.gateZ + 95 && terrainH(0, z0) > -0.02) z0 += 0.5; z1 = z0; while (z1 < WALL.gateZ + 110 && terrainH(0, z1) < -0.02) z1 += 0.5; z0 -= 2; z1 += 2;
    const RED = mat('plaster', 0xa63a2a), W2 = 6.4;
    B.box(M.floor, -W2, -0.2, z0, W2, 0.08, z1); B.box(M.beam, -W2 - 0.2, -0.36, z0, W2 + 0.2, -0.2, z1, false);
    for (let z = z0 + 2; z < z1 - 1; z += 5) for (const k of [-1, 1]) { B.geo(STONE, cyl(0.5, 0.6, 2.2, 12), mat4(k * (W2 - 0.8), -1.3, z)); }
    for (const k of [-1, 1]) {
      B.box(RED, k * W2 - 0.1, 0.9, z0, k * W2 + 0.1, 1.06, z1, false); B.box(RED, k * W2 - 0.07, 0.45, z0, k * W2 + 0.07, 0.55, z1, false); addCollider(k * W2 - 0.2, 0, z0, k * W2 + 0.2, 1.1, z1);
      for (let z = z0; z <= z1 + 0.01; z += (z1 - z0) / 8) { B.box(RED, k * W2 - 0.16, 0.08, z - 0.16, k * W2 + 0.16, 1.3, z + 0.16, false); B.geo(mat('metal', 0x8a6a3a), new THREE.LatheGeometry([[0.14, 0], [0.2, 0.08], [0.16, 0.2], [0.05, 0.34], [0, 0.36]].map(p => new THREE.Vector2(p[0], p[1])), 10), mat4(k * W2, 1.3, z)); }
    }
    places.push({ n: '정문 밖 큰 다리', t: '마을 남쪽을 가로지르는 큰 강에 놓인 다리. 마을을 떠나는 이들이 마지막으로 돌아보는 자리.', b: [-W2, W2, z0, z1] });
    out.jumps.push(['정문 밖 큰 다리', 0, 0.1, z0 - 6, PI, 94]);
  }

  B.finish(scene);
  out.places.push(...places);
  BARE.push((x, z) => outTrailDist(x, z) < 1.4);
}
