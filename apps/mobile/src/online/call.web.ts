/**
 * Audio / video call of an online game, in the web version (browsers have
 * WebRTC built in). Calls go through LiveKit: the `game` server function gives
 * a token for the room of this game (players only), then livekit-client
 * handles microphones, cameras and the connection.
 *
 * Remote sound is played through hidden <audio> elements; videos are shown by
 * CallStrip (VideoView.web.tsx).
 */

import { Room, RoomEvent, Track, type Participant } from 'livekit-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import project from '../../../../supabase/project.json';
import { callGame } from './api';
import type { CallParticipant, CallState, CallStatus } from './call.types';

function describe(participant: Participant, isLocal: boolean): CallParticipant {
  const camera = participant.getTrackPublication(Track.Source.Camera);
  return {
    identity: participant.identity,
    name: participant.name || '?',
    isLocal,
    micOn: participant.isMicrophoneEnabled,
    cameraOn: participant.isCameraEnabled,
    speaking: participant.isSpeaking,
    videoTrack: camera && !camera.isMuted ? (camera.track ?? null) : null,
  };
}

function errorText(error: unknown): string {
  const name = (error as { name?: string })?.name;
  if (name === 'NotAllowedError') return 'Accès au micro ou à la caméra refusé.';
  if (name === 'NotFoundError') return 'Aucun micro ou caméra trouvé.';
  return "Impossible de rejoindre l'appel.";
}

/**
 * @param onStarted called when this player opened a call nobody was in yet
 *   (the screen posts a chat message so the others know)
 */
export function useCall(gameId: string, onStarted: (video: boolean) => void): CallState {
  const roomRef = useRef<Room | null>(null);
  const [status, setStatus] = useState<CallStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<CallParticipant[]>([]);

  const refresh = useCallback(() => {
    const room = roomRef.current;
    if (!room) return setParticipants([]);
    setParticipants([
      describe(room.localParticipant, true),
      ...[...room.remoteParticipants.values()].map((p) => describe(p, false)),
    ]);
  }, []);

  const leave = useCallback(() => {
    const room = roomRef.current;
    roomRef.current = null;
    void room?.disconnect();
    document.querySelectorAll('audio[data-maitremot-call]').forEach((el) => el.remove());
    setParticipants([]);
    setStatus('idle');
  }, []);

  const join = useCallback(
    async (withVideo: boolean) => {
      if (roomRef.current) return;
      setStatus('connecting');
      setError(null);
      const result = await callGame({ action: 'callToken', gameId });
      if (!result.ok || !('callToken' in result) || !result.callToken) {
        setStatus('error');
        setError(
          result.ok === false && result.error.code === 'CALLS_DISABLED'
            ? 'Les appels ne sont pas encore activés sur le serveur.'
            : "Impossible de rejoindre l'appel.",
        );
        return;
      }
      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;
      room
        .on(RoomEvent.TrackSubscribed, (track) => {
          // Play the others' sound in hidden <audio> elements.
          if (track.kind === Track.Kind.Audio) {
            const element = track.attach();
            element.setAttribute('data-maitremot-call', '');
            document.body.appendChild(element);
          }
          refresh();
        })
        .on(RoomEvent.TrackUnsubscribed, (track) => {
          track.detach().forEach((el) => el.remove());
          refresh();
        })
        .on(RoomEvent.ParticipantConnected, refresh)
        .on(RoomEvent.ParticipantDisconnected, refresh)
        .on(RoomEvent.TrackMuted, refresh)
        .on(RoomEvent.TrackUnmuted, refresh)
        .on(RoomEvent.LocalTrackPublished, refresh)
        .on(RoomEvent.LocalTrackUnpublished, refresh)
        .on(RoomEvent.ActiveSpeakersChanged, refresh)
        .on(RoomEvent.Disconnected, () => {
          if (roomRef.current === room) leave();
        });
      try {
        await room.connect(project.livekitUrl, result.callToken);
        const alone = room.remoteParticipants.size === 0;
        await room.localParticipant.setMicrophoneEnabled(true);
        if (withVideo) await room.localParticipant.setCameraEnabled(true);
        setStatus('connected');
        refresh();
        if (alone) onStarted(withVideo);
      } catch (e) {
        leave();
        setStatus('error');
        setError(errorText(e));
      }
    },
    [gameId, leave, onStarted, refresh],
  );

  const toggleMic = useCallback(() => {
    const local = roomRef.current?.localParticipant;
    if (local) void local.setMicrophoneEnabled(!local.isMicrophoneEnabled).then(refresh);
  }, [refresh]);

  const toggleCamera = useCallback(() => {
    const local = roomRef.current?.localParticipant;
    if (local)
      void local
        .setCameraEnabled(!local.isCameraEnabled)
        .then(refresh)
        .catch((e) => setError(errorText(e)));
  }, [refresh]);

  // Leave the call when leaving the game screen.
  useEffect(() => leave, [leave]);

  return { supported: true, status, error, participants, join, leave, toggleMic, toggleCamera };
}
