import { formatElapsed } from './camera-dashboard.ts';
import type { LiveSessionRecord } from './live-alerts.ts';
import type { MovementEvent } from './review-contract.ts';

/** Pure helpers for the recording screen: file checks, steps, progress and the "Play this moment" window. */

export const PLAY_MARGIN_SECONDS = 3;
export const MAX_RECORDING_BYTES = 2 * 1024 ** 3;
export const RECORDING_EXTENSIONS = ['.mp4', '.mov', '.webm', '.m4v'] as const;
/** How often the screen reads the record while the review runs. */
export const POLL_MS = 1000;

export type RecordingStep = 'choose' | 'finding' | 'seats' | 'reviewing' | 'done' | 'stopped';
export interface RecordingFlowState { uploading: boolean; hasDraft: boolean; recordState: LiveSessionRecord['state'] | null }

/** The record's state decides once it exists; before that, a found-seats draft, then an upload in progress. */
export function recordingStep({ uploading, hasDraft, recordState }: RecordingFlowState): RecordingStep {
  if (recordState === 'monitoring') return 'reviewing';
  if (recordState === 'ended') return 'done';
  if (recordState === 'interrupted') return 'stopped';
  if (hasDraft) return 'seats';
  return uploading ? 'finding' : 'choose';
}

/** null when the file can be uploaded, otherwise one sentence saying what to do. */
export function acceptedFile(file: { name: string; size: number }): string | null {
  const dot = file.name.lastIndexOf('.');
  const ext = dot > 0 ? file.name.slice(dot).toLowerCase() : '';
  if (!(RECORDING_EXTENSIONS as readonly string[]).includes(ext)) return 'Choose an MP4, MOV, WebM or M4V video.';
  if (file.size > MAX_RECORDING_BYTES) return 'This video is over 2 GB. Choose a smaller one.';
  if (file.size <= 0) return 'This file is empty. Choose another video.';
  return null;
}

/** The video's length is an estimate for phone videos, so the time reached so far can exceed it. */
const lengthSoFar = (lastTime: number, duration: number) => Math.max(Number.isFinite(duration) ? duration : 0, lastTime);

/** 0 to 1, never past the end. */
export function reviewProgress(lastTime: number, duration: number): number {
  if (!Number.isFinite(lastTime) || lastTime <= 0) return 0;
  return Math.min(1, lastTime / lengthSoFar(lastTime, duration));
}

/** "12:30 of 45:00": the video time reached and the video's length (never less than the time reached). */
function reachedOf(lastTime: number, duration: number): string {
  const reached = Number.isFinite(lastTime) ? Math.max(0, lastTime) : 0;
  return `${formatElapsed(reached)} of ${formatElapsed(lengthSoFar(reached, duration))}`;
}

export function progressText(lastTime: number, duration: number): string {
  return `Reviewing… ${reachedOf(lastTime, duration)}`;
}

/** How far an interrupted review got, so its partial alerts and PDF are read with that in mind. */
export function stoppedText(lastTime: number, duration: number): string {
  return `Stopped at ${reachedOf(lastTime, duration)}`;
}

/** The alert's first event, 3 s before to 3 s after, clamped to the video; an unknown length leaves the end open. */
export function playWindow(event: Pick<MovementEvent, 'start_time' | 'end_time'>, durationSeconds: number): { start: number; end: number } {
  const known = Number.isFinite(durationSeconds) && durationSeconds > 0;
  const end = event.end_time + PLAY_MARGIN_SECONDS;
  return { start: Math.max(0, event.start_time - PLAY_MARGIN_SECONDS), end: known ? Math.min(durationSeconds, end) : end };
}

export const RECORDING_DELETE_TEXT = 'Delete this recording, its video and photos? This cannot be undone.';
export const AGAIN_CONFIRM_TEXT = 'Review again from the start? Its alerts and notes are cleared.';
export const recordingUrl = (recordId: string) => `/analyze?recording=${encodeURIComponent(recordId)}`;
export const recordingVideoUrl = (recordId: string) => `/api/camera/sessions/${encodeURIComponent(recordId)}/video`;

/** Starts Review again on the server; null on success, otherwise one sentence saying what to do. */
export async function startReviewAgain(recordId: string, request: typeof fetch = fetch): Promise<string | null> {
  try {
    const response = await request(`/api/camera/sessions/${encodeURIComponent(recordId)}/again`, { method: 'POST', signal: AbortSignal.timeout(65_000) });
    if (response.ok) return null;
    const data = await response.json().catch(() => ({})) as { error?: unknown };
    return response.status === 409 && typeof data.error === 'string' ? data.error : 'The review could not start. Press Review again.';
  } catch {
    return 'Ocular could not be reached. Press Review again.';
  }
}
