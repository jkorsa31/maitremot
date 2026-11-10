/**
 * Definitions of one or several played words (from the Wiktionary).
 * With several words (e.g. the main word and its cross words), tabs at the top
 * switch between them.
 */

import { WIKTIONARY_CREDITS, type WiktionaryEntry, wiktionaryUrl } from '@maitremot/wiktionary';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useDefinitions } from '../game/definitions';
import { colors, radius } from '../ui/theme';
import { Button } from './Button';
import { Sheet } from './Sheets';

/** Above this, a part of speech shows its first definitions and a "voir plus" link. */
const MAX_DEFINITIONS = 6;

export function DefinitionSheet(props: { words: readonly string[]; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [props.words]);
  const word = props.words[index] ?? null;

  return (
    <Sheet visible={props.words.length > 0} title="Définitions" onClose={props.onClose}>
      {props.words.length > 1 && (
        <View style={styles.tabs}>
          {props.words.map((w, i) => (
            <Pressable
              key={`${w}-${i}`}
              onPress={() => setIndex(i)}
              accessibilityRole="tab"
              accessibilityState={{ selected: i === index }}
              style={[styles.tab, i === index && styles.tabSelected]}
            >
              <Text style={[styles.tabText, i === index && styles.tabTextSelected]}>{w}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <ScrollView style={styles.scroll}>{word && <WordDefinitions word={word} />}</ScrollView>
      <Text style={styles.credits}>{WIKTIONARY_CREDITS}</Text>
      <View style={styles.buttons}>
        <Button label="Fermer" onPress={props.onClose} />
      </View>
    </Sheet>
  );
}

function WordDefinitions({ word }: { word: string }) {
  const state = useDefinitions(word);

  if (state.status === 'loading') {
    return <ActivityIndicator color={colors.primary} style={styles.loading} />;
  }
  if (state.status === 'error') {
    return (
      <Text style={styles.message}>
        Impossible de joindre le Wiktionnaire. Vérifie ta connexion à Internet.
      </Text>
    );
  }
  return (
    <View style={styles.blocks}>
      {state.blocks.map((block) => {
        const pages = [
          ...(block.entry ? [{ title: block.form, entry: block.entry }] : []),
          ...block.lemmas.map((l) => ({ title: l.lemma, entry: l.entry })),
        ];
        const found = pages.filter((p): p is { title: string; entry: WiktionaryEntry } =>
          Boolean(p.entry),
        );
        return (
          <View key={block.form} style={styles.block}>
            <Text style={styles.form}>{block.form}</Text>
            {found.length === 0 && (
              <Text style={styles.message}>Pas de définition trouvée pour ce mot.</Text>
            )}
            {found.map((page) => (
              <Page key={page.title} entry={page.entry} showTitle={page.title !== block.form} />
            ))}
            <Pressable onPress={() => void Linking.openURL(wiktionaryUrl(block.form))}>
              <Text style={styles.link}>Voir « {block.form} » sur le Wiktionnaire</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

/** One Wiktionary page: its parts of speech and their numbered definitions. */
function Page({ entry, showTitle }: { entry: WiktionaryEntry; showTitle: boolean }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={styles.page}>
      {showTitle && <Text style={styles.lemma}>→ {entry.title}</Text>}
      {entry.senses.map((sense, s) => {
        const definitions = expanded
          ? sense.definitions
          : sense.definitions.slice(0, MAX_DEFINITIONS);
        let number = 0;
        return (
          <View key={s} style={styles.sense}>
            <Text style={styles.partOfSpeech}>
              {sense.partOfSpeech}
              {sense.isInflection ? ' (forme)' : ''}
            </Text>
            {definitions.map((d, i) => (
              <Text key={i} style={[styles.definition, d.level === 2 && styles.subDefinition]}>
                {d.level === 1 ? `${++number}. ` : '• '}
                {d.text}
              </Text>
            ))}
            {!expanded && sense.definitions.length > MAX_DEFINITIONS && (
              <Pressable onPress={() => setExpanded(true)}>
                <Text style={styles.link}>
                  Voir les {sense.definitions.length - MAX_DEFINITIONS} autres sens
                </Text>
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontWeight: '700', color: colors.text },
  tabTextSelected: { color: colors.primaryText },
  scroll: { maxHeight: 420 },
  loading: { marginVertical: 24 },
  message: { fontSize: 15, color: colors.textMuted, marginVertical: 8 },
  blocks: { gap: 16 },
  block: { gap: 6 },
  form: { fontSize: 22, fontWeight: '700', color: colors.text },
  page: { gap: 8 },
  lemma: { fontSize: 17, fontWeight: '700', color: colors.primary, marginTop: 4 },
  sense: { gap: 4 },
  partOfSpeech: { fontSize: 14, fontWeight: '700', color: colors.textMuted, fontStyle: 'italic' },
  definition: { fontSize: 15, color: colors.text, lineHeight: 21 },
  subDefinition: { marginLeft: 16, color: colors.textMuted },
  link: { color: colors.primary, fontWeight: '600', marginTop: 2 },
  credits: { fontSize: 11, color: colors.textMuted },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end' },
});
