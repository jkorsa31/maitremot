/**
 * Chat of an online game, at the bottom of the game screen.
 *
 * Folded, it is a thin bar showing the last message and the number of unread
 * messages, so the board keeps its room. Tapped, it opens a panel with the
 * conversation and a text field that stays above the keyboard. (Audio and
 * video calls will be added to this bar later.)
 */

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type ChatMessage, MAX_MESSAGE_LENGTH } from '../online/useChat';
import { colors, radius } from '../ui/theme';

interface Props {
  readonly messages: readonly ChatMessage[];
  readonly meId: string;
  /** Display names by player id. */
  readonly names: ReadonlyMap<string, string>;
  readonly unread: number;
  readonly onSend: (text: string) => Promise<boolean>;
  readonly onRead: () => void;
}

export function ChatBar(props: Props) {
  const [open, setOpen] = useState(false);
  const last = props.messages[props.messages.length - 1];
  const author = (id: string) => (id === props.meId ? 'Moi' : (props.names.get(id) ?? '?'));

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`Discussion${props.unread > 0 ? `, ${props.unread} non lus` : ''}`}
        style={({ pressed }) => [styles.bar, pressed && styles.pressed]}
      >
        <Ionicons name="chatbubbles-outline" size={20} color={colors.primary} />
        <Text style={styles.barText} numberOfLines={1}>
          {last ? `${author(last.userId)} : ${last.body}` : 'Discussion : écris à tes adversaires'}
        </Text>
        {props.unread > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{props.unread}</Text>
          </View>
        )}
      </Pressable>
      {open && <ChatPanel {...props} author={author} onClose={() => setOpen(false)} />}
    </>
  );
}

function ChatPanel(props: Props & { author: (id: string) => string; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const list = useRef<FlatList<ChatMessage>>(null);
  const { onRead, messages } = props;

  // While the panel is open, everything is read.
  useEffect(() => onRead(), [messages, onRead]);

  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    const ok = await props.onSend(text);
    setSending(false);
    setFailed(!ok);
    if (ok) setText('');
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={props.onClose}>
      <KeyboardAvoidingView
        style={styles.modal}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.backdrop} onPress={props.onClose} accessibilityLabel="Fermer" />
        <View style={[styles.panel, { paddingBottom: insets.bottom + 8 }]}>
          <View style={styles.header}>
            <Text style={styles.title}>Discussion</Text>
            <Pressable
              onPress={props.onClose}
              accessibilityRole="button"
              accessibilityLabel="Fermer"
            >
              <Ionicons name="chevron-down" size={26} color={colors.text} />
            </Pressable>
          </View>
          <FlatList
            ref={list}
            data={messages as ChatMessage[]}
            keyExtractor={(m) => String(m.id)}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={<Text style={styles.empty}>Pas encore de message.</Text>}
            renderItem={({ item }) => {
              const mine = item.userId === props.meId;
              return (
                <View style={[styles.message, mine ? styles.mine : styles.theirs]}>
                  {!mine && <Text style={styles.author}>{props.author(item.userId)}</Text>}
                  <Text style={[styles.body, mine && styles.mineText]}>{item.body}</Text>
                  <Text style={[styles.time, mine && styles.mineText]}>
                    {new Date(item.createdAt).toLocaleTimeString('fr-FR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              );
            }}
          />
          {failed && <Text style={styles.error}>Message non envoyé. Réessaie.</Text>}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder="Ton message…"
              maxLength={MAX_MESSAGE_LENGTH}
              onSubmitEditing={() => void send()}
              returnKeyType="send"
              submitBehavior="submit"
              autoFocus
            />
            <Pressable
              onPress={() => void send()}
              disabled={!text.trim() || sending}
              accessibilityRole="button"
              accessibilityLabel="Envoyer"
              style={[styles.send, (!text.trim() || sending) && styles.disabled]}
            >
              <Ionicons name="send" size={20} color={colors.primaryText} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    marginHorizontal: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.medium,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.7 },
  barText: { flex: 1, color: colors.text, fontSize: 14 },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  modal: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' },
  panel: {
    height: '60%',
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.large,
    borderTopRightRadius: radius.large,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 6,
  },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  list: { flex: 1 },
  listContent: { gap: 6, paddingVertical: 6 },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 24 },
  message: {
    maxWidth: '80%',
    borderRadius: radius.medium,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.primary },
  theirs: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  author: { fontSize: 12, fontWeight: '700', color: colors.primary, marginBottom: 2 },
  body: { fontSize: 15, color: colors.text },
  mineText: { color: colors.primaryText },
  time: { fontSize: 10, color: colors.textMuted, alignSelf: 'flex-end', marginTop: 2 },
  error: { color: colors.danger, marginBottom: 4 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 6 },
  input: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.medium,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.4 },
});
