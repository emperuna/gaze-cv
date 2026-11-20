import type { Detection, Direction } from './analysis-contract.ts';
import type { MovementEvent } from './review-contract.ts';

export const MAX_FRAME_BODY = 1_400_000;
/** `headTurns` (camera only): read seats whose face is lost with the head-pose model; on unless turned off. */
export interface CameraSettings { mirrored: boolean; tileGrid: number; headTurns?: boolean }
export interface CameraFrame {
  id: number; timestamp_seconds: number; image: string;
  setup?: boolean; open_alerts?: [string, 'left' | 'right'][];
}
export interface LiveSeatState { direction: Direction; reason: string | null }
export interface LiveEvent extends MovementEvent { still?: string }
export interface CameraResult {
  id: number; timestamp_seconds: number; counts: Record<string, number>;
  result: { width: number; height: number; detections: Detection[]; processing_ms: number };
  seats?: Record<string, LiveSeatState>; events?: LiveEvent[];
}

/** Mirroring and tiling only; shared by live camera and video setup. */
export function validateInputSettings(value: unknown): CameraSettings {
  if (!value || typeof value !== 'object') throw new Error('Choose camera analysis settings.');
  const { mirrored = false, tileGrid = 1 } = value as CameraSettings;
  if (typeof mirrored !== 'boolean' || !Number.isInteger(tileGrid) || tileGrid < 1 || tileGrid > 4) throw new Error('Invalid camera settings.');
  return { mirrored, tileGrid };
}

/** The live camera always uses the geometric baseline, so any other method is rejected. */
export function validateCameraSettings(value: unknown): CameraSettings {
  const settings = validateInputSettings(value);
  const { method } = value as { method?: unknown };
  if (method !== undefined && method !== 'baseline') throw new Error('The live camera uses the geometric baseline only.');
  const { headTurns = true } = value as { headTurns?: unknown };
  if (typeof headTurns !== 'boolean') throw new Error('Reading strong head turns must be on or off.');
  return { ...settings, headTurns };
}

export function validateCameraFrame(value: unknown): CameraFrame {
  if (!value || typeof value !== 'object') throw new Error('Send a camera frame.');
  const { id, timestamp_seconds, image } = value as CameraFrame;
  if (!Number.isSafeInteger(id) || id < 0 || !Number.isFinite(timestamp_seconds) || timestamp_seconds < 0) throw new Error('Invalid frame number or capture time.');
  if (typeof image !== 'string' || !image.length || image.length > 1_333_336 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image)) throw new Error('Send a JPEG frame of at most 1 MB.');
  const { setup } = value as CameraFrame;
  if (setup !== undefined && typeof setup !== 'boolean') throw new Error('Frame setup flag must be true or false.');
  // open_alerts is deliberately dropped: the server sends the open alerts it owns.
  return setup === undefined ? { id, timestamp_seconds, image } : { id, timestamp_seconds, image, setup };
}

/** Matches the PDF renderer's 2000-character limit for notes. */
export const MAX_ALERT_NOTE = 2000;
/** Body of PUT …/alerts/[alertId]. */
export function validateAlertMark(value: unknown): { mark: 'Checked' | 'Dismissed'; note: string; revision: number } {
  if (!value || typeof value !== 'object') throw new Error('Send a mark, note and revision.');
  const { mark, note = '', revision } = value as { mark?: unknown; note?: unknown; revision?: unknown };
  if (mark !== 'Checked' && mark !== 'Dismissed') throw new Error('Mark the alert Checked or Dismissed.');
  if (typeof note !== 'string' || note.length > MAX_ALERT_NOTE) throw new Error(`Notes are limited to ${MAX_ALERT_NOTE} characters.`);
  if (!Number.isSafeInteger(revision) || (revision as number) < 0) throw new Error('Send the session revision you last loaded.');
  return { mark, note, revision: revision as number };
}

export async function readCameraJson(request: Request, limit: number): Promise<unknown> {
  if (!request.body) throw new Error('Request body is missing.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error('Camera request is too large.'); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { reader.releaseLock(); }
}
