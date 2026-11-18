import { seatsForMonitor } from './camera-setup.ts';
import type { ReviewSeat } from './review-contract.ts';
import type { LiveSessionRecord } from './live-alerts.ts';

/** Saved sessions, interruption and resume: pure text and record helpers for the camera screen. */

export type SessionState = LiveSessionRecord['state'];

export const DELETE_CONFIRM_TEXT = 'Delete this session and its alert images? This cannot be undone.';
export const END_CONFIRM_TEXT = 'End this session? It cannot be resumed afterwards. You can still mark alerts and download the PDF.';
export const SEATS_QUESTION = 'Do the seats still line up?';

/** "Ended", "Interrupted" or "Live now" (a `monitoring` record is only reported while its worker is live). */
export function stateLabel(state: SessionState): string {
  return state === 'ended' ? 'Ended' : state === 'interrupted' ? 'Interrupted' : 'Live now';
}

/** Local wall-clock "hh:mm" (24-hour). */
export function formatClock(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function interruptionText(at: Date): string {
  return `Monitoring stopped at ${formatClock(at)}. Seats and alerts are saved.`;
}

/** Plain-words length: "45 s", "12 min", "1 h 5 min". */
export function formatDuration(seconds: number): string {
  const whole = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
  if (whole < 60) return `${whole} s`;
  const minutes = Math.round(whole / 60);
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
}

export const countText = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function unmarkedText(alerts: number, unmarked: number): string {
  if (!alerts) return 'no alerts to mark';
  return unmarked ? `${unmarked} not marked yet` : 'all marked';
}

/**
 * When the record stopped without Stop. A record left `monitoring` by a server crash has no
 * `interruptedAt`, so its last frame's wall time is estimated from the last segment (as the server does on resume).
 */
export function interruptedAt(record: Pick<LiveSessionRecord, 'interruptedAt' | 'segments' | 'lastTime' | 'createdAt'>): Date {
  if (record.interruptedAt) return new Date(record.interruptedAt);
  const segment = record.segments.at(-1);
  if (!segment) return new Date(record.createdAt);
  return new Date(Date.parse(segment.startedAt) + Math.max(0, record.lastTime - Math.max(segment.offsetSeconds, 0)) * 1000);
}

/**
 * Seats are saved as sent to monitoring (flipped back to unmirrored coordinates when the input is mirrored),
 * so they are flipped again to line up with the live view. Mirroring is its own inverse.
 */
export function displaySeats(settings: Pick<LiveSessionRecord['settings'], 'seats' | 'mirrored'>): ReviewSeat[] {
  return seatsForMonitor(settings.seats, settings.mirrored);
}

export type LeaveAction = 'none' | 'pause' | 'cancel-resume' | 'stop';

/**
 * What leaving the page (hidden tab, page closed, camera unplugged, unmount) does to a run. It depends on
 * whether a record exists, not on the screen phase: once Start monitoring or Resume has a record, the run is
 * paused so the record stays resumable, even before the screen shows Monitoring. A resume check that has no
 * record yet goes back to the interrupted view; anything else (a preview) stops.
 */
export function leaveAction(run: { recordId?: string; resumeOf?: string } | null | undefined): LeaveAction {
  if (!run) return 'none';
  if (run.recordId) return 'pause';
  return run.resumeOf ? 'cancel-resume' : 'stop';
}

/** The PDF route and a file name for one record. */
export const reportUrl = (recordId: string) => `/api/camera/sessions/${encodeURIComponent(recordId)}/report`;
export function reportFilename(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return 'ocular-camera-session.pdf';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `ocular-camera-session-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.pdf`;
}

/** "18 Nov 2026, 10:58" in the viewer's locale for the date, with the same hh:mm clock as the interruption text. */
export function formatSessionDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return `${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}, ${formatClock(date)}`;
}
