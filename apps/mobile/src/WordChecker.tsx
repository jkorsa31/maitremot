/**
 * Temporary dictionary tester (step 3): type a word, see whether it can be
 * played and which real spellings / lemmas it corresponds to.
 * It will be replaced by the definitions sheet in step 5 bis.
 */

import { normalizeWord } from '@maitremot/engine';
import { getLexicon, getWords } from '@maitremot/lexicon-fr';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

export function WordChecker() {
  const [input, setInput] = useState('');
  const word = normalizeWord(input.trim());

  // Recomputed only when the word changes. The dictionaries are decoded on first use.
  const result = useMemo(() => {
    if (word.length < 2) return null;
    return { valid: getWords().has(word), entries: getLexicon().lookup(word) };
  }, [word]);

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={input}
        onChangeText={setInput}
        placeholder="Tester un mot"
        autoCapitalize="characters"
        autoCorrect={false}
      />
      {result && (
        <Text style={[styles.verdict, { color: result.valid ? '#2e7d32' : '#c62828' }]}>
          {result.valid ? `${word} est jouable` : `${word} n'est pas dans le dictionnaire`}
        </Text>
      )}
      {result?.entries.map((entry) => (
        <Text key={entry.form} style={styles.entry}>
          {entry.form} → {entry.lemmas.join(', ')}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', maxWidth: 400, paddingHorizontal: 16, marginTop: 24 },
  input: {
    borderWidth: 1,
    borderColor: '#c9bfa8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 18,
    backgroundColor: '#fff',
  },
  verdict: { marginTop: 12, fontSize: 16, fontWeight: '600' },
  entry: { marginTop: 4, fontSize: 15, color: '#444' },
});
