// 사슴 — 나라 일족이 돌보는 사슴. 몸통·목·머리·다리를 굵기가 변하는 관으로 빚고, 목·머리·다리 마디를 따로 움직여 걷고 풀을 뜯게 한다.
// 사슴 한 마리의 좌표: 머리가 +x, 발이 y=0. kind: 'stag' 뿔 난 수사슴 | 'doe' 암사슴
import * as THREE from '../vendor/three.module.js';
import { tube, mergeGeos, mat4 } from './build.js';
import { mat } from './materials.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const FUR = 0xa97b4a, PALE = 0xd9c39a, DARK = 0x2a211b, BONE = 0xd8c9a8;

// 빛깔별 도형 묶음을 한 덩어리로(빛깔은 꼭짓점에 적는다 — 사슴 한 부위를 한 번에 그리려고)
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

let GEO = null;
// 부위별 도형(마디가 도는 자리를 원점으로 빚는다)
function geos() {
  if (GEO) return GEO;
  const G = {};
  // 몸통: 엉덩이 → 배 → 가슴. 꼬리(밑은 흰빛)
  G.body = painted([
    [FUR, [tube([V(-0.66, 0.86, 0), V(-0.5, 0.9, 0), V(-0.2, 0.89, 0), V(0.15, 0.88, 0), V(0.42, 0.9, 0), V(0.58, 0.93, 0)], t => 0.1 + 0.115 * Math.sin(Math.PI * Math.min(1, t * 1.08 + 0.06)) + (t > 0.55 ? 0.012 : 0), 12, true)]],
    [PALE, [tube([V(-0.68, 0.94, 0), V(-0.77, 0.86, 0), V(-0.8, 0.76, 0)], t => 0.045 - 0.02 * t, 6, true)]],
  ]);
  // 목(어깨 쪽 마디가 원점)과 머리(목 끝 마디가 원점)
  G.neck = painted([[FUR, [tube([V(-0.03, -0.03, 0), V(0.16, 0.22, 0), V(0.3, 0.46, 0)], t => 0.128 - 0.052 * t, 10, false)]]]);
  const head = stag => {
    const fur = [tube([V(-0.07, 0.02, 0), V(0.12, -0.03, 0), V(0.28, -0.1, 0)], t => 0.092 - 0.05 * t, 10, true)], dark = [], horn = [];
    for (const s of [-1, 1]) {
      const e = new THREE.ConeGeometry(0.04, 0.17, 6); e.scale(1, 1, 0.45); fur.push([e, mat4(-0.08, 0.12, s * 0.085, s * 0.9, 0, -0.25)]);        // 귀
      dark.push([new THREE.SphereGeometry(0.017, 8, 6), mat4(0.07, 0.035, s * 0.066)]);                                                             // 눈
      if (stag) {   // 뿔: 뒤로 휘어 오르는 줄기에 가지 셋
        const a = V(-0.05, 0.1, s * 0.05), b = V(-0.2, 0.36, s * 0.2), c = V(-0.22, 0.66, s * 0.3), d = V(-0.06, 0.86, s * 0.27);
        horn.push(tube([a, b, c, d], t => 0.024 - 0.015 * t, 6, false), tube([a.clone().lerp(b, 0.35), V(0.12, 0.3, s * 0.12)], t => 0.016 - 0.011 * t, 5, false),
          tube([b.clone().lerp(c, 0.3), V(-0.02, 0.6, s * 0.33)], t => 0.015 - 0.01 * t, 5, false), tube([c, V(-0.36, 0.84, s * 0.36)], t => 0.014 - 0.009 * t, 5, false));
      }
    }
    dark.push([new THREE.SphereGeometry(0.03, 8, 6), mat4(0.29, -0.096, 0)]);                                                                         // 코
    return painted([[FUR, fur], [DARK, dark], [BONE, horn]]);
  };
  G.headDoe = head(false); G.headStag = head(true);
  // 다리: 윗마디(엉덩이·어깨 마디가 원점)와 아랫마디(무릎 마디가 원점, 발굽까지)
  G.foreUp = painted([[FUR, [tube([V(0, 0.02, 0), V(0.01, -0.38, 0)], t => 0.06 - 0.02 * t, 7, false)]]]);
  G.foreLo = painted([[FUR, [tube([V(0, 0.01, 0), V(-0.02, -0.39, 0)], t => 0.04 - 0.012 * t, 7, false)]], [DARK, [[new THREE.CylinderGeometry(0.028, 0.034, 0.08, 7), mat4(-0.02, -0.42, 0)]]]]);
  G.hindUp = painted([[FUR, [tube([V(0.02, 0.03, 0), V(-0.1, -0.39, 0)], t => 0.08 - 0.036 * t, 7, false)]]]);
  G.hindLo = painted([[FUR, [tube([V(0, 0.01, 0), V(0.07, -0.4, 0)], t => 0.045 - 0.017 * t, 7, false)]], [DARK, [[new THREE.CylinderGeometry(0.028, 0.034, 0.08, 7), mat4(0.07, -0.43, 0)]]]]);
  const b = new THREE.CircleGeometry(1, 20); b.rotateX(-Math.PI / 2); G.blob = b;
  return (GEO = G);
}

// 마디로 엮은 사슴 한 마리
function rig(kind, fur, blobMat) {
  const G = geos(), root = new THREE.Group();
  const mesh = (g, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(g, fur); m.position.set(x, y, z); m.receiveShadow = true; parent.add(m); return m; };
  mesh(G.body, root);
  const neck = mesh(G.neck, root, 0.5, 0.98, 0), head = mesh(kind === 'stag' ? G.headStag : G.headDoe, neck, 0.3, 0.46, 0);
  const legs = [];
  for (const [front, s] of [[false, -1], [true, -1], [false, 1], [true, 1]]) {   // 왼뒤, 왼앞, 오른뒤, 오른앞(걸음 차례)
    const up = mesh(front ? G.foreUp : G.hindUp, root, front ? 0.44 : -0.5, front ? 0.84 : 0.86, s * (front ? 0.11 : 0.12));
    const lo = mesh(front ? G.foreLo : G.hindLo, up, front ? 0.01 : -0.1, front ? -0.38 : -0.39, 0);
    legs.push({ up, lo, front });
  }
  // 발밑 그늘(그림자 지도는 가만히 선 것만 담으므로, 걸어 다니는 사슴에게는 엷은 그늘을 따로 깐다)
  const blob = new THREE.Mesh(G.blob, blobMat); blob.position.y = 0.025; blob.scale.set(0.8, 1, 0.36); blob.renderOrder = 1; root.add(blob);
  return { root, neck, head, legs };
}

const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const inPoly = (x, z, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };

// 울타리 안(poly)을 거니는 사슴 떼. tick(t, dt, 보는 눈의 자리)을 매 장면 불러 준다.
export class Herd {
  constructor(scene, poly, count, R, hf = null) {   // hf(x, z) = 그 자리의 땅 높이(평지면 안 줘도 된다)
    this.poly = poly; this.R = R; this.deer = []; this.hf = hf;
    const fur = mat('plain', 0xffffff, { vc: true, rough: 0.92 }), blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.26, depthWrite: false });
    const xs = poly.map(p => p[0]), zs = poly.map(p => p[1]);
    this.box = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    this.cx = (this.box[0] + this.box[1]) / 2; this.cz = (this.box[2] + this.box[3]) / 2;
    for (let i = 0; i < count; i++) {
      const kind = i % 4 === 0 ? 'stag' : 'doe', d = rig(kind, fur, blobMat), p = this.spot(3.5);
      Object.assign(d, { x: p[0], z: p[1], th: R() * Math.PI * 2, state: R() < 0.5 ? 'graze' : 'idle', timer: 1 + R() * 8, phase: R() * 6.283, w: 0, g: 0, seed: R() * 100, tx: 0, tz: 0 });
      d.root.scale.setScalar(kind === 'stag' ? 1.12 + R() * 0.08 : 0.9 + R() * 0.15);
      d.g = d.state === 'graze' ? 1 : 0;
      scene.add(d.root); this.deer.push(d); this.pose(d, 0);
    }
  }
  // 울타리 안의 빈 자리(다른 사슴과 gap 넘게 떨어진 곳)
  spot(gap) {
    for (let t = 0; t < 60; t++) {
      const x = this.box[0] + this.R() * (this.box[1] - this.box[0]), z = this.box[2] + this.R() * (this.box[3] - this.box[2]);
      if (inPoly(x, z, this.poly) && !this.deer.some(o => Math.hypot(o.x - x, o.z - z) < gap)) return [x, z];
    }
    return [this.cx, this.cz];
  }
  pose(d, t) {
    const w = d.w, g = d.g;
    d.root.position.set(d.x, (this.hf ? this.hf(d.x, d.z) : 0) + w * 0.012 * Math.sin(d.phase * 2), d.z); d.root.rotation.y = -d.th;
    // 목과 머리: 풀을 뜯을 때는 목을 내리고 머리를 세워 주둥이가 땅을 향한다. 서 있을 때는 천천히 둘레를 살핀다
    d.neck.rotation.z = -2.0 * g + w * 0.07 * Math.sin(d.phase * 2) + g * 0.05 * Math.sin(t * 2.3 + d.seed);
    d.head.rotation.z = 0.95 * g;
    d.neck.rotation.y = (1 - g) * (1 - w) * 0.55 * Math.sin(t * 0.45 + d.seed);
    d.legs.forEach((L, i) => {   // 네 다리가 왼뒤 → 왼앞 → 오른뒤 → 오른앞 차례로 나간다. 발을 내디딜 때 무릎이 접힌다
      const ph = d.phase + i * Math.PI / 2, lift = Math.max(0, Math.cos(ph));
      L.up.rotation.z = w * 0.36 * Math.sin(ph);
      L.lo.rotation.z = w * (L.front ? -0.8 : 0.62) * lift;
    });
  }
  tick(t, dt, eye) {
    if (eye && Math.hypot(eye.x - this.cx, eye.z - this.cz, eye.y) > 260) return;       // 멀리서는 멈춰 둔다
    dt = Math.min(dt, 0.05);
    for (const d of this.deer) {
      if (d.state === 'walk') {
        const dx = d.tx - d.x, dz = d.tz - d.z, dist = Math.hypot(dx, dz), turn = wrap(Math.atan2(dz, dx) - d.th);
        d.th += Math.max(-1.3 * dt, Math.min(1.3 * dt, turn));
        const v = 0.85 * (Math.abs(turn) < 0.9 ? 1 : 0.3) * d.w;
        d.x += Math.cos(d.th) * v * dt; d.z += Math.sin(d.th) * v * dt; d.phase += v * dt / 0.95 * Math.PI * 2;
        d.w = Math.min(1, d.w + dt * 2.5);
        const crowd = this.deer.some(o => o !== d && Math.hypot(o.x - d.x - Math.cos(d.th) * 0.9, o.z - d.z - Math.sin(d.th) * 0.9) < 0.9);
        if (dist < 0.7 || crowd || (d.timer -= dt) < 0) { d.state = this.R() < 0.6 ? 'graze' : 'idle'; d.timer = 4 + this.R() * 9; }
      } else {
        d.w = Math.max(0, d.w - dt * 2.5);
        if (d.w === 0) d.phase = Math.round(d.phase / Math.PI) * Math.PI;                // 멈추면 네 발을 가지런히
        if ((d.timer -= dt) < 0) {
          if (this.R() < 0.55) { const p = this.spot(2.5); d.tx = p[0]; d.tz = p[1]; d.state = 'walk'; d.timer = 40; }
          else { d.state = d.state === 'graze' ? 'idle' : 'graze'; d.timer = 3 + this.R() * 8; }
        }
      }
      const gt = d.state === 'graze' ? 1 : 0; d.g += Math.max(-dt * 1.4, Math.min(dt * 1.4, gt - d.g));   // 고개는 천천히 숙이고 든다
      this.pose(d, t);
    }
  }
}
