/**
 * The call in progress, shown above the chat bar: one small tile per person
 * (their video, or their initial when the camera is off), a green ring around
 * whoever is speaking, and buttons for the microphone, the camera and hanging up.
 */

import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { CallState } from '../online/call.types';
import { colors, radius } from '../ui/theme';
import { VideoView } from './VideoView';

const TILE = 64;

export function CallStrip({ call }: { call: CallState }) {
  if (call.status === 'idle' && !call.error) return null;
  if (call.status === 'error' || (call.status === 'idle' && call.error)) {
    return <Text style={styles.error}>{call.error}</Text>;
  }
  if (call.status === 'connecting') {
    return (
      <View style={styles.strip}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.muted}>Connexion à l'appel…</Text>
      </View>
    );
  }
  const me = call.participants.find((p) => p.isLocal);
  return (
    <View style={styles.strip}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tiles}>
        {call.participants.map((p) => (
          <View
            key={p.identity}
            style={[styles.tile, p.speaking && styles.speaking]}
            accessibilityLabel={`${p.isLocal ? 'Moi' : p.name}${p.micOn ? '' : ', micro coupé'}`}
          >
            {p.videoTrack ? (
              <VideoView track={p.videoTrack} mirrored={p.isLocal} />
            ) : (
              <Text style={styles.initial}>{(p.isLocal ? 'Moi' : p.name).charAt(0)}</Text>
            )}
            <Text style={styles.name} numberOfLines={1}>
              {!p.micOn ? '🔇 ' : ''}
              {p.isLocal ? 'Moi' : p.name}
            </Text>
          </View>
        ))}
      </ScrollView>
      <RoundButton
        icon={me?.micOn ? 'mic' : 'mic-off'}
        label={me?.micOn ? 'Couper le micro' : 'Activer le micro'}
        onPress={call.toggleMic}
      />
      <RoundButton
        icon={me?.cameraOn ? 'videocam' : 'videocam-off'}
        label={me?.cameraOn ? 'Couper la caméra' : 'Activer la caméra'}
        onPress={call.toggleCamera}
      />
      <RoundButton icon="call" label="Raccrocher" danger onPress={call.leave} />
    </View>
  );
}

function RoundButton(props: {
  icon: 'mic' | 'mic-off' | 'videocam' | 'videocam-off' | 'call';
  label: string;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      style={({ pressed }) => [
        styles.round,
        props.danger && styles.danger,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons
        name={props.icon}
        size={20}
        color={props.danger ? '#fff' : colors.text}
        style={props.danger ? styles.hangUp : undefined}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    marginHorizontal: 4,
    padding: 6,
    borderRadius: radius.medium,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tiles: { flex: 1 },
  tile: {
    width: TILE,
    height: TILE,
    marginRight: 6,
    borderRadius: 8,
    backgroundColor: colors.square,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  speaking: { borderColor: colors.primary },
  initial: { fontSize: 24, fontWeight: '700', color: colors.text },
  name: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    fontSize: 10,
    textAlign: 'center',
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  round: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  danger: { backgroundColor: colors.danger, borderColor: colors.danger },
  hangUp: { transform: [{ rotate: '135deg' }] },
  pressed: { opacity: 0.7 },
  muted: { color: colors.textMuted },
  error: { color: colors.danger, marginTop: 6, marginHorizontal: 6 },
});
