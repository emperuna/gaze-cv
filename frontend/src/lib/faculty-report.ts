import { displaySeats } from './camera-sessions.ts';
import { EMPTY_EXAM } from './exam-details.ts';
import type { ExamDetails } from './exam-details.ts';
import type { LiveAlert, LiveSessionRecord } from './live-alerts.ts';
import type { MovementEvent } from './review-contract.ts';

/** Added to an alert's rule line when part of the turn was read by the head-pose model. */
export const HEAD_SHAPE_NOTE = 'The face was turned away, so part of this turn was read from the shape of the head.';

/**
 * The faculty seat check report: everything the PDF's camera layout prints, already in plain words and
 * clock times. Faculty read it after an exam to decide which seats to look at again; it never judges anyone.
 */
type SeatStatus = 'look-again' | 'dismissed';
type MarkKind = 'checked' | 'not-reviewed' | 'dismissed';
type Span = { from: number; to: number };

export interface FacultyAlert {
  time: string; title: string; rule: string; mark: 'Checked' | 'Dismissed' | null; markedAt: string | null;
  note: string; image: string | null; imageNote: string | null;
}
export interface FacultyReport {
  exam: ExamDetails; date: string; timeRange: string; seatsWatched: number;
  glance: { alerts: number; lookAgain: number; notReviewed: number; notWatchedMinutes: number };
  seats: { seat: string; status: SeatStatus; alerts: number; saw: string; when: string; marks: string }[];
  quietSeats: string;
  map: { label: string; roi: [number, number, number, number]; status: SeatStatus | 'none'; hidden: boolean }[];
  timeline: { ticks: { at: number; label: string }[]; rows: { label: string; marks: { at: number; kind: MarkKind }[]; hidden: Span[] }[]; off: Span[] };
  alertGroups: { seat: string; status: SeatStatus; alerts: FacultyAlert[] }[];
  /** Alerts left out of the details because of the 500-alert limit (the at-a-glance count includes them). */
  omittedAlerts: number;
  blindSpots: { what: string; when: string; reason: string }[];
  reviewSeats: string[]; rules: string; sessionLine: string;
}

/** A seat hidden for at least this share of the session is drawn dashed on the seat map. */
const HIDDEN_SHARE = .10;
/** Hidden seats below this share are left out of the blind-spot table. */
const REPORTED_SHARE = .01;
const MIN_TAIL_SECONDS = 2;
/** The PDF shows at most this many alerts in its details (look-again seats first) and marks per timeline row. */
const MAX_DETAIL_ALERTS = 500;
const MAX_BLIND_SPOTS = 60;
const MAX_OFF_GAPS = 100;

const seatNumber = (seatId: string) => seatId.replace(/^seat-/, '');
const seatName = (seatId: string) => seatId.startsWith('seat-') ? `Seat ${seatNumber(seatId)}` : seatId;
const number = (value: number) => Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

function format(date: Date, timeZone?: string) {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(date).replace(/[  ]/g, ' ');
}

/** Clock time of a session second: the segment it falls in, counted from that segment's start (session time ≥ 0). */
export function clockAt(record: Pick<LiveSessionRecord, 'segments'>, seconds: number, timeZone?: string): string {
  return format(clockDate(record, seconds), timeZone);
}
function clockDate(record: Pick<LiveSessionRecord, 'segments'>, seconds: number) {
  const segments = record.segments.length ? record.segments : [{ startedAt: new Date(0).toISOString(), offsetSeconds: 0, endSeconds: null }];
  // The first segment's offset is negative (the preview's capture time); its session clock starts at 0.
  const base = (segment: typeof segments[number]) => Math.max(segment.offsetSeconds, 0);
  const segment = [...segments].reverse().find(item => base(item) <= seconds) ?? segments[0];
  return new Date(Date.parse(segment.startedAt) + (seconds - base(segment)) * 1000);
}

/** A calendar day in the report's time zone, to tell whether a mark was made on the day of the exam. */
function dayKey(date: Date, timeZone?: string) {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).format(date);
}
/** "Mon 23 Nov". */
function shortDate(date: Date, timeZone?: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone })
    .formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.weekday} ${parts.day} ${parts.month}`;
}

/** "9:41–9:58 AM", "11:50 AM–12:10 PM", or one time when both ends are equal. */
function range(from: string, to: string) {
  if (from === to) return from;
  const suffix = (text: string) => text.slice(-3);
  return suffix(from) === suffix(to) ? `${from.slice(0, -3)}–${to}` : `${from}–${to}`;
}

function duration(seconds: number) {
  const hours = Math.floor(seconds / 3600), minutes = Math.round((seconds % 3600) / 60);
  if (!hours) return `${Math.max(minutes, 1)} min`;
  return minutes ? `${hours} h ${minutes} min` : `${hours} h`;
}

function listSeats(numbers: string[]) {
  if (numbers.length === 1) return `Seat ${numbers[0]}`;
  return `Seats ${numbers.slice(0, -1).join(', ')} and ${numbers.at(-1)}`;
}

function marksText(alerts: LiveAlert[]) {
  const counts: [number, string, string][] = [
    [alerts.filter(a => a.mark === 'Checked').length, 'Checked', 'Checked'],
    [alerts.filter(a => a.mark === 'Dismissed').length, 'Dismissed', 'Dismissed'],
    [alerts.filter(a => a.mark === null).length, 'not reviewed', 'Not reviewed'],
  ];
  const parts = counts.filter(([count]) => count > 0);
  if (parts.length === 1 && parts[0][0] === 1) return parts[0][2];
  return parts.map(([count, word]) => `${count} ${word}`).join(' · ');
}

/** Turns an event contributes: a repeated record counts its turns, a sustained one counts one. */
const turnsOf = (event: MovementEvent) => event.event_type === 'repeated_movement' ? event.repetition_count ?? 1 : 1;

export function facultyReport(record: LiveSessionRecord, opts: { hasStill: (still: string) => boolean; now: Date; timeZone?: string }): FacultyReport {
  const { settings } = record;
  const zone = opts.timeZone;
  const clock = (seconds: number) => clockAt(record, seconds, zone);
  const total = record.lastTime > 0 ? record.lastTime : 1;
  const eventsOf = (alert: LiveAlert) => alert.eventIndexes.map(index => record.events[index]).filter(Boolean);

  // Camera-off gaps, in session seconds: the time between monitored stretches. A resume that never received a
  // frame has no monitored stretch (its end is before its start), and every stretch is clamped to the session.
  const watched = record.segments.map(segment => ({ start: Math.min(Math.max(segment.offsetSeconds, 0), record.lastTime),
    end: Math.min(segment.endSeconds ?? record.lastTime, record.lastTime) }))
    .filter(span => span.end > span.start).sort((a, b) => a.start - b.start);
  const offGaps: { start: number; end: number }[] = [];
  let watchedUntil = watched.length ? watched[0].end : 0;
  for (const span of watched.slice(1)) {
    if (span.start > watchedUntil) offGaps.push({ start: watchedUntil, end: span.start });
    watchedUntil = Math.max(watchedUntil, span.end);
  }

  // Seats with alerts, ranked: seats with alerts not dismissed first, then dismissed-only seats.
  const bySeat = new Map<string, LiveAlert[]>();
  for (const alert of [...record.alerts].sort((a, b) => a.openedAt - b.openedAt)) bySeat.set(alert.seatId, [...(bySeat.get(alert.seatId) ?? []), alert]);
  const ranked = [...bySeat.entries()].map(([seatId, alerts]) => {
    const open = alerts.filter(alert => alert.mark !== 'Dismissed').length;
    return { seatId, alerts, open, status: (open > 0 ? 'look-again' : 'dismissed') as SeatStatus };
  }).sort((a, b) => (b.open > 0 ? 1 : 0) - (a.open > 0 ? 1 : 0) || b.open - a.open || b.alerts.length - a.alerts.length
    || Number(seatNumber(a.seatId)) - Number(seatNumber(b.seatId)));
  const statusOf = new Map(ranked.map(item => [item.seatId, item.status]));

  const seats = ranked.map(({ seatId, alerts, status }) => {
    const events = alerts.flatMap(eventsOf);
    const directions = new Set(alerts.map(alert => alert.direction));
    const direction = directions.size === 1 ? [...directions][0] : 'left or right';
    let saw: string;
    if (events.length === 1 && events[0].event_type !== 'repeated_movement') saw = `1 alert · looked ${direction} for ${number(events[0].duration)} s`;
    else {
      const longest = Math.max(0, ...events.filter(e => e.event_type !== 'repeated_movement').map(e => e.duration));
      saw = `${plural(alerts.length, 'alert')} · turned ${direction} ${events.reduce((sum, e) => sum + turnsOf(e), 0)} times` + (longest ? ` · longest ${number(longest)} s` : '');
    }
    const first = Math.min(...alerts.map(a => a.openedAt)), last = Math.max(...alerts.map(a => a.lastAt));
    return { seat: seatName(seatId), status, alerts: alerts.length, saw, when: range(clock(first), clock(last)), marks: marksText(alerts) };
  });

  const hiddenShare = (seatId: string) => {
    const seat = record.coverage[seatId];
    return seat && seat.frames > 0 ? (seat.frames - seat.observedFrames) / seat.frames : 0;
  };
  const isHidden = (seatId: string) => hiddenShare(seatId) >= HIDDEN_SHARE - 1e-9;
  // Quiet seats that were hidden for a while are named separately, so "no alerts" never reads as "cleared".
  const quietIds = settings.seats.map(seat => seat.id).filter(id => !bySeat.has(id));
  const visibleQuiet = quietIds.filter(id => !isHidden(id)).map(seatNumber);
  const hiddenQuiet = quietIds.filter(isHidden).sort((a, b) => hiddenShare(b) - hiddenShare(a))
    .map((id, index) => `${seatName(id)}${index === 0 ? ' was hidden' : ''} ${Math.round(hiddenShare(id) * 100)}%`);
  const hiddenText = hiddenQuiet.length ? `${hiddenQuiet.length === 1 ? hiddenQuiet[0] : `${hiddenQuiet.slice(0, -1).join(', ')} and ${hiddenQuiet.at(-1)}`} of the exam (see page 3).` : '';
  const quietSeats = !quietIds.length ? '' : !hiddenQuiet.length && !record.alerts.length ? 'No alerts on any seat.'
    : [visibleQuiet.length ? `No alerts: ${listSeats(visibleQuiet)}.` : hiddenText ? 'No alerts, but' : '', hiddenText].filter(Boolean).join(' ');
  const hiddenSpans = (seatId: string) => {
    const seat = record.coverage[seatId];
    if (!seat) return [] as { start: number; end: number }[];
    const spans = [...seat.gaps];
    if (seat.unknownSince !== null && record.lastTime - seat.unknownSince >= MIN_TAIL_SECONDS) spans.push({ start: seat.unknownSince, end: record.lastTime });
    return spans;
  };

  const map = displaySeats(settings).map(seat => ({
    label: seatNumber(seat.id), roi: [...seat.roi] as [number, number, number, number],
    status: statusOf.get(seat.id) ?? 'none' as const, hidden: isHidden(seat.id),
  }));

  const step = total >= 3600 ? 1800 : total >= 1200 ? 600 : 300;
  const ticks = [];
  for (let at = 0; at <= total + 1e-6; at += step) ticks.push({ at: at / total, label: clock(at).slice(0, -3) });
  const kindOf = (alert: LiveAlert): MarkKind => alert.mark === 'Checked' ? 'checked' : alert.mark === 'Dismissed' ? 'dismissed' : 'not-reviewed';
  const timeline = {
    ticks,
    rows: settings.seats.map(seat => ({
      label: seatName(seat.id),
      marks: (bySeat.get(seat.id) ?? []).slice(0, MAX_DETAIL_ALERTS).map(alert => ({ at: alert.openedAt / total, kind: kindOf(alert) })),
      hidden: hiddenSpans(seat.id).map(span => ({ from: span.start / total, to: Math.min(span.end, total) / total })),
    })),
    off: offGaps.slice(0, MAX_OFF_GAPS).map(gap => ({ from: gap.start / total, to: gap.end / total })),
  };

  const sustainedRule = `Held one direction longer than the ${number(settings.movement.min_duration)}-second rule.`;
  const repeatedRule = `Repeated turns: ${settings.movement.repetition_count} or more within ${number(settings.movement.repetition_window)} seconds.`;
  // Details stop at MAX_DETAIL_ALERTS, taken in ranked seat order, so seats to look at again are never cut first.
  let budget = MAX_DETAIL_ALERTS;
  const sessionDay = dayKey(clockDate(record, 0), zone);
  const markTime = (iso: string) => {
    const date = new Date(iso);
    return dayKey(date, zone) === sessionDay ? format(date, zone) : `${shortDate(date, zone)}, ${format(date, zone)}`;
  };
  const alertGroups = ranked.map(({ seatId, alerts, status }) => {
    const kept = alerts.slice(0, Math.max(budget, 0));
    budget -= kept.length;
    return { seatId, status, kept };
  }).filter(group => group.kept.length).map(({ seatId, status, kept }) => ({
    seat: seatName(seatId), status,
    alerts: kept.map((alert): FacultyAlert => {
      const events = eventsOf(alert);
      const repeated = events.some(e => e.event_type === 'repeated_movement');
      const title = events.length === 1 && !repeated ? `Looked ${alert.direction} for ${number(events[0].duration)} seconds`
        : `Turned ${alert.direction} ${events.reduce((sum, e) => sum + turnsOf(e), 0)} times`;
      const image = alert.still && opts.hasStill(alert.still) ? alert.still : null;
      return { time: range(clock(alert.openedAt), clock(alert.lastAt)), title, rule: (repeated ? repeatedRule : sustainedRule) + (events.some(e => e.estimation_source === 'head_pose_fallback') ? ` ${HEAD_SHAPE_NOTE}` : ''),
        mark: alert.mark, markedAt: alert.markedAt ? markTime(alert.markedAt) : null, note: alert.note,
        image, imageNote: image ? null : 'Photo unavailable' };
    }),
  }));

  const allBlindSpots = [
    ...offGaps.map(gap => ({ what: 'Whole room not watched', when: `${range(clock(gap.start), clock(gap.end))} (${duration(gap.end - gap.start)})`, reason: 'Camera stopped; monitoring resumed' })),
    ...settings.seats.map(seat => ({ seat, share: hiddenShare(seat.id) })).filter(item => item.share >= REPORTED_SHARE)
      .sort((a, b) => b.share - a.share).map(({ seat, share }) => {
        const longest = hiddenSpans(seat.id).sort((a, b) => (b.end - b.start) - (a.end - a.start))[0];
        const when = longest && longest.end - longest.start >= 60 ? range(clock(longest.start), clock(longest.end)) : 'Short moments';
        return { what: `${seatName(seat.id)} hidden`, when: `${when} · ${Math.round(share * 100)}% of the exam`, reason: 'Face not visible' };
      }),
  ];
  const blindSpots = allBlindSpots.length <= MAX_BLIND_SPOTS ? allBlindSpots
    : [...allBlindSpots.slice(0, MAX_BLIND_SPOTS - 1), { what: `${allBlindSpots.length - MAX_BLIND_SPOTS + 1} more`, when: 'Not listed here', reason: 'See the seats above' }];

  const start = clock(0);
  const startDate = clockDate(record, 0);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: zone })
    .formatToParts(startDate).map(part => [part.type, part.value]));
  const { min_duration: minimum, repetition_count: count, repetition_window: window } = settings.movement;
  return {
    exam: { ...EMPTY_EXAM, ...(settings.exam ?? {}) },
    date: `${parts.weekday} ${parts.day} ${parts.month} ${parts.year}`,
    timeRange: record.state === 'monitoring' ? `${start} – now (still running)` : `${range(start, clock(record.lastTime))} (${duration(record.lastTime)})`,
    seatsWatched: settings.seats.length,
    glance: { alerts: record.alerts.length, lookAgain: ranked.filter(item => item.status === 'look-again').length,
      notReviewed: record.alerts.filter(alert => alert.mark === null).length,
      notWatchedMinutes: Math.round(offGaps.reduce((sum, gap) => sum + gap.end - gap.start, 0) / 60) },
    seats, quietSeats, map, timeline, alertGroups, blindSpots,
    omittedAlerts: record.alerts.length - alertGroups.reduce((sum, group) => sum + group.alerts.length, 0),
    reviewSeats: ranked.map(item => seatName(item.seatId)),
    rules: `An alert means a head in that seat turned left or right for ${number(minimum)} seconds or more, or ${count} times within ${number(window)} seconds. Looking down (writing) never raises an alert. Ocular does not recognise anyone and does not decide whether anyone cheated: you do.`,
    sessionLine: `Session details for your records: session ${record.id.slice(0, 8)} · camera started ${start} · alert rules: ${number(minimum)} s, ${count} turns in ${number(window)} s.`,
  };
}
