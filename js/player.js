// 걷는 사람 — 1인칭 시점. WASD로 걷고, Shift로 달리고, Space로 뛴다. 벽에 막히고 계단을 오른다.
import * as THREE from '../vendor/three.module.js';
import { collidersNear } from './build.js';

const RAD = 0.34, HEIGHT = 1.75, EYE = 1.62, STEP = 0.5, WALK = 4.6, RUN = 9.5, JUMP = 6.4, GRAV = 20;

export class Player {
  constructor(camera, dom, terrain) {
    this.cam = camera; this.dom = dom; this.terrain = terrain;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0; this.eyeY = 0; this.grounded = false; this.locked = false; this.bob = 0;
    this.keys = {}; this.near = [];
    this.touchMode = false; this.touch = { x: 0, z: 0, run: false }; this.jumpQueued = false;   // 터치: 조이스틱 기울기, 달리기, 뛰기 예약
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

  place(x, y, z, yaw = this.yaw, pitch = 0) {
    this.pos.set(x, y, z); this.vel.set(0, 0, 0); this.yaw = yaw; this.pitch = pitch; this.eyeY = y; this.sync();
  }

  // 그 자리에 설 수 있는 가장 높은 바닥(발에서 한 단 높이 이내)
  groundAt(x, z, feet) {
    let g = this.terrain(x, z);
    const r = RAD * 0.8;
    for (const c of collidersNear(x - r, z - r, x + r, z + r, this.near)) if (c[4] <= feet + STEP + 0.01 && c[4] > g) g = c[4];
    return g;
  }

  blocked(x, z, feet) {
    // 가파른 비탈(절벽)은 걸어 오를 수 없다
    const th = this.terrain(x, z);
    if (th > feet + 0.02) { const d = Math.hypot(x - this.pos.x, z - this.pos.z); if (d > 1e-5 && (th - feet) / d > 1.5) return true; }
    for (const c of collidersNear(x - RAD, z - RAD, x + RAD, z + RAD, this.near)) {
      if (c[4] <= feet + STEP || c[1] >= feet + HEIGHT) continue;       // 밟고 오를 수 있거나 머리 위로 지나간다
      const dx = x - Math.max(c[0], Math.min(x, c[3])), dz = z - Math.max(c[2], Math.min(z, c[5]));
      if (dx * dx + dz * dz < RAD * RAD) return true;
    }
    return false;
  }

  update(dt) {
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
    if (this.locked && (k.Space || this.jumpQueued) && this.grounded) { v.y = JUMP; this.grounded = false; }
    this.jumpQueued = false;
    v.y -= GRAV * dt;

    // 가로 이동: 축마다 따로 막아서 벽을 타고 미끄러진다
    const nx = p.x + v.x * dt;
    if (!this.blocked(nx, p.z, p.y)) p.x = nx; else v.x = 0;
    const nz = p.z + v.z * dt;
    if (!this.blocked(p.x, nz, p.y)) p.z = nz; else v.z = 0;
    const lim = 262, d = Math.hypot(p.x, p.z);
    if (d > lim) { p.x *= lim / d; p.z *= lim / d; }

    // 세로 이동
    const g = this.groundAt(p.x, p.z, p.y);
    let ny = p.y + v.y * dt;
    if (v.y > 0) { // 뛰어오르다 천장에 닿으면 멈춘다
      for (const cc of collidersNear(p.x - RAD * 0.8, p.z - RAD * 0.8, p.x + RAD * 0.8, p.z + RAD * 0.8, this.near))
        if (cc[1] >= p.y + HEIGHT - 0.05 && cc[1] < ny + HEIGHT) { ny = cc[1] - HEIGHT; v.y = 0; }
    }
    if (ny <= g || (this.grounded && v.y <= 0 && p.y - g <= STEP && p.y >= g)) { p.y = g; v.y = 0; this.grounded = true; }
    else { p.y = ny; this.grounded = false; }
    if (p.y < -60) this.place(0, 0, 150, 0);

    // 눈높이는 부드럽게 따라가서 계단에서 화면이 덜컥거리지 않는다
    this.eyeY += (p.y - this.eyeY) * (1 - Math.exp(-dt * 16));
    if (Math.abs(p.y - this.eyeY) > 1.2) this.eyeY = p.y;
    const speed = Math.hypot(v.x, v.z);
    if (this.grounded && speed > 0.5) this.bob += dt * speed * 1.55;
    this.sync(this.grounded ? Math.sin(this.bob * 2) * 0.028 * Math.min(1, speed / WALK) : 0);
  }

  sync(bob = 0) {
    this.cam.position.set(this.pos.x, this.eyeY + EYE + bob, this.pos.z);
    this.cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
