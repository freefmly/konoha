// 날씨(솔로몬 성전 앱의 것을 가져와 바람·날리는 나뭇잎을 더함) — 하늘·구름·해·안개, 비와 눈, 번개, 바람, 그리고 "어디가 하늘 아래인가"를 아는 지붕 지도.
import * as THREE from '../vendor/three.module.js';
import { W } from './materials.js';
import { collidersNear } from './build.js';

/* ---------- 지붕 지도: 위에서 내려다본 높이. 비·눈이 지붕을 뚫지 않게 하고, 눈·웅덩이가 하늘 아래에만 생기게 한다 ---------- */
export class Cover {
  constructor(renderer, cx, cz, size) {
    this.renderer = renderer; this.cx = cx; this.cz = cz; this.size = size;
    const opt = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true };
    this.rt = new THREE.WebGLRenderTarget(2048, 2048, opt);
    this.small = new THREE.WebGLRenderTarget(512, 512, opt);
    this.cam = new THREE.OrthographicCamera(-size / 2, size / 2, size / 2, -size / 2, 1, 700);
    this.cam.position.set(cx, 400, cz);
    this.cam.up.set(0, 0, -1);
    this.cam.lookAt(cx, 0, cz);
    this.mat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      vertexShader: `varying float vY; void main(){ vec4 p = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          p = instanceMatrix * p;
        #endif
        vec4 w = modelMatrix * p; vY = w.y; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `varying float vY; void main(){ gl_FragColor = vec4(vY, 0.0, 0.0, 1.0); }`,
    });
    this.data = null;
    W.uCover.value = this.rt.texture;
    W.uCoverRect.value.set(cx, cz, size, 0);
  }

  // skip: 지붕으로 치지 않을 것들(하늘, 비, 눈, 불꽃…)
  render(scene, skip) {
    const r = this.renderer, vis = skip.map(o => o.visible);
    skip.forEach(o => { o.visible = false; });
    const bg = scene.background, fog = scene.fog, col = new THREE.Color();
    r.getClearColor(col); const al = r.getClearAlpha();
    scene.background = null; scene.fog = null; scene.overrideMaterial = this.mat;
    r.setClearColor(new THREE.Color().setRGB(-500, 0, 0), 1);
    for (const t of [this.rt, this.small]) { r.setRenderTarget(t); r.clear(); r.render(scene, this.cam); }
    const raw = new Uint16Array(512 * 512 * 4);
    r.readRenderTargetPixels(this.small, 0, 0, 512, 512, raw);
    this.data = new Float32Array(512 * 512);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < this.data.length; i++) { const v = this.data[i] = THREE.DataUtils.fromHalfFloat(raw[i * 4]); if (v < lo) lo = v; if (v > hi) hi = v; }
    this.valid = hi - lo > 1;      // 일부 기기는 이 형식의 그림을 읽어 오지 못한다 → 그때는 충돌 상자로 머리 위를 잰다
    r.setRenderTarget(null);
    r.setClearColor(col, al);
    scene.overrideMaterial = null; scene.background = bg; scene.fog = fog;
    skip.forEach((o, i) => { o.visible = vis[i]; });
  }

  heightAt(x, z) {
    if (this.data && !this.valid) {
      let h = -500;
      for (const c of collidersNear(x - 0.05, z - 0.05, x + 0.05, z + 0.05, this.tmp || (this.tmp = []))) if (c[4] > h) h = c[4];
      return h;
    }
    if (!this.data) return -500;
    const u = (x - this.cx) / this.size + 0.5, v = 0.5 - (z - this.cz) / this.size;
    if (u < 0 || u >= 1 || v < 0 || v >= 1) return -500;
    return this.data[Math.floor(v * 512) * 512 + Math.floor(u * 512)];
  }

  // 머리 위가 얼마나 가려졌나(0 = 한데, 1 = 완전히 실내). 주변 여러 점을 재서 낭실·주랑 같은 반쯤 열린 곳은 중간값이 나온다.
  enclosure(x, y, z) {
    let hit = 0, n = 0;
    for (const r of [0, 2.2, 5]) {
      const cnt = r === 0 ? 1 : 8;
      for (let i = 0; i < cnt; i++) {
        const a = i / cnt * Math.PI * 2, w = r === 0 ? 4 : r < 3 ? 1 : 0.5;
        if (this.heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r) > y + 0.4) hit += w;
        n += w;
      }
    }
    return hit / n;
  }
}

/* ---------- 하늘 ---------- */
const SKY_FRAG = /* glsl */`
uniform vec3 uSun, uTop, uHor, uFogCol;
uniform float uCov, uDark, uTime, uFlash, uSunPow, uToon;
varying vec3 vDir;
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++) { s += a * n2(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float up = max(d.y, 0.0);
  vec3 col = mix(uHor, uTop, pow(up, 0.55));
  float sd = max(dot(d, uSun), 0.0);
  col += uSunPow * (vec3(1.0, 0.95, 0.85) * pow(sd, 900.0) * 14.0 + vec3(1.0, 0.85, 0.6) * pow(sd, 12.0) * 0.28);
  // 구름: 머리 위 평면에 깔린 여섯 겹 잡음
  vec2 uv = d.xz / (d.y + 0.18) * 1.15 + vec2(uTime * 0.012, uTime * 0.005);
  float n = fbm(uv), nb = fbm(uv * 2.7 + 5.0);
  float e0 = 0.9 - uCov * 1.0;
  float dens = smoothstep(e0, e0 + 0.32, n * 0.82 + nb * 0.18);
  float thick = smoothstep(0.25, 1.0, dens * (0.55 + 0.6 * nb));
  // 만화 화풍: 구름 가장자리를 또렷이 끊고, 밝은 면과 그늘 두 색으로만 칠한다
  dens = mix(dens, smoothstep(0.40, 0.47, dens), uToon);
  thick = mix(thick, 0.85 * smoothstep(0.50, 0.55, thick), uToon);
  vec3 lit = mix(vec3(1.0), uHor * 1.15, 0.25) * (1.0 - uDark * 0.72);
  vec3 shade = mix(vec3(0.62, 0.65, 0.72), vec3(0.16, 0.17, 0.2), uDark);
  vec3 cloud = mix(lit, shade, thick) + uSunPow * vec3(1.0, 0.9, 0.75) * pow(sd, 6.0) * 0.5 * (1.0 - thick);
  cloud += uFlash * (0.12 + 0.75 * nb * nb) * vec3(0.85, 0.9, 1.0);
  col = mix(col, cloud, dens * smoothstep(-0.02, 0.22, d.y));
  col = mix(col, uFogCol * (1.0 + uFlash * 0.45), smoothstep(0.16, -0.03, d.y));   // 지평선은 안개 빛에 녹는다
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const PRESET = {
  clear:  { cov: 0.34, dark: 0.0,  sun: 2.9,  hemi: 0.36, fog: 0.0010, top: [0.16, 0.38, 0.82], hor: [0.66, 0.80, 0.96], sunPow: 1.0,  rain: 0, snow: 0, expo: 1.0, wind: 0.28 },
  cloudy: { cov: 0.80, dark: 0.32, sun: 1.0,  hemi: 0.42, fog: 0.0016, top: [0.42, 0.50, 0.62], hor: [0.70, 0.74, 0.79], sunPow: 0.25, rain: 0, snow: 0, expo: 0.98, wind: 0.5 },
  rain:   { cov: 1.0,  dark: 0.80, sun: 0.18, hemi: 0.34, fog: 0.0036, top: [0.20, 0.23, 0.28], hor: [0.34, 0.37, 0.42], sunPow: 0.0,  rain: 1, snow: 0, expo: 0.92, wind: 0.8 },
  snow:   { cov: 1.0,  dark: 0.22, sun: 0.22, hemi: 0.78, fog: 0.0042, top: [0.60, 0.63, 0.69], hor: [0.80, 0.82, 0.86], sunPow: 0.0,  rain: 0, snow: 1, expo: 0.98, wind: 0.4 },
};
export const WEATHERS = [['clear', '맑음'], ['cloudy', '구름'], ['rain', '비'], ['snow', '눈']];

const PART_VERT = /* glsl */`
uniform float uTime, uAmount, uWind; uniform vec2 uWindDir; uniform vec3 uCam, uBox, uVel, uDrift; uniform sampler2D uCover; uniform vec4 uCoverRect;
attribute vec4 aOff; attribute float aEnd;
varying float vA;
vec3 place(){
  vec3 p = aOff.xyz * uBox + uVel * uTime + uDrift * (0.7 + 0.6 * aOff.w);   // 바람에 떠밀린 만큼 옮긴다
  #ifdef LEAVES
    p.y += sin(uTime * 1.3 + aOff.w * 50.0) * 0.8; p.xz += vec2(cos(uTime * 0.8 + aOff.w * 37.0), sin(uTime * 1.1 + aOff.w * 23.0)) * 1.2;
  #endif
  #ifdef SNOW
    p.x += sin(uTime * 0.9 + aOff.w * 40.0) * 0.5; p.z += cos(uTime * 0.7 + aOff.w * 31.0) * 0.5;
  #endif
  return uCam + (fract((p - uCam) / uBox + 0.5) - 0.5) * uBox;
}
float sky(vec3 p){
  vec2 uv = (p.xz - uCoverRect.xy) / uCoverRect.z + 0.5; uv.y = 1.0 - uv.y;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 1.0;
  return step(texture2D(uCover, uv).r + 0.03, p.y);
}`;

export class Weather {
  constructor(scene, renderer, camera, cover) {
    this.scene = scene; this.renderer = renderer; this.camera = camera; this.cover = cover;
    this.type = 'clear'; this.cur = structuredClone(PRESET.clear); this.snowAcc = 0; this.wetAcc = 0; this.t = 0;
    this.sunDir = new THREE.Vector3(0.42, 0.68, 0.6).normalize();   // 해는 남동쪽 하늘 — 남쪽을 보는 호카게 바위에 볕이 든다
    this.windLevel = 1; this.windNow = 0.3; this.windAng = 0.6; this.drift = new THREE.Vector3();

    this.sunRight = new THREE.Vector3(0, 1, 0).cross(this.sunDir).normalize();
    this.sunUp = this.sunDir.clone().cross(this.sunRight).normalize();
    this.sun = new THREE.DirectionalLight(0xffe6c0, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    const sc = this.sun.shadow.camera; sc.left = -110; sc.right = 110; sc.top = 110; sc.bottom = -110; sc.near = 10; sc.far = 700;
    this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.06;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xdfe9ff, 0x8a7a62, 0.35);
    scene.add(this.hemi);
    this.flashLight = new THREE.DirectionalLight(0xcfdcff, 0);
    scene.add(this.flashLight, this.flashLight.target);
    scene.fog = new THREE.FogExp2(0xb8cce6, 0.001);

    this.skyU = {
      uSun: { value: this.sunDir }, uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uFogCol: { value: new THREE.Color() },
      uCov: { value: 0.2 }, uDark: { value: 0 }, uTime: { value: 0 }, uFlash: { value: 0 }, uSunPow: { value: 1 }, uToon: W.uToon,
    };
    const skyMat = () => new THREE.ShaderMaterial({
      uniforms: this.skyU, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = modelViewMatrix * vec4(position, 0.0); gl_Position = (projectionMatrix * vec4(p.xyz, 1.0)).xyww; }`,
      fragmentShader: SKY_FRAG,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), skyMat());
    this.sky.frustumCulled = false; this.sky.renderOrder = -10;
    scene.add(this.sky);
    // 금속이 비출 하늘(반사 환경)을 굽기 위한 작은 장면
    this.envScene = new THREE.Scene();
    this.envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMat()));
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = null; this.envTimer = 0; this.envDirty = 3;

    this.rain = this.makeParticles(false);
    this.snow = this.makeParticles(true);
    this.leaves = this.makeLeaves();
    this.bolt = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0, fog: false, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.bolt.frustumCulled = false;
    this.bolt.material.color.setRGB(3.0, 3.2, 4.0);
    this.boltGlow = new THREE.Mesh(new THREE.BufferGeometry(), this.bolt.material.clone());
    this.boltGlow.material.color.setRGB(0.22, 0.27, 0.5);
    this.boltGlow.frustumCulled = false;
    scene.add(this.bolt, this.boltGlow);
    this.nextBolt = 6; this.flashT = -1; this.flashSeq = [];
    this.onThunder = null;   // (거리 m) → 소리 쪽에서 채운다
    this.skip = [this.sky, this.rain, this.snow, this.leaves, this.bolt, this.boltGlow];
    this.apply(1);
  }

  makeParticles(isSnow) {
    const n = isSnow ? 14000 : 18000, g = new THREE.BufferGeometry(), per = isSnow ? 1 : 2;
    const off = new Float32Array(n * per * 4), end = new Float32Array(n * per);
    for (let i = 0; i < n; i++) {
      const a = Math.random(), b = Math.random(), c = Math.random(), d = Math.random();
      for (let k = 0; k < per; k++) { off.set([a, b, c, d], (i * per + k) * 4); end[i * per + k] = k; }
    }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * per * 3), 3));
    g.setAttribute('aOff', new THREE.BufferAttribute(off, 4));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    const uniforms = {
      uTime: { value: 0 }, uAmount: { value: 0 }, uCam: { value: new THREE.Vector3() }, uCover: W.uCover, uCoverRect: W.uCoverRect, uWind: W.uWind, uWindDir: W.uWindDir, uDrift: { value: this.drift },
      uBox: { value: isSnow ? new THREE.Vector3(46, 26, 46) : new THREE.Vector3(44, 30, 44) },
      uVel: { value: isSnow ? new THREE.Vector3(0, -1.5, 0) : new THREE.Vector3(0, -21, 0) },
      uCol: { value: new THREE.Color(0.75, 0.8, 0.88) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms, transparent: true, depthWrite: false, fog: false, defines: isSnow ? { SNOW: '' } : {},
      vertexShader: PART_VERT + (isSnow ? `
        void main(){ vec3 p = place(); vec4 mv = viewMatrix * vec4(p, 1.0);
          float show = step(aOff.w, uAmount) * sky(p);
          vA = show * smoothstep(23.0, 14.0, -mv.z) * 0.92;
          gl_PointSize = show * min((1.6 + aOff.w * 2.2) * 15.0 / max(-mv.z, 0.6), 14.0);
          gl_Position = projectionMatrix * mv; }` : `
        void main(){ vec3 p = place();
          float show = step(aOff.w, uAmount) * sky(p);
          p -= normalize(uVel + vec3(uWindDir.x, 0.0, uWindDir.y) * uWind * 9.0) * aEnd * (0.55 + aOff.w * 0.35);          // 빗줄기의 꼬리(바람 부는 쪽으로 눕는다)
          vec4 mv = viewMatrix * vec4(p, 1.0);
          vA = show * mix(0.42, 0.0, aEnd) * smoothstep(22.0, 10.0, -mv.z);
          gl_Position = projectionMatrix * mv; }`),
      fragmentShader: isSnow
        ? `uniform vec3 uCol; varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float r = length(c);
             float a = smoothstep(0.5, 0.12, r) * vA; if (a < 0.01) discard; gl_FragColor = vec4(vec3(0.97, 0.98, 1.0), a); }`
        : `uniform vec3 uCol; varying float vA; void main(){ if (vA < 0.004) discard; gl_FragColor = vec4(uCol, vA); }`,
    });
    const o = isSnow ? new THREE.Points(g, mat) : new THREE.LineSegments(g, mat);
    o.frustumCulled = false; o.renderOrder = 20; o.visible = false;
    this.scene.add(o);
    return o;
  }

  // 바람에 날리는 나뭇잎(나뭇잎 마을답게): 잎 모양 점들이 바람 부는 쪽으로 떠간다
  makeLeaves() {
    const n = 420, g = new THREE.BufferGeometry();
    const off = new Float32Array(n * 4), end = new Float32Array(n);
    for (let i = 0; i < n * 4; i++) off[i] = Math.random();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aOff', new THREE.BufferAttribute(off, 4));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    const uniforms = {
      uTime: { value: 0 }, uAmount: { value: 0 }, uCam: { value: new THREE.Vector3() }, uCover: W.uCover, uCoverRect: W.uCoverRect, uWind: W.uWind, uWindDir: W.uWindDir,
      uBox: { value: new THREE.Vector3(60, 22, 60) }, uVel: { value: new THREE.Vector3(0, -0.5, 0) }, uDrift: { value: new THREE.Vector3() }, uLight: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms, transparent: true, depthWrite: false, fog: false, defines: { LEAVES: '' },
      vertexShader: PART_VERT + `
        varying float vSpin; varying float vHue;
        void main(){ vec3 p = place(); vec4 mv = viewMatrix * vec4(p, 1.0);
          float show = step(aOff.w, uAmount) * sky(p);
          vA = show * smoothstep(34.0, 24.0, -mv.z) * smoothstep(0.4, 1.2, -mv.z);
          vSpin = uTime * (1.5 + aOff.x * 3.0) + aOff.w * 60.0; vHue = fract(aOff.w * 17.0);
          gl_PointSize = show * min(170.0 / max(-mv.z, 0.6), 40.0) * (0.7 + 0.6 * aOff.y);
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uLight; varying float vA; varying float vSpin; varying float vHue;
        void main(){ vec2 c = gl_PointCoord - 0.5; float s = sin(vSpin), k = cos(vSpin);
          c = vec2(c.x * k - c.y * s, c.x * s + c.y * k);
          c.y /= max(0.25, abs(cos(vSpin * 0.7)));                       // 뒤집히며 납작해 보였다 넓어 보였다 한다
          float w = 0.17 * (1.0 - pow(abs(c.x) * 2.2, 1.6));               // 양 끝이 뾰족한 잎 모양
          if (abs(c.x) > 0.45 || abs(c.y) > w || vA < 0.02) discard;
          vec3 col = mix(vec3(0.22, 0.42, 0.12), vec3(0.50, 0.56, 0.16), vHue) * (0.75 + 0.5 * smoothstep(0.0, 0.03, abs(c.y)));
          gl_FragColor = vec4(col * uLight, vA); }`,
    });
    const o = new THREE.Points(g, mat);
    o.frustumCulled = false; o.renderOrder = 19; o.visible = false;
    this.scene.add(o);
    return o;
  }

  // 바람 세기 단계: 0 잔잔 · 1 산들 · 2 강풍
  setWind(level) { this.windLevel = level; }

  set(type, instant = false) {
    this.type = type;
    this.envDirty = 6;
    if (instant) { this.cur = structuredClone(PRESET[type]); this.snowAcc = PRESET[type].snow; this.wetAcc = PRESET[type].rain; }
    this.nextBolt = 3 + Math.random() * 4;
  }

  // 지금 값들을 빛·안개·하늘에 반영
  apply() {
    const c = this.cur, u = this.skyU, fl = Math.max(0, this.flash || 0);
    u.uTop.value.setRGB(...c.top); u.uHor.value.setRGB(...c.hor);
    u.uCov.value = c.cov; u.uDark.value = c.dark; u.uSunPow.value = c.sunPow; u.uFlash.value = fl;
    const fogCol = u.uFogCol.value.setRGB(c.hor[0] * 0.96, c.hor[1] * 0.96, c.hor[2] * 0.97);
    this.scene.fog.color.copy(fogCol).multiplyScalar(1 + fl * 0.45);
    this.scene.fog.density = c.fog;
    this.sun.intensity = c.sun;
    this.hemi.intensity = c.hemi + fl * 0.9;
    this.flashLight.intensity = fl * 3.2;
    this.renderer.toneMappingExposure = c.expo;
    this.rain.material.uniforms.uAmount.value = c.rain;
    this.snow.material.uniforms.uAmount.value = c.snow;
    this.rain.visible = c.rain > 0.01; this.snow.visible = c.snow > 0.01;
    const lv = this.leaves.material.uniforms;
    lv.uAmount.value = Math.min(1, this.windNow * 1.1) * (1 - c.snow); lv.uLight.value = 0.35 + 0.65 * Math.min(1, c.sun / 2.5 + c.hemi * 0.6);
    this.leaves.visible = lv.uAmount.value > 0.02;
    this.rain.material.uniforms.uCol.value.setRGB(0.62 + fl, 0.67 + fl, 0.75 + fl);
  }

  strike() {
    // 번개 줄기: 하늘에서 땅까지 꺾이며 내려오고 곁가지를 친다
    const cam = this.camera.position, a = this.holdFlash ? -this.camera.rotation.y - Math.PI / 2 : Math.random() * Math.PI * 2, dist = 180 + Math.random() * 380;
    const base = new THREE.Vector3(cam.x + Math.cos(a) * dist, 0, cam.z + Math.sin(a) * dist);
    const pos = [], side = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
    const glow = [];
    const seg = (p0, p1, w) => {
      for (const [arr, k] of [[pos, 1], [glow, 4.5]]) {          // 가는 속줄기와 그 둘레의 빛무리
        const s = side.clone().multiplyScalar(w * k);
        const A = p0.clone().sub(s), B = p0.clone().add(s), C = p1.clone().add(s), D = p1.clone().sub(s);
        for (const v of [A, B, C, A, C, D]) arr.push(v.x, v.y, v.z);
      }
    };
    const path = (start, len, w, depth) => {
      let p = start.clone();
      const steps = Math.ceil(len / 14);
      for (let i = 0; i < steps && p.y > -10; i++) {
        const q = p.clone().add(new THREE.Vector3(0, -14, 0)).addScaledVector(side, (Math.random() - 0.5) * 22).add(new THREE.Vector3((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 8));
        seg(p, q, w * (1 - i / steps * 0.5));
        if (depth < 2 && Math.random() < 0.22) path(q, len * 0.35, w * 0.5, depth + 1);
        p = q;
      }
    };
    path(base.clone().setY(360), 380, dist * 0.0038, 0);
    this.bolt.geometry.dispose();
    this.bolt.geometry = new THREE.BufferGeometry();
    this.bolt.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.boltGlow.geometry.dispose();
    this.boltGlow.geometry = new THREE.BufferGeometry();
    this.boltGlow.geometry.setAttribute('position', new THREE.Float32BufferAttribute(glow, 3));
    this.flashLight.position.copy(base).setY(220);
    this.flashLight.target.position.copy(cam);
    this.flashT = 0;
    // 번쩍임: 두세 번 깜박인다
    this.flashSeq = [[0, 1], [0.07, 0.25], [0.12, 0.9], [0.2, 0.2], [0.27, 0.6], [0.55, 0]];
    if (this.onThunder) this.onThunder(dist);
  }

  update(dt, cam) {
    this.t += dt;
    const tg = PRESET[this.type], c = this.cur, k = 1 - Math.exp(-dt / 2.2);
    let moving = false;
    for (const key of Object.keys(tg)) {
      if (Array.isArray(tg[key])) for (let i = 0; i < 3; i++) { if (Math.abs(tg[key][i] - c[key][i]) > 0.003) moving = true; c[key][i] += (tg[key][i] - c[key][i]) * k; }
      else { if (Math.abs(tg[key] - c[key]) > 0.003 * Math.max(1, Math.abs(tg[key]))) moving = true; c[key] += (tg[key] - c[key]) * k; }
    }
    // 눈은 서서히 쌓이고 서서히 녹는다. 빗물도 서서히 고였다가 마른다.
    this.snowAcc = THREE.MathUtils.clamp(this.snowAcc + (c.snow > 0.5 ? dt / 50 : -dt / 35), 0, 1);
    this.wetAcc = THREE.MathUtils.clamp(this.wetAcc + (c.rain > 0.5 ? dt / 40 : -dt / 70), 0, 1);
    W.uSnow.value = this.snowAcc; W.uWet.value = this.wetAcc; W.uRain.value = c.rain; W.uTime.value = this.t;
    // 바람: 날씨마다 기본 세기가 다르고, 돌풍이 불었다 잦아들었다 하며, 방향도 천천히 돈다
    const gust = 0.62 + 0.38 * Math.sin(this.t * 0.23) * Math.sin(this.t * 0.071 + 1.3) + 0.12 * Math.sin(this.t * 0.9);
    this.windNow = c.wind * [0.25, 1, 1.9][this.windLevel] * Math.max(0.15, gust);
    this.windAng = 0.6 + 0.5 * Math.sin(this.t * 0.043);
    W.uWind.value = this.windNow; W.uWindDir.value.set(Math.cos(this.windAng), Math.sin(this.windAng));
    const wv = this.windNow * dt;
    this.drift.x += W.uWindDir.value.x * wv * 9; this.drift.z += W.uWindDir.value.y * wv * 9;
    const ld = this.leaves.material.uniforms.uDrift.value;
    ld.x += W.uWindDir.value.x * wv * 7; ld.z += W.uWindDir.value.y * wv * 7;
    for (const o of [this.rain, this.snow, this.leaves]) o.material.uniforms.uTime.value = this.t;

    // 번개: 비 오는 날 5~15초에 한 번
    this.flash = 0;
    if (this.type === 'rain' && c.rain > 0.6) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) { this.strike(); this.nextBolt = 5 + Math.random() * 10; }
    }
    if (this.flashT >= 0) {
      this.flashT += dt;
      if (this.holdFlash) this.flashT = 0.01;
      const s = this.flashSeq;
      let v = 0;
      for (let i = 0; i < s.length - 1; i++) if (this.flashT >= s[i][0] && this.flashT < s[i + 1][0]) v = s[i][1] + (s[i + 1][1] - s[i][1]) * (this.flashT - s[i][0]) / (s[i + 1][0] - s[i][0]);
      this.flash = v;
      this.bolt.material.opacity = this.flashT < 0.3 ? Math.min(1, v * 1.6) : 0;
      if (this.flashT > 0.6) { this.flashT = -1; this.bolt.material.opacity = 0; }
      this.boltGlow.material.opacity = this.bolt.material.opacity * 0.4;
    }
    this.apply();

    this.skyU.uTime.value = this.t;
    this.sky.position.copy(cam.position);
    this.sky.scale.setScalar(1);
    this.rain.material.uniforms.uCam.value.copy(cam.position);
    this.snow.material.uniforms.uCam.value.copy(cam.position);
    this.leaves.material.uniforms.uCam.value.copy(cam.position);
    // 그림자는 걷는 사람 둘레에만 드리운다(그림자 한 칸 단위로 맞춰 떨림을 없앤다)
    // 해가 보는 평면에서 그림자 지도 한 칸(약 4.6cm) 단위로 맞춘다 — 세계 좌표로 맞추면 움직일 때 그림자 가장자리가 일렁인다
    // 그림자 지도는 약 1m(22칸)를 움직였을 때만 다시 그린다 — 건물은 움직이지 않으니 매번 그릴 필요가 없고, 폰 발열이 크게 준다
    const texel = 220 / 4096 * 22;
    const sa = Math.round(cam.position.dot(this.sunRight) / texel) * texel, sb = Math.round(cam.position.dot(this.sunUp) / texel) * texel;
    if (sa !== this.shadowA || sb !== this.shadowB) { this.shadowA = sa; this.shadowB = sb; this.shadowDirty = true; }
    this.sun.target.position.set(0, 0, 0).addScaledVector(this.sunRight, sa).addScaledVector(this.sunUp, sb);
    this.sun.position.copy(this.sun.target.position).addScaledVector(this.sunDir, 320);

    if (moving) this.envDirty = Math.max(this.envDirty, 2);
    this.envTimer -= dt;
    if (this.envDirty > 0 && this.envTimer <= 0) { this.bakeEnv(); this.envTimer = 0.5; this.envDirty--; }
  }

  bakeEnv() {
    const fl = this.skyU.uFlash.value; this.skyU.uFlash.value = 0;
    const rt = this.pmrem.fromScene(this.envScene, 0, 0.1, 100);
    this.skyU.uFlash.value = fl;
    if (this.envRT) this.envRT.dispose();
    this.envRT = rt;
    this.scene.environment = rt.texture;
  }
}
