/**
 * All the interaction logic of the game screen, separated from the visuals,
 * shared by solo and online games.
 *
 * The engine only knows complete moves. While the player is composing a word,
 * the tiles they put on the board are "pending": they live here, in React
 * state, until the player taps "Jouer". This hook also:
 * - keeps the order of the rack tiles (the player can shuffle / rearrange them);
 * - computes the live score preview with `evaluateMove`;
 * - manages the typing cursor: tap an empty square (→, tap again for ↓), then
 *   tap rack tiles, they are placed one after the other;
 * - suggests how to complete a word: after placing ONE tile, the letters that
 *   follow it on the rack are tried in both directions and the valid words
 *   are offered ("MAISON →", "MAIS ↓");
 * - sends the finished move through `actions`: applied locally by the engine
 *   in solo (useSoloGame.ts), sent to the server in online games.
 */

import {
  BOARD_SIZE,
  type Direction,
  type GameState,
  type Letter,
  type Position,
  type Tile,
  cellAt,
  createRng,
  type MoveError,
  type WordList,
  currentPlayer,
  evaluateMove,
  shuffle,
} from '@maitremot/engine';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { moveErrorMessage } from './messages';

/** A tile put on the board during the current turn, not yet played. */
export interface PendingTile {
  readonly tileId: number;
  readonly pos: Position;
  /** The letter chosen for a blank. */
  readonly letter?: Letter;
}

/** Where the next tapped rack tile goes, and in which direction the cursor then moves. */
export interface Cursor {
  readonly pos: Position;
  readonly direction: Direction;
}

/** A way to complete the word started on the board with the next rack letters. */
export interface Suggestion {
  readonly word: string;
  readonly direction: Direction;
  readonly score: number;
  readonly placements: readonly PendingTile[];
}

const MAX_SUGGESTIONS = 4;

/**
 * What happens when the player plays, exchanges or passes. Each returns null
 * on success or the engine's error; it may be async (online games).
 */
export interface GameActions {
  play(placements: readonly PendingTile[]): MoveError | null | Promise<MoveError | null>;
  exchange(tileIds: readonly number[]): MoveError | null | Promise<MoveError | null>;
  pass(): MoveError | null | Promise<MoveError | null>;
}

export interface ControllerOptions {
  /** Id of the player using this device. */
  readonly meId: string;
  /** Dictionary used for the score preview and the suggestions. */
  readonly dictionary: WordList;
  /** Changes when the dictionary changes (words added), to refresh the preview. */
  readonly dictionaryVersion?: number;
  readonly actions: GameActions;
}

/** A server error (network…) as shown to the player. */
const NETWORK_ERROR = 'Connexion au serveur impossible. Réessaie.';

const samePos = (a: Position, b: Position) => a.row === b.row && a.col === b.col;
const onBoard = (p: Position) =>
  p.row >= 0 && p.row < BOARD_SIZE && p.col >= 0 && p.col < BOARD_SIZE;
const step = (p: Position, direction: Direction): Position =>
  direction === 'horizontal' ? { row: p.row, col: p.col + 1 } : { row: p.row + 1, col: p.col };

export function useGameController(game: GameState, options: ControllerOptions) {
  const { meId, dictionary, dictionaryVersion = 0, actions } = options;
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  /** True while a move is being sent (online). */
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingTile[]>([]);
  const [rackOrder, setRackOrder] = useState<number[]>([]);
  const [selectedTileId, setSelectedTileId] = useState<number | null>(null);
  const [cursor, setCursor] = useState<Cursor | null>(null);
  /** A blank put on the board, waiting for the player to choose its letter. */
  const [blankPrompt, setBlankPrompt] = useState<{
    tileId: number;
    pos: Position;
    fromCursor: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const me = game.players.find((p) => p.id === meId)!;
  const playing = currentPlayer(game);
  const isMyTurn = game.status === 'playing' && playing.id === meId && !busy;
  const aiThinking = game.status === 'playing' && playing.kind === 'ai';

  // Keep the rack order in sync with the actual rack: keep the tiles still
  // there in their current order, and append the newly drawn ones.
  const rackIds = me.rack.map((t) => t.id).join(',');
  useEffect(() => {
    setRackOrder((order) => {
      const ids = new Set(me.rack.map((t) => t.id));
      const kept = order.filter((id) => ids.has(id));
      const added = me.rack.map((t) => t.id).filter((id) => !kept.includes(id));
      return [...kept, ...added];
    });
  }, [rackIds]); // rackIds summarizes me.rack

  // The cursor only makes sense during our turn.
  useEffect(() => {
    if (!isMyTurn) setCursor(null);
  }, [isMyTurn]);

  const tileById = useMemo(() => new Map(me.rack.map((t) => [t.id, t])), [me.rack]);
  const pendingIds = new Set(pending.map((p) => p.tileId));
  /** Rack tiles not on the board, in display order. */
  const rack: Tile[] = rackOrder
    .filter((id) => !pendingIds.has(id))
    .map((id) => tileById.get(id))
    .filter((t): t is Tile => t !== undefined);

  /** Live evaluation of the word being composed. */
  const evaluation = useMemo(() => {
    if (pending.length === 0 || !isMyTurn) return null;
    return evaluateMove(game, meId, pending, dictionary);
    // dictionaryVersion: re-evaluate when a word is added to the dictionary.
  }, [pending, isMyTurn, game, dictionaryVersion]);

  /** Valid words formed by continuing the single placed tile with the next rack letters. */
  const suggestions = useMemo((): Suggestion[] => {
    if (!isMyTurn || pending.length !== 1) return [];
    const first = pending[0]!;
    const following = rackOrder
      .slice(rackOrder.indexOf(first.tileId) + 1)
      .map((id) => tileById.get(id))
      .filter((t): t is Tile => t !== undefined);

    const found: Suggestion[] = [];
    for (const direction of ['horizontal', 'vertical'] as const) {
      const placements: PendingTile[] = [first];
      let pos = first.pos;
      for (const tile of following) {
        if (tile.letter === null) break; // a blank needs a letter choice: stop there
        // Next free square, jumping over the tiles already on the board.
        do pos = step(pos, direction);
        while (onBoard(pos) && cellAt(game.board, pos) !== null);
        if (!onBoard(pos)) break;
        placements.push({ tileId: tile.id, pos });
        const result = evaluateMove(game, meId, placements, dictionary);
        if (result.ok && result.value.invalidWords.length === 0) {
          const main = result.value.words.find((w) => w.direction === direction);
          found.push({
            word: main?.word ?? result.value.words[0]!.word,
            direction,
            score: result.value.score.total,
            placements: [...placements],
          });
        }
      }
    }
    // Longest words first: they are usually what the player prepared on the rack.
    return found
      .sort((a, b) => b.placements.length - a.placements.length || b.score - a.score)
      .slice(0, MAX_SUGGESTIONS);
  }, [isMyTurn, pending, rackOrder, tileById, game, dictionaryVersion]);

  /** Is `pos` free (no played tile, no pending tile other than `ignoreTileId`)? */
  const isFree = useCallback(
    (pos: Position, ignoreTileId?: number, list: readonly PendingTile[] = pending) =>
      onBoard(pos) &&
      cellAt(game.board, pos) === null &&
      !list.some((p) => p.tileId !== ignoreTileId && samePos(p.pos, pos)),
    [game.board, pending],
  );

  /**
   * Puts a rack tile (or moves a pending tile) on a free square.
   * Returns the new pending list, or null if nothing was placed (occupied
   * square, or a blank waiting for its letter).
   */
  const put = useCallback(
    (tileId: number, pos: Position, letter?: Letter, fromCursor = false): PendingTile[] | null => {
      if (!isMyTurn || !isFree(pos, tileId)) return null;
      const tile = tileById.get(tileId);
      if (!tile) return null;
      const existing = pending.find((p) => p.tileId === tileId);
      const chosen = letter ?? existing?.letter;
      if (tile.letter === null && !chosen) {
        setBlankPrompt({ tileId, pos, fromCursor });
        return null;
      }
      const placed: PendingTile =
        chosen && tile.letter === null ? { tileId, pos, letter: chosen } : { tileId, pos };
      const next = [...pending.filter((p) => p.tileId !== tileId), placed];
      setPending(next);
      setSelectedTileId(null);
      setError(null);
      return next;
    },
    [isMyTurn, isFree, tileById, pending],
  );

  /** Moves the cursor after `from`, skipping occupied squares (or removes it at the edge). */
  const advanceCursor = useCallback(
    (from: Position, direction: Direction, list: readonly PendingTile[]) => {
      let pos = step(from, direction);
      while (onBoard(pos) && !isFree(pos, undefined, list)) pos = step(pos, direction);
      setCursor(onBoard(pos) ? { pos, direction } : null);
    },
    [isFree],
  );

  /** Drag & drop or tap-to-place: puts the tile and forgets the cursor. */
  const placeTile = useCallback(
    (tileId: number, pos: Position) => {
      if (put(tileId, pos)) setCursor(null);
    },
    [put],
  );

  // The rack order also contains the tiles currently on the board (so they go
  // back to their old slot when recalled). A ref gives callbacks the latest list.
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  /** Moves a tile so it becomes the `index`-th of the visible rack tiles. */
  const moveInRack = useCallback((tileId: number, index: number) => {
    setRackOrder((order) => {
      const onBoardIds = new Set(pendingRef.current.map((p) => p.tileId));
      const without = order.filter((id) => id !== tileId);
      const visible = without.filter((id) => !onBoardIds.has(id));
      const before = visible[index];
      const at = before === undefined ? without.length : without.indexOf(before);
      without.splice(at, 0, tileId);
      return without;
    });
  }, []);

  /** Takes a pending tile back to the rack, optionally at a given position. */
  const returnToRack = useCallback(
    (tileId: number, index?: number) => {
      setPending((list) => list.filter((p) => p.tileId !== tileId));
      if (index !== undefined) moveInRack(tileId, index);
      setError(null);
    },
    [moveInRack],
  );

  const recall = useCallback(() => {
    setPending([]);
    setCursor(null);
    setError(null);
  }, []);

  const shuffleRack = useCallback(() => {
    setRackOrder((order) => shuffle(order, createRng(Date.now())));
  }, []);

  /** Tap on a rack tile: typed at the cursor if there is one, otherwise selected. */
  const pressRackTile = useCallback(
    (tileId: number) => {
      if (cursor && isMyTurn) {
        const next = put(tileId, cursor.pos, undefined, true);
        if (next) advanceCursor(cursor.pos, cursor.direction, next);
        return;
      }
      setSelectedTileId((current) => (current === tileId ? null : tileId));
    },
    [cursor, isMyTurn, put, advanceCursor],
  );

  /**
   * Tap on a square:
   * - pending tile → back to the rack;
   * - a rack tile is selected → place it there;
   * - empty square → cursor → ; same square again → ↓ ; once more → no cursor.
   */
  const pressSquare = useCallback(
    (pos: Position) => {
      const pendingHere = pending.find((p) => samePos(p.pos, pos));
      if (pendingHere) {
        returnToRack(pendingHere.tileId);
        return;
      }
      if (selectedTileId !== null) {
        placeTile(selectedTileId, pos);
        return;
      }
      if (!isMyTurn || !isFree(pos)) return;
      setCursor((current) => {
        if (!current || !samePos(current.pos, pos)) return { pos, direction: 'horizontal' };
        return current.direction === 'horizontal' ? { pos, direction: 'vertical' } : null;
      });
    },
    [pending, selectedTileId, isMyTurn, isFree, placeTile, returnToRack],
  );

  const chooseBlankLetter = useCallback(
    (letter: Letter | null) => {
      const prompt = blankPrompt;
      setBlankPrompt(null);
      if (!prompt || !letter) return;
      const next = put(prompt.tileId, prompt.pos, letter);
      if (next && prompt.fromCursor && cursor) advanceCursor(prompt.pos, cursor.direction, next);
      else if (next) setCursor(null);
    },
    [blankPrompt, put, cursor, advanceCursor],
  );

  const applySuggestion = useCallback((suggestion: Suggestion) => {
    setPending([...suggestion.placements]);
    setCursor(null);
    setError(null);
  }, []);

  /**
   * Runs an action. On success the turn is over: the pending tiles are
   * cleared (the new game state arrives from the caller's store). Returns
   * whether it succeeded.
   */
  const run = useCallback(
    async (action: () => MoveError | null | Promise<MoveError | null>): Promise<boolean> => {
      setBusy(true);
      try {
        const error = await action();
        if (error) {
          setError(moveErrorMessage(error));
          return false;
        }
        setPending([]);
        setCursor(null);
        setError(null);
        return true;
      } catch {
        setError(NETWORK_ERROR);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const play = useCallback(() => run(() => actionsRef.current.play(pending)), [run, pending]);
  const exchange = useCallback(
    (tileIds: readonly number[]) => run(() => actionsRef.current.exchange(tileIds)),
    [run],
  );
  const pass = useCallback(() => run(() => actionsRef.current.pass()), [run]);

  /** Clears the error message (e.g. after adding a word to the dictionary). */
  const clearError = useCallback(() => setError(null), []);

  return {
    me,
    isMyTurn,
    aiThinking,
    playing,
    rack,
    pending,
    selectedTileId,
    cursor,
    blankPrompt,
    error,
    evaluation,
    suggestions,
    tileById,
    isFree,
    placeTile,
    returnToRack,
    moveInRack,
    recall,
    shuffleRack,
    pressRackTile,
    pressSquare,
    chooseBlankLetter,
    applySuggestion,
    clearError,
    busy,
    play,
    exchange,
    pass,
  };
}

export type GameController = ReturnType<typeof useGameController>;
