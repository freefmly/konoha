// 지도 — 걷는 동안 화면 구석에 뜨는 둥근 미니맵과, M으로 여는 전체 지도.
// 바탕 그림은 배치도의 자리표(PLAN)로 한 번만 그려 두고, 미니맵은 그 그림을 걷는 사람 둘레만 잘라 보는 쪽이 위로 가게 돌려 붙인다.
// 전체 지도를 편 채 걷는 동안에는 지금 선 자리의 이름과 설명을 옆 종이에 띄우고, 마우스를 풀면(Esc) 마우스를 올린(손가락으로 짚은) 자리의 것을 띄운다.
import { PLAN } from './plan-data.js';
import { WALL, CLIFF, NARA_FOREST } from './layout.js';
import { fillCells, farmPlots, PATHS } from './fields.js';

const S = 2048, HALF = 770, CX = WALL.cx, CZ = WALL.cz, K = S / (HALF * 2);   // 바탕 그림 한 변(점), 담는 범위의 반(m), 한가운데, 1m가 몇 점인가
const px = x => (x - CX + HALF) * K, pz = z => (z - CZ + HALF) * K;
const inPoly = (x, z, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const mixHex = (hex, to, t) => { const v = parseInt(hex.slice(1), 16), w = parseInt(to.slice(1), 16), m = sh => Math.round(((v >> sh) & 255) * (1 - t) + ((w >> sh) & 255) * t); return `rgb(${m(16)},${m(8)},${m(0)})`; };

// 다각형의 한가운데(넓이로 잰 무게중심)
const centroid = poly => { let a = 0, x = 0, z = 0; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const f = poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1]; a += f; x += (poly[j][0] + poly[i][0]) * f; z += (poly[j][1] + poly[i][1]) * f; } return [x / (3 * a), z / (3 * a)]; };

/* ---------- 바탕 그림 ---------- */
function drawBase(jumps) {
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
  const woods = (x, z) => z > CLIFF.z && ((dW(x, z) > WALL.r + 4 && dW(x, z) < WALL.r + 90 && !(z > WALL.cz && Math.abs(x) < 10)) || inNara(x, z));
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
  for (const s of [...R.spokes, ...R.vertical, R.main]) line([s.a, s.b], s.w, ROAD);
  ring(R.ring.r, R.ring.w, ROAD); fill(R.plaza, ROAD);
  g.fillStyle = ROAD; g.beginPath(); g.arc(px(PLAN.fan[0]), pz(PLAN.fan[1]), PLAN.forecourt * K, 0, Math.PI * 2); g.fill();
  g.fillRect(px(-7), pz(WALL.gateZ), 14 * K, 95 * K);
  for (const b of PLAN.bridges) line(b, 7, '#8a6038');
  for (const p of PATHS) line(p.pts, p.w, ROAD);
  line(F.trail, 3.4, ROAD);
  // 호카게 바위: 절벽과 여섯 얼굴, 그 앞의 관저
  { const w = CLIFF.half + CLIFF.fall; fill([[-w, CLIFF.z], [w, CLIFF.z], [CLIFF.half, CLIFF.z - 150], [-CLIFF.half, CLIFF.z - 150]], '#c7a779');
    trees(-CLIFF.half, CLIFF.z - 145, CLIFF.half, CLIFF.z - 22, 15, () => true);
    for (let i = 0; i < 6; i++) { g.fillStyle = '#e6cfa6'; g.strokeStyle = '#7a5c3a'; g.lineWidth = 1.5; g.beginPath(); g.arc(px((-50 + 20 * i) * CLIFF.k), pz(CLIFF.z - 9), 9 * K, 0, Math.PI * 2); g.fill(); g.stroke(); } }
  g.fillStyle = '#c2452f'; g.strokeStyle = '#5a2015'; g.lineWidth = 1.5; g.beginPath(); g.arc(px(PLAN.fan[0]), pz(PLAN.fan[1]), 15 * K, 0, Math.PI * 2); g.fill(); g.stroke();
  // 담과 정문
  g.save(); g.beginPath(); g.rect(0, pz(CLIFF.z), S, S); g.clip(); ring(WALL.r, 3.2, '#3a342c'); g.restore();
  g.fillStyle = '#b3352a'; g.fillRect(px(-9), pz(WALL.gateZ - 4), 18 * K, 8 * K);
  // 가 볼 만한 곳(바로 가기)마다 붉은 점
  for (const j of jumps) { g.fillStyle = '#b3352a'; g.strokeStyle = '#fff6e0'; g.lineWidth = 1.2; g.beginPath(); g.arc(px(j[1]), pz(j[3]), 3.1, 0, Math.PI * 2); g.fill(); g.stroke(); }
  return c;
}

/* ---------- 지도 ---------- */
export class VillageMap {
  // places: 자리 이름표 { n, t, b: [x0, x1, z0, z1], poly?, y? }, jumps: 바로 가기 [이름, x, y, z, …]
  constructor({ places, jumps, mini, view, canvas, panel, here }) {
    this.places = places; this.jumps = jumps; this.base = drawBase(jumps);
    this.mini = mini; this.mg = mini.getContext('2d');
    this.view = view; this.canvas = canvas; this.here = null; this.follow = false; this.body = null;
    this.hereEl = here.querySelector('b'); this.panel = panel;   // 현재위치 한 줄(종이 밖 위)과 설명 종이
    // 큰 구역의 이름만 지도에 적는다(작은 곳은 짚어 보면 나온다)
    this.labels = PLAN.zones.filter(z => { const xs = z.poly.map(p => p[0]), zs = z.poly.map(p => p[1]); return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...zs) - Math.min(...zs)) > 9000; }).map(z => [z.name.replace(/\(.*\)/, ''), ...centroid(z.poly)])
      .concat([['호카게 바위', 0, CLIFF.z - 60], ['호카게 관저', PLAN.fan[0], PLAN.fan[1] + 26], ['정문', 0, WALL.gateZ + 26], ['나라 숲', NARA_FOREST.glade[0], NARA_FOREST.glade[1] - 40]]);
    const at = e => { const r = canvas.getBoundingClientRect(); return [CX + ((e.clientX - r.left) / r.width - 0.5) * HALF * 2, CZ + ((e.clientY - r.top) / r.height - 0.5) * HALF * 2]; };
    canvas.addEventListener('pointermove', e => { if (!this.follow) this.show(...at(e)); });
    canvas.addEventListener('pointerdown', e => { if (!this.follow) this.show(...at(e)); });
    canvas.addEventListener('pointerleave', () => { if (!this.follow) this.show(null); });
  }
  // 그 자리에 걸친 이름표들(좁은 것부터). 층은 가리지 않는다 — 한 건물의 방들이 함께 나온다
  at(x, z) {
    const seen = new Set(), out = [];
    for (const q of this.places) {
      if (x < q.b[0] || x > q.b[1] || z < q.b[2] || z > q.b[3] || (q.poly && !inPoly(x, z, q.poly))) continue;
      const key = q.n + '|' + (q.t || ''); if (seen.has(key)) continue; seen.add(key);
      out.push([(q.b[1] - q.b[0]) * (q.b[3] - q.b[2]), q]);
    }
    return out.sort((a, b) => a[0] - b[0]).map(o => o[1]);
  }
  show(x, z) {
    const esc = s => String(s).replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
    let list = x === null ? [] : this.at(x, z);
    if (list.length > 1) list = list.filter(q => q.n !== '나뭇잎 마을');
    const inside = x !== null && Math.hypot(x - WALL.cx, z - WALL.cz) < WALL.r;
    const body = x === null ? '<p class="hint">지도 위에 마우스를 올리면(손가락으로 짚으면) 그곳의 이름과 설명이 나옵니다. 붉은 점은 바로 가기가 있는 곳입니다.</p>'
      : list.length ? list.slice(0, 7).map(q => `<article><b>${esc(q.n)}</b>${q.t ? `<p>${esc(q.t)}</p>` : ''}</article>`).join('') + (list.length > 7 ? `<p class="hint">이 자리에 ${list.length - 7}곳이 더 있습니다.</p>` : '')
      : `<article><b>${inside ? '나뭇잎 마을' : '마을 밖 숲'}</b><p>${inside ? '길과 빈 터.' : '담장 너머는 불의 나라의 깊은 숲이다.'}</p></article>`;
    if (body !== this.body) this.panel.innerHTML = this.body = body;   // 걷는 동안 장면마다 불리니, 달라졌을 때만 갈아 쓴다
  }
  // 전체 지도를 연다. 바탕·붉은 점·구역 이름은 한 번만 그려 두고, 걷는 동안 그 위에 화살표만 다시 찍는다(mark)
  open() {
    this.view.classList.remove('hidden'); this.follow = false; this.show(null);
    const size = Math.round(this.canvas.getBoundingClientRect().width), dpr = Math.min(2, devicePixelRatio || 1), n = Math.round(size * dpr), k = n / (HALF * 2);
    this.canvas.width = this.canvas.height = n;
    const cv = this.sheet || (this.sheet = document.createElement('canvas')), g = cv.getContext('2d');
    cv.width = cv.height = n;
    g.imageSmoothingQuality = 'high'; g.drawImage(this.base, 0, 0, n, n);
    const X = wx => (wx - CX + HALF) * k, Z = wz => (wz - CZ + HALF) * k;
    for (const j of this.jumps) { g.fillStyle = '#b3352a'; g.strokeStyle = '#fff6e0'; g.lineWidth = Math.max(1, n / 900); g.beginPath(); g.arc(X(j[1]), Z(j[3]), Math.max(2.4, n / 300), 0, Math.PI * 2); g.fill(); g.stroke(); }   // 바로 가기가 있는 곳(전체 지도에서는 잘 보이게 크게)
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.font = `700 ${Math.round(Math.max(10, n / 78))}px "Noto Serif KR", "Nanum Myeongjo", "Batang", serif`;
    for (const [name, lx, lz] of this.labels) { g.strokeStyle = 'rgba(255,248,228,.92)'; g.lineWidth = Math.max(3, n / 300); g.strokeText(name, X(lx), Z(lz)); g.fillStyle = '#2a231b'; g.fillText(name, X(lx), Z(lz)); }
  }
  // 지금 선 자리: (x, z)에 yaw 쪽을 가리키는 붉은 화살표. here = 그 자리의 이름.
  // follow = 마우스를 잡은 채 걷는 중: 종이에는 지금 선 자리의 설명을 띄운다(마우스를 풀면 짚은 자리의 설명으로 돌아간다)
  mark(x, z, yaw, here, follow) {
    if (!this.sheet) return;
    const n = this.canvas.width, g = this.canvas.getContext('2d'), k = n / (HALF * 2), r = Math.max(9, n / 70);
    g.drawImage(this.sheet, 0, 0);
    g.save(); g.translate((x - CX + HALF) * k, (z - CZ + HALF) * k); g.rotate(-yaw);
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
    const cv = this.mini, g = this.mg, css = cv.clientWidth || 176, dpr = Math.min(2, devicePixelRatio || 1), n = Math.round(css * dpr);
    if (cv.width !== n) cv.width = cv.height = n;
    const R = n / 2, s = R / rad / K;                                  // 바탕 그림의 한 점이 미니맵의 몇 점인가
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, n, n);
    g.save(); g.beginPath(); g.arc(R, R, R - 1, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#a9cf82'; g.fillRect(0, 0, n, n);
    g.translate(R, R); g.rotate(yaw); g.scale(s, s); g.drawImage(this.base, -px(x), -pz(z));
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
