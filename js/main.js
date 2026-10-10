// 나뭇잎 마을 — 시작점. 재질·지형·건물을 차례로 만들고, 걷기·날씨·소리를 돌린다.
import * as THREE from '../vendor/three.module.js';
import { createMaterials, W, dressLeaves } from './materials.js';
import { Cover, Weather, WEATHERS } from './weather.js';
import { Sound } from './audio.js';
import { Toon } from './toon.js';
import { VillageMap } from './map.js';
import { setupLod } from './lod.js';
import { build as buildPeople, PEOPLE } from './people.js';
import { VERSION, LOG } from './version.js';
import { initStats, stat, statOnce } from './stats.js';
import { Player } from './player.js';
import { LOT, WALL, SITE, DEATH } from './layout.js';
import { marks, settle, colliders, leanScene } from './build.js';
import { buildVillage, terrainH, inPoly } from './village.js';

const $ = s => document.querySelector(s);
const tick = () => new Promise(r => setTimeout(r, 0));
// 주소 뒤의 확인용 매개변수(shot·sky·fly 따위)는 내 컴퓨터에서 열었을 때만 듣는다. 공개 주소에서는 모두 무시한다
const LOCAL = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
const Q = new URLSearchParams(LOCAL ? location.search : '');
initStats(LOCAL);
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
  let pixelRatio = Math.min(devicePixelRatio, 1.5);   // 폰도 PC와 같은 촘촘함으로 시작한다(낮게 그리면 먹선이 흐리고 거칠어진다)
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
  // 폰: 그림자 지도를 작게 하고, 그림자를 드리우는 범위도 걷는 사람 둘레 60m로 좁힌다(그릴 것이 크게 줄고, 가까운 그림자는 PC만큼 또렷하다)
  if (TOUCH) { weather.sun.shadow.mapSize.set(2048, 2048); weather.shadowSpan = 120; const sc = weather.sun.shadow.camera; sc.left = sc.bottom = -60; sc.right = sc.top = 60; sc.updateProjectionMatrix(); }

  const places = [], jumps = [], lights = [], glows = [], skip = [...weather.skip], ticks = [];
  const take = r => {
    if (!r) return;
    places.push(...(r.places || [])); jumps.push(...(r.jumps || [])); lights.push(...(r.lights || []));
    glows.push(...(r.glows || [])); skip.push(...(r.skip || [])); if (r.tick) ticks.push(r.tick);
  };
  // 확인용(?mem=1): 짓는 단계마다 도형 자료가 얼마나 늘었는지 적어 둔다
  const memSeen = new Set(), memLog = []; window.__memMark = name => { if (!Q.get('mem')) return; let b = 0, tri = 0; scene.traverse(o => { const g = o.geometry; if (!g || memSeen.has(g)) return; memSeen.add(g); for (const k in g.attributes) b += g.attributes[k].array.byteLength; if (g.index) b += g.index.array.byteLength; tri += (g.index ? g.index.count : g.attributes.position ? g.attributes.position.count : 0) / 3; }); memLog.push(name + '=' + (b / 1048576).toFixed(0) + 'MB/' + Math.round(tri / 1000) + 'k'); };
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
    window.__memMark(name);
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
  // 화풍은 만화 하나뿐이다(고르는 단추는 없앴다). 실사로 칠하는 길은 확인용(?toon=0)으로만 남겨 둔다. 만화는 먹선을 긋느라 한 번 거쳐 그린다(toon.js).
  let toon = null, toonOn = false;
  const applyStyle = on => {
    toonOn = on; W.uToon.value = on ? 1 : 0; weather.envDirty = 2; weather.shadowDirty = true;   // 나무 그림자도 화풍 따라 바뀐다(낱잎 ↔ 잎 덩어리)
    if (on && !toon) toon = new Toon(renderer, { samples: 4 });
  };
  // 마을 사람의 얼굴(눈·눈썹·입)은 늘 그린다. 확인용으로만 ?face=0 으로 끌 수 있다
  PEOPLE.uFace.value = Q.get('face') !== '0' ? 1 : 0;
  const WX_NAME = { clear: '맑은 날', cloudy: '구름 낀 날', rain: '비 오는 날', snow: '눈 오는 날' };
  $('#weatherBtns').innerHTML = WEATHERS.map(([k], i) => `<button data-weather="${k}"><i class="wx wx-${k}"></i><span>${WX_NAME[k]}</span><kbd>${i + 1}</kbd></button>`).join('');
  $('#weatherBtns').addEventListener('click', e => { const b = e.target.closest('[data-weather]'); if (b) setWeather(b.dataset.weather); });
  $('#windBtns').innerHTML = WIND.map((n, i) => `<button data-wind="${i}">${n}</button>`).join('');
  $('#windBtns').addEventListener('click', e => { const b = e.target.closest('[data-wind]'); if (b) setWind(+b.dataset.wind); });
  jumps.sort((a, b) => a[0].localeCompare(b[0], 'ko'));   // 바로 가기는 가나다 차례로
  // 판 번호와 '바뀐 내용' 두루마리. 새 판이 나온 뒤 처음 들어왔을 때만 저절로 펴고(브라우저에 마지막으로 본 판을 적어 둔다), 그 뒤로는 판 단추로 연다
  { const btn = $('#verBtn'), box = $('#verScroll'), KEY = 'konoha.ver';
    const show = list => { $('#verLog').innerHTML = list.map(l => `<article><h3>Ver ${l.v} ${l.title}<small>${l.date.replace(/-/g, '.')}</small></h3><ul>${l.items.map(t => `<li>${t}</li>`).join('')}</ul></article>`).join(''); clearTimeout(rollT); box.classList.remove('hidden', 'unroll', 'rollup'); const sh = box.querySelector('.sheet'); sh.scrollTop = 0; box.style.setProperty('--h', sh.offsetHeight + 'px'); box.classList.add('unroll');   // 종이 높이를 재서, 그만큼 풀려 내려오게 한다
      btn.setAttribute('aria-expanded', 'true'); };
    let rollT = 0;
    const hide = () => {   // 말려 올라간 다음에 치운다
      if (box.classList.contains('hidden') || box.classList.contains('rollup')) return;
      btn.setAttribute('aria-expanded', 'false'); box.classList.remove('unroll'); void box.offsetWidth; box.classList.add('rollup');
      rollT = setTimeout(() => box.classList.add('hidden'), 460);
    };
    btn.textContent = 'Ver ' + VERSION;
    btn.addEventListener('click', () => (box.classList.contains('hidden') || box.classList.contains('rollup') ? show(LOG) : hide()));   // 단추로 열면 모든 판을 최신부터 보여 준다
    $('#verClose').addEventListener('click', hide);
    let seen = null; try { seen = localStorage.getItem(KEY); } catch (e) { /* 저장소를 못 쓰는 브라우저 */ }
    const force = Q.get('ver');                                        // 확인용: ?ver=1 펴기, ?ver=toast 좁은 화면의 한 줄 알림
    if (seen !== VERSION || force) {
      const i = LOG.findIndex(l => l.v === seen), fresh = i < 0 ? LOG : LOG.slice(0, i);   // 못 본 판을 모두(최신부터)
      if (force === 'toast' || (!force && (ctx.mobile || innerWidth <= 920))) { const t = $('#verToast'); t.textContent = '새로 바뀐 내용이 있어요. 눌러서 볼 수 있어요.'; t.classList.remove('hidden'); setTimeout(() => t.classList.add('hidden'), 8000); }
      else show(fresh.length ? fresh : LOG);
      try { localStorage.setItem(KEY, VERSION); } catch (e) { /* 적지 못하면 다음에도 뜬다 */ }
    } }
  // 두루마리에는 대표적인 곳만 올린다(이 차례대로). [단추에 적을 이름, 바로 가기 자리의 이름]. 나머지 자리는 지도의 붉은 점으로만 남는다
  const QUICK = [['정문'], ['마을 중앙', '큰길 한가운데'], ['호카게 관저 앞'], ['닌자 아카데미'], ['이치라쿠 라멘'], ['나루토의 집'], ['사쿠라의 집', '사쿠라의 집 앞'], ['사스케의 집'], ['센쥬 공원']];
  const quick = QUICK.map(([n, at = n]) => { const j = jumps.find(q => q[0] === at); return j && [n, ...j.slice(1)]; }).filter(Boolean);
  $('#jumpBtns').innerHTML = quick.map((j, i) => `<button data-jump="${i}">${j[0]}</button>`).join('');
  const enter = () => { sound.start(); if (!started) { statOnce('enter_village'); startedAt = performance.now(); } started = true; resume(); };
  // 통계: 마을 안에서 머문 시간을 1·3·5·10·20·30분 고비마다 한 번씩 보낸다
  let startedAt = 0; { const MARKS = [1, 3, 5, 10, 20, 30]; setInterval(() => { if (!startedAt || document.hidden) return; const m = (performance.now() - startedAt) / 60000; for (const k of MARKS) if (m >= k) statOnce('stay_minutes', { minutes: k }); }, 20000); }
  $('#jumpBtns').addEventListener('click', e => { const b = e.target.closest('[data-jump]'); if (!b) return; const j = quick[b.dataset.jump]; stat('jump', { place: j[0] }); player.place(j[1], j[2], j[3], j[4]); enter(); });
  // 하늘에서 둘러보기는 만드는 사람만: 내 컴퓨터(localhost)에서 열었을 때만 단추·자판이 살아 있다
  const DEV = LOCAL && Q.get('dev') !== '0';   // ?dev=0: 내 컴퓨터에서 공개판 모습 확인
  document.body.classList.toggle('dev', DEV); player.canSky = DEV;
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
    player.roam = !locked && (mapOpen || (started && !player.touchMode)); if (!locked) freedAt = performance.now(); else waitLock = false;   // 지도나 두루마리를 편 채 마우스가 풀렸으면 자판만으로 계속 걷는다
    $('#enterBtn').textContent = started ? '계속 걷기' : '마을로 들어가기';
    if (sound.ctx) locked || mapOpen || player.roam ? sound.ctx.resume() : sound.ctx.suspend();
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
    waitLock = !player.touchMode; player.roam = waitLock; player.lock();   // 마우스를 잡기 전에도 자판으로는 바로 걷는다
  };
  ui.menu.addEventListener('click', e => { const b = e.target.closest('button'); if (b) b.blur(); });   // 누른 단추에 자판이 붙어 있으면 걷다가 누른 Space에 다시 눌린다
  // 두루마리를 걷고 걷는 화면으로 돌아간다. Esc로 마우스를 푼 바로 뒤에는 브라우저가 마우스를 다시 잡게 해 주지 않으므로(1초쯤),
  // 두루마리부터 걷어 놓고 잡힐 때까지 몇 번 다시 청한다. 그래도 못 잡으면 다음에 누르는 자판이나 마우스에 잡는다(grab)
  let lockT = 0;
  const resume = () => {
    ui.menu.classList.add('hidden'); ui.hud.classList.remove('hidden', 'menu');
    waitLock = !player.touchMode; player.lock();
    clearInterval(lockT); let n = 0;
    lockT = setInterval(() => { if (player.locked || !waitLock || ++n > 14) return clearInterval(lockT); player.lock(); }, 150);
  };
  const grab = e => {
    if (!waitLock || mapOpen || player.locked) return;
    if (e.code === 'Escape') { waitLock = false; e.menuDone = true; player.onLock(false); return; }   // 기다리는 중의 Esc는 메뉴를 연다
    player.lock();
  };
  addEventListener('keydown', grab); addEventListener('mousedown', grab);
  $('#mapClose').addEventListener('click', closeMap);
  $('#mapCanvas').addEventListener('click', () => { if (mapOpen && !player.locked && !player.touchMode) player.lock(); });
  // 미니맵의 축척: 둘레 몇 m를 담을지. + 는 가까이(좁게), − 는 멀리(넓게)
  const MINI = [50, 80, 120, 200, 350, 600]; let miniI = 2;
  const zoomMini = d => { miniI = Math.max(0, Math.min(MINI.length - 1, miniI - d)); };
  for (const [sel, d] of [['#miniIn', 1], ['#miniOut', -1]]) $(sel).addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); zoomMini(d); });
  // 도움말: H로 여닫는다(눌러도 된다). 켜 둔 것은 브라우저가 기억한다
  let helpOn = false;
  const setHelp = on => { helpOn = on; $('#help').classList.toggle('open', on); $('#helpBody').classList.toggle('hidden', !on); try { localStorage.setItem('konoha.help', on ? '1' : '0'); } catch (e) { /* 못 적어도 그만 */ } };
  $('#helpTab').addEventListener('click', () => setHelp(true)); $('#helpBody').addEventListener('click', () => setHelp(false));
  { let on = Q.get('help') === '1'; try { on = on || localStorage.getItem('konoha.help') === '1'; } catch (e) { /* 없음 */ } if (on) setHelp(true); if (Q.get('nohud')) $('#help').classList.add('hidden'); }
  addEventListener('keydown', e => {
    if (e.code === 'KeyM' && !e.repeat) { if (mapOpen) closeMap(); else if (player.locked) openMap(); return; }
    // Tab: 지도를 편 채 마우스를 풀거나 다시 잡는다. 우리가 푼 것이라 브라우저가 언제든 바로 다시 잡게 해 준다(Esc로 풀린 것은 그렇지 않다)
    if (e.code === 'Tab' && mapOpen && !player.touchMode && !e.repeat) { e.preventDefault(); if (player.locked) player.unlock(); else player.lock(); return; }
    if (e.code === 'Escape' && mapOpen) { if (!player.locked && performance.now() - freedAt > 300) closeMap(); return; }   // 마우스를 잡고 있을 때의 Esc는 마우스만 푼다(브라우저가 한다)
    if ((player.locked || mapOpen) && (e.code === 'NumpadAdd' || e.code === 'NumpadSubtract')) { zoomMini(e.code === 'NumpadAdd' ? 1 : -1); return; }
    if (e.code === 'KeyH' && !e.repeat && !TOUCH) { setHelp(!helpOn); return; }
    // 두루마리가 떠 있을 때의 Esc는 두루마리를 걷는다(들어가기 전의 첫 화면에서는 아니다)
    if (e.code === 'Escape' && !e.repeat && !e.menuDone && started && !player.locked && !ui.menu.classList.contains('hidden') && performance.now() - freedAt > 300) { resume(); return; }
    if (!player.locked) return;
    const i = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
    if (i >= 0) setWeather(WEATHERS[i][0]);
    if (e.code === 'KeyN') setMute(!sound.muted);
    if (e.code === 'KeyB') setWind((windLevel + 1) % 3);
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
    tap('#btnSky', () => player.setSky(!player.sky));
    tap('#btnMap', () => { endMove(); lookId = null; openMap(); });
    tap('#mini', () => { endMove(); lookId = null; openMap(); });   // 미니맵을 누르면 전체 지도가 펴진다
    tap('#btnMenu', () => { endMove(); lookId = null; player.unlock(); });
    // 화면이 끌려 움직이거나 두 손가락으로 커지지 않게
    for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, e => e.preventDefault());
    $('#hud').addEventListener('touchmove', e => e.preventDefault(), { passive: false });
    document.addEventListener('contextmenu', e => e.preventDefault());
  }
  setWeather(Q.get('w') || 'clear', true);
  setWind(Q.get('wind') ? +Q.get('wind') : 1);
  // 화풍은 늘 만화다. 확인용으로 ?toon=1 / ?toon=0 으로 강제할 수 있다.
  dressLeaves(scene);
  window.__memMark('나머지'); if (Q.get('mem')) console.log('MEMSTEP ' + memLog.join(' | '));
  leanScene(scene);   // 고정 도형은 그래픽 카드로 올린 뒤 이쪽 사본을 버리게 해 둔다(폰의 메모리가 모자라 페이지가 닫히던 문제)
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
  const gloomEl = $('#gloom'), GLOOM_FOG = new THREE.Color(0x24364e), GLOOM_SKY = new THREE.Color(0x101a2c);
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
    // 폰이 많이 버거워하면(초당 28장 밑) 그리는 해상도를 한 단계씩 낮춘다. 먹선이 뭉개지지 않게 1.1배 밑으로는 내리지 않는다. 다시 올리지는 않는다.
    if (TOUCH && started && player.locked) {
      fpsN++; fpsT += raw;
      if (fpsT > 4) { if (fpsN / fpsT < 28 && pixelRatio > 1.1) { pixelRatio = Math.max(1.1, pixelRatio * 0.88); renderer.setPixelRatio(pixelRatio); fit(); } fpsN = fpsT = 0; }
    } else fpsN = fpsT = 0;
    if (started) { if (!Q.get('fly')) player.update(dt); }
    else { // 들어가기 전: 마을 위 높은 데서 호카게 바위 쪽을 천천히 훑는 화면(마을이 넓게 내려다보인다)
      orbit += dt * 0.04;
      camera.position.set(Math.sin(orbit) * 120, 150 + Math.sin(orbit * 0.6) * 12, 340 + Math.cos(orbit * 0.8) * 40);
      camera.lookAt(Math.sin(orbit) * 16, 6, -70);
    }
    if (player.charge !== lastCharge) { lastCharge = player.charge; chargeEl.style.setProperty('--c', lastCharge); chargeEl.classList.toggle('on', lastCharge > 0); chargeEl.classList.toggle('full', lastCharge >= 1); }
    const wdt = Q.get('freeze') ? 0 : dt;   // 확인용: 날씨·바람의 시간을 멈춘다(두 장을 찍어 깜빡이는 면을 찾을 때)
    weather.update(wdt, camera);
    if (player.sky || !started) scene.fog.density *= 0.3;   // 하늘에서는 안개를 걷어 마을 끝까지 보이게
    if (toonOn) scene.fog.density *= 0.5;                  // 만화 화풍은 먼 데까지 또렷하다(바위가 뿌옇게 바래지 않게)
    // 폰: 걷는 동안은 800m까지만 그리고, 그 끝이 뚝 끊겨 보이지 않게 먼 데를 안개로 덮는다(가까운 것은 그대로 또렷하다). 첫 화면의 전경은 그대로 둔다
    if (TOUCH) { const far = started && !player.sky ? 800 : player.sky ? 4200 : 1600; if (camera.far !== far) { camera.far = far; camera.updateProjectionMatrix(); } if (far === 800) scene.fog.density = Math.max(scene.fog.density, 0.0021); }
    // 죽음의 숲: 철망 안으로 들어갈수록 어두워지고 푸른 빛이 덮인다(안개도 짙고 검푸르게, 볕은 약하게). 하늘에서 볼 때는 덮지 않는다
    { const at = camera.position, dg = !player.sky ? Math.max(0, Math.min(1, (DEATH.rf + 6 - Math.hypot(at.x - DEATH.c[0], at.z - DEATH.c[1])) / 30)) : 0;
      if (gloomCss === '' || Q.get('shot')) gloom = dg; else gloom += (dg - gloom) * (1 - Math.exp(-dt * 1.6));   // 처음 뜰 때와 확인용 화면에서는 곧바로
      if (gloom > 0.004) { scene.fog.color.lerp(GLOOM_FOG, gloom * 0.9); scene.fog.density += (0.03 - scene.fog.density) * gloom; weather.sun.intensity *= 1 - 0.55 * gloom; renderer.toneMappingExposure *= 1 - 0.18 * gloom;
        const su = weather.skyU; su.uTop.value.lerp(GLOOM_SKY, gloom * 0.94); su.uHor.value.lerp(GLOOM_FOG, gloom * 0.94); su.uDark.value += (1 - su.uDark.value) * gloom; su.uFogCol.value.lerp(GLOOM_FOG, gloom * 0.94); }   // 하늘도 안개 빛으로 덮는다(구름은 어둡게)
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
        if (n !== hereName) { $('#miniName b').textContent = hereName = n; if (n && started) statOnce('visit_place', { place: n }); }
      }
      if (mapOpen) vmap.mark(at.x, at.z, player.yaw, hereName, player.locked && !player.touchMode);
    }
    if (lod) lod.tick();
    if (toonOn) toon.render(scene, camera); else renderer.render(scene, camera);
  }
  frame();
  if (Q.get('stats')) setTimeout(() => {   // 확인용: 그린 삼각형 수와 한 장 그리는 데 걸린 시간
    if (lod) { for (let i = 0; i < 200000 && lod.stats().pending; i++) lod.tick(); lod.tick(); }
    const t0 = performance.now(); for (let i = 0; i < 5; i++) renderer.render(scene, camera); renderer.getContext().finish();
    { const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)), rows = []; let inst = 0, plain = 0, nI = 0, nP = 0; const band = [0, 0, 0, 0, 0];
      scene.traverse(o => { if (!o.isMesh || !o.visible || !o.geometry.attributes.position) return; let p = o, vis = true; while (p) { if (!p.visible) vis = false; p = p.parent; } if (!vis) return; if (o.frustumCulled && !fr.intersectsObject(o)) return;
        const g = o.geometry, dr = g.drawRange, n = Math.min(dr.count, g.index ? g.index.count : g.attributes.position.count) / 3, t = n * (o.isInstancedMesh ? o.count : 1);
        if (o.isInstancedMesh) { inst += t; nI++; } else { plain += t; nP++; }
        const bs = g.boundingSphere, c = bs ? bs.center.clone().applyMatrix4(o.matrixWorld) : new THREE.Vector3(), d = Math.max(0, c.distanceTo(camera.position) - (bs ? bs.radius : 0)); band[d < 50 ? 0 : d < 120 ? 1 : d < 250 ? 2 : d < 450 ? 3 : 4] += t;
        rows.push([t, Math.round(d), o.isInstancedMesh ? 'I' + o.count : 'M', (o.material.name || o.material.type || '').slice(0, 14), bs ? Math.round(bs.radius) : 0]); });
      console.log('STATSBY 묶어찍기 ' + Math.round(inst / 1000) + 'k/' + nI + '개 낱개 ' + Math.round(plain / 1000) + 'k/' + nP + '개 거리별(50,120,250,450,그밖) ' + band.map(b => Math.round(b / 1000) + 'k').join(',') + ' 큰것 ' + rows.sort((p, q) => q[0] - p[0]).slice(0, 14).map(r => Math.round(r[0] / 1000) + 'k@' + r[1] + 'm ' + r[2] + ' r' + r[4]).join(' | ')); }
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
  // 확인용(?mem=1): 그래픽 메모리를 얼마나 쓰는지 어림한다(도형의 꼭짓점 자료, 그림, 그리는 판)
  if (Q.get('mem')) setTimeout(() => {
    if (window.gc) window.gc(); const seenG = new Set(), seenT = new Map(); let geo = 0, inst = 0; const big = []; { const g0 = []; scene.traverse(o => { if (o.geometry && g0.length < 4000) g0.push(o.geometry); }); const m = new Map(); for (const g of g0) { const k = Object.keys(g.attributes).map(n => n + ':' + g.attributes[n].array.constructor.name.replace('Array', '') + g.attributes[n].itemSize).join(' ') + (g.index ? ' +idx' : ''); m.set(k, (m.get(k) || 0) + 1); } console.log('MEMATTR ' + [...m.entries()].sort((p, q) => q[1] - p[1]).slice(0, 8).map(e => e[1] + 'x ' + e[0]).join(' | ')); }
    scene.traverse(o => { const g = o.geometry; if (g && !seenG.has(g)) { seenG.add(g); let b = 0; for (const k in g.attributes) b += g.attributes[k].array.byteLength; if (g.index) b += g.index.array.byteLength; geo += b; big.push([b, o.name || o.type, o.material && (o.material.name || o.material.type)]); }
      if (o.isInstancedMesh) inst += o.instanceMatrix.array.byteLength + (o.instanceColor ? o.instanceColor.array.byteLength : 0);
      for (const m of [].concat(o.material || [])) for (const k in m) { const t = m[k]; if (t && t.isTexture && t.image && !seenT.has(t)) seenT.set(t, (t.image.width || 0) * (t.image.height || 0) * 4 * (t.generateMipmaps ? 1.33 : 1)); } });
    let tex = 0; for (const v of seenT.values()) tex += v;
    const texBig = [...seenT.entries()].sort((p, q) => q[1] - p[1]).slice(0, 8).map(([t, v]) => (t.image.width + 'x' + t.image.height + '=' + (v / 1048576).toFixed(1)));
    const mb = v => (v / 1048576).toFixed(1) + 'MB';
    { const by = new Map(), sg = new Set(); let idx = 0, non = 0; scene.children.forEach((c, i) => { let b = 0, n = 0, tri = 0, hid = 0; c.traverse(o => { const g = o.geometry; if (!g || sg.has(g)) return; sg.add(g); let x = 0; for (const k in g.attributes) x += g.attributes[k].array.byteLength; if (g.index) { x += g.index.array.byteLength; idx += x; } else non += x; b += x; n++; tri += (g.index ? g.index.count : g.attributes.position ? g.attributes.position.count : 0) / 3; if (!o.visible) hid += x; }); if (b > 4e6) by.set(i + ':' + (c.name || c.type) + '/' + c.children.length, [b, n, tri, hid]); });
      console.log('MEMBY 색인있음 ' + mb(idx) + ' 없음 ' + mb(non) + ' | ' + [...by.entries()].sort((p, q) => q[1][0] - p[1][0]).slice(0, 30).map(([k, v]) => k + '=' + mb(v[0]) + '/' + v[1] + '개/' + Math.round(v[2] / 1000) + 'k삼각/숨김' + mb(v[3])).join(' | ')); }
    console.log('MEMCNT 막는상자 ' + colliders.length); console.log('MEM 도형 ' + mb(geo) + ' x2(자바스크립트+그래픽) 인스턴스 ' + mb(inst) + ' 그림 ' + mb(tex) + ' (' + seenT.size + '장) 힙 ' + (performance.memory ? mb(performance.memory.usedJSHeapSize) : '?') + ' three ' + JSON.stringify(renderer.info.memory) + ' 큰그림 ' + texBig.join(',') + ' 큰도형 ' + big.sort((p, q) => q[0] - p[0]).slice(0, 8).map(b => mb(b[0]) + ':' + b[2]).join(','));
  }, 1500);
  if (Q.get('jumps')) console.log('JUMPS ' + jumps.map(j => j[0] + '=' + [j[1], j[2], j[3]].map(n => Math.round(n)).join(',')).join(' | '));   // 확인용: 바로 가기 자리 찍어 보기
  window.__ready = true; window.__player = player; window.__scene = scene; window.__camera = camera; window.__lod = lod;   // 확인용
}

// 문제가 생기면 숨기지 않고 화면에 적는다(폰에서는 콘솔을 볼 수 없다). 통계로도 한 번 보낸다
const note = (what, msg) => { console.error(what, msg); statOnce('app_error', { what, message: String(msg).slice(0, 90), device: TOUCH ? 'phone' : 'pc' }); };   // 통계로만 한 번 알린다
const fail = (what, msg) => { note(what, msg); const L = $('#loading'); L.classList.remove('hidden'); L.style.zIndex = 60; $('#loadText').textContent = '문제가 생겼습니다 — ' + what + ': ' + msg; };   // 더 나아갈 수 없을 때만 화면을 덮는다
// 돌아가는 중에 난 오류는 화면을 덮지 않는다: 소리·마우스 잡기를 브라우저가 거절한 것처럼 대수롭지 않은 것이 많아, 덮으면 멀쩡한 마을을 가리게 된다
addEventListener('error', e => note('오류', (e.message || '알 수 없음') + (e.filename ? ' (' + e.filename.split('/').pop() + ':' + e.lineno + ')' : '')));
addEventListener('unhandledrejection', e => note('거절', (e.reason && e.reason.message) || e.reason));
$('#view').addEventListener('webglcontextlost', () => fail('그래픽', '기기의 그래픽 메모리가 모자라 화면을 그리지 못했습니다'));
init().catch(e => fail('준비', e.message));
