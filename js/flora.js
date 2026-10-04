// 나무와 풀 — 줄기에서 가지가 갈라지고 잔가지마다 잎이 한 장씩 달린 활엽수, 덤불, 풀포기. 아카데미 마당의 그네 나무.
import * as THREE from '../vendor/three.module.js';
import { tube, mergeGeos, rng, addCollider, mat4 } from './build.js';
import { mat, M } from './materials.js';
import { LOT, ROADS, CLIFF, WALL } from './layout.js';
import { terrainH } from './village.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function rawGeo(pos, uv) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

// 잎 한 장: 잎맥을 따라 살짝 접힌 끝이 뾰족한 잎(삼각형 넷). 밑동 p에서 dir 쪽으로 뻗는다.
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _q = new THREE.Vector3();
function leaf(lp, lu, p, dir, up, L, R, flat = false) {
  _x.crossVectors(dir, up); if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0); _x.normalize();
  _y.crossVectors(_x, dir).normalize();
  const w = L * (0.36 + R() * 0.1), fold = L * 0.07;
  const pt = (a, s, h) => { _q.copy(p).addScaledVector(dir, a * L).addScaledVector(_x, s * w).addScaledVector(_y, h); return [_q.x, _q.y, _q.z]; };
  const b = pt(0, 0, 0), m = pt(0.5, 0, -fold), t = pt(1, 0, 0), l = pt(0.42, -1, fold * 0.4), r = pt(0.42, 1, fold * 0.4);
  if (flat) { lp.push(...b, ...l, ...t, ...b, ...t, ...r); lu.push(0.5, 0, 0, 0.45, 0.5, 1, 0.5, 0, 0.5, 1, 1, 0.45); return; }   // 먼 숲의 잎은 접힘 없이 두 조각
  lp.push(...b, ...l, ...m, ...l, ...t, ...m, ...b, ...m, ...r, ...r, ...m, ...t);
  lu.push(0.5, 0, 0, 0.45, 0.5, 0.5, 0, 0.45, 0.5, 1, 0.5, 0.5, 0.5, 0, 0.5, 0.5, 1, 0.45, 1, 0.45, 0.5, 0.5, 0.5, 1);
}

/* ---------- 활엽수 ----------
   depth: 가지가 갈라지는 횟수, leaves: 잔가지 하나에 다는 잎 수, leafLen: 잎 길이 */
export function treeGeometry(seed, { height = 13, depth = 4, sprays = 6, leaves = 7, leafLen = 0.42, spread = 1, flat = false } = {}) {
  const R = rng(seed), wood = [], lp = [], lu = [];
  const perp = d => { const a = Math.abs(d.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0); return a.cross(d).normalize(); };
  let top = 0, rad = 0;
  function grow(p0, dir, len, r, d) {
    const side = perp(dir).applyAxisAngle(dir, R() * Math.PI * 2), bend = (R() - 0.5) * 0.36, pts = [], n = d === 0 ? 7 : 5;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push(p0.clone().addScaledVector(dir, len * t).addScaledVector(side, len * bend * Math.sin(Math.PI * t)).add(V(0, d > 0 ? len * 0.08 * t * t : 0, 0)));
    }
    const flare = d === 0 ? t => r * (1 - 0.3 * t) * (1 + 0.55 * Math.exp(-t * 9)) : t => r * (1 - 0.38 * t);
    wood.push(tube(pts, flare, d === 0 ? (flat ? 7 : 12) : d < 2 ? (flat ? 5 : 7) : d < 3 ? (flat ? 4 : 5) : (flat ? 3 : 4), false));
    const end = pts[n], edir = end.clone().sub(pts[n - 1]).normalize();
    top = Math.max(top, end.y); rad = Math.max(rad, Math.hypot(end.x, end.z));
    if (d >= depth - 1) {   // 잔가지와 그 앞 가지에서 잎줄기가 뻗고, 잎줄기 양옆으로 잎이 어긋나게 달린다
      const cnt = d === depth ? sprays : Math.round(sprays * 0.5);
      for (let i = 0; i < cnt; i++) {
        const t = d === depth ? 0.2 + 0.8 * R() : 0.4 + 0.6 * R(), k = Math.min(n - 1, Math.floor(t * n)), f = t * n - k;
        const p = pts[k].clone().lerp(pts[k + 1], f);
        const out = perp(edir).applyAxisAngle(edir, R() * Math.PI * 2);
        const sd = out.clone().multiplyScalar(0.9).addScaledVector(edir, 0.3 + R() * 0.7).add(V(0, 0.1 - R() * 0.35, 0)).normalize();
        const sl = leafLen * (1.5 + R() * 1.3), tip = p.clone().addScaledVector(sd, sl).add(V(0, -0.12 * sl, 0));
        wood.push(tube([p, tip], 0.012 + leafLen * 0.012, 3, false));
        const sside = perp(sd);
        for (let j = 0; j < leaves; j++) {
          const u = (j + 0.6) / leaves, q = p.clone().lerp(tip, u), sgn = j % 2 ? 1 : -1;
          const ld = j === leaves - 1 ? sd.clone() : sd.clone().multiplyScalar(0.55).addScaledVector(sside, sgn * (0.75 + R() * 0.2)).add(V(0, -0.15 - R() * 0.25, 0)).normalize();
          leaf(lp, lu, q, ld, V(R() - 0.5, 1.4, R() - 0.5).normalize(), leafLen * (0.75 + R() * 0.5), R, flat);
        }
      }
    }
    if (d === depth) return;
    const kids = d === 0 ? 3 + (R() < 0.6 ? 1 : 0) : 2 + (R() < 0.55 ? 1 : 0), a0 = R() * Math.PI * 2;
    for (let i = 0; i < kids; i++) {
      const tilt = (d === 0 ? 0.55 + R() * 0.35 : 0.42 + R() * 0.4) * spread, ax = perp(edir).applyAxisAngle(edir, a0 + i / kids * Math.PI * 2 + (R() - 0.5) * 0.7);
      const nd = edir.clone().applyAxisAngle(ax, tilt).add(V(0, 0.12, 0)).normalize();
      const from = i === 0 || d > 1 ? end : pts[n - 1 - (i % 2)].clone();
      grow(from, nd, len * (0.66 + R() * 0.16), r * (0.6 + R() * 0.08), d + 1);
    }
    if (d > 0 && d < depth - 1 && R() < 0.6) grow(end, edir.clone().add(V((R() - 0.5) * 0.3, 0.1, (R() - 0.5) * 0.3)).normalize(), len * 0.62, r * 0.55, d + 1);   // 줄기를 잇는 가운데 가지
  }
  const lean = V((R() - 0.5) * 0.16, 1, (R() - 0.5) * 0.16).normalize();
  grow(V(0, -0.3, 0), lean, height * 0.36, height * 0.036, 0);
  return { wood: mergeGeos(wood), leaves: rawGeo(lp, lu), height: top, radius: rad };
}

// 덤불: 땅에서 여러 줄기가 올라와 잎이 빽빽하다
export function bushGeometry(seed, size = 1) {
  const R = rng(seed), wood = [], lp = [], lu = [];
  for (let s = 0; s < 9; s++) {
    const a = R() * Math.PI * 2, tilt = 0.15 + R() * 0.75, len = (0.7 + R() * 0.7) * size;
    const dir = V(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt)), pts = [];
    for (let i = 0; i <= 4; i++) pts.push(V(Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08).addScaledVector(dir, len * i / 4).add(V(0, -0.12 * (i / 4) ** 2 * len, 0)));
    wood.push(tube(pts, t => 0.03 * (1 - 0.6 * t), 4, false));
    for (let i = 0; i < 26; i++) {
      const t = 0.2 + 0.8 * R(), k = Math.min(3, Math.floor(t * 4)), p = pts[k].clone().lerp(pts[k + 1], t * 4 - k);
      const ld = V(R() - 0.5, R() * 0.6 - 0.1, R() - 0.5).addScaledVector(dir, 0.6).normalize();
      leaf(lp, lu, p, ld, V(0, 1, 0), (0.16 + R() * 0.1) * size, R);
    }
  }
  return { wood: mergeGeos(wood), leaves: rawGeo(lp, lu) };
}

// 풀포기: 길쭉한 풀잎 아홉 장이 한 뿌리에서 휘어 오른다
function tuftGeometry(seed) {
  const R = rng(seed), lp = [], lu = [];
  for (let b = 0; b < 9; b++) {
    const a = R() * Math.PI * 2, lean = 0.15 + R() * 0.5, h = 0.28 + R() * 0.3, w = 0.022 + R() * 0.012;
    const dx = Math.cos(a), dz = Math.sin(a), sx = -dz, sz = dx, row = [];
    for (let i = 0; i <= 3; i++) {
      const t = i / 3, out = lean * t * t * h, y = h * t * (1 - 0.15 * t), ww = w * (1 - t * 0.9);
      row.push([[dx * out + sx * ww + dx * 0.04, y, dz * out + sz * ww + dz * 0.04], [dx * out - sx * ww + dx * 0.04, y, dz * out - sz * ww + dz * 0.04]]);
    }
    for (let i = 0; i < 3; i++) {
      lp.push(...row[i][0], ...row[i][1], ...row[i + 1][0]); lu.push(0, i / 3, 1, i / 3, 0, (i + 1) / 3);
      if (i < 2) { lp.push(...row[i][1], ...row[i + 1][1], ...row[i + 1][0]); lu.push(1, i / 3, 1, (i + 1) / 3, 0, (i + 1) / 3); }
    }
  }
  return rawGeo(lp, lu);
}

function instanced(scene, geo, material, mats, shadow = true) {
  const im = new THREE.InstancedMesh(geo, material, mats.length);
  mats.forEach((m, i) => im.setMatrixAt(i, m));
  im.instanceMatrix.needsUpdate = true;
  im.castShadow = shadow; im.receiveShadow = true;
  im.computeBoundingSphere();
  scene.add(im);
  return im;
}

const inRect = (x, z, r, pad) => x > r[0] - pad && x < r[2] + pad && z > r[1] - pad && z < r[3] + pad;

export async function build(scene, ctx) {
  const R = rng(4242);
  let rects = [];
  try { rects = (await import('./town.js')).RECTS || []; } catch (e) { /* 거리가 아직 없으면 빈 땅에 심는다 */ }
  const lots = Object.values(LOT).map(L => [L.x0, L.z0, L.x1, L.z1]);
  const free = (x, z, pad) => !ROADS.some(r => inRect(x, z, r, pad * 0.5)) && !lots.some(r => inRect(x, z, r, pad * 0.4)) && !rects.some(r => inRect(x, z, r, pad));
  const inVillage = (x, z) => Math.hypot(x - WALL.cx, z - WALL.cz) < WALL.r - 9 && z > CLIFF.z + 14;

  await ctx.say('나무를 기르는 중…');
  const bark = mat('bark', 0x8a7257);
  const greens = [0x35702a, 0x447f2e, 0x2b6026];
  const big = [0, 1, 2].map(i => treeGeometry(11 + i * 7, { height: 13 + i * 1.5, depth: 4, sprays: 5, leaves: 6, leafLen: 0.5 }));
  const far = [0, 1, 2].map(i => treeGeometry(51 + i * 5, { height: 14 + i * 2, depth: 3, sprays: 5, leaves: 4, leafLen: 1.05, spread: 1.1, flat: true }));
  const place = (x, z, s, y = terrainH(x, z)) => mat4(x, y, z, 0, R() * Math.PI * 2, 0, s);

  // 마을 안 나무: 집과 길 사이 빈 땅에
  const bigM = [[], [], []];
  const addBig = (x, z, s, k = Math.floor(R() * 3)) => { bigM[k].push(place(x, z, s)); const r = 0.5 * s; addCollider(x - r, 0, z - r, x + r, 6, z + r); };
  let tries = 0;
  const spots = [];
  while (spots.length < 38 && tries++ < 6000) {
    const x = (R() - 0.5) * 350, z = WALL.cz + (R() - 0.5) * 350;
    if (!inVillage(x, z) || !free(x, z, 4.2) || spots.some(s => Math.hypot(s[0] - x, s[1] - z) < 11)) continue;
    spots.push([x, z]); addBig(x, z, 0.8 + R() * 0.45);
  }
  // 아카데미 마당의 그네 나무
  const SW = { x: 48, z: -72 };
  bigM[1].push(mat4(SW.x, 0, SW.z, 0, 2.2, 0, 1.15)); addCollider(SW.x - 0.6, 0, SW.z - 0.6, SW.x + 0.6, 6, SW.z + 0.6);
  big.forEach((g, i) => { if (!bigM[i].length) return; instanced(scene, g.wood, bark, bigM[i]); instanced(scene, g.leaves, mat('leaf', greens[i]), bigM[i]); });

  // 그네: 굵은 가로 가지에 밧줄 두 가닥으로 매단 널
  const swing = new THREE.Group();
  {
    const rope = mat('plain', 0xb89a62, { rough: 0.95 }), top = 3.3, sx = SW.x + 2.6, sz = SW.z + 1.2;
    const limbPts = [V(SW.x, 3.5, SW.z), V(SW.x + 1.3, 3.75, SW.z + 0.6), V(sx, top + 0.12, sz), V(sx + 1.5, top + 0.3, sz + 0.7)];
    const limb = new THREE.Mesh(tube(limbPts, t => 0.2 * (1 - 0.5 * t), 8, true), bark); limb.castShadow = true; scene.add(limb);
    const geos = [];
    for (const dx of [-0.26, 0.26]) geos.push(tube([V(dx, 0, 0), V(dx, -top + 0.62, 0)], 0.016, 6, false));
    const seat = new THREE.BoxGeometry(0.72, 0.045, 0.24); seat.translate(0, -top + 0.6, 0);
    const ropes = new THREE.Mesh(mergeGeos(geos), rope), board = new THREE.Mesh(seat, M.beamLight);
    ropes.castShadow = board.castShadow = true;
    swing.add(ropes, board); swing.position.set(sx, top, sz); swing.rotation.y = 0.45;
    scene.add(swing);
  }

  // 담 밖 숲과 바위 위 숲: 방향별로 묶어, 등 뒤의 숲은 그리지 않게 한다
  const SECT = 10, farM = Array.from({ length: SECT * 3 }, () => []);
  const addFar = (x, z, s) => { const k = Math.floor(R() * 3), sec = Math.floor(((Math.atan2(z - WALL.cz, x - WALL.cx) + Math.PI) / (Math.PI * 2)) * SECT) % SECT; farM[sec * 3 + k].push(place(x, z, s)); if (Math.hypot(x, z) < 262) addCollider(x - 0.45, terrainH(x, z) - 1, z - 0.45, x + 0.45, terrainH(x, z) + 6, z + 0.45); };
  tries = 0; let nFar = 0;
  const farSpots = [];
  while (nFar < 175 && tries++ < 9000) {
    const a = R() * Math.PI * 2, r = WALL.r + 9 + R() * 95, x = WALL.cx + Math.cos(a) * r, z = WALL.cz + Math.sin(a) * r;
    if (z < CLIFF.z + 6 && Math.abs(x) < CLIFF.half + CLIFF.fall) continue;       // 절벽 앞면
    if (z > 150 && Math.abs(x) < 12) continue;                                     // 정문 앞길
    if (farSpots.some(s => Math.hypot(s[0] - x, s[1] - z) < 9.5)) continue;
    farSpots.push([x, z]); addFar(x, z, 1.0 + R() * 0.6); nFar++;
  }
  tries = 0; let nTop = 0;
  while (nTop < 36 && tries++ < 3000) {
    const x = (R() - 0.5) * 2 * (CLIFF.half + 20), z = CLIFF.z - 9 - R() * 95;
    if (Math.abs(x - 83) < 9 && z > CLIFF.z - 22) continue;                        // 계단을 올라온 자리
    if (farSpots.some(s => Math.hypot(s[0] - x, s[1] - z) < 9)) continue;
    farSpots.push([x, z]); addFar(x, z, 0.8 + R() * 0.5); nTop++;
  }
  farM.forEach((list, i) => { if (!list.length) return; const g = far[i % 3]; instanced(scene, g.wood, bark, list); instanced(scene, g.leaves, mat('leaf', greens[(i + 1) % 3]), list); });

  // 덤불: 집 담 밑과 길가
  const bush = [bushGeometry(5, 1), bushGeometry(9, 1.3)], bushM = [[], []];
  tries = 0; let nb = 0;
  while (nb < 80 && tries++ < 6000) {
    const x = (R() - 0.5) * 340, z = WALL.cz + (R() - 0.5) * 340;
    if (!inVillage(x, z) || !free(x, z, 0.9)) continue;
    const nearWall = rects.some(r => inRect(x, z, r, 2.6)) || ROADS.some(r => inRect(x, z, r, 3));
    if (!nearWall && R() < 0.8) continue;
    bushM[nb % 2].push(place(x, z, 0.8 + R() * 0.7)); nb++;
  }
  const twig = mat('bark', 0x6e5a40);
  bush.forEach((g, i) => { if (!bushM[i].length) return; instanced(scene, g.wood, twig, bushM[i], false); instanced(scene, g.leaves, mat('leaf', greens[i + 1]), bushM[i]); });

  // 풀포기: 풀밭 여기저기
  const tuft = tuftGeometry(3), tuftM = [];
  tries = 0;
  while (tuftM.length < 2600 && tries++ < 30000) {
    const x = (R() - 0.5) * 360, z = WALL.cz + (R() - 0.5) * 360;
    if (!inVillage(x, z) || !free(x, z, 0.5)) continue;
    tuftM.push(place(x, z, 0.8 + R() * 1.1));
  }
  instanced(scene, tuft, mat('leaf', 0x5c9a3a), tuftM, false);

  return {
    tick: t => { swing.rotation.x = Math.sin(t * 1.1) * 0.05 + Math.sin(t * 0.37) * 0.03; },
    places: [{ n: '그네 나무', t: '아카데미 마당 큰 나무에 매단 그네. 어린 나루토가 혼자 앉아 있던 자리.', b: [44, 54, -77, -67], y: [0, 4] }],
    jumps: [['그네 나무', 53, 0, -68, 0.9, 12]],
  };
}
