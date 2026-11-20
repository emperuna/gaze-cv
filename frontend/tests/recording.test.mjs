import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';
import { PassThrough } from 'node:stream';
import { acquireProcessingSlot } from '../src/lib/processing-slot.ts';
import { DEFAULT_MOVEMENT } from '../src/lib/review-contract.ts';
import { getCameraRecord, isActive, startCamera } from '../src/lib/server-camera.ts';
import { loadRecord } from '../src/lib/server-camera-record.ts';
import { saveUpload } from '../src/lib/server-recording-files.ts';
import { cancelRecordingReview, recordingArgs, recordingPreview, recordingVideoResponse, reviewAgain, startRecordingReview, suggestRecording }
  from '../src/lib/server-recording.ts';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64');
const seats = [{ id: 'seat-A', roi: [0, 0, .5, 1] }];
const body = { seats, movement: { ...DEFAULT_MOVEMENT, max_gap: 4 } };
const settings = { mirrored: false, tileGrid: 2, headTurns: true };

function worker() {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killed = false;
  child.kill = () => { if (!child.killed) { child.killed = true; child.stdout.end(); queueMicrotask(() => child.emit('close', null)); } return true; };
  return child;
}
const line = (child, value) => child.stdout.write(`${JSON.stringify(value)}\n`);
const event = (start, end, still) => ({ seat_id: 'seat-A', direction: 'left', start_time: start, end_time: end, observed_at: end,
  duration: end - start, review_required: true, ...(still ? { still: JPEG } : {}) });
const job = () => globalThis.gazeRecordingJob;
const settle = () => new Promise(resolve => setTimeout(resolve, 20));

/** A fake launcher: `suggest` answers at once; `review` hands out a controllable child. */
function launcher() {
  const calls = [];
  const launch = async (mode, input, s) => {
    const child = worker();
    calls.push({ mode, input, settings: s, child });
    if (mode === 'suggest') setImmediate(() => {
      line(child, { seats, sampled_frames: 5, note: '', preview_jpeg: JPEG, duration_seconds: 120, width: 1280, height: 720 });
      child.stdout.end(); child.emit('close', 0);
    });
    return child;
  };
  return { launch, calls, reviews: () => calls.filter(c => c.mode === 'review') };
}

async function withDraft(fn) {
  const base = resolve(process.cwd(), '..', '.work', 'tmp');
  await fs.mkdir(base, { recursive: true });
  const root = await fs.mkdtemp(join(base, 'recording-'));
  try {
    const fake = launcher();
    const opts = { root, launch: fake.launch, saveIntervalMs: 0 };
    const video = new ReadableStream({ start(c) { c.enqueue(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])); c.close(); } });
    const { draftId } = await saveUpload(video, 'Exam.mp4', { root, freeBytes: async () => 1e12 });
    await fn({ root, opts, fake, draftId, dir: join(root, draftId) });
  } finally {
    const running = job();
    if (running) { running.child.kill(); await running.finished; }
    await fs.rm(root, { recursive: true, force: true });
  }
}

test('recording worker arguments follow the camera settings', () => {
  const args = recordingArgs('review', '/v/recording.mp4', { mirrored: true, tileGrid: 3, headTurns: true }, true);
  assert.ok(args[0].endsWith(join('scripts', 'recording_worker.py')));
  assert.deepEqual(args.slice(1), ['review', '--input', '/v/recording.mp4', '--mirrored', '--tile-grid', '3', '--head-turns']);
  assert.deepEqual(recordingArgs('suggest', 'x.mov', { mirrored: false, tileGrid: 2, headTurns: true }, false).slice(1),
    ['suggest', '--input', 'x.mov', '--tile-grid', '2']);
});

test('finding seats writes the preview and remembers the settings', async () => withDraft(async ({ opts, draftId, dir, fake }) => {
  const reply = await suggestRecording(draftId, settings, opts);
  assert.deepEqual(reply, { draftId, seats, sampledFrames: 5, durationSeconds: 120, width: 1280, height: 720 });
  assert.equal(fake.calls[0].input, join(dir, 'recording.mp4'));
  assert.equal((await fs.readFile(await recordingPreview(draftId, opts))).toString('base64'), JPEG);
  const marker = JSON.parse(await fs.readFile(join(dir, 'draft.json'), 'utf8'));
  assert.deepEqual(marker.settings, settings);
  acquireProcessingSlot()();
}));

test('a review turns lines into grouped alerts with stills, ends on done and frees the slot', async () => withDraft(async ({ opts, draftId, dir, fake }) => {
  await suggestRecording(draftId, settings, opts);
  const { recordId } = await startRecordingReview(draftId, body, opts);
  assert.equal(recordId, draftId);
  await assert.rejects(fs.stat(join(dir, 'draft.json')), { code: 'ENOENT' });
  const child = fake.reviews()[0].child;
  const sent = JSON.parse(child.stdin.read().toString());
  assert.equal(sent.movement.max_gap, 1);
  assert.ok(isActive(recordId));
  line(child, { t: 0.1, seats: { 'seat-A': { direction: 'left', reason: null } }, events: [event(0, 2, true)], duration: 120 });
  line(child, { t: 20.1, seats: {}, events: [event(20, 22, true)], duration: 120 });
  line(child, { t: 70.1, seats: {}, events: [event(70, 72, true)], duration: 120 });
  await settle();
  const live = await getCameraRecord(recordId, opts);
  assert.equal(live.state, 'monitoring');
  assert.equal(live.lastTime, 70.1);
  line(child, { done: true, duration: 120 });
  child.stdout.end(); child.emit('close', 0);
  await job()?.finished;
  const record = await loadRecord(recordId, opts);
  assert.equal(record.state, 'ended');
  assert.ok(record.endedAt);
  assert.equal(record.alerts.length, 2);
  assert.deepEqual(record.alerts[0].eventIndexes, [0, 1]);
  assert.deepEqual(record.alerts.map(a => a.still), ['stills/alert-1.jpg', 'stills/alert-2.jpg']);
  assert.ok(!JSON.stringify(record).includes(JPEG));
  assert.equal((await fs.readFile(join(dir, 'stills', 'alert-2.jpg'))).toString('base64'), JPEG);
  assert.deepEqual(record.source, { kind: 'recording', filename: 'Exam.mp4', durationSeconds: 120, video: 'recording.mp4' });
  assert.equal(record.settings.movement.max_gap, 1);
  assert.equal(record.settings.maxGapAuto, false);
  assert.ok(!isActive(recordId));
  acquireProcessingSlot()();
}));

test('max_gap is 1 s whatever the body says, even out of range', async () => withDraft(async ({ opts, draftId, fake }) => {
  await suggestRecording(draftId, settings, opts);
  await startRecordingReview(draftId, { seats, movement: { ...DEFAULT_MOVEMENT, max_gap: 99 } }, opts);
  assert.equal(JSON.parse(fake.reviews()[0].child.stdin.read().toString()).movement.max_gap, 1);
  assert.equal((await loadRecord(draftId, opts)).settings.movement.max_gap, 1);
}));

test('a worker that stops before done leaves the recording interrupted with its alerts', async () => withDraft(async ({ opts, draftId, fake }) => {
  await suggestRecording(draftId, settings, opts);
  await startRecordingReview(draftId, body, opts);
  const child = fake.reviews()[0].child;
  line(child, { t: 5, seats: {}, events: [event(3, 5, true)], duration: 120 });
  await settle();
  child.stdout.end(); child.emit('close', 1);
  await job()?.finished;
  const record = await loadRecord(draftId, opts);
  assert.equal(record.state, 'interrupted');
  assert.ok(record.interruptedAt);
  assert.equal(record.alerts.length, 1);
  assert.equal(record.lastTime, 5);
  acquireProcessingSlot()();
}));

test('a second job while a review runs is refused, and the live camera too', async () => withDraft(async ({ root, opts, draftId, fake }) => {
  await suggestRecording(draftId, settings, opts);
  await startRecordingReview(draftId, body, opts);
  await assert.rejects(reviewAgain(draftId, opts), e => e.status === 409 && /Another analysis is running/.test(e.message));
  const other = await saveUpload(new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1])); c.close(); } }), 'b.mov', { root, freeBytes: async () => 1e12 });
  await assert.rejects(suggestRecording(other.draftId, settings, opts), e => e.status === 409 && /Another analysis is running/.test(e.message));
  await assert.rejects(startCamera(settings, new AbortController().signal, undefined, { root }), e => e.status === 409 && /Another analysis is running/.test(e.message));
  assert.equal(fake.reviews().length, 1);
}));

test('cancel stops the worker, deletes the folder and frees the slot', async () => withDraft(async ({ opts, draftId, dir, fake }) => {
  await suggestRecording(draftId, settings, opts);
  await startRecordingReview(draftId, body, opts);
  const child = fake.reviews()[0].child;
  line(child, { t: 1, seats: {}, events: [event(0, 1, true)], duration: 120 });
  await settle();
  await cancelRecordingReview(draftId, opts);
  assert.ok(child.killed);
  await assert.rejects(fs.stat(dir), { code: 'ENOENT' });
  assert.ok(!isActive(draftId));
  acquireProcessingSlot()();
}));

test('cancel before the review starts discards the upload', async () => withDraft(async ({ opts, draftId, dir }) => {
  await suggestRecording(draftId, settings, opts);
  await cancelRecordingReview(draftId, opts);
  await assert.rejects(fs.stat(dir), { code: 'ENOENT' });
}));

test('review again clears results and restarts on the stored video', async () => withDraft(async ({ opts, draftId, dir, fake }) => {
  await suggestRecording(draftId, settings, opts);
  await startRecordingReview(draftId, body, opts);
  let child = fake.reviews()[0].child;
  line(child, { t: 5, seats: { 'seat-A': { direction: 'left', reason: null } }, events: [event(3, 5, true)], duration: 120 });
  await settle();
  child.stdout.end(); child.emit('close', 1);
  await job()?.finished;
  const before = await loadRecord(draftId, opts);
  assert.equal(before.state, 'interrupted');

  await reviewAgain(draftId, opts);
  assert.equal(fake.reviews().length, 2);
  assert.equal(fake.reviews()[1].input, join(dir, 'recording.mp4'));
  assert.deepEqual(fake.reviews()[1].settings, settings);
  const cleared = await getCameraRecord(draftId, opts);
  assert.equal(cleared.state, 'monitoring');
  assert.deepEqual([cleared.alerts, cleared.events, cleared.minutes, cleared.coverage], [[], [], [], {}]);
  assert.deepEqual([cleared.framesProcessed, cleared.stillsSaved, cleared.lastTime], [0, 0, 0]);
  assert.equal(cleared.revision, before.revision + 1);
  assert.equal(cleared.interruptedAt, null);
  await assert.rejects(fs.stat(join(dir, 'stills')), { code: 'ENOENT' });
  await assert.rejects(reviewAgain(draftId, opts), e => e.status === 409);

  child = fake.reviews()[1].child;
  assert.equal(JSON.parse(child.stdin.read().toString()).movement.max_gap, 1);
  line(child, { done: true, duration: 120 });
  child.stdout.end(); child.emit('close', 0);
  await job()?.finished;
  assert.equal((await loadRecord(draftId, opts)).state, 'ended');
  acquireProcessingSlot()();
}));

test('review again is refused for a live camera record', async () => withDraft(async ({ root, opts }) => {
  const { createRecord } = await import('../src/lib/server-camera-record.ts');
  const live = await createRecord({ mirrored: false, tileGrid: 1, seats, movement: DEFAULT_MOVEMENT, maxGapAuto: true }, { root });
  await assert.rejects(reviewAgain(live.id, opts), e => e.status === 409 && /recording/.test(e.message));
  await assert.rejects(cancelRecordingReview(live.id, opts), e => e.status === 409);
  acquireProcessingSlot()();
}));

test('the video is served whole or by byte range, as a draft and as a record', async () => withDraft(async ({ opts, draftId, fake }) => {
  const whole = await recordingVideoResponse(draftId, null, opts);
  assert.equal(whole.status, 200);
  assert.equal(whole.headers.get('content-type'), 'video/mp4');
  assert.equal(whole.headers.get('accept-ranges'), 'bytes');
  assert.deepEqual([...new Uint8Array(await whole.arrayBuffer())], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  await suggestRecording(draftId, settings, opts);
  await startRecordingReview(draftId, body, opts);
  const part = await recordingVideoResponse(draftId, 'bytes=2-4', opts);
  assert.equal(part.status, 206);
  assert.equal(part.headers.get('content-range'), 'bytes 2-4/10');
  assert.equal(part.headers.get('content-length'), '3');
  assert.deepEqual([...new Uint8Array(await part.arrayBuffer())], [2, 3, 4]);
  const tail = await recordingVideoResponse(draftId, 'bytes=-2', opts);
  assert.deepEqual([...new Uint8Array(await tail.arrayBuffer())], [8, 9]);
  const bad = await recordingVideoResponse(draftId, 'bytes=20-30', opts);
  assert.equal(bad.status, 416);
  assert.equal(bad.headers.get('content-range'), 'bytes */10');
  await assert.rejects(recordingVideoResponse('00000000-0000-4000-8000-000000000000', null, opts), e => e.status === 404);
  await assert.rejects(recordingVideoResponse('../x', null, opts), e => e.status === 400);
  const child = fake.reviews()[0].child;
  line(child, { done: true, duration: 120 }); child.stdout.end(); child.emit('close', 0);
  await job()?.finished;
}));
