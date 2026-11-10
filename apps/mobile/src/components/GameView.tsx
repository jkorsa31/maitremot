/**
 * The game screen layout, shared by solo and online games: scores, board,
 * rack and actions.
 *
 * The logic lives in the game controller (useGameController / useSoloGame);
 * this component only lays things out and wires the buttons. Layout, top to bottom:
 *   [quit] [scores]                [history]
 *   status line (whose turn / score preview / error)     [bag] [zoom]
 *   board (zoomable)
 *   rack
 *   [recall|shuffle] [exchange] [pass] [play]
 */

import { BOARD_SIZE, type Board, type GameState, type Position, cellAt } from '@maitremot/engine';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BoardView } from './BoardView';
import { Button } from './Button';
import { DefinitionSheet } from './DefinitionSheet';
import { RackView } from './RackView';
import { ScoreBar } from './ScoreBar';
import { BlankPicker, ConfirmSheet, ExchangeSheet, GameOverSheet, HistorySheet } from './Sheets';
import { moveErrorMessage, points } from '../game/messages';
import type { GameController } from '../game/useGameController';
import { colors } from '../ui/theme';

/** Time for a closing modal window to disappear before opening another one. */
const MODAL_SWITCH_DELAY_MS = 350;

/** Approximate heights of the parts around the board, to fit small screens. */
const TOP_BAR_HEIGHT = 56;
const STATUS_HEIGHT = 48;
const NOTICE_HEIGHT = 20;
const RACK_EXTRA_HEIGHT = 34; // rack padding + margin above it
const ACTIONS_HEIGHT = 76; // buttons + margin above them
const FOOTER_HEIGHT = 52; // chat bar

/** Square size when the board is zoomed in. */
const ZOOMED_SQUARE = 40;

export interface GameViewProps {
  readonly game: GameState;
  /** The controller; `addWord` is only provided where words can be added (solo). */
  readonly g: GameController & { addWord?: (word: string) => void };
  readonly onQuit: () => void;
  readonly onNewGame: () => void;
  /** Optional extra line under the status (e.g. connection state online). */
  readonly notice?: string | null;
  /** Optional content under the action buttons (the chat in online games). */
  readonly footer?: ReactNode;
  /** When given, a button lets the player stop the game (online games). */
  readonly onStop?: () => void;
}

export function GameView({ game, g, onQuit, onNewGame, notice, footer, onStop }: GameViewProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const [zoomed, setZoomed] = useState(false);
  const [sheet, setSheet] = useState<'exchange' | 'history' | 'pass' | 'addWord' | 'stop' | null>(
    null,
  );
  const [gameOverDismissed, setGameOverDismissed] = useState(false);
  /** Words whose definitions are shown (empty = sheet closed). */
  const [definitionWords, setDefinitionWords] = useState<string[]>([]);

  // Sizes: everything must fit in the screen height too (small phones), so the
  // board and the rack tiles shrink when the height is short.
  const contentWidth = Math.min(width, 600);
  const tileSize = Math.min(
    52,
    Math.floor((contentWidth - 16 - 8 * 6) / 7),
    Math.floor(height * 0.075),
  );
  const reservedHeight =
    insets.top +
    insets.bottom +
    TOP_BAR_HEIGHT +
    STATUS_HEIGHT +
    (notice ? NOTICE_HEIGHT : 0) +
    tileSize +
    RACK_EXTRA_HEIGHT +
    ACTIONS_HEIGHT +
    (footer ? FOOTER_HEIGHT : 0);
  const fitSquare = Math.max(
    16,
    Math.min(
      Math.floor((contentWidth - 8) / BOARD_SIZE),
      Math.floor((height - reservedHeight) / BOARD_SIZE),
    ),
  );
  const squareSize = zoomed ? Math.max(ZOOMED_SQUARE, fitSquare) : fitSquare;
  const viewport = fitSquare * BOARD_SIZE;

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
  // Formed words missing from the dictionary: the player may add them.
  const unknownWords = g.addWord && g.evaluation?.ok ? g.evaluation.value.invalidWords : [];
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
      cursor={g.cursor}
      isFree={g.isFree}
      onSquarePress={g.pressSquare}
      onPlayedTilePress={(pos: Position) => setDefinitionWords(playedWordsAt(game.board, pos))}
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
            onPress={onQuit}
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
          {onStop && game.status === 'playing' && (
            <Button
              label=""
              accessibilityLabel="Arrêter la partie"
              icon="flag-outline"
              variant="ghost"
              compact
              onPress={() => setSheet('stop')}
            />
          )}
        </View>

        <View style={styles.statusRow}>
          {g.suggestions.length > 0 ? (
            // One tile placed: offer to complete the word with the next rack letters.
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.status}>
              {g.suggestions.map((suggestion) => (
                <Pressable
                  key={`${suggestion.direction}-${suggestion.placements.length}`}
                  onPress={() => g.applySuggestion(suggestion)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
                >
                  <Text style={styles.chipText}>
                    {suggestion.word} {suggestion.direction === 'horizontal' ? '→' : '↓'}{' '}
                    <Text style={styles.chipScore}>{suggestion.score}</Text>
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <Text style={[styles.status, { color: status.color }]} numberOfLines={2}>
              {status.text}
            </Text>
          )}
          {unknownWords.length > 0 && (
            <Button
              label="Ajouter"
              icon="add"
              variant="secondary"
              compact
              onPress={() => setSheet('addWord')}
            />
          )}
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

        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

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
            onSelect={g.pressRackTile}
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
        {footer}
      </View>

      <BlankPicker visible={g.blankPrompt !== null} onChoose={g.chooseBlankLetter} />
      <ExchangeSheet
        visible={sheet === 'exchange'}
        rack={g.me.rack}
        bagSize={game.bag.length}
        onCancel={() => setSheet(null)}
        onExchange={(ids) => {
          void g.exchange(ids).then((ok) => ok && setSheet(null));
        }}
      />
      <ConfirmSheet
        visible={sheet === 'pass'}
        title="Passer ton tour ?"
        message="Tu ne marques aucun point ce tour-ci."
        confirmLabel="Passer"
        onCancel={() => setSheet(null)}
        onConfirm={() => {
          void g.pass();
          setSheet(null);
        }}
      />
      <ConfirmSheet
        visible={sheet === 'addWord'}
        title="Ajouter au dictionnaire ?"
        message={`${unknownWords.join(', ')} ${unknownWords.length > 1 ? 'seront acceptés' : 'sera accepté'} dans tes parties. Ajoute seulement des mots sur lesquels vous êtes d'accord entre amis !`}
        confirmLabel="Ajouter"
        onCancel={() => setSheet(null)}
        onConfirm={() => {
          unknownWords.forEach((w) => g.addWord?.(w));
          setSheet(null);
        }}
      />
      <HistorySheet
        visible={sheet === 'history'}
        game={game}
        onClose={() => setSheet(null)}
        onShowWords={(words) => {
          setSheet(null);
          // Let the history window finish closing first: on iOS, a modal opened
          // while another one is being dismissed may never appear.
          setTimeout(() => setDefinitionWords(words), MODAL_SWITCH_DELAY_MS);
        }}
      />
      <DefinitionSheet words={definitionWords} onClose={() => setDefinitionWords([])} />
      <ConfirmSheet
        visible={sheet === 'stop'}
        title="Arrêter la partie ?"
        message="La partie se termine pour tout le monde, avec les scores actuels."
        confirmLabel="Arrêter"
        onCancel={() => setSheet(null)}
        onConfirm={() => {
          setSheet(null);
          onStop?.();
        }}
      />
      <GameOverSheet
        visible={game.status === 'finished' && !gameOverDismissed}
        game={game}
        meId={g.me.id}
        onClose={() => setGameOverDismissed(true)}
        onNewGame={onNewGame}
      />
    </View>
  );
}

/** The played words (2+ letters) going through `pos`, horizontally then vertically. */
function playedWordsAt(board: Board, pos: Position): string[] {
  const words: string[] = [];
  for (const [dr, dc] of [
    [0, 1],
    [1, 0],
  ] as const) {
    let r = pos.row;
    let c = pos.col;
    while (cellAt(board, { row: r - dr, col: c - dc })) [r, c] = [r - dr, c - dc];
    let word = '';
    for (
      let cell = cellAt(board, { row: r, col: c });
      cell;
      cell = cellAt(board, { row: r, col: c })
    ) {
      word += cell.letter;
      [r, c] = [r + dr, c + dc];
    }
    if (word.length >= 2) words.push(word);
  }
  return words;
}

/** The line under the scores: whose turn it is, the live score, or what is wrong. */
function statusLine(game: GameState, g: GameController) {
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
  // Online, the next player may be someone else than this device's player.
  const next = g.isMyTurn ? 'À toi !' : `À ${g.playing.name} de jouer.`;
  const last = game.history[game.history.length - 1];
  if (last) {
    const who = game.players.find((p) => p.id === last.playerId)?.name;
    const what =
      last.kind === 'play'
        ? `${who} a joué ${last.score.words[0]?.word} (${points(last.score.total)})`
        : last.kind === 'exchange'
          ? `${who} a échangé ${last.count} lettre${last.count > 1 ? 's' : ''}`
          : `${who} a passé`;
    return { text: `${what}. ${next}`, color: colors.text };
  }
  if (!g.isMyTurn) return { text: `${g.playing.name} commence la partie.`, color: colors.text };
  return { text: "À toi de jouer : pose un mot sur l'étoile.", color: colors.text };
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, alignItems: 'center' },
  column: { flex: 1, paddingHorizontal: 4 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingLeft: 6 },
  chip: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 6,
  },
  chipPressed: { opacity: 0.7 },
  chipText: { color: colors.primaryText, fontWeight: '700', fontSize: 14 },
  chipScore: { fontWeight: '400' },
  status: { flex: 1, fontSize: 14, fontWeight: '600' },
  notice: { fontSize: 13, color: colors.danger, paddingHorizontal: 6, marginBottom: 4 },
  bag: { fontSize: 13, color: colors.textMuted, marginLeft: 8 },
  boardViewport: { alignSelf: 'center', overflow: 'hidden' },
  rackArea: { marginTop: 10, alignItems: 'center' },
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
