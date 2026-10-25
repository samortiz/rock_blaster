// Procedural swing jazz: walking bass, Rhodes comping, ride cymbal and brushes, and a
// vibraphone that alternates between a written head and improvised choruses over a
// 16-bar I-VI-ii-V form in C. Bars are scheduled slightly ahead of the audio clock.

const BPM = 138;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const SWING = 2 / 3; // swung eighths: the offbeat lands two-thirds of the way through the beat
const LOOKAHEAD = 0.4; // seconds of music scheduled ahead of the audio clock
const VOLUME = 0.28;

interface Chord {
  root: number; // pitch class
  tones: number[]; // intervals above the root: 1, 3, 5, 7
  voicing: number[]; // rootless piano voicing, MIDI notes
  scale: number[]; // pitch classes the soloist may use
}

const C_MAJOR = [0, 2, 4, 5, 7, 9, 11];
const CM7: Chord = { root: 0, tones: [0, 4, 7, 11], voicing: [59, 62, 64, 67], scale: C_MAJOR };
const C6: Chord = { root: 0, tones: [0, 4, 7, 9], voicing: [57, 62, 64, 67], scale: C_MAJOR };
const A7: Chord = { root: 9, tones: [0, 4, 7, 10], voicing: [61, 66, 67, 71], scale: [9, 10, 1, 2, 4, 6, 7] };
const DM7: Chord = { root: 2, tones: [0, 3, 7, 10], voicing: [60, 64, 65, 69], scale: C_MAJOR };
const G7: Chord = { root: 7, tones: [0, 4, 7, 10], voicing: [59, 64, 65, 69], scale: C_MAJOR };
const EM7: Chord = { root: 4, tones: [0, 3, 7, 10], voicing: [62, 66, 67, 71], scale: [4, 6, 7, 9, 11, 1, 2] };

const FORM: Chord[][] = [
  [CM7], [A7], [DM7], [G7], [EM7], [A7], [DM7], [G7],
  [CM7], [A7], [DM7], [G7], [EM7, A7], [DM7, G7], [C6], [DM7, G7],
];

// The head: one list per bar of [MIDI note or null for a rest, length in eighths].
const HEAD: [number | null, number][][] = [
  [[null, 2], [76, 1], [79, 1], [83, 3], [81, 1]],
  [[79, 2], [76, 1], [73, 1], [76, 4]],
  [[77, 1], [81, 1], [84, 2], [81, 1], [77, 1], [74, 2]],
  [[71, 1], [74, 1], [77, 1], [81, 1], [80, 2], [79, 2]],
  [[null, 1], [79, 1], [83, 1], [86, 1], [83, 2], [79, 2]],
  [[85, 3], [82, 1], [81, 2], [79, 2]],
  [[77, 2], [76, 1], [74, 1], [72, 2], [69, 2]],
  [[71, 4], [null, 4]],
  [[null, 2], [76, 1], [79, 1], [83, 3], [81, 1]],
  [[79, 2], [76, 1], [73, 1], [76, 4]],
  [[77, 1], [81, 1], [84, 2], [81, 1], [77, 1], [74, 2]],
  [[71, 1], [74, 1], [77, 1], [81, 1], [80, 2], [79, 2]],
  [[76, 1], [79, 1], [83, 2], [85, 1], [82, 1], [81, 2]],
  [[77, 1], [81, 1], [84, 2], [83, 1], [81, 1], [77, 1], [74, 1]],
  [[76, 6], [null, 2]],
  [[null, 8]],
];

// Piano comping rhythms as [start, length] in eighths, for a whole bar or half a bar.
const COMP_BAR: [number, number][][] = [
  [[0, 3], [3, 2]], // Charleston
  [[1, 2], [5, 2]],
  [[2, 1], [5, 3]],
  [[0, 2], [6, 2]],
  [[3, 2], [7, 1]],
  [],
];
const COMP_HALF: [number, number][][] = [[[0, 2]], [[1, 2]], [[0, 1], [3, 1]], [[1, 1]]];

const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
const pc = (n: number) => ((n % 12) + 12) % 12;

export class Jazz {
  private bus: GainNode | null = null;
  private vibesBus!: GainNode;
  private tremolo: OscillatorNode | null = null;
  private reverb: ConvolverNode;
  private timer = 0;
  private nextBar = 0;
  private bar = 0;
  private bassNote = 43;
  private vibeNote = 76;
  private vibeDir = 1;

  constructor(
    private ctx: AudioContext,
    private out: AudioNode,
    private noise: AudioBuffer,
  ) {
    // Small-room reverb from a decaying stereo noise impulse.
    const len = Math.floor(ctx.sampleRate * 1.8);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    this.reverb.connect(wet).connect(out);
  }

  get playing() {
    return this.bus !== null;
  }

  start() {
    if (this.bus) return;
    const ctx = this.ctx;
    // Each run gets its own bus so notes still queued from a previous run stay silent.
    this.bus = ctx.createGain();
    this.bus.gain.setValueAtTime(0, ctx.currentTime);
    this.bus.gain.setTargetAtTime(VOLUME, ctx.currentTime, 0.3);
    this.bus.connect(this.out);
    this.bus.connect(this.reverb);
    this.vibesBus = ctx.createGain();
    this.vibesBus.gain.value = 1;
    this.tremolo = ctx.createOscillator();
    this.tremolo.frequency.value = 5.5;
    const depth = ctx.createGain();
    depth.gain.value = 0.3;
    this.tremolo.connect(depth).connect(this.vibesBus.gain);
    this.tremolo.start();
    this.vibesBus.connect(this.bus);

    this.bar = 0;
    this.nextBar = ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.tick(), 50);
    this.tick();
  }

  stop() {
    const bus = this.bus;
    if (!bus) return;
    const t = this.ctx.currentTime;
    clearInterval(this.timer);
    bus.gain.cancelScheduledValues(t);
    bus.gain.setTargetAtTime(0, t, 0.08);
    this.tremolo?.stop(t + 3);
    setTimeout(() => bus.disconnect(), 3000);
    this.bus = null;
  }

  private tick() {
    const now = this.ctx.currentTime;
    if (this.nextBar < now) this.nextBar = now + 0.05; // timer was throttled; don't cram missed bars
    while (this.nextBar < now + LOOKAHEAD) {
      this.scheduleBar(this.nextBar);
      this.nextBar += BAR;
      this.bar++;
    }
  }

  /** Time of eighth-note `e` (0-8) within the bar starting at t, with swing. */
  private at(t: number, e: number) {
    return t + Math.floor(e / 2) * BEAT + (e % 2) * BEAT * SWING;
  }

  private scheduleBar(t: number) {
    const i = this.bar % FORM.length;
    const chords = FORM[i];
    const next = FORM[(i + 1) % FORM.length][0];
    const chorus = Math.floor(this.bar / FORM.length);

    this.walk(t, chords, next.root);
    this.comp(t, chords);
    this.drums(t, i === FORM.length - 1);
    if (chorus % 2 === 0) this.playHead(t, i);
    else this.improvise(t, chords);
  }

  // ------------------------------------------------------------------ parts

  private walk(t: number, chords: Chord[], nextRoot: number) {
    const per = 4 / chords.length;
    chords.forEach((ch, ci) => {
      const target = ci + 1 < chords.length ? chords[ci + 1].root : nextRoot;
      for (let b = 0; b < per; b++) {
        let n: number;
        if (b === 0) n = this.nearBass(ch.root);
        else if (b === per - 1) n = this.nearBass(target) + (Math.random() < 0.5 ? 1 : -1); // chromatic approach
        else n = this.nearBass(ch.root + pick([ch.tones[1], ch.tones[2], ch.tones[2], ch.tones[3]]));
        this.bassNote = n;
        const beat = t + (ci * per + b) * BEAT;
        this.bass(beat, n, BEAT * 0.9);
        // Now and then a ghosted triplet pickup into the next beat.
        if (b === per - 1 && Math.random() < 0.15) this.bass(beat + BEAT * SWING, n, BEAT * 0.3, 0.5);
      }
    });
  }

  /** The note with pitch class p closest to the previous bass note, kept in range. */
  private nearBass(p: number) {
    let best = 0;
    for (let n = 36; n <= 52; n++) {
      if (pc(n) === pc(p) && (best === 0 || Math.abs(n - this.bassNote) < Math.abs(best - this.bassNote))) best = n;
    }
    return best;
  }

  private comp(t: number, chords: Chord[]) {
    const hits: [Chord, number, number][] = [];
    if (chords.length === 1) {
      for (const [s, d] of pick(COMP_BAR)) hits.push([chords[0], s, d]);
    } else {
      chords.forEach((ch, ci) => {
        for (const [s, d] of pick(COMP_HALF)) hits.push([ch, ci * 4 + s, d]);
      });
    }
    for (const [ch, s, d] of hits) {
      const start = this.at(t, s);
      const dur = this.at(t, s + d) - start;
      const accent = 0.8 + Math.random() * 0.4;
      ch.voicing.forEach((n, k) => this.keys(start + k * 0.007, n, dur * 0.85, 0.045 * accent));
    }
  }

  private drums(t: number, fill: boolean) {
    // Ride: ding, ding-da ding, ding-da.
    for (const [b, v] of [[0, 0.8], [1, 1], [1 + SWING, 0.6], [2, 0.8], [3, 1], [3 + SWING, 0.6]]) {
      if (fill && b > 3) continue;
      this.ride(t + b * BEAT, 0.06 * v);
    }
    this.hat(t + BEAT, 0.05);
    this.hat(t + 3 * BEAT, 0.05);
    for (let b = 0; b < 4; b++) this.kick(t + b * BEAT, 0.1); // feathered bass drum
    for (let e = 1; e < 8; e += 2) if (Math.random() < 0.2) this.snare(this.at(t, e), 0.025); // ghost notes
    if (fill) [0, 1 / 3, 2 / 3].forEach((f, k) => this.snare(t + (3 + f) * BEAT, 0.05 + k * 0.03));
  }

  private playHead(t: number, i: number) {
    let e = 0;
    for (const [n, d] of HEAD[i]) {
      if (n !== null) this.vibes(this.at(t, e), n, this.at(t, e + d) - this.at(t, e), 0.13);
      e += d;
    }
    this.vibeNote = 76;
  }

  private improvise(t: number, chords: Chord[]) {
    if (Math.random() < 0.3) return; // leave space
    let e = pick([0, 1, 1, 2]);
    const end = Math.min(8, e + 3 + Math.floor(Math.random() * 5));
    const span = 8 / chords.length;
    while (e < end) {
      const ch = chords[Math.floor(e / span)];
      const d = e + 1 >= end || Math.random() < 0.2 ? 2 : 1;
      const last = e + d >= end;
      const n = this.nextVibe(ch, e % 2 === 0 || last);
      this.vibes(this.at(t, e), n, this.at(t, e + d) - this.at(t, e), e % 2 === 0 ? 0.12 : 0.09);
      e += d;
    }
  }

  /** Step through the chord's scale; strong beats and phrase ends land on chord tones. */
  private nextVibe(ch: Chord, chordTone: boolean) {
    const allowed = chordTone ? ch.tones.map((x) => pc(ch.root + x)) : ch.scale;
    const notes: number[] = [];
    for (let n = 67; n <= 88; n++) if (allowed.includes(pc(n))) notes.push(n);
    if (Math.random() < 0.25) this.vibeDir = -this.vibeDir;
    if (this.vibeNote > 84) this.vibeDir = -1;
    if (this.vibeNote < 70) this.vibeDir = 1;
    const steps = Math.random() < 0.7 ? 1 : 2;
    const ahead = notes.filter((n) => (this.vibeDir > 0 ? n > this.vibeNote : n < this.vibeNote));
    if (this.vibeDir < 0) ahead.reverse();
    this.vibeNote = ahead[Math.min(steps, ahead.length) - 1] ?? notes[Math.floor(notes.length / 2)];
    return this.vibeNote;
  }

  // ------------------------------------------------------------ instruments

  private env(t: number, peak: number, decay: number, release: number, tau: number) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.005);
    g.gain.setTargetAtTime(0, t + 0.005, decay);
    g.gain.setTargetAtTime(0, release, tau);
    return g;
  }

  /** Plucked upright-ish bass: a filtered sawtooth that's bright at the attack. */
  private bass(t: number, n: number, dur: number, vol = 1) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = mtof(n);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1200, t);
    lp.frequency.exponentialRampToValueAtTime(380, t + 0.2);
    const g = this.env(t, 0.22 * vol, 0.5, t + dur, 0.04);
    osc.connect(lp).connect(g).connect(this.bus!);
    osc.start(t);
    osc.stop(t + dur + 0.3);
  }

  /** Electric piano: a sine carrier with a decaying FM bark. */
  private keys(t: number, n: number, dur: number, vol: number) {
    const ctx = this.ctx;
    const f = mtof(n);
    const car = ctx.createOscillator();
    car.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.frequency.value = f;
    const idx = ctx.createGain();
    idx.gain.setValueAtTime(f * 1.4, t);
    idx.gain.setTargetAtTime(f * 0.15, t, 0.12);
    mod.connect(idx).connect(car.frequency);
    const g = this.env(t, vol, 0.7, t + dur, 0.06);
    car.connect(g).connect(this.bus!);
    car.start(t);
    mod.start(t);
    car.stop(t + dur + 0.4);
    mod.stop(t + dur + 0.4);
  }

  /** Vibraphone: fundamental plus a quickly fading fourth partial, through the tremolo bus. */
  private vibes(t: number, n: number, dur: number, vol: number) {
    const ctx = this.ctx;
    const f = mtof(n);
    const g = this.env(t, vol, 0.6, t + dur + 0.15, 0.12);
    g.connect(this.vibesBus);
    for (const [mult, v] of [[1, 1], [4, 0.3]]) {
      const osc = ctx.createOscillator();
      osc.frequency.value = f * mult;
      const pg = ctx.createGain();
      pg.gain.setValueAtTime(v, t);
      if (mult > 1) pg.gain.setTargetAtTime(0, t, 0.06);
      osc.connect(pg).connect(g);
      osc.start(t);
      osc.stop(t + dur + 0.8);
    }
  }

  private hit(t: number, vol: number, type: BiquadFilterType, freq: number, q: number, decay: number) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.setTargetAtTime(0, t, decay);
    src.connect(f).connect(g).connect(this.bus!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + decay * 8);
  }

  private ride(t: number, vol: number) {
    this.hit(t, vol, 'bandpass', 8500, 0.8, 0.12);
  }

  private hat(t: number, vol: number) {
    this.hit(t, vol, 'highpass', 7000, 0.7, 0.025);
  }

  private snare(t: number, vol: number) {
    this.hit(t, vol, 'bandpass', 1800, 0.7, 0.06);
  }

  private kick(t: number, vol: number) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.setTargetAtTime(0, t, 0.06);
    osc.connect(g).connect(this.bus!);
    osc.start(t);
    osc.stop(t + 0.5);
  }
}
