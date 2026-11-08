/**
 * Temporary home screen: renders the MaitreMot board straight from the engine
 * package and a dictionary tester, to prove the monorepo wiring works.
 * The real game UI comes in step 5.
 */

import { BOARD_SIZE, CENTER, PREMIUM_LAYOUT, type Premium } from '@maitremot/engine';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { WordChecker } from './src/WordChecker';

/** Colors and short labels for the bonus squares. */
const PREMIUM_STYLE: Record<Premium, { color: string; label: string }> = {
  DL: { color: '#9fd3f0', label: 'L×2' },
  TL: { color: '#3b8fd0', label: 'L×3' },
  DW: { color: '#f3b3a6', label: 'M×2' },
  TW: { color: '#d9463b', label: 'M×3' },
};

export default function App() {
  const { width } = useWindowDimensions();
  // Fit the 15 squares in the screen width, keeping a 16px margin on each side.
  const squareSize = Math.floor((Math.min(width, 600) - 32) / BOARD_SIZE);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>MaitreMot</Text>
      <View>
        {PREMIUM_LAYOUT.map((row, r) => (
          <View key={r} style={styles.row}>
            {row.map((premium, c) => {
              const isCenter = r === CENTER && c === CENTER;
              return (
                <View
                  key={c}
                  style={[
                    styles.square,
                    { width: squareSize, height: squareSize },
                    premium && { backgroundColor: PREMIUM_STYLE[premium].color },
                  ]}
                >
                  <Text style={[styles.label, { fontSize: squareSize * 0.28 }]}>
                    {isCenter ? '★' : premium ? PREMIUM_STYLE[premium].label : ''}
                  </Text>
                </View>
              );
            })}
          </View>
        ))}
      </View>
      <WordChecker />
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f1e7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 32, fontWeight: '700', marginBottom: 24, color: '#2b2b2b' },
  row: { flexDirection: 'row' },
  square: {
    backgroundColor: '#e9e1cf',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#f6f1e7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { color: '#2b2b2b', fontWeight: '600' },
});
