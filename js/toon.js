// 만화 화풍의 마무리 — 장면을 먼저 따로 그려 두고, 깊이를 보고 물체의 가장자리·모서리에 먹선을 얹는다.
// (빛을 두 단계로 끊는 일은 materials.js의 inkShader가 맡는다. 여기는 선과 색 다듬기만 한다.)
import * as THREE from '../vendor/three.module.js';

const VERT = /* glsl */`
varying vec2 vUv;
void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FRAG = /* glsl */`
uniform sampler2D tColor, tDepth;
uniform vec2 uPx;          // 선 굵기만큼 떨어진 이웃 점까지의 거리(화면 비율)
uniform float uNearFar;    // 가까운 면 / 먼 면
uniform float uNear;
uniform float uK;          // 이웃 점 사이의 시야각(탄젠트)
uniform vec3 uInk;
varying vec2 vUv;
// 깊이 → (가까운 면 ÷ 거리). 평평한 면 위에서는 화면을 따라 곧게 변하므로, 휘는 자리가 곧 모서리다.
float inv(vec2 uv){ return 1.0 - texture2D(tDepth, uv).r * (1.0 - uNearFar); }
// 한 방향(가로 또는 세로)에서 면이 꺾인 정도. 비스듬히 누운 면(먼 땅바닥)은 조금만 굽어도 크게 잡히므로 기울기로 나눠 "꺾인 각도"로 고친다.
float bend(float a, float c, float b, float m){
  float lap = abs(a + b - 2.0 * c) / (m * uK);
  float slope = min(abs(a - c), abs(b - c)) / (m * uK);
  return lap / (1.0 + slope * slope);
}
void main(){
  vec2 dx = vec2(uPx.x, 0.0), dy = vec2(0.0, uPx.y);
  vec4 src = texture2D(tColor, vUv);
  float c = inv(vUv), l = inv(vUv - dx), r = inv(vUv + dx), d = inv(vUv - dy), u = inv(vUv + dy);
  float m = max(c, max(max(l, r), max(d, u)));
  float dist = uNear / m;
  float e = max(bend(l, c, r, m), bend(d, c, u, m));
  // 멀수록 굵은 윤곽만 남긴다(먼 기와·창살까지 다 그으면 새까매진다)
  float th = 0.5 * (1.0 + dist / 45.0);
  float line = smoothstep(th, th * 1.8, e);
  // 잎·풀처럼 자잘한 것은 선을 긋지 않는다(재질이 알파에 표시해 둔다)
  float mask = min(src.a, min(min(texture2D(tColor, vUv - dx).a, texture2D(tColor, vUv + dx).a), min(texture2D(tColor, vUv - dy).a, texture2D(tColor, vUv + dy).a)));
  line *= smoothstep(0.55, 0.95, mask) * (1.0 - 0.7 * smoothstep(140.0, 520.0, dist));

  gl_FragColor = vec4(src.rgb, 1.0);
  #include <tonemapping_fragment>
  vec3 col = gl_FragColor.rgb;
  col = max(mix(vec3(dot(col, vec3(0.3, 0.59, 0.11))), col, 1.16), 0.0);   // 색을 조금 더 선명하게
  gl_FragColor.rgb = mix(col, uInk, line * 0.88);
  #include <colorspace_fragment>
}`;

export class Toon {
  constructor(renderer, { samples = 4 } = {}) {
    this.renderer = renderer;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples, depthTexture: new THREE.DepthTexture(4, 4) });
    this.u = {
      tColor: { value: this.rt.texture }, tDepth: { value: this.rt.depthTexture },
      uPx: { value: new THREE.Vector2() }, uNearFar: { value: 0 }, uNear: { value: 0 }, uK: { value: 0 },
      uInk: { value: new THREE.Color(0.035, 0.028, 0.03) },
    };
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));   // 화면을 덮는 세모 한 장
    this.quad = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false }));
    this.quad.frustumCulled = false;
    this.cam = new THREE.Camera();
    this.size = new THREE.Vector2();
  }

  render(scene, camera) {
    const r = this.renderer, s = r.getDrawingBufferSize(this.size);
    if (s.x !== this.rt.width || s.y !== this.rt.height) this.rt.setSize(s.x, s.y);
    const step = Math.max(1, s.y / 760);   // 선 굵기: 화면 높이 760점에서 한 점
    this.u.uPx.value.set(step / s.x, step / s.y);
    this.u.uNear.value = camera.near; this.u.uNearFar.value = camera.near / camera.far;
    this.u.uK.value = 2 * Math.tan(camera.fov * Math.PI / 360) / s.y * step;
    r.setRenderTarget(this.rt); r.render(scene, camera);
    r.setRenderTarget(null); r.render(this.quad, this.cam);
  }
}
