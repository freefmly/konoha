// 재질 — 회벽·나무·기와·돌·흙·풀의 무늬를 그 자리에서 그려 만들고, 모든 재질에 "젖음·물웅덩이·눈 쌓임·바람"을 심는다.
import * as THREE from '../vendor/three.module.js';
import { rng } from './build.js';

/* ---------- 날씨가 재질에 닿는 값(모든 재질이 함께 쓴다) ---------- */
export const W = {
  uSnow: { value: 0 }, uWet: { value: 0 }, uRain: { value: 0 }, uTime: { value: 0 },
  uWind: { value: 0.3 }, uWindDir: { value: new THREE.Vector2(0.8, 0.6) },
  uCover: { value: null }, uCoverRect: { value: new THREE.Vector4(0, 0, 1, 0) },
  uToon: { value: 0 },   // 화풍: 0 실사 · 1 만화
};

/* ---------- 만화 화풍 ----------
   재질을 바꿔 끼우지 않고 같은 재질 안에 "만화로 칠하는 법"을 함께 심어 두고 uToon 값으로 그 자리에서 오간다.
   만화일 때: 빛을 밝은 면/그늘 두 단계로 끊고, 반짝임과 잔 굴곡을 없애고, 무늬를 평평한 색으로 정리한다. 먹선은 toon.js가 긋는다.
   flat = 무늬(나뭇결·돌 이음매)를 평균 색 + 짙은 줄만 남기고 정리, noLine = 먹선을 긋지 않을 것(잎·풀) */
function inkShader(sh, { flat = false, noLine = false } = {}) {
  sh.uniforms.uToon = W.uToon;
  let f = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uToon;')
    .replace('#include <color_fragment>', `#include <color_fragment>
        if (uToon > 0.5) { float kL = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11)); diffuseColor.rgb = max(mix(vec3(kL), diffuseColor.rgb, 1.18), 0.0); }`)
    .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor *= 1.0 - uToon;`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = normalize(mix(normal, nonPerturbedNormal, uToon));`)
    .replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>
        void RE_Direct_Ink(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
          if (uToon < 0.5) { RE_Direct_Physical(directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight); return; }
          float kBand = smoothstep(0.10, 0.16, dot(geometryNormal, directLight.direction));   // 볕 든 면과 그늘의 경계를 칼같이
          reflectedLight.directDiffuse += directLight.color * kBand * 0.8 * BRDF_Lambert(material.diffuseColor);
        }
        #undef RE_Direct
        #define RE_Direct RE_Direct_Ink`)
    .replace('#include <opaque_fragment>', `
        if (uToon > 0.5) outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse * 1.3 + totalEmissiveRadiance;
        #include <opaque_fragment>`);
  if (flat) f = f.replace('#include <map_fragment>', `
        #ifdef USE_MAP
          vec4 sampledDiffuseColor = texture2D(map, vMapUv);
          if (uToon > 0.5) {
            vec3 kAvg = texture2D(map, vMapUv, 12.0).rgb;   // 가장 뭉갠 단계 = 무늬 전체의 평균 색
            float kR = dot(sampledDiffuseColor.rgb, vec3(0.3, 0.59, 0.11)) / max(dot(kAvg, vec3(0.3, 0.59, 0.11)), 0.01);
            sampledDiffuseColor.rgb = mix(kAvg, sampledDiffuseColor.rgb, 0.16) * mix(0.7, 1.0, smoothstep(0.6, 0.8, kR));
          }
          diffuseColor *= sampledDiffuseColor;
        #endif`);
  if (noLine) f = f.replace('#include <dithering_fragment>', `#include <dithering_fragment>
        gl_FragColor.a = 1.0 - uToon;`);
  sh.fragmentShader = f;
}
// 날씨를 심지 않는 재질(유리·물·빛나는 간판)에 화풍만 심는다
export function toonize(mat, opts = {}) {
  mat.onBeforeCompile = sh => inkShader(sh, opts);
  mat.customProgramCacheKey = () => 'ink' + (opts.flat ? 'f' : '') + (opts.noLine ? 'n' : '');
  return mat;
}

const FRAG_HEAD = /* glsl */`
uniform float uSnow, uWet, uRain, uTime;
uniform sampler2D uCover;
uniform vec4 uCoverRect;
varying vec3 vWPos;
varying vec3 vWNor;
float wHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(wHash(i), wHash(i+vec2(1,0)), f.x), mix(wHash(i+vec2(0,1)), wHash(i+vec2(1,1)), f.x), f.y); }
float wFbm(vec2 p){ return wNoise(p)*0.5 + wNoise(p*2.13+7.0)*0.3 + wNoise(p*4.7+13.0)*0.2; }
// 빗방울이 웅덩이에 떨어져 퍼지는 동심원
vec2 wRipple(vec2 p, float t){
  vec2 acc = vec2(0.0);
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    vec2 q = p * (1.7 + fk * 0.8) + fk * 17.3;
    vec2 c = floor(q), f = fract(q);
    float h = wHash(c + fk * 3.1);
    vec2 ctr = vec2(0.3 + 0.4 * wHash(c + 1.7), 0.3 + 0.4 * wHash(c + 5.3));
    float tt = fract(t * (0.75 + 0.5 * h) + h * 7.0);
    vec2 d = f - ctr; float r = length(d);
    float ring = sin((r - tt * 0.42) * 60.0) * smoothstep(0.055, 0.0, abs(r - tt * 0.42)) * (1.0 - tt);
    acc += d / max(r, 0.001) * ring;
  }
  return acc * 0.3;
}
`;

// 바람에 흔들리는 방식: tree = 나무 전체가 휘고 잎이 떤다, cloth = 위가 매달린 천(포렴·깃발)이 나부낀다
const SWAY = {
  tree: /* glsl */`
    {
      vec3 swO = vec3(0.0);
      #ifdef USE_INSTANCING
        swO = instanceMatrix[3].xyz;
      #endif
      float swH = smoothstep(0.6, 9.0, transformed.y);
      float swP = uTime * 1.1 + swO.x * 0.13 + swO.z * 0.17;
      float swG = uWind * (0.55 + 0.45 * sin(uTime * 0.31 + swO.x * 0.02 + swO.z * 0.03));
      transformed.xz += uWindDir * swH * swG * (0.22 + 0.16 * sin(swP));
      #ifdef W_LEAF
        vec3 swQ = transformed * 2.3 + swO;
        transformed += vec3(sin(uTime * 3.1 + swQ.y * 1.7 + swQ.z), sin(uTime * 2.3 + swQ.x * 1.3) * 0.6, sin(uTime * 2.7 + swQ.x + swQ.y * 1.1)) * (0.012 + 0.07 * swG);
      #endif
    }`,
  cloth: /* glsl */`
    {
      vec3 swW = (modelMatrix * vec4(transformed, 1.0)).xyz;
      float swK = pow(1.0 - uv.y, 1.4);
      float swG = 0.05 + uWind * (0.6 + 0.4 * sin(uTime * 0.31 + swW.x * 0.02));
      transformed += objectNormal * swK * swG * 0.55 * (sin(uTime * 2.6 + swW.x * 2.1 + swW.z * 2.3 + uv.x * 5.0) + 0.5 * sin(uTime * 4.3 + uv.x * 11.0) + 0.6);
    }`,
};

// 재질에 날씨 반응을 심는다. puddles=true면 평평한 곳에 빗물이 고인다. sway는 'tree' | 'leaf' | 'cloth'.
export function weatherize(mat, { puddles = false, sway = null, extra = null, flat = false, noLine = false } = {}) {
  mat.defines = Object.assign(mat.defines || {}, puddles ? { W_PUDDLE: '' } : {}, sway === 'leaf' ? { W_LEAF: '' } : {});
  const swayCode = sway ? SWAY[sway === 'leaf' ? 'tree' : sway] : '';
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, W);
    inkShader(sh, { flat, noLine });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime, uWind; uniform vec2 uWindDir;\nvarying vec3 vWPos;\nvarying vec3 vWNor;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        ${swayCode}
        vec4 wxp = vec4(transformed, 1.0); vec3 wxn = objectNormal;
        #ifdef USE_INSTANCING
          wxp = instanceMatrix * wxp; wxn = mat3(instanceMatrix) * wxn;
        #endif
        vWPos = (modelMatrix * wxp).xyz; vWNor = normalize(mat3(modelMatrix) * wxn);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_HEAD)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // 하늘이 보이는 자리인가: 위에서 내려다본 높이 지도와 견준다(벽면은 바깥쪽으로 조금 나가서 잰다)
        vec2 wUv = (vWPos.xz + vWNor.xz * 0.4 - uCoverRect.xy) / uCoverRect.z + 0.5;
        wUv.y = 1.0 - wUv.y;
        float wExpo = 1.0;
        if (wUv.x > 0.0 && wUv.x < 1.0 && wUv.y > 0.0 && wUv.y < 1.0)
          wExpo = smoothstep(-0.9, -0.3, vWPos.y - texture2D(uCover, wUv).r);
        float wNy = vWNor.y;
        #ifdef DOUBLE_SIDED
          wNy = abs(wNy);
        #endif
        float wUp = smoothstep(0.3, 0.75, wNy);
        // 얕게 쌓인 눈: 다 쌓여도 얇은 데는 밑바닥이 비친다
        float wSnow = wExpo * wUp * smoothstep(0.05, 0.55, uSnow * 1.02 - wFbm(vWPos.xz * 0.9) * 0.9 - (1.0 - wUp) * 0.4);
        wSnow = mix(wSnow, smoothstep(0.42, 0.5, wSnow), uToon);   // 만화: 눈 덮인 자리와 맨바닥의 경계가 또렷하다
        float wWetF = wExpo * uWet * mix(0.5, 1.0, wUp) * (1.0 - wSnow);
        float wPud = 0.0;
        #ifdef W_PUDDLE
          float wTh = mix(1.05, 0.5, uWet);
          wPud = wExpo * smoothstep(0.985, 1.0, wNy) * smoothstep(wTh, wTh + 0.06, wFbm(vWPos.xz * 0.23 + 31.0)) * (1.0 - wSnow);
        #endif
        diffuseColor.rgb *= mix(1.0, 0.6, wWetF);
        diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.03, 0.035, 0.04), vec3(0.26, 0.33, 0.42), uToon), wPud * 0.9);   // 만화: 웅덩이는 반사 대신 하늘빛으로 칠한다
        diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.78, 0.84, 0.93), vec3(0.95, 0.97, 1.0), wFbm(vWPos.xz * 0.31 + 9.0)) * (0.94 + 0.06 * wNoise(vWPos.xz * 9.0)), wSnow);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, roughnessFactor * 0.45, wWetF);
        roughnessFactor = mix(roughnessFactor, 0.03, wPud);
        roughnessFactor = mix(roughnessFactor, 0.88, wSnow);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor *= (1.0 - wSnow) * (1.0 - wPud);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        #ifdef W_PUDDLE
          if (wPud > 0.01) {
            vec2 wR = wRipple(vWPos.xz, uTime) * uRain;
            vec3 wFlat = normalize((viewMatrix * vec4(normalize(vec3(wR.x, 1.0, wR.y)), 0.0)).xyz);
            normal = normalize(mix(normal, wFlat, wPud));
          }
        #endif
        if (wSnow > 0.01) {
          vec3 wSn = normalize((viewMatrix * vec4(vWNor, 0.0)).xyz) * faceDirection;
          normal = normalize(mix(normal, wSn, wSnow * 0.85));
        }`);
    if (extra) extra(sh);
  };
  mat.customProgramCacheKey = () => (puddles ? 'p' : '') + (sway || '') + (extra ? extra.key || 'x' : '') + (flat ? 'f' : '') + (noLine ? 'n' : '');
  return mat;
}

/* ---------- 그려서 만드는 무늬 ---------- */
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const ctx2 = c => c.getContext('2d', { willReadFrequently: true });

// 이어 붙여도 티 안 나는 잡음(0~1)
function tileNoise(size, cells, seed) {
  const R = rng(seed), lat = new Float32Array(cells * cells);
  for (let i = 0; i < lat.length; i++) lat[i] = R();
  return (x, y) => {
    const fx = x / size * cells, fy = y / size * cells;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    let tx = fx - ix, ty = fy - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const a = lat[(ix % cells) + (iy % cells) * cells], b = lat[((ix + 1) % cells) + (iy % cells) * cells];
    const c = lat[(ix % cells) + ((iy + 1) % cells) * cells], d = lat[((ix + 1) % cells) + ((iy + 1) % cells) * cells];
    return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
  };
}
function fbmNoise(size, base, seed) {
  const n1 = tileNoise(size, base, seed), n2 = tileNoise(size, base * 2, seed + 1), n3 = tileNoise(size, base * 4, seed + 2), n4 = tileNoise(size, base * 8, seed + 3);
  return (x, y) => n1(x, y) * 0.5 + n2(x, y) * 0.25 + n3(x, y) * 0.15 + n4(x, y) * 0.1;
}

// 높낮이 그림 → 법선 무늬
function normalFromHeight(hc, strength) {
  const w = hc.width, h = hc.height, src = ctx2(hc).getImageData(0, 0, w, h).data;
  const out = mk(w, h), ctx = out.getContext('2d'), img = ctx.createImageData(w, h), o = img.data;
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const l = 1 / Math.sqrt(dx * dx + dy * dy + 1), i = (y * w + x) * 4;
    o[i] = (-dx * l * 0.5 + 0.5) * 255; o[i + 1] = (dy * l * 0.5 + 0.5) * 255; o[i + 2] = (l * 0.5 + 0.5) * 255; o[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

function tex(canvas, meters, srgb = true, aniso = 8) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / meters[0], 1 / meters[1]);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  return t;
}

// 픽셀마다 밝기(0~1)와 높이(0~1)를 정하는 함수로 무늬 한 쌍(색·법선)을 만든다. 색은 흰빛에 가깝게 두고 재질 색으로 물들인다.
function pairTex(size, fn, meters, bump) {
  const c = mk(size, size), hc = mk(size, size), g = ctx2(c), hg = ctx2(hc);
  const img = g.createImageData(size, size), d = img.data, himg = hg.createImageData(size, size), hd = himg.data;
  const out = [0, 0, 0, 0];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    fn(x, y, out);
    const i = (y * size + x) * 4;
    d[i] = Math.max(0, Math.min(255, out[0] * 255)); d[i + 1] = Math.max(0, Math.min(255, out[1] * 255)); d[i + 2] = Math.max(0, Math.min(255, out[2] * 255)); d[i + 3] = 255;
    hd[i] = hd[i + 1] = hd[i + 2] = Math.max(0, Math.min(255, out[3] * 255)); hd[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); hg.putImageData(himg, 0, 0);
  return { map: tex(c, meters), normalMap: tex(normalFromHeight(hc, bump), meters, false) };
}

const TEX = {}; // 한 번 그린 무늬는 다시 쓴다
const T = {
  // 흙손 자국이 남은 회벽: 얼룩과 빗물 자국
  plaster() {
    const s = 512, n = fbmNoise(s, 5, 11), f = tileNoise(s, 96, 12), st = tileNoise(s, 40, 13);
    return pairTex(s, (x, y, o) => {
      const a = n(x, y), streak = st(x, (y * 0.08) % s);
      const k = 0.86 + 0.14 * a - 0.07 * Math.max(0, streak - 0.6) + 0.04 * (f(x, y) - 0.5);
      o[0] = k; o[1] = k * 0.995; o[2] = k * 0.985; o[3] = 0.5 + 0.3 * a + 0.2 * f(x, y);
    }, [3, 3], 0.9);
  },
  // 세로 나뭇결
  wood() {
    const s = 512, n = fbmNoise(s, 4, 21), gr = tileNoise(s, 64, 22), R = rng(23);
    const planks = 4, pw = s / planks, tint = [], shift = [];
    for (let p = 0; p < planks; p++) { tint.push(0.86 + R() * 0.26); shift.push(R() * s | 0); }
    return pairTex(s, (x, y, o) => {
      const p = Math.floor(x / pw), yy = (y + shift[p]) % s;
      const ring = Math.sin((x / pw * 7 + n(x, yy) * 7) * 2.2) * 0.5 + 0.5, streak = gr((x * 5) % s, (yy * 0.2) % s);
      const k = tint[p] * (0.74 + 0.2 * ring + 0.18 * streak);
      o[0] = k; o[1] = k * 0.97; o[2] = k * 0.93; o[3] = 0.55 + ring * 0.2 + streak * 0.2;
    }, [1.6, 1.6], 1.3);
  },
  // 마룻널·판자벽: 널 사이 이음매가 보인다
  planks() {
    const s = 512, n = fbmNoise(s, 4, 31), gr = tileNoise(s, 64, 32), R = rng(33);
    const planks = 8, pw = s / planks, tint = [], shift = [];
    for (let p = 0; p < planks; p++) { tint.push(0.82 + R() * 0.32); shift.push(R() * s | 0); }
    return pairTex(s, (x, y, o) => {
      const p = Math.floor(x / pw), yy = (y + shift[p]) % s;
      const ring = Math.sin((x / pw * 5 + n(x, yy) * 6) * 2.2) * 0.5 + 0.5, streak = gr((x * 5) % s, (yy * 0.2) % s);
      const edge = Math.min(x - p * pw, (p + 1) * pw - x);
      const butt = Math.abs(((yy + p * 97) % (s / 2)) - 4) < 1.5;            // 널이 끝나고 이어지는 자리
      let k = tint[p] * (0.76 + 0.18 * ring + 0.18 * streak);
      if (edge < 1.6 || butt) k *= 0.45;
      o[0] = k; o[1] = k * 0.97; o[2] = k * 0.93; o[3] = (edge < 2.2 || butt) ? 0.1 : 0.6 + ring * 0.2 + streak * 0.15;
    }, [1.4, 1.4], 1.8);
  },
  // 기와·쇠·콘크리트 같은 매끈한 면의 잔 얼룩
  plain() {
    const s = 256, n = fbmNoise(s, 6, 41), f = tileNoise(s, 80, 42);
    return pairTex(s, (x, y, o) => {
      const k = 0.88 + 0.12 * n(x, y) + 0.05 * (f(x, y) - 0.5);
      o[0] = o[1] = o[2] = k; o[3] = 0.5 + 0.3 * n(x, y) + 0.2 * f(x, y);
    }, [2, 2], 0.6);
  },
  // 다듬은 돌을 쌓은 축대·담
  stone() { return blockTex({ rows: 8, minW: 0.16, maxW: 0.32, seed: 51, meters: [3.2, 3.2], joint: 3, bump: 2.4 }); },
  // 바닥에 깐 판석
  pave() { return blockTex({ rows: 6, minW: 0.14, maxW: 0.26, seed: 61, meters: [4.8, 4.8], joint: 3, bump: 1.6, vary: 0.13 }); },
  // 벽돌
  brick() { return blockTex({ rows: 16, minW: 0.11, maxW: 0.115, seed: 66, meters: [2, 1.6], joint: 2, bump: 1.8, vary: 0.16 }); },
  // 다다미: 골풀을 촘촘히 엮은 결과 천으로 싼 가장자리(한 장 0.9 × 1.8m)
  tatami() {
    const w = 256, h = 512, c = mk(w, h), hc = mk(w, h), g = ctx2(c), hg = ctx2(hc), R = rng(71);
    const img = g.createImageData(w, h), d = img.data, himg = hg.createImageData(w, h), hd = himg.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, weave = ((x >> 1) + (y & 1)) % 2, k = 0.84 + 0.1 * weave + R() * 0.08;
      const border = x < 12 || x >= w - 12;
      if (border) { const b = 0.2 + 0.05 * ((x + y) % 3); d[i] = 60 * b * 4; d[i + 1] = 80 * b * 4; d[i + 2] = 60 * b * 4; }
      else { d[i] = 196 * k; d[i + 1] = 190 * k; d[i + 2] = 128 * k; }
      d[i + 3] = 255;
      const hv = border ? 200 : 120 + weave * 60;
      hd[i] = hd[i + 1] = hd[i + 2] = hv; hd[i + 3] = 255;
    }
    g.putImageData(img, 0, 0); hg.putImageData(himg, 0, 0);
    return { map: tex(c, [0.9, 1.8]), normalMap: tex(normalFromHeight(hc, 1.2), [0.9, 1.8], false) };
  },
  // 맨흙 길: 잔돌이 박힌 다져진 흙
  dirt() {
    const s = 512, n = fbmNoise(s, 6, 81), n2 = fbmNoise(s, 24, 82), peb = tileNoise(s, 90, 83);
    return pairTex(s, (x, y, o) => {
      const a = n(x, y), b = n2(x, y), p = peb(x, y), k = (0.74 + 0.36 * a + 0.14 * (b - 0.5)) * (p > 0.8 ? 1.16 : 1);
      o[0] = 0.80 * k; o[1] = 0.68 * k; o[2] = 0.50 * k; o[3] = 0.42 + a * 0.24 + b * 0.2 + (p > 0.8 ? 0.18 : 0);
    }, [5, 5], 2.2);
  },
  // 풀밭: 짧은 풀잎 결이 여러 방향으로 누워 있다
  grass() {
    const s = 512, c = mk(s, s), hc = mk(s, s), g = ctx2(c), hg = ctx2(hc), R = rng(91);
    g.fillStyle = '#3f6a2a'; g.fillRect(0, 0, s, s); hg.fillStyle = '#404040'; hg.fillRect(0, 0, s, s);
    for (let i = 0; i < 26000; i++) {
      const x = R() * s, y = R() * s, a = -Math.PI / 2 + (R() - 0.5) * 1.6, l = 5 + R() * 9, v = R();
      const col = `rgb(${50 + v * 70 | 0},${96 + v * 76 | 0},${34 + v * 30 | 0})`, hv = 90 + v * 150 | 0;
      for (const ox of [0, s, -s]) for (const oy of [0, s, -s]) {
        if (x + ox < -16 || x + ox > s + 16 || y + oy < -16 || y + oy > s + 16) continue;
        g.strokeStyle = col; g.lineWidth = 1.3; g.beginPath(); g.moveTo(x + ox, y + oy); g.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l); g.stroke();
        hg.strokeStyle = `rgb(${hv},${hv},${hv})`; hg.lineWidth = 1.3; hg.beginPath(); hg.moveTo(x + ox, y + oy); hg.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l); hg.stroke();
      }
    }
    return { map: tex(c, [3, 3]), normalMap: tex(normalFromHeight(hc, 1.5), [3, 3], false) };
  },
  // 바위: 켜켜이 쌓인 결과 드문드문 갈라진 틈
  rock() {
    const s = 1024, n = fbmNoise(s, 4, 101), n2 = fbmNoise(s, 16, 102), cr = tileNoise(s, 7, 103), f = tileNoise(s, 200, 104);
    return pairTex(s, (x, y, o) => {
      const a = n(x, y), b = n2(x, y);
      const strata = Math.sin((y / s * 9 + a * 2.6) * Math.PI * 2) * 0.5 + 0.5;
      const cd = Math.abs(cr(x, y) + 0.1 * (b - 0.5) - 0.5), crack = cd < 0.006 ? 1 - cd / 0.006 : 0;
      const k = 0.8 + 0.18 * a + 0.12 * (b - 0.5) + 0.06 * strata - 0.28 * crack + 0.05 * (f(x, y) - 0.5);
      o[0] = k; o[1] = k * 0.985; o[2] = k * 0.96;
      o[3] = 0.4 + 0.25 * a + 0.2 * b + 0.1 * strata - 0.4 * crack + 0.08 * f(x, y);
    }, [16, 16], 3.0);
  },
  // 나무껍질: 세로로 깊게 갈라진 골
  bark() {
    const s = 512, n = fbmNoise(s, 6, 111), r = tileNoise(s, 22, 112), f = tileNoise(s, 120, 113);
    return pairTex(s, (x, y, o) => {
      const ridge = Math.abs(Math.sin((x / s * 16 + n(x, (y * 0.3) % s) * 2.4) * Math.PI));
      const brk = r(x, (y * 0.35) % s);
      const h = Math.pow(ridge, 0.6) * (0.65 + 0.35 * brk);
      const k = 0.55 + 0.5 * h + 0.08 * (f(x, y) - 0.5);
      o[0] = k; o[1] = k * 0.96; o[2] = k * 0.9; o[3] = h;
    }, [1.2, 2.4], 3.0);
  },
};
function getTex(kind) { return TEX[kind] || (TEX[kind] = T[kind]()); }

// 다듬은 돌을 켜켜이 쌓은 벽·판석(흰빛 — 재질 색으로 물들인다)
function blockTex({ size = 1024, rows, minW, maxW, vary = 0.1, joint = 3, seed, meters, bump = 2.2 }) {
  const R = rng(seed), c = mk(size, size), hc = mk(size, size), g = ctx2(c), hg = ctx2(hc);
  g.fillStyle = 'rgb(120,116,108)'; g.fillRect(0, 0, size, size);
  hg.fillStyle = '#000'; hg.fillRect(0, 0, size, size);
  const rh = size / rows;
  for (let r = 0; r < rows; r++) {
    const ws = []; let sum = 0;
    while (sum < 1) { const w = minW + R() * (maxW - minW); ws.push(w); sum += w; }
    let x = -R() * ws[0] * size / sum;
    for (const w0 of ws) {
      const w = w0 / sum * size, k = 1 - vary + R() * vary * 2, warm = (R() - 0.5) * 12, hv = 200 + R() * 40 | 0;
      const col = `rgb(${Math.min(255, 232 * k + warm) | 0},${Math.min(255, 228 * k) | 0},${Math.min(255, 220 * k - warm) | 0})`;
      for (const off of [0, size]) {
        g.fillStyle = col; g.fillRect(x + off + joint, r * rh + joint, w - joint * 2, rh - joint * 2);
        hg.fillStyle = `rgb(${hv},${hv},${hv})`; hg.fillRect(x + off + joint, r * rh + joint, w - joint * 2, rh - joint * 2);
      }
      x += w;
    }
  }
  const n = fbmNoise(size, 8, seed + 9), fine = tileNoise(size, 128, seed + 5);
  const img = g.getImageData(0, 0, size, size), d = img.data, himg = hg.getImageData(0, 0, size, size), hd = himg.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4, k = 0.82 + 0.3 * n(x, y) + 0.1 * (fine(x, y) - 0.5);
    d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
    const hv = hd[i] * (0.9 + 0.1 * n(x, y)) + (fine(x, y) - 0.5) * 22;
    hd[i] = hd[i + 1] = hd[i + 2] = Math.max(0, Math.min(255, hv));
  }
  g.putImageData(img, 0, 0); hg.putImageData(himg, 0, 0);
  return { map: tex(c, meters), normalMap: tex(normalFromHeight(hc, bump), meters, false) };
}

/* ---------- 재질 공장 ----------
   mat(kind, color, opts) — 같은 종류·색이면 같은 재질을 돌려준다(한 덩어리로 합쳐져 그리는 횟수가 준다).
   kind: plaster 회벽 | wood 나무(세로결) | planks 널판 | plain 매끈한 면 | tile 기와 | metal 쇠 | stone 돌담 | pave 판석 | brick 벽돌
         | tatami 다다미 | dirt 흙 | grass 풀 | rock 바위 | bark 나무껍질 | cloth 천(바람에 나부낌) | paper 창호지 | leaf 잎(바람에 떪) | glow 스스로 빛남
   opts: { rough, metal, side:'double', emissive, scale(무늬 크기 배율), puddles, noShadow } */
const KIND = {
  plaster: { tex: 'plaster', rough: 0.92 }, wood: { tex: 'wood', rough: 0.74 }, planks: { tex: 'planks', rough: 0.66 },
  plain: { tex: 'plain', rough: 0.8 }, tile: { tex: 'plain', rough: 0.5 }, metal: { tex: 'plain', rough: 0.42, metal: 0.85 },
  stone: { tex: 'stone', rough: 0.9 }, pave: { tex: 'pave', rough: 0.86, puddles: true }, brick: { tex: 'brick', rough: 0.88 },
  tatami: { tex: 'tatami', rough: 0.85 }, dirt: { tex: 'dirt', rough: 0.96, puddles: true }, grass: { tex: 'grass', rough: 0.95 },
  rock: { tex: 'rock', rough: 0.93 }, bark: { tex: 'bark', rough: 0.95, sway: 'tree' },
  cloth: { tex: null, rough: 0.9, sway: 'cloth', side: 'double' }, paper: { tex: null, rough: 0.95 },
  leaf: { tex: null, rough: 0.62, sway: 'leaf', side: 'double' }, glow: { tex: null, rough: 0.6 },
};
const MATS = new Map();
export function mat(kind, color = 0xffffff, opts = {}) {
  const key = kind + '|' + color + '|' + JSON.stringify(opts);
  let m = MATS.get(key);
  if (m) return m;
  const K = KIND[kind];
  if (!K) throw new Error('모르는 재질 종류: ' + kind);
  const o = { color, roughness: opts.rough ?? K.rough, metalness: opts.metal ?? K.metal ?? 0 };
  if (K.tex) {
    const t = getTex(K.tex);
    if (opts.scale) {
      const a = t.map.clone(), b = t.normalMap.clone();
      for (const q of [a, b]) { q.repeat.multiplyScalar(1 / opts.scale); q.needsUpdate = true; }
      o.map = a; o.normalMap = b;
    } else { o.map = t.map; o.normalMap = t.normalMap; }
  }
  if ((opts.side ?? K.side) === 'double') o.side = THREE.DoubleSide;
  if (kind === 'paper') { o.emissive = new THREE.Color(color); o.emissiveIntensity = 0.22; }
  if (kind === 'glow') { o.emissive = new THREE.Color(opts.emissive ?? color); o.emissiveIntensity = opts.power ?? 1.6; }
  if (opts.emissive !== undefined && kind !== 'glow') { o.emissive = new THREE.Color(opts.emissive); o.emissiveIntensity = opts.power ?? 1; }
  m = weatherize(new THREE.MeshStandardMaterial(o), { puddles: opts.puddles ?? K.puddles ?? false, sway: K.sway || null, flat: !!K.tex, noLine: kind === 'leaf' });
  if (opts.noShadow || kind === 'glow') m.userData.noShadow = true;
  MATS.set(key, m);
  return m;
}

/* ---------- 글씨 ----------
   간판·포렴·현판에 쓸 글씨 그림. textTex('火', { w, h, color, bg, font, vertical, border }) */
const JP_FONT = '"Yu Mincho", "YuMincho", "MS Mincho", "Hiragino Mincho ProN", "Noto Serif JP", "Batang", serif';
const JP_GOTHIC = '"Yu Gothic", "Meiryo", "MS Gothic", "Hiragino Sans", "Malgun Gothic", sans-serif';
export function textTex(text, { w = 256, h = 256, color = '#1a1410', bg = null, font = 'mincho', weight = 900, vertical = false, border = null, pad = 0.12, draw = null } = {}) {
  const c = mk(w, h), g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  if (border) { g.strokeStyle = border; g.lineWidth = Math.max(4, Math.min(w, h) * 0.05); g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, w - g.lineWidth, h - g.lineWidth); }
  if (draw) draw(g, w, h);
  const fam = font === 'gothic' ? JP_GOTHIC : JP_FONT, chars = [...text];
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (vertical) {
    const cell = Math.min(w * (1 - pad * 2), h * (1 - pad) / chars.length);
    g.font = `${weight} ${cell * 0.92}px ${fam}`;
    const y0 = (h - cell * chars.length) / 2 + cell / 2;
    chars.forEach((ch, i) => {
      if (ch === 'ー') { g.save(); g.translate(w / 2, y0 + i * cell); g.rotate(Math.PI / 2); g.fillText(ch, 0, 0); g.restore(); }   // 세로쓰기의 장음은 세워 쓴다
      else g.fillText(ch, w / 2, y0 + i * cell);
    });
  } else {
    let size = h * (1 - pad * 2);
    g.font = `${weight} ${size}px ${fam}`;
    const tw = g.measureText(text).width, maxW = w * (1 - pad * 2);
    if (tw > maxW) { size *= maxW / tw; g.font = `${weight} ${size}px ${fam}`; }
    g.fillText(text, w / 2, h / 2 + size * 0.04);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
// 글씨가 적힌 재질. kind 'board'(간판) | 'cloth'(천 — 바람에 나부낌)
export function textMat(text, opts = {}, kind = 'board') {
  const key = 'T|' + kind + '|' + text + '|' + JSON.stringify(opts, (k, v) => (typeof v === 'function' ? String(v) : v));
  let m = MATS.get(key);
  if (m) return m;
  const t = textTex(text, opts);
  m = weatherize(new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, side: kind === 'cloth' ? THREE.DoubleSide : THREE.FrontSide, transparent: !opts.bg, alphaTest: opts.bg ? 0 : 0.4 }), { sway: kind === 'cloth' ? 'cloth' : null });
  MATS.set(key, m);
  return m;
}

/* ---------- 자주 쓰는 재질 ---------- */
export const M = {};
export function createMaterials() {
  M.glass = toonize(new THREE.MeshStandardMaterial({ color: 0xa9cbd6, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.3, side: THREE.DoubleSide }));
  M.glass.userData.noShadow = true;
  M.water = toonize(new THREE.MeshStandardMaterial({ color: 0x2a5a66, roughness: 0.05, transparent: true, opacity: 0.82 }));
  M.water.userData.noShadow = true;
  M.beam = mat('wood', 0x5a3b28);            // 짙은 기둥·보
  M.beamLight = mat('wood', 0xb98a58);       // 밝은 나무
  M.floor = mat('planks', 0xc79a66);         // 마룻바닥
  M.floorDark = mat('planks', 0x7a5236);
  M.tatami = mat('tatami', 0xffffff);
  M.shoji = mat('paper', 0xf6efdc);
  M.white = mat('plaster', 0xf1eadb);
  M.concrete = mat('plain', 0xb9b4a8, { rough: 0.9 });
  M.iron = mat('metal', 0x4a4d52);
  M.dirt = mat('dirt', 0xffffff);
  M.pave = mat('pave', 0xcfc6b4);
  M.stone = mat('stone', 0xc9c0ae);
  M.rock = mat('rock', 0xc2ad8c);
  return M;
}
