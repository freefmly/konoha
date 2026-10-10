// 지도 — 걷는 동안 화면 구석에 뜨는 둥근 미니맵과, M으로 여는 전체 지도.
// 바탕 그림은 배치도의 자리표(PLAN)로 한 번만 그려 두고, 미니맵은 그 그림을 걷는 사람 둘레만 잘라 보는 쪽이 위로 가게 돌려 붙인다.
// 전체 지도를 편 채 걷는 동안에는 지금 선 자리의 이름과 설명을 옆 종이에 띄우고, 마우스를 풀면(Esc) 마우스를 올린(손가락으로 짚은) 자리의 것을 띄운다.
import { PLAN } from './plan-data.js';
import { WALL, CLIFF, NARA_FOREST, SITE, DEATH } from './layout.js';
const HOK = SITE.hokage;
import { fillCells, farmPlots, PATHS } from './fields.js';
import { ROOT_PLAN as RP } from './b_root.js';
import { footprints } from './build.js';

const S = 2048, HALF = 770, CX = WALL.cx, CZ = WALL.cz, K = S / (HALF * 2);   // 바탕 그림 한 변(점), 담는 범위의 반(m), 한가운데, 1m가 몇 점인가
const px = x => (x - CX + HALF) * K, pz = z => (z - CZ + HALF) * K;
const inPoly = (x, z, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const mixHex = (hex, to, t) => { const v = parseInt(hex.slice(1), 16), w = parseInt(to.slice(1), 16), m = sh => Math.round(((v >> sh) & 255) * (1 - t) + ((w >> sh) & 255) * t); return `rgb(${m(16)},${m(8)},${m(0)})`; };

// 다각형의 한가운데(넓이로 잰 무게중심)
const centroid = poly => { let a = 0, x = 0, z = 0; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const f = poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1]; a += f; x += (poly[j][0] + poly[i][0]) * f; z += (poly[j][1] + poly[i][1]) * f; } return [x / (3 * a), z / (3 * a)]; };

/* ---------- 바탕 그림 ---------- */
// 건물 바닥꼴을 그린다(테두리를 먼저 다 긋고 속을 칠해, 겹친 지붕들이 한 덩어리로 보이게). X·Z = 마을 좌표 → 그림 좌표, k = 1m가 몇 점인가
function drawFoot(g, list, X, Z, k) {
  const shape = f => { g.beginPath(); if (f.c) g.arc(X(f.c[0]), Z(f.c[1]), f.c[2] * k, 0, Math.PI * 2); else { f.p.forEach((q, i) => (i ? g.lineTo(X(q[0]), Z(q[1])) : g.moveTo(X(q[0]), Z(q[1])))); g.closePath(); } };
  g.lineJoin = 'round'; g.strokeStyle = 'rgba(58,42,28,.85)'; g.lineWidth = Math.max(1.2, 0.7 * k);
  for (const f of list) { shape(f); g.stroke(); }
  for (const f of list) { g.fillStyle = f.house ? '#a98d68' : '#c0694c'; shape(f); g.fill(); }
}
function drawBase(jumps, foot) {
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const path = poly => { g.beginPath(); poly.forEach((p, i) => (i ? g.lineTo(px(p[0]), pz(p[1])) : g.moveTo(px(p[0]), pz(p[1])))); g.closePath(); };
  const fill = (poly, col) => { g.fillStyle = col; path(poly); g.fill(); };
  const line = (pts, w, col) => { g.strokeStyle = col; g.lineWidth = w * K; g.lineCap = g.lineJoin = 'round'; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(px(p[0]), pz(p[1])) : g.moveTo(px(p[0]), pz(p[1])))); g.stroke(); };
  const ring = (r, w, col) => { g.strokeStyle = col; g.lineWidth = w * K; g.beginPath(); g.arc(px(WALL.cx), pz(WALL.cz), r * K, 0, Math.PI * 2); g.stroke(); };
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // 나무 점: 다각형(또는 조건) 안에 흩뿌린다
  const trees = (x0, z0, x1, z1, step, ok) => { for (let z = z0; z < z1; z += step) for (let x = x0; x < x1; x += step) { const tx = x + rnd() * step, tz = z + rnd() * step; if (!ok(tx, tz)) continue; g.fillStyle = rnd() < 0.5 ? '#3c7d38' : '#347034'; g.beginPath(); g.arc(px(tx), pz(tz), (3.4 + rnd() * 2.2) * K, 0, Math.PI * 2); g.fill(); } };
  const dW = (x, z) => Math.hypot(x - WALL.cx, z - WALL.cz);

  // 담 밖: 들판, 담을 두른 숲 띠와 나라 숲
  g.fillStyle = '#a9cf82'; g.fillRect(0, 0, S, S);
  const F = NARA_FOREST, inNara = (x, z) => { const d = dW(x, z), a = Math.atan2(z - WALL.cz, x - WALL.cx); return d > WALL.r && d < F.r1 + 20 && a > F.a0 - 0.03 && a < F.a1 + 0.03 && x < F.xMax + 20; };
  const woods = (x, z) => z > CLIFF.z && ((dW(x, z) > WALL.r + 4 && dW(x, z) < WALL.r + 90 && !(z > WALL.cz && Math.abs(x) < 10)) || inNara(x, z) || Math.hypot(x - DEATH.c[0], z - DEATH.c[1]) < DEATH.rf);
  g.fillStyle = '#62a253'; for (let z = CZ - HALF; z < CZ + HALF; z += 6) for (let x = CX - HALF; x < CX + HALF; x += 6) if (woods(x + 3, z + 3)) g.fillRect(px(x) - 1, pz(z) - 1, 6 * K + 2, 6 * K + 2);
  trees(CX - HALF, CZ - HALF, CX + HALF, CZ + HALF, 13, woods);

  // 담 안 바닥(길 빛깔) → 메운 풀밭 → 블록 → 숲 → 구역
  g.save(); g.beginPath(); g.rect(0, pz(CLIFF.z), S, S); g.clip();
  g.fillStyle = '#ead9b0'; g.beginPath(); g.arc(px(WALL.cx), pz(WALL.cz), WALL.r * K, 0, Math.PI * 2); g.fill();
  g.restore();
  g.fillStyle = '#b5d98a'; fillCells((x, z, kind, u) => g.fillRect(px(x - u / 2) - 0.5, pz(z - u / 2) - 0.5, u * K + 1, u * K + 1));
  for (const p of farmPlots()) fill(p.c, ['#86c4c0', '#9a7a55', '#74ae58'][p.t]);
  for (const b of [...PLAN.town, ...PLAN.townExtra]) { fill(b, '#d2bd8e'); g.strokeStyle = 'rgba(90,70,40,.35)'; g.lineWidth = 1; g.stroke(); }
  for (const p of PLAN.greens) { fill(p, '#62a253'); const xs = p.map(q => q[0]), zs = p.map(q => q[1]); trees(Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs), 13, (x, z) => inPoly(x, z, p)); }
  for (const z of PLAN.zones) {
    if (z.park) { fill(z.poly, '#8fca6c'); continue; }
    const col = mixHex(z.fill, '#efe5cf', 0.5);
    if (z.blocks) for (const b of z.blocks) { fill(b, col); g.strokeStyle = 'rgba(60,45,30,.4)'; g.lineWidth = 1; g.stroke(); }
    else { fill(z.poly, col); g.strokeStyle = 'rgba(60,45,30,.55)'; g.lineWidth = 1.2; g.stroke(); }
  }
  // 물
  const W = PLAN.water;
  for (const r of [W.naka, W.stream, W.brook]) line(r.pts, r.w, '#6fb3d9');
  for (const p of [W.lake, W.isle, W.parkPond, ...W.ponds]) fill(p, '#6fb3d9');
  for (const p of [W.isleLand, W.parkIsle]) fill(p, '#8fca6c');
  // 길
  const R = PLAN.roads, ROAD = '#f3e6c4';
  for (const s of [...R.spokes, ...R.vertical]) line([s.a, s.b], s.w, ROAD);
  for (const b of PLAN.townExtra.slice(-PLAN.greensGone.length)) fill(b, '#d2bd8e');   // 관저를 두른 집 블록들 사이에는 길이 없다
  line([R.main.a, R.main.b], R.main.w, ROAD);
  ring(R.ring.r, R.ring.w, ROAD); fill(R.plaza, ROAD);
  g.fillStyle = ROAD; g.beginPath(); g.arc(px(PLAN.fan[0]), pz(PLAN.fan[1]), PLAN.forecourt * K, 0, Math.PI * 2); g.fill();
  g.fillRect(px(-7), pz(WALL.gateZ), 14 * K, 95 * K);
  g.strokeStyle = '#b5d98a'; g.lineWidth = 15.5 * K; g.beginPath(); g.arc(px(HOK.x), pz(HOK.z), 50.2 * K, 0.5 * Math.PI + 0.17, 2.5 * Math.PI - 0.17); g.stroke();   // 관저 담 둘레의 풀밭(문 앞은 길)
  for (const b of PLAN.bridges) line(b, 7, '#8a6038');
  for (const p of PATHS) line(p.pts, p.w, ROAD);
  line(F.trail, 3.4, ROAD);
  // 죽음의 숲: 냇물, 오솔길, 철망
  line(DEATH.river.pts, DEATH.river.w, '#6fb3d9'); line(DEATH.trail, 3.2, ROAD); line(DEATH.side, 3.2, ROAD);
  g.strokeStyle = '#4a4f55'; g.lineWidth = 1.6; g.setLineDash([5, 3]); g.beginPath(); g.arc(px(DEATH.c[0]), pz(DEATH.c[1]), DEATH.rf * K, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  drawFoot(g, foot, px, pz, K);   // 건물
  // 호카게 바위: 절벽과 여섯 얼굴, 그 앞의 관저
  { const w = CLIFF.half + CLIFF.fall; fill([[-w, CLIFF.z], [w, CLIFF.z], [CLIFF.half, CLIFF.z - 150], [-CLIFF.half, CLIFF.z - 150]], '#c7a779');
    trees(-CLIFF.half, CLIFF.z - 145, CLIFF.half, CLIFF.z - 22, 15, () => true);
    for (let i = 0; i < 6; i++) { g.fillStyle = '#e6cfa6'; g.strokeStyle = '#7a5c3a'; g.lineWidth = 1.5; g.beginPath(); g.arc(px((-50 + 20 * i) * CLIFF.k), pz(CLIFF.z - 9), 9 * K, 0, Math.PI * 2); g.fill(); g.stroke(); } }
  // 담과 정문
  g.save(); g.beginPath(); g.rect(0, pz(CLIFF.z), S, S); g.clip(); ring(WALL.r, 3.2, '#3a342c'); g.restore();
  g.fillStyle = '#b3352a'; g.fillRect(px(-9), pz(WALL.gateZ - 4), 18 * K, 8 * K);
  // 가 볼 만한 곳(바로 가기)마다 붉은 점
  for (const j of jumps) { g.fillStyle = '#b3352a'; g.strokeStyle = '#fff6e0'; g.lineWidth = 1.2; g.beginPath(); g.arc(px(j[1]), pz(j[3]), 3.1, 0, Math.PI * 2); g.fill(); g.stroke(); }
  return c;
}

/* ---------- 땅속 도면(뿌리 본거지): 층마다 한 장 ---------- */
const US = 1024;
function drawUnder(li) {
  const c = document.createElement('canvas'); c.width = c.height = US;
  const g = c.getContext('2d'), k = US / (RP.half * 2), X = x => (x - RP.cx + RP.half) * k, Z = z => (z - RP.cz + RP.half) * k, lv = RP.levels[li];
  const rect = (x0, z0, x1, z1, fill, line = '#14161a') => { g.fillStyle = fill; g.fillRect(X(x0), Z(z0), (x1 - x0) * k, (z1 - z0) * k); g.strokeStyle = line; g.lineWidth = 3; g.strokeRect(X(x0), Z(z0), (x1 - x0) * k, (z1 - z0) * k); };
  g.fillStyle = '#26282d'; g.fillRect(0, 0, US, US);                                       // 바위 속
  let seed = 5 + li; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  g.fillStyle = '#2d3036'; for (let i = 0; i < 900; i++) g.fillRect(rnd() * US, rnd() * US, 2 + rnd() * 5, 2 + rnd() * 3);
  const [cx, cz, r, rg] = RP.shaft, [sx0, sz0, sx1, sz1] = RP.stair;
  for (const [, x0, z0, x1, z1] of lv.rooms) rect(x0, z0, x1, z1, '#666c76');
  // 계단실과 그리로 가는 통로, 방으로 드는 문
  rect(sx0, sz0, sx1, sz1, '#565b64'); g.strokeStyle = '#2b2e34'; g.lineWidth = 2; for (let z = sz0 + 3; z < sz1 - 2.6; z += 0.9) { g.beginPath(); g.moveTo(X(sx0), Z(z)); g.lineTo(X(sx1), Z(z)); g.stroke(); }
  g.beginPath(); g.moveTo(X((sx0 + sx1) / 2), Z(sz0 + 2.5)); g.lineTo(X((sx0 + sx1) / 2), Z(sz1 - 2.5)); g.stroke();
  rect(cx + r - 1, sz1 - 2.4, sx0, sz1 - 0.1, '#666c76');
  // 수직굴: 벽, 깊은 구덩이, 고리 복도, 다리(굴 바닥에서는 바닥과 봉인 무늬)
  g.fillStyle = '#14161a'; g.beginPath(); g.arc(X(cx), Z(cz), (r + 1) * k, 0, Math.PI * 2); g.fill();
  g.fillStyle = lv.bridge ? '#666c76' : '#4d525b'; g.beginPath(); g.arc(X(cx), Z(cz), r * k, 0, Math.PI * 2); g.fill();
  if (lv.bridge) {
    g.fillStyle = '#0d0e11'; g.beginPath(); g.arc(X(cx), Z(cz), rg * k, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#666c76'; if (lv.bridge === 'x') g.fillRect(X(cx - rg), Z(cz - 1.3), rg * 2 * k, 2.6 * k); else g.fillRect(X(cx - 1.3), Z(cz - rg), 2.6 * k, rg * 2 * k);
    g.strokeStyle = '#14161a'; g.lineWidth = 2; g.beginPath(); g.arc(X(cx), Z(cz), rg * k, 0, Math.PI * 2); g.stroke();
  } else { g.strokeStyle = '#b9a56a'; g.lineWidth = 4; for (const q of [6, 4.9, 2.5]) { g.beginPath(); g.arc(X(cx), Z(cz), q * k, 0, Math.PI * 2); g.stroke(); } }
  for (const [, x0, z0, x1] of lv.rooms) { const west = x1 < cx; g.fillStyle = '#666c76'; if (west) g.fillRect(X(x1) - 2, Z(cz - 1.6), (cx - r - x1) * k + 4, 3.2 * k); else g.fillRect(X(sx1) - 2, Z(sz1 - 2.35), (x0 - sx1) * k + 4, 2.2 * k); }
  return c;
}

/* ---------- 지도 ---------- */
export class VillageMap {
  // places: 자리 이름표 { n, t, b: [x0, x1, z0, z1], poly?, y?, secret? }, jumps: 바로 가기 [이름, x, y, z, …]
  constructor({ places, jumps, mini, view, canvas, panel, here }) {
    this.foot = footprints().map(f => ({ ...f, at: f.c ? [f.c[0], f.c[1]] : [(f.p[0][0] + f.p[2][0]) / 2, (f.p[0][1] + f.p[2][1]) / 2] }));   // 건물 바닥꼴(가운데 자리와 함께)
    this.places = places; this.jumps = jumps; this.base = drawBase(jumps, this.foot);
    this.mini = mini; this.mg = mini.getContext('2d');
    this.view = view; this.canvas = canvas; this.here = null; this.follow = false; this.body = null;
    this.hereEl = here.querySelector('b'); this.panel = panel;   // 현재위치 한 줄(종이 밖 위)과 설명 종이
    this.level = -1; this.under = [];                             // 지금 보는 땅속 층(-1 = 땅 위), 층마다 그려 둔 도면
    // 큰 구역의 이름만 지도에 적는다(작은 곳은 짚어 보면 나온다)
    this.labels = PLAN.zones.filter(z => { const xs = z.poly.map(p => p[0]), zs = z.poly.map(p => p[1]); return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...zs) - Math.min(...zs)) > 9000; }).map(z => [z.name.replace(/\(.*\)/, ''), ...centroid(z.poly)])
      .concat([['호카게 바위', 0, CLIFF.z - 60], ['호카게 관저', HOK.x, HOK.z + 26], ['정문', 0, WALL.gateZ + 26], ['나라 숲', NARA_FOREST.glade[0], NARA_FOREST.glade[1] - 40], ['죽음의 숲', DEATH.c[0], DEATH.c[1] + 70]]);
    const at = e => { const r = canvas.getBoundingClientRect(), L = this.layer(); return [L.cx + ((e.clientX - r.left) / r.width - 0.5) * L.half * 2, L.cz + ((e.clientY - r.top) / r.height - 0.5) * L.half * 2]; };
    canvas.addEventListener('pointermove', e => { if (!this.follow) this.show(...at(e)); });
    canvas.addEventListener('pointerdown', e => { if (!this.follow) this.show(...at(e)); });
    canvas.addEventListener('pointerleave', () => { if (!this.follow) this.show(null); });
  }
  // 지금 보는 그림: 땅 위의 마을 지도 또는 땅속 한 층의 도면 { img, cx, cz, half(담는 범위의 반, m) }
  layer() {
    if (this.level < 0) return this.top || (this.top = { img: this.base, cx: CX, cz: CZ, half: HALF });
    return this.under[this.level] || (this.under[this.level] = { img: drawUnder(this.level), cx: RP.cx, cz: RP.cz, half: RP.half });
  }
  // 그 자리가 땅속 본거지의 몇째 층인가(아니면 -1). 층 사이 계단에서는 내려가고 있는 아래층으로 친다
  levelAt(x, y, z) {
    const b = RP.box; if (x < b[0] || x > b[1] || z < b[2] || z > b[3]) return -1;
    for (let i = 0; i < RP.levels.length; i++) if (y > RP.levels[i].y - 1.5) return i;
    return RP.levels.length - 1;
  }
  levelName() { return this.level < 0 ? '' : RP.levels[this.level].name; }
  setLevel(l) { if (l === this.level) return; this.level = l; this.body = null; if (!this.view.classList.contains('hidden')) this.open(); }
  // 그 자리에 걸친 이름표들(좁은 것부터). 층은 가리지 않는다 — 한 건물의 방들이 함께 나온다
  at(x, z) {
    const seen = new Set(), out = [], deep = this.level >= 0, yL = deep ? RP.levels[this.level].y : 0;
    for (const q of this.places) {
      if (!!q.secret !== deep) continue;                         // 땅 위 지도에는 숨은 곳이 나오지 않고, 땅속 도면에는 숨은 곳만 나온다
      if (deep && q.y && (yL + 1 < q.y[0] || yL + 1 > q.y[1])) continue;   // 땅속은 지금 보는 층의 것만
      if (x < q.b[0] || x > q.b[1] || z < q.b[2] || z > q.b[3] || (q.poly && !inPoly(x, z, q.poly))) continue;
      const key = q.n + '|' + (q.t || ''); if (seen.has(key)) continue; seen.add(key);
      out.push([(q.b[1] - q.b[0]) * (q.b[3] - q.b[2]), q]);
    }
    return out.sort((a, b) => a[0] - b[0]).map(o => o[1]);
  }
  show(x, z) {
    const esc = s => String(s).replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch])), deep = this.level >= 0;
    let list = x === null ? [] : this.at(x, z);
    if (list.length > 1) list = list.filter(q => q.n !== '나뭇잎 마을');
    const inside = x !== null && Math.hypot(x - WALL.cx, z - WALL.cz) < WALL.r;
    const body = x === null ? (deep ? '<p class="hint">뿌리 본거지의 ' + esc(this.levelName()) + ' 도면입니다. 도면 위에 마우스를 올리면(손가락으로 짚으면) 그곳의 이름과 설명이 나옵니다.</p>' : '<p class="hint">지도 위에 마우스를 올리면(손가락으로 짚으면) 그곳의 이름과 설명이 나옵니다. 붉은 점은 바로 가기가 있는 곳입니다.</p>')
      : list.length ? list.slice(0, 7).map(q => `<article><b>${esc(q.n)}</b>${q.t ? `<p>${esc(q.t)}</p>` : ''}</article>`).join('') + (list.length > 7 ? `<p class="hint">이 자리에 ${list.length - 7}곳이 더 있습니다.</p>` : '')
      : deep ? '<article><b>바위 속</b><p>파내지 않은 땅속.</p></article>'
      : `<article><b>${inside ? '나뭇잎 마을' : '마을 밖 숲'}</b><p>${inside ? '길과 빈 터.' : '담장 너머는 불의 나라의 깊은 숲이다.'}</p></article>`;
    if (body !== this.body) this.panel.innerHTML = this.body = body;   // 걷는 동안 장면마다 불리니, 달라졌을 때만 갈아 쓴다
  }
  // 전체 지도를 연다. 바탕·붉은 점·이름은 한 번만 그려 두고, 걷는 동안 그 위에 화살표만 다시 찍는다(mark)
  open() {
    this.view.classList.remove('hidden'); this.follow = false; this.show(null);
    const L = this.layer(), size = Math.round(this.canvas.getBoundingClientRect().width), dpr = Math.min(2, devicePixelRatio || 1), n = Math.round(size * dpr), k = n / (L.half * 2);
    this.canvas.width = this.canvas.height = n;
    const cv = this.sheet || (this.sheet = document.createElement('canvas')), g = cv.getContext('2d');
    cv.width = cv.height = n;
    g.imageSmoothingQuality = 'high'; g.drawImage(L.img, 0, 0, n, n);
    const X = wx => (wx - L.cx + L.half) * k, Z = wz => (wz - L.cz + L.half) * k;
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.font = `700 ${Math.round(Math.max(10, n / 78))}px "Noto Serif KR", "Nanum Myeongjo", "Batang", serif`;
    if (this.level < 0) {
      for (const j of this.jumps) { g.fillStyle = '#b3352a'; g.strokeStyle = '#fff6e0'; g.lineWidth = Math.max(1, n / 900); g.beginPath(); g.arc(X(j[1]), Z(j[3]), Math.max(2.4, n / 300), 0, Math.PI * 2); g.fill(); g.stroke(); }   // 바로 가기가 있는 곳(전체 지도에서는 잘 보이게 크게)
      for (const [name, lx, lz] of this.labels) { g.strokeStyle = 'rgba(255,248,228,.92)'; g.lineWidth = Math.max(3, n / 300); g.strokeText(name, X(lx), Z(lz)); g.fillStyle = '#2a231b'; g.fillText(name, X(lx), Z(lz)); }
    } else {
      const lv = RP.levels[this.level], put = (name, lx, lz) => { g.strokeStyle = 'rgba(16,17,20,.9)'; g.lineWidth = Math.max(3, n / 300); g.strokeText(name, X(lx), Z(lz)); g.fillStyle = '#e9dfc4'; g.fillText(name, X(lx), Z(lz)); };
      for (const [name, x0, z0, x1, z1] of lv.rooms) put(name, (x0 + x1) / 2, (z0 + z1) / 2);
      put(lv.bridge ? '수직굴' : '굴 바닥', RP.shaft[0], RP.shaft[1] + (lv.bridge ? RP.shaft[3] + 1.6 : 8)); put('계단', (RP.stair[0] + RP.stair[2]) / 2, RP.stair[1] - 2.2);
      g.font = `900 ${Math.round(Math.max(13, n / 44))}px "Noto Serif KR", "Nanum Myeongjo", "Batang", serif`; put('뿌리 본거지 · ' + lv.name, RP.cx, RP.cz - RP.half + 6);
    }
  }
  // 지금 선 자리: (x, z)에 yaw 쪽을 가리키는 붉은 화살표. here = 그 자리의 이름.
  // follow = 마우스를 잡은 채 걷는 중: 종이에는 지금 선 자리의 설명을 띄운다(마우스를 풀면 짚은 자리의 설명으로 돌아간다)
  mark(x, z, yaw, here, follow) {
    if (!this.sheet) return;
    const L = this.layer(), n = this.canvas.width, g = this.canvas.getContext('2d'), k = n / (L.half * 2), r = Math.max(9, n / 70);
    g.drawImage(this.sheet, 0, 0);
    g.save(); g.translate((x - L.cx + L.half) * k, (z - L.cz + L.half) * k); g.rotate(-yaw);
    g.fillStyle = 'rgba(179,53,42,.22)'; g.beginPath(); g.arc(0, 0, r * 2.1, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#b3352a'; g.strokeStyle = '#fff6e0'; g.lineWidth = Math.max(2, r * 0.22);
    g.beginPath(); g.moveTo(0, -r * 1.25); g.lineTo(r * 0.82, r * 0.95); g.lineTo(0, r * 0.45); g.lineTo(-r * 0.82, r * 0.95); g.closePath(); g.fill(); g.stroke();
    g.restore();
    if (here !== this.here) { this.here = here; this.hereEl.textContent = here; }
    if (follow) this.show(x, z); else if (this.follow) this.show(null);
    this.follow = follow;
  }
  close() { this.view.classList.add('hidden'); }
  // 미니맵: (x, z) 둘레 반지름 rad(m)를 보는 쪽(yaw)이 위로 가게 그린다
  drawMini(x, z, yaw, rad) {
    const L = this.layer(), kk = L.img.width / (L.half * 2);                                       // 그림의 1m가 몇 점인가
    const cv = this.mini, g = this.mg, css = cv.clientWidth || 176, dpr = Math.min(2, devicePixelRatio || 1), n = Math.round(css * dpr);
    if (cv.width !== n) cv.width = cv.height = n;
    const R = n / 2, s = R / rad / kk;                                 // 그림의 한 점이 미니맵의 몇 점인가
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, n, n);
    g.save(); g.beginPath(); g.arc(R, R, R - 1, 0, Math.PI * 2); g.clip();
    g.fillStyle = this.level < 0 ? '#a9cf82' : '#26282d'; g.fillRect(0, 0, n, n);
    g.translate(R, R); g.rotate(yaw); g.scale(s, s); g.drawImage(L.img, -(x - L.cx + L.half) * kk, -(z - L.cz + L.half) * kk);
    // 가까운 건물은 또렷하게 덧그린다(바탕 그림은 크게 늘리면 흐리다)
    if (this.level < 0) { const lim = rad + 60; drawFoot(g, this.foot.filter(f => Math.abs(f.at[0] - x) < lim && Math.abs(f.at[1] - z) < lim), wx => (wx - x) * kk, wz => (wz - z) * kk, kk); }
    g.restore();
    // 한가운데: 나(늘 위를 본다)
    const a = Math.max(5, n * 0.045);
    g.fillStyle = '#b3352a'; g.strokeStyle = '#fff6e0'; g.lineWidth = Math.max(1.5, a * 0.28);
    g.beginPath(); g.moveTo(R, R - a * 1.3); g.lineTo(R + a * 0.85, R + a); g.lineTo(R, R + a * 0.45); g.lineTo(R - a * 0.85, R + a); g.closePath(); g.fill(); g.stroke();
    // 테두리의 북쪽 표시
    const nx = R + Math.sin(yaw) * (R - n * 0.075), ny = R - Math.cos(yaw) * (R - n * 0.075);
    g.fillStyle = '#b3352a'; g.beginPath(); g.arc(nx, ny, n * 0.058, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff6e0'; g.font = `800 ${Math.round(n * 0.075)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N', nx, ny + n * 0.004);
  }
}
