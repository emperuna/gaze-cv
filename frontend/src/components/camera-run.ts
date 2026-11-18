import type { CameraFrame, CameraResult } from '@/lib/camera-contract';
import { cameraFrameSize, runCameraFrames } from '@/lib/camera-client';
import { HEALTH_WARNING_MS } from '@/lib/camera-health';
import { PlainError } from '@/lib/camera-messages';
import type { CameraHealth } from '@/lib/camera-health';
import { markSetupFrame, newSetupProgress, recordSetupResult, setupComplete, shouldMarkSetup } from '@/lib/camera-setup';
import type { SetupProgress } from '@/lib/camera-setup';
import type { ReviewSeat } from '@/lib/review-contract';
import type { LiveAlert } from '@/lib/live-alerts';
import { drawSeatBoxes } from './camera-setup';
import type { CameraPhase, SeatOverlay } from './camera-setup';

/**
 * One camera run. Worker commands (find seats, start monitoring) go through `commands`, which the frame
 * loop runs between frames, because the worker accepts one request at a time.
 */
export type Run = {
  active: boolean; controller: AbortController; stream?: MediaStream; sessionId?: string; recordId?: string;
  /** The interrupted record this run is resuming (set before the worker starts). */
  resumeOf?: string;
  /** Set while a Start monitoring request is with the server, so Stop can wait for it and end that record. */
  monitorPending?: Promise<void>;
  commands: (() => Promise<void>)[]; progress: SetupProgress; setupQueued: boolean; still: HTMLCanvasElement;
};
/** A preview frame is a plain `CameraResult`; a monitoring frame adds the alert fields. */
export type MonitorFrame = CameraResult & {
  alerts?: LiveAlert[]; sessionTime?: number; revision?: number;
  state?: 'monitoring' | 'interrupted' | 'ended'; notice?: string | null; saveError?: string | null;
};

export function newRun(): Run {
  return { active: true, controller: new AbortController(), commands: [], progress: newSetupProgress(), setupQueued: false, still: document.createElement('canvas') };
}

/** The server waits for an in-flight frame and retries the final save, so Stop waits at least this long. */
export const STOP_TIMEOUT_MS = 20_000;

/**
 * Stop answers `{recordId, saveError}`. A non-null `saveError` or any error status (for example 503)
 * means the session is not saved yet, so Stop stays available to retry.
 */
export async function stopSession(id: string): Promise<{ ok: true } | { ok: false; message: string; detail: string }> {
  try {
    const response = await fetch(`/api/camera/${id}`, { method: 'DELETE', keepalive: true, signal: AbortSignal.timeout(STOP_TIMEOUT_MS) });
    if (response.status === 404) return { ok: true };
    const data = await response.json().catch(() => ({}));
    if (response.ok && !data.saveError) return { ok: true };
    const reason = response.ok ? data.saveError : data.error;
    return { ok: false, message: 'The session is not saved yet. Press Stop again.', detail: typeof reason === 'string' ? reason : '' };
  } catch {
    return { ok: false, message: 'Ocular could not be reached to save the session. Press Stop again.', detail: '' };
  }
}

/**
 * Pause: the worker closes without ending the record, which the server saves as `interrupted`.
 * `keepalive` lets it finish while the tab is hidden or closing. Failures are ignored; the worker's idle
 * timeout interrupts the record anyway.
 */
export async function interruptSession(id: string): Promise<void> {
  try { await fetch(`/api/camera/${id}/interrupt`, { method: 'POST', keepalive: true, signal: AbortSignal.timeout(STOP_TIMEOUT_MS) }); }
  catch { /* the idle timeout interrupts the record */ }
}

export interface CaptureLoop {
  run: Run; video: HTMLVideoElement; target: HTMLCanvasElement; stream: MediaStream;
  health: { current: CameraHealth | null };
  /** True while this run is still the workspace's current one. */
  valid: () => boolean;
  phase: () => CameraPhase;
  seats: () => ReviewSeat[];
  /** Directions and open-alert highlights drawn on the seat boxes while monitoring. */
  overlay?: () => SeatOverlay;
  /** A result has been drawn on the live view. */
  onDrawn: () => void;
  onSetupReceived: (received: number) => void;
  /** All setup frames have returned (push the seat-finding command onto `run.commands`). */
  onSetupComplete: () => void;
  onMonitorFrame: (result: MonitorFrame) => void;
}

/**
 * Captures camera frames, sends them to the local worker one at a time, draws each result on the live
 * view and keeps the setup and camera-health bookkeeping. It returns when the run is aborted.
 */
export async function runCaptureLoop(loop: CaptureLoop) {
  const { run: current, video, target, valid } = loop;
  const capture = document.createElement('canvas');
  const context = capture.getContext('2d');
  const draw = target.getContext('2d');
  const stillContext = current.still.getContext('2d');
  if (!context || !draw || !stillContext) throw new PlainError('Camera drawing is unavailable in this browser. Use Chrome, Edge or Firefox.');
  const started = performance.now(); let count = 0;
  loop.health.current = { startedAt: started, lastResultCaptureAt: null, previewAdvancedAt: started,
    muted: loop.stream.getVideoTracks().some(track => track.muted), lowCoverageSince: null, lowDetailSince: null };
  let capturedAt = started;
  await runCameraFrames<CameraFrame, MonitorFrame>({ signal: current.controller.signal,
    capture: () => {
      const size = cameraFrameSize(video.videoWidth, video.videoHeight);
      capture.width = size.width; capture.height = size.height;
      context.drawImage(video, 0, 0, size.width, size.height);
      capturedAt = performance.now();
      const timestamp = (capturedAt - started) / 1000;
      const setup = loop.phase() === 'preparing' && shouldMarkSetup(current.progress, timestamp);
      if (setup) markSetupFrame(current.progress, timestamp);
      const frame: CameraFrame = { id: ++count, timestamp_seconds: timestamp, image: capture.toDataURL('image/jpeg', .8).split(',')[1] };
      return setup ? { ...frame, setup: true } : frame;
    },
    process: async frame => {
      // Commands run here so the worker never receives one while a frame is in flight.
      while (current.commands.length && valid()) await current.commands.shift()!();
      const response = await fetch(`/api/camera/${current.sessionId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(frame), signal: current.controller.signal });
      const result = await response.json();
      if (!response.ok) throw new PlainError('The camera picture could not be processed. Press Start again.', result.error || '');
      return result as MonitorFrame;
    },
    display: (frame, result) => {
      if (!valid()) return;
      if (result.id !== frame.id || result.timestamp_seconds !== frame.timestamp_seconds || result.result.width !== capture.width || result.result.height !== capture.height) throw new PlainError('The processed picture did not match the camera. Press Start again.');
      current.still.width = capture.width; current.still.height = capture.height; stillContext.drawImage(capture, 0, 0);
      target.width = capture.width; target.height = capture.height; draw.drawImage(capture, 0, 0);
      draw.font = '14px Arial'; draw.lineWidth = 2;
      for (const detection of result.result.detections) {
        const [x, y, w, h] = detection.bbox;
        draw.strokeStyle = detection.direction === 'unknown' ? '#e8c76a' : '#8fe3a1';
        draw.strokeRect(x, y, w, h);
        const labelY = Math.max(20, y);
        draw.fillStyle = '#17291f'; draw.fillRect(x + w - draw.measureText(detection.direction).width - 12, labelY - 20, draw.measureText(detection.direction).width + 12, 21);
        draw.fillStyle = '#ffffff'; draw.fillText(detection.direction, x + w - draw.measureText(detection.direction).width - 6, labelY - 5);
      }
      const phase = loop.phase();
      // Alerts are merged before the seat boxes are drawn, so a new alert is highlighted on this frame.
      if (phase === 'monitoring') loop.onMonitorFrame(result);
      const showSeats = phase === 'found' || phase === 'monitoring';
      if (showSeats) drawSeatBoxes(draw, loop.seats(), capture.width, capture.height,
        phase === 'monitoring' ? { ...loop.overlay?.(), directions: result.seats ?? {} } : {});
      loop.onDrawn();
      if (phase === 'preparing') {
        recordSetupResult(current.progress, result.timestamp_seconds, frame.setup === true);
        loop.onSetupReceived(current.progress.received);
        if (setupComplete(current.progress) && !current.setupQueued) {
          current.setupQueued = true;
          loop.onSetupComplete();
        }
      }
      const health = loop.health.current;
      if (health) {
        if (health.lastResultCaptureAt === null || capturedAt - health.lastResultCaptureAt >= HEALTH_WARNING_MS) health.lowCoverageSince = null;
        health.lastResultCaptureAt = capturedAt;
        const expected = showSeats ? loop.seats().length : 0;
        const usable = result.result.detections.filter(detection => detection.direction !== 'unknown' && !detection.unavailable_reason).length;
        health.lowCoverageSince = expected && usable < expected ? (health.lowCoverageSince ?? capturedAt) : null;
      }
    },
  });
}
