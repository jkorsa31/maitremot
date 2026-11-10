/**
 * Solo game screen: the shared game view driven by the solo controller.
 */

import type { GameState } from '@maitremot/engine';
import { Redirect, router } from 'expo-router';
import { DragProvider } from '../components/DragLayer';
import { GameView } from '../components/GameView';
import { useSoloGameState } from '../game/session';
import { useSoloGame } from '../game/useSoloGame';

export default function GameScreen() {
  const game = useSoloGameState();
  if (!game) return <Redirect href="/" />;
  return (
    <DragProvider>
      <SoloGame game={game} />
    </DragProvider>
  );
}

function SoloGame({ game }: { game: GameState }) {
  const g = useSoloGame(game);
  return (
    <GameView
      game={game}
      g={g}
      onQuit={() => router.back()}
      onNewGame={() => router.replace('/')}
    />
  );
}
