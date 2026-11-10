/**
 * Turns the wikitext of a French Wiktionary page into a short, readable list
 * of definitions.
 *
 * A page looks like this (simplified):
 *
 *   == {{langue|fr}} ==                     ← French section (others are ignored)
 *   === {{S|étymologie}} ===                ← not a part of speech: skipped
 *   === {{S|nom|fr|num=1}} ===              ← part of speech ("S" + type + language)
 *   '''chat''' {{pron|ʃa|fr}} {{m}}
 *   # {{félins|fr}} [[mammifère|Mammifère]] carnivore…   ← a definition
 *   #* {{exemple|…}}                        ← example: skipped
 *   ## …                                    ← sub-definition
 *   === {{S|verbe|fr|flexion}} ===          ← inflected form ("is a form of…")
 *
 * Inside definitions, wiki markup is converted to plain text:
 * - links `[[target|text]]` → text, `[[word]]` → word;
 * - label templates `{{figuré|fr}}`, `{{lexique|cuisine|fr}}` → "(Figuré)", "(Cuisine)";
 * - `{{lien|к|ru}}` → к; bold/italic quotes, HTML tags and references removed.
 */

export interface Definition {
  readonly text: string;
  /** 1 for a definition, 2 for a sub-definition. */
  readonly level: 1 | 2;
}

export interface Sense {
  /** e.g. "Nom commun", "Verbe", "Adjectif". */
  readonly partOfSpeech: string;
  /** True for an inflected form section ("Troisième personne… de manger"). */
  readonly isInflection: boolean;
  readonly definitions: readonly Definition[];
}

export interface WiktionaryEntry {
  readonly title: string;
  readonly senses: readonly Sense[];
}

/** Display names of the section types (the "S" template's first parameter). */
const PART_OF_SPEECH: Record<string, string> = {
  nom: 'Nom commun',
  'nom commun': 'Nom commun',
  'nom propre': 'Nom propre',
  verbe: 'Verbe',
  adjectif: 'Adjectif',
  adj: 'Adjectif',
  adverbe: 'Adverbe',
  adv: 'Adverbe',
  interjection: 'Interjection',
  préposition: 'Préposition',
  conjonction: 'Conjonction',
  pronom: 'Pronom',
  'pronom personnel': 'Pronom personnel',
  'pronom démonstratif': 'Pronom démonstratif',
  'pronom relatif': 'Pronom relatif',
  'pronom indéfini': 'Pronom indéfini',
  'adjectif numéral': 'Adjectif numéral',
  'adjectif possessif': 'Adjectif possessif',
  'adjectif démonstratif': 'Adjectif démonstratif',
  'article défini': 'Article défini',
  'article indéfini': 'Article indéfini',
  onomatopée: 'Onomatopée',
  symbole: 'Symbole',
  lettre: 'Lettre',
  locution: 'Locution',
};

/** Templates rendered as their first parameter (a link to another word). */
const LINK_TEMPLATES = new Set(['lien', 'l', 'lien web', 'nobr']);
/** Templates rendered as "(Param)" — a domain or usage label with a value. */
const DOMAIN_TEMPLATES = new Set(['lexique', 'info lex', 'term', 'région', 'domaine', 'sport']);
/** Templates dropped entirely. */
const DROPPED_TEMPLATES = new Set([
  'ébauche-déf',
  'réf',
  'ref',
  'refnec',
  'réf ?',
  'pron',
  'm',
  'f',
]);
const LANGUAGE_CODE = /^[a-z]{2,3}(-[a-z]+)?$/;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Extracts the French section, or returns null when the page has none. */
function frenchSection(wikitext: string): string | null {
  const start = wikitext.search(/^==\s*\{\{langue\|fr\}\}\s*==\s*$/m);
  if (start < 0) return null;
  const rest = wikitext.slice(start);
  const firstLineEnd = rest.indexOf('\n');
  const body = firstLineEnd < 0 ? '' : rest.slice(firstLineEnd + 1);
  // The section ends at the next level-2 heading ("== {{langue|xx}} ==").
  const end = body.search(/^==[^=]/m);
  return end < 0 ? body : body.slice(0, end);
}

/**
 * Splits `{{name|a|b|key=value}}` contents (without the braces) at top-level
 * pipes, i.e. ignoring pipes inside nested templates or links.
 */
function splitParams(inner: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < inner.length; i++) {
    const two = inner.slice(i, i + 2);
    if (two === '{{' || two === '[[') {
      depth++;
      current += two;
      i++;
    } else if ((two === '}}' || two === ']]') && depth > 0) {
      depth--;
      current += two;
      i++;
    } else if (inner[i] === '|' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += inner[i];
    }
  }
  parts.push(current);
  return parts.map((p) => p.trim());
}

/** Renders one template call (name + parameters) as plain text. */
function renderTemplate(inner: string): string {
  const [rawName = '', ...params] = splitParams(inner);
  const name = rawName.trim().toLowerCase();
  const positional = params.filter((p) => !/^[\w ]+=/.test(p)).map((p) => cleanInline(p));
  const meaningful = positional.filter((p) => p !== '' && !LANGUAGE_CODE.test(p));

  if (LINK_TEMPLATES.has(name)) return positional[0] ?? '';
  if (name === 'w' || name === 'wp') return positional[1] || positional[0] || '';
  if (DROPPED_TEMPLATES.has(name) || name.startsWith('voir')) return '';
  if (name === 'note') return 'Note :';
  if (name === 'cf') return meaningful.length > 0 ? `→ voir ${meaningful.join(', ')}` : '→ voir';
  if (name === 'pronl') return '(Pronominal)';
  if (DOMAIN_TEMPLATES.has(name)) {
    return meaningful.length > 0 ? `(${meaningful.map(capitalize).join(', ')})` : '';
  }
  // Usage labels like {{figuré|fr}}, {{familier}}, {{par extension}}, {{Québec|fr}}:
  // no parameter other than the language → shown as "(Figuré)".
  if (meaningful.length === 0) return `(${capitalize(rawName.trim())})`;
  return ''; // anything else (examples, formatting helpers…) is dropped
}

/** Converts inline wiki markup to plain text. */
export function cleanInline(text: string): string {
  let result = text;
  // Templates, innermost first (they can be nested).
  for (let guard = 0; guard < 20 && result.includes('{{'); guard++) {
    const next = result.replace(/\{\{([^{}]*)\}\}/g, (_, inner: string) => renderTemplate(inner));
    if (next === result) break;
    result = next;
  }
  return (
    result
      // Links: drop files and categories, keep the displayed text of the others.
      .replace(/\[\[(?:Fichier|File|Image|Catégorie|Category):[^\]]*\]\]/gi, '')
      .replace(/\[\[([^|\]]*)\|([^\]]*)\]\]/g, '$2')
      .replace(/\[\[([^\]]*)\]\]/g, '$1')
      // External links [http://… text] → text.
      .replace(/\[https?:\/\/\S+\s+([^\]]*)\]/g, '$1')
      // References and HTML tags.
      .replace(/<ref[^>]*\/>/g, '')
      .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      // Bold / italic quotes.
      .replace(/'{2,}/g, '')
      // Tidy up spaces and leftover empty brackets.
      .replace(/\(\s*\)/g, '')
      .replace(/\s+/g, ' ')
      // No space before . , ) — but French keeps one before ; : ! ?
      .replace(/\s+([.,)])/g, '$1')
      .replace(/([^\s(])([;:!?])(?=\s|$)/g, '$1 $2')
      .trim()
  );
}

/** Parses the wikitext of page `title`. Returns null when it has no French definition. */
export function parseWiktionaryPage(title: string, wikitext: string): WiktionaryEntry | null {
  const section = frenchSection(wikitext);
  if (section === null) return null;

  const senses: Sense[] = [];
  let current: { partOfSpeech: string; isInflection: boolean; definitions: Definition[] } | null =
    null;

  for (const line of section.split('\n')) {
    // Section heading: "=== {{S|nom|fr|num=1}} ===" (level 3 or deeper).
    const heading = /^={3,}\s*\{\{S\|([^}]*)\}\}\s*={3,}\s*$/.exec(line);
    if (heading) {
      const params = splitParams(heading[1]!);
      const type = (params[0] ?? '').toLowerCase();
      // Parts of speech carry the language code as 2nd parameter; other
      // sections (étymologie, synonymes, traductions…) do not.
      if (params[1] === 'fr') {
        current = {
          partOfSpeech: PART_OF_SPEECH[type] ?? capitalize(type),
          isInflection: params.includes('flexion'),
          definitions: [],
        };
        senses.push(current);
      } else {
        current = null;
      }
      continue;
    }
    if (!current) continue;

    // Definitions: "# text" (level 1) and "## text" (level 2). Examples ("#*")
    // and notes ("#:") are skipped.
    const definition = /^(#{1,2})(?![*:#])\s*(.*)$/.exec(line);
    if (definition) {
      const text = cleanInline(definition[2]!);
      if (text !== '' && /[\p{L}]/u.test(text)) {
        current.definitions.push({ text, level: definition[1]!.length === 1 ? 1 : 2 });
      }
    }
  }

  const useful = senses.filter((s) => s.definitions.length > 0);
  return useful.length > 0 ? { title, senses: useful } : null;
}
