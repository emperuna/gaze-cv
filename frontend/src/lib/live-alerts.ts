import type { ExamDetails } from './exam-details.ts';
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
  settings: { mirrored: boolean; tileGrid: number; seats: ReviewSeat[]; movement: typeof DEFAULT_MOVEMENT; maxGapAuto: boolean;
    /** Optional exam details for the faculty report; records made before they existed have none. */
    exam?: ExamDetails;
    /** Recordings only: whether strong head turns were read, so Review again repeats the same choice. */
    headTurns?: boolean };
  segments: { startedAt: string; offsetSeconds: number; endSeconds: number | null }[];
  events: (MovementEvent & { segment: number })[]; alerts: LiveAlert[];
  coverage: Record<string, SeatCoverage>; minutes: { minute: number; counts: Record<string, number> }[];
  framesProcessed: number; stillsSaved: number; lastTime: number;
  /** Wall time the live worker stopped without Stop; the resume offset is measured from it. */
  interruptedAt?: string | null;
  /** Set for a session made from a video file; absent for a live camera. `video` is the file name inside the session folder. */
  source?: { kind: 'recording'; filename: string; durationSeconds: number; video: string };
}

export class RevisionError extends Error {}

/**
 * True when a recording review reached `lastTime` but the video's length says more than 5 s and 5% remain: the video
 * stopped decoding early, so the rest was never reviewed. A smaller gap is just an estimated length.
 */
export function stoppedShort(lastTime: number, durationSeconds: number): boolean {
  const gap = durationSeconds - lastTime;
  return gap > 5 && gap > 0.05 * durationSeconds;
}

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

export function applyFrame(record: LiveSessionRecord, time: number, seats: Record<string, LiveSeatState>, events: LiveEvent[],
  options: { groupWithinSeconds?: number } = {}):
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
    const { groupWithinSeconds } = options;
    const matches = (a: LiveAlert) => a.mark === null && a.seatId === event.seat_id && a.direction === direction;
    // Live: any unmarked alert of the seat and direction. Recording: the latest one, only if it was recent enough.
    const open = groupWithinSeconds === undefined ? record.alerts.find(matches)
      : record.alerts.findLast(a => matches(a) && event.start_time - a.lastAt <= groupWithinSeconds);
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
  // At least 1 s: on a phone camera a face can drop out for up to about a second between readings.
  return { maxGap: Math.min(1.5, Math.max(1, rounded)), tooSlow: medianInterval > 1.2, medianInterval };
}

export function rateWarning(intervalsSeconds: number[], maxGap: number): string | null {
  const m = median(intervalsSeconds);
  if (m <= maxGap) return null;
  return `Too slow for alerts (${(1 / m).toFixed(1)} frames/s): use fewer detector tiles.`;
}

const seatName = (id: string) => id.startsWith('seat-') ? id.slice(5) : id;
const clock = (seconds: number) => {
  const whole = Math.floor(seconds);
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
};

/** True when any of the alert's events was read by the head-pose model because the face was turned away. */
export function readFromHeadShape(alert: Pick<LiveAlert, 'eventIndexes'>, events: Pick<MovementEvent, 'estimation_source'>[]): boolean {
  return alert.eventIndexes.some(i => events[i]?.estimation_source === 'head_pose_fallback');
}

export function alertTitle(alert: LiveAlert, events: MovementEvent[]): string {
  const seat = seatName(alert.seatId);
  const mine = alert.eventIndexes.map(i => events[i]).filter(Boolean);
  if (mine.length !== 1) return `Check seat ${seat} · ${alert.direction} · ${alert.eventIndexes.length} events since ${clock(alert.openedAt)}`;
  const [event] = mine;
  if (event.event_type === 'repeated_movement')
    return `Check seat ${seat}: turned ${alert.direction} ${event.repetition_count ?? 'several'} times in ${Math.round(event.duration)} s`;
  return `Check seat ${seat}: looking ${alert.direction} for ${event.duration.toFixed(1)} s`;
}
