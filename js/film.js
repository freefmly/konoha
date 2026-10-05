// 촬영 모드(?film=1) — 소개 영상용. 정해 둔 장면 목록을 따라 걷는 사람의 눈으로 움직이며 한 장씩 그려, 받는 쪽(tools/film_recv.py)으로 보낸다.
// tools/film.sh가 화면 없는 브라우저로 이 모드를 돌리고, 받은 그림들을 영상으로 묶는다. 실제 시간과 상관없이 한 장이 1/30초다. 글자는 넣지 않는다.
import * as THREE from '../vendor/three.module.js';

const FPS = 30, PI = Math.PI, GRAV = 20, RUN = 9.5;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = t => { t = clamp(t); return t * t * (3 - 2 * t); };
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
// 여러 점을 시간에 따라 차례로 잇는다(0~1)
const along = (pts, u) => { if (pts.length === 1) return pts[0]; const f = clamp(u) * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)); return mix3(pts[i], pts[i + 1], ease(f - i)); };

/* 장면 목록(이 차례대로 찍는다).
   d 길이(초) · w 날씨 · w2 [초, 날씨] 장면 도중에 날씨가 바뀐다 · fov 시야각
   path 눈높이로 걸어가는 길(꺾은선, 일정한 걸음) — look을 주면 그 점(들)을 바라보고(걸으며 고개를 돌린다), 없으면 가는 쪽을 본다. lookEnd는 끝에 가서 바라볼 것, arrive는 길 끝에 닿는 때(0~1, 그 뒤로는 서서 둘러본다)
   fly [처음, 끝] 하늘에서 내려다보는 장면 · roofs 지붕 위를 달리며 건너뛰는 장면(걷는 사람을 실제로 움직인다) */
const SHOTS = [
  /* 0 하늘에서 */        { d: 5.0, w: 'clear', fov: 62, fly: [[-46, 128, 262], [28, 92, 128]], look: [[0, 0, -30], [0, 12, -84]] },
  /* 1 큰길 걷기 */       { d: 5.0, w: 'clear', w2: [2.2, 'cloudy'], fov: 74, path: [[0.5, 1.65, 166], [0.5, 1.65, 143]], look: [[-3, 9, 60], [2, 12, -40]] },
  /* 2 지붕 달리기 */     { d: 4.4, w: 'cloudy', fov: 80, roofs: { x: -12.5, z: 150, yaw: 0, pitch: -0.16 } },
  /* 3 나루토의 방 */     { d: 3.6, w: 'rain', fov: 76, path: [[-50.6, 8.25, -19.7], [-54.2, 8.25, -20.8], [-56.75, 8.15, -22.0]], look: [[-57, 7.8, -22.2], [-57.73, 7.3, -22.85], [-57.73, 7.26, -22.85]] },
  /* 4 이치라쿠 */        { d: 5.0, w: 'rain', fov: 74, path: [[1.6, 1.65, 28], [1.6, 1.65, 6]], look: [[3, 3.2, 12], [11, 2.2, 15.6], [12, 1.9, 16], [12, 2.0, 16.4]] },
  /* 5 사쿠라의 집 */     { d: 4.6, w: 'clear', fov: 76, path: [[42.1, 1.65, 85], [42.1, 1.7, 77.2], [42.1, 2.05, 74.2], [41.6, 2.05, 71.6], [39.2, 2.05, 71.3], [37.6, 2.05, 70.3]], lookEnd: [35, 1.5, 67.5] },
  /* 6 야마나카 꽃집 */   { d: 3.6, w: 'cloudy', fov: 74, path: [[-1.2, 1.65, 62], [-1.2, 1.65, 46]], look: [[-6, 2.6, 54], [-12, 1.9, 48.5], [-12, 1.7, 47.5]] },
  /* 7 우치하 거리 */     { d: 5.0, w: 'cloudy', w2: [1.2, 'rain'], fov: 74, path: [[108, 1.65, -4], [131, 1.65, -4]], look: [[124, 3.6, -5], [132, 3.0, -9], [140, 2.6, -1], [150, 2.4, -4]] },
  /* 8 사스케의 집 */     { d: 4.2, w: 'rain', fov: 76, path: [[141.5, 1.65, -4], [150.5, 1.65, -4.2], [153.6, 1.8, -4.5], [156.6, 2.1, -4.4]], lookEnd: [158.2, 2.0, -6.6] },
  /* 9 못과 선착장 */     { d: 3.6, w: 'snow', fov: 76, path: [[158, 1.65, 12.2], [158, 2.15, 16.6], [158, 2.15, 25.5]], look: [[158, 1.4, 30], [158, 1.0, 34]] },
  /* 10 신사→비석 */      { d: 6.6, w: 'snow', fov: 76, path: [[144.6, 1.65, -33], [148, 1.7, -32.4], [154.3, 4.65, -31.7], [158.2, 4.65, -32], [163.9, 4.65, -38.15], [163.9, 4.05, -36.8], [163.9, 2.65, -35.0], [163.9, 1.7, -33.4], [163.4, 1.65, -30.8], [161.4, 1.6, -28.4]], lookEnd: [160.8, 1.15, -25.7] },
  /* 11 아카데미 */       { d: 3.6, w: 'clear', fov: 74, path: [[68, 1.65, -49], [68, 1.65, -64.5]], look: [[68, 6, -100], [68, 7, -104]] },
  /* 12 교실 */           { d: 5.0, w: 'clear', fov: 78, path: [[49.3, 2.1, -108.6], [50.3, 2.1, -113.4], [50.5, 2.1, -117.2]], look: [[57, 1.9, -117], [59, 2.3, -113], [58.5, 2.2, -109.5]] },
  /* 13 그네 */           { d: 5.0, w: 'cloudy', w2: [1.6, 'snow'], fov: 72, path: [[62.5, 1.65, -73], [56, 1.62, -70.4], [53.3, 1.58, -69.7]], look: [[50.6, 1.6, -70.8], [50.6, 1.0, -70.8]] },
  /* 14 호카게 관저 */    { d: 3.6, w: 'snow', fov: 74, path: [[0, 1.65, -51], [0, 1.65, -67.5]], look: [[0, 8, -104], [0, 10, -104]] },
  /* 15 바위 위에서 */    { d: 5.6, w: 'clear', fov: 72, arrive: 0.5, path: [[4, 61.65, -158], [1, 61.78, -151.45]], look: [[0, 44, -110], [0, 4, -70], [-6, 0, -20], [6, 0, 40]] },
];

export async function run(app) {
  const Q = new URLSearchParams(location.search);
  const W = +Q.get('fw') || 1080, H = +Q.get('fh') || 1920, to = Q.get('to') || 'http://localhost:8820';
  const only = Q.get('shots') ? Q.get('shots').split(',').map(Number) : null;   // 확인용: 몇 번 장면만
  const every = +Q.get('every') || 1;                                           // 확인용: n장에 한 장만 보낸다
  const { renderer, camera, weather, player } = app, gl = renderer.domElement;
  renderer.setPixelRatio(1); renderer.setSize(W, H, false); camera.aspect = W / H;
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const g = out.getContext('2d');
  // 보내다 멈추는 일이 있어, 4초 안에 답이 없으면 끊고 다시 보낸다
  const post = async (path, body) => {
    for (let i = 0; i < 6; i++) {
      const ac = new AbortController(), timer = setTimeout(() => ac.abort(), 4000);
      try { const r = await fetch(to + path, { method: 'POST', body, signal: ac.signal }); clearTimeout(timer); if (r.ok) return; } catch (e) { clearTimeout(timer); }
    }
    throw new Error('그림을 보내지 못함: ' + path);
  };
  app.style(false);

  // 한 장 그리기 전 준비: 날씨·바람·그림자·등불
  const step = dt => {
    weather.update(dt, camera); app.tick(weather.t, dt);
    if (weather.shadowDirty) { renderer.shadowMap.needsUpdate = true; weather.shadowDirty = false; }
    app.placeLamps(camera.position);
  };
  const full = type => { weather.snowAcc = type === 'snow' ? 1 : 0; weather.wetAcc = type === 'rain' ? 1 : 0; };

  let n = 0, sent = 0, wx = null;
  const total = SHOTS.reduce((s, sh, i) => s + (!only || only.includes(i) ? Math.round(sh.d * FPS) : 0), 0);
  const last = SHOTS.length - 1, first = 0;
  for (let si = 0; si < SHOTS.length; si++) {
    if (only && !only.includes(si)) continue;
    const sh = SHOTS[si], frames = Math.round(sh.d * FPS);
    if (sh.w !== wx) { wx = sh.w; app.setWeather(wx, true); full(wx); }
    camera.fov = sh.fov || 72; camera.updateProjectionMatrix();
    let changed = false;

    // 걸어가는 길: 꺾은선의 길이를 재 두고 일정한 걸음으로 간다
    let seg = null, len = 0;
    if (sh.path) { seg = []; for (let i = 0; i < sh.path.length - 1; i++) { const a = sh.path[i], b = sh.path[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); seg.push([len, l]); len += l; } }
    const at = s => { s = clamp(s, 0, len); for (let i = seg.length - 1; i >= 0; i--) if (s >= seg[i][0]) return mix3(sh.path[i], sh.path[i + 1], seg[i][1] ? (s - seg[i][0]) / seg[i][1] : 0); return sh.path[0]; };
    const gaze = new THREE.Vector3(); let gazeSet = false;

    // 지붕 달리기: 줄지은 집 위에 올려놓고 앞으로 달리게 한다. 지붕 끝이 다가오면 다음 지붕까지의 거리와 높이를 재서 꼭 닿을 만큼 뛴다.
    let top = null, fx = 0, fz = 0;
    if (sh.roofs) {
      const r = sh.roofs; fx = -Math.sin(r.yaw); fz = -Math.cos(r.yaw);
      top = (d, x = player.pos.x, z = player.pos.z) => player.groundAt(x + fx * d, z + fz * d, 1e4);
      let z = r.z; for (let i = 0; i < 80 && !(top(0, r.x, z) > 3.2 && top(1.5, r.x, z) > 3.2 && top(3, r.x, z) > 3.2); i++) z += fz * 0.5;
      player.place(r.x, top(0, r.x, z), z, r.yaw, r.pitch); player.locked = true; player.grounded = true; player.vel.set(fx * RUN, 0, fz * RUN);
    }

    for (let f = 0; f < frames; f++, n++) {
      const t = f / FPS, u = f / (frames - 1);
      if (sh.w2 && !changed && t >= sh.w2[0]) { changed = true; wx = sh.w2[1]; app.setWeather(wx, false); }
      if (changed) { const k = clamp((t - sh.w2[0]) / 3.2); if (wx === 'snow') weather.snowAcc = Math.max(weather.snowAcc, k * 0.85); if (wx === 'rain') weather.wetAcc = Math.max(weather.wetAcc, k); }
      if (sh.fly) {
        camera.position.set(...mix3(sh.fly[0], sh.fly[1], ease(u))); camera.lookAt(...along(sh.look, u));
      } else if (sh.path) {
        const s = len * (sh.arrive ? ease(u / sh.arrive) : u), p = at(s);
        const bob = Math.sin(s * 3.1) * 0.03 + Math.sin(s * 1.55) * 0.012;                   // 걸음마다 눈높이가 오르내린다
        let tgt = sh.look ? along(sh.look, u) : mix3(p, at(s + 3.2), 1);
        if (!sh.look && s + 3.2 > len) { const a = at(len - 0.5), b = at(len); tgt = [b[0] + (b[0] - a[0]) * 6, b[1] + (b[1] - a[1]) * 6, b[2] + (b[2] - a[2]) * 6]; }
        if (sh.lookEnd) tgt = mix3(tgt, sh.lookEnd, ease((u - 0.72) / 0.24));
        if (!gazeSet) { gaze.set(...tgt); gazeSet = true; } else gaze.lerp(new THREE.Vector3(...tgt), 0.14);   // 고개는 부드럽게 따라 돈다
        camera.position.set(p[0], p[1] + bob, p[2]); camera.lookAt(gaze);
      } else if (sh.roofs) {
        for (let k = 0; k < 2; k++) {   // 한 장을 두 번에 나눠 계산
          player.keys = { KeyW: true, ShiftLeft: true }; player.yaw = sh.roofs.yaw;
          if (player.grounded && Math.abs(top(0.9) - player.pos.y) > 0.55) {
            const cur = player.pos.y, sp = Math.max(5, Math.hypot(player.vel.x, player.vel.z));
            // 내려설 자리: 앞쪽으로 재어 가다 처음 만나는 집 위(바로 앞이 더 높은 집이면 그 벽 위)
            let d2 = 0; for (let d = 0.6; d < 34; d += 0.3) { const h = top(d); if (h > 3 && top(d + 0.9) > 3 && (d > 1.5 || h > cur + 0.55)) { d2 = d; break; } }
            if (d2) {
              const T = (d2 + 0.7) / sp, T1 = d2 / sp, h = Math.max(top(d2), top(d2 + 0.7));
              player.vel.y = Math.max(3.2, (h + 0.3 - cur) / T + 0.5 * GRAV * T, (top(d2) + 0.35 - cur) / T1 + 0.5 * GRAV * T1);
            } else player.vel.y = 6.4;
            player.grounded = false;
          }
          const want = sh.roofs.pitch - clamp(-player.vel.y * 0.012, -0.1, 0.2);            // 떨어질 때는 내려다본다
          player.pitch += (want - player.pitch) * 0.08;
          player.update(1 / FPS / 2);
        }
      }
      step(1 / FPS);
      app.draw(); g.drawImage(gl, 0, 0, W, H);
      if (si === first && t < 0.5) { g.fillStyle = `rgba(0,0,0,${1 - t / 0.5})`; g.fillRect(0, 0, W, H); }
      if (si === last && sh.d - t < 0.6) { g.fillStyle = `rgba(0,0,0,${1 - (sh.d - t) / 0.6})`; g.fillRect(0, 0, W, H); }
      if (n % every === 0) {
        const blob = await (await fetch(out.toDataURL('image/jpeg', 0.93))).blob();   // toBlob은 화면 없는 브라우저에서 가끔 답이 오지 않아 쓰지 않는다
        await post('/f/' + String(sent++).padStart(5, '0'), blob);
      }
      if (n % 30 === 0) document.title = `촬영 ${n}/${total}`;
    }
    if (sh.roofs) { console.log('ROOFS 끝', player.pos.x.toFixed(1), player.pos.y.toFixed(1), player.pos.z.toFixed(1)); player.keys = {}; player.locked = false; }
  }
  await post('/done', String(sent));
}
