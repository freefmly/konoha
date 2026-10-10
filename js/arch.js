// 건축 부품 — 기와지붕(맞배·우진각·원뿔), 둥근 벽과 바닥, 창·문틀, 난간, 포렴, 간판, 등롱.
// 모든 각도는 a → (cx + r·cos a, cz + r·sin a). a=0 동(+x), a=π/2 남(+z), a=π 서, a=-π/2 북.
import * as THREE from '../vendor/three.module.js';
import { addCollider, addRoof, mat4, tube, wall } from './build.js';

const TILE_TOP = 0.09;   // 기와 두께만큼 밟는 면을 올린다
import { mat, M, textMat, toonize } from './materials.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

/* ---------- 기와 한 면 ----------
   o: 처마 왼쪽 끝, U: 처마를 따라가는 단위벡터, V: 처마에서 용마루로 오르는 단위벡터(U×V가 바깥 법선이어야 한다).
   w: 처마 길이, len: 경사 길이, range(v) → [uMin, uMax]. detail: 기왓골 하나를 몇 조각으로 굽힐지(4 = 둥근 수키와, 2 = 거친 골).
   lip=false면 기와 아랫단 턱을 생략한다(멀리 있는 집의 삼각형 수를 줄일 때). */
export function tilePanel(B, m, o, U, V, w, len, range = null, detail = 4, lip = true) {
  const N = new THREE.Vector3().crossVectors(U, V).normalize();
  const P = 0.3, C = 0.36, AMP = 0.055, LIP = 0.035, du = P / detail;
  const pos = [], uv = [], idx = [];
  const wave = u => AMP * Math.pow(Math.abs(Math.cos(Math.PI * u / P)), 0.7);
  const push = (u, v, lift, edge = false) => {
    const h = (edge && range ? 0 : wave(u)) + lift;
    pos.push(o.x + U.x * u + V.x * v + N.x * h, o.y + U.y * u + V.y * v + N.y * h, o.z + U.z * u + V.z * v + N.z * h);
    uv.push(u, v);
    return pos.length / 3 - 1;
  };
  const rg = v => (range ? range(v) : [0, w]);
  const courses = Math.max(1, Math.round(len / C)), cl = len / courses;
  for (let k = 0; k < courses; k++) {
    const v0 = k * cl, v1 = (k + 1) * cl, [a0, b0] = rg(v0), [a1, b1] = rg(v1);
    if (b0 - a0 < 1e-4 && b1 - a1 < 1e-4) continue;
    const i0 = Math.ceil((Math.max(a0, a1) + 1e-6) / du), i1 = Math.floor((Math.min(b0, b1) - 1e-6) / du);
    // 턱을 만들지 않을 때는 켜 사이에 틈이 벌어지지 않게 단차 없이 잇는다(틈으로 밑이 비쳐 멀리서 깜빡인다)
    const L0 = lip ? LIP : 0;
    const rowA = [push(a0, v0, L0, true)], rowB = [push(a1, v1, 0, true)];
    for (let i = i0; i <= i1; i++) { rowA.push(push(i * du, v0, L0)); rowB.push(push(i * du, v1, 0)); }
    rowA.push(push(b0, v0, L0, true)); rowB.push(push(b1, v1, 0, true));
    for (let i = 0; i < rowA.length - 1; i++) idx.push(rowA[i], rowA[i + 1], rowB[i + 1], rowA[i], rowB[i + 1], rowB[i]);
    // 기와 아랫단의 두께(턱)
    if (k > 0 && lip) for (let i = 0; i < rowA.length - 1; i++) {
      const pa = rowA[i], pb = rowA[i + 1];
      const qa = pos.length / 3; pos.push(pos[pa * 3] - N.x * LIP, pos[pa * 3 + 1] - N.y * LIP, pos[pa * 3 + 2] - N.z * LIP); uv.push(uv[pa * 2], v0);
      pos.push(pos[pb * 3] - N.x * LIP, pos[pb * 3 + 1] - N.y * LIP, pos[pb * 3 + 2] - N.z * LIP); uv.push(uv[pb * 2], v0);
      idx.push(qa, qa + 1, pb, qa, pb, pa);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  B.geo(m, g);
}

// 두 점 사이에 놓는 각재(서까래·박공널·용마루처럼 기울어진 부재). up은 단면의 "위" 방향 기준.
export function beamBetween(B, m, p0, p1, wdt, hgt, up = V3(0, 1, 0)) {
  const d = new THREE.Vector3().subVectors(p1, p0), L = d.length();
  if (L < 1e-5) return;
  const z = d.clone().normalize(), x = new THREE.Vector3().crossVectors(up, z);
  if (x.lengthSq() < 1e-8) x.set(1, 0, 0);
  x.normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  const mm = new THREE.Matrix4().makeBasis(x, y, z).setPosition((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2);
  const g = new THREE.BoxGeometry(wdt, hgt, L);
  const uvA = g.attributes.uv; for (let i = 0; i < uvA.count; i++) uvA.setXY(i, uvA.getX(i) * wdt, uvA.getY(i) * L);
  B.geo(m, g, mm);
}

// 용마루·내림마루: 받침 위에 둥근 수키와를 엎어 이은 마루, 끝에는 막새(둥근 마구리)
export function ridgeLine(B, m, p0, p1, r = 0.13) {
  const d = new THREE.Vector3().subVectors(p1, p0), L = d.length(), n = Math.max(2, Math.round(L / 0.4));
  beamBetween(B, m, p0.clone().setY(p0.y - 0.02), p1.clone().setY(p1.y - 0.02), r * 2.1, 0.16);
  const pts = [];
  for (let i = 0; i <= n * 4; i++) {
    const t = i / (n * 4), ph = (t * n) % 1;
    const p = p0.clone().lerp(p1, t); p.y += 0.1 + 0.018 * (1 - ph);               // 기와마다 턱이 진다
    pts.push(p);
  }
  B.geo(m, tube(pts, r, 10, true));
  for (const [p, q] of [[p0, p1], [p1, p0]]) {                                    // 양 끝 막새
    const out = new THREE.Vector3().subVectors(p, q).normalize();
    const g = new THREE.CylinderGeometry(r * 1.45, r * 1.45, 0.07, 14);
    const mm = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), out)).setPosition(p.x + out.x * 0.03, p.y + 0.1, p.z + out.z * 0.03);
    B.geo(m, g, mm);
  }
}

/* ---------- 맞배지붕 ----------
   벽 윗선이 yEave인 네모 건물(x0..x1, z0..z1) 위에 얹는다. rise = 벽 윗선에서 용마루까지 높이.
   opts: ridge 'x'|'z'(용마루 방향, 기본은 긴 쪽), over 처마 내밀기, overGable 박공 쪽 내밀기, wood 서까래·박공널 재질,
         gable 박공벽 재질(주면 삼각형 벽을 채운다), detail 기와 굽힘(4|2), rafters 서까래 꼬리 달기 */
export function gableRoof(B, m, x0, z0, x1, z1, yEave, rise, opts = {}) {
  const { over = 0.7, overGable = 0.45, wood = M.beam, gable = null, detail = 4, rafters = true, lip = true } = opts;
  const ridge = opts.ridge || (x1 - x0 >= z1 - z0 ? 'x' : 'z');
  // 용마루가 x 방향이라고 보고 만들고, z 방향이면 좌표를 바꿔 낀다
  const sw = ridge === 'z';
  const a0 = sw ? z0 : x0, a1 = sw ? z1 : x1, b0 = sw ? x0 : z0, b1 = sw ? x1 : z1;   // a: 용마루 방향, b: 경사 방향
  const P = (a, y, b) => (sw ? V3(b, y, a) : V3(a, y, b));
  const half = (b1 - b0) / 2, bm = (b0 + b1) / 2, slope = rise / half;
  const yE = yEave - over * slope, run = half + over, len = Math.hypot(run, run * slope);
  const aL = a0 - overGable, aR = a1 + overGable, wdt = aR - aL;
  const yR = yEave + rise;
  for (const s of [1, -1]) {                       // s=1: b1 쪽 경사, s=-1: b0 쪽 경사
    const eaveB = s > 0 ? b1 + over : b0 - over;
    const Vv = P(0, yR - yE, bm - eaveB).sub(P(0, 0, 0)).normalize();
    // U×V가 위를 보게 U 방향을 고른다
    let U = P(1, 0, 0).sub(P(0, 0, 0)), o = P(aL, yE + 0.05, eaveB);
    if (new THREE.Vector3().crossVectors(U, Vv).y < 0) { U.negate(); o = P(aR, yE + 0.05, eaveB); }
    tilePanel(B, m, o, U, Vv, wdt, len, null, detail, lip);
    // 지붕널(밑면)과 처마 끝 평고대
    const e0 = P(aL, yE, eaveB), e1 = P(aR, yE, eaveB), r0 = P(aL, yR, bm), r1 = P(aR, yR, bm);
    const g = new THREE.BufferGeometry();
    const und = [e0, e1, r1, r0].map(p => [p.x, p.y - 0.01, p.z]).flat();
    g.setAttribute('position', new THREE.Float32BufferAttribute(und, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, wdt, 0, wdt, len, 0, len], 2));
    // 밑널은 아래를 보는 한 면만 만든다(양면이면 위에서 볼 때 기와 바로 밑에 겹쳐 멀리서 깜빡인다)
    const up = new THREE.Vector3().subVectors(e1, e0).cross(new THREE.Vector3().subVectors(r1, e0)).y > 0;
    g.setIndex(up ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    B.geo(wood, g);
    beamBetween(B, wood, e0, e1, 0.07, 0.14);
    if (rafters) {
      const n = Math.max(2, Math.round((a1 - a0) / 0.5));
      for (let i = 0; i <= n; i++) {
        const a = a0 + (a1 - a0) * i / n, wallB = s > 0 ? b1 : b0;
        beamBetween(B, wood, P(a, yEave - 0.07, wallB), P(a, yE - 0.07 + 0.02, eaveB - s * 0.04), 0.07, 0.11);
      }
    }
    // 박공널
    for (const a of [aL, aR]) beamBetween(B, wood, P(a, yE - 0.02, eaveB), P(a, yR - 0.02, bm), 0.05, 0.2);
  }
  ridgeLine(B, m, P(aL - 0.04, yR + 0.02, bm), P(aR + 0.04, yR + 0.02, bm));
  // 밟는 면: 용마루에서 양쪽 처마로 내려가는 두 경사
  if (sw) addRoof(b0 - over, aL, b1 + over, aR, x => yR + TILE_TOP - Math.abs(x - bm) * slope);
  else addRoof(aL, b0 - over, aR, b1 + over, (x, z) => yR + TILE_TOP - Math.abs(z - bm) * slope);
  if (gable) for (const [a, th] of [[a0, 0.2], [a1 - 0.2, 0.2]]) {   // 각기둥은 작은 쪽 → 큰 쪽으로 밀어야 면이 뒤집히지 않는다
    // 박공벽의 빗면은 지붕 밑널보다 확실히 아래에 둔다(밑널과 거의 한 면이면 깜빡인다)
    const poly = [[b0 + 0.12, yEave], [b1 - 0.12, yEave], [bm, yR - 0.03 - 0.12 * slope]];
    B.prism(gable, sw ? 'z' : 'x', sw ? poly : poly.map(p => [p[0], p[1]]), a, a + th);
  }
  return { yRidge: yR };
}

/* ---------- 우진각지붕(네 면이 모두 경사) ---------- */
export function hipRoof(B, m, x0, z0, x1, z1, yEave, rise, opts = {}) {
  const { over = 0.7, wood = M.beam, detail = 4, rafters = true, lip = true } = opts;
  const X0 = x0 - over, X1 = x1 + over, Z0 = z0 - over, Z1 = z1 + over;
  const wx = X1 - X0, wz = Z1 - Z0, short = Math.min(wx, wz) / 2;
  const slope = rise / (Math.min(x1 - x0, z1 - z0) / 2);
  const yE = yEave - over * slope, top = yE + short * slope, len = Math.hypot(short, short * slope), cosT = short / len;
  const sides = [
    { o: V3(X0, yE, Z1), U: V3(1, 0, 0), in: V3(0, 0, -1), w: wx },      // 남
    { o: V3(X1, yE, Z0), U: V3(-1, 0, 0), in: V3(0, 0, 1), w: wx },      // 북
    { o: V3(X1, yE, Z1), U: V3(0, 0, -1), in: V3(-1, 0, 0), w: wz },     // 동
    { o: V3(X0, yE, Z0), U: V3(0, 0, 1), in: V3(1, 0, 0), w: wz },       // 서
  ];
  for (const s of sides) {
    const Vv = V3(s.in.x * short, top - yE, s.in.z * short).normalize();
    tilePanel(B, m, s.o.clone().setY(yE + 0.05), s.U, Vv, s.w, len, v => [v * cosT, s.w - v * cosT], detail, lip);
    beamBetween(B, wood, s.o, s.o.clone().addScaledVector(s.U, s.w), 0.07, 0.14);
  }
  addRoof(X0, Z0, X1, Z1, (x, z) => yE + TILE_TOP + slope * Math.min(x - X0, X1 - x, z - Z0, Z1 - z));   // 밟는 면: 네 처마에서 가운데로 오르는 경사
  // 밑면 널
  const g = new THREE.PlaneGeometry(wx, wz); g.rotateX(Math.PI / 2); B.geo(wood, g, mat4((X0 + X1) / 2, yEave - 0.02, (Z0 + Z1) / 2));
  if (rafters) {
    for (const [ax, lo, hi, e0, e1, w0, w1] of [['x', x0, x1, Z0, Z1, z0, z1], ['z', z0, z1, X0, X1, x0, x1]]) {
      const n = Math.max(2, Math.round((hi - lo) / 0.5));
      for (let i = 0; i <= n; i++) {
        const a = lo + (hi - lo) * i / n;
        for (const [e, wv] of [[e0, w0], [e1, w1]]) {
          const p0 = ax === 'x' ? V3(a, yEave - 0.07, wv) : V3(wv, yEave - 0.07, a), p1 = ax === 'x' ? V3(a, yE - 0.05, e) : V3(e, yE - 0.05, a);
          beamBetween(B, wood, p0, p1, 0.07, 0.11);
        }
      }
    }
  }
  // 마루
  const cx = (X0 + X1) / 2, cz = (Z0 + Z1) / 2;
  const rA = wx >= wz ? V3(X0 + short, top + 0.02, cz) : V3(cx, top + 0.02, Z0 + short), rB = wx >= wz ? V3(X1 - short, top + 0.02, cz) : V3(cx, top + 0.02, Z1 - short);
  if (rA.distanceTo(rB) > 0.3) ridgeLine(B, m, rA, rB);
  for (const [c, r] of [[V3(X0, yE + 0.06, Z0), rA], [V3(X0, yE + 0.06, Z1), wx >= wz ? rA : rB], [V3(X1, yE + 0.06, Z0), wx >= wz ? rB : rA], [V3(X1, yE + 0.06, Z1), rB]]) ridgeLine(B, m, c, r, 0.1);
  return { yRidge: top };
}

/* ---------- 원뿔(둥근) 지붕 ----------
   r: 처마 반지름, rTop: 꼭대기 반지름(0이면 뾰족), yEave에서 rise만큼 오른다. seg: 면 수. cap: 꼭대기 장식(보주) 달기 */
export function coneRoof(B, m, cx, cz, r, yEave, rise, opts = {}) {
  const { rTop = 0, seg = 32, detail = 4, cap = true, wood = M.beam, soffit = true, lip = true } = opts;
  const len = Math.hypot(r - rTop, rise);
  for (let i = 0; i < seg; i++) {
    const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2, am = (a0 + a1) / 2;
    const p0 = V3(cx + Math.cos(a0) * r, yEave, cz + Math.sin(a0) * r), p1 = V3(cx + Math.cos(a1) * r, yEave, cz + Math.sin(a1) * r);
    // 바깥에서 볼 때 U×V가 위·바깥을 보게: 처마를 a1→a0 방향으로 따라간다
    const U = new THREE.Vector3().subVectors(p0, p1), w = U.length(); U.normalize();
    const hw = w / 2, ch = Math.cos(Math.PI / seg), inR = r * ch, inTop = rTop * ch, plen = Math.hypot(inR - inTop, rise);
    const Vv = V3(-Math.cos(am) * (inR - inTop), rise, -Math.sin(am) * (inR - inTop)).normalize();
    const wTop = rTop * Math.sin(Math.PI / seg);
    tilePanel(B, m, p1, U, Vv, w, plen, v => { const t = v / plen, h = hw + (wTop - hw) * t; return [hw - h, hw + h]; }, detail, lip);
  }
  // 밟는 면: 처마에서 꼭대기로 오르는 원뿔(가운데가 뚫린 고리 지붕은 고리 부분만)
  addRoof(cx - r, cz - r, cx + r, cz + r, (x, z) => {
    const d = Math.hypot(x - cx, z - cz);
    if (d > r) return -Infinity;
    if (d < rTop) return cap && rTop > 0.05 ? yEave + rise + 0.1 : -Infinity;
    return yEave + TILE_TOP + rise * (r - d) / (r - rTop);
  }, true);
  if (soffit) { const g = new THREE.RingGeometry(Math.max(0.01, r * 0.5), r, seg); g.rotateX(Math.PI / 2); B.geo(wood, g, mat4(cx, yEave - 0.02, cz)); }
  // 처마 끝 테
  const rim = []; for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2; rim.push(V3(cx + Math.cos(a) * r, yEave - 0.03, cz + Math.sin(a) * r)); }
  B.geo(wood, tube(rim, 0.07, 6, false));
  if (cap) {
    const y = yEave + rise;
    if (rTop > 0.05) { const g = new THREE.CylinderGeometry(rTop * 1.02, rTop * 1.06, 0.14, seg); B.geo(m, g, mat4(cx, y + 0.02, cz)); const d = new THREE.CircleGeometry(rTop, seg); d.rotateX(-Math.PI / 2); B.geo(m, d, mat4(cx, y + 0.09, cz)); }
    else {   // 보주: 받침 위에 연꽃 봉오리 모양
      const prof = [[0.34, 0], [0.36, 0.1], [0.2, 0.18], [0.16, 0.3], [0.26, 0.42], [0.3, 0.56], [0.22, 0.72], [0.08, 0.86], [0.0, 0.95]].map(p => new THREE.Vector2(p[0], p[1]));
      B.geo(m, new THREE.LatheGeometry(prof, 16), mat4(cx, y - 0.08, cz));
    }
  }
  return { yTop: yEave + rise };
}

/* ---------- 둥근 벽 ----------
   openings: [{ a0, a1, ys: [[y0, y1], ...] }] — 그 각도 범위에서 ys 높이 구간이 뚫린다(a0 < a1, 라디안).
   opts: matIn(안쪽 면 재질), seg(한 바퀴 조각 수), collide, a0·a1(벽이 도는 범위 — 기본은 한 바퀴) */
export function roundWall(B, m, cx, cz, rIn, rOut, y0, y1, openings = [], opts = {}) {
  const { matIn = m, seg = 72, collide = true } = opts;
  const A0 = opts.a0 ?? 0, A1 = opts.a1 ?? Math.PI * 2, full = Math.abs(A1 - A0 - Math.PI * 2) < 1e-6;
  // 구멍을 벽 범위 안으로 옮기고(한 바퀴 넘는 각도 정리) 자른다
  const ops = [];
  for (const o of openings) {
    let a = o.a0, b = o.a1;
    while (a < A0 - 1e-9) { a += Math.PI * 2; b += Math.PI * 2; }
    while (a >= A0 + Math.PI * 2) { a -= Math.PI * 2; b -= Math.PI * 2; }
    if (b > A1 + 1e-9 && full) { ops.push({ a0: a, a1: A1, ys: o.ys }, { a0: A0, a1: b - Math.PI * 2, ys: o.ys }); }
    else ops.push({ a0: a, a1: Math.min(b, A1), ys: o.ys });
  }
  ops.sort((p, q) => p.a0 - q.a0);
  const spans = []; let a = A0;
  for (const o of ops) { if (o.a0 > a + 1e-6) spans.push({ a0: a, a1: o.a0, ys: null }); spans.push(o); a = Math.max(a, o.a1); }
  if (A1 > a + 1e-6) spans.push({ a0: a, a1: A1, ys: null });
  const bo = B.buf(m), bi = B.buf(matIn);
  const pt = (r, ang, y) => [cx + Math.cos(ang) * r, y, cz + Math.sin(ang) * r];
  const patch = (s0, s1, ya, yb, jamb0, jamb1) => {
    const n = Math.max(1, Math.ceil((s1 - s0) / (Math.PI * 2 / seg) - 1e-6));
    for (let i = 0; i < n; i++) {
      const p = s0 + (s1 - s0) * i / n, q = s0 + (s1 - s0) * (i + 1) / n, pm = (p + q) / 2, c = Math.cos(pm), s = Math.sin(pm);
      B.quad(bo, pt(rOut, q, ya), pt(rOut, p, ya), pt(rOut, p, yb), pt(rOut, q, yb), [c, 0, s], [q * rOut, ya, p * rOut, ya, p * rOut, yb, q * rOut, yb]);
      B.quad(bi, pt(rIn, p, ya), pt(rIn, q, ya), pt(rIn, q, yb), pt(rIn, p, yb), [-c, 0, -s], [p * rIn, ya, q * rIn, ya, q * rIn, yb, p * rIn, yb]);
      B.quad(bo, pt(rIn, p, yb), pt(rIn, q, yb), pt(rOut, q, yb), pt(rOut, p, yb), [0, 1, 0], [p * rIn, 0, q * rIn, 0, q * rIn, rOut - rIn, p * rIn, rOut - rIn]);
      B.quad(bo, pt(rIn, q, ya), pt(rIn, p, ya), pt(rOut, p, ya), pt(rOut, q, ya), [0, -1, 0], [q * rIn, 0, p * rIn, 0, p * rIn, rOut - rIn, q * rIn, rOut - rIn]);
      if (collide) {
        const m2 = Math.max(1, Math.ceil((q - p) * rOut / 0.7));
        for (let k = 0; k < m2; k++) {
          const u = p + (q - p) * k / m2, v = p + (q - p) * (k + 1) / m2;
          const xs = [Math.cos(u) * rIn, Math.cos(u) * rOut, Math.cos(v) * rIn, Math.cos(v) * rOut], zs = [Math.sin(u) * rIn, Math.sin(u) * rOut, Math.sin(v) * rIn, Math.sin(v) * rOut];
          addCollider(cx + Math.min(...xs), ya, cz + Math.min(...zs), cx + Math.max(...xs), yb, cz + Math.max(...zs));
        }
      }
    }
    for (const [on, ang, sgn] of [[jamb0, s0, -1], [jamb1, s1, 1]]) {
      if (!on) continue;
      const nx = -Math.sin(ang) * sgn, nz = Math.cos(ang) * sgn;
      const A = pt(rIn, ang, ya), Bq = pt(rOut, ang, ya), C = pt(rOut, ang, yb), D = pt(rIn, ang, yb);
      if (sgn > 0) B.quad(bo, A, Bq, C, D, [nx, 0, nz], [0, ya, rOut - rIn, ya, rOut - rIn, yb, 0, yb]);
      else B.quad(bo, Bq, A, D, C, [nx, 0, nz], [0, ya, rOut - rIn, ya, rOut - rIn, yb, 0, yb]);
    }
  };
  for (const s of spans) {
    if (!s.ys) { patch(s.a0, s.a1, y0, y1, !full && Math.abs(s.a0 - A0) < 1e-6, !full && Math.abs(s.a1 - A1) < 1e-6); continue; }
    let y = y0;
    for (const [ya, yb] of s.ys.slice().sort((p, q) => p[0] - q[0])) { if (ya - y > 1e-4) patch(s.a0, s.a1, y, ya, false, false); y = yb; }
    if (y1 - y > 1e-4) patch(s.a0, s.a1, y, y1, false, false);
  }
  // 구멍 옆면(문설주 자리)
  for (const o of ops) for (const [ya, yb] of o.ys) for (const [ang, sgn] of [[o.a0, 1], [o.a1, -1]]) {
    const nx = -Math.sin(ang) * sgn, nz = Math.cos(ang) * sgn;
    const A = pt(rIn, ang, ya), Bq = pt(rOut, ang, ya), C = pt(rOut, ang, yb), D = pt(rIn, ang, yb);
    if (sgn > 0) B.quad(bo, A, Bq, C, D, [nx, 0, nz], [0, ya, rOut - rIn, ya, rOut - rIn, yb, 0, yb]);
    else B.quad(bo, Bq, A, D, C, [nx, 0, nz], [0, ya, rOut - rIn, ya, rOut - rIn, yb, 0, yb]);
  }
}

// 둥근 벽의 창: 구멍(a0..a1, y0..y1)에 창틀·살·유리를 끼운다. nx·ny: 유리 칸 수.
export function roundWindow(B, cx, cz, rIn, rOut, a0, a1, y0, y1, opts = {}) {
  const { frame = M.beam, nx = 2, ny = 2, glass = true, t = 0.07 } = opts;
  const rm = (rIn + rOut) / 2, f0 = rIn - 0.03, f1 = rOut + 0.04, da = t / rm;
  roundWall(B, frame, cx, cz, f0, f1, y0, y0 + t, [], { a0, a1, collide: false });
  roundWall(B, frame, cx, cz, f0, f1, y1 - t, y1, [], { a0, a1, collide: false });
  roundWall(B, frame, cx, cz, f0, f1, y0, y1, [], { a0, a1: a0 + da, collide: false });
  roundWall(B, frame, cx, cz, f0, f1, y0, y1, [], { a0: a1 - da, a1, collide: false });
  for (let i = 1; i < nx; i++) { const am = a0 + (a1 - a0) * i / nx; roundWall(B, frame, cx, cz, rm - 0.03, rm + 0.03, y0, y1, [], { a0: am - da * 0.35, a1: am + da * 0.35, collide: false }); }
  for (let j = 1; j < ny; j++) { const ym = y0 + (y1 - y0) * j / ny; roundWall(B, frame, cx, cz, rm - 0.03, rm + 0.03, ym - t * 0.35, ym + t * 0.35, [], { a0, a1, collide: false }); }
  // 창턱
  roundWall(B, frame, cx, cz, rOut, rOut + 0.14, y0 - 0.06, y0, [], { a0: a0 - da, a1: a1 + da, collide: false });
  if (glass) roundWall(B, M.glass, cx, cz, rm - 0.01, rm + 0.01, y0, y1, [], { a0, a1, collide: true });
}

/* ---------- 둥근 바닥(원판·고리) ----------
   holes: [[x0, z0, x1, z1], ...] — 계단이 올라오는 구멍. rIn을 주면 가운데가 빈 고리(발코니). */
export function roundFloor(B, m, cx, cz, r, y0, y1, holes = [], rIn = 0, collide = true) {
  const step = 0.5, n = Math.ceil(r / step);
  for (let i = -n; i < n; i++) {
    const xa = cx + i * step, xb = xa + step, xm = Math.min(Math.abs(xa - cx), Math.abs(xb - cx)), xM = Math.max(Math.abs(xa - cx), Math.abs(xb - cx));
    if (xm >= r) continue;
    const half = Math.sqrt(r * r - xm * xm);
    let segs = [[cz - half, cz + half]];
    if (rIn > 0 && xM < rIn) { const hi = Math.sqrt(rIn * rIn - xM * xM); segs = [[cz - half, cz - hi], [cz + hi, cz + half]]; }
    for (const h of holes) {
      if (h[2] <= xa + 1e-6 || h[0] >= xb - 1e-6) continue;
      const next = [];
      for (const [a, b] of segs) {
        if (h[3] <= a || h[1] >= b) { next.push([a, b]); continue; }
        if (h[1] > a) next.push([a, h[1]]);
        if (h[3] < b) next.push([h[3], b]);
      }
      segs = next;
    }
    for (const [a, b] of segs) if (b - a > 0.02) B.box(m, xa, y0, a, xb, y1, b, collide);
  }
}

/* ---------- 곧은 벽의 창과 문 ----------
   wall()로 뚫어 둔 구멍에 끼운다. axis 'x' = x 방향으로 뻗은 벽(두께 z: f0~f1), 'z' = z 방향 벽(두께 x: f0~f1).
   out: 바깥이 +쪽이면 1, -쪽이면 -1(창턱·차양이 그쪽으로 나온다). */
export function windowUnit(B, axis, f0, f1, u0, u1, y0, y1, opts = {}) {
  const { frame = M.beam, nx = 2, ny = 2, glass = true, out = 1, sill = true, t = 0.07, paper = false, hood = null } = opts;
  const g0 = Math.min(f0, f1) - 0.03, g1 = Math.max(f0, f1) + 0.03, fm = (f0 + f1) / 2;
  const bx = (m, a, b, ya, yb, p0, p1, col = false) => (axis === 'x' ? B.box(m, a, ya, p0, b, yb, p1, col) : B.box(m, p0, ya, a, p1, yb, b, col));
  bx(frame, u0, u1, y0, y0 + t, g0, g1); bx(frame, u0, u1, y1 - t, y1, g0, g1);
  bx(frame, u0, u0 + t, y0, y1, g0, g1); bx(frame, u1 - t, u1, y0, y1, g0, g1);
  for (let i = 1; i < nx; i++) { const um = u0 + (u1 - u0) * i / nx; bx(frame, um - 0.02, um + 0.02, y0, y1, fm - 0.03, fm + 0.03); }
  for (let j = 1; j < ny; j++) { const ym = y0 + (y1 - y0) * j / ny; bx(frame, u0, u1, ym - 0.02, ym + 0.02, fm - 0.03, fm + 0.03); }
  if (glass || paper) bx(paper ? M.shoji : M.glass, u0, u1, y0, y1, fm - 0.008, fm + 0.008, true);
  const edge = out > 0 ? Math.max(f0, f1) : Math.min(f0, f1);
  if (sill) bx(frame, u0 - 0.08, u1 + 0.08, y0 - 0.06, y0, Math.min(edge, edge + out * 0.16), Math.max(edge, edge + out * 0.16));
  if (hood) {   // 창 위 작은 차양(기울어진 널)
    const d = 0.5, ya = y1 + 0.28, yb = y1 + 0.1;
    const pA = axis === 'x' ? [V3(u0 - 0.15, ya, edge), V3(u1 + 0.15, ya, edge), V3(u1 + 0.15, yb, edge + out * d), V3(u0 - 0.15, yb, edge + out * d)]
      : [V3(edge, ya, u0 - 0.15), V3(edge, ya, u1 + 0.15), V3(edge + out * d, yb, u1 + 0.15), V3(edge + out * d, yb, u0 - 0.15)];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pA.map(p => [p.x, p.y, p.z]).flat(), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3, 0, 2, 1, 0, 3, 2]); g.computeVertexNormals();
    B.geo(hood, g);
  }
}

// 문틀. leaf: 'swing'(안으로 활짝 열린 여닫이) | 'slide'(옆으로 밀어 둔 미닫이) | null. inward: 문짝이 열리는 쪽(+1/-1).
export function doorUnit(B, axis, f0, f1, u0, u1, y0, y1, opts = {}) {
  const { frame = M.beam, leaf = 'swing', leafMat = M.beamLight, inward = 1, t = 0.09, paper = false } = opts;
  const g0 = Math.min(f0, f1) - 0.03, g1 = Math.max(f0, f1) + 0.03;
  const bx = (m, a, b, ya, yb, p0, p1, col = false) => (axis === 'x' ? B.box(m, a, ya, p0, b, yb, p1, col) : B.box(m, p0, ya, a, p1, yb, b, col));
  // 틀은 구멍 안쪽으로 조금 들어온다(벽 구멍의 옆면·윗면과 한 평면에 겹치면 깜빡인다)
  const lap = 0.02;
  bx(frame, u0 - t, u0 + lap, y0, y1 + t, g0, g1); bx(frame, u1 - lap, u1 + t, y0, y1 + t, g0, g1); bx(frame, u0 - t, u1 + t, y1 - lap, y1 + t, g0, g1);
  const w = u1 - u0, edge = inward > 0 ? Math.max(f0, f1) : Math.min(f0, f1);
  if (leaf === 'swing') {         // 문설주(u0)에 달려 벽과 직각으로 열려 있다
    const p0 = Math.min(edge, edge + inward * w), p1 = Math.max(edge, edge + inward * w);
    bx(leafMat, u0 - 0.05, u0, y0 + 0.02, y1 - 0.02, p0, p1, true);
    // 손잡이
    const hx = u0 - 0.1, hp = edge + inward * (w - 0.12);
    if (axis === 'x') B.put(M.iron, new THREE.SphereGeometry(0.035, 10, 8), hx + 0.12, y0 + 1.0, hp); else B.put(M.iron, new THREE.SphereGeometry(0.035, 10, 8), hp, y0 + 1.0, hx + 0.12);
  } else if (leaf === 'slide') {  // 벽 안쪽 면에 붙어 옆으로 밀려 있다
    const p0 = edge + inward * 0.02, p1 = edge + inward * 0.06, a = u1 + 0.04, b = u1 + 0.04 + w;
    bx(leafMat, a, b, y0 + 0.02, y0 + 0.1, Math.min(p0, p1), Math.max(p0, p1)); bx(leafMat, a, b, y1 - 0.1, y1 - 0.02, Math.min(p0, p1), Math.max(p0, p1));
    bx(leafMat, a, a + 0.06, y0, y1, Math.min(p0, p1), Math.max(p0, p1)); bx(leafMat, b - 0.06, b, y0, y1, Math.min(p0, p1), Math.max(p0, p1));
    const pm = (p0 + p1) / 2;
    for (let i = 1; i < 4; i++) { const um = a + w * i / 4; bx(leafMat, um - 0.012, um + 0.012, y0, y1, pm - 0.012, pm + 0.012); }
    for (let j = 1; j < 6; j++) { const ym = y0 + (y1 - y0) * j / 6; bx(leafMat, a, b, ym - 0.012, ym + 0.012, pm - 0.012, pm + 0.012); }
    bx(paper ? M.shoji : M.glass, a, b, y0, y1, pm - 0.006, pm + 0.006, true);
  }
}

/* ---------- 난간 ----------
   pts: [[x, z], ...] 꺾은선(바닥 높이 y). 기둥·윗대·살을 세우고 충돌도 넣는다. */
export function railing(B, m, pts, y, h = 1.0, opts = {}) {
  const { gap = 0.16, post = 0.09, collide = true, mid = true } = opts;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az);
    if (L < 1e-4) continue;
    beamBetween(B, m, V3(ax, y + h - 0.035, az), V3(bx, y + h - 0.035, bz), 0.08, 0.07);
    beamBetween(B, m, V3(ax, y + 0.09, az), V3(bx, y + 0.09, bz), 0.05, 0.05);
    if (mid) beamBetween(B, m, V3(ax, y + h * 0.55, az), V3(bx, y + h * 0.55, bz), 0.04, 0.04);
    const n = Math.max(1, Math.round(L / gap));
    for (let k = 0; k <= n; k++) {
      const t = k / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t, big = k === 0 || k === n || k % 8 === 0;
      const s = big ? post : 0.028;
      B.box(m, x - s / 2, y, z - s / 2, x + s / 2, y + (big ? h + 0.05 : h - 0.05), z + s / 2, false);
    }
    if (collide) {
      const m2 = Math.max(1, Math.ceil(L / 0.6));
      for (let k = 0; k < m2; k++) {
        const x0 = ax + (bx - ax) * k / m2, x1 = ax + (bx - ax) * (k + 1) / m2, z0 = az + (bz - az) * k / m2, z1 = az + (bz - az) * (k + 1) / m2;
        addCollider(Math.min(x0, x1) - 0.05, y, Math.min(z0, z1) - 0.05, Math.max(x0, x1) + 0.05, y + h, Math.max(z0, z1) + 0.05);
      }
    }
  }
}

// 둥근 난간(발코니 가장자리). a0..a1 범위.
export function roundRailing(B, m, cx, cz, r, y, h = 1.0, a0 = 0, a1 = Math.PI * 2, opts = {}) {
  const n = Math.max(3, Math.ceil((a1 - a0) * r / 0.8)), pts = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
  railing(B, m, pts, y, h, opts);
}

/* ---------- 포렴(가게 입구에 드리우는 갈래진 천) ----------
   axis 'x': x 방향으로 걸린다(면이 z를 본다). text: 갈래마다 한 글자씩 적는다(없으면 민무늬). 사람이 그냥 지나다닐 수 있다. */
export function noren(B, axis, f, u0, u1, yTop, drop, text = '', opts = {}) {
  const { color = '#1f3a6e', ink = '#f4efe2', pole = M.beam, flip = false } = opts;
  const chars = [...text], n = Math.max(chars.length, opts.n || 3), w = (u1 - u0) / n;
  const p0 = axis === 'x' ? V3(u0 - 0.15, yTop + 0.03, f) : V3(f, yTop + 0.03, u0 - 0.15), p1 = axis === 'x' ? V3(u1 + 0.15, yTop + 0.03, f) : V3(f, yTop + 0.03, u1 + 0.15);
  B.geo(pole, tube([p0, p1], 0.025, 8, true));
  for (let i = 0; i < n; i++) {
    const ch = chars[(axis === 'z') !== flip ? n - 1 - i : i] || '';   // 보는 쪽에서 왼→오로 읽히게
    const m = textMat(ch || ' ', { w: 128, h: Math.round(128 * drop / w), color: ink, bg: color, pad: 0.16 }, 'cloth');
    const g = new THREE.PlaneGeometry(w - 0.025, drop, 3, 8);
    const um = u0 + w * (i + 0.5);
    if (axis === 'x') B.geo(m, g, mat4(um, yTop - drop / 2, f, 0, flip ? Math.PI : 0, 0));
    else B.geo(m, g, mat4(f, yTop - drop / 2, um, 0, flip ? -Math.PI / 2 : Math.PI / 2, 0));
  }
}

/* ---------- 간판 ----------
   나무틀을 두른 널에 글씨. (x,y,z)는 판의 중심, ry는 판이 보는 방향(0이면 +z를 본다). 양면에 적는다.
   opts: color 글씨색, bg 바탕색, vertical 세로쓰기, frame 틀 재질, round 둥근 판, both 뒷면에도 */
export function signBoard(B, text, x, y, z, ry, w, h, opts = {}) {
  const { color = '#1a1410', bg = '#e9dcc0', vertical = false, frame = M.beam, round = false, both = true, font = 'mincho', depth = 0.06 } = opts;
  const px = Math.round(256 * Math.max(1, w / h)), py = Math.round(256 * Math.max(1, h / w));
  const m = textMat(text, { w: Math.min(1024, px), h: Math.min(1024, py), color, bg, vertical, font, pad: opts.pad ?? 0.12 });
  if (round) {
    const r = w / 2;
    const rim = new THREE.CylinderGeometry(r + 0.05, r + 0.05, depth, 40); rim.rotateX(Math.PI / 2);
    B.geo(frame, rim, mat4(x, y, z, 0, ry, 0));
    const face = new THREE.CircleGeometry(r, 40);
    B.geo(m, face, mat4(x + Math.sin(ry) * (depth / 2 + 0.02), y, z + Math.cos(ry) * (depth / 2 + 0.02), 0, ry, 0));
    if (both) B.geo(m, face, mat4(x - Math.sin(ry) * (depth / 2 + 0.02), y, z - Math.cos(ry) * (depth / 2 + 0.02), 0, ry + Math.PI, 0));
    return;
  }
  B.geo(frame, new THREE.BoxGeometry(w + 0.1, h + 0.1, depth), mat4(x, y, z, 0, ry, 0));
  const face = new THREE.PlaneGeometry(w, h);
  B.geo(m, face, mat4(x + Math.sin(ry) * (depth / 2 + 0.02), y, z + Math.cos(ry) * (depth / 2 + 0.02), 0, ry, 0));
  if (both) B.geo(m, face, mat4(x - Math.sin(ry) * (depth / 2 + 0.02), y, z - Math.cos(ry) * (depth / 2 + 0.02), 0, ry + Math.PI, 0));
}

/* ---------- 등롱(종이 초롱) ----------
   대나무 살이 층층이 도드라진 둥근 종이 등. text를 주면 세로로 적는다. 빛무리 자리를 돌려준다. */
export function lantern(B, x, y, z, opts = {}) {
  const { r = 0.2, h = 0.5, color = 0xd8452e, text = '', ink = '#1a1410' } = opts;
  const prof = [], ribs = 9;
  for (let i = 0; i <= ribs * 4; i++) {
    const t = i / (ribs * 4), bulge = Math.pow(Math.sin(Math.PI * (0.08 + 0.84 * t)), 0.6);
    prof.push(new THREE.Vector2(r * (0.45 + 0.55 * bulge) * (1 + 0.035 * Math.cos(t * ribs * Math.PI * 2)), -h / 2 + h * t));
  }
  const body = new THREE.LatheGeometry(prof, 20);
  const m = text ? glowText(text, color, ink) : mat('glow', color, { power: 0.9 });
  B.geo(m, body, mat4(x, y, z));
  const capG = new THREE.CylinderGeometry(r * 0.5, r * 0.5, 0.05, 14);
  B.geo(M.iron, capG, mat4(x, y + h / 2 + 0.02, z)); B.geo(M.iron, capG, mat4(x, y - h / 2 - 0.02, z));
  B.geo(M.iron, tube([V3(x, y + h / 2, z), V3(x, y + h / 2 + 0.22, z)], 0.008, 5, false));
  return [x, y, z];
}
const GLOW = new Map();
function glowText(text, color, ink) {
  const key = text + color + ink;
  let m = GLOW.get(key);
  if (m) return m;
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d'), col = '#' + new THREE.Color(color).getHexString();
  g.fillStyle = col; g.fillRect(0, 0, 256, 128);
  g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
  const chars = [...text], cell = Math.min(34, 100 / chars.length);
  g.font = `900 ${cell}px "Yu Mincho", "MS Mincho", serif`;
  for (const cxp of [64, 192]) chars.forEach((ch, i) => g.fillText(ch, cxp, 64 - (chars.length - 1) * cell / 2 + i * cell));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  m = toonize(new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.7 }));
  m.userData.noShadow = true;
  GLOW.set(key, m);
  return m;
}

/* ---------- 곧은 건물의 한 층 ----------
   네 벽을 한 번에 쌓는다. ops: { n: [...], s: [...], e: [...], w: [...] } 각 벽의 구멍(wall()과 같은 꼴 — u는 그 벽이 뻗은 축의 세계 좌표).
   n = z0 쪽(북), s = z1 쪽(남), w = x0 쪽(서), e = x1 쪽(동). t: 벽 두께. matIn을 주면 안쪽에 얇은 마감 벽을 덧댄다. */
export function boxWalls(B, m, x0, z0, x1, z1, y0, y1, ops = {}, t = 0.2) {
  wall(B, m, 'x', z0, z0 + t, x0, x1, y0, y1, ops.n || []);
  wall(B, m, 'x', z1 - t, z1, x0, x1, y0, y1, ops.s || []);
  wall(B, m, 'z', x0, x0 + t, z0 + t, z1 - t, y0, y1, ops.w || []);
  wall(B, m, 'z', x1 - t, x1, z0 + t, z1 - t, y0, y1, ops.e || []);
}
