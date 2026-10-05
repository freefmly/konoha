// 가문 구역 — 구역마다 담·대문·그 구역만의 건물을 세우고, 구역 안 집의 생김새를 정해 준다.
// 집을 블록에 줄지어 세우고 멀리서 가볍게 그리는 일은 streets.js가 맡는다(여기서는 "어느 블록에 어떤 집을"만 알려 준다).
import * as THREE from '../vendor/three.module.js';
import { Builder, marks, settle, addCollider, rng as rngOf } from './build.js';
import { M } from './materials.js';
import { boxHouse, makeKit } from './town.js';
import { lantern, signBoard, beamBetween } from './arch.js';
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

  // 담: 변마다 문과 물길 자리를 비우고 토막토막 세운다
  for (let i = 0; i < NW; i++) {
    const a = W[i], b = W[(i + 1) % NW], L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L, ry = Math.atan2(ux, uz);
    const open = s => { const x = a[0] + ux * s, z = a[1] + uz * s; return gates.some(g => Math.hypot(g.at[0] - x, g.at[1] - z) < 3.3) || [-1.5, 0, 1.5].some(o => terrainH(x + ux * o, z + uz * o) < -0.05); };
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

export async function build(scene, ctx) {
  const out = { places: [], jumps: [], glows: [] };
  await ctx.say('우치하 일족의 구역에 담을 두르는 중…');
  uchiha(scene, out);
  return out;
}
