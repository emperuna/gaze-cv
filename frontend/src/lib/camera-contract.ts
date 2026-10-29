import type { AnalysisMethod, Detection } from './analysis-contract.ts';

export const MAX_FRAME_BODY = 1_400_000;
export interface CameraSettings { method: AnalysisMethod; mirrored: boolean; tileGrid: number }
export interface CameraFrame { id: number; timestamp_seconds: number; image: string }
export interface CameraResult {
  id: number; timestamp_seconds: number; counts: Record<string, number>;
  result: { width: number; height: number; detections: Detection[]; processing_ms: number };
}

export function validateCameraSettings(value: unknown): CameraSettings {
  if (!value || typeof value !== 'object') throw new Error('Choose camera analysis settings.');
  const { method, mirrored = false, tileGrid = 1 } = value as CameraSettings;
  if (method !== 'head' && method !== 'baseline') throw new Error('Choose the head model or geometric baseline.');
  if (typeof mirrored !== 'boolean' || !Number.isInteger(tileGrid) || tileGrid < 1 || tileGrid > 4) throw new Error('Invalid camera settings.');
  return { method, mirrored, tileGrid };
}

export function validateCameraFrame(value: unknown): CameraFrame {
  if (!value || typeof value !== 'object') throw new Error('Send a camera frame.');
  const { id, timestamp_seconds, image } = value as CameraFrame;
  if (!Number.isSafeInteger(id) || id < 0 || !Number.isFinite(timestamp_seconds) || timestamp_seconds < 0) throw new Error('Invalid frame number or capture time.');
  if (typeof image !== 'string' || !image.length || image.length > 1_333_336 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image)) throw new Error('Send a JPEG frame of at most 1 MB.');
  return { id, timestamp_seconds, image };
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
