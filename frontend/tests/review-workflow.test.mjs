import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MOVEMENT } from '../src/lib/review-contract.ts';
import { emptyWorkflow, groupReviewEvents, seatCoverage, sessionReport, validateWorkflowUpdate } from '../src/lib/review-workflow.ts';
import { cameraWarnings, lowDetailImage } from '../src/lib/camera-health.ts';

const event = (start, end, changes = {}) => ({ seat_id: 'A', event_type: 'sustained_movement', direction: 'left',
  start_time: start, end_time: end, duration: end - start, observed_at: end, review_required: true, review_label: 'For review', ...changes });
const record = (events = []) => ({ schema_version: 1, source: { width: 100, height: 100, fps: 2, processed_duration_seconds: 12, timebase: 'CFR' },
  source_sha256: 'a'.repeat(64), settings: { method: 'head', mirrored: false, tileGrid: 1,
    seats: [{ id: 'A', roi: [0, 0, .5, 1] }, { id: 'B', roi: [.5, 0, 1, 1] }], movement: { ...DEFAULT_MOVEMENT } },
  frames: Array.from({ length: 24 }, (_, i) => ({ frame_index: i, time: i / 2, detections: [], review_flags: [],
    seats: { A: { direction: 'left', reason: null }, B: { direction: 'forward', reason: null } } })),
  events, histories: {}, timing: { processing_fps: 2, scope: 'test fixture' }, pipeline: {}, direction_counts: {}, limitations: ['Synthetic test fixture.'] });
const update = workflow => ({ ...workflow, signedOff: false });

test('overlapping and nearby rules group with bounded context, preserving original events', () => {
  const input = record([event(1, 4), event(2, 5, { event_type: 'repeated_movement' }), event(7, 9), event(11.1, 11.5)]);
  const original = JSON.stringify(input.events);
  const groups = groupReviewEvents(input);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].eventIndexes, [0, 1, 2]);
  assert.equal(groups[0].contextStart, 0); assert.equal(groups[0].contextEnd, 12);
  assert.equal(groups[1].id, 'event-3');
  assert.equal(JSON.stringify(input.events), original);
});

test('groups never cross seats, directions, unknown or missing observations', () => {
  const input = record([event(0, 1), event(2, 3), event(2, 3, { seat_id: 'B' }), event(2, 3, { direction: 'right' })]);
  input.frames[3].seats.A = { direction: 'unknown', reason: 'ambiguous_assignment' };
  assert.equal(groupReviewEvents(input).length, 4);
  delete input.frames[3].seats.A;
  assert.equal(groupReviewEvents(input).length, 4);
  input.frames[3].seats.A = { direction: 'left', reason: null };
  assert.equal(groupReviewEvents(input).length, 3);
});

test('coverage counts frame intervals once and includes the final frame and absent seats', () => {
  const input = record();
  input.frames[0].seats.A = { direction: 'unknown', reason: 'no_detection' };
  input.frames[1].seats.A = { direction: 'unknown', reason: 'no_detection' };
  delete input.frames[23].seats.A;
  const [a, b] = seatCoverage(input);
  assert.equal(a.observedSeconds, 10.5); assert.equal(a.unavailableSeconds, 1.5);
  assert.deepEqual(a.gaps, [{ start: 0, end: 1, reason: 'no detection' }, { start: 11.5, end: 12, reason: 'missing observation' }]);
  assert.equal(a.percent, 87.5); assert.equal(b.percent, 100);
});

test('coverage caps partial final intervals and reports completely unavailable seats', () => {
  const input = record(); input.source.processed_duration_seconds = 1.25;
  input.frames[2].seats.A.direction = 'unknown';
  for (const frame of input.frames) delete frame.seats.B;
  const [a, b] = seatCoverage(input);
  assert.equal(a.unavailableSeconds, .25); assert.equal(a.observedSeconds, 1);
  assert.equal(b.percent, 0); assert.equal(b.gaps[0].end, 1.25);
});

test('workflow rejects invalid statuses, item IDs, oversized notes and unnamed sign-off', () => {
  const input = record([event(1, 3)]), workflow = emptyWorkflow(input);
  assert.equal(workflow.items['event-0'].status, 'Unreviewed');
  for (const change of [{ revision: -1 }, { signedOff: true }, { summary: 'x'.repeat(20001) },
    { items: { 'event-0': { status: 'Cheating', notes: '' } } },
    { items: { 'event-0': { status: 'Reviewed', notes: 'x'.repeat(2001) } } },
    { items: { ...workflow.items, other: { status: 'Reviewed', notes: '' } } }, { items: {} }]) {
    assert.throws(() => validateWorkflowUpdate({ ...update(workflow), ...change }, input));
  }
  assert.equal(validateWorkflowUpdate({ ...update(workflow), signedOff: true, reviewer: 'Proctor' }, input).signedOff, true);
});

test('report includes human decisions, source timestamps, gaps and safely escaped editable text', () => {
  const input = record([event(1, 3)]), workflow = emptyWorkflow(input);
  input.frames[5].seats.A.direction = 'unknown';
  workflow.summary = '<script>unsafe</script>\n# injected';
  workflow.items['event-0'] = { status: 'Reviewed', notes: 'Ordinary writing.' };
  workflow.proctorNotes = 'Observed in person.';
  const report = sessionReport({ id: 'example', filename: 'clip.webm', createdAt: '2026-11-17' }, input, workflow);
  for (const value of ['Reviewed', 'Ordinary writing', 'Observed in person', '00:01.00', '00:02.50', 'unknown direction', input.source_sha256, 'awaiting human sign-off']) assert.ok(report.includes(value));
  assert.ok(!report.includes('<script>')); assert.ok(!report.includes('\n# injected'));
});

test('camera warnings cover stale output, interrupted preview and unreliable visibility, then recover', () => {
  const health = { startedAt: 0, lastResultCaptureAt: null, previewAdvancedAt: 0, muted: false, lowCoverageSince: 0, lowDetailSince: 0 };
  assert.deepEqual(cameraWarnings(health, 4999), []);
  assert.equal(cameraWarnings(health, 5000).length, 2);
  Object.assign(health, { lastResultCaptureAt: 5000, previewAdvancedAt: 5000 });
  assert.equal(cameraWarnings(health, 5000).length, 2);
  health.lastResultCaptureAt = 100; health.muted = true;
  assert.ok(cameraWarnings(health, 6000).some(warning => warning === 'Processing is over 5 s behind.'));
  assert.ok(cameraWarnings(health, 6000).some(warning => warning === 'Connection interrupted: check the cable or app.'));
  Object.assign(health, { lastResultCaptureAt: 6000, previewAdvancedAt: 6000, muted: false, lowCoverageSince: null, lowDetailSince: null });
  assert.deepEqual(cameraWarnings(health, 6000), []);
});

test('image quality warns for dark or flat views and permits a detailed bright image', () => {
  assert.equal(lowDetailImage(new Uint8ClampedArray(32 * 18 * 4)), true);
  assert.equal(lowDetailImage(new Uint8ClampedArray(32 * 18 * 4).fill(240)), true);
  const pixels = new Uint8ClampedArray(32 * 18 * 4);
  for (let i = 0; i < pixels.length; i += 4) { pixels[i] = (i / 4) % 256; pixels[i + 1] = 110; pixels[i + 2] = 180; pixels[i + 3] = 255; }
  assert.equal(lowDetailImage(pixels), false);
});
