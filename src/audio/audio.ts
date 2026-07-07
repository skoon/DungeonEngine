/**
 * Audio layer (plan §1 `audio/`, M10 feel pass). A pure event-bus subscriber
 * that synthesises retro sound effects with the WebAudio API — no asset
 * files. The core never calls this directly; it just emits events. Guards
 * everything on an available AudioContext so it no-ops in headless/unsupported
 * environments. Browsers start the context suspended, so `unlock()` must be
 * called from a user gesture before sound plays.
 */

import type { EventBus, GameEvent } from '../core/events';

type Ctor = typeof AudioContext;

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;
  private lastStep = 0;

  constructor() {
    const AC: Ctor | undefined =
      (window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor }).AudioContext ??
      (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.32;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  /** Resume the context from a user gesture (browsers require this). */
  unlock(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.32;
    return this.muted;
  }

  attach(bus: EventBus): void {
    bus.onAny((e) => this.handle(e));
  }

  private handle(e: GameEvent): void {
    if (!this.ctx || this.muted) return;
    switch (e.type) {
      case 'party/moved': this.footstep(); break;
      case 'party/blocked': this.bump(); break;
      case 'party/turned': this.tick(1200, 0.04); break;
      case 'door/toggled': this.grind(); break;
      case 'attack/resolved': e.hit ? this.hit(e.by) : this.whoosh(); break;
      case 'monster/died': this.crumble(); break;
      case 'char/down': this.down(); break;
      case 'char/healed': this.shimmer(); break;
      case 'spell/cast': this.chime(); break;
      case 'item/taken': this.ding(); break;
      case 'party/fell': this.fall(); break;
      case 'party/camped': this.camp(); break;
      case 'level/changed': this.rumble(); break;
      case 'interact/used': this.tick(900, 0.06); break;
      case 'party/wiped': this.doom(); break;
      case 'game/saved':
      case 'game/loaded': this.confirm(); break;
      default: break;
    }
  }

  // --- synthesis primitives --------------------------------------------------

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, gain: number, filterFreq: number, type: BiquadFilterType = 'lowpass'): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const t = ctx.currentTime;
    const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur);
  }

  // --- effects ---------------------------------------------------------------

  private footstep(): void {
    const now = performance.now();
    if (now - this.lastStep < 90) return; // debounce rapid steps
    this.lastStep = now;
    this.noise(0.05, 0.25, 320, 'lowpass');
    this.tone(90, 0.05, 'sine', 0.12);
  }
  private bump(): void { this.tone(70, 0.11, 'square', 0.18); }
  private tick(freq: number, gain: number): void { this.tone(freq, 0.03, 'square', gain); }
  private grind(): void { this.noise(0.32, 0.22, 500, 'bandpass'); this.tone(120, 0.3, 'sawtooth', 0.06, 90); }
  private hit(by: 'party' | 'monster'): void {
    this.noise(0.06, 0.3, by === 'party' ? 900 : 600, 'lowpass');
    this.tone(by === 'party' ? 180 : 120, 0.08, 'square', 0.14);
  }
  private whoosh(): void { this.noise(0.12, 0.14, 1400, 'highpass'); }
  private crumble(): void { this.noise(0.28, 0.26, 700, 'lowpass'); this.tone(160, 0.28, 'sawtooth', 0.1, 60); }
  private down(): void { this.tone(160, 0.18, 'sine', 0.2, 70); this.tone(80, 0.3, 'sine', 0.14); }
  private shimmer(): void { [523, 659, 784].forEach((f, i) => setTimeout(() => this.tone(f, 0.16, 'triangle', 0.14), i * 55)); }
  private chime(): void { this.tone(880, 0.18, 'sine', 0.14); this.tone(1320, 0.22, 'sine', 0.09); }
  private ding(): void { this.tone(1046, 0.1, 'sine', 0.16); }
  private fall(): void { this.tone(600, 0.5, 'sine', 0.18, 80); setTimeout(() => this.noise(0.12, 0.3, 300), 480); }
  private camp(): void { [392, 523, 659].forEach((f, i) => setTimeout(() => this.tone(f, 0.4, 'sine', 0.1), i * 70)); }
  private rumble(): void { this.noise(0.5, 0.24, 220, 'lowpass'); this.tone(60, 0.5, 'sine', 0.12); }
  private doom(): void { this.tone(110, 0.7, 'sawtooth', 0.16, 55); this.tone(116, 0.7, 'sawtooth', 0.12, 58); }
  private confirm(): void { this.tone(660, 0.08, 'square', 0.12); setTimeout(() => this.tone(990, 0.1, 'square', 0.12), 70); }
}
