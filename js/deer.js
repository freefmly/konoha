// 사슴 — 나라 일족이 돌보는 사슴. 등줄기·목·머리·다리를 굵기가 변하는 관으로 빚는다. 머리가 +x, 발이 y=0.
// kind: 'stag' 뿔 난 수사슴(고개를 든 채 서 있다) | 'doe' 암사슴(서 있다) | 'graze' 풀을 뜯는 암사슴
import * as THREE from '../vendor/three.module.js';
import { tube, mergeGeos, mat4 } from './build.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function deerGeometry(kind = 'doe') {
  const body = [], dark = [], horn = [];
  // 몸통: 엉덩이 → 배 → 가슴
  body.push(tube([V(-0.66, 0.86, 0), V(-0.5, 0.9, 0), V(-0.2, 0.89, 0), V(0.15, 0.88, 0), V(0.42, 0.9, 0), V(0.58, 0.93, 0)],
    t => 0.1 + 0.115 * Math.sin(Math.PI * Math.min(1, t * 1.08 + 0.06)) + (t > 0.55 ? 0.012 : 0), 12, true));
  // 목과 머리
  const graze = kind === 'graze', stag = kind === 'stag';
  const n0 = V(0.5, 0.98, 0), head = graze ? V(0.92, 0.36, 0) : V(0.8, stag ? 1.5 : 1.42, 0), muzzle = graze ? V(1.08, 0.12, 0) : V(1.08, stag ? 1.42 : 1.32, 0);
  const nmid = graze ? V(0.8, 0.78, 0) : V(0.66, 1.2, 0);
  body.push(tube([n0, nmid, head], t => 0.125 - 0.05 * t, 10, false));
  body.push(tube([head.clone().add(V(-0.07, 0.02, 0)), head.clone().lerp(muzzle, 0.45).add(V(0, 0.015, 0)), muzzle], t => 0.092 - 0.05 * t, 10, true));
  // 귀: 납작한 잎 모양, 머리 뒤 양옆으로 벌어진다
  for (const s of [-1, 1]) { const g = new THREE.ConeGeometry(0.04, 0.17, 6); g.scale(1, 1, 0.45); body.push([g, mat4(head.x - 0.08, head.y + (graze ? 0.06 : 0.12), s * 0.085, s * 0.9, 0, graze ? -1.0 : -0.25)]); }
  // 다리: 앞다리는 곧게, 뒷다리는 무릎 뒤(비절)가 꺾인다. 발굽은 어둡게
  for (const s of [-1, 1]) {
    const z = s * 0.11;
    body.push(tube([V(0.44, 0.84, z), V(0.45, 0.46, z), V(0.43, 0.07, z)], t => 0.058 - 0.03 * t, 7, false));
    body.push(tube([V(-0.5, 0.86, z * 1.1), V(-0.6, 0.47, z * 1.1), V(-0.53, 0.07, z * 1.1)], t => 0.075 - 0.047 * t, 7, false));
    for (const x of [0.43, -0.53]) dark.push([new THREE.CylinderGeometry(0.028, 0.034, 0.08, 7), mat4(x, 0.04, x > 0 ? z : z * 1.1)]);
  }
  // 꼬리(짧고 처진다), 코, 눈
  body.push(tube([V(-0.68, 0.94, 0), V(-0.77, 0.86, 0), V(-0.8, 0.76, 0)], t => 0.045 - 0.02 * t, 6, true));
  dark.push([new THREE.SphereGeometry(0.03, 8, 6), mat4(muzzle.x + 0.012, muzzle.y + 0.004, 0)]);
  const eye = head.clone().lerp(muzzle, 0.2);
  for (const s of [-1, 1]) dark.push([new THREE.SphereGeometry(0.017, 8, 6), mat4(eye.x, eye.y + 0.035, s * 0.066)]);
  // 뿔: 뒤로 휘어 오르는 줄기에 가지 셋
  if (stag) for (const s of [-1, 1]) {
    const a = V(head.x - 0.05, head.y + 0.1, s * 0.05), b = V(head.x - 0.2, head.y + 0.36, s * 0.2), c = V(head.x - 0.22, head.y + 0.66, s * 0.3), d = V(head.x - 0.06, head.y + 0.86, s * 0.27);
    horn.push(tube([a, b, c, d], t => 0.024 - 0.015 * t, 6, false));
    horn.push(tube([a.clone().lerp(b, 0.35), V(head.x + 0.12, head.y + 0.3, s * 0.12)], t => 0.016 - 0.011 * t, 5, false));
    horn.push(tube([b.clone().lerp(c, 0.3), V(head.x - 0.02, head.y + 0.6, s * 0.33)], t => 0.015 - 0.01 * t, 5, false));
    horn.push(tube([c, V(head.x - 0.36, head.y + 0.84, s * 0.36)], t => 0.014 - 0.009 * t, 5, false));
  }
  return { body: mergeGeos(body), dark: mergeGeos(dark), horn: horn.length ? mergeGeos(horn) : null };
}
