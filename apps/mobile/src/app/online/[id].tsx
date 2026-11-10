/**
 * Online game screen: the shared game view, fed by the server.
 */

import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { GameState } from '@maitremot/engine';
import { Button } from '../../components/Button';
import { DragProvider } from '../../components/DragLayer';
import { GameView } from '../../components/GameView';
import { useSession } from '../../online/auth';
import { useOnlineController, useOnlineGame } from '../../online/useOnlineGame';
import { colors } from '../../ui/theme';

export default function OnlineGameScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const session = useSession();
  if (session === undefined)
    return (
      <Centered>
        <ActivityIndicator color={colors.primary} />
      </Centered>
    );
  if (!session || !id) return <NotAvailable />;
  return <Loader gameId={id} userId={session.user.id} />;
}

function Loader({ gameId, userId }: { gameId: string; userId: string }) {
  const { game, status, offline, reload } = useOnlineGame(gameId, userId);
  if (!game) {
    if (offline) return <NotAvailable text="Connexion au serveur impossible." />;
    if (status === null || status === 'lobby') {
      return status === 'lobby' ? (
        <NotAvailable text="La partie n'a pas encore commencé." />
      ) : (
        <Centered>
          <ActivityIndicator color={colors.primary} />
        </Centered>
      );
    }
    return <NotAvailable />;
  }
  return (
    <DragProvider>
      <OnlineGame gameId={gameId} userId={userId} game={game} offline={offline} reload={reload} />
    </DragProvider>
  );
}

function OnlineGame(props: {
  gameId: string;
  userId: string;
  game: GameState;
  offline: boolean;
  reload: () => Promise<void>;
}) {
  const g = useOnlineController(props.gameId, props.userId, props.game, props.reload);
  return (
    <GameView
      game={props.game}
      g={g}
      notice={props.offline ? 'Hors ligne : reconnexion en cours…' : null}
      onQuit={() => (router.canGoBack() ? router.back() : router.replace('/online'))}
      onNewGame={() => router.replace('/online')}
    />
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

function NotAvailable({ text = 'Partie introuvable.' }: { text?: string }) {
  return (
    <Centered>
      <Text style={styles.text}>{text}</Text>
      <Button label="Retour" onPress={() => router.replace('/online')} />
    </Centered>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    backgroundColor: colors.background,
    padding: 24,
  },
  text: { fontSize: 16, color: colors.text, textAlign: 'center' },
});
