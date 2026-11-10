/**
 * The modal windows of the game screen:
 * - BlankPicker:  choose the letter of a blank;
 * - ExchangeSheet: choose the tiles to exchange;
 * - HistorySheet: list of all turns (tap a word to see its definition);
 * - ConfirmSheet: yes / no question (pass, quit...);
 * - GameOverSheet: final ranking.
 */

import { type GameState, type Letter, LETTERS, type Tile, ranking } from '@maitremot/engine';
import { type ReactNode, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { points } from '../game/messages';
import { colors, radius } from '../ui/theme';
import { Button } from './Button';
import { TileView } from './TileView';

/** Generic modal card with a title; tapping outside closes it. */
export function Sheet(props: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal visible={props.visible} transparent animationType="fade" onRequestClose={props.onClose}>
      <Pressable style={styles.backdrop} onPress={props.onClose}>
        {/* Inner Pressable stops taps inside the card from closing the sheet. */}
        <Pressable style={styles.card} onPress={() => undefined}>
          <Text style={styles.title}>{props.title}</Text>
          {props.children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function BlankPicker(props: {
  visible: boolean;
  onChoose: (letter: Letter | null) => void;
}) {
  return (
    <Sheet visible={props.visible} title="Lettre du joker" onClose={() => props.onChoose(null)}>
      <View style={styles.letterGrid}>
        {LETTERS.map((letter) => (
          <Pressable
            key={letter}
            onPress={() => props.onChoose(letter)}
            accessibilityLabel={letter}
          >
            <TileView letter={letter} isBlank size={40} />
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

export function ExchangeSheet(props: {
  visible: boolean;
  rack: readonly Tile[];
  bagSize: number;
  onCancel: () => void;
  onExchange: (tileIds: number[]) => void;
}) {
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const toggle = (id: number) =>
    setChosen((set) => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const close = (action: () => void) => {
    setChosen(new Set());
    action();
  };
  return (
    <Sheet
      visible={props.visible}
      title="Échanger des lettres"
      onClose={() => close(props.onCancel)}
    >
      <Text style={styles.text}>
        Touche les lettres à remettre dans le sac ({props.bagSize} jetons restants). Tu passes ton
        tour.
      </Text>
      <View style={styles.letterGrid}>
        {props.rack.map((tile) => (
          <Pressable
            key={tile.id}
            testID={`exchange-tile-${tile.id}`}
            onPress={() => toggle(tile.id)}
          >
            <TileView
              letter={tile.letter}
              isBlank={tile.letter === null}
              size={42}
              selected={chosen.has(tile.id)}
            />
          </Pressable>
        ))}
      </View>
      <View style={styles.buttons}>
        <Button label="Annuler" variant="secondary" onPress={() => close(props.onCancel)} />
        <Button
          label={`Échanger (${chosen.size})`}
          disabled={chosen.size === 0}
          onPress={() => close(() => props.onExchange([...chosen]))}
        />
      </View>
    </Sheet>
  );
}

export function ConfirmSheet(props: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Sheet visible={props.visible} title={props.title} onClose={props.onCancel}>
      <Text style={styles.text}>{props.message}</Text>
      <View style={styles.buttons}>
        <Button label="Annuler" variant="secondary" onPress={props.onCancel} />
        <Button label={props.confirmLabel} onPress={props.onConfirm} />
      </View>
    </Sheet>
  );
}

/** One line per turn, most recent first. Tapping a played turn shows its definitions. */
export function HistorySheet(props: {
  visible: boolean;
  game: GameState;
  onClose: () => void;
  onShowWords: (words: string[]) => void;
}) {
  const names = new Map(props.game.players.map((p) => [p.id, p.name]));
  const turns = [...props.game.history].reverse();
  return (
    <Sheet visible={props.visible} title="Historique" onClose={props.onClose}>
      <ScrollView style={styles.history}>
        {turns.length === 0 && <Text style={styles.text}>Aucun coup pour l'instant.</Text>}
        {turns.map((turn, i) => (
          <Pressable
            key={i}
            disabled={turn.kind !== 'play'}
            onPress={() =>
              turn.kind === 'play' && props.onShowWords(turn.score.words.map((w) => w.word))
            }
            style={({ pressed }) => [styles.historyRow, pressed && styles.rowPressed]}
          >
            <Text style={styles.historyName}>{names.get(turn.playerId)}</Text>
            <Text style={styles.historyText}>
              {turn.kind === 'play'
                ? `${turn.score.words.map((w) => w.word).join(', ')}${turn.score.bonus ? ' (+50)' : ''}`
                : turn.kind === 'exchange'
                  ? `échange ${turn.count} lettre${turn.count > 1 ? 's' : ''}`
                  : 'passe'}
            </Text>
            <Text style={styles.historyScore}>{turn.kind === 'play' ? turn.score.total : ''}</Text>
            {turn.kind === 'play' && (
              <Ionicons name="book-outline" size={16} color={colors.textMuted} />
            )}
          </Pressable>
        ))}
      </ScrollView>
      <Text style={styles.hint}>Touche un coup pour voir la définition de ses mots.</Text>
      <View style={styles.buttons}>
        <Button label="Fermer" onPress={props.onClose} />
      </View>
    </Sheet>
  );
}

export function GameOverSheet(props: {
  visible: boolean;
  game: GameState;
  onNewGame: () => void;
  onClose: () => void;
}) {
  const ranked = ranking(props.game);
  const adjustments = new Map(props.game.end?.adjustments.map((a) => [a.playerId, a.delta]));
  const winner = ranked[0];
  const tie = ranked.length > 1 && ranked[1]!.score === winner?.score;
  return (
    <Sheet visible={props.visible} title="Partie terminée" onClose={props.onClose}>
      <Text style={styles.text}>
        {tie
          ? 'Égalité !'
          : winner?.kind === 'human'
            ? 'Bravo, tu as gagné !'
            : `${winner?.name} gagne.`}
      </Text>
      {ranked.map((player, i) => (
        <View key={player.id} style={styles.historyRow}>
          <Text style={styles.historyName}>
            {i + 1}. {player.name}
          </Text>
          <Text style={styles.historyText}>
            {adjustments.get(player.id)
              ? `(${formatDelta(adjustments.get(player.id)!)} en fin de partie)`
              : ''}
          </Text>
          <Text style={styles.historyScore}>{points(player.score)}</Text>
        </View>
      ))}
      <View style={styles.buttons}>
        <Button label="Voir le plateau" variant="secondary" onPress={props.onClose} />
        <Button label="Nouvelle partie" onPress={props.onNewGame} />
      </View>
    </Sheet>
  );
}

const formatDelta = (n: number) => (n > 0 ? `+${n}` : `${n}`);

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.large,
    padding: 20,
    gap: 12,
  },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  text: { fontSize: 15, color: colors.text, lineHeight: 21 },
  letterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 },
  history: { maxHeight: 360 },
  rowPressed: { backgroundColor: colors.background },
  hint: { fontSize: 12, color: colors.textMuted },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: 8,
  },
  historyName: { fontWeight: '600', color: colors.text, minWidth: 64 },
  historyText: { flex: 1, color: colors.textMuted },
  historyScore: { fontWeight: '700', color: colors.text },
});
