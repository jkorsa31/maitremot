/**
 * Home screen: set up a solo game (your name, 1 to 3 computer opponents and
 * their level) or resume the game in progress.
 */

import type { AiLevel } from '@maitremot/engine';
import { DICTIONARY_CREDITS } from '@maitremot/lexicon-fr';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../components/Button';
import { LEVEL_LABELS, startSoloGame, useSoloGameState } from '../game/session';
import { colors, radius } from '../ui/theme';

const LEVELS: AiLevel[] = ['easy', 'medium', 'expert'];

export default function HomeScreen() {
  const current = useSoloGameState();
  const [name, setName] = useState('');
  const [opponents, setOpponents] = useState<AiLevel[]>(['medium']);

  const setCount = (count: number) =>
    setOpponents((list) =>
      Array.from({ length: count }, (_, i) => list[i] ?? list[list.length - 1] ?? 'medium'),
    );
  const setLevel = (index: number, level: AiLevel) =>
    setOpponents((list) => list.map((l, i) => (i === index ? level : l)));

  const start = () => {
    startSoloGame({ playerName: name, opponents });
    router.push('/game');
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.subtitle}>Le jeu de lettres entre amis</Text>

      {current?.status === 'playing' && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Partie en cours</Text>
          <Text style={styles.muted}>
            {current.players.map((p) => `${p.name} ${p.score}`).join(' · ')}
          </Text>
          <Button label="Reprendre" icon="play" onPress={() => router.push('/game')} />
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Nouvelle partie solo</Text>

        <Text style={styles.label}>Ton prénom</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Moi"
          maxLength={12}
          autoCorrect={false}
        />

        <Text style={styles.label}>Nombre d'adversaires</Text>
        <Segmented
          options={[1, 2, 3].map((n) => ({ value: n, label: String(n) }))}
          value={opponents.length}
          onChange={setCount}
        />

        {opponents.map((level, i) => (
          <View key={i}>
            <Text style={styles.label}>
              {opponents.length === 1 ? "Niveau de l'ordinateur" : `Niveau de Ordi ${i + 1}`}
            </Text>
            <Segmented
              options={LEVELS.map((l) => ({ value: l, label: LEVEL_LABELS[l] }))}
              value={level}
              onChange={(l) => setLevel(i, l)}
            />
          </View>
        ))}

        <View style={styles.startButton}>
          <Button label="Jouer" icon="play" onPress={start} />
        </View>
      </View>

      <Text style={styles.credits}>{DICTIONARY_CREDITS}</Text>
    </ScrollView>
  );
}

function Segmented<T extends string | number>(props: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup">
      {props.options.map((option) => {
        const selected = option.value === props.value;
        return (
          <Pressable
            key={String(option.value)}
            onPress={() => props.onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16, maxWidth: 520, width: '100%', alignSelf: 'center' },
  subtitle: { fontSize: 16, color: colors.textMuted },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.large,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  muted: { color: colors.textMuted, marginBottom: 4 },
  label: { marginTop: 8, marginBottom: 6, fontWeight: '600', color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.medium,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
  },
  segmented: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.medium,
    overflow: 'hidden',
  },
  segment: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  segmentSelected: { backgroundColor: colors.primary },
  segmentText: { fontWeight: '600', color: colors.text },
  segmentTextSelected: { color: colors.primaryText },
  startButton: { marginTop: 16 },
  credits: { fontSize: 12, color: colors.textMuted, textAlign: 'center' },
});
