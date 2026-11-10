/**
 * Calls are not available in the app yet: they need native WebRTC modules,
 * which Expo Go does not include (they will come with the installed app).
 * The web version uses call.web.ts.
 */

import type { CallState } from './call.types';

const unsupported: CallState = {
  supported: false,
  status: 'idle',
  error: null,
  participants: [],
  join: async () => undefined,
  leave: () => undefined,
  toggleMic: () => undefined,
  toggleCamera: () => undefined,
};

export function useCall(_gameId: string, _onStarted: (video: boolean) => void): CallState {
  return unsupported;
}
