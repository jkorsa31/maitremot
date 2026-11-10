/**
 * Text chat of an online game: the last messages, new ones pushed in real
 * time, sending, and the number of messages not read yet.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

export interface ChatMessage {
  readonly id: number;
  readonly userId: string;
  readonly body: string;
  readonly createdAt: string;
}

const HISTORY = 100;
export const MAX_MESSAGE_LENGTH = 500;

interface Row {
  id: number;
  user_id: string;
  body: string;
  created_at: string;
}
const toMessage = (r: Row): ChatMessage => ({
  id: r.id,
  userId: r.user_id,
  body: r.body,
  createdAt: r.created_at,
});

export function useChat(gameId: string, userId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  /** Id of the last message seen by the player (when the chat panel was open). */
  const [lastSeenId, setLastSeenId] = useState<number | null>(null);
  const loadedRef = useRef(false);

  /** Adds messages, without duplicates, sorted by id. */
  const merge = useCallback((incoming: ChatMessage[]) => {
    setMessages((current) => {
      const byId = new Map(current.map((m) => [m.id, m]));
      for (const m of incoming) byId.set(m.id, m);
      return [...byId.values()].sort((a, b) => a.id - b.id).slice(-HISTORY);
    });
  }, []);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('messages')
      .select('id, user_id, body, created_at')
      .eq('game_id', gameId)
      .order('id', { ascending: false })
      .limit(HISTORY);
    if (!data) return;
    const loaded = (data as Row[]).map(toMessage);
    merge(loaded);
    // Messages already there when opening the game count as read.
    if (!loadedRef.current) {
      loadedRef.current = true;
      setLastSeenId(loaded[0]?.id ?? 0);
    }
  }, [gameId, merge]);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`chat-${gameId}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `game_id=eq.${gameId}` },
        (payload) => merge([toMessage(payload.new as Row)]),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void load(); // catch up after a reconnection
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [gameId, load, merge]);

  /** Sends a message. Returns false if it could not be sent. */
  const send = useCallback(
    async (text: string): Promise<boolean> => {
      const body = text.trim().slice(0, MAX_MESSAGE_LENGTH);
      if (!body) return false;
      const { data, error } = await supabase
        .from('messages')
        .insert({ game_id: gameId, user_id: userId, body })
        .select('id, user_id, body, created_at')
        .single();
      if (error || !data) return false;
      merge([toMessage(data as Row)]);
      return true;
    },
    [gameId, userId, merge],
  );

  /** Marks everything as read (called while the chat panel is open). */
  const markRead = useCallback(() => {
    setLastSeenId(messages[messages.length - 1]?.id ?? 0);
  }, [messages]);

  const unread =
    lastSeenId === null
      ? 0
      : messages.filter((m) => m.id > lastSeenId && m.userId !== userId).length;

  return { messages, send, unread, markRead };
}
