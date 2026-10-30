// Sons sintetizados na hora (sem arquivos): chiado dos propulsores (translação e rotação),
// zumbido da cabine, clunk do encaixe, batida, argola, astronauta pego, alarme de combustível.
// Só começa depois de um clique, tecla ou entrada no VR (regra do navegador). Os testes nunca
// carregam este arquivo.
export class Sfx {
  constructor() { this.ctx = null; this.on = true; }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.on ? 0.8 : 0;
      this.master.connect(this.ctx.destination);
      this.startLoops();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  setOn(v) {
    this.on = v;
    if (this.master) this.master.gain.setTargetAtTime(v ? 0.8 : 0, this.ctx.currentTime, 0.05);
  }

  noise(sec, brown = 0) {
    const c = this.ctx, buf = c.createBuffer(1, Math.ceil(c.sampleRate * sec), c.sampleRate), d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = brown * b + (1 - brown) * w; d[i] = brown ? b * 3.5 : w; }
    return buf;
  }
  loop(buf, type, freq, q) {
    const c = this.ctx, src = c.createBufferSource();
    src.buffer = buf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
    return { f, g };
  }
  startLoops() {
    const white = this.noise(2), brown = this.noise(3, 0.985);
    this.jetT = this.loop(white, 'bandpass', 2600, 0.8);   // propulsores de translação
    this.jetR = this.loop(white, 'bandpass', 4200, 1.4);   // propulsores de rotação (mais fino)
    this.hum = this.loop(brown, 'lowpass', 140, 0.7);      // ventilação da cabine
    this.hum.g.gain.value = 0.05;
    const o = this.ctx.createOscillator(), og = this.ctx.createGain();
    o.frequency.value = 58; o.type = 'sine'; og.gain.value = 0.012;
    o.connect(og); og.connect(this.master); o.start();
  }
  // t, r: quanto os propulsores estão acesos (0..3 cada); stab: estabilizando
  setJets(t, r, stab) {
    if (!this.jetT) return;
    const now = this.ctx.currentTime;
    this.jetT.g.gain.setTargetAtTime(Math.min(0.3, t * 0.12), now, 0.02);
    this.jetR.g.gain.setTargetAtTime(Math.min(0.22, r * 0.09 + (stab ? 0.05 : 0)), now, 0.02);
    this.jetT.f.frequency.setTargetAtTime(2200 + t * 300, now, 0.05);
  }

  tone(freq, dur, { type = 'sine', vol = 0.2, at = 0, slide = 0, attack = 0.005 } = {}) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  burst(dur, freq, vol, { type = 'lowpass', at = 0, q = 0.8 } = {}) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + at, src = c.createBufferSource();
    src.buffer = this.noise(dur + 0.05);
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t); src.stop(t + dur + 0.05);
  }

  click() { this.tone(1300, 0.05, { type: 'triangle', vol: 0.08 }); }
  // encaixe: batida grave, trava metálica e o anel ressoando
  clunk() {
    this.tone(95, 0.5, { vol: 0.5, slide: -50 });
    this.burst(0.18, 700, 0.35);
    for (const [f, v, d] of [[340, 0.09, 1.4], [517, 0.06, 1.1], [833, 0.04, 0.9], [1290, 0.025, 0.7]]) this.tone(f, d, { vol: v, at: 0.03 });
    this.burst(0.08, 2400, 0.18, { type: 'bandpass', at: 0.35 });
    this.tone(160, 0.25, { vol: 0.3, at: 0.36, slide: -60 });
  }
  hit(v) {
    const s = Math.min(1, v / 1.5);
    this.tone(70, 0.35, { vol: 0.25 + 0.4 * s, slide: -30 });
    this.burst(0.25 + 0.3 * s, 900, 0.2 + 0.4 * s);
    if (s > 0.3) for (const f of [210, 377, 590]) this.tone(f, 0.6, { vol: 0.05 * s, type: 'triangle', at: 0.02 });
  }
  bounce() { this.tone(220, 0.25, { vol: 0.2, slide: -80 }); this.burst(0.1, 1200, 0.12); }
  ring() { this.tone(880, 0.6, { vol: 0.12 }); this.tone(1320, 0.8, { vol: 0.08, at: 0.08 }); }
  rescue() { [660, 880, 1100].forEach((f, i) => this.tone(f, 0.5, { vol: 0.1, at: i * 0.1 })); }
  grab() { this.tone(500, 0.08, { type: 'triangle', vol: 0.08 }); }
  warn() { [0, 0.25].forEach(at => this.tone(740, 0.15, { type: 'square', vol: 0.05, at })); }
  alarm() { [0, 0.3, 0.6].forEach(at => this.tone(520, 0.22, { type: 'sawtooth', vol: 0.06, at, slide: -120 })); }
  done() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.9, { vol: 0.1, at: i * 0.14 })); }
  star(k) { this.tone(880 + k * 220, 0.4, { type: 'triangle', vol: 0.1 }); }
}
