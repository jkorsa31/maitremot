/**
 * Solo game: the generic game controller, with moves applied locally by the
 * engine, computer players playing their turns, and words that the player can
 * add to the dictionary.
 */

import {
  type GameState,
  type MoveError,
  type Result,
  currentPlayer,
  exchangeTiles,
  passTurn,
  playAiTurn,
  playMove,
} from '@maitremot/engine';
import { getWords } from '@maitremot/lexicon-fr';
import { useCallback, useEffect, useMemo } from 'react';
import { addHouseWord, playerWords, useHouseWordsVersion } from './houseWords';
import { HUMAN_ID, setSoloGame } from './session';
import { type GameActions, useGameController } from './useGameController';

/** Delay before an AI plays, so the human can follow what happens. */
const AI_DELAY_MS = 700;

export function useSoloGame(game: GameState) {
  const words = getWords();
  const houseVersion = useHouseWordsVersion();

  // Engine actions: apply the move and save the new state.
  const actions = useMemo<GameActions>(() => {
    const apply = (result: Result<GameState, MoveError>) => {
      if (!result.ok) return result.error;
      setSoloGame(result.value);
      return null;
    };
    return {
      play: (placements) => apply(playMove(game, HUMAN_ID, placements, playerWords)),
      exchange: (tileIds) => apply(exchangeTiles(game, HUMAN_ID, tileIds)),
      pass: () => apply(passTurn(game, HUMAN_ID)),
    };
  }, [game]);

  const controller = useGameController(game, {
    meId: HUMAN_ID,
    dictionary: playerWords,
    dictionaryVersion: houseVersion,
    actions,
  });

  // Computer turns.
  const aiThinking = controller.aiThinking;
  useEffect(() => {
    if (!aiThinking) return;
    const timer = setTimeout(() => {
      const result = playAiTurn(game, words);
      // An AI move is always legal; if not, pass rather than block the game.
      if (result.ok) setSoloGame(result.value);
      else {
        const passed = passTurn(game, currentPlayer(game).id);
        if (passed.ok) setSoloGame(passed.value);
      }
    }, AI_DELAY_MS);
    return () => clearTimeout(timer);
  }, [aiThinking, game, words]);

  const { clearError } = controller;
  const addWord = useCallback(
    (word: string) => {
      addHouseWord(word);
      clearError();
    },
    [clearError],
  );

  return { ...controller, addWord };
}
