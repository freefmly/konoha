// 가문 구역 — 구역마다 담·대문·그 구역만의 건물을 세우고, 구역 안 집의 생김새를 정해 준다.
// 집을 블록에 줄지어 세우고 멀리서 가볍게 그리는 일은 streets.js가 맡는다(여기서는 "어느 블록에 어떤 집을"만 알려 준다).
import * as THREE from '../vendor/three.module.js';
import { Builder, marks, settle, addCollider, mat4, rng as rngOf } from './build.js';
import { M, mat, textMat } from './materials.js';
import { boxHouse, makeKit, ROOFS } from './town.js';
import { lantern, signBoard, beamBetween, gableRoof, hipRoof } from './arch.js';
import { tuftGeometry } from './flora.js';
import { Herd } from './deer.js';
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
    deco: (B, h) => crestDisc(B, drawNara, 'nara', -h.w / 2 + 1.0, h.floors * 3.0 - 0.55, h.d / 2 + 0.03, 0, 0.36),
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
      return { places: [{ n: '아키미치 회관', t: '일족이 모여 한솥밥을 먹는 큰 집과 잔치 마당. 많이 먹는 것이 곧 이 일족의 힘이다.', b: [-17, 17, -18, 11], y: [0, 12] }], jumps: [['아키미치 회관', 0, 0, 14, Math.PI, 53]] };
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
      return { places: [{ n: '아키미치 씨름판', t: '몸집을 키워 맞붙는 일족의 단련장. 흙단 위에 새끼줄을 둥글게 둘렀다.', b: [-8, 6, -6, 6], y: [0, 8] }], jumps: [['아키미치 씨름판', 0, 0, 8.5, Math.PI, 54]] };
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
    style: Rr => ({ round: false, floors: 1 + (Rr() < 0.5 ? 1 : 0), wall: Rr() < 0.55 ? 3 : 0, roof: 1, roofKind: Rr() < 0.55 ? 'hip' : 'gable', shop: Rr() < 0.1 ? ['米', '団子', '焼肉', '菓子', '餅'][Math.floor(Rr() * 5)] : null }),
    deco: (B, h) => crestDisc(B, drawAkimichi, 'akimichi', -h.w / 2 + 1.0, h.floors * 3.0 - 0.55, h.d / 2 + 0.03, 0, 0.36),
  });
  out.places.push({ n: '아키미치 구역', t: '많이 먹고 몸을 불려 싸우는 아키미치 일족의 구역. 옷에 먹을 식(食) 자를 새긴다.', poly: Z.poly, b: bound(Z.poly) });
  out.jumps.push(['아키미치 구역', gate[0] - u[0] * 9, 0, gate[1] - u[1] * 9, yawTo(u[0], u[1]), 52]);
}
const bound = poly => [Math.min(...poly.map(q => q[0])), Math.max(...poly.map(q => q[0])), Math.min(...poly.map(q => q[1])), Math.max(...poly.map(q => q[1]))];

export async function build(scene, ctx) {
  const out = { places: [], jumps: [], glows: [], ticks: [], eye: ctx.camera };
  await ctx.say('우치하 일족의 구역에 담을 두르는 중…');
  uchiha(scene, out);
  await ctx.say('나라 일족의 사슴을 풀어놓는 중…');
  nara(scene, out);
  await ctx.say('아키미치 일족의 솥에 불을 지피는 중…');
  akimichi(scene, out);
  if (out.ticks.length) out.tick = (t, dt) => { for (const f of out.ticks) f(t, dt); };
  return out;
}
