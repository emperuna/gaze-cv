export const HEALTH_WARNING_MS = 5000;
export interface CameraHealth {
  startedAt: number; lastResultCaptureAt: number | null; previewAdvancedAt: number;
  muted: boolean; lowCoverageSince: number | null; lowDetailSince: number | null;
}

export function cameraWarnings(health: CameraHealth, now: number): string[] {
  const warnings: string[] = [];
  if (health.muted) warnings.push('The camera track is interrupted. Check the camera connection and whether another application is using it.');
  if (now - health.previewAdvancedAt >= HEALTH_WARNING_MS) warnings.push('The camera preview has not advanced for 5 seconds. Check for a disconnected or frozen camera.');
  if (now - (health.lastResultCaptureAt ?? health.startedAt) >= HEALTH_WARNING_MS) warnings.push(health.lastResultCaptureAt === null
    ? 'No processed frame is available after 5 seconds. Coverage is unavailable while the processor catches up.'
    : 'The latest processed frame is over 5 seconds old. Its annotations do not describe the current live preview.');
  if (!health.muted && health.lastResultCaptureAt !== null && now - health.lastResultCaptureAt < HEALTH_WARNING_MS &&
      health.lowCoverageSince !== null && now - health.lowCoverageSince >= HEALTH_WARNING_MS) warnings.push('Recent processed frames contain fewer usable heads than expected. Check visibility, lighting, camera position, or a possible obstruction.');
  if (!health.muted && now - health.previewAdvancedAt < HEALTH_WARNING_MS && health.lowDetailSince !== null &&
      now - health.lowDetailSince >= HEALTH_WARNING_MS) warnings.push('The camera image has been very dark or has very little detail for 5 seconds. Check the lens and view for a possible obstruction.');
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
