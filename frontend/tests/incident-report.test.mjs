import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import { CameraSession } from '../src/lib/camera-session.ts';
import { imageIncidentReport, liveSessionReport, observationItems, savedIncidentReport } from '../src/lib/incident-report.ts';
import { DEFAULT_MOVEMENT } from '../src/lib/review-contract.ts';
import { emptyWorkflow } from '../src/lib/review-workflow.ts';

const settings = { method: 'head', mirrored: false, tileGrid: 1 };
const detection = (direction, changes = {}) => ({ direction, bbox: [10, 20, 30, 40], ...changes });
const result = (id, time, detections = []) => ({ id, timestamp_seconds: time, counts: {}, result: { width: 100, height: 80, detections, processing_ms: 1 } });

test('image reports list observations without invented times, durations, seats or identities', () => {
  const report = imageIncidentReport('id', 'class.jpg', { result: { width: 100, height: 80,
    detections: [detection('left'), detection('down'), detection('forward'), detection('unknown'), detection('right', { unavailable_reason: 'unreliable' })] } }, 'head', '2026-11-18');
  assert.equal(report.items.length, 2);
  assert.equal(report.items[0].label, 'Detection 1: left');
  assert.ok(report.items.every(item => item.time.includes('no session timestamp')));
  assert.ok(report.summary.includes('cannot establish duration'));
  assert.ok(report.coverage[0].includes('Unknown directions: 2'));
});

test('empty image results produce a coverage limitation rather than a clean-exam conclusion', () => {
  const report = imageIncidentReport('id', 'empty.jpg', { result: { width: 10, height: 10, detections: [] } }, 'baseline', '2026-11-18');
  assert.equal(report.items.length, 0);
  assert.ok(report.coverage[0].includes('does not establish'));
});

test('frame observations remain separate across time and report truncation explicitly', () => {
  const samples = Array.from({ length: 510 }, (_, frame) => ({ frame, time: frame / 10, counts: { left: 1 } }));
  const report = observationItems(samples);
  assert.equal(report.items.length, 500); assert.equal(report.omittedItems, 10);
  assert.equal(report.items[0].time, '00:00.00'); assert.equal(report.items[1].time, '00:00.10');
});

test('saved-seat PDFs preserve human decisions, source timestamps, gaps and sign-off', () => {
  const record = { source: { fps: 1, processed_duration_seconds: 3 }, source_sha256: 'a'.repeat(64),
    settings: { ...settings, movement: { ...DEFAULT_MOVEMENT }, seats: [{ id: 'A', roi: [0, 0, 1, 1] }] },
    events: [{ seat_id: 'A', direction: 'left', start_time: 0, end_time: 1, event_type: 'sustained_movement', observed_at: 1 }],
    frames: [0, 1, 2].map(i => ({ frame_index: i, seats: { A: { direction: i === 2 ? 'unknown' : 'left', reason: null } } })), limitations: [] };
  const workflow = emptyWorkflow(record);
  workflow.items['event-0'] = { status: 'Follow-up needed', notes: 'Check writing context.' };
  workflow.proctorNotes = 'Proctor note'; workflow.reviewer = 'Reviewer'; workflow.signedOffAt = '2026-11-18T00:00:00Z';
  const report = savedIncidentReport({ id: 'id', filename: 'clip.webm', createdAt: '2026-11-18' }, record, workflow);
  assert.equal(report.items[0].status, 'Follow-up needed'); assert.equal(report.items[0].notes, 'Check writing context.');
  assert.ok(report.items[0].time.includes('00:01.00')); assert.ok(report.coverage.some(value => value.includes('1.00 seconds unavailable')));
  assert.equal(report.signedOffAt, workflow.signedOffAt); assert.equal(report.notes, 'Proctor note');
});

test('camera report collection receives only correlated worker responses', async () => {
  const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.kill = () => { queueMicrotask(() => child.emit('close', 0)); return true; };
  const received = [];
  const session = new CameraSession(child, () => {}, { onResult: frame => received.push(frame.id) });
  child.stdout.write('{"ready":true}\n'); await session.ready;
  const pending = session.frame({ id: 1, timestamp_seconds: .1, image: '/9j/' });
  child.stdout.write(JSON.stringify(result(1, .1)) + '\n'); await pending;
  assert.deepEqual(received, [1]);
  const invalid = session.frame({ id: 2, timestamp_seconds: .2, image: '/9j/' });
  child.stdout.write(JSON.stringify(result(3, .2)) + '\n');
  await assert.rejects(invalid); assert.deepEqual(received, [1]); await session.close();
});

const liveRecord = () => ({ schemaVersion: 1, id: 'live-1', state: 'ended', revision: 3, createdAt: '2026-11-18T09:00:00Z', endedAt: '2026-11-18T09:30:00Z',
  settings: { mirrored: false, tileGrid: 1, seats: [{ id: 'seat-3', roi: [0, 0, 1, 1] }], movement: { ...DEFAULT_MOVEMENT }, maxGapAuto: true },
  segments: [{ startedAt: '2026-11-18T09:00:00Z', offsetSeconds: 0, endSeconds: 600 }, { startedAt: '2026-11-18T09:12:00Z', offsetSeconds: 720, endSeconds: null }],
  events: [{ seat_id: 'seat-3', event_type: 'sustained_movement', direction: 'left', start_time: 612, end_time: 615, duration: 3, observed_at: 614, review_required: true, review_label: null, segment: 0 }],
  alerts: [
    { id: 'a1', seatId: 'seat-3', direction: 'left', openedAt: 612, lastAt: 615, eventIndexes: [0], still: 'stills/a1.jpg', stillError: null, mark: null, note: '', markedAt: null },
    { id: 'a2', seatId: 'seat-3', direction: 'right', openedAt: 700, lastAt: 705, eventIndexes: [0], still: null, stillError: 'disk full', mark: 'Checked', note: 'Fine', markedAt: '2026-11-18T09:20:00Z' }],
  coverage: { 'seat-3': { frames: 200, observedFrames: 188, gaps: [{ start: 612, end: 615 }], omittedGaps: 0, unknownSince: 1000 },
    'seat-4': { frames: 0, observedFrames: 0, gaps: [], omittedGaps: 0, unknownSince: null } },
  minutes: [], framesProcessed: 200, stillsSaved: 1, lastTime: 1010 });

test('live session reports list unmarked alerts, resume gaps, stills and the confidential flag', () => {
  const report = liveSessionReport(liveRecord(), '/records/live-1');
  assert.equal(report.mode, 'camera'); assert.equal(report.confidential, true); assert.equal(report.imageRoot, '/records/live-1');
  assert.equal(report.items.length, 2);
  assert.equal(report.items[0].status, 'Not reviewed'); assert.equal(report.items[0].image, 'stills/a1.jpg');
  assert.equal(report.items[0].time, '10:12 – 10:15');
  assert.equal(report.items[1].status, 'Checked'); assert.equal(report.items[1].notes, 'Fine'); assert.equal(report.items[1].image, null);
  assert.ok(report.coverage.includes('Not monitored from 10:00 to 12:00'));
  assert.ok(report.coverage.includes('Seat 3: observed 94% of processed frames; unknown 10:12–10:15; unknown 16:40–16:50 (still unknown at the end)'));
  assert.ok(report.coverage.includes('Seat 4: not observed'));
  assert.ok(report.coverage.some(line => line.includes('1 alert without a saved still')));
  assert.ok(report.metadata.some(([key, value]) => key === 'Method' && value === 'Baseline'));
  assert.ok(report.metadata.some(([key, value]) => key === 'Maximum gap' && value.includes('automatic')));
  assert.ok(report.limitations.some(line => line.includes('do not establish cheating')));
  assert.ok(!/cheating|suspicious|violation|catch/i.test([report.summary, ...report.items.map(i => i.detail + i.label)].join(' ')));
});

test('live session reports skip an unknown tail shorter than two seconds and cap item lists', () => {
  const record = liveRecord();
  record.coverage['seat-3'].unknownSince = 1009; record.coverage['seat-3'].gaps = [];
  const short = liveSessionReport(record, '/r');
  assert.ok(short.coverage.some(line => line.startsWith('Seat 3: observed 94%') && !line.includes('unknown')));
  record.alerts = Array.from({ length: 510 }, (_, i) => ({ ...record.alerts[1], id: `x${i}` }));
  const capped = liveSessionReport(record, '/r');
  assert.equal(capped.items.length, 500); assert.equal(capped.omittedItems, 10);
});

test('a missing still file is listed as unavailable instead of breaking the report', () => {
  const report = liveSessionReport(liveRecord(), '/records/live-1', () => false);
  assert.equal(report.items[0].image, null);
  assert.match(report.items[0].detail, /Still unavailable/);
  assert.doesNotMatch(report.items[1].detail, /Still unavailable/, 'an alert that never had a still keeps its own reason');
  assert.ok(report.coverage.some(line => line.includes('2 alerts without a saved still')));
  const present = liveSessionReport(liveRecord(), '/records/live-1', still => still === 'stills/a1.jpg');
  assert.equal(present.items[0].image, 'stills/a1.jpg');
  assert.doesNotMatch(present.items[0].detail, /Still unavailable/);
});
