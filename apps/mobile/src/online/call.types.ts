/** Types shared by the web implementation of calls and its native stub. */

export interface CallParticipant {
  readonly identity: string;
  readonly name: string;
  readonly isLocal: boolean;
  readonly micOn: boolean;
  readonly cameraOn: boolean;
  readonly speaking: boolean;
  /** The video track to show (a livekit-client VideoTrack), when the camera is on. */
  readonly videoTrack: unknown;
}

export type CallStatus = 'idle' | 'connecting' | 'connected' | 'error';

export interface CallState {
  /** False where calls are not available (in the app, until the native build). */
  readonly supported: boolean;
  readonly status: CallStatus;
  readonly error: string | null;
  readonly participants: readonly CallParticipant[];
  join(withVideo: boolean): Promise<void>;
  leave(): void;
  toggleMic(): void;
  toggleCamera(): void;
}
