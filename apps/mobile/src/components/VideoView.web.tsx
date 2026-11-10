/**
 * Shows a LiveKit video track in a <video> element (web version).
 * The native app has no calls yet (see VideoView.tsx).
 */

import { createElement, useEffect, useRef } from 'react';

interface AttachableTrack {
  attach(element: HTMLMediaElement): HTMLMediaElement;
  detach(element: HTMLMediaElement): HTMLMediaElement;
}

export function VideoView({ track, mirrored }: { track: unknown; mirrored?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = ref.current;
    const video = track as AttachableTrack | null;
    if (!element || !video) return;
    video.attach(element);
    return () => {
      video.detach(element);
    };
  }, [track]);
  return createElement('video', {
    ref,
    autoPlay: true,
    playsInline: true,
    muted: true, // the sound goes through the call's <audio> elements
    style: {
      width: '100%',
      height: '100%',
      objectFit: 'cover',
      transform: mirrored ? 'scaleX(-1)' : undefined,
      borderRadius: 8,
    },
  });
}
