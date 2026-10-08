// 가문 구역 — 구역마다 담·대문·그 구역만의 건물을 세우고, 구역 안 집의 생김새를 정해 준다.
// 집을 블록에 줄지어 세우고 멀리서 가볍게 그리는 일은 streets.js가 맡는다(여기서는 "어느 블록에 어떤 집을"만 알려 준다).
import * as THREE from '../vendor/three.module.js';
import { Builder, marks, settle, addCollider, mat4, rng as rngOf } from './build.js';
import { M, mat, textMat } from './materials.js';
import { boxHouse, makeKit, ROOFS } from './town.js';
import { lantern, signBoard, beamBetween, gableRoof, hipRoof } from './arch.js';
import { tuftGeometry } from './flora.js';
import { Herd } from './deer.js';
import { Pack } from './dogs.js';
import { uchihaKit, uchihaGate } from './b_uchiha.js';
import { PLAN } from './plan-data.js';
import { terrainH, inPoly } from './village.js';

export const LOTS = [];        // 구역의 특별한 건물이 선 터 { x, z, ry, w, d } — 집·나무·풀이 피한다
export const OPEN = [];        // 나무를 심지 않을 자리 [x, z, 반지름] — 문 앞처럼 트여 있어야 하는 곳
export const BARE = [];        // 풀포기가 나지 않을 자리를 가리는 함수 (x, z) => 참 — 흙을 깐 산책길·놀이터
const GROUPS = [];             // 구역의 집 묶음 { polys, land, ok(x, z), style(R), deco(B, h) }
export const zoneGroups = () => GROUPS;

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const zone = n => PLAN.zones.find(z => z.n === n);
const cen = poly => [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const segDist = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz))); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };
const yawTo = (vx, vz) => Math.atan2(-vx, -vz);          // 그 방향을 보는 눈길
// 제 좌표(벽이 축에 나란한 좌표)로 지은 것을 마을의 제자리에 돌려 놓는다
// 짓는 동안 등불 빛무리 목록(GLOWS)에 바로 넣은 자리는 제 좌표라서, 놓은 뒤에 마을 좌표로 바꿔 준다(안 바꾸면 빛무리가 마을 원점 — 관저 앞 큰길 — 에 떠 있게 된다).
let GLOWS = null;
function put(scene, at, make) {
  const holder = new THREE.Group(), from = marks(), B = new Builder(), g0 = GLOWS ? GLOWS.length : 0;
  const res = make(B) || null;
  B.finish(holder);
  const out = settle(scene, holder, from, at, res);
  if (GLOWS) { const cs = Math.cos(at.ry || 0), sn = Math.sin(at.ry || 0); for (let i = g0; i < GLOWS.length; i++) { const g = GLOWS[i], dx = g[0] - (at.ox || 0), dz = g[2] - (at.oz || 0); GLOWS[i] = [at.x + dx * cs + dz * sn, g[1], at.z - dx * sn + dz * cs, ...g.slice(3)]; } }
  return out;
}

/* ============================ 우치하 구역 ============================
   담으로 두른 구역. 바큇살 길(18도 길) 쪽에 큰 대문과 작은 문, 마을 안쪽 담에 문 하나. 흰 벽·검푸른 기와의 집마다 부채 문장.
   경무부대 본부와 센베이 가게는 여기서 짓고, 사스케의 집과 남가 신사는 건물 파일(b_uchiha.js)이 따로 짓는다. */
function uchiha(scene, out) {
  const U = uchihaKit(), K = makeKit(), Z = zone(33), P0 = Z.poly;
  // 구역의 결: d = 바큇살 길을 따라 바깥으로, p = 길에서 구역 안쪽으로
  const L0 = Math.hypot(P0[1][0] - P0[0][0], P0[1][1] - P0[0][1]), d = [(P0[1][0] - P0[0][0]) / L0, (P0[1][1] - P0[0][1]) / L0], c0 = cen(P0);
  let p = [d[1], -d[0]]; if ((c0[0] - P0[0][0]) * p[0] + (c0[1] - P0[0][1]) * p[1] < 0) p = [-p[0], -p[1]];
  // 담이 서는 줄: 바큇살 길 쪽은 길 폭만큼 안으로 들여 세운다
  const W = P0.map((q, i) => (i < 2 ? [q[0] + p[0] * 8.5, q[1] + p[1] * 8.5] : q)), NW = W.length;
  const bc = i => cen(Z.blocks[i]);
  const onRoadSide = m => { const t = (m[0] - W[0][0]) * d[0] + (m[1] - W[0][1]) * d[1]; return [W[0][0] + d[0] * t, W[0][1] + d[1] * t]; };
  // 문: 블록 사이 골목이 담과 만나는 자리
  const gates = [{ at: onRoadSide(mid(bc(8), bc(15))), main: true }, { at: onRoadSide(mid(bc(15), bc(20))) }];
  { // 마을 안쪽 담: 세로 골목(d 방향)이 담과 만나는 자리
    const m = mid(bc(2), bc(3)), a = W[NW - 1], b = W[0], ex = b[0] - a[0], ez = b[1] - a[1];
    const t = ((m[0] - a[0]) * -d[1] + (m[1] - a[1]) * d[0]) / (ex * -d[1] + ez * d[0]);
    if (t > 0.05 && t < 0.95) gates.push({ at: [a[0] + ex * t, a[1] + ez * t] });
  }

  // 담: 변마다 문 자리만 비우고 끊김 없이 세운다(호수의 물은 땅 밑으로 강과 이어져 있어 담을 틔울 일이 없다)
  for (let i = 0; i < NW; i++) {
    const a = W[i], b = W[(i + 1) % NW], L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L, ry = Math.atan2(ux, uz);
    const open = s => { const x = a[0] + ux * s, z = a[1] + uz * s; return gates.some(g => Math.hypot(g.at[0] - x, g.at[1] - z) < 3.3); };
    let s0 = null;
    for (let s = 0; s <= L + 0.25; s += 0.25) {
      const stop = s > L || open(s);
      if (!stop && s0 === null) s0 = s;
      if (stop && s0 !== null) { const len = s - 0.25 - s0, st = s0; if (len > 1) put(scene, { x: a[0] + ux * st, z: a[1] + uz * st, ry }, B => { U.capWall(B, 'z', 0, 0, len, 3.0); }); s0 = null; }
    }
    // 이 변에 선 문
    for (const g of gates) {
      if (segDist(g.at[0], g.at[1], a, b) > 0.3) continue;
      const outward = (c0[0] - g.at[0]) * -uz + (c0[1] - g.at[1]) * ux < 0;      // 문의 앞(-x)이 구역 바깥을 보게
      g.ry = outward ? ry : ry + Math.PI; g.out = outward ? [-uz, ux] : [uz, -ux];
      put(scene, { x: g.at[0], z: g.at[1], ry: g.ry }, B => { uchihaGate(B, !!g.main); });
    }
  }
  const G = gates[0];

  // 큰 대문에서 안으로 뻗는 골목의 등롱 기둥
  {
    const B = new Builder();
    for (let k = 0; k < 14; k++) {
      const side = k % 2 ? 1 : -1, t = 9 + k * 21, x = G.at[0] + p[0] * t + d[0] * side * 3.1, z = G.at[1] + p[1] * t + d[1] * side * 3.1;
      if (!inPoly(x + p[0] * 6, z + p[1] * 6, W) || terrainH(x, z) < -0.05) break;
      B.box(M.beam, x - 0.06, 0, z - 0.06, x + 0.06, 2.9, z + 0.06, false); addCollider(x - 0.1, 0, z - 0.1, x + 0.1, 2.9, z + 0.1);
      const ax = x - d[0] * side * 0.45, az = z - d[1] * side * 0.45;
      beamBetween(B, M.beam, V(x, 2.73, z), V(ax, 2.73, az), 0.06, 0.06);
      out.glows.push(lantern(B, ax, 2.2, az, { color: 0xf0e2c0, r: 0.17, h: 0.44 }));
    }
    B.finish(scene);
  }

  // 경무부대 본부: 3층 본채에 2층 날개채 둘. 본채 이마에 큰 문장.
  {
    const z37 = zone(37), q = z37.poly, n = q.length / 2, inn = mid(q[n], q[q.length - 1]), outm = mid(q[0], q[n - 1]);
    const L = Math.hypot(inn[0] - outm[0], inn[1] - outm[1]), f = [(inn[0] - outm[0]) / L, (inn[1] - outm[1]) / L];     // 정면: 마을 안쪽(관저 쪽)을 본다
    const at = { x: z37.at[0] + f[0] * (L / 2 - 12.5), z: z37.at[1] + f[1] * (L / 2 - 12.5), ry: Math.atan2(f[0], f[1]), w: 40, d: 17 };   // 터의 앞쪽(골목 쪽)에 붙여 세운다
    LOTS.push({ x: at.x + f[0] * 7, z: at.z + f[1] * 7, ry: at.ry, w: 42, d: 31 });   // 앞마당까지 비워 둔다
    const res = put(scene, at, B => {
      const base = { front: 's', wall: 5, roof: 3, shop: null, near: true };
      boxHouse(B, K, { ...base, x0: -10, z0: -6, x1: 10, z1: 6, floors: 3, roofKind: 'hip', rise: 2.6 }, rngOf(3701), out.glows);
      for (const s of [-1, 1]) boxHouse(B, K, { ...base, x0: s < 0 ? -19 : 10.5, z0: -4, x1: s < 0 ? -10.5 : 19, z1: 7, floors: 2, roofKind: 'gable', rise: 1.9 }, rngOf(3702 + s), out.glows);
      U.crestPlaque(B, 0, 7.75, 6.04, 0, 1.05);
      signBoard(B, '木ノ葉警務部隊', 0, 3.05, 6.2, 0, 4.6, 0.62, { both: false });
      for (const s of [-1, 1]) { B.box(M.beam, s * 3.2 - 0.07, 0, 8.3, s * 3.2 + 0.07, 2.6, 8.44, false); out.glows.push(lantern(B, s * 3.2, 2.2, 8.37, { text: '警', color: 0xf0e2c0, r: 0.2, h: 0.5 })); }
      return {
        places: [{ n: '경무부대 본부', t: '마을의 치안을 맡은 나뭇잎 경무부대의 본부. 우치하 일족이 대대로 이끌었다.', b: [-21, 21, -8, 12], y: [0, 14] }],
        jumps: [['경무부대 본부', 0, 0, 15, 0, 46]],
      };
    });
    out.places.push(...res.places); out.jumps.push(...res.jumps);
  }
  // 우치하 센베이: 테야키·우루치 부부의 과자 가게
  {
    const z36 = zone(36), q = z36.poly, n = q.length / 2, inn = mid(q[n], q[q.length - 1]), outm = mid(q[0], q[n - 1]);
    const L = Math.hypot(inn[0] - outm[0], inn[1] - outm[1]), f = [(inn[0] - outm[0]) / L, (inn[1] - outm[1]) / L];
    const at = { x: z36.at[0] + f[0] * (L / 2 - 7.5), z: z36.at[1] + f[1] * (L / 2 - 7.5), ry: Math.atan2(f[0], f[1]), w: 12, d: 10 };
    LOTS.push(at);
    const res = put(scene, at, B => {
      boxHouse(B, K, { x0: -5.5, z0: -4.5, x1: 5.5, z1: 4.5, front: 's', floors: 2, wall: 5, roof: 3, roofKind: 'gable', rise: 1.9, shop: 'うちは煎餅', near: true }, rngOf(3601), out.glows);
      U.crestPlaque(B, -4.3, 5.4, 4.53, 0, 0.42);
      return { places: [{ n: '우치하 센베이', t: '테야키와 우루치 부부가 하는 센베이 가게. 일족 사람들의 사랑방이었다.', b: [-7, 7, -6, 8], y: [0, 9] }], jumps: [['우치하 센베이', 0, 0, 9, 0, 47]] };
    });
    out.places.push(...res.places); out.jumps.push(...res.jumps);
  }

  // 구역 안의 집: 흰 벽·검푸른 기와, 벽마다 문장
  const shops = ['茶', '団子', '米', '酒', '豆腐'];
  let si = 0;
  GROUPS.push({
    polys: [...Z.blocks, zone(36).poly, zone(37).poly], land: 3,
    ok: (x, z) => { if (!inPoly(x, z, W)) return false; for (let i = 0; i < NW; i++) if (segDist(x, z, W[i], W[(i + 1) % NW]) < 2.4) return false; return true; },
    style: R => ({ round: false, floors: 1 + (R() < 0.45 ? 1 : 0), wall: 5, roof: 3, roofKind: R() < 0.6 ? 'gable' : 'hip', shop: R() < 0.07 ? shops[si++ % shops.length] : null }),
    deco: (B, h) => U.crestPlaque(B, -h.w / 2 + 1.0, (h.floors >= 2 ? 3.3 : 2.75), h.d / 2 + 0.03, 0, 0.36),
  });

  const xs = W.map(q => q[0]), zs = W.map(q => q[1]);
  out.places.push({ n: '우치하 일족의 거리', t: '부채 문장을 내건 일족이 모여 살던 구역. 지금은 인기척 없이 고요하다.', poly: W, b: [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)] });
  out.jumps.push(['우치하 구역 대문', G.at[0] + G.out[0] * 9, 0, G.at[1] + G.out[1] * 9, yawTo(-G.out[0], -G.out[1]), 40]);
}

/* ---------- 문장 판: 둥근 나무 테에 일족의 문장 ---------- */
function crestDisc(B, draw, key, x, y, z, ry, r) {
  const m = textMat(' ', { w: 256, h: 256, bg: '#efe8d8', color: '#efe8d8', key, draw: (g, w, h) => draw(g, w / 2, h / 2, w * 0.44) });
  B.geo(M.beam, new THREE.CylinderGeometry(r + 0.05, r + 0.05, 0.04, 32).rotateX(Math.PI / 2), mat4(x, y, z, 0, ry, 0));
  B.geo(m, new THREE.CircleGeometry(r, 32), mat4(x + Math.sin(ry) * 0.028, y, z + Math.cos(ry) * 0.028, 0, ry, 0));
}
function instanced(scene, geo, material, list, shadow = true) {
  if (!geo || !list.length) return;
  const im = new THREE.InstancedMesh(geo, material, list.length);
  list.forEach((m, i) => im.setMatrixAt(i, m)); im.instanceMatrix.needsUpdate = true; im.castShadow = shadow; im.receiveShadow = true; im.computeBoundingSphere();
  scene.add(im);
}
// 다각형을 가운데 쪽으로 d만큼 줄인 것(볼록한 블록에만 쓴다)
const shrink = (poly, d) => { const c = cen(poly); return poly.map(q => { const l = Math.hypot(c[0] - q[0], c[1] - q[1]); return [q[0] + (c[0] - q[0]) / l * d, q[1] + (c[1] - q[1]) / l * d]; }); };

/* ============================ 나라 구역 ============================
   사슴을 돌보고 약을 짓는 일족의 구역. 담은 없고, 관저 쪽 들머리에 나무 문이 선다. 가운데 길 끝이 일족 우두머리(시카마루네)의 집터,
   그 뒤(마을 담·나라 숲 쪽)가 사슴 목장, 옆이 약초밭과 약재 창고. 집은 흙빛 벽에 풀빛 기와, 집마다 일족의 문장. */
// 나라 일족의 문장: 둥근 테 안에 비스듬한 물결 띠 셋과 그 사이를 잇는 짧은 줄 셋(나루토 위키의 문장 그림을 따랐다)
const NARA_STROKES = ['m 401.43909,798.45634 c -8.19625,10.02211 -15.85253,16.79643 -38.85749,22.50345 -23.00496,5.70703 -30.66125,12.48135 -38.8575,22.50347',
  'm 387.78158,779.57541 c -8.19625,10.02211 -15.85253,16.79643 -38.85749,22.50345 -15.88257,3.94013 -24.44921,8.38897 -30.92852,14.0641',
  'm 407.72551,825.28039 c -6.54706,5.91323 -15.14379,10.50609 -31.48641,14.56032 -23.00496,5.70703 -30.66124,12.48136 -38.85749,22.50348',
  'm 362.28571,843.41202 0,22.52755', 'm 368.88179,796.66185 -0.64928,-20.38149', 'm 351.83022,800.73553 0,22.29594'];
function drawNara(g, cx, cy, r) {
  g.save(); g.translate(cx - r, cy - r); g.scale(r / 50, r / 50);
  g.strokeStyle = '#1a1410'; g.lineJoin = 'round'; g.lineWidth = 10;
  g.beginPath(); g.arc(50, 50, 45, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(50, 50, 45, 0, Math.PI * 2); g.clip();
  g.translate(-312.7186, -770.93361);
  for (const d of NARA_STROKES) g.stroke(new Path2D(d));
  g.restore();
}
function nara(scene, out) {
  const K = makeKit(), Z = zone(7), F = PLAN.fan, R = rngOf(707);
  const HOME = 5, PADDOCK = 8, HERBS = 4;                          // 블록 번호: 우두머리 집터, 사슴 목장, 약초밭
  const hc = cen(Z.blocks[HOME]), A = Math.atan2(hc[0] - F[0], hc[1] - F[1]), u = [Math.sin(A), Math.cos(A)], v = [u[1], -u[0]];   // u: 가운데 길을 따라 바깥으로, v: 가로
  const r0 = Math.min(...Z.poly.map(q => Math.hypot(q[0] - F[0], q[1] - F[1])));
  const tile = mat('tile', ROOFS[2]);

  // 들머리의 나무 문: 굵은 기둥 둘에 가로대 둘, 작은 맞배지붕, 앞뒤로 문장
  const gate = [F[0] + u[0] * (r0 + 5), F[1] + u[1] * (r0 + 5)];
  put(scene, { x: gate[0], z: gate[1], ry: A }, B => {
    for (const s of [-1, 1]) { B.box(M.beam, s * 3.3 - 0.2, 0, -0.2, s * 3.3 + 0.2, 4.5, 0.2); B.box(M.stone, s * 3.3 - 0.3, 0, -0.3, s * 3.3 + 0.3, 0.4, 0.3, false); }
    B.box(M.beam, -4.2, 3.5, -0.11, 4.2, 3.74, 0.11, false); B.box(M.beam, -4.6, 4.34, -0.16, 4.6, 4.6, 0.16, false);
    gableRoof(B, tile, -4.4, -0.7, 4.4, 0.7, 4.6, 0.7, { ridge: 'x', over: 0.5, overGable: 0.5 });
    crestDisc(B, drawNara, 'nara', 0, 4.04, 0.13, 0, 0.4); crestDisc(B, drawNara, 'nara', 0, 4.04, -0.13, Math.PI, 0.4);
  });

  // 우두머리 집터: 아직 빈 터. 길 쪽에 문패만 세워 둔다
  {
    const front = [hc[0] - u[0] * 21, hc[1] - u[1] * 21];
    put(scene, { x: front[0], z: front[1], ry: Math.atan2(-u[0], -u[1]) }, B => {
      for (const s of [-1, 1]) B.box(M.beam, s * 0.75 - 0.07, 0, -0.07, s * 0.75 + 0.07, 2.1, 0.07);
      signBoard(B, '奈良', 0, 1.65, 0, 0, 1.36, 0.62, {});
    });
    out.places.push({ n: '시카마루네 집터', t: '나라 일족 우두머리의 집이 들어설 자리. 가운데 길이 곧장 이 터로 닿는다.', poly: Z.blocks[HOME], b: bound(Z.blocks[HOME]) });
  }

  // 사슴 목장: 나무 울타리를 두른 풀밭. 문은 집터 쪽으로 난다
  {
    const P = shrink(Z.blocks[PADDOCK], 3), n = P.length, B = new Builder();
    let gi = 0, gd = 1e9; for (let i = 0; i < n; i++) { const m = mid(P[i], P[(i + 1) % n]), dd = Math.hypot(m[0] - F[0], m[1] - F[1]); if (dd < gd) { gd = dd; gi = i; } }
    const gm = mid(P[gi], P[(gi + 1) % n]);
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.round(L / 2.5));
      let prev = null;
      for (let j = 0; j <= k; j++) {
        const x = a[0] + (b[0] - a[0]) * j / k, z = a[1] + (b[1] - a[1]) * j / k, open = i === gi && Math.hypot(x - gm[0], z - gm[1]) < 1.7;
        if (open) { prev = null; continue; }
        B.box(M.beam, x - 0.07, 0, z - 0.07, x + 0.07, 1.3, z + 0.07, false);
        if (prev) { for (const y of [0.5, 1.05]) beamBetween(B, M.beamLight, V(prev[0], y, prev[1]), V(x, y, z), 0.05, 0.11); for (let s = 0; s < 5; s++) { const cx = prev[0] + (x - prev[0]) * (s + 0.5) / 5, cz = prev[1] + (z - prev[1]) * (s + 0.5) / 5; addCollider(cx - 0.28, 0, cz - 0.28, cx + 0.28, 1.2, cz + 0.28); } }
        prev = [x, z];
      }
    }
    B.finish(scene);
    // 사슴 떼: 울타리 안을 거닐다 서서 둘레를 살피고 풀을 뜯는다
    const herd = new Herd(scene, shrink(Z.blocks[PADDOCK], 7), 13, R);
    out.ticks.push((t, dt) => herd.tick(t, dt, out.eye && out.eye.position));
    out.places.push({ n: '나라 일족의 사슴 목장', t: '일족이 대대로 돌보는 사슴들. 떨어진 뿔은 약재로 쓴다.', poly: Z.blocks[PADDOCK], b: bound(Z.blocks[PADDOCK]) });
    out.jumps.push(['사슴 목장', gm[0] - u[0] * 5, 0, gm[1] - u[1] * 5, yawTo(u[0], u[1]), 51]);
  }

  // 약초밭과 약재 창고
  {
    const blk = Z.blocks[HERBS], P = shrink(blk, 3.5), c = cen(blk), store = [c[0] - u[0] * 13, c[1] - u[1] * 13];
    put(scene, { x: store[0], z: store[1], ry: Math.atan2(-u[0], -u[1]) }, B => {
      boxHouse(B, K, { x0: -4.2, z0: -3.4, x1: 4.2, z1: 3.4, front: 's', floors: 2, wall: 5, roof: 2, roofKind: 'hip', rise: 1.8, shop: null, near: true }, rngOf(741), out.glows);
      crestDisc(B, drawNara, 'nara', 0, 5.3, 3.43, 0, 0.45);
      signBoard(B, '薬草園', 2.6, 2.6, 3.5, 0, 1.5, 0.42, { both: false });
      // 약초 말리는 시렁
      for (const x of [-8.5, -11.5]) {
        for (const s of [-1, 1]) B.box(M.beam, x - 0.05, 0, s * 1.4 - 0.05, x + 0.05, 1.9, s * 1.4 + 0.05, false);
        for (const y of [1.25, 1.85]) { B.box(M.beamLight, x - 0.03, y, -1.5, x + 0.03, y + 0.05, 1.5, false); for (let k = 0; k < 9; k++) B.geo(K.leaf, new THREE.ConeGeometry(0.09, 0.42, 6), mat4(x, y - 0.22, -1.25 + k * 0.31, Math.PI, k, 0)); }
        addCollider(x - 0.2, 0, -1.5, x + 0.2, 1.9, 1.5);
      }
    });
    const soil = mat('plain', 0x4f3d2c, { rough: 1 }), B = new Builder(), ry = Math.atan2(-v[1], v[0]), rows = [[], [], []];
    for (let tv = -45; tv <= 45; tv += 2.4) for (let tu = -45; tu <= 45; tu += 0.95) {
      const x = c[0] + v[0] * tv + u[0] * tu, z = c[1] + v[1] * tv + u[1] * tu;
      if (!inPoly(x, z, P) || (Math.abs((x - store[0]) * v[0] + (z - store[1]) * v[1]) < 15 && Math.abs((x - store[0]) * u[0] + (z - store[1]) * u[1]) < 7)) continue;
      B.geo(soil, new THREE.BoxGeometry(1.25, 0.16, 0.98), mat4(x, 0.06, z, 0, ry, 0));
      const k = ((Math.round(tv / 2.4) % 3) + 3) % 3;
      rows[k].push(mat4(x + (R() - 0.5) * 0.3, 0.13, z + (R() - 0.5) * 0.3, 0, R() * 6.283, 0, [1.25 + k * 0.25, 0.8 + k * 0.45 + R() * 0.3, 1.25 + k * 0.25]));
    }
    B.finish(scene);
    const herb = tuftGeometry(8);
    [0x5c9a3a, 0x2f6f3a, 0x8fae4a].forEach((col, k) => instanced(scene, herb, mat('leaf', col), rows[k], false));
    out.places.push({ n: '나라 일족의 약초밭', t: '약으로 쓸 풀을 가꾸는 밭과 약재 창고. 일족은 대대로 약 짓는 법을 책으로 전해 왔다.', poly: blk, b: bound(blk) });
  }

  GROUPS.push({
    polys: Z.blocks.filter((_, i) => ![HOME, PADDOCK, HERBS].includes(i)), land: 3,
    style: Rr => ({ round: false, floors: 1 + (Rr() < 0.35 ? 1 : 0), wall: Rr() < 0.6 ? 0 : 1, roof: 2, roofKind: Rr() < 0.65 ? 'gable' : 'hip', shop: Rr() < 0.04 ? '薬' : null }),
    deco: (B, h) => crestDisc(B, drawNara, 'nara', -h.w / 2 + 1.0, (h.floors >= 2 ? 3.3 : 2.75), h.d / 2 + 0.03, 0, 0.36),
  });
  out.places.push({ n: '나라 구역', t: '사슴을 돌보고 약을 짓는 나라 일족의 구역. 그림자를 다루는 술법으로 이름났다.', poly: Z.poly, b: bound(Z.poly) });
  out.jumps.push(['나라 구역', gate[0] - u[0] * 9, 0, gate[1] - u[1] * 9, yawTo(u[0], u[1]), 50]);
}
/* ============================ 아키미치 구역 ============================
   많이 먹고 몸을 불려 싸우는 일족의 구역. 들머리에 나무 문, 가운데 길 끝에 일족이 모여 먹는 회관과 잔치 마당,
   그 뒤에 곳간과 밭, 옆 블록 한가운데에 씨름판. 집은 여느 집보다 큼직하고 붉은 기와를 얹었다. 회관·씨름판·곳간은 원작에 없는, 일족의 특징에서 지어낸 것이다. */
// 아키미치 일족의 문장: 둥근 테 안에 세로줄 셋과 엇갈린 빗금 둘(나루토 위키의 문장 그림을 따랐다)
function drawAkimichi(g, cx, cy, r) {
  g.save(); g.translate(cx - r, cy - r); g.scale(r / 50, r / 50);
  g.strokeStyle = '#1a1410'; g.lineJoin = 'round'; g.lineWidth = 10;
  g.beginPath(); g.arc(50, 50, 45, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(50, 50, 45, 0, Math.PI * 2); g.clip();
  const L = 21.875, Rr = 78.125, T = 14.87, Bt = 85.13;
  for (const [x0, y0, x1, y1] of [[50, 5, 50, 95], [L, T, L, Bt], [Rr, T, Rr, Bt], [L, T, Rr, Bt], [Rr, T, L, Bt]]) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
  g.restore();
}
// 볏섬: 짚으로 엮은 쌀섬(x축으로 누운 통에 새끼줄 세 가닥)
function bale(B, K, x, y, z, ry = 0) {
  B.geo(K.straw, new THREE.CylinderGeometry(0.3, 0.3, 0.86, 12).rotateZ(Math.PI / 2), mat4(x, y + 0.3, z, 0, ry, 0));
  for (const o of [-0.28, 0, 0.28]) B.geo(K.rope, new THREE.TorusGeometry(0.305, 0.022, 5, 12).rotateY(Math.PI / 2), mat4(x + Math.cos(ry) * o, y + 0.3, z - Math.sin(ry) * o, 0, ry, 0));
}
// 곳간: 두꺼운 흰 벽에 돌 허리, 널문 하나와 높이 난 작은 창, 앞뒤로 박공이 선 맞배지붕. 가운데가 (x, 0), 앞은 +z.
function kura(B, K, x, hw, hd, H, tile) {
  const wm = mat('plaster', 0xf1eadb);
  B.box(wm, x - hw, 0, -hd, x + hw, H, hd);
  B.box(K.stone, x - hw - 0.08, 0, -hd - 0.08, x + hw + 0.08, 1.5, hd + 0.08, false);
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.box(K.wood, x + a * hw - 0.1, 1.5, b * hd - 0.1, x + a * hw + 0.1, H, b * hd + 0.1, false);
  B.box(K.door, x - 0.95, 0.12, hd, x + 0.95, 2.5, hd + 0.14, false);                                             // 두꺼운 널문과 문틀, 쇠 띠
  B.box(K.wood, x - 1.15, 2.5, hd, x + 1.15, 2.68, hd + 0.2, false); for (const s of [-1, 1]) B.box(K.wood, x + s * 1.05 - 0.1, 0.12, hd, x + s * 1.05 + 0.1, 2.5, hd + 0.2, false);
  for (const y of [0.7, 1.5, 2.1]) B.box(M.iron, x - 0.95, y, hd + 0.14, x + 0.95, y + 0.07, hd + 0.17, false);
  B.box(K.stone, x - 1.4, 0, hd, x + 1.4, 0.12, hd + 0.9, false);
  B.box(K.dark, x - 0.38, H - 1.5, hd, x + 0.38, H - 0.75, hd + 0.05, false);                                      // 높이 난 작은 창과 덧문
  for (const s of [-1, 1]) B.box(wm, x + s * 0.6 - 0.2, H - 1.56, hd, x + s * 0.6 + 0.2, H - 0.69, hd + 0.1, false);
  B.box(K.wood, x - 0.86, H - 1.66, hd, x + 0.86, H - 1.56, hd + 0.14, false);
  gableRoof(B, tile, x - hw, -hd, x + hw, hd, H, 2.0, { ridge: 'z', gable: wm, over: 0.7, overGable: 0.6, detail: 3 });
}
function akimichi(scene, out) {
  const K = makeKit(), Z = zone(9), F = PLAN.fan, R = rngOf(909);
  K.straw = mat('plain', 0xcdb06a, { rough: 0.95 }); K.rope = mat('plain', 0x9a8046, { rough: 0.95 });
  const HALL = 5, STORE = 7, RING = 6;                              // 블록 번호: 회관, 곳간과 밭, 씨름판
  const hc = cen(Z.blocks[HALL]), A = Math.atan2(hc[0] - F[0], hc[1] - F[1]), u = [Math.sin(A), Math.cos(A)], v = [u[1], -u[0]];
  const r0 = Math.min(...Z.poly.map(q => Math.hypot(q[0] - F[0], q[1] - F[1]))), back = Math.atan2(-u[0], -u[1]);   // back: 관저 쪽을 보는 방향
  const tile = mat('tile', ROOFS[1]), red = '#b3261a';

  // 들머리의 나무 문
  const gate = [F[0] + u[0] * (r0 + 5), F[1] + u[1] * (r0 + 5)];
  put(scene, { x: gate[0], z: gate[1], ry: A }, B => {
    for (const s of [-1, 1]) { B.box(M.beam, s * 3.3 - 0.24, 0, -0.24, s * 3.3 + 0.24, 4.5, 0.24); B.box(M.stone, s * 3.3 - 0.34, 0, -0.34, s * 3.3 + 0.34, 0.4, 0.34, false); }
    B.box(M.beam, -4.2, 3.5, -0.13, 4.2, 3.76, 0.13, false); B.box(M.beam, -4.7, 4.34, -0.18, 4.7, 4.6, 0.18, false);
    gableRoof(B, tile, -4.5, -0.8, 4.5, 0.8, 4.6, 0.8, { ridge: 'x', over: 0.5, overGable: 0.5 });
    crestDisc(B, drawAkimichi, 'akimichi', 0, 4.04, 0.15, 0, 0.4); crestDisc(B, drawAkimichi, 'akimichi', 0, 4.04, -0.15, Math.PI, 0.4);
  });

  // 회관과 잔치 마당: 큰 2층 집 앞에 긴 상과 걸상, 큰 솥을 건 부뚜막
  {
    const res = put(scene, { x: hc[0], z: hc[1], ry: back }, B => {
      boxHouse(B, K, { x0: -13, z0: -17, x1: 13, z1: -5, front: 's', floors: 2, wall: 0, roof: 1, roofKind: 'hip', rise: 3.2, shop: '食', near: true }, rngOf(951), out.glows);
      signBoard(B, '食', 0, 5.4, -4.86, 0, 2.3, 2.3, { round: true, both: false, color: red, bg: '#f1e9d4', depth: 0.12, pad: 0.16 });
      for (const s of [-1, 1]) crestDisc(B, drawAkimichi, 'akimichi', s * 9.5, 5.3, -4.96, 0, 0.6);
      // 긴 상 셋과 걸상
      for (const x of [-7.5, 0, 7.5]) {
        B.box(M.beamLight, x - 1.0, 0.66, 2, x + 1.0, 0.74, 9.5); for (const z of [2.3, 9.2]) for (const s of [-1, 1]) B.box(M.beam, x + s * 0.85 - 0.05, 0, z - 0.05, x + s * 0.85 + 0.05, 0.66, z + 0.05, false);
        for (const s of [-1, 1]) { B.box(M.beamLight, x + s * 1.55 - 0.2, 0.4, 2.2, x + s * 1.55 + 0.2, 0.46, 9.3); for (const z of [2.6, 8.9]) B.box(M.beam, x + s * 1.55 - 0.16, 0, z - 0.05, x + s * 1.55 + 0.16, 0.4, z + 0.05, false); }
        for (let k = 0; k < 5; k++) { B.geo(K.pot, new THREE.CylinderGeometry(0.2, 0.13, 0.12, 12), mat4(x + (k % 2 ? 0.35 : -0.35), 0.8, 3 + k * 1.4)); B.geo(M.white, new THREE.CylinderGeometry(0.17, 0.17, 0.02, 12), mat4(x + (k % 2 ? -0.3 : 0.3), 0.75, 3.4 + k * 1.3)); }
      }
      // 부뚜막: 흙으로 쌓은 화덕에 큰 솥과 나무 뚜껑
      for (const s of [-1, 1]) {
        const x = s * 14.5;
        B.box(K.stone, x - 1.1, 0, 3, x + 1.1, 0.8, 7.4);
        for (const z of [4.1, 6.3]) { B.geo(M.iron, new THREE.CylinderGeometry(0.62, 0.5, 0.36, 16), mat4(x, 0.96, z)); B.geo(M.beam, new THREE.CylinderGeometry(0.6, 0.6, 0.06, 16), mat4(x, 1.17, z)); B.box(M.beam, x - 0.5, 1.2, z - 0.05, x + 0.5, 1.26, z + 0.05, false); }
        B.box(M.beam, x - 0.07, 0, 9.4, x + 0.07, 2.7, 9.54, false); out.glows.push(lantern(B, x, 2.3, 9.47, { text: '食', color: 0xd8452e, r: 0.2, h: 0.5 }));
      }
      // 볏섬 무지와 술통
      for (let k = 0; k < 3; k++) { bale(B, K, -11.5 + k * 0.66, 0, -3.6); if (k < 2) bale(B, K, -11.17 + k * 0.66, 0.52, -3.6); }
      addCollider(-12, 0, -4.1, -9.8, 1.1, -3.1);
      return { places: [{ n: '아키미치 회관', t: '일족이 모여 한솥밥을 먹는 큰 집과 잔치 마당. 많이 먹는 것이 곧 이 일족의 힘이다.', b: [-17, 17, -18, 11], y: [0, 12] }], jumps: [['아키미치 회관', 0, 0, 14, 0, 53]] };
    });
    out.places.push(...res.places); out.jumps.push(...res.jumps);
  }

  // 씨름판: 흙으로 다진 단 위에 새끼줄을 둥글게 두르고, 네 기둥에 지붕을 올렸다
  {
    const rc = cen(Z.blocks[RING]), at = { x: rc[0], z: rc[1], ry: back, w: 17, d: 17 };
    LOTS.push(at);
    const clay = mat('plain', 0xb89468, { rough: 1 });
    const res = put(scene, at, B => {
      B.box(clay, -4.2, 0, -4.2, 4.2, 0.28, 4.2); B.box(clay, -3.5, 0.28, -3.5, 3.5, 0.56, 3.5);
      B.geo(K.rope, new THREE.TorusGeometry(2.3, 0.07, 6, 40).rotateX(Math.PI / 2), mat4(0, 0.6, 0));
      for (const s of [-1, 1]) B.box(M.white, s * 0.45 - 0.04, 0.56, -0.4, s * 0.45 + 0.04, 0.575, 0.4, false);                        // 맞서는 금
      for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.box(M.beam, a * 4.6 - 0.14, 0, b * 4.6 - 0.14, a * 4.6 + 0.14, 4.4, b * 4.6 + 0.14);
      B.box(M.beam, -4.8, 4.2, -4.8, 4.8, 4.4, -4.6, false); B.box(M.beam, -4.8, 4.2, 4.6, 4.8, 4.4, 4.8, false); B.box(M.beam, -4.8, 4.2, -4.8, -4.6, 4.4, 4.8, false); B.box(M.beam, 4.6, 4.2, -4.8, 4.8, 4.4, 4.8, false);
      hipRoof(B, tile, -4.8, -4.8, 4.8, 4.8, 4.4, 1.7, { over: 0.9 });
      // 봉(棒) 걸이: 일족이 즐겨 쓰는 긴 막대
      B.box(M.beam, -7.6, 0, -1.6, -7.5, 1.3, -1.5, false); B.box(M.beam, -7.6, 0, 1.5, -7.5, 1.3, 1.6, false); B.box(M.beam, -7.62, 1.2, -1.6, -7.48, 1.3, 1.6, false);
      for (let k = 0; k < 6; k++) B.geo(M.beamLight, new THREE.CylinderGeometry(0.025, 0.025, 2.1, 8), mat4(-7.42, 1.02, -1.25 + k * 0.5, 0, 0, 0.12));
      addCollider(-7.7, 0, -1.6, -7.3, 1.3, 1.6);
      return { places: [{ n: '아키미치 씨름판', t: '몸집을 키워 맞붙는 일족의 단련장. 흙단 위에 새끼줄을 둥글게 둘렀다.', b: [-8, 6, -6, 6], y: [0, 8] }], jumps: [['아키미치 씨름판', 0, 0, 8.5, 0, 54]] };
    });
    out.places.push(...res.places); out.jumps.push(...res.jumps);
  }

  // 곳간과 밭: 흰 곳간 셋에 볏섬 무지, 뒤로는 푸성귀 밭
  {
    const blk = Z.blocks[STORE], P = shrink(blk, 3.5), c = cen(blk), row = [c[0] - u[0] * 14, c[1] - u[1] * 14], kuraTile = mat('tile', ROOFS[3]);
    put(scene, { x: row[0], z: row[1], ry: back }, B => {
      for (const k of [-1, 0, 1]) {
        kura(B, K, k * 11, 3.6, 4.4, 5.6, kuraTile);
        crestDisc(B, drawAkimichi, 'akimichi', k * 11, 6.35, 4.43, 0, 0.42);
        for (let i = 0; i < 4; i++) { bale(B, K, k * 11 + 4.6, 0, 1.2 + i * 0.66, Math.PI / 2); if (i < 3) bale(B, K, k * 11 + 4.6, 0.52, 1.53 + i * 0.66, Math.PI / 2); }
        addCollider(k * 11 + 4.1, 0, 0.8, k * 11 + 5.1, 1.1, 3.6);
      }
    });
    const soil = mat('plain', 0x4f3d2c, { rough: 1 }), B = new Builder(), ry = Math.atan2(-v[1], v[0]), rows = [[], []];
    for (let tv = -45; tv <= 45; tv += 2.0) for (let tu = -4; tu <= 45; tu += 1.0) {
      const x = c[0] + v[0] * tv + u[0] * tu, z = c[1] + v[1] * tv + u[1] * tu;
      if (!inPoly(x, z, P)) continue;
      B.geo(soil, new THREE.BoxGeometry(1.3, 0.16, 1.02), mat4(x, 0.06, z, 0, ry, 0));
      const k = ((Math.round(tv / 2.0) % 2) + 2) % 2;
      rows[k].push(mat4(x + (R() - 0.5) * 0.2, 0.13, z + (R() - 0.5) * 0.2, 0, R() * 6.283, 0, k ? [1.0, 1.5 + R() * 0.4, 1.0] : [1.9, 0.55, 1.9]));   // 파처럼 솟은 줄, 배추처럼 퍼진 줄
    }
    B.finish(scene);
    const leafG = tuftGeometry(12);
    [0x7fb04a, 0x3f8a3a].forEach((col, k) => instanced(scene, leafG, mat('leaf', col), rows[k], false));
    out.places.push({ n: '아키미치 곳간과 밭', t: '일족이 먹을 쌀을 쌓아 두는 곳간과 푸성귀 밭.', poly: blk, b: bound(blk) });
  }

  GROUPS.push({
    polys: Z.blocks.filter((_, i) => ![HALL, STORE].includes(i)), land: 3, size: [9.5, 4.5, 8.5, 3.5],
    ok: (x, z) => !inPoly(x, z, zone(10).poly),                     // 야마나카 구역과 겹친 귀퉁이는 그쪽에 내준다
    style: Rr => ({ round: false, floors: 1 + (Rr() < 0.5 ? 1 : 0), wall: Rr() < 0.55 ? 3 : 0, roof: 1, roofKind: Rr() < 0.55 ? 'hip' : 'gable', shop: Rr() < 0.1 ? ['米', '団子', '焼肉', '菓子', '餅'][Math.floor(Rr() * 5)] : null }),
    deco: (B, h) => crestDisc(B, drawAkimichi, 'akimichi', -h.w / 2 + 1.0, (h.floors >= 2 ? 3.3 : 2.75), h.d / 2 + 0.03, 0, 0.36),
  });
  out.places.push({ n: '아키미치 구역', t: '많이 먹고 몸을 불려 싸우는 아키미치 일족의 구역. 옷에 먹을 식(食) 자를 새긴다.', poly: Z.poly, b: bound(Z.poly) });
  out.jumps.push(['아키미치 구역', gate[0] - u[0] * 9, 0, gate[1] - u[1] * 9, yawTo(u[0], u[1]), 52]);
}
/* ============================ 야마나카 구역 ============================
   마음을 다루는 술법의 일족이자, 마을에서 꽃집을 하는 집안의 구역. 북쪽 큰길 쪽 골목 어귀에 나무 문, 문에서 뻗는 골목과 꽃밭으로 꺾어 드는 골목 양쪽으로 일족의 꽃인 싸리가 늘어서고,
   길 끝(마을 담 쪽) 두 블록이 꽃밭, 그 앞 블록이 온실과 꽃 다듬는 작업장. 집은 흰 벽에 청록 기와, 집 앞마다 꽃 화분.
   꽃집과 싸리꽃 문장은 원작의 것이고, 꽃밭·온실·작업장은 "꽃집을 하는 일족"에서 지어낸 것이다. */
// 야마나카 일족의 문장: 둥근 테 안에 가로줄, 그 위로 반원과 세로줄 둘, 아래로 세로줄 하나(나루토 위키의 문장 그림을 따랐다)
function drawYamanaka(g, cx, cy, r) {
  g.save(); g.translate(cx - r, cy - r); g.scale(r / 50, r / 50);
  g.strokeStyle = '#1a1410'; g.lineJoin = 'round'; g.lineWidth = 10;
  g.beginPath(); g.arc(50, 50, 45, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(50, 50, 45, 0, Math.PI * 2); g.clip();
  for (const [x0, y0, x1, y1] of [[5, 50, 95, 50], [50, 95, 50, 50], [38.75, 50, 38.75, 22.2], [61.25, 50, 61.25, 22.2]]) { g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
  g.beginPath(); g.arc(50, 50, 30, Math.PI, Math.PI * 2); g.stroke();
  g.restore();
}
// 세모 낱장들을 도형으로(빛깔을 주면 꼭짓점마다 적는다)
function leafGeo(pos, col) {
  const g = new THREE.BufferGeometry(), uv = [];
  let top = 0.01; for (let i = 1; i < pos.length; i += 3) top = Math.max(top, pos[i]);
  for (let i = 0; i < pos.length; i += 3) uv.push(0.5, pos[i + 1] / top);
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  if (col) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
// 연 모양 낱장: 밑(b)에서 허리(m)를 지나 끝(t)으로, 허리에서 양옆(s 방향)으로 w만큼 벌어진다
const kite = (out, b, m, t, sx, sy, sz, w) => out.push(b[0], b[1], b[2], m[0] + sx * w, m[1] + sy * w, m[2] + sz * w, t[0], t[1], t[2], b[0], b[1], b[2], t[0], t[1], t[2], m[0] - sx * w, m[1] - sy * w, m[2] - sz * w);
// 꽃 한 포기 — 줄기·잎, 꽃잎, 꽃술을 따로 빚는다(빛깔을 따로 주려고). kind 0 납작하게 핀 꽃(코스모스), 1 오므린 꽃(튤립), 2 이삭처럼 솟은 꽃(라벤더), 3 해바라기
function flowerGeos(kind, seed) {
  const R = rngOf(seed), stem = [], head = [], eye = [], n = [3, 3, 4, 1][kind];
  for (let i = 0; i < n; i++) {
    const a = i / n * 6.283 + R() * 1.2, rad = kind === 3 ? 0 : 0.08 + R() * 0.16, bx = Math.cos(a) * rad, bz = Math.sin(a) * rad;
    const h = [0.55 + R() * 0.3, 0.36 + R() * 0.16, 0.52 + R() * 0.22, 1.45 + R() * 0.3][kind];
    const lean = kind === 3 ? 0.04 : 0.08 + R() * 0.12, tx = bx + Math.cos(a) * lean, tz = bz + Math.sin(a) * lean, sw = kind === 3 ? 0.028 : 0.011;
    for (const [qx, qz] of [[-Math.sin(a) * sw, Math.cos(a) * sw], [Math.cos(a) * sw, Math.sin(a) * sw]])            // 줄기: 엇갈린 낱장 둘
      stem.push(bx - qx, 0, bz - qz, bx + qx, 0, bz + qz, tx + qx * 0.6, h, tz + qz * 0.6, bx - qx, 0, bz - qz, tx + qx * 0.6, h, tz + qz * 0.6, tx - qx * 0.6, h, tz - qz * 0.6);
    const nl = [2, 2, 2, 5][kind], ll = [0.17, 0.3, 0.12, 0.44][kind], lw = [0.026, 0.042, 0.02, 0.16][kind], up = [0.5, 0.95, 0.5, 0.1][kind];
    for (let l = 0; l < nl; l++) {                                                                                   // 잎
      const la = a + 1.3 + l * 2.4 + R(), f = kind === 1 ? 0.03 : 0.2 + 0.5 * l / nl, ox = bx + (tx - bx) * f, oz = bz + (tz - bz) * f, oy = h * f, dx = Math.cos(la), dz = Math.sin(la);
      kite(stem, [ox, oy, oz], [ox + dx * ll * 0.5, oy + ll * 0.5 * up + (kind === 3 ? 0.07 : 0), oz + dz * ll * 0.5], [ox + dx * ll, oy + ll * up, oz + dz * ll], -dz, 0, dx, lw);
    }
    if (kind === 0 || kind === 3) {
      // 꽃 얼굴이 보는 쪽 F, 그 면 위의 두 축 U·W
      const fa = kind === 3 ? 0.6 : R() * 6.283, tilt = kind === 3 ? 1.15 : 0.25 + R() * 0.5;
      const F = V(Math.sin(tilt) * Math.cos(fa), Math.cos(tilt), Math.sin(tilt) * Math.sin(fa)), U = V(-F.z, 0, F.x).normalize(), W = F.clone().cross(U);
      const np = kind === 3 ? 14 : 6, r0 = kind === 3 ? 0.11 : 0.03, r1 = kind === 3 ? 0.27 : 0.17, pw = kind === 3 ? 0.046 : 0.055, cy = kind === 3 ? h + 0.05 : h;
      const P = (r, ang, lift) => [tx + (U.x * Math.cos(ang) + W.x * Math.sin(ang)) * r + F.x * lift, cy + (U.y * Math.cos(ang) + W.y * Math.sin(ang)) * r + F.y * lift, tz + (U.z * Math.cos(ang) + W.z * Math.sin(ang)) * r + F.z * lift];
      for (let k = 0; k < np; k++) {
        const ang = k / np * 6.283, c = Math.cos(ang), s = Math.sin(ang);
        kite(head, P(r0 * 0.6, ang, 0), P((r0 + r1) * 0.55, ang, 0.022), P(r1, ang, 0.04), -s * U.x + c * W.x, -s * U.y + c * W.y, -s * U.z + c * W.z, pw);
      }
      const re = r0 * 1.2, ne = kind === 3 ? 8 : 5;
      for (let k = 0; k < ne; k++) eye.push(...P(0, 0, 0.03), ...P(re, k / ne * 6.283, 0.016), ...P(re, (k + 1) / ne * 6.283, 0.016));
    } else if (kind === 1) {
      for (let k = 0; k < 6; k++) { const ang = k / 6 * 6.283, c = Math.cos(ang), s = Math.sin(ang); kite(head, [tx, h, tz], [tx + c * 0.068, h + 0.085, tz + s * 0.068], [tx + c * 0.04, h + 0.18, tz + s * 0.04], -s, 0, c, 0.045); }
    } else {
      for (let w = 0; w < 5; w++) {
        const f = 0.5 + 0.5 * w / 4, cx = bx + (tx - bx) * f, cz = bz + (tz - bz) * f, cy = h * f, rr = 0.062 * (1 - w / 8);
        for (let j = 0; j < 2; j++) { const ang = w * 1.9 + j * 3.14 + R(), c = Math.cos(ang), s = Math.sin(ang); kite(head, [cx, cy, cz], [cx + c * rr * 0.55, cy + 0.035, cz + s * rr * 0.55], [cx + c * rr, cy + 0.075, cz + s * rr], -s, 0, c, 0.028); }
      }
    }
  }
  return { stem: leafGeo(stem), head: leafGeo(head), eye: eye.length ? leafGeo(eye) : null };
}
// 싸리 한 그루: 밑동에서 사방으로 솟았다가 휘어 늘어지는 가는 가지들, 가지마다 세 잎과 붉보랏빛 꽃
function hagiGeo(seed) {
  const R = rngOf(seed), pos = [], col = [], tmp = [];
  const paint = hex => { const c = new THREE.Color(hex); for (let i = 0; i < tmp.length; i += 3) { pos.push(tmp[i], tmp[i + 1], tmp[i + 2]); col.push(c.r, c.g, c.b); } tmp.length = 0; };
  for (let b = 0; b < 24; b++) {
    const a = b / 24 * 6.283 + R() * 0.35, reach = 0.75 + R() * 0.6, top = 1.25 + R() * 0.55, droop = 0.45 + R() * 0.45, dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx, pts = [];
    for (let i = 0; i <= 7; i++) { const t = i / 7; pts.push([dx * reach * Math.pow(t, 1.25), top * (1 - (1 - t) * (1 - t)) - droop * t * t * t, dz * reach * Math.pow(t, 1.25)]); }
    for (let i = 0; i < 7; i++) {
      const p = pts[i], q = pts[i + 1], w0 = 0.016 * (1 - i / 9), w1 = 0.016 * (1 - (i + 1) / 9);
      for (const [sx, sy, sz] of [[px, 0, pz], [0, 1, 0]]) tmp.push(p[0] - sx * w0, p[1] - sy * w0, p[2] - sz * w0, p[0] + sx * w0, p[1] + sy * w0, p[2] + sz * w0, q[0] + sx * w1, q[1] + sy * w1, q[2] + sz * w1, p[0] - sx * w0, p[1] - sy * w0, p[2] - sz * w0, q[0] + sx * w1, q[1] + sy * w1, q[2] + sz * w1, q[0] - sx * w1, q[1] - sy * w1, q[2] - sz * w1);
    }
    paint(0x6a5236);
    for (let i = 2; i <= 7; i++) for (const s of [-1, 1]) {                                     // 잎: 가지 양옆으로
      const p = pts[i], la = a + s * (0.9 + R() * 0.5), lx = Math.cos(la), lz = Math.sin(la), L = 0.15 + R() * 0.06;
      kite(tmp, p, [p[0] + lx * L * 0.5, p[1] + 0.02, p[2] + lz * L * 0.5], [p[0] + lx * L, p[1] - 0.015, p[2] + lz * L], -lz, 0, lx, 0.05);
      paint(R() < 0.5 ? 0x4c8a3a : 0x6aa046);
    }
    for (let i = 4; i <= 7; i++) for (let k = 0; k < 3; k++) {                                  // 꽃: 가지 끝 쪽에 조롱조롱
      const p = pts[i], q = pts[Math.max(0, i - 1)], f = R(), bx = q[0] + (p[0] - q[0]) * f, by = q[1] + (p[1] - q[1]) * f, bz = q[2] + (p[2] - q[2]) * f, fa = R() * 6.283, fx = Math.cos(fa), fz = Math.sin(fa), L = 0.07 + R() * 0.03;
      kite(tmp, [bx, by, bz], [bx + fx * L * 0.5, by + 0.035, bz + fz * L * 0.5], [bx + fx * L, by + 0.01, bz + fz * L], -fz, 0, fx, 0.042);
      paint([0xc04a9a, 0xd873b4, 0x9a3c8a][Math.floor(R() * 3)]);
    }
  }
  return leafGeo(pos, col);
}
// 유리 온실: 돌 허리벽 위에 흰 나무 뼈대와 유리, 유리 맞배지붕. 안에는 양옆으로 화분 선반. 가운데가 (x, z), 문은 +z 쪽.
function glasshouse(B, K, Y, x, z, hw, hd, R) {
  const eave = 2.35, ridge = 3.95, wm = Y.white, z0 = z - hd, z1 = z + hd;
  B.box(K.stone, x - hw, 0, z0, x + hw, 0.04, z1, false);                                               // 바닥
  B.box(K.stone, x - hw - 0.1, 0, z0 - 0.1, x - hw + 0.1, 0.55, z1 + 0.1); B.box(K.stone, x + hw - 0.1, 0, z0 - 0.1, x + hw + 0.1, 0.55, z1 + 0.1);
  B.box(K.stone, x - hw, 0, z0 - 0.1, x + hw, 0.55, z0 + 0.1); for (const s of [-1, 1]) B.box(K.stone, x + (s < 0 ? -hw : 0.8), 0, z1 - 0.1, x + (s < 0 ? -0.8 : hw), 0.55, z1 + 0.1);
  const nb = Math.round(hd), step = 2 * hd / nb;
  for (let i = 0; i <= nb; i++) {                                                                       // 기둥과 서까래
    const zz = z0 + i * step;
    for (const s of [-1, 1]) { B.box(wm, x + s * hw - 0.05, 0.55, zz - 0.05, x + s * hw + 0.05, eave, zz + 0.05, false); beamBetween(B, wm, V(x + s * hw, eave, zz), V(x, ridge, zz), 0.05, 0.08); }
  }
  for (const s of [-1, 1]) { B.box(wm, x + s * hw - 0.05, eave - 0.06, z0, x + s * hw + 0.05, eave + 0.04, z1, false); B.box(wm, x + s * hw - 0.03, 1.4, z0, x + s * hw + 0.03, 1.45, z1, false); B.box(M.glass, x + s * hw - 0.015, 0.55, z0, x + s * hw + 0.015, eave, z1); }
  B.box(wm, x - 0.05, ridge - 0.05, z0, x + 0.05, ridge + 0.05, z1, false);
  const sl = Math.hypot(hw, ridge - eave), ang = Math.atan2(ridge - eave, hw);
  for (const s of [-1, 1]) B.geo(M.glass, new THREE.PlaneGeometry(sl, 2 * hd).rotateX(-Math.PI / 2), mat4(x + s * hw / 2, (eave + ridge) / 2, z, 0, 0, -s * ang));
  for (const zz of [z0, z1]) {                                                                          // 앞뒤 유리벽과 박공
    const tri = new THREE.BufferGeometry(); tri.setAttribute('position', new THREE.Float32BufferAttribute([x - hw, eave, zz, x + hw, eave, zz, x, ridge, zz], 3)); tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1], 2)); tri.computeVertexNormals();
    B.geo(M.glass, tri, new THREE.Matrix4());
    B.box(wm, x - hw, eave - 0.05, zz - 0.04, x + hw, eave + 0.05, zz + 0.04, false); B.box(wm, x - 0.04, eave, zz - 0.04, x + 0.04, ridge, zz + 0.04, false);
  }
  B.box(M.glass, x - hw, 0.55, z0 - 0.015, x + hw, eave, z0 + 0.015);
  for (const s of [-1, 1]) { B.box(M.glass, x + (s < 0 ? -hw : 0.8), 0.55, z1 - 0.015, x + (s < 0 ? -0.8 : hw), eave, z1 + 0.015); B.box(wm, x + s * 0.8 - 0.05, 0, z1 - 0.06, x + s * 0.8 + 0.05, eave, z1 + 0.06, false); }
  B.box(wm, x - 0.8, 2.1, z1 - 0.06, x + 0.8, 2.2, z1 + 0.06, false); B.box(M.glass, x - 0.8, 2.2, z1 - 0.015, x + 0.8, eave, z1 + 0.015, false);
  for (const s of [-1, 1]) {                                                                            // 화분 선반
    const bx0 = x + (s < 0 ? -hw + 0.25 : 1.1), bx1 = x + (s < 0 ? -1.1 : hw - 0.25), bm = (bx0 + bx1) / 2;
    B.box(M.beamLight, bx0, 0.78, z0 + 0.5, bx1, 0.84, z1 - 1.0); for (let zz = z0 + 0.7; zz < z1 - 1.0; zz += 2.2) for (const xx of [bx0 + 0.1, bx1 - 0.1]) B.box(M.beam, xx - 0.04, 0.04, zz - 0.04, xx + 0.04, 0.78, zz + 0.04, false);
    for (let zz = z0 + 0.95; zz < z1 - 1.3; zz += 0.62) for (const xx of [bm - 0.42, bm + 0.42]) {
      const kd = Math.floor(R() * 3), f = Y.FG[kd][Math.floor(R() * 2)], m = mat4(xx, 1.04, zz, 0, R() * 6.283, 0, [0.75, 0.75, 0.75]);
      B.geo(K.pot, new THREE.CylinderGeometry(0.17, 0.12, 0.2, 10), mat4(xx, 0.94, zz));
      B.geo(Y.green, f.stem, m); B.geo(Y.petal(Y.hues[kd][Math.floor(R() * Y.hues[kd].length)]), f.head, m); if (f.eye) B.geo(Y.eye, f.eye, m);
    }
  }
}
// 꽃밭: 네모 터에 이랑을 치고 띠마다 다른 꽃을 심는다. bands = [[꽃 종류, 꽃빛], …], skip(x, z)가 참인 자리는 비운다.
function flowerField(scene, Y, rect, bands, R, skip = null) {
  const [x0, x1, z0, z1] = rect, B = new Builder(), stems = [[], [], [], []], eyes = [[], [], [], []], heads = new Map();
  let z = z0 + 0.8, bi = 0;
  while (z < z1 - 0.8) {
    const [kind, hue] = bands[bi++ % bands.length], rows = kind === 3 ? 2 : 3, gap = kind === 3 ? 1.5 : 1.2, dx = kind === 3 ? 1.05 : 0.92, key = kind + ':' + hue;
    if (!heads.has(key)) heads.set(key, { kind, hue, list: [] });
    for (let r = 0; r < rows && z < z1 - 0.6; r++, z += gap) {
      const open = x => !skip || !skip(Math.floor((x - x0) / 2) * 2 + x0 + 1, z);                       // 이랑은 2m 토막으로 끊어 놓는다
      for (let sx = x0; sx < x1 - 0.5; sx += 2) if (open(sx + 1)) B.box(Y.soil, sx, 0, z - 0.4, Math.min(x1, sx + 2), 0.14, z + 0.4, false);
      for (let x = x0 + 0.5 + (r % 2) * 0.4; x < x1 - 0.4; x += dx) {
        if (!open(x)) continue;
        const s = kind === 3 ? 0.9 + R() * 0.2 : 1.15 + R() * 0.3, m = mat4(x + (R() - 0.5) * 0.18, 0.12, z + (R() - 0.5) * 0.18, 0, kind === 3 ? (R() - 0.5) * 0.5 : R() * 6.283, 0, [s, s * (0.85 + R() * 0.3), s]);
        stems[kind].push(m); eyes[kind].push(m); heads.get(key).list.push(m);
      }
    }
    z += 0.9;                                                                                           // 띠 사이 고랑길
  }
  B.finish(scene);
  for (let k = 0; k < 4; k++) { instanced(scene, Y.FG[k][0].stem, Y.green, stems[k], false); if (Y.FG[k][0].eye) instanced(scene, Y.FG[k][0].eye, k === 3 ? Y.eyeDark : Y.eye, eyes[k], false); }
  for (const h of heads.values()) instanced(scene, Y.FG[h.kind][0].head, Y.petal(h.hue), h.list, false);
}
// 꽃을 꽂아 둔 물통
function flowerBucket(B, K, Y, x, z, R) {
  B.geo(K.tank, new THREE.CylinderGeometry(0.24, 0.19, 0.42, 12), mat4(x, 0.21, z));
  const kd = Math.floor(R() * 3), f = Y.FG[kd][Math.floor(R() * 2)], hue = Y.hues[kd][Math.floor(R() * Y.hues[kd].length)];
  for (let k = 0; k < 3; k++) { const m = mat4(x + (R() - 0.5) * 0.12, 0.34, z + (R() - 0.5) * 0.12, 0, R() * 6.283, 0, [0.8, 0.9, 0.8]); B.geo(Y.green, f.stem, m); B.geo(Y.petal(hue), f.head, m); if (f.eye) B.geo(Y.eye, f.eye, m); }
}
function yamanaka(scene, out) {
  const K = makeKit(), Z = zone(10), R = rngOf(1010), tile = mat('tile', ROOFS[0]);
  const FIELD_A = 0, FIELD_B = 4, WORKS = 5;                         // 블록 번호: 꽃밭 둘, 온실과 작업장
  const Y = {
    FG: [0, 1, 2, 3].map(k => [flowerGeos(k, 1100 + k), flowerGeos(k, 1200 + k)]),
    hues: [[0xe86aa6, 0xf4f1ea, 0xc23b78], [0xd8322e, 0xf0c230, 0xf08a3c], [0x7a5cc0, 0x4f6fd0], [0xf2c21c]],
    green: mat('leaf', 0x4f8f3a, { side: 'double' }), eye: mat('leaf', 0xf0c63a, { side: 'double' }), eyeDark: mat('leaf', 0x5a3a1c, { side: 'double' }),
    petal: hex => mat('leaf', hex, { side: 'double' }),
    soil: mat('plain', 0x4f3d2c, { rough: 1 }), white: mat('plain', 0xeef0ec, { rough: 0.7 }),
  };
  const bb = Z.blocks.map(bound), zb = bound(Z.poly);
  const zN = Math.max(...bb.filter(b => b[2] < (zb[2] + zb[3]) / 2 && b[3] < (zb[2] + zb[3]) / 2 + 8).map(b => b[3])), zS = Math.min(...bb.filter(b => b[3] > zN + 4 && b[2] > zN).map(b => b[2])), zL = (zN + zS) / 2;   // 가운데 길의 두 가장자리와 한가운데

  // 들머리의 나무 문: 북쪽 큰길에서 구역으로 드는 첫 세로 골목(서쪽 첫 블록과 둘째 블록 사이)의 어귀
  const xs = [...new Set(bb.map(q => q[0]))].sort((p, q) => p - q), xA = Math.max(...bb.filter(q => q[0] === xs[0]).map(q => q[1])), xB = xs[1], xL = (xA + xB) / 2;   // 그 골목의 두 가장자리와 한가운데
  const gate = [xL, Math.min(...bb.map(q => q[2])) - 2.5];
  put(scene, { x: gate[0], z: gate[1], ry: 0 }, B => {
    for (const s of [-1, 1]) { B.box(M.beam, s * 3.3 - 0.2, 0, -0.2, s * 3.3 + 0.2, 4.5, 0.2); B.box(M.stone, s * 3.3 - 0.3, 0, -0.3, s * 3.3 + 0.3, 0.4, 0.3, false); }
    B.box(M.beam, -4.2, 3.5, -0.11, 4.2, 3.74, 0.11, false); B.box(M.beam, -4.6, 4.34, -0.16, 4.6, 4.6, 0.16, false);
    gableRoof(B, tile, -4.4, -0.7, 4.4, 0.7, 4.6, 0.7, { ridge: 'x', over: 0.5, overGable: 0.5 });
    crestDisc(B, drawYamanaka, 'yamanaka', 0, 4.04, 0.13, 0, 0.4); crestDisc(B, drawYamanaka, 'yamanaka', 0, 4.04, -0.13, Math.PI, 0.4);
    for (const s of [-1, 1]) flowerBucket(B, K, Y, s * 4.3, -0.2, R);
  });

  // 가운데 길의 싸리: 문에서 남쪽으로 뻗는 골목 양쪽, 그리고 그 골목에서 꽃밭으로 꺾어 드는 가로 골목 양쪽. 블록 가장자리를 따라 심는다
  {
    const hagi = [hagiGeo(1031), hagiGeo(1032)], lists = [[], []], B = new Builder();
    let li = 0;
    // (ax, az)에서 (bx, bz)까지 한 줄. (ox, oz)는 길 한가운데 쪽 — 등롱이 그쪽으로 팔을 내민다
    const row = (ax, az, bx, bz, ox, oz) => {
      const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
      for (let t = 2.2; t <= L - 2; t += 4.6) {
        const x = ax + ux * t, z = az + uz * t, s = 0.8 + R() * 0.25, k = Math.floor(R() * 2);
        lists[k].push(mat4(x + ux * (R() - 0.5), 0, z + uz * (R() - 0.5), 0, R() * 6.283, 0, [s, s, s]));
        addCollider(x - 0.3, 0, z - 0.3, x + 0.3, 1.0, z + 0.3);
        if (li++ % 6 === 3) {                                                                            // 사이사이 등롱 기둥
          const px = x + ux * 2.3, pz = z + uz * 2.3;
          B.box(M.beam, px - 0.06, 0, pz - 0.06, px + 0.06, 2.9, pz + 0.06, false); addCollider(px - 0.1, 0, pz - 0.1, px + 0.1, 2.9, pz + 0.1);
          beamBetween(B, M.beam, V(px, 2.73, pz), V(px + ox * 0.45, 2.73, pz + oz * 0.45), 0.06, 0.06);
          out.glows.push(lantern(B, px + ox * 0.45, 2.2, pz + oz * 0.45, { color: 0xe9d6ee, r: 0.17, h: 0.44 }));
        }
      }
    };
    for (const q of bb) {
      if (q[1] === xA) row(xA + 0.9, q[2], xA + 0.9, q[3], 1, 0);                    // 세로 골목의 서쪽 가장자리
      if (q[0] === xB) row(xB - 0.9, q[2], xB - 0.9, q[3], -1, 0);                   // 세로 골목의 동쪽 가장자리
      if (q[0] >= xB) { if (q[3] <= zN + 0.5) row(q[0], q[3] + 0.9, q[1], q[3] + 0.9, 0, 1); else row(q[0], q[2] - 0.9, q[1], q[2] - 0.9, 0, -1); }   // 가로 골목: 문 골목에서 꽃밭 쪽으로만
    }
    B.finish(scene);
    const hm = mat('leaf', 0xffffff, { vc: true, side: 'double' });
    hagi.forEach((g, k) => instanced(scene, g, hm, lists[k]));
  }

  // 꽃밭 둘: 띠마다 다른 꽃. 길 쪽 가장자리에 연장과 꽃 물통을 두는 헛간
  const H = Y.hues;
  const beds = [[FIELD_A, [[0, H[0][0]], [2, H[2][0]], [0, H[0][1]], [1, H[1][0]], [1, H[1][1]], [0, H[0][2]], [2, H[2][1]], [1, H[1][2]]]],
    [FIELD_B, [[1, H[1][1]], [2, H[2][1]], [0, H[0][1]], [3, H[3][0]], [0, H[0][0]], [1, H[1][0]], [3, H[3][0]], [2, H[2][0]]]]];
  for (const [bi, bands] of beds) {
    const b = bb[bi], north = b[3] <= zN + 0.5, cx = (b[0] + b[1]) / 2, sz = north ? b[3] - 6 : b[2] + 6, rect = [b[0] + 3, b[1] - 3, b[2] + 3, b[3] - 3];
    flowerField(scene, Y, rect, bands, R, (x, z) => Math.abs(x - cx) < 4.6 && Math.abs(z - sz) < 4.2);
    put(scene, { x: cx, z: sz, ry: north ? 0 : Math.PI }, B => {
      for (const [a, c] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.box(M.beam, a * 2.6 - 0.08, 0, c * 1.7 - 0.08, a * 2.6 + 0.08, 2.4, c * 1.7 + 0.08);
      B.box(M.beam, -2.75, 2.3, -1.8, 2.75, 2.42, -1.64, false); B.box(M.beam, -2.75, 2.3, 1.64, 2.75, 2.42, 1.8, false);
      gableRoof(B, tile, -2.9, -1.9, 2.9, 1.9, 2.42, 1.0, { ridge: 'x', over: 0.45, overGable: 0.4 });
      B.box(M.beamLight, -2.4, 0.5, -1.5, 2.4, 0.56, -0.7); for (const x of [-2.2, 2.2]) B.box(M.beam, x - 0.05, 0, -1.4, x + 0.05, 0.5, -0.8, false);   // 걸상 겸 선반
      for (let k = 0; k < 5; k++) flowerBucket(B, K, Y, -1.9 + k * 0.95, 0.5 + (k % 2) * 0.5, R);
      B.geo(K.tank, new THREE.CylinderGeometry(0.42, 0.38, 0.9, 14), mat4(3.6, 0.45, 0)); addCollider(3.1, 0, -0.5, 4.1, 0.9, 0.5);                      // 물 받아 두는 통
    });
    out.places.push({ n: '야마나카 꽃밭', t: '꽃집에 낼 꽃을 기르는 밭. 띠마다 다른 꽃이 철 따라 핀다.', poly: Z.blocks[bi], b });
    if (bi === FIELD_A) out.jumps.push(['야마나카 꽃밭', cx, 0, b[3] + 4, 0, 56]);
  }

  // 온실과 작업장: 길가에 꽃 다듬는 집, 그 뒤 양옆으로 유리 온실 둘, 사이와 앞은 모종밭
  {
    const b = bb[WORKS], cx = (b[0] + b[1]) / 2, cz = (b[2] + b[3]) / 2, hd = (b[3] - b[2]) / 2, gx = 19, gz = -5.5, ghw = 3.4, ghd = Math.min(10, hd - 5.5);
    for (const s of [-1, 1]) LOTS.push({ x: cx - s * gx, z: cz - gz, ry: 0, w: 2 * ghw + 0.6, d: 2 * ghd + 0.6 });   // 온실 바닥에는 풀이 나지 않게
    const local = (x, z) => [cx - x, cz - z];                           // 이 터의 제 좌표(길 쪽이 +z)
    flowerField(scene, Y, [b[0] + 3, b[1] - 3, b[2] + 3, b[3] - 3], [[2, H[2][0]], [0, H[0][1]], [1, H[1][0]], [0, H[0][0]], [1, H[1][1]]], R, (x, z) => {
      const [lx, lz] = local(x, z);
      return (Math.abs(Math.abs(lx) - gx) < ghw + 1.6 && lz > gz - ghd - 1.6 && lz < gz + ghd + 4) || (Math.abs(lx) < 9 && lz > 5) || (lz > gz + ghd + 1 && lz < gz + ghd + 3.6);
    });
    const res = put(scene, { x: cx, z: cz, ry: Math.PI }, B => {
      const fz = hd - 7;                                                 // 작업장 앞벽
      boxHouse(B, K, { x0: -6, z0: fz - 8, x1: 6, z1: fz, front: 's', floors: 2, wall: 5, roof: 0, roofKind: 'gable', rise: 2.0, shop: '花', near: true }, rngOf(1051), out.glows);
      crestDisc(B, drawYamanaka, 'yamanaka', -4.5, 2.0, fz + 0.03, 0, 0.45);
      for (let k = 0; k < 7; k++) flowerBucket(B, K, Y, -6.8 + k * 0.75 + (k > 3 ? 8.2 : 0), fz + 1.0 + (k % 2) * 0.55, R);
      addCollider(-7.2, 0, fz + 0.7, -4.2, 0.6, fz + 1.9); addCollider(4.0, 0, fz + 0.7, 6.2, 0.6, fz + 1.9);
      for (const s of [-1, 1]) glasshouse(B, K, Y, s * gx, gz, ghw, ghd, R);
      return {
        places: [{ n: '야마나카 온실과 작업장', t: '철을 타는 꽃을 기르는 유리 온실과, 밭에서 벤 꽃을 다듬어 꽃집으로 내는 작업장.', b: [-31, 31, -hd, hd], y: [0, 9] }],
        jumps: [['야마나카 온실', gx, 0, gz + ghd + 4, 0, 57]],
      };
    });
    out.places.push(...res.places); out.jumps.push(...res.jumps);
  }

  // 구역 안의 집: 흰 벽·청록 기와, 벽에 문장, 집 앞에 꽃 화분
  GROUPS.push({
    polys: Z.blocks.filter((_, i) => ![FIELD_A, FIELD_B, WORKS].includes(i)), land: 3,
    style: Rr => ({ round: false, floors: 1 + (Rr() < 0.4 ? 1 : 0), wall: Rr() < 0.65 ? 5 : 4, roof: 0, roofKind: Rr() < 0.6 ? 'gable' : 'hip', shop: Rr() < 0.05 ? ['茶', '花', '香'][Math.floor(Rr() * 3)] : null }),
    deco: (B, h) => {
      crestDisc(B, drawYamanaka, 'yamanaka', -h.w / 2 + 1.0, (h.floors >= 2 ? 3.3 : 2.75), h.d / 2 + 0.03, 0, 0.36);
      const kd = h.seed % 3, f = Y.FG[kd][h.seed % 2], hue = Y.hues[kd][(h.seed >> 2) % Y.hues[kd].length], x = h.w / 2 - 1.5, z = h.d / 2 + 0.42;
      B.box(K.pot, x - 0.75, 0, z - 0.19, x + 0.75, 0.32, z + 0.19, false);
      for (const o of [-0.48, 0, 0.48]) { const m = mat4(x + o, 0.3, z, 0, o * 9 + h.seed, 0, [0.85, 0.85, 0.85]); B.geo(Y.green, f.stem, m); B.geo(Y.petal(hue), f.head, m); if (f.eye) B.geo(Y.eye, f.eye, m); }
    },
  });
  out.places.push({ n: '야마나카 구역', t: '마음을 다루는 술법으로 이름난 야마나카 일족의 구역. 대대로 마을에서 꽃집을 해 왔고, 일족의 꽃은 싸리다.', poly: Z.poly, b: zb });
  out.jumps.push(['야마나카 구역', gate[0], 0, gate[1] - 9, yawTo(0, 1), 55]);
}
const HYUGA_FLAME = 'm 44.017838,18.131938 c 1.016788,2.170082 1.778932,4.640617 1.974502,5.486559 0.664808,2.923974 0.859802,4.430824 0.859802,6.343442 0,1.820569 -0.05858,2.298767 -0.48887,3.347034 -0.782168,1.986075 -1.661369,3.181903 -4.007973,5.499082 -2.815841,2.795196 -3.636708,3.788881 -4.55581,5.499082 -1.486129,2.795288 -2.151963,5.590631 -2.132387,8.992805 0.258246,3.353495 1.234778,6.23992 3.813947,9.048262 2.151034,1.930936 3.989331,2.849293 7.118099,3.584958 2.248817,0.533248 5.514227,0.606388 7.548,0.146689 2.757211,-0.588467 5.358629,-2.095869 6.962116,-4.026816 2.617432,-3.294598 3.99436,-8.462297 2.775336,-12.137694 -0.293349,-0.809212 -0.781491,-1.820309 -1.074753,-2.243281 -0.801744,-1.084996 -2.6007,-2.537887 -3.774001,-3.016087 l -0.99676,-0.42218 -0.02092,-3.677982 C 57.929778,38.243977 57.821739,36.634708 57.392335,34.652438 56.590588,31.83874 54.421296,27.645548 52.524557,25.27323 50.62772,22.900913 47.669824,20.127673 45.56244,18.983454 44.560555,18.439473 44.017834,18.131938 44.017834,18.131938 Z m 6.239353,9.255701 c 0.161163,0.03376 0.569616,0.565567 1.131819,1.508044 1.52528,2.537825 2.386443,4.911094 2.836207,7.77993 0.254199,1.526377 0.312058,6.72926 0.09701,7.078682 0,0 -0.134886,0.05575 -0.644851,0.184257 -1.350943,0.34042 -2.951624,0.680715 -4.300914,1.434698 -1.505802,0.845942 -3.129225,2.354859 -3.754977,3.513403 -1.036462,1.912526 -0.899597,4.284631 0.351909,6.050062 1.407921,2.004485 3.051824,3.034474 6.100413,2.758486 1.671614,-0.345634 2.839896,-0.956169 3.540026,-2.096592 0.516186,-0.980745 0.640979,-1.825508 0.507893,-2.740597 -0.245594,-1.688688 -0.62583,-1.838989 -0.62583,-1.838989 -0.03174,0.207481 -0.390436,0.882225 -0.722843,1.525932 -0.762687,1.471146 -1.604853,2.060814 -2.954144,2.060814 -1.681693,0 -2.775388,-0.810155 -3.264206,-2.391761 -0.410708,-1.34246 1.193066,-3.493526 3.3441,-4.486563 1.310138,-0.588477 3.441117,-0.918838 4.41885,-0.679783 1.838207,0.478109 3.442081,1.949166 4.106889,3.751325 1.251507,3.383765 -0.822162,8.918771 -4.087865,10.978486 -2.600797,1.636735 -5.767836,1.985357 -9.248583,1.010729 -3.324333,-0.919489 -5.475965,-2.500469 -6.825157,-5.075113 -1.564433,-2.960794 -1.525504,-6.491561 0.078,-10.445392 0.997213,-2.445866 1.937055,-3.696227 4.987615,-6.638612 0.977735,-0.956309 2.052978,-2.078342 2.385381,-2.482995 0.919103,-1.140134 1.994006,-3.273743 2.326413,-4.652931 0.332502,-1.324142 0.530018,-5.09438 0.275822,-5.921911 -0.03104,-0.108939 -0.05892,-0.183609 -0.05892,-0.183609 z';
const HYUGA_FRAME = 'm 0.82115669,13.773749 c -0.4219,-1.528053 0.68125501,-2.678524 2.31748501,-2.416879 0.87226,0.139478 0.725169,-0.05865 6.509275,8.767806 1.9423843,2.964059 3.6010913,5.463109 3.6860313,5.553448 0.085,0.09034 0.86334,-0.428751 1.72983,-1.153541 8.51375,-7.121541 18.2371,-11.08356 29.3525,-11.960424 15.10428,-1.191529 29.13783,3.43685 39.8088,13.129256 l 1.59183,1.445894 0.38685,-0.623621 c 0.21278,-0.342995 1.92438,-2.963674 3.80358,-5.823724 1.87921,-2.860056 3.78888,-5.795753 4.24382,-6.523763 0.45493,-0.728016 1.02229,-1.634571 1.2608,-2.014564 1.05004,-1.672825 3.76826,-0.785747 3.75721,1.226144 -0.005,0.648066 -0.20875,1.091374 -1.15284,2.490267 -48.09601,72.854722 0,0 -48.09601,72.854722 -49.19916131,-74.951021 0,0 -49.19916131,-74.951021 z M 83.603688,30.469081 82.456618,29.402114 c -10.08495,-9.38056 -25.1513,-14.475195 -38.30415,-12.952415 -9.88524,1.144469 -19.21417,5.08835 -26.80462,11.331869 l -1.74958,1.439107 0.72049,1.077562 c 33.73204,51.238515 0,0 33.73204,51.238515 33.55289,-51.067671 0,0 33.55289,-51.067671 z';
/* ============================ 휴가 구역 ============================
   백안을 물려받는 마을에서 가장 오래된 일족의 구역. 담을 두르고, 관저 쪽 안담 한가운데에 큰 대문, 바큇살 길 두 쪽과 바깥담에 작은 문.
   대문에서 곧장 들어간 블록이 종가(宗家)의 저택 — 따로 담을 두른 안채와 별채, 유권(柔拳)을 닦는 도장. 나머지 블록은 분가(分家)의 집들.
   종가·분가와 유권은 원작의 것이고, 저택의 짜임새(본채·별채·도장의 자리)는 지어낸 것이다. */
// 휴가 일족의 문장: 불꽃과 그것을 감싼 테(나루토 위키의 문장 그림을 따랐다)
function drawHyuga(g, cx, cy, r) {
  g.save(); g.translate(cx - r, cy - r); g.scale(r / 50, r / 50);
  g.fillStyle = '#1a1410';
  g.fill(new Path2D(HYUGA_FLAME), 'evenodd'); g.fill(new Path2D(HYUGA_FRAME), 'evenodd');
  g.restore();
}
// 팔괘 그림: 도장 바닥에 그린 둥근 진 — 가운데 태극, 둘레에 여덟 괘
function drawBagua(g, w, h) {
  const cx = w / 2, cy = h / 2, R = w * 0.47, ink = '#2a221c';
  g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = w * 0.012;
  for (const k of [1, 0.74, 0.3]) { g.beginPath(); g.arc(cx, cy, R * k, 0, Math.PI * 2); g.stroke(); }
  for (let i = 0; i < 8; i++) { const a = (i + 0.5) / 8 * Math.PI * 2; g.beginPath(); g.moveTo(cx + Math.cos(a) * R * 0.3, cy + Math.sin(a) * R * 0.3); g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.stroke(); }
  const tri = [[1, 1, 1], [0, 1, 1], [1, 0, 1], [0, 0, 1], [1, 1, 0], [0, 1, 0], [1, 0, 0], [0, 0, 0]];      // 괘마다 이어진 줄(1)·끊긴 줄(0) 셋
  for (let i = 0; i < 8; i++) {
    g.save(); g.translate(cx, cy); g.rotate(i / 8 * Math.PI * 2);
    for (let k = 0; k < 3; k++) {
      const y = -R * (0.82 + k * 0.055), bw = R * 0.16, bh = R * 0.03;
      if (tri[i][k]) g.fillRect(-bw, y, bw * 2, bh); else { g.fillRect(-bw, y, bw * 0.8, bh); g.fillRect(bw * 0.2, y, bw * 0.8, bh); }
    }
    g.restore();
  }
  // 태극
  const r = R * 0.3;
  g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2); g.arc(cx, cy + r / 2, r / 2, Math.PI / 2, -Math.PI / 2, true); g.arc(cx, cy - r / 2, r / 2, Math.PI / 2, -Math.PI / 2); g.fill();
  g.beginPath(); g.arc(cx, cy - r / 2, r * 0.12, 0, 7); g.fill();
  g.fillStyle = '#e9dcc0'; g.beginPath(); g.arc(cx, cy + r / 2, r * 0.12, 0, 7); g.fill();
}
// 지붕 얹은 문: 담은 z를 따라 서고, 문 앞(-x)이 바깥이다. half = 문 기둥 사이 반 폭. 담에 낸 틈(±3.3)의 나머지는 담으로 메운다.
function hyugaGate(B, U, K, tile, main, glows) {
  const half = main ? 2.5 : 1.4, H = main ? 4.2 : 3.4;
  for (const s of [-1, 1]) {
    B.box(M.beam, -0.24, 0, s * half - 0.24, 0.24, H, s * half + 0.24); B.box(M.stone, -0.32, 0, s * half - 0.32, 0.32, 0.45, s * half + 0.32, false);
    U.capWall(B, 'z', 0, s > 0 ? half + 0.24 : -3.3, s > 0 ? 3.3 : -half - 0.24, 3.0, 0.5, tile);
    for (const x of [-1.1, 1.1]) { B.box(M.beam, x - 0.12, 0, s * half - 0.12, x + 0.12, H - 0.9, s * half + 0.12); beamBetween(B, M.beam, V(x, H - 0.9, s * half), V(0, H - 0.25, s * half), 0.1, 0.12); }   // 버팀 기둥
    B.box(K.door, 0.3, 0.12, s * (half - 0.2) - 0.045, 0.3 + half - 0.3, H - 1.05, s * (half - 0.2) + 0.045, false);              // 안으로 활짝 연 문짝
    for (const y of [0.6, 1.6, 2.6]) if (y < H - 1.2) B.box(M.iron, 0.3, y, s * (half - 0.2) - 0.06, 0.3 + half - 0.3, y + 0.07, s * (half - 0.2) + 0.06, false);
  }
  B.box(M.beam, -0.2, H - 0.95, -half, 0.2, H - 0.62, half, false); B.box(M.beam, -0.26, H - 0.3, -half - 0.6, 0.26, H, half + 0.6, false);
  gableRoof(B, tile, -1.5, -half - 0.8, 1.5, half + 0.8, H, main ? 1.0 : 0.8, { ridge: 'z', over: 0.5, overGable: 0.4 });
  crestDisc(B, drawHyuga, 'hyuga', -0.22, H - 0.46 - 0.32, 0, -Math.PI / 2, main ? 0.42 : 0.3); crestDisc(B, drawHyuga, 'hyuga', 0.22, H - 0.46 - 0.32, 0, Math.PI / 2, main ? 0.42 : 0.3);
  if (main) for (const s of [-1, 1]) glows.push(lantern(B, -0.75, 2.5, s * (half - 0.75), { text: '日向', color: 0xf0e2c0, r: 0.2, h: 0.52 }));
}
// 돌 등롱
function stoneLantern(B, x, z) {
  B.geo(M.stone, new THREE.CylinderGeometry(0.34, 0.4, 0.22, 6), mat4(x, 0.11, z)); B.geo(M.stone, new THREE.CylinderGeometry(0.12, 0.15, 0.95, 8), mat4(x, 0.69, z));
  B.geo(M.stone, new THREE.CylinderGeometry(0.3, 0.16, 0.16, 6), mat4(x, 1.24, z)); B.geo(mat('glow', 0xffe2b0, { power: 0.7 }), new THREE.BoxGeometry(0.26, 0.3, 0.26), mat4(x, 1.47, z));
  for (const [a, c] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.box(M.stone, x + a * 0.15 - 0.03, 1.32, z + c * 0.15 - 0.03, x + a * 0.15 + 0.03, 1.62, z + c * 0.15 + 0.03, false);
  B.geo(M.stone, new THREE.ConeGeometry(0.46, 0.3, 6), mat4(x, 1.77, z)); B.geo(M.stone, new THREE.SphereGeometry(0.08, 8, 6), mat4(x, 1.96, z));
  addCollider(x - 0.3, 0, z - 0.3, x + 0.3, 1.9, z + 0.3);
}
function hyuga(scene, out) {
  const U = uchihaKit(), K = makeKit(), Z = zone(32), F = PLAN.fan, P0 = Z.poly, NP = P0.length, n2 = NP / 2, c0 = cen(P0);
  const tileHex = 0x5a4638, tile = mat('tile', tileHex), MAIN = 3;                       // 블록 번호: 종가 저택
  K.rope = mat('plain', 0x9a8046, { rough: 0.95 });
  // 담이 서는 줄: 구역 테두리의 두 옆변은 바큇살 길 한가운데라서 길 폭만큼 안으로 들인다
  const inward = (i, j) => { const a = P0[i], b = P0[j], L = Math.hypot(b[0] - a[0], b[1] - a[1]); let p = [(b[1] - a[1]) / L, -(b[0] - a[0]) / L]; if ((c0[0] - a[0]) * p[0] + (c0[1] - a[1]) * p[1] < 0) p = [-p[0], -p[1]]; return p; };
  const pA = inward(n2 - 1, n2), pB = inward(NP - 1, 0);
  const W = P0.map((q, i) => (i === n2 - 1 || i === n2 ? [q[0] + pA[0] * 8.5, q[1] + pA[1] * 8.5] : i === NP - 1 || i === 0 ? [q[0] + pB[0] * 8.5, q[1] + pB[1] * 8.5] : q));
  const onWall = pt => { let best = null, bd = 1e9; for (let i = 0; i < NP; i++) { const a = W[i], b = W[(i + 1) % NP], dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0.08, Math.min(0.92, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dz) / (dx * dx + dz * dz))), q = [a[0] + dx * t, a[1] + dz * t], d = Math.hypot(q[0] - pt[0], q[1] - pt[1]); if (d < bd) { bd = d; best = q; } } return best; };
  const bc = i => cen(Z.blocks[i]), rOf = q => Math.hypot(q[0] - F[0], q[1] - F[1]), at = (q, r) => { const l = rOf(q); return [F[0] + (q[0] - F[0]) / l * r, F[1] + (q[1] - F[1]) / l * r]; };
  const rIn = Math.min(...P0.map(rOf)), rOut = Math.max(...P0.map(rOf)), rMid = (rOf(bc(3)) + rOf(bc(6))) / 2;
  // 문: 안담 한가운데(큰 대문), 바깥담 한가운데, 두 옆담의 가운데 고리 골목 어귀
  const gates = [{ at: onWall(at(mid(bc(0), bc(1)), rIn)), main: true }, { at: onWall(at(mid(bc(9), bc(10)), rOut)) },
    { at: onWall(at(mid(P0[n2 - 1], P0[n2]), rMid)) }, { at: onWall(at(mid(P0[NP - 1], P0[0]), rMid)) }];

  for (let i = 0; i < NP; i++) {
    const a = W[i], b = W[(i + 1) % NP], L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L, ry = Math.atan2(ux, uz);
    const open = s => { const x = a[0] + ux * s, z = a[1] + uz * s; return gates.some(g => Math.hypot(g.at[0] - x, g.at[1] - z) < 3.3); };
    let s0 = null;
    for (let s = 0; s <= L + 0.25; s += 0.25) {
      const stop = s > L || open(s);
      if (!stop && s0 === null) s0 = s;
      if (stop && s0 !== null) { const len = s - 0.25 - s0, st = s0; if (len > 0.6) put(scene, { x: a[0] + ux * st, z: a[1] + uz * st, ry }, B => { U.capWall(B, 'z', 0, 0, len, 3.0, 0.5, tile); }); s0 = null; }
    }
    for (const g of gates) {
      if (segDist(g.at[0], g.at[1], a, b) > 0.3) continue;
      const outward = (c0[0] - g.at[0]) * -uz + (c0[1] - g.at[1]) * ux < 0;
      g.ry = outward ? ry : ry + Math.PI; g.out = outward ? [-uz, ux] : [uz, -ux];
      put(scene, { x: g.at[0], z: g.at[1], ry: g.ry }, B => { hyugaGate(B, U, K, tile, !!g.main, out.glows); });
    }
  }
  const G = gates[0];

  // 종가의 저택: 담을 두른 터에 본채, 별채, 도장, 안마당
  {
    const c = bc(MAIN), A = Math.atan2(c[0] - F[0], c[1] - F[1]), u = [Math.sin(A), Math.cos(A)], back = Math.atan2(-u[0], -u[1]);   // 저택의 앞(+z)이 관저 쪽 = 대문 골목 쪽
    const HW = 23, HD = 24;
    LOTS.push({ x: c[0], z: c[1], ry: back, w: HW * 2 + 2, d: HD * 2 + 2 });
    put(scene, { x: c[0] - u[0] * HD, z: c[1] - u[1] * HD, ry: Math.atan2(-u[1], u[0]) }, B => { hyugaGate(B, U, K, tile, true, out.glows); signBoard(B, '日向', -0.3, 1.5, -2.5 - 0.5, -Math.PI / 2, 0.2, 0.55, { vertical: true, both: false, depth: 0.04 }); });
    const res = put(scene, { x: c[0], z: c[1], ry: back }, B => {
      const wm = mat('plaster', 0xf1eadb), base = { front: 's', wall: 5, roof: 3, roofHex: tileHex, shop: null, near: true };
      // 터의 담(앞쪽 한가운데는 문 자리)
      U.capWall(B, 'x', -HD, -HW, HW, 2.8, 0.5, tile); U.capWall(B, 'z', -HW, -HD, HD, 2.8, 0.5, tile); U.capWall(B, 'z', HW, -HD, HD, 2.8, 0.5, tile);
      U.capWall(B, 'x', HD, -HW, -3.3, 2.8, 0.5, tile); U.capWall(B, 'x', HD, 3.3, HW, 2.8, 0.5, tile);
      // 본채 앞의 툇마루(본채와 별채는 건물 파일 b_homes.js가 짓는다)
      B.box(M.floor, -11.4, 0, -10.5, 13.4, 0.42, -8.7); for (const x of [-11.2, -7.2, -3.2, -1.0, 3.0, 7.0, 10.2, 13.2]) B.box(M.beam, x - 0.09, 0.42, -8.95, x + 0.09, 2.9, -8.77, false);
      B.box(M.beam, -11.4, 2.84, -9.0, 13.4, 3.0, -8.72, false); B.box(M.stone, -0.9, 0, -8.7, 2.9, 0.2, -8.0, false);
      for (const x of [-4.3, 5.9]) crestDisc(B, drawHyuga, 'hyuga', x, 2.2, -10.46, 0, 0.42);
      // 도장: 서쪽. 마루를 높이고 안마당 쪽을 튼 수련장. 바닥에 팔괘 진, 안벽에 "柔拳"
      const dx0 = -21, dx1 = -8.5, dz0 = -6, dz1 = 12, dh = 3.7, fy = 0.42;
      B.box(M.floor, dx0, 0, dz0, dx1, fy, dz1);
      B.box(wm, dx0, fy, dz0, dx0 + 0.2, dh - 0.24, dz1); B.box(wm, dx0 + 0.2, fy, dz0, dx1, dh - 0.24, dz0 + 0.2);                                    // 서쪽·북쪽 벽
      B.box(K.stone, dx0 - 0.06, 0, dz0 - 0.06, dx0 + 0.1, 0.9, dz1 + 0.06, false);
      for (let z = dz0; z <= dz1 + 0.01; z += 4.5) for (const x of [dx0 + 0.1, dx1 - 0.1]) B.box(M.beam, x - 0.11, 0, z - 0.11, x + 0.11, dh, z + 0.11, x > dx0 + 1);
      for (let x = dx0 + 0.1; x <= dx1; x += 4.1) B.box(M.beam, x - 0.11, 0, dz1 - 0.21, x + 0.11, dh, dz1 + 0.01);
      B.box(M.beam, dx0, dh - 0.24, dz0, dx1, dh, dz0 + 0.2, false); B.box(M.beam, dx0, dh - 0.24, dz1 - 0.2, dx1, dh, dz1, false); B.box(M.beam, dx1 - 0.2, dh - 0.24, dz0, dx1, dh, dz1, false); B.box(M.beam, dx0, dh - 0.24, dz0, dx0 + 0.2, dh, dz1, false);
      hipRoof(B, tile, dx0 - 0.2, dz0 - 0.2, dx1 + 0.2, dz1 + 0.2, dh, 2.4, { over: 1.0 });
      B.box(M.beamLight, dx0 + 0.2, dh - 0.06, dz0 + 0.2, dx1, dh - 0.02, dz1, false);                                              // 천장 널
      const bagua = textMat(' ', { w: 512, h: 512, bg: '#c9a878', color: '#c9a878', key: 'bagua', draw: drawBagua });
      B.geo(bagua, new THREE.PlaneGeometry(7.6, 7.6).rotateX(-Math.PI / 2), mat4((dx0 + dx1) / 2 + 0.1, fy + 0.012, (dz0 + dz1) / 2));
      signBoard(B, '柔拳', dx0 + 0.24, 2.55, (dz0 + dz1) / 2, Math.PI / 2, 2.6, 1.0, { both: false });
      for (const s of [-1, 1]) crestDisc(B, drawHyuga, 'hyuga', dx0 + 0.24, 2.55, (dz0 + dz1) / 2 + s * 2.6, Math.PI / 2, 0.45);
      B.box(M.stone, dx1, 0, 1.5, dx1 + 0.7, 0.2, 4.5, false);                                                                        // 오르는 디딤돌
      // 목인(木人) 둘: 도장 북쪽 벽 앞
      for (const x of [-18, -12]) {
        B.geo(M.beam, new THREE.CylinderGeometry(0.16, 0.17, 1.7, 12), mat4(x, fy + 0.85, dz0 + 1.2));
        for (const [y, a] of [[1.35, 0.5], [1.35, -0.5], [0.95, 0]]) B.geo(M.beamLight, new THREE.CylinderGeometry(0.04, 0.04, 0.6, 8).rotateX(Math.PI / 2), mat4(x + Math.sin(a) * 0.1, fy + y, dz0 + 1.2 + 0.4, 0, a, 0));
        addCollider(x - 0.2, fy, dz0 + 1.0, x + 0.2, fy + 1.7, dz0 + 1.7);
      }
      // 안마당: 문에서 본채로 가는 판석 길, 돌 등롱, 수련 말뚝, 담 밑 떨기나무
      B.box(M.pave, -0.2, 0, -8.0, 2.2, 0.03, HD, false); B.box(M.pave, dx1 + 0.7, 0, 2.2, -0.2, 0.03, 3.8, false);
      for (const s of [-1, 1]) stoneLantern(B, 1 + s * 2.6, 14);
      for (const [x, z] of [[6, 15], [8.5, 17.5], [5.5, 19.5]]) {
        B.geo(M.beam, new THREE.CylinderGeometry(0.15, 0.17, 1.9, 12), mat4(x, 0.95, z));
        for (const y of [0.9, 1.2, 1.5]) B.geo(K.rope, new THREE.TorusGeometry(0.165, 0.03, 5, 14).rotateX(Math.PI / 2), mat4(x, y, z));
        addCollider(x - 0.2, 0, z - 0.2, x + 0.2, 1.9, z + 0.2);
      }
      for (let k = 0; k < 9; k++) { const x = -20 + k * 5.1; if (Math.abs(x - 1) < 4.5) continue; B.geo(K.leaf, K.bush.leaves, mat4(x, 0, HD - 1.4, 0, k * 1.7, 0, [1.5, 1.2, 1.5])); }
      for (let k = 0; k < 4; k++) B.geo(K.leaf, K.bush.leaves, mat4(HW - 1.5, 0, 12 + k * 3.2, 0, k * 2.3, 0, [1.4, 1.3, 1.4]));
      return {
        places: [{ n: '휴가 종가', t: '일족을 이끄는 종가(宗家)의 저택. 히아시와 두 딸 히나타·하나비가 산다. 분가는 이 집을 지키는 쪽이다.', b: [-HW, HW, -HD, HD], y: [0, 12] },
          { n: '휴가 도장', t: '유권(柔拳)을 닦는 수련장. 바닥의 팔괘 진 위에서 상대의 점혈을 짚는 법을 익힌다.', b: [dx0, dx1, dz0, dz1], y: [0, 7] }],
        jumps: [['휴가 종가', 1, 0, HD + 7, 0, 61], ['휴가 도장', -2, 0, 3, Math.PI / 2, 62]],
      };
    });
    out.places.push(...res.places); out.jumps.push(...res.jumps);
  }

  // 분가의 집: 흰 벽·짙은 밤빛 기와, 벽마다 문장
  GROUPS.push({
    polys: Z.blocks.filter((_, i) => i !== MAIN), land: 3,
    ok: (x, z) => { if (!inPoly(x, z, W)) return false; for (let i = 0; i < NP; i++) if (segDist(x, z, W[i], W[(i + 1) % NP]) < 2.4) return false; return true; },
    style: Rr => ({ round: false, floors: 1 + (Rr() < 0.35 ? 1 : 0), wall: 5, roof: 3, roofHex: tileHex, roofKind: Rr() < 0.55 ? 'hip' : 'gable', shop: null }),
    deco: (B, h) => crestDisc(B, drawHyuga, 'hyuga', -h.w / 2 + 1.0, (h.floors >= 2 ? 3.3 : 2.75), h.d / 2 + 0.03, 0, 0.36),
  });
  out.places.push({ n: '휴가 구역', t: '백안을 물려받는, 마을에서 가장 오래된 일족의 구역. 일족을 이끄는 종가와 그를 지키는 분가로 나뉜다.', poly: W, b: bound(W) });
  out.jumps.push(['휴가 구역 대문', G.at[0] + G.out[0] * 9, 0, G.at[1] + G.out[1] * 9, yawTo(-G.out[0], -G.out[1]), 60]);
}
const SARUTOBI_CREST = 'm47.19568,1.70248c-2.57751,0.6615 -5.1778,2.85124 -6.3868,5.40594c-0.7071,1.48265 -0.8208,1.75604 -1.0935,4.49321c0.2727,2.5554 0.3864,2.8288 1.0935,4.3114c1.2774,2.7144 3.9005,4.8357 6.6833,5.4288l1.1405,0.2509l0,11.7471l0,11.7699l-1.18609,-0.1597c-3.6724,-0.479 -8.8274,-2.7372 -11.9752,-5.2462c-2.1213,-1.688 -4.4479,-4.4708 -5.6568,-6.7974c-0.7528,-1.4142 -0.7984,-1.5739 -0.4106,-1.6879c2.3494,-0.7756 4.6988,-2.646 5.9306,-4.6761c1.916,-3.2162 1.916,-8.1431 0,-11.3365c-1.9617,-3.2618 -5.2691,-5.0638 -9.2837,-5.0638c-4.0829,0 -7.43604,1.8704 -9.42044,5.2463c-1.2546,2.1669 -1.6652,5.7937 -0.9581,8.5537c1.1177,4.2654 5.36044,7.6413 9.62584,7.6413l0.9808,0l0.8896,1.802c2.9653,5.8622 8.7818,10.8119 15.237,12.9104c1.4142,0.479 5.2007,1.2545 6.0675,1.2545c0.0912,0 0.1596,3.0794 0.1596,6.843c0,3.7636 -0.06839,6.843 -0.1596,6.843c-0.1141,0 -1.1177,0.1596 -2.2354,0.3421c-8.0747,1.3002 -15.4651,6.6605 -19.0691,13.8456l-0.8896,1.7792l-0.9808,0c-3.3074,0 -6.84304,2.1441 -8.66774,5.2463c-1.7792,3.0565 -1.7336,8.029 0.1368,11.1312c1.9617,3.2618 5.26914,5.0638 9.28364,5.0638c4.0146,0 7.322,-1.802 9.2837,-5.0638c1.916,-3.19341 1.916,-8.1203 0,-11.3365c-1.2318,-2.0301 -3.5812,-3.90051 -5.9306,-4.676c-0.3878,-0.1141 -0.3422,-0.2738 0.4106,-1.688c1.2089,-2.3266 3.5355,-5.10941 5.6568,-6.7973c3.1478,-2.5091 8.3028,-4.7673 11.9752,-5.2463l1.18609,-0.1597l0,16.6969l0,16.674l1.14051,0l1.1405,0l0,-16.7653l0,-16.7653l0.7527,0c0.3878,0 1.6652,0.1597 2.7829,0.3422c5.999,0.95799 11.8383,4.2655 15.2598,8.57649c1.3458,1.7108 3.0337,4.4708 2.8284,4.65321c-0.0228,0.0229 -0.7299,0.2282 -1.5511,0.4334c-4.6988,1.1862 -7.7554,5.2919 -7.7554,10.4013c0,4.083 1.87051,7.4361 5.2463,9.4205c2.9653,1.7336 7.98351,1.7336 10.94881,0c3.3758,-1.9844 5.2463,-5.3375 5.2463,-9.4205c0,-5.4059 -3.23911,-9.4432 -8.4853,-10.58369c-0.5246,-0.11411 -0.82121,-0.479 -1.52831,-1.9161c-2.9653,-5.9077 -8.7818,-10.8347 -15.237,-12.9332c-2.0757,-0.6843 -5.3603,-1.2545 -7.1851,-1.2545l-1.323,0l0,-6.843l0,-6.843l1.323,0c1.8248,0 5.10941,-0.5702 7.1851,-1.2545c6.4324,-2.0985 12.2717,-7.0482 15.237,-12.9104c0.7071,-1.4598 1.0037,-1.8248 1.52831,-1.9389c3.1477,-0.6842 5.6112,-2.4406 7.1851,-5.1322c1.7335,-2.9424 1.7335,-7.9606 0,-10.9259c-1.9845,-3.3759 -5.3375,-5.2463 -9.4205,-5.2463c-4.083,0 -7.436,1.8704 -9.4205,5.2463c-1.2545,2.1669 -1.6651,5.7937 -0.958,8.5537c0.9124,3.5127 3.8549,6.4096 7.4132,7.322c0.82121,0.2053 1.52831,0.4105 1.5511,0.4334c0.2053,0.1824 -1.4826,2.9424 -2.8284,4.6532c-3.4215,4.311 -9.2608,7.6185 -15.2598,8.5765c-1.1177,0.1825 -2.3951,0.3422 -2.7829,0.3422l-0.7527,0l0,-11.8384l0,-11.8383l1.1177,-0.1597c2.8512,-0.3877 5.81651,-2.6915 7.1623,-5.52c0.7071,-1.4826 0.9435,-1.7151 1.0935,-4.4023c-0.3,-2.58712 -0.3864,-2.9196 -1.0935,-4.40225c-0.958,-2.03006 -2.75999,-3.83204 -4.7901,-4.76725c-1.3686,-0.63869 -1.9842,-0.93505 -4.1284,-0.98067c-1.3229,-0.04563 -2.6005,0.22794 -3.0795,0.34198l0,-0.00002l0,-0.00002l0,-0.00002zm6.11309,2.91968c1.75631,0.84395 2.76001,1.84758 3.62671,3.69519c0.59309,1.23174 0.7071,1.75635 0.7071,3.19338c0,1.437 -0.11401,1.9617 -0.7071,3.1934c-0.88961,1.8704 -1.8704,2.8512 -3.74081,3.7408c-1.2317,0.5931 -1.75639,0.7071 -3.19339,0.7071c-1.437,0 -1.96161,-0.114 -3.1934,-0.7071c-1.8704,-0.8896 -2.8512,-1.8704 -3.7408,-3.7408c-1.73351,-3.6724 -0.2281,-8.14313 3.3075,-9.94511c2.3494,-1.18611 4.58471,-1.23174 6.9342,-0.13686zm-24.2698,8.48527c2.7144,1.0264 4.4023,3.0109 5.1323,5.999c0.479,1.8704 0.2281,3.6039 -0.73,5.5884c-1.1405,2.3495 -3.3074,3.8777 -6.1814,4.4252c-1.7564,0.3193 -3.9005,-0.1369 -5.7481,-1.2546c-4.99544,-2.9653 -4.99544,-11.04 0,-14.0053c2.4862,-1.4826 4.9725,-1.7335 7.5272,-0.7527zm47.9008,0c2.7144,1.0264 4.40231,3.0109 5.1322,5.999c0.3193,1.3002 0.3421,1.802 0.1368,2.9653c-0.7298,3.832 -3.2161,6.3183 -7.0482,7.0483c-1.7563,0.3193 -3.9005,-0.1369 -5.7482,-1.2546c-4.9952,-2.9653 -4.9952,-11.04 0,-14.0053c2.4864,-1.4826 4.9726,-1.7335 7.5274,-0.7527zm-47.9008,67.0611c2.7144,1.0264 4.4023,3.01089 5.1323,5.999c0.3193,1.30009 0.3421,1.80199 0.1368,2.96529c-0.7299,3.832 -3.2162,6.31831 -7.0482,7.0482c-1.7564,0.3194 -3.9005,-0.1368 -5.7481,-1.2545c-4.99544,-2.9653 -4.99544,-11.04 0,-14.00529c2.4862,-1.4826 4.9725,-1.73351 7.5272,-0.7527zm47.9008,0c2.7144,1.0264 4.40231,3.01089 5.1322,5.999c0.3193,1.30009 0.3421,1.80199 0.1368,2.96529c-0.7298,3.832 -3.2161,6.31831 -7.0482,7.0482c-1.7563,0.3194 -3.9005,-0.1368 -5.7482,-1.2545c-4.9952,-2.9653 -4.9952,-11.04 0,-14.00529c2.4864,-1.4826 4.9726,-1.73351 7.5274,-0.7527z';
/* ============================ 사루토비 구역 ============================
   3대 호카게 히루젠을 낸 일족의 구역. 관저 바로 옆의 작은 구역이라 담은 없고, 두 블록 사이 골목 어귀에 나무 문과 화톳불.
   관저 쪽 길가에 본가(히루젠과 코노하마루의 집 — 건물 파일 b_homes.js가 짓는다), 나머지는 일족의 집. 집은 누런 벽에 주황 기와.
   화톳불은 원작에 없는, "불의 의지"와 화둔을 쓰는 일족이라는 데서 지어낸 것이다. */
// 사루토비 일족의 문장(나루토 위키의 문장 그림을 따랐다)
function drawSarutobi(g, cx, cy, r) {
  g.save(); g.translate(cx - r * 0.9, cy - r * 0.9); g.scale(r * 0.9 / 50, r * 0.9 / 50);
  g.fillStyle = '#1a1410'; g.fill(new Path2D(SARUTOBI_CREST), 'evenodd');
  g.restore();
}
// 화톳불: 세 다리 위의 쇠 바구니에 장작과 불꽃
function kagaribi(B, x, z) {
  for (let k = 0; k < 3; k++) { const a = k * 2.094 + 0.4; beamBetween(B, M.iron, V(x + Math.cos(a) * 0.42, 0, z + Math.sin(a) * 0.42), V(x - Math.cos(a) * 0.08, 1.3, z - Math.sin(a) * 0.08), 0.035, 0.035); }
  B.geo(M.iron, new THREE.CylinderGeometry(0.3, 0.19, 0.3, 10, 1, true), mat4(x, 1.42, z)); B.geo(M.iron, new THREE.TorusGeometry(0.3, 0.02, 5, 14).rotateX(Math.PI / 2), mat4(x, 1.57, z));
  for (let k = 0; k < 4; k++) B.geo(M.beam, new THREE.CylinderGeometry(0.035, 0.035, 0.44, 6), mat4(x + Math.cos(k * 1.57) * 0.07, 1.52, z + Math.sin(k * 1.57) * 0.07, 0.5, k * 1.57, 0.4));
  const hot = mat('glow', 0xff8a2a, { power: 1.6 }), core = mat('glow', 0xffd65a, { power: 2 });
  B.geo(hot, new THREE.ConeGeometry(0.2, 0.6, 7), mat4(x, 1.9, z)); B.geo(hot, new THREE.ConeGeometry(0.12, 0.42, 6), mat4(x + 0.1, 1.82, z - 0.06, 0, 0, -0.25));
  B.geo(core, new THREE.ConeGeometry(0.1, 0.36, 6), mat4(x - 0.03, 1.8, z + 0.03));
  addCollider(x - 0.3, 0, z - 0.3, x + 0.3, 1.7, z + 0.3);
}
function sarutobi(scene, out) {
  const K = makeKit(), Z = zone(6), F = PLAN.fan, tile = mat('tile', ROOFS[4]);
  const rOf = q => Math.hypot(q[0] - F[0], q[1] - F[1]), aOf = q => Math.atan2(q[0] - F[0], q[1] - F[1]);
  const rL = (Math.max(...Z.blocks[0].map(rOf)) + Math.min(...Z.blocks[1].map(rOf))) / 2;      // 두 블록 사이 골목의 한가운데
  const a0 = Math.min(...Z.poly.map(aOf)), a1 = Math.max(...Z.poly.map(aOf));
  // 골목의 두 어귀에 문: 가운데 큰길 쪽(각이 작은 쪽)이 큰 문
  const gates = [a0 + 9 / rL, a1 - 9 / rL].map((a, i) => ({ x: F[0] + Math.sin(a) * rL, z: F[1] + Math.cos(a) * rL, a, sgn: i ? -1 : 1 }));
  for (const g of gates) {
    put(scene, { x: g.x, z: g.z, ry: Math.atan2(Math.cos(g.a), -Math.sin(g.a)) }, B => {
      for (const s of [-1, 1]) { B.box(M.beam, s * 2.9 - 0.2, 0, -0.2, s * 2.9 + 0.2, 4.3, 0.2); B.box(M.stone, s * 2.9 - 0.3, 0, -0.3, s * 2.9 + 0.3, 0.4, 0.3, false); }
      B.box(M.beam, -3.8, 3.3, -0.11, 3.8, 3.54, 0.11, false); B.box(M.beam, -4.2, 4.14, -0.16, 4.2, 4.4, 0.16, false);
      gableRoof(B, tile, -4.0, -0.7, 4.0, 0.7, 4.4, 0.7, { ridge: 'x', over: 0.5, overGable: 0.5 });
      crestDisc(B, drawSarutobi, 'sarutobi', 0, 3.84, 0.13, 0, 0.4); crestDisc(B, drawSarutobi, 'sarutobi', 0, 3.84, -0.13, Math.PI, 0.4);
      for (const s of [-1, 1]) kagaribi(B, s * 3.9, -g.sgn * 1.4);
    });
  }
  GROUPS.push({
    polys: Z.blocks, land: 3,
    style: Rr => ({ round: false, floors: 1 + (Rr() < 0.45 ? 1 : 0), wall: Rr() < 0.6 ? 0 : 1, roof: 4, roofKind: Rr() < 0.6 ? 'gable' : 'hip', shop: Rr() < 0.05 ? ['茶', '書', '忍具'][Math.floor(Rr() * 3)] : null }),
    deco: (B, h) => crestDisc(B, drawSarutobi, 'sarutobi', -h.w / 2 + 1.0, (h.floors >= 2 ? 3.3 : 2.75), h.d / 2 + 0.03, 0, 0.36),
  });
  out.places.push({ n: '사루토비 구역', t: '3대 호카게 히루젠을 낸 일족의 구역. 화둔을 쓰고, 대대로 "불의 의지"를 받든다.', poly: Z.poly, b: bound(Z.poly) });
  const g = gates[0], t = [Math.cos(g.a), -Math.sin(g.a)];
  out.jumps.push(['사루토비 구역', g.x - t[0] * 9, 0, g.z - t[1] * 9, yawTo(t[0], t[1]), 65]);
}
const INUZUKA_FANGS = ['m1.01746,33.7875c-0.25871,1.3223 -0.20122,5.1167 0.11499,9.0261c2.15592,24.9224 14.97645,39.9851 36.50695,42.8597c1.6672,0.20119 3.162,0.4025 3.3057,0.4025c0.1725,0 -1.0061,-1.3223 -2.5871,-2.9321c-7.5026,-7.6751 -11.9294,-18.081 -13.108,-30.7866c-0.4024,-4.1106 -0.1724,-11.6707 0.4599,-15.8675c0.23,-1.5811 0.4312,-3.0471 0.4312,-3.2483c0,-0.2587 -2.6733,-0.3449 -12.4756,-0.3449l-12.44681,0l-0.20122,0.8911l-0.00001,0z',
  'm73.85887,33.24129c0,0.20123 0.20122,1.66725 0.43118,3.24827c0.63242,4.19686 0.86237,11.75696 0.45993,15.86758c-1.17857,12.70556 -5.60538,23.11147 -13.108,30.78656c-1.58102,1.60976 -2.73084,2.93206 -2.58711,2.93206c0.17247,0 1.6385,-0.20123 3.30575,-0.40244c21.53046,-2.87458 34.35101,-17.93728 36.50694,-42.85973c0.31619,-3.9094 0.3737,-7.70382 0.11497,-9.02612l-0.17246,-0.89111l-12.47561,0c-9.80225,0 -12.47559,0.08623 -12.47559,0.34493z'];
/* ============================ 이누즈카 구역과 견사 ============================
   닌견과 짝을 이뤄 싸우는 일족의 구역. 공원 쪽(북쪽) 가운데 골목 어귀에 나무 문, 집마다 문장과 개집.
   가운데 골목 옆 블록에 본가(츠메·하나·키바의 집 — 건물 파일 b_homes.js가 짓는다).
   동쪽 견사: 울타리 친 놀이터 둘에서 닌견들이 놀고, 개집이 늘어선 마당, 훈련 마당, 관리동(하나가 보는 동물 진료소)이 있다.
   닌견과 뺨의 붉은 송곳니 무늬, 하나가 수의사라는 것은 원작의 것이고, 견사의 짜임새와 진료소 건물은 지어낸 것이다. */
// 이누즈카 일족의 문장: 붉은 송곳니 둘과 그 위의 세모(나루토 위키의 문장 그림을 따랐다)
function drawInuzuka(g, cx, cy, r) {
  g.save(); g.translate(cx - r * 0.92, cy - r * 0.92); g.scale(r * 0.92 / 50, r * 0.92 / 50);
  g.fillStyle = '#b3261a';
  for (const d of INUZUKA_FANGS) g.fill(new Path2D(d));
  g.translate(50, 13.9743); g.rotate(-Math.PI / 4); g.translate(-50, -13.9743);
  g.beginPath(); g.moveTo(42.26528, 21.70905); g.lineTo(42.26528, 6.23961); g.lineTo(57.73472, 21.70905); g.closePath(); g.fill();
  g.restore();
}
// 개집: 널로 짠 작은 집에 맞배지붕. 문은 +z 쪽. s = 크기
function doghouse(B, K, tile, x, z, s = 1, solid = true) {
  const w = 0.5 * s, d = 0.62 * s, h = 0.68 * s;
  B.box(K.door, x - w, 0.05, z - d, x + w, h, z + d, false); B.box(K.wood, x - w - 0.03, 0, z - d - 0.03, x + w + 0.03, 0.06, z + d + 0.03, false);
  B.box(K.dark, x - 0.2 * s, 0.06, z + d - 0.01, x + 0.2 * s, 0.46 * s, z + d + 0.012, false);
  B.geo(K.dark, new THREE.CircleGeometry(0.2 * s, 12, 0, Math.PI), mat4(x, 0.46 * s, z + d + 0.012));
  B.prism(tile, 'z', [[x - w - 0.14, h], [x + w + 0.14, h], [x, h + 0.42 * s]], z - d - 0.12, z + d + 0.12);
  if (solid) addCollider(x - w, 0, z - d, x + w, h + 0.3, z + d);   // 길가 집의 꾸밈으로 놓을 때는 충돌 상자를 두지 않는다(집의 제 좌표라 자리가 맞지 않는다)
}
// 나무 울타리를 네모로 두른다. 문은 gate([x, z]) 둘레를 비운다
function railFence(B, x0, z0, x1, z1, gate) {
  const P = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  for (let i = 0; i < 4; i++) {
    const a = P[i], b = P[(i + 1) % 4], L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.round(L / 2.4));
    let prev = null;
    for (let j = 0; j <= k; j++) {
      const x = a[0] + (b[0] - a[0]) * j / k, z = a[1] + (b[1] - a[1]) * j / k;
      if (Math.hypot(x - gate[0], z - gate[1]) < 1.5) { prev = null; continue; }
      B.box(M.beam, x - 0.07, 0, z - 0.07, x + 0.07, 1.35, z + 0.07, false);
      if (prev) { for (const y of [0.3, 0.7, 1.15]) beamBetween(B, M.beamLight, V(prev[0], y, prev[1]), V(x, y, z), 0.045, 0.1); for (let s = 0; s < 5; s++) { const cx = prev[0] + (x - prev[0]) * (s + 0.5) / 5, cz = prev[1] + (z - prev[1]) * (s + 0.5) / 5; addCollider(cx - 0.26, 0, cz - 0.26, cx + 0.26, 1.3, cz + 0.26); } }
      prev = [x, z];
    }
  }
}
function inuzuka(scene, out) {
  const K = makeKit(), Z = zone(21), Zk = zone(22), R = rngOf(2121), tileHex = 0x77706a, tile = mat('tile', tileHex);
  const bb = Z.blocks.map(bound), kb = Zk.blocks.map(bound), zb = bound(Z.poly);
  // 들머리의 나무 문: 공원 쪽 가운데 골목 어귀
  const lane = [(bb[1][1] + bb[0][0]) / 2, zb[2] + 4];
  put(scene, { x: lane[0], z: lane[1], ry: 0 }, B => {
    for (const s of [-1, 1]) { B.box(M.beam, s * 2.6 - 0.2, 0, -0.2, s * 2.6 + 0.2, 4.2, 0.2); B.box(M.stone, s * 2.6 - 0.3, 0, -0.3, s * 2.6 + 0.3, 0.4, 0.3, false); }
    B.box(M.beam, -3.4, 3.2, -0.11, 3.4, 3.44, 0.11, false); B.box(M.beam, -3.8, 4.04, -0.16, 3.8, 4.3, 0.16, false);
    gableRoof(B, tile, -3.6, -0.7, 3.6, 0.7, 4.3, 0.7, { ridge: 'x', over: 0.5, overGable: 0.5 });
    crestDisc(B, drawInuzuka, 'inuzuka', 0, 3.74, 0.13, 0, 0.4); crestDisc(B, drawInuzuka, 'inuzuka', 0, 3.74, -0.13, Math.PI, 0.4);
  });
  // 구역 안의 집: 누런 벽·잿빛 기와, 벽에 문장, 두 집에 한 집꼴로 문 옆에 개집
  GROUPS.push({
    polys: Z.blocks, land: 3,
    style: Rr => ({ round: false, floors: 1 + (Rr() < 0.4 ? 1 : 0), wall: Rr() < 0.6 ? 0 : 4, roof: 3, roofHex: tileHex, roofKind: Rr() < 0.6 ? 'gable' : 'hip', shop: Rr() < 0.05 ? ['肉', '骨', '薬'][Math.floor(Rr() * 3)] : null }),
    deco: (B, h) => {
      crestDisc(B, drawInuzuka, 'inuzuka', -h.w / 2 + 1.0, (h.floors >= 2 ? 3.3 : 2.75), h.d / 2 + 0.03, 0, 0.36);
      if (h.seed % 2) { doghouse(B, K, tile, h.w / 2 - 1.2, h.d / 2 + 0.85, 0.9 + (h.seed % 3) * 0.12, false); B.geo(M.iron, new THREE.CylinderGeometry(0.13, 0.1, 0.07, 10), mat4(h.w / 2 - 2.2, 0.035, h.d / 2 + 1.1)); }
    },
  });
  out.places.push({ n: '이누즈카 구역', t: '닌견과 짝을 이뤄 싸우는 이누즈카 일족의 구역. 뺨에 붉은 송곳니 무늬를 그리고, 코가 개만큼 밝다.', poly: Z.poly, b: zb });
  out.jumps.push(['이누즈카 구역', lane[0], 0, lane[1] - 9, yawTo(0, 1), 68]);

  /* ---------- 견사 ---------- */
  const [RUN_A, RUN_B, HOUSES, TRAIN, OFFICE, STORE] = [2, 1, 6, 5, 0, 4];                      // 견사 블록 번호: 놀이터 둘, 개집 마당, 훈련 마당, 관리동, 사료 창고
  // 놀이터: 울타리 안에서 닌견들이 걷고 뛰고 냄새를 맡는다
  for (const [bi, n, seed] of [[RUN_A, 7, 2201], [RUN_B, 6, 2202]]) {
    const b = kb[bi], x0 = b[0] + 1.2, x1 = b[1] - 1.2, z0 = b[2] + 1.2, z1 = b[3] - 1.2, gate = [(x0 + x1) / 2, z1], B = new Builder();
    railFence(B, x0, z0, x1, z1, gate);
    B.geo(K.tank, new THREE.CylinderGeometry(0.5, 0.45, 0.32, 14), mat4(x0 + 1.6, 0.16, z0 + 1.6)); B.geo(M.water, new THREE.CircleGeometry(0.46, 14).rotateX(-Math.PI / 2), mat4(x0 + 1.6, 0.29, z0 + 1.6));   // 물통
    addCollider(x0 + 1.1, 0, z0 + 1.1, x0 + 2.1, 0.32, z0 + 2.1);
    for (let k = 0; k < 3; k++) B.geo(M.beamLight, new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8).rotateZ(Math.PI / 2), mat4(x1 - 2 - k * 1.3, 0.05, z0 + 2 + k * 2.1, 0, k * 1.1, 0));                       // 물고 노는 나무토막
    B.finish(scene);
    const pack = new Pack(scene, [[x0 + 1.2, z0 + 1.2], [x1 - 1.2, z0 + 1.2], [x1 - 1.2, z1 - 1.2], [x0 + 1.2, z1 - 1.2]], n, rngOf(seed));
    out.ticks.push((t, dt) => pack.tick(t, dt, out.eye && out.eye.position));
    out.places.push({ n: '닌견 놀이터', t: '울타리 안에서 닌견들이 뛰논다. 일족의 아이는 나이가 차면 여기서 제 짝을 만난다.', poly: Zk.blocks[bi], b });
    if (bi === RUN_A) out.jumps.push(['이누즈카 견사', gate[0], 0, gate[1] + 4, 0, 69]);
  }
  // 개집 마당: 개집 두 줄과 밥그릇
  {
    const b = kb[HOUSES], hw = (b[1] - b[0]) / 2, hd = (b[3] - b[2]) / 2;
    put(scene, { x: (b[0] + b[1]) / 2, z: (b[2] + b[3]) / 2, ry: Math.PI }, B => {              // 제 좌표의 +z가 골목(북쪽)
      for (let r = 0; r < 2; r++) for (let x = -hw + 2.2; x <= hw - 2; x += 2.9) {
        const zz = hd - 6 - r * 9, s = 1 + ((Math.round(x * 3) + r + 30) % 3) * 0.18;
        doghouse(B, K, tile, x, zz, s); B.geo(M.iron, new THREE.CylinderGeometry(0.14, 0.1, 0.07, 10), mat4(x + 0.2, 0.035, zz + 1.6));
      }
      for (const s of [-1, 1]) B.box(M.beam, s * 0.9 - 0.06, 0, hd - 0.52, s * 0.9 + 0.06, 2.0, hd - 0.4, false);
      signBoard(B, '犬舎', 0, 1.7, hd - 0.46, 0, 1.7, 0.5, {});
    });
    out.places.push({ n: '견사의 개집 마당', t: '닌견마다 제 집이 있다. 덩치 큰 놈의 집은 그만큼 크다.', poly: Zk.blocks[HOUSES], b });
  }
  // 훈련 마당: 뛰어넘는 가로대, 기어가는 통, 오르내리는 판
  {
    const b = kb[TRAIN], B = new Builder(), x0 = b[0] + 2.5, z0 = b[2] + 3;
    for (let k = 0; k < 4; k++) {
      const x = x0 + 1 + k * 4.2, h = 0.45 + k * 0.15;
      for (const s of [-1, 1]) B.box(M.beam, x - 0.05, 0, z0 + s * 1.1 - 0.05, x + 0.05, h + 0.25, z0 + s * 1.1 + 0.05, false);
      B.geo(mat('plain', k % 2 ? 0xb3261a : 0xf1eadb), new THREE.CylinderGeometry(0.04, 0.04, 2.2, 8).rotateX(Math.PI / 2), mat4(x, h, z0));
      addCollider(x - 0.1, 0, z0 - 1.15, x + 0.1, h, z0 + 1.15);
    }
    const tz = z0 + 7;                                                                               // 통
    B.geo(K.tank, new THREE.CylinderGeometry(0.55, 0.55, 4.2, 14, 1, true).rotateZ(Math.PI / 2), mat4(x0 + 4, 0.55, tz)); addCollider(x0 + 1.9, 0, tz - 0.55, x0 + 6.1, 1.1, tz + 0.55);
    const rx = x0 + 12.5;                                                                            // 오르내리는 판(∧ 꼴)
    for (const s of [-1, 1]) B.geo(M.beamLight, new THREE.BoxGeometry(2.6, 0.06, 1.0), mat4(rx + s * 1.1, 0.72, tz, 0, 0, -s * 0.58));
    for (const s of [-1, 1]) B.box(M.beam, rx - 0.05, 0, tz + s * 0.55 - 0.05, rx + 0.05, 1.45, tz + s * 0.55 + 0.05, false);
    addCollider(rx - 2.2, 0, tz - 0.5, rx + 2.2, 1.4, tz + 0.5);
    for (const [x, z] of [[x0 + 2, z0 + 13], [x0 + 6, z0 + 14.5], [x0 + 10, z0 + 13]]) {             // 물어뜯는 말뚝
      B.geo(M.beam, new THREE.CylinderGeometry(0.16, 0.18, 1.5, 12), mat4(x, 0.75, z)); addCollider(x - 0.2, 0, z - 0.2, x + 0.2, 1.5, z + 0.2);
    }
    B.finish(scene);
    out.places.push({ n: '닌견 훈련 마당', t: '뛰어넘고, 기어가고, 물어뜯는 훈련. 사람과 개가 한 몸처럼 움직이는 법을 여기서 익힌다.', poly: Zk.blocks[TRAIN], b });
  }
  // 관리동(동물 진료소)과 사료 창고
  {
    const b = kb[OFFICE], at = { x: (b[0] + b[1]) / 2, z: (b[2] + b[3]) / 2, ry: Math.PI / 2 + Math.PI, w: 13, d: 22 };   // 앞이 서쪽(견사 안쪽)
    LOTS.push({ x: at.x, z: at.z, ry: 0, w: b[1] - b[0], d: b[3] - b[2] });
    const res = put(scene, at, B => {
      boxHouse(B, K, { x0: -9, z0: -5, x1: 9, z1: 4.5, front: 's', floors: 2, wall: 5, roof: 3, roofHex: tileHex, roofKind: 'gable', rise: 2.0, shop: '犬', near: true }, rngOf(2203), out.glows);
      crestDisc(B, drawInuzuka, 'inuzuka', -7.3, 2.0, 4.53, 0, 0.45);
      signBoard(B, '動物診療所', 5.6, 2.9, 4.6, 0, 2.6, 0.5, { both: false });
      doghouse(B, K, tile, -7.5, 6.0, 1.1);
      return { places: [{ n: '견사 관리동', t: '닌견을 돌보는 사람들의 집무실이자, 수의사인 이누즈카 하나가 보는 동물 진료소.', b: [-9.5, 9.5, -5.5, 7], y: [0, 9] }], jumps: [['동물 진료소', 0, 0, 10, 0, 70]] };
    });
    out.places.push(...res.places); out.jumps.push(...res.jumps);
    const s = kb[STORE], at2 = { x: (s[0] + s[1]) / 2, z: (s[2] + s[3]) / 2, ry: Math.PI / 2 + Math.PI, w: 12, d: 12 };
    LOTS.push({ x: at2.x, z: at2.z, ry: 0, w: s[1] - s[0], d: s[3] - s[2] });
    put(scene, at2, B => {
      boxHouse(B, K, { x0: -6.5, z0: -4.5, x1: 6.5, z1: 3.5, front: 's', floors: 1, wall: 0, roof: 3, roofHex: tileHex, roofKind: 'gable', rise: 2.2, shop: null, near: true }, rngOf(2204), out.glows);
      signBoard(B, '飼料', 3.6, 2.4, 3.6, 0, 1.2, 0.45, { both: false });
      const sack = mat('plain', 0xb89468, { rough: 1 });
      for (let k = 0; k < 6; k++) B.geo(sack, new THREE.SphereGeometry(0.34, 8, 6).scale(1.25, 0.55, 0.85), mat4(-4.6 + (k % 3) * 0.75, 0.2 + Math.floor(k / 3) * 0.34, 4.3, 0, k * 0.3, 0));
      addCollider(-5.2, 0, 3.9, -2.6, 0.8, 4.8);
    });
  }
  out.places.push({ n: '이누즈카 견사', t: '일족이 닌견을 기르고 길들이는 곳. 놀이터와 개집 마당, 훈련 마당이 있다.', poly: Zk.poly, b: bound(Zk.poly) });
}
const ABURAME_CREST = 'm20.90557,8.74472c-4.22942,1.65243 -11.44894,10.85879 -14.97016,19.08156c-1.7311,4.05237 -3.10813,8.81291 -3.83599,13.19971c-2.43929,14.91114 1.47537,30.41243 10.64238,42.31383c2.18358,2.85237 6.70805,7.29816 7.98672,7.86867c1.8688,0.82619 3.30484,0.49179 4.34744,-1.02295c0.96391,-1.41637 0.55081,-2.34089 -2.51799,-5.72445c-1.41635,-1.55405 -3.2655,-3.71797 -4.11137,-4.7999c-1.79013,-2.28191 -5.13432,-7.14082 -5.13432,-7.47522c0,-0.21642 21.06837,-8.16377 21.65853,-8.16377c0.15737,0 0.53112,0.25571 0.82621,0.55082l0.53115,0.55078l0,3.73764c0,4.28841 0.15737,5.17362 1.41635,7.75066c1.08196,2.18356 3.67862,4.87858 5.76382,5.94083c2.63601,1.35735 3.63925,1.6131 6.49166,1.6131c2.85239,0 3.85564,-0.25575 6.49163,-1.6131c2.08521,-1.06225 4.68188,-3.75727 5.76382,-5.94083c1.25898,-2.57703 1.41635,-3.46225 1.41635,-7.75066l0,-3.73764l0.53114,-0.55078c0.29507,-0.2951 0.66884,-0.55082 0.82621,-0.55082c0.59017,0 21.65854,7.94735 21.65854,8.16377c0,0.3344 -3.3442,5.19331 -5.13432,7.47522c-0.84589,1.08192 -2.69502,3.24585 -4.11137,4.7999c-3.06881,3.38356 -3.48192,4.30808 -2.49831,5.72445c1.02291,1.51474 2.45897,1.84914 4.32776,1.02295c1.27868,-0.5705 5.80317,-5.0163 7.98672,-7.86867c9.16702,-11.90141 13.08167,-27.40269 10.64239,-42.31383c-1.23932,-7.59328 -4.03271,-14.87182 -8.00638,-20.97003c-4.70154,-7.18017 -9.56045,-11.70467 -12.57022,-11.70467c-1.65241,0 -2.83272,1.12129 -2.83272,2.636c0,1.43604 0.62949,2.36062 3.42288,5.13432c2.69502,2.65568 4.78021,5.25235 6.6687,8.30146c1.1803,1.92782 2.57699,4.56384 2.47864,4.68186c-0.05902,0.03934 -13.75053,6.05889 -19.77007,8.67521l-0.62949,0.25574l-1.41637,-1.63276l-1.43602,-1.63274l-0.03934,-3.61959c-0.05903,-4.13107 -0.33443,-5.62611 -1.37703,-7.75064c-1.3967,-2.81307 -3.65894,-4.99662 -6.68838,-6.39332c-2.10487,-0.98357 -3.36385,-1.27866 -5.70478,-1.27866c-2.34094,0 -3.59992,0.29508 -5.70481,1.27866c-3.02943,1.39669 -5.29168,3.58025 -6.68837,6.39332c-1.04259,2.12453 -1.318,3.61957 -1.37702,7.75064l-0.03934,3.61959l-1.43602,1.63274l-1.41637,1.63276l-0.62949,-0.25574c-6.01954,-2.61633 -19.71105,-8.63587 -19.77007,-8.67521c-0.09835,-0.11802 1.29835,-2.75404 2.47863,-4.68186c1.88849,-3.04911 3.9737,-5.64578 6.66872,-8.30146c2.79337,-2.7737 3.42286,-3.69827 3.42286,-5.13432c0,-2.16388 -2.12453,-3.20647 -4.60317,-2.24257zm32.18289,14.39969c1.35735,0.62949 2.7147,1.94749 3.38354,3.2655c0.57046,1.14096 0.94422,3.18681 0.74751,4.11139l-0.1377,0.62949l-0.92457,-0.47212c-2.85239,-1.45569 -9.46209,-1.45569 -12.31449,0l-0.92457,0.47212l-0.1377,-0.62949c-0.19672,-0.86555 0.15737,-2.97043 0.66883,-3.95402c0.9049,-1.79013 2.02619,-2.81305 3.87534,-3.59991c1.57372,-0.64918 4.15072,-0.59016 5.7638,0.17704zm-34.22875,16.17012c12.45218,5.17366 11.37024,4.66221 11.37024,5.23268c-0.01967,0.53112 -0.49179,2.95076 -0.60982,3.00978c-0.03935,0.01967 -4.97695,0.01967 -10.93746,-0.01968l-10.87847,-0.07869l0.11804,-1.10163c0.23606,-2.45894 1.23931,-7.27852 1.98684,-9.54075c0.25573,-0.8459 0.35408,-0.94424 0.74753,-0.8459c0.25574,0.05902 3.954,1.57374 8.20309,3.34419zm35.03528,-2.81305c2.79339,0.82621 4.70154,1.98684 6.64903,4.05238c4.01303,4.24908 4.95728,10.32763 2.45897,15.69799c-1.73111,3.6983 -4.9966,6.41299 -9.26537,7.71132c-1.65243,0.49181 -5.82282,0.49181 -7.47525,0c-6.07856,-1.84914 -9.97355,-6.49164 -10.60303,-12.66859c-0.25573,-2.45894 0.53113,-5.90147 1.8688,-8.26209c0.74753,-1.29832 2.85241,-3.58025 4.05237,-4.42613c1.77045,-1.19998 4.66219,-2.34094 6.55069,-2.577c1.45569,-0.17704 4.38678,0.05902 5.7638,0.47212zm36.2156,0.31475c0.72785,2.26223 1.73111,7.08181 1.96717,9.54075l0.11803,1.10163l-10.87846,0.07869c-5.96052,0.03935 -10.89811,0.03935 -10.93745,0.01968c-0.11803,-0.05902 -0.59014,-2.47866 -0.60982,-3.00978c0,-0.41311 0.19671,-0.57047 1.33768,-1.04259c2.91141,-1.23933 16.3275,-6.8261 17.25208,-7.19985c0.5508,-0.21639 1.08195,-0.39343 1.21965,-0.39343c0.11803,-0.01968 0.35408,0.39343 0.53113,0.9049zm-59.90031,18.19631c0.84587,2.00653 1.23933,3.50156 1.00327,3.79666c-0.13772,0.15736 -3.87534,1.47535 -8.32113,2.93106c-12.5112,4.09172 -11.80301,3.87532 -12.07842,3.54091c-0.55082,-0.72784 -2.24257,-7.08181 -2.69502,-10.05222l-0.11802,-0.84592l8.8916,-0.03931c4.89825,-0.03935 9.81618,-0.0787 10.93747,-0.11804l2.00651,-0.05902l0.37376,0.84588zm53.48736,-0.62951l8.30144,0l-0.11802,0.82624c-0.45245,2.99009 -2.14423,9.34405 -2.69503,10.0719c-0.27541,0.33441 0.43277,0.55081 -12.07842,-3.54091c-4.44581,-1.45571 -8.18343,-2.7737 -8.32113,-2.93106c-0.23605,-0.2951 0.15739,-1.80981 1.02293,-3.81633l0.35408,-0.86555l2.61636,0.11804c1.41635,0.0787 6.33427,0.13768 10.9178,0.13768zm-39.87455,14.93082c1.27865,0.5705 4.15074,1.04262 6.17693,1.04262c2.02616,0 4.91792,-0.47211 6.1769,-1.04262c0.47213,-0.2164 0.92458,-0.33439 0.98358,-0.25571c0.25573,0.25571 0.01967,2.61633 -0.37375,3.67857c-0.59015,1.57375 -2.18356,3.24584 -3.77697,3.99335c-1.08194,0.49181 -1.47536,0.57049 -3.00976,0.57049c-1.53441,0 -1.92785,-0.07868 -2.9901,-0.57049c-2.20323,-1.0229 -3.79664,-3.10812 -4.19007,-5.54739c-0.15739,-0.9049 -0.09837,-2.24258 0.09835,-2.24258c0.01967,0 0.43277,0.17702 0.9049,0.37374z';
/* ============================ 아부라메 구역과 벌레 사육장 ============================
   몸에 벌레를 깃들여 함께 사는 일족의 구역. 성벽과 강 사이의 외진 띠 땅이라 다리를 건너야 들어온다. 다리 끝에 나무 문,
   띠를 따라 말수 적은 일족의 집이 한 줄로 서고, 한가운데에 본가(시비와 시노의 집 — 건물 파일 b_homes.js가 짓는다).
   남쪽 사육장: 사육동, 줄지은 사육 상자, 썩은 통나무 더미, 벌레를 담는 항아리와 호리병, 그 위로 벌레 떼가 떠다닌다.
   벌레를 몸에 기르고 항아리·호리병에 담아 다닌다는 것, 벌레를 연구한다는 것은 원작의 것이고, 사육장의 짜임새는 지어낸 것이다. */
// 아부라메 일족의 문장(나루토 위키의 문장 그림을 따랐다)
function drawAburame(g, cx, cy, r) {
  g.save(); g.translate(cx - r * 0.92, cy - r * 0.92); g.scale(r * 0.92 / 50, r * 0.92 / 50);
  g.fillStyle = '#1a1410'; g.fill(new Path2D(ABURAME_CREST), 'evenodd');
  g.restore();
}
// 벌레 떼: 점 수백 개가 한 덩어리로 느리게 떠돌며 저마다 맴돈다
class Swarm {
  constructor(scene, x, y, z, n, R, spread = 1.6) {
    this.c = [x, y, z]; this.n = n; this.spread = spread; this.seed = R() * 100;
    this.k = new Float32Array(n * 7); for (let i = 0; i < n * 7; i++) this.k[i] = R();
    this.pos = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(x, y, z), spread * 3 + 4);
    this.pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0x15110d, size: 0.032, sizeAttenuation: true }));
    scene.add(this.pts); this.tick(0, null);
  }
  tick(t, eye) {
    const [x, y, z] = this.c;
    if (eye && Math.hypot(eye.x - x, eye.z - z) > 160) return;
    const s = this.seed, cx = x + 2.2 * Math.sin(t * 0.21 + s), cy = y + 0.5 * Math.sin(t * 0.33 + s * 2), cz = z + 2.2 * Math.cos(t * 0.17 + s * 3), k = this.k, p = this.pos, sp = this.spread;
    for (let i = 0; i < this.n; i++) {
      const o = i * 7, r = sp * (0.25 + 0.75 * k[o + 6]);
      p[i * 3] = cx + Math.sin(t * (1.2 + 2.6 * k[o]) + k[o + 3] * 6.283) * r;
      p[i * 3 + 1] = cy + Math.sin(t * (1.5 + 2.2 * k[o + 1]) + k[o + 4] * 6.283) * r * 0.55;
      p[i * 3 + 2] = cz + Math.cos(t * (1.1 + 2.8 * k[o + 2]) + k[o + 5] * 6.283) * r;
    }
    this.pts.geometry.attributes.position.needsUpdate = true;
  }
}
// 사육 상자: 다리 달린 받침 위의 나무 상자. 앞에 드나드는 좁은 틈, 위에 넓은 뚜껑
function hiveBox(B, K, x, z, tall) {
  const h = tall ? 0.95 : 0.6;
  for (const [a, c] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.box(M.beam, x + a * 0.26 - 0.03, 0, z + c * 0.22 - 0.03, x + a * 0.26 + 0.03, 0.45, z + c * 0.22 + 0.03, false);
  B.box(K.door, x - 0.32, 0.45, z - 0.28, x + 0.32, 0.45 + h, z + 0.28, false);
  if (tall) B.box(M.beam, x - 0.33, 0.45 + h * 0.5 - 0.015, z - 0.29, x + 0.33, 0.45 + h * 0.5 + 0.015, z + 0.29, false);
  B.box(K.dark, x - 0.16, 0.49, z + 0.28, x + 0.16, 0.52, z + 0.29, false);
  B.box(M.beam, x - 0.38, 0.45 + h, z - 0.34, x + 0.38, 0.5 + h, z + 0.34, false);
  addCollider(x - 0.34, 0, z - 0.3, x + 0.34, 0.5 + h, z + 0.3);
}
function aburame(scene, out) {
  const K = makeKit(), Z = zone(40), Zi = zone(41), R = rngOf(4040), tileHex = 0x3f4a3c, tile = mat('tile', tileHex);
  // 다리 끝의 문: 강을 건너온 길 위에 선다
  const br = PLAN.bridges[0], end = br[0][0] < br[1][0] ? br[0] : br[1], far = end === br[0] ? br[1] : br[0], L = Math.hypot(end[0] - far[0], end[1] - far[1]), d = [(end[0] - far[0]) / L, (end[1] - far[1]) / L];   // d: 다리에서 구역 안으로
  const gate = [end[0] + d[0] * 5, end[1] + d[1] * 5];
  put(scene, { x: gate[0], z: gate[1], ry: Math.atan2(d[0], d[1]) }, B => {
    for (const s of [-1, 1]) { B.box(M.beam, s * 2.9 - 0.2, 0, -0.2, s * 2.9 + 0.2, 4.2, 0.2); B.box(M.stone, s * 2.9 - 0.3, 0, -0.3, s * 2.9 + 0.3, 0.4, 0.3, false); }
    B.box(M.beam, -3.7, 3.2, -0.11, 3.7, 3.44, 0.11, false); B.box(M.beam, -4.1, 4.04, -0.16, 4.1, 4.3, 0.16, false);
    gableRoof(B, tile, -3.9, -0.7, 3.9, 0.7, 4.3, 0.7, { ridge: 'x', over: 0.5, overGable: 0.5 });
    crestDisc(B, drawAburame, 'aburame', 0, 3.74, 0.13, 0, 0.4); crestDisc(B, drawAburame, 'aburame', 0, 3.74, -0.13, Math.PI, 0.4);
  });
  // 구역 안의 집: 잿빛 벽·짙은 이끼빛 기와. 창이 적고 문을 닫아건 조용한 집들
  GROUPS.push({
    polys: [Z.poly], land: 3,
    ok: (x, z) => Math.hypot(x - gate[0], z - gate[1]) > 9,
    style: Rr => ({ round: false, floors: 1 + (Rr() < 0.5 ? 1 : 0), wall: 4, roof: 2, roofHex: tileHex, roofKind: Rr() < 0.5 ? 'gable' : 'hip', shop: null }),
    deco: (B, h) => {
      crestDisc(B, drawAburame, 'aburame', -h.w / 2 + 1.0, (h.floors >= 2 ? 3.3 : 2.75), h.d / 2 + 0.03, 0, 0.36);
      if (h.seed % 3 === 0) for (let k = 0; k < 2; k++) B.geo(K.pot, new THREE.SphereGeometry(0.22, 10, 8).scale(1, 1.25, 1), mat4(h.w / 2 - 0.35 - k * 0.42, 0.26, h.d / 2 + 0.4 + (k % 2) * 0.25));   // 문을 막지 않게 모퉁이에 붙여 둔다   // 문 옆의 벌레 항아리
    },
  });
  out.places.push({ n: '아부라메 구역', t: '몸에 벌레를 깃들여 함께 사는 아부라메 일족의 구역. 성벽과 강 사이 외진 땅에 말수 적은 사람들이 모여 산다.', poly: Z.poly, b: bound(Z.poly) });
  out.jumps.push(['아부라메 구역', gate[0] - d[0] * 8, 0, gate[1] - d[1] * 8, yawTo(d[0], d[1]), 73]);

  /* ---------- 벌레 사육장 ---------- */
  {
    const P = Zi.poly, c = cen(P), a = mid(P[0], P[3]), b2 = mid(P[1], P[2]), Ls = Math.hypot(b2[0] - a[0], b2[1] - a[1]), u = [(b2[0] - a[0]) / Ls, (b2[1] - a[1]) / Ls], ry = Math.atan2(u[0], u[1]);   // 띠를 따라 남쪽으로 가는 방향이 제 좌표의 +z
    const hl = Ls / 2 - 3, at = { x: c[0], z: c[1], ry };
    const toWorld = (x, z) => [c[0] + x * Math.cos(ry) + z * Math.sin(ry), c[1] - x * Math.sin(ry) + z * Math.cos(ry)];
    const res = put(scene, at, B => {
      // 사육동: 창을 가린 낮은 집. 안에서 알과 애벌레를 기른다
      boxHouse(B, K, { x0: -7, z0: -hl, x1: 7, z1: -hl + 9, front: 's', floors: 1, wall: 4, roof: 2, roofHex: tileHex, roofKind: 'gable', rise: 2.2, shop: null, near: true }, rngOf(4101), out.glows);
      crestDisc(B, drawAburame, 'aburame', -5.4, 2.0, -hl + 9.03, 0, 0.45);
      signBoard(B, '蟲', 4.6, 2.2, -hl + 9.1, 0, 0.7, 0.7, { round: true, both: false });
      // 사육 상자: 세 줄로 늘어섰다
      const z0 = -hl + 14;
      for (let r = 0; r < 8; r++) for (const x of [-6.5, -2.2, 2.2, 6.5]) hiveBox(B, K, x, z0 + r * 3.4, (r + Math.round(x)) % 3 === 0);
      // 썩은 통나무 더미: 딱정벌레 애벌레가 사는 자리. 이끼가 앉았다
      const lz = z0 + 31, moss = mat('leaf', 0x4f7a3a), bark = mat('plain', 0x4a3a2c, { rough: 1 });
      for (let k = 0; k < 7; k++) {
        const row = k < 4 ? 0 : 1, x = (row ? -1.1 : -1.65) + (row ? k - 4 : k) * 1.1 - 3;
        B.geo(bark, new THREE.CylinderGeometry(0.5, 0.52, 3.6, 10).rotateX(Math.PI / 2), mat4(x, 0.5 + row * 0.86, lz, 0, (k % 3 - 1) * 0.06, 0));
        B.geo(moss, new THREE.SphereGeometry(0.42, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.3, 2.4), mat4(x, 0.86 + row * 0.86, lz + (k % 2 - 0.5) * 1.2));
      }
      addCollider(-5.3, 0, lz - 1.9, -0.3, 1.9, lz + 1.9);
      // 항아리와 호리병: 임무에 데리고 나갈 벌레를 담아 둔다
      const jar = new THREE.LatheGeometry([[0, 0], [0.24, 0], [0.4, 0.3], [0.42, 0.6], [0.3, 0.86], [0.2, 0.92], [0.24, 1.0], [0, 1.0]].map(p => new THREE.Vector2(p[0], p[1])), 14);
      const gourd = new THREE.LatheGeometry([[0, 0], [0.16, 0.02], [0.24, 0.2], [0.18, 0.38], [0.1, 0.46], [0.16, 0.6], [0.12, 0.74], [0.04, 0.8], [0.04, 0.88], [0, 0.88]].map(p => new THREE.Vector2(p[0], p[1])), 12);
      const clay = mat('plain', 0x6a4a36, { rough: 0.8 }), cloth = mat('plain', 0xd8cdb0, { rough: 1 }), gm = mat('plain', 0xb89a5a, { rough: 0.7 });
      for (let k = 0; k < 6; k++) { const x = 2.2 + (k % 3) * 1.15, z = lz - 1.2 + Math.floor(k / 3) * 1.3, s = 0.9 + (k % 2) * 0.25; B.geo(clay, jar, mat4(x, 0, z, 0, k, 0, [s, s, s])); B.geo(cloth, new THREE.CylinderGeometry(0.27 * s, 0.27 * s, 0.05, 12), mat4(x, 1.0 * s, z)); }
      addCollider(1.6, 0, lz - 1.8, 5.2, 1.1, lz + 0.7);
      B.box(M.beam, 6.3, 0, lz - 1.5, 6.4, 1.5, lz - 1.4, false); B.box(M.beam, 6.3, 0, lz + 1.4, 6.4, 1.5, lz + 1.5, false); B.box(M.beam, 6.28, 1.42, lz - 1.5, 6.42, 1.5, lz + 1.5, false);
      for (let k = 0; k < 5; k++) B.geo(gm, gourd, mat4(6.35, 0.55, lz - 1.1 + k * 0.55, 0, k, 0, [0.9, 0.9, 0.9]));                   // 걸이에 매단 호리병
      addCollider(6.1, 0, lz - 1.5, 6.6, 1.5, lz + 1.5);
      // 풀숲: 베지 않고 둔 키 큰 풀밭 — 풀벌레가 사는 자리
      const tg = tuftGeometry(31);
      for (let k = 0; k < 150; k++) { const x = (R() - 0.5) * 17, z = lz + 6 + R() * (hl - lz - 9); B.geo(K.leaf, tg, mat4(x, 0, z, 0, R() * 6.283, 0, [2.2 + R(), 2.4 + R() * 1.6, 2.2 + R()])); }
      return { places: [{ n: '벌레 사육동', t: '알과 애벌레를 기르는 집. 볕이 들지 않게 창을 가렸다.', b: [-7.5, 7.5, -hl - 0.5, -hl + 11], y: [0, 8] }], jumps: [['벌레 사육장', 0, 0, -hl + 13, Math.PI, 74]] };
    });
    out.places.push(...res.places); out.jumps.push(...res.jumps);
    // 벌레 떼: 사육 상자 위와 통나무 더미 위를 떠돈다
    const swarms = [[0, 2.1, -hl + 18, 260, 1.9], [-3, 1.9, -hl + 28, 200, 1.5], [3.5, 2.3, -hl + 25, 180, 1.4], [-2.5, 2.0, -hl + 45, 220, 1.6], [1, 1.3, -hl + 58, 160, 2.6], [-3, 1.2, -hl + 66, 120, 2.2]].map(([x, y, z, n, sp]) => { const w = toWorld(x, z); return new Swarm(scene, w[0], y, w[1], n, R, sp); });
    out.ticks.push(t => { const eye = out.eye && out.eye.position; for (const s of swarms) s.tick(t, eye); });
    out.places.push({ n: '아부라메 벌레 사육장', t: '일족이 벌레를 기르고 살피는 곳. 사육 상자 위로 검은 벌레 떼가 구름처럼 떠다닌다.', poly: P, b: bound(P) });
  }
}
const bound = poly => [Math.min(...poly.map(q => q[0])), Math.max(...poly.map(q => q[0])), Math.min(...poly.map(q => q[1])), Math.max(...poly.map(q => q[1]))];

export async function build(scene, ctx) {
  const out = { places: [], jumps: [], glows: [], ticks: [], eye: ctx.camera };
  GLOWS = out.glows;
  await ctx.say('우치하 일족의 구역에 담을 두르는 중…');
  uchiha(scene, out);
  await ctx.say('나라 일족의 사슴을 풀어놓는 중…');
  nara(scene, out);
  await ctx.say('아키미치 일족의 솥에 불을 지피는 중…');
  akimichi(scene, out);
  await ctx.say('야마나카 일족의 꽃밭에 물을 주는 중…');
  yamanaka(scene, out);
  await ctx.say('휴가 일족의 구역에 담을 두르는 중…');
  hyuga(scene, out);
  await ctx.say('사루토비 일족의 화톳불을 지피는 중…');
  sarutobi(scene, out);
  await ctx.say('이누즈카 일족의 닌견을 풀어놓는 중…');
  inuzuka(scene, out);
  await ctx.say('아부라메 일족의 벌레를 깨우는 중…');
  aburame(scene, out);
  if (out.ticks.length) out.tick = (t, dt) => { for (const f of out.ticks) f(t, dt); };
  return out;
}
