// 마을 — 땅과 길, 호카게 바위, 담과 정문, 거리의 집들, 나무.
import * as THREE from '../vendor/three.module.js';
import { Builder, addCollider, mat4, rng, tube, wall, stairs } from './build.js';
import { mat, M, weatherize } from './materials.js';
import { LOT, ROADS, CLIFF, WALL } from './layout.js';

/* ---------- 땅 높이 ---------- */
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const h = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return (h(ix, iz) * (1 - u) + h(ix + 1, iz) * u) * (1 - v) + (h(ix, iz + 1) * (1 - u) + h(ix + 1, iz + 1) * u) * v;
}
// 호카게 바위가 새겨진 산: 앞(남쪽)은 깎아지른 절벽, 양옆은 비탈
export function mountainH(x, z) {
  if (z > CLIFF.z) return 0;
  return CLIFF.top * (1 - sstep(CLIFF.half, CLIFF.half + CLIFF.fall, Math.abs(x)));
}
// 담 밖은 낮은 언덕이 굽이친다(정문 앞길만 평평하다)
function lowH(x, z) {
  const r = Math.hypot(x - WALL.cx, z - WALL.cz);
  const k = sstep(WALL.r + 6, WALL.r + 70, r) * (z > 0 ? sstep(7, 30, Math.abs(x)) : 1);
  return k * (2 + 7 * vnoise(x * 0.021 + 3.1, z * 0.021 + 7.7) + 2 * vnoise(x * 0.07, z * 0.07));
}
export function terrainH(x, z) { return Math.max(lowH(x, z), mountainH(x, z)); }

/* ---------- 땅 ---------- */
function buildGround(scene) {
  // 길 그림: 위에서 본 마을에 흙길·마당을 칠한다(흰 곳 = 흙, 검은 곳 = 풀)
  const S = 1024, size = 500, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  const px = x => (x - 0) / size * S + S / 2, pz = z => (z + 10) / size * S + S / 2;
  g.fillStyle = '#fff';
  g.filter = 'blur(3px)';
  for (const [x0, z0, x1, z1] of ROADS) g.fillRect(px(x0), pz(z0), px(x1) - px(x0), pz(z1) - pz(z0));
  // 집터 둘레·마당
  for (const L of Object.values(LOT)) g.fillRect(px(L.x0), pz(L.z0), px(L.x1) - px(L.x0), pz(L.z1) - pz(L.z0));
  g.beginPath(); g.arc(px(0), pz(182), 26 / size * S, 0, Math.PI * 2); g.fill();          // 정문 앞마당
  g.fillRect(px(-7), pz(180), px(7) - px(-7), pz(262) - pz(180));                            // 정문 밖 길
  g.fillRect(px(78), pz(-150), px(122) - px(78), pz(-138) - pz(-150));                       // 바위 오르는 계단 밑
  g.fillRect(px(104), pz(-140), px(112) - px(104), pz(-50) - pz(-140));
  const mask = new THREE.CanvasTexture(c);
  mask.flipY = false; mask.colorSpace = THREE.NoColorSpace; mask.anisotropy = 4;

  const grass = mat('grass').map;
  const extra = sh => {
    sh.uniforms.uMask = { value: mask }; sh.uniforms.uGrass = { value: grass };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uMask, uGrass;')
      .replace('#include <map_fragment>', `
        vec2 gUv = vWPos.xz;
        vec4 gDirt = texture2D(map, gUv / 5.0);
        vec4 gGrass = texture2D(uGrass, gUv / 3.0);
        gGrass.rgb = (gGrass.rgb * 0.62 + vec3(0.055, 0.05, 0.02)) * (0.62 + 0.5 * wNoise(gUv * 0.045) + 0.28 * wNoise(gUv * 0.011 + 5.0));
        gGrass.rgb = mix(gGrass.rgb, gGrass.rgb * vec3(1.25, 1.12, 0.7), smoothstep(0.55, 0.8, wNoise(gUv * 0.027 + 11.0)));   // 볕에 바랜 누런 자리
        float gM = texture2D(uMask, (gUv - vec2(0.0, -10.0)) / ${size.toFixed(1)} + 0.5).r;
        gM = smoothstep(0.38, 0.62, gM + (wFbm(gUv * 0.8) - 0.5) * 0.5);
        vec3 gRock = vec3(0.56, 0.50, 0.41) * (0.7 + 0.5 * wFbm(gUv * 0.35));
        vec4 gCol = mix(gGrass, gDirt, gM);
        gCol.rgb = mix(gCol.rgb, gRock, smoothstep(0.82, 0.6, vWNor.y));          // 가파른 비탈은 바위가 드러난다
        diffuseColor *= gCol;`);
  };
  extra.key = 'ground';
  const t = mat('dirt');
  const gm = weatherize(new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughness: 0.96 }), { puddles: true, extra });

  const mk = (x0, z0, x1, z1, step, hf) => {
    const nx = Math.round((x1 - x0) / step), nz = Math.round((z1 - z0) / step), pos = [], idx = [];
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const x = x0 + (x1 - x0) * i / nx, z = z0 + (z1 - z0) * j / nz; pos.push(x, hf(x, z), z); }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, e = d + 1; idx.push(a, d, b, b, d, e); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, gm); m.receiveShadow = true; m.matrixAutoUpdate = false; scene.add(m);
    return m;
  };
  mk(-320, -320, 320, 320, 4, lowH);                                               // 마을 바닥과 담 밖 언덕
  // 산 위. 산자락이 땅과 같은 높이로 겹치면 깜빡이므로, 산이 끝난 자리는 땅 밑으로 내린다
  mk(-200, -320, 200, CLIFF.z, 4, (x, z) => { const m = mountainH(x, Math.min(z, CLIFF.z - 0.01)), l = lowH(x, z); return m > l + 0.3 ? m : l - 1.5; });
}

export async function buildVillage(scene, ctx) {
  buildGround(scene);
  const places = [
    { n: '나뭇잎 마을', t: '불의 나라 숨은 마을. 북쪽 절벽에는 역대 호카게의 얼굴이 새겨져 있다.', b: [-200, 200, -150, 200] },
    { n: '큰길', t: '정문에서 호카게 관저까지 곧게 뻗은 길.', b: [-6, 6, -50, 176] },
  ];
  const jumps = [['정문', 0, 0, 160, 0, 0], ['큰길 한가운데', 0, 0, 30, 0, 1]];
  const out = { places, jumps, skip: [], lights: [], glows: [], ticks: [] };
  // 호카게 바위·거리·숲은 따로 나눠 짓는다(건물 하나만 확인할 때는 건너뛴다)
  if (!ctx.lite) for (const [name, msg] of [['rock', '절벽에 호카게의 얼굴을 새기는 중…'], ['town', '거리에 집을 세우는 중…'], ['flora', '나무를 심는 중…']]) {
    if (ctx.part && ctx.part !== name) continue;
    await ctx.say(msg);
    try {
      const r = await (await import(`./${name}.js`)).build(scene, ctx);
      for (const k of ['places', 'jumps', 'skip', 'lights', 'glows']) out[k].push(...(r[k] || []));
      if (r.tick) out.ticks.push(r.tick);
    } catch (e) { console.error('짓기 실패: ' + name, e); }
  }
  if (out.ticks.length) out.tick = (t, dt) => { for (const f of out.ticks) f(t, dt); };
  return out;
}
