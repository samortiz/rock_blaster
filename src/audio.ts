// Synthesized sound effects and music via the Web Audio API — no audio files needed.
// The AudioContext can only start after a user gesture, so call unlock() from one.

import { Jazz } from './music';
import { VOLUME_STEPS } from './save';
import type { Channel } from './save';

type UfoSound = 'off' | 'big' | 'small';

export class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noise!: AudioBuffer;
  private thrustGain!: GainNode;
  private thrustOn = false;
  private ufoMode: UfoSound = 'off';
  private ufoNodes: { osc: OscillatorNode; lfo: OscillatorNode; gain: GainNode } | null = null;
  private jazz: Jazz | null = null;
  muted = false;
  private volumes: Record<Channel, number> = { master: VOLUME_STEPS, sfx: VOLUME_STEPS, music: VOLUME_STEPS };

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as any).webkitAudioContext;
      if (!AC) return;
      const ctx: AudioContext = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.gainOf('master');
      this.master.connect(ctx.destination);
      this.sfxBus = ctx.createGain();
      this.sfxBus.gain.value = this.gainOf('sfx');
      this.sfxBus.connect(this.master);
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = this.gainOf('music');
      this.musicBus.connect(this.master);

      this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

      // Thrust is a continuous filtered-noise rumble whose volume we fade in and out.
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 450;
      this.thrustGain = ctx.createGain();
      this.thrustGain.gain.value = 0;
      src.connect(lp).connect(this.thrustGain).connect(this.sfxBus);
      src.start();

      this.jazz = new Jazz(ctx, this.musicBus, this.noise);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    this.applyVolume('master');
  }

  /** Set a channel's level, 0..VOLUME_STEPS. Works before the audio is unlocked too. */
  setVolume(channel: Channel, level: number) {
    this.volumes[channel] = level;
    this.applyVolume(channel);
  }

  /** Levels map to gain on a square curve, which sounds more even than a linear one. */
  private gainOf(channel: Channel) {
    const g = (this.volumes[channel] / VOLUME_STEPS) ** 2;
    return channel === 'master' ? (this.muted ? 0 : 0.5 * g) : g;
  }

  private applyVolume(channel: Channel) {
    if (!this.ctx) return;
    const node = { master: this.master, sfx: this.sfxBus, music: this.musicBus }[channel];
    node.gain.setTargetAtTime(this.gainOf(channel), this.ctx.currentTime, 0.02);
  }

  /** Background music on or off. Does nothing until the audio is unlocked. */
  music(on: boolean) {
    if (!this.jazz || on === this.jazz.playing) return;
    if (on) this.jazz.start();
    else this.jazz.stop();
  }

  /** Freeze all audio while the app is in the background. */
  sleep() {
    if (this.ctx) void this.ctx.suspend();
  }

  wake() {
    if (this.ctx) void this.ctx.resume();
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private burst(dur: number, vol: number, f0: number, f1: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(f0, t);
    lp.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(lp).connect(gain).connect(this.sfxBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  shoot() {
    this.tone('square', 900, 180, 0.11, 0.09);
  }

  ufoShoot() {
    this.tone('sawtooth', 520, 260, 0.16, 0.07);
  }

  /** size: 1 (small) .. 3 (large), 4 for the ship */
  explode(size: number) {
    this.burst(0.2 + size * 0.22, 0.25 + size * 0.12, 2400 / size + 600, 80);
  }

  shieldHit() {
    this.tone('sine', 260, 900, 0.18, 0.18);
  }

  powerUp() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone('triangle', f, f * 1.01, 0.12, 0.15, i * 0.07));
  }

  extraLife() {
    [784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone('square', f, f, 0.09, 0.07, i * 0.09));
  }

  /** Shop purchase: a two-note coin chime. */
  buy() {
    this.tone('square', 988, 988, 0.08, 0.08);
    this.tone('square', 1319, 1319, 0.3, 0.08, 0.08);
  }

  /** Shop purchase refused (not enough coins or sold out). */
  denied() {
    this.tone('sawtooth', 180, 110, 0.2, 0.1);
  }

  /** Boss takes a bullet: a short metallic tick. */
  bossHit() {
    this.tone('square', 1400, 700, 0.05, 0.05);
  }

  /** Low warning horn as the boss arrives. */
  bossWarn() {
    [0, 0.45, 0.9].forEach((d) => this.tone('sawtooth', 110, 82, 0.38, 0.14, d));
  }

  thrust(on: boolean) {
    if (!this.ctx || on === this.thrustOn) return;
    this.thrustOn = on;
    this.thrustGain.gain.setTargetAtTime(on ? 0.35 : 0, this.ctx.currentTime, 0.04);
  }

  /** Warbling saucer siren that plays while a UFO is on screen. */
  ufo(mode: UfoSound) {
    const ctx = this.ctx;
    if (!ctx || mode === this.ufoMode) return;
    this.ufoMode = mode;
    if (this.ufoNodes) {
      const { osc, lfo, gain } = this.ufoNodes;
      gain.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
      osc.stop(ctx.currentTime + 0.2);
      lfo.stop(ctx.currentTime + 0.2);
      this.ufoNodes = null;
    }
    if (mode === 'off') return;
    const small = mode === 'small';
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = small ? 760 : 380;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = small ? 9 : 5;
    const depth = ctx.createGain();
    depth.gain.value = small ? 120 : 60;
    lfo.connect(depth).connect(osc.frequency);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(0.035, ctx.currentTime, 0.05);
    osc.connect(gain).connect(this.sfxBus);
    osc.start();
    lfo.start();
    this.ufoNodes = { osc, lfo, gain };
  }

  /** Silence continuous sounds (used when pausing or the game ends). */
  quiet() {
    this.thrust(false);
    this.ufo('off');
  }
}
