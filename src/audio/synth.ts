// A small Web Audio synth that plays timed notes. Everything is scheduled up
// front, which is fine for snippet-sized pieces.

import type { Performance } from '../notation/playback';

const PEAK = 0.18;
const ATTACK = 0.01;
const RELEASE = 0.06;

export class Player {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private oscillators: OscillatorNode[] = [];
  private timer: number | undefined;
  private cueTimers: number[] = [];
  // Called when playback ends by itself or is stopped.
  onStop: (() => void) | null = null;
  // Called as each of the performance's cues comes up.
  onCue: ((id: number) => void) | null = null;

  get playing(): boolean {
    return this.out !== null;
  }

  // Must be called from a user gesture the first time, for the AudioContext.
  play({ events, length, cues = [] }: Performance): void {
    this.stop();
    this.ctx ??= new AudioContext();
    const ctx = this.ctx;
    void ctx.resume();

    // A compressor keeps chords from clipping.
    const compressor = ctx.createDynamicsCompressor();
    compressor.connect(ctx.destination);
    const out = ctx.createGain();
    out.connect(compressor);
    this.out = out;

    const t0 = ctx.currentTime + 0.05;
    for (const e of events) {
      for (const midi of e.midi) this.tone(ctx, out, midi, t0 + e.start, e.duration);
    }
    // Timers for cues, lined up with the audio clock's start.
    const lead = (t0 - ctx.currentTime) * 1000;
    this.cueTimers = cues.map((c) => window.setTimeout(() => this.onCue?.(c.id), lead + c.start * 1000));
    this.timer = window.setTimeout(() => this.stop(), (length + RELEASE) * 1000 + 100);
  }

  stop(): void {
    window.clearTimeout(this.timer);
    this.cueTimers.forEach((t) => window.clearTimeout(t));
    this.cueTimers = [];
    if (!this.out) return;
    for (const o of this.oscillators) {
      try {
        o.stop();
      } catch {
        // Not started yet.
      }
    }
    this.oscillators = [];
    this.out.disconnect();
    this.out = null;
    this.onStop?.();
  }

  // A plucked-sounding note: quick attack, decay to a sustain, short release.
  private tone(ctx: AudioContext, out: AudioNode, midi: number, start: number, duration: number) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 440 * 2 ** ((midi - 69) / 12);
    const gain = ctx.createGain();
    const end = start + Math.max(duration - 0.02, ATTACK * 2);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(PEAK, start + ATTACK);
    gain.gain.setTargetAtTime(PEAK * 0.4, start + ATTACK, 0.15);
    gain.gain.setTargetAtTime(0, end, RELEASE / 3);
    osc.connect(gain).connect(out);
    osc.start(start);
    osc.stop(end + RELEASE);
    osc.onended = () => gain.disconnect();
    this.oscillators.push(osc);
  }
}
