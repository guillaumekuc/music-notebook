import type { SnippetType } from './storage/types';

export interface Example {
  name: string;
  type?: SnippetType;
  code: string;
}

export const EXAMPLES: Example[] = [
  {
    name: 'README example',
    code: `fretboard
show frets=3,4,5 string=1
show frets=3,4,5 string=2 color=red
show fret=3 string=6 text=G
show notes=10/1,10/2,9/3,9/4`,
  },
  {
    name: 'C major chord',
    code: `# Open C major: x32010
option frets=5
option width=400
option height=140
show notes=0/3,0/1 color=#666 fill-color=white
show note=3/5 text=3
show note=2/4 text=2
show note=1/2 text=1`,
  },
  {
    name: 'A minor pentatonic',
    code: `# Box 1 at the 5th fret, roots highlighted
option start=4
option frets=9
option width=500
show frets=5,8 strings=6,2,1
show frets=5,7 strings=5,4,3
show notes=5/6,7/4,5/1 text=A fill-color=#c0392b`,
  },
  {
    name: 'Colors and labels',
    code: `show frets=3,5,7 strings=6,5 color=red
show fret=4 string=1 text=G#
show fret=5 string=1 text=A color=#666 fill-color=white
show fret=6 string=1 text=Bb fill-color=#afa color=black
show frets=4,5,7 strings=4,3 color=blue fill-color=white`,
  },
  {
    name: 'Start fret with label',
    code: `option start=5
option frets=10
option width=400
option start-text=5th Fret
show frets=5,7,9 strings=6,5 color=red
show fret=7 string=1 text=G`,
  },
  {
    name: '4-string bass',
    code: `option strings=4
option frets=12
option height=120
# E major scale, first position
show notes=0/4,2/4,4/4,0/3,2/3,4/3,1/2,2/2 color=#2c6fbb
show note=0/4 text=E fill-color=#c0392b`,
  },
  {
    name: '7-string, full neck',
    code: `option strings=7
option frets=24
option width=900
option height=170`,
  },
  {
    name: 'Notation: melody in G',
    type: 'notation',
    code: `# Notes are written as they sound; the key decides the accidentals.
clef treble
key G
time 4/4
voice G4/q, A4, B4, C5 | D5/8, E5, F#5, G5, D5/h | (G4 B4 D5)/1`,
  },
  {
    name: 'Notation: two voices',
    type: 'notation',
    code: `clef treble
time 3/4
voice E5/q, D5, C5 | B4/h. | C5/8, D5, E5/q, C5 | A4/h.
voice C4/h, E4/q | G3/h. | A3/h, A3/q | A3/h.`,
  },
  {
    name: 'Notation: lead sheet',
    type: 'notation',
    code: `tempo "Moderato" q=96
key F
time 3/4
voice "F"C5/q, A4, F4 | "C7"G4/h, C4/q | "F"F4/h.~ | F4/h. |]
lyrics Hap- py birth- day`,
  },
  {
    name: 'Notation: guitar tab',
    type: 'notation',
    code: `# Tab with the notes worked out in notation above it
time 4/4
staff tab notation
voice 0/6/8, 2/6, 3/5, 0/4, 2/4h, 4/4, 2/3, 0/2 | (0/1 1/2 0/3 2/4 3/5)/h, 7/3/q b, 5/2 v |]`,
  },
  {
    name: 'Notation: piano',
    type: 'notation',
    code: `key G
time 4/4
staff treble
voice !p! (G4/q, A4, B4, C5 | D5/h), @G5/h |]
staff bass
voice (G2 D3)/1 | (G2 D3 G3)/1 |]`,
  },
  {
    name: 'Notation: chromatic staff',
    type: 'notation',
    code: `# MIDI numbers, 60 = C4. Even notes sit on lines (solid), odd ones in
# spaces (hollow); every C is a bold line. Half notes have a double stem.
time 4/4
staff chromatic range=4-5
voice 60/8, 62, 64, 65, 67, 69, 71, 72 | (60 64 67)/h, (62 65 69)/q, r | 72/q., 71/8, 69/q, 67 | 64/h, 60 | 60/1 |]`,
  },
  {
    name: 'Progression: chord symbols',
    type: 'progression',
    code: `# Chord symbols; each cell also shows the relationship from the chord before.
| Dm7 | G7 | Cmaj7 | % |
| Em7  A7 | Dm7  G7 | C6 / / G7 | C |]`,
  },
  {
    name: 'Progression: relationships only',
    type: 'progression',
    code: `# No root: only the relationships show. Add a line like "root A" to name the chords.
| I.m | bVII.M | bVI.M | V.M(b7) :|`,
  },
  {
    name: 'Progression: mixed, with sections',
    type: 'progression',
    code: `# Symbols and relationships can be mixed; the other one is worked out.
root A
section A
|: I.m(b7) | bIII.M | bVII.M | IV.M(b7) |
| Am  G | F  E7 |[1 Am | E7 :|[2 Am | % ||
section B
| Dm | V.M(b7) | Cmaj7 | bII.M |
| Bm7b5 | E7 | N.C. | E7 :|x2`,
  },
  {
    name: 'Notation: bass line',
    type: 'notation',
    code: `clef bass
key F
time 4/4
voice F2/q, A2, C3, A2 | Bb2/q, D3, F3, D3 | C3/q, E3, G3, B2 | F2/1`,
  },
];
