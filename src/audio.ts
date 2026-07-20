// Procedural sound effects + a subtle ambient drone, all synthesized via Web
// Audio — no external audio files, so no asset/licensing surface at all.
// The AudioContext is created lazily in resume(), which must be called from
// a real user-gesture handler (browsers block audio before one) — see
// main.ts's startBtn click, the same gesture already used for
// requestFullscreenFromGesture.
const MUTE_KEY = 'undral.muted.v1';
const VOLUME_KEY = 'undral.volume.v1';

function loadMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function saveMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/** persisted 0..1 master volume multiplier (default full) */
function loadVolume(): number {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    if (raw === null) return 1;
    const value = Number(raw);
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
  } catch {
    return 1;
  }
}

function saveVolume(volume: number): void {
  try {
    localStorage.setItem(VOLUME_KEY, String(volume));
  } catch {
    /* ignore */
  }
}

const AMBIENT_GAIN = 0.05;
const MASTER_GAIN = 0.35;

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = loadMuted();
  private volume = loadVolume();

  get isMuted(): boolean {
    return this.muted;
  }

  /** current master volume as a 0..1 multiplier (independent of mute). */
  get masterVolume(): number {
    return this.volume;
  }

  /** the effective master gain, honouring both mute and the volume slider. */
  private targetGain(): number {
    return this.muted ? 0 : MASTER_GAIN * this.volume;
  }

  /** must be called from a real user-gesture handler */
  resume(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.targetGain();
      this.master.connect(this.ctx.destination);
      this.startAmbient();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    saveMuted(muted);
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(this.targetGain(), this.ctx.currentTime, 0.05);
    }
  }

  /** set the 0..1 master volume multiplier; does not change the mute flag. */
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    saveVolume(this.volume);
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(this.targetGain(), this.ctx.currentTime, 0.05);
    }
  }

  private blip(freq: number, duration: number, type: OscillatorType, gainPeak = 0.5, freqEnd?: number): void {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + duration);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(gainPeak, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  playSwing(): void {
    this.blip(520, 0.09, 'triangle', 0.18, 260);
  }
  playHit(): void {
    this.blip(160, 0.08, 'square', 0.22, 60);
  }
  playPickup(): void {
    this.blip(660, 0.12, 'sine', 0.2, 1100);
  }
  playLevelUp(): void {
    // a quick ascending three-note flourish
    [523, 659, 784].forEach((f, i) => setTimeout(() => this.blip(f, 0.18, 'triangle', 0.25), i * 90));
  }
  playChest(): void {
    this.blip(220, 0.2, 'sawtooth', 0.18, 440);
  }
  playDeath(): void {
    this.blip(180, 0.6, 'sawtooth', 0.25, 40);
  }
  playBuy(): void {
    this.blip(880, 0.1, 'square', 0.15, 660);
  }

  private startAmbient(): void {
    if (!this.ctx || !this.master) return;
    const gain = this.ctx.createGain();
    gain.gain.value = AMBIENT_GAIN;
    const osc1 = this.ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = 82; // low drone
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = 82 * 1.5; // a soft fifth above
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.07; // slow swell, not a beat
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.master);
    osc1.start();
    osc2.start();
    lfo.start();
  }
}
