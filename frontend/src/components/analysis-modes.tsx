"use client";

import { useEffect, useState } from 'react';
import { CameraWorkspace } from './camera-workspace';
import { RecordingWorkspace } from './recording-workspace';
import { VideoWorkspace } from './video-workspace';

type Mode = 'camera' | 'recording' | 'saved-video';

/**
 * `/analyze` opens the live camera. `?mode=video` (the "Review a recording instead" link) and `?recording=<id>`
 * (a recording from Past sessions) open the recording screen. `?session=` (a bookmarked old saved-video review)
 * still opens Saved video seat review until it is removed. Every other value opens the camera.
 */
export function AnalysisModes() {
  const [mode, setMode] = useState<Mode | null>(null);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setMode(query.get('mode') === 'video' || query.has('recording') ? 'recording' : query.has('session') ? 'saved-video' : 'camera');
  }, []);
  if (!mode) return null;
  return mode === 'recording' ? <RecordingWorkspace /> : mode === 'saved-video' ? <VideoWorkspace /> : <CameraWorkspace />;
}
