// 나뭇잎 마을 — 시작점. 재질·지형·건물을 차례로 만들고, 걷기·날씨·소리를 돌린다.
import * as THREE from '../vendor/three.module.js';
import { createMaterials, W } from './materials.js';
import { Cover, Weather, WEATHERS } from './weather.js';
import { Sound } from './audio.js';
import { Toon } from './toon.js';
import { Player } from './player.js';
import { LOT, WALL, SITE } from './layout.js';
import { marks, settle } from './build.js';
import { buildVillage, terrainH, inPoly } from './village.js';

const $ = s => document.querySelector(s);
const tick = () => new Promise(r => setTimeout(r, 0));
const Q = new URLSearchParams(location.search);
// 터치 기기(스마트폰)인가. 확인용으로 ?touch=1 / ?touch=0 로 강제할 수 있다.
const TOUCH = Q.get('touch') ? Q.get('touch') === '1' : matchMedia('(pointer: coarse)').matches;
document.body.classList.toggle('touch', TOUCH);

// 따로 짓는 건물들. 하나가 고장 나도 나머지는 뜨게 하나씩 불러온다.
// 새 배치로 옮기는 중: 지금은 제자리가 그대로인 호카게 관저만 세운다. 나머지(academy·naruto·homes·ichiraku·uchiha)는 새 자리로 옮긴 뒤 다시 넣는다.
const BUILDINGS = [
  // [이름(SITE의 이름), 알림, 짓는 파일(이름과 다를 때)]
  ['hokage', '호카게 관저를 올리는 중…'], ['academy', '닌자 아카데미를 짓는 중…'], ['swing', '아카데미 마당에 그네를 다는 중…'],
  ['naruto', '나루토의 집을 짓는 중…'], ['sakura', '사쿠라의 집을 짓는 중…', 'homes'], ['ino', '야마나카 꽃집을 여는 중…', 'homes'],
  ['ichiraku', '이치라쿠 라멘의 국물을 끓이는 중…'], ['choji', '쵸지네 밥상을 차리는 중…', 'homes'], ['inoichi', '이노이치네 꽃병에 물을 가는 중…', 'homes'], ['hyuga', '휴가 종가의 다다미를 까는 중…', 'homes'], ['sasuke', '사스케의 집을 짓는 중…', 'uchiha'], ['shrine', '남가 신사를 세우는 중…', 'uchiha'],
];

async function init() {
  const say = async t => { $('#loadText').textContent = t; await tick(); await tick(); };
  const canvas = $('#view');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  // 폰은 화면 점이 아주 촘촘해서 다 그리면 PC보다 점이 많아진다 → 낮춰 그리고, 느려지면 더 낮춘다
  let pixelRatio = Math.min(devicePixelRatio, TOUCH ? 1.3 : 1.5);
  renderer.setPixelRatio(pixelRatio);
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
  const cover = new Cover(renderer, WALL.cx, WALL.cz, WALL.r * 2 + 120, TOUCH ? 2048 : 4096);   // 지붕 지도는 마을 전체를 덮는다
  const weather = new Weather(scene, renderer, camera, cover);
  if (TOUCH) weather.sun.shadow.mapSize.set(2048, 2048);   // 폰은 그림자 지도를 작게

  const places = [], jumps = [], lights = [], glows = [], skip = [...weather.skip], ticks = [];
  const take = r => {
    if (!r) return;
    places.push(...(r.places || [])); jumps.push(...(r.jumps || [])); lights.push(...(r.lights || []));
    glows.push(...(r.glows || [])); skip.push(...(r.skip || [])); if (r.tick) ticks.push(r.tick);
  };
  const only = Q.get('only');   // 확인용: ?only=hokage 처럼 주면 그 건물만 짓는다(마을 채움 건물·숲은 생략)
  const sq = (Q.get('shot') || '').split(',').map(Number);
  const ctx = { LOT, renderer, say, camera, weather, shotAt: sq.length >= 3 && !Q.get('sky') ? { x: sq[0], y: 0, z: sq[2] } : null, lite: !!only && only !== 'none', part: Q.get('part'), mobile: TOUCH, tint: Q.get('tint') !== '0' };   // only=none: 필수 건물 없이 마을만
  for (const [name, msg, file = name] of BUILDINGS) {
    if (only && only !== name) continue;
    await say(msg);
    try {
      const mod = await import(`./b_${file}.js`), at = SITE[name];
      ctx.which = name;                                    // 한 파일이 여러 채를 지을 때 어느 것을 지을지
      if (!at) take(await mod.build(scene, ctx));
      else {   // 새 자리로 옮긴 건물: 제 좌표로 지은 뒤 통째로 돌려 놓는다(확인용 ?spin=도 — 더 돌려 본다)
        const holder = new THREE.Group(), from = marks();
        take(settle(scene, holder, from, { ...at, ry: at.ry + (+Q.get('spin') || 0) * Math.PI / 180 }, await mod.build(holder, ctx)));
      }
    }
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
  player.touchMode = TOUCH;
  const sound = new Sound();
  weather.onThunder = d => sound.thunder(d);
  const START = [0, 0, WALL.gateZ - 25, 0];
  player.place(...START);

  /* ---------- 화면 ---------- */
  const ui = { menu: $('#menu'), hud: $('#hud'), place: $('#placeName'), text: $('#placeText') };
  let lastPlace = undefined;
  let started = false, weatherType = 'clear', windLevel = 1;
  const WIND = ['잔잔', '산들', '강풍'];
  const setWeather = (type, instant) => {
    weatherType = type; weather.set(type, instant);
    document.querySelectorAll('[data-weather]').forEach(b => b.classList.toggle('on', b.dataset.weather === type));
    $('#wxNow').textContent = $('#btnWeather').textContent = WEATHERS.find(w => w[0] === type)[1];
  };
  const setWind = lv => {
    windLevel = lv; weather.setWind(lv);
    document.querySelectorAll('[data-wind]').forEach(b => b.classList.toggle('on', +b.dataset.wind === lv));
    $('#windNow').textContent = WIND[lv]; $('#btnWind').textContent = '바람 ' + WIND[lv];
  };
  // 화풍: 실사 ↔ 만화. 재질은 그대로 두고 칠하는 법(W.uToon)만 바꾼다. 만화는 먹선을 긋느라 한 번 거쳐 그린다(toon.js).
  let toon = null, toonOn = false;
  const STYLE = ['실사', '만화'];
  const applyStyle = on => {
    toonOn = on; W.uToon.value = on ? 1 : 0; weather.envDirty = 2;
    if (on && !toon) toon = new Toon(renderer, { samples: TOUCH ? 2 : 4 });
    document.querySelectorAll('[data-style]').forEach(b => b.classList.toggle('on', (b.dataset.style === '1') === on));
    $('#styleNow').textContent = $('#btnStyle').textContent = STYLE[+on];
    try { localStorage.setItem('konoha.style', on ? '1' : '0'); } catch (e) { /* 저장이 막힌 창이면 그냥 넘어간다 */ }
  };
  const setStyle = on => {
    if (on === toonOn) return;
    if (!on || toon) return applyStyle(on);
    // 처음 만화로 바꿀 때는 칠하는 법을 새로 준비하느라 잠깐 멈춘다 → 알림을 먼저 띄우고 바꾼다
    $('#styleNote').classList.remove('hidden');
    setTimeout(() => { applyStyle(true); requestAnimationFrame(() => requestAnimationFrame(() => $('#styleNote').classList.add('hidden'))); }, 40);
  };
  $('#styleBtns').innerHTML = STYLE.map((n, i) => `<button data-style="${i}">${n}</button>`).join('');
  $('#styleBtns').addEventListener('click', e => { const b = e.target.closest('[data-style]'); if (b) setStyle(b.dataset.style === '1'); });
  const WX_NAME = { clear: '맑은 날', cloudy: '구름 낀 날', rain: '비 오는 날', snow: '눈 오는 날' };
  $('#weatherBtns').innerHTML = WEATHERS.map(([k], i) => `<button data-weather="${k}"><i class="wx wx-${k}"></i><span>${WX_NAME[k]}</span><kbd>${i + 1}</kbd></button>`).join('');
  $('#weatherBtns').addEventListener('click', e => { const b = e.target.closest('[data-weather]'); if (b) setWeather(b.dataset.weather); });
  $('#windBtns').innerHTML = WIND.map((n, i) => `<button data-wind="${i}">${n}</button>`).join('');
  $('#windBtns').addEventListener('click', e => { const b = e.target.closest('[data-wind]'); if (b) setWind(+b.dataset.wind); });
  jumps.sort((a, b) => (a[5] ?? 50) - (b[5] ?? 50));
  $('#jumpBtns').innerHTML = jumps.map((j, i) => `<button data-jump="${i}">${j[0]}</button>`).join('');
  const enter = () => { sound.start(); started = true; player.lock(); };
  $('#jumpBtns').addEventListener('click', e => { const b = e.target.closest('[data-jump]'); if (!b) return; const j = jumps[b.dataset.jump]; player.place(j[1], j[2], j[3], j[4]); enter(); });
  $('#enterBtn').addEventListener('click', () => { player.setSky(false); enter(); });
  $('#skyBtn').addEventListener('click', () => { player.setSky(true); enter(); });
  const muteBtn = $('#muteBtn');
  const setMute = m => { sound.setMuted(m); muteBtn.classList.toggle('on', !m); muteBtn.textContent = m ? '소리 꺼짐' : '소리 켜짐'; };
  muteBtn.addEventListener('click', () => setMute(!sound.muted));
  // 하늘에서 보기: 멀리까지 또렷하게 보이도록 보는 범위를 넓히고(가까운 면은 밀어 깊이 구분을 지킨다) 안개를 걷는다
  const NEAR = camera.near;
  player.onSky = on => {
    camera.near = on ? 2 : NEAR; camera.far = on ? 4200 : 1600; camera.updateProjectionMatrix();
    ui.hud.classList.toggle('sky', on); $('#skyBar').classList.toggle('hidden', !on); $('#btnSky').classList.toggle('on', on);
    lastPlace = undefined;
  };
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
    if (e.code === 'KeyC') setStyle(!toonOn);
    if (e.code === 'KeyV') player.setSky(!player.sky);
  });
  // 화면 크기 맞추기. 폰은 홈 화면에서 열거나 돌릴 때 처음 알려 주는 크기가 틀릴 때가 있어, 직접 재서 모든 겹에 똑같이 적용하고 매 장면마다 바뀌었는지 다시 본다.
  let viewW = 0, viewH = 0;
  const fit = () => {
    viewW = innerWidth; viewH = innerHeight;
    renderer.setSize(viewW, viewH); camera.aspect = viewW / viewH; camera.updateProjectionMatrix();
    document.documentElement.style.setProperty('--W', viewW + 'px'); document.documentElement.style.setProperty('--H', viewH + 'px');
    if (TOUCH) scrollTo(0, 0);
  };
  fit();
  addEventListener('resize', fit);
  addEventListener('orientationchange', () => setTimeout(fit, 300));

  /* ---------- 터치 조작: 왼쪽은 이동 조이스틱(닿은 자리에 나타남), 오른쪽은 끌어서 둘러보기 ---------- */
  if (TOUCH) {
    const pad = $('#touch'), stick = $('#stick'), knob = $('#knob'), RAD = 58;
    let moveId = null, lookId = null, ox = 0, oy = 0, lx = 0, ly = 0;
    const endMove = () => { moveId = null; player.touch.x = player.touch.z = 0; player.touch.run = false; stick.classList.remove('on', 'run'); };
    pad.addEventListener('pointerdown', e => {
      if (!player.locked) return;
      e.preventDefault();
      if (e.clientX < innerWidth * 0.45 && moveId === null) {
        moveId = e.pointerId; ox = e.clientX; oy = e.clientY;
        stick.style.left = ox + 'px'; stick.style.top = oy + 'px'; knob.style.transform = '';
        stick.classList.add('on');
      } else if (lookId === null) { lookId = e.pointerId; lx = e.clientX; ly = e.clientY; }
    });
    pad.addEventListener('pointermove', e => {
      if (e.pointerId === moveId) {
        let dx = e.clientX - ox, dy = e.clientY - oy;
        const d = Math.hypot(dx, dy), run = d > RAD * 1.5;                 // 고리 밖까지 밀면 달린다
        if (d > RAD) { dx *= RAD / d; dy *= RAD / d; }
        const live = d < 8 ? 0 : 1;
        player.touch.x = dx / RAD * live; player.touch.z = dy / RAD * live; player.touch.run = run;
        knob.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';
        stick.classList.toggle('run', run);
      } else if (e.pointerId === lookId) {
        player.look(e.clientX - lx, e.clientY - ly, 0.0046);
        lx = e.clientX; ly = e.clientY;
      }
    });
    const up = e => { if (e.pointerId === moveId) endMove(); if (e.pointerId === lookId) lookId = null; };
    pad.addEventListener('pointerup', up); pad.addEventListener('pointercancel', up);
    const tap = (sel, fn) => $(sel).addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); fn(); });
    // 뛰기 단추: 누르고 있는 동안 힘을 모으고, 떼면 뛴다
    const jb = $('#btnJump'), jumpEnd = () => { player.jumpHeld = false; };
    jb.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (player.sky) player.skyStep(); else player.jumpHeld = true; });   // 하늘에서는 누를 때마다 높이를 바꾼다
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) jb.addEventListener(ev, jumpEnd);
    tap('#btnWeather', () => setWeather(WEATHERS[(WEATHERS.findIndex(w => w[0] === weatherType) + 1) % WEATHERS.length][0]));
    tap('#btnWind', () => setWind((windLevel + 1) % 3));
    tap('#btnStyle', () => setStyle(!toonOn));
    tap('#btnSky', () => player.setSky(!player.sky));
    tap('#btnMenu', () => { endMove(); lookId = null; player.unlock(); });
    // 화면이 끌려 움직이거나 두 손가락으로 커지지 않게
    for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, e => e.preventDefault());
    $('#hud').addEventListener('touchmove', e => e.preventDefault(), { passive: false });
    document.addEventListener('contextmenu', e => e.preventDefault());
  }
  setWeather(Q.get('w') || 'clear', true);
  setWind(Q.get('wind') ? +Q.get('wind') : 1);
  // 화풍은 지난번에 고른 것을 기억한다. 확인용으로 ?toon=1 / ?toon=0 으로 강제할 수 있다.
  let savedStyle = null;
  try { savedStyle = localStorage.getItem('konoha.style'); } catch (e) { /* 기억이 없으면 실사로 */ }
  applyStyle((Q.get('toon') ?? savedStyle) === '1');

  // 확인용 주소: ?shot=x,y,z,yaw,pitch&w=rain&full=1 — 메뉴 없이 그 자리·그 날씨로 바로 본다. &fly=1이면 중력 없이 그 자리에 뜬다.
  const shot = Q.get('shot');
  if (shot) {
    const v = shot.split(',').map(Number);
    player.place(v[0], v[1], v[2], v[3] || 0, v[4] || 0);
    ui.menu.classList.add('hidden'); ui.hud.classList.remove('hidden'); started = true;
    if (Q.get('full')) { weather.snowAcc = weatherType === 'snow' ? 1 : 0; weather.wetAcc = weatherType === 'rain' ? 1 : 0; }
    if (Q.get('nohud')) ui.hud.classList.add('hidden');
    // 확인용: &sky=1 이면 그 자리(x,y,z)에 눈을 띄운 하늘 보기로 시작한다
    if (Q.get('sky')) { player.setSky(true); player.skyPos.set(v[0], v[1], v[2]); player.yaw = v[3] || 0; player.pitch = v[4] || 0; player.sync(); }
  }
  // 걷기 시험용 주소: &walk=방향:초[:달리기];… — 그 방향(yaw)을 보고 앞으로 걷게 한 뒤 선 자리를 콘솔에 적는다(한꺼번에 계산)
  if (Q.get('walk')) {
    player.locked = true;
    Q.get('walk').split(';').map(l => l.split(':').map(Number)).forEach((leg, i) => {
      player.yaw = leg[0];
      // 넷째 값이 있으면 그 초만큼 뛰기를 누르고 있다가 떼고(모아 뛰기) 걷기 시작한다
      if (leg[3]) { player.keys = { Space: true }; for (let n = 0; n < leg[3] * 60; n++) player.update(1 / 60); }
      player.keys = { KeyW: true, ShiftLeft: !!leg[2] };
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
  const chargeEl = $('#charge'); let lastCharge = -1;
  let hudT = 0, lampT = 0, orbit = 0, indoor = 0, fpsN = 0, fpsT = 0, lastDraw = 0;
  const area = q => (q.b[1] - q.b[0]) * (q.b[3] - q.b[2]);
  places.sort((a, b) => area(a) - area(b));     // 좁은 자리(방)가 넓은 자리(마을)보다 먼저
  // 가까운 등불 여섯 개만 켠다
  const placeLamps = p => {
    const near = lights.map(l => [l, (l[0] - p.x) ** 2 + (l[1] - p.y) ** 2 * 4 + (l[2] - p.z) ** 2]).sort((a, b) => a[1] - b[1]);
    lamps.forEach((L, i) => {
      const l = near[i] && near[i][1] < 45 * 45 ? near[i][0] : null;
      if (l) { L.position.set(l[0], l[1], l[2]); L.intensity = l[3] ?? 14; L.distance = l[4] ?? 16; } else L.intensity = 0;
    });
  };
  // 촬영 모드(?film=1): 화면을 돌리는 대신 js/film.js가 장면 목록대로 한 장씩 그려 내보낸다
  if (Q.get('film')) {
    ui.menu.classList.add('hidden');
    const style = on => { if (on && !toon) toon = new Toon(renderer, { samples: 4 }); toonOn = on; W.uToon.value = on ? 1 : 0; };
    style(false);
    (await import('./film.js')).run({ renderer, scene, camera, weather, player, setWeather, style, placeLamps,
      tick: (t, dt) => { for (const f of ticks) f(t, dt); }, draw: () => (toonOn ? toon.render(scene, camera) : renderer.render(scene, camera)) });
    return;
  }
  function frame() {
    requestAnimationFrame(frame);
    if (innerWidth !== viewW || innerHeight !== viewH) fit();
    // 폰: 걷는 동안은 초당 60장까지만, 메뉴가 떠 있는 동안은 20장만 그린다(발열·배터리)
    if (TOUCH) {
      const now = performance.now(), gap = player.locked ? 1000 / 60 : 1000 / 20;
      if (now - lastDraw < gap - 2) return;
      lastDraw = now;
    }
    if (weather.shadowDirty) { renderer.shadowMap.needsUpdate = true; weather.shadowDirty = false; }
    const raw = clock.getDelta(), dt = Math.min(raw, 0.05);
    // 폰이 버거워하면(초당 40장 밑) 그리는 해상도를 한 단계씩 낮춘다. 다시 올리지는 않는다.
    if (TOUCH && started && player.locked) {
      fpsN++; fpsT += raw;
      if (fpsT > 4) { if (fpsN / fpsT < 40 && pixelRatio > 0.8) { pixelRatio = Math.max(0.75, pixelRatio * 0.84); renderer.setPixelRatio(pixelRatio); fit(); } fpsN = fpsT = 0; }
    } else fpsN = fpsT = 0;
    if (started) { if (!Q.get('fly')) player.update(dt); }
    else { // 들어가기 전: 정문 위에서 호카게 바위 쪽을 천천히 훑는 화면
      orbit += dt * 0.04;
      camera.position.set(Math.sin(orbit) * 70, 46 + Math.sin(orbit * 0.6) * 6, 120 + Math.cos(orbit * 0.8) * 30);
      camera.lookAt(Math.sin(orbit) * 10, 26, -150);
    }
    if (player.charge !== lastCharge) { lastCharge = player.charge; chargeEl.style.setProperty('--c', lastCharge); chargeEl.classList.toggle('on', lastCharge > 0); chargeEl.classList.toggle('full', lastCharge >= 1); }
    const wdt = Q.get('freeze') ? 0 : dt;   // 확인용: 날씨·바람의 시간을 멈춘다(두 장을 찍어 깜빡이는 면을 찾을 때)
    weather.update(wdt, camera);
    if (player.sky && started) scene.fog.density *= 0.3;   // 하늘에서는 안개를 걷어 마을 끝까지 보이게
    for (const f of ticks) f(weather.t, wdt);
    if (Q.get('freeze')) weather.leaves.visible = false;
    const p = camera.position;
    indoor += (cover.enclosure(p.x, p.y, p.z) - indoor) * (1 - Math.exp(-dt * 5));
    sound.update(weather.cur.rain, 0.015 + weather.windNow * 0.11, indoor);
    lampT -= dt;
    if (lampT <= 0) { lampT = 0.25; placeLamps(p); }
    hudT -= dt;
    if (hudT <= 0 && started) {
      hudT = 0.2;
      const fy = player.sky ? -99 : player.pos.y;   // 하늘에서는 방(높이가 정해진 자리) 이름은 띄우지 않는다
      if (player.sky) $('#skyAlt').textContent = '높이 ' + Math.round(player.skyHeight()) + 'm';
      const pl = places.find(q => p.x >= q.b[0] && p.x <= q.b[1] && p.z >= q.b[2] && p.z <= q.b[3] && (!q.y || (fy >= q.y[0] - 0.3 && fy < q.y[1])) && (!q.poly || inPoly(p.x, p.z, q.poly))) || null;   // poly가 있으면 그 다각형 안일 때만
      if (pl !== lastPlace) {
        lastPlace = pl;
        ui.place.textContent = pl ? pl.n : '마을 밖 숲'; ui.text.textContent = pl ? (pl.t || '') : '담장 너머는 불의 나라의 깊은 숲이다.';
        $('#placeCard').classList.remove('flash'); void $('#placeCard').offsetWidth; $('#placeCard').classList.add('flash');
      }
    }
    if (toonOn) toon.render(scene, camera); else renderer.render(scene, camera);
  }
  frame();
  if (Q.get('stats')) setTimeout(() => {   // 확인용: 그린 삼각형 수와 한 장 그리는 데 걸린 시간
    const t0 = performance.now(); for (let i = 0; i < 5; i++) renderer.render(scene, camera); renderer.getContext().finish();
    console.log('STATS tris', renderer.info.render.triangles, 'calls', renderer.info.render.calls, 'ms/frame', ((performance.now() - t0) / 5).toFixed(1));
  }, 500);
  window.__ready = true; window.__player = player;   // 확인용
}

init().catch(e => { console.error(e); $('#loadText').textContent = '문제가 생겼습니다: ' + e.message; });
