export const HEALTH_WARNING_MS = 5000;
export interface CameraHealth {
  startedAt: number; lastResultCaptureAt: number | null; previewAdvancedAt: number;
  muted: boolean; lowCoverageSince: number | null; lowDetailSince: number | null;
}

export function cameraWarnings(health: CameraHealth, now: number): string[] {
  const warnings: string[] = [];
  if (health.muted) warnings.push('Connection interrupted: check the cable or app.');
  if (now - health.previewAdvancedAt >= HEALTH_WARNING_MS) warnings.push('Picture frozen for 5 s: check the camera.');
  if (now - (health.lastResultCaptureAt ?? health.startedAt) >= HEALTH_WARNING_MS) warnings.push(health.lastResultCaptureAt === null
    ? 'Nothing processed yet: please wait.'
    : 'Processing is over 5 s behind.');
  if (!health.muted && health.lastResultCaptureAt !== null && now - health.lastResultCaptureAt < HEALTH_WARNING_MS &&
      health.lowCoverageSince !== null && now - health.lowCoverageSince >= HEALTH_WARNING_MS) warnings.push('Fewer heads seen: check the view and lighting.');
  if (!health.muted && now - health.previewAdvancedAt < HEALTH_WARNING_MS && health.lowDetailSince !== null &&
      now - health.lowDetailSince >= HEALTH_WARNING_MS) warnings.push('Picture dark or blocked: check the lens.');
  return warnings;
}

/** A simple image-quality warning, not an obstruction classifier. */
export function lowDetailImage(rgba: Uint8ClampedArray): boolean {
  if (!rgba.length) return false;
  let sum = 0, squared = 0;
  const count = rgba.length / 4;
  for (let i = 0; i < rgba.length; i += 4) {
    const light = .2126 * rgba[i] + .7152 * rgba[i + 1] + .0722 * rgba[i + 2];
    sum += light; squared += light * light;
  }
  const mean = sum / count;
  return mean < 12 || Math.sqrt(Math.max(0, squared / count - mean * mean)) < 4;
}
