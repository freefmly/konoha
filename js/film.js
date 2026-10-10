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
  /* 0 정문으로 다가가기 */ { d: 2.6, w: 'clear', fov: 74, path: [[0, 1.75, 1058], [0, 1.65, 1036]], look: [[0, 10, 1021], [0, 8, 1021]] },   // 큰 다리를 건너 정문 앞까지: 문과 담이 화면을 채운다
  /* 1 번화가 걷기 */       { d: 4.2, w: 'clear', w2: [1.6, 'cloudy'], fov: 76, path: [[18, 1.65, 616.5], [42, 1.65, 616.5]], look: [[60, 3.2, 616.5], [90, 3.4, 616.5]] },
  /* 2 닌자 점프 */         { d: 4.4, w: 'cloudy', fov: 80, roofs: { x: -393, z: 497, yaw: -PI / 2, pitch: -0.14, ground: [0.3, 1.15] } },   // 우치하 구역: 빈터를 달리다 힘을 모아 솟고, 지붕에서 지붕으로 건너뛰며 달린다
  /* 3 닌자 아카데미 */     { d: 4.2, w: 'cloudy', w2: [0.8, 'rain'], fov: 74, path: [[17.5, 1.65, 120.4], [31, 1.65, 120]], look: [[55, 5, 117], [60, 7, 117]] },
  /* 4 이치라쿠 라멘 */     { d: 4.0, w: 'rain', fov: 74, path: [[2, 1.65, 461], [2, 1.65, 474]], look: [[9, 3, 470], [16, 2.2, 475], [17, 2.0, 475.5]] },
  /* 5 호카게 관저 */       { d: 4.4, w: 'snow', fov: 74, path: [[0, 1.65, -18], [0, 1.65, -42]], look: [[0, 9, -90], [0, 12, -90]] },
  /* 6 바위 위에서 */       { d: 5.8, w: 'clear', fov: 70, fly: [[0, 110.2, -160], [0, 119, -147]], look: [[0, 100, -100], [0, 40, 60], [0, 0, 300]] },
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
  app.style(true);   // 화풍은 만화 하나뿐이다

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
    let top = null, fx = 0, fz = 0, launched = false;
    // 닌자 점프: 큰길을 달리다가 힘을 모아(hold 구간 동안 뛰기 단추를 누른다) 높이 솟는다. 걷는 사람을 실제로 움직인다
    if (sh.leap) { const L = sh.leap; player.place(L.x, 0, L.z, L.yaw, L.pitch); player.locked = true; player.grounded = true; }
    if (sh.roofs) {
      const r = sh.roofs; fx = -Math.sin(r.yaw); fz = -Math.cos(r.yaw);
      top = (d, x = player.pos.x, z = player.pos.z) => player.groundAt(x + fx * d, z + fz * d, 1e4);
      let z = r.z; for (let i = 0; i < 80 && !(top(0, r.x, z) > 3.2 && top(1.5, r.x, z) > 3.2 && top(3, r.x, z) > 3.2); i++) z += fz * 0.5;
      if (r.ground) z = r.z;                                                    // 땅에서 시작한다(힘을 모았다가 첫 지붕으로 솟는다)
      player.place(r.x, r.ground ? 0 : top(0, r.x, z), z, r.yaw, r.pitch); player.locked = true; player.grounded = true; player.vel.set(fx * RUN, 0, fz * RUN);
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
      } else if (sh.leap) {
        const L = sh.leap;
        for (let k = 0; k < 2; k++) {
          const tt = t + k / FPS / 2;
          player.keys = { KeyW: true, ShiftLeft: true, Space: tt >= L.hold[0] && tt < L.hold[1] }; player.yaw = L.yaw;
          const want = L.pitch - clamp(-player.vel.y * 0.014, -0.14, 0.2) - (player.grounded ? 0 : 0.08);   // 솟을 때는 조금 올려다보고, 떨어질 때는 마을을 내려다본다
          player.pitch += (want - player.pitch) * 0.06;
          player.update(1 / FPS / 2);
        }
      } else if (sh.roofs) {
        for (let k = 0; k < 2; k++) {   // 한 장을 두 번에 나눠 계산
          const G = sh.roofs.ground, tt = t + k / FPS / 2, charging = G && tt >= G[0] && tt < G[1], launch = G && !launched && tt >= G[1];
          player.keys = { KeyW: true, ShiftLeft: true, Space: !!charging }; player.yaw = sh.roofs.yaw;
          if (launch) { launched = true; player.hold = 0; }                         // 모은 힘은 여기서 재어 준 만큼만 쓴다(걷는 사람의 제 뛰기는 막는다)
          if (player.grounded && !(G && tt < G[1]) && (launch || Math.abs(top(0.9) - player.pos.y) > 0.55)) {
            const cur = player.pos.y, sp = Math.max(5, Math.hypot(player.vel.x, player.vel.z));
            // 내려설 자리: 앞쪽으로 재어 가다 처음 만나는 집 위(바로 앞이 더 높은 집이면 그 벽 위)
            let d2 = 0; for (let d = 0.6; d < 24; d += 0.3) { const h = top(d); if (h > 3 && top(d + 0.9) > 3 && (d > 1.5 || h > cur + 0.55)) { d2 = d; break; } }
            if (d2) {
              const T = (d2 + 0.7) / sp, T1 = d2 / sp, h = Math.max(top(d2), top(d2 + 0.7));
              player.vel.y = Math.min(19, Math.max(3.2, (h + 0.3 - cur) / T + 0.5 * GRAV * T, (top(d2) + 0.35 - cur) / T1 + 0.5 * GRAV * T1));   // 너무 멀리 있는 지붕을 노리다 하늘 높이 솟지 않게 묶는다
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
    if (sh.leap) { player.keys = {}; player.locked = false; }
    if (sh.roofs) { console.log('ROOFS 끝', player.pos.x.toFixed(1), player.pos.y.toFixed(1), player.pos.z.toFixed(1)); player.keys = {}; player.locked = false; }
  }
  await post('/done', String(sent));
}
