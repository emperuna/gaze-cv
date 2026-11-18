import type { LiveEvent, LiveSeatState } from './camera-contract.ts';
import type { DEFAULT_MOVEMENT, MovementEvent, ReviewSeat } from './review-contract.ts';

export type AlertDirection = 'left' | 'right';
export type AlertMark = 'Checked' | 'Dismissed';
export interface LiveAlert {
  id: string; seatId: string; direction: AlertDirection; openedAt: number; lastAt: number;
  eventIndexes: number[]; still: string | null; stillError: string | null;
  mark: AlertMark | null; note: string; markedAt: string | null;
}
export interface SeatCoverage {
  frames: number; observedFrames: number; gaps: { start: number; end: number }[];
  omittedGaps: number; unknownSince: number | null;
}
export interface LiveSessionRecord {
  schemaVersion: 1; id: string; state: 'monitoring' | 'interrupted' | 'ended'; revision: number;
  createdAt: string; endedAt: string | null;
  settings: { mirrored: boolean; tileGrid: number; seats: ReviewSeat[]; movement: typeof DEFAULT_MOVEMENT; maxGapAuto: boolean };
  segments: { startedAt: string; offsetSeconds: number; endSeconds: number | null }[];
  events: (MovementEvent & { segment: number })[]; alerts: LiveAlert[];
  coverage: Record<string, SeatCoverage>; minutes: { minute: number; counts: Record<string, number> }[];
  framesProcessed: number; stillsSaved: number; lastTime: number;
}

export class RevisionError extends Error {}

const MAX_STILLS = 200;
const MAX_GAPS = 200;
const MIN_GAP_SECONDS = 2;

export function newRecord(id: string, settings: LiveSessionRecord['settings'], now: Date): LiveSessionRecord {
  return {
    schemaVersion: 1, id, state: 'monitoring', revision: 0, createdAt: now.toISOString(), endedAt: null, settings,
    segments: [{ startedAt: now.toISOString(), offsetSeconds: 0, endSeconds: null }],
    events: [], alerts: [], coverage: {}, minutes: [], framesProcessed: 0, stillsSaved: 0, lastTime: 0,
  };
}

export function openAlertKeys(record: LiveSessionRecord): [string, AlertDirection][] {
  return record.alerts.filter(a => a.mark === null).map(a => [a.seatId, a.direction]);
}

function updateCoverage(record: LiveSessionRecord, time: number, seats: Record<string, LiveSeatState>) {
  const minute = Math.floor(time / 60);
  let bucket = record.minutes.find(m => m.minute === minute);
  for (const [seatId, state] of Object.entries(seats)) {
    const c = record.coverage[seatId] ??= { frames: 0, observedFrames: 0, gaps: [], omittedGaps: 0, unknownSince: null };
    c.frames++;
    if (state.direction === 'unknown') { c.unknownSince ??= time; continue; }
    c.observedFrames++;
    if (c.unknownSince !== null) {
      if (time - c.unknownSince >= MIN_GAP_SECONDS) {
        if (c.gaps.length < MAX_GAPS) c.gaps.push({ start: c.unknownSince, end: time });
        else c.omittedGaps++;
      }
      c.unknownSince = null;
    }
    if (!bucket) { bucket = { minute, counts: {} }; record.minutes.push(bucket); }
    bucket.counts[state.direction] = (bucket.counts[state.direction] ?? 0) + 1;
  }
}

export function applyFrame(record: LiveSessionRecord, time: number, seats: Record<string, LiveSeatState>, events: LiveEvent[]):
  { opened: { alert: LiveAlert; still: string | undefined }[]; updated: LiveAlert[] } {
  record.lastTime = time;
  record.framesProcessed++;
  updateCoverage(record, time, seats);
  const opened: { alert: LiveAlert; still: string | undefined }[] = [];
  const updated: LiveAlert[] = [];
  for (const { still, ...event } of events) {
    const index = record.events.length;
    record.events.push({ ...event, segment: Math.max(record.segments.length - 1, 0) });
    if (!event.review_required || (event.direction !== 'left' && event.direction !== 'right')) continue;
    const direction: AlertDirection = event.direction;
    const open = record.alerts.find(a => a.mark === null && a.seatId === event.seat_id && a.direction === direction);
    if (open) {
      open.eventIndexes.push(index);
      open.lastAt = Math.max(open.lastAt, event.end_time);
      if (!updated.includes(open)) updated.push(open);
      continue;
    }
    const alert: LiveAlert = {
      id: `alert-${record.alerts.length + 1}`, seatId: event.seat_id, direction, openedAt: event.start_time,
      lastAt: event.end_time, eventIndexes: [index], still: null, stillError: null, mark: null, note: '', markedAt: null,
    };
    if (still) {
      if (record.stillsSaved < MAX_STILLS) { alert.still = still; record.stillsSaved++; }
      else alert.stillError = 'Still limit reached';
    }
    record.alerts.push(alert);
    opened.push({ alert, still: alert.still ?? undefined });
  }
  return { opened, updated };
}

export function markAlert(record: LiveSessionRecord, alertId: string, mark: AlertMark, note: string, revision: number, now: Date): LiveAlert {
  if (revision !== record.revision) throw new RevisionError('This session changed. Reload and try again.');
  const alert = record.alerts.find(a => a.id === alertId);
  if (!alert) throw new Error('Alert not found.');
  alert.mark = mark;
  alert.note = note;
  alert.markedAt = now.toISOString();
  record.revision++;
  return alert;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function chooseMaxGap(intervalsSeconds: number[]): { maxGap: number; tooSlow: boolean; medianInterval: number } {
  const medianInterval = median(intervalsSeconds);
  const rounded = Math.ceil(Math.round(medianInterval * 2.5 * 4 * 1e6) / 1e6) / 4;
  return { maxGap: Math.min(1.5, Math.max(0.5, rounded)), tooSlow: medianInterval > 1.2, medianInterval };
}

export function rateWarning(intervalsSeconds: number[], maxGap: number): string | null {
  const m = median(intervalsSeconds);
  if (m <= maxGap / 2) return null;
  return `Processing is too slow for movement alerts (${(1 / m).toFixed(1)} FPS). Use fewer detector tiles.`;
}

const seatName = (id: string) => id.startsWith('seat-') ? id.slice(5) : id;
const clock = (seconds: number) => {
  const whole = Math.floor(seconds);
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
};

export function alertTitle(alert: LiveAlert, events: MovementEvent[]): string {
  const seat = seatName(alert.seatId);
  const mine = alert.eventIndexes.map(i => events[i]).filter(Boolean);
  if (mine.length !== 1) return `Check seat ${seat} · ${alert.direction} · ${alert.eventIndexes.length} events since ${clock(alert.openedAt)}`;
  const [event] = mine;
  if (event.event_type === 'repeated_movement')
    return `Check seat ${seat}: turned ${alert.direction} ${event.repetition_count ?? 'several'} times in ${Math.round(event.duration)} s`;
  return `Check seat ${seat}: looking ${alert.direction} for ${event.duration.toFixed(1)} s`;
}
