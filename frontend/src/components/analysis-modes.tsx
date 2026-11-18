"use client";

import { useEffect, useState } from 'react';
import { CameraWorkspace } from './camera-workspace';
import { VideoWorkspace } from './video-workspace';

/**
 * `/analyze` opens the live camera. `?mode=video` (the "Review a recording instead" link) and `?session=`
 * (a bookmarked saved-video review) open Saved video seat review. Every other value, including the removed
 * `?mode=image`, opens the camera. The Image workspace and its API route stay in the code, unused.
 */
export function AnalysisModes() {
  const [mode, setMode] = useState<'video' | 'camera' | null>(null);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setMode(query.get('mode') === 'video' || query.has('session') ? 'video' : 'camera');
  }, []);
  if (!mode) return null;
  return mode === 'video' ? <VideoWorkspace /> : <CameraWorkspace />;
}
