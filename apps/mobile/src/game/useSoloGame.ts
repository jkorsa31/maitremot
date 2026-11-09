/**
 * All the interaction logic of the game screen, separated from the visuals.
 *
 * The engine only knows complete moves. While the player is composing a word,
 * the tiles they put on the board are "pending": they live here, in React
 * state, until the player taps "Jouer". This hook also:
 * - keeps the order of the rack tiles (the player can shuffle / rearrange them);
 * - computes the live score preview with `evaluateMove`;
 * - lets the computer players play when it is their turn.
 */

import {
  type GameState,
  type Letter,
  type Position,
  type Tile,
  cellAt,
  currentPlayer,
  evaluateMove,
  exchangeTiles,
  passTurn,
  playAiTurn,
  playMove,
  shuffle,
  createRng,
} from '@maitremot/engine';
import { getWords } from '@maitremot/lexicon-fr';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { moveErrorMessage } from './messages';
import { HUMAN_ID, setSoloGame } from './session';

/** A tile put on the board during the current turn, not yet played. */
export interface PendingTile {
  readonly tileId: number;
  readonly pos: Position;
  /** The letter chosen for a blank. */
  readonly letter?: Letter;
}

/** Delay before an AI plays, so the human can follow what happens. */
const AI_DELAY_MS = 700;

const samePos = (a: Position, b: Position) => a.row === b.row && a.col === b.col;

export function useSoloGame(game: GameState) {
  const words = getWords();
  const [pending, setPending] = useState<PendingTile[]>([]);
  const [rackOrder, setRackOrder] = useState<number[]>([]);
  const [selectedTileId, setSelectedTileId] = useState<number | null>(null);
  /** A blank dropped on the board, waiting for the player to choose its letter. */
  const [blankPrompt, setBlankPrompt] = useState<{ tileId: number; pos: Position } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const me = game.players.find((p) => p.id === HUMAN_ID)!;
  const playing = currentPlayer(game);
  const isMyTurn = game.status === 'playing' && playing.id === HUMAN_ID;
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

  // Computer turns.
  useEffect(() => {
    if (!aiThinking) return;
    const timer = setTimeout(() => {
      const result = playAiTurn(game, words);
      // An AI move is always legal; if not, pass rather than block the game.
      setSoloGame(result.ok ? result.value : unwrapPass(game));
    }, AI_DELAY_MS);
    return () => clearTimeout(timer);
  }, [aiThinking, game, words]);

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
    return evaluateMove(game, HUMAN_ID, pending, words);
  }, [pending, isMyTurn, game, words]);

  const isFree = useCallback(
    (pos: Position, ignoreTileId?: number) =>
      cellAt(game.board, pos) === null &&
      !pending.some((p) => p.tileId !== ignoreTileId && samePos(p.pos, pos)),
    [game.board, pending],
  );

  /** Puts a rack tile (or moves a pending tile) on a free square. */
  const placeTile = useCallback(
    (tileId: number, pos: Position, letter?: Letter) => {
      if (!isMyTurn || !isFree(pos, tileId)) return;
      const tile = tileById.get(tileId);
      if (!tile) return;
      const existing = pending.find((p) => p.tileId === tileId);
      const chosen = letter ?? existing?.letter;
      if (tile.letter === null && !chosen) {
        setBlankPrompt({ tileId, pos });
        return;
      }
      const placed: PendingTile =
        chosen && tile.letter === null ? { tileId, pos, letter: chosen } : { tileId, pos };
      setPending((list) => [...list.filter((p) => p.tileId !== tileId), placed]);
      setSelectedTileId(null);
      setError(null);
    },
    [isMyTurn, isFree, tileById, pending],
  );

  // The rack order also contains the tiles currently on the board (so they go
  // back to their old slot when recalled). A ref gives callbacks the latest list.
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  /** Moves a tile so it becomes the `index`-th of the visible rack tiles. */
  const moveInRack = useCallback((tileId: number, index: number) => {
    setRackOrder((order) => {
      const onBoard = new Set(pendingRef.current.map((p) => p.tileId));
      const without = order.filter((id) => id !== tileId);
      const visible = without.filter((id) => !onBoard.has(id));
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
    setError(null);
  }, []);

  const shuffleRack = useCallback(() => {
    setRackOrder((order) => shuffle(order, createRng(Date.now())));
  }, []);

  const selectTile = useCallback((tileId: number) => {
    setSelectedTileId((current) => (current === tileId ? null : tileId));
  }, []);

  /** Tap on a square: place the selected tile, or take a pending tile back. */
  const pressSquare = useCallback(
    (pos: Position) => {
      const pendingHere = pending.find((p) => samePos(p.pos, pos));
      if (pendingHere) {
        returnToRack(pendingHere.tileId);
        return;
      }
      if (selectedTileId !== null) placeTile(selectedTileId, pos);
    },
    [pending, selectedTileId, placeTile, returnToRack],
  );

  const chooseBlankLetter = useCallback(
    (letter: Letter | null) => {
      if (blankPrompt && letter) placeTile(blankPrompt.tileId, blankPrompt.pos, letter);
      setBlankPrompt(null);
    },
    [blankPrompt, placeTile],
  );

  const play = useCallback(() => {
    const result = playMove(game, HUMAN_ID, pending, words);
    if (!result.ok) {
      setError(moveErrorMessage(result.error));
      return;
    }
    setPending([]);
    setError(null);
    setSoloGame(result.value);
  }, [game, pending, words]);

  const exchange = useCallback(
    (tileIds: readonly number[]) => {
      const result = exchangeTiles(game, HUMAN_ID, tileIds);
      if (!result.ok) {
        setError(moveErrorMessage(result.error));
        return false;
      }
      setPending([]);
      setError(null);
      setSoloGame(result.value);
      return true;
    },
    [game],
  );

  const pass = useCallback(() => {
    const result = passTurn(game, HUMAN_ID);
    if (result.ok) {
      setPending([]);
      setSoloGame(result.value);
    }
  }, [game]);

  return {
    me,
    isMyTurn,
    aiThinking,
    playing,
    rack,
    pending,
    selectedTileId,
    blankPrompt,
    error,
    evaluation,
    tileById,
    placeTile,
    returnToRack,
    moveInRack,
    recall,
    shuffleRack,
    selectTile,
    pressSquare,
    chooseBlankLetter,
    play,
    exchange,
    pass,
  };
}

function unwrapPass(game: GameState): GameState {
  const result = passTurn(game, currentPlayer(game).id);
  return result.ok ? result.value : game;
}
