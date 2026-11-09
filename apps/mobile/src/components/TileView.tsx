/**
 * Visual of a letter tile: the letter in the middle, its value in the corner.
 * A blank shows the letter chosen for it in another color, without points
 * (or nothing at all while it is still on the rack).
 */

import { type Letter, letterPoints } from '@maitremot/engine';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../ui/theme';

export type TileVariant = 'normal' | 'pending' | 'lastMove';

interface Props {
  /** Letter shown; null for a blank still on the rack. */
  readonly letter: Letter | null;
  readonly isBlank: boolean;
  readonly size: number;
  readonly variant?: TileVariant;
  readonly selected?: boolean;
  readonly faded?: boolean;
}

const BACKGROUND: Record<TileVariant, string> = {
  normal: colors.tile,
  pending: colors.pendingTile,
  lastMove: colors.lastMove,
};

export function TileView({ letter, isBlank, size, variant = 'normal', selected, faded }: Props) {
  const showPoints = letter !== null && !isBlank && size >= 20;
  return (
    <View
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: Math.max(2, size * 0.12),
          backgroundColor: BACKGROUND[variant],
          borderColor: variant === 'pending' ? colors.pendingBorder : colors.tileBorder,
        },
        selected && styles.selected,
        faded && styles.faded,
      ]}
    >
      <Text
        allowFontScaling={false}
        style={[
          styles.letter,
          { fontSize: size * 0.56, color: isBlank ? colors.tileBlankText : colors.tileText },
        ]}
      >
        {letter ?? ''}
      </Text>
      {showPoints && (
        <Text allowFontScaling={false} style={[styles.points, { fontSize: size * 0.24 }]}>
          {letterPoints(letter)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderBottomWidth: 2,
  },
  letter: { fontWeight: '700' },
  points: {
    position: 'absolute',
    right: '8%',
    bottom: '2%',
    color: colors.tileText,
    fontWeight: '600',
  },
  selected: { borderColor: colors.selected, borderWidth: 2, transform: [{ translateY: -4 }] },
  faded: { opacity: 0.3 },
});
