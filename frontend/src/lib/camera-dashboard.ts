import type { LiveSeatState } from './camera-contract.ts';
import { rateWarning } from './live-alerts.ts';
import type { AlertMark, LiveAlert } from './live-alerts.ts';

/** Session time at which the "stops at 3 hours" banner appears (2 h 45 min). */
export const LONG_SESSION_SECONDS = 9900;
export const LONG_SESSION_TEXT = 'Monitoring stops at 3 hours: press Stop, then start a new session.';
export const RATE_WINDOW_SECONDS = 10;
export const MUTE_KEY = 'ocular.camera.muted';
export const CONFLICT_TEXT = 'This alert changed in another tab. Check it again.';
export const SAVE_WARNING_TEXT = 'Not saved yet. Still trying…';

export type AlertMap = Record<string, LiveAlert>;

/** All alerts of a loaded record, replacing whatever the dashboard held. */
export function alertsFromRecord(alerts: LiveAlert[]): AlertMap {
  return Object.fromEntries(alerts.map(alert => [alert.id, alert]));
}

/**
 * Merges the alerts a frame opened or updated. `opened` lists alerts the dashboard had not seen
 * that are still open, which is when a chime plays. A frame computed before a mark can arrive after
 * the mark's response; an alert that is marked here is never reopened by such a frame.
 */
export function mergeAlerts(current: AlertMap, incoming: LiveAlert[]): { alerts: AlertMap; opened: LiveAlert[] } {
  if (!incoming.length) return { alerts: current, opened: [] };
  const alerts = { ...current };
  const opened: LiveAlert[] = [];
  for (const alert of incoming) {
    const known = alerts[alert.id];
    if (!known) { alerts[alert.id] = alert; if (alert.mark === null) opened.push(alert); continue; }
    alerts[alert.id] = known.mark !== null && alert.mark === null ? known : alert;
  }
  return { alerts, opened };
}

/** Replaces one alert with the server's copy after a mark. */
export function withAlert(current: AlertMap, alert: LiveAlert): AlertMap {
  return { ...current, [alert.id]: alert };
}

const alertNumber = (id: string) => Number(/(\d+)$/.exec(id)?.[1] ?? 0);

/** Newest first: by opening time, then by alert number. */
export function sortAlerts(alerts: AlertMap): LiveAlert[] {
  return Object.values(alerts).sort((a, b) => b.openedAt - a.openedAt || alertNumber(b.id) - alertNumber(a.id));
}

export function newestOpenAlert(sorted: LiveAlert[]): LiveAlert | null {
  return sorted.find(alert => alert.mark === null) ?? null;
}

/** Seats that have at least one open (unmarked) alert. */
export function openAlertSeats(alerts: AlertMap): Set<string> {
  return new Set(Object.values(alerts).filter(alert => alert.mark === null).map(alert => alert.seatId));
}

/**
 * Intervals between processed frames whose session times fall in the last `window` seconds before
 * `now`. `times` are the session times of processed frames in order.
 */
export function recentIntervals(times: number[], now: number, window = RATE_WINDOW_SECONDS): number[] {
  const recent = times.filter(time => time >= now - window && time <= now);
  const intervals: number[] = [];
  for (let i = 1; i < recent.length; i++) if (recent[i] > recent[i - 1]) intervals.push(recent[i] - recent[i - 1]);
  return intervals;
}

/** Drops frame times that can no longer be inside the rate window. */
export function pruneFrameTimes(times: number[], now: number, window = RATE_WINDOW_SECONDS): number[] {
  const first = times.findIndex(time => time >= now - window);
  return first <= 0 ? (first === -1 ? [] : times) : times.slice(first);
}

export interface RunningStatus { slow: boolean; text: string; detail: string | null; fps: number | null }

/** The plain status line, with the exact rate warning and the median speed kept for the details section. */
export function runningStatus(times: number[], now: number, maxGap: number): RunningStatus {
  const intervals = recentIntervals(times, now);
  const detail = rateWarning(intervals, maxGap);
  const sorted = [...intervals].sort((a, b) => a - b), mid = sorted.length >> 1;
  const median = !sorted.length ? 0 : sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { slow: detail !== null, text: detail ? 'Running slowly: alerts may be missed' : 'Running smoothly', detail, fps: median > 0 ? 1 / median : null };
}

/** Elapsed session time as m:ss, or h:mm:ss from one hour. */
export function formatElapsed(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const h = Math.floor(whole / 3600), m = Math.floor(whole / 60) % 60, s = whole % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** An alert card's time: video times for a recording ("At 12:05"), elapsed time for a camera session ("12:05 in"). */
export function alertTimeText(alert: { openedAt: number; lastAt: number }, recording: boolean): string {
  const at = (seconds: number) => recording ? formatElapsed(seconds) : `${formatElapsed(seconds)} in`;
  const latest = alert.lastAt > alert.openedAt ? ` · latest ${at(alert.lastAt)}` : '';
  return recording ? `At ${at(alert.openedAt)}${latest}` : `${at(alert.openedAt)}${latest}`;
}

export function longSessionWarning(sessionTime: number): string | null {
  return sessionTime >= LONG_SESSION_SECONDS ? LONG_SESSION_TEXT : null;
}

/** Seats whose head direction is known in the latest frame. */
export function seatsObserved(seatIds: string[], states: Record<string, LiveSeatState> | undefined): number {
  return seatIds.filter(id => { const direction = states?.[id]?.direction; return !!direction && direction !== 'unknown'; }).length;
}

/** `C` marks Checked and `D` Dismissed, except while typing or with a modifier key. */
export function shortcutMark(key: string, target: { tagName?: string; isContentEditable?: boolean } | null,
  modifiers: { ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean } = {}): AlertMark | null {
  if (modifiers.ctrlKey || modifiers.metaKey || modifiers.altKey) return null;
  const tag = target?.tagName?.toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return null;
  const k = key.toLowerCase();
  return k === 'c' ? 'Checked' : k === 'd' ? 'Dismissed' : null;
}

export function seatNumber(seatId: string): string {
  return seatId.startsWith('seat-') ? seatId.slice(5) : seatId;
}

/** Screen-reader text for alerts that just opened. */
export function announceAlerts(opened: LiveAlert[]): string {
  return opened.map(alert => `New alert: check seat ${seatNumber(alert.seatId)}`).join('. ');
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;
function store(storage?: Store | null): Store | null | undefined {
  return storage === undefined ? globalThis.localStorage : storage;
}

export function readMuted(storage?: Store | null): boolean {
  try { return store(storage)?.getItem(MUTE_KEY) === 'true'; } catch { return false; }
}

export function writeMuted(muted: boolean, storage?: Store | null) {
  try { store(storage)?.setItem(MUTE_KEY, muted ? 'true' : 'false'); } catch { /* storage blocked: the choice lasts for this page only */ }
}
