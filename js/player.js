// 걷는 사람 — 1인칭 시점. WASD로 걷고, Shift로 달리고, Space로 뛴다(길게 누르면 힘을 모아 지붕 높이까지). 벽에 막히고 계단을 오르고 지붕을 밟는다.
// 하늘에서 보기(sky): 몸은 그 자리에 두고 눈만 하늘로 올라가 마을을 내려다보며 날아다닌다. 끝내면 내려다보던 자리에 내려선다.
import * as THREE from '../vendor/three.module.js';
import { nearAll, roofAt } from './build.js';
import { WALL } from './layout.js';

const RAD = 0.34, HEIGHT = 1.75, EYE = 1.62, STEP = 0.5, WALK = 4.6, RUN = 9.5, JUMP = 6.4, GRAV = 20;
// 모아 뛰기: HOLD초 넘게 누르고 있으면 힘이 모이기 시작해 CHARGE초 만에 가득 찬다. 가득 모으면 LEAP_H(m)까지 솟는다.
const HOLD = 0.14, CHARGE = 0.9, JUMP_H = JUMP * JUMP / (2 * GRAV), LEAP_H = 13.5;
// 하늘에서 보기: 가장 낮은·높은 높이(m), 손가락으로 차례로 고르는 높이들, 마을 밖으로 나갈 수 있는 거리
const SKY_LO = 6, SKY_HI = 900, SKY_STEPS = [70, 160, 340, 650], SKY_OUT = 320;

export class Player {
  constructor(camera, dom, terrain) {
    this.cam = camera; this.dom = dom; this.terrain = terrain;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.eyeY = 0; this.grounded = false; this.locked = false; this.bob = 0;
    this.keys = {}; this.near = [];
    this.touchMode = false; this.touch = { x: 0, z: 0, run: false }; this.jumpQueued = false;   // 터치: 조이스틱 기울기, 달리기, 뛰기 예약
    this.jumpHeld = false; this.hold = 0; this.charge = 0; this.dip = 0;   // 뛰기 단추를 누르고 있는가, 누른 시간, 모인 힘(0~1), 착지 때 무릎 굽힘
    this.sky = false; this.skyPos = new THREE.Vector3(); this.skyVel = new THREE.Vector3();   // 하늘에서 보기: 켜졌는가, 눈의 자리, 나는 속도
    addEventListener('wheel', e => { if (this.sky && this.locked) this.skyVel.y += Math.sign(e.deltaY) * Math.max(14, this.skyHeight() * 0.9); }, { passive: true });   // 휠: 높이(내리면 올라가고 올리면 내려간다)
    addEventListener('keydown', e => { this.keys[e.code] = true; if (this.locked && ['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault(); });
    addEventListener('keyup', e => { this.keys[e.code] = false; });
    addEventListener('blur', () => { this.keys = {}; });
    document.addEventListener('mousemove', e => {
      if (!this.locked) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.0022, -1.5, 1.5);
    });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === dom; if (!this.locked) this.keys = {}; if (this.onLock) this.onLock(this.locked); });
  }

  // 터치 기기에는 마우스 고정이 없다 — 그냥 "걷는 중" 상태로 바꾼다
  lock() {
    if (this.touchMode || !this.dom.requestPointerLock) { this.setActive(true); return; }
    this.dom.requestPointerLock();
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); else this.setActive(false); }
  setActive(on) { this.locked = on; if (!on) { this.keys = {}; this.touch.x = this.touch.z = 0; this.touch.run = false; } if (this.onLock) this.onLock(on); }
  look(dx, dy, sens) {
    this.yaw -= dx * sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * sens, -1.5, 1.5);
  }

  // 하늘에서 보기를 켜고 끈다. 켤 때는 서 있던 자리가 내려다보이게 뒤로 물러나 떠오르고, 끌 때는 화면 한가운데로 보던 땅에 내려선다.
  setSky(on) {
    if (on === this.sky) return;
    this.sky = on; this.skyVel.set(0, 0, 0); this.vel.set(0, 0, 0); this.hold = 0; this.charge = 0;
    if (on) {
      this.pitch = -0.8;
      this.skyPos.set(this.pos.x + Math.sin(this.yaw) * 150, this.pos.y + 160, this.pos.z + Math.cos(this.yaw) * 150);
    } else {
      const h = this.skyHeight(), reach = this.pitch < -0.12 ? Math.min(900, h / Math.tan(-this.pitch)) : 0;   // 내려다보던 자리까지의 거리
      const x = this.skyPos.x - Math.sin(this.yaw) * reach, z = this.skyPos.z - Math.cos(this.yaw) * reach;
      this.pos.set(x, Math.max(this.terrain(x, z), 0) + 0.05, z); this.eyeY = this.pos.y; this.pitch = 0; this.grounded = false;
      for (let i = 0; i < 80 && this.blocked(this.pos.x, this.pos.z, this.pos.y); i++) this.pos.z += 0.5;   // 벽 속에 내려섰으면 빠져나올 때까지 비켜선다
    }
    this.sync(); if (this.onSky) this.onSky(on);
  }
  skyHeight() { return this.skyPos.y - Math.max(0, this.terrain(this.skyPos.x, this.skyPos.z)); }
  // 손가락용: 높이를 차례로 바꾼다
  skyStep() { const h = this.skyHeight(), i = SKY_STEPS.findIndex(s => s > h + 5); this.skyVel.y = 0; this.skyPos.y += SKY_STEPS[i < 0 ? 0 : i] - h; }
  // 하늘에서: WASD로 보는 쪽 기준 앞뒤좌우, 휠로 높이, Shift 빠르게. 높이 날수록 빨리 난다.
  skyUpdate(dt) {
    const k = this.keys, p = this.skyPos, v = this.skyVel;
    let fx = 0, fz = 0, fy = 0;
    if (this.locked) {
      if (k.KeyW || k.ArrowUp) fz -= 1; if (k.KeyS || k.ArrowDown) fz += 1;
      if (k.KeyA || k.ArrowLeft) fx -= 1; if (k.KeyD || k.ArrowRight) fx += 1;
      fx += this.touch.x; fz += this.touch.z;
    }
    const h = this.skyHeight(), fast = k.ShiftLeft || k.ShiftRight || this.touch.run, sp = Math.max(18, h * 0.75) * (fast ? 2.6 : 1);
    const len = Math.max(1, Math.hypot(fx, fz)), s = Math.sin(this.yaw), c = Math.cos(this.yaw), a = 1 - Math.exp(-dt * 7);
    v.x += ((fx * c + fz * s) / len * sp - v.x) * a; v.z += ((-fx * s + fz * c) / len * sp - v.z) * a;
    v.y += (fy * Math.max(14, h * 0.7) * (fast ? 2 : 1) - v.y) * (1 - Math.exp(-dt * (fy ? 7 : 4)));
    p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
    const lim = WALL.r + SKY_OUT, ox = p.x - WALL.cx, oz = p.z - WALL.cz, d = Math.hypot(ox, oz);
    if (d > lim) { p.x = WALL.cx + ox * lim / d; p.z = WALL.cz + oz * lim / d; }
    const g = Math.max(0, this.terrain(p.x, p.z));
    if (p.y < g + SKY_LO) { p.y = g + SKY_LO; v.y = Math.max(0, v.y); }
    if (p.y > g + SKY_HI) { p.y = g + SKY_HI; v.y = Math.min(0, v.y); }
    this.sync();
  }

  place(x, y, z, yaw = this.yaw, pitch = 0) {
    this.sky = false; this.pos.set(x, y, z); this.vel.set(0, 0, 0); this.yaw = yaw; this.pitch = pitch; this.eyeY = y; this.sync();
  }

  // 그 자리에 설 수 있는 가장 높은 바닥(발에서 한 단 높이 이내)
  groundAt(x, z, feet) {
    let g = this.terrain(x, z);
    const r = RAD * 0.8;
    const N = nearAll(x, z, r, this.near);   // (상자, 그 상자의 좌표로 본 내 자리 x, z, 자리) 네 개씩
    for (let i = 0; i < N.length; i += 4) { const c = N[i]; if (c[4] <= feet + STEP + 0.01 && c[4] > g) g = c[4]; }
    const rh = roofAt(x, z, feet + STEP + 0.01);   // 기와지붕
    return rh > g ? rh : g;
  }

  // 그 자리가 막혔는가. 막혔으면 this.hit에 막은 건물의 자리(똑바로 놓인 것이면 null)를 적어 둔다.
  blocked(x, z, feet) {
    this.hit = null; this.gap = Infinity;     // gap: 막은 것들 가운데 가장 깊이 파고든 것까지의 거리(제곱) — 끼었을 때 빠져나오는 쪽을 가리는 데 쓴다
    // 가파른 비탈(절벽)은 걸어 오를 수 없다
    const th = this.terrain(x, z);
    if (th > feet + 0.02) { const d = Math.hypot(x - this.pos.x, z - this.pos.z); if (d > 1e-5 && (th - feet) / d > 1.5) { this.gap = -1; return true; } }
    const N = nearAll(x, z, RAD, this.near);
    for (let i = 0; i < N.length; i += 4) {
      const c = N[i], lx = N[i + 1], lz = N[i + 2];
      if (c[4] <= feet + STEP || c[1] >= feet + HEIGHT) continue;       // 밟고 오를 수 있거나 머리 위로 지나간다
      const dx = lx - Math.max(c[0], Math.min(lx, c[3])), dz = lz - Math.max(c[2], Math.min(lz, c[5]));
      const d2 = dx * dx + dz * dz;
      if (d2 < RAD * RAD && d2 < this.gap) { this.gap = d2; this.hit = N[i + 3]; }
    }
    return this.gap < Infinity;
  }
  // 그 자리로 갈 수 있는가. 이미 벽에 끼어 있을 때(계단 옆 창턱처럼 발 높이가 바뀌며 벽이 다시 막아서는 자리)는 벽 속으로 더 들어가지 않는 쪽이면 보내 준다.
  free(x, z, feet) {
    if (!this.blocked(x, z, feet)) return true;
    return this.stuck !== null && this.gap >= this.stuck - 1e-9;       // 더 깊이 파고들지만 않으면 된다(벽을 따라 미끄러져 나올 수 있게)
  }

  update(dt) {
    if (this.sky) return this.skyUpdate(dt);
    const k = this.keys, p = this.pos, v = this.vel;
    let fx = 0, fz = 0;
    if (this.locked) {
      if (k.KeyW || k.ArrowUp) fz -= 1; if (k.KeyS || k.ArrowDown) fz += 1;
      if (k.KeyA || k.ArrowLeft) fx -= 1; if (k.KeyD || k.ArrowRight) fx += 1;
    }
    if (this.locked) { fx += this.touch.x; fz += this.touch.z; }
    // 조이스틱은 기운 만큼 천천히·빨리 걷는다(자판은 늘 제 속도)
    const len = Math.hypot(fx, fz) || 1, mag = Math.min(1, Math.hypot(fx, fz)), sp = ((k.ShiftLeft || k.ShiftRight || this.touch.run) ? RUN : WALK) * mag;
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    const wx = (fx * c + fz * s) / len * sp, wz = (-fx * s + fz * c) / len * sp;
    const a = 1 - Math.exp(-dt * (this.grounded ? 12 : 2.5));
    v.x += (wx - v.x) * a; v.z += (wz - v.z) * a;
    // 뛰기: 단추를 떼는 순간 뛴다. 짧게 누르면 보통 뛰기, 누르고 있으면 힘이 모여 더 높이 솟는다.
    const held = this.locked && (k.Space || this.jumpHeld);
    if (held && this.grounded) this.hold += dt;
    else {
      if (this.locked && !held && this.hold > 0 && this.grounded) { v.y = Math.sqrt(2 * GRAV * (JUMP_H + (LEAP_H - JUMP_H) * this.charge)); this.grounded = false; }
      this.hold = 0;
    }
    this.charge = Math.min(1, Math.max(0, (this.hold - HOLD) / CHARGE));
    if (this.locked && this.jumpQueued && this.grounded) { v.y = JUMP; this.grounded = false; }
    this.jumpQueued = false;
    v.y -= GRAV * dt;

    // 가로 이동: 막히면 벽이 난 두 방향으로 나눠 따로 막아서 벽을 타고 미끄러진다(비스듬한 건물에서는 그 건물의 방향으로 나눈다)
    this.stuck = this.blocked(p.x, p.z, p.y) ? this.gap : null;             // 지금 선 자리가 이미 벽 속이면 얼마나 깊은지 적어 둔다
    if (this.free(p.x + v.x * dt, p.z + v.z * dt, p.y)) { p.x += v.x * dt; p.z += v.z * dt; }
    else {
      const h = this.hit, hc = h ? h.cos : 1, hs = h ? h.sin : 0;
      let a = v.x * hc - v.z * hs, b = v.x * hs + v.z * hc;                 // 벽 방향으로 나눈 속도
      if (this.free(p.x + a * hc * dt, p.z - a * hs * dt, p.y)) { p.x += a * hc * dt; p.z -= a * hs * dt; } else a = 0;
      if (this.stuck !== null) this.stuck = this.blocked(p.x, p.z, p.y) ? this.gap : null;
      if (this.free(p.x + b * hs * dt, p.z + b * hc * dt, p.y)) { p.x += b * hs * dt; p.z += b * hc * dt; } else b = 0;
      v.x = a * hc + b * hs; v.z = -a * hs + b * hc;
    }
    // 담 밖으로는 숲 가장자리까지만 나갈 수 있다
    const lim = WALL.r + 77, ox = p.x - WALL.cx, oz = p.z - WALL.cz, d = Math.hypot(ox, oz);
    if (d > lim) { p.x = WALL.cx + ox * lim / d; p.z = WALL.cz + oz * lim / d; }

    // 세로 이동
    const g = this.groundAt(p.x, p.z, p.y);
    let ny = p.y + v.y * dt;
    if (v.y > 0) { // 뛰어오르다 천장에 닿으면 멈춘다
      const N = nearAll(p.x, p.z, RAD * 0.8, this.near);
      for (let i = 0; i < N.length; i += 4) { const cc = N[i]; if (cc[1] >= p.y + HEIGHT - 0.05 && cc[1] < ny + HEIGHT) { ny = cc[1] - HEIGHT; v.y = 0; } }
    }
    if (ny <= g || (this.grounded && v.y <= 0 && p.y - g <= STEP && p.y >= g)) {
      if (!this.grounded && v.y < -9) this.dip = Math.min(0.42, -v.y * 0.02);   // 높은 데서 내려서면 무릎을 굽혀 받아 낸다(다치지 않는다)
      p.y = g; v.y = 0; this.grounded = true;
    }
    else { p.y = ny; this.grounded = false; }
    if (p.y < -60) this.place(0, 0, WALL.gateZ - 25, 0);

    // 눈높이는 부드럽게 따라가서 계단에서 화면이 덜컥거리지 않는다
    // 공중에서는 바짝 따라간다 — 느슨하게 따라가면 높이 뛰었다 떨어질 때 눈이 발보다 1m 넘게 뒤처지고, 그 순간 한꺼번에 따라붙어 화면이 툭 끊겼다
    this.eyeY += (p.y - this.eyeY) * (1 - Math.exp(-dt * (this.grounded ? 16 : 70)));
    const lag = p.y - this.eyeY; if (Math.abs(lag) > 0.6) this.eyeY = p.y - Math.sign(lag) * 0.6;      // 뒤처짐은 0.6m까지만(한꺼번에 따라붙지 않고 그 거리를 지킨다)
    const speed = Math.hypot(v.x, v.z);
    if (this.grounded && speed > 0.5) this.bob += dt * speed * 1.55;
    this.dip *= Math.exp(-dt * 7);
    this.sync((this.grounded ? Math.sin(this.bob * 2) * 0.028 * Math.min(1, speed / WALK) : 0) - this.dip - this.charge * 0.16);   // 힘을 모으는 동안 몸을 낮춘다
  }

  sync(bob = 0) {
    if (this.sky) this.cam.position.copy(this.skyPos); else this.cam.position.set(this.pos.x, this.eyeY + EYE + bob, this.pos.z);
    this.cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
