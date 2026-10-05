// 가문 구역 — 구역마다 담·대문·그 구역만의 건물을 세우고, 구역 안 집의 생김새를 정해 준다.
// 집을 블록에 줄지어 세우고 멀리서 가볍게 그리는 일은 streets.js가 맡는다(여기서는 "어느 블록에 어떤 집을"만 알려 준다).
import * as THREE from '../vendor/three.module.js';
import { Builder, marks, settle, addCollider, mat4, rng as rngOf } from './build.js';
import { M, mat, textMat } from './materials.js';
import { boxHouse, makeKit, ROOFS } from './town.js';
import { lantern, signBoard, beamBetween, gableRoof } from './arch.js';
import { tuftGeometry } from './flora.js';
import { deerGeometry } from './deer.js';
import { uchihaKit, uchihaGate } from './b_uchiha.js';
import { PLAN } from './plan-data.js';
import { terrainH, inPoly } from './village.js';

export const LOTS = [];        // 구역의 특별한 건물이 선 터 { x, z, ry, w, d } — 집·나무·풀이 피한다
const GROUPS = [];             // 구역의 집 묶음 { polys, land, ok(x, z), style(R), deco(B, h) }
export const zoneGroups = () => GROUPS;

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const zone = n => PLAN.zones.find(z => z.n === n);
const cen = poly => [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length];
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const segDist = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz))); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };
const yawTo = (vx, vz) => Math.atan2(-vx, -vz);          // 그 방향을 보는 눈길
// 제 좌표(벽이 축에 나란한 좌표)로 지은 것을 마을의 제자리에 돌려 놓는다
function put(scene, at, make) {
  const holder = new THREE.Group(), from = marks(), B = new Builder();
  const res = make(B) || null;
  B.finish(holder);
  return settle(scene, holder, from, at, res);
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
        jumps: [['경무부대 본부', 0, 0, 15, Math.PI, 46]],
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
      return { places: [{ n: '우치하 센베이', t: '테야키와 우루치 부부가 하는 센베이 가게. 일족 사람들의 사랑방이었다.', b: [-7, 7, -6, 8], y: [0, 9] }], jumps: [['우치하 센베이', 0, 0, 9, Math.PI, 47]] };
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
    deco: (B, h) => U.crestPlaque(B, -h.w / 2 + 1.0, h.floors * 3.0 - 0.55, h.d / 2 + 0.03, 0, 0.36),
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
    // 사슴: 수사슴 몇에 암사슴, 절반쯤은 풀을 뜯는다
    const inner = shrink(Z.blocks[PADDOCK], 8), bb = bound(inner), spots = [], lists = { stag: [], doe: [], graze: [] };
    for (let t = 0; t < 400 && spots.length < 13; t++) {
      const x = bb[0] + R() * (bb[1] - bb[0]), z = bb[2] + R() * (bb[3] - bb[2]);
      if (!inPoly(x, z, inner) || spots.some(q => Math.hypot(q[0] - x, q[1] - z) < 4)) continue;
      const kind = spots.length % 4 === 0 ? 'stag' : R() < 0.5 ? 'graze' : 'doe', s = kind === 'stag' ? 1.12 + R() * 0.08 : 0.9 + R() * 0.15;
      spots.push([x, z]); lists[kind].push(mat4(x, 0, z, 0, R() * Math.PI * 2, 0, s));
      addCollider(x - 0.4, 0, z - 0.4, x + 0.4, 1.3, z + 0.4);
    }
    const fur = mat('plain', 0xa97b4a, { rough: 0.92 }), dark = mat('plain', 0x2a211b, { rough: 0.6 }), bone = mat('plain', 0xd8c9a8, { rough: 0.7 });
    for (const kind of ['stag', 'doe', 'graze']) { const g = deerGeometry(kind); instanced(scene, g.body, fur, lists[kind]); instanced(scene, g.dark, dark, lists[kind], false); instanced(scene, g.horn, bone, lists[kind]); }
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
    deco: (B, h) => crestDisc(B, drawNara, 'nara', -h.w / 2 + 1.0, h.floors * 3.0 - 0.55, h.d / 2 + 0.03, 0, 0.36),
  });
  out.places.push({ n: '나라 구역', t: '사슴을 돌보고 약을 짓는 나라 일족의 구역. 그림자를 다루는 술법으로 이름났다.', poly: Z.poly, b: bound(Z.poly) });
  out.jumps.push(['나라 구역', gate[0] - u[0] * 9, 0, gate[1] - u[1] * 9, yawTo(u[0], u[1]), 50]);
}
const bound = poly => [Math.min(...poly.map(q => q[0])), Math.max(...poly.map(q => q[0])), Math.min(...poly.map(q => q[1])), Math.max(...poly.map(q => q[1]))];

export async function build(scene, ctx) {
  const out = { places: [], jumps: [], glows: [] };
  await ctx.say('우치하 일족의 구역에 담을 두르는 중…');
  uchiha(scene, out);
  await ctx.say('나라 일족의 사슴을 풀어놓는 중…');
  nara(scene, out);
  return out;
}
