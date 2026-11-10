import { SoundCategory } from '../world/blocks';

export class SoundManager {
  private ctx: AudioContext | null = null;
  public masterVolume = 0.8;
  public sfxVolume = 0.85;
  public muted = false;
  private ambientInterval: number | null = null;

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;

    if (!this.ctx) {
      try {
        this.ctx = new AudioCtx();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private getEffectiveGain(base: number): number {
    if (this.muted) return 0;
    return Math.max(0, Math.min(1, base * this.masterVolume * this.sfxVolume));
  }

  public startAmbientLoop(): void {
    if (this.ambientInterval !== null || typeof window === 'undefined') return;
    this.ambientInterval = window.setInterval(() => {
      if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
      if (Math.random() < 0.45) {
        this.playAmbientBreeze();
      }
    }, 5500);
  }

  private playAmbientBreeze(): void {
    const ctx = this.ensureContext();
    const gainVal = this.getEffectiveGain(0.04);
    if (!ctx || gainVal <= 0.001) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    const baseFreq = 380 + Math.random() * 240;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.25, now + 0.18);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.9, now + 0.42);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(gainVal, now + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.46);
  }

  public playFootstep(category: SoundCategory): void {
    const ctx = this.ensureContext();
    const gainVal = this.getEffectiveGain(0.12);
    if (!ctx || gainVal <= 0.001) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    const freqMap: Record<SoundCategory, number> = {
      grass: 135,
      sand: 160,
      wood: 185,
      stone: 230,
      glass: 420,
      water: 280,
    };

    const baseFreq = (freqMap[category] ?? 150) * (0.92 + Math.random() * 0.16);
    osc.type = category === 'stone' || category === 'wood' ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.45, now + 0.075);

    gain.gain.setValueAtTime(gainVal, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.085);
  }

  public playJump(): void {
    const ctx = this.ensureContext();
    const gainVal = this.getEffectiveGain(0.14);
    if (!ctx || gainVal <= 0.001) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(170, now);
    osc.frequency.exponentialRampToValueAtTime(310, now + 0.11);

    gain.gain.setValueAtTime(gainVal, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  public playMineHit(category: SoundCategory): void {
    const ctx = this.ensureContext();
    const gainVal = this.getEffectiveGain(0.14);
    if (!ctx || gainVal <= 0.001) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = category === 'stone' ? 'square' : 'triangle';
    const base = category === 'stone' ? 320 : category === 'wood' ? 210 : 170;
    osc.frequency.setValueAtTime(base * (0.95 + Math.random() * 0.12), now);
    osc.frequency.exponentialRampToValueAtTime(base * 0.5, now + 0.06);

    gain.gain.setValueAtTime(gainVal, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  public playBlockBreak(category: SoundCategory): void {
    const ctx = this.ensureContext();
    const gainVal = this.getEffectiveGain(0.24);
    if (!ctx || gainVal <= 0.001) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = category === 'glass' ? 'sine' : 'sawtooth';
    const startFreq = category === 'glass' ? 680 : category === 'stone' ? 260 : 190;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(65, now + 0.16);

    gain.gain.setValueAtTime(gainVal, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.17);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);
  }

  public playBlockPlace(category: SoundCategory): void {
    const ctx = this.ensureContext();
    const gainVal = this.getEffectiveGain(0.2);
    if (!ctx || gainVal <= 0.001) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const base = category === 'stone' ? 240 : category === 'wood' ? 195 : 165;
    osc.frequency.setValueAtTime(base * 0.85, now);
    osc.frequency.exponentialRampToValueAtTime(base * 1.18, now + 0.09);

    gain.gain.setValueAtTime(gainVal, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  public playItemPickup(): void {
    const ctx = this.ensureContext();
    const gainVal = this.getEffectiveGain(0.18);
    if (!ctx || gainVal <= 0.001) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(780, now + 0.08);

    gain.gain.setValueAtTime(gainVal, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.095);
  }

  public playCraftSuccess(): void {
    const ctx = this.ensureContext();
    const gainVal = this.getEffectiveGain(0.22);
    if (!ctx || gainVal <= 0.001) return;

    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const t = now + idx * 0.055;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(gainVal, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.15);
    });
  }

  public playUIClick(): void {
    const ctx = this.ensureContext();
    const gainVal = this.getEffectiveGain(0.14);
    if (!ctx || gainVal <= 0.001) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(620, now);
    osc.frequency.exponentialRampToValueAtTime(480, now + 0.04);

    gain.gain.setValueAtTime(gainVal, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  public playHurt(): void {
    const ctx = this.ensureContext();
    const gainVal = this.getEffectiveGain(0.26);
    if (!ctx || gainVal <= 0.001) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(75, now + 0.18);

    gain.gain.setValueAtTime(gainVal, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  }
}
