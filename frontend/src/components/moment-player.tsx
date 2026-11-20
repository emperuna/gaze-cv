"use client";

import { useRef, useState } from 'react';
import { RotateCcw, X } from 'lucide-react';
import { Button } from './ui/button';

export const CANNOT_PLAY_TEXT = 'This browser can’t play it: open the video file in a player.';

/** Plays one window of the session's video (`start` to `end`, in seconds) and pauses at its end. */
export function MomentPlayer({ src, start, end, label, onClose }: { src: string; start: number; end: number; label: string; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  /** Pause here once; after that the teacher can play on past the window. */
  const stopAt = useRef<number | null>(null);
  const playFromStart = () => {
    const element = video.current;
    if (!element) return;
    stopAt.current = end;
    element.currentTime = start;
    void element.play().catch(() => { /* the controls stay available */ });
  };
  return <div className="moment-player">
    {failed ? <p className="setup-warning" role="alert">{CANNOT_PLAY_TEXT}</p>
      : <video ref={video} src={src} controls playsInline preload="metadata" aria-label={label}
        onLoadedMetadata={playFromStart}
        onTimeUpdate={event => {
          const element = event.currentTarget;
          if (stopAt.current !== null && element.currentTime >= stopAt.current) { stopAt.current = null; element.pause(); }
        }}
        onError={() => setFailed(true)} />}
    <div className="moment-player-actions">
      {!failed && <Button variant="outline" onClick={playFromStart}><RotateCcw size={15} aria-hidden="true" />Play again</Button>}
      <Button variant="outline" onClick={onClose}><X size={15} aria-hidden="true" />Close</Button>
    </div>
  </div>;
}
