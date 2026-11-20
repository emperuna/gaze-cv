"use client";

import { useEffect, useState } from 'react';
import { CameraWorkspace } from './camera-workspace';
import { RecordingWorkspace } from './recording-workspace';

type Mode = 'camera' | 'recording';

/**
 * `/analyze` opens the live camera. `?mode=video` (the "Review a recording instead" link) and `?recording=<id>`
 * (a recording from Past sessions) open the recording screen. Every other value, including an old
 * `?session=<id>` bookmark from the removed Saved video review, opens the camera.
 */
export function AnalysisModes() {
  const [mode, setMode] = useState<Mode | null>(null);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setMode(query.get('mode') === 'video' || query.has('recording') ? 'recording' : 'camera');
  }, []);
  if (!mode) return null;
  return mode === 'recording' ? <RecordingWorkspace /> : <CameraWorkspace />;
}
