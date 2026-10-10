// 건물 조립기(솔로몬 성전 앱에서 쓰던 것을 가져와 손봄) — 상자·각기둥·임의 도형을 재질별로 모아 한 덩어리로 합치고, 걸어 다닐 때 쓸 충돌 상자도 같이 등록한다.
import * as THREE from '../vendor/three.module.js';

/* ---------- 가볍게 짓기(폰) ----------
   폰 브라우저는 한 페이지가 쓸 수 있는 메모리가 작아, 마을을 PC와 똑같이 지으면 페이지가 닫힌다.
   손가락으로 쓰는 기기에서는 기와의 물결(지붕은 평평한 판에 기와 무늬만)과 아주 작은 둥근 장식(못·구슬 따위)을 짓지 않는다. PC는 그대로다.
   확인용: 내 컴퓨터에서는 ?touch=1 / ?touch=0 으로 바꿔 볼 수 있다 */
export const LITE = (() => {
  if (typeof location === 'undefined') return false;
  const q = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) ? new URLSearchParams(location.search).get('touch') : null;
  return q ? q === '1' : matchMedia('(pointer: coarse)').matches;
})();

/* ---------- 충돌 상자 ---------- */
export const colliders = []; // [x0,y0,z0,x1,y1,z1] — 마을 좌표에 똑바로 놓인 것들
const CELL = 6;
let grid = null;

export function addCollider(x0, y0, z0, x1, y1, z1) {
  colliders.push([Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1), Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)]);
  grid = null;
}

// 상자 목록을 칸으로 나눠 담아 둔다(가까운 것만 빨리 찾으려고)
function mkGrid(list) {
  const g = new Map();
  list.forEach((c, i) => {
    for (let gx = Math.floor(c[0] / CELL); gx <= Math.floor(c[3] / CELL); gx++)
      for (let gz = Math.floor(c[2] / CELL); gz <= Math.floor(c[5] / CELL); gz++) {
        const key = gx * 4096 + gz;
        let a = g.get(key);
        if (!a) g.set(key, a = []);
        a.push(i);
      }
  });
  return { g, list, stamp: new Uint32Array(list.length), no: 0 };
}
// 칸 묶음 G에서 주어진 평면 범위에 걸치는 상자를 out에 덧붙인다. px를 주면 (상자, px, pz, 자리) 네 개씩 덧붙인다.
function scan(G, x0, z0, x1, z1, out, px, pz, site) {
  const no = ++G.no, { g, list, stamp } = G;
  for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++)
    for (let gz = Math.floor(z0 / CELL); gz <= Math.floor(z1 / CELL); gz++) {
      const a = g.get(gx * 4096 + gz);
      if (!a) continue;
      for (let n = 0; n < a.length; n++) {
        const i = a[n];
        if (stamp[i] === no) continue;
        stamp[i] = no;
        const c = list[i];
        if (c[0] < x1 && c[3] > x0 && c[2] < z1 && c[5] > z0) { if (px === undefined) out.push(c); else out.push(c, px, pz, site); }
      }
    }
}

// 주어진 평면 범위에 걸치는, 똑바로 놓인 충돌 상자를 out에 담는다(비스듬한 건물의 것은 nearAll로 찾는다).
export function collidersNear(x0, z0, x1, z1, out) {
  if (!grid) grid = mkGrid(colliders);
  out.length = 0;
  scan(grid, x0, z0, x1, z1, out);
  return out;
}

/* ---------- 자리: 비스듬히 놓인 건물 ----------
   건물은 제 좌표(벽이 축에 나란한 좌표)로 짓고, 통째로 돌려서 마을에 놓는다. 충돌 상자와 지붕면도 건물 좌표 그대로 "자리"에 따로 담아 두고,
   걷는 사람의 위치를 그 건물 좌표로 바꿔서 잰다. 사람은 둥근 기둥이라 돌려도 모양이 같으므로 판정은 똑바로 놓인 건물과 똑같다. */
const sites = [], SCELL = 48;
let siteGrid = null;
// (x, z)가 든 칸에 걸친 자리들(자리가 많아도 가까운 것만 본다)
function sitesAt(x, z) {
  if (!siteGrid) {
    siteGrid = new Map();
    for (const s of sites) { const r = s.rad + 1; for (let gx = Math.floor((s.x - r) / SCELL); gx <= Math.floor((s.x + r) / SCELL); gx++) for (let gz = Math.floor((s.z - r) / SCELL); gz <= Math.floor((s.z + r) / SCELL); gz++) { const k = gx * 4096 + gz; let a = siteGrid.get(k); if (!a) siteGrid.set(k, a = []); a.push(s); } }
  }
  return siteGrid.get(Math.floor(x / SCELL) * 4096 + Math.floor(z / SCELL)) || NONE;
}
const NONE = [];
// from(marks()) 뒤에 등록된 충돌 상자·지붕면을 떼어 새 자리에 담는다. 건물 좌표의 (ox, oz)가 마을의 (x, z)에 오고, ry만큼 돌아간다.
export function makeSite(from, { x, z, ry = 0, ox = 0, oz = 0, pad = 0 }) {
  const cs = colliders.splice(from[0]), rs = roofs.splice(from[1]);
  grid = null; roofGrid = null;
  let rad = 0;
  for (const c of cs) for (const cx of [c[0], c[3]]) for (const cz of [c[2], c[5]]) rad = Math.max(rad, Math.hypot(cx - ox, cz - oz));
  for (const r of rs) for (const cx of [r[0], r[2]]) for (const cz of [r[1], r[3]]) rad = Math.max(rad, Math.hypot(cx - ox, cz - oz));
  const s = { x, z, ox, oz, ry, cos: Math.cos(ry), sin: Math.sin(ry), rad: rad + pad, G: mkGrid(cs), rs };   // pad: 나중에 처마 따위가 더 담길 여유
  s.toLocal = (wx, wz) => { const dx = wx - x, dz = wz - z; return [ox + dx * s.cos - dz * s.sin, oz + dx * s.sin + dz * s.cos]; };
  s.toWorld = (lx, lz) => { const dx = lx - ox, dz = lz - oz; return [x + dx * s.cos + dz * s.sin, z - dx * s.sin + dz * s.cos]; };
  sites.push(s); siteGrid = null;
  return s;
}
// 자리에 담긴 것을 from 뒤에 등록된 충돌 상자·지붕면으로 바꿔 담는다(가볍게 막아 두었던 집을 곱게 지었을 때).
export function refillSite(s, from) {
  const cs = colliders.splice(from[0]), rs = roofs.splice(from[1]);
  grid = null; roofGrid = null;
  s.G = mkGrid(cs); s.rs = rs;
}
// from 뒤에 등록된 충돌 상자·지붕면을 버린다(이미 자리에 담아 둔 집을 다시 지을 때).
export function dropSince(from) { colliders.length = from[0]; roofs.length = from[1]; grid = null; roofGrid = null; }

// (x, z) 둘레 r 안에 걸치는 모든 충돌 상자를 out에 (상자, px, pz, 자리) 네 개씩 담는다. px, pz는 그 상자의 좌표로 바꾼 (x, z), 자리는 비스듬한 건물이면 그 자리(아니면 null)다.
export function nearAll(x, z, r, out) {
  if (!grid) grid = mkGrid(colliders);
  out.length = 0;
  scan(grid, x - r, z - r, x + r, z + r, out, x, z, null);
  for (const s of sitesAt(x, z)) {
    const dx = x - s.x, dz = z - s.z, lim = s.rad + r;
    if (dx * dx + dz * dz > lim * lim) continue;
    const lx = s.ox + dx * s.cos - dz * s.sin, lz = s.oz + dx * s.sin + dz * s.cos;
    scan(s.G, lx - r, lz - r, lx + r, lz + r, out, lx, lz, s);
  }
  return out;
}

/* ---------- 지붕면: 밟고 설 수 있는 비스듬한 바닥 ----------
   충돌 상자는 네모뿐이라 기운 지붕을 담지 못한다. 지붕은 "그 자리의 높이를 돌려주는 함수"로 따로 적어 둔다.
   얇은 한 장짜리 바닥이라 밑에서는 그냥 지나가고(처마 밑을 걷거나 뛰어올라 통과), 위에서 내려올 때만 받쳐 준다. */
const roofs = [];   // [x0, z0, x1, z1, (x, z) → 높이(면 밖이면 -Infinity)]
let roofGrid = null;
// round: 둥근 지붕인가(지도에 건물 바닥꼴을 그릴 때 동그라미로 그린다)
export function addRoof(x0, z0, x1, z1, fn, round = false) { roofs.push([x0, z0, x1, z1, fn, round]); roofGrid = null; }
// 지도에 그릴 건물 바닥꼴. 지붕면의 테두리에서 얻는다(길가 집은 자리에 적어 둔 바닥꼴 fp). { p: 네 모서리 } 또는 { c: [x, z, 반지름] }, house = 길가 집
export function footprints() {
  const out = [];
  const add = (r, P, house) => {
    const w = r[2] - r[0], d = r[3] - r[1]; if (w < 2 || d < 2 || w > 90 || d > 90) return;
    if (r[5]) { const c = P((r[0] + r[2]) / 2, (r[1] + r[3]) / 2); out.push({ c: [c[0], c[1], Math.min(w, d) / 2], house }); }
    else out.push({ p: [P(r[0], r[1]), P(r[2], r[1]), P(r[2], r[3]), P(r[0], r[3])], house });
  };
  for (const r of roofs) add(r, (x, z) => [x, z], false);
  for (const s of sites) { if (s.fp) add(s.fp, s.toWorld, true); else for (const r of s.rs) add(r, s.toWorld, false); }
  return out;
}
// (x, z)에서 limit 높이 이하인 지붕면 가운데 가장 높은 것. 없으면 -Infinity.
export function roofAt(x, z, limit) {
  if (!roofGrid) {
    roofGrid = new Map();
    for (const r of roofs) for (let gx = Math.floor(r[0] / CELL); gx <= Math.floor(r[2] / CELL); gx++) for (let gz = Math.floor(r[1] / CELL); gz <= Math.floor(r[3] / CELL); gz++) {
      const key = gx * 4096 + gz; let a = roofGrid.get(key); if (!a) roofGrid.set(key, a = []); a.push(r);
    }
  }
  const a = roofGrid.get(Math.floor(x / CELL) * 4096 + Math.floor(z / CELL));
  let best = -Infinity;
  if (a) for (const r of a) { if (x < r[0] || x > r[2] || z < r[1] || z > r[3]) continue; const h = r[4](x, z); if (h <= limit && h > best) best = h; }
  for (const s of sitesAt(x, z)) {   // 비스듬한 건물의 지붕
    if (!s.rs.length) continue;
    const dx = x - s.x, dz = z - s.z;
    if (dx * dx + dz * dz > s.rad * s.rad) continue;
    const lx = s.ox + dx * s.cos - dz * s.sin, lz = s.oz + dx * s.sin + dz * s.cos;
    for (const r of s.rs) { if (lx < r[0] || lx > r[2] || lz < r[1] || lz > r[3]) continue; const h = r[4](lx, lz); if (h <= limit && h > best) best = h; }
  }
  return best;
}

// 제 좌표로 지은 건물(holder에 담긴 것)을 마을의 제자리에 돌려 놓는다. 충돌 상자·지붕면은 자리에 담고, 건물이 돌려준 자리 이름·바로 가기·등불도 마을 좌표로 바꾼다.
export function settle(scene, holder, from, at, res) {
  const s = makeSite(from, at), outer = new THREE.Group();
  holder.position.set(-s.ox, 0, -s.oz);
  outer.position.set(s.x, 0, s.z); outer.rotation.y = s.ry;
  outer.add(holder); scene.add(outer);
  if (!res) return res;
  const P = (x, z) => s.toWorld(x, z);
  for (const p of res.places || []) {
    const poly = (p.poly || [[p.b[0], p.b[2]], [p.b[1], p.b[2]], [p.b[1], p.b[3]], [p.b[0], p.b[3]]]).map(q => P(q[0], q[1]));
    p.poly = poly;
    p.b = [Math.min(...poly.map(q => q[0])), Math.max(...poly.map(q => q[0])), Math.min(...poly.map(q => q[1])), Math.max(...poly.map(q => q[1]))];
  }
  if (res.jumps) res.jumps = res.jumps.map(([n, x, y, z, yaw = 0, k]) => { const w = P(x, z); return [n, w[0], y, w[1], yaw + s.ry, k]; });
  for (const key of ['lights', 'glows']) if (res[key]) res[key] = res[key].map(l => { const w = P(l[0], l[2]); return [w[0], l[1], w[1], ...l.slice(3)]; });
  return res;
}

// 지금까지 등록된 충돌 상자·지붕면의 개수(이 뒤에 등록되는 것만 골라 키울 때 쓴다)
export const marks = () => [colliders.length, roofs.length];
// from 뒤에 등록된 충돌 상자·지붕면을 (px, pz)를 중심으로 S배 키운다. keep에 든 번호의 충돌 상자는 그대로 둔다.
export function rescale(from, S, px, pz, keep) {
  for (let i = from[0]; i < colliders.length; i++) {
    if (keep && keep.has(i)) continue;
    const c = colliders[i];
    c[0] = px + (c[0] - px) * S; c[3] = px + (c[3] - px) * S; c[2] = pz + (c[2] - pz) * S; c[5] = pz + (c[5] - pz) * S; c[1] *= S; c[4] *= S;
  }
  for (let i = from[1]; i < roofs.length; i++) {
    const r = roofs[i], f = r[4];
    r[0] = px + (r[0] - px) * S; r[2] = px + (r[2] - px) * S; r[1] = pz + (r[1] - pz) * S; r[3] = pz + (r[3] - pz) * S;
    r[4] = (x, z) => S * f(px + (x - px) / S, pz + (z - pz) / S);
  }
  grid = null; roofGrid = null;
}

/* ---------- 조립기 ---------- */
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3();

export class Builder {
  constructor() { this.parts = new Map(); }

  buf(mat) {
    let b = this.parts.get(mat);
    if (!b) this.parts.set(mat, b = { p: [], n: [], u: [] });
    return b;
  }

  // 네 꼭짓점(바깥에서 볼 때 반시계)으로 사각형 한 장
  quad(b, a, bb, c, d, n, uv) {
    b.p.push(...a, ...bb, ...c, ...a, ...c, ...d);
    for (let i = 0; i < 6; i++) b.n.push(n[0], n[1], n[2]);
    b.u.push(uv[0], uv[1], uv[2], uv[3], uv[4], uv[5], uv[0], uv[1], uv[4], uv[5], uv[6], uv[7]);
  }

  // 축에 나란한 상자. 무늬 좌표는 실제 길이(m) 그대로 — 재질 쪽에서 반복 크기를 정한다.
  box(mat, x0, y0, z0, x1, y1, z1, collide = true) {
    if (x0 > x1) [x0, x1] = [x1, x0];
    if (y0 > y1) [y0, y1] = [y1, y0];
    if (z0 > z1) [z0, z1] = [z1, z0];
    const b = this.buf(mat), q = this.quad;
    q(b, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [z1, y0, z0, y0, z0, y1, z1, y1]);
    q(b, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [z0, y0, z1, y0, z1, y1, z0, y1]);
    q(b, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [x0, z1, x1, z1, x1, z0, x0, z0]);
    q(b, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [x0, z0, x1, z0, x1, z1, x0, z1]);
    q(b, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [x0, y0, x1, y0, x1, y1, x0, y1]);
    q(b, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [x1, y0, x0, y0, x0, y1, x1, y1]);
    if (collide) addCollider(x0, y0, z0, x1, y1, z1);
  }

  // 볼록 다각형을 한 축으로 밀어 낸 각기둥. axis 'x'면 poly는 [z,y], 'z'면 [x,y].
  prism(mat, axis, poly, a0, a1) {
    const b = this.buf(mat);
    const P = (u, v, a) => (axis === 'x' ? [a, v, u] : [u, v, a]);
    const tri = (A, B, C) => {
      _v.set(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
      _n.set(C[0] - A[0], C[1] - A[1], C[2] - A[2]);
      _v.cross(_n).normalize();
      b.p.push(...A, ...B, ...C);
      for (const p of [A, B, C]) {
        b.n.push(_v.x, _v.y, _v.z);
        const ax = Math.abs(_v.x), ay = Math.abs(_v.y), az = Math.abs(_v.z);
        if (ay >= ax && ay >= az) b.u.push(p[0], p[2]); else if (ax >= az) b.u.push(p[2], p[1]); else b.u.push(p[0], p[1]);
      }
    };
    // 두 마구리 면의 감긴 방향을 다각형 넓이 부호로 맞춘다
    let area = 0;
    for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; area += p[0] * q[1] - q[0] * p[1]; }
    const ccw = (area > 0) === (axis === 'z');
    for (let i = 1; i < poly.length - 1; i++) {
      const A0 = P(poly[0][0], poly[0][1], a0), B0 = P(poly[i][0], poly[i][1], a0), C0 = P(poly[i + 1][0], poly[i + 1][1], a0);
      const A1 = P(poly[0][0], poly[0][1], a1), B1 = P(poly[i][0], poly[i][1], a1), C1 = P(poly[i + 1][0], poly[i + 1][1], a1);
      if (ccw) { tri(A1, B1, C1); tri(A0, C0, B0); } else { tri(A1, C1, B1); tri(A0, B0, C0); }
    }
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i], q = poly[(i + 1) % poly.length];
      const p0 = P(p[0], p[1], a0), p1 = P(p[0], p[1], a1), q0 = P(q[0], q[1], a0), q1 = P(q[0], q[1], a1);
      if (ccw) { tri(p0, q0, q1); tri(p0, q1, p1); } else { tri(p0, q1, q0); tri(p0, p1, q1); }
    }
  }

  // three 도형을 행렬로 옮겨서 합친다. uvScale을 주면 무늬 좌표를 실제 길이로 늘린다.
  geo(mat, g, m, uvScale) {
    const b = this.buf(mat);
    const s = g.index ? g.toNonIndexed() : g;
    const pos = s.attributes.position, nor = s.attributes.normal, uv = s.attributes.uv, kd = s.attributes.aKind;
    // 화풍 표시(aKind: 잎과 잎 덩어리를 가르는 값)가 있는 도형이면 함께 가져간다. 표시가 없는 꼭짓점은 0(늘 그림)
    if (kd && !b.k) b.k = [];
    if (b.k) while (b.k.length < b.p.length / 3) b.k.push(0);
    const flip = m && m.determinant() < 0;
    if (m) _nm.getNormalMatrix(m);
    const cnt = pos.count;
    if (LITE && cnt > 180) { if (!g.boundingSphere) g.computeBoundingSphere(); if (g.boundingSphere.radius * (m ? m.getMaxScaleOnAxis() : 1) < 0.12) return; }   // 폰: 손톱만 한 둥근 장식은 짓지 않는다
    for (let t = 0; t < cnt; t += 3) {
      for (let k = 0; k < 3; k++) {
        const i = t + (flip ? 2 - k : k);
        _v.fromBufferAttribute(pos, i);
        if (m) _v.applyMatrix4(m);
        b.p.push(_v.x, _v.y, _v.z);
        _n.fromBufferAttribute(nor, i);
        if (m) _n.applyMatrix3(_nm).normalize();
        b.n.push(_n.x, _n.y, _n.z);
        if (uv) b.u.push(uv.getX(i) * (uvScale ? uvScale[0] : 1), uv.getY(i) * (uvScale ? uvScale[1] : 1));
        else b.u.push(0, 0);
        if (b.k) b.k.push(kd ? kd.getX(i) : 0);
      }
    }
  }

  // 다른 조립기에 모인 것을 행렬 m(돌리고 옮기기만 하는 것)으로 옮겨서 가져온다.
  absorb(other, m) {
    const e = m.elements;
    for (const [mat, b] of other.parts) {
      const d = this.buf(mat), p = b.p, n = b.n, u = b.u;
      for (let i = 0; i < p.length; i += 3) {
        const x = p[i], y = p[i + 1], z = p[i + 2], nx = n[i], ny = n[i + 1], nz = n[i + 2];
        d.p.push(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
        d.n.push(e[0] * nx + e[4] * ny + e[8] * nz, e[1] * nx + e[5] * ny + e[9] * nz, e[2] * nx + e[6] * ny + e[10] * nz);
      }
      for (let i = 0; i < u.length; i++) d.u.push(u[i]);
      if (b.k) { if (!d.k) d.k = []; const n0 = d.p.length / 3 - p.length / 3; while (d.k.length < n0) d.k.push(0); for (let i = 0; i < p.length / 3; i++) d.k.push(b.k[i] || 0); }
    }
  }

  // three 도형을 자리(x,y,z)·돌림(ry)·크기로 놓는 짧은 길
  put(mat, g, x, y, z, ry = 0, s = 1, rx = 0, rz = 0) { this.geo(mat, g, mat4(x, y, z, rx, ry, rz, s)); }

  finish(parent, { shadow = true } = {}) {
    const group = new THREE.Group();
    for (const [mat, b] of this.parts) {
      if (!b.p.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(b.p), 3));
      g.setAttribute('normal', packNormals(b.n));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(b.u), 2));
      if (b.k) { const k = new Float32Array(b.p.length / 3); k.set(b.k); g.setAttribute('aKind', new THREE.BufferAttribute(k, 1)); }
      g.computeBoundingSphere(); g.computeBoundingBox(); leanGeo(g);
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = shadow && !mat.userData.noShadow;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
    this.parts.clear();
    if (parent) parent.add(group);
    return group;
  }
}

/* ---------- 메모리 아끼기 ----------
   지어 놓고 다시 고치지 않는 도형은, 그래픽 카드로 올려 보낸 뒤에는 이쪽(자바스크립트)의 사본이 필요 없다. 올리는 순간 사본을 버린다.
   그러지 않으면 같은 자료를 두 벌 들고 있게 되어, 메모리가 작은 폰에서는 브라우저가 페이지를 닫아 버린다.
   자리(position)만은 먼 거리용 손질(lod.js)이 나중에 읽으므로, 그 손질이 끝났다고 알려 줄 때(doneGeo) 버린다. 둘레(boundingSphere·Box)는 미리 재 둔다. */
// 면이 보는 쪽(법선)은 방향만 있으면 되므로 소수 셋(12바이트) 대신 작은 정수 셋(3바이트)으로 담는다. 그리는 쪽에서 다시 길이 1로 맞춘다
function packNormals(n) { const a = new Int8Array(n.length); for (let i = 0; i < n.length; i++) a[i] = Math.max(-127, Math.min(127, Math.round(n[i] * 127))); return new THREE.BufferAttribute(a, 3, true); }
const dropArr = a => { a.array = new a.array.constructor(0); };   // 빈 것으로 바꾼다(길이를 재는 코드가 있어도 터지지 않게). 개수(count)는 그대로 남는다
export function leanGeo(g, keep = []) {
  if (g.index && !g.index.onUploadCallback.lean) { g.index.onUploadCallback = function () { dropArr(this); }; g.index.onUploadCallback.lean = true; }
  for (const name in g.attributes) {
    const a = g.attributes[name]; if (keep.includes(name) || a.isInterleavedBufferAttribute || a.isInstancedBufferAttribute || a.usage !== THREE.StaticDrawUsage || a.onUploadCallback.lean) continue;
    if (name === 'position') a.onUploadCallback = function () { this._up = true; if (this._done) dropArr(this); };
    else a.onUploadCallback = function () { dropArr(this); };
    a.onUploadCallback.lean = true;
  }
  return g;
}
export function doneGeo(g) { const a = g.attributes.position; if (!a || !a.onUploadCallback.lean || a._done) return; a._done = true; if (a._up) dropArr(a); }

// 장면 안의 모든 고정 도형에 한꺼번에 건다(다 짓고 나서 한 번). 점 무리(Points)와 선은 장면마다 자리를 고쳐 쓰는 것이 있어 건드리지 않는다
export function leanScene(scene) {
  // 글자·무늬를 그려 둔 그림판(canvas)도 그래픽 카드로 올린 뒤에는 비운다. 같은 그림판을 여러 재질이 나눠 쓰면 건드리지 않는다
  const users = new Map(), texOf = m => { const out = []; for (const k in m) { const t = m[k]; if (t && t.isTexture && t.image && typeof HTMLCanvasElement !== 'undefined' && t.image instanceof HTMLCanvasElement) out.push(t); } return out; };
  scene.traverse(o => { for (const m of [].concat(o.material || [])) for (const t of texOf(m)) { let s = users.get(t.image); if (!s) users.set(t.image, s = new Set()); s.add(t); } });
  for (const [cv, set] of users) if (set.size === 1) { const t = [...set][0]; if (!t.onUpdate) t.onUpdate = () => { cv.width = cv.height = 1; t.onUpdate = null; }; }
  scene.traverse(o => { if (!o.isMesh || o.isSkinnedMesh || !o.geometry || !o.geometry.attributes.position) return; const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); if (!g.boundingBox) g.computeBoundingBox(); leanGeo(g); if (g.userData.far) leanGeo(g.userData.far); });
}

/* ---------- 도형 도우미 ---------- */

// 벽 한 줄에 문·창 구멍을 내며 쌓는다. axis 'x'면 x 방향으로 뻗은 벽(두께는 z: f0~f1).
// openings: [{u0,u1, ys:[[y0,y1],...]}] — 같은 자리에 창이 여러 층이면 ys에 여러 개.
// solidWindows: 창(바닥에서 떨어진 구멍)이 난 칸은 충돌 상자를 위아래 한 덩어리로 둔다 — 창턱이 따로 놀면 계단 옆에서 발 높이가
// 창턱 높이를 지날 때 "딛고 오를 수 있는 턱"으로 여겨져 사람이 벽 속으로 파고든다. 창은 유리가 막고 있어 어차피 지나갈 수 없다.
export function wall(B, mat, axis, f0, f1, u0, u1, y0, y1, openings = [], collide = true, solidWindows = false) {
  let hard = collide;
  const put = (a, b, ya, yb) => {
    if (b - a < 1e-4 || yb - ya < 1e-4) return;
    if (axis === 'x') B.box(mat, a, ya, f0, b, yb, f1, hard); else B.box(mat, f0, ya, a, f1, yb, b, hard);
  };
  const ops = openings.slice().sort((p, q) => p.u0 - q.u0);
  let u = u0;
  for (const o of ops) {
    put(u, o.u0, y0, y1);
    let y = y0;
    const ys = o.ys.slice().sort((p, q) => p[0] - q[0]), whole = collide && solidWindows && ys.length && ys[0][0] > y0 + 0.5;
    if (whole) { hard = false; if (axis === 'x') addCollider(o.u0, y0, f0, o.u1, y1, f1); else addCollider(f0, y0, o.u0, f1, y1, o.u1); }
    // 문 밑에 남는 낮은 벽은 3cm 낮춘다 — 그 윗면이 방바닥 윗면과 한 높이면 문턱에서 두 면이 겹쳐 깜빡인다
    for (const [a, b] of ys) { put(o.u0, o.u1, y, y === y0 && a - y0 < 0.6 ? a - 0.03 : a); y = b; }
    put(o.u0, o.u1, y, y1);
    hard = collide;
    u = o.u1;
  }
  put(u, u1, y0, y1);
}

// 계단. dir은 내려가는 방향(+1/-1). top이 가장 윗단이 끝나는 자리(= 윗바닥 가장자리).
// slab을 주면 속이 찬 계단 대신 그 두께의 디딤판만 놓는다(계단 밑으로 지나다닐 수 있다).
export function stairs(B, mat, axis, top, dir, yLow, yHigh, w0, w1, tread = 0.4, slab = 0) {
  const n = Math.round((yHigh - yLow) / 0.2);
  for (let k = 1; k < n; k++) {
    const far = top + dir * tread * (n - k), near = slab ? top + dir * tread * (n - k - 1) : top;
    const yb = slab ? yLow + k * 0.2 - slab : yLow;
    if (axis === 'x') B.box(mat, near, yb, w0, far, yLow + k * 0.2, w1);
    else B.box(mat, w0, yb, near, w1, yLow + k * 0.2, far);
  }
}

// 점들을 따라가는 관. rad는 숫자거나 (0~1)→반지름 함수.
export function tube(pts, rad, sides = 8, caps = true) {
  const n = pts.length, pos = [], uv = [], idx = [];
  const T = new THREE.Vector3(), N = new THREE.Vector3(0, 1, 0), Bn = new THREE.Vector3(), t2 = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    T.subVectors(pts[Math.min(i + 1, n - 1)], pts[Math.max(i - 1, 0)]).normalize();
    if (i === 0 && Math.abs(T.y) > 0.9) N.set(1, 0, 0);
    N.sub(t2.copy(T).multiplyScalar(N.dot(T))).normalize();
    Bn.crossVectors(T, N);
    const r = typeof rad === 'function' ? rad(i / (n - 1)) : rad;
    for (let j = 0; j < sides; j++) {
      const a = j / sides * Math.PI * 2, c = Math.cos(a) * r, s = Math.sin(a) * r;
      pos.push(pts[i].x + N.x * c + Bn.x * s, pts[i].y + N.y * c + Bn.y * s, pts[i].z + N.z * c + Bn.z * s);
      uv.push(j / sides, i / (n - 1));
    }
  }
  for (let i = 0; i < n - 1; i++)
    for (let j = 0; j < sides; j++) {
      const a = i * sides + j, b = i * sides + (j + 1) % sides, c = a + sides, d = b + sides;
      idx.push(a, b, c, b, d, c);
    }
  if (caps) {
    const c0 = pos.length / 3; pos.push(pts[0].x, pts[0].y, pts[0].z); uv.push(0.5, 0);
    const c1 = c0 + 1; pos.push(pts[n - 1].x, pts[n - 1].y, pts[n - 1].z); uv.push(0.5, 1);
    for (let j = 0; j < sides; j++) {
      idx.push(c0, (j + 1) % sides, j);
      idx.push(c1, (n - 1) * sides + j, (n - 1) * sides + (j + 1) % sides);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// 여러 도형을 하나로(위치·법선·무늬 좌표만).
export function mergeGeos(list) {
  const B = new Builder(), key = {};
  for (const it of list) Array.isArray(it) ? B.geo(key, it[0], it[1]) : B.geo(key, it);
  const b = B.parts.get(key), g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(b.u, 2));
  if (b.k) { const k = new Float32Array(b.p.length / 3); k.set(b.k); g.setAttribute('aKind', new THREE.BufferAttribute(k, 1)); }
  return g;
}

export const mat4 = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) => {
  const sc = typeof s === 'number' ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s);
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), sc);
};

// 씨앗 난수(같은 씨앗이면 늘 같은 배치)
export function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* ---------- 나뭇잎 마을 문장 ----------
   안에서 밖으로 풀리는 소용돌이가 왼쪽 아래 잎끝으로 뾰족하게 빠지고, 오른쪽 위에 작은 세모가 붙는다. 두루마리(메뉴) 머리의 문장(index.html의 #leaf)과 같은 그림이며,
   마을 어디서나 이 하나를 쓴다(간판·깃발·바닥·바위 얼굴의 이마 보호대). 좌표는 100칸짜리 판 위의 것이고 한가운데는 (52, 52)이다. */
const LEAF_SEG = [[51, 51], ['C', 51, 46, 58, 45, 60, 51], ['C', 63, 60, 52, 66, 44, 61], ['C', 33, 54, 37, 37, 51, 34], ['C', 68, 31, 80, 46, 76, 62], ['C', 73, 76, 58, 84, 44, 80], ['L', 20, 90], ['L', 30, 68], ['C', 22, 56, 23, 40, 33, 30]];
export const LEAF_TRI = [[70, 22], [84, 14], [80, 30]];
// 붓길을 따라 찍은 점들(그림이 아니라 깎거나 새길 때 쓴다)
export const LEAF_PTS = (() => {
  const p = [LEAF_SEG[0]]; let [x, y] = LEAF_SEG[0];
  for (const q of LEAF_SEG.slice(1)) {
    if (q[0] === 'L') p.push([q[1], q[2]]);
    else for (let i = 1; i <= 5; i++) { const t = i / 5, u = 1 - t; p.push([u * u * u * x + 3 * u * u * t * q[1] + 3 * u * t * t * q[3] + t * t * t * q[5], u * u * u * y + 3 * u * u * t * q[2] + 3 * u * t * t * q[4] + t * t * t * q[6]]); }
    x = q[q.length - 2]; y = q[q.length - 1];
  }
  return p;
})();
// 그림판에 문장을 그린다. (cx, cy) = 한가운데, s = 문장의 크기(키가 0.9s쯤), col = 먹빛
export function leafMark(g, cx, cy, s, col) {
  const k = s / 86;
  g.save(); g.translate(cx - 52 * k, cy - 52 * k); g.scale(k, k);
  g.strokeStyle = g.fillStyle = col; g.lineWidth = 7.5; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(LEAF_SEG[0][0], LEAF_SEG[0][1]);
  for (const q of LEAF_SEG.slice(1)) q[0] === 'L' ? g.lineTo(q[1], q[2]) : g.bezierCurveTo(q[1], q[2], q[3], q[4], q[5], q[6]);
  g.stroke();
  g.beginPath(); LEAF_TRI.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill();
  g.restore();
}
