// 그네 나무 — 아카데미 마당 큰 나무에 매단 그네(어린 나루토가 혼자 앉아 있던 자리). 아카데미와 같은 좌표로 짓는다.
import * as THREE from '../vendor/three.module.js';
import { tube, mergeGeos, addCollider, mat4 } from './build.js';
import { mat, M } from './materials.js';
import { treeGeometry } from './flora.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function build(scene) {
  const SW = { x: 48, z: -72 }, bark = mat('bark', 0x8a7257);
  const g = treeGeometry(18, { height: 14.5, depth: 4, sprays: 5, leaves: 6, leafLen: 0.5 }), m4 = mat4(SW.x, 0, SW.z, 0, 2.2, 0, 1.15);
  for (const [geo, material] of [[g.wood, bark], [g.leaves, mat('leaf', 0x447f2e)]]) {
    const im = new THREE.InstancedMesh(geo, material, 1);
    im.setMatrixAt(0, m4); im.instanceMatrix.needsUpdate = true; im.castShadow = im.receiveShadow = true; im.computeBoundingSphere();
    scene.add(im);
  }
  addCollider(SW.x - 0.6, 0, SW.z - 0.6, SW.x + 0.6, 6, SW.z + 0.6);
  // 그네: 굵은 가로 가지에 밧줄 두 가닥으로 매단 널
  const swing = new THREE.Group(), rope = mat('plain', 0xb89a62, { rough: 0.95 }), top = 3.3, sx = SW.x + 2.6, sz = SW.z + 1.2;
  const limbPts = [V(SW.x, 3.5, SW.z), V(SW.x + 1.3, 3.75, SW.z + 0.6), V(sx, top + 0.12, sz), V(sx + 1.5, top + 0.3, sz + 0.7)];
  const limb = new THREE.Mesh(tube(limbPts, t => 0.2 * (1 - 0.5 * t), 8, true), bark); limb.castShadow = true; scene.add(limb);
  const geos = [];
  for (const dx of [-0.26, 0.26]) geos.push(tube([V(dx, 0, 0), V(dx, -top + 0.62, 0)], 0.016, 6, false));
  const seat = new THREE.BoxGeometry(0.72, 0.045, 0.24); seat.translate(0, -top + 0.6, 0);
  const ropes = new THREE.Mesh(mergeGeos(geos), rope), board = new THREE.Mesh(seat, M.beamLight);
  ropes.castShadow = board.castShadow = true;
  swing.add(ropes, board); swing.position.set(sx, top, sz); swing.rotation.y = 0.45;
  scene.add(swing);
  return {
    tick: t => { swing.rotation.x = Math.sin(t * 1.1) * 0.05 + Math.sin(t * 0.37) * 0.03; },
    places: [{ n: '그네 나무', t: '아카데미 마당 큰 나무에 매단 그네. 어린 나루토가 혼자 앉아 있던 자리.', b: [44, 54, -77, -67], y: [0, 4] }],
    jumps: [['그네 나무', 53, 0, -68, 0.9, 12]],
  };
}
