import { timeLabel } from './review-contract.ts';
import type { Direction } from './analysis-contract.ts';
import type { MovementEvent, ReviewRecord, SavedReview } from './review-contract.ts';

export const REVIEW_STATUSES = ['Unreviewed', 'Reviewed', 'Follow-up needed'] as const;
export type ReviewStatus = typeof REVIEW_STATUSES[number];
export const GROUP_GAP_SECONDS = 2;
export const CONTEXT_SECONDS = 5;
export interface ReviewItem {
  id: string; seatId: string; direction: Direction; start: number; end: number;
  contextStart: number; contextEnd: number; eventIndexes: number[];
}
export interface CoverageGap { start: number; end: number; reason: string }
export interface SeatCoverage {
  seatId: string; observedSeconds: number; unavailableSeconds: number; percent: number;
  gaps: CoverageGap[];
}
export interface ItemDecision { status: ReviewStatus; notes: string }
export interface ReviewWorkflow {
  schemaVersion: 1; revision: number; updatedAt: string | null;
  items: Record<string, ItemDecision>; summary: string; proctorNotes: string;
  reviewer: string; signedOffAt: string | null;
}

/** Group related rules without joining different seats/directions or bridging unavailable observations. */
export function groupReviewEvents(record: ReviewRecord): ReviewItem[] {
  const groups: ReviewItem[] = [];
  const latest = new Map<string, ReviewItem>();
  const duration = record.source.processed_duration_seconds;
  const events = record.events.map((event, index) => ({ event, index }))
    .sort((a, b) => a.event.start_time - b.event.start_time || a.index - b.index);
  for (const { event, index } of events) {
    const key = JSON.stringify([event.seat_id, event.direction]);
    const prior = latest.get(key);
    const bridgeStart = Math.min(prior?.end ?? event.start_time, event.start_time);
    const bridgeEnd = Math.max(prior?.end ?? event.start_time, event.start_time);
    // Require real frame coverage, including the join boundary, before merging.
    const first = Math.max(0, Math.floor(bridgeStart * record.source.fps + 1e-7));
    const last = Math.min(record.frames.length - 1, Math.floor(bridgeEnd * record.source.fps + 1e-7));
    let continuous = bridgeEnd < duration;
    if (prior && event.start_time - prior.end <= GROUP_GAP_SECONDS) {
      for (let i = first; i <= last && continuous; i++) {
        const frame = record.frames[i];
        const state = frame?.seats[event.seat_id];
        if (!frame || frame.frame_index !== i || !state || state.direction === 'unknown' || state.reason) continuous = false;
      }
    }
    if (prior && event.start_time - prior.end <= GROUP_GAP_SECONDS && continuous) {
      prior.end = Math.max(prior.end, event.end_time);
      prior.contextEnd = Math.min(duration, prior.end + CONTEXT_SECONDS);
      prior.eventIndexes.push(index);
    } else {
      const item: ReviewItem = { id: `event-${index}`, seatId: event.seat_id, direction: event.direction,
        start: event.start_time, end: event.end_time, contextStart: Math.max(0, event.start_time - CONTEXT_SECONDS),
        contextEnd: Math.min(duration, event.end_time + CONTEXT_SECONDS), eventIndexes: [index] };
      groups.push(item); latest.set(key, item);
    }
  }
  return groups;
}

/** Frame intervals, rather than history sample endpoints, determine observed elapsed time. */
export function seatCoverage(record: ReviewRecord): SeatCoverage[] {
  const duration = record.source.processed_duration_seconds;
  const fps = record.source.fps;
  const count = Math.ceil(duration * fps - 1e-7);
  return record.settings.seats.map(seat => {
    const gaps: CoverageGap[] = [];
    let observedSeconds = 0;
    for (let i = 0; i < count; i++) {
      const start = i / fps, end = Math.min(duration, (i + 1) / fps);
      const frame = record.frames[i];
      const state = frame?.frame_index === i ? frame.seats[seat.id] : undefined;
      const reason = !state ? 'missing observation' : state.reason?.replaceAll('_', ' ') || (state.direction === 'unknown' ? 'unknown direction' : '');
      if (!reason) observedSeconds += end - start;
      else {
        const prior = gaps.at(-1);
        if (prior && prior.reason === reason && Math.abs(prior.end - start) < 1e-6) prior.end = end;
        else gaps.push({ start, end, reason });
      }
    }
    return { seatId: seat.id, observedSeconds, unavailableSeconds: Math.max(0, duration - observedSeconds),
      percent: duration > 0 ? 100 * observedSeconds / duration : 0, gaps };
  });
}

export function emptyWorkflow(record: ReviewRecord): ReviewWorkflow {
  const groups = groupReviewEvents(record);
  return { schemaVersion: 1, revision: 0, updatedAt: null, items: Object.fromEntries(groups.map(item =>
    [item.id, { status: 'Unreviewed', notes: '' }])),
    summary: `${groups.length} review items summarize ${record.events.length} movement records across ${record.settings.seats.length} fixed seats. Review the surrounding footage and coverage gaps before recording conclusions. Head movement alone does not establish misconduct.`,
    proctorNotes: '', reviewer: '', signedOffAt: null };
}

export function validateWorkflowUpdate(value: unknown, record: ReviewRecord) {
  if (!value || typeof value !== 'object') throw new Error('Review notes are required.');
  const input = value as ReviewWorkflow & { signedOff: boolean };
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw new Error('Invalid review revision.');
  const text = (value: unknown, max: number, label: string) => {
    if (typeof value !== 'string' || value.length > max) throw new Error(`${label} must contain at most ${max} characters.`);
    return value;
  };
  const summary = text(input.summary, 20000, 'Summary');
  const proctorNotes = text(input.proctorNotes, 10000, 'Proctor notes');
  const reviewer = text(input.reviewer, 120, 'Reviewer name').trim();
  if (typeof input.signedOff !== 'boolean' || (input.signedOff && !reviewer)) throw new Error('Enter the reviewer name before signing off.');
  const ids = new Set(groupReviewEvents(record).map(item => item.id));
  if (!input.items || typeof input.items !== 'object' || Array.isArray(input.items) || Object.keys(input.items).some(id => !ids.has(id))) throw new Error('Unknown review item. Reopen this session.');
  const items: Record<string, ItemDecision> = {};
  for (const id of ids) {
    const item = Object.hasOwn(input.items, id) ? input.items[id] : undefined;
    if (!item || !REVIEW_STATUSES.includes(item.status)) throw new Error('Choose a valid status for every review item.');
    items[id] = { status: item.status, notes: text(item.notes, 2000, 'Item notes') };
  }
  return { revision: input.revision, items, summary, proctorNotes, reviewer, signedOff: input.signedOff };
}

// Report text is escaped so user notes cannot inject HTML or Markdown structure.
const reportText = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replace(/[\\`*_{}\[\]()#+.!|>-]/g, '\\$&').replace(/\r?\n/g, '\n\n');

export function sessionReport(meta: SavedReview, record: ReviewRecord, workflow: ReviewWorkflow): string {
  const lines = ['# Ocular session review report', '', `Session: ${meta.id}`, `Source: ${reportText(meta.filename)}`,
    `Source SHA256: ${record.source_sha256}`, `Session created: ${meta.createdAt}`,
    `Report saved: ${workflow.updatedAt ?? 'Not saved'}`, `Review revision: ${workflow.revision}`,
    `Method: ${record.settings.method}; duration: ${timeLabel(record.source.processed_duration_seconds)}`,
    '', '## Editable summary', '', reportText(workflow.summary), '', '## Review queue', ''];
  const groups = groupReviewEvents(record);
  if (!groups.length) lines.push('No movement events were recorded. This does not establish that no relevant movements occurred.');
  for (const item of groups) {
    const decision = workflow.items[item.id];
    lines.push(`### ${reportText(item.seatId)} — ${item.direction} — ${timeLabel(item.start)}–${timeLabel(item.end)}`,
      '', `Status: ${decision?.status ?? 'Unreviewed'}; ${item.eventIndexes.length} source movement records.`,
      `Surrounding footage: ${timeLabel(item.contextStart)}–${timeLabel(item.contextEnd)}.`,
      ...item.eventIndexes.map(index => {
        const event: MovementEvent = record.events[index];
        return `- ${reportText(event.event_type)}: ${timeLabel(event.start_time)}–${timeLabel(event.end_time)}; rule triggered ${timeLabel(event.observed_at)}.`;
      }), '', `Notes: ${reportText(decision?.notes || 'None')}`, '');
  }
  lines.push('## Coverage gaps', '', 'Coverage measures usable direction observations, not accuracy, attendance, or proof of an obstruction.');
  for (const seat of seatCoverage(record)) {
    lines.push('', `### ${reportText(seat.seatId)}`, '', `${seat.percent.toFixed(1)}% observed; ${seat.unavailableSeconds.toFixed(2)} seconds unavailable.`);
    for (const gap of seat.gaps.slice(0, 200)) lines.push(`- ${timeLabel(gap.start)}–${timeLabel(gap.end)}: ${reportText(gap.reason)}.`);
    if (seat.gaps.length > 200) lines.push(`- ${seat.gaps.length - 200} further intervals omitted; see the original review.json for all frame observations.`);
  }
  lines.push('', '## Proctor notes', '', reportText(workflow.proctorNotes || 'None'), '', '## Human sign-off', '',
    `Reviewer: ${reportText(workflow.reviewer || 'Not entered')}`,
    workflow.signedOffAt ? `Signed off: ${workflow.signedOffAt} (local recorded acknowledgement; identity is not verified).` : 'Draft — awaiting human sign-off.',
    '', '## Settings and limitations', '', `Movement settings: ${JSON.stringify(record.settings.movement)}`,
    `Grouping: same seat and direction, overlapping or within ${GROUP_GAP_SECONDS} seconds, with no unavailable observations at the join. Context: up to ${CONTEXT_SECONDS} seconds before and after. Original events are preserved.`,
    'These review aids are unvalidated in representative examination settings. Head movement alone does not establish misconduct.',
    ...record.limitations.map(item => `- ${reportText(item)}`), '');
  return lines.join('\n');
}
