/**
 * Game screen: scores, board, rack and actions.
 *
 * The logic lives in `useSoloGame`; this file only lays things out and wires
 * the buttons. Layout, top to bottom:
 *   [quit] [scores]                [history]
 *   status line (whose turn / score preview / error)     [bag] [zoom]
 *   board (zoomable)
 *   rack
 *   [recall|shuffle] [exchange] [pass] [play]
 */

import { BOARD_SIZE, type GameState, type Position } from '@maitremot/engine';
import { Redirect, router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BoardView } from '../components/BoardView';
import { Button } from '../components/Button';
import { DragProvider } from '../components/DragLayer';
import { RackView } from '../components/RackView';
import { ScoreBar } from '../components/ScoreBar';
import {
  BlankPicker,
  ConfirmSheet,
  ExchangeSheet,
  GameOverSheet,
  HistorySheet,
} from '../components/Sheets';
import { moveErrorMessage, points } from '../game/messages';
import { useSoloGameState } from '../game/session';
import { useSoloGame } from '../game/useSoloGame';
import { colors } from '../ui/theme';

/** Square size when the board is zoomed in. */
const ZOOMED_SQUARE = 40;

export default function GameScreen() {
  const game = useSoloGameState();
  if (!game) return <Redirect href="/" />;
  return (
    <DragProvider>
      <GameContent game={game} />
    </DragProvider>
  );
}

function GameContent({ game }: { game: GameState }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const g = useSoloGame(game);

  const [zoomed, setZoomed] = useState(false);
  const [sheet, setSheet] = useState<'exchange' | 'history' | 'pass' | null>(null);
  const [gameOverDismissed, setGameOverDismissed] = useState(false);

  const contentWidth = Math.min(width, 600);
  const fitSquare = Math.floor((contentWidth - 8) / BOARD_SIZE);
  const squareSize = zoomed ? Math.max(ZOOMED_SQUARE, fitSquare) : fitSquare;
  const viewport = fitSquare * BOARD_SIZE;
  const tileSize = Math.min(52, Math.floor((contentWidth - 16 - 8 * 6) / 7));

  // Squares of the last word played, to highlight them.
  const lastMove = useMemo(() => {
    const turn = [...game.history].reverse().find((t) => t.kind === 'play');
    return new Set(
      turn?.kind === 'play' ? turn.placements.map((p) => `${p.pos.row},${p.pos.col}`) : [],
    );
  }, [game.history]);

  // When zooming in, scroll to the word being composed (or to the center).
  const hScroll = useRef<ScrollViewInstance>(null);
  const vScroll = useRef<ScrollViewInstance>(null);
  useEffect(() => {
    if (!zoomed) return;
    const target = g.pending[0]?.pos ?? { row: 7, col: 7 };
    const offset = (index: number) =>
      Math.max(
        0,
        Math.min(
          index * squareSize - viewport / 2 + squareSize / 2,
          squareSize * BOARD_SIZE - viewport,
        ),
      );
    const timer = setTimeout(() => {
      hScroll.current?.scrollTo({ x: offset(target.col), animated: false });
      vScroll.current?.scrollTo({ y: offset(target.row), animated: false });
    }, 0);
    return () => clearTimeout(timer);
    // Only when the zoom changes, not at every placed tile.
  }, [zoomed]);

  const status = statusLine(game, g);
  // Score of the word being composed, when it can be played.
  const playableScore =
    g.evaluation?.ok && g.evaluation.value.invalidWords.length === 0
      ? g.evaluation.value.score.total
      : null;

  const board = (
    <BoardView
      board={game.board}
      pending={g.pending}
      tileById={g.tileById}
      lastMove={lastMove}
      squareSize={squareSize}
      interactive={g.isMyTurn}
      onSquarePress={g.pressSquare}
      onDropTile={(tileId: number, pos: Position) => g.placeTile(tileId, pos)}
    />
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 4, paddingBottom: insets.bottom + 8 }]}>
      <View style={[styles.column, { width: contentWidth }]}>
        <View style={styles.topBar}>
          <Button
            label=""
            accessibilityLabel="Quitter"
            icon="close"
            variant="ghost"
            compact
            onPress={() => router.back()}
          />
          <ScoreBar game={game} />
          <Button
            label=""
            accessibilityLabel="Historique"
            icon="list"
            variant="ghost"
            compact
            onPress={() => setSheet('history')}
          />
        </View>

        <View style={styles.statusRow}>
          <Text style={[styles.status, { color: status.color }]} numberOfLines={2}>
            {status.text}
          </Text>
          <Text style={styles.bag}>Sac : {game.bag.length}</Text>
          <Button
            label=""
            accessibilityLabel={zoomed ? 'Dézoomer' : 'Zoomer'}
            icon={zoomed ? 'contract' : 'expand'}
            variant="ghost"
            compact
            onPress={() => setZoomed((z) => !z)}
          />
        </View>

        <View style={[styles.boardViewport, { width: viewport, height: viewport }]}>
          {zoomed ? (
            <ScrollView ref={hScroll} horizontal bounces={false}>
              <ScrollView ref={vScroll} bounces={false} nestedScrollEnabled>
                {board}
              </ScrollView>
            </ScrollView>
          ) : (
            board
          )}
        </View>

        <View style={styles.rackArea}>
          <RackView
            tiles={g.rack}
            tileSize={tileSize}
            selectedTileId={g.selectedTileId}
            interactive={g.isMyTurn}
            onSelect={g.selectTile}
            onDropTile={(tileId, from, index) =>
              from === 'board' ? g.returnToRack(tileId, index) : g.moveInRack(tileId, index)
            }
          />
        </View>

        <View style={styles.actions}>
          <View style={styles.action}>
            {g.pending.length > 0 ? (
              <Button
                label="Rappeler"
                icon="arrow-undo"
                variant="secondary"
                stacked
                onPress={g.recall}
              />
            ) : (
              <Button
                label="Mélanger"
                icon="shuffle"
                variant="secondary"
                stacked
                onPress={g.shuffleRack}
              />
            )}
          </View>
          <View style={styles.action}>
            <Button
              label="Échanger"
              icon="swap-horizontal"
              variant="secondary"
              stacked
              disabled={!g.isMyTurn || game.bag.length < 7}
              onPress={() => setSheet('exchange')}
            />
          </View>
          <View style={styles.action}>
            <Button
              label="Passer"
              icon="play-skip-forward"
              variant="secondary"
              stacked
              disabled={!g.isMyTurn}
              onPress={() => setSheet('pass')}
            />
          </View>
          <View style={styles.playButton}>
            <Button
              label={playableScore !== null ? `Jouer · ${playableScore}` : 'Jouer'}
              icon="checkmark"
              stacked
              disabled={!g.isMyTurn || playableScore === null}
              onPress={g.play}
            />
          </View>
        </View>
      </View>

      <BlankPicker visible={g.blankPrompt !== null} onChoose={g.chooseBlankLetter} />
      <ExchangeSheet
        visible={sheet === 'exchange'}
        rack={g.me.rack}
        bagSize={game.bag.length}
        onCancel={() => setSheet(null)}
        onExchange={(ids) => {
          if (g.exchange(ids)) setSheet(null);
        }}
      />
      <ConfirmSheet
        visible={sheet === 'pass'}
        title="Passer ton tour ?"
        message="Tu ne marques aucun point ce tour-ci."
        confirmLabel="Passer"
        onCancel={() => setSheet(null)}
        onConfirm={() => {
          g.pass();
          setSheet(null);
        }}
      />
      <HistorySheet visible={sheet === 'history'} game={game} onClose={() => setSheet(null)} />
      <GameOverSheet
        visible={game.status === 'finished' && !gameOverDismissed}
        game={game}
        onClose={() => setGameOverDismissed(true)}
        onNewGame={() => router.replace('/')}
      />
    </View>
  );
}

/** The line under the scores: whose turn it is, the live score, or what is wrong. */
function statusLine(game: GameState, g: ReturnType<typeof useSoloGame>) {
  if (g.error) return { text: g.error, color: colors.danger };
  if (game.status === 'finished') return { text: 'Partie terminée', color: colors.text };
  if (g.aiThinking) return { text: `${g.playing.name} réfléchit…`, color: colors.textMuted };
  if (g.evaluation) {
    if (!g.evaluation.ok)
      return { text: moveErrorMessage(g.evaluation.error), color: colors.danger };
    const { invalidWords, score } = g.evaluation.value;
    if (invalidWords.length > 0) {
      return {
        text: moveErrorMessage({ code: 'INVALID_WORDS', words: invalidWords }),
        color: colors.danger,
      };
    }
    const words = score.words.map((w) => w.word).join(', ');
    return {
      text: `${words} : ${points(score.total)}${score.bonus ? ' (+50 inclus)' : ''}`,
      color: colors.primary,
    };
  }
  const last = game.history[game.history.length - 1];
  if (last) {
    const who = game.players.find((p) => p.id === last.playerId)?.name;
    const what =
      last.kind === 'play'
        ? `${who} a joué ${last.score.words[0]?.word} (${points(last.score.total)})`
        : last.kind === 'exchange'
          ? `${who} a échangé ${last.count} lettre${last.count > 1 ? 's' : ''}`
          : `${who} a passé`;
    return { text: `${what}. À toi !`, color: colors.text };
  }
  return { text: "À toi de jouer : pose un mot sur l'étoile.", color: colors.text };
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, alignItems: 'center' },
  column: { flex: 1, paddingHorizontal: 4 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingLeft: 6 },
  status: { flex: 1, fontSize: 14, fontWeight: '600' },
  bag: { fontSize: 13, color: colors.textMuted, marginLeft: 8 },
  boardViewport: { alignSelf: 'center', overflow: 'hidden' },
  rackArea: { marginTop: 14, alignItems: 'center' },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
    marginTop: 14,
    paddingHorizontal: 4,
  },
  action: { flex: 1 },
  playButton: { flex: 1.2 },
});
