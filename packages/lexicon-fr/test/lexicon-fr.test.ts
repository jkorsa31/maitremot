import { describe, expect, it } from 'vitest';
import { getLexicon, getWords } from '../src';
import { decodeBase64 } from '../src/base64';

describe('base64', () => {
  it('decodes with and without padding', () => {
    expect([...decodeBase64('TWFu')]).toEqual([77, 97, 110]);
    expect([...decodeBase64('TWE=')]).toEqual([77, 97]);
    expect([...decodeBase64('TQ==')]).toEqual([77]);
  });
});

describe('French board words', () => {
  const words = getWords();

  it.each([
    'MANGER',
    'MANGEAIENT', // conjugated forms
    'CHEVAUX', // irregular plurals
    'BELLES', // feminine plural
    'ETE', // accents removed
    'COEUR', // ligature œ → OE
    'QI', // short words
    'ZYTHUM',
    'KILOMETRES', // prefixed forms
    'KA', // house words (packages/lexicon-fr/house-words.txt)
    'KAT',
    'SKYR',
  ])('accepts %s', (word) => expect(words.has(word)).toBe(true));

  it.each([
    'FRANCE',
    'SNCF',
    'AUJOURDHUI',
    'PORTEMONNAIE',
    'A',
    'MANGERONSS',
    'MLX',
    'KCAL',
    'JUSQU',
  ])(
    'rejects %s (proper noun, acronym, apostrophe, hyphen, single letter, typo, unit symbol, elision)',
    (word) => expect(words.has(word)).toBe(false),
  );
});

describe('French lexicon', () => {
  const lexicon = getLexicon();

  it('finds the accented spelling and the lemmas', () => {
    expect(lexicon.lookup('ETE')).toEqual([{ form: 'été', lemmas: ['été', 'être'] }]);
    expect(lexicon.lookup('MANGEAIENT')).toEqual([{ form: 'mangeaient', lemmas: ['manger'] }]);
    expect(lexicon.lookup('COEUR')).toEqual([{ form: 'cœur', lemmas: ['cœur'] }]);
  });

  it('returns every spelling of an ambiguous board word', () => {
    const forms = lexicon.lookup('LES').map((e) => e.form);
    expect(forms).toEqual(expect.arrayContaining(['les', 'lés', 'lès']));
  });
});
