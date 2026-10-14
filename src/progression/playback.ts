// Works out what a progression sounds like. Bars play in performance order,
// following repeats and endings; each chord is voiced close to the one before
// (as Chordex does, picking the inversion that moves the voices least), over
// a bass note.

import type { Cue, NoteEvent, Performance } from '../notation/playback';
import type { Bar, Progression, Sound } from './parse';

// The bars in the order they are played, as indexes into all bars in written
// order. `|:` and `:|` repeat (twice, or `:|xN` times); a 1st/2nd ending is
// played on that pass, and the last ending on every later pass.
export function playOrder(bars: Bar[]): number[] {
  const order: number[] = [];
  let sectionStart = 0;
  let pass = 1;
  let i = 0;
  while (i < bars.length && order.length < 2000) {
    const bar = bars[i];
    if (bar.left === 'repeatBegin' && pass === 1) sectionStart = i;

    if (bar.endingStart && bar.ending !== undefined) {
      // Skip the bars of an ending that isn't this pass's.
      let last = bar.ending;
      for (let j = i; j < bars.length && bars[j].ending !== undefined; j++) last = Math.max(last, bars[j].ending!);
      if (bar.ending !== Math.min(pass, last)) {
        const n = bar.ending;
        i++;
        while (i < bars.length && bars[i].ending === n && !bars[i].endingStart) i++;
        continue;
      }
    }

    order.push(i);
    if (bar.right === 'repeatEnd') {
      if (pass < (bar.repeatCount ?? 2)) {
        pass++;
        i = sectionStart;
        continue;
      }
      pass = 1;
      sectionStart = i + 1;
    } else if (bar.ending !== undefined && bars[i + 1]?.ending === undefined) {
      // Out of the last ending: the repeat is done.
      pass = 1;
      sectionStart = i + 1;
    }
    i++;
  }
  return order;
}

const BASS_LOW = 40; // E2
const VOICE_LOW = 52; // E3: the lowest upper voice
const VOICE_HIGH = 76; // E5: the highest upper voice
const CENTRE = 64;

// Every inversion of a chord in close position, at every octave that fits.
function voicings(sound: Sound): number[][] {
  const pcs = [...new Set(sound.tones.map((t) => (sound.root + t) % 12))];
  const out: number[][] = [];
  for (let k = 0; k < pcs.length; k++) {
    const order = [...pcs.slice(k), ...pcs.slice(0, k)];
    const close: number[] = [];
    for (const pc of order) {
      let n = close.length ? close[close.length - 1] + 1 : pc;
      while (n % 12 !== pc) n++;
      close.push(n);
    }
    for (let shift = -24; shift <= 96; shift += 12) {
      const v = close.map((n) => n + shift);
      if (v[0] >= VOICE_LOW && v[v.length - 1] <= VOICE_HIGH) out.push(v);
    }
  }
  return out;
}

// How far the voices move, both ways, plus a pull towards the middle so the
// voicing doesn't drift up or down over a long progression.
function cost(next: number[], prev: number[]): number {
  const near = (n: number, set: number[]) => Math.min(...set.map((m) => Math.abs(n - m)));
  const moves = next.reduce((s, n) => s + near(n, prev), 0) + prev.reduce((s, n) => s + near(n, next), 0);
  const mean = next.reduce((s, n) => s + n, 0) / next.length;
  return moves + Math.abs(mean - CENTRE) * 0.5;
}

function voice(sound: Sound, prev: number[] | null): number[] {
  const options = voicings(sound);
  if (!options.length) return sound.tones.map((t) => 60 + sound.root + t);
  if (!prev) {
    // Root position, root nearest middle C.
    const roots = options.filter((v) => v[0] % 12 === sound.root);
    return roots.reduce((best, v) => (Math.abs(v[0] - 60) < Math.abs(best[0] - 60) ? v : best));
  }
  return options.reduce((best, v) => (cost(v, prev) < cost(best, prev) ? v : best));
}

// Cues mark each bar as it starts: the id is its index in written order.
export function performProgression(p: Progression): Performance {
  const bars = p.rows.flatMap((r) => r.bars);
  const barSeconds = (p.barQuarters * 60) / p.tempo;
  const events: NoteEvent[] = [];
  const cues: Cue[] = [];
  let held: NoteEvent[] = []; // the chord sounding now, which `/` keeps going
  let voicing: number[] | null = null;
  let t = 0;

  for (const index of playOrder(bars)) {
    const bar = bars[index];
    cues.push({ start: t, id: index });
    const total = bar.slots.reduce((n, s) => n + s.span, 0) || 1;
    for (const slot of bar.slots) {
      const length = (barSeconds * slot.span) / total;
      if (slot.kind === 'hold') {
        for (const e of held) e.duration += length;
      } else if (slot.kind === 'nc' || !slot.sound) {
        held = [];
      } else {
        voicing = voice(slot.sound, voicing);
        let bass = BASS_LOW + ((slot.sound.bass - BASS_LOW) % 12 + 12) % 12;
        if (bass >= voicing[0]) bass -= 12;
        held = [{ start: t, duration: length, midi: [bass] }, { start: t, duration: length, midi: voicing }];
        events.push(...held);
      }
      t += length;
    }
    if (!bar.slots.length) {
      for (const e of held) e.duration += barSeconds;
      t += barSeconds;
    }
  }
  return { events, length: t, cues };
}
