import { describe, expect, it } from 'vitest';
import { Dawg, Lexicon, LEXICON_ALPHABET, buildDawg, encodeLexiconEntry } from '../src';

const WORDS = ['MANGE', 'MANGER', 'MANGES', 'RANGE', 'RANGER', 'RANGES', 'ZOO', 'A'];

describe('DAWG', () => {
  const dawg = buildDawg(WORDS);

  it('contains exactly the given words', () => {
    for (const w of WORDS) expect(dawg.has(w)).toBe(true);
    for (const w of ['MANG', 'MANGERS', 'RAN', 'ZO', '', 'B']) expect(dawg.has(w)).toBe(false);
    expect([...dawg.words()].sort()).toEqual([...WORDS].sort());
  });

  it('merges common endings', () => {
    // A trie would need one edge per letter of every distinct path. In the DAWG,
    // "ANGE(R|S)" is shared by MANGE and RANGE.
    const trieEdges = new Set(WORDS.flatMap((w) => [...w].map((_, i) => w.slice(0, i + 1)))).size;
    expect(dawg.size - 1).toBeLessThan(trieEdges);
  });

  it('lists the possible next letters of a prefix', () => {
    const edge = dawg.walk('MANGE');
    expect(edge?.isFinal).toBe(true);
    expect([...dawg.edgesOf(edge!.target)].map((e) => e.symbol)).toEqual(['R', 'S']);
  });

  it('survives a round trip through bytes', () => {
    const copy = Dawg.fromBytes(dawg.toBytes());
    expect([...copy.words()]).toEqual([...dawg.words()]);
    expect(copy.alphabet).toBe(dawg.alphabet);
  });

  it('handles an empty word list', () => {
    const empty = buildDawg([]);
    expect(empty.has('A')).toBe(false);
    expect([...empty.words()]).toEqual([]);
  });

  it('rejects symbols outside the alphabet', () => {
    expect(() => buildDawg(['ABC'], 'AB')).toThrow();
  });
});

describe('lexicon', () => {
  it('encodes the lemma as a rule relative to the form', () => {
    expect(encodeLexiconEntry('mangeaient', 'manger')).toBe('mangeaient=5r');
    expect(encodeLexiconEntry('été', 'être')).toBe('été=3être');
    expect(encodeLexiconEntry('chat', 'chat')).toBe('chat=0');
  });

  it('finds accented spellings and lemmas from a board word', () => {
    const entries = [
      ['été', 'été'],
      ['été', 'être'],
      ['ete', 'ete'],
      ['mangeaient', 'manger'],
      ['cœur', 'cœur'],
    ].map(([form, lemma]) => encodeLexiconEntry(form!, lemma!));
    const lexicon = new Lexicon(buildDawg(entries, LEXICON_ALPHABET));

    expect(lexicon.lookup('ETE')).toEqual([
      { form: 'ete', lemmas: ['ete'] },
      { form: 'été', lemmas: ['été', 'être'] },
    ]);
    expect(lexicon.lookup('MANGEAIENT')).toEqual([{ form: 'mangeaient', lemmas: ['manger'] }]);
    expect(lexicon.lookup('COEUR')).toEqual([{ form: 'cœur', lemmas: ['cœur'] }]);
    expect(lexicon.lookup('MANGE')).toEqual([]);
  });
});
