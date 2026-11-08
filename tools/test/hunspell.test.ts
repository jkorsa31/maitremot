import { describe, expect, it } from 'vitest';
import { expandEntry, parseAffixFile, parseFlags } from '../dictionary/hunspell';

// A tiny affix file in the style of Grammalecte's (FLAG long).
const AFF = `
FLAG long
NEEDAFFIX ()
CIRCUMFIX **
FORBIDDENWORD {}

SFX S. Y 2
SFX S. 0 0/L'D' [^sxz]
SFX S. 0 s [^sxz]

SFX a0 Y 3
SFX a0 er ons/X1 er
SFX a0 er e [^y]er
SFX a0 er é/S. er

SFX X1 Y 1
SFX X1 0 -nous .

PFX L' Y 1
PFX L' 0 l' [aeiou]

PFX Um Y 1
PFX Um 0 kilo/S. .
`;

const aff = parseAffixFile(AFF);
const skipElisions = (rule: { add: string }) => rule.add.includes("'");
const forms = (stem: string, flags: string) =>
  expandEntry(aff, stem, flags, skipElisions)
    .map((f) => `${f.form}<${f.lemma}`)
    .sort();

describe('hunspell expander', () => {
  it('splits long flags', () => {
    expect(parseFlags('S.a0')).toEqual(['S.', 'a0']);
  });

  it('adds plural suffixes', () => {
    expect(forms('chat', 'S.')).toEqual(['chat<chat', 'chat<chat', 'chats<chat']);
  });

  it('conjugates and chains suffixes (twofold)', () => {
    expect(forms('aimer', 'a0')).toEqual([
      'aime<aimer',
      'aimer<aimer',
      'aimons-nous<aimer',
      'aimons<aimer',
      'aimé<aimer',
      'aimé<aimer',
      'aimés<aimer',
    ]);
  });

  it('respects suffix conditions', () => {
    expect(forms('nez', 'S.')).toEqual(['nez<nez']);
  });

  it('applies prefixes, with the prefixed stem as lemma', () => {
    expect(forms('mètre', 'S.Um')).toEqual(
      expect.arrayContaining(['kilomètre<kilomètre', 'kilomètres<kilomètre']),
    );
  });

  it('skips elisions, forbidden words and stems needing an affix', () => {
    expect(forms('ami', 'L'.concat("'"))).toEqual(['ami<ami']);
    expect(forms('faux', '{}')).toEqual([]);
    expect(forms('aimer', '()a0')).not.toContain('aimer<aimer');
  });
});
