// 바람 수련 폭포 — 담 밖 동쪽 숲 너머의 풀밭. 자리표는 layout.js의 OUTER.fall, 땅·냇물·못은 village.js, 숲과 나무 두 그루는 streets.js가 맡는다.
// 원작(애니메이션 한 장면)에서 가져온 것: 화면 끝에서 끝까지 이어지는 아주 넓은 폭포, 그 앞에 길게 솟은 갈색 흙 단과 단 위의 난간,
//   단 밑을 흐르는 냇물, 풀밭에 둥글게 선 나무 기둥 열 개(야마토가 그 한가운데 앉아 구미의 차크라를 눌렀다), 그 곁의 나무(카카시가 지켜보던 자리).
// 지어낸 것: 자리(원작에는 위치가 나오지 않는다), 크기와 높이, 폭포 뒤의 높은 흙벽, 단 양 끝의 디딤단, 냇물 끝의 바윗덩이, 담의 작은 문과 그 현판.
import * as THREE from '../vendor/three.module.js';
import { Builder, marks, settle, addCollider, mat4 } from './build.js';
import { M, mat, weatherize } from './materials.js';
import { OUTER } from './layout.js';
import { OPEN, BARE } from './zones.js';
import { wallGate } from './outer.js';

const PI = Math.PI;
const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
const vn = (x, y) => { const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); return (hash(ix, iy) * (1 - u) + hash(ix + 1, iy) * u) * (1 - v) + (hash(ix, iy + 1) * (1 - u) + hash(ix + 1, iy + 1) * u) * v; };

// 땅에서 솟은 흙벽 한 덩이: 앞면은 세로로 골이 진 벼랑, 위는 평평하고 뒤는 비탈(slope)지거나 곧다. 제 좌표로 x = 옆, z = 앞면 자리
function earthWall(B, m, { W, z, H, depth, slope, lean, rib, seed, NX, NY }) {
  const top = x => H + (rib > 1 ? 2.5 * (vn(x * 0.06 + seed, 4) - 0.5) : 0);
  const face = (x, y) => z + lean * y / H + rib * (1.5 * (vn(x * 0.33 + seed, 2) - 0.5) + 0.8 * (vn(x * 0.95 + 3, y * 0.07 + seed) - 0.5));   // 옆으로는 잘게, 위아래로는 길게 — 세로 골
  const ROWS = NY + 3, pos = [], idx = [];
  for (let i = 0; i <= NX; i++) {
    const x = -W + 2 * W * i / NX, h = top(x), zt = z + lean;
    for (let j = 0; j <= NY; j++) { const y = j ? h * j / NY : -1.9; pos.push(x, y, j === NY ? zt : face(x, Math.max(0, y))); }
    pos.push(x, h, zt + depth, x, -0.7, zt + depth + h * slope);
  }
  for (let i = 0; i < NX; i++) for (let j = 0; j < ROWS - 1; j++) { const a = i * ROWS + j, b = a + ROWS, c = a + 1, d = b + 1; idx.push(a, c, b, b, c, d); }
  for (const i of [0, NX]) { const x = pos[i * ROWS * 3], n = pos.length / 3; pos.push(x, top(x) * 0.45, z + lean + depth * 0.6); for (let j = 0; j < ROWS - 1; j++) { const a = i * ROWS + j; if (i) idx.push(a, n, a + 1); else idx.push(a, a + 1, n); } }   // 양 끝을 막는다
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  if (g.attributes.normal.getZ(Math.floor(NX / 2) * ROWS + 2) > 0) { for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; } g.setIndex(idx); }   // 앞면이 풀밭(-z)을 보게
  const f = g.toNonIndexed(); f.computeVertexNormals(); B.geo(m, f);                                                                    // 면마다 각지게
  for (let x = -W; x < W - 0.01; x += 2) addCollider(x, -2, z - rib * 1.2 - 0.1, x + 2, Math.min(top(x), top(x + 2)), z + lean + depth + H * slope * 0.8);
}

export function falls(scene, out) {
  const F = OUTER.fall, W = F.wide, [DZ0, DZ1, DH, DW] = F.deck, H0 = 60;   // 폭포의 반폭, 흙 단 [앞면, 뒷면, 높이, 디딤단을 뺀 반폭], 높은 흙벽의 높이
  wallGate(scene, F.a, '木ノ葉演習場', '東の滝');
  // 제 좌표: 풀밭 한가운데가 원점, +z가 폭포 쪽(동), +x가 북쪽(마을 좌표의 -z)
  const holder = new THREE.Group(), from = marks(), B = new Builder();
  const EARTH = mat('plain', 0x8d6c52, { rough: 1 }), EARTH2 = mat('plain', 0x9a7a5c, { rough: 1 }), WOOD = mat('wood', 0xb08a56), POST = mat('wood', 0x9a6b42), CAP = mat('plain', 0x4a3324, { rough: 0.9 }), RAIL = mat('plain', 0xe6e0d2, { rough: 0.8 });

  /* ---------- 폭포가 쏟아지는 높은 흙벽, 그 앞의 흙 단 ---------- */
  earthWall(B, EARTH2, { W: W + 6, z: F.far, H: H0, depth: 14, slope: 0.5, lean: 3, rib: 1.6, seed: 5, NX: 130, NY: 8 });
  earthWall(B, EARTH, { W: DW, z: DZ0, H: DH - 0.1, depth: DZ1 - DZ0 - 0.6, slope: 0, lean: 0.6, rib: 1, seed: 11, NX: 104, NY: 6 });

  // 흙 단 앞면의 세로 결: 빛깔이 조금씩 다른 흙 기둥이 들쭉날쭉 붙어 서 있다
  { const TONES = [mat('plain', 0x7b5b47, { rough: 1 }), mat('plain', 0xa27f61, { rough: 1 }), mat('plain', 0x95735a, { rough: 1 }), EARTH]; let i = 0;
    for (let x = -DW; x < DW - 0.5; i++) { const w = 0.9 + 2.3 * hash(i, 7), d = 0.25 + 0.75 * hash(i, 9), x1 = Math.min(DW, x + w); B.box(TONES[Math.floor(hash(i, 5) * 4)], x, -1.8, DZ0 - 0.9 - d, x1, DH - 0.25 - 1.3 * hash(i, 2), DZ0 + 0.5, false); x = x1 + 0.35 * hash(i, 4); } }

  /* ---------- 폭포: 흙벽 꼭대기에서 끝에서 끝까지 한 장으로 쏟아진다 ---------- */
  {
    const FW = W - 4, NX = 40, NY = 8, top = H0 + 0.6, pos = [], idx = [], zs = y => F.far - 2.4 + 3 * y / H0 - 1.4 * Math.sin(PI * Math.max(0, y) / top);
    for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) { const y = top - (top + 0.8) * j / NY; pos.push(-FW + 2 * FW * i / NX, y, zs(y)); }
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const extra = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `
        float fA = -vWPos.z;                                                // 벽을 따라 옆으로
        float fS = wFbm(vec2(fA * 0.55, vWPos.y * 0.05 + uTime * 0.8)) * 0.65 + wNoise(vec2(fA * 2.3 + 7.0, vWPos.y * 0.12 + uTime * 1.4)) * 0.45;
        float fW = smoothstep(0.30, 0.62, fS);
        fW = mix(fW, step(0.5, fW), uToon);                                 // 만화 화풍: 물빛과 흰 물살 두 색으로 끊는다
        float fTop = smoothstep(${(H0 * 0.55).toFixed(1)}, ${H0.toFixed(1)}, vWPos.y), fBot = 1.0 - smoothstep(2.0, ${(DH + 6).toFixed(1)}, vWPos.y);
        fW = max(fW, max(fTop * 0.75, fBot * 0.6));                         // 꼭대기는 하얗게 부서지고, 밑은 물안개로 뿌옇다
        diffuseColor.rgb = mix(vec3(0.50, 0.74, 0.93), vec3(0.97, 0.99, 1.0), fW);
        diffuseColor.a *= mix(0.9, 1.0, fW) * smoothstep(${FW.toFixed(1)}, ${(FW - 3).toFixed(1)}, abs(fA + ${F.c[1].toFixed(2)}) + 1.5 * wNoise(vec2(vWPos.y * 0.3, uTime * 0.5)));`); };
    extra.key = 'falls';
    const fm = weatherize(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, transparent: true, opacity: 0.95, side: THREE.DoubleSide }), { extra });
    const m = new THREE.Mesh(g, fm); m.castShadow = false; m.receiveShadow = false; holder.add(m);
    const w = new THREE.Mesh(new THREE.PlaneGeometry(2 * FW, 17).rotateX(-PI / 2), M.water); w.position.set(0, H0 + 0.5, F.far + 9); holder.add(w);   // 흙벽 꼭대기를 넘는 물
  }

  /* ---------- 흙 단 위: 널을 깔고 앞뒤로 난간을 둘렀다. 양 끝은 흙을 깎은 디딤단 ---------- */
  {
    const z0 = DZ0 + 0.7, z1 = DZ1 - 0.2;
    for (let x = -DW; x < DW - 0.01; x += 2) B.box(WOOD, x, DH - 0.1, z0 - 0.5, x + 2, DH, z1 + 0.1);
    for (let x = -DW; x <= DW; x += 2) B.box(M.beam, x - 0.02, DH, z0 - 0.4, x + 0.02, DH + 0.012, z1, false);                                    // 널 이음매
    for (const z of [z0, z1 - 0.3]) {
      for (let x = -DW; x <= DW + 0.01; x += 3.25) { B.box(POST, x - 0.11, DH, z - 0.11, x + 0.11, DH + 1.15, z + 0.11, false); B.box(RAIL, x - 0.15, DH + 1.15, z - 0.15, x + 0.15, DH + 1.3, z + 0.15, false); }
      for (let x = -DW; x < DW - 0.01; x += 2) { B.box(POST, x, DH + 0.92, z - 0.05, x + 2, DH + 1.02, z + 0.05, false); B.box(POST, x, DH + 0.45, z - 0.04, x + 2, DH + 0.52, z + 0.04, false); addCollider(x, DH, z - 0.12, x + 2, DH + 1.2, z + 0.12); }
    }
    const N = Math.round(DH / 0.2), RUN = (W - DW) / N;
    for (const s of [-1, 1]) for (let k = 0; k < N; k++) { const a = DW + k * RUN, t = DH - (k + 1) * (DH / N); B.box(EARTH, Math.min(s * a, s * (a + RUN)), -1, DZ0 + 0.3, Math.max(s * a, s * (a + RUN)), t, DZ1 - 0.3); }
    for (const s of [-1, 1]) for (let k = 0; k < N; k += 3) { const a = DW + k * RUN, t = DH - (k + 1) * (DH / N); B.box(WOOD, Math.min(s * a, s * (a + 0.12)), t, DZ0 + 0.3, Math.max(s * a, s * (a + 0.12)), t + 0.02, DZ1 - 0.3, false); }   // 디딤단 턱의 통나무
    // 냇물 끝의 바윗덩이(물길이 끊긴 자리를 가린다)
    for (const s of [-1, 1]) for (const [dx, dz, r] of [[1, 14, 4.2], [-3, 9, 2.6], [-2, 19.5, 3.1], [3, 5, 2.2], [4, 20, 2.4]]) { const x = s * (W + 3 + dx); B.geo(EARTH2, new THREE.DodecahedronGeometry(r, 1).scale(1, 0.7, 1), mat4(x, r * 0.3, dz, dz * 0.1, x, 0.2)); addCollider(x - r * 0.8, -2, dz - r * 0.8, x + r * 0.8, r * 0.9, dz + r * 0.8); }
  }

  /* ---------- 나무 기둥 고리: 맨흙 둥근 자리에 굵은 기둥 열 개가 둘러서 있다 ---------- */
  {
    const cx = -F.ring[1], cz = F.ring[0], R = F.ring[2];
    for (let i = 0; i < 10; i++) { const a = (i + 0.5) / 10 * 2 * PI, x = cx + Math.cos(a) * R, z = cz + Math.sin(a) * R, h = 1.55 + 0.18 * hash(i, 3);
      B.geo(POST, new THREE.BoxGeometry(0.72, h, 0.72), mat4(x, h / 2, z, 0, -a, 0)); B.geo(CAP, new THREE.BoxGeometry(0.8, 0.14, 0.8), mat4(x, h + 0.07, z, 0, -a, 0));
      for (const y of [0.45, 1.0]) B.geo(CAP, new THREE.BoxGeometry(0.76, 0.06, 0.76), mat4(x, y, z, 0, -a, 0));
      addCollider(x - 0.4, 0, z - 0.4, x + 0.4, h + 0.14, z + 0.4); }
  }

  B.finish(holder);
  const res = settle(scene, holder, from, { x: F.c[0], z: F.c[1], ry: PI / 2 }, {
    places: [
      { n: '바람 수련 폭포', t: '나루토가 바람의 성질 변화를 익히던 곳. 야마토가 땅을 솟게 하고 물을 흘려 끝이 안 보이는 폭포를 만들었다. 나루토는 분신들과 흙 단 위에 줄지어 서서 물줄기를 가르는 수련을 했다.', b: [-W - 4, W + 4, F.front, F.far + 4], y: [-3, H0 + 8] },
      { n: '나무 기둥 고리', t: '야마토가 한가운데 앉아 나루토에게서 새어 나오는 구미의 차크라를 누르던 자리. 곁의 나무 밑에서는 카카시가 책을 읽으며 지켜보았다.', b: [-F.ring[1] - 6, -F.ring[1] + 6, F.ring[0] - 6, F.ring[0] + 6], y: [-1, 4] },
    ],
    jumps: [['바람 수련 폭포', 0, 0, F.front + 12, PI, 92]],
  });
  out.places.push(...res.places); out.jumps.push(...res.jumps);
  for (const p of F.trail) OPEN.push([p[0], p[1], 4]);
  { const q = F.L(F.ring[0], F.ring[1]), r = F.ring[2] + 2; BARE.push((x, z) => Math.hypot(x - q[0], z - q[1]) < r); }   // 기둥 고리 안의 맨흙
}
