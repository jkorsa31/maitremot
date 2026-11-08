/**
 * Minimal Hunspell dictionary expander.
 *
 * A Hunspell dictionary is two files:
 * - `.dic`: one stem per line with flags, e.g. `manger/S.a0p+`;
 * - `.aff`: what each flag means, e.g. flag `a0` = "replace -er by -ons, -ez,
 *   -aient...". Rules may chain (a suffix can allow another suffix).
 *
 * This module generates every form a stem can take, together with its stem
 * (which, in Grammalecte's dictionary, is the lemma: the infinitive for verbs,
 * the masculine singular for adjectives...).
 *
 * Only the features used by the French Grammalecte dictionary are supported:
 * `FLAG long` (two-character flags), PFX/SFX with continuation classes,
 * NEEDAFFIX, CIRCUMFIX and FORBIDDENWORD.
 */

interface AffixRule {
  readonly strip: string;
  readonly add: string;
  /** Continuation flags: affixes allowed on top of this one. */
  readonly flags: readonly string[];
  /** Regular expression the stem must match (anchored at the start for PFX, end for SFX). */
  readonly condition: RegExp;
}

interface AffixClass {
  readonly kind: 'PFX' | 'SFX';
  /** Can be combined with an affix of the other kind. */
  readonly crossProduct: boolean;
  readonly rules: AffixRule[];
}

export interface AffixFile {
  readonly classes: ReadonlyMap<string, AffixClass>;
  readonly needAffix: string | undefined;
  readonly circumfix: string | undefined;
  readonly forbidden: string | undefined;
}

/** Splits a flag string into flags (FLAG long = 2 characters per flag). */
export function parseFlags(flags: string): string[] {
  const chars = [...flags];
  const result: string[] = [];
  for (let i = 0; i + 1 < chars.length; i += 2) result.push(chars[i]! + chars[i + 1]!);
  return result;
}

/** Turns a Hunspell condition like `[^cg]er` into a RegExp. */
function conditionToRegExp(condition: string, kind: 'PFX' | 'SFX'): RegExp {
  // Escape regex specials outside of brackets; Hunspell only has [..], [^..] and '.'.
  const source = condition.replace(/[\\+*?(){}|$^]/g, (c, offset: number) =>
    c === '^' && condition[offset - 1] === '[' ? c : `\\${c}`,
  );
  return kind === 'SFX' ? new RegExp(`(?:${source})$`, 'u') : new RegExp(`^(?:${source})`, 'u');
}

export function parseAffixFile(text: string): AffixFile {
  const classes = new Map<string, AffixClass>();
  let needAffix: string | undefined;
  let circumfix: string | undefined;
  let forbidden: string | undefined;

  for (const line of text.split('\n')) {
    const parts = line.trim().split(/\s+/);
    const [keyword, flag] = parts;
    if (!keyword || keyword.startsWith('#')) continue;
    if (keyword === 'NEEDAFFIX') needAffix = flag;
    else if (keyword === 'CIRCUMFIX') circumfix = flag;
    else if (keyword === 'FORBIDDENWORD') forbidden = flag;
    else if ((keyword === 'PFX' || keyword === 'SFX') && flag) {
      const existing = classes.get(flag);
      if (!existing) {
        // Header line: "SFX a0 Y 102"
        classes.set(flag, { kind: keyword, crossProduct: parts[2] === 'Y', rules: [] });
        continue;
      }
      // Rule line: "SFX a0 er ons/flags [^cg]er [morphology...]"
      const [, , strip = '0', addField = '0', condition = '.'] = parts;
      const [add = '0', contFlags = ''] = addField.split('/');
      existing.rules.push({
        strip: strip === '0' ? '' : strip,
        add: add === '0' ? '' : add,
        flags: parseFlags(contFlags),
        condition: conditionToRegExp(condition, keyword),
      });
    }
  }
  return { classes, needAffix, circumfix, forbidden };
}

export interface ExpandedForm {
  readonly form: string;
  readonly lemma: string;
}

/**
 * Generates all forms of one `.dic` entry.
 * `skipAffix` lets the caller ignore useless affixes (e.g. elisions "l'", "d'").
 */
export function expandEntry(
  aff: AffixFile,
  stem: string,
  flagString: string,
  skipAffix: (rule: AffixRule) => boolean,
): ExpandedForm[] {
  const flags = parseFlags(flagString);
  if (aff.forbidden && flags.includes(aff.forbidden)) return [];

  const has = (list: readonly string[], flag: string | undefined) =>
    flag !== undefined && list.includes(flag);
  const results: ExpandedForm[] = [];
  const emit = (form: string, lemma: string) => results.push({ form, lemma });

  /** Applies every rule of the given suffix flags to `word`. */
  const suffixes = (word: string, flagList: readonly string[]) => {
    const out: Array<{ word: string; rule: AffixRule; cls: AffixClass }> = [];
    for (const flag of flagList) {
      const cls = aff.classes.get(flag);
      if (cls?.kind !== 'SFX') continue;
      for (const rule of cls.rules) {
        if (skipAffix(rule) || !word.endsWith(rule.strip) || !rule.condition.test(word)) continue;
        out.push({ word: word.slice(0, word.length - rule.strip.length) + rule.add, rule, cls });
      }
    }
    return out;
  };

  // Suffixed forms, including "twofold" suffixes (a suffix allowing another one).
  type Suffixed = { word: string; crossProduct: boolean; circumfix: boolean };
  const suffixed: Suffixed[] = [];
  for (const first of suffixes(stem, flags)) {
    const needs = has(first.rule.flags, aff.needAffix);
    const circ = has(first.rule.flags, aff.circumfix);
    if (!needs)
      suffixed.push({ word: first.word, crossProduct: first.cls.crossProduct, circumfix: circ });
    for (const second of suffixes(first.word, first.rule.flags)) {
      if (has(second.rule.flags, aff.needAffix)) continue;
      suffixed.push({
        word: second.word,
        crossProduct: first.cls.crossProduct && second.cls.crossProduct,
        circumfix: circ || has(second.rule.flags, aff.circumfix),
      });
    }
  }

  // The stem itself, unless flagged as needing an affix.
  if (!has(flags, aff.needAffix)) emit(stem, stem);
  for (const s of suffixed) if (!s.circumfix) emit(s.word, stem);

  // Prefixed forms. The lemma of "kilo" + "mètres" is "kilomètre".
  for (const flag of flags) {
    const cls = aff.classes.get(flag);
    if (cls?.kind !== 'PFX') continue;
    for (const rule of cls.rules) {
      if (skipAffix(rule) || !stem.startsWith(rule.strip) || !rule.condition.test(stem)) continue;
      const prefix = (word: string) => rule.add + word.slice(rule.strip.length);
      const lemma = prefix(stem);
      const circ = has(rule.flags, aff.circumfix);
      if (!has(rule.flags, aff.needAffix) && !circ) emit(lemma, lemma);
      if (cls.crossProduct) {
        for (const s of suffixed)
          if (s.crossProduct && s.circumfix === circ) emit(prefix(s.word), lemma);
      }
      // Suffixes allowed by the prefix itself (e.g. "yotta/S." → "yottamètres").
      for (const s of suffixes(stem, rule.flags)) emit(prefix(s.word), lemma);
    }
  }
  return results;
}
