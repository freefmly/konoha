// 닌견 — 이누즈카 일족이 기르는 개. 사슴(deer.js)과 같은 짜임으로 몸통·목·머리·다리·꼬리 마디를 따로 움직여 걷고 뛰고 냄새를 맡게 한다.
// 개 한 마리의 좌표: 머리가 +x, 발이 y=0. 털빛(coat)마다 도형을 따로 빚는다.
import * as THREE from '../vendor/three.module.js';
import { tube, mergeGeos, mat4 } from './build.js';
import { mat } from './materials.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const DARK = 0x1c1816;
// 털빛: 몸, 배·주둥이, 귀·꼬리 끝 — 흰 개(귀가 밤빛), 검은 개, 잿빛 개, 누런 개
const COATS = [[0xf1ece2, 0xffffff, 0x8a5a36], [0x2c2a2c, 0x6a6660, 0x1c1a1c], [0x8e8f92, 0xe6e4de, 0x6a6b6e], [0xb98a52, 0xead9b8, 0x7a5430]];

function painted(groups) {
  const p = [], n = [], c = [];
  for (const [hex, list] of groups) {
    if (!list.length) continue;
    const g = mergeGeos(list), col = new THREE.Color(hex), P = g.attributes.position.array, N = g.attributes.normal.array;
    for (let i = 0; i < P.length; i++) { p.push(P[i]); n.push(N[i]); }
    for (let i = 0; i < P.length / 3; i++) c.push(col.r, col.g, col.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  return g;
}

const GEOS = [];
let BLOB = null;
// 부위별 도형(마디가 도는 자리를 원점으로 빚는다)
function geos(ci) {
  if (GEOS[ci]) return GEOS[ci];
  const [FUR, PALE, EAR] = COATS[ci], G = { raw: {} };
  const part = (name, groups) => { G.raw[name] = groups; return painted(groups); };
  // 몸통: 엉덩이 → 허리 → 가슴(가슴이 깊고 허리가 잘록하다). 배는 엷은 빛
  G.body = part('body', [
    [FUR, [tube([V(-0.4, 0.5, 0), V(-0.28, 0.52, 0), V(-0.05, 0.51, 0), V(0.18, 0.5, 0), V(0.36, 0.53, 0)], t => 0.085 + 0.075 * Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.12)) + (t > 0.6 ? 0.025 : 0), 12, true)]],
    [PALE, [tube([V(-0.2, 0.43, 0), V(0.05, 0.4, 0), V(0.3, 0.42, 0)], t => 0.07 + 0.03 * t, 8, true)]],
  ]);
  // 꼬리(엉덩이 마디가 원점): 위로 말려 올라간다
  G.tail = part('tail', [[FUR, [tube([V(0, 0, 0), V(-0.12, 0.08, 0), V(-0.2, 0.22, 0)], t => 0.04 - 0.012 * t, 7, false)]], [EAR, [tube([V(-0.2, 0.22, 0), V(-0.19, 0.32, 0)], t => 0.03 - 0.02 * t, 6, true)]]]);
  // 목(어깨 마디가 원점)과 머리(목 끝 마디가 원점)
  G.neck = part('neck', [[FUR, [tube([V(-0.03, -0.03, 0), V(0.08, 0.1, 0), V(0.15, 0.2, 0)], t => 0.115 - 0.03 * t, 10, false)]]]);
  {
    const fur = [tube([V(-0.08, 0.02, 0), V(0.03, 0.03, 0), V(0.12, 0.0, 0)], t => 0.1 - 0.02 * t, 10, true)], pale = [tube([V(0.08, -0.01, 0), V(0.2, -0.03, 0), V(0.27, -0.04, 0)], t => 0.06 - 0.018 * t, 8, true)], dark = [], ear = [];
    for (const s of [-1, 1]) {
      const e = new THREE.ConeGeometry(0.05, 0.14, 5); e.scale(1, 1, 0.5); ear.push([e, mat4(-0.04, 0.13, s * 0.07, s * 0.35, 0, -0.15)]);        // 선 귀
      dark.push([new THREE.SphereGeometry(0.016, 8, 6), mat4(0.09, 0.05, s * 0.062)]);                                                            // 눈
    }
    dark.push([new THREE.SphereGeometry(0.026, 8, 6), mat4(0.275, -0.03, 0)]);                                                                      // 코
    G.head = part('head', [[FUR, fur], [PALE, pale], [EAR, ear], [DARK, dark]]);
  }
  // 다리: 윗마디(엉덩이·어깨 마디가 원점)와 아랫마디(무릎 마디가 원점, 발까지)
  G.foreUp = part('foreUp', [[FUR, [tube([V(0, 0.02, 0), V(0.01, -0.25, 0)], t => 0.055 - 0.018 * t, 7, false)]]]);
  G.foreLo = part('foreLo', [[FUR, [tube([V(0, 0.01, 0), V(-0.01, -0.21, 0)], t => 0.036 - 0.008 * t, 7, false)]], [PALE, [[new THREE.SphereGeometry(0.042, 8, 6).scale(1.3, 0.7, 1), mat4(0.015, -0.225, 0)]]]]);
  G.hindUp = part('hindUp', [[FUR, [tube([V(0.02, 0.03, 0), V(-0.07, -0.26, 0)], t => 0.075 - 0.035 * t, 7, false)]]]);
  G.hindLo = part('hindLo', [[FUR, [tube([V(0, 0.01, 0), V(0.05, -0.22, 0)], t => 0.038 - 0.01 * t, 7, false)]], [PALE, [[new THREE.SphereGeometry(0.042, 8, 6).scale(1.3, 0.7, 1), mat4(0.065, -0.235, 0)]]]]);
  if (!BLOB) { BLOB = new THREE.CircleGeometry(1, 20); BLOB.rotateX(-Math.PI / 2); }
  return (GEOS[ci] = G);
}

// 마디로 엮은 개 한 마리
function rig(ci, fur, blobMat) {
  const G = geos(ci), root = new THREE.Group();
  const mesh = (g, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(g, fur); m.position.set(x, y, z); m.receiveShadow = true; parent.add(m); return m; };
  mesh(G.body, root);
  const tail = mesh(G.tail, root, -0.42, 0.56, 0), neck = mesh(G.neck, root, 0.34, 0.6, 0), head = mesh(G.head, neck, 0.15, 0.2, 0);
  const legs = [];
  for (const [front, s] of [[false, -1], [true, -1], [false, 1], [true, 1]]) {   // 왼뒤, 왼앞, 오른뒤, 오른앞
    const up = mesh(front ? G.foreUp : G.hindUp, root, front ? 0.29 : -0.3, front ? 0.47 : 0.5, s * 0.1);
    const lo = mesh(front ? G.foreLo : G.hindLo, up, front ? 0.01 : -0.07, front ? -0.25 : -0.26, 0);
    legs.push({ up, lo, front });
  }
  const blob = new THREE.Mesh(BLOB, blobMat); blob.position.y = 0.025; blob.scale.set(0.55, 1, 0.26); blob.renderOrder = 1; root.add(blob);
  return { root, neck, head, tail, legs };
}

const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const inPoly = (x, z, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };

// 울타리 안(poly)에서 노는 개 떼. tick(t, dt, 보는 눈의 자리)을 매 장면 불러 준다.
export class Pack {
  constructor(scene, poly, count, R) {
    this.poly = poly; this.R = R; this.dogs = [];
    const fur = mat('plain', 0xffffff, { vc: true, rough: 0.95 }), blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.26, depthWrite: false });
    const xs = poly.map(p => p[0]), zs = poly.map(p => p[1]);
    this.box = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    this.cx = (this.box[0] + this.box[1]) / 2; this.cz = (this.box[2] + this.box[3]) / 2;
    for (let i = 0; i < count; i++) {
      const d = rig(i % COATS.length, fur, blobMat), p = this.spot(2.2);
      Object.assign(d, { x: p[0], z: p[1], th: R() * Math.PI * 2, state: 'idle', timer: R() * 5, phase: R() * 6.283, w: 0, g: 0, run: 0, seed: R() * 100, tx: 0, tz: 0, wag: R() });
      d.root.scale.setScalar(i % 5 === 1 ? 1.5 + R() * 0.15 : 0.85 + R() * 0.45);                    // 덩치 큰 닌견이 섞여 있다
      scene.add(d.root); this.dogs.push(d); this.pose(d, 0);
    }
  }
  spot(gap) {
    for (let t = 0; t < 60; t++) {
      const x = this.box[0] + this.R() * (this.box[1] - this.box[0]), z = this.box[2] + this.R() * (this.box[3] - this.box[2]);
      if (inPoly(x, z, this.poly) && !this.dogs.some(o => Math.hypot(o.x - x, o.z - z) < gap)) return [x, z];
    }
    return [this.cx, this.cz];
  }
  pose(d, t) {
    const w = d.w, g = d.g, r = d.run;
    d.root.position.set(d.x, w * (0.012 + 0.03 * r) * Math.abs(Math.sin(d.phase)), d.z); d.root.rotation.y = -d.th;
    // 냄새를 맡을 때는 목을 내려 코가 땅에 닿는다. 서 있을 때는 둘레를 살핀다
    d.neck.rotation.z = -1.25 * g + w * 0.05 * Math.sin(d.phase * 2);
    d.head.rotation.z = 0.35 * g;
    d.neck.rotation.y = (1 - g) * (1 - w) * 0.6 * Math.sin(t * 0.7 + d.seed) + g * 0.25 * Math.sin(t * 3.1 + d.seed);
    d.tail.rotation.y = (0.35 + 0.35 * d.wag) * Math.sin(t * (6 + 5 * d.wag) + d.seed) * (1 - 0.5 * g);   // 꼬리 흔들기
    d.tail.rotation.z = -0.5 * r;
    d.legs.forEach((L, i) => {
      // 걸을 때는 네 다리가 차례로, 뛸 때는 앞다리끼리·뒷다리끼리 모아서 뻗는다
      const ph = d.phase + (r > 0.5 ? (L.front ? 0 : Math.PI * 0.8) + (i > 1 ? 0.35 : 0) : i * Math.PI / 2), lift = Math.max(0, Math.cos(ph));
      L.up.rotation.z = w * (0.42 + 0.35 * r) * Math.sin(ph);
      L.lo.rotation.z = w * (L.front ? -0.9 : 0.7) * lift * (1 + 0.3 * r);
    });
  }
  tick(t, dt, eye) {
    if (eye && Math.hypot(eye.x - this.cx, eye.z - this.cz, eye.y) > 220) return;       // 멀리서는 멈춰 둔다
    dt = Math.min(dt, 0.05);
    for (const d of this.dogs) {
      if (d.state === 'walk' || d.state === 'run') {
        const fast = d.state === 'run', dx = d.tx - d.x, dz = d.tz - d.z, dist = Math.hypot(dx, dz), turn = wrap(Math.atan2(dz, dx) - d.th), rate = fast ? 3.2 : 2.0;
        d.th += Math.max(-rate * dt, Math.min(rate * dt, turn));
        d.run += Math.max(-dt * 3, Math.min(dt * 3, (fast ? 1 : 0) - d.run));
        const v = (1.1 + 3.4 * d.run) * (Math.abs(turn) < 1.0 ? 1 : 0.35) * d.w;
        d.x += Math.cos(d.th) * v * dt; d.z += Math.sin(d.th) * v * dt; d.phase += v * dt / (0.62 + 0.7 * d.run) * Math.PI * 2;
        d.w = Math.min(1, d.w + dt * 3.5);
        const crowd = this.dogs.some(o => o !== d && Math.hypot(o.x - d.x - Math.cos(d.th) * 0.6, o.z - d.z - Math.sin(d.th) * 0.6) < 0.6);
        if (dist < 0.6 || crowd || (d.timer -= dt) < 0) { d.state = this.R() < 0.5 ? 'sniff' : 'idle'; d.timer = 2 + this.R() * 6; }
      } else {
        d.w = Math.max(0, d.w - dt * 3.5); d.run = Math.max(0, d.run - dt * 3);
        if (d.w === 0) d.phase = Math.round(d.phase / Math.PI) * Math.PI;                // 멈추면 네 발을 가지런히
        if ((d.timer -= dt) < 0) {
          const k = this.R();
          if (k < 0.7) { const p = this.spot(1.5); d.tx = p[0]; d.tz = p[1]; d.state = k < 0.25 ? 'run' : 'walk'; d.timer = 25; }
          else { d.state = d.state === 'sniff' ? 'idle' : 'sniff'; d.timer = 2 + this.R() * 5; }
        }
      }
      const gt = d.state === 'sniff' ? 1 : 0; d.g += Math.max(-dt * 2.4, Math.min(dt * 2.4, gt - d.g));
      this.pose(d, t);
    }
  }
}
// 가만히 선 개 한 마리(집 안에 두는 개): [빛깔, 도형, 놓을 자리 행렬]의 목록을 돌려준다. ci = 털빛 번호
export function dogStatue(ci) {
  const G = geos(ci), out = [];
  const add = (name, m) => { for (const [hex, list] of G.raw[name]) if (list.length) out.push([hex, mergeGeos(list), m]); };
  add('body', mat4(0, 0, 0)); add('tail', mat4(-0.42, 0.56, 0)); add('neck', mat4(0.34, 0.6, 0)); add('head', mat4(0.49, 0.8, 0));
  for (const [f, sd] of [[false, -1], [true, -1], [false, 1], [true, 1]]) { add(f ? 'foreUp' : 'hindUp', mat4(f ? 0.29 : -0.3, f ? 0.47 : 0.5, sd * 0.1)); add(f ? 'foreLo' : 'hindLo', mat4(f ? 0.3 : -0.37, f ? 0.22 : 0.24, sd * 0.1)); }
  return out;
}
