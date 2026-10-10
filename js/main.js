// 나뭇잎 마을 — 시작점. 재질·지형·건물을 차례로 만들고, 걷기·날씨·소리를 돌린다.
import * as THREE from '../vendor/three.module.js';
import { createMaterials, W, dressLeaves } from './materials.js';
import { Cover, Weather, WEATHERS } from './weather.js';
import { Sound } from './audio.js';
import { Toon } from './toon.js';
import { VillageMap } from './map.js';
import { setupLod } from './lod.js';
import { build as buildPeople, PEOPLE } from './people.js';
import { Player } from './player.js';
import { LOT, WALL, SITE, DEATH } from './layout.js';
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
  ['hokage', '호카게 관저를 올리는 중…'], ['root', '땅속 깊은 곳을 파는 중…'], ['academy', '닌자 아카데미를 짓는 중…'], ['swing', '아카데미 마당에 그네를 다는 중…'],
  ['naruto', '나루토의 집을 짓는 중…'], ['sakura', '사쿠라의 집을 짓는 중…', 'homes'], ['ino', '야마나카 꽃집을 여는 중…', 'homes'],
  ['ichiraku', '이치라쿠 라멘의 국물을 끓이는 중…'], ['choji', '쵸지네 밥상을 차리는 중…', 'homes'], ['inoichi', '야마나카 본가의 꽃병에 물을 가는 중…', 'homes'], ['hyuga', '휴우가 종가의 다다미를 까는 중…', 'homes'], ['sarutobi', '사루토비 본가의 서가를 채우는 중…', 'homes'], ['inuzuka', '이누즈카 본가의 밥그릇을 채우는 중…', 'homes'], ['aburame', '아부라메 본가의 사육 상자를 살피는 중…', 'homes'], ['nara', '시카마루네 장기판을 펴는 중…', 'homes'], ['sasuke', '사스케의 집을 짓는 중…', 'uchiha'], ['shrine', '남가 신사를 세우는 중…', 'uchiha'],
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
  if (!only && Q.get('ppl') !== '0') { await say('마을 사람들이 나오는 중…'); ctx.pplRow = !!Q.get('pplrow'); ctx.pplLog = !!Q.get('ppllog'); ctx.pplWarm = +Q.get('pplwarm') || 0; try { take(await buildPeople(scene, ctx)); } catch (e) { console.error('마을 사람 세우기 실패', e); } }

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
  const ui = { menu: $('#menu'), hud: $('#hud') };
  let started = false, weatherType = 'clear', windLevel = 1, mapOpen = false;
  const WIND = ['잔잔', '산들', '강풍'];
  const setWeather = (type, instant) => {
    weatherType = type; weather.set(type, instant);
    document.querySelectorAll('[data-weather]').forEach(b => b.classList.toggle('on', b.dataset.weather === type));
    $('#btnWeather').textContent = WEATHERS.find(w => w[0] === type)[1];
  };
  const setWind = lv => {
    windLevel = lv; weather.setWind(lv);
    document.querySelectorAll('[data-wind]').forEach(b => b.classList.toggle('on', +b.dataset.wind === lv));
    $('#btnWind').textContent = '바람 ' + WIND[lv];
  };
  // 화풍: 만화(기본) ↔ 실사. 재질은 그대로 두고 칠하는 법(W.uToon)만 바꾼다. 만화는 먹선을 긋느라 한 번 거쳐 그린다(toon.js).
  let toon = null, toonOn = false;
  const STYLE = ['실사', '만화'];
  const applyStyle = on => {
    toonOn = on; W.uToon.value = on ? 1 : 0; weather.envDirty = 2; weather.shadowDirty = true;   // 나무 그림자도 화풍 따라 바뀐다(낱잎 ↔ 잎 덩어리)
    if (on && !toon) toon = new Toon(renderer, { samples: TOUCH ? 2 : 4 });
    document.querySelectorAll('[data-style]').forEach(b => b.classList.toggle('on', (b.dataset.style === '1') === on));
    $('#btnStyle').textContent = STYLE[+on];
  };
  const setStyle = on => {
    if (on === toonOn) return;
    if (!on || toon) return applyStyle(on);
    // 처음 만화로 바꿀 때는 칠하는 법을 새로 준비하느라 잠깐 멈춘다 → 알림을 먼저 띄우고 바꾼다
    $('#styleNote').classList.remove('hidden');
    setTimeout(() => { applyStyle(true); requestAnimationFrame(() => requestAnimationFrame(() => $('#styleNote').classList.add('hidden'))); }, 40);
  };
  $('#styleBtns').innerHTML = [1, 0].map(i => `<button data-style="${i}">${STYLE[i]}</button>`).join('');   // 기본인 만화를 앞에 둔다
  $('#styleBtns').addEventListener('click', e => { const b = e.target.closest('[data-style]'); if (b) setStyle(b.dataset.style === '1'); });
  // 마을 사람의 얼굴(눈·눈썹·입)을 그릴지. 확인용으로 ?face=0 으로 끄고 시작할 수 있다
  const setFace = on => { PEOPLE.uFace.value = on ? 1 : 0; for (const b of $('#faceBtns').children) b.classList.toggle('on', (b.dataset.face === '1') === on); };
  $('#faceBtns').innerHTML = [['1', '그리기'], ['0', '비우기']].map(([v, n]) => `<button data-face="${v}">${n}</button>`).join('');
  $('#faceBtns').addEventListener('click', e => { const b = e.target.closest('[data-face]'); if (b) setFace(b.dataset.face === '1'); });
  setFace(Q.get('face') !== '0');
  const WX_NAME = { clear: '맑은 날', cloudy: '구름 낀 날', rain: '비 오는 날', snow: '눈 오는 날' };
  $('#weatherBtns').innerHTML = WEATHERS.map(([k], i) => `<button data-weather="${k}"><i class="wx wx-${k}"></i><span>${WX_NAME[k]}</span><kbd>${i + 1}</kbd></button>`).join('');
  $('#weatherBtns').addEventListener('click', e => { const b = e.target.closest('[data-weather]'); if (b) setWeather(b.dataset.weather); });
  $('#windBtns').innerHTML = WIND.map((n, i) => `<button data-wind="${i}">${n}</button>`).join('');
  $('#windBtns').addEventListener('click', e => { const b = e.target.closest('[data-wind]'); if (b) setWind(+b.dataset.wind); });
  jumps.sort((a, b) => a[0].localeCompare(b[0], 'ko'));   // 바로 가기는 가나다 차례로
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
  };
  player.onLock = locked => {
    // 지도를 편 것이면 두루마리는 띄우지 않는다. 걷다가 Esc로 두루마리를 띄웠을 때도 미니맵은 그대로 보인다(HUD에서 미니맵만 남긴다)
    const menuUp = !locked && !mapOpen;
    ui.menu.classList.toggle('hidden', !menuUp); ui.hud.classList.toggle('hidden', menuUp && !started); ui.hud.classList.toggle('menu', menuUp && started);
    player.roam = mapOpen && !locked; if (!locked) freedAt = performance.now(); else waitLock = false;   // 지도를 편 채 마우스가 풀렸으면 자판만으로 걷는다
    $('#enterBtn').textContent = started ? '계속 걷기' : '마을로 들어가기';
    if (sound.ctx) locked || mapOpen ? sound.ctx.resume() : sound.ctx.suspend();
  };
  /* ---------- 지도: 걷는 동안의 미니맵, M으로 여닫는 전체 지도 ---------- */
  const vmap = new VillageMap({ places, jumps, mini: $('#mini'), view: $('#mapView'), canvas: $('#mapCanvas'), panel: $('#mapPanel'), here: $('#mapHere') });
  // 그 자리의 이름(가장 먼저 걸리는 이름표). 하늘에서는 방처럼 높이가 정해진 자리는 치지 않는다
  let hereName = '', nameTick = 0, heldAt = null;   // heldAt = 이름 붙은 곳에 마지막으로 서 있던 자리
  const placeAt = (x, y, z) => places.find(q => x >= q.b[0] && x <= q.b[1] && z >= q.b[2] && z <= q.b[3] && (!q.y || (y >= q.y[0] - 0.3 && y < q.y[1])) && (!q.poly || inPoly(x, z, q.poly))) || null;   // poly가 있으면 그 다각형 안일 때만
  // 전체 지도는 편 채로도 걷는다. 마우스를 놓지 않으므로 누르고 있던 자판이 그대로 살아 달리던 걸음이 끊기지 않고, 마우스로 방향도 바꾼다.
  // Esc로 마우스를 풀면 지도를 짚어 볼 수 있다(그동안은 자판으로 걷고 좌우 화살표로 몸을 돌린다). 지도를 누르면 마우스를 다시 잡는다.
  let freedAt = 0, waitLock = false;   // waitLock = 지도를 닫았는데 마우스를 아직 못 잡았다: 메뉴 없이 걷는 화면에서 기다린다
  const openMap = () => {
    if (!started || mapOpen) return;
    mapOpen = true; ui.hud.classList.add('map'); vmap.open();
    if (player.touchMode) player.unlock();   // 폰에는 마우스가 없다: 손가락으로 지도를 짚는다
    player.roam = !player.locked;
  };
  const closeMap = () => {
    if (!mapOpen) return;
    mapOpen = player.roam = false; ui.hud.classList.remove('map'); vmap.close();
    if (player.locked) return;
    // Esc로 닫으면 브라우저가 마우스를 바로 잡게 해 주지 않는다. 두루마리를 띄우지 않고 걷는 화면에 그대로 두었다가, 다음에 누르는 자판이나 마우스에 잡는다
    waitLock = !player.touchMode; player.lock();
  };
  const grab = e => {
    if (!waitLock || mapOpen || player.locked) return;
    if (e.code === 'Escape') { waitLock = false; player.onLock(false); return; }   // 기다리는 중의 Esc는 메뉴를 연다
    player.lock();
  };
  addEventListener('keydown', grab); addEventListener('mousedown', grab);
  $('#mapClose').addEventListener('click', closeMap);
  $('#mapCanvas').addEventListener('click', () => { if (mapOpen && !player.locked && !player.touchMode) player.lock(); });
  // 미니맵의 축척: 둘레 몇 m를 담을지. + 는 가까이(좁게), − 는 멀리(넓게)
  const MINI = [50, 80, 120, 200, 350, 600]; let miniI = 2;
  const zoomMini = d => { miniI = Math.max(0, Math.min(MINI.length - 1, miniI - d)); };
  for (const [sel, d] of [['#miniIn', 1], ['#miniOut', -1]]) $(sel).addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); zoomMini(d); });
  addEventListener('keydown', e => {
    if (e.code === 'KeyM' && !e.repeat) { if (mapOpen) closeMap(); else if (player.locked) openMap(); return; }
    // Tab: 지도를 편 채 마우스를 풀거나 다시 잡는다. 우리가 푼 것이라 브라우저가 언제든 바로 다시 잡게 해 준다(Esc로 풀린 것은 그렇지 않다)
    if (e.code === 'Tab' && mapOpen && !player.touchMode && !e.repeat) { e.preventDefault(); if (player.locked) player.unlock(); else player.lock(); return; }
    if (e.code === 'Escape' && mapOpen) { if (!player.locked && performance.now() - freedAt > 300) closeMap(); return; }   // 마우스를 잡고 있을 때의 Esc는 마우스만 푼다(브라우저가 한다)
    if ((player.locked || mapOpen) && (e.code === 'NumpadAdd' || e.code === 'NumpadSubtract')) { zoomMini(e.code === 'NumpadAdd' ? 1 : -1); return; }
    if (!player.locked) return;
    const i = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
    if (i >= 0) setWeather(WEATHERS[i][0]);
    if (e.code === 'KeyN') setMute(!sound.muted);
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
    tap('#btnMap', () => { endMove(); lookId = null; openMap(); });
    tap('#btnMenu', () => { endMove(); lookId = null; player.unlock(); });
    // 화면이 끌려 움직이거나 두 손가락으로 커지지 않게
    for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, e => e.preventDefault());
    $('#hud').addEventListener('touchmove', e => e.preventDefault(), { passive: false });
    document.addEventListener('contextmenu', e => e.preventDefault());
  }
  setWeather(Q.get('w') || 'clear', true);
  setWind(Q.get('wind') ? +Q.get('wind') : 1);
  // 화풍은 들어올 때마다 만화로 시작한다(실사는 보는 동안만 — 새로 고치면 만화로 돌아온다). 확인용으로 ?toon=1 / ?toon=0 으로 강제할 수 있다.
  dressLeaves(scene);
  const lod = Q.get('lod') === '0' ? null : setupLod(scene, camera);   // 먼 건물의 잔 장식과 먼 나무를 가볍게(확인용: &lod=0 이면 끈다)
  applyStyle((Q.get('toon') ?? '1') === '1');

  // 확인용 주소: ?shot=x,y,z,yaw,pitch&w=rain&full=1 — 메뉴 없이 그 자리·그 날씨로 바로 본다. &fly=1이면 중력 없이 그 자리에 뜬다.
  const shot = Q.get('shot');
  if (shot) {
    const v = shot.split(',').map(Number);
    player.place(v[0], v[1], v[2], v[3] || 0, v[4] || 0);
    ui.menu.classList.add('hidden'); ui.hud.classList.remove('hidden'); started = true;
    if (Q.get('full')) { weather.snowAcc = weatherType === 'snow' ? 1 : 0; weather.wetAcc = weatherType === 'rain' ? 1 : 0; }
    if (Q.get('nohud')) ui.hud.classList.add('hidden');
    if (Q.get('map')) openMap();   // 확인용: &map=1 이면 전체 지도를 연 채로 시작한다
    // 확인용: &sky=1 이면 그 자리(x,y,z)에 눈을 띄운 하늘 보기로 시작한다
    if (Q.get('sky')) { player.setSky(true); player.skyPos.set(v[0], v[1], v[2]); player.yaw = v[3] || 0; player.pitch = v[4] || 0; player.sync(); }
    // 확인용: &land=1 이면 그 하늘 자리에서 곧바로 내려서고, 내려선 자리를 적는다
    if (Q.get('sky') && Q.get('land')) { player.setSky(false); console.log('WALK land ' + [player.pos.x, player.pos.y, player.pos.z].map(n => n.toFixed(2)).join(' ')); }
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
  let gloom = 0, gloomCss = '';
  const gloomEl = $('#gloom'), GLOOM_FOG = new THREE.Color(0x24364e);
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
    if (toonOn) scene.fog.density *= 0.5;                  // 만화 화풍은 먼 데까지 또렷하다(바위가 뿌옇게 바래지 않게)
    // 죽음의 숲: 철망 안으로 들어갈수록 어두워지고 푸른 빛이 덮인다(안개도 짙고 검푸르게, 볕은 약하게). 하늘에서 볼 때는 덮지 않는다
    { const at = camera.position, dg = !player.sky ? Math.max(0, Math.min(1, (DEATH.rf + 6 - Math.hypot(at.x - DEATH.c[0], at.z - DEATH.c[1])) / 30)) : 0;
      if (gloomCss === '' || Q.get('shot')) gloom = dg; else gloom += (dg - gloom) * (1 - Math.exp(-dt * 1.6));   // 처음 뜰 때와 확인용 화면에서는 곧바로
      if (gloom > 0.004) { scene.fog.color.lerp(GLOOM_FOG, gloom * 0.9); scene.fog.density += (0.03 - scene.fog.density) * gloom; weather.sun.intensity *= 1 - 0.55 * gloom; renderer.toneMappingExposure *= 1 - 0.18 * gloom; }
      const gs = (gloom * 0.86).toFixed(3); if (gs !== gloomCss) gloomEl.style.setProperty('--g', gloomCss = gs); }
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
      if (player.sky) $('#skyAlt').textContent = '높이 ' + Math.round(player.skyHeight()) + 'm';
    }
    // 미니맵: 걷는 동안은 둘레 120m, 하늘에서는 높이만큼 넓게
    if (started && !ui.hud.classList.contains('hidden')) {
      const at = player.sky ? player.skyPos : player.pos;
      // 땅속(뿌리 본거지)에 들어가 있으면 지도도 그 층의 지하 도면으로 바뀐다
      const deep = !player.sky && player.pos.y < -1.5 ? vmap.levelAt(at.x, player.pos.y, at.z) : -1;
      if (deep !== vmap.level) { vmap.setLevel(deep); $('#mapView h2').textContent = deep < 0 ? '나뭇잎 마을 지도' : '뿌리 본거지 · ' + vmap.levelName(); }
      vmap.drawMini(at.x, at.z, player.yaw, deep >= 0 ? Math.min(60, MINI[miniI] * 0.4) : Math.min(760, MINI[miniI] * (player.sky ? Math.max(1.25, Math.min(6, player.skyHeight() / 110)) : 1)));
      // 미니맵 위 팻말과 전체 지도의 현재위치: 지금 선 자리의 이름(자리 찾기는 여섯 장에 한 번)
      if (!(nameTick++ % 6) || mapOpen) {
        const y = player.sky ? -99 : player.pos.y, pl = placeAt(at.x, y, at.z), broad = !pl || pl.n === '나뭇잎 마을';
        let n = pl ? pl.n : '마을 밖 숲';
        // 이름 붙은 곳을 막 벗어난 틈(문턱, 담과 울타리 사이)에서는 앞의 이름을 그대로 둔다 — 7m 넘게 벗어나야 '나뭇잎 마을'로 바뀐다
        if (!broad) heldAt = player.sky ? null : [at.x, y, at.z];
        else if (heldAt && !player.sky && Math.hypot(at.x - heldAt[0], at.z - heldAt[2]) < 7 && Math.abs(y - heldAt[1]) < 3.5) n = hereName;
        else heldAt = null;
        if (n !== hereName) $('#miniName b').textContent = hereName = n;
      }
      if (mapOpen) vmap.mark(at.x, at.z, player.yaw, hereName, player.locked && !player.touchMode);
    }
    if (lod) lod.tick();
    if (toonOn) toon.render(scene, camera); else renderer.render(scene, camera);
  }
  frame();
  if (Q.get('stats')) setTimeout(() => {   // 확인용: 그린 삼각형 수와 한 장 그리는 데 걸린 시간
    const t0 = performance.now(); for (let i = 0; i < 5; i++) renderer.render(scene, camera); renderer.getContext().finish();
    console.log('STATS tris', renderer.info.render.triangles, 'calls', renderer.info.render.calls, 'ms/frame', ((performance.now() - t0) / 5).toFixed(1));
  }, 500);
  // 확인용: 그 자리·그 화풍에서 n장을 그려 한 장에 걸린 시간(ms)과 그린 삼각형 수를 잰다. shadow = 그림자 지도도 매번 다시 그릴 때
  window.__bench = (x, y, z, yaw, pitch, toonMode, n = 40, shadow = false) => {
    const gl = renderer.getContext(), px = new Uint8Array(4);
    applyStyle(toonMode); player.pos.set(x, y, z); player.yaw = yaw; player.pitch = pitch; player.sync(); weather.update(0.016, camera);
    for (let i = 0; i < 400; i++) for (const f of ticks) f(weather.t, 0.016);   // 둘레의 집·나무가 그 자리에 맞는 모습으로 바뀔 때까지 돌린다
    if (lod) { for (let i = 0; i < 200000 && lod.stats().pending; i++) lod.tick(); lod.tick(); }
    const draw = () => { if (shadow) renderer.shadowMap.needsUpdate = true; if (toonOn) toon.render(scene, camera); else renderer.render(scene, camera); };
    for (let i = 0; i < 5; i++) draw(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);   // 셰이더를 미리 데운다
    renderer.info.autoReset = false; renderer.info.reset();
    const t0 = performance.now(); for (let i = 0; i < n; i++) draw(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const ms = (performance.now() - t0) / n, out = { ms: +ms.toFixed(2), tris: Math.round(renderer.info.render.triangles / n), calls: Math.round(renderer.info.render.calls / n) };
    renderer.info.autoReset = true;
    return out;
  };
  // 확인용: 겹쳐서 깜빡이는 면 찾기. 자리마다 가까운 면(near)만 조금 바꿔 두 장을 그려, 달라진 8점 묶음의 수와 그 한가운데(화면 비율)를 돌려준다.
  // views = [[x, 발 높이 y, z, yaw, pitch], …]
  let zrt = null;
  window.__zscan = (views, W = 640, H = 360) => {
    zrt = zrt || new THREE.WebGLRenderTarget(W, H);
    const a = new Uint8Array(W * H * 4), b = new Uint8Array(W * H * 4), out = [], asp = camera.aspect, near = camera.near;
    weather.leaves.visible = false; camera.aspect = W / H;
    const shot = (n, buf) => { camera.near = n; camera.updateProjectionMatrix(); renderer.setRenderTarget(zrt); renderer.render(scene, camera); renderer.readRenderTargetPixels(zrt, 0, 0, W, H, buf); renderer.setRenderTarget(null); };
    for (const [x, y, z, yaw, pitch] of views) {
      player.pos.set(x, y, z); player.yaw = yaw; player.pitch = pitch; player.sync();
      if (x !== zrt.x || z !== zrt.z || y !== zrt.y) { zrt.x = x; zrt.y = y; zrt.z = z; for (let i = 0; i < 60; i++) for (const f of ticks) f(weather.t, 0.016); }   // 자리가 바뀌었을 때만 둘레를 그 자리에 맞춘다
      if (lod) { for (let i = 0; i < 200000 && lod.stats().pending; i++) lod.tick(); lod.tick(); }
      shot(0.18, a); shot(0.1931, b);
      const BW = W >> 3, BH = H >> 3, cnt = new Uint8Array(BW * BH);
      for (let py = 0; py < BH * 8; py++) for (let px = 0; px < BW * 8; px++) { const i = (py * W + px) * 4; if (Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])) > 30) cnt[(py >> 3) * BW + (px >> 3)]++; }
      let n = 0, sx = 0, sy = 0; for (let i = 0; i < cnt.length; i++) if (cnt[i] >= 6) { n++; sx += i % BW; sy += Math.floor(i / BW); }
      out.push(n ? [n, +(sx / n / BW).toFixed(2), +(1 - sy / n / BH).toFixed(2)] : 0);
    }
    camera.aspect = asp; camera.near = near; camera.updateProjectionMatrix();
    return out;
  };
  window.__places = places; window.__jumps = jumps;
  window.__ready = true; window.__player = player; window.__scene = scene; window.__camera = camera; window.__lod = lod;   // 확인용
}

init().catch(e => { console.error(e); $('#loadText').textContent = '문제가 생겼습니다: ' + e.message; });
