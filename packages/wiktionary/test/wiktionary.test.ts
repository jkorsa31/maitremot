import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cleanInline, fetchWikitexts, getDefinitions, parseWiktionaryPage } from '../src';

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`fixtures/${name}.wiki`, import.meta.url)), 'utf8');
const parse = (name: string) => parseWiktionaryPage(name, fixture(name));

describe('inline markup', () => {
  it.each([
    ['[[mammifère|Mammifère]] [[carnivore]]', 'Mammifère carnivore'],
    ["''Troisième personne de'' [[manger]].", 'Troisième personne de manger.'],
    ['{{figuré|fr}} Comprendre', '(Figuré) Comprendre'],
    ['{{lexique|mythologie égyptienne|fr}} Le [[double]]', '(Mythologie égyptienne) Le double'],
    ['{{lexique|chimie|physique|fr}} Corps', '(Chimie, Physique) Corps'],
    [
      '{{par extension}} {{familier|fr}} [[estomac|Estomac]].',
      '(Par extension) (Familier) Estomac.',
    ],
    ['lettre, {{lien|к|ru}}.', 'lettre, к.'],
    ["{{term|Construit avec ''à''}} Indique", '(Construit avec à) Indique'],
    ['Défini.<ref>Source</ref>', 'Défini.'],
    ['{{ébauche-déf|fr}}', ''],
    ['{{note}} Pour préciser', 'Note : Pour préciser'],
    ['[[observer|Observer]]; [[surveiller]].', 'Observer ; surveiller.'],
  ])('%s', (input, expected) => {
    expect(cleanInline(input)).toBe(expected);
  });
});

describe('page parsing (real Wiktionary pages)', () => {
  it('reads a simple noun (skyr)', () => {
    expect(parse('skyr')).toEqual({
      title: 'skyr',
      senses: [
        {
          partOfSpeech: 'Nom commun',
          isInflection: false,
          definitions: [{ text: 'Lait fermenté concentré produit en Islande.', level: 1 }],
        },
      ],
    });
  });

  it('reads an inflected form (mangeaient)', () => {
    expect(parse('mangeaient')?.senses).toEqual([
      {
        partOfSpeech: 'Verbe',
        isInflection: true,
        definitions: [
          {
            text: 'Troisième personne du pluriel de l’imparfait de l’indicatif de manger.',
            level: 1,
          },
        ],
      },
    ]);
  });

  it('keeps several parts of speech, without examples (été)', () => {
    const senses = parse('été')!.senses;
    expect(senses.map((s) => [s.partOfSpeech, s.isInflection])).toEqual([
      ['Nom commun', false],
      ['Verbe', true],
    ]);
    expect(senses[0]!.definitions[0]!.text).toMatch(/^La plus chaude des quatre saisons/);
    expect(senses[1]!.definitions).toEqual([
      { text: 'Participe passé du verbe être (utilisable comme verbe auxiliaire).', level: 1 },
    ]);
  });

  it('reads homonyms with labels (ka, chat, suivre)', () => {
    expect(parse('ka')!.senses.map((s) => s.definitions[0]!.text)).toEqual([
      'Autre appellation du kaon.',
      '(Mythologie égyptienne) Le double, une des parties de l’âme humaine.',
      'Douzième lettre de l’alphabet cyrillique, к.',
    ]);
    const chat = parse('chat')!.senses[0]!.definitions.map((d) => d.text);
    expect(chat[0]).toBe(
      '(Félins) Mammifère carnivore félin de taille moyenne, au museau court et arrondi, domestiqué, apprivoisé ou encore à l’état sauvage.',
    );
    expect(chat).toContain('(Yoga) Position de yoga à quatre pattes.');
    const suivre = parse('suivre')!.senses[0]!.definitions.map((d) => d.text);
    expect(suivre[0]).toBe('Aller ou venir après.');
    expect(suivre).not.toContain(''); // the {{ébauche-déf}} placeholder is dropped
  });

  it('returns null without a French section', () => {
    expect(parseWiktionaryPage('x', '== {{langue|en}} ==\n=== {{S|nom|en}} ===\n# A thing.')).toBe(
      null,
    );
  });
});

describe('fetching', () => {
  /** A fake `fetch` answering like the MediaWiki API. */
  const apiFetch = (body: unknown, calls: string[] = []) =>
    (async (url: string) => {
      calls.push(url);
      return { ok: true, status: 200, json: async () => body, text: async () => '' };
    }) as never;

  it('fetches several pages in one request and maps normalized titles back', async () => {
    const calls: string[] = [];
    const body = {
      query: {
        normalized: [{ from: 'été', to: 'Été' }],
        pages: [
          { title: 'Été', revisions: [{ slots: { main: { content: 'text été' } } }] },
          { title: 'skyr', revisions: [{ slots: { main: { content: 'text skyr' } } }] },
          { title: 'zzz', missing: true },
        ],
      },
    };
    const texts = await fetchWikitexts(['été', 'skyr', 'zzz', 'skyr'], {
      fetch: apiFetch(body, calls),
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('origin=*');
    expect(Object.fromEntries(texts)).toEqual({ été: 'text été', skyr: 'text skyr', zzz: null });
  });

  it('falls back to raw pages when asked to', async () => {
    const fetch = (async (url: string) =>
      url.includes('api.php')
        ? { ok: false, status: 429, json: async () => ({}), text: async () => '' }
        : url.includes('title=skyr')
          ? { ok: true, status: 200, json: async () => ({}), text: async () => fixture('skyr') }
          : { ok: false, status: 404, json: async () => ({}), text: async () => '' }) as never;
    await expect(fetchWikitexts(['skyr'], { fetch })).rejects.toThrow('429');
    const definitions = await getDefinitions(['skyr', 'zzz'], { fetch, rawFallback: true });
    expect(definitions.get('skyr')?.senses[0]?.partOfSpeech).toBe('Nom commun');
    expect(definitions.get('zzz')).toBe(null);
  });
});
