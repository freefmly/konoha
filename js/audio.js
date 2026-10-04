// 소리 — 녹음 파일 없이 잡음을 걸러 빗소리·바람·천둥을 만든다. 건물 안에서는 작아지고 먹먹해진다.
export class Sound {
  constructor() { this.ctx = null; this.muted = false; this.indoor = 0; this.rainLv = 0; this.windLv = 0; }

  // 브라우저는 사용자가 클릭한 뒤에만 소리를 낼 수 있다 — "들어가기"를 누를 때 부른다.
  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC(), sr = ctx.sampleRate;
    const noise = (sec, brown) => {
      const b = ctx.createBuffer(2, sr * sec, sr);
      for (let ch = 0; ch < 2; ch++) {
        const d = b.getChannelData(ch); let last = 0;
        for (let i = 0; i < d.length; i++) {
          const w = Math.random() * 2 - 1;
          if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
        }
      }
      return b;
    };
    this.white = noise(4, false); this.brown = noise(6, true);
    const loop = buf => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };
    const filt = (type, f, q = 0.7) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; return n; };
    const gain = v => { const g = ctx.createGain(); g.gain.value = v; return g; };

    this.master = gain(this.muted ? 0 : 0.9); this.master.connect(ctx.destination);
    // 바깥 소리는 모두 이 길을 지난다: 실내면 높은 소리가 깎이고(벽·지붕) 크기가 준다
    this.wallLP = filt('lowpass', 18000, 0.5); this.wallGain = gain(1);
    this.wallLP.connect(this.wallGain); this.wallGain.connect(this.master);

    // 비: 쏴 하는 높은 소리 + 땅과 지붕을 두드리는 낮은 소리
    this.rainBus = gain(0); this.rainBus.connect(this.wallLP);
    const hiss = loop(this.white), hp = filt('highpass', 900), lp = filt('lowpass', 9500), hg = gain(0.2);
    hiss.connect(hp); hp.connect(lp); lp.connect(hg); hg.connect(this.rainBus);
    const body = loop(this.white), bp = filt('bandpass', 520, 0.55), bg = gain(0.55);
    body.playbackRate.value = 0.83;
    body.connect(bp); bp.connect(bg); bg.connect(this.rainBus);
    const drum = loop(this.brown), dl = filt('lowpass', 260), dg = gain(0.5);
    drum.connect(dl); dl.connect(dg); dg.connect(this.rainBus);
    // 빗발이 굵어졌다 가늘어졌다 하는 느린 출렁임
    const lfo = ctx.createOscillator(), lg = gain(0.05); lfo.frequency.value = 0.13; lfo.connect(lg); lg.connect(hg.gain); lfo.start();

    // 바람
    this.windBus = gain(0); this.windBus.connect(this.wallLP);
    const wind = loop(this.brown), wbp = filt('bandpass', 380, 0.4);
    wind.playbackRate.value = 1.3;
    wind.connect(wbp); wbp.connect(this.windBus);
    const wl = ctx.createOscillator(), wlg = gain(140); wl.frequency.value = 0.08; wl.connect(wlg); wlg.connect(wbp.frequency); wl.start();

    this.thunderBus = gain(1); this.thunderBus.connect(this.wallLP);
  }

  setMuted(m) { this.muted = m; if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05); }

  // rain 0~1, wind 0~1, indoor 0(한데)~1(실내)
  update(rain, wind, indoor) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.rainBus.gain.setTargetAtTime(rain * 0.85, t, 0.4);
    this.windBus.gain.setTargetAtTime(wind, t, 0.6);
    this.indoor = indoor;
    this.wallLP.frequency.setTargetAtTime(18000 * Math.pow(600 / 18000, indoor), t, 0.18);
    this.wallGain.gain.setTargetAtTime(1 - 0.68 * indoor, t, 0.18);
  }

  // 천둥: 번개가 먼 만큼 늦게, 멀수록 낮고 길게 울린다
  thunder(dist) {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = ctx.currentTime + Math.min(3.2, dist / 343 * 1.6), near = 1 - Math.min(1, dist / 560);
    const src = ctx.createBufferSource(); src.buffer = this.brown; src.playbackRate.value = 0.55 + Math.random() * 0.25;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(260 + near * 900, t0); lp.frequency.exponentialRampToValueAtTime(70, t0 + 4.5);
    const g = ctx.createGain(), peak = 1.3 + near * 1.8, len = 4.5 + Math.random() * 2.5;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.06);
    g.gain.exponentialRampToValueAtTime(peak * 0.35, t0 + 0.5);
    g.gain.exponentialRampToValueAtTime(peak * 0.5, t0 + 1.0 + Math.random() * 0.5);   // 되울림
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    src.connect(lp); lp.connect(g); g.connect(this.thunderBus);
    src.start(t0, Math.random() * 2); src.stop(t0 + len + 0.2);
    if (near > 0.35) { // 가까운 번개는 먼저 "쩍" 하고 갈라진다
      const c = ctx.createBufferSource(); c.buffer = this.white;
      const hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 1800; hp.Q.value = 0.4;
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.0001, t0); cg.gain.exponentialRampToValueAtTime(near * 0.9, t0 + 0.012); cg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.38);
      c.connect(hp); hp.connect(cg); cg.connect(this.thunderBus);
      c.start(t0, Math.random() * 3); c.stop(t0 + 0.5);
    }
  }
}
