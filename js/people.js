// 마을 사람 — 길을 걸어 다니는 주민과 닌자, 길가에 마주 서서 이야기하는 사람들.
// 몸은 머리·머리카락·몸통·팔(위팔과 아래팔)·다리(허벅지와 정강이)를 따로 빚어 한 덩어리로 묶고, 걷는 동작은 그래픽 카드에서 관절을 돌려 만든다.
// 같은 생김새끼리 한 묶음으로 찍어 그리므로(생김새 일곱 가지 = 그리기 명령 일곱 번) 사람이 늘어도 거의 무거워지지 않는다.
// 사람들은 마을 전체에 흩어 두지 않고, 걷는 사람 둘레에만 둔다(멀어진 사람은 거두어 가까운 길 어딘가에 다시 세운다).
// ※ 원작의 이름 있는 인물이 아니라, 지어낸 이름 없는 주민들이다.
import * as THREE from '../vendor/three.module.js';
import { tube, rng, nearAll } from './build.js';
import { weatherize } from './materials.js';
import { terrainH } from './village.js';
import { WALL } from './layout.js';
import { isRoad } from './streets.js';

export const PEOPLE = { uFace: { value: 1 } };   // 얼굴(눈·눈썹·입)을 그릴지

const V = (x, y, z) => new THREE.Vector3(x, y, z);
// 색 칸: 사람마다 다른 색(0 살갗, 1 머리카락, 2 윗옷, 3 아래옷, 4 신, 5 덧옷·띠) / 늘 같은 색(6 짙은 빛, 7 흰빛, 8 이마 보호대의 쇠, 9 이마 보호대의 천) / 얼굴(10 짙은 빛, 11 흰빛: 얼굴을 끄면 접어 숨긴다)
const SKIN = 0, HAIR = 1, TOP = 2, BOT = 3, SHOE = 4, ACC = 5, DARK = 6, METAL = 8, BAND = 9, FACE = 10, FACEW = 11;
// 마디: 0 몸통(머리 포함), 1·2 왼 위팔·아래팔, 3·4 오른 위팔·아래팔, 5·6 왼 허벅지·정강이, 7·8 오른 허벅지·정강이
const HEAD0 = 1.465;   // 머리 밑(목 위)

/* ---------- 몸 빚기 ---------- */
// kind: 'man' | 'woman' | 'ninja', hair: 'short' | 'spiky' | 'long' | 'bun' | 'tail' | 'knot', skirt: 0 없음 | 1 무릎 | 2 발목, child: 아이(머리를 키운다)
function bodyGeometry({ kind = 'man', hair = 'short', skirt = 0, sleeves = false, child = false, apron = false }) {
  const P = [], N = [], PS = [], J0 = [], J1 = [];
  const add = (g, part, slot, j0 = null, j1 = null, m = null) => {
    if (m) g.applyMatrix4(m);
    if (g.index) g = g.toNonIndexed();
    if (!g.attributes.normal) g.computeVertexNormals();
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    for (let i = 0; i < p.length; i += 3) {
      P.push(p[i], p[i + 1], p[i + 2]); N.push(n[i], n[i + 1], n[i + 2]); PS.push(part, slot);
      J0.push(j0 ? j0.x : 0, j0 ? j0.y : 0, j0 ? j0.z : 0); J1.push(j1 ? j1.x : 0, j1 ? j1.y : 0, j1 ? j1.z : 0);
    }
  };
  const smooth = g => { g.deleteAttribute('normal'); g.computeVertexNormals(); return g; };
  const lathe = (prof, seg = 14) => new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p[0], p[1])), seg);
  const ball = (c, rx, ry, rz, ws = 10, hs = 7) => { const g = new THREE.SphereGeometry(1, ws, hs); g.scale(rx, ry, rz); g.translate(c.x, c.y, c.z); return g; };
  const limb = (a, b, r0, r1, sides = 8) => tube([a, a.clone().lerp(b, 0.5), b], t => r0 + (r1 - r0) * t, sides, true);
  // 몸통처럼 앞뒤로 납작한 통: 높이마다 반지름을 주고 앞뒤를 눌러 준다
  const barrel = (ys, rs, flat, wide = 1, sides = 12) => { const g = tube(ys.map(y => V(0, y, 0)), t => { const f = t * (rs.length - 1), i = Math.min(rs.length - 2, Math.floor(f)); return rs[i] + (rs[i + 1] - rs[i]) * (f - i); }, sides, true); g.scale(wide, 1, flat); return smooth(g); };
  const box = (w, h, d, x, y, z, ry = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.rotateY(ry); g.translate(x, y, z); return g; };
  const W = kind === 'woman';

  /* 몸통 */
  add(barrel([0.86, 0.98, 1.12, 1.28, 1.4, 1.455], W ? [0.132, 0.122, 0.108, 0.136, 0.138, 0.06] : [0.135, 0.13, 0.126, 0.152, 0.152, 0.07], 0.66, W ? 0.94 : 1), 0, TOP);
  add(ball(V(0, 0.9, 0), W ? 0.142 : 0.138, 0.09, 0.1), 0, skirt ? TOP : BOT);
  add(limb(V(0, 1.43, 0), V(0, 1.5, 0.004), 0.043, 0.04, 8), 0, SKIN);
  add(barrel([0.975, 1.035], W ? [0.126, 0.118] : [0.136, 0.134], 0.68, W ? 0.95 : 1.01), 0, ACC);                               // 허리띠
  if (skirt) add(barrel(skirt === 2 ? [1.0, 0.7, 0.3] : [1.0, 0.75, 0.5], skirt === 2 ? [0.128, 0.165, 0.2] : [0.128, 0.17, 0.2], 0.8), 0, skirt === 2 ? TOP : BOT);
  if (apron) add(box(0.2, 0.36, 0.012, 0, 0.83, skirt ? 0.158 : 0.1), 0, ACC);
  if (kind === 'ninja') {   // 조끼: 깃을 세우고 가슴에 두루마리 주머니 셋씩
    add(barrel([1.0, 1.14, 1.3, 1.415], [0.146, 0.148, 0.166, 0.162], 0.72), 0, ACC);
    add(barrel([1.4, 1.475], [0.09, 0.082], 0.86, 1, 10), 0, ACC);
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) add(box(0.034, 0.085, 0.026, s * (0.04 + i * 0.037), 1.275, 0.112 - i * 0.008, -s * i * 0.16), 0, ACC);
  }

  /* 머리 */
  const head = [], H = (g, slot) => head.push([g, slot]);
  { const g = lathe([[0, 0], [0.045, 0.004], [0.074, 0.04], [0.092, 0.1], [0.098, 0.155], [0.09, 0.2], [0.066, 0.235], [0.03, 0.252], [0, 0.256]]); g.scale(0.9, 1, 1); g.translate(0, HEAD0, 0); H(smooth(g), SKIN); }
  for (const s of [-1, 1]) {
    H(ball(V(s * 0.088, 1.588, -0.004), 0.013, 0.03, 0.02, 8, 6), SKIN);                                                         // 귀
    { const g = new THREE.SphereGeometry(1, 10, 7); g.scale(0.017, 0.025, 0.004); g.rotateY(s * 0.36); g.translate(s * 0.037, 1.594, 0.0885); H(g, FACE); }      // 눈
    { const g = new THREE.SphereGeometry(1, 6, 4); g.scale(0.0045, 0.006, 0.002); g.rotateY(s * 0.36); g.translate(s * 0.034, 1.603, 0.0925); H(g, FACEW); }   // 눈빛
    { const g = new THREE.BoxGeometry(0.042, 0.0075, 0.004); g.rotateZ(-s * (W ? 0.05 : 0.14)); g.rotateY(s * 0.36); g.translate(s * 0.037, 1.634, 0.089); H(g, FACE); }   // 눈썹
  }
  H(ball(V(0, 1.562, 0.097), 0.011, 0.015, 0.014, 8, 6), SKIN);                                                                  // 코
  H(box(W ? 0.024 : 0.032, 0.0055, 0.004, 0, 1.526, 0.083), FACE);                                                                // 입
  // 머리카락: 이마 위에서 뒤통수까지 덮는 덮개에, 생김새마다 가시·긴 머리·쪽·묶은 머리를 더한다
  { const g = new THREE.SphereGeometry(0.115, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.6); g.scale(0.93, 1, 1.03); g.rotateX(-0.46); g.translate(0, 1.612, -0.008); H(g, HAIR); }
  const spike = (x, y, z, len, r, ax, az) => { const g = new THREE.ConeGeometry(r, len, 5); g.translate(0, len * 0.42, 0); g.rotateX(ax); g.rotateZ(az); g.translate(x, y, z); H(g, HAIR); };
  if (hair === 'spiky') {
    const R = rng(7);
    for (let i = 0; i < 13; i++) { const a = i / 13 * Math.PI * 2, up = 0.35 + R() * 0.55, r = 0.085 * Math.cos(up * 0.9); spike(Math.sin(a) * r, 1.63 + 0.075 * Math.sin(up), -0.01 + Math.cos(a) * r * 0.95, 0.085 + R() * 0.05, 0.036, Math.cos(a) * (1.25 - up), -Math.sin(a) * (1.25 - up)); }
    spike(0, 1.705, -0.01, 0.1, 0.04, -0.2, 0);
  }
  if (hair === 'short') for (const s of [-1, 0, 1]) spike(s * 0.045, 1.675, 0.07, 0.06, 0.03, 1.9, -s * 0.5);                      // 이마로 내려온 앞머리
  if (hair === 'long') {
    { const g = tube([V(0, 1.64, -0.07), V(0, 1.5, -0.1), V(0, 1.34, -0.095), V(0, 1.2, -0.08)], t => 0.088 - 0.03 * t * t, 10, true); g.scale(1.18, 1, 0.55); g.translate(0, 0, -0.04); H(smooth(g), HAIR); }
    for (const s of [-1, 1]) H(limb(V(s * 0.085, 1.66, 0.03), V(s * 0.1, 1.42, 0.045), 0.024, 0.012, 6), HAIR);                   // 귀 앞으로 내린 머리
    for (const s of [-1, 0, 1]) spike(s * 0.045, 1.678, 0.068, 0.07, 0.032, 1.95, -s * 0.5);
  }
  if (hair === 'bun') { H(ball(V(0, 1.715, -0.07), 0.05, 0.046, 0.05, 10, 7), HAIR); H(limb(V(-0.06, 1.74, -0.05), V(0.07, 1.7, -0.09), 0.006, 0.006, 5), DARK); for (const s of [-1, 1]) spike(s * 0.04, 1.675, 0.07, 0.06, 0.03, 1.9, -s * 0.6); }
  if (hair === 'tail') { H(tube([V(0, 1.69, -0.085), V(0, 1.64, -0.17), V(0, 1.5, -0.2), V(0, 1.36, -0.17)], t => 0.036 - 0.024 * t, 7, true), HAIR); for (const s of [-1, 1]) H(limb(V(s * 0.082, 1.65, 0.04), V(s * 0.095, 1.5, 0.05), 0.02, 0.008, 6), HAIR); }
  if (hair === 'knot') { H(limb(V(0, 1.7, -0.045), V(0, 1.775, -0.06), 0.03, 0.036, 8), HAIR); H(barrel([0, 0.02], [0.034, 0.034], 1, 1, 8).translate(0, 1.722, -0.05), ACC); }
  if (kind === 'ninja') {   // 이마 보호대: 쇠판을 단 띠와, 뒤로 늘어진 두 가닥
    { const g = new THREE.TorusGeometry(0.1, 0.0165, 6, 18); g.rotateX(Math.PI / 2); g.scale(0.93, 1, 1.02); g.rotateX(-0.1); g.translate(0, 1.652, -0.002); H(g, BAND); }
    { const g = box(0.086, 0.042, 0.013, 0, 1.662, 0.1185); H(g, METAL); }   // 쇠판은 띠 바깥에 덧댄다
    for (const s of [-1, 1]) H(tube([V(s * 0.012, 1.645, -0.1), V(s * 0.03, 1.59, -0.135), V(s * 0.045, 1.5, -0.125)], 0.011, 4, true), BAND);
  }
  // 아이는 몸에 견주어 머리가 크다
  const hs = child ? 1.42 : 1.13, hm = new THREE.Matrix4().makeTranslation(0, HEAD0, 0).multiply(new THREE.Matrix4().makeScale(hs, hs, hs)).multiply(new THREE.Matrix4().makeTranslation(0, -HEAD0, 0));
  for (const [g, slot] of head) add(g, 0, slot, null, null, hm);

  /* 팔과 다리(왼쪽 = +x) */
  for (const s of [1, -1]) {
    const up = s > 0 ? 1 : 3, lo = up + 1, th = s > 0 ? 5 : 7, sh = th + 1;
    const S = V(s * 0.178, 1.385, 0), E = V(s * 0.2, 1.12, -0.005), Wr = V(s * 0.205, 0.872, 0.012), Hp = V(s * 0.082, 0.93, 0), K = V(s * 0.088, 0.5, 0.004), A = V(s * 0.088, 0.085, 0);
    add(ball(S, 0.05, 0.05, 0.05, 9, 6), up, TOP, S);
    add(limb(S, E, 0.05, 0.041), up, TOP, S);
    add(limb(E, Wr, 0.039, 0.03), lo, sleeves ? TOP : SKIN, S, E);
    add(ball(V(s * 0.207, 0.826, 0.018), 0.025, 0.046, 0.034, 8, 6), lo, SKIN, S, E);
    add(limb(Hp, K, 0.08, 0.056), th, skirt === 2 ? SKIN : BOT, Hp);
    add(limb(K, A, 0.053, 0.037), sh, skirt || child ? SKIN : BOT, Hp, K);
    { const g = new THREE.SphereGeometry(1, 10, 7); g.scale(0.046, 0.04, 0.115); g.translate(s * 0.088, 0.04, 0.042); add(g, sh, SHOE, Hp, K); }
    if (kind === 'ninja') {
      add(barrel([0, 0.13], [0.047, 0.04], 1, 1, 8).translate(s * 0.088, 0.1, 0), sh, DARK, Hp, K);                              // 발목 감개
      if (s < 0) { add(barrel([0, 0.06], [0.071, 0.068], 1, 1, 8).translate(Hp.x + 0.003, 0.7, 0), th, 7, Hp); add(box(0.045, 0.1, 0.06, s * 0.158, 0.69, 0.0), th, DARK, Hp); }   // 오른 허벅지의 붕대와 쿠나이 집
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aPS', new THREE.Float32BufferAttribute(PS, 2)); g.setAttribute('aJ0', new THREE.Float32BufferAttribute(J0, 3)); g.setAttribute('aJ1', new THREE.Float32BufferAttribute(J1, 3));
  return g;
}

/* ---------- 걷는 동작(그래픽 카드에서) ----------
   iAnim = (걸음의 때, 걸음의 크기 0~1, 손짓 0~1). 다리는 엉덩이에서 앞뒤로 흔들리고 무릎은 발을 내디딜 때 굽는다. 팔은 같은 쪽 다리와 엇갈려 흔들린다. */
const HEAD = /* glsl */`
attribute vec2 aPS; attribute vec3 aJ0, aJ1, iAnim, iColA, iColB;
uniform float uFace;
vec3 pplRx(vec3 v, float a){ float c = cos(a), s = sin(a); return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c); }
vec3 pplRz(vec3 v, float a){ float c = cos(a), s = sin(a); return vec3(v.x * c - v.y * s, v.x * s + v.y * c, v.z); }
vec3 pplCol(float f){ return pow(vec3(floor(f / 65536.0), mod(floor(f / 256.0), 256.0), mod(f, 256.0)) / 255.0, vec3(2.2)); }
// 마디를 돌린다. w = 1이면 자리(관절을 축으로 돈다), 0이면 방향(법선)
vec3 pplPose(vec3 v, float w){
  float part = aPS.x, amp = iAnim.y, ges = iAnim.z;
  if (part > 0.5) {
    bool arm = part < 4.5, right = (part > 2.5 && part < 4.5) || part > 6.5, lower = mod(part, 2.0) < 0.5;
    float f = iAnim.x + (right ? 3.14159265 : 0.0), a0, a1, az = 0.0;
    if (arm) { a0 = 0.5 * amp * sin(f); a1 = -(0.16 + amp * (0.3 + 0.2 * sin(f))); az = right ? -0.03 : 0.03; if (right) { a0 -= 1.05 * ges; a1 -= 1.25 * ges; } }
    else { a0 = -0.55 * amp * sin(f); a1 = amp * (0.1 + 0.8 * max(0.0, cos(f))); }
    if (lower) v = aJ1 * w + pplRx(v - aJ1 * w, a1);
    v = aJ0 * w + pplRz(pplRx(v - aJ0 * w, a0), az);
  }
  v = pplRx(v, 0.045 * amp);                                   // 걸을 때 몸이 조금 앞으로 쏠린다
  v.y += w * 0.022 * amp * cos(2.0 * iAnim.x);                 // 걸음마다 오르내린다
  return v;
}`;
const POSE_POS = /* glsl */`
  transformed = pplPose(transformed, 1.0);
  if (aPS.y > 9.5 && uFace < 0.5) transformed = vec3(0.0);     // 얼굴을 껐으면 눈·눈썹·입을 접어 숨긴다`;

function makeMaterials() {
  const extra = sh => {
    sh.uniforms.uFace = PEOPLE.uFace;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + HEAD + '\nvarying vec3 vPCol;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = pplPose(objectNormal, 0.0);')
      .replace('#include <begin_vertex>', `#include <begin_vertex>${POSE_POS}
        { float sl = aPS.y;
          vPCol = sl < 0.5 ? pplCol(iColA.x) : sl < 1.5 ? pplCol(iColA.y) : sl < 2.5 ? pplCol(iColA.z) : sl < 3.5 ? pplCol(iColB.x) : sl < 4.5 ? pplCol(iColB.z) : sl < 5.5 ? pplCol(iColB.y)
            : sl < 6.5 ? vec3(0.03, 0.028, 0.035) : sl < 7.5 ? vec3(0.85, 0.83, 0.78) : sl < 8.5 ? pplCol(12106178.0) : sl < 9.5 ? pplCol(3356229.0) : sl < 10.5 ? vec3(0.02, 0.015, 0.015) : vec3(0.95); }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vPCol;').replace('#include <color_fragment>', `#include <color_fragment>
        // 만화 화풍은 색을 진하게 올리는데, 옷과 살빛은 정한 빛깔 그대로 나오게 미리 그만큼 뺀다
        { vec3 pc = vPCol; if (uToon > 0.5) pc = mix(vec3(dot(pc, vec3(0.3, 0.59, 0.11))), pc, 1.0 / 1.36); diffuseColor.rgb *= pc; }`);
  };
  extra.key = 'people';
  const body = weatherize(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0 }), { extra });
  // 그림자: 마을의 그림자 지도는 가끔만 다시 그리므로(성능), 움직이는 사람은 거기에 드리우지 않고 발밑에 둥근 그늘을 깐다(먹선 가림값은 건드리지 않게 섞는다)
  const blob = new THREE.MeshBasicMaterial({ color: 0x0a0c14, transparent: true, opacity: 0.42, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });
  return { body, blob };
}

/* ---------- 생김새와 빛깔 ---------- */
const LOOKS = [
  { name: '아저씨', n: 15, geo: { kind: 'man', hair: 'short' }, tops: [0xb9a67c, 0x6f8a6a, 0x8a5a4a, 0x5d7f95, 0xa9a39a, 0xc59a4a], bots: [0x4a4a52, 0x5a4a3a, 0x3d4a5a, 0x6a6452], shoes: [0x3a3028, 0x2a2a30], accs: [0x3a3028, 0x6a4a2a, 0x2f3a4a] },
  { name: '상투 튼 아저씨', n: 10, geo: { kind: 'man', hair: 'knot', sleeves: true, apron: true }, tops: [0x4f6a7a, 0x7a6a4f, 0x8a8478, 0x5a6f55], bots: [0x3a3a40, 0x4f4336], shoes: [0x3a3028], accs: [0xe6dcc4, 0xb8a888, 0x9a4a3a] },
  { name: '긴 머리 아주머니', n: 13, geo: { kind: 'woman', hair: 'long', skirt: 2, sleeves: true }, tops: [0xc98a9a, 0x8aa7b8, 0xb9a0c8, 0xd8b06a, 0x8fb39a, 0xc66a5a], bots: [0x4a4a52], shoes: [0x6a4a3a, 0x3a3028], accs: [0xf0e6d0, 0x7a3a4a, 0x3d5a6a, 0xd8c070] },
  { name: '쪽 찐 아주머니', n: 11, geo: { kind: 'woman', hair: 'bun', skirt: 1, apron: true }, tops: [0xe0d6c0, 0xa8c0a0, 0xd6a8a0, 0x9ab0c8], bots: [0x6a4f5a, 0x4f5f6a, 0x7a6a4a, 0x5a6a50], shoes: [0x6a4a3a], accs: [0xf2ecdc, 0xd8c8a8] },
  { name: '아이', n: 9, s: 0.6, geo: { kind: 'man', hair: 'spiky', child: true }, tops: [0xe08a3a, 0x5a9ac0, 0x8ab85a, 0xd86a6a, 0xe6d060], bots: [0x4a5a7a, 0x5a5a5a, 0x6a5a3a], shoes: [0x3d4a6a, 0x3a3028], accs: [0xf0f0e8, 0x3a3a40] },
  { name: '닌자', n: 10, ninja: true, geo: { kind: 'ninja', hair: 'spiky', sleeves: true }, tops: [0x30364d], bots: [0x30364d], shoes: [0x30364d], accs: [0x798274] },
  { name: '여자 닌자', n: 6, ninja: true, geo: { kind: 'ninja', hair: 'tail', sleeves: true }, tops: [0x30364d], bots: [0x30364d], shoes: [0x30364d], accs: [0x798274] },
];
// 볕이 세서 밝은 살빛은 하얗게 날아간다: 살빛은 조금 짙게 잡는다
const SKINS = [0xdba377, 0xd0976a, 0xc4895c, 0xe0ad84, 0xb07a50], HAIRS = [0x1c1a1c, 0x1c1a1c, 0x2e221a, 0x4a3324, 0x6b4a2c, 0x8a8a8c, 0xc9a24a, 0x7a3020];

export async function build(scene, ctx) {
  const MB = ctx.mobile, R = rng(20261010), M = makeMaterials(), cam = ctx.camera;
  const pick = a => a[Math.floor(R() * a.length)];
  const people = [], meshes = [];
  for (const L of LOOKS) {
    const n = Math.max(2, Math.round(L.n * (MB ? 0.45 : 1))), g = bodyGeometry(L.geo);
    const anim = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3), colA = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3), colB = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    anim.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iAnim', anim); g.setAttribute('iColA', colA); g.setAttribute('iColB', colB);
    const im = new THREE.InstancedMesh(g, M.body, n);
    im.castShadow = false; im.receiveShadow = true; im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(im); meshes.push(im);
    for (let i = 0; i < n; i++) people.push({ L, im, i, anim, colA, colB, x: 0, y: 0, z: 0, yaw: 0, want: 0, on: false, stand: false, mate: null, ph: R() * 6.28, amp: 0, ges: 0, sp: 1.2, s: 1, t: R(), seed: R() * 100 });
  }
  const shade = new THREE.InstancedMesh(new THREE.CircleGeometry(0.36, 18).rotateX(-Math.PI / 2), M.blob, people.length);
  shade.frustumCulled = false; shade.instanceMatrix.setUsage(THREE.DynamicDrawUsage); shade.renderOrder = 2; scene.add(shade); meshes.push(shade);
  people.forEach((p, k) => { p.k = k; });
  // 섞어 놓고, 앞의 몇 쌍은 길가에 마주 서서 이야기하는 사람들로 삼는다(아이·닌자도 섞인다)
  for (let i = people.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [people[i], people[j]] = [people[j], people[i]]; }
  const PAIRS = MB ? 3 : 8;
  for (let k = 0; k < PAIRS; k++) { const a = people[k * 2], b = people[k * 2 + 1]; a.stand = b.stand = true; a.mate = b; b.mate = a; }

  // 사람이 설 수 있는 자리인가: 담 안의 길 위, 물 아닌 곳, 무엇에도 막히지 않은 곳
  const near = [];
  const free = (x, z) => {
    if (!isRoad(x, z) || Math.hypot(x - WALL.cx, z - WALL.cz) > WALL.r - 6 || terrainH(x, z) < -0.05) return false;
    const N = nearAll(x, z, 0.35, near);
    for (let i = 0; i < N.length; i += 4) { const c = N[i], lx = N[i + 1], lz = N[i + 2]; if (lx > c[0] - 0.3 && lx < c[3] + 0.3 && lz > c[2] - 0.3 && lz < c[5] + 0.3 && c[1] < 1.5 && c[4] > 0.25) return false; }
    return true;
  };
  const dress = p => {
    const L = p.L, hex = (a, b, c) => { const o = p.i * 3; a.array[o] = b[0]; a.array[o + 1] = b[1]; a.array[o + 2] = b[2]; a.needsUpdate = true; };
    const hair = L.ninja && R() < 0.5 ? pick(HAIRS.slice(0, 5)) : pick(HAIRS);
    hex(p.colA, [pick(SKINS), hair, pick(L.tops)]); hex(p.colB, [pick(L.bots), pick(L.accs), pick(L.shoes)]);
    p.s = (L.s || 1) * (0.94 + R() * 0.12) * (L.geo.kind === 'woman' ? 0.95 : 1);
    p.sp = (L.s ? 1.05 : L.ninja ? 1.45 : 1.15) + R() * 0.3;
  };
  const OUT = 135, IN0 = 45, IN1 = 115;
  // 걷는 사람 둘레의 길 위 한 자리를 찾는다(첫 배치 때는 가까이에도 세운다)
  const spot = (cx, cz, r0, r1) => { for (let k = 0; k < 8; k++) { const a = R() * 6.283, d = r0 + R() * (r1 - r0), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d; if (free(x, z)) return [x, z]; } return null; };
  const place = (p, x, z, yaw) => { p.x = x; p.z = z; p.y = Math.max(0, terrainH(x, z)); p.yaw = p.want = yaw; p.on = true; p.amp = 0; dress(p); };
  const spawn = (p, cx, cz, first) => {
    const s = spot(cx, cz, first ? 8 : IN0, IN1); if (!s) return;
    if (!p.stand) { place(p, s[0], s[1], R() * 6.283); return; }
    if (p.mate.on) return;                                             // 짝은 함께 세운다
    // 이야기하는 두 사람은 길가에: 길 가장자리 쪽으로 붙을 수 있는 자리만 고른다
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * 6.283; if (isRoad(s[0] + Math.cos(a) * 3.2, s[1] + Math.sin(a) * 3.2)) continue;
      const ex = s[0] + Math.cos(a) * 1.4, ez = s[1] + Math.sin(a) * 1.4, tx = -Math.sin(a), tz = Math.cos(a);
      const ax = ex + tx * 0.48, az = ez + tz * 0.48, bx = ex - tx * 0.48, bz = ez - tz * 0.48;
      if (!free(ax, az) || !free(bx, bz)) continue;
      place(p, ax, az, Math.atan2(bx - ax, bz - az)); place(p.mate, bx, bz, Math.atan2(ax - bx, az - bz)); return;
    }
  };
  // 확인용: 생김새를 한 줄로 세워 본다(&pplrow=1). 앞줄은 서 있고 뒷줄은 제자리에서 걷는다
  const row = ctx.pplRow && ctx.shotAt;
  if (row) { const seen = new Map(); for (const p of people) { const k = seen.get(p.L) || 0; if (k > 1) continue; seen.set(p.L, k + 1); const i = LOOKS.indexOf(p.L); place(p, ctx.shotAt.x + (i - 3) * 0.95, ctx.shotAt.z - 3.2 - k * 1.6, 0); p.rowWalk = k === 1; p.stand = true; p.mate = null; if (!k && i % 2) p.rowGes = true; } }

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = V(0, 1, 0), sc = new THREE.Vector3(), pos = new THREE.Vector3(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  let first = true, lastT = 0, logT = 0;
  const tick = (t, step, at = cam.position) => {
    const dt = Math.min(0.1, Math.max(0, step ?? t - lastT)); lastT = t;
    const cx = at.x, cz = at.z;
    if (!row) {
      let budget = first ? 1e9 : 3;                                   // 한 장면에 몇 사람씩만 새로 세운다
      for (const p of people) {
        if (p.on && Math.hypot(p.x - cx, p.z - cz) > OUT) { p.on = false; if (p.mate) p.mate.on = false; }
        if (!p.on && budget-- > 0) spawn(p, cx, cz, first);
      }
      first = false;
      if (ctx.pplLog && (logT -= dt) < 0) { logT = 1; const on = people.filter(p => p.on); console.log('PEOPLE on ' + on.length + '/' + people.length + ' near30 ' + on.filter(p => Math.hypot(p.x - cx, p.z - cz) < 30).length + ' walkers moving ' + on.filter(p => !p.stand && p.amp > 0.5).length); }
    }
    for (const p of people) {
      if (!p.on) continue;
      if (p.stand) {   // 서서 이야기: 번갈아 손짓을 하고 몸을 조금씩 튼다
        if (row) { p.amp = p.rowWalk ? 1 : 0; if (p.rowWalk) p.ph += dt * 4.2; p.ges = p.rowGes ? 1 : 0; continue; }
        const k = Math.sin(t * 0.55 + p.seed); p.ges += ((k > 0.55 ? 1 : 0) - p.ges) * Math.min(1, dt * 3.5);
        p.yaw = p.want + 0.12 * Math.sin(t * 0.4 + p.seed * 3.1); p.amp = 0;
        continue;
      }
      // 걷기: 가끔 앞을 살펴, 길이 끊기거나 막히면 열린 쪽으로 돌고, 길가에 너무 붙으면 길 안쪽으로 조금 튼다
      p.t -= dt;
      if (p.t <= 0) {
        p.t = 0.3 + R() * 0.25;
        const ok = (a, d) => free(p.x + Math.sin(a) * d, p.z + Math.cos(a) * d);
        if (!ok(p.want, 1.4) || !ok(p.want, 3)) {
          const sgn = R() < 0.5 ? 1 : -1; let found = false;
          for (const da of [0.6, -0.6, 1.2, -1.2, 1.9, -1.9, 2.6, -2.6, Math.PI]) if (ok(p.want + da * sgn, 1.4) && ok(p.want + da * sgn, 3)) { p.want += da * sgn; found = true; break; }
          if (!found) p.want += Math.PI * (0.6 + R() * 0.8);
        } else {
          const l = ok(p.want + 0.7, 3.4), r = ok(p.want - 0.7, 3.4);
          if (l && !r) p.want += 0.28; else if (r && !l) p.want -= 0.28; else if (R() < 0.06) p.want += (R() - 0.5) * 0.9;
        }
      }
      let d = p.want - p.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); p.yaw += Math.max(-2.6 * dt, Math.min(2.6 * dt, d));
      // 걷는 이(화면을 보는 나)가 바로 앞에 있으면 멈춰 선다
      const px = cx - p.x, pz = cz - p.z, pd = Math.hypot(px, pz), ahead = pd < 1.5 && at.y - p.y < 3 && (px * Math.sin(p.yaw) + pz * Math.cos(p.yaw)) > 0.2 * pd;
      const go = ahead || Math.abs(d) > 1.6 ? 0 : 1;
      p.amp += (go - p.amp) * Math.min(1, dt * 5);
      const v = p.sp * p.amp * dt, nx = p.x + Math.sin(p.yaw) * v, nz = p.z + Math.cos(p.yaw) * v;
      if (free(nx, nz)) { p.x = nx; p.z = nz; p.ph += v * 3.34 / p.s * (p.L.geo.skirt === 2 ? 1.25 : 1); } else p.t = 0;
      p.y = Math.max(0, terrainH(p.x, p.z));
    }
    // 서로 겹치지 않게 살짝 밀어낸다(걷는 사람끼리만 움직이고, 서 있는 사람은 버틴다)
    if (!row) for (let i = 0; i < people.length; i++) { const a = people[i]; if (!a.on) continue; for (let j = i + 1; j < people.length; j++) { const b = people[j]; if (!b.on || (a.stand && b.stand)) continue; const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz; if (d2 > 0.42 || d2 < 1e-6) continue; const d = Math.sqrt(d2), k = (0.65 - d) / d * 0.5, wa = a.stand ? 0 : b.stand ? 2 : 1, wb = b.stand ? 0 : a.stand ? 2 : 1; a.x -= dx * k * wa; a.z -= dz * k * wa; b.x += dx * k * wb; b.z += dz * k * wb; } }
    for (const p of people) {
      if (!p.on) { p.im.setMatrixAt(p.i, ZERO); shade.setMatrixAt(p.k, ZERO); continue; }
      q.setFromAxisAngle(up, p.yaw); m4.compose(pos.set(p.x, p.y, p.z), q, sc.setScalar(p.s)); p.im.setMatrixAt(p.i, m4);
      m4.compose(pos.set(p.x, p.y + 0.03, p.z), q, sc.set(p.s, 1, p.s * 0.8)); shade.setMatrixAt(p.k, m4);
      const o = p.i * 3, a = p.anim.array; a[o] = p.ph; a[o + 1] = p.amp * (p.L.geo.skirt === 2 ? 0.55 : p.L.geo.skirt ? 0.8 : 1); a[o + 2] = p.ges;
    }
    for (const im of meshes) { im.instanceMatrix.needsUpdate = true; if (im !== shade) im.geometry.attributes.iAnim.needsUpdate = true; }
  };
  if (row) tick(0);
  // 확인용(&pplwarm=초): 찍을 자리 둘레에서 그만큼 미리 걸려 놓는다(화면 찍기는 몇 장면만 돌기 때문에 걷는 모습을 볼 수 없다)
  if (ctx.pplWarm && ctx.shotAt) for (let i = 0; i < ctx.pplWarm * 30; i++) tick(i / 30, 1 / 30, ctx.shotAt);
  return { tick, skip: meshes };
}
