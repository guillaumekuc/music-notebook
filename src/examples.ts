export interface Example {
  name: string;
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
];
