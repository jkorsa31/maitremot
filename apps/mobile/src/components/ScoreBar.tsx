/** Players and scores, with the current player highlighted. */

import type { GameState } from '@maitremot/engine';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../ui/theme';

export function ScoreBar({ game }: { game: GameState }) {
  return (
    <View style={styles.bar}>
      {game.players.map((player, i) => {
        const active = game.status === 'playing' && i === game.currentPlayerIndex;
        return (
          <View key={player.id} style={[styles.player, active && styles.active]}>
            <View style={styles.nameRow}>
              {active && player.kind === 'ai' && (
                <ActivityIndicator size="small" color={colors.primaryText} style={styles.spinner} />
              )}
              <Text style={[styles.name, active && styles.activeText]} numberOfLines={1}>
                {player.name}
              </Text>
            </View>
            <Text style={[styles.score, active && styles.activeText]}>{player.score}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', gap: 6, flex: 1 },
  player: {
    flex: 1,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radius.medium,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  active: { backgroundColor: colors.primary, borderColor: colors.primary },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  spinner: { transform: [{ scale: 0.6 }], marginRight: -2, height: 14 },
  name: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  score: { fontSize: 18, fontWeight: '700', color: colors.text },
  activeText: { color: colors.primaryText },
});
