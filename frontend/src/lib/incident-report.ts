import { DIRECTIONS } from './analysis-contract.ts';
import type { Detection } from './analysis-contract.ts';
import { alertTitle } from './live-alerts.ts';
import type { LiveSessionRecord } from './live-alerts.ts';
import { timeLabel } from './review-contract.ts';
import type { ReviewRecord, SavedReview } from './review-contract.ts';
import { groupReviewEvents, seatCoverage } from './review-workflow.ts';
import type { ReviewWorkflow } from './review-workflow.ts';

export const MAX_REPORT_ITEMS = 500;
export const REPORT_DISCLAIMER = 'Automated head movements do not establish cheating or intent. Ordinary writing and brief turns can produce these observations. A proctor must review the original context before recording any conclusion.';
export interface ObservationSample { frame: number; time: number; counts: Record<string, number> }
export interface ReportItem { label: string; time: string; detail: string; status: string; notes: string; image?: string | null }
export interface IncidentReport {
  schemaVersion: 1; mode: 'image' | 'video' | 'camera'; id: string; source: string; generatedAt: string;
  metadata: [string, string][]; summary: string; items: ReportItem[]; omittedItems: number;
  coverage: string[]; notes: string; reviewer: string; signedOffAt: string | null; limitations: string[];
  /** Absolute session folder that item images are relative to; set with `confidential` for stills. */
  imageRoot?: string; confidential?: boolean;
}

export function countDirections(detections: Detection[]) {
  const counts: Record<string, number> = Object.fromEntries(DIRECTIONS.map(direction => [direction, 0]));
  for (const detection of detections) counts[!detection.unavailable_reason && DIRECTIONS.includes(detection.direction as typeof DIRECTIONS[number]) ? detection.direction : 'unknown']++;
  return counts;
}
const nonForward = (counts: Record<string, number>) => ['left', 'right', 'down'].reduce((sum, key) => sum + (counts[key] || 0), 0);
const countLabel = (counts: Record<string, number>) => DIRECTIONS.map(direction => `${direction}: ${counts[direction] || 0}`).join('; ');

export function baseReport(mode: IncidentReport['mode'], id: string, source: string): IncidentReport {
  return { schemaVersion: 1, mode, id, source, generatedAt: new Date().toISOString(), metadata: [], summary: '',
    items: [], omittedItems: 0, coverage: [], notes: '', reviewer: '', signedOffAt: null,
    limitations: [REPORT_DISCLAIMER, 'Seat references identify positions, not people. No cheating probability or disciplinary recommendation is generated.'] };
}

export function imageIncidentReport(id: string, filename: string, details: {
  result: { detections: Detection[]; width: number; height: number }; input_sha256?: string; pipeline?: unknown;
}, method: string, processedAt: string) {
  const report = baseReport('image', id, filename), detections = details.result.detections;
  const candidates = detections.map((detection, index) => ({ detection, index }))
    .filter(({ detection }) => ['left', 'right', 'down'].includes(detection.direction) && !detection.unavailable_reason);
  report.metadata = [['Method', method], ['Processed at (UTC)', processedAt], ['Source SHA256', details.input_sha256 || 'Unavailable in this record'],
    ['Image size', `${details.result.width} x ${details.result.height}`], ['Direction observations', countLabel(countDirections(detections))]];
  report.summary = `${candidates.length} non-forward head observations are listed for contextual review. A single image cannot establish duration, repetition, or an examination incident.`;
  report.items = candidates.slice(0, MAX_REPORT_ITEMS).map(({ detection, index }) => ({ label: `Detection ${index + 1}: ${detection.direction}`,
    time: 'Single image - no session timestamp or duration', detail: `Image box (x, y, width, height): ${detection.bbox.join(', ')}. This number is a detection reference, not a seat or identity.`, status: 'Unreviewed observation', notes: '' }));
  report.omittedItems = Math.max(0, candidates.length - report.items.length);
  report.coverage = [`${detections.length} detections in this image. Unknown directions: ${countDirections(detections).unknown}. Undetected heads are not counted; an empty result does not establish an empty room or absence of incidents.`];
  report.limitations.push('Image mode has no seat association, temporal movement rules, or identity tracking. Directions are camera-relative.');
  return report;
}

/** Reports individual processed frames; it never invents a person track between frames. */
export function observationItems(samples: ObservationSample[]) {
  const candidates = samples.filter(sample => nonForward(sample.counts) > 0);
  return { items: candidates.slice(0, MAX_REPORT_ITEMS).map(sample => ({ label: `Frame ${sample.frame}: non-forward observations`,
    time: timeLabel(sample.time), detail: countLabel(sample.counts), status: 'Unreviewed frame observation', notes: '' })),
    omittedItems: Math.max(0, candidates.length - MAX_REPORT_ITEMS) };
}

const seatLabel = (id: string) => `Seat ${id.startsWith('seat-') ? id.slice(5) : id}`;
const clock = (seconds: number) => {
  const whole = Math.floor(seconds);
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
};
const MIN_TAIL_GAP_SECONDS = 2;

/**
 * Alerts, marks, stills and coverage of a live session; `recordRoot` is the session folder that holds `stills/`.
 * `hasStill` says whether a saved still's file is still there; a missing one is listed as "Still unavailable"
 * without an image, so one lost file does not stop the whole PDF.
 */
export function liveSessionReport(record: LiveSessionRecord, recordRoot: string, hasStill: (still: string) => boolean = () => true): IncidentReport {
  const report = baseReport('camera', record.id, 'Local live camera - saved alerts and stills');
  const { settings } = record;
  report.confidential = true; report.imageRoot = recordRoot;
  const alerts = record.alerts.slice(0, MAX_REPORT_ITEMS);
  report.items = alerts.map(alert => {
    const image = alert.still && hasStill(alert.still) ? alert.still : null;
    return { label: alertTitle(alert, record.events), time: `${clock(alert.openedAt)} \u2013 ${clock(alert.lastAt)}`,
      detail: `${alert.eventIndexes.map(i => record.events[i]?.event_type).filter(Boolean).join(', ') || 'movement'}; looking ${alert.direction}; ${alert.eventIndexes.length} ${alert.eventIndexes.length === 1 ? 'event' : 'events'}; ${seatLabel(alert.seatId)}.`
        + (image ? '' : alert.still ? ' Still unavailable: the image file is missing.' : alert.stillError ? ` No still saved: ${alert.stillError}` : ' No still saved.'),
      status: alert.mark ?? 'Not reviewed', notes: alert.note, image };
  });
  report.omittedItems = Math.max(0, record.alerts.length - alerts.length);
  const withoutStill = record.alerts.filter(alert => !alert.still || !hasStill(alert.still)).length;
  report.metadata = [['Method', 'Baseline'], ['Session started (UTC)', record.createdAt], ['Session ended (UTC)', record.endedAt ?? 'Not ended'],
    ['Seats', settings.seats.map(seat => seatLabel(seat.id)).join(', ') || 'None'], ['Movement settings', JSON.stringify(settings.movement)],
    ['Maximum gap', `${settings.movement.max_gap} s (${settings.maxGapAuto ? 'automatic' : 'manual'})`],
    ['Monitoring segments', record.segments.map(segment => `${clock(segment.offsetSeconds)} to ${segment.endSeconds === null ? 'open' : clock(segment.endSeconds)}`).join('; ') || 'None'],
    ['Processed frames', String(record.framesProcessed)]];
  const unmarked = record.alerts.filter(alert => !alert.mark).length;
  report.summary = `${record.alerts.length} seat checks were raised; ${unmarked} not reviewed. Stills are listed with the alert that produced them. These are head-movement observations for review, not findings.`;
  record.segments.slice(1).forEach((next, index) => {
    const end = record.segments[index].endSeconds;
    if (end !== null && next.offsetSeconds > end) report.coverage.push(`Not monitored from ${clock(end)} to ${clock(next.offsetSeconds)}`);
  });
  for (const [seatId, seat] of Object.entries(record.coverage)) {
    if (seat.frames === 0) { report.coverage.push(`${seatLabel(seatId)}: not observed`); continue; }
    const unknown = seat.gaps.map(gap => `unknown ${clock(gap.start)}\u2013${clock(gap.end)}`);
    if (seat.unknownSince !== null && record.lastTime - seat.unknownSince >= MIN_TAIL_GAP_SECONDS)
      unknown.push(`unknown ${clock(seat.unknownSince)}\u2013${clock(record.lastTime)} (still unknown at the end)`);
    if (seat.omittedGaps) unknown.push(`${seat.omittedGaps} further unknown intervals not listed`);
    report.coverage.push([`${seatLabel(seatId)}: observed ${Math.round(100 * seat.observedFrames / seat.frames)}% of processed frames`, ...unknown].join('; '));
  }
  if (withoutStill) report.coverage.push(`${withoutStill} ${withoutStill === 1 ? 'alert' : 'alerts'} without a saved still.`);
  report.limitations.push('Stills show one frame at the moment of the alert and cannot replay the scene. The session folder holds no video.',
    'Frames where a seat could not be read are shown as unknown time, not as forward-facing time.');
  return report;
}

export function savedIncidentReport(meta: SavedReview, record: ReviewRecord, workflow: ReviewWorkflow) {
  const report = baseReport('video', meta.id, meta.filename), groups = groupReviewEvents(record);
  report.metadata = [['Method', record.settings.method], ['Source SHA256', record.source_sha256], ['Session created (UTC)', meta.createdAt],
    ['Processed source duration', timeLabel(record.source.processed_duration_seconds)], ['Review revision', `${workflow.revision}; saved ${workflow.updatedAt || 'not yet saved'}`],
    ['Movement settings', JSON.stringify(record.settings.movement)]];
  report.summary = workflow.summary;
  report.items = groups.slice(0, MAX_REPORT_ITEMS).map(item => ({ label: `${item.seatId}: ${item.direction}`,
    time: `${timeLabel(item.start)} to ${timeLabel(item.end)}`, status: workflow.items[item.id]?.status || 'Unreviewed',
    detail: `${item.eventIndexes.length} original movement records. Context: ${timeLabel(item.contextStart)} to ${timeLabel(item.contextEnd)}. ` + item.eventIndexes.slice(0, 25).map(index => {
      const event = record.events[index]; return `${event.event_type}: ${timeLabel(event.start_time)} to ${timeLabel(event.end_time)}, triggered ${timeLabel(event.observed_at)}.`;
    }).join(' ') + (item.eventIndexes.length > 25 ? ' Further original records remain in the session JSON.' : ''), notes: workflow.items[item.id]?.notes || '' }));
  report.omittedItems = Math.max(0, groups.length - MAX_REPORT_ITEMS);
  for (const coverage of seatCoverage(record)) {
    report.coverage.push(`${coverage.seatId}: ${coverage.percent.toFixed(1)}% usable direction coverage; ${coverage.unavailableSeconds.toFixed(2)} seconds unavailable.`);
    for (const gap of coverage.gaps.slice(0, 25)) report.coverage.push(`${coverage.seatId}, ${timeLabel(gap.start)} to ${timeLabel(gap.end)}: ${gap.reason}.`);
    if (coverage.gaps.length > 25) report.coverage.push(`${coverage.seatId}: ${coverage.gaps.length - 25} further intervals omitted; the session JSON retains all observations.`);
  }
  report.notes = workflow.proctorNotes; report.reviewer = workflow.reviewer; report.signedOffAt = workflow.signedOffAt;
  report.limitations.push('Grouping preserves original events and does not make a misconduct determination. Missing observations do not count as continuous movement.', ...record.limitations);
  return report;
}
