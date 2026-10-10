// 마을 — 땅과 길, 물길, 호카게 바위, 담과 정문. 자리는 모두 배치도에서 뽑은 PLAN(plan-data.js)을 따른다.
// 지금은 "빈 마을" 단계: 블록은 풀밭 빈 터로만 두고, 구역마다 빛깔과 팻말로 어디인지 알린다(집은 다음 단계에서 세운다).
import * as THREE from '../vendor/three.module.js';
import { Builder, addCollider, mat4 } from './build.js';
import { mat, M, weatherize } from './materials.js';
import { signBoard } from './arch.js';
import { CLIFF, STAIR, WALL, SITE, DONE_ZONES, NARA_FOREST, ROOT, DEATH, deathRiverDist, OUTER, jailK, outRiverDist } from './layout.js';
import { PLAN } from './plan-data.js';
import { fillCells, PATHS } from './fields.js';

/* ---------- 땅 높이 ---------- */
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const h = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return (h(ix, iz) * (1 - u) + h(ix + 1, iz) * u) * (1 - v) + (h(ix, iz + 1) * (1 - u) + h(ix + 1, iz + 1) * u) * v;
}
// 호카게 바위가 새겨진 산: 앞(남쪽)은 깎아지른 절벽, 양옆은 비탈
export function mountainH(x, z) {
  if (z > CLIFF.z) return 0;
  return CLIFF.top * (1 - sstep(CLIFF.half, CLIFF.half + CLIFF.fall, Math.abs(x)));
}
// 담 밖은 낮은 언덕이 굽이친다(정문 앞길만 평평하다)
function rawLowH(x, z) {
  const r = Math.hypot(x - WALL.cx, z - WALL.cz);
  const k = sstep(WALL.r + 6, WALL.r + 70, r) * (z > WALL.cz ? sstep(7, 30, Math.abs(x)) : 1);
  return k * (2 + 7 * vnoise(x * 0.021 + 3.1, z * 0.021 + 7.7) + 2 * vnoise(x * 0.07, z * 0.07));
}
// 언덕 가운데 평평하게 고른 자리 [x, z, 반지름, 높이] — 나라 숲의 사슴 터와 무덤 자리
const FLATS = [NARA_FOREST.glade, NARA_FOREST.grave, [DEATH.c[0], DEATH.c[1], DEATH.tower]].map(f => [f[0], f[1], f[2], rawLowH(f[0], f[1])]);
function lowH(x, z) {
  let h = rawLowH(x, z);
  for (const f of FLATS) { const d = Math.hypot(x - f[0], z - f[1]); if (d < f[2] + 16) { const t = sstep(f[2], f[2] + 16, d); h = f[3] * (1 - t) + h * t; } }
  { const d = deathRiverDist(x, z); if (d < 24) h *= sstep(DEATH.river.w / 2 + 1.5, 24, d); }
  // 담 밖의 큰 강과 교정 시설의 호수: 언덕을 물가까지 낮춘다
  { const d = outRiverDist(x, z); if (d < 34) h *= sstep(OUTER.river.w / 2 + 1.5, 34, d); }
  if (h > 0 && Math.abs(x - OUTER.jail.c[0]) < 90 && Math.abs(z - OUTER.jail.c[1]) < 90) h *= sstep(1.1, 1.55, jailK(x, z));   // 죽음의 숲의 냇물: 언덕을 물가까지 낮춘다(그래야 물길이 파인다)
  return h;
}

/* ---------- 물길: 강과 냇물은 굽은 줄, 호수와 못은 다각형. 땅을 그만큼 파 놓고 그 위에 물을 덮는다 ---------- */
const WATER_Y = -0.45, BED = 1.5;      // 물 높이, 바닥 깊이
const smooth = (pts, step = 6) => {    // 꺾인 줄을 부드럽게 다시 찍는다
  const c = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], 0, p[1])), false, 'centripetal');
  return c.getSpacedPoints(Math.max(2, Math.round(c.getLength() / step))).map(v => [v.x, v.z]);
};
const bbox = (pts, pad) => { let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); } return [x0 - pad, z0 - pad, x1 + pad, z1 + pad]; };
const segDist = (x, z, pts) => { let d = 1e9; for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1], vx = b[0] - a[0], vz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * vx + (z - a[1]) * vz) / (vx * vx + vz * vz || 1))); d = Math.min(d, Math.hypot(x - a[0] - vx * t, z - a[1] - vz * t)); } return d; };
export const inPoly = (x, z, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const ringDist = (x, z, poly) => segDist(x, z, [...poly, poly[0]]) * (inPoly(x, z, poly) ? -1 : 1);   // 다각형 가장자리까지(안쪽은 음수)
const WT = PLAN.water;
const RIVERS = [WT.naka, WT.stream, WT.brook, DEATH.river, OUTER.river].map(r => { const pts = smooth(r.pts); return { pts, w: r.w, box: bbox(pts, r.w / 2 + 6) }; });
const POOLS = [WT.lake, WT.isle, WT.parkPond, ...WT.ponds, OUTER.jail.lake].map(poly => ({ poly, box: bbox(poly, 6) }));
const ISLANDS = [WT.isleLand, WT.parkIsle, OUTER.jail.land].map(poly => ({ poly, box: bbox(poly, 4) }));
const inBox = (x, z, b) => x > b[0] && x < b[2] && z > b[1] && z < b[3];
// 물길이 땅을 파내는 깊이(0 = 그대로, 1 = 바닥까지)
function carve(x, z) {
  let k = 0;
  for (const r of RIVERS) if (inBox(x, z, r.box)) k = Math.max(k, 1 - sstep(-2.5, 1.5, segDist(x, z, r.pts) - r.w / 2));
  for (const p of POOLS) if (inBox(x, z, p.box)) k = Math.max(k, 1 - sstep(-3, 1.5, ringDist(x, z, p.poly)));
  if (k > 0) for (const s of ISLANDS) if (inBox(x, z, s.box)) k *= sstep(-2.5, 1, ringDist(x, z, s.poly));   // 못 가운데 섬은 파지 않는다
  return k;
}
export function terrainH(x, z) {
  if (x > ROOT.x0 && x < ROOT.x1 && z > ROOT.z0 && z < ROOT.z1) return -90;   // 뿌리 본거지 위: 걷는 판정으로는 땅이 깊이 파여 있다(땅 위는 b_root의 덮개 판을 딛는다). 땅 그림은 그대로다
  const h = Math.max(lowH(x, z), mountainH(x, z));
  return h > 0.01 ? h : -BED * carve(x, z);
}

/* ---------- 땅 ---------- */
const MAP = { cx: 0, cz: 400, size: 1500, S: 2048 };      // 길 그림이 덮는 범위(m)와 그림 크기
function buildGround(scene, tintOn) {
  // 길 그림: 위에서 본 마을에 흙길을 칠한다(흰 곳 = 흙, 검은 곳 = 풀). 블록은 풀밭 빈 터, 블록 사이가 길이다.
  const { S, size } = MAP, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), k = S / size;
  const px = x => (x - MAP.cx) * k + S / 2, pz = z => (z - MAP.cz) * k + S / 2;
  const fillPoly = (ctx, poly) => { ctx.beginPath(); poly.forEach((p, i) => (i ? ctx.lineTo(px(p[0]), pz(p[1])) : ctx.moveTo(px(p[0]), pz(p[1])))); ctx.closePath(); ctx.fill(); };
  const stroke = (a, b, w) => { g.lineWidth = w * k; g.lineCap = 'round'; g.beginPath(); g.moveTo(px(a[0]), pz(a[1])); g.lineTo(px(b[0]), pz(b[1])); g.stroke(); };
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  g.filter = 'blur(2px)';
  g.save(); g.beginPath(); g.rect(0, pz(CLIFF.z), S, S); g.clip();                           // 담 안은 일단 온통 흙(절벽 뒤는 빼고)
  g.fillStyle = '#fff'; g.beginPath(); g.arc(px(WALL.cx), pz(WALL.cz), (WALL.r - 1.5) * k, 0, Math.PI * 2); g.fill();
  g.restore();
  g.fillStyle = '#000';
  for (const b of [...PLAN.town, ...PLAN.townExtra]) fillPoly(g, b);                          // 일반 블록
  fillCells((x, z, kind, u) => g.fillRect(px(x - u / 2) - 0.4, pz(z - u / 2) - 0.4, u * k + 0.8, u * k + 0.8));   // 블록도 길도 아닌 채 남았던 맨흙은 풀밭·논밭 터로
  for (const p of PLAN.greens) fillPoly(g, p);                                                // 숲·녹지
  for (const z of PLAN.zones) { if (z.blocks) { g.fillStyle = '#fff'; fillPoly(g, z.poly); g.fillStyle = '#000'; for (const b of z.blocks) fillPoly(g, b); } else fillPoly(g, z.poly); }
  // 큰 길들은 블록 위에 덧칠한다
  g.fillStyle = g.strokeStyle = '#fff';
  const R = PLAN.roads;
  for (const s of R.spokes) stroke(s.a, s.b, s.w);
  for (const s of R.vertical) stroke(s.a, s.b, s.w);
  // 관저를 두른 집 블록들 사이에는 길이 없다(풀밭). 큰길만 그 위로 지난다
  g.fillStyle = '#000'; for (const b of PLAN.townExtra.slice(-PLAN.greensGone.length)) fillPoly(g, b); g.fillStyle = '#fff';
  stroke(R.main.a, R.main.b, R.main.w);
  g.lineWidth = R.ring.w * k; g.beginPath(); g.arc(px(WALL.cx), pz(WALL.cz), R.ring.r * k, 0, Math.PI * 2); g.stroke();
  fillPoly(g, R.plaza);
  { const rs = PLAN.roadside; g.fillStyle = '#000'; for (const s of [-1, 1]) g.fillRect(px(Math.min(s * rs.off, s * (rs.off + rs.w))), pz(rs.z0), rs.w * k, (rs.z1 - rs.z0) * k); g.fillStyle = '#fff'; }   // 큰길 양쪽 가로수 띠는 풀밭
  g.beginPath(); g.arc(px(PLAN.fan[0]), pz(PLAN.fan[1]), PLAN.forecourt * k, 0, Math.PI * 2); g.fill();   // 관저 앞마당
  // 관저 담 둘레는 풀밭(뒤쪽은 절벽까지), 담 안과 문 앞길은 흙 — streets.js의 lawnAt과 같은 모양
  { const H = SITE.hokage; g.fillStyle = '#000'; g.beginPath(); g.arc(px(H.x), pz(H.z), 58 * k, 0, Math.PI * 2); g.fill(); g.fillRect(px(-62), pz(CLIFF.z), 124 * k, (H.z - 30 - CLIFF.z) * k);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(px(H.x), pz(H.z), 42.5 * k, 0, Math.PI * 2); g.fill(); g.fillRect(px(-8), pz(H.z + 30), 16 * k, 30 * k); }
  g.beginPath(); g.arc(px(0), pz(WALL.gateZ + 7), 26 * k, 0, Math.PI * 2); g.fill();                        // 정문 앞마당
  g.fillRect(px(-7), pz(WALL.gateZ + 5), 14 * k, 90 * k);                                                    // 정문 밖 길
  g.fillRect(px(STAIR.x0 - 7), pz(CLIFF.z), (STAIR.x1 - STAIR.x0 + 14) * k, 14 * k); stroke([60, -124], [STAIR.x0 + 4, -141], 9);                       // 바위 오르는 계단 밑과 거기로 가는 길
  for (const b of PLAN.bridges) stroke(b[0], b[1], 8);
  { const tr = NARA_FOREST.trail; for (let i = 0; i < tr.length - 1; i++) stroke(tr[i], tr[i + 1], 3.4); }
  for (const tr of [DEATH.trail, OUTER.jail.trail]) for (let i = 0; i < tr.length - 1; i++) stroke(tr[i], tr[i + 1], 3.2);                       // 죽음의 숲의 오솔길   // 나라 숲으로 드는 오솔길
  for (const p of PATHS) for (let i = 0; i < p.pts.length - 1; i++) stroke(p.pts[i], p.pts[i + 1], p.w);        // 못 둘레의 산책길
  const mask = new THREE.CanvasTexture(c);
  mask.flipY = false; mask.colorSpace = THREE.NoColorSpace; mask.anisotropy = 8;

  // 구역 빛깔: 빈 터가 어느 구역인지 알아보게 블록에 배치도의 색을 엷게 입힌다(집이 서면 끈다. 확인용 ?tint=0)
  const tc = document.createElement('canvas'); tc.width = tc.height = S;
  const tg = tc.getContext('2d');
  if (tintOn) for (const z of PLAN.zones) { if (BUILT.has(z.n)) continue; tg.fillStyle = z.fill; for (const b of z.blocks || [z.poly]) fillPoly(tg, b); }
  const tint = new THREE.CanvasTexture(tc);
  tint.flipY = false; tint.colorSpace = THREE.SRGBColorSpace;

  const grass = mat('grass').map;
  const extra = sh => {
    sh.uniforms.uMask = { value: mask }; sh.uniforms.uGrass = { value: grass }; sh.uniforms.uTint = { value: tint };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uMask, uGrass, uTint;')
      .replace('#include <map_fragment>', `
        vec2 gUv = vWPos.xz;
        // 만화 화풍(uToon)일 때는 풀잎·잔돌 무늬를 평균 색으로 뭉개고, 얼룩과 길 가장자리를 또렷한 두 색으로 끊는다
        float gLod = uToon * 12.0;
        vec4 gDirt = texture2D(map, gUv / 5.0, gLod);
        gDirt.rgb = mix(gDirt.rgb, gDirt.rgb * vec3(1.09, 1.0, 0.78), uToon);   // 만화 화풍의 흙길은 누런 황토빛으로(화면 전체의 채도를 낮춘 만큼 여기서 따뜻하게 돌려놓는다)
        vec4 gGrass = texture2D(uGrass, gUv / 3.0, gLod);
        float gTone = 0.62 + 0.5 * wNoise(gUv * 0.045) + 0.28 * wNoise(gUv * 0.011 + 5.0);
        gTone = mix(gTone, mix(0.9, 1.2, smoothstep(0.99, 1.01, gTone)), uToon);
        gGrass.rgb = (gGrass.rgb * 0.62 + vec3(0.055, 0.05, 0.02)) * gTone;
        float gSun = wNoise(gUv * 0.027 + 11.0);
        gGrass.rgb = mix(gGrass.rgb, gGrass.rgb * vec3(1.25, 1.12, 0.7), mix(smoothstep(0.55, 0.8, gSun), smoothstep(0.67, 0.69, gSun), uToon));   // 볕에 바랜 누런 자리
        vec2 mUv = (gUv - vec2(${MAP.cx.toFixed(1)}, ${MAP.cz.toFixed(1)})) / ${size.toFixed(1)} + 0.5;
        float gM = texture2D(uMask, mUv).r;
        gM = smoothstep(0.38 + 0.1 * uToon, 0.62 - 0.1 * uToon, gM + (wFbm(gUv * 0.8) - 0.5) * 0.5 * (1.0 - 0.6 * uToon));
        vec3 gRock = vec3(0.56, 0.50, 0.41) * mix(0.7 + 0.5 * wFbm(gUv * 0.35), 0.95, uToon);
        vec4 gTint = texture2D(uTint, mUv);
        gGrass.rgb = mix(gGrass.rgb, gTint.rgb * (0.55 + 0.45 * gTone), gTint.a * 0.55);   // 구역 빛깔
        vec4 gCol = mix(gGrass, gDirt, gM);
        gCol.rgb = mix(gCol.rgb, gRock, smoothstep(0.82, 0.6, vWNor.y));          // 가파른 비탈은 바위가 드러난다
        diffuseColor *= gCol;`);
  };
  extra.key = 'ground';
  const t = mat('dirt');
  const gm = weatherize(new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, roughness: 0.96 }), { puddles: true, extra });

  const mk = (x0, z0, x1, z1, step, hf) => {
    const nx = Math.round((x1 - x0) / step), nz = Math.round((z1 - z0) / step), pos = new Float32Array((nx + 1) * (nz + 1) * 3), idx = new Uint32Array(nx * nz * 6);
    let p = 0, q = 0;
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const x = x0 + (x1 - x0) * i / nx, z = z0 + (z1 - z0) * j / nz; pos[p++] = x; pos[p++] = hf(x, z); pos[p++] = z; }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, e = d + 1;
      if (step === 3) { const mx = x0 + (i + 0.5) * step, mz = z0 + (j + 0.5) * step, H = ROOT.hole; if (mx > H[0] && mx < H[2] && mz > H[1] && mz < H[3]) continue; }   // 뿌리 본거지의 계단 입구는 뚫어 둔다
      idx[q++] = a; idx[q++] = d; idx[q++] = b; idx[q++] = b; idx[q++] = d; idx[q++] = e; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1)); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, gm); m.receiveShadow = true; m.matrixAutoUpdate = false; scene.add(m);
    return m;
  };
  // 마을 바닥과 담 밖 언덕. 물길 둘레는 촘촘하게 떠야 강둑이 매끈하므로 마을 안은 3m 칸으로 뜬다
  const low = (x, z) => { const h = lowH(x, z); return h > 0.01 ? h : -BED * carve(x, z); };
  const X0 = WALL.cx - 720, X1 = WALL.cx + 720, Z0 = CLIFF.z - 180, Z1 = WALL.gateZ + 120, FAR = 2600;
  mk(X0, Z0, X1, Z1, 3, low);
  // 먼 땅: 하늘에서 내려다봐도 땅끝이 보이지 않게, 마을 둘레를 성긴 칸으로 멀리까지 잇는다
  const far = (x, z) => Math.max(lowH(x, z), mountainH(x, z));
  // 동쪽은 죽음의 숲이 놓인 자리(DX1까지, DZ0~DZ1)만 촘촘하게 뜬다. 자리표는 40m 칸에 맞춘다
  const DX1 = X1 + 240, DZ0 = WALL.cz - FAR + 40 * 68, DZ1 = WALL.cz - FAR + 40 * 82;
  mk(WALL.cx - FAR, WALL.cz - FAR, X0, WALL.cz + FAR, 40, far); mk(X1, WALL.cz - FAR, WALL.cx + FAR, DZ0, 40, far); mk(X1, DZ1, WALL.cx + FAR, WALL.cz + FAR, 40, far);
  mk(DX1, DZ0, WALL.cx + FAR, DZ1, 40, far); mk(X1, DZ0, DX1, DZ1, 4, low);
  mk(X1 - 40, DZ0 - 40, DX1 + 40, DZ1 + 40, 40, (x, z) => far(x, z) - 3);
  for (const [a0, b0, a1, b1] of [[X0 - 40, Z1 - 40, X1 + 40, Z1 + 40], [X0 - 40, Z0 - 40, X1 + 40, Z0 + 40], [X0 - 40, Z0, X0 + 40, Z1], [X1 - 40, Z0, X1 + 40, Z1]]) mk(a0, b0, a1, b1, 40, (x, z) => far(x, z) - 3);   // 촘촘한 땅의 네 가장자리 밑에도 받친다   // 촘촘한 땅과 성긴 땅이 만나는 이음매의 틈으로 하늘이 비치지 않게, 밑에 한 겹 받친다
  mk(X0, WALL.cz - FAR, X1, Z0, 40, far); mk(X0, Z1, X1, WALL.cz + FAR, 40, far);
  // 산 위. 산자락이 땅과 같은 높이로 겹치면 깜빡이므로, 산이 끝난 자리는 땅 밑으로 내린다
  mk(-(CLIFF.half + CLIFF.fall + 12), CLIFF.z - 180, CLIFF.half + CLIFF.fall + 12, CLIFF.z, 4, (x, z) => { const m = mountainH(x, Math.min(z, CLIFF.z - 0.01)), l = lowH(x, z); return m > l + 0.3 ? m : l - 1.5; });
}

/* ---------- 물 ---------- */
function buildWater(scene) {
  const up = geo => {   // 윗면이 하늘을 보게 맞춘다
    geo.computeVertexNormals();
    if (geo.attributes.normal.getY(0) < 0) { const ix = geo.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } geo.computeVertexNormals(); }
    const m = new THREE.Mesh(geo, M.water); m.receiveShadow = true; m.matrixAutoUpdate = false; scene.add(m);
  };
  for (const r of RIVERS) {   // 강·냇물: 줄을 따라 띠를 깐다(둑 밑으로 조금 넉넉하게)
    const pos = [], idx = [], hw = r.w / 2 + 3, n = r.pts.length;
    for (let i = 0; i < n; i++) {
      const a = r.pts[Math.max(0, i - 1)], b = r.pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
      pos.push(r.pts[i][0] + nx * hw, WATER_Y, r.pts[i][1] + nz * hw, r.pts[i][0] - nx * hw, WATER_Y, r.pts[i][1] - nz * hw);
      if (i < n - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); up(geo);
  }
  for (const p of POOLS) {    // 호수·못: 가운데에서 가장자리로 부채처럼 편다
    const cx = p.poly.reduce((t, v) => t + v[0], 0) / p.poly.length, cz = p.poly.reduce((t, v) => t + v[1], 0) / p.poly.length, pos = [cx, WATER_Y - 0.01, cz], idx = [], n = p.poly.length;
    for (const v of p.poly) { const l = Math.hypot(v[0] - cx, v[1] - cz), s = (l + 3) / l; pos.push(cx + (v[0] - cx) * s, WATER_Y - 0.01, cz + (v[1] - cz) * s); }
    for (let i = 0; i < n; i++) idx.push(0, 1 + i, 1 + (i + 1) % n);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); up(geo);
  }
}

/* ---------- 다리와 부두: 비스듬히 놓이므로 모습은 통째로 돌려 놓고, 밟는 바닥은 작은 상자를 줄지어 깐다 ---------- */
function deck(B, a, b, width, y, planks, rail) {
  const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz), ry = Math.atan2(dx, dz), cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2;
  B.geo(planks, new THREE.BoxGeometry(width, 0.28, len), mat4(cx, y - 0.14, cz, 0, ry, 0), [width / 2, len / 2]);
  const ux = dx / len, uz = dz / len, nx = uz, nz = -ux;
  for (const s of [-1, 1]) {
    B.geo(M.beam, new THREE.BoxGeometry(0.3, 0.34, len), mat4(cx + nx * s * (width / 2 - 0.15), y - 0.45, cz + nz * s * (width / 2 - 0.15), 0, ry, 0));   // 들보
    if (rail) B.geo(M.beam, new THREE.BoxGeometry(0.12, 0.12, len), mat4(cx + nx * s * (width / 2 - 0.1), y + 1.0, cz + nz * s * (width / 2 - 0.1), 0, ry, 0));   // 난간 가로대
    for (let t = 0; t <= len + 0.01; t += len / Math.max(1, Math.round(len / 4))) {     // 기둥: 물 밑 바닥까지
      const x = a[0] + ux * t + nx * s * (width / 2 - 0.1), z = a[1] + uz * t + nz * s * (width / 2 - 0.1);
      B.geo(M.beam, new THREE.BoxGeometry(0.22, (rail ? 1.1 : 0.2) + y + BED + 0.3, 0.22), mat4(x, ((rail ? 1.1 : 0.2) + y - BED - 0.3) / 2, z, 0, ry, 0));
    }
  }
  const h = (width / 2) / (Math.abs(ux) + Math.abs(uz));       // 줄지은 상자가 널 밖으로 삐져나오지 않는 크기
  for (let t = 0; t <= len; t += h * 0.6) addCollider(a[0] + ux * t - h, -BED - 0.5, a[1] + uz * t - h, a[0] + ux * t + h, y, a[1] + uz * t + h);
}
function buildCrossings(scene) {
  const B = new Builder(), planks = mat('planks', 0x8a6a48);
  PLAN.bridges.forEach((b, i) => deck(B, b[0], b[1], i < 2 ? 9 : 5, 0.22, planks, true));
  deck(B, WT.pier[0], WT.pier[1], 2.6, 0.3, planks, false);
  B.finish(scene);
}

/* ---------- 구역 팻말(빈 마을 확인용): 구역 번호 자리에 이름을 적은 팻말을 세운다 ---------- */
const BUILT = new Set([...Object.values(SITE).map(s => s.zone).filter(Boolean), ...DONE_ZONES]);   // 건물이 이미 선 구역(팻말·빈 터 안내를 뺀다)
function buildSigns(scene) {
  const B = new Builder();
  const post = (name, x, z) => {
    const ry = Math.atan2(PLAN.fan[0] - x, PLAN.fan[1] - z), w = Math.max(2.4, name.length * 0.62 + 0.8), y = terrainH(x, z);
    for (const s of [-1, 1]) B.geo(M.beam, new THREE.BoxGeometry(0.16, 3.6, 0.16), mat4(x + Math.cos(ry) * s * (w / 2 - 0.1), y + 1.8, z - Math.sin(ry) * s * (w / 2 - 0.1), 0, ry, 0));
    signBoard(B, name, x, y + 3.0, z, ry, w, 0.9, { font: 'gothic' });
    addCollider(x - 0.3, y, z - 0.3, x + 0.3, y + 3.6, z + 0.3);
  };
  for (const z of PLAN.zones) if (!BUILT.has(z.n)) post(z.name, z.at[0], z.at[1]);
  for (const t of PLAN.train) if (false) post(t.name.split(' — ')[0], t.at[0] + 4, t.at[1] + 4);   // 제1 훈련장은 아카데미 터 안에 지었다(campus.js) — 푯말을 따로 세우지 않는다
  B.finish(scene);
}

export async function buildVillage(scene, ctx) {
  buildGround(scene, ctx.tint !== false);
  buildWater(scene);
  buildCrossings(scene);
  const bounds = poly => { const b = bbox(poly, 0); return [b[0], b[2], b[1], b[3]]; };
  const places = [
    { n: '나뭇잎 마을', t: '불의 나라 숨은 마을. 북쪽 절벽에는 역대 호카게의 얼굴이 새겨져 있다.', b: [WALL.cx - WALL.r, WALL.cx + WALL.r, CLIFF.z, WALL.gateZ] },
    { n: '큰길', t: '정문에서 호카게 관저까지 곧게 뻗은 길.', b: [-6, 6, -50, WALL.gateZ - 1] },
    { n: '정문', t: '마을의 남쪽 대문. 왼쪽 문짝에 あ, 오른쪽 문짝에 ん이 적혀 있다.', b: [-16, 16, WALL.gateZ - 16, WALL.gateZ + 6] },
    { n: '섬 있는 못', t: '나카 강이 시작되는 못. 제2 훈련장.', poly: WT.isle, b: bounds(WT.isle) },
    ...PLAN.zones.filter(z => !BUILT.has(z.n)).map(z => ({ n: z.name, t: '새 배치의 자리. 아직 빈 터다.', poly: z.poly, b: bounds(z.poly) })),
    ...PLAN.train.filter(() => false).map(t => ({ n: t.name.split(' — ')[0], t: t.name.split(' — ')[1] || '', b: [t.at[0] - 18, t.at[0] + 18, t.at[1] - 18, t.at[1] + 18] })),
  ];
  // 바로 가기: 구역마다 번호 자리 앞에 선다(관저 쪽을 등지고 구역을 본다)
  const face = (x, z) => Math.atan2(PLAN.fan[0] - x, PLAN.fan[1] - z) + Math.PI;
  const jumps = [['정문', 0, 0, WALL.gateZ - 15, 0, 0], ['큰길 한가운데', 0, 0, WALL.cz, 0, 1],
    ['우치하 구역 부두', WT.pier[0][0], 0.3, WT.pier[0][1], Math.atan2(WT.pier[0][0] - WT.pier[1][0], WT.pier[0][1] - WT.pier[1][1]), 20],
    ...PLAN.zones.filter(z => !BUILT.has(z.n) && (z.blocks || [3, 26, 30, 31, 20].includes(z.n))).map((z, i) => [z.name, z.at[0] + 6, 0, z.at[1] + 6, face(z.at[0], z.at[1]), 21 + i])];
  const out = { places, jumps, skip: [], lights: [], glows: [], ticks: [] };
  const take = r => { for (const k of ['places', 'jumps', 'skip', 'lights', 'glows']) out[k].push(...(r[k] || [])); if (r.tick) out.ticks.push(r.tick); };
  if (!ctx.lite) {
    // 호카게 바위와 담·정문(건물 하나만 확인할 때는 건너뛴다). 거리의 집과 나무는 다음 단계에서 새 자리표로 세운다.
    if (!ctx.part || ctx.part === 'rock') { await ctx.say('절벽에 호카게의 얼굴을 새기는 중…'); try { take(await (await import('./rock.js')).build(scene, ctx)); } catch (e) { console.error('짓기 실패: rock', e); } } if (window.__memMark) window.__memMark('rock');
    if (!ctx.part || ctx.part === 'wall') {
      await ctx.say('담을 두르고 정문을 세우는 중…');
      try { const town = await import('./town.js'); town.buildWall(scene, town.makeKit(), out.glows); } catch (e) { console.error('짓기 실패: wall', e); }
    } if (window.__memMark) window.__memMark('wall');
    if (!ctx.part) { await ctx.say('구역 팻말을 세우는 중…'); buildSigns(scene); }
    if (!ctx.part || ctx.part === 'streets') { try { take(await (await import('./zones.js')).build(scene, ctx)); } catch (e) { console.error('짓기 실패: zones', e); } } if (window.__memMark) window.__memMark('zones');
    if (!ctx.part || ctx.part === 'streets') { try { take(await (await import('./civic.js')).build(scene, ctx)); } catch (e) { console.error('짓기 실패: civic', e); } } if (window.__memMark) window.__memMark('civic');   // 관저 둘레의 시설(대기소·정보부·전서구 탑)
    if (!ctx.part || ctx.part === 'streets') { try { take(await (await import('./streets.js')).build(scene, ctx)); } catch (e) { console.error('짓기 실패: streets', e); } } if (window.__memMark) window.__memMark('streets');
  }
  if (out.ticks.length) out.tick = (t, dt) => { for (const f of out.ticks) f(t, dt); };
  return out;
}
