/**
 * Online hub: sign-in, profile and friend code, friends, new game, and the
 * list of games (invitations, waiting, in progress, finished), all refreshed
 * in real time.
 */

import { router } from 'expo-router';
import { type ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Button } from '../../components/Button';
import { ConfirmSheet } from '../../components/Sheets';
import { errorMessage } from '../../game/messages';
import {
  type GameSummary,
  type Profile,
  addFriend,
  callGame,
  useFriends,
  useMyGames,
  useProfile,
} from '../../online/api';
import { signOut, useSession } from '../../online/auth';
import { ProfileSetup, SignIn, cardStyles } from '../../online/SignIn';
import { colors, radius } from '../../ui/theme';

export default function OnlineScreen() {
  const session = useSession();
  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {session === undefined ? (
        <ActivityIndicator color={colors.primary} />
      ) : session === null ? (
        <SignIn />
      ) : (
        <SignedIn userId={session.user.id} />
      )}
    </ScrollView>
  );
}

function SignedIn({ userId }: { userId: string }) {
  const profile = useProfile(userId);
  if (profile.data === undefined) return <ActivityIndicator color={colors.primary} />;
  if (profile.data === null) return <ProfileSetup onDone={profile.reload} />;
  return <Hub me={profile.data} />;
}

function Hub({ me }: { me: Profile }) {
  const friends = useFriends(me.id);
  const games = useMyGames(me.id);
  const [message, setMessage] = useState<string | null>(null);
  /** Game waiting for the "stop?" confirmation. */
  const [stopping, setStopping] = useState<string | null>(null);

  const act = async (call: Parameters<typeof callGame>[0]) => {
    setMessage(null);
    const result = await callGame(call);
    if (!result.ok) setMessage(errorMessage(result.error));
    games.reload();
    return result;
  };

  const list = games.data ?? [];
  const invitations = list.filter((g) => g.status === 'lobby' && g.myStatus === 'invited');
  const waiting = list.filter((g) => g.status === 'lobby' && g.myStatus === 'joined');
  const playing = list.filter((g) => g.status === 'playing' && g.myStatus === 'joined');
  const finished = list
    .filter((g) => g.status === 'finished' && g.myStatus === 'joined')
    .slice(0, 10);

  return (
    <>
      {message && <Text style={cardStyles.error}>{message}</Text>}

      {invitations.length > 0 && (
        <Section title="Invitations">
          {invitations.map((g) => (
            <View key={g.id} style={styles.row}>
              <Text style={styles.rowText}>
                {nameOf(g, g.createdBy)} t'invite
                {g.players.length > 2 ? ` avec ${others(g, [me.id, g.createdBy])}` : ''}
              </Text>
              <Button
                label="Refuser"
                variant="secondary"
                compact
                onPress={() => void act({ action: 'respond', gameId: g.id, accept: false })}
              />
              <Button
                label="Accepter"
                compact
                onPress={() => void act({ action: 'respond', gameId: g.id, accept: true })}
              />
            </View>
          ))}
        </Section>
      )}

      {playing.length > 0 && (
        <Section title="Parties en cours">
          {playing.map((g) => {
            const state = g.publicState;
            const turn = state ? state.players[state.currentPlayerIndex] : undefined;
            const myTurn = turn?.id === me.id;
            return (
              <Pressable
                key={g.id}
                onPress={() => router.push(`/online/${g.id}`)}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <View style={styles.rowText}>
                  <Text style={styles.strong}>
                    {state?.players.map((p) => `${p.name} ${p.score}`).join(' · ')}
                  </Text>
                  <Text style={myTurn ? styles.myTurn : styles.muted}>
                    {myTurn ? 'À toi de jouer !' : `Au tour de ${turn?.name ?? '…'}`}
                  </Text>
                </View>
                <Button
                  label="Arrêter"
                  icon="flag-outline"
                  variant="ghost"
                  compact
                  onPress={() => setStopping(g.id)}
                />
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            );
          })}
        </Section>
      )}
      <ConfirmSheet
        visible={stopping !== null}
        title="Arrêter la partie ?"
        message="La partie se termine pour tout le monde, avec les scores actuels."
        confirmLabel="Arrêter"
        onCancel={() => setStopping(null)}
        onConfirm={() => {
          const gameId = stopping;
          setStopping(null);
          if (gameId) void act({ action: 'stop', gameId });
        }}
      />

      {waiting.length > 0 && (
        <Section title="En attente des amis">
          {waiting.map((g) => (
            <View key={g.id} style={styles.row}>
              <Text style={styles.rowText}>
                {g.players
                  .map(
                    (p) =>
                      `${p.name}${p.status === 'joined' ? ' ✓' : p.status === 'declined' ? ' ✗' : ' …'}`,
                  )
                  .join(', ')}
              </Text>
              {g.createdBy === me.id && (
                <>
                  <Button
                    label="Annuler"
                    variant="secondary"
                    compact
                    onPress={() => void act({ action: 'cancel', gameId: g.id })}
                  />
                  {g.players.filter((p) => p.status === 'joined').length >= 2 && (
                    <Button
                      label="Lancer"
                      compact
                      onPress={() => void act({ action: 'start', gameId: g.id })}
                    />
                  )}
                </>
              )}
            </View>
          ))}
        </Section>
      )}

      <NewGame
        friends={friends.data ?? []}
        onCreate={(ids) => act({ action: 'create', friendIds: ids })}
      />

      <FriendsCard me={me} friends={friends.data ?? []} onAdded={friends.reload} />

      {finished.length > 0 && (
        <Section title="Parties terminées">
          {finished.map((g) => {
            const ranked = [...(g.publicState?.players ?? [])].sort((a, b) => b.score - a.score);
            return (
              <Pressable
                key={g.id}
                onPress={() => router.push(`/online/${g.id}`)}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <Text style={styles.rowText}>
                  {ranked.map((p, i) => `${i === 0 ? '🏆 ' : ''}${p.name} ${p.score}`).join(' · ')}
                  {g.publicState?.end?.reason === 'stopped' ? ' (arrêtée)' : ''}
                </Text>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            );
          })}
        </Section>
      )}

      <Button label="Se déconnecter" variant="ghost" onPress={() => void signOut()} />
    </>
  );
}

function NewGame(props: {
  friends: readonly Profile[];
  onCreate: (ids: string[]) => Promise<{ ok: boolean }>;
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  if (props.friends.length === 0) return null;
  const toggle = (id: string) =>
    setChosen((list) =>
      list.includes(id) ? list.filter((x) => x !== id) : list.length < 3 ? [...list, id] : list,
    );
  return (
    <Section title="Nouvelle partie">
      <Text style={styles.muted}>Choisis 1 à 3 amis à inviter :</Text>
      <View style={styles.chips}>
        {props.friends.map((f) => {
          const selected = chosen.includes(f.id);
          return (
            <Pressable
              key={f.id}
              onPress={() => toggle(f.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {f.display_name}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Button
        label={busy ? 'Envoi…' : 'Inviter'}
        icon="send"
        disabled={busy || chosen.length === 0}
        onPress={async () => {
          setBusy(true);
          const result = await props.onCreate(chosen);
          setBusy(false);
          if (result.ok) setChosen([]);
        }}
      />
    </Section>
  );
}

function FriendsCard(props: { me: Profile; friends: readonly Profile[]; onAdded: () => void }) {
  const [code, setCode] = useState('');
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <Section title="Amis">
      <Text style={styles.muted}>
        Ton code ami (connecté en tant que {props.me.display_name}) :
      </Text>
      <View style={styles.row}>
        <Text style={styles.friendCode} selectable>
          {props.me.friend_code}
        </Text>
        <Button
          label="Partager"
          icon="share-outline"
          variant="secondary"
          compact
          onPress={() =>
            void Share.share({
              message: `Joue avec moi à MaitreMot ! Mon code ami : ${props.me.friend_code}`,
            }).catch(() => undefined)
          }
        />
      </View>
      {props.friends.length > 0 && (
        <Text style={styles.strong}>{props.friends.map((f) => f.display_name).join(', ')}</Text>
      )}
      <View style={styles.row}>
        <TextInput
          style={[cardStyles.input, styles.codeInput]}
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase().slice(0, 6))}
          placeholder="Code d'un ami"
          autoCapitalize="characters"
          autoCorrect={false}
        />
        <Button
          label="Ajouter"
          compact
          disabled={code.length !== 6}
          onPress={async () => {
            const result = await addFriend(code);
            if (typeof result === 'string') setFeedback({ ok: false, text: result });
            else {
              setFeedback({ ok: true, text: `${result.display_name} est maintenant ton ami.` });
              setCode('');
              props.onAdded();
            }
          }}
        />
      </View>
      {feedback && (
        <Text style={feedback.ok ? styles.success : cardStyles.error}>{feedback.text}</Text>
      )}
    </Section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={cardStyles.card}>
      <Text style={cardStyles.title}>{title}</Text>
      {children}
    </View>
  );
}

const nameOf = (g: GameSummary, id: string) => g.players.find((p) => p.id === id)?.name ?? '?';
const others = (g: GameSummary, exclude: string[]) =>
  g.players
    .filter((p) => !exclude.includes(p.id))
    .map((p) => p.name)
    .join(', ');

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16, maxWidth: 520, width: '100%', alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  rowText: { flex: 1 },
  // minWidth 0 lets the field shrink next to its button (web inputs have a default width).
  codeInput: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.6 },
  strong: { fontWeight: '600', color: colors.text },
  muted: { color: colors.textMuted },
  myTurn: { color: colors.primary, fontWeight: '700' },
  chevron: { fontSize: 24, color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.medium,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontWeight: '600', color: colors.text },
  chipTextSelected: { color: colors.primaryText },
  friendCode: { flex: 1, fontSize: 28, fontWeight: '800', letterSpacing: 4, color: colors.text },
  success: { color: colors.primary, fontWeight: '600' },
});
