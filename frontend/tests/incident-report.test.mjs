import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import { CameraSession } from '../src/lib/camera-session.ts';
import { CameraReportLog, MAX_CAMERA_SAMPLES, cameraIncidentReport, imageIncidentReport, observationItems, savedIncidentReport } from '../src/lib/incident-report.ts';
import { CameraReportCache, CAMERA_REPORT_TTL } from '../src/lib/camera-report-store.ts';
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

test('camera logs retain numeric data only, expose missing captures, and survive Stop for reporting', () => {
  const log = new CameraReportLog('id', settings);
  log.add(result(1, .1, [detection('left')]));
  log.add(result(2, .2, [detection('unknown')]));
  log.add(result(3, 6.5, [detection('right')]));
  log.end(); log.add(result(4, 7, [detection('left')]));
  assert.equal(log.snapshot.frames, 3); assert.equal(log.snapshot.framesWithoutUsableHeads, 1);
  assert.equal(log.snapshot.gaps.length, 1);
  assert.ok(!JSON.stringify(log.snapshot).includes('bbox'));
  assert.ok(!JSON.stringify(log.snapshot).includes('image'));
  const report = cameraIncidentReport(log.snapshot);
  assert.equal(report.items.length, 2); assert.ok(report.limitations.some(value => value.includes('no video') || value.includes('not saved')));
  assert.ok(report.coverage.some(value => value.includes('no intervening processed capture')));
});

test('camera summaries remain bounded while totals and omission counts remain truthful', () => {
  const log = new CameraReportLog('id', settings);
  for (let i = 0; i < MAX_CAMERA_SAMPLES + 2; i++) log.add(result(i, i / 10, [detection('down')]));
  assert.equal(log.snapshot.samples.length, MAX_CAMERA_SAMPLES);
  assert.equal(log.snapshot.omittedSamples, 2); assert.equal(log.snapshot.totals.down, MAX_CAMERA_SAMPLES + 2);
  assert.ok(cameraIncidentReport(log.snapshot).coverage.some(value => value.includes('item list is incomplete')));
});

test('camera report cache expires closed sessions, enforces capacity, and preserves active sessions until eviction', () => {
  const cache = new CameraReportCache(2), first = new CameraReportLog('one', settings), active = new CameraReportLog('two', settings);
  first.snapshot.endedAt = new Date(1000).toISOString();
  cache.add(first, 1000); cache.add(active, 1000);
  assert.equal(cache.get('one', 1000 + CAMERA_REPORT_TTL), undefined);
  assert.equal(cache.get('two', 1000 + CAMERA_REPORT_TTL), active);
  cache.add(new CameraReportLog('three', settings)); cache.add(new CameraReportLog('four', settings));
  assert.equal(cache.get('two'), undefined);
});

test('Stop schedules camera report expiry even without further cache activity', context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const cache = new CameraReportCache(), log = new CameraReportLog('id', settings);
  cache.add(log); cache.finish('id'); assert.ok(log.snapshot.endedAt);
  // Clock supplied to get stays before expiry; removal must come from the timer.
  const stopped = Date.parse(log.snapshot.endedAt);
  context.mock.timers.tick(CAMERA_REPORT_TTL + 1);
  assert.equal(cache.get('id', stopped), undefined);
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
