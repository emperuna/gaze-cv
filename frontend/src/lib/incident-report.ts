import { DIRECTIONS } from './analysis-contract.ts';
import type { Detection } from './analysis-contract.ts';
import type { CameraResult, CameraSettings } from './camera-contract.ts';
import { timeLabel } from './review-contract.ts';
import type { ReviewRecord, SavedReview } from './review-contract.ts';
import { groupReviewEvents, seatCoverage } from './review-workflow.ts';
import type { ReviewWorkflow } from './review-workflow.ts';

export const MAX_REPORT_ITEMS = 500;
export const MAX_CAMERA_SAMPLES = 18000;
export const REPORT_DISCLAIMER = 'Automated head movements do not establish cheating or intent. Ordinary writing and brief turns can produce these observations. A proctor must review the original context before recording any conclusion.';
export interface ObservationSample { frame: number; time: number; counts: Record<string, number> }
export interface ReportItem { label: string; time: string; detail: string; status: string; notes: string }
export interface IncidentReport {
  schemaVersion: 1; mode: 'image' | 'video' | 'camera'; id: string; source: string; generatedAt: string;
  metadata: [string, string][]; summary: string; items: ReportItem[]; omittedItems: number;
  coverage: string[]; notes: string; reviewer: string; signedOffAt: string | null; limitations: string[];
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

export interface CameraReportSnapshot {
  id: string; method: string; startedAt: string; endedAt: string | null; settings: CameraSettings;
  frames: number; lastTimestamp: number; samples: ObservationSample[]; omittedSamples: number;
  totals: Record<string, number>; gaps: string[]; omittedGaps: number; framesWithoutUsableHeads: number;
}

/** Bounded numeric summaries only: no JPEGs, boxes, identities or continuous video. */
export class CameraReportLog {
  readonly snapshot: CameraReportSnapshot;
  constructor(id: string, settings: CameraSettings) {
    this.snapshot = { id, method: settings.method, startedAt: new Date().toISOString(), endedAt: null, settings: { ...settings },
      frames: 0, lastTimestamp: -1, samples: [], omittedSamples: 0, totals: countDirections([]), gaps: [], omittedGaps: 0, framesWithoutUsableHeads: 0 };
  }
  add(result: CameraResult) {
    const data = this.snapshot;
    if (data.endedAt || result.timestamp_seconds <= data.lastTimestamp) return;
    const counts = countDirections(result.result.detections);
    const previous = Math.max(0, data.lastTimestamp);
    if (result.timestamp_seconds - previous >= 5) {
      const gap = `${timeLabel(previous)} to ${timeLabel(result.timestamp_seconds)}: no intervening processed capture is available.`;
      if (data.gaps.length < 200) data.gaps.push(gap); else data.omittedGaps++;
    }
    data.frames++; data.lastTimestamp = result.timestamp_seconds;
    if (Object.entries(counts).filter(([key]) => key !== 'unknown').reduce((sum, [, count]) => sum + count, 0) === 0) data.framesWithoutUsableHeads++;
    for (const direction of DIRECTIONS) data.totals[direction] += counts[direction];
    if (data.samples.length < MAX_CAMERA_SAMPLES) data.samples.push({ frame: result.id, time: result.timestamp_seconds, counts });
    else data.omittedSamples++;
  }
  end() { this.snapshot.endedAt ??= new Date().toISOString(); }
}

export function cameraIncidentReport(data: CameraReportSnapshot) {
  const report = baseReport('camera', data.id, 'Local live camera - no video recording');
  report.metadata = [['Method', data.method], ['Started at (UTC)', data.startedAt], ['Ended at (UTC)', data.endedAt || 'Still running; report is a snapshot'],
    ['Processed frames', String(data.frames)], ['Last processed capture', data.lastTimestamp < 0 ? 'None' : timeLabel(data.lastTimestamp)],
    ['Direction observations (not unique people)', countLabel(data.totals)], ['Input settings', JSON.stringify(data.settings)]];
  Object.assign(report, observationItems(data.samples));
  report.summary = `${data.frames} processed camera captures; ${report.items.length + report.omittedItems} retained frames have non-forward observations. These are individual observations, not tracked or confirmed incidents.`;
  report.coverage = [`${data.framesWithoutUsableHeads} processed frames have no usable head direction. No continuous coverage is inferred between captures.`, ...data.gaps];
  if (data.omittedGaps) report.coverage.push(`${data.omittedGaps} additional sampling gaps are omitted from this bounded report.`);
  if (data.omittedSamples) report.coverage.push(`${data.omittedSamples} later frame summaries were not retained after the ${MAX_CAMERA_SAMPLES}-frame limit. Totals include them; the item list is incomplete.`);
  report.limitations.push('Capture time is elapsed camera-session time. Frames/pixels are not saved; this report cannot replay or independently verify the scene.',
    'Camera mode does not assign seats, track people, or establish sustained/repeated movements. Slow inference and interrupted capture create unobserved intervals.',
    'Numeric summaries expire from server memory after 30 minutes following Stop, on server restart, or when the eight-session cache fills. Download and retain the PDF as needed.');
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
