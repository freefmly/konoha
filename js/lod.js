// 멀리 있는 것을 가볍게 그린다 — 큰 건물의 잔 장식과, 건물 둘레에 따로 심은 큰 나무.
// (거리의 집과 숲의 나무는 streets.js가 따로 맡는다. 여기서는 그 밖의 것을 다룬다.)
//  · 건물: 한 덩어리로 묶인 도형 안에서 서로 떨어진 조각(창틀·살·등·난간…)을 찾아, 멀어지면 작은 조각부터 그리지 않는다.
//    벽·지붕·바위처럼 이어진 큰 면은 한 조각이라 그대로 남는다. 꼭짓점은 그대로 두고 그릴 차례(index)만 따로 만들어 바꿔 끼운다.
//  · 작은 것: 등·간판·그릇처럼 작은 물체는 멀어져 점만 해지면 아예 그리지 않는다(그리기 명령의 수가 줄어 가장 크게 가벼워진다).
//  · 나무: treeGeometry가 함께 지어 둔 가벼운 모습(굵은 가지와 큼직한 잎 몇 장, 성긴 잎 덩어리)으로 바꿔 끼운다.
import * as THREE from '../vendor/three.module.js';
import { doneGeo, LITE } from './build.js';

// 이보다 멀면 한 단계, 두 단계 줄인다(m, 그 물체의 둘레에서 잰 거리). 폰은 훨씬 가까이에서부터 줄인다(화면이 작아 잔 장식이 어차피 안 보인다)
const D1 = LITE ? 45 : 150, D2 = LITE ? 110 : 350;
const S1 = 0.5, S2 = 1.2;          // 단계마다 그리지 않는 조각의 크기(m)
const MIN = 12, MAX = 350000;      // 삼각형이 이보다 적으면 나눌 것이 없고, 많으면 땅·바위 같은 이어진 면이다
const HIDE = LITE ? 110 : 220, HIDE_MIN = LITE ? 45 : 90;   // 물체의 반지름의 이 배수보다 멀어지면(적어도 HIDE_MIN m) 그리지 않는다: 화면에서 두세 점 크기

// 한 도형을 서로 떨어진 조각으로 나누고, 단계별로 그릴 차례를 만든다(오래 걸리니 조금씩 나눠 한다: 중간중간 yield)
function* analyze(g) {
  const pos = g.attributes.position.array, N = pos.length / 9;
  if (!g.boundingBox) g.computeBoundingBox();
  const bb = g.boundingBox, ext = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z, 1e-3), q = Math.min(500, 65535 / ext);
  const par = new Int32Array(N); for (let i = 0; i < N; i++) par[i] = i;
  const find = i => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  const seen = new Map();
  for (let t = 0; t < N; t++) {
    for (let k = 0; k < 3; k++) {
      const o = t * 9 + k * 3, key = (Math.round((pos[o] - bb.min.x) * q) * 65536 + Math.round((pos[o + 1] - bb.min.y) * q)) * 65536 + Math.round((pos[o + 2] - bb.min.z) * q);
      const u = seen.get(key);
      if (u === undefined) seen.set(key, t); else { const a = find(t), b = find(u); if (a !== b) par[a] = b; }
    }
    if (t % 20000 === 19999) yield;
  }
  // 조각마다 둘레 상자
  const lo = new Float32Array(N * 3).fill(Infinity), hi = new Float32Array(N * 3).fill(-Infinity);
  for (let t = 0; t < N; t++) {
    const r = find(t) * 3;
    for (let k = 0; k < 9; k++) { const v = pos[t * 9 + k], a = r + k % 3; if (v < lo[a]) lo[a] = v; if (v > hi[a]) hi[a] = v; }
    if (t % 40000 === 39999) yield;
  }
  const size = new Float32Array(N);   // 조각의 크기: 둘레 상자의 가장 넓은 면의 한 변쯤
  for (let t = 0; t < N; t++) if (par[t] === t) { const e = [hi[t * 3] - lo[t * 3], hi[t * 3 + 1] - lo[t * 3 + 1], hi[t * 3 + 2] - lo[t * 3 + 2]].sort((a, b) => b - a); size[t] = Math.sqrt(e[0] * e[1]); }
  const out = [null, null];
  [S1, S2].forEach((s, li) => {
    let n = 0; for (let t = 0; t < N; t++) if (size[find(t)] >= s) n++;
    if (n > N * 0.85) return;                                  // 줄어드는 것이 거의 없으면 그대로 둔다
    const idx = new Uint32Array(n * 3); let w = 0;
    for (let t = 0; t < N; t++) if (size[find(t)] >= s) { idx[w++] = t * 3; idx[w++] = t * 3 + 1; idx[w++] = t * 3 + 2; }
    const f = new THREE.BufferGeometry();
    for (const name in g.attributes) f.setAttribute(name, g.attributes[name]);   // 꼭짓점은 함께 쓴다
    f.setIndex(new THREE.BufferAttribute(idx, 1)); f.boundingBox = g.boundingBox; f.boundingSphere = g.boundingSphere;
    f.index.onUploadCallback = function () { this.array = new Uint32Array(0); };   // 그릴 차례도 올려 보낸 뒤에는 사본을 버린다(메모리)
    out[li] = f;
  });
  return out;
}

export function setupLod(scene, camera) {
  const items = [], pending = [], cache = new Map(), c = new THREE.Vector3();
  scene.updateMatrixWorld(true);
  const add = (o, far) => {
    const g = o.geometry, s = (o.isInstancedMesh ? (o.boundingSphere || (o.computeBoundingSphere(), o.boundingSphere)) : (g.boundingSphere || (g.computeBoundingSphere(), g.boundingSphere)));
    const sc = o.matrixWorld.getMaxScaleOnAxis();
    const r = s.radius * sc;
    items.push({ o, g: [g, far[0] || g, far[1] || far[0] || g], c: s.center.clone().applyMatrix4(o.matrixWorld), r, hide: o.frustumCulled && o.material.depthWrite !== false ? Math.max(HIDE_MIN, r * HIDE) : Infinity, lv: 0 });
  };
  scene.traverse(o => {
    if (!o.isMesh || o.isSkinnedMesh) return;
    const g = o.geometry; if (!g || !g.attributes.position) return;
    if (g.userData.far) { add(o, [g.userData.far, null]); return; }                 // 나무: 지어 둔 가벼운 모습
    const n = g.attributes.position.count / 3;
    if (Array.isArray(o.material)) return;
    // 조각으로 나눌 수 없는 것(묶어 찍은 것·차례가 있는 도형·잎)은 거리로 숨기기만 한다. 잎·풀·꽃은 낱장이 다 조각이라 나누면 통째로 사라진다
    if (o.isInstancedMesh || g.index || g.groups.length || g.attributes.aKind || n < MIN || n > MAX || g.attributes.position.isInterleavedBufferAttribute || (o.material.defines && 'W_LEAF' in o.material.defines)) { add(o, [null, null]); doneGeo(g); return; }
    add(o, [null, null]); pending.push(items[items.length - 1]);
  });
  pending.sort((a, b) => b.o.geometry.attributes.position.count - a.o.geometry.attributes.position.count);
  let job = null, jobMesh = null, dirty = true;
  const setFar = (it, far) => { if (!far[0] && !far[1]) return; it.g[1] = far[0] || it.g[0]; it.g[2] = far[1] || it.g[1]; it.lv = -1; dirty = true; };
  const last = new THREE.Vector3(1e9, 0, 0);
  const tick = () => {
    // 조각 나누기: 한 장면에 4ms씩만
    const t0 = performance.now();
    while ((job || pending.length) && performance.now() - t0 < 4) {
      if (!job) {
        jobMesh = pending.pop();                                                    // 작은 것부터
        const done = cache.get(jobMesh.g[0]);
        if (done) { setFar(jobMesh, done); continue; }
        job = analyze(jobMesh.g[0]);
      }
      const r = job.next();
      if (r.done) { cache.set(jobMesh.g[0], r.value); setFar(jobMesh, r.value); doneGeo(jobMesh.g[0]); job = null; }   // 다 읽었으니 자리 사본도 버려도 된다
    }
    const p = camera.position;
    if (!dirty && last.distanceToSquared(p) < 16) return;
    last.copy(p); dirty = false;
    for (const it of items) {
      const dc = c.copy(it.c).sub(p).length(), d = dc - it.r, k = it.lv;
      let lv = d > D2 * (k >= 2 ? 0.92 : 1) ? 2 : d > D1 * (k >= 1 ? 0.9 : 1) ? 1 : 0;       // 경계에서 깜빡이지 않게 돌아올 때는 조금 더 가까이 와야 한다
      if (dc > it.hide * (k === 3 ? 0.9 : 1) || (it.g[lv].index && it.g[lv].index.count === 0)) lv = 3;   // 너무 작아졌거나 남은 조각이 없으면 그리지 않는다
      if (lv !== k) { it.lv = lv; if (lv < 3) it.o.geometry = it.g[lv]; it.o.layers.set(lv === 3 ? 1 : 0); }
    }
  };
  return { tick, stats: () => ({ items: items.length, pending: pending.length + (job ? 1 : 0) }) };
}
