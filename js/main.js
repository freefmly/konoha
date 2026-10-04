// 나뭇잎 마을 — 시작점. 재질·지형·건물을 차례로 만들고, 걷기·날씨·소리를 돌린다.
import * as THREE from '../vendor/three.module.js';
import { createMaterials } from './materials.js';
import { Cover, Weather, WEATHERS } from './weather.js';
import { Sound } from './audio.js';
import { Player } from './player.js';
import { LOT } from './layout.js';
import { buildVillage, terrainH } from './village.js';

const $ = s => document.querySelector(s);
const tick = () => new Promise(r => setTimeout(r, 0));
const Q = new URLSearchParams(location.search);

// 따로 짓는 건물들. 하나가 고장 나도 나머지는 뜨게 하나씩 불러온다.
const BUILDINGS = [
  ['hokage', '호카게 관저를 올리는 중…'], ['academy', '닌자 아카데미를 짓는 중…'],
  ['naruto', '나루토의 집을 짓는 중…'], ['homes', '사쿠라와 이노의 집을 짓는 중…'], ['ichiraku', '이치라쿠 라멘의 국물을 끓이는 중…'],
];

async function init() {
  const say = async t => { $('#loadText').textContent = t; await tick(); await tick(); };
  const canvas = $('#view');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.autoUpdate = false;        // 필요할 때만 다시 그린다(weather.shadowDirty)
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  // 가까운 면(near)을 너무 당기면 먼 곳의 깊이 구분이 무뎌져 가까이 겹친 면이 깜빡인다. 벽에 붙어도 벽 속이 보이지 않는 한도(몸 반지름 0.34)까지 민다.
  const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, +Q.get('near') || 0.18, 1600);
  camera.rotation.order = 'YXZ';

  await say('회벽을 바르고 기와를 굽는 중…');
  createMaterials();
  const cover = new Cover(renderer, 0, -10, 500);
  const weather = new Weather(scene, renderer, camera, cover);

  const places = [], jumps = [], lights = [], glows = [], skip = [...weather.skip], ticks = [];
  const take = r => {
    if (!r) return;
    places.push(...(r.places || [])); jumps.push(...(r.jumps || [])); lights.push(...(r.lights || []));
    glows.push(...(r.glows || [])); skip.push(...(r.skip || [])); if (r.tick) ticks.push(r.tick);
  };
  const only = Q.get('only');   // 확인용: ?only=hokage 처럼 주면 그 건물만 짓는다(마을 채움 건물·숲은 생략)
  const ctx = { LOT, renderer, say, lite: !!only && only !== 'none', part: Q.get('part') };   // only=none: 필수 건물 없이 마을만
  for (const [name, msg] of BUILDINGS) {
    if (only && only !== name) continue;
    await say(msg);
    try { const mod = await import(`./b_${name}.js`); take(await mod.build(scene, ctx)); }
    catch (e) { console.error('건물 짓기 실패: ' + name, e); }
  }
  take(await buildVillage(scene, ctx));

  // 실내 등불: 빛은 여섯 개만 두고, 걷는 사람과 가까운 등불 자리로 옮겨 쓴다(등불이 많아도 느려지지 않는다)
  const lamps = [];
  for (let i = 0; i < 6; i++) { const l = new THREE.PointLight(0xffc98a, 0, 16, 1.6); scene.add(l); lamps.push(l); }
  if (glows.length) {
    const gc = document.createElement('canvas'); gc.width = gc.height = 64;
    const gg = gc.getContext('2d'), grad = gg.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,225,170,0.9)'); grad.addColorStop(0.35, 'rgba(255,170,80,0.3)'); grad.addColorStop(1, 'rgba(255,120,30,0)');
    gg.fillStyle = grad; gg.fillRect(0, 0, 64, 64);
    const glowMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(gc), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 });
    for (const [x, y, z, s = 1] of glows) { const sp = new THREE.Sprite(glowMat); sp.position.set(x, y, z); sp.scale.set(1.1 * s, 1.1 * s, 1); scene.add(sp); skip.push(sp); }
  }

  await say('하늘을 여는 중…');
  scene.updateMatrixWorld(true);
  cover.render(scene, skip);
  weather.shadowDirty = true;

  const player = new Player(camera, canvas, terrainH);
  const sound = new Sound();
  weather.onThunder = d => sound.thunder(d);
  const START = [0, 0, 150, 0];
  player.place(...START);

  /* ---------- 화면 ---------- */
  const ui = { menu: $('#menu'), hud: $('#hud'), place: $('#placeName'), text: $('#placeText') };
  let started = false, weatherType = 'clear', windLevel = 1;
  const WIND = ['잔잔', '산들', '강풍'];
  const setWeather = (type, instant) => {
    weatherType = type; weather.set(type, instant);
    document.querySelectorAll('[data-weather]').forEach(b => b.classList.toggle('on', b.dataset.weather === type));
    $('#wxNow').textContent = WEATHERS.find(w => w[0] === type)[1];
  };
  const setWind = lv => {
    windLevel = lv; weather.setWind(lv);
    document.querySelectorAll('[data-wind]').forEach(b => b.classList.toggle('on', +b.dataset.wind === lv));
    $('#windNow').textContent = WIND[lv];
  };
  const WX_NAME = { clear: '맑은 날', cloudy: '구름 낀 날', rain: '비 오는 날', snow: '눈 오는 날' };
  $('#weatherBtns').innerHTML = WEATHERS.map(([k], i) => `<button data-weather="${k}"><i class="wx wx-${k}"></i><span>${WX_NAME[k]}</span><kbd>${i + 1}</kbd></button>`).join('');
  $('#weatherBtns').addEventListener('click', e => { const b = e.target.closest('[data-weather]'); if (b) setWeather(b.dataset.weather); });
  $('#windBtns').innerHTML = WIND.map((n, i) => `<button data-wind="${i}">${n}</button>`).join('');
  $('#windBtns').addEventListener('click', e => { const b = e.target.closest('[data-wind]'); if (b) setWind(+b.dataset.wind); });
  jumps.sort((a, b) => (a[5] ?? 50) - (b[5] ?? 50));
  $('#jumpBtns').innerHTML = jumps.map((j, i) => `<button data-jump="${i}">${j[0]}</button>`).join('');
  const enter = () => { sound.start(); started = true; player.lock(); };
  $('#jumpBtns').addEventListener('click', e => { const b = e.target.closest('[data-jump]'); if (!b) return; const j = jumps[b.dataset.jump]; player.place(j[1], j[2], j[3], j[4]); enter(); });
  $('#enterBtn').addEventListener('click', enter);
  const muteBtn = $('#muteBtn');
  const setMute = m => { sound.setMuted(m); muteBtn.classList.toggle('on', !m); muteBtn.textContent = m ? '소리 꺼짐' : '소리 켜짐'; };
  muteBtn.addEventListener('click', () => setMute(!sound.muted));
  player.onLock = locked => {
    ui.menu.classList.toggle('hidden', locked); ui.hud.classList.toggle('hidden', !locked);
    $('#enterBtn').textContent = started ? '계속 걷기' : '마을로 들어가기';
    if (sound.ctx) locked ? sound.ctx.resume() : sound.ctx.suspend();
  };
  addEventListener('keydown', e => {
    if (!player.locked) return;
    const i = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
    if (i >= 0) setWeather(WEATHERS[i][0]);
    if (e.code === 'KeyM') setMute(!sound.muted);
    if (e.code === 'KeyB') setWind((windLevel + 1) % 3);
  });
  const fit = () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
  addEventListener('resize', fit);
  setWeather(Q.get('w') || 'clear', true);
  setWind(Q.get('wind') ? +Q.get('wind') : 1);

  // 확인용 주소: ?shot=x,y,z,yaw,pitch&w=rain&full=1 — 메뉴 없이 그 자리·그 날씨로 바로 본다. &fly=1이면 중력 없이 그 자리에 뜬다.
  const shot = Q.get('shot');
  if (shot) {
    const v = shot.split(',').map(Number);
    player.place(v[0], v[1], v[2], v[3] || 0, v[4] || 0);
    ui.menu.classList.add('hidden'); ui.hud.classList.remove('hidden'); started = true;
    if (Q.get('full')) { weather.snowAcc = weatherType === 'snow' ? 1 : 0; weather.wetAcc = weatherType === 'rain' ? 1 : 0; }
    if (Q.get('nohud')) ui.hud.classList.add('hidden');
  }
  // 걷기 시험용 주소: &walk=방향:초[:달리기];… — 그 방향(yaw)을 보고 앞으로 걷게 한 뒤 선 자리를 콘솔에 적는다(한꺼번에 계산)
  if (Q.get('walk')) {
    player.locked = true;
    Q.get('walk').split(';').map(l => l.split(':').map(Number)).forEach((leg, i) => {
      player.yaw = leg[0]; player.keys = { KeyW: true, ShiftLeft: !!leg[2] };
      for (let n = 0; n < leg[1] * 60; n++) player.update(1 / 60);
      console.log('WALK', i, player.pos.x.toFixed(2), player.pos.y.toFixed(2), player.pos.z.toFixed(2), '실내', cover.enclosure(player.pos.x, player.pos.y + 1.62, player.pos.z).toFixed(2));
    });
    player.keys = {}; player.locked = false;
  }
  if (Q.get('bolt')) { weather.holdFlash = true; weather.nextBolt = 0; }   // 확인용: 번개를 친 순간에 멈춰 둔다
  $('#loading').classList.add('hidden');
  if (!shot) ui.menu.classList.remove('hidden');

  /* ---------- 돌리기 ---------- */
  const clock = new THREE.Clock();
  let hudT = 0, lampT = 0, lastPlace = undefined, orbit = 0, indoor = 0;
  const area = q => (q.b[1] - q.b[0]) * (q.b[3] - q.b[2]);
  places.sort((a, b) => area(a) - area(b));     // 좁은 자리(방)가 넓은 자리(마을)보다 먼저
  function frame() {
    requestAnimationFrame(frame);
    if (weather.shadowDirty) { renderer.shadowMap.needsUpdate = true; weather.shadowDirty = false; }
    const dt = Math.min(clock.getDelta(), 0.05);
    if (started) { if (!Q.get('fly')) player.update(dt); }
    else { // 들어가기 전: 정문 위에서 호카게 바위 쪽을 천천히 훑는 화면
      orbit += dt * 0.04;
      camera.position.set(Math.sin(orbit) * 70, 46 + Math.sin(orbit * 0.6) * 6, 120 + Math.cos(orbit * 0.8) * 30);
      camera.lookAt(Math.sin(orbit) * 10, 26, -150);
    }
    const wdt = Q.get('freeze') ? 0 : dt;   // 확인용: 날씨·바람의 시간을 멈춘다(두 장을 찍어 깜빡이는 면을 찾을 때)
    weather.update(wdt, camera);
    for (const f of ticks) f(weather.t, wdt);
    if (Q.get('freeze')) weather.leaves.visible = false;
    const p = camera.position;
    indoor += (cover.enclosure(p.x, p.y, p.z) - indoor) * (1 - Math.exp(-dt * 5));
    sound.update(weather.cur.rain, 0.015 + weather.windNow * 0.11, indoor);
    lampT -= dt;
    if (lampT <= 0) {   // 가까운 등불 여섯 개만 켠다
      lampT = 0.25;
      const near = lights.map(l => [l, (l[0] - p.x) ** 2 + (l[1] - p.y) ** 2 * 4 + (l[2] - p.z) ** 2]).sort((a, b) => a[1] - b[1]);
      lamps.forEach((L, i) => {
        const l = near[i] && near[i][1] < 45 * 45 ? near[i][0] : null;
        if (l) { L.position.set(l[0], l[1], l[2]); L.intensity = l[3] ?? 14; L.distance = l[4] ?? 16; } else L.intensity = 0;
      });
    }
    hudT -= dt;
    if (hudT <= 0 && started) {
      hudT = 0.2;
      const fy = player.pos.y;
      const pl = places.find(q => p.x >= q.b[0] && p.x <= q.b[1] && p.z >= q.b[2] && p.z <= q.b[3] && (!q.y || (fy >= q.y[0] - 0.3 && fy < q.y[1]))) || null;
      if (pl !== lastPlace) {
        lastPlace = pl;
        ui.place.textContent = pl ? pl.n : '마을 밖 숲'; ui.text.textContent = pl ? (pl.t || '') : '담장 너머는 불의 나라의 깊은 숲이다.';
        $('#placeCard').classList.remove('flash'); void $('#placeCard').offsetWidth; $('#placeCard').classList.add('flash');
      }
    }
    renderer.render(scene, camera);
  }
  frame();
  if (Q.get('stats')) setTimeout(() => {   // 확인용: 그린 삼각형 수와 한 장 그리는 데 걸린 시간
    const t0 = performance.now(); for (let i = 0; i < 5; i++) renderer.render(scene, camera); renderer.getContext().finish();
    console.log('STATS tris', renderer.info.render.triangles, 'calls', renderer.info.render.calls, 'ms/frame', ((performance.now() - t0) / 5).toFixed(1));
  }, 500);
  window.__ready = true; window.__player = player;   // 확인용
}

init().catch(e => { console.error(e); $('#loadText').textContent = '문제가 생겼습니다: ' + e.message; });
